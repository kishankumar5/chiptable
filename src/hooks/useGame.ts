import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import { fetchGame, sendCommand } from '../lib/api.ts';
import { GameError, reduce } from '../engine/engine.ts';
import type { Command, GameState } from '../engine/types.ts';
import { playerId } from '../lib/session.ts';

export type Connection = 'connecting' | 'live' | 'dropped' | 'missing';

/** How long to let a dropped socket try to recover before alarming anyone. */
const GRACE_MS = 4000;
/** How long without any contact before we quietly check the connection. */
const STALE_MS = 20_000;

/** Commands the app sends on its own. Their failures stay out of the player's way. */
const BACKGROUND_COMMANDS = new Set(['heartbeat', 'level-tick']);

export interface Game {
  state: GameState | null;
  connection: Connection;
  error: string | null;
  clearError: () => void;
  send: (cmd: Omit<Command, 'actor'>) => Promise<boolean>;
  reconnect: () => void;
}

/**
 * Subscribes to one game row and exposes a `send` that predicts the result
 * locally before the server confirms it. The prediction runs the exact same
 * engine the server does, so an accepted action never flickers — and a
 * rejected one is caught before it ever leaves the phone.
 */
export function useGame(code: string): Game {
  const me = playerId();
  const [state, setState] = useState<GameState | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Connection is judged by evidence, not by a single socket event. Any proof
  // that we reached the server — a realtime payload, a fetch, an accepted
  // action — means we are live, whatever the channel last reported.
  const lastContact = useRef(0);

  const markLive = useCallback(() => {
    lastContact.current = Date.now();
    setConnection((c) => (c === 'missing' ? c : 'live'));
  }, []);

  const apply = useCallback(
    (next: GameState, v: number) => {
      markLive();
      // Realtime and HTTP responses race constantly; version ordering settles it.
      if (v < version.current) return;
      version.current = v;
      setState(next);
    },
    [markLive],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetchGame(code);
      apply(res.state, res.version);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes("doesn't exist")) setConnection('missing');
      else setConnection((c) => (c === 'missing' ? c : 'dropped'));
    }
  }, [code, apply]);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void load();

    const channel = supabase
      .channel(`game:${code}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `code=eq.${code}` },
        (payload) => {
          const row = payload.new as { state?: GameState; version?: number };
          if (row?.state && typeof row.version === 'number') apply(row.state, row.version);
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          markLive();
          void load(); // catch up on anything missed while subscribing
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Sockets drop and silently re-establish all the time, especially when
          // a phone locks. Confirm we are really cut off before saying so.
          setTimeout(() => {
            if (cancelled) return;
            void load();
          }, GRACE_MS);
        }
      });

    channelRef.current = channel;
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [code, load, apply, markLive]);

  // Watchdog: if nothing has reached us for a while, quietly check in. This is
  // what clears a stale banner without the player touching anything.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastContact.current > STALE_MS) void load();
    }, STALE_MS / 2);
    return () => clearInterval(id);
  }, [load]);

  // Phone unlocked, tab refocused, wifi back — resync without a page reload.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    window.addEventListener('focus', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
      window.removeEventListener('focus', resync);
    };
  }, [load]);

  const send = useCallback(
    async (partial: Omit<Command, 'actor'>): Promise<boolean> => {
      const cmd: Command = { ...partial, actor: me } as Command;
      const before = state;
      // Housekeeping the player never asked for shouldn't interrupt them if it
      // fails — it just retries on its own schedule.
      const silent = BACKGROUND_COMMANDS.has(cmd.type);

      if (before) {
        try {
          // Optimistic paint: same rules, zero round-trip.
          setState(reduce(before, { ...cmd, now: Date.now() }));
        } catch (e) {
          if (e instanceof GameError) {
            if (!silent) setError(e.message);
            return false;
          }
        }
      }

      try {
        const res = await sendCommand(code, cmd);
        apply(res.state, res.version);
        return true;
      } catch (e) {
        if (before) setState(before); // roll the prediction back
        if (!silent) {
          setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
        }
        void load();
        return false;
      }
    },
    [code, me, state, apply, load],
  );

  return {
    state,
    connection,
    error,
    clearError: useCallback(() => setError(null), []),
    send,
    reconnect: load,
  };
}
