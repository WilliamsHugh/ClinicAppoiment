import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool } from "./db.js";
import { logServiceEvent } from "@clinic/request-logging";

const pool = createPool();
const migration = fileURLToPath(new URL("../../../infrastructure/supabase/doctor-service/schema.sql", import.meta.url));

try {
  await pool.query(await readFile(migration, "utf8"));
  logServiceEvent("doctor-service", "info", "migration.applied");
} finally {
  await pool.end();
}
