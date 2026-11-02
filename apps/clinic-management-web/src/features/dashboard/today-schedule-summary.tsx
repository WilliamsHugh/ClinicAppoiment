"use client";

import React from "react";
import Link from "next/link";
import { Button } from "../../components/ui";
import type { Session } from "../../lib/session/session";
import styles from "./dashboard.module.css";

export interface TodayScheduleSummaryProps {
  session: Session;
  now: Date;
  loading: boolean;
  onRefresh: () => void;
  children?: React.ReactNode;
}

export function formatVietnamTime(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatVietnamDate(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatPatientDisplay(patientName?: string | null, patientId?: string): string {
  if (patientName && patientName.trim()) {
    return patientName.trim();
  }
  if (patientId) {
    const cleanId = patientId.replace(/-/g, "");
    const last4 = cleanId.slice(-4).toUpperCase();
    return `Bệnh nhân #${last4}`;
  }
  return "Bệnh nhân";
}

export function TodayScheduleSummary({
  session,
  now,
  loading,
  onRefresh,
  children,
}: TodayScheduleSummaryProps) {
  const role = session.identity?.role || "STAFF";
  const roleLabel =
    role === "DOCTOR"
      ? "Bác sĩ"
      : role === "ADMIN"
      ? "Quản trị viên"
      : "Nhân viên phòng khám";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Welcome Banner */}
      <header className={styles.welcomeBanner}>
        <div className={styles.welcomeText}>
          <h1>Xin chào, {session.identity?.displayName || "Đồng nghiệp"}</h1>
          <p>
            {formatVietnamDate(now)} · {formatVietnamTime(now.toISOString())} (Giờ Việt Nam UTC+7)
          </p>
        </div>
        <div className={styles.welcomeMeta}>
          <div className={styles.roleBadge}>
            <span className={styles.roleDot} aria-hidden="true" />
            <span>{roleLabel}</span>
          </div>
        </div>
      </header>

      {/* Quick Actions Bar */}
      <nav aria-label="Thao tác nhanh" className={styles.quickActions}>
        <Link href="/appointments">
          <Button variant="primary">Hàng đợi khám</Button>
        </Link>
        {role === "DOCTOR" && (
          <Link href="/medical-records">
            <Button variant="secondary">Hồ sơ bệnh án</Button>
          </Link>
        )}
        {(role === "STAFF" || role === "ADMIN") && (
          <Link href="/doctors">
            <Button variant="secondary">Lịch bác sĩ</Button>
          </Link>
        )}
        {role === "ADMIN" && (
          <>
            <Link href="/users">
              <Button variant="secondary">Quản trị người dùng</Button>
            </Link>
            <Link href="/health">
              <Button variant="secondary">Sức khỏe hệ thống</Button>
            </Link>
          </>
        )}
        <Button variant="ghost" onClick={onRefresh} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới dữ liệu"}
        </Button>
      </nav>

      {children}
    </div>
  );
}
