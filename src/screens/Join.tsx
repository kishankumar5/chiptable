import { useEffect, useState } from 'react';
import { Button, Field, inputClass } from '../components/ui.tsx';
import { fetchGame, sendCommand } from '../lib/api.ts';
import { lastName, playerId, rememberName, rememberRoom } from '../lib/session.ts';
import type { GameState } from '../engine/types.ts';
import { fmt } from '../engine/engine.ts';

/** Code → nickname → seat. Three taps and you're playing. */
export function Join({
  initialCode = '',
  onJoined,
  onBack,
}: {
  initialCode?: string;
  onJoined: (code: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [name, setName] = useState(lastName());
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const me = playerId();

  const look = async (roomCode: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetchGame(roomCode);
      setGame(res.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That room code doesn't exist.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialCode) void look(initialCode.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const join = async (seat?: number) => {
    const nick = name.trim();
    if (!nick) return setError('Pick a nickname first.');
    setBusy(true);
    setError('');
    try {
      await sendCommand(code, { type: 'join', actor: me, name: nick, seat });
      rememberName(nick);
      rememberRoom(code);
      onJoined(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const taken = new Set(game?.players.filter((p) => !p.leftTable).map((p) => p.seat) ?? []);
  const alreadySeated = game?.players.some((p) => p.id === me && !p.leftTable);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col px-5 py-8">
      <button onClick={onBack} className="btn mb-4 self-start text-sm text-[var(--color-muted)]">
        ← Back
      </button>
      <h1 className="mb-6 text-3xl font-black">Join Game</h1>

      {!game ? (
        <div className="space-y-5">
          <Field label="Room code">
            <input
              className={`${inputClass} text-center text-3xl tracking-[0.25em]`}
              value={code}
              maxLength={8}
              autoFocus
              autoCapitalize="characters"
              placeholder="K7PXQ2"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </Field>
          <Button
            variant="gold"
            size="lg"
            full
            disabled={busy || code.length < 4}
            onClick={() => void look(code)}
          >
            {busy ? 'LOOKING…' : 'FIND TABLE'}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="panel px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Room {game.code} · {game.mode === 'cash' ? 'Cash game' : 'Tournament'}
            </div>
            <div className="text-sm font-bold">
              Blinds {fmt(game.sb)} / {fmt(game.bb)} · Buy-in {fmt(game.startingStack)}
            </div>
          </div>

          <Field label="Your nickname">
            <input
              className={inputClass}
              value={name}
              maxLength={14}
              autoFocus
              placeholder="Sam"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          {alreadySeated ? (
            <Button variant="gold" size="lg" full disabled={busy} onClick={() => void join()}>
              RETURN TO YOUR SEAT
            </Button>
          ) : (
            <Field label="Pick a seat">
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: game.maxSeats }).map((_, i) => (
                  <Button
                    key={i}
                    variant={taken.has(i) ? 'ghost' : 'dark'}
                    size="lg"
                    disabled={taken.has(i) || busy}
                    onClick={() => void join(i)}
                  >
                    {taken.has(i)
                      ? game.players.find((p) => p.seat === i && !p.leftTable)?.name.slice(0, 6)
                      : `Seat ${i + 1}`}
                  </Button>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}
    </div>
  );
}
