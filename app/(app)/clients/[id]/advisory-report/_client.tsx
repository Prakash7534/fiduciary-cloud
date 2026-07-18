// app/(app)/clients/[id]/advisory-report/_client.tsx
"use client";
import Link from "next/link";

interface ReportData {
  client: { full_name: string; dob: string | null; age: number | null; gender: string | null; marital_status: string | null; occupation: string | null; pan: string | null; email: string | null; phone: string | null; dependants_detail: string | null; };
  facts: { income_self: number | null; income_spouse: number | null; income_other: number | null; expenses_annual: number | null; retirement_age: number | null; };
  scores: { cap: number; tol: number; kn: number; total: number; };
  analysis: { finalProfile: string; govR: number; capCategory?: string; tolCategory?: string; yearsToRetirement: number | null; flags: { name: string; why: string }[]; };
  fp: { totalAssets: number; totalDebt: number; netWorth: number; income: number; };
  alloc: { label: string; pct: number; desc: string }[];
  goals: { goal_name: string | null; target_year: number | null; cost_today: number | null }[];
  firm: { advisor_name: string | null; firm_name: string | null; sebi_regn: string | null; address: string | null; phone: string | null; email: string | null; };
  hasFirm: boolean;
  today: string;
  nextReviewStr: string;
  fmt_income: string;
  fmt_assets: string;
  fmt_debt: string;
  fmt_nw: string;
}

function Row({ label, value, right }: { label: string; value: string; right?: boolean }) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className={`py-1.5 text-sm text-[#6B7E86] ${right ? "pl-8" : ""}`}>{label}</td>
      <td className="py-1.5 text-sm text-[#0F3A46] font-medium text-right">{value}</td>
    </tr>
  );
}

const PROFILE_BG: Record<string, string> = {
  "Conservative":            "#2E7D5B",
  "Moderately Conservative": "#3A7A50",
  "Balanced / Moderate":     "#C39A38",
  "Moderately Aggressive":   "#B4723C",
  "Aggressive":              "#B4463C",
};

const CAT_BANDS = [
  { range: "19 – 33", cat: "Conservative",            eq: "0–20% equity" },
  { range: "34 – 47", cat: "Moderately Conservative", eq: "20–40% equity" },
  { range: "48 – 61", cat: "Balanced / Moderate",     eq: "40–60% equity" },
  { range: "62 – 76", cat: "Moderately Aggressive",   eq: "60–80% equity" },
  { range: "77 – 95", cat: "Aggressive",              eq: "80–100% equity" },
];

