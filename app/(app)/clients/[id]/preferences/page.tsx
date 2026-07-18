// app/(app)/clients/[id]/preferences/page.tsx
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

export default async function PreferencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: facts }, { data: beh }] = await Promise.all([
    supabase.from("clients").select("full_name").eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("behaviour").select("*").eq("client_id", id).maybeSingle(),
  ]);

  if (error || !client) notFound();
  const f = facts ?? {};

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-[#0F3A46] mb-6">Preferences &amp; Behaviour</h1>

      <Section title="B5 · Investment Preferences">
        <Row label="Investment Mode" value={f.invest_mode} />
        <Row label="Surplus Arises" value={f.surplus_arises} />
        <Row label="Decision Maker" value={f.decision_maker} />
        <Row label="Monitor Frequency" value={f.monitor_frequency} />
        <Row label="Past Experience" value={f.past_experience} />
        <Row label="Review Frequency" value={f.review_freq} />
        <Row label="Reason for Investing" value={f.reason_for_investing} />
        <Row label="Existing Adviser" value={f.current_adviser} />
      </Section>

      <Section title="G8 · Style &amp; Thematic Preferences">
        <Row label="Investment Style" value={f.style_pref} />
        <Row label="ESG / Sustainable" value={f.esg_pref} />
        <Row label="International Exposure" value={f.intl_pref} />
        <Row label="Sector Preferences" value={f.sector_pref} />
        <Row label="Restrictions / Exclusions" value={f.restrictions} />
      </Section>

      <Section title="G7 · Behavioural Indicators">
        <Row
          label="If portfolio fell 20%…"
          value={beh?.beh1 ?? null}
        />
        <Row
          label="Ever deviated from plan?"
          value={beh?.beh2 ?? null}
        />
        <Row
          label="Regrets past decisions?"
          value={beh?.beh3 ?? null}
        />
      </Section>

      <Section title="G5 · Portfolio-Level Inputs">
        <Row label="Investment Horizon" value={f.investment_horizon} />
        <Row label="Income Need from Portfolio" value={f.income_need} />
        <Row label="Withdrawal in Next 3 Yrs" value={f.withdrawal_3yr} />
        <Row label="Surplus / Shortfall Preference" value={f.surplus_shortfall_pref} />
        <Row label="Goal-wise Bucketing" value={f.goalwise_bucketing} />
        <Row label="Large Expected Inflows" value={f.large_inflows} />
        <Row label="Large Expected Outflows" value={f.large_expenses} />
        <Row label="Medical Commitments" value={f.medical_commitments} />
        <Row label="Misc Notes" value={f.adviser_notes_misc} />
      </Section>
    </div>
  );
}
