"use client";
import QuestionnaireForm, { type QuestionnairePayload } from "@/components/QuestionnaireForm";

interface Props {
  token: string; clientId: string;
  clientName: string; clientCode: string;
  prefill?: Partial<QuestionnairePayload["personal"]>;
}

export default function PublicQForm({ token, clientId, clientName, clientCode, prefill }: Props) {
  const handleSubmit = async (payload: QuestionnairePayload) => {
    const res = await fetch(`/api/q/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, payload }),
    });
    if (!res.ok) {
      const j = await res.json();
      throw new Error(j.error ?? "Submission failed");
    }
  };

  return (
    <QuestionnaireForm
      clientCode={clientCode}
      clientName={clientName}
      prefill={prefill}
      onSubmit={handleSubmit}
    />
  );
}
