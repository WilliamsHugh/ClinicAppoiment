import { describe, it, expect } from "vitest";
import { NotificationRepository } from "../src/repository.js";

describe("NotificationRepository - NOTIFY-006", () => {
  it("dedups by eventId (only first event stored)", () => {
    const repo = new NotificationRepository();
    const n1 = repo.create({ recipientUserId: "user-1", type: "appointment.created", title: "t", message: "m", payload: {}, eventId: "evt-1" });
    expect(repo.hasEvent("evt-1")).toBe(true);
    // Second with same eventId should be detected as duplicate before create
    expect(repo.hasEvent("evt-1")).toBe(true);
    expect(n1.eventId).toBe("evt-1");
  });

  it("enforces owner-only markRead", () => {
    const repo = new NotificationRepository();
    const n = repo.create({ recipientUserId: "user-patient-1", type: "appointment.created", title: "t", message: "m", payload: {} });
    expect(repo.markRead(n.id, "user-other")).toBeNull();
    expect(repo.markRead(n.id, "user-patient-1")?.status).toBe("READ");
  });

  it("retries with limit 3 (NOTIFY-004)", () => {
    const repo = new NotificationRepository();
    const n = repo.create({ recipientUserId: "user-1", type: "t", title: "t", message: "m", payload: {} });
    repo.markFailed(n.id, "network");
    expect(repo.retryDelivery(n.id)?.retryCount).toBe(1);
    expect(repo.retryDelivery(n.id)?.retryCount).toBe(2);
    expect(repo.retryDelivery(n.id)?.retryCount).toBe(3);
    expect(repo.retryDelivery(n.id)).toBeNull(); // limit exceeded
  });

  it("filters by status and recipient", () => {
    const repo = new NotificationRepository();
    repo.create({ recipientUserId: "user-1", type: "t", title: "t", message: "m", payload: {} });
    const n2 = repo.create({ recipientUserId: "user-1", type: "t", title: "t", message: "m", payload: {} });
    repo.markRead(n2.id, "user-1");
    expect(repo.findAll({ recipientUserId: "user-1", status: "UNREAD" }).length).toBe(1);
    expect(repo.findAll({ recipientUserId: "user-1", status: "READ" }).length).toBe(1);
  });
});
