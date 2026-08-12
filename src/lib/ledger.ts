// A private, on-device record of what each table cost you.
//
// Nothing here is ever sent anywhere — it lives in this browser only, so a
// player can answer "how much am I down today?" without the app tracking
// anyone. Cleared like any other site data.

const KEY = 'chiptable:ledger:v1';
const KEEP_DAYS = 30;

export interface LedgerEntry {
  code: string;
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  mode: string;
  buyIn: number;
  /** stack + cashed out − bought in. Negative means down. */
  net: number;
  at: number;
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local

function read(): LedgerEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LedgerEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: LedgerEntry[]) {
  try {
    const cutoff = Date.now() - KEEP_DAYS * 864e5;
    localStorage.setItem(KEY, JSON.stringify(entries.filter((e) => e.at >= cutoff).slice(-200)));
  } catch {
    /* private mode or full storage — the app works without this */
  }
}

/** Upsert by room code, so a game updates in place as it plays out. */
export function recordGame(entry: Omit<LedgerEntry, 'day' | 'at'>) {
  const entries = read();
  const day = today();
  const i = entries.findIndex((e) => e.code === entry.code && e.day === day);
  const next: LedgerEntry = { ...entry, day, at: Date.now() };
  if (i >= 0) entries[i] = next;
  else entries.push(next);
  write(entries);
}

export function todayTotals() {
  const day = today();
  const rows = read().filter((e) => e.day === day);
  return {
    rows,
    net: rows.reduce((n, e) => n + e.net, 0),
    buyIn: rows.reduce((n, e) => n + e.buyIn, 0),
    tables: rows.length,
  };
}

export function recentDays(limit = 7) {
  const byDay = new Map<string, { day: string; net: number; buyIn: number; tables: number }>();
  for (const e of read()) {
    const row = byDay.get(e.day) ?? { day: e.day, net: 0, buyIn: 0, tables: 0 };
    row.net += e.net;
    row.buyIn += e.buyIn;
    row.tables += 1;
    byDay.set(e.day, row);
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, limit);
}