export default function AdvisoryReportClient({ data }: { data: ReportData }) {
  const { client, facts, scores, analysis, fp, alloc, goals, firm, hasFirm, today, nextReviewStr } = data;
  const profileColor = PROFILE_BG[analysis.finalProfile] ?? "#175A69";
  const totalScore = scores.total;
  const activeband = CAT_BANDS.find(b => {
    const [lo, hi] = b.range.split("–").map(s => parseInt(s.trim()));
    return totalScore >= lo && totalScore <= hi;
  });

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-5 gap-3 print:hidden">
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[#C39A38] text-white text-sm font-medium rounded-lg hover:bg-[#a8832e] transition-colors"
          >
            Print / Save as PDF
          </button>
        </div>
        {!hasFirm && (
          <div className="flex-1 bg-[#FEF9E7] border border-[#DFC97A] rounded-lg px-4 py-2 text-xs text-[#7D6B2E]">
            Firm details aren&apos;t set yet —{" "}
            <Link href="/settings" className="underline font-medium">add them in Firm Settings</Link>
            {" "}so this report shows your actual name and SEBI registration instead of placeholders.
          </div>
        )}
      </div>

      {/* ===== PRINTABLE REPORT ===== */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 space-y-8 print:border-0 print:rounded-none print:p-0 print:shadow-none" id="advisory-report">

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[#0F3A46] pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F3A46]">Investment Advisory Report</h1>
            <p className="text-xs text-[#6B7E86] mt-1">Risk Profile Assessment · Suitability Review · Recommended Plan</p>
          </div>
          <div className="text-right text-xs text-[#6B7E86] space-y-0.5">
            <div className="font-semibold text-sm text-[#0F3A46]">{firm.firm_name ?? firm.advisor_name ?? "[Advisor / Firm Name]"}</div>
            <div>SEBI Registered Investment Adviser — Regn. No. {firm.sebi_regn ?? "[INA________]"}</div>
            {firm.address && <div>{firm.address}</div>}
            <div>{[firm.phone, firm.email].filter(Boolean).join(" · ") || "[Phone] · [Email]"}</div>
          </div>
        </div>

        {/* Meta table */}
        <div className="grid grid-cols-2 gap-x-8">
          <table className="w-full"><tbody>
            <Row label="Prepared for"          value={client.full_name} />
            <Row label="Report date"           value={today} />
            <Row label="Prepared by"           value={firm.advisor_name ?? "[Advisor Name]"} />
            <Row label="Next scheduled review" value={nextReviewStr} />
          </tbody></table>
        </div>

        <hr className="border-[#C39A38]" />

        {/* 1. Client Snapshot */}
        <div>
          <h2 className="text-base font-bold text-[#0F3A46] mb-3">1 · Client Snapshot</h2>
          <div className="grid grid-cols-2 gap-x-12">
            <table className="w-full"><tbody>
              <Row label="Full name"      value={client.full_name} />
              <Row label="Age"            value={client.age != null ? `${client.age} yrs` : "—"} />
              <Row label="Marital status" value={client.marital_status ?? "—"} />
              <Row label="Dependants"     value={client.dependants_detail ?? "—"} />
            </tbody></table>
            <table className="w-full"><tbody>
              <Row label="Employment"   value={client.occupation ?? "—"} />
              <Row label="Annual income" value={data.fmt_income} />
              <Row label="KYC status"   value={client.pan ? "PAN verified" : "—"} />
              <Row label="Retirement age" value={facts.retirement_age ? `${facts.retirement_age} yrs` : "—"} />
            </tbody></table>
          </div>
        </div>

        <hr className="border-[#E7EFEF]" />

        {/* 2. Risk Profile Assessment */}
        <div>
          <h2 className="text-base font-bold text-[#0F3A46] mb-3">2 · Risk Profile Assessment</h2>
          <div className="grid grid-cols-2 gap-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#0F3A46] text-white text-xs">
                  <th className="text-left px-3 py-2 font-medium">Component</th>
                  <th className="px-3 py-2 font-medium text-right">Score</th>
                  <th className="px-3 py-2 font-medium text-right">Max</th>
                  <th className="px-3 py-2 font-medium text-right">% of max</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Risk Capacity (ability)",     scores.cap, 40],
                  ["Risk Tolerance (willingness)", scores.tol, 35],
                  ["Knowledge & Experience",       scores.kn,  20],
                ].map(([label, score, max]) => (
                  <tr key={label as string} className="border-b border-[#E7EFEF]">
                    <td className="px-3 py-2 text-sm text-[#0F3A46]">{label}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-[#0F3A46]">{score}</td>
                    <td className="px-3 py-2 text-sm text-right text-[#6B7E86]">{max}</td>
                    <td className="px-3 py-2 text-sm text-right text-[#6B7E86]">{(((score as number) / (max as number)) * 100).toFixed(0)}%</td>
                  </tr>
                ))}
                <tr className="bg-[#F5F9FA]">
                  <td className="px-3 py-2 text-sm font-bold text-[#0F3A46]">TOTAL</td>
                  <td className="px-3 py-2 text-sm text-right font-bold text-[#0F3A46]">{scores.total}</td>
                  <td className="px-3 py-2 text-sm text-right text-[#6B7E86]">95</td>
                  <td className="px-3 py-2 text-sm text-right text-[#6B7E86]">{((scores.total / 95) * 100).toFixed(0)}%</td>
                </tr>
              </tbody>
            </table>

            <div>
              <table className="w-full border-collapse text-xs mb-3">
                <thead>
                  <tr className="bg-[#0F3A46] text-white">
                    <th className="text-left px-3 py-1.5 font-medium">Score</th>
                    <th className="text-left px-3 py-1.5 font-medium">Category</th>
                    <th className="text-left px-3 py-1.5 font-medium">Indicative equity</th>
                  </tr>
                </thead>
                <tbody>
                  {CAT_BANDS.map(b => (
                    <tr key={b.cat} className={`border-b border-[#E7EFEF] ${b.cat === activeband?.cat ? "bg-[#DDE6E8] font-semibold" : ""}`}>
                      <td className="px-3 py-1.5 text-[#0F3A46]">{b.range}</td>
                      <td className="px-3 py-1.5 text-[#0F3A46]">{b.cat}</td>
                      <td className="px-3 py-1.5 text-[#6B7E86]">{b.eq}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <hr className="border-[#E7EFEF]" />

        {/* 3. Profile Determination */}
        <div>
          <h2 className="text-base font-bold text-[#0F3A46] mb-3">3 · Risk Profile Determination</h2>
          <div className="grid grid-cols-2 gap-8 mb-4">
            <table className="w-full"><tbody>
              <Row label="Total-score category"    value={activeband?.cat ?? "—"} />
              <Row label="Capacity category (Q1–Q8)" value={analysis.capCategory ?? "—"} />
              <Row label="Tolerance category (Q9–Q15)" value={analysis.tolCategory ?? "—"} />
            </tbody></table>
          </div>
          <div className="rounded-xl p-5 text-white" style={{ background: profileColor }}>
            <div className="text-xs font-semibold tracking-widest uppercase opacity-80 mb-1">FINAL RISK PROFILE</div>
            <div className="text-3xl font-bold font-serif">{analysis.finalProfile}</div>
            <div className="text-xs opacity-75 mt-1">Governing profile = min(Capacity, Tolerance)</div>
          </div>
        </div>

        <hr className="border-[#E7EFEF]" />

        {/* 4. Financial Position */}
        <div>
          <h2 className="text-base font-bold text-[#0F3A46] mb-3">4 · Financial Position</h2>
          <div className="grid grid-cols-2 gap-x-12">
            <table className="w-full"><tbody>
              <Row label="Total assets"      value={data.fmt_assets} />
              <Row label="Total liabilities" value={data.fmt_debt} />
              <Row label="Net worth"         value={data.fmt_nw} />
            </tbody></table>
            <table className="w-full"><tbody>
              <Row label="Annual income" value={data.fmt_income} />
              <Row label="Annual expenses" value={facts.expenses_annual != null ? `₹${Number(facts.expenses_annual).toLocaleString("en-IN")}` : "—"} />
            </tbody></table>
          </div>
        </div>

        <hr className="border-[#E7EFEF]" />

        {/* 5. Model Asset Allocation */}
        <div>
          <h2 className="text-base font-bold text-[#0F3A46] mb-3">5 · Model Asset Allocation (Starting Framework)</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-3 py-2 font-medium">Asset class</th>
                <th className="px-3 py-2 font-medium text-right">Allocation %</th>
                <th className="text-left px-3 py-2 font-medium">Instruments</th>
              </tr>
            </thead>
            <tbody>
              {alloc.map((a, i) => (
                <tr key={i} className="border-b border-[#E7EFEF]">
                  <td className="px-3 py-2 text-sm text-[#0F3A46] font-medium">{a.label}</td>
                  <td className="px-3 py-2 text-sm text-right font-bold text-[#0F3A46]">{a.pct}%</td>
                  <td className="px-3 py-2 text-xs text-[#6B7E86]">{a.desc}</td>
                </tr>
              ))}
              <tr className="bg-[#F5F9FA]">
                <td className="px-3 py-2 text-sm font-bold text-[#0F3A46]">Total</td>
                <td className="px-3 py-2 text-sm text-right font-bold text-[#0F3A46]">100%</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 6. Goals */}
        {goals.length > 0 && (
          <>
            <hr className="border-[#E7EFEF]" />
            <div>
              <h2 className="text-base font-bold text-[#0F3A46] mb-3">6 · Goals</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#0F3A46] text-white text-xs">
                    <th className="text-left px-3 py-2 font-medium">Goal</th>
                    <th className="px-3 py-2 font-medium text-right">Target year</th>
                    <th className="px-3 py-2 font-medium text-right">Cost today</th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g, i) => (
                    <tr key={i} className="border-b border-[#E7EFEF]">
                      <td className="px-3 py-2 text-sm text-[#0F3A46]">{g.goal_name ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-right text-[#0F3A46]">{g.target_year ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-right text-[#0F3A46]">{g.cost_today != null ? `₹${Number(g.cost_today).toLocaleString("en-IN")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 7. Red flags */}
        {analysis.flags.length > 0 && (
          <>
            <hr className="border-[#E7EFEF]" />
            <div>
              <h2 className="text-base font-bold text-[#0F3A46] mb-3">7 · Risk Flags &amp; Adviser Notes</h2>
              <div className="space-y-2">
                {analysis.flags.map((f, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-[#FFF7F6] border border-[#E4B3AE] rounded-lg">
                    <span className="text-[#B4463C] font-bold text-sm shrink-0">⚑</span>
                    <div>
                      <div className="text-sm font-semibold text-[#B4463C]">{f.name}</div>
                      <div className="text-xs text-[#6B7E86] mt-0.5">{f.why}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="border-t border-[#E7EFEF] pt-4 text-xs text-[#6B7E86] space-y-1">
          <p><strong>Disclaimer:</strong> This report is prepared by a SEBI Registered Investment Adviser and is based on the information provided by the client in the Risk Profiling Questionnaire. The risk profile and recommended asset allocation are indicative and subject to change based on updated information, market conditions, and regulatory changes. This report does not constitute a solicitation or offer to buy/sell any securities.</p>
          <p>Prepared in compliance with SEBI (Investment Advisers) Regulations, 2013 and subsequent circulars.</p>
        </div>

      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #advisory-report, #advisory-report * { visibility: visible; }
          #advisory-report { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
