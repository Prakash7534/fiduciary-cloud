// app/(app)/clients/[id]/page.tsx  — Risk Analysis Dashboard
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  analyseClient, CATEGORIES,
  type RiskAnswer, type LoanRow, type InvestmentRow, type GoalRow,
} from "@/lib/riskEngine";
import ScoreChart from "./_components/ScoreChart";
import OverrideSelector from "./_components/OverrideSelector";

// Score → band label (total 19-95 scale)
function totalBand(total: number): string {
  if (total <= 33) return "Conservative";
  if (total <= 47) return "Moderately Conservative";
  if (total <= 61) return "Balanced / Moderate";
  if (total <= 76) return "Moderately Aggressive";
  return "Aggressive";
}
function strength(pct: number): string {
  if (pct >= 0.65) return "High";
  if (pct >= 0.40) return "Moderate";
  return "Low";
}
const BANDS = [
  { range: "19 – 33", label: "Conservative",             equity: "0–20% equity",   min: 19, max: 33 },
  { range: "34 – 47", label: "Moderately Conservative",  equity: "20–40% equity",  min: 34, max: 47 },
  { range: "48 – 61", label: "Balanced / Moderate",      equity: "40–60% equity",  min: 48, max: 61 },
  { range: "62 – 76", label: "Moderately Aggressive",    equity: "60–80% equity",  min: 62, max: 76 },
  { range: "77 – 95", label: "Aggressive",               equity: "80–100% equity", min: 77, max: 95 },
];

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function RiskProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("client_id", id).maybeSingle();
  if (!client) notFound();

  const [{ data: facts }, { data: answers }, { data: loans }, { data: invs }, { data: goals }] = await Promise.all([
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("risk_answers").select("question_num, answer").eq("client_id", id),
    supabase.from("loans").select("loan_type, outstanding").eq("client_id", id),
    supabase.from("investments").select("asset_class, value").eq("client_id", id),
    supabase.from("goals").select("*").eq("client_id", id),
  ]);

  const a = analyseClient(
    client, facts ?? null,
    (answers ?? []) as RiskAnswer[],
    (loans ?? []) as LoanRow[],
    (invs ?? []) as InvestmentRow[],
    (goals ?? []) as GoalRow[],
  );

  const capPct  = a.cap / 40;
  const tolPct  = a.tol / 35;
  const knPct   = a.kn  / 20;
  const totPct  = a.total / 95;
  const badFlags = a.flags.filter(f => f.state === "bad");
  const okFlags  = a.flags.filter(f => f.state === "ok");

  const scoreRows = [
    { label: "Risk Capacity (ability)",      score: a.cap, max: 40, pct: capPct },
    { label: "Risk Tolerance (willingness)", score: a.tol, max: 35, pct: tolPct },
    { label: "Knowledge & Experience",       score: a.kn,  max: 20, pct: knPct  },
  ];

  return (
    <div className="space-y-5">
      {/* — client label + stats — */}
      <div>
        <p className="text-[10px] tracking-widest text-[#175A69] uppercase font-semibold mb-0.5">
          {client.full_name}
        </p>
        <p className="text-sm text-[#4A6572]">
          Age {a.age ?? "—"} · Years to retirement {a.yearsToRetirement ?? "—"} · Income {fmt(a.income)} · Assets {fmt(a.totalAssets)} · Debt {fmt(a.totalDebt)}
        </p>
      </div>



      {/* — dashboard title — */}
      <div>
        <h2 className="text-xl font-semibold text-[#0F3A46] mb-0.5">Risk Analysis Dashboard</h2>
        <p className="text-xs text-[#4A6572]">
          Scores pull from the 19 risk questions. Lower of capacity vs willingness governs; use the override only with a documented rationale in Advisor Notes.
        </p>
      </div>

      {/* — row 1: scores | bands | chart — */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Component scores */}
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Component scores</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-2 py-1.5 font-medium rounded-tl-md">Component</th>
                <th className="text-center px-2 py-1.5 font-medium">Score</th>
                <th className="text-center px-2 py-1.5 font-medium">Max</th>
                <th className="text-center px-2 py-1.5 font-medium">% of max</th>
                <th className="text-center px-2 py-1.5 font-medium rounded-tr-md">Strength</th>
              </tr>
            </thead>
            <tbody>
              {scoreRows.map(r => (
                <tr key={r.label} className="border-b border-[#E7EFEF]">
                  <td className="px-2 py-2 text-[#0F3A46]">{r.label}</td>
                  <td className="px-2 py-2 text-center font-medium text-[#0F3A46]">{r.score}</td>
                  <td className="px-2 py-2 text-center text-[#4A6572]">{r.max}</td>
                  <td className="px-2 py-2 text-center text-[#4A6572]">{(r.pct * 100).toFixed(1)}%</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`text-xs font-semibold ${
                      strength(r.pct) === "High" ? "text-[#2E7D5B]" :
                      strength(r.pct) === "Moderate" ? "text-[#7D6B2E]" : "text-[#B4463C]"
                    }`}>{strength(r.pct)}</span>
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F0F5F6]">
                <td className="px-2 py-2 font-bold text-[#0F3A46]">TOTAL</td>
                <td className="px-2 py-2 text-center font-bold text-[#0F3A46]">{a.total}</td>
                <td className="px-2 py-2 text-center font-bold text-[#0F3A46]">95</td>
                <td className="px-2 py-2 text-center font-bold text-[#0F3A46]">{(totPct * 100).toFixed(1)}%</td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-[#4A6572] mt-3">
            {a.answered}/19 questions answered{a.answered < 19 ? " — profile is provisional" : ""}.
          </p>
        </div>

        {/* Risk category bands */}
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">
            Risk category bands (total score 19–95)
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-2 py-1.5 font-medium rounded-tl-md">Score</th>
                <th className="text-left px-2 py-1.5 font-medium">Category</th>
                <th className="text-left px-2 py-1.5 font-medium rounded-tr-md">Indicative equity</th>
              </tr>
            </thead>
            <tbody>
              {BANDS.map(b => {
                const active = a.total >= b.min && a.total <= b.max;
                return (
                  <tr key={b.range} className={`border-b border-[#E7EFEF] ${active ? "bg-[#DDE6E8] font-semibold" : ""}`}>
                    <td className="px-2 py-2 text-[#0F3A46]">{b.range}</td>
                    <td className="px-2 py-2 text-[#0F3A46]">{b.label}</td>
                    <td className="px-2 py-2 text-[#4A6572]">{b.equity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Score vs Maximum chart */}
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Score vs Maximum</h3>
          <ScoreChart bars={[
            { label: "Capacity",  score: a.cap, max: 40 },
            { label: "Tolerance", score: a.tol, max: 35 },
            { label: "Knowledge", score: a.kn,  max: 20 },
          ]} />
        </div>
      </div>

      {/* — row 2: profile determination | allocation — */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Risk profile determination */}
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Risk profile determination</h3>
          <table className="w-full text-sm">
            <tbody>
              <DRow label="Total-score category"        value={totalBand(a.total)} />
              <DRow label="Capacity category (Q1–Q8)"   value={CATEGORIES[a.capR - 1]} />
              <DRow label="Tolerance category (Q9–Q15)" value={CATEGORIES[a.tolR - 1]} />
              <DRow label="Governing profile"           value={a.finalProfile} bold />
            </tbody>
          </table>
          {a.capR !== a.tolR && (
            <p className="text-xs text-[#7D6B2E] mt-3 bg-[#FEF9E7] rounded-lg px-3 py-2">
              Diverge — discussed with client. Lower of capacity vs willingness governs per SEBI guidelines.
            </p>
          )}
          <OverrideSelector
            clientId={id}
            currentOverride={client.risk_override ?? null}
            computedProfile={a.finalProfile}
            currentRationale={client.risk_override_rationale ?? null}
            overrideBy={client.risk_override_by ?? null}
            overrideAt={client.risk_override_at ?? null}
          />
        </div>

        {/* Model asset allocation */}
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Model asset allocation (starting framework)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-3 py-1.5 font-medium rounded-tl-md">Asset class</th>
                <th className="text-right px-3 py-1.5 font-medium rounded-tr-md">Allocation %</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Equity (domestic + international)", a.alloc[0]],
                ["Debt / Fixed income",               a.alloc[1]],
                ["Gold",                              a.alloc[2]],
                ["Cash / Liquid",                     a.alloc[3]],
              ].map(([cls, pct]) => (
                <tr key={cls as string} className="border-b border-[#E7EFEF]">
                  <td className="px-3 py-2 text-[#0F3A46]">{cls}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <div className="w-24 bg-[#E7EFEF] rounded-full h-2">
                        <div className="bg-[#175A69] h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right font-medium text-[#0F3A46]">{pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[#4A6572] mt-3">
            Starting framework only — adjust for client-specific constraints, liquidity needs, and tax position before finalising.
          </p>
        </div>
      </div>

      {/* — Red flags — */}
      {(badFlags.length > 0 || okFlags.length > 0) && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">
            Red flags &amp; suitability checks
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
              badFlags.length ? "bg-[#F8E7E4] text-[#B4463C]" : "bg-[#E4F1EA] text-[#2E7D5B]"
            }`}>{badFlags.length} flagged</span>
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {badFlags.map((f, i) => (
              <div key={i} className="flex gap-3 bg-[#F8E7E4] rounded-lg p-3 text-sm">
                <span className="text-[9px] font-bold text-[#B4463C] shrink-0 mt-0.5 tracking-wider">FLAG</span>
                <div>
                  <div className="font-medium text-[#0F3A46]">{f.name}{f.val ? ` — ${f.val}` : ""}</div>
                  <div className="text-xs text-[#4A6572] mt-0.5">{f.why}</div>
                </div>
              </div>
            ))}
            {okFlags.map((f, i) => (
              <div key={i} className="flex gap-2 items-center bg-[#E4F1EA] rounded-lg px-3 py-2 text-sm">
                <span className="text-[9px] font-bold text-[#2E7D5B] tracking-wider shrink-0">OK</span>
                <span className="text-[#0F3A46] font-medium">{f.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* — Goal funding — */}
      {a.goals.length > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Goal funding</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-[#0F3A46] text-white text-xs">
                  <th className="text-left px-3 py-1.5 font-medium">Goal</th>
                  <th className="text-center px-3 py-1.5 font-medium">Target year</th>
                  <th className="text-right px-3 py-1.5 font-medium">Value at target</th>
                  <th className="text-right px-3 py-1.5 font-medium">Projected path</th>
                  <th className="text-right px-3 py-1.5 font-medium">Gap</th>
                  <th className="text-right px-3 py-1.5 font-medium">Extra SIP/mo</th>
                </tr>
              </thead>
              <tbody>
                {a.goals.map(g => (
                  <tr key={g.goal_id} className="border-b border-[#E7EFEF]">
                    <td className="px-3 py-2 text-[#0F3A46]">{g.goal_name ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-[#4A6572]">{g.target_year}</td>
                    <td className="px-3 py-2 text-right text-[#0F3A46]">{fmt(g.fv)}</td>
                    <td className="px-3 py-2 text-right text-[#0F3A46]">{fmt(g.path)}</td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: g.gap > 0 ? "#B4463C" : "#2E7D5B" }}>
                      {g.gap > 0 ? fmt(g.gap) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[#0F3A46]">
                      {g.extraSip ? fmt(g.extraSip) : <span className="text-[#2E7D5B]">On track</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="py-2 text-[#4A6572] text-sm">{label}</td>
      <td className={`py-2 text-right text-sm ${bold ? "font-bold text-[#0F3A46]" : "text-[#0F3A46]"}`}>{value}</td>
    </tr>
  );
}
