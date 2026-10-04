type Pool = InstanceType<typeof import("pg").Pool>;

export type Notification = {
  id: string; recipientUserId: string; type: string; title: string; message: string;
  payload: Record<string, unknown>; status: "UNREAD" | "READ" | "FAILED";
  readAt?: string; createdAt: string; eventId?: string;
};
export type NotificationInput = Pick<Notification, "recipientUserId" | "type" | "title" | "message" | "payload">;
export type Reminder = { appointmentId: string; patientId: string; recipientUserId: string; scheduledStartAt: Date };
export type EventEffect = { kind: "none" } | { kind: "cancel"; appointmentId: string } |
  { kind: "schedule"; reminder: Omit<Reminder, "scheduledStartAt"> & { scheduledStartAt: string } };
const select = `id, recipient_user_id AS "recipientUserId", type, title, message, payload, status,
  read_at AS "readAt", created_at AS "createdAt", event_id AS "eventId"`;

export class NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(recipientUserId: string, page: number, limit: number, status?: string) {
    const values: unknown[] = [recipientUserId];
    const where = status ? "recipient_user_id = $1 AND status = $2" : "recipient_user_id = $1";
    if (status) values.push(status);
    const total = await this.pool.query<{ count: string }>(`SELECT count(*) FROM notification_service.notifications WHERE ${where}`, values);
    const rows = await this.pool.query<Notification>(
      `SELECT ${select} FROM notification_service.notifications WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );
    return { items: rows.rows, page, limit, total: Number(total.rows[0].count) };
  }

  async findById(id: string) {
    const result = await this.pool.query<Notification>(`SELECT ${select} FROM notification_service.notifications WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async hasProcessedEvent(eventId: string) {
    const result = await this.pool.query(
      "SELECT 1 FROM notification_service.processed_events WHERE event_id = $1", [eventId]);
    return Boolean(result.rows[0]);
  }

  async createEvent(eventId: string, input: NotificationInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Notification>(
        `INSERT INTO notification_service.notifications (recipient_user_id, type, title, message, payload, event_id)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING RETURNING ${select}`,
        [input.recipientUserId, input.type, input.title, input.message, JSON.stringify(input.payload), eventId]
      );
      if (!result.rows[0]) { await client.query("COMMIT"); return { created: false as const, notification: null }; }
      const notification = result.rows[0];
      await client.query(
        "INSERT INTO notification_service.notification_deliveries (notification_id, channel, status, sent_at) VALUES ($1,'IN_APP','SENT',now())",
        [notification.id]
      );
      await client.query("COMMIT");
      return { created: true as const, notification };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async applyEvent(eventId: string, input: NotificationInput | null, effect: EventEffect) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ event_id: string }>(
        `INSERT INTO notification_service.processed_events (event_id) VALUES ($1)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`, [eventId]);
      if (!inserted.rows[0]) {
        await client.query("COMMIT");
        return { created: false as const, notification: null };
      }
      let notification: Notification | null = null;
      if (input) {
        const result = await client.query<Notification>(
          `INSERT INTO notification_service.notifications (recipient_user_id, type, title, message, payload, event_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${select}`,
          [input.recipientUserId, input.type, input.title, input.message, JSON.stringify(input.payload), eventId]);
        notification = result.rows[0];
        await client.query(
          "INSERT INTO notification_service.notification_deliveries (notification_id, channel, status, sent_at) VALUES ($1,'IN_APP','SENT',now())",
          [notification.id]);
      }
      if (effect.kind === "cancel") {
        await client.query("UPDATE notification_service.appointment_reminders SET status = 'CANCELLED', lease_expires_at = NULL WHERE appointment_id = $1", [effect.appointmentId]);
      } else if (effect.kind === "schedule") {
        const reminder = effect.reminder;
        await client.query(
          `INSERT INTO notification_service.appointment_reminders
           (appointment_id, patient_id, recipient_user_id, scheduled_start_at, remind_at)
           VALUES ($1,$2,$3,$4,$4::timestamptz - interval '24 hours')
           ON CONFLICT (appointment_id) DO UPDATE SET patient_id = EXCLUDED.patient_id,
             recipient_user_id = EXCLUDED.recipient_user_id, scheduled_start_at = EXCLUDED.scheduled_start_at,
             remind_at = EXCLUDED.remind_at, status = 'PENDING', retry_count = 0,
             next_attempt_at = now(), lease_expires_at = NULL
           WHERE appointment_reminders.scheduled_start_at IS DISTINCT FROM EXCLUDED.scheduled_start_at`,
          [reminder.appointmentId, reminder.patientId, reminder.recipientUserId, reminder.scheduledStartAt]);
      }
      await client.query("COMMIT");
      return { created: true as const, notification };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async markRead(id: string, actorId: string) {
    const result = await this.pool.query<Notification>(
      `UPDATE notification_service.notifications SET status = 'READ', read_at = COALESCE(read_at, now())
       WHERE id = $1 AND recipient_user_id = $2 RETURNING ${select}`, [id, actorId]
    );
    return result.rows[0] ?? null;
  }

  async retryDelivery(id: string) {
    const result = await this.pool.query(
      `UPDATE notification_service.notification_deliveries
       SET retry_count = retry_count + 1, status = 'SENT', error_message = NULL, sent_at = now()
       WHERE notification_id = $1 AND status = 'FAILED' AND retry_count < 3
       RETURNING id, retry_count AS "retryCount"`, [id]
    );
    return result.rows[0] ?? null;
  }

  async scheduleReminder(reminder: Omit<Reminder, "scheduledStartAt"> & { scheduledStartAt: string }) {
    await this.pool.query(
      `INSERT INTO notification_service.appointment_reminders
       (appointment_id, patient_id, recipient_user_id, scheduled_start_at, remind_at)
       VALUES ($1,$2,$3,$4,$4::timestamptz - interval '24 hours')
       ON CONFLICT (appointment_id) DO UPDATE SET patient_id = EXCLUDED.patient_id,
       recipient_user_id = EXCLUDED.recipient_user_id, scheduled_start_at = EXCLUDED.scheduled_start_at,
       remind_at = EXCLUDED.remind_at, status = 'PENDING', retry_count = 0, next_attempt_at = now()
       WHERE appointment_reminders.scheduled_start_at IS DISTINCT FROM EXCLUDED.scheduled_start_at`,
      [reminder.appointmentId, reminder.patientId, reminder.recipientUserId, reminder.scheduledStartAt]
    );
  }

  async cancelReminder(appointmentId: string, scheduledStartAt?: string) {
    await this.pool.query(`UPDATE notification_service.appointment_reminders SET status = 'CANCELLED', lease_expires_at = NULL
      WHERE appointment_id = $1 AND ($2::timestamptz IS NULL OR scheduled_start_at = $2::timestamptz)`,
    [appointmentId, scheduledStartAt ?? null]);
  }

  async claimDueReminders(limit = 20) {
    const result = await this.pool.query<Reminder>(
      `WITH due AS (
         SELECT appointment_id FROM notification_service.appointment_reminders
         WHERE ((status = 'PENDING' AND next_attempt_at <= now()) OR
                (status = 'PROCESSING' AND lease_expires_at <= now()))
           AND remind_at <= now() AND scheduled_start_at > now()
         ORDER BY remind_at FOR UPDATE SKIP LOCKED LIMIT $1
       )
       UPDATE notification_service.appointment_reminders AS reminder
       SET status = 'PROCESSING', lease_expires_at = now() + interval '90 seconds'
       FROM due WHERE reminder.appointment_id = due.appointment_id
       RETURNING reminder.appointment_id AS "appointmentId", reminder.patient_id AS "patientId",
         reminder.recipient_user_id AS "recipientUserId", reminder.scheduled_start_at AS "scheduledStartAt"`, [limit]);
    return result.rows;
  }

  async markReminderSent(appointmentId: string, scheduledStartAt: string) {
    await this.pool.query(`UPDATE notification_service.appointment_reminders SET status = 'SENT', lease_expires_at = NULL
      WHERE appointment_id = $1 AND scheduled_start_at = $2 AND status = 'PROCESSING'`, [appointmentId, scheduledStartAt]);
  }

  async deliverClaimedReminder(reminder: Reminder, title: string, message: string) {
    const scheduledStartAt = reminder.scheduledStartAt.toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claim = await client.query(
        `SELECT appointment_id FROM notification_service.appointment_reminders
         WHERE appointment_id = $1 AND scheduled_start_at = $2 AND status = 'PROCESSING' FOR UPDATE`,
        [reminder.appointmentId, scheduledStartAt]);
      if (!claim.rows[0]) { await client.query("COMMIT"); return false; }
      const result = await client.query<Notification>(
        `INSERT INTO notification_service.notifications (recipient_user_id, type, title, message, payload, event_id)
         VALUES ($1,'appointment.reminder',$2,$3,$4,$5)
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING RETURNING ${select}`,
        [reminder.recipientUserId, title, message, JSON.stringify({ appointmentId: reminder.appointmentId }),
          `reminder:${reminder.appointmentId}:${scheduledStartAt}`]);
      if (result.rows[0]) await client.query(
        "INSERT INTO notification_service.notification_deliveries (notification_id, channel, status, sent_at) VALUES ($1,'IN_APP','SENT',now())",
        [result.rows[0].id]);
      await client.query(`UPDATE notification_service.appointment_reminders SET status = 'SENT', lease_expires_at = NULL
        WHERE appointment_id = $1 AND scheduled_start_at = $2 AND status = 'PROCESSING'`,
      [reminder.appointmentId, scheduledStartAt]);
      await client.query("COMMIT");
      return true;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async deferReminder(appointmentId: string, scheduledStartAt: string) {
    await this.pool.query(
      `UPDATE notification_service.appointment_reminders
       SET retry_count = retry_count + 1,
       status = CASE WHEN retry_count + 1 >= 3 THEN 'FAILED' ELSE 'PENDING' END,
       next_attempt_at = now() + (LEAST(3600, power(2, retry_count + 1)) * interval '1 second'),
       lease_expires_at = NULL
       WHERE appointment_id = $1 AND scheduled_start_at = $2 AND status = 'PROCESSING'`, [appointmentId, scheduledStartAt]
    );
  }

  async reminderStatusCounts() {
    const result = await this.pool.query<{ status: string; count: string }>(
      "SELECT status, count(*)::text AS count FROM notification_service.appointment_reminders GROUP BY status");
    return Object.fromEntries(result.rows.map(({ status, count }) => [status, Number(count)]));
  }
}
