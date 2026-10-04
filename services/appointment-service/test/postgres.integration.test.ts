import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAppointmentPool, ConcurrentChangeError, IdempotencyMismatchError,
  InvalidTransitionError, PostgresAppointmentRepository,
  SlotConflictError, type BookingFingerprint } from "../src/postgres-repository.js";
import { AppointmentOutboxWorker } from "../src/outbox-worker.js";

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
    await pool.query("TRUNCATE appointment_service.appointment_completions, appointment_service.appointment_outbox_events, appointment_service.appointment_status_history, appointment_service.idempotency_requests, appointment_service.appointments");
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
    const firstPool = createAppointmentPool(databaseUrl);
    const secondPool = createAppointmentPool(databaseUrl);
    let results: PromiseSettledResult<Awaited<ReturnType<typeof repo.createBooking>>>[];
    try {
      results = await Promise.allSettled([
        new PostgresAppointmentRepository(firstPool).createBooking({ ...overlap, createdBy: actorId }, "concurrent-a", overlap),
        new PostgresAppointmentRepository(secondPool).createBooking({ ...shifted, createdBy: actorId }, "concurrent-b", shifted)
      ]);
    } finally {
      await Promise.all([firstPool.end(), secondPool.end()]);
    }
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

  it("scopes identical idempotency keys to each actor", async () => {
    const otherActorId = "00000000-0000-4000-8000-000000000026";
    const firstSlot = { ...base, scheduledStartAt: "2030-01-08T01:00:00.000Z",
      scheduledEndAt: "2030-01-08T01:30:00.000Z" };
    const secondSlot = { ...base, scheduledStartAt: "2030-01-08T01:30:00.000Z",
      scheduledEndAt: "2030-01-08T02:00:00.000Z" };
    const first = await repo.createBooking({ ...firstSlot, createdBy: actorId }, "shared-key", firstSlot);
    const second = await repo.createBooking({ ...secondSlot, createdBy: otherActorId }, "shared-key", secondSlot);
    expect(second.appointment.id).not.toBe(first.appointment.id);
    expect(second.replayed).toBe(false);
    expect((await repo.createBooking({ ...secondSlot, createdBy: otherActorId }, "shared-key", secondSlot))
      .appointment.id).toBe(second.appointment.id);
  });

  it("uses half-open intervals and rejects a non-positive interval in PostgreSQL", async () => {
    const firstSlot = { ...base, scheduledStartAt: "2030-01-09T01:00:00.000Z",
      scheduledEndAt: "2030-01-09T01:30:00.000Z" };
    const adjacentSlot = { ...base, scheduledStartAt: firstSlot.scheduledEndAt,
      scheduledEndAt: "2030-01-09T02:00:00.000Z" };
    await repo.createBooking({ ...firstSlot, createdBy: actorId }, "half-open-a", firstSlot);
    await expect(repo.createBooking({ ...adjacentSlot, createdBy: actorId }, "half-open-b", adjacentSlot))
      .resolves.toMatchObject({ replayed: false });
    await expect(pool.query(`INSERT INTO appointment_service.appointments
      (patient_id, doctor_id, scheduled_start_at, scheduled_end_at, status, created_by)
      VALUES ($1, $2, $3, $4, 'PENDING', $5)`, [patientId, doctorId,
      "2030-01-09T03:00:00.000Z", "2030-01-09T03:00:00.000Z", actorId]))
      .rejects.toMatchObject({ code: "23514" });
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

  it("allows only one overlapping reschedule from independent database pools", async () => {
    const firstSlot = { ...base, scheduledStartAt: "2030-01-08T03:00:00.000Z",
      scheduledEndAt: "2030-01-08T03:30:00.000Z" };
    const secondSlot = { ...base, scheduledStartAt: "2030-01-08T04:00:00.000Z",
      scheduledEndAt: "2030-01-08T04:30:00.000Z" };
    const first = await repo.createBooking({ ...firstSlot, createdBy: actorId }, "reschedule-race-a", firstSlot);
    const second = await repo.createBooking({ ...secondSlot, createdBy: actorId }, "reschedule-race-b", secondSlot);
    const firstPool = createAppointmentPool(databaseUrl);
    const secondPool = createAppointmentPool(databaseUrl);
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled([
        new PostgresAppointmentRepository(firstPool).rescheduleBooking(first.appointment.id,
          "2030-01-08T05:00:00.000Z", "2030-01-08T05:30:00.000Z", actorId),
        new PostgresAppointmentRepository(secondPool).rescheduleBooking(second.appointment.id,
          "2030-01-08T05:15:00.000Z", "2030-01-08T05:45:00.000Z", actorId)
      ]);
    } finally {
      await Promise.all([firstPool.end(), secondPool.end()]);
    }
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(SlotConflictError);
    const current = await Promise.all([repo.findById(first.appointment.id), repo.findById(second.appointment.id)]);
    expect(current.filter((item) => item?.scheduledStartAt.startsWith("2030-01-08T05:"))).toHaveLength(1);
    const history = await pool.query(`SELECT count(*)::int AS count FROM appointment_service.appointment_status_history
      WHERE appointment_id IN ($1, $2) AND from_status = 'PENDING' AND to_status = 'PENDING'`,
      [first.appointment.id, second.appointment.id]);
    expect(history.rows[0].count).toBe(1);
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

  it("claims each event once across workers and retries after a lease expires", async () => {
    const first = await repo.claimOutbox(1, 1);
    expect(first).toHaveLength(1);
    const second = await repo.claimOutbox(100, 1);
    expect(second.some((event) => event.id === first[0].id)).toBe(false);
    await pool.query(`UPDATE appointment_service.appointment_outbox_events SET lease_until = now() - interval '1 second'
      WHERE id = $1`, [first[0].id]);
    const reclaimed = await repo.claimOutbox(100, 60);
    expect(reclaimed.some((event) => event.id === first[0].id)).toBe(true);
    expect(await repo.markOutboxSent(first[0].id, first[0].claimToken)).toBe(false);
    const current = reclaimed.find((event) => event.id === first[0].id)!;
    expect(await repo.markOutboxSent(current.id, current.claimToken)).toBe(true);
    expect(await repo.markOutboxSent(current.id, current.claimToken)).toBe(false);
  });

  it("commits final-record completion, history and outbox together with replay protection", async () => {
    const interval = { ...base, scheduledStartAt: "2030-01-07T06:00:00.000Z",
      scheduledEndAt: "2030-01-07T06:30:00.000Z" };
    const made = await repo.createBooking({ ...interval, createdBy: actorId }, "completion-key", interval);
    await repo.transition(made.appointment.id, "CONFIRMED", actorId);
    await repo.transition(made.appointment.id, "CHECKED_IN", actorId);
    const recordId = "00000000-0000-4000-8000-000000000024";
    const result = await repo.completeFromRecord(made.appointment.id, recordId, actorId);
    expect(result?.appointment.status).toBe("COMPLETED");
    expect(result?.replayed).toBe(false);
    expect((await repo.completeFromRecord(made.appointment.id, recordId, actorId))?.replayed).toBe(true);
    await expect(repo.completeFromRecord(made.appointment.id,
      "00000000-0000-4000-8000-000000000025", actorId)).rejects.toBeInstanceOf(InvalidTransitionError);
    const rows = await pool.query(`SELECT (SELECT count(*) FROM appointment_service.appointment_completions
      WHERE appointment_id = $1) AS completions,
      (SELECT count(*) FROM appointment_service.appointment_status_history WHERE appointment_id = $1
       AND to_status = 'COMPLETED') AS histories,
      (SELECT count(*) FROM appointment_service.appointment_outbox_events WHERE aggregate_id = $1
       AND event_type = 'appointment.completed') AS events`, [made.appointment.id]);
    expect(rows.rows[0]).toMatchObject({ completions: "1", histories: "1", events: "1" });
  });

  it("retains an event during Notification outage and delivers its stable ID after recovery", async () => {
    const interval = { ...base, scheduledStartAt: "2030-01-07T07:00:00.000Z",
      scheduledEndAt: "2030-01-07T07:30:00.000Z" };
    const made = await repo.createBooking({ ...interval, createdBy: actorId }, "outage-key", interval);
    process.env.NOTIFICATION_INTERNAL_API_TOKEN = "notification-internal-test-token-with-32-bytes";
    const sent: unknown[] = [];
    let offline = true;
    const send = async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/patients/"))
        return Response.json({ success: true, data: { userId: actorId } });
      if (offline) return new Response(null, { status: 503 });
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ success: true, data: {} });
    };
    const worker = new AppointmentOutboxWorker(repo, "http://user", "http://notification", send as typeof fetch);
    for (let i = 0; i < 20; i++) await worker.dispatchBatch();
    const pending = await pool.query(`SELECT id, status, retry_count FROM appointment_service.appointment_outbox_events
      WHERE aggregate_id = $1 AND event_type = 'appointment.created'`, [made.appointment.id]);
    expect(pending.rows[0]).toMatchObject({ status: "PENDING", retry_count: 1 });
    offline = false;
    await pool.query(`UPDATE appointment_service.appointment_outbox_events SET next_attempt_at = now() - interval '1 second'
      WHERE id = $1`, [pending.rows[0].id]);
    const restarted = new AppointmentOutboxWorker(new PostgresAppointmentRepository(pool),
      "http://user", "http://notification", send as typeof fetch);
    for (let i = 0; i < 20; i++) await restarted.dispatchBatch();
    expect(sent).toContainEqual(expect.objectContaining({ eventId: pending.rows[0].id, type: "appointment.created" }));
    expect((await pool.query(`SELECT status FROM appointment_service.appointment_outbox_events WHERE id = $1`,
      [pending.rows[0].id])).rows[0].status).toBe("SENT");
    delete process.env.NOTIFICATION_INTERNAL_API_TOKEN;
  });
});
