export type Specialty = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Doctor = {
  id: string;
  userId: string;
  specialtyId: string;
  displayName: string;
  bio: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorSchedule = {
  id: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorTimeOff = {
  id: string;
  doctorId: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  createdAt: string;
};

export type Slot = { startAt: string; endAt: string };
export type Pagination = { page: number; limit: number };
export type Page<T> = Pagination & { items: T[]; total: number };

export const clinicUtcOffsetMinutes = 7 * 60;
