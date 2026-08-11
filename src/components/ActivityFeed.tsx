import { useState } from 'react';
import type { LogEntry } from '../engine/types.ts';

const ICONS: Record<string, string> = {
  join: '🟢',
  bet: '🟡',
  fold: '🔴',
  win: '🏆',
  hand: '🃏',
  host: '👑',
  info: '•',
};

/** Deliberately tiny: one line unless you ask for more. */
export function ActivityFeed({ log }: { log: LogEntry[] }) {
  const [open, setOpen] = useState(false);
  const latest = log[0];

  return (
    <div className="px-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-1.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px]">{ICONS[latest?.kind ?? 'info']}</span>
          <span className="flex-1 truncate text-[11px] font-semibold text-[var(--color-muted)]">
            {latest?.msg ?? 'Waiting to start…'}
          </span>
          <span className="text-[10px] text-white/30">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="mt-1 max-h-40 animate-[rise_180ms_ease-out] overflow-y-auto rounded-2xl border border-white/10 bg-black/50 px-3 py-2">
          {log.map((e, i) => (
            <div key={`${e.t}-${i}`} className="flex gap-2 py-0.5 text-[11px] text-white/70">
              <span>{ICONS[e.kind]}</span>
              <span className="flex-1">{e.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
