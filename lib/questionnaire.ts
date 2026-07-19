// lib/questionnaire.ts
// Single source of truth for all questionnaire question text, options, and sections.
// Used by both the adviser-facing form and the public client-facing form.

export interface QuestionOption {
  letter: "A" | "B" | "C" | "D" | "E";
  text: string;
}

export interface RiskQuestion {
  num: number;
  section: "capacity" | "tolerance" | "knowledge";
  text: string;
  options: QuestionOption[];
}

// ── Q1–Q8: Risk Capacity ─────────────────────────────────────────────────────
export const CAPACITY_QUESTIONS: RiskQuestion[] = [
  {
    num: 1, section: "capacity",
    text: "What is your primary source of income?",
    options: [
      { letter: "A", text: "No stable income / dependent" },
      { letter: "B", text: "Irregular / freelance / business income" },
      { letter: "C", text: "Salaried — private sector" },
      { letter: "D", text: "Salaried — government / PSU" },
      { letter: "E", text: "Multiple stable income sources" },
    ],
  },
  {
    num: 2, section: "capacity",
    text: "What is your approximate annual household income (all sources)?",
    options: [
      { letter: "A", text: "Below Rs. 3 lakh" },
      { letter: "B", text: "Rs. 3 lakh – Rs. 10 lakh" },
      { letter: "C", text: "Rs. 10 lakh – Rs. 25 lakh" },
      { letter: "D", text: "Rs. 25 lakh – Rs. 75 lakh" },
      { letter: "E", text: "Above Rs. 75 lakh" },
    ],
  },
  {
    num: 3, section: "capacity",
    text: "What percentage of your monthly income do you currently save or invest?",
    options: [
      { letter: "A", text: "Less than 5%" },
      { letter: "B", text: "5% – 15%" },
      { letter: "C", text: "15% – 25%" },
      { letter: "D", text: "25% – 40%" },
      { letter: "E", text: "More than 40%" },
    ],
  },
  {
    num: 4, section: "capacity",
    text: "How stable do you consider your primary income over the next 5 years?",
    options: [
      { letter: "A", text: "Very uncertain — likely to decline or stop" },
      { letter: "B", text: "Somewhat uncertain — income may fluctuate" },
      { letter: "C", text: "Moderately stable — some growth expected" },
      { letter: "D", text: "Stable — steady or growing income expected" },
      { letter: "E", text: "Very stable — guaranteed or highly predictable" },
    ],
  },
  {
    num: 5, section: "capacity",
    text: "How many financial dependents do you currently have (spouse, children, parents, etc.)?",
    options: [
      { letter: "A", text: "5 or more" },
      { letter: "B", text: "3–4" },
      { letter: "C", text: "2" },
      { letter: "D", text: "1" },
      { letter: "E", text: "None" },
    ],
  },
  {
    num: 6, section: "capacity",
    text: "What is your primary investment horizon (when do you expect to need the majority of this money)?",
    options: [
      { letter: "A", text: "Within 1 year" },
      { letter: "B", text: "1–3 years" },
      { letter: "C", text: "3–5 years" },
      { letter: "D", text: "5–10 years" },
      { letter: "E", text: "More than 10 years" },
    ],
  },
  {
    num: 7, section: "capacity",
    text: "Do you have a liquid emergency fund that covers at least 6 months of your household expenses?",
    options: [
      { letter: "A", text: "No, and I have significant outstanding debt" },
      { letter: "B", text: "No emergency fund" },
      { letter: "C", text: "Partial — covers 1–3 months" },
      { letter: "D", text: "Yes — covers 3–6 months" },
      { letter: "E", text: "Yes — covers more than 6 months" },
    ],
  },
  {
    num: 8, section: "capacity",
    text: "What is your current net worth (total assets minus total liabilities) relative to your annual income?",
    options: [
      { letter: "A", text: "Negative net worth (debts exceed assets)" },
      { letter: "B", text: "Less than 1× annual income" },
      { letter: "C", text: "1× – 3× annual income" },
      { letter: "D", text: "3× – 7× annual income" },
      { letter: "E", text: "More than 7× annual income" },
    ],
  },
];

