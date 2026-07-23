// app/(app)/clients/[id]/cash-flow/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cashFlow, type ExtendedFacts, type FullLoanRow } from "@/lib/riskEngine";

export default async function CashFlowPage({
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

  const [{ data: factsRaw }, { data: loansRaw }] = await Promise.all([
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase
      .from("loans")
      .select("loan_type, outstanding, emi")
      .eq("client_id", id),
  ]);

  const cf = cashFlow(
    (factsRaw as ExtendedFacts | null) ?? null,
    (loansRaw ?? []) as FullLoanRow[]
  );

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const pct = (r: number | null) =>
    r !== null ? `${(r * 100).toFixed(1)}%` : "—";

  const surplusOk =
    cf.surplusRatio !== null ? cf.surplusRatio >= 0.2 : null;

  return (
    <div className="space-y-4">
      {/* Income breakdown */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Income (annual)
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {cf.incomeSelf > 0 && (
              <Row label="Primary earner" value={fmt(cf.incomeSelf)} />
            )}
            {cf.incomeSpouse > 0 && (
              <Row label="Spouse / partner" value={fmt(cf.incomeSpouse)} />
            )}
            {cf.incomeOther > 0 && (
              <Row label="Other income" value={fmt(cf.incomeOther)} />
            )}
            {cf.rentalIncome > 0 && (
              <Row label="Rental income" value={fmt(cf.rentalIncome)} />
            )}
            <Row label="Total income" value={fmt(cf.totalIncome)} bold />
            {cf.variablePct != null && cf.variablePct > 0 && (
              <>
                <Row label={`— of which variable / bonus (~${cf.variablePct}%)`} value={fmt(cf.variableIncome)} muted />
                <Row label="Stable / committed income" value={fmt(cf.stableIncome)} muted />
              </>
            )}
          </tbody>
        </table>
        {cf.totalIncome === 0 && (
          <p className="text-xs text-[#6B7E86] mt-2">
            No income recorded in the questionnaire.
          </p>
        )}
      </div>

      {/* Outflows */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Outflows (annual)
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {cf.annualExpenses !== null && (
              <Row
                label="Living expenses"
                value={fmt(cf.annualExpenses)}
              />
            )}
            {cf.rentMonthly !== null && cf.rentMonthly > 0 && (
              <Row
                label="Rent paid (included in expenses)"
                value={`${fmt(cf.rentMonthly * 12)} p.a. (${fmt(cf.rentMonthly)}/mo)`}
                muted
              />
            )}
            {cf.emiByType.length > 0 && (
              <>
                {cf.emiByType.map((e) => (
                  <Row
                    key={e.loanType}
                    label={`EMI — ${e.loanType}`}
                    value={`${fmt(e.annualEmi)} p.a.`}
                  />
                ))}
                <Row
                  label="Total EMI"
                  value={`${fmt(cf.annualEmi)} p.a.`}
                  bold
                />
              </>
            )}
            {cf.annualExpenses !== null && (
              <Row
                label="Total outflows"
                value={fmt(
                  cf.annualExpenses + cf.annualEmi
                )}
                bold
              />
            )}
          </tbody>
        </table>
        {cf.annualExpenses === null && (
          <p className="text-xs text-[#6B7E86] mt-2">
            Annual expenses not recorded — complete the questionnaire to see
            full cash-flow picture.
          </p>
        )}
      </div>

      {/* Surplus */}
      {cf.surplus !== null && (
        <div
          className={`border rounded-xl p-5 ${
            cf.surplus >= 0
              ? "bg-[#E4F1EA] border-[#A3CFB5]"
              : "bg-[#F8E7E4] border-[#E0A09A]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-[#6B7E86] uppercase tracking-wide mb-0.5">
                Annual surplus
              </div>
              <div className="font-serif text-2xl font-bold text-[#0F3A46]">
                {fmt(cf.surplus)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#6B7E86]">Surplus ratio</div>
              <div
                className={`text-lg font-bold ${
                  surplusOk ? "text-[#2E7D5B]" : "text-[#B4463C]"
                }`}
              >
                {pct(cf.surplusRatio)}
              </div>
              <div className="text-[10px] text-[#6B7E86]">
                target ≥ 20% of income
              </div>
            </div>
          </div>
          {cf.stableSurplus !== null && cf.variablePct != null && cf.variablePct > 0 && (
            <p className="text-xs text-[#6B7E86] mt-3">
              On stable / committed income only (excluding the ~{cf.variablePct}% variable / bonus): surplus {fmt(cf.stableSurplus)} ({pct(cf.stableSurplusRatio)}). Planning leans on this conservative figure.
            </p>
          )}
          {cf.surplus < 0 && (
            <p className="text-xs text-[#B4463C] mt-3 font-medium">
              Spending + EMI exceeds income — budget review is urgent before
              any new investments are recommended.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className="border-b border-[#E7EFEF]">
      <td
        className={`py-1.5 ${muted ? "text-[#A0AFBA] text-xs pl-4" : "text-[#6B7E86]"}`}
      >
        {label}
      </td>
      <td
        className={`py-1.5 text-right ${
          bold
            ? "font-bold text-[#0F3A46]"
            : muted
            ? "text-[#A0AFBA] text-xs"
            : ""
        }`}
      >
        {value}
      </td>
    </tr>
  );
}
