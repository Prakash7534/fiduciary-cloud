// app/api/clients/[id]/questionnaire-pdf/route.ts
// Serves the SEBI questionnaire as a BLANK, fillable capture form: only the
// client's identity is pre-filled and locked (Name, PAN, DOB, phone, email,
// UCC, date of assessment). Financial, goals, loans, risk and every other
// section are intentionally left blank & fillable — pre-filling previous
// answers is the job of the periodic-review PDF (review-pdf), not this form.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";
import { archivePdf } from "@/lib/documentArchive";
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

function lock(form: ReturnType<PDFDocument["getForm"]>, name: string) {
  try { form.getTextField(name).enableReadOnly(); } catch { /* ignore */ }
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

  // Only the client's identity is needed — nothing else is pre-filled.
  const { data: cl } = await supabase
    .from("clients")
    .select("full_name, pan, dob, phone, email, client_code")
    .eq("client_id", id)
    .maybeSingle();

  if (!cl) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // ── load PDF template ──────────────────────────────────────────────────────
  const templatePath = path.join(process.cwd(), "public", "questionnaire-template.pdf");
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const now = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // ── Identity only — pre-filled & locked. Every other field stays blank. ────
  txt(form, "f_1", now);                        // Date of Assessment
  txt(form, "f_2", cl.client_code ?? "");        // Client Code / UCC
  txt(form, "client_name", cl.full_name);
  txt(form, "pan",         cl.pan);
  txt(form, "dob",         cl.dob ? new Date(cl.dob).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
  txt(form, "phone",       cl.phone);
  txt(form, "email",       cl.email);
  ["client_name", "pan", "dob", "phone", "email", "f_1", "f_2"].forEach(n => lock(form, n));

  // ── serialize and return ──────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  const filename = `Questionnaire_${cl.client_code ?? cl.full_name?.replace(/\s+/g, "_") ?? "Client"}_${now.replace(/\s/g, "-")}.pdf`;

  await archivePdf(supabase, {
    clientId: id, docType: "questionnaire_blank_issued", fileName: filename,
    bytes: Buffer.from(pdfBytes), createdBy: user.email,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
