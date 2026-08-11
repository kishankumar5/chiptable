import { useEffect, useState } from 'react';
import type { Command, GameState } from '../engine/types.ts';
import { fmt } from '../engine/engine.ts';

const mmss = (secs: number) => {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Counts down locally from the server's `endsAt` so the display is smooth, but
 * only the server ever changes the level.
 */
export function TourneyClock({
  state,
  isHost,
  send,
}: {
  state: GameState;
  isHost: boolean;
  send: (cmd: Omit<Command, 'actor'>) => Promise<boolean>;
}) {
  const tr = state.tourney!;
  const [left, setLeft] = useState(tr.remaining);

  useEffect(() => {
    const tick = () => {
      if (tr.paused || tr.endsAt === null) {
        setLeft(tr.remaining);
        return;
      }
      const remaining = (tr.endsAt - Date.now()) / 1000;
      setLeft(remaining);
      // One client nudges the clock forward; the server decides if it counts.
      if (remaining <= 0 && isHost) void send({ type: 'level-tick' });
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [tr.paused, tr.endsAt, tr.remaining, isHost, send]);

  const level = tr.levels[tr.level];

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-1.5">
      <div className="leading-none">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--color-muted)]">
          {level?.isBreak ? 'Break' : `Level ${tr.level + 1}`}
        </div>
        <div className="text-[11px] font-black text-ink">
          {fmt(state.sb)} / {fmt(state.bb)}
        </div>
      </div>
      <div
        className={`font-mono text-lg font-black tabular-nums ${
          left <= 30 && !tr.paused ? 'text-red-400' : 'text-[var(--color-gold)]'
        }`}
      >
        {tr.paused ? '❚❚' : mmss(left)}
      </div>
    </div>
  );
}
