// app/(app)/clients/[id]/advisory-report/_client.tsx — detailed audit-compliant advisory report
"use client";
import { useState } from "react";
import Link from "next/link";

interface GoalRowD {
  goal_name: string | null; target_year: number | null; cost_today: number | null;
  priority: string | null; inflation_pct: number; return_pct: number;
  years: number; fv: number; projected: number; gap: number;
  extraSip: number; lumpsumNow: number; liveSaved: number; liveSip: number; fundedPct: number;
}
interface PositionD {
  instrument_name: string; asset_class: string; category: string | null; bucket: string;
  allocation_pct: number; lumpsum_amount: number; monthly_sip: number;
  executed_lumpsum: number; executed_sip: number; current_value: number | null; status: string;
}
interface ReportData {
  docId: string; today: string; nextReviewDefault: string;
  client: { full_name: string; client_code: string | null; dob: string | null; age: number | null;
    gender: string | null; marital_status: string | null; occupation: string | null; pan: string | null;
    email: string | null; phone: string | null; dependants_detail: string | null; address: string | null;
    residential_status: string | null; client_type: string | null; };
  facts: { income_self: number; income_spouse: number; income_other: number; expenses_annual: number;
    retirement_age: number | null; life_cover: number; health_cover: number;
    will_status: string | null; pep: string | null; fatca: string | null; };
  scores: { cap: number; tol: number; kn: number; total: number; answered: number };
  analysis: { engineProfile: string; activeProfile: string; isOverridden: boolean;
    capR: number; tolR: number; govR: number; yearsToRetirement: number | null;
    flags: { name: string; val: string; why: string }[]; okFlags: number; };
  fp: { totalAssets: number; totalDebt: number; netWorth: number; income: number };
  saa: Record<string, number>;
  isSaaOverridden: boolean;
  gapClasses: { assetClass: string; targetPct: number; currentValue: number; currentPct: number; gapValue: number }[];
  totalCurrent: number;
  goalRows: GoalRowD[]; totalExtraSip: number; totalLumpsumNow: number;
  positions: PositionD[];
  notes: { what_it_means: string; why_this_mix: string; deployment_plan: string;
    conflicts: string; additional_comments: string; next_review_date: string; };
  firm: { advisor_name: string | null; firm_name: string | null; sebi_regn: string | null;
    address: string | null; phone: string | null; email: string | null; };
  adviserEmail: string;
}

const AC_COLOR: Record<string, string> = {
  Equity: "#175A69", Debt: "#C39A38", Gold: "#B8860B",
  International: "#4A90C4", Hybrid: "#7B5EA7", Alternate: "#B4463C",
};
const PROFILE_BG: Record<string, string> = {
  "Conservative": "#2E7D5B", "Moderately Conservative": "#3A7A50",
  "Balanced / Moderate": "#C39A38", "Moderately Aggressive": "#B4723C", "Aggressive": "#B4463C",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <div className="bg-[#0F3A46] text-white px-4 py-2 rounded-t-lg print:rounded-none">
        <h2 className="text-sm font-semibold">{num}.  {title}</h2>
      </div>
      <div className="border border-t-0 border-[#CBD9DC] rounded-b-lg px-5 py-4">{children}</div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-[#EEF4F5] py-1">
      <span className="text-xs text-[#6B7E86]">{k}</span>
      <span className="text-xs font-medium text-[#0F3A46] text-right">{v}</span>
    </div>
  );
}

