import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import type { PoolClient } from "pg";
import type { AppointmentStatus } from "@clinic/shared-types";
import type { Appointment } from "./repository.js";
import { canReschedule, canTransition } from "./state-machine.js";

type Pool = InstanceType<typeof pg.Pool>;
type Row = Record<string, unknown>;
export type BookingFingerprint = {
  patientId: string; doctorId: string; specialtyId: string | null;
  scheduledStartAt: string; scheduledEndAt: string; reason: string | null;
};
export type BookingInput = BookingFingerprint & { createdBy: string };
export type AppointmentFilters = {
  patientId?: string; doctorId?: string; status?: AppointmentStatus;
  from?: string; to?: string;
};
export type OutboxEvent = { id: string; eventType: string; aggregateId: string;
  payload: { appointmentId?: string; patientId?: string; doctorId?: string; scheduledStartAt?: string };
  retryCount: number; claimToken: string };

export class SlotConflictError extends Error {}
export class IdempotencyMismatchError extends Error {}
export class RescheduleStateError extends Error {}
export class ConcurrentChangeError extends Error {}
export class InvalidTransitionError extends Error {}

const columns = `a.id, a.patient_id AS "patientId", a.doctor_id AS "doctorId",
  a.specialty_id AS "specialtyId", a.scheduled_start_at AS "scheduledStartAt",
  a.scheduled_end_at AS "scheduledEndAt", a.reason, a.status,
  a.idempotency_key AS "idempotencyKey", a.created_by AS "createdBy",
  a.updated_by AS "updatedBy", a.created_at AS "createdAt", a.updated_at AS "updatedAt"`;

function appointment(row: Row): Appointment {
  const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();
  return {
    id: String(row.id), patientId: String(row.patientId), doctorId: String(row.doctorId),
    specialtyId: row.specialtyId == null ? undefined : String(row.specialtyId),
    scheduledStartAt: iso(row.scheduledStartAt), scheduledEndAt: iso(row.scheduledEndAt),
    reason: row.reason == null ? undefined : String(row.reason), status: row.status as AppointmentStatus,
    idempotencyKey: row.idempotencyKey == null ? undefined : String(row.idempotencyKey),
    createdBy: String(row.createdBy), updatedBy: row.updatedBy == null ? undefined : String(row.updatedBy),
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt)
  };
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "23P01") throw new SlotConflictError();
    if (error.code === "23514") throw new RangeError("Appointment interval violates a database constraint");
    if (error.code === "23505") throw new ConcurrentChangeError();
  }
  throw error;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    mapDatabaseError(error);
  } finally {
    client.release();
  }
}

async function queueEvent(client: PoolClient, eventType: string, item: Appointment): Promise<string> {
  const eventId = randomUUID();
  const payload = {
    appointmentId: item.id, patientId: item.patientId, doctorId: item.doctorId,
    scheduledStartAt: item.scheduledStartAt
  };
  await client.query(
    `INSERT INTO appointment_service.appointment_outbox_events
      (id, event_type, aggregate_id, payload) VALUES ($1, $2, $3, $4::jsonb)`,
    [eventId, eventType, item.id, JSON.stringify(payload)]);
  return eventId;
}

export function createAppointmentPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required by Appointment Service");
  const databaseSsl = process.env.DATABASE_SSL === "true";
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  const databaseCaPath = process.env.DATABASE_SSL_CA_PATH;
  if (databaseCaPath && !databaseSsl) throw new Error("DATABASE_SSL_CA_PATH requires DATABASE_SSL=true");
  if (databaseCaPath && !rejectUnauthorized) throw new Error("DATABASE_SSL_CA_PATH requires certificate verification");
  return new pg.Pool({
    connectionString,
    ssl: databaseSsl
      ? { rejectUnauthorized, ...(databaseCaPath ? { ca: readFileSync(databaseCaPath, "utf8") } : {}) }
      : undefined,
    max: 10,
    connectionTimeoutMillis: 3000
  });
}

export class PostgresAppointmentRepository {
  constructor(private readonly pool: Pool) {}

  async health(): Promise<void> {
    const result = await this.pool.query(
      "SELECT 1 FROM appointment_service.schema_migrations WHERE version = $1",
      ["002_durable_events_and_internal_api"]);
    if (result.rowCount !== 1) throw new Error("Appointment database migration is not applied");
  }

