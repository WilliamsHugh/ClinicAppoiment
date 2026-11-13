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
  error: string | null;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: React.Dispatch<React.SetStateAction<number | null>>;
  decrementUnreadCount: (by?: number) => void;
  markAllReadSuccess: () => void;
}

const defaultContextValue: NotificationContextValue = {
  unreadCount: null,
  isLoading: false,
  error: null,
  refreshUnreadCount: async () => {},
  setUnreadCount: () => {},
  decrementUnreadCount: () => {},
  markAllReadSuccess: () => {},
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
  const [unreadCount, setUnreadCount] = useState<number | null>(
    typeof initialUnreadCount !== "undefined" ? initialUnreadCount : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => createBrowserApiClient(session), [session]);

  const refreshUnreadCount = useCallback(async () => {
    if (session.status !== "authenticated") {
      setUnreadCount(null);
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
      setUnreadCount(total);
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
      setUnreadCount(null);
      setIsLoading(false);
      setError(null);
    }
  }, [session.status, refreshUnreadCount]);

  const decrementUnreadCount = useCallback((by: number = 1) => {
    setUnreadCount((prev) => {
      if (prev === null) return null;
      return Math.max(0, prev - by);
    });
  }, []);

  const markAllReadSuccess = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      isLoading,
      error,
      refreshUnreadCount,
      setUnreadCount,
      decrementUnreadCount,
      markAllReadSuccess,
    }),
    [
      unreadCount,
      isLoading,
      error,
      refreshUnreadCount,
      setUnreadCount,
      decrementUnreadCount,
      markAllReadSuccess,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}
