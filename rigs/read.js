// The read: one trip on one day, said the way a guide would say it when
// asked "I'm thinking of going for squid tonight, what are my options?"
//
//   RIG.trips.read({ planId, iso, from, to, wx, tides, flow, others, nowHour })
//
// Pure, like the planner (rigs/trips.js): the forecast the app already holds
// in, words out. No DOM, no fetch, no clock it was not handed.
//   from, to:  local decimal hours, optional (as for RIG.trips.detail).
//   others:    plan ids to compare with. Left out, every plan for the same
//              fish, fished the same way, that is open that day and not much
//              farther away.
//   nowHour:   the hour now, when iso is today: "Light rain now", and a
//              trip with under half an hour left once you get there is
//              "Done for today". Once leaving now gets you there after the
//              start, the read speaks from when you get there (now, the
//              drive and a quarter hour): "Leave now", "9:50 to 12", no
//              rain hour that is over by then.
//   winFrom, winTo: optional, the hours the person can go ("I can go"),
//              local decimal hours; winTo at or before winFrom runs past
//              midnight (20 to 0 is 8 PM to 12 AM). Given, the headline
//              judges that window: "8 to 12: fair, not great", "good" or
//              "tough", from the same tide, current, rain, wind and flow the
//              read goes by, the reason names the best part of it ("Easiest
//              after 10:30 PM"), and better names the next day in the
//              forecast that suits the same window better, if one does.
//
// Out: { planId, iso, status, call, heat, headline, reason, leave, best,
//        lines: [{ k, label, text, brief }], fig, others: [{ planId, name, text }],
//        pick: { planId, name, why, self, text } | null,
//        hours: [from, to] read, grade, better: { iso, text } | null }
//   grade:  with a window: "good", "fair" or "tough" ("" without one)
//   status: what RIG.trips.detail said (ok, nogo, dark, closed, nodata, unknown)
//   call:   "go", "slow", "no", "none" (a river with no reading to call it
//           on), "done" (today, and under half an hour of its hours is left
//           once you get there), or "" when there is nothing to call
//   lines:  Tide (or River), Rain, Wind, Expect, Or. A line the data cannot
//           back is left out, never guessed. brief, where a line has one:
//           the part a short read needs ("" for nothing new).
//   fig:    what a small picture of the trip needs: the hours, the tide turns
//           and the chance of rain by the hour.
//   pick:   self: the pick is this spot. text: "Pick: Redondo, 10 min closer."
//
// Every sentence comes from the forecast, the plan and its run card
// (rigs/runs.js), or a fact a spot card proves (FACTS below).
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});
  RIG.trips = RIG.trips || {};

  // ---- what a spot card proves about standing there ------------------------
  // Only what a read compares spots by: a roof over your head, whose light
  // it is, and the crowd. From the spot cards (tests/fixtures/spot-cards.json,
  // proven items only); tests/rigs-read.test.mjs holds each one to its card.
  //   cover:   a rain cover to stand under
  //   lamps:   the pier's own lights
  //   outlets: power for the light you bring
  //   crowd:   what the card says about the crowd, by fish, for a day off,
  //            and the months it is true in (said in no other month)
  var FACTS = {
    // WDFW pier page: "Rain cover, railings, lights ... open 24 hours".
    // KUOW: "shoulder-to-shoulder squid crowds in November".
    "les-davis": { cover: "a rain cover", lamps: "pier", crowd: { squid: { text: "shoulder to shoulder squid crowds in November", months: [11] } } },
    // Coach's own pictures: "Tall single-arm lamp posts along the pier".
    // Card: "Busy night squid pier, October to December".
    redondo: { lamps: "pier", crowd: { squid: { text: "a busy squid pier, October to December", months: [10, 11, 12] } } },
    // Card: "Electrical outlets at the very end of the pier; squid anglers
    // plug in a small shop light". (Its lamps: the card was corrected on
    // 11/26 to a row of lamp posts, and everyone brings a light to every
    // pier, so whose light it is tells these piers apart by nothing.)
    "des-moines-pier": { outlets: "outlets at the end for your light" }
  };

  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function T() { return RIG.trips; }
  function planOf(id) { return (T().plans || []).filter(function (p) { return p.id === id; })[0] || null; }
  function spotOf(id) { return (T().spots || []).filter(function (s) { return s.id === id; })[0] || null; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hourOf(t) { var m = /[T ](\d\d):(\d\d)/.exec(t); return m ? +m[1] + m[2] / 60 : 0; }
  function dayNum(iso) { var a = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(a[0], a[1] - 1, a[2]) / 864e5; }
  // An hour on the trip's day, counted on past midnight: 1:05 AM the next
  // morning is 25.08.
  function rel(iso, t) { return (dayNum(t) - dayNum(iso)) * 24 + hourOf(t); }
  // The local day a gauge reading was taken on (Pacific time).
  function laDay(t) {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)); }
    catch (e) { return String(t).slice(0, 10); }
  }
  function dowOf(iso) { return new Date(dayNum(iso) * 864e5).getUTCDay(); }
  function monthOf(iso) { return +String(iso).slice(5, 7); }
  function isoPlus(iso, n) { return new Date((dayNum(iso) + n) * 864e5).toISOString().slice(0, 10); }
  function q(h) { return Math.round(h * 4) / 4; }
  // 1:05 AM the next morning: the clock wraps the day, so 25.08 reads 1:05 AM.
  function at(h) { var x = ((h % 24) + 24) % 24; return T().clock(x); }
  function ampm(h) { var x = ((h % 24) + 24) % 24; return x >= 12 ? "PM" : "AM"; }
  // "5:00 to 8:00 PM", or "11:00 AM to 2:00 PM" across noon.
  function span(a, b) {
    var A = at(a), B = at(b);
    return ampm(a) === ampm(b) ? A.replace(/ [AP]M$/, "") + " to " + B : A + " to " + B;
  }
  // An hour as people say it: "5 PM", "5:30 PM". bare: no AM or PM.
  function hr(h, bare) {
    var s = at(Math.round(h * 4) / 4).replace(":00 ", " ");
    return bare ? s.replace(/ [AP]M$/, "") : s;
  }
  function ft(v) { return (Math.round(v * 10) / 10).toFixed(1) + " ft"; }
  function swingFt(v) { v = Math.abs(v); return (v >= 3 ? String(Math.round(v)) : v.toFixed(1)) + " ft"; }
  function cfs(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  // Lower case first letter, unless the first word is a name in capitals (WDFW).
  function low(x) { return /^[A-Z]([a-z]|\s|$)/.test(x || "") ? x.charAt(0).toLowerCase() + x.slice(1) : x; }
  function firstSentence(x) { var m = /^(.*?[.!?])(\s|$)/.exec(String(x || "")); return m ? m[1] : String(x || ""); }
  function sentence(x) { x = String(x || "").trim(); return x ? cap(x.replace(/[.\s]*$/, "")) + "." : ""; }

  // The short name a person says: "Les Davis", "Redondo", "the Green".
  function shortName(p) {
    var s = spotOf(p.spot) || {}, n = s.name || "";
    if (!n) {
      var m = /(?: at| from|,) (?:the )?(.+)$/.exec(p.name) || / on (the .+)$/.exec(p.name);
      n = m ? m[1] : p.name;
    }
    return n.replace(/ (Pier|pier|boathouse dock|dock)$/, "");
  }

  // ---- the hours of the trip ------------------------------------------------
  // Open-Meteo's wind, gusts, temperature and waves are the reading at that
  // moment: the ones from half an hour before the start to the end count.
  function hoursIn(w, iso, a, b) {
    return ((w && w.hours) || []).map(function (x) { return { h: rel(iso, x.t), x: x }; })
      .filter(function (o) { return o.h >= a - 0.5 && o.h <= b; })
      .map(function (o) { return { h: o.h, temp: o.x.temp, wind: o.x.wind, gust: o.x.gust, wave: o.x.wave }; });
  }
  // Its rain and chance of rain are for the hour before the time it is
  // given at ("preceding hour sum", "preceding hour probability"): the 6:00
  // reading is the rain from 5 to 6. An hour counts when at least a quarter
  // of it is inside the trip. h is when that hour starts, t when it ends.
  function rainIn(w, iso, a, b) {
    return ((w && w.hours) || []).map(function (x) { return { t: rel(iso, x.t), x: x }; })
      .filter(function (o) { return Math.min(o.t, b) - Math.max(o.t - 1, a) >= 0.25; })
      .map(function (o) { return { h: o.t - 1, t: o.t, rain: o.x.rain, pop: o.x.pop == null ? null : +o.x.pop }; });
  }
  function maxOf(hrs, k) { var v = null; hrs.forEach(function (h) { if (h[k] != null && (v == null || h[k] > v)) v = h[k]; }); return v; }
  function minOf(hrs, k) { var v = null; hrs.forEach(function (h) { if (h[k] != null && (v == null || h[k] < v)) v = h[k]; }); return v; }

  // How wet an hour is: 0 clear, 1 a slight chance, 2 rain likely or falling.
  function wetness(x) {
    var amt = x.rain != null && x.rain >= 0.01, p = x.pop;
    if (amt || (p != null && p >= 30)) return 2;
    if (p != null && p > 10) return 1;
    return 0;
  }
  function partWord(a, b) { return a >= 16 ? "evening" : b <= 12.5 ? "morning" : a >= 12 ? "afternoon" : "day"; }
  function chance(x) { return x.pop != null ? Math.round(x.pop) + "%" : x.rain >= 0.01 ? "rain" : "dry"; }

  // Rain over the trip, by the hour, in words: "35% at 5 PM, 13% at 6, done
  // by 7". Each hour is said by when it starts; "done by" is when the last
  // wet hour ends. Nothing to go on, nothing said.
  function rainLine(hrs, a, b, now) {
    if (!hrs.length || !hrs.some(function (x) { return x.pop != null || x.rain != null; })) return "";
    var hasPop = hrs.some(function (x) { return x.pop != null; }), W = hrs.map(wetness), n = W.length;
    var lead = "";
    if (now) lead = now >= 0.05 ? "Rain now. " : "Light rain now. ";
    var top = maxOf(hrs, "pop"), part = partWord(a, b);
    // Hour labels: the first says AM or PM, the rest only where it changes.
    var said = null;
    function lab(h) { var s = hr(h, said != null && ampm(said) === ampm(h)); said = h; return s; }
    function pc(list) { return Math.round(maxOf(list, "pop")) + "%"; }
    if (W.every(function (w) { return w === 0; })) return lead + (hasPop && top > 5 ? "Dry, " + Math.round(top) + "% at most." : "Dry.");
    if (W.every(function (w) { return w < 2; })) return lead + "Mostly dry, " + Math.round(top) + "% at most.";
    if (W.every(function (w) { return w === 2; })) {
      var lo = minOf(hrs, "pop");
      return lead + "Rain all " + part + (hasPop ? ", " + (Math.round(lo) === Math.round(top) ? Math.round(top) + "%" : Math.round(lo) + " to " + Math.round(top) + "%") : "") + ".";
    }
    // The wet spells: hours in a row where rain is likely or falling.
    var spells = [], i;
    for (i = 0; i < n; i++) if (W[i] === 2 && (i === 0 || W[i - 1] !== 2)) { var e = i; while (e < n && W[e] === 2) e++; spells.push([i, e]); }
    if (spells.length > 1) {
      // Wet, dry, then wet again: on and off, and its worst hour.
      var wet = hrs.filter(function (x, k) { return W[k] === 2; });
      var peak = hasPop ? wet.filter(function (x) { return x.pop === maxOf(wet, "pop"); })[0] : null;
      return lead + "On and off" + (peak ? ", up to " + Math.round(peak.pop) + "% at " + lab(peak.h) : ", rain at " + lab(wet[0].h) + " and " + lab(hrs[spells[1][0]].h)) + ".";
    }
    var s = spells[0][0], e1 = spells[0][1];
    if (s === 0) {
      // Wet at the start. k: one past the last hour with any chance at all.
      var k = n;
      while (k > 0 && W[k - 1] === 0) k--;
      if (k === n) return lead + (hasPop ? "Up to " + pc(hrs.slice(0, e1)) + " until " + lab(hrs[e1 - 1].t) + ", then " + pc(hrs.slice(e1)) + " or less." : "Rain until " + lab(hrs[e1 - 1].t) + ".");
      if (k <= 3) {
        // The chance hour by hour until it is done.
        var steps = hrs.slice(0, k).map(function (x) { return (hasPop ? chance(x) + " at " : "Rain at ") + lab(x.h); });
        if (!hasPop) steps = [steps[0]];
        return lead + steps.join(", ") + ", done by " + lab(hrs[k - 1].t) + ".";
      }
      return lead + (hasPop ? "Up to " + pc(hrs.slice(0, k)) + " until " : "Rain until ") + lab(hrs[k - 1].t) + ", then dry.";
    }
    // Dry at the start, then wet: when it starts, and when it stops.
    var first = (W.slice(0, s).some(function (w) { return w > 0; }) ? "Mostly dry until " : "Dry until ") + lab(hrs[s].h);
    var wetTop = hasPop ? Math.round(maxOf(hrs.slice(s, e1), "pop")) + "%" : "rain";
    if (e1 === n) return lead + first + ", then " + (hasPop ? "up to " + wetTop : "rain") + ".";
    return lead + first + ", then " + wetTop + " to " + lab(hrs[e1 - 1].t) + ".";
  }

  // Wind and the air: "Almost none, 1 to 3 mph. Air 46 to 49°F."
  function windLine(hrs) {
    if (!hrs.length) return "";
    var W = Math.round(maxOf(hrs, "wind") || 0), w = Math.round(minOf(hrs, "wind") || 0), G = Math.round(maxOf(hrs, "gust") || 0);
    var lo = Math.round(minOf(hrs, "temp")), hi = Math.round(maxOf(hrs, "temp")), wave = maxOf(hrs, "wave");
    var word = W <= 3 ? "Almost none" : W <= 7 ? "Light" : W <= 12 ? "Breezy" : W <= 20 ? "Windy" : "Strong";
    var out = word + ", " + (w === W ? W : w + " to " + W) + " mph" + (G >= W + 6 ? ", gusts " + G : "") + ".";
    if (!isNaN(lo)) out += " Air " + (lo === hi ? lo : lo + " to " + hi) + "°F.";
    if (wave != null) out += " Surf to " + Math.round(wave) + " ft.";
    return out;
  }

  // A summary of the weather over the trip, for comparing two spots.
  function wxSum(hrs, rain) {
    return { pop: maxOf(rain, "pop"), wet: rain.some(function (x) { return wetness(x) === 2; }), wind: Math.round(maxOf(hrs, "wind") || 0),
      lo: Math.round(minOf(hrs, "temp")), hi: Math.round(maxOf(hrs, "temp")) };
  }

  // ---- the tide --------------------------------------------------------------
  // The station's turns around the day, as hours on the trip's day (past
  // midnight runs on: 25.08 is 1:05 AM).
  function turnsFor(spot, tides, iso) {
    var list = spot && spot.tide ? (tides || {})[spot.tide] : null;
    if (!list || !list.length) return [];
    return list.map(function (x) { return { h: rel(iso, x.t), v: +x.v, type: x.type }; })
      .filter(function (x) { return x.h > -14 && x.h < 40 && (x.type === "H" || x.type === "L"); })
      .sort(function (a, b) { return a.h - b.h; });
  }
  function before(T, h) { var r = null; T.forEach(function (x) { if (x.h < h) r = x; }); return r; }
  function after(T, h) { for (var i = 0; i < T.length; i++) if (T[i].h > h) return T[i]; return null; }
  // Rule of twelfths: between two turns the water moves fastest through the
  // middle third, and the first and last thirds are the soft water.
  function strongest(a, b) { var d = b.h - a.h; return [a.h + d / 3, a.h + (2 * d) / 3]; }

  // The turn a plan is timed for: inside the window or within half an hour
  // of it, the same reach the planner (rigs/trips.js) gives it credit for.
  // A squid night is timed on a high slack and nothing else: with no high
  // near dark there is no turn to time it on.
  function keyTurn(p, T, win, dark) {
    var near = T.filter(function (x) { return x.h >= win[0] - 0.5 && x.h <= win[1] + 0.5; });
    if (p.tide === "squid") {
      var highs = near.filter(function (x) { return x.type === "H"; });
      return highs.length ? highs.sort(function (a, b) { return Math.abs(a.h - dark) - Math.abs(b.h - dark); })[0] : null;
    }
    if (p.tide === "slack") return near[0] || null;
    return null;
  }
  // A high is "right at dark" when it comes after sunset and within an hour
  // and a half of full dark. A high in daylight never is.
  function atDark(x, sun, dark) { return !!(x && sun && x.type === "H" && x.h >= sun.set && Math.abs(x.h - dark) <= 1.5); }

  // Of the stretches between two turns whose fast middle third runs through
  // the trip for half an hour or more, the one with the biggest swing:
  // { a, b, s: [from, to], sw }.
  function hardest(T, win) {
    var best = null;
    for (var i = 1; i < T.length; i++) {
      var s = strongest(T[i - 1], T[i]), sw = Math.abs(T[i].v - T[i - 1].v);
      if (Math.min(s[1], win[1]) - Math.max(s[0], win[0]) >= 0.5 && (!best || sw > best.sw)) best = { a: T[i - 1], b: T[i], s: s, sw: sw };
    }
    return best;
  }
  function turnWords(x) { return at(x.h) + (x.type === "H" ? " high" : " low"); }
  // The tide over the trip, in the order it happens: the swing the trip
  // starts in when no turn comes soon, the turns in or near the trip, the
  // swing after the last of them while it still runs through the trip, and
  // when the current runs hardest, said with the swing it belongs to:
  // "High 5:36 PM, 11.3 ft, right at dark. Then a 14 ft drop by 12:50 AM,
  // current strongest 8 to 10:30 PM."
  // brief: the same without the turn the reason already names.
  function tideLine(p, T, win, key, keyDark) {
    if (!T.length) return null;
    var near = T.filter(function (x) { return x.h >= win[0] - 1 && x.h <= win[1] + 0.25; }).slice(0, 2), bits = [];
    var first = near[0], prev = before(T, first ? first.h : win[0]), last = null;
    // The trip starts mid-swing: from the turn before it to the next one.
    if (prev && (!first || first.h - win[0] >= 1.5)) {
      var to = first || after(T, win[0]);
      if (to) {
        bits.push({ a: prev, b: to, s: (to.type === "H" ? "Rising" : "Falling") + " from the " + turnWords(prev) + ", " + ft(prev.v) + ", to the " + turnWords(to) + ", " + ft(to.v) });
        if (first) near = near.slice(1);
        last = to;
      }
    }
    near.forEach(function (x) {
      bits.push({ a: last, b: x, key: x === key, s: (x.type === "H" ? "High " : "Low ") + at(x.h) + ", " + ft(x.v) + (p.dark && x === key && keyDark ? ", right at dark" : "") });
      last = x;
    });
    if (!bits.length) return null;
    var next = after(T, last.h);
    if (next && Math.min(next.h, win[1]) - last.h >= 1.5) {
      var d = next.v - last.v;
      bits.push({ a: last, b: next, then: true, s: "Then a " + swingFt(d) + (d < 0 ? " drop" : " rise") + " by " + at(next.h) });
    }
    var hard = hardest(T, win);
    if (hard) {
      var cw = hard.sw >= 3 ? "current strongest " + span(q(hard.s[0]), q(hard.s[1])).replace(/:00(?= )/g, "") : "little current";
      // Said with its own swing when a line names that swing; else right
      // after the turn it runs to ("on the drop to it"), or last, naming it.
      var own = bits.filter(function (x) { return x.a === hard.a && x.b === hard.b && (x.then || /^(Rising|Falling) /.test(x.s)); })[0];
      var into = hard.sw >= 3 ? (hard.b.type === "H" ? "on the rise to " : "on the drop to ") : "";
      var at2 = -1;
      bits.forEach(function (x, k) { if (x.b === hard.b && !x.then && !/^(Rising|Falling) /.test(x.s)) at2 = k; });
      if (own) own.s += ", " + cw;
      else if (at2 >= 0) bits.splice(at2 + 1, 0, { s: cap(cw) + (into ? ", " + into + "it" : "") });
      else bits.push({ s: cap(cw) + (into ? ", " + into + "the " + turnWords(hard.b) : "") });
    }
    var text = bits.map(function (x) { return x.s; }).join(". ") + ".";
    // The reason says the key turn already: the rest is what is new.
    var rest = bits.filter(function (x) { return !x.key; }).map(function (x) { return x.s.replace(/^Then a /, "A "); });
    return { text: text, brief: key && rest.length < bits.length ? (rest.length ? rest.join(". ") + "." : "") : text };
  }
  // A dig: WDFW's own low for the beach, and when to dig it. The clam card:
  // "Best from 1 to 2 hours before low tide."
  function digLine(dig) {
    return "Low " + at(dig.low) + ", " + ft(dig.ft) + " (WDFW). Best from 1 to 2 hours before it.";
  }

  // ---- your window: the hours you can go, judged -----------------------------
  // The window as hours on the trip's day: 20 to 0 is 8 PM to 12 AM, so the
  // end runs on to 24. Half an hour to 16 hours, or no window at all.
  function winOf(input) {
    if (!input || input.winFrom == null || input.winTo == null || input.winFrom === "" || input.winTo === "") return null;
    var a = +input.winFrom, b = +input.winTo;
    if (isNaN(a) || isNaN(b)) return null;
    if (b <= a) b += 24;
    return b - a >= 0.5 && b - a <= 16 ? [a, b] : null;
  }
  // "8 to 12": the window as people say it. from: when you can get there,
  // once that is after its start ("9:50 to 12").
  function winWords(m, from) { return (from != null ? at(from).replace(":00 ", " ").replace(/ [AP]M$/, "") : hr(m[0], true)) + " to " + hr(m[1], true); }
  // Today, from now: when the fishing can start, on getting there. Now, the
  // drive and a quarter hour (the leave time's own sum), to the next 5 minutes.
  function arrival(now, drive) { return Math.ceil((now + (drive || 0) / 60 + 0.25) * 12 - 1e-6) / 12; }
  var GRADE = { good: 2, fair: 1, tough: 0 };
  var GRADE_SAY = { good: "good", fair: "fair, not great", tough: "tough" };
  // The tide's height at an hour: a cosine between the two turns around it.
  function level(T, h) {
    for (var i = 1; i < T.length; i++) {
      if (h >= T[i - 1].h && h <= T[i].h) {
        var a = T[i - 1], b = T[i], f = (h - a.h) / (b.h - a.h || 1);
        return a.v + ((b.v - a.v) * (1 - Math.cos(Math.PI * f))) / 2;
      }
    }
    return null;
  }
  function up4(h) { return Math.ceil(h * 4 - 1e-6) / 4; }
  function down4(h) { return Math.floor(h * 4 + 1e-6) / 4; }
  // A part of the window in words: "after 10:30 PM", "until 9 PM", "9 to 10:30 PM".
  // near: to the nearest quarter, as the tide line says the current.
  function partWords(a, b, win, near) {
    var s = near ? q(a) : up4(a), e = near ? q(b) : down4(b);
    if (e <= s) { s = a; e = b; }
    if (Math.abs(a - win[0]) < 0.1) return "until " + hr(e);
    if (Math.abs(b - win[1]) < 0.1) return "after " + hr(s);
    return span(s, e).replace(/:00(?= )/g, "");
  }
  function windWords(W) {
    return W <= 3 ? "almost no wind" : W <= 7 ? "light wind" : (W <= 12 ? "breezy" : W <= 20 ? "windy" : "strong wind") + ", to " + W + " mph";
  }
  // The window judged from what the read goes by: the tide and its current
  // (soft water for squid and a slack, moving water for the rest), the
  // river's flow, the dig hours, then the rain and the wind in it.
  // win: the part of the window that can be fished. dig: WDFW's dig, if any.
  // -> { grade, part: [from, to] | null, say: [sentences], tide: judged on a tide }
  function judge(p, t, T, win, hrs, rain, dig) {
    var len = win[1] - win[0], base = 2, part = null, tideSay = "", partSay = "", tide = false, i;
    var soft = p.tide === "squid" || p.tide === "slack";
    var canTide = T.length && level(T, win[0]) != null && level(T, win[1]) != null;
    if (dig) {
      // The clam card: best from 1 to 2 hours before the low.
      var da = Math.max(win[0], dig.low - 2), db = Math.min(win[1], dig.low - 1);
      if (db - da >= 0.25) part = [da, db]; else base = 1;
      tideSay = "Low " + at(dig.low) + ", " + ft(dig.ft) + " (WDFW)";
      if (part) partSay = "Best " + partWords(part[0], part[1], win);
    } else if (canTide && (soft || p.tide === "moving" || p.tide === "flood")) {
      tide = true;
      var inside = T.filter(function (x) { return x.h > win[0] && x.h < win[1]; });
      var pts = [win[0]].concat(inside.map(function (x) { return x.h; })).concat([win[1]]), moved = 0;
      for (i = 1; i < pts.length; i++) moved += Math.abs(level(T, pts[i]) - level(T, pts[i - 1]));
      // Where the current runs hard: the middle third of a swing of 8 ft or more.
      // Little current: as the tide line says it, the swing running hardest
      // through the window is under 3 ft (or, with none, the tide barely moves).
      var strong = [], hd = hardest(T, win), little = hd ? hd.sw < 3 : moved <= 3;
      for (i = 1; i < T.length; i++) {
        var sw = Math.abs(T[i].v - T[i - 1].v), s = strongest(T[i - 1], T[i]);
        if (sw >= 8 && Math.min(s[1], win[1]) - Math.max(s[0], win[0]) > 0) strong.push([Math.max(s[0], win[0]), Math.min(s[1], win[1])]);
      }
      var hard = 0, gaps = [], from = win[0];
      strong.forEach(function (x) { hard += x[1] - x[0]; if (x[0] > from) gaps.push([from, x[0]]); from = Math.max(from, x[1]); });
      if (win[1] > from) gaps.push([from, win[1]]);
      gaps.sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); });
      var cur = strong.length ? "current strongest " + partWords(strong[0][0], strong[0][1], win, true) : little ? "little current" : "";
      if (soft) {
        // A squid night is timed on a high slack, a slack trip on either turn.
        var slack = T.filter(function (x) { return (p.tide === "slack" || x.type === "H") && x.h >= win[0] - 0.5 && x.h <= win[1] + 0.5; })
          .sort(function (a, b) { return Math.abs(a.h - (win[0] + win[1]) / 2) - Math.abs(b.h - (win[0] + win[1]) / 2); })[0];
        if (moved <= 3 || (slack && len - hard >= len / 2)) base = 2;
        else if (len - hard < 0.75) base = 0;
        else base = 1;
        var inSlack = slack && slack.h >= win[0] && slack.h <= win[1] ? slack : null;
        if (inSlack) {
          var pv = before(T, inSlack.h), d = pv ? Math.abs(inSlack.v - pv.v) : 0;
          tideSay = (pv ? "A " + swingFt(d) + (inSlack.v > pv.v ? " rise" : " drop") + " to the " : "The ") + turnWords(inSlack);
          partSay = "Best around the " + (inSlack.type === "H" ? "high" : "low");
          // The soft water around it: a third of the way to the turns either side.
          var nt = after(T, inSlack.h), ba = Math.max(win[0], pv ? inSlack.h - (inSlack.h - pv.h) / 3 : inSlack.h - 1), bb = Math.min(win[1], nt ? inSlack.h + (nt.h - inSlack.h) / 3 : inSlack.h + 1);
          if (bb - ba >= 0.5 && len - (bb - ba) >= 0.4) part = [ba, bb];
        } else {
          var net = level(T, win[1]) - level(T, win[0]), turn = inside[0];
          tideSay = turn ? (turn.type === "H" ? "High " : "Low ") + at(turn.h) + ", " + ft(turn.v)
            : moved < 0.5 ? "The tide barely moves" : "The tide " + (net < 0 ? "drops " : "rises ") + swingFt(net) + " by " + hr(win[1]);
          if (slack) {
            // Soft water from the slack just outside the window.
            var nx = after(T, slack.h), pr = before(T, slack.h);
            var sa = Math.max(win[0], pr ? slack.h - (slack.h - pr.h) / 3 : slack.h - 1), sb = Math.min(win[1], nx ? slack.h + (nx.h - slack.h) / 3 : slack.h + 1);
            if (sb - sa >= 0.5) { part = [sa, sb]; partSay = "Best " + partWords(sa, sb, win); }
          }
          if (!part && hard > 0 && gaps[0] && gaps[0][1] - gaps[0][0] >= 0.75) { part = gaps[0]; partSay = "Easiest " + partWords(part[0], part[1], win); }
        }
        if (cur) tideSay += ", " + cur;
      } else if (p.tide === "moving") {
        // The swing running through most of the window, and the stretch of it
        // clear of the hour each side of a turn.
        var most = 0, msw = 0;
        for (i = 1; i < T.length; i++) {
          var over = Math.min(T[i].h, win[1]) - Math.max(T[i - 1].h, win[0]);
          if (over > most) { most = over; msw = Math.abs(T[i].v - T[i - 1].v); }
        }
        base = msw >= 4 ? 2 : 1;
        tideSay = msw >= 4 ? "Moving water, a " + swingFt(msw) + " swing" : "A " + swingFt(msw) + " swing, little current";
        var segs = [[win[0], win[1]]];
        T.forEach(function (x) {
          var o = [];
          segs.forEach(function (s2) {
            if (x.h + 1 <= s2[0] || x.h - 1 >= s2[1]) o.push(s2);
            else { if (x.h - 1 > s2[0]) o.push([s2[0], x.h - 1]); if (x.h + 1 < s2[1]) o.push([x.h + 1, s2[1]]); }
          });
          segs = o;
        });
        var lg = segs.sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); })[0];
        if (msw >= 4 && lg && lg[1] - lg[0] >= 0.75 && len - (lg[1] - lg[0]) >= 0.4) { part = lg; partSay = "Best " + partWords(lg[0], lg[1], win); }
      } else {
        // An incoming tide: the planner has already cut the window to it.
        var hi = after(T, win[0]);
        tideSay = hi && hi.type === "H" ? "Incoming to the " + turnWords(hi) : "Incoming tide";
      }
    } else if (t.flow && t.flow.call !== "unknown") {
      var f = t.flow;
      base = f.call === "go" ? 2 : 1;
      tideSay = (f.call === "go" ? "Good flow, " : "High water, ") + cfs(f.cfs) + " cfs, " + (f.trend === "dropping" ? "dropping after a rise" : f.trend);
    }
    // The weather in it: half the hours wet or more, or more wind than half
    // the limit, takes it down a step.
    var wetH = rain.map(function (x) { return wetness(x) === 2; }), nWet = wetH.filter(Boolean).length;
    var W = Math.round(maxOf(hrs, "wind") || 0), L = (RIG.trips.limits || {})[p.how] || { wind: 20 };
    if (rain.length && nWet / rain.length >= 0.5) base--;
    if (hrs.length && W > L.wind / 2) base--;
    base = Math.max(0, base);
    if (!partSay && nWet && nWet < rain.length) {
      // The driest stretch, when the rain is only part of it.
      var run = null, k = 0;
      while (k < wetH.length) {
        if (wetH[k]) { k++; continue; }
        var e = k;
        while (e < wetH.length && !wetH[e]) e++;
        var ra = Math.max(win[0], rain[k].h), rb = Math.min(win[1], rain[e - 1].t);
        if (!run || rb - ra > run[1] - run[0]) run = [ra, rb];
        k = e;
      }
      if (run && run[1] - run[0] >= 0.75) { part = run; partSay = "Driest " + partWords(run[0], run[1], win); }
    }
    var hasRain = rain.some(function (x) { return x.pop != null || x.rain != null; });
    var wx = [hasRain ? (nWet === rain.length ? "rain all of it" : nWet / rain.length >= 0.5 ? "rain most of it" : nWet ? "some rain" : "dry") : "", hrs.length ? windWords(W) : ""].filter(Boolean).join(", ");
    var grade = base === 2 ? "good" : base === 1 ? "fair" : "tough";
    return { grade: grade, part: part, tide: tide, say: [tideSay, partSay, wx].filter(Boolean).map(sentence) };
  }

  // ---- the best hours, and why ---------------------------------------------
  function bestOf(p, t, T, win, dark, key) {
    var w = [win[0], win[1]], why = "", edges = [];
    var line = function (re) { return (t.why || []).filter(function (x) { return re.test(x); })[0] || ""; };
    if (t.beach) {
      // The clam card: the best digging is 1 to 2 hours before the low.
      var dig = p.digs && p.digs[t.iso];
      if (dig) { w = [Math.max(win[0], dig.low - 2), Math.min(win[1], dig.low - 1)]; edges = [dig.low - 2, dig.low - 1]; }
      why = line(/^WDFW dig/);
    } else if (key && (p.tide === "squid" || p.tide === "slack")) {
      var pv = before(T, key.h), nx = after(T, key.h);
      var a = pv ? key.h - (key.h - pv.h) / 3 : key.h - 1, b = nx ? key.h + (nx.h - key.h) / 3 : key.h + 1;
      if (p.tide === "slack") { a = Math.max(a, key.h - 1); b = Math.min(b, key.h + 1); }
      w = [Math.max(win[0], a), Math.min(win[1], b)];
      why = (key.type === "H" ? "High" : "Low") + " slack " + at(key.h) + (p.dark && atDark(key, t.sun, dark) ? ", right at dark" : "");
      if (w[1] - w[0] < 0.75) { w = [win[0], win[1]]; }
    } else if (p.tide === "moving" && T.length && line(/^Moving water/)) {
      // Only on a day the planner calls moving water: the longest stretch of
      // the window clear of the hour each side of a turn.
      var cuts = T.filter(function (x) { return x.h > win[0] - 1 && x.h < win[1] + 1; }), segs = [[win[0], win[1]]];
      cuts.forEach(function (x) {
        var out = [];
        segs.forEach(function (s) {
          if (x.h + 1 <= s[0] || x.h - 1 >= s[1]) out.push(s);
          else { if (x.h - 1 > s[0]) out.push([s[0], x.h - 1]); if (x.h + 1 < s[1]) out.push([x.h + 1, s[1]]); }
        });
        segs = out;
      });
      var longest = segs.sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); })[0];
      if (longest && longest[1] - longest[0] >= 0.75) w = longest;
      why = line(/^Moving water/);
    } else if (p.tide === "flood") {
      var hi = after(T, win[0]);
      why = hi && hi.type === "H" ? "Incoming tide to the " + at(hi.h) + " high" : line(/^Incoming tide/);
    } else if (t.flow) {
      var f = t.flow;
      why = f.call === "unknown" ? "" :
        (f.call === "go" ? "Good flow, " : "High water, ") + cfs(f.cfs) + " cfs, " + (f.trend === "dropping" ? "dropping after a rise" : f.trend);
    } else {
      why = line(/^Stocked /) || "";
    }
    var own = Math.abs(w[0] - win[0]) >= 0.4 || Math.abs(w[1] - win[1]) >= 0.4;
    // A daylight trip with no hours of its own: the light is why the window
    // is what it is.
    if (!why && !own && !p.dark && t.sun) {
      var sr = Math.abs(win[0] - t.sun.rise) < 0.1, ss = Math.abs(win[1] - t.sun.set) < 0.1;
      why = sr && ss ? "First light to sunset" : sr ? "From first light, " + at(t.sun.rise) : ss ? "Until sunset, " + at(t.sun.set) : "";
    }
    // An edge that is a turn or a dig hour is said to the minute; one that
    // is worked out (a third of the way to the next turn) to the quarter,
    // the start rounded up and the end down, so the best hours never say a
    // time outside the trip.
    var exact = function (h) { return T.some(function (x) { return Math.abs(x.h - h) < 0.01; }) || edges.some(function (e) { return Math.abs(e - h) < 0.01; }); };
    var s0 = exact(w[0]) ? Math.round(w[0] * 60) / 60 : Math.ceil(w[0] * 4 - 1e-6) / 4, s1 = exact(w[1]) ? Math.round(w[1] * 60) / 60 : Math.floor(w[1] * 4 + 1e-6) / 4;
    if (s1 <= s0) { s0 = w[0]; s1 = w[1]; }
    return { from: w[0], to: w[1], say: [s0, s1], why: why, own: own };
  }

  // ---- what to expect ---------------------------------------------------------
  // A few sentences, most telling first: what nobody has confirmed about the
  // spot after dark, a day off crowd, the gear tonight's current calls for,
  // the moon. brief: the first of them.
  function expectLine(p, t, iso, run, win, cur) {
    var out = [], ex = (run && run.expect) || [], fact = FACTS[p.spot] || {}, crowdFact = fact.crowd && fact.crowd[p.species];
    var unknown = ((p.site && p.site.unknown) || []).concat((run && run.spot && run.spot.unknown) || []);
    // A night trip to a spot whose hours after dark nobody has confirmed.
    var hrsUnk = p.dark ? unknown.filter(function (x) { return /hours at night/i.test(x); })[0] : "";
    if (hrsUnk) out.push(sentence(hrsUnk + " not confirmed"));
    var dow = dowOf(iso), off = (T().daysOff || []).indexOf(iso) !== -1, weekend = dow === 0 || dow === 6;
    // A crowd fact is said only in the months it is true in, and a run
    // card's crowd line not at all where the spot lists its crowds as unknown.
    if (crowdFact && crowdFact.months && crowdFact.months.indexOf(monthOf(iso)) === -1) crowdFact = null;
    var crowdUnk = unknown.some(function (x) { return /crowd/i.test(x); });
    if (off || weekend) {
      var crowd = crowdUnk ? "" : ex.map(firstSentence).filter(function (x) { return /crowd/i.test(x) && !/not (seen|confirmed)/i.test(x); })[0];
      if (crowd && /weekend/i.test(crowd)) out.push(crowd);
      else if (crowd || crowdFact) out.push((weekend ? "Weekend: " : "Day off: ") + low((crowd || crowdFact.text).replace(/[.\s]*$/, "")) + ".");
    }
    if (cur && run && run.current && out.length < 2) {
      // The same quarter hours the tide line says the current runs hardest in.
      out.push(cur[0] <= win[0] + 0.1 ? "Until " + hr(q(cur[1])) + ", " + low(run.current) : "After " + hr(q(cur[0])) + ", " + low(run.current));
    }
    if (t && (t.why || []).some(function (w) { return /^Bright moon/.test(w); }) && out.length < 2) {
      var moon = ex.map(firstSentence).filter(function (x) { return /moon/i.test(x); })[0];
      if (moon) out.push(moon);
    }
    if (!out.length && ex.length) {
      // The run card's first word on it, never a crowd it does not know. A
      // lone word ("Slow.") is not said: the call already said how the day
      // is. A first sentence of a few words ("A thin year.") takes the next
      // one with it.
      var e0 = ex.filter(function (x) { return !/not (seen|confirmed)/i.test(firstSentence(x)) && !(crowdUnk && /crowd/i.test(firstSentence(x))); })[0];
      if (e0) {
        if (/^(Slow|Hot|Good)\.\s/.test(e0)) e0 = e0.replace(/^\w+\.\s+/, "");
        var one = firstSentence(e0), rest = e0.slice(one.length).trim();
        out.push(one.split(" ").length < 4 && rest ? one + " " + firstSentence(rest) : one);
      }
    }
    out = out.map(function (x) { return /[.!?]\s/.test(x) ? x : sentence(x); });
    return { text: out.join(" "), brief: out[0] || "" };
  }

  // ---- the read ---------------------------------------------------------------
  function core(input) {
    input = input || {};
    var p = planOf(input.planId), spot = p && spotOf(p.spot);
    var out = { planId: input.planId, iso: input.iso, status: "unknown", call: "", heat: "", headline: "", reason: "", leave: "", best: null,
      lines: [], fig: null, others: [], pick: null, name: p ? shortName(p) : "", drive: spot ? spot.drive : null, grade: "", hours: null, better: null };
    if (!p || !spot) return out;
    var det = T().detail({ planId: p.id, iso: input.iso, from: input.from, to: input.to, wx: input.wx, tides: input.tides, flow: input.flow });
    out.status = det.status;
    var w = (input.wx || {})[spot.id], iso = input.iso;
    var sun = (w && w.sun && w.sun[iso]) || null, dark = sun ? sun.set + 0.6 : null;
    var t = det.status === "ok" ? det.trip : null;
    var win, mine = winOf(input), now = input.nowHour, fromNow = false, arr = now != null ? arrival(now, spot.drive) : null;
    if (t) win = [t.from, t.to];
    else {
      var a = input.from == null ? (p.dark && sun ? dark : sun ? sun.rise : 7) : +input.from;
      var b = input.to == null ? (p.dark ? 22 : sun ? sun.set : 17) : +input.to;
      win = b > a ? [a, b] : [a, a + 2];
    }

    // Today, and under half an hour of the hours is left once you get there
    // (the window's, when there is one): done, and the next good day.
    var live = t || (mine && (det.status === "nogo" || det.status === "dark"));
    if (live && arr != null && arr > (mine ? mine[1] : win[1]) - 0.5) {
      out.call = "done"; out.headline = "Done for today";
      if (mine) {
        var nd = nextDay(input, mine, GRADE.good, null);
        out.reason = nd ? "Next good day for " + winWords(mine) + ": " + dayWords(nd) + "." : "No other good day for " + winWords(mine) + " in this forecast.";
        return out;
      }
      for (var i = 1; i <= 6; i++) {
        var d2 = isoPlus(iso, i), n2 = T().detail({ planId: p.id, iso: d2, wx: input.wx, tides: input.tides, flow: input.flow });
        if (n2.status === "nodata") break;
        if (n2.status === "ok" && n2.trip.heat !== "Slow" && !(n2.trip.flow && n2.trip.flow.call === "unknown")) {
          out.reason = "Next good day: " + (i === 1 ? "tomorrow" : DAYS[dowOf(d2)]) + ", " + span(n2.trip.from, n2.trip.to) + ".";
          break;
        }
      }
      if (!out.reason) out.reason = "No other good day in this forecast.";
      return out;
    }
    if (mine) {
      // The window, from when you can get there once that is after its
      // start: the planner reads those hours (full dark for a night trip,
      // daylight for the rest).
      fromNow = arr != null && arr > mine[0];
      var wf = fromNow ? arr : mine[0];
      det = T().detail({ planId: p.id, iso: iso, from: wf, to: mine[1], wx: input.wx, tides: input.tides, flow: input.flow });
      out.status = det.status;
      t = det.status === "ok" ? det.trip : null;
      win = t ? [t.from, t.to] : [wf, mine[1]];
      out.mine = mine;
    } else if (t && arr != null && arr > win[0]) {
      // Leaving now gets you there after the start: it is read from then.
      fromNow = true;
      win = [arr, win[1]];
    }
    out.win = win;
    out.hours = t ? [win[0], win[1]] : null;
    var hrs = hoursIn(w, iso, win[0], win[1]), rain = rainIn(w, iso, win[0], win[1]);
    var turns = turnsFor(spot, input.tides, iso);
    var key = t ? keyTurn(p, turns, win, dark) : null;
    // What two spots' tides are compared by when there is no turn to time on.
    out.station = spot.tide || "";
    out.edge = turns.length ? [level(turns, win[0]), level(turns, win[1])] : null;
    out.sum = wxSum(hrs, rain);
    out.flow = !!(t && t.flow);
    out.facts = FACTS[spot.id] || {};
    out.dark = !!p.dark;
    out.why = (t && t.why) || [];

    if (t) {
      out.heat = t.heat; out.score = t.score; out.unproven = !!t.unproven;
      out.key = key;
      out.keyDark = p.dark && atDark(key, sun, dark);
      var best, unknown = t.flow && t.flow.call === "unknown";
      if (mine) {
        // The window, judged.
        var jd = judge(p, t, turns, win, hrs, rain, t.beach ? p.digs && p.digs[iso] : null), label = winWords(mine, fromNow ? wf : null);
        var pt = jd.part || win, say = [jd.part ? up4(pt[0]) : pt[0], jd.part ? down4(pt[1]) : pt[1]];
        if (say[1] <= say[0]) say = [pt[0], pt[1]];
        best = { from: pt[0], to: pt[1], say: say, why: "", own: !!jd.part };
        out.grade = jd.grade; out.rank = GRADE[jd.grade]; out.tideJudged = jd.tide;
        // Cut by the dark or the light: said first.
        var cut = p.dark && win[0] > wf + 0.1 && Math.abs(win[0] - dark) < 0.1 ? "Full dark at " + at(dark) + "."
          : !p.dark && sun && win[1] < mine[1] - 0.1 && Math.abs(win[1] - sun.set) < 0.1 ? "Sunset at " + at(sun.set) + "." : "";
        if (unknown) { out.call = "none"; out.headline = label + ": no river reading yet"; }
        else { out.call = jd.grade === "good" ? "go" : "slow"; out.headline = label + ": " + GRADE_SAY[jd.grade]; }
        out.reason = [cut].concat(jd.say).filter(Boolean).join(" ");
      } else {
        best = bestOf(p, Object.assign({ iso: iso }, t), turns, win, dark, key);
        // From now: the hours left, said as "until".
        var hours = fromNow ? "until " + at(best.own ? best.say[1] : win[1]) : best.own ? "best " + span(best.say[0], best.say[1]) : span(win[0], win[1]);
        if (fromNow && best.own) hours = "best " + hours;
        if (unknown) {
          // A river with no gauge reading for the day: no call either way.
          out.call = "none"; out.headline = "No river reading yet, " + hours;
        } else {
          out.call = t.heat === "Slow" ? "slow" : "go";
          out.headline = (t.heat === "Slow" ? "Slow" : "Go") + ", " + hours;
        }
        out.reason = best.why ? sentence(best.why) : "";
      }
      out.best = best;
      if (!unknown) {
        // A leave time that has gone by is never said: leave now. Read from
        // when you get there, it is now.
        var lh = win[0] - (spot.drive || 0) / 60 - 0.25;
        out.leave = fromNow || (now != null && lh <= now) ? "Leave now" : "Leave by " + T().leaveBy({ from: win[0], drive: spot.drive });
      }
      // How many hours of the best ones (or the trip) are wet: what a rain cover is worth.
      var bw = best.own ? [best.from, best.to] : win;
      out.wetBest = rain.filter(function (x) { return wetness(x) === 2 && Math.min(x.t, bw[1]) - Math.max(x.h, bw[0]) >= 0.25; }).length;
    } else if (det.status === "nogo") {
      out.call = "no"; out.headline = "No, " + low(String(det.why));
      if (mine) out.rank = -1;
    } else if (det.status === "dark") {
      out.call = "no"; out.headline = "No, dark by then";
      out.reason = "Sunset " + at(det.sunset) + ". This one fishes in daylight.";
      if (mine) out.rank = -1;
    } else if (det.status === "closed") {
      // The reason is a sentence of its own (a ramp, a rule): said as written.
      out.call = "no";
      if (det.why) { out.headline = "No, off the list for now"; out.reason = sentence(det.why); }
      else out.headline = "No, out of season that day";
    } else if (det.status === "nodata") {
      out.headline = "No forecast for that day yet";
      return out;
    } else return out;

    // The lines. A closed water gets none: the weather does not matter there.
    if (det.status === "closed" || det.status === "dark") return out;
    var cur = null, dig = p.digs && p.digs[iso];
    if (t && t.beach && dig) out.lines.push({ k: "tide", label: "Tide", text: digLine(dig), brief: "" });
    else if (turns.length) {
      var tl = tideLine(p, turns, win, key, out.keyDark);
      if (tl) out.lines.push({ k: "tide", label: "Tide", text: tl.text, brief: tl.brief });
      var hard = hardest(turns, win);
      if (hard && hard.sw >= 8) cur = hard.s;
    } else if (t && t.flow) {
      var f = t.flow;
      // The reason says the flow and its trend; this line, the numbers it is
      // held to. Numbers not yet tuned by real trips are called that.
      var held = "ishable to " + cfs(f.good) + " cfs, blown out over " + cfs(f.high) + ".";
      out.lines.push({ k: "river", label: "River", text: (f.lead ? "Starting numbers: f" : "F") + held +
        (f.now && f.now.cfs != null && iso === laDay(f.now.at) ? " Now " + cfs(f.now.cfs) + "." : "") });
    }
    var nowWet = 0;
    if (input.nowHour != null && input.nowHour < win[1]) {
      // The rain now is the reading for the hour that ends next.
      var nh = rainIn(w, iso, Math.floor(input.nowHour), Math.floor(input.nowHour) + 1).filter(function (x) { return x.t === Math.floor(input.nowHour) + 1; })[0];
      if (nh && nh.rain >= 0.01) nowWet = nh.rain;
    }
    var rl = rainLine(rain, win[0], win[1], nowWet);
    if (rl) out.lines.push({ k: "rain", label: "Rain", text: rl });
    var wl = windLine(hrs);
    if (wl) out.lines.push({ k: "wind", label: "Wind", text: wl });
    if (t) {
      var ex = expectLine(p, t, iso, (T().runs || {})[p.id], win, cur);
      if (ex.text) out.lines.push({ k: "expect", label: "Expect", text: ex.text, brief: ex.brief });
    }
    out.fig = { a: win[0], b: win[1], best: out.best && out.best.own ? [out.best.from, out.best.to] : null,
      tide: turns.length ? turns.filter(function (x) { return x.h > win[0] - 14 && x.h < win[1] + 14; }) : null,
      key: key ? { h: key.h, v: key.v, type: key.type } : null,
      // Each hour of rain from when it starts to when it ends.
      rain: rain.map(function (x) { return { h: x.h, t: x.t, pop: x.pop, rain: x.rain }; }) };
    return out;
  }

  // ---- the same window on another day -----------------------------------------
  var DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // "Fri Dec 4"
  function dayWords(iso) { return DAY3[dowOf(iso)] + " " + MON3[monthOf(iso) - 1] + " " + +String(iso).slice(8, 10); }
  // The first day after this one, in the forecast the app holds, whose read
  // of the same window ranks need or better. tide: the day must be judged on
  // a tide the same as this one was (true) or not (false); null, either.
  function nextDay(input, mine, need, tide) {
    for (var i = 1; i <= 7; i++) {
      var d = isoPlus(input.iso, i);
      var r = core({ planId: input.planId, iso: d, winFrom: mine[0], winTo: mine[1], wx: input.wx, tides: input.tides, flow: input.flow });
      if (r.status === "nodata") break;
      if (!called(r) || r.rank == null || r.rank < need) continue;
      if (tide != null && !!r.tideJudged !== tide) continue;
      return d;
    }
    return null;
  }

  // ---- the same fish somewhere else -----------------------------------------
  function othersFor(input, p) {
    if (input.others) return input.others.map(planOf).filter(Boolean);
    var spot = spotOf(p.spot), reach = Math.max((spot ? spot.drive : 0) + 30, 45);
    var open = T().plansOn ? T().plansOn(input.iso).map(function (x) { return x.id; }) : [];
    return (T().plans || []).filter(function (o) {
      var s = spotOf(o.spot);
      return o.id !== p.id && o.species === p.species && o.how === p.how && open.indexOf(o.id) !== -1 && s && s.drive <= reach;
    });
  }
  // The same tide: the same turn to time on. With none in either: the same
  // NOAA station, or the water at the same height (1.2 ft) at both ends of the hours.
  function sameTide(a, b) {
    if (a.key || b.key) return !!(a.key && b.key) && a.key.type === b.key.type && Math.abs(a.key.h - b.key.h) <= 0.34 && Math.abs(a.key.v - b.key.v) <= 1.2;
    if (!a.station || !b.station) return false;
    if (a.station === b.station) return true;
    var e = a.edge, f = b.edge;
    return !!(e && f && e[0] != null && e[1] != null && f[0] != null && f[1] != null && Math.abs(e[0] - f[0]) <= 1.2 && Math.abs(e[1] - f[1]) <= 1.2);
  }
  function sameWx(a, b) {
    var pa = a.sum.pop == null ? (a.sum.wet ? 60 : 0) : a.sum.pop, pb = b.sum.pop == null ? (b.sum.wet ? 60 : 0) : b.sum.pop;
    return Math.abs(pa - pb) <= 15 && Math.abs(a.sum.wind - b.sum.wind) <= 3 && Math.abs(a.sum.lo - b.sum.lo) <= 3 && Math.abs(a.sum.hi - b.sum.hi) <= 3;
  }
  function wxDiff(a, b) {
    // b against a, in a few words.
    if (b.sum.wind > a.sum.wind + 3) return "windier, to " + b.sum.wind + " mph";
    if (a.sum.wind > b.sum.wind + 3) return "calmer, to " + b.sum.wind + " mph";
    var pa = a.sum.pop == null ? 0 : a.sum.pop, pb = b.sum.pop == null ? 0 : b.sum.pop;
    if (pb > pa + 15) return "wetter, up to " + Math.round(pb) + "%";
    if (pa > pb + 15) return "drier, " + Math.round(pb) + "% at most";
    if (Math.abs(a.sum.lo - b.sum.lo) > 3) return b.sum.lo < a.sum.lo ? "colder, " + b.sum.lo + "°F" : "warmer, " + b.sum.lo + "°F";
    return "";
  }
  // What o has that s does not, from the cards and the plans.
  function factDiff(s, o, op) {
    var out = [];
    if (o.facts.cover && !s.facts.cover) out.push(o.facts.cover);
    if (o.dark) {
      if (o.facts.outlets && !s.facts.outlets) out.push(o.facts.outlets);
      var unk = ((op.site && op.site.unknown) || []).filter(function (x) { return /hours at night/i.test(x); })[0];
      if (unk) out.push(low(unk) + " not confirmed");
    }
    return out;
  }
  var RANK = { Hot: 2, Good: 1, Slow: 0 };
  // How good a read is: its window's grade when it judged one, else the day's heat.
  function rk(r) { return r.rank != null ? r.rank : RANK[r.heat] || 0; }
  function trim(x) { return String(x || "").replace(/[.\s]*$/, ""); }
  function called(r) { return r.status === "ok" && (r.call === "go" || r.call === "slow"); }
  function compare(s, o, op) {
    var bits = [];
    if (!called(o)) return "";
    if (s.status !== "ok") bits.push(o.call === "slow" ? "a slow go" : "a go");
    else {
      var st = sameTide(s, o), sw = sameWx(s, o);
      if (st && sw) bits.push("same tide and weather");
      else if (st) bits.push("same tide", wxDiff(s, o));
      else if (sw) bits.push("same weather", o.key ? (o.key.type === "H" ? "high " : "low ") + at(o.key.h) : "");
      else bits.push(wxDiff(s, o));
      // Rivers: the other one's flow and trend, from its reason.
      if (o.flow && !st) bits.push(low(trim(o.reason)));
      var ho = rk(o), hs = rk(s);
      if (s.grade && o.grade) { if (ho !== hs) bits.push(ho > hs ? "better" : "tougher"); }
      else if (o.heat && s.heat && ho !== hs) bits.push(ho > hs ? (o.heat === "Hot" ? "hot" : "better") : "slower");
      // Stocked lakes: when the other one was planted.
      if (/^Stocked /.test(o.reason) && o.reason.split(":")[0] !== s.reason.split(":")[0]) bits.push(low(o.reason.split(":")[0]));
    }
    var d = (o.drive || 0) - (s.drive || 0);
    if (Math.abs(d) >= 5) bits.push(d < 0 ? -d + " min closer" : d + " min farther");
    bits = bits.concat(factDiff(s, o, op));
    bits = bits.filter(Boolean);
    return bits.length ? o.name + ": " + bits.join(", ") + "." : "";
  }
  // Of this spot and the others: the one to go to. The same one from every
  // spot's read. kind: "cover" (rain on the best hours, and only it has a
  // roof), "better" (a higher score), "closer" (the same score, 5 min or
  // more closer).
  function pickOf(self, list) {
    var all = [self].concat(list).filter(called);
    if (all.length < 2) return null;
    var topHeat = Math.max.apply(null, all.map(rk));
    var top = all.filter(function (r) { return rk(r) === topHeat; });
    var order = function (a, b) { return (b.score || 0) - (a.score || 0) || (a.unproven ? 1 : 0) - (b.unproven ? 1 : 0) || (a.drive || 0) - (b.drive || 0); };
    // A roof is worth the drive when two hours or more of the best ones are wet.
    var covered = top.filter(function (r) { return r.facts.cover; }).sort(order);
    if (covered.length && covered.length < top.length && top.some(function (r) { return r.wetBest >= 2; })) return { r: covered[0], kind: "cover", all: all, top: top };
    top.sort(order);
    var w = top[0], r2 = top[1];
    if (!r2 || (w.score || 0) > (r2.score || 0)) return { r: w, kind: "better", all: all, top: top };
    if ((r2.drive || 0) - (w.drive || 0) >= 5) return { r: w, kind: "closer", all: all, top: top };
    return null;
  }
  // Why the pick, said from where this read stands: against this spot, or,
  // when the pick is this spot, against the next best. Only what truly
  // differs between the two, never something the other one has too.
  function pickWhy(pk, self) {
    var r = pk.r, rest = pk.all.filter(function (x) { return x !== r; }).sort(function (a, b) { return rk(b) - rk(a) || (b.score || 0) - (a.score || 0) || (a.drive || 0) - (b.drive || 0); });
    var other = r === self ? rest[0] : self;
    var has = function (x, re) { return (x.why || []).some(function (w) { return re.test(w); }); };
    var closer = function () {
      if (r === self) {
        if (rest.every(function (x) { return (x.drive || 0) - (r.drive || 0) >= 5; })) return "the closest";
        var d0 = (other.drive || 0) - (r.drive || 0);
        return d0 >= 5 ? d0 + " min closer than " + other.name : "";
      }
      var d = (self.drive || 0) - (r.drive || 0);
      return d >= 5 ? d + " min closer" : "";
    };
    if (pk.kind === "cover" && !other.facts.cover) return "for the rain cover";
    if (pk.kind === "closer" && pk.top.indexOf(other) !== -1) return closer();
    if (r.keyDark && !other.keyDark) return "for the high slack right at dark";
    if (r.sum.wind + 3 < other.sum.wind) return "calmer, to " + r.sum.wind + " mph";
    var pr = r.sum.pop == null ? 0 : r.sum.pop, po = other.sum.pop == null ? 0 : other.sum.pop;
    if (pr + 15 < po) return "drier, " + Math.round(pr) + "% at most";
    if (r.flow && /^Good flow/.test(r.reason) && trim(r.reason) !== trim(other.reason)) return "for the " + low(trim(r.reason));
    var plant = /^Stocked ([^:]+)/.exec(r.reason || "");
    if (plant && (other.reason || "").split(":")[0] !== r.reason.split(":")[0]) return "for the " + plant[1] + " plant";
    if (has(r, /^Peak season/) && !has(other, /^Peak season/)) return "for the peak season";
    return closer();
  }

  function read(input) {
    var self = core(input), p = planOf(input && input.planId);
    // A window that is not good, and a day in this forecast that suits the
    // same window better: one line naming it. Only from the data the app
    // holds: a day the read cannot judge the same way is never named.
    if (p && self.mine && self.call && self.call !== "done" && self.grade !== "good" && (self.rank != null)) {
      var bd = nextDay(input, self.mine, self.rank + 1, self.rank >= 0 ? !!self.tideJudged : null);
      if (bd) self.better = { iso: bd, text: "Better for " + winWords(self.mine) + ": " + dayWords(bd) + "." };
    }
    // Nothing to call, or a trip done for today: no others.
    if (!p || !self.call || self.call === "done") return strip(self);
    var others = othersFor(input, p).map(function (o) {
      // The same hours as this read, from now when this one is: each other
      // spot is read as if you got there when you get here, so a pier is
      // never "better" only because you would arrive later.
      var lag = ((self.drive || 0) - ((spotOf(o.spot) || {}).drive || 0)) / 60;
      var r = core({ planId: o.id, iso: input.iso, from: input.from, to: input.to, winFrom: input.winFrom, winTo: input.winTo, wx: input.wx, tides: input.tides, flow: input.flow, nowHour: input.nowHour == null ? null : input.nowHour + lag });
      r.plan = o;
      return r;
    }).filter(called);
    others.sort(function (a, b) { return rk(b) - rk(a) || (b.score || 0) - (a.score || 0) || (a.drive || 0) - (b.drive || 0); });
    // The pick is made from every spot, so each spot's read picks the same
    // one. Two others are named at most, and the pick is always one of them.
    var pk = called(self) ? pickOf(self, others) : null;
    var shown = pk && pk.r !== self ? [pk.r].concat(others.filter(function (o) { return o !== pk.r; })).slice(0, 2) : others.slice(0, 2);
    var said = shown.map(function (o) { return { planId: o.planId, name: o.name, text: compare(self, o, o.plan) }; }).filter(function (o) { return o.text; });
    self.others = said;
    if (pk) {
      var why = pickWhy(pk, self);
      // Its reason once: when the pick's own line is "the same, and this"
      // and this is the reason, the pick is its name.
      var told = said.filter(function (o) { return o.planId === pk.r.planId; })[0];
      var m = told && /^[^:]+: (same tide and weather|same weather|same tide), (.*)\.$/.exec(told.text), again = !!(m && why && m[2] === why);
      self.pick = { planId: pk.r.planId, name: pk.r.name, why: why, self: pk.r === self, text: "Pick: " + pk.r.name + (why && !again ? ", " + why : "") + "." };
    }
    if (said.length) {
      var tail = self.pick ? " " + self.pick.text : "";
      self.lines.push({ k: "or", label: "Or", text: said.map(function (o) { return o.text; }).join(" ") + tail, brief: said[0].text + tail });
    }
    return strip(self);
  }
  // What a caller sees: the words and the picture, not the working.
  function strip(r) {
    return { planId: r.planId, iso: r.iso, status: r.status, call: r.call, heat: r.heat, headline: r.headline, reason: r.reason, leave: r.leave,
      best: r.best ? { from: r.best.from, to: r.best.to, say: r.best.say, why: r.best.why, own: r.best.own } : null, name: r.name, drive: r.drive,
      lines: r.lines, fig: r.fig, others: r.others, pick: r.pick, hours: r.hours, grade: r.grade, better: r.better };
  }

  // ---- the window, saved on this phone ----------------------------------------
  // One key. A night trip and a daylight trip each keep their own: the hours
  // someone can go after dark say nothing about a Saturday on the river.
  //   kindOf(planId)          "dark" or "day"
  //   get(kind)               { from: "20:00", to: "00:00" } or null
  //   set(kind, from, to)     two "HH:MM" boxes; false when they make no window
  //   clear(kind)             back to the trip's own hours
  //   hours(w)                { winFrom, winTo } as RIG.trips.read takes them
  var WIN_KEY = "rig.win.v1";
  function hhmm(v) { var m = /^(\d{1,2}):(\d\d)/.exec(String(v || "")); return m && +m[1] < 24 && +m[2] < 60 ? pad(+m[1]) + ":" + m[2] : null; }
  function boxH(v) { var m = /^(\d\d):(\d\d)$/.exec(v); return +m[1] + m[2] / 60; }
  function winAll() { try { var x = JSON.parse(root.localStorage.getItem(WIN_KEY) || "null"); return x && typeof x === "object" ? x : {}; } catch (e) { return {}; } }
  function winPut(all) { try { if (Object.keys(all).length) root.localStorage.setItem(WIN_KEY, JSON.stringify(all)); else root.localStorage.removeItem(WIN_KEY); } catch (e) { /* no storage: the window lasts the visit */ } }
  var myWin = {
    key: WIN_KEY,
    kindOf: function (planId) { var p = planOf(planId); return p && p.dark ? "dark" : "day"; },
    get: function (kind) {
      var w = winAll()[kind], a = w && hhmm(w.from), b = w && hhmm(w.to);
      return a && b && winOf({ winFrom: boxH(a), winTo: boxH(b) }) ? { from: a, to: b } : null;
    },
    set: function (kind, from, to) {
      var a = hhmm(from), b = hhmm(to);
      if (!a || !b || !winOf({ winFrom: boxH(a), winTo: boxH(b) })) return false;
      var all = winAll(); all[kind] = { from: a, to: b }; winPut(all);
      return true;
    },
    clear: function (kind) { var all = winAll(); delete all[kind]; winPut(all); },
    hours: function (w) { return w ? { winFrom: boxH(w.from), winTo: boxH(w.to) } : null; }
  };

  RIG.trips.read = read;
  RIG.trips.readFacts = FACTS;
  RIG.trips.myWin = myWin;
})(typeof window !== "undefined" ? window : globalThis);
