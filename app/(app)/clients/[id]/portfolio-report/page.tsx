// app/(app)/clients/[id]/portfolio-report/page.tsx
// Portfolio Advisory Report — justifies the CONSTRUCTED portfolio (why this mix)
// and lets the adviser cite the prior advisory report(s) that preceded it.
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import {
  analyseClient, financialPosition, insuranceAnalysis, debtsBreakdown,
  scoreAnswers, yearsBetween, goalCalc,
} from "@/lib/riskEngine";
import type { FinancialFacts, LoanRow, InvestmentRow, RiskAnswer, GoalRow } from "@/lib/riskEngine";
import { BASE_ALLOCATION, goalExpectedReturn } from "@/lib/allocationEngine";
import { currentValueByClass } from "@/lib/constructionEngine";
import { computeGoalLiveAmounts } from "@/lib/goalNetting";
import { resolveAssumptions } from "@/lib/assumptions";
import { retirementCorpus } from "@/lib/retirement";
import { buildRetirementInput, isRetirementGoal } from "@/lib/retirementInput";
import PortfolioReportClient from "./_client";

const THIS_YEAR = new Date().getFullYear();

const PROFILE_TO_SAA: Record<string, string> = {
  "Conservative": "Conservative",
  "Moderately Conservative": "Moderate Conservative",
  "Balanced / Moderate": "Moderate",
  "Moderately Aggressive": "Moderate Aggressive",
  "Aggressive": "Aggressive",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  questionnaire_submitted: "Questionnaire — client submission (signed source)",
  review_submitted: "Periodic review — client submission (signed source)",
  questionnaire_blank_issued: "Questionnaire — blank form issued",
  review_blank_issued: "Periodic review — blank form issued",
  recommendation_report: "Recommendation report",
  advisory_report: "Advisory report",
};

