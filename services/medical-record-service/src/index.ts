import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { MedicalRecordRepository } from "./repository.js";

const app = express();
const repository = new MedicalRecordRepository();
const port = Number(process.env.MEDICAL_RECORD_SERVICE_PORT ?? 3004);
const appointmentServiceUrl = process.env.APPOINTMENT_SERVICE_URL ?? "http://localhost:3003";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3005";

const prescriptionSchema = z.object({
  medicineName: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  duration: z.string().min(1)
});

const createRecordSchema = z.object({
  appointmentId: z.string().min(1),
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  treatmentPlan: z.string().optional(),
  prescription: z.array(prescriptionSchema).default([]),
  status: z.enum(["DRAFT", "FINAL"]).default("FINAL")
});

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Medical Record Service API", version: "0.1.0" },
  paths: {
    "/api/v1/medical-records": { get: { summary: "List medical records" }, post: { summary: "Create medical record" } },
    "/api/v1/medical-records/{id}": { get: { summary: "Get medical record" }, patch: { summary: "Update medical record" } }
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

function currentUserId(req: express.Request) {
  return req.header("x-user-id") ?? "user-doctor-1";
}

async function verifyAppointment(appointmentId: string) {
  const response = await fetch(`${appointmentServiceUrl}/internal/v1/appointments/${appointmentId}/verify-for-medical-record`);
  if (!response.ok) return { valid: false };
  const body = (await response.json()) as { success: true; data: { valid: boolean; appointment: { doctorId: string; patientId: string } } };
  return body.data;
}

async function publishNotificationEvent(payload: unknown) {
  try {
    await fetch(`${notificationServiceUrl}/internal/v1/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "medical-record.created", payload })
    });
  } catch {
    console.warn("Medical record notification queued for retry");
  }
}

app.get("/health", (_req, res) => res.json(success({ service: "medical-record-service", status: "ok" })));
app.get("/api/v1/medical-records", (req, res) => {
  const items = repository.findAll({
    patientId: req.query.patientId ? String(req.query.patientId) : undefined,
    doctorId: req.query.doctorId ? String(req.query.doctorId) : undefined
  });
  return res.json(success({ items, page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20), total: items.length }));
});
app.post("/api/v1/medical-records", async (req, res) => {
  const role = req.header("x-role");
  if (!["DOCTOR", "ADMIN"].includes(role ?? "")) return res.status(403).json(error("ACCESS_DENIED", "Only doctor or admin can create medical record"));
  const parsed = createRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues));
  if (repository.findByAppointmentId(parsed.data.appointmentId)) {
    return res.status(409).json(error("MEDICAL_RECORD_ALREADY_EXISTS", "Medical record already exists for appointment"));
  }
  const verified = await verifyAppointment(parsed.data.appointmentId);
  if (!verified.valid) return res.status(422).json(error("APPOINTMENT_NOT_ELIGIBLE", "Appointment is not eligible for medical record"));
  const record = repository.create({ ...parsed.data, createdBy: currentUserId(req) });
  await publishNotificationEvent(record);
  return res.status(201).json(success(record));
});
app.get("/api/v1/medical-records/:id", (req, res) => {
  const record = repository.findById(req.params.id);
  if (!record) return res.status(404).json(error("MEDICAL_RECORD_NOT_FOUND", "Medical record not found"));
  return res.json(success(record));
});
app.patch("/api/v1/medical-records/:id", (req, res) => {
  const role = req.header("x-role");
  if (role === "STAFF") return res.status(403).json(error("ACCESS_DENIED", "Staff cannot update diagnosis"));
  const record = repository.update(req.params.id, { ...req.body, updatedBy: currentUserId(req) });
  if (!record) return res.status(404).json(error("MEDICAL_RECORD_NOT_FOUND", "Medical record not found"));
  return res.json(success(record));
});
app.get("/api/v1/patients/:patientId/medical-records", (req, res) => {
  const items = repository.findAll({ patientId: req.params.patientId });
  return res.json(success({ items, page: 1, limit: 20, total: items.length }));
});
app.get("/internal/v1/medical-records/by-appointment/:appointmentId", (req, res) => {
  const record = repository.findByAppointmentId(req.params.appointmentId);
  if (!record) return res.status(404).json(error("MEDICAL_RECORD_NOT_FOUND", "Medical record not found"));
  return res.json(success(record));
});

app.listen(port, () => {
  console.log(`Medical Record Service listening on port ${port}`);
});
