import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createGatewayApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";
import { loadGatewayConfig } from "../src/config.js";
import { createErrorHandler, requestContext } from "../src/http.js";
import type { UserProfile } from "../src/types.js";

const baseConfig: GatewayConfig = {
  port: 8080,
  nodeEnv: "test",
  authDevMode: false,
  corsOrigins: ["http://localhost:5174"],
  rateLimitWindowMs: 60_000,
  rateLimitMax: 100,
  authTimeoutMs: 100,
  healthTimeoutMs: 100,
  proxyTimeoutMs: 100,
  serviceTargets: {
    users: "http://127.0.0.1:3001",
    doctors: "http://127.0.0.1:3002",
    appointments: "http://127.0.0.1:3003",
    medicalRecords: "http://127.0.0.1:3004",
    notifications: "http://127.0.0.1:3005"
  }
};

const silentLogger = { info: vi.fn(), error: vi.fn() };

function createTestApp(profile: UserProfile = { id: "user-1", role: "PATIENT", status: "ACTIVE" }) {
  return createGatewayApp({
    config: baseConfig,
    authVerifier: async (token) => token === "valid-token" ? { authUserId: "auth-user-1" } : null,
    profileResolver: async () => profile,
    healthChecker: async () => "ok",
    logger: silentLogger
  });
}

describe("API Gateway authentication", () => {
  it("returns the standard error envelope when the token is missing", async () => {
    const response = await request(createTestApp()).get("/api/v1/system/health");
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, error: { code: "AUTH_TOKEN_MISSING", details: [] } });
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("rejects an invalid access token", async () => {
    const response = await request(createTestApp()).get("/api/v1/system/health").set("Authorization", "Bearer invalid-token");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("rejects an inactive authoritative user profile", async () => {
    const response = await request(createTestApp({ id: "user-1", role: "ADMIN", status: "LOCKED" }))
      .get("/api/v1/system/health")
      .set("Authorization", "Bearer valid-token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("does not allow development headers unless AUTH_DEV_MODE is enabled", async () => {
    const app = createGatewayApp({
      config: baseConfig,
      authVerifier: null,
      profileResolver: async () => null,
      logger: silentLogger
    });
    const response = await request(app)
      .get("/api/v1/system/health")
      .set("Authorization", "Bearer dev-token")
      .set("X-User-Id", "user-admin")
      .set("X-Role", "ADMIN");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("allows explicit development authentication outside production", async () => {
    const app = createGatewayApp({
      config: { ...baseConfig, authDevMode: true },
      authVerifier: null,
      profileResolver: async () => null,
      healthChecker: async () => "ok",
      logger: silentLogger
    });
    const response = await request(app)
      .get("/api/v1/system/health")
      .set("Authorization", "Bearer dev-token")
      .set("X-User-Id", "user-admin")
      .set("X-Role", "ADMIN");
    expect(response.status).toBe(200);
  });
});

describe("API Gateway role authorization", () => {
  it("denies a patient access to the admin health endpoint", async () => {
    const response = await request(createTestApp()).get("/api/v1/system/health").set("Authorization", "Bearer valid-token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCESS_DENIED");
  });

  it("uses the role from User Service instead of a caller supplied role header", async () => {
    const response = await request(createTestApp({ id: "user-admin", role: "ADMIN", status: "ACTIVE" }))
      .get("/api/v1/system/health")
      .set("Authorization", "Bearer valid-token")
      .set("X-Role", "PATIENT");
    expect(response.status).toBe(200);
    expect(response.body.data.services).toEqual({
      users: "ok",
      doctors: "ok",
      appointments: "ok",
      medicalRecords: "ok",
      notifications: "ok"
    });
    expect(JSON.stringify(response.body)).not.toContain("http://127.0.0.1");
  });

  it("blocks public clients from creating notifications", async () => {
    const response = await request(createTestApp()).post("/api/v1/notifications").set("Authorization", "Bearer valid-token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCESS_DENIED");
  });

  it("does not allow a patient to enumerate all patient profiles", async () => {
    const response = await request(createTestApp()).get("/api/v1/patients").set("Authorization", "Bearer valid-token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCESS_DENIED");
  });
});

describe("API Gateway platform middleware", () => {
  it("exposes OpenAPI without authentication", async () => {
    const response = await request(createTestApp()).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.paths["/api/v1/appointments"]).toBeDefined();
    expect(response.body.paths["/api/v1/appointments"].post.requestBody).toBeDefined();
    expect(response.body.paths["/api/v1/appointments"].post.responses["201"]).toBeDefined();
    expect(response.body.paths["/api/v1/appointments"].get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "page" }), expect.objectContaining({ name: "limit" })])
    );
    expect(response.body.components.schemas.Appointment).toBeDefined();
  });

  it("normalizes unknown routes", async () => {
    const response = await request(createTestApp()).get("/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(response.body.error.details).toEqual([]);
  });

  it("returns a normalized rate limit error", async () => {
    const app = createGatewayApp({
      config: { ...baseConfig, rateLimitMax: 1 },
      authVerifier: async () => null,
      profileResolver: async () => null,
      logger: silentLogger
    });
    await request(app).get("/health");
    const response = await request(app).get("/health");
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("hides internal exception details in the global error handler", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const app = express();
    app.use(requestContext(logger));
    app.get("/boom", (_req, _res, next) => next(new Error("database-secret")));
    app.use(createErrorHandler(logger));

    const response = await request(app).get("/boom");
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("database-secret");
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0]?.[0]).not.toContain("database-secret");
  });

  it("only emits CORS headers for configured browser origins", async () => {
    const allowed = await request(createTestApp()).get("/health").set("Origin", "http://localhost:5174");
    const denied = await request(createTestApp()).get("/health").set("Origin", "https://untrusted.example");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("writes structured request logs without authorization data", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const app = createGatewayApp({
      config: baseConfig,
      authVerifier: async () => ({ authUserId: "auth-user-1" }),
      profileResolver: async () => ({ id: "user-admin", role: "ADMIN", status: "ACTIVE" }),
      healthChecker: async () => "ok",
      logger
    });
    await request(app).get("/api/v1/system/health").set("Authorization", "Bearer secret-token");

    expect(logger.info).toHaveBeenCalled();
    const log = logger.info.mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(log)).toMatchObject({ event: "request.completed", actorRole: "ADMIN", statusCode: 200 });
    expect(log).not.toContain("user-admin");
    expect(log).not.toContain("secret-token");
  });
});

describe("API Gateway configuration", () => {
  it("rejects development authentication in production", () => {
    expect(() => loadGatewayConfig({ NODE_ENV: "production", AUTH_DEV_MODE: "true" })).toThrow(
      "AUTH_DEV_MODE must be disabled in production"
    );
  });

  it("requires the Supabase URL and anon key together", () => {
    expect(() => loadGatewayConfig({ SUPABASE_URL: "https://example.supabase.co" })).toThrow(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be configured together"
    );
  });

  it("loads dedicated authentication and proxy timeouts", () => {
    const config = loadGatewayConfig({ AUTH_TIMEOUT_MS: "25", PROXY_TIMEOUT_MS: "50" });
    expect(config.authTimeoutMs).toBe(25);
    expect(config.proxyTimeoutMs).toBe(50);
  });
});
