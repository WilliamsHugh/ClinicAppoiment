import { z } from "zod";

export const serviceNames = ["users", "doctors", "appointments", "medicalRecords", "notifications"] as const;
export type ServiceName = (typeof serviceNames)[number];

export type GatewayConfig = {
  port: number;
  nodeEnv: string;
  authDevMode: boolean;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authTimeoutMs: number;
  healthTimeoutMs: number;
  proxyTimeoutMs: number;
  serviceTargets: Record<ServiceName, string>;
};

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  GATEWAY_PORT: z.coerce.number().int().positive().default(8080),
  AUTH_DEV_MODE: z.enum(["true", "false"]).default("false"),
  CLINIC_MANAGEMENT_WEB_URL: z.string().url().default("http://localhost:5174"),
  CORS_ORIGINS: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(1_500),
  PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  USER_SERVICE_URL: z.string().url().default("http://localhost:3001"),
  DOCTOR_SERVICE_URL: z.string().url().default("http://localhost:3002"),
  APPOINTMENT_SERVICE_URL: z.string().url().default("http://localhost:3003"),
  MEDICAL_RECORD_SERVICE_URL: z.string().url().default("http://localhost:3004"),
  NOTIFICATION_SERVICE_URL: z.string().url().default("http://localhost:3005")
});

export function loadGatewayConfig(environment: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const env = envSchema.parse(environment);
  const extraOrigins = env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];

  if (env.NODE_ENV === "production" && env.AUTH_DEV_MODE === "true") {
    throw new Error("AUTH_DEV_MODE must be disabled in production");
  }

  return {
    port: env.GATEWAY_PORT,
    nodeEnv: env.NODE_ENV,
    authDevMode: env.AUTH_DEV_MODE === "true",
    corsOrigins: [...new Set([env.CLINIC_MANAGEMENT_WEB_URL, ...extraOrigins])],
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    authTimeoutMs: env.AUTH_TIMEOUT_MS,
    healthTimeoutMs: env.HEALTH_CHECK_TIMEOUT_MS,
    proxyTimeoutMs: env.PROXY_TIMEOUT_MS,
    serviceTargets: {
      users: env.USER_SERVICE_URL,
      doctors: env.DOCTOR_SERVICE_URL,
      appointments: env.APPOINTMENT_SERVICE_URL,
      medicalRecords: env.MEDICAL_RECORD_SERVICE_URL,
      notifications: env.NOTIFICATION_SERVICE_URL
    }
  };
}
