import "server-only";

import type {
  DashboardPayload,
  FilterOptions,
  HourPoint,
  NamedCount,
  PatrolDashboardFilters,
  PatrolKpis,
  RecentReportRow,
  TimeSeriesPoint,
} from "@/lib/types/dashboard";
import { getSql } from "@/lib/db";

function neonRows<T extends Record<string, unknown>>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

type Sql = ReturnType<typeof getSql>;

/**
 * Reads `patrol_reports_raw` and parses both ISO and legacy datetime shapes.
 * `patrol_date` is the calendar day for filtering: prefer `date` when parseable,
 * else the date part of `patrol_datetime` (many sync rows have `datetime` but not `date`).
 */
function patrolReportsBase(sql: Sql) {
  return sql`
    (
      SELECT
        btrim(r.email_id::text) AS email_id,
        r.report_type,
        COALESCE(
          CASE
            WHEN r.date IS NULL OR btrim(r.date::text) = '' THEN NULL
            WHEN btrim(r.date::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN to_date(r.date, 'MM/DD/YYYY')
            ELSE NULL
          END,
          CASE
            WHEN r.datetime IS NULL OR btrim(r.datetime::text) = '' THEN NULL
            WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN (r.datetime::timestamptz)::date
            WHEN btrim(r.datetime::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN (to_timestamp(r.datetime, 'MM/DD/YYYY HH24:MI')::timestamptz)::date
            ELSE NULL
          END
        ) AS patrol_date,
        CASE
          WHEN r.datetime IS NULL OR btrim(r.datetime::text) = '' THEN NULL
          WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN r.datetime::timestamptz
          WHEN btrim(r.datetime::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN to_timestamp(r.datetime, 'MM/DD/YYYY HH24:MI')::timestamptz
          ELSE NULL
        END AS patrol_datetime,
        TRIM(BOTH FROM regexp_replace(r.security_officer, '<[^>]*>'::text, ''::text, 'g'::text)) AS security_officer,
        TRIM(BOTH FROM regexp_replace(r.location, '<[^>]*>'::text, ''::text, 'g'::text)) AS location,
        TRIM(BOTH FROM regexp_replace(r.report_details, '<[^>]*>'::text, ''::text, 'g'::text)) AS report_details_clean,
        r.has_images::boolean AS has_images,
        r.num_attachments::integer AS num_attachments
      FROM patrol_reports_raw r
    )
  `;
}

type FilterFragmentOpts = {
  /** So the location dropdown still lists all locations in scope, not only the selected one */
  omitLocation?: boolean;
  omitReportType?: boolean;
  omitSecurityOfficer?: boolean;
};

/** Shared WHERE for dashboard base subquery, aliased as `p` */
function filterFragments(
  sql: Sql,
  f: PatrolDashboardFilters,
  opts?: FilterFragmentOpts,
) {
  const q = f.search?.trim();
  return sql`
    ${f.startDate ? sql`AND p.patrol_date >= ${f.startDate}::date` : sql``}
    ${f.endDate ? sql`AND p.patrol_date <= ${f.endDate}::date` : sql``}
    ${f.location && !opts?.omitLocation ? sql`AND p.location = ${f.location}` : sql``}
    ${f.reportType && !opts?.omitReportType ? sql`AND p.report_type = ${f.reportType}` : sql``}
    ${f.securityOfficer && !opts?.omitSecurityOfficer ? sql`AND p.security_officer = ${f.securityOfficer}` : sql``}
    ${f.hasImages === true ? sql`AND p.has_images IS TRUE` : sql``}
    ${f.hasImages === false ? sql`AND (p.has_images IS FALSE OR p.has_images IS NULL)` : sql``}
    ${q ? sql`AND p.report_details_clean ILIKE ${"%" + q + "%"}` : sql``}
  `;
}

