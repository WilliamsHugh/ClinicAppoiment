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

function getInitials(name?: string, role?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].substring(0, 2).toUpperCase();
    }
  }
  if (role === "DOCTOR") return "BS";
  if (role === "STAFF") return "NV";
  if (role === "ADMIN") return "AD";
  return "HH";
}

function getRoleLabel(role?: string): string {
  if (role === "DOCTOR") return "Bác sĩ";
  if (role === "STAFF") return "Trợ lý phòng khám";
  if (role === "ADMIN") return "Quản trị viên";
  return "Người dùng";
}

export function AppShell({ children, NotificationSlot }: AppShellProps) {
  const pathname = usePathname();
  const session = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = session.identity?.role;
  const displayName = session.identity?.displayName || session.identity?.role || "Tài khoản";
  const initials = getInitials(session.identity?.displayName, role);
  const roleLabel = getRoleLabel(role);

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh", background: "var(--canvas)" }}>
      {/* Sidebar (Left, 232px width per Anima ApplicationSidebarSection) */}
      <aside
        className={`shell-sidebar ${mobileMenuOpen ? "sidebar-mobile-open" : ""}`}
        aria-label="Thanh điều hướng chính"
        style={{
          width: 232,
          backgroundColor: "#ffffff",
          borderRight: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          minHeight: "100vh",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Link
            className="brand"
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "var(--ink)",
              fontWeight: 700,
              fontSize: "1rem",
            }}
          >
            <span
              className="brand-mark"
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: "var(--primary-light)",
                color: "var(--primary)",
                fontWeight: 800,
                fontSize: "1.1rem",
              }}
            >
              +
            </span>
            <span>Health&amp;Human</span>
          </Link>
        </div>

        {/* Navigation list */}
        <nav
          className="navigation"
          aria-label="Điều hướng ứng dụng"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "14px 10px",
            flex: 1,
            borderRight: "none",
            minHeight: "auto",
          }}
        >
          {visibleRoutes(session).map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 6,
                  color: isActive ? "var(--primary)" : "var(--ink)",
                  backgroundColor: isActive ? "var(--primary-light)" : "transparent",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <span>{route.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer User Box */}
        {session.status === "authenticated" ? (
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--primary-light)",
              borderTop: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "#ffffff",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "0.85rem",
                flexShrink: 0,
                boxShadow: "0 1px 2px rgba(45, 91, 255, 0.1)",
              }}
              aria-hidden="true"
            >
              {initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {displayName}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {roleLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={() => session.signOut()}
              className="logout-button"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              style={{
                background: "transparent",
                border: "none",
                padding: "4px 6px",
                cursor: "pointer",
                color: "var(--danger)",
                borderRadius: 4,
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              Thoát
            </button>
          </div>
        ) : null}
      </aside>

      {/* Main Area: Topbar + Content */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <header
          className="topbar"
          style={{
            height: 56,
            backgroundColor: "#ffffff",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 clamp(16px, 3vw, 28px)",
          }}
        >
          {/* Mobile menu toggle & Subtitle */}
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
                border: "1px solid var(--line)",
                borderRadius: 6,
                color: "var(--ink)",
                fontSize: "1.1rem",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              ☰
            </button>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>
              Thứ Năm, 19/10/2026 · Múi giờ GMT+7
            </span>
          </div>

          {/* Right actions: NotificationSlot + Role badge + Session */}
          <div className="session-summary" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {session.status === "authenticated" && (
              <>
                {NotificationSlot ? (
                  <div id="notification-slot" style={{ display: "flex", alignItems: "center" }}>
                    {NotificationSlot}
                  </div>
                ) : (
                  <Link
                    href="/notifications"
                    title="Thông báo"
                    style={{
                      color: "var(--primary)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      padding: "5px 10px",
                      borderRadius: 6,
                      background: "var(--primary-light)",
                      fontSize: "0.8125rem",
                      gap: 4,
                      fontWeight: 600,
                    }}
                  >
                    <span aria-hidden="true">🔔</span>
                    <span>Thông báo</span>
                  </Link>
                )}

                <Badge variant="info" size="sm">
                  {role}
                </Badge>
              </>
            )}

            <span
              className={`session-dot session-dot-${session.status}`}
              aria-hidden="true"
            />
            <span style={{ fontSize: "0.8125rem", color: "var(--ink)", fontWeight: 500 }}>
              {session.status === "authenticated"
                ? displayName
                : session.status === "loading"
                ? "Đang tải…"
                : "Chưa đăng nhập"}
            </span>

            {session.status === "unauthenticated" ? (
              <Link
                href="/auth"
                style={{
                  background: "var(--primary)",
                  color: "#ffffff",
                  padding: "6px 14px",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                }}
              >
                Đăng nhập
              </Link>
            ) : null}
          </div>
        </header>

        {/* Content Area */}
        <main className="content" style={{ flex: 1, padding: "clamp(20px, 3vw, 36px)", minWidth: 0 }}>
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
