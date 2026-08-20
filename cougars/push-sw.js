// BLS Cougars push service worker
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  var title = data.title || "Cougars update";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Coach posted something new.",
    icon: "/cougars/assets/cougars-app-192.png",
    badge: "/cougars/assets/cougars-app-192.png",
    data: { url: data.url || "/cougars/updates.html" },
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/cougars/updates.html";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf("/cougars") >= 0 && "focus" in list[i]) { list[i].navigate(url); return list[i].focus(); }
    }
    return clients.openWindow(url);
  }));
});
