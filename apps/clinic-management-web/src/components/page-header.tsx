import React, { type ReactNode } from "react";
import styles from "./page-header.module.css";

export interface PageHeaderConfig {
  title: string;
  subtitle?: string;
}

export const PAGE_HEADER_CONFIGS: Record<string, PageHeaderConfig> = {
  "/dashboard": {
    title: "Tổng quan",
    subtitle: "Theo dõi lịch khám trong ngày và các công việc cần xử lý của phòng khám.",
  },
  "/appointments": {
    title: "Quản lý lịch hẹn",
    subtitle: "Theo dõi, tiếp đón, xác nhận và xử lý lịch khám của toàn phòng khám.",
  },
  "/doctors": {
    title: "Bác sĩ và lịch làm việc",
    subtitle: "Quản lý thông tin bác sĩ, chuyên khoa, lịch làm việc và khung giờ khám.",
  },
  "/health": {
    title: "Sức khỏe hệ thống",
    subtitle: "Trạng thái tổng hợp do API Gateway cung cấp cho quản trị viên.",
  },
  "/users": {
    title: "Quản lý tài khoản",
    subtitle: "Quản trị danh sách người dùng, phân quyền vai trò và kiểm soát trạng thái hoạt động tài khoản.",
  },
  "/medical-records": {
    title: "Hồ sơ khám bệnh",
    subtitle: "Ghi nhận triệu chứng, chẩn đoán, kế hoạch điều trị và kê đơn thuốc cho bệnh nhân.",
  },
  "/notifications": {
    title: "Thông báo",
    subtitle: "Theo dõi các sự kiện lịch hẹn, hồ sơ bệnh án và cập nhật điều hành phòng khám.",
  },
  "/profile": {
    title: "Hồ sơ cá nhân",
    subtitle: "Quản lý thông tin tài khoản, bảo mật và cài đặt làm việc trong phòng khám.",
  },
};

export function getPageHeaderConfig(pathname: string): PageHeaderConfig | undefined {
  if (!pathname) return undefined;
  for (const [routePath, config] of Object.entries(PAGE_HEADER_CONFIGS)) {
    if (pathname === routePath || pathname.startsWith(`${routePath}/`)) {
      return config;
    }
  }
  return undefined;
}

export interface PageHeaderProps extends Partial<PageHeaderConfig> {
  pathname?: string;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function PageHeader({
  pathname,
  title: propTitle,
  subtitle: propSubtitle,
  actions,
  className,
  children,
}: PageHeaderProps) {
  const config = pathname ? getPageHeaderConfig(pathname) : undefined;
  const title = propTitle ?? config?.title ?? "";
  const subtitle = propSubtitle ?? config?.subtitle;

  return (
    <header className={`page-heading ${styles.header} ${className || ""}`.trim()}>
      <div className={styles.textContainer}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
