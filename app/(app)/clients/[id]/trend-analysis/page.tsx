// app/(app)/clients/[id]/trend-analysis/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

const PROFILE_COLOR: Record<string, string> = {
  "Conservative":            "#2E7D5B",
  "Moderately Conservative": "#3A7A50",
  "Balanced / Moderate":     "#C39A38",
  "Moderately Aggressive":   "#B4723C",
  "Aggressive":              "#B4463C",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const str = abs >= 10_000_000
    ? `₹${(abs / 10_000_000).toFixed(2)} Cr`
    : abs >= 100_000
    ? `₹${(abs / 100_000).toFixed(2)} L`
    : `₹${abs.toLocaleString("en-IN")}`;
  return n < 0 ? `-${str}` : str;
}

function DeltaCard({ label, delta, unit }: { label: string; delta: number | null; unit?: string }) {
  const hasData = delta !== null;
  const up = (delta ?? 0) > 0;
  const neutral = delta === 0;
  return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
      <div className="text-xs text-[#6B7E86] mb-3">{label}</div>
      {!hasData ? (
        <div className="text-[#6B7E86] text-sm italic">Only 1 record — need 2+ to show trend</div>
      ) : (
        <div className={`font-bold font-serif text-2xl ${neutral ? "text-[#6B7E86]" : up ? "text-[#2E7D5B]" : "text-[#B4463C]"}`}>
          {neutral ? "No change" : `${up ? "+" : ""}${unit ?? ""}${typeof delta === "number" ? Math.abs(delta).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : ""}${unit === "" ? " pts" : ""}`}
        </div>
      )}
    </div>
  );
}

