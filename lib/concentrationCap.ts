// lib/concentrationCap.ts
// Single source of truth for turning a concentration-cap % into a ₹ ceiling
// per instrument (Fix #6). Portfolio Construction and Recommendations
// previously sized the same % against two different bases — Construction
// used current-portfolio-value-PLUS-the-new-money-being-deployed, while
// Recommendations used current-portfolio-value-only — so "5% cap" meant a
// different ₹ figure depending which screen you were on.
//
// Basis = current executed portfolio value (positions + holdings), not
// current-plus-proposed. A post-trade denominator is the wrong direction for
// a risk control: adding money anywhere else in the same round inflates the
// total and loosens the cap for every other instrument. Current-value-only
// is the stricter, more conservative reading, and never produces a smaller
// ₹ ceiling than the post-trade version would.
//
// The one exception is a brand-new/zero-value portfolio, where there is no
// current base to measure against at all — there we fall back to the money
// being deployed right now so day-1 construction isn't blocked entirely.
export function capBasisValue(totalCurrent: number, pendingNew: number): number {
  return totalCurrent > 0 ? totalCurrent : totalCurrent + pendingNew;
}

export function capValueRupees(totalCurrent: number, pendingNew: number, capPct: number): number {
  return capBasisValue(totalCurrent, pendingNew) * capPct / 100;
}
