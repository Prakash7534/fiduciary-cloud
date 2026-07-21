// lib/riskEngine.ts
import { type Assumptions, DEFAULT_ASSUMPTIONS } from "./assumptions";
// -----------------------------------------------------------------------------
// Faithful TypeScript port of the Python risk_engine.py. Takes plain data
// (already fetched from Supabase — this file has no DB calls of its own) and
// returns the same computed shape the Flask app produced, so the numbers you
// got locally are the numbers you'll get here.
//
// Additions below analyseClient(): financialPosition, cashFlow, assetsBreakdown,
// debtsBreakdown, insuranceAnalysis — ported from the remaining Flask app views.
// -----------------------------------------------------------------------------

export const CATEGORIES = [
  "Conservative",
  "Moderately Conservative",
  "Balanced / Moderate",
  "Moderately Aggressive",
  "Aggressive",
] as const;

export const ALLOCATIONS: [number, number, number, number][] = [
  [10, 70, 10, 10],
  [30, 55, 10, 5],
  [50, 35, 10, 5],
  [70, 20, 8, 2],
  [85, 10, 5, 0],
];

export function rank(pct: number): number {
  if (pct >= 0.81) return 5;
  if (pct >= 0.65) return 4;
  if (pct >= 0.5) return 3;
  if (pct >= 0.36) return 2;
  return 1;
}

export function yearsBetween(dobIso: string | null, asOf: Date = new Date()): number | null {
  if (!dobIso) return null;
  const [y, m, d] = dobIso.split("-").map(Number);
  const dob = new Date(y, m - 1, d);
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) age--;
  return age;
}

export interface RiskAnswer {
  question_num: number;
  answer: "A" | "B" | "C" | "D" | "E";
}

export function scoreAnswers(answers: RiskAnswer[]) {
  const pts = (qs: number[]) =>
    qs.reduce((sum, q) => {
      const a = answers.find((x) => x.question_num === q);
      return sum + (a ? a.answer.charCodeAt(0) - 64 : 0);
    }, 0);
  const cap = pts(Array.from({ length: 8 }, (_, i) => i + 1));
  const tol = pts(Array.from({ length: 7 }, (_, i) => i + 9));
  const kn = pts(Array.from({ length: 4 }, (_, i) => i + 16));
  return { cap, tol, kn, answered: answers.length };
}

export interface GoalRow {
  goal_id: string;
  goal_name: string | null;
  target_year: number | null;
  cost_today: number | null;
  saved: number | null;
  monthly_sip: number | null;
  inflation_pct: number | null;
  return_pct: number | null;
  priority: string | null;
  flexibility: string | null;
  declared_at?: string | null;
}

export function goalCalc(g: GoalRow, thisYear = new Date().getFullYear(), a: Assumptions = DEFAULT_ASSUMPTIONS) {
  const years = Math.max(0, (g.target_year ?? thisYear) - thisYear);
  const r = (g.return_pct ?? a.defaultGoalReturn) / 100;
  const infl = (g.inflation_pct ?? a.inflation) / 100;
  const n = years * 12;
  const rm = r / 12;
  const fv = (g.cost_today ?? 0) * Math.pow(1 + infl, years);
  let path = (g.saved ?? 0) * Math.pow(1 + r, years);
  if (g.monthly_sip && n) path += g.monthly_sip * ((Math.pow(1 + rm, n) - 1) / rm);
  const gap = Math.max(0, fv - path);
  const extraSip = gap && n ? (gap * rm) / (Math.pow(1 + rm, n) - 1) : 0;
  return { years, fv, path, gap, extraSip };
}

// -----------------------------------------------------------------------------
// Red flags — mirrors the Python engine's flag list. `state` is 'bad' | 'ok' | 'na'.
// -----------------------------------------------------------------------------
export interface Flag {
  state: "bad" | "ok" | "na";
  name: string;
  val: string;
  why: string;
}

