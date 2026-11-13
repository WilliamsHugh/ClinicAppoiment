"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";

export interface NotificationContextValue {
  unreadCount: number | null;
  isLoading: boolean;
  loading?: boolean;
  error?: string | null;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (countOrUpdater: number | null | ((prev: number | null) => number | null)) => void;
  decrementUnreadCount: (by?: number) => void;
  markAllReadSuccess?: () => void;
  markAsRead?: (id: string) => Promise<void>;
  markAllAsRead?: (ids?: string[]) => Promise<void>;
}

export type NotificationContextType = NotificationContextValue;

const defaultContextValue: NotificationContextValue = {
  unreadCount: null,
  isLoading: false,
  loading: false,
  error: null,
  refreshUnreadCount: async () => {},
  setUnreadCount: () => {},
  decrementUnreadCount: () => {},
  markAllReadSuccess: () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
};

export const NotificationContext = createContext<NotificationContextValue>(defaultContextValue);

export function NotificationProvider({
  children,
  initialUnreadCount,
}: {
  children: ReactNode;
  initialUnreadCount?: number | null;
}) {
  const session = useSession();
  const [unreadCount, setUnreadCountState] = useState<number | null>(
    typeof initialUnreadCount !== "undefined" ? initialUnreadCount : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => createBrowserApiClient(session), [session]);

  const refreshUnreadCount = useCallback(async () => {
    if (session.status !== "authenticated") {
      setUnreadCountState(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await client.get<{ items: unknown[]; total?: number }>(
        "/api/v1/notifications",
        { query: { status: "UNREAD", limit: 1 } }
      );
      const total = typeof res.data?.total === "number" ? res.data.total : 0;
      setUnreadCountState(total);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
          ? caught.message
          : "Không thể lấy số lượng thông báo chưa đọc."
      );
    } finally {
      setIsLoading(false);
    }
  }, [client, session.status]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void refreshUnreadCount();
    } else {
      setUnreadCountState(null);
      setIsLoading(false);
      setError(null);
    }
  }, [session.status, refreshUnreadCount]);

  const decrementUnreadCount = useCallback((by: number = 1) => {
    setUnreadCountState((prev) => {
      if (prev === null) return null;
      return Math.max(0, prev - by);
    });
  }, []);

  const markAllReadSuccess = useCallback(() => {
    setUnreadCountState(0);
  }, []);

  const setUnreadCount = useCallback(
    (countOrUpdater: number | null | ((prev: number | null) => number | null)) => {
      setUnreadCountState((prev) => {
        const next = typeof countOrUpdater === "function" ? countOrUpdater(prev) : countOrUpdater;
        return next === null ? null : Math.max(0, next);
      });
    },
    []
  );

  const markAsRead = useCallback(
    async (id: string) => {
      await client.patch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
        body: {},
      });
      decrementUnreadCount(1);
    },
    [client, decrementUnreadCount]
  );

  const markAllAsRead = useCallback(
    async (ids?: string[]) => {
      if (ids && ids.length > 0) {
        await Promise.all(
          ids.map((id) =>
            client.patch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
              body: {},
            })
          )
        );
        decrementUnreadCount(ids.length);
      } else {
        setUnreadCountState(0);
      }
    },
    [client, decrementUnreadCount]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      isLoading,
      loading: isLoading,
      error,
      refreshUnreadCount,
      setUnreadCount,
      decrementUnreadCount,
      markAllReadSuccess,
      markAsRead,
      markAllAsRead,
    }),
    [
      unreadCount,
      isLoading,
      error,
      refreshUnreadCount,
      setUnreadCount,
      decrementUnreadCount,
      markAllReadSuccess,
      markAsRead,
      markAllAsRead,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  return context ?? defaultContextValue;
}
