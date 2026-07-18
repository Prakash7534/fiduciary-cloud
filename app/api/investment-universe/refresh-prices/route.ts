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

// ── mfapi.in: search ISIN → scheme code → latest NAV ───────────────────────
async function fetchOneMF(isin: string): Promise<number | null> {
  try {
    const searchRes = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(isin)}`, {
      cache: "no-store",
    });
    if (!searchRes.ok) return null;
    const schemes: { schemeCode: number; schemeName: string }[] = await searchRes.json();
    if (!schemes.length) return null;

    const navRes = await fetch(`https://api.mfapi.in/mf/${schemes[0].schemeCode}`, {
      cache: "no-store",
    });
    if (!navRes.ok) return null;
    const navData: { data: { date: string; nav: string }[] } = await navRes.json();
    const nav = parseFloat(navData.data?.[0]?.nav ?? "");
    return isNaN(nav) || nav <= 0 ? null : nav;
  } catch {
    return null;
  }
}

async function fetchAmfiPrices(isins: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const results = await Promise.allSettled(isins.map(isin => fetchOneMF(isin)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value != null) map.set(isins[i], r.value);
  });
  return map;
}

// ── Stooq price fetch (reliable from server IPs, no auth needed) ────────────
async function fetchOneStooq(ticker: string): Promise<number | null> {
  // Stooq uses lowercase .ns suffix for NSE stocks and ETFs
  const symbol = `${ticker.toLowerCase()}.ns`;
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    const close = parseFloat(cols[6]); // Close price
    return isNaN(close) || close <= 0 ? null : close;
  } catch {
    return null;
  }
}

async function fetchYahooPrices(tickers: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!tickers.length) return map;
  const results = await Promise.allSettled(tickers.map(t => fetchOneStooq(t)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value != null) {
      map.set(tickers[i], r.value);
    }
  });
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

  // ── Update each row individually (PK is composite instrument_id+user_id, upsert won't work) ──
  const updateErrors: string[] = [];
  console.log(`Refresh: ${updates.length} price updates to apply`);
  await Promise.all(updates.map(async u => {
    const { error: updateError } = await supabase
      .from("investment_universe")
      .update({ current_price: u.current_price, price_date: u.price_date, updated_at: u.updated_at })
      .eq("instrument_id", u.instrument_id);
    if (updateError) updateErrors.push(`${u.instrument_id}: ${updateError.message}`);
  }));
  if (updateErrors.length) console.error("Update errors:", updateErrors);

  return {
    updated: updates.length,
    failed: results.filter(r => r.error).length,
    total: instruments.length,
    results,
    timestamp: new Date().toISOString(),
    debug: {
      mfCount: mfInstruments.length,
      stockCount: stockInstruments.length,
      mfIsins,
      stockTickers,
      updateErrors,
    },
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
