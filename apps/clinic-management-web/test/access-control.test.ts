import { describe, expect, it, vi } from "vitest";
import {
  canViewSystemHealth,
  formatClientCheckedAt,
  getSystemServiceHealth,
  getSystemServiceStatus,
  isSystemAllHealthy,
  loadSystemHealth,
  resolveServiceStatus,
  SYSTEM_SERVICES,
} from "../src/features/health/health";
import { routeForPath, visibleRoutes } from "../src/lib/navigation/routes";
import type { ClinicRole, Session } from "../src/lib/session/session";

function session(role?: ClinicRole): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role ? { id: "user-1", role } : null,
    getAccessToken: async () => role ? "test-only-token" : null,
    signIn: vi.fn(),
    signOut: vi.fn()
  };
}

describe("route visibility", () => {
  it("does not expose protected navigation before a real session is injected", () => {
    expect(visibleRoutes(session()).map((route) => route.href)).toEqual([]);
  });

  it("shows doctor routes according to the trusted session role", () => {
    const doctorRoutes = visibleRoutes(session("DOCTOR")).map((route) => route.href);
    expect(doctorRoutes).toContain("/appointments");
    expect(doctorRoutes).toContain("/dashboard");
    expect(doctorRoutes).toContain("/doctors");
    expect(doctorRoutes).toContain("/medical-records");
    expect(doctorRoutes).not.toContain("/users");
    expect(doctorRoutes).not.toContain("/health");
  });

  it("keeps staff and admin navigation within their responsibilities", () => {
    const staffRoutes = visibleRoutes(session("STAFF")).map((route) => route.href);
    expect(staffRoutes).toContain("/appointments");
    expect(staffRoutes).toContain("/dashboard");
    expect(staffRoutes).toContain("/doctors");
    expect(staffRoutes).not.toContain("/medical-records");
    expect(staffRoutes).not.toContain("/users");
    expect(staffRoutes).not.toContain("/health");

    const adminRoutes = visibleRoutes(session("ADMIN")).map((route) => route.href);
    expect(adminRoutes).toContain("/dashboard");
    expect(adminRoutes).toContain("/users");
    expect(adminRoutes).toContain("/health");
    expect(adminRoutes).not.toContain("/medical-records");
  });

  it("does not expose clinic-management domain routes to patients", () => {
    expect(visibleRoutes(session("PATIENT")).map((route) => route.href)).toEqual([]);
  });

  it("resolves nested protected paths for the centralized route guard", () => {
    expect(routeForPath("/users/user-1")?.roles).toEqual(["ADMIN"]);
    expect(routeForPath("/profile")?.roles).toEqual(["DOCTOR", "STAFF", "ADMIN"]);
    expect(routeForPath("/dashboard")?.roles).toEqual(["DOCTOR", "STAFF", "ADMIN"]);
    expect(routeForPath("/")).toBeUndefined();
    expect(routeForPath("/auth")).toBeUndefined();
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

describe("system health service status mapping", () => {
  it("reads API Gateway status from the top-level gateway field", () => {
    const health = { gateway: "ok", status: "ok", services: { users: "ok" } };
    expect(getSystemServiceStatus(health, "api-gateway")).toBe("ok");
    expect(getSystemServiceStatus(health, "users")).toBe("ok");
  });

  it("supports a gateway entry in services for older response shapes", () => {
    const health = { status: "ok", services: { "api-gateway": "healthy" } };
    expect(getSystemServiceStatus(health, "api-gateway")).toBe("healthy");
  });

  it("maps exact service keys: users, doctors, appointments, medicalRecords, notifications", () => {
    const health = {
      gateway: "ok",
      status: "ok",
      services: {
        users: "ok",
        doctors: "ok",
        appointments: "unavailable",
        medicalRecords: "ok",
        notifications: "ok",
      },
    };

    expect(getSystemServiceStatus(health, "users")).toBe("ok");
    expect(getSystemServiceStatus(health, "doctors")).toBe("ok");
    expect(getSystemServiceStatus(health, "appointments")).toBe("unavailable");
    expect(getSystemServiceStatus(health, "medicalRecords")).toBe("ok");
    expect(getSystemServiceStatus(health, "notifications")).toBe("ok");
  });

  it("returns undefined for missing keys and does not infer names arbitrarily", () => {
    const health = {
      gateway: "ok",
      status: "ok",
      services: {
        users: "ok",
      },
    };

    expect(getSystemServiceStatus(health, "medicalRecords")).toBeUndefined();
    expect(getSystemServiceStatus(health, "nonExistentKey")).toBeUndefined();
  });
});

describe("resolveServiceStatus adapter", () => {
  it("resolves ok/healthy/up into healthy category without false alarm", () => {
    expect(resolveServiceStatus("ok")).toEqual({
      category: "healthy",
      rawStatus: "ok",
      label: "Hoạt động bình thường",
    });
    expect(resolveServiceStatus("HEALTHY")).toEqual({
      category: "healthy",
      rawStatus: "HEALTHY",
      label: "Hoạt động bình thường",
    });
    expect(resolveServiceStatus("up")).toEqual({
      category: "healthy",
      rawStatus: "up",
      label: "Hoạt động bình thường",
    });
  });

  it("resolves degraded/warning into degraded category", () => {
    expect(resolveServiceStatus("degraded")).toEqual({
      category: "degraded",
      rawStatus: "degraded",
      label: "Cảnh báo suy giảm",
    });
    expect(resolveServiceStatus("warning")).toEqual({
      category: "degraded",
      rawStatus: "warning",
      label: "Cảnh báo suy giảm",
    });
  });

  it("resolves down/unhealthy/error/unavailable into down category", () => {
    expect(resolveServiceStatus("down")).toEqual({
      category: "down",
      rawStatus: "down",
      label: "Mất kết nối",
    });
    expect(resolveServiceStatus("unavailable")).toEqual({
      category: "down",
      rawStatus: "unavailable",
      label: "Mất kết nối",
    });
    expect(resolveServiceStatus("error")).toEqual({
      category: "down",
      rawStatus: "error",
      label: "Mất kết nối",
    });
  });

  it("resolves missing or undefined status to 'Chưa xác định' - not down or healthy", () => {
    const resolvedMissing = resolveServiceStatus(undefined);
    expect(resolvedMissing.category).toBe("unknown");
    expect(resolvedMissing.label).toBe("Chưa xác định");
    expect(resolvedMissing.category).not.toBe("down");
    expect(resolvedMissing.category).not.toBe("healthy");

    const resolvedUnknown = resolveServiceStatus("maintenance");
    expect(resolvedUnknown.category).toBe("unknown");
    expect(resolvedUnknown.category).not.toBe("down");
    expect(resolvedUnknown.category).not.toBe("healthy");
  });
});

describe("isSystemAllHealthy and formatting helpers", () => {
  it("determines overall health strictly based on status string", () => {
    expect(isSystemAllHealthy({ status: "ok" })).toBe(true);
    expect(isSystemAllHealthy({ status: "healthy" })).toBe(true);
    expect(isSystemAllHealthy({ status: "degraded" })).toBe(false);
    expect(isSystemAllHealthy({ status: "unavailable" })).toBe(false);
    expect(isSystemAllHealthy(null)).toBe(false);
    expect(isSystemAllHealthy(undefined)).toBe(false);
  });

  it("formats client checkedAt with Vietnam timezone", () => {
    const date = new Date("2026-11-13T05:30:00.000Z"); // 12:30:00 VN
    const formatted = formatClientCheckedAt(date);
    expect(formatted).toContain("12:30");
    expect(formatted).toContain("13/11/2026");
    expect(formatClientCheckedAt(null)).toBe("Đang kiểm tra");
  });

  it("defines all 6 canonical services in SYSTEM_SERVICES", () => {
    const keys = SYSTEM_SERVICES.map((s) => s.key);
    expect(keys).toEqual([
      "api-gateway",
      "users",
      "doctors",
      "appointments",
      "medicalRecords",
      "notifications",
    ]);
  });
});
