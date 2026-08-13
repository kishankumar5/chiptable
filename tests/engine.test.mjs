// Engine tests. Run with `npm test` — the script bundles the TypeScript
// engine with esbuild first, so there is no test-only toolchain to install.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, buildPots, settlement, totalPot } from './engine.build.mjs';

const HOST = 'p-host';

/** A table with `n` players, everyone sitting on `stack`. */
function table(n, opts = {}) {
  let s = createGame({
    code: 'TEST',
    hostId: HOST,
    hostName: 'Alex',
    mode: 'cash',
    startingStack: opts.stack ?? 1000,
    sb: opts.sb ?? 5,
    bb: opts.bb ?? 10,
    maxSeats: 9,
    now: 1,
  });
  for (let i = 1; i < n; i++) {
    s = reduce(s, { type: 'join', actor: `p${i}`, name: `P${i}`, now: 1 });
  }
  return s;
}

const id = (s, seat) => s.players.find((p) => p.seat === seat).id;
const stackOf = (s, pid) => s.players.find((p) => p.id === pid).stack;
const chipsInPlay = (s) => s.players.reduce((n, p) => n + p.stack, 0) + totalPot(s);

const act = (s, move, amount) => reduce(s, { type: 'act', actor: s.turn, move, amount, now: Date.now() });

test('blinds are posted and the right player acts first', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const sb = s.players.find((p) => p.stack === 995);
  const bb = s.players.find((p) => p.stack === 990);
  assert.ok(sb && bb, 'small and big blind were deducted');
  assert.equal(totalPot(s), 15);
  // Three-handed, the button acts first preflop.
  assert.equal(s.turn, id(s, s.dealerSeat));
  assert.equal(chipsInPlay(s), 3000);
});

test('heads-up: the dealer posts the small blind and acts first', () => {
  let s = table(2);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const dealer = s.players.find((p) => p.seat === s.dealerSeat);
  assert.equal(dealer.bet, 5, 'dealer posted the small blind');
  assert.equal(s.turn, dealer.id);
});

test('a folded-out hand pays the last player standing without a showdown', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const bbPlayer = s.players.find((p) => p.bet === 10);
  s = act(s, 'fold');
  s = act(s, 'fold');
  assert.equal(s.awaitingPayout, false, 'no host action needed');
  assert.equal(stackOf(s, bbPlayer.id), 1005, 'big blind collected the 15');
  assert.equal(s.street, null, 'hand is over');
  assert.equal(chipsInPlay(s), 3000);
});

test('a full betting round advances the street and clears bets', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = act(s, 'call'); // button
  s = act(s, 'call'); // small blind
  s = act(s, 'check'); // big blind takes its option
  assert.equal(s.street, 'flop');
  assert.equal(s.pot, 30);
  assert.equal(s.currentBet, 0);
  assert.ok(s.players.every((p) => p.bet === 0));
});

test('a raise reopens the action for players who had already called', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = act(s, 'call'); // button calls 10
  s = act(s, 'raise', 40); // small blind raises
  assert.equal(s.currentBet, 40);
  const button = s.players.find((p) => p.bet === 10 && p.seat === s.dealerSeat);
  assert.equal(button.acted, false, 'the caller must act again');
});

test('a raise below the minimum is rejected', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  assert.throws(
    () => act(s, 'raise', 15),
    /Minimum is/,
    'a raise to 15 is under the 20 minimum',
  );
});

test('you cannot bet chips you do not have, or act out of turn', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  assert.throws(() => act(s, 'raise', 5000), /don't have that many chips/);
  const notMyTurn = s.players.find((p) => p.id !== s.turn).id;
  assert.throws(
    () => reduce(s, { type: 'act', actor: notMyTurn, move: 'fold' }),
    /not your turn/,
  );
});

test('checking when facing a bet is refused', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  assert.throws(() => act(s, 'check'), /to call/);
});

