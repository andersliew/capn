import "server-only";

import type {
  CategoryTrendPoint,
  DashboardPayload,
  FilterOptions,
  HourPoint,
  NamedCount,
  OfficerBreakdownRow,
  PatrolDashboardFilters,
  PatrolKpis,
  PropertyBreakdownRow,
  RecentReportRow,
  SelectedPropertyDeepDive,
  TimeSeriesPoint,
} from "@/lib/types/dashboard";
import { getSql } from "@/lib/db";

function neonRows<T extends Record<string, unknown>>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

type Sql = ReturnType<typeof getSql>;

const REPORT_CATEGORIES = [
  "Trespassing",
  "Maintenance",
  "Medical Emergency",
  "Parking",
  "Crime",
  "Police",
  "Policy Violation",
  "On-Demand Call",
  "Patrol",
  "Check-In",
  "Amenity / Lockup",
  "Clock In / Clock Out",
  "Other",
] as const;

function collapseSqlWhitespace(sql: Sql, expr: unknown) {
  return sql`TRIM(BOTH FROM regexp_replace(${expr}, '[[:space:]]+'::text, ' '::text, 'g'::text))`;
}

function cleanOfficerExpr(sql: Sql) {
  const strippedHtml = sql`regexp_replace(COALESCE(r.security_officer::text, ''), '<[^>]*>'::text, ''::text, 'g'::text)`;
  const withoutTail = sql`regexp_replace(
    ${strippedHtml},
    '[[:space:]]+(Type|Report[[:space:]]+Type|Location|Time[[:space:]]+Submitted|Report[[:space:]]+details)[[:space:]]*:.*'::text,
    ''::text,
    'i'::text
  )`;
  const withoutLabel = sql`regexp_replace(
    ${withoutTail},
    '^[[:space:]]*(Security[[:space:]]+Officer|Officer|Submitted[[:space:]]+By|Name)[[:space:]]*:[[:space:]]*'::text,
    ''::text,
    'i'::text
  )`;
  return collapseSqlWhitespace(sql, withoutLabel);
}

function reportCategoryExpr(sql: Sql) {
  const haystack = sql`lower(CONCAT_WS(' ', p.report_type, p.report_details_clean))`;
  return sql`(
    CASE
      WHEN ${haystack} ~ '(clock[[:space:]_-]*(in|out)|start[[:space:]_-]*shift|end[[:space:]_-]*shift)' THEN 'Clock In / Clock Out'
      WHEN ${haystack} ~ '(check[[:space:]_-]*in|checkin)' THEN 'Check-In'
      WHEN ${haystack} ~ '(patrol|tour|rounds?)' THEN 'Patrol'
      WHEN ${haystack} ~ '(amenit|lock[[:space:]_-]*up|unlock|lockdown|pool|clubhouse|gym|fitness|rec[[:space:]]+room|package[[:space:]]+room|office[[:space:]]+check|mailbox[[:space:]]+check|fence[[:space:]]+check|leasing[[:space:]]+office)' THEN 'Amenity / Lockup'
      WHEN ${haystack} ~ '(trespass|transient|loiter|unauthorized|encampment|vagrant)' THEN 'Trespassing'
      WHEN ${haystack} ~ '(medical|ems|ambulance|injur|fire[[:space:]]+department|paramedic|emergency)' THEN 'Medical Emergency'
      WHEN ${haystack} ~ '(police|(^|[^a-z])pd([^a-z]|$)|law[[:space:]]+enforcement|911|officer[[:space:]]+responded)' THEN 'Police'
      WHEN ${haystack} ~ '(theft|stolen|vandal|burgl|robber|assault|fight|break[[:space:]_-]*in|property[[:space:]]+damage|crime|criminal)' THEN 'Crime'
      WHEN ${haystack} ~ '(maintenance|leak|water|elevator|repair|broken|gate|door|light|plumb|hvac|trash|hazard|alarm|sprinkler)' THEN 'Maintenance'
      WHEN ${haystack} ~ '(parking|vehicle|garage|tow|license[[:space:]]+plate|plate|car[[:space:]]+alarm)' THEN 'Parking'
      WHEN ${haystack} ~ '(policy|violation|noise|smok|pet[[:space:]]+violation|rule|conduct|disturbance)' THEN 'Policy Violation'
      WHEN ${haystack} ~ '(on[[:space:]_-]*demand|call[[:space:]]+for[[:space:]]+service|dispatch|service[[:space:]]+call|special[[:space:]]+request)' THEN 'On-Demand Call'
      ELSE 'Other'
    END
  )`;
}

