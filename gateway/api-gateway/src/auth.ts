import { createHash } from "node:crypto";
import type { Role } from "@clinic/shared-types";
import type { NextFunction, RequestHandler, Response } from "express";
import type { GatewayConfig } from "./config.js";
import { sendError } from "./http.js";
import type { AccessTokenVerifier, GatewayRequest, InvalidationPayload, VerifiedIdentity } from "./types.js";

const roles: Role[] = ["PATIENT", "DOCTOR", "STAFF", "ADMIN"];

export type IdentityCacheEntry = {
  identity: VerifiedIdentity;
  expiresAt: number;
  userId: string;
  sessionId?: string;
  sessionVersion: number;
  idleExpiresAt?: number | null;
  absoluteExpiresAt?: number | null;
  lockAt?: number | null;
};

export const allowedPathsForPendingMfa: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/api/v1/auth/session" },
  { method: "GET", path: "/api/v1/auth/mfa/factors" },
  { method: "POST", path: "/api/v1/auth/logout" },
  { method: "POST", path: "/api/v1/auth/mfa/totp/enroll" },
  { method: "POST", path: "/api/v1/auth/mfa/challenges" },
  { method: "POST", path: "/api/v1/auth/mfa/verify" },
  { method: "POST", path: "/api/v1/auth/refresh" }
];

export const allowedPathsForLocked: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/api/v1/auth/session" },
  { method: "GET", path: "/api/v1/auth/mfa/factors" },
  { method: "POST", path: "/api/v1/auth/logout" },
  { method: "POST", path: "/api/v1/auth/mfa/challenges" },
  { method: "POST", path: "/api/v1/auth/mfa/verify" },
  { method: "POST", path: "/api/v1/auth/refresh" }
];

export function isAllowedPath(
  method: string,
  req: GatewayRequest,
  allowedList: Array<{ method: string; path: string }>
): boolean {
  const normMethod = method.toUpperCase();
  const rawOriginal = (req.originalUrl ?? req.url ?? "").split("?", 1)[0].replace(/\/+$/, "") || "/";
  const rawPath = (req.path ?? "").split("?", 1)[0].replace(/\/+$/, "") || "/";
  const authRelativePath = `/api/v1/auth${rawPath}`;

  return allowedList.some((entry) => {
    if (entry.method !== normMethod) return false;
    const entryPath = entry.path.replace(/\/+$/, "") || "/";
    return rawOriginal === entryPath || rawPath === entryPath || authRelativePath === entryPath;
  });
}

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

