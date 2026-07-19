// app/api/clients/[id]/questionnaire/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { QuestionnairePayload } from "@/components/QuestionnaireForm";

// Shared save logic — called by both adviser and public (token) routes
export async function saveQuestionnairePayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  body: QuestionnairePayload
) {
  const { personal, employment, financial, insurance } = body;

  // 1. clients — personal + employment fields
  await supabase.from("clients").update({
    full_name:            personal.full_name            || undefined,
    dob:                  personal.dob                  || null,
    pan:                  personal.pan?.toUpperCase()   || null,
    email:                personal.email                || null,
    phone:                personal.phone                || null,
    gender:               personal.gender               || null,
    marital_status:       personal.marital_status       || null,
    nationality:          personal.nationality           || null,
    address:              personal.address              || null,
    client_type:          personal.client_type          || null,
    residential_status:   personal.residential_status   || null,
    // employment fields stored on clients table
    occupation:           employment?.occupation        || null,
    employer:             employment?.employer          || null,
    industry:             employment?.industry          || null,
    years_exp:            employment?.years_exp         ?? null,
    career_stage:         employment?.career_stage      || null,
    education:            employment?.education         || null,
    dependants_detail:    employment?.dependants_detail || null,
    owns_business:        employment?.owns_business     ?? null,
    sole_earner:          employment?.sole_earner       ?? null,
    expecting_inheritance:employment?.expecting_inheritance ?? null,
    plan_change:          employment?.plan_change       ?? null,
    updated_at:           new Date().toISOString(),
  }).eq("client_id", clientId);

  // 2. financial_facts
  await supabase.from("financial_facts").delete().eq("client_id", clientId);
  await supabase.from("financial_facts").insert({
    client_id:          clientId,
    income_self:        financial.income_self        || null,
    income_spouse:      financial.income_spouse      || null,
    income_other:       financial.income_other       || null,
    life_cover:         financial.life_cover         || null,
    retirement_age:     financial.retirement_age     || null,
    will_status:        financial.will_status        || null,
    pep:                financial.pep                || null,
    fatca:              financial.fatca              || null,
    // insurance / estate fields
    health_cover:       insurance?.health_cover      || null,
    employer_cover:     insurance?.employer_cover    || null,
    covers_held:        insurance?.covers_held       || null,
    nominees_updated:   insurance?.nominees_updated  || null,
    trust_status:       insurance?.trust_status      || null,
    poa_status:         insurance?.poa_status        || null,
    guardian_status:    insurance?.guardian_status   || null,
  });

  // 3. Risk answers
  await supabase.from("risk_answers").delete().eq("client_id", clientId);
  if (body.riskAnswers.length) {
    await supabase.from("risk_answers").insert(
      body.riskAnswers.map(a => ({ client_id: clientId, question_num: a.question_num, answer: a.answer }))
    );
  }

  // 4. Goals (with inflation_pct, return_pct)
  await supabase.from("goals").delete().eq("client_id", clientId);
  const validGoals = body.goals.filter(g => g.goal_name?.trim());
  if (validGoals.length) {
    await supabase.from("goals").insert(validGoals.map(g => ({
      client_id:    clientId,
      goal_name:    g.goal_name,
      target_year:  g.target_year ? Number(g.target_year) : null,
      cost_today:   Number(g.cost_today) || 0,
      saved:        Number(g.saved)      || null,
      monthly_sip:  Number(g.monthly_sip)|| null,
      priority:     g.priority           || null,
      flexibility:  g.flexibility        || null,
      inflation_pct:g.inflation_pct ? Number(g.inflation_pct) : null,
      return_pct:   g.return_pct    ? Number(g.return_pct)    : null,
    })));
  }

  // 5. Loans
  await supabase.from("loans").delete().eq("client_id", clientId);
  if (body.loans.length) {
    await supabase.from("loans").insert(body.loans.map(l => ({
      client_id:     clientId,
      loan_type:     l.loan_type,
      lender:        l.lender        || null,
      outstanding:   Number(l.outstanding) || 0,
      emi:           Number(l.emi)         || null,
      rate:          Number(l.rate)        || null,
      tenure_months: Number(l.tenure_months)|| null,
    })));
  }

  // 6. Family members
  await supabase.from("family_members").delete().eq("client_id", clientId);
  const validFam = body.family.filter(f => f.name?.trim());
  if (validFam.length) {
    await supabase.from("family_members").insert(validFam.map(f => ({
      client_id:     clientId,
      name:          f.name,
      relationship:  f.relationship || null,
      age:           Number(f.age)  || null,
      occupation:    f.occupation   || null,
      annual_income: Number(f.annual_income) || null,
      health_status: f.health_status || null,
    })));
  }

  // 7. Behaviour
  await supabase.from("behaviour").delete().eq("client_id", clientId);
  if (body.behaviour.beh1) {
    await supabase.from("behaviour").insert({ client_id: clientId, ...body.behaviour });
  }

  // 8. Knowledge grid
  await supabase.from("knowledge_grid").delete().eq("client_id", clientId);
  const kgRows = Object.entries(body.knowledge)
    .filter(([, v]) => v)
    .map(([asset_class, level]) => ({ client_id: clientId, asset_class, level }));
  if (kgRows.length) await supabase.from("knowledge_grid").insert(kgRows);

  // 9. Investments
  await supabase.from("investments").delete().eq("client_id", clientId);
  const invRows = Object.entries(body.investments)
    .filter(([, v]) => Number(v) > 0)
    .map(([key, val]) => ({
      client_id:   clientId,
      asset_class: key.replace(/_/g, " "),
      value:       Number(val),
    }));
  if (invRows.length) await supabase.from("investments").insert(invRows);
}

// POST — save questionnaire answers (adviser flow)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body: QuestionnairePayload = await req.json();
  await saveQuestionnairePayload(supabase, id, body);
  return NextResponse.json({ ok: true });
}

// GET — generate a shareable client link
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await supabase.from("questionnaire_links")
    .update({ is_active: false })
    .eq("client_id", id).eq("created_by", user.id).eq("is_active", true);

  const { data, error } = await supabase.from("questionnaire_links").insert({
    client_id: id, created_by: user.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).select("token").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const host  = req.headers.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return NextResponse.json({ url: `${proto}://${host}/q/${data.token}`, token: data.token });
}
