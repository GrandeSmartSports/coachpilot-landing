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
//   nowHour:   the hour now, when iso is today: "Light rain now".
//
// Out: { planId, iso, status, call, heat, headline, reason, leave, best,
//        lines: [{ k, label, text }], fig, others: [{ planId, name, text }],
//        pick: { planId, name, why } | null }
//   status: what RIG.trips.detail said (ok, nogo, dark, closed, nodata, unknown)
//   call:   "go", "slow", "no", or "" when there is nothing to call
//   lines:  Tide (or River), Rain, Wind, Expect, Or. A line the data cannot
//           back is left out, never guessed.
//   fig:    what a small picture of the trip needs: the hours, the tide turns
//           and the chance of rain by the hour.
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
  //   cover: a rain cover to stand under
  //   lamps: the pier's own lights ("own": you bring your own)
  //   crowd: what the card says about the crowd, by fish, for a day off
  var FACTS = {
    // WDFW pier page: "Rain cover, railings, lights ... open 24 hours".
    // KUOW: "shoulder-to-shoulder squid crowds in November".
    "les-davis": { cover: "a rain cover", lamps: "pier", crowd: { squid: "shoulder to shoulder squid crowds in November" } },
    // Coach's own pictures: "Tall single-arm lamp posts along the pier".
    // Card: "Busy night squid pier, October to December".
    redondo: { lamps: "pier", crowd: { squid: "a busy squid pier, October to December" } },
    // Card: "Night squid pier; anglers bring their own lights, outlets at the end".
    "des-moines-pier": { lamps: "own" }
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
  // The forecast's hours that fall in the window. An hour's reading stands
  // for the hour that starts there, so 5:00 counts for a trip that starts
  // at 4:56.
  function hoursIn(w, iso, a, b) {
    return ((w && w.hours) || []).map(function (x) { return { h: rel(iso, x.t), x: x }; })
      .filter(function (o) { return o.h > a - 0.75 && o.h < b; })
      .map(function (o) { return { h: o.h, temp: o.x.temp, rain: o.x.rain, pop: o.x.pop == null ? null : +o.x.pop, wind: o.x.wind, gust: o.x.gust, wave: o.x.wave }; });
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
  // by 7". Nothing to go on, nothing said.
  function rainLine(hrs, a, b, now, nowHrs) {
    if (!hrs.length || !hrs.some(function (x) { return x.pop != null || x.rain != null; })) return "";
    var hasPop = hrs.some(function (x) { return x.pop != null; }), W = hrs.map(wetness);
    var lead = "";
    if (now) lead = now >= 0.05 ? "Rain now. " : "Light rain now. ";
    var top = maxOf(hrs, "pop"), part = partWord(a, b);
    // Hour labels: the first says AM or PM, the rest only where it changes.
    var said = null;
    function lab(h) { var s = hr(h, said != null && ampm(said) === ampm(h)); said = h; return s; }
    var allDry = W.every(function (w) { return w < 2; }), allWet = W.every(function (w) { return w === 2; });
    if (allDry && W.every(function (w) { return w === 0; })) return lead + (hasPop && top > 5 ? "Dry, " + Math.round(top) + "% at most." : "Dry.");
    if (allDry) return lead + "Mostly dry, " + Math.round(top) + "% at most.";
    if (allWet) {
      var lo = minOf(hrs, "pop");
      return lead + "Rain all " + part + (hasPop ? ", " + (Math.round(lo) === Math.round(top) ? Math.round(top) + "%" : Math.round(lo) + " to " + Math.round(top) + "%") : "") + ".";
    }
    // Wet at the start, then clear to the end: the chance hour by hour until it is done.
    var k = W.length;
    while (k > 0 && W[k - 1] === 0) k--;
    if (k > 0 && k < W.length && W[0] > 0) {
      var steps = hrs.slice(0, Math.min(k, 3)).map(function (x) { return (hasPop ? chance(x) + " at " : "Rain at ") + lab(x.h); });
      if (!hasPop) steps = [steps[0]];
      return lead + steps.join(", ") + ", done by " + lab(hrs[k].h) + ".";
    }
    // Clear at the start, then wet: when it starts.
    var s = 0;
    while (s < W.length && W[s] < 2) s++;
    if (s > 0 && s < W.length) {
      var e = s;
      while (e < W.length && W[e] === 2) e++;
      var wetTop = maxOf(hrs.slice(s, e), "pop");
      var first = "Dry until " + lab(hrs[s].h);
      if (e === W.length) return lead + first + ", then " + (hasPop ? "up to " + Math.round(wetTop) + "%" : "rain") + ".";
      return lead + first + ", then " + (hasPop ? Math.round(wetTop) + "%" : "rain") + " to " + lab(hrs[e].h) + ".";
    }
    var peak = hrs.filter(function (x) { return x.pop === top; })[0] || hrs[0];
    return lead + "On and off" + (hasPop ? ", up to " + Math.round(top) + "% at " + lab(peak.h) : "") + ".";
  }

  // Wind and temperature: "Almost none, 1 to 3 mph. 46 to 49°F."
  function windLine(hrs) {
    if (!hrs.length) return "";
    var W = Math.round(maxOf(hrs, "wind") || 0), w = Math.round(minOf(hrs, "wind") || 0), G = Math.round(maxOf(hrs, "gust") || 0);
    var lo = Math.round(minOf(hrs, "temp")), hi = Math.round(maxOf(hrs, "temp")), wave = maxOf(hrs, "wave");
    var word = W <= 3 ? "Almost none" : W <= 7 ? "Light" : W <= 12 ? "Breezy" : W <= 20 ? "Windy" : "Strong";
    var out = word + ", " + (w === W ? W : w + " to " + W) + " mph" + (G >= W + 6 ? ", gusts " + G : "") + ".";
    if (!isNaN(lo)) out += " " + (lo === hi ? lo : lo + " to " + hi) + "°F.";
    if (wave != null) out += " Surf to " + Math.round(wave) + " ft.";
    return out;
  }

  // A summary of the weather over the trip, for comparing two spots.
  function wxSum(hrs) {
    return { pop: maxOf(hrs, "pop"), wet: hrs.some(function (x) { return wetness(x) === 2; }), wind: Math.round(maxOf(hrs, "wind") || 0),
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

  // The turn a plan is timed for, inside or just around the window.
  function keyTurn(p, T, win, dark) {
    var near = T.filter(function (x) { return x.h >= win[0] - 1 && x.h <= win[1] + 0.25; });
    if (p.tide === "squid") {
      var highs = near.filter(function (x) { return x.type === "H"; });
      if (highs.length) return highs.sort(function (a, b) { return Math.abs(a.h - dark) - Math.abs(b.h - dark); })[0];
      return near[0] || null;
    }
    if (p.tide === "slack") return near[0] || null;
    return null;
  }

  // The stretch between two turns whose fast middle third runs through the
  // trip: [from, to] as hours, the swing in ft, or null.
  function hardest(T, win) {
    for (var i = 1; i < T.length; i++) {
      var s = strongest(T[i - 1], T[i]);
      if (s[0] < win[1] && s[1] > win[0]) return { s: s, sw: Math.abs(T[i].v - T[i - 1].v) };
    }
    return null;
  }
  // The turns in or near the trip, the swing after the last of them while
  // it still runs through the trip, and when the current runs hardest:
  // "High 5:35 PM, 13.2 ft, right at dark. Then a 14 ft drop by 1:05 AM,
  // current strongest 8:00 to 10:30 PM."
  function tideLine(p, T, win, dark, key) {
    if (!T.length) return "";
    var near = T.filter(function (x) { return x.h >= win[0] - 1 && x.h <= win[1] + 0.25; }).slice(0, 2), bits = [];
    near.forEach(function (x) {
      bits.push((x.type === "H" ? "High " : "Low ") + at(x.h) + ", " + ft(x.v) + (p.dark && x === key && Math.abs(x.h - dark) <= 1.5 ? ", right at dark" : ""));
    });
    var last = near[near.length - 1], next = last ? after(T, last.h) : after(T, win[0]);
    if (!near.length) {
      // No turn in the trip: the tide that runs through it.
      if (!next || !before(T, win[0])) return "";
      bits.push((next.type === "H" ? "Rising" : "Falling") + " to the " + at(next.h) + (next.type === "H" ? " high, " : " low, ") + ft(next.v));
    } else if (next && Math.min(next.h, win[1]) - last.h >= 1.5) {
      var d = next.v - last.v;
      bits.push("Then a " + swingFt(d) + (d < 0 ? " drop" : " rise") + " by " + at(next.h));
    }
    // The current is said with the swing it belongs to, else on its own.
    var hard = hardest(T, win), own = hard && next && Math.abs(hard.s[1] - strongest(last || before(T, win[0]) || next, next)[1]) < 0.01;
    if (hard) {
      var cw = hard.sw >= 3 ? "current strongest " + span(q(hard.s[0]), q(hard.s[1])).replace(/:00(?= )/g, "") : "little current";
      if (own && bits.length > near.length) bits[bits.length - 1] += ", " + cw;
      else bits.push(cap(cw));
    }
    return bits.join(". ") + ".";
  }
  // A dig: WDFW's own low for the beach, and when to dig it.
  function digLine(dig) {
    return "Low " + at(dig.low) + ", " + ft(dig.ft) + " (WDFW). Dig the 2 hours before it.";
  }

  // ---- the best hours, and why ---------------------------------------------
  function bestOf(p, t, T, win, dark, key) {
    var w = [win[0], win[1]], why = "";
    var line = function (re) { return (t.why || []).filter(function (x) { return re.test(x); })[0] || ""; };
    if (t.beach) {
      // WDFW: the best digging is the 2 hours before the low.
      var dig = p.digs && p.digs[t.iso];
      if (dig) { w = [Math.max(win[0], dig.low - 2), Math.min(win[1], dig.low)]; }
      why = line(/^WDFW dig/);
    } else if (key && (p.tide === "squid" || p.tide === "slack")) {
      var pv = before(T, key.h), nx = after(T, key.h);
      var a = pv ? key.h - (key.h - pv.h) / 3 : key.h - 1, b = nx ? key.h + (nx.h - key.h) / 3 : key.h + 1;
      if (p.tide === "slack") { a = Math.max(a, key.h - 1); b = Math.min(b, key.h + 1); }
      w = [Math.max(win[0], a), Math.min(win[1], b)];
      why = (key.type === "H" ? "High" : "Low") + " slack " + at(key.h) + (p.dark && Math.abs(key.h - dark) <= 1.5 ? ", right at dark" : "");
      if (w[1] - w[0] < 0.75) { w = [win[0], win[1]]; }
    } else if (p.tide === "moving" && T.length) {
      // The longest stretch of the window clear of the hour each side of a turn.
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
      why = f.call === "unknown" ? "No river reading for this day" :
        (f.call === "go" ? "Good flow, " : "High water, ") + cfs(f.cfs) + " cfs, " + (f.trend === "dropping" ? "dropping after a rise" : f.trend);
    } else {
      why = line(/^Stocked /) || "";
    }
    // A daylight trip: the light is the window's own reason when there is no other.
    if (!why && !p.dark && t.sun) {
      var sr = Math.abs(win[0] - t.sun.rise) < 0.1, ss = Math.abs(win[1] - t.sun.set) < 0.1;
      why = sr && ss ? "First light to sunset" : sr ? "From first light, " + at(t.sun.rise) : ss ? "Until sunset, " + at(t.sun.set) : "";
    }
    // An edge that is a turn or a low is said to the 5 minutes; one that is
    // worked out (full dark, a third of the way to the next turn) to the quarter.
    var dl = t.beach && p.digs && p.digs[t.iso] ? p.digs[t.iso].low : null;
    var exact = function (h) { return T.some(function (x) { return Math.abs(x.h - h) < 0.01; }) || (dl != null && (Math.abs(dl - h) < 0.01 || Math.abs(dl - 2 - h) < 0.01)); };
    var r = function (h) { return exact(h) ? Math.round(h * 12) / 12 : q(h); };
    return { from: w[0], to: w[1], say: [r(w[0]), r(w[1])], why: why, own: Math.abs(w[0] - win[0]) >= 0.4 || Math.abs(w[1] - win[1]) >= 0.4 };
  }

  // ---- what to expect ---------------------------------------------------------
  function expectLine(p, t, iso, run, win, cur) {
    var out = [], ex = (run && run.expect) || [], fact = FACTS[p.spot] || {}, crowdFact = fact.crowd && fact.crowd[p.species];
    var dow = dowOf(iso), off = (T().daysOff || []).indexOf(iso) !== -1, weekend = dow === 0 || dow === 6;
    if (off || weekend) {
      var crowd = ex.map(firstSentence).filter(function (x) { return /crowd/i.test(x) && !/not (seen|confirmed)/i.test(x); })[0];
      if (crowd && /weekend/i.test(crowd)) out.push(crowd);
      else if (crowd || crowdFact) out.push((weekend ? "Weekend: " : "Day off: ") + low((crowd || crowdFact).replace(/[.\s]*$/, "")) + ".");
    }
    if (cur && run && run.current && out.length < 2) out.push("After " + hr(q(cur[0])) + ", " + low(run.current));
    if (t && (t.why || []).some(function (w) { return /^Bright moon/.test(w); }) && out.length < 2) {
      var moon = ex.map(firstSentence).filter(function (x) { return /moon/i.test(x); })[0];
      if (moon) out.push(moon);
    }
    if (!out.length && ex.length) {
      // The run card's first word on it. A first sentence of a few words
      // ("A thin year.") takes the next one with it.
      var e0 = ex.filter(function (x) { return !/not (seen|confirmed)/i.test(firstSentence(x)); })[0];
      if (e0) {
        var one = firstSentence(e0), rest = e0.slice(one.length).trim();
        out.push(one.split(" ").length < 4 && rest ? one + " " + firstSentence(rest) : one);
      }
    }
    return out.map(function (x) { return /[.!?]\s/.test(x) ? x : sentence(x); }).join(" ");
  }

  // ---- the read ---------------------------------------------------------------
  function core(input) {
    input = input || {};
    var p = planOf(input.planId), spot = p && spotOf(p.spot);
    var out = { planId: input.planId, iso: input.iso, status: "unknown", call: "", heat: "", headline: "", reason: "", leave: "", best: null,
      lines: [], fig: null, others: [], pick: null, name: p ? shortName(p) : "", drive: spot ? spot.drive : null };
    if (!p || !spot) return out;
    var det = T().detail({ planId: p.id, iso: input.iso, from: input.from, to: input.to, wx: input.wx, tides: input.tides, flow: input.flow });
    out.status = det.status;
    var w = (input.wx || {})[spot.id], iso = input.iso;
    var sun = (w && w.sun && w.sun[iso]) || null, dark = sun ? sun.set + 0.6 : null;
    var t = det.status === "ok" ? det.trip : null;
    var win;
    if (t) win = [t.from, t.to];
    else {
      var a = input.from == null ? (p.dark && sun ? dark : sun ? sun.rise : 7) : +input.from;
      var b = input.to == null ? (p.dark ? 22 : sun ? sun.set : 17) : +input.to;
      win = b > a ? [a, b] : [a, a + 2];
    }
    out.win = win;
    var hrs = hoursIn(w, iso, win[0], win[1]);
    var turns = turnsFor(spot, input.tides, iso);
    var key = t ? keyTurn(p, turns, win, dark) : null;
    out.sum = wxSum(hrs);
    out.flow = !!(t && t.flow);
    out.facts = FACTS[spot.id] || {};
    out.dark = !!p.dark;

    if (t) {
      var best = bestOf(p, Object.assign({ iso: iso }, t), turns, win, dark, key);
      out.heat = t.heat; out.score = t.score; out.unproven = !!t.unproven;
      out.call = t.heat === "Slow" ? "slow" : "go";
      out.best = best;
      out.headline = (t.heat === "Slow" ? "Slow" : "Go") + ", " + (best.own ? "best " + span(best.say[0], best.say[1]) : span(win[0], win[1]));
      out.reason = best.why ? sentence(best.why) : "";
      out.leave = "Leave by " + T().leaveBy(t);
      out.key = key;
    } else if (det.status === "nogo") {
      out.call = "no"; out.headline = "No, " + low(String(det.why));
    } else if (det.status === "dark") {
      out.call = "no"; out.headline = "No, dark by then";
      out.reason = "Sunset " + at(det.sunset) + ". This one fishes in daylight.";
    } else if (det.status === "closed") {
      out.call = "no"; out.headline = det.why ? "No, " + low(String(det.why).replace(/[.\s]*$/, "")) : "No, out of season that day";
    } else if (det.status === "nodata") {
      out.headline = "No forecast for that day yet";
      return out;
    } else return out;

    // The lines. A closed water gets none: the weather does not matter there.
    if (det.status === "closed" || det.status === "dark") return out;
    var cur = null, dig = p.digs && p.digs[iso];
    if (t && t.beach && dig) out.lines.push({ k: "tide", label: "Tide", text: digLine(dig) });
    else if (turns.length) {
      var tl = tideLine(p, turns, win, dark, key);
      if (tl) out.lines.push({ k: "tide", label: "Tide", text: tl });
      var hard = hardest(turns, win);
      if (hard && hard.sw >= 8) cur = hard.s;
    } else if (t && t.flow && t.flow.call !== "unknown") {
      var f = t.flow;
      // The reason says the flow and its trend; this line, the numbers it is held to.
      out.lines.push({ k: "river", label: "River", text: "Fishable to " + cfs(f.good) + " cfs, blown out over " + cfs(f.high) + "." +
        (f.now && f.now.cfs != null && iso === laDay(f.now.at) ? " Now " + cfs(f.now.cfs) + "." : "") });
    }
    var nowWet = 0;
    if (input.nowHour != null) {
      var nh = hoursIn(w, iso, Math.floor(input.nowHour), Math.floor(input.nowHour) + 1)[0];
      if (nh && nh.rain >= 0.01 && input.nowHour < win[1]) nowWet = nh.rain;
    }
    var rl = rainLine(hrs, win[0], win[1], nowWet);
    if (rl) out.lines.push({ k: "rain", label: "Rain", text: rl });
    var wl = windLine(hrs);
    if (wl) out.lines.push({ k: "wind", label: "Wind", text: wl });
    if (t) {
      var ex = expectLine(p, t, iso, (T().runs || {})[p.id], win, cur);
      if (ex) out.lines.push({ k: "expect", label: "Expect", text: ex });
    }
    out.fig = { a: win[0], b: win[1], best: out.best && out.best.own ? [out.best.from, out.best.to] : null,
      tide: turns.length ? turns.filter(function (x) { return x.h > win[0] - 14 && x.h < win[1] + 14; }) : null,
      key: key ? { h: key.h, v: key.v, type: key.type } : null,
      rain: hrs.map(function (x) { return { h: x.h, pop: x.pop, rain: x.rain }; }) };
    return out;
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
  function sameTide(a, b) {
    if (!a.key || !b.key) return false;
    return a.key.type === b.key.type && Math.abs(a.key.h - b.key.h) <= 0.34 && Math.abs(a.key.v - b.key.v) <= 1.2;
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
  function wetTrip(r) { return r.sum && (r.sum.wet || (r.sum.pop != null && r.sum.pop >= 30)); }
  // What o has that s does not, from the cards and the plans.
  function factDiff(s, o, op) {
    var out = [];
    if (o.facts.cover && !s.facts.cover) out.push(o.facts.cover);
    if (o.dark) {
      if (o.facts.lamps === "own" && s.facts.lamps !== "own") out.push("bring your own light");
      var unk = ((op.site && op.site.unknown) || []).filter(function (x) { return /hours at night/i.test(x); })[0];
      if (unk) out.push(low(unk) + " not confirmed");
    }
    return out;
  }
  // short: an earlier spot in the line already said "same tide and weather".
  function compare(s, o, op, short) {
    var bits = [];
    if (o.status !== "ok") return "";
    if (s.status !== "ok") bits.push(o.call === "slow" ? "a slow go" : "a go");
    else {
      var st = sameTide(s, o), sw = sameWx(s, o);
      if (st && sw) bits.push(short ? "same" : "same tide and weather");
      else if (st) bits.push("same tide", wxDiff(s, o));
      else if (sw) bits.push("same weather", o.key ? (o.key.type === "H" ? "high " : "low ") + at(o.key.h) : "");
      else bits.push(wxDiff(s, o));
      // Rivers: the other one's flow and trend, from its reason.
      if (o.flow && !st) bits.push(low(o.reason.replace(/[.\s]*$/, "")));
      if (o.heat && s.heat && o.heat !== s.heat) bits.push(o.heat === "Hot" ? "hot" : low(o.heat) + ", not " + low(s.heat));
      // Stocked lakes: when the other one was planted.
      if (/^Stocked /.test(o.reason) && o.reason.split(":")[0] !== s.reason.split(":")[0]) bits.push(low(o.reason.split(":")[0]));
    }
    var d = (o.drive || 0) - (s.drive || 0);
    if (Math.abs(d) >= 5) bits.push(d < 0 ? -d + " min closer" : d + " min farther");
    bits = bits.concat(factDiff(s, o, op));
    bits = bits.filter(Boolean);
    return bits.length ? o.name + ": " + bits.join(", ") + "." : "";
  }
  // Of this spot and the others: the one to go to, and why.
  function pickOf(self, list) {
    var all = [self].concat(list).filter(function (r) { return r.status === "ok"; });
    if (all.length < 2) return null;
    var rank = { Hot: 2, Good: 1, Slow: 0 }, topHeat = Math.max.apply(null, all.map(function (r) { return rank[r.heat] || 0; }));
    var top = all.filter(function (r) { return (rank[r.heat] || 0) === topHeat; });
    // Rain in the forecast and only some spots have a roof: the roof.
    var covered = top.filter(function (r) { return r.facts.cover; });
    if (covered.length && covered.length < top.length && top.some(wetTrip)) return { r: covered[0], why: "for " + covered[0].facts.cover.replace(/^a /, "the ") };
    top.sort(function (a, b) { return (b.score || 0) - (a.score || 0) || (a.unproven ? 1 : 0) - (b.unproven ? 1 : 0) || (a.drive || 0) - (b.drive || 0); });
    var w = top[0], r2 = top[1];
    if (!r2 || (w.score || 0) > (r2.score || 0)) return { r: w, why: w.reason ? "for the " + low(w.reason.replace(/[.\s]*$/, "")).replace(/^high slack [^,]+, /, "high slack ").replace(/^low slack [^,]+, /, "low slack ") : "the better day" };
    if ((r2.drive || 0) - (w.drive || 0) >= 5) return { r: w, why: ((r2.drive || 0) - (w.drive || 0)) + " min closer" };
    return null;
  }

  function read(input) {
    var self = core(input), p = planOf(input && input.planId);
    if (!p || !self.call) return strip(self);
    var others = othersFor(input, p).map(function (o) {
      var r = core({ planId: o.id, iso: input.iso, from: input.from, to: input.to, wx: input.wx, tides: input.tides, flow: input.flow });
      r.plan = o;
      return r;
    }).filter(function (r) { return r.status === "ok"; });
    var rank = { Hot: 2, Good: 1, Slow: 0 };
    others.sort(function (a, b) { return (rank[b.heat] || 0) - (rank[a.heat] || 0) || (b.score || 0) - (a.score || 0) || (a.drive || 0) - (b.drive || 0); });
    // The pick is made from every spot, so each spot's read picks the same
    // one. Two others are named at most, and the pick is always one of them.
    var pk = self.status === "ok" ? pickOf(self, others) : null;
    var shown = pk && pk.r !== self ? [pk.r].concat(others.filter(function (o) { return o !== pk.r; })).slice(0, 2) : others.slice(0, 2);
    var same = false;
    var said = shown.map(function (o) {
      var text = compare(self, o, o.plan, same);
      if (/: same tide and weather/.test(text)) same = true;
      return { planId: o.planId, name: o.name, text: text };
    }).filter(function (o) { return o.text; });
    self.others = said;
    if (pk) self.pick = { planId: pk.r.planId, name: pk.r.name, why: pk.why };
    if (said.length) {
      var text = said.map(function (o) { return o.text; }).join(" ") + (pk ? " Pick: " + pk.r.name + ", " + pk.why + "." : "");
      self.lines.push({ k: "or", label: "Or", text: text });
    }
    return strip(self);
  }
  // What a caller sees: the words and the picture, not the working.
  function strip(r) {
    return { planId: r.planId, iso: r.iso, status: r.status, call: r.call, heat: r.heat, headline: r.headline, reason: r.reason, leave: r.leave,
      best: r.best ? { from: r.best.from, to: r.best.to, why: r.best.why, own: r.best.own } : null, name: r.name, drive: r.drive,
      lines: r.lines, fig: r.fig, others: r.others, pick: r.pick };
  }

  RIG.trips.read = read;
  RIG.trips.readFacts = FACTS;
})(typeof window !== "undefined" ? window : globalThis);
