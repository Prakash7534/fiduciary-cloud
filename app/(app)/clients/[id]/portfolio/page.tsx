import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { profileFromAnswers } from "@/lib/riskEngine";
import type { RiskAnswer } from "@/lib/riskEngine";
import { buildAllocationPlan, type UniverseRow, type GoalInput } from "@/lib/allocationEngine";
import PortfolioClient from "./_client";

export default async function PortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: client, error },
    { data: answersRaw },
    { data: goalsRaw },
    { data: facts },
    { data: universe },
    { data: positions },
    { data: holdings },
    { data: activityLog },
  ] = await Promise.all([
    supabase.from("clients")
      .select("full_name, dob, risk_override, allocation_overrides, concentration_cap")
      .eq("client_id", id).single(),
    supabase.from("risk_answers").select("question_num, answer").eq("client_id", id),
    supabase.from("goals").select("goal_id, goal_name, target_year, cost_today").eq("client_id", id).order("target_year"),
    supabase.from("financial_facts").select("income_self, income_spouse, income_other, expenses_annual").eq("client_id", id).maybeSingle(),
    supabase.from("investment_universe").select("*").order("asset_class").order("category"),
    supabase.from("portfolio_positions").select("*").eq("client_id", id).order("created_at"),
    supabase.from("portfolio_holdings").select("*").eq("client_id", id).order("added_at"),
    supabase.from("portfolio_activity_log").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(200),
  ]);

  if (error || !client) notFound();

  const answers: RiskAnswer[] = (answersRaw ?? []).map(r => ({
    question_num: r.question_num as number,
    answer: r.answer as "A" | "B" | "C" | "D" | "E",
  }));
  const engineProfile = profileFromAnswers(answers);
  const activeProfile = client.risk_override ?? engineProfile;
  // riskEngine CATEGORIES names → allocationEngine BASE_ALLOCATION keys
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
  const plan = buildAllocationPlan(saaProfile, goals, universeRows, monthlySurplus, overrideAlloc ?? undefined);
  plan.profile = activeProfile; // display the client-facing profile name, not the SAA key

  return (
    <PortfolioClient
      clientId={id}
      clientName={client.full_name ?? "Client"}
      plan={plan}
      universe={universeRows}
      goals={goals}
      concentrationCap={Number(client.concentration_cap ?? 5)}
      existingPositions={(positions ?? []) as Record<string, unknown>[]}
      existingHoldings={(holdings ?? []) as Record<string, unknown>[]}
      initialActivityLog={(activityLog ?? []) as Record<string, unknown>[]}
    />
  );
}
