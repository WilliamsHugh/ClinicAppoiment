// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "../app/users/page";
import type { Session } from "../src/lib/session/session";
import { envelope } from "./queue-fixtures";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({ useSession: () => currentSession }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

async function changeInput(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("UsersPage (M3-UI-USER-004)", () => {
  it("renders status badges, prevents self-lock, debounces search 300ms, and confirms before locking", async () => {
    currentSession = {
      status: "authenticated",
      identity: { id: "admin-1", role: "ADMIN", displayName: "Admin Root" },
      getAccessToken: async () => "admin-token",
      signIn: async () => {},
      signOut: async () => {},
    };

    let resolvePatch!: (res: Response) => void;
    const usersList = [
      { id: "admin-1", email: "admin@clinic.vn", fullName: "Admin Root", role: "ADMIN", status: "ACTIVE" },
      { id: "doc-1", email: "doc@clinic.vn", fullName: "Nguyễn Văn A", role: "DOCTOR", status: "ACTIVE" },
      { id: "staff-1", email: "staff@clinic.vn", fullName: "Trần Thị B", role: "STAFF", status: "LOCKED" },
      { id: "pat-1", email: "pat@clinic.vn", fullName: "Lê Văn C", role: "PATIENT", status: "INACTIVE" },
    ];

    const fetcher = vi.fn<typeof fetch>(async (input, options) => {
      const url = new URL(String(input));
      const method = options?.method ?? "GET";
      if (url.pathname === "/api/v1/users" && method === "GET") {
        const q = url.searchParams.get("q")?.toLowerCase() ?? "";
        const filtered = q
          ? usersList.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
          : usersList;
        return envelope({ items: filtered, page: 1, limit: 10, total: filtered.length });
      }
      if (url.pathname === "/api/v1/users/doc-1/status" && method === "PATCH") {
        return new Promise<Response>((done) => {
          resolvePatch = done;
        });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await act(async () => {
      root.render(<UsersPage />);
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Check colored status badges
    expect(host.querySelector(".bg-emerald-100.text-emerald-700")?.textContent).toBe("ACTIVE");
    expect(host.querySelector(".bg-rose-100.text-rose-700")?.textContent).toBe("LOCKED");
    expect(host.querySelector(".bg-slate-100.text-slate-600")?.textContent).toBe("INACTIVE");

    // Check self-lock prevention: first row is admin-1, its Khóa button must be disabled
    const rows = Array.from(host.querySelectorAll("tbody tr"));
    const adminLockBtn = rows[0].querySelector("button")!;
    expect(adminLockBtn.textContent).toBe("Khóa");
    expect(adminLockBtn.disabled).toBe(true);

    // Check 300ms debounced search
    const searchInput = host.querySelector<HTMLInputElement>('input[aria-label="Tìm kiếm người dùng"]')!;
    const callsBeforeSearch = fetcher.mock.calls.length;
    await changeInput(searchInput, "Nguyễn");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(fetcher.mock.calls.length).toBe(callsBeforeSearch);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(fetcher.mock.calls.length).toBe(callsBeforeSearch + 1);
    expect(new URL(String(fetcher.mock.calls.at(-1)![0])).searchParams.get("q")).toBe("Nguyễn");

    // Click Khóa on Nguyễn Văn A -> opens confirmation modal instead of calling PATCH immediately
    const docLockBtn = Array.from(host.querySelectorAll<HTMLButtonElement>("tbody button")).find(
      (btn) => btn.textContent === "Khóa" && !btn.disabled
    )!;
    await act(async () => {
      docLockBtn.click();
    });

    const modal = host.querySelector('[role="dialog"]')!;
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain("Xác nhận khóa tài khoản");
    expect(modal.textContent).toContain("Nguyễn Văn A (DOCTOR)");

    // Confirm lock -> shows loading state "Đang xử lý..."
    const confirmBtn = Array.from(modal.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent === "Xác nhận khóa"
    )!;
    await act(async () => {
      confirmBtn.click();
    });
    expect(confirmBtn.textContent).toBe("Đang xử lý...");
    expect(confirmBtn.disabled).toBe(true);

    await act(async () => {
      resolvePatch(envelope({ ...usersList[1], status: "LOCKED" }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("Đã cập nhật trạng thái người dùng thành LOCKED.");
  });
});
