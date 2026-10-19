"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, type ReactNode } from "react";
import { visibleRoutes } from "../lib/navigation/routes";
import { useSession } from "../lib/session/session-context";
import { RouteGuard } from "./route-guard";
import { Badge } from "./ui";

export interface AppShellProps {
  children: ReactNode;
  /** Integration slot for TV4's Notification Popover in Header */
  NotificationSlot?: ReactNode;
}

export function AppShell({ children, NotificationSlot }: AppShellProps) {
  const pathname = usePathname();
  const session = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = session.identity?.role;
  const displayName = session.identity?.displayName || session.identity?.role || "Tài khoản";

  return (
    <div className="app-shell">
      <header className="topbar">
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label="Mở menu điều hướng"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            style={{
              display: "none",
              background: "transparent",
              border: "none",
              color: "#ffffff",
              fontSize: "1.25rem",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ☰
          </button>
          <Link className="brand" href="/" onClick={() => setMobileMenuOpen(false)}>
            <span className="brand-mark" aria-hidden="true">
              +
            </span>
            <span>Health&amp;Human</span>
          </Link>
        </div>

        {/* Right side: Notification slot + Session summary */}
        <div className="session-summary" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {session.status === "authenticated" && (
            <>
              {/* Notification Slot (TV4 integrates Popover here) */}
              {NotificationSlot ? (
                <div id="notification-slot" style={{ display: "flex", alignItems: "center" }}>
                  {NotificationSlot}
                </div>
              ) : (
                <Link
                  href="/notifications"
                  title="Thông báo"
                  style={{
                    color: "#b7f1e9",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.1)",
                    fontSize: "0.85rem",
                    gap: 4,
                  }}
                >
                  <span aria-hidden="true">🔔</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Thông báo</span>
                </Link>
              )}

              {/* Role badge */}
              <Badge variant="info" size="sm">
                {role}
              </Badge>
            </>
          )}

          <span
            className={`session-dot session-dot-${session.status}`}
            aria-hidden="true"
          />
          <span style={{ fontSize: "0.875rem" }}>
            {session.status === "authenticated"
              ? displayName
              : session.status === "loading"
              ? "Đang tải…"
              : "Chưa đăng nhập"}
          </span>

          {session.status === "authenticated" ? (
            <button
              type="button"
              onClick={() => session.signOut()}
              className="logout-button"
              style={{
                marginLeft: "4px",
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                color: "#ffffff",
                borderRadius: "6px",
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              Đăng xuất
            </button>
          ) : session.status === "unauthenticated" ? (
            <Link
              href="/auth"
              style={{
                background: "#087f8c",
                color: "#ffffff",
                padding: "6px 14px",
                borderRadius: "6px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              Đăng nhập
            </Link>
          ) : null}
        </div>
      </header>

      <div className="shell-body">
        {/* Navigation Sidebar */}
        <nav
          className={`navigation ${mobileMenuOpen ? "navigation-open" : ""}`}
          aria-label="Điều hướng chính"
        >
          {visibleRoutes(session).map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                {route.label}
              </Link>
            );
          })}
        </nav>

        {/* Content Area */}
        <main className="content">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
