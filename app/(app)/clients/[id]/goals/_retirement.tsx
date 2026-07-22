"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { retirementCorpus, type RetirementInput } from "@/lib/retirement";

function fmtCr(n: number) {
  const v = Math.round(n);
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(v) >= 100_000)    return `₹${(v / 100_000).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
const fmt0 = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export interface RetirementBase {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentMonthlyExpense: number;
  replacementPct: number;
  preRetInflationPct: number;
  postRetInflationPct: number;
  accumulationReturnPct: number;
  postRetReturnPct: number;
  monthlyPensionNow: number;
  existingCorpus: number;
  existingMonthlySip: number;
  defLifeExpectancy: number;
  defReplacementPct: number;
  defPostRet: number;
  defPostRetInflation: number;
  salaried: boolean;
  epfBasicSalary: number;
  epfEmployeePct: number;
  epfEmployerPct: number;
  epfBalance: number;
  epfRatePct: number;
  epfSalaryGrowthPct: number;
  defEpfRate: number;
  defSalaryGrowth: number;
}

function NumField({ label, unit, value, onChange, step = 1, hint }: {
  label: string; unit?: string; value: number; onChange: (n: number) => void; step?: number; hint?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-[#0F3A46] block mb-1">
        {label}{unit ? <span className="text-[#6B7E86] font-normal"> ({unit})</span> : null}
      </label>
      <input
        type="number" step={step} value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="w-full border border-[#CBD9DC] rounded-lg px-2.5 py-1.5 text-sm text-[#0F3A46] outline-none focus:border-[#175A69]"
      />
      {hint ? <p className="text-[10px] text-[#6B7E86] mt-0.5">{hint}</p> : null}
    </div>
  );
}

function Row({ k, v, strong }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 border-b border-[#EEF3F4] last:border-0 ${strong ? "font-semibold text-[#0F3A46]" : ""}`}>
      <span className="text-[11px] text-[#6B7E86]">{k}</span>
      <span className={`text-xs ${strong ? "text-[#0F3A46]" : "text-[#334E56]"} text-right`}>{v}</span>
    </div>
  );
}

