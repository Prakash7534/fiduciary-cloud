// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  extractPdfFields, mapToClient, mapToFinancialFacts, mapToLoans,
  mapToInvestments, mapToGoals, mapToFamily, mapToRiskAnswers,
} from "@/lib/pdfExtract";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("pdf") as File | null;
  if (!file) return NextResponse.json({ error: "No PDF provided" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const raw = await extractPdfFields(bytes);
  const clientFields = mapToClient(raw);

  // ---- identity match: PAN first, then name+DOB, then flag ambiguous name-only matches ----
  let clientId: string | null = null;
  let isNew = true;
  let matchNote = "New client";

  if (clientFields.pan) {
    const { data } = await supabase
      .from("clients").select("client_id, full_name")
      .eq("user_id", user.id).eq("pan", clientFields.pan).maybeSingle();
    if (data) { clientId = data.client_id; isNew = false; matchNote = `Matched via PAN to '${data.full_name}'`; }
  }
  if (!clientId && clientFields.dob) {
    const { data } = await supabase
      .from("clients").select("client_id, full_name")
      .eq("user_id", user.id).eq("dob", clientFields.dob).ilike("full_name", clientFields.full_name).maybeSingle();
    if (data) { clientId = data.client_id; isNew = false; matchNote = `Matched via name + DOB to '${data.full_name}'`; }
  }
  if (!clientId) {
    const { data: nameMatches } = await supabase
      .from("clients").select("client_id, full_name, pan, dob")
      .eq("user_id", user.id).ilike("full_name", clientFields.full_name);
    if (nameMatches && nameMatches.length > 0) {
      // Ambiguous — name matches but PAN/DOB couldn't confirm. Don't guess: report back
      // to the client for confirmation, same principle as the Flask app's /upload/confirm flow.
      return NextResponse.json({
        ambiguous: true,
        reason: `Name matches ${nameMatches.length} existing client(s) but PAN/DOB couldn't confirm it's the same person.`,
        candidates: nameMatches,
        newFields: clientFields,
      }, { status: 409 });
    }
  }

  if (isNew) {
    const { data, error } = await supabase
      .from("clients").insert({ ...clientFields, user_id: user.id }).select("client_id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    clientId = data.client_id;
  } else {
    await supabase.from("clients").update({ ...clientFields, updated_at: new Date().toISOString() }).eq("client_id", clientId!);
    // Clear out prior "current" data before re-inserting — history is preserved separately in `snapshots`.
    for (const tbl of ["financial_facts", "risk_answers", "loans", "investments", "goals", "family_members"]) {
      await supabase.from(tbl).delete().eq("client_id", clientId!);
    }
  }

  await supabase.from("financial_facts").insert({ client_id: clientId, ...mapToFinancialFacts(raw) });
  const answers = mapToRiskAnswers(raw);
  if (answers.length) await supabase.from("risk_answers").insert(answers.map((a) => ({ client_id: clientId, ...a })));
  const loans = mapToLoans(raw);
  if (loans.length) await supabase.from("loans").insert(loans.map((l) => ({ client_id: clientId, ...l })));
  const invs = mapToInvestments(raw);
  if (invs.length) await supabase.from("investments").insert(invs.map((i) => ({ client_id: clientId, ...i })));
  const goals = mapToGoals(raw);
  if (goals.length) await supabase.from("goals").insert(goals.map((g) => ({ client_id: clientId, ...g })));
  const family = mapToFamily(raw);
  if (family.length) await supabase.from("family_members").insert(family.map((f) => ({ client_id: clientId, ...f })));

  // ---- snapshot: append-only history, never overwritten ----
  await supabase.from("snapshots").insert({
    client_id: clientId,
    source_note: isNew ? "Questionnaire load (new client)" : "Questionnaire load (re-upload)",
    raw_data: raw,
    answered_count: answers.length,
  });

  return NextResponse.json({ clientId, isNew, matchNote, answered: answers.length });
}
