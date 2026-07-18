// app/(app)/clients/[id]/layout.tsx
// Provides the shared breadcrumb, client name heading, and tab nav for all
// client sub-pages. Each sub-page renders only its own content cards.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientTabNav from "./_components/ClientTabNav";

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
    <div>
      <p className="text-xs mb-2">
        <Link href="/clients" className="text-[#175A69] hover:underline">
          ← All clients
        </Link>
      </p>
      <h1 className="font-serif text-2xl text-[#0F3A46] mb-3">
        {client.full_name}
      </h1>
      <ClientTabNav clientId={client.client_id} />
      {children}
    </div>
  );
}
