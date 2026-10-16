import { ApiClientError, type ApiClient, type PaginatedData } from "../../lib/api/client";
import type { ClinicRole } from "../../lib/session/session";

export const statusLabels = {
  PENDING: "Chờ xác nhận", CONFIRMED: "Đã xác nhận", CHECKED_IN: "Đã check-in",
  COMPLETED: "Hoàn thành", CANCELLED: "Đã hủy", NO_SHOW: "Không đến",
} as const;
export type AppointmentStatus = keyof typeof statusLabels;
export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: AppointmentStatus;
  reason?: string | null;
}
export interface QueueAppointment extends Appointment {
  patientName: string;
  doctorName: string;
  identityUnavailable: boolean;
}
export interface Slot { startAt: string; endAt: string }
export type QueueAction = "confirm" | "check-in" | "no-show" | "cancel" | "reschedule";

const mutableStatuses = new Set<AppointmentStatus>(["PENDING", "CONFIRMED"]);
export function allowedActions(role: ClinicRole, status: AppointmentStatus): QueueAction[] {
  if (role !== "STAFF" && role !== "ADMIN") return [];
  return [
    ...(status === "PENDING" ? ["confirm" as const] : []),
    ...(status === "CONFIRMED" ? ["check-in" as const, "no-show" as const] : []),
    ...(mutableStatuses.has(status) ? ["reschedule" as const, "cancel" as const] : []),
  ];
}

export const clinicToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export function clinicDayRange(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("Ngày khám không hợp lệ.");
  }
  const start = new Date(`${date}T00:00:00+07:00`);
  return { from: start.toISOString(), to: new Date(start.getTime() + 86400_000).toISOString() };
}
export const clinicTime = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));

function invalidResponse(): never {
  throw new ApiClientError("Dữ liệu lịch hẹn chưa hợp lệ. Vui lòng tải lại.", 0, "INVALID_RESPONSE");
}
function parseAppointment(value: Appointment): Appointment {
  if (!value || typeof value.id !== "string" || !value.id ||
      typeof value.patientId !== "string" || typeof value.doctorId !== "string" ||
      typeof value.scheduledStartAt !== "string" || typeof value.scheduledEndAt !== "string" ||
      (value.reason != null && typeof value.reason !== "string") ||
      !Object.hasOwn(statusLabels, value.status) ||
      !Number.isFinite(Date.parse(value.scheduledStartAt)) ||
      Date.parse(value.scheduledEndAt) <= Date.parse(value.scheduledStartAt) ||
      !Number.isFinite(Date.parse(value.scheduledEndAt))) invalidResponse();
  return value;
}
const readableName = (value: unknown): string | undefined => typeof value === "string" && value.trim() &&
  !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value.trim()) ? value.trim() : undefined;

