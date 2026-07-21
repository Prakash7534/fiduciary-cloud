// lib/goalSip.ts
// Single source of truth for the "required monthly SIP across all goals" figure,
// so it is IDENTICAL on the Goal Calculator, Asset Allocation and Portfolio
// Construction pages. It is live-portfolio-aware (nets executed positions &
// holdings) and uses each goal's SAA-blended expected return per horizon.
import { goalCalc, type GoalRow } from "./riskEngine";
import { computeGoalLiveAmounts } from "./goalNetting";
import { goalExpectedReturn } from "./allocationEngine";
import { type Assumptions, DEFAULT_ASSUMPTIONS } from "./assumptions";

type Row = Record<string, unknown>;

export function totalRequiredSip(
  goals: GoalRow[],
  positions: Row[],
  holdings: Row[],
  saa: Record<string, number>,
  a: Assumptions = DEFAULT_ASSUMPTIONS,
  thisYear: number = new Date().getFullYear()
): number {
  const pos = positions.map((p) => ({
    goal_id: (p.goal_id as string | null) ?? null,
    status: (p.status as string | null) ?? null,
    executed_lumpsum: (p.executed_lumpsum as number | null) ?? null,
    executed_sip: (p.executed_sip as number | null) ?? null,
    current_value: (p.current_value as number | null) ?? null,
    executed_at: (p.executed_at as string | null) ?? null,
  }));
  const hold = holdings.map((h) => ({
    current_value: (h.current_value as number | null) ?? null,
    lumpsum_invested: (h.lumpsum_invested as number | null) ?? null,
    monthly_sip: (h.monthly_sip as number | null) ?? null,
    added_at: (h.added_at as string | null) ?? null,
  }));

  const live = computeGoalLiveAmounts(goals, pos, hold, thisYear, a);
  let total = 0;
  for (const g of goals) {
    const { liveSaved, liveSip } = live[g.goal_id] ?? { liveSaved: 0, liveSip: 0 };
    const gLive = { ...g, saved: (g.saved ?? 0) + liveSaved, monthly_sip: (g.monthly_sip ?? 0) + liveSip };
    const gret = g.return_pct ?? goalExpectedReturn(g.target_year, saa, a, thisYear);
    total += goalCalc(gLive, thisYear, { ...a, defaultGoalReturn: gret }).extraSip;
  }
  return Math.round(total);
}
