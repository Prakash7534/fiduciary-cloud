// lib/constructionEngine.ts — Gap-based portfolio construction engine
//
// Philosophy:
//   The SAA (from the client's risk profile) defines TARGET weights per asset class.
//   The engine measures the CURRENT portfolio (executed positions + existing holdings),
//   computes the GAP to target after adding new money, and distributes the new
//   investment (lumpsum and/or SIP) to close the most underweight classes first.
//   This means: whatever the client actually invested last time (more or less than
//   proposed), the next round of money is always steered back toward the SAA.

import type { UniverseRow } from "./allocationEngine";
import { scoreInstrument } from "./allocationEngine";

export interface ClassGap {
  assetClass: string;
  targetPct: number;      // SAA weight
  currentValue: number;   // ₹ currently invested (executed + holdings)
  currentPct: number;     // % of current portfolio
  targetValue: number;    // ₹ target AFTER new lumpsum is added
  gapValue: number;       // ₹ deficit (+ = underweight, − = overweight)
  allocLumpsum: number;   // ₹ of new lumpsum routed to this class
  allocSip: number;       // ₹/mo of new SIP routed to this class
}

export interface GapPlan {
  totalCurrent: number;
  newLumpsum: number;
  newSip: number;
  classes: ClassGap[];
  postLumpsumDriftPct: number; // max |current−target| after distribution
}

export interface ProposedLine {
  instrument_id: string;
  name: string;
  asset_class: string;
  category: string | null;
  lumpsum: number;
  sip: number;
  weightPct: number;   // share of total new money
}

