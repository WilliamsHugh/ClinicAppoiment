import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool } from "./db.js";

const pool = createPool();
const migration = fileURLToPath(new URL("../../../infrastructure/supabase/doctor-service/schema.sql", import.meta.url));

try {
  await pool.query(await readFile(migration, "utf8"));
  console.log("Doctor Service migration applied");
} finally {
  await pool.end();
}
