import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { NotificationRepository } from "./repository.js";

// NOTIFY-001..004: schema notification_service, event dedup, delivery history, retry có giới hạn

const app = express();
const repository = new NotificationRepository();
const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 3005);

const createNotificationSchema = z.object({
  recipientUserId: z.string().default("user-patient-1"),
  type: z.string().min(1),
  title: z.string().default("Thong bao phong kham"),
  message: z.string().default("Co cap nhat moi tu he thong phong kham"),
  payload: z.unknown().optional()
});

const internalEventSchema = z.object({
  eventId: z.string().min(8, "eventId required for dedup"),
  type: z.string().min(1),
  payload: z.unknown()
});

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Notification Service API", version: "1.0.0" },
  paths: {
    "/health": { get: { summary: "Health check" } },
    "/api/v1/notifications": { get: { summary: "List notifications (owner only, pagination)" } },
    "/api/v1/notifications/{id}": { get: { summary: "Get notification by id (owner only)" } },
    "/api/v1/notifications/{id}/read": { patch: { summary: "Mark notification as read (owner only)" } },
    "/internal/v1/notifications": { post: { summary: "Create notification from internal event (dedup by eventId)" } }
  }
};

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  const requestId = req.header("x-request-id") ?? randomUUID();
  (req as unknown as Record<string, unknown>)["requestId"] = requestId;
  _res.setHeader("X-Request-Id", requestId);
  // NOTIFY-003: không ghi nội dung y tế nhạy cảm vào log – chỉ log type/eventId
  const safeBody = req.path.includes("/internal") ? `{type:${(req.body as { type?: string })?.type ?? "?"}, eventId:${(req.body as { eventId?: string })?.eventId ?? "?"}}` : req.method;
  console.log(JSON.stringify({ requestId, method: req.method, path: req.originalUrl, body: safeBody }));
  next();
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

function success<T>(data: T, requestId?: string) {
  return requestId ? { success: true, data, requestId } : { success: true, data };
}

function error(code: string, message: string, details: unknown[] = [], requestId?: string) {
  return requestId ? { success: false, error: { code, message, details }, requestId } : { success: false, error: { code, message, details } };
}

function getRequestId(req: express.Request): string {
  return ((req as unknown as Record<string, unknown>)["requestId"] as string) ?? randomUUID();
}

function currentUserId(req: express.Request) {
  return req.header("x-user-id") ?? req.header("X-User-Id") ?? "user-patient-1";
}

function parsePagination(req: express.Request) {
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 20);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 20;
  return { page, limit };
}

function notificationFromEvent(type: string, payload: unknown): { recipientUserId: string; type: string; title: string; message: string; payload: unknown } {
  // NOTIFY-002: xử lý các event types tối thiểu
  const p = payload as Record<string, unknown> | null;
  // Try to infer recipient from payload if available
  const recipient = (p?.["patientId"] as string) ?? (p?.["recipientUserId"] as string) ?? "user-patient-1";

  if (type === "appointment.created") {
    return {
      recipientUserId: recipient,
      type,
      title: "Lich hen da duoc tao",
      message: "Phong kham da ghi nhan yeu cau dat lich cua ban",
      payload
    };
  }
  if (type === "appointment.rescheduled") {
    return { recipientUserId: recipient, type, title: "Lich hen da duoc doi", message: "Lich hen cua ban da duoc cap nhat gio kham", payload };
  }
  if (type === "appointment.cancelled") {
    return { recipientUserId: recipient, type, title: "Lich hen da bi huy", message: "Lich hen cua ban da bi huy", payload };
  }
  if (type === "appointment.confirmed") {
    return { recipientUserId: recipient, type, title: "Lich hen da duoc xac nhan", message: "Lich hen cua ban da duoc xac nhan", payload };
  }
  if (type === "appointment.checked_in") {
    return { recipientUserId: recipient, type, title: "Ban da check-in", message: "Ban da check-in thanh cong, vui long cho bac si", payload };
  }
  if (type === "medical-record.created") {
    return {
      recipientUserId: recipient,
      type,
      title: "Ket qua kham da duoc cap nhat",
      message: "Ban co the xem ket qua kham trong lich su kham",
      payload
    };
  }
  return {
    recipientUserId: recipient,
    type,
    title: "Thong bao phong kham",
    message: "Co cap nhat moi tu he thong phong kham",
    payload
  };
}

app.get("/health", (req, res) => res.json(success({ service: "notification-service", status: "ok" }, getRequestId(req))));

// NOTIFY-005: danh sách thông báo, chỉ của actor, pagination, filter status
app.get("/api/v1/notifications", (req, res) => {
  const requestId = getRequestId(req);
  const actorId = currentUserId(req);
  const { page, limit } = parsePagination(req);
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;

  // Enforce ownership: only actor's notifications
  const all = repository.findAll({ recipientUserId: actorId, status });
  const start = (page - 1) * limit;
  const paged = all.slice(start, start + limit);
  return res.json(success({ items: paged, page, limit, total: all.length }, requestId));
});

