// app/api/clients/[id]/report-notes/route.ts — upsert adviser comments for advisory report
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    what_it_means?: string; why_this_mix?: string; deployment_plan?: string;
    conflicts?: string; additional_comments?: string; next_review_date?: string | null;
  };

  const { error } = await supabase.from("report_notes").upsert({
    client_id: id,
    what_it_means:       body.what_it_means ?? null,
    why_this_mix:        body.why_this_mix ?? null,
    deployment_plan:     body.deployment_plan ?? null,
    conflicts:           body.conflicts ?? null,
    additional_comments: body.additional_comments ?? null,
    next_review_date:    body.next_review_date || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit trail
  await supabase.from("client_activity_log").insert({
    client_id: id,
    event_type: "advisory_report_notes_saved",
    description: "Adviser comments on advisory report updated",
    performed_by: user.email,
  });

  return NextResponse.json({ ok: true });
}
