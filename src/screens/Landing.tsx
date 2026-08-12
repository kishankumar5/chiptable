import { Chip } from '../components/Chips.tsx';
import { Button } from '../components/ui.tsx';
import { DENOMINATIONS } from '../lib/chips.ts';

export function Landing({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex animate-[pop_300ms_ease-out] flex-col items-center">
        <div className="mb-4 flex -space-x-3">
          {DENOMINATIONS.slice(0, 5).map((d, i) => (
            <Chip
              key={d.value}
              d={d}
              size={44}
              className="animate-[rise_320ms_ease-out]"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
            />
          ))}
        </div>
        <h1 className="flex items-center gap-2 text-6xl font-black leading-none tracking-tight">
          <span className="gold-text">ChipTable</span>
          <span className="text-5xl text-white/90">♠</span>
        </h1>
        <p className="mt-3 text-base font-semibold text-[var(--color-muted)]">
          Your cards. Our chips.
        </p>
      </div>

      <div className="grid w-full max-w-xs gap-3">
        <Button variant="gold" size="lg" full onClick={onCreate}>
          CREATE GAME
        </Button>
        <Button variant="dark" size="lg" full onClick={onJoin}>
          JOIN GAME
        </Button>
      </div>

      {/* A stranger arriving from a shared link needs to understand this in
          about four seconds, without scrolling. */}
      <div className="mt-9 w-full max-w-xs">
        <p className="mb-4 text-center text-[13px] leading-relaxed text-white/55">
          You deal real cards. ChipTable handles the chips.
        </p>
        <ol className="space-y-2">
          {[
            ['1', 'Start a table', 'Pick your stack and blinds. No signup.'],
            ['2', 'Share the code', 'Friends join from their own phones.'],
            ['3', 'Play', 'Bets, pots and payouts stay in sync.'],
          ].map(([n, title, detail]) => (
            <li key={n} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
              <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-gold)] text-[11px] font-black text-[#3b2a00]">
                {n}
              </span>
              <span className="leading-tight">
                <span className="block text-[13px] font-bold text-ink">{title}</span>
                <span className="block text-[11px] text-white/45">{detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-center text-[10px] leading-relaxed text-white/25">
          ChipTable tracks chips only. It never handles real money, and it does not
          deal cards or decide who wins.
        </p>
      </div>
    </div>
  );
}
