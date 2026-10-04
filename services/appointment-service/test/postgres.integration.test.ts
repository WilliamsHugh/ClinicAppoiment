import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAppointmentPool, ConcurrentChangeError, IdempotencyMismatchError,
  InvalidTransitionError, PostgresAppointmentRepository,
  SlotConflictError, type BookingFingerprint } from "../src/postgres-repository.js";

const databaseUrl = process.env.APPOINTMENT_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.APPOINTMENT_TEST_DATABASE_DISPOSABLE === "1");
const suite = enabled ? describe : describe.skip;
const doctorId = "00000000-0000-4000-8000-000000000021";
const actorId = "00000000-0000-4000-8000-000000000022";
const patientId = "00000000-0000-4000-8000-000000000023";
const base: BookingFingerprint = {
  patientId, doctorId, specialtyId: null,
  scheduledStartAt: "2030-01-07T01:00:00.000Z",
  scheduledEndAt: "2030-01-07T01:30:00.000Z", reason: null
};

suite("Appointment PostgreSQL integration (disposable database only)", () => {
  const pool = createAppointmentPool(databaseUrl ?? "postgresql://localhost/unused");
  const repo = new PostgresAppointmentRepository(pool);

  beforeAll(async () => {
    const migration = fileURLToPath(new URL("../../../infrastructure/supabase/appointment-service/schema.sql", import.meta.url));
    const sql = await readFile(migration, "utf8");
    await pool.query(sql);
    await pool.query(sql);
    await pool.query("TRUNCATE appointment_service.appointment_outbox_events, appointment_service.appointment_status_history, appointment_service.idempotency_requests, appointment_service.appointments");
  });
  afterAll(async () => { await pool.end(); });

  it("persists idempotent create, history and occupancy across repository instances", async () => {
    const first = await repo.createBooking({ ...base, createdBy: actorId }, "first-key", base);
    expect(first.replayed).toBe(false);
    const restartedPool = createAppointmentPool(databaseUrl);
    try {
      const another = new PostgresAppointmentRepository(restartedPool);
      const replay = await another.createBooking({ ...base, createdBy: actorId }, "first-key", base);
      expect(replay.replayed).toBe(true);
      expect(replay.appointment.id).toBe(first.appointment.id);
      await expect(another.createBooking({ ...base, createdBy: actorId }, "first-key",
        { ...base, reason: "changed" })).rejects.toBeInstanceOf(IdempotencyMismatchError);
      expect((await another.occupiedSlots(doctorId, "2030-01-07T00:00:00.000Z")).length).toBe(1);
    } finally { await restartedPool.end(); }
    const history = await pool.query("SELECT count(*)::int AS count FROM appointment_service.appointment_status_history WHERE appointment_id = $1", [first.appointment.id]);
    expect(history.rows[0].count).toBe(1);
  });

  it("allows only one concurrent overlapping create and preserves the losing key for retry", async () => {
    const overlap = { ...base, scheduledStartAt: "2030-01-07T02:00:00.000Z",
      scheduledEndAt: "2030-01-07T02:30:00.000Z" };
    const shifted = { ...overlap, scheduledStartAt: "2030-01-07T02:15:00.000Z",
      scheduledEndAt: "2030-01-07T02:45:00.000Z" };
    const results = await Promise.allSettled([
      repo.createBooking({ ...overlap, createdBy: actorId }, "concurrent-a", overlap),
      repo.createBooking({ ...shifted, createdBy: actorId }, "concurrent-b", shifted)
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(SlotConflictError);
    const list = await repo.list({ doctorId }, 1, 10);
    expect(list.total).toBe(2);
  });

  it("serializes two concurrent requests with the same idempotency key", async () => {
    const interval = { ...base, scheduledStartAt: "2030-01-07T04:00:00.000Z",
      scheduledEndAt: "2030-01-07T04:30:00.000Z" };
    const [one, two] = await Promise.all([
      repo.createBooking({ ...interval, createdBy: actorId }, "parallel-key", interval),
      repo.createBooking({ ...interval, createdBy: actorId }, "parallel-key", interval)
    ]);
    expect(one.appointment.id).toBe(two.appointment.id);
    expect([one.replayed, two.replayed].sort()).toEqual([false, true]);
    const ledger = await pool.query("SELECT count(*)::int AS count FROM appointment_service.idempotency_requests WHERE actor_id = $1 AND idempotency_key = $2",
      [actorId, "parallel-key"]);
    expect(ledger.rows[0].count).toBe(1);
  });

  it("rejects overlapping reschedule atomically", async () => {
    const other = { ...base, scheduledStartAt: "2030-01-07T03:00:00.000Z",
      scheduledEndAt: "2030-01-07T03:30:00.000Z" };
    const made = await repo.createBooking({ ...other, createdBy: actorId }, "reschedule-key", other);
    await expect(repo.rescheduleBooking(made.appointment.id,
      "2030-01-07T01:15:00.000Z", "2030-01-07T01:45:00.000Z", actorId))
      .rejects.toBeInstanceOf(SlotConflictError);
    expect((await repo.findById(made.appointment.id))?.scheduledStartAt).toBe(other.scheduledStartAt);
  });

  it("serializes competing transitions and writes exactly one matching history row", async () => {
    const interval = { ...base, scheduledStartAt: "2030-01-07T05:00:00.000Z",
      scheduledEndAt: "2030-01-07T05:30:00.000Z" };
    const made = await repo.createBooking({ ...interval, createdBy: actorId }, "transition-key", interval);
    const results = await Promise.allSettled([
      repo.transition(made.appointment.id, "CONFIRMED", actorId, undefined, "PENDING"),
      repo.transition(made.appointment.id, "CONFIRMED", actorId, undefined, "PENDING")
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason)
      .toBeInstanceOf(ConcurrentChangeError);
    const persisted = await repo.findById(made.appointment.id);
    expect(persisted?.status).toBe("CONFIRMED");
    const history = await pool.query(`SELECT from_status, to_status FROM appointment_service.appointment_status_history
      WHERE appointment_id = $1 ORDER BY created_at ASC`, [made.appointment.id]);
    expect(history.rows).toHaveLength(2);
    expect(history.rows[1]).toMatchObject({ from_status: "PENDING", to_status: "CONFIRMED" });
    await expect(repo.transition(made.appointment.id, "COMPLETED", actorId))
      .rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await repo.findById(made.appointment.id))?.status).toBe("CONFIRMED");
  });
});