app.get("/api/v1/notifications/:id", (req, res) => {
  const requestId = getRequestId(req);
  const actorId = currentUserId(req);
  const notification = repository.findById(req.params.id);
  if (!notification) return res.status(404).json(error("NOTIFICATION_NOT_FOUND", "Notification not found", [], requestId));
  if (notification.recipientUserId !== actorId) return res.status(403).json(error("ACCESS_DENIED", "Not notification owner", [], requestId));
  return res.json(success(notification, requestId));
});

// NOTIFY-005: đánh dấu đã đọc, chỉ người nhận
app.patch("/api/v1/notifications/:id/read", (req, res) => {
  const requestId = getRequestId(req);
  const actorId = currentUserId(req);
  const notification = repository.markRead(req.params.id, actorId);
  if (!notification) {
    const exists = repository.findById(req.params.id);
    if (!exists) return res.status(404).json(error("NOTIFICATION_NOT_FOUND", "Notification not found", [], requestId));
    return res.status(403).json(error("ACCESS_DENIED", "Not notification owner", [], requestId));
  }
  return res.json(success(notification, requestId));
});

// NOTIFY-002: internal event với dedup theo eventId, NOTIFY-003: lưu lịch sử gửi, NOTIFY-004: retry có giới hạn
app.post("/internal/v1/notifications", (req, res) => {
  const requestId = getRequestId(req);
  const parsed = internalEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues, requestId));

  // Dedup
  if (repository.hasEvent(parsed.data.eventId)) {
    // Return 200 for duplicate (idempotent)
    return res.status(200).json(success({ dedup: true, eventId: parsed.data.eventId }, requestId));
  }

  // NOTIFY-004: kiểm tra lịch còn hiệu lực, tránh nhắc lịch đã hủy/đổi – cơ bản: nếu payload chứa status CANCELLED/NO_SHOW thì vẫn tạo nhưng đánh dấu?
  const payload = parsed.data.payload as Record<string, unknown> | null;
  const status = payload?.["status"] as string | undefined;
  if (status === "CANCELLED" && parsed.data.type === "appointment.reminder") {
    return res.status(200).json(success({ skipped: "appointment cancelled", eventId: parsed.data.eventId }, requestId));
  }

  const notification = repository.create({ ...notificationFromEvent(parsed.data.type, parsed.data.payload), eventId: parsed.data.eventId });
  // NOTIFY-003: simulates delivery via database/log without sensitive content
  console.log(JSON.stringify({ requestId, msg: "Simulated notification delivery", notificationId: notification.id, type: notification.type, recipient: notification.recipientUserId }));

  return res.status(201).json(success(notification, requestId));
});

// Legacy internal events: map to new dedup endpoint (keep for compatibility, but generate eventId)
app.post("/internal/v1/notifications/events/appointment-created", (req, res) => {
  const requestId = getRequestId(req);
  const eventId = `appointment.created:${randomUUID()}`;
  const notification = repository.create({ ...notificationFromEvent("appointment.created", req.body), eventId });
  return res.status(201).json(success(notification, requestId));
});
app.post("/internal/v1/notifications/events/appointment-updated", (req, res) => {
  const requestId = getRequestId(req);
  const eventId = `appointment.updated:${randomUUID()}`;
  const notification = repository.create({ ...notificationFromEvent("appointment.updated", req.body), eventId });
  return res.status(201).json(success(notification, requestId));
});
app.post("/internal/v1/notifications/events/medical-record-created", (req, res) => {
  const requestId = getRequestId(req);
  const eventId = `medical-record.created:${randomUUID()}`;
  const notification = repository.create({ ...notificationFromEvent("medical-record.created", req.body), eventId });
  return res.status(201).json(success(notification, requestId));
});

// Block direct client creation via public route per contract: should not allow POST /api/v1/notifications for normal users
// Keep but return 403 to enforce contract (gap noted in api-contract.md)
app.post("/api/v1/notifications", (req, res) => {
  const requestId = getRequestId(req);
  // Allow only ADMIN for manual creation (optional), otherwise block
  const role = (req.header("x-role") ?? req.header("X-Role") ?? "").toUpperCase();
  if (role !== "ADMIN") {
    return res.status(403).json(error("ACCESS_DENIED", "Public client cannot create notifications directly. Use internal event.", [], requestId));
  }
  const parsed = createNotificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues, requestId));
  return res.status(201).json(success(repository.create(parsed.data), requestId));
});

// Retry endpoint (internal, limited retries)
app.post("/internal/v1/notifications/:id/retry", (req, res) => {
  const requestId = getRequestId(req);
  const result = repository.retryDelivery(req.params.id);
  if (!result) return res.status(404).json(error("NOTIFICATION_NOT_FOUND", "Notification not found or retry limit exceeded", [], requestId));
  return res.json(success(result, requestId));
});

app.use((_req, res) => res.status(404).json(error("ROUTE_NOT_FOUND", "Route not found")));

app.listen(port, () => {
  console.log(`Notification Service listening on port ${port}`);
});
