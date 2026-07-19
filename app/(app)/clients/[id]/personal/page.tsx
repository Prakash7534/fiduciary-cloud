// app/(app)/clients/[id]/personal/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

function StatCard({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
      <div className="text-xs text-[#6B7E86] mb-1">{label}</div>
      <div className="font-semibold text-[#0F3A46]">{value ?? "—"}</div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display =
    value == null ? "—" :
    typeof value === "boolean" ? (value ? "Yes" : "No") :
    String(value);
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="py-2 pr-6 text-sm text-[#6B7E86] w-52">{label}</td>
      <td className="py-2 text-sm text-[#0F3A46] font-medium">{display}</td>
    </tr>
  );
}

function Flag({ label, value }: { label: string; value?: boolean | null }) {
  const on = value === true;
  return (
    <div className={`rounded-lg p-3 text-center text-xs font-medium border ${
      on ? "bg-[#FEF9E7] border-[#C39A38] text-[#7D6B2E]"
         : "bg-[#DDE6E8] border-[#CBD9DC] text-[#6B7E86]"
    }`}>
      <div className="text-base mb-0.5">{on ? "⚑" : "–"}</div>
      {label}
    </div>
  );
}

export default async function PersonalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients").select("*").eq("client_id", id).single();
  if (error || !client) notFound();

  const dobDisplay = client.dob
    ? new Date(client.dob).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  // Completeness: count non-null key fields
  const keyFields = [client.pan, client.dob, client.email, client.phone, client.gender,
    client.marital_status, client.address, client.occupation, client.nationality,
    client.residential_status, client.client_type];
  const filled = keyFields.filter(v => v != null && v !== "").length;
  const total = keyFields.length;
  const pct = Math.round((filled / total) * 100);
  const completenessColor = pct >= 80 ? "text-[#2E7D5B]" : pct >= 50 ? "text-[#7D6B2E]" : "text-[#B4463C]";

  return (
    <div className="space-y-5">

      {/* KYC completeness banner */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#175A69] mb-0.5">KYC completeness</h3>
          <p className="text-xs text-[#6B7E86]">{filled} of {total} key fields populated</p>
        </div>
        <div className={`text-4xl font-bold font-serif ${completenessColor}`}>{pct}%</div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-[#EBF3F5] border border-[#C8D8DB] rounded-xl p-4">
          <div className="text-xs text-[#175A69] font-medium mb-1">Client code</div>
          <div className="font-mono font-bold text-[#0F3A46] tracking-wide">{client.client_code ?? "—"}</div>
        </div>
        <StatCard label="Client type" value={client.client_type} />
        <StatCard label="Residential status" value={client.residential_status} />
        <StatCard label="PAN" value={client.pan} />
        <StatCard label="Date of birth" value={dobDisplay} />
      </div>

      {/* Identity */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">A · Identity</h3>
        <table className="w-full"><tbody>
          <FieldRow label="Full name"         value={client.full_name} />
          <FieldRow label="Gender"            value={client.gender} />
          <FieldRow label="Marital status"    value={client.marital_status} />
          <FieldRow label="Nationality"       value={client.nationality} />
          <FieldRow label="Email"             value={client.email} />
          <FieldRow label="Phone"             value={client.phone} />
          <FieldRow label="Address"           value={client.address} />
        </tbody></table>
      </div>

      {/* Employment */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G1 · Employment &amp; Background</h3>
        <table className="w-full"><tbody>
          <FieldRow label="Occupation"          value={client.occupation} />
          <FieldRow label="Employer / Firm"     value={client.employer} />
          <FieldRow label="Industry"            value={client.industry} />
          <FieldRow label="Years of experience" value={client.years_exp != null ? `${client.years_exp} yrs` : null} />
          <FieldRow label="Career stage"        value={client.career_stage} />
          <FieldRow label="Education"           value={client.education} />
          <FieldRow label="Dependants (detail)" value={client.dependants_detail} />
        </tbody></table>
      </div>

      {/* Situation flags */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G1 · Situation Flags</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Flag label="Sole earner"             value={client.sole_earner} />
          <Flag label="Owns business"           value={client.owns_business} />
          <Flag label="Expecting inheritance"   value={client.expecting_inheritance} />
          <Flag label="Life plan change ahead"  value={client.plan_change} />
        </div>
      </div>

    </div>
  );
}
