import { NextResponse } from "next/server";

import { databaseUrlMissingHint } from "@/lib/env-hints";
import { getSql } from "@/lib/db";

/**
 * Dev-only: verify DATABASE_URL sees `patrol_reports_raw` and sample locations.
 * Open GET http://localhost:3000/api/dashboard/health while `npm run dev`.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not set", hint: databaseUrlMissingHint() },
      { status: 503 },
    );
  }

  const sql = getSql();

  try {
    const countResult = await sql`
      SELECT COUNT(*)::int AS c FROM patrol_reports_raw
    `;
    const countRows = Array.isArray(countResult) ? countResult : [];
    const total =
      (countRows[0] as { c: number } | undefined)?.c ?? 0;

    const locResult = await sql`
      SELECT DISTINCT trim(location) AS v
      FROM patrol_reports_raw
      WHERE location IS NOT NULL AND trim(location) <> ''
      ORDER BY 1
      LIMIT 25
    `;
    const locRows = Array.isArray(locResult) ? locResult : [];
    const sample_locations = (locRows as { v: string }[]).map((r) => r.v);

    return NextResponse.json({
      patrol_reports_raw_total: total,
      sample_locations,
      hint:
        total === 0
          ? "Table is empty for this connection string — check Neon branch/DB and run the Gmail sync."
          : "If the dashboard is still empty, compare sample_locations to your Location filter (case/spelling).",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "query_failed", message },
      { status: 500 },
    );
  }
}