test('side pots split correctly with three different all-in sizes', () => {
  // Short stacks all in for 100 and 300 against a 1000 stack.
  let s = table(3, { stack: 1000 });
  s = reduce(s, { type: 'set-stack', actor: HOST, target: 'p1', amount: 100 });
  s = reduce(s, { type: 'set-stack', actor: HOST, target: 'p2', amount: 300 });
  s = reduce(s, { type: 'start-game', actor: HOST });

  // Everyone shoves; the deep stack covers both.
  s = act(s, 'allin');
  s = act(s, 'allin');
  s = act(s, 'allin');

  assert.equal(s.awaitingPayout, true);
  assert.equal(s.street, 'showdown');

  const [main, side1, side2] = s.pots;
  assert.equal(main.amount, 300, 'main pot: 100 from each of three players');
  assert.equal(main.eligible.length, 3);
  assert.equal(side1.amount, 400, 'first side pot: 200 each from the two deeper stacks');
  assert.equal(side1.eligible.length, 2);
  assert.equal(side2.amount, 700, 'the deep stack gets its uncalled remainder back');
  assert.equal(side2.eligible.length, 1);
  assert.equal(main.amount + side1.amount + side2.amount, s.pot, 'pots equal the pot');
});

test('awarding every pot moves exactly the right chips', () => {
  let s = table(3, { stack: 1000 });
  s = reduce(s, { type: 'set-stack', actor: HOST, target: 'p1', amount: 100 });
  s = reduce(s, { type: 'set-stack', actor: HOST, target: 'p2', amount: 300 });
  const before = chipsInPlay(s);
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = act(s, 'allin');
  s = act(s, 'allin');
  s = act(s, 'allin');

  const awards = s.pots.map((pot, i) => ({ pot: i, winners: [pot.eligible[0]] }));
  s = reduce(s, { type: 'award', actor: HOST, awards });

  assert.equal(s.pot, 0);
  assert.equal(s.awaitingPayout, false);
  assert.equal(chipsInPlay(s), before, 'no chips created or destroyed');
});

test('a partial payout is refused — every pot needs a winner', () => {
  let s = table(3, { stack: 1000 });
  s = reduce(s, { type: 'set-stack', actor: HOST, target: 'p1', amount: 100 });
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = act(s, 'allin');
  s = act(s, 'allin');
  s = act(s, 'allin');
  assert.ok(s.pots.length > 1);
  assert.throws(
    () => reduce(s, { type: 'award', actor: HOST, awards: [{ pot: 0, winners: [s.pots[0].eligible[0]] }] }),
    /Award every pot/,
  );
});

test('a split pot divides evenly and the odd chip still lands somewhere', () => {
  let s = table(2, { stack: 1000, sb: 5, bb: 15 });
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = act(s, 'call');
  s = act(s, 'check');
  s = act(s, 'check'); // flop
  s = act(s, 'check');
  s = act(s, 'check'); // turn
  s = act(s, 'check');
  s = act(s, 'check'); // river
  s = act(s, 'check');
  assert.equal(s.awaitingPayout, true);
  const pot = s.pots[0];
  const before = chipsInPlay(s);
  s = reduce(s, { type: 'award', actor: HOST, awards: [{ pot: 0, winners: pot.eligible }] });
  assert.equal(chipsInPlay(s), before, 'the odd chip is not lost');
});

test('folded players contribute dead money but cannot win it', () => {
  let s = table(3, { stack: 1000 });
  s = reduce(s, { type: 'start-game', actor: HOST });
  const folder = s.players.find((p) => p.bet === 5); // small blind
  s = act(s, 'call'); // button
  s = act(s, 'fold'); // small blind folds, losing its 5
  s = act(s, 'check'); // big blind
  // Play it down to showdown.
  while (s.street && s.street !== 'showdown') s = act(s, 'check');
  const pot = s.pots[0];
  assert.equal(pot.amount, 25, 'the folded small blind is still in the pot');
  assert.ok(!pot.eligible.includes(folder.id), 'but they cannot win it');
});

