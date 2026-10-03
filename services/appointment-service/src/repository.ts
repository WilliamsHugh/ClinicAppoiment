import type { AppointmentStatus } from "@clinic/shared-types";
import { randomUUID } from "crypto";
import { ConcurrentChangeError, IdempotencyMismatchError, RescheduleStateError, SlotConflictError, type BookingFingerprint, type BookingInput, type AppointmentFilters } from "./postgres-repository.js";

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
  createdAt?: string;
  updatedAt?: string;
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
  private readonly requests = new Map<string, { fingerprint: string; id: string }>();

  clear() {
    this.appointments.length = 0;
    this.history.length = 0;
    this.requests.clear();
  }

  findAll(filters: { patientId?: string; doctorId?: string; status?: AppointmentStatus }) {
    return this.appointments.filter((appointment) => {
      if (filters.patientId && appointment.patientId !== filters.patientId) return false;
      if (filters.doctorId && appointment.doctorId !== filters.doctorId) return false;
      if (filters.status && appointment.status !== filters.status) return false;
      return true;
    });
  }

  list(filters: AppointmentFilters, page: number, limit: number) {
    const matches = this.findAll(filters).filter((item) =>
      (!filters.from || Date.parse(item.scheduledStartAt) >= Date.parse(filters.from)) &&
      (!filters.to || Date.parse(item.scheduledStartAt) < Date.parse(filters.to)));
    matches.sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt) || a.id.localeCompare(b.id));
    return { items: matches.slice((page - 1) * limit, page * limit), page, limit, total: matches.length };
  }

  occupiedSlots(doctorId: string, from: string, to?: string) {
    const lowerBound = Math.max(Date.parse(from), Date.now());
    const upperBound = to ? Date.parse(to) : Infinity;
    return this.appointments
      .filter((appointment) => appointment.doctorId === doctorId
        && activeSlotStatuses.includes(appointment.status)
        && Date.parse(appointment.scheduledEndAt) > lowerBound
        && Date.parse(appointment.scheduledStartAt) < upperBound)
      .map((appointment) => ({
        startAt: new Date(appointment.scheduledStartAt).toISOString(),
        endAt: new Date(appointment.scheduledEndAt).toISOString()
      }));
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

  findReplay(actorId: string, key: string, fingerprint: BookingFingerprint) {
    const value = this.requests.get(`${actorId}\u0000CREATE\u0000${key}`);
    if (!value) return null;
    if (value.fingerprint !== JSON.stringify(fingerprint)) throw new IdempotencyMismatchError();
    return this.findById(value.id) ?? null;
  }

  createBooking(input: BookingInput, key: string, fingerprint: BookingFingerprint) {
    const replay = this.findReplay(input.createdBy, key, fingerprint);
    if (replay) return { appointment: replay, replayed: true, eventId: null };
    if (this.overlaps(input.doctorId, input.scheduledStartAt, input.scheduledEndAt)) throw new SlotConflictError();
    const appointment = this.create({ ...input, specialtyId: input.specialtyId ?? undefined,
      reason: input.reason ?? undefined, idempotencyKey: key });
    this.requests.set(`${input.createdBy}\u0000CREATE\u0000${key}`,
      { fingerprint: JSON.stringify(fingerprint), id: appointment.id });
    return { appointment, replayed: false, eventId: randomUUID() };
  }

  private overlaps(doctorId: string, start: string, end: string, exceptId?: string) {
    return this.appointments.some((item) => item.id !== exceptId && item.doctorId === doctorId &&
      activeSlotStatuses.includes(item.status) && Date.parse(item.scheduledStartAt) < Date.parse(end) &&
      Date.parse(item.scheduledEndAt) > Date.parse(start));
  }

  rescheduleBooking(id: string, start: string, end: string, actorId: string, reason?: string) {
    const item = this.findById(id);
    if (!item) return null;
    if (!["PENDING", "CONFIRMED"].includes(item.status)) throw new RescheduleStateError();
    if (this.overlaps(item.doctorId, start, end, id)) throw new SlotConflictError();
    if (item.scheduledStartAt === start && item.scheduledEndAt === end && reason === undefined)
      return { appointment: item, eventId: null };
    item.scheduledStartAt = start;
    item.scheduledEndAt = end;
    if (reason !== undefined) item.reason = reason;
    item.updatedBy = actorId;
    item.updatedAt = new Date().toISOString();
    this.history.push({ id: randomUUID(), appointmentId: id, fromStatus: item.status,
      toStatus: item.status, changedBy: actorId, reason, createdAt: new Date().toISOString() });
    return { appointment: item, eventId: randomUUID() };
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

  transition(id: string, toStatus: AppointmentStatus, changedBy: string, reason?: string,
    expectedStatus?: AppointmentStatus) {
    const appointment = this.findById(id);
    if (!appointment) return null;
    if (expectedStatus && appointment.status !== expectedStatus) throw new ConcurrentChangeError();
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
