// app/(app)/clients/[id]/insurance/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { insuranceAnalysis, type ExtendedFacts } from "@/lib/riskEngine";

export default async function InsurancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("client_id")
    .eq("client_id", id)
    .maybeSingle();
  if (!client) notFound();

  const { data: factsRaw } = await supabase
    .from("financial_facts")
    .select(
      "income_self, income_spouse, income_other, life_cover, health_cover, employer_cover, covers_held, nominees_updated, will_status, trust_status, poa_status, guardian_status"
    )
    .eq("client_id", id)
    .maybeSingle();

  const ins = insuranceAnalysis((factsRaw as ExtendedFacts | null) ?? null);

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* Life cover */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Life insurance
        </h3>
        <table className="w-full text-sm mb-4">
          <tbody>
            <Row label="Annual income (basis for cover calculation)" value={ins.income ? fmt(ins.income) : "—"} />
            <Row label="Required cover (income × 10 rule)" value={ins.income ? fmt(ins.lifeRequired) : "—"} />
            <Row label="Current life cover" value={ins.lifeCurrent ? fmt(ins.lifeCurrent) : "Not recorded"} />
            <Row
              label="Cover gap"
              value={ins.income ? fmt(ins.lifeGap) : "—"}
              status={ins.income === 0 ? "na" : ins.lifeAdequate ? "ok" : "bad"}
              bold
            />
          </tbody>
        </table>
        {ins.employerCover != null && ins.employerCover > 0 && (
          <p className="text-xs text-[#6B7E86]">
            Employer-provided group cover: {fmt(ins.employerCover)} — note this
            lapses if employment changes; should not reduce the term-plan
            requirement.
          </p>
        )}
      </div>

      {/* Health cover */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Health insurance
        </h3>
        <table className="w-full text-sm">
          <tbody>
            <Row
              label="Health cover (family floater sum insured)"
              value={ins.healthCover ? fmt(ins.healthCover) : "Not recorded"}
              status={
                ins.healthCover === null
                  ? "bad"
                  : ins.healthCover < 500_000
                  ? "bad"
                  : "ok"
              }
            />
            {ins.employerCover != null && (
              <Row
                label="Employer-provided cover"
                value={ins.employerCover > 0 ? fmt(ins.employerCover) : "None"}
              />
            )}
          </tbody>
        </table>
        {ins.coversHeld && (
          <p className="text-xs text-[#6B7E86] mt-3">
            Covers held (per questionnaire): {ins.coversHeld}
          </p>
        )}
      </div>

      {/* Nominee status */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-2">
          Nominee / beneficiary status
        </h3>
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
            ins.nomineesUpdated === "Yes"
              ? "bg-[#E4F1EA] text-[#2E7D5B]"
              : "bg-[#F8E7E4] text-[#B4463C]"
          }`}
        >
          {ins.nomineesUpdated === "Yes"
            ? "✓ Nominees confirmed updated"
            : "✗ Nominees not confirmed / not recorded"}
        </div>
      </div>

      {/* Action items */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Action items
        </h3>
        {ins.notes.length === 1 && ins.notes[0].startsWith("No critical") ? (
          <div className="flex gap-2 text-sm text-[#2E7D5B]">
            <span className="font-bold shrink-0">✓</span>
            <span>{ins.notes[0]}</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {ins.notes.map((n, i) => (
              <li
                key={i}
                className="flex gap-3 bg-[#F8E7E4] rounded-lg p-3 text-sm"
              >
                <span className="text-[10px] font-bold text-[#B4463C] shrink-0 mt-0.5">
                  ACTION
                </span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  status,
}: {
  label: string;
  value: string;
  bold?: boolean;
  status?: "ok" | "bad" | "na";
}) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="py-1.5 text-[#6B7E86]">{label}</td>
      <td
        className={`py-1.5 text-right ${bold ? "font-bold text-[#0F3A46]" : ""}`}
      >
        <span
          className={
            status === "bad"
              ? "text-[#B4463C] font-semibold"
              : status === "ok"
              ? "text-[#2E7D5B] font-semibold"
              : ""
          }
        >
          {value}
        </span>
        {status === "ok" && (
          <span className="ml-1.5 text-[#2E7D5B] text-xs">✓</span>
        )}
        {status === "bad" && (
          <span className="ml-1.5 text-[#B4463C] text-xs">✗</span>
        )}
      </td>
    </tr>
  );
}
