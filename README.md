# Fiduciary First — Cloud Edition

Next.js (App Router) + Supabase (Postgres + Auth) + Vercel. This replaces the
local Flask/SQLite app with a real, internet-accessible, authenticated version
of the same tool.

## What's actually built and tested here

- **Full Postgres schema** (`supabase/schema.sql`) — every table from the
  Flask app, translated to Postgres types, with Row Level Security so each
  adviser only ever sees their own clients. **I ran this against a real local
  Postgres instance and verified RLS actually isolates two simulated advisers
  from each other** — not just written, tested.
- **Auth** — email/password login via Supabase Auth, session refresh via
  `proxy.ts` (Next.js 16's replacement for `middleware.ts`), every route
  under `(app)/` requires login.
- **Risk scoring engine** (`lib/riskEngine.ts`) — faithful TypeScript port of
  `risk_engine.py`: scoring, profile determination, all 14 red flags, goal
  math. Type-checks cleanly, same formulas as the Python version.
- **PDF extraction** (`lib/pdfExtract.ts`) — reads the same fillable
  questionnaire PDF using `pdf-lib`, mapping the core Section A/B fields, the
  19 risk answers, loans, investments, goals, and family — same field names
  as the Flask app's `db_loader.py`.
- **Working pages**: Login, Client list (with live-computed profile + flag
  count per client), Client Risk Profile detail (scores, profile
  determination, red flags, goal funding), Upload flow.
- **History preserved automatically** — every upload writes an immutable
  snapshot row, same principle as the Flask app's `snapshots` table.
- Full production build verified (`npm run build` succeeds, all routes
  compile, zero TypeScript errors).

## What's NOT ported yet (see Roadmap below)

Financial Health, Cash Flow, Assets, Debts, Insurance, Goal Calculator,
Goal Solver, Asset Allocation Engine, Suitability Matching, Portfolio
Construction, Recommendation Log, Advisor Notes, Trend Analysis, Personal/
Family/Preferences/Estate pages, Advisory Report, Firm Settings, Investment
Universe browser, the ambiguous-match confirmation UI. All of the *logic* for
most of these already exists in `risk_engine.py` / `app.py` and just needs
the same mechanical translation pattern used for what's here — see Roadmap.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project.
2. Once it's provisioned, go to **SQL Editor** → New query, paste the entire
   contents of `supabase/schema.sql`, and run it. This creates every table
   and RLS policy in one shot.
3. Go to **Authentication → Providers** and confirm Email is enabled. Go to
   **Authentication → Users** → Add user → create yourself an account
   (email + password) — this is how you'll log into the app.
4. Go to **Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Configure the app

```
cp .env.local.example .env.local
```

Paste your Project URL and anon key into `.env.local`.

## 3. Run it locally first

```
npm install
npm run dev
```

Open `http://localhost:3000`, log in with the account you created in
Supabase, and try uploading a sample questionnaire PDF.

## 4. Seed the Investment Universe (optional, for when Portfolio Construction is ported)

Not yet needed for the current working pages — skip this until you port that
page, then insert rows into `investment_universe` with your own `user_id`
via the SQL Editor or a small seed script, same sample data as the Flask
version's `create_database.py`.

## 5. Deploy to Vercel

1. Push this project to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new), import that repo.
3. In the import screen, add the same two environment variables
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) under
   **Environment Variables**.
4. Deploy. Vercel auto-detects Next.js — no build config needed.
5. Every future `git push` to your main branch auto-redeploys.

That's it — you now have a real URL, reachable from anywhere, backed by a
real Postgres database, with proper login.

---

## Roadmap — porting the remaining pages

Every remaining page follows the same three-step pattern used for the pages
already built:

1. **Extend `lib/riskEngine.ts`** with the equivalent function from
   `risk_engine.py` (e.g. `financial_position()`, `assetAllocationEngine()`,
   `suitabilityMatch()`, `goalSolver()`) — these are pure functions, so the
   port is mechanical: same math, TypeScript syntax instead of Python.
2. **Add a Server Component page** under `app/(app)/clients/[id]/<page>/page.tsx`
   that fetches the needed tables from Supabase and calls the engine
   function, same pattern as `clients/[id]/page.tsx`.
3. **For pages with forms** (Advisor Notes, Recommendation Log, Portfolio
   Construction), add a Server Action or a Route Handler under `app/api/`
   for the POST — same pattern as `app/api/upload/route.ts`.

Suggested order, roughly matching value delivered per page:

1. **Financial Health + Cash Flow + Assets + Debts + Insurance** — all read
   from tables already being populated by the upload pipeline; these are
   the fastest wins since no new data flow is needed, just new views.
2. **Goal Calculator + Goal Solver** — `goalCalc()` is already ported;
   `goalSolver()`'s bisection logic translates directly.
3. **Asset Allocation Engine + Suitability Matching** — needs
   `investment_universe` seeded first (see step 4 above).
4. **Portfolio Construction + Recommendation Log** — these two need to stay
   linked (the "Add to Portfolio" one-click flow) exactly as in the Flask
   version — port them together, not separately.
5. **Advisor Notes, Firm Settings, Advisory Report** — mostly straightforward
   forms/views once the above exist.
6. **Trend Analysis** — needs an SVG or lightweight charting approach;
   `recharts` (already available if you want a React charting library) is a
   more natural fit here than hand-rolled SVG now that you're in React.
7. **The ambiguous-match confirmation page** — the `/api/upload` route
   already detects and reports this case (returns HTTP 409 with candidate
   info); it just needs a proper confirmation UI instead of the current
   plain error message, mirroring the Flask app's `/upload/confirm` page.

## A note on what changed in the underlying platform

While building this, Next.js 16 turned out to have just deprecated
`middleware.ts` in favor of `proxy.ts` — a real behavioral change (old file
convention still works today but is being removed), not cosmetic. This repo
already uses the new convention.
