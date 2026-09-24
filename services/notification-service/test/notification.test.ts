import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { NotificationRepository } from "../src/repository.js";

const notification = { id: "notification-1", recipientUserId: "user-1", type: "appointment.created", title: "Title", message: "Message", payload: {}, status: "UNREAD", createdAt: "2026-01-01" };

function database(created = true) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
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
});
