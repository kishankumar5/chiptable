import { ANON_KEY, FUNCTION_URL } from './supabase.ts';
import type { Command, GameState } from '../engine/types.ts';

export interface ApiResult {
  state: GameState;
  version: number;
}

/** Everything the user should ever see when a request goes wrong. */
export class FriendlyError extends Error {}

async function post<T>(body: unknown, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new FriendlyError('Oops — connection dropped.');
  } finally {
    clearTimeout(timer);
  }

  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    throw new FriendlyError(
      typeof data.error === 'string' ? data.error : "That didn't go through. Try again.",
    );
  }
  return data as T;
}

export interface CreateOptions {
  hostId: string;
  hostName: string;
  mode: 'cash' | 'tournament';
  startingStack: number;
  sb: number;
  bb: number;
  maxSeats: number;
}

export const createGame = (opts: CreateOptions) =>
  post<ApiResult & { code: string }>({ op: 'create', ...opts });

export const fetchGame = (code: string) => post<ApiResult>({ op: 'fetch', code });

export const sendCommand = (code: string, cmd: Command) =>
  post<ApiResult>({ op: 'command', code, cmd });
