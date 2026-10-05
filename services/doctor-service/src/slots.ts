import { clinicUtcOffsetMinutes, type DoctorSchedule, type DoctorTimeOff, type Slot } from "./models.js";

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

export function parseLocalDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return utc;
}

export function localDateOf(instant: string): string {
  return new Date(Date.parse(instant) + clinicUtcOffsetMinutes * minuteMs).toISOString().slice(0, 10);
}

export function parseClock(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function overlaps(first: Slot, second: Slot): boolean {
  return Date.parse(first.startAt) < Date.parse(second.endAt) && Date.parse(second.startAt) < Date.parse(first.endAt);
}

export function candidateSlots(
  localDate: string,
  schedules: DoctorSchedule[],
  timeOffs: DoctorTimeOff[],
  now = new Date()
): Slot[] {
  const localMidnight = parseLocalDate(localDate);
  if (localMidnight === null) return [];
  const weekday = new Date(localMidnight).getUTCDay();
  const utcMidnight = localMidnight - clinicUtcOffsetMinutes * minuteMs;
  const slots: Slot[] = [];

  for (const schedule of schedules) {
    if (!schedule.isActive || schedule.weekday !== weekday) continue;
    const start = parseClock(schedule.startTime);
    const end = parseClock(schedule.endTime);
    if (start === null || end === null || start >= end || schedule.slotDurationMinutes <= 0) continue;

    for (let minute = start; minute + schedule.slotDurationMinutes <= end; minute += schedule.slotDurationMinutes) {
      const slot: Slot = {
        startAt: new Date(utcMidnight + minute * minuteMs).toISOString(),
        endAt: new Date(utcMidnight + (minute + schedule.slotDurationMinutes) * minuteMs).toISOString()
      };
      if (Date.parse(slot.startAt) <= now.getTime()) continue;
      if (timeOffs.some((timeOff) => overlaps(slot, timeOff))) continue;
      slots.push(slot);
    }
  }

  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function validExactSlot(
  startAt: string,
  endAt: string,
  schedules: DoctorSchedule[],
  timeOffs: DoctorTimeOff[],
  now = new Date()
): boolean {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > dayMs) return false;
  const localDate = localDateOf(startAt);
  return candidateSlots(localDate, schedules, timeOffs, now)
    .some((slot) => slot.startAt === new Date(start).toISOString() && slot.endAt === new Date(end).toISOString());
}
