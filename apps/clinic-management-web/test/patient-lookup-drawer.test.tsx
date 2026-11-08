// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueueBoard } from "../src/features/appointments/queue-board";
import {
  formatPatientDate,
  maskInsuranceNumber,
  PatientLookupDrawer,
} from "../src/features/users/patient-lookup-drawer";
import type { ClinicRole, Session } from "../src/lib/session/session";
import {
  cancelled,
  completed,
  confirmed,
  doctorId,
  envelope,
  failure,
  gateway,
  patientId,
  pending,
} from "./queue-fixtures";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({ useSession: () => currentSession }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-07T00:00:00Z"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

function setSession(role: ClinicRole = "STAFF") {
  currentSession = {
    status: "authenticated",
    identity: { id: "staff-user", role },
    getAccessToken: async () => "synthetic-token",
    signIn: async () => {},
    signOut: async () => {},
  };
}

describe("PatientLookupDrawer (M3-UI-USER-005)", () => {
  it("masks insurance numbers to XXXXX...*** format", () => {
    expect(maskInsuranceNumber("DN40112345678")).toBe("DN401...***");
    expect(maskInsuranceNumber("  GD4799876543210  ")).toBe("GD479...***");
    expect(maskInsuranceNumber("ABCDE")).toBe("ABCDE");
    expect(maskInsuranceNumber("")).toBe("—");
    expect(maskInsuranceNumber(null)).toBe("—");
    expect(maskInsuranceNumber(undefined)).toBe("—");
  });

  it("formats patient date of birth to dd/MM/yyyy", () => {
    expect(formatPatientDate("1985-05-12")).toBe("12/05/1985");
    expect(formatPatientDate(null)).toBe("Chưa cập nhật");
  });

  it("renders loading skeleton while fetching and then displays masked BHYT and up to 5 recent appointments", async () => {
    setSession("STAFF");
    let resolvePatient!: (res: Response) => void;

    const historyItems = [
      { ...completed, id: "00000000-0000-4000-8000-000000000101", scheduledStartAt: "2026-10-15T02:00:00.000Z" },
      { ...cancelled, id: "00000000-0000-4000-8000-000000000102", scheduledStartAt: "2026-09-08T02:00:00.000Z" },
      { ...confirmed, id: "00000000-0000-4000-8000-000000000103", scheduledStartAt: "2026-08-20T02:00:00.000Z" },
      { ...pending, id: "00000000-0000-4000-8000-000000000104", scheduledStartAt: "2026-07-10T02:00:00.000Z" },
      { ...completed, id: "00000000-0000-4000-8000-000000000105", scheduledStartAt: "2026-06-05T02:00:00.000Z" },
      { ...completed, id: "00000000-0000-4000-8000-000000000106", scheduledStartAt: "2026-05-01T02:00:00.000Z" },
    ];

    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === `/api/v1/patients/${patientId}`) {
        return new Promise<Response>((done) => {
          resolvePatient = done;
        });
      }
      if (url.pathname === "/api/v1/appointments") {
        return envelope({ items: historyItems, page: 1, limit: 5, total: 6 });
      }
      if (url.pathname === `/api/v1/doctors/${doctorId}`) {
        return envelope({ id: doctorId, displayName: "BS. Trần B" });
      }
      throw new Error(`Unexpected URL: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const onClose = vi.fn();
    await act(async () => {
      root.render(<PatientLookupDrawer patientId={patientId} appointmentId={pending.id} onClose={onClose} />);
    });

    expect(host.querySelector('[aria-label="Đang tải hồ sơ bệnh nhân"]')).not.toBeNull();

    await act(async () => {
      resolvePatient(
        envelope({
          id: patientId,
          fullName: "Nguyễn Văn A",
          phone: "0901 234 567",
          dateOfBirth: "1985-05-12",
          insuranceNumber: "DN40112345678",
          address: "12 Lê Lợi, Q.1, TP.HCM",
        })
      );
    });

    expect(host.querySelector('[aria-label="Đang tải hồ sơ bệnh nhân"]')).toBeNull();
    expect(host.textContent).toContain("Nguyễn Văn A");
    expect(host.textContent).toContain("0901 234 567");
    expect(host.textContent).toContain("12/05/1985");
    expect(host.textContent).toContain("DN401...***");
    expect(host.textContent).not.toContain("DN40112345678");
    expect(host.textContent).toContain("12 Lê Lợi, Q.1, TP.HCM");
    expect(host.textContent).toContain("BS. Trần B");
    expect(host.textContent).toContain("Hoàn thành");
    expect(host.textContent).toContain("Đã hủy");
    expect(host.querySelectorAll("li")).toHaveLength(5);

    const closeBtn = Array.from(host.querySelectorAll("button")).find((btn) => btn.textContent === "Đóng")!;
    await act(async () => {
      closeBtn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows error state with Retry button on failure and recovers without crashing QueueBoard", async () => {
    setSession("STAFF");
    let failLookup = false;

    const fetcher = gateway([pending], (url) => {
      if (url.pathname === `/api/v1/patients/${patientId}` && failLookup) {
        return failure("DEPENDENCY_UNAVAILABLE", 503);
      }
      if (url.pathname === "/api/v1/appointments" && url.searchParams.get("patientId") === patientId) {
        return envelope({ items: [completed], page: 1, limit: 5, total: 1 });
      }
      return undefined;
    });
    vi.stubGlobal("fetch", fetcher);

    await act(async () => {
      root.render(<QueueBoard PatientLookup={PatientLookupDrawer} />);
    });

    failLookup = true;
    const detailBtn = Array.from(host.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Chi tiết lịch hẹn"
    )!;
    await act(async () => {
      detailBtn.click();
    });

    const dialog = host.querySelector("dialog")!;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('[role="alert"]')).not.toBeNull();

    const retryBtn = Array.from(dialog.querySelectorAll("button")).find((btn) => btn.textContent === "Thử lại")!;
    expect(retryBtn).toBeDefined();

    failLookup = false;
    await act(async () => {
      retryBtn.click();
    });

    expect(dialog.textContent).toContain("Nguyễn Văn An");
    expect(dialog.textContent).toContain("DN401...***");
    expect(dialog.textContent).not.toContain("DN4011234567890");
    expect(dialog.textContent).not.toContain(patientId);
  });
});
