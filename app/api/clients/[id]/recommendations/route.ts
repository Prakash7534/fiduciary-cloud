// app/api/clients/[id]/recommendations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data } = await supabase.from("recommendations").select("*").eq("client_id", id).order("created_at", { ascending: false });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const now = new Date();
  const docId = `REC-${(body.client_code as string) ?? id.slice(0, 8).toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { data, error } = await supabase.from("recommendations").insert({
    client_id: id,
    instrument_id: body.instrument_id ?? null,
    scrip_name: body.scrip_name,
    asset_class: body.asset_class ?? null,
    category: body.category ?? null,
    current_price: body.current_price ?? null,
    price_date: body.price_date ?? null,
    consider_price: body.consider_price ?? null,
    consider_price_max: body.consider_price_max ?? null,
    term: body.term ?? null,
    rationale_market: body.rationale_market ?? null,
    rationale_suitability: body.rationale_suitability ?? null,
    key_risks: body.key_risks ?? null,
    concentration_cap_pct: body.concentration_cap_pct ?? null,
    cap_headroom: body.cap_headroom ?? null,
    suggested_amount: body.suggested_amount ?? null,
    status: "recommended",
    doc_id: docId,
    created_by: user.email,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("client_activity_log").insert({
    client_id: id, event_type: "recommendation_created",
    description: `Recommendation ${docId}: ${body.scrip_name} — suggested ${body.suggested_amount ?? "—"}`,
    performed_by: user.email, metadata: { doc_id: docId, scrip: body.scrip_name },
  });

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { rec_id, status, rejected_reason, executed_amount, executed_sip } = await req.json() as {
    rec_id: string; status: "recommended" | "rejected" | "executed";
    rejected_reason?: string; executed_amount?: number; executed_sip?: number;
  };

  const { data: rec } = await supabase.from("recommendations").select("*").eq("rec_id", rec_id).single();
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const upd: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "rejected") upd.rejected_reason = rejected_reason ?? null;
  if (status === "executed") {
    upd.executed_amount = executed_amount ?? rec.suggested_amount ?? 0;
    upd.executed_sip = executed_sip ?? 0;
    upd.executed_at = new Date().toISOString();
  }
  await supabase.from("recommendations").update(upd).eq("rec_id", rec_id);

  // ── Executed → flows into live portfolio ───────────────────────────────────
  if (status === "executed") {
    const amt = Number(executed_amount ?? rec.suggested_amount ?? 0);
    const sip = Number(executed_sip ?? 0);
    await supabase.from("portfolio_positions").insert({
      client_id: id,
      instrument_id: rec.instrument_id ?? `rec-${rec_id.slice(0, 8)}`,
      instrument_name: rec.scrip_name,
      asset_class: rec.asset_class ?? "Equity",
      category: rec.category,
      bucket: rec.term === "Short term" ? "short" : "long",
      allocation_pct: 0,
      max_allocation_pct: rec.concentration_cap_pct,
      lumpsum_amount: Number(rec.suggested_amount ?? 0),
      monthly_sip: 0,
      executed_lumpsum: amt,
      executed_sip: sip,
      status: "executed",
      executed_at: new Date().toISOString(),
      notes: `From recommendation ${rec.doc_id}`,
      source: "engine",
    });
  }

  await supabase.from("client_activity_log").insert({
    client_id: id,
    event_type: `recommendation_${status}`,
    description: `Recommendation ${rec.doc_id} (${rec.scrip_name}) marked ${status}` +
      (status === "executed" ? ` — ₹${Number(executed_amount ?? rec.suggested_amount ?? 0).toLocaleString("en-IN")} added to live portfolio` : "") +
      (status === "rejected" && rejected_reason ? ` — reason: ${rejected_reason}` : ""),
    performed_by: user.email,
    metadata: { doc_id: rec.doc_id, scrip: rec.scrip_name, status },
  });

  return NextResponse.json({ ok: true });
}
