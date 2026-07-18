// app/(app)/clients/[id]/debts/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { debtsBreakdown, type ExtendedFacts, type FullLoanRow } from "@/lib/riskEngine";

export default async function DebtsPage({
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
    supabase
      .from("financial_facts")
      .select("income_self, income_spouse, income_other, rental_income")
      .eq("client_id", id)
      .maybeSingle(),
    supabase
      .from("loans")
      .select("loan_type, outstanding, emi, rate, tenure_months, lender")
      .eq("client_id", id),
  ]);

  const db = debtsBreakdown(
    (factsRaw as ExtendedFacts | null) ?? null,
    (loansRaw ?? []) as FullLoanRow[]
  );

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const pct = (r: number | null) =>
    r !== null ? `${(r * 100).toFixed(1)}%` : "—";

  if (db.debts.length === 0) {
    return (
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-6 text-sm text-[#6B7E86]">
        No liabilities recorded for this client.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total outstanding" value={fmt(db.totalOutstanding)} />
        <StatCard
          label="Monthly EMI"
          value={db.totalMonthlyEmi ? fmt(db.totalMonthlyEmi) : "—"}
        />
        <StatCard
          label="Secured debt"
          value={fmt(db.securedDebt)}
          sub={
            db.totalOutstanding > 0
              ? `${((db.securedDebt / db.totalOutstanding) * 100).toFixed(0)}% of total`
              : undefined
          }
        />
        <StatCard
          label="Unsecured debt"
          value={fmt(db.unsecuredDebt)}
          sub={
            db.totalOutstanding > 0
              ? `${((db.unsecuredDebt / db.totalOutstanding) * 100).toFixed(0)}% of total`
              : undefined
          }
          warn={db.unsecuredDebt / db.totalOutstanding > 0.3}
        />
      </div>

      {/* Debt-load ratios */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Debt-load ratios
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0F3A46] text-white text-xs">
              <th className="text-left px-3 py-1.5 font-medium">Ratio</th>
              <th className="text-left px-3 py-1.5 font-medium">Value</th>
              <th className="text-left px-3 py-1.5 font-medium">Benchmark</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            <RatioRow
              label="Debt-to-income (outstanding / annual)"
              value={
                db.debtToIncome !== null
                  ? `${db.debtToIncome.toFixed(1)}×`
                  : "—"
              }
              benchmark="< 3× annual income"
              ok={db.debtToIncome !== null ? db.debtToIncome < 3 : null}
            />
            <RatioRow
              label="EMI burden (annual EMI / income)"
              value={pct(db.emiToIncome)}
              benchmark="< 36%"
              ok={db.emiToIncome !== null ? db.emiToIncome < 0.36 : null}
            />
            <RatioRow
              label="Unsecured share of total debt"
              value={
                db.totalOutstanding > 0
                  ? pct(db.unsecuredDebt / db.totalOutstanding)
                  : "—"
              }
              benchmark="< 30%"
              ok={
                db.totalOutstanding > 0
                  ? db.unsecuredDebt / db.totalOutstanding < 0.3
                  : null
              }
            />
          </tbody>
        </table>
        {(factsRaw as ExtendedFacts | null) === null && (
          <p className="text-xs text-[#6B7E86] mt-2">
            * Income ratios unavailable — financial facts not recorded.
          </p>
        )}
      </div>

      {/* Loan detail table */}
      <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#175A69] mb-3">
          Loan schedule
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-3 py-1.5 font-medium">Type</th>
                <th className="text-left px-3 py-1.5 font-medium">Lender</th>
                <th className="text-right px-3 py-1.5 font-medium">Outstanding</th>
                <th className="text-right px-3 py-1.5 font-medium">EMI/mo</th>
                <th className="text-right px-3 py-1.5 font-medium">Rate %</th>
                <th className="text-right px-3 py-1.5 font-medium">Tenure</th>
                <th className="px-3 py-1.5 text-center font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {db.debts.map((d, i) => (
                <tr key={i} className="border-b border-[#E7EFEF]">
                  <td className="px-3 py-1.5 text-[#0F3A46]">
                    {d.loanType}
                  </td>
                  <td className="px-3 py-1.5 text-[#6B7E86]">
                    {d.lender ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right">{fmt(d.outstanding)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {d.emiMonthly ? fmt(d.emiMonthly) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {d.rate != null ? `${d.rate}%` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[#6B7E86]">
                    {d.tenureMonths != null
                      ? `${d.tenureMonths} mo`
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        d.isUnsecured
                          ? "bg-[#F8E7E4] text-[#B4463C]"
                          : "bg-[#E4F1EA] text-[#2E7D5B]"
                      }`}
                    >
                      {d.isUnsecured ? "Unsecured" : "Secured"}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F7F9F9]">
                <td colSpan={2} className="px-3 py-1.5 font-bold text-[#0F3A46]">
                  Total
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-[#0F3A46]">
                  {fmt(db.totalOutstanding)}
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-[#0F3A46]">
                  {db.totalMonthlyEmi ? fmt(db.totalMonthlyEmi) : "—"}
                </td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-4 bg-white ${
        warn ? "border-[#E0A09A]" : "border-[#CBD9DC]"
      }`}
    >
      <div className="text-xs text-[#6B7E86] mb-1">{label}</div>
      <div className="font-serif text-xl font-bold text-[#0F3A46]">{value}</div>
      {sub && (
        <div
          className={`text-[10px] mt-0.5 ${
            warn ? "text-[#B4463C]" : "text-[#6B7E86]"
          }`}
        >
          {sub}
        </div>
      )}
    </div>
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
      <td className="px-3 py-1.5 text-center text-xs">
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
