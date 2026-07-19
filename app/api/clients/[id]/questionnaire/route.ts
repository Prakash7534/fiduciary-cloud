// app/api/clients/[id]/questionnaire/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { QuestionnairePayload } from "@/components/QuestionnaireForm";

// POST — save questionnaire answers, update all tables
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body: QuestionnairePayload = await req.json();

  // 1. Update client personal fields
  const { personal, financial } = body;
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
  }).eq("client_id", id).eq("user_id", user.id);

  // 2. Upsert financial_facts
  await supabase.from("financial_facts").delete().eq("client_id", id);
  await supabase.from("financial_facts").insert({
    client_id: id,
    income_self: financial.income_self || null,
    income_spouse: financial.income_spouse || null,
    income_other: financial.income_other || null,
    life_cover: financial.life_cover || null,
    retirement_age: financial.retirement_age || null,
    will_status: financial.will_status || null,
    pep: financial.pep || null,
    fatca: financial.fatca || null,
  });

  // 3. Risk answers
  await supabase.from("risk_answers").delete().eq("client_id", id);
  if (body.riskAnswers.length) {
    await supabase.from("risk_answers").insert(
      body.riskAnswers.map(a => ({ client_id: id, question_num: a.question_num, answer: a.answer }))
    );
  }

  // 4. Goals
  await supabase.from("goals").delete().eq("client_id", id);
  const validGoals = body.goals.filter(g => g.goal_name?.trim());
  if (validGoals.length) {
    await supabase.from("goals").insert(validGoals.map(g => ({
      client_id: id,
      goal_name: g.goal_name,
      target_year: g.target_year ? Number(g.target_year) : null,
      cost_today: Number(g.cost_today) || 0,
      saved: Number(g.saved) || null,
      monthly_sip: Number(g.monthly_sip) || null,
      priority: g.priority || null,
      flexibility: g.flexibility || null,
    })));
  }

  // 5. Loans
  await supabase.from("loans").delete().eq("client_id", id);
  if (body.loans.length) {
    await supabase.from("loans").insert(body.loans.map(l => ({
      client_id: id,
      loan_type: l.loan_type,
      lender: l.lender || null,
      outstanding: Number(l.outstanding) || 0,
      emi: Number(l.emi) || null,
      rate: Number(l.rate) || null,
      tenure_months: Number(l.tenure_months) || null,
    })));
  }

  // 6. Family members
  await supabase.from("family_members").delete().eq("client_id", id);
  const validFam = body.family.filter(f => f.name?.trim());
  if (validFam.length) {
    await supabase.from("family_members").insert(validFam.map(f => ({
      client_id: id,
      name: f.name, relationship: f.relationship || null,
      age: Number(f.age) || null, occupation: f.occupation || null,
      annual_income: Number(f.annual_income) || null,
      health_status: f.health_status || null,
    })));
  }

  // 7. Behaviour
  await supabase.from("behaviour").delete().eq("client_id", id);
  if (body.behaviour.beh1) {
    await supabase.from("behaviour").insert({ client_id: id, ...body.behaviour });
  }

  // 8. Knowledge grid
  await supabase.from("knowledge_grid").delete().eq("client_id", id);
  const kgRows = Object.entries(body.knowledge).filter(([,v]) => v).map(([asset_class, level]) => ({ client_id: id, asset_class, level }));
  if (kgRows.length) await supabase.from("knowledge_grid").insert(kgRows);

  // 9. Investments (store as investment rows — map to asset class values)
  await supabase.from("investments").delete().eq("client_id", id);
  const invRows = Object.entries(body.investments)
    .filter(([,v]) => Number(v) > 0)
    .map(([key, val]) => ({
      client_id: id,
      asset_class: key.replace(/_/g, " "),
      value: Number(val),
    }));
  if (invRows.length) await supabase.from("investments").insert(invRows);

  return NextResponse.json({ ok: true });
}

// GET — generate a shareable client link
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Deactivate any previous active links
  await supabase.from("questionnaire_links")
    .update({ is_active: false })
    .eq("client_id", id).eq("created_by", user.id).eq("is_active", true);

  // Create a fresh link valid for 7 days
  const { data, error } = await supabase.from("questionnaire_links").insert({
    client_id: id, created_by: user.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).select("token").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const url = `${proto}://${host}/q/${data.token}`;
  return NextResponse.json({ url, token: data.token });
}
