// app/(app)/(main)/investment-universe/_client.tsx
"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface Instrument {
  instrument_id: string; user_id?: string;
  name: string | null; instrument_type: string | null; ticker: string | null; isin: string | null;
  asset_class: string | null; category: string | null; sub_bucket: string | null;
  risk_level: string | null; expense_ratio: number | null; return_3y: number | null; return_5y: number | null;
  min_sip: number | null; current_price: number | null; price_date: string | null;
  exchange: string | null; liquidity: string | null; taxation: string | null;
  esg: boolean | null; international: boolean | null; min_knowledge: string | null; notes: string | null;
  currency: string | null; created_at?: string; updated_at?: string;
}

const ASSET_CLASSES = ["Equity","Debt","Hybrid","Gold","International","Alternate"];
const CATEGORIES = {
  Equity: ["Large Cap","Mid Cap","Small Cap","Flexi Cap","Thematic","International","Index","Direct"],
  Debt:   ["Liquid","Short Duration","Medium Duration","Long Duration","Gilt","Credit Risk","Corporate Bond","FMP"],
  Hybrid: ["Balanced Adv","Aggressive Hybrid","Conservative Hybrid","Multi Asset"],
  Gold:   ["Gold ETF","SGB","Gold Fund"],
  International: ["Index","Active","ETF"],
  Alternate: ["AIF","PMS","REITs/InvITs"],
};
const TYPES = ["MF","ETF","Stock","Bond","AIF","PMS","REIT"];
const RISK_LEVELS = ["Low","Moderate","High","Very High"];
const KNOWLEDGE = ["None","Basic","Good"];

const RISK_COLOR: Record<string, string> = {
  Low:      "bg-[#E4F1EA] text-[#2E7D5B]",
  Moderate: "bg-[#FEF9E7] text-[#7D6B2E]",
  High:     "bg-[#F8E7E4] text-[#B4463C]",
  "Very High": "bg-[#F5D5D0] text-[#8B1A0F]",
};

const TYPE_COLOR: Record<string, string> = {
  MF:    "bg-[#E8EDF7] text-[#2C4A8C]",
  ETF:   "bg-[#E8F0F7] text-[#1A5276]",
  Stock: "bg-[#F0EBF7] text-[#5B2C8C]",
  Bond:  "bg-[#F7EBE8] text-[#8C2C1A]",
  AIF:   "bg-[#F7F4E8] text-[#7D6B1A]",
  PMS:   "bg-[#EBF7EB] text-[#1A7D2C]",
  REIT:  "bg-[#F7E8F4] text-[#7D1A6B]",
};

const BLANK: Partial<Instrument> = {
  instrument_type: "MF", asset_class: "Equity", risk_level: "Moderate", currency: "INR",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n >= 1000 ? `₹${n.toLocaleString("en-IN")}` : `₹${n}`;
}

interface LookupResult {
  instrument_id: string; name: string; instrument_type: string;
  isin?: string; ticker?: string; category?: string; asset_class?: string; exchange?: string;
}

