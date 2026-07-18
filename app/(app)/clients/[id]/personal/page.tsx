// app/(app)/clients/[id]/personal/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

function Row({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display =
    value == null ? "—" :
    typeof value === "boolean" ? (value ? "Yes" : "No") :
    String(value);
  return (
    <tr className="border-b border-[#CBD9DC]">
      <td className="py-2 pr-6 text-sm font-medium text-[#5A7A82] w-48">{label}</td>
      <td className="py-2 text-sm text-[#0F3A46]">{display}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-[#5A7A82] mb-3 pb-1 border-b border-[#CBD9DC]">{title}</h2>
      <table className="w-full"><tbody>{children}</tbody></table>
    </div>
  );
}

export default async function PersonalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("client_id", id)
    .single();

  if (error || !client) notFound();

  const dobDisplay = client.dob
    ? new Date(client.dob).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-[#0F3A46] mb-6">Personal &amp; KYC</h1>

      <Section title="A · Identity">
        <Row label="Full Name" value={client.full_name} />
        <Row label="PAN" value={client.pan} />
        <Row label="Date of Birth" value={dobDisplay} />
        <Row label="Gender" value={client.gender} />
        <Row label="Marital Status" value={client.marital_status} />
        <Row label="Nationality" value={client.nationality} />
        <Row label="Residential Status" value={client.residential_status} />
        <Row label="Client Type" value={client.client_type} />
      </Section>

      <Section title="A · Contact">
        <Row label="Email" value={client.email} />
        <Row label="Phone" value={client.phone} />
        <Row label="Address" value={client.address} />
      </Section>

      <Section title="G1 · Employment &amp; Background">
        <Row label="Occupation" value={client.occupation} />
        <Row label="Employer / Firm" value={client.employer} />
        <Row label="Industry" value={client.industry} />
        <Row label="Years of Experience" value={client.years_exp != null ? `${client.years_exp} yrs` : null} />
        <Row label="Career Stage" value={client.career_stage} />
        <Row label="Education" value={client.education} />
        <Row label="Dependants (detail)" value={client.dependants_detail} />
      </Section>

      <Section title="G1 · Situation Flags">
        <Row label="Sole Earner" value={client.sole_earner} />
        <Row label="Owns Business" value={client.owns_business} />
        <Row label="Expecting Inheritance" value={client.expecting_inheritance} />
        <Row label="Life Plan Change Expected" value={client.plan_change} />
      </Section>
    </div>
  );
}
