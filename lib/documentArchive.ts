// lib/documentArchive.ts
// Archives generated/submitted PDFs to Supabase Storage for audit retention (Fix #5).
// Non-fatal by design: a failure here must never break the PDF response the
// adviser or client is waiting on. Callers should fire-and-await this but
// ignore the return value on failure.
import type { SupabaseClient } from "@supabase/supabase-js";

export type DocType =
  | "questionnaire_submitted"
  | "review_submitted"
  | "questionnaire_blank_issued"
  | "review_blank_issued"
  | "recommendation_report";

interface ArchiveOpts {
  clientId: string;
  docType: DocType;
  fileName: string;
  bytes: Uint8Array | Buffer;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

export async function archivePdf(
  supabase: SupabaseClient,
  opts: ArchiveOpts
): Promise<string | null> {
  try {
    const safeName = opts.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const path = `${opts.clientId}/${opts.docType}/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("client-documents")
      .upload(path, opts.bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) {
      console.error("archivePdf: storage upload failed:", upErr.message);
      return null;
    }

    const { error: dbErr } = await supabase.from("document_archive").insert({
      client_id: opts.clientId,
      doc_type: opts.docType,
      file_name: opts.fileName,
      storage_path: path,
      file_size: opts.bytes.length,
      created_by: opts.createdBy ?? null,
      metadata: opts.metadata ?? {},
    });
    if (dbErr) {
      console.error("archivePdf: document_archive insert failed:", dbErr.message);
    }

    return path;
  } catch (e) {
    console.error("archivePdf: unexpected error:", e);
    return null;
  }
}
