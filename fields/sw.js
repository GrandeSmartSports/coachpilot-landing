// Field Command service worker.
// Responsibilities:
//   1. Display push notifications when the server sends them.
//   2. When the user taps a notification, focus an existing tab if one is open
//      on the target URL, otherwise open a new tab.
// Nothing else. No caching, no offline story yet.

const CACHE_NAME = "flm-sw-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Field Command", body: "You have a new update.", url: "/fields/" };
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (_e) {
      // If the body wasn't JSON, use it as the plain body.
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/fields/icon-192.png",
      badge: "/fields/icon-192.png",
      tag: payload.tag || "flm-msg",
      data: { url: payload.url || "/fields/" },
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/fields/";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      // If a window is already on Field Command, focus and navigate it.
      if (c.url.indexOf("/fields") !== -1 && "focus" in c) {
        await c.focus();
        if ("navigate" in c && c.url.indexOf(target) === -1) await c.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
