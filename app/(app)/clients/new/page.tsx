"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Field = "full_name" | "email" | "phone" | "pan" | "dob";

const FIELDS: { key: Field; label: string; placeholder: string; type?: string; pattern?: string; note?: string }[] = [
  { key: "full_name", label: "Full name",     placeholder: "As per PAN card",          type: "text" },
  { key: "email",     label: "Email address", placeholder: "client@email.com",          type: "email" },
  { key: "phone",     label: "Mobile number", placeholder: "+91 98765 43210",           type: "tel",  note: "10-digit Indian mobile" },
  { key: "pan",       label: "PAN",           placeholder: "ABCDE1234F",                type: "text", note: "10-character PAN" },
  { key: "dob",       label: "Date of birth", placeholder: "",                          type: "date" },
];

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<Field, string>>({ full_name: "", email: "", phone: "", pan: "", dob: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ clientId: string; clientCode: string; name: string } | null>(null);

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setErrors(er => ({ ...er, [k]: undefined }));
  };

  const validate = () => {
    const errs: Partial<Record<Field, string>> = {};
    if (!form.full_name.trim()) errs.full_name = "Name is required";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Valid email required";
    if (!form.phone.trim() || form.phone.replace(/\D/g, "").length < 10) errs.phone = "Valid 10-digit mobile required";
    if (!form.pan.trim() || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(form.pan.trim())) errs.pan = "Valid PAN required (e.g. ABCDE1234F)";
    if (!form.dob) errs.dob = "Date of birth is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setApiError(null);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, pan: form.pan.toUpperCase() }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setApiError(json.error ?? "Failed to create profile"); return; }
    setCreated({ clientId: json.clientId, clientCode: json.clientCode, name: form.full_name });
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (created) return (
    <div className="max-w-lg mx-auto pt-8">
      <div className="bg-white border border-[#CBD9DC] rounded-2xl overflow-hidden shadow-sm">
        {/* Green top bar */}
        <div className="bg-[#2E7D5B] px-6 py-5 text-center">
          <div className="text-3xl mb-2">✅</div>
          <h2 className="text-white font-semibold text-lg">Client profile created</h2>
          <p className="text-[#B6E0CD] text-xs mt-1">{created.name}</p>
        </div>

        {/* UCC reveal */}
        <div className="bg-[#0F3A46] px-6 py-6 text-center">
          <p className="text-[#A0C4CE] text-[10px] uppercase tracking-widest mb-2">Unique Client Code (UCC)</p>
          <div className="font-mono font-bold text-[#C39A38] text-3xl tracking-widest">{created.clientCode}</div>
          <p className="text-[#6B9DAA] text-[10px] mt-2">This code is permanently assigned to this client and will appear on all generated questionnaires and reports.</p>
        </div>

        {/* Profile summary */}
        <div className="px-6 py-5 space-y-2 border-b border-[#E7EFEF]">
          {FIELDS.map(f => (
            <div key={f.key} className="flex justify-between text-sm">
              <span className="text-[#6B7E86]">{f.label}</span>
              <span className="font-medium text-[#0F3A46]">
                {f.key === "pan" ? form.pan.toUpperCase() : form[f.key] || "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 py-5 flex gap-3">
          <Link href="/clients" className="flex-1 text-center py-2.5 border border-[#CBD9DC] rounded-xl text-sm text-[#6B7E86] hover:bg-[#F5F9FA]">
            All clients
          </Link>
          <button onClick={() => router.push(`/clients/${created.clientId}/questionnaire`)}
            className="flex-1 py-2.5 bg-[#175A69] text-white rounded-xl text-sm font-medium hover:bg-[#0F3A46]">
            Generate questionnaire →
          </button>
          <button onClick={() => router.push(`/clients/${created.clientId}`)}
            className="flex-1 py-2.5 bg-[#0F3A46] text-white rounded-xl text-sm font-medium hover:bg-[#175A69]">
            Go to profile →
          </button>
        </div>
      </div>
    </div>
  );

  // ── Creation form ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6 text-xs text-[#6B7E86]">
        <Link href="/clients" className="hover:text-[#0F3A46]">← All clients</Link>
        <span>/</span>
        <span className="text-[#0F3A46] font-medium">New client</span>
      </div>

      <div className="bg-white border border-[#CBD9DC] rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-[#0F3A46] px-6 py-6">
          <h1 className="text-white font-semibold text-lg">Create client profile</h1>
          <p className="text-[#A0C4CE] text-xs mt-1.5">
            Fill in the mandatory details below. A Unique Client Code (UCC) will be generated instantly once the profile is created.
          </p>
          <div className="mt-4 flex gap-1.5 flex-wrap">
            {FIELDS.map(f => (
              <span key={f.key} className={"text-[10px] px-2.5 py-1 rounded-full border font-medium " + (errors[f.key] ? "bg-[#FDF5F5] border-[#E8C0C0] text-[#B4463C]" : form[f.key] ? "bg-[#E8F4EE] border-[#2E7D5B] text-[#1A5C3A]" : "bg-white/10 border-white/20 text-[#A0C4CE]")}>
                {f.label} {errors[f.key] ? "✗" : form[f.key] ? "✓" : "*"}
              </span>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="p-6 space-y-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-[#0F3A46] block mb-1">
                {f.label} <span className="text-[#B4463C]">*</span>
              </label>
              <input
                type={f.type ?? "text"}
                value={form[f.key]}
                onChange={set(f.key)}
                placeholder={f.placeholder}
                className={"w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none " +
                  (f.key === "pan" ? "font-mono uppercase " : "") +
                  (errors[f.key] ? "border-[#B4463C] bg-[#FDF5F5] focus:border-[#B4463C]" : "border-[#CBD9DC] focus:border-[#175A69]")}
              />
              {errors[f.key] && <p className="text-[10px] text-[#B4463C] mt-1">{errors[f.key]}</p>}
              {!errors[f.key] && f.note && <p className="text-[10px] text-[#6B7E86] mt-1">{f.note}</p>}
            </div>
          ))}

          {apiError && (
            <div className="bg-[#FDF5F5] border border-[#E8C0C0] rounded-lg px-4 py-3 text-sm text-[#B4463C]">{apiError}</div>
          )}

          <div className="pt-2 flex gap-3">
            <Link href="/clients" className="flex-none px-4 py-2.5 border border-[#CBD9DC] rounded-xl text-sm text-[#6B7E86] hover:bg-[#F5F9FA]">
              Cancel
            </Link>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-[#0F3A46] text-white rounded-xl text-sm font-semibold hover:bg-[#175A69] disabled:opacity-50">
              {loading ? "Creating profile…" : "Create profile & get UCC"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
