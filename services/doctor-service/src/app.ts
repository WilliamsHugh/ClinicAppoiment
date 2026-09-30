import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import type { AppointmentOccupancy, UserDirectory } from "./dependencies.js";
import { DependencyError } from "./dependencies.js";
import type { DoctorRepository } from "./repository.js";
import { ScheduleOverlapError } from "./repository.js";
import type { DoctorSchedule, DoctorTimeOff, Slot } from "./models.js";
import { candidateSlots, localDateOf, overlaps, parseClock, parseLocalDate, validExactSlot } from "./slots.js";
import { doctorOpenApi } from "./openapi.js";

type Role = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
type Actor = { id: string; role: Role };
type Handler = (req: Request, res: Response) => Promise<void>;

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown[] = []) {
    super(message);
  }
}

const uuid = z.string().uuid();
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const specialtyQuery = pagination.extend({ q: z.string().trim().max(100).optional(), isActive: booleanQuery.optional() });
const doctorQuery = specialtyQuery.extend({ specialtyId: uuid.optional() });
const specialtyCreate = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000).optional() }).strict();
const specialtyUpdate = specialtyCreate.partial().extend({ isActive: z.boolean().optional() });
const doctorCreate = z.object({ userId: uuid, specialtyId: uuid, displayName: z.string().trim().min(2).max(160), bio: z.string().trim().max(4000).optional() }).strict();
const doctorUpdate = z.object({ specialtyId: uuid.optional(), displayName: z.string().trim().min(2).max(160).optional(),
  bio: z.string().trim().max(4000).nullable().optional(), isActive: z.boolean().optional() }).strict();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleFields = z.object({ weekday: z.number().int().min(0).max(6), startTime: clock,
  endTime: clock, slotDurationMinutes: z.number().int().min(5).max(240), isActive: z.boolean().optional() }).strict();
const scheduleCreate = scheduleFields.omit({ isActive: true });
const scheduleUpdate = scheduleFields.partial();
const timeOffFields = z.object({ startAt: z.string().datetime(), endAt: z.string().datetime(),
  reason: z.string().trim().max(500).nullable().optional() }).strict();
const timeOffCreate = timeOffFields;
const timeOffUpdate = timeOffFields.partial();
const verifyBody = z.object({ doctorId: uuid, startAt: z.string().datetime(), endAt: z.string().datetime() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", parsed.error.issues);
  return parsed.data;
}

function actor(req: Request): Actor {
  const id = req.header("x-user-id");
  const role = req.header("x-role");
  if (!id || !role || !["PATIENT", "DOCTOR", "STAFF", "ADMIN"].includes(role)) {
    throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authenticated actor is required");
  }
  return { id, role: role as Role };
}

function requireRole(user: Actor, ...roles: Role[]) {
  if (!roles.includes(user.role)) throw new ApiError(403, "ACCESS_DENIED", "Access denied");
}

function dayWindow(date: string): { from: string; to: string } {
  const midnight = parseLocalDate(date);
  if (midnight === null) throw new ApiError(400, "VALIDATION_ERROR", "Invalid local date");
  return { from: new Date(midnight - 7 * 3_600_000).toISOString(),
    to: new Date(midnight + 24 * 3_600_000 - 7 * 3_600_000).toISOString() };
}

function validateSchedule(value: { startTime: string; endTime: string; slotDurationMinutes: number }) {
  const start = parseClock(value.startTime), end = parseClock(value.endTime);
  if (start === null || end === null || end <= start || end - start < value.slotDurationMinutes) {
    throw new ApiError(422, "SCHEDULE_INVALID", "Schedule must contain at least one complete daytime slot");
  }
}

function validateTimeOff(value: { startAt: string; endAt: string }) {
  if (Date.parse(value.endAt) <= Date.parse(value.startAt)) {
    throw new ApiError(422, "TIME_OFF_INVALID", "Time off end must be after start");
  }
}

function wrap(handler: Handler) {
  return (req: Request, res: Response, next: express.NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };
}

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data, requestId: res.getHeader("X-Request-Id") });
}
function fail(res: Response, status: number, code: string, message: string, details: unknown[] = []) {
  res.status(status).json({ success: false, error: { code, message, details }, requestId: res.getHeader("X-Request-Id") });
}

