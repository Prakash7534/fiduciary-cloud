// app/q/[token]/page.tsx — public client-facing questionnaire (no auth needed)
import { createClient } from "@/lib/supabase/server";
import PublicQForm from "./_client";

export default async function PublicQPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  // Validate token (public read policy allows this without auth)
  const { data: link } = await supabase
    .from("questionnaire_links")
    .select("client_id, expires_at, submitted_at, is_active")
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F9FA] p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-lg font-semibold text-[#0F3A46] mb-2">Link not found or expired</h1>
          <p className="text-sm text-[#6B7E86]">Please contact your financial adviser for a new link.</p>
        </div>
      </div>
    );
  }

  if (new Date(link.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F9FA] p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">⏰</div>
          <h1 className="text-lg font-semibold text-[#0F3A46] mb-2">This link has expired</h1>
          <p className="text-sm text-[#6B7E86]">Please ask your adviser to generate a new link.</p>
        </div>
      </div>
    );
  }

  if (link.submitted_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F9FA] p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-lg font-semibold text-[#0F3A46] mb-2">Already submitted</h1>
          <p className="text-sm text-[#6B7E86]">This questionnaire has already been completed. Thank you!</p>
        </div>
      </div>
    );
  }

  // Fetch all pre-fillable client fields
  const { data: client } = await supabase
    .from("clients")
    .select("full_name, client_code, dob, pan, email, phone, gender, marital_status, nationality, address, occupation")
    .eq("client_id", link.client_id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[#F5F9FA] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Firm header */}
        <div className="text-center mb-6">
          <div className="text-[#0F3A46] font-serif text-2xl font-bold mb-1">Fiduciary Cloud</div>
          <p className="text-xs text-[#6B7E86]">Secure client questionnaire — please answer all questions honestly</p>
        </div>
        <PublicQForm
          token={token}
          clientId={link.client_id}
          clientName={client?.full_name ?? ""}
          clientCode={client?.client_code ?? ""}
          prefill={{
            full_name:      client?.full_name      ?? undefined,
            dob:            client?.dob            ?? undefined,
            pan:            client?.pan            ?? undefined,
            email:          client?.email          ?? undefined,
            phone:          client?.phone          ?? undefined,
            gender:         (client?.gender as string | undefined)          ?? undefined,
            marital_status: (client?.marital_status as string | undefined)  ?? undefined,
            nationality:    (client?.nationality as string | undefined)     ?? undefined,
            address:        (client?.address as string | undefined)         ?? undefined,
            occupation:     (client?.occupation as string | undefined)      ?? undefined,
          }}
        />
        <p className="text-center text-[10px] text-[#6B7E86] mt-6">Your data is encrypted and shared only with your adviser. Powered by Fiduciary Cloud.</p>
      </div>
    </div>
  );
}
