// app/(app)/clients/[id]/notes/page.tsx — Advisory Notes workspace (server)
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import {
  analyseClient, financialPosition, scoreAnswers, goalCalc,
  type FinancialFacts, type LoanRow, type InvestmentRow, type RiskAnswer, type GoalRow,
} from "@/lib/riskEngine";
import { BASE_ALLOCATION } from "@/lib/allocationEngine";
import { buildGapPlan, currentValueByClass } from "@/lib/constructionEngine";
import { computeGoalLiveAmounts } from "@/lib/goalNetting";
import { buildAdvisoryAssist, type AdvisoryAssistInput } from "@/lib/advisoryNotes";
import AdvisoryNotesClient from "./_client";

const THIS_YEAR = new Date().getFullYear();
const PROFILE_TO_SAA: Record<string, string> = {
  "Conservative": "Conservative", "Moderately Conservative": "Moderate Conservative",
  "Balanced / Moderate": "Moderate", "Moderately Aggressive": "Moderate Aggressive", "Aggressive": "Aggressive",
};

export default async function AdvisoryNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: client, error },
    { data: facts },
    { data: answersRaw },
    { data: loans },
    { data: investments },
    { data: goalsRaw },
    { data: positions },
    { data: holdings },
    { data: recos },
    { data: notes },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("risk_answers").select("*").eq("client_id", id),
    supabase.from("loans").select("*").eq("client_id", id),
    supabase.from("investments").select("*").eq("client_id", id),
    supabase.from("goals").select("*").eq("client_id", id).order("target_year"),
    supabase.from("portfolio_positions").select("*").eq("client_id", id),
    supabase.from("portfolio_holdings").select("*").eq("client_id", id),
    supabase.from("recommendations").select("status").eq("client_id", id),
    supabase.from("report_notes").select("*").eq("client_id", id).maybeSingle(),
  ]);

  if (error || !client) notFound();

  const answers = (answersRaw ?? []) as RiskAnswer[];
  const { cap, tol, kn, answered } = scoreAnswers(answers);
  const analysis = analyseClient(client, facts as FinancialFacts | null, answers,
    (loans ?? []) as LoanRow[], (investments ?? []) as InvestmentRow[], (goalsRaw ?? []) as GoalRow[]);
  const fp = financialPosition(facts as FinancialFacts | null, (loans ?? []) as LoanRow[], (investments ?? []) as InvestmentRow[]);

  const activeProfile = (client.risk_override as string | null) ?? analysis.finalProfile;
  const savedOv = client.allocation_overrides as Record<string, unknown> | null;
  const overrideAlloc = (savedOv?.asset_class as Record<string, number> | undefined) ?? null;
  const saa = overrideAlloc ?? BASE_ALLOCATION[PROFILE_TO_SAA[activeProfile] ?? "Moderate"];

  // portfolio posture
  const posRows = (positions ?? []).map(p => ({
    asset_class: p.asset_class as string, status: p.status as string,
    executed_lumpsum: Number(p.executed_lumpsum ?? 0), current_value: p.current_value != null ? Number(p.current_value) : null,
  }));
  const holdRows = (holdings ?? []).map(h => ({
    asset_class: h.asset_class as string, current_value: h.current_value != null ? Number(h.current_value) : null,
    lumpsum_invested: Number(h.lumpsum_invested ?? 0),
  }));
  const curByClass = currentValueByClass(posRows, holdRows);
  const gapPlan = buildGapPlan(saa, curByClass, 0, 0);
  const under = [...gapPlan.classes].filter(c => c.gapValue > 0).sort((a, b) => b.gapValue - a.gapValue)[0] ?? null;
  const over = [...gapPlan.classes].filter(c => c.gapValue < 0).sort((a, b) => a.gapValue - b.gapValue)[0] ?? null;
  const executedValue = posRows.filter(p => p.status === "executed")
    .reduce((s, p) => s + ((p.current_value ?? 0) > 0 ? (p.current_value ?? 0) : p.executed_lumpsum), 0)
    + holdRows.reduce((s, h) => s + ((h.current_value ?? 0) > 0 ? (h.current_value ?? 0) : h.lumpsum_invested), 0);
  const pendingRecos = (recos ?? []).filter(r => r.status === "recommended").length;

  // goals with live netting (same basis as report / goals page)
  const goals = (goalsRaw ?? []) as GoalRow[];
  const posNet = (positions ?? []).map(p => ({
    goal_id: (p.goal_id as string | null) ?? null, status: (p.status as string | null) ?? null,
    executed_lumpsum: (p.executed_lumpsum as number | null) ?? null, executed_sip: (p.executed_sip as number | null) ?? null,
    current_value: (p.current_value as number | null) ?? null, executed_at: (p.executed_at as string | null) ?? null,
  }));
  const holdNet = (holdings ?? []).map(h => ({
    current_value: (h.current_value as number | null) ?? null, lumpsum_invested: (h.lumpsum_invested as number | null) ?? null,
    monthly_sip: (h.monthly_sip as number | null) ?? null, added_at: (h.added_at as string | null) ?? null,
  }));
  const live = computeGoalLiveAmounts(goals, posNet, holdNet, THIS_YEAR);
  let totalExtraSip = 0, totalLumpsumNow = 0;
  const goalItems = goals.map(g => {
    const l = live[g.goal_id] ?? { liveSaved: 0, liveSip: 0 };
    const gLive = { ...g, saved: (g.saved ?? 0) + l.liveSaved, monthly_sip: (g.monthly_sip ?? 0) + l.liveSip };
    const c = goalCalc(gLive, THIS_YEAR);
    const r = (g.return_pct ?? 10) / 100;
    totalExtraSip += c.extraSip;
    totalLumpsumNow += c.gap > 0 && c.years > 0 ? c.gap / Math.pow(1 + r, c.years) : 0;
    return { name: g.goal_name ?? "Goal", fundedPct: c.fv > 0 ? Math.min(100, Math.round(c.path / c.fv * 100)) : 100, gap: Math.round(c.gap), targetYear: g.target_year };
  });

  const f = (facts ?? {}) as Record<string, unknown>;
  const firstName = (client.full_name ?? "").trim().split(/\s+/)[0] ?? "";

  const assistInput: AdvisoryAssistInput = {
    clientName: client.full_name ?? "", firstName,
    activeProfile, engineProfile: analysis.finalProfile,
    isOverridden: !!client.risk_override,
    overrideRationale: (client.risk_override_rationale as string | null) ?? null,
    capRank: analysis.capR, tolRank: analysis.tolR,
    age: analysis.age, yearsToRetirement: analysis.yearsToRetirement,
    annualIncome: fp.income, monthlySurplus: fp.surplus != null ? Math.round(fp.surplus / 12) : null,
    totalAssets: fp.totalAssets, totalDebt: fp.totalDebt, netWorth: fp.netWorth, debtToIncome: fp.debtToIncome,
    lifeCover: Number(f.life_cover ?? 0), healthCover: Number(f.health_cover ?? 0),
    flags: analysis.flags.filter(fl => fl.state === "bad").map(fl => ({ name: fl.name, val: fl.val, why: fl.why })),
    okFlagCount: analysis.flags.filter(fl => fl.state === "ok").length,
    goals: goalItems,
    totalExtraSip: Math.round(totalExtraSip), totalLumpsumNow: Math.round(totalLumpsumNow),
    saaDriftPct: gapPlan.postLumpsumDriftPct,
    topUnderweight: under ? { assetClass: under.assetClass, gapValue: Math.round(under.gapValue) } : null,
    topOverweight: over ? { assetClass: over.assetClass, gapValue: Math.round(over.gapValue) } : null,
    pendingRecos, executedValue: Math.round(executedValue),
    prefs: {
      style_pref: f.style_pref as string, esg_pref: f.esg_pref as string, intl_pref: f.intl_pref as string,
      sector_pref: f.sector_pref as string, restrictions: f.restrictions as string, review_freq: f.review_freq as string,
      decision_maker: f.decision_maker as string, monitor_frequency: f.monitor_frequency as string,
      past_experience: f.past_experience as string, income_need: f.income_need as string,
      investment_horizon: f.investment_horizon as string, most_important_goal: f.most_important_goal as string,
      reason_for_investing: f.reason_for_investing as string, invest_mode: f.invest_mode as string,
    },
    behaviour: {},
  };

  const bundle = buildAdvisoryAssist(assistInput);

  const initial = {
    adv_summary: notes?.adv_summary ?? "",
    adv_client_profile: notes?.adv_client_profile ?? "",
    adv_considerations: notes?.adv_considerations ?? "",
    adv_suitability: notes?.adv_suitability ?? "",
    adv_next_steps: notes?.adv_next_steps ?? "",
  };

  return (
    <AdvisoryNotesClient
      clientId={id}
      clientName={client.full_name ?? ""}
      profile={activeProfile}
      answered={answered}
      totalQuestions={19}
      scores={{ cap, tol, kn }}
      bundle={bundle}
      initial={initial}
    />
  );
}
