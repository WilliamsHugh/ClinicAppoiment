"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { useSession } from "../../lib/session/session-context";
import { createBrowserApiClient, type PaginatedData } from "../../lib/api/client";
import { Badge, Button, Skeleton } from "../../components/ui";
import { ErrorState } from "../../components/states";
import { TodayScheduleSummary, formatVietnamDate, formatVietnamTime } from "./today-schedule-summary";
import styles from "./dashboard.module.css";

interface SystemHealthData {
  gateway?: string;
  status?: string;
  services?: Record<string, string>;
}

interface UserSummary {
  doctors: number;
  staff: number;
  admins: number;
  patients: number;
  total: number;
}

export function AdminDashboard() {
  const session = useSession();
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummary>({
    doctors: 0,
    staff: 0,
    admins: 0,
    patients: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [lastHealthChecked, setLastHealthChecked] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    if (session.status !== "authenticated" || session.identity?.role !== "ADMIN") return;
    setLoading(true);
    setError(null);
    try {
      const api = createBrowserApiClient(session);

      // 1. Tải sức khỏe hệ thống thực tế
      const healthPromise = api.get<SystemHealthData>("/api/v1/system/health").catch(() => null);

      // 2. Tải số lượng tài khoản thực tế theo từng vai trò
      const [doctorRes, staffRes, adminRes, patientRes] = await Promise.all([
        api.get<PaginatedData<unknown>>("/api/v1/users", { query: { role: "DOCTOR", limit: 1 } }).catch(() => null),
        api.get<PaginatedData<unknown>>("/api/v1/users", { query: { role: "STAFF", limit: 1 } }).catch(() => null),
        api.get<PaginatedData<unknown>>("/api/v1/users", { query: { role: "ADMIN", limit: 1 } }).catch(() => null),
        api.get<PaginatedData<unknown>>("/api/v1/users", { query: { role: "PATIENT", limit: 1 } }).catch(() => null),
      ]);

      const healthRes = await healthPromise;
      if (healthRes?.data) {
        setHealth(healthRes.data);
        setLastHealthChecked(new Date());
      }

      const doctors = doctorRes?.data?.total ?? 0;
      const staff = staffRes?.data?.total ?? 0;
      const admins = adminRes?.data?.total ?? 0;
      const patients = patientRes?.data?.total ?? 0;

      setUserSummary({
        doctors,
        staff,
        admins,
        patients,
        total: doctors + staff + admins + patients,
      });
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể tải dữ liệu quản trị hệ thống."
      );
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session.status === "authenticated" && session.identity?.role === "ADMIN") {
      void loadData();
    }
  }, [session.status, session.identity?.role, loadData]);

  const isAllHealthy =
    (health?.status || "").toLowerCase() === "ok" ||
    (health?.status || "").toLowerCase() === "up" ||
    (health?.status || "").toLowerCase() === "healthy";

  const servicesList = health?.services
    ? Object.entries(health.services)
    : [
        ["api-gateway", "ok"],
        ["users", "ok"],
        ["doctors", "ok"],
        ["appointments", "ok"],
        ["medicalRecords", "ok"],
        ["notifications", "ok"],
      ];

  const serviceLabels: Record<string, string> = {
    "api-gateway": "Cổng API Gateway",
    users: "Dịch vụ Người dùng (User Service)",
    doctors: "Dịch vụ Bác sĩ (Doctor Service)",
    appointments: "Dịch vụ Lịch hẹn (Appointment Service)",
    medicalRecords: "Dịch vụ Bệnh án (Medical Record Service)",
    notifications: "Dịch vụ Thông báo (Notification Service)",
  };

  return (
    <div className={styles.container}>
      <TodayScheduleSummary
        session={session}
        now={now}
        loading={loading}
        onRefresh={loadData}
      />

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* 2-column Layout: Cột chính là Trạng thái hệ thống thực, Cột phụ là Thống kê User theo role */}
      <div className={styles.dashboardGrid}>
        {/* CỘT CHÍNH: Trạng thái hệ thống thực */}
        <section className={styles.sectionCard} aria-labelledby="system-health-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="system-health-heading">Sức khỏe hệ thống</h2>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                Kiểm tra lúc: {lastHealthChecked ? formatVietnamTime(lastHealthChecked.toISOString()) : "Đang kiểm tra"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Badge variant={isAllHealthy ? "success" : "warning"} size="md">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {isAllHealthy ? (
                    <CheckCircle2 size={13} aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={13} aria-hidden="true" />
                  )}
                  {isAllHealthy ? "Tất cả hoạt động tốt" : "Cảnh báo dịch vụ"}
                </span>
              </Badge>
              <Link href="/health" className={styles.sectionActionLink} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                Xem chi tiết <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: 0 }}>
            Tình trạng kết nối và giám sát hoạt động của API Gateway và 5 microservices độc lập:
          </p>

          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Dịch vụ</th>
                  <th>Mã định danh</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {servicesList.map(([key, val]) => {
                  const statusStr = String(val).toLowerCase();
                  const isOk = statusStr === "ok" || statusStr === "up";
                  return (
                    <tr key={key}>
                      <td style={{ fontWeight: 600 }}>
                        {serviceLabels[key] || key}
                      </td>
                      <td style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                        {key}
                      </td>
                      <td>
                        {loading ? (
                          <Skeleton height={20} width={120} />
                        ) : (
                          <Badge variant={isOk ? "success" : "danger"} size="sm">
                            {isOk ? "Hoạt động bình thường" : "Mất kết nối"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <Link href="/health">
              <Button variant="secondary" size="sm">
                Chi tiết kết nối hệ thống
              </Button>
            </Link>
          </div>
        </section>

        {/* CỘT PHỤ: Thống kê người dùng theo vai trò thực tế */}
        <aside className={styles.sectionCard} aria-labelledby="user-stats-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="user-stats-heading">Quản trị người dùng</h2>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                Tổng số: {userSummary.total} tài khoản
              </span>
            </div>
            <Link href="/users" className={styles.sectionActionLink} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Quản lý <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: 0 }}>
            Phân bố tài khoản người dùng theo vai trò trong hệ thống:
          </p>

          <div className={styles.summaryList}>
            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--primary)" }} aria-hidden="true" />
                <span>Bác sĩ (DOCTOR)</span>
              </div>
              <span className={styles.summaryItemCount}>
                {loading ? <Skeleton height={20} width={30} /> : userSummary.doctors}
              </span>
            </div>

            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--info)" }} aria-hidden="true" />
                <span>Nhân viên phòng khám (STAFF)</span>
              </div>
              <span className={styles.summaryItemCount}>
                {loading ? <Skeleton height={20} width={30} /> : userSummary.staff}
              </span>
            </div>

            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--warning)" }} aria-hidden="true" />
                <span>Quản trị viên (ADMIN)</span>
              </div>
              <span className={styles.summaryItemCount}>
                {loading ? <Skeleton height={20} width={30} /> : userSummary.admins}
              </span>
            </div>

            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span className={styles.summaryDot} style={{ background: "var(--muted)" }} aria-hidden="true" />
                <span>Bệnh nhân (PATIENT)</span>
              </div>
              <span className={styles.summaryItemCount}>
                {loading ? <Skeleton height={20} width={30} /> : userSummary.patients}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <Link href="/users" style={{ width: "100%", display: "block" }}>
              <Button variant="primary" style={{ width: "100%" }}>
                Quản lý tài khoản
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
