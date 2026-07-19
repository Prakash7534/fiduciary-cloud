// app/(print)/layout.tsx — isolated print layout: auth only, no chrome
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
