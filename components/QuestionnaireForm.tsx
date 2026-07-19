"use client";
import { useState } from "react";
import {
  ALL_RISK_QUESTIONS, BEHAVIOUR_OPTIONS, KNOWLEDGE_ASSETS, KNOWLEDGE_LEVELS,
  LOAN_TYPES, GOAL_PRIORITIES, GOAL_FLEXIBILITIES, QSTEPS, type QStep,
} from "@/lib/questionnaire";

// ─── Types ───────────────────────────────────────────────────────────────────
interface GoalDraft {
  goal_name: string; target_year: string; cost_today: string;
  saved: string; monthly_sip: string; priority: string; flexibility: string;
  inflation_pct: string; return_pct: string;
}
interface LoanDraft { loan_type: string; lender: string; outstanding: string; emi: string; rate: string; tenure_months: string; }
interface FamilyDraft { name: string; relationship: string; age: string; occupation: string; annual_income: string; health_status: string; }
type KD = Record<string, string>;

export interface QuestionnairePayload {
  personal: {
    full_name?: string; dob?: string; pan?: string; email?: string; phone?: string;
    gender?: string; marital_status?: string; nationality?: string; address?: string;
    client_type?: string; residential_status?: string;
  };
  employment: {
    occupation?: string; employer?: string; industry?: string;
    years_exp?: number; career_stage?: string; education?: string;
    owns_business?: boolean; sole_earner?: boolean;
    expecting_inheritance?: boolean; plan_change?: boolean;
    dependants_detail?: string;
  };
  financial: {
    income_self: number; income_spouse: number; income_other: number;
    life_cover: number; retirement_age: number;
    will_status: string; pep: string; fatca: string;
  };
  insurance: {
    health_cover?: number; employer_cover?: number; covers_held?: string;
    nominees_updated?: string; trust_status?: string;
    poa_status?: string; guardian_status?: string;
  };
  family: FamilyDraft[];
  goals: GoalDraft[];
  loans: LoanDraft[];
  investments: KD;
  riskAnswers: { question_num: number; answer: string }[];
  behaviour: { beh1: string; beh2: string; beh3: string };
  knowledge: KD;
}

