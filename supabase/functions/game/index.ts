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

async function handleCreate(body: Record<string, unknown>) {
  const mode = body.mode === 'tournament' ? 'tournament' : 'cash';
  const hostId = String(body.hostId ?? '');
  const hostName = String(body.hostName ?? '').trim();
  if (!hostId || !hostName) return json({ error: 'Pick a nickname to get started.' }, 400);

  // Retry on the (unlikely) chance of a room-code collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeRoomCode(4);
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
      return json({ state: next, version: row.version + 1 });
    }
    // Lost the race — re-read and replay against the newer state.
  }
  return json({ error: 'The table is busy. Try that again.' }, 503);
}

async function handleFetch(body: Record<string, unknown>) {
  const code = String(body.code ?? '').toUpperCase();
  const row = await readGame(code);
  if (!row) return json({ error: "That room code doesn't exist." }, 404);
  return json({ state: row.state, version: row.version });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Not found.' }, 404);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    switch (body.op) {
      case 'create':
        return await handleCreate(body);
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
