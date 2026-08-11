import { useEffect, useMemo, useState } from 'react';
import type { Command, GameState, Player } from '../engine/types.ts';
import { fmt, minRaiseTo, toCall, totalPot } from '../engine/engine.ts';
import { Button } from './ui.tsx';
import { ChipStack } from './Chips.tsx';
import { buzz, play } from '../lib/sound.ts';

interface Props {
  state: GameState;
  me: Player;
  isHost: boolean;
  send: (cmd: Omit<Command, 'actor'>) => Promise<boolean>;
}

/**
 * The bottom of the screen answers one question at a time: what do I press?
 * Three buttons when it's your turn, a status line when it isn't.
 */
export function ActionBar({ state, me, isHost, send }: Props) {
  const [betting, setBetting] = useState(false);
  const myTurn = state.turn === me.id;
  const call = toCall(state, me.id);
  const minTo = minRaiseTo(state, me.id);
  const maxTo = me.bet + me.stack;
  const [target, setTarget] = useState(minTo);

  useEffect(() => {
    if (!myTurn) setBetting(false);
  }, [myTurn]);

  useEffect(() => {
    if (betting) setTarget(Math.min(Math.max(minTo, target), maxTo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betting]);

  const potNow = totalPot(state);
  const shortcuts = useMemo(() => {
    const potAfterCall = potNow + call;
    const raiseTo = (extra: number) => Math.round(state.currentBet + extra);
    const list: { label: string; to: number }[] = state.currentBet
      ? [
          { label: '+1 BB', to: raiseTo(state.bb) },
          { label: '+2 BB', to: raiseTo(state.bb * 2) },
          { label: '+3 BB', to: raiseTo(state.bb * 3) },
          { label: '+5 BB', to: raiseTo(state.bb * 5) },
          { label: '½ Pot', to: raiseTo(potAfterCall * 0.5) },
          { label: '¾ Pot', to: raiseTo(potAfterCall * 0.75) },
          { label: 'Pot', to: raiseTo(potAfterCall) },
        ]
      : [
          { label: '1 BB', to: state.bb },
          { label: '2 BB', to: state.bb * 2 },
          { label: '3 BB', to: state.bb * 3 },
          { label: '5 BB', to: state.bb * 5 },
          { label: '½ Pot', to: Math.round(potNow * 0.5) },
          { label: '¾ Pot', to: Math.round(potNow * 0.75) },
          { label: 'Pot', to: potNow },
        ];
    return list
      .map((s) => ({ ...s, to: Math.min(Math.max(s.to, minTo), maxTo) }))
      .filter((s, i, arr) => arr.findIndex((o) => o.to === s.to) === i);
  }, [state.currentBet, state.bb, potNow, call, minTo, maxTo]);

  if (!myTurn) {
    const waitingOn = state.players.find((p) => p.id === state.turn);
    return (
      <div className="px-3 pb-[calc(0.75rem+var(--sab))] pt-2">
        <div className="panel px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {state.street ? 'Waiting' : 'Between hands'}
              </div>
              <div className="text-base font-black text-ink">
                {waitingOn
                  ? `${waitingOn.name} to act…`
                  : state.awaitingPayout
                    ? 'Awarding pot…'
                    : 'Ready'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Your stack
              </div>
              <div className="text-xl font-black text-[var(--color-gold)]">{fmt(me.stack)}</div>
            </div>
          </div>

          {/* A player who walked away would otherwise freeze the whole table. */}
          {isHost && waitingOn && (
            <Button
              size="sm"
              variant="ghost"
              full
              className="mt-2.5"
              onClick={() => void send({ type: 'force-fold', target: waitingOn.id })}
            >
              {waitingOn.name} gone? Fold for them
            </Button>
          )}
        </div>
      </div>
    );
  }

  const stackAfter = maxTo - target;
  const isAllIn = target >= maxTo;

  return (
    <div className="px-3 pb-[calc(0.75rem+var(--sab))] pt-2">
      <div className="mb-2 flex animate-[pop_180ms_ease-out] items-center justify-between rounded-2xl bg-[var(--color-gold)] px-4 py-1.5">
        <span className="text-sm font-black uppercase tracking-[0.2em] text-[#3b2a00]">
          Your turn
        </span>
        <span className="text-sm font-black text-[#3b2a00]">
          {fmt(me.stack)}
          {call > 0 && <span className="ml-2 opacity-70">to call {fmt(call)}</span>}
        </span>
      </div>

      {!betting ? (
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="danger"
            size="lg"
            onClick={() => {
              play('fold');
              void send({ type: 'act', move: 'fold' });
            }}
          >
            FOLD
          </Button>
          {call > 0 ? (
            <Button
              variant="green"
              size="lg"
              onClick={() => {
                play('chip');
                buzz(14);
                void send({ type: 'act', move: 'call' });
              }}
            >
              <span className="block text-base leading-tight">CALL</span>
              <span className="block text-xs opacity-90">{fmt(call)}</span>
            </Button>
          ) : (
            <Button
              variant="green"
              size="lg"
              onClick={() => void send({ type: 'act', move: 'check' })}
            >
              CHECK
            </Button>
          )}
          <Button
            variant="gold"
            size="lg"
            disabled={me.stack === 0}
            onClick={() => {
              setTarget(minTo);
              setBetting(true);
            }}
          >
            {state.currentBet > 0 ? 'RAISE' : 'BET'}
          </Button>
        </div>
      ) : (
        <div className="panel animate-[rise_200ms_ease-out] p-3">
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {shortcuts.map((s) => (
              <Button
                key={s.label}
                size="sm"
                variant={target === s.to ? 'gold' : 'dark'}
                onClick={() => setTarget(s.to)}
              >
                {s.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={isAllIn ? 'gold' : 'danger'}
              onClick={() => setTarget(maxTo)}
            >
              ALL IN
            </Button>
          </div>

          <input
            type="range"
            min={minTo}
            max={maxTo}
            step={Math.max(1, Math.round(state.bb / 2))}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="mb-3 w-full accent-[var(--color-gold)]"
          />

          <div className="mb-3 flex items-center gap-3">
            <input
              type="number"
              inputMode="numeric"
              value={target}
              min={minTo}
              max={maxTo}
              onChange={(e) => setTarget(Number(e.target.value))}
              onBlur={() => setTarget(Math.min(Math.max(minTo, Math.round(target)), maxTo))}
              className="w-28 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-lg font-black text-ink outline-none focus:border-[var(--color-gold)]/70"
            />
            <div className="flex-1">
              <ChipStack amount={target - me.bet} size={16} max={8} />
              <div className="text-[11px] font-semibold text-[var(--color-muted)]">
                Stack after: <span className="text-ink">{fmt(stackAfter)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button variant="ghost" size="lg" onClick={() => setBetting(false)}>
              Back
            </Button>
            <Button
              variant="gold"
              size="lg"
              onClick={() => {
                play('chip');
                buzz([10, 30, 10]);
                void send({
                  type: 'act',
                  move: isAllIn ? 'allin' : 'raise',
                  amount: Math.round(target),
                });
                setBetting(false);
              }}
            >
              {isAllIn ? 'ALL IN' : `${state.currentBet > 0 ? 'RAISE TO' : 'BET'} ${fmt(target)}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