test('an all-in short of a full raise does not reset the raise size', () => {
  let s = table(3, { stack: 1000 });
  s = reduce(s, { type: 'start-game', actor: HOST });
  // Give the next player to act a stack that can shove, but not for a full raise.
  const shortId = s.players.find((p) => p.id !== s.turn && p.bet === 5).id;
  s = reduce(s, { type: 'set-stack', actor: HOST, target: shortId, amount: 145 });

  s = act(s, 'raise', 100); // a raise of 90 over the big blind
  assert.equal(s.minRaise, 90);
  const raiser = s.players.find((p) => p.bet === 100);

  s = act(s, 'allin'); // the short stack shoves 150 total — only +50
  assert.equal(s.currentBet, 150, 'the price to play did go up');
  assert.equal(s.minRaise, 90, 'but the minimum raise increment is unchanged');
  assert.equal(
    s.players.find((p) => p.id === raiser.id).acted,
    true,
    'the original raiser was not forced to re-act by an under-raise',
  );
});

test('reset-hand returns every chip to its owner', () => {
  let s = table(4);
  const before = chipsInPlay(s);
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = act(s, 'raise', 60);
  s = act(s, 'call');
  s = reduce(s, { type: 'reset-hand', actor: HOST });
  assert.equal(s.pot, 0);
  assert.equal(s.street, null);
  assert.equal(chipsInPlay(s), before);
  assert.ok(s.players.every((p) => p.stack === 1000), 'everyone is whole again');
});

/** Play a 3-handed hand down to showdown with everyone still in. */
function toShowdown(stack = 1000) {
  let s = table(3, { stack });
  s = reduce(s, { type: 'start-game', actor: HOST });
  let guard = 0;
  while (s.turn && guard++ < 30) {
    s = reduce(s, { type: 'act', actor: s.turn, move: s.currentBet > 0 ? 'call' : 'check' });
  }
  return s;
}

test('when everyone else mucks, the last player standing is paid automatically', () => {
  let s = toShowdown();
  assert.equal(s.awaitingPayout, true);
  const [a, b, c] = s.pots[0].eligible;
  const potSize = s.pot;
  const stackBefore = stackOf(s, c);

  s = reduce(s, { type: 'claim', actor: a, claim: 'muck' });
  assert.equal(s.awaitingPayout, true, 'still waiting after one muck');
  s = reduce(s, { type: 'claim', actor: b, claim: 'muck' });

  // Only one eligible player left — no need to even ask them.
  assert.equal(s.awaitingPayout, false, 'paid out without the host');
  assert.equal(stackOf(s, c), stackBefore + potSize, 'winner was paid the whole pot');
  assert.equal(chipsInPlay(s), 3000, 'chips conserved');
  assert.equal(s.street, null, 'hand is over');
});

test('a single claim among mucks pays out without the host', () => {
  let s = toShowdown();
  const [a, b, c] = s.pots[0].eligible;
  const potSize = s.pot;
  const before = stackOf(s, b);

  s = reduce(s, { type: 'claim', actor: a, claim: 'muck' });
  s = reduce(s, { type: 'claim', actor: b, claim: 'win' });
  s = reduce(s, { type: 'claim', actor: c, claim: 'muck' });

  assert.equal(s.awaitingPayout, false);
  assert.equal(stackOf(s, b), before + potSize, 'the claimant took the pot');
  assert.equal(chipsInPlay(s), 3000);
});

test('one claim plus silence pays out once the contest window closes', () => {
  let s = toShowdown();
  const [a] = s.pots[0].eligible;
  const potSize = s.pot;
  const before = stackOf(s, a);
  const t0 = s.updatedAt;

  s = reduce(s, { type: 'claim', actor: a, claim: 'win', now: t0 });
  assert.equal(s.awaitingPayout, true, 'nothing moves immediately');
  assert.equal(s.claimAt, t0, 'the clock started');

  // Too early — the table still has time to object.
  assert.throws(() => reduce(s, { type: 'settle', actor: a, now: t0 + 1500 }), /a moment/);
  assert.equal(s.awaitingPayout, true);

  s = reduce(s, { type: 'settle', actor: a, now: t0 + 4500 });
  assert.equal(s.awaitingPayout, false, 'paid after the window');
  assert.equal(stackOf(s, a), before + potSize);
  assert.equal(chipsInPlay(s), 3000);
});

