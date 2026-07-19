// app/api/q/[token]/route.ts — public questionnaire submission (no adviser auth)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { QuestionnairePayload } from "@/components/QuestionnaireForm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  // Validate token
  const { data: link } = await supabase
    .from("questionnaire_links")
    .select("client_id, expires_at, submitted_at, is_active, created_by")
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.is_active) return NextResponse.json({ error: "Invalid link" }, { status: 403 });
  if (new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "Link expired" }, { status: 403 });
  if (link.submitted_at) return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  const { clientId, payload }: { clientId: string; payload: QuestionnairePayload } = await req.json();
  if (clientId !== link.client_id) return NextResponse.json({ error: "Client mismatch" }, { status: 403 });

  const id = clientId;
  const { personal, financial } = payload;

  // Update client
  await supabase.from("clients").update({
    full_name: personal.full_name || undefined,
    dob: personal.dob || null,
    pan: personal.pan?.toUpperCase() || null,
    email: personal.email || null,
    phone: personal.phone || null,
    gender: personal.gender || null,
    occupation: personal.occupation || null,
    marital_status: personal.marital_status || null,
    nationality: personal.nationality || null,
    address: personal.address || null,
    client_type: personal.client_type || null,
    updated_at: new Date().toISOString(),
  }).eq("client_id", id);

  // Financial facts
  await supabase.from("financial_facts").delete().eq("client_id", id);
  await supabase.from("financial_facts").insert({ client_id: id, income_self: financial.income_self || null, income_spouse: financial.income_spouse || null, income_other: financial.income_other || null, life_cover: financial.life_cover || null, retirement_age: financial.retirement_age || null, will_status: financial.will_status || null, pep: financial.pep || null, fatca: financial.fatca || null });

  // Risk answers
  await supabase.from("risk_answers").delete().eq("client_id", id);
  if (payload.riskAnswers.length) await supabase.from("risk_answers").insert(payload.riskAnswers.map(a => ({ client_id: id, question_num: a.question_num, answer: a.answer })));

  // Goals
  await supabase.from("goals").delete().eq("client_id", id);
  const validGoals = payload.goals.filter(g => g.goal_name?.trim());
  if (validGoals.length) await supabase.from("goals").insert(validGoals.map(g => ({ client_id: id, goal_name: g.goal_name, target_year: g.target_year ? Number(g.target_year) : null, cost_today: Number(g.cost_today) || 0, saved: Number(g.saved) || null, monthly_sip: Number(g.monthly_sip) || null, priority: g.priority || null, flexibility: g.flexibility || null })));

  // Loans
  await supabase.from("loans").delete().eq("client_id", id);
  if (payload.loans.length) await supabase.from("loans").insert(payload.loans.map(l => ({ client_id: id, loan_type: l.loan_type, lender: l.lender || null, outstanding: Number(l.outstanding) || 0, emi: Number(l.emi) || null, rate: Number(l.rate) || null, tenure_months: Number(l.tenure_months) || null })));

  // Family
  await supabase.from("family_members").delete().eq("client_id", id);
  const validFam = payload.family.filter(f => f.name?.trim());
  if (validFam.length) await supabase.from("family_members").insert(validFam.map(f => ({ client_id: id, name: f.name, relationship: f.relationship || null, age: Number(f.age) || null, occupation: f.occupation || null, annual_income: Number(f.annual_income) || null, health_status: f.health_status || null })));

  // Behaviour
  await supabase.from("behaviour").delete().eq("client_id", id);
  if (payload.behaviour.beh1) await supabase.from("behaviour").insert({ client_id: id, ...payload.behaviour });

  // Knowledge
  await supabase.from("knowledge_grid").delete().eq("client_id", id);
  const kgRows = Object.entries(payload.knowledge).filter(([,v]) => v).map(([asset_class, level]) => ({ client_id: id, asset_class, level }));
  if (kgRows.length) await supabase.from("knowledge_grid").insert(kgRows);

  // Investments
  await supabase.from("investments").delete().eq("client_id", id);
  const invRows = Object.entries(payload.investments).filter(([,v]) => Number(v) > 0).map(([key, val]) => ({ client_id: id, asset_class: key.replace(/_/g, " "), value: Number(val) }));
  if (invRows.length) await supabase.from("investments").insert(invRows);

  // Mark link as submitted
  await supabase.from("questionnaire_links")
    .update({ submitted_at: new Date().toISOString(), is_active: false })
    .eq("token", token);

  return NextResponse.json({ ok: true });
}
