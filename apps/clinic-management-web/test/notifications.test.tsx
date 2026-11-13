import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NotificationsPage from "../app/notifications/page";
import { AppShell } from "../src/components/app-shell";
import {
  Notification,
  NotificationItem,
  getNotificationBadgeConfig,
  notificationTarget,
} from "../src/features/notifications/notification-item";
import {
  NotificationProvider,
  NotificationContext,
} from "../src/features/notifications/notification-context";
import type { Session } from "../src/lib/session/session";

Object.assign(globalThis, { React });

let mockPathname = "/notifications";
let currentSession: Session;

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

let mockPathname = "/notifications";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

    // Xét nghiệm / Lab result -> success
    const lab = getNotificationBadgeConfig("lab.result");
    expect(lab.label).toBe("Kết quả");
    expect(lab.variant).toBe("success");

    const clinicalTest = getNotificationBadgeConfig("xét nghiệm máu");
    expect(clinicalTest.label).toBe("Kết quả");
    expect(clinicalTest.variant).toBe("success");

    // Phân công lịch khám cho bác sĩ -> primary
    const assigned = getNotificationBadgeConfig("doctor.assigned");
    expect(assigned.label).toBe("Phân công");
    expect(assigned.variant).toBe("primary");
  });

  it("resolves target navigation links for medical records and appointments based on role", () => {
    // DOCTOR gets access to /medical-records link
    const doctorRecordLink = notificationTarget({ recordId: "rec-123" }, "DOCTOR");
    expect(doctorRecordLink).not.toBeNull();
    expect(doctorRecordLink?.href).toBe("/medical-records?recordId=rec-123");
    expect(doctorRecordLink?.label).toBe("Xem hồ sơ khám →");

    // STAFF and ADMIN do NOT get access to clinical /medical-records link
    const staffRecordLink = notificationTarget({ recordId: "rec-123" }, "STAFF");
    expect(staffRecordLink).toBeNull();

    const adminRecordLink = notificationTarget({ recordId: "rec-123" }, "ADMIN");
    expect(adminRecordLink).toBeNull();

    const apptLink = notificationTarget({ appointmentId: "appt-456" }, "STAFF");
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

  it("renders notification page for all authorized roles: DOCTOR, STAFF, ADMIN", () => {
    const roles = ["DOCTOR", "STAFF", "ADMIN"] as const;
    for (const role of roles) {
      currentSession = {
        status: "authenticated",
        identity: { id: `user-${role}`, role, displayName: `Test ${role}` },
        getAccessToken: async () => "valid-token",
        signIn: async () => {},
        signOut: async () => {},
      };

      const html = renderToStaticMarkup(React.createElement(NotificationsPage));
      expect(html).toContain("Thông báo");
      expect(html).toContain("Theo dõi các sự kiện lịch hẹn");
      expect(html).toContain("Đánh dấu tất cả đã đọc");
    }
  });

  it("synchronizes notification badge with panel using shared data source", () => {
    currentSession = {
      status: "authenticated",
      identity: { id: "user-1", role: "DOCTOR", displayName: "BS. Nguyễn Văn A" },
      getAccessToken: async () => "valid-token",
      signIn: async () => {},
      signOut: async () => {},
    };

    // When unreadCount is 0, no badge rendered
    const htmlZero = renderToStaticMarkup(
      <NotificationContext.Provider
        value={{
          unreadCount: 0,
          isLoading: false,
          loading: false,
          refreshUnreadCount: async () => {},
          decrementUnreadCount: () => {},
          setUnreadCount: () => {},
          markAsRead: async () => {},
          markAllAsRead: async () => {},
        }}
      >
        <AppShell>Page Content</AppShell>
      </NotificationContext.Provider>
    );
    expect(htmlZero).not.toContain("data-testid=\"notification-badge\"");

    // When unreadCount is 5, badge renders '5'
    const htmlFive = renderToStaticMarkup(
      <NotificationContext.Provider
        value={{
          unreadCount: 5,
          isLoading: false,
          loading: false,
          refreshUnreadCount: async () => {},
          decrementUnreadCount: () => {},
          setUnreadCount: () => {},
          markAsRead: async () => {},
          markAllAsRead: async () => {},
        }}
      >
        <AppShell>Page Content</AppShell>
      </NotificationContext.Provider>
    );
    expect(htmlFive).toContain("data-testid=\"notification-badge\"");
    expect(htmlFive).toContain("5 thông báo chưa đọc");
    expect(htmlFive).toContain(">5<");
  });
});

