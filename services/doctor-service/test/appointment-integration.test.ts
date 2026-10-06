import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app as appointmentApp, repository as appointmentRepository } from "../../appointment-service/src/index.js";
import { createDoctorApp } from "../src/app.js";
import { createAppointmentOccupancy } from "../src/dependencies.js";
import type { DoctorRepository } from "../src/repository.js";

const doctorId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const specialtyId = "00000000-0000-4000-8000-000000000003";
const scheduleId = "00000000-0000-4000-8000-000000000004";
const booked = { startAt: "2030-01-07T01:00:00.000Z", endAt: "2030-01-07T01:30:00.000Z" };
const doctor = { id: doctorId, userId, specialtyId, displayName: "Dr A", bio: null,
  isActive: true, createdAt: "", updatedAt: "" };
const schedule = { id: scheduleId, doctorId, weekday: 1, startTime: "08:00", endTime: "10:00",
  slotDurationMinutes: 30, isActive: true, createdAt: "", updatedAt: "" };

beforeEach(() => { appointmentRepository.clear(); vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", "doctor-internal-test-token-with-32-bytes"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function bookSlot() {
  appointmentRepository.create({ doctorId, patientId: "private-patient", createdBy: "patient-user",
    scheduledStartAt: booked.startAt, scheduledEndAt: booked.endAt, status: "PENDING" });
}

function fixture() {
  const repository = {
    findDoctor: vi.fn().mockResolvedValue(doctor),
    findDoctorByUser: vi.fn().mockResolvedValue(doctor),
    findSchedule: vi.fn().mockResolvedValue(schedule),
    allSchedules: vi.fn().mockResolvedValue([schedule]),
    allTimeOffs: vi.fn().mockResolvedValue([]),
    updateSchedule: vi.fn().mockResolvedValue(schedule),
    createTimeOff: vi.fn()
  };
  const upstream = vi.fn(async (input: URL, options: RequestInit) => {
    const url = new URL(String(input));
    const response = await request(appointmentApp).get(`${url.pathname}${url.search}`)
      .set(options.headers as Record<string, string>);
    return new Response(JSON.stringify(response.body), { status: response.status });
  });
  vi.stubGlobal("fetch", upstream);
  const app = createDoctorApp(repository as unknown as DoctorRepository,
    { findDoctorAccount: vi.fn() }, createAppointmentOccupancy("http://appointment-service:3003"),
    "doctor-internal-test-token-with-32-bytes");
  return { app, repository, upstream };
}

describe("Doctor and Appointment internal HTTP contract", () => {
  it("removes a booked slot from availability", async () => {
    bookSlot();
    const { app, upstream } = fixture();
    const response = await request(app).get(`/api/v1/doctors/${doctorId}/available-slots?date=2030-01-07`)
      .set("X-User-Id", userId).set("X-Role", "PATIENT").set("X-Request-Id", "availability-1");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data).not.toContainEqual(booked);
    const [url, options] = upstream.mock.calls[0]!;
    expect(url.pathname).toBe("/internal/v1/appointments/occupied-slots");
    expect(options.headers).toMatchObject({ "X-Request-Id": "availability-1" });
  });

  it("returns 409 before changing a schedule that would invalidate a booking", async () => {
    bookSlot();
    const { app, repository } = fixture();
    const response = await request(app).patch(`/api/v1/schedules/${scheduleId}`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startTime: "09:00" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("SCHEDULE_CONFLICT_WITH_APPOINTMENTS");
    expect(repository.updateSchedule).not.toHaveBeenCalled();
  });

  it("returns 409 before creating time off that overlaps a booking", async () => {
    bookSlot();
    const { app, repository } = fixture();
    const response = await request(app).post(`/api/v1/doctors/${doctorId}/time-offs`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startAt: "2030-01-07T01:15:00.000Z", endAt: "2030-01-07T02:00:00.000Z" });
    expect(response.status).toBe(409);
    expect(repository.createTimeOff).not.toHaveBeenCalled();
  });

  it("returns 502 without writing when Appointment Service is unavailable", async () => {
    const { app, repository } = fixture();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Appointment Service unavailable")));
    const scheduleResponse = await request(app).patch(`/api/v1/schedules/${scheduleId}`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startTime: "09:00" });
    const timeOffResponse = await request(app).post(`/api/v1/doctors/${doctorId}/time-offs`)
      .set("X-User-Id", userId).set("X-Role", "DOCTOR")
      .send({ startAt: "2030-01-07T01:15:00.000Z", endAt: "2030-01-07T02:00:00.000Z" });
    expect(scheduleResponse.status).toBe(502);
    expect(timeOffResponse.status).toBe(502);
    expect(repository.updateSchedule).not.toHaveBeenCalled();
    expect(repository.createTimeOff).not.toHaveBeenCalled();
  });
});
