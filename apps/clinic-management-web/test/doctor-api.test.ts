import { describe, expect, it, vi } from "vitest";
import { doctorActivityError, doctorApi, type Schedule } from "../src/features/doctors/doctor-api";
import { ApiClient, ApiClientError } from "../src/lib/api/client";

describe("Doctor API Gateway routes", () => {
  const schedule: Schedule = { id: "schedule-1", doctorId: "doctor-1", weekday: 0, startTime: "08:00", endTime: "12:00", slotDurationMinutes: 30, isActive: true };
  const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "Content-Type": "application/json" } });
  const clientFor = (fetcher: typeof fetch) => new ApiClient({ baseUrl: "http://gateway.test", session: { getAccessToken: async () => "synthetic-token" }, fetcher });

  it("reads every schedule page and keeps inactive sessions", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return envelope({ items: [{ ...schedule, id: `schedule-${page}`, isActive: page === 1 }], page, limit: 1, total: 2 });
    });
    const rows = await doctorApi(clientFor(fetcher)).allSchedules("doctor-1");
    expect(rows).toHaveLength(2); expect(rows[1]?.isActive).toBe(false);
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("page"))).toEqual(["1", "2"]);
    expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).pathname === "/api/v1/doctors/doctor-1/schedules")).toBe(true);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer synthetic-token");
  });

  it.each([
    { items: [], page: 1, limit: 100, total: 1 },
    { items: [schedule], page: 0, limit: 100, total: 1 },
    { items: [schedule], page: 1, limit: 0, total: 1 },
    { items: [{ ...schedule, doctorId: "another-doctor" }], page: 1, limit: 100, total: 1 },
    { items: [{ ...schedule, weekday: 7 }], page: 1, limit: 100, total: 1 },
    { items: [{ ...schedule, startTime: "25:00" }], page: 1, limit: 100, total: 1 },
    { items: [{ ...schedule, endTime: "07:00" }], page: 1, limit: 100, total: 1 },
  ])("rejects incomplete, foreign or invalid calendar data %#", async (data) => {
    await expect(doctorApi(clientFor(vi.fn<typeof fetch>(async () => envelope(data)))).allSchedules("doctor-1"))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("passes cancellation to paginated schedule requests", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, options) => {
      expect(options?.signal?.aborted).toBe(true);
      throw new DOMException("Aborted", "AbortError");
    });
    const controller = new AbortController(); controller.abort();
    await expect(doctorApi(clientFor(fetcher)).allSchedules("doctor-1", controller.signal)).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("switch writes only isActive and requires the matching authoritative response", async () => {
    const doctor = { id: "doctor-1", userId: "user-1", specialtyId: "spec-1", displayName: "Bác sĩ An", bio: null, isActive: false };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(envelope(doctor)).mockResolvedValueOnce(envelope({ ...doctor, id: "doctor-2" }))
      .mockResolvedValueOnce(envelope({ ...doctor, isActive: true }));
    const api = doctorApi(clientFor(fetcher));
    expect((await api.setDoctorActivity("doctor-1", false)).isActive).toBe(false);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://gateway.test/api/v1/doctors/doctor-1");
    expect(options?.method).toBe("PATCH"); expect(JSON.parse(String(options?.body))).toEqual({ isActive: false });
    await expect(api.setDoctorActivity("doctor-1", false)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.setDoctorActivity("doctor-1", false)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("explains booked-appointment conflict without exposing backend details", () => {
    expect(doctorActivityError(new ApiClientError("Private SQL info", 409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS"))).toContain("còn lịch hẹn tương lai");
    for (const status of [401, 403, 404, 409, 502]) expect(doctorActivityError(new ApiClientError("Private SQL info", status, "FAILURE"))).not.toContain("Private");
    expect(doctorActivityError(new ApiClientError("Private SQL info", 200, "INVALID_RESPONSE"))).not.toContain("Private");
  });
  it("updates time off under the selected doctor", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { id: "off-1", doctorId: "doctor-1", reason: "Training" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new ApiClient({ baseUrl: "http://gateway.test",
      session: { getAccessToken: async () => "token" }, fetcher });

    await doctorApi(client).updateTimeOff("doctor-1", "off-1", { reason: "Training" });

    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://gateway.test/api/v1/doctors/doctor-1/time-offs/off-1");
    expect(options?.method).toBe("PATCH");
    expect(options?.body).toBe(JSON.stringify({ reason: "Training" }));
  });
});
