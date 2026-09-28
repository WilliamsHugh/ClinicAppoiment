import cors from "cors";
import express from "express";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { createAuthRouter, createInternalVerifyHandler, createSupabaseAuthProvider } from "./auth.js";
import { createPatientScopeVerifier } from "./patient-scope.js";
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
const patientScope = createPatientScopeVerifier({
  doctorServiceUrl: process.env.DOCTOR_SERVICE_URL ?? "http://localhost:3002",
  appointmentServiceUrl: process.env.APPOINTMENT_SERVICE_URL ?? "http://localhost:3003",
});

const idSchema = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const updateOwnUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 .-]{7,19}$/).nullable().optional()
}).strict();

const updatePatientSchema = z.object({
  dateOfBirth: z.string().date().nullable().optional(),
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

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "User Service API", version: "0.1.0", description: "Quản lý xác thực, người dùng và hồ sơ bệnh nhân" },
  paths: {
    "/health": { get: { summary: "Kiểm tra tình trạng service" } },
    "/api/v1/auth/register": { post: { summary: "Đăng ký tài khoản bệnh nhân (PATIENT)" } },
    "/api/v1/auth/login": { post: { summary: "Đăng nhập hệ thống" } },
    "/api/v1/auth/refresh": { post: { summary: "Làm mới access token bằng refresh token" } },
    "/api/v1/auth/logout": { post: { summary: "Đăng xuất và hủy phiên" } },
    "/api/v1/auth/me": { get: { summary: "Lấy thông tin tài khoản hiện tại" } },
    "/api/v1/users": { get: { summary: "Danh sách người dùng (ADMIN)" } },
    "/api/v1/users/{id}": { get: { summary: "Xem chi tiết người dùng (ADMIN)" } },
    "/api/v1/users/{id}/status": { patch: { summary: "Cập nhật trạng thái người dùng (ADMIN)" } },
    "/api/v1/users/{id}/role": { patch: { summary: "Cập nhật vai trò người dùng (ADMIN)" } },
    "/api/v1/users/me": {
      get: { summary: "Xem hồ sơ cá nhân của người dùng hiện tại" },
      patch: { summary: "Cập nhật hồ sơ cá nhân của người dùng hiện tại" }
    },
    "/api/v1/patients": { get: { summary: "Tìm kiếm danh sách bệnh nhân (DOCTOR, STAFF, ADMIN)" } },
    "/api/v1/patients/{id}": {
      get: { summary: "Xem chi tiết hồ sơ bệnh nhân" },
      patch: { summary: "Cập nhật hồ sơ bệnh nhân (Bệnh nhân chính mình hoặc ADMIN)" }
    },
    "/internal/v1/auth/verify": { get: { summary: "Xác minh token nội bộ cho API Gateway" } },
    "/internal/v1/patients/by-user/{userId}": { get: { summary: "Lấy thông tin bệnh nhân qua User ID (Nội bộ)" } },
    "/internal/v1/patients/{id}": { get: { summary: "Lấy thông tin bệnh nhân qua Patient ID (Nội bộ)" } }
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
  const parsed = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(String(req.params.id), { status: parsed.data.status });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(publicUser(user)));
});

app.patch("/api/v1/users/:id/role", requireRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({ role: z.enum(["PATIENT", "DOCTOR", "STAFF", "ADMIN"]) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(String(req.params.id), { role: parsed.data.role });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
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
    const patientId = await patientScope.patientIdForDoctorAppointment(who.userId, parsed.data.appointmentId);
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
    const scopedPatientId = await patientScope.patientIdForDoctorAppointment(who.userId, appointmentId.data);
    if (scopedPatientId !== patient.id) {
      return res.status(403).json(error("PATIENT_SCOPE_DENIED", "Patient is outside the doctor's appointment scope"));
    }
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
  console.error("User Service request failed", err instanceof Error ? err.message : "Unknown error");
  return res.status(503).json(error("SERVICE_UNAVAILABLE", "User Service is temporarily unavailable"));
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`User Service listening on port ${port}`);
  });
}
