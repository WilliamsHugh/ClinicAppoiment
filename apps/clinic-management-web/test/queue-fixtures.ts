import { vi } from "vitest";
import type { Appointment } from "../src/features/appointments/appointment-api";

export const patientId = "00000000-0000-4000-8000-000000000001";
export const doctorId = "00000000-0000-4000-8000-000000000002";
export const pending: Appointment = {
  id: "00000000-0000-4000-8000-000000000010", patientId, doctorId,
  scheduledStartAt: "2030-01-07T01:00:00.000Z", scheduledEndAt: "2030-01-07T01:30:00.000Z",
  status: "PENDING", reason: "Khám tổng quát",
};
export const confirmed: Appointment = { ...pending, id: "00000000-0000-4000-8000-000000000011", status: "CONFIRMED" };
export const checkedIn: Appointment = { ...pending, id: "00000000-0000-4000-8000-000000000012", status: "CHECKED_IN" };
export const completed: Appointment = { ...pending, id: "00000000-0000-4000-8000-000000000013", status: "COMPLETED" };
export const cancelled: Appointment = { ...pending, id: "00000000-0000-4000-8000-000000000014", status: "CANCELLED" };
export const noShow: Appointment = { ...pending, id: "00000000-0000-4000-8000-000000000015", status: "NO_SHOW" };
export const slot = { startAt: "2030-01-07T03:00:00.000Z", endAt: "2030-01-07T03:30:00.000Z" };
export function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), { status,
    headers: { "Content-Type": "application/json" } });
}
export function failure(code: string, status = 409) {
  return new Response(JSON.stringify({ success: false, error: { code, message: "Internal detail must not be displayed" } }),
    { status, headers: { "Content-Type": "application/json" } });
}
export type Override = (url: URL, method: string, options?: RequestInit) => Response | Promise<Response> | undefined;
export function gateway(initial: Appointment[] = [pending, confirmed, checkedIn, completed, cancelled, noShow], override?: Override) {
  let items = initial.map((item) => ({ ...item }));
  return vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    const method = options?.method ?? "GET";
    const custom = override?.(url, method, options);
    if (custom) return custom;
    if (url.pathname === "/api/v1/appointments" && method === "GET") {
      const from = url.searchParams.get("from")!;
      const to = url.searchParams.get("to")!;
      const rows = items.filter((item) => Date.parse(item.scheduledStartAt) >= Date.parse(from) && Date.parse(item.scheduledStartAt) < Date.parse(to));
      const page = Number(url.searchParams.get("page") ?? 1);
      return envelope({ items: rows.slice((page - 1) * 100, page * 100), page, limit: 100, total: rows.length });
    }
    if (url.pathname === `/api/v1/patients/${patientId}`) return envelope({ id: patientId,
      fullName: "Nguyễn Văn An", insuranceNumber: "DN4011234567890" });
    if (url.pathname === `/api/v1/doctors/${doctorId}`) return envelope({ id: doctorId, displayName: "Bác sĩ Bình" });
    if (url.pathname.endsWith("/available-slots")) return envelope([slot]);
    if (method === "PATCH") {
      const [, , , , id, action] = url.pathname.split("/");
      const item = items.find((row) => row.id === id);
      if (!item) return failure("APPOINTMENT_NOT_FOUND", 404);
      const data = JSON.parse(String(options?.body ?? "{}"));
      const statuses: Record<string, Appointment["status"]> = { confirm: "CONFIRMED", "check-in": "CHECKED_IN", cancel: "CANCELLED", "no-show": "NO_SHOW" };
      const updated = { ...item, ...(action === "reschedule" ? {
        scheduledStartAt: data.scheduledStartAt, scheduledEndAt: data.scheduledEndAt,
      } : { status: statuses[action] }) };
      items = items.map((row) => row.id === id ? updated : row);
      return envelope(updated);
    }
    throw new Error(`Unexpected Gateway request: ${method} ${url.pathname}`);
  });
}
