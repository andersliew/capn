import { ReportDetailsCell } from "@/components/dashboard/ReportDetailsCell";
import type { RecentReportRow } from "@/lib/types/dashboard";

type Props = {
  rows: RecentReportRow[];
};

export function RecentReportsTable({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#141419] shadow-sm">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-100">Recent reports</h3>
        <p className="text-xs text-zinc-500">
          Latest rows matching filters and search (up to 75)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="sticky top-0 bg-[#141419] text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2.5">When</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Raw type</th>
              <th className="px-3 py-2.5">Officer</th>
              <th className="px-3 py-2.5">Location</th>
              <th className="min-w-[200px] px-3 py-2.5">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-16 text-center text-zinc-500">
                  No reports match your filters
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr
                  key={`${r.patrolDatetime ?? ""}-${i}`}
                  className="align-top hover:bg-white/[0.02]"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">
                    {r.patrolDatetime
                      ? new Date(r.patrolDatetime).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="text-zinc-200">{r.reportCategory}</span>
                      <span
                        className={
                          r.activityClass === "Incident"
                            ? "w-fit rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
                            : "w-fit rounded-full border border-sky-400/15 bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-200"
                        }
                      >
                        {r.activityClass}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-zinc-400" title={r.reportType ?? undefined}>
                    {r.reportType ?? "—"}
                  </td>
                  <td className="max-w-[150px] truncate px-3 py-2.5 text-zinc-400" title={r.securityOfficer ?? undefined}>
                    {r.securityOfficer ?? "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-zinc-300">
                    {r.location ?? "—"}
                  </td>
                  <td className="max-w-md px-3 py-2.5 align-top">
                    <ReportDetailsCell text={r.reportDetailsClean} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
