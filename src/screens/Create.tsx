import { useState } from 'react';
import { Button, Choice, Field, inputClass } from '../components/ui.tsx';
import { createGame } from '../lib/api.ts';
import { lastName, playerId, rememberName, rememberRoom } from '../lib/session.ts';
import { gameUrl, shareGame } from '../lib/share.ts';
import { fmt } from '../engine/engine.ts';
import { play } from '../lib/sound.ts';

const STACKS = [20, 100, 500, 1000, 5000];
const BLINDS: { label: string; sb: number; bb: number }[] = [
  { label: '$1 / $2', sb: 1, bb: 2 },
  { label: '$5 / $10', sb: 5, bb: 10 },
  { label: '$25 / $50', sb: 25, bb: 50 },
];

export function Create({ onReady, onBack }: { onReady: (code: string) => void; onBack: () => void }) {
  const [name, setName] = useState(lastName());
  const [mode, setMode] = useState<'cash' | 'tournament'>('cash');
  const [stack, setStack] = useState(1000);
  const [blinds, setBlinds] = useState(1);
  const [seats, setSeats] = useState(9);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    const nick = name.trim();
    if (!nick) return setError('Pick a nickname first.');
    setBusy(true);
    setError('');
    try {
      const res = await createGame({
        hostId: playerId(),
        hostName: nick,
        mode,
        startingStack: stack,
        sb: BLINDS[blinds].sb,
        bb: BLINDS[blinds].bb,
        maxSeats: seats,
      });
      rememberName(nick);
      rememberRoom(res.code);
      play('win');
      setCode(res.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that game.');
    } finally {
      setBusy(false);
    }
  };

  if (code) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
        <h1 className="animate-[pop_260ms_ease-out] text-3xl font-black">GAME READY 🎉</h1>
        <p className="mb-6 mt-1 text-sm text-[var(--color-muted)]">
          Send this link to your friends.
        </p>

        <div className="panel mb-5 w-full max-w-xs px-6 py-5 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            Room
          </div>
          <div className="gold-text text-6xl font-black tracking-[0.15em]">{code}</div>
          <div className="mt-2 truncate text-[11px] text-white/35">{gameUrl(code)}</div>
        </div>

        <div className="grid w-full max-w-xs gap-2">
          <Button
            variant="dark"
            size="lg"
            full
            onClick={async () => {
              if ((await shareGame(code)) === 'copied') {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }
            }}
          >
            {copied ? '✓ COPIED' : 'COPY LINK / SHARE'}
          </Button>
          <Button variant="gold" size="lg" full onClick={() => onReady(code)}>
            GO TO TABLE
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col px-5 py-8">
      <button onClick={onBack} className="btn mb-4 self-start text-sm text-[var(--color-muted)]">
        ← Back
      </button>
      <h1 className="mb-6 text-3xl font-black">New Game</h1>

      <div className="space-y-5">
        <Field label="Your nickname">
          <input
            className={inputClass}
            value={name}
            maxLength={14}
            autoFocus
            placeholder="Alex"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Game type">
          <Choice
            value={mode}
            onChange={setMode}
            options={[
              { value: 'cash', label: '💵 Cash' },
              { value: 'tournament', label: '🏆 Tournament' },
            ]}
          />
        </Field>

        <Field label="Starting stack">
          <div className="grid grid-cols-5 gap-1.5">
            {STACKS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={stack === s ? 'gold' : 'dark'}
                onClick={() => setStack(s)}
              >
                {s >= 1000 ? `${s / 1000}K` : s}
              </Button>
            ))}
          </div>
          <input
            className={`${inputClass} mt-2`}
            inputMode="numeric"
            value={stack}
            onChange={(e) => setStack(Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>

        <Field label="Blinds" hint={`Big blind is ${fmt(BLINDS[blinds].bb)} — stacks are ${Math.floor(stack / BLINDS[blinds].bb)} BB deep.`}>
          <Choice
            value={blinds}
            onChange={setBlinds}
            options={BLINDS.map((b, i) => ({ value: i, label: b.label }))}
          />
        </Field>

        <Field
          label="Seats at the table"
          hint="Any number from 2 to 10. Empty seats are fine — friends can join later."
        >
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              variant="dark"
              disabled={seats <= 2}
              onClick={() => setSeats((n) => Math.max(2, n - 1))}
              aria-label="One fewer seat"
            >
              −
            </Button>
            <div className="flex-1 rounded-2xl border border-white/10 bg-black/30 py-2.5 text-center">
              <span className="text-3xl font-black text-[var(--color-gold)]">{seats}</span>
            </div>
            <Button
              size="lg"
              variant="dark"
              disabled={seats >= 10}
              onClick={() => setSeats((n) => Math.min(10, n + 1))}
              aria-label="One more seat"
            >
              +
            </Button>
          </div>
        </Field>
      </div>

      {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}

      <Button
        variant="gold"
        size="lg"
        full
        className="mt-6"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? 'DEALING IN…' : 'CREATE GAME'}
      </Button>
    </div>
  );
}
