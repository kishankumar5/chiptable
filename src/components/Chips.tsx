import { memo } from 'react';
import { breakdown, type Denomination } from '../lib/chips.ts';

export const Chip = memo(function Chip({
  d,
  size = 26,
  style,
  className = '',
}: {
  d: Denomination;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 38%, ${d.color} 0%, ${d.color} 52%, ${d.edge} 53%, ${d.edge} 62%, ${d.color} 63%)`,
        border: `2px dashed ${d.edge}`,
        boxShadow: 'inset 0 -2px 4px rgb(0 0 0 / 0.45), 0 2px 4px rgb(0 0 0 / 0.5)',
        ...style,
      }}
    />
  );
});

/** A leaning stack of chips representing an amount. Pure CSS, no images. */
export const ChipStack = memo(function ChipStack({
  amount,
  size = 22,
  max = 12,
}: {
  amount: number;
  size?: number;
  max?: number;
}) {
  if (amount <= 0) return null;
  const groups = breakdown(amount, max);
  return (
    <span className="inline-flex items-end gap-1">
      {groups.map(({ chip, count }) => (
        <span
          key={chip.value}
          className="relative inline-block"
          style={{ width: size, height: size + (count - 1) * 4 }}
        >
          {Array.from({ length: count }).map((_, i) => (
            <Chip
              key={i}
              d={chip}
              size={size}
              className="absolute left-0 animate-[pop_180ms_ease-out]"
              style={{ bottom: i * 4, animationDelay: `${i * 18}ms` }}
            />
          ))}
        </span>
      ))}
    </span>
  );
});
