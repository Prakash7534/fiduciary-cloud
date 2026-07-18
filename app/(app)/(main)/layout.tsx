// app/(app)/(main)/layout.tsx — simple sidebar for non-client-detail pages
import Link from "next/link";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <aside className="w-56 bg-white border-r border-[#CBD9DC] shrink-0 flex flex-col p-4 gap-1">
        <Link href="/clients" className="block px-3 py-2 rounded-md text-sm font-medium text-[#0F3A46] hover:bg-[#C8D8DB]">
          All Clients
        </Link>
        <Link href="/upload" className="block px-3 py-2 rounded-md text-sm font-medium text-[#0F3A46] hover:bg-[#C8D8DB]">
          Load Questionnaire
        </Link>
      </aside>
      <main className="flex-1 p-8 text-[#0F3A46] overflow-auto">{children}</main>
    </>
  );
}
