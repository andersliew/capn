"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DateField } from "@/components/dashboard/DateField";
import { HourChart } from "@/components/dashboard/HourChart";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { NamedBarChart } from "@/components/dashboard/NamedBarChart";
import { RecentReportsTable } from "@/components/dashboard/RecentReportsTable";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import type { DashboardPayload, PatrolDashboardFilters } from "@/lib/types/dashboard";

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
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

export default function DashboardPage() {
  const initial = useMemo(() => defaultRange(), []);
  const [filters, setFilters] = useState<PatrolDashboardFilters>({
    startDate: initial.startDate,
    endDate: initial.endDate,
    location: null,
    reportType: null,
    securityOfficer: null,
    hasImages: null,
    search: null,
  });
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f: PatrolDashboardFilters = {
        ...filters,
        search: debouncedSearch || null,
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
  }, [filters, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="min-h-full">
      <header className="border-b border-white/[0.06] bg-[#0c0c0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div>
            <Link
              href="/"
              className="text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
            >
              ← Home
            </Link>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500/90">
              CAPN
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
              CAPN Security Reports Dashboard
            </h1>
          </div>
          <div className="text-right text-xs text-zinc-500">
            {data?.generatedAt ? (
              <p>
                Last updated{" "}
                <span className="font-medium text-zinc-300">
                  {new Date(data.generatedAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "medium",
                  })}
                </span>
                {loading ? " · refreshing…" : ""}
              </p>
            ) : null}
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
                value={filters.location ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    location: e.target.value || null,
                  }))
                }
                className="rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">All</option>
                {data?.filterOptions.locations.map((loc) => (
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
                className="rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2 text-sm text-zinc-100"
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
                className="rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2 text-sm text-zinc-100"
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
                className="rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2 text-sm text-zinc-100"
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
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setDebouncedSearch(searchInput.trim());
                  }
                }}
                placeholder="Matches report_details_clean (server-side)"
                className="w-full rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:max-w-xl"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-600">
              Search debounces; press Enter to apply immediately. Other filters
              reload automatically.
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
            No patrol rows match these filters. Widen the date range or clear
            filters.
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

            <section className="grid gap-4 lg:grid-cols-2">
              <TimeSeriesChart points={data.reportsOverTime} />
              <HourChart points={data.reportsByHour} />
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
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
                title="Day of week"
                subtitle="Grouped by day_of_week"
                rows={data.reportsByDayOfWeek}
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