function SearchBox({ onSelect }: { onSelect: (r: LookupResult & { current_price?: number }) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (val: string) => {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/investment-universe/lookup?q=${encodeURIComponent(val)}`);
        const data: LookupResult[] = await res.json();
        setResults(data);
        setOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 350);
  };

  const pick = async (r: LookupResult) => {
    setOpen(false); setQ(""); setResults([]);
    let enriched: LookupResult & { current_price?: number } = r;
    // For MFs, fetch ISIN + NAV from mfapi
    if (r.instrument_type === "MF" && r.ticker) {
      try {
        const res = await fetch(`/api/investment-universe/lookup?q=&details=${r.ticker}`);
        const det: { isin?: string; nav?: number; category?: string } = await res.json();
        enriched = {
          ...r,
          isin: det.isin ?? r.isin,
          current_price: det.nav,
          category: det.category ?? r.category,
          instrument_id: det.isin ?? r.instrument_id, // use ISIN as ID for MFs
        };
      } catch { /* use as-is */ }
    }
    onSelect(enriched);
  };

  return (
    <div className="relative">
      <label className="text-xs text-[#6B7E86] block mb-1">🔍 Search to auto-fill (fund name, stock name, ticker, ISIN…)</label>
      <div className="relative">
        <input value={q} onChange={e => search(e.target.value)}
          placeholder="e.g. HDFC Top 100, Reliance, NIFTYBEES…"
          className="w-full border-2 border-[#175A69] rounded-lg px-3 py-2 text-[#0F3A46] focus:outline-none focus:ring-2 focus:ring-[#175A69]/30" />
        {loading && <span className="absolute right-3 top-2.5 text-[#6B7E86] text-xs">Searching…</span>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#CBD9DC] rounded-xl shadow-lg overflow-hidden">
          {results.map(r => (
            <button key={r.instrument_id} onClick={() => pick(r)}
              className="w-full text-left px-4 py-2.5 hover:bg-[#F0F7F8] border-b border-[#E7EFEF] last:border-0 transition-colors">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${r.instrument_type === "MF" ? "bg-[#E8EDF7] text-[#2C4A8C]" : r.instrument_type === "ETF" ? "bg-[#E8F0F7] text-[#1A5276]" : "bg-[#F0EBF7] text-[#5B2C8C]"}`}>
                  {r.instrument_type}
                </span>
                <span className="text-sm font-medium text-[#0F3A46] truncate">{r.name}</span>
              </div>
              <div className="text-[10px] text-[#6B7E86] mt-0.5 pl-0.5 space-x-2">
                {r.ticker && <span>Ticker: {r.ticker}</span>}
                {r.isin && <span>ISIN: {r.isin}</span>}
                {r.category && <span>{r.category}</span>}
                {r.exchange && <span>{r.exchange}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !loading && q.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#CBD9DC] rounded-xl shadow-lg px-4 py-3 text-sm text-[#6B7E86]">
          No matches found — fill fields manually below.
        </div>
      )}
    </div>
  );
}

