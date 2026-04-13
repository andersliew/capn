import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Fixed visual height so chart rows align across the grid */
export function ChartShell({ title, subtitle, children }: Props) {
  return (
    <div className="flex h-[280px] flex-col rounded-xl border border-white/[0.06] bg-[#141419] p-4 shadow-sm">
      <div className="mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-auto pb-1">
        {children}
      </div>
    </div>
  );
}
