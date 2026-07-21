"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdvisoryAssistBundle, AdvField, AssistItem, Tone } from "@/lib/advisoryNotes";

interface Props {
  clientId: string;
  clientName: string;
  profile: string;
  answered: number;
  totalQuestions: number;
  scores: { cap: number; tol: number; kn: number };
  bundle: AdvisoryAssistBundle;
  initial: Record<AdvField, string>;
}

const TONE: Record<Tone, string> = {
  good:    "bg-[#E8F4EE] text-[#1A5C3A] border-[#B7DCC6]",
  warn:    "bg-[#FFF8EC] text-[#7D6B2E] border-[#EBD9A8]",
  bad:     "bg-[#FDF2F1] text-[#B4463C] border-[#EDBBBA]",
  neutral: "bg-[#F1F6F7] text-[#0F3A46] border-[#D5E2E5]",
};

const FIELDS: { key: AdvField; label: string; num: string; helper: string }[] = [
  { key: "adv_summary", num: "1", label: "Executive summary",
    helper: "A short paragraph summarising the advisory engagement and the headline advice." },
  { key: "adv_client_profile", num: "2", label: "Client context & preferences",
    helper: "The client's circumstances, goals, preferences and constraints that shaped the advice." },
  { key: "adv_considerations", num: "3", label: "Key observations & how addressed",
    helper: "Material risks / red flags identified, and how the plan responds to each." },
  { key: "adv_suitability", num: "4", label: "Suitability rationale",
    helper: "Why this advice suits the client's profile, horizon and preferences (SEBI Reg. 17)." },
  { key: "adv_next_steps", num: "5", label: "Agreed next steps & disclosures",
    helper: "Actions agreed, contributions, rebalancing, disclosures and the next review cadence." },
];

