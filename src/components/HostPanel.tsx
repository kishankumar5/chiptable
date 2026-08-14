import { useState } from 'react';
import type { Command, GameState, Player } from '../engine/types.ts';
import { fmt } from '../engine/engine.ts';
import { Button, Field, Sheet, inputClass } from './ui.tsx';
import { isSoundOn, toggleSound } from '../lib/sound.ts';
import { shareGame } from '../lib/share.ts';

interface Props {
  state: GameState;
  me: Player;
  isHost: boolean;
  hostGone: boolean;
  open: boolean;
  onClose: () => void;
  send: (cmd: Omit<Command, 'actor'>) => Promise<boolean>;
}

/** Everything that isn't "whose turn is it" lives behind this one button. */
export function HostPanel({ state, me, isHost, hostGone, open, onClose, send }: Props) {
  const [sound, setSound] = useState(isSoundOn());
  const [sb, setSb] = useState(String(state.sb));
  const [bb, setBb] = useState(String(state.bb));
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);

  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const midHand = Boolean(state.street);

  return (
    <Sheet open={open} onClose={onClose} title={isHost ? 'Table Settings' : 'Options'}>
      <div className="space-y-5 pb-4">
        {/* --- Sharing ------------------------------------------------ */}
        <section>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Room
              </div>
              <div className="text-2xl font-black tracking-[0.3em] text-[var(--color-gold)]">
                {state.code}
              </div>
            </div>
            <Button
              variant="gold"
              size="lg"
              onClick={async () => {
                const how = await shareGame(state.code);
                if (how === 'copied') {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }
              }}
            >
              {copied ? 'Copied!' : 'Share'}
            </Button>
          </div>
        </section>

        {/* --- Everyone ----------------------------------------------- */}
        <section className="grid grid-cols-2 gap-2">
          <Button
            variant="dark"
            onClick={() => setSound(toggleSound())}
          >
            {sound ? '🔊 Sound On' : '🔇 Sound Off'}
          </Button>
          <Button
            variant="dark"
            onClick={() => void send({ type: 'sit', sittingOut: !me.sittingOut })}
          >
            {me.sittingOut ? 'Sit back in' : 'Sit out next hand'}
          </Button>
          {/* Chips are money, so only the host hands them out. Players ask. */}
          {state.mode === 'cash' && isHost && (
            <Button
              variant="dark"
              disabled={midHand}
              onClick={() => void send({ type: 'rebuy', amount: state.startingStack })}
            >
              Rebuy {fmt(state.startingStack)}
            </Button>
          )}
          {state.mode === 'cash' && isHost && (
            <Button variant="dark" disabled={midHand} onClick={() => void send({ type: 'cash-out' })}>
              Cash out
            </Button>
          )}
          {/* Only ever offered when the host has genuinely vanished, so a table
              cannot be taken over while they are sitting right there. */}
          {hostGone && !isHost && (
            <Button variant="gold" full onClick={() => void send({ type: 'claim-host' })}>
              👑 Host has been away 2 minutes — take over
            </Button>
          )}
        </section>

        {!isHost && state.mode === 'cash' && (
          <p className="-mt-1 text-center text-[11px] text-[var(--color-muted)]">
            Need chips or want to cash out? Ask the host — only they can move money.
          </p>
        )}

        {!isHost && (
          <p className="text-center text-[11px] text-[var(--color-muted)]">
            The host runs the table. Ask them to deal the next hand.
          </p>
        )}

        {isHost && (
          <>
            {/* --- Hand flow ------------------------------------------ */}
            <section>
              <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Hand
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {state.status === 'lobby' ? (
                  <Button
                    variant="gold"
                    size="lg"
                    className="col-span-2"
                    onClick={async () => (await send({ type: 'start-game' })) && onClose()}
                  >
                    START GAME
                  </Button>
                ) : (
                  <Button
                    variant="gold"
                    disabled={midHand}
                    onClick={async () => (await send({ type: 'start-hand' })) && onClose()}
                  >
                    Next hand
                  </Button>
                )}
                <Button variant="dark" onClick={() => void send({ type: 'reset-hand' })}>
                  Reset hand
                </Button>
                {/* The way back from a misclick — one step, no questions. */}
                <Button
                  variant="dark"
                  className="col-span-2"
                  disabled={!state.undo}
                  onClick={() => void send({ type: 'undo' })}
                >
                  ↩︎ Undo last action
                </Button>
                {state.tourney && (
                  <Button variant="dark" onClick={() => void send({ type: 'toggle-pause' })}>
                    {state.tourney.paused ? 'Resume clock' : 'Pause clock'}
                  </Button>
                )}
              </div>
            </section>

            {/* --- Blinds --------------------------------------------- */}
            <section>
              <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Blinds
              </h3>
              <div className="flex items-end gap-2">
                <Field label="Small">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={sb}
                    onChange={(e) => setSb(e.target.value)}
                  />
                </Field>
                <Field label="Big">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={bb}
                    onChange={(e) => setBb(e.target.value)}
                  />
                </Field>
                <Button
                  variant="gold"
                  size="lg"
                  onClick={() => void send({ type: 'set-blinds', sb: Number(sb), bb: Number(bb) })}
                >
                  Set
                </Button>
              </div>
            </section>

            {/* --- Table size ----------------------------------------- */}
            <section>
              <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Seats
              </h3>
              <div className="flex items-center gap-3">
                <Button
                  size="lg"
                  variant="dark"
                  disabled={state.maxSeats <= 2}
                  onClick={() => void send({ type: 'set-seats', seat: state.maxSeats - 1 })}
                  aria-label="One fewer seat"
                >
                  −
                </Button>
                <div className="flex-1 rounded-2xl border border-white/10 bg-black/30 py-2 text-center">
                  <span className="text-2xl font-black text-[var(--color-gold)]">
                    {state.maxSeats}
                  </span>
                  <span className="ml-2 text-[11px] text-[var(--color-muted)]">seats</span>
                </div>
                <Button
                  size="lg"
                  variant="dark"
                  disabled={state.maxSeats >= 10}
                  onClick={() => void send({ type: 'set-seats', seat: state.maxSeats + 1 })}
                  aria-label="One more seat"
                >
                  +
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                Add a seat if another friend turns up mid-game.
              </p>
              {/* Locked by default once play starts, so nobody wanders in. */}
              <Button
                variant={state.locked ? 'gold' : 'dark'}
                full
                className="mt-2"
                onClick={() => void send({ type: 'set-lock', locked: !state.locked })}
              >
                {state.locked ? '🔒 Table locked — tap to open' : '🔓 Anyone with the code can join'}
              </Button>
            </section>

            {/* --- Players -------------------------------------------- */}
            <section>
              <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Players
              </h3>
              <div className="space-y-2">
                {players.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-black text-ink">
                          {p.name}
                          {p.id === state.hostId && ' 👑'}
                          {p.leftTable && (
                            <span className="ml-1 text-[10px] text-white/40">(out)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--color-muted)]">
                          Seat {p.seat + 1} · {fmt(p.stack)} · bought in {fmt(p.buyIn)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(editing === p.id ? null : p.id);
                          setAmount(String(p.stack));
                        }}
                      >
                        {editing === p.id ? 'Done' : 'Manage'}
                      </Button>
                    </div>

                    {editing === p.id && (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <div className="flex gap-2">
                          <input
                            className={inputClass}
                            inputMode="numeric"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                          />
                          <Button
                            variant="gold"
                            onClick={() =>
                              void send({
                                type: 'set-stack',
                                target: p.id,
                                amount: Number(amount),
                              })
                            }
                          >
                            Set stack
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="dark"
                            disabled={midHand}
                            onClick={() =>
                              void send({
                                type: 'rebuy',
                                target: p.id,
                                amount: Number(amount) || state.startingStack,
                              })
                            }
                          >
                            Add chips
                          </Button>
                          <Button
                            variant="dark"
                            disabled={midHand}
                            onClick={() => void send({ type: 'set-dealer', target: p.id })}
                          >
                            Make dealer
                          </Button>
                          <Button
                            variant="dark"
                            disabled={midHand}
                            onClick={() => {
                              const seat = Number(prompt('Move to seat number (1-' + state.maxSeats + ')') ?? '');
                              if (seat) void send({ type: 'move-seat', target: p.id, seat: seat - 1 });
                            }}
                          >
                            Move seat
                          </Button>
                          {/* Works mid-hand too: they get folded out first. */}
                          <Button
                            variant="danger"
                            onClick={() => void send({ type: 'remove-player', target: p.id })}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <Button
              variant="danger"
              size="lg"
              full
              onClick={async () => (await send({ type: 'end-game' })) && onClose()}
            >
              END GAME
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
