"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DateField } from "@/components/dashboard/DateField";
import { DayOfWeekChart } from "@/components/dashboard/DayOfWeekChart";
import { HourChart } from "@/components/dashboard/HourChart";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { NamedBarChart } from "@/components/dashboard/NamedBarChart";
import { RecentReportsTable } from "@/components/dashboard/RecentReportsTable";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { useTriggerGmailSyncOnMount } from "@/hooks/use-trigger-gmail-sync-on-mount";
import type { DashboardPayload, PatrolDashboardFilters } from "@/lib/types/dashboard";

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
      />
    </svg>
  );
}

const headerIconButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#141419] text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200";

/** Chevron + padding live in this module so SSR and the client bundle always match (avoids HMR/CSS drift on `<select>`). */
const FILTER_SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

const filterSelectStyle: CSSProperties = {
  backgroundImage: FILTER_SELECT_CHEVRON,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.85rem center",
  backgroundSize: "1rem 1rem",
};

const filterSelectClassName =
  "w-full appearance-none rounded-lg border border-white/[0.08] bg-[#141419] py-2 pl-3 pr-[2.35rem] text-sm text-zinc-100";

/** Local calendar YYYY-MM-DD (avoid UTC shift from `toISOString()` on date boundaries). */
function toLocalDateString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Wide default so report dates parsed from email subjects (often not “this month”) still appear. */
function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 730);
  return {
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
  };
}

