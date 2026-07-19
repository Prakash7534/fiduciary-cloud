// app/api/clients/route.ts — create a new client profile with mandatory fields
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { full_name, email, phone, pan, dob } = body;

  // Validate all 5 mandatory fields
  const missing: string[] = [];
  if (!full_name?.trim()) missing.push("Full name");
  if (!email?.trim())     missing.push("Email");
  if (!phone?.trim())     missing.push("Mobile number");
  if (!pan?.trim())       missing.push("PAN");
  if (!dob)               missing.push("Date of birth");
  if (missing.length) return NextResponse.json({ error: `Required: ${missing.join(", ")}` }, { status: 400 });

  // Duplicate PAN check (within this adviser's clients)
  const { data: existing } = await supabase
    .from("clients").select("client_id, full_name")
    .eq("user_id", user.id).eq("pan", pan.toUpperCase()).maybeSingle();
  if (existing) return NextResponse.json({ error: `A client with this PAN already exists: ${existing.full_name}` }, { status: 409 });

  // Generate UCC
  const { data: code } = await supabase.rpc("generate_client_code", { p_user_id: user.id });

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id:     user.id,
      full_name:   full_name.trim(),
      email:       email.trim().toLowerCase(),
      phone:       phone.trim(),
      pan:         pan.trim().toUpperCase(),
      dob,
      client_code: code ?? null,
    })
    .select("client_id, client_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clientId: data.client_id, clientCode: data.client_code });
}
