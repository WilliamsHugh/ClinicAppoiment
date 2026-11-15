"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useRef, useState, type ReactNode } from "react";
import { Menu, Bell, X } from "lucide-react";
import { visibleRoutes } from "../lib/navigation/routes";
import { formatVietnamDate } from "../lib/formatting/date-time";
import { useSession } from "../lib/session/session-context";
import { clinicRoleLabel, sessionDisplayName } from "../lib/session/session";
import { useNotifications } from "../features/notifications/notification-context";
import { RouteGuard } from "./route-guard";
import { Alert, Badge, Button, ConfirmModal } from "./ui";
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

export function AppShell({ children, NotificationSlot }: AppShellProps) {
  const pathname = usePathname();
  const session = useSession();
  const { unreadCount, isLoading: isLoadingUnread } = useNotifications();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileMenuOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  React.useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    drawerCloseRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
      } else if (event.key === "Tab") {
        const controls = sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  // The public clinic home and authentication pages use their own layouts.
  if (pathname === "/auth" || pathname === "/") {
    return <RouteGuard>{children}</RouteGuard>;
  }

  const role = session.identity?.role;
  const displayName = sessionDisplayName(session.identity) || "Tài khoản";
  const initials = getInitials(displayName, role);
  const todayLabel = formatVietnamDate(new Date());

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
        ref={sidebarRef}
        id="app-navigation"
        className={`${styles.sidebar} shell-sidebar ${mobileMenuOpen ? `${styles.sidebarMobileOpen} sidebar-mobile-open` : ""}`}
        aria-label="Thanh điều hướng chính"
        role={isMobile && mobileMenuOpen ? "dialog" : undefined}
        aria-modal={isMobile && mobileMenuOpen ? true : undefined}
        inert={isMobile && !mobileMenuOpen ? true : undefined}
      >
        {/* Brand Header */}
        <div className={styles.brandHeader}>
          <Link
            className={`${styles.brandLink} brand`}
            href="/"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className={`${styles.brandMark} brand-mark`}>
              <Image
                src="/images/logo.png"
                alt="Health&Human Logo"
                width={26}
                height={26}
                style={{ objectFit: "contain" }}
              />
            </span>
            <span className={styles.brandText}>Health&amp;Human</span>
          </Link>
          <button ref={drawerCloseRef} type="button" className={styles.drawerClose}
            aria-label="Đóng menu điều hướng" onClick={() => setMobileMenuOpen(false)}>
            <X size={20} aria-hidden="true" />
          </button>
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
            </div>
            <button
              type="button"
              onClick={() => setConfirmSignOutOpen(true)}
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
      <div className={styles.mainArea} inert={isMobile && mobileMenuOpen ? true : undefined}>
        <header className={`${styles.topbar} topbar`}>
          {/* Mobile menu toggle & Subtitle */}
          <div className={styles.topbarLeft}>
            <button
              ref={menuButtonRef}
              type="button"
              className={`${styles.mobileMenuToggle} mobile-menu-toggle`}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileMenuOpen}
              aria-controls="app-navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <span className={styles.topbarSubtitle}>
              {todayLabel} · Múi giờ GMT+7
            </span>
          </div>

          {/* Right actions: NotificationSlot + Role + Session */}
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
                    aria-label={
                      unreadCount !== null && unreadCount > 0
                        ? `Thông báo (${unreadCount} chưa đọc)`
                        : "Thông báo"
                    }
                  >
                    <div className={styles.bellWrapper}>
                      <Bell size={16} aria-hidden="true" />
                      {unreadCount !== null && unreadCount > 0 && (
                        <span
                          className={styles.notificationBadge}
                          aria-label={`${unreadCount} thông báo chưa đọc`}
                          data-testid="notification-badge"
                        >
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </div>
                    <span className={styles.notificationText}>Thông báo</span>
                    {isLoadingUnread && unreadCount === null ? (
                      <span
                        className={styles.notificationBadgeSkeleton}
                        aria-label="Đang nạp số lượng thông báo"
                        title="Đang tải..."
                      />
                    ) : null}
                  </Link>
                )}
                <Badge variant="info" size="sm">
                  {clinicRoleLabel(role)}
                </Badge>
              </>
            )}

            <span
              className={`session-dot session-dot-${session.status}`}
              aria-hidden="true"
            />
            <Link href="/profile" className={styles.sessionStatusText} title={displayName}>
              {session.status === "authenticated"
                ? displayName
                : session.status === "loading"
                ? "Đang tải…"
                : "Chưa đăng nhập"}
            </Link>

            {session.status === "unauthenticated" ? (
              <Link href="/auth" className={styles.loginLink}>
                Đăng nhập
              </Link>
            ) : null}
          </div>
        </header>
        <div className={styles.mobileDate}>{todayLabel} · UTC+7</div>

        {session.recovery && (
          <div className={styles.recoveryBanner} role="alert">
            <Alert variant="warning" title="Khôi phục phiên đăng nhập">
              <div className={styles.recoveryContent}>
                <span>{session.recovery.message}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={session.recovery.pending}
                  onClick={() => void session.recovery?.retry()}
                >
                  Thử kết nối lại
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {/* Content Area */}
        <main className={`${styles.content} content`}>
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>

      <ConfirmModal
        isOpen={confirmSignOutOpen}
        onClose={() => setConfirmSignOutOpen(false)}
        onConfirm={() => {
          setConfirmSignOutOpen(false);
          session.signOut();
        }}
        title="Xác nhận đăng xuất"
        description="Bạn có chắc chắn muốn đăng xuất khỏi hệ thống quản lý phòng khám?"
        confirmLabel="Đăng xuất"
        cancelLabel="Hủy bỏ"
        variant="danger"
      />
    </div>
  );
}
