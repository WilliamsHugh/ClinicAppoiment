"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSession } from "../../lib/session/session-context";
import { createBrowserApiClient, type PaginatedData } from "../../lib/api/client";
import { Button, Skeleton } from "../../components/ui";
import { EmptyState, ErrorState } from "../../components/states";
import { StatusBadge } from "../../components/status-badge";
import {
  TodayScheduleSummary,
  formatVietnamDate,
  formatVietnamTime,
  formatPatientDisplay,
} from "./today-schedule-summary";
import styles from "./dashboard.module.css";

export interface AppointmentItem {
  id: string;
  patientId: string;
  doctorId: string;
  specialtyId?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  reason?: string;
  patientName?: string;
  doctorName?: string;
  specialtyName?: string;
}

interface DayVolume {
  dateLabel: string;
  count: number;
  isToday: boolean;
}

// Module-level in-memory cache to preserve appointments across tab switches
let cachedStaffAppointments: AppointmentItem[] | null = null;

export function StaffDashboard() {
  const session = useSession();
  const [appointments, setAppointments] = useState<AppointmentItem[]>(
    cachedStaffAppointments ?? []
  );
  const [loading, setLoading] = useState(!cachedStaffAppointments);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [queueTab, setQueueTab] = useState<"ALL" | "CONFIRMED" | "PENDING">("ALL");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async (isBackground = false) => {
    if (session.status !== "authenticated") return;
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const api = createBrowserApiClient(session);
      const res = await api.get<PaginatedData<AppointmentItem>>("/api/v1/appointments", {
        query: { page: 1, limit: 100 },
      });
      const items = res.data.items || [];
      setAppointments(items);
      cachedStaffAppointments = items;
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể tải dữ liệu hàng đợi tiếp đón."
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void loadData(Boolean(cachedStaffAppointments));
    }
  }, [session.status, loadData]);

  // Lọc lịch khám hôm nay theo giờ Việt Nam
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }, [now]);

  const todayAppointments = useMemo(() => {
    return appointments.filter((item) => {
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
  }, [appointments, todayStr]);

  // Hàng đợi cần xử lý của nhân viên: PENDING (cần xác nhận) + CONFIRMED (cần đón tiếp/check-in)
  const pendingAppointments = useMemo(() => {
    return appointments.filter((item) => item.status === "PENDING");
  }, [appointments]);

  const confirmedTodayAppointments = useMemo(() => {
    return todayAppointments.filter((item) => item.status === "CONFIRMED");
  }, [todayAppointments]);

  const actionQueue = useMemo(() => {
    if (queueTab === "CONFIRMED") return confirmedTodayAppointments;
    if (queueTab === "PENDING") return pendingAppointments;
    return [...confirmedTodayAppointments, ...pendingAppointments];
  }, [queueTab, confirmedTodayAppointments, pendingAppointments]);

  // Thống kê ngày hôm nay
  const stats = useMemo(() => {
    const waiting = todayAppointments.filter((a) =>
      ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(a.status)
    ).length;
    const completed = todayAppointments.filter((a) => a.status === "COMPLETED").length;
    const cancelled = todayAppointments.filter((a) =>
      ["CANCELLED", "NO_SHOW"].includes(a.status)
    ).length;

    return {
      total: todayAppointments.length,
      waiting,
      completed,
      cancelled,
    };
  }, [todayAppointments]);

  // Biểu đồ lượt khám 7 ngày thực tế
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

  return (
    <div className={styles.container}>
      <TodayScheduleSummary
        session={session}
        now={now}
        loading={isRefreshing || loading}
        onRefresh={() => void loadData(false)}
      />

      {error && <ErrorState message={error} onRetry={() => void loadData(false)} />}

      {/* Thống kê tổng quan ngày (Primary Numbers for Reception) */}
      <section aria-label="Số liệu tổng quan trong ngày" className={styles.statGrid}>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Lịch khám hôm nay</span>
          <span className={styles.statValue}>
            {loading && !cachedStaffAppointments ? <Skeleton height={32} width={50} /> : stats.total}
          </span>
          <span className={styles.statDesc}>Tổng lượt khám tiếp nhận trong ngày</span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Đang chờ tiếp đón</span>
          <span className={styles.statValue} style={{ color: "var(--primary)" }}>
            {loading && !cachedStaffAppointments ? <Skeleton height={32} width={50} /> : stats.waiting}
          </span>
          <span className={styles.statDesc}>Bệnh nhân chờ đón tiếp hoặc đang chờ khám</span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Đã hoàn thành</span>
          <span className={styles.statValue} style={{ color: "var(--success)" }}>
            {loading && !cachedStaffAppointments ? <Skeleton height={32} width={50} /> : stats.completed}
          </span>
          <span className={styles.statDesc}>Ca khám đã hoàn tất bệnh án</span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Đã hủy / Vắng mặt</span>
          <span className={styles.statValue} style={{ color: "var(--danger)" }}>
            {loading && !cachedStaffAppointments ? <Skeleton height={32} width={50} /> : stats.cancelled}
          </span>
          <span className={styles.statDesc}>Bệnh nhân hủy hoặc không đến hẹn</span>
        </article>
      </section>

      {/* 2-column Layout: Cột chính là Hàng đợi cần xử lý (Queue PENDING + CONFIRMED) */}
      <div className={styles.dashboardGrid}>
        {/* CỘT CHÍNH: Hàng đợi cần xử lý (Queue) */}
        <section className={styles.sectionCard} aria-labelledby="staff-queue-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="staff-queue-heading">Hàng đợi cần xử lý</h2>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                {confirmedTodayAppointments.length} bệnh nhân cần tiếp đón · {pendingAppointments.length} lịch chờ duyệt
              </span>
            </div>
            <Link href="/appointments" className={styles.sectionActionLink} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Quản lý lịch hẹn <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {/* Filter Tab cho Queue */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button
              variant={queueTab === "ALL" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setQueueTab("ALL")}
            >
              Tất cả ({confirmedTodayAppointments.length + pendingAppointments.length})
            </Button>
            <Button
              variant={queueTab === "CONFIRMED" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setQueueTab("CONFIRMED")}
            >
              Cần tiếp đón hôm nay ({confirmedTodayAppointments.length})
            </Button>
            <Button
              variant={queueTab === "PENDING" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setQueueTab("PENDING")}
            >
              Chờ xác nhận ({pendingAppointments.length})
            </Button>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton height={60} width="100%" />
              <Skeleton height={60} width="100%" />
              <Skeleton height={60} width="100%" />
            </div>
          ) : actionQueue.length === 0 ? (
            <EmptyState
              title="Hàng đợi đã được xử lý hết"
              message="Hiện không có lịch hẹn nào cần tiếp đón hoặc đang chờ xác nhận."
              action={{
                label: "Quản lý lịch hẹn",
                href: "/appointments",
              }}
            />
          ) : (
            <div className={styles.queueList}>
              {actionQueue.slice(0, 10).map((item) => (
                <article
                  key={item.id}
                  className={`${styles.queueCard} ${
                    item.status === "CONFIRMED"
                      ? styles.queueCardConfirmed
                      : styles.queueCardPending
                  }`}
                >
                  <div className={styles.queueCardInfo}>
                    <div className={styles.queueCardHeader}>
                      <span className={styles.queueTime}>
                        {formatVietnamTime(item.scheduledStartAt)} – {formatVietnamTime(item.scheduledEndAt)}
                      </span>
                      <StatusBadge status={item.status} size="sm" />
                    </div>
                    <div className={styles.queuePatient}>
                      {formatPatientDisplay(item.patientName, item.patientId)}
                    </div>
                    <div className={styles.queueMeta}>
                      <span>Lý do: {item.reason || "Khám thông thường"}</span>
                    </div>
                  </div>

                  <div className={styles.queueActions}>
                    <Link href={`/appointments?id=${encodeURIComponent(item.id)}`}>
                      <Button
                        variant={item.status === "CONFIRMED" ? "primary" : "secondary"}
                        size="sm"
                      >
                        {item.status === "CONFIRMED" ? "Tiếp đón" : "Xử lý"}
                      </Button>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* CỘT PHỤ: Xu hướng 7 ngày & Lối tắt ca trực bác sĩ */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 7-day Volume Overview */}
          <section className={styles.sectionCard} aria-labelledby="volume-heading">
            <div className={styles.sectionHeader}>
              <h2 id="volume-heading">Xu hướng 7 ngày</h2>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>Lượt khám/ngày</span>
            </div>

            <div
              className={styles.chartContainer}
              role="img"
              aria-label="Biểu đồ lượt khám 7 ngày gần đây"
            >
              {dayVolumes.map((item, idx) => {
                const heightPercent = Math.max(8, (item.count / maxVolume) * 100);
                return (
                  <div key={idx} className={styles.chartBarWrapper}>
                    <span className={styles.chartCount}>{item.count}</span>
                    <div
                      className={`${styles.chartBar} ${
                        item.isToday ? styles.chartBarActive : ""
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                    <span className={styles.chartLabel}>{item.dateLabel}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0, textAlign: "center" }}>
              Số liệu cập nhật theo giờ Việt Nam (UTC+7)
            </p>
          </section>

          {/* Quick Info & Lối tắt Bác sĩ trực */}
          <section className={styles.sectionCard} aria-labelledby="doctor-schedules-heading">
            <div className={styles.sectionHeader}>
              <h2 id="doctor-schedules-heading">Bác sĩ &amp; Ca trực</h2>
              <Link href="/doctors" className={styles.sectionActionLink} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                Xem lịch <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: 0 }}>
              Kiểm tra ca làm việc của bác sĩ hoặc tra cứu khung giờ khám còn trống hôm nay.
            </p>
            <Link href="/doctors" style={{ width: "100%", display: "block" }}>
              <Button variant="secondary" style={{ width: "100%" }}>
                Tra cứu lịch bác sĩ
              </Button>
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
