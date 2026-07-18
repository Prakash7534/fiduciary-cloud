// app/(app)/clients/[id]/estate/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <tr className="border-b border-[#CBD9DC]">
      <td className="py-2 pr-6 text-sm font-medium text-[#5A7A82] w-56">{label}</td>
      <td className="py-2 text-sm text-[#0F3A46]">{value ?? "—"}</td>
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

function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-sm text-[#5A7A82]">—</span>;
  const color =
    value === "Yes" ? "bg-[#175A69] text-white" :
    value === "In progress" ? "bg-[#C39A38] text-white" :
    "bg-[#CBD9DC] text-[#5A7A82]";
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{value}</span>;
}

export default async function EstatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: facts }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
  ]);

  if (error || !client) notFound();
  const f = facts ?? {};

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-[#0F3A46] mb-6">Estate &amp; Compliance</h1>

      {/* G9 — Estate planning */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[#5A7A82] mb-4 pb-1 border-b border-[#CBD9DC]">
          G9 · Estate Planning Documents
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Will", value: f.will_status },
            { label: "Trust", value: f.trust_status },
            { label: "Power of Attorney", value: f.poa_status },
            { label: "Guardian Nominated", value: f.guardian_status },
          ].map(({ label, value }) => (
            <div key={label} className="rounded border border-[#CBD9DC] bg-white p-3">
              <div className="text-xs text-[#5A7A82] mb-2">{label}</div>
              <StatusBadge value={value} />
            </div>
          ))}
        </div>
        <table className="w-full mt-4"><tbody>
          <Row label="Nominees Updated" value={f.nominees_updated} />
        </tbody></table>
      </div>

      {/* G3 — Tax */}
      <Section title="G3 · Tax Profile">
        <Row label="Sec 80C Investments (₹)" value={f.sec80c != null ? Number(f.sec80c).toLocaleString("en-IN") : null} />
        <Row label="Sec 80D Premium (₹)" value={f.sec80d != null ? Number(f.sec80d).toLocaleString("en-IN") : null} />
        <Row label="Capital Gains" value={f.capital_gains} />
        <Row label="Foreign Assets / Income" value={f.foreign_assets} />
        <Row label="Source of Wealth" value={f.source_wealth} />
        <Row label="Source of Funds" value={f.source_funds} />
      </Section>

      {/* G4 — Insurance */}
      <Section title="G4 · Insurance Cover">
        <Row label="Life Cover (₹)" value={f.life_cover != null ? Number(f.life_cover).toLocaleString("en-IN") : null} />
        <Row label="Health Cover (₹)" value={f.health_cover != null ? Number(f.health_cover).toLocaleString("en-IN") : null} />
        <Row label="Employer-provided Cover (₹)" value={f.employer_cover != null ? Number(f.employer_cover).toLocaleString("en-IN") : null} />
        <Row label="Additional Covers Held" value={f.covers_held} />
      </Section>

      {/* G10 — Compliance */}
      <Section title="G10 · Compliance &amp; Declarations">
        <Row label="FATCA / Overseas Tax Residency" value={f.fatca} />
        <Row label="Politically Exposed Person (PEP)" value={f.pep} />
      </Section>
    </div>
  );
}
