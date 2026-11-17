import { spawn } from "node:child_process";
import http from "node:http";
import { readM2E2EConfig } from "./m2-e2e-config.mjs";

const config = readM2E2EConfig({ requireDatabaseWrites: true });
const tokenEnv = config.internalTokens;
const shared = { ...tokenEnv, NODE_ENV: "development", LOG_LEVEL: "warn", HOST: "127.0.0.1" };

const services = [
  { name: "user-service", path: "services/user-service/dist/index.js", port: 3001, env: {
    USER_SERVICE_PORT: "3001", DATABASE_URL: config.databases.user.connectionString, DATABASE_SSL: "false",
    SUPABASE_URL: config.supabaseUrl, SUPABASE_ANON_KEY: config.supabaseAnonKey,
    AUTH_PROVIDER_TIMEOUT_MS: "15000", DOCTOR_SERVICE_URL: "http://127.0.0.1:3002", APPOINTMENT_SERVICE_URL: "http://127.0.0.1:3003",
  } },
  { name: "doctor-service", path: "services/doctor-service/dist/index.js", port: 3002, env: {
    DOCTOR_SERVICE_PORT: "3002", DATABASE_URL: config.databases.doctor.connectionString, DATABASE_SSL: "false",
    USER_SERVICE_URL: "http://127.0.0.1:3001", APPOINTMENT_SERVICE_URL: "http://127.0.0.1:3003",
  } },
  { name: "appointment-service", path: "services/appointment-service/dist/index.js", port: 3003, env: {
    APPOINTMENT_SERVICE_PORT: "3003", DATABASE_URL: config.databases.appointment.connectionString, DATABASE_SSL: "false",
    USER_SERVICE_URL: "http://127.0.0.1:3001", DOCTOR_SERVICE_URL: "http://127.0.0.1:3002",
    NOTIFICATION_SERVICE_URL: "http://127.0.0.1:3005", MEDICAL_RECORD_SERVICE_URL: "http://127.0.0.1:3004",
    APPOINTMENT_OUTBOX_POLL_MS: "2000",
  } },
  { name: "medical-record-service", path: "services/medical-record-service/dist/index.js", port: 3004, env: {
    MEDICAL_RECORD_SERVICE_PORT: "3004", DATABASE_URL: config.databases.record.connectionString, DATABASE_SSL: "false",
    USER_SERVICE_URL: "http://127.0.0.1:3001", DOCTOR_SERVICE_URL: "http://127.0.0.1:3002",
    APPOINTMENT_SERVICE_URL: "http://127.0.0.1:3003", NOTIFICATION_SERVICE_URL: "http://127.0.0.1:3005",
  } },
  { name: "notification-service", path: "services/notification-service/dist/index.js", port: 3005, env: {
    NOTIFICATION_SERVICE_PORT: "3005", DATABASE_URL: config.databases.notification.connectionString, DATABASE_SSL: "false",
    APPOINTMENT_SERVICE_URL: "http://127.0.0.1:3003",
  } },
  { name: "api-gateway", path: "gateway/api-gateway/dist/index.js", port: 8080, env: {
    GATEWAY_PORT: "8080", AUTH_DEV_MODE: "false", HOST: "127.0.0.1",
    CLINIC_MANAGEMENT_WEB_URL: "http://localhost:5174", CORS_ORIGINS: "http://localhost:5174,http://localhost:3000",
    USER_SERVICE_URL: "http://127.0.0.1:3001", DOCTOR_SERVICE_URL: "http://127.0.0.1:3002",
    APPOINTMENT_SERVICE_URL: "http://127.0.0.1:3003", MEDICAL_RECORD_SERVICE_URL: "http://127.0.0.1:3004",
    NOTIFICATION_SERVICE_URL: "http://127.0.0.1:3005", RATE_LIMIT_WINDOW_MS: "60000", RATE_LIMIT_MAX: "1000",
    AUTH_TIMEOUT_MS: "8000", AUTH_IDENTITY_CACHE_TTL_MS: "300000", AUTH_IDENTITY_CACHE_MAX_ENTRIES: "5000",
    HEALTH_CHECK_TIMEOUT_MS: "1500", PROXY_TIMEOUT_MS: "20000",
  } },
];

const children = [];
let stopping = false;

function health(port) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => { request.destroy(); resolve(false); });
  });
}

async function waitForHealthy() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await Promise.all(services.map(({ port }) => health(port)))).every(Boolean)) return true;
    if (children.some((child) => child.exitCode !== null)) return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const service of services) {
  const child = spawn("node", [service.path], {
    env: { ...process.env, ...shared, ...service.env },
    stdio: "inherit",
  });
  child.on("error", (error) => {
    console.error(`[m2-e2e] ${service.name} failed to start (${error.code ?? "spawn error"})`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!stopping && code !== 0) {
      console.error(`[m2-e2e] ${service.name} exited unexpectedly (code ${code})`);
      shutdown(1);
    }
  });
  children.push(child);
}

console.log("[m2-e2e] Starting Gateway and five services on loopback with disposable test configuration.");
if (!(await waitForHealthy())) {
  console.error("[m2-e2e] Services did not all pass health checks.");
  shutdown(1);
} else {
  console.log("[m2-e2e] Six local processes are healthy. Press Ctrl+C to stop.");
}

setInterval(() => {}, 10_000);
