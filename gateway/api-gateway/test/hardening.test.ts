import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@clinic/shared-types";
import { createGatewayApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

type UpstreamHandler = (req: IncomingMessage, res: ServerResponse) => void;
type RunningUpstream = { url: string; close: () => Promise<void> };

const running: RunningUpstream[] = [];

async function startUpstream(handler: UpstreamHandler): Promise<RunningUpstream> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const upstream = {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
  running.push(upstream);
  return upstream;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

function configFor(target: string, overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 8080,
    nodeEnv: "test",
    authDevMode: false,
    corsOrigins: ["http://localhost:5174"],
    rateLimitWindowMs: 60_000,
    rateLimitMax: 1_000,
    authTimeoutMs: 50,
    healthTimeoutMs: 50,
    proxyTimeoutMs: 50,
    serviceTargets: {
      users: target,
      doctors: target,
      appointments: target,
      medicalRecords: target,
      notifications: target
    },
    ...overrides
  };
}

function appFor(target: string, role: Role = "PATIENT", overrides: Partial<GatewayConfig> = {}) {
  return createGatewayApp({
    config: configFor(target, overrides),
    authVerifier: async () => ({ authUserId: "verified-auth-user" }),
    profileResolver: async () => ({ id: "verified-user", role, status: "ACTIVE" }),
    logger: { info: vi.fn(), error: vi.fn() }
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

describe("Gateway authentication dependency handling", () => {
  it("times out token verification with a controlled 503 response", async () => {
    const app = createGatewayApp({
      config: configFor("http://127.0.0.1:1", { authTimeoutMs: 15 }),
      authVerifier: () => new Promise(() => undefined),
      profileResolver: async () => ({ id: "never", role: "ADMIN", status: "ACTIVE" }),
      logger: { info: vi.fn(), error: vi.fn() }
    });

    const response = await request(app)
      .get("/api/v1/system/health")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AUTH_SERVICE_UNAVAILABLE");
  });

  it("normalizes profile resolver failures", async () => {
    const app = createGatewayApp({
      config: configFor("http://127.0.0.1:1"),
      authVerifier: async () => ({ authUserId: "auth-user" }),
      profileResolver: async () => { throw new Error("private upstream URL"); },
      logger: { info: vi.fn(), error: vi.fn() }
    });
    const response = await request(app)
      .get("/api/v1/system/health")
      .set("Authorization", "Bearer valid-token");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("private upstream URL");
  });
});

describe("Gateway exact route authorization", () => {
  it("allows the documented action for each role and blocks lookalike routes", async () => {
    const upstream = await startUpstream((_req, res) => sendJson(res, 200, { success: true, data: {} }));
    const cases: Array<{ role: Role; method: "get" | "post" | "patch"; allowed: string; denied: string }> = [
      { role: "PATIENT", method: "get", allowed: "/api/v1/specialties", denied: "/api/v1/users/me/private" },
      { role: "DOCTOR", method: "post", allowed: "/api/v1/doctors/doctor-1/schedules", denied: "/api/v1/doctors/doctor-1/archive/schedules" },
      { role: "STAFF", method: "patch", allowed: "/api/v1/appointments/appt-1/check-in", denied: "/api/v1/appointments/appt-1/a/check-in" },
      { role: "ADMIN", method: "patch", allowed: "/api/v1/users/user-1/role", denied: "/api/v1/users/user-1/a/role" }
    ];

    for (const item of cases) {
      const app = appFor(upstream.url, item.role);
      const allowed = await request(app)[item.method](item.allowed).set("Authorization", "Bearer token");
      const denied = await request(app)[item.method](item.denied).set("Authorization", "Bearer token");
      expect(allowed.status, `${item.role} should access ${item.allowed}`).toBe(200);
      expect(denied.status, `${item.role} should not access ${item.denied}`).toBe(403);
    }
  });
});

describe("Gateway proxy boundary", () => {
  it("forwards the route and query while replacing spoofed identity headers", async () => {
    const upstream = await startUpstream((req, res) => sendJson(res, 200, {
      success: true,
      data: { url: req.url, headers: req.headers }
    }));
    const response = await request(appFor(upstream.url, "ADMIN"))
      .get("/api/v1/appointments/appt-1?view=compact")
      .set("Authorization", "Bearer private-token")
      .set("X-User-Id", "spoofed-user")
      .set("X-Role", "PATIENT")
      .set("X-Supabase-Auth-User-Id", "spoofed-auth-user")
      .set("X-Request-Id", "request-123");

    expect(response.status).toBe(200);
    expect(response.body.data.url).toBe("/api/v1/appointments/appt-1?view=compact");
    expect(response.body.data.headers.authorization).toBeUndefined();
    expect(response.body.data.headers["x-user-id"]).toBe("verified-user");
    expect(response.body.data.headers["x-role"]).toBe("ADMIN");
    expect(response.body.data.headers["x-supabase-auth-user-id"]).toBe("verified-auth-user");
    expect(response.body.data.headers["x-request-id"]).toBe("request-123");
  });

  it("keeps gateway CORS and request-id headers across proxied responses", async () => {
    const upstream = await startUpstream((_req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "https://malicious.example");
      res.setHeader("X-Request-Id", "upstream-id");
      sendJson(res, 200, { success: true, data: {} });
    });
    const response = await request(appFor(upstream.url))
      .get("/api/v1/specialties")
      .set("Authorization", "Bearer token")
      .set("Origin", "http://localhost:5174")
      .set("X-Request-Id", "gateway-id");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
    expect(response.headers["access-control-expose-headers"]).toBe("X-Request-Id");
    expect(response.headers["x-request-id"]).toBe("gateway-id");
  });

  it("normalizes an upstream error that does not use the API envelope", async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("database connection secret");
    });
    const response = await request(appFor(upstream.url))
      .get("/api/v1/specialties")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("UPSTREAM_INVALID_RESPONSE");
    expect(JSON.stringify(response.body)).not.toContain("database connection secret");
  });

  it("returns a controlled error when an upstream times out", async () => {
    const upstream = await startUpstream((_req, res) => {
      setTimeout(() => sendJson(res, 200, { success: true, data: {} }), 100);
    });
    const response = await request(appFor(upstream.url, "PATIENT", { proxyTimeoutMs: 15 }))
      .get("/api/v1/specialties")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("UPSTREAM_SERVICE_TIMEOUT");
  });
});
