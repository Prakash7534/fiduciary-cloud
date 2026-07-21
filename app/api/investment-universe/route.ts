// app/api/investment-universe/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { instrument_id, name, instrument_type, ticker, isin, asset_class, category,
    sub_bucket, risk_level, expense_ratio, return_3y, return_5y, min_sip,
    current_price, price_date, exchange, liquidity, taxation, esg, international,
    min_knowledge, notes, currency,
    issuer, coupon_pct, maturity_date, ytm_pct, face_value, credit_rating } = body;

  if (!instrument_id || !name) {
    return NextResponse.json({ error: "instrument_id and name are required" }, { status: 400 });
  }

  const { error } = await supabase.from("investment_universe").insert({
    instrument_id, name, user_id: user.id, instrument_type, ticker, isin, asset_class, category,
    sub_bucket, risk_level, expense_ratio, return_3y, return_5y, min_sip,
    current_price, price_date: price_date || null, exchange, liquidity, taxation,
    esg: esg ?? false, international: international ?? false, min_knowledge, notes,
    currency: currency ?? "INR",
    issuer: issuer ?? null, coupon_pct: coupon_pct ?? null, maturity_date: maturity_date || null,
    ytm_pct: ytm_pct ?? null, face_value: face_value ?? null, credit_rating: credit_rating ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { instrument_id, ...rest } = body;

  if (!instrument_id) {
    return NextResponse.json({ error: "instrument_id is required" }, { status: 400 });
  }

  const { error } = await supabase.from("investment_universe")
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq("instrument_id", instrument_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("investment_universe")
    .delete()
    .eq("instrument_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("investment_universe")
    .select("*")
    .order("asset_class")
    .order("category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
