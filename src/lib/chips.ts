// Turning an amount into an actual-looking stack of chips.

export interface Denomination {
  value: number;
  /** Chip face colour. */
  color: string;
  /** Edge-spot colour. */
  edge: string;
  /** Text colour on the chip face. */
  ink: string;
  label: string;
}

export const DENOMINATIONS: Denomination[] = [
  { value: 1000, color: '#f5c542', edge: '#fff3c4', ink: '#4a3500', label: '1K' },
  { value: 500, color: '#7c3aed', edge: '#e9d5ff', ink: '#f5f3ff', label: '500' },
  { value: 100, color: '#18181b', edge: '#71717a', ink: '#fafafa', label: '100' },
  { value: 25, color: '#16a34a', edge: '#bbf7d0', ink: '#f0fdf4', label: '25' },
  { value: 5, color: '#dc2626', edge: '#fecaca', ink: '#fef2f2', label: '5' },
  { value: 1, color: '#f8fafc', edge: '#94a3b8', ink: '#0f172a', label: '1' },
];

export interface ChipCount {
  chip: Denomination;
  count: number;
}

/**
 * Greedy breakdown of an amount into chips, capped so a huge pot doesn't try
 * to render a thousand DOM nodes.
 */
export function breakdown(amount: number, maxChips = 14): ChipCount[] {
  let left = Math.max(0, Math.round(amount));
  const out: ChipCount[] = [];
  for (const chip of DENOMINATIONS) {
    if (left < chip.value) continue;
    const count = Math.floor(left / chip.value);
    left -= count * chip.value;
    out.push({ chip, count });
  }

  let total = out.reduce((n, c) => n + c.count, 0);
  // Trim from the smallest denominations first — the big chips tell the story.
  for (let i = out.length - 1; i >= 0 && total > maxChips; i--) {
    const drop = Math.min(out[i].count, total - maxChips);
    out[i].count -= drop;
    total -= drop;
  }
  return out.filter((c) => c.count > 0);
}

/** The single chip that best represents an amount — used for fly-to-pot. */
export function topChip(amount: number): Denomination {
  return DENOMINATIONS.find((d) => amount >= d.value) ?? DENOMINATIONS[DENOMINATIONS.length - 1];
}
