import type { CategoryTrendPoint } from "@/lib/types/dashboard";

import { ChartShell } from "./ChartShell";
import { TIME_SERIES_VIEW } from "./chart-layout";

type Props = {
  points: CategoryTrendPoint[];
  location: string | null;
  category: string | null;
  interval: "daily" | "weekly" | "monthly";
};

const COLORS = [
  "#38bdf8",
  "#f97316",
  "#a78bfa",
  "#22c55e",
  "#f43f5e",
  "#eab308",
];

function niceCeil(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n <= 1) return 1;
  const exp = Math.floor(Math.log10(n));
  const f = n / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

function formatTickDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return isoDate.slice(0, 10);
  return `${Number(m[2])}/${Number(m[3])}`;
}

function xIndexToPx(i: number, n: number, padL: number, innerW: number): number {
  if (n <= 1) return padL + innerW / 2;
  return padL + (i / (n - 1)) * innerW;
}

export function IncidentTrendChart({
  points,
  location,
  category,
  interval,
}: Props) {
  const { w, h, padL, padR, padT, padB, xLabelOffsetY } = TIME_SERIES_VIEW;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const periods = [...new Set(points.map((p) => p.period))].sort();
  const categories = [...new Set(points.map((p) => p.category))];
  const counts = new Map(points.map((p) => [`${p.period}__${p.category}`, p.count]));
  const maxCount = points.length > 0 ? Math.max(1, ...points.map((p) => p.count)) : 1;
  const yMax = niceCeil(maxCount);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: padT + frac * innerH,
    label: String(Math.round(yMax * (1 - frac))),
  }));
  const subtitleParts = [
    category ?? "Top incident categories",
    location ? `at ${location}` : "all properties",
    `${interval} buckets`,
  ];

  return (
    <ChartShell title="Incident trend over time" subtitle={subtitleParts.join(" · ")}>
      {points.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">No trend data</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="min-h-0 w-full max-w-full flex-1"
            preserveAspectRatio="xMidYMax meet"
            role="img"
            aria-label="Incident trend over time"
          >
            {yTicks.map((tick) => (
              <g key={tick.label}>
                <line
                  x1={padL}
                  y1={tick.y}
                  x2={padL + innerW}
                  y2={tick.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={padL / 2}
                  y={tick.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-zinc-500"
                  style={{ fontSize: 10 }}
                >
                  {tick.label}
                </text>
              </g>
            ))}
            <line
              x1={padL}
              y1={padT + innerH}
              x2={padL + innerW}
              y2={padT + innerH}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={padL}
              y1={padT}
              x2={padL}
              y2={padT + innerH}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {categories.map((cat, catIndex) => {
              const linePoints = periods.map((period, i) => {
                const value = counts.get(`${period}__${cat}`) ?? 0;
                return {
                  x: xIndexToPx(i, periods.length, padL, innerW),
                  y: padT + innerH - (value / yMax) * innerH,
                };
              });
              const pathD = linePoints
                .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
                .join(" ");
              return (
                <path
                  key={cat}
                  d={pathD}
                  fill="none"
                  stroke={COLORS[catIndex % COLORS.length]}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {periods
              .filter((_, i) => {
                const target = Math.max(1, Math.floor(periods.length / 5));
                return i === 0 || i === periods.length - 1 || i % target === 0;
              })
              .map((period) => {
                const idx = periods.indexOf(period);
                return (
                  <text
                    key={period}
                    x={xIndexToPx(idx, periods.length, padL, innerW)}
                    y={padT + innerH + xLabelOffsetY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-zinc-500"
                    style={{ fontSize: 10 }}
                  >
                    {formatTickDate(period)}
                  </text>
                );
              })}
          </svg>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {categories.map((cat, i) => (
              <span key={cat} className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}
    </ChartShell>
  );
}
