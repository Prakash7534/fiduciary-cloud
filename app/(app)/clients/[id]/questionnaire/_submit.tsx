"use client";
import { useRef, useState } from "react";

interface Props { clientId: string; }

export default function SubmitPanel({ clientId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]     = useState<File | null>(null);
  const [notes, setNotes]   = useState("");
  const [status, setStatus] = useState<"idle"|"loading"|"success"|"error">("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [pdfVals, setPdfVals] = useState<Record<string,string> | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.type !== "application/pdf") {
      setErrors(["Please select a PDF file."]);
      return;
    }
    setFile(f);
    setErrors([]);
    setStatus("idle");
    setPdfVals(null);
  };

  const submit = async () => {
    if (!file) return;
    setStatus("loading"); setErrors([]); setPdfVals(null);

    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("notes", notes);

    const res = await fetch(`/api/clients/${clientId}/questionnaire-submit`, {
      method: "POST",
      body: fd,
    });
    const json = await res.json();

    if (!res.ok) {
      setStatus("error");
      setErrors(json.details ?? [json.error ?? "Unknown error"]);
      if (json.pdf_values) setPdfVals(json.pdf_values);
    } else {
      setStatus("success");
    }
  };

  if (status === "success") {
    return (
      <div className="bg-[#E8F4EE] border border-[#B3D9C4] rounded-xl px-6 py-5 flex items-center gap-4">
        <span className="text-3xl">✅</span>
        <div>
          <p className="text-sm font-semibold text-[#2E7D5B]">Questionnaire validated and submission recorded</p>
          <p className="text-xs text-[#4A6572] mt-0.5">All identity fields matched client profile. Submission logged successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#CBD9DC] rounded-xl px-6 py-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-[#0F3A46]">Upload completed questionnaire (PDF)</p>
        <p className="text-xs text-[#6B7E86] mt-0.5">
          Upload the signed questionnaire returned by the client. The system will automatically verify that the UCC, name, PAN, date of birth, contact number and email in the PDF match this client's profile before accepting the submission.
        </p>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="bg-[#FDF2F1] border border-[#EDBBBA] rounded-lg px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-[#B4463C] flex items-center gap-1.5">
            <span>⚠</span> Identity validation failed — PDF not accepted
          </p>
          {errors.map((e, i) => <p key={i} className="text-xs text-[#B4463C] pl-4">• {e}</p>)}
          {pdfVals && (
            <div className="mt-2 pt-2 border-t border-[#EDBBBA]">
              <p className="text-[10px] font-semibold text-[#B4463C] mb-1">Values read from PDF:</p>
              {Object.entries(pdfVals).map(([k, v]) => (
                <p key={k} className="text-[10px] text-[#B4463C] font-mono pl-2">{k}: {v || "(empty)"}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        className={
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors " +
          (file ? "border-[#0F3A46] bg-[#F0F5F6]" : "border-[#CBD9DC] hover:border-[#0F3A46] hover:bg-[#F8FAFB]")
        }
      >
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onFile} />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">📄</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-[#0F3A46]">{file.name}</p>
              <p className="text-xs text-[#6B7E86]">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-2xl mb-2">📂</p>
            <p className="text-sm text-[#0F3A46] font-medium">Click to select filled PDF</p>
            <p className="text-xs text-[#6B7E86] mt-1">Upload the signed questionnaire returned by the client</p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[#4A6572]">Notes for audit trail (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. Signed original received on 19 Jul 2026 via email"
          className="border border-[#CBD9DC] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0F3A46] resize-none"
        />
      </div>

      <p className="text-[10px] text-[#6B7E86]">
        The system reads UCC, name, PAN, date of birth, contact number and email directly from the PDF form fields and cross-checks against the stored profile. Any mismatch will block submission.
      </p>

      <button
        onClick={submit}
        disabled={!file || status === "loading"}
        className="w-full py-2.5 bg-[#175A69] text-white rounded-lg text-sm font-semibold hover:bg-[#0F3A46] disabled:opacity-40 transition-colors"
      >
        {status === "loading" ? "Reading PDF & validating…" : "Upload & Validate Submission"}
      </button>
    </div>
  );
}
