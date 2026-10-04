import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { app, repository } from "../src/index.js";

const recordToken = "record-internal-test-token-with-32-bytes";
const notificationToken = "notification-internal-test-token-with-32-bytes";
const doctorToken = "doctor-internal-test-token-with-32-bytes";
const doctorId = randomUUID();
const doctorUserId = randomUUID();
const patientId = randomUUID();
const recordId = randomUUID();

beforeEach(() => {
  repository.clear();
  vi.stubEnv("APPOINTMENT_RECORD_INTERNAL_API_TOKEN", recordToken);
  vi.stubEnv("APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN", notificationToken);
  vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", doctorToken);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function fixture(status: "CHECKED_IN" | "PENDING" = "CHECKED_IN") {
  return repository.create({ patientId, doctorId, status, createdBy: randomUUID(),
    scheduledStartAt: "2030-01-07T01:00:00.000Z", scheduledEndAt: "2030-01-07T01:30:00.000Z" });
}

describe("internal appointment callers", () => {
  it("rejects missing and wrong tokens before exposing occupancy or record context", async () => {
    const item = fixture();
    expect((await request(app).get("/internal/v1/appointments/occupied-slots")).status).toBe(401);
    expect((await request(app).get(`/internal/v1/appointments/${item.id}/verify-for-medical-record`)
      .set("X-Internal-Token", notificationToken)).status).toBe(401);
    expect((await request(app).get(`/internal/v1/appointments/${item.id}/reminder-context`)
      .set("X-Internal-Token", recordToken)).status).toBe(401);
    const response = await request(app).get(`/internal/v1/appointments/${item.id}/reminder-context`)
      .set("X-Internal-Token", notificationToken);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id: item.id, patientId, status: "CHECKED_IN",
      scheduledStartAt: item.scheduledStartAt });
  });

  it("completes only a matching final record, then replays the same record id", async () => {
    const item = fixture();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/medical-records/by-appointment/"))
        return Response.json({ success: true, data: { id: recordId, appointmentId: item.id,
          patientId, doctorId, status: "FINAL", createdBy: doctorUserId } });
      if (url.includes("/doctors/by-user/"))
        return Response.json({ success: true, data: { id: doctorId, userId: doctorUserId, isActive: true } });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const path = `/internal/v1/appointments/${item.id}/complete-from-record`;
    expect((await request(app).post(path).send({ recordId })).status).toBe(401);
    const first = await request(app).post(path).set("X-Internal-Token", recordToken).send({ recordId });
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ id: item.id, status: "COMPLETED", recordId });
    const replay = await request(app).post(path).set("X-Internal-Token", recordToken).send({ recordId });
    expect(replay.status).toBe(200);
    expect(repository.findById(item.id)?.status).toBe("COMPLETED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await request(app).post(path).set("X-Internal-Token", recordToken)
      .send({ recordId: randomUUID() })).status).toBe(409);
  });

  it("refuses a mismatched record without changing appointment state", async () => {
    const item = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true,
      data: { id: recordId, appointmentId: item.id, patientId: randomUUID(), doctorId,
        status: "FINAL", createdBy: doctorUserId } })));
    const response = await request(app).post(`/internal/v1/appointments/${item.id}/complete-from-record`)
      .set("X-Internal-Token", recordToken).send({ recordId });
    expect(response.status).toBe(422);
    expect(repository.findById(item.id)?.status).toBe("CHECKED_IN");
  });

  it("requires the Record credential for completion before consulting dependencies", async () => {
    const item = fixture();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const path = `/internal/v1/appointments/${item.id}/complete-from-record`;
    for (const token of [undefined, doctorToken, notificationToken]) {
      const call = request(app).post(path).send({ recordId });
      const response = await (token ? call.set("X-Internal-Token", token) : call);
      expect(response.status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.findById(item.id)?.status).toBe("CHECKED_IN");
  });

  it("does not complete an appointment that has not checked in", async () => {
    const item = fixture("PENDING");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(app).post(`/internal/v1/appointments/${item.id}/complete-from-record`)
      .set("X-Internal-Token", recordToken).send({ recordId });
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.findById(item.id)?.status).toBe("PENDING");
  });

  it.each([
    ["another record ID", { id: randomUUID() }],
    ["another appointment", { appointmentId: randomUUID() }],
    ["another patient", { patientId: randomUUID() }],
    ["another doctor", { doctorId: randomUUID() }],
    ["a non-final record", { status: "DRAFT" }],
    ["an invalid author", { createdBy: "not-a-user-id" }]
  ])("rejects %s in Record response without completing", async (_label, change) => {
    const item = fixture();
    const record = { id: recordId, appointmentId: item.id, patientId, doctorId,
      status: "FINAL", createdBy: doctorUserId, ...change };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, data: record }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(app).post(`/internal/v1/appointments/${item.id}/complete-from-record`)
      .set("X-Internal-Token", recordToken).send({ recordId });
    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(repository.findById(item.id)?.status).toBe("CHECKED_IN");
  });

  it.each(["unavailable", "timeout"]) ("fails closed when Record is %s", async (failure) => {
    const item = fixture();
    const fetchMock = vi.fn().mockImplementation(() => failure === "timeout"
      ? Promise.reject(new DOMException("timed out", "TimeoutError"))
      : Promise.resolve(new Response(null, { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(app).post(`/internal/v1/appointments/${item.id}/complete-from-record`)
      .set("X-Internal-Token", recordToken).send({ recordId });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(repository.findById(item.id)?.status).toBe("CHECKED_IN");
  });

  it.each(["wrong doctor", "unavailable", "timeout"]) ("fails closed when Doctor lookup has %s", async (failure) => {
    const item = fixture();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/medical-records/by-appointment/"))
        return Response.json({ success: true, data: { id: recordId, appointmentId: item.id,
          patientId, doctorId, status: "FINAL", createdBy: doctorUserId } });
      if (failure === "timeout") throw new DOMException("timed out", "TimeoutError");
      if (failure === "unavailable") return new Response(null, { status: 503 });
      return Response.json({ success: true, data: { id: randomUUID(), userId: doctorUserId, isActive: true } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(app).post(`/internal/v1/appointments/${item.id}/complete-from-record`)
      .set("X-Internal-Token", recordToken).send({ recordId });
    expect(response.status).toBe(failure === "wrong doctor" ? 422 : 503);
    expect(response.body.error.code).toBe(failure === "wrong doctor"
      ? "RECORD_CONTEXT_MISMATCH" : "DEPENDENCY_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(repository.findById(item.id)?.status).toBe("CHECKED_IN");
  });
});
