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
};

export type NotificationDelivery = {
  id: string;
  notificationId: string;
  channel: "IN_APP" | "EMAIL" | "SMS";
  status: "PENDING" | "SENT" | "FAILED";
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
};

export class NotificationRepository {
  private readonly notifications: Notification[] = [];
  private readonly deliveries: NotificationDelivery[] = [];

  findAll(recipientUserId?: string) {
    return this.notifications.filter((notification) => {
      return !recipientUserId || notification.recipientUserId === recipientUserId;
    });
  }

  findById(id: string) {
    return this.notifications.find((notification) => notification.id === id);
  }

  create(input: Omit<Notification, "id" | "status" | "createdAt">) {
    const notification: Notification = {
      id: randomUUID(),
      ...input,
      status: "UNREAD",
      createdAt: new Date().toISOString()
    };
    this.notifications.unshift(notification);
    this.deliveries.push({
      id: randomUUID(),
      notificationId: notification.id,
      channel: "IN_APP",
      status: "SENT",
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
    return notification;
  }

  markRead(id: string) {
    const notification = this.findById(id);
    if (!notification) return null;
    notification.status = "READ";
    notification.readAt = new Date().toISOString();
    return notification;
  }
}
