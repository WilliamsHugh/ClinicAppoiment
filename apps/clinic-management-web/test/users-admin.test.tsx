// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { UserTable, type UserItem } from "../src/features/users/user-table";
import { UserRoleModal } from "../src/features/users/user-role-modal";
import { UserStatusModal } from "../src/features/users/user-status-modal";
import { PatientSelector } from "../src/features/users/patient-selector";
import { UsersPanel } from "../src/features/users/users-panel";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session = makeSession("ADMIN");
vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function makeSession(role?: ClinicRole, id = "u-1"): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role
      ? { id, role, displayName: "Nguyễn Quản Trị", email: "admin@clinic.local" }
      : null,
    getAccessToken: async () => (role ? "test-token" : null),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function envelope(data: unknown, pagination?: { page: number; limit: number; total: number }) {
  return new Response(JSON.stringify({ success: true, data, pagination }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Users & Roles Admin Components (M3-WEB-021)", () => {
  const mockUsers: UserItem[] = [
    {
      id: "u-1",
      email: "admin@clinic.local",
      fullName: "Nguyễn Quản Trị",
      phone: "0901234567",
      role: "ADMIN",
      status: "ACTIVE",
    },
    {
      id: "u-2",
      email: "doctor@clinic.local",
      fullName: "Bác Sĩ Hoàng",
      phone: "0912345678",
      role: "DOCTOR",
      status: "LOCKED",
    },
    {
      id: "u-3",
      email: "staff@clinic.local",
      fullName: "Lễ Tân Mai",
      role: "STAFF",
      status: "INACTIVE",
    },
  ];

  describe("UserTable", () => {
    it("renders user rows with correct information and badges", () => {
      const html = renderToStaticMarkup(
        <UserTable
          users={mockUsers}
          loading={false}
          page={1}
          limit={10}
          total={3}
          onPageChange={vi.fn()}
          onEditRole={vi.fn()}
          onEditStatus={vi.fn()}
        />
      );

      // Names & Emails
      expect(html).toContain("Nguyễn Quản Trị");
      expect(html).toContain("admin@clinic.local");
      expect(html).toContain("Bác Sĩ Hoàng");
      expect(html).toContain("doctor@clinic.local");
      expect(html).toContain("Lễ Tân Mai");

      // Role Badges
      expect(html).toContain("Quản trị viên");
      expect(html).toContain("badgePrimary");
      expect(html).toContain("Bác sĩ");
      expect(html).toContain("badgeInfo");
      expect(html).toContain("Nhân viên tiếp đón");
      expect(html).toContain("badgeWarning");

      // Status Badges
      expect(html).toContain("Hoạt động");
      expect(html).toContain("badgeSuccess");
      expect(html).toContain("Bị khóa");
      expect(html).toContain("badgeDanger");
      expect(html).toContain("Chưa kích hoạt");
      expect(html).toContain("badgeNeutral");

      // Action Buttons
      expect(html).toContain("Đổi vai trò");
      expect(html).toContain("Khóa");
      expect(html).toContain("Mở khóa");
    });

    it("marks current user with (Bạn) and disables self-lock action", () => {
      const html = renderToStaticMarkup(
        <UserTable
          users={mockUsers}
          currentUserId="u-1"
          loading={false}
          page={1}
          limit={10}
          total={3}
          onPageChange={vi.fn()}
          onEditRole={vi.fn()}
          onEditStatus={vi.fn()}
        />
      );

      // Current user should have (Bạn) tag
      expect(html).toContain("(Bạn)");
      // And the lock button for self should be disabled with tooltip
      expect(html).toContain("Không thể tự khóa tài khoản của chính mình");
      expect(html).toContain("disabled=\"\"");
    });

    it("renders SkeletonTable when loading with no data", () => {
      const html = renderToStaticMarkup(
        <UserTable
          users={[]}
          loading={true}
          page={1}
          limit={10}
          total={0}
          onPageChange={vi.fn()}
          onEditRole={vi.fn()}
          onEditStatus={vi.fn()}
        />
      );

      expect(html).toContain("role=\"region\"");
      expect(html).toContain("aria-busy=\"true\"");
    });

    it("renders EmptyState when users list is empty and not loading", () => {
      const html = renderToStaticMarkup(
        <UserTable
          users={[]}
          loading={false}
          page={1}
          limit={10}
          total={0}
          onPageChange={vi.fn()}
          onEditRole={vi.fn()}
          onEditStatus={vi.fn()}
        />
      );

      expect(html).toContain("Không tìm thấy người dùng");
    });
  });

  describe("UserRoleModal", () => {
    it("renders ConfirmModal with user info and role options", () => {
      const html = renderToStaticMarkup(
        <UserRoleModal
          isOpen={true}
          user={mockUsers[0]}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(html).toContain("Thay đổi vai trò người dùng");
      expect(html).toContain("Nguyễn Quản Trị");
      expect(html).toContain("admin@clinic.local");
      expect(html).toContain("Bệnh nhân (PATIENT)");
      expect(html).toContain("Bác sĩ (DOCTOR)");
      expect(html).toContain("Nhân viên tiếp đón (STAFF)");
      expect(html).toContain("Quản trị viên (ADMIN)");
    });

    it("displays warning box when ADMIN role is selected", () => {
      const html = renderToStaticMarkup(
        <UserRoleModal
          isOpen={true}
          user={mockUsers[0]}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(html).toContain("Cảnh báo quyền hạn:");
      expect(html).toContain("toàn quyền cấu hình hệ thống");
    });

    it("renders TOTP step-up verification field and hint when role is changed", () => {
      const host = document.createElement("div");
      const root = createRoot(host);
      act(() => {
        root.render(
          <UserRoleModal
            isOpen={true}
            user={{ id: "u-2", fullName: "Bác Sĩ Hoàng", email: "doctor@clinic.local", role: "DOCTOR" }}
            onClose={vi.fn()}
            onConfirm={vi.fn()}
          />
        );
      });

      const select = host.querySelector("select") as HTMLSelectElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
        setter?.call(select, "STAFF");
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(host.textContent).toContain("Mã xác thực TOTP (6 chữ số)");
      expect(host.textContent).toContain("Thao tác phân quyền yêu cầu xác thực hai lớp (Step-up MFA).");
      act(() => root.unmount());
    });
  });

  describe("UserStatusModal", () => {
    it("renders ConfirmModal with locking danger variant and warning text", () => {
      const html = renderToStaticMarkup(
        <UserStatusModal
          isOpen={true}
          user={mockUsers[0]}
          targetStatus="LOCKED"
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(html).toContain("Khóa tài khoản người dùng");
      expect(html).toContain("buttonDanger");
      expect(html).toContain("Cảnh báo khóa tài khoản:");
      expect(html).toContain("lập tức mất quyền đăng nhập");
    });

    it("renders activation modal with primary variant", () => {
      const html = renderToStaticMarkup(
        <UserStatusModal
          isOpen={true}
          user={mockUsers[1]}
          targetStatus="ACTIVE"
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(html).toContain("Kích hoạt tài khoản");
      expect(html).toContain("buttonPrimary");
    });

    it("displays self-lock warning and disables confirm button when attempting to lock own account", () => {
      const html = renderToStaticMarkup(
        <UserStatusModal
          isOpen={true}
          user={mockUsers[0]}
          targetStatus="LOCKED"
          currentUserId="u-1"
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(html).toContain("Không được phép:");
      expect(html).toContain("Bạn không thể tự khóa tài khoản của chính mình.");
      expect(html).toContain("disabled=\"\"");
    });

    it("renders TOTP step-up verification field when status is changed", () => {
      const host = document.createElement("div");
      const root = createRoot(host);
      act(() => {
        root.render(
          <UserStatusModal
            isOpen={true}
            user={{ id: "u-3", fullName: "Lễ Tân Mai", email: "staff@clinic.local", status: "INACTIVE" }}
            targetStatus="ACTIVE"
            onClose={vi.fn()}
            onConfirm={vi.fn()}
          />
        );
      });

      expect(host.textContent).toContain("Mã xác thực TOTP (6 chữ số)");
      expect(host.textContent).toContain("yêu cầu xác thực hai lớp (Step-up MFA)");
      act(() => root.unmount());
    });
  });

  describe("PatientSelector", () => {
    it("renders search input with accessible label and placeholder", () => {
      const html = renderToStaticMarkup(
        <PatientSelector onSelect={vi.fn()} />
      );

      expect(html).toContain("Chọn bệnh nhân");
      expect(html).toContain('aria-label="Tìm kiếm bệnh nhân"');
      expect(html).toContain('id="patient-search-input"');
      expect(html).toContain('role="listbox"');
      expect(html).toContain("Không tìm thấy bệnh nhân phù hợp.");
    });
  });

  describe("UsersPanel (/users) Integration", () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
    });

    afterEach(() => {
      act(() => root.unmount());
      host.remove();
      vi.restoreAllMocks();
    });

    it("denies access and renders PermissionDeniedState for non-admin roles (DOCTOR, STAFF)", async () => {
      currentSession = makeSession("DOCTOR", "doc-1");

      await act(async () => {
        root.render(<UsersPanel />);
      });

      expect(host.textContent).toContain("Không có quyền quản lý tài khoản");
      expect(host.textContent).toContain("Chỉ Quản trị viên (ADMIN) mới có quyền truy cập");

      currentSession = makeSession("STAFF", "staff-1");

      await act(async () => {
        root.render(<UsersPanel />);
      });

      expect(host.textContent).toContain("Không có quyền quản lý tài khoản");
    });

    it("loads and displays user list for ADMIN", async () => {
      currentSession = makeSession("ADMIN", "u-1");

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v1/users") {
          return envelope(
            { items: mockUsers },
            { page: 1, limit: 10, total: 3 }
          );
        }
        return envelope({});
      });

      await act(async () => {
        root.render(<UsersPanel />);
      });

      expect(host.textContent).toContain("Nguyễn Quản Trị");
      expect(host.textContent).toContain("(Bạn)");
      expect(host.textContent).toContain("Bác Sĩ Hoàng");
      expect(host.textContent).toContain("Lễ Tân Mai");
    });

    it("debounces search query by 300ms before making API request", async () => {
      currentSession = makeSession("ADMIN", "u-1");

      const fetchedUrls: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = new URL(String(input));
        fetchedUrls.push(url.toString());
        return envelope({ items: mockUsers }, { page: 1, limit: 10, total: 3 });
      });

      await act(async () => {
        root.render(<UsersPanel />);
      });

      expect(fetchedUrls.length).toBe(1);

      const searchInput = host.querySelector("input[placeholder*='Tìm theo tên']") as HTMLInputElement;
      expect(searchInput).toBeTruthy();

      // Type into search
      await act(async () => {
        changeInput(searchInput, "Hoàng");
      });

      // Immediately after typing, debounced request has not run yet (still only initial fetch)
      expect(fetchedUrls.length).toBe(1);

      // Advance timers by 350ms
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });

      // Now the debounced request should have fired with q=Hoàng
      expect(fetchedUrls.some((u) => u.includes("q=Ho%C3%A0ng") || u.includes("q=Hoàng"))).toBe(true);
    });

    it("blocks ADMIN from locking their own account and displays error message", async () => {
      currentSession = makeSession("ADMIN", "u-1");
      const patchSpy = vi.fn();

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
        const url = new URL(String(input));
        if (options?.method === "PATCH") {
          patchSpy(url.pathname, options.body);
          return envelope({ ...mockUsers[0], status: "LOCKED" });
        }
        return envelope({ items: mockUsers }, { page: 1, limit: 10, total: 3 });
      });

      await act(async () => {
        root.render(<UsersPanel />);
      });

      // The self row (u-1) has a disabled lock button
      const rows = Array.from(host.querySelectorAll("tbody tr"));
      const selfRow = rows.find((r) => r.textContent?.includes("Nguyễn Quản Trị"))!;
      const lockBtn = Array.from(selfRow.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Khóa"
      )!;

      expect(lockBtn.disabled).toBe(true);
      expect(lockBtn.title).toContain("Không thể tự khóa tài khoản của chính mình");

      // API PATCH should NOT have been called
      expect(patchSpy).not.toHaveBeenCalled();
    });

    it("initiates step-up challenge and sends verificationProofId on role change when TOTP code is provided", async () => {
      currentSession = makeSession("ADMIN", "u-1");
      const calls: { url: string; method: string; body: any }[] = [];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
        const url = new URL(String(input));
        const method = options?.method ?? "GET";
        const body = options?.body ? JSON.parse(String(options.body)) : undefined;
        calls.push({ url: url.pathname, method, body });

        if (url.pathname === "/api/v1/users") {
          return envelope({ items: mockUsers }, { page: 1, limit: 10, total: 3 });
        }
        if (url.pathname === "/api/v1/auth/mfa/challenges" && method === "POST") {
          return envelope({ challengeId: "ch-sensitive-1" });
        }
        if (url.pathname === "/api/v1/auth/mfa/verify" && method === "POST") {
          return envelope({
            purpose: "AUTHORIZE_SENSITIVE_OPERATION",
            authorization: { proofId: "proof-uuid-123" },
          });
        }
        if (url.pathname.includes("/role") && method === "PATCH") {
          return envelope({ ...mockUsers[1], role: body.role });
        }
        return envelope({});
      });

      await act(async () => {
        root.render(<UsersPanel />);
      });

      const rows = Array.from(host.querySelectorAll("tbody tr"));
      const docRow = rows.find((r) => r.textContent?.includes("Bác Sĩ Hoàng"))!;
      const editRoleBtn = Array.from(docRow.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Đổi vai trò"
      )!;

      await act(async () => {
        editRoleBtn.click();
      });

      const roleSelect = host.querySelector("#user-role-select") as HTMLSelectElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
        setter?.call(roleSelect, "STAFF");
        roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const totpInput = host.querySelector("#user-role-totp") as HTMLInputElement;
      expect(totpInput).toBeTruthy();
      await act(async () => {
        changeInput(totpInput, "654321");
      });

      const confirmBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Xác nhận thay đổi" && !!b.closest("[role='dialog']")
      )!;

      await act(async () => {
        confirmBtn.click();
      });

      const chCall = calls.find((c) => c.url === "/api/v1/auth/mfa/challenges");
      expect(chCall).toBeTruthy();
      expect(chCall?.body.purpose).toBe("AUTHORIZE_SENSITIVE_OPERATION");
      expect(chCall?.body.context.operation).toBe("UPDATE_USER_ROLE");
      expect(chCall?.body.context.role).toBe("STAFF");

      const verifyCall = calls.find((c) => c.url === "/api/v1/auth/mfa/verify");
      expect(verifyCall).toBeTruthy();
      expect(verifyCall?.body.challengeId).toBe("ch-sensitive-1");
      expect(verifyCall?.body.code).toBe("654321");

      const patchCall = calls.find((c) => c.url === "/api/v1/users/u-2/role");
      expect(patchCall).toBeTruthy();
      expect(patchCall?.body.verificationProofId).toBe("proof-uuid-123");
      expect(patchCall?.body.role).toBe("STAFF");
    });
  });
});
