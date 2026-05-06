/**
 * Dashboard API — all analytics from `patrol_reports_dashboard` with shared filters.
 */
export type PatrolDashboardFilters = {
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  reportCategory: string | null;
  reportType: string | null;
  securityOfficer: string | null;
  activityMode: "all" | "incident" | "routine";
  trendInterval: "daily" | "weekly" | "monthly";
  /** Optional: narrows recent-reports table (ILIKE %search%) */
  search: string | null;
};

export type FilterOptions = {
  locations: string[];
  reportCategories: string[];
  reportTypes: string[];
  officers: string[];
};

export type PatrolKpis = {
  totalReports: number;
  incidentReports: number;
  routineReports: number;
  incidentRate: number;
  distinctLocations: number;
  distinctOfficers: number;
};

export type TimeSeriesPoint = { date: string; count: number };
export type HourPoint = { hour: number; count: number };
export type NamedCount = { name: string; count: number; share?: number };
export type CategoryTrendPoint = {
  period: string;
  category: string;
  count: number;
};
export type PropertyBreakdownRow = {
  property: string;
  totalReports: number;
  incidentReports: number;
  trespassing: number;
  maintenance: number;
  parking: number;
  crimePolice: number;
  policyViolations: number;
};
export type SelectedPropertyDeepDive = {
  property: string;
  totalIncidents: number;
  trespassingTrend: CategoryTrendPoint[];
  topIncidentTypes: NamedCount[];
  officerActivity: NamedCount[];
} | null;
export type OfficerBreakdownRow = {
  officer: string;
  totalReports: number;
  incidentReports: number;
  routineReports: number;
  trespassing: number;
  maintenance: number;
  parking: number;
  onDemand: number;
};
export type RecentReportRow = {
  patrolDatetime: string | null;
  reportCategory: string;
  activityClass: "Incident" | "Routine";
  reportType: string | null;
  securityOfficer: string | null;
  location: string | null;
  reportDetailsClean: string | null;
};

export type DashboardPayload = {
  /** ISO timestamp: when this API response was built (browser refresh / filter change). */
  generatedAt: string;
  /** ISO timestamp from `gmail_sync_state.updated_at`, or null if unavailable. */
  lastGmailSyncAt: string | null;
  filters: PatrolDashboardFilters;
  filterOptions: FilterOptions;
  kpis: PatrolKpis;
  keyInsights: string[];
  reportsOverTime: TimeSeriesPoint[];
  reportsByHour: HourPoint[];
  reportTypeBreakdown: NamedCount[];
  incidentTrend: CategoryTrendPoint[];
  reportsByLocation: NamedCount[];
  reportsByOfficer: NamedCount[];
  reportsByDayOfWeek: NamedCount[];
  propertyBreakdown: PropertyBreakdownRow[];
  propertyLeaders: {
    incidents: NamedCount[];
    trespassing: NamedCount[];
    maintenance: NamedCount[];
    risk: NamedCount[];
  };
  selectedPropertyDeepDive: SelectedPropertyDeepDive;
  officerBreakdown: OfficerBreakdownRow[];
  topIncidentOfficers: NamedCount[];
  recentReports: RecentReportRow[];
  empty: boolean;
};
