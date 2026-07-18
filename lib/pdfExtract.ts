// lib/pdfExtract.ts
import { PDFDocument, PDFCheckBox, PDFTextField } from "pdf-lib";

export type RawFields = Record<string, string | boolean>;

export async function extractPdfFields(bytes: ArrayBuffer): Promise<RawFields> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const out: RawFields = {};
  for (const field of form.getFields()) {
    const name = field.getName();
    try {
      if (field instanceof PDFCheckBox) {
        out[name] = field.isChecked();
      } else if (field instanceof PDFTextField) {
        const t = field.getText();
        if (t) out[name] = t;
      }
    } catch { /* unsupported field type */ }
  }
  return out;
}

function num(v: string | boolean | undefined): number | null {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = parseFloat((v as string).replace(/,/g, "").replace(/₹/g, "").trim());
  return isNaN(n) ? null : n;
}

function pick(m: RawFields, pairs: [string, string][]): string | null {
  for (const [code, label] of pairs) { if (m[code]) return label; }
  return null;
}

function multi(m: RawFields, pairs: [string, string][]): string | null {
  const vals = pairs.filter(([code]) => m[code]).map(([, label]) => label);
  return vals.length ? vals.join(", ") : null;
}

function parseDateToIso(v: string | boolean | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  const match = v.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!match) return null;
  const [, d, mo, y] = match;
  return `${y}-${d.padStart(2, "0")}-${mo.padStart(2, "0")}`;
}

// ── Section A — client identity ───────────────────────────────────────────────
export function mapToClient(m: RawFields) {
  return {
    full_name: (m["client_name"] as string) ?? "Unnamed client",
    pan:       (m["pan"] as string) ?? null,
    dob:       parseDateToIso(m["dob"]),
    email:     (m["email"] as string) ?? null,
    phone:     (m["phone"] as string) ?? null,
    gender:    (m["gender"] as string) ?? null,
    marital_status: (m["marital_status"] as string) ?? null,
    address:   (m["address"] as string) ?? null,
    occupation: (m["occupation"] as string) ?? null,
    employer:  (m["employer"] as string) ?? null,
    education: (m["education"] as string) ?? null,
    dependants_detail: (m["dependants_detail"] as string) ?? null,
    // G1 extended
    nationality:  (m["nationality"] as string) ?? null,
    industry:     (m["industry"] as string) ?? null,
    years_exp:    num(m["years_exp"]),
    career_stage: pick(m, [
      ["career_early", "Early career"], ["career_growth", "Growth phase"],
      ["career_peak",  "Peak earning"], ["career_pre",    "Pre-retirement"],
      ["career_retired","Retired"],
    ]),
    expecting_inheritance: !!m["exp_inheritance"],
    owns_business:         !!m["own_business"],
    plan_change:           !!m["plan_change"],
    sole_earner:           !!m["sole_earner"],
    // Section A checkboxes
    client_type: pick(m, [
      ["ctype_individual","Individual"], ["ctype_huf","HUF"], ["ctype_nri","NRI"],
      ["ctype_corporate","Body Corporate"], ["ctype_trust","Trust"], ["ctype_other","Other"],
    ]),
    residential_status: pick(m, [
      ["res_resident","Resident Indian"], ["res_nri","NRI"],
      ["res_pio","Person of Indian Origin"], ["res_foreign","Foreign National"],
    ]),
  };
}

