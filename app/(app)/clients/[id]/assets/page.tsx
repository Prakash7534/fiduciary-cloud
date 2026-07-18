// app/(app)/clients/[id]/assets/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  assetsBreakdown,
  type ExtendedFacts,
  type FullInvestmentRow,
} from "@/lib/riskEngine";

export default async function AssetsPage({
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

  const [{ data: factsRaw }, { data: invsRaw }] = await Promise.all([
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase
      .from("investments")
      .select("asset_class, value, monthly_sip")
      .eq("client_id", id),
  ]);

  const ab = assetsBreakdown(
    (factsRaw as ExtendedFacts | null) ?? null,
    (invsRaw ?? []) as FullInvestmentRow[]
  );

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Financial investments" value={fmt(ab.investmentTotal)} />
        <StatCard label="Property" value={fmt(ab.propertyTotal)} />
        <StatCard label="EPF / NPS" value={fmt(ab.epfNps)} />
        <StatCard label="Total assets" value={fmt(ab.totalAssets)} highlight />
      </div>

      {/* Concentration warning */}
      {ab.topConcentration && (
        <div className="bg-[#FEF9E7] border border-[#E8D68A] rounded-xl p-4 text-sm">
          <span className="font-semibold text-[#7D6B2E]">Concentration alert: </span>
          <span className="text-[#6B7E86]">
            {ab.topConcentration.assetClass} represents{" "}
            {ab.topConcentration.pct.toFixed(1)}% of total assets — consider
            diversifying.
          </span>
        </div>
      )}

      {/* Financial investments table */}
      {ab.investmentGroups.length > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">
            Financial investments
            {ab.monthlySipTotal > 0 && (
              <span className="ml-2 text-xs font-normal text-[#6B7E86]">
                · {fmt(ab.monthlySipTotal)}/mo ongoing SIP
              </span>
            )}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0F3A46] text-white text-xs">
                <th className="text-left px-3 py-1.5 font-medium">Asset class</th>
                <th className="text-right px-3 py-1.5 font-medium">Value</th>
                <th className="text-right px-3 py-1.5 font-medium">% of total</th>
                <th className="text-right px-3 py-1.5 font-medium">Monthly SIP</th>
              </tr>
            </thead>
            <tbody>
              {ab.investmentGroups.map((g) => (
                <tr key={g.assetClass} className="border-b border-[#E7EFEF]">
                  <td className="px-3 py-1.5 text-[#0F3A46]">{g.assetClass}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(g.value)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-[#E7EFEF] rounded-full h-1.5">
                        <div
                          className="bg-[#175A69] h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, g.pct)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[#6B7E86]">
                        {g.pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-[#6B7E86]">
                    {g.monthlySip ? fmt(g.monthlySip) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#DDE6E8]">
                <td className="px-3 py-1.5 font-bold text-[#0F3A46]">
                  Financial total
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-[#0F3A46]">
                  {fmt(ab.investmentTotal)}
                </td>
                <td className="px-3 py-1.5 text-right text-[#6B7E86] text-xs">
                  {ab.totalAssets > 0
                    ? `${((ab.investmentTotal / ab.totalAssets) * 100).toFixed(1)}% of total`
                    : ""}
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-[#0F3A46]">
                  {ab.monthlySipTotal ? fmt(ab.monthlySipTotal) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Property */}
      {ab.propertyAssets.length > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">
            Property
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {ab.propertyAssets.map((p) => (
                <tr key={p.label} className="border-b border-[#E7EFEF]">
                  <td className="py-1.5 text-[#6B7E86]">{p.label}</td>
                  <td className="py-1.5 text-right">{fmt(p.value)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 font-bold text-[#0F3A46]">
                  Property total
                </td>
                <td className="py-1.5 text-right font-bold text-[#0F3A46]">
                  {fmt(ab.propertyTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {ab.totalAssets === 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-6 text-sm text-[#6B7E86]">
          No asset data recorded. Upload or re-upload the questionnaire to
          populate this view.
        </div>
      )}
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
  highlight?: boolean;
}) {
  return (
    <div
      className={`border border-[#CBD9DC] rounded-xl p-4 ${
        highlight ? "bg-[#0F3A46] text-white" : "bg-white"
      }`}
    >
      <div
        className={`text-xs mb-1 ${
          highlight ? "text-[#BFD3D8]" : "text-[#6B7E86]"
        }`}
      >
        {label}
      </div>
      <div className="font-serif text-xl font-bold">{value}</div>
    </div>
  );
}
