import type { AppointmentStatus } from "@clinic/shared-types";
import type { ApiClient } from "../../lib/api/client";
import type { Doctor, Specialty } from "../doctors/doctor-api";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  specialtyId?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  reason?: string;
  status: AppointmentStatus;
  idempotencyKey?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface AppointmentQuery {
  page?: number;
  limit?: number;
  status?: AppointmentStatus;
  from?: string;
  to?: string;
  patientId?: string;
  doctorId?: string;
}

export interface PatientProfile {
  id: string;
  userId: string;
  fullName?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
}

export const appointmentApi = (client: ApiClient) => ({
  list: (query: AppointmentQuery = {}) =>
    client.get<Page<Appointment>>("/api/v1/appointments", {
      query: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        status: query.status,
        from: query.from,
        to: query.to,
        patientId: query.patientId,
        doctorId: query.doctorId,
      },
    }),

  get: (id: string) => client.get<Appointment>(`/api/v1/appointments/${id}`),

  confirm: (id: string, reason?: string) =>
    client.patch<Appointment>(`/api/v1/appointments/${id}/confirm`, {
      body: reason ? { reason } : {},
    }),

  cancel: (id: string, reason?: string) =>
    client.patch<Appointment>(`/api/v1/appointments/${id}/cancel`, {
      body: reason ? { reason } : {},
    }),

  checkIn: (id: string, reason?: string) =>
    client.patch<Appointment>(`/api/v1/appointments/${id}/check-in`, {
      body: reason ? { reason } : {},
    }),

  noShow: (id: string, reason?: string) =>
    client.patch<Appointment>(`/api/v1/appointments/${id}/no-show`, {
      body: reason ? { reason } : {},
    }),

  getPatient: (patientId: string, appointmentId?: string) =>
    client.get<PatientProfile>(`/api/v1/patients/${patientId}`, {
      query: appointmentId ? { appointmentId } : undefined,
    }),

  doctors: () =>
    client.get<Page<Doctor>>("/api/v1/doctors", {
      query: { limit: 100 },
    }),

  specialties: () =>
    client.get<Page<Specialty>>("/api/v1/specialties", {
      query: { limit: 100 },
    }),
});
