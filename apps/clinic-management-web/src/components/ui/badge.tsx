import React, { HTMLAttributes } from "react";
import styles from "./ui.module.css";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "primary"
  | "brand"
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantClassMap: Record<BadgeVariant, string> = {
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
  info: styles.badgeInfo,
  neutral: styles.badgeNeutral,
  primary: styles.badgePrimary,
  brand: styles.badgePrimary,
  PENDING: styles.badgePending,
  CONFIRMED: styles.badgeConfirmed,
  CHECKED_IN: styles.badgeCheckedIn,
  COMPLETED: styles.badgeCompleted,
  CANCELLED: styles.badgeCancelled,
  NO_SHOW: styles.badgeNoShow,
};

export function Badge({ variant = "neutral", size = "md", children, className, ...props }: BadgeProps) {
  const variantClass = variantClassMap[variant] || styles.badgeNeutral;
  const sizeClass = size === "sm" ? styles.badgeSm : styles.badgeMd;

  return (
    <span className={`${styles.badge} ${variantClass} ${sizeClass} ${className || ""}`.trim()} {...props}>
      {children}
    </span>
  );
}
