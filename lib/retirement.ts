// lib/retirement.ts
// Retirement corpus via a drawdown (growing-annuity) model — the corpus must
// fund an inflation-growing withdrawal stream from the retirement age to the
// chosen life expectancy, while it keeps earning a (conservative) post-retirement
// return. This is what the plain lump-sum goal model misses. Pure function.

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentMonthlyExpense: number;   // today's money (pre-retirement)
  replacementPct: number;          // % of current expenses needed in retirement
  inflationPct: number;
  accumulationReturnPct: number;   // return while accumulating (pre-retirement)
  postRetReturnPct: number;        // return during drawdown (post-retirement)
  monthlyPensionNow: number;       // today's money — pension / other retirement income
  existingCorpus: number;          // already earmarked for retirement (EPF/NPS + saved)
  existingMonthlySip: number;      // ongoing SIP toward retirement
}

export interface RetirementResult {
  yearsToRetirement: number;
  retirementYears: number;
  monthlyExpenseAtRetirement: number;
  annualExpenseAtRetirement: number;
  annualPensionAtRetirement: number;
  netAnnualExpenseAtRetirement: number;
  corpusRequired: number;          // at the retirement date
  projectedCorpus: number;         // existing corpus + SIP grown to retirement
  shortfall: number;
  requiredMonthlySip: number;      // ADDITIONAL, on top of existing
  requiredLumpsumToday: number;    // alternative one-off today
  fundedPct: number;
  depletion: { age: number; corpusStart: number }[]; // corpus at the start of each retirement year
  runsOutAtAge: number | null;     // if the corpus is exhausted before life expectancy
}

const round = (n: number) => Math.round(n);

export function retirementCorpus(inp: RetirementInput): RetirementResult {
  const i = inp.inflationPct / 100;
  const rAcc = inp.accumulationReturnPct / 100;
  const rDraw = inp.postRetReturnPct / 100;
  const yearsToRet = Math.max(0, inp.retirementAge - inp.currentAge);
  const n = Math.max(0, inp.lifeExpectancy - inp.retirementAge);

  // Expense (and pension) grown to the first retirement year.
  const annualExpNow = inp.currentMonthlyExpense * 12 * (inp.replacementPct / 100);
  const expAtR = annualExpNow * Math.pow(1 + i, yearsToRet);
  const pensionAtR = inp.monthlyPensionNow * 12 * Math.pow(1 + i, yearsToRet);
  const netExpAtR = Math.max(0, expAtR - pensionAtR);

  // Corpus at retirement = present value of a growing annuity (withdrawals grow
  // with inflation), corpus earning rDraw, first withdrawal at retirement start.
  let corpus: number;
  if (n <= 0) {
    corpus = 0;
  } else if (Math.abs(rDraw - i) < 1e-9) {
    corpus = netExpAtR * n;                 // real return ~0
  } else {
    const pv = netExpAtR * (1 - Math.pow((1 + i) / (1 + rDraw), n)) / (rDraw - i);
    corpus = pv * (1 + rDraw);              // annuity-due (payment at year start)
  }

  // Accumulation: grow existing corpus + level SIP to the retirement date.
  const nm = yearsToRet * 12;
  const rm = rAcc / 12;
  const fvExisting = inp.existingCorpus * Math.pow(1 + rAcc, yearsToRet);
  const fvSip = inp.existingMonthlySip > 0 && nm > 0
    ? inp.existingMonthlySip * (Math.pow(1 + rm, nm) - 1) / rm
    : 0;
  const projected = fvExisting + fvSip;
  const shortfall = Math.max(0, corpus - projected);
  const reqSip = shortfall > 0 && nm > 0 ? shortfall * rm / (Math.pow(1 + rm, nm) - 1) : 0;
  const reqLumpsum = shortfall > 0 ? shortfall / Math.pow(1 + rAcc, yearsToRet) : 0;

  // Depletion path from the ACTUAL provided corpus (projected, capped at required
  // for the "on plan" curve — but we show the required corpus draining to zero).
  const depletion: { age: number; corpusStart: number }[] = [];
  let bal = corpus;
  let runsOut: number | null = null;
  for (let t = 0; t < n; t++) {
    const age = inp.retirementAge + t;
    depletion.push({ age, corpusStart: Math.max(0, round(bal)) });
    const withdrawal = netExpAtR * Math.pow(1 + i, t);
    bal = (bal - withdrawal) * (1 + rDraw);
    if (bal < 0 && runsOut === null) runsOut = age;
  }

  return {
    yearsToRetirement: yearsToRet,
    retirementYears: n,
    monthlyExpenseAtRetirement: round(expAtR / 12),
    annualExpenseAtRetirement: round(expAtR),
    annualPensionAtRetirement: round(pensionAtR),
    netAnnualExpenseAtRetirement: round(netExpAtR),
    corpusRequired: round(corpus),
    projectedCorpus: round(projected),
    shortfall: round(shortfall),
    requiredMonthlySip: round(reqSip),
    requiredLumpsumToday: round(reqLumpsum),
    fundedPct: corpus > 0 ? Math.min(100, Math.round(projected / corpus * 100)) : 100,
    depletion,
    runsOutAtAge: runsOut,
  };
}
