// lib/priceStaleness.ts
// Shared "as at" price-date logic (Fix #5) — used wherever a current_price is
// shown so an adviser or client can tell how fresh a figure is before relying
// on it, instead of an undated number that reads as live.

export function priceAgeDays(priceDate: string | null | undefined): number | null {
  if (!priceDate) return null;
  const d = new Date(priceDate);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export type Staleness = "fresh" | "aging" | "stale" | "unknown";

export function staleness(priceDate: string | null | undefined): Staleness {
  const days = priceAgeDays(priceDate);
  if (days == null) return "unknown";
  if (days <= 3) return "fresh";
  if (days <= 14) return "aging";
  return "stale";
}

export const STALENESS_CLASS: Record<Staleness, string> = {
  fresh: "text-[#6B7E86]",
  aging: "text-[#8B4A10]",
  stale: "text-[#B4463C] font-medium",
  unknown: "text-[#A8BDC3]",
};

export function asAtLabel(priceDate: string | null | undefined): string {
  if (!priceDate) return "no price date";
  const days = priceAgeDays(priceDate);
  const dateStr = priceDate.slice(0, 10);
  if (days == null) return `as at ${dateStr}`;
  if (days === 0) return `as at ${dateStr} (today)`;
  if (days === 1) return `as at ${dateStr} (1 day old)`;
  return `as at ${dateStr} (${days} days old)`;
}
