// app/(app)/(main)/investment-universe/page.tsx
import { createClient } from "@/lib/supabase/server";
import UniverseClient from "./_client";

export default async function InvestmentUniversePage() {
  const supabase = await createClient();
  const { data: instruments } = await supabase
    .from("investment_universe")
    .select("*")
    .order("asset_class")
    .order("category");

  return <UniverseClient initialData={instruments ?? []} />;
}
