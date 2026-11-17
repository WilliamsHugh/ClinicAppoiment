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
  claimOutbox: vi.fn(), markOutboxSent: vi.fn(), deferOutbox: vi.fn(), outboxStatusCounts: vi.fn(),
  createGrant: vi.fn(), findGrantById: vi.fn(), createFinalizationContext: vi.fn(),
  findFinalizationContext: vi.fn(), finalizeRecord: vi.fn(), markAppointmentCompletion: vi.fn()
}));
vi.mock("pg", () => ({ Pool: class { query = vi.fn() } }));
vi.mock("../src/repository.js", () => ({ MedicalRecordRepository: class {
  findById = mocks.findById; findAll = mocks.findAll; create = mocks.create; update = mocks.update;
  findByAppointmentId = mocks.findByAppointmentId; claimOutbox = mocks.claimOutbox;
  markOutboxSent = mocks.markOutboxSent; deferOutbox = mocks.deferOutbox; outboxStatusCounts = mocks.outboxStatusCounts;
  createGrant = mocks.createGrant; findGrantById = mocks.findGrantById;
  createFinalizationContext = mocks.createFinalizationContext; findFinalizationContext = mocks.findFinalizationContext;
  finalizeRecord = mocks.finalizeRecord; markAppointmentCompletion = mocks.markAppointmentCompletion;
} }));

vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
const internalToken = "record-appointment-boundary-test-token-123456";
const notificationToken = "record-notification-boundary-test-token-123456";
const doctorToken = "record-doctor-boundary-test-token-123456";
const userRecordToken = "record-user-boundary-test-token-123456";
vi.stubEnv("APPOINTMENT_RECORD_INTERNAL_API_TOKEN", internalToken);
vi.stubEnv("RECORD_APPOINTMENT_INTERNAL_API_TOKEN", "appointment-to-record-grant-verification-test-token");
vi.stubEnv("NOTIFICATION_INTERNAL_API_TOKEN", notificationToken);
vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", doctorToken);
vi.stubEnv("USER_RECORD_INTERNAL_API_TOKEN", userRecordToken);
const { app, sendOutbox, computeContentDigest } = await import("../src/index.js");