// ── Q9–Q15: Risk Tolerance ───────────────────────────────────────────────────
export const TOLERANCE_QUESTIONS: RiskQuestion[] = [
  {
    num: 9, section: "tolerance",
    text: "If your investment portfolio dropped by 20% in a single month, what would you most likely do?",
    options: [
      { letter: "A", text: "Sell everything immediately to prevent further loss" },
      { letter: "B", text: "Sell some investments to reduce exposure" },
      { letter: "C", text: "Hold and wait for recovery — do nothing" },
      { letter: "D", text: "Review the situation and consider buying more" },
      { letter: "E", text: "Invest more — view the dip as an opportunity" },
    ],
  },
  {
    num: 10, section: "tolerance",
    text: "What is your primary investment objective?",
    options: [
      { letter: "A", text: "Capital preservation — protect what I have" },
      { letter: "B", text: "Regular income with minimal capital risk" },
      { letter: "C", text: "Balanced — moderate growth with moderate risk" },
      { letter: "D", text: "Long-term capital growth, accepting short-term volatility" },
      { letter: "E", text: "Maximum growth — I accept significant short-term losses" },
    ],
  },
  {
    num: 11, section: "tolerance",
    text: "What annual return do you realistically expect from your investment portfolio?",
    options: [
      { letter: "A", text: "4–6% (FD / savings rate — minimal risk)" },
      { letter: "B", text: "6–9% (debt / hybrid — low risk)" },
      { letter: "C", text: "9–12% (balanced — moderate risk)" },
      { letter: "D", text: "12–18% (equity — higher risk)" },
      { letter: "E", text: "18%+ (aggressive — very high risk)" },
    ],
  },
  {
    num: 12, section: "tolerance",
    text: "How comfortable are you with your portfolio losing value in the short term in exchange for higher long-term gains?",
    options: [
      { letter: "A", text: "Not at all — any loss is unacceptable to me" },
      { letter: "B", text: "I can accept a small temporary loss (up to 5%)" },
      { letter: "C", text: "I can accept a moderate temporary loss (up to 15%)" },
      { letter: "D", text: "I can accept a significant temporary loss (up to 30%)" },
      { letter: "E", text: "I can accept a large temporary loss (30%+) for superior long-term returns" },
    ],
  },
  {
    num: 13, section: "tolerance",
    text: "What proportion of your total investable assets could you genuinely afford to lose without it significantly affecting your lifestyle?",
    options: [
      { letter: "A", text: "None — I cannot afford to lose any" },
      { letter: "B", text: "Up to 5%" },
      { letter: "C", text: "5% – 20%" },
      { letter: "D", text: "20% – 40%" },
      { letter: "E", text: "More than 40%" },
    ],
  },
  {
    num: 14, section: "tolerance",
    text: "When markets are volatile and news is negative, what best describes your reaction?",
    options: [
      { letter: "A", text: "Extreme anxiety — I lose sleep and act impulsively" },
      { letter: "B", text: "Considerable worry — I monitor daily and feel stressed" },
      { letter: "C", text: "Mild concern — I keep an eye on it but stay calm" },
      { letter: "D", text: "Comfortable — I trust my plan and ignore short-term noise" },
      { letter: "E", text: "Excited — I look for opportunities in the volatility" },
    ],
  },
  {
    num: 15, section: "tolerance",
    text: "Have you previously experienced a significant investment loss (more than 20% of portfolio value)?",
    options: [
      { letter: "A", text: "Yes, and I exited investments immediately" },
      { letter: "B", text: "Yes, and I reduced my exposure considerably" },
      { letter: "C", text: "Yes, and I held on and eventually recovered" },
      { letter: "D", text: "Yes, and I increased my investment during the downturn" },
      { letter: "E", text: "No prior major loss experience" },
    ],
  },
];

