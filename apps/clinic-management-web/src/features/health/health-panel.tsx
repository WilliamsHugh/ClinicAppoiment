"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/states";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { canViewSystemHealth, loadSystemHealth, type SystemHealth } from "./health";

export function HealthPanel() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);

  const refresh = useCallback(async () => {
    if (!canViewSystemHealth(session)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadSystemHealth(client, session);
      setHealth(result.data);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught : new ApiClientError("Không thể tải sức khỏe hệ thống.", 0, "UNKNOWN_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [client, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (session.status === "loading") return <LoadingState message="Đang kiểm tra quyền truy cập..." />;
  if (!canViewSystemHealth(session)) {
    return <ErrorState message="Trang này chỉ dành cho quản trị viên đã đăng nhập." />;
  }
  if (loading && !health) return <LoadingState message="Đang kiểm tra các dịch vụ..." />;
  if (error) return <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void refresh()} />;

  const services = Object.entries(health?.services ?? {});
  return (
    <section className="health-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Gateway</p><h2>Trạng thái: {health?.status ?? "Không xác định"}</h2></div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Đang tải..." : "Kiểm tra lại"}</button>
      </div>
      {services.length === 0 ? <p>Gateway chưa trả về danh sách dịch vụ.</p> : (
        <div className="health-grid">
          {services.map(([name, value]) => (
            <article key={name} className="health-service">
              <h3>{name}</h3>
              <span>{typeof value === "string" ? value : value.status ?? "Không xác định"}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
