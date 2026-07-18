// app/(app)/layout.tsx  — header only; each sub-layout owns its sidebar
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#DDE6E8] flex flex-col">
      <header className="bg-[#0F3A46] text-white px-6 py-3 border-b-2 border-[#C39A38] flex justify-between items-center shrink-0">
        <div>
          <div className="font-serif text-lg tracking-wide">Fiduciary First</div>
          <div className="text-[9px] tracking-widest text-[#BFD3D8] uppercase">Cloud Practice Dashboard</div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-xs text-[#BFD3D8] hover:text-white">Sign out</button>
        </form>
      </header>
      <div className="flex flex-1 min-h-0">{children}</div>
    </div>
  );
}
