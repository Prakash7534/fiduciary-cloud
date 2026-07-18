// app/(app)/layout.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F7F9F9]">
      <header className="bg-[#0F3A46] text-white px-6 py-3 border-b-2 border-[#C39A38] flex justify-between items-center">
        <div>
          <div className="font-serif text-lg">Fiduciary First</div>
          <div className="text-[9px] tracking-wider text-[#BFD3D8] uppercase">Cloud Practice Dashboard</div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-xs text-[#BFD3D8] hover:text-white">Sign out</button>
        </form>
      </header>
      <div className="flex">
        <aside className="w-60 bg-white border-r border-[#CBD9DC] min-h-[calc(100vh-56px)] p-4 shrink-0">
          <Link href="/clients" className="block px-3 py-2 rounded-md text-sm hover:bg-[#E7EFEF]">
            Clients
          </Link>
          <Link href="/upload" className="block px-3 py-2 rounded-md text-sm hover:bg-[#E7EFEF]">
            Load Questionnaire
          </Link>
        </aside>
        <main className="flex-1 p-8 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}