// ── Section B — financial facts ───────────────────────────────────────────────
export function mapToFinancialFacts(m: RawFields) {
  return {
    // B1 — income, expenses, protection
    household_income_type: pick(m, [
      ["hh_single","Single income"],["hh_dual","Dual income"],["hh_multiple","Multiple earners"],
    ]),
    income_self:    num(m["inc_self"]),
    income_spouse:  num(m["inc_spouse"]),
    income_other:   num(m["inc_other"]),
    var_pay:        (m["var_pay"] as string) ?? null,
    expenses_annual: num(m["expenses_annual"]),
    life_cover:     num(m["life_cover"]),
    health_cover:   num(m["health_cover"]),
    // B2 — housing
    current_residence: pick(m, [
      ["res_own_paid","Own – fully paid"],["res_own_loan","Own – with home loan"],
      ["res_rented","Rented"],["res_family","Family-owned"],["res_employer","Employer-provided"],
    ]),
    rent_monthly:   num(m["rent_monthly"]),
    house_value:    num(m["house_value"]),
    prop_count:     (m["prop_count"] as string) ?? null,
    prop_value:     num(m["prop_value"]),
    rental_income:  num(m["rental_income"]),
    property_plan:  (m["property_plan"] as string) ?? null,
    // B4 — portfolio extras
    epf_nps_corpus: num(m["epf_nps_corpus"]),
    // B5 — investment style
    invest_mode: pick(m, [
      ["mode_sip","SIP"],["mode_lump","Lumpsum"],["mode_both","SIP + Lumpsum"],["mode_stp","STP"],
    ]),
    surplus_arises: pick(m, [
      ["sur_monthly","Steady monthly"],["sur_quarterly","Quarterly / half-yearly"],
      ["sur_irregular","Irregular / lumpy"],["sur_windfall","Windfalls only"],
    ]),
    decision_maker: pick(m, [
      ["dec_self","Entirely myself"],["dec_joint","Jointly with spouse / family"],
      ["dec_adviser","Rely on adviser"],["dec_both","Adviser + own research"],
    ]),
    monitor_frequency: pick(m, [
      ["mon_daily","Daily"],["mon_weekly","Weekly"],["mon_monthly","Monthly"],
      ["mon_quarterly","Quarterly"],["mon_rarely","Rarely / annually"],
    ]),
    past_experience: pick(m, [
      ["exp_profit","Mostly profitable"],["exp_mixed","Mixed"],
      ["exp_loss","Mostly loss-making"],["exp_none","No prior experience"],
    ]),
    // B6 — other
    retirement_age:       num(m["retage_self"]) ?? num(m["retage_from_b6"]),
    income_growth_pct:    (m["income_growth_pct"] as string) ?? null,
    large_inflows:        (m["large_inflows"] as string) ?? null,
    large_expenses:       (m["large_expenses"] as string) ?? null,
    medical_commitments:  (m["medical_commitments"] as string) ?? null,
    adviser_notes_misc:   (m["adviser_notes"] as string) ?? null,
    // F — goals meta
    goal_types:            multi(m, [
      ["gtype_retirement","Retirement"],["gtype_education","Child's education"],
      ["gtype_marriage","Child's marriage"],["gtype_house","Buying a house"],
      ["gtype_upgrade","Upgrading house"],["gtype_vehicle","Vehicle purchase"],
      ["gtype_travel","Foreign travel"],["gtype_business","Starting a business"],
      ["gtype_loan","Loan prepayment"],["gtype_emergency","Emergency corpus"],
      ["gtype_parents","Parents' care"],["gtype_charity","Charity / legacy"],
      ["gtype_wealth","Wealth creation"],
    ]),
    most_important_goal: (m["most_imp_goal"] as string) ?? null,
    goal_rank1: (m["goal_rank1"] as string) ?? null,
    goal_rank2: (m["goal_rank2"] as string) ?? null,
    goal_rank3: (m["goal_rank3"] as string) ?? null,
    // F3 — retirement detail
    ret_expenses: num(m["ret_exp"]),
    ret_pension:  num(m["ret_pension"]),
    retirement_house_status: pick(m, [
      ["ret_house_owned","Fully owned"],["ret_house_loan","Loan still running"],
      ["ret_house_buy","Planning to buy"],["ret_house_rent","Will rent / undecided"],
    ]),
    retirement_dependants: pick(m, [
      ["ret_dep_none","None"],["ret_dep_spouse","Spouse only"],
      ["ret_dep_parents","Spouse + parents"],["ret_dep_children","Spouse + children"],
      ["ret_dep_extended","Extended family"],
    ]),
    // F4 — education
    education_funding: pick(m, [
      ["edu_self","Fully self-funded"],["edu_partloan","Part education loan"],
      ["edu_loan","Mostly education loan"],["edu_scholarship","Scholarships expected"],
    ]),
    // F5 — portfolio-level preferences
    surplus_shortfall_pref: multi(m, [
      ["ssf_postpone","Postpone lower-priority goals"],["ssf_scale","Scale down amounts"],
      ["ssf_savings","Increase savings / cut expenses"],["ssf_risk","Take higher investment risk"],
      ["ssf_loan","Use loans for some goals"],
    ]),
    goalwise_bucketing: pick(m, [["gwb_yes","Yes"],["gwb_no","No"],["gwb_adviser","Adviser's discretion"]]),
    investment_horizon: pick(m, [
      ["hor_under3","Under 3 years"],["hor_3to5","3–5 years"],
      ["hor_5to10","5–10 years"],["hor_over10","Over 10 years"],
    ]),
    income_need:      pick(m, [["need_none","None"],["need_partial","Partial"],["need_primary","Primary source"]]),
    withdrawal_3yr:   (m["withdrawal_3yr"] as string) ?? null,
    restrictions:     (m["restrictions"] as string) ?? null,
    // G3 — tax
    sec80c: num(m["sec80c"]),
    sec80d: num(m["sec80d"]),
    capital_gains: pick(m, [["cg_no","No"],["cg_st","Short-term"],["cg_lt","Long-term"],["cg_both","Both"]]),
    foreign_assets: pick(m, [["fa_no","No"],["fa_assets","Yes – assets"],["fa_income","Yes – income"],["fa_both","Yes – both"]]),
    // G4 — insurance
    covers_held: multi(m, [
      ["cov_accident","Accident"],["cov_critical","Critical illness"],
      ["cov_disability","Disability"],["cov_none","None beyond life & health"],
    ]),
    employer_cover:    num(m["employer_cover"]),
    nominees_updated:  pick(m, [["nominees_yes","Yes"],["nominees_no","No"],["nominees_notsure","Not sure"]]),
    // G5 — existing review
    current_adviser:    (m["cur_adviser"] as string) ?? null,
    reason_for_investing: pick(m, [
      ["reas_tax","Tax saving"],["reas_rec","Someone recommended it"],
      ["reas_own","Own research"],["reas_emp","Employer/salary-linked"],["reas_notsure","Not sure"],
    ]),
    review_freq: pick(m, [
      ["rev_never","Never"],["rev_occasionally","Occasionally"],
      ["rev_annually","Annually"],["rev_quarterly","Quarterly or more"],
    ]),
    // G8 — investment preferences
    style_pref: pick(m, [
      ["style_growth","Growth"],["style_income","Income"],
      ["style_capital","Capital preservation"],["style_balanced","Balanced"],
    ]),
    esg_pref:  pick(m, [["esg_yes","Yes"],["esg_no","No"],["esg_neutral","No strong preference"]]),
    intl_pref: pick(m, [["intl_yes","Yes"],["intl_no","No"],["intl_notsure","Not sure"]]),
    sector_pref: (m["sector_pref"] as string) ?? null,
    // G9 — estate planning
    will_status:     pick(m, [["will_yes","Yes"],["will_no","No"],["will_progress","In progress"]]),
    trust_status:    pick(m, [["trust_yes","Yes"],["trust_no","No"],["trust_na","Not applicable"]]),
    poa_status:      pick(m, [["poa_yes","Yes"],["poa_no","No"]]),
    guardian_status: pick(m, [["guardian_yes","Yes"],["guardian_no","No"],["guardian_na","Not applicable"]]),
    // G10 — compliance
    fatca:        pick(m, [["fatca_no","No"],["fatca_yes","Yes"]]),
    pep:          pick(m, [["pep_no","No"],["pep_yes","Yes"]]),
    source_wealth: (m["source_wealth"] as string) ?? null,
    source_funds:  (m["source_funds"] as string) ?? null,
  };
}

