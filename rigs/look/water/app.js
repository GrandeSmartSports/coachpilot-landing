// Rig Card, "On the water": the page.
//
// Three real screens of the app in this look. The address picks them:
//   ?screen=trips | card | crew
//   ?sky=night | firstLight | dawn | overcast | rain | bright | golden | dusk
// The sky always goes through RIG.sky.apply, the same call the app makes, so
// every colour on the page is the sky engine's.
(function () {
  "use strict";
  var RIG = window.RIG, root = document.documentElement;
  var SKIES = ["night", "firstLight", "dawn", "overcast", "rain", "bright", "golden", "dusk"];
  var SCREENS = ["trips", "card", "crew"];
  var q = new URLSearchParams(location.search);
  var state = {
    screen: SCREENS.indexOf(q.get("screen")) >= 0 ? q.get("screen") : "trips",
    sky: SKIES.indexOf(q.get("sky")) >= 0 ? q.get("sky") : "overcast"
  };
  // Late November at Tacoma, and the cloud this week has.
  var SUN = { rise: 7.5, set: 16.38 }, WX = { clouds: 90, rain: 0 };

  var IC = {
    chev: '<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 8 14" aria-hidden="true"><path d="M6.5 1.5 1.5 7l5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.6 7.6 5.7 10.6 11.4 3.8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    note: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 3.4A1.4 1.4 0 0 1 3.4 2h7.2A1.4 1.4 0 0 1 12 3.4v4.8a1.4 1.4 0 0 1-1.4 1.4H6.4L3.6 12.2V9.6h-.2A1.4 1.4 0 0 1 2 8.2Z" fill="currentColor"/></svg>',
    msg: '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M3 5.6A2.6 2.6 0 0 1 5.6 3h10.8A2.6 2.6 0 0 1 19 5.6v7a2.6 2.6 0 0 1-2.6 2.6H10l-4.4 3.9v-3.9A2.6 2.6 0 0 1 3 12.6Z" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M11 4.5v13M4.5 11h13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'
  };

  function hex(c, i) { return parseInt(c.slice(1 + i * 2, 3 + i * 2), 16); }
  function mix(a, b, t) {
    var o = "#";
    for (var i = 0; i < 3; i++) o += ("0" + Math.round(hex(a, i) + (hex(b, i) - hex(a, i)) * t).toString(16)).slice(-2);
    return o;
  }
  function lum(c) {
    var v = [0, 1, 2].map(function (i) { var s = hex(c, i) / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  function applySky() {
    var p = RIG.sky.paletteFor(state.sky);
    RIG.sky.apply(root, { id: state.sky, p: p });
    root.setAttribute("data-dark", p.dark ? "1" : "0");
    // The title sits in the sky, so it takes whichever of the sky's own two
    // tones (ink or paper) reads best against the air behind it.
    var air = mix(p.sky[0], p.sky[1], 0.25);
    var pale = contrast(p.paper, air) > contrast(p.ink, air);
    root.style.setProperty("--sky-ink", pale ? p.paper : p.ink);
    root.style.setProperty("--sky-halo", air);
    // A pale title on a daytime sky (dawn) gets a thin dark edge to hold it.
    root.setAttribute("data-title", pale && !p.dark ? "pale" : "ink");
    document.querySelectorAll("[data-skyname]").forEach(function (el) { el.textContent = p.name; });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
    meta.content = p.sky[0];
  }

  function href(screen, sky) { return "?screen=" + (screen || state.screen) + "&sky=" + (sky || state.sky); }
  function links() {
    document.querySelectorAll("[data-to]").forEach(function (a) { a.setAttribute("href", href(a.dataset.to)); });
    document.querySelectorAll(".lookbar a").forEach(function (a) {
      if (a.dataset.to === state.screen) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  function show() {
    document.querySelectorAll(".screen").forEach(function (el) {
      var on = el.dataset.screen === state.screen;
      el.hidden = !on;
      if (on) RIG.water.scene(el.querySelector(".scene"));
    });
    links();
  }

  function go(screen, sky, push) {
    if (screen) state.screen = screen;
    if (sky) state.sky = sky;
    applySky(); show();
    var pick = document.querySelector("[data-skypick]"); if (pick) pick.value = state.sky;
    if (push) { history.pushState(state, "", href()); window.scrollTo(0, 0); } else history.replaceState(state, "", href());
  }

  // ---- one-time furniture ----------------------------------------------------
  document.querySelectorAll(".dock").forEach(function (d) {
    d.innerHTML = '<div class="seg">' +
      ["Trips", "Water", "Fish", "Learn"].map(function (t, i) {
        return '<a class="tab" href="' + (i ? "#" : "?screen=trips") + '"' + (i ? "" : ' data-to="trips" aria-current="page"') + ">" + t + "</a>";
      }).join("") + '</div><button class="skybtn" type="button" data-skynext aria-label="Sky: change"><i class="skytok"></i>Sky</button>';
  });
  document.querySelectorAll("[data-ic]").forEach(function (el) { el.outerHTML = IC[el.dataset.ic] || ""; });

  // Each trip's thumbnail is painted under the sky of the hour it starts.
  document.querySelectorAll("[data-mini]").forEach(function (el) {
    var id = RIG.sky.phase(parseFloat(el.dataset.hour), SUN, WX);
    el.innerHTML = RIG.water.mini(el.dataset.mini, RIG.sky.paletteFor(id));
    el.dataset.under = id;
  });

  // The plan's strip: the sky hour by hour from leaving to the last cast.
  document.querySelectorAll("[data-timeline]").forEach(function (el) {
    var r = el.dataset.timeline.split(",").map(parseFloat);
    el.querySelector(".tl-sky").style.background = skyStops(r[0], r[1], 14);
  });

  // Each day's ribbon: the same engine, sampled across the waking day.
  function skyStops(h0, h1, n) {
    var stops = [];
    for (var i = 0; i <= n; i++) {
      var p = RIG.sky.paletteFor(RIG.sky.phase(h0 + ((h1 - h0) * i) / n, SUN, WX));
      stops.push((p.dark ? mix(p.sky[1], p.ink2, 0.13) : mix(p.sky[0], p.sky[1], 0.6)) + " " + Math.round((i / n) * 100) + "%");
    }
    return "linear-gradient(90deg," + stops.join(",") + ")";
  }
  document.querySelectorAll("[data-ribbon]").forEach(function (el) {
    el.style.background = skyStops(5, 23, 24);
    el.innerHTML = el.dataset.ribbon.split(",").filter(Boolean).map(function (t) {
      return '<b' + (/h$/.test(t) ? ' class="h"' : "") + ' style="left:' + (((parseFloat(t) - 5) / 18) * 100).toFixed(1) + '%"></b>';
    }).join("");
  });

  var sel = document.querySelector("[data-skypick]");
  SKIES.forEach(function (id) {
    var o = document.createElement("option");
    o.value = id; o.textContent = RIG.sky.paletteFor(id).name; sel.appendChild(o);
  });
  sel.addEventListener("change", function () { go(null, sel.value); });

  document.addEventListener("click", function (e) {
    var next = e.target.closest("[data-skynext]");
    if (next) { go(null, SKIES[(SKIES.indexOf(state.sky) + 1) % SKIES.length]); return; }
    var a = e.target.closest("a");
    if (!a) return;
    if (a.dataset.to) { e.preventDefault(); go(a.dataset.to, null, true); return; }
    if (a.getAttribute("href") === "#") e.preventDefault();
  });
  // The crew answer buttons and the list really toggle: it is a working page.
  document.addEventListener("click", function (e) {
    var rs = e.target.closest(".rs");
    if (rs) rs.parentNode.querySelectorAll(".rs").forEach(function (b) { b.setAttribute("aria-pressed", b === rs ? "true" : "false"); });
    var box = e.target.closest(".check .box");
    if (box) box.parentNode.classList.toggle("done");
  });
  window.addEventListener("popstate", function () {
    var s = new URLSearchParams(location.search);
    go(SCREENS.indexOf(s.get("screen")) >= 0 ? s.get("screen") : "trips", SKIES.indexOf(s.get("sky")) >= 0 ? s.get("sky") : "overcast");
  });

  go();
})();
