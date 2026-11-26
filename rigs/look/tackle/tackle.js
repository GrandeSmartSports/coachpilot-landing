// Tackle box look: which screen, which sky.
//
// The address drives both: ?screen=trips|card|crew and ?sky=<one of the eight
// phases in /rigs/sky.js>. Colours are never set here; RIG.sky.apply writes
// the palette and tackle.css turns each sky into a light.
(function () {
  "use strict";
  var SKIES = ["night", "firstLight", "dawn", "overcast", "rain", "bright", "golden", "dusk"];
  var SCREENS = ["trips", "card", "crew"];
  var root = document.documentElement;

  function read() {
    var q = new URLSearchParams(location.search);
    return {
      screen: SCREENS.indexOf(q.get("screen")) >= 0 ? q.get("screen") : "trips",
      sky: SKIES.indexOf(q.get("sky")) >= 0 ? q.get("sky") : "overcast"
    };
  }
  var state = read();

  function address() { return "?screen=" + state.screen + "&sky=" + state.sky; }

  function paintSky() {
    if (!(window.RIG && RIG.sky)) return; // the overcast floor in tackle.css stands
    var p = RIG.sky.paletteFor(state.sky);
    RIG.sky.apply(root, { id: state.sky, forced: false, p: p, skyName: p.name });
    var b = document.querySelector("[data-sky-next]");
    if (b) b.setAttribute("aria-label", "Sky: " + p.name + ". Tap to change.");
  }

  function paintScreen() {
    document.querySelectorAll(".screen").forEach(function (s) { s.hidden = s.dataset.screen !== state.screen; });
    document.querySelectorAll(".switch [data-go]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.go === state.screen));
    });
    // Links carry the sky with them, so a long press or a new tab still lands right.
    document.querySelectorAll("a[data-go]").forEach(function (a) {
      a.setAttribute("href", "?screen=" + a.dataset.go + "&sky=" + state.sky);
    });
  }

  function go(next, push) {
    if (next.screen) state.screen = next.screen;
    if (next.sky) state.sky = next.sky;
    paintSky();
    paintScreen();
    if (push) history.pushState(null, "", address()); else history.replaceState(null, "", address());
    if (next.screen) window.scrollTo(0, 0);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    if (!t) return;
    var nav = t.closest("[data-go]");
    if (nav) { e.preventDefault(); go({ screen: nav.dataset.go }, true); return; }
    if (t.closest("[data-sky-next]")) {
      go({ sky: SKIES[(SKIES.indexOf(state.sky) + 1) % SKIES.length] }, false);
      return;
    }
    // Crew: drop your tag in a compartment.
    var bin = t.closest(".bin");
    if (bin) {
      var me = document.querySelector("[data-me]");
      if (me) bin.querySelector(".tags").prepend(me);
      document.querySelectorAll(".bin").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === bin));
        b.querySelector("[data-n]").textContent = b.querySelectorAll(".ntag").length;
      });
      return;
    }
    var item = t.closest(".item");
    if (item) { item.setAttribute("aria-checked", String(item.getAttribute("aria-checked") !== "true")); return; }
    var dead = t.closest('a[href="#"]');
    if (dead) e.preventDefault();
  });

  window.addEventListener("popstate", function () { state = read(); paintSky(); paintScreen(); });

  paintSky();
  paintScreen();
})();
