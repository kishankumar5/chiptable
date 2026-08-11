// A player's identity lives entirely in localStorage. No accounts, no email.
// This id is what lets someone lock their phone, refresh, or reopen the link
// and drop straight back into their seat with their stack intact.

const ID_KEY = 'chiptable.playerId';
const NAME_KEY = 'chiptable.name';
const ROOM_KEY = 'chiptable.lastRoom';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the session just won't survive a refresh */
  }
}

export function playerId(): string {
  let id = safeGet(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(ID_KEY, id);
  }
  return id;
}

export const lastName = () => safeGet(NAME_KEY) ?? '';
export const rememberName = (name: string) => safeSet(NAME_KEY, name);

export const lastRoom = () => safeGet(ROOM_KEY) ?? '';
export const rememberRoom = (code: string) => safeSet(ROOM_KEY, code);

const SOUND_KEY = 'chiptable.sound';
export const soundEnabled = () => safeGet(SOUND_KEY) !== 'off';
export const setSoundEnabled = (on: boolean) => safeSet(SOUND_KEY, on ? 'on' : 'off');
