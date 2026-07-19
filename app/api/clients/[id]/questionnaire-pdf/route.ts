// app/api/clients/[id]/questionnaire-pdf/route.ts
// Fills the SEBI-compliant PDF template with all client data and returns a download.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// ── helpers ──────────────────────────────────────────────────────────────────
function txt(form: ReturnType<PDFDocument["getForm"]>, name: string, value: string | number | null | undefined) {
  try {
    if (value == null || value === "") return;
    form.getTextField(name).setText(String(value));
  } catch { /* field may not exist */ }
}

function chk(form: ReturnType<PDFDocument["getForm"]>, name: string, condition: boolean) {
  try {
    const cb = form.getCheckBox(name);
    if (condition) cb.check(); else cb.uncheck();
  } catch { /* field may not exist */ }
}

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return "";
  return n.toLocaleString("en-IN");
}

// ── route ─────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── fetch all client data ──────────────────────────────────────────────────
  const [
    { data: cl },
    { data: ff },
    { data: goals },
    { data: loans },
    { data: family },
    { data: risk },
    { data: inv },
    { data: beh },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("goals").select("*").eq("client_id", id).order("priority"),
    supabase.from("loans").select("*").eq("client_id", id),
    supabase.from("family_members").select("*").eq("client_id", id),
    supabase.from("risk_answers").select("*").eq("client_id", id),
    supabase.from("investment_knowledge").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("behaviour_answers").select("*").eq("client_id", id).maybeSingle(),
  ]);

  if (!cl) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // ── load PDF template ──────────────────────────────────────────────────────
  const templatePath = path.join(process.cwd(), "public", "questionnaire-template.pdf");
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const now = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // ── PAGE 1 HEADER ──────────────────────────────────────────────────────────
  txt(form, "f_1", now);                              // Date of Assessment
  txt(form, "f_2", cl.client_code ?? "");             // Client Code

  // ── SECTION A — Client Information ────────────────────────────────────────
  txt(form, "client_name",      cl.full_name);
  txt(form, "pan",              cl.pan);
  txt(form, "dob",              cl.dob ? new Date(cl.dob).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
  txt(form, "gender",           cl.gender);
  txt(form, "marital_status",   cl.marital_status);
  txt(form, "phone",            cl.phone);
  txt(form, "email",            cl.email);
  txt(form, "address",          cl.address);
  txt(form, "occupation",       cl.occupation);
  txt(form, "employer",         cl.employer);
  txt(form, "education",        cl.education);
  txt(form, "dependants_detail", cl.dependants_detail);
  txt(form, "nationality",      cl.nationality ?? "Indian");
  txt(form, "industry",         cl.industry);
  txt(form, "years_exp",        cl.years_exp);

  // Client type checkboxes
  const ct = (cl.client_type ?? "Individual").toLowerCase();
  chk(form, "ctype_individual", ct === "individual");
  chk(form, "ctype_huf",        ct === "huf");
  chk(form, "ctype_nri",        ct === "nri");
  chk(form, "ctype_corporate",  ct.includes("corporate") || ct.includes("body"));
  chk(form, "ctype_trust",      ct === "trust");
  chk(form, "ctype_other",      !["individual","huf","nri","corporate","body corporate","trust"].includes(ct));

  // Residential status checkboxes
  const rs = (cl.residential_status ?? "Resident Indian").toLowerCase();
  chk(form, "resi_indian",  rs.includes("resident indian") || rs === "resident");
  chk(form, "resi_nri",     rs === "nri");
  chk(form, "resi_pio",     rs.includes("pio") || rs.includes("person of indian origin"));
  chk(form, "resi_foreign", rs.includes("foreign"));

  // Career stage
  const career = (cl.career_stage ?? "").toLowerCase();
  chk(form, "career_early",   career.includes("early"));
  chk(form, "career_growth",  career.includes("growth"));
  chk(form, "career_peak",    career.includes("peak") || career.includes("mid"));
  chk(form, "career_pre",     career.includes("pre"));
  chk(form, "career_retired", career.includes("retir"));

  // Boolean flags
  chk(form, "exp_inheritance", cl.expecting_inheritance === true);
  chk(form, "own_business",    cl.owns_business === true);
  chk(form, "plan_change",     cl.plan_change === true);
  chk(form, "sole_earner",     cl.sole_earner === true);

  // ── SECTION B — Financial Situation ───────────────────────────────────────
  if (ff) {
    txt(form, "inc_self",         fmt(ff.income_self));
    txt(form, "inc_spouse",       fmt(ff.income_spouse));
    txt(form, "inc_other",        fmt(ff.income_other));
    txt(form, "life_cover",       fmt(ff.life_cover));
    txt(form, "health_cover",     fmt(ff.health_cover));
    txt(form, "employer_cover",   fmt(ff.employer_cover));
    txt(form, "retage_from_b6",   ff.retirement_age ? String(ff.retirement_age) : "");

    // Income type
    const hasSpouse = (ff.income_spouse ?? 0) > 0;
    const hasOther  = (ff.income_other ?? 0) > 0;
    chk(form, "inc_single",   !hasSpouse && !hasOther);
    chk(form, "inc_dual",     hasSpouse && !hasOther);
    chk(form, "inc_multiple", hasOther);

    // Will / estate
    const will = (ff.will_status ?? "").toLowerCase();
    chk(form, "will_yes",      will === "yes" || will === "done");
    chk(form, "will_no",       will === "no");
    chk(form, "will_progress", will.includes("progress") || will.includes("process"));

    // Trust
    const trust = (ff.trust_status ?? "").toLowerCase();
    chk(form, "trust_yes", trust === "yes");
    chk(form, "trust_no",  trust === "no");
    chk(form, "trust_na",  trust === "na" || trust === "n/a" || trust === "");

    // POA
    const poa = (ff.poa_status ?? "").toLowerCase();
    chk(form, "poa_yes", poa === "yes");
    chk(form, "poa_no",  poa === "no" || poa === "");

    // Guardian
    const guardian = (ff.guardian_status ?? "").toLowerCase();
    chk(form, "guardian_yes", guardian === "yes");
    chk(form, "guardian_no",  guardian === "no" || guardian === "");
    chk(form, "guardian_na",  guardian === "na" || guardian === "n/a");

    // Nominees
    const nom = (ff.nominees_updated ?? "").toLowerCase();
    chk(form, "nominees_yes",     nom === "yes");
    chk(form, "nominees_no",      nom === "no");
    chk(form, "nominees_notsure", nom === "unsure" || nom === "not sure" || nom === "");

    // FATCA / PEP
    const fatca = (ff.fatca ?? "no").toLowerCase();
    chk(form, "fatca_no",  fatca === "no" || fatca === "");
    chk(form, "fatca_yes", fatca === "yes");
    const pep = (ff.pep ?? "no").toLowerCase();
    chk(form, "pep_no",  pep === "no" || pep === "");
    chk(form, "pep_yes", pep === "yes");
  }

  // ── GOALS ─────────────────────────────────────────────────────────────────
  if (goals && goals.length > 0) {
    // Goal type checkboxes (tick the ones present)
    const goalNames = goals.map((g: Record<string, unknown>) => String(g.goal_name ?? "").toLowerCase());
    chk(form, "goal_retirement",    goalNames.some(n => n.includes("retir")));
    chk(form, "goal_education",     goalNames.some(n => n.includes("edu") || n.includes("college")));
    chk(form, "goal_marriage",      goalNames.some(n => n.includes("marr") || n.includes("wedding")));
    chk(form, "goal_house",         goalNames.some(n => n.includes("house") || n.includes("home")));
    chk(form, "goal_vehicle",       goalNames.some(n => n.includes("car") || n.includes("vehicle")));
    chk(form, "goal_travel",        goalNames.some(n => n.includes("travel") || n.includes("vacation")));
    chk(form, "goal_business",      goalNames.some(n => n.includes("business")));
    chk(form, "goal_emergency",     goalNames.some(n => n.includes("emergency")));
    chk(form, "goal_wealthcreation",goalNames.some(n => n.includes("wealth") || n.includes("corpus")));

    goals.slice(0, 6).forEach((g: Record<string, unknown>, i: number) => {
      const n = i + 1;
      txt(form, `goal${n}_name`,  g.goal_name);
      txt(form, `goal${n}_year`,  g.target_year);
      txt(form, `goal${n}_cost`,  fmt(g.target_amount as number));
      txt(form, `goal${n}_saved`, fmt(g.current_savings as number));
      txt(form, `goal${n}_sip`,   fmt(g.monthly_sip as number));
    });

    if (goals[0]) txt(form, "most_important_goal", goals[0].goal_name as string);
  }

  // ── LOANS ─────────────────────────────────────────────────────────────────
  if (loans && loans.length > 0) {
    loans.slice(0, 9).forEach((l: Record<string, unknown>, i: number) => {
      const n = i + 1;
      txt(form, `loan${n}_lender`, l.lender);
      txt(form, `loan${n}_out`,    fmt(l.outstanding as number));
      txt(form, `loan${n}_emi`,    fmt(l.emi as number));
      txt(form, `loan${n}_rate`,   l.interest_rate);
      txt(form, `loan${n}_tenure`, l.tenure_months);
    });
  }

  // ── FAMILY MEMBERS ─────────────────────────────────────────────────────────
  if (family && family.length > 0) {
    family.slice(0, 4).forEach((f: Record<string, unknown>, i: number) => {
      const n = i + 1;
      txt(form, `fam${n}_name`,   f.name);
      txt(form, `fam${n}_rel`,    f.relationship);
      txt(form, `fam${n}_age`,    f.age);
      txt(form, `fam${n}_occ`,    f.occupation);
      txt(form, `fam${n}_income`, fmt(f.income as number));
      txt(form, `fam${n}_health`, f.health_status);
    });
  }

  // ── RISK ANSWERS ──────────────────────────────────────────────────────────
  if (risk && risk.length > 0) {
    risk.forEach((r: Record<string, unknown>) => {
      const qnum = r.question_num as number;
      const ans  = String(r.answer ?? "").toLowerCase();
      ["a","b","c","d","e"].forEach(opt => {
        chk(form, `q${qnum}_${opt}`, ans === opt);
      });
    });
  }

  // ── INVESTMENT KNOWLEDGE ──────────────────────────────────────────────────
  if (inv) {
    const assets: Array<[string, string]> = [
      ["stocks","kn_stocks"],["mf","kn_mf"],["etf","kn_etf"],
      ["debt","kn_debt"],["gold","kn_gold"],["intl","kn_intl"],
      ["derivatives","kn_derivatives"],["alt","kn_alt"],
    ];
    assets.forEach(([key, prefix]) => {
      const level = String((inv as Record<string, unknown>)[key] ?? "none").toLowerCase();
      chk(form, `${prefix}_none`,  level === "none" || level === "");
      chk(form, `${prefix}_basic`, level === "basic");
      chk(form, `${prefix}_good`,  level === "good" || level === "advanced");
    });
  }

  // ── BEHAVIOUR ─────────────────────────────────────────────────────────────
  if (beh) {
    const b = beh as Record<string, unknown>;
    const beh1 = String(b.beh1 ?? "").toLowerCase();
    chk(form, "beh1_sell", beh1.includes("sell"));
    chk(form, "beh1_hold", beh1.includes("hold") || beh1.includes("wait"));
    chk(form, "beh1_buy",  beh1.includes("buy") || beh1.includes("more"));

    const beh2 = String(b.beh2 ?? "").toLowerCase();
    chk(form, "beh2_yes",   beh2 === "yes");
    chk(form, "beh2_no",    beh2 === "no");
    chk(form, "beh2_never", beh2 === "never" || beh2 === "");

    const beh3 = String(b.beh3 ?? "").toLowerCase();
    chk(form, "beh3_often",     beh3.includes("often") || beh3.includes("always"));
    chk(form, "beh3_sometimes", beh3.includes("sometimes") || beh3.includes("sometime"));
    chk(form, "beh3_rarely",    beh3.includes("rarely") || beh3.includes("never"));
  }

  // ── RETIREMENT DETAILS ────────────────────────────────────────────────────
  txt(form, "retage_self", cl.retirement_age ? String(cl.retirement_age) : (ff?.retirement_age ? String(ff.retirement_age) : ""));
  txt(form, "income_growth_pct", ff?.income_growth_pct ? String(ff.income_growth_pct) : "");

  // ── flatten so fields stay filled (no change needed after download) ────────
  // We intentionally keep fields editable for manual additions

  // ── serialize and return ──────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  const filename = `Questionnaire_${cl.client_code ?? cl.full_name?.replace(/\s+/g, "_") ?? "Client"}_${now.replace(/\s/g, "-")}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
