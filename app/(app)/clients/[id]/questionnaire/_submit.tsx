"use client";
import { useState } from "react";

interface Props {
  clientId: string;
  prefill: { full_name: string; pan: string; dob: string; phone: string; email: string };
}

export default function SubmitPanel({ clientId, prefill }: Props) {
  const [form, setForm] = useState({
    full_name: prefill.full_name,
    pan:       prefill.pan,
    dob:       prefill.dob,
    phone:     prefill.phone,
    email:     prefill.email,
    notes:     "",
  });
  const [status, setStatus] = useState<"idle"|"loading"|"success"|"error">("idle");
  const [errors, setErrors] = useState<string[]>([]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    setStatus("loading"); setErrors([]);
    const res = await fetch(`/api/clients/${clientId}/questionnaire-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) {
      setStatus("error");
      setErrors(json.details ?? [json.error ?? "Unknown error"]);
    } else {
      setStatus("success");
    }
  };

  if (status === "success") {
    return (
      <div className="bg-[#E8F4EE] border border-[#B3D9C4] rounded-xl px-6 py-5 flex items-center gap-3">
        <span className="text-2xl">✅</span>
        <div>
          <p className="text-sm font-semibold text-[#2E7D5B]">Questionnaire submission recorded</p>
          <p className="text-xs text-[#4A6572] mt-0.5">Identity fields verified and matched against client profile.</p>
        </div>
      </div>
    );
  }

  const field = (label: string, key: keyof typeof form, type = "text", readOnly = false) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#4A6572]">
        {label}
        {readOnly && <span className="ml-1.5 text-[10px] bg-[#EBF3F5] text-[#175A69] border border-[#C8D8DB] px-1.5 py-0.5 rounded font-semibold">FROM PROFILE</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={set(key)}
        readOnly={readOnly}
        className={
          "border rounded-lg px-3 py-2 text-sm outline-none " +
          (readOnly
            ? "bg-[#F0F5F6] border-[#C8D8DB] text-[#4A6572] cursor-not-allowed"
            : "border-[#CBD9DC] focus:border-[#0F3A46]")
        }
      />
    </div>
  );

  return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl px-6 py-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-[#0F3A46]">Record questionnaire submission</p>
        <p className="text-xs text-[#6B7E86] mt-0.5">
          Confirm the identity details on the returned questionnaire match the client profile before marking as submitted.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="bg-[#FDF2F1] border border-[#EDBBBA] rounded-lg px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-[#B4463C]">Identity validation failed</p>
          {errors.map((e, i) => <p key={i} className="text-xs text-[#B4463C]">• {e}</p>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {field("Full name (as per PAN)", "full_name", "text", true)}
        {field("PAN", "pan", "text", true)}
        {field("Date of birth", "dob", "date", true)}
        {field("Contact number", "phone", "tel", true)}
        {field("Email", "email", "email", true)}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[#4A6572]">Notes (optional)</label>
        <textarea
          value={form.notes}
          onChange={set("notes")}
          rows={2}
          placeholder="e.g. Signed hard copy received on 19 Jul 2026"
          className="border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0F3A46] resize-none"
        />
      </div>

      <p className="text-[10px] text-[#6B7E86]">
        Submitting will verify that the above identity fields exactly match the stored client profile. Any mismatch will be flagged.
      </p>

      <button
        onClick={submit}
        disabled={status === "loading"}
        className="w-full py-2.5 bg-[#175A69] text-white rounded-lg text-sm font-semibold hover:bg-[#0F3A46] disabled:opacity-50 transition-colors"
      >
        {status === "loading" ? "Validating & submitting…" : "Validate & Submit Questionnaire"}
      </button>
    </div>
  );
}
