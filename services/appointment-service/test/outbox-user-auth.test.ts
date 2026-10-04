import { afterEach, describe, expect, it, vi } from "vitest";
import { AppointmentOutboxWorker } from "../src/outbox-worker.js";
import type { PostgresAppointmentRepository } from "../src/postgres-repository.js";

const patientId = "00000000-0000-4000-8000-000000000023";
const userId = "00000000-0000-4000-8000-000000000022";
const event = { id: "00000000-0000-4000-8000-000000000027", eventType: "appointment.created",
  aggregateId: "00000000-0000-4000-8000-000000000028", retryCount: 1,
  claimToken: "00000000-0000-4000-8000-000000000029",
  payload: { appointmentId: "00000000-0000-4000-8000-000000000028",
    patientId, scheduledStartAt: "2030-01-07T01:00:00.000Z" } };

function fixture(send: typeof fetch) {
  const repository = {
    claimOutbox: vi.fn().mockResolvedValue([event]),
    markOutboxSent: vi.fn().mockResolvedValue(true),
    deferOutbox: vi.fn().mockResolvedValue(true)
  } as unknown as PostgresAppointmentRepository;
  return { repository, worker: new AppointmentOutboxWorker(repository,
    "http://user-service", "http://notification-service", send) };
}

afterEach(() => vi.unstubAllEnvs());

describe("Appointment outbox User lookup authentication", () => {
  it("does not fetch or send an event without its private User credential", async () => {
    vi.stubEnv("USER_APPOINTMENT_INTERNAL_API_TOKEN", "");
    const send = vi.fn();
    const { repository, worker } = fixture(send as typeof fetch);
    expect(await worker.dispatchBatch()).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(repository.deferOutbox).toHaveBeenCalledWith(event.id, event.claimToken,
      "PATIENT_LOOKUP_UNAVAILABLE");
    expect(repository.markOutboxSent).not.toHaveBeenCalled();
  });

  it.each(["unauthorized", "wrong patient", "malformed", "timeout"])
  ("keeps the event pending when User lookup is %s", async (failure) => {
    const token = "appointment-to-user-test-token-at-least-32-bytes";
    vi.stubEnv("USER_APPOINTMENT_INTERNAL_API_TOKEN", token);
    const send = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("X-Internal-Token")).toBe(token);
      if (failure === "timeout") throw new DOMException("timed out", "TimeoutError");
      if (failure === "unauthorized") return new Response(null, { status: 401 });
      return Response.json({ success: true, data: {
        id: failure === "wrong patient" ? "00000000-0000-4000-8000-000000000099" : patientId,
        userId: failure === "malformed" ? "not-a-uuid" : userId
      } });
    });
    const { repository, worker } = fixture(send as typeof fetch);
    expect(await worker.dispatchBatch()).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(repository.deferOutbox).toHaveBeenCalledWith(event.id, event.claimToken,
      "PATIENT_LOOKUP_UNAVAILABLE");
    expect(repository.markOutboxSent).not.toHaveBeenCalled();
  });
});
