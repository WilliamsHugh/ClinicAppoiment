// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueueBoard, type QueueBoardProps } from "../src/features/appointments/queue-board";
import type { ClinicRole, Session } from "../src/lib/session/session";
import { cancelled, checkedIn, completed, confirmed, doctorId, envelope, failure, gateway,
  noShow, patientId, pending, slot, type Override } from "./queue-fixtures";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({ useSession: () => currentSession }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-07T00:00:00Z"));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
  // happy-dom does not implement the browser's modal top layer/focus containment.
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});
async function render(role: ClinicRole = "STAFF", fetcher = gateway(), props: QueueBoardProps = {}) {
  currentSession = { status: "authenticated", identity: { id: "staff-user", role },
    getAccessToken: async () => "synthetic-token", signIn: async () => {}, signOut: async () => {} };
  vi.stubGlobal("fetch", fetcher);
  await act(async () => { root.render(<QueueBoard {...props} />); });
  return fetcher;
}
function button(label: string, within: ParentNode = host): HTMLButtonElement {
  const value = Array.from(within.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!value) throw new Error(`Missing button ${label}`); return value;
}
function ticket(status: string): HTMLElement {
  const element = host.querySelector(`[data-status="${status}"]`)?.closest("article");
  if (!element) throw new Error(`Missing ticket ${status}`); return element;
}
function dialog(): HTMLDialogElement {
  const value = host.querySelector("dialog"); if (!value) throw new Error("Missing dialog"); return value;
}
async function click(value: HTMLElement) { await act(async () => value.click()); }
async function change(value: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value), "value")!.set!.call(value, text);
    value.dispatchEvent(new Event(value instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => dialog().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
const writes = (fetcher: ReturnType<typeof gateway>) => fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH");

describe("Clinic Queue Board", () => {
  it("renders names, clinic time, terminal statuses, and no raw IDs or insurance numbers", async () => {
    const fetcher = await render();
    expect(host.textContent).toContain("Hàng đợi khám");
    expect(host.textContent).toContain("6 lịch hẹn");
    expect(host.textContent).toContain("08:00–08:30");
    expect(host.textContent).toContain("Nguyễn Văn An");
    expect(host.textContent).toContain("Bác sĩ Bình");
    expect(host.textContent).not.toContain(patientId);
    expect(host.textContent).not.toContain(doctorId);
    expect(host.textContent).not.toContain("DN4011234567890");
    expect(ticket("CANCELLED")).toBeDefined();
    expect(ticket("NO_SHOW")).toBeDefined();
    expect(writes(fetcher)).toHaveLength(0);
  });
  it.each(["STAFF", "ADMIN"] as const)("gives %s only valid actions, never complete", async (role) => {
    await render(role);
    expect(button("Xác nhận", ticket("PENDING"))).toBeDefined();
    expect(button("Check-in", ticket("CONFIRMED"))).toBeDefined();
    expect(ticket("CHECKED_IN").querySelectorAll("button")).toHaveLength(1);
    expect(ticket("COMPLETED").querySelectorAll("button")).toHaveLength(1);
    expect(Array.from(host.querySelectorAll("button")).some((item) => item.textContent === "Hoàn thành")).toBe(false);
  });
  it("keeps doctor board read-only and performs appointment-scoped lookups", async () => {
    const fetcher = await render("DOCTOR", gateway([pending, confirmed]));
    expect(host.textContent).toContain("được phân công cho bạn");
    expect(Array.from(host.querySelectorAll("article button")).every((item) => item.textContent === "Chi tiết lịch hẹn")).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/patients/")).every(([url]) => new URL(String(url)).searchParams.has("appointmentId"))).toBe(true);
  });
  it("rejects patient and unauthenticated sessions before any data request", async () => {
    const fetcher = await render("PATIENT");
    expect(host.textContent).toContain("Truy cập bị từ chối"); expect(fetcher).not.toHaveBeenCalled();
    currentSession = { ...currentSession, status: "unauthenticated", identity: null };
    await act(async () => root.render(<QueueBoard />));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("confirms and checks in without reload, re-fetches authoritative board", async () => {
    const fetcher = await render("STAFF", gateway([pending]));
    const listCount = () => fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname === "/api/v1/appointments").length;
    expect(listCount()).toBe(1);
    await click(button("Xác nhận", ticket("PENDING")));
    expect(ticket("CONFIRMED")).toBeDefined();
    await click(button("Check-in", ticket("CONFIRMED")));
    expect(ticket("CHECKED_IN")).toBeDefined();
    expect(writes(fetcher).map(([url]) => new URL(String(url)).pathname.split("/").at(-1))).toEqual(["confirm", "check-in"]);
    expect(listCount()).toBe(3);
  });
  it("requires cancellation reason and confirmation; updates only after server success", async () => {
    const fetcher = await render("STAFF", gateway([pending]));
    await click(button("Hủy lịch", ticket("PENDING")));
    expect(dialog().open).toBe(true); expect(writes(fetcher)).toHaveLength(0);
    await submit(); expect(writes(fetcher)).toHaveLength(0);
    expect(dialog().textContent).toContain("Vui lòng nhập lý do");
    await change(dialog().querySelector("textarea")!, "  Bệnh nhân yêu cầu  ");
    await submit();
    expect(host.querySelector("dialog")).toBeNull(); expect(ticket("CANCELLED")).toBeDefined();
    expect(JSON.parse(String(writes(fetcher)[0][1]?.body))).toEqual({ reason: "Bệnh nhân yêu cầu" });
  });
  it("asks confirmation before no-show and sends no writes on dismissal", async () => {
    const fetcher = await render("STAFF", gateway([confirmed]));
    await click(button("No-show", ticket("CONFIRMED")));
    expect(writes(fetcher)).toHaveLength(0);
    await click(button("Quay lại", dialog())); expect(writes(fetcher)).toHaveLength(0);
    await click(button("No-show", ticket("CONFIRMED")));
    await submit(); expect(ticket("NO_SHOW")).toBeDefined();
  });
  it("blocks duplicate quick actions until the request resolves", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = gateway([pending], (_url, method) => method === "PATCH" ? new Promise<Response>((done) => { resolve = done; }) : undefined);
    await render("STAFF", fetcher);
    const confirm = button("Xác nhận", ticket("PENDING"));
    await act(async () => { confirm.click(); confirm.click(); });
    expect(writes(fetcher)).toHaveLength(1);
    expect(confirm.disabled).toBe(true);
    await act(async () => { resolve(envelope({ ...pending, status: "CONFIRMED" })); });
  });
  it("keeps the cancellation form open and blocks Escape while a write is pending", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = gateway([pending], (_url, method) => method === "PATCH" ? new Promise<Response>((done) => { resolve = done; }) : undefined);
    await render("STAFF", fetcher); await click(button("Hủy lịch", ticket("PENDING")));
    await change(dialog().querySelector("textarea")!, "Đổi kế hoạch");
    await submit(); await submit();
    expect(writes(fetcher)).toHaveLength(1);
    await act(async () => { dialog().dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(dialog().open).toBe(true);
    expect(button("Đóng", dialog()).disabled).toBe(true);
    await act(async () => resolve(envelope({ ...pending, status: "CANCELLED" })));
  });
  it("reschedules to a real API slot; conflict preserves reason and refreshes slots", async () => {
    let slotReads = 0; let patchCount = 0;
    const nextSlot = { startAt: "2030-01-07T04:00:00.000Z", endAt: "2030-01-07T04:30:00.000Z" };
    const override: Override = (url, method) => {
      if (url.pathname.endsWith("/available-slots")) { slotReads++; return envelope(slotReads === 1 ? [slot] : [nextSlot]); }
      if (method === "PATCH" && ++patchCount === 1) return failure("APPOINTMENT_SLOT_UNAVAILABLE");
    };
    const fetcher = await render("STAFF", gateway([pending], override));
    await click(button("Đổi lịch", ticket("PENDING")));
    await change(dialog().querySelector("textarea")!, "Theo yêu cầu bệnh nhân");
    await change(dialog().querySelector("select")!, slot.startAt); await submit();
    expect(slotReads).toBe(2);
    expect(dialog().querySelector("textarea")!.value).toBe("Theo yêu cầu bệnh nhân");
    expect(dialog().querySelector("select")!.value).toBe("");
    expect(dialog().textContent).toContain("Khung giờ không còn khả dụng");
    await change(dialog().querySelector("select")!, nextSlot.startAt); await submit();
    expect(host.querySelector("dialog")).toBeNull();
    expect(ticket("PENDING").textContent).toContain("11:00–11:30");
    expect(JSON.parse(String(writes(fetcher)[1][1]?.body))).toEqual({ reason: "Theo yêu cầu bệnh nhân",
      scheduledStartAt: nextSlot.startAt, scheduledEndAt: nextSlot.endAt });
  });
  it("shows slot lookup retry and an empty day without discarding the reason", async () => {
    let fail = true;
    await render("STAFF", gateway([pending], (url) => url.pathname.endsWith("/available-slots") ?
      fail ? failure("DEPENDENCY_UNAVAILABLE", 503) : envelope([]) : undefined));
    await click(button("Đổi lịch", ticket("PENDING")));
    await change(dialog().querySelector("textarea")!, "Giữ lý do");
    fail = false; await click(button("Thử lại khung giờ", dialog()));
    expect(dialog().textContent).toContain("Ngày này không còn khung giờ phù hợp");
    expect(dialog().querySelector("textarea")!.value).toBe("Giữ lý do");
    expect(button("Xác nhận đổi lịch", dialog()).disabled).toBe(true);
  });
  it("keeps stale day responses from replacing a newer date selection", async () => {
    let resolveOld!: (response: Response) => void;
    const fetcher = gateway([], (url) => url.pathname === "/api/v1/appointments" &&
      url.searchParams.get("from") === "2030-01-06T17:00:00.000Z" ? new Promise<Response>((done) => { resolveOld = done; }) : undefined);
    await render("STAFF", fetcher);
    expect(host.querySelector('[aria-label="Đang tải lịch hẹn"]')).not.toBeNull();
    await change(host.querySelector('input[type="date"]')!, "2030-01-08");
    expect(host.textContent).toContain("Chưa có lịch hẹn trong ngày");
    await act(async () => resolveOld(envelope({ items: [pending], page: 1, limit: 100, total: 1 })));
    expect(host.querySelector("article")).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe("2030-01-08");
  });
  it("shows retry after list failure and recovers", async () => {
    let fail = true;
    const fetcher = gateway([pending], (url) => url.pathname === "/api/v1/appointments" && fail ? failure("DEPENDENCY_UNAVAILABLE", 503) : undefined);
    await render("STAFF", fetcher);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Bảng hàng đợi"]')).toBeNull();
    expect(host.textContent).not.toContain("Internal detail");
    fail = false; await click(button("Thử lại"));
    expect(ticket("PENDING")).toBeDefined();
  });
  it("disables reception actions when the patient's identity could not be resolved", async () => {
    await render("STAFF", gateway([pending], (url) => url.pathname.includes("/patients/") ? failure("DEPENDENCY_UNAVAILABLE", 503) : undefined));
    expect(host.textContent).toContain("Chưa có tên bệnh nhân");
    expect(button("Xác nhận", ticket("PENDING")).disabled).toBe(true);
    expect(button("Hủy lịch", ticket("PENDING")).disabled).toBe(true);
  });
  it("reports a committed mutation separately from a failed list refresh", async () => {
    let failReads = false;
    const fetcher = gateway([pending], (url, method) => {
      if (method === "PATCH") { failReads = true; return envelope({ ...pending, status: "CONFIRMED" }); }
      if (url.pathname === "/api/v1/appointments" && failReads) return failure("DEPENDENCY_UNAVAILABLE", 503);
    });
    await render("STAFF", fetcher); await click(button("Xác nhận", ticket("PENDING")));
    expect(ticket("CONFIRMED")).toBeDefined();
    expect(host.textContent).toContain("Xác nhận thành công");
    expect(host.textContent).toContain("Dữ liệu hiện có thể đã thay đổi");
    expect(button("Check-in", ticket("CONFIRMED")).disabled).toBe(true);
    expect(writes(fetcher)).toHaveLength(1);
  });
  it("blocks retrying an ambiguous network mutation until the board is checked", async () => {
    const fetcher = gateway([pending], (_url, method) => { if (method === "PATCH") throw new TypeError("offline"); return undefined; });
    await render("STAFF", fetcher); await click(button("Hủy lịch", ticket("PENDING")));
    await change(dialog().querySelector("textarea")!, "Bệnh nhân yêu cầu"); await submit();
    expect(dialog().querySelector("textarea")!.value).toBe("Bệnh nhân yêu cầu");
    expect(button("Xác nhận hủy lịch", dialog()).disabled).toBe(true);
    await submit(); expect(writes(fetcher)).toHaveLength(1);
  });
  it("uses an injected TV2 lookup provider without rendering sensitive patient fields itself", async () => {
    const lookup = vi.fn(({ patientId: id, appointmentId: appointment }: { patientId: string; appointmentId: string }) =>
      <p>Hồ sơ bệnh nhân đã chọn {id === patientId && appointment === pending.id ? "đúng" : "sai"}</p>);
    await render("STAFF", gateway([pending]), { PatientLookup: lookup });
    await click(button("Chi tiết lịch hẹn", ticket("PENDING")));
    expect(dialog().textContent).toContain("Hồ sơ bệnh nhân đã chọn đúng");
    expect(dialog().textContent).not.toContain(patientId);
    expect(dialog().textContent).not.toContain("DN4011234567890");
  });
  it("does not retain another actor's patient data after a session change", async () => {
    await render("STAFF", gateway([pending])); expect(ticket("PENDING")).toBeDefined();
    currentSession = { ...currentSession, status: "unauthenticated", identity: null };
    await act(async () => root.render(<QueueBoard />));
    expect(host.textContent).not.toContain("Nguyễn Văn An");
    expect(host.querySelector("article")).toBeNull();
  });
});
