-- Public-launch hardening.
--
-- Run this ONLY AFTER deploying the Edge Function that broadcasts state
-- (supabase/functions/game). Until that function is live, clients still learn
-- about changes by watching this table, and revoking the read policy first
-- would leave them silent.
--
-- Before: the public key could list every game and read every player's
-- nickname and stack. After: the table is not readable by anyone except the
-- server, and knowing the room code is the only way in.

-- 1. No more public reads.
drop policy if exists "read games" on public.games;

-- Realtime no longer needs this table published: the server pushes state to a
-- channel named after the room code instead of clients tailing the row.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'games'
  ) then
    alter publication supabase_realtime drop table public.games;
  end if;
end
$$;

-- 2. Keep the database from growing forever. Requires the pg_cron extension:
--    Dashboard -> Database -> Extensions -> enable "pg_cron".
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('chiptable-cleanup')
      where exists (select 1 from cron.job where jobname = 'chiptable-cleanup');
    perform cron.schedule(
      'chiptable-cleanup',
      '17 * * * *',
      $cron$select public.cleanup_stale_games()$cron$
    );
  else
    raise notice 'pg_cron is not enabled — enable it to sweep stale games hourly.';
  end if;
end
$$;

-- 3. Sweep once right now so today's abandoned tables go immediately.
select public.cleanup_stale_games() as games_removed;
