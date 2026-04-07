import type { TimeSeriesPoint } from "@/lib/types/dashboard";

import { ChartShell } from "./ChartShell";

type Props = {
  points: TimeSeriesPoint[];
};

export function TimeSeriesChart({ points }: Props) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const w = 400;
  const h = 180;
  const pad = 8;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const n = Math.max(points.length, 1);

  const pathD =
    points.length === 0
      ? ""
      : points
          .map((p, i) => {
            const x = pad + (i / Math.max(n - 1, 1)) * innerW;
            const y = pad + innerH - (p.count / max) * innerH;
            return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ");

  return (
    <ChartShell
      title="Reports over time"
      subtitle="By patrol_date within your filters"
    >
      {points.length === 0 ? (
        <EmptyChart />
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-full w-full text-sky-400"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${pathD} L ${pad + innerW} ${pad + innerH} L ${pad} ${pad + innerH} Z`}
            fill="url(#tsFill)"
          />
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </ChartShell>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-[#0c0c0f] text-sm text-zinc-500">
      No data for this range
    </div>
  );
}
