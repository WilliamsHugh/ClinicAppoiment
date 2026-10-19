"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/states";
import { Badge, Button } from "../../components/ui";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { canViewSystemHealth, loadSystemHealth, type SystemHealth } from "./health";

function getServiceStatusBadge(rawStatus?: string) {
  const s = (rawStatus || "").toLowerCase();
  if (s === "ok" || s === "up" || s === "healthy") {
    return <Badge variant="success">✓ Hoạt động bình thường</Badge>;
  }
  if (s === "degraded" || s === "warning") {
    return <Badge variant="warning">⚠ Cảnh báo suy giảm</Badge>;
  }
  if (s === "down" || s === "unhealthy" || s === "error") {
    return <Badge variant="danger">✕ Mất kết nối</Badge>;
  }
  return <Badge variant="neutral">{rawStatus || "Không xác định"}</Badge>;
}

export function HealthPanel() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!canViewSystemHealth(session)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadSystemHealth(client, session);
      setHealth(result.data);
      setLastChecked(new Date());
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught
          : new ApiClientError("Không thể tải sức khỏe hệ thống.", 0, "UNKNOWN_ERROR")
      );
    } finally {
      setLoading(false);
    }
  }, [client, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (session.status === "loading") {
    return <LoadingState message="Đang kiểm tra quyền truy cập..." />;
  }
  if (!canViewSystemHealth(session)) {
    return <ErrorState message="Trang này chỉ dành cho quản trị viên đã đăng nhập." />;
  }
  if (loading && !health) {
    return <LoadingState message="Đang kiểm tra kết nối các microservices..." />;
  }
  if (error) {
    return (
      <ErrorState
        message={error.message}
        requestId={error.requestId}
        onRetry={() => void refresh()}
      />
    );
  }

  const services = Object.entries(health?.services ?? {});
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
    : "Vừa xong";

  return (
    <section className="health-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">API Gateway &amp; Microservices</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <h2 style={{ margin: 0 }}>Hạ tầng hệ thống</h2>
            <Badge variant={isAllHealthy ? "success" : "warning"} size="md">
              {isAllHealthy ? "Tất cả hoạt động tốt" : health?.status ?? "Đang kiểm tra"}
            </Badge>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4, display: "block" }}>
            Lần kiểm tra gần nhất: {formattedTime} (Giờ Việt Nam UTC+7)
          </span>
        </div>
        <Button variant="outline" onClick={() => void refresh()} loading={loading}>
          {loading ? "Đang tải…" : "Kiểm tra lại"}
        </Button>
      </div>

      {services.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
          <p>Gateway chưa trả về danh sách dịch vụ hoặc không có dịch vụ nào được cấu hình.</p>
        </div>
      ) : (
        <div className="health-grid">
          {services.map(([name, value]) => {
            const statusStr = typeof value === "string" ? value : value.status ?? "";
            const version = typeof value === "object" && value !== null && "version" in value
              ? String(value.version)
              : undefined;

            return (
              <article key={name} className="health-service" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3 style={{ margin: 0, textTransform: "capitalize" }}>{name.replace(/-/g, " ")}</h3>
                </div>
                <div>{getServiceStatusBadge(statusStr)}</div>
                {version && (
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    Phiên bản: {version}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
