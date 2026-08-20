// Alerts for when the phone isn't in your hand.
//
// Sound and haptics already cover the case where you're looking at the table.
// This is for the player who put their phone down, locked it, or switched to
// another app — and would otherwise hold the game up without knowing.
//
// Nothing fires while the table is on screen: you can already see it.

const KEY = 'chiptable:alerts:v1';

let enabled = read();
/** Set while a title flash is running, so we can restore the real title. */
let flashTimer: number | null = null;
let realTitle = '';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const alertsOn = () => enabled;

/** True where the browser can show a notification at all. */
export const alertsSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window;

/**
 * iOS only allows notifications for a home-screen install, so a player in
 * Safari gets the in-app fallbacks instead. Worth telling them rather than
 * letting them wonder why nothing happens.
 */
export const needsInstallForAlerts = () => {
  if (typeof navigator === 'undefined') return false;
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return iOS && !standalone;
};

/** Ask permission. Must be called straight from a tap. */
export async function enableAlerts(): Promise<boolean> {
  if (!alertsSupported()) {
    // No Notification API — the title flash still works, so honour the choice.
    enabled = true;
    persist();
    return true;
  }
  try {
    const result =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    enabled = result === 'granted';
  } catch {
    enabled = false;
  }
  persist();
  return enabled;
}

export function disableAlerts() {
  enabled = false;
  persist();
  stopFlash();
}

function persist() {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    /* private mode — the setting just won't survive a reload */
  }
}

/**
 * Flash the tab title. This is the fallback that works everywhere, including
 * iOS Safari, where a backgrounded tab can neither notify nor vibrate.
 */
function flashTitle(text: string) {
  if (typeof document === 'undefined') return;
  stopFlash();
  realTitle = realTitle || document.title;
  let on = true;
  document.title = text;
  flashTimer = window.setInterval(() => {
    on = !on;
    document.title = on ? text : realTitle;
  }, 1100);
}

export function stopFlash() {
  if (flashTimer !== null) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  if (realTitle) {
    document.title = realTitle;
    realTitle = '';
  }
}

/**
 * Raise an alert, but only when the table isn't visible. `tag` replaces any
 * earlier alert of the same kind instead of stacking them up.
 */
export function alert(opts: { title: string; body?: string; tag: string; flash?: string }) {
  if (!enabled) return;
  if (typeof document === 'undefined' || !document.hidden) return;

  if (opts.flash) flashTitle(opts.flash);

  if (!alertsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: `${import.meta.env.BASE_URL || '/'}icon-192.png`,
      badge: `${import.meta.env.BASE_URL || '/'}icon-192.png`,
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    // Turn alerts are time-critical; don't leave them lingering all night.
    setTimeout(() => n.close(), 20_000);
  } catch {
    /* some browsers require a service worker registration to construct one */
  }
}
