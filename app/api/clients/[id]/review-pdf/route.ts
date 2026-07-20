// app/api/clients/[id]/review-pdf/route.ts
// Generates a periodic review questionnaire PDF prefilled from DB data.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFForm } from "pdf-lib";

export const runtime = "nodejs";

// ── colour palette ────────────────────────────────────────────────────────────
const DARK  = rgb(0.059, 0.227, 0.275);  // #0F3A46
const MID   = rgb(0.09,  0.353, 0.412);  // #175A69
const GOLD  = rgb(0.765, 0.604, 0.22);   // #C39A38
const LGREY = rgb(0.94,  0.96,  0.96);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const RED   = rgb(0.706, 0.275, 0.235);

const W = 595.28; const H = 841.89; // A4
const ML = 45; const MR = 45; const TW = W - ML - MR;

// ── drawing helpers ───────────────────────────────────────────────────────────
function rect(page: PDFPage, x: number, y: number, w: number, h: number, fill: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: w, height: h, color: fill });
}
function line(page: PDFPage, x1: number, y1: number, x2: number, y2: number) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: rgb(0.78, 0.85, 0.86) });
}
function txt(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = BLACK) {
  if (!text) return;
  page.drawText(text, { x, y, font, size, color });
}

// Add a labelled text field
function addField(
  form: PDFForm, page: PDFPage,
  name: string, x: number, y: number, w: number, h: number,
  value: string, readOnly: boolean,
  font: PDFFont
) {
  const field = form.createTextField(name);
  field.addToPage(page, { x, y, width: w, height: h,
    borderColor: readOnly ? rgb(0.78,0.85,0.86) : rgb(0.44,0.52,0.55),
    backgroundColor: readOnly ? LGREY : WHITE,
    borderWidth: 0.5, font });
  if (value) field.setText(value);
  if (readOnly) field.enableReadOnly();
}

// Add a checkbox with label
function addCheck(
  form: PDFForm, page: PDFPage,
  name: string, x: number, y: number, label: string,
  checked: boolean, font: PDFFont, sz = 8
) {
  try {
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x, y, width: 9, height: 9, borderColor: rgb(0.44,0.52,0.55), borderWidth: 0.5 });
    if (checked) cb.check();
  } catch { /* duplicate name — skip */ }
  txt(page, label, x + 13, y + 1, font, sz);
}

// Section heading bar
function sectionBar(page: PDFPage, y: number, title: string, bold: PDFFont) {
  rect(page, ML, y, TW, 16, DARK);
  txt(page, title, ML + 6, y + 4, bold, 8, WHITE);
  return y - 22;
}

// Footer on every page
function footer(page: PDFPage, reg: PDFFont, pageNum: number, total: number, docId: string) {
  const y = 22;
  rect(page, 0, 0, W, y + 6, DARK);
  txt(page, "PERIODIC REVIEW QUESTIONNAIRE  |  CONFIDENTIAL  |  FIDUCIARY CLOUD", ML, y - 1, reg, 6.5, WHITE);
  txt(page, `${docId}`, ML, y - 9, reg, 6, rgb(0.6,0.75,0.8));
  txt(page, `Page ${pageNum} of ${total}`, W - MR - 40, y - 1, reg, 6.5, WHITE);
}

// Row with label and field
// Embed a near-invisible field carrying row IDs for each pre-filled slot, so
// a later upload can reconcile precisely instead of blindly wiping the section.
function embedSyncIds(
  pdfDoc: PDFDocument, form: PDFForm, page: PDFPage,
  ids: { goals: (string | null)[]; loans: (string | null)[]; fam: (string | null)[] }
) {
  try {
    const field = form.createTextField("_sync_ids");
    field.addToPage(page, { x: 2, y: 2, width: 0.5, height: 0.5, borderWidth: 0 });
    field.setText(JSON.stringify(ids));
  } catch { /* non-fatal — extraction falls back to legacy behaviour */ }
}