export function createDoctorApp(repository: DoctorRepository, users: UserDirectory,
  appointments: AppointmentOccupancy | null = null) {
  const app = express();
  app.use((req, res, next) => {
    const supplied = req.header("X-Request-Id");
    const requestId = supplied && /^[a-zA-Z0-9-]{1,80}$/.test(supplied) ? supplied : randomUUID();
    res.setHeader("X-Request-Id", requestId);
    next();
  });
  app.use(express.json());
  app.get("/openapi.json", (_req, res) => res.json(doctorOpenApi));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(doctorOpenApi));

  async function canManage(req: Request, doctorId: string) {
    const user = actor(req);
    requireRole(user, "DOCTOR", "STAFF", "ADMIN");
    if (user.role === "DOCTOR") {
      if (!uuid.safeParse(user.id).success) throw new ApiError(403, "ACCESS_DENIED", "Doctor profile is not linked to this account");
      const ownDoctor = await repository.findDoctorByUser(user.id);
      if (ownDoctor?.id !== doctorId) throw new ApiError(403, "ACCESS_DENIED", "This is not your schedule");
    }
  }

  async function occupied(doctorId: string, from: string, to?: string, requestId?: string): Promise<Slot[]> {
    if (!appointments) throw new ApiError(503, "APPOINTMENT_AVAILABILITY_UNAVAILABLE", "Appointment occupancy check is not configured");
    return appointments.occupied(doctorId, from, to, requestId);
  }

  async function protectExistingAppointments(doctorId: string, schedules: DoctorSchedule[], timeOffs: DoctorTimeOff[], requestId: string) {
    const now = new Date();
    const booked = await occupied(doctorId, now.toISOString(), undefined, requestId);
    const invalid = booked.filter((slot) => !validExactSlot(slot.startAt, slot.endAt, schedules, timeOffs, now));
    if (invalid.length) throw new ApiError(409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS",
      "Schedule change would invalidate existing appointments", [{ count: invalid.length }]);
  }

  app.get("/health", wrap(async (_req, res) => { await repository.health(); ok(res, { service: "doctor-service", status: "ok" }); }));

  app.get("/api/v1/specialties", wrap(async (req, res) => {
    const user = actor(req), query = parse(specialtyQuery, req.query);
    ok(res, await repository.listSpecialties({ ...query, isActive: user.role === "ADMIN" ? query.isActive : true }));
  }));
  app.post("/api/v1/specialties", wrap(async (req, res) => {
    requireRole(actor(req), "ADMIN");
    ok(res, await repository.createSpecialty(parse(specialtyCreate, req.body)), 201);
  }));
  app.patch("/api/v1/specialties/:id", wrap(async (req, res) => {
    requireRole(actor(req), "ADMIN");
    const id = parse(uuid, req.params.id), input = parse(specialtyUpdate, req.body);
    const result = await repository.updateSpecialty(id, input);
    if (!result) throw new ApiError(404, "SPECIALTY_NOT_FOUND", "Specialty not found");
    ok(res, result);
  }));

  app.get("/api/v1/doctors", wrap(async (req, res) => {
    const user = actor(req), query = parse(doctorQuery, req.query);
    ok(res, await repository.listDoctors({ ...query, isActive: user.role === "ADMIN" ? query.isActive : true }));
  }));
  app.post("/api/v1/doctors", wrap(async (req, res) => {
    requireRole(actor(req), "ADMIN");
    const input = parse(doctorCreate, req.body);
    const account = await users.findDoctorAccount(input.userId, String(res.getHeader("X-Request-Id")));
    if (!account || account.role !== "DOCTOR" || account.status !== "ACTIVE") {
      throw new ApiError(422, "DOCTOR_ACCOUNT_INVALID", "User must be an active doctor account");
    }
    const specialty = await repository.findSpecialty(input.specialtyId);
    if (!specialty?.isActive) throw new ApiError(422, "SPECIALTY_INVALID", "Specialty must be active");
    ok(res, await repository.createDoctor(input), 201);
  }));
  app.get("/api/v1/doctors/:id", wrap(async (req, res) => {
    const user = actor(req), id = parse(uuid, req.params.id);
    const item = await repository.findDoctor(id);
    if (!item || (!item.isActive && user.role !== "ADMIN")) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");
    ok(res, item);
  }));
  app.patch("/api/v1/doctors/:id", wrap(async (req, res) => {
    requireRole(actor(req), "ADMIN");
    const id = parse(uuid, req.params.id), input = parse(doctorUpdate, req.body);
    const current = await repository.findDoctor(id);
    if (!current) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");
    if (input.specialtyId) {
      const specialty = await repository.findSpecialty(input.specialtyId);
      if (!specialty?.isActive) throw new ApiError(422, "SPECIALTY_INVALID", "Specialty must be active");
    }
    if (input.isActive === false && current.isActive) {
      const booked = await occupied(id, new Date().toISOString(), undefined, String(res.getHeader("X-Request-Id")));
      if (booked.length) throw new ApiError(409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS",
        "Doctor has upcoming appointments", [{ count: booked.length }]);
    }
    ok(res, await repository.updateDoctor(id, input));
  }));

  app.get("/api/v1/doctors/:id/schedules", wrap(async (req, res) => {
    const user = actor(req);
    const id = parse(uuid, req.params.id), query = parse(pagination, req.query);
    const doctor = await repository.findDoctor(id);
    if (!doctor || (!doctor.isActive && user.role !== "ADMIN")) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");
    ok(res, await repository.listSchedules(id, query));
  }));
  app.post("/api/v1/doctors/:id/schedules", wrap(async (req, res) => {
    const doctorId = parse(uuid, req.params.id);
    await canManage(req, doctorId);
    const input = parse(scheduleCreate, req.body);
    validateSchedule(input);
    const result = await repository.createSchedule({ doctorId, ...input });
    if (!result) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");
    ok(res, result, 201);
  }));
  app.patch("/api/v1/schedules/:id", wrap(async (req, res) => {
    const id = parse(uuid, req.params.id), input = parse(scheduleUpdate, req.body);
    const current = await repository.findSchedule(id);
    if (!current) throw new ApiError(404, "SCHEDULE_NOT_FOUND", "Schedule not found");
    await canManage(req, current.doctorId);
    const proposed = { ...current, ...input };
    validateSchedule(proposed);
    const schedules = await repository.allSchedules(current.doctorId);
    const proposedSchedules = schedules.filter((item) => item.id !== id);
    if (proposed.isActive) proposedSchedules.push(proposed);
    const timeOffs = await repository.allTimeOffs(current.doctorId, new Date().toISOString(), "9999-12-31T23:59:59.999Z");
    await protectExistingAppointments(current.doctorId, proposedSchedules, timeOffs, String(res.getHeader("X-Request-Id")));
    ok(res, await repository.updateSchedule(id, proposed));
  }));

  app.get("/api/v1/doctors/:id/time-offs", wrap(async (req, res) => {
    const id = parse(uuid, req.params.id), query = parse(pagination, req.query);
    await canManage(req, id);
    if (!await repository.findDoctor(id)) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");
    ok(res, await repository.listTimeOffs(id, query));
  }));
  app.post("/api/v1/doctors/:id/time-offs", wrap(async (req, res) => {
    const doctorId = parse(uuid, req.params.id);
    await canManage(req, doctorId);
    if (!await repository.findDoctor(doctorId)) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");
    const input = parse(timeOffCreate, req.body);
    validateTimeOff(input);
    const proposed: Slot = { startAt: input.startAt, endAt: input.endAt };
    const booked = await occupied(doctorId, input.startAt, input.endAt, String(res.getHeader("X-Request-Id")));
    const conflicts = booked.filter((slot) => overlaps(slot, proposed));
    if (conflicts.length) throw new ApiError(409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS",
      "Time off overlaps existing appointments", [{ count: conflicts.length }]);
    ok(res, await repository.createTimeOff({ doctorId, ...input, reason: input.reason ?? undefined }), 201);
  }));
  app.patch("/api/v1/doctors/:doctorId/time-offs/:timeOffId", wrap(async (req, res) => {
    const doctorId = parse(uuid, req.params.doctorId);
    const timeOffId = parse(uuid, req.params.timeOffId);
    const input = parse(timeOffUpdate, req.body);
    await canManage(req, doctorId);
    const current = await repository.findTimeOff(timeOffId);
    if (!current) throw new ApiError(404, "TIME_OFF_NOT_FOUND", "Time off not found");
    if (current.doctorId !== doctorId) throw new ApiError(404, "TIME_OFF_NOT_FOUND", "Time off not found");
    const proposed: DoctorTimeOff = { ...current, ...input };
    validateTimeOff(proposed);
    const booked = await occupied(current.doctorId, proposed.startAt, proposed.endAt, String(res.getHeader("X-Request-Id")));
    const conflicts = booked.filter((slot) => overlaps(slot, proposed));
    if (conflicts.length) throw new ApiError(409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS",
      "Time off overlaps existing appointments", [{ count: conflicts.length }]);
    ok(res, await repository.updateTimeOff(timeOffId, proposed));
  }));

  app.get("/api/v1/doctors/:id/available-slots", wrap(async (req, res) => {
    actor(req);
    const id = parse(uuid, req.params.id), date = parse(z.string(), req.query.date);
    const window = dayWindow(date);
    const doctor = await repository.findDoctor(id);
    if (!doctor?.isActive) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");
    const schedules = await repository.allSchedules(id);
    const timeOffs = await repository.allTimeOffs(id, window.from, window.to);
    const candidates = candidateSlots(date, schedules, timeOffs);
    const booked = appointments ? await appointments.occupied(id, window.from, window.to, String(res.getHeader("X-Request-Id"))) : [];
    ok(res, candidates.filter((slot) => !booked.some((occupiedSlot) => overlaps(slot, occupiedSlot))));
  }));

  app.post("/internal/v1/doctors/verify-slot", wrap(async (req, res) => {
    const input = parse(verifyBody, req.body);
    const doctor = await repository.findDoctor(input.doctorId);
    if (!doctor?.isActive) { ok(res, { valid: false, reason: "DOCTOR_NOT_AVAILABLE" }); return; }
    const window = dayWindow(localDateOf(input.startAt));
    const schedules = await repository.allSchedules(input.doctorId);
    const timeOffs = await repository.allTimeOffs(input.doctorId, window.from, window.to);
    const valid = validExactSlot(input.startAt, input.endAt, schedules, timeOffs);
    ok(res, { valid, ...(valid ? {} : { reason: "SLOT_OUTSIDE_SCHEDULE" }) });
  }));

  app.use((_req, res) => fail(res, 404, "ROUTE_NOT_FOUND", "Route not found"));
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof SyntaxError && "body" in error) { fail(res, 400, "VALIDATION_ERROR", "Invalid JSON body"); return; }
    if (error instanceof ApiError) { fail(res, error.status, error.code, error.message, error.details); return; }
    if (error instanceof ScheduleOverlapError) { fail(res, 409, "SCHEDULE_OVERLAP", "Doctor schedules overlap"); return; }
    if (error instanceof DependencyError) { fail(res, 502, "UPSTREAM_SERVICE_UNAVAILABLE", `${error.service} service is unavailable`); return; }
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String(error.code);
      if (code === "23505") { fail(res, 409, "RESOURCE_CONFLICT", "Resource already exists"); return; }
      if (code === "23503") { fail(res, 422, "REFERENCE_INVALID", "Referenced resource does not exist"); return; }
    }
    console.error("Doctor Service request failed", typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unexpected");
    fail(res, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error");
  };
  app.use(onError);
  return app;
}
