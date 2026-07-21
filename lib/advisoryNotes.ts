// lib/advisoryNotes.ts
// Assist engine for the Advisory Notes workspace. Pure function: takes already-
// computed analysis primitives (from riskEngine / financialPosition / goalCalc /
// construction) plus client preferences, and returns a structured "assist
// bundle" — highlights, red flags, preferences, portfolio posture, cross-cutting
// talking-point hints, and ready-to-insert suggestion sentences per summary
// field. The adviser reads the bundle and writes a sound, client-specific
// summary; nothing here is auto-committed as advice.

export type Tone = "good" | "warn" | "bad" | "neutral";

export interface AssistItem { label: string; value: string; tone?: Tone; }
export interface FlagItem { name: string; val: string; why: string; }

export const ADV_FIELDS = [
  "adv_summary",
  "adv_client_profile",
  "adv_considerations",
  "adv_suitability",
  "adv_next_steps",
] as const;
export type AdvField = (typeof ADV_FIELDS)[number];

export interface AdvisoryAssistInput {
  clientName: string;
  firstName: string;
  activeProfile: string;
  engineProfile: string;
  isOverridden: boolean;
  overrideRationale: string | null;
  capRank: number;               // 1-5
  tolRank: number;               // 1-5
  age: number | null;
  yearsToRetirement: number | null;
  annualIncome: number;
  monthlySurplus: number | null;
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
  debtToIncome: number | null;   // ratio
  lifeCover: number;
  healthCover: number;
  flags: FlagItem[];             // bad-state flags only
  okFlagCount: number;
  goals: { name: string; fundedPct: number; gap: number; targetYear: number | null }[];
  totalExtraSip: number;
  totalLumpsumNow: number;
  saaDriftPct: number;
  topUnderweight: { assetClass: string; gapValue: number } | null;
  topOverweight: { assetClass: string; gapValue: number } | null;
  pendingRecos: number;
  executedValue: number;
  // client preferences (nullable free-text / enum values from financial_facts)
  prefs: {
    style_pref?: string | null; esg_pref?: string | null; intl_pref?: string | null;
    sector_pref?: string | null; restrictions?: string | null; review_freq?: string | null;
    decision_maker?: string | null; monitor_frequency?: string | null; past_experience?: string | null;
    income_need?: string | null; investment_horizon?: string | null; most_important_goal?: string | null;
    reason_for_investing?: string | null; invest_mode?: string | null;
  };
  behaviour: { beh1?: string | null; beh2?: string | null; beh3?: string | null };
}

export interface AdvisoryAssistBundle {
  highlights: AssistItem[];
  flags: FlagItem[];
  preferences: AssistItem[];
  portfolio: AssistItem[];
  hints: string[];
  suggestions: Record<AdvField, string[]>;
}

const cr = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};
const pct = (n: number) => `${Math.round(n)}%`;

