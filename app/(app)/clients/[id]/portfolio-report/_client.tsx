// app/(app)/clients/[id]/portfolio-report/_client.tsx
// Portfolio Advisory Report — printable. Justifies the constructed portfolio and
// lets the adviser cite the prior advisory report(s) that preceded it.
"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";

interface GoalR { goal_name: string | null; target_year: number | null; priority: string | null;
  return_pct: number; years: number; fv: number; projected: number; gap: number; extraSip: number; fundedPct: number; }
interface PositionR { instrument_name: string; asset_class: string; category: string | null; bucket: string;
  allocation_pct: number; lumpsum_amount: number; monthly_sip: number; executed_lumpsum: number; executed_sip: number;
  current_value: number | null; status: string; }
interface GapClass { assetClass: string; targetPct: number; currentValue: number; currentPct: number; gapValue: number; }
interface Prereq { label: string; status: string; detail: string; }
interface PriorReport { id: string; docType: string; label: string; fileName: string | null; date: string; }
interface PriorSnap { id: string; note: string; profile: string | null; date: string; }

export interface PortfolioReportData {
  docId: string; today: string;
  client: { full_name: string; client_code: string | null; pan: string | null; age: number | null };
  firm: { firm_name: string | null; sebi_regn: string | null; advisor_name: string | null;
    address: string | null; phone: string | null; email: string | null };
  activeProfile: string; saaKey: string; isSaaOverridden: boolean;
  scores: { cap: number; tol: number; kn: number; total: number };
  saa: Record<string, number>;
  gapClasses: GapClass[]; totalCurrent: number;
  goalRows: GoalR[];
  positions: PositionR[]; totalDeploy: number; totalSip: number; totalExecuted: number;
  prerequisites: Prereq[];
  fp: { netWorth: number; income: number; emiToIncome: number | null; surplus: number | null };
  priorReports: PriorReport[]; priorSnapshots: PriorSnap[];
}

const AC_COLOR: Record<string, string> = {
  Equity: "#175A69", Debt: "#C39A38", Gold: "#B8860B",
  International: "#4A90C4", Hybrid: "#7B5EA7", Alternate: "#B4463C",
};

const CLASS_NOTES: Record<string, { cost: string; tax: string; liquidity: string }> = {
  Equity: {
    cost: "Prefer direct-plan equity funds (lower expense ratio); mind exit loads (~1% if < 1yr).",
    tax: "LTCG 12.5% above ₹1.25L/yr when held > 1yr; STCG 20%.",
    liquidity: "High — open-ended funds redeem in T+2/3; listed equity T+1.",
  },
  Debt: {
    cost: "Direct-plan debt funds; low expense; check exit loads on short-duration.",
    tax: "Gains at slab rate (debt MF bought after Apr-2023); FD interest at slab.",
    liquidity: "Moderate–high; liquid/overnight funds near-instant; FDs carry premature-withdrawal penalty.",
  },
  Gold: {
    cost: "SGB carries no expense; gold ETFs/funds have a small expense ratio.",
    tax: "SGB interest taxable, redemption gain exempt at maturity; ETF/fund gains at slab.",
    liquidity: "ETF high on-exchange; SGB has 5-yr lock (tradeable but thin).",
  },
  International: {
    cost: "Fund-of-fund expense plus underlying; direct plan preferred.",
    tax: "Taxed at slab (like debt) for post-Apr-2023 purchases.",
    liquidity: "Moderate; NAV can lag due to overseas market timing.",
  },
  Hybrid: {
    cost: "Direct-plan hybrid; single-fund diversification keeps cost low.",
    tax: "Per equity/debt orientation (≥ 65% equity → equity taxation).",
    liquidity: "High for open-ended hybrid funds.",
  },
  Alternate: {
    cost: "REIT/InvIT brokerage; AIF/PMS carry higher fees.",
    tax: "REIT/InvIT payouts are a mix (interest/dividend/return-of-capital); treatment varies.",
    liquidity: "Lower; listed REIT/InvIT moderate on-exchange.",
  },
};

