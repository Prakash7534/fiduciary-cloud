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

  const { data: lastSubmit } = await supabase
    .from("questionnaire_links")
    .select("submitted_at")
    .eq("client_id", id)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const riskAnswered = answered ?? 0;
  const isComplete   = riskAnswered === 19;
  const lastDate     = lastSubmit?.submitted_at
    ? new Date(lastSubmit.submitted_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : null;

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
            {lastDate ? `Last submitted: ${lastDate} · ` : ""}
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
              <li>• Name, PAN, DOB, phone, email — pre-filled &amp; non-editable</li>
              <li>• Date of assessment &amp; UCC — pre-filled &amp; non-editable</li>
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

      {/* Upload & validate submitted PDF */}
      <SubmitPanel clientId={id} />
    </div>
  );
}
