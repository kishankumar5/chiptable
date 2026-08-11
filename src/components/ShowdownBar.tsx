import type { Command, GameState, Player } from '../engine/types.ts';
import { fmt, totalPot } from '../engine/engine.ts';
import { Button } from './ui.tsx';
import { buzz, play } from '../lib/sound.ts';

/**
 * Showdown, settled by the people holding the cards. One tap each and the
 * chips move — the host only gets involved when two players disagree.
 */
export function ShowdownBar({
  state,
  me,
  isHost,
  send,
  onDecide,
}: {
  state: GameState;
  me: Player;
  isHost: boolean;
  send: (cmd: Omit<Command, 'actor'>) => Promise<boolean>;
  onDecide: () => void;
}) {
  const pot = totalPot(state);
  const inHand = me.inHand && !me.folded;
  const myClaim = state.claims[me.id];
  const contenders = state.players.filter((p) => p.inHand && !p.folded);
  const waitingFor = contenders.filter((p) => !state.claims[p.id]);

  const wrap = (children: React.ReactNode) => (
    <div className="px-3 pb-[calc(0.75rem+var(--sab))] pt-2">{children}</div>
  );

  if (state.claimsDisputed) {
    return wrap(
      <div className="panel px-4 py-3.5">
        <div className="text-center text-sm font-black text-amber-300">
          More than one player claimed it
        </div>
        <div className="mt-0.5 text-center text-[11px] text-[var(--color-muted)]">
          {isHost ? 'Check the cards and award it.' : 'The host is sorting it out.'}
        </div>
        {isHost && (
          <Button variant="gold" size="lg" full className="mt-2.5" onClick={onDecide}>
            AWARD POT — {fmt(pot)}
          </Button>
        )}
      </div>,
    );
  }

  if (inHand && !myClaim) {
    return wrap(
      <>
        <div className="mb-2 flex animate-[pop_180ms_ease-out] items-center justify-between rounded-2xl bg-[var(--color-gold)] px-4 py-1.5">
          <span className="text-sm font-black uppercase tracking-[0.2em] text-[#3b2a00]">
            Showdown
          </span>
          <span className="text-sm font-black text-[#3b2a00]">{fmt(pot)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="dark"
            size="lg"
            onClick={() => void send({ type: 'claim', claim: 'muck' })}
          >
            MUCK
          </Button>
          <Button
            variant="gold"
            size="lg"
            onClick={() => {
              play('win');
              buzz([10, 40, 10]);
              void send({ type: 'claim', claim: 'win' });
            }}
          >
            I WIN
          </Button>
        </div>
        {isHost && (
          <button
            onClick={onDecide}
            className="btn mt-2 w-full py-1.5 text-[11px] font-bold text-[var(--color-muted)]"
          >
            or award it yourself
          </button>
        )}
      </>,
    );
  }

  return wrap(
    <div className="panel px-4 py-3.5">
      <div className="text-center text-sm font-black text-ink">
        {myClaim === 'win'
          ? 'You claimed the pot'
          : myClaim === 'muck'
            ? 'You mucked'
            : `Showdown — ${fmt(pot)}`}
      </div>
      <div className="mt-0.5 text-center text-[11px] text-[var(--color-muted)]">
        {waitingFor.length
          ? `Waiting for ${waitingFor.map((p) => p.name).join(', ')}…`
          : 'Settling up…'}
      </div>
      {isHost && (
        <Button variant="ghost" size="sm" full className="mt-2.5" onClick={onDecide}>
          Award it yourself
        </Button>
      )}
    </div>,
  );
}
