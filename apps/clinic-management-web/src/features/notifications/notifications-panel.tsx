"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Skeleton } from "../../components/ui";
import { EmptyState, ErrorState, SkeletonPage } from "../../components/states";
import { Pagination } from "../../components/pagination";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { Notification, NotificationItem } from "./notification-item";
import styles from "./notifications-panel.module.css";

export type NotificationFilter = "ALL" | "UNREAD" | "READ";

export function NotificationsPanel() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("ALL");
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [total, setTotal] = useState(0);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (session.status !== "authenticated") return;
    setLoading(true);
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

      const fetchedItems = res.data?.items ?? [];
      setItems(fetchedItems);
      setTotal(typeof res.data?.total === "number" ? res.data.total : fetchedItems.length);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
          ? caught.message
          : "Không thể tải danh sách thông báo."
      );
    } finally {
      setLoading(false);
    }
  }, [client, session.status, page, limit, filter]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void loadNotifications();
    }
  }, [session.status, loadNotifications]);

  // Đổi bộ lọc -> reset về page 1
  const handleFilterChange = (newFilter: NotificationFilter) => {
    if (newFilter !== filter) {
      setFilter(newFilter);
      setPage(1);
    }
  };

  // Đánh dấu 1 thông báo đã đọc
  const handleMarkRead = async (id: string) => {
    setMarkingIds((prev) => new Set(prev).add(id));
    try {
      await client.patch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
        body: {},
      });

      // Cập nhật trạng thái trực quan ngay lập tức
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "READ" } : item))
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Không thể đánh dấu thông báo đã đọc."
      );
    } finally {
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
    if (unreadOnPage.length === 0) return;
    setMarkingAll(true);
    try {
      await Promise.all(
        unreadOnPage.map((item) =>
          client.patch(`/api/v1/notifications/${encodeURIComponent(item.id)}/read`, {
            body: {},
          })
        )
      );

      // Cập nhật tất cả thành READ
      setItems((prev) => prev.map((item) => ({ ...item, status: "READ" })));
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Không thể đánh dấu tất cả thông báo đã đọc."
      );
    } finally {
      setMarkingAll(false);
    }
  };

  if (session.status === "loading") {
    return <SkeletonPage title={true} tableRows={5} tableCols={4} />;
  }

  if (session.status !== "authenticated") {
    return <ErrorState message="Bạn cần đăng nhập để truy cập trang thông báo." />;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className="eyebrow">Trung tâm thông báo</p>
          <h1>Thông báo</h1>
          <p>Theo dõi các sự kiện lịch hẹn, hồ sơ bệnh án và cập nhật điều hành phòng khám.</p>
        </div>

        <div className={styles.headerActions}>
          {unreadOnPage.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkAllRead}
              loading={markingAll}
              disabled={loading || markingAll}
            >
              Đánh dấu tất cả đã đọc ({unreadOnPage.length})
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadNotifications()}
            disabled={loading}
          >
            {loading ? "Đang tải…" : "Làm mới"}
          </Button>
        </div>
      </header>

      {/* Filter Tabs & Quick Summary */}
      <section className={styles.filterBar} aria-label="Bộ lọc thông báo">
        <div className={styles.tabGroup} role="tablist">
          <Button
            variant={filter === "ALL" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleFilterChange("ALL")}
            role="tab"
            aria-selected={filter === "ALL"}
          >
            Tất cả
          </Button>
          <Button
            variant={filter === "UNREAD" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleFilterChange("UNREAD")}
            role="tab"
            aria-selected={filter === "UNREAD"}
          >
            Chưa đọc
          </Button>
          <Button
            variant={filter === "READ" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleFilterChange("READ")}
            role="tab"
            aria-selected={filter === "READ"}
          >
            Đã đọc
          </Button>
        </div>

        <span className={styles.filterCount}>
          {loading ? "Đang tải danh sách..." : `Hiển thị ${items.length} / ${total} thông báo`}
        </span>
      </section>

      {/* Error state */}
      {error && <ErrorState message={error} onRetry={() => void loadNotifications()} />}

      {/* Main Content / Notification List */}
      <section aria-label="Danh sách thông báo" className={styles.listContainer}>
        {loading && items.length === 0 ? (
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
        ) : items.length === 0 ? (
          filter === "UNREAD" ? (
            <EmptyState
              title="Không có thông báo chưa đọc"
              message="Bạn đã đọc hết tất cả các thông báo trong hàng đợi."
              action={{
                label: "Xem tất cả thông báo",
                onClick: () => handleFilterChange("ALL"),
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
              message="Thông báo điều hành và thông tin lâm sàng dành cho tài khoản của bạn sẽ hiển thị tại đây."
              action={{
                label: "Làm mới",
                onClick: () => void loadNotifications(),
              }}
            />
          )
        ) : (
          items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
              isMarkingRead={markingIds.has(notification.id)}
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
          disabled={loading}
          onPageChange={(nextPage) => setPage(nextPage)}
        />
      )}
    </div>
  );
}
