import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { profileFromAnswers } from "@/lib/riskEngine";
import type { RiskAnswer } from "@/lib/riskEngine";
import { buildAllocationPlan, type UniverseRow, type GoalInput } from "@/lib/allocationEngine";
import AssetAllocClient from "./_client";

export default async function AssetAllocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: client, error },
    { data: answersRaw },
    { data: goalsRaw },
    { data: facts },
    { data: universe },
  ] = await Promise.all([
    supabase.from("clients").select("full_name, dob, risk_override, allocation_overrides").eq("client_id", id).single(),
    supabase.from("risk_answers").select("question_id, answer_value").eq("client_id", id),
    supabase.from("goals").select("*").eq("client_id", id).order("target_year"),
    supabase.from("financial_facts").select("income_self, income_spouse, income_other, expenses_annual").eq("client_id", id).maybeSingle(),
    supabase.from("investment_universe").select("instrument_id, asset_class, category, return_3y, return_5y, expense_ratio").order("asset_class"),
  ]);

  if (error || !client) notFound();

  const answers: RiskAnswer[] = (answersRaw ?? []).map((r) => ({
    question_num: r.question_id as number,
    answer: r.answer_value as "A" | "B" | "C" | "D" | "E",
  }));

  const engineProfile = profileFromAnswers(answers);
  const activeProfile = client.risk_override ?? engineProfile;
  const savedOv = client.allocation_overrides as Record<string, unknown> | null;
  const overrideAlloc = (savedOv?.asset_class as Record<string, number> | undefined) ?? null;

  const monthlySurplus = Math.max(0,
    ((facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0)) / 12
    - (facts?.expenses_annual ?? 0) / 12
  );

  const goals = (goalsRaw ?? []) as GoalInput[];
  const universeRows = (universe ?? []) as UniverseRow[];
  // engine still uses universe for SIP scoring; plan result used by Portfolio Construction
  const plan = buildAllocationPlan(activeProfile, goals, universeRows, monthlySurplus, overrideAlloc ?? undefined);

  return (
    <AssetAllocClient
      clientId={id}
      clientName={client.full_name ?? "Client"}
      plan={plan}
      savedOverrides={savedOv}
      hasGoals={goals.length > 0}
    />
  );
}
