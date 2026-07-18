"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AllocationPlan, UniverseRow, GoalInput, InstrumentPick } from "@/lib/allocationEngine";
import { scoreInstrument } from "@/lib/allocationEngine";

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "draft" | "pending" | "placed" | "executed";

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
  status: Status;
  notes: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  draft:    { label: "Draft",    bg: "bg-[#F5F9FA]",   text: "text-[#6B7E86]", border: "border-[#CBD9DC]" },
  pending:  { label: "Pending",  bg: "bg-[#FEF9E7]",   text: "text-[#7D6B2E]", border: "border-[#E8C840]" },
  placed:   { label: "Placed",   bg: "bg-[#EAF3F8]",   text: "text-[#1A4D6A]", border: "border-[#2C7DA0]" },
  executed: { label: "Executed", bg: "bg-[#E8F4EE]",   text: "text-[#1A5C3A]", border: "border-[#2E7D5B]" },
};

const AC_COLOR: Record<string, string> = {
  Equity: "#175A69", Debt: "#C39A38", Gold: "#B8860B",
  International: "#4A90C4", Hybrid: "#7B5EA7", Alternate: "#B4463C",
};

const BUCKET_LABEL: Record<string, string> = {
  short: "Short-term", medium: "Medium-term", long: "Long-term", blend: "Blend",
};

