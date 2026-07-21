// app/(app)/clients/[id]/advisory-report/page.tsx — detailed audit-compliant advisory report
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { analyseClient, financialPosition, scoreAnswers, yearsBetween, goalCalc } from "@/lib/riskEngine";
import type { FinancialFacts, LoanRow, InvestmentRow, RiskAnswer, GoalRow } from "@/lib/riskEngine";
import { BASE_ALLOCATION } from "@/lib/allocationEngine";
import { buildGapPlan, currentValueByClass } from "@/lib/constructionEngine";
import { computeGoalLiveAmounts } from "@/lib/goalNetting";
import AdvisoryReportClient from "./_client";
import { resolveAssumptions } from "@/lib/assumptions";

const THIS_YEAR = new Date().getFullYear();

// Map riskEngine CATEGORIES → BASE_ALLOCATION keys
const PROFILE_TO_SAA: Record<string, string> = {
  "Conservative":            "Conservative",
  "Moderately Conservative": "Moderate Conservative",
  "Balanced / Moderate":     "Moderate",
  "Moderately Aggressive":   "Moderate Aggressive",
  "Aggressive":              "Aggressive",
};

export default async function AdvisoryReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const authUser = (await supabase.auth.getUser()).data.user;

  const [
    { data: client, error },
    { data: facts },
    { data: answersRaw },
    { data: loans },
    { data: investments },
    { data: goalsRaw },
    { data: firm },
    { data: positions },
    { data: holdings },
    { data: notes },
    { data: snapPair },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("risk_answers").select("*").eq("client_id", id),
    supabase.from("loans").select("*").eq("client_id", id),
    supabase.from("investments").select("*").eq("client_id", id),
    supabase.from("goals").select("*").eq("client_id", id).order("target_year"),
    supabase.from("firm_settings").select("*").eq("user_id", authUser?.id ?? "").maybeSingle(),
    supabase.from("portfolio_positions").select("*").eq("client_id", id),
    supabase.from("portfolio_holdings").select("*").eq("client_id", id),
    supabase.from("report_notes").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("snapshots").select("*").eq("client_id", id).order("snapshot_date", { ascending: false }).limit(2),
  ]);

  if (error || !client) notFound();
  const A = resolveAssumptions(firm as Record<string, unknown> | null);

  const answers = (answersRaw ?? []) as RiskAnswer[];
  const { cap, tol, kn, answered } = scoreAnswers(answers);
  const total = cap + tol + kn;

  const analysis = analyseClient(client, facts as FinancialFacts | null, answers,
    (loans ?? []) as LoanRow[], (investments ?? []) as InvestmentRow[], (goalsRaw ?? []) as GoalRow[], A);
  const fp = financialPosition(facts as FinancialFacts | null, (loans ?? []) as LoanRow[], (investments ?? []) as InvestmentRow[]);

  // Active profile (respects adviser override)
  const activeProfile = (client.risk_override as string | null) ?? analysis.finalProfile;
  const saaKey = PROFILE_TO_SAA[activeProfile] ?? "Moderate";
  const savedOv = client.allocation_overrides as Record<string, unknown> | null;
  const overrideAlloc = (savedOv?.asset_class as Record<string, number> | undefined) ?? null;
  const saa = overrideAlloc ?? BASE_ALLOCATION[saaKey];

  // ── Live portfolio: current value per class + gap analysis ────────────────
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

  // Overlap between declared investments and itemised holdings (same class) — avoid double count
  const declaredByClass: Record<string, number> = {};
  (investments ?? []).forEach((i: Record<string, unknown>) => {
    const acRaw = String(i.asset_class ?? "");
    const ac = /equity|stock/i.test(acRaw) ? "Equity" : /debt|bond|fd|savings|epf|ppf|nps|insurance|ulip/i.test(acRaw) ? "Debt"
      : /gold/i.test(acRaw) ? "Gold" : "Alternate";
    declaredByClass[ac] = (declaredByClass[ac] ?? 0) + Number(i.value ?? 0);
  });
  const declaredAtRep: Date | null = (investments ?? []).reduce<Date | null>((mx, i: Record<string, unknown>) => {
    const d2 = i.declared_at ? new Date(i.declared_at as string) : null;
    return d2 && (!mx || d2 > mx) ? d2 : mx;
  }, null);
  const holdOnlyByClass: Record<string, number> = {};
  holdRows.forEach(h => {
    const v = (h.current_value ?? 0) > 0 ? (h.current_value ?? 0) : h.lumpsum_invested;
    holdOnlyByClass[h.asset_class] = (holdOnlyByClass[h.asset_class] ?? 0) + v;
  });
  (positions ?? []).forEach(p2 => {
    if (p2.status !== "executed") return;
    const execAt = p2.executed_at ? new Date(p2.executed_at as string) : null;
    if (!declaredAtRep || !execAt || execAt > declaredAtRep) return;
    const v = Number(p2.current_value ?? 0) > 0 ? Number(p2.current_value) : Number(p2.executed_lumpsum ?? 0);
    const ac = String(p2.asset_class ?? "Equity");
    holdOnlyByClass[ac] = (holdOnlyByClass[ac] ?? 0) + v;
  });
  const assetOverlap = Object.keys(declaredByClass).reduce(
    (s, ac) => s + Math.min(declaredByClass[ac] ?? 0, holdOnlyByClass[ac] ?? 0), 0);

  // ── Goals with live-portfolio dynamics (same logic as Goal Calculator,
  //     netted against each goal's own declared_at — see lib/goalNetting.ts) ──
  const goals = (goalsRaw ?? []) as GoalRow[];
  const posForNetting = (positions ?? []).map((p: Record<string, unknown>) => ({
    goal_id: (p.goal_id as string | null) ?? null, status: (p.status as string | null) ?? null,
    executed_lumpsum: (p.executed_lumpsum as number | null) ?? null, executed_sip: (p.executed_sip as number | null) ?? null,
    current_value: (p.current_value as number | null) ?? null, executed_at: (p.executed_at as string | null) ?? null,
  }));
  const holdForNetting = (holdings ?? []).map((h: Record<string, unknown>) => ({
    current_value: (h.current_value as number | null) ?? null, lumpsum_invested: (h.lumpsum_invested as number | null) ?? null,
    monthly_sip: (h.monthly_sip as number | null) ?? null, added_at: (h.added_at as string | null) ?? null,
  }));
  const liveByGoal = computeGoalLiveAmounts(goals, posForNetting, holdForNetting, THIS_YEAR, A);

  const goalRows = goals.map(g => {
    const { liveSaved, liveSip } = liveByGoal[g.goal_id] ?? { liveSaved: 0, liveSip: 0 };
    const gLive = { ...g, saved: (g.saved ?? 0) + liveSaved, monthly_sip: (g.monthly_sip ?? 0) + liveSip };
    const c = goalCalc(gLive, THIS_YEAR, A);
    const r = (g.return_pct ?? A.defaultGoalReturn) / 100;
    const lumpsumNow = c.gap > 0 && c.years > 0 ? c.gap / Math.pow(1 + r, c.years) : 0;
    return {
      goal_name: g.goal_name, target_year: g.target_year, cost_today: g.cost_today,
      priority: g.priority, inflation_pct: g.inflation_pct ?? A.inflation, return_pct: g.return_pct ?? A.defaultGoalReturn,
      years: c.years, fv: Math.round(c.fv), projected: Math.round(c.path), gap: Math.round(c.gap),
      extraSip: Math.round(c.extraSip), lumpsumNow: Math.round(lumpsumNow),
      liveSaved: Math.round(liveSaved), liveSip: Math.round(liveSip),
      fundedPct: c.fv > 0 ? Math.min(100, Math.round(c.path / c.fv * 100)) : 100,
    };
  });

  const totalExtraSip   = goalRows.reduce((s, g) => s + g.extraSip, 0);
  const totalLumpsumNow = goalRows.reduce((s, g) => s + g.lumpsumNow, 0);

  // ── Proposed portfolio positions ───────────────────────────────────────────
  const proposedPositions = (positions ?? []).map(p => ({
    instrument_name: p.instrument_name as string, asset_class: p.asset_class as string,
    category: p.category as string | null, bucket: p.bucket as string,
    allocation_pct: Number(p.allocation_pct ?? 0),
    lumpsum_amount: Number(p.lumpsum_amount ?? 0), monthly_sip: Number(p.monthly_sip ?? 0),
    executed_lumpsum: Number(p.executed_lumpsum ?? 0), executed_sip: Number(p.executed_sip ?? 0),
    current_value: p.current_value != null ? Number(p.current_value) : null,
    status: p.status as string,
  }));

  const age = yearsBetween(client.dob);
  const now = new Date();
  const today = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const nextReview = new Date(now); nextReview.setFullYear(nextReview.getFullYear() + 1);
  const docId = `ADV-${client.client_code ?? id.slice(0,8).toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;

  // ── Review comparison (previous vs current snapshot) ──────────────────────
  type SnapRaw = { goals?: { name: string | null; funded_pct: number }[]; flags?: string[] } | null;
  const curSnap  = snapPair?.[0] ?? null;
  const prevSnap = snapPair?.[1] ?? null;
  const reviewCompare = curSnap && prevSnap ? {
    prevDate: new Date(prevSnap.snapshot_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    curDate:  new Date(curSnap.snapshot_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    prevProfile: prevSnap.final_profile as string | null, curProfile: curSnap.final_profile as string | null,
    prevScore: prevSnap.total_score as number | null, curScore: curSnap.total_score as number | null,
    prevNW: prevSnap.net_worth != null ? Number(prevSnap.net_worth) : null,
    curNW:  curSnap.net_worth != null ? Number(curSnap.net_worth) : null,
    prevIncome: prevSnap.income != null ? Number(prevSnap.income) : null,
    curIncome:  curSnap.income != null ? Number(curSnap.income) : null,
    prevFlags: prevSnap.red_flag_count as number | null, curFlags: curSnap.red_flag_count as number | null,
    goalProgress: (((curSnap.raw_data ?? {}) as SnapRaw)?.goals ?? []).map(g => {
      const pg = (((prevSnap.raw_data ?? {}) as SnapRaw)?.goals ?? []).find(x => x.name === g.name);
      return { name: g.name ?? "Goal", before: pg?.funded_pct ?? null, after: g.funded_pct };
    }),
  } : null;

  const reportData = {
    docId, today,
    nextReviewDefault: nextReview.toISOString().slice(0, 10),
    client: {
      full_name: client.full_name, client_code: client.client_code ?? null,
      dob: client.dob, age, gender: client.gender, marital_status: client.marital_status,
      occupation: client.occupation, pan: client.pan, email: client.email, phone: client.phone,
      dependants_detail: client.dependants_detail, address: client.address ?? null,
      residential_status: client.residential_status ?? null, client_type: client.client_type ?? null,
    },
    facts: {
      income_self: facts?.income_self ?? 0, income_spouse: facts?.income_spouse ?? 0,
      income_other: facts?.income_other ?? 0, expenses_annual: facts?.expenses_annual ?? 0,
      retirement_age: facts?.retirement_age ?? null, life_cover: facts?.life_cover ?? 0,
      health_cover: facts?.health_cover ?? 0, will_status: facts?.will_status ?? null,
      pep: facts?.pep ?? null, fatca: facts?.fatca ?? null,
    },
    scores: { cap, tol, kn, total, answered },
    analysis: {
      engineProfile: analysis.finalProfile,
      activeProfile,
      isOverridden: !!client.risk_override,
      overrideRationale: (client.risk_override_rationale as string | null) ?? null,
      overrideBy: (client.risk_override_by as string | null) ?? null,
      overrideAt: (client.risk_override_at as string | null) ?? null,
      capR: analysis.capR, tolR: analysis.tolR, govR: analysis.govR,
      yearsToRetirement: analysis.yearsToRetirement,
      flags: analysis.flags.filter(f => f.state === "bad").map(f => ({ name: f.name, val: f.val, why: f.why })),
      okFlags: analysis.flags.filter(f => f.state === "ok").length,
    },
    fp: { totalAssets: fp.totalAssets, totalDebt: fp.totalDebt, netWorth: fp.netWorth, income: fp.income },
    saa,
    isSaaOverridden: !!overrideAlloc,
    gapClasses: gapPlan.classes.map(g => ({
      assetClass: g.assetClass, targetPct: g.targetPct,
      currentValue: Math.round(g.currentValue), currentPct: Math.round(g.currentPct * 10) / 10,
      gapValue: Math.round(g.gapValue),
    })),
    totalCurrent: Math.round(gapPlan.totalCurrent),
    assetOverlap: Math.round(assetOverlap),
    goalRows, totalExtraSip, totalLumpsumNow,
    positions: proposedPositions,
    notes: {
      what_it_means: notes?.what_it_means ?? "", why_this_mix: notes?.why_this_mix ?? "",
      deployment_plan: notes?.deployment_plan ?? "", conflicts: notes?.conflicts ?? "",
      additional_comments: notes?.additional_comments ?? "",
      protect_actions: notes?.protect_actions ?? "",
      stabilise_actions: notes?.stabilise_actions ?? "",
      grow_actions: notes?.grow_actions ?? "",
      next_review_date: notes?.next_review_date ?? nextReview.toISOString().slice(0, 10),
      adv_summary: notes?.adv_summary ?? "",
      adv_client_profile: notes?.adv_client_profile ?? "",
      adv_considerations: notes?.adv_considerations ?? "",
      adv_suitability: notes?.adv_suitability ?? "",
      adv_next_steps: notes?.adv_next_steps ?? "",
    },
    firm: {
      advisor_name: firm?.advisor_name ?? null, firm_name: firm?.firm_name ?? null,
      sebi_regn: firm?.sebi_regn ?? null, address: firm?.address ?? null,
      phone: firm?.phone ?? null, email: firm?.email ?? null,
    },
    adviserEmail: authUser?.email ?? "",
    reviewCompare,
  };

  return <AdvisoryReportClient clientId={id} data={reportData} />;
}
