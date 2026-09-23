import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const appointmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mocks = vi.hoisted(() => ({
  findAll: vi.fn(), findById: vi.fn(), markRead: vi.fn(), createEvent: vi.fn(),
  scheduleReminder: vi.fn(), cancelReminder: vi.fn(), retryDelivery: vi.fn(), dueReminders: vi.fn(), markReminderSent: vi.fn(), deferReminder: vi.fn()
}));
vi.mock("pg", () => ({ Pool: class { query = vi.fn() } }));
vi.mock("../src/repository.js", () => ({ NotificationRepository: class {
  findAll = mocks.findAll; findById = mocks.findById; markRead = mocks.markRead; createEvent = mocks.createEvent;
  scheduleReminder = mocks.scheduleReminder; cancelReminder = mocks.cancelReminder; retryDelivery = mocks.retryDelivery;
  dueReminders = mocks.dueReminders; markReminderSent = mocks.markReminderSent; deferReminder = mocks.deferReminder;
} }));
vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
const { app, dispatchReminders } = await import("../src/index.js");

beforeEach(() => { vi.clearAllMocks(); });

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
    mocks.createEvent.mockResolvedValueOnce({ created: true, notification: { id: appointmentId } }).mockResolvedValueOnce({ created: false, notification: null });
    expect((await request(app).post("/internal/v1/notifications").send(event)).status).toBe(201);
    expect((await request(app).post("/internal/v1/notifications").send(event)).status).toBe(200);
    expect(mocks.scheduleReminder).toHaveBeenCalledWith(expect.objectContaining({ appointmentId, recipientUserId: userId }));
  });

  it("rejects an event without recipient identity", async () => {
    const response = await request(app).post("/internal/v1/notifications").send({ eventId: "event-1", type: "appointment.created", payload: { appointmentId } });
    expect(response.status).toBe(400);
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });
});

describe("Notification reminder worker", () => {
  it("checks appointment status before sending a reminder", async () => {
    const reminder = { appointmentId, patientId: userId, recipientUserId: userId, scheduledStartAt: new Date("2026-10-01T08:00:00.000Z") };
    mocks.dueReminders.mockResolvedValue([reminder]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: { status: "CANCELLED", scheduledStartAt: reminder.scheduledStartAt.toISOString(), patientId: userId } }), { status: 200 })));
    await dispatchReminders();
    expect(mocks.cancelReminder).toHaveBeenCalledWith(appointmentId);
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("defers a reminder if Appointment Service is unavailable", async () => {
    const reminder = { appointmentId, patientId: userId, recipientUserId: userId, scheduledStartAt: new Date("2026-10-01T08:00:00.000Z") };
    mocks.dueReminders.mockResolvedValue([reminder]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await dispatchReminders();
    expect(mocks.deferReminder).toHaveBeenCalledWith(appointmentId);
  });
});
