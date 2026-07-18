"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AllocationPlan, UniverseRow, GoalInput } from "@/lib/allocationEngine";

// ── Types ──────────────────────────────────────────────────────────────────────
type Status = "draft" | "pending" | "placed" | "executed";
type Source = "engine" | "manual";
type ActionType = "proposed" | "placed" | "executed" | "amended" | "note" | "communication" | "review" | "rebalance";

interface Position {
  id?: string;
  instrument_id: string; instrument_name: string;
  asset_class: string; category: string | null;
  bucket: string; goal_id: string | null;
  allocation_pct: number; max_allocation_pct: number | null;
  lumpsum_amount: number; monthly_sip: number;
  executed_lumpsum: number; executed_sip: number;
  current_value: number | null; executed_at: string | null;
  status: Status; notes: string; source: Source;
}

interface Holding {
  holding_id?: string; instrument_id: string | null;
  custom_name: string; asset_class: string; bucket: string;
  lumpsum_invested: number; monthly_sip: number;
  current_value: number | null; purchase_date: string;
  rationale: string; notes: string; value_updated_at: string | null;
}

interface LogEntry {
  log_id?: string; position_id?: string | null;
  action_type: ActionType; instrument_name?: string | null;
  old_status?: string | null; new_status?: string | null;
  proposed_lump?: number | null; proposed_sip?: number | null;
  executed_lump?: number | null; executed_sip?: number | null;
  allocation_pct?: number | null; description?: string | null;
  is_manual: boolean; created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  draft:    { label: "Draft",    bg: "bg-[#F5F9FA]", text: "text-[#6B7E86]", border: "border-[#CBD9DC]" },
  pending:  { label: "Pending",  bg: "bg-[#FEF9E7]", text: "text-[#7D6B2E]", border: "border-[#E8C840]" },
  placed:   { label: "Placed",   bg: "bg-[#EAF3F8]", text: "text-[#1A4D6A]", border: "border-[#2C7DA0]" },
  executed: { label: "Executed", bg: "bg-[#E8F4EE]", text: "text-[#1A5C3A]", border: "border-[#2E7D5B]" },
};

