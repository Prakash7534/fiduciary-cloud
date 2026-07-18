// app/(app)/clients/[id]/layout.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientSidebar from "./_components/ClientSidebar";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("client_id, full_name")
    .eq("client_id", id)
    .maybeSingle();
  if (!client) notFound();

  return (
    <>
      <ClientSidebar clientId={client.client_id} clientName={client.full_name} />
      <main className="flex-1 p-8 text-[#0F3A46] overflow-auto">{children}</main>
    </>
  );
}
