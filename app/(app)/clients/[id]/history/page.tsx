// app/(app)/clients/[id]/history/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

const PROFILE_COLOR: Record<string, string> = {
  "Conservative":           "bg-[#E4F1EA] text-[#2E7D5B]",
  "Moderately Conservative":"bg-[#EBF4EA] text-[#3A7A50]",
  "Balanced / Moderate":    "bg-[#FEF9E7] text-[#7D6B2E]",
  "Moderately Aggressive":  "bg-[#FEF3E7] text-[#8B4A10]",
  "Aggressive":             "bg-[#F8E7E4] text-[#B4463C]",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function TrendBadge({ delta, unit = "" }: { delta: number | null; unit?: string }) {
  if (delta === null) return <span className="text-[#6B7E86] text-xs">first record</span>;
  if (delta === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-[#DDE6E8] text-[#6B7E86]">— no change</span>;
  const up = delta > 0;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${up ? "bg-[#E4F1EA] text-[#2E7D5B]" : "bg-[#F8E7E4] text-[#B4463C]"}`}>
      {up ? "▲" : "▼"} {up ? "+" : ""}{unit}{Math.abs(delta).toLocaleString("en-IN", { maximumFractionDigits: 0 })}{unit === "" ? " pts" : ""}
    </span>
  );
}

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: snapshots }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("snapshots").select("*").eq("client_id", id).order("snapshot_date", { ascending: false }),
  ]);

  if (error || !client) notFound();

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-1">History</h3>
        <p className="text-xs text-[#6B7E86]">
          A permanent timeline of this client&apos;s state at every questionnaire load.
          Re-uploading a questionnaire never overwrites this — it adds a new point below.
        </p>
      </div>

      {!snapshots || snapshots.length === 0 ? (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 text-center">
          <p className="text-[#6B7E86]">No questionnaire submissions recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0F3A46] text-white text-xs">
                  {["Date", "Risk profile", "Total score", "Trend", "Net worth", "Change", "Red flags", "Answered"].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap, i) => {
                  const prev = snapshots[i + 1];
                  const scoreDelta = prev?.total_score != null && snap.total_score != null
                    ? snap.total_score - prev.total_score : null;
                  const nwDelta = prev?.net_worth != null && snap.net_worth != null
                    ? snap.net_worth - prev.net_worth : null;
                  const isFirst = i === snapshots.length - 1;
                  const dateStr = new Date(snap.snapshot_date).toLocaleString("en-IN", {
                    year: "numeric", month: "short", day: "2-digit",
                    hour: "2-digit", minute: "2-digit", hour12: false,
                  });
                  return (
                    <tr key={snap.snapshot_id} className={`border-b border-[#E7EFEF] ${i % 2 === 0 ? "" : "bg-[#F5F9FA]"}`}>
                      <td className="px-4 py-3 text-[#0F3A46] whitespace-nowrap">
                        <div className="font-medium">{dateStr}</div>
                        <div className="text-[10px] text-[#6B7E86] mt-0.5">{snap.source_note}</div>
                      </td>
                      <td className="px-4 py-3">
                        {snap.final_profile ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PROFILE_COLOR[snap.final_profile] ?? "bg-[#DDE6E8] text-[#6B7E86]"}`}>
                            {snap.final_profile}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#0F3A46]">
                        {snap.total_score != null ? `${snap.total_score} / 95` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <TrendBadge delta={isFirst ? null : scoreDelta} />
                      </td>
                      <td className="px-4 py-3 text-[#0F3A46]">{fmt(snap.net_worth)}</td>
                      <td className="px-4 py-3">
                        {isFirst
                          ? <span className="text-xs text-[#6B7E86]">—</span>
                          : <TrendBadge delta={nwDelta} unit="₹" />}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block w-6 h-6 rounded-full text-xs font-bold leading-6 text-center ${
                          (snap.red_flag_count ?? 0) > 0 ? "bg-[#F8E7E4] text-[#B4463C]" : "bg-[#E4F1EA] text-[#2E7D5B]"
                        }`}>
                          {snap.red_flag_count ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6B7E86]">
                        {snap.answered_count != null ? `${snap.answered_count}/19` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
