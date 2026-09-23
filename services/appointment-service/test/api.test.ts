import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app, repository } from "../src/index.js";

const patientHeaders = { "X-User-Id": "user-patient-1", "X-Role": "PATIENT" };
const slot = {
  doctorId: "doctor-1",
  scheduledStartAt: "2026-10-01T08:00:00.000Z",
  scheduledEndAt: "2026-10-01T08:30:00.000Z"
};

beforeEach(() => {
  repository.clear();
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

describe("Appointment Service authorization", () => {
  it("derives the patient profile instead of trusting patientId from the client", async () => {
    const response = await request(app)
      .post("/api/v1/appointments")
      .set(patientHeaders)
      .set("Idempotency-Key", "appointment-test-key-0001")
      .send({ ...slot, patientId: "patient-spoofed" });

    expect(response.status).toBe(201);
    expect(response.body.data.patientId).toBe("patient-owned");
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
