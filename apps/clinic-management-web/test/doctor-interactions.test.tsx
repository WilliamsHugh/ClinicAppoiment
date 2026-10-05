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

type Override = (path: string, method: string) => Response | Promise<Response> | undefined;

function gateway(override?: Override) {
  return vi.fn<typeof fetch>(async (input, options) => {
    const path = new URL(String(input)).pathname;
    const method = options?.method ?? "GET";
    const custom = override?.(path, method);
    if (custom) return custom;
    if (method !== "GET") return envelope({ id: "saved" });
    if (path === "/api/v1/specialties") return envelope(page([specialty]));
    if (path === "/api/v1/doctors") return envelope(page([ownDoctor, otherDoctor]));
    if (path === "/api/v1/users") return envelope(page([
      { id: "user-3", fullName: "Bác sĩ mới", role: "DOCTOR", status: "ACTIVE" },
    ]));
    if (path === "/api/v1/doctors/doctor-1") return envelope(ownDoctor);
    if (path === "/api/v1/doctors/doctor-2") return envelope(otherDoctor);
    if (path.endsWith("/schedules")) return envelope(page([schedule]));
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
