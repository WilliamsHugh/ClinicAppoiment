import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { Pool, types } from "pg";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { createRequestLoggingMiddleware, logServiceEvent } from "@clinic/request-logging";
import { createAuthRouter, createInternalVerifyHandler, createSupabaseAuthProvider } from "./auth.js";
import { createDoctorEligibilityHandler } from "./doctor-eligibility.js";
import { internalCredentialsFromEnv, requireInternalCaller } from "./internal-auth.js";
import { createPatientLookupHandler, createBatchPatientLookupHandler } from "./internal-patients.js";
import { createPatientScopeVerifier, PatientScopeUnavailableError } from "./patient-scope.js";
import { UserRepository } from "./repository.js";
import { SessionService } from "./session-service.js";
import { MfaService } from "./mfa-service.js";
import type { InvalidationPayload } from "./types/invalidation-payload.js";
import type { MfaPurpose } from "./types/internal-proof-verify.js";
import { swaggerDocument } from "./openapi.js";

types.setTypeParser(1082, (val: string) => val);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required by User Service");
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
export const app = express();
const repository = new UserRepository(pool);
const sessionService = new SessionService(repository);
const mfaService = new MfaService(repository);
const authProviderTimeoutMs = Number(process.env.AUTH_PROVIDER_TIMEOUT_MS ?? 15_000);
if (!Number.isInteger(authProviderTimeoutMs) || authProviderTimeoutMs <= 0) {
  throw new Error("AUTH_PROVIDER_TIMEOUT_MS must be a positive integer");
}
const authProvider = createSupabaseAuthProvider(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  authProviderTimeoutMs
);
const port = Number(process.env.USER_SERVICE_PORT ?? 3001);
const internalCredentials = internalCredentialsFromEnv();
const patientScope = createPatientScopeVerifier({
  doctorServiceUrl: process.env.DOCTOR_SERVICE_URL ?? "http://localhost:3002",
  appointmentServiceUrl: process.env.APPOINTMENT_SERVICE_URL ?? "http://localhost:3003",
  doctorInternalToken: process.env.DOCTOR_USER_INTERNAL_API_TOKEN,
  appointmentInternalToken: process.env.APPOINTMENT_USER_INTERNAL_API_TOKEN,
  reservedTokens: Object.values(internalCredentials).filter((token): token is string => Boolean(token)),
});

const idSchema = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const updateOwnUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 .-]{7,19}$/).nullable().optional()
}).strict();

const updatePatientSchema = z.object({
  dateOfBirth: z.preprocess(
    (val) => (typeof val === "string" && val.includes("T") ? val.split("T")[0] : val),
    z.string().date().nullable().optional(),
  ),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
  address: optionalText(500),
  emergencyContact: optionalText(120),
  insuranceNumber: optionalText(50)
}).strict();

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(["PATIENT", "DOCTOR", "STAFF", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional(),
  q: z.string().trim().optional(),
});

const listPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  appointmentId: idSchema.optional(),
});

app.use(cors());
app.use(express.json());
app.use(createRequestLoggingMiddleware("user-service"));
app.get("/openapi.json", (_req, res) => res.json(swaggerDocument));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/v1/auth", createAuthRouter(authProvider, repository, sessionService, mfaService));
app.get("/internal/v1/auth/verify", requireInternalCaller(["gateway"], internalCredentials),
  createInternalVerifyHandler(authProvider, repository, sessionService));
app.get("/internal/v1/users/:userId/doctor-eligibility",
  requireInternalCaller(["doctor"], internalCredentials), createDoctorEligibilityHandler(repository));

app.post("/internal/v1/auth/invalidate",
  requireInternalCaller(["gateway"], internalCredentials),
  async (req, res) => {
    const payload = req.body as InvalidationPayload;
    if (!payload || !payload.userId || !payload.scope) {
      return res.status(400).json(error("VALIDATION_ERROR", "Invalid invalidation payload"));
    }
    if (payload.scope === "ALL" || payload.scope === "ACCOUNT") {
      await sessionService.revokeAllUserSessions(payload.userId);
    } else if (payload.sessionId) {
      await sessionService.revokeSession(payload.sessionId);
    }
    return res.json(success({ processed: true, payload }));
  });

const handleInternalProofVerify: express.RequestHandler = async (req, res) => {
  const proofId = (req.body?.proofId ?? req.body?.proof_token) as string | undefined;
  const purpose = req.body?.purpose as MfaPurpose | undefined;
  const actorUserId = (req.body?.actorUserId ?? req.body?.actor_id) as string | undefined;
  const sessionId = (req.body?.sessionId ?? req.body?.session_id) as string | undefined;
  const context = req.body?.context as Record<string, unknown> | undefined;

  if (!proofId || !purpose || !actorUserId || !sessionId || !context || typeof context !== "object" || Array.isArray(context)) {
    return res.status(400).json(error("VALIDATION_ERROR", "proofId, purpose, actorUserId, sessionId and context are required"));
  }

  const result = await mfaService.verifyProof({
    proofId,
    purpose,
    actorUserId,
    sessionId,
    context,
  });

  if (!result.valid || !result.proof) {
    return res.json(success({
      valid: false,
      proofId,
      proof_token: proofId,
      purpose,
      reason: result.reason ?? "INVALID_PROOF",
    }));
  }

  return res.json(success({
    valid: true,
    proofId: result.proof.id,
    proof_token: result.proof.id,
    purpose: result.proof.purpose,
    expiresAt: result.proof.expiresAt,
    context: result.proof.context,
  }));
};

