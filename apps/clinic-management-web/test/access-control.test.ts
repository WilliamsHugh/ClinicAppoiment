import { describe, expect, it, vi } from "vitest";
import { canViewSystemHealth, loadSystemHealth } from "../src/features/health/health";
import { visibleRoutes } from "../src/lib/navigation/routes";
import type { ClinicRole, Session } from "../src/lib/session/session";

function session(role?: ClinicRole): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role ? { id: "user-1", role } : null,
    getAccessToken: async () => role ? "test-only-token" : null
  };
}

describe("route visibility", () => {
  it("does not expose protected navigation before a real session is injected", () => {
    expect(visibleRoutes(session()).map((route) => route.href)).toEqual(["/"]);
  });

  it("shows doctor routes according to the trusted session role", () => {
    const doctorRoutes = visibleRoutes(session("DOCTOR")).map((route) => route.href);
    expect(doctorRoutes).toContain("/appointments");
    expect(doctorRoutes).toContain("/doctors");
    expect(doctorRoutes).toContain("/medical-records");
    expect(doctorRoutes).not.toContain("/users");
    expect(doctorRoutes).not.toContain("/health");
  });

  it("keeps staff and admin navigation within their responsibilities", () => {
    const staffRoutes = visibleRoutes(session("STAFF")).map((route) => route.href);
    expect(staffRoutes).toContain("/appointments");
    expect(staffRoutes).toContain("/doctors");
    expect(staffRoutes).not.toContain("/medical-records");
    expect(staffRoutes).not.toContain("/users");
    expect(staffRoutes).not.toContain("/health");

    const adminRoutes = visibleRoutes(session("ADMIN")).map((route) => route.href);
    expect(adminRoutes).toContain("/users");
    expect(adminRoutes).toContain("/health");
  });

  it("does not expose clinic-management domain routes to patients", () => {
    expect(visibleRoutes(session("PATIENT")).map((route) => route.href)).toEqual(["/"]);
  });
});

describe("system health authorization", () => {
  it.each([undefined, "PATIENT", "DOCTOR", "STAFF"] as const)("does not call Gateway for role %s", async (role) => {
    const api = { get: vi.fn() };
    const currentSession = session(role);
    expect(canViewSystemHealth(currentSession)).toBe(false);
    await expect(loadSystemHealth(api, currentSession)).rejects.toThrow("FORBIDDEN");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("allows ADMIN and calls the protected Gateway endpoint", async () => {
    const api = { get: vi.fn().mockResolvedValue({ data: { status: "ok", services: {} } }) };
    const admin = session("ADMIN");
    expect(canViewSystemHealth(admin)).toBe(true);
    await expect(loadSystemHealth(api, admin)).resolves.toMatchObject({ data: { status: "ok" } });
    expect(api.get).toHaveBeenCalledWith("/api/v1/system/health");
  });
});
