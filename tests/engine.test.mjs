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
