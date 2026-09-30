import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppointmentOccupancy, DependencyError } from "../src/dependencies.js";

const doctorId = "00000000-0000-4000-8000-000000000001";
const from = "2030-01-07T00:00:00.000Z";
const to = "2030-01-07T03:00:00.000Z";
const slot = { startAt: "2030-01-07T01:00:00.000Z", endAt: "2030-01-07T01:30:00.000Z" };

afterEach(() => vi.unstubAllGlobals());

describe("Appointment Service occupancy client", () => {
  it("uses the internal path, query and request ID, returning only UTC slot fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [{ ...slot, patientId: "private-patient" }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const occupancy = createAppointmentOccupancy("http://appointment-service:3003")!;

    await expect(occupancy.occupied(doctorId, from, to, "occupancy-req-1")).resolves.toEqual([slot]);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/internal/v1/appointments/occupied-slots");
    expect(url.searchParams.get("doctorId")).toBe(doctorId);
    expect(url.searchParams.get("from")).toBe(from);
    expect(url.searchParams.get("to")).toBe(to);
    expect(options.headers).toEqual({ Accept: "application/json", "X-Request-Id": "occupancy-req-1" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the optional upper bound for future appointments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createAppointmentOccupancy("http://appointment-service:3003")!.occupied(doctorId, from);
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.has("to")).toBe(false);
  });

  it.each([
    [502, { success: false, error: { code: "SERVICE_UNAVAILABLE" } }],
    [200, null],
    [200, { success: true, data: [null] }],
    [200, { success: true, data: [{ startAt: to, endAt: from }] }],
    [200, { success: true, data: [{ startAt: "2030-01-07", endAt: to }] }]
  ])("rejects an invalid upstream response (%i, %j)", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
    await expect(createAppointmentOccupancy("http://appointment-service:3003")!.occupied(doctorId, from, to))
      .rejects.toBeInstanceOf(DependencyError);
  });

  it("fails when the Appointment Service request times out", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: URL, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    })));
    await expect(createAppointmentOccupancy("http://appointment-service:3003", 10)!.occupied(doctorId, from))
      .rejects.toBeInstanceOf(DependencyError);
  });
});