// ── Section G7 — Behaviour ────────────────────────────────────────────────────
export function mapToBehaviour(m: RawFields) {
  const beh1 = pick(m, [["beh1_sell","Sell immediately"],["beh1_hold","Feel anxious but hold"],["beh1_buy","Buy more"]]);
  const beh2 = pick(m, [["beh2_yes","Yes"],["beh2_no","No"],["beh2_never","Never faced this"]]);
  const beh3 = pick(m, [["beh3_often","Often"],["beh3_sometimes","Sometimes"],["beh3_rarely","Rarely / never"]]);
  return { beh1, beh2, beh3 };
}

// ── Section G6 — Knowledge grid ───────────────────────────────────────────────
export function mapToKnowledgeGrid(m: RawFields) {
  const classes = [
    { key: "stocks",  label: "Stocks" },
    { key: "mf",      label: "Mutual Funds" },
    { key: "etf",     label: "ETFs" },
    { key: "debt",    label: "Debt / Bonds" },
    { key: "gold",    label: "Gold" },
    { key: "intl",    label: "International" },
    { key: "deriv",   label: "Derivatives" },
    { key: "alts",    label: "Alternatives (AIF/PMS)" },
  ];
  return classes
    .map(({ key, label }) => {
      const level = pick(m, [
        [`kg_${key}_good`, "Good"],
        [`kg_${key}_basic`, "Basic"],
        [`kg_${key}_none`, "None"],
      ]) ?? "None";
      return { asset_class: label, level };
    })
    .filter(r => r.level !== "None" || m[`kg_${r.asset_class.toLowerCase().replace(/[^a-z]/g, "")}_none`]);
}

