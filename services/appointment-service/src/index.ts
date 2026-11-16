import cors from "cors";
import { timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import type { AppointmentStatus } from "@clinic/shared-types";
import { createRequestLoggingMiddleware, logServiceEvent } from "@clinic/request-logging";
import { AppointmentRepository, type Appointment } from "./repository.js";
import { createAppointmentPool, PostgresAppointmentRepository, SlotConflictError,
  IdempotencyMismatchError, RescheduleStateError, ConcurrentChangeError, InvalidTransitionError,
  type BookingFingerprint } from "./postgres-repository.js";
import { canReschedule, canTransition } from "./state-machine.js";
import { appointmentOpenApi } from "./openapi.js";
import { AppointmentOutboxWorker } from "./outbox-worker.js";

export const app = express();
export const repository = new AppointmentRepository();
const store = process.env.NODE_ENV === "test" ? repository : new PostgresAppointmentRepository(createAppointmentPool());
const port = Number(process.env.APPOINTMENT_SERVICE_PORT ?? 3003);
const doctorServiceUrl = process.env.DOCTOR_SERVICE_URL ?? "http://localhost:3002";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3005";
const userServiceUrl = process.env.USER_SERVICE_URL ?? "http://localhost:3001";
const medicalRecordServiceUrl = process.env.MEDICAL_RECORD_SERVICE_URL ?? "http://localhost:3004";

class UpstreamUnavailableError extends Error {}

const createAppointmentSchema = z.object({
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid(),
  specialtyId: z.string().uuid().optional(),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  reason: z.string().optional()
});
const statusEnum = z.enum(["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"]);
const statusQuery = z.preprocess((val) => {
  if (!val) return undefined;
  const rawList = Array.isArray(val) ? val : [val];
  const items: string[] = [];
  for (const raw of rawList) {
    if (typeof raw !== "string") return "__INVALID__";
    for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      items.push(part);
    }
  }
  return items.length === 1 ? items[0] : items;
}, z.union([statusEnum, z.array(statusEnum)]).optional());

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  status: statusQuery,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  include: z.enum(["names"]).optional(),
  view: z.enum(["summary", "detail"]).default("summary"),
  sort: z.string().trim().optional()
});
const summaryQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  doctorId: z.string().uuid().optional(),
  status: statusQuery
});
const rescheduleSchema = z.object({ scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(), reason: z.string().trim().max(500).optional() }).strict();
const transitionBodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
const appointmentIdSchema = z.string().uuid();
const completionSchema = z.object({
  record_id: z.string().uuid().optional(),
  recordId: z.string().uuid().optional(),
  doctor_id: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  proof_token: z.string().optional(),
  proofToken: z.string().optional()
}).refine((data) => Boolean(data.record_id || data.recordId), {
  message: "record_id is required"
});

function validInterval(start: string, end: string) { return Date.parse(start) < Date.parse(end); }
function normalized(value: string) { return new Date(value).toISOString(); }
function bookingError(res: express.Response, caught: unknown) {
  if (caught instanceof SlotConflictError) return res.status(409).json(error("APPOINTMENT_SLOT_UNAVAILABLE", "Khung gio da duoc dat"));
  if (caught instanceof IdempotencyMismatchError) return res.status(409).json(error("IDEMPOTENCY_KEY_REUSED", "Idempotency key was used for another request"));
  if (caught instanceof RescheduleStateError || caught instanceof ConcurrentChangeError || caught instanceof InvalidTransitionError)
    return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Appointment state changed"));
  logServiceEvent("appointment-service", "error", "storage.failure", {
    code: typeof caught === "object" && caught !== null && "code" in caught
      ? String(caught.code) : "APPOINTMENT_STORAGE_UNAVAILABLE"
  });
  return res.status(503).json(error("APPOINTMENT_STORAGE_UNAVAILABLE", "Appointment storage is unavailable"));
}
const occupiedSlotsQuerySchema = z.object({
  doctorId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime().optional()
});

app.use(cors());
app.use(express.json());
app.use(createRequestLoggingMiddleware("appointment-service"));
app.get("/openapi.json", (_req, res) => res.json(appointmentOpenApi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(appointmentOpenApi));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(appointmentOpenApi));

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

