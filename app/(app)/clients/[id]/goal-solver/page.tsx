// app/(app)/clients/[id]/goal-solver/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { GoalRow } from "@/lib/riskEngine";
import GoalSolverClient from "./_client";
import { resolveAssumptions } from "@/lib/assumptions";

export default async function GoalSolverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const authUser = (await supabase.auth.getUser()).data.user;

  const [{ data: client, error }, { data: goalsRaw }, { data: facts }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("goals").select("*").eq("client_id", id).order("target_year"),
    supabase.from("financial_facts").select("income_self, income_spouse, income_other, expenses_annual").eq("client_id", id).maybeSingle(),
  ]);

  if (error || !client) notFound();
  const { data: firm } = await supabase.from("firm_settings").select("*").eq("user_id", authUser?.id ?? "").maybeSingle();
  const A = resolveAssumptions(firm as Record<string, unknown> | null);

  const monthlySurplus = Math.max(0,
    ((facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0)) / 12
    - (facts?.expenses_annual ?? 0) / 12
  );

  return (
    <GoalSolverClient
      goals={(goalsRaw ?? []) as GoalRow[]}
      monthlySurplus={monthlySurplus}
      assumeInflation={A.inflation}
      assumeReturn={A.defaultGoalReturn}
    />
  );
}
