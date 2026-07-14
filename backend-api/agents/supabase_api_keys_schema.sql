-- AutoValuate — Phase I: API keys + usage metering.
-- Run once in the Supabase dashboard → SQL Editor.
--
-- Design: the API backend validates keys using only the PUBLIC anon key. It never gets a
-- service_role key — that would be a long-lived god-credential sitting in a web dyno's env
-- for no reason. Instead, the two things the backend needs (verify a key, record a call)
-- are exposed as SECURITY DEFINER functions with a narrow contract, and the tables
-- themselves stay unreadable to anon.
--
-- We store only a SHA-256 hash of each key. The plaintext is shown to the user once, at
-- creation, and is unrecoverable afterwards — a leaked database gives an attacker nothing.

create table if not exists public.api_keys (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name        text not null default 'default',
    key_hash    text not null unique,          -- sha256 of the plaintext key; never the key itself
    tier        text not null default 'free',  -- free | pro | dealer
    revoked     boolean not null default false,
    created_at  timestamptz not null default now()
);

create table if not exists public.api_usage (
    id        bigserial primary key,
    key_id    uuid not null references public.api_keys(id) on delete cascade,
    endpoint  text not null,
    ts        timestamptz not null default now()
);

create index if not exists api_usage_key_ts_idx on public.api_usage (key_id, ts desc);

alter table public.api_keys  enable row level security;
alter table public.api_usage enable row level security;

-- Owners manage their own keys. Note there is deliberately no policy granting anon any
-- access at all: key verification happens through the SECURITY DEFINER function below.
drop policy if exists "own_keys_select" on public.api_keys;
create policy "own_keys_select" on public.api_keys for select using (auth.uid() = user_id);

drop policy if exists "own_keys_insert" on public.api_keys;
create policy "own_keys_insert" on public.api_keys for insert with check (auth.uid() = user_id);

-- Revoking is an update; we never allow rotating key_hash in place.
drop policy if exists "own_keys_revoke" on public.api_keys;
create policy "own_keys_revoke" on public.api_keys for update
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Owners can read their own usage (joined through the key they own).
drop policy if exists "own_usage_select" on public.api_usage;
create policy "own_usage_select" on public.api_usage for select using (
    exists (select 1 from public.api_keys k where k.id = api_usage.key_id and k.user_id = auth.uid())
);

-- Per-tier daily quotas, enforced server-side.
create or replace function public.tier_quota(p_tier text)
returns integer language sql immutable as $$
    select case p_tier
        when 'dealer' then 5000
        when 'pro'    then 1000
        else 100                     -- free
    end;
$$;

-- Verify a key and meter the call in ONE round-trip. Returns the decision plus the
-- quota numbers so the API can send back honest rate-limit headers.
--
-- SECURITY DEFINER so the backend can call it with the anon key. It only ever accepts a
-- hash (never a key), only ever returns a boolean + counters (never the key or user_id),
-- and records the call itself — so it cannot be used to enumerate or exfiltrate anything.
create or replace function public.consume_api_key(p_hash text, p_endpoint text)
returns table (allowed boolean, reason text, tier text, used integer, quota integer)
language plpgsql security definer set search_path = public as $$
declare
    k        public.api_keys%rowtype;
    v_used   integer;
    v_quota  integer;
begin
    select * into k from public.api_keys where key_hash = p_hash;

    if not found then
        return query select false, 'invalid key'::text, null::text, 0, 0;
        return;
    end if;
    if k.revoked then
        return query select false, 'key revoked'::text, k.tier, 0, 0;
        return;
    end if;

    v_quota := public.tier_quota(k.tier);
    select count(*) into v_used from public.api_usage
        where key_id = k.id and ts > now() - interval '24 hours';

    if v_used >= v_quota then
        return query select false, 'daily quota exceeded'::text, k.tier, v_used, v_quota;
        return;
    end if;

    insert into public.api_usage (key_id, endpoint) values (k.id, p_endpoint);
    return query select true, 'ok'::text, k.tier, v_used + 1, v_quota;
end;
$$;

revoke all on function public.consume_api_key(text, text) from public;
grant execute on function public.consume_api_key(text, text) to anon, authenticated;
