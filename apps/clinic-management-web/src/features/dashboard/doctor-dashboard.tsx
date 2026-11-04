"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
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

// Module-level in-memory cache to preserve appointments across tab switches
let cachedDoctorAppointments: AppointmentItem[] | null = null;

export function DoctorDashboard() {
  const session = useSession();
  const [appointments, setAppointments] = useState<AppointmentItem[]>(
    cachedDoctorAppointments ?? []
  );
  const [loading, setLoading] = useState(!cachedDoctorAppointments);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

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
      cachedDoctorAppointments = items;
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể tải danh sách ca khám của bác sĩ."
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void loadData(Boolean(cachedDoctorAppointments));
    }
  }, [session.status, loadData]);

  // Lọc lịch hẹn hôm nay theo giờ Việt Nam
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

  // Phân loại và sắp xếp ưu tiên cho Bác sĩ:
  // 1. CHECKED_IN (Bệnh nhân đã có mặt, sẵn sàng vào khám ngay)
  // 2. CONFIRMED (Bệnh nhân sắp tới trong ngày)
  // 3. PENDING (Đang chờ xử lý)
  // 4. COMPLETED (Đã khám xong)
  // 5. CANCELLED / NO_SHOW
  const sortedAppointments = useMemo(() => {
    const list = [...todayAppointments];
    const priorityOrder: Record<AppointmentItem["status"], number> = {
      CHECKED_IN: 1,
      CONFIRMED: 2,
      PENDING: 3,
      COMPLETED: 4,
      CANCELLED: 5,
      NO_SHOW: 6,
    };

    return list.sort((a, b) => {
      const diff = priorityOrder[a.status] - priorityOrder[b.status];
      if (diff !== 0) return diff;
      return new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime();
    });
  }, [todayAppointments]);

  // Thống kê số lượng thực tế
  const statusCounts = useMemo(() => {
    const checkedIn = todayAppointments.filter((a) => a.status === "CHECKED_IN").length;
    const confirmed = todayAppointments.filter((a) => a.status === "CONFIRMED").length;
    const pending = todayAppointments.filter((a) => a.status === "PENDING").length;
    const completed = todayAppointments.filter((a) => a.status === "COMPLETED").length;
    const cancelledOrNoShow = todayAppointments.filter((a) =>
      ["CANCELLED", "NO_SHOW"].includes(a.status)
    ).length;

    return {
      total: todayAppointments.length,
      checkedIn,
      confirmed,
      pending,
      completed,
      cancelledOrNoShow,
    };
  }, [todayAppointments]);

  const checkedInList = useMemo(
    () => sortedAppointments.filter((a) => a.status === "CHECKED_IN"),
    [sortedAppointments]
  );
  const upcomingList = useMemo(
    () => sortedAppointments.filter((a) => a.status !== "CHECKED_IN"),
    [sortedAppointments]
  );

  return (
    <div className={styles.container}>
      <TodayScheduleSummary
        session={session}
        now={now}
        loading={isRefreshing || loading}
        onRefresh={() => void loadData(false)}
      />

      {error && <ErrorState message={error} onRetry={() => void loadData(false)} />}

      {/* 2-column Layout: Primary Task (Lịch khám ưu tiên) vs Secondary Task (Thống kê tiến độ) */}
      <div className={styles.dashboardGrid}>
        {/* CỘT CHÍNH: Lịch khám hôm nay của bác sĩ */}
        <section className={styles.sectionCard} aria-labelledby="doctor-schedule-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="doctor-schedule-heading">Lịch khám hôm nay</h2>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                {formatVietnamDate(now)} · {statusCounts.total} ca khám được phân công
              </span>
            </div>
            <Link href="/appointments" className={styles.sectionActionLink} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Xem tất cả lịch hẹn <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton height={60} width="100%" />
              <Skeleton height={60} width="100%" />
              <Skeleton height={60} width="100%" />
            </div>
          ) : todayAppointments.length === 0 ? (
            <EmptyState
              title="Không có ca khám nào hôm nay"
              message="Hôm nay bạn không có lịch hẹn khám nào được phân công hoặc bệnh nhân đặt chỗ."
              action={{
                label: "Xem tất cả lịch hẹn",
                href: "/appointments",
              }}
            />
          ) : (
            <div className={styles.queueList}>
              {/* Nhóm ưu tiên cao nhất: Bệnh nhân đã check-in đang chờ ngoài phòng khám */}
              {checkedInList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        color: "var(--info)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      <Clock size={14} aria-hidden="true" /> Bệnh nhân đang chờ khám ({checkedInList.length})
                    </span>
                  </div>

                  {checkedInList.map((item) => (
                    <article
                      key={item.id}
                      className={`${styles.queueCard} ${styles.queueCardCheckedIn}`}
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
                          <span>Lý do: {item.reason || "Khám định kỳ"}</span>
                        </div>
                      </div>

                      <div className={styles.queueActions}>
                        <Link href={`/medical-records?appointmentId=${encodeURIComponent(item.id)}`}>
                          <Button variant="primary" size="sm">
                            Khám bệnh
                          </Button>
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* Nhóm tiếp theo: Các ca khám sắp tới trong ngày */}
              {upcomingList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: checkedInList.length ? 12 : 0 }}>
                  {checkedInList.length > 0 && (
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        color: "var(--muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "4px 0",
                      }}
                    >
                      Lịch khám tiếp theo trong ngày
                    </span>
                  )}

                  {upcomingList.map((item) => (
                    <article
                      key={item.id}
                      className={`${styles.queueCard} ${
                        item.status === "CONFIRMED"
                          ? styles.queueCardConfirmed
                          : item.status === "PENDING"
                          ? styles.queueCardPending
                          : ""
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
                          <span>Lý do: {item.reason || "Khám định kỳ"}</span>
                        </div>
                      </div>

                      <div className={styles.queueActions}>
                        {item.status === "COMPLETED" ? (
                          <Link href={`/medical-records?appointmentId=${encodeURIComponent(item.id)}`}>
                            <Button variant="secondary" size="sm">
                              Xem bệnh án
                            </Button>
                          </Link>
                        ) : (
                          <Link href={`/appointments?id=${encodeURIComponent(item.id)}`}>
                            <Button variant="ghost" size="sm">
                              Chi tiết
                            </Button>
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* CỘT PHỤ: Thống kê tiến độ ca khám hôm nay (Text breakdown) */}
        <aside className={styles.sectionCard} aria-labelledby="doctor-summary-heading">
          <div className={styles.sectionHeader}>
            <h2 id="doctor-summary-heading">Tiến độ hôm nay</h2>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
              Tổng: {loading && !cachedDoctorAppointments ? "..." : statusCounts.total}
            </span>
          </div>

          <div className={styles.summaryList}>
            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--info)" }} aria-hidden="true" />
                <span>Đang chờ khám (đã check-in)</span>
              </div>
              <span className={styles.summaryItemCount} style={{ color: "var(--info)" }}>
                {loading && !cachedDoctorAppointments ? <Skeleton height={20} width={24} /> : statusCounts.checkedIn}
              </span>
            </div>

            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--primary)" }} aria-hidden="true" />
                <span>Sắp tới (đã xác nhận)</span>
              </div>
              <span className={styles.summaryItemCount}>
                {loading && !cachedDoctorAppointments ? <Skeleton height={20} width={24} /> : statusCounts.confirmed}
              </span>
            </div>

            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--success)" }} aria-hidden="true" />
                <span>Đã khám xong (hoàn tất)</span>
              </div>
              <span className={styles.summaryItemCount} style={{ color: "var(--success)" }}>
                {loading && !cachedDoctorAppointments ? <Skeleton height={20} width={24} /> : statusCounts.completed}
              </span>
            </div>

            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--warning)" }} aria-hidden="true" />
                <span>Chờ xác nhận</span>
              </div>
              <span className={styles.summaryItemCount} style={{ color: "var(--warning)" }}>
                {loading && !cachedDoctorAppointments ? <Skeleton height={20} width={24} /> : statusCounts.pending}
              </span>
            </div>

            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--danger)" }} aria-hidden="true" />
                <span>Đã hủy / vắng mặt</span>
              </div>
              <span className={styles.summaryItemCount} style={{ color: "var(--muted)" }}>
                {loading && !cachedDoctorAppointments ? <Skeleton height={20} width={24} /> : statusCounts.cancelledOrNoShow}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: "0 0 12px 0" }}>
              Cần cập nhật hoặc xem ca trực cá nhân trong tuần?
            </p>
            <Link href="/doctors" style={{ width: "100%", display: "block" }}>
              <Button variant="secondary" style={{ width: "100%" }}>
                Xem ca trực của tôi
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