function requireInternalToken(variable: string, distinctFrom: string[] = []): RequestHandler {
  return (req, res, next) => {
    const expected = process.env[variable];
    const received = req.header("X-Internal-Token") ?? "";
    if (distinctFrom.length && (!expected || Buffer.byteLength(expected, "utf8") < 32))
      return res.status(503).json(error("INTERNAL_AUTH_NOT_CONFIGURED", "Internal credential is unavailable"));
    if (expected && distinctFrom.some((other) => process.env[other] === expected))
      return res.status(503).json(error("INTERNAL_AUTH_NOT_CONFIGURED", "Internal credentials must be distinct"));
    if (!expected || Buffer.byteLength(expected, "utf8") < 32 ||
      Buffer.byteLength(expected, "utf8") !== Buffer.byteLength(received, "utf8") ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(received)))
      return res.status(401).json(error("INTERNAL_AUTH_REQUIRED", "Internal credential required"));
    next();
  };
}

function currentUserId(req: express.Request) {
  return req.header("x-user-id") ?? "";
}

function currentRole(req: express.Request) {
  return req.header("x-role") ?? "";
}

function requireRoles(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    if (!appointmentIdSchema.safeParse(currentUserId(req)).success) {
      return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
    }
    if (!roles.includes(currentRole(req))) {
      return res.status(403).json(error("ACCESS_DENIED", "Role is not allowed for this action"));
    }
    next();
  };
}

