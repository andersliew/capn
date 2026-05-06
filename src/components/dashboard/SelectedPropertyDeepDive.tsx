import type { SelectedPropertyDeepDive as SelectedPropertyDeepDiveData } from "@/lib/types/dashboard";

import { IncidentTrendChart } from "./IncidentTrendChart";
import { MetricCard } from "./MetricCard";
import { NamedBarChart } from "./NamedBarChart";

type Props = {
  data: SelectedPropertyDeepDiveData;
};

export function SelectedPropertyDeepDive({ data }: Props) {
  if (!data) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">
          {data.property} deep dive
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Incident-only view for the selected property
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total incidents"
          value={data.totalIncidents}
          sub="Selected date range"
        />
        <NamedBarChart
          title="Top incident types"
          subtitle="At this property"
          rows={data.topIncidentTypes}
        />
        <NamedBarChart
          title="Officer activity"
          subtitle="Incident reports at this property"
          rows={data.officerActivity}
        />
        <IncidentTrendChart
          points={data.trespassingTrend}
          location={data.property}
          category="Trespassing"
          interval="weekly"
        />
      </div>
    </section>
  );
}
