import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Persist the per-client retirement levers set on the Goal Calculator's
// retirement planner. Assumption fields (returns, inflation) stay firm-level.
const NUMERIC = ["life_expectancy", "retirement_replacement_pct", "retirement_age", "ret_pension"] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;

  const payload: Record<string, unknown> = { client_id: id };
  for (const k of NUMERIC) {
    if (k in body) {
      const v = body[k];
      payload[k] = v === null || v === "" ? null : Number(v);
    }
  }

  const { error } = await supabase
    .from("financial_facts")
    .upsert(payload, { onConflict: "client_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
