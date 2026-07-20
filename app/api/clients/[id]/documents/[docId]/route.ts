// app/api/clients/[id]/documents/[docId]/route.ts
// Streams back a short-lived signed URL redirect for an archived document.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: doc, error } = await supabase
    .from("document_archive")
    .select("storage_path, file_name")
    .eq("doc_id", docId)
    .eq("client_id", id)
    .maybeSingle();

  if (error || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error: signErr } = await supabase.storage
    .from("client-documents")
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });

  if (signErr || !signed) return NextResponse.json({ error: "Could not generate download link" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
