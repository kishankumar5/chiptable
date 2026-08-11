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

      <p className="mt-8 max-w-[16rem] text-center text-xs leading-relaxed text-white/35">
        Deal your own cards. ChipTable keeps every stack, bet and pot honest.
      </p>
    </div>
  );
}