function fmt(n: number) {
  if (n >= 10_000_000) return "Rs." + (n / 10_000_000).toFixed(2) + " Cr";
  if (n >= 100_000)    return "Rs." + (n / 100_000).toFixed(2) + " L";
  return "Rs." + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ── Add Position Modal ────────────────────────────────────────────────────────
function AddPositionModal({
  universe, goals, onAdd, onClose,
}: {
  universe: UniverseRow[];
  goals: GoalInput[];
  onAdd: (p: Position) => void;
  onClose: () => void;
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
      instrument_id: selected.instrument_id,
      instrument_name: selected.name ?? selected.instrument_id,
      asset_class: selected.asset_class ?? "",
      category: selected.category,
      bucket,
      goal_id: goalId || null,
      allocation_pct: allocPct,
      lumpsum_amount: lumpsum,
      monthly_sip: sip,
      status: "draft",
      notes: "",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-[#E7EFEF] flex items-center justify-between">
          <h3 className="font-semibold text-[#0F3A46]">Add Position</h3>
          <button onClick={onClose} className="text-[#6B7E86] hover:text-[#0F3A46] text-xl">x</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Instrument search */}
          <div>
            <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Instrument</label>
            <input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }}
              placeholder="Search by name or asset class..."
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]" />
            {search && !selected && (
              <div className="mt-1 border border-[#CBD9DC] rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {filtered.slice(0, 8).map(u => (
                  <button key={u.instrument_id} onClick={() => { setSelected(u); setSearch(u.name ?? u.instrument_id); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#F0F5F6] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AC_COLOR[u.asset_class ?? ""] ?? "#999" }} />
                    <span className="flex-1 text-[#0F3A46] truncate">{u.name ?? u.instrument_id}</span>
                    <span className="text-[10px] text-[#6B7E86] shrink-0">{u.asset_class}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-2 text-sm text-[#6B7E86]">No instruments found</p>}
              </div>
            )}
            {selected && (
              <div className="mt-1 bg-[#F0F5F6] rounded-lg px-3 py-2 text-xs text-[#0F3A46] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[selected.asset_class ?? ""] ?? "#999" }} />
                <span className="font-medium">{selected.asset_class}</span>
                {selected.category && <span className="text-[#6B7E86]">· {selected.category}</span>}
                {selected.return_5y != null && <span className="text-[#2E7D5B] ml-auto">{selected.return_5y}% 5Y</span>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Bucket */}
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Bucket</label>
              <select value={bucket} onChange={e => setBucket(e.target.value)}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]">
                <option value="short">Short-term</option>
                <option value="medium">Medium-term</option>
                <option value="long">Long-term</option>
                <option value="blend">Blend</option>
              </select>
            </div>
            {/* Goal */}
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Goal (optional)</label>
              <select value={goalId} onChange={e => setGoalId(e.target.value)}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]">
                <option value="">— none —</option>
                {goals.map(g => (
                  <option key={g.goal_id} value={g.goal_id}>{g.goal_name ?? "Goal"}</option>
                ))}
              </select>
            </div>
            {/* Lump sum */}
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Lump sum (Rs.)</label>
              <input type="number" min={0} value={lumpsum} onChange={e => setLumpsum(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]" />
            </div>
            {/* SIP */}
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Monthly SIP (Rs.)</label>
              <input type="number" min={0} value={sip} onChange={e => setSip(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]" />
            </div>
            {/* Alloc % */}
            <div>
              <label className="text-xs font-medium text-[#0F3A46] mb-1 block">Allocation %</label>
              <input type="number" min={0} max={100} value={allocPct} onChange={e => setAllocPct(Number(e.target.value))}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E7EFEF] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-[#CBD9DC] rounded-lg text-[#6B7E86] hover:bg-[#F5F9FA]">Cancel</button>
          <button onClick={submit} disabled={!selected}
            className="px-4 py-2 text-sm bg-[#0F3A46] text-white rounded-lg hover:bg-[#175A69] disabled:opacity-50">
            Add position
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PortfolioClient({
  clientId, clientName, plan, universe, goals, existingPositions,
}: {
  clientId: string;
  clientName: string;
  plan: AllocationPlan;
  universe: UniverseRow[];
  goals: GoalInput[];
  existingPositions: Record<string, unknown>[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Initialise positions from DB or empty
  const initPositions = (): Position[] =>
    existingPositions.map(p => ({
      id: p.id as string,
      instrument_id: p.instrument_id as string,
      instrument_name: p.instrument_name as string ?? "",
      asset_class: p.asset_class as string ?? "",
      category: p.category as string | null,
      bucket: p.bucket as string ?? "long",
      goal_id: p.goal_id as string | null,
      allocation_pct: Number(p.allocation_pct ?? 0),
      lumpsum_amount: Number(p.lumpsum_amount ?? 0),
      monthly_sip: Number(p.monthly_sip ?? 0),
      status: (p.status as Status) ?? "draft",
      notes: p.notes as string ?? "",
    }));

  const [positions, setPositions] = useState<Position[]>(initPositions);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);

  // Build positions from allocation plan
  const buildFromPlan = () => {
    const newPositions: Position[] = [];
    for (const bucket of plan.buckets) {
      for (const inst of bucket.instruments) {
        newPositions.push({
          instrument_id: inst.instrument_id,
          instrument_name: inst.name,
          asset_class: inst.asset_class,
          category: inst.category,
          bucket: bucket.bucket,
          goal_id: null,
          allocation_pct: inst.weight,
          lumpsum_amount: 0,
          monthly_sip: inst.suggested_sip,
          status: "draft",
          notes: "",
        });
      }
    }
    setPositions(newPositions);
    setSaved(false);
  };

  const updatePosition = (idx: number, updates: Partial<Position>) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, ...updates } : p));
    setSaved(false);
  };

  const removePosition = (idx: number) => {
    setPositions(prev => prev.filter((_, i) => i !== idx));
    setSaved(false);
  };

  const addPosition = (p: Position) => {
    setPositions(prev => [...prev, p]);
    setSaved(false);
  };

  const savePortfolio = async () => {
    setSaving(true);
    const rows = positions.map(({ id, ...p }) => ({
      ...p,
      ...(id ? { id } : {}),
    }));
    await fetch(`/api/clients/${clientId}/portfolio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    });
    setSaving(false);
    setSaved(true);
    startTransition(() => router.refresh());
  };

  // Summary stats
  const totalLumpsum = positions.reduce((s, p) => s + p.lumpsum_amount, 0);
  const totalSIP = positions.reduce((s, p) => s + p.monthly_sip, 0);
  const totalAllocPct = positions.reduce((s, p) => s + p.allocation_pct, 0);
  const statusCounts = positions.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const byBucket = ["short", "medium", "long", "blend"].map(b => ({
    bucket: b,
    positions: positions.filter(p => p.bucket === b),
    totalSIP: positions.filter(p => p.bucket === b).reduce((s, p) => s + p.monthly_sip, 0),
    totalLump: positions.filter(p => p.bucket === b).reduce((s, p) => s + p.lumpsum_amount, 0),
  })).filter(b => b.positions.length > 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F3A46]">Portfolio Construction</h1>
          <p className="text-xs text-[#6B7E86] mt-0.5">
            {clientName} · Profile: <span className="font-medium text-[#0F3A46]">{plan.profile}</span>
            {positions.length > 0 && ` · ${positions.length} position${positions.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={buildFromPlan}
            className="px-3 py-1.5 text-xs border border-[#175A69] text-[#175A69] rounded-lg hover:bg-[#DDE6E8]">
            Build from allocation plan
          </button>
          <button onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 text-xs border border-[#CBD9DC] text-[#0F3A46] rounded-lg hover:bg-[#F5F9FA]">
            + Add position
          </button>
          <button onClick={savePortfolio} disabled={saving}
            className="px-4 py-1.5 bg-[#0F3A46] text-white text-sm font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50">
            {saving ? "Saving..." : saved ? "✓ Saved" : "Save portfolio"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Positions", value: String(positions.length), sub: "total instruments" },
          { label: "Total lump sum", value: fmt(totalLumpsum), sub: "one-time investment" },
          { label: "Total monthly SIP", value: fmt(totalSIP) + "/mo", sub: "recurring" },
          { label: "Plan SIP", value: fmt(plan.totalMonthlySIP) + "/mo", sub: "from allocation engine" },
          { label: "Allocation total", value: totalAllocPct.toFixed(0) + "%", sub: totalAllocPct === 100 ? "balanced ✓" : "adjust to 100%", red: totalAllocPct !== 100 && positions.length > 0 },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">{c.label}</div>
            <div className={"text-base font-semibold " + (c.red ? "text-[#B4463C]" : "text-[#0F3A46]")}>{c.value}</div>
            <div className="text-[10px] text-[#6B7E86] mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Status summary row */}
      {positions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["draft", "pending", "placed", "executed"] as Status[]).map(s => {
            const count = statusCounts[s] ?? 0;
            if (count === 0) return null;
            const st = STATUS_STYLES[s];
            return (
              <span key={s} className={"text-xs px-2.5 py-1 rounded-full border font-medium " + st.bg + " " + st.text + " " + st.border}>
                {count} {st.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {positions.length === 0 && (
        <div className="bg-white border border-dashed border-[#CBD9DC] rounded-xl p-10 text-center">
          <p className="text-sm text-[#6B7E86] mb-4">No positions yet. Build from the allocation plan or add manually.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={buildFromPlan}
              className="px-4 py-2 text-sm bg-[#0F3A46] text-white rounded-lg hover:bg-[#175A69]">
              Build from allocation plan
            </button>
            <button onClick={() => setShowAdd(true)}
              className="px-4 py-2 text-sm border border-[#CBD9DC] text-[#0F3A46] rounded-lg hover:bg-[#F5F9FA]">
              Add manually
            </button>
          </div>
        </div>
      )}

      {/* Positions by bucket */}
      {byBucket.map(({ bucket, positions: bPos, totalSIP: bSIP, totalLump: bLump }) => (
        <div key={bucket} className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E7EFEF] flex items-center justify-between bg-[#F5F9FA]">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-[#0F3A46]">{BUCKET_LABEL[bucket] ?? bucket}</h2>
              <span className="text-xs text-[#6B7E86]">{bPos.length} position{bPos.length > 1 ? "s" : ""}</span>
            </div>
            <div className="flex gap-4 text-xs text-[#6B7E86]">
              {bLump > 0 && <span>Lump sum: <strong className="text-[#0F3A46]">{fmt(bLump)}</strong></span>}
              <span>SIP: <strong className="text-[#0F3A46]">{fmt(bSIP)}/mo</strong></span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[#6B7E86] border-b border-[#E7EFEF]">
                <th className="text-left px-4 py-2 font-medium">Instrument</th>
                <th className="text-left px-4 py-2 font-medium">Asset class</th>
                <th className="text-right px-4 py-2 font-medium">Alloc %</th>
                <th className="text-right px-4 py-2 font-medium">Lump sum</th>
                <th className="text-right px-4 py-2 font-medium">SIP/mo</th>
                <th className="text-center px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bPos.map((pos) => {
                const globalIdx = positions.indexOf(pos);
                const st = STATUS_STYLES[pos.status];
                return (
                  <tr key={pos.instrument_id + globalIdx} className="border-b border-[#E7EFEF] hover:bg-[#FAFCFC]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#0F3A46]">{pos.instrument_name}</div>
                      {pos.category && <div className="text-[10px] text-[#6B7E86]">{pos.category}</div>}
                      {pos.goal_id && (
                        <div className="text-[10px] text-[#175A69]">
                          Goal: {goals.find(g => g.goal_id === pos.goal_id)?.goal_name ?? pos.goal_id}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AC_COLOR[pos.asset_class] ?? "#999" }} />
                        {pos.asset_class}
                      </span>
                    </td>
                    {/* Editable allocation % */}
                    <td className="px-4 py-3 text-right">
                      <input type="number" min={0} max={100} value={pos.allocation_pct}
                        onChange={e => updatePosition(globalIdx, { allocation_pct: Number(e.target.value) })}
                        className="w-14 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]" />
                      <span className="text-[#6B7E86] ml-0.5">%</span>
                    </td>
                    {/* Editable lump sum */}
                    <td className="px-4 py-3 text-right">
                      <input type="number" min={0} value={pos.lumpsum_amount}
                        onChange={e => updatePosition(globalIdx, { lumpsum_amount: Number(e.target.value) })}
                        className="w-24 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]" />
                    </td>
                    {/* Editable SIP */}
                    <td className="px-4 py-3 text-right">
                      <input type="number" min={0} value={pos.monthly_sip}
                        onChange={e => updatePosition(globalIdx, { monthly_sip: Number(e.target.value) })}
                        className="w-24 text-right border border-[#E7EFEF] rounded px-1 py-0.5 text-sm text-[#0F3A46] focus:outline-none focus:border-[#175A69]" />
                    </td>
                    {/* Status dropdown */}
                    <td className="px-4 py-3 text-center">
                      <select value={pos.status}
                        onChange={e => updatePosition(globalIdx, { status: e.target.value as Status })}
                        className={"text-xs px-2 py-1 rounded-full border font-medium focus:outline-none " + st.bg + " " + st.text + " " + st.border}>
                        <option value="draft">Draft</option>
                        <option value="pending">Pending</option>
                        <option value="placed">Placed</option>
                        <option value="executed">Executed</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removePosition(globalIdx)}
                        className="text-xs text-[#B4463C] hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Allocation plan reference */}
      {positions.length > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E7EFEF] bg-[#F5F9FA]">
            <h2 className="text-sm font-semibold text-[#0F3A46]">Allocation plan reference</h2>
            <p className="text-xs text-[#6B7E86] mt-0.5">Engine-recommended SAA vs current portfolio</p>
          </div>
          <div className="p-5 grid grid-cols-5 gap-3">
            {Object.entries(plan.assetAllocation).map(([ac, pct]) => {
              const portfolioPct = positions
                .filter(p => p.asset_class === ac)
                .reduce((s, p) => s + p.allocation_pct, 0);
              const diff = portfolioPct - pct;
              return (
                <div key={ac} className="text-center">
                  <div className="w-2.5 h-2.5 rounded-full mx-auto mb-1" style={{ background: AC_COLOR[ac] ?? "#999" }} />
                  <div className="text-xs font-medium text-[#0F3A46]">{ac}</div>
                  <div className="text-sm font-semibold text-[#0F3A46] mt-0.5">{pct}%</div>
                  <div className="text-[10px] text-[#6B7E86]">target</div>
                  {portfolioPct > 0 && (
                    <div className={"text-[10px] font-medium mt-0.5 " + (Math.abs(diff) <= 2 ? "text-[#2E7D5B]" : "text-[#B4463C]")}>
                      {portfolioPct}% actual{diff !== 0 ? " (" + (diff > 0 ? "+" : "") + diff.toFixed(0) + ")" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add position modal */}
      {showAdd && (
        <AddPositionModal
          universe={universe}
          goals={goals}
          onAdd={addPosition}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
