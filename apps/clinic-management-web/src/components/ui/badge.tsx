import React, { HTMLAttributes } from "react";
import styles from "./ui.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
  size?: "sm" | "md";
}

export function Badge({ variant = "neutral", size = "md", children, className, ...props }: BadgeProps) {
  const variantClass =
    variant === "success"
      ? styles.badgeSuccess
      : variant === "warning"
      ? styles.badgeWarning
      : variant === "danger"
      ? styles.badgeDanger
      : variant === "info"
      ? styles.badgeInfo
      : styles.badgeNeutral;

  const sizeClass = size === "sm" ? styles.badgeSm : styles.badgeMd;

  return (
    <span className={`${styles.badge} ${variantClass} ${sizeClass} ${className || ""}`.trim()} {...props}>
      {children}
    </span>
  );
}
