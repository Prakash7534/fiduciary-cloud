// app/(app)/clients/[id]/estate/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

function FieldRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="py-2 pr-6 text-sm text-[#6B7E86] w-56">{label}</td>
      <td className="py-2 text-sm text-[#0F3A46] font-medium">{value ?? "—"}</td>
    </tr>
  );
}

function EstateDoc({ label, status }: { label: string; status?: string | null }) {
  const cfg =
    status === "Yes"         ? { bg: "bg-[#E4F1EA] border-[#B3D9C3] text-[#2E7D5B]", icon: "✓" } :
    status === "In progress" ? { bg: "bg-[#FEF9E7] border-[#DFC97A] text-[#7D6B2E]", icon: "◑" } :
    status === "No"          ? { bg: "bg-[#F8E7E4] border-[#E4B3AE] text-[#B4463C]", icon: "✗" } :
    status === "Not applicable" ? { bg: "bg-[#DDE6E8] border-[#CBD9DC] text-[#6B7E86]", icon: "N/A" } :
                               { bg: "bg-[#DDE6E8] border-[#CBD9DC] text-[#6B7E86]", icon: "?" };
  return (
    <div className={`rounded-xl border p-4 text-center ${cfg.bg}`}>
      <div className="text-2xl font-bold mb-1">{cfg.icon}</div>
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-[10px] mt-0.5 opacity-75">{status ?? "Not recorded"}</div>
    </div>
  );
}

function ComplianceFlag({ label, value }: { label: string; value?: string | null }) {
  const isYes = value === "Yes";
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${
      isYes ? "bg-[#F8E7E4] border-[#E4B3AE]" : "bg-[#E4F1EA] border-[#B3D9C3]"
    }`}>
      <span className={`text-xl ${isYes ? "text-[#B4463C]" : "text-[#2E7D5B]"}`}>
        {isYes ? "⚑" : "✓"}
      </span>
      <div>
        <div className="text-xs text-[#6B7E86]">{label}</div>
        <div className={`text-sm font-semibold ${isYes ? "text-[#B4463C]" : "text-[#2E7D5B]"}`}>
          {value ?? "Not declared"}
        </div>
      </div>
    </div>
  );
}

export default async function EstatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: facts }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
  ]);

  if (error || !client) notFound();
  const f = facts ?? ({} as Record<string, string | number | null>);

  const fmt = (n: number | string | null | undefined) =>
    n != null && Number(n) > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : null;

  // Estate completeness
  const estateDocs = [f.will_status, f.trust_status, f.poa_status, f.guardian_status];
  const doneCount = estateDocs.filter(v => v === "Yes").length;

  return (
    <div className="space-y-5">

      {/* Estate summary banner */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#175A69] mb-0.5">Estate planning status</h3>
          <p className="text-xs text-[#6B7E86]">{doneCount} of 4 key documents in place</p>
        </div>
        <div className={`text-4xl font-bold font-serif ${
          doneCount === 4 ? "text-[#2E7D5B]" : doneCount >= 2 ? "text-[#7D6B2E]" : "text-[#B4463C]"
        }`}>{doneCount}/4</div>
      </div>

      {/* G9 — Estate planning documents */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G9 · Estate Planning Documents</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <EstateDoc label="Will"               status={f.will_status as string} />
          <EstateDoc label="Trust"              status={f.trust_status as string} />
          <EstateDoc label="Power of Attorney"  status={f.poa_status as string} />
          <EstateDoc label="Guardian Nominated" status={f.guardian_status as string} />
        </div>
        <table className="w-full"><tbody>
          <FieldRow label="Nominees updated" value={f.nominees_updated as string} />
        </tbody></table>
      </div>

      {/* G3 — Tax profile */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G3 · Tax Profile</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div className="border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">Sec 80C</div>
            <div className="font-bold text-[#0F3A46]">{fmt(f.sec80c as number) ?? "—"}</div>
          </div>
          <div className="border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">Sec 80D</div>
            <div className="font-bold text-[#0F3A46]">{fmt(f.sec80d as number) ?? "—"}</div>
          </div>
          <div className="border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">Capital gains</div>
            <div className="font-semibold text-[#0F3A46]">{(f.capital_gains as string) ?? "—"}</div>
          </div>
          <div className="border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">Foreign assets</div>
            <div className="font-semibold text-[#0F3A46]">{(f.foreign_assets as string) ?? "—"}</div>
          </div>
        </div>
        <table className="w-full"><tbody>
          <FieldRow label="Source of wealth" value={f.source_wealth as string} />
          <FieldRow label="Source of funds"  value={f.source_funds as string} />
        </tbody></table>
      </div>

      {/* G4 — Insurance */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G4 · Insurance Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">Life cover</div>
            <div className="text-xl font-bold font-serif text-[#0F3A46]">{fmt(f.life_cover as number) ?? "—"}</div>
          </div>
          <div className="border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">Health cover</div>
            <div className="text-xl font-bold font-serif text-[#0F3A46]">{fmt(f.health_cover as number) ?? "—"}</div>
          </div>
          <div className="border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">Employer-provided cover</div>
            <div className="text-xl font-bold font-serif text-[#0F3A46]">{fmt(f.employer_cover as number) ?? "—"}</div>
          </div>
        </div>
        <table className="w-full"><tbody>
          <FieldRow label="Additional covers held" value={f.covers_held as string} />
        </tbody></table>
      </div>

      {/* G10 — Compliance */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G10 · Compliance &amp; Declarations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ComplianceFlag label="FATCA / Overseas tax residency" value={f.fatca as string} />
          <ComplianceFlag label="Politically Exposed Person (PEP)" value={f.pep as string} />
        </div>
      </div>

    </div>
  );
}