// ── Section B3 — Loans ────────────────────────────────────────────────────────
const LOAN_TYPES = [
  "Home Loan","Vehicle Loan","Personal Loan","Education Loan","Gold Loan",
  "Credit Card Outstanding","Loan Against Property / Securities","Business Loan","Other",
];

export function mapToLoans(m: RawFields) {
  const rows: { loan_type: string; lender: string | null; outstanding: number; emi: number | null; rate: number | null; tenure_months: number | null }[] = [];
  for (let i = 1; i <= 9; i++) {
    const out = num(m[`loan${i}_out`]);
    if (out) rows.push({
      loan_type: LOAN_TYPES[i - 1],
      lender:   (m[`loan${i}_lender`] as string) ?? null,
      outstanding: out,
      emi:          num(m[`loan${i}_emi`]),
      rate:         num(m[`loan${i}_rate`]),
      tenure_months: num(m[`loan${i}_tenure`]),
    });
  }
  return rows;
}

// ── Section B4 — Investments ──────────────────────────────────────────────────
const INV_CLASSES = [
  "Bank FDs / RDs / Post Office / Small Savings","Debt Mutual Funds / Bonds",
  "Equity Mutual Funds / Index Funds / ETFs","Direct Equity (stocks)","EPF / PPF / NPS",
  "Gold (physical / SGB / funds)","Real Estate (investment)",
  "Traditional Insurance / ULIPs (fund value)","Others (crypto, AIF, PMS, unlisted)",
];

export function mapToInvestments(m: RawFields) {
  const rows: { asset_class: string; value: number; monthly_sip: number | null }[] = [];
  for (let i = 1; i <= 9; i++) {
    const val = num(m[`inv${i}_val`]);
    if (val) rows.push({ asset_class: INV_CLASSES[i - 1], value: val, monthly_sip: num(m[`inv${i}_sip`]) });
  }
  return rows;
}

// ── Section F — Goals ─────────────────────────────────────────────────────────
export function mapToGoals(m: RawFields) {
  const rows: { goal_name: string | null; target_year: number | null; cost_today: number; saved: number | null; monthly_sip: number | null; priority: string | null; flexibility: string | null }[] = [];
  for (let i = 1; i <= 6; i++) {
    const cost = num(m[`goal${i}_cost`]);
    if (cost) rows.push({
      goal_name:   (m[`goal${i}_name`] as string) ?? null,
      target_year: num(m[`goal${i}_year`]),
      cost_today:  cost,
      saved:       num(m[`goal${i}_saved`]),
      monthly_sip: num(m[`goal${i}_sip`]),
      priority:    (m[`goal${i}_priority`] as string) ?? null,
      flexibility: (m[`goal${i}_flex`] as string) ?? null,
    });
  }
  return rows;
}

// ── Section G2 — Family members ───────────────────────────────────────────────
export function mapToFamily(m: RawFields) {
  const rows: { name: string; relationship: string | null; age: number | null; occupation: string | null; annual_income: number | null; health_status: string | null }[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = m[`fam${i}_name`] as string;
    if (name) rows.push({
      name,
      relationship:  (m[`fam${i}_rel`] as string) ?? null,
      age:           num(m[`fam${i}_age`]),
      occupation:    (m[`fam${i}_occ`] as string) ?? null,
      annual_income: num(m[`fam${i}_income`]),
      health_status: (m[`fam${i}_health`] as string) ?? null,
    });
  }
  return rows;
}

// ── Sections C/D/E — Risk answers (Q1–Q19) ───────────────────────────────────
export function mapToRiskAnswers(m: RawFields) {
  const rows: { question_num: number; answer: "A" | "B" | "C" | "D" | "E" }[] = [];
  for (let q = 1; q <= 19; q++) {
    for (const letter of ["a", "b", "c", "d", "e"] as const) {
      if (m[`q${q}_${letter}`]) {
        rows.push({ question_num: q, answer: letter.toUpperCase() as "A" | "B" | "C" | "D" | "E" });
        break;
      }
    }
  }
  return rows;
}
