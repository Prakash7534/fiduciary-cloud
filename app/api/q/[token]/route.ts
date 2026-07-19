// app/api/q/[token]/route.ts — public questionnaire submission (no adviser auth)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { QuestionnairePayload } from "@/components/QuestionnaireForm";
import { saveQuestionnairePayload } from "@/app/api/clients/[id]/questionnaire/route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  // Validate token
  const { data: link } = await supabase
    .from("questionnaire_links")
    .select("client_id, expires_at, submitted_at, is_active")
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.is_active)
    return NextResponse.json({ error: "Invalid link" }, { status: 403 });
  if (new Date(link.expires_at) < new Date())
    return NextResponse.json({ error: "Link expired" }, { status: 403 });
  if (link.submitted_at)
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  const { clientId, payload }: { clientId: string; payload: QuestionnairePayload } = await req.json();
  if (clientId !== link.client_id)
    return NextResponse.json({ error: "Client mismatch" }, { status: 403 });

  await saveQuestionnairePayload(supabase, clientId, payload);

  // Mark link as submitted + inactive
  await supabase.from("questionnaire_links")
    .update({ submitted_at: new Date().toISOString(), is_active: false })
    .eq("token", token);

  return NextResponse.json({ ok: true });
}
