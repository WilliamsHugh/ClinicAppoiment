import { randomUUID } from "crypto";

export type Specialty = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
};

export type Doctor = {
  id: string;
  userId: string;
  specialtyId: string;
  displayName: string;
  bio?: string;
  isActive: boolean;
};

export type DoctorSchedule = {
  id: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
};

export type DoctorTimeOff = {
  id: string;
  doctorId: string;
  startAt: string;
  endAt: string;
  reason?: string;
};

export class DoctorRepository {
  private readonly specialties: Specialty[] = [
    { id: "specialty-general", name: "Kham tong quat", description: "Kham suc khoe tong quat", isActive: true },
    { id: "specialty-cardio", name: "Tim mach", description: "Kham va tu van tim mach", isActive: true }
  ];

  private readonly doctors: Doctor[] = [
    {
      id: "doctor-1",
      userId: "user-doctor-1",
      specialtyId: "specialty-general",
      displayName: "Dr. Tran Thi B",
      bio: "Bac si noi tong quat",
      isActive: true
    }
  ];

  private readonly schedules: DoctorSchedule[] = [
    {
      id: "schedule-1",
      doctorId: "doctor-1",
      weekday: 1,
      startTime: "08:00",
      endTime: "11:00",
      slotDurationMinutes: 30,
      isActive: true
    }
  ];

  private readonly timeOffs: DoctorTimeOff[] = [];

  findSpecialties() {
    return this.specialties;
  }

  createSpecialty(input: Omit<Specialty, "id" | "isActive">) {
    const specialty = { id: randomUUID(), ...input, isActive: true };
    this.specialties.push(specialty);
    return specialty;
  }

  updateSpecialty(id: string, input: Partial<Specialty>) {
    const specialty = this.specialties.find((item) => item.id === id);
    if (!specialty) return null;
    Object.assign(specialty, input);
    return specialty;
  }

  findDoctors() {
    return this.doctors;
  }

  findDoctorById(id: string) {
    return this.doctors.find((doctor) => doctor.id === id);
  }

  findDoctorByUserId(userId: string) {
    return this.doctors.find((doctor) => doctor.userId === userId);
  }

  createDoctor(input: Omit<Doctor, "id" | "isActive">) {
    const doctor = { id: randomUUID(), ...input, isActive: true };
    this.doctors.push(doctor);
    return doctor;
  }

  updateDoctor(id: string, input: Partial<Doctor>) {
    const doctor = this.findDoctorById(id);
    if (!doctor) return null;
    Object.assign(doctor, input);
    return doctor;
  }

  findSchedulesByDoctor(doctorId: string) {
    return this.schedules.filter((schedule) => schedule.doctorId === doctorId);
  }

  createSchedule(input: Omit<DoctorSchedule, "id" | "isActive">) {
    const schedule = { id: randomUUID(), ...input, isActive: true };
    this.schedules.push(schedule);
    return schedule;
  }

  updateSchedule(id: string, input: Partial<DoctorSchedule>) {
    const schedule = this.schedules.find((item) => item.id === id);
    if (!schedule) return null;
    Object.assign(schedule, input);
    return schedule;
  }

  getAvailableSlots(doctorId: string, date: string) {
    const doctor = this.findDoctorById(doctorId);
    if (!doctor?.isActive) return [];

    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const schedule = this.schedules.find((item) => item.doctorId === doctorId && item.weekday === day && item.isActive);
    if (!schedule) return [];

    const slots: Array<{ startAt: string; endAt: string }> = [];
    const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
    const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
    const cursor = new Date(`${date}T${schedule.startTime}:00.000Z`);
    cursor.setUTCHours(startHour, startMinute, 0, 0);
    const end = new Date(`${date}T${schedule.endTime}:00.000Z`);
    end.setUTCHours(endHour, endMinute, 0, 0);

    while (cursor < end) {
      const startAt = cursor.toISOString();
      cursor.setUTCMinutes(cursor.getUTCMinutes() + schedule.slotDurationMinutes);
      if (cursor <= end) {
        slots.push({ startAt, endAt: cursor.toISOString() });
      }
    }

    return slots.filter((slot) => {
      return !this.timeOffs.some((timeOff) => {
        return timeOff.doctorId === doctorId && slot.startAt < timeOff.endAt && slot.endAt > timeOff.startAt;
      });
    });
  }

  verifySlot(doctorId: string, startAt: string, endAt: string) {
    const doctor = this.findDoctorById(doctorId);
    if (!doctor?.isActive) {
      return { valid: false, reason: "DOCTOR_NOT_AVAILABLE" };
    }

    const date = startAt.slice(0, 10);
    const slots = this.getAvailableSlots(doctorId, date);
    const valid = slots.some((slot) => slot.startAt === startAt && slot.endAt === endAt);
    return { valid, reason: valid ? undefined : "SLOT_OUTSIDE_SCHEDULE" };
  }
}