function activityClassExpr(sql: Sql) {
  return sql`(
    CASE
      WHEN p.report_category IN ('Patrol', 'Check-In', 'Amenity / Lockup', 'Clock In / Clock Out') THEN 'Routine'
      ELSE 'Incident'
    END
  )`;
}

/**
 * Legacy sync rows often stored the whole email tail in `location` (through "Time Submitted…").
 * Strip that suffix for display, filters, and DISTINCT so the Location control lists real sites.
 * Matches `scripts/sync_gmail_to_neon.py` `_CAPN_NEXT_FIELD` (keep in sync when labels change).
 */
function patrolLocationExpr(sql: Sql) {
  /* POSIX `regexp_replace` (no JS `\s` — in JS '\s+' is invalid and becomes `s+`). */
  return sql`TRIM(BOTH FROM regexp_replace(
    TRIM(BOTH FROM regexp_replace(COALESCE(r.location::text, ''), '<[^>]*>'::text, ''::text, 'g'::text)),
    '[[:space:]]+(Time[[:space:]]+Submitted|Report[[:space:]]+details|Type|Security[[:space:]]+Officer)[[:space:]]*:.*'::text,
    ''::text,
    'i'::text
  ))`;
}

/**
 * Reads `patrol_reports_raw` and parses both ISO and legacy datetime shapes.
 * `patrol_date` is the calendar day for filtering: prefer `date` when parseable,
 * else the date part of `patrol_datetime` (many sync rows have `datetime` but not `date`).
 */
function patrolReportsBase(sql: Sql) {
  const rawRows = sql`
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
            WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]' THEN (r.datetime::timestamptz)::date
            WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (btrim(r.datetime::text)::date)
            WHEN btrim(r.datetime::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN (to_timestamp(r.datetime, 'MM/DD/YYYY HH24:MI')::timestamptz)::date
            ELSE NULL
          END
        ) AS patrol_date,
        CASE
          WHEN r.datetime IS NULL OR btrim(r.datetime::text) = '' THEN NULL
          WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN r.datetime::timestamptz
          WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]' THEN r.datetime::timestamptz
          WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (btrim(r.datetime::text)::date)::timestamptz
          WHEN btrim(r.datetime::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN to_timestamp(r.datetime, 'MM/DD/YYYY HH24:MI')::timestamptz
          ELSE NULL
        END AS patrol_datetime,
        NULLIF(${cleanOfficerExpr(sql)}, '') AS security_officer,
        CASE
          WHEN r.location IS NULL OR btrim(r.location::text) = '' THEN NULL
          ELSE ${patrolLocationExpr(sql)}
        END AS location,
        TRIM(BOTH FROM regexp_replace(COALESCE(r.report_details::text, ''), '<[^>]*>'::text, ''::text, 'g'::text)) AS report_details_clean
      FROM patrol_reports_raw r
      WHERE (
        CASE
          WHEN r.datetime IS NULL OR btrim(r.datetime::text) = '' THEN NULL
          WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN r.datetime::timestamptz
          WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]' THEN r.datetime::timestamptz
          WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (btrim(r.datetime::text)::date)::timestamptz
          WHEN btrim(r.datetime::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN to_timestamp(r.datetime, 'MM/DD/YYYY HH24:MI')::timestamptz
          ELSE NULL
        END
      ) >= NOW() - INTERVAL '6 months'
    )
  `;

  return sql`
    (
      SELECT
        p.*,
        ${activityClassExpr(sql)} AS activity_class
      FROM (
        SELECT
          p.*,
          ${reportCategoryExpr(sql)} AS report_category
        FROM ${rawRows} p
      ) p
    )
  `;
}

type FilterFragmentOpts = {
  /** So the location dropdown still lists all locations in scope, not only the selected one */
  omitLocation?: boolean;
  omitReportCategory?: boolean;
  omitReportType?: boolean;
  omitSecurityOfficer?: boolean;
};

/** Calendar day for range filters — COALESCE so rows with a timestamp but odd `date` column still match. */
function patrolDayExpr(sql: Sql) {
  return sql`COALESCE(p.patrol_date, (p.patrol_datetime)::date)`;
}

