import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDoctorApp } from "../src/app.js";
import { DependencyError } from "../src/dependencies.js";
import type { AppointmentOccupancy, UserDirectory } from "../src/dependencies.js";
import type { DoctorRepository } from "../src/repository.js";

const doctorId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const scheduleId = "00000000-0000-4000-8000-000000000003";
const specialtyId = "00000000-0000-4000-8000-000000000004";
const doctor = { id: doctorId, userId, specialtyId, displayName: "Dr A", bio: null,
  isActive: true, createdAt: "", updatedAt: "" };
const schedule = { id: scheduleId, doctorId, weekday: 1, startTime: "08:00", endTime: "10:00",
  slotDurationMinutes: 30, isActive: true, createdAt: "", updatedAt: "" };
const timeOffId = "00000000-0000-4000-8000-000000000005";
const timeOff = { id: timeOffId, doctorId, startAt: "2030-01-08T01:00:00.000Z",
  endAt: "2030-01-08T02:00:00.000Z", reason: null, createdAt: "", updatedAt: "" };
const booked = { startAt: "2030-01-07T01:00:00.000Z", endAt: "2030-01-07T01:30:00.000Z" };
const internalToken = "doctor-internal-test-token-with-32-bytes";
const userScopeToken = "user-to-doctor-patient-scope-test-token-32-bytes";
afterEach(() => vi.unstubAllEnvs());

function fixture() {
  const repository = {
    health: vi.fn().mockResolvedValue(undefined),
    findDoctor: vi.fn().mockResolvedValue(doctor),
    findDoctorByUser: vi.fn().mockResolvedValue(doctor),
    findSpecialty: vi.fn().mockResolvedValue({ id: specialtyId, isActive: true }),
    createDoctor: vi.fn().mockResolvedValue(doctor),
    findSchedule: vi.fn().mockResolvedValue(schedule),
    allSchedules: vi.fn().mockResolvedValue([schedule]),
    allTimeOffs: vi.fn().mockResolvedValue([]),
    updateSchedule: vi.fn().mockResolvedValue(schedule),
    listSpecialties: vi.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }),
    createTimeOff: vi.fn(),
    findTimeOff: vi.fn().mockResolvedValue(timeOff),
    updateTimeOff: vi.fn().mockResolvedValue(timeOff)
  };
  const users: UserDirectory = { findDoctorAccount: vi.fn().mockResolvedValue({ id: userId, role: "DOCTOR", status: "ACTIVE" }) };
  const appointments: AppointmentOccupancy = { occupied: vi.fn().mockResolvedValue([booked]) };
  const app = createDoctorApp(repository as unknown as DoctorRepository, users, appointments, internalToken);
  return { app, repository, users, appointments };
}

