// app/(app)/clients/[id]/recommendations/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { profileFromAnswers } from "@/lib/riskEngine";
import type { RiskAnswer } from "@/lib/riskEngine";
import { BASE_ALLOCATION } from "@/lib/allocationEngine";
import type { UniverseRow } from "@/lib/allocationEngine";
import { currentValueByClass } from "@/lib/constructionEngine";
import RecommendationsClient from "./_client";

const PROFILE_TO_SAA: Record<string, string> = {
  "Conservative": "Conservative", "Moderately Conservative": "Moderate Conservative",
  "Balanced / Moderate": "Moderate", "Moderately Aggressive": "Moderate Aggressive", "Aggressive": "Aggressive",
};

export default async function RecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: answersRaw }, { data: universe }, { data: positions }, { data: holdings }, { data: recs }] = await Promise.all([
    supabase.from("clients").select("full_name, client_code, risk_override, concentration_cap, allocation_overrides").eq("client_id", id).single(),
    supabase.from("risk_answers").select("*").eq("client_id", id),
    supabase.from("investment_universe").select("*").order("asset_class"),
    supabase.from("portfolio_positions").select("instrument_id, asset_class, status, executed_lumpsum, current_value, lumpsum_amount").eq("client_id", id),
    supabase.from("portfolio_holdings").select("asset_class, current_value, lumpsum_invested").eq("client_id", id),
    supabase.from("recommendations").select("*").eq("client_id", id).order("created_at", { ascending: false }),
  ]);
  if (error || !client) notFound();

  const answers: RiskAnswer[] = (answersRaw ?? []).map(r => ({ question_num: r.question_num as number, answer: r.answer as RiskAnswer["answer"] }));
  const engineProfile = profileFromAnswers(answers);
  const activeProfile = (client.risk_override as string | null) ?? engineProfile;
  const savedOv = client.allocation_overrides as Record<string, unknown> | null;
  const saa = ((savedOv?.asset_class as Record<string, number> | undefined) ?? BASE_ALLOCATION[PROFILE_TO_SAA[activeProfile] ?? "Moderate"]);

  const posRows = (positions ?? []).map(p => ({
    asset_class: p.asset_class as string, status: p.status as string,
    executed_lumpsum: Number(p.executed_lumpsum ?? 0),
    current_value: p.current_value != null ? Number(p.current_value) : null,
  }));
  const holdRows = (holdings ?? []).map(h => ({
    asset_class: h.asset_class as string,
    current_value: h.current_value != null ? Number(h.current_value) : null,
    lumpsum_invested: Number(h.lumpsum_invested ?? 0),
  }));
  const currentByClass = currentValueByClass(posRows, holdRows);
  const totalPortfolio = Object.values(currentByClass).reduce((s, v) => s + v, 0);

  // Existing ₹ per instrument — executed positions count at current/executed
  // value; non-executed (draft/pending/placed) positions and other pending
  // recommendations count too, at their proposed amount, so cap headroom
  // isn't overstated by ignoring money that's already spoken for elsewhere
  // (double-fill risk: two proposals for the same scrip, each computed as if
  // the other didn't exist, could jointly blow past the cap once both land).
  const byInstrument: Record<string, number> = {};
  (positions ?? []).forEach(p => {
    const key = p.instrument_id as string;
    if (!key) return;
    const v = p.status === "executed"
      ? (Number(p.current_value ?? 0) > 0 ? Number(p.current_value) : Number(p.executed_lumpsum ?? 0))
      : Number(p.lumpsum_amount ?? 0);
    byInstrument[key] = (byInstrument[key] ?? 0) + v;
  });
  (recs ?? []).forEach(r => {
    if (r.status !== "recommended") return; // executed already lives in portfolio_positions; rejected doesn't count
    const key = r.instrument_id as string | null;
    if (!key) return;
    byInstrument[key] = (byInstrument[key] ?? 0) + Number(r.suggested_amount ?? 0);
  });

  return (
    <RecommendationsClient
      clientId={id}
      clientCode={client.client_code ?? ""}
      clientName={client.full_name ?? ""}
      profile={activeProfile}
      saa={saa}
      currentByClass={currentByClass}
      totalPortfolio={totalPortfolio}
      byInstrument={byInstrument}
      capPct={Number(client.concentration_cap ?? 5)}
      universe={(universe ?? []) as UniverseRow[]}
      initialRecs={(recs ?? []) as Record<string, unknown>[]}
    />
  );
}
