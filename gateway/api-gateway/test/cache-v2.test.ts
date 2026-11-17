import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createAuthenticate, VerifiedIdentityCache } from "../src/auth.js";
import { createGatewayApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";
import type { AccessTokenVerifier, VerifiedIdentity } from "../src/types.js";

type RunningUpstream = { url: string; close: () => Promise<void> };
const running: RunningUpstream[] = [];

async function startUpstream(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<RunningUpstream> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const upstream = {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      if (!server.listening) return resolve();
      server.close((error) => (error ? reject(error) : resolve()));
    })
  };
  running.push(upstream);
  return upstream;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.close()));
});

function jwtWithExp(secondsFromNow: number, nonce?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "user-1",
    exp: Math.floor(Date.now() / 1000) + secondsFromNow,
    jti: nonce ?? Math.random().toString(36)
  })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function configFor(upstreamUrl: string): GatewayConfig {
  return {
    port: 8080,
    nodeEnv: "test",
    authDevMode: false,
    corsOrigins: ["http://localhost:5174"],
    rateLimitWindowMs: 60_000,
    rateLimitMax: 100,
    authTimeoutMs: 2_000,
    identityCacheTtlMs: 5_000,
    identityCacheMaxEntries: 10,
    userGatewayInternalApiToken: "a".repeat(32),
    healthTimeoutMs: 1_000,
    proxyTimeoutMs: 2_000,
    serviceTargets: {
      users: upstreamUrl,
      doctors: upstreamUrl,
      appointments: upstreamUrl,
      medicalRecords: upstreamUrl,
      notifications: upstreamUrl
    }
  };
}