function classKey(ac: string): keyof typeof CLASS_NOTES {
  const s = (ac ?? "").toLowerCase();
  if (/equity|stock/.test(s)) return "Equity";
  if (/debt|bond|fd|fixed|liquid|nps|ppf|epf/.test(s)) return "Debt";
  if (/gold/.test(s)) return "Gold";
  if (/intl|international|us |global|nasdaq/.test(s)) return "International";
  if (/hybrid|balanced|multi.?asset/.test(s)) return "Hybrid";
  return "Alternate";
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function pct(n: number | null | undefined, d = 0) {
  if (n == null) return "—";
  return `${n.toFixed(d)}%`;
}

function Section({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <div className="flex items-center gap-2.5 bg-[#0F3A46] text-white px-4 py-2.5 rounded-t-lg print:rounded-none border-b-2 border-[#C39A38]">
        <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded bg-[#C39A38] text-[#0F3A46] text-[11px] font-bold shrink-0">{num}</span>
        <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      </div>
      <div className="border border-t-0 border-[#CBD9DC] rounded-b-lg px-5 py-4">{children}</div>
    </section>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    "Met": ["#2E7D5B", "#E4F1EA"], "Partial": ["#9A7B1E", "#FBF3DA"], "Action needed": ["#B4463C", "#F8E7E4"],
  };
  const [fg, bg] = map[status] ?? ["#6B7E86", "#EEF4F5"];
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: fg, background: bg }}>{status}</span>;
}

