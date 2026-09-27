"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { unauthenticatedSession, type ClinicRole, type Session, type SessionIdentity, type SessionStatus } from "./session";

const SESSION_STORAGE_KEY = "clinic_web_session";

interface StoredSessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  identity: SessionIdentity;
}

const SessionContext = createContext<Session>(unauthenticatedSession);

export function SessionProvider({
  children,
  session: overrideSession,
}: {
  children: ReactNode;
  session?: Session;
}) {
  if (overrideSession) {
    return <SessionContext.Provider value={overrideSession}>{children}</SessionContext.Provider>;
  }

  return <RealSessionProvider>{children}</RealSessionProvider>;
}

function RealSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const [tokens, setTokens] = useState<{ accessToken: string; refreshToken: string; expiresAt: Date } | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) {
        setStatus("unauthenticated");
        return;
      }
      const data: StoredSessionData = JSON.parse(stored);
      if (!data.accessToken || !data.refreshToken || !data.identity) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setStatus("unauthenticated");
        return;
      }

      const expiresAt = new Date(data.expiresAt);
      setIdentity(data.identity);
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt });
      setStatus("authenticated");

      if (Date.now() >= expiresAt.getTime() - 60000) {
        refreshSession(data.refreshToken);
      }
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshSession = async (currentRefreshToken?: string): Promise<string | null> => {
    const refToken = currentRefreshToken ?? tokens?.refreshToken;
    if (!refToken) {
      handleSignOut();
      return null;
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refToken }),
      });
      if (!response.ok) {
        handleSignOut();
        return null;
      }
      const body = await response.json();
      if (!body.success || !body.data?.accessToken) {
        handleSignOut();
        return null;
      }
      const { accessToken, refreshToken: newRefreshToken, expiresIn, user } = body.data;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      const newTokens = { accessToken, refreshToken: newRefreshToken, expiresAt };
      setTokens(newTokens);

      const updatedIdentity: SessionIdentity = {
        id: user.id,
        role: user.role as ClinicRole,
        displayName: identity?.displayName ?? user.role,
        email: identity?.email,
        phone: identity?.phone,
      };
      setIdentity(updatedIdentity);

      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          accessToken,
          refreshToken: newRefreshToken,
          expiresAt: expiresAt.toISOString(),
          identity: updatedIdentity,
        }),
      );
      return accessToken;
    } catch {
      handleSignOut();
      return null;
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!tokens) return null;
    if (Date.now() >= tokens.expiresAt.getTime() - 30000) {
      return refreshSession(tokens.refreshToken);
    }
    return tokens.accessToken;
  };

  const handleSignIn = async (email: string, password: string) => {
    setStatus("loading");
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setStatus("unauthenticated");
        const message = data.error?.message || "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.";
        throw new Error(message);
      }

      const { accessToken, refreshToken, expiresIn, user } = data.data;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      let displayName = user.role;
      let userEmail = email;
      let userPhone: string | undefined;

      try {
        const profileRes = await fetch(`${baseUrl}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.success && profileData.data) {
            displayName = profileData.data.fullName || user.role;
            userEmail = profileData.data.email || email;
            userPhone = profileData.data.phone;
          }
        }
      } catch {
        // Fallback to role name
      }

      const newIdentity: SessionIdentity = {
        id: user.id,
        role: user.role as ClinicRole,
        displayName,
        email: userEmail,
        phone: userPhone,
      };

      setTokens({ accessToken, refreshToken, expiresAt });
      setIdentity(newIdentity);
      setStatus("authenticated");

      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          accessToken,
          refreshToken,
          expiresAt: expiresAt.toISOString(),
          identity: newIdentity,
        }),
      );
    } catch (err) {
      setStatus("unauthenticated");
      throw err;
    }
  };

  const handleSignOut = async () => {
    const accessToken = tokens?.accessToken;
    const refreshToken = tokens?.refreshToken;
    if (accessToken && refreshToken) {
      try {
        await fetch(`${baseUrl}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Ignore logout network errors
      }
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setTokens(null);
    setIdentity(null);
    setStatus("unauthenticated");
  };

  const sessionValue: Session = {
    status,
    identity,
    getAccessToken,
    signIn: handleSignIn,
    signOut: handleSignOut,
  };

  return <SessionContext.Provider value={sessionValue}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
