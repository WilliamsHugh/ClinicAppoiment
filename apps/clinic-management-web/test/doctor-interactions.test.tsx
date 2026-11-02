// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorPanel } from "../src/features/doctors/doctor-panel";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({ useSession: () => currentSession }));

const page = <T,>(items: T[]) => ({ items, page: 1, limit: 20, total: items.length });
const specialty = { id: "spec-1", name: "Tim mạch", description: null, isActive: true };
const ownDoctor = { id: "doctor-1", userId: "user-1", specialtyId: "spec-1", displayName: "Bác sĩ An", bio: null, isActive: true };
const otherDoctor = { ...ownDoctor, id: "doctor-2", userId: "user-2", displayName: "Bác sĩ Bình" };
const schedule = { id: "schedule-1", doctorId: "doctor-1", weekday: 1, startTime: "08:00", endTime: "12:00", slotDurationMinutes: 30, isActive: true };
const timeOff = { id: "off-1", doctorId: "doctor-1", startAt: "2030-01-07T01:00:00.000Z", endAt: "2030-01-07T02:00:00.000Z", reason: "Họp" };

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), { status, headers: { "Content-Type": "application/json" } });
}

function failure(status: number, message: string) {
  return new Response(JSON.stringify({ success: false, error: { code: `HTTP_${status}`, message } }),
    { status, headers: { "Content-Type": "application/json" } });
}

type Override = (path: string, method: string, url: URL, body: unknown) => Response | Promise<Response> | undefined;

