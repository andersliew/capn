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
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 bg-[#141419] text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2.5">When</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Officer</th>
              <th className="px-3 py-2.5">Location</th>
              <th className="px-3 py-2.5">Images</th>
              <th className="px-3 py-2.5">Attachments</th>
              <th className="min-w-[200px] px-3 py-2.5">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-16 text-center text-zinc-500">
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
                  <td className="px-3 py-2.5 text-zinc-300">{r.reportType ?? "—"}</td>
                  <td className="max-w-[140px] truncate px-3 py-2.5 text-zinc-400">
                    {r.securityOfficer ?? "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-zinc-300">
                    {r.location ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400">
                    {r.hasImages === true ? "Yes" : r.hasImages === false ? "No" : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-zinc-400">
                    {r.numAttachments ?? "—"}
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
