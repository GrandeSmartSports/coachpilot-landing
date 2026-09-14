// Lessons with Sophie — Coach's Hub service worker.
// Responsibilities: display push notifications, focus/open the hub on tap.
// Nothing else. No caching, no offline story yet.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Lessons with Sophie", body: "You have a new update.", url: "/sophie/coach/" };
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (_e) {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/sophie/coach/icon-192.png",
      badge: "/sophie/coach/icon-192.png",
      tag: payload.tag || "sls-msg",
      data: { url: payload.url || "/sophie/coach/" },
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/sophie/coach/";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      if (c.url.indexOf("/sophie/coach") !== -1 && "focus" in c) {
        await c.focus();
        if ("navigate" in c && c.url.indexOf(target) === -1) await c.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
