// app/(app)/clients/[id]/questionnaire/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import AdviserQForm from "./_client";

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("client_id, full_name, dob, pan, email, phone, gender, occupation, client_code")
    .eq("client_id", id)
    .single();
  if (error || !client) notFound();

  // Fields that came from profile creation — pre-fill and flag as "from profile"
  const profileFields = {
    full_name:  client.full_name ?? undefined,
    dob:        client.dob ?? undefined,
    pan:        client.pan ?? undefined,
    email:      (client.email as string | null) ?? undefined,
    phone:      (client.phone as string | null) ?? undefined,
    gender:     (client.gender as string | null) ?? undefined,
    occupation: (client.occupation as string | null) ?? undefined,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-2">
      <div className="flex items-center gap-2 text-xs text-[#6B7E86] mb-2">
        <Link href="/clients" className="hover:text-[#0F3A46]">Clients</Link>
        <span>/</span>
        <Link href={`/clients/${id}`} className="hover:text-[#0F3A46]">{client.full_name}</Link>
        <span>/</span>
        <span className="text-[#0F3A46] font-medium">Questionnaire</span>
      </div>
      {/* PDF + Blank form links */}
      <div className="flex gap-2 justify-end flex-wrap">
        <a
          href={`/adviser-q/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F3A46] text-white rounded-lg text-xs font-semibold hover:bg-[#175A69]"
        >
          ⬇ Download completed PDF
        </a>
        <a
          href={`/adviser-q/${id}/blank`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#CBD9DC] rounded-lg text-xs text-[#0F3A46] font-medium hover:bg-[#F0F5F6]"
        >
          🖨 Print blank form (manual)
        </a>
      </div>
      <AdviserQForm
        clientId={id}
        clientName={client.full_name ?? ""}
        clientCode={client.client_code ?? "—"}
        prefill={profileFields}
      />
    </div>
  );
}
