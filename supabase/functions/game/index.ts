// The authoritative server. Every mutation in ChipTable lands here.
//
// The browser never writes to the database (RLS forbids it). It sends a
// command, this function re-reads the row, replays the command through the
// shared engine, and writes back only if the version it read is still current.
// That single check is what stops two players acting at the same moment from
// both being applied.

import {
  createGame,
  GameError,
  makeRoomCode,
  reduce,
} from '../../../src/engine/engine.ts';
import type { BlindLevel, Command, GameState } from '../../../src/engine/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REST = `${SUPABASE_URL}/rest/v1/games`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const headers = (extra: Record<string, string> = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

interface Row {
  code: string;
  state: GameState;
  version: number;
}

/* ------------------------------------------------------------------ */
/* Pushing state to the table                                          */
/* ------------------------------------------------------------------ */

/**
 * Push the new state to everyone sitting at this table.
 *
 * Players used to watch the database row directly, which meant the public key
 * needed read access to every game. Now the server pushes to a channel named
 * after the room code, so nothing is readable without knowing that code.
 * A failure here is not fatal — clients re-fetch on their own.
 */
async function publish(code: string, state: GameState, version: number) {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        messages: [{ topic: `game:${code}`, event: 'state', payload: { state, version } }],
      }),
    });
  } catch {
    /* the watchdog on each client will notice and catch up */
  }
}

/* ------------------------------------------------------------------ */
/* Abuse limits                                                        */
/* ------------------------------------------------------------------ */

const CREATE_LIMIT = 12;
const CREATE_WINDOW_SECONDS = 60 * 60;

/**
 * Per-address throttle on making new tables, counted in the database.
 *
 * An in-memory counter was useless here: requests are spread across isolates,
 * so each one saw a fresh, empty map and the limit never fired. Postgres is
 * the only shared place to keep the tally.
 *
 * Fails open — if the limiter itself is broken, people can still play.
 */
async function mayCreate(ip: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_rate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        p_key: `create:${ip}`,
        p_limit: CREATE_LIMIT,
        p_seconds: CREATE_WINDOW_SECONDS,
      }),
    });
    if (!res.ok) return true;
    return (await res.json()) !== false;
  } catch {
    return true;
  }
}

const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

async function readGame(code: string): Promise<Row | null> {
  const res = await fetch(`${REST}?code=eq.${encodeURIComponent(code)}&select=code,state,version`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`read failed: ${res.status}`);
  const rows = (await res.json()) as Row[];
  return rows[0] ?? null;
}

/** Conditional write. Returns false when someone else got there first. */
async function writeGame(code: string, version: number, state: GameState): Promise<boolean> {
  const res = await fetch(
    `${REST}?code=eq.${encodeURIComponent(code)}&version=eq.${version}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        state,
        version: version + 1,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) throw new Error(`write failed: ${res.status}`);
  const rows = (await res.json()) as Row[];
  return rows.length > 0;
}

async function handleCreate(body: Record<string, unknown>, ip: string) {
  const mode = body.mode === 'tournament' ? 'tournament' : 'cash';
  const hostId = String(body.hostId ?? '');
  const hostName = String(body.hostName ?? '').trim();
  if (!hostId || !hostName) return json({ error: 'Pick a nickname to get started.' }, 400);
  if (!(await mayCreate(ip))) {
    return json({ error: "That's a lot of tables. Take a breath and try again shortly." }, 429);
  }

  // Retry on the (unlikely) chance of a room-code collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    // Six characters: short enough to read aloud, long enough that nobody is
    // going to stumble into your game by guessing.
    const code = makeRoomCode(6);
    let state: GameState;
    try {
      state = createGame({
        code,
        hostId,
        hostName,
        mode,
        startingStack: Number(body.startingStack ?? 1000),
        sb: Number(body.sb ?? 5),
        bb: Number(body.bb ?? 10),
        ante: Number(body.ante ?? 0),
        maxSeats: Number(body.maxSeats ?? 9),
        levels: Array.isArray(body.levels) ? (body.levels as BlindLevel[]) : undefined,
        now: Date.now(),
      });
    } catch (e) {
      return json({ error: e instanceof GameError ? e.message : 'Could not create that game.' }, 400);
    }

    const res = await fetch(REST, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ code, state, version: 1 }),
    });
    if (res.status === 409) continue; // code already taken
    if (!res.ok) return json({ error: 'Could not create that game.' }, 500);
    const rows = (await res.json()) as Row[];
    await publish(code, rows[0].state, rows[0].version);
    return json({ code, state: rows[0].state, version: rows[0].version });
  }
  return json({ error: 'Could not create that game. Try again.' }, 500);
}

async function handleCommand(body: Record<string, unknown>) {
  const code = String(body.code ?? '').toUpperCase();
  const cmd = body.cmd as Command | undefined;
  if (!code || !cmd?.type || !cmd?.actor) return json({ error: 'Malformed request.' }, 400);

  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readGame(code);
    if (!row) return json({ error: "That room code doesn't exist." }, 404);

    let next: GameState;
    try {
      // The server stamps the clock — never the client.
      next = reduce(row.state, { ...cmd, now: Date.now() });
    } catch (e) {
      if (e instanceof GameError) return json({ error: e.message, state: row.state, version: row.version }, 409);
      throw e;
    }

    if (await writeGame(code, row.version, next)) {
      await publish(code, next, row.version + 1);
      return json({ state: next, version: row.version + 1 });
    }
    // Lost the race — re-read and replay against the newer state.
  }
  return json({ error: 'The table is busy. Try that again.' }, 503);
}

async function handleFetch(body: Record<string, unknown>) {
  const code = String(body.code ?? '').toUpperCase();
  // Knowing the room code is what grants access — nothing is listable.
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return json({ error: "That room code doesn't exist." }, 404);
  const row = await readGame(code);
  if (!row) return json({ error: "That room code doesn't exist." }, 404);
  return json({ state: row.state, version: row.version });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Not found.' }, 404);

  try {
    // A game state is a few kilobytes; anything larger is not a real request.
    const raw = await req.text();
    if (raw.length > 20_000) return json({ error: 'That request was too large.' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;

    switch (body.op) {
      case 'create':
        return await handleCreate(body, clientIp(req));
      case 'command':
        return await handleCommand(body);
      case 'fetch':
        return await handleFetch(body);
      default:
        return json({ error: 'Unknown request.' }, 400);
    }
  } catch (_e) {
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
});
