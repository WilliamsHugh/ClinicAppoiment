import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { NotificationRepository } from "../src/repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Notification real PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new NotificationRepository(pool);
  const appointmentId = randomUUID();
  const patientId = randomUUID();
  const recipientUserId = randomUUID();
  const confirmedId = randomUUID();
  const cancelledId = randomUUID();
  const staleId = randomUUID();
  const failedId = randomUUID();
  const sendAppointmentId = randomUUID();
  const sendEventId = randomUUID();
  const repeatEventId = randomUUID();
  const lateAppointmentId = randomUUID();
  const lateCreatedId = randomUUID();
  const lateConfirmedId = randomUUID();
  const lateCancelledId = randomUUID();
  const scheduledStartAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  afterAll(async () => {
    await pool.query(`DELETE FROM notification_service.notification_deliveries WHERE notification_id IN
      (SELECT id FROM notification_service.notifications WHERE event_id = ANY($1::text[]))`,
    [[confirmedId, cancelledId, staleId, failedId, sendEventId, repeatEventId,
      lateCreatedId, lateConfirmedId, lateCancelledId,
      `reminder:${appointmentId}:${scheduledStartAt}`, `reminder:${sendAppointmentId}:${scheduledStartAt}`,
      `reminder:${lateAppointmentId}:${scheduledStartAt}`]]);
    await pool.query("DELETE FROM notification_service.notifications WHERE event_id = ANY($1::text[])",
      [[confirmedId, cancelledId, staleId, failedId, sendEventId, repeatEventId,
        lateCreatedId, lateConfirmedId, lateCancelledId,
        `reminder:${appointmentId}:${scheduledStartAt}`, `reminder:${sendAppointmentId}:${scheduledStartAt}`,
        `reminder:${lateAppointmentId}:${scheduledStartAt}`]]);
    await pool.query("DELETE FROM notification_service.processed_events WHERE event_id = ANY($1::text[])",
      [[confirmedId, cancelledId, staleId, failedId, sendEventId, repeatEventId,
        lateCreatedId, lateConfirmedId, lateCancelledId]]);
    await pool.query("DELETE FROM notification_service.appointment_reminders WHERE appointment_id = ANY($1::uuid[])",
      [[appointmentId, sendAppointmentId, lateAppointmentId]]);
    await pool.end();
  });

  it("deduplicates the notification and reminder together, then cancels without revival", async () => {
    const input = { recipientUserId, type: "appointment.confirmed", title: "Confirmed", message: "Visit soon", payload: { appointmentId } };
    const effect = { kind: "schedule" as const, reminder: { appointmentId, patientId, recipientUserId, scheduledStartAt } };
    expect((await repository.applyEvent(confirmedId, input, effect)).created).toBe(true);
    expect((await repository.applyEvent(confirmedId, input, effect)).created).toBe(false);
    const notifications = await pool.query("SELECT id FROM notification_service.notifications WHERE event_id = $1", [confirmedId]);
    expect(notifications.rowCount).toBe(1);
    const claims = await Promise.all([repository.claimDueReminders(), repository.claimDueReminders()]);
    expect(claims.flat()).toHaveLength(1);
    await pool.query("UPDATE notification_service.appointment_reminders SET lease_expires_at = now() - interval '1 second' WHERE appointment_id = $1", [appointmentId]);
    expect(await repository.claimDueReminders()).toHaveLength(1);
    await repository.applyEvent(cancelledId, { ...input, type: "appointment.cancelled" }, { kind: "cancel", appointmentId });
    expect(await repository.deliverClaimedReminder({ appointmentId, patientId, recipientUserId,
      scheduledStartAt: new Date(scheduledStartAt) }, "Reminder", "Visit soon")).toBe(false);
    await repository.applyEvent(staleId, null, { kind: "none" });
    const reminder = await pool.query<{ status: string }>(
      "SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    expect(reminder.rows[0].status).toBe("CANCELLED");
  });

  it("rolls back processed ID if notification insert fails", async () => {
    await expect(repository.applyEvent(failedId, { recipientUserId: "invalid-uuid", type: "appointment.created",
      title: "Title", message: "Message", payload: {} }, { kind: "none" })).rejects.toMatchObject({ code: "22P02" });
    const result = await pool.query("SELECT event_id FROM notification_service.processed_events WHERE event_id = $1", [failedId]);
    expect(result.rowCount).toBe(0);
  });

  it("sends one reminder transactionally and does not revive it for the same slot", async () => {
    const input = { recipientUserId, type: "appointment.confirmed", title: "Confirmed", message: "Visit soon",
      payload: { appointmentId: sendAppointmentId } };
    const effect = { kind: "schedule" as const, reminder: { appointmentId: sendAppointmentId, patientId,
      recipientUserId, scheduledStartAt } };
    await repository.applyEvent(sendEventId, input, effect);
    const claims = await repository.claimDueReminders();
    expect(claims).toHaveLength(1);
    expect(await repository.deliverClaimedReminder(claims[0], "Reminder", "Visit soon")).toBe(true);
    await repository.applyEvent(repeatEventId, input, effect);
    const reminder = await pool.query<{ status: string }>(
      "SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1", [sendAppointmentId]);
    expect(reminder.rows[0].status).toBe("SENT");
    const notification = await pool.query("SELECT id FROM notification_service.notifications WHERE event_id = $1",
      [`reminder:${sendAppointmentId}:${scheduledStartAt}`]);
    expect(notification.rowCount).toBe(1);
  });

  it("arms a late confirmation at the same slot after a pending reminder was cancelled", async () => {
    const input = { recipientUserId, type: "appointment.created", title: "Created", message: "Pending",
      payload: { appointmentId: lateAppointmentId } };
    const reminder = { appointmentId: lateAppointmentId, patientId, recipientUserId, scheduledStartAt };
    await repository.applyEvent(lateCreatedId, input, { kind: "none" });
    const absent = await pool.query("SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1",
      [lateAppointmentId]);
    expect(absent.rowCount).toBe(0);

    // Simulate a reminder left by the earlier PENDING behavior during an upgrade.
    await repository.scheduleReminder(reminder);
    await repository.cancelReminder(lateAppointmentId);
    await repository.applyEvent(lateConfirmedId, { ...input, type: "appointment.confirmed" },
      { kind: "schedule", reminder });
    const armed = await pool.query<{ status: string; scheduled_start_at: Date }>(
      "SELECT status, scheduled_start_at FROM notification_service.appointment_reminders WHERE appointment_id = $1",
      [lateAppointmentId]);
    expect(armed.rows[0].status).toBe("PENDING");
    expect(armed.rows[0].scheduled_start_at.toISOString()).toBe(scheduledStartAt);

    await repository.applyEvent(lateCancelledId, { ...input, type: "appointment.cancelled" },
      { kind: "cancel", appointmentId: lateAppointmentId });
    expect((await repository.applyEvent(lateConfirmedId, { ...input, type: "appointment.confirmed" },
      { kind: "schedule", reminder })).created).toBe(false);
    const cancelled = await pool.query<{ status: string }>(
      "SELECT status FROM notification_service.appointment_reminders WHERE appointment_id = $1",
      [lateAppointmentId]);
    expect(cancelled.rows[0].status).toBe("CANCELLED");
  });
});
