// app/(app)/(main)/settings/page.tsx — firm settings + master planning assumptions
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DEFAULT_ASSUMPTIONS } from "@/lib/assumptions";
import SettingsClient from "./_client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: firm } = await supabase
    .from("firm_settings").select("*").eq("user_id", user.id).maybeSingle();

  return <SettingsClient initial={(firm ?? {}) as Record<string, unknown>} defaults={DEFAULT_ASSUMPTIONS} />;
}
