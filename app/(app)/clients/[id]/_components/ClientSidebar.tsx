"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface Item { label: string; href: string; available: boolean; }
interface Section { title: string; items: Item[]; }

export default function ClientSidebar({ clientId, clientName }: { clientId: string; clientName: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}`;

  const sections: Section[] = [
    {
      title: "CLIENT PROFILE",
      items: [
        { label: "Questionnaire",              href: `${base}/questionnaire`,  available: true },
        { label: "Personal & KYC",           href: `${base}/personal`,     available: true },
        { label: "Family",                    href: `${base}/family`,       available: true },
        { label: "Preferences & Behaviour",   href: `${base}/preferences`,  available: true },
        { label: "Estate & Compliance",       href: `${base}/estate`,       available: true },
      ],
    },
    {
      title: "OVERVIEW",
      items: [
        { label: "Risk Profile",    href: base,                        available: true },
        { label: "Financial Health",href: `${base}/financial-health`,  available: true },
        { label: "History",         href: `${base}/history`,           available: true },
        { label: "Trend Analysis",  href: `${base}/trend-analysis`,    available: true },
      ],
    },
    {
      title: "FINANCIAL DETAILS",
      items: [
        { label: "Cash Flow", href: `${base}/cash-flow`, available: true },
        { label: "Assets",    href: `${base}/assets`,    available: true },
        { label: "Live Assets", href: `${base}/live-assets`, available: true },
        { label: "Debts",     href: `${base}/debts`,     available: true },
        { label: "Insurance", href: `${base}/insurance`, available: true },
      ],
    },
    {
      title: "PLANNING",
      items: [
        { label: "Goal Calculator",    href: `${base}/goals`,          available: true },
        { label: "Goal Solver",        href: `${base}/goal-solver`,    available: true },
        { label: "Asset Allocation",   href: `${base}/asset-alloc`,    available: true },
        { label: "Suitability Matching",href:`${base}/suitability`,    available: false },
      ],
    },
    {
      title: "ACTIONS & RECORDS",
      items: [
        { label: "Advisory Report",        href: `${base}/advisory-report`, available: true },
        { label: "Portfolio Construction", href: `${base}/portfolio`,       available: true  },
        { label: "Recommendations",        href: `${base}/recommendations`, available: true },
        { label: "Documents",              href: `${base}/documents`,       available: true },
        { label: "Advisory Notes",         href: `${base}/notes`,           available: true },
      ],
    },
  ];

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    "CLIENT PROFILE": false,
    "OVERVIEW": false,
    "FINANCIAL DETAILS": false,
    "PLANNING": false,
    "ACTIONS & RECORDS": false,
  });
  const toggle = (t: string) => setCollapsed(p => ({ ...p, [t]: !p[t] }));

  const isActive = (item: Item) =>
    item.href === base ? pathname === base : pathname.startsWith(item.href);

  return (
    <aside className="w-56 bg-white border-r border-[#CBD9DC] shrink-0 flex flex-col overflow-hidden">
      {/* Back + client name */}
      <div className="px-4 pt-4 pb-3 border-b border-[#CBD9DC] shrink-0">
        <Link href="/clients" className="text-[10px] text-[#175A69] hover:underline flex items-center gap-1 mb-2">
          ← All clients
        </Link>
        <div className="font-semibold text-[#0F3A46] text-sm leading-tight">{clientName}</div>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map(sec => {
          const open = !collapsed[sec.title];
          return (
            <div key={sec.title}>
              <button
                onClick={() => toggle(sec.title)}
                className="w-full flex justify-between items-center px-4 py-1.5 text-[10px] font-bold tracking-widest text-[#175A69] uppercase hover:text-[#0F3A46] transition-colors"
              >
                {sec.title}
                <span className="text-[10px] opacity-60">{open ? "▾" : "▸"}</span>
              </button>
              {open && sec.items.map(item =>
                item.available ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block pl-6 pr-3 py-1.5 text-sm transition-colors ${
                      isActive(item)
                        ? "bg-[#0F3A46] text-white font-medium"
                        : "text-[#0F3A46] hover:bg-[#C8D8DB]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span key={item.href} className="block pl-6 pr-3 py-1.5 text-sm text-[#A8BDC3] cursor-default">
                    {item.label}
                  </span>
                )
              )}
            </div>
          );
        })}
      </nav>

      {/* Global bottom links */}
      <div className="border-t border-[#CBD9DC] p-3 shrink-0 space-y-0.5">
        <Link href="/clients" className="block px-3 py-1.5 rounded text-sm text-[#0F3A46] hover:bg-[#C8D8DB]">All Clients</Link>
        <Link href="/clients/new" className="block px-3 py-1.5 rounded text-sm text-[#0F3A46] hover:bg-[#C8D8DB]">+ New Client</Link>
        {pathname.endsWith("/questionnaire") && (
          <Link href="/upload" className="block px-3 py-1.5 rounded text-sm text-[#C39A38] font-medium hover:bg-[#FFF8EC]">Load Questionnaire</Link>
        )}
        <Link href="/investment-universe" className="block px-3 py-1.5 rounded text-sm text-[#0F3A46] hover:bg-[#C8D8DB]">Investment Universe</Link>
      </div>
    </aside>
  );
}