describe("Header Badge & Notification Center Shared Source of Truth", () => {
  it("displays identical unread badge count in header and panel when count > 0", () => {
    currentSession = {
      status: "authenticated",
      identity: { id: "doc-1", role: "DOCTOR", displayName: "BS. Trần Văn H" },
      getAccessToken: async () => "valid-token",
      signIn: async () => {},
      signOut: async () => {},
    };

    const contextValue = {
      unreadCount: 7,
      isLoading: false,
      loading: false,
      error: null,
      refreshUnreadCount: async () => {},
      setUnreadCount: () => {},
      decrementUnreadCount: () => {},
      markAllReadSuccess: () => {},
    };

    // 1. AppShell topbar renders unread badge "7"
    const shellHtml = renderToStaticMarkup(
      React.createElement(
        NotificationContext.Provider,
        { value: contextValue },
        React.createElement(AppShell, null, "Main Content")
      )
    );
    expect(shellHtml).toContain("Thông báo (7 chưa đọc)");
    expect(shellHtml).toContain("7");

    // 2. NotificationsPage renders "Chưa đọc (7)"
    const pageHtml = renderToStaticMarkup(
      React.createElement(
        NotificationContext.Provider,
        { value: contextValue },
        React.createElement(NotificationsPage)
      )
    );
    expect(pageHtml).toContain("Chưa đọc (7)");
  });

  it("does not render unread badge when unreadCount is 0", () => {
    currentSession = {
      status: "authenticated",
      identity: { id: "admin-1", role: "ADMIN", displayName: "Admin Quản Trị" },
      getAccessToken: async () => "valid-token",
      signIn: async () => {},
      signOut: async () => {},
    };

    const contextValue = {
      unreadCount: 0,
      isLoading: false,
      loading: false,
      error: null,
      refreshUnreadCount: async () => {},
      setUnreadCount: () => {},
      decrementUnreadCount: () => {},
      markAllReadSuccess: () => {},
    };

    const shellHtml = renderToStaticMarkup(
      React.createElement(
        NotificationContext.Provider,
        { value: contextValue },
        React.createElement(AppShell, null, "Main Content")
      )
    );
    expect(shellHtml).toContain("Thông báo");
    expect(shellHtml).not.toContain("Thông báo (0 chưa đọc)");
    expect(shellHtml).not.toContain("notificationBadge");

    const pageHtml = renderToStaticMarkup(
      React.createElement(
        NotificationContext.Provider,
        { value: contextValue },
        React.createElement(NotificationsPage)
      )
    );
    // Tab "Chưa đọc" without number suffix when count is 0
    expect(pageHtml).toContain("Chưa đọc");
    expect(pageHtml).not.toContain("Chưa đọc (0)");
  });

  it("renders badge skeleton while unreadCount is loading instead of defaulting to 0 or fake count", () => {
    currentSession = {
      status: "authenticated",
      identity: { id: "staff-1", role: "STAFF", displayName: "Tiếp Đón 1" },
      getAccessToken: async () => "valid-token",
      signIn: async () => {},
      signOut: async () => {},
    };

    const contextValue = {
      unreadCount: null,
      isLoading: true,
      loading: true,
      error: null,
      refreshUnreadCount: async () => {},
      setUnreadCount: () => {},
      decrementUnreadCount: () => {},
      markAllReadSuccess: () => {},
    };

    const shellHtml = renderToStaticMarkup(
      React.createElement(
        NotificationContext.Provider,
        { value: contextValue },
        React.createElement(AppShell, null, "Main Content")
      )
    );
    expect(shellHtml).toContain("notificationBadgeSkeleton");
    expect(shellHtml).not.toContain("Thông báo (0 chưa đọc)");
  });
});
