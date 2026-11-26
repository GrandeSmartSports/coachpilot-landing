// Three real screens of Rig Card in the field guide look.
//
// ?screen=trips | card | crew      which screen
// ?sky=night | firstLight | dawn | overcast | rain | bright | golden | dusk
// ?ctl=0                            hide the look switcher (for clean captures)
//
// Colour is never set here. The sky is resolved to one of the eight palettes
// in /rigs/sky.js and applied with RIG.sky.apply; the CSS mixes the rest.
(function () {
  "use strict";
  var G = window.GUIDE, RIG = window.RIG, root = document.documentElement, app = document.getElementById("app");
  var SKIES = ["night", "firstLight", "dawn", "overcast", "rain", "bright", "golden", "dusk"];
  var SCREENS = [["trips", "Trips"], ["card", "Card"], ["crew", "Crew"]];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function state() {
    var q = new URLSearchParams(location.search), sc = q.get("screen"), sky = q.get("sky");
    return { screen: SCREENS.some(function (s) { return s[0] === sc; }) ? sc : "trips", sky: RIG.sky.palettes[sky] ? sky : "overcast", ctl: q.get("ctl") !== "0" };
  }
  function link(screen, sky) {
    var s = state(), q = "?screen=" + (screen || s.screen) + "&sky=" + (sky || s.sky) + (s.ctl ? "" : "&ctl=0");
    return q;
  }
  function applySky(id) {
    var p = RIG.sky.paletteFor(id);
    RIG.sky.apply(root, { id: id, forced: false, p: p, skyName: p.name });
    root.toggleAttribute("data-dark", !!p.dark);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", p.ground);
    return p;
  }

  // ---- pieces -----------------------------------------------------------
  var CHEV = '<span class="chev" aria-hidden="true"><svg viewBox="0 0 10 16"><path d="M2 2l6 6-6 6"/></svg></span>';
  function heat(h) { return '<b class="heat ' + (h === "Hot" ? "hot" : "good") + '">' + h + "</b>"; }
  function face(name, cls) { return '<span class="face ' + (cls || "") + '" aria-hidden="true">' + esc(name.charAt(0)) + "</span>"; }
  function top(skyName) {
    return '<header class="top"><nav class="tabs" role="tablist" aria-label="Sections">' +
      [["trips", "Trips"], ["water", "Water"], ["fish", "Fish"], ["learn", "Learn"]].map(function (t) {
        return '<button class="tab" type="button" role="tab" data-go="trips" aria-selected="' + (t[0] === "trips") + '">' + t[1] + "</button>";
      }).join("") + "</nav>" +
      '<button class="skybtn" type="button" data-sky-next aria-label="Sky: ' + esc(skyName) + '. Tap for the next sky."><i class="swatch"></i>Sky</button></header>';
  }
  function trip(t) {
    var hot = t.heat === "Hot";
    return '<a class="trip' + (hot ? " hot" : "") + '" href="' + (t.go ? link(t.go) : "#") + '"' + (t.go ? ' data-go="' + t.go + '"' : "") + ' style="--rot:' + t.rot + 'deg' + (t.w ? ';--w:' + t.w + 'px;--lift:' + t.lift + 'px' : '') + '">' +
      G.blot(t.wash) +
      '<span class="art">' + G.plate(t.sp) + "</span>" +
      '<span class="tt"><span class="kick">' + heat(t.heat) + "<span>" + esc(t.slot) + "</span></span>" +
      "<strong>" + esc(t.name) + '</strong><span class="when">' + esc(t.when) + "</span>" +
      (t.note ? '<span class="note">' + esc(t.note) + "</span>" : "") + "</span>" + CHEV + "</a>";
  }

  // ---- Hot Trips ----------------------------------------------------------
  var WEEK = [
    { label: "Thu Nov 26", trips: [
      { sp: "squid", name: "Squid at Les Davis Pier", slot: "Evening", when: "5:00 PM to 10:00 PM", heat: "Hot", wash: "salt", rot: -8, w: 224, lift: -8, go: "card" },
      { sp: "chum", name: "Chum on the Green", slot: "Quick trip", when: "7:28 AM to 11:00 AM", heat: "Good", wash: "river", rot: -3 },
      { sp: "cutthroat", name: "Sea-run cutthroat, Dash Point beach", slot: "Quick trip", when: "12:39 PM to 3:00 PM", heat: "Good", wash: "salt", rot: 2 }
    ] },
    { label: "Sat Nov 28", trips: [
      { sp: "clam", name: "Razor clams, Copalis and Mocrocks", slot: "Adventure day", when: "7:18 PM to 9:48 PM", heat: "Hot", wash: "sand", rot: -6, w: 208, lift: -14 },
      { sp: "chum", name: "Chum on the Green", slot: "Crew trip", when: "7:31 AM to 11:00 AM", heat: "Hot", wash: "river", rot: -4, w: 216, lift: -15, go: "crew" },
      { sp: "rainbow", name: "Trout at Bonney Lake", slot: "Quick trip", when: "7:30 AM to 11:00 AM", heat: "Good", wash: "lake", rot: 3, note: "Stocked Nov 23: 600 rainbow" }
    ] }
  ];
  function trips() {
    var days = WEEK.map(function (d) {
      var rows = d.trips.map(trip).join(G.rule());
      return '<section class="day"><h2>' + esc(d.label) + G.rule() + '</h2><div class="sheet">' + rows + "</div></section>";
    }).join("");
    return '<div class="shead"><p class="eyebrow">Next 7 days</p><h1>Hot Trips</h1></div>' +
      '<a class="sheet crewcard" href="' + link("crew") + '" data-go="crew">' +
        '<span class="faces">' + face("Coach") + face("Russell", "f2") + "</span>" +
        '<p class="kick"><span>Crew trip</span><b class="heat on">On</b></p>' +
        '<strong>Chum on the Green</strong><span class="line">Sat Nov 28 · Coach and Russell going</span>' + CHEV + "</a>" +
      '<section class="day"><h2>Today <small>Wed Nov 25</small>' + G.rule() + "</h2>" +
        '<p class="quiet"><b>No daylight after work,</b> sunset 4:23 PM. Waiting for the weekend: Bonney Lake, Coho on the Green.</p></section>' +
      days;
  }

  // ---- the run card -------------------------------------------------------
  // The evening as one drawn line: when to leave, the drive, the fishing
  // window and the slack tide inside it.
  function strip() {
    function x(h) { return 12 + ((h - 15.5) / 7) * 296; }
    var ticks = "";
    for (var h = 16; h <= 22; h++) ticks += "M" + x(h).toFixed(1) + " 25v5";
    return '<svg class="strip" viewBox="0 0 320 62" role="img" aria-label="Leave 3:58 PM. Fish 5:00 PM to 10:00 PM. High slack 5:15 PM.">' +
      '<path class="base" d="M6 27.6C60 26.6 130 28.4 200 27.2S290 28 314 27.4"/><path class="tick" d="' + ticks + '"/>' +
      '<path class="drive" d="M' + x(15.97).toFixed(1) + " 27.5H" + x(17).toFixed(1) + '"/>' +
      '<path class="win" d="M' + x(17).toFixed(1) + " 20.4C120 19.2 220 21.4 " + x(22).toFixed(1) + " 20.2L" + (x(22) + 0.6).toFixed(1) + " 34.4C230 35.6 130 33.6 " + (x(17) - 0.5).toFixed(1) + ' 34.8Z"/>' +
      '<circle class="dot" cx="' + x(15.97).toFixed(1) + '" cy="27.5" r="4.4"/>' +
      '<path class="slack" d="M' + x(17.25).toFixed(1) + " 9v25M" + (x(17.25) - 3.4).toFixed(1) + " 12.6l3.4 -3.6l3.4 3.6" + '"/>' +
      '<text class="b" x="' + (x(15.97) - 9).toFixed(1) + '" y="51">3:58</text><text x="' + (x(17) + 1).toFixed(1) + '" y="51">5:00</text>' +
      '<text x="' + (x(22) - 28).toFixed(1) + '" y="51">10:00</text><text x="' + (x(17.25) + 7).toFixed(1) + '" y="12.5">High slack 5:15</text></svg>';
  }
  var SECTIONS = [
    { t: "What it is", l: "Market squid under the lights after dark" },
    { t: "Gear", l: "4 to get, 4 to check, the rest you own" },
    { t: "Bait and lures", l: "Two squid jigs, 2.0 to 2.5", art: "jig", wash: "salt", rot: -7 },
    { t: "How to fish it", l: "Stand where you can drop straight down into the light edge" },
    { t: "Tide and weather", l: "Wind to 6 mph, gusts 11, 44 F<br>High slack 5:15 PM", raw: true },
    { t: "The spot", l: "Les Davis Pier, Ruston Way, Tacoma", vig: true },
    { t: "What to expect", l: "A crowded rail on good nights" },
    { t: "Rules", l: "5 quarts or 10 pounds, one line" }
  ];
  function card() {
    var rows = SECTIONS.map(function (s) {
      var art = s.art ? G.blot(s.wash) + '<span class="art">' + G.plate(s.art) + "</span>" : s.vig ? '<span class="art">' + G.vignette() + "</span>" : "";
      return '<a class="row' + (art ? " art" : "") + '" href="#"' + (s.art ? ' style="--rot:' + s.rot + 'deg"' : "") + ">" + art +
        '<span class="tt"><strong>' + esc(s.t) + '</strong><span class="line">' + (s.raw ? s.l : esc(s.l)) + "</span></span>" + CHEV + "</a>";
    }).join(G.rule());
    return '<a class="back" href="' + link("trips") + '" data-go="trips"><svg width="8" height="13" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L2 8l6 6"/></svg>Hot Trips</a>' +
      '<div class="shead"><p class="eyebrow">Thu Nov 26 · Evening</p><h1>Squid at Les Davis Pier</h1>' +
        '<p class="lede">5:00 PM to 10:00 PM · 45 min drive' + heat("Hot") + "</p></div>" +
      '<div class="hero" style="--rot:-9deg">' + G.plate("squid") +
        '<p class="tagcard"><b>Market squid</b><i>Doryteuthis opalescens</i></p></div>' +
      '<a class="sheet plan" href="#"><p class="kick"><span>The plan</span></p><span class="big">Leave by 3:58 PM</span>' +
        '<span class="line">Fish 5:00 PM to 10:00 PM</span>' + strip() + CHEV + "</a>" +
      '<div class="sheet rows">' + rows + "</div>";
  }

  // ---- the crew trip ------------------------------------------------------
  function box(done) {
    return '<svg class="box" viewBox="0 0 26 26" aria-hidden="true"><path class="sq" d="M4.6 4.2C10 3.4 17 3.8 21.6 4.4C22.2 10 22 16.6 21.4 21.6C16 22.4 9.6 22.2 4.4 21.8C3.8 16 3.9 10 4.6 4.2Z"/>' +
      (done ? '<path class="ck" d="M7.6 13.4l4 4.4L24.4 3.6"/>' : "") + "</svg>";
  }
  function crew() {
    return '<a class="back" href="' + link("trips") + '" data-go="trips"><svg width="8" height="13" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L2 8l6 6"/></svg>Hot Trips</a>' +
      '<div class="shead"><p class="eyebrow">Crew trip · Sat Nov 28</p><h1>Chum on the Green</h1><p class="lede">7:31 AM to 11:00 AM</p></div>' +
      '<div class="hero" style="--rot:-5deg">' + G.plate("chum") + '<p class="tagcard"><b>Chum salmon</b><i>Oncorhynchus keta</i></p></div>' +
      '<div class="sheet cond"><span class="gomark">Go</span><span><strong>Good flow, 400 cfs</strong>' +
        '<span class="line">Dropping after a rise, light wind</span></span></div>' +
      '<div class="sheet grp"><div class="rsvp" role="group" aria-label="Are you going?">' +
          '<button type="button" aria-pressed="true"><b>Going</b><span>2</span></button>' +
          '<button type="button" aria-pressed="false"><b>Maybe</b><span>1</span></button>' +
          '<button type="button" aria-pressed="false"><b>Out</b><span>0</span></button></div>' + G.rule() +
        '<div class="who"><ul><li>' + face("Coach") + "Coach</li><li>" + face("Russell", "f2") + "Russell</li></ul>" +
          "<ul><li>" + face("Dad", "f3") + 'Dad</li></ul><ul><li class="empty">Nobody</li></ul></div></div>' +
      '<a class="sheet grp row" href="#"><strong>Notes</strong><span class="line">2 notes on Gear</span>' + CHEV + "</a>" +
      '<div class="sheet grp list"><p class="kick" style="padding:13px 16px 4px"><span>The list</span></p>' +
        '<div class="item done">' + box(true) + '<b>Net</b><span class="by">Russell' + face("Russell", "f2") + "</span></div>" + G.rule() +
        '<div class="item">' + box(false) + '<b>Cured eggs</b><span class="by">Coach' + face("Coach") + "</span></div>" + G.rule() +
        '<div class="item">' + box(false) + '<b>Cooler</b><span class="by open">Nobody<span class="face none" aria-hidden="true">?</span></span></div></div>' +
      '<button class="gold" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H10l-4.5 3.6V16.5H4z"/></svg>Text the crew</button>';
  }

  // ---- render and route ---------------------------------------------------
  var VIEWS = { trips: [trips, "sound"], card: [card, "pier"], crew: [crew, "river"] };
  function render() {
    var s = state(), p = applySky(s.sky), v = VIEWS[s.screen];
    root.classList.toggle("noctl", !s.ctl);
    G.reset();
    app.innerHTML = '<div class="screen s-' + s.screen + '"><div class="scenewrap">' + G.scene[v[1]]() + '</div><div class="lantern"></div>' +
      top(p.name) + '<main class="wrap">' + v[0]() + "</main></div>" +
      '<div class="ctl" role="group" aria-label="Look switcher">' +
        SCREENS.map(function (x) { return '<button type="button" data-go="' + x[0] + '" aria-pressed="' + (x[0] === s.screen) + '">' + x[1] + "</button>"; }).join("") +
        '<span class="sep"></span><button type="button" data-sky-next>' + esc(p.name) + "</button></div>";
    document.title = "Rig Card: field guide look";
  }
  function go(q) { history.pushState(null, "", q); render(); window.scrollTo(0, 0); }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go],[data-sky-next],a[href='#']");
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute("data-sky-next")) {
      var s = state(), next = SKIES[(SKIES.indexOf(s.sky) + 1) % SKIES.length];
      history.replaceState(null, "", link(s.screen, next)); render(); return;
    }
    if (t.dataset.go) go(link(t.dataset.go));
  });
  window.addEventListener("popstate", render);

  document.getElementById("sprite").innerHTML = G.sprite();
  render();
})();
