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

async function searchMF(q: string): Promise<LookupResult[]> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const results: { schemeCode: number; schemeName: string }[] = await res.json();

    return results.slice(0, 8).map(r => ({
      instrument_id: `MF-${r.schemeCode}`,
      name: r.schemeName,
      instrument_type: "MF",
      asset_class: "Equity", // default; user can change
      ticker: String(r.schemeCode), // mfapi scheme code stored as ticker for lookup
    }));
  } catch {
    return [];
  }
}

async function getMFDetails(schemeCode: string): Promise<{ isin?: string; nav?: number; category?: string }> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return {};
    const json = await res.json();
    const meta = json.meta ?? {};
    return {
      isin: meta.isin_growth || meta.isin_div_reinvestment || undefined,
      nav: json.data?.[0]?.nav ? parseFloat(json.data[0].nav) : undefined,
      category: meta.scheme_category,
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
