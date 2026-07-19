// app/(app)/clients/[id]/questionnaire/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import SubmitPanel from "./_submit";

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("client_id, full_name, dob, pan, email, phone, client_code")
    .eq("client_id", id)
    .single();
  if (error || !client) notFound();

  const { count: answered } = await supabase
    .from("risk_answers")
    .select("*", { count: "exact", head: true })
    .eq("client_id", id);

  // Activity log — latest 20 entries
  const { data: activityLog } = await supabase
    .from("client_activity_log")
    .select("log_id, event_type, description, performed_by, notes, metadata, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const riskAnswered = answered ?? 0;
  const isComplete   = riskAnswered === 19;

  const eventLabel: Record<string, { label: string; icon: string; colour: string }> = {
    questionnaire_submitted:         { label: "Questionnaire submitted",        icon: "✅", colour: "text-[#2E7D5B]" },
    questionnaire_validation_failed: { label: "Validation failed",              icon: "⚠",  colour: "text-[#B4463C]" },
    review_pdf_downloaded:           { label: "Review PDF generated",           icon: "🔄", colour: "text-[#175A69]" },
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#6B7E86]">
        <Link href="/clients" className="hover:text-[#0F3A46]">Clients</Link>
        <span>/</span>
        <Link href={`/clients/${id}`} className="hover:text-[#0F3A46]">{client.full_name}</Link>
        <span>/</span>
        <span className="text-[#0F3A46] font-medium">Questionnaire</span>
      </div>

      {/* Status card */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl px-6 py-4 flex items-center gap-4">
        <div className={"w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 " + (isComplete ? "bg-[#E8F4EE]" : "bg-[#FFF8EC]")}>
          {isComplete ? "✅" : riskAnswered > 0 ? "📋" : "📄"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0F3A46]">
            {isComplete ? "Questionnaire complete" : riskAnswered > 0 ? `In progress — ${riskAnswered}/19 risk questions answered` : "Questionnaire not yet submitted"}
          </p>
          <p className="text-xs text-[#6B7E86] mt-0.5">
            UCC: <span className="font-mono font-semibold text-[#0F3A46]">{client.client_code ?? "—"}</span>
          </p>
        </div>
      </div>

      {/* Download card */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl px-6 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-[#0F3A46]">Download editable questionnaire (PDF)</p>
            <p className="text-xs text-[#6B7E86] mt-1 max-w-sm">
              SEBI-compliant risk profiling form with identity details pre-filled and locked. Share with the client to complete and return signed.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-[#6B7E86]">
              <li>• Name, PAN, DOB, phone, email, UCC, date of assessment — pre-filled &amp; non-editable</li>
              <li>• All financial, risk &amp; goals sections — blank &amp; fillable</li>
            </ul>
          </div>
          <a
            href={`/api/clients/${id}/questionnaire-pdf`}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F3A46] text-white rounded-lg text-sm font-semibold hover:bg-[#175A69] transition-colors"
          >
            ⬇ Download PDF
          </a>
        </div>
      </div>

      {/* Review PDF download */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl px-6 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-[#0F3A46]">Download periodic review questionnaire (PDF)</p>
            <p className="text-xs text-[#6B7E86] mt-1 max-w-sm">
              Shorter, purpose-built form for annual or triggered reviews. Previous financial data and risk answers are pre-filled for reference — all sections remain editable.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-[#6B7E86]">
              <li>• Identity locked · Financial + goals pre-filled from last profile</li>
              <li>• Risk Q1–19 pre-filled from previous answers — update if changed</li>
              <li>• Life-events checklist · Revised profile + dual signature block</li>
              <li>• Supports trend analysis — each review is timestamped in activity log</li>
            </ul>
          </div>
          <a
            href={`/api/clients/${id}/review-pdf`}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-[#175A69] text-white rounded-lg text-sm font-semibold hover:bg-[#0F3A46] transition-colors"
          >
            🔄 Download Review PDF
          </a>
        </div>
      </div>

      {/* Upload & validate */}
      <SubmitPanel clientId={id} />

      {/* Activity log */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E7EFEF] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#0F3A46]">Activity log</p>
          <span className="text-xs text-[#6B7E86]">{activityLog?.length ?? 0} events</span>
        </div>

        {!activityLog || activityLog.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-[#6B7E86]">No activity recorded yet.</p>
            <p className="text-xs text-[#A8BDC3] mt-1">Upload a completed questionnaire to generate the first log entry.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#E7EFEF]">
            {activityLog.map((entry) => {
              const meta = eventLabel[entry.event_type];
              const ts   = new Date(entry.created_at);
              const dateStr = ts.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
              const timeStr = ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
              const fileName = (entry.metadata as Record<string,unknown> | null)?.file_name as string | undefined;

              return (
                <div key={entry.log_id} className="px-6 py-4 flex items-start gap-3">
                  <span className="text-base shrink-0 mt-0.5">{meta?.icon ?? "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <p className={"text-sm font-medium " + (meta?.colour ?? "text-[#0F3A46]")}>
                        {meta?.label ?? entry.event_type}
                      </p>
                      <p className="text-xs text-[#6B7E86] whitespace-nowrap shrink-0">
                        {dateStr} · {timeStr}
                      </p>
                    </div>
                    {fileName && (
                      <p className="text-xs text-[#4A6572] mt-0.5 font-mono">{fileName}</p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-[#4A6572] mt-0.5 italic">{entry.notes}</p>
                    )}
                    {entry.performed_by && (
                      <p className="text-[10px] text-[#A8BDC3] mt-1">By {entry.performed_by}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
