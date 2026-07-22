"use client";
import { useCallback, useState } from "react";
import RetirementPlanner, { type RetirementBase } from "./_retirement";

function fmtCr(n: number) {
  const v = Math.round(n);
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(v) >= 100_000)    return `₹${(v / 100_000).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// The four summary cards + the retirement planner live together as one client
// island so adjusting the planner (life expectancy, EPF, returns…) immediately
// moves "Additional SIP needed across all goals" and the lumpsum, instead of
// waiting for a Save + reload.
export default function GoalsSummary({
  clientId, base, goalsCount, totalLiveValue, totalLiveSip,
  otherExtraSip, otherLumpsum, hasRetGoal, initialRetSip, initialRetLumpsum,
}: {
  clientId: string; base: RetirementBase;
  goalsCount: number; totalLiveValue: number; totalLiveSip: number;
  otherExtraSip: number; otherLumpsum: number; hasRetGoal: boolean;
  initialRetSip: number; initialRetLumpsum: number;
}) {
  const [retSip, setRetSip]   = useState(initialRetSip);
  const [retLump, setRetLump] = useState(initialRetLumpsum);
  const onResult = useCallback((sip: number, lump: number) => { setRetSip(sip); setRetLump(lump); }, []);

  const totalExtraSip   = otherExtraSip + (hasRetGoal ? retSip : 0);
  const totalLumpsumNow = otherLumpsum + (hasRetGoal ? retLump : 0);
  const dirty = hasRetGoal && (Math.round(retSip) !== Math.round(initialRetSip) || Math.round(retLump) !== Math.round(initialRetLumpsum));

  return (
    <>
      {/* Summary header */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Goals on record</div>
          <div className="text-3xl font-bold font-serif text-[#0F3A46]">{goalsCount}</div>
        </div>
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-4">
          <div className="text-xs text-[#6B7E86] mb-1">Live portfolio counted</div>
          <div className="font-bold text-[#0F3A46]">{totalLiveValue > 0 ? fmtCr(totalLiveValue) : "—"}</div>
          <div className="text-[10px] text-[#6B7E86] mt-0.5">{totalLiveSip > 0 ? "+ " + fmtCr(totalLiveSip) + "/mo executed SIP" : "no executed positions yet"}</div>
        </div>
        <div className={`border rounded-xl p-4 ${totalExtraSip > 0 ? "bg-[#FFF7F6] border-[#E4B3AE]" : "bg-[#E4F1EA] border-[#B3D9C3]"}`}>
          <div className="text-xs text-[#6B7E86] mb-1">Additional SIP needed across all goals</div>
          <div className={`font-bold ${totalExtraSip > 0 ? "text-[#B4463C]" : "text-[#2E7D5B]"}`}>
            {totalExtraSip > 0 ? fmtCr(totalExtraSip) + "/mo" : "All goals on track ✓"}
          </div>
          {dirty && <div className="text-[10px] text-[#175A69] mt-0.5">live preview · Save in the planner to lock in</div>}
        </div>
        <div className={`border rounded-xl p-4 ${totalLumpsumNow > 0 ? "bg-[#FFFBF2] border-[#E3D3A8]" : "bg-[#E4F1EA] border-[#B3D9C3]"}`}>
          <div className="text-xs text-[#6B7E86] mb-1">OR one-time lumpsum today (all goals)</div>
          <div className={`font-bold ${totalLumpsumNow > 0 ? "text-[#8A6D1C]" : "text-[#2E7D5B]"}`}>
            {totalLumpsumNow > 0 ? fmtCr(totalLumpsumNow) : "Nothing needed ✓"}
          </div>
          <div className="text-[10px] text-[#6B7E86] mt-0.5">invest now instead of extra SIP</div>
        </div>
      </div>

      {/* Retirement corpus planner — settable life expectancy + EPF, drives the totals above */}
      <RetirementPlanner clientId={clientId} base={base} onResult={onResult} />
    </>
  );
}
