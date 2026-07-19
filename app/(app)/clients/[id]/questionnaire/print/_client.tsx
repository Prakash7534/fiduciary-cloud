"use client";
// Print client — renders the complete questionnaire as a printable page
import { ALL_RISK_QUESTIONS } from "@/lib/questionnaire";

interface Props {
  client: Record<string, unknown>;
  ff: Record<string, unknown> | null;
  riskAnswers: { question_num: number; answer: string }[];
  goals: Record<string, unknown>[];
  loans: Record<string, unknown>[];
  family: Record<string, unknown>[];
  behaviour: Record<string, unknown> | null;
  knowledge: { asset_class: string; level: string }[];
  investments: { asset_class: string; value: number }[];
}

const fmt = (v: unknown) => v ? String(v) : "—";
const fmtBool = (v: unknown) => v === true ? "Yes" : v === false ? "No" : "—";
const fmtMoney = (v: unknown) => v ? `₹ ${Number(v).toLocaleString("en-IN")}` : "—";
const fmtDate = (v: unknown) => {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return String(v); }
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 print:mb-5">
      <div className="flex items-center gap-2 mb-3 pb-1 border-b-2 border-[#0F3A46]">
        <h2 className="text-sm font-bold text-[#0F3A46] uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1 border-b border-gray-100 text-xs">
      <span className="w-44 shrink-0 text-gray-500 font-medium">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-0">{children}</div>;
}

