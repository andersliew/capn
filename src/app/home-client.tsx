"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useTriggerGmailSyncOnMount } from "@/hooks/use-trigger-gmail-sync-on-mount";
import type { FilterOptions } from "@/lib/types/dashboard";

export function HomeClient() {
  useTriggerGmailSyncOnMount();
  const [locations, setLocations] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apartment, setApartment] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/filter-options", {
          cache: "no-store",
        });
        const json = (await res.json()) as FilterOptions & {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          setLoadError(json.message ?? json.error ?? `Request failed (${res.status})`);
          return;
        }
        if (!cancelled) {
          setLocations(json.locations ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Network error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dashboardHref =
    apartment === "" ? "/dashboard" : `/dashboard?location=${encodeURIComponent(apartment)}`;

  return (
    <>
      <p className="text-sm font-medium uppercase tracking-wide text-sky-500/90">
        CAPN Security
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
        Security Operations Reports
      </h1>
      <p className="mt-3 text-zinc-500">
        Neon-backed patrol dashboard with live reads from the database.
      </p>
      {loadError ? (
        <p className="mt-4 text-sm text-amber-200/90" role="alert">
          Could not load locations: {loadError}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-end sm:justify-center">
        <label className="flex flex-col gap-1.5 text-left sm:min-w-[220px]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Apartment
          </span>
          <select
            value={apartment}
            onChange={(e) => setApartment(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2.5 text-sm text-zinc-100"
          >
            <option value="">All</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>
        <Link
          href={dashboardHref}
          className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          Open dashboard
        </Link>
      </div>
    </>
  );
}
