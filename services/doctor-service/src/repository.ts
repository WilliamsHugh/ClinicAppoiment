import pg from "pg";
import type { PoolClient } from "pg";
import type { Doctor, DoctorSchedule, DoctorTimeOff, Page, Pagination, Specialty } from "./models.js";

type Row = Record<string, unknown>;
type Pool = InstanceType<typeof pg.Pool>;
const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();

function specialty(row: Row): Specialty {
  return { id: String(row.id), name: String(row.name), description: row.description == null ? null : String(row.description),
    isActive: Boolean(row.is_active), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function doctor(row: Row): Doctor {
  return { id: String(row.id), userId: String(row.user_id), specialtyId: String(row.specialty_id),
    displayName: String(row.display_name), bio: row.bio == null ? null : String(row.bio),
    isActive: Boolean(row.is_active), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function schedule(row: Row): DoctorSchedule {
  return { id: String(row.id), doctorId: String(row.doctor_id), weekday: Number(row.weekday),
    startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5),
    slotDurationMinutes: Number(row.slot_duration_minutes), isActive: Boolean(row.is_active),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function timeOff(row: Row): DoctorTimeOff {
  return { id: String(row.id), doctorId: String(row.doctor_id), startAt: iso(row.start_at),
    endAt: iso(row.end_at), reason: row.reason == null ? null : String(row.reason), createdAt: iso(row.created_at) };
}

async function page<T>(pool: Pool, table: string, where: string, values: unknown[], order: string,
  pagination: Pagination, convert: (row: Row) => T): Promise<Page<T>> {
  const count = await pool.query(`SELECT count(*)::int AS total FROM ${table} WHERE ${where}`, values);
  const rows = await pool.query(
    `SELECT * FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pagination.limit, (pagination.page - 1) * pagination.limit]);
  return { items: rows.rows.map(convert), total: Number(count.rows[0].total), ...pagination };
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export class ScheduleOverlapError extends Error {}

export class DoctorRepository {
  constructor(private readonly pool: Pool) {}
  async health(): Promise<void> { await this.pool.query("SELECT 1"); }

  listSpecialties(filters: Pagination & { q?: string; isActive?: boolean }) {
    const values: unknown[] = [], conditions: string[] = [];
    if (filters.q) { values.push(`%${filters.q}%`); conditions.push(`name ILIKE $${values.length}`); }
    if (filters.isActive !== undefined) { values.push(filters.isActive); conditions.push(`is_active = $${values.length}`); }
    return page(this.pool, "doctor_service.specialties", conditions.join(" AND ") || "true", values,
      "name ASC, id ASC", filters, specialty);
  }
  async findSpecialty(id: string) {
    const result = await this.pool.query("SELECT * FROM doctor_service.specialties WHERE id = $1", [id]);
    return result.rows[0] ? specialty(result.rows[0]) : null;
  }
  async createSpecialty(input: { name: string; description?: string }) {
    const result = await this.pool.query(
      "INSERT INTO doctor_service.specialties (name, description) VALUES ($1, $2) RETURNING *",
      [input.name, input.description ?? null]);
    return specialty(result.rows[0]);
  }
  async updateSpecialty(id: string, input: { name?: string; description?: string | null; isActive?: boolean }) {
    const result = await this.pool.query(
      `UPDATE doctor_service.specialties SET name = COALESCE($2, name),
       description = CASE WHEN $3 THEN $4 ELSE description END,
       is_active = COALESCE($5, is_active), updated_at = now() WHERE id = $1 RETURNING *`,
      [id, input.name ?? null, input.description !== undefined, input.description ?? null, input.isActive ?? null]);
    return result.rows[0] ? specialty(result.rows[0]) : null;
  }

  listDoctors(filters: Pagination & { specialtyId?: string; q?: string; isActive?: boolean }) {
    const values: unknown[] = [], conditions: string[] = [];
    if (filters.specialtyId) { values.push(filters.specialtyId); conditions.push(`specialty_id = $${values.length}`); }
    if (filters.q) { values.push(`%${filters.q}%`); conditions.push(`display_name ILIKE $${values.length}`); }
    if (filters.isActive !== undefined) { values.push(filters.isActive); conditions.push(`is_active = $${values.length}`); }
    return page(this.pool, "doctor_service.doctors", conditions.join(" AND ") || "true", values,
      "display_name ASC, id ASC", filters, doctor);
  }
  async findDoctor(id: string) {
    const result = await this.pool.query("SELECT * FROM doctor_service.doctors WHERE id = $1", [id]);
    return result.rows[0] ? doctor(result.rows[0]) : null;
  }
  async findDoctorByUser(userId: string) {
    const result = await this.pool.query("SELECT * FROM doctor_service.doctors WHERE user_id = $1", [userId]);
    return result.rows[0] ? doctor(result.rows[0]) : null;
  }
  async createDoctor(input: { userId: string; specialtyId: string; displayName: string; bio?: string }) {
    const result = await this.pool.query(
      `INSERT INTO doctor_service.doctors (user_id, specialty_id, display_name, bio)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.userId, input.specialtyId, input.displayName, input.bio ?? null]);
    return doctor(result.rows[0]);
  }
  async updateDoctor(id: string, input: { specialtyId?: string; displayName?: string; bio?: string | null; isActive?: boolean }) {
    const result = await this.pool.query(
      `UPDATE doctor_service.doctors SET specialty_id = COALESCE($2, specialty_id),
       display_name = COALESCE($3, display_name), bio = CASE WHEN $4 THEN $5 ELSE bio END,
       is_active = COALESCE($6, is_active), updated_at = now() WHERE id = $1 RETURNING *`,
      [id, input.specialtyId ?? null, input.displayName ?? null, input.bio !== undefined, input.bio ?? null, input.isActive ?? null]);
    return result.rows[0] ? doctor(result.rows[0]) : null;
  }

  listSchedules(doctorId: string, pagination: Pagination) {
    return page(this.pool, "doctor_service.doctor_schedules", "doctor_id = $1", [doctorId],
      "weekday ASC, start_time ASC, id ASC", pagination, schedule);
  }
  async allSchedules(doctorId: string) {
    const result = await this.pool.query(
      "SELECT * FROM doctor_service.doctor_schedules WHERE doctor_id = $1 AND is_active = true", [doctorId]);
    return result.rows.map(schedule);
  }
  async findSchedule(id: string) {
    const result = await this.pool.query("SELECT * FROM doctor_service.doctor_schedules WHERE id = $1", [id]);
    return result.rows[0] ? schedule(result.rows[0]) : null;
  }
  async createSchedule(input: Omit<DoctorSchedule, "id" | "isActive" | "createdAt" | "updatedAt">) {
    return transaction(this.pool, async (client) => {
      const owner = await client.query("SELECT id FROM doctor_service.doctors WHERE id = $1 FOR UPDATE", [input.doctorId]);
      if (!owner.rows[0]) return null;
      const conflict = await client.query(
        `SELECT 1 FROM doctor_service.doctor_schedules WHERE doctor_id = $1 AND weekday = $2
         AND is_active = true AND start_time < $4 AND end_time > $3 LIMIT 1`,
        [input.doctorId, input.weekday, input.startTime, input.endTime]);
      if (conflict.rows[0]) throw new ScheduleOverlapError();
      const result = await client.query(
        `INSERT INTO doctor_service.doctor_schedules (doctor_id, weekday, start_time, end_time, slot_duration_minutes)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [input.doctorId, input.weekday, input.startTime, input.endTime, input.slotDurationMinutes]);
      return schedule(result.rows[0]);
    });
  }
  async updateSchedule(id: string, input: DoctorSchedule) {
    return transaction(this.pool, async (client) => {
      await client.query("SELECT id FROM doctor_service.doctors WHERE id = $1 FOR UPDATE", [input.doctorId]);
      const conflict = await client.query(
        `SELECT 1 FROM doctor_service.doctor_schedules WHERE id <> $1 AND doctor_id = $2
         AND weekday = $3 AND is_active = true AND $6 = true
         AND start_time < $5 AND end_time > $4 LIMIT 1`,
        [id, input.doctorId, input.weekday, input.startTime, input.endTime, input.isActive]);
      if (conflict.rows[0]) throw new ScheduleOverlapError();
      const result = await client.query(
        `UPDATE doctor_service.doctor_schedules SET weekday = $2, start_time = $3, end_time = $4,
         slot_duration_minutes = $5, is_active = $6, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, input.weekday, input.startTime, input.endTime, input.slotDurationMinutes, input.isActive]);
      return result.rows[0] ? schedule(result.rows[0]) : null;
    });
  }

  listTimeOffs(doctorId: string, pagination: Pagination) {
    return page(this.pool, "doctor_service.doctor_time_offs", "doctor_id = $1", [doctorId],
      "created_at DESC, id DESC", pagination, timeOff);
  }
  async allTimeOffs(doctorId: string, startAt: string, endAt: string) {
    const result = await this.pool.query(
      "SELECT * FROM doctor_service.doctor_time_offs WHERE doctor_id = $1 AND start_at < $3 AND end_at > $2",
      [doctorId, startAt, endAt]);
    return result.rows.map(timeOff);
  }
  async findTimeOff(id: string) {
    const result = await this.pool.query("SELECT * FROM doctor_service.doctor_time_offs WHERE id = $1", [id]);
    return result.rows[0] ? timeOff(result.rows[0]) : null;
  }
  async createTimeOff(input: { doctorId: string; startAt: string; endAt: string; reason?: string }) {
    const result = await this.pool.query(
      `INSERT INTO doctor_service.doctor_time_offs (doctor_id, start_at, end_at, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.doctorId, input.startAt, input.endAt, input.reason ?? null]);
    return timeOff(result.rows[0]);
  }
  async updateTimeOff(id: string, input: { startAt: string; endAt: string; reason: string | null }) {
    const result = await this.pool.query(
      `UPDATE doctor_service.doctor_time_offs SET start_at = $2, end_at = $3, reason = $4 WHERE id = $1 RETURNING *`,
      [id, input.startAt, input.endAt, input.reason]);
    return result.rows[0] ? timeOff(result.rows[0]) : null;
  }
}
