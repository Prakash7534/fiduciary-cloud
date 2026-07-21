// app/api/investment-universe/lookup/route.ts
// Searches AMFI (MFs) or Yahoo Finance (Stocks/ETFs) and returns structured instrument data
import { NextRequest, NextResponse } from "next/server";

interface LookupResult {
  instrument_id: string;
  name: string;
  instrument_type: string;
  isin?: string;
  ticker?: string;
  category?: string;
  asset_class?: string;
  current_price?: number;
  exchange?: string;
}

// ── Classify an Indian MF from its scheme name / category into our asset-class
//    + category vocabulary, so debt/gold/hybrid/international funds don't all
//    default to Equity. Best-effort keyword mapping; the adviser can override.
function classifyMF(text: string): { asset_class: string; category: string | null } {
  const t = (text || "").toLowerCase();
  // Gold
  if (/\bgold\b|\bsgb\b|sovereign gold/.test(t)) return { asset_class: "Gold", category: "Gold Fund" };
  // Hybrid (check before debt/equity — names often contain both)
  if (/balanced advantage|dynamic asset alloc/.test(t)) return { asset_class: "Hybrid", category: "Balanced Adv" };
  if (/aggressive hybrid/.test(t)) return { asset_class: "Hybrid", category: "Aggressive Hybrid" };
  if (/conservative hybrid/.test(t)) return { asset_class: "Hybrid", category: "Conservative Hybrid" };
  if (/multi asset/.test(t)) return { asset_class: "Hybrid", category: "Multi Asset" };
  if (/equity\s*(&|and)\s*debt/.test(t)) return { asset_class: "Hybrid", category: "Aggressive Hybrid" };
  if (/arbitrage|equity savings|balanced/.test(t)) return { asset_class: "Hybrid", category: null };
  // International
  if (/international|global|overseas|\bus\b|u\.s\.|nasdaq|s&p 500|greater china|emerging market|world|fof.*overseas/.test(t))
    return { asset_class: "International", category: "Active" };
  // Debt
  if (/gilt/.test(t)) return { asset_class: "Debt", category: "Gilt" };
  if (/liquid|overnight|money market/.test(t)) return { asset_class: "Debt", category: "Liquid" };
  if (/corporate bond|banking.*psu|\bpsu\b/.test(t)) return { asset_class: "Debt", category: "Corporate Bond" };
  if (/credit risk/.test(t)) return { asset_class: "Debt", category: "Credit Risk" };
  if (/ultra short|low duration|short duration|short term/.test(t)) return { asset_class: "Debt", category: "Short Duration" };
  if (/medium duration|medium to long/.test(t)) return { asset_class: "Debt", category: "Medium Duration" };
  if (/long duration|dynamic bond/.test(t)) return { asset_class: "Debt", category: "Long Duration" };
  if (/target maturity|fixed maturity|\bfmp\b|roll down/.test(t)) return { asset_class: "Debt", category: "FMP" };
  if (/\bdebt\b|\bbond\b|\bincome\b|duration/.test(t)) return { asset_class: "Debt", category: null };
  // Equity sub-categories
  if (/index|nifty|sensex|\betf\b/.test(t)) return { asset_class: "Equity", category: "Index" };
  if (/large\s*cap|bluechip|top 100|top 50/.test(t)) return { asset_class: "Equity", category: "Large Cap" };
  if (/mid\s*cap/.test(t)) return { asset_class: "Equity", category: "Mid Cap" };
  if (/small\s*cap/.test(t)) return { asset_class: "Equity", category: "Small Cap" };
  if (/flexi\s*cap|multi\s*cap|focused/.test(t)) return { asset_class: "Equity", category: "Flexi Cap" };
  if (/thematic|sectoral|pharma|banking|technology|\binfra|consumption|energy|manufacturing/.test(t))
    return { asset_class: "Equity", category: "Thematic" };
  return { asset_class: "Equity", category: null };
}

async function searchMF(q: string): Promise<LookupResult[]> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const results: { schemeCode: number; schemeName: string }[] = await res.json();

    return results.slice(0, 8).map(r => {
      const cls = classifyMF(r.schemeName);
      return {
        instrument_id: `MF-${r.schemeCode}`,
        name: r.schemeName,
        instrument_type: "MF",
        asset_class: cls.asset_class,
        category: cls.category ?? undefined,
        ticker: String(r.schemeCode), // mfapi scheme code stored as ticker for lookup
      };
    });
  } catch {
    return [];
  }
}

async function getMFDetails(schemeCode: string): Promise<{ isin?: string; nav?: number; category?: string; asset_class?: string }> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return {};
    const json = await res.json();
    const meta = json.meta ?? {};
    const cls = classifyMF(`${meta.scheme_category ?? ""} ${meta.scheme_name ?? ""}`);
    return {
      isin: meta.isin_growth || meta.isin_div_reinvestment || undefined,
      nav: json.data?.[0]?.nav ? parseFloat(json.data[0].nav) : undefined,
      category: cls.category ?? meta.scheme_category,
      asset_class: cls.asset_class,
    };
  } catch {
    return {};
  }
}

async function searchStock(q: string): Promise<LookupResult[]> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&region=IN&lang=en-IN&newsCount=0&listsCount=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const quotes = (json.quotes ?? []) as {
      symbol: string; shortname?: string; longname?: string;
      quoteType?: string; exchange?: string; industry?: string;
    }[];

    return quotes
      .filter(q => q.quoteType === "EQUITY" || q.quoteType === "ETF")
      .slice(0, 8)
      .map(q => {
        const ticker = q.symbol.replace(/\.(NS|BSE|BO)$/i, "");
        return {
          instrument_id: ticker,
          name: q.longname || q.shortname || ticker,
          instrument_type: q.quoteType === "ETF" ? "ETF" : "Stock",
          ticker,
          exchange: q.exchange === "NSI" ? "NSE" : q.exchange === "BSE" ? "BSE" : q.exchange,
          asset_class: q.quoteType === "ETF" ? "Equity" : "Equity",
          category: q.industry,
        };
      });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type") ?? "all"; // "mf" | "stock" | "all"
  const fetchDetails = searchParams.get("details"); // scheme code for MF detail fetch

  if (!q && !fetchDetails) return NextResponse.json([]);

  // Single MF detail fetch (called on selection)
  if (fetchDetails) {
    const details = await getMFDetails(fetchDetails);
    return NextResponse.json(details);
  }

  if (q.length < 2) return NextResponse.json([]);

  const [mfResults, stockResults] = await Promise.all([
    type === "stock" ? [] : searchMF(q),
    type === "mf"   ? [] : searchStock(q),
  ]);

  return NextResponse.json([...mfResults, ...stockResults]);
}
