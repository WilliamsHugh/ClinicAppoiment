"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { ErrorState, Skeleton, SkeletonTable, SkeletonPage } from "../../components/states";
import { Badge, Button } from "../../components/ui";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { canViewSystemHealth, loadSystemHealth, type SystemHealth } from "./health";

function getServiceStatusBadge(rawStatus?: string) {
  const s = (rawStatus || "").toLowerCase();
  if (s === "ok" || s === "up" || s === "healthy") {
    return (
      <Badge variant="success">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <CheckCircle2 size={13} aria-hidden="true" /> Hoạt động bình thường
        </span>
      </Badge>
    );
  }
  if (s === "degraded" || s === "warning") {
    return (
      <Badge variant="warning">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <AlertTriangle size={13} aria-hidden="true" /> Cảnh báo suy giảm
        </span>
      </Badge>
    );
  }
  if (s === "down" || s === "unhealthy" || s === "error") {
    return (
      <Badge variant="danger">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <XCircle size={13} aria-hidden="true" /> Mất kết nối
        </span>
      </Badge>
    );
  }
  return <Badge variant="neutral">{rawStatus || "Không xác định"}</Badge>;
}

const STATIC_PANEL_SERVICES = [
  { key: "api-gateway", title: "API Gateway" },
  { key: "users", title: "User Service" },
  { key: "doctors", title: "Doctor Service" },
  { key: "appointments", title: "Appointment Service" },
  { key: "medicalRecords", title: "Medical Record Service" },
  { key: "notifications", title: "Notification Service" },
];

let cachedSystemHealth: SystemHealth | null = null;
let cachedHealthLastChecked: Date | null = null;

export function HealthPanel() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);
  const [health, setHealth] = useState<SystemHealth | null>(cachedSystemHealth);
  const [loading, setLoading] = useState(!cachedSystemHealth);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(cachedHealthLastChecked);

  const refresh = useCallback(async (isBackground = false) => {
    if (!canViewSystemHealth(session)) return;
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await loadSystemHealth(client, session);
      setHealth(result.data);
      cachedSystemHealth = result.data;
      const checkedAt = new Date();
      setLastChecked(checkedAt);
      cachedHealthLastChecked = checkedAt;
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught
          : new ApiClientError("Không thể tải sức khỏe hệ thống.", 0, "UNKNOWN_ERROR")
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [client, session]);

  useEffect(() => {
    void refresh(Boolean(cachedSystemHealth));
  }, [refresh]);

  if (session.status === "loading") {
    return (
      <section className="health-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }} aria-busy="true">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">API Gateway &amp; Microservices</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <h2 style={{ margin: 0 }}>Hạ tầng hệ thống</h2>
              <Skeleton height={24} width={140} borderRadius="var(--radius-full)" />
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4, display: "block" }}>
              Đang kết nối và kiểm tra trạng thái các dịch vụ...
            </span>
          </div>
          <Button variant="outline" disabled>
            Kiểm tra lại
          </Button>
        </div>

        <div className="health-grid">
          {STATIC_PANEL_SERVICES.map((svc) => (
            <article key={svc.key} className="health-service" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: 0, textTransform: "capitalize" }}>{svc.title}</h3>
              </div>
              <div>
                <Skeleton height={24} width={140} borderRadius="var(--radius-full)" />
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }
  if (!canViewSystemHealth(session)) {
    return <ErrorState message="Trang này chỉ dành cho quản trị viên đã đăng nhập." />;
  }
  if (error && !health) {
    return (
      <ErrorState
        message={error.message}
        requestId={error.requestId}
        onRetry={() => void refresh(false)}
      />
    );
  }

  const isAllHealthy =
    (health?.status || "").toLowerCase() === "ok" ||
    (health?.status || "").toLowerCase() === "up" ||
    (health?.status || "").toLowerCase() === "healthy";

  const formattedTime = lastChecked
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(lastChecked)
    : "Đang kiểm tra";

  return (
    <section className="health-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">API Gateway &amp; Microservices</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <h2 style={{ margin: 0 }}>Hạ tầng hệ thống</h2>
            {error ? (
              <Badge variant="warning" size="md">
                Kết quả cũ (Chưa cập nhật)
              </Badge>
            ) : health ? (
              <Badge variant={isAllHealthy ? "success" : "warning"} size="md">
                {isAllHealthy ? "Tất cả hoạt động tốt" : health.status ?? "Đang kiểm tra"}
              </Badge>
            ) : (
              <Skeleton height={24} width={140} borderRadius="var(--radius-full)" />
            )}
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4, display: "block" }}>
            {isRefreshing
              ? "Đang kiểm tra lại dịch vụ..."
              : error
              ? `Lần kiểm tra thành công gần nhất: ${formattedTime} (Giờ Việt Nam UTC+7)`
              : `Lần kiểm tra gần nhất: ${formattedTime} (Giờ Việt Nam UTC+7)`}
          </span>
        </div>
        <Button variant="outline" onClick={() => void refresh(false)} loading={loading || isRefreshing}>
          {loading || isRefreshing ? "Đang tải…" : "Kiểm tra lại"}
        </Button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", background: "var(--warning-light)", border: "1px solid var(--warning)", color: "var(--warning)" }}>
          <span>Lần kiểm tra lại gần nhất thất bại: {error.message}. Đang hiển thị kết quả lưu trước đó.</span>
        </div>
      )}

      <div className="health-grid">
        {STATIC_PANEL_SERVICES.map((svc) => {
          const liveData =
            health?.services?.[svc.key] ??
            health?.services?.[svc.key.toLowerCase()] ??
            health?.services?.[svc.key.replace(/-/g, "")];
          const statusStr = typeof liveData === "string" ? liveData : liveData?.status;
          const version = typeof liveData === "object" && liveData !== null && "version" in liveData
            ? String(liveData.version)
            : undefined;

          return (
            <article key={svc.key} className="health-service" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: 0, textTransform: "capitalize" }}>{svc.title}</h3>
              </div>
              <div>
                {statusStr ? (
                  getServiceStatusBadge(statusStr)
                ) : (
                  <Skeleton height={24} width={140} borderRadius="var(--radius-full)" />
                )}
              </div>
              {version && (
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  Phiên bản: {version}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
