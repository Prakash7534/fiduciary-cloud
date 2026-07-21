// lib/recommendationEngine.ts — suitability, cap headroom & disclosure engine
import type { UniverseRow } from "./allocationEngine";
import { capValueRupees } from "./concentrationCap";

const RISK_RANK: Record<string, number> = { "Low": 1, "Low-Medium": 2, "Medium": 3, "Medium-High": 4, "High": 5, "Very High": 5 };
const PROFILE_RANK: Record<string, number> = {
  "Conservative": 1, "Moderately Conservative": 2, "Balanced / Moderate": 3,
  "Moderately Aggressive": 4, "Aggressive": 5,
};

export interface RecInput {
  instrument: UniverseRow;
  clientProfile: string;                 // active risk profile
  saa: Record<string, number>;           // target allocation
  currentByClass: Record<string, number>;// current ₹ per class
  totalPortfolio: number;                // current total ₹
  existingInInstrument: number;          // ₹ already held in this instrument
  capPct: number;                        // concentration cap %
}

export interface RecAssessment {
  suitable: boolean;
  suitabilityNote: string;
  term: "Long term" | "Short term";
  termNote: string;
  capHeadroom: number;
  classGap: number;
  suggestedAmount: number;
  keyRisks: string[];
}

export function assessRecommendation(inp: RecInput): RecAssessment {
  const { instrument: u, clientProfile, saa, currentByClass, totalPortfolio, existingInInstrument, capPct } = inp;
  const ac = u.asset_class ?? "Equity";
  const instRisk = RISK_RANK[u.risk_level ?? "Medium"] ?? 3;
  const profRank = PROFILE_RANK[clientProfile] ?? 3;

  // ── Suitability: instrument risk must not exceed profile rank ──────────────
  const suitable = instRisk <= profRank;
  const suitabilityNote = suitable
    ? `${u.risk_level ?? "Medium"}-risk ${ac} instrument is within the client's ${clientProfile} profile (risk rank ${instRisk} <= profile rank ${profRank}). ${ac} carries a ${saa[ac] ?? 0}% target weight in the client's strategic allocation.`
    : `CAUTION: ${u.risk_level ?? "Medium"}-risk instrument EXCEEDS the client's ${clientProfile} profile (risk rank ${instRisk} > ${profRank}). Recommending requires documented justification and explicit client consent.`;

  // ── Term: from asset class / category ──────────────────────────────────────
  const cat = (u.category ?? "").toLowerCase();
  const isShort = ac === "Debt" && /liquid|money market|short/.test(cat);
  const term: "Long term" | "Short term" = isShort ? "Short term" : "Long term";
  const termNote = isShort
    ? "Short term — suited for parking, emergency funds or goals within 3 years."
    : ac === "Equity" || ac === "International"
      ? "Long term — equity accumulation is recommended only for horizons above 5 years; short-term volatility must be tolerated."
      : "Long term — hold through at least one full market cycle (3-5 years+).";

  // ── Concentration cap headroom ─────────────────────────────────────────────
  // Same basis as Portfolio Construction's cap check (lib/concentrationCap.ts) —
  // current portfolio value; no "pending new money" concept here since a
  // recommendation is a single ad-hoc opportunity, not a coordinated deployment.
  const capValue = capValueRupees(totalPortfolio, 0, capPct);
  const capHeadroom = Math.max(0, Math.round(capValue - existingInInstrument));

  // ── SAA class gap ──────────────────────────────────────────────────────────
  const targetVal = totalPortfolio * (saa[ac] ?? 0) / 100;
  const classGap = Math.max(0, Math.round(targetVal - (currentByClass[ac] ?? 0)));

  // Suggested = min(cap headroom, class gap); if class already at target, cap only
  const suggestedAmount = classGap > 0 ? Math.min(capHeadroom, classGap) : Math.min(capHeadroom, Math.round(capValue * 0.5));

  // ── Key risks / what the client should know ────────────────────────────────
  const keyRisks: string[] = [];
  if (ac === "Equity" || ac === "International")
    keyRisks.push("Market risk: value can fall significantly in the short term; only invest money not needed for 5+ years.");
  if (ac === "International")
    keyRisks.push("Currency risk: INR/USD movements affect returns; taxation follows debt-fund rules.");
  if (ac === "Debt")
    keyRisks.push("Interest-rate and credit risk: bond prices fall when rates rise; check credit quality of underlying papers.");
  if (ac === "Gold")
    keyRisks.push("Gold pays no income and can stagnate for long periods; treat as a 5-10 percent diversifier, not a core holding.");
  if (instRisk >= 4)
    keyRisks.push(`This is a ${u.risk_level}-risk instrument — drawdowns of 30 percent or more are possible in stress periods.`);
  if (!suitable)
    keyRisks.push("Risk level exceeds your assessed profile — you may be taking more risk than your capacity supports.");
  if (existingInInstrument > 0)
    keyRisks.push(`You already hold this instrument (existing exposure counted against the ${capPct}% concentration cap).`);
  keyRisks.push("This is a recommendation, not a guarantee. Past performance does not indicate future returns. You are free to reject it.");
  keyRisks.push("Buying at the 'consider price' is not assured — markets may move before execution.");

  return { suitable, suitabilityNote, term, termNote, capHeadroom, classGap, suggestedAmount, keyRisks };
}
