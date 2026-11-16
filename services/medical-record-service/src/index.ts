import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express, { type Request, type RequestHandler } from "express";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { createRequestLoggingMiddleware, logServiceEvent } from "@clinic/request-logging";
import { MedicalRecordRepository, type PrescriptionItem, type RecordChanges } from "./repository.js";
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

const prescription = z.object({
  medicineName: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  duration: z.string().min(1)
});

const createSchema = z.object({
  appointmentId: z.string().uuid(),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  treatmentPlan: z.string().optional(),
  prescription: z.array(prescription).default([]),
  status: z.enum(["DRAFT", "FINAL"]).default("DRAFT"),
  verificationProofId: z.string().optional(),
  contextId: z.string().uuid().optional(),
  expectedVersion: z.number().int().min(0).optional()
});

const updateSchema = z.object({
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  treatmentPlan: z.string().optional(),
  prescription: z.array(prescription).optional(),
  status: z.enum(["DRAFT", "FINAL"]).optional(),
  expectedVersion: z.number().int().min(1).optional(),
  verificationProofId: z.string().optional(),
  contextId: z.string().uuid().optional()
}).strict();

const grantSchema = z.object({
  verificationProofId: z.string().min(1),
  accessMode: z.enum(["CURRENT_ENCOUNTER", "AUTHORED_HISTORY"]),
  appointmentId: z.string().uuid(),
  patientId: z.string().uuid(),
  recordId: z.string().uuid().optional()
});

const finalizationContextSchema = z.object({
  appointmentId: z.string().uuid(),
  recordId: z.string().uuid().optional(),
  expectedVersion: z.number().int().min(0),
  record: z.object({
    symptoms: z.string().optional(),
    diagnosis: z.string().optional(),
    notes: z.string().optional(),
    treatmentPlan: z.string().optional(),
    prescription: z.array(prescription).default([])
  })
});

const finalizeSchema = z.object({
  contextId: z.string().min(1),
  verificationProofId: z.string().min(1),
  expectedVersion: z.number().int().min(1),
  record: z.object({
    symptoms: z.string().optional(),
    diagnosis: z.string().optional(),
    notes: z.string().optional(),
    treatmentPlan: z.string().optional(),
    prescription: z.array(prescription).default([])
  }).optional()
});

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "FINAL"]).optional(),
  scope: z.enum(["authored", "patient-history"]).optional(),
  view: z.enum(["summary", "detail"]).optional()
});