export default function RetirementPlanner({ clientId, base }: { clientId: string; base: RetirementBase }) {
  const router = useRouter();

  const [currentAge, setCurrentAge]       = useState(base.currentAge);
  const [retirementAge, setRetirementAge] = useState(base.retirementAge);
  const [lifeExpectancy, setLifeExp]      = useState(base.lifeExpectancy);
  const [curExpense, setCurExpense]       = useState(base.currentMonthlyExpense);
  const [replacement, setReplacement]     = useState(base.replacementPct);
  const [preInfl, setPreInfl]             = useState(base.preRetInflationPct);
  const [postInfl, setPostInfl]           = useState(base.postRetInflationPct);
  const [accReturn, setAccReturn]         = useState(base.accumulationReturnPct);
  const [postRet, setPostRet]             = useState(base.postRetReturnPct);
  const [pension, setPension]             = useState(base.monthlyPensionNow);
  const [corpus, setCorpus]               = useState(base.existingCorpus);
  const [existingSip, setExistingSip]     = useState(base.existingMonthlySip);
  const [salaried, setSalaried]           = useState(base.salaried);
  const [epfBasic, setEpfBasic]           = useState(base.epfBasicSalary);
  const [epfEmpPct, setEpfEmpPct]         = useState(base.epfEmployeePct);
  const [epfEmprPct, setEpfEmprPct]       = useState(base.epfEmployerPct);
  const [epfBalance, setEpfBalance]       = useState(base.epfBalance);
  const [epfRate, setEpfRate]             = useState(base.epfRatePct);
  const [salaryGrowth, setSalaryGrowth]   = useState(base.epfSalaryGrowthPct);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const epfContribution = Math.round(epfBasic * (epfEmpPct + epfEmprPct) / 100);
  const inp: RetirementInput = useMemo(() => ({
    currentAge, retirementAge, lifeExpectancy,
    currentMonthlyExpense: curExpense, replacementPct: replacement,
    preRetInflationPct: preInfl, postRetInflationPct: postInfl,
    accumulationReturnPct: accReturn, postRetReturnPct: postRet,
    monthlyPensionNow: pension, existingCorpus: corpus, existingMonthlySip: existingSip,
    salaried, epfBalance, epfMonthlyContribution: epfContribution,
    epfRatePct: epfRate, epfSalaryGrowthPct: salaryGrowth,
  }), [currentAge, retirementAge, lifeExpectancy, curExpense, replacement, preInfl, postInfl, accReturn, postRet, pension, corpus, existingSip, salaried, epfBalance, epfContribution, epfRate, salaryGrowth]);

  // Toggling salaried moves the corpus between the EPF and non-EPF buckets so no money is lost.
  const toggleSalaried = () => {
    if (salaried) { setCorpus(corpus + epfBalance); setEpfBalance(0); setSalaried(false); }
    else { setEpfBalance(epfBalance + corpus); setCorpus(0); setSalaried(true); }
    setSaved(false);
  };

  const r = useMemo(() => retirementCorpus(inp), [inp]);

  const sens = useMemo(() => {
    const ages = [75, 80, 85, 90, 95, 100].filter(a => a > retirementAge);
    return ages.map(a => ({ age: a, corpus: retirementCorpus({ ...inp, lifeExpectancy: a }).corpusRequired }));
  }, [inp, retirementAge]);

  const depMax = Math.max(1, ...r.depletion.map(d => d.corpusStart));

  const onSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/retirement`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        life_expectancy: Math.round(lifeExpectancy),
        retirement_replacement_pct: replacement,
        retirement_age: Math.round(retirementAge),
        ret_pension: pension,
        is_salaried: salaried,
        epf_basic_salary: epfBasic,
        epf_employee_pct: epfEmpPct,
        epf_employer_pct: epfEmprPct,
        epf_rate_pct: epfRate,
        epf_salary_growth_pct: salaryGrowth,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  };

  const funded = r.fundedPct;
  const fundColor = funded >= 90 ? "#2E7D5B" : funded >= 50 ? "#C39A38" : "#B4463C";
  const hasPension = pension > 0;

  return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-[#0F3A46] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">Retirement corpus planner</h2>
          <p className="text-[11px] text-[#A9CDD4] mt-0.5">
            Present-value method — the corpus must fund {r.retirementYears} years of inflation-linked
            expenses from age {retirementAge} to {lifeExpectancy}, at a real return of {r.realRatePct}% p.a.
          </p>
        </div>
        <button onClick={onSave} disabled={saving}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg border border-white/25 disabled:opacity-50">
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save to client"}
        </button>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Inputs ── */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">Client</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Current age" value={currentAge} onChange={setCurrentAge} />
              <NumField label="Retirement age" value={retirementAge} onChange={setRetirementAge} />
            </div>
          </div>

          {/* Life expectancy — the headline lever */}
          <div className="bg-[#F5F9FA] border border-[#CBD9DC] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#0F3A46]">Life expectancy</label>
              <span className="text-sm font-bold text-[#0F3A46]">{lifeExpectancy} yrs</span>
            </div>
            <input type="range" min={Math.max(retirementAge + 1, 65)} max={105} step={1}
              value={lifeExpectancy} onChange={(e) => setLifeExp(Number(e.target.value))}
              className="w-full accent-[#175A69]" />
            <div className="flex justify-between text-[10px] text-[#6B7E86] mt-0.5">
              <span>{Math.max(retirementAge + 1, 65)}</span>
              <span>plan default {base.defLifeExpectancy}</span>
              <span>105</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">Expenses &amp; income</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Current expense" unit="₹/mo" value={curExpense} onChange={setCurExpense} step={1000} />
              <NumField label="Replacement" unit="%" value={replacement} onChange={setReplacement}
                hint={`${replacement}% of current expense`} />
              <NumField label="Pension / other" unit="₹/mo" value={pension} onChange={setPension} step={1000} hint="in today's money" />
              <div />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">Already earmarked</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label={salaried ? "Other corpus (non-EPF)" : "Existing corpus"} unit="₹" value={corpus} onChange={setCorpus} step={100000} hint={salaried ? "mutual funds / other savings" : "EPF / NPS / saved"} />
              <NumField label="Ongoing SIP" unit="₹/mo" value={existingSip} onChange={setExistingSip} step={1000} />
            </div>
          </div>

          {/* EPF — salaried only */}
          <div className="bg-[#F5F9FA] border border-[#CBD9DC] rounded-lg p-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide">EPF (salaried)</span>
              <span className="relative inline-flex items-center">
                <input type="checkbox" checked={salaried} onChange={toggleSalaried} className="sr-only peer" />
                <span className="w-9 h-5 bg-[#CBD9DC] peer-checked:bg-[#175A69] rounded-full transition-colors"></span>
                <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></span>
              </span>
            </label>
            {salaried && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumField label="Monthly basic pay" unit="₹" value={epfBasic} onChange={setEpfBasic} step={1000} />
                <NumField label="EPF balance now" unit="₹" value={epfBalance} onChange={setEpfBalance} step={100000} hint="current passbook balance" />
                <NumField label="Employee share" unit="%" value={epfEmpPct} onChange={setEpfEmpPct} step={0.01} />
                <NumField label="Employer share" unit="%" value={epfEmprPct} onChange={setEpfEmprPct} step={0.01} hint="8.33% of the 12% funds EPS pension" />
                <NumField label="EPF interest" unit="%" value={epfRate} onChange={setEpfRate} step={0.05} hint={`default ${base.defEpfRate}%`} />
                <NumField label="Salary growth" unit="%" value={salaryGrowth} onChange={setSalaryGrowth} step={0.5} hint={`default ${base.defSalaryGrowth}%`} />
                <div className="col-span-2 text-[10px] text-[#175A69] bg-white border border-[#CBD9DC] rounded px-2 py-1">
                  Contribution ≈ <strong>{fmt0(epfContribution)}/mo</strong> (employee + employer) → grows {salaryGrowth}% p.a., earns {epfRate}% p.a.
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">Assumptions</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Inflation — pre-retire" unit="%" value={preInfl} onChange={setPreInfl} step={0.1} />
              <NumField label="Inflation — in retirement" unit="%" value={postInfl} onChange={setPostInfl} step={0.1} />
              <NumField label="Return — pre-retire" unit="%" value={accReturn} onChange={setAccReturn} step={0.1} hint="on savings/SIP" />
              <NumField label="Return — on corpus" unit="%" value={postRet} onChange={setPostRet} step={0.1} hint={`default ${base.defPostRet}%`} />
            </div>
          </div>
        </div>

        {/* ── Results ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Headline */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0F3A46] rounded-lg p-3 col-span-2">
              <div className="text-[11px] text-[#A9CDD4] mb-1">Corpus required at retirement (age {retirementAge})</div>
              <div className="text-2xl font-bold font-serif text-white">{fmtCr(r.corpusRequired)}</div>
              <div className="text-[10px] text-[#A9CDD4] mt-1">
                to fund {fmt0(r.netMonthlyExpenseAtRetirement)}/mo{hasPension ? " (net of pension)" : ""}, rising {postInfl}% p.a. for {r.retirementYears} yrs
              </div>
            </div>
            <div className="bg-[#F5F9FA] border border-[#CBD9DC] rounded-lg p-3">
              <div className="text-[11px] text-[#6B7E86] mb-1">Projected by retirement</div>
              <div className="font-bold text-[#0F3A46]">{fmtCr(r.projectedCorpus)}</div>
              <div className="text-[10px] text-[#6B7E86] mt-1">{salaried ? "corpus + SIP + EPF grown" : "corpus + SIP grown"}</div>
            </div>
            <div className="rounded-lg p-3 border" style={{ background: r.shortfall > 0 ? "#FFF7F6" : "#E4F1EA", borderColor: r.shortfall > 0 ? "#E4B3AE" : "#B3D9C3" }}>
              <div className="text-[11px] text-[#6B7E86] mb-1">Shortfall</div>
              <div className="font-bold" style={{ color: r.shortfall > 0 ? "#B4463C" : "#2E7D5B" }}>
                {r.shortfall > 0 ? fmtCr(r.shortfall) : "Fully funded ✓"}
              </div>
              <div className="text-[10px] text-[#6B7E86] mt-1">{funded}% funded</div>
            </div>
          </div>

          <div className="w-full bg-[#E7EFEF] rounded-full h-2">
            <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, funded)}%`, background: fundColor }} />
          </div>

          {r.shortfall > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-2 bg-[#FFF7F6] border border-[#E4B3AE] rounded-lg px-4 py-2.5">
              <div>
                <span className="text-xs text-[#6B7E86]">Additional SIP needed: </span>
                <span className="text-sm font-bold text-[#B4463C]">{fmtCr(r.requiredMonthlySip)}/mo</span>
                <span className="text-[10px] text-[#6B7E86]"> (on top of current)</span>
              </div>
              <div>
                <span className="text-xs text-[#6B7E86]">OR lumpsum today: </span>
                <span className="text-sm font-bold text-[#8A6D1C]">{fmtCr(r.requiredLumpsumToday)}</span>
              </div>
            </div>
          )}

          {/* Calculation breakdown — mirrors the standard PV worksheet */}
          <div className="bg-[#FAFCFC] border border-[#E7EFEF] rounded-lg px-4 py-2">
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-1">How it&apos;s calculated</div>
            <Row k="Retirement expense today" v={`${fmt0(r.retExpenseMonthlyToday)}/mo (${replacement}% of ${fmt0(curExpense)})`} />
            <Row k={`Grown ${preInfl}% p.a. for ${r.yearsToRetirement} yrs to retirement`} v={`${fmt0(r.monthlyExpenseAtRetirement)}/mo`} />
            {hasPension && <Row k="Less pension at retirement" v={`− ${fmt0(r.monthlyPensionAtRetirement)}/mo → ${fmt0(r.netMonthlyExpenseAtRetirement)}/mo net`} />}
            <Row k={`Real return (1+${postRet}%)/(1+${postInfl}%) − 1`} v={`${r.realRatePct}% p.a.`} />
            <Row k="Months in retirement (nper)" v={`${r.retirementMonths}`} />
            <Row strong k={`Corpus = PV(${r.realRatePct}%/12, ${r.retirementMonths}, ${fmt0(r.netMonthlyExpenseAtRetirement)})`} v={fmtCr(r.corpusRequired)} />
            {salaried && <Row k={`EPF corpus by retirement (contrib ${fmt0(epfContribution)}/mo, grows ${salaryGrowth}%, earns ${epfRate}%)`} v={fmtCr(r.epfCorpusAtRetirement)} />}
          </div>

          {/* Drawdown depletion curve */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide">
                {r.shortfall > 0 ? "Projected corpus drawdown" : "Required corpus drawdown"}
              </div>
              {r.runsOutAtAge !== null
                ? <span className="text-[10px] font-semibold text-[#B4463C]">Money runs out at age {r.runsOutAtAge}</span>
                : <span className="text-[10px] font-semibold text-[#2E7D5B]">Lasts to age {lifeExpectancy} ✓</span>}
            </div>
            <svg viewBox={`0 0 ${Math.max(1, r.depletion.length) * 10} 60`} preserveAspectRatio="none" className="w-full h-16 bg-[#F5F9FA] rounded-lg border border-[#E7EFEF]">
              {r.depletion.map((d, i) => {
                const h = (d.corpusStart / depMax) * 56;
                return <rect key={i} x={i * 10 + 1} y={58 - h} width={8} height={Math.max(0.5, h)}
                  fill={d.corpusStart > 0 ? "#175A69" : "#E4B3AE"} rx={1} />;
              })}
            </svg>
            <div className="flex justify-between text-[10px] text-[#6B7E86] mt-0.5">
              <span>age {retirementAge}</span>
              <span>corpus is drawn down as inflation raises each year&apos;s withdrawal</span>
              <span>age {lifeExpectancy}</span>
            </div>
          </div>

          {/* Life-expectancy sensitivity */}
          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">
              Corpus required vs. life expectancy
            </div>
            <div className="grid grid-cols-6 gap-2">
              {sens.map(({ age, corpus: c }) => {
                const active = age === lifeExpectancy;
                return (
                  <button key={age} onClick={() => setLifeExp(age)}
                    className={`rounded-lg px-1 py-2 text-center border transition-colors ${active ? "bg-[#0F3A46] border-[#0F3A46]" : "bg-[#F5F9FA] border-[#CBD9DC] hover:border-[#175A69]"}`}>
                    <div className={`text-[10px] ${active ? "text-[#A9CDD4]" : "text-[#6B7E86]"}`}>age {age}</div>
                    <div className={`text-xs font-bold ${active ? "text-white" : "text-[#0F3A46]"}`}>{fmtCr(c)}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#6B7E86] mt-2">
              Longevity risk: living longer means the corpus must cover more inflating years, which is why the
              life-expectancy assumption materially changes the number. Click an age to apply it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