/** Shared WHERE for dashboard base subquery, aliased as `p` */
function filterFragments(
  sql: Sql,
  f: PatrolDashboardFilters,
  opts?: FilterFragmentOpts,
) {
  const q = f.search?.trim();
  return sql`
    ${f.startDate ? sql`AND ${patrolDayExpr(sql)} >= ${f.startDate}::date` : sql``}
    ${f.endDate ? sql`AND ${patrolDayExpr(sql)} <= ${f.endDate}::date` : sql``}
    ${f.location && !opts?.omitLocation
      ? sql`AND lower(trim(p.location)) = lower(trim(${f.location}))`
      : sql``}
    ${f.reportCategory && !opts?.omitReportCategory
      ? sql`AND p.report_category = ${f.reportCategory}`
      : sql``}
    ${f.reportType && !opts?.omitReportType ? sql`AND p.report_type = ${f.reportType}` : sql``}
    ${f.securityOfficer && !opts?.omitSecurityOfficer ? sql`AND p.security_officer = ${f.securityOfficer}` : sql``}
    ${f.activityMode === "incident" ? sql`AND p.activity_class = 'Incident'` : sql``}
    ${f.activityMode === "routine" ? sql`AND p.activity_class = 'Routine'` : sql``}
    ${q ? sql`AND p.report_details_clean ILIKE ${"%" + q + "%"}` : sql``}
  `;
}

async function queryLastGmailSyncAt(sql: Sql): Promise<string | null> {
  try {
    const result = await sql`
      SELECT updated_at AS updated_at
      FROM gmail_sync_state
      WHERE id = 1 LIMIT 1
    `;
    const rows = neonRows<{ updated_at: Date | string | null }>(result);
    const v = rows[0]?.updated_at;
    if (v == null) {
      return null;
    }
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d.toISOString();
  } catch {
    return null;
  }
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
    reportCategories: [...REPORT_CATEGORIES],
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
    incident_reports: number;
    routine_reports: number;
    distinct_locations: number;
    distinct_officers: number;
  }>(
    await sql`
      SELECT
        COUNT(*)::int AS total_reports,
        COUNT(*) FILTER (WHERE p.activity_class = 'Incident')::int AS incident_reports,
        COUNT(*) FILTER (WHERE p.activity_class = 'Routine')::int AS routine_reports,
        COUNT(DISTINCT NULLIF(trim(p.location), ''))::int AS distinct_locations,
        COUNT(DISTINCT NULLIF(trim(p.security_officer), ''))::int AS distinct_officers
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f)}
    `,
  );
  const row = rows[0];
  const totalReports = row?.total_reports ?? 0;
  const incidentReports = row?.incident_reports ?? 0;
  return {
    totalReports,
    incidentReports,
    routineReports: row?.routine_reports ?? 0,
    incidentRate: totalReports > 0 ? (incidentReports / totalReports) * 100 : 0,
    distinctLocations: row?.distinct_locations ?? 0,
    distinctOfficers: row?.distinct_officers ?? 0,
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
  return rows.map((r) => ({
    hour: Number(r.hr),
    count: Number(r.cnt),
  }));
}

