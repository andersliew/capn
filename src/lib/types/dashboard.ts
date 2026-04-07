/**
 * Dashboard API — all analytics from `patrol_reports_dashboard` with shared filters.
 */
export type PatrolDashboardFilters = {
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  reportType: string | null;
  securityOfficer: string | null;
  /** null = no filter; true = with images only; false = without images */
  hasImages: boolean | null;
  /** Optional: narrows recent-reports table (ILIKE %search%) */
  search: string | null;
};

export type FilterOptions = {
  locations: string[];
  reportTypes: string[];
  officers: string[];
};

export type PatrolKpis = {
  totalReports: number;
  distinctLocations: number;
  distinctOfficers: number;
  reportsWithImages: number;
  totalAttachments: number;
};

export type TimeSeriesPoint = { date: string; count: number };
export type HourPoint = { hour: number; count: number };
export type NamedCount = { name: string; count: number };
export type RecentReportRow = {
  patrolDatetime: string | null;
  reportType: string | null;
  securityOfficer: string | null;
  location: string | null;
  hasImages: boolean | null;
  numAttachments: number | null;
  reportDetailsClean: string | null;
};

export type DashboardPayload = {
  generatedAt: string;
  filters: PatrolDashboardFilters;
  filterOptions: FilterOptions;
  kpis: PatrolKpis;
  reportsOverTime: TimeSeriesPoint[];
  reportsByHour: HourPoint[];
  reportTypeBreakdown: NamedCount[];
  reportsByLocation: NamedCount[];
  reportsByDayOfWeek: NamedCount[];
  recentReports: RecentReportRow[];
  empty: boolean;
};
