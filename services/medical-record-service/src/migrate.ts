import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined });
const sql = await readFile(new URL("../../../infrastructure/supabase/medical-record-service/schema.sql", import.meta.url), "utf8");
const version = "001_m2_record_completion_outbox";
const checksum = createHash("sha256").update(sql).digest("hex");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('medical_record_service_migrations'))");
  await client.query("CREATE SCHEMA IF NOT EXISTS medical_record_service");
  await client.query(`CREATE TABLE IF NOT EXISTS medical_record_service.schema_migrations (
    version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const existing = await client.query<{ checksum: string }>(
    "SELECT checksum FROM medical_record_service.schema_migrations WHERE version = $1", [version]);
  if (existing.rows[0] && existing.rows[0].checksum !== checksum) throw new Error(`Migration ${version} checksum changed`);
  if (!existing.rows[0]) {
    await client.query(sql);
    await client.query("INSERT INTO medical_record_service.schema_migrations (version, checksum) VALUES ($1,$2)", [version, checksum]);
  }
  await client.query("COMMIT");
  console.log(`Medical Record migration ${version}: ${existing.rows[0] ? "already applied" : "applied"}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
