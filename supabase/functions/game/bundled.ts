// GENERATED — do not edit. Run `npm run bundle:function` to regenerate.
//
// A single self-contained copy of the Edge Function (index.ts plus the shared
// engine it imports). Paste this into the Supabase dashboard under
// Edge Functions -> Deploy a new function, name it `game`, if you would rather
// not install the Supabase CLI. Identical behaviour either way.

// src/engine/engine.ts
var GameError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "GameError";
  }
};
function fail(msg) {
  throw new GameError(msg);
}
var clone = (v) => JSON.parse(JSON.stringify(v));
var chips = (n) => Math.max(0, Math.round(n));
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeRoomCode(len = 4) {
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
var byId = (s, id) => s.players.find((p) => p.id === id);
var need = (s, id) => byId(s, id) ?? fail("You are not seated at this table.");
var seated = (s) => s.players.filter((p) => !p.leftTable).sort((a, b) => a.seat - b.seat);
var live = (s) => s.players.filter((p) => p.inHand && !p.folded);
var actionable = (s) => live(s).filter((p) => !p.allIn);
function assertHost(s, actor) {
  if (s.hostId !== actor) fail("Only the host can do that.");
}
function log(s, kind, msg, t) {
  s.log.unshift({ t, kind, msg });
  if (s.log.length > 60) s.log.length = 60;
}
function nextSeat(s, from, ok) {
  const ring = seated(s).filter(ok);
  if (!ring.length) return null;
  if (from === null) return ring[0];
  for (const p of ring) if (p.seat > from) return p;
  return ring[0];
}
var dealtIn = (p) => !p.leftTable && !p.sittingOut && p.stack > 0;
function createGame(o) {
  const t = o.now ?? Date.now();
  if (o.sb <= 0 || o.bb <= 0) fail("Blinds must be greater than zero.");
  if (o.bb < o.sb) fail("The big blind must be at least the small blind.");
  if (o.startingStack < o.bb) fail("The starting stack must cover a big blind.");
  const maxSeats = Math.min(10, Math.max(2, o.maxSeats));
  const state = {
    code: o.code,
    mode: o.mode,
    status: "lobby",
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
    tourney: o.mode === "tournament" ? {
      levels: o.levels?.length ? o.levels : defaultLevels(o.sb, o.bb),
      level: 0,
      endsAt: null,
      remaining: o.levels?.[0]?.duration ?? 900,
      paused: true
    } : null,
    createdAt: t,
    updatedAt: t
  };
  addPlayer(state, o.hostId, o.hostName, 0, t);
  log(state, "info", "Table opened", t);
  return state;
}
function defaultLevels(sb, bb) {
  const levels = [];
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
function addPlayer(s, id, name, seat, t) {
  const p = {
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
    lastSeen: t
  };
  s.players.push(p);
  return p;
}
function commit(p, amount) {
  const n = Math.min(chips(amount), p.stack);
  p.stack -= n;
  p.bet += n;
  p.committed += n;
  if (p.stack === 0) p.allIn = true;
  return n;
}
function startHand(s, t) {
  const ready = seated(s).filter(dealtIn);
  if (ready.length < 2) fail("You need at least two players with chips.");
  s.handNo += 1;
  s.stats.handsPlayed += 1;
  s.street = "preflop";
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
  const dealer = nextSeat(s, s.dealerSeat, (p) => p.inHand) ?? ready[0];
  s.dealerSeat = dealer.seat;
  const headsUp = ready.length === 2;
  const sbPlayer = headsUp ? dealer : nextSeat(s, dealer.seat, (p) => p.inHand);
  const bbPlayer = nextSeat(s, sbPlayer.seat, (p) => p.inHand);
  if (s.ante > 0) for (const p of s.players.filter((x) => x.inHand)) commit(p, s.ante);
  if (s.ante > 0) {
    for (const p of s.players.filter((x) => x.inHand)) {
      s.pot += p.bet;
      p.bet = 0;
    }
  }
  commit(sbPlayer, s.sb);
  commit(bbPlayer, s.bb);
  s.currentBet = Math.max(sbPlayer.bet, bbPlayer.bet);
  sbPlayer.acted = false;
  bbPlayer.acted = false;
  const first = headsUp ? sbPlayer : nextSeat(s, bbPlayer.seat, (p) => p.inHand && !p.allIn);
  s.turn = (first ?? null)?.id ?? null;
  log(
    s,
    "hand",
    `Hand #${s.handNo} \u2014 dealer ${dealer.name}, blinds ${s.sb}/${s.bb}`,
    t
  );
  if (!s.turn) progress(s, t);
}
function collectBets(s) {
  for (const p of s.players) {
    s.pot += p.bet;
    p.bet = 0;
    p.acted = false;
  }
  s.currentBet = 0;
  s.minRaise = s.bb;
}
var NEXT_STREET = {
  preflop: "flop",
  flop: "turn",
  turn: "river",
  river: "showdown"
};
function progress(s, t) {
  const contenders = live(s);
  if (contenders.length === 1) {
    collectBets(s);
    const winner = contenders[0];
    const amount = s.pot;
    winner.stack += amount;
    recordWin(s, winner, amount, false);
    log(s, "win", `${winner.name} won ${fmt(amount)} (uncontested)`, t);
    endHand(s);
    return;
  }
  const canAct = actionable(s);
  const settled = canAct.length === 0 || canAct.every((p) => p.acted && p.bet === s.currentBet);
  if (!settled) {
    const from = byId(s, s.turn)?.seat ?? s.dealerSeat;
    const next = nextSeat(s, from ?? null, (p) => p.inHand && !p.folded && !p.allIn);
    s.turn = next ? next.id : null;
    if (!next) toShowdown(s, t);
    return;
  }
  collectBets(s);
  if (canAct.length <= 1 || s.street === "river") {
    toShowdown(s, t);
    return;
  }
  s.street = NEXT_STREET[s.street];
  s.lastAggressor = null;
  const first = nextSeat(s, s.dealerSeat, (p) => p.inHand && !p.folded && !p.allIn);
  s.turn = first ? first.id : null;
  if (!first) toShowdown(s, t);
}
function toShowdown(s, t) {
  collectBets(s);
  s.street = "showdown";
  s.turn = null;
  s.pots = buildPots(s);
  s.awaitingPayout = true;
  log(s, "hand", `Showdown \u2014 ${fmt(s.pot)} to award`, t);
}
function buildPots(s) {
  const contributors = s.players.filter((p) => p.committed > 0);
  if (!contributors.length) return [];
  const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of contributors) amount += Math.max(0, Math.min(p.committed, level) - prev);
    const eligible = contributors.filter((p) => !p.folded && p.inHand && p.committed >= level).map((p) => p.id);
    prev = level;
    if (amount <= 0 || eligible.length === 0) {
      if (pots.length) pots[pots.length - 1].amount += amount;
      continue;
    }
    const last = pots[pots.length - 1];
    if (last && sameSet(last.eligible, eligible)) last.amount += amount;
    else pots.push({ label: "", amount, eligible });
  }
  pots.forEach((p, i) => {
    p.label = i === 0 ? "Main Pot" : `Side Pot ${i}`;
  });
  return pots;
}
var sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
function endHand(s) {
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
function applyMove(s, p, cmd, t) {
  if (s.turn !== p.id) fail("It's not your turn.");
  const toCall = s.currentBet - p.bet;
  switch (cmd.move) {
    case "fold": {
      p.folded = true;
      p.acted = true;
      log(s, "fold", `${p.name} folded`, t);
      break;
    }
    case "check": {
      if (toCall > 0) fail(`You have ${fmt(toCall)} to call.`);
      p.acted = true;
      log(s, "bet", `${p.name} checked`, t);
      break;
    }
    case "call": {
      if (toCall <= 0) {
        p.acted = true;
        log(s, "bet", `${p.name} checked`, t);
        break;
      }
      const paid = commit(p, toCall);
      p.acted = true;
      log(s, "bet", `${p.name} called ${fmt(paid)}${p.allIn ? " (all in)" : ""}`, t);
      break;
    }
    case "allin":
    case "raise": {
      const target = cmd.move === "allin" ? p.bet + p.stack : chips(cmd.amount ?? 0);
      if (target <= p.bet) fail("That bet is too small.");
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
        if (raiseBy >= s.minRaise) {
          s.minRaise = raiseBy;
          for (const o of actionable(s)) if (o.id !== p.id) o.acted = false;
          s.lastAggressor = p.id;
        }
        s.currentBet = target;
      }
      p.acted = true;
      const verb = wasOpen ? "bet" : "raised to";
      log(s, "bet", `${p.name} ${verb} ${fmt(target)}${p.allIn ? " \u2014 ALL IN" : ""}`, t);
      break;
    }
    default:
      fail("Unknown action.");
  }
  progress(s, t);
}
function statsFor(s, id) {
  s.stats.players[id] ??= {
    handsWon: 0,
    chipsWon: 0,
    biggestPot: 0,
    potsUncontested: 0,
    showdownsWon: 0
  };
  return s.stats.players[id];
}
function recordWin(s, p, amount, atShowdown) {
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
function resolveClaims(s) {
  if (!s.awaitingPayout || !s.pots.length) return null;
  const contenders = live(s);
  const allAnswered = contenders.every((p) => s.claims[p.id]);
  const resolved = [];
  for (let i = 0; i < s.pots.length; i++) {
    const pot = s.pots[i];
    const standing = pot.eligible.filter((id) => s.claims[id] !== "muck");
    const claiming = pot.eligible.filter((id) => s.claims[id] === "win");
    if (standing.length === 1) resolved.push({ pot: i, winners: standing });
    else if (allAnswered && claiming.length === 1) resolved.push({ pot: i, winners: claiming });
    else return null;
  }
  return resolved;
}
function foldAway(s, p, t) {
  p.folded = true;
  p.acted = true;
  log(s, "fold", `${p.name} folded \u2014 away from the table`, t);
  if (s.turn === p.id || live(s).length === 1) progress(s, t);
}
function award(s, assignments, t) {
  if (!s.awaitingPayout) fail("There is no pot to award right now.");
  if (!assignments.length) fail("Pick a winner first.");
  let paid = 0;
  for (const a of assignments) {
    const pot = s.pots[a.pot];
    if (!pot) fail("That pot no longer exists.");
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
      log(s, "win", `${p.name} won ${fmt(amount)} \u2014 ${pot.label}`, t);
    }
  }
  if (paid !== s.pot) {
    fail("Award every pot before confirming.");
  }
  endHand(s);
}
function applyLevel(s, t) {
  const tr = s.tourney;
  const level = tr.levels[tr.level];
  s.sb = level.sb;
  s.bb = level.bb;
  s.ante = level.ante;
  s.minRaise = level.bb;
  tr.remaining = level.duration;
  tr.endsAt = tr.paused ? null : t + level.duration * 1e3;
}
function normalize(s) {
  s.locked ??= false;
  s.claims ??= {};
  s.claimsDisputed ??= false;
  s.undo ??= null;
  s.stats ??= { handsPlayed: 0, biggestPot: 0, biggestPotWinner: null, players: {} };
  s.stats.players ??= {};
  return s;
}
function reduce(prev, cmd) {
  const s = normalize(clone(prev));
  const t = cmd.now ?? Date.now();
  s.updatedAt = t;
  const snapshot = NEVER_UNDOABLE.has(cmd.type) ? null : clone(prev);
  if (snapshot) snapshot.undo = null;
  const me = byId(s, cmd.actor);
  if (me) me.lastSeen = t;
  switch (cmd.type) {
    case "heartbeat":
      break;
    case "join": {
      if (s.status === "ended") fail("This game has finished.");
      const name = (cmd.name ?? "").trim();
      if (!name) fail("Pick a nickname.");
      const existing = byId(s, cmd.actor);
      if (existing) {
        existing.leftTable = false;
        existing.name = name.slice(0, 14);
        break;
      }
      if (s.locked) fail("This table is locked. Ask the host to let you in.");
      const taken = new Set(s.players.filter((p2) => !p2.leftTable).map((p2) => p2.seat));
      let seat = cmd.seat;
      if (seat === void 0 || taken.has(seat)) {
        seat = void 0;
        for (let i = 0; i < s.maxSeats; i++) {
          if (!taken.has(i)) {
            seat = i;
            break;
          }
        }
      }
      if (seat === void 0) fail("This table is full.");
      const p = addPlayer(s, cmd.actor, name, seat, t);
      if (s.status === "running") p.sittingOut = false;
      log(s, "join", `${p.name} joined`, t);
      break;
    }
    case "rename": {
      const p = need(s, cmd.actor);
      p.name = (cmd.name ?? "").trim().slice(0, 14) || p.name;
      break;
    }
    case "sit": {
      const p = need(s, cmd.actor);
      p.sittingOut = !!cmd.sittingOut;
      break;
    }
    case "claim-host": {
      const host = byId(s, s.hostId);
      const gone = !host || host.leftTable || t - host.lastSeen > 45e3;
      if (!gone) fail("The host is still here.");
      const p = need(s, cmd.actor);
      s.hostId = p.id;
      log(s, "host", `${p.name} is now the host`, t);
      break;
    }
    case "start-game": {
      assertHost(s, cmd.actor);
      if (s.status === "running") break;
      s.status = "running";
      s.locked = true;
      if (s.tourney) {
        s.tourney.paused = false;
        applyLevel(s, t);
      }
      log(s, "hand", "Game started", t);
      startHand(s, t);
      break;
    }
    case "start-hand": {
      assertHost(s, cmd.actor);
      if (s.status !== "running") fail("Start the game first.");
      if (s.street) fail("Finish the current hand first.");
      startHand(s, t);
      break;
    }
    case "act": {
      const p = need(s, cmd.actor);
      if (s.status !== "running" || !s.street) fail("No hand is in progress.");
      applyMove(s, p, cmd, t);
      break;
    }
    case "claim": {
      const p = need(s, cmd.actor);
      if (!s.awaitingPayout) fail("There is no pot to claim right now.");
      if (!p.inHand || p.folded) fail("You were not in this hand.");
      if (cmd.claim !== "win" && cmd.claim !== "muck") fail("Say win or muck.");
      s.claims[p.id] = cmd.claim;
      log(s, cmd.claim === "win" ? "win" : "fold", `${p.name} ${cmd.claim === "win" ? "claimed the pot" : "mucked"}`, t);
      const resolved = resolveClaims(s);
      if (resolved) {
        s.claimsDisputed = false;
        award(s, resolved, t);
      } else {
        const contenders = live(s);
        const answered = contenders.every((x) => s.claims[x.id]);
        s.claimsDisputed = answered && contenders.filter((x) => s.claims[x.id] === "win").length !== 1;
      }
      break;
    }
    case "award": {
      assertHost(s, cmd.actor);
      award(s, cmd.awards ?? [], t);
      break;
    }
    case "undo": {
      assertHost(s, cmd.actor);
      if (!s.undo) fail("There is nothing to undo.");
      const restored = clone(s.undo);
      restored.undo = null;
      restored.updatedAt = t;
      log(restored, "host", "Host undid the last action", t);
      return restored;
    }
    case "set-lock": {
      assertHost(s, cmd.actor);
      s.locked = !!cmd.locked;
      log(s, "host", s.locked ? "Table locked" : "Table open to new players", t);
      break;
    }
    case "set-seats": {
      assertHost(s, cmd.actor);
      const seats = Math.min(10, Math.max(2, Math.round(cmd.seat ?? s.maxSeats)));
      const highest = Math.max(...s.players.filter((p) => !p.leftTable).map((p) => p.seat), -1);
      if (seats <= highest) fail("Move that player to a lower seat first.");
      s.maxSeats = seats;
      log(s, "host", `Table set to ${seats} seats`, t);
      break;
    }
    case "reset-hand": {
      assertHost(s, cmd.actor);
      for (const p of s.players) {
        p.stack += p.committed;
        p.committed = 0;
        p.bet = 0;
      }
      endHand(s);
      log(s, "host", "Hand reset \u2014 chips returned", t);
      break;
    }
    case "set-blinds": {
      assertHost(s, cmd.actor);
      const sb = chips(cmd.sb ?? s.sb);
      const bb = chips(cmd.bb ?? s.bb);
      if (sb <= 0 || bb < sb) fail("Those blinds do not work.");
      s.sb = sb;
      s.bb = bb;
      s.ante = chips(cmd.ante ?? s.ante);
      if (!s.street) s.minRaise = bb;
      log(s, "host", `Blinds are now ${fmt(sb)} / ${fmt(bb)}`, t);
      break;
    }
    case "set-stack": {
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      const next = chips(cmd.amount ?? 0);
      p.buyIn += next - p.stack;
      p.stack = next;
      log(s, "host", `${p.name}'s stack set to ${fmt(next)}`, t);
      break;
    }
    case "rebuy": {
      const p = need(s, cmd.target ?? cmd.actor);
      if (cmd.target && cmd.target !== cmd.actor) assertHost(s, cmd.actor);
      const amount = chips(cmd.amount ?? s.startingStack);
      if (amount <= 0) fail("Enter an amount.");
      if (p.inHand && s.street) fail("Wait until the hand is over.");
      p.stack += amount;
      p.buyIn += amount;
      p.leftTable = false;
      log(s, "host", `${p.name} bought in for ${fmt(amount)}`, t);
      break;
    }
    case "cash-out": {
      const p = need(s, cmd.target ?? cmd.actor);
      if (cmd.target && cmd.target !== cmd.actor) assertHost(s, cmd.actor);
      if (p.inHand && s.street) fail("Wait until the hand is over.");
      p.cashedOut += p.stack;
      log(s, "host", `${p.name} cashed out ${fmt(p.stack)}`, t);
      p.stack = 0;
      p.leftTable = true;
      p.sittingOut = true;
      break;
    }
    case "move-seat": {
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      const seat = cmd.seat ?? 0;
      if (seat < 0 || seat >= s.maxSeats) fail("That seat does not exist.");
      if (s.players.some((o) => !o.leftTable && o.seat === seat && o.id !== p.id))
        fail("That seat is taken.");
      if (s.street) fail("Move players between hands.");
      p.seat = seat;
      break;
    }
    case "force-fold": {
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      if (!s.street) fail("No hand is in progress.");
      if (!p.inHand || p.folded) fail("They are not in this hand.");
      foldAway(s, p, t);
      break;
    }
    case "remove-player": {
      assertHost(s, cmd.actor);
      const p = need(s, cmd.target);
      if (p.inHand && s.street && !p.folded) foldAway(s, p, t);
      p.leftTable = true;
      p.sittingOut = true;
      p.inHand = false;
      p.cashedOut += p.stack;
      p.stack = 0;
      log(s, "host", `${p.name} left the table`, t);
      break;
    }
    case "set-dealer": {
      assertHost(s, cmd.actor);
      if (s.street) fail("Set the button between hands.");
      const p = need(s, cmd.target);
      s.dealerSeat = p.seat;
      log(s, "host", `${p.name} has the button`, t);
      break;
    }
    case "toggle-pause": {
      assertHost(s, cmd.actor);
      if (!s.tourney) fail("Only tournaments have a clock.");
      const tr = s.tourney;
      if (tr.paused) {
        tr.paused = false;
        tr.endsAt = t + tr.remaining * 1e3;
      } else {
        tr.paused = true;
        tr.remaining = Math.max(0, Math.round(((tr.endsAt ?? t) - t) / 1e3));
        tr.endsAt = null;
      }
      break;
    }
    case "level-tick": {
      const tr = s.tourney;
      if (!tr || tr.paused || tr.endsAt === null) break;
      if (t < tr.endsAt) break;
      if (tr.level >= tr.levels.length - 1) {
        tr.endsAt = t + tr.levels[tr.level].duration * 1e3;
        break;
      }
      tr.level += 1;
      applyLevel(s, t);
      const lv = tr.levels[tr.level];
      log(
        s,
        "hand",
        lv.isBreak ? "Break time" : `Level ${tr.level + 1} \u2014 blinds ${fmt(lv.sb)} / ${fmt(lv.bb)}`,
        t
      );
      break;
    }
    case "end-game": {
      assertHost(s, cmd.actor);
      s.status = "ended";
      s.turn = null;
      s.street = null;
      log(s, "hand", "Game over", t);
      break;
    }
    case "play-again": {
      assertHost(s, cmd.actor);
      s.status = "lobby";
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
      log(s, "hand", "New game \u2014 stacks reset", t);
      break;
    }
    default:
      fail("Unknown action.");
  }
  if (snapshot) s.undo = snapshot;
  return s;
}
var NEVER_UNDOABLE = /* @__PURE__ */ new Set([
  "heartbeat",
  "level-tick",
  "join",
  "rename",
  "sit",
  "claim-host",
  "undo"
]);
var fmt = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

