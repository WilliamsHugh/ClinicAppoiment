import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { RouteGuard } from "../src/components/route-guard";
import { ApiClientError, toUserFriendlyError } from "../src/lib/api/client";
import type { ClinicRole, Session } from "../src/lib/session/session";

// Setup global React
Object.assign(globalThis, { React });

let mockPathname = "/";
let currentSession: Session;

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function makeSession(role?: ClinicRole): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role ? { id: "user-1", role, displayName: "Nguyễn Văn A" } : null,
    getAccessToken: async () => (role ? "test-token" : null),
    signIn: async () => {},
    signOut: async () => {},
  };
}

describe("AppShell & RouteGuard (M3-UI-LEAD-004, M3-UI-LEAD-005)", () => {
  describe("AppShell", () => {
    it("renders Health&Human brand name and mark", () => {
      currentSession = makeSession("STAFF");
      mockPathname = "/dashboard";
      const html = renderToStaticMarkup(<AppShell>Content</AppShell>);
      expect(html).toContain("Health&amp;Human");
      expect(html).toContain("Content");
    });

    it("renders NotificationSlot when provided", () => {
      currentSession = makeSession("DOCTOR");
      mockPathname = "/dashboard";
      const slot = <span id="custom-popover">TV4 Popover Here</span>;
      const html = renderToStaticMarkup(<AppShell NotificationSlot={slot}>Content</AppShell>);
      expect(html).toContain("notification-slot");
      expect(html).toContain("TV4 Popover Here");
    });

    it("renders fallback notification link when NotificationSlot is not provided", () => {
      currentSession = makeSession("DOCTOR");
      mockPathname = "/dashboard";
      const html = renderToStaticMarkup(<AppShell>Content</AppShell>);
      expect(html).toContain("href=\"/notifications\"");
      expect(html).toContain("Thông báo");
    });

    it("bypasses AppShell chrome for /auth route (M3-WEB-001)", () => {
      currentSession = makeSession();
      mockPathname = "/auth";
      const html = renderToStaticMarkup(
        <AppShell>
          <div id="auth-page-content">Trang Đăng Nhập Full Canvas</div>
        </AppShell>
      );
      expect(html).toContain("auth-page-content");
      expect(html).toContain("Trang Đăng Nhập Full Canvas");
      expect(html).not.toContain("shell-sidebar");
      expect(html).not.toContain("topbar");
      expect(html).not.toContain("Health&amp;Human");
    });

    it("shows the public home directly to an authenticated user", () => {
      currentSession = makeSession("STAFF");
      mockPathname = "/";
      const html = renderToStaticMarkup(<AppShell>Clinic Home</AppShell>);

      expect(html).toContain("Clinic Home");
      expect(html).not.toContain("shell-sidebar");
      expect(html).not.toContain("topbar");
    });

    it("keeps the authenticated application shell focused on work routes", () => {
      currentSession = makeSession("STAFF");
      mockPathname = "/dashboard";
      const html = renderToStaticMarkup(<AppShell>Dashboard</AppShell>);

      expect(html).not.toContain("Trang chủ");
      expect(html).toContain("Tổng quan");
      expect(html).not.toContain("Trợ lý phòng khám");
      expect(html).toContain("Nhân viên phòng khám");
      expect(html.match(/Nhân viên phòng khám/g)).toHaveLength(1);
    });
  });

  describe("RouteGuard (403 Forbidden)", () => {
    it("renders 403 Forbidden screen when role is unauthorized for the route", () => {
      currentSession = makeSession("DOCTOR");
      mockPathname = "/users"; // /users is ADMIN only
      const html = renderToStaticMarkup(
        <RouteGuard>
          <div>Admin Only Secret Content</div>
        </RouteGuard>
      );
      expect(html).toContain("403 · KHÔNG CÓ QUYỀN TRUY CẬP");
      expect(html).toContain("Truy cập khu vực bị giới hạn");
      expect(html).toContain("DOCTOR");
      expect(html).not.toContain("Admin Only Secret Content");
      expect(html).toContain("Về trang chủ");
    });

    it("allows access when role is authorized", () => {
      currentSession = makeSession("ADMIN");
      mockPathname = "/users"; // ADMIN can access /users
      const html = renderToStaticMarkup(
        <RouteGuard>
          <div>Admin Authorized Content</div>
        </RouteGuard>
      );
      expect(html).toContain("Admin Authorized Content");
      expect(html).not.toContain("403");
    });

    it("redirects and shows loading indicator when unauthenticated user accesses protected route", () => {
      currentSession = makeSession(); // unauthenticated
      mockPathname = "/profile"; // /profile is protected
      const html = renderToStaticMarkup(
        <RouteGuard>
          <div>Profile Secret Content</div>
        </RouteGuard>
      );
      expect(html).toContain("Đang chuyển hướng đến trang đăng nhập...");
      expect(html).not.toContain("Profile Secret Content");
      expect(html).not.toContain("403");
    });
  });

  describe("toUserFriendlyError", () => {
    it("translates 409 APPOINTMENT_SLOT_UNAVAILABLE to helpful message", () => {
      const err = new ApiClientError("Slot taken", 409, "APPOINTMENT_SLOT_UNAVAILABLE");
      const msg = toUserFriendlyError(err);
      expect(msg).toContain("Khung giờ này vừa có người đặt");
    });

    it("translates 401 and 403 status codes", () => {
      const err401 = new ApiClientError("Unauthorized", 401, "UNAUTHORIZED");
      expect(toUserFriendlyError(err401)).toContain("Phiên đăng nhập đã hết hạn");

      const err403 = new ApiClientError("Forbidden", 403, "FORBIDDEN");
      expect(toUserFriendlyError(err403)).toContain("không có quyền");
    });

    it("translates 500 server errors", () => {
      const err500 = new ApiClientError("Internal Server Error", 500, "SERVER_ERROR");
      expect(toUserFriendlyError(err500)).toContain("tạm thời không khả dụng");
    });
  });
});
