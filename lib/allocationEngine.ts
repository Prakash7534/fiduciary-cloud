// lib/allocationEngine.ts — Bucket-based allocation engine
// Combines risk profile (SAA) with goal time horizons to produce
// an instrument-level allocation plan with per-goal SIP mapping.

export type GoalBucket = "short" | "medium" | "long";

export interface UniverseRow {
  instrument_id: string; name: string | null; instrument_type: string | null;
  asset_class: string | null; category: string | null; sub_bucket: string | null;
  risk_level: string | null; expense_ratio: number | null;
  return_3y: number | null; return_5y: number | null;
  min_sip: number | null; isin: string | null; ticker: string | null;
  current_price: number | null; price_date: string | null;
}

export interface GoalInput {
  goal_id: string; goal_name: string | null; target_year: number | null;
  cost_today: number | null; saved: number | null; monthly_sip: number | null;
  inflation_pct: number | null; return_pct: number | null;
  priority: string | null; flexibility: string | null;
}

export interface InstrumentPick {
  instrument_id: string; name: string; asset_class: string;
  category: string | null; instrument_type: string | null;
  return_5y: number | null; return_3y: number | null;
  expense_ratio: number | null; min_sip: number | null;
  score: number; weight: number; // weight within its bucket/class (0-100)
  suggested_sip: number; // ₹/month
}

export interface BucketPlan {
  bucket: GoalBucket;
  label: string; horizon: string;
  goals: GoalInput[];
  totalRequired: number;   // ₹ future value needed
  totalShortfall: number;  // ₹/month gap
  allocation_pct: number;  // % of total portfolio
  instruments: InstrumentPick[];
}

export interface GoalMapping {
  goal: GoalInput;
  bucket: GoalBucket;
  requiredSIP: number;
  instruments: { instrument_id: string; name: string; sip: number }[];
}

export interface AllocationPlan {
  profile: string;
  assetAllocation: Record<string, number>; // {Equity: 50, Debt: 40, ...}
  buckets: BucketPlan[];
  goalMappings: GoalMapping[];
  totalMonthlySIP: number;
  totalPortfolioValue: number; // all goals' future value
  monthlySurplus: number;
  surplusAfterSIP: number;
}

// ── Base SAA by risk profile ─────────────────────────────────────────────────
export const BASE_ALLOCATION: Record<string, Record<string, number>> = {
  "Conservative":          { Equity: 20, Debt: 65, Gold: 8,  International: 5, Alternate: 2 },
  "Moderate Conservative": { Equity: 35, Debt: 55, Gold: 7,  International: 3, Alternate: 0 },
  "Moderate":              { Equity: 50, Debt: 40, Gold: 5,  International: 5, Alternate: 0 },
  "Moderate Aggressive":   { Equity: 65, Debt: 25, Gold: 5,  International: 5, Alternate: 0 },
  "Aggressive":            { Equity: 80, Debt: 12, Gold: 5,  International: 3, Alternate: 0 },
};

// Asset classes that fit each bucket
export const BUCKET_CLASSES: Record<GoalBucket, string[]> = {
  short:  ["Debt"],
  medium: ["Debt", "Hybrid", "Gold"],
  long:   ["Equity", "International", "Gold", "Alternate"],
};

const BUCKET_CATEGORIES: Record<GoalBucket, string[]> = {
  short:  ["Liquid", "Short Duration", "Money Market"],
  medium: ["Balanced Adv", "Aggressive Hybrid", "Conservative Hybrid",
           "Medium Duration", "Short Duration", "Gold ETF", "Gold Fund"],
  long:   ["Large Cap", "Flexi Cap", "Mid Cap", "Small Cap", "Index",
           "Thematic", "Gold ETF", "SGB", "Index", "Active"],
};

const THIS_YEAR = new Date().getFullYear();

// ── Helpers ──────────────────────────────────────────────────────────────────
function classify(goal: GoalInput): GoalBucket {
  const years = (goal.target_year ?? THIS_YEAR + 5) - THIS_YEAR;
  if (years <= 3) return "short";
  if (years <= 7) return "medium";
  return "long";
}