type Actor = { userId: string; role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN" };
type Appointment = { id: string; patientId: string; doctorId: string; status: string };

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(createRequestLoggingMiddleware("medical-record-service"));

function fail(res: express.Response, status: number, code: string, message: string) {
  return res.status(status).json({
    success: false,
    error: { code, message, details: [] },
    requestId: res.getHeader("X-Request-Id")
  });
}

function actor(req: Request): Actor | null {
  const userId = req.header("x-user-id");
  const role = req.header("x-role");
  return userId && (role === "PATIENT" || role === "DOCTOR" || role === "STAFF" || role === "ADMIN")
    ? { userId, role }
    : null;
}

function requiredInternalToken(variable: string): string {
  const token = process.env[variable];
  if (!token || Buffer.byteLength(token, "utf8") < 32) throw new Error(`${variable} is not configured`);
  return token;
}

const requireInternalToken: RequestHandler = (req, res, next) => {
  const appointmentToken = process.env.APPOINTMENT_RECORD_INTERNAL_API_TOKEN ?? "";
  const userToken = process.env.USER_RECORD_INTERNAL_API_TOKEN ?? "";
  const doctorToken = process.env.DOCTOR_INTERNAL_API_TOKEN ?? "";
  const received = req.header("X-Internal-Token") ?? "";

  const isValid = [appointmentToken, userToken, doctorToken].some(expected => {
    if (Buffer.byteLength(expected, "utf8") < 32 || Buffer.byteLength(expected, "utf8") !== Buffer.byteLength(received, "utf8")) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  });

  if (!isValid) return void fail(res, 401, "INTERNAL_AUTH_REQUIRED", "Internal credential required");
  next();
};

export function computeContentDigest(record: {
  symptoms?: string | null;
  diagnosis?: string | null;
  notes?: string | null;
  treatmentPlan?: string | null;
  prescription?: PrescriptionItem[];
}): string {
  const norm = {
    diagnosis: record.diagnosis ?? "",
    notes: record.notes ?? "",
    prescription: (record.prescription ?? []).map(p => ({
      dosage: p.dosage,
      duration: p.duration,
      frequency: p.frequency,
      medicineName: p.medicineName
    })).sort((a, b) => a.medicineName.localeCompare(b.medicineName)),
    symptoms: record.symptoms ?? "",
    treatmentPlan: record.treatmentPlan ?? ""
  };
  return createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

async function internalGet<T>(url: string, token?: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: token ? { "X-Internal-Token": token } : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(4000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Internal lookup failed: ${response.status}`);
  const body = await response.json() as { success: boolean; data: T };
  if (!body.success || !body.data) throw new Error("Invalid internal response");
  return body.data;
}

const patientByUser = (id: string) => internalGet<{ id: string; userId: string }>(
  `${userUrl}/internal/v1/patients/by-user/${encodeURIComponent(id)}`,
  requiredInternalToken("USER_RECORD_INTERNAL_API_TOKEN")
);

const patientById = (id: string) => internalGet<{ id: string; userId: string }>(
  `${userUrl}/internal/v1/patients/${encodeURIComponent(id)}`,
  requiredInternalToken("USER_RECORD_INTERNAL_API_TOKEN")
);

const doctorByUser = (id: string) => internalGet<{ id: string; userId: string; isActive: boolean }>(
  `${doctorUrl}/internal/v1/doctors/by-user/${encodeURIComponent(id)}`,
  requiredInternalToken("DOCTOR_INTERNAL_API_TOKEN")
);

async function appointment(id: string) {
  const result = await internalGet<{ valid: boolean; appointment: Appointment }>(
    `${appointmentUrl}/internal/v1/appointments/${encodeURIComponent(id)}/verify-for-medical-record`,
    requiredInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN")
  );
  return result?.valid ? result.appointment : null;
}

async function appointmentEligibility(id: string): Promise<Appointment | null> {
  const token = requiredInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN");
  try {
    const postRes = await fetch(`${appointmentUrl}/internal/v1/appointments/${encodeURIComponent(id)}/check-eligibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(4000)
    });
    if (postRes.ok) {
      const data = await postRes.json() as { success?: boolean; data?: { eligible?: boolean; status?: string; doctorId?: string; patientId?: string } };
      if (data.data?.status && data.data?.doctorId && data.data?.patientId) {
        return { id, patientId: data.data.patientId, doctorId: data.data.doctorId, status: data.data.status };
      }
    }
  } catch {
    // fallback to verify-for-medical-record
  }
  return appointment(id);
}

async function allowedDoctor(userId: string, doctorId: string) {
  const doctor = await doctorByUser(userId);
  return doctor?.isActive && doctor.id === doctorId;
}