async function patientIdForUser(userId: string) {
  try {
    const token = process.env.USER_APPOINTMENT_INTERNAL_API_TOKEN;
    if (!token || Buffer.byteLength(token, "utf8") < 32)
      throw new UpstreamUnavailableError("User internal credential is unavailable");
    const response = await fetch(
      `${userServiceUrl}/internal/v1/patients/by-user/${encodeURIComponent(userId)}`,
      { headers: { "X-Internal-Token": token }, redirect: "error", signal: AbortSignal.timeout(4000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new UpstreamUnavailableError("User Service unavailable");
    const body = await response.json() as { success?: boolean; data?: { id?: string; userId?: string } };
    if (body.success !== true || body.data?.userId !== userId ||
      !appointmentIdSchema.safeParse(body.data.id).success)
      throw new UpstreamUnavailableError("Invalid patient lookup response");
    return body.data.id;
  } catch (caught) {
    if (caught instanceof UpstreamUnavailableError) throw caught;
    throw new UpstreamUnavailableError("User Service unavailable");
  }
}

async function doctorIdForUser(userId: string, requestId?: string) {
  const token = process.env.DOCTOR_INTERNAL_API_TOKEN;
  if (!token || Buffer.byteLength(token, "utf8") < 32)
    throw new UpstreamUnavailableError("Doctor internal credential is unavailable");
  const forwardedRequestId = requestId && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : undefined;
  try {
    const response = await fetch(`${doctorServiceUrl}/internal/v1/doctors/by-user/${encodeURIComponent(userId)}`, {
      headers: { "X-Internal-Token": token,
        ...(forwardedRequestId ? { "X-Request-Id": forwardedRequestId } : {}) },
      redirect: "error", signal: AbortSignal.timeout(3000)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new UpstreamUnavailableError("Doctor Service unavailable");
    const body = await response.json() as { success?: boolean;
      data?: { id?: string; userId?: string; isActive?: boolean } };
    if (body.success !== true || body.data?.userId !== userId ||
      !appointmentIdSchema.safeParse(body.data.id).success || typeof body.data.isActive !== "boolean")
      throw new UpstreamUnavailableError("Invalid doctor lookup response");
    return body.data.isActive ? body.data.id! : null;
  } catch (caught) {
    if (caught instanceof UpstreamUnavailableError) throw caught;
    throw new UpstreamUnavailableError("Doctor Service unavailable");
  }
}

async function verifyClinicalGrant(req: express.Request, grantId: string, patientId: string,
  appointmentId: string, doctorId: string): Promise<boolean | null> {
  const token = process.env.RECORD_APPOINTMENT_INTERNAL_API_TOKEN;
  const sessionId = req.header("X-Session-Id");
  if (!token || Buffer.byteLength(token, "utf8") < 32 || !sessionId) return null;
  try {
    const response = await fetch(`${medicalRecordServiceUrl}/internal/v1/medical-records/access-grants/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({ grantId, patientId, appointmentId, doctorId, sessionId }),
      redirect: "error", signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) return null;
    const body = await response.json() as { success?: boolean; data?: { valid?: boolean } };
    return body.success === true && typeof body.data?.valid === "boolean" ? body.data.valid : null;
  } catch { return null; }
}

async function patientExists(patientId: string): Promise<boolean | null> {
  try {
    const token = process.env.USER_APPOINTMENT_INTERNAL_API_TOKEN;
    if (!token || Buffer.byteLength(token, "utf8") < 32) return null;
    const response = await fetch(`${userServiceUrl}/internal/v1/patients/${encodeURIComponent(patientId)}`,
      { headers: { "X-Internal-Token": token }, redirect: "error", signal: AbortSignal.timeout(4000) });
    if (response.status === 404) return false;
    if (!response.ok) return null;
    const body = await response.json() as { success?: boolean; data?: { id?: string; userId?: string } };
    return body.success === true && body.data?.id === patientId &&
      appointmentIdSchema.safeParse(body.data.userId).success ? true : null;
  } catch { return null; }
}

async function patientCanAccess(req: express.Request, patientId: string) {
  if (currentRole(req) !== "PATIENT") return true;
  return await patientIdForUser(currentUserId(req)) === patientId;
}

async function canAccessAppointment(req: express.Request, appointment: { patientId: string; doctorId: string }) {
  if (currentRole(req) === "PATIENT") return patientCanAccess(req, appointment.patientId);
  if (currentRole(req) === "DOCTOR")
    return await doctorIdForUser(currentUserId(req), req.header("X-Request-Id") ?? undefined) === appointment.doctorId;
  return currentRole(req) === "STAFF" || currentRole(req) === "ADMIN";
}

function transition(toStatus: AppointmentStatus) {
  return async (req: express.Request, res: express.Response) => {
    const id = String(req.params.id);
    if (!appointmentIdSchema.safeParse(id).success)
      return res.status(400).json(error("VALIDATION_ERROR", "Invalid appointment ID"));
    const parsed = transitionBodySchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
    const appointment = await store.findById(id);
    if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    if (!(await canAccessAppointment(req, appointment))) {
      return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
    }
    if (!canTransition(appointment.status, toStatus)) {
      return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Invalid appointment status transition"));
    }
    let updated;
    try { updated = await store.transition(id, toStatus, currentUserId(req), parsed.data.reason, appointment.status); }
    catch (caught) { return bookingError(res, caught); }
    if (!updated) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    return res.json(success(updated));
  };
}

type PatientSummary = { id: string; fullName: string };
type DoctorSummary = { id: string; displayName: string; specialtyId?: string; specialtyName?: string | null };

async function lookupPatients(patientIds: string[], requestId?: string): Promise<Map<string, PatientSummary>> {
  const result = new Map<string, PatientSummary>();
  if (!patientIds.length) return result;
  const token = process.env.USER_APPOINTMENT_INTERNAL_API_TOKEN;
  if (!token || Buffer.byteLength(token, "utf8") < 32) {
    throw new UpstreamUnavailableError("User internal credential is unavailable");
  }
  const forwardedRequestId = requestId && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : undefined;

  try {
    const response = await fetch(`${userServiceUrl}/internal/v1/patients/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
        ...(forwardedRequestId ? { "X-Request-Id": forwardedRequestId } : {})
      },
      body: JSON.stringify({ patientIds }),
      redirect: "error",
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const body = await response.json() as { success?: boolean; data?: { items?: Array<{ id: string; fullName: string }> } };
      if (body.success && Array.isArray(body.data?.items)) {
        for (const p of body.data.items) {
          result.set(p.id, { id: p.id, fullName: p.fullName });
        }
        return result;
      }
    } else if (response.status !== 404) {
      throw new UpstreamUnavailableError("User Service lookup failed");
    }
  } catch (err) {
    if (err instanceof UpstreamUnavailableError) throw err;
    throw new UpstreamUnavailableError("User Service unavailable");
  }

  for (const pid of patientIds) {
    try {
      const response = await fetch(`${userServiceUrl}/internal/v1/patients/${encodeURIComponent(pid)}`, {
        headers: {
          "X-Internal-Token": token,
          ...(forwardedRequestId ? { "X-Request-Id": forwardedRequestId } : {})
        },
        redirect: "error",
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        const body = await response.json() as { success?: boolean; data?: { id?: string; fullName?: string } };
        if (body.success && body.data?.id) {
          result.set(pid, { id: pid, fullName: body.data.fullName ?? "Patient" });
        }
      } else if (response.status !== 404) {
        throw new UpstreamUnavailableError("User Service lookup failed");
      }
    } catch (err) {
      if (err instanceof UpstreamUnavailableError) throw err;
      throw new UpstreamUnavailableError("User Service unavailable");
    }
  }
  return result;
}

async function lookupDoctors(doctorIds: string[], requestId?: string): Promise<Map<string, DoctorSummary>> {
  const result = new Map<string, DoctorSummary>();
  if (!doctorIds.length) return result;
  const token = process.env.DOCTOR_INTERNAL_API_TOKEN;
  if (!token || Buffer.byteLength(token, "utf8") < 32) {
    throw new UpstreamUnavailableError("Doctor internal credential is unavailable");
  }
  const forwardedRequestId = requestId && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : undefined;

  try {
    const response = await fetch(`${doctorServiceUrl}/internal/v1/doctors/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
        ...(forwardedRequestId ? { "X-Request-Id": forwardedRequestId } : {})
      },
      body: JSON.stringify({ doctorIds }),
      redirect: "error",
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) {
      throw new UpstreamUnavailableError("Doctor Service lookup failed");
    }
    const body = await response.json() as {
      success?: boolean;
      data?: { items?: Array<{ id: string; displayName: string; specialtyId?: string; specialtyName?: string }> }
    };
    if (body.success && Array.isArray(body.data?.items)) {
      for (const d of body.data.items) {
        result.set(d.id, {
          id: d.id,
          displayName: d.displayName,
          specialtyId: d.specialtyId,
          specialtyName: d.specialtyName ?? null
        });
      }
      return result;
    }
    throw new UpstreamUnavailableError("Invalid Doctor Service response");
  } catch (err) {
    if (err instanceof UpstreamUnavailableError) throw err;
    throw new UpstreamUnavailableError("Doctor Service unavailable");
  }
}

function toSummaryView(appointment: Appointment, namesMap?: { patients: Map<string, PatientSummary>; doctors: Map<string, DoctorSummary> }) {
  const item: Record<string, unknown> = {
    id: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    specialtyId: appointment.specialtyId ?? null,
    scheduledStartAt: appointment.scheduledStartAt,
    scheduledEndAt: appointment.scheduledEndAt,
    status: appointment.status
  };
  if (namesMap) {
    const p = namesMap.patients.get(appointment.patientId);
    item.patientSummary = p ? { id: p.id, fullName: p.fullName } : null;
    const d = namesMap.doctors.get(appointment.doctorId);
    item.doctorSummary = d ? { id: d.id, displayName: d.displayName } : null;
    item.specialtySummary = d?.specialtyId ? { id: d.specialtyId, name: d.specialtyName ?? null } : null;
  }
  return item;
}

function toDetailView(appointment: Appointment, namesMap?: { patients: Map<string, PatientSummary>; doctors: Map<string, DoctorSummary> }) {
  const item: Record<string, unknown> = {
    id: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    specialtyId: appointment.specialtyId ?? null,
    scheduledStartAt: appointment.scheduledStartAt,
    scheduledEndAt: appointment.scheduledEndAt,
    reason: appointment.reason ?? null,
    status: appointment.status,
    createdBy: appointment.createdBy,
    updatedBy: appointment.updatedBy ?? null,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
  if (namesMap) {
    const p = namesMap.patients.get(appointment.patientId);
    item.patientSummary = p ? { id: p.id, fullName: p.fullName } : null;
    const d = namesMap.doctors.get(appointment.doctorId);
    item.doctorSummary = d ? { id: d.id, displayName: d.displayName } : null;
    item.specialtySummary = d?.specialtyId ? { id: d.specialtyId, name: d.specialtyName ?? null } : null;
  }
  return item;
}

app.get("/health", async (_req, res) => {
  try {
    if (store instanceof PostgresAppointmentRepository) {
      await store.health();
      return res.json(success({ service: "appointment-service", status: "ok", outbox: await store.outboxCounts() }));
    }
    return res.json(success({ service: "appointment-service", status: "ok" }));
  } catch { return res.status(503).json(error("APPOINTMENT_STORAGE_UNAVAILABLE", "Appointment database is unavailable")); }
});
app.get("/api/v1/appointments", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success || (parsed.data.from && parsed.data.to && !validInterval(parsed.data.from, parsed.data.to)))
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid list query", parsed.success ? [] : parsed.error.issues));
  const role = currentRole(req);
  const ownPatientId = role === "PATIENT"
    ? await patientIdForUser(currentUserId(req))
    : undefined;
  const ownDoctorId = role === "DOCTOR"
    ? await doctorIdForUser(currentUserId(req), req.header("X-Request-Id") ?? undefined)
    : undefined;
  if (role === "PATIENT" && !ownPatientId) {
    return res.status(403).json(error("PATIENT_PROFILE_NOT_FOUND", "Patient profile not found"));
  }
  if (role === "DOCTOR" && !ownDoctorId) {
    return res.status(403).json(error("DOCTOR_PROFILE_NOT_FOUND", "Doctor profile not found"));
  }

  const { page, limit, view, include, q, sort, ...filters } = parsed.data;

  if (view === "detail" && role === "DOCTOR" && !filters.patientId)
    return res.status(400).json(error("VALIDATION_ERROR", "patientId is required for doctor detail view"));
  const allowedReasonSearch = role !== "DOCTOR" || view === "detail";

  try {
    const listResult = await store.list({
      ...filters,
      patientId: ownPatientId ?? filters.patientId,
      doctorId: ownDoctorId ?? filters.doctorId,
      q,
      sort,
      allowedReasonSearch
    }, page, limit);

    if (view === "detail" && role === "DOCTOR") {
      const grant = req.header("X-Clinical-Grant");
      if (!grant) return res.status(403).json(error("CLINICAL_VERIFICATION_REQUIRED", "Clinical access grant is required"));
      for (const item of listResult.items) {
        if (item.status === "CANCELLED" || item.status === "NO_SHOW") {
          return res.status(403).json(error("CLINICAL_ACCESS_DENIED", "Cancelled or no-show appointments do not grant clinical access"));
        }
        const valid = await verifyClinicalGrant(req, grant, item.patientId, item.id, item.doctorId);
        if (valid === null) return res.status(503).json(error("DEPENDENCY_UNAVAILABLE", "Clinical grant verification is unavailable"));
        if (!valid) return res.status(403).json(error("CLINICAL_VERIFICATION_REQUIRED", "Clinical grant is invalid for this appointment"));
      }
    }

    let namesMap: { patients: Map<string, PatientSummary>; doctors: Map<string, DoctorSummary> } | undefined;
    if (include === "names") {
      const patientIds = Array.from(new Set(listResult.items.map((i) => i.patientId)));
      const doctorIds = Array.from(new Set(listResult.items.map((i) => i.doctorId)));
      const [patients, doctors] = await Promise.all([
        lookupPatients(patientIds, req.header("X-Request-Id") ?? undefined),
        lookupDoctors(doctorIds, req.header("X-Request-Id") ?? undefined)
      ]);
      namesMap = { patients, doctors };
    }

    const items = listResult.items.map((item) =>
      view === "detail" ? toDetailView(item, namesMap) : toSummaryView(item, namesMap)
    );

    return res.json(success({
      items,
      page: listResult.page,
      limit: listResult.limit,
      total: listResult.total
    }));
  } catch (caught) {
    if (caught instanceof UpstreamUnavailableError) {
      return res.status(503).json(error("DEPENDENCY_UNAVAILABLE", caught.message));
    }
    return bookingError(res, caught);
  }
});

app.get("/api/v1/appointments/summary", requireRoles("DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success || !validInterval(parsed.data.from, parsed.data.to)) {
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid summary query", parsed.success ? [] : parsed.error.issues));
  }
  const role = currentRole(req);
  const ownDoctorId = role === "DOCTOR"
    ? await doctorIdForUser(currentUserId(req), req.header("X-Request-Id") ?? undefined)
    : undefined;
  if (role === "DOCTOR" && !ownDoctorId) {
    return res.status(403).json(error("DOCTOR_PROFILE_NOT_FOUND", "Doctor profile not found"));
  }

  try {
    const summaryData = await store.summary({
      doctorId: ownDoctorId ?? parsed.data.doctorId,
      status: parsed.data.status
    }, parsed.data.from, parsed.data.to);

    return res.json(success(summaryData));
  } catch (caught) {
    if (caught instanceof UpstreamUnavailableError) {
      return res.status(503).json(error("DEPENDENCY_UNAVAILABLE", caught.message));
    }
    return bookingError(res, caught);
  }
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
  if (currentRole(req) === "PATIENT" && parsed.data.patientId && parsed.data.patientId !== patientId)
    return res.status(403).json(error("ACCESS_DENIED", "Cannot book for another patient"));
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
    return res.status(result.replayed ? 200 : 201).json(success(result.appointment));
  } catch (caught) { return bookingError(res, caught); }
});
app.get("/api/v1/appointments/:id", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  if (!appointmentIdSchema.safeParse(id).success)
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid appointment ID"));
  const appointment = await store.findById(id);
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  if (!(await canAccessAppointment(req, appointment))) {
    return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
  }

  const role = currentRole(req);
  const view = req.query.view === "detail" ? "detail" : "summary";
  const include = req.query.include;

  if (view === "detail" && role === "DOCTOR") {
    if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
      return res.status(403).json(error("CLINICAL_ACCESS_DENIED", "Cancelled or no-show appointments do not grant clinical access"));
    }
    const grant = req.header("X-Clinical-Grant");
    if (!grant) {
      return res.status(403).json(error("CLINICAL_VERIFICATION_REQUIRED", "Clinical access grant is required for detail view"));
    }
    const valid = await verifyClinicalGrant(req, grant, appointment.patientId, appointment.id, appointment.doctorId);
    if (valid === null) return res.status(503).json(error("DEPENDENCY_UNAVAILABLE", "Clinical grant verification is unavailable"));
    if (!valid) return res.status(403).json(error("CLINICAL_VERIFICATION_REQUIRED", "Clinical grant is invalid for this appointment"));
  }

  let namesMap: { patients: Map<string, PatientSummary>; doctors: Map<string, DoctorSummary> } | undefined;
  if (include === "names") {
    try {
      const [patients, doctors] = await Promise.all([
        lookupPatients([appointment.patientId], req.header("X-Request-Id") ?? undefined),
        lookupDoctors([appointment.doctorId], req.header("X-Request-Id") ?? undefined)
      ]);
      namesMap = { patients, doctors };
    } catch (caught) {
      if (caught instanceof UpstreamUnavailableError) {
        return res.status(503).json(error("DEPENDENCY_UNAVAILABLE", caught.message));
      }
      throw caught;
    }
  }

  const result = view === "detail" ? toDetailView(appointment, namesMap) : toSummaryView(appointment, namesMap);
  return res.json(success(result));
});
app.patch("/api/v1/appointments/:id/reschedule", requireRoles("PATIENT", "STAFF", "ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  if (!appointmentIdSchema.safeParse(id).success)
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid appointment ID"));
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  if (!validInterval(parsed.data.scheduledStartAt, parsed.data.scheduledEndAt))
    return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "End time must follow start time"));
  if (Date.parse(parsed.data.scheduledStartAt) <= Date.now())
    return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "Rescheduled slot must be in the future"));
  const appointment = await store.findById(id);
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  if (!(await patientCanAccess(req, appointment.patientId))) {
    return res.status(403).json(error("ACCESS_DENIED", "Appointment access denied"));
  }
  if (!canReschedule(appointment.status))
    return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Appointment cannot be rescheduled in this status"));
  const slotValid = await verifyDoctorSlot(appointment.doctorId, parsed.data.scheduledStartAt,
    parsed.data.scheduledEndAt, req.header("X-Request-Id") ?? undefined);
  if (slotValid === null) return res.status(503).json(error("DOCTOR_VERIFICATION_UNAVAILABLE", "Doctor slot verification is unavailable"));
  if (!slotValid) return res.status(422).json(error("APPOINTMENT_SLOT_INVALID", "Khung gio khong hop le"));
  try {
    const result = await store.rescheduleBooking(appointment.id,
      normalized(parsed.data.scheduledStartAt), normalized(parsed.data.scheduledEndAt),
      currentUserId(req), parsed.data.reason);
    if (!result) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    return res.json(success(result.appointment));
  } catch (caught) { return bookingError(res, caught); }
});
app.patch("/api/v1/appointments/:id/cancel", requireRoles("PATIENT", "STAFF", "ADMIN"), transition("CANCELLED"));
app.patch("/api/v1/appointments/:id/confirm", requireRoles("STAFF", "ADMIN"), transition("CONFIRMED"));
app.patch("/api/v1/appointments/:id/check-in", requireRoles("STAFF", "ADMIN"), transition("CHECKED_IN"));
// Completion is reserved for the authenticated Medical Record callback below.
app.patch("/api/v1/appointments/:id/complete", requireRoles("DOCTOR"), (_req, res) =>
  res.status(409).json(error("MEDICAL_RECORD_REQUIRED", "Complete a final medical record first")));
app.get("/api/v1/appointments/:id/complete", requireRoles("DOCTOR"), (_req, res) =>
  res.status(409).json(error("MEDICAL_RECORD_REQUIRED", "Complete a final medical record first")));
app.patch("/api/v1/appointments/:id/no-show", requireRoles("STAFF", "ADMIN"), transition("NO_SHOW"));
app.get("/internal/v1/appointments/occupied-slots", requireInternalToken("DOCTOR_INTERNAL_API_TOKEN"), async (req, res) => {
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
app.get("/internal/v1/appointments/:id/verify-for-medical-record", requireInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN"), async (req, res) => {
  const id = String(req.params.id);
  if (!appointmentIdSchema.safeParse(id).success)
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid appointment ID"));
  const appointment = await store.findById(id);
  if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
  return res.json(success({ valid: ["CHECKED_IN", "COMPLETED"].includes(appointment.status),
    appointment: { id: appointment.id, patientId: appointment.patientId,
      doctorId: appointment.doctorId, status: appointment.status } }));
});

app.get("/internal/v1/appointments/:id/patient-scope",
  requireInternalToken("APPOINTMENT_USER_INTERNAL_API_TOKEN", ["APPOINTMENT_RECORD_INTERNAL_API_TOKEN",
    "APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN", "DOCTOR_INTERNAL_API_TOKEN",
    "USER_APPOINTMENT_INTERNAL_API_TOKEN", "NOTIFICATION_INTERNAL_API_TOKEN"]), async (req, res) => {
    const id = String(req.params.id);
    if (!appointmentIdSchema.safeParse(id).success)
      return res.status(400).json(error("VALIDATION_ERROR", "Invalid appointment ID"));
    const appointment = await store.findById(id);
    if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    return res.json(success({ id: appointment.id, patientId: appointment.patientId,
      doctorId: appointment.doctorId, status: appointment.status }));
  });

app.get("/internal/v1/appointments/:id/reminder-context",
  requireInternalToken("APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN"), async (req, res) => {
    const id = String(req.params.id);
    if (!appointmentIdSchema.safeParse(id).success)
      return res.status(400).json(error("VALIDATION_ERROR", "Invalid appointment ID"));
    const item = await store.findById(id);
    if (!item) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    return res.json(success({ id: item.id, patientId: item.patientId,
      status: item.status, scheduledStartAt: item.scheduledStartAt }));
  });

app.post("/internal/v1/appointments/:id/check-eligibility",
  requireInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN"), async (req, res) => {
    const id = String(req.params.id);
    if (!appointmentIdSchema.safeParse(id).success)
      return res.status(400).json(error("VALIDATION_ERROR", "Invalid appointment ID"));
    const appointment = await store.findById(id);
    if (!appointment) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    let eligible = appointment.status === "CHECKED_IN";
    const body = (typeof req.body === "object" && req.body !== null) ? req.body as Record<string, unknown> : {};
    if (typeof body.doctorId === "string" && body.doctorId !== appointment.doctorId) {
      eligible = false;
    }
    if (typeof body.patientId === "string" && body.patientId !== appointment.patientId) {
      eligible = false;
    }
    return res.json(success({
      eligible,
      status: appointment.status,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId
    }));
  });

app.post("/internal/v1/appointments/:id/complete-from-record",
  requireInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN"), async (req, res) => {
    const id = String(req.params.id);
    const parsed = completionSchema.safeParse(req.body);
    if (!appointmentIdSchema.safeParse(id).success || !parsed.success)
      return res.status(400).json(error("VALIDATION_ERROR", "Invalid completion request"));
    const recordId = (parsed.data.record_id ?? parsed.data.recordId)!;
    const providedDoctorId = parsed.data.doctor_id ?? parsed.data.doctorId;
    const existing = await store.findCompletion(id);
    if (existing?.recordId === recordId) return res.json(success({ id, status: "COMPLETED", recordId }));
    if (existing) return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Appointment already completed"));
    const item = await store.findById(id);
    if (!item) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
    if (item.status !== "CHECKED_IN")
      return res.status(409).json(error("APPOINTMENT_INVALID_STATUS_TRANSITION", "Appointment must be checked in"));
    if (providedDoctorId && providedDoctorId !== item.doctorId)
      return res.status(422).json(error("RECORD_CONTEXT_MISMATCH", "Record doctor does not match appointment"));
    let record: { id?: string; appointmentId?: string; patientId?: string; doctorId?: string;
      status?: string; createdBy?: string; updatedBy?: string };
    try {
      const token = process.env.APPOINTMENT_RECORD_INTERNAL_API_TOKEN!;
      const response = await fetch(`${medicalRecordServiceUrl}/internal/v1/medical-records/by-appointment/${id}`,
        { headers: { "X-Internal-Token": token }, redirect: "error", signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new UpstreamUnavailableError("Medical record lookup failed");
      const body = await response.json() as { success?: boolean; data?: typeof record };
      if (body.success !== true || !body.data) throw new UpstreamUnavailableError("Invalid medical record response");
      record = body.data;
    } catch { return res.status(503).json(error("DEPENDENCY_UNAVAILABLE", "Medical Record Service unavailable")); }
    if (record.id !== recordId || record.appointmentId !== id || record.patientId !== item.patientId ||
      record.doctorId !== item.doctorId || record.status !== "FINAL" ||
      !appointmentIdSchema.safeParse(record.updatedBy ?? record.createdBy).success)
      return res.status(422).json(error("RECORD_CONTEXT_MISMATCH", "Final record does not match appointment"));
    const doctorUserId = record.updatedBy ?? record.createdBy!;
    let doctorId: string | null;
    try { doctorId = await doctorIdForUser(doctorUserId); }
    catch { return res.status(503).json(error("DEPENDENCY_UNAVAILABLE", "Doctor Service unavailable")); }
    if (doctorId !== item.doctorId)
      return res.status(422).json(error("RECORD_CONTEXT_MISMATCH", "Record doctor does not match appointment"));
    try {
      const result = await store.completeFromRecord(id, recordId, doctorUserId);
      if (!result) return res.status(404).json(error("APPOINTMENT_NOT_FOUND", "Appointment not found"));
      return res.json(success({ id, status: result.appointment.status, recordId }));
    } catch (caught) { return bookingError(res, caught); }
  });

app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/")) {
    return res.status(404).json(error("ROUTE_NOT_FOUND", "Route not found"));
  }
  next();
});

const onError: ErrorRequestHandler = (caught: unknown, _req, res, _next) => {
  if (caught instanceof UpstreamUnavailableError)
    return void res.status(503).json(error("DEPENDENCY_UNAVAILABLE", "Required service is unavailable"));
  if (caught instanceof SyntaxError && typeof caught === "object" && "body" in caught)
    return void res.status(400).json(error("VALIDATION_ERROR", "Invalid JSON body"));
  logServiceEvent("appointment-service", "error", "request.failed", {
    requestId: String(res.getHeader("X-Request-Id") ?? ""),
    code: typeof caught === "object" && caught !== null && "code" in caught
      ? String(caught.code) : "APPOINTMENT_STORAGE_UNAVAILABLE"
  });
  return void res.status(503).json(error("APPOINTMENT_STORAGE_UNAVAILABLE", "Appointment storage is unavailable"));
};
app.use(onError);

if (process.env.NODE_ENV !== "test") {
  const worker = new AppointmentOutboxWorker(store as PostgresAppointmentRepository,
    userServiceUrl, notificationServiceUrl);
  void worker.dispatchBatch().catch(() => logServiceEvent("appointment-service", "error", "outbox.poll_failed"));
  const configuredPollMs = Number(process.env.APPOINTMENT_OUTBOX_POLL_MS ?? 5000);
  const pollMs = Number.isFinite(configuredPollMs) ? Math.max(1000, configuredPollMs) : 5000;
  setInterval(() => void worker.dispatchBatch().catch(() => logServiceEvent("appointment-service", "error", "outbox.poll_failed")),
    pollMs);
  app.listen(port, () => {
    logServiceEvent("appointment-service", "info", "service.started", { port });
  });
}
