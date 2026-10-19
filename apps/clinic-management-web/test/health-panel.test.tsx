import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HealthPanel } from "../src/features/health/health-panel";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React });

let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function makeSession(role?: ClinicRole): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role ? { id: "user-1", role, displayName: "Quản Trị Viên" } : null,
    getAccessToken: async () => (role ? "test-token" : null),
    signIn: async () => {},
    signOut: async () => {},
  };
}

describe("HealthPanel (M3-UI-HEALTH-001)", () => {
  it("denies access to DOCTOR role", () => {
    currentSession = makeSession("DOCTOR");
    const html = renderToStaticMarkup(React.createElement(HealthPanel));
    expect(html).toContain("chỉ dành cho quản trị viên");
  });

  it("denies access to STAFF role", () => {
    currentSession = makeSession("STAFF");
    const html = renderToStaticMarkup(React.createElement(HealthPanel));
    expect(html).toContain("chỉ dành cho quản trị viên");
  });

  it("renders health overview structure for ADMIN", () => {
    currentSession = makeSession("ADMIN");
    const html = renderToStaticMarkup(React.createElement(HealthPanel));
    // When loading or rendered, checks for admin-allowed elements
    expect(html).not.toContain("chỉ dành cho quản trị viên");
  });
});
