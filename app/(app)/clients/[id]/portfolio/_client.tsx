"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AllocationPlan, UniverseRow, GoalInput } from "@/lib/allocationEngine";

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "draft" | "pending" | "placed" | "executed";
type Source = "engine" | "manual";

interface Position {
  id?: string;
  instrument_id: string;
  instrument_name: string;
  asset_class: string;
  category: string | null;
  bucket: string;
  goal_id: string | null;
  allocation_pct: number;
  lumpsum_amount: number;
  monthly_sip: number;
  executed_lumpsum: number;
  executed_sip: number;
  current_value: number | null;
  executed_at: string | null;
  status: Status;
  notes: string;
  source: Source;
}

interface Holding {
  holding_id?: string;
  instrument_id: string | null;
  custom_name: string;
  asset_class: string;
  bucket: string;
  lumpsum_invested: number;
  monthly_sip: number;
  current_value: number | null;
  purchase_date: string;
  rationale: string;
  notes: string;
  value_updated_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  draft:    { label: "Draft",    bg: "bg-[#F5F9FA]", text: "text-[#6B7E86]", border: "border-[#CBD9DC]" },
  pending:  { label: "Pending",  bg: "bg-[#FEF9E7]", text: "text-[#7D6B2E]", border: "border-[#E8C840]" },
  placed:   { label: "Placed",   bg: "bg-[#EAF3F8]", text: "text-[#1A4D6A]", border: "border-[#2C7DA0]" },
  executed: { label: "Executed", bg: "bg-[#E8F4EE]", text: "text-[#1A5C3A]", border: "border-[#2E7D5B]" },
};

const AC_COLOR: Record<string, string> = {
  Equity: "#175A69", Debt: "#C39A38", Gold: "#B8860B",
  International: "#4A90C4", Hybrid: "#7B5EA7", Alternate: "#B4463C",
};

const BUCKET_LABEL: Record<string, string> = {
  short: "Short-term", medium: "Medium-term", long: "Long-term", blend: "Blend",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 10_000_000) return "Rs." + (n / 10_000_000).toFixed(2) + " Cr";
  if (n >= 100_000)    return "Rs." + (n / 100_000).toFixed(2) + " L";
  return "Rs." + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtMo(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  return fmt(n) + "/mo";
}

