type Props = {
  insights: string[];
};

export function KeyInsightsPanel({ insights }: Props) {
  return (
    <section className="rounded-xl border border-sky-500/15 bg-[#141419] px-4 py-3.5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Key insights</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Computed from the current filters
          </p>
        </div>
        <div className="grid flex-1 gap-2 sm:max-w-5xl md:grid-cols-2 xl:grid-cols-3">
          {insights.length === 0 ? (
            <p className="text-sm text-zinc-500">No insights available.</p>
          ) : (
            insights.map((insight) => (
              <p
                key={insight}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-zinc-300"
              >
                {insight}
              </p>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
