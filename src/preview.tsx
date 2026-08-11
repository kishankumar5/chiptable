// Dev-only sandbox: the real table UI driven by the real engine, entirely in
// memory. No Supabase, no network. Open http://localhost:5173/preview.html
//
// Vite only builds index.html for production, so none of this ships.

import { StrictMode, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TableView } from './screens/TableView.tsx';
import { createGame, GameError, reduce } from './engine/engine.ts';
import type { Command, GameState } from './engine/types.ts';
import type { Game } from './hooks/useGame.ts';
import './index.css';

const HOST = 'host';

function build(count: number, mode: 'cash' | 'tournament'): GameState {
  let s = createGame({
    code: 'K7PX',
    hostId: HOST,
    hostName: 'Alex',
    mode,
    startingStack: 1000,
    sb: 5,
    bb: 10,
    maxSeats: count,
    now: Date.now(),
  });
  const names = ['Sam', 'Chris', 'Jamie', 'Robin', 'Kai', 'Noor', 'Ash', 'Lee', 'Max'];
  for (let i = 1; i < count; i++) {
    s = reduce(s, { type: 'join', actor: `p${i}`, name: names[i - 1], now: Date.now() });
  }
  return s;
}

function Preview() {
  const [count, setCount] = useState(6);
  const [mode, setMode] = useState<'cash' | 'tournament'>('cash');
  const [state, setState] = useState<GameState>(() => build(6, 'cash'));
  const [me, setMe] = useState(HOST);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (partial: Omit<Command, 'actor'>) => {
      try {
        setState((prev) => reduce(prev, { ...partial, actor: me } as Command));
        return true;
      } catch (e) {
        setError(e instanceof GameError ? e.message : 'Something went wrong.');
        return false;
      }
    },
    [me],
  );

  const game: Game = useMemo(
    () => ({
      state,
      connection: 'live',
      error,
      clearError: () => setError(null),
      send,
      reconnect: () => {},
    }),
    [state, error, send],
  );

  const reset = (n: number, m: 'cash' | 'tournament') => {
    setCount(n);
    setMode(m);
    setState(build(n, m));
    setMe(HOST);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-black/60 px-2 py-1 text-[10px]">
        {[2, 4, 6, 9].map((n) => (
          <button
            key={n}
            onClick={() => reset(n, mode)}
            className={`rounded px-1.5 py-0.5 ${count === n ? 'bg-yellow-400 text-black' : 'bg-white/10'}`}
          >
            {n}p
          </button>
        ))}
        <button
          onClick={() => reset(count, mode === 'cash' ? 'tournament' : 'cash')}
          className="rounded bg-white/10 px-1.5 py-0.5"
        >
          {mode}
        </button>
        <span className="ml-1 opacity-50">as</span>
        {state.players.map((p) => (
          <button
            key={p.id}
            onClick={() => setMe(p.id)}
            className={`rounded px-1.5 py-0.5 ${me === p.id ? 'bg-yellow-400 text-black' : 'bg-white/10'}`}
          >
            {p.name}
          </button>
        ))}
        {state.turn && (
          <button
            onClick={() => setMe(state.turn!)}
            className="rounded bg-emerald-500/80 px-1.5 py-0.5 text-black"
          >
            → whoever acts
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <TableView game={game} me={me} onLeave={() => reset(count, mode)} onJoinNeeded={() => {}} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
