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

  return (
    <div className="max-w-3xl mx-auto space-y-2">
      <div className="flex items-center gap-2 text-xs text-[#6B7E86] mb-2">
        <Link href="/clients" className="hover:text-[#0F3A46]">Clients</Link>
        <span>/</span>
        <Link href={`/clients/${id}`} className="hover:text-[#0F3A46]">{client.full_name}</Link>
        <span>/</span>
        <span className="text-[#0F3A46] font-medium">Questionnaire</span>
      </div>
      <AdviserQForm
        clientId={id}
        clientName={client.full_name ?? ""}
        clientCode={client.client_code ?? "—"}
        prefill={{
          full_name: client.full_name ?? undefined,
          dob: client.dob ?? undefined,
          pan: client.pan ?? undefined,
          email: (client as Record<string,unknown>).email as string | undefined,
          phone: (client as Record<string,unknown>).phone as string | undefined,
          gender: (client as Record<string,unknown>).gender as string | undefined,
          occupation: (client as Record<string,unknown>).occupation as string | undefined,
        }}
      />
    </div>
  );
}
