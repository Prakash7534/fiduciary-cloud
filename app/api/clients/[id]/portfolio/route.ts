import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createSnapshot } from "@/lib/snapshot";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase
    .from("portfolio_positions")
    .select("*")
    .eq("client_id", id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const positions = await req.json() as Record<string, unknown>[];

  // Detect a position newly flipping to "executed" in this save — real money
  // landing in the live portfolio is worth its own History/Trend Analysis
  // point, not just whatever the last questionnaire said.
  const { data: prevRows } = await supabase.from("portfolio_positions").select("id, status").eq("client_id", id);
  const prevStatusById = new Map((prevRows ?? []).map(r => [r.id as string, r.status as string]));
  const newlyExecuted = positions.some(p => {
    if (p.status !== "executed") return false;
    const pid = p.id as string | undefined;
    return !pid || prevStatusById.get(pid) !== "executed";
  });

  // Replace all positions for this client
  await supabase.from("portfolio_positions").delete().eq("client_id", id);

  if (positions.length > 0) {
    const rows = positions.map(p => ({ ...p, client_id: id, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("portfolio_positions").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (newlyExecuted) {
    await createSnapshot(supabase, id, "Portfolio position(s) marked executed");
  }

  return NextResponse.json({ ok: true, count: positions.length });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { positionId, ...updates } = await req.json() as { positionId: string } & Record<string, unknown>;
  const { error } = await supabase
    .from("portfolio_positions")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", positionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
