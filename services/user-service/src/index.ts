import cors from "cors";
import express from "express";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { createAuthRouter, createInternalVerifyHandler, createSupabaseAuthProvider } from "./auth.js";
import { UserRepository } from "./repository.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required by User Service");
const databaseSsl = process.env.DATABASE_SSL === "true";
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl
    ? { rejectUnauthorized }
    : undefined,
});
export const app = express();
const repository = new UserRepository(pool);
const authProvider = createSupabaseAuthProvider(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const port = Number(process.env.USER_SERVICE_PORT ?? 3001);

const updateOwnUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional()
}).strict();

const updatePatientSchema = z.object({
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  insuranceNumber: z.string().optional()
});

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "User Service API", version: "0.1.0" },
  paths: {
    "/health": { get: { summary: "Health check" } },
    "/api/v1/auth/register": { post: { summary: "Register a patient account" } },
    "/api/v1/auth/login": { post: { summary: "Sign in" } },
    "/api/v1/auth/refresh": { post: { summary: "Refresh a session" } },
    "/api/v1/auth/logout": { post: { summary: "Revoke a session" } },
    "/api/v1/auth/me": { get: { summary: "Get current authenticated profile" } },
    "/api/v1/users": { get: { summary: "List users" } },
    "/api/v1/users/me": { get: { summary: "Get current user" }, patch: { summary: "Update current user" } },
    "/api/v1/patients": { get: { summary: "List patients" } }
  }
};

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});
app.get("/openapi.json", (_req, res) => res.json(swaggerDocument));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/v1/auth", createAuthRouter(authProvider, repository));
app.get("/internal/v1/auth/verify", createInternalVerifyHandler(authProvider, repository));

function success<T>(data: T) {
  return { success: true, data };
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
  return res.json(success(user));
});

app.get("/api/v1/users/me", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
  const user = await repository.findUserById(userId);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/me", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
  const parsed = updateOwnUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(userId, parsed.data);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.get("/api/v1/users", requireRoles("ADMIN"), async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const items = await repository.findUsers();
  return res.json(success({ items, page, limit, total: items.length }));
});

app.get("/api/v1/users/:id", requireRoles("ADMIN"), async (req, res) => {
  const user = await repository.findUserById(String(req.params.id));
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/:id/status", requireRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(String(req.params.id), { status: parsed.data.status });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/:id/role", requireRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({ role: z.enum(["PATIENT", "DOCTOR", "STAFF", "ADMIN"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(String(req.params.id), { role: parsed.data.role });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.get("/api/v1/patients", requireRoles("DOCTOR", "STAFF", "ADMIN"), async (_req, res) => {
  const items = await repository.findPatients();
  return res.json(success({ items, page: 1, limit: 20, total: items.length }));
});

app.get("/api/v1/patients/:id", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const patient = await repository.findPatientById(String(req.params.id));
  if (!patient) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  const who = actor(req)!;
  if (who.role === "PATIENT" && patient.userId !== who.userId) {
    return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
  }
  return res.json(success(patient));
});

app.get("/internal/v1/patients/by-user/:userId", async (req, res) => {
  const patient = await repository.findPatientByUserId(req.params.userId);
  if (!patient) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  return res.json(success({ id: patient.id, userId: patient.userId }));
});

app.get("/internal/v1/patients/:id", async (req, res) => {
  const patient = await repository.findPatientById(req.params.id);
  if (!patient) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  return res.json(success({ id: patient.id, userId: patient.userId }));
});

app.patch("/api/v1/patients/:id", requireRoles("PATIENT", "ADMIN"), async (req, res) => {
  const patientId = String(req.params.id);
  const existing = await repository.findPatientById(patientId);
  if (!existing) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  const who = actor(req)!;
  if (who.role === "PATIENT" && existing.userId !== who.userId) {
    return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
  }
  const parsed = updatePatientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
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
  console.error("User Service request failed", err instanceof Error ? err.message : "Unknown error");
  return res.status(503).json(error("SERVICE_UNAVAILABLE", "User Service is temporarily unavailable"));
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`User Service listening on port ${port}`);
  });
}
