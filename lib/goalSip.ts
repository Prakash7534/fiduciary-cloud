// lib/goalSip.ts
// Single source of truth for the "required monthly SIP across all goals" figure,
// so it is IDENTICAL on the Goal Calculator, Asset Allocation and Portfolio
// Construction pages. It is live-portfolio-aware (nets executed positions &
// holdings) and uses each goal's SAA-blended expected return per horizon.
import { goalCalc, type GoalRow } from "./riskEngine";
import { computeGoalLiveAmounts } from "./goalNetting";
import { goalExpectedReturn } from "./allocationEngine";
import { type Assumptions, DEFAULT_ASSUMPTIONS } from "./assumptions";
import { retirementCorpus } from "./retirement";
import { buildRetirementInput, isRetirementGoal } from "./retirementInput";

type Row = Record<string, unknown>;

export function totalRequiredSip(
  goals: GoalRow[],
  positions: Row[],
  holdings: Row[],
  saa: Record<string, number>,
  a: Assumptions = DEFAULT_ASSUMPTIONS,
  thisYear: number = new Date().getFullYear(),
  facts: Record<string, unknown> | null = null,
  dob: string | null = null,
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
  // When facts are supplied, the Retirement goal is sized by the drawdown + EPF
  // engine (identical to the Goal Calculator) instead of the flat lump-sum model.
  const retGoal = facts ? goals.find(isRetirementGoal) : undefined;
  let total = 0;
  for (const g of goals) {
    if (retGoal && g.goal_id === retGoal.goal_id) continue;
    const { liveSaved, liveSip } = live[g.goal_id] ?? { liveSaved: 0, liveSip: 0 };
    const gLive = { ...g, saved: (g.saved ?? 0) + liveSaved, monthly_sip: (g.monthly_sip ?? 0) + liveSip };
    const gret = g.return_pct ?? goalExpectedReturn(g.target_year, saa, a, thisYear);
    total += goalCalc(gLive, thisYear, { ...a, defaultGoalReturn: gret }).extraSip;
  }
  if (retGoal) {
    const liveRetSip = (live[retGoal.goal_id] ?? { liveSip: 0 }).liveSip;
    total += retirementCorpus(buildRetirementInput(facts, dob, goals, liveRetSip, saa, a, thisYear)).requiredMonthlySip;
  }
  return Math.round(total);
}
