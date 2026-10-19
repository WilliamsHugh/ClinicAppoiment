"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "../src/lib/session/session-context";
import { createBrowserApiClient, type PaginatedData } from "../src/lib/api/client";
import { Button, Badge, Skeleton } from "../src/components/ui";
import { ErrorState } from "../src/components/states";
import styles from "./dashboard.module.css";

interface AppointmentItem {
  id: string;
  patientId: string;
  doctorId: string;
  specialtyId?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  reason?: string;
}

interface DayVolume {
  dateLabel: string;
  count: number;
  isToday: boolean;
}

function formatVietnamTime(iso: string) {
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

function formatVietnamDate(d: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
}

function statusBadge(status: AppointmentItem["status"]) {
  switch (status) {
    case "PENDING":
      return <Badge variant="warning">Chờ xác nhận</Badge>;
    case "CONFIRMED":
      return <Badge variant="info">Đã xác nhận</Badge>;
    case "CHECKED_IN":
      return <Badge variant="info">Đã tiếp đón</Badge>;
    case "COMPLETED":
      return <Badge variant="success">Hoàn thành</Badge>;
    case "CANCELLED":
      return <Badge variant="danger">Đã hủy</Badge>;
    case "NO_SHOW":
      return <Badge variant="neutral">Vắng mặt</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

export default function ClinicDashboardPage() {
  const session = useSession();
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    if (session.status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const api = createBrowserApiClient(session);
      const res = await api.get<PaginatedData<AppointmentItem>>("/api/v1/appointments", {
        query: { page: 1, limit: 50 },
      });
      setAppointments(res.data.items || []);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể tải dữ liệu lịch hẹn phòng khám."
      );
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void loadData();
    } else if (session.status === "unauthenticated") {
      setLoading(false);
    }
  }, [session.status, loadData]);

  // Calculations
  const stats = useMemo(() => {
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const todayAppts = appointments.filter((item) => {
      try {
        const itemDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(item.scheduledStartAt));
        return itemDate === todayStr;
      } catch {
        return false;
      }
    });

    const activeList = todayAppts.length ? todayAppts : appointments;

    const waiting = activeList.filter((a) =>
      ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(a.status)
    ).length;
    const completed = activeList.filter((a) => a.status === "COMPLETED").length;
    const cancelled = activeList.filter((a) =>
      ["CANCELLED", "NO_SHOW"].includes(a.status)
    ).length;

    return {
      total: activeList.length,
      waiting,
      completed,
      cancelled,
      todayAppts: todayAppts.slice(0, 5),
    };
  }, [appointments, now]);

  // 7-day mini chart
  const dayVolumes = useMemo<DayVolume[]>(() => {
    const result: DayVolume[] = [];
    const today = new Date(now);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);

      const dayName = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        weekday: "short",
      }).format(d);

      const count = appointments.filter((item) => {
        try {
          const itemDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(item.scheduledStartAt));
          return itemDate === dateKey;
        } catch {
          return false;
        }
      }).length;

      result.push({
        dateLabel: dayName,
        count,
        isToday: i === 0,
      });
    }
    return result;
  }, [appointments, now]);

  const maxVolume = Math.max(1, ...dayVolumes.map((d) => d.count));

  if (session.status === "unauthenticated") {
    return (
      <div className={styles.container}>
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeText}>
            <h1>Health&amp;Human · Quản Lý Phòng Khám</h1>
            <p>Vui lòng đăng nhập để truy cập không gian làm việc chuyên nghiệp.</p>
          </div>
          <Link href="/auth">
            <Button variant="secondary">Đăng nhập ngay</Button>
          </Link>
        </div>
      </div>
    );
  }

  const role = session.identity?.role || "STAFF";
  const roleLabel =
    role === "DOCTOR" ? "Bác sĩ" : role === "ADMIN" ? "Quản trị viên" : "Nhân viên phòng khám";

  return (
    <div className={styles.container}>
      {/* Welcome Banner */}
      <header className={styles.welcomeBanner}>
        <div className={styles.welcomeText}>
          <h1>Xin chào, {session.identity?.displayName || "Đồng nghiệp"}</h1>
          <p>
            {formatVietnamDate(now)} · {formatVietnamTime(now.toISOString())} (Giờ Việt Nam UTC+7)
          </p>
        </div>
        <div className={styles.welcomeBadge}>
          <span aria-hidden="true">●</span>
          {roleLabel}
        </div>
      </header>

      {/* Quick Actions */}
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
        <Button variant="ghost" onClick={loadData} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới dữ liệu"}
        </Button>
      </nav>

      {/* Error state */}
      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Stat Cards */}
      <section aria-label="Số liệu tổng quan trong ngày" className={styles.statGrid}>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Lịch khám hôm nay</span>
          <span className={styles.statValue}>
            {loading ? <Skeleton height={36} width={60} /> : stats.total}
          </span>
          <span className={styles.statDesc}>
            {role === "DOCTOR" ? "Ca khám được phân công" : "Tổng lượt hẹn trong ngày"}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Đang chờ tiếp đón &amp; khám</span>
          <span className={styles.statValue} style={{ color: "var(--primary)" }}>
            {loading ? <Skeleton height={36} width={60} /> : stats.waiting}
          </span>
          <span className={styles.statDesc}>Bệnh nhân chờ hoặc đã check-in</span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Đã hoàn thành</span>
          <span className={styles.statValue} style={{ color: "var(--success)" }}>
            {loading ? <Skeleton height={36} width={60} /> : stats.completed}
          </span>
          <span className={styles.statDesc}>Ca khám đã chốt bệnh án</span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Đã hủy / Vắng mặt</span>
          <span className={styles.statValue} style={{ color: "var(--danger)" }}>
            {loading ? <Skeleton height={36} width={60} /> : stats.cancelled}
          </span>
          <span className={styles.statDesc}>Lịch bị hủy hoặc bệnh nhân no-show</span>
        </article>
      </section>

      {/* 2-column Content Grid */}
      <div className={styles.dashboardGrid}>
        {/* Upcoming appointments list */}
        <section className={styles.sectionCard} aria-labelledby="upcoming-heading">
          <div className={styles.sectionHeader}>
            <h2 id="upcoming-heading">Lịch hẹn gần nhất trong ngày</h2>
            <Link href="/appointments" style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: 600 }}>
              Xem toàn bộ hàng đợi →
            </Link>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton height={42} width="100%" />
              <Skeleton height={42} width="100%" />
              <Skeleton height={42} width="100%" />
            </div>
          ) : appointments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>
              <span style={{ fontSize: "2rem", display: "block", marginBottom: 8 }}>📅</span>
              <p style={{ margin: 0 }}>Chưa có lịch hẹn nào được ghi nhận.</p>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Giờ khám</th>
                    <th>Trạng thái</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.slice(0, 5).map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>
                        {formatVietnamTime(item.scheduledStartAt)}–{formatVietnamTime(item.scheduledEndAt)}
                      </td>
                      <td>{statusBadge(item.status)}</td>
                      <td style={{ color: "var(--muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.reason || "Khám thông thường"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 7-day Volume Overview */}
        <section className={styles.sectionCard} aria-labelledby="volume-heading">
          <div className={styles.sectionHeader}>
            <h2 id="volume-heading">Xu hướng 7 ngày</h2>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Lượt khám/ngày</span>
          </div>

          <div className={styles.chartContainer} role="img" aria-label="Biểu đồ lượt khám 7 ngày gần đây">
            {dayVolumes.map((item, idx) => {
              const heightPercent = Math.max(8, (item.count / maxVolume) * 100);
              return (
                <div key={idx} className={styles.chartBarWrapper}>
                  <span className={styles.chartCount}>{item.count}</span>
                  <div
                    className={`${styles.chartBar} ${item.isToday ? styles.chartBarActive : ""}`}
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className={styles.chartLabel}>{item.dateLabel}</span>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: "0.775rem", color: "var(--muted)", margin: 0, textAlign: "center" }}>
            Số liệu cập nhật theo múi giờ Việt Nam (UTC+7)
          </p>
        </section>
      </div>
    </div>
  );
}
