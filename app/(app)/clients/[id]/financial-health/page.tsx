// app/(app)/clients/[id]/financial-health/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  financialPosition,
  type ExtendedFacts,
  type FullLoanRow,
  type FullInvestmentRow,
} from "@/lib/riskEngine";

const GRADE_STYLE: Record<string, string> = {
  Healthy: "bg-[#E4F1EA] text-[#2E7D5B]",
  Caution: "bg-[#FEF9E7] text-[#7D6B2E]",
  Stressed: "bg-[#F8E7E4] text-[#B4463C]",
  Critical: "bg-[#F8E7E4] text-[#B4463C]",
};

export default async function FinancialHealthPage({
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

  const [{ data: factsRaw }, { data: loansRaw }, { data: invsRaw }] =
    await Promise.all([
      supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
      supabase.from("loans").select("loan_type, outstanding, emi").eq("client_id", id),
      supabase.from("investments").select("asset_class, value").eq("client_id", id),
    ]);

  const fp = financialPosition(
    (factsRaw as ExtendedFacts | null) ?? null,
    (loansRaw ?? []) as FullLoanRow[],
    (invsRaw ?? []) as FullInvestmentRow[]
  );

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const pct = (r: number | null) =>
    r !== null ? `${(r * 100).toFixed(1)}%` : "—";

  return (
    <div className="space-y-4">
      {/* Grade banner */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-[#175A69] mb-1">
              Financial health grade
            </h3>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${GRADE_STYLE[fp.grade]}`}
            >
              {fp.grade}
            </span>
          </div>
          <div className="flex-1 space-y-1">
            {fp.gradeNotes.map((n, i) => (
              <p key={i} className="text-xs text-[#6B7E86]">
                {n}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Net worth summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total assets" value={fmt(fp.totalAssets)} />
        <StatCard label="Total liabilities" value={fmt(fp.totalDebt)} />
        <StatCard
          label="Net worth"
          value={fmt(fp.netWorth)}
          highlight={fp.netWorth < 0 ? "bad" : fp.netWorth === 0 ? "neutral" : "good"}
        />
      </div>

      {/* Asset composition */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Asset composition
        </h3>
        <table className="w-full text-sm">
          <tbody>
            <Row label="Financial investments" value={fmt(fp.investmentAssets)} />
            <Row label="Property" value={fmt(fp.propertyAssets)} />
            <Row label="EPF / NPS corpus" value={fmt(fp.epfNps)} />
            <Row label="Total assets" value={fmt(fp.totalAssets)} bold />
          </tbody>
        </table>
      </div>

      {/* Key ratios */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">Key ratios</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0F3A46] text-white text-xs">
              <th className="text-left px-3 py-1.5 font-medium">Ratio</th>
              <th className="text-left px-3 py-1.5 font-medium">Value</th>
              <th className="text-left px-3 py-1.5 font-medium">Benchmark</th>
            </tr>
          </thead>
          <tbody>
            <RatioRow
              label="Solvency (net worth / assets)"
              value={pct(fp.solvencyRatio)}
              benchmark="> 50% — good"
              ok={fp.solvencyRatio !== null ? fp.solvencyRatio >= 0.5 : null}
            />
            <RatioRow
              label="Debt-to-income (outstanding / annual)"
              value={
                fp.debtToIncome !== null
                  ? `${fp.debtToIncome.toFixed(1)}×`
                  : "—"
              }
              benchmark="< 3× annual income"
              ok={fp.debtToIncome !== null ? fp.debtToIncome < 3 : null}
            />
            <RatioRow
              label="EMI burden (annual EMI / income)"
              value={pct(fp.emiToIncome)}
              benchmark="< 36%"
              ok={fp.emiToIncome !== null ? fp.emiToIncome < 0.36 : null}
            />
            <RatioRow
              label="Surplus ratio (surplus / income)"
              value={pct(fp.surplusRatio)}
              benchmark="> 20%"
              ok={fp.surplusRatio !== null ? fp.surplusRatio >= 0.2 : null}
            />
          </tbody>
        </table>
        {fp.annualExpenses === null && (
          <p className="text-xs text-[#6B7E86] mt-2">
            * Surplus ratio unavailable — annual expenses not recorded in
            questionnaire.
          </p>
        )}
      </div>

      {/* Estate planning */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Estate planning ({fp.estateScore}/4 in place)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {fp.estateDocs.map((d) => (
            <div
              key={d.name}
              className={`rounded-lg p-3 text-center text-xs font-medium ${
                d.status === "Yes"
                  ? "bg-[#E4F1EA] text-[#2E7D5B]"
                  : d.status === null
                  ? "bg-[#F7F9F9] text-[#6B7E86]"
                  : "bg-[#F8E7E4] text-[#B4463C]"
              }`}
            >
              <div className="font-bold text-sm mb-0.5">
                {d.status === "Yes" ? "✓" : d.status === null ? "?" : "✗"}
              </div>
              {d.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad" | "neutral";
}) {
  const bg =
    highlight === "good"
      ? "bg-[#E4F1EA]"
      : highlight === "bad"
      ? "bg-[#F8E7E4]"
      : "bg-white";
  return (
    <div className={`border border-[#CBD9DC] rounded-xl p-4 ${bg}`}>
      <div className="text-xs text-[#6B7E86] mb-1">{label}</div>
      <div className="font-serif text-xl text-[#0F3A46] font-bold">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="py-1.5 text-[#6B7E86]">{label}</td>
      <td
        className={`py-1.5 text-right ${bold ? "font-bold text-[#0F3A46]" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

function RatioRow({
  label,
  value,
  benchmark,
  ok,
}: {
  label: string;
  value: string;
  benchmark: string;
  ok: boolean | null;
}) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td className="px-3 py-1.5 text-[#6B7E86]">{label}</td>
      <td className="px-3 py-1.5 font-semibold text-[#0F3A46]">{value}</td>
      <td className="px-3 py-1.5 text-[#6B7E86] text-xs">{benchmark}</td>
      <td className="px-3 py-1.5 text-xs">
        {ok === null ? (
          <span className="text-[#6B7E86]">—</span>
        ) : ok ? (
          <span className="text-[#2E7D5B] font-semibold">✓</span>
        ) : (
          <span className="text-[#B4463C] font-semibold">✗</span>
        )}
      </td>
    </tr>
  );
}