app.post("/internal/v1/auth/mfa/proofs/verify",
  requireInternalCaller(["gateway", "doctor", "record", "appointment"], internalCredentials),
  handleInternalProofVerify);
app.post("/internal/v1/mfa/verify-proof",
  requireInternalCaller(["gateway", "doctor", "record", "appointment"], internalCredentials),
  handleInternalProofVerify);

app.post("/internal/v1/patients/lookup",
  requireInternalCaller(["appointment", "record"], internalCredentials),
  createBatchPatientLookupHandler(repository));

function success<T>(data: T) {
  return { success: true, data };
}

function publicUser<T extends { supabaseAuthUserId: string }>(user: T): Omit<T, "supabaseAuthUserId"> {
  const { supabaseAuthUserId: _internalAuthId, ...safeUser } = user;
  return safeUser;
}

function error(code: string, message: string, details: unknown[] = []) {
  return { success: false, error: { code, message, details } };
}

function actor(req: express.Request) {
  const userId = req.header("x-user-id");
  const role = req.header("x-role");
  return userId && role ? { userId, role } : null;
}

function requireRoles(...roles: string[]): express.RequestHandler {
  return (req, res, next) => {
    const who = actor(req);
    if (!who) return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
    if (!roles.includes(who.role)) return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
    next();
  };
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json(success({ service: "user-service", status: "ok" }));
  } catch {
    return res.status(503).json(error("DATABASE_UNAVAILABLE", "Database is unavailable"));
  }
});

app.get("/api/v1/auth/me", async (req, res) => {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
  const user = await repository.findUserById(userId);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(publicUser(user)));
});

app.get("/api/v1/users/me", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
  const user = await repository.findUserById(userId);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  let patientProfile = null;
  if (user.role === "PATIENT") {
    patientProfile = await repository.findPatientByUserId(user.id);
  }
  return res.json(success({ ...publicUser(user), patientProfile }));
});

app.patch("/api/v1/users/me", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
  const parsed = updateOwnUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(userId, parsed.data);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(publicUser(user)));
});

app.get("/api/v1/users", requireRoles("ADMIN"), async (req, res) => {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues));
  }
  const result = await repository.findUsers(parsed.data);
  return res.json(success({ ...result, items: result.items.map(publicUser) }));
});

app.get("/api/v1/users/:id", requireRoles("ADMIN"), async (req, res) => {
  const user = await repository.findUserById(String(req.params.id));
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(publicUser(user)));
});

app.patch("/api/v1/users/:id/status", requireRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({
    status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]),
    verificationProofId: z.string().min(1, "verificationProofId is required"),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));

  const who = actor(req)!;
  const targetUserId = String(req.params.id);

  const proofVerify = await mfaService.verifyProof({
    proofId: parsed.data.verificationProofId,
    purpose: "AUTHORIZE_SENSITIVE_OPERATION",
    actorUserId: who.userId,
  });

  if (!proofVerify.valid || !proofVerify.proof) {
    return res.status(403).json(error("STEP_UP_MFA_REQUIRED", `MFA proof verification failed: ${proofVerify.reason ?? "invalid proof"}`));
  }

  const context = proofVerify.proof.context as Record<string, unknown> | undefined;
  if (context) {
    if (context.operation && context.operation !== "UPDATE_USER_STATUS") {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context operation mismatch"));
    }
    if (context.targetUserId && context.targetUserId !== targetUserId) {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context target user mismatch"));
    }
    if (context.resource && context.resource !== targetUserId) {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context resource mismatch"));
    }
    if (context.status && context.status !== parsed.data.status) {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context status mismatch"));
    }
  }

  const consumed = await mfaService.consumeProof(proofVerify.proof.id, "user-service");
  if (!consumed) {
    return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "MFA proof already consumed"));
  }

  const user = await repository.updateUser(targetUserId, { status: parsed.data.status });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));

  if (parsed.data.status === "LOCKED" || parsed.data.status === "INACTIVE") {
    await sessionService.revokeAllUserSessions(user.id);
  }

  return res.json(success(publicUser(user)));
});

