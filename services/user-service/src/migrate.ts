import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { logServiceEvent } from "@clinic/request-logging";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const databaseSsl = process.env.DATABASE_SSL === "true";
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const databaseCaPath = process.env.DATABASE_SSL_CA_PATH;
if (databaseCaPath && !databaseSsl) throw new Error("DATABASE_SSL_CA_PATH requires DATABASE_SSL=true");
if (databaseCaPath && !rejectUnauthorized) throw new Error("DATABASE_SSL_CA_PATH requires certificate verification");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl
    ? { rejectUnauthorized, ...(databaseCaPath ? { ca: readFileSync(databaseCaPath, "utf8") } : {}) }
    : undefined,
});

const migrations = [
  {
    version: "001_base_schema",
    file: "../../../infrastructure/supabase/user-service/schema.sql",
  },
  {
    version: "002_ensure_patient_profile_for_role",
    file: "../../../infrastructure/supabase/user-service/migrations/20260928_ensure_patient_profile_for_role.sql",
  },
  {
    version: "003_session_mfa_schema",
    file: "../migrations/20261115_session_mfa_schema.up.sql",
  },
  {
    version: "004_mfa_challenge_backoff",
    file: "../migrations/20261116_mfa_challenge_backoff.up.sql",
  },
];

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('user_service_migrations'))");
  await client.query("CREATE SCHEMA IF NOT EXISTS auth");
  await client.query(`CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb
  )`);
  await client.query("CREATE SCHEMA IF NOT EXISTS user_service");
  await client.query(`CREATE TABLE IF NOT EXISTS user_service.schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  for (const migration of migrations) {
    const sql = await readFile(new URL(migration.file, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query<{ checksum: string }>(
      "SELECT checksum FROM user_service.schema_migrations WHERE version = $1",
      [migration.version],
    );
    if (existing.rows[0] && existing.rows[0].checksum !== checksum) {
      throw new Error(`Migration ${migration.version} checksum changed`);
    }
    if (!existing.rows[0]) {
      await client.query(sql);
      await client.query(
        "INSERT INTO user_service.schema_migrations (version, checksum) VALUES ($1, $2)",
        [migration.version, checksum],
      );
    }
    logServiceEvent("user-service", "info", "migration.applied", {
      version: migration.version,
      state: existing.rows[0] ? "already-applied" : "applied",
    });
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