function parseExpiry(val: string | number | null | undefined): number | null {
  if (!val) return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const time = new Date(val).getTime();
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

export class VerifiedIdentityCache {
  private readonly entries = new Map<string, IdentityCacheEntry>();
  // Index: userId -> Set<tokenDigest> (3a)
  private readonly userTokens = new Map<string, Set<string>>();
  // Index: sessionId -> Set<tokenDigest> (3a)
  private readonly sessionTokens = new Map<string, Set<string>>();

  // Invalidation & generation tracking (3g)
  private readonly userMinVersion = new Map<string, number>();
  private readonly sessionMinVersion = new Map<string, number>();
  private readonly userInvalidatedAt = new Map<string, number>();
  private readonly sessionInvalidatedAt = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  private removeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);

    const userSet = this.userTokens.get(entry.userId);
    if (userSet) {
      userSet.delete(key);
      if (userSet.size === 0) this.userTokens.delete(entry.userId);
    }

    if (entry.sessionId) {
      const sessionSet = this.sessionTokens.get(entry.sessionId);
      if (sessionSet) {
        sessionSet.delete(key);
        if (sessionSet.size === 0) this.sessionTokens.delete(entry.sessionId);
      }
    }
  }

  get(token: string): VerifiedIdentity | null {
    const key = tokenDigest(token);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.removeEntry(key);
      return null;
    }

    // Refresh insertion order so the map evicts the least recently used identity.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.identity;
  }

  set(token: string, identity: VerifiedIdentity, verificationStartedAt?: number): void {
    // Only ACTIVE, PENDING_MFA, or LOCKED identities may be cached
    if (identity.status === "EXPIRED" || identity.status === "REVOKED" || identity.status === "INACTIVE") return;
    if (identity.accountStatus && identity.accountStatus !== "ACTIVE") return;

    const jwtExpiry = tokenExpiry(token);
    if (!jwtExpiry || jwtExpiry <= Date.now()) return;

    const userId = identity.userId ?? identity.id;
    const sessionId = identity.sessionId;
    const sessionVersion = identity.sessionVersion ?? 1;

    // Check version and invalidation timestamp boundaries (3g)
    const minUserVer = this.userMinVersion.get(userId) ?? 0;
    if (sessionVersion < minUserVer) return;

    if (sessionId) {
      const minSessionVer = this.sessionMinVersion.get(sessionId) ?? 0;
      if (sessionVersion < minSessionVer) return;
    }

    if (verificationStartedAt !== undefined) {
      const userInvTime = this.userInvalidatedAt.get(userId) ?? 0;
      if (userInvTime >= verificationStartedAt) return;

      if (sessionId) {
        const sessionInvTime = this.sessionInvalidatedAt.get(sessionId) ?? 0;
        if (sessionInvTime >= verificationStartedAt) return;
      }
    }

    // Calculate deadline = min(jwt.exp, idleExpiresAt, absoluteExpiresAt, lockAt) (3c)
    const idleExpiry = parseExpiry(identity.idleExpiresAt);
    const absoluteExpiry = parseExpiry(identity.absoluteExpiresAt);
    const lockAtExpiry = parseExpiry(identity.lockAt);

    const candidates: number[] = [Date.now() + this.ttlMs, jwtExpiry];
    if (idleExpiry !== null) candidates.push(idleExpiry);
    if (absoluteExpiry !== null) candidates.push(absoluteExpiry);
    if (identity.status === "ACTIVE" && lockAtExpiry !== null) {
      candidates.push(lockAtExpiry);
    }

    const expiresAt = Math.min(...candidates);
    if (expiresAt <= Date.now()) return;

    const key = tokenDigest(token);
    this.removeEntry(key);

    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.removeEntry(oldestKey);
    }

    const entry: IdentityCacheEntry = {
      identity,
      expiresAt,
      userId,
      sessionId,
      sessionVersion,
      idleExpiresAt: idleExpiry,
      absoluteExpiresAt: absoluteExpiry,
      lockAt: lockAtExpiry,
    };
    this.entries.set(key, entry);

    // Update index: userId -> Set<tokenDigest> (3a)
    let userSet = this.userTokens.get(userId);
    if (!userSet) {
      userSet = new Set();
      this.userTokens.set(userId, userSet);
    }
    userSet.add(key);

    // Update index: sessionId -> Set<tokenDigest> (3a)
    if (sessionId) {
      let sessionSet = this.sessionTokens.get(sessionId);
      if (!sessionSet) {
        sessionSet = new Set();
        this.sessionTokens.set(sessionId, sessionSet);
      }
      sessionSet.add(key);
    }
  }

  invalidate(token: string): void {
    this.removeEntry(tokenDigest(token));
  }

  // Invalidate by user ID (3d)
  invalidateByUser(userId: string, sessionVersion?: number): void {
    const now = Date.now();
    this.userInvalidatedAt.set(userId, now);
    if (sessionVersion !== undefined) {
      const current = this.userMinVersion.get(userId) ?? 0;
      this.userMinVersion.set(userId, Math.max(current, sessionVersion + 1));
    } else {
      const current = this.userMinVersion.get(userId) ?? 0;
      this.userMinVersion.set(userId, current + 1);
    }

    const keys = this.userTokens.get(userId);
    if (keys) {
      for (const key of Array.from(keys)) {
        this.removeEntry(key);
      }
    }
  }

  // Invalidate by session ID (3d)
  invalidateBySession(sessionId: string, sessionVersion?: number): void {
    const now = Date.now();
    this.sessionInvalidatedAt.set(sessionId, now);
    if (sessionVersion !== undefined) {
      const current = this.sessionMinVersion.get(sessionId) ?? 0;
      this.sessionMinVersion.set(sessionId, Math.max(current, sessionVersion + 1));
    } else {
      const current = this.sessionMinVersion.get(sessionId) ?? 0;
      this.sessionMinVersion.set(sessionId, current + 1);
    }

    const keys = this.sessionTokens.get(sessionId);
    if (keys) {
      for (const key of Array.from(keys)) {
        this.removeEntry(key);
      }
    }
  }

  hasToken(token: string): boolean {
    const key = tokenDigest(token);
    const entry = this.entries.get(key);
    return !!entry && entry.expiresAt > Date.now();
  }

  getUserTokensCount(userId: string): number {
    return this.userTokens.get(userId)?.size ?? 0;
  }

  getSessionTokensCount(sessionId: string): number {
    return this.sessionTokens.get(sessionId)?.size ?? 0;
  }

  size(): number {
    return this.entries.size;
  }
}

