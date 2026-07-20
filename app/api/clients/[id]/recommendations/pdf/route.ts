// app/api/clients/[id]/recommendations/pdf/route.ts — audit-compliant recommendation report
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";

export const runtime = "nodejs";

const DARK = rgb(0.059, 0.227, 0.275); const GOLD = rgb(0.765, 0.604, 0.22);
const GREY = rgb(0.42, 0.49, 0.53); const LGREY = rgb(0.94, 0.96, 0.96);
const W = 595.28, H = 841.89, ML = 45, TW = W - 90;

// Replace characters outside WinAnsi (standard-font encoding) so pdf-lib never throws
function safe(s: string): string {
  return (s ?? "")
    .replace(/₹/g, "Rs.").replace(/≤/g, "<=").replace(/≥/g, ">=")
    .replace(/[✓✔]/g, "(y)").replace(/[✕✖⚠]/g, "!").replace(/→/g, "->")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "-").replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/); const lines: string[] = []; let cur = "";
  words.forEach(w => {
    const t = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(t, size) > width) { if (cur) lines.push(cur); cur = w; }
    else cur = t;
  });
  if (cur) lines.push(cur);
  return lines;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const recId = req.nextUrl.searchParams.get("rec");

  let recQuery = supabase.from("recommendations").select("*").eq("client_id", id).order("created_at", { ascending: false });
  recQuery = recId ? recQuery.eq("rec_id", recId) : recQuery.limit(10);

  const [{ data: cl }, { data: recs }] = await Promise.all([
    supabase.from("clients").select("full_name, client_code, pan").eq("client_id", id).maybeSingle(),
    recQuery,
  ]);
  if (!cl) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!recs || recs.length === 0) return NextResponse.json({ error: "No recommendations to report" }, { status: 404 });

  const now = new Date();
  const today = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const docId = `RECRPT-${cl.client_code ?? id.slice(0, 8).toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const fmt = (n: unknown) => n != null ? "Rs. " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "-";

  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`Investment Recommendations – ${cl.full_name}`);
  pdf.setAuthor("Fiduciary Cloud"); pdf.setCreationDate(now);

  let page!: PDFPage; let y = 0; let pageNum = 0;
  const newPage = () => {
    page = pdf.addPage([W, H]); pageNum++;
    page.drawRectangle({ x: 0, y: H - 58, width: W, height: 58, color: DARK });
    page.drawText("Fiduciary Cloud", { x: ML, y: H - 24, font: bold, size: 14, color: rgb(1,1,1) });
    page.drawText("INVESTMENT RECOMMENDATION REPORT", { x: ML, y: H - 40, font: bold, size: 9, color: GOLD });
    page.drawText(`${cl.full_name}  ·  UCC: ${cl.client_code ?? "-"}  ·  ${today}`, { x: W - ML - 230, y: H - 24, font: reg, size: 8, color: rgb(0.63,0.79,0.84) });
    page.drawText(`Doc: ${docId}  ·  Page ${pageNum}`, { x: W - ML - 230, y: H - 38, font: reg, size: 7, color: rgb(0.63,0.79,0.84) });
    page.drawRectangle({ x: 0, y: 0, width: W, height: 24, color: DARK });
    page.drawText("CONFIDENTIAL — advisory recommendation under SEBI (IA) Regulations 2013 · not a solicitation · client may accept or reject", { x: ML, y: 9, font: reg, size: 6.5, color: rgb(0.63,0.79,0.84) });
    y = H - 76;
  };
  newPage();

  const ensure = (needed: number) => { if (y - needed < 40) newPage(); };
  const line = (label: string, value: string, boldVal = false) => {
    ensure(14);
    page.drawText(safe(label), { x: ML + 6, y, font: reg, size: 8, color: GREY });
    page.drawText(safe(value), { x: ML + 150, y, font: boldVal ? bold : reg, size: 8, color: rgb(0,0,0) });
    y -= 13;
  };
  const para = (label: string, text: string) => {
    const lines = wrap(text || "-", reg, 8, TW - 20);
    ensure(16 + lines.length * 11);
    page.drawText(label, { x: ML + 6, y, font: bold, size: 8, color: DARK }); y -= 12;
    lines.forEach(l => { ensure(12); page.drawText(l, { x: ML + 12, y, font: reg, size: 8, color: rgb(0,0,0) }); y -= 11; });
    y -= 4;
  };

  recs.forEach((r, idx) => {
    ensure(120);
    // Card header
    page.drawRectangle({ x: ML, y: y - 4, width: TW, height: 20, color: DARK });
    page.drawText(safe(`${idx + 1}.  ${r.scrip_name}`), { x: ML + 6, y: y + 1, font: bold, size: 10, color: rgb(1,1,1) });
    const st = (r.status ?? "recommended").toUpperCase();
    page.drawText(st, { x: W - ML - 90, y: y + 1, font: bold, size: 9,
      color: r.status === "executed" ? rgb(0.5,0.9,0.6) : r.status === "rejected" ? rgb(0.95,0.6,0.55) : GOLD });
    y -= 24;

    line("Instrument / Class", `${r.asset_class ?? "-"}${r.category ? " · " + r.category : ""}`);
    line("Current market price", fmt(r.current_price));
    line("Consider (target) price", r.consider_price_max != null && r.consider_price_max !== r.consider_price
      ? `${fmt(r.consider_price)} to ${fmt(r.consider_price_max)}` : fmt(r.consider_price), true);
    line("Investment term", r.term ?? "-", true);
    line("Concentration cap", `${r.concentration_cap_pct ?? "-"}% of portfolio  ·  headroom ${fmt(r.cap_headroom)}`);
    line("Amount to consider now", fmt(r.suggested_amount), true);
    if (r.status === "executed") line("Executed", `${fmt(r.executed_amount)} on ${r.executed_at ? new Date(r.executed_at).toLocaleDateString("en-IN") : "-"}`, true);
    if (r.status === "rejected" && r.rejected_reason) line("Rejected — reason", r.rejected_reason);
    y -= 2;
    para("Why this scrip is considered (market rationale):", r.rationale_market ?? "-");
    para("Why it suits this client (suitability):", r.rationale_suitability ?? "-");
    para("What you should know before you consider (key risks & disclosures):", r.key_risks ?? "-");
    line("Recommendation ID", `${r.doc_id ?? "-"}  ·  issued ${new Date(r.created_at).toLocaleDateString("en-IN")} by ${r.created_by ?? "-"}`);
    y -= 10;
    page.drawLine({ start: { x: ML, y: y + 4 }, end: { x: W - ML, y: y + 4 }, thickness: 0.5, color: rgb(0.78,0.85,0.86) });
    y -= 8;
  });

  // Important information — advisory nature (no client signature required)
  ensure(96);
  page.drawRectangle({ x: ML, y: y - 78, width: TW, height: 78, color: LGREY });
  page.drawText("IMPORTANT — PLEASE READ", { x: ML + 8, y: y - 14, font: bold, size: 8, color: DARK });
  const info = [
    "This document is an investment recommendation for your consideration only. It creates no obligation - you are entirely",
    "free to accept it, reject it, execute it partially, or seek clarification before deciding. No action will be taken on",
    "your behalf without your explicit instruction.",
    "Prices shown are as at the date of issue and will move with the market; the 'consider price' is indicative, not assured.",
    "The suitability assessment is based on your recorded risk profile and portfolio as at the issue date. Please inform your",
    "adviser of any material change in your circumstances before acting on this recommendation.",
  ];
  info.forEach((l, i) => page.drawText(l, { x: ML + 8, y: y - 26 - i * 9, font: reg, size: 7, color: rgb(0,0,0) }));
  y -= 88;
  ensure(14);
  page.drawText(safe(`Issued by: ${user.email ?? "Adviser"}  ·  ${today}  ·  Queries: please contact your adviser before acting.`),
    { x: ML + 2, y, font: reg, size: 7.5, color: GREY });

  const bytes = await pdf.save();
  const filename = recId && recs[0]?.doc_id
    ? `${recs[0].doc_id}.pdf`
    : `Recommendations_${cl.client_code ?? "Client"}_${today.replace(/\s/g, "-")}.pdf`;

  await supabase.from("client_activity_log").insert({
    client_id: id, event_type: "recommendation_report_generated",
    description: `Recommendation report ${docId} generated (${recs.length} recommendation(s))`,
    performed_by: user.email, metadata: { doc_id: docId, count: recs.length },
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
