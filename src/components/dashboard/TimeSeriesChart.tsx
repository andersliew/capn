import type { TimeSeriesPoint } from "@/lib/types/dashboard";

import { ChartShell } from "./ChartShell";
import { TIME_SERIES_VIEW } from "./chart-layout";

type Props = {
  points: TimeSeriesPoint[];
};

/** Upper bound for y-scale with readable tick steps (1–2–5 style). */
function niceCeil(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n <= 1) return 1;
  const exp = Math.floor(Math.log10(n));
  const f = n / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

function parseIsoDay(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatTickDate(isoDate: string, includeYear: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return isoDate.slice(0, 10);
  const y = m[1];
  const yy = y.slice(2);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  return includeYear ? `${mo}/${day}/${yy}` : `${mo}/${day}`;
}

function xIndexToPx(i: number, n: number, padL: number, innerW: number): number {
  if (n <= 1) return padL + innerW / 2;
  return padL + (i / (n - 1)) * innerW;
}

export function TimeSeriesChart({ points }: Props) {
  const { w, h, padL, padR, padT, padB, xLabelOffsetY } = TIME_SERIES_VIEW;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = points.length;
  const maxCount = n > 0 ? Math.max(1, ...points.map((p) => p.count)) : 1;
  const yMax = niceCeil(maxCount);
  const yTicks = 4;
  const yAxisTicks: { y: number; label: string }[] = (() => {
    const out: { y: number; label: string }[] = [];
    for (let j = 0; j <= yTicks; j++) {
      const frac = j / yTicks;
      const val = Math.round(yMax * (1 - frac));
      const y = padT + frac * innerH;
      const label = String(val);
      if (out.length === 0 || out[out.length - 1].label !== label) {
        out.push({ y, label });
      }
    }
    return out;
  })();

  const linePoints: { x: number; y: number }[] =
    n === 0
      ? []
      : points.map((p, i) => ({
          x: xIndexToPx(i, n, padL, innerW),
          y: padT + innerH - (p.count / yMax) * innerH,
        }));

  const pathD =
    linePoints.length === 0
      ? ""
      : linePoints.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");

  const areaD =
    linePoints.length === 0
      ? ""
      : (() => {
          const baseY = padT + innerH;
          if (linePoints.length === 1) {
            const { x, y } = linePoints[0];
            return `M ${x.toFixed(1)} ${baseY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)} L ${x.toFixed(1)} ${baseY.toFixed(1)} Z`;
          }
          const rightX = linePoints[linePoints.length - 1].x;
          const leftX = linePoints[0].x;
          return `${pathD} L ${rightX.toFixed(1)} ${baseY.toFixed(1)} L ${leftX.toFixed(1)} ${baseY.toFixed(1)} Z`;
        })();

  const xTickCount = Math.min(6, Math.max(2, n <= 8 ? n : 6));
  const xTickIndicesRaw =
    n === 0
      ? []
      : n === 1
        ? [0]
        : Array.from({ length: xTickCount }, (_, j) =>
            Math.round((j * (n - 1)) / Math.max(xTickCount - 1, 1)),
          );
  const xTickIndices = [...new Set(xTickIndicesRaw)].sort((a, b) => a - b);

  const t0 = n > 0 ? parseIsoDay(points[0].date) : null;
  const t1 = n > 1 ? parseIsoDay(points[n - 1].date) : t0;
  const spanDays =
    t0 != null && t1 != null ? Math.max(0, (t1 - t0) / 86400000) : 0;
  const xLabelsIncludeYear = spanDays > 120;

  /** Just under the plot baseline — tight to the line chart / x-axis. */
  const xAxisLabelY = padT + innerH + xLabelOffsetY;
  /** Horizontal center of y-label gutter (w-10) */
  const yLabelCenterX = padL / 2;

  return (
    <ChartShell
      title="Reports over time"
      subtitle="By patrol_date within your filters"
    >
      {n === 0 ? (
        <EmptyChart />
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="min-h-0 w-full max-w-full flex-1 text-sky-400"
          preserveAspectRatio="xMidYMax meet"
          role="img"
          aria-label="Reports over time line chart"
        >
          <defs>
            <linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yAxisTicks.map((tick, j) => (
            <g key={`y-${j}-${tick.label}`}>
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
                x={yLabelCenterX}
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

          {areaD ? <path d={areaD} fill="url(#tsFill)" /> : null}
          {pathD ? (
            <path
              d={pathD}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {linePoints.length === 1 ? (
            <circle
              cx={linePoints[0].x}
              cy={linePoints[0].y}
              r={3}
              fill="currentColor"
              className="text-sky-400"
            />
          ) : null}

          {xTickIndices.map((idx) => {
            const x = xIndexToPx(idx, n, padL, innerW);
            const label = points[idx]?.date
              ? formatTickDate(points[idx].date, xLabelsIncludeYear)
              : "";
            return (
              <text
                key={`x-${idx}`}
                x={x}
                y={xAxisLabelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-zinc-500"
                style={{ fontSize: 10 }}
              >
                {label}
              </text>
            );
          })}
        </svg>
      )}
    </ChartShell>
  );
}

function EmptyChart() {
  return (
    <div
      className="flex min-h-[8rem] flex-1 items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-[#0c0c0f] text-sm text-zinc-500"
    >
      No data for this range
    </div>
  );
}
