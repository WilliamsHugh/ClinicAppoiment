import { describe, expect, it, vi } from "vitest";
import { visibleRoutes, canAccessRoute } from "../src/lib/navigation/routes";
import type { Session, ClinicRole } from "../src/lib/session/session";

function createMockSession(role?: ClinicRole): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role ? { id: "user-123", role, displayName: `User ${role}` } : null,
    getAccessToken: vi.fn(async () => (role ? "valid-token" : null)),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

describe("USER-008 & USER-009: Next.js Session & Route Guards", () => {
  it("denies access to protected routes when unauthenticated", () => {
    const session = createMockSession();
    const usersRoute = { href: "/users", label: "Tài khoản", roles: ["ADMIN"] as const };
    const appointmentsRoute = { href: "/appointments", label: "Lịch hẹn", roles: ["DOCTOR", "STAFF", "ADMIN"] as const };

    expect(canAccessRoute(usersRoute, session)).toBe(false);
    expect(canAccessRoute(appointmentsRoute, session)).toBe(false);
  });

  it("permits ADMIN to access /users and all administrative routes", () => {
    const adminSession = createMockSession("ADMIN");
    const usersRoute = { href: "/users", label: "Tài khoản", roles: ["ADMIN"] as const };
    const healthRoute = { href: "/health", label: "Sức khỏe", roles: ["ADMIN"] as const };

    expect(canAccessRoute(usersRoute, adminSession)).toBe(true);
    expect(canAccessRoute(healthRoute, adminSession)).toBe(true);
  });

  it("prevents DOCTOR and STAFF from accessing /users admin page", () => {
    const doctorSession = createMockSession("DOCTOR");
    const staffSession = createMockSession("STAFF");
    const usersRoute = { href: "/users", label: "Tài khoản", roles: ["ADMIN"] as const };

    expect(canAccessRoute(usersRoute, doctorSession)).toBe(false);
    expect(canAccessRoute(usersRoute, staffSession)).toBe(false);
  });

  it("filters visible navigation links based on user role", () => {
    const staffSession = createMockSession("STAFF");
    const routes = visibleRoutes(staffSession);

    const hrefs = routes.map((r) => r.href);
    expect(hrefs).toContain("/appointments");
    expect(hrefs).toContain("/doctors");
    expect(hrefs).not.toContain("/users");
    expect(hrefs).not.toContain("/health");
  });
});