// ── Q16–Q19: Knowledge & Experience ─────────────────────────────────────────
export const KNOWLEDGE_QUESTIONS: RiskQuestion[] = [
  {
    num: 16, section: "knowledge",
    text: "How would you rate your understanding of equity/stock market investing?",
    options: [
      { letter: "A", text: "No understanding — I have never invested in equities" },
      { letter: "B", text: "Basic — I know what stocks are but have never invested" },
      { letter: "C", text: "Moderate — I invest in mutual funds or blue-chip stocks" },
      { letter: "D", text: "Good — I actively manage a diversified equity portfolio" },
      { letter: "E", text: "Expert — I analyse fundamentals and manage my own portfolio" },
    ],
  },
  {
    num: 17, section: "knowledge",
    text: "How familiar are you with debt instruments (bonds, debentures, FDs, debt mutual funds)?",
    options: [
      { letter: "A", text: "No familiarity — I only use savings accounts" },
      { letter: "B", text: "Basic — I know about FDs and PPF" },
      { letter: "C", text: "Moderate — I invest in debt mutual funds or bonds" },
      { letter: "D", text: "Good — I understand yield, duration, and credit risk" },
      { letter: "E", text: "Expert — I actively manage a debt portfolio" },
    ],
  },
  {
    num: 18, section: "knowledge",
    text: "How familiar are you with alternative investments (PMS, AIF, REITs, derivatives, commodities)?",
    options: [
      { letter: "A", text: "No familiarity — I have never heard of these" },
      { letter: "B", text: "Basic — I have heard of them but never invested" },
      { letter: "C", text: "Moderate — I have some exposure to one of these" },
      { letter: "D", text: "Good — I have actively invested in 2–3 of these" },
      { letter: "E", text: "Expert — I regularly invest across multiple alternatives" },
    ],
  },
  {
    num: 19, section: "knowledge",
    text: "How many years of active investment experience do you have (beyond savings accounts and FDs)?",
    options: [
      { letter: "A", text: "None — I have never invested" },
      { letter: "B", text: "Less than 1 year" },
      { letter: "C", text: "1–3 years" },
      { letter: "D", text: "3–7 years" },
      { letter: "E", text: "More than 7 years" },
    ],
  },
];

export const ALL_RISK_QUESTIONS: RiskQuestion[] = [
  ...CAPACITY_QUESTIONS,
  ...TOLERANCE_QUESTIONS,
  ...KNOWLEDGE_QUESTIONS,
];

// ── Behaviour questions (separate from scored Q1-19) ─────────────────────────
export const BEHAVIOUR_OPTIONS = {
  beh1: [
    { value: "Sell immediately", label: "Sell immediately to cut losses" },
    { value: "Feel anxious but hold", label: "Feel anxious but hold on" },
    { value: "Buy more", label: "View it as a buying opportunity and invest more" },
  ],
  beh2: [
    { value: "Yes", label: "Yes — I have switched investments based on recent performance" },
    { value: "No", label: "No — I stick to my original plan" },
    { value: "Never faced this", label: "I have not faced this situation" },
  ],
  beh3: [
    { value: "Often", label: "Often — daily or weekly" },
    { value: "Sometimes", label: "Sometimes — monthly" },
    { value: "Rarely / never", label: "Rarely or never" },
  ],
};

// ── Knowledge grid asset classes ─────────────────────────────────────────────
export const KNOWLEDGE_ASSETS = [
  { key: "stocks",  label: "Stocks / Direct Equity" },
  { key: "mf",      label: "Mutual Funds" },
  { key: "etf",     label: "ETFs" },
  { key: "debt",    label: "Debt / Bonds / NCDs" },
  { key: "gold",    label: "Gold / Sovereign Gold Bonds" },
  { key: "intl",    label: "International Funds" },
  { key: "deriv",   label: "Derivatives / Options" },
  { key: "alts",    label: "Alternatives (AIF / PMS / REIT)" },
] as const;

export const KNOWLEDGE_LEVELS = ["None", "Basic", "Intermediate", "Advanced"] as const;

// ── Loan types (matches pdfExtract) ─────────────────────────────────────────
export const LOAN_TYPES = [
  "Home Loan", "Vehicle Loan", "Personal Loan",
  "Education Loan", "Business Loan", "Other",
] as const;

// ── Goal priorities / flexibility ────────────────────────────────────────────
export const GOAL_PRIORITIES = ["High", "Medium", "Low"] as const;
export const GOAL_FLEXIBILITIES = ["Not flexible", "Somewhat flexible", "Very flexible"] as const;

// ── Questionnaire sections (ordered steps) ───────────────────────────────────
export type QStep =
  | "personal"
  | "financial"
  | "family"
  | "goals"
  | "loans"
  | "investments"
  | "risk"
  | "behaviour"
  | "review";

export const QSTEPS: { id: QStep; label: string; icon: string }[] = [
  { id: "personal",    label: "Personal",      icon: "👤" },
  { id: "financial",   label: "Financial",     icon: "💰" },
  { id: "family",      label: "Family",        icon: "👨‍👩‍👧" },
  { id: "goals",       label: "Goals",         icon: "🎯" },
  { id: "loans",       label: "Loans",         icon: "🏦" },
  { id: "investments", label: "Investments",   icon: "📈" },
  { id: "risk",        label: "Risk Profile",  icon: "🧩" },
  { id: "behaviour",   label: "Behaviour",     icon: "🧠" },
  { id: "review",      label: "Review & Submit", icon: "✅" },
];