export function buildAdvisoryAssist(inp: AdvisoryAssistInput): AdvisoryAssistBundle {
  const first = inp.firstName || inp.clientName || "The client";

  // ── Highlights ─────────────────────────────────────────────────────────────
  const highlights: AssistItem[] = [];
  highlights.push({ label: "Governing risk profile", value: inp.activeProfile,
    tone: inp.isOverridden ? "warn" : "neutral" });
  highlights.push({ label: "Net worth", value: cr(inp.netWorth),
    tone: inp.netWorth <= 0 ? "bad" : inp.netWorth >= inp.annualIncome * 3 ? "good" : "neutral" });
  if (inp.monthlySurplus != null)
    highlights.push({ label: "Monthly surplus", value: cr(inp.monthlySurplus),
      tone: inp.monthlySurplus <= 0 ? "bad" : "good" });
  highlights.push({ label: "Total assets", value: cr(inp.totalAssets), tone: "neutral" });
  highlights.push({ label: "Total debt", value: cr(inp.totalDebt),
    tone: inp.totalAssets > 0 && inp.totalDebt / inp.totalAssets > 0.5 ? "bad" : "neutral" });
  if (inp.debtToIncome != null)
    highlights.push({ label: "Debt-to-income", value: `${inp.debtToIncome.toFixed(1)}×`,
      tone: inp.debtToIncome > 3 ? "warn" : "neutral" });
  if (inp.yearsToRetirement != null)
    highlights.push({ label: "Years to retirement", value: `${inp.yearsToRetirement}`,
      tone: inp.yearsToRetirement < 5 ? "warn" : "neutral" });
  const lifeGap = inp.annualIncome * 10 - inp.lifeCover;
  if (inp.annualIncome > 0)
    highlights.push({ label: "Life-cover vs 10× income",
      value: lifeGap > 0 ? `gap ${cr(lifeGap)}` : "adequate",
      tone: lifeGap > 0 ? "warn" : "good" });

  // ── Preferences ────────────────────────────────────────────────────────────
  const P = inp.prefs;
  const preferences: AssistItem[] = [];
  const addPref = (label: string, v?: string | null) => { if (v && String(v).trim()) preferences.push({ label, value: String(v) }); };
  addPref("Most important goal", P.most_important_goal);
  addPref("Reason for investing", P.reason_for_investing);
  addPref("Investment style", P.style_pref);
  addPref("ESG preference", P.esg_pref);
  addPref("International exposure", P.intl_pref);
  addPref("Sector preferences", P.sector_pref);
  addPref("Restrictions / exclusions", P.restrictions);
  addPref("Income need", P.income_need);
  addPref("Investment horizon", P.investment_horizon);
  addPref("Investment mode", P.invest_mode);
  addPref("Decision maker", P.decision_maker);
  addPref("Monitoring frequency", P.monitor_frequency);
  addPref("Review frequency", P.review_freq);
  addPref("Past market experience", P.past_experience);
  if (inp.behaviour.beh1) preferences.push({ label: "On a 20% fall would", value: inp.behaviour.beh1 });

  // ── Portfolio posture ──────────────────────────────────────────────────────
  const portfolio: AssistItem[] = [];
  portfolio.push({ label: "SAA drift", value: pct(inp.saaDriftPct),
    tone: inp.saaDriftPct > 15 ? "warn" : "good" });
  if (inp.topUnderweight && inp.topUnderweight.gapValue > 0)
    portfolio.push({ label: "Most underweight", value: `${inp.topUnderweight.assetClass} (${cr(inp.topUnderweight.gapValue)} to target)`, tone: "warn" });
  if (inp.topOverweight && inp.topOverweight.gapValue < 0)
    portfolio.push({ label: "Most overweight", value: `${inp.topOverweight.assetClass} (${cr(-inp.topOverweight.gapValue)} over target)`, tone: "warn" });
  portfolio.push({ label: "Executed portfolio value", value: cr(inp.executedValue), tone: "neutral" });
  if (inp.pendingRecos > 0)
    portfolio.push({ label: "Pending recommendations", value: `${inp.pendingRecos}`, tone: "warn" });
  const behind = inp.goals.filter(g => g.fundedPct < 90);
  portfolio.push({ label: "Goals behind target", value: `${behind.length} of ${inp.goals.length}`,
    tone: behind.length ? "warn" : "good" });

  // ── Cross-cutting hints (talking points) ───────────────────────────────────
  const hints: string[] = [];
  if (inp.isOverridden)
    hints.push(`Profile is an adviser override (engine derived "${inp.engineProfile}"). Make sure the summary reflects the documented rationale.`);
  if (Math.abs(inp.capRank - inp.tolRank) >= 2)
    hints.push(`Capacity (rank ${inp.capRank}) and willingness (rank ${inp.tolRank}) diverge by ≥2 — advice is governed by the lower; explain this to the client.`);
  const liquidityFlag = inp.flags.some(f => /emergency|liquid|savings/i.test(f.name));
  if (liquidityFlag)
    hints.push("Liquidity/emergency-fund flag is open — sequence protection before fresh equity deployment.");
  if (lifeGap > 0 && inp.annualIncome > 0)
    hints.push(`Protection gap of ~${cr(lifeGap)} on life cover — address before wealth-building actions.`);
  if (inp.totalAssets > 0 && inp.totalDebt / inp.totalAssets > 0.5)
    hints.push("Leverage is high (debt > 50% of assets) — frame de-leveraging as a priority.");
  if (behind.length)
    hints.push(`${behind.length} goal(s) are behind target — quantify the extra ${cr(inp.totalExtraSip)}/mo (or ${cr(inp.totalLumpsumNow)} lumpsum) needed.`);
  if (P.esg_pref && /yes|prefer|important/i.test(P.esg_pref))
    hints.push("Client values ESG — note how the proposed instruments respect that preference.");
  if (P.restrictions && P.restrictions.trim())
    hints.push(`Client has stated restrictions ("${P.restrictions.trim().slice(0, 60)}") — confirm the portfolio honours them.`);
  if (inp.saaDriftPct > 15)
    hints.push(`Portfolio drifts ${pct(inp.saaDriftPct)} from target allocation — a rebalancing rationale strengthens the note.`);
  if (inp.pendingRecos > 0)
    hints.push(`${inp.pendingRecos} recommendation(s) are awaiting client action — reference their status.`);
  if (hints.length === 0)
    hints.push("No open flags — a concise confirmation of suitability and a clear next-review cadence is sufficient.");

  // ── Ready-to-insert suggestion sentences ───────────────────────────────────
  const goalName = P.most_important_goal || (inp.goals[0]?.name ?? "their stated goals");
  const S: Record<AdvField, string[]> = {
    adv_summary: [
      `${first} has been assessed as a ${inp.activeProfile} investor${inp.yearsToRetirement != null ? ` with approximately ${inp.yearsToRetirement} years to retirement` : ""}, and this note summarises the advisory services provided and the basis for the advice.`,
      `Current net worth is ${cr(inp.netWorth)} against ${cr(inp.annualIncome)} annual income; the advice focuses on ${goalName}.`,
      inp.isOverridden
        ? `The governing risk profile reflects an adviser override of the engine-derived "${inp.engineProfile}", for the documented reasons.`
        : `The recommended strategy aligns the portfolio to the strategic asset allocation appropriate for a ${inp.activeProfile} profile.`,
    ],
    adv_client_profile: [
      P.most_important_goal ? `The client's foremost priority is ${P.most_important_goal}.` : `Goals were reviewed and prioritised with the client.`,
      P.style_pref ? `Preferred investing style: ${P.style_pref}.` : "",
      P.esg_pref ? `ESG preference recorded as "${P.esg_pref}".` : "",
      P.restrictions ? `The client has specified restrictions/exclusions: ${P.restrictions}.` : "",
      P.decision_maker ? `Investment decisions are made by ${P.decision_maker}; reviews are expected ${P.review_freq || "periodically"}.` : "",
    ].filter(Boolean),
    adv_considerations: [
      inp.flags.length
        ? `${inp.flags.length} risk observation(s) were identified: ${inp.flags.slice(0, 3).map(f => f.name).join("; ")}. Each has been discussed with the client.`
        : "No material red flags were identified across liquidity, protection, leverage and concentration checks.",
      Math.abs(inp.capRank - inp.tolRank) >= 2
        ? "The client's ability and willingness to take risk diverge; per SEBI suitability the lower of the two governs the advice."
        : "",
      lifeGap > 0 ? `A protection gap of approximately ${cr(lifeGap)} on life cover was flagged and should be closed before scaling investments.` : "",
    ].filter(Boolean),
    adv_suitability: [
      `The recommended asset mix is consistent with the client's ${inp.activeProfile} risk profile and ${inp.yearsToRetirement != null ? `${inp.yearsToRetirement}-year horizon to retirement` : "stated horizon"}.`,
      `Instrument selection respects the concentration cap and the client's recorded preferences${P.esg_pref ? " (including ESG)" : ""}.`,
      behind.length
        ? `Goal funding gaps are addressed through an additional ${cr(inp.totalExtraSip)}/month SIP (or ${cr(inp.totalLumpsumNow)} lumpsum today), keeping the plan on track.`
        : "Existing contributions keep the client's goals on track under the assumed return and inflation.",
    ],
    adv_next_steps: [
      behind.length ? `Increase systematic investments by ${cr(inp.totalExtraSip)}/month to close the funding gap.` : "Maintain current systematic contributions and stay invested through the cycle.",
      inp.saaDriftPct > 15 ? `Rebalance toward the target allocation (currently ${pct(inp.saaDriftPct)} adrift).` : "Rebalance annually or on a 5%+ drift from target.",
      inp.pendingRecos > 0 ? `Confirm the client's decision on ${inp.pendingRecos} pending recommendation(s).` : "",
      "Agree the next review date and the metrics to be reviewed.",
    ].filter(Boolean),
  };

  return { highlights, flags: inp.flags, preferences, portfolio, hints, suggestions: S };
}
