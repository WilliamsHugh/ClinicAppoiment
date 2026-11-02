import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { UserTable, type UserItem } from "../src/features/users/user-table";
import { UserRoleModal } from "../src/features/users/user-role-modal";
import { UserStatusModal } from "../src/features/users/user-status-modal";
import { PatientSelector } from "../src/features/users/patient-selector";

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
});