export interface ClientRow {
  client_id: string;
  full_name: string;
  dob: string | null;
}

export interface FinancialFacts {
  income_self: number | null;
  income_spouse: number | null;
  income_other: number | null;
  life_cover: number | null;
  retirement_age: number | null;
  will_status: string | null;
  trust_status: string | null;
  poa_status: string | null;
  guardian_status: string | null;
  fatca: string | null;
  pep: string | null;
}

export interface LoanRow {
  loan_type: string | null;
  outstanding: number | null;
}

export interface InvestmentRow {
  asset_class: string | null;
  value: number | null;
}

const UNSECURED_TYPES = new Set([
  "personal loan",
  "education loan",
  "credit card outstanding",
  "other",
]);

export interface AnalysisResult {
  client: ClientRow;
  facts: ExtendedFacts | null;
  cap: number;
  tol: number;
  kn: number;
  total: number;
  answered: number;
  capR: number;
  tolR: number;
  govR: number;
  finalProfile: string;
  alloc: [number, number, number, number];
  age: number | null;
  yearsToRetirement: number | null;
  totalDebt: number;
  totalAssets: number;
  income: number;
  goals: (GoalRow & ReturnType<typeof goalCalc>)[];
  extraSipTotal: number;
  flags: Flag[];
}

export function analyseClient(
  client: ClientRow,
  facts: ExtendedFacts | null,
  answers: RiskAnswer[],
  loans: LoanRow[],
  investments: InvestmentRow[],
  goals: GoalRow[],
  a: Assumptions = DEFAULT_ASSUMPTIONS
): AnalysisResult {
  const { cap, tol, kn, answered } = scoreAnswers(answers);
  const total = cap + tol + kn;
  const capR = rank(cap / 40);
  const tolR = rank(tol / 35);
  const govR = Math.min(capR, tolR);
  const finalIdx = govR - 1;
  const finalProfile = CATEGORIES[finalIdx];
  const alloc = ALLOCATIONS[finalIdx];

  const age = yearsBetween(client.dob);
  const yearsToRetirement =
    facts?.retirement_age != null && age != null ? facts.retirement_age - age : null;

  const totalDebt = loans.reduce((s, l) => s + (l.outstanding ?? 0), 0);
  const unsecured = loans.reduce(
    (s, l) => s + ((l.loan_type && UNSECURED_TYPES.has(l.loan_type.toLowerCase())) ? (l.outstanding ?? 0) : 0),
    0
  );
  // Same composition as financialPosition() below — investments + property + EPF/NPS —
  // so the debt-to-assets red flag and every downstream report/snapshot agree.
  const investmentAssetsRaw = investments.reduce((s, i) => s + (i.value ?? 0), 0);
  const propertyAssetsRaw = (facts?.house_value ?? 0) + (facts?.prop_value ?? 0);
  const epfNpsRaw = facts?.epf_nps_corpus ?? 0;
  const totalAssets = investmentAssetsRaw + propertyAssetsRaw + epfNpsRaw;
  const income = (facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0);

  const goalsCalc = goals.map((g) => ({ ...g, ...goalCalc(g, new Date().getFullYear(), a) }));
  const extraSipTotal = goalsCalc.reduce((s, g) => s + g.extraSip, 0);

  const answerFor = (q: number) => answers.find((a) => a.question_num === q)?.answer ?? null;
  const flags: Flag[] = [];
  const add = (cond: boolean | null, name: string, val: string, why: string) => {
    flags.push({ state: cond === null ? "na" : cond ? "bad" : "ok", name, val, why });
  };

  const eq = alloc[0] / 100;
  add(
    yearsToRetirement !== null ? yearsToRetirement < 10 && eq >= 0.6 : null,
    "Retirement within 10 years + high equity",
    yearsToRetirement !== null ? `${yearsToRetirement} yrs` : "",
    "Glidepath needed — start de-risking; sequence-of-returns risk peaks in the final decade."
  );
  add(
    yearsToRetirement !== null ? yearsToRetirement < 5 : null,
    "Retirement within 5 years",
    yearsToRetirement !== null ? `${yearsToRetirement} yrs` : "",
    "Cap equity; secure post-retirement expenses in debt/liquid."
  );
  add(age !== null ? age >= 60 : null, "Client aged 60 or above", age !== null ? `${age} yrs` : "", "Senior-citizen suitability care needed.");

  const q3 = answerFor(3);
  add(q3 ? "AB".includes(q3) : null, "EMI burden above 36% of income (Q3)", q3 ? `Q3=${q3}` : "", "Prioritise debt reduction before fresh investments.");
  add(q3 ? q3 === "A" : null, "EMI burden above 50% — critical (Q3)", q3 ? `Q3=${q3}` : "", "Restructure/prepay first; investing may be unsuitable until reduced.");

  add(
    totalAssets > 0 ? totalDebt / totalAssets > 0.5 : null,
    "Debt-to-assets above 50%",
    totalAssets ? `${((100 * totalDebt) / totalAssets).toFixed(1)}%` : "",
    "Balance-sheet risk."
  );
  add(
    totalDebt > 0 ? unsecured / totalDebt > 0.3 : null,
    "Unsecured debt above 30% of total",
    totalDebt ? `${((100 * unsecured) / totalDebt).toFixed(1)}%` : "",
    "High-cost debt — clear first."
  );

  const q5 = answerFor(5);
  add(q5 ? "AB".includes(q5) : null, "Emergency fund below 3 months (Q5)", q5 ? `Q5=${q5}` : "", "Build 3-6 months in liquid funds first.");
  const q4 = answerFor(4);
  add(q4 ? "AB".includes(q4) : null, "Savings rate below ~10% (Q4)", q4 ? `Q4=${q4}` : "", "Budget review before allocation.");

  add(
    income > 0 && facts?.life_cover != null ? facts.life_cover < income * 10 : null,
    "Life insurance coverage gap",
    income && facts?.life_cover != null ? `gap ≈ ₹${Math.max(0, income * 10 - facts.life_cover).toLocaleString("en-IN")}` : "",
    "Close protection gap before wealth-building."
  );

  const q2 = answerFor(2);
  add(q2 ? "AB".includes(q2) && eq >= 0.6 : null, "Unstable income + high equity (Q2)", q2 ? `Q2=${q2}` : "", "Larger buffer, staggered deployment.");

  add(
    kn ? kn / 20 < 0.5 && finalIdx >= 3 : null,
    "Low knowledge but aggressive profile",
    kn ? `${((100 * kn) / 20).toFixed(0)}% knowledge score` : "",
    "Mis-selling risk — document the discussion."
  );

  const q19 = answerFor(19);
  add(q19 ? "AB".includes(q19) && finalIdx >= 3 : null, "No downturn experience + aggressive (Q19)", q19 ? `Q19=${q19}` : "", "Stage the equity build-up (STP).");

  add(
    cap && tol ? Math.abs(capR - tolR) >= 2 : null,
    "Capacity vs willingness divergence",
    cap && tol ? `${((100 * cap) / 40).toFixed(0)}% vs ${((100 * tol) / 35).toFixed(0)}%` : "",
    "Lower of the two governs — discuss and record."
  );

  add(answered < 19, "Questionnaire incomplete", `${answered}/19 answered`, "Profile unreliable until all 19 answered.");

  if (facts) {
    const estateVals = [facts.will_status, facts.trust_status, facts.poa_status, facts.guardian_status];
    const estateYes = estateVals.filter((v) => v === "Yes").length;
    add(
      estateVals.some(Boolean) ? estateYes === 0 : null,
      "No estate planning documents",
      `${estateYes}/4 in place`,
      "Recommend at minimum a registered Will."
    );
    add(
      facts.fatca === "Yes" || facts.pep === "Yes",
      "FATCA or PEP status flagged",
      `${facts.fatca ?? "—"}/${facts.pep ?? "—"}`,
      "Enhanced due diligence required."
    );
  }

  return {
    client,
    facts,
    cap,
    tol,
    kn,
    total,
    answered,
    capR,
    tolR,
    govR,
    finalProfile,
    alloc,
    age,
    yearsToRetirement,
    totalDebt,
    totalAssets,
    income,
    goals: goalsCalc,
    extraSipTotal,
    flags,
  };
}

