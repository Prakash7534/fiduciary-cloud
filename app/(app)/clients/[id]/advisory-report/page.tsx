// app/(app)/clients/[id]/advisory-report/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { analyseClient, financialPosition, scoreAnswers, yearsBetween, ALLOCATIONS, CATEGORIES } from "@/lib/riskEngine";
import type { FinancialFacts, LoanRow, InvestmentRow, RiskAnswer, GoalRow } from "@/lib/riskEngine";
import AdvisoryReportClient from "./_client";

const ALLOC_LABELS = ["Equity (domestic + international)", "Debt / Fixed income", "Gold", "Cash / Liquid"];
const ALLOC_DESC   = [
  "Diversified funds / stocks",
  "Short / medium duration funds, FDs, bonds",
  "SGB / gold funds",
  "Liquid funds / sweep FDs",
];

export default async function AdvisoryReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: client, error },
    { data: facts },
    { data: answersRaw },
    { data: loans },
    { data: investments },
    { data: goals },
    { data: firm },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("client_id", id).single(),
    supabase.from("financial_facts").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("risk_answers").select("*").eq("client_id", id),
    supabase.from("loans").select("*").eq("client_id", id),
    supabase.from("investments").select("*").eq("client_id", id),
    supabase.from("goals").select("*").eq("client_id", id),
    supabase.from("firm_settings").select("*").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle(),
  ]);

  if (error || !client) notFound();

  const answers = (answersRaw ?? []) as RiskAnswer[];
  const { cap, tol, kn } = scoreAnswers(answers);
  const total = cap + tol + kn;

  const analysis = analyseClient(
    client,
    facts as FinancialFacts | null,
    answers,
    (loans ?? []) as LoanRow[],
    (investments ?? []) as InvestmentRow[],
    (goals ?? []) as GoalRow[]
  );

  const fp = financialPosition(
    facts as FinancialFacts | null,
    (loans ?? []) as LoanRow[],
    (investments ?? []) as InvestmentRow[]
  );

  const age = yearsBetween(client.dob);
  const today = new Date().toISOString().slice(0, 10);
  const nextReview = new Date();
  nextReview.setFullYear(nextReview.getFullYear() + 1);
  const nextReviewStr = nextReview.toISOString().slice(0, 10);

  const allocIdx = analysis.govR - 1;
  const alloc = ALLOCATIONS[allocIdx];

  const fmt = (n: number | null | undefined) =>
    n != null ? `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—";

  const hasFirm = !!(firm?.advisor_name || firm?.firm_name);

  // Serialisable props for client component
  const reportData = {
    client: {
      full_name: client.full_name,
      dob: client.dob,
      age,
      gender: client.gender,
      marital_status: client.marital_status,
      occupation: client.occupation,
      pan: client.pan,
      email: client.email,
      phone: client.phone,
      dependants_detail: client.dependants_detail,
    },
    facts: {
      income_self:    facts?.income_self    ?? null,
      income_spouse:  facts?.income_spouse  ?? null,
      income_other:   facts?.income_other   ?? null,
      expenses_annual: facts?.expenses_annual ?? null,
      retirement_age: facts?.retirement_age ?? null,
    },
    scores: { cap, tol, kn, total },
    analysis: {
      finalProfile: analysis.finalProfile,
      govR: analysis.govR,
      capCategory: CATEGORIES[(analysis.capR ?? 1) - 1],
      tolCategory: CATEGORIES[(analysis.tolR ?? 1) - 1],
      yearsToRetirement: analysis.yearsToRetirement,
      flags: analysis.flags.filter(f => f.state === "bad").map(f => ({ name: f.name, why: f.why })),
    },
    fp: {
      totalAssets: fp.totalAssets,
      totalDebt: fp.totalDebt,
      netWorth: fp.netWorth,
      income: fp.income,
    },
    alloc: ALLOC_LABELS.map((l, i) => ({ label: l, pct: alloc[i], desc: ALLOC_DESC[i] })),
    goals: (goals ?? []).map((g) => ({
      goal_name: g.goal_name,
      target_year: g.target_year,
      cost_today: g.cost_today,
    })),
    firm: {
      advisor_name: firm?.advisor_name ?? null,
      firm_name: firm?.firm_name ?? null,
      sebi_regn: firm?.sebi_regn ?? null,
      address: firm?.address ?? null,
      phone: firm?.phone ?? null,
      email: firm?.email ?? null,
    },
    hasFirm,
    today,
    nextReviewStr,
    fmt_income: fmt((facts?.income_self ?? 0) + (facts?.income_spouse ?? 0) + (facts?.income_other ?? 0)) ,
    fmt_assets: fmt(fp.totalAssets),
    fmt_debt: fmt(fp.totalDebt),
    fmt_nw: fmt(fp.netWorth),
  };

  return <AdvisoryReportClient data={reportData} />;
}