async function queryReportTypeBreakdown(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<NamedCount[]> {
  const rows = neonRows<{ name: string; cnt: number; share: number }>(
    await sql`
      WITH scoped AS (
        SELECT p.report_category
        FROM ${patrolReportsBase(sql)} p
        WHERE 1 = 1
        ${filterFragments(sql, f)}
      )
      SELECT
        report_category AS name,
        COUNT(*)::int AS cnt,
        ROUND((COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0)) * 100, 1)::float AS share
      FROM scoped
      GROUP BY report_category
      ORDER BY cnt DESC
    `,
  );
  return rows.map((r) => ({ name: r.name, count: r.cnt, share: r.share }));
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

/** Officer roster for current filters; omits officer filter so a site view still lists everyone there. */
async function queryReportsByOfficer(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<NamedCount[]> {
  const rows = neonRows<{ name: string; cnt: number }>(
    await sql`
      SELECT
        COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown') AS name,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f, { omitSecurityOfficer: true })}
      GROUP BY COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown')
      ORDER BY cnt DESC LIMIT 32
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

function trendPeriodExpr(sql: Sql, f: PatrolDashboardFilters) {
  if (f.trendInterval === "daily") {
    return sql`(p.patrol_date)::date`;
  }
  if (f.trendInterval === "monthly") {
    return sql`date_trunc('month', p.patrol_date::timestamp)::date`;
  }
  return sql`date_trunc('week', p.patrol_date::timestamp)::date`;
}

async function queryIncidentTrend(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<CategoryTrendPoint[]> {
  const period = trendPeriodExpr(sql, f);
  const trendActivity = f.reportCategory
    ? sql``
    : f.activityMode === "routine"
      ? sql`AND p.activity_class = 'Routine'`
      : f.activityMode === "incident"
        ? sql``
        : sql`AND p.activity_class = 'Incident'`;
  const rows = neonRows<{ period: string; category: string; cnt: number }>(
    await sql`
      WITH scoped AS (
        SELECT p.patrol_date, p.report_category, p.activity_class
        FROM ${patrolReportsBase(sql)} p
        WHERE p.patrol_date IS NOT NULL
        ${filterFragments(sql, f)}
        ${trendActivity}
      ),
      top_categories AS (
        SELECT report_category
        FROM scoped
        GROUP BY report_category
        ORDER BY COUNT(*) DESC
        LIMIT 5
      )
      SELECT
        ${period}::text AS period,
        p.report_category AS category,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE p.patrol_date IS NOT NULL
      ${filterFragments(sql, f)}
      ${trendActivity}
      AND (
        ${f.reportCategory ? sql`TRUE` : sql`p.report_category IN (SELECT report_category FROM top_categories)`}
      )
      GROUP BY ${period}, p.report_category
      ORDER BY ${period} ASC, cnt DESC
    `,
  );
  return rows.map((r) => ({
    period: r.period,
    category: r.category,
    count: r.cnt,
  }));
}

async function queryPropertyBreakdown(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<PropertyBreakdownRow[]> {
  const rows = neonRows<{
    property: string;
    total_reports: number;
    incident_reports: number;
    trespassing: number;
    maintenance: number;
    parking: number;
    crime_police: number;
    policy_violations: number;
  }>(
    await sql`
      SELECT
        COALESCE(NULLIF(trim(p.location), ''), 'Unknown') AS property,
        COUNT(*)::int AS total_reports,
        COUNT(*) FILTER (WHERE p.activity_class = 'Incident')::int AS incident_reports,
        COUNT(*) FILTER (WHERE p.report_category = 'Trespassing')::int AS trespassing,
        COUNT(*) FILTER (WHERE p.report_category = 'Maintenance')::int AS maintenance,
        COUNT(*) FILTER (WHERE p.report_category = 'Parking')::int AS parking,
        COUNT(*) FILTER (WHERE p.report_category IN ('Crime', 'Police'))::int AS crime_police,
        COUNT(*) FILTER (WHERE p.report_category = 'Policy Violation')::int AS policy_violations
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f)}
      GROUP BY COALESCE(NULLIF(trim(p.location), ''), 'Unknown')
      ORDER BY incident_reports DESC, total_reports DESC
      LIMIT 32
    `,
  );
  return rows.map((r) => ({
    property: r.property,
    totalReports: r.total_reports,
    incidentReports: r.incident_reports,
    trespassing: r.trespassing,
    maintenance: r.maintenance,
    parking: r.parking,
    crimePolice: r.crime_police,
    policyViolations: r.policy_violations,
  }));
}

async function queryPropertyLeaders(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<DashboardPayload["propertyLeaders"]> {
  async function topForCategory(categories: string[] | null): Promise<NamedCount[]> {
    const rows = neonRows<{ name: string; cnt: number }>(
      await sql`
        SELECT
          COALESCE(NULLIF(trim(p.location), ''), 'Unknown') AS name,
          COUNT(*)::int AS cnt
        FROM ${patrolReportsBase(sql)} p
        WHERE 1 = 1
        ${filterFragments(sql, f)}
        ${categories
          ? sql`AND p.report_category = ANY(${categories}::text[])`
          : sql`AND p.activity_class = 'Incident'`}
        GROUP BY COALESCE(NULLIF(trim(p.location), ''), 'Unknown')
        HAVING COUNT(*) > 0
        ORDER BY cnt DESC
        LIMIT 8
      `,
    );
    return rows.map((r) => ({ name: r.name, count: r.cnt }));
  }

  const [incidents, trespassing, maintenance, risk] = await Promise.all([
    topForCategory(null),
    topForCategory(["Trespassing"]),
    topForCategory(["Maintenance"]),
    topForCategory(["Parking", "Policy Violation", "Crime", "Police"]),
  ]);
  return { incidents, trespassing, maintenance, risk };
}

async function querySelectedPropertyDeepDive(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<SelectedPropertyDeepDive> {
  if (!f.location) {
    return null;
  }

  const rows = neonRows<{ total_incidents: number }>(
    await sql`
      SELECT COUNT(*)::int AS total_incidents
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, {
        ...f,
        reportCategory: null,
        reportType: null,
        activityMode: "all",
        search: null,
      })}
      AND p.activity_class = 'Incident'
    `,
  );

  const trendRows = neonRows<{ period: string; cnt: number }>(
    await sql`
      SELECT
        date_trunc('week', p.patrol_date::timestamp)::date::text AS period,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE p.patrol_date IS NOT NULL
      ${filterFragments(sql, {
        ...f,
        reportCategory: null,
        reportType: null,
        activityMode: "all",
        search: null,
      })}
      AND p.report_category = 'Trespassing'
      GROUP BY date_trunc('week', p.patrol_date::timestamp)::date
      ORDER BY date_trunc('week', p.patrol_date::timestamp)::date ASC
    `,
  );

  const typeRows = neonRows<{ name: string; cnt: number }>(
    await sql`
      SELECT p.report_category AS name, COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, {
        ...f,
        reportCategory: null,
        reportType: null,
        activityMode: "all",
        search: null,
      })}
      AND p.activity_class = 'Incident'
      GROUP BY p.report_category
      ORDER BY cnt DESC
      LIMIT 8
    `,
  );

  const officerRows = neonRows<{ name: string; cnt: number }>(
    await sql`
      SELECT
        COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown') AS name,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, {
        ...f,
        reportCategory: null,
        reportType: null,
        securityOfficer: null,
        activityMode: "all",
        search: null,
      })}
      AND p.activity_class = 'Incident'
      GROUP BY COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown')
      ORDER BY cnt DESC
      LIMIT 8
    `,
  );

  return {
    property: f.location,
    totalIncidents: rows[0]?.total_incidents ?? 0,
    trespassingTrend: trendRows.map((r) => ({
      period: r.period,
      category: "Trespassing",
      count: r.cnt,
    })),
    topIncidentTypes: typeRows.map((r) => ({ name: r.name, count: r.cnt })),
    officerActivity: officerRows.map((r) => ({ name: r.name, count: r.cnt })),
  };
}

async function queryOfficerBreakdown(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<OfficerBreakdownRow[]> {
  const rows = neonRows<{
    officer: string;
    total_reports: number;
    incident_reports: number;
    routine_reports: number;
    trespassing: number;
    maintenance: number;
    parking: number;
    on_demand: number;
  }>(
    await sql`
      SELECT
        COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown') AS officer,
        COUNT(*)::int AS total_reports,
        COUNT(*) FILTER (WHERE p.activity_class = 'Incident')::int AS incident_reports,
        COUNT(*) FILTER (WHERE p.activity_class = 'Routine')::int AS routine_reports,
        COUNT(*) FILTER (WHERE p.report_category = 'Trespassing')::int AS trespassing,
        COUNT(*) FILTER (WHERE p.report_category = 'Maintenance')::int AS maintenance,
        COUNT(*) FILTER (WHERE p.report_category = 'Parking')::int AS parking,
        COUNT(*) FILTER (WHERE p.report_category = 'On-Demand Call')::int AS on_demand
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f, { omitSecurityOfficer: true })}
      GROUP BY COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown')
      ORDER BY incident_reports DESC, total_reports DESC
      LIMIT 32
    `,
  );
  return rows.map((r) => ({
    officer: r.officer,
    totalReports: r.total_reports,
    incidentReports: r.incident_reports,
    routineReports: r.routine_reports,
    trespassing: r.trespassing,
    maintenance: r.maintenance,
    parking: r.parking,
    onDemand: r.on_demand,
  }));
}

async function queryTopIncidentOfficers(
  sql: Sql,
  f: PatrolDashboardFilters,
): Promise<NamedCount[]> {
  const rows = neonRows<{ name: string; cnt: number }>(
    await sql`
      SELECT
        COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown') AS name,
        COUNT(*)::int AS cnt
      FROM ${patrolReportsBase(sql)} p
      WHERE 1 = 1
      ${filterFragments(sql, f, { omitSecurityOfficer: true })}
      AND p.activity_class = 'Incident'
      GROUP BY COALESCE(NULLIF(trim(p.security_officer), ''), 'Unknown')
      ORDER BY cnt DESC
      LIMIT 12
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
    report_category: string;
    activity_class: "Incident" | "Routine";
    report_type: string | null;
    security_officer: string | null;
    location: string | null;
    report_details_clean: string | null;
  }>(
    await sql`
      SELECT
        p.patrol_datetime,
        p.report_category,
        p.activity_class,
        p.report_type,
        p.security_officer,
        p.location,
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
    reportCategory: r.report_category,
    activityClass: r.activity_class,
    reportType: r.report_type,
    securityOfficer: r.security_officer,
    location: r.location,
    reportDetailsClean: r.report_details_clean,
  }));
}

const emptyFilters: PatrolDashboardFilters = {
  startDate: null,
  endDate: null,
  location: null,
  reportCategory: null,
  reportType: null,
  securityOfficer: null,
  activityMode: "all",
  trendInterval: "weekly",
  search: null,
};

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const sql = getSql();
  return queryFilterOptions(sql, emptyFilters);
}

function buildKeyInsights(
  filters: PatrolDashboardFilters,
  kpis: PatrolKpis,
  categoryBreakdown: NamedCount[],
  dayRows: NamedCount[],
  officerBreakdown: OfficerBreakdownRow[],
): string[] {
  if (kpis.totalReports === 0) {
    return ["No reports match the current filters."];
  }

  const insights: string[] = [];
  const topCategory = categoryBreakdown[0];
  const place = filters.location ? ` for ${filters.location}` : "";
  if (topCategory) {
    insights.push(
      `${topCategory.name} is the top category${place} in this scope (${topCategory.count.toLocaleString()} reports).`,
    );
  }

  if (kpis.routineReports > kpis.incidentReports) {
    insights.push(
      `Most matching reports are routine activity (${kpis.routineReports.toLocaleString()} routine vs ${kpis.incidentReports.toLocaleString()} incident).`,
    );
  } else {
    insights.push(
      `Incident reports are ${kpis.incidentRate.toFixed(1)}% of this scope.`,
    );
  }

  const topDay = [...dayRows].sort((a, b) => b.count - a.count)[0];
  if (topDay) {
    insights.push(`${topDay.name} has the highest report volume in this period.`);
  }

  const topIncidentOfficer = officerBreakdown.find((o) => o.incidentReports > 0);
  if (topIncidentOfficer) {
    insights.push(
      `${topIncidentOfficer.officer} submitted the most incident reports in scope (${topIncidentOfficer.incidentReports.toLocaleString()}).`,
    );
  }

  return insights.slice(0, 5);
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
    incidentTrend,
    reportsByLocation,
    reportsByOfficer,
    reportsByDayOfWeek,
    propertyBreakdown,
    propertyLeaders,
    selectedPropertyDeepDive,
    officerBreakdown,
    topIncidentOfficers,
    recentReports,
    lastGmailSyncAt,
  ] = await Promise.all([
    queryFilterOptions(sql, filters),
    queryKpis(sql, filters),
    queryReportsOverTime(sql, filters),
    queryReportsByHour(sql, filters),
    queryReportTypeBreakdown(sql, filters),
    queryIncidentTrend(sql, filters),
    queryReportsByLocation(sql, filters),
    queryReportsByOfficer(sql, filters),
    queryReportsByDayOfWeek(sql, filters),
    queryPropertyBreakdown(sql, filters),
    queryPropertyLeaders(sql, filters),
    querySelectedPropertyDeepDive(sql, filters),
    queryOfficerBreakdown(sql, filters),
    queryTopIncidentOfficers(sql, filters),
    queryRecentReports(sql, filters),
    queryLastGmailSyncAt(sql),
  ]);

  const empty = kpis.totalReports === 0;
  const keyInsights = buildKeyInsights(
    filters,
    kpis,
    reportTypeBreakdown,
    reportsByDayOfWeek,
    officerBreakdown,
  );

  return {
    generatedAt: new Date().toISOString(),
    lastGmailSyncAt,
    filters,
    filterOptions,
    kpis,
    keyInsights,
    reportsOverTime,
    reportsByHour,
    reportTypeBreakdown,
    incidentTrend,
    reportsByLocation,
    reportsByOfficer,
    reportsByDayOfWeek,
    propertyBreakdown,
    propertyLeaders,
    selectedPropertyDeepDive,
    officerBreakdown,
    topIncidentOfficers,
    recentReports,
    empty,
  };
}
