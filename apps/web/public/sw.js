const CACHE = "deepburrow-v1";
const OFFLINE = "/offline.html";
const SHELL = [OFFLINE, "/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Pages are always network-first; authenticated data is never cached.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Only Vite's content-hashed build assets are cached.
  if (!url.pathname.startsWith("/assets/")) return;
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // A malformed push still gets the generic notification.
  }
  const url = data.burrowId
    ? `/app?burrow=${encodeURIComponent(data.burrowId)}&node=${encodeURIComponent(data.nodeId ?? "")}`
    : "/app";

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title ?? "DeepBurrow", {
        body: data.body ?? "Your answer is ready.",
        tag: data.testId ?? data.nodeId ?? "deepburrow",
        data: { url, testId: data.testId },
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      });
      if (!data.testId) return;
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "push-received", testId: data.testId });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/app";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = clients.find((item) => new URL(item.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        await client.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
