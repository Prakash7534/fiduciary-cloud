import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { profileFromAnswers } from "@/lib/riskEngine";
import type { RiskAnswer } from "@/lib/riskEngine";
import { buildAllocationPlan, BASE_ALLOCATION, type UniverseRow, type GoalInput } from "@/lib/allocationEngine";
import { totalRequiredSip } from "@/lib/goalSip";
import type { GoalRow } from "@/lib/riskEngine";
import AssetAllocClient from "./_client";
import { resolveAssumptions } from "@/lib/assumptions";

export default async function AssetAllocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const authUser = (await supabase.auth.getUser()).data.user;

  const [
    { data: client, error },
    { data: answersRaw },
    { data: goalsRaw },
    { data: facts },
    { data: universe },
    { data: positions },
    { data: holdings },
  ] = await Promise.all([
    supabase.from("clients").select("full_name, dob, risk_override, allocation_overrides").eq("client_id", id).single(),
    supabase.from("risk_answers").select("question_num, answer").eq("client_id", id),
    supabase.from("goals").select("*").eq("client_id", id).order("target_year"),
    supabase.from("financial_facts").select("income_self, income_spouse, income_other, expenses_annual, retirement_age, life_expectancy, ret_pension, epf_nps_corpus, ret_expenses, retirement_replacement_pct, is_salaried, epf_basic_salary, epf_employee_pct, epf_employer_pct, epf_rate_pct, epf_salary_growth_pct").eq("client_id", id).maybeSingle(),
    supabase.from("investment_universe").select("instrument_id, asset_class, category, return_3y, return_5y, expense_ratio").order("asset_class"),
    supabase.from("portfolio_positions").select("goal_id, status, executed_lumpsum, executed_sip, current_value, executed_at").eq("client_id", id),
    supabase.from("portfolio_holdings").select("current_value, lumpsum_invested, monthly_sip, added_at").eq("client_id", id),
  ]);

  if (error || !client) notFound();
  const { data: firm } = await supabase.from("firm_settings").select("*").eq("user_id", authUser?.id ?? "").maybeSingle();
  const A = resolveAssumptions(firm as Record<string, unknown> | null);

  const answers: RiskAnswer[] = (answersRaw ?? []).map((r) => ({
    question_num: r.question_num as number,
    answer: r.answer as "A" | "B" | "C" | "D" | "E",
  }));

  const engineProfile = profileFromAnswers(answers);
  const activeProfile = client.risk_override ?? engineProfile;
  // riskEngine CATEGORIES names -> allocationEngine BASE_ALLOCATION keys (else SAA silently falls back to Moderate)
  const PROFILE_TO_SAA: Record<string, string> = {
    "Conservative": "Conservative",
    "Moderately Conservative": "Moderate Conservative",
    "Balanced / Moderate": "Moderate",
    "Moderately Aggressive": "Moderate Aggressive",
    "Aggressive": "Aggressive",
  };
  const saaProfile = PROFILE_TO_SAA[activeProfile] ?? "Moderate";
  const savedOv = client.allocation_overrides as Record<string, unknown> | null;
  const overrideAlloc = (savedOv?.asset_class as Record<string, number> | undefined) ?? null;

  const monthlySurplus = Math.max(0,
    ((facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0)) / 12
    - (facts?.expenses_annual ?? 0) / 12
  );

  const goals = (goalsRaw ?? []) as GoalInput[];
  const universeRows = (universe ?? []) as UniverseRow[];
  // engine still uses universe for SIP scoring; plan result used by Portfolio Construction
  const plan = buildAllocationPlan(saaProfile, goals, universeRows, monthlySurplus, overrideAlloc ?? undefined, A);
  plan.profile = activeProfile; // show the client-facing profile name, not the SAA key

  // Reconcile the headline "Required monthly SIP" with the Goal Calculator: same
  // live-portfolio-aware, SAA-blended calculation (lib/goalSip.ts) so the figure
  // matches across Goal Calculator, Asset Allocation and Portfolio Construction.
  const saa = overrideAlloc ?? BASE_ALLOCATION[saaProfile] ?? {};
  plan.totalMonthlySIP = totalRequiredSip(goals as unknown as GoalRow[], (positions ?? []) as Record<string, unknown>[], (holdings ?? []) as Record<string, unknown>[], saa, A, new Date().getFullYear(), facts as Record<string, unknown> | null, (client.dob as string | null) ?? null);
  plan.surplusAfterSIP = Math.round(plan.monthlySurplus - plan.totalMonthlySIP);

  // Engine (non-override) allocation, for the "Reset to engine" button.
  const engineAllocation = buildAllocationPlan(saaProfile, goals, universeRows, monthlySurplus, undefined, A).assetAllocation;

  return (
    <AssetAllocClient
      clientId={id}
      clientName={client.full_name ?? "Client"}
      plan={plan}
      savedOverrides={savedOv}
      engineAllocation={engineAllocation}
      hasGoals={goals.length > 0}
    />
  );
}