describe("VerifiedIdentityCache v2 with Session & Invalidation", () => {
  it("indexes cache entries by userId and sessionId and invalidates by user (3a, 3b, 3d)", () => {
    const cache = new VerifiedIdentityCache(60_000, 100);
    const token1 = jwtWithExp(3600, "token-1");
    const token2 = jwtWithExp(3600, "token-2");

    const identity1: VerifiedIdentity = {
      id: "u1",
      userId: "u1",
      sessionId: "s1",
      role: "PATIENT",
      status: "ACTIVE",
      accountStatus: "ACTIVE",
      sessionVersion: 1
    };

    const identity2: VerifiedIdentity = {
      id: "u1",
      userId: "u1",
      sessionId: "s2",
      role: "PATIENT",
      status: "ACTIVE",
      accountStatus: "ACTIVE",
      sessionVersion: 1
    };

    cache.set(token1, identity1);
    cache.set(token2, identity2);

    expect(cache.size()).toBe(2);
    expect(cache.getUserTokensCount("u1")).toBe(2);
    expect(cache.getSessionTokensCount("s1")).toBe(1);
    expect(cache.getSessionTokensCount("s2")).toBe(1);

    expect(cache.get(token1)).toEqual(identity1);
    expect(cache.get(token2)).toEqual(identity2);

    // Invalidate user u1
    cache.invalidateByUser("u1");

    expect(cache.size()).toBe(0);
    expect(cache.getUserTokensCount("u1")).toBe(0);
    expect(cache.getSessionTokensCount("s1")).toBe(0);
    expect(cache.get(token1)).toBeNull();
    expect(cache.get(token2)).toBeNull();
  });

  it("invalidates by session ID specifically (3d)", () => {
    const cache = new VerifiedIdentityCache(60_000, 100);
    const token1 = jwtWithExp(3600, "token-1");
    const token2 = jwtWithExp(3600, "token-2");

    const identity1: VerifiedIdentity = {
      id: "u1",
      userId: "u1",
      sessionId: "s1",
      role: "STAFF",
      status: "ACTIVE",
      sessionVersion: 1
    };

    const identity2: VerifiedIdentity = {
      id: "u1",
      userId: "u1",
      sessionId: "s2",
      role: "STAFF",
      status: "ACTIVE",
      sessionVersion: 1
    };

    cache.set(token1, identity1);
    cache.set(token2, identity2);

    expect(cache.getUserTokensCount("u1")).toBe(2);

    // Invalidate only session s1
    cache.invalidateBySession("s1");

    expect(cache.get(token1)).toBeNull();
    expect(cache.get(token2)).toEqual(identity2);
    expect(cache.getUserTokensCount("u1")).toBe(1);
    expect(cache.getSessionTokensCount("s1")).toBe(0);
    expect(cache.getSessionTokensCount("s2")).toBe(1);
  });

  it("calculates deadline as min(jwt.exp, idleExpiresAt, absoluteExpiresAt, lockAt, now+ttl) (3c)", async () => {
    const cache = new VerifiedIdentityCache(60_000, 100);
    const token = jwtWithExp(3600);

    // idleExpiresAt is only 50ms away
    const idleExpiresAt = new Date(Date.now() + 50).toISOString();
    const identity: VerifiedIdentity = {
      id: "u1",
      userId: "u1",
      sessionId: "s1",
      role: "PATIENT",
      status: "ACTIVE",
      idleExpiresAt,
      sessionVersion: 1
    };

    cache.set(token, identity);
    expect(cache.get(token)).toEqual(identity);

    // Wait 70ms for idle expiration
    await new Promise((r) => setTimeout(r, 70));
    expect(cache.get(token)).toBeNull();
  });

  it("expires STAFF/ADMIN ACTIVE identity when lockAt is reached (3c)", async () => {
    const cache = new VerifiedIdentityCache(60_000, 100);
    const token = jwtWithExp(3600);

    // lockAt is 50ms away
    const lockAt = new Date(Date.now() + 50).toISOString();
    const absoluteExpiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();

    const identity: VerifiedIdentity = {
      id: "admin-1",
      userId: "admin-1",
      sessionId: "s-admin",
      role: "ADMIN",
      status: "ACTIVE",
      absoluteExpiresAt,
      lockAt,
      sessionVersion: 1
    };

    cache.set(token, identity);
    expect(cache.get(token)).toEqual(identity);

    await new Promise((r) => setTimeout(r, 70));
    expect(cache.get(token)).toBeNull();
  });

  it("prevents in-flight verifications from caching stale identities after invalidation (3g)", async () => {
    const token = jwtWithExp(3600);
    let finishVerification: (identity: VerifiedIdentity) => void;
    const pendingPromise = new Promise<VerifiedIdentity>((resolve) => {
      finishVerification = resolve;
    });

    const verifier: AccessTokenVerifier = vi.fn().mockReturnValue(pendingPromise);
    const auth = createAuthenticate(configFor("http://localhost:3001"), verifier);

    // Start verification (in-flight)
    const mockReq = {
      header: (name: string) => (name.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined),
      method: "GET",
      originalUrl: "/api/v1/auth/session",
      path: "/session",
      requestId: "r1"
    } as any;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    // Trigger auth handler -> starts in-flight verification
    auth(mockReq, mockRes, next);

    // Invalidation occurs while verification is still running
    auth.invalidateByUser("u1", 1);

    // Verifier now finishes
    const staleIdentity: VerifiedIdentity = {
      id: "u1",
      userId: "u1",
      sessionId: "s1",
      role: "PATIENT",
      status: "ACTIVE",
      sessionVersion: 1
    };
    finishVerification!(staleIdentity);
    await new Promise((r) => setTimeout(r, 20));

    // Stale identity must NOT have been saved to cache
    const cache = auth.getCache();
    expect(cache.get(token)).toBeNull();
    expect(cache.size()).toBe(0);
  });
});

