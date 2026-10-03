import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, repository } from "../src/index.js";

const patientHeaders = { "X-User-Id": "user-patient-1", "X-Role": "PATIENT" };
const slot = {
  doctorId: "00000000-0000-4000-8000-000000000011",
  scheduledStartAt: "2026-10-01T08:00:00.000Z",
  scheduledEndAt: "2026-10-01T08:30:00.000Z"
};
const internalToken = "doctor-internal-test-token-with-32-bytes";

beforeEach(() => {
  repository.clear();
  vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", internalToken);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/internal/v1/patients/by-user/")) {
      return new Response(JSON.stringify({ success: true, data: { id: "patient-owned", userId: "user-patient-1" } }), { status: 200 });
    }
    if (url.endsWith("/internal/v1/doctors/verify-slot")) {
      return new Response(JSON.stringify({ success: true, data: { valid: true } }), { status: 200 });
    }
    if (url.includes("/internal/v1/patients/")) {
      return new Response(JSON.stringify({ success: true, data: { id: "patient-owned", userId: "user-patient-1" } }), { status: 200 });
    }
    if (url.endsWith("/internal/v1/notifications")) {
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 201 });
    }
    return new Response(null, { status: 404 });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Appointment Service authorization", () => {
  it("derives the patient profile instead of trusting patientId from the client", async () => {
    const response = await request(app)
      .post("/api/v1/appointments")
      .set(patientHeaders)
      .set("Idempotency-Key", "appointment-test-key-0001")
      .set("X-Request-Id", "booking-verify-1")
      .send({ ...slot, patientId: "00000000-0000-4000-8000-000000000099" });

    expect(response.status).toBe(201);
    expect(response.body.data.patientId).toBe("patient-owned");
    const doctorCall = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).endsWith("/internal/v1/doctors/verify-slot"));
    expect(doctorCall).toBeDefined();
    expect(new Headers(doctorCall![1]?.headers).get("X-Internal-Token")).toBe(internalToken);
    expect(new Headers(doctorCall![1]?.headers).get("X-Request-Id")).toBe("booking-verify-1");
  });

  it("fails closed when the Doctor internal credential is missing", async () => {
    vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", "");
    const response = await request(app)
      .post("/api/v1/appointments")
      .set(patientHeaders)
      .set("Idempotency-Key", "appointment-test-key-missing-doctor-token")
      .send(slot);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DOCTOR_VERIFICATION_UNAVAILABLE");
    expect(vi.mocked(fetch).mock.calls.some(([url]) =>
      String(url).endsWith("/internal/v1/doctors/verify-slot"))).toBe(false);
  });

  it("reports Doctor internal authentication failures as unavailable instead of an invalid slot", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      if (String(input).endsWith("/internal/v1/doctors/verify-slot")) {
        return new Response(JSON.stringify({ success: false,
          error: { code: "INTERNAL_AUTH_REQUIRED", message: "Internal service credential is required", details: [] } }),
        { status: 401 });
      }
      return original(input, options);
    });
    const response = await request(app)
      .post("/api/v1/appointments")
      .set(patientHeaders)
      .set("Idempotency-Key", "appointment-test-key-doctor-auth-failed")
      .send(slot);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DOCTOR_VERIFICATION_UNAVAILABLE");
  });

  it("scopes patient lists to the authenticated patient", async () => {
    repository.create({ ...slot, patientId: "patient-owned", createdBy: "user-patient-1" });
    repository.create({ ...slot, doctorId: "doctor-2", patientId: "patient-other", createdBy: "staff-user" });

    const response = await request(app)
      .get("/api/v1/appointments?patientId=patient-other")
      .set(patientHeaders);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].patientId).toBe("patient-owned");
  });

  it("rejects a patient-only attempt to confirm an appointment", async () => {
    const appointment = repository.create({ ...slot, patientId: "patient-owned", createdBy: "user-patient-1" });
    const response = await request(app)
      .patch(`/api/v1/appointments/${appointment.id}/confirm`)
      .set(patientHeaders)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCESS_DENIED");
  });

  it("returns a standardized 404 for an unknown endpoint in its prefix", async () => {
    const response = await request(app)
      .get("/api/v1/appointments/new-endpoint")
      .set(patientHeaders);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("APPOINTMENT_NOT_FOUND");
  });
});

describe("Appointment booking contract", () => {
  const futureSlot = { ...slot, scheduledStartAt: "2030-01-07T01:00:00.000Z",
    scheduledEndAt: "2030-01-07T01:30:00.000Z" };

  it("replays only the same actor, key and payload", async () => {
    const make = (body: object, key: string) => request(app).post("/api/v1/appointments")
      .set(patientHeaders).set("Idempotency-Key", key).send(body);
    const first = await make(futureSlot, "stable-key");
    const replay = await make(futureSlot, "stable-key");
    const mismatch = await make({ ...futureSlot, reason: "different" }, "stable-key");
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects partial overlap and invalid intervals", async () => {
    const make = (body: object, key: string) => request(app).post("/api/v1/appointments")
      .set(patientHeaders).set("Idempotency-Key", key).send(body);
    expect((await make(futureSlot, "first")).status).toBe(201);
    const overlap = await make({ ...futureSlot, scheduledStartAt: "2030-01-07T01:15:00.000Z",
      scheduledEndAt: "2030-01-07T01:45:00.000Z" }, "second");
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe("APPOINTMENT_SLOT_UNAVAILABLE");
    expect((await make({ ...futureSlot, scheduledEndAt: futureSlot.scheduledStartAt }, "third")).status).toBe(422);
  });
});
