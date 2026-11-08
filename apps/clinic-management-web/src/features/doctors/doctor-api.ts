import { ApiClientError, type ApiClient } from "../../lib/api/client";

export type Page<T> = { items: T[]; page: number; limit: number; total: number };
export type Specialty = { id: string; name: string; description: string | null; isActive: boolean };
export type Doctor = { id: string; userId: string; specialtyId: string; displayName: string; bio: string | null; isActive: boolean };
export type Schedule = { id: string; doctorId: string; weekday: number; startTime: string; endTime: string;
  slotDurationMinutes: number; isActive: boolean };
export type TimeOff = { id: string; doctorId: string; startAt: string; endAt: string; reason: string | null };
export type Slot = { startAt: string; endAt: string };
export type UserAccount = { id: string; fullName: string; role: string; status: string };

export const doctorApi = (client: ApiClient) => {
  const routes = {
    specialties: (query: { page?: number; limit?: number; q?: string; isActive?: boolean } = {}) =>
      client.get<Page<Specialty>>("/api/v1/specialties", { query }),
    doctors: (query: { page?: number; limit?: number; specialtyId?: string; q?: string; isActive?: boolean } = {}) =>
      client.get<Page<Doctor>>("/api/v1/doctors", { query }),
    doctor: (id: string, signal?: AbortSignal) => client.get<Doctor>(`/api/v1/doctors/${encodeURIComponent(id)}`, { signal }),
    schedules: (id: string, page = 1, signal?: AbortSignal) => client.get<Page<Schedule>>(`/api/v1/doctors/${encodeURIComponent(id)}/schedules`, { query: { page, limit: 100 }, signal }),
    timeOffs: (id: string, signal?: AbortSignal) => client.get<Page<TimeOff>>(`/api/v1/doctors/${encodeURIComponent(id)}/time-offs`, { signal }),
    slots: (id: string, date: string, signal?: AbortSignal) => client.get<Slot[]>(`/api/v1/doctors/${encodeURIComponent(id)}/available-slots`, { query: { date }, signal }),
    doctorAccounts: () => client.get<Page<UserAccount>>("/api/v1/users", { query: { role: "DOCTOR", status: "ACTIVE", limit: 100 } }),
    createSpecialty: (body: { name: string; description?: string }) => client.post<Specialty>("/api/v1/specialties", { body }),
    updateSpecialty: (id: string, body: Partial<Specialty>) => client.patch<Specialty>(`/api/v1/specialties/${id}`, { body }),
    createDoctor: (body: { userId: string; specialtyId: string; displayName: string; bio?: string }) => client.post<Doctor>("/api/v1/doctors", { body }),
    updateDoctor: (id: string, body: Partial<Doctor>) => client.patch<Doctor>(`/api/v1/doctors/${id}`, { body }),
    createSchedule: (doctorId: string, body: { weekday: number; startTime: string; endTime: string; slotDurationMinutes: number }) =>
      client.post<Schedule>(`/api/v1/doctors/${doctorId}/schedules`, { body }),
    updateSchedule: (id: string, body: Partial<Schedule>) => client.patch<Schedule>(`/api/v1/schedules/${id}`, { body }),
    createTimeOff: (doctorId: string, body: { startAt: string; endAt: string; reason?: string }) =>
      client.post<TimeOff>(`/api/v1/doctors/${doctorId}/time-offs`, { body }),
    updateTimeOff: (doctorId: string, timeOffId: string, body: Partial<TimeOff>) =>
      client.patch<TimeOff>(`/api/v1/doctors/${doctorId}/time-offs/${timeOffId}`, { body })
  };
  return {
    ...routes,
    async allSchedules(id: string, signal?: AbortSignal): Promise<Schedule[]> {
      const result = new Map<string, Schedule>();
      for (let page = 1; page <= 100; page++) {
        const { data } = await routes.schedules(id, page, signal);
        if (!data || !Array.isArray(data.items) || data.page !== page ||
            !Number.isInteger(data.limit) || data.limit < 1 || data.limit > 100 ||
            !Number.isInteger(data.total) || data.total < 0 || data.items.length > data.limit ||
            (data.items.length === 0 && (page - 1) * data.limit < data.total)) {
          throw new ApiClientError("Không thể đọc đầy đủ lịch làm việc. Vui lòng tải lại.", 0, "INVALID_RESPONSE");
        }
        for (const item of data.items) {
          if (!validSchedule(item, id)) {
            throw new ApiClientError("Lịch làm việc trả về không hợp lệ. Vui lòng tải lại.", 0, "INVALID_RESPONSE");
          }
          result.set(item.id, item);
        }
        if (page * data.limit >= data.total) return [...result.values()];
      }
      throw new ApiClientError("Có quá nhiều ca làm việc để hiển thị. Vui lòng kiểm tra lại.", 0, "INVALID_RESPONSE");
    },
    async setDoctorActivity(id: string, isActive: boolean): Promise<Doctor> {
      const { data } = await routes.updateDoctor(id, { isActive });
      if (!data || data.id !== id || data.isActive !== isActive ||
          typeof data.displayName !== "string" || !data.displayName.trim() ||
          typeof data.userId !== "string" || !data.userId ||
          typeof data.specialtyId !== "string" || !data.specialtyId) {
        throw new ApiClientError("Chưa nhận được xác nhận trạng thái. Hãy tải lại dữ liệu trước khi thao tác tiếp.", 0, "INVALID_RESPONSE");
      }
      return data;
    },
  };
};

function validSchedule(item: Schedule, doctorId: string): boolean {
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  return !!item && typeof item.id === "string" && !!item.id && item.doctorId === doctorId &&
    Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6 &&
    typeof item.startTime === "string" && clock.test(item.startTime) &&
    typeof item.endTime === "string" && clock.test(item.endTime) && item.endTime > item.startTime &&
    Number.isInteger(item.slotDurationMinutes) && item.slotDurationMinutes >= 5 && item.slotDurationMinutes <= 240 &&
    typeof item.isActive === "boolean";
}

export function doctorActivityError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.code === "SESSION_REQUIRED") return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Chỉ quản trị viên được đổi trạng thái hoạt động bác sĩ.";
    if (error.status === 404) return "Không tìm thấy hồ sơ bác sĩ. Vui lòng tải lại dữ liệu.";
    if (error.code === "SCHEDULE_CONFLICT_WITH_APPOINTMENTS") return "Bác sĩ còn lịch hẹn tương lai nên chưa thể ngừng hoạt động. Hãy xử lý các lịch hẹn trước.";
    if (error.status === 409) return "Dữ liệu bác sĩ đã thay đổi. Vui lòng tải lại trước khi thử lại.";
    if (error.code === "INVALID_RESPONSE") return "Chưa nhận được xác nhận trạng thái. Hãy tải lại dữ liệu trước khi thao tác tiếp.";
  }
  return "Chưa xác nhận được thay đổi trạng thái. Hãy tải lại dữ liệu để kiểm tra trước khi thử lại.";
}

export function doctorReadError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.code === "SESSION_REQUIRED") return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền xem thông tin bác sĩ này.";
    if (error.status === 404) return "Hồ sơ bác sĩ không còn khả dụng. Vui lòng tải lại danh sách.";
    if (error.code === "INVALID_RESPONSE") return "Dữ liệu lịch làm việc chưa đầy đủ hoặc không hợp lệ. Vui lòng tải lại.";
  }
  return "Chưa tải được thông tin bác sĩ hoặc lịch làm việc. Vui lòng thử lại.";
}
