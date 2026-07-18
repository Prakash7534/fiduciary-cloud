// app/(app)/clients/[id]/family/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

const LEVEL_STYLE: Record<string, string> = {
  Good:  "bg-[#E4F1EA] text-[#2E7D5B] border-[#B3D9C3]",
  Basic: "bg-[#FEF9E7] text-[#7D6B2E] border-[#DFC97A]",
  None:  "bg-[#DDE6E8] text-[#6B7E86] border-[#CBD9DC]",
};

const LEVEL_ICON: Record<string, string> = {
  Good: "✓", Basic: "~", None: "–",
};

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: members }, { data: knowledge }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("family_members").select("*").eq("client_id", id).order("id"),
    supabase.from("knowledge_grid").select("*").eq("client_id", id),
  ]);

  if (error || !client) notFound();

  const goodCount  = knowledge?.filter(k => k.level === "Good").length ?? 0;
  const basicCount = knowledge?.filter(k => k.level === "Basic").length ?? 0;
  const totalIncome = members?.reduce((s, m) => s + (m.annual_income ?? 0), 0) ?? 0;

  return (
    <div className="space-y-5">

      {/* Header cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Family members on record</div>
          <div className="text-3xl font-bold font-serif text-[#0F3A46]">{members?.length ?? 0}</div>
        </div>
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Combined family income</div>
          <div className="font-bold text-[#0F3A46]">
            {totalIncome > 0 ? `₹${totalIncome.toLocaleString("en-IN")}` : "—"}
          </div>
        </div>
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Asset classes known well</div>
          <div className="text-3xl font-bold font-serif text-[#2E7D5B]">{goodCount}</div>
          {basicCount > 0 && (
            <div className="text-xs text-[#7D6B2E] mt-0.5">{basicCount} basic-level</div>
          )}
        </div>
      </div>

      {/* G2 — Family members */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G2 · Family Members</h3>
        {members && members.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0F3A46] text-white text-xs">
                  {["Name", "Relationship", "Age", "Occupation", "Annual Income", "Health"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className={`border-b border-[#E7EFEF] ${i % 2 === 0 ? "" : "bg-[#F5F9FA]"}`}>
                    <td className="px-3 py-2 text-[#0F3A46] font-semibold">{m.name}</td>
                    <td className="px-3 py-2 text-[#6B7E86]">{m.relationship ?? "—"}</td>
                    <td className="px-3 py-2 text-[#6B7E86]">{m.age ?? "—"}</td>
                    <td className="px-3 py-2 text-[#6B7E86]">{m.occupation ?? "—"}</td>
                    <td className="px-3 py-2 text-[#0F3A46]">
                      {m.annual_income != null ? `₹${Number(m.annual_income).toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {m.health_status ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          m.health_status.toLowerCase().includes("good") || m.health_status.toLowerCase().includes("excel")
                            ? "bg-[#E4F1EA] text-[#2E7D5B] border-[#B3D9C3]"
                            : m.health_status.toLowerCase().includes("chron") || m.health_status.toLowerCase().includes("ill")
                            ? "bg-[#F8E7E4] text-[#B4463C] border-[#E4B3AE]"
                            : "bg-[#DDE6E8] text-[#6B7E86] border-[#CBD9DC]"
                        }`}>{m.health_status}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#6B7E86] italic">No family members recorded — will populate once questionnaire is uploaded.</p>
        )}
      </div>

      {/* G6 — Knowledge grid */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-2">G6 · Investment Knowledge Grid</h3>
        <p className="text-xs text-[#6B7E86] mb-4">Self-assessed by client across 8 asset classes.</p>
        {knowledge && knowledge.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {knowledge.map((k) => (
                <div key={k.id} className={`rounded-lg border p-3 text-center text-xs font-medium ${LEVEL_STYLE[k.level] ?? LEVEL_STYLE.None}`}>
                  <div className="text-lg font-bold mb-0.5">{LEVEL_ICON[k.level] ?? "–"}</div>
                  <div className="text-[10px] leading-tight">{k.asset_class}</div>
                  <div className="mt-1 font-semibold">{k.level}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-[#6B7E86]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#2E7D5B] inline-block" /> Good — can evaluate independently</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#C39A38] inline-block" /> Basic — aware, needs guidance</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6B7E86] inline-block" /> None — no prior exposure</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-[#6B7E86] italic">No knowledge assessment recorded.</p>
        )}
      </div>

    </div>
  );
}
