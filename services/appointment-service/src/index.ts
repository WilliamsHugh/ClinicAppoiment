import cors from "cors";
import express, { type RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import type { AppointmentStatus } from "@clinic/shared-types";
import { AppointmentRepository } from "./repository.js";
import { createAppointmentPool, PostgresAppointmentRepository, SlotConflictError,
  IdempotencyMismatchError, RescheduleStateError, ConcurrentChangeError,
  type BookingFingerprint } from "./postgres-repository.js";

export const app = express();
export const repository = new AppointmentRepository();
const store = process.env.NODE_ENV === "test" ? repository : new PostgresAppointmentRepository(createAppointmentPool());
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
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid(),
  specialtyId: z.string().uuid().optional(),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  reason: z.string().optional()
});
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().optional(), doctorId: z.string().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional()
});
const rescheduleSchema = z.object({ scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(), reason: z.string().optional() });

function validInterval(start: string, end: string) { return Date.parse(start) < Date.parse(end); }
function normalized(value: string) { return new Date(value).toISOString(); }
function bookingError(res: express.Response, caught: unknown) {
  if (caught instanceof SlotConflictError) return res.status(409).json(error("APPOINTMENT_SLOT_UNAVAILABLE", "Khung gio da duoc dat"));
  if (caught instanceof IdempotencyMismatchError) return res.status(409).json(error("IDEMPOTENCY_KEY_REUSED", "Idempotency key was used for another request"));
  if (caught instanceof RescheduleStateError || caught instanceof ConcurrentChangeError)
    return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Appointment state changed"));
  console.error(caught);
  return res.status(503).json(error("APPOINTMENT_STORAGE_UNAVAILABLE", "Appointment storage is unavailable"));
}
const occupiedSlotsQuerySchema = z.object({
  doctorId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime().optional()
});

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Appointment Service API", version: "0.1.0" },
  paths: {
    "/api/v1/appointments": { get: { summary: "List appointments" }, post: { summary: "Create appointment" } },
    "/api/v1/appointments/{id}/confirm": { patch: { summary: "Confirm appointment" } },
    "/api/v1/appointments/{id}/check-in": { patch: { summary: "Check in patient" } },
    "/api/v1/appointments/{id}/complete": { patch: { summary: "Complete appointment" } },
    "/internal/v1/appointments/occupied-slots": { get: { summary: "List active occupied doctor slots (internal)" } }
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

async function verifyDoctorSlot(doctorId: string, startAt: string, endAt: string,
  requestId?: string): Promise<boolean | null> {
  const internalToken = process.env.DOCTOR_INTERNAL_API_TOKEN;
  if (!internalToken || Buffer.byteLength(internalToken, "utf8") < 32) return null;
  const forwardedRequestId = requestId && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : undefined;
  try {
    const response = await fetch(`${doctorServiceUrl}/internal/v1/doctors/verify-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": internalToken,
        ...(forwardedRequestId ? { "X-Request-Id": forwardedRequestId } : {}) },
      body: JSON.stringify({ doctorId, startAt, endAt }),
      redirect: "error",
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const envelope = body as { success?: unknown; data?: unknown };
    if (envelope.success !== true || typeof envelope.data !== "object" || envelope.data === null) return null;
    const data = envelope.data as Record<string, unknown>;
    return typeof data.valid === "boolean" ? data.valid : null;
  } catch {
    return null;
  }
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

async function patientExists(patientId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${userServiceUrl}/internal/v1/patients/${encodeURIComponent(patientId)}`,
      { signal: AbortSignal.timeout(4000) });
    if (response.status === 404) return false;
    if (!response.ok) return null;
    const body = await response.json() as { success?: boolean; data?: { id?: string } };
    return body.success === true && body.data?.id === patientId;
  } catch { return null; }
}

async function patientCanAccess(req: express.Request, patientId: string) {
  if (currentRole(req) !== "PATIENT") return true;
  const ownPatientId = await patientIdForUser(currentUserId(req));
  return ownPatientId === patientId;
}

function transition(toStatus: AppointmentStatus) {
  return async (req: express.Request, res: express.Response) => {
    const id = String(req.params.id);
    const appointment = await store.findById(id);
    if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    if (!(await patientCanAccess(req, appointment.patientId))) {
      return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
    }
    if (!allowedTransitions[appointment.status].includes(toStatus)) {
      return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Invalid appointment status transition"));
    }
    let updated;
    try { updated = await store.transition(id, toStatus, currentUserId(req), req.body?.reason, appointment.status); }
    catch (caught) { return bookingError(res, caught); }
    if (updated && ["CONFIRMED", "CANCELLED", "CHECKED_IN"].includes(toStatus)) {
      await publishNotificationEvent(`appointment.${toStatus.toLowerCase()}`, updated, `appointment.${toStatus.toLowerCase()}:${updated.id}`);
    }
    return res.json(success(updated));
  };
}

app.get("/health", async (_req, res) => {
  try {
    if (store instanceof PostgresAppointmentRepository) await store.health();
    return res.json(success({ service: "appointment-service", status: "ok" }));
  } catch { return res.status(503).json(error("APPOINTMENT_STORAGE_UNAVAILABLE", "Appointment database is unavailable")); }
});
app.get("/api/v1/appointments", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success || (parsed.data.from && parsed.data.to && !validInterval(parsed.data.from, parsed.data.to)))
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid list query", parsed.success ? [] : parsed.error.issues));
  const ownPatientId = currentRole(req) === "PATIENT"
    ? await patientIdForUser(currentUserId(req))
    : undefined;
  if (currentRole(req) === "PATIENT" && !ownPatientId) {
    return res.status(403).json(error("PATIENT_PROFILE_NOT_FOUND", "Patient profile not found"));
  }
  try {
    const { page, limit, ...filters } = parsed.data;
    return res.json(success(await store.list({ ...filters, patientId: ownPatientId ?? filters.patientId }, page, limit)));
  } catch (caught) { return bookingError(res, caught); }
});
app.post("/api/v1/appointments", requireRoles("PATIENT", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  if (!validInterval(parsed.data.scheduledStartAt, parsed.data.scheduledEndAt))
    return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "End time must follow start time"));
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 255)
    return res.status(400).json(error("VALIDATION_ERROR", "Idempotency-Key is required and must be at most 255 characters"));

  const patientId = currentRole(req) === "PATIENT"
    ? await patientIdForUser(currentUserId(req))
    : parsed.data.patientId;
  if (!patientId) {
    return res.status(422).json(error("PATIENT_PROFILE_REQUIRED", "Patient profile is required"));
  }
  if (currentRole(req) !== "PATIENT") {
    const exists = await patientExists(patientId);
    if (exists === null) return res.status(503).json(error("PATIENT_VERIFICATION_UNAVAILABLE", "Patient verification is unavailable"));
    if (!exists) return res.status(422).json(error("PATIENT_PROFILE_NOT_FOUND", "Patient profile not found"));
  }

  const fingerprint: BookingFingerprint = {
    patientId, doctorId: parsed.data.doctorId, specialtyId: parsed.data.specialtyId ?? null,
    scheduledStartAt: normalized(parsed.data.scheduledStartAt),
    scheduledEndAt: normalized(parsed.data.scheduledEndAt), reason: parsed.data.reason ?? null
  };
  try {
    const existing = await store.findReplay(currentUserId(req), idempotencyKey, fingerprint);
    if (existing) return res.status(200).json(success(existing));
  } catch (caught) { return bookingError(res, caught); }

  const slotValid = await verifyDoctorSlot(parsed.data.doctorId, parsed.data.scheduledStartAt,
    parsed.data.scheduledEndAt, req.header("X-Request-Id") ?? undefined);
  if (slotValid === null) return res.status(503).json(error("DOCTOR_VERIFICATION_UNAVAILABLE", "Doctor slot verification is unavailable"));
  if (!slotValid) return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "Khung gio khong thuoc lich lam viec cua bac si"));

  try {
    const result = await store.createBooking({ ...fingerprint, createdBy: currentUserId(req) },
      idempotencyKey, fingerprint);
    if (result.eventId) await publishNotificationEvent("appointment.created", result.appointment, result.eventId);
    return res.status(result.replayed ? 200 : 201).json(success(result.appointment));
  } catch (caught) { return bookingError(res, caught); }
});
app.get("/api/v1/appointments/:id", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const appointment = await store.findById(String(req.params.id));
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  if (!(await patientCanAccess(req, appointment.patientId))) {
    return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
  }
  return res.json(success(appointment));
});
app.patch("/api/v1/appointments/:id/reschedule", requireRoles("PATIENT", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  if (!validInterval(parsed.data.scheduledStartAt, parsed.data.scheduledEndAt))
    return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "End time must follow start time"));
  const appointment = await store.findById(String(req.params.id));
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  if (!(await patientCanAccess(req, appointment.patientId))) {
    return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
  }
  const slotValid = await verifyDoctorSlot(appointment.doctorId, parsed.data.scheduledStartAt,
    parsed.data.scheduledEndAt, req.header("X-Request-Id") ?? undefined);
  if (slotValid === null) return res.status(503).json(error("DOCTOR_VERIFICATION_UNAVAILABLE", "Doctor slot verification is unavailable"));
  if (!slotValid) return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "Khung gio khong hop le"));
  try {
    const result = await store.rescheduleBooking(appointment.id,
      normalized(parsed.data.scheduledStartAt), normalized(parsed.data.scheduledEndAt),
      currentUserId(req), parsed.data.reason);
    if (!result) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    if (result.eventId) await publishNotificationEvent("appointment.rescheduled", result.appointment, result.eventId);
    return res.json(success(result.appointment));
  } catch (caught) { return bookingError(res, caught); }
});
app.patch("/api/v1/appointments/:id/cancel", requireRoles("PATIENT", "STAFF", "ADMIN"), transition("CANCELLED"));
app.patch("/api/v1/appointments/:id/confirm", requireRoles("STAFF", "ADMIN"), transition("CONFIRMED"));
app.patch("/api/v1/appointments/:id/check-in", requireRoles("STAFF", "ADMIN"), transition("CHECKED_IN"));
app.patch("/api/v1/appointments/:id/complete", requireRoles("DOCTOR", "ADMIN"), transition("COMPLETED"));
app.patch("/api/v1/appointments/:id/no-show", requireRoles("STAFF", "ADMIN"), transition("NO_SHOW"));
app.get("/internal/v1/appointments/occupied-slots", async (req, res) => {
  const parsed = occupiedSlotsQuerySchema.safeParse(req.query);
  if (!parsed.success || (parsed.data.to && Date.parse(parsed.data.to) <= Date.parse(parsed.data.from))) {
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid occupied slots query",
      parsed.success ? [] : parsed.error.issues));
  }
  const requestId = req.header("X-Request-Id");
  if (requestId) res.setHeader("X-Request-Id", requestId);
  try { return res.json(success(await store.occupiedSlots(parsed.data.doctorId, parsed.data.from, parsed.data.to))); }
  catch (caught) { return bookingError(res, caught); }
});
app.get("/internal/v1/appointments/:id/verify-for-medical-record", async (req, res) => {
  const appointment = await store.findById(String(req.params.id));
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
