// app/(app)/clients/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { analyseClient, type RiskAnswer, type LoanRow, type InvestmentRow, type GoalRow } from "@/lib/riskEngine";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("client_id, full_name, dob, client_code, updated_at")
    .order("full_name");

  const rows = await Promise.all(
    (clients ?? []).map(async (c) => {
      const [{ data: facts }, { data: answers }, { data: loans }, { data: invs }, { data: goals }] = await Promise.all([
        supabase.from("financial_facts").select("*").eq("client_id", c.client_id).maybeSingle(),
        supabase.from("risk_answers").select("question_num, answer").eq("client_id", c.client_id),
        supabase.from("loans").select("loan_type, outstanding").eq("client_id", c.client_id),
        supabase.from("investments").select("asset_class, value").eq("client_id", c.client_id),
        supabase.from("goals").select("*").eq("client_id", c.client_id),
      ]);
      const a = analyseClient(
        c, facts ?? null, (answers ?? []) as RiskAnswer[],
        (loans ?? []) as LoanRow[], (invs ?? []) as InvestmentRow[], (goals ?? []) as GoalRow[]
      );
      const badFlags = a.flags.filter((f) => f.state === "bad").length;
      return { client: c, profile: a.finalProfile, answered: a.answered, badFlags };
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-serif text-2xl text-[#0F3A46] mb-1">Clients</h1>
          <p className="text-sm text-[#4A6572]">{rows.length} client(s) in the database.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/clients/new" className="inline-block bg-[#0F3A46] text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-[#175A69]">
            + New Client
          </Link>

        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-6">
          <p className="text-sm text-[#0F3A46] mb-3">No clients loaded yet.</p>

        </div>
      ) : (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-3 py-2.5 font-medium">Client code</th>
                <th className="text-left px-3 py-2.5 font-medium">Name</th>
                <th className="text-left px-3 py-2.5 font-medium">Risk profile</th>
                <th className="text-left px-3 py-2.5 font-medium">Answered</th>
                <th className="text-left px-3 py-2.5 font-medium">Red flags</th>
                <th className="text-left px-3 py-2.5 font-medium">Last updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, profile, answered, badFlags }) => (
                <tr key={client.client_id} className="border-b border-[#E7EFEF] hover:bg-[#C8D8DB]">
                  <td className="px-3 py-2.5">
                    {client.client_code ? (
                      <span className="font-mono text-xs bg-[#EBF3F5] text-[#0F3A46] border border-[#C8D8DB] px-2 py-0.5 rounded">
                        {client.client_code}
                      </span>
                    ) : (
                      <span className="text-xs text-[#6B7E86] italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-[#0F3A46]">{client.full_name}</td>
                  <td className="px-3 py-2.5 text-[#0F3A46]">{profile}</td>
                  <td className="px-3 py-2.5 text-[#0F3A46]">{answered}/19</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      badFlags ? "bg-[#F8E7E4] text-[#B4463C]" : "bg-[#E4F1EA] text-[#2E7D5B]"
                    }`}>
                      {badFlags ? `${badFlags} flags` : "Clear"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#4A6572] text-xs">
                    {client.updated_at ? new Date(client.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/clients/${client.client_id}`} className="text-[#175A69] text-xs font-medium hover:underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