export async function verifyMfaProof(params: {
  proofId: string;
  purpose: "OPEN_CLINICAL_RECORDS" | "FINALIZE_MEDICAL_RECORD";
  actorUserId: string;
  sessionId: string;
  context: Record<string, unknown>;
}): Promise<{ valid: boolean; reason?: string }> {
  try {
    const response = await fetch(`${userUrl}/internal/v1/auth/mfa/proofs/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": requiredInternalToken("USER_RECORD_INTERNAL_API_TOKEN")
      },
      body: JSON.stringify({
        proofId: params.proofId,
        proof_token: params.proofId,
        purpose: params.purpose,
        actorUserId: params.actorUserId,
        actor_id: params.actorUserId,
        sessionId: params.sessionId,
        session_id: params.sessionId,
        context: params.context
      }),
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return { valid: false, reason: "PROOF_INVALID" };
      }
      throw new Error(`User Service proof verify returned ${response.status}`);
    }
    const body = await response.json() as { success?: boolean; data?: { valid?: boolean; reason?: string } };
    return { valid: body.success === true && body.data?.valid === true, reason: body.data?.reason };
  } catch (error) {
    if (error instanceof Error && error.message.includes("User Service proof verify returned")) throw error;
    throw new Error(`User Service unavailable: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

export async function sendOutbox() {
  const events = await repository.claimOutbox();
  for (const event of events) {
    try {
      if (event.eventType === "medical-record.created" || event.eventType === "medical-record.updated") {
        const response = await fetch(`${notificationUrl}/internal/v1/notifications`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": event.id,
            "X-Internal-Token": requiredInternalToken("NOTIFICATION_INTERNAL_API_TOKEN")
          },
          body: JSON.stringify({ eventId: event.id, type: event.eventType, payload: event.payload }),
          signal: AbortSignal.timeout(4000)
        });
        if (!response.ok) throw new Error(`Notification returned ${response.status}`);
      } else if (event.eventType === "appointment.complete") {
        const id = String(event.payload.appointmentId);
        const recordId = String(event.payload.recordId ?? event.aggregateId);
        const completionBody: Record<string, unknown> = { recordId };
        if (event.payload.doctorId) completionBody.doctor_id = event.payload.doctorId;
        if (event.payload.proofId) completionBody.proof_token = event.payload.proofId;
        const response = await fetch(`${appointmentUrl}/internal/v1/appointments/${encodeURIComponent(id)}/complete-from-record`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": event.id,
            "X-Internal-Token": requiredInternalToken("APPOINTMENT_RECORD_INTERNAL_API_TOKEN")
          },
          body: JSON.stringify(completionBody),
          redirect: "error",
          signal: AbortSignal.timeout(4000)
        });
        if (!response.ok) throw new Error(`Appointment returned ${response.status}`);
        // Mark appointment completion as COMPLETED in record repository
        if (typeof repository.markAppointmentCompletion === "function") {
          await repository.markAppointmentCompletion(recordId, "COMPLETED");
        }
      }
      await repository.markOutboxSent(event.id);
    } catch {
      logServiceEvent("medical-record-service", "warn", "outbox.delivery_deferred", {
        eventType: event.eventType,
        code: "OUTBOX_DELIVERY_UNAVAILABLE"
      });
      await repository.deferOutbox(event.id, event.retryCount);
    }
  }
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({
      success: true,
      data: {
        service: "medical-record-service",
        status: "ok",
        outbox: await repository.outboxStatusCounts()
      }
    });
  } catch {
    return fail(res, 503, "DATABASE_UNAVAILABLE", "Database is unavailable");
  }
});

app.get("/openapi.json", (_req, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapi));

