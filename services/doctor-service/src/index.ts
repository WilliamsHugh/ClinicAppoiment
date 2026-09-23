import cors from "cors";
import express, { type RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { DoctorRepository } from "./repository.js";

export const app = express();
const repository = new DoctorRepository();
const port = Number(process.env.DOCTOR_SERVICE_PORT ?? 3002);

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Doctor Service API", version: "0.1.0" },
  paths: {
    "/api/v1/specialties": { get: { summary: "List specialties" }, post: { summary: "Create specialty" } },
    "/api/v1/doctors": { get: { summary: "List doctors" }, post: { summary: "Create doctor" } },
    "/api/v1/doctors/{id}/available-slots": { get: { summary: "List available slots" } },
    "/internal/v1/doctors/verify-slot": { post: { summary: "Verify doctor slot" } }
  }
};

const specialtySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional()
}).strict();
const updateSpecialtySchema = specialtySchema.partial().extend({
  isActive: z.boolean().optional()
}).strict();

const doctorSchema = z.object({
  userId: z.string().min(1),
  specialtyId: z.string().min(1),
  displayName: z.string().min(2),
  bio: z.string().optional()
}).strict();
const updateDoctorSchema = doctorSchema.omit({ userId: true }).partial().extend({
  isActive: z.boolean().optional()
}).strict();

const scheduleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  slotDurationMinutes: z.number().int().positive()
}).strict();
const updateScheduleSchema = scheduleSchema.partial().extend({
  isActive: z.boolean().optional()
}).strict();

const verifySlotSchema = z.object({
  doctorId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime()
});

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

function actor(req: express.Request) {
  const userId = req.header("x-user-id");
  const role = req.header("x-role");
  return userId && role ? { userId, role } : null;
}

function requireRoles(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    const who = actor(req);
    if (!who) return res.status(401).json(error("AUTH_REQUIRED", "Authentication required"));
    if (!roles.includes(who.role)) return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
    next();
  };
}

function canManageDoctor(req: express.Request, doctorId: string) {
  const who = actor(req)!;
  return who.role === "STAFF" || who.role === "ADMIN" ||
    (who.role === "DOCTOR" && repository.findDoctorByUserId(who.userId)?.id === doctorId);
}

app.get("/health", (_req, res) => res.json(success({ service: "doctor-service", status: "ok" })));
app.get("/api/v1/specialties", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), (_req, res) => res.json(success(repository.findSpecialties())));
app.post("/api/v1/specialties", requireRoles("ADMIN"), (req, res) => {
  const parsed = specialtySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.status(201).json(success(repository.createSpecialty(parsed.data)));
});
app.patch("/api/v1/specialties/:id", requireRoles("ADMIN"), (req, res) => {
  const parsed = updateSpecialtySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const item = repository.updateSpecialty(String(req.params.id), parsed.data);
  if (!item) return res.status(404).json(error("SPECIALTY_NOT_FOUND", "Specialty not found"));
  return res.json(success(item));
});

app.get("/api/v1/doctors", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), (_req, res) => res.json(success(repository.findDoctors())));
app.post("/api/v1/doctors", requireRoles("ADMIN"), (req, res) => {
  const parsed = doctorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.status(201).json(success(repository.createDoctor(parsed.data)));
});
app.get("/api/v1/doctors/:id", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), (req, res) => {
  const doctor = repository.findDoctorById(String(req.params.id));
  if (!doctor) return res.status(404).json(error("DOCTOR_NOT_FOUND", "Doctor not found"));
  return res.json(success(doctor));
});

app.get("/internal/v1/doctors/by-user/:userId", (req, res) => {
  const doctor = repository.findDoctorByUserId(req.params.userId);
  if (!doctor) return res.status(404).json(error("DOCTOR_NOT_FOUND", "Doctor not found"));
  return res.json(success({ id: doctor.id, userId: doctor.userId, isActive: doctor.isActive }));
});
app.patch("/api/v1/doctors/:id", requireRoles("ADMIN"), (req, res) => {
  const parsed = updateDoctorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const doctor = repository.updateDoctor(String(req.params.id), parsed.data);
  if (!doctor) return res.status(404).json(error("DOCTOR_NOT_FOUND", "Doctor not found"));
  return res.json(success(doctor));
});
app.get("/api/v1/doctors/:id/schedules", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), (req, res) => res.json(success(repository.findSchedulesByDoctor(String(req.params.id)))));
app.post("/api/v1/doctors/:id/schedules", requireRoles("DOCTOR", "STAFF", "ADMIN"), (req, res) => {
  const doctorId = String(req.params.id);
  if (!canManageDoctor(req, doctorId)) return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.status(201).json(success(repository.createSchedule({ doctorId, ...parsed.data })));
});
app.patch("/api/v1/schedules/:id", requireRoles("DOCTOR", "STAFF", "ADMIN"), (req, res) => {
  const scheduleId = String(req.params.id);
  const existing = repository.findScheduleById(scheduleId);
  if (!existing) return res.status(404).json(error("SCHEDULE_NOT_FOUND", "Schedule not found"));
  if (!canManageDoctor(req, existing.doctorId)) return res.status(403).json(error("ACCESS_DENIED", "Access denied"));
  const parsed = updateScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  const schedule = repository.updateSchedule(scheduleId, parsed.data);
  if (!schedule) return res.status(404).json(error("SCHEDULE_NOT_FOUND", "Schedule not found"));
  return res.json(success(schedule));
});
app.get("/api/v1/doctors/:id/available-slots", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  return res.json(success(repository.getAvailableSlots(String(req.params.id), date)));
});
app.post("/internal/v1/doctors/verify-slot", (req, res) => {
  const parsed = verifySlotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.json(success(repository.verifySlot(parsed.data.doctorId, parsed.data.startAt, parsed.data.endAt)));
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/")) {
    return res.status(404).json(error("ROUTE_NOT_FOUND", "Route not found"));
  }
  next();
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Doctor Service listening on port ${port}`);
  });
}
