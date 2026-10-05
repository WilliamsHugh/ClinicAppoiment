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
  claimOutbox: vi.fn(), markOutboxSent: vi.fn(), deferOutbox: vi.fn(), outboxStatusCounts: vi.fn()
}));
vi.mock("pg", () => ({ Pool: class { query = vi.fn() } }));
vi.mock("../src/repository.js", () => ({ MedicalRecordRepository: class {
  findById = mocks.findById; findAll = mocks.findAll; create = mocks.create; update = mocks.update;
  findByAppointmentId = mocks.findByAppointmentId; claimOutbox = mocks.claimOutbox;
  markOutboxSent = mocks.markOutboxSent; deferOutbox = mocks.deferOutbox; outboxStatusCounts = mocks.outboxStatusCounts;
} }));

vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
const internalToken = "record-appointment-boundary-test-token-123456";
const notificationToken = "record-notification-boundary-test-token-123456";
const doctorToken = "record-doctor-boundary-test-token-123456";
const userRecordToken = "record-user-boundary-test-token-123456";
vi.stubEnv("APPOINTMENT_RECORD_INTERNAL_API_TOKEN", internalToken);
vi.stubEnv("NOTIFICATION_INTERNAL_API_TOKEN", notificationToken);
vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", doctorToken);
vi.stubEnv("USER_RECORD_INTERNAL_API_TOKEN", userRecordToken);
const { app, sendOutbox } = await import("../src/index.js");

function lookup(doctorId = ids.doctor, bookingValid = true) {
  const fetcher = vi.fn(async (input: string, _init?: RequestInit) => {
    let data: unknown;
    if (input.includes("verify-for-medical-record")) data = { valid: bookingValid, appointment: { id: ids.appointment, patientId: ids.patient, doctorId: ids.doctor, status: "CHECKED_IN" } };
    else if (input.includes("doctors/by-user")) data = { id: doctorId, userId: "doctor-user", isActive: true };
    else if (input.includes("patients/by-user")) data = { id: ids.patient, userId: "patient-user" };
    else if (input.includes("patients/")) data = { id: ids.patient, userId: "patient-user" };
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
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

  it("sends the Record-only User credential on both Patient lookups", async () => {
    const fetcher = lookup();
    mocks.findAll.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    mocks.create.mockResolvedValue({ id: ids.record });
    const list = await request(app).get("/api/v1/medical-records")
      .set("X-User-Id", "patient-user").set("X-Role", "PATIENT");
    const create = await request(app).post("/api/v1/medical-records")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .send({ appointmentId: ids.appointment, patientId: ids.patient, doctorId: ids.doctor });
    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
    const patientCalls = fetcher.mock.calls.filter(([url]) => url.includes("/internal/v1/patients/"));
    expect(patientCalls).toHaveLength(2);
    expect(patientCalls.map(([url]) => url)).toEqual([
      expect.stringContaining("/internal/v1/patients/by-user/patient-user"),
      expect.stringContaining(`/internal/v1/patients/${ids.patient}`)
    ]);
    expect(patientCalls.every(([, options]) => new Headers(options?.headers).get("X-Internal-Token") === userRecordToken)).toBe(true);
  });

  it("fails closed before a Patient lookup when the Record credential is missing", async () => {
    const fetcher = lookup();
    vi.stubEnv("USER_RECORD_INTERNAL_API_TOKEN", "");
    const response = await request(app).get("/api/v1/medical-records")
      .set("X-User-Id", "patient-user").set("X-Role", "PATIENT");
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("USER_RECORD_INTERNAL_API_TOKEN", userRecordToken);
  });
});

describe("Medical Record outbox", () => {
  it("retains a failed notification event for retry", async () => {
    const event = { id: ids.record, eventType: "medical-record.created", payload: { recordId: ids.record, recipientUserId: ids.patient }, retryCount: 0 };
    mocks.claimOutbox.mockResolvedValue([event]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await sendOutbox();
    expect(mocks.deferOutbox).toHaveBeenCalledWith(event.id, 0);
    expect(mocks.markOutboxSent).not.toHaveBeenCalled();
  });

  it("marks a delivered event sent using its stable event id", async () => {
    const event = { id: ids.record, eventType: "medical-record.created", payload: { recordId: ids.record, recipientUserId: ids.patient }, retryCount: 0 };
    mocks.claimOutbox.mockResolvedValue([event]);
    const fetcher = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    await sendOutbox();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).eventId).toBe(event.id);
    expect(fetcher.mock.calls[0][1].headers["X-Internal-Token"]).toBe(notificationToken);
    expect(mocks.markOutboxSent).toHaveBeenCalledWith(event.id);
  });

  it("calls the authenticated completion command with the committed record id", async () => {
    const event = { id: ids.record, eventType: "appointment.complete", payload: { appointmentId: ids.appointment, recordId: ids.record }, retryCount: 0 };
    mocks.claimOutbox.mockResolvedValue([event]);
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await sendOutbox();
    expect(fetcher.mock.calls[0][0]).toContain(`/internal/v1/appointments/${ids.appointment}/complete-from-record`);
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(fetcher.mock.calls[0][1].headers["X-Internal-Token"]).toBe(internalToken);
    expect(fetcher.mock.calls[0][1].headers["X-Role"]).toBeUndefined();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ recordId: ids.record });
    expect(mocks.markOutboxSent).toHaveBeenCalledWith(event.id);
  });

  it("replays an older completion event using its stored record aggregate ID", async () => {
    const event = { id: ids.record, aggregateId: ids.record, eventType: "appointment.complete",
      payload: { appointmentId: ids.appointment, doctorUserId: ids.doctor }, retryCount: 0 };
    mocks.claimOutbox.mockResolvedValue([event]);
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await sendOutbox();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ recordId: ids.record });
  });

  it("does not mark a failed completion as sent", async () => {
    mocks.claimOutbox.mockResolvedValue([{ id: ids.record, eventType: "appointment.complete", payload: { appointmentId: ids.appointment, recordId: ids.record }, retryCount: 0 }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await sendOutbox();
    expect(mocks.deferOutbox).toHaveBeenCalledWith(ids.record, 0);
    expect(mocks.markOutboxSent).not.toHaveBeenCalled();
  });
});

describe("Medical Record internal lookup", () => {
  it("rejects missing and invalid caller tokens before reading the record", async () => {
    expect((await request(app).get(`/internal/v1/medical-records/by-appointment/${ids.appointment}`)).status).toBe(401);
    expect((await request(app).get(`/internal/v1/medical-records/by-appointment/${ids.appointment}`).set("X-Internal-Token", "invalid")).status).toBe(401);
    expect(mocks.findByAppointmentId).not.toHaveBeenCalled();
  });

  it("returns only fields required for completion", async () => {
    mocks.findByAppointmentId.mockResolvedValue({ id: ids.record, appointmentId: ids.appointment,
      patientId: ids.patient, doctorId: ids.doctor, status: "FINAL", createdBy: ids.doctor,
      diagnosis: "private diagnosis", prescription: [{ medicineName: "private" }] });
    const response = await request(app).get(`/internal/v1/medical-records/by-appointment/${ids.appointment}`)
      .set("X-Internal-Token", internalToken);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id: ids.record, appointmentId: ids.appointment,
      patientId: ids.patient, doctorId: ids.doctor, status: "FINAL", createdBy: ids.doctor });
  });
});