function EditModal({ item, onClose, onSave }: {
  item: Partial<Instrument>;
  onClose: () => void;
  onSave: (data: Partial<Instrument>) => Promise<void>;
}) {
  const [d, setD] = useState<Partial<Instrument>>(item);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isNew = !item.instrument_id;
  const set = (k: keyof Instrument, v: string | number | boolean | null) =>
    setD(p => ({ ...p, [k]: v === "" ? null : v }));

  const autofill = (r: LookupResult & { current_price?: number }) => {
    setD(prev => ({
      ...prev,
      instrument_id: r.instrument_id,
      name: r.name,
      instrument_type: r.instrument_type as string,
      isin: r.isin ?? prev.isin ?? null,
      ticker: r.instrument_type !== "MF" ? (r.ticker ?? prev.ticker ?? null) : null,
      asset_class: r.asset_class ?? prev.asset_class ?? "Equity",
      category: r.category ?? prev.category ?? null,
      exchange: r.exchange ?? prev.exchange ?? null,
      current_price: r.current_price ?? prev.current_price ?? null,
      price_date: r.current_price ? new Date().toISOString().slice(0, 10) : prev.price_date ?? null,
    }));
  };

  const cats = (CATEGORIES as Record<string, string[]>)[d.asset_class ?? ""] ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#CBD9DC]">
          <h2 className="font-semibold text-[#0F3A46]">{isNew ? "Add instrument" : "Edit instrument"}</h2>
          <button onClick={onClose} className="text-[#6B7E86] hover:text-[#0F3A46] text-xl">✕</button>
        </div>
        <div className="p-6 space-y-5 text-sm">
          {/* Search autocomplete — only for new instruments */}
          {isNew && (
            <div className="bg-[#F0F7F8] border border-[#C0D8DB] rounded-xl p-4">
              <SearchBox onSelect={autofill} />
              <p className="text-[10px] text-[#6B7E86] mt-2">Select a result to auto-fill the fields below, then review and save.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
          {/* ID */}
          <div className="col-span-2">
            <label className="text-xs text-[#6B7E86] block mb-1">Instrument ID <span className="text-[#B4463C]">*</span></label>
            <input value={d.instrument_id ?? ""} onChange={e => set("instrument_id", e.target.value)}
              disabled={!isNew}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46] disabled:bg-[#F5F9FA] disabled:text-[#6B7E86]"
              placeholder="Auto-filled from search, or type e.g. NIFTY50-IDX" />
          </div>
          {/* Name */}
          <div className="col-span-2">
            <label className="text-xs text-[#6B7E86] block mb-1">Name <span className="text-[#B4463C]">*</span></label>
            <input value={d.name ?? ""} onChange={e => set("name", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          {/* Type / Asset class */}
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Type</label>
            <select value={d.instrument_type ?? ""} onChange={e => set("instrument_type", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]">
              <option value="">—</option>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Asset class</label>
            <select value={d.asset_class ?? ""} onChange={e => { set("asset_class", e.target.value); set("category", null); }}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]">
              {ASSET_CLASSES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          {/* Category / Sub-bucket */}
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Category</label>
            <select value={d.category ?? ""} onChange={e => set("category", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]">
              <option value="">—</option>
              {cats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Sub-bucket / strategy</label>
            <input value={d.sub_bucket ?? ""} onChange={e => set("sub_bucket", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" placeholder="Index / Active / Direct…" />
          </div>
          {/* Ticker / ISIN */}
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Ticker / Symbol</label>
            <input value={d.ticker ?? ""} onChange={e => set("ticker", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">ISIN</label>
            <input value={d.isin ?? ""} onChange={e => set("isin", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          {/* Risk / Knowledge */}
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Risk level</label>
            <select value={d.risk_level ?? ""} onChange={e => set("risk_level", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]">
              {RISK_LEVELS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Min. knowledge required</label>
            <select value={d.min_knowledge ?? ""} onChange={e => set("min_knowledge", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]">
              <option value="">—</option>
              {KNOWLEDGE.map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          {/* Current price / date */}
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Current price / NAV (₹)</label>
            <input type="number" value={d.current_price ?? ""} onChange={e => set("current_price", e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Price date</label>
            <input type="date" value={d.price_date?.slice(0,10) ?? ""} onChange={e => set("price_date", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          {/* Returns */}
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">3Y return (%)</label>
            <input type="number" value={d.return_3y ?? ""} onChange={e => set("return_3y", e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">5Y return (%)</label>
            <input type="number" value={d.return_5y ?? ""} onChange={e => set("return_5y", e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          {/* Expense / Min SIP / Exchange */}
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Expense ratio (%)</label>
            <input type="number" value={d.expense_ratio ?? ""} onChange={e => set("expense_ratio", e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Min. SIP (₹)</label>
            <input type="number" value={d.min_sip ?? ""} onChange={e => set("min_sip", e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Exchange</label>
            <input value={d.exchange ?? ""} onChange={e => set("exchange", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" placeholder="NSE / BSE" />
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Liquidity</label>
            <input value={d.liquidity ?? ""} onChange={e => set("liquidity", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" placeholder="T+1 / T+3 / Lock-in" />
          </div>
          {/* Taxation */}
          <div className="col-span-2">
            <label className="text-xs text-[#6B7E86] block mb-1">Taxation</label>
            <input value={d.taxation ?? ""} onChange={e => set("taxation", e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
          {/* Flags */}
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={!!d.esg} onChange={e => set("esg", e.target.checked)} id="esg" className="accent-[#175A69]" />
            <label htmlFor="esg" className="text-sm text-[#0F3A46]">ESG / Sustainable</label>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={!!d.international} onChange={e => set("international", e.target.checked)} id="intl" className="accent-[#175A69]" />
            <label htmlFor="intl" className="text-sm text-[#0F3A46]">International exposure</label>
          </div>
          {/* Notes */}
          <div className="col-span-2">
            <label className="text-xs text-[#6B7E86] block mb-1">Adviser notes</label>
            <textarea value={d.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46] resize-none" />
          </div>
          </div>{/* end grid */}
        </div>{/* end p-6 space-y-5 */}
        {saveError && (
          <div className="mx-6 mb-2 px-4 py-2.5 bg-[#F8E7E4] border border-[#E8C0BB] rounded-lg text-sm text-[#B4463C]">
            ⚠ {saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#CBD9DC]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6B7E86] hover:text-[#0F3A46]">Cancel</button>
          <button onClick={async () => {
              setSaving(true); setSaveError(null);
              try { await onSave(d); }
              catch (e) { setSaveError(String(e)); }
              setSaving(false);
            }}
            disabled={saving || !d.instrument_id || !d.name}
            className="px-4 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceUpdateModal({ item, onClose, onSave }: {
  item: Instrument;
  onClose: () => void;
  onSave: (price: number, date: string) => Promise<void>;
}) {
  const [price, setPrice] = useState(item.current_price?.toString() ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-[#CBD9DC]">
          <h2 className="font-semibold text-[#0F3A46]">Update market value</h2>
          <p className="text-xs text-[#6B7E86] mt-0.5">{item.name}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">Current price / NAV (₹)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46] text-lg font-semibold" autoFocus />
          </div>
          <div>
            <label className="text-xs text-[#6B7E86] block mb-1">As of date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-[#0F3A46]" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#CBD9DC]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6B7E86]">Cancel</button>
          <button onClick={async () => { setSaving(true); await onSave(parseFloat(price), date); setSaving(false); }}
            disabled={saving || !price}
            className="px-4 py-2 bg-[#C39A38] text-white text-sm font-medium rounded-lg hover:bg-[#a8832e] disabled:opacity-50">
            {saving ? "Updating…" : "Update price"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UniverseClient({ initialData }: { initialData: Instrument[] }) {
  const [data, setData] = useState<Instrument[]>(initialData);
  const [filter, setFilter] = useState({ type: "", asset: "", risk: "", search: "" });
  const [editItem, setEditItem] = useState<Partial<Instrument> | null>(null);
  const [priceItem, setPriceItem] = useState<Instrument | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);

  // Sync local state when server component re-fetches after router.refresh()
  useEffect(() => { setData(initialData); }, [initialData]);
  const [refreshResult, setRefreshResult] = useState<{ updated: number; failed: number; total: number; results?: { name: string | null; price?: number; error?: string; source?: string }[] } | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const router = useRouter();

  const filtered = data.filter(d =>
    (!filter.type   || d.instrument_type === filter.type) &&
    (!filter.asset  || d.asset_class === filter.asset) &&
    (!filter.risk   || d.risk_level === filter.risk) &&
    (!filter.search || [d.name, d.ticker, d.isin, d.category].some(f => f?.toLowerCase().includes(filter.search.toLowerCase())))
  );

  const grouped = filtered.reduce<Record<string, Instrument[]>>((acc, d) => {
    const k = d.asset_class ?? "Other";
    acc[k] = [...(acc[k] ?? []), d];
    return acc;
  }, {});

  const apiCall = async (path: string, method: string, body?: unknown) => {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const handleSave = async (d: Partial<Instrument>) => {
    const isNew = !data.find(i => i.instrument_id === d.instrument_id);
    const res = await fetch("/api/investment-universe", {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? "Save failed");
    setEditItem(null);
    // Optimistic local update
    setData(prev => isNew ? [...prev, d as Instrument] : prev.map(i => i.instrument_id === d.instrument_id ? { ...i, ...d } : i));
    startTransition(() => router.refresh());
  };

  const handleDelete = async (id: string) => {
    await apiCall(`/api/investment-universe?id=${encodeURIComponent(id)}`, "DELETE");
    setData(prev => prev.filter(i => i.instrument_id !== id));
    setDeleteId(null);
  };

  const handlePriceUpdate = async (price: number, date: string) => {
    if (!priceItem) return;
    await apiCall("/api/investment-universe", "PUT", { ...priceItem, current_price: price, price_date: date });
    setData(prev => prev.map(i => i.instrument_id === priceItem.instrument_id ? { ...i, current_price: price, price_date: date } : i));
    setPriceItem(null);
  };

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/investment-universe/refresh-prices", { method: "POST" });
      const json = await res.json();
      setRefreshResult(json);
      // Re-fetch updated data
      startTransition(() => router.refresh());
    } catch {
      setRefreshResult(null);
    }
    setRefreshing(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#0F3A46]">Investment Universe</h1>
          <p className="text-xs text-[#6B7E86] mt-0.5">{data.length} instruments · adviser-managed product list</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {refreshResult && (
            <div className="relative">
              <button onClick={() => setShowDetail(p => !p)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer ${refreshResult.failed === 0 ? "bg-[#E4F1EA] text-[#2E7D5B]" : "bg-[#FEF9E7] text-[#7D6B2E]"}`}>
                ✓ {refreshResult.updated}/{refreshResult.total} updated · {refreshResult.failed} manual ▾
              </button>
              {showDetail && refreshResult.results && (
                <div className="absolute right-0 top-9 z-50 bg-white border border-[#CBD9DC] rounded-xl shadow-xl w-96 max-h-72 overflow-y-auto">
                  <div className="px-4 py-2 border-b border-[#E7EFEF] flex justify-between items-center">
                    <span className="text-xs font-semibold text-[#0F3A46]">Refresh details</span>
                    <button onClick={() => setShowDetail(false)} className="text-[#6B7E86] text-sm">✕</button>
                  </div>
                  {refreshResult.results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 border-b border-[#F0F5F5] last:border-0">
                      <div className="text-xs text-[#0F3A46] truncate flex-1 mr-2">{r.name}</div>
                      {r.price ? (
                        <div className="text-right shrink-0">
                          <span className="text-xs font-semibold text-[#2E7D5B]">₹{r.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                          <span className="text-[10px] text-[#6B7E86] ml-1">{r.source}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#B4463C] shrink-0">{r.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={handleRefreshPrices} disabled={refreshing}
            className="px-4 py-2 bg-[#C39A38] text-white text-sm font-medium rounded-lg hover:bg-[#a8832e] disabled:opacity-60 transition-colors flex items-center gap-2">
            {refreshing ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />Fetching…</> : "⟳ Refresh Prices"}
          </button>
          <button onClick={() => setEditItem(BLANK)}
            className="px-4 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] transition-colors">
            + Add instrument
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-4 flex flex-wrap gap-3">
        <input value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          placeholder="Search name / ticker / ISIN…"
          className="border border-[#CBD9DC] rounded-lg px-3 py-1.5 text-sm text-[#0F3A46] w-56 focus:outline-none focus:ring-1 focus:ring-[#175A69]" />
        {[
          { key: "type", options: ["", ...TYPES], label: "Type" },
          { key: "asset", options: ["", ...ASSET_CLASSES], label: "Asset class" },
          { key: "risk", options: ["", ...RISK_LEVELS], label: "Risk" },
        ].map(({ key, options, label }) => (
          <select key={key} value={(filter as Record<string, string>)[key]} onChange={e => setFilter(f => ({ ...f, [key]: e.target.value }))}
            className="border border-[#CBD9DC] rounded-lg px-3 py-1.5 text-sm text-[#0F3A46] focus:outline-none focus:ring-1 focus:ring-[#175A69]">
            <option value="">{label}: All</option>
            {options.slice(1).map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
        {(filter.search || filter.type || filter.asset || filter.risk) && (
          <button onClick={() => setFilter({ type:"", asset:"", risk:"", search:"" })}
            className="text-xs text-[#175A69] hover:underline">Clear filters</button>
        )}
      </div>

      {/* Table by asset class */}
      {Object.entries(grouped).map(([assetClass, items]) => (
        <div key={assetClass} className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="bg-[#0F3A46] px-5 py-2.5">
            <h2 className="text-xs font-semibold tracking-widest uppercase text-[#BFD3D8]">{assetClass} · {items.length}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E7EFEF] bg-[#F5F9FA] text-xs text-[#6B7E86]">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-left px-4 py-2 font-medium">Risk</th>
                  <th className="text-right px-4 py-2 font-medium">Price / NAV</th>
                  <th className="text-right px-4 py-2 font-medium">3Y %</th>
                  <th className="text-right px-4 py-2 font-medium">5Y %</th>
                  <th className="text-right px-4 py-2 font-medium">ER %</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.instrument_id} className={`border-b border-[#E7EFEF] ${i % 2 === 0 ? "" : "bg-[#F9FBFC]"}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#0F3A46]">{item.name}</div>
                      <div className="text-[10px] text-[#6B7E86] mt-0.5 space-x-2">
                        {item.ticker && <span>{item.ticker}</span>}
                        {item.isin && <span className="font-mono">{item.isin}</span>}
                        {item.exchange && <span>{item.exchange}</span>}
                        {item.esg && <span className="text-[#2E7D5B]">ESG</span>}
                        {item.international && <span className="text-[#2C4A8C]">Intl</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.instrument_type && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[item.instrument_type] ?? "bg-[#DDE6E8] text-[#6B7E86]"}`}>
                          {item.instrument_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#6B7E86] text-xs">{item.category ?? "—"}{item.sub_bucket ? ` · ${item.sub_bucket}` : ""}</td>
                    <td className="px-4 py-3">
                      {item.risk_level && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLOR[item.risk_level] ?? "bg-[#DDE6E8] text-[#6B7E86]"}`}>
                          {item.risk_level}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.current_price != null ? (
                        <div>
                          <div className="font-semibold text-[#0F3A46]">{fmt(item.current_price)}</div>
                          {item.price_date && <div className="text-[10px] text-[#6B7E86]">{item.price_date.slice(0,10)}</div>}
                        </div>
                      ) : <span className="text-[#6B7E86]">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${item.return_3y != null ? (item.return_3y >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]") : "text-[#6B7E86]"}`}>
                      {item.return_3y != null ? `${item.return_3y}%` : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${item.return_5y != null ? (item.return_5y >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]") : "text-[#6B7E86]"}`}>
                      {item.return_5y != null ? `${item.return_5y}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7E86]">
                      {item.expense_ratio != null ? `${item.expense_ratio}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setPriceItem(item)}
                          title="Update price"
                          className="p-1.5 rounded text-[#C39A38] hover:bg-[#FEF9E7] transition-colors text-xs font-bold">₹</button>
                        <button onClick={() => setEditItem(item)}
                          className="p-1.5 rounded text-[#175A69] hover:bg-[#DDE6E8] transition-colors">✏</button>
                        <button onClick={() => setDeleteId(item.instrument_id)}
                          className="p-1.5 rounded text-[#B4463C] hover:bg-[#F8E7E4] transition-colors">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-8 text-center text-[#6B7E86]">
          No instruments match the current filters.
        </div>
      )}

      {/* Modals */}
      {editItem && <EditModal item={editItem} onClose={() => setEditItem(null)} onSave={handleSave} />}
      {priceItem && <PriceUpdateModal item={priceItem} onClose={() => setPriceItem(null)} onSave={handlePriceUpdate} />}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-[#0F3A46] mb-2">Remove instrument?</h2>
            <p className="text-sm text-[#6B7E86] mb-5">This will remove it from your universe. Any portfolio holdings referencing it will also be affected.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-[#6B7E86]">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 bg-[#B4463C] text-white text-sm font-medium rounded-lg hover:bg-[#923a31]">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
