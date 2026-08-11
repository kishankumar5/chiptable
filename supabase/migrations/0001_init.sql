-- ChipTable schema.
--
-- One row per game. `state` holds the full authoritative game state as JSONB
-- and `version` powers optimistic concurrency: the Edge Function only writes
-- when the version it read is still the current one, so two players acting at
-- the same instant can never both win the race.

create extension if not exists pgcrypto;

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  state       jsonb not null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists games_code_idx on public.games (code);
create index if not exists games_updated_at_idx on public.games (updated_at);

-- Realtime needs the old record around so clients can diff reliably.
alter table public.games replica identity full;

alter table public.games enable row level security;

-- Anyone with a room code may READ the table state. Nobody may write directly:
-- every mutation goes through the Edge Function using the service role key,
-- which bypasses RLS. That is what makes the server authoritative.
drop policy if exists "read games" on public.games;
create policy "read games"
  on public.games for select
  to anon, authenticated
  using (true);

-- Publish the table for Supabase Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end
$$;

-- Housekeeping: drop games nobody has touched in 24 hours.
create or replace function public.cleanup_stale_games()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.games where updated_at < now() - interval '24 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.cleanup_stale_games() from public, anon, authenticated;

-- If pg_cron is enabled on your project, schedule the sweep hourly:
--   select cron.schedule('chiptable-cleanup', '0 * * * *',
--                        $$select public.cleanup_stale_games()$$);
