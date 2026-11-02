"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button } from "../../components/ui";
import styles from "./notifications-panel.module.css";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  status: "UNREAD" | "READ" | "FAILED";
  createdAt: string;
  payload?: unknown;
}

export interface NotificationItemProps {
  notification: Notification;
  onMarkRead?: (id: string) => Promise<void> | void;
  isMarkingRead?: boolean;
}

/**
 * Cấu hình Type badge theo bảng quy chuẩn hợp đồng:
 * | Type | Màu badge | Label |
 * |---|---|---|
 * | Xác nhận lịch hẹn | primary | Xác nhận |
 * | Hủy lịch hẹn | danger | Hủy lịch |
 * | Thay đổi lịch hẹn | warning | Thay đổi |
 * | Nhắc nhở | info | Nhắc nhở |
 * | Hồ sơ sẵn sàng | success | Kết quả |
 */
export function getNotificationBadgeConfig(type: string): {
  label: string;
  variant: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
} {
  const lower = type.toLowerCase();

  // 1. Hồ sơ sẵn sàng / Kết quả khám
  if (
    lower.includes("record") ||
    lower.includes("medical") ||
    lower.includes("hồ sơ") ||
    lower.includes("kết quả")
  ) {
    return { label: "Kết quả", variant: "success" };
  }

  // 2. Hủy lịch hẹn
  if (lower.includes("cancel") || lower.includes("hủy")) {
    return { label: "Hủy lịch", variant: "danger" };
  }

  // 3. Xác nhận lịch hẹn
  if (lower.includes("confirm") || lower.includes("xác nhận")) {
    return { label: "Xác nhận", variant: "primary" };
  }

  // 4. Nhắc nhở lịch hẹn
  if (lower.includes("remind") || lower.includes("nhắc")) {
    return { label: "Nhắc nhở", variant: "info" };
  }

  // 5. Thay đổi lịch hẹn / lịch mới
  if (
    lower.includes("reschedule") ||
    lower.includes("change") ||
    lower.includes("thay đổi") ||
    lower.includes("created") ||
    lower.includes("pending")
  ) {
    return { label: "Thay đổi", variant: "warning" };
  }

  if (lower.includes("checked_in") || lower.includes("tiếp đón")) {
    return { label: "Tiếp đón", variant: "info" };
  }

  return { label: type, variant: "neutral" };
}

export function notificationTarget(payload: unknown): { href: string; label: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.recordId === "string") {
    return {
      href: `/medical-records?recordId=${encodeURIComponent(data.recordId)}`,
      label: "Xem hồ sơ khám →",
    };
  }
  if (typeof data.appointmentId === "string") {
    return {
      href: `/appointments?id=${encodeURIComponent(data.appointmentId)}`,
      label: "Xem lịch hẹn →",
    };
  }
  return null;
}

export function formatNotificationTime(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

export function NotificationItem({
  notification,
  onMarkRead,
  isMarkingRead = false,
}: NotificationItemProps) {
  const isUnread = notification.status === "UNREAD";
  const badgeConfig = getNotificationBadgeConfig(notification.type);
  const target = notificationTarget(notification.payload);

  return (
    <article
      className={`${styles.notificationCard} ${
        isUnread ? styles.notificationCardUnread : styles.notificationCardRead
      }`}
      role="article"
      aria-label={`Thông báo: ${notification.title}`}
    >
      <div className={styles.notificationContent}>
        <div className={styles.notificationHeader}>
          {isUnread && <span className={styles.unreadDot} aria-hidden="true" title="Chưa đọc" />}
          <Badge variant={badgeConfig.variant} size="sm">
            {badgeConfig.label}
          </Badge>
          <Badge variant={isUnread ? "warning" : "neutral"} size="sm">
            {isUnread ? "Chưa đọc" : "Đã đọc"}
          </Badge>
          <h2
            className={`${styles.notificationTitle} ${
              isUnread ? styles.notificationTitleUnread : ""
            }`}
          >
            {notification.title}
          </h2>
        </div>

        <p className={styles.notificationMessage}>{notification.message}</p>

        {target && (
          <div>
            <Link href={target.href} className={styles.targetLink}>
              {target.label}
            </Link>
          </div>
        )}

        <div className={styles.notificationMeta}>
          <time dateTime={notification.createdAt}>
            {formatNotificationTime(notification.createdAt)}
          </time>
          <span aria-hidden="true">•</span>
          <span>Mã sự kiện: {notification.type}</span>
        </div>
      </div>

      <div className={styles.actionButtons}>
        {isUnread && onMarkRead && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMarkRead(notification.id)}
            loading={isMarkingRead}
            disabled={isMarkingRead}
            aria-label={`Đánh dấu đã đọc thông báo: ${notification.title}`}
          >
            Đánh dấu đã đọc
          </Button>
        )}
      </div>
    </article>
  );
}