function gateway(override?: Override) {
  return vi.fn<typeof fetch>(async (input, options) => {
    const path = new URL(String(input)).pathname;
    const method = options?.method ?? "GET";
    const custom = override?.(path, method, new URL(String(input)), options?.body ? JSON.parse(String(options.body)) : undefined);
    if (custom) return custom;
    if (method !== "GET") return envelope({ id: "saved" });
    if (path === "/api/v1/specialties") return envelope(page([specialty]));
    if (path === "/api/v1/doctors") return envelope(page([ownDoctor, otherDoctor]));
    if (path === "/api/v1/users") return envelope(page([
      { id: "user-3", fullName: "Bác sĩ mới", role: "DOCTOR", status: "ACTIVE" },
    ]));
    if (path === "/api/v1/doctors/doctor-1") return envelope(ownDoctor);
    if (path === "/api/v1/doctors/doctor-2") return envelope(otherDoctor);
    if (path.endsWith("/schedules")) return envelope(page([{ ...schedule, doctorId: path.split("/")[4] }]));
    if (path.endsWith("/time-offs")) return envelope(page([timeOff]));
    if (path.endsWith("/available-slots")) return envelope([]);
    throw new Error(`Unexpected Gateway path: ${path}`);
  });
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

async function render(role: ClinicRole, fetcher: ReturnType<typeof gateway>) {
  currentSession = {
    status: "authenticated",
    identity: { id: "user-1", role },
    getAccessToken: async () => "test-token",
    signIn: async () => {},
    signOut: async () => {},
  };
  vi.stubGlobal("fetch", fetcher);
  await act(async () => { root.render(<DoctorPanel />); });
}

function section(label: string): HTMLElement {
  const found = Array.from(host.querySelectorAll("section"))
    .find((node) => node.getAttribute("aria-label") === label);
  if (!found) throw new Error(`Missing section: ${label}`);
  return found;
}

function button(container: Element, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button"))
    .find((node) => node.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function doctorButton(name: string): HTMLButtonElement {
  const found = Array.from(section("Tìm bác sĩ").querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    .find((node) => node.querySelector("strong")?.textContent === name);
  if (!found) throw new Error(`Missing doctor: ${name}`);
  return found;
}

function field(container: Element, label: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const wrapper = Array.from(container.querySelectorAll("label"))
    .find((node) => node.textContent?.trim().startsWith(label));
  const found = wrapper?.querySelector("input, select, textarea");
  if (!found) throw new Error(`Missing field: ${label}`);
  return found as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
}

async function change(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
}

async function submit(form: HTMLFormElement) {
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

function calls(fetcher: ReturnType<typeof gateway>, path: string, method: string) {
  return fetcher.mock.calls.filter(([url, options]) =>
    new URL(String(url)).pathname === path && (options?.method ?? "GET") === method);
}

describe("DoctorPanel Gateway interactions", () => {
  it("selecting the current doctor keeps the loaded calendar and explicit refresh recovers a read failure", async () => {
    let failed = false;
    const fetcher = gateway((path, method) => path.endsWith("/schedules") && method === "GET" && failed ? failure(503, "Lịch chưa khả dụng") : undefined);
    await render("STAFF", fetcher); await click(doctorButton("Bác sĩ An"));
    await click(doctorButton("Bác sĩ An"));
    expect(host.querySelector('[aria-label="Lịch tuần định kỳ"]')).not.toBeNull();
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/schedules", "GET")).toHaveLength(1);
    failed = true; await click(button(host, "Tải lại lịch"));
    expect(host.textContent).not.toContain("Chưa có ca làm việc trong tuần");
    expect(host.querySelector('[aria-label="Lịch tuần định kỳ"]')).toBeNull();
    expect(button(host, "Lưu lịch").disabled).toBe(true);
    failed = false; await click(button(host, "Tải lại lịch"));
    expect(host.querySelector('[aria-label="Lịch tuần định kỳ"]')).not.toBeNull();
    expect(button(host, "Lưu lịch").disabled).toBe(false);
  });
  it("loads split sessions and Sunday from later pages; switching views reuses data and editing uses the original form", async () => {
    const fetcher = gateway((path, method, url) => {
      if (method === "GET" && path.endsWith("/schedules")) {
        const current = Number(url.searchParams.get("page"));
        const item = current === 1 ? schedule : { ...schedule, id: "sunday-session", weekday: 0, startTime: "14:00", endTime: "17:00", isActive: false };
        return envelope({ items: [item], page: current, limit: 1, total: 2 });
      }
      return undefined;
    });
    await render("STAFF", fetcher); await click(doctorButton("Bác sĩ An"));
    const calendar = host.querySelector('[aria-label="Lịch tuần định kỳ"]')!;
    expect(calendar).not.toBeNull();
    expect(calendar.querySelector('[aria-label="Chủ nhật"]')?.textContent).toContain("14:00–17:00");
    expect(calendar.querySelector('[aria-label="Chủ nhật"]')?.textContent).toContain("Đã ngừng ca");
    const scheduleSection = section("Quản lý lịch làm việc");
    await click(calendar.querySelector('[aria-label^="Sửa ca Chủ nhật"]') as HTMLElement);
    expect(field(scheduleSection, "Thứ").value).toBe("0");
    expect(field(scheduleSection, "Bắt đầu").value).toBe("14:00");
    expect(document.activeElement).toBe(field(scheduleSection, "Thứ"));
    await change(field(scheduleSection, "Kết thúc"), "18:00");
    await submit(scheduleSection.querySelector("form")!);
    expect(JSON.parse(String(calls(fetcher, "/api/v1/schedules/sunday-session", "PATCH")[0]?.[1]?.body))).toMatchObject({ weekday: 0, startTime: "14:00", endTime: "18:00" });
    const count = calls(fetcher, "/api/v1/doctors/doctor-1/schedules", "GET").length;
    await click(button(scheduleSection, "Danh sách")); await click(button(scheduleSection, "Lịch tuần"));
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/schedules", "GET")).toHaveLength(count);
  });

  it("renders the empty calendar with an action to the existing creation form", async () => {
    const fetcher = gateway((path, method) => method === "GET" && path.endsWith("/schedules") ? envelope(page([])) : undefined);
    await render("STAFF", fetcher); await click(doctorButton("Bác sĩ An"));
    expect(host.textContent).toContain("Chưa có ca làm việc trong tuần");
    await click(button(host, "Thêm ca làm việc"));
    const schedules = section("Quản lý lịch làm việc");
    expect(document.activeElement).toBe(field(schedules, "Thứ"));
    await submit(schedules.querySelector("form")!);
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/schedules", "POST")).toHaveLength(1);
  });

  it("shows schedule failure and recovery without claiming an empty week", async () => {
    let failed = true;
    const fetcher = gateway((path, method) => method === "GET" && path.endsWith("/schedules") && failed ? failure(503, "Lịch chưa khả dụng") : undefined);
    await render("STAFF", fetcher); await click(doctorButton("Bác sĩ An"));
    expect(host.textContent).toContain("Chưa tải được thông tin bác sĩ hoặc lịch làm việc");
    expect(host.textContent).not.toContain("Chưa có ca làm việc trong tuần");
    failed = false;
    await click(button(host, "Tải lại chi tiết bác sĩ"));
    expect(host.querySelector('[aria-label="Lịch tuần định kỳ"]')).not.toBeNull();
  });

  it("offers other doctors' calendars read-only and never reads private time off", async () => {
    const fetcher = gateway();
    await render("DOCTOR", fetcher); await click(doctorButton("Bác sĩ Bình"));
    const calendar = host.querySelector('[aria-label="Lịch tuần định kỳ"]')!;
    expect(calendar).not.toBeNull(); expect(calendar.querySelector("button")).toBeNull();
    expect(section("Quản lý lịch làm việc").querySelector("form")).toBeNull();
    expect(calls(fetcher, "/api/v1/doctors/doctor-2/time-offs", "GET")).toHaveLength(0);
    expect(host.querySelector('[role="switch"]')).toBeNull();
  });

  it("ADMIN switches the list and selected detail after confirmation, without reloading the directory", async () => {
    let doctor = { ...ownDoctor };
    const fetcher = gateway((path, method, _url, body) => {
      if (path === "/api/v1/doctors/doctor-1") {
        if (method === "PATCH") doctor = { ...doctor, ...(body as { isActive: boolean }) };
        return envelope(doctor);
      }
      return undefined;
    });
    await render("ADMIN", fetcher); await click(doctorButton("Bác sĩ An"));
    const activitySwitch = host.querySelector('[role="switch"][aria-label="Hoạt động của Bác sĩ An"]') as HTMLButtonElement;
    expect(activitySwitch.getAttribute("aria-checked")).toBe("true");
    await click(activitySwitch);
    expect(activitySwitch.getAttribute("aria-checked")).toBe("false");
    expect(section("Chi tiết bác sĩ").textContent).toContain("Không nhận đặt lịch");
    expect(host.textContent).toContain("đã ngừng hoạt động");
    expect(calls(fetcher, "/api/v1/doctors", "GET")).toHaveLength(1);
    expect(JSON.parse(String(calls(fetcher, "/api/v1/doctors/doctor-1", "PATCH")[0]?.[1]?.body))).toEqual({ isActive: false });
    await click(activitySwitch);
    expect(activitySwitch.getAttribute("aria-checked")).toBe("true");
    expect(calls(fetcher, "/api/v1/doctors/doctor-1", "PATCH")).toHaveLength(2);
  });

  it("pending activity change keeps confirmed state and blocks duplicate and concurrent writes", async () => {
    let finish!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = gateway((path, method) => path === "/api/v1/doctors/doctor-1" && method === "PATCH" ? response : undefined);
    await render("ADMIN", fetcher);
    const activitySwitch = host.querySelector('[role="switch"]') as HTMLButtonElement;
    await click(activitySwitch); await click(activitySwitch);
    expect(activitySwitch.disabled).toBe(true); expect(activitySwitch.getAttribute("aria-checked")).toBe("true");
    expect(activitySwitch.getAttribute("aria-busy")).toBe("true");
    await submit(section("Quản lý chuyên khoa").querySelector("form")!);
    expect(calls(fetcher, "/api/v1/specialties", "POST")).toHaveLength(0);
    expect(calls(fetcher, "/api/v1/doctors/doctor-1", "PATCH")).toHaveLength(1);
    await act(async () => { finish(envelope({ ...ownDoctor, isActive: false })); });
    expect(activitySwitch.getAttribute("aria-checked")).toBe("false");
    expect(activitySwitch.disabled).toBe(false);
  });

  it.each([403, 409, 502])("failed activity request %i preserves checked state and shows a readable explanation", async (status) => {
    const fetcher = gateway((path, method) => path === "/api/v1/doctors/doctor-1" && method === "PATCH" ?
      new Response(JSON.stringify({ success: false, error: { code: status === 409 ? "SCHEDULE_CONFLICT_WITH_APPOINTMENTS" : "FAILURE", message: "Private database info" } }), { status }) : undefined);
    await render("ADMIN", fetcher);
    const activitySwitch = host.querySelector('[role="switch"]') as HTMLButtonElement;
    await click(activitySwitch);
    expect(activitySwitch.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelector('[role="alert"]')?.textContent).not.toContain("Private");
    if (status === 409) expect(host.textContent).toContain("còn lịch hẹn tương lai");
    expect(calls(fetcher, "/api/v1/doctors/doctor-1", "PATCH")).toHaveLength(1);
  });

  it("unknown activity outcome disables switching until a successful reload reveals server state", async () => {
    let active = true;
    const fetcher = gateway((path, method) => {
      if (path === "/api/v1/doctors/doctor-1" && method === "PATCH") { active = false; throw new TypeError("Private network failure"); }
      if (path === "/api/v1/doctors" && method === "GET") return envelope(page([{ ...ownDoctor, isActive: active }]));
      return undefined;
    });
    await render("ADMIN", fetcher);
    await click(host.querySelector('[role="switch"]') as HTMLElement);
    expect((host.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain("Cần tải lại dữ liệu");
    expect(host.textContent).not.toContain("Private");
    await click(button(host, "Tải lại dữ liệu"));
    const refreshed = host.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(refreshed.disabled).toBe(false); expect(refreshed.getAttribute("aria-checked")).toBe("false");
    expect(calls(fetcher, "/api/v1/doctors/doctor-1", "PATCH")).toHaveLength(1);
  });

  it("late schedule response cannot replace the newly selected doctor's calendar", async () => {
    let finish!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = gateway((path, method) => path === "/api/v1/doctors/doctor-1/schedules" && method === "GET" ? response : undefined);
    await render("STAFF", fetcher);
    await click(doctorButton("Bác sĩ An"));
    expect(host.querySelector('[aria-label="Đang tải chi tiết"]')).not.toBeNull();
    await click(doctorButton("Bác sĩ Bình"));
    await act(async () => { finish(envelope(page([{ ...schedule, startTime: "05:00" }]))); });
    expect(section("Chi tiết bác sĩ").textContent).toContain("Bác sĩ Bình");
    expect(host.querySelector('[aria-label="Lịch tuần định kỳ"]')?.textContent).not.toContain("05:00");
  });

  it("changing role removes the old management workspace and ignores its pending switch result", async () => {
    let finish!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = gateway((path, method) => path === "/api/v1/doctors/doctor-1" && method === "PATCH" ? response : undefined);
    await render("ADMIN", fetcher); await click(doctorButton("Bác sĩ An"));
    await click(host.querySelector('[role="switch"]') as HTMLElement);
    await render("STAFF", fetcher);
    await act(async () => { finish(envelope({ ...ownDoctor, isActive: false })); });
    expect(host.querySelector('[role="switch"]')).toBeNull();
    expect(host.querySelector('[aria-label="Chi tiết bác sĩ"]')).toBeNull();
    expect(host.textContent).not.toContain("đã ngừng hoạt động");
  });
  it("loads data and lets ADMIN manage specialties and doctor account links", async () => {
    const fetcher = gateway();
    await render("ADMIN", fetcher);
    expect(calls(fetcher, "/api/v1/specialties", "GET")).toHaveLength(1);
    expect(calls(fetcher, "/api/v1/doctors", "GET")).toHaveLength(1);
    expect(calls(fetcher, "/api/v1/users", "GET")).toHaveLength(1);

    const specialties = section("Quản lý chuyên khoa");
    await change(field(specialties, "Tên chuyên khoa"), "Nội khoa");
    await submit(specialties.querySelector("form")!);
    expect(JSON.parse(String(calls(fetcher, "/api/v1/specialties", "POST")[0]![1]?.body)))
      .toMatchObject({ name: "Nội khoa" });
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Đã lưu chuyên khoa");
    expect((field(specialties, "Tên chuyên khoa") as HTMLInputElement).value).toBe("");

    await click(button(specialties, "Sửa"));
    await change(field(specialties, "Tên chuyên khoa"), "Tim mạch mới");
    await submit(specialties.querySelector("form")!);
    expect(calls(fetcher, "/api/v1/specialties/spec-1", "PATCH")).toHaveLength(1);

    const doctors = section("Quản lý hồ sơ bác sĩ");
    await change(field(doctors, "Tài khoản bác sĩ"), "user-3");
    await change(field(doctors, "Chuyên khoa"), "spec-1");
    await submit(doctors.querySelector("form")!);
    expect(JSON.parse(String(calls(fetcher, "/api/v1/doctors", "POST")[0]![1]?.body)))
      .toMatchObject({ userId: "user-3", specialtyId: "spec-1", displayName: "Bác sĩ mới" });

    await click(doctorButton("Bác sĩ An"));
    await click(button(doctors, "Sửa bác sĩ đang chọn"));
    await change(field(doctors, "Tên hiển thị"), "Bác sĩ An mới");
    await submit(doctors.querySelector("form")!);
    expect(calls(fetcher, "/api/v1/doctors/doctor-1", "PATCH")).toHaveLength(1);
  });

  it("lets a DOCTOR edit only their own schedules and time off", async () => {
    const fetcher = gateway();
    await render("DOCTOR", fetcher);
    expect(calls(fetcher, "/api/v1/users", "GET")).toHaveLength(0);
    await click(doctorButton("Bác sĩ Bình"));
    expect(host.textContent).not.toContain("Quản lý lịch làm việc");
    expect(calls(fetcher, "/api/v1/doctors/doctor-2/time-offs", "GET")).toHaveLength(0);

    await click(doctorButton("Bác sĩ An"));
    const schedules = section("Quản lý lịch làm việc");
    await click(button(schedules, "Sửa"));
    await change(field(schedules, "Kết thúc"), "13:00");
    await submit(schedules.querySelector("form")!);
    expect(calls(fetcher, "/api/v1/schedules/schedule-1", "PATCH")).toHaveLength(1);
    expect(JSON.parse(String(calls(fetcher, "/api/v1/schedules/schedule-1", "PATCH")[0]![1]?.body)))
      .toMatchObject({ endTime: "13:00" });
    await submit(schedules.querySelector("form")!);
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/schedules", "POST")).toHaveLength(1);

    const timeOffs = section("Thời gian nghỉ");
    await click(button(timeOffs, "Sửa"));
    await submit(timeOffs.querySelector("form")!);
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/time-offs/off-1", "PATCH")).toHaveLength(1);
    expect(JSON.parse(String(calls(fetcher, "/api/v1/doctors/doctor-1/time-offs/off-1", "PATCH")[0]![1]?.body)))
      .toMatchObject({ startAt: "2030-01-07T01:00:00.000Z", endAt: "2030-01-07T02:00:00.000Z" });
    await change(field(timeOffs, "Bắt đầu (giờ Việt Nam)"), "2030-01-08T08:00");
    await change(field(timeOffs, "Kết thúc (giờ Việt Nam)"), "2030-01-08T09:00");
    await submit(timeOffs.querySelector("form")!);
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/time-offs", "POST")).toHaveLength(1);
    expect(JSON.parse(String(calls(fetcher, "/api/v1/doctors/doctor-1/time-offs", "POST")[0]![1]?.body)))
      .toMatchObject({ startAt: "2030-01-08T01:00:00.000Z", endAt: "2030-01-08T02:00:00.000Z" });
  });

  it("prevents duplicate submit and shows 409/502 mutation failures", async () => {
    let resolveSchedule!: (value: Response) => void;
    const pendingSchedule = new Promise<Response>((resolve) => { resolveSchedule = resolve; });
    const fetcher = gateway((path, method) => {
      if (path.endsWith("/schedules") && method === "POST") return pendingSchedule;
      if (path.endsWith("/time-offs") && method === "POST") return failure(502, "Appointment service không khả dụng");
      return undefined;
    });
    await render("DOCTOR", fetcher);
    await click(doctorButton("Bác sĩ An"));
    const schedules = section("Quản lý lịch làm việc");
    const scheduleForm = schedules.querySelector("form")!;
    await submit(scheduleForm);
    expect(button(schedules, "Lưu lịch").disabled).toBe(true);
    await submit(scheduleForm);
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/schedules", "POST")).toHaveLength(1);
    await act(async () => { resolveSchedule(failure(409, "Lịch làm việc bị trùng")); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Lịch làm việc bị trùng");
    expect(button(schedules, "Lưu lịch").disabled).toBe(false);

    const timeOffs = section("Thời gian nghỉ");
    await change(field(timeOffs, "Bắt đầu (giờ Việt Nam)"), "2030-01-08T08:00");
    await change(field(timeOffs, "Kết thúc (giờ Việt Nam)"), "2030-01-08T09:00");
    await submit(timeOffs.querySelector("form")!);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Appointment service không khả dụng");
    expect(calls(fetcher, "/api/v1/doctors/doctor-1/time-offs", "POST")).toHaveLength(1);
  });

  it("shows a 503 load error and retries the directory", async () => {
    let finishFirstLoad!: (value: Response) => void;
    const firstLoad = new Promise<Response>((resolve) => { finishFirstLoad = resolve; });
    let attempts = 0;
    const fetcher = gateway((path, method) => {
      if (path === "/api/v1/specialties" && method === "GET" && attempts++ === 0)
        return firstLoad;
      return undefined;
    });
    await render("STAFF", fetcher);
    expect(host.textContent).toContain("Đang tải bác sĩ...");
    await act(async () => { finishFirstLoad(failure(503, "Doctor service tạm thời không khả dụng")); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Doctor service tạm thời không khả dụng");
    await click(button(host, "Tải lại dữ liệu"));
    expect(calls(fetcher, "/api/v1/specialties", "GET")).toHaveLength(2);
    expect(host.textContent).toContain("Bác sĩ An");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
