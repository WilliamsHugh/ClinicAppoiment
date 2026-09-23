import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";
import swaggerUi from "swagger-ui-express";
import { createAuthenticate, createSupabaseAuthBroker, createSupabaseVerifier, createUserProfileResolver, requireRoles } from "./auth.js";
import { createAuthRouter } from "./auth-routes.js";
import type { GatewayConfig, ServiceName } from "./config.js";
import { serviceNames } from "./config.js";
import { createErrorHandler, notFoundHandler, requestContext, sendError, type GatewayLogger } from "./http.js";
import { gatewayOpenApiDocument } from "./openapi.js";
import type { AccessTokenVerifier, AuthBroker, GatewayRequest, UserProfileResolver } from "./types.js";

type HealthState = "ok" | "unavailable";
type HealthChecker = (service: ServiceName, target: string) => Promise<HealthState>;

type CreateGatewayAppOptions = {
  config: GatewayConfig;
  authVerifier?: AccessTokenVerifier | null;
  authBroker?: AuthBroker | null;
  profileResolver?: UserProfileResolver;
  healthChecker?: HealthChecker;
  logger?: GatewayLogger;
};

function defaultHealthChecker(timeoutMs: number): HealthChecker {
  return async (_service, target) => {
    try {
      const response = await fetch(`${target}/health`, { signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? "ok" : "unavailable";
    } catch {
      return "unavailable";
    }
  };
}

function proxyTo(target: string, upstreamPrefix: string, timeoutMs: number, corsOrigins: string[]) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: timeoutMs,
    selfHandleResponse: true,
    pathRewrite: (path) => `${upstreamPrefix}${path}`,
    on: {
      proxyReq: (proxyReq, rawRequest) => {
        const req = rawRequest as GatewayRequest;
        proxyReq.removeHeader("x-user-id");
        proxyReq.removeHeader("x-role");
        proxyReq.removeHeader("x-supabase-auth-user-id");
        if (req.user) {
          proxyReq.setHeader("X-User-Id", req.user.id);
          proxyReq.setHeader("X-Role", req.user.role);
          proxyReq.setHeader("X-Supabase-Auth-User-Id", req.user.authUserId);
        }
        if (req.requestId) proxyReq.setHeader("X-Request-Id", req.requestId);
      },
      proxyRes: responseInterceptor(async (responseBuffer, proxyResponse, rawRequest, rawResponse) => {
        const req = rawRequest as GatewayRequest;
        rawResponse.removeHeader("Access-Control-Allow-Origin");
        rawResponse.removeHeader("Access-Control-Allow-Credentials");
        rawResponse.removeHeader("Access-Control-Expose-Headers");
        rawResponse.removeHeader("X-Powered-By");
        rawResponse.removeHeader("Server");
        const origin = rawRequest.headers.origin;
        if (origin && corsOrigins.includes(origin)) {
          rawResponse.setHeader("Access-Control-Allow-Origin", origin);
          rawResponse.setHeader("Access-Control-Allow-Credentials", "true");
          rawResponse.setHeader("Vary", "Origin");
        }
        rawResponse.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
        rawResponse.setHeader("X-Request-Id", req.requestId ?? "unknown");
        if ((proxyResponse.statusCode ?? 200) < 400) return responseBuffer;

        try {
          const body = JSON.parse(responseBuffer.toString("utf8")) as {
            success?: unknown;
            error?: { code?: unknown; message?: unknown; details?: unknown };
          };
          if (
            body.success === false &&
            typeof body.error?.code === "string" &&
            typeof body.error.message === "string" &&
            Array.isArray(body.error.details)
          ) {
            return Buffer.from(JSON.stringify({ ...body, requestId: req.requestId }));
          }
        } catch {
          // The upstream error is normalized below.
        }

        if (proxyResponse.statusCode === 404) {
          rawResponse.statusCode = 404;
          rawResponse.setHeader("Content-Type", "application/json; charset=utf-8");
          return Buffer.from(JSON.stringify({
            success: false,
            error: { code: "ROUTE_NOT_FOUND", message: "Route not found", details: [] },
            requestId: req.requestId
          }));
        }

        rawResponse.statusCode = 502;
        rawResponse.setHeader("Content-Type", "application/json; charset=utf-8");
        return Buffer.from(JSON.stringify({
          success: false,
          error: { code: "UPSTREAM_INVALID_RESPONSE", message: "Internal service returned an invalid response", details: [] },
          requestId: req.requestId
        }));
      }),
      error: (error, rawRequest, rawResponse) => {
        const req = rawRequest as GatewayRequest;
        if (("headersSent" in rawResponse && rawResponse.headersSent) || ("writableEnded" in rawResponse && rawResponse.writableEnded)) return;
        const isTimeout = "code" in error && (
          error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT" || error.code === "ECONNRESET"
        );
        if ("writeHead" in rawResponse) {
          rawResponse.writeHead(isTimeout ? 504 : 502, { "Content-Type": "application/json", "X-Request-Id": req.requestId ?? "unknown" });
        }
        if ("end" in rawResponse) {
          rawResponse.end(JSON.stringify({
            success: false,
            error: {
              code: isTimeout ? "UPSTREAM_SERVICE_TIMEOUT" : "UPSTREAM_SERVICE_UNAVAILABLE",
              message: isTimeout ? "Internal service timed out" : "Internal service is unavailable",
              details: []
            },
            requestId: req.requestId
          }));
        }
      }
    }
  });
}

