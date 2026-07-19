// app/(app)/clients/new/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "", dob: "", pan: "", email: "", phone: "",
    gender: "", occupation: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setLoading(true); setError(null);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to create client"); setLoading(false); return; }
    router.push(`/clients/${json.clientId}/questionnaire`);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clients" className="text-sm text-[#6B7E86] hover:text-[#0F3A46]">← Clients</Link>
        <span className="text-[#CBD9DC]">/</span>
        <h1 className="text-lg font-semibold text-[#0F3A46]">New client</h1>
      </div>

      <div className="bg-white border border-[#CBD9DC] rounded-2xl overflow-hidden">
        <div className="bg-[#0F3A46] px-6 py-5">
          <h2 className="text-white font-semibold text-base">Add a new client</h2>
          <p className="text-[#A0C4CE] text-xs mt-1">A unique client code (UCC) will be generated immediately. You can then fill in the full questionnaire.</p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#0F3A46] block mb-1">Full name <span className="text-[#B4463C]">*</span></label>
            <input value={form.full_name} onChange={set("full_name")} required placeholder="e.g. Arjun Sharma"
              className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#0F3A46] block mb-1">Date of birth</label>
              <input type="date" value={form.dob} onChange={set("dob")}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0F3A46] block mb-1">PAN</label>
              <input value={form.pan} onChange={set("pan")} placeholder="ABCDE1234F" maxLength={10}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0F3A46] block mb-1">Email</label>
              <input type="email" value={form.email} onChange={set("email")} placeholder="client@email.com"
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0F3A46] block mb-1">Phone</label>
              <input value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210"
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0F3A46] block mb-1">Gender</label>
              <select value={form.gender} onChange={set("gender")}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="">— select —</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0F3A46] block mb-1">Occupation</label>
              <select value={form.occupation} onChange={set("occupation")}
                className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#175A69]">
                <option value="">— select —</option>
                <option value="Salaried">Salaried</option>
                <option value="Self-employed">Self-employed</option>
                <option value="Business">Business</option>
                <option value="Retired">Retired</option>
                <option value="Student">Student</option>
                <option value="Homemaker">Homemaker</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-[#B4463C] bg-[#FDF5F5] border border-[#E8C0C0] rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Link href="/clients" className="flex-1 text-center py-2 border border-[#CBD9DC] rounded-lg text-sm text-[#6B7E86] hover:bg-[#F5F9FA]">Cancel</Link>
            <button type="submit" disabled={loading || !form.full_name.trim()}
              className="flex-1 py-2 bg-[#0F3A46] text-white rounded-lg text-sm font-medium hover:bg-[#175A69] disabled:opacity-50">
              {loading ? "Creating…" : "Create client & start questionnaire →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
