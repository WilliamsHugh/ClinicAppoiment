import type { ApiClient } from "../../lib/api/client";

export type Page<T> = { items: T[]; page: number; limit: number; total: number };
export type Specialty = { id: string; name: string; description: string | null; isActive: boolean };
export type Doctor = { id: string; userId: string; specialtyId: string; displayName: string; bio: string | null; isActive: boolean };
export type Schedule = { id: string; doctorId: string; weekday: number; startTime: string; endTime: string;
  slotDurationMinutes: number; isActive: boolean };
export type TimeOff = { id: string; doctorId: string; startAt: string; endAt: string; reason: string | null };
export type Slot = { startAt: string; endAt: string };
export type UserAccount = { id: string; fullName: string; role: string; status: string };

export const doctorApi = (client: ApiClient) => ({
  specialties: (query: { page?: number; limit?: number; q?: string; isActive?: boolean } = {}) =>
    client.get<Page<Specialty>>("/api/v1/specialties", { query }),
  doctors: (query: { page?: number; limit?: number; specialtyId?: string; q?: string; isActive?: boolean } = {}) =>
    client.get<Page<Doctor>>("/api/v1/doctors", { query }),
  doctor: (id: string) => client.get<Doctor>(`/api/v1/doctors/${id}`),
  schedules: (id: string) => client.get<Page<Schedule>>(`/api/v1/doctors/${id}/schedules`),
  timeOffs: (id: string) => client.get<Page<TimeOff>>(`/api/v1/doctors/${id}/time-offs`),
  slots: (id: string, date: string) => client.get<Slot[]>(`/api/v1/doctors/${id}/available-slots`, { query: { date } }),
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
});
