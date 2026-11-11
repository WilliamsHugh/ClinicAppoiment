import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createAppointmentPool } from "./postgres-repository.js";
import { logServiceEvent } from "@clinic/request-logging";

const pool = createAppointmentPool();
const migration = fileURLToPath(new URL("../../../infrastructure/supabase/appointment-service/schema.sql", import.meta.url));

try {
  await pool.query(await readFile(migration, "utf8"));
  logServiceEvent("appointment-service", "info", "migration.applied");
} finally {
  await pool.end();
}
