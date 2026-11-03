"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, type ReactNode } from "react";
import { Menu, Bell } from "lucide-react";
import { visibleRoutes } from "../lib/navigation/routes";
import { useSession } from "../lib/session/session-context";
import { RouteGuard } from "./route-guard";
import { Badge } from "./ui";
import styles from "./app-shell.module.css";

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

  // Bypass AppShell chrome for /auth and for public unauthenticated visitors on /
  if (pathname === "/auth" || (pathname === "/" && session.status !== "authenticated")) {
    return <RouteGuard>{children}</RouteGuard>;
  }

  const role = session.identity?.role;
  const displayName = session.identity?.displayName || session.identity?.role || "Tài khoản";
  const initials = getInitials(session.identity?.displayName, role);
  const roleLabel = getRoleLabel(role);

  return (
    <div className={`${styles.shell} app-shell`}>
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className={styles.mobileBackdrop}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Left, 232px width per Anima ApplicationSidebarSection) */}
      <aside
        className={`${styles.sidebar} shell-sidebar ${mobileMenuOpen ? `${styles.sidebarMobileOpen} sidebar-mobile-open` : ""}`}
        aria-label="Thanh điều hướng chính"
      >
        {/* Brand Header */}
        <div className={styles.brandHeader}>
          <Link
            className={`${styles.brandLink} brand`}
            href="/"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Image
              src="/images/logo.png"
              alt="Health&Human Logo"
              width={28}
              height={28}
              className={`${styles.brandMark} brand-mark`}
              style={{ objectFit: "contain", padding: 2 }}
            />
            <span className={styles.brandText}>Health&amp;Human</span>
          </Link>
        </div>

        {/* Navigation list */}
        <nav
          className={`${styles.navigation} navigation`}
          aria-label="Điều hướng ứng dụng"
        >
          {visibleRoutes(session).map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
              >
                <span>{route.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer User Box */}
        {session.status === "authenticated" ? (
          <div className={styles.sidebarFooter}>
            <div className={styles.userAvatar} aria-hidden="true">
              {initials}
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{displayName}</div>
              <div className={styles.userRole}>{roleLabel}</div>
            </div>
            <button
              type="button"
              onClick={() => session.signOut()}
              className={`${styles.logoutButton} logout-button`}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              Thoát
            </button>
          </div>
        ) : null}
      </aside>

      {/* Main Area: Topbar + Content */}
      <div className={styles.mainArea}>
        <header className={`${styles.topbar} topbar`}>
          {/* Mobile menu toggle & Subtitle */}
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={`${styles.mobileMenuToggle} mobile-menu-toggle`}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <span className={styles.topbarSubtitle}>
              Thứ Năm, 19/10/2026 · Múi giờ GMT+7
            </span>
          </div>

          {/* Right actions: NotificationSlot + Role badge + Session */}
          <div className={`${styles.topbarRight} session-summary`}>
            {session.status === "authenticated" && (
              <>
                {NotificationSlot ? (
                  <div id="notification-slot" className={styles.notificationSlotWrapper}>
                    {NotificationSlot}
                  </div>
                ) : (
                  <Link
                    href="/notifications"
                    title="Thông báo"
                    className={styles.notificationLink}
                  >
                    <Bell size={16} aria-hidden="true" />
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
            <span className={styles.sessionStatusText}>
              {session.status === "authenticated"
                ? displayName
                : session.status === "loading"
                ? "Đang tải…"
                : "Chưa đăng nhập"}
            </span>

            {session.status === "unauthenticated" ? (
              <Link href="/auth" className={styles.loginLink}>
                Đăng nhập
              </Link>
            ) : null}
          </div>
        </header>

        {/* Content Area */}
        <main className={`${styles.content} content`}>
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
