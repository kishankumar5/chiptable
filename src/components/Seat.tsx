import { memo } from 'react';
import type { Player } from '../engine/types.ts';
import { fmt } from '../engine/engine.ts';
import { ChipStack } from './Chips.tsx';

export interface SeatRoles {
  dealer: number | null;
  sb: number | null;
  bb: number | null;
}

const AVATAR_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#84cc16',
  '#6366f1',
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const Seat = memo(function Seat({
  player,
  roles,
  isTurn,
  isHost,
  isMe,
  x,
  y,
  seatRef,
  onTap,
}: {
  player: Player;
  roles: SeatRoles;
  isTurn: boolean;
  isHost: boolean;
  isMe: boolean;
  x: number;
  y: number;
  seatRef: (el: HTMLDivElement | null) => void;
  onTap?: () => void;
}) {
  const badge =
    roles.dealer === player.seat
      ? { text: 'D', cls: 'bg-white text-black' }
      : roles.sb === player.seat
        ? { text: 'SB', cls: 'bg-sky-400 text-black' }
        : roles.bb === player.seat
          ? { text: 'BB', cls: 'bg-amber-400 text-black' }
          : null;

  const dim = player.folded || player.sittingOut || player.leftTable;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200"
      style={{ left: `${x}%`, top: `${y}%`, opacity: dim ? 0.42 : 1 }}
      onClick={onTap}
    >
      <div
        ref={seatRef}
        className={`relative flex w-[78px] flex-col items-center rounded-2xl border px-1.5 py-1.5 ${
          isTurn
            ? 'animate-[pulseTurn_1.6s_ease-in-out_infinite] border-[var(--color-gold)] bg-[#23262c]'
            : 'border-white/10 bg-black/45'
        } ${isMe ? 'ring-1 ring-[var(--color-gold)]/40' : ''} backdrop-blur-sm`}
      >
        {badge && (
          <span
            className={`absolute -left-2 -top-2 grid h-5 w-5 place-items-center rounded-full text-[9px] font-black shadow ${badge.cls}`}
          >
            {badge.text}
          </span>
        )}
        {isHost && <span className="absolute -right-1.5 -top-2.5 text-sm">👑</span>}

        <span
          className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-black text-white shadow-inner"
          style={{ background: AVATAR_COLORS[player.seat % AVATAR_COLORS.length] }}
        >
          {initials(player.name)}
        </span>

        <span className="mt-0.5 max-w-full truncate text-[10px] font-bold leading-tight text-ink">
          {player.name}
        </span>
        <span className="text-[11px] font-black leading-tight text-[var(--color-gold)]">
          {fmt(player.stack)}
        </span>

        {player.allIn && !player.folded && (
          <span className="mt-0.5 rounded-full bg-red-500 px-1.5 text-[8px] font-black uppercase tracking-wider text-white">
            All in
          </span>
        )}
        {player.folded && (
          <span className="mt-0.5 rounded-full bg-white/15 px-1.5 text-[8px] font-black uppercase tracking-wider">
            Fold
          </span>
        )}
        {player.leftTable && (
          <span className="mt-0.5 rounded-full bg-white/10 px-1.5 text-[8px] font-black uppercase tracking-wider">
            Out
          </span>
        )}
      </div>

      {player.bet > 0 && (
        <div className="mt-1 flex animate-[pop_180ms_ease-out] flex-col items-center">
          <ChipStack amount={player.bet} size={13} max={4} />
          <span className="mt-0.5 rounded-full bg-black/70 px-1.5 py-px text-[10px] font-black text-white">
            {fmt(player.bet)}
          </span>
        </div>
      )}
    </div>
  );
});

/** Empty chair a joining player can tap. */
export function EmptySeat({
  seat,
  x,
  y,
  onTap,
}: {
  seat: number;
  x: number;
  y: number;
  onTap?: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className="btn absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-white/15 bg-black/20 px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-white/30"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      Seat {seat + 1}
    </button>
  );
}
