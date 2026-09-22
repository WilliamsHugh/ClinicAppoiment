"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../src/components/states";
import { ApiClientError, createBrowserApiClient } from "../../src/lib/api/client";
import { useSession } from "../../src/lib/session/session-context";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  status: "UNREAD" | "READ" | "FAILED";
  createdAt: string;
  payload?: unknown;
};

export default function NotificationsPage() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.get<{ items: Notification[] }>("/api/v1/notifications", { query: { page: 1, limit: 20 } });
      setItems(result.data.items);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught : new ApiClientError("Không thể tải thông báo.", 0, "UNKNOWN_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (session.status === "authenticated") void load();
  }, [session.status, load]);

  async function markRead(id: string) {
    try {
      await client.patch(`/api/v1/notifications/${id}/read`, { body: {} });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught : new ApiClientError("Không thể đánh dấu đã đọc.", 0, "UNKNOWN_ERROR"));
    }
  }

  if (session.status === "loading") return <LoadingState message="Đang kiểm tra phiên..." />;
  if (session.status !== "authenticated") return <ErrorState message="Bạn cần đăng nhập để xem thông báo." />;
  if (loading) return <LoadingState message="Đang tải thông báo..." />;
  if (error) return <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void load()} />;
  if (items.length === 0) return <EmptyState title="Chưa có thông báo" message="Thông báo dành cho tài khoản đang đăng nhập sẽ hiển thị tại đây." />;

  return (
    <section className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">Notification Service</p>
        <h1>Thông báo</h1>
        <p>Danh sách thông báo, trạng thái chưa đọc/đã đọc và điều hướng đến nội dung được phép xem.</p>
      </header>
      <section className="panel">
        <div className="panel-heading">
          <h2>Danh sách</h2>
          <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Đang tải..." : "Làm mới"}</button>
        </div>
        {items.map((n) => (
          <article key={n.id} style={{ borderTop: "1px solid #e5e9f0", padding: "12px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
            <div>
              <strong style={{ opacity: n.status === "UNREAD" ? 1 : 0.7 }}>{n.title} {n.status === "UNREAD" && <span style={{ background: "#0F766E", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 10 }}>UNREAD</span>}</strong>
              <p style={{ margin: "4px 0", fontSize: 14 }}>{n.message}</p>
              <span style={{ fontSize: 12, color: "#647083" }}>{new Date(n.createdAt).toLocaleString("vi-VN")} • {n.type}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {n.status === "UNREAD" && <button onClick={() => void markRead(n.id)}>Đánh dấu đã đọc</button>}
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
