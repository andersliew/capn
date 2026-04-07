import type { HourPoint } from "@/lib/types/dashboard";

import { ChartShell } from "./ChartShell";

type Props = {
  points: HourPoint[];
};

export function HourChart({ points }: Props) {
  const byHour = Array.from({ length: 24 }, (_, h) => {
    const found = points.find((p) => p.hour === h);
    return { hour: h, count: found?.count ?? 0 };
  });
  const max = Math.max(1, ...byHour.map((p) => p.count));

  return (
    <ChartShell
      title="Reports by hour"
      subtitle="Hour of patrol time (local timezone from Neon)"
    >
      <div className="flex h-full max-h-[200px] items-end gap-px px-1">
        {byHour.map((p) => (
          <div
            key={p.hour}
            title={`${p.hour}:00 — ${p.count}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <div
              className="w-full max-w-[12px] rounded-t bg-sky-500/90"
              style={{
                height: `${Math.max(4, (p.count / max) * 100)}%`,
                minHeight: p.count > 0 ? 4 : 0,
              }}
            />
            <span className="text-[9px] leading-none text-zinc-600">
              {p.hour % 4 === 0 ? p.hour : ""}
            </span>
          </div>
        ))}
      </div>
    </ChartShell>
  );
}
