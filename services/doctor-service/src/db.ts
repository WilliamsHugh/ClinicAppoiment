import pg from "pg";
import { readFileSync } from "node:fs";

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required for Doctor Service");
  const databaseSsl = process.env.DATABASE_SSL === "true";
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  const databaseCaPath = process.env.DATABASE_SSL_CA_PATH;
  if (databaseCaPath && !databaseSsl) throw new Error("DATABASE_SSL_CA_PATH requires DATABASE_SSL=true");
  if (databaseCaPath && !rejectUnauthorized) throw new Error("DATABASE_SSL_CA_PATH requires certificate verification");
  return new pg.Pool({
    connectionString,
    ssl: databaseSsl
      ? { rejectUnauthorized, ...(databaseCaPath ? { ca: readFileSync(databaseCaPath, "utf8") } : {}) }
      : undefined,
    max: 10,
    connectionTimeoutMillis: 3000,
  });
}
