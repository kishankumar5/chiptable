import type { Command, GameState } from '../engine/types.ts';
import { fmt, settlement } from '../engine/engine.ts';
import { Button } from './ui.tsx';

const MEDALS = ['🏆', '🥈', '🥉'];

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;

/** Who owes whom. The column always sums to zero. */
export function EndScreen({
  state,
  isHost,
  send,
  onLeave,
}: {
  state: GameState;
  isHost: boolean;
  send: (cmd: Omit<Command, 'actor'>) => Promise<boolean>;
  onLeave: () => void;
}) {
  const results = settlement(state);
  const total = results.reduce((n, r) => n + r.net, 0);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-5 py-10">
      <h1 className="animate-[pop_240ms_ease-out] text-4xl font-black tracking-tight">
        GAME OVER 🃏
      </h1>
      <p className="mb-6 mt-1 text-sm text-[var(--color-muted)]">
        {state.handNo} {state.handNo === 1 ? 'hand' : 'hands'} played
      </p>

      <div className="panel w-full max-w-sm divide-y divide-white/5 p-2">
        {results.map((r, i) => (
          <div
            key={r.id}
            className="flex animate-[rise_240ms_ease-out] items-center gap-3 px-3 py-3"
            style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
          >
            <span className="w-6 text-center text-lg">{MEDALS[i] ?? ''}</span>
            <span className="flex-1 truncate text-base font-black">{r.name}</span>
            <span
              className={`text-lg font-black tabular-nums ${
                r.net > 0 ? 'text-emerald-400' : r.net < 0 ? 'text-red-400' : 'text-white/50'
              }`}
            >
              {signed(r.net)}
            </span>
          </div>
        ))}
        <div className="flex justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          <span>Balance</span>
          <span className={total === 0 ? '' : 'text-red-400'}>{signed(total)}</span>
        </div>
      </div>

      <div className="mt-6 grid w-full max-w-sm gap-2">
        {isHost && (
          <Button variant="gold" size="lg" full onClick={() => void send({ type: 'play-again' })}>
            PLAY AGAIN
          </Button>
        )}
        <Button variant="dark" size="lg" full onClick={onLeave}>
          NEW GAME
        </Button>
      </div>
    </div>
  );
}
