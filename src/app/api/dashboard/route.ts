import { NextRequest, NextResponse } from "next/server";

import { databaseUrlMissingHint } from "@/lib/env-hints";
import { fetchDashboardData } from "@/lib/queries";
import type { PatrolDashboardFilters } from "@/lib/types/dashboard";

function parseFilters(request: NextRequest): PatrolDashboardFilters {
  const sp = request.nextUrl.searchParams;
  const startDate = sp.get("startDate")?.trim() || null;
  const endDate = sp.get("endDate")?.trim() || null;
  const location = sp.get("location")?.trim() || null;
  const reportType = sp.get("reportType")?.trim() || null;
  const securityOfficer = sp.get("securityOfficer")?.trim() || null;
  const search = sp.get("search")?.trim() || null;
  const hasImagesRaw = sp.get("hasImages");
  let hasImages: boolean | null = null;
  if (hasImagesRaw === "true") {
    hasImages = true;
  } else if (hasImagesRaw === "false") {
    hasImages = false;
  }

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    location: location || null,
    reportType: reportType || null,
    securityOfficer: securityOfficer || null,
    hasImages,
    search: search || null,
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      {
        error: "DATABASE_URL is not set",
        hint: databaseUrlMissingHint(),
      },
      { status: 503 },
    );
  }

  const filters = parseFilters(request);

  try {
    const payload = await fetchDashboardData(filters);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "dashboard_query_failed",
        message,
      },
      { status: 500 },
    );
  }
}
