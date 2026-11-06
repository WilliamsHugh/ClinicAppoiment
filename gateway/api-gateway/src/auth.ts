import { createHash } from "node:crypto";
import type { Role } from "@clinic/shared-types";
import type { NextFunction, RequestHandler, Response } from "express";
import type { GatewayConfig } from "./config.js";
import { sendError } from "./http.js";
import type { AccessTokenVerifier, GatewayRequest, VerifiedIdentity } from "./types.js";

const roles: Role[] = ["PATIENT", "DOCTOR", "STAFF", "ADMIN"];

type IdentityCacheEntry = {
  identity: VerifiedIdentity;
  expiresAt: number;
};

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

class VerifiedIdentityCache {
  private readonly entries = new Map<string, IdentityCacheEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(token: string): VerifiedIdentity | null {
    const key = tokenDigest(token);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    // Refresh insertion order so the map evicts the least recently used identity.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.identity;
  }

  set(token: string, identity: VerifiedIdentity): void {
    if (identity.status !== "ACTIVE") return;
    const jwtExpiry = tokenExpiry(token);
    if (!jwtExpiry || jwtExpiry <= Date.now()) return;

    const key = tokenDigest(token);
    const expiresAt = Math.min(Date.now() + this.ttlMs, jwtExpiry);
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, { identity, expiresAt });
  }

  invalidate(token: string): void {
    this.entries.delete(tokenDigest(token));
  }
}

type PendingVerification = {
  cacheAllowed: boolean;
  promise: Promise<VerifiedIdentity | null>;
};

export type AuthenticatedMiddleware = RequestHandler & {
  invalidateToken(token: string): void;
};

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
    if (!config.userGatewayInternalApiToken) {
      throw new Error("Gateway credential for User Service is not configured");
    }
    const response = await fetch(`${config.serviceTargets.users}/internal/v1/auth/verify`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Internal-Token": config.userGatewayInternalApiToken,
        "X-Request-Id": requestId
      },
      signal: AbortSignal.timeout(config.authTimeoutMs)
    });
    if (response.status === 401 || response.status === 404) {
      const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
      if (body?.error?.code === "AUTH_TOKEN_INVALID" || body?.error?.code === "USER_PROFILE_NOT_FOUND") return null;
      throw new Error(`User Service verification failed with ${response.status}`);
    }
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

export function createAuthenticate(config: GatewayConfig, verifier: AccessTokenVerifier | null): AuthenticatedMiddleware {
  const cache = new VerifiedIdentityCache(config.identityCacheTtlMs, config.identityCacheMaxEntries);
  const inFlight = new Map<string, PendingVerification>();

  const verifyWithCache = (token: string, requestId: string): Promise<VerifiedIdentity | null> => {
    if (!verifier) return Promise.resolve(null);
    const cached = cache.get(token);
    if (cached) return Promise.resolve(cached);

    const key = tokenDigest(token);
    const pending = inFlight.get(key);
    if (pending) return pending.promise;

    let verification: PendingVerification;
    const promise = Promise.resolve()
      .then(() => verifier(token, requestId))
      .then((identity) => {
        if (identity && verification.cacheAllowed && inFlight.get(key) === verification) {
          cache.set(token, identity);
        }
        return identity;
      })
      .finally(() => {
        if (inFlight.get(key) === verification) inFlight.delete(key);
      });
    verification = { cacheAllowed: true, promise };
    inFlight.set(key, verification);
    return promise;
  };

  const handler: RequestHandler = async (req, res, next) => {
    const gatewayRequest = req as GatewayRequest;
    const match = gatewayRequest.header("authorization")?.match(/^Bearer\s+(.+)$/i);
    if (!match) return sendError(res, 401, "AUTH_TOKEN_MISSING", "Access token is required", [], gatewayRequest.requestId);

    if (!verifier) {
      if (!config.authDevMode) {
        return sendError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured", [], gatewayRequest.requestId);
      }
      const userId = gatewayRequest.header("x-user-id");
      const role = gatewayRequest.header("x-role") as Role | undefined;
      if (match[1] !== "dev-token" || !userId || !role || !roles.includes(role)) {
        return sendError(res, 401, "AUTH_TOKEN_INVALID", "Development authentication is invalid", [], gatewayRequest.requestId);
      }
      gatewayRequest.user = { id: userId, role };
      return next();
    }

    try {
      const identity = await withTimeout(verifyWithCache(match[1], gatewayRequest.requestId ?? "unknown"), config.authTimeoutMs);
      if (!identity) {
        return sendError(res, 401, "AUTH_TOKEN_INVALID", "Access token is invalid or expired", [], gatewayRequest.requestId);
      }
      if (identity.status !== "ACTIVE") {
        return sendError(res, 403, "ACCOUNT_INACTIVE", "User account is not active", [], gatewayRequest.requestId);
      }
      gatewayRequest.user = { id: identity.id, role: identity.role };
      return next();
    } catch {
      return sendError(res, 503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable", [], gatewayRequest.requestId);
    }
  };

  return Object.assign(handler, {
    invalidateToken(token: string) {
      const key = tokenDigest(token);
      cache.invalidate(token);
      const pending = inFlight.get(key);
      if (pending) {
        pending.cacheAllowed = false;
        inFlight.delete(key);
      }
    },
  });
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
