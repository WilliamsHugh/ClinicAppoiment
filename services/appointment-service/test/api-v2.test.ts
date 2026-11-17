import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, repository } from "../src/index.js";

const patientUserId = "00000000-0000-4000-8000-000000000301";
const patientOwnedId = "00000000-0000-4000-8000-000000000401";
const doctorUserId = "00000000-0000-4000-8000-000000000501";
const doctorOwnedId = "00000000-0000-4000-8000-000000000011";
const staffUserId = "00000000-0000-4000-8000-000000000601";

const patientHeaders = { "X-User-Id": patientUserId, "X-Role": "PATIENT" };
const doctorHeaders = { "X-User-Id": doctorUserId, "X-Role": "DOCTOR" };
const staffHeaders = { "X-User-Id": staffUserId, "X-Role": "STAFF" };

const internalRecordToken = "appointment-to-record-test-token-32-bytes";
const internalDoctorToken = "doctor-internal-test-token-with-32-bytes";
const internalUserToken = "appointment-to-user-test-token-at-least-32-bytes";
const grantToken = "appointment-to-record-grant-verification-test-token";

beforeEach(() => {
  repository.clear();
  vi.stubEnv("APPOINTMENT_RECORD_INTERNAL_API_TOKEN", internalRecordToken);
  vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", internalDoctorToken);
  vi.stubEnv("USER_APPOINTMENT_INTERNAL_API_TOKEN", internalUserToken);
  vi.stubEnv("RECORD_APPOINTMENT_INTERNAL_API_TOKEN", grantToken);

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/internal/v1/medical-records/access-grants/verify")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const valid = body.grantId === "grant-test-token-123" && body.patientId === patientOwnedId &&
        body.doctorId === doctorOwnedId && body.sessionId === "session-test-123";
      return new Response(JSON.stringify({ success: true, data: { valid } }), { status: 200 });
    }
    if (url.includes("/internal/v1/patients/by-user/")) {
      return new Response(JSON.stringify({ success: true, data: { id: patientOwnedId, userId: patientUserId } }), { status: 200 });
    }
    if (url.includes("/internal/v1/doctors/by-user/")) {
      return new Response(JSON.stringify({ success: true, data: { id: doctorOwnedId, userId: doctorUserId, isActive: true } }), { status: 200 });
    }
    if (url.includes("/internal/v1/patients/lookup")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const items = (body.patientIds ?? []).map((id: string) => ({ id, fullName: `Patient ${id.slice(0, 4)}` }));
      return new Response(JSON.stringify({ success: true, data: { items } }), { status: 200 });
    }
    if (url.includes("/internal/v1/doctors/lookup")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const items = (body.doctorIds ?? []).map((id: string) => ({
        id, displayName: `Dr ${id.slice(0, 4)}`, specialtyId: "00000000-0000-4000-8000-000000000099", specialtyName: "Cardiology", isActive: true
      }));
      return new Response(JSON.stringify({ success: true, data: { items } }), { status: 200 });
    }
    if (url.includes("/internal/v1/patients/")) {
      return new Response(JSON.stringify({ success: true, data: { id: patientOwnedId, userId: patientUserId, fullName: "Nguyen Van A" } }), { status: 200 });
    }
    if (url.includes("/internal/v1/medical-records/by-appointment/")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: "00000000-0000-4000-8000-000000000999",
          appointmentId: url.split("/").pop(),
          patientId: patientOwnedId,
          doctorId: doctorOwnedId,
          status: "FINAL",
          updatedBy: doctorUserId
        }
      }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Appointment Service v2 APIs", () => {
  describe("GET /api/v1/appointments standardization", () => {
    it("returns summary view by default without reason", async () => {
      repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: "2026-11-15T08:00:00.000Z",
        scheduledEndAt: "2026-11-15T08:30:00.000Z",
        reason: "Secret chest pain",
        createdBy: patientUserId
      });

      const res = await request(app).get("/api/v1/appointments").set(patientHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].reason).toBeUndefined();
    });

    it("returns detail view with reason for patient owner", async () => {
      repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: "2026-11-15T08:00:00.000Z",
        scheduledEndAt: "2026-11-15T08:30:00.000Z",
        reason: "Secret chest pain",
        createdBy: patientUserId
      });

      const res = await request(app).get("/api/v1/appointments?view=detail").set(patientHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.items[0].reason).toBe("Secret chest pain");
    });

    it("rejects doctor detail view without clinical grant", async () => {
      repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: "2026-11-15T08:00:00.000Z",
        scheduledEndAt: "2026-11-15T08:30:00.000Z",
        reason: "Secret clinical reason",
        createdBy: patientUserId
      });

      const res = await request(app).get(`/api/v1/appointments?view=detail&patientId=${patientOwnedId}`).set(doctorHeaders);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CLINICAL_VERIFICATION_REQUIRED");
    });

    it("allows doctor detail view with clinical grant", async () => {
      repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: "2026-11-15T08:00:00.000Z",
        scheduledEndAt: "2026-11-15T08:30:00.000Z",
        reason: "Secret clinical reason",
        createdBy: patientUserId
      });

      const res = await request(app)
        .get(`/api/v1/appointments?view=detail&patientId=${patientOwnedId}`)
        .set(doctorHeaders)
        .set("X-Session-Id", "session-test-123")
        .set("X-Clinical-Grant", "grant-test-token-123");
      expect(res.status).toBe(200);
      expect(res.body.data.items[0].reason).toBe("Secret clinical reason");
    });

    it("rejects an invented grant and does not expose clinical reason", async () => {
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId,
        scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z",
        reason: "Private reason", createdBy: patientUserId });
      const res = await request(app).get(`/api/v1/appointments?view=detail&patientId=${patientOwnedId}`)
        .set(doctorHeaders).set("X-Session-Id", "session-test-123").set("X-Clinical-Grant", "invented-grant");
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain("Private reason");
    });

    it("filters by multi-value status", async () => {
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", status: "PENDING", createdBy: patientUserId });
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T09:00:00.000Z", scheduledEndAt: "2026-11-15T09:30:00.000Z", status: "CONFIRMED", createdBy: patientUserId });
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T10:00:00.000Z", scheduledEndAt: "2026-11-15T10:30:00.000Z", status: "CANCELLED", createdBy: patientUserId });

      const res = await request(app).get("/api/v1/appointments?status=PENDING,CONFIRMED").set(staffHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items.map((i: any) => i.status).sort()).toEqual(["CONFIRMED", "PENDING"]);
    });

    it("includes names when include=names is requested", async () => {
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", createdBy: patientUserId });

      const res = await request(app).get("/api/v1/appointments?include=names").set(staffHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.items[0].patientSummary).toBeDefined();
      expect(res.body.data.items[0].doctorSummary).toBeDefined();
      expect(res.body.data.items[0].doctorSummary.displayName).toContain("Dr ");
    });

    it("fails with 503 when name lookup fails", async () => {
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", createdBy: patientUserId });
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Downstream unreachable"));

      const res = await request(app).get("/api/v1/appointments?include=names").set(staffHeaders);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    });
  });

  describe("GET /api/v1/appointments/summary", () => {
    it("rejects PATIENT role with 403", async () => {
      const res = await request(app)
        .get("/api/v1/appointments/summary?from=2026-11-15T00:00:00.000Z&to=2026-11-16T00:00:00.000Z")
        .set(patientHeaders);
      expect(res.status).toBe(403);
    });

    it("calculates server-side metrics and status counts in Asia/Ho_Chi_Minh", async () => {
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T02:00:00.000Z", scheduledEndAt: "2026-11-15T02:30:00.000Z", status: "CHECKED_IN", createdBy: patientUserId });
      repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T04:00:00.000Z", scheduledEndAt: "2026-11-15T04:30:00.000Z", status: "COMPLETED", createdBy: patientUserId });

      const res = await request(app)
        .get("/api/v1/appointments/summary?from=2026-11-14T17:00:00.000Z&to=2026-11-15T17:00:00.000Z")
        .set(staffHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.timezone).toBe("Asia/Ho_Chi_Minh");
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.countsByStatus.CHECKED_IN).toBe(1);
      expect(res.body.data.countsByStatus.COMPLETED).toBe(1);
      expect(res.body.data.countsByStatus.PENDING).toBe(0);
      expect(Array.isArray(res.body.data.daily)).toBe(true);
      expect(res.body.data.daily.length).toBeGreaterThan(0);
    });
  });

  describe("POST /internal/v1/appointments/:id/check-eligibility", () => {
    it("requires APPOINTMENT_RECORD_INTERNAL_API_TOKEN", async () => {
      const appt = repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", status: "CHECKED_IN", createdBy: patientUserId });
      const res = await request(app).post(`/internal/v1/appointments/${appt.id}/check-eligibility`);
      expect(res.status).toBe(401);
    });

    it("returns eligible=true when status is CHECKED_IN", async () => {
      const appt = repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", status: "CHECKED_IN", createdBy: patientUserId });
      const res = await request(app)
        .post(`/internal/v1/appointments/${appt.id}/check-eligibility`)
        .set("X-Internal-Token", internalRecordToken);
      expect(res.status).toBe(200);
      expect(res.body.data.eligible).toBe(true);
      expect(res.body.data.status).toBe("CHECKED_IN");
      expect(res.body.data.doctorId).toBe(doctorOwnedId);
      expect(res.body.data.patientId).toBe(patientOwnedId);
    });

    it("returns eligible=false when status is PENDING or CONFIRMED", async () => {
      const appt = repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", status: "CONFIRMED", createdBy: patientUserId });
      const res = await request(app)
        .post(`/internal/v1/appointments/${appt.id}/check-eligibility`)
        .set("X-Internal-Token", internalRecordToken);
      expect(res.status).toBe(200);
      expect(res.body.data.eligible).toBe(false);
      expect(res.body.data.status).toBe("CONFIRMED");
    });
  });

  describe("POST /internal/v1/appointments/:id/complete-from-record", () => {
    it("accepts snake_case record_id and completes checked-in appointment", async () => {
      const appt = repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", status: "CHECKED_IN", createdBy: patientUserId });
      const res = await request(app)
        .post(`/internal/v1/appointments/${appt.id}/complete-from-record`)
        .set("X-Internal-Token", internalRecordToken)
        .send({ record_id: "00000000-0000-4000-8000-000000000999", doctor_id: doctorOwnedId });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");

      // Idempotent replay
      const replay = await request(app)
        .post(`/internal/v1/appointments/${appt.id}/complete-from-record`)
        .set("X-Internal-Token", internalRecordToken)
        .send({ record_id: "00000000-0000-4000-8000-000000000999" });
      expect(replay.status).toBe(200);
      expect(replay.body.data.status).toBe("COMPLETED");
    });
  });

  describe("Legacy GET /api/v1/appointments/:id/complete", () => {
    it("returns 409 MEDICAL_RECORD_REQUIRED", async () => {
      const appt = repository.create({ patientId: patientOwnedId, doctorId: doctorOwnedId, scheduledStartAt: "2026-11-15T08:00:00.000Z", scheduledEndAt: "2026-11-15T08:30:00.000Z", createdBy: patientUserId });
      const res = await request(app)
        .get(`/api/v1/appointments/${appt.id}/complete`)
        .set(doctorHeaders);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("MEDICAL_RECORD_REQUIRED");
    });
  });

  describe("End-to-end Idempotency on Reschedule and State Transitions (M2-BOOKING-006 & G07)", () => {
    const futureStart = "2030-01-10T09:00:00.000Z";
    const futureEnd = "2030-01-10T09:30:00.000Z";
    const rescheduledStart = "2030-01-10T10:00:00.000Z";
    const rescheduledEnd = "2030-01-10T10:30:00.000Z";

    beforeEach(() => {
      // Mock verify-slot to return true for doctor tests
      const originalFetch = vi.mocked(fetch);
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/internal/v1/doctors/verify-slot")) {
          return new Response(JSON.stringify({ success: true, data: { valid: true } }), { status: 200 });
        }
        return originalFetch(input, init);
      }));
    });

    it("reschedules with idempotency key, replays on exact match, and returns 409 on mismatch", async () => {
      const appt = repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: futureStart,
        scheduledEndAt: futureEnd,
        status: "PENDING",
        createdBy: patientUserId
      });

      const body = { scheduledStartAt: rescheduledStart, scheduledEndAt: rescheduledEnd, reason: "Busy morning" };
      const res1 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/reschedule`)
        .set(patientHeaders)
        .set("Idempotency-Key", "resched-key-101")
        .send(body);
      expect(res1.status).toBe(200);
      expect(res1.body.data.scheduledStartAt).toBe(rescheduledStart);

      // Replay with exact same key and payload -> 200 replayed
      const res2 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/reschedule`)
        .set(patientHeaders)
        .set("Idempotency-Key", "resched-key-101")
        .send(body);
      expect(res2.status).toBe(200);
      expect(res2.body.data.id).toBe(appt.id);

      // Replay with different payload -> 409 IDEMPOTENCY_KEY_REUSED
      const resMismatch = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/reschedule`)
        .set(patientHeaders)
        .set("Idempotency-Key", "resched-key-101")
        .send({ scheduledStartAt: "2030-01-10T14:00:00.000Z", scheduledEndAt: "2030-01-10T14:30:00.000Z", reason: "Afternoon" });
      expect(resMismatch.status).toBe(409);
      expect(resMismatch.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("cancels with idempotency key, replays on exact match, and returns 409 on mismatch", async () => {
      const appt = repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: futureStart,
        scheduledEndAt: futureEnd,
        status: "PENDING",
        createdBy: patientUserId
      });

      const body = { reason: "Cannot make it" };
      const res1 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/cancel`)
        .set(patientHeaders)
        .set("Idempotency-Key", "cancel-key-202")
        .send(body);
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe("CANCELLED");

      // Replay with exact same key and payload -> 200 replayed
      const res2 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/cancel`)
        .set(patientHeaders)
        .set("Idempotency-Key", "cancel-key-202")
        .send(body);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe("CANCELLED");

      // Replay with different payload -> 409 IDEMPOTENCY_KEY_REUSED
      const resMismatch = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/cancel`)
        .set(patientHeaders)
        .set("Idempotency-Key", "cancel-key-202")
        .send({ reason: "Different reason" });
      expect(resMismatch.status).toBe(409);
      expect(resMismatch.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("confirms with idempotency key, replays on exact match, and returns 409 on mismatch", async () => {
      const appt = repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: futureStart,
        scheduledEndAt: futureEnd,
        status: "PENDING",
        createdBy: patientUserId
      });

      const body = { reason: "Staff verified insurance" };
      const res1 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/confirm`)
        .set(staffHeaders)
        .set("Idempotency-Key", "confirm-key-303")
        .send(body);
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe("CONFIRMED");

      // Replay with exact same key and payload -> 200 replayed
      const res2 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/confirm`)
        .set(staffHeaders)
        .set("Idempotency-Key", "confirm-key-303")
        .send(body);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe("CONFIRMED");

      // Replay with different payload -> 409 IDEMPOTENCY_KEY_REUSED
      const resMismatch = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/confirm`)
        .set(staffHeaders)
        .set("Idempotency-Key", "confirm-key-303")
        .send({ reason: "Different notes" });
      expect(resMismatch.status).toBe(409);
      expect(resMismatch.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("checks in with idempotency key, replays on exact match, and returns 409 on mismatch", async () => {
      const appt = repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: futureStart,
        scheduledEndAt: futureEnd,
        status: "CONFIRMED",
        createdBy: patientUserId
      });

      const body = { reason: "Arrived at clinic counter" };
      const res1 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/check-in`)
        .set(staffHeaders)
        .set("Idempotency-Key", "checkin-key-404")
        .send(body);
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe("CHECKED_IN");

      // Replay with exact same key and payload -> 200 replayed
      const res2 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/check-in`)
        .set(staffHeaders)
        .set("Idempotency-Key", "checkin-key-404")
        .send(body);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe("CHECKED_IN");

      // Replay with different payload -> 409 IDEMPOTENCY_KEY_REUSED
      const resMismatch = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/check-in`)
        .set(staffHeaders)
        .set("Idempotency-Key", "checkin-key-404")
        .send({ reason: "Different checkin notes" });
      expect(resMismatch.status).toBe(409);
      expect(resMismatch.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("records no-show with idempotency key, replays on exact match, and returns 409 on mismatch", async () => {
      const appt = repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: futureStart,
        scheduledEndAt: futureEnd,
        status: "CONFIRMED",
        createdBy: patientUserId
      });

      const body = { reason: "Did not arrive after 30m" };
      const res1 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/no-show`)
        .set(staffHeaders)
        .set("Idempotency-Key", "noshow-key-505")
        .send(body);
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe("NO_SHOW");

      // Replay with exact same key and payload -> 200 replayed
      const res2 = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/no-show`)
        .set(staffHeaders)
        .set("Idempotency-Key", "noshow-key-505")
        .send(body);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe("NO_SHOW");

      // Replay with different payload -> 409 IDEMPOTENCY_KEY_REUSED
      const resMismatch = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/no-show`)
        .set(staffHeaders)
        .set("Idempotency-Key", "noshow-key-505")
        .send({ reason: "Other reason" });
      expect(resMismatch.status).toBe(409);
      expect(resMismatch.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("rejects an idempotency key longer than 255 characters with 400 VALIDATION_ERROR", async () => {
      const appt = repository.create({
        patientId: patientOwnedId,
        doctorId: doctorOwnedId,
        scheduledStartAt: futureStart,
        scheduledEndAt: futureEnd,
        status: "CONFIRMED",
        createdBy: patientUserId
      });

      const oversizedKey = "k".repeat(256);
      const res = await request(app)
        .patch(`/api/v1/appointments/${appt.id}/check-in`)
        .set(staffHeaders)
        .set("Idempotency-Key", oversizedKey)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
