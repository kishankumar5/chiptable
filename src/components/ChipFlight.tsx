import { useCallback, useRef, useState } from 'react';
import { Chip } from './Chips.tsx';
import { topChip } from '../lib/chips.ts';

interface Flight {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  amount: number;
  reverse: boolean;
  delay: number;
}

const DURATION = 320;

/**
 * Chips physically travelling between a seat and the pot. Rendered in a fixed
 * overlay with `pointer-events: none`, so gameplay is never blocked while an
 * animation is in flight.
 */
export function useFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(1);

  const fly = useCallback(
    (from: HTMLElement | null, to: HTMLElement | null, amount: number, reverse = false) => {
      if (!from || !to || amount <= 0) return;
      if (document.visibilityState !== 'visible') return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const count = Math.min(4, Math.max(2, Math.round(Math.log10(Math.max(10, amount)))));
      const batch: Flight[] = Array.from({ length: count }).map((_, i) => ({
        id: nextId.current++,
        x: a.left + a.width / 2 - 13 + (i - count / 2) * 6,
        y: a.top + a.height / 2 - 13,
        dx: b.left + b.width / 2 - (a.left + a.width / 2),
        dy: b.top + b.height / 2 - (a.top + a.height / 2),
        amount,
        reverse,
        delay: i * 45,
      }));
      setFlights((f) => [...f, ...batch]);
      const ids = new Set(batch.map((f) => f.id));
      setTimeout(
        () => setFlights((f) => f.filter((x) => !ids.has(x.id))),
        DURATION + count * 45 + 60,
      );
    },
    [],
  );

  const layer = (
    <div className="pointer-events-none fixed inset-0 z-40">
      {flights.map((f) => (
        <span
          key={f.id}
          className="absolute"
          style={{
            left: f.x,
            top: f.y,
            ['--dx' as string]: `${f.dx}px`,
            ['--dy' as string]: `${f.dy}px`,
            animation: `${f.reverse ? 'flyFromPot' : 'flyToPot'} ${DURATION}ms cubic-bezier(0.4,0,0.2,1) ${f.delay}ms both`,
          }}
        >
          <Chip d={topChip(f.amount)} size={26} />
        </span>
      ))}
    </div>
  );

  return { fly, layer };
}
