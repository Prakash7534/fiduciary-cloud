// app/(app)/clients/[id]/goal-solver/_client.tsx
"use client";
import { useState } from "react";
import type { GoalRow } from "@/lib/riskEngine";

const THIS_YEAR = new Date().getFullYear();

function goalCalc(g: { cost_today: number; saved: number; monthly_sip: number; target_year: number; inflation_pct: number; return_pct: number }) {
  const years = Math.max(0, g.target_year - THIS_YEAR);
  const r = g.return_pct / 100;
  const infl = g.inflation_pct / 100;
  const n = years * 12;
  const rm = r / 12;
  const fv = g.cost_today * Math.pow(1 + infl, years);
  let path = g.saved * Math.pow(1 + r, years);
  if (g.monthly_sip > 0 && n > 0) path += g.monthly_sip * ((Math.pow(1 + rm, n) - 1) / rm);
  const gap = Math.max(0, fv - path);
  const extraSip = gap > 0 && n > 0 ? (gap * rm) / (Math.pow(1 + rm, n) - 1) : 0;
  return { years, fv, path, gap, extraSip };
}

function fmtCr(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[#6B7E86] mb-1">
        <span>{label}</span>
        <span className="font-semibold text-[#0F3A46]">{unit === "₹" ? fmtCr(value) : `${value}${unit}`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-[#CBD9DC] rounded-full appearance-none cursor-pointer accent-[#175A69]"
      />
      <div className="flex justify-between text-[10px] text-[#A8BDC3] mt-0.5">
        <span>{unit === "₹" ? fmtCr(min) : `${min}${unit}`}</span>
        <span>{unit === "₹" ? fmtCr(max) : `${max}${unit}`}</span>
      </div>
    </div>
  );
}

function FundingArc({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = 52, cx = 64, cy = 64;
  const circumference = Math.PI * r; // semi-circle
  const dash = (clamped / 100) * circumference;
  const color = clamped >= 90 ? "#2E7D5B" : clamped >= 50 ? "#C39A38" : "#B4463C";
  return (
    <svg viewBox="0 0 128 80" className="w-36">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#E7EFEF" strokeWidth="12" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="bold" fill={color}>{clamped.toFixed(0)}%</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#6B7E86">funded</text>
    </svg>
  );
}

export default function GoalSolverClient({ goals, monthlySurplus, assumeInflation = 6, assumeReturn = 10 }: { goals: GoalRow[]; monthlySurplus: number; assumeInflation?: number; assumeReturn?: number }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, Partial<{ cost_today: number; saved: number; monthly_sip: number; target_year: number; inflation_pct: number; return_pct: number }>>>({});

  if (goals.length === 0) {
    return (
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 text-center">
        <p className="text-[#6B7E86]">No goals recorded yet — upload a completed questionnaire first.</p>
      </div>
    );
  }

  const g = goals[selectedIdx];
  const ov = overrides[selectedIdx] ?? {};
  const params = {
    cost_today:    ov.cost_today    ?? Number(g.cost_today    ?? 0),
    saved:         ov.saved         ?? Number(g.saved         ?? 0),
    monthly_sip:   ov.monthly_sip   ?? Number(g.monthly_sip   ?? 0),
    target_year:   ov.target_year   ?? Number(g.target_year   ?? THIS_YEAR + 10),
    inflation_pct: ov.inflation_pct ?? Number(g.inflation_pct ?? assumeInflation),
    return_pct:    ov.return_pct    ?? Number(g.return_pct    ?? assumeReturn),
  };
  const calc = goalCalc(params);
  const fundedPct = calc.fv > 0 ? (calc.path / calc.fv) * 100 : 100;

  const set = (key: string, val: number) =>
    setOverrides(prev => ({ ...prev, [selectedIdx]: { ...(prev[selectedIdx] ?? {}), [key]: val } }));

  const reset = () => setOverrides(prev => { const n = { ...prev }; delete n[selectedIdx]; return n; });

  const MAX_COST = Math.max(50_000_000, params.cost_today * 3);
  const MAX_SIP  = Math.max(500_000,    monthlySurplus * 2 || 200_000);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
        <p className="text-xs text-[#6B7E86]">Adjust parameters below to solve for the required SIP or explore what-if scenarios. Changes here are not saved to the client record.</p>
      </div>

      {/* Goal selector */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-3">Select goal</h3>
        <div className="flex flex-wrap gap-2">
          {goals.map((g2, i) => (
            <button key={i} onClick={() => setSelectedIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                i === selectedIdx ? "bg-[#0F3A46] text-white" : "bg-[#DDE6E8] text-[#0F3A46] hover:bg-[#C8D8DB]"
              }`}>
              {g2.goal_name ?? `Goal ${i + 1}`}
              {g2.target_year ? ` (${g2.target_year})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Controls */}
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69]">Parameters</h3>
            <button onClick={reset} className="text-xs text-[#175A69] hover:underline">Reset to questionnaire values</button>
          </div>
          <Slider label="Goal cost today" value={params.cost_today} min={100000} max={MAX_COST} step={100000} unit="₹" onChange={v => set("cost_today", v)} />
          <Slider label="Already saved" value={params.saved} min={0} max={MAX_COST} step={50000} unit="₹" onChange={v => set("saved", v)} />
          <Slider label="Monthly SIP" value={params.monthly_sip} min={0} max={MAX_SIP} step={1000} unit="₹" onChange={v => set("monthly_sip", v)} />
          <Slider label="Target year" value={params.target_year} min={THIS_YEAR + 1} max={THIS_YEAR + 40} step={1} unit="" onChange={v => set("target_year", v)} />
          <Slider label="Inflation assumption" value={params.inflation_pct} min={3} max={12} step={0.5} unit="%" onChange={v => set("inflation_pct", v)} />
          <Slider label="Return assumption" value={params.return_pct} min={4} max={18} step={0.5} unit="%" onChange={v => set("return_pct", v)} />
        </div>

        {/* Results */}
        <div className="space-y-4">
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-5 flex flex-col items-center">
            <h3 className="text-xs font-semibold tracking-widest uppercase text-[#175A69] mb-4 self-start">Funding status</h3>
            <FundingArc pct={fundedPct} />
            <div className="mt-4 w-full space-y-2 text-sm">
              <div className="flex justify-between border-b border-[#E7EFEF] pb-1.5">
                <span className="text-[#6B7E86]">Future cost ({params.inflation_pct}% p.a.)</span>
                <span className="font-semibold text-[#0F3A46]">{fmtCr(calc.fv)}</span>
              </div>
              <div className="flex justify-between border-b border-[#E7EFEF] pb-1.5">
                <span className="text-[#6B7E86]">Projected corpus</span>
                <span className="font-semibold text-[#0F3A46]">{fmtCr(calc.path)}</span>
              </div>
              <div className="flex justify-between border-b border-[#E7EFEF] pb-1.5">
                <span className="text-[#6B7E86]">Shortfall</span>
                <span className={`font-semibold ${calc.gap > 0 ? "text-[#B4463C]" : "text-[#2E7D5B]"}`}>
                  {calc.gap > 0 ? fmtCr(calc.gap) : "None ✓"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7E86]">Time horizon</span>
                <span className="font-semibold text-[#0F3A46]">{calc.years} years</span>
              </div>
            </div>
          </div>

          {calc.gap > 0 ? (
            <div className="bg-[#FFF7F6] border border-[#E4B3AE] rounded-xl p-5">
              <h3 className="text-xs font-semibold tracking-widest uppercase text-[#B4463C] mb-3">Required additional SIP</h3>
              <div className="text-4xl font-bold font-serif text-[#B4463C]">{fmtCr(calc.extraSip)}<span className="text-lg">/mo</span></div>
              <p className="text-xs text-[#6B7E86] mt-2">
                To bridge the {fmtCr(calc.gap)} shortfall in {calc.years} years at {params.return_pct}% p.a.
              </p>
              {monthlySurplus > 0 && (
                <p className={`text-xs mt-1 font-medium ${calc.extraSip <= monthlySurplus ? "text-[#2E7D5B]" : "text-[#B4463C]"}`}>
                  {calc.extraSip <= monthlySurplus
                    ? `✓ Within monthly surplus of ${fmtCr(monthlySurplus)}`
                    : `✗ Exceeds monthly surplus of ${fmtCr(monthlySurplus)} by ${fmtCr(calc.extraSip - monthlySurplus)}`}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-[#E4F1EA] border border-[#B3D9C3] rounded-xl p-5">
              <h3 className="text-xs font-semibold tracking-widest uppercase text-[#2E7D5B] mb-2">Goal fully funded</h3>
              <p className="text-sm text-[#2E7D5B]">At the current SIP of {fmtCr(params.monthly_sip)}/mo, the projected corpus of {fmtCr(calc.path)} covers the target of {fmtCr(calc.fv)}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