export default function AdvisoryReportClient({ clientId, data }: { clientId: string; data: ReportData }) {
  const d = data;
  const [notes, setNotes] = useState(d.notes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setN = (k: keyof typeof notes) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setNotes(p => ({ ...p, [k]: e.target.value })); setSaved(false);
  };

  const saveNotes = async () => {
    setSaving(true);
    await fetch(`/api/clients/${clientId}/report-notes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(notes),
    });
    setSaving(false); setSaved(true);
  };

  const profColor = PROFILE_BG[d.analysis.activeProfile] ?? "#175A69";
  const income = d.facts.income_self + d.facts.income_spouse + d.facts.income_other;
  const surplus = income - d.facts.expenses_annual;
  const savingsRate = income > 0 ? Math.round(surplus / income * 100) : 0;
  const debtToAssets = d.fp.totalAssets > 0 ? Math.round(d.fp.totalDebt / d.fp.totalAssets * 100) : 0;

  const openPositions = d.positions.filter(p => p.status !== "executed");
  const execPositions = d.positions.filter(p => p.status === "executed");
  const propLump = openPositions.reduce((s, p) => s + p.lumpsum_amount, 0);
  const propSip  = openPositions.reduce((s, p) => s + p.monthly_sip, 0);
  const execLump = execPositions.reduce((s, p) => s + p.executed_lumpsum, 0);
  const execSip  = execPositions.reduce((s, p) => s + p.executed_sip, 0);

  const NComment = ({ label, field, ph }: { label: string; field: keyof typeof notes; ph: string }) => (
    <div className="mt-3">
      <p className="text-xs font-semibold text-[#175A69] mb-1">✎ Adviser comment — {label}</p>
      <textarea value={notes[field] as string} onChange={setN(field)} rows={2} placeholder={ph}
        className="w-full border border-dashed border-[#A0C4CE] bg-[#FBFDFD] rounded-lg px-3 py-2 text-xs text-[#0F3A46] outline-none focus:border-[#175A69] resize-y print:border-solid print:border-[#CBD9DC]" />
    </div>
  );

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-5 gap-3 print:hidden">
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="px-4 py-2 bg-[#C39A38] text-[#0F3A46] text-sm font-semibold rounded-lg hover:bg-[#B08930]">
            🖨 Print / Save as PDF
          </button>
          <button onClick={saveNotes} disabled={saving}
            className="px-4 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
            {saving ? "Saving…" : saved ? "✓ Comments saved" : "Save adviser comments"}
          </button>
        </div>
        {!d.firm.firm_name && (
          <div className="flex-1 bg-[#FEF9E7] border border-[#DFC97A] rounded-lg px-4 py-2 text-xs text-[#7D6B2E]">
            Firm details aren&apos;t set — <Link href="/settings" className="underline font-medium">add them in Firm Settings</Link> for the report letterhead.
          </div>
        )}
      </div>

      {/* ═══ REPORT ═══ */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 space-y-6 print:border-0 print:rounded-none print:p-0">

        {/* Letterhead */}
        <div className="border-b-4 border-[#0F3A46] pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="font-serif text-2xl font-bold text-[#0F3A46]">{d.firm.firm_name ?? "[ Firm Name ]"}</h1>
              <p className="text-xs text-[#6B7E86] mt-1">
                SEBI Registered Investment Adviser · Regn. No.: {d.firm.sebi_regn ?? "INA_________"}<br/>
                {d.firm.address ?? "[ Registered Office Address ]"} · {d.firm.phone ?? "[Phone]"} · {d.firm.email ?? "[Email]"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-[#C39A38]">INVESTMENT ADVISORY REPORT</p>
              <p className="text-[10px] text-[#6B7E86] mt-1">
                Document ID: <span className="font-mono font-semibold text-[#0F3A46]">{d.docId}</span><br/>
                Date: {d.today} · Status: CONFIDENTIAL
              </p>
            </div>
          </div>
          <p className="text-[10px] text-[#6B7E86] mt-3">
            Prepared pursuant to the SEBI (Investment Advisers) Regulations, 2013 — risk profiling (Reg. 16) and suitability (Reg. 17).
          </p>
        </div>

        {/* 1 · Executive summary */}
        <Section num="1" title="EXECUTIVE SUMMARY">
          <div className="grid grid-cols-4 gap-3 mb-2">
            <div className="rounded-lg p-3 text-white text-center" style={{ background: profColor }}>
              <div className="text-[10px] opacity-80 mb-1">RISK PROFILE</div>
              <div className="text-sm font-bold leading-tight">{d.analysis.activeProfile}</div>
              {d.analysis.isOverridden && <div className="text-[9px] mt-1 opacity-90">adviser override (engine: {d.analysis.engineProfile})</div>}
            </div>
            <div className="bg-[#F5F9FA] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#6B7E86] mb-1">RISK SCORE</div>
              <div className="text-sm font-bold text-[#0F3A46]">{d.scores.total} / 95</div>
              <div className="text-[9px] text-[#6B7E86] mt-1">{d.scores.answered}/19 answered</div>
            </div>
            <div className="bg-[#F5F9FA] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#6B7E86] mb-1">NET WORTH</div>
              <div className="text-sm font-bold text-[#0F3A46]">{fmt(d.fp.netWorth)}</div>
              <div className="text-[9px] text-[#6B7E86] mt-1">assets {fmt(d.fp.totalAssets)} − debt {fmt(d.fp.totalDebt)}</div>
            </div>
            <div className="bg-[#F5F9FA] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#6B7E86] mb-1">GOALS FUNDING GAP</div>
              <div className="text-sm font-bold" style={{ color: d.totalExtraSip > 0 ? "#B4463C" : "#2E7D5B" }}>
                {d.totalExtraSip > 0 ? `${fmt(d.totalExtraSip)}/mo` : "On track ✓"}
              </div>
              <div className="text-[9px] text-[#6B7E86] mt-1">{d.totalLumpsumNow > 0 ? `or ${fmt(d.totalLumpsumNow)} lumpsum today` : ""}</div>
            </div>
          </div>
          <NComment label="What this means for the client" field="what_it_means"
            ph="Summarise in plain language what the profile and financial position mean for this client…" />
        </Section>

        {/* 2 · Client details */}
        <Section num="2" title="CLIENT DETAILS & KYC">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <KV k="Full name" v={d.client.full_name} />
              <KV k="Client code (UCC)" v={d.client.client_code ?? "—"} />
              <KV k="PAN" v={d.client.pan ?? "—"} />
              <KV k="Date of birth / Age" v={`${d.client.dob ? new Date(d.client.dob).toLocaleDateString("en-IN") : "—"} · ${d.client.age ?? "—"} yrs`} />
              <KV k="Gender / Marital status" v={`${d.client.gender ?? "—"} / ${d.client.marital_status ?? "—"}`} />
              <KV k="Occupation" v={d.client.occupation ?? "—"} />
            </div>
            <div>
              <KV k="Contact" v={`${d.client.phone ?? "—"} · ${d.client.email ?? "—"}`} />
              <KV k="Client type / Residency" v={`${d.client.client_type ?? "Individual"} / ${d.client.residential_status ?? "Resident Indian"}`} />
              <KV k="Dependants" v={d.client.dependants_detail ?? "—"} />
              <KV k="PEP status" v={d.facts.pep ?? "No"} />
              <KV k="FATCA declaration" v={d.facts.fatca ?? "No"} />
              <KV k="Will status" v={d.facts.will_status ?? "—"} />
            </div>
          </div>
        </Section>

        {/* 3 · Risk profile analysis */}
        <Section num="3" title="RISK PROFILE ANALYSIS">
          <table className="w-full text-xs mb-2">
            <thead><tr className="bg-[#F5F9FA] text-[#6B7E86]">
              <th className="text-left px-3 py-1.5 font-medium">Dimension</th>
              <th className="text-right px-3 py-1.5 font-medium">Score</th>
              <th className="text-right px-3 py-1.5 font-medium">Band (1–5)</th>
              <th className="text-left px-3 py-1.5 font-medium">Interpretation</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-[#EEF4F5]">
                <td className="px-3 py-1.5 font-medium text-[#0F3A46]">Risk Capacity (ability)</td>
                <td className="px-3 py-1.5 text-right">{d.scores.cap} / 40</td>
                <td className="px-3 py-1.5 text-right font-semibold">{d.analysis.capR}</td>
                <td className="px-3 py-1.5 text-[#6B7E86]">Financial ability to absorb losses</td>
              </tr>
              <tr className="border-b border-[#EEF4F5]">
                <td className="px-3 py-1.5 font-medium text-[#0F3A46]">Risk Tolerance (willingness)</td>
                <td className="px-3 py-1.5 text-right">{d.scores.tol} / 35</td>
                <td className="px-3 py-1.5 text-right font-semibold">{d.analysis.tolR}</td>
                <td className="px-3 py-1.5 text-[#6B7E86]">Psychological comfort with volatility</td>
              </tr>
              <tr className="border-b border-[#EEF4F5]">
                <td className="px-3 py-1.5 font-medium text-[#0F3A46]">Knowledge & Experience</td>
                <td className="px-3 py-1.5 text-right">{d.scores.kn} / 20</td>
                <td className="px-3 py-1.5 text-right">—</td>
                <td className="px-3 py-1.5 text-[#6B7E86]">Familiarity with investment products</td>
              </tr>
              <tr className="bg-[#F5F9FA] font-semibold">
                <td className="px-3 py-1.5 text-[#0F3A46]">Governing profile (min of capacity, tolerance)</td>
                <td className="px-3 py-1.5 text-right">{d.scores.total} / 95</td>
                <td className="px-3 py-1.5 text-right">{d.analysis.govR}</td>
                <td className="px-3 py-1.5" style={{ color: profColor }}>{d.analysis.activeProfile}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-[#6B7E86]">
            The governing profile takes the LOWER of capacity and tolerance — advice must never exceed what the client can afford, even if willing.
            {d.analysis.isOverridden && <> <strong className="text-[#B4463C]">Adviser override applied</strong> — engine derived &quot;{d.analysis.engineProfile}&quot;; the adviser has set &quot;{d.analysis.activeProfile}&quot; (rationale must be documented below).</>}
            {d.analysis.yearsToRetirement != null && <> Years to retirement: <strong>{d.analysis.yearsToRetirement}</strong>.</>}
          </p>
        </Section>

        {/* 4 · Red flags */}
        <Section num="4" title={`RISK OBSERVATIONS & RED FLAGS (${d.analysis.flags.length} flagged · ${d.analysis.okFlags} clear)`}>
          {d.analysis.flags.length === 0 ? (
            <p className="text-xs text-[#2E7D5B] font-medium">✓ No red flags identified across liquidity, protection, leverage and concentration checks.</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="bg-[#FDF2F1] text-[#B4463C]">
                <th className="text-left px-3 py-1.5 font-medium">Flag</th>
                <th className="text-left px-3 py-1.5 font-medium">Value</th>
                <th className="text-left px-3 py-1.5 font-medium">Why it matters</th>
              </tr></thead>
              <tbody>
                {d.analysis.flags.map((f, i) => (
                  <tr key={i} className="border-b border-[#F6E4E2]">
                    <td className="px-3 py-1.5 font-medium text-[#B4463C]">⚠ {f.name}</td>
                    <td className="px-3 py-1.5 text-[#0F3A46]">{f.val}</td>
                    <td className="px-3 py-1.5 text-[#6B7E86]">{f.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <NComment label="Risk mitigation advice" field="conflicts"
            ph="Address each flag: emergency fund plan, insurance gap actions, debt restructuring advice…" />
        </Section>

        {/* 5 · Financial position */}
        <Section num="5" title="CURRENT FINANCIAL POSITION">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <KV k="Gross annual income (household)" v={fmt(income)} />
              <KV k="— Self" v={fmt(d.facts.income_self)} />
              <KV k="— Spouse / other" v={fmt(d.facts.income_spouse + d.facts.income_other)} />
              <KV k="Annual expenses" v={fmt(d.facts.expenses_annual)} />
              <KV k="Annual surplus" v={`${fmt(surplus)} (${savingsRate}% savings rate)`} />
            </div>
            <div>
              <KV k="Total assets" v={fmt(d.fp.totalAssets)} />
              <KV k="Total liabilities" v={fmt(d.fp.totalDebt)} />
              <KV k="Net worth" v={fmt(d.fp.netWorth)} />
              <KV k="Debt-to-assets" v={`${debtToAssets}%`} />
              <KV k="Life / Health cover" v={`${fmt(d.facts.life_cover)} / ${fmt(d.facts.health_cover)}`} />
            </div>
          </div>
          <div className="mt-2 bg-[#F5F9FA] rounded-lg px-3 py-2">
            <p className="text-[10px] text-[#6B7E86]">
              Live portfolio tracked on platform: <strong className="text-[#0F3A46]">{fmt(d.totalCurrent)}</strong> current value
              {execSip > 0 && <> · executed SIP <strong className="text-[#0F3A46]">{fmt(execSip)}/mo</strong></>}
            </p>
          </div>
        </Section>

        {/* 6 · Goals */}
        <Section num="6" title="FINANCIAL GOALS & FUNDING ANALYSIS (dynamic — includes live portfolio)">
          {d.goalRows.length === 0 ? <p className="text-xs text-[#6B7E86]">No goals recorded.</p> : (
            <>
              <table className="w-full text-[10px]">
                <thead><tr className="bg-[#F5F9FA] text-[#6B7E86]">
                  <th className="text-left px-2 py-1.5 font-medium">Goal</th>
                  <th className="text-right px-2 py-1.5 font-medium">Year</th>
                  <th className="text-right px-2 py-1.5 font-medium">Cost today</th>
                  <th className="text-right px-2 py-1.5 font-medium">Future cost</th>
                  <th className="text-right px-2 py-1.5 font-medium">Projected corpus</th>
                  <th className="text-right px-2 py-1.5 font-medium">Funded</th>
                  <th className="text-right px-2 py-1.5 font-medium">Extra SIP req.</th>
                  <th className="text-right px-2 py-1.5 font-medium">OR lumpsum today</th>
                </tr></thead>
                <tbody>
                  {d.goalRows.map((g, i) => (
                    <tr key={i} className="border-b border-[#EEF4F5]">
                      <td className="px-2 py-1.5 font-medium text-[#0F3A46]">{g.goal_name ?? `Goal ${i+1}`}{g.priority ? ` (${g.priority})` : ""}</td>
                      <td className="px-2 py-1.5 text-right">{g.target_year ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(g.cost_today)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(g.fv)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(g.projected)}{g.liveSaved > 0 && <span className="text-[#175A69]"> *</span>}</td>
                      <td className="px-2 py-1.5 text-right font-semibold" style={{ color: g.fundedPct >= 90 ? "#2E7D5B" : g.fundedPct >= 50 ? "#C39A38" : "#B4463C" }}>{g.fundedPct}%</td>
                      <td className="px-2 py-1.5 text-right font-semibold" style={{ color: g.extraSip > 0 ? "#B4463C" : "#2E7D5B" }}>{g.extraSip > 0 ? fmt(g.extraSip) + "/mo" : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-[#8A6D1C]">{g.lumpsumNow > 0 ? fmt(g.lumpsumNow) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#F5F9FA] font-bold">
                    <td className="px-2 py-1.5 text-[#0F3A46]" colSpan={6}>TOTAL REQUIRED TO FUND ALL GOALS</td>
                    <td className="px-2 py-1.5 text-right text-[#B4463C]">{d.totalExtraSip > 0 ? fmt(d.totalExtraSip) + "/mo" : "—"}</td>
                    <td className="px-2 py-1.5 text-right text-[#8A6D1C]">{d.totalLumpsumNow > 0 ? fmt(d.totalLumpsumNow) : "—"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[9px] text-[#6B7E86] mt-1.5">
                * Projected corpus includes live portfolio value & executed SIPs apportioned to the goal. Assumptions per goal: inflation {d.goalRows[0]?.inflation_pct ?? 6}% p.a. (unless specified), return per goal&apos;s assumption. &quot;Extra SIP&quot; and &quot;Lumpsum today&quot; are alternative routes to close the same funding gap.
              </p>
            </>
          )}
        </Section>

        {/* 7 · Asset allocation */}
        <Section num="7" title={`RECOMMENDED STRATEGIC ASSET ALLOCATION${d.isSaaOverridden ? " (adviser-customised)" : ""}`}>
          <table className="w-full text-xs mb-2">
            <thead><tr className="bg-[#F5F9FA] text-[#6B7E86]">
              <th className="text-left px-3 py-1.5 font-medium">Asset class</th>
              <th className="text-right px-3 py-1.5 font-medium">Target %</th>
              <th className="text-right px-3 py-1.5 font-medium">Current value</th>
              <th className="text-right px-3 py-1.5 font-medium">Current %</th>
              <th className="text-right px-3 py-1.5 font-medium">Gap to target</th>
            </tr></thead>
            <tbody>
              {d.gapClasses.map(g => (
                <tr key={g.assetClass} className="border-b border-[#EEF4F5]">
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: AC_COLOR[g.assetClass] ?? "#999" }} />
                      <span className="font-medium text-[#0F3A46]">{g.assetClass}</span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold">{g.targetPct}%</td>
                  <td className="px-3 py-1.5 text-right">{fmt(g.currentValue)}</td>
                  <td className="px-3 py-1.5 text-right">{d.totalCurrent > 0 ? g.currentPct + "%" : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-medium" style={{ color: g.gapValue > 0 ? "#B4463C" : "#2E7D5B" }}>
                    {g.gapValue === 0 ? "—" : (g.gapValue > 0 ? "▼ short " : "▲ over ") + fmt(Math.abs(g.gapValue))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <NComment label="Why this asset mix" field="why_this_mix"
            ph="Rationale: risk profile, time horizons of goals, current market context, tax considerations…" />
        </Section>

        {/* 8 · Proposed portfolio */}
        <Section num="8" title="PROPOSED PORTFOLIO & IMPLEMENTATION STATUS">
          {d.positions.length === 0 ? <p className="text-xs text-[#6B7E86]">No portfolio constructed yet — see Portfolio Construction.</p> : (
            <>
              <table className="w-full text-[10px]">
                <thead><tr className="bg-[#F5F9FA] text-[#6B7E86]">
                  <th className="text-left px-2 py-1.5 font-medium">Instrument</th>
                  <th className="text-left px-2 py-1.5 font-medium">Class</th>
                  <th className="text-right px-2 py-1.5 font-medium">Alloc %</th>
                  <th className="text-right px-2 py-1.5 font-medium">Proposed lump</th>
                  <th className="text-right px-2 py-1.5 font-medium">Proposed SIP</th>
                  <th className="text-right px-2 py-1.5 font-medium">Executed lump</th>
                  <th className="text-right px-2 py-1.5 font-medium">Executed SIP</th>
                  <th className="text-center px-2 py-1.5 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {d.positions.map((p, i) => (
                    <tr key={i} className="border-b border-[#EEF4F5]">
                      <td className="px-2 py-1.5 font-medium text-[#0F3A46]">{p.instrument_name}</td>
                      <td className="px-2 py-1.5">{p.asset_class}{p.category ? ` · ${p.category}` : ""}</td>
                      <td className="px-2 py-1.5 text-right">{p.allocation_pct}%</td>
                      <td className="px-2 py-1.5 text-right">{p.lumpsum_amount > 0 ? fmt(p.lumpsum_amount) : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{p.monthly_sip > 0 ? fmt(p.monthly_sip) + "/mo" : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{p.executed_lumpsum > 0 ? fmt(p.executed_lumpsum) : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{p.executed_sip > 0 ? fmt(p.executed_sip) + "/mo" : "—"}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={"px-1.5 py-0.5 rounded-full font-medium " + (p.status === "executed" ? "bg-[#E8F4EE] text-[#1A5C3A]" : "bg-[#F5F9FA] text-[#6B7E86]")}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div className="bg-[#F5F9FA] rounded px-2 py-1.5 text-[10px]"><span className="text-[#6B7E86]">Proposed lump: </span><strong className="text-[#0F3A46]">{fmt(propLump)}</strong></div>
                <div className="bg-[#F5F9FA] rounded px-2 py-1.5 text-[10px]"><span className="text-[#6B7E86]">Proposed SIP: </span><strong className="text-[#0F3A46]">{fmt(propSip)}/mo</strong></div>
                <div className="bg-[#E8F4EE] rounded px-2 py-1.5 text-[10px]"><span className="text-[#6B7E86]">Executed lump: </span><strong className="text-[#1A5C3A]">{fmt(execLump)}</strong></div>
                <div className="bg-[#E8F4EE] rounded px-2 py-1.5 text-[10px]"><span className="text-[#6B7E86]">Executed SIP: </span><strong className="text-[#1A5C3A]">{fmt(execSip)}/mo</strong></div>
              </div>
            </>
          )}
          <NComment label="Deployment plan" field="deployment_plan"
            ph="How and when to deploy: lumpsum vs STP schedule, SIP start dates, order of execution…" />
        </Section>

        {/* 9 · Investment requirement summary */}
        <Section num="9" title="INVESTMENT REQUIREMENT SUMMARY">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[#E4B3AE] bg-[#FFF7F6] rounded-lg p-4">
              <p className="text-xs font-semibold text-[#B4463C] mb-1">Route A — Monthly SIP</p>
              <p className="text-xl font-bold text-[#B4463C]">{d.totalExtraSip > 0 ? fmt(d.totalExtraSip) + "/mo" : "Nil"}</p>
              <p className="text-[10px] text-[#6B7E86] mt-1">Additional SIP (over current commitments) required to fund all goals by their target dates, deployed as per the SAA in Section 7.</p>
            </div>
            <div className="border border-[#E3D3A8] bg-[#FFFBF2] rounded-lg p-4">
              <p className="text-xs font-semibold text-[#8A6D1C] mb-1">Route B — One-time lumpsum today</p>
              <p className="text-xl font-bold text-[#8A6D1C]">{d.totalLumpsumNow > 0 ? fmt(d.totalLumpsumNow) : "Nil"}</p>
              <p className="text-[10px] text-[#6B7E86] mt-1">Single investment today (at each goal&apos;s return assumption) that closes the same funding gap. Any combination of A and B pro-rata is equally valid.</p>
            </div>
          </div>
        </Section>

        {/* 10 · Adviser remarks + review */}
        <Section num="10" title="ADVISER REMARKS & NEXT REVIEW">
          <NComment label="Additional remarks" field="additional_comments"
            ph="Any other observations, client-specific constraints, product suitability notes, disclosures of conflicts of interest…" />
          <div className="flex items-center gap-3 mt-3">
            <label className="text-xs font-medium text-[#0F3A46]">Next scheduled review date:</label>
            <input type="date" value={notes.next_review_date} onChange={setN("next_review_date")}
              className="border border-[#CBD9DC] rounded-lg px-3 py-1.5 text-xs text-[#0F3A46] outline-none" />
            <span className="text-[10px] text-[#6B7E86]">(SEBI requires review at least annually or upon material change)</span>
          </div>
        </Section>

        {/* 11 · Disclosures & signatures */}
        <Section num="11" title="DISCLOSURES, DECLARATION & SIGNATURES">
          <div className="text-[9px] text-[#6B7E86] space-y-1.5 mb-4">
            <p><strong className="text-[#0F3A46]">Disclosures:</strong> This report is prepared based on information provided by the client in the risk profiling questionnaire and subsequent updates. Projections use assumed rates of return and inflation which are indicative only — actual outcomes will differ. Investments in securities markets are subject to market risks; read all scheme-related documents carefully. Past performance is not indicative of future returns. The adviser confirms this advice has been assessed for suitability against the client&apos;s risk profile under Regulation 17 of the SEBI (IA) Regulations, 2013.</p>
            <p><strong className="text-[#0F3A46]">Client acknowledgement:</strong> I/We confirm having read and understood this report, including the risk profile assessment, recommended allocation and the assumptions used. I/We have had the opportunity to seek clarifications.</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-[#CBD9DC] rounded-lg p-4 bg-[#FAFCFC]">
              <p className="text-[10px] font-bold text-[#0F3A46] mb-6">CLIENT SIGNATURE</p>
              <div className="border-t border-[#6B7E86] pt-1.5">
                <p className="text-[10px] text-[#0F3A46]">{d.client.full_name} · {d.client.client_code ?? ""}</p>
                <p className="text-[9px] text-[#6B7E86]">Date: ____________  Place: ____________</p>
              </div>
            </div>
            <div className="border border-[#CBD9DC] rounded-lg p-4 bg-[#FAFCFC]">
              <p className="text-[10px] font-bold text-[#0F3A46] mb-6">INVESTMENT ADVISER</p>
              <div className="border-t border-[#6B7E86] pt-1.5">
                <p className="text-[10px] text-[#0F3A46]">{d.firm.advisor_name ?? "[Adviser Name]"} · {d.firm.sebi_regn ?? "INA_________"}</p>
                <p className="text-[9px] text-[#6B7E86]">Date: ____________  Place: ____________</p>
              </div>
            </div>
          </div>
        </Section>

        {/* Audit footer */}
        <div className="border-t-2 border-[#0F3A46] pt-3 flex justify-between items-center">
          <p className="text-[8px] text-[#6B7E86]">
            Document ID: <span className="font-mono">{d.docId}</span> · Generated: {d.today} · Prepared by: {d.adviserEmail} · UCC: {d.client.client_code ?? "—"}<br/>
            System-generated from questionnaire data, live portfolio records and adviser inputs — Fiduciary Cloud · CONFIDENTIAL — for the named client only.
          </p>
          <p className="text-[8px] text-[#6B7E86] text-right">Next review: {notes.next_review_date || d.nextReviewDefault}</p>
        </div>
      </div>
    </div>
  );
}
