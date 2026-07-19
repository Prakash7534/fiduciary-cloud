// app/(print)/q/[id]/page.tsx — audit-compliant filled questionnaire PDF
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ALL_RISK_QUESTIONS } from "@/lib/questionnaire";

// ─── Types ────────────────────────────────────────────────────────────────
interface ClientRow {
  full_name: string | null; email: string | null; phone: string | null;
  pan: string | null; dob: string | null; gender: string | null;
  marital_status: string | null; address: string | null; client_type: string | null;
  residential_status: string | null; nationality: string | null; client_code: string | null;
  occupation: string | null; employer: string | null; industry: string | null;
  years_exp: number | null; career_stage: string | null; education: string | null;
  dependants_detail: string | null; owns_business: boolean | null;
  sole_earner: boolean | null; expecting_inheritance: boolean | null; plan_change: boolean | null;
}
interface FFRow {
  income_self: number | null; income_spouse: number | null; income_other: number | null;
  life_cover: number | null; health_cover: number | null; employer_cover: number | null;
  retirement_age: number | null; will_status: string | null; pep: string | null;
  fatca: string | null; covers_held: string | null; nominees_updated: string | null;
  trust_status: string | null; poa_status: string | null; guardian_status: string | null;
}
interface GoalRow {
  goal_name: string; target_year: number | null; cost_today: number | null;
  saved: number | null; monthly_sip: number | null; priority: string | null;
  flexibility: string | null; inflation_pct: number | null; return_pct: number | null;
}
interface LoanRow {
  loan_type: string; lender: string | null; outstanding: number | null;
  emi: number | null; rate: number | null; tenure_months: number | null;
}
interface FamilyRow {
  name: string; relationship: string | null; age: number | null;
  occupation: string | null; annual_income: number | null; health_status: string | null;
}
interface BehRow { beh1: string | null; beh2: string | null; beh3: string | null; }
interface KnowRow { asset_class: string; level: string; }
interface InvRow { asset_class: string; value: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────
const f = (v: string | number | null | undefined) => (v != null && v !== "") ? String(v) : "—";
const fb = (v: boolean | null | undefined) => v === true ? "Yes" : v === false ? "No" : "—";
const fm = (v: number | null | undefined) => v != null ? `₹ ${Number(v).toLocaleString("en-IN")}` : "—";
const fd = (v: string | null | undefined) => {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return v; }
};