export function appointmentApi(client: ApiClient, role: ClinicRole) {
  // Scoped to the current ApiClient/session, never shared between authenticated actors.
  const patientNames = new Map<string, string>();
  const doctorNames = new Map<string, string>();

  async function listDay(date: string, signal?: AbortSignal): Promise<QueueAppointment[]> {
    const range = clinicDayRange(date);
    const appointments = new Map<string, Appointment>();
    for (let page = 1; ; page++) {
      const { data } = await client.get<PaginatedData<Appointment>>("/api/v1/appointments", {
        query: { ...range, page, limit: 100 }, signal,
      });
      if (!Array.isArray(data?.items) || !Number.isInteger(data.total) || data.total < 0 || data.page !== page || data.limit !== 100 || data.items.length > 100) invalidResponse();
      for (const item of data.items) {
        parseAppointment(item);
        if (Date.parse(item.scheduledStartAt) >= Date.parse(range.from) && Date.parse(item.scheduledStartAt) < Date.parse(range.to)) {
          appointments.set(item.id, item);
        }
      }
      if (page * 100 >= data.total) break;
      // Refuse incomplete or unbounded responses instead of silently showing partial counts.
      if (!data.items.length || page >= 100) invalidResponse();
    }
    const rows = [...appointments.values()].sort((a, b) =>
      Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt) || a.id.localeCompare(b.id));
    const result: QueueAppointment[] = [];
    const patientPending = new Map<string, Promise<string | undefined>>();
    const doctorPending = new Map<string, Promise<string | undefined>>();
    async function name(cache: Map<string, string>, pending: Map<string, Promise<string | undefined>>,
      key: string, path: string, field: string, appointmentId?: string): Promise<string | undefined> {
      if (cache.has(key)) return cache.get(key);
      if (!pending.has(key)) pending.set(key, (async () => {
        try {
          const { data } = await client.get<Record<string, unknown>>(path, { signal,
            query: appointmentId ? { appointmentId } : {} });
          const value = readableName(data[field]);
          if (value) cache.set(key, value);
          return value;
        } catch (error) {
          if (signal?.aborted || (error instanceof ApiClientError && error.status === 401)) throw error;
          return undefined;
        }
      })());
      return pending.get(key)!;
    }
    let next = 0;
    // Bound foreign lookups instead of creating hundreds of concurrent HTTP requests.
    await Promise.all(Array.from({ length: Math.min(6, rows.length) }, async () => {
      while (next < rows.length) {
        const index = next++;
        const item = rows[index];
        const patientKey = role === "DOCTOR" ? `${item.id}:${item.patientId}` : item.patientId;
        // Doctors must not request patient profiles for cancelled/no-show appointments.
        const patientAllowed = role !== "DOCTOR" || !["CANCELLED", "NO_SHOW"].includes(item.status);
        const patientName = patientAllowed ? await name(patientNames, patientPending, patientKey,
          `/api/v1/patients/${encodeURIComponent(item.patientId)}`, "fullName", role === "DOCTOR" ? item.id : undefined) : undefined;
        const doctorName = await name(doctorNames, doctorPending, item.doctorId,
          `/api/v1/doctors/${encodeURIComponent(item.doctorId)}`, "displayName");
        result[index] = { ...item, patientName: patientName ?? "Chưa có tên bệnh nhân",
          doctorName: doctorName ?? "Chưa có tên bác sĩ", identityUnavailable: !patientName || !doctorName };
      }
    }));
    return result;
  }

  return {
    listDay,
    async slots(doctorId: string, date: string, signal?: AbortSignal): Promise<Slot[]> {
      clinicDayRange(date);
      const { data } = await client.get<Slot[]>(`/api/v1/doctors/${encodeURIComponent(doctorId)}/available-slots`, {
        query: { date }, signal,
      });
      if (!Array.isArray(data) || data.some((slot) => !Number.isFinite(Date.parse(slot.startAt)) ||
          !Number.isFinite(Date.parse(slot.endAt)) || Date.parse(slot.endAt) <= Date.parse(slot.startAt))) invalidResponse();
      const { from, to } = clinicDayRange(date);
      return data.filter((slot) => Date.parse(slot.startAt) > Date.now() &&
        Date.parse(slot.startAt) >= Date.parse(from) && Date.parse(slot.startAt) < Date.parse(to))
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    },
    async mutate(item: Appointment, action: QueueAction, reason = "", slot?: Slot): Promise<Appointment> {
      if (!allowedActions(role, item.status).includes(action)) {
        throw new ApiClientError("Thao tác không được phép với lịch hẹn này.", 403, "ACCESS_DENIED");
      }
      if ((action === "cancel" || action === "reschedule") && !reason.trim()) {
        throw new ApiClientError("Vui lòng nhập lý do.", 400, "REASON_REQUIRED");
      }
      if (reason.trim().length > 500) throw new ApiClientError("Lý do tối đa 500 ký tự.", 400, "VALIDATION_ERROR");
      if (action === "reschedule" && (!slot || !Number.isFinite(Date.parse(slot.startAt)) ||
          Date.parse(slot.startAt) <= Date.now() || !Number.isFinite(Date.parse(slot.endAt)) ||
          Date.parse(slot.endAt) <= Date.parse(slot.startAt))) {
        throw new ApiClientError("Vui lòng chọn khung giờ mới còn trống.", 422, "APPOINTMENT_SLOT_INVALID");
      }
      const { data } = await client.patch<Appointment>(`/api/v1/appointments/${encodeURIComponent(item.id)}/${action}`, {
        body: { ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(action === "reschedule" && slot ? {
            scheduledStartAt: new Date(slot.startAt).toISOString(), scheduledEndAt: new Date(slot.endAt).toISOString(),
          } : {}) },
      });
      parseAppointment(data);
      if (data.id !== item.id) invalidResponse();
      return data;
    },
  };
}
export type AppointmentApi = ReturnType<typeof appointmentApi>;

export function queueError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "Không thể tải dữ liệu. Vui lòng thử lại.";
  if (error.status === 401 || error.code === "SESSION_REQUIRED") return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (error.code === "APPOINTMENT_INVALID_STATUS_TRANSITION") return "Lịch hẹn đã đổi trạng thái. Hãy đóng hộp thoại và tải lại bảng.";
  if (["APPOINTMENT_SLOT_UNAVAILABLE", "APPOINTMENT_SLOT_INVALID"].includes(error.code)) return "Khung giờ không còn khả dụng. Lý do được giữ lại; vui lòng chọn giờ khác.";
  if (error.code === "REQUEST_TIMEOUT") return "Chưa nhận được phản hồi. Hãy tải lại bảng để kiểm tra kết quả trước khi thử lại.";
  if (error.code === "NETWORK_ERROR") return "Không thể kết nối. Hãy kiểm tra mạng và tải lại dữ liệu.";
  if (error.code === "REASON_REQUIRED") return "Vui lòng nhập lý do.";
  if (error.status === 404) return "Lịch hẹn không còn tồn tại. Vui lòng tải lại bảng.";
  return "Không thể hoàn thành yêu cầu. Vui lòng thử lại.";
}
