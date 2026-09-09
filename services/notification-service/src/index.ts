import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { NotificationRepository } from "./repository.js";

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
  type: z.string().min(1),
  payload: z.unknown()
});

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Notification Service API", version: "0.1.0" },
  paths: {
    "/api/v1/notifications": { get: { summary: "List notifications" } },
    "/api/v1/notifications/{id}/read": { patch: { summary: "Mark notification as read" } },
    "/internal/v1/notifications": { post: { summary: "Create notification from internal event" } }
  }
};

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

function success<T>(data: T) {
  return { success: true, data };
}

function error(code: string, message: string, details: unknown[] = []) {
  return { success: false, error: { code, message, details } };
}

function notificationFromEvent(type: string, payload: unknown) {
  if (type === "appointment.created") {
    return {
      recipientUserId: "user-patient-1",
      type,
      title: "Lich hen da duoc tao",
      message: "Phong kham da ghi nhan yeu cau dat lich cua ban",
      payload
    };
  }
  if (type === "medical-record.created") {
    return {
      recipientUserId: "user-patient-1",
      type,
      title: "Ket qua kham da duoc cap nhat",
      message: "Ban co the xem ket qua kham trong lich su kham",
      payload
    };
  }
  return {
    recipientUserId: "user-patient-1",
    type,
    title: "Thong bao phong kham",
    message: "Co cap nhat moi tu he thong phong kham",
    payload
  };
}

app.get("/health", (_req, res) => res.json(success({ service: "notification-service", status: "ok" })));
app.get("/api/v1/notifications", (req, res) => {
  const items = repository.findAll(req.query.recipientUserId ? String(req.query.recipientUserId) : undefined);
  return res.json(success({ items, page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20), total: items.length }));
});
app.get("/api/v1/notifications/:id", (req, res) => {
  const notification = repository.findById(req.params.id);
  if (!notification) return res.status(404).json(error("NOTIFICATION_NOT_FOUND", "Notification not found"));
  return res.json(success(notification));
});
app.patch("/api/v1/notifications/:id/read", (req, res) => {
  const notification = repository.markRead(req.params.id);
  if (!notification) return res.status(404).json(error("NOTIFICATION_NOT_FOUND", "Notification not found"));
  return res.json(success(notification));
});
app.post("/internal/v1/notifications", (req, res) => {
  const parsed = internalEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const notification = repository.create(notificationFromEvent(parsed.data.type, parsed.data.payload));
  console.log("Simulated notification delivery", notification);
  return res.status(201).json(success(notification));
});
app.post("/internal/v1/notifications/events/appointment-created", (req, res) => {
  const notification = repository.create(notificationFromEvent("appointment.created", req.body));
  return res.status(201).json(success(notification));
});
app.post("/internal/v1/notifications/events/appointment-updated", (req, res) => {
  const notification = repository.create(notificationFromEvent("appointment.updated", req.body));
  return res.status(201).json(success(notification));
});
app.post("/internal/v1/notifications/events/medical-record-created", (req, res) => {
  const notification = repository.create(notificationFromEvent("medical-record.created", req.body));
  return res.status(201).json(success(notification));
});
app.post("/api/v1/notifications", (req, res) => {
  const parsed = createNotificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.status(201).json(success(repository.create(parsed.data)));
});

app.listen(port, () => {
  console.log(`Notification Service listening on port ${port}`);
});
