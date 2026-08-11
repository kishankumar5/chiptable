import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../hooks/useGame.ts';
import { fmt, seatRoles, totalPot } from '../engine/engine.ts';
import type { GameState } from '../engine/types.ts';
import { EmptySeat, Seat } from '../components/Seat.tsx';
import { ChipStack } from '../components/Chips.tsx';
import { ActionBar } from '../components/ActionBar.tsx';
import { ActivityFeed } from '../components/ActivityFeed.tsx';
import { AwardSheet } from '../components/AwardSheet.tsx';
import { HostPanel } from '../components/HostPanel.tsx';
import { TourneyClock } from '../components/TourneyClock.tsx';
import { EndScreen } from '../components/EndScreen.tsx';
import { useFlights } from '../components/ChipFlight.tsx';
import { Button, Toast } from '../components/ui.tsx';
import { buzz, play } from '../lib/sound.ts';

/** Seat coordinates on an ellipse, starting at the bottom and going clockwise. */
export function seatPosition(index: number, count: number) {
  const theta = Math.PI / 2 - (index / count) * Math.PI * 2;
  return { x: 50 + 41 * Math.cos(theta), y: 50 + 38 * Math.sin(theta) };
}

/** The app manages chips; these tell the table when to touch the cards. */
const DEAL_CUES: Partial<Record<string, string>> = {
  flop: 'DEAL THE FLOP\nThree cards face up',
  turn: 'DEAL THE TURN\nOne card face up',
  river: 'DEAL THE RIVER\nOne card face up',
  showdown: 'SHOWDOWN\nShow your cards',
};

const STREET_LABEL: Record<string, string> = {
  preflop: 'PRE-FLOP',
  flop: 'FLOP',
  turn: 'TURN',
  river: 'RIVER',
  showdown: 'SHOWDOWN',
};

/** Face-down card backs — the only cards ChipTable ever draws. */
function CardBacks({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="h-5 w-3.5 animate-[pop_180ms_ease-out] rounded-[3px] border border-white/25 bg-gradient-to-br from-[#c0392b] to-[#7b241c] shadow"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </span>
  );
}

const CARDS_ON_TABLE: Record<string, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  showdown: 5,
};

interface Props {
  game: Game;
  me: string;
  onLeave: () => void;
  onJoinNeeded: () => void;
}

/**
 * Everything the player looks at during a hand. Kept free of data-fetching so
 * it can be rendered against any game state.
 */