// Inline SVG line chart — works in Server Components
function LineChart({
  series,
  labels,
  yMin = 0,
  yMax = 100,
  colors,
  legendLabels,
  formatY,
}: {
  series: (number | null)[][];
  labels: string[];
  yMin?: number;
  yMax?: number;
  colors: string[];
  legendLabels: string[];
  formatY?: (v: number) => string;
}) {
  const W = 600, H = 200, PL = 56, PR = 16, PT = 16, PB = 32;
  const cw = W - PL - PR, ch = H - PT - PB;
  const n = labels.length;
  if (n < 2) return (
    <div className="h-32 flex items-center justify-center text-sm text-[#6B7E86] italic">
      Need at least 2 data points to draw a trend line.
    </div>
  );

  const xOf = (i: number) => PL + (i / (n - 1)) * cw;
  const yOf = (v: number) => PT + ch - ((v - yMin) / (yMax - yMin)) * ch;

  const gridVals = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) / 4) * i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: "220px" }}>
      {/* Grid lines */}
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={PL} y1={yOf(v)} x2={W - PR} y2={yOf(v)} stroke="#E7EFEF" strokeWidth="1" />
          <text x={PL - 6} y={yOf(v) + 4} textAnchor="end" fontSize="10" fill="#6B7E86">
            {formatY ? formatY(v) : `${v}%`}
          </text>
        </g>
      ))}
      {/* X labels */}
      {labels.map((l, i) => (
        <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6B7E86">
          {l}
        </text>
      ))}
      {/* Series lines + dots */}
      {series.map((pts, si) => {
        const segments: string[] = [];
        let path = "";
        pts.forEach((v, i) => {
          if (v == null) { if (path) { segments.push(path); path = ""; } return; }
          path += (path ? " L" : "M") + ` ${xOf(i)},${yOf(v)}`;
        });
        if (path) segments.push(path);
        return (
          <g key={si}>
            {segments.map((d, di) => (
              <path key={di} d={d} fill="none" stroke={colors[si]} strokeWidth="2.5" strokeLinejoin="round" />
            ))}
            {pts.map((v, i) => v != null && (
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r="4" fill={colors[si]} stroke="white" strokeWidth="1.5" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default async function TrendAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: snaps }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("snapshots")
      .select("snapshot_date,capacity_score,tolerance_score,knowledge_score,total_score,final_profile,net_worth,red_flag_count,income,total_assets,total_debt,source_note,raw_data")
      .eq("client_id", id)
      .order("snapshot_date", { ascending: true }),
  ]);

  if (error || !client) notFound();

  const first = snaps?.[0];
  const last  = snaps?.[snaps.length - 1];
  const multi = (snaps?.length ?? 0) >= 2;

  const scoreDelta = multi && first?.total_score != null && last?.total_score != null
    ? last.total_score - first.total_score : null;
  const nwDelta = multi && first?.net_worth != null && last?.net_worth != null
    ? last.net_worth - first.net_worth : null;
  const flagDelta = multi && first?.red_flag_count != null && last?.red_flag_count != null
    ? last.red_flag_count - first.red_flag_count : null;

  const labels = (snaps ?? []).map(s =>
    new Date(s.snapshot_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
  );

  const capPct  = (snaps ?? []).map(s => s.capacity_score  != null ? Math.round((s.capacity_score  / 40) * 100) : null);
  const tolPct  = (snaps ?? []).map(s => s.tolerance_score != null ? Math.round((s.tolerance_score / 35) * 100) : null);
  const knPct   = (snaps ?? []).map(s => s.knowledge_score != null ? Math.round((s.knowledge_score / 20) * 100) : null);
  const totPct  = (snaps ?? []).map(s => s.total_score     != null ? Math.round((s.total_score     / 95) * 100) : null);
  const nwVals  = (snaps ?? []).map(s => s.net_worth != null ? Number(s.net_worth) / 100_000 : null);  // in lakhs
  const nwMin   = Math.min(...nwVals.filter(v => v != null) as number[]);
  const nwMax   = Math.max(...nwVals.filter(v => v != null) as number[]);
  const nwRange = nwMax - nwMin || 1;

  // ── What-changed diff between the last two snapshots ─────────────────────
  type Raw = { goals?: { name: string | null; funded_pct: number; gap: number; extra_sip: number }[]; flags?: string[]; loans_total?: number; expenses_annual?: number | null; life_cover?: number | null; health_cover?: number | null } | null;
  const prev = snaps && snaps.length >= 2 ? snaps[snaps.length - 2] : null;
  const prevRaw = (prev?.raw_data ?? null) as Raw;
  const lastRaw = (last?.raw_data ?? null) as Raw;
  const diffRows: { metric: string; before: string; after: string; delta: number | null; good?: boolean }[] = [];
  if (prev && last) {
    const push = (metric: string, b: number | null | undefined, a: number | null | undefined, moneyFmt = false, higherIsBetter = true) => {
      if (b == null && a == null) return;
      const bv = Number(b ?? 0), av = Number(a ?? 0);
      diffRows.push({ metric,
        before: moneyFmt ? fmt(bv) : String(bv),
        after:  moneyFmt ? fmt(av) : String(av),
        delta: av - bv, good: higherIsBetter ? av >= bv : av <= bv });
    };
    push("Total risk score", prev.total_score, last.total_score);
    push("Capacity score", prev.capacity_score, last.capacity_score);
    push("Tolerance score", prev.tolerance_score, last.tolerance_score);
    push("Annual income", prev.income, last.income, true);
    push("Total assets", prev.total_assets, last.total_assets, true);
    push("Total debt", prev.total_debt, last.total_debt, true, false);
    push("Net worth", prev.net_worth, last.net_worth, true);
    push("Red flags", prev.red_flag_count, last.red_flag_count, false, false);
    push("Loans outstanding", prevRaw?.loans_total, lastRaw?.loans_total, true, false);
    push("Annual expenses", prevRaw?.expenses_annual, lastRaw?.expenses_annual, true, false);
    push("Life cover", prevRaw?.life_cover, lastRaw?.life_cover, true);
    push("Health cover", prevRaw?.health_cover, lastRaw?.health_cover, true);
  }
  const profileChanged = prev && last && prev.final_profile !== last.final_profile;
  const flagsAdded   = (lastRaw?.flags ?? []).filter(f => !(prevRaw?.flags ?? []).includes(f));
  const flagsCleared = (prevRaw?.flags ?? []).filter(f => !(lastRaw?.flags ?? []).includes(f));

  // Per-goal funded% comparison
  const goalDiffs = (lastRaw?.goals ?? []).map(g => {
    const pg = (prevRaw?.goals ?? []).find(x => x.name === g.name);
    return { name: g.name ?? "Goal", before: pg?.funded_pct ?? null, after: g.funded_pct, gap: g.gap, extra_sip: g.extra_sip };
  });

  // Goal funding trend across ALL snapshots (series per goal)
  const goalNames = Array.from(new Set((snaps ?? []).flatMap(s => (((s.raw_data ?? {}) as Raw)?.goals ?? []).map(g => g.name ?? "Goal"))));
  const goalSeries = goalNames.slice(0, 5).map(name =>
    (snaps ?? []).map(s => {
      const g = (((s.raw_data ?? {}) as Raw)?.goals ?? []).find(x => (x.name ?? "Goal") === name);
      return g ? g.funded_pct : null;
    })
  );
  const GOAL_COLORS = ["#175A69", "#C39A38", "#B4463C", "#7B5EA7", "#2E7D5B"];

  return (
    <div className="space-y-5">

      {/* Delta summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DeltaCard label={`Total risk score · since ${new Date(first?.snapshot_date ?? Date.now()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
          delta={scoreDelta} unit="" />
        <DeltaCard label="Net worth change" delta={nwDelta != null ? Math.round(nwDelta) : null} unit="₹" />
        <DeltaCard label="Red flag count change" delta={flagDelta} unit="" />
      </div>

      {/* ── What changed since last review ── */}
      {prev && last && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-[#0F3A46] flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-white">What changed since the previous review</h3>
            <p className="text-[10px] text-[#A0C4CE]">
              {new Date(prev.snapshot_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})} → {new Date(last!.snapshot_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
            </p>
          </div>
          {profileChanged && (
            <div className="px-5 py-3 bg-[#FFF8EC] border-b border-[#E3D3A8]">
              <p className="text-xs font-semibold text-[#8A6D1C]">
                ⚠ Risk profile changed: <span style={{ color: PROFILE_COLOR[prev.final_profile ?? ""] ?? "#6B7E86" }}>{prev.final_profile}</span>
                {" → "}<span style={{ color: PROFILE_COLOR[last!.final_profile ?? ""] ?? "#6B7E86" }}>{last!.final_profile}</span>
                {" "}— reassess allocation and suitability.
              </p>
            </div>
          )}
          <table className="w-full text-xs">
            <thead><tr className="bg-[#F5F9FA] text-[#6B7E86] border-b border-[#E7EFEF]">
              <th className="text-left px-5 py-2 font-medium">Metric</th>
              <th className="text-right px-3 py-2 font-medium">Previous</th>
              <th className="text-right px-3 py-2 font-medium">Current</th>
              <th className="text-right px-5 py-2 font-medium">Change</th>
            </tr></thead>
            <tbody>
              {diffRows.map((r, i) => (
                <tr key={i} className="border-b border-[#EEF4F5]">
                  <td className="px-5 py-2 font-medium text-[#0F3A46]">{r.metric}</td>
                  <td className="px-3 py-2 text-right text-[#6B7E86]">{r.before}</td>
                  <td className="px-3 py-2 text-right text-[#0F3A46] font-semibold">{r.after}</td>
                  <td className="px-5 py-2 text-right font-semibold" style={{ color: r.delta === 0 ? "#6B7E86" : r.good ? "#2E7D5B" : "#B4463C" }}>
                    {r.delta === 0 ? "—" : (r.delta! > 0 ? "▲ +" : "▼ ") + (Math.abs(r.delta!) >= 1000 ? fmt(Math.abs(r.delta!)) : Math.abs(r.delta!))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(flagsAdded.length > 0 || flagsCleared.length > 0) && (
            <div className="px-5 py-3 grid grid-cols-2 gap-4 border-t border-[#E7EFEF]">
              <div>
                <p className="text-[10px] font-semibold text-[#B4463C] mb-1">NEW FLAGS ({flagsAdded.length})</p>
                {flagsAdded.length === 0 ? <p className="text-[10px] text-[#6B7E86]">None</p> :
                  flagsAdded.map((f, i) => <p key={i} className="text-[10px] text-[#B4463C]">⚠ {f}</p>)}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[#2E7D5B] mb-1">FLAGS CLEARED ({flagsCleared.length})</p>
                {flagsCleared.length === 0 ? <p className="text-[10px] text-[#6B7E86]">None</p> :
                  flagsCleared.map((f, i) => <p key={i} className="text-[10px] text-[#2E7D5B]">✓ {f}</p>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Goal progress: previous vs current ── */}
      {goalDiffs.length > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Goal funding progress — previous vs current review</h3>
          <div className="space-y-3">
            {goalDiffs.map((g, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#0F3A46]">{g.name}</span>
                  <span className="text-[#6B7E86]">
                    {g.before != null ? `${g.before}% → ` : ""}<strong className="text-[#0F3A46]">{g.after}% funded</strong>
                    {g.before != null && g.after !== g.before && (
                      <span className="ml-1.5 font-semibold" style={{ color: g.after > g.before ? "#2E7D5B" : "#B4463C" }}>
                        ({g.after > g.before ? "+" : ""}{g.after - g.before}pp)
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative h-3 bg-[#EEF4F5] rounded-full overflow-hidden">
                  {g.before != null && <div className="absolute h-3 bg-[#A0C4CE]" style={{ width: `${Math.min(100, g.before)}%` }} />}
                  <div className="absolute h-3 rounded-full" style={{ width: `${Math.min(100, g.after)}%`, background: g.after >= (g.before ?? 0) ? "#2E7D5B" : "#B4463C", opacity: 0.85 }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-[#6B7E86] mt-2">Light bar = previous review · solid bar = current. &quot;pp&quot; = percentage points.</p>
        </div>
      )}

      {/* ── Goal funding trend across all reviews ── */}
      {goalSeries.length > 0 && (snaps?.length ?? 0) >= 2 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-1">Goal funded % over time</h3>
          <p className="text-xs text-[#6B7E86] mb-4">Each line is a goal&apos;s funded percentage at every review.</p>
          <LineChart series={goalSeries} labels={labels} yMin={0} yMax={100}
            colors={GOAL_COLORS.slice(0, goalSeries.length)} legendLabels={goalNames.slice(0, 5)} formatY={v => `${v}%`} />
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-[#6B7E86]">
            {goalNames.slice(0, 5).map((n, i) => (
              <span key={n} className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 rounded inline-block" style={{ background: GOAL_COLORS[i] }} />{n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Risk score components over time */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-1">Risk score components over time (% of max)</h3>
        <p className="text-xs text-[#6B7E86] mb-4">Capacity (40 pts), Tolerance (35 pts), Knowledge (20 pts), Total (95 pts)</p>
        <LineChart
          series={[capPct, tolPct, knPct, totPct]}
          labels={labels}
          yMin={0} yMax={100}
          colors={["#175A69", "#B4463C", "#C39A38", "#6B7E86"]}
          legendLabels={["Capacity", "Tolerance", "Knowledge", "Total"]}
          formatY={v => `${v}%`}
        />
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-[#6B7E86]">
          {[["#175A69","Capacity"],["#B4463C","Tolerance"],["#C39A38","Knowledge"],["#6B7E86","Total"]].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded inline-block" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Net worth trend */}
      {nwVals.some(v => v != null) && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-1">Net worth trend (₹ Lakhs)</h3>
          <LineChart
            series={[nwVals]}
            labels={labels}
            yMin={Math.max(0, nwMin - nwRange * 0.1)}
            yMax={nwMax + nwRange * 0.1}
            colors={["#175A69"]}
            legendLabels={["Net worth"]}
            formatY={v => `${v.toFixed(0)}L`}
          />
        </div>
      )}

      {/* Profile history table */}
      {snaps && snaps.length > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold text-[#175A69]">Profile history</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F9FA] border-b border-[#E7EFEF] text-xs text-[#6B7E86]">
                <th className="text-left px-5 py-2 font-medium">Date</th>
                <th className="text-left px-5 py-2 font-medium">Risk profile</th>
                <th className="text-left px-5 py-2 font-medium">Score</th>
                <th className="text-left px-5 py-2 font-medium">Net worth</th>
                <th className="text-center px-5 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {[...snaps].reverse().map((s, i) => (
                <tr key={i} className="border-b border-[#E7EFEF]">
                  <td className="px-5 py-2.5 text-[#6B7E86] text-xs">
                    {new Date(s.snapshot_date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}
                  </td>
                  <td className="px-5 py-2.5">
                    {s.final_profile ? (
                      <span className="text-xs font-medium" style={{ color: PROFILE_COLOR[s.final_profile] ?? "#6B7E86" }}>
                        ● {s.final_profile}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[#0F3A46] text-xs">{s.total_score ?? "—"} / 95</td>
                  <td className="px-5 py-2.5 text-[#0F3A46] text-xs">{fmt(s.net_worth)}</td>
                  <td className="px-5 py-2.5 text-center">
                    <span className={`inline-block w-5 h-5 rounded-full text-xs font-bold leading-5 text-center ${
                      (s.red_flag_count ?? 0) > 0 ? "bg-[#F8E7E4] text-[#B4463C]" : "bg-[#E4F1EA] text-[#2E7D5B]"
                    }`}>{s.red_flag_count ?? 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