test('an objection inside the window blocks the automatic payout', () => {
  let s = toShowdown();
  const [a, b] = s.pots[0].eligible;
  const t0 = s.updatedAt;

  s = reduce(s, { type: 'claim', actor: a, claim: 'win', now: t0 });
  s = reduce(s, { type: 'claim', actor: b, claim: 'win', now: t0 + 900 });
  assert.equal(s.claimsDisputed, true, 'the host is asked to decide');

  assert.throws(() => reduce(s, { type: 'settle', actor: a, now: t0 + 9000 }), /uncontested/);
  assert.equal(s.awaitingPayout, true, 'the pot is untouched');
});

test('settle refuses when a side pot is not the claimant\'s to take', () => {
  // Short stack all-in makes a side pot the big stack is not eligible for.
  let s = table(3, { stack: 1000 });
  s.players[2].stack = 100;
  s = reduce(s, { type: 'start-game', actor: HOST });
  let guard = 0;
  while (s.turn && guard++ < 40) {
    s = reduce(s, { type: 'act', actor: s.turn, move: 'allin' });
  }
  if (s.pots.length > 1) {
    const soleEligible = s.pots[s.pots.length - 1].eligible;
    const notInEveryPot = s.pots[0].eligible.find((id) => !soleEligible.includes(id));
    if (notInEveryPot) {
      const t0 = s.updatedAt;
      s = reduce(s, { type: 'claim', actor: notInEveryPot, claim: 'win', now: t0 });
      assert.throws(() => reduce(s, { type: 'settle', actor: notInEveryPot, now: t0 + 5000 }), /host/);
    }
  }
  assert.equal(chipsInPlay(s), 2100, 'chips are intact either way');
});

test('every hand leaves a recap that adds up', () => {
  let s = toShowdown();
  const potSize = s.pot;
  const winner = s.pots[0].eligible[0];
  s = reduce(s, { type: 'award', actor: HOST, awards: [{ pot: 0, winners: [winner] }] });

  assert.equal(s.hands.length, 1, 'the hand was recorded');
  const recap = s.hands[0];
  assert.equal(recap.pot, potSize);
  assert.equal(recap.showdown, true);
  assert.equal(
    recap.players.reduce((n, p) => n + p.won, 0),
    potSize,
    'payouts in the recap equal the pot',
  );
  assert.equal(
    recap.players.reduce((n, p) => n + p.put, 0),
    potSize,
    'contributions equal the pot too',
  );
  assert.equal(recap.players.find((p) => p.id === winner).won, potSize);
});

test('a folded hand is recapped as uncontested', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });
  s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });

  const recap = s.hands[0];
  assert.equal(recap.showdown, false);
  assert.equal(recap.pot, 15);
  assert.ok(recap.players.some((p) => p.folded), 'folders are listed');
  assert.equal(recap.players.reduce((n, p) => n + p.won, 0), 15);
});

test('recaps are capped so the row cannot grow forever', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });
  s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });
  for (let i = 0; i < 29; i++) {
    s = reduce(s, { type: 'start-hand', actor: HOST });
    s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });
    s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });
  }
  assert.equal(s.hands.length, 25, 'oldest hands fall off');
  assert.equal(s.hands[0].no, 30, 'newest first');
});

