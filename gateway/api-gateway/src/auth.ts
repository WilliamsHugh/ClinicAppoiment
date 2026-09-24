import type { Role } from "@clinic/shared-types";
import type { NextFunction, Response } from "express";
import type { GatewayConfig } from "./config.js";
import { sendError } from "./http.js";
import type { AccessTokenVerifier, GatewayRequest, VerifiedIdentity } from "./types.js";

const roles: Role[] = ["PATIENT", "DOCTOR", "STAFF", "ADMIN"];

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Authentication dependency timed out")), timeoutMs);
  });
  try {
    return await Promise.race([operation, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createUserServiceVerifier(config: GatewayConfig): AccessTokenVerifier {
  return async (token, requestId) => {
    const response = await fetch(`${config.serviceTargets.users}/internal/v1/auth/verify`, {
      headers: { Authorization: `Bearer ${token}`, "X-Request-Id": requestId },
      signal: AbortSignal.timeout(config.authTimeoutMs)
    });
    if (response.status === 401 || response.status === 404) return null;
    if (!response.ok) throw new Error(`User Service returned ${response.status}`);

    const body = await response.json() as {
      success: boolean;
      data?: Partial<VerifiedIdentity>;
    };
    if (!body.success || !body.data?.id || !body.data.authUserId || !body.data.role || !roles.includes(body.data.role) || !body.data.status) {
      throw new Error("User Service returned an invalid identity");
    }
    return body.data as VerifiedIdentity;
  };
}

export function createAuthenticate(config: GatewayConfig, verifier: AccessTokenVerifier | null) {
  return async (req: GatewayRequest, res: Response, next: NextFunction) => {
    const match = req.header("authorization")?.match(/^Bearer\s+(.+)$/i);
    if (!match) return sendError(res, 401, "AUTH_TOKEN_MISSING", "Access token is required", [], req.requestId);

    if (!verifier) {
      if (!config.authDevMode) {
        return sendError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured", [], req.requestId);
      }
      const userId = req.header("x-user-id");
      const role = req.header("x-role") as Role | undefined;
      if (match[1] !== "dev-token" || !userId || !role || !roles.includes(role)) {
        return sendError(res, 401, "AUTH_TOKEN_INVALID", "Development authentication is invalid", [], req.requestId);
      }
      req.user = { id: userId, authUserId: `dev:${userId}`, role };
      return next();
    }

    try {
      const identity = await withTimeout(verifier(match[1], req.requestId ?? "unknown"), config.authTimeoutMs);
      if (!identity) {
        return sendError(res, 401, "AUTH_TOKEN_INVALID", "Access token is invalid or expired", [], req.requestId);
      }
      if (identity.status !== "ACTIVE") {
        return sendError(res, 403, "ACCOUNT_INACTIVE", "User account is not active", [], req.requestId);
      }
      req.user = { id: identity.id, authUserId: identity.authUserId, role: identity.role };
      return next();
    } catch {
      return sendError(res, 503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable", [], req.requestId);
    }
  };
}

export function requireRoles(...allowedRoles: Role[]) {
  return (req: GatewayRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, "ACCESS_DENIED", "You do not have permission to access this resource", [], req.requestId);
    }
    return next();
  };
}

export function requireRoleForRequest(policy: (method: string, path: string) => Role[]) {
  return (req: GatewayRequest, res: Response, next: NextFunction) => {
    const allowedRoles = policy(req.method, req.path);
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, "ACCESS_DENIED", "You do not have permission to access this resource", [], req.requestId);
    }
    return next();
  };
}
