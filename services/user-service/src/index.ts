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
export const repository = new UserRepository(pool);
export const authProvider = createSupabaseAuthProvider(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
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
  let patientProfile = null;
  if (user.role === "PATIENT") {
    patientProfile = await repository.findPatientByUserId(user.id);
  }
  return res.json(success({ ...user, patientProfile }));
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
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues));
  }
  const result = await repository.findUsers(parsed.data);
  return res.json(success(result));
});

app.get("/api/v1/users/:id", requireRoles("ADMIN"), async (req, res) => {
  const user = await repository.findUserById(String(req.params.id));
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/:id/status", requireRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(String(req.params.id), { status: parsed.data.status });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/:id/role", requireRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({ role: z.enum(["PATIENT", "DOCTOR", "STAFF", "ADMIN"]) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = await repository.updateUser(String(req.params.id), { role: parsed.data.role });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.get("/api/v1/patients", requireRoles("DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
  const parsed = listPatientsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(error("VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues));
  }
  const result = await repository.findPatients(parsed.data);
  return res.json(success(result));
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
