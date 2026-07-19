"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QuestionnaireForm, { type QuestionnairePayload } from "@/components/QuestionnaireForm";

interface Props {
  clientId: string;
  clientName: string;
  clientCode: string;
  prefill?: Partial<QuestionnairePayload["personal"]>;
}

export default function AdviserQForm({ clientId, clientName, clientCode, prefill }: Props) {
  const router = useRouter();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [genLink, setGenLink] = useState(false);

  const generateLink = async () => {
    setGenLink(true);
    const res = await fetch(`/api/clients/${clientId}/questionnaire`);
    const json = await res.json();
    setShareUrl(json.url);
    setGenLink(false);
  };

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (payload: QuestionnairePayload) => {
    const res = await fetch(`/api/clients/${clientId}/questionnaire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Submit failed");
    // Let QuestionnaireForm handle the done state, then redirect
    setTimeout(() => router.push(`/clients/${clientId}`), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Share link panel */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-[#0F3A46]">Send questionnaire to client</p>
          <p className="text-xs text-[#6B7E86] mt-0.5">Generate a secure link valid for 7 days — client fills it without logging in.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {shareUrl && (
            <div className="flex items-center gap-2 bg-[#F0F5F6] rounded-lg px-3 py-1.5 border border-[#CBD9DC]">
              <span className="text-xs font-mono text-[#0F3A46] truncate max-w-[220px]">{shareUrl}</span>
              <button onClick={copy} className={"text-xs font-medium shrink-0 " + (copied ? "text-[#2E7D5B]" : "text-[#175A69]")}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          )}
          <button onClick={generateLink} disabled={genLink}
            className="px-4 py-2 text-sm bg-[#175A69] text-white rounded-lg hover:bg-[#0F3A46] disabled:opacity-50">
            {genLink ? "Generating…" : shareUrl ? "↻ New link" : "Generate client link"}
          </button>
        </div>
      </div>

      {/* Adviser fills in-app */}
      <div className="bg-[#EBF3F5] border border-[#C8D8DB] rounded-xl px-4 py-2.5">
        <p className="text-xs text-[#175A69] font-medium">Or fill the questionnaire below yourself during the onboarding meeting:</p>
      </div>

      <QuestionnaireForm
        clientCode={clientCode}
        clientName={clientName}
        prefill={prefill}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
