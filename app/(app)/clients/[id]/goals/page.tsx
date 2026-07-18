// app/(app)/clients/[id]/goals/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { goalCalc, type GoalRow } from "@/lib/riskEngine";

const THIS_YEAR = new Date().getFullYear();

function fmtCr(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function ProgressBar({ pct, color = "#175A69" }: { pct: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full bg-[#E7EFEF] rounded-full h-2">
      <div className="h-2 rounded-full transition-all" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}

export default async function GoalCalculatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: goalsRaw }, { data: facts }] = await Promise.all([
    supabase.from("clients").select("full_name, dob").eq("client_id", id).single(),
    supabase.from("goals").select("*").eq("client_id", id).order("target_year"),
    supabase.from("financial_facts").select("income_self, income_spouse, income_other, expenses_annual").eq("client_id", id).maybeSingle(),
  ]);

  if (error || !client) notFound();

  const goals = (goalsRaw ?? []) as GoalRow[];
  const income = ((facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0)) / 12;
  const expenses = (facts?.expenses_annual ?? 0) / 12;
  const surplus = income - expenses;

  const calcs = goals.map(g => ({ g, c: goalCalc(g, THIS_YEAR) }));
  const totalExtraSip = calcs.reduce((s, { c }) => s + c.extraSip, 0);

  const FUNDED_COLOR  = "#2E7D5B";
  const PARTIAL_COLOR = "#C39A38";
  const GAP_COLOR     = "#B4463C";

  return (
    <div className="space-y-5">

      {/* Summary header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Goals on record</div>
          <div className="text-3xl font-bold font-serif text-[#0F3A46]">{goals.length}</div>
        </div>
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Monthly surplus available</div>
          <div className="font-bold text-[#0F3A46]">{surplus > 0 ? fmtCr(surplus) : "—"}</div>
        </div>
        <div className={`border rounded-xl p-4 ${totalExtraSip > 0 ? "bg-[#FFF7F6] border-[#E4B3AE]" : "bg-[#E4F1EA] border-[#B3D9C3]"}`}>
          <div className="text-xs text-[#6B7E86] mb-1">Additional SIP needed across all goals</div>
          <div className={`font-bold ${totalExtraSip > 0 ? "text-[#B4463C]" : "text-[#2E7D5B]"}`}>
            {totalExtraSip > 0 ? fmtCr(totalExtraSip) + "/mo" : "All goals on track ✓"}
          </div>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 text-center">
          <p className="text-[#6B7E86]">No goals recorded yet — upload a completed questionnaire to populate goals.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {calcs.map(({ g, c }, i) => {
            const fundedPct = c.fv > 0 ? Math.min(100, (c.path / c.fv) * 100) : 100;
            const isFunded = c.gap === 0;
            const barColor = fundedPct >= 90 ? FUNDED_COLOR : fundedPct >= 50 ? PARTIAL_COLOR : GAP_COLOR;
            const years = c.years;

            return (
              <div key={g.goal_id} className="bg-white border border-[#CBD9DC] rounded-xl p-5">
                {/* Goal header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-semibold text-[#0F3A46]">{g.goal_name ?? `Goal ${i + 1}`}</h3>
                    <p className="text-xs text-[#6B7E86] mt-0.5">
                      Target: {g.target_year ?? "—"} · {years} {years === 1 ? "year" : "years"} away
                      {g.priority && ` · Priority: ${g.priority}`}
                      {g.flexibility && ` · ${g.flexibility}`}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                    isFunded ? "bg-[#E4F1EA] text-[#2E7D5B]" : fundedPct >= 50 ? "bg-[#FEF9E7] text-[#7D6B2E]" : "bg-[#F8E7E4] text-[#B4463C]"
                  }`}>
                    {isFunded ? "On track" : fundedPct >= 50 ? "Partial" : "Shortfall"}
                  </span>
                </div>

                {/* Funding progress */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-[#6B7E86] mb-1">
                    <span>Projected corpus: {fmtCr(c.path)}</span>
                    <span>Target (inflation-adj): {fmtCr(c.fv)}</span>
                  </div>
                  <ProgressBar pct={fundedPct} color={barColor} />
                  <div className="text-right text-xs mt-0.5" style={{ color: barColor }}>
                    {fundedPct.toFixed(0)}% funded
                  </div>
                </div>

                {/* Numbers grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="bg-[#F5F9FA] rounded-lg p-3">
                    <div className="text-xs text-[#6B7E86] mb-1">Cost today</div>
                    <div className="font-semibold text-[#0F3A46]">{fmtCr(g.cost_today ?? 0)}</div>
                  </div>
                  <div className="bg-[#F5F9FA] rounded-lg p-3">
                    <div className="text-xs text-[#6B7E86] mb-1">Future cost ({g.inflation_pct ?? 6}% p.a.)</div>
                    <div className="font-semibold text-[#0F3A46]">{fmtCr(c.fv)}</div>
                  </div>
                  <div className="bg-[#F5F9FA] rounded-lg p-3">
                    <div className="text-xs text-[#6B7E86] mb-1">Already saved</div>
                    <div className="font-semibold text-[#0F3A46]">{g.saved ? fmtCr(g.saved) : "—"}</div>
                  </div>
                  <div className="bg-[#F5F9FA] rounded-lg p-3">
                    <div className="text-xs text-[#6B7E86] mb-1">Current SIP</div>
                    <div className="font-semibold text-[#0F3A46]">{g.monthly_sip ? fmtCr(g.monthly_sip) + "/mo" : "—"}</div>
                  </div>
                </div>

                {/* Gap / extra SIP */}
                {c.gap > 0 && (
                  <div className="mt-3 flex items-center justify-between bg-[#FFF7F6] border border-[#E4B3AE] rounded-lg px-4 py-2.5">
                    <div>
                      <span className="text-xs text-[#6B7E86]">Shortfall: </span>
                      <span className="text-sm font-bold text-[#B4463C]">{fmtCr(c.gap)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-[#6B7E86]">Additional SIP needed: </span>
                      <span className="text-sm font-bold text-[#B4463C]">{fmtCr(c.extraSip)}/mo</span>
                    </div>
                    <div className="text-xs text-[#6B7E86]">@ {g.return_pct ?? 10}% p.a.</div>
                  </div>
                )}
                {c.gap === 0 && (
                  <div className="mt-3 bg-[#E4F1EA] border border-[#B3D9C3] rounded-lg px-4 py-2 text-xs text-[#2E7D5B] font-medium">
                    ✓ Projected corpus covers the goal — no additional SIP required at current return assumption.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assumptions note */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-4 text-xs text-[#6B7E86]">
        <strong className="text-[#0F3A46]">Assumptions:</strong> Inflation per goal defaults to 6% p.a. unless specified in questionnaire.
        Return assumption defaults to 10% p.a. Projections are indicative — actual returns will vary.
        Past SIP contributions are assumed to have grown at the stated return rate.
      </div>
    </div>
  );
}
