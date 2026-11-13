import type { ApiClient, ApiResult } from "../../lib/api/client";
import type { Session } from "../../lib/session/session";

export interface SystemServiceDefinition {
  key: string;
  name: string;
  shortName: string;
}

export const SYSTEM_SERVICES: readonly SystemServiceDefinition[] = [
  { key: "api-gateway", name: "Cổng API Gateway", shortName: "API Gateway" },
  { key: "users", name: "Dịch vụ Người dùng (User Service)", shortName: "User Service" },
  { key: "doctors", name: "Dịch vụ Bác sĩ (Doctor Service)", shortName: "Doctor Service" },
  { key: "appointments", name: "Dịch vụ Lịch hẹn (Appointment Service)", shortName: "Appointment Service" },
  { key: "medicalRecords", name: "Dịch vụ Bệnh án (Medical Record Service)", shortName: "Medical Record Service" },
  { key: "notifications", name: "Dịch vụ Thông báo (Notification Service)", shortName: "Notification Service" },
] as const;

export interface ServiceHealth {
  status?: string;
  [key: string]: unknown;
}

export interface SystemHealth {
  status?: string;
  gateway?: ServiceHealth | string;
  services?: Record<string, ServiceHealth | string>;
}

export type ServiceStatusCategory = "healthy" | "degraded" | "down" | "unknown";

export interface ResolvedServiceStatus {
  category: ServiceStatusCategory;
  rawStatus?: string;
  label: string;
}

export function resolveServiceStatus(rawStatus?: string): ResolvedServiceStatus {
  if (!rawStatus) {
    return {
      category: "unknown",
      rawStatus: undefined,
      label: "Chưa xác định",
    };
  }
  const s = rawStatus.trim().toLowerCase();
  if (s === "ok" || s === "up" || s === "healthy") {
    return {
      category: "healthy",
      rawStatus,
      label: "Hoạt động bình thường",
    };
  }
  if (s === "degraded" || s === "warning") {
    return {
      category: "degraded",
      rawStatus,
      label: "Cảnh báo suy giảm",
    };
  }
  if (s === "down" || s === "unhealthy" || s === "error" || s === "unavailable") {
    return {
      category: "down",
      rawStatus,
      label: "Mất kết nối",
    };
  }
  return {
    category: "unknown",
    rawStatus,
    label: rawStatus || "Chưa xác định",
  };
}

export function getSystemServiceHealth(
  health: SystemHealth | null | undefined,
  serviceKey: string,
): ServiceHealth | string | undefined {
  if (!health) return undefined;
  if (serviceKey === "api-gateway" || serviceKey === "gateway") {
    return health.gateway ?? health.services?.["api-gateway"] ?? health.services?.["gateway"];
  }
  return health.services?.[serviceKey];
}

export function getSystemServiceStatus(health: SystemHealth | null | undefined, serviceKey: string): string | undefined {
  const serviceHealth = getSystemServiceHealth(health, serviceKey);
  return typeof serviceHealth === "string" ? serviceHealth : serviceHealth?.status;
}

export function isSystemAllHealthy(health: SystemHealth | null | undefined): boolean {
  if (!health?.status) return false;
  const s = health.status.trim().toLowerCase();
  return s === "ok" || s === "healthy" || s === "up";
}

export function formatClientCheckedAt(date: Date | null): string {
  if (!date) return "Đang kiểm tra";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function canViewSystemHealth(session: Session): boolean {
  return session.status === "authenticated" && session.identity?.role === "ADMIN";
}

export async function loadSystemHealth(client: Pick<ApiClient, "get">, session: Session): Promise<ApiResult<SystemHealth>> {
  if (!canViewSystemHealth(session)) {
    throw new Error("FORBIDDEN");
  }
  return client.get<SystemHealth>("/api/v1/system/health");
}
