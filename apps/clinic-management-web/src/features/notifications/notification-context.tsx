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
import { createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";

export interface NotificationContextType {
  unreadCount: number;
  loading: boolean;
  refreshUnreadCount: () => Promise<void>;
  decrementUnreadCount: (by?: number) => void;
  setUnreadCount: (countOrUpdater: number | ((prev: number) => number)) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (ids?: string[]) => Promise<void>;
}

const defaultContextValue: NotificationContextType = {
  unreadCount: 0,
  loading: false,
  refreshUnreadCount: async () => {},
  decrementUnreadCount: () => {},
  setUnreadCount: () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
};

export const NotificationContext = createContext<NotificationContextType>(defaultContextValue);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);

  const [unreadCount, setUnreadCountState] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const refreshUnreadCount = useCallback(async () => {
    if (session.status !== "authenticated") {
      setUnreadCountState(0);
      return;
    }

    setLoading(true);
    try {
      const res = await client.get<{ items?: Array<{ status: string }>; total?: number }>(
        "/api/v1/notifications",
        {
          query: {
            status: "UNREAD",
            page: 1,
            limit: 100,
          },
        }
      );

      if (typeof res.data?.total === "number") {
        setUnreadCountState(res.data.total);
      } else if (Array.isArray(res.data?.items)) {
        setUnreadCountState(
          res.data.items.filter((item) => item.status === "UNREAD").length
        );
      } else {
        setUnreadCountState(0);
      }
    } catch {
      // Don't crash if notifications endpoint is unreachable; preserve current count
    } finally {
      setLoading(false);
    }
  }, [client, session.status]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void refreshUnreadCount();
    } else {
      setUnreadCountState(0);
    }
  }, [session.status, refreshUnreadCount]);

  const decrementUnreadCount = useCallback((by: number = 1) => {
    setUnreadCountState((prev) => Math.max(0, prev - by));
  }, []);

  const setUnreadCount = useCallback(
    (countOrUpdater: number | ((prev: number) => number)) => {
      setUnreadCountState((prev) => {
        const next = typeof countOrUpdater === "function" ? countOrUpdater(prev) : countOrUpdater;
        return Math.max(0, next);
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

  const contextValue = useMemo<NotificationContextType>(
    () => ({
      unreadCount,
      loading,
      refreshUnreadCount,
      decrementUnreadCount,
      setUnreadCount,
      markAsRead,
      markAllAsRead,
    }),
    [
      unreadCount,
      loading,
      refreshUnreadCount,
      decrementUnreadCount,
      setUnreadCount,
      markAsRead,
      markAllAsRead,
    ]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  return context ?? defaultContextValue;
}
