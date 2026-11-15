"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiClientError } from "../api/client";
import { isClinicManagementRole, unauthenticatedSession, type Session, type SessionIdentity, type SessionStatus } from "./session";

const SESSION_STORAGE_KEY = "clinic_web_session";
const RECOVERY_MESSAGE = "Chưa thể làm mới phiên đăng nhập. Kiểm tra kết nối và thử lại. Thông tin phiên vẫn được giữ trên trình duyệt này.";
const TERMINAL_ACCOUNT_CODES = new Set(["ACCOUNT_LOCKED", "ACCOUNT_INACTIVE", "USER_PROFILE_NOT_FOUND"]);

interface StoredSessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  identity: SessionIdentity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readStoredSession(value: unknown): StoredSessionData | null {
  if (!isRecord(value) || !isRecord(value.identity)) return null;
  if (typeof value.accessToken !== "string" || !value.accessToken ||
      typeof value.refreshToken !== "string" || !value.refreshToken ||
      typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) ||
      typeof value.identity.id !== "string" || !value.identity.id ||
      typeof value.identity.role !== "string" || !isClinicManagementRole(value.identity.role)) return null;
  const identity: SessionIdentity = {
    id: value.identity.id,
    role: value.identity.role,
    displayName: typeof value.identity.displayName === "string" && value.identity.displayName !== value.identity.role
      ? value.identity.displayName : undefined,
    email: typeof value.identity.email === "string" ? value.identity.email : undefined,
    phone: typeof value.identity.phone === "string" ? value.identity.phone : undefined,
  };
  return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt, identity };
}

function readAuthSession(value: unknown, previousIdentity?: SessionIdentity): StoredSessionData | null {
  if (!isRecord(value) || !isRecord(value.user) ||
      typeof value.expiresIn !== "number" || !Number.isFinite(value.expiresIn) || value.expiresIn <= 0) return null;
  const expiry = Date.now() + value.expiresIn * 1000;
  if (!Number.isFinite(expiry) || expiry > 8.64e15) return null;
  return readStoredSession({
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: new Date(expiry).toISOString(),
    identity: { ...previousIdentity, id: value.user.id, role: value.user.role },
  });
}

async function authRequest(baseUrl: string, path: string, body: unknown, accessToken?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    return { response, payload: isRecord(payload) ? payload : null };
  } finally {
    clearTimeout(timeout);
  }
}

const SessionContext = createContext<Session>(unauthenticatedSession);

export function SessionProvider({ children, session: overrideSession }: { children: ReactNode; session?: Session }) {
  if (overrideSession) return <SessionContext.Provider value={overrideSession}>{children}</SessionContext.Provider>;
  return <RealSessionProvider>{children}</RealSessionProvider>;
}

function RealSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [storedSession, setStoredSession] = useState<StoredSessionData | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const current = useRef<StoredSessionData | null>(null);
  const pendingMfa = useRef<{ next: StoredSessionData; sessionId?: string } | null>(null);
  const blocked = useRef(false);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const generation = useRef(0);
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

  const clearLocalSession = useCallback(() => {
    generation.current += 1;
    current.current = null;
    pendingMfa.current = null;
    blocked.current = false;
    refreshInFlight.current = null;
    setStoredSession(null);
    setRecoveryMessage(null);
    setRefreshPending(false);
    setStatus("unauthenticated");
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }, []);

  const saveSession = useCallback((next: StoredSessionData) => {
    current.current = next;
    setStoredSession(next);
    try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the usable session in memory. */ }
  }, []);

  const refreshSession = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const previous = current.current;
    if (!previous) return Promise.resolve(null);
    const requestGeneration = generation.current;
    setRefreshPending(true);
    if (blocked.current || Date.now() >= Date.parse(previous.expiresAt)) {
      blocked.current = true;
      setRecoveryMessage("Đang khôi phục phiên đăng nhập…");
    }

    const operation = (async () => {
      try {
        const { response, payload } = await authRequest(baseUrl, "refresh", { refreshToken: previous.refreshToken });
        if (generation.current !== requestGeneration) return null;
        const error = isRecord(payload?.error) ? payload.error : null;
        if (response.status === 401 ||
            (response.status === 403 && typeof error?.code === "string" && TERMINAL_ACCOUNT_CODES.has(error.code))) {
          clearLocalSession();
          return null;
        }
        if (!response.ok || payload?.success !== true) throw new Error("Refresh unavailable");
        const next = readAuthSession(payload.data, previous.identity);
        if (!next) throw new Error("Invalid refresh response");
        if (next.identity.id !== previous.identity.id) {
          clearLocalSession();
          return null;
        }
        saveSession(next);
        blocked.current = false;
        setRecoveryMessage(null);
        setStatus("authenticated");
        return next.accessToken;
      } catch {
        if (generation.current === requestGeneration) {
          blocked.current = true;
          setRecoveryMessage(RECOVERY_MESSAGE);
        }
        return null;
      } finally {
        if (generation.current === requestGeneration) {
          refreshInFlight.current = null;
          setRefreshPending(false);
        }
      }
    })();
    refreshInFlight.current = operation;
    return operation;
  }, [baseUrl, clearLocalSession, saveSession]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const data = current.current;
    if (!data) return null;
    if (blocked.current || Date.now() >= Date.parse(data.expiresAt) - 30_000) {
      const token = blocked.current ? await refreshInFlight.current : await refreshSession();
      if (!token && blocked.current) throw new ApiClientError(RECOVERY_MESSAGE, 0, "SESSION_UNAVAILABLE");
      return token;
    }
    return data.accessToken;
  }, [refreshSession]);

  useEffect(() => {
    let active = true;
    let data: StoredSessionData | null = null;
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) data = readStoredSession(JSON.parse(stored));
    } catch { /* Unreadable storage cannot restore credentials. */ }
    if (!data) {
      clearLocalSession();
      return;
    }
    current.current = data;
    setStoredSession(data);
    setStatus("authenticated");

    const restore = async () => {
      const token = Date.now() >= Date.parse(data.expiresAt) - 60_000 ? await refreshSession() : data.accessToken;
      if (!active || !token || current.current?.identity.displayName) return;
      const restored = current.current;
      const requestGeneration = generation.current;
      try {
        const response = await fetch(`${baseUrl}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        const profile = await response.json();
        if (!active || generation.current !== requestGeneration || !response.ok || !profile.success ||
            typeof profile.data?.fullName !== "string" || !profile.data.fullName.trim()) return;
        const latest = current.current;
        if (latest && latest.identity.id === restored?.identity.id) {
          saveSession({ ...latest, identity: { ...latest.identity, displayName: profile.data.fullName.trim() } });
        }
      } catch { /* Identity enrichment can be retried by the profile page. */ }
    };
    void restore();
    return () => { active = false; };
  }, [baseUrl, clearLocalSession, refreshSession, saveSession]);

  useEffect(() => {
    const recoverOnline = () => { if (blocked.current) void refreshSession(); };
    const syncLogout = (event: StorageEvent) => {
      if (event.key === SESSION_STORAGE_KEY && !event.newValue) clearLocalSession();
    };
    window.addEventListener("online", recoverOnline);
    window.addEventListener("storage", syncLogout);
    return () => {
      window.removeEventListener("online", recoverOnline);
      window.removeEventListener("storage", syncLogout);
    };
  }, [clearLocalSession, refreshSession]);

  const handleSignIn = async (email: string, password: string) => {
    clearLocalSession();
    const requestGeneration = generation.current;
    setStatus("loading");
    try {
      const { response, payload } = await authRequest(baseUrl, "login", { email, password });
      if (generation.current !== requestGeneration) throw new Error("Yêu cầu đăng nhập đã kết thúc.");
      if (!response.ok || payload?.success !== true) {
        const error = isRecord(payload?.error) ? payload.error : null;
        throw new Error(typeof error?.message === "string" ? error.message : "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
      }
      const next = readAuthSession(payload.data);
      if (!next) throw new Error("Không thể đăng nhập. Clinic Management Web chỉ dành cho bác sĩ, nhân viên và quản trị viên.");
      next.identity.email = email;

      const sessionObj = isRecord(payload.data) && isRecord(payload.data.session) ? payload.data.session : null;
      if (sessionObj && sessionObj.status === "PENDING_MFA") {
        const sessionId = typeof sessionObj.sessionId === "string" ? sessionObj.sessionId : undefined;
        pendingMfa.current = { next, sessionId };
        setStatus("unauthenticated");
        let challengeId: string | undefined;
        try {
          const chRes = await fetch(`${baseUrl}/api/v1/auth/mfa/challenges`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${next.accessToken}`,
            },
            body: JSON.stringify({ purpose: "STAFF_ADMIN_LOGIN" }),
          });
          const chPayload = await chRes.json();
          if (chRes.ok && chPayload.success && chPayload.data?.challengeId) {
            challengeId = chPayload.data.challengeId;
          }
        } catch { /* challenge creation fallback */ }
        return { pendingMfa: true, challengeId, sessionId };
      }

      try {
        const profileRes = await fetch(`${baseUrl}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${next.accessToken}` }, cache: "no-store",
        });
        const profile = await profileRes.json();
        if (profileRes.ok && profile.success && profile.data) {
          next.identity.displayName = typeof profile.data.fullName === "string" ? profile.data.fullName : undefined;
          next.identity.email = typeof profile.data.email === "string" ? profile.data.email : email;
          next.identity.phone = typeof profile.data.phone === "string" ? profile.data.phone : undefined;
        }
      } catch { /* Login remains usable when profile enrichment is unavailable. */ }
      if (generation.current !== requestGeneration) throw new Error("Yêu cầu đăng nhập đã kết thúc.");
      saveSession(next);
      setStatus("authenticated");
      return { pendingMfa: false };
    } catch (cause) {
      if (generation.current === requestGeneration) setStatus("unauthenticated");
      throw cause;
    }
  };

  const handleVerifyMfa = async (code: string, challengeId?: string) => {
    const pending = pendingMfa.current;
    if (!pending) throw new Error("Không có phiên đăng nhập chờ xác thực TOTP.");
    setStatus("loading");
    try {
      let cid = challengeId;
      if (!cid) {
        const chRes = await fetch(`${baseUrl}/api/v1/auth/mfa/challenges`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pending.next.accessToken}`,
          },
          body: JSON.stringify({ purpose: "STAFF_ADMIN_LOGIN" }),
        });
        const chPayload = await chRes.json();
        if (!chRes.ok || !chPayload.success) {
          throw new Error(chPayload?.error?.message || "Không thể tạo yêu cầu xác thực TOTP.");
        }
        cid = chPayload.data.challengeId;
      }

      const verifyRes = await fetch(`${baseUrl}/api/v1/auth/mfa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pending.next.accessToken}`,
        },
        body: JSON.stringify({
          challengeId: cid,
          code,
          sessionId: pending.sessionId,
        }),
      });
      const verifyPayload = await verifyRes.json();
      if (!verifyRes.ok || !verifyPayload.success) {
        throw new Error(verifyPayload?.error?.message || "Mã xác thực TOTP không chính xác hoặc đã hết hạn.");
      }

      const next = pending.next;
      try {
        const profileRes = await fetch(`${baseUrl}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${next.accessToken}` },
          cache: "no-store",
        });
        const profile = await profileRes.json();
        if (profileRes.ok && profile.success && profile.data) {
          next.identity.displayName = typeof profile.data.fullName === "string" ? profile.data.fullName : undefined;
          next.identity.phone = typeof profile.data.phone === "string" ? profile.data.phone : undefined;
        }
      } catch { /* profile */ }

      pendingMfa.current = null;
      saveSession(next);
      setStatus("authenticated");
    } catch (cause) {
      setStatus("unauthenticated");
      throw cause;
    }
  };

  const handleSignOut = async () => {
    const data = current.current;
    clearLocalSession();
    if (data) {
      try {
        await authRequest(baseUrl, "logout", { refreshToken: data.refreshToken }, data.accessToken);
      } catch { /* Local logout is intentional even when the server is unavailable. */ }
    }
    window.location.href = "/";
  };

  const sessionValue: Session = {
    status,
    identity: storedSession?.identity ?? null,
    recovery: recoveryMessage ? { message: recoveryMessage, pending: refreshPending, retry: async () => { await refreshSession(); } } : undefined,
    getAccessToken,
    signIn: handleSignIn,
    verifyMfa: handleVerifyMfa,
    signOut: handleSignOut,
    handleUnauthorized: async () => { clearLocalSession(); },
  };
  return <SessionContext.Provider value={sessionValue}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
