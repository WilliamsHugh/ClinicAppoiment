import pg from "pg";

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required for Doctor Service");
  return new pg.Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined,
    max: 10,
    connectionTimeoutMillis: 3000,
  });
}
