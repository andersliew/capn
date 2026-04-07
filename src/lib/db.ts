import "server-only";

import { neon } from "@neondatabase/serverless";

export type SqlClient = ReturnType<typeof neon>;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon pooled connection string to .env.local (see .env.example).",
    );
  }
  return url;
}

let sqlSingleton: SqlClient | null = null;

/**
 * Neon pooled connection — server-only. Never import this file from client components.
 */
export function getSql(): SqlClient {
  if (!sqlSingleton) {
    sqlSingleton = neon(requireDatabaseUrl());
  }
  return sqlSingleton;
}