// 1. POST /api/v1/medical-records/access-grants
app.post("/api/v1/medical-records/access-grants", async (req, res, next) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Doctor role required for clinical grants");

  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid grant request parameters");

  try {
    const doctor = await doctorByUser(who.userId);
    if (!doctor || !doctor.isActive) return fail(res, 403, "ACCESS_DENIED", "Active doctor profile required");

    // Check appointment eligibility
    const booking = await appointmentEligibility(parsed.data.appointmentId);
    if (!booking) return fail(res, 422, "APPOINTMENT_NOT_ELIGIBLE", "Appointment not found or invalid");
    if (booking.doctorId !== doctor.id || booking.patientId !== parsed.data.patientId) {
      return fail(res, 403, "ACCESS_DENIED", "Doctor or patient does not match appointment assignment");
    }
    if (!["CHECKED_IN", "CONFIRMED"].includes(booking.status)) {
      return fail(res, 422, "APPOINTMENT_NOT_ELIGIBLE", `Appointment status ${booking.status} is not eligible for encounter grant`);
    }

    // Verify MFA TOTP proof with User Service
    const sessionId = req.header("x-session-id") ?? who.userId;
    const proof = await verifyMfaProof({
      proofId: parsed.data.verificationProofId,
      purpose: "OPEN_CLINICAL_RECORDS",
      actorUserId: who.userId,
      sessionId,
      context: {
        appointmentId: parsed.data.appointmentId,
        patientId: parsed.data.patientId,
        accessMode: parsed.data.accessMode
      }
    });
    if (!proof.valid) {
      return fail(res, 403, "CLINICAL_VERIFICATION_REQUIRED", "Valid TOTP MFA proof required for clinical grant");
    }

    // Issue grant (15m TTL)
    const grant = await repository.createGrant({
      sessionId,
      doctorId: doctor.id,
      patientId: parsed.data.patientId,
      appointmentId: parsed.data.appointmentId,
      recordId: parsed.data.recordId ?? null,
      accessMode: parsed.data.accessMode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    return res.status(201).json({ success: true, data: grant });
  } catch (error) {
    next(error);
  }
});

// 2. POST /api/v1/medical-records/finalization-contexts
app.post("/api/v1/medical-records/finalization-contexts", async (req, res, next) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Doctor role required");

  const parsed = finalizationContextSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid finalization context payload");

  try {
    const doctor = await doctorByUser(who.userId);
    if (!doctor || !doctor.isActive) return fail(res, 403, "ACCESS_DENIED", "Active doctor profile required");

    const booking = await appointmentEligibility(parsed.data.appointmentId);
    if (!booking) return fail(res, 422, "APPOINTMENT_NOT_ELIGIBLE", "Appointment not found");
    if (booking.doctorId !== doctor.id) return fail(res, 403, "ACCESS_DENIED", "Doctor does not match appointment");

    if (parsed.data.recordId) {
      const existing = await repository.findById(parsed.data.recordId);
      if (!existing) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
      if (existing.doctorId !== doctor.id) return fail(res, 403, "ACCESS_DENIED", "Doctor does not own this record");
      if (existing.status === "FINAL") return fail(res, 409, "MEDICAL_RECORD_FINAL", "Record is already FINAL");
      if (existing.version !== parsed.data.expectedVersion) {
        return fail(res, 409, "RECORD_VERSION_CONFLICT", "Record version conflict");
      }
    } else {
      if (parsed.data.expectedVersion !== 0) {
        return fail(res, 400, "VALIDATION_ERROR", "expectedVersion must be 0 for new record finalization");
      }
      const existingByAppt = await repository.findByAppointmentId(parsed.data.appointmentId);
      if (existingByAppt) {
        return fail(res, 409, "MEDICAL_RECORD_ALREADY_EXISTS", "Record already exists for appointment");
      }
    }

    const contentDigest = computeContentDigest(parsed.data.record);
    const sessionId = req.header("x-session-id") ?? who.userId;
    const context = await repository.createFinalizationContext({
      appointmentId: parsed.data.appointmentId,
      recordId: parsed.data.recordId ?? null,
      doctorId: doctor.id,
      patientId: booking.patientId,
      sessionId,
      expectedVersion: parsed.data.expectedVersion,
      contentDigest,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    return res.status(201).json({
      success: true,
      data: {
        contextId: context.id,
        appointmentId: context.appointmentId,
        recordId: context.recordId,
        expectedVersion: context.expectedVersion,
        contentDigest: context.contentDigest,
        expiresAt: context.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /internal/v1/medical-records/access-grants/verify
app.post("/internal/v1/medical-records/access-grants/verify", (req, res, next) => {
  const expected = process.env.RECORD_APPOINTMENT_INTERNAL_API_TOKEN ?? "";
  const received = req.header("X-Internal-Token") ?? "";
  if (Buffer.byteLength(expected, "utf8") < 32 || Buffer.byteLength(expected, "utf8") !== Buffer.byteLength(received, "utf8") ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(received)))
    return void fail(res, 401, "INTERNAL_AUTH_REQUIRED", "Appointment internal credential required");
  next();
}, async (req, res, next) => {
  const { grantId, patientId, appointmentId, doctorId, sessionId } = req.body as {
    grantId?: string;
    patientId?: string;
    appointmentId?: string;
    doctorId?: string;
    sessionId?: string;
  };
  if (!grantId || !patientId || !appointmentId || !doctorId || !sessionId)
    return fail(res, 400, "VALIDATION_ERROR", "Grant, patient, appointment, doctor and session are required");

  try {
    const grant = await repository.findGrantById(grantId);
    if (!grant) {
      return res.json({ success: true, data: { valid: false, reason: "GRANT_NOT_FOUND_OR_EXPIRED" } });
    }
    if (patientId && grant.patientId !== patientId) {
      return res.json({ success: true, data: { valid: false, reason: "PATIENT_MISMATCH" } });
    }
    if (appointmentId && grant.appointmentId !== appointmentId) {
      return res.json({ success: true, data: { valid: false, reason: "APPOINTMENT_MISMATCH" } });
    }
    if (doctorId && grant.doctorId !== doctorId) {
      return res.json({ success: true, data: { valid: false, reason: "DOCTOR_MISMATCH" } });
    }
    if (sessionId && grant.sessionId !== sessionId) {
      return res.json({ success: true, data: { valid: false, reason: "SESSION_MISMATCH" } });
    }
    return res.json({
      success: true,
      data: { valid: true, accessMode: grant.accessMode, expiresAt: grant.expiresAt }
    });
  } catch (error) {
    next(error);
  }
});

// 4. GET /internal/v1/medical-records/by-appointment/:appointmentId
app.get("/internal/v1/medical-records/by-appointment/:appointmentId", requireInternalToken, async (req, res, next) => {
  try {
    const record = await repository.findByAppointmentId(String(req.params.appointmentId));
    if (!record) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
    const { id, appointmentId, patientId, doctorId, status, version, appointmentCompletion, createdBy, updatedBy } = record;
    return res.json({
      success: true,
      data: { id, appointmentId, patientId, doctorId, status, version, appointmentCompletion, createdBy, updatedBy }
    });
  } catch (error) {
    next(error);
  }
});

// 5. GET /api/v1/medical-records (Access control read gate)
app.get("/api/v1/medical-records", async (req, res, next) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role === "STAFF" || who.role === "ADMIN") {
    return fail(res, 403, "ACCESS_DENIED", "Staff and Admin roles do not have clinical record read access");
  }

  const parsed = pagingSchema.safeParse(req.query);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid pagination or query parameters");

  try {
    if (who.role === "PATIENT") {
      const patient = await patientByUser(who.userId);
      if (!patient || (parsed.data.patientId && parsed.data.patientId !== patient.id)) {
        return fail(res, 403, "ACCESS_DENIED", "Patient record access denied");
      }
      const result = await repository.findAll({
        patientId: patient.id,
        appointmentId: parsed.data.appointmentId,
        status: "FINAL"
      }, parsed.data.page, parsed.data.limit, "detail");
      return res.json({ success: true, data: result });
    }

    if (who.role === "DOCTOR") {
      const doctor = await doctorByUser(who.userId);
      if (!doctor || !doctor.isActive) return fail(res, 403, "ACCESS_DENIED", "Doctor record access denied");

      const scope = parsed.data.scope ?? "authored";
      const view = parsed.data.view ?? (scope === "authored" ? "summary" : "detail");

      if (scope === "authored") {
        if (parsed.data.doctorId && parsed.data.doctorId !== doctor.id) {
          return fail(res, 403, "ACCESS_DENIED", "Doctor cannot view authored records of another doctor");
        }
        const result = await repository.findAll({
          doctorId: doctor.id,
          patientId: parsed.data.patientId,
          appointmentId: parsed.data.appointmentId,
          status: parsed.data.status
        }, parsed.data.page, parsed.data.limit, view);
        return res.json({ success: true, data: result });
      }

      if (scope === "patient-history") {
        if (!parsed.data.patientId) {
          return fail(res, 400, "VALIDATION_ERROR", "patientId is required for patient-history scope");
        }
        if (view === "detail") {
          const grantId = req.header("x-clinical-grant");
          if (!grantId) {
            return fail(res, 403, "CLINICAL_VERIFICATION_REQUIRED", "Clinical access grant required for patient history detail");
          }
          const grant = await repository.findGrantById(grantId);
          if (!grant || grant.doctorId !== doctor.id || grant.patientId !== parsed.data.patientId || grant.accessMode !== "CURRENT_ENCOUNTER") {
            return fail(res, 403, "CLINICAL_ACCESS_DENIED", "Valid and unexpired CURRENT_ENCOUNTER grant required");
          }
          const result = await repository.findAll({
            patientId: parsed.data.patientId,
            appointmentId: parsed.data.appointmentId,
            includeOtherDoctorsFinalForPatient: true,
            currentDoctorId: doctor.id
          }, parsed.data.page, parsed.data.limit, "detail");
          return res.json({ success: true, data: result });
        } else {
          // view=summary: history index
          const result = await repository.findAll({
            patientId: parsed.data.patientId,
            appointmentId: parsed.data.appointmentId,
            includeOtherDoctorsFinalForPatient: true,
            currentDoctorId: doctor.id
          }, parsed.data.page, parsed.data.limit, "summary");
          return res.json({ success: true, data: result });
        }
      }
    }

    return fail(res, 403, "ACCESS_DENIED", "Access denied");
  } catch (error) {
    next(error);
  }
});

// 6. POST /api/v1/medical-records/:id/finalize
app.post("/api/v1/medical-records/:id/finalize", async (req, res, next) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Doctor access required");

  const parsed = finalizeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid finalize request payload");

  try {
    const doctor = await doctorByUser(who.userId);
    if (!doctor || !doctor.isActive) return fail(res, 403, "ACCESS_DENIED", "Active doctor profile required");

    const existing = await repository.findById(req.params.id);
    if (!existing) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
    if (existing.doctorId !== doctor.id) return fail(res, 403, "ACCESS_DENIED", "Doctor does not own this record");
    if (existing.status === "FINAL") return fail(res, 409, "MEDICAL_RECORD_FINAL", "Final record is immutable");
    if (existing.version !== parsed.data.expectedVersion) {
      return fail(res, 409, "RECORD_VERSION_CONFLICT", "Record version conflict");
    }

    const context = await repository.findFinalizationContext(parsed.data.contextId);
    if (!context) return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Finalization context not found or expired");
    if (context.recordId && context.recordId !== existing.id) {
      return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Finalization context record mismatch");
    }
    if (context.doctorId !== doctor.id) return fail(res, 403, "ACCESS_DENIED", "Context doctor mismatch");
    if (context.expectedVersion !== parsed.data.expectedVersion) {
      return fail(res, 409, "RECORD_VERSION_CONFLICT", "Context expected version mismatch");
    }

    const candidate = parsed.data.record ? { ...existing, ...parsed.data.record } : existing;
    const currentDigest = computeContentDigest(candidate);
    if (currentDigest !== context.contentDigest) {
      return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Clinical content or prescription changed after context was issued");
    }

    // Verify proof with User Service
    const sessionId = req.header("x-session-id") ?? who.userId;
    const proof = await verifyMfaProof({
      proofId: parsed.data.verificationProofId,
      purpose: "FINALIZE_MEDICAL_RECORD",
      actorUserId: who.userId,
      sessionId,
      context: {
        contextId: context.id,
        recordId: existing.id,
        contentDigest: context.contentDigest
      }
    });
    if (!proof.valid) {
      return fail(res, 403, "CLINICAL_VERIFICATION_REQUIRED", "Valid FINALIZE proof required");
    }

    const patient = await patientById(existing.patientId);
    if (!patient) return fail(res, 422, "PATIENT_NOT_FOUND", "Patient profile does not exist");

    const finalResult = await repository.finalizeRecord({
      recordId: existing.id,
      expectedVersion: parsed.data.expectedVersion,
      proofId: parsed.data.verificationProofId,
      contextId: context.id,
      actorId: who.userId,
      recipientUserId: patient.userId,
      updates: parsed.data.record
    });

    if ("conflict" in finalResult) {
      if (finalResult.conflict === "PROOF_ALREADY_CONSUMED") {
        return fail(res, 409, "PROOF_ALREADY_CONSUMED", "Verification proof has already been used");
      }
      if (finalResult.conflict === "VERSION_CONFLICT") {
        return fail(res, 409, "RECORD_VERSION_CONFLICT", "Record version conflict");
      }
      return fail(res, 409, "MEDICAL_RECORD_FINAL", "Record is already FINAL");
    }
    if ("notFound" in finalResult) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");

    return res.json({ success: true, data: finalResult.record });
  } catch (error) {
    next(error);
  }
});

// 7. GET /api/v1/medical-records/:id
app.get("/api/v1/medical-records/:id", async (req, res, next) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role === "STAFF" || who.role === "ADMIN") {
    return fail(res, 403, "ACCESS_DENIED", "Access denied for Staff/Admin");
  }

  try {
    const record = await repository.findById(req.params.id);
    if (!record) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");

    if (who.role === "PATIENT") {
      if (record.status !== "FINAL") return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
      const patient = await patientByUser(who.userId);
      if (patient?.id !== record.patientId) return fail(res, 403, "ACCESS_DENIED", "Access denied");
      return res.json({ success: true, data: record });
    }

    if (who.role === "DOCTOR") {
      const doctor = await doctorByUser(who.userId);
      if (!doctor || !doctor.isActive) return fail(res, 403, "ACCESS_DENIED", "Access denied");

      if (record.doctorId === doctor.id) {
        return res.json({ success: true, data: record });
      }

      // Other doctor's record: requires grant and must be FINAL
      if (record.status !== "FINAL") {
        return fail(res, 403, "CLINICAL_ACCESS_DENIED", "Draft records of other doctors cannot be accessed");
      }
      const grantId = req.header("x-clinical-grant");
      if (!grantId) {
        return fail(res, 403, "CLINICAL_VERIFICATION_REQUIRED", "Clinical access grant required to view another doctor's record");
      }
      const grant = await repository.findGrantById(grantId);
      if (!grant || grant.doctorId !== doctor.id || grant.patientId !== record.patientId || grant.accessMode !== "CURRENT_ENCOUNTER") {
        return fail(res, 403, "CLINICAL_ACCESS_DENIED", "Valid CURRENT_ENCOUNTER grant required");
      }
      return res.json({ success: true, data: record });
    }

    return fail(res, 403, "ACCESS_DENIED", "Access denied");
  } catch (error) {
    next(error);
  }
});

// 8. POST /api/v1/medical-records
app.post("/api/v1/medical-records", async (req, res, next) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Doctor access required");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid medical record");

  try {
    const booking = await appointmentEligibility(parsed.data.appointmentId);
    if (!booking || !["CHECKED_IN", "COMPLETED"].includes(booking.status)) {
      return fail(res, 422, "APPOINTMENT_NOT_ELIGIBLE", "Appointment is not eligible");
    }
    if (booking.patientId !== parsed.data.patientId || booking.doctorId !== parsed.data.doctorId || !(await allowedDoctor(who.userId, booking.doctorId))) {
      return fail(res, 403, "ACCESS_DENIED", "Doctor or patient does not match appointment");
    }
    const patient = await patientById(booking.patientId);
    if (!patient) return fail(res, 422, "PATIENT_NOT_FOUND", "Patient profile does not exist");

    if (parsed.data.status === "FINAL") {
      // POST directly as FINAL requires proof & context
      if (!parsed.data.verificationProofId || !parsed.data.contextId) {
        return fail(res, 400, "VALIDATION_ERROR", "Creating FINAL record directly requires verificationProofId and contextId");
      }
      const context = await repository.findFinalizationContext(parsed.data.contextId);
      if (!context) return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Finalization context not found or expired");
      const contentDigest = computeContentDigest(parsed.data);
      if (contentDigest !== context.contentDigest) {
        return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Content digest mismatch");
      }
      const proof = await verifyMfaProof({
        proofId: parsed.data.verificationProofId,
        purpose: "FINALIZE_MEDICAL_RECORD",
        actorUserId: who.userId,
        sessionId: req.header("x-session-id") ?? who.userId,
        context: { contextId: context.id, contentDigest }
      });
      if (!proof.valid) return fail(res, 403, "CLINICAL_VERIFICATION_REQUIRED", "Valid proof required");
    }

    const record = await repository.create({
      ...parsed.data,
      createdBy: who.userId,
      version: 1,
      appointmentCompletion: parsed.data.status === "FINAL" ? "PENDING" : "NOT_REQUESTED"
    }, patient.userId);
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return fail(res, 409, "MEDICAL_RECORD_ALREADY_EXISTS", "Record already exists for appointment");
    }
    next(error);
  }
});

