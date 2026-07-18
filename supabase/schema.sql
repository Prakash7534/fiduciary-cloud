-- ============================================================================
-- Fiduciary First — Supabase / Postgres schema
-- ============================================================================
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query) once,
-- on a fresh project. It is NOT idempotent in the same way the old SQLite
-- migrator was — for schema changes later, write a new numbered migration
-- file rather than re-running this whole script.
--
-- Design notes:
--   - Every client-owned table has a `user_id uuid references auth.users`
--     column and a Row Level Security policy restricting access to rows
--     where user_id = auth.uid(). This is what makes it safe to put on the
--     public internet — each adviser (today: just you) only ever sees their
--     own clients, even though the database itself is shared infrastructure.
--   - `investment_universe` is also scoped per-adviser (not global) so that
--     if you ever add a second adviser, each maintains their own fund list.
--     If you want a single shared universe across advisers later, that's a
--     straightforward follow-up change (drop user_id, add a role-based policy).
--   - UUIDs are used for primary keys (Supabase convention) instead of
--     SQLite's autoincrement integers.
--   - jsonb replaces the raw_data_json TEXT blob — Postgres can index and
--     query into it directly if ever needed.
-- ============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Firm-wide settings (one row per adviser)
-- ---------------------------------------------------------------------------
create table firm_settings (
    user_id           uuid primary key references auth.users(id) on delete cascade,
    advisor_name      text,
    qualification     text,
    sebi_regn         text,
    firm_name         text,
    address           text,
    phone             text,
    email             text,
    website           text,
    grievance_contact text
);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table clients (
    client_id       uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    full_name       text not null,
    email           text,
    phone           text,
    pan             text,
    dob             date,
    gender          text,
    marital_status  text,
    address         text,
    dependants      integer,
    dependants_detail text,
    employment_type text,
    occupation      text,
    employer        text,
    education       text,
    client_type     text,
    residential_status text,
    kyc_status      text,
    nationality     text,
    industry        text,
    years_exp       integer,
    career_stage    text,
    expecting_inheritance boolean,
    owns_business   boolean,
    plan_change     boolean,
    sole_earner     boolean,
    risk_override   text,
    concentration_cap numeric default 5.0,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);
create index idx_clients_user on clients(user_id);
create index idx_clients_pan on clients(user_id, pan);
create index idx_clients_name on clients(user_id, full_name);

-- ---------------------------------------------------------------------------
-- Financial facts (1:1 with client — "current" snapshot, overwritten on reload)
-- ---------------------------------------------------------------------------
create table financial_facts (
    client_id       uuid primary key references clients(client_id) on delete cascade,
    income_self numeric, income_spouse numeric, income_other numeric,
    household_income_type text, var_pay text,
    expenses_annual numeric, life_cover numeric, health_cover numeric,
    house_value numeric, prop_value numeric, prop_count text, property_plan text,
    rental_income numeric, rent_monthly numeric, current_residence text,
    emi_default text,
    retirement_age integer, ret_expenses numeric, ret_pension numeric,
    income_growth_pct text, large_inflows text, large_expenses text,
    medical_commitments text, adviser_notes_misc text, epf_nps_corpus numeric,
    sec80c numeric, sec80d numeric, capital_gains text, foreign_assets text,
    employer_cover numeric, covers_held text, nominees_updated text,
    current_adviser text, reason_for_investing text, review_freq text,
    style_pref text, esg_pref text, intl_pref text, sector_pref text,
    will_status text, trust_status text, poa_status text, guardian_status text,
    fatca text, pep text, source_wealth text, source_funds text,
    invest_mode text, surplus_arises text, decision_maker text,
    monitor_frequency text, past_experience text,
    most_important_goal text, restrictions text,
    goal_types text,
    goal_rank1 text, goal_rank2 text, goal_rank3 text,
    retirement_house_status text, retirement_dependants text,
    education_funding text, surplus_shortfall_pref text,
    goalwise_bucketing text, investment_horizon text, income_need text,
    withdrawal_3yr text, withdrawal_detail text
);

-- ---------------------------------------------------------------------------
-- Risk answers (19 scored questions), knowledge grid, behaviour
-- ---------------------------------------------------------------------------
create table risk_answers (
    client_id    uuid references clients(client_id) on delete cascade,
    question_num integer check (question_num between 1 and 19),
    answer       text check (answer in ('A','B','C','D','E')),
    primary key (client_id, question_num)
);

create table knowledge_grid (
    client_id    uuid references clients(client_id) on delete cascade,
    asset_class  text,
    level        text check (level in ('None','Basic','Good')),
    primary key (client_id, asset_class)
);

create table behaviour (
    client_id uuid primary key references clients(client_id) on delete cascade,
    beh1 text, beh2 text, beh3 text
);

-- ---------------------------------------------------------------------------
-- Loans, investments, goals, family
-- ---------------------------------------------------------------------------
create table loans (
    loan_id       uuid primary key default gen_random_uuid(),
    client_id     uuid references clients(client_id) on delete cascade,
    loan_type     text, lender text,
    outstanding   numeric, emi numeric, rate numeric, tenure_months integer
);

create table investments (
    inv_id      uuid primary key default gen_random_uuid(),
    client_id   uuid references clients(client_id) on delete cascade,
    asset_class text,
    value       numeric, monthly_sip numeric
);

