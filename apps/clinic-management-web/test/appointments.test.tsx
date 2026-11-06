// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentsPanel } from "../src/features/appointments/appointments-panel";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const page = <T,>(items: T[]) => ({ items, page: 1, limit: 20, total: items.length });

const mockDoctor = {
  id: "20000000-0000-4000-8000-000000000001",
  userId: "user-doc-1",
  specialtyId: "spec-1",
  displayName: "BS. Trần Văn A",
  bio: null,
  isActive: true,
};

const mockSpecialty = {
  id: "spec-1",
  name: "Nội tổng quát",
  description: "Khám nội khoa",
  isActive: true,
};

const mockPatientProfile = {
  id: "10000000-0000-4000-8000-000000000001",
  userId: "user-patient-1",
  fullName: "Lê Thị B",
  phoneNumber: "0901234567",
};

const pendingAppt = {
  id: "30000000-0000-4000-8000-000000000001",
  patientId: mockPatientProfile.id,
  doctorId: mockDoctor.id,
  specialtyId: mockSpecialty.id,
  scheduledStartAt: "2026-11-02T08:00:00.000Z",
  scheduledEndAt: "2026-11-02T08:30:00.000Z",
  reason: "Khám định kỳ",
  status: "PENDING",
  createdBy: "user-patient-1",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

const confirmedAppt = {
  ...pendingAppt,
  id: "30000000-0000-4000-8000-000000000002",
  patientId: "10000000-0000-4000-8000-000000000002", // Unresolved name test
  status: "CONFIRMED",
};

const checkedInAppt = {
  ...pendingAppt,
  id: "30000000-0000-4000-8000-000000000003",
  status: "CHECKED_IN",
};

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function failure(status: number, message: string, code = `HTTP_${status}`) {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Override = (path: string, method: string) => Response | Promise<Response> | undefined;

function mockGateway(override?: Override) {
  return vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = options?.method ?? "GET";
    const custom = override?.(path, method);
    if (custom) return custom;

    if (method === "GET") {
      if (path === "/api/v1/doctors") return envelope(page([mockDoctor]));
      if (path === "/api/v1/specialties") return envelope(page([mockSpecialty]));
      if (path === "/api/v1/patients/10000000-0000-4000-8000-000000000001") {
        return envelope(mockPatientProfile);
      }
      if (path.startsWith("/api/v1/patients/")) {
        return failure(404, "Patient not found");
      }
      if (path === "/api/v1/appointments") {
        return envelope(page([pendingAppt, confirmedAppt, checkedInAppt]));
      }
    }

    if (method === "PATCH") {
      if (path.includes("/confirm")) {
        return envelope({ ...pendingAppt, status: "CONFIRMED" });
      }
      if (path.includes("/check-in")) {
        return envelope({ ...confirmedAppt, status: "CHECKED_IN" });
      }
      if (path.includes("/cancel")) {
        return envelope({ ...pendingAppt, status: "CANCELLED" });
      }
      if (path.includes("/no-show")) {
        return envelope({ ...confirmedAppt, status: "NO_SHOW" });
      }
    }

    throw new Error(`Unexpected path in test: ${method} ${path}`);
  });
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
  mockPush.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

async function renderPanel(role: ClinicRole, fetcher: ReturnType<typeof mockGateway>) {
  currentSession = {
    status: "authenticated",
    identity: { id: "user-1", role, displayName: "Người dùng Test" },
    getAccessToken: async () => "test-token",
    signIn: async () => {},
    signOut: async () => {},
  };

  vi.stubGlobal("fetch", fetcher);

  await act(async () => {
    root.render(<AppointmentsPanel />);
  });
  // Flush promises
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe("AppointmentsPanel (M3-WEB-010)", () => {
  it("renders PermissionDeniedState for unauthorized users", async () => {
    currentSession = {
      status: "unauthenticated",
      identity: null,
      getAccessToken: async () => null,
      signIn: async () => {},
      signOut: async () => {},
    };

    await act(async () => {
      root.render(<AppointmentsPanel />);
    });

    expect(host.textContent).toContain("Quyền truy cập hạn chế");
    expect(host.textContent).toContain("Trang quản lý lịch hẹn chỉ dành cho Bác sĩ");
  });

  it("renders data table with populated appointments for STAFF", async () => {
    const fetcher = mockGateway();
    await renderPanel("STAFF", fetcher);

    // Verify Title & Filter Bar
    expect(host.textContent).toContain("Quản lý lịch hẹn");
    expect(host.textContent).toContain("Ngày khám:");
    expect(host.textContent).toContain("Chờ xác nhận");

    // Verify resolved patient name and fallback (no raw UUID leakage)
    expect(host.textContent).toContain("Lê Thị B");
    expect(host.textContent).toContain("Bệnh nhân #0002"); // Fallback for 2nd patient
    expect(host.textContent).not.toContain("10000000-0000-4000-8000-000000000002"); // No raw UUID!

    // Verify Doctor and Specialty are visible for STAFF
    expect(host.textContent).toContain("BS. Trần Văn A");
    expect(host.textContent).toContain("Nội tổng quát");

    // Verify StatusBadges
    expect(host.textContent).toContain("Chờ xác nhận");
    expect(host.textContent).toContain("Đã xác nhận");
    expect(host.textContent).toContain("Đã check-in");

    // Verify STAFF Action buttons
    expect(host.textContent).toContain("Xác nhận");
    expect(host.textContent).toContain("Check-in");
    expect(host.textContent).toContain("Hủy");
    expect(host.textContent).toContain("Không đến");
  });

  it("hides Doctor and Specialty columns for DOCTOR role and shows clinical action", async () => {
    const fetcher = mockGateway();
    await renderPanel("DOCTOR", fetcher);

    // Doctor table headers
    const headers = Array.from(host.querySelectorAll("th")).map((th) => th.textContent?.trim());
    expect(headers).toContain("Giờ khám");
    expect(headers).toContain("Bệnh nhân");
    expect(headers).not.toContain("Bác sĩ");
    expect(headers).not.toContain("Chuyên khoa");

    // DOCTOR should see 'Khám bệnh' for CHECKED_IN
    expect(host.textContent).toContain("Khám bệnh");

    // DOCTOR should not see STAFF-only confirmation buttons in the action column
    const tableButtons = Array.from(host.querySelectorAll("tbody button")).map((b) => b.textContent?.trim());
    expect(tableButtons).not.toContain("Check-in");
    expect(tableButtons).not.toContain("Không đến");
    expect(tableButtons).not.toContain("Xác nhận");
  });

  it("navigates to /medical-records when clicking Khám bệnh as DOCTOR", async () => {
    const fetcher = mockGateway();
    await renderPanel("DOCTOR", fetcher);

    const recordBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Khám bệnh")
    );
    expect(recordBtn).toBeTruthy();

    await act(async () => {
      recordBtn?.click();
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/medical-records?appointmentId=30000000-0000-4000-8000-000000000003")
    );
  });

  it("opens ConfirmModal when clicking Hủy as STAFF", async () => {
    const fetcher = mockGateway();
    await renderPanel("STAFF", fetcher);

    const cancelBtn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Hủy"
    );
    expect(cancelBtn).toBeTruthy();

    await act(async () => {
      cancelBtn?.click();
    });

    // ConfirmModal should be open
    expect(host.textContent).toContain("Xác nhận hủy lịch hẹn");
    expect(host.textContent).toContain("Bạn có chắc chắn muốn hủy lịch hẹn");
    expect(host.textContent).toContain("Quay lại");
  });

  it("renders EmptyState when today has no appointments", async () => {
    const fetcher = mockGateway((path) => {
      if (path === "/api/v1/appointments") return envelope(page([]));
      return undefined;
    });

    await renderPanel("STAFF", fetcher);

    expect(host.textContent).toContain("Hôm nay chưa có lịch hẹn nào");
    expect(host.textContent).toContain("Làm mới");
  });

  it("renders ErrorState on API failure with retry option", async () => {
    const fetcher = mockGateway((path) => {
      if (path === "/api/v1/appointments") return failure(500, "Lỗi máy chủ nội bộ");
      return undefined;
    });

    await renderPanel("STAFF", fetcher);

    expect(host.textContent).toContain("Đã xảy ra lỗi");
    expect(host.textContent).toContain("Thử lại");
  });

  it("handles 409 conflict during transition and shows inline Alert", async () => {
    const fetcher = mockGateway((path, method) => {
      if (method === "PATCH" && path.includes("/confirm")) {
        return failure(409, "Trạng thái đã bị đổi bởi người khác");
      }
      return undefined;
    });

    await renderPanel("STAFF", fetcher);

    const confirmBtn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Xác nhận"
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn?.click();
    });

    // ConfirmModal opens first
    expect(host.textContent).toContain("Xác nhận lịch hẹn");
    const modalConfirmBtn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Xác nhận lịch hẹn"
    );
    expect(modalConfirmBtn).toBeTruthy();

    await act(async () => {
      modalConfirmBtn?.click();
    });

    // Conflict alert should appear inline
    expect(host.textContent).toContain("Xung đột trạng thái lịch hẹn (409)");
    expect(host.textContent).toContain("Xung đột trạng thái:");
  });
});
