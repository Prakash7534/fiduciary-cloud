// app/(app)/clients/[id]/preferences/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="py-2 pr-6 text-sm text-[#6B7E86] w-56">{label}</td>
      <td className="py-2 text-sm text-[#0F3A46] font-medium">{value ?? "—"}</td>
    </tr>
  );
}

function Pill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border mr-2 mb-2 ${
      active
        ? "bg-[#0F3A46] text-white border-[#0F3A46]"
        : "bg-white text-[#6B7E86] border-[#CBD9DC]"
    }`}>{label}</span>
  );
}

function BehCard({
  q, answer, colors
}: {
  q: string;
  answer?: string | null;
  colors: { sell?: string; hold?: string; buy?: string; yes?: string; no?: string; never?: string; often?: string; sometimes?: string; rarely?: string; };
}) {
  if (!answer) return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
      <p className="text-xs text-[#6B7E86] mb-2">{q}</p>
      <span className="text-sm text-[#6B7E86] italic">Not answered</span>
    </div>
  );

  const lc = answer.toLowerCase();
  let colorClass = "bg-[#DDE6E8] text-[#6B7E86] border-[#CBD9DC]";
  if (lc.includes("sell") || lc.includes("loss") || lc.includes("often"))
    colorClass = "bg-[#F8E7E4] text-[#B4463C] border-[#E4B3AE]";
  else if (lc.includes("buy") || lc.includes("profit") || lc.includes("rarely"))
    colorClass = "bg-[#E4F1EA] text-[#2E7D5B] border-[#B3D9C3]";
  else if (lc.includes("hold") || lc.includes("mixed") || lc.includes("sometimes") || lc.includes("yes"))
    colorClass = "bg-[#FEF9E7] text-[#7D6B2E] border-[#DFC97A]";

  return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
      <p className="text-xs text-[#6B7E86] mb-3 leading-snug">{q}</p>
      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${colorClass}`}>
        {answer}
      </span>
    </div>
  );
}

export default async function PreferencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: facts }, { data: beh }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("behaviour").select("*").eq("client_id", id).maybeSingle(),
  ]);

  if (error || !client) notFound();
  const f = facts ?? ({} as Record<string, string | null>);

  // Style pref options
  const STYLES = ["Growth", "Income", "Capital preservation", "Balanced"];
  const ESG = ["Yes", "No", "No strong preference"];
  const INTL = ["Yes", "No", "Not sure"];

  return (
    <div className="space-y-5">

      {/* G8 — Style summary tiles */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G8 · Investment Style Preferences</h3>
        <div className="mb-4">
          <p className="text-xs text-[#6B7E86] mb-2">Portfolio objective</p>
          <div>{STYLES.map(s => <Pill key={s} label={s} active={f.style_pref === s} />)}</div>
        </div>
        <div className="mb-4">
          <p className="text-xs text-[#6B7E86] mb-2">ESG / Sustainable investing</p>
          <div>{ESG.map(s => <Pill key={s} label={s} active={f.esg_pref === s} />)}</div>
        </div>
        <div className="mb-4">
          <p className="text-xs text-[#6B7E86] mb-2">International exposure</p>
          <div>{INTL.map(s => <Pill key={s} label={s} active={f.intl_pref === s} />)}</div>
        </div>
        {f.sector_pref && (
          <div>
            <p className="text-xs text-[#6B7E86] mb-1">Sector preferences / restrictions</p>
            <p className="text-sm text-[#0F3A46]">{f.sector_pref}</p>
          </div>
        )}
      </div>

      {/* G7 — Behavioural indicators */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-2">G7 · Behavioural Indicators</h3>
        <p className="text-xs text-[#6B7E86] mb-4">
          Colour guide: <span className="text-[#B4463C]">red</span> = reactive / risk-averse,{" "}
          <span className="text-[#7D6B2E]">amber</span> = cautious,{" "}
          <span className="text-[#2E7D5B]">green</span> = disciplined / long-term.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BehCard
            q='If your portfolio fell 20% in a month, you would…'
            answer={beh?.beh1}
            colors={{}}
          />
          <BehCard
            q='Have you ever deviated from your investment plan under market pressure?'
            answer={beh?.beh2}
            colors={{}}
          />
          <BehCard
            q='How often do you regret past financial decisions?'
            answer={beh?.beh3}
            colors={{}}
          />
        </div>
      </div>

      {/* B5 — Operational preferences */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">B5 · Operational Preferences</h3>
        <table className="w-full"><tbody>
          <FieldRow label="Investment mode"        value={f.invest_mode} />
          <FieldRow label="Surplus arises"         value={f.surplus_arises} />
          <FieldRow label="Decision maker"         value={f.decision_maker} />
          <FieldRow label="Portfolio monitoring"   value={f.monitor_frequency} />
          <FieldRow label="Past market experience" value={f.past_experience} />
          <FieldRow label="Review frequency"       value={f.review_freq} />
          <FieldRow label="Reason for investing"   value={f.reason_for_investing} />
          <FieldRow label="Existing adviser"       value={f.current_adviser} />
        </tbody></table>
      </div>

      {/* G5 — Portfolio-level inputs */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4">G5 · Portfolio-Level Inputs</h3>
        <table className="w-full"><tbody>
          <FieldRow label="Investment horizon"      value={f.investment_horizon} />
          <FieldRow label="Income need"             value={f.income_need} />
          <FieldRow label="Withdrawal in next 3 yrs" value={f.withdrawal_3yr} />
          <FieldRow label="Surplus / shortfall pref" value={f.surplus_shortfall_pref} />
          <FieldRow label="Goal-wise bucketing"     value={f.goalwise_bucketing} />
          <FieldRow label="Large expected inflows"  value={f.large_inflows} />
          <FieldRow label="Large expected outflows" value={f.large_expenses} />
          <FieldRow label="Medical commitments"     value={f.medical_commitments} />
          <FieldRow label="Restrictions / exclusions" value={f.restrictions} />
          {f.adviser_notes_misc && <FieldRow label="Misc notes" value={f.adviser_notes_misc} />}
        </tbody></table>
      </div>

    </div>
  );
}
