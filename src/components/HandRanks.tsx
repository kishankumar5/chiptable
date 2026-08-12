import { Sheet } from './ui.tsx';

/** Best to worst. Suits are coloured so the flushes read at a glance. */
const RANKS: [string, string, string][] = [
  ['Royal Flush', 'A♠ K♠ Q♠ J♠ 10♠', 'Ace-high straight, all one suit'],
  ['Straight Flush', '9♥ 8♥ 7♥ 6♥ 5♥', 'Five in a row, all one suit'],
  ['Four of a Kind', 'Q♠ Q♥ Q♦ Q♣ 3♠', 'All four of the same card'],
  ['Full House', 'J♠ J♥ J♦ 8♣ 8♠', 'Three of a kind plus a pair'],
  ['Flush', 'A♦ J♦ 9♦ 6♦ 3♦', 'Any five of one suit'],
  ['Straight', '10♣ 9♦ 8♠ 7♥ 6♣', 'Five in a row, mixed suits'],
  ['Three of a Kind', '7♠ 7♥ 7♦ K♣ 4♠', 'Three of the same card'],
  ['Two Pair', 'A♠ A♦ 6♥ 6♣ 9♠', 'Two different pairs'],
  ['One Pair', '10♥ 10♠ K♦ 7♣ 2♥', 'Two of the same card'],
  ['High Card', 'A♣ J♠ 8♥ 5♦ 2♣', 'Nothing else — highest card plays'],
];

const card = (c: string, i: number) => (
  <span
    key={i}
    className={`inline-block rounded-[4px] bg-white px-1 py-px text-[11px] font-black leading-tight ${
      c.includes('♥') || c.includes('♦') ? 'text-red-600' : 'text-black'
    }`}
  >
    {c}
  </span>
);

/** A quick reference for the table. Deliberately just a picture of the rules. */
export function HandRanks({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Hand rankings">
      <ol className="space-y-1.5">
        {RANKS.map(([name, example, note], i) => (
          <li
            key={name}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/30 px-3 py-2"
          >
            <span className="w-4 shrink-0 text-center text-[11px] font-black text-[var(--color-gold)]">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-black leading-tight text-ink">{name}</span>
              <span className="block text-[10px] leading-tight text-[var(--color-muted)]">
                {note}
              </span>
            </span>
            <span className="flex shrink-0 gap-0.5">
              {example.split(' ').map((c, j) => card(c, j))}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-white/30">
        Ties are broken by the highest cards. ChipTable doesn't read your cards —
        you decide who won.
      </p>
    </Sheet>
  );
}
