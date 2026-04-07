import { NextResponse } from "next/server";

import { fetchFilterOptions } from "@/lib/queries";

export async function GET() {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      {
        error: "DATABASE_URL is not set",
        hint: "Add DATABASE_URL to .env.local with your Neon pooled connection string.",
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
