// app/(app)/clients/[id]/goals/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { goalCalc, profileFromAnswers, type GoalRow, type RiskAnswer } from "@/lib/riskEngine";
import { BASE_ALLOCATION, goalExpectedReturn } from "@/lib/allocationEngine";
import { computeGoalLiveAmounts } from "@/lib/goalNetting";
import { resolveAssumptions } from "@/lib/assumptions";
import RetirementPlanner from "./_retirement";

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
  const authUser = (await supabase.auth.getUser()).data.user;

  const [{ data: client, error }, { data: goalsRaw }, { data: answersRaw }, { data: facts }, { data: positions }, { data: holdings }] = await Promise.all([
    supabase.from("clients").select("full_name, dob, risk_override, allocation_overrides").eq("client_id", id).single(),
    supabase.from("goals").select("*").eq("client_id", id).order("target_year"),
    supabase.from("risk_answers").select("question_num, answer").eq("client_id", id),
    supabase.from("financial_facts").select("income_self, income_spouse, income_other, expenses_annual, retirement_age, life_expectancy, ret_pension, epf_nps_corpus, ret_expenses, retirement_replacement_pct").eq("client_id", id).maybeSingle(),
    supabase.from("portfolio_positions").select("goal_id, status, executed_lumpsum, executed_sip, current_value, executed_at").eq("client_id", id),
    supabase.from("portfolio_holdings").select("current_value, lumpsum_invested, monthly_sip, added_at").eq("client_id", id),
  ]);

  if (error || !client) notFound();
  const { data: firm } = await supabase.from("firm_settings").select("*").eq("user_id", authUser?.id ?? "").maybeSingle();
  const A = resolveAssumptions(firm as Record<string, unknown> | null);
  const PROFILE_TO_SAA: Record<string, string> = { "Conservative": "Conservative", "Moderately Conservative": "Moderate Conservative", "Balanced / Moderate": "Moderate", "Moderately Aggressive": "Moderate Aggressive", "Aggressive": "Aggressive" };
  const activeProfile = (client.risk_override as string | null) ?? profileFromAnswers((answersRaw ?? []).map(r => ({ question_num: r.question_num as number, answer: r.answer as RiskAnswer["answer"] })));
  const savedOv = client.allocation_overrides as Record<string, unknown> | null;
  const saa = ((savedOv?.asset_class as Record<string, number> | undefined) ?? BASE_ALLOCATION[PROFILE_TO_SAA[activeProfile] ?? "Moderate"]);

  const goals = (goalsRaw ?? []) as GoalRow[];
  const income = ((facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0)) / 12;
  const expenses = (facts?.expenses_annual ?? 0) / 12;
  const surplus = income - expenses;

  // ── Live portfolio values (netted against each goal's own declaration, so
  //     platform money the client already reported at their last review isn't
  //     added a second time — see lib/goalNetting.ts) ─────────────────────────
  const posForNetting = (positions ?? []).map(p => ({
    goal_id: p.goal_id as string | null, status: p.status as string | null,
    executed_lumpsum: p.executed_lumpsum as number | null, executed_sip: p.executed_sip as number | null,
    current_value: p.current_value as number | null, executed_at: p.executed_at as string | null,
  }));
  const holdForNetting = (holdings ?? []).map(h => ({
    current_value: h.current_value as number | null, lumpsum_invested: h.lumpsum_invested as number | null,
    monthly_sip: h.monthly_sip as number | null, added_at: h.added_at as string | null,
  }));
  const liveByGoal = computeGoalLiveAmounts(goals, posForNetting, holdForNetting, THIS_YEAR, A);
  const totalLiveValue = Object.values(liveByGoal).reduce((s, v) => s + v.liveSaved, 0);
  const totalLiveSip   = Object.values(liveByGoal).reduce((s, v) => s + v.liveSip, 0);

  const calcs = goals.map(g => {
    const { liveSaved, liveSip } = liveByGoal[g.goal_id] ?? { liveSaved: 0, liveSip: 0 };
    // Merge live portfolio into the goal's static questionnaire figures
    const gLive = { ...g,
      saved:       (g.saved ?? 0) + liveSaved,
      monthly_sip: (g.monthly_sip ?? 0) + liveSip,
    };
    const gret = g.return_pct ?? goalExpectedReturn(g.target_year, saa, A, THIS_YEAR);
    const c = goalCalc(gLive, THIS_YEAR, { ...A, defaultGoalReturn: gret });
    const r = gret / 100;
    const lumpsumNow = c.gap > 0 && c.years > 0 ? c.gap / Math.pow(1 + r, c.years) : 0;
    return { g: gLive, c, gret, lumpsumNow: Math.round(lumpsumNow), liveSaved: Math.round(liveSaved), liveSip: Math.round(liveSip) };
  });
  const totalExtraSip   = calcs.reduce((s, { c }) => s + c.extraSip, 0);
  const totalLumpsumNow = calcs.reduce((s, x) => s + x.lumpsumNow, 0);

  // ── Retirement corpus planner inputs (drawdown model) ─────────────────────
  const dob = client.dob ? new Date(client.dob as string) : null;
  const _now = new Date();
  let currentAge = 35;
  if (dob && !Number.isNaN(dob.getTime())) {
    currentAge = _now.getFullYear() - dob.getFullYear() - (_now < new Date(_now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
  }
  const retirementAge = Number(facts?.retirement_age ?? 60);
  const lifeExpectancy = Number(facts?.life_expectancy ?? A.lifeExpectancy);
  const impliedRepl = facts?.ret_expenses && facts?.expenses_annual
    ? Math.round((Number(facts.ret_expenses) * 12) / Number(facts.expenses_annual) * 100) : null;
  const replacementPct = facts?.retirement_replacement_pct != null
    ? Number(facts.retirement_replacement_pct)
    : (impliedRepl != null && impliedRepl >= 30 && impliedRepl <= 130 ? impliedRepl : A.replacementPct);
  const retYear = THIS_YEAR + Math.max(0, retirementAge - currentAge);
  const accReturn = goalExpectedReturn(retYear, saa, A, THIS_YEAR);
  const retGoal = goals.find(g => /retire/i.test(g.goal_name ?? ""));
  const retLive = retGoal ? (liveByGoal[retGoal.goal_id] ?? { liveSaved: 0, liveSip: 0 }) : { liveSaved: 0, liveSip: 0 };
  const existingRetSip = retGoal ? (retGoal.monthly_sip ?? 0) + retLive.liveSip : 0;
  const retirementBase = {
    currentAge, retirementAge, lifeExpectancy,
    currentMonthlyExpense: Math.round(expenses),
    replacementPct,
    inflationPct: A.inflation,
    accumulationReturnPct: Math.round(accReturn * 10) / 10,
    postRetReturnPct: A.postRetReturn,
    monthlyPensionNow: Number(facts?.ret_pension ?? 0),
    existingCorpus: Number(facts?.epf_nps_corpus ?? 0),
    existingMonthlySip: Math.round(existingRetSip),
    defLifeExpectancy: A.lifeExpectancy,
    defReplacementPct: A.replacementPct,
    defPostRet: A.postRetReturn,
  };

  const FUNDED_COLOR  = "#2E7D5B";
  const PARTIAL_COLOR = "#C39A38";
  const GAP_COLOR     = "#B4463C";

  return (
    <div className="space-y-5">

      {/* Summary header */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Goals on record</div>
          <div className="text-3xl font-bold font-serif text-[#0F3A46]">{goals.length}</div>
        </div>
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Live portfolio counted</div>
          <div className="font-bold text-[#0F3A46]">{totalLiveValue > 0 ? fmtCr(totalLiveValue) : "—"}</div>
          <div className="text-[10px] text-[#6B7E86] mt-0.5">{totalLiveSip > 0 ? "+ " + fmtCr(totalLiveSip) + "/mo executed SIP" : "no executed positions yet"}</div>
        </div>
        <div className={`border rounded-xl p-4 ${totalExtraSip > 0 ? "bg-[#FFF7F6] border-[#E4B3AE]" : "bg-[#E4F1EA] border-[#B3D9C3]"}`}>
          <div className="text-xs text-[#6B7E86] mb-1">Additional SIP needed across all goals</div>
          <div className={`font-bold ${totalExtraSip > 0 ? "text-[#B4463C]" : "text-[#2E7D5B]"}`}>
            {totalExtraSip > 0 ? fmtCr(totalExtraSip) + "/mo" : "All goals on track ✓"}
          </div>
        </div>
        <div className={`border rounded-xl p-4 ${totalLumpsumNow > 0 ? "bg-[#FFFBF2] border-[#E3D3A8]" : "bg-[#E4F1EA] border-[#B3D9C3]"}`}>
          <div className="text-xs text-[#6B7E86] mb-1">OR one-time lumpsum today (all goals)</div>
          <div className={`font-bold ${totalLumpsumNow > 0 ? "text-[#8A6D1C]" : "text-[#2E7D5B]"}`}>
            {totalLumpsumNow > 0 ? fmtCr(totalLumpsumNow) : "Nothing needed ✓"}
          </div>
          <div className="text-[10px] text-[#6B7E86] mt-0.5">invest now instead of extra SIP</div>
        </div>
      </div>

      {/* Retirement corpus planner — settable life expectancy, drawdown model */}
      <RetirementPlanner clientId={id} base={retirementBase} />

      {goals.length === 0 ? (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 text-center">
          <p className="text-[#6B7E86]">No goals recorded yet — upload a completed questionnaire to populate goals.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {calcs.map(({ g, c, gret, lumpsumNow, liveSaved, liveSip }, i) => {
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
                    <div className="text-xs text-[#6B7E86] mb-1">Future cost ({g.inflation_pct ?? A.inflation}% p.a.)</div>
                    <div className="font-semibold text-[#0F3A46]">{fmtCr(c.fv)}</div>
                  </div>
                  <div className="bg-[#F5F9FA] rounded-lg p-3">
                    <div className="text-xs text-[#6B7E86] mb-1">Saved (incl. live portfolio)</div>
                    <div className="font-semibold text-[#0F3A46]">{g.saved ? fmtCr(g.saved) : "—"}</div>
                    {liveSaved > 0 && <div className="text-[10px] text-[#175A69] mt-0.5">↳ {fmtCr(liveSaved)} from portfolio</div>}
                  </div>
                  <div className="bg-[#F5F9FA] rounded-lg p-3">
                    <div className="text-xs text-[#6B7E86] mb-1">SIP (incl. live portfolio)</div>
                    <div className="font-semibold text-[#0F3A46]">{g.monthly_sip ? fmtCr(g.monthly_sip) + "/mo" : "—"}</div>
                    {liveSip > 0 && <div className="text-[10px] text-[#175A69] mt-0.5">↳ {fmtCr(liveSip)}/mo from portfolio</div>}
                  </div>
                </div>

                {/* Gap / extra SIP */}
                {c.gap > 0 && (
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2 bg-[#FFF7F6] border border-[#E4B3AE] rounded-lg px-4 py-2.5">
                    <div>
                      <span className="text-xs text-[#6B7E86]">Shortfall: </span>
                      <span className="text-sm font-bold text-[#B4463C]">{fmtCr(c.gap)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-[#6B7E86]">Additional SIP: </span>
                      <span className="text-sm font-bold text-[#B4463C]">{fmtCr(c.extraSip)}/mo</span>
                    </div>
                    <div>
                      <span className="text-xs text-[#6B7E86]">OR lumpsum today: </span>
                      <span className="text-sm font-bold text-[#8A6D1C]">{fmtCr(lumpsumNow)}</span>
                    </div>
                    <div className="text-xs text-[#6B7E86]">@ {Math.round(gret * 10) / 10}% p.a. (SAA blend)</div>
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
        <strong className="text-[#0F3A46]">Assumptions:</strong> Figures are dynamic — executed portfolio positions (current value &amp; SIP) are counted toward goals: positions linked to a goal count fully to it; unlinked positions and existing holdings are apportioned across goals by target size. Inflation per goal defaults to 6% p.a. unless specified in questionnaire.
        Return assumption defaults to 10% p.a. Projections are indicative — actual returns will vary.
        Past SIP contributions are assumed to have grown at the stated return rate.
      </div>
    </div>
  );
}