app.patch("/api/v1/users/:id/role", requireRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({
    role: z.enum(["PATIENT", "DOCTOR", "STAFF", "ADMIN"]),
    verificationProofId: z.string().min(1, "verificationProofId is required"),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));

  const who = actor(req)!;
  const targetUserId = String(req.params.id);

  const proofVerify = await mfaService.verifyProof({
    proofId: parsed.data.verificationProofId,
    purpose: "AUTHORIZE_SENSITIVE_OPERATION",
    actorUserId: who.userId,
  });

  if (!proofVerify.valid || !proofVerify.proof) {
    return res.status(403).json(error("STEP_UP_MFA_REQUIRED", `MFA proof verification failed: ${proofVerify.reason ?? "invalid proof"}`));
  }

  const context = proofVerify.proof.context as Record<string, unknown> | undefined;
  if (context) {
    if (context.operation && context.operation !== "UPDATE_USER_ROLE") {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context operation mismatch"));
    }
    if (context.targetUserId && context.targetUserId !== targetUserId) {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context target user mismatch"));
    }
    if (context.resource && context.resource !== targetUserId) {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context resource mismatch"));
    }
    if (context.role && context.role !== parsed.data.role) {
      return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "Proof context role mismatch"));
    }
  }

  const consumed = await mfaService.consumeProof(proofVerify.proof.id, "user-service");
  if (!consumed) {
    return res.status(403).json(error("STEP_UP_MFA_REQUIRED", "MFA proof already consumed"));
  }

  const user = await repository.updateUser(targetUserId, { role: parsed.data.role });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));

  // Invalidate all active sessions for the user so previous role grants cannot be reused
  await sessionService.revokeAllUserSessions(user.id);

  return res.json(success(publicUser(user)));
});

app.get("/api/v1/patients", requireRoles("DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = listPatientsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues));
  }
  const who = actor(req)!;
  if (who.role === "DOCTOR") {
    if (!parsed.data.appointmentId) {
      return res.status(400).json(error("APPOINTMENT_SCOPE_REQUIRED", "appointmentId is required for doctor patient access"));
    }
    const patientId = await patientScope.patientIdForDoctorAppointment(who.userId, parsed.data.appointmentId,
      req.header("X-Request-Id"));
    if (!patientId) {
      return res.status(403).json(error("PATIENT_SCOPE_DENIED", "Patient is outside the doctor's appointment scope"));
    }
    const result = await repository.findPatients({ ...parsed.data, patientId });
    return res.json(success(result));
  }
  const { appointmentId: _appointmentId, ...filter } = parsed.data;
  const result = await repository.findPatients(filter);
  return res.json(success(result));
});

app.get("/api/v1/patients/:id", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const patient = await repository.findPatientById(String(req.params.id));
  if (!patient) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  const who = actor(req)!;
  if (who.role === "PATIENT" && patient.userId !== who.userId) {
    return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
  }
  if (who.role === "DOCTOR") {
    const appointmentId = idSchema.safeParse(req.query.appointmentId);
    if (!appointmentId.success) {
      return res.status(400).json(error("APPOINTMENT_SCOPE_REQUIRED", "A valid appointmentId is required for doctor patient access"));
    }
    const scopedPatientId = await patientScope.patientIdForDoctorAppointment(who.userId, appointmentId.data,
      req.header("X-Request-Id"));
    if (scopedPatientId !== patient.id) {
      return res.status(403).json(error("PATIENT_SCOPE_DENIED", "Patient is outside the doctor's appointment scope"));
    }
  }
  return res.json(success(patient));
});

app.get("/internal/v1/patients/by-user/:userId",
  requireInternalCaller(["appointment", "record"], internalCredentials),
  createPatientLookupHandler(repository, "userId"));

app.get("/internal/v1/patients/:id",
  requireInternalCaller(["appointment", "record"], internalCredentials),
  createPatientLookupHandler(repository, "id"));

app.patch("/api/v1/patients/:id", requireRoles("PATIENT", "ADMIN"), async (req, res) => {
  const patientId = String(req.params.id);
  const parsed = updatePatientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const existing = await repository.findPatientById(patientId);
  if (!existing) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  const who = actor(req)!;
  if (who.role === "PATIENT" && existing.userId !== who.userId) {
    return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
  }
  const patient = await repository.updatePatient(patientId, parsed.data);
  if (!patient) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  return res.json(success(patient));
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/")) {
    return res.status(404).json(error("ROUTE_NOT_FOUND", "Route not found"));
  }
  next();
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof PatientScopeUnavailableError) {
    return res.status(503).json(error("PATIENT_SCOPE_UNAVAILABLE", "Patient scope verification is unavailable"));
  }
  logServiceEvent("user-service", "error", "request.failed", {
    requestId: res.getHeader("X-Request-Id")?.toString(),
    code: "SERVICE_UNAVAILABLE"
  });
  return res.status(503).json(error("SERVICE_UNAVAILABLE", "User Service is temporarily unavailable"));
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    logServiceEvent("user-service", "info", "service.started", { port });
  });
}
