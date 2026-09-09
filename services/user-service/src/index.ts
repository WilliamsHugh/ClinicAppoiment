import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { UserRepository } from "./repository.js";

const app = express();
const repository = new UserRepository();
const port = Number(process.env.USER_SERVICE_PORT ?? 3001);

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional(),
  role: z.enum(["PATIENT", "DOCTOR", "STAFF", "ADMIN"]).optional()
});

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
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

function success<T>(data: T) {
  return { success: true, data };
}

function error(code: string, message: string, details: unknown[] = []) {
  return { success: false, error: { code, message, details } };
}

app.get("/health", (_req, res) => res.json(success({ service: "user-service", status: "ok" })));

app.get("/api/v1/auth/me", (req, res) => {
  const authUserId = req.header("x-supabase-auth-user-id") ?? "auth-patient-1";
  const user = repository.findUserByAuthId(authUserId);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.get("/api/v1/users/me", (req, res) => {
  const userId = req.header("x-user-id") ?? "user-patient-1";
  const user = repository.findUserById(userId);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/me", (req, res) => {
  const userId = req.header("x-user-id") ?? "user-patient-1";
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = repository.updateUser(userId, parsed.data);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.get("/api/v1/users", (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const items = repository.findUsers();
  return res.json(success({ items, page, limit, total: items.length }));
});

app.get("/api/v1/users/:id", (req, res) => {
  const user = repository.findUserById(req.params.id);
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/:id/status", (req, res) => {
  const parsed = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = repository.updateUser(req.params.id, { status: parsed.data.status });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.patch("/api/v1/users/:id/role", (req, res) => {
  const parsed = z.object({ role: z.enum(["PATIENT", "DOCTOR", "STAFF", "ADMIN"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const user = repository.updateUser(req.params.id, { role: parsed.data.role });
  if (!user) return res.status(404).json(error("USER_NOT_FOUND", "User not found"));
  return res.json(success(user));
});

app.get("/api/v1/patients", (_req, res) => {
  const items = repository.findPatients();
  return res.json(success({ items, page: 1, limit: 20, total: items.length }));
});

app.get("/api/v1/patients/:id", (req, res) => {
  const patient = repository.findPatientById(req.params.id);
  if (!patient) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  return res.json(success(patient));
});

app.patch("/api/v1/patients/:id", (req, res) => {
  const parsed = updatePatientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const patient = repository.updatePatient(req.params.id, parsed.data);
  if (!patient) return res.status(404).json(error("PATIENT_NOT_FOUND", "Patient not found"));
  return res.json(success(patient));
});

app.listen(port, () => {
  console.log(`User Service listening on port ${port}`);
});
