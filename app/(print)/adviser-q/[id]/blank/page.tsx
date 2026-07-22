// app/(print)/q/[id]/blank/page.tsx — blank manual questionnaire for hand-filling
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ALL_RISK_QUESTIONS, KNOWLEDGE_ASSETS } from "@/lib/questionnaire";

export default async function BlankFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("full_name, client_code, pan, dob, email, phone")
    .eq("client_id", id)
    .single();

  if (!client) notFound();

  const generatedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "long", year: "numeric",
  });

  const sectionBg: Record<string, string> = {
    capacity: "#EBF3F5", tolerance: "#FFF9E6", knowledge: "#F3EEF8",
  };

  const Line = ({ label, wide }: { label: string; wide?: boolean }) => (
    <div style={{ marginBottom: 10, width: wide ? "100%" : "48%" }}>
      <div style={{ fontSize: 8, color: "#555", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ borderBottom: "1px solid #333", height: 20, width: "100%" }} />
    </div>
  );

  const TwoCol = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 4%" }}>{children}</div>
  );

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`Blank Questionnaire — ${client.full_name ?? "Client"} — ${client.client_code}`}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #111; background: white; }
          .wrap { max-width: 210mm; margin: 0 auto; padding: 0 16mm; }

          .no-print {
            background: #0F3A46; color: white; padding: 10px 16mm;
            display: flex; justify-content: space-between; align-items: center;
          }
          .btn { background: #C39A38; color: white; border: none; padding: 7px 18px;
            border-radius: 5px; font-size: 11px; font-weight: 600; cursor: pointer;
            text-decoration: none; display: inline-block; }

          .doc-header {
            position: fixed; top: 0; left: 0; right: 0;
            background: #0F3A46; color: white; padding: 5px 16mm;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 7.5pt; z-index: 100;
          }
          .doc-footer {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: #f0f0f0; border-top: 1px solid #ccc;
            padding: 3px 16mm; font-size: 7.5pt; color: #555;
            display: flex; justify-content: space-between; z-index: 100;
          }

          .content { margin-top: 36px; margin-bottom: 32px; padding: 12px 0; }

          .sec-hdr { border-bottom: 2px solid #0F3A46; padding-bottom: 4px; margin: 16px 0 10px;
            font-size: 10.5pt; font-weight: 800; color: #0F3A46; text-transform: uppercase; letter-spacing: 0.5px; }

          .risk-q { padding: 8px 10px; margin-bottom: 8px; border-radius: 5px;
            page-break-inside: avoid; border: 1px solid #ddd; }
          .option-row { display: flex; align-items: center; gap: 8px; margin-top: 5px; flex-wrap: wrap; }
          .option { display: flex; align-items: center; gap: 4px; margin-right: 8px; }
          .circle { width: 14px; height: 14px; border: 1.5px solid #333; border-radius: 50%;
            display: inline-block; flex-shrink: 0; }

          table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
          th { background: #EBF3F5; padding: 5px 6px; border: 1px solid #bbb;
            font-weight: 700; text-align: left; color: #0F3A46; font-size: 8pt; }
          td { padding: 5px 6px; border: 1px solid #ccc; }
          .write-cell { border-bottom: 1px dashed #999 !important;
            border-top: none !important; border-left: none !important; border-right: none !important; }

          .goal-row td { height: 28px; }
          .sig-line { border-bottom: 1px solid #333; height: 1px; margin: 18px 0 4px; width: 70%; }

          .bool-options { display: flex; gap: 16px; margin-top: 4px; }
          .bool-opt { display: flex; align-items: center; gap: 5px; font-size: 9pt; }

          @media print {
            .no-print { display: none !important; }
            @page { size: A4; margin: 26mm 16mm 20mm 16mm; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        `}</style>
      </head>
      <body>
        {/* No-print toolbar */}
        <div className="no-print">
          <div>
            <div style={{ fontSize: 9, color: "#A0C4CE" }}>Blank Manual Questionnaire</div>
            <div style={{ fontWeight: 600 }}>
              {client.full_name ?? "Client"} &nbsp;·&nbsp;
              <span style={{ fontFamily: "monospace", color: "#C39A38" }}>{client.client_code}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href={`/clients/${id}/questionnaire`} className="btn" style={{ background: "#1a5a6e" }}>← Back</a>
            <button id="print-btn" className="btn">🖨 Print / Save PDF</button>
          </div>
        </div>

        {/* Fixed page header */}
        <div className="doc-header">
          <div>
            <span style={{ fontWeight: 700 }}>FIDUCIARY FIRST</span>
            <span style={{ opacity: 0.6, marginLeft: 8, fontSize: 7 }}>CLIENT SUITABILITY QUESTIONNAIRE — MANUAL FORM</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span>UCC: <strong style={{ fontFamily: "monospace", color: "#C39A38" }}>{client.client_code}</strong></span>
            <span style={{ opacity: 0.6, fontSize: 7 }}>CONFIDENTIAL</span>
          </div>
        </div>

        {/* Fixed footer */}
        <div className="doc-footer">
          <span>Please complete all sections in BLOCK CAPITALS. Use blue/black pen only.</span>
          <span>Fiduciary First — {generatedAt}</span>
        </div>

        <div className="content wrap">

          {/* Title */}
          <div style={{ borderBottom: "3px solid #0F3A46", paddingBottom: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 7, color: "#888", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
              Fiduciary First — SEBI Registered Investment Adviser
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, color: "#0F3A46" }}>Client Suitability Questionnaire</h1>
                <p style={{ fontSize: 8, color: "#666", marginTop: 3 }}>
                  Please complete all sections accurately. This document forms part of your KYC and suitability assessment record.
                </p>
              </div>
              <div style={{ textAlign: "right", border: "2px solid #0F3A46", padding: "6px 10px", borderRadius: 5 }}>
                <div style={{ fontSize: 7, color: "#888" }}>UCC (pre-assigned)</div>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 16, color: "#C39A38", letterSpacing: 3 }}>
                  {client.client_code}
                </div>
              </div>
            </div>
          </div>

          {/* Pre-filled profile strip */}
          <div style={{ background: "#EBF3F5", border: "1px solid #C8D8DB", borderRadius: 5,
            padding: "8px 12px", marginBottom: 14, fontSize: 9 }}>
            <span style={{ fontWeight: 700, color: "#0F3A46", marginRight: 12 }}>FROM PROFILE (pre-filled):</span>
            <span style={{ marginRight: 12 }}>Name: <strong>{client.full_name ?? "—"}</strong></span>
            <span style={{ marginRight: 12 }}>DOB: <strong>{client.dob ?? "—"}</strong></span>
            <span style={{ marginRight: 12 }}>PAN: <strong>{client.pan ?? "—"}</strong></span>
            <span style={{ marginRight: 12 }}>Email: <strong>{client.email ?? "—"}</strong></span>
            <span>Mobile: <strong>{client.phone ?? "—"}</strong></span>
          </div>

          {/* SECTION A: Personal */}
          <div className="sec-hdr">A — Personal Details</div>
          <TwoCol>
            <Line label="Full name (as per PAN)" wide />
            <Line label="Date of birth (DD/MM/YYYY)" />
            <Line label="PAN number" />
            <Line label="Email address" />
            <Line label="Mobile number" />
            <Line label="Nationality" />
          </TwoCol>
          <div style={{ display: "flex", gap: "4%", flexWrap: "wrap", marginBottom: 8 }}>
            {[
              { label: "Gender", opts: ["Male","Female","Other"] },
              { label: "Marital status", opts: ["Single","Married","Divorced","Widowed"] },
              { label: "Residential status", opts: ["Resident Indian","NRI","PIO/OCI"] },
              { label: "Client type", opts: ["Individual","HUF","Company","Trust","NRI"] },
            ].map(({ label, opts }) => (
              <div key={label} style={{ width: "48%", marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: "#555", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                <div className="option-row">
                  {opts.map(o => <span key={o} className="option"><span className="circle" /> <span style={{ fontSize: 9 }}>{o}</span></span>)}
                </div>
              </div>
            ))}
          </div>
          <Line label="Residential address (full)" wide />

          {/* SECTION B: Employment */}
          <div className="sec-hdr">B — Employment & Background</div>
          <TwoCol>
            <Line label="Occupation" />
            <Line label="Employer / Company name" />
            <Line label="Industry / Sector" />
            <Line label="Years of experience" />
            <Line label="Career stage (Early / Mid / Senior / Pre-ret / Retired)" />
            <Line label="Education qualification" />
            <Line label="Dependants detail (name, age, relationship)" wide />
          </TwoCol>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 4, marginBottom: 6 }}>
            {[
              "Owns a business / is a partner",
              "Sole earner in the family",
              "Expecting a significant inheritance",
              "Planning a career / income change soon",
            ].map(flag => (
              <div key={flag} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 8, color: "#555", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{flag}</div>
                <div className="bool-options">
                  <span className="bool-opt"><span className="circle" /> Yes</span>
                  <span className="bool-opt"><span className="circle" /> No</span>
                </div>
              </div>
            ))}
          </div>

          {/* SECTION C: Financial */}
          <div className="sec-hdr">C — Financial Profile</div>
          <TwoCol>
            <Line label="Self annual income (₹)" />
            <Line label="Spouse annual income (₹)" />
            <Line label="Other income — source & amount (₹)" />
            <Line label="Total life insurance cover (₹ sum assured)" />
            <Line label="Target retirement age" />
            <Line label="Planned life expectancy (age)" />
            <Line label="Salaried? (EPF applies)" />
            <Line label="Monthly basic pay (₹)" />
            <Line label="Average salary growth (% p.a.)" />
            <Line label="Current EPF / NPS balance now (₹)" />
          </TwoCol>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>
            {[
              { label: "Will in place?", opts: ["Yes","No","In progress"] },
              { label: "Politically exposed person?", opts: ["Yes","No"] },
              { label: "FATCA applicable?", opts: ["Yes","No"] },
            ].map(({ label, opts }) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 8, color: "#555", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                <div className="bool-options">
                  {opts.map(o => <span key={o} className="bool-opt"><span className="circle" /> {o}</span>)}
                </div>
              </div>
            ))}
          </div>

          {/* SECTION D: Insurance & Estate */}
          <div className="sec-hdr">D — Insurance & Estate Planning</div>
          <TwoCol>
            <Line label="Health / Mediclaim cover — sum insured (₹)" />
            <Line label="Employer-provided group health cover (₹)" />
            <Line label="Other covers held (Term, CI, PA, Travel — list)" wide />
          </TwoCol>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>
            {[
              { label: "Nominees updated on all policies?", opts: ["Yes","No","Partially"] },
              { label: "Trust set up?", opts: ["Yes — Private","Yes — Public","No","In progress"] },
              { label: "Power of attorney?", opts: ["Yes — General","Yes — Limited","No"] },
              { label: "Guardian appointed (for minors)?", opts: ["Yes","No","N/A"] },
            ].map(({ label, opts }) => (
              <div key={label} style={{ marginBottom: 10, width: "48%" }}>
                <div style={{ fontSize: 8, color: "#555", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                <div className="option-row">
                  {opts.map(o => <span key={o} className="option"><span className="circle" /> <span style={{ fontSize: 9 }}>{o}</span></span>)}
                </div>
              </div>
            ))}
          </div>

          {/* SECTION E: Family */}
          <div className="sec-hdr">E — Family Members</div>
          <table>
            <thead><tr>
              {["Name","Relationship","Age","Occupation","Annual Income (₹)","Health"].map(h => <th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...Array(4)].map((_, i) => (
                <tr key={i} className="goal-row">{[...Array(6)].map((__, j) => <td key={j} />)}</tr>
              ))}
            </tbody>
          </table>

          {/* SECTION F: Goals */}
          <div className="sec-hdr">F — Financial Goals</div>
          <table>
            <thead><tr>
              {["Goal name","Target year","Cost today (₹)","Saved (₹)","Monthly SIP (₹)","Inflation %","Return %","Priority","Flexibility"].map(h => <th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="goal-row">{[...Array(9)].map((__, j) => <td key={j} />)}</tr>
              ))}
            </tbody>
          </table>

          {/* SECTION G: Loans */}
          <div className="sec-hdr">G — Loans & Liabilities</div>
          <table>
            <thead><tr>
              {["Loan type","Lender","Outstanding (₹)","EMI/month (₹)","Rate % p.a.","Remaining tenure (months)"].map(h => <th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...Array(4)].map((_, i) => (
                <tr key={i} className="goal-row">{[...Array(6)].map((__, j) => <td key={j} />)}</tr>
              ))}
            </tbody>
          </table>

          {/* SECTION H: Investments */}
          <div className="sec-hdr">H — Existing Investments (approx. current value ₹)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
            {[
              "Direct Equity / Stocks","Mutual Funds (all types)",
              "EPF / PPF / NPS","FDs / Bonds / NCDs",
              "Gold (physical / SGBs / ETF)","Real estate (investment property)",
              "International / US Funds","Insurance-linked (ULIP / endowment)",
              "Cash / Savings / Liquid","Alternatives (PMS / AIF / REIT)",
            ].map(label => (
              <div key={label} style={{ display: "flex", borderBottom: "1px solid #eee", padding: "4px 0", fontSize: 9 }}>
                <span style={{ width: 180, flexShrink: 0, color: "#444" }}>{label}</span>
                <span style={{ borderBottom: "1px solid #999", flex: 1 }} />
              </div>
            ))}
          </div>

          {/* SECTION I: Risk Questions */}
          <div className="sec-hdr">I — Risk Profile Questionnaire (Q1–19)</div>
          <p style={{ fontSize: 8.5, color: "#555", marginBottom: 10 }}>
            Circle ONE option (A–E) for each question. Answer based on your genuine financial situation and attitude.
          </p>
          {ALL_RISK_QUESTIONS.map(q => (
            <div key={q.num} className="risk-q" style={{ background: sectionBg[q.section] }}>
              <div style={{ fontWeight: 700, fontSize: 9.5, color: "#0F3A46", marginBottom: 6 }}>
                <span style={{ fontSize: 8, color: "#777", marginRight: 5 }}>Q{q.num}</span>
                {q.text}
              </div>
              <div className="option-row">
                {q.options.map(o => (
                  <span key={o.letter} style={{
                    display: "flex", alignItems: "flex-start", gap: 5,
                    fontSize: 8.5, marginRight: 4, marginBottom: 3, width: "48%",
                  }}>
                    <span className="circle" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span><strong>{o.letter}.</strong> {o.text}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* SECTION J: Behaviour */}
          <div className="sec-hdr">J — Behavioural Questions</div>
          {[
            { q: "B1. If your portfolio fell 30% suddenly, you would:", opts: ["Sell immediately to cut losses","Feel anxious but hold on","View it as a buying opportunity and invest more"] },
            { q: "B2. Have you ever switched investments chasing recent performance?", opts: ["Yes","No","Never faced this situation"] },
            { q: "B3. How often do you check your investment portfolio?", opts: ["Often (daily/weekly)","Sometimes (monthly)","Rarely or never"] },
          ].map(({ q, opts }) => (
            <div key={q} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 9.5, color: "#0F3A46", marginBottom: 6 }}>{q}</div>
              <div className="option-row">
                {opts.map(o => <span key={o} className="option"><span className="circle" /> <span style={{ fontSize: 9 }}>{o}</span></span>)}
              </div>
            </div>
          ))}

          {/* SECTION K: Knowledge Grid */}
          <div className="sec-hdr">K — Investment Knowledge Self-Assessment</div>
          <p style={{ fontSize: 8.5, color: "#555", marginBottom: 8 }}>
            Circle your level for each asset class: None / Basic / Intermediate / Advanced
          </p>
          <table>
            <thead><tr>
              <th>Asset class</th>
              <th style={{ textAlign: "center" }}>None</th>
              <th style={{ textAlign: "center" }}>Basic</th>
              <th style={{ textAlign: "center" }}>Intermediate</th>
              <th style={{ textAlign: "center" }}>Advanced</th>
            </tr></thead>
            <tbody>
              {KNOWLEDGE_ASSETS.map(({ label }) => (
                <tr key={label} style={{ height: 24 }}>
                  <td style={{ fontSize: 9 }}>{label}</td>
                  {["None","Basic","Intermediate","Advanced"].map(l => (
                    <td key={l} style={{ textAlign: "center" }}>
                      <span className="circle" style={{ margin: "0 auto" }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Declaration & Signature */}
          <div className="sec-hdr">L — Declaration & Signature</div>
          <div style={{ border: "1px solid #ccc", borderRadius: 5, padding: 14 }}>
            <p style={{ fontSize: 9, lineHeight: 1.6, color: "#333", marginBottom: 14 }}>
              I/We confirm that the information provided in this questionnaire is true, accurate and complete to the best of my/our knowledge.
              I/We understand that this information will be used by my/our SEBI-registered investment adviser to assess suitability for
              investment products and services and to construct an appropriate financial plan. I/We consent to the use and storage of this
              information as described in the adviser&apos;s Privacy Policy.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div>
                <div className="sig-line" />
                <div style={{ fontSize: 9, color: "#555" }}>Client Signature</div>
                <div style={{ fontSize: 9, marginTop: 8 }}>Name: ___________________________</div>
                <div style={{ fontSize: 9, marginTop: 6 }}>Date: ___________________________</div>
              </div>
              <div>
                <div className="sig-line" />
                <div style={{ fontSize: 9, color: "#555" }}>Adviser Signature / Stamp</div>
                <div style={{ fontSize: 9, marginTop: 8 }}>ARN / RIA No.: ____________________</div>
                <div style={{ fontSize: 9, marginTop: 6 }}>Date: ___________________________</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 14, borderTop: "1px solid #ddd", paddingTop: 6,
            fontSize: 7.5, color: "#888", display: "flex", justifyContent: "space-between" }}>
            <span>UCC: {client.client_code}</span>
            <span>Fiduciary First — SEBI Registered Investment Adviser — Confidential</span>
            <span>{generatedAt}</span>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener("load", function() {
            var btn = document.getElementById('print-btn');
            if (btn) btn.addEventListener('click', function() { window.print(); });
            setTimeout(function() { window.print(); }, 400);
          });
        `}} />
      </body>
    </html>
  );
}
