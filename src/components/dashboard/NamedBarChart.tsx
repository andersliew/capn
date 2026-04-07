import type { NamedCount } from "@/lib/types/dashboard";

import { ChartShell } from "./ChartShell";

type Props = {
  title: string;
  subtitle?: string;
  rows: NamedCount[];
};

export function NamedBarChart({ title, subtitle, rows }: Props) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <ChartShell title={title} subtitle={subtitle}>
      <div className="custom-scrollbar max-h-[200px] space-y-2.5 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No rows</p>
        ) : (
          rows.map((r) => (
            <div key={r.name}>
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate text-zinc-300" title={r.name}>
                  {r.name}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">
                  {r.count}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-sky-500/80"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </ChartShell>
  );
}