export function TableView({ game, me, onLeave, onJoinNeeded }: Props) {
  const { state, connection, error, clearError, send, reconnect } = game;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [awardOpen, setAwardOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const { fly, layer } = useFlights();

  const potRef = useRef<HTMLDivElement | null>(null);
  const seatEls = useRef<Record<string, HTMLDivElement | null>>({});
  const prev = useRef<GameState | null>(null);

  const player = state?.players.find((p) => p.id === me) ?? null;
  const isHost = state?.hostId === me;

  /* --- Reactions to state changes --------------------------------- */
  useEffect(() => {
    if (!state) return;
    const before = prev.current;
    prev.current = state;
    if (!before) return;

    // Chips forward: anyone whose street bet grew.
    for (const p of state.players) {
      const was = before.players.find((o) => o.id === p.id);
      if (was && p.bet > was.bet) {
        fly(seatEls.current[p.id] ?? null, potRef.current, p.bet - was.bet);
        if (p.id !== me) play('chip');
      }
    }

    // Pot awarded: chips travel back out to whoever gained.
    if (before.pot > 0 && state.pot === 0) {
      let anyWinner = false;
      for (const p of state.players) {
        const was = before.players.find((o) => o.id === p.id);
        if (was && p.stack > was.stack) {
          fly(potRef.current, seatEls.current[p.id] ?? null, p.stack - was.stack, true);
          anyWinner = true;
        }
      }
      if (anyWinner) play('win');
    }

    // Nobody is dealing cards for you — say out loud when to turn them over.
    if (state.street !== before.street && state.street) {
      const cue = DEAL_CUES[state.street];
      if (cue) {
        setBanner(cue);
        play('hand');
        setTimeout(() => setBanner(null), 2600);
      }
    }

    if (state.handNo !== before.handNo && state.handNo > 0) {
      const dealer = state.players.find((p) => p.seat === state.dealerSeat);
      setBanner(
        `NEW HAND\nDealer: ${dealer?.name ?? '—'}\nBlinds: ${fmt(state.sb)} / ${fmt(state.bb)}\nDeal two cards each`,
      );
      play('hand');
      setTimeout(() => setBanner(null), 2600);
    }

    if (state.turn === me && before.turn !== me) {
      play('turn');
      buzz([18, 60, 18]);
    }
  }, [state, me, fly]);

  // The host's heartbeat is what lets the table notice they've vanished.
  useEffect(() => {
    if (!isHost) return;
    const id = setInterval(() => void send({ type: 'heartbeat' }), 20_000);
    return () => clearInterval(id);
  }, [isHost, send]);

  const roles = useMemo(
    () => (state ? seatRoles(state) : { dealer: null, sb: null, bb: null }),
    [state],
  );

  const seatRefFor = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      seatEls.current[id] = el;
    },
    [],
  );

  /* --- Shells ------------------------------------------------------ */
  if (connection === 'missing') {
    return (
      <Shell>
        <p className="text-lg font-bold">That table isn't here anymore.</p>
        <p className="mb-6 mt-1 text-sm text-[var(--color-muted)]">
          Games are cleared out after a day of quiet.
        </p>
        <Button variant="gold" size="lg" onClick={onLeave}>
          BACK TO START
        </Button>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <div className="mb-4 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 animate-[pulseTurn_1.2s_ease-in-out_infinite] rounded-full bg-[var(--color-gold)]"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          {connection === 'dropped' ? 'Oops — connection dropped.' : 'Taking a seat…'}
        </p>
        {connection === 'dropped' && (
          <Button variant="gold" size="lg" className="mt-4" onClick={reconnect}>
            RECONNECT
          </Button>
        )}
      </Shell>
    );
  }

  if (state.status === 'ended') {
    return <EndScreen state={state} isHost={isHost} send={send} onLeave={onLeave} />;
  }

  if (!player || player.leftTable) {
    return (
      <Shell>
        <p className="text-lg font-bold">You're not seated at this table.</p>
        <Button variant="gold" size="lg" className="mt-4" onClick={onJoinNeeded}>
          JOIN THIS GAME
        </Button>
      </Shell>
    );
  }

  const host = state.players.find((p) => p.id === state.hostId);
  const hostGone = !host || host.leftTable || Date.now() - host.lastSeen > 45_000;
  const pot = totalPot(state);
  const seatsAtTable = state.players.filter((p) => !p.leftTable);
  const rotate = (seat: number) => (seat - player.seat + state.maxSeats) % state.maxSeats;

  return (
    <div className="flex h-full flex-col">
      {layer}

      {/* --- Top bar ------------------------------------------------- */}
      <header className="flex items-center gap-2 px-3 pt-[calc(0.5rem+var(--sat))]">
        <button
          onClick={() => setSettingsOpen(true)}
          className="btn flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/40 px-3 py-1.5"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connection === 'live' ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="text-sm font-black tracking-[0.2em] text-[var(--color-gold)]">
            {state.code}
          </span>
        </button>

        <div className="flex-1" />

        {state.tourney ? (
          <TourneyClock state={state} isHost={isHost} send={send} />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-black">
            <span className="text-[var(--color-muted)]">BLINDS </span>
            {fmt(state.sb)} / {fmt(state.bb)}
          </div>
        )}

        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="btn grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-black/40 text-base"
        >
          ⚙️
        </button>
      </header>

      {/* --- The table ------------------------------------------------ */}
      <div className="relative min-h-0 flex-1 px-3 py-3">
        <div className="felt relative h-full w-full rounded-[46%/32%] border-[6px] border-[#4a3418] shadow-[inset_0_0_60px_rgb(0,0,0,0.55),0_20px_50px_rgb(0,0,0,0.5)]">
          <div className="absolute inset-3 rounded-[46%/32%] border border-white/5" />

          <div
            ref={potRef}
            className="absolute left-1/2 top-[46%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          >
            {state.street && (
              <div className="mb-1 flex flex-col items-center gap-1">
                <span className="rounded-full border border-white/10 bg-black/45 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/70">
                  {STREET_LABEL[state.street]}
                </span>
                <CardBacks count={CARDS_ON_TABLE[state.street] ?? 0} />
              </div>
            )}
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">
              Pot
            </div>
            <div
              key={pot}
              className="animate-[pop_180ms_ease-out] text-3xl font-black text-[var(--color-gold)] drop-shadow-[0_2px_8px_rgb(0,0,0,0.6)]"
            >
              {fmt(pot)}
            </div>
            <div className="mt-1 h-8">
              <ChipStack amount={state.pot} size={16} max={10} />
            </div>
          </div>

          {Array.from({ length: state.maxSeats }).map((_, seat) => {
            const p = seatsAtTable.find((x) => x.seat === seat);
            const { x, y } = seatPosition(rotate(seat), state.maxSeats);
            if (!p) return <EmptySeat key={seat} seat={seat} x={x} y={y} />;
            return (
              <Seat
                key={p.id}
                player={p}
                roles={roles}
                isTurn={state.turn === p.id}
                isHost={p.id === state.hostId}
                isMe={p.id === me}
                x={x}
                y={y}
                seatRef={seatRefFor(p.id)}
              />
            );
          })}

        </div>

        {banner && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="animate-[banner_2.6s_ease-out_forwards] whitespace-pre-line rounded-3xl border border-[var(--color-gold)]/40 bg-black/85 px-8 py-5 text-center text-lg font-black leading-snug shadow-2xl">
              {banner}
            </div>
          </div>
        )}
      </div>

      {/* --- Bottom ---------------------------------------------------- */}
      <ActivityFeed log={state.log} />

      {state.awaitingPayout ? (
        <div className="px-3 pb-[calc(0.75rem+var(--sab))] pt-2">
          {isHost ? (
            <Button variant="gold" size="lg" full onClick={() => setAwardOpen(true)}>
              AWARD POT — {fmt(pot)}
            </Button>
          ) : (
            <div className="panel px-4 py-4 text-center text-sm font-bold text-[var(--color-muted)]">
              Showdown — {host?.name ?? 'the host'} is awarding {fmt(pot)}
            </div>
          )}
        </div>
      ) : state.status === 'running' && state.street ? (
        <ActionBar state={state} me={player} isHost={isHost} send={send} />
      ) : (
        <div className="px-3 pb-[calc(0.75rem+var(--sab))] pt-2">
          {isHost ? (
            <Button
              variant="gold"
              size="lg"
              full
              onClick={() =>
                void send({ type: state.status === 'lobby' ? 'start-game' : 'start-hand' })
              }
            >
              {state.status === 'lobby' ? 'START GAME' : 'DEAL NEXT HAND'}
            </Button>
          ) : (
            <div className="panel flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-bold text-[var(--color-muted)]">
                Waiting for {host?.name ?? 'the host'}…
              </span>
              <span className="text-xl font-black text-[var(--color-gold)]">
                {fmt(player.stack)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* --- Overlays --------------------------------------------------- */}
      <HostPanel
        state={state}
        me={player}
        isHost={isHost}
        hostGone={hostGone}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        send={send}
      />
      <AwardSheet state={state} open={awardOpen} onClose={() => setAwardOpen(false)} send={send} />
      {error && <Toast message={error} onDismiss={clearError} />}
      {connection === 'dropped' && (
        <button
          onClick={reconnect}
          className="btn fixed inset-x-0 bottom-0 z-30 bg-amber-500/90 py-2 text-center text-sm font-black text-black"
        >
          Oops — connection dropped. Tap to reconnect.
        </button>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