// =============================================================================
// ─── Financial Health / Cash Flow / Assets / Debts / Insurance ───────────────
// =============================================================================

// Extended interfaces — superset of the minimal types used in analyseClient.
// Pages that need emi, rate, monthly_sip etc. should fetch those columns and
// cast to these fuller types; analyseClient keeps working with its narrower types.

export interface FullLoanRow extends LoanRow {
  loan_id?: string;
  lender?: string | null;
  emi?: number | null;
  rate?: number | null;
  tenure_months?: number | null;
}

export interface FullInvestmentRow extends InvestmentRow {
  inv_id?: string;
  monthly_sip?: number | null;
}

// ExtendedFacts is a strict superset of FinancialFacts — all pages can safely
// cast a full financial_facts row to this type.
export interface ExtendedFacts extends FinancialFacts {
  expenses_annual?: number | null;
  health_cover?: number | null;
  employer_cover?: number | null;
  epf_nps_corpus?: number | null;
  house_value?: number | null;
  prop_value?: number | null;
  rental_income?: number | null; // annual rental income from owned property
  rent_monthly?: number | null;  // monthly rent paid for own accommodation
  prop_count?: string | null;
  property_plan?: string | null;
  covers_held?: string | null;
  nominees_updated?: string | null;
}

// =============================================================================
// Financial Position — basis of the Financial Health page
// =============================================================================

