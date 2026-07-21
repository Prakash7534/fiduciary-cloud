// lib/snapshot.ts
// Reusable snapshot creation (Fix #7). Previously only questionnaire-submit
// ever wrote a snapshots row, so History/Trend Analysis and the Advisory
// Report's review-comparison section never saw adviser-side events that
// materially change a client's advice basis — a risk profile override, or a
// recommendation/position actually being executed into the live portfolio.
// Any route can now call createSnapshot() after such an event.
import { analyseClient, financialPosition, scoreAnswers, goalCalc } from "@/lib/riskEngine";
import { resolveAssumptions } from "@/lib/assumptions";
import type { FinancialFacts, LoanRow, InvestmentRow, RiskAnswer, GoalRow, ClientRow } from "@/lib/riskEngine";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createSnapshot(
  supabase: SupabaseClient,
  clientId: string,
  sourceNote: string,
  extraRawData: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const [{ data: freshClient }, { data: freshFacts }, { data: freshAns },
           { data: freshLoans }, { data: freshInv }, { data: freshGoals }] = await Promise.all([
      supabase.from("clients").select("*").eq("client_id", clientId).single(),
      supabase.from("financial_facts").select("*").eq("client_id", clientId).maybeSingle(),
      supabase.from("risk_answers").select("*").eq("client_id", clientId),
      supabase.from("loans").select("*").eq("client_id", clientId),
      supabase.from("investments").select("*").eq("client_id", clientId),
      supabase.from("goals").select("*").eq("client_id", clientId),
    ]);
    if (!freshClient) return false;

    // Master planning assumptions for this client's adviser
    const { data: firmRow } = await supabase.from("firm_settings")
      .select("*").eq("user_id", (freshClient as { user_id?: string }).user_id ?? "").maybeSingle();
    const A = resolveAssumptions(firmRow as Record<string, unknown> | null);

    const ans = (freshAns ?? []) as RiskAnswer[];
    const sc = scoreAnswers(ans);
    const an = analyseClient(freshClient as ClientRow, freshFacts as FinancialFacts | null, ans,
      (freshLoans ?? []) as LoanRow[], (freshInv ?? []) as InvestmentRow[], (freshGoals ?? []) as GoalRow[], A);
    const fpos = financialPosition(freshFacts as FinancialFacts | null,
      (freshLoans ?? []) as LoanRow[], (freshInv ?? []) as InvestmentRow[]);
    const yr = new Date().getFullYear();
    const goalSnap = ((freshGoals ?? []) as GoalRow[]).map(g => {
      const gc = goalCalc(g, yr, A);
      return {
        name: g.goal_name, target_year: g.target_year, cost_today: g.cost_today,
        saved: g.saved, monthly_sip: g.monthly_sip,
        fv: Math.round(gc.fv), projected: Math.round(gc.path), gap: Math.round(gc.gap),
        extra_sip: Math.round(gc.extraSip),
        funded_pct: gc.fv > 0 ? Math.min(100, Math.round(gc.path / gc.fv * 100)) : 100,
      };
    });

    await supabase.from("snapshots").insert({
      client_id: clientId,
      snapshot_date: new Date().toISOString(),
      source_note: sourceNote,
      capacity_score: sc.cap, tolerance_score: sc.tol, knowledge_score: sc.kn,
      total_score: sc.cap + sc.tol + sc.kn,
      final_profile: an.finalProfile, answered_count: sc.answered,
      income: fpos.income, total_assets: fpos.totalAssets,
      total_debt: fpos.totalDebt, net_worth: fpos.netWorth,
      years_to_retirement: an.yearsToRetirement,
      red_flag_count: an.flags.filter(f => f.state === "bad").length,
      raw_data: {
        goals: goalSnap,
        flags: an.flags.filter(f => f.state === "bad").map(f => f.name),
        expenses_annual: freshFacts?.expenses_annual ?? null,
        life_cover: freshFacts?.life_cover ?? null,
        health_cover: freshFacts?.health_cover ?? null,
        loans_total: ((freshLoans ?? []) as LoanRow[]).reduce((s, l) => s + Number(l.outstanding ?? 0), 0),
        ...extraRawData,
      },
    });
    return true;
  } catch {
    return false; // snapshot failure must never block the caller's primary action
  }
}
