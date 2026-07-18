// app/(app)/clients/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { analyseClient, type RiskAnswer, type LoanRow, type InvestmentRow, type GoalRow } from "@/lib/riskEngine";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("client_id, full_name, dob, updated_at")
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
      <h1 className="font-serif text-2xl text-[#0F3A46] mb-1">Clients</h1>
      <p className="text-sm text-[#6B7E86] mb-5">{rows.length} client(s) in the database.</p>

      {rows.length === 0 ? (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-6">
          <p className="text-sm mb-3">No clients loaded yet.</p>
          <Link href="/upload" className="inline-block bg-[#C39A38] text-[#0F3A46] text-sm font-medium rounded-md px-4 py-2">
            Load your first questionnaire
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Risk profile</th>
                <th className="text-left px-3 py-2 font-medium">Answered</th>
                <th className="text-left px-3 py-2 font-medium">Red flags</th>
                <th className="text-left px-3 py-2 font-medium">Last updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, profile, answered, badFlags }) => (
                <tr key={client.client_id} className="border-b border-[#E7EFEF] hover:bg-[#F7F9F9]">
                  <td className="px-3 py-2 font-medium">{client.full_name}</td>
                  <td className="px-3 py-2">{profile}</td>
                  <td className="px-3 py-2">{answered}/19</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        badFlags ? "bg-[#F8E7E4] text-[#B4463C]" : "bg-[#E4F1EA] text-[#2E7D5B]"
                      }`}
                    >
                      {badFlags ? `${badFlags} flags` : "Clear"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#6B7E86] text-xs">{client.updated_at}</td>
                  <td className="px-3 py-2">
                    <Link href={`/clients/${client.client_id}`} className="text-[#175A69] text-xs font-medium hover:underline">
                      Open report →
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
