// Deliberately minimal. Its only job is to make ChipTable installable to the
// home screen — it caches nothing, so a player can never be served a stale
// build mid-game, and game traffic always goes straight to the network.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* pass through to the network */
});
