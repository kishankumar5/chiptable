// Shared game types. Imported by BOTH the browser client and the Supabase
// Edge Function, so this file must stay dependency-free and runtime-agnostic.

export type Mode = 'cash' | 'tournament';
export type Status = 'lobby' | 'running' | 'ended';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Player {
  id: string;
  name: string;
  seat: number;
  stack: number;
  /** Chips pushed forward on the current street. */
  bet: number;
  /** Total chips committed across the whole hand (drives side pots). */
  committed: number;
  /** Cash game accounting: everything they ever put on the table. */
  buyIn: number;
  /** Cash game accounting: chips taken off the table when leaving. */
  cashedOut: number;
  leftTable: boolean;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  sittingOut: boolean;
  lastSeen: number;
}

export interface Pot {
  label: string;
  amount: number;
  /** Player ids still eligible to win this pot. */
  eligible: string[];
}

export type LogKind = 'join' | 'bet' | 'fold' | 'win' | 'hand' | 'host' | 'info';

export interface LogEntry {
  t: number;
  kind: LogKind;
  msg: string;
}

export interface BlindLevel {
  sb: number;
  bb: number;
  ante: number;
  /** Seconds. */
  duration: number;
  isBreak?: boolean;
}

export interface Tourney {
  levels: BlindLevel[];
  level: number;
  /** Epoch ms when the current level expires. Null while paused. */
  endsAt: number | null;
  /** Seconds left, captured at the moment of pausing. */
  remaining: number;
  paused: boolean;
}

/** What a player said about the pot at showdown. */
export type Claim = 'win' | 'muck';

/** Tallied as hands play so an end-of-game summary needs no extra bookkeeping. */
export interface PlayerStats {
  handsWon: number;
  chipsWon: number;
  biggestPot: number;
  /** Pots taken when everyone else folded — the bluffs, more or less. */
  potsUncontested: number;
  showdownsWon: number;
}

export interface GameStats {
  handsPlayed: number;
  biggestPot: number;
  biggestPotWinner: string | null;
  players: Record<string, PlayerStats>;
}

export interface GameState {
  code: string;
  mode: Mode;
  status: Status;
  hostId: string;
  maxSeats: number;
  /** When true, only players who already have a seat can get in. */
  locked: boolean;
  sb: number;
  bb: number;
  ante: number;
  startingStack: number;
  players: Player[];
  dealerSeat: number | null;
  handNo: number;
  street: Street | null;
  /** Chips collected from completed streets. */
  pot: number;
  /** Highest per-player bet on the current street. */
  currentBet: number;
  minRaise: number;
  /** Player id whose turn it is. */
  turn: string | null;
  lastAggressor: string | null;
  /** Resolved main/side pots, populated once a hand reaches showdown. */
  pots: Pot[];
  awaitingPayout: boolean;
  /** Showdown answers, keyed by player id. Cleared with every new hand. */
  claims: Record<string, Claim>;
  /** Set when players disagree about who won, so the host steps in. */
  claimsDisputed: boolean;
  log: LogEntry[];
  tourney: Tourney | null;
  stats: GameStats;
  /**
   * The state as it was before the last meaningful action, so the host can
   * step back from a misclick. Holds one step and never nests.
   */
  undo: GameState | null;
  createdAt: number;
  updatedAt: number;
}

export type ActionType =
  | 'join'
  | 'rename'
  | 'sit'
  | 'heartbeat'
  | 'start-game'
  | 'start-hand'
  | 'act'
  | 'claim'
  | 'award'
  | 'undo'
  | 'set-seats'
  | 'set-lock'
  | 'reset-hand'
  | 'set-blinds'
  | 'set-stack'
  | 'rebuy'
  | 'cash-out'
  | 'move-seat'
  | 'remove-player'
  | 'force-fold'
  | 'set-dealer'
  | 'claim-host'
  | 'toggle-pause'
  | 'level-tick'
  | 'end-game'
  | 'play-again';

export type BetMove = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface Command {
  type: ActionType;
  /** Player performing the action. Always verified against game state. */
  actor: string;
  name?: string;
  seat?: number;
  target?: string;
  amount?: number;
  move?: BetMove;
  sb?: number;
  bb?: number;
  ante?: number;
  /** Payout assignments: pot index -> winning player ids (split if >1). */
  awards?: { pot: number; winners: string[] }[];
  claim?: Claim;
  sittingOut?: boolean;
  locked?: boolean;
  now?: number;
}
