import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { scoreAnswers, profileFromAnswers } from "@/lib/riskEngine";
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
    supabase.from("investment_universe").select("*").order("asset_class").order("category"),
  ]);

  if (error || !client) notFound();

  const answers: RiskAnswer[] = (answersRaw ?? []).map((r) => ({
    question_num: r.question_id as number,
    answer: r.answer_value as "A" | "B" | "C" | "D" | "E",
  }));

  const engineProfile = profileFromAnswers(answers);
  const activeProfile = client.risk_override ?? engineProfile;
  const overrideAlloc = (client.allocation_overrides as { asset_class?: Record<string, number> } | null)?.asset_class ?? null;

  const monthlySurplus = Math.max(0,
    ((facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0)) / 12
    - (facts?.expenses_annual ?? 0) / 12
  );

  const goals = (goalsRaw ?? []) as GoalInput[];
  const plan  = buildAllocationPlan(activeProfile, goals, (universe ?? []) as UniverseRow[], monthlySurplus, overrideAlloc ?? undefined);

  return (
    <AssetAllocClient
      clientId={id}
      clientName={client.full_name ?? "Client"}
      plan={plan}
      savedOverrides={client.allocation_overrides as Record<string, unknown> | null}
      hasGoals={goals.length > 0}
      hasUniverse={(universe?.length ?? 0) > 0}
    />
  );
}
