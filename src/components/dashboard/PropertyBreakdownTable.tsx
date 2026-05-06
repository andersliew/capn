import type { PropertyBreakdownRow } from "@/lib/types/dashboard";

type Props = {
  rows: PropertyBreakdownRow[];
};

export function PropertyBreakdownTable({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#141419] shadow-sm">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-100">Property incident breakdown</h3>
        <p className="text-xs text-zinc-500">
          Category counts for the selected filters
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 bg-[#141419] text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Property</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5 text-right">Incidents</th>
              <th className="px-3 py-2.5 text-right">Trespassing</th>
              <th className="px-3 py-2.5 text-right">Maintenance</th>
              <th className="px-3 py-2.5 text-right">Parking</th>
              <th className="px-3 py-2.5 text-right">Crime/Police</th>
              <th className="px-3 py-2.5 text-right">Policy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                  No property rows match your filters
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.property} className="hover:bg-white/[0.02]">
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-zinc-300" title={r.property}>
                    {r.property}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{r.totalReports}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">{r.incidentReports}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{r.trespassing}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{r.maintenance}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{r.parking}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{r.crimePolice}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{r.policyViolations}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
