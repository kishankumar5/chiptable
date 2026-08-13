import { fmt } from '../engine/engine.ts';
import type { GameState, Player } from '../engine/types.ts';
import { Sheet } from './ui.tsx';
import { HandRecap } from './HandRecap.tsx';
import { recentDays, todayTotals } from '../lib/ledger.ts';

const sign = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : fmt(0));
const tone = (n: number) =>
  n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-[var(--color-muted)]';

/**
 * "How much am I into this, and how much today?" — answered without doing
 * arithmetic mid-hand. Everything here is read from this device only.
 */
export function MoneySheet({
  state,
  me,
  open,
  onClose,
}: {
  state: GameState;
  me: Player;
  open: boolean;
  onClose: () => void;
}) {
  const net = me.stack + me.cashedOut - me.buyIn;
  const day = todayTotals();
  const days = recentDays(7).filter((d) => d.day !== new Date().toLocaleDateString('en-CA'));

  return (
    <Sheet open={open} onClose={onClose} title="Your money">
      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
          This table
        </div>
        <div className={`mt-1 text-4xl font-black tabular-nums ${tone(net)}`}>{sign(net)}</div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['Bought in', fmt(me.buyIn)],
            ['On table', fmt(me.stack)],
            ['Cashed out', fmt(me.cashedOut)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/[0.04] py-2">
              <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                {label}
              </dt>
              <dd className="text-sm font-black text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {state.mode === 'cash' && (
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            Every buy-in and rebuy counts, so this stays true after a top-up.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Today
          </div>
          <div className="text-[11px] text-[var(--color-muted)]">
            {day.tables} {day.tables === 1 ? 'table' : 'tables'} · {fmt(day.buyIn)} in
          </div>
        </div>
        <div className={`mt-1 text-3xl font-black tabular-nums ${tone(day.net)}`}>
          {sign(day.net)}
        </div>
      </section>

      {state.hands.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Recent hands
          </h3>
          <div className="space-y-2">
            {state.hands.slice(0, 8).map((h) => (
              <HandRecap key={`${h.no}-${h.at}`} recap={h} meId={me.id} />
            ))}
          </div>
        </section>
      )}

      {days.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Earlier
          </h3>
          <ul className="space-y-1.5">
            {days.map((d) => (
              <li
                key={d.day}
                className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2"
              >
                <span className="text-xs font-bold text-ink">
                  {new Date(`${d.day}T12:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="text-[11px] text-[var(--color-muted)]">
                  {d.tables} {d.tables === 1 ? 'table' : 'tables'}
                </span>
                <span className={`text-sm font-black tabular-nums ${tone(d.net)}`}>
                  {sign(d.net)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-center text-[10px] leading-relaxed text-white/25">
        Kept on this phone only — never uploaded. ChipTable moves no real money;
        settling up is between you and your friends.
      </p>
    </Sheet>
  );
}