const ACTION_STYLES: Record<ActionType, { label: string; bg: string; text: string; icon: string }> = {
  proposed:      { label: "Proposed",      bg: "bg-[#F5F9FA]", text: "text-[#6B7E86]", icon: "📋" },
  placed:        { label: "Placed",        bg: "bg-[#EAF3F8]", text: "text-[#1A4D6A]", icon: "📤" },
  executed:      { label: "Executed",      bg: "bg-[#E8F4EE]", text: "text-[#1A5C3A]", icon: "✅" },
  amended:       { label: "Amended",       bg: "bg-[#FEF9E7]", text: "text-[#7D6B2E]", icon: "✏️" },
  note:          { label: "Note",          bg: "bg-[#F0F5F6]", text: "text-[#0F3A46]", icon: "📝" },
  communication: { label: "Communication", bg: "bg-[#EBF3F5]", text: "text-[#1A4D6A]", icon: "💬" },
  review:        { label: "Review",        bg: "bg-[#F3EEF8]", text: "text-[#5B3A7A]", icon: "🔍" },
  rebalance:     { label: "Rebalance",     bg: "bg-[#FDF0F0]", text: "text-[#7A2020]", icon: "⚖️" },
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
function fmtMo(n: number | null | undefined) { return n == null || n === 0 ? "—" : fmt(n) + "/mo"; }

// ── Swap Modal ─────────────────────────────────────────────────────────────────
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
function AddPositionModal({ universe, goals, defaultCap, onAdd, onClose }: {
  universe: UniverseRow[]; goals: GoalInput[]; defaultCap: number;
  onAdd: (p: Position) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState<UniverseRow | null>(null);
  const [goalId, setGoalId] = useState(""); const [bucket, setBucket] = useState("long");
  const [lumpsum, setLumpsum] = useState(0); const [sip, setSip] = useState(0);
  const [allocPct, setAllocPct] = useState(0); const [maxPct, setMaxPct] = useState(defaultCap);
  const filtered = universe.filter(u =>
    !search || (u.name ?? u.instrument_id).toLowerCase().includes(search.toLowerCase()) || (u.asset_class ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const submit = () => {
    if (!selected) return;
    onAdd({
      instrument_id: selected.instrument_id, instrument_name: selected.name ?? selected.instrument_id,
      asset_class: selected.asset_class ?? "", category: selected.category,
      bucket, goal_id: goalId || null, allocation_pct: allocPct, max_allocation_pct: maxPct,
      lumpsum_amount: lumpsum, monthly_sip: sip,
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
                    <span className="flex-1 truncate">{u.name ?? u.instrument_id}</span>
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
              <select value={bucket} onChange={e => setBucket(e.target.value)} className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="short">Short-term</option><option value="medium">Medium-term</option>
                <option value="long">Long-term</option><option value="blend">Blend</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Goal (optional)</label>
              <select value={goalId} onChange={e => setGoalId(e.target.value)} className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="">— none —</option>
                {goals.map(g => <option key={g.goal_id} value={g.goal_id}>{g.goal_name ?? "Goal"}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Allocation %</label>
              <input type="number" min={0} max={100} value={allocPct} onChange={e => setAllocPct(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Concentration cap %</label>
              <input type="number" min={0} max={100} value={maxPct} onChange={e => setMaxPct(Number(e.target.value))}
                className={"w-full border rounded-lg px-3 py-2 text-sm focus:outline-none " + (allocPct > maxPct ? "border-[#B4463C] bg-[#FDF5F5]" : "border-[#CBD9DC] focus:border-[#175A69]")} />
              {allocPct > maxPct && <p className="text-[10px] text-[#B4463C] mt-0.5">Allocation exceeds cap</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Proposed lump sum</label>
              <input type="number" min={0} value={lumpsum} onChange={e => setLumpsum(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Monthly SIP</label>
              <input type="number" min={0} value={sip} onChange={e => setSip(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
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

// ── Add Holding Modal ──────────────────────────────────────────────────────────
function AddHoldingModal({ universe, onAdd, onClose }: {
  universe: UniverseRow[]; onAdd: (h: Holding) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState<UniverseRow | null>(null);
  const [customName, setCustomName] = useState(""); const [assetClass, setAssetClass] = useState("Equity");
  const [bucket, setBucket] = useState("long"); const [lumpsum, setLumpsum] = useState(0);
  const [sip, setSip] = useState(0); const [currentVal, setCurrentVal] = useState<number | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(""); const [notes, setNotes] = useState("");
  const filtered = universe.filter(u => !search || (u.name ?? u.instrument_id).toLowerCase().includes(search.toLowerCase()));
  const submit = () => {
    onAdd({
      instrument_id: selected?.instrument_id ?? null,
      custom_name: selected ? (selected.name ?? selected.instrument_id) : customName,
      asset_class: selected ? (selected.asset_class ?? assetClass) : assetClass,
      bucket, lumpsum_invested: lumpsum, monthly_sip: sip, current_value: currentVal,
      purchase_date: purchaseDate, rationale: "", notes,
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
          <div>
            <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Instrument (universe or custom name)</label>
            <input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); setCustomName(e.target.value); }} placeholder="Search universe or type custom name..."
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
                <select value={assetClass} onChange={e => setAssetClass(e.target.value)} className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                  {["Equity","Debt","Gold","Hybrid","International","Alternate"].map(ac => <option key={ac} value={ac}>{ac}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Bucket</label>
              <select value={bucket} onChange={e => setBucket(e.target.value)} className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="short">Short-term</option><option value="medium">Medium-term</option><option value="long">Long-term</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Amount invested (Rs.)</label>
              <input type="number" min={0} value={lumpsum} onChange={e => setLumpsum(Number(e.target.value))} className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Ongoing SIP (Rs./mo)</label>
              <input type="number" min={0} value={sip} onChange={e => setSip(Number(e.target.value))} className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Current value (Rs.)</label>
              <input type="number" min={0} value={currentVal ?? ""} onChange={e => setCurrentVal(e.target.value ? Number(e.target.value) : null)} placeholder="Optional" className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Purchase date</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E7EFEF] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-[#CBD9DC] rounded-lg text-[#6B7E86]">Cancel</button>
          <button onClick={submit} disabled={!customName && !selected} className="px-4 py-2 text-sm bg-[#0F3A46] text-white rounded-lg disabled:opacity-50">Add holding</button>
        </div>
      </div>
    </div>
  );
}

// ── Concentration cap bar ──────────────────────────────────────────────────────
function CapBar({ alloc, cap }: { alloc: number; cap: number }) {
  const pct = cap > 0 ? Math.min((alloc / cap) * 100, 120) : 0;
  const over = alloc > cap;
  const warn = !over && alloc >= cap * 0.8;
  return (
    <div className="w-16 flex flex-col items-end gap-0.5">
      <div className="w-full h-1.5 bg-[#E7EFEF] rounded-full overflow-hidden">
        <div className={"h-full rounded-full transition-all " + (over ? "bg-[#B4463C]" : warn ? "bg-[#C39A38]" : "bg-[#2E7D5B]")}
          style={{ width: Math.min(pct, 100) + "%" }} />
      </div>
      <span className={"text-[9px] font-medium " + (over ? "text-[#B4463C]" : warn ? "text-[#7D6B2E]" : "text-[#6B7E86]")}>
        {alloc}% / {cap}%{over ? " ⚠" : ""}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PortfolioClient({
  clientId, clientName, plan, universe, goals, concentrationCap,
  existingPositions, existingHoldings, initialActivityLog,
}: {
  clientId: string; clientName: string; plan: AllocationPlan;
  universe: UniverseRow[]; goals: GoalInput[]; concentrationCap: number;
  existingPositions: Record<string, unknown>[];
  existingHoldings: Record<string, unknown>[];
  initialActivityLog: Record<string, unknown>[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mainTab, setMainTab] = useState<"construction" | "live" | "log">("construction");

  // ── Positions ──────────────────────────────────────────────────────────────
  const initPositions = (): Position[] => existingPositions.map(p => ({
    id: p.id as string,
    instrument_id: p.instrument_id as string,
    instrument_name: (p.instrument_name as string) ?? "",
    asset_class: (p.asset_class as string) ?? "",
    category: p.category as string | null,
    bucket: (p.bucket as string) ?? "long",
    goal_id: p.goal_id as string | null,
    allocation_pct: Number(p.allocation_pct ?? 0),
    max_allocation_pct: p.max_allocation_pct != null ? Number(p.max_allocation_pct) : null,
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

  const [positions, setPositions] = useState<Position[]>(initPositions);
  // Track prev statuses for auto-logging
  const prevStatusRef = useRef<Map<string, Status>>(
    new Map(existingPositions.map(p => [p.instrument_id as string, (p.status as Status) ?? "draft"]))
  );

  const initHoldings = (): Holding[] => existingHoldings.map(h => ({
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

  const initLog = (): LogEntry[] => initialActivityLog.map(e => ({
    log_id: e.log_id as string,
    position_id: e.position_id as string | null,
    action_type: (e.action_type as ActionType) ?? "note",
    instrument_name: e.instrument_name as string | null,
    old_status: e.old_status as string | null,
    new_status: e.new_status as string | null,
    proposed_lump: e.proposed_lump != null ? Number(e.proposed_lump) : null,
    proposed_sip: e.proposed_sip != null ? Number(e.proposed_sip) : null,
    executed_lump: e.executed_lump != null ? Number(e.executed_lump) : null,
    executed_sip: e.executed_sip != null ? Number(e.executed_sip) : null,
    allocation_pct: e.allocation_pct != null ? Number(e.allocation_pct) : null,
    description: e.description as string | null,
    is_manual: Boolean(e.is_manual),
    created_at: (e.created_at as string) ?? new Date().toISOString(),
  }));

  const [holdings, setHoldings] = useState<Holding[]>(initHoldings);
  const [activityLog, setActivityLog] = useState<LogEntry[]>(initLog);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [swapTarget, setSwapTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const [savingH, setSavingH] = useState(false); const [savedH, setSavedH] = useState(false);

  // Manual log entry form state
  const [logType, setLogType] = useState<ActionType>("note");
  const [logDesc, setLogDesc] = useState(""); const [logDate, setLogDate] = useState("");
  const [logFilter, setLogFilter] = useState<ActionType | "all">("all");

  // ── Position helpers ───────────────────────────────────────────────────────
  const buildFromPlan = () => {
    const newPos: Position[] = [];
    for (const bucket of plan.buckets) {
      for (const inst of bucket.instruments) {
        newPos.push({
          instrument_id: inst.instrument_id, instrument_name: inst.name,
          asset_class: inst.asset_class, category: inst.category,
          bucket: bucket.bucket, goal_id: null, allocation_pct: inst.weight,
          max_allocation_pct: concentrationCap,
          lumpsum_amount: 0, monthly_sip: inst.suggested_sip,
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
  const addPosition = (p: Position) => {
    setPositions(prev => [...prev, p]); setSaved(false);
    // Immediately add "proposed" log entry locally
    const entry: LogEntry = {
      action_type: "proposed", instrument_name: p.instrument_name,
      new_status: "draft", proposed_lump: p.lumpsum_amount, proposed_sip: p.monthly_sip,
      allocation_pct: p.allocation_pct, description: "Position proposed",
      is_manual: false, created_at: new Date().toISOString(),
    };
    setActivityLog(prev => [entry, ...prev]);
  };
  const swapInstrument = (idx: number, u: UniverseRow) => {
    updatePosition(idx, { instrument_id: u.instrument_id, instrument_name: u.name ?? u.instrument_id, asset_class: u.asset_class ?? "", category: u.category, source: "manual" });
  };

  // ── Save portfolio + auto-log ──────────────────────────────────────────────
  const savePortfolio = async () => {
    setSaving(true);
    const now = new Date().toISOString();

    // Detect status changes and build auto-log entries
    const autoEntries: Omit<LogEntry, "log_id">[] = [];
    positions.forEach(pos => {
      const prevStatus = prevStatusRef.current.get(pos.instrument_id);
      if (prevStatus !== pos.status) {
        const actionMap: Record<Status, ActionType> = {
          draft: "proposed", pending: "proposed", placed: "placed", executed: "executed",
        };
        autoEntries.push({
          action_type: actionMap[pos.status] ?? "amended",
          instrument_name: pos.instrument_name,
          old_status: prevStatus ?? null, new_status: pos.status,
          proposed_lump: pos.lumpsum_amount, proposed_sip: pos.monthly_sip,
          executed_lump: pos.status === "executed" ? pos.executed_lumpsum : null,
          executed_sip: pos.status === "executed" ? pos.executed_sip : null,
          allocation_pct: pos.allocation_pct,
          description: prevStatus
            ? `Status changed from ${prevStatus} → ${pos.status}`
            : `Position set to ${pos.status}`,
          is_manual: false, created_at: now,
        });
      }
      prevStatusRef.current.set(pos.instrument_id, pos.status);
    });

    const rows = positions.map(({ id, ...p }) => ({ ...p, ...(id ? { id } : {}) }));
    await fetch("/api/clients/" + clientId + "/portfolio", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows),
    });

    if (autoEntries.length > 0) {
      await fetch("/api/clients/" + clientId + "/activity", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(autoEntries),
      });
      setActivityLog(prev => [...autoEntries.map(e => e as LogEntry), ...prev]);
    }

    setSaving(false); setSaved(true); startTransition(() => router.refresh());
  };

  // ── Holdings helpers ───────────────────────────────────────────────────────
  const updateHolding = (idx: number, updates: Partial<Holding>) => { setHoldings(prev => prev.map((h, i) => i === idx ? { ...h, ...updates } : h)); setSavedH(false); };
  const removeHolding = (idx: number) => { setHoldings(prev => prev.filter((_, i) => i !== idx)); setSavedH(false); };
  const addHolding = (h: Holding) => { setHoldings(prev => [...prev, h]); setSavedH(false); };
  const saveHoldings = async () => {
    setSavingH(true);
    const rows = holdings.map(({ holding_id, ...h }) => ({ ...h, ...(holding_id ? { holding_id } : {}) }));
    await fetch("/api/clients/" + clientId + "/holdings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows),
    });
    setSavingH(false); setSavedH(true); startTransition(() => router.refresh());
  };

  // ── Manual log entry ───────────────────────────────────────────────────────
  const addManualLog = async () => {
    if (!logDesc.trim()) return;
    const entry: LogEntry = {
      action_type: logType, description: logDesc.trim(),
      is_manual: true, created_at: logDate ? new Date(logDate).toISOString() : new Date().toISOString(),
    };
    await fetch("/api/clients/" + clientId + "/activity", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([entry]),
    });
    setActivityLog(prev => [entry, ...prev]);
    setLogDesc(""); setLogDate("");
  };

  // ── Concentration warnings ─────────────────────────────────────────────────
  const breaches = positions.filter(p => {
    const cap = p.max_allocation_pct ?? concentrationCap;
    return p.allocation_pct > cap;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalLumpsum = positions.reduce((s, p) => s + p.lumpsum_amount, 0);
  const totalSIP     = positions.reduce((s, p) => s + p.monthly_sip, 0);
  const totalAllocPct = positions.reduce((s, p) => s + p.allocation_pct, 0);
  const executedPos  = positions.filter(p => p.status === "executed");
  const totalExLump  = executedPos.reduce((s, p) => s + p.executed_lumpsum, 0);
  const totalExSIP   = executedPos.reduce((s, p) => s + p.executed_sip, 0);
  const totalCVPos   = executedPos.reduce((s, p) => s + (p.current_value ?? 0), 0);
  const totalCVHold  = holdings.reduce((s, h) => s + (h.current_value ?? 0), 0);
  const statusCounts = positions.reduce((acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const byBucket = ["short","medium","long","blend"].map(b => ({
    bucket: b, positions: positions.filter(p => p.bucket === b),
  })).filter(b => b.positions.length > 0);
  const swapPos = swapTarget !== null ? positions[swapTarget] : null;
  const filteredLog = logFilter === "all" ? activityLog : activityLog.filter(e => e.action_type === logFilter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F3A46]">Portfolio Construction</h1>
          <p className="text-xs text-[#6B7E86] mt-0.5">
            {clientName} · Profile: <span className="font-medium text-[#0F3A46]">{plan.profile}</span>
            {" · "}Global cap: <span className="font-medium text-[#0F3A46]">{concentrationCap}%</span>
          </p>
        </div>
        {mainTab === "construction" && (
          <div className="flex gap-2">
            <button onClick={buildFromPlan} className="px-3 py-1.5 text-xs border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">Build from allocation plan</button>
            <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-xs border border-[#CBD9DC] text-[#0F3A46] rounded-lg hover:bg-[#F5F9FA]">+ Add position</button>
            <button onClick={savePortfolio} disabled={saving} className="px-4 py-1.5 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
              {saving ? "Saving..." : saved ? "✓ Saved" : "Save plan"}
            </button>
          </div>
        )}
        {mainTab === "live" && (
          <div className="flex gap-2">
            <button onClick={() => setShowAddHolding(true)} className="px-3 py-1.5 text-xs border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">+ Add existing investment</button>
            <button onClick={saveHoldings} disabled={savingH} className="px-4 py-1.5 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
              {savingH ? "Saving..." : savedH ? "✓ Saved" : "Save holdings"}
            </button>
          </div>
        )}
      </div>

      {/* Concentration breach alert */}
      {breaches.length > 0 && (
        <div className="bg-[#FDF5F5] border border-[#E8C0C0] rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-[#7A2020]">Concentration cap breached on {breaches.length} position{breaches.length > 1 ? "s" : ""}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {breaches.map((p, i) => (
                <span key={i} className="text-xs text-[#B4463C]">
                  {p.instrument_name} — {p.allocation_pct}% {">"} cap {p.max_allocation_pct ?? concentrationCap}%
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[#CBD9DC] flex gap-1">
        {([["construction","Construction Plan"],["live","Live Portfolio"],["log","Activity Log"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMainTab(id)}
            className={"px-5 py-2 text-sm font-medium border-b-2 transition-colors " + (mainTab === id ? "border-[#0F3A46] text-[#0F3A46]" : "border-transparent text-[#6B7E86] hover:text-[#0F3A46]")}>
            {label}
            {id === "log" && activityLog.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#0F3A46] text-white rounded-full px-1.5 py-0.5">{activityLog.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── CONSTRUCTION TAB ───────────────────────────────────────────────── */}
      {mainTab === "construction" && (
        <>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Positions",    value: String(positions.length),        sub: "total" },
              { label: "Proposed lump",value: fmt(totalLumpsum),               sub: "one-time" },
              { label: "Proposed SIP", value: fmtMo(totalSIP),                 sub: "recurring" },
              { label: "Plan SIP",     value: fmtMo(plan.totalMonthlySIP),     sub: "engine target" },
              { label: "Alloc total",  value: totalAllocPct.toFixed(0) + "%",
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

          {positions.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {(["draft","pending","placed","executed"] as Status[]).map(s => {
                const count = statusCounts[s] ?? 0; if (count === 0) return null;
                const st = STATUS_STYLES[s];
                return <span key={s} className={"text-xs px-2.5 py-1 rounded-full border font-medium " + st.bg + " " + st.text + " " + st.border}>{count} {st.label}</span>;
              })}
              {breaches.length > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full border font-medium bg-[#FDF5F5] text-[#B4463C] border-[#E8C0C0]">
                  {breaches.length} cap breach{breaches.length > 1 ? "es" : ""}
                </span>
              )}
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
                    <th className="text-right px-2 py-2 font-medium">Alloc / Cap</th>
                    <th className="text-right px-2 py-2 font-medium">Prop. lump</th>
                    <th className="text-right px-2 py-2 font-medium">Prop. SIP</th>
                    <th className="text-right px-2 py-2 font-medium">Exec. lump</th>
                    <th className="text-right px-2 py-2 font-medium">Exec. SIP</th>
                    <th className="text-right px-2 py-2 font-medium">Curr. value</th>
                    <th className="text-center px-2 py-2 font-medium">Status</th>
                    <th className="text-right px-2 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bPos.map((pos) => {
                    const globalIdx = positions.indexOf(pos);
                    const st = STATUS_STYLES[pos.status];
                    const isExecuted = pos.status === "executed";
                    const cap = pos.max_allocation_pct ?? concentrationCap;
                    const overCap = pos.allocation_pct > cap;
                    return (
                      <tr key={pos.instrument_id + globalIdx} className={"border-b border-[#E7EFEF] hover:bg-[#FAFCFC] " + (isExecuted ? "bg-[#F4FAF6]" : "") + (overCap ? " bg-[#FDF9F9]" : "")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AC_COLOR[pos.asset_class] ?? "#999" }} />
                            <span className="font-medium text-[#0F3A46] truncate max-w-[130px] text-xs">{pos.instrument_name}</span>
                            {pos.source === "engine" && <span className="text-[9px] px-1 py-0.5 rounded-full bg-[#EBF3F5] text-[#1A4D6A] border border-[#BDD4DB] font-medium">eng</span>}
                          </div>
                          {pos.goal_id && <div className="text-[10px] text-[#175A69] ml-3.5">{goals.find(g => g.goal_id === pos.goal_id)?.goal_name}</div>}
                        </td>
                        {/* Allocation + cap */}
                        <td className="px-2 py-2.5 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <input type="number" min={0} max={100} value={pos.allocation_pct}
                              onChange={e => updatePosition(globalIdx, { allocation_pct: Number(e.target.value) })}
                              className={"w-10 text-right border rounded px-1 py-0.5 text-xs focus:outline-none " + (overCap ? "border-[#B4463C] bg-[#FDF5F5]" : "border-[#E7EFEF] focus:border-[#175A69]")} />
                            <span className="text-[#6B7E86] text-xs">%</span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 justify-end">
                            <span className="text-[9px] text-[#6B7E86]">cap</span>
                            <input type="number" min={0} max={100} value={pos.max_allocation_pct ?? concentrationCap}
                              onChange={e => updatePosition(globalIdx, { max_allocation_pct: Number(e.target.value) })}
                              className="w-8 text-right border border-[#E7EFEF] rounded px-0.5 py-0 text-[9px] text-[#6B7E86] focus:outline-none focus:border-[#175A69]" />
                            <span className="text-[9px] text-[#6B7E86]">%</span>
                          </div>
                          <CapBar alloc={pos.allocation_pct} cap={pos.max_allocation_pct ?? concentrationCap} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <input type="number" min={0} value={pos.lumpsum_amount} onChange={e => updatePosition(globalIdx, { lumpsum_amount: Number(e.target.value) })}
                            className="w-20 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <input type="number" min={0} value={pos.monthly_sip} onChange={e => updatePosition(globalIdx, { monthly_sip: Number(e.target.value) })}
                            className="w-20 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <input type="number" min={0} value={pos.executed_lumpsum} onChange={e => updatePosition(globalIdx, { executed_lumpsum: Number(e.target.value) })}
                            className={"w-20 text-right border rounded px-1 py-0.5 text-xs focus:outline-none " + (isExecuted ? "border-[#2E7D5B] bg-[#F0FAF4]" : "border-[#E7EFEF] focus:border-[#175A69]")} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <input type="number" min={0} value={pos.executed_sip} onChange={e => updatePosition(globalIdx, { executed_sip: Number(e.target.value) })}
                            className={"w-20 text-right border rounded px-1 py-0.5 text-xs focus:outline-none " + (isExecuted ? "border-[#2E7D5B] bg-[#F0FAF4]" : "border-[#E7EFEF] focus:border-[#175A69]")} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <input type="number" min={0} value={pos.current_value ?? ""} onChange={e => updatePosition(globalIdx, { current_value: e.target.value ? Number(e.target.value) : null })}
                            placeholder="—" className={"w-20 text-right border rounded px-1 py-0.5 text-xs focus:outline-none " + (isExecuted ? "border-[#2E7D5B] bg-[#F0FAF4]" : "border-[#E7EFEF] focus:border-[#175A69]")} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <select value={pos.status}
                            onChange={e => {
                              const s = e.target.value as Status;
                              updatePosition(globalIdx, { status: s, executed_at: s === "executed" ? new Date().toISOString() : pos.executed_at });
                            }}
                            className={"text-[10px] px-1.5 py-1 rounded-full border font-medium focus:outline-none " + st.bg + " " + st.text + " " + st.border}>
                            <option value="draft">Draft</option><option value="pending">Pending</option>
                            <option value="placed">Placed</option><option value="executed">Executed</option>
                          </select>
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setSwapTarget(globalIdx)} className="text-[10px] text-[#175A69] hover:underline">Swap</button>
                            <button onClick={() => removePosition(globalIdx)} className="text-[10px] text-[#B4463C] hover:underline">✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

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

      {/* ── LIVE PORTFOLIO TAB ─────────────────────────────────────────────── */}
      {mainTab === "live" && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Executed positions", value: String(executedPos.length), sub: "from plan" },
              { label: "Executed lump sum",  value: fmt(totalExLump),            sub: "actual invested" },
              { label: "Executed SIP",       value: fmtMo(totalExSIP),           sub: "actual monthly" },
              { label: "Total portfolio",    value: fmt(totalCVPos + totalCVHold),sub: "current value", green: (totalCVPos + totalCVHold) > 0 },
            ].map(c => (
              <div key={c.label} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
                <div className="text-xs text-[#6B7E86] mb-1">{c.label}</div>
                <div className={"text-lg font-semibold " + (c.green ? "text-[#2E7D5B]" : "text-[#0F3A46]")}>{c.value}</div>
                <div className="text-[10px] text-[#6B7E86] mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Executed positions */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E7EFEF] bg-[#F5F9FA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#0F3A46]">Executed from plan</h2>
                <p className="text-xs text-[#6B7E86] mt-0.5">Proposed vs actual — edit executed & current value</p>
              </div>
              <span className="text-xs px-2 py-0.5 bg-[#E8F4EE] text-[#1A5C3A] border border-[#2E7D5B] rounded-full font-medium">{executedPos.length} executed</span>
            </div>
            {executedPos.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#6B7E86]">No positions marked executed yet. Change status in Construction Plan tab.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] border-b border-[#E7EFEF] bg-[#FAFCFC]">
                    <th className="text-left px-4 py-2 font-medium">Instrument</th>
                    <th className="text-right px-4 py-2 font-medium">Prop. lump</th>
                    <th className="text-right px-4 py-2 font-medium">Exec. lump</th>
                    <th className="text-right px-4 py-2 font-medium">Prop. SIP</th>
                    <th className="text-right px-4 py-2 font-medium">Exec. SIP</th>
                    <th className="text-right px-4 py-2 font-medium">Current value</th>
                    <th className="text-right px-4 py-2 font-medium">G / L</th>
                  </tr>
                </thead>
                <tbody>
                  {executedPos.map((pos, i) => {
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
                          <div className="text-[10px] text-[#6B7E86] ml-3.5">{pos.bucket} · {pos.asset_class}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[#6B7E86]">{fmt(pos.lumpsum_amount)}</td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={pos.executed_lumpsum} onChange={e => updatePosition(globalIdx, { executed_lumpsum: Number(e.target.value) })}
                            className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[#6B7E86]">{fmtMo(pos.monthly_sip)}</td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={pos.executed_sip} onChange={e => updatePosition(globalIdx, { executed_sip: Number(e.target.value) })}
                            className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={pos.current_value ?? ""} onChange={e => updatePosition(globalIdx, { current_value: e.target.value ? Number(e.target.value) : null })}
                            placeholder="Enter value" className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
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
                    <td className="px-4 py-2 text-xs font-semibold text-[#0F3A46]">Total</td>
                    <td className="px-4 py-2 text-right text-xs text-[#6B7E86]">{fmt(executedPos.reduce((s,p) => s + p.lumpsum_amount, 0))}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmt(totalExLump)}</td>
                    <td className="px-4 py-2 text-right text-xs text-[#6B7E86]">{fmtMo(executedPos.reduce((s,p) => s + p.monthly_sip, 0))}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmtMo(totalExSIP)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#2E7D5B]">{totalCVPos > 0 ? fmt(totalCVPos) : "—"}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold">
                      {totalCVPos > 0 && totalExLump > 0 ? <span className={(totalCVPos - totalExLump) >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]"}>{(totalCVPos - totalExLump) >= 0 ? "+" : ""}{fmt(totalCVPos - totalExLump)}</span> : "—"}
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
              <button onClick={() => setShowAddHolding(true)} className="text-xs px-3 py-1 border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">+ Add</button>
            </div>
            {holdings.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#6B7E86]">No existing investments recorded.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#6B7E86] border-b border-[#E7EFEF] bg-[#FAFCFC]">
                    <th className="text-left px-4 py-2 font-medium">Investment</th>
                    <th className="text-left px-4 py-2 font-medium">Bucket</th>
                    <th className="text-right px-4 py-2 font-medium">Invested</th>
                    <th className="text-right px-4 py-2 font-medium">SIP/mo</th>
                    <th className="text-right px-4 py-2 font-medium">Current value</th>
                    <th className="text-right px-4 py-2 font-medium">G / L</th>
                    <th className="text-right px-4 py-2 font-medium"></th>
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
                        <td className="px-4 py-3">
                          <select value={h.bucket} onChange={e => updateHolding(i, { bucket: e.target.value })} className="text-xs border border-[#E7EFEF] rounded px-1 py-0.5 focus:outline-none text-[#0F3A46]">
                            <option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={h.lumpsum_invested} onChange={e => updateHolding(i, { lumpsum_invested: Number(e.target.value) })} className="w-24 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={h.monthly_sip} onChange={e => updateHolding(i, { monthly_sip: Number(e.target.value) })} className="w-20 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#175A69]" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" min={0} value={h.current_value ?? ""} onChange={e => updateHolding(i, { current_value: e.target.value ? Number(e.target.value) : null, value_updated_at: new Date().toISOString() })} placeholder="Enter value" className="w-24 text-right border border-[#2E7D5B] bg-[#F0FAF4] rounded px-1 py-0.5 text-xs focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {gl != null ? (
                            <div className={"text-xs font-semibold " + (gl >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]")}>
                              {gl >= 0 ? "+" : ""}{fmt(gl)}{glPct && <div className="text-[10px] font-normal">{gl >= 0 ? "+" : ""}{glPct}%</div>}
                            </div>
                          ) : <span className="text-xs text-[#6B7E86]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right"><button onClick={() => removeHolding(i)} className="text-[10px] text-[#B4463C] hover:underline">Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#CBD9DC] bg-[#F5F9FA]">
                    <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-[#0F3A46]">Total</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmt(holdings.reduce((s,h) => s + h.lumpsum_invested, 0))}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmtMo(holdings.reduce((s,h) => s + h.monthly_sip, 0))}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-[#2E7D5B]">{totalCVHold > 0 ? fmt(totalCVHold) : "—"}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold" colSpan={2}>
                      {totalCVHold > 0 ? <span className={(totalCVHold - holdings.reduce((s,h) => s + h.lumpsum_invested, 0)) >= 0 ? "text-[#2E7D5B]" : "text-[#B4463C]"}>{fmt(totalCVHold - holdings.reduce((s,h) => s + h.lumpsum_invested, 0))}</span> : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {(executedPos.length > 0 || holdings.length > 0) && (
            <div className="flex justify-end">
              <button onClick={async () => { await savePortfolio(); await saveHoldings(); }} disabled={saving || savingH}
                className="px-5 py-2 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
                {saving || savingH ? "Saving..." : "Save all changes"}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── ACTIVITY LOG TAB ───────────────────────────────────────────────── */}
      {mainTab === "log" && (
        <div className="space-y-4">
          {/* Manual entry form */}
          <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#0F3A46] mb-3">Add manual entry</h2>
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Type</label>
                <select value={logType} onChange={e => setLogType(e.target.value as ActionType)}
                  className="border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69] text-[#0F3A46]">
                  {(["note","communication","review","rebalance","amended"] as ActionType[]).map(t => (
                    <option key={t} value={t}>{ACTION_STYLES[t].icon} {ACTION_STYLES[t].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Description</label>
                <input value={logDesc} onChange={e => setLogDesc(e.target.value)} placeholder="Describe the action, communication, or note..."
                  onKeyDown={e => { if (e.key === "Enter" && logDesc.trim()) addManualLog(); }}
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Date (optional)</label>
                <input type="datetime-local" value={logDate} onChange={e => setLogDate(e.target.value)}
                  className="border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
              </div>
              <button onClick={addManualLog} disabled={!logDesc.trim()}
                className="px-4 py-2 bg-[#0F3A46] text-white text-sm rounded-lg hover:bg-[#175A69] disabled:opacity-50 shrink-0">
                Add entry
              </button>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-1.5 flex-wrap">
            {([["all","All",activityLog.length]] as [string, string, number][]).concat(
              (["proposed","placed","executed","amended","note","communication","review","rebalance"] as ActionType[])
                .map(t => [t, ACTION_STYLES[t].label, activityLog.filter(e => e.action_type === t).length] as [string, string, number])
                .filter(([,,c]) => c > 0)
            ).map(([val, label, count]) => (
              <button key={val} onClick={() => setLogFilter(val as ActionType | "all")}
                className={"text-xs px-3 py-1 rounded-full border font-medium transition-colors " + (logFilter === val ? "bg-[#0F3A46] text-white border-[#0F3A46]" : "bg-white text-[#6B7E86] border-[#CBD9DC] hover:border-[#0F3A46]")}>
                {val !== "all" && ACTION_STYLES[val as ActionType]?.icon + " "}{label} {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            ))}
          </div>

          {/* Timeline */}
          {filteredLog.length === 0 ? (
            <div className="bg-white border border-dashed border-[#CBD9DC] rounded-xl p-10 text-center text-sm text-[#6B7E86]">
              No activity recorded yet. Save a position or add a manual entry above.
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[#E7EFEF]" />
              <div className="space-y-3">
                {filteredLog.map((entry, i) => {
                  const ast = ACTION_STYLES[entry.action_type] ?? ACTION_STYLES["note"];
                  const d = new Date(entry.created_at);
                  const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                  const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={entry.log_id ?? i} className="flex gap-3 relative">
                      <div className={"w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-sm shrink-0 shadow-sm z-10 " + ast.bg}>
                        {ast.icon}
                      </div>
                      <div className="flex-1 bg-white border border-[#E7EFEF] rounded-xl p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + ast.bg + " " + ast.text}>{ast.label}</span>
                            {entry.instrument_name && <span className="text-xs font-semibold text-[#0F3A46]">{entry.instrument_name}</span>}
                            {entry.is_manual && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F5F9FA] text-[#6B7E86] border border-[#CBD9DC]">manual</span>}
                          </div>
                          <div className="text-[10px] text-[#6B7E86] shrink-0 text-right">
                            <div>{dateStr}</div><div>{timeStr}</div>
                          </div>
                        </div>
                        {entry.description && <p className="text-sm text-[#0F3A46] mt-2">{entry.description}</p>}
                        {(entry.old_status || entry.new_status) && (
                          <div className="flex items-center gap-2 mt-2">
                            {entry.old_status && (
                              <span className={"text-[10px] px-1.5 py-0.5 rounded-full border font-medium " + (STATUS_STYLES[entry.old_status as Status] ? STATUS_STYLES[entry.old_status as Status].bg + " " + STATUS_STYLES[entry.old_status as Status].text + " " + STATUS_STYLES[entry.old_status as Status].border : "bg-[#F5F9FA] text-[#6B7E86] border-[#CBD9DC]")}>
                                {entry.old_status}
                              </span>
                            )}
                            {entry.old_status && entry.new_status && <span className="text-[10px] text-[#6B7E86]">→</span>}
                            {entry.new_status && (
                              <span className={"text-[10px] px-1.5 py-0.5 rounded-full border font-medium " + (STATUS_STYLES[entry.new_status as Status] ? STATUS_STYLES[entry.new_status as Status].bg + " " + STATUS_STYLES[entry.new_status as Status].text + " " + STATUS_STYLES[entry.new_status as Status].border : "bg-[#F5F9FA] text-[#6B7E86] border-[#CBD9DC]")}>
                                {entry.new_status}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex gap-4 mt-2 flex-wrap">
                          {entry.proposed_lump != null && entry.proposed_lump > 0 && <span className="text-[10px] text-[#6B7E86]">Prop. lump: <strong>{fmt(entry.proposed_lump)}</strong></span>}
                          {entry.proposed_sip != null && entry.proposed_sip > 0 && <span className="text-[10px] text-[#6B7E86]">Prop. SIP: <strong>{fmtMo(entry.proposed_sip)}</strong></span>}
                          {entry.executed_lump != null && entry.executed_lump > 0 && <span className="text-[10px] text-[#2E7D5B]">Exec. lump: <strong>{fmt(entry.executed_lump)}</strong></span>}
                          {entry.executed_sip != null && entry.executed_sip > 0 && <span className="text-[10px] text-[#2E7D5B]">Exec. SIP: <strong>{fmtMo(entry.executed_sip)}</strong></span>}
                          {entry.allocation_pct != null && <span className="text-[10px] text-[#6B7E86]">Alloc: <strong>{entry.allocation_pct}%</strong></span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAdd && <AddPositionModal universe={universe} goals={goals} defaultCap={concentrationCap} onAdd={addPosition} onClose={() => setShowAdd(false)} />}
      {showAddHolding && <AddHoldingModal universe={universe} onAdd={addHolding} onClose={() => setShowAddHolding(false)} />}
      {swapTarget !== null && swapPos && (
        <SwapModal universe={universe} currentId={swapPos.instrument_id} assetClass={swapPos.asset_class}
          onSwap={u => swapInstrument(swapTarget, u)} onClose={() => setSwapTarget(null)} />
      )}
    </div>
  );
}