// supabase/functions/game/index.ts
var SUPABASE_URL = Deno.env.get("SUPABASE_URL");
var SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var REST = `${SUPABASE_URL}/rest/v1/games`;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var headers = (extra = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  ...extra
});
var json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" }
});
async function publish(code, state, version) {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messages: [{ topic: `game:${code}`, event: "state", payload: { state, version } }]
      })
    });
  } catch {
  }
}
var CREATE_LIMIT = 12;
var CREATE_WINDOW_MS = 60 * 60 * 1e3;
var recentCreates = /* @__PURE__ */ new Map();
function mayCreate(ip) {
  const now = Date.now();
  const hits = (recentCreates.get(ip) ?? []).filter((t) => now - t < CREATE_WINDOW_MS);
  hits.push(now);
  recentCreates.set(ip, hits);
  if (recentCreates.size > 5e3) recentCreates.clear();
  return hits.length <= CREATE_LIMIT;
}
var clientIp = (req) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
async function readGame(code) {
  const res = await fetch(`${REST}?code=eq.${encodeURIComponent(code)}&select=code,state,version`, {
    headers: headers()
  });
  if (!res.ok) throw new Error(`read failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}
async function writeGame(code, version, state) {
  const res = await fetch(
    `${REST}?code=eq.${encodeURIComponent(code)}&version=eq.${version}`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({
        state,
        version: version + 1,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    }
  );
  if (!res.ok) throw new Error(`write failed: ${res.status}`);
  const rows = await res.json();
  return rows.length > 0;
}
async function handleCreate(body, ip) {
  const mode = body.mode === "tournament" ? "tournament" : "cash";
  const hostId = String(body.hostId ?? "");
  const hostName = String(body.hostName ?? "").trim();
  if (!hostId || !hostName) return json({ error: "Pick a nickname to get started." }, 400);
  if (!mayCreate(ip)) {
    return json({ error: "That's a lot of tables. Take a breath and try again shortly." }, 429);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeRoomCode(6);
    let state;
    try {
      state = createGame({
        code,
        hostId,
        hostName,
        mode,
        startingStack: Number(body.startingStack ?? 1e3),
        sb: Number(body.sb ?? 5),
        bb: Number(body.bb ?? 10),
        ante: Number(body.ante ?? 0),
        maxSeats: Number(body.maxSeats ?? 9),
        levels: Array.isArray(body.levels) ? body.levels : void 0,
        now: Date.now()
      });
    } catch (e) {
      return json({ error: e instanceof GameError ? e.message : "Could not create that game." }, 400);
    }
    const res = await fetch(REST, {
      method: "POST",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({ code, state, version: 1 })
    });
    if (res.status === 409) continue;
    if (!res.ok) return json({ error: "Could not create that game." }, 500);
    const rows = await res.json();
    await publish(code, rows[0].state, rows[0].version);
    return json({ code, state: rows[0].state, version: rows[0].version });
  }
  return json({ error: "Could not create that game. Try again." }, 500);
}
async function handleCommand(body) {
  const code = String(body.code ?? "").toUpperCase();
  const cmd = body.cmd;
  if (!code || !cmd?.type || !cmd?.actor) return json({ error: "Malformed request." }, 400);
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readGame(code);
    if (!row) return json({ error: "That room code doesn't exist." }, 404);
    let next;
    try {
      next = reduce(row.state, { ...cmd, now: Date.now() });
    } catch (e) {
      if (e instanceof GameError) return json({ error: e.message, state: row.state, version: row.version }, 409);
      throw e;
    }
    if (await writeGame(code, row.version, next)) {
      await publish(code, next, row.version + 1);
      return json({ state: next, version: row.version + 1 });
    }
  }
  return json({ error: "The table is busy. Try that again." }, 503);
}
async function handleFetch(body) {
  const code = String(body.code ?? "").toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return json({ error: "That room code doesn't exist." }, 404);
  const row = await readGame(code);
  if (!row) return json({ error: "That room code doesn't exist." }, 404);
  return json({ state: row.state, version: row.version });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Not found." }, 404);
  try {
    const raw = await req.text();
    if (raw.length > 2e4) return json({ error: "That request was too large." }, 413);
    const body = JSON.parse(raw);
    switch (body.op) {
      case "create":
        return await handleCreate(body, clientIp(req));
      case "command":
        return await handleCommand(body);
      case "fetch":
        return await handleFetch(body);
      default:
        return json({ error: "Unknown request." }, 400);
    }
  } catch (_e) {
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
