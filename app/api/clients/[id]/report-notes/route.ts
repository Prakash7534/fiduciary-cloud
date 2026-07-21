// app/api/clients/[id]/report-notes/route.ts — upsert adviser comments for the
// advisory report AND the Advisory Notes summary. Non-destructive: only the
// keys actually present in the request body are written, so the Advisory Report
// (inline per-section comments) and the Advisory Notes workspace (holistic
// summary fields) can each save independently without clobbering the other's
// columns on the shared report_notes row.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = [
  // per-section report commentary
  "what_it_means", "why_this_mix", "deployment_plan", "conflicts", "additional_comments",
  "protect_actions", "stabilise_actions", "grow_actions", "next_review_date",
  // Advisory Notes holistic summary
  "adv_summary", "adv_client_profile", "adv_considerations", "adv_suitability", "adv_next_steps",
] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;

  const payload: Record<string, unknown> = { client_id: id, updated_at: new Date().toISOString() };
  const touched: string[] = [];
  for (const k of ALLOWED) {
    if (k in body) {
      // next_review_date: empty string -> null; everything else: value or null
      payload[k] = k === "next_review_date" ? ((body[k] as string) || null) : (body[k] ?? null);
      touched.push(k);
    }
  }

  if (touched.length === 0) return NextResponse.json({ ok: true, touched: [] });

  const { error } = await supabase.from("report_notes").upsert(payload, { onConflict: "client_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const isAdvNote = touched.some((k) => k.startsWith("adv_"));
  await supabase.from("client_activity_log").insert({
    client_id: id,
    event_type: isAdvNote ? "advisory_notes_saved" : "advisory_report_notes_saved",
    description: isAdvNote ? "Advisory notes summary updated" : "Adviser comments on advisory report updated",
    performed_by: user.email,
    metadata: { fields: touched },
  });

  return NextResponse.json({ ok: true, touched });
}