export type HealthGrade = "Healthy" | "Caution" | "Stressed" | "Critical";

export interface FinancialPositionResult {
  netWorth: number;
  totalAssets: number;          // investments + property + EPF/NPS
  investmentAssets: number;
  propertyAssets: number;
  epfNps: number;
  totalDebt: number;
  income: number;               // earned + rental (annual)
  annualExpenses: number | null;
  annualEmi: number;
  surplus: number | null;       // income − expenses − EMI
  surplusRatio: number | null;  // surplus / income
  solvencyRatio: number | null; // netWorth / totalAssets
  debtToIncome: number | null;  // totalDebt / income
  emiToIncome: number | null;   // annualEmi / income
  grade: HealthGrade;
  gradeNotes: string[];
  estateDocs: { name: string; status: string | null }[];
  estateScore: number; // count of "Yes" across 4 estate-planning docs
}

export function financialPosition(
  facts: ExtendedFacts | null,
  loans: FullLoanRow[],
  investments: FullInvestmentRow[]
): FinancialPositionResult {
  const earnedIncome =
    (facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0);
  const rentalIncome = facts?.rental_income ?? 0; // stored as annual in the schema
  const income = earnedIncome + rentalIncome;

  const annualExpenses = facts?.expenses_annual ?? null;
  const annualEmi = loans.reduce((s, l) => s + (l.emi ?? 0) * 12, 0);

  const investmentAssets = investments.reduce((s, i) => s + (i.value ?? 0), 0);
  const propertyAssets = (facts?.house_value ?? 0) + (facts?.prop_value ?? 0);
  const epfNps = facts?.epf_nps_corpus ?? 0;
  const totalAssets = investmentAssets + propertyAssets + epfNps;

  const totalDebt = loans.reduce((s, l) => s + (l.outstanding ?? 0), 0);
  const netWorth = totalAssets - totalDebt;

  const surplus =
    annualExpenses !== null ? income - annualExpenses - annualEmi : null;
  const surplusRatio = income > 0 && surplus !== null ? surplus / income : null;
  const solvencyRatio = totalAssets > 0 ? netWorth / totalAssets : null;
  const debtToIncome = income > 0 ? totalDebt / income : null;
  const emiToIncome = income > 0 ? annualEmi / income : null;

  // Grade: accumulate stress points, then bucket.
  const notes: string[] = [];
  let pts = 0;

  if (solvencyRatio !== null) {
    if (solvencyRatio < 0) {
      pts += 3;
      notes.push("Negative net worth — liabilities exceed all assets.");
    } else if (solvencyRatio < 0.3) {
      pts += 2;
      notes.push("Low solvency ratio — debt is a large portion of the asset base.");
    } else if (solvencyRatio < 0.5) {
      pts += 1;
      notes.push("Moderate solvency — keep debt growth in check.");
    }
  }

  if (emiToIncome !== null) {
    if (emiToIncome > 0.5) {
      pts += 3;
      notes.push("EMI burden above 50% of income — critically high; debt restructuring recommended.");
    } else if (emiToIncome > 0.36) {
      pts += 2;
      notes.push("EMI burden above 36% — reduce debt before fresh investments.");
    } else if (emiToIncome > 0.2) {
      pts += 1;
      notes.push("EMI burden above 20% — manageable but monitor.");
    }
  }

  if (surplusRatio !== null) {
    if (surplusRatio < 0) {
      pts += 2;
      notes.push("Spending exceeds income — immediate budget review needed.");
    } else if (surplusRatio < 0.1) {
      pts += 1;
      notes.push("Very thin surplus — limited capacity for additional investments.");
    }
  }

  const grade: HealthGrade =
    pts >= 5 ? "Critical" : pts >= 3 ? "Stressed" : pts >= 1 ? "Caution" : "Healthy";

  if (notes.length === 0) notes.push("No major structural concerns identified.");

  const estateDocs = [
    { name: "Will", status: facts?.will_status ?? null },
    { name: "Trust", status: facts?.trust_status ?? null },
    { name: "Power of Attorney", status: facts?.poa_status ?? null },
    { name: "Guardian designation", status: facts?.guardian_status ?? null },
  ];
  const estateScore = estateDocs.filter((d) => d.status === "Yes").length;

  return {
    netWorth, totalAssets, investmentAssets, propertyAssets, epfNps,
    totalDebt, income, annualExpenses, annualEmi, surplus, surplusRatio,
    solvencyRatio, debtToIncome, emiToIncome, grade, gradeNotes: notes,
    estateDocs, estateScore,
  };
}

