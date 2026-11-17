import { spawn } from "node:child_process";
import http from "node:http";

const DB_PORT = 5433;
const DB_USER = "postgres";
const DB_PASS = "testpassword";
const DB_HOST = "127.0.0.1";

const SHARED_TOKENS = {
  USER_GATEWAY_INTERNAL_API_TOKEN: "95808e6dbad6d9ce7bb4b73516f8ccb79984fb51581634dd42c82141c67fd927",
  USER_DOCTOR_INTERNAL_API_TOKEN: "d20b44e1190ee0b5ce74f834070d14f1d03fbf1cbea65a4be68529047da7987e",
  USER_APPOINTMENT_INTERNAL_API_TOKEN: "b7a14e3d989a48fc772f4080676d67f2f5e8ad4fd56dbe46e16ca0c47c451db5",
  USER_RECORD_INTERNAL_API_TOKEN: "6ef94a0cf0af6bdd933a447903360f49bacafa4ef9d88f5bf044e38baf0a24cc",
  DOCTOR_USER_INTERNAL_API_TOKEN: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
  DOCTOR_INTERNAL_API_TOKEN: "ec75058d33b515ad87adf8c0cec87b842dbd6483e3a9764ab28d5a25ccf079cf",
  APPOINTMENT_USER_INTERNAL_API_TOKEN: "54d87363a909a77a604628d42b72075b3e0a7f4879f5b4ed78e6cd1b84d15848",
  APPOINTMENT_INTERNAL_API_TOKEN: "54d87363a909a77a604628d42b72075b3e0a7f4879f5b4ed78e6cd1b84d15848",
  RECORD_APPOINTMENT_INTERNAL_API_TOKEN: "c81f72a4d01b63ef29a4bb397120a4be35cf69074a381de0f5319808a3d1624b",
  APPOINTMENT_RECORD_INTERNAL_API_TOKEN: "a73d2891f034bc7e891029471be39d10459c381fde49204859a1038475920183",
  APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN: "b91823746a5982e0192837465920184759302847593028475920194857291038",
  NOTIFICATION_INTERNAL_API_TOKEN: "e98a7b6c5d4e3f20192837465019283746501928374650192837465019283746"
};

