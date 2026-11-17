"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Skeleton } from "../../components/ui";
import { EmptyState, ErrorState } from "../../components/states";
import { Pagination } from "../../components/pagination";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import type { Session } from "../../lib/session/session";
import { Notification, NotificationItem } from "./notification-item";
import { useNotifications } from "./notification-context";
import { PageHeader } from "../../components/page-header";
import styles from "./notifications-panel.module.css";

export type NotificationFilter = "ALL" | "UNREAD" | "READ";

export function NotificationsPanel() {
  const session = useSession();
  return <NotificationsPanelWorkspace key={`${session.status}:${session.identity?.id ?? ""}:${session.identity?.role ?? ""}`} session={session} />;
}

function NotificationsPanelWorkspace({ session }: { session: Session }) {
  const currentSession = useRef(session);
  currentSession.current = session;
  const client = useMemo(() => createBrowserApiClient({
    getAccessToken: () => currentSession.current.getAccessToken(),
    handleUnauthorized: async () => { await currentSession.current.handleUnauthorized?.(); },
  }), []);
  const {
    unreadCount,
    setUnreadCount,
    decrementUnreadCount,
    refreshUnreadCount,
  } = useNotifications();

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("ALL");
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [total, setTotal] = useState(0);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [markingAllGlobal, setMarkingAllGlobal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestVersion = useRef(0);
  const mutationInFlight = useRef(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (session.status !== "authenticated") return;
    const version = ++requestVersion.current;
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const query: Record<string, string | number> = {
        page,
        limit,
      };
      if (filter !== "ALL") {
        query.status = filter;
      }

      const res = await client.get<{ items: Notification[]; total?: number }>(
        "/api/v1/notifications",
        { query }
      );

      if (version !== requestVersion.current) return;
      const fetchedItems = res.data?.items ?? [];
      setItems(fetchedItems);
      const totalCount = typeof res.data?.total === "number" ? res.data.total : fetchedItems.length;
      setTotal(totalCount);

      if (filter === "UNREAD" && typeof res.data?.total === "number") {
        setUnreadCount(totalCount);
      } else if (isRefresh && refreshUnreadCount) {
        void refreshUnreadCount();
      }
    } catch (caught) {
      if (version !== requestVersion.current) return;
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
          ? caught.message
          : "Không thể tải danh sách thông báo."
      );
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [client, session.status, page, limit, filter, setUnreadCount, refreshUnreadCount]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void loadNotifications();
    }
    return () => { requestVersion.current += 1; };
  }, [session.status, loadNotifications]);

  // Đổi bộ lọc -> reset về page 1 và xóa lỗi tạm thời
  const handleFilterChange = (newFilter: NotificationFilter) => {
    if (newFilter !== filter && !mutationInFlight.current) {
      requestVersion.current += 1;
      setItems([]);
      setLoading(true);
      setMutationError(null);
      setFilter(newFilter);
      setPage(1);
      setError(null);
    }
  };

  // Thử lại khi gặp lỗi mà không làm mất bộ lọc
  const handleRetry = () => {
    void loadNotifications(false);
  };

  // Đánh dấu 1 thông báo đã đọc
  const handleMarkRead = async (id: string) => {
    if (mutationInFlight.current || loading || isRefreshing) return;
    mutationInFlight.current = true;
    setMarkingIds((prev) => new Set(prev).add(id));
    setMutationError(null);
    try {
      await client.patch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
        body: {},
      });

      // Cập nhật trạng thái trực quan chỉ sau khi API thành công
      setItems((prev) =>
        filter === "UNREAD" ? prev.filter((item) => item.id !== id) : prev.map((item) => (item.id === id ? { ...item, status: "READ" } : item))
      );
      decrementUnreadCount(1);
      if (filter === "UNREAD") {
        setTotal((prev) => Math.max(0, prev - 1));
      }
    } catch (caught) {
      setMutationError(
        caught instanceof ApiClientError
          ? caught.message
          : "Không thể đánh dấu thông báo đã đọc."
      );
    } finally {
      mutationInFlight.current = false;
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Đánh dấu tất cả thông báo chưa đọc trong trang hiện tại là đã đọc
  const unreadOnPage = useMemo(() => {
    return items.filter((item) => item.status === "UNREAD");
  }, [items]);

  const handleMarkAllRead = async () => {
    if (mutationInFlight.current || loading || isRefreshing || unreadOnPage.length === 0) return;
    mutationInFlight.current = true;
    setMarkingAll(true);
    setMutationError(null);
    try {
      const results = await Promise.allSettled(
        unreadOnPage.map((item) =>
          client.patch(`/api/v1/notifications/${encodeURIComponent(item.id)}/read`, {
            body: {},
          })
        )
      );

      const successfulIds = new Set<string>();
      let hasError = false;
      results.forEach((res, index) => {
        if (res.status === "fulfilled") {
          successfulIds.add(unreadOnPage[index].id);
        } else {
          hasError = true;
        }
      });

      if (successfulIds.size > 0) {
        setItems((prev) =>
          filter === "UNREAD" ? prev.filter((item) => !successfulIds.has(item.id)) : prev.map((item) =>
            successfulIds.has(item.id) ? { ...item, status: "READ" } : item
          )
        );
        decrementUnreadCount(successfulIds.size);
        if (filter === "UNREAD") {
          setTotal((prev) => Math.max(0, prev - successfulIds.size));
        }
      }

      if (hasError) {
        setMutationError("Một số thông báo không thể đánh dấu đã đọc. Vui lòng thử lại.");
      }
    } catch (caught) {
      setMutationError(
        caught instanceof ApiClientError
          ? caught.message
          : "Không thể đánh dấu thông báo trên trang này đã đọc."
      );
    } finally {
      mutationInFlight.current = false;
      setMarkingAll(false);
    }
  };

  const handleMarkAllGlobal = async () => {
    if (mutationInFlight.current || loading || isRefreshing) return;
    mutationInFlight.current = true;
    setMarkingAllGlobal(true);
    setMutationError(null);
    try {
      const res = await client.patch<{
        updatedCount: number;
        unreadCount: number;
        readBefore: string;
        readAt: string;
      }>("/api/v1/notifications/read-all", {
        body: {},
      });

      const serverCutoff = res.data?.readBefore ? new Date(res.data.readBefore).getTime() : Date.now();
      const serverUnreadCount = typeof res.data?.unreadCount === "number" ? res.data.unreadCount : 0;

      setItems((prev) => {
        if (filter === "UNREAD") {
          return prev.filter((item) => new Date(item.createdAt).getTime() > serverCutoff);
        }
        return prev.map((item) => {
          if (new Date(item.createdAt).getTime() <= serverCutoff) {
            return { ...item, status: "READ" };
          }
          return item;
        });
      });

      setUnreadCount(serverUnreadCount);
      if (filter === "UNREAD") {
        setTotal(serverUnreadCount);
      } else if (typeof res.data?.unreadCount !== "number" && refreshUnreadCount) {
        void refreshUnreadCount();
      }
    } catch (caught: unknown) {
      setMutationError(
        caught instanceof Error
          ? caught.message
          : "Không thể đánh dấu đã đọc tất cả thông báo. Vui lòng thử lại."
      );
    } finally {
      mutationInFlight.current = false;
      setMarkingAllGlobal(false);
    }
  };

  if (session.status === "loading") {
    return (
      <div className="page-stack" aria-busy="true">
        <PageHeader
          pathname="/notifications"
          actions={
            <div className={styles.headerActions}>
              <Button variant="secondary" size="sm" disabled>
                Đánh dấu trang này đã đọc
              </Button>
              <Button variant="ghost" size="sm" disabled>
                Làm mới
              </Button>
            </div>
          }
        />

        <section className={styles.filterBar} aria-label="Bộ lọc thông báo">
          <div className={styles.tabGroup} role="group" aria-label="Lọc theo trạng thái đọc">
            <Button variant="primary" size="sm" disabled>Tất cả</Button>
            <Button variant="secondary" size="sm" disabled>Chưa đọc</Button>
            <Button variant="secondary" size="sm" disabled>Đã đọc</Button>
          </div>
        </section>

        <section aria-label="Danh sách thông báo" className={styles.listContainer}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeletonCard}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Skeleton height={20} width={70} />
                  <Skeleton height={20} width={60} />
                  <Skeleton height={20} width={180} />
                </div>
                <Skeleton height={16} width="85%" />
                <Skeleton height={14} width="40%" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (session.status !== "authenticated") {
    return <ErrorState message="Bạn cần đăng nhập để truy cập trang thông báo." />;
  }

  return (
    <div className="page-stack">
      {/* Header */}
      <PageHeader
        pathname="/notifications"
        actions={
          <div className={styles.headerActions}>
            {typeof unreadCount === "number" && unreadCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMarkAllGlobal}
                loading={markingAllGlobal}
                disabled={loading || isRefreshing || markingAllGlobal || markingAll || markingIds.size > 0}
              >
                Đánh dấu tất cả đã đọc
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkAllRead}
              loading={markingAll}
              disabled={loading || isRefreshing || markingAll || markingAllGlobal || markingIds.size > 0 || unreadOnPage.length === 0}
            >
              Đánh dấu trang này đã đọc
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadNotifications(true)}
              disabled={loading || isRefreshing || markingAll || markingIds.size > 0}
              loading={isRefreshing}
            >
              Làm mới
            </Button>
          </div>
        }
      />

      {/* Filter Tabs & Quick Summary */}
      <section className={styles.filterBar} aria-label="Bộ lọc thông báo">
        <div className={styles.tabGroup} role="group" aria-label="Lọc theo trạng thái đọc">
          <Button
            variant={filter === "ALL" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleFilterChange("ALL")}
            disabled={markingAll || markingIds.size > 0}
            aria-pressed={filter === "ALL"}
          >
            Tất cả
          </Button>
          <Button
            variant={filter === "UNREAD" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleFilterChange("UNREAD")}
            disabled={markingAll || markingIds.size > 0}
            aria-pressed={filter === "UNREAD"}
          >
            Chưa đọc{typeof unreadCount === "number" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </Button>
          <Button
            variant={filter === "READ" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleFilterChange("READ")}
            disabled={markingAll || markingIds.size > 0}
            aria-pressed={filter === "READ"}
          >
            Đã đọc
          </Button>
        </div>

        <span className={styles.filterCount}>
          {loading ? "Đang tải danh sách..." : `Hiển thị ${items.length} / ${total} thông báo`}
        </span>
      </section>

      {mutationError && <Alert variant="danger" title="Chưa cập nhật được trạng thái đọc">{mutationError} Các thông báo chưa cập nhật vẫn được giữ để thử lại.</Alert>}

      {/* Main Content / Notification List */}
      <section aria-label="Danh sách thông báo" className={styles.listContainer}>
        {/* Error cảnh báo khi refresh thất bại nhưng vẫn giữ dữ liệu cũ */}
        {error && items.length > 0 && (
          <Alert variant="warning" title="Không thể làm mới danh sách">
            Đang giữ dữ liệu đã tải trước đó. {error}{" "}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadNotifications(false)}
            >
              Thử lại
            </Button>
          </Alert>
        )}

        {/* Stale data indicator khi đang làm mới */}
        {isRefreshing && items.length > 0 && (
          <div
            className={styles.staleNotice}
            role="status"
            aria-live="polite"
            aria-label="Đang làm mới danh sách thông báo"
          >
            <Badge variant="warning" size="sm">
              Đang làm mới…
            </Badge>
            <span className={styles.staleText}>
              Đang tải dữ liệu thông báo mới nhất. Dữ liệu bên dưới được giữ từ lần tải trước.
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeletonCard} aria-busy="true">
                <div style={{ display: "flex", gap: 8 }}>
                  <Skeleton height={20} width={70} />
                  <Skeleton height={20} width={60} />
                  <Skeleton height={20} width={180} />
                </div>
                <Skeleton height={16} width="85%" />
                <Skeleton height={14} width="40%" />
              </div>
            ))}
          </div>
        ) : error && items.length === 0 ? (
          /* Error state: only rendered when initial fetch failed with no items */
          <ErrorState message={error} onRetry={handleRetry} />
        ) : items.length === 0 ? (
          /* Empty state: only rendered after successful response returning 0 items */
          filter === "UNREAD" ? (
            <EmptyState
              title={total > 0 ? "Trang này không còn thông báo chưa đọc" : "Không có thông báo chưa đọc"}
              message={total > 0 ? "Tải lại danh sách để xem các thông báo chưa đọc còn lại." : "Các thông báo chưa đọc sẽ xuất hiện tại đây."}
              action={{
                label: total > 0 ? "Tải lại thông báo chưa đọc" : "Xem tất cả thông báo",
                onClick: () => total > 0 ? void loadNotifications() : handleFilterChange("ALL"),
              }}
            />
          ) : filter === "READ" ? (
            <EmptyState
              title="Chưa có thông báo đã đọc"
              message="Các thông báo bạn đã đọc sẽ được lưu trữ và hiển thị tại đây."
              action={{
                label: "Xem tất cả thông báo",
                onClick: () => handleFilterChange("ALL"),
              }}
            />
          ) : (
            <EmptyState
              title="Chưa có thông báo nào"
              message={
                session.identity?.role === "DOCTOR"
                  ? "Thông báo về lịch khám được phân công và hồ sơ khám sẽ xuất hiện tại đây."
                  : session.identity?.role === "STAFF"
                  ? "Thông báo tiếp đón bệnh nhân và hàng đợi điều hành phòng khám sẽ xuất hiện tại đây."
                  : "Thông báo điều hành và cập nhật hệ thống dành cho tài khoản của bạn sẽ hiển thị tại đây."
              }
              action={{
                label: "Làm mới",
                onClick: () => void loadNotifications(),
              }}
            />
          )
        ) : (
          /* Populated list */
          items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
              isMarkingRead={markingIds.has(notification.id)}
              disabled={markingAll || markingIds.size > 0 || isRefreshing}
              userRole={session.identity?.role}
            />
          ))
        )}
      </section>

      {/* Pagination */}
      {total > limit && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          disabled={loading || isRefreshing || markingAll || markingIds.size > 0}
          onPageChange={(nextPage) => { requestVersion.current += 1; setItems([]); setLoading(true); setMutationError(null); setPage(nextPage); }}
        />
      )}
    </div>
  );
}