// =============================================================================
// Cash Flow
// =============================================================================

export interface EmiByType {
  loanType: string;
  annualEmi: number;
  outstanding: number;
}

export interface CashFlowResult {
  incomeSelf: number;
  incomeSpouse: number;
  incomeOther: number;
  rentalIncome: number;   // annual
  totalIncome: number;
  annualExpenses: number | null;
  rentMonthly: number | null; // accommodation cost
  emiByType: EmiByType[];
  annualEmi: number;
  surplus: number | null;
  surplusRatio: number | null; // surplus / totalIncome
}

export function cashFlow(
  facts: ExtendedFacts | null,
  loans: FullLoanRow[]
): CashFlowResult {
  const incomeSelf = facts?.income_self ?? 0;
  const incomeSpouse = facts?.income_spouse ?? 0;
  const incomeOther = facts?.income_other ?? 0;
  const rentalIncome = facts?.rental_income ?? 0;
  const totalIncome = incomeSelf + incomeSpouse + incomeOther + rentalIncome;
  const annualExpenses = facts?.expenses_annual ?? null;
  const rentMonthly = facts?.rent_monthly ?? null;

  // Group EMI by loan type (stored monthly in DB, show annual).
  const emiMap = new Map<string, { annualEmi: number; outstanding: number }>();
  for (const l of loans) {
    const key = l.loan_type ?? "Other";
    const prev = emiMap.get(key) ?? { annualEmi: 0, outstanding: 0 };
    emiMap.set(key, {
      annualEmi: prev.annualEmi + (l.emi ?? 0) * 12,
      outstanding: prev.outstanding + (l.outstanding ?? 0),
    });
  }
  const emiByType: EmiByType[] = Array.from(emiMap.entries())
    .map(([loanType, v]) => ({ loanType, ...v }))
    .sort((a, b) => b.annualEmi - a.annualEmi);
  const annualEmi = emiByType.reduce((s, e) => s + e.annualEmi, 0);

  const surplus =
    annualExpenses !== null ? totalIncome - annualExpenses - annualEmi : null;
  const surplusRatio =
    totalIncome > 0 && surplus !== null ? surplus / totalIncome : null;

  return {
    incomeSelf, incomeSpouse, incomeOther, rentalIncome, totalIncome,
    annualExpenses, rentMonthly, emiByType, annualEmi, surplus, surplusRatio,
  };
}