export default function PortfolioReportClient({ d }: { d: PortfolioReportData }) {
  const [selDocs, setSelDocs] = useState<Set<string>>(new Set());
  const [selSnaps, setSelSnaps] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n);
  };

  const citedDocs = d.priorReports.filter(r => selDocs.has(r.id));
  const citedSnaps = d.priorSnapshots.filter(s => selSnaps.has(s.id));
  const nCited = citedDocs.length + citedSnaps.length;

  // Classes present in the constructed portfolio (for the cost/tax/liquidity block)
  const presentKeys = Array.from(new Set(d.positions.map(p => classKey(p.asset_class))));

  const footer = `${d.firm.firm_name ?? "Firm"}  ·  ${d.firm.sebi_regn ? "SEBI " + d.firm.sebi_regn : "SEBI Registered Investment Adviser"}  ·  Strictly Private & Confidential  ·  ${d.docId}`;

  return (
    <div>
      <style>{`
        #portfolio-report {
          font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
          color: #1F3A42; line-height: 1.5;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        #portfolio-report h1, #portfolio-report h2, #portfolio-report h3, #portfolio-report .font-serif {
          font-family: Georgia, "Times New Roman", "Noto Serif", serif;
        }
        #portfolio-report table, #portfolio-report td, #portfolio-report th { font-variant-numeric: tabular-nums; }
        .report-footer { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #portfolio-report, #portfolio-report * { visibility: visible !important; }
          #portfolio-report {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; margin: 0 !important; padding: 0 0 12mm 0 !important;
            border: none !important; border-radius: 0 !important;
          }
          section, .break-inside-avoid { break-inside: avoid; }
          .report-footer {
            display: flex !important; position: fixed; bottom: 0; left: 0; right: 0;
            justify-content: center; align-items: center; gap: 8px;
            font-size: 7.5pt; color: #6B7E86; background: #ffffff;
            border-top: 0.75pt solid #C39A38; padding: 3pt 1pt 0;
          }
          @page { size: A4; margin: 13mm 12mm 14mm 12mm; }
        }
      `}</style>

      {/* Action bar (screen only) */}
      <div className="flex items-center justify-between mb-4 gap-3 print:hidden">
        <button onClick={() => window.print()}
          className="px-4 py-2 bg-[#C39A38] text-[#0F3A46] text-sm font-semibold rounded-lg hover:bg-[#B08930]">
          🖨 Print / Save as PDF
        </button>
        {!d.firm.firm_name && (
          <div className="flex-1 bg-[#FEF9E7] border border-[#DFC97A] rounded-lg px-4 py-2 text-xs text-[#7D6B2E]">
            Firm details aren&apos;t set — <Link href="/settings" className="underline font-medium">add them in Firm Settings</Link> for the report letterhead.
          </div>
        )}
      </div>

      {/* Reference picker (screen only) */}
      <div className="mb-5 bg-white border border-[#CBD9DC] rounded-xl p-4 print:hidden">
        <p className="text-sm font-semibold text-[#0F3A46] mb-1">Reference previous advisory reports</p>
        <p className="text-xs text-[#6B7E86] mb-3">Tick the prior report(s) and change-events this portfolio follows from. Selected items are cited in Section 4 of the printed report.</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[#6B7E86] mb-1.5">Archived documents</p>
            {d.priorReports.length === 0 && <p className="text-xs text-[#A0AFBA]">No archived documents yet.</p>}
            <div className="space-y-1">
              {d.priorReports.map(r => (
                <label key={r.id} className="flex items-start gap-2 text-xs text-[#0F3A46] cursor-pointer">
                  <input type="checkbox" checked={selDocs.has(r.id)} onChange={() => toggle(selDocs, r.id, setSelDocs)} className="mt-0.5" />
                  <span><span className="font-medium">{r.label}</span> · <span className="text-[#6B7E86]">{r.date}</span>{r.fileName ? <span className="text-[#A0AFBA]"> · {r.fileName}</span> : null}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[#6B7E86] mb-1.5">Advice-basis change history</p>
            {d.priorSnapshots.length === 0 && <p className="text-xs text-[#A0AFBA]">No change-history snapshots yet.</p>}
            <div className="space-y-1">
              {d.priorSnapshots.map(s => (
                <label key={s.id} className="flex items-start gap-2 text-xs text-[#0F3A46] cursor-pointer">
                  <input type="checkbox" checked={selSnaps.has(s.id)} onChange={() => toggle(selSnaps, s.id, setSelSnaps)} className="mt-0.5" />
                  <span><span className="font-medium">{s.note}</span> · <span className="text-[#6B7E86]">{s.date}</span>{s.profile ? <span className="text-[#A0AFBA]"> · {s.profile}</span> : null}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ REPORT ═══ */}
      <div id="portfolio-report" className="bg-white border border-[#CBD9DC] rounded-xl p-8 space-y-6 print:border-0 print:rounded-none print:p-0">
        {/* Letterhead */}
        <div className="border-b-4 border-[#0F3A46] pb-4">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="font-serif text-2xl font-bold text-[#0F3A46]">{d.firm.firm_name ?? "[ Firm Name ]"}</h1>
              <p className="text-[11px] text-[#6B7E86] mt-0.5">
                SEBI Registered Investment Adviser · Regn. No.: {d.firm.sebi_regn ?? "INA_________"}<br />
                {d.firm.address ?? ""}{d.firm.phone ? " · " + d.firm.phone : ""}{d.firm.email ? " · " + d.firm.email : ""}
              </p>
            </div>
            <div className="text-right text-[11px] text-[#6B7E86]">
              {d.today}<br />
              Document ID: <span className="font-mono font-semibold text-[#0F3A46]">{d.docId}</span>
            </div>
          </div>
          <div className="mt-3 bg-[#0F3A46] text-white px-4 py-2 rounded-lg print:rounded-none flex items-center justify-between">
            <span className="font-serif text-base font-bold tracking-wide">Portfolio Advisory Report</span>
            <span className="text-[10px] uppercase tracking-widest text-[#CBD9DC]">Suitability &amp; rationale</span>
          </div>
          <div className="flex justify-between items-end mt-3">
            <p className="text-[#0F3A46]"><span className="text-[10px] uppercase tracking-widest text-[#6B7E86]">Prepared for</span><br /><span className="font-serif text-lg font-bold">{d.client.full_name}</span>{d.client.client_code ? <span className="text-[11px] text-[#6B7E86]"> · UCC {d.client.client_code}</span> : null}</p>
            <p className="text-right text-[10px] uppercase tracking-widest text-[#6B7E86]">Governing risk profile<br /><span className="normal-case tracking-normal text-sm font-semibold text-[#0F3A46]">{d.activeProfile}</span></p>
          </div>
        </div>

        {/* Intro */}
        <p className="text-xs text-[#0F3A46] leading-relaxed">
          This report sets out the rationale for the investment portfolio constructed for the client and its suitability against the
          assessed risk profile and financial goals. It is issued <span className="font-semibold">after</span> the foundational advice
          (protection, liquidity and debt actions) covered in the earlier advisory report(s) referenced in Section&nbsp;4, and should be
          read together with them.
        </p>

        {/* 1. Portfolio at a glance */}
        <Section num="1" title="Constructed portfolio at a glance">
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              ["To deploy (lumpsum)", fmt(d.totalDeploy)],
              ["Monthly SIP", fmt(d.totalSip)],
              ["Already executed", fmt(d.totalExecuted)],
              ["Current value", fmt(d.totalCurrent)],
            ].map(([k, v]) => (
              <div key={k} className="border border-[#CBD9DC] rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-[#6B7E86]">{k}</div>
                <div className="text-sm font-bold text-[#0F3A46]">{v}</div>
              </div>
            ))}
          </div>
          {d.positions.length === 0 ? (
            <p className="text-xs text-[#B4463C]">No portfolio positions have been constructed yet — build the portfolio in Portfolio Construction first.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6B7E86] border-b border-[#CBD9DC]">
                  <th className="text-left py-1.5">Instrument</th><th className="text-left">Class</th><th className="text-left">Bucket</th>
                  <th className="text-right">Alloc %</th><th className="text-right">Lumpsum</th><th className="text-right">SIP</th><th className="text-left pl-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.positions.map((p, i) => (
                  <tr key={i} className="border-b border-[#EEF4F5]">
                    <td className="py-1.5 text-[#0F3A46] font-medium">{p.instrument_name}{p.category ? <span className="text-[#A0AFBA]"> · {p.category}</span> : null}</td>
                    <td><span className="inline-block px-1.5 rounded text-white text-[10px]" style={{ background: AC_COLOR[classKey(p.asset_class)] ?? "#6B7E86" }}>{p.asset_class}</span></td>
                    <td className="text-[#6B7E86]">{p.bucket}</td>
                    <td className="text-right">{p.allocation_pct ? pct(p.allocation_pct, 1) : "—"}</td>
                    <td className="text-right">{p.lumpsum_amount ? fmt(p.lumpsum_amount) : "—"}</td>
                    <td className="text-right">{p.monthly_sip ? fmt(p.monthly_sip) : "—"}</td>
                    <td className="pl-2 text-[#6B7E86] capitalize">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* 2. Why this portfolio */}
        <Section num="2" title="Why this portfolio — profile, allocation & goals">
          <p className="text-xs text-[#0F3A46] mb-3">
            The client&apos;s governing risk profile is <span className="font-semibold">{d.activeProfile}</span> (suitability score {d.scores.total}/95:
            capacity {d.scores.cap}, tolerance {d.scores.tol}, knowledge {d.scores.kn}). The portfolio is built to the strategic asset
            allocation for this profile{d.isSaaOverridden ? " (adviser-adjusted)" : ""}, which balances growth against the client&apos;s ability and willingness to bear risk.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#6B7E86] mb-1">Strategic asset allocation ({d.saaKey})</p>
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(d.saa).filter(([, v]) => v > 0).map(([ac, v]) => (
                    <tr key={ac} className="border-b border-[#EEF4F5]">
                      <td className="py-1"><span className="inline-block px-1.5 rounded text-white text-[10px]" style={{ background: AC_COLOR[classKey(ac)] ?? "#6B7E86" }}>{ac}</span></td>
                      <td className="text-right font-medium text-[#0F3A46]">{pct(v, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#6B7E86] mb-1">Goals this portfolio funds</p>
              {d.goalRows.length === 0 ? <p className="text-xs text-[#A0AFBA]">No goals recorded.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="text-[#6B7E86] border-b border-[#CBD9DC]"><th className="text-left py-1">Goal</th><th className="text-right">By</th><th className="text-right">Funded</th><th className="text-right">Add&apos;l SIP</th></tr></thead>
                  <tbody>
                    {d.goalRows.map((g, i) => (
                      <tr key={i} className="border-b border-[#EEF4F5]">
                        <td className="py-1 text-[#0F3A46]">{g.goal_name}</td>
                        <td className="text-right text-[#6B7E86]">{g.target_year ?? "—"}</td>
                        <td className="text-right font-medium" style={{ color: g.fundedPct >= 80 ? "#2E7D5B" : g.fundedPct >= 50 ? "#9A7B1E" : "#B4463C" }}>{pct(g.fundedPct, 0)}</td>
                        <td className="text-right">{g.extraSip ? fmt(g.extraSip) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Section>

        {/* 2B Gap plan → holdings */}
        <Section num="3" title="From gap analysis to the actual holdings">
          <p className="text-xs text-[#0F3A46] mb-3">
            Each asset class is sized to its strategic target; the gap between the target and what the client already holds is what the
            new positions deploy. Positive gaps are funded by the lumpsum / SIP in Section&nbsp;1; negative gaps are trimmed or left to drift back on rebalancing.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#6B7E86] border-b border-[#CBD9DC]">
                <th className="text-left py-1.5">Asset class</th><th className="text-right">Target %</th><th className="text-right">Current %</th>
                <th className="text-right">Current ₹</th><th className="text-right">Gap to target ₹</th><th className="text-left pl-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {d.gapClasses.filter(g => g.targetPct > 0 || g.currentValue > 0).map((g, i) => (
                <tr key={i} className="border-b border-[#EEF4F5]">
                  <td className="py-1.5"><span className="inline-block px-1.5 rounded text-white text-[10px]" style={{ background: AC_COLOR[classKey(g.assetClass)] ?? "#6B7E86" }}>{g.assetClass}</span></td>
                  <td className="text-right">{pct(g.targetPct, 0)}</td>
                  <td className="text-right">{pct(g.currentPct, 0)}</td>
                  <td className="text-right">{fmt(g.currentValue)}</td>
                  <td className="text-right font-medium" style={{ color: g.gapValue > 0 ? "#2E7D5B" : g.gapValue < 0 ? "#B4463C" : "#6B7E86" }}>{g.gapValue > 0 ? "+" : ""}{fmt(g.gapValue)}</td>
                  <td className="pl-2 text-[#6B7E86]">{g.gapValue > 1 ? "Add / deploy" : g.gapValue < -1 ? "Trim / hold" : "On target"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* 2C Instrument, cost, tax, liquidity */}
        <Section num="4" title="Instrument selection — cost, tax & liquidity">
          {presentKeys.length === 0 ? (
            <p className="text-xs text-[#A0AFBA]">Instrument-level notes appear once positions are constructed.</p>
          ) : (
            <div className="space-y-2">
              {presentKeys.map(k => (
                <div key={k} className="border border-[#EEF4F5] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block px-1.5 rounded text-white text-[10px]" style={{ background: AC_COLOR[k] ?? "#6B7E86" }}>{k}</span>
                    <span className="text-[11px] text-[#6B7E86]">{d.positions.filter(p => classKey(p.asset_class) === k).map(p => p.instrument_name).join(", ")}</span>
                  </div>
                  <div className="grid md:grid-cols-3 gap-2 text-[11px] text-[#0F3A46]">
                    <p><span className="font-semibold">Cost:</span> {CLASS_NOTES[k].cost}</p>
                    <p><span className="font-semibold">Tax:</span> {CLASS_NOTES[k].tax}</p>
                    <p><span className="font-semibold">Liquidity:</span> {CLASS_NOTES[k].liquidity}</p>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-[#6B7E86] mt-1">Tax treatment is indicative under current Indian rules and depends on holding period and the client&apos;s slab; confirm at the time of transaction.</p>
            </div>
          )}
        </Section>

        {/* 2D Prerequisite prior actions */}
        <Section num="5" title="Foundational actions advised before investing (status)">
          <p className="text-xs text-[#0F3A46] mb-3">
            Portfolio construction assumes the protection and liquidity base recommended in the earlier advisory report is in place.
            Their current status:
          </p>
          <div className="space-y-2">
            {d.prerequisites.map((p, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-b border-[#EEF4F5] pb-2">
                <div>
                  <div className="text-xs font-medium text-[#0F3A46]">{p.label}</div>
                  <div className="text-[11px] text-[#6B7E86]">{p.detail}</div>
                </div>
                <StatusChip status={p.status} />
              </div>
            ))}
          </div>
        </Section>

        {/* 3. References to prior advisory reports */}
        <Section num="6" title="References to previous advisory report(s)">
          {nCited === 0 ? (
            <>
              <p className="text-xs text-[#6B7E86] print:hidden">No prior reports selected. Use the picker above to cite the advisory report(s) and change-events this portfolio follows from.</p>
              <p className="text-xs text-[#6B7E86] hidden print:block">No prior advisory reports were cited for this portfolio report.</p>
            </>
          ) : (
            <>
              <p className="text-xs text-[#0F3A46] mb-2">This portfolio advisory report is issued in continuation of, and should be read with, the following prior advice:</p>
              <table className="w-full text-xs">
                <thead><tr className="text-[#6B7E86] border-b border-[#CBD9DC]"><th className="text-left py-1.5">Reference</th><th className="text-left">Type</th><th className="text-right">Dated</th></tr></thead>
                <tbody>
                  {citedDocs.map(r => (
                    <tr key={r.id} className="border-b border-[#EEF4F5]">
                      <td className="py-1.5 text-[#0F3A46] font-medium">{r.label}{r.fileName ? <span className="text-[#A0AFBA] font-normal"> · {r.fileName}</span> : null}</td>
                      <td className="text-[#6B7E86]">Archived document</td>
                      <td className="text-right text-[#6B7E86]">{r.date}</td>
                    </tr>
                  ))}
                  {citedSnaps.map(s => (
                    <tr key={s.id} className="border-b border-[#EEF4F5]">
                      <td className="py-1.5 text-[#0F3A46] font-medium">{s.note}{s.profile ? <span className="text-[#A0AFBA] font-normal"> · {s.profile}</span> : null}</td>
                      <td className="text-[#6B7E86]">Advice-basis change</td>
                      <td className="text-right text-[#6B7E86]">{s.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        {/* Sign-off */}
        <div className="grid grid-cols-2 gap-8 pt-2 text-xs text-[#0F3A46]">
          <div>
            <div className="h-10 border-b border-[#0F3A46]" />
            <p className="mt-1">{d.firm.advisor_name ?? "Adviser"}{d.firm.sebi_regn ? " · " + d.firm.sebi_regn : ""}</p>
            <p className="text-[10px] text-[#6B7E86]">Investment Adviser</p>
          </div>
          <div>
            <div className="h-10 border-b border-[#0F3A46]" />
            <p className="mt-1">{d.client.full_name}</p>
            <p className="text-[10px] text-[#6B7E86]">Client acknowledgement</p>
          </div>
        </div>
        <p className="text-[10px] text-[#6B7E86] leading-relaxed border-t border-[#EEF4F5] pt-2">
          This report is a suitability rationale for the constructed portfolio and does not guarantee returns. Investments are subject to
          market risk. Figures are indicative and based on data on record as at {d.today}. Read with the referenced advisory report(s) and the scheme documents.
        </p>
      </div>

      <div className="report-footer">{footer}</div>
    </div>
  );
}
