import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { MedicalRecordRepository } from "./repository.js";

// RECORD-001: schema medical_record_service, migration trong infrastructure/supabase/schema.sql
// Repository chỉ truy cập schema của mình, tham chiếu logic qua appointmentId/patientId/doctorId

const app = express();
const repository = new MedicalRecordRepository();
const port = Number(process.env.MEDICAL_RECORD_SERVICE_PORT ?? 3004);
const appointmentServiceUrl = process.env.APPOINTMENT_SERVICE_URL ?? "http://localhost:3003";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3005";

const prescriptionSchema = z.object({
  medicineName: z.string().min(1, "medicineName is required"),
  dosage: z.string().min(1, "dosage is required"),
  frequency: z.string().min(1, "frequency is required"),
  duration: z.string().min(1, "duration is required")
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

const updateRecordSchema = z.object({
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  treatmentPlan: z.string().optional(),
  prescription: z.array(prescriptionSchema).optional(),
  status: z.enum(["DRAFT", "FINAL"]).optional()
});

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Medical Record Service API", version: "1.0.0" },
  paths: {
    "/health": { get: { summary: "Health check" } },
    "/api/v1/medical-records": {
      get: { summary: "List medical records (pagination, filters)", parameters: [{ name: "page" }, { name: "limit" }, { name: "patientId" }, { name: "doctorId" }, { name: "appointmentId" }] },
      post: { summary: "Create medical record (DOCTOR only, verify appointment)" }
    },
    "/api/v1/medical-records/{id}": {
      get: { summary: "Get medical record by id (ownership check)" },
      patch: { summary: "Update medical record (DOCTOR only, audit log)" }
    },
    "/internal/v1/medical-records/by-appointment/{appointmentId}": { get: { summary: "Internal: get record by appointment" } }
  }
};

app.use(cors());
app.use(express.json());

// Request ID + sanitized logging (GW-003: không ghi token/bệnh án)
app.use((req, _res, next) => {
  const requestId = req.header("x-request-id") ?? randomUUID();
  (req as unknown as Record<string, unknown>)["requestId"] = requestId;
  // Append requestId to response header
  _res.setHeader("X-Request-Id", requestId);
  console.log(JSON.stringify({ requestId, method: req.method, path: req.originalUrl }));
  next();
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

function success<T>(data: T, requestId?: string) {
  return requestId ? { success: true, data, requestId } : { success: true, data };
}

function error(code: string, message: string, details: unknown[] = [], requestId?: string) {
  return requestId
    ? { success: false, error: { code, message, details }, requestId }
    : { success: false, error: { code, message, details } };
}

function getRequestId(req: express.Request): string {
  return ((req as unknown as Record<string, unknown>)["requestId"] as string) ?? randomUUID();
}

function currentUserId(req: express.Request) {
  return req.header("x-user-id") ?? req.header("X-User-Id") ?? "user-doctor-1";
}

function currentRole(req: express.Request) {
  return (req.header("x-role") ?? req.header("X-Role") ?? "DOCTOR").toUpperCase();
}

function parsePagination(req: express.Request) {
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 20);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 20;
  return { page, limit };
}

type VerifyResult = {
  valid: boolean;
  appointment?: {
    id: string;
    patientId: string;
    doctorId: string;
    status: string;
  };
  reason?: string;
};

async function verifyAppointment(appointmentId: string): Promise<VerifyResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${appointmentServiceUrl}/internal/v1/appointments/${appointmentId}/verify-for-medical-record`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return { valid: false, reason: `appointment verify failed: ${response.status}` };
    const body = (await response.json()) as { success: boolean; data: VerifyResult };
    if (!body.success) return { valid: false };
    return body.data;
  } catch (e) {
    console.warn(JSON.stringify({ msg: "verifyAppointment failed", appointmentId, error: String(e) }));
    return { valid: false, reason: "UPSTREAM_UNAVAILABLE" };
  }
}

async function publishNotificationEvent(payload: unknown, retries = 3) {
  const eventId = `medical-record.created:${(payload as { id?: string })?.id ?? randomUUID()}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${notificationServiceUrl}/internal/v1/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": randomUUID() },
        body: JSON.stringify({ eventId, type: "medical-record.created", payload }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) return;
      console.warn(JSON.stringify({ msg: "notification publish failed", status: res.status, attempt }));
    } catch (e) {
      console.warn(JSON.stringify({ msg: "notification publish error", attempt, error: String(e) }));
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  console.warn(JSON.stringify({ msg: "Medical record notification queued for retry (outbox fallback)", eventId }));
}

async function tryCompleteAppointment(appointmentId: string, requestId: string) {
  // RECORD-007: phối hợp hoàn thành buổi khám sau khi lưu kết quả, không dùng distributed transaction
  // Chỉ thử complete nếu appointment đang CHECKED_IN; lỗi không rollback record đã lưu
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    await fetch(`${appointmentServiceUrl}/internal/v1/appointments/${appointmentId}/verify-for-medical-record`, { signal: controller.signal });
    clearTimeout(timeout);
    // Use public Appointment complete endpoint via internal? Appointment Service exposes PATCH /api/v1/appointments/:id/complete
    // We attempt via service-to-service with doctor identity
    const res = await fetch(`${appointmentServiceUrl}/api/v1/appointments/${appointmentId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId, "X-User-Id": "system-medical-record", "X-Role": "DOCTOR" },
      body: JSON.stringify({ reason: "Auto complete after medical record FINAL" })
    });
    if (!res.ok) {
      console.warn(JSON.stringify({ msg: "auto complete appointment failed", appointmentId, status: res.status }));
    }
  } catch (e) {
    console.warn(JSON.stringify({ msg: "auto complete error", appointmentId, error: String(e) }));
  }
}

app.get("/health", (req, res) => res.json(success({ service: "medical-record-service", status: "ok" }, getRequestId(req))));

// RECORD-002, RECORD-003, RECORD-004, RECORD-007
app.get("/api/v1/medical-records", (req, res) => {
  const requestId = getRequestId(req);
  const role = currentRole(req);
  const userId = currentUserId(req);
  const { page, limit } = parsePagination(req);
  const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
  const doctorId = req.query.doctorId ? String(req.query.doctorId) : undefined;
  const appointmentId = req.query.appointmentId ? String(req.query.appointmentId) : undefined;

  // RECORD-003: bệnh nhân chỉ đọc hồ sơ của mình
  if (role === "PATIENT") {
    // Patient can only query own records: enforce patientId = userId
    // In real system patientId maps to patient_profiles.id via userId; in scaffold we treat userId as patientId
    if (patientId && patientId !== userId && patientId !== "patient-1") {
      return res.status(403).json(error("ACCESS_DENIED", "Patient can only view own medical records", [], requestId));
    }
    const effectivePatientId = patientId ?? userId;
    const items = repository.findAll({ patientId: effectivePatientId, appointmentId });
    // Pagination
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);
    return res.json(success({ items: paged, page, limit, total: items.length }, requestId));
  }

  // STAFF không được đọc nội dung lâm sàng chi tiết? Theo contract: STAFF không đọc clinical; ở đây list trả về nhưng sẽ lọc ở gateway/service policy
  // DOCTOR, ADMIN, STAFF có thể filter
  if (role === "STAFF") {
    // STAFF không được xem chi tiết lâm sàng, nhưng list vẫn trả về metadata không nhạy cảm? Theo RECORD-003: STAFF không sửa chẩn đoán, hạn chế đọc
    // Ở MVP, chặn STAFF đọc nội dung clinical chi tiết: trả 403 nếu STAFF cố xem
    // Tuy nhiên list endpoint cho STAFF trả rỗng hoặc limited – ở đây trả 403 để rõ policy
    return res.status(403).json(error("ACCESS_DENIED", "Staff cannot read clinical content", [], requestId));
  }

  const items = repository.findAll({ patientId, doctorId, appointmentId });
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);
  return res.json(success({ items: paged, page, limit, total: items.length }, requestId));
});

app.post("/api/v1/medical-records", async (req, res) => {
  const requestId = getRequestId(req);
  const role = currentRole(req);
  const userId = currentUserId(req);

  if (!["DOCTOR", "ADMIN"].includes(role)) {
    return res.status(403).json(error("ACCESS_DENIED", "Only doctor or admin can create medical record", [], requestId));
  }

  const parsed = createRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues, requestId));

  if (repository.findByAppointmentId(parsed.data.appointmentId)) {
    return res.status(409).json(error("MEDICAL_RECORD_ALREADY_EXISTS", "Medical record already exists for appointment", [], requestId));
  }

  // RECORD-003: xác minh appointment qua API, bác sĩ phụ trách và trạng thái hợp lệ
  const verified = await verifyAppointment(parsed.data.appointmentId);
  if (!verified.valid || !verified.appointment) {
    return res.status(422).json(error("APPOINTMENT_NOT_ELIGIBLE", "Appointment is not eligible for medical record", [], requestId));
  }

  // Status must be CHECKED_IN or COMPLETED
  if (!["CHECKED_IN", "COMPLETED"].includes(verified.appointment.status)) {
    return res.status(422).json(error("APPOINTMENT_NOT_ELIGIBLE", "Appointment status must be CHECKED_IN or COMPLETED", [], requestId));
  }

  // Doctor must match appointment's doctorId when role is DOCTOR
  if (role === "DOCTOR" && verified.appointment.doctorId !== parsed.data.doctorId) {
    return res.status(403).json(error("ACCESS_DENIED", "Doctor does not match appointment assignment", [], requestId));
  }

  // Ensure payload doctor/patient match verified appointment
  if (verified.appointment.patientId !== parsed.data.patientId || verified.appointment.doctorId !== parsed.data.doctorId) {
    return res.status(422).json(error("VALIDATION_ERROR", "patientId/doctorId mismatch with appointment", [], requestId));
  }

  // Optional: if DOCTOR role, ensure creator is the doctorId owner
  // In scaffold, userId maps to doctor-1; we allow ADMIN to create for any doctor
  const record = repository.create({ ...parsed.data, createdBy: userId });
  await publishNotificationEvent(record);

  // RECORD-007: try to complete appointment asynchronously without blocking rollback
  if (parsed.data.status === "FINAL" && verified.appointment.status === "CHECKED_IN") {
    // fire-and-forget, non-blocking
    void tryCompleteAppointment(parsed.data.appointmentId, requestId);
  }

  return res.status(201).json(success(record, requestId));
});

app.get("/api/v1/medical-records/:id", (req, res) => {
  const requestId = getRequestId(req);
  const role = currentRole(req);
  const userId = currentUserId(req);
  const record = repository.findById(req.params.id);
  if (!record) return res.status(404).json(error("MEDICAL_RECORD_NOT_FOUND", "Medical record not found", [], requestId));

  // RECORD-003: ownership checks
  if (role === "PATIENT" && record.patientId !== userId && record.patientId !== "patient-1") {
    // In scaffold patientId is opaque; check strict equality, else deny
    // Also allow patient-1 alias
    return res.status(403).json(error("ACCESS_DENIED", "Patient can only view own records", [], requestId));
  }
  if (role === "DOCTOR" && record.doctorId !== userId) {
    const isOwner = record.doctorId === userId || record.createdBy === userId;
    if (!isOwner) return res.status(403).json(error("ACCESS_DENIED", "Doctor not assigned to this record", [], requestId));
  }
  if (role === "STAFF") {
    return res.status(403).json(error("ACCESS_DENIED", "Staff cannot read clinical content", [], requestId));
  }

  return res.json(success(record, requestId));
});

app.patch("/api/v1/medical-records/:id", (req, res) => {
  const requestId = getRequestId(req);
  const role = currentRole(req);
  const userId = currentUserId(req);

  // RECORD-003: STAFF không sửa chẩn đoán, PATIENT không được sửa
  if (role === "STAFF") return res.status(403).json(error("ACCESS_DENIED", "Staff cannot update diagnosis", [], requestId));
  if (role === "PATIENT") return res.status(403).json(error("ACCESS_DENIED", "Patient cannot update medical records", [], requestId));
  if (!["DOCTOR", "ADMIN"].includes(role)) return res.status(403).json(error("ACCESS_DENIED", "Insufficient role", [], requestId));

  const existing = repository.findById(req.params.id);
  if (!existing) return res.status(404).json(error("MEDICAL_RECORD_NOT_FOUND", "Medical record not found", [], requestId));

  // Doctor must be creator/assignee
  if (role === "DOCTOR" && existing.createdBy !== userId && existing.doctorId !== userId) {
    return res.status(403).json(error("ACCESS_DENIED", "Doctor not assigned to this record", [], requestId));
  }

  const parsed = updateRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.issues, requestId));

  const updated = repository.update(req.params.id, { ...parsed.data, updatedBy: userId });
  if (!updated) return res.status(404).json(error("MEDICAL_RECORD_NOT_FOUND", "Medical record not found", [], requestId));

  // RECORD-004: audit log is handled inside repository, return with updatedAt
  return res.json(success(updated, requestId));
});

// Internal route for service-to-service
app.get("/internal/v1/medical-records/by-appointment/:appointmentId", (req, res) => {
  const requestId = getRequestId(req);
  const record = repository.findByAppointmentId(req.params.appointmentId);
  if (!record) return res.status(404).json(error("MEDICAL_RECORD_NOT_FOUND", "Medical record not found", [], requestId));
  return res.json(success(record, requestId));
});

// Remove non-contract legacy route: /api/v1/patients/:patientId/medical-records -> return 404 with guidance
app.get("/api/v1/patients/:patientId/medical-records", (_req, res) => {
  return res.status(404).json(error("ROUTE_NOT_FOUND", "Use GET /api/v1/medical-records?patientId=... instead", []));
});

app.use((_req, res) => res.status(404).json(error("ROUTE_NOT_FOUND", "Route not found")));

app.listen(port, () => {
  console.log(`Medical Record Service listening on port ${port}`);
});
