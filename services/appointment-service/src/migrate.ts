import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createAppointmentPool } from "./postgres-repository.js";

const pool = createAppointmentPool();
const migration = fileURLToPath(new URL("../../../infrastructure/supabase/appointment-service/schema.sql", import.meta.url));

try {
  await pool.query(await readFile(migration, "utf8"));
  console.log("Appointment Service migration applied");
} finally {
  await pool.end();
}
