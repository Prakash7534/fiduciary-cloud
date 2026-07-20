"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UniverseRow } from "@/lib/allocationEngine";
import { assessRecommendation } from "@/lib/recommendationEngine";
import { asAtLabel, staleness, STALENESS_CLASS } from "@/lib/priceStaleness";

interface Rec {
  rec_id: string; scrip_name: string; asset_class: string | null; category: string | null;
  current_price: number | null; price_date: string | null; consider_price: number | null; consider_price_max: number | null; term: string | null;
  rationale_market: string | null; rationale_suitability: string | null; key_risks: string | null;
  concentration_cap_pct: number | null; cap_headroom: number | null; suggested_amount: number | null;
  status: string; rejected_reason: string | null; executed_amount: number | null;
  doc_id: string | null; created_at: string;
}
interface Props {
  clientId: string; clientCode: string; clientName: string; profile: string;
  saa: Record<string, number>; currentByClass: Record<string, number>;
  totalPortfolio: number; byInstrument: Record<string, number>; capPct: number;
  universe: UniverseRow[]; initialRecs: Record<string, unknown>[];
}

const fmt = (n: number | null | undefined) => n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function RecommendationsClient(p: Props) {
  const router = useRouter();
  const [recs, setRecs] = useState<Rec[]>(p.initialRecs as unknown as Rec[]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<UniverseRow | null>(null);
  const [considerPrice, setConsiderPrice] = useState<number | "">("");
  const [considerPriceMax, setConsiderPriceMax] = useState<number | "">("");
  const [amount, setAmount] = useState<number | "">("");
  const [ratMarket, setRatMarket] = useState("");
  const [ratSuit, setRatSuit] = useState("");
  const [risks, setRisks] = useState("");
  const [term, setTerm] = useState("Long term");
  const [saving, setSaving] = useState(false);
  const [rejFor, setRejFor] = useState<string | null>(null);
  const [rejReason, setRejReason] = useState("");
  const [execFor, setExecFor] = useState<string | null>(null);
  const [execAmt, setExecAmt] = useState<number | "">("");

  const filtered = p.universe.filter(u => !search || (u.name ?? "").toLowerCase().includes(search.toLowerCase()));

  const pick = (u: UniverseRow) => {
    setSel(u);
    const a = assessRecommendation({
      instrument: u, clientProfile: p.profile, saa: p.saa,
      currentByClass: p.currentByClass, totalPortfolio: p.totalPortfolio,
      existingInInstrument: p.byInstrument[u.instrument_id] ?? 0, capPct: p.capPct,
    });
    setConsiderPrice(u.current_price ?? "");
    setConsiderPriceMax("");
    setAmount(a.suggestedAmount || "");
    setRatSuit(a.suitabilityNote);
    setRisks(a.keyRisks.map(r => "• " + r).join("\n"));
    setTerm(a.term);
    setRatMarket("");
  };

  const create = async () => {
    if (!sel || !ratMarket.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${p.clientId}/recommendations`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_code: p.clientCode, instrument_id: sel.instrument_id, scrip_name: sel.name ?? sel.instrument_id,
        asset_class: sel.asset_class, category: sel.category,
        current_price: sel.current_price, price_date: sel.price_date, consider_price: considerPrice || null,
        consider_price_max: considerPriceMax || null, term,
        rationale_market: ratMarket, rationale_suitability: ratSuit, key_risks: risks,
        concentration_cap_pct: p.capPct,
        cap_headroom: Math.max(0, Math.round(p.totalPortfolio * p.capPct / 100 - (p.byInstrument[sel.instrument_id] ?? 0))),
        suggested_amount: amount || null,
      }),
    });
    const rec = await res.json();
    setRecs(prev => [rec, ...prev]);
    setShowForm(false); setSel(null); setSearch(""); setSaving(false);
    router.refresh();
  };

  const setStatus = async (rec_id: string, status: string, extra: Record<string, unknown> = {}) => {
    await fetch(`/api/clients/${p.clientId}/recommendations`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rec_id, status, ...extra }),
    });
    setRecs(prev => prev.map(r => r.rec_id === rec_id ? { ...r, status, ...extra } as Rec : r));
    setRejFor(null); setExecFor(null); setRejReason(""); setExecAmt("");
    router.refresh();
  };

  const STATUS_STYLE: Record<string, string> = {
    recommended: "bg-[#FFF8EC] text-[#8A6D1C] border-[#E3D3A8]",
    rejected: "bg-[#FDF2F1] text-[#B4463C] border-[#EDBBBA]",
    executed: "bg-[#E8F4EE] text-[#1A5C3A] border-[#B3D9C4]",
  };
  const STATUS_LABEL: Record<string, string> = {
    recommended: "Recommended to consider", rejected: "Rejected by client", executed: "Executed by client",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F3A46]">Recommendations</h1>
          <p className="text-xs text-[#6B7E86] mt-0.5">
            {p.clientName} · {p.profile} · Cap {p.capPct}% · Portfolio {fmt(p.totalPortfolio)}
          </p>
        </div>
        <div className="flex gap-2">
          {recs.length > 0 && (
            <a href={`/api/clients/${p.clientId}/recommendations/pdf`}
              className="px-3 py-1.5 text-xs border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">
              ⬇ Full report (all recommendations)
            </a>
          )}
          <button onClick={() => setShowForm(v => !v)}
            className="px-4 py-1.5 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69]">
            {showForm ? "Cancel" : "+ New recommendation"}
          </button>
        </div>
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-[#0F3A46]">New recommendation</p>
          {!sel ? (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investment universe…"
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#175A69]" />
              <div className="max-h-56 overflow-y-auto divide-y divide-[#EEF4F5] border border-[#E7EFEF] rounded-lg">
                {filtered.map(u => (
                  <button key={u.instrument_id} onClick={() => pick(u)}
                    className="w-full text-left px-3 py-2 hover:bg-[#F5F9FA] flex justify-between items-center">
                    <span className="text-sm text-[#0F3A46] font-medium">{u.name ?? u.instrument_id}</span>
                    <span className="text-xs text-[#6B7E86]">{u.asset_class} · {u.category ?? "—"} · {u.risk_level ?? "—"}{u.current_price ? ` · ₹${u.current_price} (${asAtLabel(u.price_date)})` : ""}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between bg-[#F5F9FA] rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-[#0F3A46]">{sel.name}</p>
                  <p className="text-xs text-[#6B7E86]">{sel.asset_class} · {sel.category ?? "—"} · risk {sel.risk_level ?? "—"} · existing exposure {fmt(p.byInstrument[sel.instrument_id] ?? 0)}</p>
                </div>
                <button onClick={() => setSel(null)} className="text-xs text-[#175A69] hover:underline">change</button>
              </div>
              <div className="grid grid-cols-5 gap-3">
                <div><label className="text-[10px] text-[#6B7E86]">Current price</label>
                  <p className="text-sm font-semibold text-[#0F3A46] mt-1">{fmt(sel.current_price)}</p>
                  <p className={`text-[10px] ${STALENESS_CLASS[staleness(sel.price_date)]}`}>{asAtLabel(sel.price_date)}</p></div>
                <div><label className="text-[10px] text-[#6B7E86]">Consider from (₹)</label>
                  <input type="number" value={considerPrice} onChange={e => setConsiderPrice(e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-[#CBD9DC] rounded px-2 py-1 text-sm mt-0.5" /></div>
                <div><label className="text-[10px] text-[#6B7E86]">Consider to (₹)</label>
                  <input type="number" value={considerPriceMax} onChange={e => setConsiderPriceMax(e.target.value ? Number(e.target.value) : "")}
                    placeholder="optional" className="w-full border border-[#CBD9DC] rounded px-2 py-1 text-sm mt-0.5" /></div>
                <div><label className="text-[10px] text-[#6B7E86]">Amount to consider (₹)</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-[#CBD9DC] rounded px-2 py-1 text-sm mt-0.5" /></div>
                <div><label className="text-[10px] text-[#6B7E86]">Term</label>
                  <select value={term} onChange={e => setTerm(e.target.value)}
                    className="w-full border border-[#CBD9DC] rounded px-2 py-1 text-sm mt-0.5">
                    <option>Long term</option><option>Short term</option>
                  </select></div>
              </div>
              <div><label className="text-[10px] text-[#6B7E86]">Why this scrip is considered (market rationale) *</label>
                <textarea value={ratMarket} onChange={e => setRatMarket(e.target.value)} rows={2}
                  placeholder="e.g. 15% correction from highs; valuations below 5-yr average; earnings intact…"
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-xs mt-0.5" /></div>
              <div><label className="text-[10px] text-[#6B7E86]">Why it suits this client (auto-assessed, editable)</label>
                <textarea value={ratSuit} onChange={e => setRatSuit(e.target.value)} rows={2}
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-xs mt-0.5 bg-[#FBFDFD]" /></div>
              <div><label className="text-[10px] text-[#6B7E86]">What the client should know before considering (auto-generated, editable)</label>
                <textarea value={risks} onChange={e => setRisks(e.target.value)} rows={4}
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-xs mt-0.5 bg-[#FBFDFD]" /></div>
              <button onClick={create} disabled={saving || !ratMarket.trim()}
                className="w-full py-2 bg-[#C39A38] text-[#0F3A46] font-semibold rounded-lg text-sm disabled:opacity-40">
                {saving ? "Creating…" : "Create recommendation"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── List ── */}
      {recs.length === 0 && !showForm ? (
        <div className="bg-white border border-dashed border-[#CBD9DC] rounded-xl p-10 text-center">
          <p className="text-sm text-[#6B7E86]">No recommendations yet. Create one when the market offers an accumulation opportunity.</p>
        </div>
      ) : recs.map(r => (
        <div key={r.rec_id} className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-[#E7EFEF]">
            <div>
              <p className="text-sm font-semibold text-[#0F3A46]">{r.scrip_name}</p>
              <p className="text-[10px] text-[#6B7E86]">{r.doc_id} · {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · {r.asset_class}{r.category ? " · " + r.category : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <a href={`/api/clients/${p.clientId}/recommendations/pdf?rec=${r.rec_id}`}
                className="text-xs px-2.5 py-1 border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">
                ⬇ PDF
              </a>
              <span className={"text-xs px-2.5 py-1 rounded-full border font-semibold " + (STATUS_STYLE[r.status] ?? "")}>{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
          </div>
          <div className="px-5 py-3 grid grid-cols-5 gap-3 text-xs border-b border-[#EEF4F5]">
            <div><p className="text-[#6B7E86]">Current price</p><p className="font-semibold text-[#0F3A46]">{fmt(r.current_price)}</p><p className={`text-[10px] ${STALENESS_CLASS[staleness(r.price_date)]}`}>{asAtLabel(r.price_date)}</p></div>
            <div><p className="text-[#6B7E86]">Consider price</p><p className="font-semibold text-[#0F3A46]">{fmt(r.consider_price)}{r.consider_price_max ? " – " + fmt(r.consider_price_max) : ""}</p></div>
            <div><p className="text-[#6B7E86]">Consider now</p><p className="font-semibold text-[#C39A38]">{fmt(r.suggested_amount)}</p></div>
            <div><p className="text-[#6B7E86]">Cap headroom</p><p className="font-semibold text-[#0F3A46]">{fmt(r.cap_headroom)} ({r.concentration_cap_pct}%)</p></div>
            <div><p className="text-[#6B7E86]">Term</p><p className="font-semibold text-[#0F3A46]">{r.term}</p></div>
          </div>
          <div className="px-5 py-3 space-y-2 text-xs">
            <p><strong className="text-[#0F3A46]">Why considered:</strong> <span className="text-[#4A6572]">{r.rationale_market}</span></p>
            <p><strong className="text-[#0F3A46]">Why it suits:</strong> <span className="text-[#4A6572]">{r.rationale_suitability}</span></p>
            <details><summary className="cursor-pointer font-semibold text-[#B4463C]">Before you consider — key risks</summary>
              <p className="whitespace-pre-line text-[#4A6572] mt-1">{r.key_risks}</p></details>
            {r.status === "executed" && <p className="text-[#2E7D5B] font-medium">✓ Executed {fmt(r.executed_amount)} — reflected in live portfolio.</p>}
            {r.status === "rejected" && r.rejected_reason && <p className="text-[#B4463C]">Rejected: {r.rejected_reason}</p>}
          </div>
          {r.status === "recommended" && (
            <div className="px-5 py-3 bg-[#F5F9FA] flex gap-2 flex-wrap items-center">
              {execFor === r.rec_id ? (
                <>
                  <input type="number" placeholder={`Executed ₹ (default ${r.suggested_amount ?? 0})`} value={execAmt}
                    onChange={e => setExecAmt(e.target.value ? Number(e.target.value) : "")}
                    className="border border-[#CBD9DC] rounded px-2 py-1 text-xs w-48" />
                  <button onClick={() => setStatus(r.rec_id, "executed", { executed_amount: execAmt || r.suggested_amount || 0 })}
                    className="px-3 py-1.5 bg-[#2E7D5B] text-white text-xs rounded-lg">Confirm executed</button>
                  <button onClick={() => setExecFor(null)} className="text-xs text-[#6B7E86]">cancel</button>
                </>
              ) : rejFor === r.rec_id ? (
                <>
                  <input placeholder="Reason (optional)" value={rejReason} onChange={e => setRejReason(e.target.value)}
                    className="border border-[#CBD9DC] rounded px-2 py-1 text-xs w-64" />
                  <button onClick={() => setStatus(r.rec_id, "rejected", { rejected_reason: rejReason })}
                    className="px-3 py-1.5 bg-[#B4463C] text-white text-xs rounded-lg">Confirm rejected</button>
                  <button onClick={() => setRejFor(null)} className="text-xs text-[#6B7E86]">cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setExecFor(r.rec_id); setExecAmt(r.suggested_amount ?? ""); }}
                    className="px-3 py-1.5 bg-[#2E7D5B] text-white text-xs rounded-lg">✓ Client executed</button>
                  <button onClick={() => setRejFor(r.rec_id)}
                    className="px-3 py-1.5 border border-[#B4463C] text-[#B4463C] text-xs rounded-lg">✕ Client rejected</button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