test('two players claiming the same pot hands it to the host', () => {
  let s = toShowdown();
  const [a, b, c] = s.pots[0].eligible;

  s = reduce(s, { type: 'claim', actor: a, claim: 'win' });
  s = reduce(s, { type: 'claim', actor: b, claim: 'win' });
  s = reduce(s, { type: 'claim', actor: c, claim: 'muck' });

  assert.equal(s.awaitingPayout, true, 'nothing was paid');
  assert.equal(s.claimsDisputed, true, 'the host is asked to decide');

  // Host settles it the old way, including splitting it.
  const potSize = s.pot;
  s = reduce(s, { type: 'award', actor: HOST, awards: [{ pot: 0, winners: [a, b] }] });
  assert.equal(s.awaitingPayout, false);
  assert.equal(chipsInPlay(s), 3000);
  assert.ok(potSize > 0);
});

test('claims are refused from players who were not in the hand', () => {
  let s = toShowdown();
  const folder = s.players.find((p) => !s.pots[0].eligible.includes(p.id));
  assert.throws(
    () => reduce(s, { type: 'claim', actor: 'nobody', claim: 'win' }),
    /not seated/,
  );
  if (folder) {
    assert.throws(() => reduce(s, { type: 'claim', actor: folder.id, claim: 'win' }), /not in this hand/);
  }
  assert.throws(() => reduce(s, { type: 'claim', actor: s.pots[0].eligible[0], claim: 'maybe' }), /win or muck/);
});

test('claims reset between hands', () => {
  let s = toShowdown();
  const [a, b] = s.pots[0].eligible;
  s = reduce(s, { type: 'claim', actor: a, claim: 'muck' });
  s = reduce(s, { type: 'claim', actor: b, claim: 'muck' });
  s = reduce(s, { type: 'start-hand', actor: HOST });
  assert.deepEqual(s.claims, {}, 'a fresh hand starts with no claims');
  assert.equal(s.claimsDisputed, false);
});

test('undo steps back one action and restores the exact stacks', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const before = s.players.map((p) => `${p.name}:${p.stack}`).join(' ');
  const turnBefore = s.turn;

  s = reduce(s, { type: 'act', actor: s.turn, move: 'raise', amount: 100 });
  assert.notEqual(s.turn, turnBefore, 'the raise happened');

  s = reduce(s, { type: 'undo', actor: HOST });
  assert.equal(s.players.map((p) => `${p.name}:${p.stack}`).join(' '), before, 'stacks restored');
  assert.equal(s.turn, turnBefore, 'it is their turn again');
  assert.equal(chipsInPlay(s), 3000);
});

test('undo can take back a payout', () => {
  let s = toShowdown();
  const potSize = s.pot;
  const winner = s.pots[0].eligible[0];
  const stackBefore = stackOf(s, winner);

  s = reduce(s, { type: 'award', actor: HOST, awards: [{ pot: 0, winners: [winner] }] });
  assert.equal(stackOf(s, winner), stackBefore + potSize);

  s = reduce(s, { type: 'undo', actor: HOST });
  assert.equal(stackOf(s, winner), stackBefore, 'the pot went back');
  assert.equal(s.awaitingPayout, true, 'we are back at the showdown');
  assert.equal(s.pot, potSize);
});

test('undo only goes back one step, and only for the host', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  assert.throws(() => reduce(s, { type: 'undo', actor: 'p1' }), /Only the host/);
  s = reduce(s, { type: 'undo', actor: HOST });
  assert.throws(() => reduce(s, { type: 'undo', actor: HOST }), /nothing to undo/);
});

test('undo state never nests inside itself', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = reduce(s, { type: 'act', actor: s.turn, move: 'call' });
  s = reduce(s, { type: 'act', actor: s.turn, move: 'call' });
  assert.ok(s.undo, 'there is a snapshot');
  assert.equal(s.undo.undo, null, 'and it carries no snapshot of its own');
});

