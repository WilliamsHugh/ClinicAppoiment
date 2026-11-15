// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppointmentsPage from "../app/appointments/page";
import type { Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/appointments",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Mock fetch for appointmentApi list and queueApi listDay
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/appointments")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      }),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [] }),
  });
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", mockFetch);
  currentSession = {
    status: "authenticated",
    identity: { id: "staff-1", role: "STAFF", displayName: "Nhân viên phòng khám" },
    getAccessToken: async () => "test-token",
    signIn: async () => {},
    signOut: async () => {},
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AppointmentsPage View Switching & Header Alignment", () => {
  it("renders AppointmentsPanel with 'Bảng hàng đợi' toggle button initially", async () => {
    await act(async () => {
      root.render(<AppointmentsPage />);
    });

    const queueBtn = Array.from(host.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Bảng hàng đợi"
    );
    expect(queueBtn, "Expected 'Bảng hàng đợi' button in Appointments view").toBeDefined();

    // The filter bar should be present in Appointments view
    expect(host.querySelector('[aria-label="Bộ lọc lịch hẹn"]')).not.toBeNull();
  });

  it("switches to QueueBoard with page-stack wrapper and 'Danh sách lịch hẹn' button on click", async () => {
    await act(async () => {
      root.render(<AppointmentsPage />);
    });

    const queueBtn = Array.from(host.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Bảng hàng đợi"
    );
    expect(queueBtn).toBeDefined();

    // Click toggle to queue
    await act(async () => {
      queueBtn!.click();
    });

    // In Queue view, root container must have page-stack class for consistent 24px vertical rhythm and 1050px width
    const pageStack = host.querySelector(".page-stack");
    expect(pageStack, "Expected page-stack wrapper in Queue view").not.toBeNull();

    // Check toggle button switched to "Danh sách lịch hẹn"
    const listBtn = Array.from(host.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Danh sách lịch hẹn"
    );
    expect(listBtn, "Expected 'Danh sách lịch hẹn' button in Queue view").toBeDefined();

    // Verify QueueBoard is rendered (e.g. today button or queue columns)
    const todayBtn = Array.from(host.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Hôm nay"
    );
    expect(todayBtn, "Expected 'Hôm nay' button in QueueBoard toolbar").toBeDefined();

    // Click toggle back to appointments list
    await act(async () => {
      listBtn!.click();
    });

    const switchedBackBtn = Array.from(host.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Bảng hàng đợi"
    );
    expect(switchedBackBtn, "Expected 'Bảng hàng đợi' button after switching back").toBeDefined();
  });

  it("renders clean full-width search bar without cluttered instruction hints", async () => {
    await act(async () => {
      root.render(<AppointmentsPage />);
    });

    const searchInput = host.querySelector<HTMLInputElement>('input[type="search"]');
    expect(searchInput, "Expected search input to be present").not.toBeNull();
    expect(searchInput?.getAttribute("placeholder")).toBe("Tìm theo tên bệnh nhân, bác sĩ hoặc lý do...");

    // Must NOT contain the removed cluttered instructional labels or hints
    expect(host.textContent).not.toContain("Tìm trong trang hiện tại");
    expect(host.textContent).not.toContain("Chỉ lọc các lịch hẹn trên trang đang xem.");
  });
});
