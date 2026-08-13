-- A rate limiter that survives the function going cold.
--
-- The first attempt counted in the Edge Function's memory. Supabase spreads
-- requests across isolates, so in practice the counter almost never saw the
-- same instance twice and the limit never fired. Counting in the database is
-- the only place the count is actually shared.

create table if not exists public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  count         integer not null default 0
);

alter table public.rate_limits enable row level security;
-- No policies: only the service role touches this table.

/**
 * Count one hit against `p_key` and say whether it is still allowed.
 * The window is fixed-length and restarts once it has fully elapsed.
 */
create or replace function public.bump_rate(
  p_key     text,
  p_limit   integer,
  p_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set
      -- Reset the window if the old one has expired, otherwise keep counting.
      window_start = case
        when r.window_start < now() - make_interval(secs => p_seconds) then now()
        else r.window_start
      end,
      count = case
        when r.window_start < now() - make_interval(secs => p_seconds) then 1
        else r.count + 1
      end
  returning count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.bump_rate(text, integer, integer) from public, anon, authenticated;

-- Keep the table small: drop rows nobody has touched in a day.
create or replace function public.cleanup_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

revoke all on function public.cleanup_rate_limits() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('chiptable-rate-cleanup')
      where exists (select 1 from cron.job where jobname = 'chiptable-rate-cleanup');
    perform cron.schedule(
      'chiptable-rate-cleanup',
      '41 3 * * *',
      $cron$select public.cleanup_rate_limits()$cron$
    );
  end if;
end
$$;
