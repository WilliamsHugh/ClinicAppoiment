import cors from "cors";
import express, { type RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import type { AppointmentStatus } from "@clinic/shared-types";
import { AppointmentRepository } from "./repository.js";

export const app = express();
export const repository = new AppointmentRepository();
const port = Number(process.env.APPOINTMENT_SERVICE_PORT ?? 3003);
const doctorServiceUrl = process.env.DOCTOR_SERVICE_URL ?? "http://localhost:3002";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3005";
const userServiceUrl = process.env.USER_SERVICE_URL ?? "http://localhost:3001";

const allowedTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

const createAppointmentSchema = z.object({
  patientId: z.string().min(1).optional(),
  doctorId: z.string().min(1),
  specialtyId: z.string().optional(),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  reason: z.string().optional()
});

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Appointment Service API", version: "0.1.0" },
  paths: {
    "/api/v1/appointments": { get: { summary: "List appointments" }, post: { summary: "Create appointment" } },
    "/api/v1/appointments/{id}/confirm": { patch: { summary: "Confirm appointment" } },
    "/api/v1/appointments/{id}/check-in": { patch: { summary: "Check in patient" } },
    "/api/v1/appointments/{id}/complete": { patch: { summary: "Complete appointment" } }
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

async function verifyDoctorSlot(doctorId: string, startAt: string, endAt: string) {
  const response = await fetch(`${doctorServiceUrl}/internal/v1/doctors/verify-slot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doctorId, startAt, endAt })
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { success: true; data: { valid: boolean } };
  return body.success && body.data.valid;
}

async function publishNotificationEvent(eventType: string, appointment: { id: string; patientId: string; scheduledStartAt: string }, eventId: string) {
  try {
    const patientResponse = await fetch(`${userServiceUrl}/internal/v1/patients/${encodeURIComponent(appointment.patientId)}`, { signal: AbortSignal.timeout(4000) });
    if (!patientResponse.ok) throw new Error(`Patient lookup returned ${patientResponse.status}`);
    const patientBody = await patientResponse.json() as { success: boolean; data: { userId: string } };
    if (!patientBody.success || !patientBody.data?.userId) throw new Error("Invalid patient response");
    const payload = { appointmentId: appointment.id, patientId: appointment.patientId, recipientUserId: patientBody.data.userId, scheduledStartAt: appointment.scheduledStartAt };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${notificationServiceUrl}/internal/v1/notifications`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, type: eventType, payload }), signal: AbortSignal.timeout(4000)
        });
        if (response.ok) return;
        throw new Error(`Notification returned ${response.status}`);
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  } catch (error) {
    console.warn(JSON.stringify({ eventId, eventType, error: String(error) }));
  }
}

function currentUserId(req: express.Request) {
  return req.header("x-user-id") ?? "";
}

function currentRole(req: express.Request) {
  return req.header("x-role") ?? "";
}

function requireRoles(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    if (!currentUserId(req)) {
      return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
    }
    if (!roles.includes(currentRole(req))) {
      return res.status(403).json(error("ACCESS_DENIED", "Role is not allowed for this action"));
    }
    next();
  };
}

async function patientIdForUser(userId: string) {
  const response = await fetch(
    `${userServiceUrl}/internal/v1/patients/by-user/${encodeURIComponent(userId)}`,
    { signal: AbortSignal.timeout(4000) },
  );
  if (!response.ok) return null;
  const body = await response.json() as {
    success: boolean;
    data?: { id?: string };
  };
  return body.success && body.data?.id ? body.data.id : null;
}

async function patientCanAccess(req: express.Request, patientId: string) {
  if (currentRole(req) !== "PATIENT") return true;
  const ownPatientId = await patientIdForUser(currentUserId(req));
  return ownPatientId === patientId;
}

function transition(toStatus: AppointmentStatus) {
  return async (req: express.Request, res: express.Response) => {
    const id = String(req.params.id);
    const appointment = repository.findById(id);
    if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    if (!(await patientCanAccess(req, appointment.patientId))) {
      return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
    }
    if (!allowedTransitions[appointment.status].includes(toStatus)) {
      return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Invalid appointment status transition"));
    }
    const updated = repository.transition(id, toStatus, currentUserId(req), req.body?.reason);
    if (updated && ["CONFIRMED", "CANCELLED", "CHECKED_IN"].includes(toStatus)) {
      await publishNotificationEvent(`appointment.${toStatus.toLowerCase()}`, updated, `appointment.${toStatus.toLowerCase()}:${updated.id}`);
    }
    return res.json(success(updated));
  };
}