// ─── Mini components ──────────────────────────────────────────────────────────
function StepDot({ active, done, label, icon }: { active: boolean; done: boolean; label: string; icon: string }) {
  return (
    <div className={"flex flex-col items-center gap-1 text-[10px] font-medium " + (active ? "text-[#0F3A46]" : done ? "text-[#2E7D5B]" : "text-[#CBD9DC]")}>
      <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 " + (active ? "border-[#0F3A46] bg-[#EBF3F5]" : done ? "border-[#2E7D5B] bg-[#E8F4EE]" : "border-[#CBD9DC] bg-white")}>
        {done ? "✓" : icon}
      </div>
      <span className="hidden sm:block max-w-[56px] text-center leading-tight">{label}</span>
    </div>
  );
}

function FL({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-[#0F3A46] block mb-1">{label}</label>
      {children}
      {note && <p className="text-[10px] text-[#6B7E86] mt-0.5">{note}</p>}
    </div>
  );
}
const inp = "w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]";
const inpRO = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none bg-[#F0F5F6] border-[#C8D8DB] text-[#0F3A46] cursor-default";

function TI({ v, set, ph, type = "text", readOnly = false }: { v: string; set: (x: string) => void; ph?: string; type?: string; readOnly?: boolean }) {
  return <input type={type} value={v} onChange={e => set(e.target.value)} placeholder={ph} readOnly={readOnly} className={readOnly ? inpRO : inp} />;
}
function Sel({ v, set, children }: { v: string; set: (x: string) => void; children: React.ReactNode }) {
  return <select value={v} onChange={e => set(e.target.value)} className={inp}>{children}</select>;
}
function Toggle({ v, set, label }: { v: boolean; set: (b: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => set(!v)}
        className={"w-10 h-5 rounded-full transition-colors " + (v ? "bg-[#175A69]" : "bg-[#CBD9DC]")}
      >
        <span className={"block w-4 h-4 bg-white rounded-full mx-0.5 transition-transform " + (v ? "translate-x-5" : "translate-x-0")} />
      </button>
      <span className="text-xs text-[#0F3A46]">{label}</span>
    </label>
  );
}
function ProfileBadge() {
  return <span className="text-[9px] bg-[#175A69] text-white px-1.5 py-0.5 rounded font-bold">FROM PROFILE</span>;
}
function LockedField({ label, fromProfile, children }: { label: string; fromProfile?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-[#0F3A46]">{label}</label>
        {fromProfile && <ProfileBadge />}
      </div>
      {children}
    </div>
  );
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const emptyGoal = (): GoalDraft => ({
  goal_name: "", target_year: "", cost_today: "", saved: "", monthly_sip: "",
  priority: "Medium", flexibility: "Somewhat flexible",
  inflation_pct: "6", return_pct: "12",
});
const emptyLoan = (): LoanDraft => ({ loan_type: "Home Loan", lender: "", outstanding: "", emi: "", rate: "", tenure_months: "" });
const emptyFam  = (): FamilyDraft => ({ name: "", relationship: "", age: "", occupation: "", annual_income: "", health_status: "" });

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  clientCode: string;
  clientName: string;
  onSubmit: (payload: QuestionnairePayload) => Promise<void>;
  prefill?: Partial<QuestionnairePayload["personal"] & { occupation?: string; gender?: string }>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function QuestionnaireForm({ clientCode, clientName, onSubmit, prefill }: Props) {
  const stepIds = QSTEPS.map(s => s.id);
  const [stepIdx, setStepIdx] = useState(0);
  const curStep: QStep = stepIds[stepIdx];
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // ── Personal state ──
  const [personal, setPersonal] = useState({
    full_name: prefill?.full_name ?? "", dob: prefill?.dob ?? "",
    pan: prefill?.pan ?? "", email: prefill?.email ?? "", phone: prefill?.phone ?? "",
    gender: prefill?.gender ?? "", marital_status: "", nationality: "Indian",
    address: "", client_type: "Individual", residential_status: "Resident Indian",
  });
  const sp = (k: keyof typeof personal) => (v: string) => setPersonal(p => ({ ...p, [k]: v }));

  // ── Employment state ──
  const [emp, setEmp] = useState({
    occupation: prefill?.occupation ?? "", employer: "", industry: "",
    years_exp: "", career_stage: "", education: "", dependants_detail: "",
    owns_business: false, sole_earner: false, expecting_inheritance: false, plan_change: false,
  });
  const se = (k: keyof typeof emp) => (v: string) => setEmp(e => ({ ...e, [k]: v }));
  const seB = (k: keyof typeof emp) => (v: boolean) => setEmp(e => ({ ...e, [k]: v }));

  // ── Financial state ──
  const [fin, setFin] = useState({
    income_self: "", income_spouse: "", income_other: "",
    life_cover: "", retirement_age: "", will_status: "No", pep: "No", fatca: "No",
  });
  const sf = (k: keyof typeof fin) => (v: string) => setFin(f => ({ ...f, [k]: v }));

  // ── Insurance / Estate state ──
  const [ins, setIns] = useState({
    health_cover: "", employer_cover: "", covers_held: "",
    nominees_updated: "No", trust_status: "No", poa_status: "No", guardian_status: "N/A",
  });
  const si = (k: keyof typeof ins) => (v: string) => setIns(i => ({ ...i, [k]: v }));

  // ── Dynamic arrays ──
  const [family, setFamily] = useState<FamilyDraft[]>([]);
  const [goals, setGoals] = useState<GoalDraft[]>([emptyGoal()]);
  const [loans, setLoans] = useState<LoanDraft[]>([]);
  const [invs, setInvs] = useState<KD>({});
  const [riskAns, setRiskAns] = useState<Record<number, string>>({});
  const [beh, setBeh] = useState({ beh1: "", beh2: "", beh3: "" });
  const [knw, setKnw] = useState<KD>({});

  const updG = (i: number, k: keyof GoalDraft, v: string) => setGoals(gs => gs.map((g, gi) => gi === i ? { ...g, [k]: v } : g));
  const updL = (i: number, k: keyof LoanDraft, v: string) => setLoans(ls => ls.map((l, li) => li === i ? { ...l, [k]: v } : l));
  const updF = (i: number, k: keyof FamilyDraft, v: string) => setFamily(fs => fs.map((f, fi) => fi === i ? { ...f, [k]: v } : f));

  const riskDone = Object.keys(riskAns).length;
  const canSubmit = riskDone === 19 && beh.beh1 && beh.beh2 && beh.beh3;

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit({
      personal: { ...personal },
      employment: {
        occupation: emp.occupation || undefined,
        employer: emp.employer || undefined,
        industry: emp.industry || undefined,
        years_exp: emp.years_exp ? Number(emp.years_exp) : undefined,
        career_stage: emp.career_stage || undefined,
        education: emp.education || undefined,
        dependants_detail: emp.dependants_detail || undefined,
        owns_business: emp.owns_business,
        sole_earner: emp.sole_earner,
        expecting_inheritance: emp.expecting_inheritance,
        plan_change: emp.plan_change,
      },
      financial: {
        income_self: Number(fin.income_self) || 0,
        income_spouse: Number(fin.income_spouse) || 0,
        income_other: Number(fin.income_other) || 0,
        life_cover: Number(fin.life_cover) || 0,
        retirement_age: Number(fin.retirement_age) || 60,
        will_status: fin.will_status, pep: fin.pep, fatca: fin.fatca,
      },
      insurance: {
        health_cover: ins.health_cover ? Number(ins.health_cover) : undefined,
        employer_cover: ins.employer_cover ? Number(ins.employer_cover) : undefined,
        covers_held: ins.covers_held || undefined,
        nominees_updated: ins.nominees_updated,
        trust_status: ins.trust_status,
        poa_status: ins.poa_status,
        guardian_status: ins.guardian_status,
      },
      family, goals, loans, investments: invs,
      riskAnswers: Object.entries(riskAns).map(([q, a]) => ({ question_num: Number(q), answer: a })),
      behaviour: beh, knowledge: knw,
    });
    setSubmitting(false);
    setDone(true);
  };

  // ── Done state ──
  if (done) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="text-6xl">✅</div>
      <h2 className="text-xl font-semibold text-[#0F3A46]">Questionnaire submitted!</h2>
      <p className="text-sm text-[#6B7E86] max-w-sm">The client profile has been updated with all responses. You can now view the risk profile and build the financial plan.</p>
      <a href="/clients" className="mt-2 px-5 py-2 bg-[#0F3A46] text-white text-sm rounded-lg hover:bg-[#175A69]">Back to clients</a>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* UCC Header */}
      <div className="bg-[#0F3A46] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[#A0C4CE] text-[10px] uppercase tracking-widest mb-0.5">Client Questionnaire</p>
            <h2 className="text-white font-semibold text-lg">{clientName || "New Client"}</h2>
          </div>
          <div className="text-right">
            <p className="text-[#A0C4CE] text-[10px] mb-0.5">Unique Client Code (UCC)</p>
            <span className="font-mono font-bold text-[#C39A38] text-2xl tracking-widest">{clientCode}</span>
          </div>
        </div>
        {prefill && (prefill.email || prefill.phone || prefill.pan || prefill.dob) && (
          <div className="border-t border-white/10 px-6 py-3 flex gap-4 flex-wrap">
            {prefill.email && <span className="text-[10px] text-[#A0C4CE]">✉ {prefill.email}</span>}
            {prefill.phone && <span className="text-[10px] text-[#A0C4CE]">📱 {prefill.phone}</span>}
            {prefill.pan   && <span className="text-[10px] text-[#A0C4CE] font-mono">PAN {prefill.pan.toUpperCase()}</span>}
            {prefill.dob   && <span className="text-[10px] text-[#A0C4CE]">🗓 {new Date(prefill.dob).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span>}
            <span className="text-[10px] text-[#5B7A84] ml-auto">Profile details pre-loaded</span>
          </div>
        )}
      </div>

      {/* Progress stepper */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl px-4 py-3 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {QSTEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <button onClick={() => i <= stepIdx && setStepIdx(i)} disabled={i > stepIdx} className="disabled:cursor-default">
                <StepDot icon={s.icon} label={s.label} active={i === stepIdx} done={i < stepIdx} />
              </button>
              {i < QSTEPS.length - 1 && <div className={"w-4 h-0.5 " + (i < stepIdx ? "bg-[#2E7D5B]" : "bg-[#E7EFEF]")} />}
            </div>
          ))}
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white border border-[#CBD9DC] rounded-2xl overflow-hidden">
        <div className="bg-[#F5F9FA] px-6 py-4 border-b border-[#E7EFEF] flex items-center gap-3">
          <span className="text-2xl">{QSTEPS[stepIdx].icon}</span>
          <div>
            <h3 className="font-semibold text-[#0F3A46]">{QSTEPS[stepIdx].label}</h3>
            <p className="text-[10px] text-[#6B7E86]">Step {stepIdx + 1} of {QSTEPS.length}</p>
          </div>
        </div>

        <div className="p-6">

          {/* ═══ PERSONAL ═══ */}
          {curStep === "personal" && (
            <div className="space-y-4">
              <div className="bg-[#EBF3F5] border border-[#C8D8DB] rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="text-sm">🔒</span>
                <p className="text-xs text-[#175A69] font-medium">Fields marked <ProfileBadge /> were captured during profile creation and are read-only here.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <LockedField label="Full name *" fromProfile={!!prefill?.full_name}>
                    <TI v={personal.full_name} set={sp("full_name")} ph="As per PAN card" readOnly={!!prefill?.full_name} />
                  </LockedField>
                </div>
                <LockedField label="Date of birth *" fromProfile={!!prefill?.dob}>
                  <TI v={personal.dob} set={sp("dob")} type="date" readOnly={!!prefill?.dob} />
                </LockedField>
                <LockedField label="PAN *" fromProfile={!!prefill?.pan}>
                  <TI v={personal.pan} set={sp("pan")} ph="ABCDE1234F" readOnly={!!prefill?.pan} />
                </LockedField>
                <LockedField label="Email *" fromProfile={!!prefill?.email}>
                  <TI v={personal.email} set={sp("email")} type="email" ph="client@email.com" readOnly={!!prefill?.email} />
                </LockedField>
                <LockedField label="Mobile number *" fromProfile={!!prefill?.phone}>
                  <TI v={personal.phone} set={sp("phone")} ph="+91 98765 43210" readOnly={!!prefill?.phone} />
                </LockedField>
                <FL label="Gender"><Sel v={personal.gender} set={sp("gender")}>
                  <option value="">— select —</option>
                  {["Male","Female","Other","Prefer not to say"].map(o=><option key={o}>{o}</option>)}
                </Sel></FL>
                <FL label="Marital status"><Sel v={personal.marital_status} set={sp("marital_status")}>
                  <option value="">— select —</option>
                  {["Single","Married","Divorced","Widowed","Separated"].map(o=><option key={o}>{o}</option>)}
                </Sel></FL>
                <FL label="Residential status"><Sel v={personal.residential_status} set={sp("residential_status")}>
                  {["Resident Indian","NRI","PIO/OCI","Foreign National"].map(o=><option key={o}>{o}</option>)}
                </Sel></FL>
                <FL label="Client type"><Sel v={personal.client_type} set={sp("client_type")}>
                  {["Individual","HUF","Partnership","Company","Trust","NRI"].map(o=><option key={o}>{o}</option>)}
                </Sel></FL>
                <FL label="Nationality"><TI v={personal.nationality} set={sp("nationality")} ph="Indian" /></FL>
                <div className="col-span-2">
                  <FL label="Residential address"><TI v={personal.address} set={sp("address")} ph="Full residential address" /></FL>
                </div>
              </div>
            </div>
          )}

          {/* ═══ EMPLOYMENT ═══ */}
          {curStep === "employment" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <LockedField label="Occupation" fromProfile={!!prefill?.occupation}>
                  <Sel v={emp.occupation} set={se("occupation")}>
                    <option value="">— select —</option>
                    {["Salaried","Self-employed","Business","Retired","Student","Homemaker","Other"].map(o=><option key={o}>{o}</option>)}
                  </Sel>
                </LockedField>
                <FL label="Employer / Company name"><TI v={emp.employer} set={se("employer")} ph="e.g. Infosys Ltd." /></FL>
                <FL label="Industry / Sector"><Sel v={emp.industry} set={se("industry")}>
                  <option value="">— select —</option>
                  {["Banking & Finance","IT / Technology","Healthcare","Manufacturing","Real Estate","Education","Government / PSU","Retail / FMCG","Media / Entertainment","Legal","Consulting","Other"].map(o=><option key={o}>{o}</option>)}
                </Sel></FL>
                <FL label="Years of experience"><TI v={emp.years_exp} set={se("years_exp")} type="number" ph="e.g. 12" /></FL>
                <FL label="Career stage"><Sel v={emp.career_stage} set={se("career_stage")}>
                  <option value="">— select —</option>
                  {["Early career (0–5 yrs)","Mid career (5–15 yrs)","Senior / Leadership","Pre-retirement","Retired"].map(o=><option key={o}>{o}</option>)}
                </Sel></FL>
                <FL label="Education qualification"><Sel v={emp.education} set={se("education")}>
                  <option value="">— select —</option>
                  {["Below 10th","10th / SSC","12th / HSC","Diploma","Graduate","Post-graduate","Doctorate","Professional (CA/CS/CFA/MBA)"].map(o=><option key={o}>{o}</option>)}
                </Sel></FL>
                <div className="col-span-2">
                  <FL label="Dependants detail" note="Names, ages, special needs, education funding etc.">
                    <TI v={emp.dependants_detail} set={se("dependants_detail")} ph="e.g. Spouse (35), Son (8), Mother (68 — requires medical support)" />
                  </FL>
                </div>
              </div>
              <div className="border border-[#E7EFEF] rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#0F3A46]">Additional flags</p>
                <div className="grid grid-cols-2 gap-3">
                  <Toggle v={emp.owns_business} set={seB("owns_business")} label="Owns a business or is a business partner" />
                  <Toggle v={emp.sole_earner} set={seB("sole_earner")} label="Sole earner in the family" />
                  <Toggle v={emp.expecting_inheritance} set={seB("expecting_inheritance")} label="Expecting a significant inheritance" />
                  <Toggle v={emp.plan_change} set={seB("plan_change")} label="Planning a career/income change soon" />
                </div>
              </div>
            </div>
          )}

          {/* ═══ FINANCIAL ═══ */}
          {curStep === "financial" && (
            <div className="space-y-4">
              <p className="text-xs text-[#6B7E86]">All amounts in Indian Rupees (₹), annual unless noted.</p>
              <div className="grid grid-cols-2 gap-4">
                <FL label="Self income (₹ / year)"><TI v={fin.income_self} set={sf("income_self")} type="number" ph="e.g. 1200000" /></FL>
                <FL label="Spouse income (₹ / year)"><TI v={fin.income_spouse} set={sf("income_spouse")} type="number" ph="0 if N/A" /></FL>
                <FL label="Other income (₹ / year)" note="Rental, dividends, business profit…"><TI v={fin.income_other} set={sf("income_other")} type="number" ph="0" /></FL>
                <FL label="Life insurance cover (₹)" note="Total sum assured across all policies"><TI v={fin.life_cover} set={sf("life_cover")} type="number" ph="0" /></FL>
                <FL label="Target retirement age"><TI v={fin.retirement_age} set={sf("retirement_age")} type="number" ph="60" /></FL>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FL label="Will in place?"><Sel v={fin.will_status} set={sf("will_status")}>{["No","Yes","In progress"].map(o=><option key={o}>{o}</option>)}</Sel></FL>
                <FL label="Politically exposed person?"><Sel v={fin.pep} set={sf("pep")}><option value="No">No</option><option value="Yes">Yes</option></Sel></FL>
                <FL label="FATCA applicable?"><Sel v={fin.fatca} set={sf("fatca")}><option value="No">No</option><option value="Yes">Yes</option></Sel></FL>
              </div>
            </div>
          )}

          {/* ═══ INSURANCE & ESTATE ═══ */}
          {curStep === "insurance" && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-[#0F3A46] mb-3">Insurance coverage</p>
                <div className="grid grid-cols-2 gap-4">
                  <FL label="Health / Mediclaim cover (₹)" note="Total floater or individual sum insured">
                    <TI v={ins.health_cover} set={si("health_cover")} type="number" ph="e.g. 500000" />
                  </FL>
                  <FL label="Employer-provided cover (₹)" note="Group health cover from employer">
                    <TI v={ins.employer_cover} set={si("employer_cover")} type="number" ph="0 if N/A" />
                  </FL>
                  <div className="col-span-2">
                    <FL label="Other covers held" note="e.g. Term, Critical illness, Personal accident, Travel">
                      <TI v={ins.covers_held} set={si("covers_held")} ph="List all other insurance policies held" />
                    </FL>
                  </div>
                  <FL label="Nominees updated on all policies?">
                    <Sel v={ins.nominees_updated} set={si("nominees_updated")}>
                      {["Yes","No","Partially"].map(o=><option key={o}>{o}</option>)}
                    </Sel>
                  </FL>
                </div>
              </div>
              <div className="border-t border-[#E7EFEF] pt-4">
                <p className="text-xs font-semibold text-[#0F3A46] mb-3">Estate planning</p>
                <div className="grid grid-cols-3 gap-4">
                  <FL label="Trust set up?">
                    <Sel v={ins.trust_status} set={si("trust_status")}>
                      {["No","Yes — Private","Yes — Public","In progress"].map(o=><option key={o}>{o}</option>)}
                    </Sel>
                  </FL>
                  <FL label="Power of Attorney?">
                    <Sel v={ins.poa_status} set={si("poa_status")}>
                      {["No","Yes — General","Yes — Limited","In progress"].map(o=><option key={o}>{o}</option>)}
                    </Sel>
                  </FL>
                  <FL label="Guardian appointed (for minors)?">
                    <Sel v={ins.guardian_status} set={si("guardian_status")}>
                      {["N/A","Yes","No"].map(o=><option key={o}>{o}</option>)}
                    </Sel>
                  </FL>
                </div>
              </div>
            </div>
          )}

          {/* ═══ FAMILY ═══ */}
          {curStep === "family" && (
            <div className="space-y-4">
              {family.length === 0 && (
                <p className="text-center py-4 text-sm text-[#6B7E86]">No family members added. Click below to add dependants and family.</p>
              )}
              {family.map((f, i) => (
                <div key={i} className="border border-[#E7EFEF] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0F3A46]">Member {i+1}</span>
                    <button onClick={() => setFamily(fs=>fs.filter((_,fi)=>fi!==i))} className="text-[10px] text-[#B4463C]">Remove</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FL label="Name"><TI v={f.name} set={v=>updF(i,"name",v)} /></FL>
                    <FL label="Relationship"><Sel v={f.relationship} set={v=>updF(i,"relationship",v)}>
                      <option value="">—</option>
                      {["Spouse","Son","Daughter","Father","Mother","Father-in-law","Mother-in-law","Sibling","Other"].map(o=><option key={o}>{o}</option>)}
                    </Sel></FL>
                    <FL label="Age"><TI v={f.age} set={v=>updF(i,"age",v)} type="number" /></FL>
                    <FL label="Occupation"><TI v={f.occupation} set={v=>updF(i,"occupation",v)} ph="e.g. Student, Retired" /></FL>
                    <FL label="Annual income (₹)"><TI v={f.annual_income} set={v=>updF(i,"annual_income",v)} type="number" ph="0 if none" /></FL>
                    <FL label="Health status"><Sel v={f.health_status} set={v=>updF(i,"health_status",v)}>
                      <option value="">—</option>
                      {["Excellent","Good","Average","Poor","Requires special care"].map(o=><option key={o}>{o}</option>)}
                    </Sel></FL>
                  </div>
                </div>
              ))}
              <button onClick={()=>setFamily(fs=>[...fs,emptyFam()])} className="w-full py-2 border border-dashed border-[#CBD9DC] rounded-xl text-sm text-[#175A69] hover:bg-[#F0F5F6]">+ Add family member</button>
            </div>
          )}

          {/* ═══ GOALS ═══ */}
          {curStep === "goals" && (
            <div className="space-y-4">
              {goals.map((g, i) => (
                <div key={i} className="border border-[#E7EFEF] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0F3A46]">Goal {i+1}</span>
                    {goals.length > 1 && <button onClick={()=>setGoals(gs=>gs.filter((_,gi)=>gi!==i))} className="text-[10px] text-[#B4463C]">Remove</button>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <FL label="Goal name"><TI v={g.goal_name} set={v=>updG(i,"goal_name",v)} ph="e.g. Child education, Retirement, Home purchase" /></FL>
                    </div>
                    <FL label="Target year"><TI v={g.target_year} set={v=>updG(i,"target_year",v)} type="number" ph="e.g. 2035" /></FL>
                    <FL label="Cost today (₹)"><TI v={g.cost_today} set={v=>updG(i,"cost_today",v)} type="number" ph="Today's cost estimate" /></FL>
                    <FL label="Already saved (₹)"><TI v={g.saved} set={v=>updG(i,"saved",v)} type="number" ph="0" /></FL>
                    <FL label="Monthly SIP towards goal (₹)"><TI v={g.monthly_sip} set={v=>updG(i,"monthly_sip",v)} type="number" ph="0" /></FL>
                    <FL label="Assumed inflation (%)" note="Annual cost escalation for this goal">
                      <TI v={g.inflation_pct} set={v=>updG(i,"inflation_pct",v)} type="number" ph="6" />
                    </FL>
                    <FL label="Expected return (%)" note="Expected portfolio return for this goal">
                      <TI v={g.return_pct} set={v=>updG(i,"return_pct",v)} type="number" ph="12" />
                    </FL>
                    <FL label="Priority"><Sel v={g.priority} set={v=>updG(i,"priority",v)}>
                      {GOAL_PRIORITIES.map(p=><option key={p}>{p}</option>)}
                    </Sel></FL>
                    <FL label="Flexibility"><Sel v={g.flexibility} set={v=>updG(i,"flexibility",v)}>
                      {GOAL_FLEXIBILITIES.map(f=><option key={f}>{f}</option>)}
                    </Sel></FL>
                  </div>
                </div>
              ))}
              <button onClick={()=>setGoals(gs=>[...gs,emptyGoal()])} className="w-full py-2 border border-dashed border-[#CBD9DC] rounded-xl text-sm text-[#175A69] hover:bg-[#F0F5F6]">+ Add another goal</button>
            </div>
          )}

          {/* ═══ LOANS ═══ */}
          {curStep === "loans" && (
            <div className="space-y-4">
              {loans.length === 0 && (
                <p className="text-center py-6 text-sm text-[#6B7E86]">No loans recorded. Add one below if applicable.</p>
              )}
              {loans.map((l, i) => (
                <div key={i} className="border border-[#E7EFEF] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0F3A46]">Loan {i+1}</span>
                    <button onClick={()=>setLoans(ls=>ls.filter((_,li)=>li!==i))} className="text-[10px] text-[#B4463C]">Remove</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FL label="Loan type"><Sel v={l.loan_type} set={v=>updL(i,"loan_type",v)}>
                      {LOAN_TYPES.map(t=><option key={t}>{t}</option>)}
                    </Sel></FL>
                    <FL label="Lender"><TI v={l.lender} set={v=>updL(i,"lender",v)} ph="e.g. HDFC Bank" /></FL>
                    <FL label="Outstanding principal (₹)"><TI v={l.outstanding} set={v=>updL(i,"outstanding",v)} type="number" /></FL>
                    <FL label="Monthly EMI (₹)"><TI v={l.emi} set={v=>updL(i,"emi",v)} type="number" /></FL>
                    <FL label="Interest rate (% p.a.)"><TI v={l.rate} set={v=>updL(i,"rate",v)} type="number" ph="e.g. 8.5" /></FL>
                    <FL label="Remaining tenure (months)"><TI v={l.tenure_months} set={v=>updL(i,"tenure_months",v)} type="number" /></FL>
                  </div>
                </div>
              ))}
              <button onClick={()=>setLoans(ls=>[...ls,emptyLoan()])} className="w-full py-2 border border-dashed border-[#CBD9DC] rounded-xl text-sm text-[#175A69] hover:bg-[#F0F5F6]">+ Add a loan</button>
            </div>
          )}

          {/* ═══ INVESTMENTS ═══ */}
          {curStep === "investments" && (
            <div className="space-y-4">
              <p className="text-xs text-[#6B7E86]">Approximate current market value (₹) of existing holdings per category. Leave blank if none.</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["equity","Direct Equity / Stocks"],
                  ["mutual_funds","Mutual Funds (all types)"],
                  ["epf_ppf","EPF / PPF / NPS"],
                  ["fd_bonds","FDs / Bonds / NCDs"],
                  ["gold","Gold (physical / SGBs / Gold ETF)"],
                  ["real_estate","Real estate (investment property)"],
                  ["international","International / US Funds"],
                  ["insurance","Insurance-linked (ULIP / endowment)"],
                  ["cash","Cash / Savings / Liquid"],
                  ["alts","Alternatives (PMS / AIF / REIT)"],
                ].map(([k,l]) => (
                  <FL key={k} label={l}>
                    <TI v={invs[k]??""} set={v=>setInvs(iv=>({...iv,[k]:v}))} type="number" ph="₹ 0" />
                  </FL>
                ))}
              </div>
            </div>
          )}

          {/* ═══ RISK Q1-19 ═══ */}
          {curStep === "risk" && (
            <div className="space-y-5">
              <div className="flex gap-2 flex-wrap items-center">
                <span className="bg-[#EBF3F5] text-[#175A69] border border-[#C8D8DB] rounded-full px-3 py-1 text-xs font-medium">Q1–8: Risk Capacity</span>
                <span className="bg-[#FEF9E7] text-[#7D6B2E] border border-[#E8C840] rounded-full px-3 py-1 text-xs font-medium">Q9–15: Risk Tolerance</span>
                <span className="bg-[#F3EEF8] text-[#5B3A7A] border border-[#C4AADD] rounded-full px-3 py-1 text-xs font-medium">Q16–19: Knowledge</span>
                <span className={"ml-auto text-xs font-semibold " + (riskDone===19?"text-[#2E7D5B]":"text-[#6B7E86]")}>{riskDone}/19 answered</span>
              </div>
              {ALL_RISK_QUESTIONS.map(q => {
                const bg = q.section==="capacity"
                  ? "bg-[#EBF3F5] border-[#C8D8DB]"
                  : q.section==="tolerance"
                    ? "bg-[#FEF9E7] border-[#E8C840]"
                    : "bg-[#F3EEF8] border-[#C4AADD]";
                return (
                  <div key={q.num} className={`border rounded-xl p-4 ${bg}`}>
                    <p className="text-sm font-semibold text-[#0F3A46] mb-3">
                      <span className="text-[10px] text-[#6B7E86] font-bold mr-2">Q{q.num}</span>{q.text}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map(o => (
                        <label key={o.letter} className={"flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors " + (riskAns[q.num]===o.letter ? "bg-[#0F3A46] text-white" : "bg-white hover:bg-white/80")}>
                          <input type="radio" name={`q${q.num}`} value={o.letter} checked={riskAns[q.num]===o.letter}
                            onChange={()=>setRiskAns(p=>({...p,[q.num]:o.letter}))} className="accent-[#C39A38] shrink-0" />
                          <span><strong>{o.letter}.</strong> {o.text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══ BEHAVIOUR ═══ */}
          {curStep === "behaviour" && (
            <div className="space-y-5">
              {[
                { key: "beh1" as const, q: "B1. If your portfolio fell 30% suddenly, you would:", opts: BEHAVIOUR_OPTIONS.beh1 },
                { key: "beh2" as const, q: "B2. Have you ever switched investments chasing recent performance?", opts: BEHAVIOUR_OPTIONS.beh2 },
                { key: "beh3" as const, q: "B3. How often do you check your investment portfolio?", opts: BEHAVIOUR_OPTIONS.beh3 },
              ].map(({ key, q, opts }) => (
                <div key={key} className="border border-[#E7EFEF] rounded-xl p-4">
                  <p className="text-sm font-semibold text-[#0F3A46] mb-3">{q}</p>
                  {opts.map(o => (
                    <label key={o.value} className={"flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer mb-1.5 text-xs " + (beh[key]===o.value ? "bg-[#0F3A46] text-white" : "bg-[#F5F9FA] hover:bg-[#EBF3F5]")}>
                      <input type="radio" name={key} checked={beh[key]===o.value}
                        onChange={()=>setBeh(b=>({...b,[key]:o.value}))} className="accent-[#C39A38] shrink-0" />
                      {o.label}
                    </label>
                  ))}
                </div>
              ))}
              <div className="border border-[#E7EFEF] rounded-xl p-4">
                <p className="text-sm font-semibold text-[#0F3A46] mb-3">K. Self-assessed knowledge level per asset class</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[#6B7E86] border-b border-[#E7EFEF]">
                      <th className="text-left py-2 pr-4 font-medium">Asset class</th>
                      {KNOWLEDGE_LEVELS.map(l=><th key={l} className="text-center py-2 px-3 font-medium">{l}</th>)}
                    </tr></thead>
                    <tbody>
                      {KNOWLEDGE_ASSETS.map(({ key, label }) => (
                        <tr key={key} className="border-b border-[#F0F5F6]">
                          <td className="py-2 pr-4 text-[#0F3A46]">{label}</td>
                          {KNOWLEDGE_LEVELS.map(level => (
                            <td key={level} className="text-center py-2 px-3">
                              <input type="radio" name={`kn_${key}`} value={level}
                                checked={knw[key]===level}
                                onChange={()=>setKnw(k=>({...k,[key]:level}))}
                                className="accent-[#175A69]" />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ REVIEW ═══ */}
          {curStep === "review" && (
            <div className="space-y-4">
              <div className="bg-[#EBF3F5] border border-[#C8D8DB] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-[#175A69]">Completion Summary</span>
                  <span className="font-mono font-bold text-[#0F3A46]">{clientCode}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs text-[#0F3A46]">
                  {[
                    ["Name", personal.full_name || "—"],
                    ["DOB", personal.dob || "—"],
                    ["PAN", personal.pan || "—"],
                    ["Employer", emp.employer || "—"],
                    ["Industry", emp.industry || "—"],
                    ["Goals", String(goals.filter(g=>g.goal_name).length)],
                    ["Loans", String(loans.length)],
                    ["Family", String(family.length)],
                    ["Risk Q", `${riskDone}/19`],
                  ].map(([l,v])=>(
                    <div key={l}><span className="text-[#6B7E86]">{l}: </span><strong>{v}</strong></div>
                  ))}
                </div>
              </div>
              {!canSubmit && (
                <div className="bg-[#FEF9E7] border border-[#E8C840] rounded-xl px-4 py-3 text-xs text-[#7D6B2E]">
                  <strong>Incomplete — </strong>
                  {riskDone<19 && <span>{19-riskDone} risk question(s) still unanswered. </span>}
                  {!beh.beh1 && <span>Behaviour Q1 unanswered. </span>}
                  {!beh.beh2 && <span>Behaviour Q2 unanswered. </span>}
                  {!beh.beh3 && <span>Behaviour Q3 unanswered.</span>}
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full py-3 bg-[#0F3A46] text-white font-semibold rounded-xl hover:bg-[#175A69] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : "Submit questionnaire & update profile"}
              </button>
            </div>
          )}

        </div>

        {/* Nav */}
        <div className="px-6 pb-6 flex justify-between">
          <button
            onClick={() => setStepIdx(i => Math.max(0, i-1))}
            disabled={stepIdx === 0}
            className="px-4 py-2 text-sm border border-[#CBD9DC] rounded-lg text-[#6B7E86] disabled:opacity-30"
          >
            ← Back
          </button>
          {stepIdx < QSTEPS.length - 1 && (
            <button
              onClick={() => setStepIdx(i => i+1)}
              className="px-5 py-2 text-sm bg-[#0F3A46] text-white rounded-lg hover:bg-[#175A69]"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