describe("Doctor API authorization and slot contract", () => {
  it("reports database readiness without leaking the database error", async () => {
    const { app, repository } = fixture();
    const healthy = await request(app).get("/health").set("X-Request-Id", "health-ok");
    expect(healthy.status).toBe(200);
    expect(healthy.body.data.status).toBe("ok");
    vi.mocked(repository.health).mockRejectedValueOnce(new Error("private database connection string"));

    const unavailable = await request(app).get("/health").set("X-Request-Id", "health-failed");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({
      success: false,
      error: { code: "DATABASE_UNAVAILABLE", message: "Database is unavailable", details: [] },
      requestId: "health-failed"
    });
    expect(JSON.stringify(unavailable.body)).not.toContain("private database connection string");
  });

  it("rejects missing or incorrect internal credentials before reading doctor data", async () => {
    const { app, repository } = fixture();
    const path = "/internal/v1/doctors/verify-slot";
    const body = { doctorId, startAt: booked.startAt, endAt: booked.endAt };
    const missing = await request(app).post(path).set("X-Role", "ADMIN").send(body);
    const incorrect = await request(app).post(path)
      .set("X-Internal-Token", "x".repeat(internalToken.length)).send(body);
    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(missing.body.error.code).toBe("INTERNAL_AUTH_REQUIRED");
    expect(repository.findDoctor).not.toHaveBeenCalled();

    const allowed = await request(app).post(path).set("X-Internal-Token", internalToken).send(body);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ valid: true });
  });

  it("resolves doctor ownership through a token-protected internal lookup", async () => {
    const { app, repository } = fixture();
    const path = `/internal/v1/doctors/by-user/${userId}`;
    expect((await request(app).get(path).set("X-Role", "ADMIN")).status).toBe(401);
    expect(repository.findDoctorByUser).not.toHaveBeenCalled();
    const found = await request(app).get(path).set("X-Internal-Token", internalToken);
    expect(found.status).toBe(200);
    expect(found.body.data).toEqual({ id: doctorId, userId, isActive: true });
    vi.mocked(repository.findDoctorByUser).mockResolvedValueOnce(null);
    expect((await request(app).get(path).set("X-Internal-Token", internalToken)).status).toBe(404);
    expect((await request(app).get("/internal/v1/doctors/by-user/bad-id")
      .set("X-Internal-Token", internalToken)).status).toBe(400);
  });

  it("reserves patient-scope doctor lookup for User Service's distinct credential", async () => {
    vi.stubEnv("DOCTOR_USER_INTERNAL_API_TOKEN", userScopeToken);
    const { app, repository } = fixture();
    const path = `/internal/v1/doctors/by-user/${userId}`;
    const reverseToken = "doctor-to-user-reverse-direction-token-32-bytes";
    vi.stubEnv("USER_DOCTOR_INTERNAL_API_TOKEN", reverseToken);
    for (const token of [undefined, reverseToken, "wrong-token"]) {
      const call = request(app).get(path);
      const response = await (token ? call.set("X-Internal-Token", token) : call);
      expect(response.status).toBe(401);
    }
    expect(repository.findDoctorByUser).not.toHaveBeenCalled();
    const allowed = await request(app).get(path).set("X-Internal-Token", userScopeToken);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ id: doctorId, userId, isActive: true });
    vi.mocked(repository.findDoctorByUser).mockResolvedValueOnce({ ...doctor, isActive: false });
    const inactive = await request(app).get(path).set("X-Internal-Token", userScopeToken);
    expect(inactive.body.data).toEqual({ id: doctorId, userId, isActive: false });
    expect((await request(app).get(path).set("X-Internal-Token", internalToken)).status).toBe(200);
    vi.mocked(repository.findDoctorByUser).mockResolvedValueOnce(null);
    expect((await request(app).get(path).set("X-Internal-Token", userScopeToken)).status).toBe(404);
    expect((await request(app).get("/internal/v1/doctors/by-user/not-a-uuid")
      .set("X-Internal-Token", userScopeToken)).status).toBe(400);
  });

  it("fails closed if User patient-scope credential is missing or reused", async () => {
    const { app, repository } = fixture();
    const path = `/internal/v1/doctors/by-user/${userId}`;
    expect((await request(app).get(path).set("X-Internal-Token", userScopeToken)).status).toBe(503);
    vi.stubEnv("USER_DOCTOR_INTERNAL_API_TOKEN", "doctor-to-user-reverse-direction-token-32-bytes");
    vi.stubEnv("DOCTOR_USER_INTERNAL_API_TOKEN", "doctor-to-user-reverse-direction-token-32-bytes");
    const duplicate = await request(app).get(path).set("X-Internal-Token", userScopeToken);
    expect(duplicate.status).toBe(503);
    expect(duplicate.body.error.code).toBe("INTERNAL_AUTH_NOT_CONFIGURED");
    expect(repository.findDoctorByUser).not.toHaveBeenCalled();
  });

  it("refuses a weak internal token at startup", () => {
    const { repository, users, appointments } = fixture();
    expect(() => createDoctorApp(repository as unknown as DoctorRepository, users, appointments, "short"))
      .toThrow("DOCTOR_INTERNAL_API_TOKEN");
  });

  it("documents the Doctor and time-off operations", async () => {
    const { app } = fixture();
    const response = await request(app).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.paths["/api/v1/doctors/{id}/time-offs"].post).toBeDefined();
    expect(response.body.paths["/api/v1/doctors/{doctorId}/time-offs/{timeOffId}"].patch).toBeDefined();
    expect(response.body.paths["/api/v1/time-offs/{id}"]).toBeUndefined();
    expect(response.body.paths["/internal/v1/doctors/verify-slot"].post).toBeDefined();
    expect(response.body.paths["/internal/v1/doctors/verify-slot"].post.security).toEqual([{ internalToken: [] }]);
    expect(response.body.paths["/internal/v1/doctors/by-user/{userId}"].get.security).toEqual([{ internalToken: [] }]);
    expect(response.body.paths["/internal/v1/doctors/by-user/{userId}"].get["x-token-envs"])
      .toContain("DOCTOR_USER_INTERNAL_API_TOKEN");
    expect(response.body.components.securitySchemes.internalToken.name).toBe("X-Internal-Token");
    expect(response.body.paths["/health"].get.responses["503"]).toBeDefined();
  });

  it("requires Gateway identity headers", async () => {
    const { app, repository } = fixture();
    const response = await request(app).get("/api/v1/specialties");
    expect(response.status).toBe(401);
    expect(repository.listSpecialties).not.toHaveBeenCalled();
  });

  it("does not allow a patient to create a doctor", async () => {
    const { app, repository } = fixture();
    const response = await request(app).post("/api/v1/doctors")
      .set("X-User-Id", userId).set("X-Role", "PATIENT")
      .send({ userId, specialtyId, displayName: "Dr A" });
    expect(response.status).toBe(403);
    expect(repository.createDoctor).not.toHaveBeenCalled();
  });

  it("links a doctor only to an active DOCTOR account", async () => {
    const { app, repository, users } = fixture();
    vi.mocked(users.findDoctorAccount).mockResolvedValue({ id: userId, role: "PATIENT", status: "ACTIVE" });
    const response = await request(app).post("/api/v1/doctors")
      .set("X-User-Id", userId).set("X-Role", "ADMIN")
      .send({ userId, specialtyId, displayName: "Dr A" });
    expect(response.status).toBe(422);
    expect(repository.createDoctor).not.toHaveBeenCalled();
  });

  it("rejects edits to another doctor's schedule", async () => {
    const { app, repository } = fixture();
    vi.mocked(repository.findDoctorByUser).mockResolvedValue({ ...doctor, id: "00000000-0000-4000-8000-000000000099" });
    const response = await request(app).patch(`/api/v1/schedules/${scheduleId}`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startTime: "09:00" });
    expect(response.status).toBe(403);
    expect(repository.updateSchedule).not.toHaveBeenCalled();
  });

  it("rejects a schedule change that removes a booked slot", async () => {
    const { app, repository } = fixture();
    const response = await request(app).patch(`/api/v1/schedules/${scheduleId}`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startTime: "09:00" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("SCHEDULE_CONFLICT_WITH_APPOINTMENTS");
    expect(repository.updateSchedule).not.toHaveBeenCalled();
  });

  it("removes occupied slots from the public availability list", async () => {
    const { app } = fixture();
    const response = await request(app).get(`/api/v1/doctors/${doctorId}/available-slots?date=2030-01-07`)
      .set("X-User-Id", userId).set("X-Role", "PATIENT");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data).not.toContainEqual(booked);
  });

  it("does not advertise slots when Appointment occupancy is not configured", async () => {
    const { repository, users } = fixture();
    const app = createDoctorApp(repository as unknown as DoctorRepository, users, null, internalToken);
    const response = await request(app).get(`/api/v1/doctors/${doctorId}/available-slots?date=2030-01-07`)
      .set("X-User-Id", userId).set("X-Role", "PATIENT");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("APPOINTMENT_AVAILABILITY_UNAVAILABLE");
    expect(response.body.data).toBeUndefined();
  });

  it("does not advertise slots when Appointment occupancy fails", async () => {
    const { app, appointments } = fixture();
    vi.mocked(appointments.occupied).mockRejectedValueOnce(new DependencyError("appointment"));
    const response = await request(app).get(`/api/v1/doctors/${doctorId}/available-slots?date=2030-01-07`)
      .set("X-User-Id", userId).set("X-Role", "PATIENT");
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("UPSTREAM_SERVICE_UNAVAILABLE");
    expect(response.body.data).toBeUndefined();
  });

  it("fails closed when a schedule edit cannot check Appointment Service", async () => {
    const { repository, users } = fixture();
    const app = createDoctorApp(repository as unknown as DoctorRepository, users, null, internalToken);
    const response = await request(app).patch(`/api/v1/schedules/${scheduleId}`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startTime: "09:00" });
    expect(response.status).toBe(503);
    expect(repository.updateSchedule).not.toHaveBeenCalled();
  });

  it("rejects time off overlapping an existing appointment", async () => {
    const { app, repository } = fixture();
    const response = await request(app).post(`/api/v1/doctors/${doctorId}/time-offs`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startAt: "2030-01-07T01:15:00.000Z", endAt: "2030-01-07T02:00:00.000Z" });
    expect(response.status).toBe(409);
    expect(repository.createTimeOff).not.toHaveBeenCalled();
  });

  it("updates time off for its doctor through the nested route", async () => {
    const { app, repository } = fixture();
    const response = await request(app).patch(`/api/v1/doctors/${doctorId}/time-offs/${timeOffId}`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ reason: "Training" });
    expect(response.status).toBe(200);
    expect(repository.updateTimeOff).toHaveBeenCalledWith(timeOffId, { ...timeOff, reason: "Training" });
  });

  it("rejects time off under a different doctor path", async () => {
    const { app, repository, appointments } = fixture();
    const otherDoctorId = "00000000-0000-4000-8000-000000000099";
    const response = await request(app).patch(`/api/v1/doctors/${otherDoctorId}/time-offs/${timeOffId}`)
      .set("X-User-Id", userId).set("X-Role", "ADMIN")
      .send({ reason: "Training" });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("TIME_OFF_NOT_FOUND");
    expect(repository.updateTimeOff).not.toHaveBeenCalled();
    expect(appointments.occupied).not.toHaveBeenCalled();
  });

  it("rejects a doctor editing another doctor's time off", async () => {
    const { app, repository } = fixture();
    vi.mocked(repository.findDoctorByUser).mockResolvedValue({ ...doctor, id: "00000000-0000-4000-8000-000000000099" });
    const response = await request(app).patch(`/api/v1/doctors/${doctorId}/time-offs/${timeOffId}`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ reason: "Training" });
    expect(response.status).toBe(403);
    expect(repository.updateTimeOff).not.toHaveBeenCalled();
  });

  it("rejects a patient before reading time off", async () => {
    const { app, repository } = fixture();
    const response = await request(app).patch(`/api/v1/doctors/${doctorId}/time-offs/${timeOffId}`)
      .set("X-User-Id", userId).set("X-Role", "PATIENT")
      .send({ reason: "Training" });
    expect(response.status).toBe(403);
    expect(repository.findTimeOff).not.toHaveBeenCalled();
  });

  it("does not expose the old time-off update route", async () => {
    const { app, repository } = fixture();
    const response = await request(app).patch(`/api/v1/time-offs/${timeOffId}`)
      .set("X-User-Id", userId).set("X-Role", "ADMIN")
      .send({ reason: "Training" });
    expect(response.status).toBe(404);
    expect(repository.updateTimeOff).not.toHaveBeenCalled();
  });

  it("returns a request ID with validation errors", async () => {
    const { app } = fixture();
    const response = await request(app).get(`/api/v1/doctors/${doctorId}/available-slots?date=2030-02-30`)
      .set("X-User-Id", userId).set("X-Role", "PATIENT")
      .set("X-Request-Id", "doctor-test-123");
    expect(response.status).toBe(400);
    expect(response.body.requestId).toBe("doctor-test-123");
    expect(response.headers["x-request-id"]).toBe("doctor-test-123");
  });
});
