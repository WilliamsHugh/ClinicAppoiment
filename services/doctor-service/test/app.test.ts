import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createDoctorApp } from "../src/app.js";
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
  const app = createDoctorApp(repository as unknown as DoctorRepository, users, appointments);
  return { app, repository, users, appointments };
}

describe("Doctor API authorization and slot contract", () => {
  it("documents the Doctor and time-off operations", async () => {
    const { app } = fixture();
    const response = await request(app).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.paths["/api/v1/doctors/{id}/time-offs"].post).toBeDefined();
    expect(response.body.paths["/api/v1/doctors/{doctorId}/time-offs/{timeOffId}"].patch).toBeDefined();
    expect(response.body.paths["/api/v1/time-offs/{id}"]).toBeUndefined();
    expect(response.body.paths["/internal/v1/doctors/verify-slot"].post).toBeDefined();
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

  it("fails closed when a schedule edit cannot check Appointment Service", async () => {
    const { repository, users } = fixture();
    const app = createDoctorApp(repository as unknown as DoctorRepository, users, null);
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