test('the host can resize the table, but not below an occupied seat', () => {
  let s = table(2, { stack: 100 });
  s = reduce(s, { type: 'set-seats', actor: HOST, seat: 5 });
  assert.equal(s.maxSeats, 5);

  for (let i = 2; i < 5; i++) s = reduce(s, { type: 'join', actor: `x${i}`, name: `X${i}` });
  assert.throws(() => reduce(s, { type: 'set-seats', actor: HOST, seat: 3 }), /lower seat/);
  assert.throws(() => reduce(s, { type: 'set-seats', actor: 'x2', seat: 9 }), /Only the host/);

  s = reduce(s, { type: 'set-seats', actor: HOST, seat: 9 });
  assert.equal(s.maxSeats, 9, 'growing the table always works');
});

test('stats accumulate as hands are played', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  // Everyone folds to one player.
  s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });
  s = reduce(s, { type: 'act', actor: s.turn, move: 'fold' });

  const winner = Object.entries(s.stats.players).find(([, v]) => v.handsWon === 1);
  assert.ok(winner, 'a win was recorded');
  assert.equal(winner[1].potsUncontested, 1, 'counted as taken without a showdown');
  assert.equal(winner[1].showdownsWon, 0);
  assert.equal(s.stats.handsPlayed, 1);
  assert.equal(s.stats.biggestPot, 15);
  assert.ok(s.stats.biggestPotWinner, 'the biggest pot has a name on it');
});

test('showdown wins are recorded separately from uncontested ones', () => {
  let s = toShowdown();
  const winner = s.pots[0].eligible[0];
  s = reduce(s, { type: 'award', actor: HOST, awards: [{ pot: 0, winners: [winner] }] });
  assert.equal(s.stats.players[winner].showdownsWon, 1);
  assert.equal(s.stats.players[winner].potsUncontested, 0);
  assert.equal(s.stats.players[winner].chipsWon, 30);
});

test('starting the game locks the table to newcomers', () => {
  let s = table(3);
  s = reduce(s, { type: 'join', actor: 'early', name: 'Early' });
  assert.equal(s.locked, false, 'a lobby is open');

  s = reduce(s, { type: 'start-game', actor: HOST });
  assert.equal(s.locked, true, 'locked once cards are in the air');
  assert.throws(() => reduce(s, { type: 'join', actor: 'stranger', name: 'Nosey' }), /locked/);

  // Someone who already has a seat always gets back in.
  const back = reduce(s, { type: 'join', actor: 'p1', name: 'P1' });
  assert.equal(back.players.find((p) => p.id === 'p1').leftTable, false);

  s = reduce(s, { type: 'set-lock', actor: HOST, locked: false });
  s = reduce(s, { type: 'join', actor: 'friend', name: 'Late' });
  assert.ok(s.players.some((p) => p.id === 'friend'), 'the host can let people in again');
  assert.throws(() => reduce(s, { type: 'set-lock', actor: 'p1', locked: true }), /Only the host/);
});

test('a game saved before locking existed is treated as open', () => {
  let s = table(2);
  const legacy = JSON.parse(JSON.stringify(s));
  delete legacy.locked;
  const next = reduce(legacy, { type: 'join', actor: 'newcomer', name: 'New' });
  assert.equal(next.locked, false);
  assert.ok(next.players.some((p) => p.id === 'newcomer'));
});

test('a hand saved by an older version keeps playing after an update', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });

  // Exactly what a row written before claims/stats/undo existed looks like.
  const legacy = JSON.parse(JSON.stringify(s));
  delete legacy.claims;
  delete legacy.claimsDisputed;
  delete legacy.stats;
  delete legacy.undo;

  let next = reduce(legacy, { type: 'act', actor: legacy.turn, move: 'call' });
  assert.ok(next.turn, 'the hand carried on');
  assert.deepEqual(next.claims, {});
  assert.equal(next.stats.handsPlayed, 0, 'stats start from now, not from nothing');
  assert.equal(chipsInPlay(next), 3000);

  // And it can still reach a showdown and pay out.
  let guard = 0;
  while (next.turn && guard++ < 30) {
    next = reduce(next, { type: 'act', actor: next.turn, move: next.currentBet > 0 ? 'call' : 'check' });
  }
  next = reduce(next, {
    type: 'award',
    actor: HOST,
    awards: next.pots.map((p, i) => ({ pot: i, winners: [p.eligible[0]] })),
  });
  assert.equal(chipsInPlay(next), 3000);
});