function Chip({ item }: { item: AssistItem }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${TONE[item.tone ?? "neutral"]}`}>
      <div className="text-[9px] uppercase tracking-wide opacity-70 leading-tight">{item.label}</div>
      <div className="text-xs font-semibold leading-tight mt-0.5">{item.value}</div>
    </div>
  );
}

export default function AdvisoryNotesClient(p: Props) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<AdvField, string>>(p.initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: AdvField, v: string) => { setVals(s => ({ ...s, [k]: v })); setDirty(true); setSaved(false); };
  const append = (k: AdvField, sentence: string) => {
    setVals(s => {
      const cur = s[k]?.trim() ?? "";
      const next = cur ? `${cur} ${sentence}` : sentence;
      return { ...s, [k]: next };
    });
    setDirty(true); setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/clients/${p.clientId}/report-notes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vals),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setDirty(false); router.refresh(); }
  };

  const filledCount = FIELDS.filter(f => (vals[f.key] ?? "").trim()).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#0F3A46]">Advisory Notes</h2>
            <p className="text-xs text-[#6B7E86] mt-1 max-w-2xl">
              An assisted workspace to summarise the advisory service for <strong className="text-[#0F3A46]">{p.clientName}</strong>.
              The left panel surfaces what the system sees — profile, flags, financial highlights and preferences — so you can
              write a sound, client-specific summary. It flows straight into the Advisory Report.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#6B7E86]">{filledCount}/5 sections written</span>
            <button onClick={save} disabled={saving || !dirty}
              className="px-4 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-40">
              {saving ? "Saving…" : saved ? "✓ Saved" : dirty ? "Save notes" : "Saved"}
            </button>
          </div>
        </div>
        {p.answered < p.totalQuestions && (
          <div className="mt-3 bg-[#FFF8EC] border border-[#EBD9A8] rounded-lg px-3 py-2 text-xs text-[#7D6B2E]">
            Only {p.answered}/{p.totalQuestions} risk questions answered — the profile and hints below may be incomplete.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── ASSIST PANEL ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <p className="text-[10px] font-bold tracking-widest text-[#175A69] uppercase mb-1">Advisory intelligence</p>
            <p className="text-[11px] text-[#6B7E86] mb-3">Auto-derived from this client&apos;s data — read-only.</p>

            <div className="rounded-lg bg-[#0F3A46] text-white px-3 py-2.5 mb-3">
              <div className="text-[9px] uppercase tracking-widest text-[#BFD3D8]">Governing risk profile</div>
              <div className="font-serif text-base text-[#E8DBB8] leading-tight">{p.profile}</div>
              <div className="text-[10px] text-[#BFD3D8] mt-1">Capacity {p.scores.cap}/40 · Tolerance {p.scores.tol}/35 · Knowledge {p.scores.kn}/20</div>
            </div>

            <p className="text-[10px] font-bold text-[#175A69] uppercase tracking-wide mb-1.5">Financial highlights</p>
            <div className="grid grid-cols-2 gap-1.5">
              {p.bundle.highlights.map((h, i) => <Chip key={i} item={h} />)}
            </div>
          </div>

          {/* Red flags */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <p className="text-[10px] font-bold tracking-widest text-[#B4463C] uppercase mb-2">
              Red flags ({p.bundle.flags.length})
            </p>
            {p.bundle.flags.length === 0 ? (
              <p className="text-xs text-[#2E7D5B]">✓ No open red flags across liquidity, protection, leverage and concentration.</p>
            ) : (
              <ul className="space-y-1.5">
                {p.bundle.flags.map((f, i) => (
                  <li key={i} className="text-xs">
                    <span className="text-[#B4463C] font-semibold">• {f.name}</span>
                    {f.val && <span className="text-[#6B7E86]"> — {f.val}</span>}
                    <div className="text-[10px] text-[#6B7E86] ml-3">{f.why}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Preferences */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <p className="text-[10px] font-bold tracking-widest text-[#175A69] uppercase mb-2">Client preferences</p>
            {p.bundle.preferences.length === 0 ? (
              <p className="text-xs text-[#6B7E86]">No preferences captured yet — see Preferences &amp; Behaviour.</p>
            ) : (
              <div className="space-y-1">
                {p.bundle.preferences.map((pr, i) => (
                  <div key={i} className="flex justify-between gap-3 text-xs border-b border-[#EEF4F5] pb-1">
                    <span className="text-[#6B7E86]">{pr.label}</span>
                    <span className="text-[#0F3A46] font-medium text-right">{pr.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Portfolio posture */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <p className="text-[10px] font-bold tracking-widest text-[#175A69] uppercase mb-2">Portfolio posture</p>
            <div className="grid grid-cols-2 gap-1.5">
              {p.bundle.portfolio.map((h, i) => <Chip key={i} item={h} />)}
            </div>
          </div>

          {/* Talking points */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <p className="text-[10px] font-bold tracking-widest text-[#C39A38] uppercase mb-2">Talking points &amp; hints</p>
            <ul className="space-y-1.5">
              {p.bundle.hints.map((h, i) => (
                <li key={i} className="text-xs text-[#0F3A46] leading-snug flex gap-1.5">
                  <span className="text-[#C39A38]">▸</span><span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── EDITOR ── */}
        <div className="lg:col-span-3 space-y-4">
          {FIELDS.map(f => {
            const suggestions = p.bundle.suggestions[f.key] ?? [];
            return (
              <div key={f.key} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
                <div className="flex items-baseline gap-2">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-[#0F3A46] text-white text-[10px] font-bold flex items-center justify-center">{f.num}</span>
                  <div>
                    <p className="text-sm font-semibold text-[#0F3A46] leading-tight">{f.label}</p>
                    <p className="text-[11px] text-[#6B7E86]">{f.helper}</p>
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[10px] text-[#175A69] font-semibold mb-1">Suggested points — click to insert</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => append(f.key, s)} type="button"
                          title={s}
                          className="text-left text-[11px] leading-snug bg-[#F1F6F7] hover:bg-[#DDEBEE] border border-[#D5E2E5] text-[#0F3A46] rounded-lg px-2 py-1 max-w-full">
                          + {s.length > 90 ? s.slice(0, 90) + "…" : s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <textarea
                  value={vals[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  rows={4}
                  placeholder={`Write the ${f.label.toLowerCase()} here, or build it from the suggested points above…`}
                  className="mt-2.5 w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] outline-none focus:border-[#175A69] resize-y leading-relaxed"
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-3 bg-white border border-[#CBD9DC] rounded-xl p-4">
            <p className="text-xs text-[#6B7E86]">
              Saved notes appear as the <strong className="text-[#0F3A46]">Adviser&apos;s Advisory Summary</strong> in the report.
            </p>
            <div className="flex items-center gap-2">
              <Link href={`/clients/${p.clientId}/advisory-report`}
                className="px-3 py-2 border border-[#175A69] text-[#175A69] text-sm font-medium rounded-lg hover:bg-[#DDE6E8]">
                Open Advisory Report →
              </Link>
              <button onClick={save} disabled={saving || !dirty}
                className="px-4 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-40">
                {saving ? "Saving…" : saved ? "✓ Saved" : dirty ? "Save notes" : "Saved"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