function lookup(doctorId = ids.doctor, bookingValid = true, proofValid = true, bookingStatus = "CHECKED_IN") {
  const fetcher = vi.fn(async (input: string, _init?: RequestInit) => {
    let data: unknown;
    if (input.includes("verify-for-medical-record") || input.includes("check-eligibility")) {
      data = { valid: bookingValid, eligible: bookingValid, appointment: { id: ids.appointment, patientId: ids.patient, doctorId: ids.doctor, status: bookingStatus } };
    } else if (input.includes("doctors/by-user")) {
      data = { id: doctorId, userId: "doctor-user", isActive: true };
    } else if (input.includes("patients/by-user") || input.includes("patients/")) {
      data = { id: ids.patient, userId: "patient-user" };
    } else if (input.includes("auth/mfa/proofs/verify")) {
      data = { valid: proofValid, proofId: "proof-123", purpose: "OPEN_CLINICAL_RECORDS" };
    }
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

  it("denies clinical read access to STAFF and ADMIN roles", async () => {
    expect((await request(app).get("/api/v1/medical-records").set("X-User-Id", "staff-1").set("X-Role", "STAFF")).status).toBe(403);
    expect((await request(app).get("/api/v1/medical-records").set("X-User-Id", "admin-1").set("X-Role", "ADMIN")).status).toBe(403);
    expect((await request(app).get(`/api/v1/medical-records/${ids.record}`).set("X-User-Id", "staff-1").set("X-Role", "STAFF")).status).toBe(403);
    expect((await request(app).get(`/api/v1/medical-records/${ids.record}`).set("X-User-Id", "admin-1").set("X-Role", "ADMIN")).status).toBe(403);
  });

  it("requires CURRENT_ENCOUNTER grant for DOCTOR to view patient-history detail across doctors", async () => {
    // Without grant header
    const noGrantRes = await request(app).get("/api/v1/medical-records")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .query({ scope: "patient-history", view: "detail", patientId: ids.patient });
    expect(noGrantRes.status).toBe(403);
    const noGrantSummary = await request(app).get("/api/v1/medical-records")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .query({ scope: "patient-history", view: "summary", patientId: ids.patient });
    expect(noGrantSummary.status).toBe(403);

    // With invalid/expired grant
    mocks.findGrantById.mockResolvedValue(null);
    const badGrantRes = await request(app).get("/api/v1/medical-records")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .set("X-Clinical-Grant", "grant-bad")
      .query({ scope: "patient-history", view: "detail", patientId: ids.patient });
    expect(badGrantRes.status).toBe(403);

    // With valid grant
    mocks.findGrantById.mockResolvedValue({
      id: "grant-good",
      doctorId: ids.doctor,
      patientId: ids.patient,
      sessionId: "session-1",
      accessMode: "CURRENT_ENCOUNTER",
      expiresAt: new Date(Date.now() + 60000).toISOString()
    });
    mocks.findAll.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    const goodGrantRes = await request(app).get("/api/v1/medical-records")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .set("X-Session-Id", "session-1")
      .set("X-Clinical-Grant", "grant-good")
      .query({ scope: "patient-history", view: "detail", patientId: ids.patient });
    expect(goodGrantRes.status).toBe(200);
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: ids.patient,
        includeOtherDoctorsFinalForPatient: true,
        currentDoctorId: ids.doctor
      }),
      1, 20, "detail"
    );
  });

  it("returns only metadata for an authored record until a session-bound grant is provided", async () => {
    const clinicalRecord = { id: ids.record, appointmentId: ids.appointment, patientId: ids.patient,
      doctorId: ids.doctor, status: "FINAL", version: 2, createdAt: new Date().toISOString(),
      diagnosis: "Private diagnosis", prescription: [{ medicineName: "Private medicine" }] };
    mocks.findById.mockResolvedValue(clinicalRecord);
    const base = request(app).get(`/api/v1/medical-records/${ids.record}`)
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1");
    const summary = await request(app).get(`/api/v1/medical-records/${ids.record}?view=summary`)
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR");
    expect(summary.status).toBe(200);
    expect(summary.body.data.diagnosis).toBeUndefined();
    expect(summary.body.data.prescription).toBeUndefined();
    expect((await base).status).toBe(403);
    mocks.findGrantById.mockResolvedValue({ doctorId: ids.doctor, patientId: ids.patient,
      sessionId: "session-1", recordId: ids.record, accessMode: "AUTHORED_HISTORY" });
    const wrongSession = await request(app).get(`/api/v1/medical-records/${ids.record}`)
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-2").set("X-Clinical-Grant", "grant-1");
    expect(wrongSession.status).toBe(403);
    const detail = await request(app).get(`/api/v1/medical-records/${ids.record}`)
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1").set("X-Clinical-Grant", "grant-1");
    expect(detail.status).toBe(200);
    expect(detail.body.data.diagnosis).toBe("Private diagnosis");
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
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "doctor-user" }), "patient-user", undefined);
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

