// app/(app)/clients/[id]/_components/OverrideSelector.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "Conservative",
  "Moderately Conservative",
  "Balanced / Moderate",
  "Moderately Aggressive",
  "Aggressive",
] as const;

export default function OverrideSelector({
  clientId,
  currentOverride,
  computedProfile,
}: {
  clientId: string;
  currentOverride: string | null;
  computedProfile: string;
}) {
  const [value, setValue] = useState(currentOverride ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const handleChange = (v: string) => {
    setValue(v);
    setSaved(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      await fetch(`/api/clients/${clientId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ risk_override: v || null }),
      });
      setSaved(true);
      router.refresh();
    });
  };

  const v = value;
  const isActive = !!v;
  const finalProfile = isActive ? v : computedProfile;

  return (
    <div className="mt-4 space-y-3">
      <div className="border border-[#CBD9DC] rounded-lg p-3">
        <label className="text-xs text-[#6B7E86] block mb-1.5">Adviser override (optional)</label>
        <div className="flex gap-2">
          <select
            value={v}
            onChange={e => handleChange(e.target.value)}
            className="flex-1 text-sm border border-[#CBD9DC] rounded-lg px-3 py-1.5 text-[#0F3A46] bg-white focus:outline-none focus:ring-1 focus:ring-[#175A69]"
          >
            <option value="">— none, use computed profile —</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={pending}
            className="px-3 py-1.5 bg-[#0F3A46] text-white text-xs font-medium rounded-lg hover:bg-[#175A69] disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
        {isActive && (
          <p className="text-[10px] text-[#7D6B2E] mt-1.5">
            Override active — computed profile was <strong>{computedProfile}</strong>. Document rationale in Advisor Notes.
          </p>
        )}
        {!isActive && (
          <p className="text-[10px] text-[#6B7E86] mt-1.5">Record the rationale in Advisor Notes.</p>
        )}
      </div>

      {/* Final profile banner */}
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${isActive ? "bg-[#7D6B2E]" : "bg-[#0F3A46]"}`}>
        <div>
          <div className="text-[9px] tracking-widest text-[#BFD3D8] uppercase mb-0.5">
            {isActive ? "FINAL RISK PROFILE (OVERRIDDEN)" : "FINAL RISK PROFILE"}
          </div>
          <div className="font-serif text-lg text-[#E8DBB8]">{finalProfile}</div>
        </div>
      </div>
    </div>
  );
}
