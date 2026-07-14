-- AutoValuate — Phase D: publicly shareable valuation reports.
-- Run once in the Supabase dashboard → SQL Editor (alongside supabase_valuations_schema.sql).
--
-- Deliberately SEPARATE from `valuations`: that table is RLS-scoped to auth.uid(), so a
-- signed-out visitor could never create or read a row. Sharing has to work for guests
-- (that is the whole point of a share link), so shared reports live in their own table
-- whose contents are public by design — the slug is the capability.

create table if not exists public.shared_valuations (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    created_at  timestamptz not null default now(),
    label       text not null,
    mid_aed     numeric not null,
    result      jsonb not null
);

create index if not exists shared_valuations_slug_idx on public.shared_valuations (slug);

alter table public.shared_valuations enable row level security;

-- Anyone (including anon) may read a shared report — knowing the slug IS the authorisation.
drop policy if exists "public_read" on public.shared_valuations;
create policy "public_read" on public.shared_valuations
    for select using (true);

-- Anyone may publish a share link (guests included). Insert-only: no anon update/delete,
-- so a published report can never be tampered with or silently swapped after the fact.
drop policy if exists "public_insert" on public.shared_valuations;
create policy "public_insert" on public.shared_valuations
    for insert with check (
        char_length(slug) between 6 and 24
        and char_length(label) <= 120
        and mid_aed >= 0
    );
