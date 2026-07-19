// app/api/clients/route.ts — create a minimal new client record
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { full_name, dob, pan, email, phone, gender, occupation } = body;
  if (!full_name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Generate UCC
  const { data: code } = await supabase.rpc("generate_client_code", { p_user_id: user.id });

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id: user.id,
      full_name: full_name.trim(),
      dob: dob || null,
      pan: pan?.trim().toUpperCase() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      gender: gender || null,
      occupation: occupation || null,
      client_code: code ?? null,
    })
    .select("client_id, client_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clientId: data.client_id, clientCode: data.client_code });
}