function labelField(
  form: PDFForm, page: PDFPage,
  label: string, fieldName: string,
  lx: number, ly: number, lw: number, fw: number,
  value: string, readOnly: boolean,
  reg: PDFFont, bold: PDFFont
) {
  txt(page, label, lx, ly + 2, reg, 8);
  addField(form, page, fieldName, lx + lw, ly - 1, fw, 13, value, readOnly, reg);
}

// ── main handler ──────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: cl }, { data: ff }, { data: goals }, { data: loans }, { data: risk }] = await Promise.all([
    supabase.from("clients").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("goals").select("*").eq("client_id", id).order("priority"),
    supabase.from("loans").select("*").eq("client_id", id),
    supabase.from("risk_answers").select("*").eq("client_id", id),
  ]);
  if (!cl) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const riskMap: Record<number, string> = {};
  (risk ?? []).forEach((r: Record<string, unknown>) => { riskMap[r.question_num as number] = String(r.answer ?? "").toUpperCase(); });

  const now    = new Date();
  const today  = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const docId  = `PRQ-${cl.client_code ?? id.slice(0,8).toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}`;
  const fmt    = (n: number | null | undefined) => n ? Number(n).toLocaleString("en-IN") : "";

  // ── build PDF ──────────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const reg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDoc.getForm();

  pdfDoc.setTitle(`Periodic Review Questionnaire – ${cl.full_name}`);
  pdfDoc.setAuthor("Fiduciary Cloud");
  pdfDoc.setSubject("SEBI IA Regulation 16 – Periodic Review");
  pdfDoc.setKeywords(["review", "risk profile", "SEBI", cl.client_code ?? ""]);
  pdfDoc.setCreationDate(now);

  const PAGES = 6;

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 1 — Cover + Identity
  // ─────────────────────────────────────────────────────────────────────────
  const p1 = pdfDoc.addPage([W, H]);

  // Header bar
  rect(p1, 0, H - 60, W, 60, DARK);
  txt(p1, "Fiduciary Cloud", ML, H - 22, bold, 16, WHITE);
  txt(p1, "SEBI Registered Investment Adviser", ML, H - 36, reg, 8, rgb(0.63,0.79,0.84));
  txt(p1, "PERIODIC CLIENT REVIEW QUESTIONNAIRE", W/2 - 110, H - 22, bold, 13, GOLD);
  txt(p1, "Pursuant to Regulation 16 of the SEBI (Investment Advisers) Regulations, 2013", W/2 - 120, H - 35, reg, 7.5, rgb(0.63,0.79,0.84));

  let y = H - 80;

  // Purpose box
  rect(p1, ML, y - 52, TW, 52, LGREY);
  txt(p1, "Purpose of this Review Questionnaire", ML + 8, y - 14, bold, 9, DARK);
  txt(p1, "SEBI IA Regulations require investment advisers to conduct a periodic review of each client's risk profile, financial", ML + 8, y - 27, reg, 7.5, BLACK);
  txt(p1, "situation, goals and investment behaviour — at least once every 12 months or upon a material change in circumstances.", ML + 8, y - 38, reg, 7.5, BLACK);
  txt(p1, "Please review and update every section. Fields pre-filled from your existing profile are shown in grey and may be amended.", ML + 8, y - 49, reg, 7.5, BLACK);
  y -= 66;

  // Review metadata row
  y = sectionBar(p1, y, "REVIEW DETAILS", bold) + 6;
  txt(p1, "Date of Review:", ML, y, reg, 8);
  addField(form, p1, "review_date", ML + 80, y - 2, 120, 13, today, true, reg);
  txt(p1, "Review Period:", ML + 215, y, reg, 8);
  addField(form, p1, "review_period", ML + 290, y - 2, 100, 13, `Annual Review ${now.getFullYear()}`, false, reg);
  txt(p1, "Previous Review:", ML + 405, y, reg, 8);
  addField(form, p1, "prev_review_date", ML + 480, y - 2, 70, 13, "", false, reg);
  y -= 24;

  // Identity section
  y = sectionBar(p1, y, "SECTION A — CLIENT IDENTITY (pre-filled, non-editable)", bold) + 6;

  labelField(form, p1, "Client Code (UCC):", "ucc", ML, y, 110, 120, cl.client_code ?? "", true, reg, bold);
  labelField(form, p1, "Full Name (as per PAN):", "rv_full_name", ML + 248, y, 130, 150, cl.full_name ?? "", true, reg, bold);
  y -= 22;

  labelField(form, p1, "PAN:", "rv_pan", ML, y, 35, 100, cl.pan ?? "", true, reg, bold);
  labelField(form, p1, "Date of Birth:", "rv_dob", ML + 150, y, 80, 100, cl.dob ? new Date(cl.dob).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "", true, reg, bold);
  labelField(form, p1, "Contact No.:", "rv_phone", ML + 270, y, 70, 100, (cl.phone as string|null) ?? "", true, reg, bold);
  labelField(form, p1, "Email:", "rv_email", ML + 385, y, 38, 120, (cl.email as string|null) ?? "", true, reg, bold);
  y -= 30;

  // Life events since last review
  y = sectionBar(p1, y, "SECTION B — MATERIAL CHANGES SINCE LAST REVIEW (tick all that apply)", bold) + 6;

  const events = [
    "Change in income (increase / decrease)","New financial dependant (child / parent)",
    "Marriage or divorce","Change of employment or business",
    "Major health event (self or family)","Inheritance or windfall received",
    "Property purchase or sale","Business started or closed",
    "Significant debt taken or repaid","Major change in investment goals",
  ];
  let col = 0;
  events.forEach((ev, i) => {
    const ex = col === 0 ? ML : ML + TW/2 + 10;
    addCheck(form, p1, `life_event_${i}`, ex, y, ev, false, reg);
    col++;
    if (col === 2) { col = 0; y -= 16; }
  });
  if (col !== 0) y -= 16;
  y -= 6;

  txt(p1, "Details / explanation of changes:", ML, y, reg, 8);
  y -= 4;
  addField(form, p1, "life_event_detail", ML, y - 36, TW, 40, "", false, reg);
  y -= 50;

  footer(p1, reg, 1, PAGES, docId);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 2 — Financial Situation Update
  // ─────────────────────────────────────────────────────────────────────────
  const p2 = pdfDoc.addPage([W, H]);
  rect(p2, 0, H - 28, W, 28, DARK);
  txt(p2, "SECTION C — FINANCIAL SITUATION UPDATE", ML, H - 18, bold, 10, WHITE);
  txt(p2, "Update any figures that have changed. Pre-filled from last profile — all fields editable.", W - MR - 230, H - 18, reg, 7.5, rgb(0.63,0.79,0.84));
  y = H - 46;

  y = sectionBar(p2, y, "C1.  Income & Savings", bold) + 6;

  const finRows: [string, string, number|null|undefined][] = [
    ["Gross Annual Income — Self (Rs.)",        "rv_inc_self",    ff?.income_self],
    ["Gross Annual Income — Spouse / others (Rs.)", "rv_inc_spouse", ff?.income_spouse],
    ["Other Annual Income (Rs.)",               "rv_inc_other",   ff?.income_other],
    ["Annual Household Expenses (Rs.)",         "rv_expenses",    null],
    ["Annual Savings / Investible Surplus (Rs.)","rv_savings",    null],
    ["Emergency Fund (months of expenses)",     "rv_emergency",   null],
  ];
  finRows.forEach(([label, fname, val]) => {
    txt(p2, label, ML, y, reg, 8);
    addField(form, p2, fname, ML + 260, y - 2, 120, 13, fmt(val as number), false, reg);
    y -= 18;
  });
  y -= 6;

  y = sectionBar(p2, y, "C2.  Protection & Cover", bold) + 6;
  const coverRows: [string, string, number|null|undefined][] = [
    ["Life Insurance Cover (Rs.)",        "rv_life_cover",   ff?.life_cover],
    ["Health Insurance Cover (Rs.)",      "rv_health_cover", ff?.health_cover],
    ["Employer Group Cover (Rs.)",        "rv_emp_cover",    ff?.employer_cover],
    ["Critical Illness / Accident Cover", "rv_ci_cover",     null],
  ];
  coverRows.forEach(([label, fname, val]) => {
    txt(p2, label, ML, y, reg, 8);
    addField(form, p2, fname, ML + 260, y - 2, 120, 13, fmt(val as number), false, reg);
    y -= 18;
  });
  y -= 6;

  y = sectionBar(p2, y, "C3.  Outstanding Loans", bold) + 6;

  // Table header
  const lCols = [ML, ML+70, ML+175, ML+235, ML+290, ML+345];
  ["Loan type","Lender","Outstanding (Rs.)","EMI (Rs.)","Rate %","Tenure (m)"].forEach((h, i) => txt(p2, h, lCols[i], y, bold, 7.5));
  y -= 16;

  const loanRows = loans && loans.length > 0 ? (loans as Record<string,unknown>[]).slice(0,6) : [{},{},{},{}];
  loanRows.forEach((l, i) => {
    addField(form, p2, `rv_loan${i+1}_type`,   lCols[0], y - 2, 65,  13, (l.loan_type as string|undefined) ?? "", false, reg);
    addField(form, p2, `rv_loan${i+1}_lender`, lCols[1], y - 2, 100, 13, (l.lender as string|undefined) ?? "", false, reg);
    addField(form, p2, `rv_loan${i+1}_out`,    lCols[2], y - 2, 55,  13, fmt(l.outstanding as number|undefined), false, reg);
    addField(form, p2, `rv_loan${i+1}_emi`,    lCols[3], y - 2, 50,  13, fmt(l.emi as number|undefined), false, reg);
    addField(form, p2, `rv_loan${i+1}_rate`,   lCols[4], y - 2, 50,  13, l.interest_rate ? String(l.interest_rate) : "", false, reg);
    addField(form, p2, `rv_loan${i+1}_tenure`, lCols[5], y - 2, 50,  13, l.tenure_months ? String(l.tenure_months) : "", false, reg);
    y -= 18;
  });
  y -= 6;

  y = sectionBar(p2, y, "C4.  Goals Review", bold) + 6;
  const gCols = [ML, ML+95, ML+175, ML+255, ML+320, ML+385];
  ["Goal","Target year","Target (Rs.)","Saved (Rs.)","Monthly SIP","On track?"].forEach((h,i) => txt(p2, h, gCols[i], y, bold, 7.5));
  y -= 16;

  const goalRows = goals && goals.length > 0 ? (goals as Record<string,unknown>[]).slice(0,5) : [{},{},{}];
  goalRows.forEach((g, i) => {
    addField(form, p2, `rv_goal${i+1}_name`,  gCols[0], y-2, 90, 13, (g.goal_name as string|undefined) ?? "", false, reg);
    addField(form, p2, `rv_goal${i+1}_year`,  gCols[1], y-2, 75, 13, g.target_year ? String(g.target_year) : "", false, reg);
    addField(form, p2, `rv_goal${i+1}_cost`,  gCols[2], y-2, 75, 13, fmt(g.cost_today as number|undefined), false, reg);
    addField(form, p2, `rv_goal${i+1}_saved`, gCols[3], y-2, 60, 13, fmt(g.saved as number|undefined), false, reg);
    addField(form, p2, `rv_goal${i+1}_sip`,   gCols[4], y-2, 60, 13, fmt(g.monthly_sip as number|undefined), false, reg);
    addField(form, p2, `rv_goal${i+1}_track`, gCols[5], y-2, 60, 13, "", false, reg);
    y -= 18;
  });

  embedSyncIds(pdfDoc, form, p2, {
    goals: goalRows.map((g: Record<string, unknown>) => (g.goal_id as string) ?? null),
    loans: loanRows.map((l: Record<string, unknown>) => (l.loan_id as string) ?? null),
    fam: [],
  });

  footer(p2, reg, 2, PAGES, docId);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 3 — Risk Q1–8 (Capacity)
  // ─────────────────────────────────────────────────────────────────────────
  const CAPACITY_QUESTIONS = [
    {num:1,text:"What is your primary source of income?",opts:["A – No stable income / dependent","B – Irregular / freelance / business income","C – Salaried — private sector","D – Salaried — government / PSU","E – Multiple stable income sources"]},
    {num:2,text:"What is your approximate annual household income (all sources)?",opts:["A – Below Rs. 3 lakh","B – Rs. 3–10 lakh","C – Rs. 10–25 lakh","D – Rs. 25–75 lakh","E – Above Rs. 75 lakh"]},
    {num:3,text:"What percentage of monthly income do you currently save / invest?",opts:["A – Less than 5%","B – 5–15%","C – 15–25%","D – 25–40%","E – More than 40%"]},
    {num:4,text:"How stable is your primary income over the next 5 years?",opts:["A – Very uncertain","B – Somewhat uncertain","C – Moderately stable","D – Stable","E – Very stable / guaranteed"]},
    {num:5,text:"How many financial dependants do you currently have?",opts:["A – 5 or more","B – 3–4","C – 2","D – 1","E – None"]},
    {num:6,text:"What is your primary investment horizon?",opts:["A – Within 1 year","B – 1–3 years","C – 3–5 years","D – 5–10 years","E – More than 10 years"]},
    {num:7,text:"Do you have a liquid emergency fund covering at least 6 months of expenses?",opts:["A – No, and significant debt","B – No emergency fund","C – Partial (1–3 months)","D – Yes (3–6 months)","E – Yes (more than 6 months)"]},
    {num:8,text:"Current net worth relative to annual income?",opts:["A – Negative net worth","B – Less than 1×","C – 1×–3×","D – 3×–7×","E – More than 7×"]},
  ];

  const p3 = pdfDoc.addPage([W, H]);
  rect(p3, 0, H - 28, W, 28, DARK);
  txt(p3, "SECTION D — RISK PROFILE RE-ASSESSMENT", ML, H - 18, bold, 10, WHITE);
  txt(p3, "D1 — Risk Capacity (Q1–8)  |  Previous answers shown pre-ticked — amend if changed.", W - MR - 290, H - 18, reg, 7.5, rgb(0.63,0.79,0.84));
  y = H - 46;

  CAPACITY_QUESTIONS.forEach(q => {
    const prev = riskMap[q.num] ?? "";
    txt(p3, `Q${q.num}.  ${q.text}`, ML, y, bold, 8, DARK);
    y -= 13;
    const opts = q.opts;
    const col2 = opts.length > 3;
    opts.forEach((opt, oi) => {
      const letter = opt[0];
      const ex = col2 && oi >= 3 ? ML + TW / 2 : ML + 8;
      if (col2 && oi === 3) y += 13 * Math.min(3, opts.length - 3); // reset y for col2
      addCheck(form, p3, `q${q.num}_${letter.toLowerCase()}`, ex, y, opt, prev === letter, reg);
      if (!col2 || oi < 3) y -= 12;
      else y -= 12;
    });
    y -= 8;
    line(p3, ML, y + 4, ML + TW, y + 4);
    y -= 4;
    if (y < 60) { y = H - 46; } // guard (shouldn't happen with 8 qs on page)
  });

  footer(p3, reg, 3, PAGES, docId);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 4 — Risk Q9–15 (Tolerance)
  // ─────────────────────────────────────────────────────────────────────────
  const TOLERANCE_QUESTIONS = [
    {num:9, text:"If your portfolio dropped 20% in one month, what would you most likely do?",opts:["A – Sell everything immediately","B – Sell some to reduce exposure","C – Hold and wait for recovery","D – Review and consider buying more","E – Invest more — opportunity"]},
    {num:10,text:"What is your primary investment objective?",opts:["A – Capital preservation","B – Regular income, minimal risk","C – Balanced — moderate growth","D – Long-term capital growth","E – Maximum growth, accept losses"]},
    {num:11,text:"What annual return do you realistically expect?",opts:["A – 4–6% (FD rate)","B – 6–9% (debt / hybrid)","C – 9–12% (balanced)","D – 12–18% (equity)","E – 18%+ (aggressive)"]},
    {num:12,text:"How comfortable are you with short-term portfolio losses for higher long-term gains?",opts:["A – Not at all — any loss unacceptable","B – Small temporary loss (up to 5%)","C – Moderate temporary loss (up to 15%)","D – Significant temporary loss (up to 30%)","E – Large temporary loss (30%+) for superior returns"]},
    {num:13,text:"What proportion of investable assets could you genuinely afford to lose?",opts:["A – None","B – Up to 5%","C – 5–20%","D – 20–40%","E – More than 40%"]},
    {num:14,text:"When markets are volatile and news is negative, how do you react?",opts:["A – Extreme anxiety, act impulsively","B – Considerable worry, monitor daily","C – Mild concern, stay calm","D – Comfortable, trust the plan","E – Excited — look for opportunities"]},
    {num:15,text:"Have you previously experienced a significant investment loss (>20% of portfolio)?",opts:["A – Yes, and I exited immediately","B – Yes, reduced exposure considerably","C – Yes, held on and recovered","D – Yes, increased investment during downturn","E – No prior major loss experience"]},
  ];

  const p4 = pdfDoc.addPage([W, H]);
  rect(p4, 0, H - 28, W, 28, DARK);
  txt(p4, "SECTION D — RISK PROFILE RE-ASSESSMENT (continued)", ML, H - 18, bold, 10, WHITE);
  txt(p4, "D2 — Risk Tolerance (Q9–15)", W - MR - 130, H - 18, reg, 7.5, rgb(0.63,0.79,0.84));
  y = H - 46;

  TOLERANCE_QUESTIONS.forEach(q => {
    const prev = riskMap[q.num] ?? "";
    txt(p4, `Q${q.num}.  ${q.text}`, ML, y, bold, 8, DARK);
    y -= 13;
    q.opts.forEach((opt) => {
      const letter = opt[0];
      addCheck(form, p4, `q${q.num}_${letter.toLowerCase()}`, ML + 8, y, opt, prev === letter, reg);
      y -= 12;
    });
    y -= 8;
    line(p4, ML, y + 4, ML + TW, y + 4);
    y -= 4;
  });

  footer(p4, reg, 4, PAGES, docId);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 5 — Q16–19 (Knowledge) + Behaviour + Investment
  // ─────────────────────────────────────────────────────────────────────────
  const KNOWLEDGE_QUESTIONS = [
    {num:16,text:"How would you rate your understanding of equity / stock market investing?",opts:["A – No understanding","B – Basic — know what stocks are","C – Moderate — invest in MFs/blue-chips","D – Good — manage diversified equity portfolio","E – Expert — analyse fundamentals"]},
    {num:17,text:"How familiar are you with debt instruments (bonds, debentures, FDs, debt MFs)?",opts:["A – No familiarity","B – Basic — know FDs and PPF","C – Moderate — invest in debt MFs or bonds","D – Good — understand yield, duration, credit risk","E – Expert — actively manage debt portfolio"]},
    {num:18,text:"How familiar are you with alternative investments (PMS, AIF, REITs, derivatives)?",opts:["A – No familiarity","B – Basic — heard of them","C – Moderate — some exposure","D – Good — actively invested in 2–3","E – Expert — invest across multiple alternatives"]},
    {num:19,text:"How many years of active investment experience do you have (beyond savings/FDs)?",opts:["A – None","B – Less than 1 year","C – 1–3 years","D – 3–7 years","E – More than 7 years"]},
  ];

  const p5 = pdfDoc.addPage([W, H]);
  rect(p5, 0, H - 28, W, 28, DARK);
  txt(p5, "SECTION D (continued) + SECTION E — BEHAVIOUR & PREFERENCES", ML, H - 18, bold, 10, WHITE);
  txt(p5, "D3 — Investment Knowledge (Q16–19)  |  Section E — Behaviour", W - MR - 255, H - 18, reg, 7.5, rgb(0.63,0.79,0.84));
  y = H - 46;

  KNOWLEDGE_QUESTIONS.forEach(q => {
    const prev = riskMap[q.num] ?? "";
    txt(p5, `Q${q.num}.  ${q.text}`, ML, y, bold, 8, DARK);
    y -= 13;
    q.opts.forEach((opt) => {
      const letter = opt[0];
      addCheck(form, p5, `q${q.num}_${letter.toLowerCase()}`, ML + 8, y, opt, prev === letter, reg);
      y -= 12;
    });
    y -= 8;
    line(p5, ML, y + 4, ML + TW, y + 4);
    y -= 4;
  });

  y = sectionBar(p5, y, "SECTION E — INVESTMENT BEHAVIOUR UPDATE", bold) + 6;

  txt(p5, "E1. If markets fell 20%, I would:", ML, y, bold, 8);
  y -= 13;
  [["sell", "Sell investments"], ["hold","Hold and wait"],["buy","Buy more — see as opportunity"]].forEach(([v,l]) => {
    addCheck(form, p5, `rv_beh1_${v}`, ML + 8, y, l, false, reg);
    y -= 12;
  });
  y -= 6;

  txt(p5, "E2. Have you ever exited an investment due to panic / emotion?", ML, y, bold, 8);
  y -= 13;
  [["yes","Yes"],["no","No"],["never","Never invested long enough to be tested"]].forEach(([v,l]) => {
    addCheck(form, p5, `rv_beh2_${v}`, ML + 8, y, l, false, reg);
    y -= 12;
  });
  y -= 6;

  txt(p5, "E3. Preferred mode of investing:", ML, y, bold, 8);
  y -= 13;
  [["sip","SIP (monthly)"],["lump","Lumpsum"],["both","Both"],["stp","STP (staggered)"]].forEach(([v,l],i) => {
    const ex = i < 2 ? ML + 8 : ML + TW/2;
    if (i === 2) y += 12;
    addCheck(form, p5, `rv_mode_${v}`, ex, y, l, false, reg);
    if (i < 2 || i === 3) y -= 12;
  });
  y -= 14;

  txt(p5, "E4. Additional notes / adviser observations:", ML, y, reg, 8);
  y -= 4;
  addField(form, p5, "rv_adviser_notes", ML, y - 40, TW, 44, "", false, reg);

  footer(p5, reg, 5, PAGES, docId);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 6 — Declaration & Signatures
  // ─────────────────────────────────────────────────────────────────────────
  const p6 = pdfDoc.addPage([W, H]);
  rect(p6, 0, H - 28, W, 28, DARK);
  txt(p6, "SECTION F — DECLARATION & SIGNATURES", ML, H - 18, bold, 10, WHITE);
  y = H - 50;

  // Client declaration
  rect(p6, ML, y - 70, TW, 70, LGREY);
  txt(p6, "CLIENT DECLARATION", ML + 8, y - 14, bold, 9, DARK);
  const decl = [
    "I / We confirm that the information provided in this Periodic Review Questionnaire is true, accurate and complete to the best of my / our",
    "knowledge and belief. I / We understand that this information will be used by the Investment Adviser to review and update the risk profile,",
    "asset allocation and suitability assessment for my / our financial plan, in accordance with the SEBI (Investment Advisers) Regulations, 2013.",
    "I / We acknowledge that any material change in my / our financial situation, goals or risk appetite not disclosed herein may affect the quality",
    "of investment advice received, and I / We agree to promptly inform the adviser of any such changes.",
  ];
  decl.forEach((l, i) => txt(p6, l, ML + 8, y - 26 - i * 9, reg, 7.5, BLACK));
  y -= 84;

  txt(p6, "Review outcome agreed and previous profile updated:", ML, y, reg, 8.5);
  y -= 20;

  // Revised risk profile field
  txt(p6, "Revised Risk Category:", ML, y, reg, 8);
  addField(form, p6, "revised_risk_category", ML + 120, y - 2, 160, 14, "", false, reg);
  txt(p6, "Risk Score:", ML + 300, y, reg, 8);
  addField(form, p6, "risk_score", ML + 355, y - 2, 60, 14, "", false, reg);
  y -= 28;

  // Change vs last review
  txt(p6, "Profile change vs previous review:", ML, y, reg, 8);
  [["up","Upgraded (higher risk)"],["down","Downgraded (lower risk)"],["same","No change"]].forEach(([v,l],i) => {
    addCheck(form, p6, `profile_change_${v}`, ML + 180 + i * 110, y - 1, l, false, reg, 8);
  });
  y -= 28;

  // Signature blocks
  const sigY = y - 55;
  rect(p6, ML, sigY, TW/2 - 10, 55, LGREY);
  rect(p6, ML + TW/2 + 10, sigY, TW/2 - 10, 55, LGREY);

  txt(p6, "CLIENT SIGNATURE", ML + 8, sigY + 44, bold, 8, DARK);
  txt(p6, "Name:", ML + 8, sigY + 28, reg, 8);
  addField(form, p6, "sig_client_name", ML + 35, sigY + 24, 160, 12, cl.full_name ?? "", false, reg);
  txt(p6, "Date:", ML + 8, sigY + 10, reg, 8);
  addField(form, p6, "sig_client_date", ML + 35, sigY + 6, 100, 12, today, false, reg);

  txt(p6, "ADVISER / AUTHORISED SIGNATORY", ML + TW/2 + 18, sigY + 44, bold, 8, DARK);
  txt(p6, "Name:", ML + TW/2 + 18, sigY + 28, reg, 8);
  addField(form, p6, "sig_adviser_name", ML + TW/2 + 48, sigY + 24, 140, 12, "", false, reg);
  txt(p6, "ARN:", ML + TW/2 + 18, sigY + 10, reg, 8);
  addField(form, p6, "sig_arn", ML + TW/2 + 40, sigY + 6, 100, 12, "", false, reg);

  y = sigY - 20;
  txt(p6, "Place:", ML, y, reg, 8);
  addField(form, p6, "sig_place", ML + 35, y - 2, 140, 12, "", false, reg);
  y -= 24;

  // Audit footer strip
  rect(p6, ML, y - 20, TW, 20, rgb(0.94,0.96,0.96));
  txt(p6, `Document ID: ${docId}`, ML + 6, y - 9, reg, 7, rgb(0.44,0.52,0.55));
  txt(p6, `Generated: ${today}  |  UCC: ${cl.client_code ?? "—"}  |  SEBI IA Reg. 16 Compliance`, ML + 160, y - 9, reg, 7, rgb(0.44,0.52,0.55));

  footer(p6, reg, 6, PAGES, docId);

  // ── serialize ──────────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  const filename = `Review_${cl.client_code ?? cl.full_name?.replace(/\s+/g,"_")}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}.pdf`;

  // Log download
  await supabase.from("client_activity_log").insert({
    client_id:    id,
    event_type:   "review_pdf_downloaded",
    description:  `Periodic review questionnaire PDF generated`,
    performed_by: user.email,
    metadata:     { file_name: filename, doc_id: docId },
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
