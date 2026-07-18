// app/(app)/clients/[id]/_components/ClientTabNav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Risk Profile", suffix: "" },
  { label: "Financial Health", suffix: "/financial-health" },
  { label: "Cash Flow", suffix: "/cash-flow" },
  { label: "Assets", suffix: "/assets" },
  { label: "Debts", suffix: "/debts" },
  { label: "Insurance", suffix: "/insurance" },
];

export default function ClientTabNav({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-0.5 mb-6 border-b border-[#CBD9DC]">
      {TABS.map((t) => {
        const href = `/clients/${clientId}${t.suffix}`;
        const isActive =
          t.suffix === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={t.suffix}
            href={href}
            className={`px-3 py-2 text-sm rounded-t-md transition-colors border-b-2 -mb-px ${
              isActive
                ? "border-[#175A69] text-[#0F3A46] font-semibold bg-white"
                : "border-transparent text-[#175A69] hover:bg-[#E7EFEF]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
