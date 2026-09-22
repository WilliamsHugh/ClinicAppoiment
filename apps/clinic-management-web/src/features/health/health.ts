import type { ApiClient, ApiResult } from "../../lib/api/client";
import type { Session } from "../../lib/session/session";

export interface ServiceHealth {
  status?: string;
  [key: string]: unknown;
}

export interface SystemHealth {
  status?: string;
  services?: Record<string, ServiceHealth | string>;
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
