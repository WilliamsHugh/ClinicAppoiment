import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { DoctorRepository } from "./repository.js";

const app = express();
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
});

const doctorSchema = z.object({
  userId: z.string().min(1),
  specialtyId: z.string().min(1),
  displayName: z.string().min(2),
  bio: z.string().optional()
});

const scheduleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  slotDurationMinutes: z.number().int().positive()
});

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

app.get("/health", (_req, res) => res.json(success({ service: "doctor-service", status: "ok" })));
app.get("/api/v1/specialties", (_req, res) => res.json(success(repository.findSpecialties())));
app.post("/api/v1/specialties", (req, res) => {
  const parsed = specialtySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.status(201).json(success(repository.createSpecialty(parsed.data)));
});
app.patch("/api/v1/specialties/:id", (req, res) => {
  const item = repository.updateSpecialty(req.params.id, req.body);
  if (!item) return res.status(404).json(error("SPECIALTY_NOT_FOUND", "Specialty not found"));
  return res.json(success(item));
});

app.get("/api/v1/doctors", (_req, res) => res.json(success(repository.findDoctors())));
app.post("/api/v1/doctors", (req, res) => {
  const parsed = doctorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.status(201).json(success(repository.createDoctor(parsed.data)));
});
app.get("/api/v1/doctors/:id", (req, res) => {
  const doctor = repository.findDoctorById(req.params.id);
  if (!doctor) return res.status(404).json(error("DOCTOR_NOT_FOUND", "Doctor not found"));
  return res.json(success(doctor));
});

app.get("/internal/v1/doctors/by-user/:userId", (req, res) => {
  const doctor = repository.findDoctorByUserId(req.params.userId);
  if (!doctor) return res.status(404).json(error("DOCTOR_NOT_FOUND", "Doctor not found"));
  return res.json(success({ id: doctor.id, userId: doctor.userId, isActive: doctor.isActive }));
});
app.patch("/api/v1/doctors/:id", (req, res) => {
  const doctor = repository.updateDoctor(req.params.id, req.body);
  if (!doctor) return res.status(404).json(error("DOCTOR_NOT_FOUND", "Doctor not found"));
  return res.json(success(doctor));
});
app.get("/api/v1/doctors/:id/schedules", (req, res) => res.json(success(repository.findSchedulesByDoctor(req.params.id))));
app.post("/api/v1/doctors/:id/schedules", (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.status(201).json(success(repository.createSchedule({ doctorId: req.params.id, ...parsed.data })));
});
app.patch("/api/v1/schedules/:id", (req, res) => {
  const schedule = repository.updateSchedule(req.params.id, req.body);
  if (!schedule) return res.status(404).json(error("SCHEDULE_NOT_FOUND", "Schedule not found"));
  return res.json(success(schedule));
});
app.get("/api/v1/doctors/:id/available-slots", (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  return res.json(success(repository.getAvailableSlots(req.params.id, date)));
});
app.post("/internal/v1/doctors/verify-slot", (req, res) => {
  const parsed = verifySlotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  return res.json(success(repository.verifySlot(parsed.data.doctorId, parsed.data.startAt, parsed.data.endAt)));
});

app.listen(port, () => {
  console.log(`Doctor Service listening on port ${port}`);
});
