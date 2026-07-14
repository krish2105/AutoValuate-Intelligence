-- AutoValuate — per-user saved valuations (Supabase Auth + RLS).
-- Run once in the Supabase dashboard → SQL Editor. Auth (email/password) is on by default.

create table if not exists public.valuations (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    created_at  timestamptz not null default now(),
    label       text not null,
    mid_aed     numeric not null,
    result      jsonb not null
);

create index if not exists valuations_user_created_idx on public.valuations (user_id, created_at desc);

-- Row-level security: every row is scoped to its owner; users can only see/insert/delete their own.
alter table public.valuations enable row level security;

drop policy if exists "own_select" on public.valuations;
create policy "own_select" on public.valuations for select using (auth.uid() = user_id);

drop policy if exists "own_insert" on public.valuations;
create policy "own_insert" on public.valuations for insert with check (auth.uid() = user_id);

drop policy if exists "own_delete" on public.valuations;
create policy "own_delete" on public.valuations for delete using (auth.uid() = user_id);
