import { useMemo, useState } from 'react';
import type { Command, GameState } from '../engine/types.ts';
import { fmt } from '../engine/engine.ts';
import { Button, Sheet } from './ui.tsx';
import { ChipStack } from './Chips.tsx';

/**
 * Host-only payout. Every pot needs a winner before the chips move — tapping a
 * second name splits it.
 */
export function AwardSheet({
  state,
  open,
  onClose,
  send,
}: {
  state: GameState;
  open: boolean;
  onClose: () => void;
  send: (cmd: Omit<Command, 'actor'>) => Promise<boolean>;
}) {
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';

  const ready = useMemo(
    () => state.pots.every((_, i) => (picks[i] ?? []).length > 0),
    [state.pots, picks],
  );

  const toggle = (potIndex: number, id: string) =>
    setPicks((prev) => {
      const cur = prev[potIndex] ?? [];
      return {
        ...prev,
        [potIndex]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      };
    });

  return (
    <Sheet open={open} onClose={onClose} title="Award Pot">
      <div className="space-y-4">
        {state.pots.map((pot, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-muted)]">
                {pot.label}
              </span>
              <span className="text-lg font-black text-[var(--color-gold)]">{fmt(pot.amount)}</span>
            </div>
            <ChipStack amount={pot.amount} size={14} max={8} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {pot.eligible.map((id) => {
                const picked = (picks[i] ?? []).includes(id);
                return (
                  <Button
                    key={id}
                    size="md"
                    variant={picked ? 'gold' : 'dark'}
                    onClick={() => toggle(i, id)}
                  >
                    {name(id)}
                  </Button>
                );
              })}
            </div>
            {(picks[i] ?? []).length > 1 && (
              <p className="mt-2 text-[11px] text-[var(--color-muted)]">
                Split {(picks[i] ?? []).length} ways —{' '}
                {fmt(Math.floor(pot.amount / (picks[i] ?? []).length))} each
              </p>
            )}
          </div>
        ))}

        <Button
          variant="gold"
          size="lg"
          full
          disabled={!ready}
          onClick={async () => {
            const awards = state.pots.map((_, i) => ({ pot: i, winners: picks[i] ?? [] }));
            if (await send({ type: 'award', awards })) {
              setPicks({});
              onClose();
            }
          }}
        >
          CONFIRM PAYOUT
        </Button>
      </div>
    </Sheet>
  );
}
