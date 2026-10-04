import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const appointmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mocks = vi.hoisted(() => ({
  findAll: vi.fn(), findById: vi.fn(), hasProcessedEvent: vi.fn(), markRead: vi.fn(), createEvent: vi.fn(), applyEvent: vi.fn(),
  scheduleReminder: vi.fn(), cancelReminder: vi.fn(), retryDelivery: vi.fn(), claimDueReminders: vi.fn(), deliverClaimedReminder: vi.fn(), markReminderSent: vi.fn(), deferReminder: vi.fn(), reminderStatusCounts: vi.fn()
}));
vi.mock("pg", () => ({ Pool: class { query = vi.fn() } }));
vi.mock("../src/repository.js", () => ({ NotificationRepository: class {
  findAll = mocks.findAll; findById = mocks.findById; hasProcessedEvent = mocks.hasProcessedEvent;
  markRead = mocks.markRead; createEvent = mocks.createEvent; applyEvent = mocks.applyEvent;
  scheduleReminder = mocks.scheduleReminder; cancelReminder = mocks.cancelReminder; retryDelivery = mocks.retryDelivery;
  claimDueReminders = mocks.claimDueReminders; deliverClaimedReminder = mocks.deliverClaimedReminder;
  markReminderSent = mocks.markReminderSent; deferReminder = mocks.deferReminder;
  reminderStatusCounts = mocks.reminderStatusCounts;
} }));
vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
const eventToken = "appointment-notification-event-token-123456";
const lookupToken = "notification-appointment-lookup-token-123456";
vi.stubEnv("NOTIFICATION_INTERNAL_API_TOKEN", eventToken);
vi.stubEnv("APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN", lookupToken);
const { app, dispatchReminders } = await import("../src/index.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasProcessedEvent.mockResolvedValue(false);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: {
    id: appointmentId, patientId: userId, status: "CONFIRMED", scheduledStartAt: "2026-10-01T08:00:00.000Z"
  } }), { status: 200 })));
});

describe("Notification API", () => {
  it("requires an actor for listing", async () => {
    expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
  });

  it("lists only the actor's notifications", async () => {
    mocks.findAll.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    const response = await request(app).get("/api/v1/notifications").set("X-User-Id", userId);
    expect(response.status).toBe(200);
    expect(mocks.findAll).toHaveBeenCalledWith(userId, 1, 20, undefined);
  });

  it("denies another user's notification", async () => {
    mocks.findById.mockResolvedValue({ id: appointmentId, recipientUserId: "other-user" });
    expect((await request(app).get(`/api/v1/notifications/${appointmentId}`).set("X-User-Id", userId)).status).toBe(403);
  });

  it("accepts a new event and returns 200 for a duplicate", async () => {
    const event = { eventId: "event-1", type: "appointment.confirmed", payload: { recipientUserId: userId, patientId: userId, appointmentId, scheduledStartAt: "2026-10-01T08:00:00.000Z" } };
    mocks.applyEvent.mockResolvedValueOnce({ created: true, notification: { id: appointmentId } }).mockResolvedValueOnce({ created: false, notification: null });
    expect((await request(app).post("/internal/v1/notifications").set("X-Internal-Token", eventToken).send(event)).status).toBe(201);
    expect((await request(app).post("/internal/v1/notifications").set("X-Internal-Token", eventToken).send(event)).status).toBe(200);
    expect(mocks.applyEvent).toHaveBeenCalledWith("event-1", expect.any(Object), {
      kind: "schedule", reminder: { appointmentId, patientId: userId, recipientUserId: userId,
        scheduledStartAt: "2026-10-01T08:00:00.000Z" }
    });
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual({ "X-Internal-Token": lookupToken });
  });

  it("rejects an event without recipient identity", async () => {
    const response = await request(app).post("/internal/v1/notifications").set("X-Internal-Token", eventToken)
      .send({ eventId: "event-1", type: "appointment.created", payload: { appointmentId } });
    expect(response.status).toBe(400);
    expect(mocks.applyEvent).not.toHaveBeenCalled();
  });

  it("rejects untrusted event and retry calls", async () => {
    expect((await request(app).post("/internal/v1/notifications").send({})).status).toBe(401);
    expect((await request(app).post("/internal/v1/notifications").set("X-Internal-Token", "bad").send({})).status).toBe(401);
    expect((await request(app).post(`/internal/v1/notifications/${appointmentId}/retry`)).status).toBe(401);
    expect(mocks.applyEvent).not.toHaveBeenCalled();
  });

  it("does not schedule a stale confirmation after appointment cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: {
      id: appointmentId, patientId: userId, status: "CANCELLED", scheduledStartAt: "2026-10-01T08:00:00.000Z"
    } }), { status: 200 })));
    mocks.applyEvent.mockResolvedValue({ created: true, notification: null });
    const response = await request(app).post("/internal/v1/notifications").set("X-Internal-Token", eventToken)
      .send({ eventId: "old-event", type: "appointment.confirmed", payload: { recipientUserId: userId,
        patientId: userId, appointmentId, scheduledStartAt: "2026-10-01T08:00:00.000Z" } });
    expect(response.status).toBe(201);
    expect(mocks.applyEvent).toHaveBeenCalledWith("old-event", null, { kind: "none" });
  });

  it("acknowledges a processed event even if Appointment is unavailable", async () => {
    mocks.hasProcessedEvent.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const response = await request(app).post("/internal/v1/notifications").set("X-Internal-Token", eventToken)
      .send({ eventId: "event-1", type: "appointment.confirmed", payload: { recipientUserId: userId,
        patientId: userId, appointmentId, scheduledStartAt: "2026-10-01T08:00:00.000Z" } });
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.applyEvent).not.toHaveBeenCalled();
  });

  it("defers event ingestion when Appointment lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const response = await request(app).post("/internal/v1/notifications").set("X-Internal-Token", eventToken)
      .send({ eventId: "event-1", type: "appointment.confirmed", payload: { recipientUserId: userId,
        patientId: userId, appointmentId, scheduledStartAt: "2026-10-01T08:00:00.000Z" } });
    expect(response.status).toBe(503);
    expect(mocks.applyEvent).not.toHaveBeenCalled();
  });
});

describe("Notification reminder worker", () => {
  it("checks appointment status before sending a reminder", async () => {
    const reminder = { appointmentId, patientId: userId, recipientUserId: userId, scheduledStartAt: new Date("2026-10-01T08:00:00.000Z") };
    mocks.claimDueReminders.mockResolvedValue([reminder]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: { id: appointmentId, status: "CANCELLED", scheduledStartAt: reminder.scheduledStartAt.toISOString(), patientId: userId } }), { status: 200 })));
    await dispatchReminders();
    expect(mocks.cancelReminder).toHaveBeenCalledWith(appointmentId, reminder.scheduledStartAt.toISOString());
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("defers a reminder if Appointment Service is unavailable", async () => {
    const reminder = { appointmentId, patientId: userId, recipientUserId: userId, scheduledStartAt: new Date("2026-10-01T08:00:00.000Z") };
    mocks.claimDueReminders.mockResolvedValue([reminder]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await dispatchReminders();
    expect(mocks.deferReminder).toHaveBeenCalledWith(appointmentId, reminder.scheduledStartAt.toISOString());
  });
});