  async list(filters: AppointmentFilters, page: number, limit: number) {
    const values: unknown[] = [];
    const where: string[] = [];
    const add = (column: string, value: unknown, operator = "=") => {
      if (value !== undefined) { values.push(value); where.push(`${column} ${operator} $${values.length}`); }
    };
    add("patient_id", filters.patientId);
    add("doctor_id", filters.doctorId);
    add("status", filters.status);
    add("scheduled_start_at", filters.from, ">=");
    add("scheduled_start_at", filters.to, "<");
    const condition = where.join(" AND ") || "true";
    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*) AS total FROM appointment_service.appointments WHERE ${condition}`, values);
    const result = await this.pool.query(
      `SELECT ${columns} FROM appointment_service.appointments a WHERE ${condition}
       ORDER BY scheduled_start_at ASC, id ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]);
    return { items: result.rows.map(appointment), page, limit, total: Number(count.rows[0].total) };
  }

  async occupiedSlots(doctorId: string, from: string, to?: string) {
    const result = await this.pool.query<{ startAt: Date; endAt: Date }>(
      `SELECT scheduled_start_at AS "startAt", scheduled_end_at AS "endAt"
       FROM appointment_service.appointments
       WHERE doctor_id = $1 AND status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
         AND scheduled_end_at > greatest($2::timestamptz, now())
         AND ($3::timestamptz IS NULL OR scheduled_start_at < $3::timestamptz)
       ORDER BY scheduled_start_at ASC, id ASC`,
      [doctorId, from, to ?? null]);
    return result.rows.map((row) => ({ startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString() }));
  }

  async findById(id: string) {
    const result = await this.pool.query(`SELECT ${columns} FROM appointment_service.appointments a WHERE id = $1`, [id]);
    return result.rows[0] ? appointment(result.rows[0]) : null;
  }

  async findReplay(actorId: string, key: string, fingerprint: BookingFingerprint) {
    const result = await this.pool.query(
      `SELECT ${columns}, (r.request_fingerprint = $4::jsonb) AS "fingerprintMatches"
       FROM appointment_service.idempotency_requests r
       JOIN appointment_service.appointments a ON a.id = r.appointment_id
       WHERE r.actor_id = $1 AND r.operation = $2 AND r.idempotency_key = $3`,
      [actorId, "CREATE", key, JSON.stringify(fingerprint)]);
    if (!result.rows[0]) return null;
    if (!result.rows[0].fingerprintMatches) throw new IdempotencyMismatchError();
    return appointment(result.rows[0]);
  }

  async createBooking(input: BookingInput, key: string, fingerprint: BookingFingerprint) {
    return inTransaction(this.pool, async (client) => {
      const claim = await client.query(
        `INSERT INTO appointment_service.idempotency_requests
          (actor_id, operation, idempotency_key, request_fingerprint)
         VALUES ($1, 'CREATE', $2, $3::jsonb)
         ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING RETURNING actor_id`,
        [input.createdBy, key, JSON.stringify(fingerprint)]);
      if (claim.rowCount === 0) {
        const existing = await client.query(
          `SELECT ${columns}, (r.request_fingerprint = $3::jsonb) AS "fingerprintMatches"
           FROM appointment_service.idempotency_requests r
           JOIN appointment_service.appointments a ON a.id = r.appointment_id
           WHERE r.actor_id = $1 AND r.operation = 'CREATE' AND r.idempotency_key = $2`,
          [input.createdBy, key, JSON.stringify(fingerprint)]);
        if (!existing.rows[0]?.fingerprintMatches) throw new IdempotencyMismatchError();
        return { appointment: appointment(existing.rows[0]), replayed: true, eventId: null };
      }
      const result = await client.query(
        `INSERT INTO appointment_service.appointments
          (patient_id, doctor_id, specialty_id, scheduled_start_at, scheduled_end_at,
           reason, status, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8) RETURNING *`,
        [input.patientId, input.doctorId, input.specialtyId, input.scheduledStartAt,
          input.scheduledEndAt, input.reason, key, input.createdBy]);
      const item = appointmentFromDatabaseRow(result.rows[0]);
      await client.query(
        `INSERT INTO appointment_service.appointment_status_history
          (appointment_id, to_status, changed_by) VALUES ($1, 'PENDING', $2)`,
        [item.id, input.createdBy]);
      await client.query(
        `UPDATE appointment_service.idempotency_requests SET appointment_id = $4
         WHERE actor_id = $1 AND operation = 'CREATE' AND idempotency_key = $2
           AND request_fingerprint = $3::jsonb`,
        [input.createdBy, key, JSON.stringify(fingerprint), item.id]);
      const eventId = await queueEvent(client, "appointment.created", item);
      return { appointment: item, replayed: false, eventId };
    });
  }

  async rescheduleBooking(id: string, startAt: string, endAt: string, actorId: string, reason?: string) {
    return inTransaction(this.pool, async (client) => {
      const current = await client.query(
        `SELECT ${columns} FROM appointment_service.appointments a WHERE id = $1 FOR UPDATE`, [id]);
      if (!current.rows[0]) return null;
      const before = appointment(current.rows[0]);
      if (!canReschedule(before.status)) throw new RescheduleStateError();
      if (before.scheduledStartAt === startAt && before.scheduledEndAt === endAt && reason === undefined) {
        return { appointment: before, eventId: null };
      }
      const updated = await client.query(
        `UPDATE appointment_service.appointments SET scheduled_start_at = $2,
           scheduled_end_at = $3, reason = COALESCE($4, reason), updated_by = $5,
           updated_at = now() WHERE id = $1 RETURNING *`,
        [id, startAt, endAt, reason ?? null, actorId]);
      const item = appointmentFromDatabaseRow(updated.rows[0]);
      await client.query(
        `INSERT INTO appointment_service.appointment_status_history
          (appointment_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, $2, $3, $4)`,
        [id, before.status, actorId, reason ?? null]);
      const eventId = await queueEvent(client, "appointment.rescheduled", item);
      return { appointment: item, eventId };
    });
  }

  async transition(id: string, toStatus: AppointmentStatus, changedBy: string, reason?: string,
    expectedStatus?: AppointmentStatus) {
    return inTransaction(this.pool, async (client) => {
      const current = await client.query(
        `SELECT ${columns} FROM appointment_service.appointments a WHERE id = $1 FOR UPDATE`, [id]);
      if (!current.rows[0]) return null;
      const before = appointment(current.rows[0]);
      if (expectedStatus && before.status !== expectedStatus) throw new ConcurrentChangeError();
      if (!canTransition(before.status, toStatus)) throw new InvalidTransitionError();
      const result = await client.query(
        `UPDATE appointment_service.appointments SET status = $2, updated_by = $3,
           updated_at = now() WHERE id = $1 RETURNING *`, [id, toStatus, changedBy]);
      const item = appointmentFromDatabaseRow(result.rows[0]);
      await client.query(
        `INSERT INTO appointment_service.appointment_status_history
          (appointment_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`, [id, before.status, toStatus, changedBy, reason ?? null]);
      await queueEvent(client, `appointment.${toStatus.toLowerCase()}`, item);
      return item;
    });
  }

  async findCompletion(id: string) {
    const result = await this.pool.query<{ recordId: string; doctorUserId: string }>(
      `SELECT record_id AS "recordId", doctor_user_id AS "doctorUserId"
       FROM appointment_service.appointment_completions WHERE appointment_id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async completeFromRecord(id: string, recordId: string, doctorUserId: string) {
    return inTransaction(this.pool, async (client) => {
      const current = await client.query(
        `SELECT ${columns} FROM appointment_service.appointments a WHERE id = $1 FOR UPDATE`, [id]);
      if (!current.rows[0]) return null;
      const before = appointment(current.rows[0]);
      const completion = await client.query<{ recordId: string }>(
        `SELECT record_id AS "recordId" FROM appointment_service.appointment_completions
         WHERE appointment_id = $1`, [id]);
      if (before.status === "COMPLETED" && completion.rows[0]?.recordId === recordId)
        return { appointment: before, replayed: true };
      if (before.status !== "CHECKED_IN" || completion.rows[0]) throw new InvalidTransitionError();
      await client.query(
        `INSERT INTO appointment_service.appointment_completions
           (appointment_id, record_id, doctor_user_id) VALUES ($1,$2,$3)`, [id, recordId, doctorUserId]);
      const updated = await client.query(
        `UPDATE appointment_service.appointments SET status = 'COMPLETED',
           updated_by = $2, updated_at = now() WHERE id = $1 RETURNING *`, [id, doctorUserId]);
      const item = appointmentFromDatabaseRow(updated.rows[0]);
      await client.query(
        `INSERT INTO appointment_service.appointment_status_history
           (appointment_id, from_status, to_status, changed_by)
         VALUES ($1, 'CHECKED_IN', 'COMPLETED', $2)`, [id, doctorUserId]);
      await queueEvent(client, "appointment.completed", item);
      return { appointment: item, replayed: false };
    });
  }

  async claimOutbox(limit = 20, leaseSeconds = 60): Promise<OutboxEvent[]> {
    const result = await this.pool.query<OutboxEvent>(
      `WITH due AS (
         SELECT e.id FROM appointment_service.appointment_outbox_events e
         WHERE ((e.status = 'PENDING' AND e.next_attempt_at <= now())
            OR (e.status = 'PROCESSING' AND COALESCE(e.lease_until, '-infinity'::timestamptz) <= now()))
           AND NOT EXISTS (SELECT 1 FROM appointment_service.appointment_outbox_events earlier
             WHERE earlier.aggregate_id = e.aggregate_id
               AND earlier.status IN ('PENDING', 'PROCESSING')
               AND (earlier.created_at, earlier.id) < (e.created_at, e.id))
         ORDER BY e.created_at, e.id FOR UPDATE OF e SKIP LOCKED LIMIT $1
       )
       UPDATE appointment_service.appointment_outbox_events e
       SET status = 'PROCESSING', lease_until = now() + ($2 * interval '1 second'),
           claim_token = gen_random_uuid(), retry_count = retry_count + 1
       FROM due WHERE e.id = due.id
       RETURNING e.id, e.event_type AS "eventType", e.aggregate_id AS "aggregateId",
         e.payload, e.retry_count AS "retryCount", e.claim_token AS "claimToken"`,
      [limit, leaseSeconds]);
    return result.rows;
  }

  async markOutboxSent(id: string, claimToken: string) {
    const result = await this.pool.query(
      `UPDATE appointment_service.appointment_outbox_events
       SET status = 'SENT', processed_at = now(), lease_until = NULL,
           claim_token = NULL, last_error = NULL
       WHERE id = $1 AND claim_token = $2 AND status = 'PROCESSING'`, [id, claimToken]);
    return result.rowCount === 1;
  }

  async deferOutbox(id: string, claimToken: string, errorCode: string, maxAttempts = 10) {
    const result = await this.pool.query(
      `UPDATE appointment_service.appointment_outbox_events
       SET status = CASE WHEN retry_count >= $4 THEN 'FAILED' ELSE 'PENDING' END,
           next_attempt_at = now() + (LEAST(3600, power(2, LEAST(retry_count, 11))) * interval '1 second'),
           lease_until = NULL, claim_token = NULL, last_error = $3
       WHERE id = $1 AND claim_token = $2 AND status = 'PROCESSING'`,
      [id, claimToken, errorCode.slice(0, 200), maxAttempts]);
    return result.rowCount === 1;
  }

  async outboxCounts() {
    const result = await this.pool.query<{ status: string; total: string }>(
      `SELECT status, count(*) AS total FROM appointment_service.appointment_outbox_events GROUP BY status`);
    const counts = { PENDING: 0, PROCESSING: 0, SENT: 0, FAILED: 0 };
    for (const row of result.rows) if (row.status in counts)
      counts[row.status as keyof typeof counts] = Number(row.total);
    return counts;
  }
}

function appointmentFromDatabaseRow(row: Row): Appointment {
  return appointment({
    id: row.id, patientId: row.patient_id, doctorId: row.doctor_id,
    specialtyId: row.specialty_id, scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at, reason: row.reason, status: row.status,
    idempotencyKey: row.idempotency_key, createdBy: row.created_by,
    updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at
  });
}
