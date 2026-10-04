import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const notificationDatabaseUrl = process.env.TEST_DATABASE_URL;
const appointmentDatabaseUrl = process.env.TEST_APPOINTMENT_DATABASE_URL;
const integration = notificationDatabaseUrl && appointmentDatabaseUrl ? describe : describe.skip;

integration("Notification with real Appointment HTTP and separate PostgreSQL databases", () => {
  const appointmentPool = new Pool({ connectionString: appointmentDatabaseUrl });
  const notificationPool = new Pool({ connectionString: notificationDatabaseUrl });
  const appointmentId = randomUUID();
  const patientId = randomUUID();
  const doctorId = randomUUID();
  const recipientUserId = randomUUID();
  const internalToken = randomBytes(32).toString("hex");
  const eventToken = randomBytes(32).toString("hex");
  const createdId = randomUUID();
  const rescheduledId = randomUUID();
  const confirmedId = randomUUID();
  const cancelledId = randomUUID();
  const oldEventId = randomUUID();
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const rescheduledStart = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const eventIds = [createdId, rescheduledId, confirmedId, cancelledId, oldEventId,
    `reminder:${appointmentId}:${rescheduledStart}`];
  let child: ChildProcess;
  let notification: typeof import("../src/index.js");

  beforeAll(async () => {
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") return reject(new Error("No test port"));
        server.close(() => resolve(address.port));
      });
    });
    const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
    child = spawn(process.execPath, ["--import", "tsx", "services/appointment-service/src/index.ts"], {
      cwd: repoRoot, stdio: "ignore", env: { ...process.env, NODE_ENV: "integration",
        DATABASE_URL: appointmentDatabaseUrl, DATABASE_SSL: "false", APPOINTMENT_SERVICE_PORT: String(port),
        APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN: internalToken }
    });
    const appointmentUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error("Appointment Service exited during startup");
      try { ready = (await fetch(`${appointmentUrl}/health`)).ok; } catch { /* wait for the listener */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("Appointment Service did not become ready");
    await appointmentPool.query(
      `INSERT INTO appointment_service.appointments
       (id, patient_id, doctor_id, scheduled_start_at, scheduled_end_at, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'PENDING',$2)`,
      [appointmentId, patientId, doctorId, start, new Date(Date.parse(start) + 30 * 60 * 1000).toISOString()]);
    vi.stubEnv("DATABASE_URL", notificationDatabaseUrl!);
    vi.stubEnv("DATABASE_SSL", "false");
    vi.stubEnv("NOTIFICATION_INTERNAL_API_TOKEN", eventToken);
    vi.stubEnv("APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN", internalToken);
    vi.stubEnv("APPOINTMENT_SERVICE_URL", appointmentUrl);
    notification = await import("../src/index.js");
  }, 15_000);

  afterAll(async () => {
    await notificationPool.query(`DELETE FROM notification_service.notification_deliveries WHERE notification_id IN
      (SELECT id FROM notification_service.notifications WHERE event_id = ANY($1::text[]))`, [eventIds]);
    await notificationPool.query("DELETE FROM notification_service.notifications WHERE event_id = ANY($1::text[])", [eventIds]);
    await notificationPool.query("DELETE FROM notification_service.processed_events WHERE event_id = ANY($1::text[])", [eventIds]);
    await notificationPool.query("DELETE FROM notification_service.appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    await appointmentPool.query("DELETE FROM appointment_service.appointments WHERE id = $1", [appointmentId]);
    await Promise.all([appointmentPool.end(), notificationPool.end()]);
    if (child && child.exitCode === null) child.kill("SIGTERM");
    vi.unstubAllEnvs();
  });

  it("notifies PENDING changes, arms only after confirmation, and cancels stale reminders", async () => {
    const payload = (scheduledStartAt: string) => ({ appointmentId, patientId, recipientUserId, scheduledStartAt });
    const send = async (eventId: string, type: string, scheduledStartAt: string) => request(notification.app)
      .post("/internal/v1/notifications").set("X-Internal-Token", eventToken)
      .send({ eventId, type, payload: payload(scheduledStartAt) });

    expect((await send(createdId, "appointment.created", start)).status).toBe(201);
    let reminders = await notificationPool.query("SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    expect(reminders.rowCount).toBe(0);

    await appointmentPool.query(`UPDATE appointment_service.appointments
      SET scheduled_start_at = $2, scheduled_end_at = $3 WHERE id = $1`,
    [appointmentId, rescheduledStart, new Date(Date.parse(rescheduledStart) + 30 * 60 * 1000).toISOString()]);
    expect((await send(rescheduledId, "appointment.rescheduled", rescheduledStart)).status).toBe(201);
    reminders = await notificationPool.query("SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    expect(reminders.rowCount).toBe(0);

    await appointmentPool.query("UPDATE appointment_service.appointments SET status = 'CONFIRMED' WHERE id = $1", [appointmentId]);
    expect((await send(confirmedId, "appointment.confirmed", rescheduledStart)).status).toBe(201);
    reminders = await notificationPool.query<{ status: string }>(
      "SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    expect(reminders.rows[0].status).toBe("PENDING");
    await notification.dispatchReminders();
    const sent = await notificationPool.query("SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    expect(sent.rows[0].status).toBe("SENT");

    await appointmentPool.query("UPDATE appointment_service.appointments SET status = 'CANCELLED' WHERE id = $1", [appointmentId]);
    expect((await send(cancelledId, "appointment.cancelled", rescheduledStart)).status).toBe(201);
    expect((await send(oldEventId, "appointment.rescheduled", rescheduledStart)).status).toBe(201);
    const cancelled = await notificationPool.query<{ status: string }>(
      "SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    expect(cancelled.rows[0].status).toBe("CANCELLED");
    const stale = await notificationPool.query("SELECT id FROM notification_service.notifications WHERE event_id = $1", [oldEventId]);
    expect(stale.rowCount).toBe(0);
  }, 15_000);
});