// ─── Sub-components (pure HTML — no Tailwind needed, inline styles for print safety) ──
function Hdr({ n, title }: { n: number; title: string }) {
  return (
    <div style={{ borderBottom: "2px solid #0F3A46", marginBottom: 10, paddingBottom: 4, marginTop: 18 }}>
      <span style={{ fontWeight: 700, fontSize: 11, color: "#0F3A46", textTransform: "uppercase", letterSpacing: 1 }}>
        {n}. {title}
      </span>
    </div>
  );
}
function Row2({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid #eee", padding: "3px 0", fontSize: 10 }}>
      <span style={{ width: 180, flexShrink: 0, color: "#555", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#111", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 32 }}>{children}</div>;
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default async function PrintFilledPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: client },
    { data: ff },
    { data: riskAnswers },
    { data: goals },
    { data: loans },
    { data: family },
    { data: behaviour },
    { data: knowledge },
    { data: investments },
  ] = await Promise.all([
    supabase.from("clients").select(`
      full_name,email,phone,pan,dob,gender,marital_status,address,
      client_type,residential_status,nationality,client_code,
      occupation,employer,industry,years_exp,career_stage,education,
      dependants_detail,owns_business,sole_earner,expecting_inheritance,plan_change
    `).eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("risk_answers").select("question_num,answer").eq("client_id", id).order("question_num"),
    supabase.from("goals").select("*").eq("client_id", id),
    supabase.from("loans").select("*").eq("client_id", id),
    supabase.from("family_members").select("*").eq("client_id", id),
    supabase.from("behaviour").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("knowledge_grid").select("asset_class,level").eq("client_id", id),
    supabase.from("investments").select("asset_class,value").eq("client_id", id),
  ]);

  if (!client) notFound();

  const c = client as ClientRow;
  const financial = ff as FFRow | null;
  const riskList = (riskAnswers ?? []) as { question_num: number; answer: string }[];
  const goalList = (goals ?? []) as GoalRow[];
  const loanList = (loans ?? []) as LoanRow[];
  const famList  = (family ?? []) as FamilyRow[];
  const beh      = behaviour as BehRow | null;
  const knowList = (knowledge ?? []) as KnowRow[];
  const invList  = (investments ?? []) as InvRow[];

  const generatedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const sectionBg: Record<string, string> = {
    capacity: "#EBF3F5", tolerance: "#FEF9E7", knowledge: "#F3EEF8",
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`Questionnaire — ${c.full_name ?? "Client"} — ${c.client_code}`}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            font-size: 10pt;
            color: #111;
            background: white;
          }
          .page-wrap { max-width: 210mm; margin: 0 auto; padding: 0 20mm; }

          /* Repeated page header — fixed positioning for print */
          .doc-header {
            position: fixed; top: 0; left: 0; right: 0;
            background: #0F3A46; color: white;
            padding: 6px 20mm;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 8pt; z-index: 999;
          }
          .doc-footer {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: #f5f5f5; border-top: 1px solid #ddd;
            padding: 4px 20mm;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 8pt; color: #555; z-index: 999;
          }
          .doc-footer::after {
            content: "Page " counter(page);
          }

          /* Main content pushed below fixed header + footer */
          .content { margin-top: 38px; margin-bottom: 38px; padding: 16px 0; }

          /* No-print button bar */
          .no-print { background: #0F3A46; color: white; padding: 12px 20mm;
            display: flex; justify-content: space-between; align-items: center; }
          .btn { background: #C39A38; color: white; border: none; padding: 8px 20px;
            border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; }

          table { width: 100%; border-collapse: collapse; font-size: 9pt; }
          th { background: #EBF3F5; color: #0F3A46; font-weight: 700;
            padding: 5px 6px; border: 1px solid #ccc; text-align: left; }
          td { padding: 4px 6px; border: 1px solid #ddd; }
          tr:nth-child(even) td { background: #FAFAFA; }

          .risk-q { border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; page-break-inside: avoid; }
          .risk-ans { background: white; border-radius: 4px; padding: 3px 8px;
            display: inline-block; font-size: 9pt; margin-top: 4px;
            border: 1px solid #ccc; font-weight: 600; }

          .sig-block { border: 1px solid #ccc; border-radius: 6px; padding: 14px;
            margin-top: 12px; page-break-inside: avoid; }
          .sig-line { border-bottom: 1px solid #333; margin: 20px 0 4px;
            height: 1px; width: 60%; }

          @media print {
            .no-print { display: none !important; }
            @page {
              size: A4;
              margin: 28mm 20mm 22mm 20mm;
            }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        `}</style>
      </head>
      <body>
        {/* No-print toolbar */}
        <div className="no-print">
          <div>
            <div style={{ fontSize: 10, color: "#A0C4CE", marginBottom: 2 }}>Client Suitability Questionnaire</div>
            <div style={{ fontWeight: 600 }}>{f(c.full_name)} &nbsp;·&nbsp;
              <span style={{ fontFamily: "monospace", color: "#C39A38" }}>{f(c.client_code)}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href={`/clients/${id}/questionnaire`} className="btn" style={{ background: "#1a5a6e", textDecoration: "none" }}>← Back</a>
            <button id="print-btn" className="btn">⬇ Download PDF</button>
          </div>
        </div>

        {/* Fixed header — prints on every page */}
        <div className="doc-header">
          <div>
            <span style={{ fontWeight: 700, letterSpacing: 1 }}>FIDUCIARY FIRST</span>
            <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 7 }}>CLIENT SUITABILITY QUESTIONNAIRE</span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>UCC:&nbsp;<strong style={{ fontFamily: "monospace", color: "#C39A38" }}>{f(c.client_code)}</strong></span>
            <span style={{ opacity: 0.6, fontSize: 8 }}>CONFIDENTIAL</span>
          </div>
        </div>

        {/* Fixed footer */}
        <div className="doc-footer">
          <span>Fiduciary First — For adviser use only. Generated: {generatedAt} IST</span>
        </div>

        {/* Document body */}
        <div className="content page-wrap">

          {/* Title block */}
          <div style={{ borderBottom: "3px solid #0F3A46", paddingBottom: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 7, color: "#888", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
              Fiduciary First — Adviser Practice Management
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <h1 style={{ fontSize: 16, fontWeight: 800, color: "#0F3A46" }}>Client Suitability Questionnaire</h1>
                <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>
                  Generated: {generatedAt} IST &nbsp;·&nbsp; SEBI-registered adviser document
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, color: "#888", marginBottom: 2 }}>Unique Client Code (UCC)</div>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 18, color: "#C39A38", letterSpacing: 3 }}>
                  {f(c.client_code)}
                </div>
              </div>
            </div>
          </div>

          {/* 1. Personal */}
          <Hdr n={1} title="Personal Details" />
          <Grid2>
            <Row2 label="Full name"          value={f(c.full_name)} />
            <Row2 label="Date of birth"       value={fd(c.dob)} />
            <Row2 label="PAN"                 value={f(c.pan)} />
            <Row2 label="Email"               value={f(c.email)} />
            <Row2 label="Mobile"              value={f(c.phone)} />
            <Row2 label="Gender"              value={f(c.gender)} />
            <Row2 label="Marital status"      value={f(c.marital_status)} />
            <Row2 label="Residential status"  value={f(c.residential_status)} />
            <Row2 label="Client type"         value={f(c.client_type)} />
            <Row2 label="Nationality"         value={f(c.nationality)} />
          </Grid2>
          <Row2 label="Address" value={f(c.address)} />

          {/* 2. Employment */}
          <Hdr n={2} title="Employment & Background" />
          <Grid2>
            <Row2 label="Occupation"            value={f(c.occupation)} />
            <Row2 label="Employer"              value={f(c.employer)} />
            <Row2 label="Industry / Sector"     value={f(c.industry)} />
            <Row2 label="Years of experience"   value={f(c.years_exp)} />
            <Row2 label="Career stage"          value={f(c.career_stage)} />
            <Row2 label="Education"             value={f(c.education)} />
            <Row2 label="Owns a business"       value={fb(c.owns_business)} />
            <Row2 label="Sole earner"           value={fb(c.sole_earner)} />
            <Row2 label="Expecting inheritance" value={fb(c.expecting_inheritance)} />
            <Row2 label="Planning career change" value={fb(c.plan_change)} />
          </Grid2>
          {c.dependants_detail && <Row2 label="Dependants detail" value={f(c.dependants_detail)} />}

          {/* 3. Financial */}
          {financial && (
            <>
              <Hdr n={3} title="Financial Profile" />
              <Grid2>
                <Row2 label="Self income (p.a.)"    value={fm(financial.income_self)} />
                <Row2 label="Spouse income (p.a.)"  value={fm(financial.income_spouse)} />
                <Row2 label="Other income (p.a.)"   value={fm(financial.income_other)} />
                <Row2 label="Life insurance cover"  value={fm(financial.life_cover)} />
                <Row2 label="Target retirement age" value={f(financial.retirement_age)} />
                <Row2 label="Will in place"         value={f(financial.will_status)} />
                <Row2 label="Politically exposed"   value={f(financial.pep)} />
                <Row2 label="FATCA applicable"      value={f(financial.fatca)} />
              </Grid2>
            </>
          )}

          {/* 4. Insurance & Estate */}
          {financial && (financial.health_cover != null || financial.trust_status) && (
            <>
              <Hdr n={4} title="Insurance & Estate Planning" />
              <Grid2>
                <Row2 label="Health cover (sum insured)" value={fm(financial.health_cover)} />
                <Row2 label="Employer-provided cover"    value={fm(financial.employer_cover)} />
                <Row2 label="Nominees updated"           value={f(financial.nominees_updated)} />
                <Row2 label="Trust set up"               value={f(financial.trust_status)} />
                <Row2 label="Power of attorney"          value={f(financial.poa_status)} />
                <Row2 label="Guardian appointed"         value={f(financial.guardian_status)} />
              </Grid2>
              {financial.covers_held && <Row2 label="Other covers held" value={f(financial.covers_held)} />}
            </>
          )}

          {/* 5. Family */}
          {famList.length > 0 && (
            <>
              <Hdr n={5} title="Family Members" />
              <table>
                <thead><tr>
                  {["Name","Relationship","Age","Occupation","Annual Income","Health"].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {famList.map((fm2, i) => (
                    <tr key={i}>
                      <td>{f(fm2.name)}</td><td>{f(fm2.relationship)}</td>
                      <td>{f(fm2.age)}</td><td>{f(fm2.occupation)}</td>
                      <td>{fm(fm2.annual_income)}</td><td>{f(fm2.health_status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* 6. Goals */}
          {goalList.length > 0 && (
            <>
              <Hdr n={6} title="Financial Goals" />
              <table>
                <thead><tr>
                  {["Goal","Target Yr","Cost Today","Saved","Monthly SIP","Inflation","Return","Priority","Flexibility"].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {goalList.map((g, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{f(g.goal_name)}</td>
                      <td>{f(g.target_year)}</td>
                      <td>{fm(g.cost_today)}</td>
                      <td>{fm(g.saved)}</td>
                      <td>{fm(g.monthly_sip)}</td>
                      <td>{g.inflation_pct != null ? `${g.inflation_pct}%` : "—"}</td>
                      <td>{g.return_pct != null ? `${g.return_pct}%` : "—"}</td>
                      <td>{f(g.priority)}</td>
                      <td>{f(g.flexibility)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* 7. Loans */}
          {loanList.length > 0 && (
            <>
              <Hdr n={7} title="Loans & Liabilities" />
              <table>
                <thead><tr>
                  {["Type","Lender","Outstanding","EMI/Month","Rate % p.a.","Tenure (mo.)"].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {loanList.map((l, i) => (
                    <tr key={i}>
                      <td>{f(l.loan_type)}</td><td>{f(l.lender)}</td>
                      <td>{fm(l.outstanding)}</td><td>{fm(l.emi)}</td>
                      <td>{l.rate != null ? `${l.rate}%` : "—"}</td>
                      <td>{f(l.tenure_months)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* 8. Existing Investments */}
          {invList.length > 0 && (
            <>
              <Hdr n={8} title="Existing Investments" />
              <Grid2>
                {invList.map((inv, i) => (
                  <Row2 key={i} label={inv.asset_class.replace(/_/g, " ")} value={fm(inv.value)} />
                ))}
              </Grid2>
            </>
          )}

          {/* 9. Risk Questionnaire */}
          {riskList.length > 0 && (
            <>
              <Hdr n={9} title="Risk Profile Questionnaire (Q1–19)" />
              <div style={{ marginBottom: 6, fontSize: 9, color: "#555" }}>
                <span style={{ background: "#EBF3F5", padding: "2px 6px", borderRadius: 3, marginRight: 6 }}>Q1–8: Capacity</span>
                <span style={{ background: "#FEF9E7", padding: "2px 6px", borderRadius: 3, marginRight: 6 }}>Q9–15: Tolerance</span>
                <span style={{ background: "#F3EEF8", padding: "2px 6px", borderRadius: 3 }}>Q16–19: Knowledge</span>
              </div>
              {ALL_RISK_QUESTIONS.map(q => {
                const ans = riskList.find(r => r.question_num === q.num);
                const opt = q.options.find(o => o.letter === ans?.answer);
                return (
                  <div key={q.num} className="risk-q" style={{ background: sectionBg[q.section] }}>
                    <div style={{ fontWeight: 700, fontSize: 9.5, color: "#0F3A46" }}>
                      <span style={{ fontSize: 8, color: "#777", marginRight: 5 }}>Q{q.num}</span>
                      {q.text}
                    </div>
                    <div className="risk-ans">
                      {opt ? <><strong>{opt.letter}.</strong> {opt.text}</> : <em style={{ color: "#999" }}>Not answered</em>}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* 10. Behaviour */}
          {beh && (
            <>
              <Hdr n={10} title="Behavioural Profile" />
              <Row2 label="Reaction to 30% portfolio drop" value={f(beh.beh1)} />
              <Row2 label="Performance chasing history"    value={f(beh.beh2)} />
              <Row2 label="Portfolio check frequency"      value={f(beh.beh3)} />
            </>
          )}

          {/* 11. Knowledge Grid */}
          {knowList.length > 0 && (
            <>
              <Hdr n={11} title="Investment Knowledge Self-Assessment" />
              <Grid2>
                {knowList.map((k, i) => <Row2 key={i} label={k.asset_class} value={k.level} />)}
              </Grid2>
            </>
          )}

          {/* Declaration & Signature */}
          <Hdr n={12} title="Declaration & Signature" />
          <div className="sig-block">
            <p style={{ fontSize: 9.5, lineHeight: 1.6, color: "#333" }}>
              I/We confirm that the information provided in this questionnaire is true, accurate and complete to the best of my/our knowledge.
              I/We understand that this information will be used by my/our SEBI-registered investment adviser to assess my/our suitability
              for investment products and services, and to construct an appropriate financial plan. I/We consent to the use and storage of
              this information as described in the adviser&apos;s Privacy Policy.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 20 }}>
              <div>
                <div className="sig-line" />
                <div style={{ fontSize: 9, color: "#555" }}>Client Signature</div>
                <div style={{ fontSize: 9, color: "#555", marginTop: 6 }}>Name: {f(c.full_name)}</div>
                <div style={{ fontSize: 9, color: "#555" }}>Date: ___________________________</div>
              </div>
              <div>
                <div className="sig-line" />
                <div style={{ fontSize: 9, color: "#555" }}>Adviser Signature / Stamp</div>
                <div style={{ fontSize: 9, color: "#555", marginTop: 6 }}>Name: ___________________________</div>
                <div style={{ fontSize: 9, color: "#555" }}>Date: ___________________________</div>
              </div>
            </div>
          </div>

          {/* Audit footer */}
          <div style={{ marginTop: 16, padding: "8px 0", borderTop: "1px solid #ddd",
            fontSize: 8, color: "#888", display: "flex", justifyContent: "space-between" }}>
            <span>Document ID: {f(c.client_code)}-{Date.now().toString(36).toUpperCase()}</span>
            <span>Fiduciary First — SEBI Registered Investment Adviser — Confidential</span>
            <span>Generated: {generatedAt} IST</span>
          </div>
        </div>

        {/* Auto-print script */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener("load", function() {
            var btn = document.getElementById('print-btn');
            if (btn) btn.addEventListener('click', function() { window.print(); });
            setTimeout(function() { window.print(); }, 600);
          });
        `}} />
      </body>
    </html>
  );
}
