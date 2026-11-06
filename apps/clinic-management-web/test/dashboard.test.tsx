import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../src/features/dashboard/dashboard-page";
import type { ClinicRole, Session } from "../src/lib/session/session";

// Setup global React
Object.assign(globalThis, { React });

let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function renderDashboard(role?: ClinicRole) {
  currentSession = {
    status: role ? "authenticated" : "unauthenticated",
    identity: role
      ? { id: "user-1", role, displayName: role === "DOCTOR" ? "BS. Trần Văn A" : "Quản Trị Viên" }
      : null,
    getAccessToken: async () => (role ? "test-token" : null),
    signIn: async () => {},
    signOut: async () => {},
  };
  return renderToStaticMarkup(React.createElement(DashboardPage));
}

describe("Clinic Dashboard Page (M3-UI-DASH-001)", () => {
  it("does not render the protected dashboard when session is unauthenticated", () => {
    const html = renderDashboard();
    expect(html).toContain("Cần đăng nhập");
    expect(html).not.toContain("Lịch khám hôm nay");
  });

  it("renders the shared page header and doctor actions", () => {
    const html = renderDashboard("DOCTOR");
    expect(html).toContain(">Tổng quan</h1>");
    expect(html).toContain("Theo dõi lịch khám trong ngày");
    expect(html).toContain("Hồ sơ bệnh án");
    expect(html).toContain("Hàng đợi khám");
    expect(html).toContain("Lịch khám hôm nay");
    expect(html).toContain("Tiến độ hôm nay");
    expect(html).toContain("Đang chờ khám (đã check-in)");
    expect(html).toContain("Xem tất cả lịch hẹn");
  });

  it("renders the shared page header and staff actions", () => {
    const html = renderDashboard("STAFF");
    expect(html).toContain(">Tổng quan</h1>");
    expect(html).toContain("Lịch bác sĩ");
    expect(html).toContain("Hàng đợi khám");
    expect(html).toContain("Hàng đợi cần xử lý");
    expect(html).toContain("Cần tiếp đón hôm nay");
    expect(html).toContain("Chờ xác nhận");
  });

  it("renders role-specific actions for ADMIN including System Health and User Management", () => {
    const html = renderDashboard("ADMIN");
    expect(html).toContain(">Tổng quan</h1>");
    expect(html).toContain("Quản trị người dùng");
    expect(html).toContain("Sức khỏe hệ thống");
    expect(html).toContain("Cổng API Gateway");
    expect(html).toContain("Dịch vụ Bác sĩ");
  });

  it("renders permission denied when an invalid or patient role accesses", () => {
    const html = renderDashboard("PATIENT" as unknown as ClinicRole);
    expect(html).toContain("Quyền truy cập bị từ chối");
    expect(html).toContain("Patient App");
  });

  it("renders stat cards and 7-day trend chart section", () => {
    const html = renderDashboard("STAFF");
    expect(html).toContain("Lịch khám hôm nay");
    expect(html).toContain("Đang chờ tiếp đón");
    expect(html).toContain("Đã hoàn thành");
    expect(html).toContain("Đã hủy / Vắng mặt");
    expect(html).toContain("Xu hướng 7 ngày");
  });
});
