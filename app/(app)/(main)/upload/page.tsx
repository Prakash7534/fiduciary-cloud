"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("pdf") as HTMLInputElement;
    if (!fileInput.files?.[0]) return;

    setLoading(true);
    const fd = new FormData();
    fd.append("pdf", fileInput.files[0]);

    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);

    if (res.status === 409 && data.ambiguous) {
      setError(
        `${data.reason} Found: ${data.candidates.map((c: { full_name: string }) => c.full_name).join(", ")}. ` +
        `This case needs the confirmation flow — see the roadmap doc for how the Flask app handled this (PAN/name+DOB auto-match, name-only asks for confirmation).`
      );
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "Upload failed.");
      return;
    }

    setStatus(`${data.isNew ? "Created" : "Updated"} — ${data.answered}/19 questions answered. ${data.matchNote}.`);
    router.push(`/clients/${data.clientId}`);
  }

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0F3A46] mb-1">Load a filled questionnaire</h1>
      <p className="text-sm text-[#6B7E86] mb-5">
        Upload a client&apos;s completed Risk Profiling Questionnaire PDF.
      </p>
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-6 max-w-lg">
        <form onSubmit={handleSubmit}>
          <input type="file" name="pdf" accept=".pdf" required className="w-full border border-dashed border-[#CBD9DC] rounded-lg p-3 text-sm" />
          <button
            type="submit"
            disabled={loading}
            className="mt-4 bg-[#C39A38] text-[#0F3A46] font-medium rounded-md px-4 py-2 text-sm disabled:opacity-60"
          >
            {loading ? "Uploading…" : "Upload & analyse"}
          </button>
        </form>
        {status && <p className="text-sm text-[#2E7D5B] mt-3">{status}</p>}
        {error && <p className="text-sm text-[#B4463C] mt-3">{error}</p>}
      </div>
    </div>
  );
}
