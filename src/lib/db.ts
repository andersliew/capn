import "server-only";

import { neon } from "@neondatabase/serverless";

import { databaseUrlMissingHint } from "@/lib/env-hints";

export type SqlClient = ReturnType<typeof neon>;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(`DATABASE_URL is not set. ${databaseUrlMissingHint()}`);
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
