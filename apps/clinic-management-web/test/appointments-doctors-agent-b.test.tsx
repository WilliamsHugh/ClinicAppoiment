// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentsPanel } from "../src/features/appointments/appointments-panel";
import { DoctorPanel } from "../src/features/doctors/doctor-panel";
import { DoctorList } from "../src/features/doctors/doctor-list";
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
  id: "doc-1",
  userId: "user-doc-1",
  specialtyId: "spec-1",
  displayName: "BS. Trần Văn A",
  bio: "Bác sĩ chuyên khoa tiêu hóa",
  isActive: true,
};

const mockSpecialty = {
  id: "spec-1",
  name: "Nội tổng quát",
  description: "Khám nội tổng hợp",
  isActive: true,
};

const mockAppt = {
  id: "appt-1",
  patientId: "patient-1",
  doctorId: "doc-1",
  specialtyId: "spec-1",
  scheduledStartAt: "2026-11-02T08:00:00.000Z",
  scheduledEndAt: "2026-11-02T08:30:00.000Z",
  reason: "Khám định kỳ",
  status: "PENDING",
  createdBy: "patient-1",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
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

function setupSession(role: ClinicRole = "STAFF", id = "user-1") {
  currentSession = {
    status: "authenticated",
    identity: { id, role, displayName: "Test User" },
    getAccessToken: async () => "token",
    signIn: async () => {},
    signOut: async () => {},
  };
}

describe("Agent B · Filter, State & Error Recovery (M3-UI-BOOK-004, M3-UI-DOC-001)", () => {
  describe("1. Phân biệt rõ empty state vs error state", () => {
    it("Appointments: response 200 [] renders EmptyState, but 500 error renders ErrorState with retry", async () => {
      setupSession("STAFF");
      let failAppointments = true;

      const fetcher = vi.fn().mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v1/appointments") {
          if (failAppointments) return failure(500, "Lỗi máy chủ nội bộ");
          return envelope(page([]));
        }
        if (url.pathname === "/api/v1/doctors") return envelope(page([mockDoctor]));
        if (url.pathname === "/api/v1/specialties") return envelope(page([mockSpecialty]));
        return envelope({});
      });
      vi.stubGlobal("fetch", fetcher);

      await act(async () => {
        root.render(<AppointmentsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Must show ErrorState, NOT EmptyState
      expect(host.textContent).toContain("Đã xảy ra lỗi");
      expect(host.textContent).toContain("Thử lại");
      expect(host.textContent).not.toContain("Hôm nay chưa có lịch hẹn nào");
      expect(host.textContent).not.toContain("Không tìm thấy lịch hẹn");

      // Now switch flag so retry returns empty 200 []
      failAppointments = false;

      const retryBtn = Array.from(host.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Thử lại")
      );
      expect(retryBtn).toBeTruthy();

      await act(async () => {
        retryBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Now it must show EmptyState, NOT ErrorState
      expect(host.textContent).toContain("Hôm nay chưa có lịch hẹn nào");
      expect(host.textContent).not.toContain("Đã xảy ra lỗi");
    });

    it("DoctorList: fetch error renders ErrorState with retry, NEVER EmptyState", async () => {
      await act(async () => {
        root.render(
          <DoctorList
            doctors={{ items: [], page: 1, limit: 20, total: 0 }}
            specialties={[mockSpecialty]}
            search=""
            onSearchChange={() => {}}
            onSubmitSearch={() => {}}
            specialtyFilter=""
            onSpecialtyFilterChange={() => {}}
            selectedId={null}
            onSelectDoctor={() => {}}
            loading={false}
            page={1}
            onPageChange={() => {}}
            error="Không thể kết nối đến máy chủ"
            onRetry={() => {}}
          />
        );
      });

      // Must display error alert with retry button
      expect(host.textContent).toContain("Không thể kết nối đến máy chủ");
      expect(host.textContent).toContain("Thử lại");
      // Must NOT display "Chưa có bác sĩ phù hợp"
      expect(host.textContent).not.toContain("Chưa có bác sĩ phù hợp");
    });

    it("DoctorPanel: slot error shows error with retry button, NEVER 'Không có khung giờ'", async () => {
      setupSession("STAFF");
      const fetcher = vi.fn().mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v1/specialties") return envelope(page([mockSpecialty]));
        if (url.pathname === "/api/v1/doctors") return envelope(page([mockDoctor]));
        if (url.pathname === "/api/v1/doctors/doc-1") return envelope(mockDoctor);
        if (url.pathname === "/api/v1/doctors/doc-1/schedules") return envelope(page([]));
        if (url.pathname === "/api/v1/doctors/doc-1/time-offs") return envelope(page([]));
        if (url.pathname.includes("/available-slots")) {
          return failure(503, "Dịch vụ khung giờ bận");
        }
        return envelope({});
      });
      vi.stubGlobal("fetch", fetcher);

      await act(async () => {
        root.render(<DoctorPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Select doctor
      const doctorCard = Array.from(host.querySelectorAll("button")).find((el) =>
        el.textContent?.includes("BS. Trần Văn A")
      );
      expect(doctorCard).toBeTruthy();
      await act(async () => {
        doctorCard?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Slot region should show slot error and retry, NOT "Không có khung giờ phù hợp"
      expect(host.textContent).toContain("Dịch vụ khung giờ bận");
      expect(host.textContent).toContain("Thử lại khung giờ");
      expect(host.textContent).not.toContain("Không có khung giờ phù hợp trong ngày này.");
    });
  });

  describe("2. Dữ liệu stale khi refresh: giữ kết quả cũ trong vùng data kèm nhãn rõ ràng", () => {
    it("Appointments: keeping previous data with stale alert and retry button on refresh error", async () => {
      setupSession("STAFF");
      let shouldFail = false;

      const fetcher = vi.fn().mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v1/appointments") {
          if (shouldFail) return failure(500, "Mạng chập chờn khi refresh");
          return envelope(page([mockAppt]));
        }
        if (url.pathname === "/api/v1/doctors") return envelope(page([mockDoctor]));
        if (url.pathname === "/api/v1/specialties") return envelope(page([mockSpecialty]));
        if (url.pathname.startsWith("/api/v1/patients/")) {
          return envelope({ id: "patient-1", fullName: "Bệnh nhân Một" });
        }
        return envelope({});
      });
      vi.stubGlobal("fetch", fetcher);

      await act(async () => {
        root.render(<AppointmentsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      // Initial load succeeded
      expect(host.textContent).toContain("Bệnh nhân Một");

      // Trigger refresh which fails
      shouldFail = true;
      const refreshBtn = Array.from(host.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Làm mới")
      );
      expect(refreshBtn).toBeTruthy();

      await act(async () => {
        refreshBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      // Stale alert is visible
      expect(host.textContent).toContain("Dữ liệu chưa thể cập nhật (Đang hiển thị kết quả gần nhất)");
      // Data table is STILL visible with previous items
      expect(host.textContent).toContain("Bệnh nhân Một");
    });
  });

  describe("3. Các request độc lập không làm toàn trang vào lỗi", () => {
    it("DoctorPanel: failure in doctors endpoint does not prevent specialties from loading", async () => {
      setupSession("ADMIN");
      const fetcher = vi.fn().mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v1/specialties") {
          return envelope(page([mockSpecialty]));
        }
        if (url.pathname === "/api/v1/doctors") {
          return failure(500, "Không thể tải danh sách bác sĩ");
        }
        if (url.pathname === "/api/v1/users") return envelope(page([]));
        return envelope({});
      });
      vi.stubGlobal("fetch", fetcher);

      await act(async () => {
        root.render(<DoctorPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Doctor error is shown in doctor list
      expect(host.textContent).toContain("Không thể tải danh sách bác sĩ");
      // But specialty filter options still populated!
      const specialtyOptions = Array.from(host.querySelectorAll("option")).map((o) => o.textContent);
      expect(specialtyOptions).toContain("Nội tổng quát");
    });
  });

  describe("4. Mutation loading & Double-submit prevention", () => {
    it("Appointments: double click on confirm action executes only one mutation", async () => {
      setupSession("STAFF");
      let mutateCount = 0;

      const fetcher = vi.fn().mockImplementation(async (input, options) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v1/appointments") return envelope(page([mockAppt]));
        if (url.pathname === "/api/v1/doctors") return envelope(page([mockDoctor]));
        if (url.pathname === "/api/v1/specialties") return envelope(page([mockSpecialty]));
        if (url.pathname.includes("/confirm")) {
          mutateCount++;
          await new Promise((r) => setTimeout(r, 50));
          return envelope({ ...mockAppt, status: "CONFIRMED" });
        }
        return envelope({});
      });
      vi.stubGlobal("fetch", fetcher);

      await act(async () => {
        root.render(<AppointmentsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Click "Xác nhận" to open confirm modal
      const confirmBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Xác nhận"
      );
      expect(confirmBtn).toBeTruthy();

      await act(async () => {
        confirmBtn?.click();
      });

      const modalConfirmBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Xác nhận lịch hẹn"
      );
      expect(modalConfirmBtn).toBeTruthy();

      // Rapidly click twice
      await act(async () => {
        modalConfirmBtn?.click();
        modalConfirmBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 80));
      });

      expect(mutateCount).toBe(1);
    });
  });

  describe("5. Rà skeleton: aria-busy & Label trạng thái", () => {
    it("Appointment rows have aria-busy while mutation is in flight", async () => {
      setupSession("STAFF");
      let resolveConfirm: (res: Response) => void;
      const confirmPromise = new Promise<Response>((r) => {
        resolveConfirm = r;
      });

      const fetcher = vi.fn().mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v1/appointments") return envelope(page([mockAppt]));
        if (url.pathname === "/api/v1/doctors") return envelope(page([mockDoctor]));
        if (url.pathname === "/api/v1/specialties") return envelope(page([mockSpecialty]));
        if (url.pathname.includes("/confirm")) return confirmPromise;
        return envelope({});
      });
      vi.stubGlobal("fetch", fetcher);

      await act(async () => {
        root.render(<AppointmentsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Open modal and confirm
      const confirmBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Xác nhận"
      );
      await act(async () => {
        confirmBtn?.click();
      });

      const modalConfirmBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Xác nhận lịch hẹn"
      );
      await act(async () => {
        modalConfirmBtn?.click();
      });

      // In flight: check row has aria-busy="true"
      const busyRow = host.querySelector("tr[aria-busy='true']");
      expect(busyRow).toBeTruthy();

      // Finish mutation
      await act(async () => {
        resolveConfirm!(envelope({ ...mockAppt, status: "CONFIRMED" }));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(host.querySelector("tr[aria-busy='true']")).toBeNull();
    });
  });
});
