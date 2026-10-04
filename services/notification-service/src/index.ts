import { randomUUID, timingSafeEqual } from "node:crypto";
import express, { type Request, type RequestHandler } from "express";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { NotificationRepository } from "./repository.js";
import { openapi } from "./openapi.js";

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
const fail = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({
  success: false, error: { code, message, details: [] }, requestId: res.getHeader("X-Request-Id") });
const actor = (req: Request) => req.header("x-user-id");
function requiredInternalToken(variable: string): string {
  const token = process.env[variable];
  if (!token || Buffer.byteLength(token, "utf8") < 32) throw new Error(`${variable} is not configured`);
  return token;
}
const requireEventToken: RequestHandler = (req, res, next) => {
  const expected = process.env.NOTIFICATION_INTERNAL_API_TOKEN ?? "";
  const received = req.header("X-Internal-Token") ?? "";
  if (Buffer.byteLength(expected, "utf8") < 32 ||
      Buffer.byteLength(expected, "utf8") !== Buffer.byteLength(received, "utf8") ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(received)))
    return void fail(res, 401, "INTERNAL_AUTH_REQUIRED", "Internal credential required");
  next();
};
async function reminderContext(id: string): Promise<{ id: string; patientId: string; status: string; scheduledStartAt: string }> {
  const response = await fetch(`${appointmentUrl}/internal/v1/appointments/${encodeURIComponent(id)}/reminder-context`, {
    headers: { "X-Internal-Token": requiredInternalToken("APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN") },
    redirect: "error", signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw new Error(`Appointment lookup returned ${response.status}`);
  const body = await response.json() as { success?: boolean; data?: { id?: string; patientId?: string;
    status?: string; scheduledStartAt?: string } };
  if (body.success !== true || body.data?.id !== id || !body.data.patientId ||
      !body.data.status || !body.data.scheduledStartAt || !Number.isFinite(Date.parse(body.data.scheduledStartAt)))
    throw new Error("Invalid appointment response");
  return body.data as { id: string; patientId: string; status: string; scheduledStartAt: string };
}

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
  for (const reminder of await repository.claimDueReminders()) {
    const scheduledStartAt = reminder.scheduledStartAt.toISOString();
    try {
      const appointment = await reminderContext(reminder.appointmentId);
      if (appointment.status !== "CONFIRMED" || Date.parse(appointment.scheduledStartAt) !== reminder.scheduledStartAt.getTime() || appointment.patientId !== reminder.patientId) {
        await repository.cancelReminder(reminder.appointmentId, scheduledStartAt);
        continue;
      }
      const [title, content] = message("appointment.reminder");
      await repository.deliverClaimedReminder(reminder, title, content);
    } catch (error) {
      console.warn(JSON.stringify({ appointmentId: reminder.appointmentId, error: String(error) }));
      await repository.deferReminder(reminder.appointmentId, scheduledStartAt);
    }
  }
}

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT id FROM notification_service.notifications LIMIT 0");
    return res.json(ok({ service: "notification-service", status: "ok", reminders: await repository.reminderStatusCounts() })); }
  catch { return fail(res, 503, "DATABASE_UNAVAILABLE", "Database is unavailable"); }
});
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

app.post("/internal/v1/notifications", requireEventToken, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid event");
  const { eventId, type, payload } = parsed.data;
  if (await repository.hasProcessedEvent(eventId)) return res.json(ok({ dedup: true, eventId }));
  let effect: import("./repository.js").EventEffect = { kind: "none" };
  let stale = false;
  if (type === "appointment.created" || type === "appointment.confirmed" || type === "appointment.rescheduled" ||
      type === "appointment.cancelled" || type === "appointment.checked_in") {
    if (!payload.appointmentId || !payload.patientId ||
        ((type === "appointment.confirmed" || type === "appointment.rescheduled") && !payload.scheduledStartAt))
      return fail(res, 400, "VALIDATION_ERROR", "Invalid appointment event");
    const current = await reminderContext(payload.appointmentId);
    stale = current.patientId !== payload.patientId ||
      (type === "appointment.created" && current.status !== "PENDING") ||
      (type === "appointment.cancelled" && current.status !== "CANCELLED") ||
      (type === "appointment.checked_in" && current.status !== "CHECKED_IN") ||
      ((type === "appointment.confirmed" || type === "appointment.rescheduled") &&
        (current.status !== "CONFIRMED" || Date.parse(current.scheduledStartAt) !== Date.parse(payload.scheduledStartAt!)));
    if (!stale && (type === "appointment.cancelled" || type === "appointment.checked_in"))
      effect = { kind: "cancel", appointmentId: payload.appointmentId };
    else if (!stale && payload.scheduledStartAt)
      effect = { kind: "schedule", reminder: { appointmentId: payload.appointmentId,
        patientId: payload.patientId, recipientUserId: payload.recipientUserId,
        scheduledStartAt: payload.scheduledStartAt } };
  }
  const [title, content] = message(type);
  const { created, notification } = await repository.applyEvent(eventId, stale ? null : {
    recipientUserId: payload.recipientUserId, type, title, message: content,
    payload: { appointmentId: payload.appointmentId, recordId: payload.recordId }
  }, effect);
  return res.status(created ? 201 : 200).json(ok(created ? (notification ?? { ignored: true, eventId }) : { dedup: true, eventId }));
});
app.post("/api/v1/notifications", (_req, res) => fail(res, 403, "ACCESS_DENIED", "Notifications are created by internal events"));
app.post("/internal/v1/notifications/:id/retry", requireEventToken, async (req, res) => {
  const delivery = await repository.retryDelivery(String(req.params.id));
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
