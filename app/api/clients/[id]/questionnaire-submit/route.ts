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
  const getField = (name: string): string => {
    try { return pdfForm.getTextField(name).getText() ?? ""; } catch { return ""; }
  };

  const pdf = {
    client_code: getField("f_2"),
    full_name:   getField("client_name"),
    pan:         getField("pan"),
    dob:         getField("dob"),
    phone:       getField("phone"),
    email:       getField("email"),
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
    description:  `Questionnaire PDF validated and submission recorded`,
    performed_by: user.email,
    notes:        notes || null,
    metadata:     { file_name: fileName, pdf_values: pdf },
  });

  return NextResponse.json({ ok: true, message: "Questionnaire validated and submission recorded." });
}
