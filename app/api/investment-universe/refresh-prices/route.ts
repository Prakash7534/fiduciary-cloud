// app/api/investment-universe/refresh-prices/route.ts
// Called by: UI "Refresh Prices" button (POST) + Vercel cron (GET, daily 4pm IST)
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface Instrument {
  instrument_id: string;
  name: string | null;
  instrument_type: string | null;
  ticker: string | null;
  isin: string | null;
}

type PriceResult = { instrument_id: string; name: string | null; price?: number; source?: string; error?: string };

// ── AMFI bulk NAV file ──────────────────────────────────────────────────────
async function fetchAmfiPrices(isins: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch("https://www.amfiindia.com/spages/NAVAll.txt", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return map;
    const text = await res.text();

    for (const line of text.split("\n")) {
      const parts = line.split(";");
      if (parts.length < 6) continue;
      // Format: SchemeCode;ISIN_Growth;ISIN_Reinvest;SchemeName;NAV;Date
      const isin1 = parts[1]?.trim();
      const isin2 = parts[2]?.trim();
      const nav   = parseFloat(parts[4]?.trim());
      if (isNaN(nav) || nav <= 0) continue;
      if (isin1 && isins.includes(isin1)) map.set(isin1, nav);
      if (isin2 && isins.includes(isin2)) map.set(isin2, nav);
    }
  } catch (e) {
    console.error("AMFI fetch error:", e);
  }
  return map;
}

// ── Yahoo Finance quote API ─────────────────────────────────────────────────
async function fetchYahooPrices(tickers: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!tickers.length) return map;
  try {
    // Append .NS for NSE if no exchange suffix
    const symbols = tickers
      .map(t => /\.(NS|BSE|BO)$/i.test(t) ? t.toUpperCase() : `${t.toUpperCase()}.NS`)
      .join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,symbol`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return map;
    const json = await res.json();
    for (const q of json?.quoteResponse?.result ?? []) {
      const price = q.regularMarketPrice as number;
      if (!price) continue;
      // Store by base ticker (strip .NS/.BSE)
      const base = (q.symbol as string).replace(/\.(NS|BSE|BO)$/i, "");
      map.set(base, price);
      map.set(q.symbol as string, price); // also store with suffix
    }
  } catch (e) {
    console.error("Yahoo Finance fetch error:", e);
  }
  return map;
}

async function runRefresh() {
  // Use service role for writes (cron runs without user session)
  // Use regular client to read (same data either way since RLS is now open)
  const supabase = createServiceClient();
  const { data: instruments, error } = await supabase
    .from("investment_universe")
    .select("instrument_id, name, instrument_type, ticker, isin");

  if (error || !instruments) throw new Error(error?.message ?? "Failed to fetch instruments");

  const today = new Date().toISOString().slice(0, 10);
  const results: PriceResult[] = [];

  // ── Split by data source ──
  const mfInstruments   = instruments.filter(i => i.instrument_type === "MF" && i.isin);
  const mfIsins         = mfInstruments.map(i => i.isin!);
  const stockInstruments = instruments.filter(i => ["Stock", "ETF"].includes(i.instrument_type ?? "") && i.ticker);
  const stockTickers    = stockInstruments.map(i => i.ticker!);

  // ── Fetch prices ──
  const [amfiMap, yahooMap] = await Promise.all([
    mfIsins.length   ? fetchAmfiPrices(mfIsins)     : Promise.resolve(new Map<string, number>()),
    stockTickers.length ? fetchYahooPrices(stockTickers) : Promise.resolve(new Map<string, number>()),
  ]);

  // ── Build updates ──
  const updates: { instrument_id: string; current_price: number; price_date: string; updated_at: string }[] = [];

  for (const inst of mfInstruments as Instrument[]) {
    const price = amfiMap.get(inst.isin!);
    if (price) {
      updates.push({ instrument_id: inst.instrument_id, current_price: price, price_date: today, updated_at: new Date().toISOString() });
      results.push({ instrument_id: inst.instrument_id, name: inst.name, price, source: "AMFI" });
    } else {
      results.push({ instrument_id: inst.instrument_id, name: inst.name, error: "ISIN not found in AMFI" });
    }
  }

  for (const inst of stockInstruments as Instrument[]) {
    const ticker = inst.ticker!;
    const price = yahooMap.get(ticker) ?? yahooMap.get(`${ticker}.NS`) ?? yahooMap.get(`${ticker}.BO`);
    if (price) {
      updates.push({ instrument_id: inst.instrument_id, current_price: price, price_date: today, updated_at: new Date().toISOString() });
      results.push({ instrument_id: inst.instrument_id, name: inst.name, price, source: "Yahoo Finance" });
    } else {
      results.push({ instrument_id: inst.instrument_id, name: inst.name, error: "Ticker not found on Yahoo Finance" });
    }
  }

  // Skip Bond/SGB/AIF etc. that have neither AMFI nor Yahoo coverage
  for (const inst of instruments as Instrument[]) {
    const covered = [...mfInstruments, ...stockInstruments].some(i => i.instrument_id === inst.instrument_id);
    if (!covered) {
      results.push({ instrument_id: inst.instrument_id, name: inst.name, error: "No auto-fetch source (manual update required)" });
    }
  }

  // ── Batch upsert ──
  if (updates.length) {
    const { error: upsertError } = await supabase
      .from("investment_universe")
      .upsert(updates, { onConflict: "instrument_id" });
    if (upsertError) throw new Error(upsertError.message);
  }

  return {
    updated: updates.length,
    failed: results.filter(r => r.error).length,
    total: instruments.length,
    results,
    timestamp: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const summary = await runRefresh();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const summary = await runRefresh();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