export default function PrintClient({ client, ff, riskAnswers, goals, loans, family, behaviour, knowledge, investments }: Props) {
  const printedAt = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Print button — hidden on actual print */}
      <div className="print:hidden bg-[#0F3A46] text-white px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#A0C4CE]">Client Questionnaire — Print / PDF</p>
          <p className="font-semibold">{fmt(client.full_name)}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-[#C39A38] hover:bg-[#B08830] text-white px-5 py-2 rounded-lg text-sm font-semibold"
        >
          ⬇ Download PDF
        </button>
      </div>

      {/* Print body */}
      <div className="max-w-4xl mx-auto p-8 print:p-6 print:max-w-none font-sans text-gray-900">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-[#0F3A46]">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Fiduciary Financial Advisers</p>
            <h1 className="text-xl font-bold text-[#0F3A46]">Client Suitability Questionnaire</h1>
            <p className="text-xs text-gray-500 mt-0.5">Printed: {printedAt}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 mb-0.5">Unique Client Code (UCC)</p>
            <p className="font-mono font-bold text-[#C39A38] text-2xl tracking-widest">{fmt(client.client_code)}</p>
          </div>
        </div>

        {/* 1. Personal */}
        <Section title="1. Personal Details">
          <Grid>
            <Row label="Full name"          value={fmt(client.full_name)} />
            <Row label="Date of birth"       value={fmtDate(client.dob)} />
            <Row label="PAN"                 value={fmt(client.pan)} />
            <Row label="Email"               value={fmt(client.email)} />
            <Row label="Mobile"              value={fmt(client.phone)} />
            <Row label="Gender"              value={fmt(client.gender)} />
            <Row label="Marital status"      value={fmt(client.marital_status)} />
            <Row label="Residential status"  value={fmt(client.residential_status)} />
            <Row label="Client type"         value={fmt(client.client_type)} />
            <Row label="Nationality"         value={fmt(client.nationality)} />
          </Grid>
          <div className="mt-1">
            <Row label="Address" value={fmt(client.address)} />
          </div>
        </Section>

        {/* 2. Employment */}
        <Section title="2. Employment & Background">
          <Grid>
            <Row label="Occupation"           value={fmt(client.occupation)} />
            <Row label="Employer"             value={fmt(client.employer)} />
            <Row label="Industry / Sector"    value={fmt(client.industry)} />
            <Row label="Years of experience"  value={fmt(client.years_exp)} />
            <Row label="Career stage"         value={fmt(client.career_stage)} />
            <Row label="Education"            value={fmt(client.education)} />
            <Row label="Owns a business"      value={fmtBool(client.owns_business)} />
            <Row label="Sole earner"          value={fmtBool(client.sole_earner)} />
            <Row label="Expecting inheritance" value={fmtBool(client.expecting_inheritance)} />
            <Row label="Planning career change" value={fmtBool(client.plan_change)} />
          </Grid>
          {client.dependants_detail && (
            <div className="mt-1">
              <Row label="Dependants detail" value={fmt(client.dependants_detail)} />
            </div>
          )}
        </Section>

        {/* 3. Financial */}
        {ff && (
          <Section title="3. Financial Profile">
            <Grid>
              <Row label="Self income (p.a.)"     value={fmtMoney(ff.income_self)} />
              <Row label="Spouse income (p.a.)"   value={fmtMoney(ff.income_spouse)} />
              <Row label="Other income (p.a.)"    value={fmtMoney(ff.income_other)} />
              <Row label="Life cover"             value={fmtMoney(ff.life_cover)} />
              <Row label="Target retirement age"  value={fmt(ff.retirement_age)} />
              <Row label="Will in place"          value={fmt(ff.will_status)} />
              <Row label="Politically exposed"    value={fmt(ff.pep)} />
              <Row label="FATCA applicable"       value={fmt(ff.fatca)} />
            </Grid>
          </Section>
        )}

        {/* 4. Insurance & Estate */}
        {ff && (ff.health_cover || ff.trust_status || ff.poa_status) && (
          <Section title="4. Insurance & Estate Planning">
            <Grid>
              <Row label="Health cover (sum insured)" value={fmtMoney(ff.health_cover)} />
              <Row label="Employer cover"              value={fmtMoney(ff.employer_cover)} />
              <Row label="Nominees updated"            value={fmt(ff.nominees_updated)} />
              <Row label="Trust set up"                value={fmt(ff.trust_status)} />
              <Row label="Power of attorney"           value={fmt(ff.poa_status)} />
              <Row label="Guardian appointed"          value={fmt(ff.guardian_status)} />
            </Grid>
            {ff.covers_held && <div className="mt-1"><Row label="Other covers held" value={fmt(ff.covers_held)} /></div>}
          </Section>
        )}

        {/* 5. Family */}
        {family.length > 0 && (
          <Section title="5. Family Members">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#EBF3F5]">
                  {["Name","Relationship","Age","Occupation","Annual income","Health"].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 font-semibold text-[#0F3A46] border border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {family.map((f, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2 border border-gray-200">{fmt(f.name)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(f.relationship)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(f.age)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(f.occupation)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmtMoney(f.annual_income)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(f.health_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* 6. Goals */}
        {goals.length > 0 && (
          <Section title="6. Financial Goals">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#EBF3F5]">
                  {["Goal","Target year","Cost today","Saved","Monthly SIP","Inflation","Return","Priority"].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 font-semibold text-[#0F3A46] border border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {goals.map((g, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2 border border-gray-200 font-medium">{fmt(g.goal_name)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(g.target_year)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmtMoney(g.cost_today)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmtMoney(g.saved)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmtMoney(g.monthly_sip)}</td>
                    <td className="py-1 px-2 border border-gray-200">{g.inflation_pct ? `${g.inflation_pct}%` : "—"}</td>
                    <td className="py-1 px-2 border border-gray-200">{g.return_pct ? `${g.return_pct}%` : "—"}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(g.priority)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* 7. Loans */}
        {loans.length > 0 && (
          <Section title="7. Loans & Liabilities">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#EBF3F5]">
                  {["Type","Lender","Outstanding","EMI / month","Rate","Tenure (mo.)"].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 font-semibold text-[#0F3A46] border border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loans.map((l, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2 border border-gray-200">{fmt(l.loan_type)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(l.lender)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmtMoney(l.outstanding)}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmtMoney(l.emi)}</td>
                    <td className="py-1 px-2 border border-gray-200">{l.rate ? `${l.rate}%` : "—"}</td>
                    <td className="py-1 px-2 border border-gray-200">{fmt(l.tenure_months)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* 8. Existing Investments */}
        {investments.length > 0 && (
          <Section title="8. Existing Investments">
            <div className="grid grid-cols-2 gap-x-8">
              {investments.map((inv, i) => (
                <Row key={i}
                  label={inv.asset_class.replace(/_/g, " ")}
                  value={fmtMoney(inv.value)} />
              ))}
            </div>
          </Section>
        )}

        {/* 9. Risk Questionnaire Answers */}
        {riskAnswers.length > 0 && (
          <Section title="9. Risk Profile Questionnaire">
            <div className="space-y-3">
              {ALL_RISK_QUESTIONS.map(q => {
                const ans = riskAnswers.find(r => r.question_num === q.num);
                const selectedOpt = q.options.find(o => o.letter === ans?.answer);
                const sectionBg = q.section === "capacity"
                  ? "bg-[#EBF3F5]"
                  : q.section === "tolerance"
                    ? "bg-[#FEF9E7]"
                    : "bg-[#F3EEF8]";
                return (
                  <div key={q.num} className={`rounded-lg p-3 ${sectionBg}`}>
                    <p className="text-xs font-semibold text-[#0F3A46] mb-1.5">
                      <span className="text-[10px] text-gray-500 mr-1">Q{q.num}</span>
                      {q.text}
                    </p>
                    {selectedOpt ? (
                      <p className="text-xs text-[#0F3A46] bg-white rounded px-2 py-1 inline-block">
                        <strong>{selectedOpt.letter}.</strong> {selectedOpt.text}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Not answered</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* 10. Behaviour */}
        {behaviour && (
          <Section title="10. Behavioural Profile">
            <Row label="Reaction to 30% drop"       value={fmt(behaviour.beh1)} />
            <Row label="Performance chasing history" value={fmt(behaviour.beh2)} />
            <Row label="Portfolio check frequency"   value={fmt(behaviour.beh3)} />
          </Section>
        )}

        {/* 11. Knowledge Grid */}
        {knowledge.length > 0 && (
          <Section title="11. Investment Knowledge">
            <div className="grid grid-cols-2 gap-x-8">
              {knowledge.map((k, i) => (
                <Row key={i} label={k.asset_class} value={k.level} />
              ))}
            </div>
          </Section>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-400 flex justify-between">
          <span>Fiduciary Cloud — Confidential client document</span>
          <span>UCC: {fmt(client.client_code)} | {printedAt}</span>
        </div>
      </div>

      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          @page { margin: 1.5cm 2cm; size: A4; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}
