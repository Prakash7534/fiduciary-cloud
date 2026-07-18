// app/api/investment-universe/price-proxy/route.ts
// Client calls this per-instrument; server fetches price and saves to DB.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function fetchMFPrice(isin: string): Promise<{ price: number; source: string } | null> {
  try {
    const search = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(isin)}`, {
      headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store",
    });
    const schemes: { schemeCode: number }[] = await search.json();
    if (!schemes?.length) return null;

    const nav = await fetch(`https://api.mfapi.in/mf/${schemes[0].schemeCode}`, {
      headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store",
    });
    const navData: { data?: { nav: string }[] } = await nav.json();
    const price = parseFloat(navData?.data?.[0]?.nav ?? "");
    if (isNaN(price) || price <= 0) return null;
    return { price, source: "mfapi.in" };
  } catch { return null; }
}

async function fetchStockPrice(ticker: string): Promise<{ price: number; source: string } | null> {
  // Try Stooq first
  try {
    const url = `https://stooq.com/q/l/?s=${ticker.toLowerCase()}.ns&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split("\n");
      if (lines.length >= 2) {
        const cols = lines[1].split(",");
        const close = parseFloat(cols[6]);
        if (!isNaN(close) && close > 0) return { price: close, source: "Stooq" };
      }
    }
  } catch { /* fall through */ }

  // Try Yahoo Finance chart API
  for (const sfx of [".NS", ".BO"]) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}${sfx}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com",
        },
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price && price > 0) return { price, source: "Yahoo Finance" };
      }
    } catch { /* try next */ }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: inst } = await supabase
    .from("investment_universe")
    .select("instrument_id, name, instrument_type, isin, ticker")
    .eq("instrument_id", id)
    .single();

  if (!inst) return NextResponse.json({ error: "Instrument not found" }, { status: 404 });

  let result: { price: number; source: string } | null = null;

  if (inst.instrument_type === "MF" && inst.isin) {
    result = await fetchMFPrice(inst.isin);
  } else if ((inst.instrument_type === "Stock" || inst.instrument_type === "ETF") && inst.ticker) {
    result = await fetchStockPrice(inst.ticker);
  }

  if (!result) {
    return NextResponse.json({ error: inst.isin ? "Price not found" : "No ISIN/ticker configured" });
  }

  // Save to DB
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("investment_universe")
    .update({ current_price: result.price, price_date: today, updated_at: new Date().toISOString() })
    .eq("instrument_id", id);

  return NextResponse.json({ price: result.price, source: result.source, date: today });
}
