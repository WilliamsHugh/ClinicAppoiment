"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ErrorState, Skeleton } from "../../components/states";
import { Badge, Button } from "../../components/ui";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import {
  canViewSystemHealth,
  formatClientCheckedAt,
  getSystemServiceHealth,
  getSystemServiceStatus,
  isSystemAllHealthy,
  loadSystemHealth,
  SYSTEM_SERVICES,
  type SystemHealth,
} from "./health";
import { ServiceStatusBadge } from "./service-status-badge";

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

  const refresh = useCallback(
    async (isBackground = false) => {
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
            : new ApiClientError(
                caught instanceof Error ? caught.message : "Không thể tải sức khỏe hệ thống.",
                0,
                "UNKNOWN_ERROR"
              )
        );
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [client, session]
  );

  useEffect(() => {
    void refresh(Boolean(cachedSystemHealth));
  }, [refresh]);

  if (session.status === "loading") {
    return (
      <section className="health-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }} aria-busy="true">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">API Gateway &amp; Microservices</p>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
              <h2 style={{ margin: 0 }}>Hạ tầng hệ thống</h2>
              <Skeleton height={24} width={140} borderRadius="var(--radius-full)" aria-busy="true" />
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4, display: "block" }}>
              Đang kết nối và kiểm tra trạng thái các dịch vụ...
            </span>
          </div>
          <Button variant="outline" disabled>
            Kiểm tra lại
          </Button>
        </div>

        <div className="health-grid" aria-busy="true">
          {SYSTEM_SERVICES.map((svc) => (
            <article key={svc.key} className="health-service">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: 0 }}>{svc.shortName}</h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                <Skeleton height={24} width={140} borderRadius="var(--radius-full)" aria-busy="true" />
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

  const allHealthy = isSystemAllHealthy(health);
  const formattedTime = formatClientCheckedAt(lastChecked);

  return (
    <section
      className="health-panel"
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
      aria-busy={loading || isRefreshing}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">API Gateway &amp; Microservices</p>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
            <h2 style={{ margin: 0 }}>Hạ tầng hệ thống</h2>
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
              <Skeleton height={24} width={140} borderRadius="var(--radius-full)" aria-busy="true" />
            )}
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4, display: "block" }}>
            {isRefreshing
              ? `Đang kiểm tra lại dịch vụ... (hiển thị kết quả nhận lúc ${formattedTime})`
              : error
              ? `Lần nhận phản hồi thành công gần nhất tại trình duyệt: ${formattedTime} (Giờ Việt Nam UTC+7)`
              : `Thời điểm nhận kết quả tại trình duyệt: ${formattedTime} (Giờ Việt Nam UTC+7)`}
          </span>
        </div>
        <Button
          variant="outline"
          onClick={() => void refresh(Boolean(health))}
          loading={loading || isRefreshing}
          disabled={loading || isRefreshing}
          aria-label="Kiểm tra lại tình trạng hệ thống"
        >
          {loading || isRefreshing ? "Đang kiểm tra…" : "Kiểm tra lại"}
        </Button>
      </div>

      {error && health && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--warning-light)",
            border: "1px solid var(--warning)",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AlertTriangle size={18} style={{ color: "var(--warning)", flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: "0.875rem" }}>
            Lần kiểm tra lại gần nhất thất bại ({error.message}). Đang hiển thị kết quả kiểm tra trước đó nhận lúc {formattedTime}.
          </span>
        </div>
      )}

      <div className="health-grid" aria-busy={loading || isRefreshing}>
        {SYSTEM_SERVICES.map((svc) => {
          const liveData = getSystemServiceHealth(health, svc.key);
          const statusStr = getSystemServiceStatus(health, svc.key);
          const version =
            typeof liveData === "object" && liveData !== null && "version" in liveData
              ? String(liveData.version)
              : undefined;

          return (
            <article key={svc.key} className="health-service">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: 0 }}>{svc.shortName}</h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                {loading && !health ? (
                  <Skeleton height={24} width={140} borderRadius="var(--radius-full)" aria-busy="true" />
                ) : (
                  <ServiceStatusBadge rawStatus={statusStr} />
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
