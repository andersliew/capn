import type { NamedCount } from "@/lib/types/dashboard";

import { ChartShell } from "./ChartShell";
import { TOP_ROW_CHART } from "./chart-layout";

const WEEK_ORDER = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const SHORT_LABEL = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

type Props = {
  rows: NamedCount[];
};

/**
 * Compact column chart for patrol volume by weekday (same data as SQL `to_char(..., 'Day')`).
 */
export function DayOfWeekChart({ rows }: Props) {
  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.name.trim()] = r.count;
  }

  const byDay = WEEK_ORDER.map((day, i) => ({
    key: day,
    label: SHORT_LABEL[i],
    count: map[day] ?? 0,
  }));

  const max = Math.max(1, ...byDay.map((d) => d.count));
  const mid = Math.round(max / 2);

  return (
    <ChartShell
      title="Reports by weekday"
      subtitle="Patrol counts by calendar day of week (in scope)"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`flex min-h-0 flex-1 gap-1.5`}>
          <div
            className={`flex ${TOP_ROW_CHART.yAxisClass} shrink-0 flex-col border-r border-white/[0.08]`}
            aria-hidden
          >
            {[max, mid, 0].map((val, i) => (
              <div
                key={`y-${i}`}
                className="flex flex-1 items-center justify-center px-0.5"
              >
                <span
                  className={
                    i === 0
                      ? "text-[10px] tabular-nums leading-none text-zinc-400"
                      : "text-[10px] tabular-nums leading-none text-zinc-500"
                  }
                >
                  {val}
                </span>
              </div>
            ))}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 items-end gap-0.5 px-0.5">
            {byDay.map((d) => {
              const pct = max > 0 ? (d.count / max) * 100 : 0;
              return (
                <div
                  key={d.key}
                  title={`${d.key}: ${d.count}`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div
                    className="mx-auto w-full max-w-[14px] rounded-t bg-sky-500/90"
                    style={{
                      height: d.count > 0 ? `${Math.max(pct, 2)}%` : "0%",
                      minHeight: d.count > 0 ? 2 : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className={`flex shrink-0 items-stretch ${TOP_ROW_CHART.gapClass}`}>
          <div className={`${TOP_ROW_CHART.yAxisClass} shrink-0`} aria-hidden />
          <div
            className={`flex min-w-0 flex-1 items-stretch gap-0.5 px-0.5 pb-1 pt-0 ${TOP_ROW_CHART.xAxisClass}`}
          >
            {byDay.map((d) => (
              <div
                key={d.key}
                className="flex min-w-0 flex-1 flex-col justify-end"
              >
                <span className="select-none text-center text-[10px] font-medium leading-none text-zinc-400">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ChartShell>
  );
}
