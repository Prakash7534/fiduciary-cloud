// lib/assumptions.ts
// Single source of truth for the adviser's planning assumptions — the "master
// controller" for assumed asset-class returns, the default goal return and the
// inflation rate. Stored per adviser on firm_settings; resolved here with
// backward-compatible defaults so every planning engine and page uses the same
// numbers. When the adviser hasn't set a value, DEFAULT_ASSUMPTIONS reproduces
// the figures the app used before this feature existed (no silent changes).

export interface Assumptions {
  inflation: number;         // % p.a. — goal cost inflation
  defaultGoalReturn: number; // % p.a. — expected return used in goal projections when a goal has no explicit return
  equity: number;            // % p.a. — assumed return on Equity
  debt: number;              // % p.a. — assumed return on Debt
  gold: number;              // % p.a. — assumed return on Gold
  international: number;      // % p.a. — assumed return on International
  alternate: number;         // % p.a. — assumed return on Alternate (REITs/AIF/InvIT)
  hybrid: number;            // % p.a. — assumed return on Hybrid
}

// Defaults chosen so bucketReturn() reproduces the previous hard-coded
// short/medium/long returns of 7 / 10 / 13 % (debt=7, (equity+debt)/2=10,
// equity=13) and goalCalc keeps 10 % / 6 %.
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  inflation: 6,
  defaultGoalReturn: 10,
  equity: 13,
  debt: 7,
  gold: 8,
  international: 13,
  alternate: 10,
  hybrid: 9,
};

// Labels + which firm_settings column backs each field (used by the Settings UI).
export const ASSUMPTION_FIELDS: { key: keyof Assumptions; col: string; label: string; hint: string }[] = [
  { key: "inflation",         col: "assume_inflation",   label: "Inflation rate",           hint: "Goal cost inflation (used to grow today's cost to the target year)" },
  { key: "defaultGoalReturn", col: "assume_goal_return", label: "Default goal return",      hint: "Expected portfolio return used in goal projections when a goal has no explicit return" },
  { key: "equity",            col: "assume_equity",      label: "Equity return",            hint: "Assumed long-run return on Equity" },
  { key: "debt",              col: "assume_debt",        label: "Debt return",              hint: "Assumed return on Debt / fixed income" },
  { key: "gold",              col: "assume_gold",        label: "Gold return",              hint: "Assumed return on Gold" },
  { key: "international",      col: "assume_intl",        label: "International return",      hint: "Assumed return on International equity" },
  { key: "alternate",         col: "assume_alternate",   label: "Alternate return",         hint: "Assumed return on REITs / InvITs / AIF" },
  { key: "hybrid",            col: "assume_hybrid",      label: "Hybrid return",            hint: "Assumed return on Hybrid / balanced strategies" },
];

function num(v: unknown, d: number): number {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Merge a firm_settings row (or null) over the defaults.
export function resolveAssumptions(firm: Record<string, unknown> | null | undefined): Assumptions {
  const f = firm ?? {};
  return {
    inflation:         num(f.assume_inflation,   DEFAULT_ASSUMPTIONS.inflation),
    defaultGoalReturn: num(f.assume_goal_return, DEFAULT_ASSUMPTIONS.defaultGoalReturn),
    equity:            num(f.assume_equity,      DEFAULT_ASSUMPTIONS.equity),
    debt:              num(f.assume_debt,        DEFAULT_ASSUMPTIONS.debt),
    gold:              num(f.assume_gold,        DEFAULT_ASSUMPTIONS.gold),
    international:      num(f.assume_intl,        DEFAULT_ASSUMPTIONS.international),
    alternate:         num(f.assume_alternate,   DEFAULT_ASSUMPTIONS.alternate),
    hybrid:            num(f.assume_hybrid,      DEFAULT_ASSUMPTIONS.hybrid),
  };
}

// Expected return for a goal-horizon bucket, derived from the asset-class
// assumptions: short -> debt, medium -> blend of equity & debt, long -> equity.
export function bucketReturn(bucket: "short" | "medium" | "long", a: Assumptions): number {
  if (bucket === "short") return a.debt;
  if (bucket === "medium") return Math.round((a.equity + a.debt) / 2 * 10) / 10;
  return a.equity;
}

// Map an asset class to its assumed return.
export function classReturn(assetClass: string, a: Assumptions): number {
  switch (assetClass) {
    case "Equity":        return a.equity;
    case "Debt":          return a.debt;
    case "Gold":          return a.gold;
    case "International":  return a.international;
    case "Alternate":     return a.alternate;
    case "Hybrid":        return a.hybrid;
    default:              return a.defaultGoalReturn;
  }
}

// SAA-weighted expected return across the given asset classes (or all classes
// present in the SAA map). This is what makes the required goal SIP reflect the
// adviser's equity/debt/gold/international/alternate return assumptions in the
// proportions of the client's strategic allocation, instead of a flat number.
export function blendedReturn(saa: Record<string, number>, a: Assumptions, classes?: string[]): number {
  const keys = classes && classes.length ? classes : Object.keys(saa);
  let w = 0, r = 0;
  for (const c of keys) { const wt = saa[c] ?? 0; if (wt > 0) { w += wt; r += wt * classReturn(c, a); } }
  return w > 0 ? Math.round((r / w) * 100) / 100 : a.defaultGoalReturn;
}