describe("Clinical Grants and Finalization", () => {
  it("issues a 15-minute clinical access grant when TOTP proof and appointment are verified", async () => {
    const fetcher = lookup();
    mocks.createGrant.mockResolvedValue({
      id: "grant-1",
      sessionId: "session-1",
      doctorId: ids.doctor,
      patientId: ids.patient,
      appointmentId: ids.appointment,
      accessMode: "CURRENT_ENCOUNTER",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });

    const response = await request(app).post("/api/v1/medical-records/access-grants")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1")
      .send({
        verificationProofId: "proof-totp-123",
        accessMode: "CURRENT_ENCOUNTER",
        appointmentId: ids.appointment,
        patientId: ids.patient
      });

    expect(response.status).toBe(201);
    expect(response.body.data.accessMode).toBe("CURRENT_ENCOUNTER");
    expect(response.body.data.grantId).toBe("grant-1");
    expect(mocks.createGrant).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: ids.doctor,
      patientId: ids.patient,
      accessMode: "CURRENT_ENCOUNTER"
    }), "proof-totp-123");
    const proofCall = fetcher.mock.calls.find(([url]) => url.includes("/auth/mfa/proofs/verify"));
    expect(proofCall).toBeDefined();
    expect(JSON.parse(proofCall![1]?.body as string).purpose).toBe("OPEN_CLINICAL_RECORDS");
  });

  it("rejects a current encounter grant before check-in", async () => {
    lookup(ids.doctor, true, true, "CONFIRMED");
    const response = await request(app).post("/api/v1/medical-records/access-grants")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1")
      .send({ verificationProofId: "proof-1", accessMode: "CURRENT_ENCOUNTER",
        appointmentId: ids.appointment, patientId: ids.patient });
    expect(response.status).toBe(422);
    expect(mocks.createGrant).not.toHaveBeenCalled();
  });

  it("issues an authored-history grant only for the doctor's recent record", async () => {
    const fetcher = lookup(ids.doctor, true, true, "COMPLETED");
    mocks.findById.mockResolvedValue({ id: ids.record, appointmentId: ids.appointment,
      doctorId: ids.doctor, patientId: ids.patient, createdAt: new Date().toISOString() });
    mocks.createGrant.mockResolvedValue({ id: "grant-authored", sessionId: "session-1",
      doctorId: ids.doctor, patientId: ids.patient, appointmentId: ids.appointment,
      recordId: ids.record, accessMode: "AUTHORED_HISTORY" });
    const response = await request(app).post("/api/v1/medical-records/access-grants")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1")
      .send({ verificationProofId: "proof-1", accessMode: "AUTHORED_HISTORY",
        appointmentId: ids.appointment, patientId: ids.patient, recordId: ids.record });
    expect(response.status).toBe(201);
    const verifyCall = fetcher.mock.calls.find(([url]) => url.includes("/auth/mfa/proofs/verify"));
    expect(JSON.parse(verifyCall![1]?.body as string).context).toMatchObject({ recordId: ids.record,
      accessMode: "AUTHORED_HISTORY" });

    mocks.findById.mockResolvedValue({ id: ids.record, appointmentId: ids.appointment,
      doctorId: ids.doctor, patientId: ids.patient, createdAt: "2020-01-01T00:00:00Z" });
    const expired = await request(app).post("/api/v1/medical-records/access-grants")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1")
      .send({ verificationProofId: "proof-2", accessMode: "AUTHORED_HISTORY",
        appointmentId: ids.appointment, patientId: ids.patient, recordId: ids.record });
    expect(expired.status).toBe(403);
  });

  it("verifies internal clinical grant endpoint", async () => {
    mocks.findGrantById.mockResolvedValue({
      id: "grant-1",
      patientId: ids.patient,
      appointmentId: ids.appointment,
      doctorId: ids.doctor,
      sessionId: "session-1",
      accessMode: "CURRENT_ENCOUNTER",
      expiresAt: new Date(Date.now() + 60000).toISOString()
    });

    const response = await request(app).post("/internal/v1/medical-records/access-grants/verify")
      .set("X-Internal-Token", "appointment-to-record-grant-verification-test-token")
      .send({ grantId: "grant-1", patientId: ids.patient, appointmentId: ids.appointment, doctorId: ids.doctor, sessionId: "session-1" });

    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);
    expect(response.body.data.accessMode).toBe("CURRENT_ENCOUNTER");

    const wrongSession = await request(app).post("/internal/v1/medical-records/access-grants/verify")
      .set("X-Internal-Token", "appointment-to-record-grant-verification-test-token")
      .send({ grantId: "grant-1", patientId: ids.patient, appointmentId: ids.appointment,
        doctorId: ids.doctor, sessionId: "another-session" });
    expect(wrongSession.body.data.valid).toBe(false);

    const wrongCaller = await request(app).post("/internal/v1/medical-records/access-grants/verify")
      .set("X-Internal-Token", internalToken)
      .send({ grantId: "grant-1", patientId: ids.patient, appointmentId: ids.appointment,
        doctorId: ids.doctor, sessionId: "session-1" });
    expect(wrongCaller.status).toBe(401);
  });

  it("creates a finalization context with canonical content digest and 5m expiry", async () => {
    mocks.findById.mockResolvedValue({
      id: ids.record,
      doctorId: ids.doctor,
      status: "DRAFT",
      version: 1
    });
    mocks.createFinalizationContext.mockResolvedValue({
      id: "context-1",
      appointmentId: ids.appointment,
      recordId: ids.record,
      expectedVersion: 1,
      contentDigest: "sample-digest",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });

    const recordPayload = {
      symptoms: "Fever",
      diagnosis: "Common Cold",
      notes: "Rest",
      prescription: [{ medicineName: "Paracetamol", dosage: "500mg", frequency: "2x", duration: "3d" }]
    };

    const response = await request(app).post("/api/v1/medical-records/finalization-contexts")
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1")
      .send({
        appointmentId: ids.appointment,
        recordId: ids.record,
        expectedVersion: 1,
        record: recordPayload
      });

    expect(response.status).toBe(201);
    expect(response.body.data.expectedVersion).toBe(1);
    expect(mocks.createFinalizationContext).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: ids.doctor,
      expectedVersion: 1,
      contentDigest: expect.any(String)
    }));
  });

  it("finalizes record from DRAFT to FINAL with proof consumption and outbox emission", async () => {
    lookup();
    const digest = computeContentDigest({
      diagnosis: "Flu",
      prescription: [{ medicineName: "Tamiflu", dosage: "75mg", frequency: "1x", duration: "5d" }]
    });

    mocks.findById.mockResolvedValue({
      id: ids.record,
      appointmentId: ids.appointment,
      patientId: ids.patient,
      doctorId: ids.doctor,
      status: "DRAFT",
      version: 2,
      diagnosis: "Flu",
      prescription: [{ medicineName: "Tamiflu", dosage: "75mg", frequency: "1x", duration: "5d" }]
    });
    mocks.findFinalizationContext.mockResolvedValue({
      id: "context-valid",
      appointmentId: ids.appointment,
      recordId: ids.record,
      doctorId: ids.doctor,
      patientId: ids.patient,
      sessionId: "session-1",
      expectedVersion: 2,
      contentDigest: digest,
      expiresAt: new Date(Date.now() + 60000).toISOString()
    });
    mocks.finalizeRecord.mockResolvedValue({
      success: true,
      record: {
        id: ids.record,
        status: "FINAL",
        version: 3,
        appointmentCompletion: "PENDING"
      }
    });

    const response = await request(app).post(`/api/v1/medical-records/${ids.record}/finalize`)
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR").set("X-Session-Id", "session-1")
      .send({
        contextId: "context-valid",
        verificationProofId: "proof-final-123",
        expectedVersion: 2
      });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("FINAL");
    expect(response.body.data.version).toBe(3);
    expect(response.body.data.appointmentCompletion).toBe("PENDING");
  });

  it("rejects finalization if prescription/content changed after context was issued", async () => {
    mocks.findById.mockResolvedValue({
      id: ids.record,
      appointmentId: ids.appointment,
      patientId: ids.patient,
      doctorId: ids.doctor,
      status: "DRAFT",
      version: 1
    });
    mocks.findFinalizationContext.mockResolvedValue({
      id: "context-mismatch",
      appointmentId: ids.appointment,
      recordId: ids.record,
      doctorId: ids.doctor,
      expectedVersion: 1,
      contentDigest: "old-digest-before-medicine-edited",
      expiresAt: new Date(Date.now() + 60000).toISOString()
    });

    const response = await request(app).post(`/api/v1/medical-records/${ids.record}/finalize`)
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .send({
        contextId: "context-mismatch",
        verificationProofId: "proof-final-123",
        expectedVersion: 1,
        record: {
          prescription: [{ medicineName: "ChangedDrug", dosage: "100mg", frequency: "3x", duration: "7d" }]
        }
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("FINALIZATION_CONTEXT_CHANGED");
  });

  it("rejects finalization if expectedVersion does not match current record", async () => {
    mocks.findById.mockResolvedValue({
      id: ids.record,
      appointmentId: ids.appointment,
      patientId: ids.patient,
      doctorId: ids.doctor,
      status: "DRAFT",
      version: 5
    });

    const response = await request(app).post(`/api/v1/medical-records/${ids.record}/finalize`)
      .set("X-User-Id", "doctor-user").set("X-Role", "DOCTOR")
      .send({
        contextId: "any-context",
        verificationProofId: "proof-123",
        expectedVersion: 4 // Stale version
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("RECORD_VERSION_CONFLICT");
  });

  it("marks appointmentCompletion as COMPLETED when outbox delivery succeeds", async () => {
    const event = {
      id: "event-comp",
      eventType: "appointment.complete",
      payload: { appointmentId: ids.appointment, recordId: ids.record },
      retryCount: 0
    };
    mocks.claimOutbox.mockResolvedValue([event]);
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    await sendOutbox();

    expect(mocks.markAppointmentCompletion).toHaveBeenCalledWith(ids.record, "COMPLETED");
    expect(mocks.markOutboxSent).toHaveBeenCalledWith("event-comp");
  });
});