// ── current value per asset class ────────────────────────────────────────────
export function currentValueByClass(
  positions: { asset_class: string; status: string; executed_lumpsum: number; current_value: number | null }[],
  holdings:  { asset_class: string; current_value: number | null; lumpsum_invested: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  positions.forEach(p => {
    if (p.status !== "executed") return;
    const v = (p.current_value ?? 0) > 0 ? (p.current_value ?? 0) : p.executed_lumpsum;
    out[p.asset_class] = (out[p.asset_class] ?? 0) + v;
  });
  holdings.forEach(h => {
    const v = (h.current_value ?? 0) > 0 ? (h.current_value ?? 0) : h.lumpsum_invested;
    out[h.asset_class] = (out[h.asset_class] ?? 0) + v;
  });
  return out;
}

// ── gap plan ─────────────────────────────────────────────────────────────────
export function buildGapPlan(
  saa: Record<string, number>,          // {Equity: 65, Debt: 25, ...}
  currentByClass: Record<string, number>,
  newLumpsum: number,
  newSip: number
): GapPlan {
  const classes = Object.keys(saa).filter(c => saa[c] > 0);
  // Include any class the client currently holds that is not in SAA (treat target 0)
  Object.keys(currentByClass).forEach(c => { if (!classes.includes(c) && currentByClass[c] > 0) classes.push(c); });

  const totalCurrent = Object.values(currentByClass).reduce((s, v) => s + v, 0);
  const totalAfter   = totalCurrent + newLumpsum;

  // Deficits vs post-money target
  const raw = classes.map(c => {
    const targetPct   = saa[c] ?? 0;
    const currentValue = currentByClass[c] ?? 0;
    const targetValue = totalAfter * targetPct / 100;
    const gapValue    = targetValue - currentValue;   // + underweight
    return { assetClass: c, targetPct, currentValue, targetValue, gapValue };
  });

  // ── Distribute LUMPSUM: deficit-proportional waterfall ─────────────────────
  const totalDeficit = raw.reduce((s, r) => s + Math.max(0, r.gapValue), 0);
  const allocLump: Record<string, number> = {};
  if (newLumpsum > 0) {
    if (totalDeficit <= 0) {
      // Portfolio already at/above target everywhere → fall back to SAA weights
      raw.forEach(r => { allocLump[r.assetClass] = newLumpsum * r.targetPct / 100; });
    } else if (totalDeficit >= newLumpsum) {
      // Not enough money to close all gaps → fill proportional to deficit
      raw.forEach(r => {
        allocLump[r.assetClass] = Math.max(0, r.gapValue) / totalDeficit * newLumpsum;
      });
    } else {
      // Enough to close all gaps → close them fully, then distribute the excess by SAA
      const excess = newLumpsum - totalDeficit;
      raw.forEach(r => {
        allocLump[r.assetClass] = Math.max(0, r.gapValue) + excess * r.targetPct / 100;
      });
    }
  }

  // ── Distribute SIP: blend of SAA weight and deficit weight ─────────────────
  // 60% steered by deficit (rebalancing flow), 40% by SAA (steady accumulation).
  const allocSip: Record<string, number> = {};
  if (newSip > 0) {
    const defW: Record<string, number> = {};
    raw.forEach(r => { defW[r.assetClass] = totalDeficit > 0 ? Math.max(0, r.gapValue) / totalDeficit : 0; });
    raw.forEach(r => {
      const saaW = r.targetPct / 100;
      const blend = totalDeficit > 0 ? 0.6 * defW[r.assetClass] + 0.4 * saaW : saaW;
      allocSip[r.assetClass] = newSip * blend;
    });
    // Normalise to exactly newSip
    const sum = Object.values(allocSip).reduce((s, v) => s + v, 0);
    if (sum > 0) raw.forEach(r => { allocSip[r.assetClass] = allocSip[r.assetClass] / sum * newSip; });
  }

  const out: ClassGap[] = raw.map(r => {
    const currentPct = totalCurrent > 0 ? r.currentValue / totalCurrent * 100 : 0;
    return {
      ...r, currentPct,
      allocLumpsum: Math.round(allocLump[r.assetClass] ?? 0),
      allocSip:     Math.round(allocSip[r.assetClass] ?? 0),
    };
  });

  // Post-distribution drift
  let maxDrift = 0;
  out.forEach(r => {
    const after = totalAfter > 0 ? (r.currentValue + r.allocLumpsum) / totalAfter * 100 : 0;
    maxDrift = Math.max(maxDrift, Math.abs(after - r.targetPct));
  });

  return { totalCurrent, newLumpsum, newSip, classes: out, postLumpsumDriftPct: Math.round(maxDrift * 10) / 10 };
}

// ── instrument picking per class ─────────────────────────────────────────────
const CLASS_CATEGORIES: Record<string, string[]> = {
  Equity:        ["Large Cap", "Flexi Cap", "Index", "Mid Cap", "Small Cap", "Thematic", "Active"],
  Debt:          ["Liquid", "Short Duration", "Medium Duration", "Money Market", "Corporate Bond", "Gilt"],
  Gold:          ["Gold ETF", "Gold Fund", "SGB"],
  International: ["Index", "Active", "International"],
  Hybrid:        ["Balanced Adv", "Aggressive Hybrid", "Conservative Hybrid"],
  Alternate:     ["REIT", "InvIT", "AIF"],
};

export function proposeInstruments(
  universe: UniverseRow[],
  gapPlan: GapPlan,
  concentrationCapPct: number,   // max % of TOTAL portfolio per instrument
  excludeIds: string[] = []
): ProposedLine[] {
  const lines: ProposedLine[] = [];
  const totalNew = gapPlan.newLumpsum + gapPlan.newSip * 12; // annualised weight basis
  const totalAfter = gapPlan.totalCurrent + gapPlan.newLumpsum;
  const capValue = totalAfter * concentrationCapPct / 100;   // ₹ cap per instrument (lumpsum basis)

  gapPlan.classes.forEach(cls => {
    if (cls.allocLumpsum <= 0 && cls.allocSip <= 0) return;

    // Eligible instruments for this class, best score first
    const pool = universe
      .filter(u => (u.asset_class ?? "") === cls.assetClass)
      .filter(u => !excludeIds.includes(u.instrument_id))
      .sort((a, b) => scoreInstrument(b) - scoreInstrument(a));
    if (pool.length === 0) return;

    // Number of instruments needed so no single one breaches the cap
    const needed = capValue > 0 ? Math.max(1, Math.ceil(cls.allocLumpsum / capValue)) : 1;
    const picks  = pool.slice(0, Math.min(Math.max(needed, cls.allocLumpsum > 200000 ? 2 : 1), 3));

    const perLump = picks.length > 0 ? cls.allocLumpsum / picks.length : 0;
    const perSip  = picks.length > 0 ? cls.allocSip / picks.length : 0;

    picks.forEach(u => {
      const weight = totalNew > 0 ? (perLump + perSip * 12) / totalNew * 100 : 0;
      lines.push({
        instrument_id: u.instrument_id,
        name: u.name ?? u.instrument_id,
        asset_class: cls.assetClass,
        category: u.category,
        lumpsum: Math.round(perLump),
        sip: Math.round(perSip),
        weightPct: Math.round(weight * 10) / 10,
      });
    });
  });

  return lines;
}
