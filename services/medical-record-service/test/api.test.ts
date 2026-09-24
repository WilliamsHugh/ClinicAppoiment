import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  appointment: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patient: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  otherPatient: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  doctor: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  otherDoctor: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  record: "ffffffff-ffff-4fff-8fff-ffffffffffff"
};
const mocks = vi.hoisted(() => ({
  findById: vi.fn(), findAll: vi.fn(), create: vi.fn(), update: vi.fn(), findByAppointmentId: vi.fn(),
  pendingOutbox: vi.fn(), markOutboxSent: vi.fn(), deferOutbox: vi.fn()
}));
vi.mock("pg", () => ({ Pool: class { query = vi.fn() } }));
vi.mock("../src/repository.js", () => ({ MedicalRecordRepository: class {
  findById = mocks.findById; findAll = mocks.findAll; create = mocks.create; update = mocks.update;
  findByAppointmentId = mocks.findByAppointmentId; pendingOutbox = mocks.pendingOutbox;
  markOutboxSent = mocks.markOutboxSent; deferOutbox = mocks.deferOutbox;
} }));

vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
const { app, sendOutbox } = await import("../src/index.js");

function lookup(doctorId = ids.doctor, bookingValid = true) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    let data: unknown;
    if (input.includes("verify-for-medical-record")) data = { valid: bookingValid, appointment: { id: ids.appointment, patientId: ids.patient, doctorId: ids.doctor, status: "CHECKED_IN" } };
    else if (input.includes("doctors/by-user")) data = { id: doctorId, userId: "doctor-user", isActive: true };
    else if (input.includes("patients/by-user")) data = { id: ids.patient, userId: "patient-user" };
    else if (input.includes("patients/")) data = { id: ids.patient, userId: "patient-user" };
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

beforeEach(() => { vi.clearAllMocks(); lookup(); });

describe("Medical Record API authorization", () => {
  it("rejects a request without trusted identity", async () => {
    expect((await request(app).post("/api/v1/medical-records").send({})).status).toBe(401);
  });

  it("does not let a patient read another patient's record", async () => {
    mocks.findById.mockResolvedValue({ id: ids.record, patientId: ids.otherPatient, doctorId: ids.doctor, status: "FINAL" });
    const response = await request(app).get(`/api/v1/medical-records/${ids.record}`).set("X-User-Id", "patient-user").set("X-Role", "PATIENT");
    expect(response.status).toBe(403);
  });

  it("does not expose a draft result to the patient", async () => {
    mocks.findById.mockResolvedValue({ id: ids.record, patientId: ids.patient, doctorId: ids.doctor, status: "DRAFT" });
    const response = await request(app).get(`/api/v1/medical-records/${ids.record}`).set("X-User-Id", "patient-user").set("X-Role", "PATIENT");
    expect(response.status).toBe(404);
  });

  it("rejects an invalid appointment", async () => {
    lookup(ids.doctor, false);
    const response = await request(app).post("/api/v1/medical-records").set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .send({ appointmentId: ids.appointment, patientId: ids.patient, doctorId: ids.doctor });
    expect(response.status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a doctor who is not assigned to the appointment", async () => {
    lookup(ids.otherDoctor);
    const response = await request(app).post("/api/v1/medical-records").set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .send({ appointmentId: ids.appointment, patientId: ids.patient, doctorId: ids.doctor });
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a record for the assigned doctor and resolved patient", async () => {
    mocks.create.mockResolvedValue({ id: ids.record });
    const response = await request(app).post("/api/v1/medical-records").set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .send({ appointmentId: ids.appointment, patientId: ids.patient, doctorId: ids.doctor, diagnosis: "Demo" });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "doctor-user" }), "patient-user");
  });
});

describe("Medical Record outbox", () => {
  it("retains a failed notification event for retry", async () => {
    const event = { id: ids.record, eventType: "medical-record.created", payload: { recordId: ids.record, recipientUserId: ids.patient }, retryCount: 0 };
    mocks.pendingOutbox.mockResolvedValue([event]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await sendOutbox();
    expect(mocks.deferOutbox).toHaveBeenCalledWith(event.id, 0);
    expect(mocks.markOutboxSent).not.toHaveBeenCalled();
  });

  it("marks a delivered event sent using its stable event id", async () => {
    const event = { id: ids.record, eventType: "medical-record.created", payload: { recordId: ids.record, recipientUserId: ids.patient }, retryCount: 0 };
    mocks.pendingOutbox.mockResolvedValue([event]);
    const fetcher = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    await sendOutbox();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).eventId).toBe(event.id);
    expect(mocks.markOutboxSent).toHaveBeenCalledWith(event.id);
  });
});
