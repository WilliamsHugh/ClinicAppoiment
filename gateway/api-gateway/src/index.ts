import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Role } from "@clinic/shared-types";

const port = Number(process.env.GATEWAY_PORT ?? 8080);

const serviceTargets = {
  users: process.env.USER_SERVICE_URL ?? "http://localhost:3001",
  doctors: process.env.DOCTOR_SERVICE_URL ?? "http://localhost:3002",
  appointments: process.env.APPOINTMENT_SERVICE_URL ?? "http://localhost:3003",
  medicalRecords: process.env.MEDICAL_RECORD_SERVICE_URL ?? "http://localhost:3004",
  notifications: process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3005"
};

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    role: Role;
  };
};

const app = express();

app.use(
  cors({
    origin: [
      process.env.CLINIC_MANAGEMENT_WEB_URL ?? "http://localhost:5174"
    ],
    credentials: true
  })
);
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    limit: Number(process.env.RATE_LIMIT_MAX ?? 120),
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

function sendError(res: Response, status: number, code: string, message: string, details: unknown[] = []) {
  return res.status(status).json({
    success: false,
    error: { code, message, details }
  });
}

async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return sendError(res, 401, "AUTH_TOKEN_MISSING", "Access token is required");
  }

  if (!supabase) {
    req.user = {
      id: req.header("x-user-id") ?? "dev-user",
      role: (req.header("x-role") as Role | undefined) ?? "PATIENT"
    };
    return next();
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return sendError(res, 401, "AUTH_TOKEN_INVALID", "Access token is invalid");
  }

  req.user = {
    id: data.user.id,
    role: ((data.user.user_metadata.role as Role | undefined) ?? "PATIENT")
  };

  return next();
}

function requireRoles(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, "ACCESS_DENIED", "You do not have permission to access this resource");
    }
    return next();
  };
}

function proxyTo(target: string, upstreamPrefix: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path) => `${upstreamPrefix}${path}`,
    on: {
      proxyReq: (proxyReq, req: AuthenticatedRequest) => {
        if (req.user) {
          proxyReq.setHeader("x-user-id", req.user.id);
          proxyReq.setHeader("x-role", req.user.role);
        }
      },
      error: (_err, _req, res) => {
        if ("headersSent" in res && !res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
        }
        if ("end" in res) res.end(
          JSON.stringify({
            success: false,
            error: {
              code: "UPSTREAM_SERVICE_UNAVAILABLE",
              message: "Internal service is unavailable",
              details: []
            }
          })
        );
      }
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      service: "api-gateway",
      status: "ok",
      services: serviceTargets
    }
  });
});

app.use("/api/v1/auth", authenticate, proxyTo(serviceTargets.users, "/api/v1/auth"));
app.use("/api/v1/users", authenticate, proxyTo(serviceTargets.users, "/api/v1/users"));
app.use("/api/v1/patients", authenticate, proxyTo(serviceTargets.users, "/api/v1/patients"));
app.use("/api/v1/specialties", authenticate, proxyTo(serviceTargets.doctors, "/api/v1/specialties"));
app.use("/api/v1/doctors", authenticate, proxyTo(serviceTargets.doctors, "/api/v1/doctors"));
app.use("/api/v1/schedules", authenticate, requireRoles("DOCTOR", "STAFF", "ADMIN"), proxyTo(serviceTargets.doctors, "/api/v1/schedules"));
app.use("/api/v1/appointments", authenticate, proxyTo(serviceTargets.appointments, "/api/v1/appointments"));
app.use("/api/v1/medical-records", authenticate, proxyTo(serviceTargets.medicalRecords, "/api/v1/medical-records"));
app.use("/api/v1/notifications", authenticate, proxyTo(serviceTargets.notifications, "/api/v1/notifications"));
app.get("/api/v1/system/health", authenticate, requireRoles("ADMIN"), (_req, res) => {
  res.json({
    success: true,
    data: {
      gateway: "ok",
      services: serviceTargets
    }
  });
});

app.use((_req, res) => sendError(res, 404, "ROUTE_NOT_FOUND", "Route not found"));

app.listen(port, () => {
  console.log(`API Gateway listening on port ${port}`);
});
