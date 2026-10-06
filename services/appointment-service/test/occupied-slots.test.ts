import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app, repository } from "../src/index.js";

const doctorId = "00000000-0000-4000-8000-000000000001";
const otherDoctorId = "00000000-0000-4000-8000-000000000002";
const startAt = "2030-01-07T01:00:00.000Z";
const endAt = "2030-01-07T01:30:00.000Z";

const token = "doctor-internal-test-token-with-32-bytes";
beforeEach(() => { repository.clear(); process.env.DOCTOR_INTERNAL_API_TOKEN = token; });

function appointment(status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CANCELLED" | "COMPLETED" | "NO_SHOW",
  doctor = doctorId, from = startAt, to = endAt) {
  repository.create({ doctorId: doctor, patientId: "private-patient", createdBy: "private-user",
    scheduledStartAt: from, scheduledEndAt: to, status });
}

describe("internal occupied doctor slots", () => {
  it("returns only active overlapping future intervals without patient data", async () => {
    appointment("PENDING");
    appointment("CONFIRMED", doctorId, "2030-01-07T02:00:00.000Z", "2030-01-07T02:30:00.000Z");
    appointment("CHECKED_IN", doctorId, "2030-01-07T02:30:00.000Z", "2030-01-07T03:00:00.000Z");
    appointment("CANCELLED");
    appointment("COMPLETED");
    appointment("NO_SHOW");
    appointment("PENDING", otherDoctorId);
    appointment("PENDING", doctorId, "2030-01-07T03:00:00.000Z", "2030-01-07T03:30:00.000Z");

    const response = await request(app).get("/internal/v1/appointments/occupied-slots")
      .query({ doctorId, from: "2030-01-07T00:00:00.000Z", to: "2030-01-07T03:00:00.000Z" })
      .set("X-Request-Id", "occupied-test-1").set("X-Internal-Token", token);

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("occupied-test-1");
    expect(response.body.data).toEqual([
      { startAt, endAt },
      { startAt: "2030-01-07T02:00:00.000Z", endAt: "2030-01-07T02:30:00.000Z" },
      { startAt: "2030-01-07T02:30:00.000Z", endAt: "2030-01-07T03:00:00.000Z" }
    ]);
    expect(JSON.stringify(response.body)).not.toContain("private-patient");
  });

  it("supports an open-ended query for all future occupied slots", async () => {
    appointment("PENDING");
    const response = await request(app).get("/internal/v1/appointments/occupied-slots")
      .query({ doctorId, from: "2030-01-01T00:00:00.000Z" }).set("X-Internal-Token", token);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ startAt, endAt }]);
  });

  it.each([
    { doctorId: "bad-id", from: "2030-01-07T00:00:00.000Z" },
    { doctorId, from: "not-a-date" },
    { doctorId, from: "2030-01-07T03:00:00.000Z", to: "2030-01-07T01:00:00.000Z" }
  ])("rejects an invalid query: %j", async (query) => {
    const response = await request(app).get("/internal/v1/appointments/occupied-slots").query(query).set("X-Internal-Token", token);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
