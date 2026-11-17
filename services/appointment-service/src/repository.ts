import type { AppointmentStatus } from "@clinic/shared-types";
import { randomUUID } from "crypto";
import { ConcurrentChangeError, IdempotencyMismatchError, InvalidTransitionError, RescheduleStateError, SlotConflictError, type BookingFingerprint, type BookingInput, type AppointmentFilters } from "./postgres-repository.js";
import { canReschedule, canTransition } from "./state-machine.js";

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
  private readonly completions = new Map<string, { recordId: string; doctorUserId: string }>();

  clear() {
    this.appointments.length = 0;
    this.history.length = 0;
    this.requests.clear();
    this.completions.clear();
  }

  findAll(filters: AppointmentFilters) {
    return this.appointments.filter((appointment) => {
      if (filters.patientId && appointment.patientId !== filters.patientId) return false;
      if (filters.doctorId && appointment.doctorId !== filters.doctorId) return false;
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        if (!statuses.includes(appointment.status)) return false;
      }
      return true;
    });
  }

  list(filters: AppointmentFilters, page: number, limit: number) {
    let matches = this.findAll(filters).filter((item) =>
      (!filters.from || Date.parse(item.scheduledStartAt) >= Date.parse(filters.from)) &&
      (!filters.to || Date.parse(item.scheduledStartAt) < Date.parse(filters.to)));

    if (filters.q) {
      const qLower = filters.q.toLowerCase();
      matches = matches.filter((item) => {
        if (filters.allowedReasonSearch && item.reason && item.reason.toLowerCase().includes(qLower)) {
          return true;
        }
        if (filters.matchedPatientIds && filters.matchedPatientIds.includes(item.patientId)) {
          return true;
        }
        if (filters.matchedDoctorIds && filters.matchedDoctorIds.includes(item.doctorId)) {
          return true;
        }
        return false;
      });
    }

    const sort = filters.sort ?? "scheduledStartAt:asc";
    matches.sort((a, b) => {
      if (sort === "created_at" || sort === "createdAt:asc") {
        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id);
      }
      if (sort === "created_at:desc" || sort === "createdAt:desc") {
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id);
      }
      if (sort === "scheduled_at:desc" || sort === "scheduledStartAt:desc") {
        return b.scheduledStartAt.localeCompare(a.scheduledStartAt) || b.id.localeCompare(a.id);
      }
      return a.scheduledStartAt.localeCompare(b.scheduledStartAt) || a.id.localeCompare(b.id);
    });

    return { items: matches.slice((page - 1) * limit, page * limit), page, limit, total: matches.length };
  }

  summary(filters: AppointmentFilters, from: string, to: string) {
    const matches = this.findAll(filters).filter((item) =>
      Date.parse(item.scheduledStartAt) >= Date.parse(from) &&
      Date.parse(item.scheduledStartAt) < Date.parse(to));

    const countsByStatus: Record<AppointmentStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      CHECKED_IN: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0
    };
    for (const item of matches) {
      if (item.status in countsByStatus) {
        countsByStatus[item.status]++;
      }
    }

    const dailyMap = new Map<string, number>();
    const startMs = Date.parse(from);
    const endMs = Date.parse(to) - 1;
    const toLocalDate = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

    let currentMs = startMs;
    const endDateStr = toLocalDate(Math.max(startMs, endMs));
    while (true) {
      const dStr = toLocalDate(currentMs);
      dailyMap.set(dStr, 0);
      if (dStr >= endDateStr) break;
      currentMs += 24 * 3600_000;
    }

    for (const item of matches) {
      const dStr = toLocalDate(Date.parse(item.scheduledStartAt));
      if (dailyMap.has(dStr)) {
        dailyMap.set(dStr, (dailyMap.get(dStr) ?? 0) + 1);
      } else {
        dailyMap.set(dStr, 1);
      }
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));

    return {
      from,
      to,
      timezone: "Asia/Ho_Chi_Minh",
      total: matches.length,
      countsByStatus,
      daily
    };
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

  findReplay(actorId: string, operationOrKey: string, keyOrFingerprint: string | unknown, fingerprint?: unknown): Appointment | null {
    const operation = fingerprint !== undefined ? operationOrKey : "CREATE";
    const key = fingerprint !== undefined ? (keyOrFingerprint as string) : operationOrKey;
    const fp = fingerprint !== undefined ? fingerprint : keyOrFingerprint;
    const value = this.requests.get(`${actorId}\u0000${operation}\u0000${key}`);
    if (!value) return null;
    if (value.fingerprint !== JSON.stringify(fp)) throw new IdempotencyMismatchError();
    return this.findById(value.id) ?? null;
  }

  createBooking(input: BookingInput, key: string, fingerprint: BookingFingerprint) {
    const replay = this.findReplay(input.createdBy, "CREATE", key, fingerprint);
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

  rescheduleBooking(id: string, start: string, end: string, actorId: string, reason?: string, key?: string, fingerprint?: unknown) {
    if (key && fingerprint) {
      const replay = this.findReplay(actorId, "RESCHEDULE", key, fingerprint);
      if (replay) return { appointment: replay, replayed: true, eventId: null };
    }
    const item = this.findById(id);
    if (!item) return null;
    if (!canReschedule(item.status)) throw new RescheduleStateError();
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
    if (key && fingerprint) {
      this.requests.set(`${actorId}\u0000RESCHEDULE\u0000${key}`,
        { fingerprint: JSON.stringify(fingerprint), id: item.id });
    }
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
    expectedStatus?: AppointmentStatus, key?: string, fingerprint?: unknown, operationName?: string) {
    const op = operationName ?? toStatus;
    if (key && fingerprint) {
      const replay = this.findReplay(changedBy, op, key, fingerprint);
      if (replay) return replay;
    }
    const appointment = this.findById(id);
    if (!appointment) return null;
    if (expectedStatus && appointment.status !== expectedStatus) throw new ConcurrentChangeError();
    if (!canTransition(appointment.status, toStatus)) throw new InvalidTransitionError();
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
    if (key && fingerprint) {
      this.requests.set(`${changedBy}\u0000${op}\u0000${key}`,
        { fingerprint: JSON.stringify(fingerprint), id: appointment.id });
    }
    return appointment;
  }

  findCompletion(id: string) { return this.completions.get(id) ?? null; }

  completeFromRecord(id: string, recordId: string, doctorUserId: string) {
    const item = this.findById(id);
    if (!item) return null;
    const prior = this.findCompletion(id);
    if (item.status === "COMPLETED" && prior?.recordId === recordId)
      return { appointment: item, replayed: true };
    if (item.status !== "CHECKED_IN" || prior ||
      [...this.completions.values()].some((value) => value.recordId === recordId))
      throw new InvalidTransitionError();
    this.completions.set(id, { recordId, doctorUserId });
    item.status = "COMPLETED";
    item.updatedBy = doctorUserId;
    item.updatedAt = new Date().toISOString();
    this.history.push({ id: randomUUID(), appointmentId: id, fromStatus: "CHECKED_IN",
      toStatus: "COMPLETED", changedBy: doctorUserId, createdAt: new Date().toISOString() });
    return { appointment: item, replayed: false };
  }
}
