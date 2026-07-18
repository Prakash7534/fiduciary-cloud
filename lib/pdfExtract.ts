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
    } catch {
      // unsupported field type — skip
    }
  }
  return out;
}

function num(v: string | boolean | undefined): number | null {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = parseFloat(v.replace(/,/g, "").replace(/₹/g, "").trim());
  return isNaN(n) ? null : n;
}

function pick(m: RawFields, pairs: [string, string][]): string | null {
  for (const [code, label] of pairs) {
    if (m[code]) return label;
  }
  return null;
}

function parseDateToIso(v: string | boolean | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  const match = v.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!match) return null;
  const [, d, mo, y] = match;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

// -----------------------------------------------------------------------------
// Maps the raw field dict into the shape needed for each Supabase table insert.
// This mirrors db_loader.py's load_client() — extend the same way if you add
// more named fields to the PDF (Section G etc.) later.
// -----------------------------------------------------------------------------
export function mapToClient(m: RawFields) {
  return {
    full_name: (m["client_name"] as string) ?? "Unnamed client",
    pan: (m["pan"] as string) ?? null,
    dob: parseDateToIso(m["dob"]),
    email: (m["email"] as string) ?? null,
    phone: (m["phone"] as string) ?? null,
    gender: (m["gender"] as string) ?? null,
    marital_status: (m["marital_status"] as string) ?? null,
    address: (m["address"] as string) ?? null,
    occupation: (m["occupation"] as string) ?? null,
    employer: (m["employer"] as string) ?? null,
    education: (m["education"] as string) ?? null,
    dependants_detail: (m["dependants_detail"] as string) ?? null,
    nationality: (m["nationality"] as string) ?? null,
    industry: (m["industry"] as string) ?? null,
    years_exp: num(m["years_exp"]),
    career_stage: pick(m, [
      ["career_early", "Early career"], ["career_growth", "Growth phase"],
      ["career_peak", "Peak earning"], ["career_pre", "Pre-retirement"], ["career_retired", "Retired"],
    ]),
    expecting_inheritance: !!m["exp_inheritance"],
    owns_business: !!m["own_business"],
    plan_change: !!m["plan_change"],
    sole_earner: !!m["sole_earner"],
  };
}

export function mapToFinancialFacts(m: RawFields) {
  return {
    income_self: num(m["inc_self"]),
    income_spouse: num(m["inc_spouse"]),
    income_other: num(m["inc_other"]),
    expenses_annual: num(m["expenses_annual"]),
    life_cover: num(m["life_cover"]),
    health_cover: num(m["health_cover"]),
    house_value: num(m["house_value"]),
    prop_value: num(m["prop_value"]),
    rental_income: num(m["rental_income"]),
    retirement_age: num(m["retage_self"]) ?? num(m["retage_from_b6"]),
    ret_expenses: num(m["ret_exp"]),
    ret_pension: num(m["ret_pension"]),
    sec80c: num(m["sec80c"]),
    sec80d: num(m["sec80d"]),
    employer_cover: num(m["employer_cover"]),
    current_adviser: (m["cur_adviser"] as string) ?? null,
    sector_pref: (m["sector_pref"] as string) ?? null,
    source_wealth: (m["source_wealth"] as string) ?? null,
    source_funds: (m["source_funds"] as string) ?? null,
    nominees_updated: pick(m, [["nominees_yes", "Yes"], ["nominees_no", "No"], ["nominees_notsure", "Not sure"]]),
    will_status: pick(m, [["will_yes", "Yes"], ["will_no", "No"], ["will_progress", "In progress"]]),
    trust_status: pick(m, [["trust_yes", "Yes"], ["trust_no", "No"], ["trust_na", "Not applicable"]]),
    poa_status: pick(m, [["poa_yes", "Yes"], ["poa_no", "No"]]),
    guardian_status: pick(m, [["guardian_yes", "Yes"], ["guardian_no", "No"], ["guardian_na", "Not applicable"]]),
    fatca: pick(m, [["fatca_no", "No"], ["fatca_yes", "Yes"]]),
    pep: pick(m, [["pep_no", "No"], ["pep_yes", "Yes"]]),
    capital_gains: pick(m, [["cg_no", "No"], ["cg_st", "Short-term"], ["cg_lt", "Long-term"], ["cg_both", "Both"]]),
    foreign_assets: pick(m, [["fa_no", "No"], ["fa_assets", "Yes"], ["fa_income", "Yes"], ["fa_both", "Yes"]]),
  };
}

const LOAN_TYPES = [
  "Home Loan", "Vehicle Loan", "Personal Loan", "Education Loan", "Gold Loan",
  "Credit Card Outstanding", "Loan Against Property / Securities", "Business Loan", "Other",
];

export function mapToLoans(m: RawFields) {
  const rows: { loan_type: string; lender: string | null; outstanding: number; emi: number | null; rate: number | null; tenure_months: number | null }[] = [];
  for (let i = 1; i <= 9; i++) {
    const out = num(m[`loan${i}_out`]);
    if (out) {
      rows.push({
        loan_type: LOAN_TYPES[i - 1],
        lender: (m[`loan${i}_lender`] as string) ?? null,
        outstanding: out,
        emi: num(m[`loan${i}_emi`]),
        rate: num(m[`loan${i}_rate`]),
        tenure_months: num(m[`loan${i}_tenure`]),
      });
    }
  }
  return rows;
}

const INV_CLASSES = [
  "Bank FDs / RDs / Post Office / Small Savings", "Debt Mutual Funds / Bonds",
  "Equity Mutual Funds / Index Funds / ETFs", "Direct Equity (stocks)", "EPF / PPF / NPS",
  "Gold (physical / SGB / funds)", "Real Estate (investment)",
  "Traditional Insurance / ULIPs (fund value)", "Others (crypto, AIF, PMS, unlisted)",
];

export function mapToInvestments(m: RawFields) {
  const rows: { asset_class: string; value: number; monthly_sip: number | null }[] = [];
  for (let i = 1; i <= 9; i++) {
    const val = num(m[`inv${i}_val`]);
    if (val) rows.push({ asset_class: INV_CLASSES[i - 1], value: val, monthly_sip: num(m[`inv${i}_sip`]) });
  }
  return rows;
}

export function mapToGoals(m: RawFields) {
  const rows: { goal_name: string | null; target_year: number | null; cost_today: number; saved: number | null; monthly_sip: number | null }[] = [];
  for (let i = 1; i <= 6; i++) {
    const cost = num(m[`goal${i}_cost`]);
    if (cost) {
      rows.push({
        goal_name: (m[`goal${i}_name`] as string) ?? null,
        target_year: num(m[`goal${i}_year`]),
        cost_today: cost,
        saved: num(m[`goal${i}_saved`]),
        monthly_sip: num(m[`goal${i}_sip`]),
      });
    }
  }
  return rows;
}

export function mapToFamily(m: RawFields) {
  const rows: { name: string; relationship: string | null; age: number | null; occupation: string | null; annual_income: number | null; health_status: string | null }[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = m[`fam${i}_name`] as string;
    if (name) {
      rows.push({
        name,
        relationship: (m[`fam${i}_rel`] as string) ?? null,
        age: num(m[`fam${i}_age`]),
        occupation: (m[`fam${i}_occ`] as string) ?? null,
        annual_income: num(m[`fam${i}_income`]),
        health_status: (m[`fam${i}_health`] as string) ?? null,
      });
    }
  }
  return rows;
}

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