// =============================================================================
// Assets breakdown
// =============================================================================

export interface AssetGroup {
  assetClass: string;
  value: number;
  monthlySip: number;
  pct: number; // of totalAssets
}

export interface AssetsResult {
  investmentGroups: AssetGroup[];
  investmentTotal: number;
  propertyAssets: { label: string; value: number }[];
  propertyTotal: number;
  epfNps: number;
  totalAssets: number;
  monthlySipTotal: number;
  topConcentration: { assetClass: string; pct: number } | null;
}

export function assetsBreakdown(
  facts: ExtendedFacts | null,
  investments: FullInvestmentRow[]
): AssetsResult {
  // Aggregate investments by asset class.
  const groupMap = new Map<string, { value: number; monthlySip: number }>();
  for (const inv of investments) {
    const cls = inv.asset_class ?? "Other";
    const prev = groupMap.get(cls) ?? { value: 0, monthlySip: 0 };
    groupMap.set(cls, {
      value: prev.value + (inv.value ?? 0),
      monthlySip: prev.monthlySip + (inv.monthly_sip ?? 0),
    });
  }
  const investmentTotal = Array.from(groupMap.values()).reduce((s, g) => s + g.value, 0);

  const houseVal = facts?.house_value ?? 0;
  const propVal = facts?.prop_value ?? 0;
  const epfNps = facts?.epf_nps_corpus ?? 0;
  const propertyTotal = houseVal + propVal;
  const totalAssets = investmentTotal + propertyTotal + epfNps;

  const investmentGroups: AssetGroup[] = Array.from(groupMap.entries())
    .map(([assetClass, g]) => ({
      assetClass,
      value: g.value,
      monthlySip: g.monthlySip,
      pct: totalAssets > 0 ? (g.value / totalAssets) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const monthlySipTotal = investmentGroups.reduce((s, g) => s + g.monthlySip, 0);

  // Flag top concentration if a single asset class > 60% of total.
  const top = investmentGroups[0];
  const topConcentration =
    top && top.pct > 60 ? { assetClass: top.assetClass, pct: top.pct } : null;

  const propertyAssets: { label: string; value: number }[] = [];
  if (houseVal) propertyAssets.push({ label: "Primary residence", value: houseVal });
  if (propVal) propertyAssets.push({ label: "Other property", value: propVal });

  return {
    investmentGroups, investmentTotal,
    propertyAssets, propertyTotal,
    epfNps, totalAssets,
    monthlySipTotal, topConcentration,
  };
}

// =============================================================================
// Debts breakdown
// =============================================================================

export interface DebtDetail {
  loanType: string;
  lender: string | null;
  outstanding: number;
  emiMonthly: number | null;
  rate: number | null;
  tenureMonths: number | null;
  isUnsecured: boolean;
}

export interface DebtsResult {
  debts: DebtDetail[];
  totalOutstanding: number;
  totalMonthlyEmi: number;
  securedDebt: number;
  unsecuredDebt: number;
  debtToIncome: number | null;  // totalOutstanding / annual income
  emiToIncome: number | null;   // annualEmi / income
}

export function debtsBreakdown(
  facts: ExtendedFacts | null,
  loans: FullLoanRow[]
): DebtsResult {
  const income =
    (facts?.income_self ?? 0) +
    (facts?.income_spouse ?? 0) +
    (facts?.income_other ?? 0) +
    (facts?.rental_income ?? 0);

  const debts: DebtDetail[] = loans
    .map((l) => {
      const loanType = l.loan_type ?? "Other";
      return {
        loanType,
        lender: l.lender ?? null,
        outstanding: l.outstanding ?? 0,
        emiMonthly: l.emi ?? null,
        rate: l.rate ?? null,
        tenureMonths: l.tenure_months ?? null,
        isUnsecured: UNSECURED_TYPES.has(loanType.toLowerCase()),
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  const totalOutstanding = debts.reduce((s, d) => s + d.outstanding, 0);
  const totalMonthlyEmi = debts.reduce((s, d) => s + (d.emiMonthly ?? 0), 0);
  const securedDebt = debts.filter((d) => !d.isUnsecured).reduce((s, d) => s + d.outstanding, 0);
  const unsecuredDebt = debts.filter((d) => d.isUnsecured).reduce((s, d) => s + d.outstanding, 0);
  const debtToIncome = income > 0 ? totalOutstanding / income : null;
  const emiToIncome = income > 0 ? (totalMonthlyEmi * 12) / income : null;

  return {
    debts, totalOutstanding, totalMonthlyEmi,
    securedDebt, unsecuredDebt, debtToIncome, emiToIncome,
  };
}

// =============================================================================
// Insurance analysis
// =============================================================================

export interface InsuranceResult {
  income: number;
  lifeRequired: number;   // income × 10 rule of thumb
  lifeCurrent: number;
  lifeGap: number;        // max(0, required − current)
  lifeAdequate: boolean;
  healthCover: number | null;
  employerCover: number | null;
  coversHeld: string | null;
  nomineesUpdated: string | null;
  notes: string[];
}

export function insuranceAnalysis(
  facts: ExtendedFacts | null
): InsuranceResult {
  const income =
    (facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0);
  const lifeRequired = income * 10;
  const lifeCurrent = facts?.life_cover ?? 0;
  const lifeGap = Math.max(0, lifeRequired - lifeCurrent);
  const lifeAdequate = income === 0 || lifeCurrent >= lifeRequired;

  const healthCover = facts?.health_cover ?? null;
  const employerCover = facts?.employer_cover ?? null;
  const coversHeld = facts?.covers_held ?? null;
  const nomineesUpdated = facts?.nominees_updated ?? null;

  const notes: string[] = [];
  if (!lifeAdequate) {
    notes.push(
      `Life cover short by ₹${lifeGap.toLocaleString("en-IN", { maximumFractionDigits: 0 })} — consider a term plan.`
    );
  }
  if (!healthCover) {
    notes.push("No health cover recorded — verify and add a family floater policy.");
  } else if (healthCover < 500_000) {
    notes.push("Health cover below ₹5 lakh — consider increasing given medical inflation.");
  }
  if (nomineesUpdated !== "Yes") {
    notes.push(
      "Nominee designations not confirmed as updated — review across all policies and investments."
    );
  }
  if (notes.length === 0) notes.push("No critical insurance gaps identified.");

  return {
    income, lifeRequired, lifeCurrent, lifeGap, lifeAdequate,
    healthCover, employerCover, coversHeld, nomineesUpdated, notes,
  };
}

// Lightweight profile derivation — only needs answers, no full client data
export function profileFromAnswers(answers: RiskAnswer[]): string {
  const { cap, tol } = scoreAnswers(answers);
  const capR = rank(cap / 40);
  const tolR = rank(tol / 35);
  const govR = Math.min(capR, tolR);
  return CATEGORIES[Math.max(0, govR - 1)];
}
