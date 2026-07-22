// lib/retirement.ts
// Retirement corpus by the standard present-value method used in Indian
// financial-planning practice (SEBI curriculum):
//
//   1. Retirement expense today = current monthly expense x replacement %.
//   2. Grow it to the retirement date with PRE-retirement inflation.
//   3. The corpus at retirement is the PRESENT VALUE of that (inflation-linked)
//      monthly expense drawn every month from retirement to life expectancy,
//      discounted at the INFLATION-ADJUSTED real return:
//         realRate = (1 + postRetReturn) / (1 + postRetInflation) - 1
//      i.e. Excel  =PV(realRate/12, months, monthlyExpenseAtRetirement)
//
// Pension (if any) is netted from the monthly expense before the PV.
// The accumulation side then tells us the SIP / lumpsum needed to reach it.
// Pure function — no DB, runs on server or client.

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentMonthlyExpense: number;   // today's money (pre-retirement)
  replacementPct: number;          // % of current expense needed in retirement
  preRetInflationPct: number;      // grows the expense to the retirement date
  postRetInflationPct: number;     // inflation during the drawdown years
  accumulationReturnPct: number;   // return while accumulating (pre-retirement)
  postRetReturnPct: number;        // return the corpus earns during drawdown
  pensionAtRetirement: number;     // expected monthly pension AT retirement (nominal, that year's value)
  existingCorpus: number;          // non-EPF corpus earmarked, grows at accumulation return
  existingMonthlySip: number;      // ongoing SIP toward retirement
  // EPF (salaried only) — contributions grow with salary and earn the EPF rate
  salaried: boolean;
  epfBalance: number;              // current EPF balance
  epfMonthlyContribution: number;  // current combined (employee + employer) monthly contribution
  epfRatePct: number;              // EPF interest rate
  epfSalaryGrowthPct: number;      // salary growth — grows the contribution each year
}

export interface RetirementResult {
  yearsToRetirement: number;
  retirementYears: number;
  retirementMonths: number;                 // PV nper
  retExpenseMonthlyToday: number;           // expense x replacement, today's money
  monthlyExpenseAtRetirement: number;       // grown to the retirement date (gross)
  monthlyPensionAtRetirement: number;
  netMonthlyExpenseAtRetirement: number;    // PV pmt (net of pension)
  realRatePct: number;                      // annual inflation-adjusted return
  corpusRequired: number;                   // present value at the retirement date
  projectedCorpus: number;                  // existing corpus + SIP grown to retirement
  epfCorpusAtRetirement: number;            // EPF accumulation by the retirement date
  shortfall: number;
  requiredMonthlySip: number;               // ADDITIONAL, on top of existing
  requiredLumpsumToday: number;             // alternative one-off today
  fundedPct: number;
  surplus: number;                          // projected − required (positive = over-funded)
  depletion: { age: number; corpusStart: number; withdrawal: number }[];
  runsOutAtAge: number | null;              // only when under-funded
}

const round = (n: number) => Math.round(n);

