// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentsTable } from "../src/features/appointments/appointments-table";
import { Modal } from "../src/components/ui/modal";
import { ConfirmModal } from "../src/components/ui/confirm-modal";
import { AppShell } from "../src/components/app-shell";
import type { Appointment } from "../src/features/appointments/appointment-api";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
let mockPathname = "/appointments";

vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function makeSession(role: ClinicRole = "STAFF"): Session {
  return {
    status: "authenticated",
    identity: { id: "user-1", role, displayName: "Nhân viên A" },
    getAccessToken: async () => "token",
    signIn: async () => {},
    signOut: vi.fn(),
  };
}

const mockAppointment: Appointment = {
  id: "30000000-0000-4000-8000-000000000001",
  patientId: "patient-1",
  doctorId: "doc-1",
  specialtyId: "spec-1",
  scheduledStartAt: "2026-11-15T08:00:00.000Z",
  scheduledEndAt: "2026-11-15T08:30:00.000Z",
  status: "CONFIRMED",
  reason: "Khám định kỳ",
  createdBy: "patient-1",
  createdAt: "2026-11-10T10:00:00.000Z",
  updatedAt: "2026-11-10T10:00:00.000Z",
};

describe("Agent C · Responsive & Keyboard cho Appointments (Branch 3)", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    currentSession = makeSession("STAFF");
    mockPathname = "/appointments";
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.clearAllMocks();
  });

  describe("P0.1 · Bảng lịch hẹn trên viewport hẹp (Horizontal scroll & Action preservation)", () => {
    it("renders deliberate horizontal scroll container with tabIndex=0 and role=region", async () => {
      await act(async () => {
        root.render(
          <AppointmentsTable
            appointments={[mockAppointment]}
            role="STAFF"
            patientsMap={{ "patient-1": "Nguyễn Văn B" }}
            doctorsMap={{ "doc-1": "BS. Lê C" }}
            specialtiesMap={{ "spec-1": "Nội khoa" }}
            actionLoadingId={null}
            rowConflicts={{}}
            onConfirm={() => {}}
            onRequestCancel={() => {}}
            onCheckIn={() => {}}
            onRequestNoShow={() => {}}
            onViewRecord={() => {}}
          />
        );
      });

      const scrollRegion = host.querySelector('[role="region"][aria-label="Danh sách lịch hẹn"]');
      expect(scrollRegion).toBeTruthy();
      expect(scrollRegion?.getAttribute("tabindex")).toBe("0");

      const table = host.querySelector("table");
      expect(table).toBeTruthy();

      // Header has Thao tác column preserved
      const thList = Array.from(host.querySelectorAll("th"));
      const actionTh = thList.find((th) => th.textContent?.includes("Thao tác"));
      expect(actionTh).toBeTruthy();
    });
  });

  describe("P0.2 · Keyboard navigation & Modal focus trapping", () => {
    it("makes each appointment row tabbable with tabIndex=0 and descriptive aria-label", async () => {
      await act(async () => {
        root.render(
          <AppointmentsTable
            appointments={[mockAppointment]}
            role="STAFF"
            patientsMap={{ "patient-1": "Nguyễn Văn B" }}
            doctorsMap={{ "doc-1": "BS. Lê C" }}
            specialtiesMap={{ "spec-1": "Nội khoa" }}
            actionLoadingId={null}
            rowConflicts={{}}
            onConfirm={() => {}}
            onRequestCancel={() => {}}
            onCheckIn={() => {}}
            onRequestNoShow={() => {}}
            onViewRecord={() => {}}
          />
        );
      });

      const rows = host.querySelectorAll("tbody tr");
      expect(rows.length).toBeGreaterThan(0);
      const firstRow = rows[0];
      expect(firstRow.getAttribute("tabindex")).toBe("0");
      expect(firstRow.getAttribute("aria-label")).toContain("Nguyễn Văn B");

      // Action buttons are present and focusable
      const actionButtons = firstRow.querySelectorAll("button");
      expect(actionButtons.length).toBeGreaterThan(0);
      actionButtons.forEach((btn) => {
        expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
      });
    });

    it("closes modal on Escape key", async () => {
      const handleClose = vi.fn();
      await act(async () => {
        root.render(
          <Modal isOpen={true} onClose={handleClose} title="Hộp thoại kiểm tra">
            <p>Nội dung modal</p>
          </Modal>
        );
      });

      expect(host.textContent).toContain("Hộp thoại kiểm tra");

      // Press Escape
      await act(async () => {
        const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
        document.dispatchEvent(escapeEvent);
      });

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("traps focus inside Modal without leaking to background", async () => {
      // Create external background button
      const bgButton = document.createElement("button");
      bgButton.textContent = "Background Button";
      document.body.appendChild(bgButton);
      bgButton.focus();
      expect(document.activeElement).toBe(bgButton);

      await act(async () => {
        root.render(
          <ConfirmModal
            isOpen={true}
            onCancel={vi.fn()}
            onConfirm={vi.fn()}
            title="Xác nhận thao tác"
            description="Nội dung xác nhận"
            confirmLabel="Đồng ý"
            cancelLabel="Hủy"
          />
        );
      });

      // Inside the modal, there are buttons: Close button, Cancel, Confirm
      const modalButtons = Array.from(host.querySelectorAll<HTMLElement>("button"));
      expect(modalButtons.length).toBe(3);
      const closeBtn = modalButtons[0];
      const cancelBtn = modalButtons[1];
      const confirmBtn = modalButtons[2];

      // Tab cycling forward from last button wraps to first
      confirmBtn.focus();
      expect(document.activeElement).toBe(confirmBtn);

      await act(async () => {
        const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        document.dispatchEvent(tabEvent);
      });
      expect(document.activeElement).toBe(closeBtn);

      // Shift+Tab cycling backward from first button wraps to last
      closeBtn.focus();
      expect(document.activeElement).toBe(closeBtn);

      await act(async () => {
        const shiftTabEvent = new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(shiftTabEvent);
      });
      expect(document.activeElement).toBe(confirmBtn);

      bgButton.remove();
    });
  });

  describe("P0.3 · Tap target & Action buttons", () => {
    it("renders valid action buttons with action-group container for appointments", async () => {
      await act(async () => {
        root.render(
          <AppointmentsTable
            appointments={[mockAppointment]}
            role="STAFF"
            patientsMap={{ "patient-1": "Nguyễn Văn B" }}
            doctorsMap={{ "doc-1": "BS. Lê C" }}
            specialtiesMap={{ "spec-1": "Nội khoa" }}
            actionLoadingId={null}
            rowConflicts={{}}
            onConfirm={() => {}}
            onRequestCancel={() => {}}
            onCheckIn={() => {}}
            onRequestNoShow={() => {}}
            onViewRecord={() => {}}
          />
        );
      });

      const actionGroup = host.querySelector('[role="group"][aria-label="Thao tác lịch hẹn"]');
      expect(actionGroup).toBeTruthy();

      const buttons = Array.from(actionGroup!.querySelectorAll("button"));
      expect(buttons.length).toBeGreaterThan(0);
      // STAFF with CONFIRMED status sees Check-in, Hủy, Không đến
      const checkInBtn = buttons.find((b) => b.textContent?.includes("Check-in"));
      const cancelBtn = buttons.find((b) => b.textContent?.includes("Hủy"));
      const noShowBtn = buttons.find((b) => b.textContent?.includes("Không đến"));
      expect(checkInBtn).toBeTruthy();
      expect(cancelBtn).toBeTruthy();
      expect(noShowBtn).toBeTruthy();
    });
  });

  describe("P0.4 · Sidebar navigation & Persistent logout button", () => {
    it("renders logout button in sidebarFooter on all viewports", async () => {
      await act(async () => {
        root.render(<AppShell>Trang Lịch hẹn</AppShell>);
      });

      const logoutBtn = host.querySelector('button[aria-label="Đăng xuất"]');
      expect(logoutBtn).toBeTruthy();
      expect(logoutBtn?.textContent?.trim()).toBe("Thoát");

      // Mobile menu toggle is present for small viewports
      const mobileToggle = host.querySelector('button[aria-label="Mở menu điều hướng"]');
      expect(mobileToggle).toBeTruthy();
    });

    it("toggles mobile menu and closes on Escape", async () => {
      await act(async () => {
        root.render(<AppShell>Trang Lịch hẹn</AppShell>);
      });

      const mobileToggle = host.querySelector<HTMLButtonElement>('button[aria-label="Mở menu điều hướng"]');
      expect(mobileToggle).toBeTruthy();
      expect(mobileToggle?.getAttribute("aria-expanded")).toBe("false");

      // Open mobile sidebar
      await act(async () => {
        mobileToggle?.click();
      });
      expect(mobileToggle?.getAttribute("aria-expanded")).toBe("true");

      // Press Escape to close mobile menu
      await act(async () => {
        const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
        document.dispatchEvent(escapeEvent);
      });
      expect(mobileToggle?.getAttribute("aria-expanded")).toBe("false");
    });
  });
});
