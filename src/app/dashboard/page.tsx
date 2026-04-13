import { Suspense } from "react";

import { DashboardClient, DashboardFallback } from "@/app/dashboard/dashboard-client";

function parseLocation(
  raw: string | string[] | undefined,
): string | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  if (Array.isArray(raw) && raw[0]) {
    const t = String(raw[0]).trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const initialLocation = parseLocation(sp.location);

  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardClient initialLocation={initialLocation} />
    </Suspense>
  );
}
