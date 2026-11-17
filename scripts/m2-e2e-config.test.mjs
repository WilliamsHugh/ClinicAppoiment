import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readM2E2EConfig } from "./m2-e2e-config.mjs";

const names = {
  USER: "user_service_test",
  DOCTOR: "doctor_service_test",
  APPOINTMENT: "appointment_service_test",
  RECORD: "medical_record_service_test",
  NOTIFICATION: "notification_service_test",
};
const tokenNames = [
  "USER_GATEWAY_INTERNAL_API_TOKEN", "USER_DOCTOR_INTERNAL_API_TOKEN", "USER_APPOINTMENT_INTERNAL_API_TOKEN",
  "USER_RECORD_INTERNAL_API_TOKEN", "DOCTOR_USER_INTERNAL_API_TOKEN", "DOCTOR_INTERNAL_API_TOKEN",
  "APPOINTMENT_USER_INTERNAL_API_TOKEN", "RECORD_APPOINTMENT_INTERNAL_API_TOKEN",
  "APPOINTMENT_RECORD_INTERNAL_API_TOKEN", "NOTIFICATION_INTERNAL_API_TOKEN",
  "APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN",
];
const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

function configureSafeEnvironment() {
  delete process.env.M2_E2E_ALLOW_DATABASE_RESET;
  delete process.env.M2_E2E_ALLOW_DATABASE_WRITES;
  delete process.env.M2_E2E_AUTH_PROJECT_ISOLATED;
  delete process.env.M2_E2E_SUPABASE_PROJECT_REF;
  for (const [service, database] of Object.entries(names)) {
    process.env[`M2_E2E_DATABASE_URL_${service}`] = `postgresql://tester:test-only@127.0.0.1:5433/${database}`;
  }
  for (const name of tokenNames) process.env[name] = `test-token-${name}-with-more-than-32-bytes`;
  process.env.M2_E2E_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.M2_E2E_SUPABASE_ANON_KEY = "local-test-publishable-key";
}

test("requires explicit database write and reset opt-ins", () => {
  configureSafeEnvironment();
  assert.throws(() => readM2E2EConfig({ requireDatabaseWrites: true }), /M2_E2E_ALLOW_DATABASE_WRITES/);
  process.env.M2_E2E_ALLOW_DATABASE_WRITES = "1";
  assert.throws(() => readM2E2EConfig({ requireDatabaseReset: true }), /M2_E2E_ALLOW_DATABASE_RESET/);
});

test("rejects a non-loopback database target before returning config", () => {
  configureSafeEnvironment();
  process.env.M2_E2E_ALLOW_DATABASE_WRITES = "1";
  process.env.M2_E2E_DATABASE_URL_USER = "postgresql://tester:test-only@db.example.test:5432/user_service_test";
  assert.throws(() => readM2E2EConfig({ requireDatabaseWrites: true }), /must point to loopback/);
});

test("rejects a remote host override hidden in a loopback PostgreSQL URL", () => {
  configureSafeEnvironment();
  process.env.M2_E2E_ALLOW_DATABASE_WRITES = "1";
  process.env.M2_E2E_DATABASE_URL_USER = "postgresql://tester:test-only@127.0.0.1:5433/user_service_test?host=db.example.test";
  assert.throws(() => readM2E2EConfig({ requireDatabaseWrites: true }), /cannot override its loopback host/);
});

test("rejects hosted Auth unless a dedicated project is explicitly attested", () => {
  configureSafeEnvironment();
  process.env.M2_E2E_ALLOW_DATABASE_WRITES = "1";
  process.env.M2_E2E_SUPABASE_URL = "https://isolated-ref.supabase.co";
  process.env.M2_E2E_SUPABASE_PROJECT_REF = "isolated-ref";
  assert.throws(() => readM2E2EConfig({ requireDatabaseWrites: true }), /M2_E2E_AUTH_PROJECT_ISOLATED/);
  process.env.M2_E2E_AUTH_PROJECT_ISOLATED = "1";
  assert.equal(readM2E2EConfig({ requireDatabaseWrites: true }).supabaseUrl, "https://isolated-ref.supabase.co");
});
