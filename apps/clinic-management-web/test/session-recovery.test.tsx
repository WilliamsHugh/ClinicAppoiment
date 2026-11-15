// @vitest-environment happy-dom

import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "../src/lib/session/session-context";
import { ApiClientError } from "../src/lib/api/client";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

function TestConsumer({ onSession }: { onSession?: (session: ReturnType<typeof useSession>) => void }) {
  const session = useSession();
  useEffect(() => {
    onSession?.(session);
  }, [session, onSession]);

  return (
    <div data-testid="session-info">
      <span data-testid="status">{session.status}</span>
      <span data-testid="user-id">{session.identity?.id ?? "none"}</span>
      <span data-testid="role">{session.identity?.role ?? "none"}</span>
      <span data-testid="recovery">{session.recovery?.message ?? "none"}</span>
      <span data-testid="pending">{session.recovery?.pending ? "pending" : "idle"}</span>
    </div>
  );
}

const mockStoredSession = {
  accessToken: "initial-access-token",
  refreshToken: "initial-refresh-token",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  identity: {
    id: "user-test-1",
    role: "DOCTOR" as const,
    displayName: "BS. Nguyễn Văn A",
    email: "doctor@clinic.local",
  },
};

const expiredStoredSession = {
  ...mockStoredSession,
  expiresAt: new Date(Date.now() - 60_000).toISOString(),
};

describe("SessionProvider Recovery, Concurrency & Terminal Errors", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("loads authenticated session from valid localStorage on mount", async () => {
    localStorage.setItem("clinic_web_session", JSON.stringify(mockStoredSession));

    await act(async () => {
      root.render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );
    });

    expect(host.querySelector("[data-testid='status']")?.textContent).toBe("authenticated");
    expect(host.querySelector("[data-testid='user-id']")?.textContent).toBe("user-test-1");
    expect(host.querySelector("[data-testid='role']")?.textContent).toBe("DOCTOR");
  });

  it("handles 5xx / network error during refresh by setting recovery and blocking access token", async () => {
    localStorage.setItem("clinic_web_session", JSON.stringify(expiredStoredSession));

    let fetchCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/refresh")) {
        fetchCallCount++;
        return new Response(JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    });

    let currentSession: ReturnType<typeof useSession> | undefined;

    await act(async () => {
      root.render(
        <SessionProvider>
          <TestConsumer onSession={(s) => { currentSession = s; }} />
        </SessionProvider>
      );
    });

    // Wait for the mount restore call
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchCallCount).toBeGreaterThanOrEqual(1);
    expect(host.querySelector("[data-testid='recovery']")?.textContent).toContain("Chưa thể làm mới phiên đăng nhập");

    // Credential is preserved in localStorage
    expect(localStorage.getItem("clinic_web_session")).not.toBeNull();

    // Access token usage throws SESSION_UNAVAILABLE ApiClientError rather than sending expired token
    await expect(currentSession!.getAccessToken()).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
  });

  it("coalesces concurrent refresh calls into a single network request", async () => {
    localStorage.setItem("clinic_web_session", JSON.stringify(expiredStoredSession));

    let refreshCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/refresh")) {
        refreshCallCount++;
        await new Promise((r) => setTimeout(r, 60));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              accessToken: "new-access-token",
              refreshToken: "new-refresh-token",
              expiresIn: 3600,
              user: { id: "user-test-1", role: "DOCTOR" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 404 });
    });

    let capturedSession: ReturnType<typeof useSession> | undefined;

    await act(async () => {
      root.render(
        <SessionProvider>
          <TestConsumer onSession={(s) => { capturedSession = s; }} />
        </SessionProvider>
      );
    });

    // Trigger multiple concurrent getAccessToken calls
    let tokens: [string | null, string | null, string | null] = [null, null, null];
    await act(async () => {
      tokens = await Promise.all([
        capturedSession!.getAccessToken(),
        capturedSession!.getAccessToken(),
        capturedSession!.getAccessToken(),
      ]);
    });

    expect(tokens[0]).toBe("new-access-token");
    expect(tokens[1]).toBe("new-access-token");
    expect(tokens[2]).toBe("new-access-token");
    expect(refreshCallCount).toBe(1);
  });

  it("clears local session immediately on 401 Unauthorized during refresh", async () => {
    localStorage.setItem("clinic_web_session", JSON.stringify(expiredStoredSession));

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/refresh")) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "REFRESH_TOKEN_EXPIRED" } }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 404 });
    });

    await act(async () => {
      root.render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(host.querySelector("[data-testid='status']")?.textContent).toBe("unauthenticated");
    expect(localStorage.getItem("clinic_web_session")).toBeNull();
  });

  it("clears local session on terminal 403 error (ACCOUNT_LOCKED)", async () => {
    localStorage.setItem("clinic_web_session", JSON.stringify(expiredStoredSession));

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/refresh")) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "ACCOUNT_LOCKED", message: "Tài khoản bị khóa" } }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 404 });
    });

    await act(async () => {
      root.render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(host.querySelector("[data-testid='status']")?.textContent).toBe("unauthenticated");
    expect(localStorage.getItem("clinic_web_session")).toBeNull();
  });

  it("clears local session if refresh returns a different user identity to prevent cross-account leak", async () => {
    localStorage.setItem("clinic_web_session", JSON.stringify(expiredStoredSession));

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/refresh")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              accessToken: "token-other-user",
              refreshToken: "refresh-other-user",
              expiresIn: 3600,
              user: { id: "different-user-999", role: "STAFF" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 404 });
    });

    await act(async () => {
      root.render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(host.querySelector("[data-testid='status']")?.textContent).toBe("unauthenticated");
    expect(localStorage.getItem("clinic_web_session")).toBeNull();
  });

  it("syncs logout across browser tabs via storage event", async () => {
    localStorage.setItem("clinic_web_session", JSON.stringify(mockStoredSession));

    await act(async () => {
      root.render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );
    });

    expect(host.querySelector("[data-testid='status']")?.textContent).toBe("authenticated");

    // Simulate another tab clearing the session
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "clinic_web_session",
          newValue: null,
        })
      );
    });

    expect(host.querySelector("[data-testid='status']")?.textContent).toBe("unauthenticated");
    expect(host.querySelector("[data-testid='user-id']")?.textContent).toBe("none");
  });
});
