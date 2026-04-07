type Props = {
  label: string;
  value: number;
  sub?: string;
};

export function MetricCard({ label, value, sub }: Props) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#141419] px-4 py-3.5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-zinc-100">
        {value.toLocaleString()}
      </p>
      {sub ? (
        <p className="mt-1 text-xs text-zinc-500">{sub}</p>
      ) : null}
    </div>
  );
}
