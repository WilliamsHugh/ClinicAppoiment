import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { NotificationRepository } from "../src/repository.js";

const notification = { id: "notification-1", recipientUserId: "user-1", type: "appointment.created", title: "Title", message: "Message", payload: {}, status: "UNREAD", createdAt: "2026-01-01" };

function database(created = true, failReminder = false, claimed = true) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes("INSERT INTO notification_service.processed_events")) return { rows: created ? [{ event_id: "event-1" }] : [] };
    if (sql.includes("SELECT appointment_id FROM notification_service.appointment_reminders"))
      return { rows: claimed ? [{ appointment_id: "appointment-1" }] : [] };
    if (failReminder && sql.includes("INSERT INTO notification_service.appointment_reminders")) throw new Error("reminder failed");
    if (sql.includes("INSERT INTO notification_service.notifications")) return { rows: created ? [notification] : [] };
    if (sql.includes("UPDATE notification_service.notifications")) return { rows: values?.[1] === "user-1" ? [notification] : [] };
    if (sql.includes("count(*)")) return { rows: [{ count: "1" }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) } as unknown as Pool;
  return { repo: new NotificationRepository(pool), queries, client };
}

describe("Notification PostgreSQL repository", () => {
  it("stores event and delivery together using database dedup", async () => {
    const db = database();
    const result = await db.repo.createEvent("event-1", { recipientUserId: "user-1", type: "appointment.created", title: "Title", message: "Message", payload: {} });
    expect(result.created).toBe(true);
    expect(db.queries.find((item) => item.sql.includes("INSERT INTO notification_service.notifications"))?.sql).toContain("ON CONFLICT (event_id)");
    expect(db.queries.some((item) => item.sql.includes("notification_deliveries"))).toBe(true);
    expect(db.queries.some((item) => item.sql === "COMMIT")).toBe(true);
  });

  it("does not create another delivery for an existing event", async () => {
    const db = database(false);
    const result = await db.repo.createEvent("event-1", { recipientUserId: "user-1", type: "appointment.created", title: "Title", message: "Message", payload: {} });
    expect(result.created).toBe(false);
    expect(db.queries.some((item) => item.sql.includes("notification_deliveries"))).toBe(false);
  });

  it("marks a notification read only for its recipient", async () => {
    const db = database();
    expect(await db.repo.markRead("notification-1", "user-2")).toBeNull();
    expect(await db.repo.markRead("notification-1", "user-1")).toEqual(notification);
    expect(db.queries.at(-1)?.sql).toContain("recipient_user_id = $2");
  });

  it("uses the appointment id as a unique reminder key", async () => {
    const db = database();
    await db.repo.scheduleReminder({ appointmentId: "appointment-1", patientId: "patient-1", recipientUserId: "user-1", scheduledStartAt: "2026-01-02T08:00:00Z" });
    expect(db.queries[0].sql).toContain("ON CONFLICT (appointment_id)");
    expect(db.queries[0].values?.[0]).toBe("appointment-1");
  });

  it("commits event, notification, delivery and reminder in one transaction", async () => {
    const db = database();
    const result = await db.repo.applyEvent("event-1", { recipientUserId: "user-1", type: "appointment.confirmed",
      title: "Title", message: "Message", payload: {} }, { kind: "schedule", reminder: {
      appointmentId: "appointment-1", patientId: "patient-1", recipientUserId: "user-1",
      scheduledStartAt: "2026-01-02T08:00:00Z" } });
    expect(result.created).toBe(true);
    expect(db.queries.map((item) => item.sql)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(db.queries.some((item) => item.sql.includes("notification_deliveries"))).toBe(true);
    expect(db.queries.find((item) => item.sql.includes("INSERT INTO notification_service.appointment_reminders"))?.sql)
      .toContain("scheduled_start_at IS DISTINCT FROM");
  });

  it("does not repeat reminder side effects for a duplicate event", async () => {
    const db = database(false);
    const result = await db.repo.applyEvent("event-1", { recipientUserId: "user-1", type: "appointment.confirmed",
      title: "Title", message: "Message", payload: {} }, { kind: "cancel", appointmentId: "appointment-1" });
    expect(result.created).toBe(false);
    expect(db.queries.some((item) => item.sql.includes("appointment_reminders"))).toBe(false);
  });

  it("rolls back every side effect if scheduling fails", async () => {
    const db = database(true, true);
    await expect(db.repo.applyEvent("event-1", { recipientUserId: "user-1", type: "appointment.confirmed",
      title: "Title", message: "Message", payload: {} }, { kind: "schedule", reminder: {
      appointmentId: "appointment-1", patientId: "patient-1", recipientUserId: "user-1",
      scheduledStartAt: "2026-01-02T08:00:00Z" } })).rejects.toThrow("reminder failed");
    expect(db.queries.some((item) => item.sql === "ROLLBACK")).toBe(true);
    expect(db.queries.some((item) => item.sql === "COMMIT")).toBe(false);
  });

  it("claims due reminders with a lease and skip locked", async () => {
    const db = database();
    await db.repo.claimDueReminders();
    const sql = db.queries[0].sql;
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("lease_expires_at <= now()");
    expect(sql).toContain("status = 'PROCESSING'");
  });

  it("delivers a claimed reminder and marks it sent in one transaction", async () => {
    const db = database();
    const delivered = await db.repo.deliverClaimedReminder({ appointmentId: "appointment-1",
      patientId: "patient-1", recipientUserId: "user-1", scheduledStartAt: new Date("2026-01-02T08:00:00Z") },
    "Reminder", "Visit soon");
    expect(delivered).toBe(true);
    expect(db.queries.some((item) => item.sql.includes("FOR UPDATE"))).toBe(true);
    expect(db.queries.some((item) => item.sql.includes("appointment.reminder"))).toBe(true);
    expect(db.queries.some((item) => item.sql.includes("SET status = 'SENT'"))).toBe(true);
    expect(db.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("does not send after the claimed reminder was cancelled", async () => {
    const db = database(true, false, false);
    const delivered = await db.repo.deliverClaimedReminder({ appointmentId: "appointment-1",
      patientId: "patient-1", recipientUserId: "user-1", scheduledStartAt: new Date("2026-01-02T08:00:00Z") },
    "Reminder", "Visit soon");
    expect(delivered).toBe(false);
    expect(db.queries.some((item) => item.sql.includes("INSERT INTO notification_service.notifications"))).toBe(false);
  });
});
