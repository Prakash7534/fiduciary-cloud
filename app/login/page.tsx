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
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/clients");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F9F9]">
      <div className="w-full max-w-sm bg-white border border-[#CBD9DC] rounded-xl p-8">
        <h1 className="font-serif text-2xl text-[#0F3A46] mb-1">Fiduciary First</h1>
        <p className="text-sm text-[#6B7E86] mb-6">Sign in to your practice dashboard</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#6B7E86] mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7E86] mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#CBD9DC] rounded-md px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-[#B4463C]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C39A38] text-[#0F3A46] font-medium rounded-md py-2 text-sm disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-[#6B7E86] mt-6">
          First time? Create your account in the Supabase dashboard, or enable
          self-signup in Authentication settings.
        </p>
      </div>
    </div>
  );
}
