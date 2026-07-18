import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Call this fresh in every Server Component / Route Handler / Server Action —
// it reads the current request's cookies to know who's logged in. Never cache
// or reuse a single instance across requests.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component (not a Route Handler / Action) —
            // safe to ignore since middleware refreshes the session on every request.
          }
        },
      },
    }
  );
}
