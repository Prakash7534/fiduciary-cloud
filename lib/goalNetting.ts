// lib/goalNetting.ts
// Time-aware netting for goal "saved"/"monthly_sip" figures (Fix #6), mirroring
// the investments.declared_at pattern used elsewhere (Live Assets, Advisory
// Report asset reconciliation): platform-executed money that predates a
// goal's declaration is presumed already reflected in the client's
// self-reported "saved" figure and must NOT be added again on top of it —
// otherwise every review cycle inflates funded-% by double-counting whatever
// the adviser already executed since the last declaration. Money executed
// strictly after the declaration is genuinely new and stays additive.

export interface GoalForNetting {
  goal_id: string;
  cost_today: number | null;
  target_year: number | null;
  inflation_pct: number | null;
  declared_at?: string | null;
}

export interface PositionForNetting {
  goal_id: string | null;
  status: string | null;
  executed_lumpsum: number | null;
  executed_sip: number | null;
  current_value: number | null;
  executed_at: string | null;
}

export interface HoldingForNetting {
  current_value: number | null;
  lumpsum_invested: number | null;
  monthly_sip: number | null;
  added_at?: string | null;
}

export interface GoalLiveAmounts {
  liveSaved: number;
  liveSip: number;
}

function posValue(p: PositionForNetting): number {
  return (p.current_value ?? 0) > 0 ? (p.current_value ?? 0) : (p.executed_lumpsum ?? 0);
}
function holdValue(h: HoldingForNetting): number {
  return (h.current_value ?? 0) > 0 ? (h.current_value ?? 0) : (h.lumpsum_invested ?? 0);
}

/**
 * Returns, per goal_id, the amount of executed platform money (SIP + lumpsum)
 * that postdates that goal's declaration and should be added on top of the
 * client's self-reported saved/monthly_sip. Positions/holdings tagged to a
 * specific goal are netted against that goal's own declared_at; untagged
 * ("unlinked") positions/holdings are pooled and apportioned across goals by
 * future-value weight, netted against the most recent declaration among all
 * goals (a goal with no declared_at yet — e.g. adviser-entered, never through
 * a questionnaire — is treated as always-additive, matching prior behaviour).
 */
export function computeGoalLiveAmounts(
  goals: GoalForNetting[],
  positions: PositionForNetting[],
  holdings: HoldingForNetting[],
  thisYear: number
): Record<string, GoalLiveAmounts> {
  const execPos = positions.filter(p => p.status === "executed");

  const maxDeclaredAt: Date | null = goals.reduce<Date | null>((mx, g) => {
    const d = g.declared_at ? new Date(g.declared_at) : null;
    return d && (!mx || d > mx) ? d : mx;
  }, null);

  const declaredAtByGoal: Record<string, Date | null> = {};
  goals.forEach(g => { declaredAtByGoal[g.goal_id] = g.declared_at ? new Date(g.declared_at) : null; });

  const linkedValue: Record<string, number> = {};
  const linkedSip: Record<string, number> = {};
  let unlinkedValue = 0, unlinkedSip = 0;

  execPos.forEach(p => {
    const v = posValue(p);
    const s = p.executed_sip ?? 0;
    const execAt = p.executed_at ? new Date(p.executed_at) : null;
    if (p.goal_id) {
      const cutoff = declaredAtByGoal[p.goal_id] ?? null;
      if (cutoff && execAt && execAt <= cutoff) return; // already reflected in this goal's declared figure
      linkedValue[p.goal_id] = (linkedValue[p.goal_id] ?? 0) + v;
      linkedSip[p.goal_id] = (linkedSip[p.goal_id] ?? 0) + s;
    } else {
      if (maxDeclaredAt && execAt && execAt <= maxDeclaredAt) return;
      unlinkedValue += v;
      unlinkedSip += s;
    }
  });

  holdings.forEach(h => {
    const addedAt = h.added_at ? new Date(h.added_at) : null;
    if (maxDeclaredAt && addedAt && addedAt <= maxDeclaredAt) return;
    unlinkedValue += holdValue(h);
    unlinkedSip += h.monthly_sip ?? 0;
  });

  const fvWeights = goals.map(g =>
    (g.cost_today ?? 0) * Math.pow(1 + (g.inflation_pct ?? 6) / 100, Math.max(0, (g.target_year ?? thisYear) - thisYear))
  );
  const fvTotal = fvWeights.reduce((s, v) => s + v, 0);

  const out: Record<string, GoalLiveAmounts> = {};
  goals.forEach((g, gi) => {
    const share = fvTotal > 0 ? fvWeights[gi] / fvTotal : (goals.length ? 1 / goals.length : 0);
    out[g.goal_id] = {
      liveSaved: (linkedValue[g.goal_id] ?? 0) + unlinkedValue * share,
      liveSip: (linkedSip[g.goal_id] ?? 0) + unlinkedSip * share,
    };
  });
  return out;
}