function futureValue(amount: number, years: number, rate: number): number {
  return amount * Math.pow(1 + rate / 100, years);
}

function sipRequired(fv: number, saved: number, years: number, rate: number): number {
  const n = years * 12;
  const r = rate / 100 / 12;
  const savedFV = futureValue(saved, years, rate);
  const gap = Math.max(0, fv - savedFV);
  if (r === 0 || n === 0) return gap / n;
  return gap * r / ((Math.pow(1 + r, n) - 1) * (1 + r));
}

// Score an instrument: higher = better pick
export function scoreInstrument(inst: UniverseRow): number {
  const ret = inst.return_5y ?? inst.return_3y ?? 0;
  const er  = inst.expense_ratio ?? 1.0;
  return ret * 0.7 - er * 0.3;
}

// Select best instruments for a bucket/assetClass combo
function pickInstruments(
  universe: UniverseRow[],
  bucket: GoalBucket,
  targetAssetClass: string,
  maxPicks: number = 2
): UniverseRow[] {
  const catFilter = BUCKET_CATEGORIES[bucket];
  const candidates = universe.filter(u =>
    u.asset_class === targetAssetClass &&
    (catFilter.length === 0 || catFilter.some(c => (u.category ?? "").includes(c) || (u.sub_bucket ?? "").includes(c)))
  );
  if (!candidates.length) {
    // Fallback: any instrument in that asset class
    return universe.filter(u => u.asset_class === targetAssetClass)
      .sort((a, b) => scoreInstrument(b) - scoreInstrument(a))
      .slice(0, maxPicks);
  }
  return candidates
    .sort((a, b) => scoreInstrument(b) - scoreInstrument(a))
    .slice(0, maxPicks);
}