// 9. PATCH /api/v1/medical-records/:id
app.patch("/api/v1/medical-records/:id", async (req, res, next) => {
  const who = actor(req);
  if (!who) return fail(res, 401, "AUTH_REQUIRED", "Authentication required");
  if (who.role !== "DOCTOR") return fail(res, 403, "ACCESS_DENIED", "Doctor access required");

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid update");

  try {
    const existing = await repository.findById(req.params.id);
    if (!existing) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
    if (!(await allowedDoctor(who.userId, existing.doctorId))) return fail(res, 403, "ACCESS_DENIED", "Access denied");

    // If finalizing via PATCH
    if (parsed.data.status === "FINAL") {
      if (!parsed.data.verificationProofId || !parsed.data.contextId || parsed.data.expectedVersion === undefined) {
        return fail(res, 400, "VALIDATION_ERROR", "Finalizing via PATCH requires verificationProofId, contextId, and expectedVersion");
      }
      const context = await repository.findFinalizationContext(parsed.data.contextId);
      if (!context) return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Finalization context not found or expired");
      if (context.recordId && context.recordId !== existing.id) {
        return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Context record mismatch");
      }
      const candidate = {
        symptoms: parsed.data.symptoms !== undefined ? parsed.data.symptoms : existing.symptoms,
        diagnosis: parsed.data.diagnosis !== undefined ? parsed.data.diagnosis : existing.diagnosis,
        notes: parsed.data.notes !== undefined ? parsed.data.notes : existing.notes,
        treatmentPlan: parsed.data.treatmentPlan !== undefined ? parsed.data.treatmentPlan : existing.treatmentPlan,
        prescription: parsed.data.prescription !== undefined ? parsed.data.prescription : existing.prescription
      };
      const digest = computeContentDigest(candidate);
      if (digest !== context.contentDigest) {
        return fail(res, 409, "FINALIZATION_CONTEXT_CHANGED", "Clinical content or prescription changed after context was issued");
      }
      const proof = await verifyMfaProof({
        proofId: parsed.data.verificationProofId,
        purpose: "FINALIZE_MEDICAL_RECORD",
        actorUserId: who.userId,
        sessionId: req.header("x-session-id") ?? who.userId,
        context: { contextId: context.id, recordId: existing.id, contentDigest: digest }
      });
      if (!proof.valid) return fail(res, 403, "CLINICAL_VERIFICATION_REQUIRED", "Valid proof required");

      const patient = await patientById(existing.patientId);
      if (!patient) return fail(res, 422, "PATIENT_NOT_FOUND", "Patient profile does not exist");

      const finalResult = await repository.finalizeRecord({
        recordId: existing.id,
        expectedVersion: parsed.data.expectedVersion,
        proofId: parsed.data.verificationProofId,
        contextId: context.id,
        actorId: who.userId,
        recipientUserId: patient.userId,
        updates: parsed.data
      });

      if ("conflict" in finalResult) {
        if (finalResult.conflict === "PROOF_ALREADY_CONSUMED") return fail(res, 409, "PROOF_ALREADY_CONSUMED", "Proof already used");
        if (finalResult.conflict === "VERSION_CONFLICT") return fail(res, 409, "RECORD_VERSION_CONFLICT", "Version conflict");
        return fail(res, 409, "MEDICAL_RECORD_FINAL", "Record already FINAL");
      }
      if ("notFound" in finalResult) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
      return res.json({ success: true, data: finalResult.record });
    }

    // Normal draft update
    const patient = await patientById(existing.patientId);
    if (!patient) return fail(res, 422, "PATIENT_NOT_FOUND", "Patient profile does not exist");

    const result = await repository.update(existing.id, parsed.data, who.userId, patient.userId, parsed.data.expectedVersion);
    if (result && "conflict" in result) {
      if (result.reason === "RECORD_VERSION_CONFLICT") {
        return fail(res, 409, "RECORD_VERSION_CONFLICT", "Record version conflict");
      }
      return fail(res, 409, "MEDICAL_RECORD_FINAL", "Final record cannot return to draft");
    }
    if (!result || !("record" in result)) return fail(res, 404, "MEDICAL_RECORD_NOT_FOUND", "Record not found");
    return res.json({ success: true, data: result.record });
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/")) return fail(res, 404, "ROUTE_NOT_FOUND", "Route not found");
  next();
});

app.use((error: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
  logServiceEvent("medical-record-service", "error", "request.failed", {
    requestId: String(res.getHeader("X-Request-Id") ?? ""),
    code: error instanceof Error ? error.name : "INTERNAL_SERVER_ERROR"
  });
  return fail(res, 503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
});

if (process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => {
    void sendOutbox().catch(() => logServiceEvent("medical-record-service", "error", "outbox.poll_failed"));
  }, 5000);
  timer.unref();
  app.listen(port, () => logServiceEvent("medical-record-service", "info", "service.started", { port }));
}
