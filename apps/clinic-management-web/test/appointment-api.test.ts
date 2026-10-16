import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/lib/api/client";
import { allowedActions, appointmentApi, clinicDayRange, clinicTime, queueError } from "../src/features/appointments/appointment-api";
import type { ClinicRole } from "../src/lib/session/session";
import { cancelled, confirmed, doctorId, envelope, failure, gateway, noShow, patientId, pending, slot } from "./queue-fixtures";

function api(fetcher = gateway(), role: ClinicRole = "STAFF") {
  return appointmentApi(new ApiClient({ baseUrl: "http://gateway.test", session: { getAccessToken: async () => "synthetic-token" }, fetcher }), role);
}
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-07T00:00:00Z")); });
afterEach(() => vi.restoreAllMocks());

describe("Queue Board Gateway contract", () => {
  it("uses a half-open Vietnam day even when the browser is in another timezone", () => {
    expect(clinicDayRange("2030-01-07")).toEqual({ from: "2030-01-06T17:00:00.000Z", to: "2030-01-07T17:00:00.000Z" });
    expect(clinicTime("2030-01-07T01:00:00Z")).toBe("08:00");
    expect(() => clinicDayRange("2030-02-30")).toThrow();
    expect(() => clinicDayRange("")).toThrow();
  });
  it("loads all pages and deduplicates foreign lookups without using ADMIN user routes", async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({ ...pending, id: `appointment-${index}` }));
    const fetcher = gateway(items);
    const service = api(fetcher);
    expect(await service.listDay("2030-01-07")).toHaveLength(101);
    const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.filter((url) => url.pathname === "/api/v1/appointments").map((url) => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(urls.filter((url) => url.pathname.startsWith("/api/v1/patients/"))).toHaveLength(1);
    expect(urls.filter((url) => url.pathname === `/api/v1/doctors/${doctorId}`)).toHaveLength(1);
    expect(urls.some((url) => url.pathname.startsWith("/api/v1/users"))).toBe(false);
    await service.listDay("2030-01-07");
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/patients/"))).toHaveLength(1);
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer synthetic-token");
    expect(headers.has("X-Role")).toBe(false);
  });
  it("scopes every doctor patient lookup to its appointment and skips terminal records", async () => {
    const fetcher = gateway([pending, confirmed, cancelled, noShow]);
    const rows = await api(fetcher, "DOCTOR").listDay("2030-01-07");
    const patientUrls = fetcher.mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.pathname.includes("/patients/"));
    expect(patientUrls.map((url) => url.searchParams.get("appointmentId")).sort()).toEqual([pending.id, confirmed.id].sort());
    expect(rows.find((row) => row.id === cancelled.id)?.patientName).toBe("Chưa có tên bệnh nhân");
  });
  it("retains appointments with readable fallbacks when foreign services fail; retries names on refresh", async () => {
    let failed = true;
    const fetcher = gateway([pending], (url) => failed && url.pathname.includes("/patients/") ? failure("DEPENDENCY_UNAVAILABLE", 503) : undefined);
    const service = api(fetcher);
    const [row] = await service.listDay("2030-01-07");
    expect(row.patientName).not.toContain(patientId);
    expect(row.identityUnavailable).toBe(true);
    failed = false;
    expect((await service.listDay("2030-01-07"))[0].patientName).toBe("Nguyễn Văn An");
  });
  it("rejects malformed appointment status rather than dropping a patient from the board", async () => {
    const fetcher = gateway([pending], (url) => url.pathname === "/api/v1/appointments" ? envelope({ items: [{ ...pending, status: "IN_PROGRESS" }], page: 1, limit: 100, total: 1 }) : undefined);
    await expect(api(fetcher).listDay("2030-01-07")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("does not swallow session expiry during name resolution", async () => {
    const fetcher = gateway([pending], (url) => url.pathname.includes("/patients/") ? failure("AUTH_TOKEN_INVALID", 401) : undefined);
    await expect(api(fetcher).listDay("2030-01-07")).rejects.toMatchObject({ status: 401 });
  });
  it("does not silently accept incomplete paginated data", async () => {
    const fetcher = gateway([], (url) => url.pathname === "/api/v1/appointments" ? envelope({ items: [], page: 1, limit: 100, total: 101 }) : undefined);
    await expect(api(fetcher).listDay("2030-01-07")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it.each(["confirm", "check-in", "no-show", "cancel", "reschedule"] as const)("sends the correct %s route and JSON body", async (action) => {
    const fetcher = gateway();
    const item = action === "check-in" || action === "no-show" ? confirmed : pending;
    await api(fetcher).mutate(item, action, "  Theo yêu cầu  ", action === "reschedule" ? slot : undefined);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(`http://gateway.test/api/v1/appointments/${item.id}/${action}`);
    expect(options?.method).toBe("PATCH");
    expect(JSON.parse(String(options?.body))).toEqual(action === "reschedule" ? {
      reason: "Theo yêu cầu", scheduledStartAt: slot.startAt, scheduledEndAt: slot.endAt,
    } : { reason: "Theo yêu cầu" });
  });
  it.each(["DOCTOR", "PATIENT"] as const)("blocks all reception mutations for %s", async (role) => {
    const fetcher = gateway();
    await expect(api(fetcher, role).mutate(pending, "confirm")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["STAFF", "ADMIN"] as const)("exposes only legal actions for %s; never completion", (role) => {
    expect(allowedActions(role, "PENDING")).toEqual(["confirm", "reschedule", "cancel"]);
    expect(allowedActions(role, "CONFIRMED")).toEqual(["check-in", "no-show", "reschedule", "cancel"]);
    for (const state of ["CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] as const) expect(allowedActions(role, state)).toEqual([]);
  });
  it("validates reason and future slots before sending a write", async () => {
    const fetcher = gateway(); const service = api(fetcher);
    await expect(service.mutate(pending, "cancel", "   ")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(service.mutate(pending, "reschedule", "Đổi giờ", { ...slot, endAt: slot.startAt })).rejects.toMatchObject({ code: "APPOINTMENT_SLOT_INVALID" });
    await expect(service.mutate(pending, "cancel", "x".repeat(501))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("only offers future, valid slots from the selected clinic day", async () => {
    const fetcher = gateway([], (url) => url.pathname.endsWith("/available-slots") ? envelope([
      slot, { startAt: "2030-01-06T23:00:00Z", endAt: "2030-01-06T23:30:00Z" },
      { startAt: "2030-01-08T01:00:00Z", endAt: "2030-01-08T01:30:00Z" },
    ]) : undefined);
    expect(await api(fetcher).slots(doctorId, "2030-01-07")).toEqual([slot]);
  });
  it("preserves structured server errors without automatically retrying unsafe PATCH", async () => {
    const fetcher = gateway([], () => failure("APPOINTMENT_SLOT_UNAVAILABLE"));
    await expect(api(fetcher).mutate(pending, "reschedule", "Đổi giờ", slot)).rejects.toMatchObject({ code: "APPOINTMENT_SLOT_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(queueError(new Error("secret database connection"))).not.toContain("secret");
  });
});
