// app/api/settings/route.ts — upsert the adviser's firm settings + planning assumptions
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const IDENTITY = [
  "advisor_name", "qualification", "sebi_regn", "firm_name",
  "address", "phone", "email", "website", "grievance_contact",
];
const ASSUMPTIONS = [
  "assume_inflation", "assume_goal_return", "assume_equity", "assume_debt",
  "assume_gold", "assume_intl", "assume_alternate", "assume_hybrid",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const payload: Record<string, unknown> = { user_id: user.id };

  for (const k of IDENTITY) if (k in body) payload[k] = (body[k] as string)?.toString().trim() || null;
  for (const k of ASSUMPTIONS) {
    if (k in body) {
      const v = body[k];
      payload[k] = v === null || v === "" ? null : Number(v);
    }
  }

  const { error } = await supabase.from("firm_settings").upsert(payload, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
