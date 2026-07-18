import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase
    .from("portfolio_holdings")
    .select("*")
    .eq("client_id", id)
    .order("added_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const holdings = await req.json() as Record<string, unknown>[];

  await supabase.from("portfolio_holdings").delete().eq("client_id", id);

  if (holdings.length > 0) {
    const rows = holdings.map(h => ({
      ...h,
      client_id: id,
      user_id: user.id,
      added_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("portfolio_holdings").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: holdings.length });
}