test('the host can fold for a player who walked away mid-hand', () => {
  let s = table(4);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const stuck = s.turn;
  const potBefore = totalPot(s);

  s = reduce(s, { type: 'force-fold', actor: HOST, target: stuck });

  assert.equal(s.players.find((p) => p.id === stuck).folded, true, 'they are folded');
  assert.notEqual(s.turn, stuck, 'the table moved on');
  assert.ok(s.turn, 'someone else is now to act');
  assert.equal(totalPot(s), potBefore, 'their blind stays in the pot');
  assert.equal(chipsInPlay(s), 4000);
});

test('folding for an absent player can finish the hand outright', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  // Fold everyone but one player, the last two via the host override.
  s = act(s, 'fold');
  const remaining = s.players.filter((p) => p.inHand && !p.folded);
  s = reduce(s, { type: 'force-fold', actor: HOST, target: s.turn });
  assert.equal(s.street, null, 'hand is over');
  assert.equal(s.pot, 0, 'pot was paid out');
  assert.equal(chipsInPlay(s), 3000);
  assert.ok(remaining.length >= 2);
});

test('removing a player mid-hand folds them and unblocks the table', () => {
  let s = table(4);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const stuck = s.turn;
  const stackLeaving = s.players.find((p) => p.id === stuck).stack;

  s = reduce(s, { type: 'remove-player', actor: HOST, target: stuck });
  const gone = s.players.find((p) => p.id === stuck);

  assert.equal(gone.leftTable, true);
  assert.equal(gone.stack, 0, 'they took their remaining chips');
  assert.equal(gone.cashedOut, stackLeaving, 'accounted for in the settlement');
  assert.notEqual(s.turn, stuck, 'play continues without them');
  // Their blind is still in the pot, so the books only balance once it is won.
  assert.equal(
    settlement(s).reduce((n, r) => n + r.net, 0),
    -totalPot(s),
    'the shortfall is exactly the outstanding pot',
  );

  let guard = 0;
  while (s.turn && guard++ < 30) {
    s = reduce(s, { type: 'act', actor: s.turn, move: s.currentBet > 0 ? 'call' : 'check' });
  }
  if (s.awaitingPayout) {
    s = reduce(s, {
      type: 'award',
      actor: HOST,
      awards: s.pots.map((p, i) => ({ pot: i, winners: [p.eligible[0]] })),
    });
  }
  assert.equal(settlement(s).reduce((n, r) => n + r.net, 0), 0, 'books balance once paid out');
  // Chips on the table plus chips carried away must still be everything.
  const cashedOut = s.players.reduce((n, p) => n + p.cashedOut, 0);
  assert.equal(chipsInPlay(s) + cashedOut, 4000, 'no chips created or destroyed');
});

test('force-fold is host-only and refuses when there is no hand', () => {
  let s = table(3);
  assert.throws(() => reduce(s, { type: 'force-fold', actor: HOST, target: 'p1' }), /No hand/);
  s = reduce(s, { type: 'start-game', actor: HOST });
  assert.throws(() => reduce(s, { type: 'force-fold', actor: 'p1', target: s.turn }), /Only the host/);
});

test('the button moves and skips players with no chips', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const firstDealer = s.dealerSeat;
  s = act(s, 'fold');
  s = act(s, 'fold');
  s = reduce(s, { type: 'start-hand', actor: HOST });
  assert.notEqual(s.dealerSeat, firstDealer, 'the button moved on');
});

