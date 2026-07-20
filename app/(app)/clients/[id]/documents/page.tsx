// app/(app)/clients/[id]/documents/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

const DOC_TYPE_LABEL: Record<string, string> = {
  questionnaire_submitted: "Questionnaire — client submission (signed source)",
  review_submitted: "Periodic review — client submission (signed source)",
  questionnaire_blank_issued: "Questionnaire — blank form issued",
  review_blank_issued: "Periodic review — blank form issued",
  recommendation_report: "Recommendation report",
};

function fmtSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: docs }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("document_archive").select("*").eq("client_id", id).order("created_at", { ascending: false }),
  ]);

  if (error || !client) notFound();

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-1">Documents</h3>
        <p className="text-xs text-[#6B7E86]">
          Every PDF submitted by or issued to this client is archived here permanently — the exact
          file, not a live re-render. This is the audit source of truth even if fields shown
          elsewhere in the app later change.
        </p>
      </div>

      {!docs || docs.length === 0 ? (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 text-center">
          <p className="text-[#6B7E86]">No documents archived yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0F3A46] text-white text-xs">
                  {["Date", "Document", "File name", "Size", "By", ""].map(h => (
                    <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={d.doc_id} className={i % 2 ? "bg-[#F7FAFA]" : "bg-white"}>
                    <td className="px-4 py-2.5 text-[#0F3A46] whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5 text-[#0F3A46]">{DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</td>
                    <td className="px-4 py-2.5 text-[#6B7E86]">{d.file_name}</td>
                    <td className="px-4 py-2.5 text-[#6B7E86]">{fmtSize(d.file_size)}</td>
                    <td className="px-4 py-2.5 text-[#6B7E86]">{d.created_by ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/api/clients/${id}/documents/${d.doc_id}`}
                        className="text-[#175A69] hover:underline text-xs font-medium"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
