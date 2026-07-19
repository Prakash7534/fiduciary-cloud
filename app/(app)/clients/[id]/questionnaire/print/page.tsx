// app/(app)/clients/[id]/questionnaire/print/page.tsx
// Server-rendered, print-ready questionnaire summary — opens via "Download PDF" button
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintClient from "./_client";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const [
    { data: client },
    { data: ff },
    { data: riskAnswers },
    { data: goals },
    { data: loans },
    { data: family },
    { data: behaviour },
    { data: knowledge },
    { data: investments },
  ] = await Promise.all([
    supabase.from("clients").select(`
      client_id, full_name, email, phone, pan, dob, gender, marital_status,
      address, client_type, residential_status, nationality, client_code,
      occupation, employer, industry, years_exp, career_stage, education,
      dependants_detail, owns_business, sole_earner, expecting_inheritance, plan_change
    `).eq("client_id", id).eq("user_id", user.id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("risk_answers").select("question_num, answer").eq("client_id", id).order("question_num"),
    supabase.from("goals").select("*").eq("client_id", id),
    supabase.from("loans").select("*").eq("client_id", id),
    supabase.from("family_members").select("*").eq("client_id", id),
    supabase.from("behaviour").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("knowledge_grid").select("asset_class, level").eq("client_id", id),
    supabase.from("investments").select("asset_class, value").eq("client_id", id),
  ]);

  if (!client) notFound();

  return (
    <PrintClient
      client={client}
      ff={ff}
      riskAnswers={riskAnswers ?? []}
      goals={goals ?? []}
      loans={loans ?? []}
      family={family ?? []}
      behaviour={behaviour}
      knowledge={knowledge ?? []}
      investments={investments ?? []}
    />
  );
}
