// Retires the service worker of the pre-2026 mipa app.
//
// The old app registered /service-worker.js. Browsers that still have it keep
// serving the old, cached app; when they check this URL for an update they
// get this file instead, which removes the old registration and its caches
// and reloads open tabs so they load the current app (which uses /sw.js).
// Safe to delete once no browser is expected to have the old app installed.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
      const windows = await self.clients.matchAll({ type: "window" });
      windows.forEach(client => client.navigate(client.url));
    })()
  );
});
