"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { visibleRoutes } from "../lib/navigation/routes";
import { useSession } from "../lib/session/session-context";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const identityLabel = session.status === "authenticated" && session.identity
    ? `${session.identity.displayName ?? session.identity.role} (${session.identity.role})`
    : session.status === "loading" ? "Đang kiểm tra phiên..." : "Chưa đăng nhập";

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>Clinic Management</span>
        </Link>
        <div className="session-summary">
          <span className={`session-dot session-dot-${session.status}`} aria-hidden="true" />
          <span>{identityLabel}</span>
          {session.status === "authenticated" ? (
            <button
              type="button"
              onClick={() => session.signOut()}
              className="logout-button"
              style={{
                marginLeft: "8px",
                background: "transparent",
                border: "1px solid #cbd5e1",
                borderRadius: "4px",
                padding: "3px 8px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Đăng xuất
            </button>
          ) : session.status === "unauthenticated" ? (
            <Link href="/auth">Đăng nhập</Link>
          ) : null}
        </div>
      </header>
      <div className="shell-body">
        <nav className="navigation" aria-label="Điều hướng chính">
          {visibleRoutes(session).map((route) => (
            <Link key={route.href} href={route.href} aria-current={pathname === route.href ? "page" : undefined}>
              {route.label}
            </Link>
          ))}
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