create table goals (
    goal_id     uuid primary key default gen_random_uuid(),
    client_id   uuid references clients(client_id) on delete cascade,
    goal_name   text, target_year integer, cost_today numeric,
    saved numeric, monthly_sip numeric, priority text, flexibility text,
    inflation_pct numeric default 6.0, return_pct numeric default 10.0
);

create table family_members (
    fam_id      uuid primary key default gen_random_uuid(),
    client_id   uuid references clients(client_id) on delete cascade,
    name text, relationship text, age integer, occupation text,
    annual_income numeric, health_status text
);

-- ---------------------------------------------------------------------------
-- Investment universe (per-adviser fund/product list)
-- ---------------------------------------------------------------------------
create table investment_universe (
    instrument_id text not null,
    user_id       uuid not null references auth.users(id) on delete cascade,
    name text, category text, asset_class text, sub_bucket text,
    risk_level text, expense_ratio numeric, return_3y numeric, return_5y numeric,
    min_sip numeric, liquidity text, taxation text,
    esg boolean, international boolean, min_knowledge text, notes text,
    primary key (user_id, instrument_id)
);

-- ---------------------------------------------------------------------------
-- Portfolio holdings, recommendation log, advisor notes
-- ---------------------------------------------------------------------------
create table portfolio_holdings (
    holding_id      uuid primary key default gen_random_uuid(),
    client_id       uuid references clients(client_id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    instrument_id   text,
    custom_name     text,
    allocation_pct  numeric,
    current_value   numeric,
    value_updated_at timestamptz,
    rationale       text,
    source_reco_id  uuid,
    added_at        timestamptz default now(),
    foreign key (user_id, instrument_id) references investment_universe(user_id, instrument_id)
);

create table recommendation_log (
    reco_id     uuid primary key default gen_random_uuid(),
    client_id   uuid references clients(client_id) on delete cascade,
    sent_at     timestamptz,
    scrip       text, price_range text, position_pct numeric,
    channel text, conflict_disclosed text, outcome text, rationale text,
    key_risk    text,
    goal_note   text,
    accepted_pct numeric,
    response_date timestamptz,
    response_note text
);

alter table portfolio_holdings
    add constraint fk_source_reco foreign key (source_reco_id) references recommendation_log(reco_id);

create table advisor_notes (
    note_id     uuid primary key default gen_random_uuid(),
    client_id   uuid references clients(client_id) on delete cascade,
    note_date   timestamptz default now(),
    note_text   text
);

create table report_notes (
    client_id       uuid primary key references clients(client_id) on delete cascade,
    what_it_means   text,
    why_this_mix    text,
    deployment_plan text,
    conflicts       text,
    additional_comments text,
    next_review_date date,
    updated_at      timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Snapshots — the append-only history layer. Never overwritten.
-- ---------------------------------------------------------------------------
create table snapshots (
    snapshot_id     uuid primary key default gen_random_uuid(),
    client_id       uuid references clients(client_id) on delete cascade,
    snapshot_date   timestamptz default now(),
    source_note     text,
    capacity_score integer, tolerance_score integer, knowledge_score integer, total_score integer,
    final_profile   text, answered_count integer,
    income numeric, total_assets numeric, total_debt numeric, net_worth numeric,
    years_to_retirement integer,
    red_flag_count  integer,
    raw_data        jsonb
);
create index idx_snapshots_client on snapshots(client_id, snapshot_date desc);

-- ============================================================================
-- Row Level Security — every table scoped so an adviser only sees their own
-- clients' data. This is the core of making a cloud-hosted version safe.
-- ============================================================================

alter table firm_settings enable row level security;
create policy "own firm settings" on firm_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table clients enable row level security;
create policy "own clients" on clients for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table investment_universe enable row level security;
create policy "own universe" on investment_universe for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table portfolio_holdings enable row level security;
create policy "own holdings" on portfolio_holdings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tables without their own user_id: scope via a join back to clients.user_id.
-- Postgres RLS supports subqueries in USING clauses.
alter table financial_facts enable row level security;
create policy "own facts" on financial_facts for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table risk_answers enable row level security;
create policy "own answers" on risk_answers for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table knowledge_grid enable row level security;
create policy "own knowledge" on knowledge_grid for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table behaviour enable row level security;
create policy "own behaviour" on behaviour for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table loans enable row level security;
create policy "own loans" on loans for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table investments enable row level security;
create policy "own investments" on investments for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table goals enable row level security;
create policy "own goals" on goals for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table family_members enable row level security;
create policy "own family" on family_members for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table recommendation_log enable row level security;
create policy "own recommendations" on recommendation_log for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table advisor_notes enable row level security;
create policy "own notes" on advisor_notes for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table report_notes enable row level security;
create policy "own report notes" on report_notes for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

alter table snapshots enable row level security;
create policy "own snapshots" on snapshots for all
    using (client_id in (select client_id from clients where user_id = auth.uid()));

-- ============================================================================
-- Seed data: sample Investment Universe (illustrative only — see warning in app)
-- Run this AFTER you've signed up and know your own auth.uid(). Replace
-- 'YOUR_USER_ID' below, or seed this via the app's own "Load sample data"
-- action instead (simpler — see supabase/seed_universe.sql).
-- ============================================================================
-- (Intentionally left as a separate seed_universe.sql — see that file.)