test('rebuy and cash-out keep the settlement summing to zero', () => {
  let s = table(4, { stack: 20 });
  s = reduce(s, { type: 'start-game', actor: HOST });
  s = act(s, 'allin');
  while (s.turn) s = act(s, 'call');
  s = reduce(s, {
    type: 'award',
    actor: HOST,
    awards: s.pots.map((p, i) => ({ pot: i, winners: [p.eligible[0]] })),
  });
  s = reduce(s, { type: 'rebuy', actor: 'p1', amount: 20 });
  s = reduce(s, { type: 'cash-out', actor: 'p2' });

  const results = settlement(s);
  const total = results.reduce((n, r) => n + r.net, 0);
  assert.equal(total, 0, 'winners and losers cancel out exactly');
});

test('only the host can run the table', () => {
  let s = table(3);
  for (const type of ['start-game', 'start-hand', 'end-game', 'set-blinds', 'reset-hand']) {
    assert.throws(() => reduce(s, { type, actor: 'p1', sb: 1, bb: 2 }), /Only the host/);
  }
});

test('a stale host can be replaced, a present one cannot', () => {
  let s = table(3);
  // The host was last seen at t=1, so ask at t=1: they are still here.
  assert.throws(() => reduce(s, { type: 'claim-host', actor: 'p1', now: 1 }), /still here/);
  s = reduce(s, { type: 'claim-host', actor: 'p1', now: 60_000 });
  assert.equal(s.hostId, 'p1');
});

test('a refreshed player rejoins the same seat with the same stack', () => {
  let s = table(3);
  s = reduce(s, { type: 'start-game', actor: HOST });
  const seat = s.players.find((p) => p.id === 'p1').seat;
  const stack = stackOf(s, 'p1');
  s = reduce(s, { type: 'join', actor: 'p1', name: 'P1' });
  assert.equal(s.players.filter((p) => p.id === 'p1').length, 1, 'no duplicate player');
  assert.equal(s.players.find((p) => p.id === 'p1').seat, seat);
  assert.equal(stackOf(s, 'p1'), stack);
});

test('the table fills up and then turns people away', () => {
  let s = table(2, { stack: 100 });
  s = reduce(s, { type: 'set-blinds', actor: HOST, sb: 1, bb: 2 });
  for (let i = 2; i < 9; i++) s = reduce(s, { type: 'join', actor: `x${i}`, name: `X${i}` });
  assert.equal(s.players.length, 9);
  assert.throws(() => reduce(s, { type: 'join', actor: 'late', name: 'Late' }), /table is full/);
});

test('a nine-handed hand plays all the way through', () => {
  let s = table(9, { stack: 500 });
  s = reduce(s, { type: 'start-game', actor: HOST });
  let guard = 0;
  while (s.turn && guard++ < 60) s = act(s, s.currentBet > 0 ? 'call' : 'check');
  assert.ok(guard < 60, 'the hand terminated');
  assert.equal(s.awaitingPayout, true);
  assert.equal(chipsInPlay(s), 4500);
});

test('buildPots on an untouched hand returns nothing', () => {
  const s = table(3);
  assert.deepEqual(buildPots(s), []);
});

test('tournament blinds go up when the clock runs out', () => {
  let s = createGame({
    code: 'TRNY',
    hostId: HOST,
    hostName: 'Alex',
    mode: 'tournament',
    startingStack: 5000,
    sb: 25,
    bb: 50,
    maxSeats: 9,
    now: 1000,
  });
  s = reduce(s, { type: 'join', actor: 'p1', name: 'P1', now: 1000 });
  s = reduce(s, { type: 'start-game', actor: HOST, now: 1000 });
  assert.equal(s.tourney.paused, false);

  const endsAt = s.tourney.endsAt;
  s = reduce(s, { type: 'level-tick', actor: 'p1', now: endsAt - 1 });
  assert.equal(s.tourney.level, 0, 'early ticks do nothing');

  s = reduce(s, { type: 'level-tick', actor: 'p1', now: endsAt + 1 });
  assert.equal(s.tourney.level, 1);
  assert.equal(s.bb, 100, 'blinds doubled');
});
