import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express, { type Request, type RequestHandler } from "express";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { MedicalRecordRepository } from "./repository.js";
import { openapi } from "./openapi.js";

const port = Number(process.env.MEDICAL_RECORD_SERVICE_PORT ?? 3004);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required by Medical Record Service");
const databaseSsl = process.env.DATABASE_SSL === "true";
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const databaseCaPath = process.env.DATABASE_SSL_CA_PATH;
if (databaseCaPath && !databaseSsl) throw new Error("DATABASE_SSL_CA_PATH requires DATABASE_SSL=true");
if (databaseCaPath && !rejectUnauthorized) throw new Error("DATABASE_SSL_CA_PATH requires certificate verification");
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl
    ? { rejectUnauthorized, ...(databaseCaPath ? { ca: readFileSync(databaseCaPath, "utf8") } : {}) }
    : undefined,
});
const repository = new MedicalRecordRepository(pool);
const appointmentUrl = process.env.APPOINTMENT_SERVICE_URL ?? "http://localhost:3003";
const doctorUrl = process.env.DOCTOR_SERVICE_URL ?? "http://localhost:3002";
const userUrl = process.env.USER_SERVICE_URL ?? "http://localhost:3001";
const notificationUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3005";

const prescription = z.object({ medicineName: z.string().min(1), dosage: z.string().min(1), frequency: z.string().min(1), duration: z.string().min(1) });
const createSchema = z.object({ appointmentId: z.string().uuid(), patientId: z.string().uuid(), doctorId: z.string().uuid(), symptoms: z.string().optional(), diagnosis: z.string().optional(), notes: z.string().optional(), treatmentPlan: z.string().optional(), prescription: z.array(prescription).default([]), status: z.enum(["DRAFT", "FINAL"]).default("DRAFT") });
const updateSchema = createSchema.pick({ symptoms: true, diagnosis: true, notes: true, treatmentPlan: true, prescription: true, status: true }).partial().strict();
const pagingSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });

type Actor = { userId: string; role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN" };
type Appointment = { id: string; patientId: string; doctorId: string; status: string };
export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  const requestId = req.header("x-request-id") ?? randomUUID();
  res.setHeader("X-Request-Id", requestId);
  console.log(JSON.stringify({ requestId, method: req.method, path: req.path }));
  next();
});