async function queryFilterOptions(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<FilterOptions> {
  const [locRows, typeRows, offRows] = await Promise.all([
    neonRows<{ v: string }>(
      await sql`
        SELECT DISTINCT trim(p.location) AS v
        FROM ${patrolReportsBase(sql)} p
        WHERE p.location IS NOT NULL AND trim(p.location) <> ''
        ${filterFragments(sql, f, { omitLocation: true })}
        ORDER BY 1
      `,
    ),
    neonRows<{ v: string }>(
      await sql`
        SELECT DISTINCT trim(p.report_type) AS v
        FROM ${patrolReportsBase(sql)} p
        WHERE p.report_type IS NOT NULL AND trim(p.report_type) <> ''
        ${filterFragments(sql, f, { omitReportType: true })}
        ORDER BY 1
      `,
    ),
    neonRows<{ v: string }>(
      await sql`
        SELECT DISTINCT trim(p.security_officer) AS v
        FROM ${patrolReportsBase(sql)} p
        WHERE p.security_officer IS NOT NULL AND trim(p.security_officer) <> ''
        ${filterFragments(sql, f, { omitSecurityOfficer: true })}
        ORDER BY 1
      `,
    ),
  ]);
  return {
    locations: locRows.map((r) => r.v),
    reportTypes: typeRows.map((r) => r.v),
    officers: offRows.map((r) => r.v),
  };
}

async function queryKpis(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<PatrolKpis> {
  const rows = neonRows<{
    total_reports: number;
    distinct_locations: number;
    distinct_officers: number;
    reports_with_images: number;
    total_attachments: number;
  }>(
    await sql`
      SELECT
        COUNT(*)::int AS total_reports,
        COUNT(DISTINCT NULLIF(trim(p.location), ''))::int AS distinct_locations,
        COUNT(DISTINCT NULLIF(trim(p.security_officer), ''))::int AS distinct_officers,
        COUNT(*) FILTER (WHERE p.has_images IS TRUE)::int AS reports_with_images,
        COALESCE(SUM(COALESCE(p.num_attachments, 0)), 0)::bigint AS total_attachments
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f)}
    `,
  );
  const row = rows[0];
  return {
    totalReports: row?.total_reports ?? 0,
    distinctLocations: row?.distinct_locations ?? 0,
    distinctOfficers: row?.distinct_officers ?? 0,
    reportsWithImages: row?.reports_with_images ?? 0,
    totalAttachments: Number(row?.total_attachments ?? 0),
  };
}

async function queryReportsOverTime(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<TimeSeriesPoint[]> {
  const rows = neonRows<{ d: string; cnt: number }>(
    await sql`
      SELECT
        p.patrol_date::text AS d,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE p.patrol_date IS NOT NULL
      ${filterFragments(sql, f)}
      GROUP BY p.patrol_date
      ORDER BY p.patrol_date ASC
    `,
  );
  return rows.map((r) => ({ date: r.d, count: r.cnt }));
}

async function queryReportsByHour(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<HourPoint[]> {
  const rows = neonRows<{ hr: number; cnt: number }>(
    await sql`
      SELECT
        EXTRACT(HOUR FROM p.patrol_datetime)::int AS hr,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE p.patrol_datetime IS NOT NULL
      ${filterFragments(sql, f)}
      GROUP BY 1
      ORDER BY 1
    `,
  );
  return rows.map((r) => ({ hour: r.hr, count: r.cnt }));
}

async function queryReportTypeBreakdown(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<NamedCount[]> {
  const rows = neonRows<{ name: string; cnt: number }>(
    await sql`
      SELECT
        COALESCE(NULLIF(trim(p.report_type), ''), 'Unknown') AS name,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f)}
      GROUP BY COALESCE(NULLIF(trim(p.report_type), ''), 'Unknown')
      ORDER BY cnt DESC
    `,
  );
  return rows.map((r) => ({ name: r.name, count: r.cnt }));
}

async function queryReportsByLocation(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<NamedCount[]> {
  const rows = neonRows<{ name: string; cnt: number }>(
    await sql`
      SELECT
        COALESCE(NULLIF(trim(p.location), ''), 'Unknown') AS name,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f)}
      GROUP BY COALESCE(NULLIF(trim(p.location), ''), 'Unknown')
      ORDER BY cnt DESC
      LIMIT 24
    `,
  );
  return rows.map((r) => ({ name: r.name, count: r.cnt }));
}

async function queryReportsByDayOfWeek(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<NamedCount[]> {
  const rows = neonRows<{ name: string; cnt: number }>(
    await sql`
      SELECT s.name, s.cnt
      FROM (
        SELECT
          COALESCE(
            NULLIF(
              trim(
                CASE
                  WHEN p.patrol_datetime IS NOT NULL THEN TRIM(BOTH FROM to_char(p.patrol_datetime, 'Day'))
                  WHEN p.patrol_date IS NOT NULL THEN TRIM(BOTH FROM to_char(p.patrol_date::timestamp, 'Day'))
                  ELSE ''
                END
              ),
              ''
            ),
            'Unknown'
          ) AS name,
          COUNT(*)::int AS cnt
        FROM ${patrolReportsBase(sql)} p
        WHERE 1 = 1
        ${filterFragments(sql, f)}
        GROUP BY 1
      ) s
      ORDER BY
        CASE s.name
          WHEN 'Sunday' THEN 0
          WHEN 'Monday' THEN 1
          WHEN 'Tuesday' THEN 2
          WHEN 'Wednesday' THEN 3
          WHEN 'Thursday' THEN 4
          WHEN 'Friday' THEN 5
          WHEN 'Saturday' THEN 6
          ELSE 7
        END,
        s.name
    `,
  );
  return rows.map((r) => ({ name: r.name, count: r.cnt }));
}

async function queryRecentReports(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<RecentReportRow[]> {
  const rows = neonRows<{
    patrol_datetime: string | null;
    report_type: string | null;
    security_officer: string | null;
    location: string | null;
    has_images: boolean | null;
    num_attachments: number | null;
    report_details_clean: string | null;
  }>(
    await sql`
      SELECT
        p.patrol_datetime,
        p.report_type,
        p.security_officer,
        p.location,
        p.has_images,
        p.num_attachments,
        p.report_details_clean
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f)}
      ORDER BY p.patrol_datetime DESC NULLS LAST, p.email_id DESC NULLS LAST
      LIMIT 75
    `,
  );
  return rows.map((r) => ({
    patrolDatetime: r.patrol_datetime,
    reportType: r.report_type,
    securityOfficer: r.security_officer,
    location: r.location,
    hasImages: r.has_images,
    numAttachments: r.num_attachments,
    reportDetailsClean: r.report_details_clean,
  }));
}

const emptyFilters: PatrolDashboardFilters = {
  startDate: null,
  endDate: null,
  location: null,
  reportType: null,
  securityOfficer: null,
  hasImages: null,
  search: null,
};

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const sql = getSql();
  return queryFilterOptions(sql, emptyFilters);
}

export async function fetchDashboardData(
  filters: PatrolDashboardFilters,
): Promise<DashboardPayload> {
  const sql = getSql();

  const [
    filterOptions,
    kpis,
    reportsOverTime,
    reportsByHour,
    reportTypeBreakdown,
    reportsByLocation,
    reportsByDayOfWeek,
    recentReports,
  ] = await Promise.all([
    queryFilterOptions(sql, filters),
    queryKpis(sql, filters),
    queryReportsOverTime(sql, filters),
    queryReportsByHour(sql, filters),
    queryReportTypeBreakdown(sql, filters),
    queryReportsByLocation(sql, filters),
    queryReportsByDayOfWeek(sql, filters),
    queryRecentReports(sql, filters),
  ]);

  const empty = kpis.totalReports === 0;

  return {
    generatedAt: new Date().toISOString(),
    filters,
    filterOptions,
    kpis,
    reportsOverTime,
    reportsByHour,
    reportTypeBreakdown,
    reportsByLocation,
    reportsByDayOfWeek,
    recentReports,
    empty,
  };
}