export function createGatewayApp(options: CreateGatewayAppOptions) {
  const { config } = options;
  const logger = options.logger ?? console;
  const verifier = options.authVerifier === undefined ? createSupabaseVerifier(config) : options.authVerifier;
  const resolveProfile = options.profileResolver ?? createUserProfileResolver(config);
  const authBroker = options.authBroker === undefined ? createSupabaseAuthBroker(config) : options.authBroker;
  const authenticate = createAuthenticate(config, verifier, resolveProfile);
  const checkHealth = options.healthChecker ?? defaultHealthChecker(config.healthTimeoutMs);
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContext(logger));
  app.use(cors({
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"],
    origin: (origin, callback) => callback(null, !origin || config.corsOrigins.includes(origin))
  }));
  app.use(rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: GatewayRequest, res) => sendError(res, 429, "RATE_LIMIT_EXCEEDED", "Too many requests", [], req.requestId)
  }));

  app.get("/health", (_req, res) => res.json({ success: true, data: { service: "api-gateway", status: "ok" } }));
  app.get("/openapi.json", (_req, res) => res.json(gatewayOpenApiDocument));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(gatewayOpenApiDocument));
  app.use("/api/v1/auth", createAuthRouter(authBroker, resolveProfile));

  app.get("/api/v1/system/health", authenticate, requireRoles("ADMIN"), async (req: GatewayRequest, res) => {
    const entries = await Promise.all(serviceNames.map(async (service) => [service, await checkHealth(service, config.serviceTargets[service])] as const));
    const services = Object.fromEntries(entries) as Record<ServiceName, HealthState>;
    const status = Object.values(services).every((state) => state === "ok") ? "ok" : "degraded";
    res.json({ success: true, data: { gateway: "ok", status, services }, requestId: req.requestId });
  });

  const routeGroups: Array<{ prefix: string; service: ServiceName }> = [
    { prefix: "/api/v1/auth", service: "users" },
    { prefix: "/api/v1/users", service: "users" },
    { prefix: "/api/v1/patients", service: "users" },
    { prefix: "/api/v1/specialties", service: "doctors" },
    { prefix: "/api/v1/doctors", service: "doctors" },
    { prefix: "/api/v1/schedules", service: "doctors" },
    { prefix: "/api/v1/appointments", service: "appointments" },
    { prefix: "/api/v1/medical-records", service: "medicalRecords" },
    { prefix: "/api/v1/notifications", service: "notifications" }
  ];
  for (const route of routeGroups) {
    app.use(
      route.prefix,
      authenticate,
      proxyTo(config.serviceTargets[route.service], route.prefix, config.proxyTimeoutMs, config.corsOrigins)
    );
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
