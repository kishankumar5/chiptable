# ChipTable ♠

**Your cards. Our chips.**

A virtual poker chip manager for people playing with a real deck. ChipTable does
not deal cards or decide who wins — you do that around the table. It replaces
the chips: stacks, bets, blinds, pots, side pots, rebuys and the final
settlement, synced live to everyone's phone.

No accounts. No downloads. Create a game, share a four-character room code, play.

---

## Contents

1. [Install](#1-install)
2. [Configure Supabase](#2-configure-supabase)
3. [Environment variables](#3-environment-variables)
4. [Create the database tables](#4-create-the-database-tables)
5. [Enable Realtime](#5-enable-realtime)
6. [Run locally](#6-run-locally)
7. [Deploy](#7-deploy)
8. [How it works](#how-it-works)
9. [Tests](#tests)

---

## 1. Install

Requires Node 18 or newer.

```bash
npm install
```

## 2. Configure Supabase

Create a free project at [supabase.com](https://supabase.com), then install the
CLI (used to deploy the Edge Function):

```bash
npm install -g supabase
```

Log in and link this folder to your project — you can find the project ref in
your Supabase dashboard URL:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

## 3. Environment variables

Copy the example file and fill it in from **Project Settings → API** in the
Supabase dashboard:

```bash
cp .env.example .env
```

| Variable                 | Where to find it                            |
| ------------------------ | ------------------------------------------- |
| `VITE_SUPABASE_URL`      | Project Settings → API → Project URL        |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon` public key  |

Both are safe to ship in the browser bundle. The `anon` key can only *read*
game rows — see [How it works](#how-it-works).

The **service role key** is never used by the browser. The Edge Function reads
it from the environment Supabase provides automatically, so there is nothing to
configure for it.

## 4. Create the database tables

Apply the migration:

```bash
supabase db push
```

Or paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
into the dashboard's SQL editor and run it. It creates:

- the `games` table (`code`, `state` JSONB, `version`, timestamps)
- row-level security: **read-only** for the `anon` key, no client writes at all
- the Realtime publication
- `cleanup_stale_games()`, which deletes games untouched for 24 hours

To sweep automatically, enable the `pg_cron` extension and schedule it:

```sql
select cron.schedule('chiptable-cleanup', '0 * * * *',
                     $$select public.cleanup_stale_games()$$);
```

Without `pg_cron`, call `cleanup_stale_games()` from any scheduler you like —
nothing else depends on it.

Then deploy the Edge Function that owns every write:

```bash
supabase functions deploy game
```

## 5. Enable Realtime

The migration already runs
`alter publication supabase_realtime add table public.games`, which is all
Realtime needs. To confirm, open **Database → Replication** in the dashboard and
check that `games` is included in the `supabase_realtime` publication.

If you created the table by hand, also run:

```sql
alter table public.games replica identity full;
```

## 6. Run locally

```bash
npm run dev
```

Open http://localhost:5173. To try multiplayer on one machine, open the room
link in a second **private/incognito** window — player identity is a random id
in `localStorage`, so a normal second tab would rejoin as the same person.

There is also a backend-free sandbox for working on the table UI:

```
http://localhost:5173/preview.html
```

It runs the real table against the real rules engine entirely in memory, with a
toolbar to switch between 2/4/6/9 players and act as any seat. It is dev-only
and is not part of the production build.

## 7. Deploy

The app is a static bundle plus one Edge Function.

```bash
npm run build     # outputs dist/
```

**Vercel** — import the repo, set the two `VITE_` environment variables, and
deploy. [`vercel.json`](vercel.json) already rewrites all routes to
`index.html` so shared links like `/g/K7PX` work.

**Netlify** — build command `npm run build`, publish directory `dist`, same two
environment variables. [`public/_redirects`](public/_redirects) handles routing.

Deploy the function once per project (it is independent of the frontend host):

```bash
supabase functions deploy game
```

---

## How it works

### The server is authoritative

Clients never write to the database. RLS grants the `anon` key `select` only.
Every action — join, bet, fold, award, rebuy, host controls — is a command
posted to the `game` Edge Function, which:

1. reads the current row,
2. replays the command through the shared rules engine,
3. writes back **only if the version it read is still current**.

That version check is a compare-and-swap. Two players acting at the same instant
cannot both be applied: the loser is re-read and replayed against the newer
state. Nothing can create chips, bet more than a stack, act out of turn, pay a
pot twice, or run a host-only command without being the host — the engine
rejects it and the row never changes.

### One engine, two runtimes

[`src/engine/engine.ts`](src/engine/engine.ts) is a pure
`reduce(state, command) => state`. The Edge Function imports it for the
authoritative write; the browser imports the same file to predict the result
instantly. Because both sides run identical rules, an accepted action never
flickers, and an invalid one is caught before it leaves the phone. If the server
ever disagrees, its answer wins and the local prediction is rolled back.

### Reconnecting

Player identity is a UUID in `localStorage`. Locking the phone, losing wifi,
refreshing, or reopening the link all resolve to the same player, who gets their
seat and stack back. The app re-syncs on focus, on `visibilitychange`, and on
`online` — never by reloading the page.

### Project layout

```
src/
  engine/       rules + types (shared with the Edge Function)
  hooks/        realtime subscription and optimistic send
  lib/          supabase client, api, session id, sound, chips, sharing
  components/   table furniture: seats, chips, action bar, sheets
  screens/      landing, create, join, table
supabase/
  migrations/   SQL schema
  functions/    the authoritative write path
tests/          engine tests
```

## Tests

```bash
npm test
```

24 tests covering blind posting, turn order, heads-up rules, minimum raises,
under-sized all-ins, dead money from folded players, main and side pots with
mixed all-in sizes, split pots and the odd chip, refused partial payouts,
rebuys, host permissions, host takeover, reconnecting, a full nine-handed hand,
and the tournament clock. Several assert that chips are conserved — no hand can
create or destroy a chip, and the cash settlement always sums to zero.

```bash
npm run typecheck   # strict TypeScript, no `any` escapes
npm run build       # production bundle
```