describe("Gateway PENDING_MFA and LOCKED Allowlists (3e)", () => {
  async function createAppWithIdentity(identity: VerifiedIdentity) {
    const upstream = await startUpstream((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { upstream: "ok" } }));
    });
    const config = configFor(upstream.url);
    const app = createGatewayApp({
      config,
      authVerifier: async () => identity,
      logger: { info: vi.fn(), error: vi.fn() }
    });
    return app;
  }

  it("allows PENDING_MFA requests only to allowed auth endpoints, blocks business APIs with 403", async () => {
    const pendingIdentity: VerifiedIdentity = {
      id: "u-staff",
      userId: "u-staff",
      sessionId: "s-staff",
      role: "STAFF",
      status: "PENDING_MFA",
      sessionVersion: 1
    };
    const app = await createAppWithIdentity(pendingIdentity);

    // Protected business API is blocked
    const resBlocked = await request(app)
      .get("/api/v1/appointments")
      .set("Authorization", "Bearer valid-token");
    expect(resBlocked.status).toBe(403);
    expect(resBlocked.body.error.code).toBe("MFA_VERIFICATION_REQUIRED");

    // Allowlist auth endpoint /api/v1/auth/session is allowed through to upstream
    const resSession = await request(app)
      .get("/api/v1/auth/session")
      .set("Authorization", "Bearer valid-token");
    expect(resSession.status).toBe(200);
    expect(resSession.body.data.upstream).toBe("ok");
  });

  it("allows LOCKED requests only to lock-control endpoints, blocks business APIs with 403", async () => {
    const lockedIdentity: VerifiedIdentity = {
      id: "u-staff",
      userId: "u-staff",
      sessionId: "s-staff",
      role: "STAFF",
      status: "LOCKED",
      sessionVersion: 1
    };
    const app = await createAppWithIdentity(lockedIdentity);

    // Business route is blocked with AUTH_SESSION_LOCKED
    const resBlocked = await request(app)
      .get("/api/v1/appointments")
      .set("Authorization", "Bearer valid-token");
    expect(resBlocked.status).toBe(403);
    expect(resBlocked.body.error.code).toBe("AUTH_SESSION_LOCKED");

    // TOTP enroll is NOT in LOCKED allowlist -> blocked
    const resEnroll = await request(app)
      .post("/api/v1/auth/mfa/totp/enroll")
      .set("Authorization", "Bearer valid-token");
    expect(resEnroll.status).toBe(403);
    expect(resEnroll.body.error.code).toBe("AUTH_SESSION_LOCKED");

    // /api/v1/auth/session IS in LOCKED allowlist -> passed through
    const resSession = await request(app)
      .get("/api/v1/auth/session")
      .set("Authorization", "Bearer valid-token");
    expect(resSession.status).toBe(200);
    expect(resSession.body.data.upstream).toBe("ok");
  });

  it("returns 401 AUTH_SESSION_EXPIRED when session state is EXPIRED", async () => {
    const expiredIdentity: VerifiedIdentity = {
      id: "u-staff",
      userId: "u-staff",
      sessionId: "s-staff",
      role: "STAFF",
      status: "EXPIRED",
      sessionVersion: 1
    };
    const app = await createAppWithIdentity(expiredIdentity);

    const res = await request(app)
      .get("/api/v1/appointments")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("returns 401 AUTH_SESSION_REVOKED when session state is REVOKED", async () => {
    const revokedIdentity: VerifiedIdentity = {
      id: "u-pat",
      userId: "u-pat",
      sessionId: "s-pat",
      role: "PATIENT",
      status: "REVOKED",
      sessionVersion: 1
    };
    const app = await createAppWithIdentity(revokedIdentity);

    const res = await request(app)
      .get("/api/v1/appointments")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_SESSION_REVOKED");
  });
});

describe("Gateway internal boundary", () => {
  it("does not expose cache invalidation on the public listener", async () => {
    const app = createGatewayApp({
      config: configFor("http://127.0.0.1:1"),
      authVerifier: async () => null,
      logger: { info: vi.fn(), error: vi.fn() }
    });

    const response = await request(app)
      .post("/internal/v1/auth/cache-invalidate")
      .set("X-Internal-Token", "synthetic-internal-token-that-is-not-valid")
      .send({ userId: "target-user", scope: "ALL" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