function fail(res: express.Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, error: { code, message, details: [] },
    requestId: res.getHeader("X-Request-Id") });
}
function actor(req: Request): Actor | null {
  const userId = req.header("x-user-id");
  const role = req.header("x-role");
  return userId && (role === "PATIENT" || role === "DOCTOR" || role === "STAFF" || role === "ADMIN") ? { userId, role } : null;
}
function requiredInternalToken(variable: string): string {
  const token = process.env[variable];
  if (!token || Buffer.byteLength(token, "utf8") < 32) throw new Error(`${variable} is not configured`);
  return token;
}
const requireAppointmentToken: RequestHandler = (req, res, next) => {
  const expected = process.env.APPOINTMENT_RECORD_INTERNAL_API_TOKEN ?? "";
  const received = req.header("X-Internal-Token") ?? "";
  if (Buffer.byteLength(expected, "utf8") < 32 ||
      Buffer.byteLength(expected, "utf8") !== Buffer.byteLength(received, "utf8") ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(received)))
    return void fail(res, 401, "INTERNAL_AUTH_REQUIRED", "Internal credential required");
  next();
};
async function internalGet<T>(url: string, token?: string): Promise<T | null> {
  const response = await fetch(url, { headers: token ? { "X-Internal-Token": token } : undefined,
    redirect: "error", signal: AbortSignal.timeout(4000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Internal lookup failed: ${response.status}`);
  const body = await response.json() as { success: boolean; data: T };
  if (!body.success || !body.data) throw new Error("Invalid internal response");
  return body.data;
}
const patientByUser = (id: string) => internalGet<{ id: string; userId: string }>(
  `${userUrl}/internal/v1/patients/by-user/${encodeURIComponent(id)}`,
  requiredInternalToken("USER_RECORD_INTERNAL_API_TOKEN"));
const patientById = (id: string) => internalGet<{ id: string; userId: string }>(
  `${userUrl}/internal/v1/patients/${encodeURIComponent(id)}`,
  requiredInternalToken("USER_RECORD_INTERNAL_API_TOKEN"));
const doctorByUser = (id: string) => internalGet<{ id: string; userId: string; isActive: boolean }>(
  `${doctorUrl}/internal/v1/doctors/by-user/${encodeURIComponent(id)}`,
  requiredInternalToken("DOCTOR_INTERNAL_API_TOKEN"));
async function appointment(id: string) {
  const result = await internalGet<{ valid: boolean; appointment: Appointment }>(`${appointmentUrl}/internal/v1/appointments/${encodeURIComponent(id)}/verify-for-medical-record`, requiredInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN"));
  return result?.valid ? result.appointment : null;
}
async function allowedDoctor(userId: string, doctorId: string) {
  const doctor = await doctorByUser(userId);
  return doctor?.isActive && doctor.id === doctorId;
}

export async function sendOutbox() {
  const events = await repository.claimOutbox();
  for (const event of events) {
    try {
      if (event.eventType === "medical-record.created" || event.eventType === "medical-record.updated") {
        const response = await fetch(`${notificationUrl}/internal/v1/notifications`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": event.id,
            "X-Internal-Token": requiredInternalToken("NOTIFICATION_INTERNAL_API_TOKEN") },
          body: JSON.stringify({ eventId: event.id, type: event.eventType, payload: event.payload }),
          signal: AbortSignal.timeout(4000)
        });
        if (!response.ok) throw new Error(`Notification returned ${response.status}`);
      } else if (event.eventType === "appointment.complete") {
        const id = String(event.payload.appointmentId);
        const response = await fetch(`${appointmentUrl}/internal/v1/appointments/${encodeURIComponent(id)}/complete-from-record`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": event.id,
            "X-Internal-Token": requiredInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN") },
          body: JSON.stringify({ recordId: event.payload.recordId ?? event.aggregateId }),
          redirect: "error", signal: AbortSignal.timeout(4000)
        });
        if (!response.ok) throw new Error(`Appointment returned ${response.status}`);
      }
      await repository.markOutboxSent(event.id);
    } catch (error) {
      console.warn(JSON.stringify({ eventId: event.id, type: event.eventType, error: String(error) }));
      await repository.deferOutbox(event.id, event.retryCount);
    }
  }
}

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); return res.json({ success: true, data: {
    service: "medical-record-service", status: "ok", outbox: await repository.outboxStatusCounts()
  } }); }
  catch { return fail(res, 503, "DATABASE_UNAVAILABLE", "Database is unavailable"); }
});
app.get("/openapi.json", (_req, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

app.get("/api/v1/medical-records", async (req, res) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "PATIENT" && who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Access denied");
  const parsed = pagingSchema.safeParse(req.query);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid pagination");
  let patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
  let doctorId = typeof req.query.doctorId === "string" ? req.query.doctorId : undefined;
  if (who.role === "PATIENT") {
    const patient = await patientByUser(who.userId);
    if (!patient || (patientId && patientId !== patient.id)) return fail(res, 403, "ACCESS_DENIED", "Patient record access denied");
    patientId = patient.id;
  } else if (who.role === "DOCTOR") {
    const doctor = await doctorByUser(who.userId);
    if (!doctor || !doctor.isActive || (doctorId && doctorId !== doctor.id)) return fail(res, 403, "ACCESS_DENIED", "Doctor record access denied");
    doctorId = doctor.id;
  }
  const result = await repository.findAll({ patientId, doctorId, appointmentId: typeof req.query.appointmentId === "string" ? req.query.appointmentId : undefined, status: who.role === "PATIENT" ? "FINAL" : undefined }, parsed.data.page, parsed.data.limit);
  return res.json({ success: true, data: result });
});

app.post("/api/v1/medical-records", async (req, res) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Doctor access required");
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid medical record");
  const booking = await appointment(parsed.data.appointmentId);
  if (!booking || !["CHECKED_IN", "COMPLETED"].includes(booking.status)) return fail(res, 422, "APPOINTMENT_NOT_ELIGIBLE", "Appointment is not eligible");
  if (booking.patientId !== parsed.data.patientId || booking.doctorId !== parsed.data.doctorId || !(await allowedDoctor(who.userId, booking.doctorId))) return fail(res, 403, "ACCESS_DENIED", "Doctor or patient does not match appointment");
  const patient = await patientById(booking.patientId);
  if (!patient) return fail(res, 422, "PATIENT_NOT_FOUND", "Patient profile does not exist");
  try {
    const record = await repository.create({ ...parsed.data, createdBy: who.userId }, patient.userId);
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return fail(res, 409, "MEDICAL_RECORD_ALREADY_EXISTS", "Record already exists for appointment");
    throw error;
  }
});

app.get("/api/v1/medical-records/:id", async (req, res) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "PATIENT" && who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Access denied");
  const record = await repository.findById(req.params.id);
  if (!record) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
  if (who.role === "PATIENT" && record.status !== "FINAL") return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
  if (who.role === "PATIENT" && (await patientByUser(who.userId))?.id !== record.patientId) return fail(res, 403, "ACCESS_DENIED", "Access denied");
  if (who.role === "DOCTOR" && !(await allowedDoctor(who.userId, record.doctorId))) return fail(res, 403, "ACCESS_DENIED", "Access denied");
  return res.json({ success: true, data: record });
});

app.patch("/api/v1/medical-records/:id", async (req, res) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Doctor access required");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid update");
  const existing = await repository.findById(req.params.id);
  if (!existing) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
  if (!(await allowedDoctor(who.userId, existing.doctorId))) return fail(res, 403, "ACCESS_DENIED", "Access denied");
  const patient = await patientById(existing.patientId);
  if (!patient) return fail(res, 422, "PATIENT_NOT_FOUND", "Patient profile does not exist");
  const result = await repository.update(existing.id, parsed.data, who.userId, patient.userId);
  if (result && "conflict" in result) return fail(res, 409, "MEDICAL_RECORD_FINAL", "Final record cannot return to draft");
  if (!result || !("record" in result)) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
  return res.json({ success: true, data: result.record });
});

app.get("/internal/v1/medical-records/by-appointment/:appointmentId", requireAppointmentToken, async (req, res) => {
  const record = await repository.findByAppointmentId(String(req.params.appointmentId));
  if (!record) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
  const { id, appointmentId, patientId, doctorId, status, createdBy, updatedBy } = record;
  return res.json({ success: true, data: { id, appointmentId, patientId, doctorId, status, createdBy, updatedBy } });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/")) return fail(res, 404, "ROUTE_NOT_FOUND", "Route not found");
  next();
});

app.use((error: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
  console.error(JSON.stringify({ message: "Medical Record request failed", error: String(error) }));
  return fail(res, 503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
});

if (process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => { void sendOutbox().catch((error) => console.error(JSON.stringify({ message: "Outbox dispatch failed", error: String(error) }))); }, 5000);
  timer.unref();
  app.listen(port, () => console.log(`Medical Record Service listening on port ${port}`));
}
