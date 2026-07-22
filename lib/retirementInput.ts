// lib/retirementInput.ts
// Builds the RetirementInput (lib/retirement.ts) from a client's saved facts +
// firm assumptions, so the Goal Calculator, Asset Allocation and Portfolio
// Construction all size the retirement goal identically (drawdown + EPF model).
import { type GoalRow } from "./riskEngine";
import { type Assumptions } from "./assumptions";
import { goalExpectedReturn } from "./allocationEngine";
import { type RetirementInput } from "./retirement";

type Facts = Record<string, unknown> | null;

export function isRetirementGoal(g: { goal_name?: string | null }): boolean {
  return /retire/i.test(g.goal_name ?? "");
}

export function buildRetirementInput(
  facts: Facts,
  dob: string | null,
  goals: GoalRow[],
  liveRetSip: number,
  saa: Record<string, number>,
  a: Assumptions,
  thisYear: number,
): RetirementInput {
  const d = dob ? new Date(dob) : null;
  const now = new Date();
  let currentAge = 35;
  if (d && !Number.isNaN(d.getTime())) {
    currentAge = now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
  }
  const retirementAge = Number(facts?.retirement_age ?? 60);
  const lifeExpectancy = Number(facts?.life_expectancy ?? a.lifeExpectancy);
  const expenses = Number(facts?.expenses_annual ?? 0) / 12;
  const impliedRepl = facts?.ret_expenses && facts?.expenses_annual
    ? Math.round((Number(facts.ret_expenses) * 12) / Number(facts.expenses_annual) * 100) : null;
  const replacementPct = facts?.retirement_replacement_pct != null
    ? Number(facts.retirement_replacement_pct)
    : (impliedRepl != null && impliedRepl >= 30 && impliedRepl <= 130 ? impliedRepl : a.replacementPct);
  const retYear = thisYear + Math.max(0, retirementAge - currentAge);
  const accReturn = goalExpectedReturn(retYear, saa, a, thisYear);
  const retGoal = goals.find(isRetirementGoal);
  const existingRetSip = retGoal ? (retGoal.monthly_sip ?? 0) + liveRetSip : 0;
  const salaried = facts?.is_salaried === true;
  const epfBasic = Number(facts?.epf_basic_salary ?? 0);
  const empPct = facts?.epf_employee_pct != null ? Number(facts.epf_employee_pct) : 12;
  const emprPct = facts?.epf_employer_pct != null ? Number(facts.epf_employer_pct) : 12;
  const epfNps = Number(facts?.epf_nps_corpus ?? 0);
  return {
    currentAge, retirementAge, lifeExpectancy,
    currentMonthlyExpense: Math.round(expenses),
    replacementPct,
    preRetInflationPct: a.inflation,
    postRetInflationPct: a.postRetInflation,
    accumulationReturnPct: Math.round(accReturn * 10) / 10,
    postRetReturnPct: a.postRetReturn,
    pensionAtRetirement: Number(facts?.ret_pension ?? 0),
    existingCorpus: salaried ? 0 : epfNps,
    existingMonthlySip: Math.round(existingRetSip),
    salaried,
    epfBalance: salaried ? epfNps : 0,
    epfMonthlyContribution: Math.round(epfBasic * (empPct + emprPct) / 100),
    epfRatePct: facts?.epf_rate_pct != null ? Number(facts.epf_rate_pct) : a.epfRate,
    epfSalaryGrowthPct: facts?.epf_salary_growth_pct != null ? Number(facts.epf_salary_growth_pct) : a.salaryGrowth,
  };
}
