import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HealthPanel } from "../src/features/health/health-panel";
import { ServiceStatusBadge } from "../src/features/health/service-status-badge";
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

  it("renders health overview structure for ADMIN with all 6 services", () => {
    currentSession = makeSession("ADMIN");
    const html = renderToStaticMarkup(React.createElement(HealthPanel));
    expect(html).not.toContain("chỉ dành cho quản trị viên");
    expect(html).toContain("Hạ tầng hệ thống");
    expect(html).toContain("Kiểm tra lại");
    expect(html).toContain("API Gateway");
    expect(html).toContain("User Service");
    expect(html).toContain("Doctor Service");
    expect(html).toContain("Appointment Service");
    expect(html).toContain("Medical Record Service");
    expect(html).toContain("Notification Service");
    expect(html).toContain("aria-busy");
  });
});

describe("ServiceStatusBadge Component", () => {
  it("renders healthy status with icon and label", () => {
    const html = renderToStaticMarkup(React.createElement(ServiceStatusBadge, { rawStatus: "ok" }));
    expect(html).toContain("Hoạt động bình thường");
    expect(html).toMatch(/_badgeSuccess/);
  });

  it("renders degraded status with icon and label", () => {
    const html = renderToStaticMarkup(React.createElement(ServiceStatusBadge, { rawStatus: "degraded" }));
    expect(html).toContain("Cảnh báo suy giảm");
    expect(html).toMatch(/_badgeWarning/);
  });

  it("renders disconnected status with icon and label", () => {
    const html = renderToStaticMarkup(React.createElement(ServiceStatusBadge, { rawStatus: "unavailable" }));
    expect(html).toContain("Mất kết nối");
    expect(html).toMatch(/_badgeDanger/);
  });

  it("renders undefined or unknown status as 'Chưa xác định' neutral badge", () => {
    const htmlMissing = renderToStaticMarkup(React.createElement(ServiceStatusBadge, { rawStatus: undefined }));
    expect(htmlMissing).toContain("Chưa xác định");
    expect(htmlMissing).toMatch(/_badgeNeutral/);
    expect(htmlMissing).not.toContain("Mất kết nối");
    expect(htmlMissing).not.toContain("Hoạt động bình thường");

    const htmlUnknown = renderToStaticMarkup(React.createElement(ServiceStatusBadge, { rawStatus: "foo-status" }));
    expect(htmlUnknown).toContain("foo-status");
    expect(htmlUnknown).toMatch(/_badgeNeutral/);
  });
});
