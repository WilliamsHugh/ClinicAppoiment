import type { AppointmentStatus } from "@clinic/shared-types";
import { randomUUID } from "crypto";

export type Appointment = {
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
};

export type StatusHistory = {
  id: string;
  appointmentId: string;
  fromStatus?: AppointmentStatus;
  toStatus: AppointmentStatus;
  changedBy: string;
  reason?: string;
  createdAt: string;
};

const activeSlotStatuses: AppointmentStatus[] = ["PENDING", "CONFIRMED", "CHECKED_IN"];

export class AppointmentRepository {
  private readonly appointments: Appointment[] = [];
  private readonly history: StatusHistory[] = [];

  findAll(filters: { patientId?: string; doctorId?: string }) {
    return this.appointments.filter((appointment) => {
      if (filters.patientId && appointment.patientId !== filters.patientId) return false;
      if (filters.doctorId && appointment.doctorId !== filters.doctorId) return false;
      return true;
    });
  }

  findById(id: string) {
    return this.appointments.find((appointment) => appointment.id === id);
  }

  findByIdempotencyKey(key?: string) {
    if (!key) return undefined;
    return this.appointments.find((appointment) => appointment.idempotencyKey === key);
  }

  hasActiveSlotConflict(doctorId: string, scheduledStartAt: string) {
    return this.appointments.some((appointment) => {
      return (
        appointment.doctorId === doctorId &&
        appointment.scheduledStartAt === scheduledStartAt &&
        activeSlotStatuses.includes(appointment.status)
      );
    });
  }

  create(input: Omit<Appointment, "id" | "status"> & { status?: AppointmentStatus }) {
    const appointment: Appointment = {
      id: randomUUID(),
      ...input,
      status: input.status ?? "PENDING"
    };
    this.appointments.push(appointment);
    this.history.push({
      id: randomUUID(),
      appointmentId: appointment.id,
      toStatus: appointment.status,
      changedBy: appointment.createdBy,
      createdAt: new Date().toISOString()
    });
    return appointment;
  }

  transition(id: string, toStatus: AppointmentStatus, changedBy: string, reason?: string) {
    const appointment = this.findById(id);
    if (!appointment) return null;
    const fromStatus = appointment.status;
    appointment.status = toStatus;
    appointment.updatedBy = changedBy;
    this.history.push({
      id: randomUUID(),
      appointmentId: id,
      fromStatus,
      toStatus,
      changedBy,
      reason,
      createdAt: new Date().toISOString()
    });
    return appointment;
  }
}
