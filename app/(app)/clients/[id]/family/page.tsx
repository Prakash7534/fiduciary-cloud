// app/(app)/clients/[id]/family/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: members }, { data: knowledge }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("family_members").select("*").eq("client_id", id).order("id"),
    supabase.from("knowledge_grid").select("*").eq("client_id", id),
  ]);

  if (error || !client) notFound();

  const levelColor = (level: string) =>
    level === "Good" ? "bg-[#175A69] text-white" :
    level === "Basic" ? "bg-[#C39A38] text-white" :
    "bg-[#CBD9DC] text-[#5A7A82]";

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-[#0F3A46] mb-6">Family &amp; Knowledge Profile</h1>

      {/* G2 — Family members */}
      <div className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[#5A7A82] mb-3 pb-1 border-b border-[#CBD9DC]">
          G2 · Family Members
        </h2>
        {members && members.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0F3A46] text-white">
                  {["Name", "Relationship", "Age", "Occupation", "Annual Income (₹)", "Health"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className={`border-b border-[#CBD9DC] ${i % 2 === 0 ? "bg-white" : "bg-[#EEF4F5]"}`}>
                    <td className="px-3 py-2 text-[#0F3A46] font-medium">{m.name}</td>
                    <td className="px-3 py-2 text-[#0F3A46]">{m.relationship ?? "—"}</td>
                    <td className="px-3 py-2 text-[#0F3A46]">{m.age ?? "—"}</td>
                    <td className="px-3 py-2 text-[#0F3A46]">{m.occupation ?? "—"}</td>
                    <td className="px-3 py-2 text-[#0F3A46]">
                      {m.annual_income != null ? Number(m.annual_income).toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-3 py-2 text-[#0F3A46]">{m.health_status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#5A7A82] italic">No family members recorded.</p>
        )}
      </div>

      {/* G6 — Knowledge grid */}
      <div>
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[#5A7A82] mb-3 pb-1 border-b border-[#CBD9DC]">
          G6 · Investment Knowledge Grid
        </h2>
        {knowledge && knowledge.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {knowledge.map((k) => (
              <div key={k.id} className="rounded border border-[#CBD9DC] bg-white p-3">
                <div className="text-xs text-[#5A7A82] mb-1">{k.asset_class}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelColor(k.level)}`}>
                  {k.level}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#5A7A82] italic">No knowledge assessment recorded.</p>
        )}
        <p className="mt-3 text-xs text-[#5A7A82]">
          <span className="inline-block w-2 h-2 rounded-full bg-[#175A69] mr-1" />Good
          <span className="inline-block w-2 h-2 rounded-full bg-[#C39A38] mx-1 ml-3" />Basic
          <span className="inline-block w-2 h-2 rounded-full bg-[#CBD9DC] mx-1 ml-3" />None
        </p>
      </div>
    </div>
  );
}
