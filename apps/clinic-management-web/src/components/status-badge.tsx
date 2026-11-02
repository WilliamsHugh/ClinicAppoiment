import React from "react";
import type { AppointmentStatus } from "@clinic/shared-types";
import { Badge, type BadgeProps } from "./ui/badge";

export const APPOINTMENT_STATUS_CONFIG: Record<
  AppointmentStatus,
  {
    label: string;
    variant: "warning" | "primary" | "info" | "success" | "danger";
  }
> = {
  PENDING: {
    label: "Chờ xác nhận",
    variant: "warning",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    variant: "primary",
  },
  CHECKED_IN: {
    label: "Đã check-in",
    variant: "info",
  },
  COMPLETED: {
    label: "Hoàn thành",
    variant: "success",
  },
  CANCELLED: {
    label: "Đã hủy",
    variant: "danger",
  },
  NO_SHOW: {
    label: "Không đến",
    variant: "danger",
  },
};

export interface StatusBadgeProps extends Omit<BadgeProps, "variant" | "children"> {
  status: AppointmentStatus | string;
  size?: "sm" | "md";
  className?: string;
  children?: React.ReactNode;
}

export function StatusBadge({
  status,
  size = "md",
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const config = (
    APPOINTMENT_STATUS_CONFIG as Record<
      string,
      { label: string; variant: "warning" | "primary" | "info" | "success" | "danger" }
    >
  )[status];

  if (!config) {
    return (
      <Badge variant="neutral" size={size} className={className} {...props}>
        {children ?? status}
      </Badge>
    );
  }

  return (
    <Badge variant={config.variant} size={size} className={className} {...props}>
      {children ?? config.label}
    </Badge>
  );
}