app.get("/health", (_req, res) => res.json(success({ service: "appointment-service", status: "ok" })));
app.get("/api/v1/appointments", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const ownPatientId = currentRole(req) === "PATIENT"
    ? await patientIdForUser(currentUserId(req))
    : undefined;
  if (currentRole(req) === "PATIENT" && !ownPatientId) {
    return res.status(403).json(error("PATIENT_PROFILE_NOT_FOUND", "Patient profile not found"));
  }
  const items = repository.findAll({
    patientId: ownPatientId ?? (req.query.patientId ? String(req.query.patientId) : undefined),
    doctorId: req.query.doctorId ? String(req.query.doctorId) : undefined,
    status: req.query.status as AppointmentStatus | undefined,
  });
  return res.json(success({ items, page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20), total: items.length }));
});
app.post("/api/v1/appointments", requireRoles("PATIENT", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));

  const patientId = currentRole(req) === "PATIENT"
    ? await patientIdForUser(currentUserId(req))
    : parsed.data.patientId;
  if (!patientId) {
    return res.status(422).json(error("PATIENT_PROFILE_REQUIRED", "Patient profile is required"));
  }

  const idempotencyKey = req.header("idempotency-key") ?? undefined;
  const existing = repository.findByIdempotencyKey(idempotencyKey);
  if (existing) return res.status(200).json(success(existing));

  const slotValid = await verifyDoctorSlot(parsed.data.doctorId, parsed.data.scheduledStartAt, parsed.data.scheduledEndAt);
  if (!slotValid) return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "Khung gio khong thuoc lich lam viec cua bac si"));

  if (repository.hasActiveSlotConflict(parsed.data.doctorId, parsed.data.scheduledStartAt)) {
    return res.status(409).json(error("APPOINTMENT_SLOT_UNAVAILABLE", "Khung gio da duoc dat"));
  }

  const appointment = repository.create({
    ...parsed.data,
    patientId,
    idempotencyKey,
    createdBy: currentUserId(req),
    status: "PENDING"
  });
  await publishNotificationEvent("appointment.created", appointment, `appointment.created:${appointment.id}`);
  return res.status(201).json(success(appointment));
});
app.get("/api/v1/appointments/:id", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const appointment = repository.findById(String(req.params.id));
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  if (!(await patientCanAccess(req, appointment.patientId))) {
    return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
  }
  return res.json(success(appointment));
});
app.patch("/api/v1/appointments/:id/reschedule", requireRoles("PATIENT", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = z.object({ scheduledStartAt: z.string().datetime(), scheduledEndAt: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const appointment = repository.findById(String(req.params.id));
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  if (!(await patientCanAccess(req, appointment.patientId))) {
    return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
  }
  const slotValid = await verifyDoctorSlot(appointment.doctorId, parsed.data.scheduledStartAt, parsed.data.scheduledEndAt);
  if (!slotValid) return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "Khung gio khong hop le"));
  if (repository.hasActiveSlotConflict(appointment.doctorId, parsed.data.scheduledStartAt)) {
    return res.status(409).json(error("APPOINTMENT_SLOT_UNAVAILABLE", "Khung gio da duoc dat"));
  }
  appointment.scheduledStartAt = parsed.data.scheduledStartAt;
  appointment.scheduledEndAt = parsed.data.scheduledEndAt;
  await publishNotificationEvent("appointment.rescheduled", appointment, `appointment.rescheduled:${appointment.id}:${appointment.scheduledStartAt}`);
  return res.json(success(appointment));
});
app.patch("/api/v1/appointments/:id/cancel", requireRoles("PATIENT", "STAFF", "ADMIN"), transition("CANCELLED"));
app.patch("/api/v1/appointments/:id/confirm", requireRoles("STAFF", "ADMIN"), transition("CONFIRMED"));
app.patch("/api/v1/appointments/:id/check-in", requireRoles("STAFF", "ADMIN"), transition("CHECKED_IN"));
app.patch("/api/v1/appointments/:id/complete", requireRoles("DOCTOR", "ADMIN"), transition("COMPLETED"));
app.patch("/api/v1/appointments/:id/no-show", requireRoles("STAFF", "ADMIN"), transition("NO_SHOW"));
app.get("/internal/v1/appointments/:id/verify-for-medical-record", (req, res) => {
  const appointment = repository.findById(String(req.params.id));
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  return res.json(success({ valid: ["CHECKED_IN", "COMPLETED"].includes(appointment.status), appointment }));
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/")) {
    return res.status(404).json(error("ROUTE_NOT_FOUND", "Route not found"));
  }
  next();
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Appointment Service listening on port ${port}`);
  });
}
