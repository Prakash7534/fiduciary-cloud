// app/api/clients/[id]/questionnaire-submit/route.ts
// Validates identity fields against client profile, then records submission.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalise(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normaliseDob(s: string | null | undefined) {
  if (!s) return "";
  const v = s.trim();
  // dd-mm-yyyy or dd/mm/yyyy → yyyy-mm-dd
  const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return v;
}

function normalisePhone(s: string | null | undefined) {
  return (s ?? "").replace(/[\s\-\+\(\)]/g, "").replace(/^91/, "").slice(-10);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    full_name: string; pan: string; dob: string; phone: string; email: string; notes?: string;
  };

  const { data: cl } = await supabase
    .from("clients")
    .select("full_name, pan, dob, phone, email")
    .eq("client_id", id)
    .maybeSingle();

  if (!cl) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // ── Identity validation ──────────────────────────────────────────────────
  const errors: string[] = [];

  if (normalise(body.full_name) !== normalise(cl.full_name))
    errors.push(`Full name mismatch — entered: "${body.full_name}", profile: "${cl.full_name}"`);

  if (normalise(body.pan) !== normalise(cl.pan))
    errors.push(`PAN mismatch — entered: "${body.pan?.toUpperCase()}", profile: "${cl.pan}"`);

  if (normaliseDob(body.dob) !== normaliseDob(cl.dob))
    errors.push(`Date of birth mismatch — entered: "${body.dob}", profile: "${cl.dob}"`);

  if (normalisePhone(body.phone) !== normalisePhone(cl.phone as string | null))
    errors.push(`Contact number mismatch — entered: "${body.phone}", profile: "${cl.phone}"`);

  if (normalise(body.email) !== normalise(cl.email as string | null))
    errors.push(`Email mismatch — entered: "${body.email}", profile: "${cl.email}"`);

  if (errors.length > 0)
    return NextResponse.json({ error: "Identity validation failed", details: errors }, { status: 422 });

  // ── Record submission — mark active link submitted ────────────────────────
  await supabase
    .from("questionnaire_links")
    .update({ submitted_at: new Date().toISOString() })
    .eq("client_id", id)
    .is("submitted_at", null);

  return NextResponse.json({ ok: true });
}