export default async function PortfolioReportPage({ params }: { params: Promise<{ id: string }> }) {
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
    { data: docsRaw },
    { data: snapsRaw },
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
    supabase.from("document_archive").select("doc_id, doc_type, file_name, created_at").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("snapshots").select("snapshot_id, snapshot_date, source_note, final_profile").eq("client_id", id).order("snapshot_date", { ascending: false }).limit(12),
  ]);

  if (error || !client) notFound();
  const A = resolveAssumptions(firm as Record<string, unknown> | null);
  const factsT = facts as FinancialFacts | null;

  const answers = (answersRaw ?? []) as RiskAnswer[];
  const { cap, tol, kn } = scoreAnswers(answers);

  const analysis = analyseClient(client, factsT, answers,
    (loans ?? []) as LoanRow[], (investments ?? []) as InvestmentRow[], (goalsRaw ?? []) as GoalRow[], A);
  const fp = financialPosition(factsT, (loans ?? []) as LoanRow[], (investments ?? []) as InvestmentRow[]);
  const ins = insuranceAnalysis(factsT);
  const debts = debtsBreakdown(factsT, (loans ?? []) as LoanRow[]);

  const activeProfile = (client.risk_override as string | null) ?? analysis.finalProfile;
  const saaKey = PROFILE_TO_SAA[activeProfile] ?? "Moderate";
  const savedOv = client.allocation_overrides as Record<string, unknown> | null;
  const overrideAlloc = (savedOv?.asset_class as Record<string, number> | undefined) ?? null;
  const saa = overrideAlloc ?? BASE_ALLOCATION[saaKey];

  // ── Live portfolio value per class + gap (target vs current) ───────────────
  const posRows = (positions ?? []).map(p => ({
    asset_class: p.asset_class as string, status: p.status as string,
    executed_lumpsum: Number(p.executed_lumpsum ?? 0), current_value: p.current_value != null ? Number(p.current_value) : null,
  }));
  const holdRows = (holdings ?? []).map(h => ({
    asset_class: h.asset_class as string, current_value: h.current_value != null ? Number(h.current_value) : null,
    lumpsum_invested: Number(h.lumpsum_invested ?? 0),
  }));
  const curByClass = currentValueByClass(posRows, holdRows);
  const totalCurrent = Object.values(curByClass).reduce((s, v) => s + v, 0);
  const allClasses = Array.from(new Set([...Object.keys(saa), ...Object.keys(curByClass)]));
  const gapClasses = allClasses.map(ac => {
    const targetPct = saa[ac] ?? 0;
    const currentValue = curByClass[ac] ?? 0;
    const currentPct = totalCurrent > 0 ? (currentValue / totalCurrent) * 100 : 0;
    const targetValue = totalCurrent * targetPct / 100;
    return { assetClass: ac, targetPct, currentValue, currentPct, gapValue: targetValue - currentValue };
  }).sort((a, b) => b.targetPct - a.targetPct);

  // ── Goals with live-portfolio dynamics (same basis as Goal Calculator) ─────
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
    const gret = g.return_pct ?? goalExpectedReturn(g.target_year, saa, A, THIS_YEAR);
    const c = goalCalc(gLive, THIS_YEAR, { ...A, defaultGoalReturn: gret });
    return {
      goal_name: g.goal_name, target_year: g.target_year, priority: g.priority,
      return_pct: gret, years: c.years, fv: Math.round(c.fv), projected: Math.round(c.path),
      gap: Math.round(c.gap), extraSip: Math.round(c.extraSip),
      fundedPct: c.fv > 0 ? Math.min(100, Math.round(c.path / c.fv * 100)) : 100,
    };
  });

  // Retirement goal sized by the drawdown + EPF engine
  const retGoal = goals.find(isRetirementGoal);
  const retLiveSip = retGoal ? (liveByGoal[retGoal.goal_id]?.liveSip ?? 0) : 0;
  const retInput = buildRetirementInput(facts as Record<string, unknown> | null, (client.dob as string | null) ?? null, goals, retLiveSip, saa, A, THIS_YEAR);
  const retResult = retGoal ? retirementCorpus(retInput) : null;
  if (retGoal && retResult) {
    const gr = goalRows.find(r => isRetirementGoal({ goal_name: r.goal_name }));
    if (gr) {
      gr.fv = retResult.corpusRequired; gr.projected = retResult.projectedCorpus;
      gr.gap = retResult.shortfall; gr.extraSip = retResult.requiredMonthlySip;
      gr.fundedPct = retResult.fundedPct > 100 ? 100 : retResult.fundedPct;
    }
  }

  // ── Constructed positions ──────────────────────────────────────────────────
  const positionsOut = (positions ?? []).map(p => ({
    instrument_name: (p.instrument_name as string) ?? "—", asset_class: (p.asset_class as string) ?? "—",
    category: p.category as string | null, bucket: (p.bucket as string) ?? "",
    allocation_pct: Number(p.allocation_pct ?? 0),
    lumpsum_amount: Number(p.lumpsum_amount ?? 0), monthly_sip: Number(p.monthly_sip ?? 0),
    executed_lumpsum: Number(p.executed_lumpsum ?? 0), executed_sip: Number(p.executed_sip ?? 0),
    current_value: p.current_value != null ? Number(p.current_value) : null,
    status: (p.status as string) ?? "recommended",
  }));
  const totalDeploy = positionsOut.reduce((s, p) => s + p.lumpsum_amount, 0);
  const totalSip = positionsOut.reduce((s, p) => s + p.monthly_sip, 0);
  const totalExecuted = positionsOut.reduce((s, p) => s + p.executed_lumpsum, 0);

  // ── Prerequisite prior actions (advised before portfolio construction) ─────
  const f = (facts ?? {}) as Record<string, unknown>;
  const monthlyExpense = fp.annualExpenses != null ? fp.annualExpenses / 12 : null;
  const emgMonths = Number(f.emergency_months ?? 0) || 0;
  const prerequisites = [
    {
      label: "Emergency fund (3–6 months of expenses)",
      status: emgMonths >= 6 ? "Met" : emgMonths >= 3 ? "Partial" : "Action needed",
      detail: monthlyExpense
        ? `${emgMonths || "—"} month(s) maintained vs ~6-month target (≈ ₹${Math.round(monthlyExpense * 6).toLocaleString("en-IN")}). Keep this liquid buffer outside the invested portfolio.`
        : `${emgMonths || "—"} month(s) recorded. Keep a 3–6 month buffer liquid, outside the portfolio.`,
    },
    {
      label: "Life insurance (term cover ≈ 10× income)",
      status: ins.lifeGap <= 0 ? "Met" : "Action needed",
      detail: ins.lifeGap > 0
        ? `Cover short by ≈ ₹${Math.round(ins.lifeGap).toLocaleString("en-IN")} (held ₹${Math.round(ins.lifeCurrent).toLocaleString("en-IN")} vs ₹${Math.round(ins.lifeRequired).toLocaleString("en-IN")} required). Close before committing surplus to market risk.`
        : `Adequate term cover in place (₹${Math.round(ins.lifeCurrent).toLocaleString("en-IN")}).`,
    },
    {
      label: "Health insurance (family floater)",
      status: (ins.healthCover ?? 0) >= 500000 ? "Met" : (ins.healthCover ?? 0) > 0 ? "Partial" : "Action needed",
      detail: (ins.healthCover ?? 0) > 0
        ? `Health cover ₹${Math.round(ins.healthCover ?? 0).toLocaleString("en-IN")}${(ins.healthCover ?? 0) < 500000 ? " — consider raising to ≥ ₹5L given medical inflation." : "."}`
        : `No health cover recorded — add a family floater before investing surplus.`,
    },
    {
      label: "High-cost / unsecured debt cleared",
      status: (debts.unsecuredDebt ?? 0) <= 0 && (fp.emiToIncome ?? 0) <= 0.36 ? "Met" : "Action needed",
      detail: (debts.unsecuredDebt ?? 0) > 0
        ? `Unsecured / high-cost debt ₹${Math.round(debts.unsecuredDebt).toLocaleString("en-IN")} outstanding — prepay before fresh market investment (post-tax returns rarely beat loan rates).`
        : fp.emiToIncome != null && fp.emiToIncome > 0.36
          ? `EMI burden ${(fp.emiToIncome * 100).toFixed(0)}% of income (> 36%) — reduce before scaling investments.`
          : `No high-cost debt flagged; EMI burden within norms.`,
    },
  ];

  // ── Prior reports available to cite (adviser picks) ────────────────────────
  const priorReports = (docsRaw ?? []).map((d: Record<string, unknown>) => ({
    id: String(d.doc_id),
    docType: String(d.doc_type),
    label: DOC_TYPE_LABEL[String(d.doc_type)] ?? String(d.doc_type),
    fileName: (d.file_name as string) ?? null,
    date: d.created_at ? new Date(d.created_at as string).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—",
  }));
  const priorSnapshots = (snapsRaw ?? []).map((s: Record<string, unknown>) => ({
    id: String(s.snapshot_id),
    note: (s.source_note as string) ?? "Snapshot",
    profile: (s.final_profile as string) ?? null,
    date: s.snapshot_date ? new Date(s.snapshot_date as string).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—",
  }));

  const now = new Date();
  const today = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const docId = `PAR-${client.client_code ?? id.slice(0, 8).toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  return (
    <PortfolioReportClient
      d={{
        docId, today,
        client: {
          full_name: client.full_name as string, client_code: (client.client_code as string) ?? null,
          pan: (client.pan as string) ?? null, age: yearsBetween(client.dob),
        },
        firm: {
          firm_name: (firm?.firm_name as string) ?? null, sebi_regn: (firm?.sebi_regn as string) ?? null,
          advisor_name: (firm?.advisor_name as string) ?? null,
          address: (firm?.address as string) ?? null, phone: (firm?.phone as string) ?? null, email: (firm?.email as string) ?? null,
        },
        activeProfile, saaKey, isSaaOverridden: overrideAlloc != null,
        scores: { cap, tol, kn, total: cap + tol + kn },
        saa,
        gapClasses, totalCurrent,
        goalRows,
        positions: positionsOut, totalDeploy, totalSip, totalExecuted,
        prerequisites,
        fp: { netWorth: fp.netWorth, income: fp.income, emiToIncome: fp.emiToIncome, surplus: fp.surplus },
        priorReports, priorSnapshots,
      }}
    />
  );
}
