"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/clients");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex bg-[#0F3A46] relative overflow-hidden">

      {/* ── Left panel — brand story ─────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] p-12 relative">

        {/* Decorative background: growth chart + grid */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {/* faint grid */}
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={"v"+i} x1={i * 70} y1="0" x2={i * 70} y2="900" stroke="#FFFFFF" strokeOpacity="0.04" />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={"h"+i} x1="0" y1={i * 70} x2="800" y2={i * 70} stroke="#FFFFFF" strokeOpacity="0.04" />
          ))}
          {/* rising area chart */}
          <path d="M0,780 C120,760 180,700 260,690 C340,680 380,610 470,580 C560,550 610,470 700,420 C750,395 780,380 800,370 L800,900 L0,900 Z"
            fill="#175A69" fillOpacity="0.55" />
          <path d="M0,830 C140,810 220,770 320,740 C420,710 500,650 600,600 C680,560 750,530 800,510 L800,900 L0,900 Z"
            fill="#C39A38" fillOpacity="0.14" />
          {/* growth line + points */}
          <path d="M0,780 C120,760 180,700 260,690 C340,680 380,610 470,580 C560,550 610,470 700,420 C750,395 780,380 800,370"
            fill="none" stroke="#C39A38" strokeWidth="2.5" strokeOpacity="0.9" />
          {[ [260,690],[470,580],[700,420] ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill="#C39A38" />
          ))}
          {/* subtle rupee watermark */}
          <text x="620" y="220" fontSize="260" fill="#FFFFFF" fillOpacity="0.03" fontFamily="serif">₹</text>
        </svg>

        {/* Brand */}
        <div className="relative z-10">
          <h1 className="font-serif text-3xl font-bold text-white">Fiduciary First</h1>
          <p className="text-xs tracking-[0.25em] text-[#C39A38] font-semibold mt-1">CLOUD PRACTICE DASHBOARD</p>
        </div>

        {/* Value proposition */}
        <div className="relative z-10 max-w-md">
          <h2 className="font-serif text-4xl text-white leading-tight">
            Advice built on <span className="text-[#C39A38]">evidence</span>,<br />
            not instinct.
          </h2>
          <p className="text-sm text-[#A0C4CE] mt-4 leading-relaxed">
            SEBI-aligned risk profiling, goal analytics, gap-based portfolio construction
            and audit-ready advisory reports — everything a fiduciary practice needs, in one place.
          </p>

          {/* Feature chips */}
          <div className="grid grid-cols-2 gap-3 mt-8">
            {[
              ["🛡", "Protect", "Risk flags, cover gaps & estate checks"],
              ["⚖", "Stabilise", "Debt, liquidity & cash-flow discipline"],
              ["📈", "Grow", "SAA-driven portfolios toward every goal"],
              ["📋", "Comply", "Reg. 16 & 17 audit trail, end to end"],
            ].map(([icon, title, sub]) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 backdrop-blur-sm">
                <p className="text-sm font-semibold text-white">{icon} {title}</p>
                <p className="text-[11px] text-[#A0C4CE] mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="relative z-10 text-[10px] text-[#5E8794]">
          Pursuant to the SEBI (Investment Advisers) Regulations, 2013 · Client data encrypted at rest
        </p>
      </div>

      {/* ── Right panel — sign in ────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[#F5F9FA] lg:rounded-l-[2.5rem] relative">
        <div className="w-full max-w-sm">

          {/* Mobile brand (hidden on desktop) */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="font-serif text-2xl font-bold text-[#0F3A46]">Fiduciary First</h1>
            <p className="text-[10px] tracking-[0.25em] text-[#C39A38] font-semibold mt-1">CLOUD PRACTICE DASHBOARD</p>
          </div>

          <div className="bg-white border border-[#CBD9DC] rounded-2xl p-8 shadow-[0_10px_40px_-12px_rgba(15,58,70,0.25)]">
            <h2 className="font-serif text-xl text-[#0F3A46] mb-1">Welcome back</h2>
            <p className="text-sm text-[#6B7E86] mb-6">Sign in to your practice dashboard</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#6B7E86] mb-1">Email</label>
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adviser@firm.in"
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#175A69] focus:ring-2 focus:ring-[#175A69]/15 transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7E86] mb-1">Password</label>
                <input
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-[#CBD9DC] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#175A69] focus:ring-2 focus:ring-[#175A69]/15 transition-shadow"
                />
              </div>
              {error && (
                <div className="bg-[#FDF2F1] border border-[#EDBBBA] rounded-lg px-3 py-2">
                  <p className="text-xs text-[#B4463C]">{error}</p>
                </div>
              )}
              <button
                type="submit" disabled={loading}
                className="w-full bg-[#0F3A46] hover:bg-[#175A69] text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60 transition-colors"
              >
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>
          </div>

          <p className="text-[11px] text-[#6B7E86] mt-6 text-center">
            🔒 Adviser access only · Client questionnaires are shared via secure links
          </p>
        </div>
      </div>
    </div>
  );
}