type PendingVerification = {
  cacheAllowed: boolean;
  startedAt: number;
  promise: Promise<VerifiedIdentity | null>;
};

export type AuthenticatedMiddleware = RequestHandler & {
  invalidateToken(token: string): void;
  invalidateByUser(userId: string, sessionVersion?: number): void;
  invalidateBySession(sessionId: string, sessionVersion?: number): void;
  invalidate(payload: InvalidationPayload): void;
  getCache(): VerifiedIdentityCache;
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
    if (!body.success || !body.data?.role || !roles.includes(body.data.role) || !body.data.status) {
      throw new Error("User Service returned an invalid identity");
    }

    const id = body.data.id ?? body.data.userId;
    if (!id) {
      throw new Error("User Service returned an invalid identity: missing id/userId");
    }

    return {
      ...body.data,
      id,
      userId: body.data.userId ?? id,
      authUserId: body.data.authUserId ?? id,
      sessionVersion: body.data.sessionVersion ?? 1,
    } as VerifiedIdentity;
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

    const startedAt = Date.now();
    let verification: PendingVerification;
    const promise = Promise.resolve()
      .then(() => verifier(token, requestId))
      .then((identity) => {
        if (identity && verification.cacheAllowed && inFlight.get(key) === verification) {
          cache.set(token, identity, startedAt);
        }
        return identity;
      })
      .finally(() => {
        if (inFlight.get(key) === verification) inFlight.delete(key);
      });
    verification = { cacheAllowed: true, startedAt, promise };
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

      // Check account status
      if (identity.accountStatus === "INACTIVE" || identity.status === "INACTIVE") {
        return sendError(res, 403, "ACCOUNT_INACTIVE", "User account is not active", [], gatewayRequest.requestId);
      }
      if (identity.accountStatus === "LOCKED") {
        return sendError(res, 403, "ACCOUNT_LOCKED", "User account is locked", [], gatewayRequest.requestId);
      }

      // Check session status (3e)
      if (identity.status === "EXPIRED") {
        return sendError(res, 401, "AUTH_SESSION_EXPIRED", "Session has expired", [], gatewayRequest.requestId);
      }
      if (identity.status === "REVOKED") {
        return sendError(res, 401, "AUTH_SESSION_REVOKED", "Session has been revoked", [], gatewayRequest.requestId);
      }
      if (identity.status === "PENDING_MFA") {
        if (!isAllowedPath(gatewayRequest.method, gatewayRequest, allowedPathsForPendingMfa)) {
          return sendError(res, 403, "MFA_VERIFICATION_REQUIRED", "MFA verification is required", [], gatewayRequest.requestId);
        }
      }
      if (identity.status === "LOCKED") {
        if (identity.sessionId) {
          if (!isAllowedPath(gatewayRequest.method, gatewayRequest, allowedPathsForLocked)) {
            return sendError(res, 403, "AUTH_SESSION_LOCKED", "Session is locked", [], gatewayRequest.requestId);
          }
        } else {
          return sendError(res, 403, "ACCOUNT_INACTIVE", "User account is not active", [], gatewayRequest.requestId);
        }
      }

      gatewayRequest.user = {
        id: identity.userId ?? identity.id,
        role: identity.role,
        sessionId: identity.sessionId,
        sessionState: identity.status
      };
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
    invalidateByUser(userId: string, sessionVersion?: number) {
      cache.invalidateByUser(userId, sessionVersion);
      for (const pending of inFlight.values()) {
        pending.cacheAllowed = false;
      }
    },
    invalidateBySession(sessionId: string, sessionVersion?: number) {
      cache.invalidateBySession(sessionId, sessionVersion);
      for (const pending of inFlight.values()) {
        pending.cacheAllowed = false;
      }
    },
    invalidate(payload: InvalidationPayload) {
      if (payload.scope === "CURRENT" && payload.sessionId) {
        this.invalidateBySession(payload.sessionId, payload.sessionVersion);
      } else {
        this.invalidateByUser(payload.userId, payload.sessionVersion);
        if (payload.sessionId) {
          this.invalidateBySession(payload.sessionId, payload.sessionVersion);
        }
      }
    },
    getCache() {
      return cache;
    }
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