function buildQuery(f: PatrolDashboardFilters): string {
  const p = new URLSearchParams();
  if (f.startDate) {
    p.set("startDate", f.startDate);
  }
  if (f.endDate) {
    p.set("endDate", f.endDate);
  }
  if (f.location) {
    p.set("location", f.location);
  }
  if (f.reportType) {
    p.set("reportType", f.reportType);
  }
  if (f.securityOfficer) {
    p.set("securityOfficer", f.securityOfficer);
  }
  if (f.hasImages === true) {
    p.set("hasImages", "true");
  }
  if (f.hasImages === false) {
    p.set("hasImages", "false");
  }
  if (f.search) {
    p.set("search", f.search);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

type DashboardClientProps = {
  /** From server `searchParams` so SSR and first client paint match (avoids useSearchParams hydration drift). */
  initialLocation: string | null;
};

export function DashboardClient({ initialLocation }: DashboardClientProps) {
  useTriggerGmailSyncOnMount();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /** Dates must not be computed during SSR: server TZ vs browser TZ changes min/max on date inputs and causes hydration errors. */
  const [filters, setFilters] = useState<PatrolDashboardFilters>(() => ({
    startDate: null,
    endDate: null,
    location: initialLocation,
    reportType: null,
    securityOfficer: null,
    hasImages: null,
    search: null,
  }));

  useEffect(() => {
    const range = defaultRange();
    setLoading(true);
    setFilters((f) => ({
      ...f,
      startDate: range.startDate,
      endDate: range.endDate,
    }));
  }, []);

  useEffect(() => {
    const loc = searchParams.get("location")?.trim() || null;
    setFilters((f) => (f.location === loc ? f : { ...f, location: loc }));
  }, [searchParams]);

  const effectiveLocation = useMemo(() => {
    const u = searchParams.get("location")?.trim();
    if (u && u.length > 0) return u;
    if (filters.location) return filters.location;
    return initialLocation;
  }, [searchParams, filters.location, initialLocation]);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const locationSelectOptions = useMemo(() => {
    const list = data?.filterOptions.locations ?? [];
    const sel = effectiveLocation;
    if (sel && !list.includes(sel)) {
      return [sel, ...list];
    }
    return list;
  }, [data?.filterOptions.locations, effectiveLocation]);

  const applySearch = useCallback(() => {
    setAppliedSearch(searchInput.trim());
  }, [searchInput]);

  const setLocationFilter = useCallback(
    (value: string) => {
      const loc = value || null;
      setFilters((f) => ({ ...f, location: loc }));
      const p = new URLSearchParams(searchParams.toString());
      if (loc) {
        p.set("location", loc);
      } else {
        p.delete("location");
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    if (!filters.startDate || !filters.endDate) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const u = searchParams.get("location")?.trim();
      const locationFromUrl = u && u.length > 0 ? u : null;
      const f: PatrolDashboardFilters = {
        ...filters,
        location: locationFromUrl ?? filters.location ?? initialLocation,
        search: appliedSearch || null,
      };
      const res = await fetch(`/api/dashboard${buildQuery(f)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DashboardPayload & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setData(null);
        setError(json.message ?? json.error ?? `Request failed (${res.status})`);
        return;
      }
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [filters, appliedSearch, searchParams, initialLocation]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-full">
      <header className="border-b border-white/[0.06] bg-[#0c0c0f]/95 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
              CAPN Security Reports Dashboard
            </h1>
            <form action="/api/logout" method="post" className="inline">
              <button
                type="submit"
                className={headerIconButtonClass}
                aria-label="Log out"
              >
                <LogOutIcon className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>

        {/* Filter bar */}
        <div className="border-t border-white/[0.04] bg-[#0c0c0f]">
          <div className="mx-auto grid max-w-[1600px] gap-3 px-4 py-4 lg:grid-cols-3 lg:gap-4 lg:px-8 xl:grid-cols-6">
            <DateField
              label="From"
              value={filters.startDate}
              max={filters.endDate ?? undefined}
              onChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  startDate: v,
                }))
              }
            />
            <DateField
              label="To"
              value={filters.endDate}
              min={filters.startDate ?? undefined}
              onChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  endDate: v,
                }))
              }
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Location
              </span>
              <select
                value={effectiveLocation ?? ""}
                onChange={(e) => setLocationFilter(e.target.value)}
                style={filterSelectStyle}
                className={filterSelectClassName}
              >
                <option value="">All</option>
                {locationSelectOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Report type
              </span>
              <select
                value={filters.reportType ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    reportType: e.target.value || null,
                  }))
                }
                style={filterSelectStyle}
                className={filterSelectClassName}
              >
                <option value="">All</option>
                {data?.filterOptions.reportTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Officer
              </span>
              <select
                value={filters.securityOfficer ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    securityOfficer: e.target.value || null,
                  }))
                }
                style={filterSelectStyle}
                className={filterSelectClassName}
              >
                <option value="">All</option>
                {data?.filterOptions.officers.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Has images
              </span>
              <select
                value={
                  filters.hasImages === true
                    ? "yes"
                    : filters.hasImages === false
                      ? "no"
                      : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setFilters((f) => ({
                    ...f,
                    hasImages:
                      v === "yes" ? true : v === "no" ? false : null,
                  }));
                }}
                style={filterSelectStyle}
                className={filterSelectClassName}
              >
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <div className="mx-auto max-w-[1600px] px-4 pb-4 lg:px-8">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Search report details
              </span>
                           <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      applySearch();
                    }
                  }}
                  placeholder="Matches report_details_clean (server-side)"
                  className="w-full min-w-0 rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:max-w-xl sm:flex-1"
                />
                <button
                  type="button"
                  onClick={applySearch}
                  className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.1]"
                >
                  Search
                </button>
                {data ? (
                  <p className="shrink-0 text-xs text-zinc-500 sm:ml-auto sm:text-right">
                    {data.lastGmailSyncAt ? (
                      <>
                        Last Gmail sync{" "}
                        <span className="font-medium text-zinc-300">
                          {new Date(data.lastGmailSyncAt).toLocaleString(
                            undefined,
                            {
                              dateStyle: "medium",
                              timeStyle: "medium",
                            },
                          )}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-600">
                        Gmail sync time unavailable
                      </span>
                    )}
                    {loading ? " · refreshing…" : ""}
                  </p>
                ) : null}
              </div>
            </label>
            <p className="mt-2 text-xs text-zinc-600">
              Report-details search runs when you click Search or press Enter.
              Other filters apply as you change them.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 lg:px-8">
        {error ? (
          <div
            className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            <p className="font-medium">Could not load dashboard</p>
            <p className="mt-1 opacity-90">{error}</p>
          </div>
        ) : null}

        {loading && !data && !error ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl bg-white/[0.04]"
              />
            ))}
          </div>
        ) : null}

        {data?.empty ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-4 py-3 text-sm text-amber-100/90">
            <p className="font-medium text-amber-50/95">No patrol rows match these filters.</p>
            <p className="mt-2 text-amber-100/85">
              Set Location to All, widen From/To (dates follow each email’s report time), and check
              .env.local DATABASE_URL matches the Neon project/branch that has data.
            </p>
          </div>
        ) : null}

        {data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Total patrol reports"
                value={data.kpis.totalReports}
              />
              <MetricCard
                label="Locations"
                value={data.kpis.distinctLocations}
                sub="Distinct in scope"
              />
              <MetricCard
                label="Officers"
                value={data.kpis.distinctOfficers}
                sub="Distinct in scope"
              />
              <MetricCard
                label="Reports with images"
                value={data.kpis.reportsWithImages}
              />
              <MetricCard
                label="Total attachments"
                value={data.kpis.totalAttachments}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <TimeSeriesChart points={data.reportsOverTime} />
              <HourChart points={data.reportsByHour} />
              <DayOfWeekChart rows={data.reportsByDayOfWeek} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <NamedBarChart
                title="Report type"
                subtitle="Grouped by report_type"
                rows={data.reportTypeBreakdown}
              />
              <NamedBarChart
                title="By location"
                subtitle="Top locations in scope"
                rows={data.reportsByLocation}
              />
              <NamedBarChart
                title={
                  effectiveLocation ? "Who covers this site?" : "By officer"
                }
                subtitle={
                  effectiveLocation
                    ? `Patrols at this location with your other filters`
                    : `Patrol count by officer (other filters apply; officer filter ignored here)`
                }
                rows={data.reportsByOfficer}
              />
            </section>

            <RecentReportsTable rows={data.recentReports} />
          </>
        ) : null}

        {data && loading ? (
          <p className="text-center text-xs text-zinc-500">Refreshing data…</p>
        ) : null}
      </main>
    </div>
  );
}

export function DashboardFallback() {
  return (
    <div className="min-h-full">
      <header className="border-b border-white/[0.06] bg-[#0c0c0f]/95 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="h-9 max-w-md flex-1 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-white/[0.06]" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-8 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-white/[0.04]"
            />
          ))}
        </div>
      </main>
    </div>
  );
}

