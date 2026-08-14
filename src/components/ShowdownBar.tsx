import { useEffect, useRef, useState } from 'react';
import type { Command, GameState, Player } from '../engine/types.ts';
import { CONTEST_MS, fmt, totalPot } from '../engine/engine.ts';
import { Button } from './ui.tsx';
import { buzz, play } from '../lib/sound.ts';

/**
 * Showdown, settled by the people holding the cards.
 *
 * The winner taps once. Everyone else does nothing — silence is agreement,
 * exactly like folding your cards face down at a real table. Anyone who
 * disagrees has a few seconds to say so, and then it goes to the host.
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
  const contenders = state.players.filter((p) => p.inHand && !p.folded);
  const claimant = contenders.find((p) => state.claims[p.id] === 'win') ?? null;
  const iClaimed = claimant?.id === me.id;
  const left = useContestCountdown(state.claimAt, Boolean(claimant) && !state.claimsDisputed);

  // Ask the server to pay when the window closes — exactly once per claim.
  //
  // This used to re-run on every countdown tick from every phone at the table.
  // If the server refused (a side pot the claimant could not sweep, say), the
  // request repeated several times a second on every device, forever, and the
  // errors were swallowed because settle is a background command. Now: one
  // attempt, remembered by hand, and only two devices ever try.
  const asked = useRef<string | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!claimant || state.claimsDisputed || !state.awaitingPayout || state.claimAt === null) {
      return;
    }
    const key = `${state.code}:${state.handNo}:${state.claimAt}`;
    if (asked.current === key) return;

    // The winner's own phone asks. The host is a backup in case that phone
    // locked or died mid-claim; everyone else stays out of it entirely.
    if (!iClaimed && !isHost) return;

    const due = CONTEST_MS - (Date.now() - state.claimAt);
    const id = setTimeout(
      () => {
        asked.current = key;
        void sendRef.current({ type: 'settle' });
      },
      Math.max(0, due) + (iClaimed ? 150 : 2000),
    );
    return () => clearTimeout(id);
  }, [
    claimant,
    iClaimed,
    isHost,
    state.claimAt,
    state.claimsDisputed,
    state.awaitingPayout,
    state.code,
    state.handNo,
  ]);

  const wrap = (children: React.ReactNode) => (
    <div className="px-3 pb-[calc(0.75rem+var(--sab))] pt-2">{children}</div>
  );

  /* Two people say they won — only the cards can settle it. */
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

  /* Someone has claimed it — the pot is on its way unless anyone objects. */
  if (claimant) {
    return wrap(
      <div className="panel overflow-hidden px-4 py-3.5">
        <div className="text-center text-base font-black text-ink">
          {iClaimed ? 'You take' : `${claimant.name} takes`}{' '}
          <span className="text-[var(--color-gold)]">{fmt(pot)}</span>
        </div>

        {/* A draining bar reads faster than a number while chips are moving. */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--color-gold)] transition-[width] duration-300 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, (left / CONTEST_MS) * 100))}%` }}
          />
        </div>

        {inHand && !iClaimed ? (
          <Button
            variant="dark"
            full
            className="mt-2.5"
            onClick={() => void send({ type: 'claim', claim: 'win' })}
          >
            No — I won this one
          </Button>
        ) : (
          <div className="mt-2 text-center text-[11px] text-[var(--color-muted)]">
            {left > 0 ? 'Paying out…' : 'Settling…'}
          </div>
        )}
      </div>,
    );
  }

  /* Nobody has claimed yet. The winner is the only one who needs to act. */
  if (inHand) {
    return wrap(
      <>
        <div className="mb-2 flex animate-[pop_180ms_ease-out] items-center justify-between rounded-2xl bg-[var(--color-gold)] px-4 py-1.5">
          <span className="text-sm font-black uppercase tracking-[0.2em] text-[#3b2a00]">
            Showdown
          </span>
          <span className="text-sm font-black text-[#3b2a00]">{fmt(pot)}</span>
        </div>
        <Button
          variant="gold"
          size="lg"
          full
          onClick={() => {
            play('win');
            buzz([10, 40, 10]);
            void send({ type: 'claim', claim: 'win' });
          }}
        >
          I WIN — TAKE {fmt(pot)}
        </Button>
        <div className="mt-1.5 text-center text-[11px] text-[var(--color-muted)]">
          Only the winner taps. Everyone else can sit tight.
        </div>
        {isHost && (
          <button
            onClick={onDecide}
            className="btn mt-1 w-full py-1.5 text-[11px] font-bold text-[var(--color-muted)]"
          >
            or award it yourself
          </button>
        )}
      </>,
    );
  }

  /* Folded or watching. */
  return wrap(
    <div className="panel px-4 py-3.5">
      <div className="text-center text-sm font-black text-ink">Showdown — {fmt(pot)}</div>
      <div className="mt-0.5 text-center text-[11px] text-[var(--color-muted)]">
        Waiting for {contenders.map((p) => p.name).join(' or ')}…
      </div>
      {isHost && (
        <Button variant="ghost" size="sm" full className="mt-2.5" onClick={onDecide}>
          Award it yourself
        </Button>
      )}
    </div>,
  );
}

/** Milliseconds left in the contest window, ticking smoothly. */
function useContestCountdown(claimAt: number | null, active: boolean) {
  const [left, setLeft] = useState(CONTEST_MS);
  useEffect(() => {
    if (!active || claimAt === null) return setLeft(CONTEST_MS);
    const tick = () => setLeft(Math.max(0, CONTEST_MS - (Date.now() - claimAt)));
    tick();
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [claimAt, active]);
  return left;
}
