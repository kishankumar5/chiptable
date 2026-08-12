// The single source of truth for every rule in ChipTable.
//
// This module is pure: `reduce(state, command)` returns a brand new state or
// throws a GameError. The Edge Function runs it against the row it just read
// (authoritative), and the browser runs the exact same code to paint an
// optimistic result instantly. Same code, same answer.

import type {
  BlindLevel,
  Command,
  GameState,
  LogKind,
  Player,
  PlayerStats,
  Pot,
  Street,
} from './types.ts';

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

// Declared as a function (not an arrow const) so TypeScript treats a call to
// it as unreachable-after, which narrows types at every call site.
function fail(msg: string): never {
  throw new GameError(msg);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const chips = (n: number) => Math.max(0, Math.round(n));

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function makeRoomCode(len = 4): string {
  let out = '';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function makeId(): string {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

const byId = (s: GameState, id: string | null | undefined): Player | undefined =>
  s.players.find((p) => p.id === id);

const need = (s: GameState, id: string | null | undefined): Player =>
  byId(s, id) ?? fail('You are not seated at this table.');

const seated = (s: GameState): Player[] =>
  s.players.filter((p) => !p.leftTable).sort((a, b) => a.seat - b.seat);

const live = (s: GameState): Player[] => s.players.filter((p) => p.inHand && !p.folded);

const actionable = (s: GameState): Player[] => live(s).filter((p) => !p.allIn);

function assertHost(s: GameState, actor: string) {
  if (s.hostId !== actor) fail('Only the host can do that.');
}

function log(s: GameState, kind: LogKind, msg: string, t: number) {
  s.log.unshift({ t, kind, msg });
  if (s.log.length > 60) s.log.length = 60;
}

/** Next seat clockwise from `from` whose player passes `ok`. */
function nextSeat(s: GameState, from: number | null, ok: (p: Player) => boolean): Player | null {
  const ring = seated(s).filter(ok);
  if (!ring.length) return null;
  if (from === null) return ring[0];
  for (const p of ring) if (p.seat > from) return p;
  return ring[0];
}

const dealtIn = (p: Player) => !p.leftTable && !p.sittingOut && p.stack > 0;

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export interface CreateOptions {
  code: string;
  hostId: string;
  hostName: string;
  mode: 'cash' | 'tournament';
  startingStack: number;
  sb: number;
  bb: number;
  ante?: number;
  maxSeats: number;
  levels?: BlindLevel[];
  now?: number;
}

export function createGame(o: CreateOptions): GameState {
  const t = o.now ?? Date.now();
  if (o.sb <= 0 || o.bb <= 0) fail('Blinds must be greater than zero.');
  if (o.bb < o.sb) fail('The big blind must be at least the small blind.');
  if (o.startingStack < o.bb) fail('The starting stack must cover a big blind.');
  const maxSeats = Math.min(10, Math.max(2, o.maxSeats));

  const state: GameState = {
    code: o.code,
    mode: o.mode,
    status: 'lobby',
    hostId: o.hostId,
    maxSeats,
    locked: false,
    sb: o.sb,
    bb: o.bb,
    ante: o.ante ?? 0,
    startingStack: o.startingStack,
    players: [],
    dealerSeat: null,
    handNo: 0,
    street: null,
    pot: 0,
    currentBet: 0,
    minRaise: o.bb,
    turn: null,
    lastAggressor: null,
    pots: [],
    awaitingPayout: false,
    claims: {},
    claimsDisputed: false,
    log: [],
    stats: { handsPlayed: 0, biggestPot: 0, biggestPotWinner: null, players: {} },
    undo: null,
    tourney:
      o.mode === 'tournament'
        ? {
            levels: o.levels?.length ? o.levels : defaultLevels(o.sb, o.bb),
            level: 0,
            endsAt: null,
            remaining: (o.levels?.[0]?.duration ?? 900),
            paused: true,
          }
        : null,
    createdAt: t,
    updatedAt: t,
  };

  addPlayer(state, o.hostId, o.hostName, 0, t);
  log(state, 'info', 'Table opened', t);
  return state;
}

/** Eight escalating levels with a break at level 5 — a sane default. */
export function defaultLevels(sb: number, bb: number): BlindLevel[] {
  const levels: BlindLevel[] = [];
  let s = sb;
  let b = bb;
  for (let i = 0; i < 8; i++) {
    if (i === 4) levels.push({ sb: s, bb: b, ante: 0, duration: 300, isBreak: true });
    levels.push({ sb: s, bb: b, ante: 0, duration: 900 });
    s = s * 2;
    b = b * 2;
  }
  return levels;
}

function addPlayer(s: GameState, id: string, name: string, seat: number, t: number): Player {
  const p: Player = {
    id,
    name: name.slice(0, 14),
    seat,
    stack: s.startingStack,
    bet: 0,
    committed: 0,
    buyIn: s.startingStack,
    cashedOut: 0,
    leftTable: false,
    inHand: false,
    folded: false,
    allIn: false,
    acted: false,
    sittingOut: false,
    lastSeen: t,
  };
  s.players.push(p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Hand lifecycle                                                      */
/* ------------------------------------------------------------------ */

function commit(p: Player, amount: number) {
  const n = Math.min(chips(amount), p.stack);
  p.stack -= n;
  p.bet += n;
  p.committed += n;
  if (p.stack === 0) p.allIn = true;
  return n;
}

function startHand(s: GameState, t: number) {
  const ready = seated(s).filter(dealtIn);
  if (ready.length < 2) fail('You need at least two players with chips.');

  s.handNo += 1;
  s.stats.handsPlayed += 1;
  s.street = 'preflop';
  s.pot = 0;
  s.currentBet = 0;
  s.pots = [];
  s.awaitingPayout = false;
  s.claims = {};
  s.claimsDisputed = false;
  s.lastAggressor = null;
  s.minRaise = s.bb;

  for (const p of s.players) {
    p.bet = 0;
    p.committed = 0;
    p.folded = false;
    p.allIn = false;
    p.acted = false;
    p.inHand = dealtIn(p);
  }

  // Move the button to the next player who is actually in the hand.
  const dealer = nextSeat(s, s.dealerSeat, (p) => p.inHand) ?? ready[0];
  s.dealerSeat = dealer.seat;

  const headsUp = ready.length === 2;
  const sbPlayer = headsUp ? dealer : nextSeat(s, dealer.seat, (p) => p.inHand)!;
  const bbPlayer = nextSeat(s, sbPlayer.seat, (p) => p.inHand)!;

  if (s.ante > 0) for (const p of s.players.filter((x) => x.inHand)) commit(p, s.ante);
  // Antes belong to the pot, not to anyone's street bet.
  if (s.ante > 0) {
    for (const p of s.players.filter((x) => x.inHand)) {
      s.pot += p.bet;
      p.bet = 0;
    }
  }

  commit(sbPlayer, s.sb);
  commit(bbPlayer, s.bb);
  s.currentBet = Math.max(sbPlayer.bet, bbPlayer.bet);

  // Blinds are forced, so the blind posters still get to act.
  sbPlayer.acted = false;
  bbPlayer.acted = false;

  const first = headsUp ? sbPlayer : nextSeat(s, bbPlayer.seat, (p) => p.inHand && !p.allIn);
  s.turn = (first ?? null)?.id ?? null;

  log(
    s,
    'hand',
    `Hand #${s.handNo} — dealer ${dealer.name}, blinds ${s.sb}/${s.bb}`,
    t,
  );
  if (!s.turn) progress(s, t); // everyone is all-in from the blinds
}

function collectBets(s: GameState) {
  for (const p of s.players) {
    s.pot += p.bet;
    p.bet = 0;
    p.acted = false;
  }
  s.currentBet = 0;
  s.minRaise = s.bb;
}

const NEXT_STREET: Record<string, Street> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'showdown',
};

/** Advance the hand as far as the current bets allow. */
function progress(s: GameState, t: number) {
  const contenders = live(s);

  if (contenders.length === 1) {
    // Everyone folded — no showdown needed, pay it out right now.
    collectBets(s);
    const winner = contenders[0];
    const amount = s.pot;
    winner.stack += amount;
    recordWin(s, winner, amount, false);
    log(s, 'win', `${winner.name} won ${fmt(amount)} (uncontested)`, t);
    endHand(s);
    return;
  }

  const canAct = actionable(s);
  const settled =
    canAct.length === 0 || canAct.every((p) => p.acted && p.bet === s.currentBet);

  if (!settled) {
    const from = byId(s, s.turn)?.seat ?? s.dealerSeat;
    const next = nextSeat(s, from ?? null, (p) => p.inHand && !p.folded && !p.allIn);
    s.turn = next ? next.id : null;
    if (!next) toShowdown(s, t);
    return;
  }

  collectBets(s);

  // One player left who can act means no more betting is possible.
  if (canAct.length <= 1 || s.street === 'river') {
    toShowdown(s, t);
    return;
  }

  s.street = NEXT_STREET[s.street!];
  s.lastAggressor = null;
  const first = nextSeat(s, s.dealerSeat, (p) => p.inHand && !p.folded && !p.allIn);
  s.turn = first ? first.id : null;
  if (!first) toShowdown(s, t);
}

function toShowdown(s: GameState, t: number) {
  collectBets(s);
  s.street = 'showdown';
  s.turn = null;
  s.pots = buildPots(s);
  s.awaitingPayout = true;
  log(s, 'hand', `Showdown — ${fmt(s.pot)} to award`, t);
}

/**
 * Split total contributions into a main pot plus side pots. Folded players'
 * chips stay in the pot as dead money but win nothing.
 */
export function buildPots(s: GameState): Pot[] {
  const contributors = s.players.filter((p) => p.committed > 0);
  if (!contributors.length) return [];

  const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;

  for (const level of levels) {
    let amount = 0;
    for (const p of contributors) amount += Math.max(0, Math.min(p.committed, level) - prev);
    const eligible = contributors
      .filter((p) => !p.folded && p.inHand && p.committed >= level)
      .map((p) => p.id);
    prev = level;
    if (amount <= 0 || eligible.length === 0) {
      // Nobody can win it (everyone at this level folded) — fold it forward.
      if (pots.length) pots[pots.length - 1].amount += amount;
      continue;
    }
    const last = pots[pots.length - 1];
    if (last && sameSet(last.eligible, eligible)) last.amount += amount;
    else pots.push({ label: '', amount, eligible });
  }

  pots.forEach((p, i) => {
    p.label = i === 0 ? 'Main Pot' : `Side Pot ${i}`;
  });
  return pots;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

function endHand(s: GameState) {
  s.street = null;
  s.turn = null;
  s.pot = 0;
  s.pots = [];
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.awaitingPayout = false;
  s.claims = {};
  s.claimsDisputed = false;
  s.lastAggressor = null;
  for (const p of s.players) {
    p.bet = 0;
    p.committed = 0;
    p.inHand = false;
    p.folded = false;
    p.allIn = false;
    p.acted = false;
  }
}

/* ------------------------------------------------------------------ */
/* Betting                                                             */
/* ------------------------------------------------------------------ */

function applyMove(s: GameState, p: Player, cmd: Command, t: number) {
  if (s.turn !== p.id) fail("It's not your turn.");
  const toCall = s.currentBet - p.bet;

  switch (cmd.move) {
    case 'fold': {
      p.folded = true;
      p.acted = true;
      log(s, 'fold', `${p.name} folded`, t);
      break;
    }
    case 'check': {
      if (toCall > 0) fail(`You have ${fmt(toCall)} to call.`);
      p.acted = true;
      log(s, 'bet', `${p.name} checked`, t);
      break;
    }
    case 'call': {
      if (toCall <= 0) {
        p.acted = true;
        log(s, 'bet', `${p.name} checked`, t);
        break;
      }
      const paid = commit(p, toCall);
      p.acted = true;
      log(s, 'bet', `${p.name} called ${fmt(paid)}${p.allIn ? ' (all in)' : ''}`, t);
      break;
    }
    case 'allin':
    case 'raise': {
      const target = cmd.move === 'allin' ? p.bet + p.stack : chips(cmd.amount ?? 0);
      if (target <= p.bet) fail('That bet is too small.');
      const cost = target - p.bet;
      if (cost > p.stack) fail("You don't have that many chips.");
      const isAllIn = cost === p.stack;
      const minTarget = s.currentBet > 0 ? s.currentBet + s.minRaise : Math.max(s.bb, s.minRaise);
      if (target < minTarget && !isAllIn) {
        fail(`Minimum is ${fmt(minTarget)}.`);
      }

      const raiseBy = target - s.currentBet;
      const wasOpen = s.currentBet === 0;
      commit(p, cost);

      if (target > s.currentBet) {
        // An all-in short of a full raise does not reopen the betting.
        if (raiseBy >= s.minRaise) {
          s.minRaise = raiseBy;
          for (const o of actionable(s)) if (o.id !== p.id) o.acted = false;
          s.lastAggressor = p.id;
        }
        s.currentBet = target;
      }
      p.acted = true;
      const verb = wasOpen ? 'bet' : 'raised to';
      log(s, 'bet', `${p.name} ${verb} ${fmt(target)}${p.allIn ? ' — ALL IN' : ''}`, t);
      break;
    }
    default:
      fail('Unknown action.');
  }

  progress(s, t);
}

/* ------------------------------------------------------------------ */
/* Stats — tallied as we go so a summary never needs a replay          */
/* ------------------------------------------------------------------ */

function statsFor(s: GameState, id: string): PlayerStats {
  s.stats.players[id] ??= {
    handsWon: 0,
    chipsWon: 0,
    biggestPot: 0,
    potsUncontested: 0,
    showdownsWon: 0,
  };
  return s.stats.players[id];
}

function recordWin(s: GameState, p: Player, amount: number, atShowdown: boolean) {
  const st = statsFor(s, p.id);
  st.handsWon += 1;
  st.chipsWon += amount;
  st.biggestPot = Math.max(st.biggestPot, amount);
  if (atShowdown) st.showdownsWon += 1;
  else st.potsUncontested += 1;
  if (amount > s.stats.biggestPot) {
    s.stats.biggestPot = amount;
    s.stats.biggestPotWinner = p.name;
  }
}

/* ------------------------------------------------------------------ */
/* Showdown claims                                                     */
/* ------------------------------------------------------------------ */

/**
 * Work out each pot's winner from what the players themselves said. A pot is
 * settled when only one eligible player is still claiming it — either because
 * everyone else mucked, or because exactly one said they won. Anything less
 * clear-cut is left for the host, who can see the actual cards.
 */
function resolveClaims(s: GameState): { pot: number; winners: string[] }[] | null {
  if (!s.awaitingPayout || !s.pots.length) return null;

  const contenders = live(s);
  // Give everyone a chance to answer before deciding anything.
  const allAnswered = contenders.every((p) => s.claims[p.id]);
  const resolved: { pot: number; winners: string[] }[] = [];

  for (let i = 0; i < s.pots.length; i++) {
    const pot = s.pots[i];
    const standing = pot.eligible.filter((id) => s.claims[id] !== 'muck');
    const claiming = pot.eligible.filter((id) => s.claims[id] === 'win');

    if (standing.length === 1) resolved.push({ pot: i, winners: standing });
    else if (allAnswered && claiming.length === 1) resolved.push({ pot: i, winners: claiming });
    else return null; // still waiting, or two people both say they won
  }
  return resolved;
}

/**
 * Fold a player who has walked away, then let the hand carry on. Their chips
 * stay in the pot, exactly as if they had folded themselves.
 */
function foldAway(s: GameState, p: Player, t: number) {
  p.folded = true;
  p.acted = true;
  log(s, 'fold', `${p.name} folded — away from the table`, t);
  // Advance only when the table was actually waiting on them, or when they
  // were the last player standing between the pot and its winner.
  if (s.turn === p.id || live(s).length === 1) progress(s, t);
}

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

function award(s: GameState, assignments: { pot: number; winners: string[] }[], t: number) {
  if (!s.awaitingPayout) fail('There is no pot to award right now.');
  if (!assignments.length) fail('Pick a winner first.');

  let paid = 0;
  for (const a of assignments) {
    const pot = s.pots[a.pot];
    if (!pot) fail('That pot no longer exists.');
    const winners = a.winners.filter((w) => pot.eligible.includes(w));
    if (!winners.length) fail(`Pick a winner for the ${pot.label.toLowerCase()}.`);

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const id of winners) {
      const p = need(s, id);
      let amount = share;
      if (remainder > 0) {
        amount += 1;
        remainder -= 1;
      }
      p.stack += amount;
      paid += amount;
      recordWin(s, p, amount, true);
      log(s, 'win', `${p.name} won ${fmt(amount)} — ${pot.label}`, t);
    }
  }

  if (paid !== s.pot) {
    // Every chip must be accounted for; refuse a partial payout.
    fail('Award every pot before confirming.');
  }
  endHand(s);
}

/* ------------------------------------------------------------------ */
/* Tournament clock                                                    */
/* ------------------------------------------------------------------ */

function applyLevel(s: GameState, t: number) {
  const tr = s.tourney!;
  const level = tr.levels[tr.level];
  s.sb = level.sb;
  s.bb = level.bb;
  s.ante = level.ante;
  s.minRaise = level.bb;
  tr.remaining = level.duration;
  tr.endsAt = tr.paused ? null : t + level.duration * 1000;
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

/**
 * Fill in anything a game saved by an older version of the app is missing.
 * A hand in progress must survive a deploy — nobody should lose a pot because
 * the server was updated between two bets.
 */
export function normalize(s: GameState): GameState {
  s.locked ??= false;
  s.claims ??= {};
  s.claimsDisputed ??= false;
  s.undo ??= null;
  s.stats ??= { handsPlayed: 0, biggestPot: 0, biggestPotWinner: null, players: {} };
  s.stats.players ??= {};
  return s;
}

export function reduce(prev: GameState, cmd: Command): GameState {
  const s = normalize(clone(prev));
  const t = cmd.now ?? Date.now();
  s.updatedAt = t;

  // Remember where we were, so a misclick is one tap away from being undone.
  // Only one step is kept, and the snapshot never carries its own history.
  const snapshot = NEVER_UNDOABLE.has(cmd.type) ? null : clone(prev);
  if (snapshot) snapshot.undo = null;

  const me = byId(s, cmd.actor);
  if (me) me.lastSeen = t;

  switch (cmd.type) {
    case 'heartbeat':
      break;

    case 'join': {
      if (s.status === 'ended') fail('This game has finished.');
      const name = (cmd.name ?? '').trim();
      if (!name) fail('Pick a nickname.');
      const existing = byId(s, cmd.actor);
      if (existing) {
        // Reconnect: same device id gets its seat and stack back. A locked
        // table never shuts out someone who already has a seat.
        existing.leftTable = false;
        existing.name = name.slice(0, 14);
        break;
      }
      if (s.locked) fail('This table is locked. Ask the host to let you in.');
      const taken = new Set(s.players.filter((p) => !p.leftTable).map((p) => p.seat));
      let seat = cmd.seat;
      if (seat === undefined || taken.has(seat)) {
        seat = undefined;
        for (let i = 0; i < s.maxSeats; i++) {
          if (!taken.has(i)) {
            seat = i;
            break;
          }
        }
      }
      if (seat === undefined) fail('This table is full.');
      const p = addPlayer(s, cmd.actor, name, seat, t);
      if (s.status === 'running') p.sittingOut = false;
      log(s, 'join', `${p.name} joined`, t);
      break;
    }

    case 'rename': {
      const p = need(s, cmd.actor);
      p.name = (cmd.name ?? '').trim().slice(0, 14) || p.name;
      break;
    }

    case 'sit': {
      const p = need(s, cmd.actor);
      p.sittingOut = !!cmd.sittingOut;
      break;
    }

    case 'claim-host': {
      const host = byId(s, s.hostId);
      const gone = !host || host.leftTable || t - host.lastSeen > 45_000;
      if (!gone) fail('The host is still here.');
      const p = need(s, cmd.actor);
      s.hostId = p.id;
      log(s, 'host', `${p.name} is now the host`, t);
      break;
    }

    case 'start-game': {
      assertHost(s, cmd.actor);
      if (s.status === 'running') break;
      s.status = 'running';
      // Once cards are in the air, a stranger guessing the code shouldn't be
      // able to sit down. The host can reopen it from the settings sheet.
      s.locked = true;
      if (s.tourney) {
        s.tourney.paused = false;
        applyLevel(s, t);
      }
      log(s, 'hand', 'Game started', t);
      startHand(s, t);
      break;
    }

    case 'start-hand': {
      assertHost(s, cmd.actor);
      if (s.status !== 'running') fail('Start the game first.');
      if (s.street) fail('Finish the current hand first.');
      startHand(s, t);
      break;
    }

    case 'act': {
      const p = need(s, cmd.actor);
      if (s.status !== 'running' || !s.street) fail('No hand is in progress.');
      applyMove(s, p, cmd, t);
      break;
    }

    case 'claim': {
      // Players settle their own showdowns. The host only steps in on a tie.
      const p = need(s, cmd.actor);
      if (!s.awaitingPayout) fail('There is no pot to claim right now.');
      if (!p.inHand || p.folded) fail('You were not in this hand.');
      if (cmd.claim !== 'win' && cmd.claim !== 'muck') fail('Say win or muck.');

      s.claims[p.id] = cmd.claim;
      log(s, cmd.claim === 'win' ? 'win' : 'fold', `${p.name} ${cmd.claim === 'win' ? 'claimed the pot' : 'mucked'}`, t);

      const resolved = resolveClaims(s);
      if (resolved) {
        s.claimsDisputed = false;
        award(s, resolved, t);
      } else {
        // Two people both saying they won is the host's call, not ours.
        const contenders = live(s);
        const answered = contenders.every((x) => s.claims[x.id]);
        s.claimsDisputed =
          answered && contenders.filter((x) => s.claims[x.id] === 'win').length !== 1;
      }
      break;
    }

    case 'award': {
      assertHost(s, cmd.actor);
      award(s, cmd.awards ?? [], t);
      break;
    }

    case 'undo': {
      assertHost(s, cmd.actor);
      if (!s.undo) fail('There is nothing to undo.');
      const restored = clone(s.undo);
      restored.undo = null;
      restored.updatedAt = t;
      log(restored, 'host', 'Host undid the last action', t);
      return restored;
    }

    case 'set-lock': {
      assertHost(s, cmd.actor);
      s.locked = !!cmd.locked;
      log(s, 'host', s.locked ? 'Table locked' : 'Table open to new players', t);
      break;
    }

    case 'set-seats': {
      assertHost(s, cmd.actor);
      const seats = Math.min(10, Math.max(2, Math.round(cmd.seat ?? s.maxSeats)));
      const highest = Math.max(...s.players.filter((p) => !p.leftTable).map((p) => p.seat), -1);
      if (seats <= highest) fail('Move that player to a lower seat first.');
      s.maxSeats = seats;
      log(s, 'host', `Table set to ${seats} seats`, t);
      break;
    }

    case 'reset-hand': {
      assertHost(s, cmd.actor);
      // Give every chip in play back to whoever put it in, then clear the hand.
      for (const p of s.players) {
        p.stack += p.committed;
        p.committed = 0;
        p.bet = 0;
      }
      endHand(s);
      log(s, 'host', 'Hand reset — chips returned', t);
      break;
    }

    case 'set-blinds': {
      assertHost(s, cmd.actor);
      const sb = chips(cmd.sb ?? s.sb);
      const bb = chips(cmd.bb ?? s.bb);
      if (sb <= 0 || bb < sb) fail('Those blinds do not work.');
      s.sb = sb;
      s.bb = bb;
      s.ante = chips(cmd.ante ?? s.ante);
      if (!s.street) s.minRaise = bb;
      log(s, 'host', `Blinds are now ${fmt(sb)} / ${fmt(bb)}`, t);
      break;
    }

    case 'set-stack': {
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      const next = chips(cmd.amount ?? 0);
      // Keep buy-in accounting honest so settlement still sums to zero.
      p.buyIn += next - p.stack;
      p.stack = next;
      log(s, 'host', `${p.name}'s stack set to ${fmt(next)}`, t);
      break;
    }

    case 'rebuy': {
      const p = need(s, cmd.target ?? cmd.actor);
      if (cmd.target && cmd.target !== cmd.actor) assertHost(s, cmd.actor);
      const amount = chips(cmd.amount ?? s.startingStack);
      if (amount <= 0) fail('Enter an amount.');
      if (p.inHand && s.street) fail('Wait until the hand is over.');
      p.stack += amount;
      p.buyIn += amount;
      p.leftTable = false;
      log(s, 'host', `${p.name} bought in for ${fmt(amount)}`, t);
      break;
    }

    case 'cash-out': {
      const p = need(s, cmd.target ?? cmd.actor);
      if (cmd.target && cmd.target !== cmd.actor) assertHost(s, cmd.actor);
      if (p.inHand && s.street) fail('Wait until the hand is over.');
      p.cashedOut += p.stack;
      log(s, 'host', `${p.name} cashed out ${fmt(p.stack)}`, t);
      p.stack = 0;
      p.leftTable = true;
      p.sittingOut = true;
      break;
    }

    case 'move-seat': {
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      const seat = cmd.seat ?? 0;
      if (seat < 0 || seat >= s.maxSeats) fail('That seat does not exist.');
      if (s.players.some((o) => !o.leftTable && o.seat === seat && o.id !== p.id))
        fail('That seat is taken.');
      if (s.street) fail('Move players between hands.');
      p.seat = seat;
      break;
    }

    case 'force-fold': {
      // Someone walked away mid-hand and the table is stuck on their turn.
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      if (!s.street) fail('No hand is in progress.');
      if (!p.inHand || p.folded) fail('They are not in this hand.');
      foldAway(s, p, t);
      break;
    }

    case 'remove-player': {
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      // Mid-hand they are folded out first, so play can carry on without them.
      // Chips already in the pot stay there; the rest goes with them.
      if (p.inHand && s.street && !p.folded) foldAway(s, p, t);
      p.leftTable = true;
      p.sittingOut = true;
      p.inHand = false;
      p.cashedOut += p.stack;
      p.stack = 0;
      log(s, 'host', `${p.name} left the table`, t);
      break;
    }

    case 'set-dealer': {
      assertHost(s, cmd.actor);
      if (s.street) fail('Set the button between hands.');
      const p = need(s, cmd.target);
      s.dealerSeat = p.seat;
      log(s, 'host', `${p.name} has the button`, t);
      break;
    }

    case 'toggle-pause': {
      assertHost(s, cmd.actor);
      if (!s.tourney) fail('Only tournaments have a clock.');
      const tr = s.tourney;
      if (tr.paused) {
        tr.paused = false;
        tr.endsAt = t + tr.remaining * 1000;
      } else {
        tr.paused = true;
        tr.remaining = Math.max(0, Math.round(((tr.endsAt ?? t) - t) / 1000));
        tr.endsAt = null;
      }
      break;
    }

    case 'level-tick': {
      // Any client may nudge the clock; the state decides whether it moved.
      const tr = s.tourney;
      if (!tr || tr.paused || tr.endsAt === null) break;
      if (t < tr.endsAt) break;
      if (tr.level >= tr.levels.length - 1) {
        tr.endsAt = t + tr.levels[tr.level].duration * 1000;
        break;
      }
      tr.level += 1;
      applyLevel(s, t);
      const lv = tr.levels[tr.level];
      log(
        s,
        'hand',
        lv.isBreak ? 'Break time' : `Level ${tr.level + 1} — blinds ${fmt(lv.sb)} / ${fmt(lv.bb)}`,
        t,
      );
      break;
    }

    case 'end-game': {
      assertHost(s, cmd.actor);
      s.status = 'ended';
      s.turn = null;
      s.street = null;
      log(s, 'hand', 'Game over', t);
      break;
    }

    case 'play-again': {
      assertHost(s, cmd.actor);
      s.status = 'lobby';
      s.handNo = 0;
      s.dealerSeat = null;
      endHand(s);
      for (const p of s.players) {
        if (p.leftTable) continue;
        p.stack = s.startingStack;
        p.buyIn = s.startingStack;
        p.cashedOut = 0;
        p.sittingOut = false;
      }
      if (s.tourney) {
        s.tourney.level = 0;
        s.tourney.paused = true;
        applyLevel(s, t);
      }
      log(s, 'hand', 'New game — stacks reset', t);
      break;
    }

    default:
      fail('Unknown action.');
  }

  if (snapshot) s.undo = snapshot;
  return s;
}

/** Bookkeeping and identity changes are not what anyone means by "undo". */
const NEVER_UNDOABLE = new Set<string>([
  'heartbeat',
  'level-tick',
  'join',
  'rename',
  'sit',
  'claim-host',
  'undo',
]);

/* ------------------------------------------------------------------ */
/* Derived helpers (UI + validation share these)                       */
/* ------------------------------------------------------------------ */

export const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function totalPot(s: GameState): number {
  return s.pot + s.players.reduce((sum, p) => sum + p.bet, 0);
}

export function toCall(s: GameState, id: string): number {
  const p = byId(s, id);
  if (!p) return 0;
  return Math.max(0, Math.min(s.currentBet - p.bet, p.stack));
}

export function minRaiseTo(s: GameState, id: string): number {
  const p = byId(s, id);
  if (!p) return s.bb;
  const target = s.currentBet > 0 ? s.currentBet + s.minRaise : s.bb;
  return Math.min(target, p.bet + p.stack);
}

export function isMyTurn(s: GameState, id: string): boolean {
  return s.turn === id;
}

export function activeSeats(s: GameState): Player[] {
  return seated(s);
}

export function seatRoles(s: GameState) {
  const ring = seated(s).filter((p) => (s.street ? p.inHand : dealtIn(p)));
  const dealer = s.dealerSeat;
  if (dealer === null || ring.length < 2) return { dealer, sb: null, bb: null };
  const headsUp = ring.length === 2;
  const after = (seat: number) => {
    for (const p of ring) if (p.seat > seat) return p.seat;
    return ring[0].seat;
  };
  const sb = headsUp ? dealer : after(dealer);
  const bb = after(sb);
  return { dealer, sb, bb };
}

/** Cash-game settlement. Always sums to zero. */
export function settlement(s: GameState) {
  return s.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      net: p.stack + p.cashedOut - p.buyIn,
      buyIn: p.buyIn,
      stack: p.stack,
    }))
    .sort((a, b) => b.net - a.net);
}
