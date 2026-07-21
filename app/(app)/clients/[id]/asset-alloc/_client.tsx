"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AllocationPlan, BucketPlan, GoalBucket } from "@/lib/allocationEngine";
import { BUCKET_CLASSES } from "@/lib/allocationEngine";

type MappingMode = "bucket" | "blend";

const BUCKET_COLOR: Record<string, { bg: string; border: string; label: string }> = {
  short:  { bg: "bg-[#FEF3E2]", border: "border-[#E8A020]", label: "text-[#8B5E00]" },
  medium: { bg: "bg-[#EAF3F8]", border: "border-[#2C7DA0]", label: "text-[#1A4D6A]" },
  long:   { bg: "bg-[#E8F4EE]", border: "border-[#2E7D5B]", label: "text-[#1A5C3A]" },
};

const AC_COLOR: Record<string, string> = {
  Equity: "#175A69", Debt: "#C39A38", Gold: "#B8860B",
  International: "#4A90C4", Hybrid: "#7B5EA7", Alternate: "#B4463C",
};

function fmtL(n: number) {
  if (n >= 10_000_000) return "Rs." + (n / 10_000_000).toFixed(2) + " Cr";
  if (n >= 100_000)    return "Rs." + (n / 100_000).toFixed(2) + " L";
  return "Rs." + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtSIP(n: number) {
  return "Rs." + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }) + "/mo";
}

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
    return { key, pct, d: "M " + x1 + " " + y1 + " A " + r + " " + r + " 0 " + large + " 1 " + x2 + " " + y2, color: AC_COLOR[key] ?? "#999" };
  });
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      {arcs.map(a => (
        <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={stroke} strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#0F3A46" fontSize={11} fontWeight={600}>SAA</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#0F3A46" fontSize={9}>allocation</text>
    </svg>
  );
}

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

function PortfolioNudge({ clientId }: { clientId: string }) {
  return (
    <div className="mt-3 bg-[#EBF3F5] border border-[#C8D8DB] rounded-lg px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-[#0F3A46]">Instrument selection is done in Portfolio Construction</p>
        <p className="text-xs text-[#6B7E86] mt-0.5">Engine uses your SAA and goal SIPs as recommendations — adviser picks instruments there.</p>
      </div>
      <Link href={"/clients/" + clientId + "/portfolio"}
        className="shrink-0 ml-4 px-3 py-1.5 text-xs bg-[#0F3A46] text-white rounded-lg hover:bg-[#175A69]">
        Go to Portfolio Construction
      </Link>
    </div>
  );
}

export default function AssetAllocClient({
  clientId, clientName, plan, savedOverrides, engineAllocation, hasGoals,
}: {
  clientId: string;
  clientName: string;
  plan: AllocationPlan;
  savedOverrides: Record<string, unknown> | null;
  engineAllocation: Record<string, number>;
  hasGoals: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<"overview" | "buckets" | "goals">("overview");
  const [mappingMode, setMappingMode] = useState<MappingMode>((savedOverrides?.mapping_mode as MappingMode) ?? "bucket");
  const [alloc, setAlloc] = useState<Record<string, number>>({ ...plan.assetAllocation });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const allocTotal = Object.values(alloc).reduce((s, v) => s + v, 0);
  const isValid = allocTotal === 100;
  const setAC = (key: string, val: number) => { setAlloc(prev => ({ ...prev, [key]: val })); setSaved(false); };

  const normalize = () => {
    const t = Object.values(alloc).reduce((s, v) => s + v, 0);
    if (t === 0) return;
    const norm: Record<string, number> = {};
    Object.entries(alloc).forEach(([k, v]) => { norm[k] = Math.round(v / t * 100); });
    const diff = 100 - Object.values(norm).reduce((s, v) => s + v, 0);
    const keys = Object.keys(norm);
    if (keys[0]) norm[keys[0]] += diff;
    setAlloc(norm);
  };

  const saveOverrides = async () => {
    setSaving(true);
    await fetch("/api/clients/" + clientId + "/allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_class: alloc, mapping_mode: mappingMode, saved_at: new Date().toISOString() }),
    });
    setSaving(false); setSaved(true);
    startTransition(() => router.refresh());
  };

  const resetToEngine = () => {
    setAlloc({ ...engineAllocation });
    setMappingMode("bucket");
    setSaved(false);
    startTransition(async () => {
      await fetch("/api/clients/" + clientId + "/allocation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      router.refresh();
    });
  };

  const goalSipPct = (b: BucketPlan) =>
    plan.totalMonthlySIP > 0 ? Math.round(b.totalShortfall / plan.totalMonthlySIP * 100) : 0;

  const TABS = [
    { id: "overview", label: "SAA & Sliders" },
    { id: "buckets",  label: "Bucket View"  },
    { id: "goals",    label: "Goal Mapping" },
  ] as const;

  return (
    <div className="space-y-5">
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
            {saving ? "Saving..." : saved ? "Saved" : "Save overrides"}
          </button>
        </div>
      </div>

      {!hasGoals && (
        <div className="bg-[#FEF9E7] border border-[#E8C840] rounded-xl p-3 text-sm text-[#7D6B2E]">
          No goals found. Add goals to enable goal-aware bucketing and SIP targets.
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total portfolio target", value: fmtL(plan.totalPortfolioValue), sub: "future value of all goals" },
          { label: "Required monthly SIP",   value: fmtSIP(plan.totalMonthlySIP),   sub: "additional, net of current portfolio" },
          { label: "Monthly surplus",        value: fmtSIP(plan.monthlySurplus),    sub: "income minus expenses" },
          { label: "Surplus after SIP", value: fmtSIP(Math.abs(plan.surplusAfterSIP)),
            sub: plan.surplusAfterSIP >= 0 ? "buffer remaining" : "monthly shortfall", red: plan.surplusAfterSIP < 0 },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">{c.label}</div>
            <div className={"text-lg font-semibold " + (c.red ? "text-[#B4463C]" : "text-[#0F3A46]")}>{c.value}</div>
            <div className="text-[10px] text-[#6B7E86] mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="border-b border-[#CBD9DC] flex gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"px-4 py-2 text-sm font-medium border-b-2 transition-colors " + (tab === t.id ? "border-[#0F3A46] text-[#0F3A46]" : "border-transparent text-[#6B7E86] hover:text-[#0F3A46]")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-5">
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
            <div className={"mt-4 text-xs text-center font-medium " + (isValid ? "text-[#2E7D5B]" : "text-[#B4463C]")}>
              Total: {allocTotal}% {isValid ? "" : "— off by " + (allocTotal - 100) + "%"}
            </div>
          </div>

          <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#0F3A46]">Adjust Allocation</h2>
              <div className="flex items-center gap-1 p-0.5 bg-[#F0F5F6] rounded-lg">
                {(["bucket", "blend"] as MappingMode[]).map(m => (
                  <button key={m} onClick={() => { setMappingMode(m); setSaved(false); }}
                    className={"px-3 py-1 text-xs font-medium rounded-md transition-colors " + (mappingMode === m ? "bg-white text-[#0F3A46] shadow-sm" : "text-[#6B7E86] hover:text-[#0F3A46]")}>
                    {m === "bucket" ? "Bucket mapping" : "Single blend"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {Object.entries(alloc).map(([k, v]) => (
                <SliderRow key={k} label={k} value={v} onChange={val => setAC(k, val)} />
              ))}
            </div>
            <p className="text-[10px] text-[#6B7E86] mt-4">
              {mappingMode === "bucket"
                ? "Bucket mapping: allocation split across short / medium / long buckets tied to goal horizons."
                : "Single blend: all goals share one unified portfolio."}
            </p>
          </div>

          <div className="col-span-2 bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E7EFEF] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0F3A46]">
                {mappingMode === "bucket" ? "Bucket to asset class mapping" : "Single blend — asset class breakdown"}
              </h2>
            </div>
            {mappingMode === "bucket" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] bg-[#F5F9FA] border-b border-[#E7EFEF]">
                    <th className="text-left px-4 py-2 font-medium">Bucket</th>
                    <th className="text-left px-4 py-2 font-medium">Asset classes</th>
                    <th className="text-right px-4 py-2 font-medium">Asset-class %</th>
                    <th className="text-right px-4 py-2 font-medium">Goal SIP %</th>
                    <th className="text-right px-4 py-2 font-medium">Goals</th>
                    <th className="text-right px-4 py-2 font-medium">Required SIP</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.buckets.map((b, i) => {
                    const c = BUCKET_COLOR[b.bucket] ?? BUCKET_COLOR["long"]!;
                    return (
                      <tr key={b.bucket} className={"border-b border-[#E7EFEF] " + (i % 2 === 0 ? "" : "bg-[#F9FBFC]")}>
                        <td className="px-4 py-3">
                          <span className={"text-xs px-2 py-0.5 rounded-full font-medium border " + c.bg + " " + c.label + " " + c.border}>{b.label}</span>
                          <div className="text-[10px] text-[#6B7E86] mt-0.5">{b.horizon}</div>
                        </td>
                        <td className="px-4 py-3 text-[#6B7E86] text-xs">{(BUCKET_CLASSES[b.bucket as GoalBucket] ?? []).join(", ")}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#0F3A46]">{b.allocation_pct}%</td>
                        <td className="px-4 py-3 text-right">
                          <span className={"font-semibold " + (goalSipPct(b) > 0 ? "text-[#175A69]" : "text-[#6B7E86]")}>
                            {goalSipPct(b) > 0 ? goalSipPct(b) + "%" : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#6B7E86]">{b.goals.length}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#0F3A46]">{fmtSIP(b.totalShortfall)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] bg-[#F5F9FA] border-b border-[#E7EFEF]">
                    <th className="text-left px-4 py-2 font-medium">Asset class</th>
                    <th className="text-right px-4 py-2 font-medium">Allocation %</th>
                    <th className="text-right px-4 py-2 font-medium">Monthly SIP</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(alloc).filter(([, v]) => v > 0).map(([ac, pct], i) => (
                    <tr key={ac} className={"border-b border-[#E7EFEF] " + (i % 2 === 0 ? "" : "bg-[#F9FBFC]")}>
                      <td className="px-4 py-3 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: AC_COLOR[ac] ?? "#999" }} />
                        <span className="text-[#0F3A46] font-medium">{ac}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#0F3A46]">{pct}%</td>
                      <td className="px-4 py-3 text-right text-[#0F3A46]">{fmtSIP(Math.round(plan.totalMonthlySIP * pct / 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "buckets" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {plan.buckets.map(b => {
              const c = BUCKET_COLOR[b.bucket] ?? BUCKET_COLOR["long"]!;
              return (
                <div key={b.bucket} className={"border " + c.border + " " + c.bg + " rounded-xl p-4"}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className={"text-xs font-bold tracking-wide uppercase " + c.label}>{b.label}</span>
                      <span className="text-xs text-[#6B7E86] ml-2">{b.horizon}</span>
                      <div className="flex gap-3 mt-1 text-xs text-[#6B7E86]">
                        <span>Asset-class: <strong className="text-[#0F3A46]">{b.allocation_pct}%</strong></span>
                        {goalSipPct(b) > 0 && <span>Goal-weighted: <strong className="text-[#175A69]">{goalSipPct(b)}%</strong></span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {b.goals.length > 0 && <div className="text-xs text-[#6B7E86]">{b.goals.length} goal{b.goals.length > 1 ? "s" : ""}</div>}
                      <div className="text-sm font-semibold text-[#0F3A46] mt-0.5">{fmtSIP(b.totalShortfall)}</div>
                    </div>
                  </div>
                  {b.goals.length === 0 ? (
                    <p className="text-xs text-[#6B7E86] italic">No goals in this horizon</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {b.goals.map(g => (
                        <span key={g.goal_id} className="text-xs bg-white/70 border border-white/50 px-2 py-0.5 rounded-full text-[#0F3A46]">
                          {g.goal_name ?? "Goal"} · {fmtL(g.cost_today ?? 0)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 text-[10px] text-[#6B7E86]">
                    Asset classes: {(BUCKET_CLASSES[b.bucket as GoalBucket] ?? []).join(", ")}
                  </div>
                </div>
              );
            })}
          </div>
          <PortfolioNudge clientId={clientId} />
        </div>
      )}

      {tab === "goals" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E7EFEF] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0F3A46]">Goal to bucket SIP mapping</h2>
              <span className="text-xs text-[#6B7E86]">{plan.goalMappings.length} goals</span>
            </div>
            {plan.goalMappings.length === 0 ? (
              <p className="text-sm text-[#6B7E86] p-6">No goals found. Add goals for this client first.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] bg-[#F5F9FA] border-b border-[#E7EFEF]">
                    <th className="text-left px-4 py-2 font-medium">Goal</th>
                    <th className="text-left px-4 py-2 font-medium">Bucket</th>
                    <th className="text-right px-4 py-2 font-medium">Target year</th>
                    <th className="text-right px-4 py-2 font-medium">Cost today</th>
                    <th className="text-right px-4 py-2 font-medium">Required SIP</th>
                    <th className="text-right px-4 py-2 font-medium">FV needed</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.goalMappings.map((m, i) => {
                    const c = BUCKET_COLOR[m.bucket] ?? BUCKET_COLOR["long"]!;
                    const yearsLeft = m.goal.target_year ? m.goal.target_year - new Date().getFullYear() : null;
                    const fv = yearsLeft != null && m.goal.cost_today
                      ? Math.round(m.goal.cost_today * Math.pow(1.06, yearsLeft)) : null;
                    return (
                      <tr key={m.goal.goal_id} className={"border-b border-[#E7EFEF] " + (i % 2 === 0 ? "" : "bg-[#F9FBFC]")}>
                        <td className="px-4 py-3 font-medium text-[#0F3A46]">{m.goal.goal_name ?? "Goal"}</td>
                        <td className="px-4 py-3">
                          <span className={"text-xs px-2 py-0.5 rounded-full font-medium border " + c.bg + " " + c.label + " " + c.border}>{m.bucket}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#6B7E86]">{m.goal.target_year ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-[#0F3A46]">{fmtL(m.goal.cost_today ?? 0)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#0F3A46]">{fmtSIP(m.requiredSIP)}</td>
                        <td className="px-4 py-3 text-right text-[#175A69] font-medium">{fv != null ? fmtL(fv) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <PortfolioNudge clientId={clientId} />
        </div>
      )}
    </div>
  );
}
