// app/(app)/clients/[id]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { analyseClient, CATEGORIES, type RiskAnswer, type LoanRow, type InvestmentRow, type GoalRow } from "@/lib/riskEngine";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("client_id", id).maybeSingle();
  if (!client) notFound();

  const [{ data: facts }, { data: answers }, { data: loans }, { data: invs }, { data: goals }] = await Promise.all([
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("risk_answers").select("question_num, answer").eq("client_id", id),
    supabase.from("loans").select("loan_type, outstanding").eq("client_id", id),
    supabase.from("investments").select("asset_class, value").eq("client_id", id),
    supabase.from("goals").select("*").eq("client_id", id),
  ]);

  const a = analyseClient(
    client, facts ?? null, (answers ?? []) as RiskAnswer[],
    (loans ?? []) as LoanRow[], (invs ?? []) as InvestmentRow[], (goals ?? []) as GoalRow[]
  );
  const badFlags = a.flags.filter((f) => f.state === "bad");
  const okFlags = a.flags.filter((f) => f.state === "ok");

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <p className="text-sm text-[#6B7E86] mb-5">
        Age {a.age ?? "—"} · Years to retirement {a.yearsToRetirement ?? "—"} · Income {fmt(a.income)} · Assets {fmt(a.totalAssets)} · Debt {fmt(a.totalDebt)}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Component scores</h3>
          <table className="w-full text-sm">
            <tbody>
              <Row label="Risk Capacity (ability)" value={`${a.cap} / 40 (${((100 * a.cap) / 40).toFixed(0)}%)`} />
              <Row label="Risk Tolerance (willingness)" value={`${a.tol} / 35 (${((100 * a.tol) / 35).toFixed(0)}%)`} />
              <Row label="Knowledge & Experience" value={`${a.kn} / 20 (${((100 * a.kn) / 20).toFixed(0)}%)`} />
              <Row label="TOTAL" value={`${a.total} / 95`} bold />
            </tbody>
          </table>
          <p className="text-xs text-[#6B7E86] mt-2">
            {a.answered}/19 questions answered{a.answered < 19 ? " — profile is provisional until complete" : ""}.
          </p>
        </div>

        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Profile determination</h3>
          <table className="w-full text-sm mb-3">
            <tbody>
              <Row label="Capacity category" value={CATEGORIES[a.capR - 1]} />
              <Row label="Tolerance category" value={CATEGORIES[a.tolR - 1]} />
              <Row label="Governing profile" value={a.finalProfile} bold />
            </tbody>
          </table>
          <div className="bg-[#0F3A46] rounded-lg p-4 text-white">
            <div className="text-[10px] text-[#BFD3D8] uppercase tracking-wide">Final risk profile</div>
            <div className="font-serif text-xl text-[#E8DBB8]">{a.finalProfile}</div>
          </div>
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-2 py-1 font-medium">Equity</th>
                <th className="text-left px-2 py-1 font-medium">Debt</th>
                <th className="text-left px-2 py-1 font-medium">Gold</th>
                <th className="text-left px-2 py-1 font-medium">Cash</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1">{a.alloc[0]}%</td>
                <td className="px-2 py-1">{a.alloc[1]}%</td>
                <td className="px-2 py-1">{a.alloc[2]}%</td>
                <td className="px-2 py-1">{a.alloc[3]}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5 mb-4">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">Red flags & suitability checks ({badFlags.length} flagged)</h3>
        <div className="space-y-2">
          {badFlags.map((f, i) => (
            <div key={i} className="flex gap-3 bg-[#F8E7E4] rounded-lg p-3 text-sm">
              <span className="text-[10px] font-bold text-[#B4463C] shrink-0 mt-0.5">FLAG</span>
              <div>
                <b>{f.name}{f.val ? ` — ${f.val}` : ""}</b>
                <div className="text-xs text-[#6B7E86]">{f.why}</div>
              </div>
            </div>
          ))}
          {okFlags.map((f, i) => (
            <div key={i} className="flex gap-3 bg-[#E4F1EA] rounded-lg p-3 text-sm">
              <span className="text-[10px] font-bold text-[#2E7D5B] shrink-0 mt-0.5">OK</span>
              <b>{f.name}</b>
            </div>
          ))}
        </div>
      </div>

      {a.goals.length > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Goal funding</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-2 py-1 font-medium">Goal</th>
                <th className="text-left px-2 py-1 font-medium">Target year</th>
                <th className="text-left px-2 py-1 font-medium">Value at target</th>
                <th className="text-left px-2 py-1 font-medium">Gap</th>
                <th className="text-left px-2 py-1 font-medium">Extra SIP/mo</th>
              </tr>
            </thead>
            <tbody>
              {a.goals.map((g) => (
                <tr key={g.goal_id} className="border-b border-[#E7EFEF]">
                  <td className="px-2 py-1">{g.goal_name ?? "—"}</td>
                  <td className="px-2 py-1">{g.target_year}</td>
                  <td className="px-2 py-1">{fmt(g.fv)}</td>
                  <td className="px-2 py-1">{fmt(g.gap)}</td>
                  <td className="px-2 py-1 font-semibold">{g.extraSip ? fmt(g.extraSip) : "On track"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="py-1.5 text-[#6B7E86]">{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-bold text-[#0F3A46]" : ""}`}>{value}</td>
    </tr>
  );
}