// ── Swap Instrument Modal ──────────────────────────────────────────────────────
function SwapModal({ universe, currentId, assetClass, onSwap, onClose }: {
  universe: UniverseRow[]; currentId: string; assetClass: string;
  onSwap: (u: UniverseRow) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const eligible = universe.filter(u =>
    (!assetClass || u.asset_class === assetClass) &&
    (!search || (u.name ?? u.instrument_id).toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b border-[#E7EFEF] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#0F3A46] text-sm">Swap instrument</h3>
            <p className="text-[10px] text-[#6B7E86] mt-0.5">Showing {assetClass} instruments</p>
          </div>
          <button onClick={onClose} className="text-[#6B7E86] hover:text-[#0F3A46]">✕</button>
        </div>
        <div className="px-4 py-3 border-b border-[#E7EFEF]">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="w-full border border-[#CBD9DC] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#175A69]" />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#F0F5F6]">
          {eligible.length === 0 && <p className="text-sm text-[#6B7E86] p-4">No instruments found.</p>}
          {eligible.map(u => (
            <button key={u.instrument_id} onClick={() => { onSwap(u); onClose(); }}
              className={"w-full text-left px-4 py-3 hover:bg-[#F0F5F6] flex items-center gap-3 " + (u.instrument_id === currentId ? "bg-[#EBF3F5]" : "")}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AC_COLOR[u.asset_class ?? ""] ?? "#999" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#0F3A46] font-medium truncate">{u.name ?? u.instrument_id}</div>
                {u.category && <div className="text-[10px] text-[#6B7E86]">{u.category}</div>}
              </div>
              <div className="text-right shrink-0">
                {u.return_5y != null && <div className="text-xs text-[#2E7D5B] font-medium">{u.return_5y}% 5Y</div>}
                {u.expense_ratio != null && <div className="text-[10px] text-[#6B7E86]">ER {u.expense_ratio}%</div>}
              </div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-[#E7EFEF]">
          <button onClick={onClose} className="w-full text-sm text-[#6B7E86] hover:text-[#0F3A46]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Position Modal ─────────────────────────────────────────────────────────
function AddPositionModal({ universe, goals, onAdd, onClose }: {
  universe: UniverseRow[]; goals: GoalInput[];
  onAdd: (p: Position) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UniverseRow | null>(null);
  const [goalId, setGoalId] = useState("");
  const [bucket, setBucket] = useState("long");
  const [lumpsum, setLumpsum] = useState(0);
  const [sip, setSip] = useState(0);
  const [allocPct, setAllocPct] = useState(0);
  const filtered = universe.filter(u =>
    !search || (u.name ?? u.instrument_id).toLowerCase().includes(search.toLowerCase()) ||
    (u.asset_class ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const submit = () => {
    if (!selected) return;
    onAdd({
      instrument_id: selected.instrument_id, instrument_name: selected.name ?? selected.instrument_id,
      asset_class: selected.asset_class ?? "", category: selected.category,
      bucket, goal_id: goalId || null,
      allocation_pct: allocPct, lumpsum_amount: lumpsum, monthly_sip: sip,
      executed_lumpsum: 0, executed_sip: 0, current_value: null, executed_at: null,
      status: "draft", notes: "", source: "manual",
    });
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-[#E7EFEF] flex items-center justify-between">
          <h3 className="font-semibold text-[#0F3A46]">Add Position</h3>
          <button onClick={onClose} className="text-[#6B7E86] hover:text-[#0F3A46] text-xl leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Instrument</label>
            <input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }} placeholder="Search..."
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            {search && !selected && (
              <div className="mt-1 border border-[#CBD9DC] rounded-lg max-h-36 overflow-y-auto">
                {filtered.slice(0, 8).map(u => (
                  <button key={u.instrument_id} onClick={() => { setSelected(u); setSearch(u.name ?? u.instrument_id); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#F0F5F6] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[u.asset_class ?? ""] ?? "#999" }} />
                    <span className="flex-1 truncate text-[#0F3A46]">{u.name ?? u.instrument_id}</span>
                    <span className="text-[10px] text-[#6B7E86]">{u.asset_class}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-2 text-sm text-[#6B7E86]">None found</p>}
              </div>
            )}
            {selected && (
              <div className="mt-1 bg-[#F0F5F6] rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[selected.asset_class ?? ""] ?? "#999" }} />
                <span className="font-medium text-[#0F3A46]">{selected.asset_class}</span>
                {selected.category && <span className="text-[#6B7E86]">· {selected.category}</span>}
                {selected.return_5y != null && <span className="text-[#2E7D5B] ml-auto">{selected.return_5y}% 5Y</span>}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Bucket</label>
              <select value={bucket} onChange={e => setBucket(e.target.value)}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="short">Short-term</option><option value="medium">Medium-term</option>
                <option value="long">Long-term</option><option value="blend">Blend</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Goal (optional)</label>
              <select value={goalId} onChange={e => setGoalId(e.target.value)}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="">— none —</option>
                {goals.map(g => <option key={g.goal_id} value={g.goal_id}>{g.goal_name ?? "Goal"}</option>)}
              </select>
            </div>
            {[["Proposed lump sum", lumpsum, setLumpsum], ["Monthly SIP", sip, setSip], ["Allocation %", allocPct, setAllocPct]] .map(([label, val, setter]) => (
              <div key={label as string}>
                <label className="text-xs font-medium text-[#0F3A46] mb-1 block">{label as string}</label>
                <input type="number" min={0} value={val as number} onChange={e => (setter as (n: number) => void)(Number(e.target.value))}
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E7EFEF] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-[#CBD9DC] rounded-lg text-[#6B7E86]">Cancel</button>
          <button onClick={submit} disabled={!selected}
            className="px-4 py-2 text-sm bg-[#0F3A46] text-white rounded-lg disabled:opacity-50">Add position</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Holding Modal ─────────────────────────────────────────────────────────
function AddHoldingModal({ universe, onAdd, onClose }: {
  universe: UniverseRow[];
  onAdd: (h: Holding) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UniverseRow | null>(null);
  const [customName, setCustomName] = useState("");
  const [assetClass, setAssetClass] = useState("Equity");
  const [bucket, setBucket] = useState("long");
  const [lumpsum, setLumpsum] = useState(0);
  const [sip, setSip] = useState(0);
  const [currentVal, setCurrentVal] = useState<number | null>(null);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");

  const filtered = universe.filter(u =>
    !search || (u.name ?? u.instrument_id).toLowerCase().includes(search.toLowerCase())
  );

  const submit = () => {
    onAdd({
      instrument_id: selected?.instrument_id ?? null,
      custom_name: selected ? (selected.name ?? selected.instrument_id) : customName,
      asset_class: selected ? (selected.asset_class ?? assetClass) : assetClass,
      bucket,
      lumpsum_invested: lumpsum,
      monthly_sip: sip,
      current_value: currentVal,
      purchase_date: purchaseDate,
      rationale: "",
      notes,
      value_updated_at: currentVal != null ? new Date().toISOString() : null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-[#E7EFEF] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#0F3A46]">Add Existing Investment</h3>
            <p className="text-xs text-[#6B7E86] mt-0.5">Record an investment the client already holds</p>
          </div>
          <button onClick={onClose} className="text-[#6B7E86] hover:text-[#0F3A46] text-xl leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Search universe or enter custom */}
          <div>
            <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Instrument (from universe or custom)</label>
            <input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); setCustomName(e.target.value); }}
              placeholder="Search universe or type a custom name..."
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            {search && !selected && filtered.length > 0 && (
              <div className="mt-1 border border-[#CBD9DC] rounded-lg max-h-36 overflow-y-auto">
                {filtered.slice(0, 6).map(u => (
                  <button key={u.instrument_id} onClick={() => { setSelected(u); setSearch(u.name ?? u.instrument_id); setCustomName(u.name ?? u.instrument_id); setAssetClass(u.asset_class ?? assetClass); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#F0F5F6] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[u.asset_class ?? ""] ?? "#999" }} />
                    <span className="flex-1 truncate">{u.name ?? u.instrument_id}</span>
                    <span className="text-[10px] text-[#6B7E86]">{u.asset_class}</span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="mt-1 flex items-center gap-2 bg-[#F0F5F6] rounded-lg px-3 py-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[selected.asset_class ?? ""] ?? "#999" }} />
                <span className="font-medium text-[#0F3A46]">{selected.asset_class}</span>
                {selected.category && <span className="text-[#6B7E86]">· {selected.category}</span>}
                <button onClick={() => { setSelected(null); setSearch(""); }} className="ml-auto text-[#B4463C] text-[10px]">clear</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!selected && (
              <div>
                <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Asset class</label>
                <select value={assetClass} onChange={e => setAssetClass(e.target.value)}
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                  {["Equity","Debt","Gold","Hybrid","International","Alternate"].map(ac =>
                    <option key={ac} value={ac}>{ac}</option>
                  )}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Bucket</label>
              <select value={bucket} onChange={e => setBucket(e.target.value)}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="short">Short-term</option><option value="medium">Medium-term</option>
                <option value="long">Long-term</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Amount invested (Rs.)</label>
              <input type="number" min={0} value={lumpsum} onChange={e => setLumpsum(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Ongoing SIP (Rs./mo)</label>
              <input type="number" min={0} value={sip} onChange={e => setSip(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Current value (Rs.)</label>
              <input type="number" min={0} value={currentVal ?? ""} onChange={e => setCurrentVal(e.target.value ? Number(e.target.value) : null)}
                placeholder="Leave blank if unknown"
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Purchase date</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional"
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E7EFEF] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-[#CBD9DC] rounded-lg text-[#6B7E86]">Cancel</button>
          <button onClick={submit} disabled={!customName && !selected}
            className="px-4 py-2 text-sm bg-[#0F3A46] text-white rounded-lg disabled:opacity-50">Add holding</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PortfolioClient({
  clientId, clientName, plan, universe, goals, existingPositions, existingHoldings,
}: {
  clientId: string; clientName: string;
  plan: AllocationPlan; universe: UniverseRow[];
  goals: GoalInput[];
  existingPositions: Record<string, unknown>[];
  existingHoldings: Record<string, unknown>[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mainTab, setMainTab] = useState<"construction" | "live">("construction");

  // ── Positions state ──────────────────────────────────────────────────────────
  const initPositions = (): Position[] =>
    existingPositions.map(p => ({
      id: p.id as string,
      instrument_id: p.instrument_id as string,
      instrument_name: (p.instrument_name as string) ?? "",
      asset_class: (p.asset_class as string) ?? "",
      category: p.category as string | null,
      bucket: (p.bucket as string) ?? "long",
      goal_id: p.goal_id as string | null,
      allocation_pct: Number(p.allocation_pct ?? 0),
      lumpsum_amount: Number(p.lumpsum_amount ?? 0),
      monthly_sip: Number(p.monthly_sip ?? 0),
      executed_lumpsum: Number(p.executed_lumpsum ?? 0),
      executed_sip: Number(p.executed_sip ?? 0),
      current_value: p.current_value != null ? Number(p.current_value) : null,
      executed_at: p.executed_at as string | null,
      status: (p.status as Status) ?? "draft",
      notes: (p.notes as string) ?? "",
      source: (p.source as Source) ?? "manual",
    }));

  const initHoldings = (): Holding[] =>
    existingHoldings.map(h => ({
      holding_id: h.holding_id as string,
      instrument_id: h.instrument_id as string | null,
      custom_name: (h.custom_name as string) ?? "",
      asset_class: (h.asset_class as string) ?? "",
      bucket: (h.bucket as string) ?? "long",
      lumpsum_invested: Number(h.lumpsum_invested ?? 0),
      monthly_sip: Number(h.monthly_sip ?? 0),
      current_value: h.current_value != null ? Number(h.current_value) : null,
      purchase_date: (h.purchase_date as string) ?? "",
      rationale: (h.rationale as string) ?? "",
      notes: (h.notes as string) ?? "",
      value_updated_at: h.value_updated_at as string | null,
    }));

  const [positions, setPositions] = useState<Position[]>(initPositions);
  const [holdings, setHoldings] = useState<Holding[]>(initHoldings);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [swapTarget, setSwapTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingHoldings, setSavingHoldings] = useState(false);
  const [savedHoldings, setSavedHoldings] = useState(false);

  // ── Position helpers ─────────────────────────────────────────────────────────
  const buildFromPlan = () => {
    const newPos: Position[] = [];
    for (const bucket of plan.buckets) {
      for (const inst of bucket.instruments) {
        newPos.push({
          instrument_id: inst.instrument_id, instrument_name: inst.name,
          asset_class: inst.asset_class, category: inst.category,
          bucket: bucket.bucket, goal_id: null,
          allocation_pct: inst.weight, lumpsum_amount: 0, monthly_sip: inst.suggested_sip,
          executed_lumpsum: 0, executed_sip: 0, current_value: null, executed_at: null,
          status: "draft", notes: "", source: "engine",
        });
      }
    }
    setPositions(newPos); setSaved(false);
  };

  const updatePosition = (idx: number, updates: Partial<Position>) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, ...updates } : p));
    setSaved(false);
  };
  const removePosition = (idx: number) => { setPositions(prev => prev.filter((_, i) => i !== idx)); setSaved(false); };
  const addPosition = (p: Position) => { setPositions(prev => [...prev, p]); setSaved(false); };
  const swapInstrument = (idx: number, u: UniverseRow) => {
    updatePosition(idx, { instrument_id: u.instrument_id, instrument_name: u.name ?? u.instrument_id, asset_class: u.asset_class ?? "", category: u.category, source: "manual" });
  };

  const savePortfolio = async () => {
    setSaving(true);
    const rows = positions.map(({ id, ...p }) => ({ ...p, ...(id ? { id } : {}) }));
    await fetch("/api/clients/" + clientId + "/portfolio", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows),
    });
    setSaving(false); setSaved(true); startTransition(() => router.refresh());
  };

  // ── Holdings helpers ─────────────────────────────────────────────────────────
  const updateHolding = (idx: number, updates: Partial<Holding>) => {
    setHoldings(prev => prev.map((h, i) => i === idx ? { ...h, ...updates } : h));
    setSavedHoldings(false);
  };
  const removeHolding = (idx: number) => { setHoldings(prev => prev.filter((_, i) => i !== idx)); setSavedHoldings(false); };
  const addHolding = (h: Holding) => { setHoldings(prev => [...prev, h]); setSavedHoldings(false); };
  const saveHoldings = async () => {
    setSavingHoldings(true);
    const rows = holdings.map(({ holding_id, ...h }) => ({ ...h, ...(holding_id ? { holding_id } : {}) }));
    await fetch("/api/clients/" + clientId + "/holdings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows),
    });
    setSavingHoldings(false); setSavedHoldings(true); startTransition(() => router.refresh());
  };

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalLumpsum = positions.reduce((s, p) => s + p.lumpsum_amount, 0);
  const totalSIP     = positions.reduce((s, p) => s + p.monthly_sip, 0);
  const totalAllocPct = positions.reduce((s, p) => s + p.allocation_pct, 0);
  const executedPositions = positions.filter(p => p.status === "executed");
  const totalExecutedLump = executedPositions.reduce((s, p) => s + p.executed_lumpsum, 0);
  const totalExecutedSIP  = executedPositions.reduce((s, p) => s + p.executed_sip, 0);
  const totalCurrentValuePos = executedPositions.reduce((s, p) => s + (p.current_value ?? 0), 0);
  const totalCurrentValueHoldings = holdings.reduce((s, h) => s + (h.current_value ?? 0), 0);
  const totalLiveValue = totalCurrentValuePos + totalCurrentValueHoldings;
  const statusCounts = positions.reduce((acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const byBucket = ["short", "medium", "long", "blend"].map(b => ({
    bucket: b,
    positions: positions.filter(p => p.bucket === b),
  })).filter(b => b.positions.length > 0);

  const swapPos = swapTarget !== null ? positions[swapTarget] : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F3A46]">Portfolio Construction</h1>
          <p className="text-xs text-[#6B7E86] mt-0.5">
            {clientName} · Profile: <span className="font-medium text-[#0F3A46]">{plan.profile}</span>
          </p>
        </div>
        {mainTab === "construction" ? (
          <div className="flex gap-2">
            <button onClick={buildFromPlan} className="px-3 py-1.5 text-xs border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">Build from allocation plan</button>
            <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-xs border border-[#CBD9DC] text-[#0F3A46] rounded-lg hover:bg-[#F5F9FA]">+ Add position</button>
            <button onClick={savePortfolio} disabled={saving} className="px-4 py-1.5 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
              {saving ? "Saving..." : saved ? "✓ Saved" : "Save plan"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowAddHolding(true)} className="px-3 py-1.5 text-xs border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">+ Add existing investment</button>
            <button onClick={saveHoldings} disabled={savingHoldings} className="px-4 py-1.5 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
              {savingHoldings ? "Saving..." : savedHoldings ? "✓ Saved" : "Save holdings"}
            </button>
          </div>
        )}
      </div>

      {/* Main tabs */}
      <div className="border-b border-[#CBD9DC] flex gap-1">
        {([["construction", "Construction Plan"], ["live", "Live Portfolio"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMainTab(id)}
            className={"px-5 py-2 text-sm font-medium border-b-2 transition-colors " + (mainTab === id ? "border-[#0F3A46] text-[#0F3A46]" : "border-transparent text-[#6B7E86] hover:text-[#0F3A46]")}>
            {label}
            {id === "live" && (executedPositions.length > 0 || holdings.length > 0) && (
              <span className="ml-1.5 text-[10px] bg-[#0F3A46] text-white rounded-full px-1.5 py-0.5">
                {executedPositions.length + holdings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── CONSTRUCTION TAB ─────────────────────────────────────────────────── */}
      {mainTab === "construction" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Positions",      value: String(positions.length),          sub: "total" },
              { label: "Proposed lump",  value: fmt(totalLumpsum),                 sub: "one-time" },
              { label: "Proposed SIP",   value: fmtMo(totalSIP),                   sub: "recurring" },
              { label: "Plan SIP",       value: fmtMo(plan.totalMonthlySIP),        sub: "engine target" },
              { label: "Alloc total",    value: totalAllocPct.toFixed(0) + "%",
                sub: totalAllocPct === 100 ? "balanced" : "adjust to 100%",
                red: totalAllocPct !== 100 && positions.length > 0 },
            ].map(c => (
              <div key={c.label} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
                <div className="text-xs text-[#6B7E86] mb-1">{c.label}</div>
                <div className={"text-base font-semibold " + (c.red ? "text-[#B4463C]" : "text-[#0F3A46]")}>{c.value}</div>
                <div className="text-[10px] text-[#6B7E86] mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Status pills */}
          {positions.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {(["draft","pending","placed","executed"] as Status[]).map(s => {
                const count = statusCounts[s] ?? 0; if (count === 0) return null;
                const st = STATUS_STYLES[s];
                return <span key={s} className={"text-xs px-2.5 py-1 rounded-full border font-medium " + st.bg + " " + st.text + " " + st.border}>{count} {st.label}</span>;
              })}
              <span className="text-xs px-2.5 py-1 rounded-full border font-medium bg-[#EBF3F5] text-[#1A4D6A] border-[#2C7DA0]">
                {positions.filter(p => p.source === "engine").length} engine · {positions.filter(p => p.source === "manual").length} manual
              </span>
            </div>
          )}

          {positions.length === 0 && (
            <div className="bg-white border border-dashed border-[#CBD9DC] rounded-xl p-10 text-center">
              <p className="text-sm text-[#6B7E86] mb-4">No positions yet.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={buildFromPlan} className="px-4 py-2 text-sm bg-[#0F3A46] text-white rounded-lg">Build from allocation plan</button>
                <button onClick={() => setShowAdd(true)} className="px-4 py-2 text-sm border border-[#CBD9DC] text-[#0F3A46] rounded-lg">Add manually</button>
              </div>
            </div>
          )}

          {/* Positions table by bucket */}
          {byBucket.map(({ bucket, positions: bPos }) => (
            <div key={bucket} className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E7EFEF] flex items-center justify-between bg-[#F5F9FA]">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[#0F3A46]">{BUCKET_LABEL[bucket] ?? bucket}</h2>
                  <span className="text-xs text-[#6B7E86]">{bPos.length} position{bPos.length > 1 ? "s" : ""}</span>
                </div>
                <div className="flex gap-4 text-xs text-[#6B7E86]">
                  <span>Proposed SIP: <strong className="text-[#0F3A46]">{fmtMo(bPos.reduce((s,p) => s + p.monthly_sip, 0))}</strong></span>
                  {bPos.some(p => p.status === "executed") && (
                    <span>Executed SIP: <strong className="text-[#2E7D5B]">{fmtMo(bPos.filter(p => p.status === "executed").reduce((s,p) => s + p.executed_sip, 0))}</strong></span>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] border-b border-[#E7EFEF] bg-[#FAFCFC]">
                    <th className="text-left px-4 py-2 font-medium">Instrument</th>
                    <th className="text-right px-3 py-2 font-medium">Alloc%</th>
                    <th className="text-right px-3 py-2 font-medium">Proposed lump</th>
                    <th className="text-right px-3 py-2 font-medium">Proposed SIP</th>
                    <th className="text-right px-3 py-2 font-medium">Executed lump</th>
                    <th className="text-right px-3 py-2 font-medium">Executed SIP</th>
                    <th className="text-right px-3 py-2 font-medium">Current value</th>
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bPos.map((pos) => {
                    const globalIdx = positions.indexOf(pos);
                    const st = STATUS_STYLES[pos.status];
                    const isExecuted = pos.status === "executed";
                    return (
                      <tr key={pos.instrument_id + globalIdx} className={"border-b border-[#E7EFEF] hover:bg-[#FAFCFC] " + (isExecuted ? "bg-[#F4FAF6]" : "")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AC_COLOR[pos.asset_class] ?? "#999" }} />
                            <span className="font-medium text-[#0F3A46] truncate max-w-[140px] text-xs">{pos.instrument_name}</span>
                            {pos.source === "engine" && (
                              <span className="text-[9px] px-1 py-0.5 rounded-full bg-[#EBF3F5] text-[#1A4D6A] border border-[#BDD4DB] font-medium">eng</span>
                            )}
                          </div>
                          {pos.goal_id && <div className="text-[10px] text-[#175A69] ml-3.5">{goals.find(g => g.goal_id === pos.goal_id)?.goal_name}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input type="number" min={0} max={100} value={pos.allocation_pct}
                            onChange={e => updatePosition(globalIdx, { allocation_pct: Number(e.target.value) })}
                            className="w-12 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />%
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input type="number" min={0} value={pos.lumpsum_amount}
                            onChange={e => updatePosition(globalIdx, { lumpsum_amount: Number(e.target.value) })}
                            className="w-20 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input type="number" min={0} value={pos.monthly_sip}
                            onChange={e => updatePosition(globalIdx, { monthly_sip: Number(e.target.value) })}
                            className="w-20 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        {/* Executed fields — always visible, highlighted when executed */}
                        <td className="px-3 py-2.5 text-right">
                          <input type="number" min={0} value={pos.executed_lumpsum}
                            onChange={e => updatePosition(globalIdx, { executed_lumpsum: Number(e.target.value) })}
                            className={"w-20 text-right border rounded px-1 py-0.5 text-xs focus:outline-none " + (isExecuted ? "border-[#2E7D5B] bg-[#F0FAF4] focus:border-[#1A5C3A]" : "border-[#E7EFEF] focus:border-[#175A69]")} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input type="number" min={0} value={pos.executed_sip}
                            onChange={e => updatePosition(globalIdx, { executed_sip: Number(e.target.value) })}
                            className={"w-20 text-right border rounded px-1 py-0.5 text-xs focus:outline-none " + (isExecuted ? "border-[#2E7D5B] bg-[#F0FAF4] focus:border-[#1A5C3A]" : "border-[#E7EFEF] focus:border-[#175A69]")} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input type="number" min={0} value={pos.current_value ?? ""}
                            onChange={e => updatePosition(globalIdx, { current_value: e.target.value ? Number(e.target.value) : null })}
                            placeholder="—"
                            className={"w-20 text-right border rounded px-1 py-0.5 text-xs focus:outline-none " + (isExecuted ? "border-[#2E7D5B] bg-[#F0FAF4] focus:border-[#1A5C3A]" : "border-[#E7EFEF] focus:border-[#175A69]")} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <select value={pos.status}
                            onChange={e => {
                              const newStatus = e.target.value as Status;
                              updatePosition(globalIdx, {
                                status: newStatus,
                                executed_at: newStatus === "executed" ? new Date().toISOString() : pos.executed_at,
                              });
                            }}
                            className={"text-[10px] px-1.5 py-1 rounded-full border font-medium focus:outline-none " + st.bg + " " + st.text + " " + st.border}>
                            <option value="draft">Draft</option><option value="pending">Pending</option>
                            <option value="placed">Placed</option><option value="executed">Executed</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setSwapTarget(globalIdx)} className="text-[10px] text-[#175A69] hover:underline">Swap</button>
                            <button onClick={() => removePosition(globalIdx)} className="text-[10px] text-[#B4463C] hover:underline">Remove</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {/* SAA reference */}
          {positions.length > 0 && (
            <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E7EFEF] bg-[#F5F9FA]">
                <h2 className="text-sm font-semibold text-[#0F3A46]">SAA reference</h2>
              </div>
              <div className="p-5 grid grid-cols-6 gap-3">
                {Object.entries(plan.assetAllocation).map(([ac, pct]) => {
                  const pp = positions.filter(p => p.asset_class === ac).reduce((s, p) => s + p.allocation_pct, 0);
                  const diff = pp - pct;
                  return (
                    <div key={ac} className="text-center">
                      <div className="w-2.5 h-2.5 rounded-full mx-auto mb-1" style={{ background: AC_COLOR[ac] ?? "#999" }} />
                      <div className="text-xs font-medium text-[#0F3A46] truncate">{ac}</div>
                      <div className="text-sm font-semibold text-[#0F3A46]">{pct}%</div>
                      <div className="text-[10px] text-[#6B7E86]">target</div>
                      {pp > 0 && <div className={"text-[10px] font-medium mt-0.5 " + (Math.abs(diff) <= 2 ? "text-[#2E7D5B]" : "text-[#B4463C]")}>{pp}% {diff !== 0 ? "(" + (diff > 0 ? "+" : "") + diff.toFixed(0) + ")" : "✓"}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── LIVE PORTFOLIO TAB ───────────────────────────────────────────────── */}
      {mainTab === "live" && (
        <>
          {/* Live summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Executed positions", value: String(executedPositions.length), sub: "from plan" },
              { label: "Executed lump sum",  value: fmt(totalExecutedLump),            sub: "actual invested" },
              { label: "Executed SIP",       value: fmtMo(totalExecutedSIP),           sub: "actual monthly" },
              { label: "Total portfolio value", value: fmt(totalLiveValue),            sub: "positions + holdings", green: totalLiveValue > 0 },
            ].map(c => (
              <div key={c.label} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
                <div className="text-xs text-[#6B7E86] mb-1">{c.label}</div>
                <div className={"text-lg font-semibold " + (c.green ? "text-[#2E7D5B]" : "text-[#0F3A46]")}>{c.value}</div>
                <div className="text-[10px] text-[#6B7E86] mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Executed positions from plan */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E7EFEF] bg-[#F5F9FA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#0F3A46]">Executed from plan</h2>
                <p className="text-xs text-[#6B7E86] mt-0.5">Positions marked executed — proposed vs actual amounts</p>
              </div>
              <span className="text-xs px-2 py-0.5 bg-[#E8F4EE] text-[#1A5C3A] border border-[#2E7D5B] rounded-full font-medium">
                {executedPositions.length} executed
              </span>
            </div>
            {executedPositions.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#6B7E86]">
                No positions have been marked as executed yet. Mark positions as "Executed" in the Construction Plan tab and enter actual amounts.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] border-b border-[#E7EFEF] bg-[#FAFCFC]">
                    <th className="text-left px-4 py-2 font-medium">Instrument</th>
                    <th className="text-left px-4 py-2 font-medium">Bucket</th>
                    <th className="text-right px-4 py-2 font-medium">Proposed lump</th>
                    <th className="text-right px-4 py-2 font-medium">Executed lump</th>
                    <th className="text-right px-4 py-2 font-medium">Proposed SIP</th>
                    <th className="text-right px-4 py-2 font-medium">Executed SIP</th>
                    <th className="text-right px-4 py-2 font-medium">Current value</th>
                    <th className="text-right px-4 py-2 font-medium">G/L</th>
                  </tr>
                </thead>
                <tbody>
                  {executedPositions.map((pos, i) => {
                    const totalInvested = pos.executed_lumpsum + (pos.executed_sip * 12); // approx
                    const gl = pos.current_value != null ? pos.current_value - pos.executed_lumpsum : null;
                    const glPct = gl != null && pos.executed_lumpsum > 0 ? (gl / pos.executed_lumpsum * 100).toFixed(1) : null;
                    const globalIdx = positions.indexOf(pos);
                    return (
                      <tr key={pos.id ?? i} className={"border-b border-[#E7EFEF] " + (i % 2 === 0 ? "" : "bg-[#F9FBFC]")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[pos.asset_class] ?? "#999" }} />
                            <span className="font-medium text-[#0F3A46] text-xs">{pos.instrument_name}</span>
                          </div>
                          {pos.category && <div className="text-[10px] text-[#6B7E86] ml-3.5">{pos.category}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6B7E86] capitalize">{pos.bucket}</td>
                        <td className="px-4 py-3 text-right text-xs text-[#6B7E86]">{fmt(pos.lumpsum_amount)}</td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={pos.executed_lumpsum}
                            onChange={e => updatePosition(globalIdx, { executed_lumpsum: Number(e.target.value) })}
                            className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[#6B7E86]">{fmtMo(pos.monthly_sip)}</td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={pos.executed_sip}
                            onChange={e => updatePosition(globalIdx, { executed_sip: Number(e.target.value) })}
                            className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={pos.current_value ?? ""}
                            onChange={e => updatePosition(globalIdx, { current_value: e.target.value ? Number(e.target.value) : null })}
                            placeholder="Enter value"
                            className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {gl != null ? (
                            <div className={"text-xs font-semibold " + (gl >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]")}>
                              {gl >= 0 ? "+" : ""}{fmt(gl)}
                              {glPct && <div className="text-[10px] font-normal">{gl >= 0 ? "+" : ""}{glPct}%</div>}
                            </div>
                          ) : <span className="text-xs text-[#6B7E86]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#CBD9DC] bg-[#F5F9FA]">
                    <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-[#0F3A46]">Total</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmt(totalExecutedLump)}</td>
                    <td className="px-4 py-2 text-right text-xs text-[#6B7E86]"></td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmtMo(totalExecutedSIP)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#2E7D5B]">{totalCurrentValuePos > 0 ? fmt(totalCurrentValuePos) : "—"}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold">
                      {totalCurrentValuePos > 0 && totalExecutedLump > 0 ? (
                        <span className={(totalCurrentValuePos - totalExecutedLump) >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]"}>
                          {(totalCurrentValuePos - totalExecutedLump) >= 0 ? "+" : ""}{fmt(totalCurrentValuePos - totalExecutedLump)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Existing holdings */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E7EFEF] bg-[#F5F9FA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#0F3A46]">Existing investments</h2>
                <p className="text-xs text-[#6B7E86] mt-0.5">Investments the client held before this plan</p>
              </div>
              <button onClick={() => setShowAddHolding(true)}
                className="text-xs px-3 py-1 border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">
                + Add investment
              </button>
            </div>
            {holdings.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#6B7E86]">
                No existing investments recorded. Add investments the client already holds outside this plan.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] border-b border-[#E7EFEF] bg-[#FAFCFC]">
                    <th className="text-left px-4 py-2 font-medium">Investment</th>
                    <th className="text-left px-4 py-2 font-medium">Asset class</th>
                    <th className="text-left px-4 py-2 font-medium">Bucket</th>
                    <th className="text-right px-4 py-2 font-medium">Invested</th>
                    <th className="text-right px-4 py-2 font-medium">SIP/mo</th>
                    <th className="text-right px-4 py-2 font-medium">Current value</th>
                    <th className="text-right px-4 py-2 font-medium">G/L</th>
                    <th className="text-right px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const gl = h.current_value != null ? h.current_value - h.lumpsum_invested : null;
                    const glPct = gl != null && h.lumpsum_invested > 0 ? (gl / h.lumpsum_invested * 100).toFixed(1) : null;
                    return (
                      <tr key={h.holding_id ?? i} className={"border-b border-[#E7EFEF] " + (i % 2 === 0 ? "" : "bg-[#F9FBFC]")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[h.asset_class] ?? "#999" }} />
                            <span className="font-medium text-[#0F3A46] text-xs truncate max-w-[160px]">{h.custom_name}</span>
                          </div>
                          {h.purchase_date && <div className="text-[10px] text-[#6B7E86] ml-3.5">Since {h.purchase_date}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6B7E86]">{h.asset_class}</td>
                        <td className="px-4 py-3 text-xs">
                          <select value={h.bucket} onChange={e => updateHolding(i, { bucket: e.target.value })}
                            className="text-xs border border-[#E7EFEF] rounded px-1 py-0.5 focus:outline-none focus:border-[#175A69] text-[#0F3A46]">
                            <option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={h.lumpsum_invested}
                            onChange={e => updateHolding(i, { lumpsum_invested: Number(e.target.value) })}
                            className="w-24 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={h.monthly_sip}
                            onChange={e => updateHolding(i, { monthly_sip: Number(e.target.value) })}
                            className="w-20 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={h.current_value ?? ""}
                            onChange={e => updateHolding(i, { current_value: e.target.value ? Number(e.target.value) : null, value_updated_at: new Date().toISOString() })}
                            placeholder="Enter value"
                            className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {gl != null ? (
                            <div className={"text-xs font-semibold " + (gl >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]")}>
                              {gl >= 0 ? "+" : ""}{fmt(gl)}
                              {glPct && <div className="text-[10px] font-normal">{gl >= 0 ? "+" : ""}{glPct}%</div>}
                            </div>
                          ) : <span className="text-xs text-[#6B7E86]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => removeHolding(i)} className="text-[10px] text-[#B4463C] hover:underline">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#CBD9DC] bg-[#F5F9FA]">
                    <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-[#0F3A46]">Total</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmt(holdings.reduce((s,h) => s + h.lumpsum_invested, 0))}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmtMo(holdings.reduce((s,h) => s + h.monthly_sip, 0))}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#2E7D5B]">{totalCurrentValueHoldings > 0 ? fmt(totalCurrentValueHoldings) : "—"}</td>
                    <td colSpan={2} className="px-4 py-2 text-right text-xs font-semibold">
                      {totalCurrentValueHoldings > 0 ? (
                        <span className={(totalCurrentValueHoldings - holdings.reduce((s,h) => s + h.lumpsum_invested, 0)) >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]"}>
                          {fmt(totalCurrentValueHoldings - holdings.reduce((s,h) => s + h.lumpsum_invested, 0))}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Save button for live tab */}
          {(executedPositions.length > 0 || holdings.length > 0) && (
            <div className="flex justify-end">
              <button onClick={async () => { await savePortfolio(); await saveHoldings(); }}
                disabled={saving || savingHoldings}
                className="px-5 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
                {saving || savingHoldings ? "Saving..." : "Save all changes"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAdd && <AddPositionModal universe={universe} goals={goals} onAdd={addPosition} onClose={() => setShowAdd(false)} />}
      {showAddHolding && <AddHoldingModal universe={universe} onAdd={addHolding} onClose={() => setShowAddHolding(false)} />}
      {swapTarget !== null && swapPos && (
        <SwapModal universe={universe} currentId={swapPos.instrument_id} assetClass={swapPos.asset_class}
          onSwap={u => swapInstrument(swapTarget, u)} onClose={() => setSwapTarget(null)} />
      )}
    </div>
  );
}
