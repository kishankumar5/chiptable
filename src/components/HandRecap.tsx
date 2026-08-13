import type { HandRecap as Recap } from '../engine/types.ts';
import { fmt } from '../engine/engine.ts';

const net = (p: Recap['players'][number]) => p.won - p.put;

const tone = (n: number) =>
  n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-[var(--color-muted)]';

const money = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : '—');

/**
 * What just happened, in one line per player. Answers "how much did I just
 * lose?" without anyone doing the sums in their head.
 */
export function HandRecap({ recap, meId }: { recap: Recap; meId?: string }) {
  const rows = [...recap.players].sort((a, b) => net(b) - net(a));

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Hand {recap.no}
        </span>
        <span className="text-xs font-black text-[var(--color-gold)]">
          {fmt(recap.pot)}
          <span className="ml-1 text-[10px] font-bold text-[var(--color-muted)]">
            {recap.showdown ? 'showdown' : 'no showdown'}
          </span>
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
              p.id === meId ? 'bg-white/[0.07]' : ''
            }`}
          >
            <span className="w-4 shrink-0 text-center">{p.won > 0 ? '🏆' : p.folded ? '·' : ''}</span>
            <span className="min-w-0 flex-1 truncate font-bold text-ink">
              {p.name}
              {p.id === meId && <span className="ml-1 text-[10px] text-white/40">you</span>}
            </span>
            <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
              {p.put > 0 ? `bet ${fmt(p.put)}` : 'folded'}
            </span>
            <span className={`w-16 shrink-0 text-right font-black tabular-nums ${tone(net(p))}`}>
              {money(net(p))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
