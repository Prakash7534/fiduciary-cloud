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

export interface RetirementBase {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentMonthlyExpense: number;
  replacementPct: number;
  inflationPct: number;
  accumulationReturnPct: number;
  postRetReturnPct: number;
  monthlyPensionNow: number;
  existingCorpus: number;
  existingMonthlySip: number;
  // display-only defaults
  defLifeExpectancy: number;
  defReplacementPct: number;
  defPostRet: number;
}

function NumField({ label, unit, value, onChange, step = 1, hint, wide }: {
  label: string; unit?: string; value: number; onChange: (n: number) => void; step?: number; hint?: string; wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
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

export default function RetirementPlanner({ clientId, base }: { clientId: string; base: RetirementBase }) {
  const router = useRouter();

  const [currentAge, setCurrentAge]       = useState(base.currentAge);
  const [retirementAge, setRetirementAge] = useState(base.retirementAge);
  const [lifeExpectancy, setLifeExp]      = useState(base.lifeExpectancy);
  const [curExpense, setCurExpense]       = useState(base.currentMonthlyExpense);
  const [replacement, setReplacement]     = useState(base.replacementPct);
  const [inflation, setInflation]         = useState(base.inflationPct);
  const [accReturn, setAccReturn]         = useState(base.accumulationReturnPct);
  const [postRet, setPostRet]             = useState(base.postRetReturnPct);
  const [pension, setPension]             = useState(base.monthlyPensionNow);
  const [corpus, setCorpus]               = useState(base.existingCorpus);
  const [existingSip, setExistingSip]     = useState(base.existingMonthlySip);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const inp: RetirementInput = useMemo(() => ({
    currentAge, retirementAge, lifeExpectancy,
    currentMonthlyExpense: curExpense, replacementPct: replacement,
    inflationPct: inflation, accumulationReturnPct: accReturn, postRetReturnPct: postRet,
    monthlyPensionNow: pension, existingCorpus: corpus, existingMonthlySip: existingSip,
  }), [currentAge, retirementAge, lifeExpectancy, curExpense, replacement, inflation, accReturn, postRet, pension, corpus, existingSip]);

  const r = useMemo(() => retirementCorpus(inp), [inp]);

  // Life-expectancy sensitivity — corpus required at a spread of ages.
  const sens = useMemo(() => {
    const ages = [75, 80, 85, 90, 95, 100].filter(a => a > retirementAge);
    const rows = ages.map(a => ({ age: a, corpus: retirementCorpus({ ...inp, lifeExpectancy: a }).corpusRequired }));
    const max = Math.max(1, ...rows.map(x => x.corpus));
    return { rows, max };
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
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  };

  const funded = r.fundedPct;
  const fundColor = funded >= 90 ? "#2E7D5B" : funded >= 50 ? "#C39A38" : "#B4463C";

  return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-[#0F3A46] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">Retirement corpus planner</h2>
          <p className="text-[11px] text-[#A9CDD4] mt-0.5">
            Models the post-retirement drawdown — the corpus must fund {r.retirementYears} years of inflation-growing
            expenses from age {retirementAge} to {lifeExpectancy}.
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
                hint={`retirement = ${replacement}% of current`} />
              <NumField label="Pension / other" unit="₹/mo" value={pension} onChange={setPension} step={1000} />
              <div />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">Already earmarked</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Existing corpus" unit="₹" value={corpus} onChange={setCorpus} step={100000} hint="EPF / NPS / saved" />
              <NumField label="Ongoing SIP" unit="₹/mo" value={existingSip} onChange={setExistingSip} step={1000} />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">Assumptions</div>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Inflation" unit="%" value={inflation} onChange={setInflation} step={0.1} />
              <NumField label="Pre-ret return" unit="%" value={accReturn} onChange={setAccReturn} step={0.1} />
              <NumField label="Post-ret return" unit="%" value={postRet} onChange={setPostRet} step={0.1}
                hint={`default ${base.defPostRet}%`} />
            </div>
          </div>
        </div>

        {/* ── Results ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Headline */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0F3A46] rounded-lg p-3 col-span-2 sm:col-span-2">
              <div className="text-[11px] text-[#A9CDD4] mb-1">Corpus required at retirement (age {retirementAge})</div>
              <div className="text-2xl font-bold font-serif text-white">{fmtCr(r.corpusRequired)}</div>
              <div className="text-[10px] text-[#A9CDD4] mt-1">
                to fund {fmtCr(r.netAnnualExpenseAtRetirement)}/yr (net of pension), growing {inflation}% p.a. for {r.retirementYears} yrs
              </div>
            </div>
            <div className="bg-[#F5F9FA] border border-[#CBD9DC] rounded-lg p-3">
              <div className="text-[11px] text-[#6B7E86] mb-1">Projected by retirement</div>
              <div className="font-bold text-[#0F3A46]">{fmtCr(r.projectedCorpus)}</div>
              <div className="text-[10px] text-[#6B7E86] mt-1">corpus + SIP grown</div>
            </div>
            <div className="rounded-lg p-3 border" style={{ background: r.shortfall > 0 ? "#FFF7F6" : "#E4F1EA", borderColor: r.shortfall > 0 ? "#E4B3AE" : "#B3D9C3" }}>
              <div className="text-[11px] text-[#6B7E86] mb-1">Shortfall</div>
              <div className="font-bold" style={{ color: r.shortfall > 0 ? "#B4463C" : "#2E7D5B" }}>
                {r.shortfall > 0 ? fmtCr(r.shortfall) : "Fully funded ✓"}
              </div>
              <div className="text-[10px] text-[#6B7E86] mt-1">{funded}% funded</div>
            </div>
          </div>

          {/* Funding bar */}
          <div>
            <div className="w-full bg-[#E7EFEF] rounded-full h-2">
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, funded)}%`, background: fundColor }} />
            </div>
          </div>

          {/* What to do */}
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

          {/* Drawdown depletion curve */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide">Corpus drawdown</div>
              {r.runsOutAtAge !== null
                ? <span className="text-[10px] font-semibold text-[#B4463C]">Runs out at age {r.runsOutAtAge}</span>
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
              <span>the corpus is drawn down as inflation raises each year&apos;s withdrawal</span>
              <span>age {lifeExpectancy}</span>
            </div>
          </div>

          {/* Life-expectancy sensitivity */}
          <div>
            <div className="text-[11px] font-semibold text-[#175A69] uppercase tracking-wide mb-2">
              Corpus required vs. life expectancy
            </div>
            <div className="grid grid-cols-6 gap-2">
              {sens.rows.map(({ age, corpus: c }) => {
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
              Living longer means the corpus must cover more inflating years — the reason a life-expectancy assumption
              materially changes the number. Click an age to apply it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