export function retirementCorpus(inp: RetirementInput): RetirementResult {
  const iPre  = inp.preRetInflationPct / 100;
  const iPost = inp.postRetInflationPct / 100;
  const rDraw = inp.postRetReturnPct / 100;
  const rAcc  = inp.accumulationReturnPct / 100;

  const yearsToRet = Math.max(0, inp.retirementAge - inp.currentAge);
  const nYears = Math.max(0, inp.lifeExpectancy - inp.retirementAge);
  const nMonths = nYears * 12;

  // 1 & 2 — retirement expense today, grown to the retirement date.
  const retExpToday = inp.currentMonthlyExpense * (inp.replacementPct / 100);
  const monthlyExpAtR = retExpToday * Math.pow(1 + iPre, yearsToRet);
  const monthlyPenAtR = inp.pensionAtRetirement;   // stated at the retirement date — not grown from today
  const netMonthly = Math.max(0, monthlyExpAtR - monthlyPenAtR);

  // 3 — corpus = PV of the inflation-linked monthly draw at the real rate.
  const realAnnual = (1 + rDraw) / (1 + iPost) - 1;   // e.g. (1.08/1.06)-1 = 1.89%
  const rM = realAnnual / 12;
  let corpus: number;
  if (nMonths <= 0) {
    corpus = 0;
  } else if (Math.abs(rM) < 1e-9) {
    corpus = netMonthly * nMonths;
  } else {
    corpus = netMonthly * (1 - Math.pow(1 + rM, -nMonths)) / rM;  // =PV(rM, nMonths, pmt), type 0
  }

  // Accumulation — grow existing corpus + level SIP to the retirement date.
  const nm = yearsToRet * 12;
  const rm = rAcc / 12;
  const fvExisting = inp.existingCorpus * Math.pow(1 + rAcc, yearsToRet);
  const fvSip = inp.existingMonthlySip > 0 && nm > 0
    ? inp.existingMonthlySip * (Math.pow(1 + rm, nm) - 1) / rm
    : 0;
  // EPF (salaried): current balance grown at the EPF rate + growing-annuity FV of
  // the annual contribution rising with salary growth.
  let epfCorpus = 0;
  if (inp.salaried) {
    const rE = inp.epfRatePct / 100;
    const g = inp.epfSalaryGrowthPct / 100;
    const fvBal = inp.epfBalance * Math.pow(1 + rE, yearsToRet);
    const annualC = inp.epfMonthlyContribution * 12;
    let fvContrib = 0;
    if (yearsToRet > 0 && annualC > 0) {
      fvContrib = Math.abs(rE - g) < 1e-9
        ? annualC * yearsToRet * Math.pow(1 + rE, yearsToRet - 1)
        : annualC * (Math.pow(1 + rE, yearsToRet) - Math.pow(1 + g, yearsToRet)) / (rE - g);
    }
    epfCorpus = fvBal + fvContrib;
  }

  const projected = fvExisting + fvSip + epfCorpus;
  const shortfall = Math.max(0, corpus - projected);
  const reqSip = shortfall > 0 && nm > 0 ? shortfall * rm / (Math.pow(1 + rm, nm) - 1) : 0;
  const reqLumpsum = shortfall > 0 ? shortfall / Math.pow(1 + rAcc, yearsToRet) : 0;

  // Depletion curve. When under-funded we drain the corpus the client is
  // actually projected to have (so "runs out at age X" is real); when funded
  // we drain the required corpus, which by construction lasts to life expectancy.
  const startBal = shortfall > 0 ? projected : corpus;
  const depletion: { age: number; corpusStart: number; withdrawal: number }[] = [];
  let bal = startBal;
  let runsOut: number | null = null;
  for (let t = 0; t < nYears; t++) {
    const annualWithdrawal = netMonthly * 12 * Math.pow(1 + iPost, t);
    depletion.push({ age: inp.retirementAge + t, corpusStart: Math.max(0, round(bal)), withdrawal: round(annualWithdrawal) });
    bal = (bal - annualWithdrawal) * (1 + rDraw);
    if (shortfall > 0 && bal < 0 && runsOut === null) runsOut = inp.retirementAge + t + 1;
  }

  return {
    yearsToRetirement: yearsToRet,
    retirementYears: nYears,
    retirementMonths: nMonths,
    retExpenseMonthlyToday: round(retExpToday),
    monthlyExpenseAtRetirement: round(monthlyExpAtR),
    monthlyPensionAtRetirement: round(monthlyPenAtR),
    netMonthlyExpenseAtRetirement: round(netMonthly),
    realRatePct: Math.round(realAnnual * 10000) / 100,
    corpusRequired: round(corpus),
    projectedCorpus: round(projected),
    epfCorpusAtRetirement: round(epfCorpus),
    shortfall: round(shortfall),
    requiredMonthlySip: round(reqSip),
    requiredLumpsumToday: round(reqLumpsum),
    fundedPct: corpus > 0 ? Math.round(projected / corpus * 100) : 100,
    surplus: round(projected - corpus),
    depletion,
    runsOutAtAge: runsOut,
  };
}