// ── Main engine ──────────────────────────────────────────────────────────────
export function buildAllocationPlan(
  profile: string,
  goals: GoalInput[],
  universe: UniverseRow[],
  monthlySurplus: number,
  overrides?: Record<string, number> // asset class % overrides
): AllocationPlan {

  // 1. Base SAA
  const baseAlloc: Record<string, number> = BASE_ALLOCATION[profile] ?? BASE_ALLOCATION["Moderate"] ?? { Equity: 50, Debt: 40, Gold: 5, International: 5, Alternate: 0 };
  const assetAllocation: Record<string, number> = overrides
    ? { ...baseAlloc, ...overrides }
    : { ...baseAlloc };

  // Normalise to 100
  const total = (Object.values(assetAllocation) as number[]).reduce((s, v) => s + v, 0);
  for (const k of Object.keys(assetAllocation)) assetAllocation[k] = Math.round((assetAllocation[k] ?? 0) / total * 100);

  // 2. Bucket goals
  const bucketGoals: Record<GoalBucket, GoalInput[]> = { short: [], medium: [], long: [] };
  for (const g of goals) bucketGoals[classify(g)].push(g);

  // 3. Adjust SAA for goal buckets
  const shortCount  = bucketGoals.short.length;
  const longCount   = bucketGoals.long.length;
  if (shortCount > 0 && !overrides) {
    const shift = Math.min(15, shortCount * 5);
    assetAllocation["Debt"]   = (assetAllocation["Debt"]   ?? 0) + shift;
    assetAllocation["Equity"] = Math.max(0, (assetAllocation["Equity"] ?? 0) - shift);
  }
  if (longCount > 2 && !overrides) {
    const shift = Math.min(10, longCount * 3);
    assetAllocation["Equity"] = (assetAllocation["Equity"] ?? 0) + shift;
    assetAllocation["Debt"]   = Math.max(0, (assetAllocation["Debt"]   ?? 0) - shift);
  }
  // Re-normalise
  const total2 = (Object.values(assetAllocation) as number[]).reduce((s, v) => s + v, 0);
  for (const k of Object.keys(assetAllocation)) assetAllocation[k] = Math.round((assetAllocation[k] ?? 0) / total2 * 100);

  // 4. Build bucket plans
  const bucketMeta: Record<GoalBucket, { label: string; horizon: string }> = {
    short:  { label: "Short-term",  horizon: "≤ 3 years"  },
    medium: { label: "Medium-term", horizon: "3 – 7 years" },
    long:   { label: "Long-term",   horizon: "> 7 years"  },
  };

  let totalMonthlySIP = 0;
  const goalMappings: GoalMapping[] = [];
  const buckets: BucketPlan[] = (["short", "medium", "long"] as GoalBucket[]).map(bucket => {
    const bGoals = bucketGoals[bucket];
    let bucketRequired = 0;
    let bucketSIP = 0;

    for (const g of bGoals) {
      const years   = Math.max(1, (g.target_year ?? THIS_YEAR + 5) - THIS_YEAR);
      const infl    = g.inflation_pct ?? 6;
      const ret     = g.return_pct ?? (bucket === "short" ? 7 : bucket === "medium" ? 10 : 13);
      const fv      = futureValue(g.cost_today ?? 0, years, infl);
      const sip     = sipRequired(fv, g.saved ?? 0, years, ret);
      bucketRequired += fv;
      bucketSIP += sip;
    }
    totalMonthlySIP += bucketSIP;

    // Determine asset classes for this bucket
    const relevantClasses = BUCKET_CLASSES[bucket].filter(c => (assetAllocation[c] ?? 0) > 0);
    const allInstruments: InstrumentPick[] = [];

    for (const ac of relevantClasses) {
      const picks = pickInstruments(universe, bucket, ac, 2);
      if (!picks.length) continue;
      const scores = picks.map(p => Math.max(0.1, scoreInstrument(p)));
      const sumScore = scores.reduce((s, v) => s + v, 0);

      picks.forEach((p, i) => {
        const classWeight = (assetAllocation[ac] ?? 0) / relevantClasses.length; // equal split between classes
        const instWeight  = scores[i] / sumScore * 100;
        const sip         = Math.round(bucketSIP * (classWeight / 100) * (instWeight / 100));
        allInstruments.push({
          instrument_id: p.instrument_id, name: p.name ?? p.instrument_id,
          asset_class: p.asset_class ?? ac, category: p.category,
          instrument_type: p.instrument_type, return_5y: p.return_5y, return_3y: p.return_3y,
          expense_ratio: p.expense_ratio, min_sip: p.min_sip,
          score: Math.round(scoreInstrument(p) * 10) / 10,
          weight: Math.round(instWeight),
          suggested_sip: sip,
        });
      });
    }

    // Build goal mappings for this bucket
    for (const g of bGoals) {
      const years  = Math.max(1, (g.target_year ?? THIS_YEAR + 5) - THIS_YEAR);
      const infl   = g.inflation_pct ?? 6;
      const ret    = g.return_pct ?? (bucket === "short" ? 7 : bucket === "medium" ? 10 : 13);
      const fv     = futureValue(g.cost_today ?? 0, years, infl);
      const sip    = sipRequired(fv, g.saved ?? 0, years, ret);

      goalMappings.push({
        goal: g,
        bucket,
        requiredSIP: Math.round(sip),
        instruments: allInstruments.slice(0, 2).map(inst => ({
          instrument_id: inst.instrument_id,
          name: inst.name,
          sip: Math.round(sip * (inst.weight / 100)),
        })),
      });
    }

    const alloc_pct = relevantClasses.reduce((s, c) => s + (assetAllocation[c] ?? 0), 0);
    return {
      bucket, ...bucketMeta[bucket],
      goals: bGoals,
      totalRequired: Math.round(bucketRequired),
      totalShortfall: Math.round(bucketSIP),
      allocation_pct: alloc_pct,
      instruments: allInstruments,
    };
  });

  return {
    profile,
    assetAllocation,
    buckets,
    goalMappings,
    totalMonthlySIP: Math.round(totalMonthlySIP),
    totalPortfolioValue: buckets.reduce((s, b) => s + b.totalRequired, 0),
    monthlySurplus,
    surplusAfterSIP: Math.round(monthlySurplus - totalMonthlySIP),
  };
}
