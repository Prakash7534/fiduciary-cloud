// app/(app)/clients/[id]/live-assets/page.tsx — consolidated live asset register
// Declared (questionnaire) + executed portfolio positions (construction & recommendations) + existing holdings
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

const AC_COLOR: Record<string, string> = {
  Equity: "#175A69", Debt: "#C39A38", Gold: "#B8860B",
  International: "#4A90C4", Hybrid: "#7B5EA7", Alternate: "#B4463C",
};

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

interface Row { name: string; asset_class: string; value: number; sip: number; source: string; date: string | null; }

export default async function LiveAssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client, error }, { data: inv }, { data: positions }, { data: holdings }] = await Promise.all([
    supabase.from("clients").select("full_name, client_code").eq("client_id", id).single(),
    supabase.from("investments").select("*").eq("client_id", id),
    supabase.from("portfolio_positions").select("*").eq("client_id", id).eq("status", "executed"),
    supabase.from("portfolio_holdings").select("*").eq("client_id", id),
  ]);
  if (error || !client) notFound();

  const rows: Row[] = [];

  // 1. Declared assets from questionnaire
  (inv ?? []).forEach(i => {
    const v = Number(i.value ?? 0), s = Number(i.monthly_sip ?? 0);
    if (v === 0 && s === 0) return;
    const acRaw = String(i.asset_class ?? "");
    const ac = /equity|stock/i.test(acRaw) ? "Equity" : /debt|bond|fd|savings|epf|ppf|nps/i.test(acRaw) ? "Debt"
      : /gold/i.test(acRaw) ? "Gold" : /real estate/i.test(acRaw) ? "Alternate" : /insurance|ulip/i.test(acRaw) ? "Debt" : "Alternate";
    rows.push({ name: acRaw, asset_class: ac, value: v, sip: s, source: "Declared (questionnaire)", date: null });
  });

  // 2. Executed positions — split construction vs recommendation by notes
  (positions ?? []).forEach(p => {
    const v = Number(p.current_value ?? 0) > 0 ? Number(p.current_value) : Number(p.executed_lumpsum ?? 0);
    const s = Number(p.executed_sip ?? 0);
    if (v === 0 && s === 0) return;
    const fromRec = String(p.notes ?? "").startsWith("From recommendation");
    rows.push({
      name: String(p.instrument_name ?? p.instrument_id),
      asset_class: String(p.asset_class ?? "Equity"),
      value: v, sip: s,
      source: fromRec ? "Recommendation (executed)" : "Portfolio construction (executed)",
      date: p.executed_at ? new Date(p.executed_at as string).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null,
    });
  });

  // 3. Existing holdings
  (holdings ?? []).forEach(h => {
    const v = Number(h.current_value ?? 0) > 0 ? Number(h.current_value) : Number(h.lumpsum_invested ?? 0);
    const s = Number(h.monthly_sip ?? 0);
    if (v === 0 && s === 0) return;
    rows.push({
      name: String(h.custom_name ?? h.instrument_id ?? "Holding"),
      asset_class: String(h.asset_class ?? "Equity"),
      value: v, sip: s, source: "Existing holding",
      date: h.purchase_date ? new Date(h.purchase_date as string).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null,
    });
  });

  const SOURCES = ["Declared (questionnaire)", "Existing holding", "Portfolio construction (executed)", "Recommendation (executed)"];
  const bySource = SOURCES.map(s => ({
    source: s, rows: rows.filter(r => r.source === s),
    total: rows.filter(r => r.source === s).reduce((a, r) => a + r.value, 0),
    sip: rows.filter(r => r.source === s).reduce((a, r) => a + r.sip, 0),
  })).filter(g => g.rows.length > 0);

  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const totalSip   = rows.reduce((a, r) => a + r.sip, 0);
  const declared   = bySource.find(g => g.source === "Declared (questionnaire)")?.total ?? 0;
  const executed   = totalValue - declared;

  const byClass: Record<string, number> = {};
  rows.forEach(r => { byClass[r.asset_class] = (byClass[r.asset_class] ?? 0) + r.value; });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#0F3A46]">Live Assets</h1>
        <p className="text-xs text-[#6B7E86] mt-0.5">
          {client.full_name} · Consolidated register — declared assets + executed investments (construction &amp; recommendations)
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Total live assets", fmt(totalValue), "all sources combined"],
          ["Declared (questionnaire)", fmt(declared), "as reported by client"],
          ["Executed via platform", fmt(executed), "construction + recommendations + holdings"],
          ["Total monthly SIP", totalSip > 0 ? fmt(totalSip) + "/mo" : "—", "recurring across all assets"],
        ].map(([l, v, s]) => (
          <div key={l as string} className="bg-white border border-[#CBD9DC] rounded-xl p-4">
            <div className="text-xs text-[#6B7E86] mb-1">{l}</div>
            <div className="text-lg font-semibold text-[#0F3A46]">{v}</div>
            <div className="text-[10px] text-[#6B7E86] mt-0.5">{s}</div>
          </div>
        ))}
      </div>

      {/* Composition by asset class */}
      {totalValue > 0 && (
        <div className="bg-white border border-[#CBD9DC] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#175A69] mb-3">Composition by asset class</h3>
          <div className="flex h-6 rounded-lg overflow-hidden border border-[#E7EFEF] mb-3">
            {Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([ac, v]) => (
              <div key={ac} title={`${ac}: ${fmt(v)}`} style={{ width: `${v / totalValue * 100}%`, background: AC_COLOR[ac] ?? "#999" }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            {Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([ac, v]) => (
              <span key={ac} className="flex items-center gap-1.5 text-[#6B7E86]">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: AC_COLOR[ac] ?? "#999" }} />
                <strong className="text-[#0F3A46]">{ac}</strong> {fmt(v)} ({(v / totalValue * 100).toFixed(1)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grouped tables */}
      {bySource.length === 0 ? (
        <div className="bg-white border border-dashed border-[#CBD9DC] rounded-xl p-10 text-center">
          <p className="text-sm text-[#6B7E86]">No assets recorded yet — upload a questionnaire or execute investments via Portfolio Construction / Recommendations.</p>
        </div>
      ) : bySource.map(g => (
        <div key={g.source} className="bg-white border border-[#CBD9DC] rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-[#F5F9FA] border-b border-[#E7EFEF] flex justify-between items-center">
            <h3 className="text-sm font-semibold text-[#0F3A46]">{g.source}</h3>
            <p className="text-xs text-[#6B7E86]">{g.rows.length} asset(s) · <strong className="text-[#0F3A46]">{fmt(g.total)}</strong>{g.sip > 0 ? ` · ${fmt(g.sip)}/mo SIP` : ""}</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-[#6B7E86] bg-[#FAFCFC] border-b border-[#E7EFEF]">
              <th className="text-left px-5 py-2 font-medium">Asset</th>
              <th className="text-left px-3 py-2 font-medium">Class</th>
              <th className="text-right px-3 py-2 font-medium">Value</th>
              <th className="text-right px-3 py-2 font-medium">Monthly SIP</th>
              <th className="text-right px-5 py-2 font-medium">Date</th>
            </tr></thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i} className="border-b border-[#EEF4F5]">
                  <td className="px-5 py-2 font-medium text-[#0F3A46] text-xs">{r.name}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: AC_COLOR[r.asset_class] ?? "#999" }} />
                      {r.asset_class}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-[#0F3A46]">{fmt(r.value)}</td>
                  <td className="px-3 py-2 text-right text-xs">{r.sip > 0 ? fmt(r.sip) + "/mo" : "—"}</td>
                  <td className="px-5 py-2 text-right text-xs text-[#6B7E86]">{r.date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="text-[10px] text-[#6B7E86]">
        Declared assets come from the last submitted questionnaire. Executed entries flow in automatically from Portfolio Construction and executed Recommendations. Values use current value where recorded, else the executed/declared amount.
      </p>
    </div>
  );
}
