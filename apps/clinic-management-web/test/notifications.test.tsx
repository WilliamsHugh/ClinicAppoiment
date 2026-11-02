import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NotificationsPage from "../app/notifications/page";
import {
  Notification,
  NotificationItem,
  getNotificationBadgeConfig,
  notificationTarget,
} from "../src/features/notifications/notification-item";
import type { Session } from "../src/lib/session/session";

Object.assign(globalThis, { React });

let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

describe("Notification Badge & Target Mapping", () => {
  it("maps notification types to correct badge variant and label per design contract", () => {
    // Xác nhận lịch hẹn -> primary
    const confirmed = getNotificationBadgeConfig("appointment.confirmed");
    expect(confirmed.label).toBe("Xác nhận");
    expect(confirmed.variant).toBe("primary");

    // Hủy lịch hẹn -> danger
    const cancelled = getNotificationBadgeConfig("appointment.cancelled");
    expect(cancelled.label).toBe("Hủy lịch");
    expect(cancelled.variant).toBe("danger");

    // Thay đổi lịch hẹn -> warning
    const rescheduled = getNotificationBadgeConfig("appointment.rescheduled");
    expect(rescheduled.label).toBe("Thay đổi");
    expect(rescheduled.variant).toBe("warning");

    // Nhắc nhở -> info
    const reminder = getNotificationBadgeConfig("appointment.reminder");
    expect(reminder.label).toBe("Nhắc nhở");
    expect(reminder.variant).toBe("info");

    // Kết quả khám / Hồ sơ sẵn sàng -> success
    const record = getNotificationBadgeConfig("medical-record.created");
    expect(record.label).toBe("Kết quả");
    expect(record.variant).toBe("success");
  });

  it("resolves target navigation links for medical records and appointments", () => {
    const recordLink = notificationTarget({ recordId: "rec-123" });
    expect(recordLink).not.toBeNull();
    expect(recordLink?.href).toBe("/medical-records?recordId=rec-123");
    expect(recordLink?.label).toBe("Xem hồ sơ khám →");

    const apptLink = notificationTarget({ appointmentId: "appt-456" });
    expect(apptLink).not.toBeNull();
    expect(apptLink?.href).toBe("/appointments?id=appt-456");
    expect(apptLink?.label).toBe("Xem lịch hẹn →");

    const emptyLink = notificationTarget(null);
    expect(emptyLink).toBeNull();
  });
});

describe("NotificationItem Component", () => {
  it("renders unread notification with highlight, unread dot, and mark-read button", () => {
    const item: Notification = {
      id: "notif-1",
      type: "appointment.confirmed",
      title: "Lịch hẹn đã được xác nhận",
      message: "Bác sĩ Nguyễn Văn A đã xác nhận lịch khám của bạn lúc 09:00.",
      status: "UNREAD",
      createdAt: "2026-11-02T09:00:00.000Z",
      payload: { appointmentId: "appt-1" },
    };

    const html = renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: item,
        onMarkRead: () => {},
      })
    );

    expect(html).toContain("Lịch hẹn đã được xác nhận");
    expect(html).toContain("Xác nhận");
    expect(html).toContain("Chưa đọc");
    expect(html).toContain("Đánh dấu đã đọc");
    expect(html).toContain("Xem lịch hẹn →");
  });

  it("renders read notification without unread action button", () => {
    const item: Notification = {
      id: "notif-2",
      type: "medical-record.created",
      title: "Hồ sơ bệnh án đã hoàn thành",
      message: "Bác sĩ đã tạo đơn thuốc và phác đồ điều trị cho bạn.",
      status: "READ",
      createdAt: "2026-11-02T10:00:00.000Z",
      payload: { recordId: "rec-1" },
    };

    const html = renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: item,
        onMarkRead: () => {},
      })
    );

    expect(html).toContain("Hồ sơ bệnh án đã hoàn thành");
    expect(html).toContain("Kết quả");
    expect(html).toContain("Đã đọc");
    expect(html).not.toContain("Đánh dấu đã đọc");
    expect(html).toContain("Xem hồ sơ khám →");
  });
});

describe("NotificationsPage Orchestration", () => {
  it("renders login required error when session is unauthenticated", () => {
    currentSession = {
      status: "unauthenticated",
      identity: null,
      getAccessToken: async () => null,
      signIn: async () => {},
      signOut: async () => {},
    };

    const html = renderToStaticMarkup(React.createElement(NotificationsPage));
    expect(html).toContain("Bạn cần đăng nhập để truy cập trang thông báo.");
  });

  it("renders notification page layout and filter controls when authenticated", () => {
    currentSession = {
      status: "authenticated",
      identity: { id: "user-1", role: "STAFF", displayName: "Nguyễn Văn Tiếp Đón" },
      getAccessToken: async () => "valid-token",
      signIn: async () => {},
      signOut: async () => {},
    };

    const html = renderToStaticMarkup(React.createElement(NotificationsPage));
    expect(html).toContain("Thông báo");
    expect(html).toContain("Tất cả");
    expect(html).toContain("Chưa đọc");
    expect(html).toContain("Đã đọc");
  });
});
