// app/api/clients/[id]/questionnaire-submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function normDob(s: string | null | undefined) {
  if (!s) return "";
  const v = s.trim();
  const monthMap: Record<string,string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };
  const mLong = v.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (mLong) return `${mLong[3]}-${monthMap[mLong[2].toLowerCase()]}-${mLong[1].padStart(2,"0")}`;
  const mSlash = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mSlash) return `${mSlash[3]}-${mSlash[2].padStart(2,"0")}-${mSlash[1].padStart(2,"0")}`;
  return v;
}
function normPhone(s: string | null | undefined) {
  return (s ?? "").replace(/[\s\-\+\(\)]/g, "").replace(/^91/, "").slice(-10);
}
function normPan(s: string | null | undefined) {
  return (s ?? "").trim().toUpperCase();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let pdfBuffer: ArrayBuffer;
  let notes = "";
  let fileName = "questionnaire.pdf";
  try {
    const form = await req.formData();
    const file = form.get("pdf") as File | null;
    if (!file) return NextResponse.json({ error: "No PDF file uploaded" }, { status: 400 });
    pdfBuffer = await file.arrayBuffer();
    notes = (form.get("notes") as string | null) ?? "";
    fileName = file.name;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch {
    return NextResponse.json({ error: "Could not parse PDF — ensure you upload the original Fiduciary Cloud questionnaire." }, { status: 422 });
  }

  const pdfForm = pdfDoc.getForm();
  const rawField = (name: string): string => {
    try { return pdfForm.getTextField(name).getText() ?? ""; } catch { return ""; }
  };
  // Try the original questionnaire field name first, then the review-PDF (rv_) variant
  const getField = (name: string): string => {
    const v = rawField(name);
    if (v) return v;
    return rawField(`rv_${name}`);
  };

  const pdf = {
    client_code: rawField("f_2")        || rawField("ucc"),
    full_name:   rawField("client_name") || rawField("rv_full_name"),
    pan:         rawField("pan")         || rawField("rv_pan"),
    dob:         rawField("dob")         || rawField("rv_dob"),
    phone:       rawField("phone")       || rawField("rv_phone"),
    email:       rawField("email")       || rawField("rv_email"),
  };

  const { data: cl } = await supabase
    .from("clients")
    .select("full_name, pan, dob, phone, email, client_code")
    .eq("client_id", id)
    .maybeSingle();

  if (!cl) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const errors: string[] = [];
  if (cl.client_code && norm(pdf.client_code) !== norm(cl.client_code))
    errors.push(`UCC mismatch — PDF: "${pdf.client_code}", profile: "${cl.client_code}"`);
  if (norm(pdf.full_name) !== norm(cl.full_name))
    errors.push(`Full name mismatch — PDF: "${pdf.full_name}", profile: "${cl.full_name}"`);
  if (normPan(pdf.pan) !== normPan(cl.pan))
    errors.push(`PAN mismatch — PDF: "${pdf.pan}", profile: "${cl.pan}"`);
  if (normDob(pdf.dob) !== normDob(cl.dob))
    errors.push(`Date of birth mismatch — PDF: "${pdf.dob}", profile: "${cl.dob}"`);
  if (normPhone(pdf.phone) !== normPhone(cl.phone as string | null))
    errors.push(`Contact number mismatch — PDF: "${pdf.phone}", profile: "${cl.phone}"`);
  if (norm(pdf.email) !== norm(cl.email as string | null))
    errors.push(`Email mismatch — PDF: "${pdf.email}", profile: "${cl.email}"`);

  if (errors.length > 0) {
    // Log failed attempt
    await supabase.from("client_activity_log").insert({
      client_id:    id,
      event_type:   "questionnaire_validation_failed",
      description:  `Questionnaire PDF upload rejected — ${errors.length} identity mismatch(es)`,
      performed_by: user.email,
      notes:        notes || null,
      metadata:     { file_name: fileName, pdf_values: pdf, errors },
    });
    return NextResponse.json({ error: "Identity validation failed", details: errors, pdf_values: pdf }, { status: 422 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXTRACT & LOAD all questionnaire answers from the PDF into the database
  // ══════════════════════════════════════════════════════════════════════════
  const rawChecked = (name: string): boolean => {
    try { return pdfForm.getCheckBox(name).isChecked(); } catch { return false; }
  };
  const isChecked = (name: string): boolean => rawChecked(name) || rawChecked(`rv_${name}`);
  const num = (s: string): number | null => {
    const v = parseFloat(s.replace(/[,₹\s]/g, ""));
    return isNaN(v) ? null : v;
  };
  const pickGroup = (opts: [string, string][]): string | null => {
    for (const [field, label] of opts) if (isChecked(field)) return label;
    return null;
  };
  const loaded: string[] = [];

  try {
    // ── 1. Risk answers Q1–19 ────────────────────────────────────────────────
    const riskRows: { client_id: string; question_num: number; answer: string }[] = [];
    for (let q = 1; q <= 19; q++) {
      for (const opt of ["a","b","c","d","e"]) {
        if (isChecked(`q${q}_${opt}`)) { riskRows.push({ client_id: id, question_num: q, answer: opt.toUpperCase() }); break; }
      }
    }
    if (riskRows.length > 0) {
      await supabase.from("risk_answers").delete().eq("client_id", id)
        .in("question_num", riskRows.map(r => r.question_num));
      await supabase.from("risk_answers").insert(riskRows);
      loaded.push(`${riskRows.length} risk answers`);
    }

    // ── 2. Client profile extras ─────────────────────────────────────────────
    const clientUpd: Record<string, unknown> = {};
    const ctext = (field: string, col: string) => { const v = getField(field).trim(); if (v) clientUpd[col] = v; };
    ctext("employer", "employer"); ctext("education", "education");
    ctext("dependants_detail", "dependants_detail"); ctext("nationality", "nationality");
    ctext("industry", "industry"); ctext("address", "address");
    ctext("occupation", "occupation"); ctext("gender", "gender"); ctext("marital_status", "marital_status");
    const ye = num(getField("years_exp")); if (ye != null) clientUpd.years_exp = Math.round(ye);
    const career = pickGroup([["career_early","Early career"],["career_growth","Growth phase"],["career_peak","Peak earnings"],["career_pre","Pre-retirement"],["career_retired","Retired"]]);
    if (career) clientUpd.career_stage = career;
    if (isChecked("own_business")) clientUpd.owns_business = true;
    if (isChecked("sole_earner")) clientUpd.sole_earner = true;
    if (isChecked("exp_inheritance")) clientUpd.expecting_inheritance = true;
    if (isChecked("plan_change")) clientUpd.plan_change = true;
    const ctype = pickGroup([["ctype_individual","Individual"],["ctype_huf","HUF"],["ctype_nri","NRI"],["ctype_corporate","Body Corporate"],["ctype_trust","Trust"],["ctype_other","Other"]]);
    if (ctype) clientUpd.client_type = ctype;
    const resi = pickGroup([["resi_indian","Resident Indian"],["resi_nri","NRI"],["resi_pio","Person of Indian Origin"],["resi_foreign","Foreign National"]]);
    if (resi) clientUpd.residential_status = resi;
    if (Object.keys(clientUpd).length > 0) {
      clientUpd.updated_at = new Date().toISOString();
      await supabase.from("clients").update(clientUpd).eq("client_id", id);
      loaded.push("client profile");
    }

    // ── 3. Financial facts ───────────────────────────────────────────────────
    const ff: Record<string, unknown> = { client_id: id };
    const fnum = (field: string, col: string) => { const v = num(getField(field)); if (v != null) ff[col] = v; };
    const ftext = (field: string, col: string) => { const v = getField(field).trim(); if (v) ff[col] = v; };
    fnum("inc_self","income_self"); fnum("inc_spouse","income_spouse"); fnum("inc_other","income_other");
    fnum("expenses_annual","expenses_annual"); fnum("life_cover","life_cover"); fnum("health_cover","health_cover");
    fnum("employer_cover","employer_cover");
    if (ff.employer_cover == null) { const ec = num(rawField("rv_emp_cover") || ""); if (ec != null) ff.employer_cover = ec; } fnum("rent_monthly","rent_monthly"); fnum("house_value","house_value");
    fnum("prop_value","prop_value"); fnum("rental_income","rental_income"); fnum("sec80c","sec80c"); fnum("sec80d","sec80d");
    fnum("epf_nps_corpus","epf_nps_corpus"); fnum("ret_exp","ret_expenses"); fnum("ret_pension","ret_pension");
    const ra = num(getField("retage_from_b6")) ?? num(getField("retage_self")); if (ra != null) ff.retirement_age = Math.round(ra);
    ftext("var_pay","var_pay"); ftext("prop_count","prop_count"); ftext("property_plan","property_plan");
    ftext("income_growth_pct","income_growth_pct"); ftext("large_inflows","large_inflows"); ftext("large_expenses","large_expenses");
    ftext("medical_commitments","medical_commitments"); ftext("adviser_notes_misc","adviser_notes_misc");
    ftext("source_wealth","source_wealth"); ftext("source_funds","source_funds");
    ftext("most_important_goal","most_important_goal"); ftext("restrictions","restrictions");
    ftext("withdrawal_detail","withdrawal_detail"); ftext("cur_adviser","current_adviser"); ftext("sector_pref","sector_pref");
    ftext("goal_rank1","goal_rank1"); ftext("goal_rank2","goal_rank2"); ftext("goal_rank3","goal_rank3");

    const groups: [string, [string, string][]][] = [
      ["household_income_type", [["inc_single","Single income"],["inc_dual","Dual income"],["inc_multiple","Multiple earners"]]],
      ["current_residence", [["res_ownpaid","Own — fully paid"],["res_ownloan","Own — with home loan"],["res_rented","Rented"],["res_family","Family-owned"],["res_employer","Employer-provided"]]],
      ["emi_default", [["emi_default_no","No"],["emi_default_yes","Yes"]]],
      ["invest_mode", [["mode_sip","SIP"],["mode_lumpsum","Lumpsum"],["mode_both","Both"],["mode_stp","STP"]]],
      ["surplus_arises", [["surplus_monthly","Steady monthly"],["surplus_quarterly","Quarterly / half-yearly"],["surplus_irregular","Irregular / lumpy"],["surplus_windfall","Windfalls only"]]],
      ["decision_maker", [["decide_self","Entirely myself"],["decide_joint","Jointly with family"],["decide_adviser","Rely on adviser"],["decide_adviser_research","Adviser + own research"]]],
      ["monitor_frequency", [["monitor_daily","Daily"],["monitor_weekly","Weekly"],["monitor_monthly","Monthly"],["monitor_quarterly","Quarterly"],["monitor_rarely","Rarely / annually"]]],
      ["past_experience", [["exp_profitable","Mostly profitable"],["exp_mixed","Mixed"],["exp_lossmaking","Mostly loss-making"],["exp_none","No prior experience"]]],
      ["will_status", [["will_yes","Yes"],["will_no","No"],["will_progress","In progress"]]],
      ["trust_status", [["trust_yes","Yes"],["trust_no","No"],["trust_na","NA"]]],
      ["poa_status", [["poa_yes","Yes"],["poa_no","No"]]],
      ["guardian_status", [["guardian_yes","Yes"],["guardian_no","No"],["guardian_na","NA"]]],
      ["fatca", [["fatca_yes","Yes"],["fatca_no","No"]]],
      ["pep", [["pep_yes","Yes"],["pep_no","No"]]],
      ["nominees_updated", [["nominees_yes","Yes"],["nominees_no","No"],["nominees_notsure","Not sure"]]],
      ["capital_gains", [["cg_no","No"],["cg_st","Short-term"],["cg_lt","Long-term"],["cg_both","Both"]]],
      ["foreign_assets", [["fa_no","No"],["fa_assets","Assets"],["fa_income","Income"],["fa_both","Both"]]],
      ["style_pref", [["pref_growth","Growth"],["pref_income","Income"],["pref_preservation","Preservation"],["pref_balanced","Balanced"]]],
      ["esg_pref", [["esg_yes","Yes"],["esg_no","No"],["esg_noprf","No preference"]]],
      ["intl_pref", [["intl_yes","Yes"],["intl_no","No"],["intl_notsure","Not sure"]]],
      ["investment_horizon", [["horizon_u3","Under 3 years"],["horizon_3to5","3–5 years"],["horizon_5to10","5–10 years"],["horizon_o10","Over 10 years"]]],
      ["income_need", [["incneed_none","None"],["incneed_partial","Partial"],["incneed_primary","Primary"]]],
      ["goalwise_bucketing", [["bucket_yes","Yes"],["bucket_no","No"],["bucket_discretion","Adviser discretion"]]],
      ["surplus_shortfall_pref", [["short_postpone","Postpone goal"],["short_scale","Scale down goal"],["short_savemore","Save more"],["short_risk","Take more risk"],["short_loans","Use loans"]]],
      ["education_funding", [["edufund_self","Fully self-funded"],["edufund_part","Partly funded"],["edufund_mostly","Mostly loans/scholarship"],["edufund_scholarship","Scholarship expected"]]],
      ["retirement_house_status", [["rethouse_owned","Owned"],["rethouse_loan","Owned with loan"],["rethouse_planbuy","Plan to buy"],["rethouse_rent","Will rent"]]],
      ["retirement_dependants", [["retdep_none","None"],["retdep_spouse","Spouse"],["retdep_spouseparents","Spouse + parents"],["retdep_spousechildren","Spouse + children"],["retdep_extended","Extended family"]]],
      ["reason_for_investing", [["reason_tax","Tax saving"],["reason_reco","Recommendation"],["reason_research","Own research"],["reason_employer","Employer scheme"],["reason_notsure","Not sure"]]],
      ["review_freq", [["review_never","Never"],["review_occ","Occasionally"],["review_annual","Annually"],["review_quarterly","Quarterly"]]],
    ];
    groups.forEach(([col, opts]) => { const v = pickGroup(opts); if (v) ff[col] = v; });
    const covers = [["cov_accident","Accident"],["cov_ci","Critical illness"],["cov_disability","Disability"],["cov_none","None"]]
      .filter(([f]) => isChecked(f)).map(([,l]) => l);
    if (covers.length) ff.covers_held = covers.join(", ");
    if (Object.keys(ff).length > 1) {
      await supabase.from("financial_facts").upsert(ff, { onConflict: "client_id" });
      loaded.push("financial facts");
    }

    // ── 4. Goals ─────────────────────────────────────────────────────────────
    const goalRows: Record<string, unknown>[] = [];
    for (let g = 1; g <= 6; g++) {
      const name = getField(`goal${g}_name`).trim();
      if (!name) continue;
      goalRows.push({
        client_id: id, goal_name: name,
        target_year: num(getField(`goal${g}_year`)) != null ? Math.round(num(getField(`goal${g}_year`))!) : null,
        cost_today: num(getField(`goal${g}_cost`)),
        saved: num(getField(`goal${g}_saved`)),
        monthly_sip: num(getField(`goal${g}_sip`)),
      });
    }
    if (goalRows.length > 0) {
      await supabase.from("goals").delete().eq("client_id", id);
      await supabase.from("goals").insert(goalRows);
      loaded.push(`${goalRows.length} goals`);
    }

    // ── 5. Loans ─────────────────────────────────────────────────────────────
    const LOAN_TYPES = ["Home Loan","Vehicle Loan","Personal Loan","Education Loan","Gold Loan","Credit Card","Loan Against Property/Securities","Business Loan","Other"];
    const loanRows: Record<string, unknown>[] = [];
    for (let l = 1; l <= 9; l++) {
      const out = num(getField(`loan${l}_out`)); const lender = getField(`loan${l}_lender`).trim();
      if (out == null && !lender) continue;
      loanRows.push({
        client_id: id, loan_type: LOAN_TYPES[l-1], lender: lender || null,
        outstanding: out, emi: num(getField(`loan${l}_emi`)),
        rate: num(getField(`loan${l}_rate`)),
        tenure_months: num(getField(`loan${l}_tenure`)) != null ? Math.round(num(getField(`loan${l}_tenure`))!) : null,
      });
    }
    if (loanRows.length > 0) {
      await supabase.from("loans").delete().eq("client_id", id);
      await supabase.from("loans").insert(loanRows);
      loaded.push(`${loanRows.length} loans`);
    }

    // ── 6. Family members ────────────────────────────────────────────────────
    const famRows: Record<string, unknown>[] = [];
    for (let f = 1; f <= 4; f++) {
      const name = getField(`fam${f}_name`).trim();
      if (!name) continue;
      famRows.push({
        client_id: id, name, relationship: getField(`fam${f}_rel`).trim() || null,
        age: num(getField(`fam${f}_age`)) != null ? Math.round(num(getField(`fam${f}_age`))!) : null,
        occupation: getField(`fam${f}_occ`).trim() || null,
        annual_income: num(getField(`fam${f}_income`)),
        health_status: getField(`fam${f}_health`).trim() || null,
      });
    }
    if (famRows.length > 0) {
      await supabase.from("family_members").delete().eq("client_id", id);
      await supabase.from("family_members").insert(famRows);
      loaded.push(`${famRows.length} family members`);
    }

    // ── 7. Existing investments ──────────────────────────────────────────────
    const INV_CLASSES = ["Bank FD / RD / Small Savings","Debt MF / Bonds","Equity MF / Index / ETF","Direct Equity","EPF / PPF / NPS","Gold","Real Estate (investment)","Traditional Insurance / ULIP","Others"];
    const invRows: Record<string, unknown>[] = [];
    for (let v = 1; v <= 9; v++) {
      const val = num(getField(`inv${v}_val`)); const sip = num(getField(`inv${v}_sip`));
      if (val == null && sip == null) continue;
      invRows.push({ client_id: id, asset_class: INV_CLASSES[v-1], value: val ?? 0, monthly_sip: sip ?? 0 });
    }
    if (invRows.length > 0) {
      await supabase.from("investments").delete().eq("client_id", id);
      await supabase.from("investments").insert(invRows);
      loaded.push(`${invRows.length} investment rows`);
    }

    // ── 8. Knowledge grid ────────────────────────────────────────────────────
    const KN = [["stocks","Stocks"],["mf","Mutual Funds"],["etf","ETFs"],["debt","Debt"],["gold","Gold"],["intl","International"],["derivatives","Derivatives"],["alt","Alternatives"]];
    const knRows: Record<string, unknown>[] = [];
    KN.forEach(([key, label]) => {
      const lvl = isChecked(`kn_${key}_good`) ? "Good" : isChecked(`kn_${key}_basic`) ? "Basic" : isChecked(`kn_${key}_none`) ? "None" : null;
      if (lvl) knRows.push({ client_id: id, asset_class: label, level: lvl });
    });
    if (knRows.length > 0) {
      await supabase.from("knowledge_grid").delete().eq("client_id", id);
      await supabase.from("knowledge_grid").insert(knRows);
      loaded.push("knowledge grid");
    }

    // ── 9. Behaviour ─────────────────────────────────────────────────────────
    const beh1 = pickGroup([["beh1_sell","Sell investments"],["beh1_hold","Hold and wait"],["beh1_buy","Buy more"]]);
    const beh2 = pickGroup([["beh2_yes","Yes"],["beh2_no","No"],["beh2_never","Never tested"]]);
    const beh3 = pickGroup([["beh3_often","Often"],["beh3_sometimes","Sometimes"],["beh3_rarely","Rarely"]]);
    if (beh1 || beh2 || beh3) {
      await supabase.from("behaviour").upsert({ client_id: id, beh1, beh2, beh3 }, { onConflict: "client_id" });
      loaded.push("behaviour");
    }
  } catch (e) {
    // Extraction failure should not lose the submission — log and continue
    await supabase.from("client_activity_log").insert({
      client_id: id, event_type: "questionnaire_extraction_error",
      description: `Data extraction partially failed: ${e instanceof Error ? e.message : "unknown"}`,
      performed_by: user.email, metadata: { file_name: fileName, loaded },
    });
  }

  // Mark link submitted
  await supabase
    .from("questionnaire_links")
    .update({ submitted_at: new Date().toISOString() })
    .eq("client_id", id)
    .is("submitted_at", null);

  // ── Insert activity log entry ──────────────────────────────────────────────
  await supabase.from("client_activity_log").insert({
    client_id:    id,
    event_type:   "questionnaire_submitted",
    description:  `Questionnaire PDF validated — loaded: ${loaded.length > 0 ? loaded.join(", ") : "no new data fields"}`,
    performed_by: user.email,
    notes:        notes || null,
    metadata:     { file_name: fileName, pdf_values: pdf, loaded },
  });

  return NextResponse.json({ ok: true, message: `Questionnaire validated and data loaded: ${loaded.length > 0 ? loaded.join(", ") : "no filled fields detected"}.`, loaded });
}
