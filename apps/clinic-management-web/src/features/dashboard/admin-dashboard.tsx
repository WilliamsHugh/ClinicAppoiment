"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { useSession } from "../../lib/session/session-context";
import { createBrowserApiClient, type PaginatedData } from "../../lib/api/client";
import { Badge, Button, Skeleton, Alert } from "../../components/ui";
import {
  formatClientCheckedAt,
  getSystemServiceStatus,
  isSystemAllHealthy,
  SYSTEM_SERVICES,
  type SystemHealth,
} from "../health/health";
import { ServiceStatusBadge } from "../health/service-status-badge";
import { TodayScheduleSummary } from "./today-schedule-summary";
import styles from "./dashboard.module.css";

interface UserSummary {
  total: number;
}

export const STATIC_SYSTEM_SERVICES = SYSTEM_SERVICES;

export function AdminDashboard() {
  const session = useSession();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [lastHealthChecked, setLastHealthChecked] = useState<Date | null>(null);

  const loadData = useCallback(async (isBackground = false) => {
    if (session.status !== "authenticated" || session.identity?.role !== "ADMIN") return;
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    const api = createBrowserApiClient(session);

    // Isolated health check request
    const healthPromise = api
      .get<SystemHealth>("/api/v1/system/health")
      .then((res) => {
        if (res.data) {
          setHealth(res.data);
          const checkedAt = new Date();
          setLastHealthChecked(checkedAt);
          setHealthError(null);
        }
      })
      .catch((caught: unknown) => {
        const msg = caught instanceof Error ? caught.message : "Không thể kiểm tra sức khỏe hệ thống.";
        setHealthError(msg);
      });

    // Isolated user count request
    const usersPromise = api
      .get<PaginatedData<unknown>>("/api/v1/users", { query: { limit: 1 } })
      .then((res) => {
        if (res.data) {
          const summary = { total: res.data.total };
          setUserSummary(summary);
          setUserError(null);
        }
      })
      .catch((caught: unknown) => {
        const msg = caught instanceof Error ? caught.message : "Không thể tải số liệu người dùng.";
        setUserError(msg);
      });

    await Promise.allSettled([healthPromise, usersPromise]);
    setLoading(false);
    setIsRefreshing(false);
  }, [session]);

  useEffect(() => {
    if (session.status === "authenticated" && session.identity?.role === "ADMIN") {
      void loadData();
    } else {
      setHealth(null);
      setUserSummary(null);
      setLastHealthChecked(null);
    }
  }, [session.status, session.identity?.id, session.identity?.role, loadData]);

  const allHealthy = isSystemAllHealthy(health);
  const formattedHealthTime = formatClientCheckedAt(lastHealthChecked);

  return (
    <div className={styles.container}>
      <TodayScheduleSummary
        session={session}
        loading={isRefreshing || loading}
        onRefresh={() => void loadData(false)}
      />

      {/* 2-column Layout: system health and account management */}
      <div className={styles.dashboardGrid}>
        {/* CỘT CHÍNH: Trạng thái hệ thống thực */}
        <section
          className={styles.sectionCard}
          aria-labelledby="system-health-heading"
          aria-busy={loading || isRefreshing}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="system-health-heading">Sức khỏe hệ thống</h2>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                {isRefreshing
                  ? "Đang kiểm tra lại dịch vụ..."
                  : lastHealthChecked
                  ? `Thời điểm nhận kết quả tại trình duyệt: ${formattedHealthTime} (UTC+7)`
                  : "Đang kiểm tra kết nối"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isRefreshing && health ? (
                <Badge variant="info" size="md">
                  Đang làm mới...
                </Badge>
              ) : health ? (
                <Badge variant={allHealthy ? "success" : "warning"} size="md">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {allHealthy ? (
                      <CheckCircle2 size={13} aria-hidden="true" />
                    ) : (
                      <AlertTriangle size={13} aria-hidden="true" />
                    )}
                    <span>{allHealthy ? "Tất cả hoạt động tốt" : "Cảnh báo dịch vụ"}</span>
                  </span>
                </Badge>
              ) : (
                <Skeleton height={24} width={150} borderRadius="var(--radius-full)" aria-busy="true" />
              )}
              <Link
                href="/health"
                className={styles.sectionActionLink}
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                Xem chi tiết <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {healthError && !health && (
            <div style={{ marginBottom: 16 }}>
              <Alert variant="danger" title="Lỗi kết nối hạ tầng hệ thống">
                {healthError}
                <div style={{ marginTop: 8 }}>
                  <Button variant="outline" size="sm" onClick={() => void loadData(false)}>
                    Thử lại
                  </Button>
                </div>
              </Alert>
            </div>
          )}

          {healthError && health && (
            <div style={{ marginBottom: 16 }}>
              <Alert variant="warning" title="Dữ liệu chưa thể cập nhật">
                {healthError}. Đang hiển thị kết quả kiểm tra trước đó nhận lúc {formattedHealthTime}.
              </Alert>
            </div>
          )}

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
                {SYSTEM_SERVICES.map((svc) => {
                  const rawStatus = getSystemServiceStatus(health, svc.key);

                  return (
                    <tr key={svc.key}>
                      <td style={{ fontWeight: 600 }}>{svc.name}</td>
                      <td style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                        {svc.key}
                      </td>
                      <td>
                        {loading && !health ? (
                          <Skeleton height={20} width={120} borderRadius="var(--radius-full)" aria-busy="true" />
                        ) : (
                          <ServiceStatusBadge rawStatus={rawStatus} size="sm" />
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

        {/* CỘT PHỤ: Tổng số tài khoản */}
        <aside
          className={styles.sectionCard}
          aria-labelledby="user-stats-heading"
          aria-busy={loading && !userSummary}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="user-stats-heading">Quản trị người dùng</h2>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                {userError
                  ? "Chưa thể cập nhật"
                  : userSummary
                  ? `Tổng số: ${userSummary.total} tài khoản`
                  : "..."}
              </span>
            </div>
            <Link
              href="/users"
              className={styles.sectionActionLink}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              Quản lý <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {userError && (
            <div style={{ marginBottom: 12 }}>
              <Alert variant="warning" title="Số liệu người dùng">
                {userError}
              </Alert>
            </div>
          )}

          <div className={styles.summaryList}>
            <div className={styles.summaryItem}>
              <div className={styles.summaryItemLabel}>
                <span>Tài khoản trong hệ thống</span>
              </div>
              <span className={styles.summaryItemCount}>
                {userSummary ? (
                  userSummary.total
                ) : (
                  <Skeleton height={20} width={30} aria-busy="true" />
                )}
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
