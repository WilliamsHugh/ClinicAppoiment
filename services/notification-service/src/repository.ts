import { randomUUID } from "crypto";

export type Notification = {
  id: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  payload?: unknown;
  status: "UNREAD" | "READ" | "FAILED";
  readAt?: string;
  createdAt: string;
  eventId?: string;
};

export type NotificationDelivery = {
  id: string;
  notificationId: string;
  channel: "IN_APP" | "EMAIL" | "SMS";
  status: "PENDING" | "SENT" | "FAILED";
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
  retryCount: number;
};

export class NotificationRepository {
  private readonly notifications: Notification[] = [];
  private readonly deliveries: NotificationDelivery[] = [];
  private readonly eventIds = new Set<string>();

  // NOTIFY-001: schema notification_service, migration riêng
  // NOTIFY-002: dedup theo eventId

  findAll(filters: { recipientUserId?: string; status?: string }) {
    return this.notifications.filter((notification) => {
      if (filters.recipientUserId && notification.recipientUserId !== filters.recipientUserId) return false;
      if (filters.status && notification.status !== filters.status) return false;
      return true;
    });
  }

  findById(id: string) {
    return this.notifications.find((notification) => notification.id === id);
  }

  hasEvent(eventId: string) {
    return this.eventIds.has(eventId);
  }

  create(input: Omit<Notification, "id" | "status" | "createdAt"> & { eventId?: string }) {
    const notification: Notification = {
      id: randomUUID(),
      ...input,
      status: "UNREAD",
      createdAt: new Date().toISOString()
    };
    if (input.eventId) {
      this.eventIds.add(input.eventId);
      notification.eventId = input.eventId;
    }
    this.notifications.unshift(notification);
    this.deliveries.push({
      id: randomUUID(),
      notificationId: notification.id,
      channel: "IN_APP",
      status: "SENT",
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      retryCount: 0
    });
    return notification;
  }

  markRead(id: string, actorId: string) {
    const notification = this.findById(id);
    if (!notification) return null;
    if (notification.recipientUserId !== actorId) return null;
    notification.status = "READ";
    notification.readAt = new Date().toISOString();
    return notification;
  }

  markFailed(notificationId: string, errorMessage: string) {
    const d = this.deliveries.find((x) => x.notificationId === notificationId);
    if (d) {
      d.status = "FAILED";
      d.errorMessage = errorMessage;
    }
    const n = this.findById(notificationId);
    if (n) n.status = "FAILED";
  }

  retryDelivery(notificationId: string) {
    const d = this.deliveries.find((x) => x.notificationId === notificationId);
    if (!d) return null;
    if (d.retryCount >= 3) return null;
    d.retryCount += 1;
    d.status = "SENT";
    d.sentAt = new Date().toISOString();
    return d;
  }

  getDeliveries(notificationId: string) {
    return this.deliveries.filter((d) => d.notificationId === notificationId);
  }
}