const SERVICES = [
  {
    name: "user-service",
    script: "services/user-service/dist/index.js",
    port: 3001,
    env: {
      USER_SERVICE_PORT: "3001",
      DATABASE_URL: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/user_service_test`,
      DATABASE_SSL: "false",
      SUPABASE_URL: "https://xzzimreciacbozayycmh.supabase.co",
      SUPABASE_ANON_KEY: "sb_publishable_f6g7-5cfhzWtcsuwZAymKg_6k_ffsIC",
      AUTH_PROVIDER_TIMEOUT_MS: "15000",
      DOCTOR_SERVICE_URL: "http://localhost:3002",
      APPOINTMENT_SERVICE_URL: "http://localhost:3003",
      LOG_LEVEL: "warn",
      NODE_ENV: "development",
      ...SHARED_TOKENS
    }
  },
  {
    name: "doctor-service",
    script: "services/doctor-service/dist/index.js",
    port: 3002,
    env: {
      DOCTOR_SERVICE_PORT: "3002",
      DATABASE_URL: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/doctor_service_test`,
      DATABASE_SSL: "false",
      USER_SERVICE_URL: "http://localhost:3001",
      APPOINTMENT_SERVICE_URL: "http://localhost:3003",
      LOG_LEVEL: "warn",
      NODE_ENV: "development",
      ...SHARED_TOKENS
    }
  },
  {
    name: "appointment-service",
    script: "services/appointment-service/dist/index.js",
    port: 3003,
    env: {
      APPOINTMENT_SERVICE_PORT: "3003",
      DATABASE_URL: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/appointment_service_test`,
      DATABASE_SSL: "false",
      USER_SERVICE_URL: "http://localhost:3001",
      DOCTOR_SERVICE_URL: "http://localhost:3002",
      NOTIFICATION_SERVICE_URL: "http://localhost:3005",
      MEDICAL_RECORD_SERVICE_URL: "http://localhost:3004",
      APPOINTMENT_OUTBOX_POLL_MS: "2000",
      LOG_LEVEL: "warn",
      NODE_ENV: "development",
      ...SHARED_TOKENS
    }
  },
  {
    name: "medical-record-service",
    script: "services/medical-record-service/dist/index.js",
    port: 3004,
    env: {
      MEDICAL_RECORD_SERVICE_PORT: "3004",
      DATABASE_URL: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/medical_record_service_test`,
      DATABASE_SSL: "false",
      USER_SERVICE_URL: "http://localhost:3001",
      DOCTOR_SERVICE_URL: "http://localhost:3002",
      APPOINTMENT_SERVICE_URL: "http://localhost:3003",
      NOTIFICATION_SERVICE_URL: "http://localhost:3005",
      LOG_LEVEL: "warn",
      NODE_ENV: "development",
      ...SHARED_TOKENS
    }
  },
  {
    name: "notification-service",
    script: "services/notification-service/dist/index.js",
    port: 3005,
    env: {
      NOTIFICATION_SERVICE_PORT: "3005",
      DATABASE_URL: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/notification_service_test`,
      DATABASE_SSL: "false",
      APPOINTMENT_SERVICE_URL: "http://localhost:3003",
      LOG_LEVEL: "warn",
      NODE_ENV: "development",
      ...SHARED_TOKENS
    }
  },
  {
    name: "api-gateway",
    script: "gateway/api-gateway/dist/index.js",
    port: 8080,
    env: {
      GATEWAY_PORT: "8080",
      NODE_ENV: "development",
      AUTH_DEV_MODE: "false",
      CLINIC_MANAGEMENT_WEB_URL: "http://localhost:5174",
      CORS_ORIGINS: "http://localhost:5174,http://localhost:3000",
      USER_SERVICE_URL: "http://localhost:3001",
      DOCTOR_SERVICE_URL: "http://localhost:3002",
      APPOINTMENT_SERVICE_URL: "http://localhost:3003",
      MEDICAL_RECORD_SERVICE_URL: "http://localhost:3004",
      NOTIFICATION_SERVICE_URL: "http://localhost:3005",
      RATE_LIMIT_WINDOW_MS: "60000",
      RATE_LIMIT_MAX: "1000",
      AUTH_TIMEOUT_MS: "8000",
      AUTH_IDENTITY_CACHE_TTL_MS: "300000",
      AUTH_IDENTITY_CACHE_MAX_ENTRIES: "5000",
      HEALTH_CHECK_TIMEOUT_MS: "1500",
      PROXY_TIMEOUT_MS: "20000",
      ...SHARED_TOKENS
    }
  }
];

const children = [];

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForAllHealthy(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    const results = await Promise.all(SERVICES.map((s) => checkHealth(s.port)));
    const allHealthy = results.every(Boolean);
    if (allHealthy) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function shutdown() {
  console.log("\n[daemon] Shutting down services...");
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("=== STARTING 5 SERVICES + API GATEWAY (DISPOSABLE DB CỔNG 5433) ===");

for (const s of SERVICES) {
  console.log(`[spawning] ${s.name} on port ${s.port}...`);
  const child = spawn("node", [s.script], {
    env: { ...process.env, ...s.env },
    stdio: "inherit"
  });
  child.on("error", (err) => console.error(`[error] ${s.name}:`, err.message));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[exit] ${s.name} exited with code ${code}`);
    }
  });
  children.push(child);
}

console.log("[daemon] Waiting for all 6 processes to be healthy on /health...");
const healthy = await waitForAllHealthy();

if (!healthy) {
  console.error("[daemon] ERROR: One or more services failed health check within 15s!");
  shutdown();
  process.exit(1);
}

console.log("\n==================================================================");
console.log("ALL 6 PROCESSES ARE HEALTHY AND READY!");
console.log("- API Gateway:          http://127.0.0.1:8080 (public entrypoint)");
console.log("- User Service:         http://127.0.0.1:3001 (internal)");
console.log("- Doctor Service:       http://127.0.0.1:3002 (internal)");
console.log("- Appointment Service:  http://127.0.0.1:3003 (internal)");
console.log("- Medical Record Service: http://127.0.0.1:3004 (internal)");
console.log("- Notification Service: http://127.0.0.1:3005 (internal)");
console.log("Database: PostgreSQL disposable container clinic-test-pg (port 5433)");
console.log("==================================================================\n");

// Keep event loop alive
setInterval(() => {}, 10000);
