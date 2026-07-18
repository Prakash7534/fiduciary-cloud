"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AllocationPlan, BucketPlan, GoalMapping } from "@/lib/allocationEngine";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtL(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function fmtSIP(n: number) { return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}/mo`; }

const BUCKET_COLOR: Record<string, { bg: string; border: string; label: string }> = {
  short:  { bg: "bg-[#FEF3E2]", border: "border-[#E8A020]", label: "text-[#8B5E00]" },
  medium: { bg: "bg-[#EAF3F8]", border: "border-[#2C7DA0]", label: "text-[#1A4D6A]" },
  long:   { bg: "bg-[#E8F4EE]", border: "border-[#2E7D5B]", label: "text-[#1A5C3A]" },
};

const AC_COLOR: Record<string, string> = {
  Equity:        "#175A69",
  Debt:          "#C39A38",
  Gold:          "#B8860B",
  International: "#4A90C4",
  Hybrid:        "#7B5EA7",
  Alternate:     "#B4463C",
};

// ── SAA Donut SVG ─────────────────────────────────────────────────────────────
function DonutChart({ alloc }: { alloc: Record<string, number> }) {
  const entries = Object.entries(alloc).filter(([, v]) => v > 0);
  const r = 60; const cx = 80; const cy = 80; const stroke = 22;
  let cumulative = 0;
  const arcs = entries.map(([key, pct]) => {
    const start = cumulative / 100 * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const end = cumulative / 100 * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(start); const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);   const y2 = cy + r * Math.sin(end);
    const large = pct > 50 ? 1 : 0;
    return { key, pct, d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, color: AC_COLOR[key] ?? "#999" };
  });
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      {arcs.map(a => (
        <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={stroke}
          strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" className="text-xs" fill="#0F3A46" fontSize={11} fontWeight={600}>SAA</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#0F3A46" fontSize={9}>allocation</text>
    </svg>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────
function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const color = AC_COLOR[label] ?? "#175A69";
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 text-sm font-medium text-[#0F3A46] shrink-0 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        {label}
      </span>
      <input type="range" min={0} max={100} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="flex-1 accent-[#175A69] h-1.5" />
      <span className="w-10 text-right text-sm font-semibold text-[#0F3A46]">{value}%</span>
    </div>
  );
}

// ── Bucket card ───────────────────────────────────────────────────────────────
function BucketCard({ b }: { b: BucketPlan }) {
  const c = BUCKET_COLOR[b.bucket];
  return (
    <div className={`border ${c.border} ${c.bg} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className={`text-xs font-bold tracking-wide uppercase ${c.label}`}>{b.label}</span>
          <span className="text-xs text-[#6B7E86] ml-2">{b.horizon}</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-[#0F3A46]">{b.allocation_pct}% of portfolio</div>
          {b.goals.length > 0 && <div className="text-xs text-[#6B7E86]">{b.goals.length} goal{b.goals.length > 1 ? "s" : ""}</div>}
        </div>
      </div>
      {b.goals.length === 0 ? (
        <p className="text-xs text-[#6B7E86] italic">No goals in this horizon</p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {b.goals.map(g => (
            <span key={g.goal_id} className="text-xs bg-white/70 border border-white/50 px-2 py-0.5 rounded-full text-[#0F3A46]">
              {g.goal_name ?? "Goal"} · {fmtL(g.cost_today ?? 0)}
            </span>
          ))}
        </div>
      )}
      {b.instruments.length > 0 ? (
        <div className="space-y-2 mt-2">
          <div className="text-xs font-semibold text-[#0F3A46] uppercase tracking-wider mb-1">Recommended instruments</div>
          {b.instruments.map(inst => (
            <div key={inst.instrument_id} className="bg-white/80 rounded-lg px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#0F3A46]">{inst.name}</div>
                <div className="text-[10px] text-[#6B7E86] mt-0.5">
                  {inst.asset_class} · {inst.category ?? "—"}
                  {inst.return_5y != null && <span className="ml-2 text-[#2E7D5B]">{inst.return_5y}% 5Y</span>}
                  {inst.expense_ratio != null && <span className="ml-2">{inst.expense_ratio}% ER</span>}
                  <span className="ml-2 font-medium">Score: {inst.score}</span>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="text-sm font-semibold text-[#175A69]">{fmtSIP(inst.suggested_sip)}</div>
                <div className="text-[10px] text-[#6B7E86]">{inst.weight}% weight</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#6B7E86] italic mt-2">No matching instruments in universe for this bucket.</p>
      )}
      {b.goals.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/50 flex justify-between text-xs">
          <span className="text-[#6B7E86]">Required SIP</span>
          <span className="font-semibold text-[#0F3A46]">{fmtSIP(b.totalShortfall)}</span>
        </div>
      )}
    </div>
  );
}

// ── Goal mapping table ────────────────────────────────────────────────────────
function GoalMapTable({ mappings }: { mappings: GoalMapping[] }) {
  if (!mappings.length) return <p className="text-sm text-[#6B7E86]">No goals configured. Upload a questionnaire or add goals manually.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-[#6B7E86] border-b border-[#E7EFEF] bg-[#F5F9FA]">
            <th className="text-left px-4 py-2 font-medium">Goal</th>
            <th className="text-left px-4 py-2 font-medium">Bucket</th>
            <th className="text-right px-4 py-2 font-medium">Target</th>
            <th className="text-right px-4 py-2 font-medium">Required SIP</th>
            <th className="text-left px-4 py-2 font-medium">Instruments</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m, i) => {
            const c = BUCKET_COLOR[m.bucket];
            return (
              <tr key={m.goal.goal_id} className={`border-b border-[#E7EFEF] ${i % 2 === 0 ? "" : "bg-[#F9FBFC]"}`}>
                <td className="px-4 py-3 font-medium text-[#0F3A46]">{m.goal.goal_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.bg} ${c.label} border ${c.border}`}>
                    {m.bucket}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-[#6B7E86]">{m.goal.target_year ?? "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-[#0F3A46]">{fmtSIP(m.requiredSIP)}</td>
                <td className="px-4 py-3">
                  {m.instruments.length ? (
                    <div className="space-y-0.5">
                      {m.instruments.map(inst => (
                        <div key={inst.instrument_id} className="flex justify-between gap-4 text-xs">
                          <span className="text-[#175A69] truncate">{inst.name}</span>
                          <span className="font-medium text-[#0F3A46] shrink-0">{fmtSIP(inst.sip)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-[#6B7E86] text-xs">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  clientId: string; clientName: string;
  plan: AllocationPlan;
  savedOverrides: Record<string, unknown> | null;
  hasGoals: boolean; hasUniverse: boolean;
}

export default function AssetAllocClient({ clientId, clientName, plan, savedOverrides, hasGoals, hasUniverse }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<"overview" | "buckets" | "goals">("overview");
  const [alloc, setAlloc] = useState<Record<string, number>>({ ...plan.assetAllocation });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const allocTotal = Object.values(alloc).reduce((s, v) => s + v, 0);
  const isValid = allocTotal === 100;

  const setAC = (key: string, val: number) => {
    setAlloc(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const normalize = () => {
    const t = Object.values(alloc).reduce((s, v) => s + v, 0);
    if (t === 0) return;
    const norm: Record<string, number> = {};
    Object.entries(alloc).forEach(([k, v]) => norm[k] = Math.round(v / t * 100));
    // Fix rounding
    const diff = 100 - Object.values(norm).reduce((s, v) => s + v, 0);
    const keys = Object.keys(norm);
    norm[keys[0]] += diff;
    setAlloc(norm);
  };

  const saveOverrides = async () => {
    setSaving(true);
    await fetch(`/api/clients/${clientId}/allocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_class: alloc, saved_at: new Date().toISOString() }),
    });
    setSaving(false);
    setSaved(true);
    startTransition(() => router.refresh());
  };

  const resetToEngine = () => {
    setAlloc({ ...plan.assetAllocation });
    setSaved(false);
  };

  const TABS = [
    { id: "overview", label: "SAA & Sliders" },
    { id: "buckets",  label: "Bucket View"  },
    { id: "goals",    label: "Goal Mapping" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F3A46]">Asset Allocation</h1>
          <p className="text-xs text-[#6B7E86] mt-0.5">
            {clientName} · Profile: <span className="font-medium text-[#0F3A46]">{plan.profile}</span>
            {savedOverrides ? " · Adviser overrides active" : " · Engine recommendation"}
          </p>
        </div>
        <div className="flex gap-2">
          {savedOverrides && (
            <button onClick={resetToEngine} className="px-3 py-1.5 text-xs text-[#175A69] border border-[#175A69] rounded-lg hover:bg-[#DDE6E8]">
              Reset to engine
            </button>
          )}
          <button onClick={normalize} className="px-3 py-1.5 text-xs text-[#6B7E86] border border-[#CBD9DC] rounded-lg hover:bg-[#F5F9FA]">
            Normalise to 100%
          </button>
          <button onClick={saveOverrides} disabled={saving || !isValid}
            className="px-4 py-1.5 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save overrides"}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {!hasGoals && (
        <div className="bg-[#FEF9E7] border border-[#E8C840] rounded-xl p-3 text-sm text-[#7D6B2E]">
          ⚠ No goals found for this client. Upload a questionnaire or add goals to enable goal-aware bucketing.
        </div>
      )}
      {!hasUniverse && (
        <div className="bg-[#F8E7E4] border border-[#E8C0BB] rounded-xl p-3 text-sm text-[#B4463C]">
          ⚠ Investment Universe is empty. Add instruments to get instrument picks and SIP recommendations.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total portfolio target",  value: fmtL(plan.totalPortfolioValue),   sub: "future value of all goals" },
          { label: "Required monthly SIP",    value: fmtSIP(plan.totalMonthlySIP),     sub: "across all goal buckets" },
          { label: "Monthly surplus",         value: fmtSIP(plan.monthlySurplus),      sub: "income – expenses" },
          { label: "Surplus after SIP",
            value: fmtSIP(Math.abs(plan.surplusAfterSIP)),
            sub: plan.surplusAfterSIP >= 0 ? "buffer remaining" : "monthly shortfall",
            red: plan.surplusAfterSIP < 0 },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">{c.label}</div>
            <div className={`text-lg font-semibold ${c.red ? "text-[#B4463C]" : "text-[#0F3A46]"}`}>{c.value}</div>
            <div className="text-[10px] text-[#6B7E86] mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-[#CBD9DC] flex gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-[#0F3A46] text-[#0F3A46]" : "border-transparent text-[#6B7E86] hover:text-[#0F3A46]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: SAA & Sliders */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-5">
          {/* Donut */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#0F3A46] mb-4">Strategic Asset Allocation</h2>
            <div className="flex items-center gap-6">
              <DonutChart alloc={alloc} />
              <div className="space-y-2 flex-1">
                {Object.entries(alloc).filter(([, v]) => v > 0).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: AC_COLOR[k] ?? "#999" }} />
                    <span className="flex-1 text-[#0F3A46]">{k}</span>
                    <span className="font-semibold text-[#0F3A46]">{v}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`mt-4 text-xs text-center font-medium ${isValid ? "text-[#2E7D5B]" : "text-[#B4463C]"}`}>
              Total: {allocTotal}% {isValid ? "✓" : `— off by ${allocTotal - 100}%`}
            </div>
          </div>

          {/* Sliders */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#0F3A46] mb-4">Adjust Allocation</h2>
            <div className="space-y-4">
              {Object.entries(alloc).map(([k, v]) => (
                <SliderRow key={k} label={k} value={v} onChange={val => setAC(k, val)} />
              ))}
            </div>
            <p className="text-[10px] text-[#6B7E86] mt-4">
              Drag to adjust. Click "Normalise to 100%" to balance. Engine recomputes buckets on save.
            </p>
          </div>

          {/* Asset class breakdown table */}
          <div className="col-span-2 bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E7EFEF]">
              <h2 className="text-sm font-semibold text-[#0F3A46]">Bucket → Asset class mapping</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#6B7E86] bg-[#F5F9FA] border-b border-[#E7EFEF]">
                  <th className="text-left px-4 py-2 font-medium">Bucket</th>
                  <th className="text-left px-4 py-2 font-medium">Asset classes used</th>
                  <th className="text-right px-4 py-2 font-medium">Allocation %</th>
                  <th className="text-right px-4 py-2 font-medium">Goals</th>
                  <th className="text-right px-4 py-2 font-medium">Required SIP</th>
                </tr>
              </thead>
              <tbody>
                {plan.buckets.map((b, i) => {
                  const c = BUCKET_COLOR[b.bucket];
                  return (
                    <tr key={b.bucket} className={`border-b border-[#E7EFEF] ${i % 2 === 0 ? "" : "bg-[#F9FBFC]"}`}>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${c.bg} ${c.label} ${c.border}`}>{b.label}</span>
                        <span className="text-[10px] text-[#6B7E86] ml-2">{b.horizon}</span>
                      </td>
                      <td className="px-4 py-3 text-[#6B7E86] text-xs">{b.instruments.map(inst => inst.asset_class).filter((v, idx, a) => a.indexOf(v) === idx).join(", ") || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#0F3A46]">{b.allocation_pct}%</td>
                      <td className="px-4 py-3 text-right text-[#6B7E86]">{b.goals.length}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#0F3A46]">{fmtSIP(b.totalShortfall)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Buckets */}
      {tab === "buckets" && (
        <div className="grid grid-cols-3 gap-4">
          {plan.buckets.map(b => <BucketCard key={b.bucket} b={b} />)}
        </div>
      )}

      {/* Tab: Goal Mapping */}
      {tab === "goals" && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E7EFEF] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0F3A46]">Goal → Instrument → SIP mapping</h2>
            <span className="text-xs text-[#6B7E86]">{plan.goalMappings.length} goals</span>
          </div>
          <GoalMapTable mappings={plan.goalMappings} />
        </div>
      )}
    </div>
  );
}
