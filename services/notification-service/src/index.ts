import { randomUUID } from "node:crypto";
import express, { type Request } from "express";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { NotificationRepository } from "./repository.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required by Notification Service");
const databaseSsl = process.env.DATABASE_SSL === "true";
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized } : undefined
});
const repository = new NotificationRepository(pool);
const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 3005);
const appointmentUrl = process.env.APPOINTMENT_SERVICE_URL ?? "http://localhost:3003";
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(["UNREAD", "READ", "FAILED"]).optional() });
const eventSchema = z.object({ eventId: z.string().min(1), type: z.enum(["appointment.created", "appointment.confirmed", "appointment.rescheduled", "appointment.cancelled", "appointment.checked_in", "medical-record.created", "medical-record.updated"]), payload: z.object({ recipientUserId: z.string().uuid(), patientId: z.string().uuid().optional(), appointmentId: z.string().uuid().optional(), recordId: z.string().uuid().optional(), scheduledStartAt: z.string().datetime().optional() }) });

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  const requestId = req.header("x-request-id") ?? randomUUID();
  res.setHeader("X-Request-Id", requestId);
  console.log(JSON.stringify({ requestId, method: req.method, path: req.path }));
  next();
});
const ok = (data: unknown) => ({ success: true, data });
const fail = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ success: false, error: { code, message, details: [] } });
const actor = (req: Request) => req.header("x-user-id");

function message(type: string) {
  switch (type) {
    case "appointment.created": return ["Yêu cầu đặt lịch đã được ghi nhận", "Phòng khám sẽ xác nhận lịch hẹn của bạn."];
    case "appointment.confirmed": return ["Lịch hẹn đã được xác nhận", "Vui lòng đến phòng khám đúng giờ."];
    case "appointment.rescheduled": return ["Lịch hẹn đã được đổi", "Vui lòng xem thời gian khám mới."];
    case "appointment.cancelled": return ["Lịch hẹn đã được hủy", "Lịch hẹn của bạn không còn hiệu lực."];
    case "appointment.checked_in": return ["Đã check-in", "Vui lòng chờ bác sĩ gọi khám."];
    case "appointment.reminder": return ["Nhắc lịch khám", "Bạn có lịch khám sắp tới."];
    default: return ["Kết quả khám đã được cập nhật", "Bạn có thể xem kết quả trong lịch sử khám."];
  }
}

export async function dispatchReminders() {
  for (const reminder of await repository.dueReminders()) {
    try {
      const response = await fetch(`${appointmentUrl}/api/v1/appointments/${encodeURIComponent(reminder.appointmentId)}`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`Appointment lookup returned ${response.status}`);
      const body = await response.json() as { success: boolean; data: { status: string; scheduledStartAt: string; patientId: string } };
      const appointment = body.data;
      if (!body.success || !appointment) throw new Error("Invalid appointment response");
      const scheduledStartAt = reminder.scheduledStartAt.toISOString();
      if (appointment.status !== "CONFIRMED" || Date.parse(appointment.scheduledStartAt) !== reminder.scheduledStartAt.getTime() || appointment.patientId !== reminder.patientId) {
        await repository.cancelReminder(reminder.appointmentId);
        continue;
      }
      const [title, content] = message("appointment.reminder");
      await repository.createEvent(`reminder:${reminder.appointmentId}:${scheduledStartAt}`, {
        recipientUserId: reminder.recipientUserId, type: "appointment.reminder", title, message: content,
        payload: { appointmentId: reminder.appointmentId }
      });
      await repository.markReminderSent(reminder.appointmentId);
    } catch (error) {
      console.warn(JSON.stringify({ appointmentId: reminder.appointmentId, error: String(error) }));
      await repository.deferReminder(reminder.appointmentId);
    }
  }
}

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); return res.json(ok({ service: "notification-service", status: "ok" })); }
  catch { return fail(res, 503, "DATABASE_UNAVAILABLE", "Database is unavailable"); }
});
const openapi = { openapi: "3.0.3", info: { title: "Notification Service", version: "1.0.0" }, paths: {
  "/api/v1/notifications": { get: { summary: "List own notifications" } },
  "/api/v1/notifications/{id}": { get: { summary: "Get own notification" } },
  "/api/v1/notifications/{id}/read": { patch: { summary: "Mark own notification read" } },
  "/internal/v1/notifications": { post: { summary: "Receive idempotent event" } }
} };
app.get("/openapi.json", (_req, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

app.get("/api/v1/notifications", async (req, res) => {
  const userId = actor(req);
  if (!userId) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  const parsed = paging.safeParse(req.query);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid pagination");
  return res.json(ok(await repository.findAll(userId, parsed.data.page, parsed.data.limit, parsed.data.status)));
});
app.get("/api/v1/notifications/:id", async (req, res) => {
  const userId = actor(req);
  if (!userId) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  const notification = await repository.findById(req.params.id);
  if (!notification) return fail(res, 404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  return notification.recipientUserId === userId ? res.json(ok(notification)) : fail(res, 403, "ACCESS_DENIED", "Access denied");
});
app.patch("/api/v1/notifications/:id/read", async (req, res) => {
  const userId = actor(req);
  if (!userId) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  const notification = await repository.markRead(req.params.id, userId);
  if (notification) return res.json(ok(notification));
  return (await repository.findById(req.params.id)) ? fail(res, 403, "ACCESS_DENIED", "Access denied") : fail(res, 404, "NOTIFICATION_NOT_FOUND", "Notification not found");
});

app.post("/internal/v1/notifications", async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid event");
  const { eventId, type, payload } = parsed.data;
  if (type === "appointment.cancelled" && payload.appointmentId) await repository.cancelReminder(payload.appointmentId);
  if ((type === "appointment.confirmed" || type === "appointment.rescheduled") && payload.appointmentId && payload.patientId && payload.scheduledStartAt) {
    await repository.scheduleReminder({ appointmentId: payload.appointmentId, patientId: payload.patientId, recipientUserId: payload.recipientUserId, scheduledStartAt: payload.scheduledStartAt });
  }
  const [title, content] = message(type);
  const { created, notification } = await repository.createEvent(eventId, {
    recipientUserId: payload.recipientUserId, type, title, message: content,
    payload: { appointmentId: payload.appointmentId, recordId: payload.recordId }
  });
  return res.status(created ? 201 : 200).json(ok(created ? notification : { dedup: true, eventId }));
});
app.post("/api/v1/notifications", (_req, res) => fail(res, 403, "ACCESS_DENIED", "Notifications are created by internal events"));
app.post("/internal/v1/notifications/:id/retry", async (req, res) => {
  const delivery = await repository.retryDelivery(req.params.id);
  return delivery ? res.json(ok(delivery)) : fail(res, 409, "NOTIFICATION_RETRY_UNAVAILABLE", "No failed delivery can be retried");
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/")) return fail(res, 404, "ROUTE_NOT_FOUND", "Route not found");
  next();
});
app.use((error: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
  console.error(JSON.stringify({ message: "Notification request failed", error: String(error) }));
  return fail(res, 503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
});

if (process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => { void dispatchReminders().catch((error) => console.error(JSON.stringify({ message: "Reminder worker failed", error: String(error) }))); }, 60_000);
  timer.unref();
  app.listen(port, () => console.log(`Notification Service listening on port ${port}`));
}
