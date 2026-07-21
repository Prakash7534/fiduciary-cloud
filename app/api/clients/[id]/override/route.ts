// app/api/clients/[id]/override/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const risk_override = body.risk_override ?? null;
  const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";

  // Setting an override is a documented judgment call that deviates from the
  // computed profile — SEBI IA record-keeping requires the "why" to be
  // captured alongside the "what", not left to a notes feature that may or
  // may not get used. Clearing an override (going back to the computed
  // profile) doesn't need a fresh rationale.
  if (risk_override && !rationale) {
    return NextResponse.json({ error: "Rationale is required when setting an override." }, { status: 400 });
  }

  const { data: prev } = await supabase.from("clients").select("risk_override").eq("client_id", id).maybeSingle();

  const { error } = await supabase
    .from("clients")
    .update({
      risk_override,
      risk_override_rationale: risk_override ? rationale : null,
      risk_override_by: risk_override ? user.email : null,
      risk_override_at: risk_override ? new Date().toISOString() : null,
    })
    .eq("client_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("client_activity_log").insert({
    client_id: id,
    event_type: risk_override ? "risk_override_set" : "risk_override_cleared",
    description: risk_override
      ? `Adviser override set to "${risk_override}"${prev?.risk_override ? ` (was "${prev.risk_override}")` : ""}: ${rationale}`
      : `Adviser override cleared (was "${prev?.risk_override ?? "—"}") — reverted to computed profile`,
    performed_by: user.email,
    metadata: { risk_override, rationale: risk_override ? rationale : null },
  });

  return NextResponse.json({ ok: true });
}
