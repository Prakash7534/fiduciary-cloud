"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSUMPTION_FIELDS, type Assumptions } from "@/lib/assumptions";

const IDENTITY: { col: string; label: string; ph?: string }[] = [
  { col: "advisor_name", label: "Adviser name" },
  { col: "qualification", label: "Qualification", ph: "CFP, CFA…" },
  { col: "sebi_regn", label: "SEBI Regn. No.", ph: "INA000000000" },
  { col: "firm_name", label: "Firm name" },
  { col: "address", label: "Registered address" },
  { col: "phone", label: "Phone" },
  { col: "email", label: "Email" },
  { col: "website", label: "Website" },
  { col: "grievance_contact", label: "Grievance contact" },
];

const RETIREMENT: { col: string; label: string; unit: string; hint: string; dkey: keyof Assumptions }[] = [
  { col: "assume_post_ret_return", label: "Post-retirement return", unit: "%", dkey: "postRetReturn", hint: "Return the corpus earns during retirement drawdown" },
  { col: "assume_post_ret_inflation", label: "Post-retirement inflation", unit: "%", dkey: "postRetInflation", hint: "Inflation during the retirement (drawdown) years" },
  { col: "assume_life_expectancy", label: "Life expectancy", unit: "yrs", dkey: "lifeExpectancy", hint: "Default planning age to which the retirement corpus must last" },
  { col: "assume_replacement_pct", label: "Expense replacement", unit: "%", dkey: "replacementPct", hint: "Retirement expenses as a share of current expenses" },
];

export default function SettingsClient({ initial, defaults }: { initial: Record<string, unknown>; defaults: Assumptions }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of IDENTITY) o[f.col] = (initial[f.col] as string) ?? "";
    for (const f of ASSUMPTION_FIELDS) o[f.col] = initial[f.col] == null ? "" : String(initial[f.col]);
    for (const f of RETIREMENT) o[f.col] = initial[f.col] == null ? "" : String(initial[f.col]);
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: string, val: string) => { setV(s => ({ ...s, [k]: val })); setSaved(false); };

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F3A46]">Practice settings</h1>
          <p className="text-sm text-[#6B7E86] mt-1">Firm identity for report letterheads, and the master planning assumptions used across the app.</p>
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save settings"}
        </button>
      </div>

      {/* ── Planning assumptions (master controller) ── */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-[#175A69]">
          <h2 className="text-sm font-semibold text-white">Planning assumptions</h2>
          <p className="text-[11px] text-[#A9CDD4] mt-0.5">Applied wherever the app projects goals, required SIP and allocation. Leave blank to use the app default (shown as placeholder).</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ASSUMPTION_FIELDS.map(f => (
            <div key={f.col}>
              <label className="text-xs font-medium text-[#0F3A46] block mb-1">{f.label} <span className="text-[#6B7E86] font-normal">(% p.a.)</span></label>
              <div className="relative">
                <input type="number" step="0.1" value={v[f.col]} onChange={e => set(f.col, e.target.value)}
                  placeholder={`default ${defaults[f.key]}`}
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] outline-none focus:border-[#175A69]" />
                <span className="absolute right-3 top-2.5 text-[#6B7E86] text-sm">%</span>
              </div>
              <p className="text-[10px] text-[#6B7E86] mt-0.5">{f.hint}</p>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-[#F5F9FA] border-t border-[#E7EFEF]">
          <p className="text-[10px] text-[#6B7E86]">
            <strong className="text-[#0F3A46]">How these are used:</strong> a goal&apos;s own return/inflation (if set on the goal) always wins.
            Otherwise goal projections use <em>Default goal return</em> + <em>Inflation</em>; the allocation / required-SIP engine uses
            <em> Debt</em> for short-term buckets, the average of <em>Equity</em> &amp; <em>Debt</em> for medium-term, and <em>Equity</em> for long-term.
          </p>
        </div>
      </div>

      {/* ── Retirement planning ── */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-[#0F3A46]">
          <h2 className="text-sm font-semibold text-white">Retirement planning</h2>
          <p className="text-[11px] text-[#A9CDD4] mt-0.5">Defaults for the retirement corpus calculator (drawdown model). Each is overridable per client on the Goal Calculator.</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {RETIREMENT.map(f => (
            <div key={f.col}>
              <label className="text-xs font-medium text-[#0F3A46] block mb-1">{f.label} <span className="text-[#6B7E86] font-normal">({f.unit})</span></label>
              <input type="number" step={f.unit === "yrs" ? "1" : "0.1"} value={v[f.col]} onChange={e => set(f.col, e.target.value)}
                placeholder={`default ${defaults[f.dkey]}`}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] outline-none focus:border-[#175A69]" />
              <p className="text-[10px] text-[#6B7E86] mt-0.5">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Firm identity ── */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-[#0F3A46]">
          <h2 className="text-sm font-semibold text-white">Firm identity</h2>
          <p className="text-[11px] text-[#A9CDD4] mt-0.5">Appears on advisory &amp; recommendation report letterheads and the adviser signature block.</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {IDENTITY.map(f => (
            <div key={f.col} className={f.col === "address" ? "sm:col-span-2" : ""}>
              <label className="text-xs font-medium text-[#0F3A46] block mb-1">{f.label}</label>
              <input value={v[f.col]} onChange={e => set(f.col, e.target.value)} placeholder={f.ph ?? ""}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] outline-none focus:border-[#175A69]" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
