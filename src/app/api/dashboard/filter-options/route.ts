import { NextResponse } from "next/server";

import { databaseUrlMissingHint } from "@/lib/env-hints";
import { fetchFilterOptions } from "@/lib/queries";

export async function GET() {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      {
        error: "DATABASE_URL is not set",
        hint: databaseUrlMissingHint(),
      },
      { status: 503 },
    );
  }

  try {
    const filterOptions = await fetchFilterOptions();
    return NextResponse.json(filterOptions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "filter_options_failed", message },
      { status: 500 },
    );
  }
}
