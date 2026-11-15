// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentSelector } from "../src/features/medical-records/appointment-selector";
import { PrescriptionForm } from "../src/features/medical-records/prescription-form";
import { MedicalRecordsPanel } from "../src/features/medical-records/medical-records-panel";
import type { Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function makeSession(role?: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN", status: "authenticated" | "loading" | "unauthenticated" = "authenticated"): Session {
  if (status === "loading") {
    return {
      status: "loading",
      identity: null,
      getAccessToken: async () => null,
      signIn: async () => {},
      signOut: async () => {},
    };
  }
  if (!role || status === "unauthenticated") {
    return {
      status: "unauthenticated",
      identity: null,
      getAccessToken: async () => null,
      signIn: async () => {},
      signOut: async () => {},
    };
  }
  return {
    status: "authenticated",
    identity: {
      id: "user-test-id",
      role,
      displayName: role === "DOCTOR" ? "BS. Nguyễn Văn A" : "Người dùng",
      email: `${role.toLowerCase()}@clinic.local`,
    },
    getAccessToken: async () => "mock-jwt-token",
    signIn: async () => {},
    signOut: async () => {},
  };
}

const mockAppointment = {
  id: "appt-uuid-0001",
  patientId: "patient-uuid-1234",
  doctorId: "doc-uuid-0001",
  scheduledStartAt: "2026-11-15T08:30:00.000Z",
  status: "CHECKED_IN",
  reason: "Khám ho và sốt nhẹ",
};

const mockPatientProfile = {
  id: "patient-uuid-1234",
  userId: "user-patient-1",
  fullName: "Trần Thị Lan",
  dateOfBirth: "1990-05-12",
  gender: "Nữ",
  phone: "0901234567",
  insuranceNumber: "DN4791234567890",
};

const mockDraftRecord = {
  id: "record-draft-0001",
  appointmentId: "appt-uuid-0001",
  patientId: "patient-uuid-1234",
  doctorId: "doc-uuid-0001",
  symptoms: "Ho khan, sốt nhẹ 38 độ C",
  diagnosis: "Viêm họng cấp",
  notes: "Theo dõi 3 ngày",
  treatmentPlan: "Nghỉ ngơi, uống nhiều nước ấm",
  prescription: [
    {
      medicineName: "Paracetamol 500mg",
      dosage: "1 viên",
      frequency: "2 lần/ngày",
      duration: "3 ngày",
    },
  ],
  status: "DRAFT" as const,
  createdAt: "2026-11-15T09:00:00.000Z",
};

const mockFinalRecord = {
  ...mockDraftRecord,
  id: "record-final-0002",
  status: "FINAL" as const,
  createdAt: "2026-11-15T09:30:00.000Z",
};

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function failure(message: string, status = 500) {
  return new Response(JSON.stringify({ success: false, error: { code: "SERVER_ERROR", message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function changeInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Medical Records Feature Components (M3-WEB-011)", () => {
  describe("AppointmentSelector", () => {
    const mockAppointments = [
      {
        id: "appt-1",
        patientId: "patient-uuid-1234-5678-abcd",
        doctorId: "doc-1",
        scheduledStartAt: "2026-11-02T09:00:00.000Z",
        status: "CHECKED_IN",
      },
      {
        id: "appt-2",
        patientId: "patient-uuid-9999-8888-ef01",
        doctorId: "doc-1",
        scheduledStartAt: "2026-11-02T10:00:00.000Z",
        status: "CONFIRMED",
      },
    ];

    it("renders only CHECKED_IN appointments", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("appt-1");
      expect(html).not.toContain("appt-2");
    });

    it("displays resolved patient full name when available", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          patientNames={{ "patient-uuid-1234-5678-abcd": "Trần Thị Lan" }}
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("Trần Thị Lan");
      expect(html).not.toContain("patient-uuid-1234-5678-abcd");
    });

    it("formats short fallback 'Bệnh nhân #xxxx' instead of leaking raw UUID", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          patientNames={{}}
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("Bệnh nhân #abcd");
      expect(html).not.toContain("patient-uuid-1234-5678-abcd");
    });

    it("displays error with role='alert' when error prop is present", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          error="Vui lòng chọn lịch hẹn"
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("role=\"alert\"");
      expect(html).toContain("Vui lòng chọn lịch hẹn");
    });
  });

  describe("PrescriptionForm", () => {
    const mockItems = [
      {
        medicineName: "Amoxicillin 500mg",
        dosage: "1 viên",
        frequency: "3 lần/ngày sau ăn",
        duration: "7 ngày",
      },
    ];

    it("renders prescription inputs with accessible aria-labels", () => {
      const html = renderToStaticMarkup(
        <PrescriptionForm items={mockItems} onChange={vi.fn()} />
      );
      expect(html).toContain("aria-label=\"Tên thuốc hàng 1\"");
      expect(html).toContain("aria-label=\"Liều dùng hàng 1\"");
      expect(html).toContain("aria-label=\"Tần suất dùng hàng 1\"");
      expect(html).toContain("aria-label=\"Thời gian dùng hàng 1\"");
      expect(html).toContain("value=\"Amoxicillin 500mg\"");
    });

    it("renders contextual delete button aria-label with medicine name", () => {
      const html = renderToStaticMarkup(
        <PrescriptionForm items={mockItems} onChange={vi.fn()} />
      );
      expect(html).toContain("aria-label=\"Xóa thuốc Amoxicillin 500mg\"");
    });

    it("renders inline field errors with role='alert'", () => {
      const errors = {
        0: {
          dosage: "Vui lòng nhập liều lượng",
          duration: "Vui lòng nhập số ngày",
        },
      };
      const html = renderToStaticMarkup(
        <PrescriptionForm items={mockItems} errors={errors} onChange={vi.fn()} />
      );
      expect(html).toContain("role=\"alert\"");
      expect(html).toContain("Vui lòng nhập liều lượng");
      expect(html).toContain("Vui lòng nhập số ngày");
    });

    it("renders readOnly mode without add or delete buttons", () => {
      const html = renderToStaticMarkup(
        <PrescriptionForm items={mockItems} readOnly={true} onChange={vi.fn()} />
      );
      expect(html).toContain("Chỉ đọc");
      expect(html).not.toContain("+ Thêm thuốc");
      expect(html).not.toContain("Xóa");
    });
  });

  describe("MedicalRecordsPanel (M3-UI-REC-001, M3-UI-REC-002, M3-UI-NOTI-001)", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
      window.history.replaceState({}, "", "/medical-records");
      vi.restoreAllMocks();
    });

    it("restricts access to DOCTOR and denies ADMIN without clinical API calls", async () => {
      currentSession = makeSession("ADMIN");
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });

      expect(container.textContent).toContain("Không có quyền truy cập hồ sơ khám");
      expect(container.textContent).toContain("Chỉ bác sĩ được phân công mới có quyền lập và quản lý bệnh án khám bệnh");

      // Verify no requests were made to clinical or appointment services
      const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((u) => u.includes("/api/v1/medical-records"))).toBe(false);
      expect(calledUrls.some((u) => u.includes("/api/v1/appointments"))).toBe(false);
    });

    it("restricts access to DOCTOR and denies STAFF without clinical API calls", async () => {
      currentSession = makeSession("STAFF");
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });

      expect(container.textContent).toContain("Không có quyền truy cập hồ sơ khám");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("allows DOCTOR and loads assigned appointments, patient info, and records", async () => {
      currentSession = makeSession("DOCTOR");
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/appointments")) {
          return envelope({ items: [mockAppointment] });
        }
        if (url.includes("/api/v1/medical-records")) {
          return envelope({ items: [mockDraftRecord] });
        }
        if (url.includes("/api/v1/patients/")) {
          return envelope(mockPatientProfile);
        }
        return failure("Not found", 404);
      });
      globalThis.fetch = fetchSpy;

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });

      // Wait for state updates
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(container.textContent).toContain("Hồ sơ bệnh án gần đây");
      expect(container.textContent).toContain("Viêm họng cấp");
      expect(container.textContent).toContain("Bản nháp (DRAFT)");
    });

    it("supports doctor draft save flow without confirm modal and keeps form editable", async () => {
      currentSession = makeSession("DOCTOR");
      let savedBody: { status?: string } | null = null;

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.includes("/api/v1/appointments")) {
          return envelope({ items: [mockAppointment] });
        }
        if (url.includes("/api/v1/patients/")) {
          return envelope(mockPatientProfile);
        }
        if (url.includes("/api/v1/medical-records") && method === "GET") {
          return envelope({ items: [] });
        }
        if (url.includes("/api/v1/medical-records") && method === "POST") {
          savedBody = JSON.parse(String(init?.body));
          return envelope({ id: "rec-new-123", ...savedBody }, 201);
        }
        return failure("Not found", 404);
      });

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Select appointment
      const select = container.querySelector("#appointment-select") as HTMLSelectElement;
      expect(select).not.toBeNull();
      await act(async () => {
        select.value = mockAppointment.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Enter clinical info
      const symptomsInput = container.querySelector("#symptoms-input") as HTMLTextAreaElement;
      const diagnosisInput = container.querySelector("#diagnosis-input") as HTMLTextAreaElement;

      await act(async () => {
        changeInputValue(symptomsInput, "Sốt 39 độ, ho");
        changeInputValue(diagnosisInput, "Cảm cúm thông thường");
      });

      // Click "Lưu nháp (DRAFT)"
      const draftBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Lưu nháp")
      );
      expect(draftBtn).toBeDefined();

      await act(async () => {
        draftBtn?.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Assert draft was sent with status DRAFT
      expect(savedBody).not.toBeNull();
      const payload = savedBody as { status?: string } | null;
      expect(payload?.status).toBe("DRAFT");

      // Verify form is still editable (not locked readonly)
      expect(symptomsInput.readOnly).toBe(false);
      expect(container.textContent).toContain("Đã lưu nháp hồ sơ khám bệnh thành công");
      expect(container.textContent).toContain("Bản nháp (DRAFT)");
    });

    it("requires ConfirmModal before FINAL and locks form to readonly only after server success", async () => {
      currentSession = makeSession("DOCTOR");
      let postCalled = false;

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.includes("/api/v1/appointments")) {
          return envelope({ items: [mockAppointment] });
        }
        if (url.includes("/api/v1/patients/")) {
          return envelope(mockPatientProfile);
        }
        if (url.includes("/api/v1/medical-records") && method === "GET") {
          return envelope({ items: [] });
        }
        if (url.includes("/api/v1/medical-records") && method === "POST") {
          postCalled = true;
          return envelope({ id: "rec-final-999", status: "FINAL" }, 201);
        }
        return failure("Not found", 404);
      });

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Select appointment
      const select = container.querySelector("#appointment-select") as HTMLSelectElement;
      await act(async () => {
        select.value = mockAppointment.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const diagnosisInput = container.querySelector("#diagnosis-input") as HTMLTextAreaElement;
      await act(async () => {
        changeInputValue(diagnosisInput, "Viêm amidan");
      });

      // Click "Chốt bệnh án (FINAL)"
      const finalBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Chốt bệnh án")
      );
      expect(finalBtn).toBeDefined();

      await act(async () => {
        finalBtn?.click();
      });

      // ConfirmModal MUST be shown
      expect(document.body.textContent).toContain("Xác nhận chốt bệnh án (FINAL)");
      expect(document.body.textContent).toContain("Sau khi chốt bệnh án ở trạng thái FINAL");
      expect(postCalled).toBe(false);

      // Confirm in dialog
      const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Xác nhận chốt bệnh án")
      );
      expect(confirmBtn).toBeDefined();

      await act(async () => {
        confirmBtn?.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Server was called
      expect(postCalled).toBe(true);

      // Form is now locked (readonly)
      const symptomsInput = container.querySelector("#symptoms-input") as HTMLTextAreaElement;
      expect(symptomsInput.readOnly).toBe(true);
      expect(container.textContent).toContain("Hồ sơ đã được chốt hoàn tất (FINAL)");
      expect(container.textContent).toContain("FINAL · ĐÃ CHỐT HOÀN TẤT");
      expect(container.textContent).toContain("Trạng thái hoàn thành lịch hẹn chưa được xác nhận.");
      expect(container.textContent).not.toContain("Lịch hẹn đã hoàn thành (COMPLETED)");
      expect(container.textContent).toContain("Lập hồ sơ ca khám mới");
    });

    it("preserves draft inputs when request fails and allows retry without page reload", async () => {
      currentSession = makeSession("DOCTOR");
      let attempts = 0;

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.includes("/api/v1/appointments")) {
          return envelope({ items: [mockAppointment] });
        }
        if (url.includes("/api/v1/patients/")) {
          return envelope(mockPatientProfile);
        }
        if (url.includes("/api/v1/medical-records") && method === "GET") {
          return envelope({ items: [] });
        }
        if (url.includes("/api/v1/medical-records") && method === "POST") {
          attempts++;
          if (attempts === 1) {
            return failure("Lỗi kết nối máy chủ dịch vụ khám", 500);
          }
          return envelope({ id: "rec-success-1", status: "DRAFT" }, 201);
        }
        return failure("Not found", 404);
      });

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Select appointment & fill symptoms
      const select = container.querySelector("#appointment-select") as HTMLSelectElement;
      await act(async () => {
        select.value = mockAppointment.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const symptomsInput = container.querySelector("#symptoms-input") as HTMLTextAreaElement;
      await act(async () => {
        changeInputValue(symptomsInput, "Đau tức ngực trái");
      });

      // Click draft
      const draftBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Lưu nháp")
      );
      await act(async () => {
        draftBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Verify error displayed, but inputs preserved and form NOT locked
      expect(container.textContent).toContain("Lỗi kết nối máy chủ dịch vụ khám");
      expect(symptomsInput.value).toBe("Đau tức ngực trái");
      expect(symptomsInput.readOnly).toBe(false);

      // Retry button exists
      const retryBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Thử lại thao tác")
      );
      expect(retryBtn).toBeDefined();

      // Click retry
      await act(async () => {
        retryBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(attempts).toBe(2);
      expect(container.textContent).toContain("Đã lưu nháp hồ sơ khám bệnh thành công");
      expect(symptomsInput.value).toBe("Đau tức ngực trái");
    });

    it("Agent B: renders skeleton only at data regions with aria-busy, preserving headings and static controls immediately", async () => {
      currentSession = makeSession("DOCTOR", "loading");

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });

      // Tên trang và Section headings xuất hiện ngay
      expect(container.textContent).toContain("Hồ sơ khám bệnh");
      expect(container.textContent).toContain("Ca đang khám");
      expect(container.textContent).toContain("Hồ sơ bệnh án gần đây");

      // The picker/history frame is stable; clinical input starts after selection.
      expect(container.textContent).toContain("Chọn ca khám");
      expect(container.textContent).toContain("Chọn ca để bắt đầu");
      expect(container.querySelector("textarea")).toBeNull();

      // Skeletons chỉ ở vùng data và có aria-busy="true"
      const busyElements = container.querySelectorAll("[aria-busy='true']");
      expect(busyElements.length).toBeGreaterThanOrEqual(2);
    });

    it("Agent B: shows empty state ONLY after successful response [], never on network or auth error", async () => {
      currentSession = makeSession("DOCTOR");
      let shouldFail = true;

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/appointments")) {
          return envelope({ items: [] });
        }
        if (url.includes("/api/v1/medical-records")) {
          if (shouldFail) {
            return failure("Lỗi mạng khi tải hồ sơ", 500);
          }
          return envelope({ items: [] });
        }
        return failure("Not found", 404);
      });

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Lỗi mạng/auth: hiển thị ErrorState với nút thử lại, TUYỆT ĐỐI KHÔNG hiển thị EmptyState
      expect(container.textContent).toContain("Lỗi mạng khi tải hồ sơ");
      expect(container.textContent).toContain("Thử lại");
      expect(container.textContent).not.toContain("Chưa có hồ sơ khám bệnh nào");

      // Sau khi server thành công trả về []: hiển thị EmptyState
      shouldFail = false;
      const retryBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Thử lại")
      );
      expect(retryBtn).toBeDefined();

      await act(async () => {
        retryBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(container.textContent).toContain("Chưa có hồ sơ khám bệnh nào");
      expect(container.textContent).toContain("Các kết quả khám sau khi bác sĩ lập sẽ xuất hiện tại đây");
    });

    it("Agent B: stale data indicator preserves old records with clear label during refresh", async () => {
      currentSession = makeSession("DOCTOR");
      let resolveRefresh: ((res: Response) => void) | null = null;
      let callCount = 0;

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/appointments")) {
          return envelope({ items: [mockAppointment] });
        }
        if (url.includes("/api/v1/patients/")) {
          return envelope(mockPatientProfile);
        }
        if (url.includes("/api/v1/medical-records")) {
          callCount++;
          if (callCount === 1) {
            // First load returns initial record
            return envelope({ items: [mockFinalRecord] });
          }
          // Second load hangs until resolved to simulate loading state
          return new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          });
        }
        return failure("Not found", 404);
      });

      await act(async () => {
        root.render(<MedicalRecordsPanel />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Old record is visible
      expect(container.textContent).toContain("Viêm họng cấp");
      expect(container.textContent).toContain("Đã chốt (FINAL)");

      // Click "Làm mới"
      const refreshBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Làm mới")
      );
      expect(refreshBtn).toBeDefined();

      await act(async () => {
        refreshBtn?.click();
      });

      // During refresh: Old record is STILL in DOM and stale notice banner is displayed!
      expect(container.textContent).toContain("Viêm họng cấp");
      expect(container.textContent).toContain("Đang làm mới…");
      expect(container.textContent).toContain("Đang tải dữ liệu hồ sơ mới nhất. Đang hiển thị kết quả từ lần tải trước.");

      // Complete refresh
      await act(async () => {
        if (resolveRefresh) {
          resolveRefresh(envelope({ items: [mockFinalRecord] }));
        }
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(container.textContent).toContain("Viêm họng cấp");
    });

    it("loads a recordId deep link outside the history page and keeps FINAL read-only", async () => {
      currentSession = makeSession("DOCTOR");
      window.history.replaceState({}, "", "/medical-records?recordId=record-outside-page");
      const target = { ...mockFinalRecord, id: "record-outside-page", appointmentId: "appointment-outside-page", symptoms: "Nội dung hồ sơ được liên kết" };
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://gateway.test");
        if (url.pathname === `/api/v1/medical-records/${target.id}`) return envelope(target);
        if (url.pathname === `/api/v1/appointments/${target.appointmentId}`) return envelope({ ...mockAppointment, id: target.appointmentId });
        if (url.pathname === "/api/v1/medical-records") return envelope({ items: [mockDraftRecord], total: 21 });
        if (url.pathname === "/api/v1/appointments") return envelope({ items: [], total: 0 });
        if (url.pathname.includes("/patients/")) return envelope(mockPatientProfile);
        return failure("Not found", 404);
      });
      globalThis.fetch = fetchSpy;
      await act(async () => { root.render(<MedicalRecordsPanel />); });
      const symptoms = container.querySelector<HTMLTextAreaElement>("#symptoms-input");
      expect(symptoms?.value).toBe(target.symptoms);
      expect(symptoms?.readOnly).toBe(true);
      expect(fetchSpy.mock.calls.some(([input]) => String(input).includes(`/medical-records/${target.id}`))).toBe(true);
      expect(container.textContent).toContain("Trạng thái hoàn thành lịch hẹn chưa được xác nhận.");
    });

    it("keeps appointmentId deep links scoped when the target draft is outside the history page", async () => {
      currentSession = makeSession("DOCTOR");
      const target = { ...mockDraftRecord, id: "record-scoped", appointmentId: "appointment-scoped" };
      window.history.replaceState({}, "", `/medical-records?appointmentId=${target.appointmentId}`);
      let patchUrl = "";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://gateway.test");
        if (init?.method === "PATCH") { patchUrl = url.pathname; return envelope(target); }
        if (url.pathname === "/api/v1/medical-records") return envelope({ items: url.searchParams.get("appointmentId") === target.appointmentId ? [target] : [], total: 1 });
        if (url.pathname === `/api/v1/appointments/${target.appointmentId}`) return envelope({ ...mockAppointment, id: target.appointmentId });
        if (url.pathname === "/api/v1/appointments") return envelope({ items: [] });
        if (url.pathname.includes("/patients/")) return envelope(mockPatientProfile);
        return failure("Not found", 404);
      });
      await act(async () => { root.render(<MedicalRecordsPanel />); });
      expect(container.querySelector<HTMLTextAreaElement>("#symptoms-input")?.value).toBe(target.symptoms);
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Lưu nháp"))?.click(); });
      expect(patchUrl).toBe(`/api/v1/medical-records/${target.id}`);
    });

    it("loads more CHECKED_IN appointments beyond the first twenty before creating a record", async () => {
      currentSession = makeSession("DOCTOR");
      const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...mockAppointment, id: `appointment-${index}` }));
      const target = { ...mockAppointment, id: "appointment-21", patientId: "patient-21" };
      let savedAppointment = "";
      const queries: URLSearchParams[] = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://gateway.test");
        if (init?.method === "POST") { savedAppointment = JSON.parse(String(init.body)).appointmentId; return envelope({ id: "new-record", status: "DRAFT" }); }
        if (url.pathname === "/api/v1/appointments") { queries.push(url.searchParams); return envelope({ items: url.searchParams.get("page") === "2" ? [target] : firstPage, total: 21 }); }
        if (url.pathname === "/api/v1/medical-records") return envelope({ items: [], total: 0 });
        if (url.pathname.includes("/patients/")) return envelope({ ...mockPatientProfile, id: target.patientId });
        return failure("Not found", 404);
      });
      await act(async () => { root.render(<MedicalRecordsPanel />); });
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Tải thêm ca"))?.click(); });
      const select = container.querySelector<HTMLSelectElement>("#appointment-select")!;
      expect(select.options.length).toBe(22);
      await act(async () => { select.value = target.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Lưu nháp"))?.click(); });
      expect(savedAppointment).toBe(target.id);
      expect(queries.map((query) => [query.get("status"), query.get("page")])).toEqual([["CHECKED_IN", "1"], ["CHECKED_IN", "2"]]);
    });

    it("preserves an unsaved draft through history pagination and cancelled encounter changes", async () => {
      currentSession = makeSession("DOCTOR");
      const other = { ...mockDraftRecord, id: "record-page-2", appointmentId: "appointment-page-2", symptoms: "Nội dung của ca khác" };
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://gateway.test");
        if (url.pathname === "/api/v1/appointments") return envelope({ items: [mockAppointment] });
        if (url.pathname === `/api/v1/appointments/${other.appointmentId}`) return envelope({ ...mockAppointment, id: other.appointmentId });
        if (url.pathname === "/api/v1/medical-records") return envelope({ items: url.searchParams.get("page") === "2" ? [other] : [mockDraftRecord], total: 21 });
        if (url.pathname.includes("/patients/")) return envelope(mockPatientProfile);
        return failure("Not found", 404);
      });
      await act(async () => { root.render(<MedicalRecordsPanel />); });
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Tiếp tục chỉnh sửa"))?.click(); });
      const symptoms = container.querySelector<HTMLTextAreaElement>("#symptoms-input")!;
      await act(async () => { changeInputValue(symptoms, "Bản nháp chưa lưu của ca hiện tại"); });
      currentSession = { ...currentSession, getAccessToken: async () => "refreshed-token" };
      await act(async () => { root.render(<MedicalRecordsPanel />); });
      expect(container.querySelector<HTMLTextAreaElement>("#symptoms-input")?.value).toBe("Bản nháp chưa lưu của ca hiện tại");
      await act(async () => { container.querySelector<HTMLButtonElement>("button[aria-label='Trang sau']")?.click(); });
      expect(symptoms.value).toBe("Bản nháp chưa lưu của ca hiện tại");
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Tiếp tục chỉnh sửa"))?.click(); });
      expect(document.body.textContent).toContain("Đổi ca khi chưa lưu?");
      await act(async () => { Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "Quay lại hồ sơ")?.click(); });
      expect(symptoms.value).toBe("Bản nháp chưa lưu của ca hiện tại");
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Tiếp tục chỉnh sửa"))?.click(); });
      await act(async () => { Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "Bỏ thay đổi và đổi ca")?.click(); });
      expect(container.querySelector<HTMLTextAreaElement>("#symptoms-input")?.value).toBe(other.symptoms);
    });

    it.each([
      ["PENDING", "Đang đồng bộ trạng thái lịch hẹn."],
      ["COMPLETED", "Lịch hẹn đã hoàn thành (COMPLETED)."],
    ] as const)("uses authoritative record completion evidence: %s", async (completion, expected) => {
      currentSession = makeSession("DOCTOR");
      const target = { ...mockFinalRecord, appointmentCompletion: completion };
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/appointments")) return envelope({ items: [mockAppointment] });
        if (url.includes("/medical-records")) return envelope({ items: [target] });
        if (url.includes("/patients/")) return envelope(mockPatientProfile);
        return failure("Not found", 404);
      });
      await act(async () => { root.render(<MedicalRecordsPanel />); });
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Xem hồ sơ (Chỉ đọc)"))?.click(); });
      expect(container.textContent).toContain(expected);
      expect(container.querySelector<HTMLTextAreaElement>("#diagnosis-input")?.readOnly).toBe(true);
      if (completion === "PENDING") expect(container.textContent).not.toContain("Lịch hẹn đã hoàn thành (COMPLETED).");
    });
  });
});