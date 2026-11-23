// Hot Trips: the week ahead, built from real forecasts.
//
// Two halves, kept apart on purpose so all of this can move into CastAI:
//   1. DATA (RIG.trips.spots, RIG.trips.plans): plain JSON, stable ids that
//      match the Rig Card spot and species ids.
//   2. PLANNER (RIG.trips.plan): a pure function. Forecast in, days out. No
//      DOM, no fetch, no clock it did not get handed. Tests feed it fixtures.
//
// Sources are the same free ones CastAI uses: Open-Meteo (weather + marine),
// NOAA CO-OPS (tide predictions). Moon phase is computed, not fetched.
//
// Honesty rules, from Coach (2026-11-23):
//   - only good trips are listed. A slow week shows one or two, or none.
//   - a plan whose rules are not confirmed is NOT listed. It is named in the
//     "not listed" note instead, so nothing is silently missing.
//   - weather can cancel a whole day, and the day says so.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});

  // Coordinates are for the weather grid only (about 1 to 2 km), not for
  // navigation. Drive minutes are from Bonney Lake.
  var spots = [
    { id: "redondo", lat: 47.349, lon: -122.324, drive: 35, tide: "9446248" },
    { id: "green-river", lat: 47.300, lon: -122.210, drive: 25 },
    { id: "dash-point", lat: 47.320, lon: -122.415, drive: 40, tide: "9446705" },
    { id: "lake-fenwick", lat: 47.360, lon: -122.265, drive: 30 },
    { id: "american-lake", lat: 47.130, lon: -122.560, drive: 45 },
    { id: "lake-tapps", lat: 47.230, lon: -122.180, drive: 10 },
    { id: "westport", lat: 46.905, lon: -124.105, drive: 140, tide: "9441102", marine: true },
    { id: "ocean-shores", lat: 47.110, lon: -124.180, drive: 150, tide: "9441102", marine: true }
  ];

  // One plan = one fish, one spot, one way of fishing it.
  //   peak / ok:   months (1 to 12). Outside both, the plan is not in season.
  //   odd:         odd years only (pinks).
  //   closed:      [from, to] date ranges, inclusive, "MM-DD".
  //   dates:       if set, ONLY these days (razor clam digs).
  //   rules:       "confirmed" or a short reason it is not.
  //   how:         kayak | shore | surf. Sets the wind limits.
  //   tide:        squid | moving | flood | slack | null.
  //   dark:        true when the fishing happens after dark.
  //   gear:        a note when Coach does not own the gear yet.
  var plans = [
    { id: "squid-redondo", species: "squid", spot: "redondo", name: "Squid at Redondo",
      peak: [11, 12, 1], ok: [10, 2], how: "shore", tide: "squid", dark: true, rules: "confirmed",
      gear: "Squid rod is on the Black Friday list" },
    { id: "clams-ocean-shores", species: "clams", spot: "ocean-shores", name: "Razor clams, Copalis and Mocrocks",
      // Official WDFW dig days, with WDFW's own low tide times and beach.
      digs: {
        "2026-11-24": { low: 18.03, ft: -1.7, beach: "Mocrocks" },
        "2026-11-25": { low: 18.8, ft: -1.9, beach: "Copalis" },
        "2026-11-26": { low: 19.58, ft: -1.8, beach: "Copalis" },
        "2026-11-27": { low: 20.42, ft: -1.4, beach: "Mocrocks" },
        "2026-11-28": { low: 21.3, ft: -0.8, beach: "Mocrocks" }
      },
      how: "surf", wave: 11, tide: "low", dark: true, rules: "confirmed", gear: "Needs a clam gun or shovel" },
    { id: "crab-westport", species: "crab", spot: "westport", name: "Crab off the Westport docks",
      ok: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], how: "shore", tide: "slack", rules: "confirmed",
      gear: "Needs a ring net or snare" },
    { id: "surfperch-ocean-shores", species: "surfperch", spot: "ocean-shores", name: "Surf perch, Ocean Shores",
      peak: [4, 5, 6], ok: [3, 7, 8, 9, 10], how: "surf", tide: "flood", rules: "Daily limit not confirmed" },
    { id: "surfperch-westport", species: "surfperch", spot: "westport", name: "Surf perch, Westport",
      peak: [4, 5, 6], ok: [3, 7, 8, 9, 10], how: "surf", tide: "flood", rules: "Daily limit not confirmed" },
    { id: "cutthroat-dash-point", species: "cutthroat", spot: "dash-point", name: "Sea-run cutthroat, Dash Point beach",
      // WDFW: South Sound beaches fish well all winter. Mack's: best on the
      // incoming, the hour or two before high. The state park is 8 AM to dusk.
      peak: [10, 11, 12, 1, 2, 3, 4], ok: [5, 6, 9], how: "shore", tide: "flood", opens: 8, rules: "confirmed" },
    { id: "coho-dash-point", species: "coho", spot: "dash-point", name: "Coho from the kayak, Dash Point",
      peak: [8, 9], ok: [10], closed: [["11-16", "03-30"]], how: "kayak", tide: "moving", rules: "confirmed" },
    { id: "king-dash-point", species: "king", spot: "dash-point", name: "Kings mooching, Dash Point",
      peak: [7, 8], ok: [9], closed: [["11-16", "03-30"]], how: "kayak", tide: "moving", rules: "confirmed" },
    { id: "pink-dash-point", species: "pink", spot: "dash-point", name: "Pinks, Dash Point",
      peak: [8], ok: [7, 9], odd: true, closed: [["11-16", "03-30"]], how: "kayak", tide: "moving",
      rules: "2027 seasons not set yet" },
    { id: "coho-green-river", species: "coho", spot: "green-river", name: "Coho on the Green",
      peak: [10], ok: [9, 11], how: "shore", rules: "Green River season dates not confirmed" },
    { id: "chum-green-river", species: "chum", spot: "green-river", name: "Chum on the Green",
      peak: [11], ok: [12], how: "shore", rules: "Green River season dates not confirmed" },
    { id: "steelhead-green-river", species: "steelhead", spot: "green-river", name: "Winter steelhead on the Green",
      peak: [1, 2], ok: [12, 3], how: "shore", rules: "WDFW sets steelhead seasons in December" },
    { id: "pink-green-river", species: "pink", spot: "green-river", name: "Pinks on the Green",
      peak: [9], ok: [8, 10], odd: true, how: "shore", rules: "2027 seasons not set yet" },
    { id: "trout-fenwick", species: "perch", spot: "lake-fenwick", name: "Perch and trout, Lake Fenwick",
      peak: [4, 5, 6, 10], ok: [3, 7, 8, 9, 11], how: "shore", rules: "confirmed" },
    { id: "bass-fenwick", species: "bass", spot: "lake-fenwick", name: "Bass, Lake Fenwick",
      peak: [5, 6, 7, 8, 9], ok: [4, 10], how: "shore", rules: "confirmed" },
    { id: "trout-tapps", species: "perch", spot: "lake-tapps", name: "Trout from the kayak, Lake Tapps",
      peak: [4, 5, 10], ok: [3, 6, 9, 11], how: "kayak", rules: "confirmed",
      access: "Allan Yorke ramp closed since Jul 27, no reopen date" },
    { id: "trout-american", species: "perch", spot: "american-lake", name: "Trout from the kayak, American Lake",
      peak: [4, 5, 10], ok: [3, 6, 9, 11], how: "kayak", rules: "confirmed" }
  ];

  // Wind in mph, rain in inches per hour, waves in feet.
  var LIMITS = {
    kayak: { wind: 10, gust: 18, rain: 0.15 },
    shore: { wind: 20, gust: 30, rain: 0.3 },
    surf: { wind: 20, gust: 30, rain: 0.3, wave: 8 }
  };

  // Trip slots by weekday (0 Sunday). Times are local hours.
  //   maxDrive keeps a weeknight from turning into a road trip; minDrive keeps
  //   an adventure day an adventure.
  // Days off that plan like a weekend.
  var DAYS_OFF = ["2026-11-26", "2026-11-27", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"];
  function slotsFor(dow, iso) {
    if (iso && DAYS_OFF.indexOf(iso) !== -1) dow = 6;
    if (dow >= 1 && dow <= 4) return [{ id: "afterwork", label: "After work", from: 16.5, to: 20.5, maxDrive: 45 }];
    if (dow === 5) return [{ id: "evening", label: "Friday evening", from: 16.5, to: 22, maxDrive: 45 }];
    return [
      { id: "quick", label: "Quick trip", from: 7, to: 11, maxDrive: 45 },
      { id: "long", label: "Long day", from: 7, to: 15, maxDrive: 75 },
      { id: "adventure", label: "Adventure day", from: 5, to: 22, minDrive: 90 },
      { id: "night", label: "Evening", from: 16.5, to: 22, maxDrive: 45 }
    ];
  }

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Moon: fraction lit, 0 new to 1 full. Mean synodic month from a known new
  // moon (2000-01-06 18:14 UTC). Good to well under a day, which is plenty
  // for "thin or fat".
  function moonLit(ms) {
    var P = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
    var age = (((ms - ref) / 864e5) % P + P) % P;
    return (1 - Math.cos(2 * Math.PI * age / P)) / 2;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function mmdd(d) { return pad(d.m) + "-" + pad(d.d); }
  function inRange(md, r) { return r[0] <= r[1] ? md >= r[0] && md <= r[1] : md >= r[0] || md <= r[1]; }
  function clock(h) {
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh++; mm = 0; }
    var ap = hh >= 12 && hh < 24 ? "PM" : "AM", h12 = hh % 12 || 12;
    return h12 + ":" + pad(mm) + " " + ap;
  }

  // Is this plan in season on this day? Returns "peak", "ok" or null.
  function season(p, day) {
    if (p.digs) return p.digs[day.iso] ? "peak" : null;
    if (p.odd && day.y % 2 === 0) return null;
    var md = mmdd(day);
    if ((p.closed || []).some(function (r) { return inRange(md, r); })) return null;
    if ((p.peak || []).indexOf(day.m) !== -1) return "peak";
    if ((p.ok || []).indexOf(day.m) !== -1) return "ok";
    return null;
  }

  // ---- the planner ---------------------------------------------------------
  // input:
  //   today: "YYYY-MM-DD" (local)
  //   wx:    { [spotId]: { hours: [{t:"YYYY-MM-DDTHH:MM", wind, gust, rain, temp, wave?}],
  //                         sun: { [iso]: {rise: hour, set: hour} } } }
  //   tides: { [stationId]: [{t:"YYYY-MM-DD HH:MM", v: feet, type: "H"|"L"}] }
  // output: { days: [{iso, label, trips: [...], note?}], notListed: [{name, why}] }
  function plan(input) {
    var wx = input.wx || {}, tides = input.tides || {};
    var start = parseDay(input.today);
    var days = [];
    var nDays = input.days || 7;
    var notListed = {};
    for (var i = 0; i < nDays; i++) {
      var day = addDays(start, i);
      if (!hasWx(wx, day.iso)) break;
      var out = { iso: day.iso, label: (i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAYS[day.dow]) + " " + MONTHS[day.m - 1] + " " + day.d, trips: [] };
      var blocked = [], tried = 0;
      slotsFor(day.dow, day.iso).forEach(function (slot) {
        plans.forEach(function (p) {
          var spot = spotById(p.spot);
          if (!spot) return;
          if (slot.maxDrive && spot.drive > slot.maxDrive) return;
          if (slot.minDrive && spot.drive < slot.minDrive) return;
          var s = season(p, day);
          if (!s) return;
          if (p.rules !== "confirmed") { notListed[p.id] = { name: p.name, why: p.rules }; return; }
          if (p.access) { notListed[p.id] = { name: p.name, why: p.access }; return; }
          var t = scoreTrip(p, spot, slot, day, s, wx[spot.id], tides[spot.tide]);
          if (t.score === 0 && !t.blocked) return;
          tried++;
          if (t.blocked) { t.blocked.name = p.name; blocked.push(t.blocked); return; }
          if (t.score >= 6) out.trips.push(t);
        });
      });
      // One spot, one slot per day: the best version of each trip wins, so a
      // quick trip and a long day to the same water do not both show.
      var best = {};
      out.trips.forEach(function (t) { if (!best[t.planId] || t.score > best[t.planId].score) best[t.planId] = t; });
      out.trips = Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (a, b) { return b.score - a.score || a.from - b.from; }).slice(0, 4);
      // "No fishing" only when the weather called off everything in season.
      // A blown-out coast on a day the lakes are just slow is "Nothing good".
      if (!out.trips.length && blocked.length) {
        var w = worst(blocked);
        out.note = blocked.length === tried ? "No fishing: " + w.why : "Nothing good. " + w.name + " is off: " + w.why;
      }
      days.push(out);
    }
    return { days: days, notListed: Object.keys(notListed).map(function (k) { return notListed[k]; }) };
  }

  function scoreTrip(p, spot, slot, day, s, w, tideList) {
    var sun = (w && w.sun && w.sun[day.iso]) || { rise: 7.5, set: 16.5 };
    var from = slot.from, to = slot.to;
    // Daylight fishing ends at sunset. Dark fishing starts at full dark.
    if (p.dark) from = Math.max(from, sun.set + 0.6);
    else { from = Math.max(from, sun.rise, p.opens || 0); to = Math.min(to, sun.set); }
    var dig = p.digs && p.digs[day.iso];
    if (dig) {
      // WDFW: the best digging is 1 to 2 hours before the low.
      from = Math.max(slot.from, dig.low - 2); to = Math.min(slot.to, dig.low + 0.5);
    }
    // An incoming-tide fish gets the incoming tide, or no trip. The window
    // shrinks to the stretch of flood that fits inside the slot and daylight.
    if (p.tide === "flood") {
      var fl = (tideList || []).filter(function (x) { return x.t.slice(0, 10) === day.iso; }), best = null;
      for (var q = 1; q < fl.length; q++) {
        if (fl[q].type !== "H") continue;
        var a0 = Math.max(from, hourOf(fl[q - 1].t)), b0 = Math.min(to, hourOf(fl[q].t) + 0.5);
        if (b0 - a0 > (best ? best[1] - best[0] : 0)) best = [a0, b0];
      }
      if (!best || best[1] - best[0] < 1.5) return { score: 0 };
      from = best[0]; to = best[1];
    }
    if (to - from < 1.5) return { score: 0 };

    var hrs = ((w && w.hours) || []).filter(function (h) {
      if (h.t.slice(0, 10) !== day.iso) return false;
      var x = hourOf(h.t);
      return x >= Math.floor(from) && x < to;
    });
    if (!hrs.length) return { score: 0 };
    var L = LIMITS[p.how];
    var wind = max(hrs, "wind"), gust = max(hrs, "gust"), rain = max(hrs, "rain"), wave = max(hrs, "wave");
    var temp = Math.min.apply(null, hrs.map(function (h) { return h.temp; }));
    if (wind > L.wind || gust > L.gust) return { blocked: { why: "gusts to " + Math.round(gust) + " mph", v: gust } };
    if (rain > L.rain) return { blocked: { why: "heavy rain", v: 30 + rain } };
    var waveMax = p.wave || L.wave;
    if (waveMax && wave > waveMax) return { blocked: { why: Math.round(wave) + " ft surf", v: 40 + wave } };

    var why = [], score = s === "peak" ? 4 : 2;
    why.push(s === "peak" ? "Peak season" : "In season");

    var dayT = (tideList || []).filter(function (x) { return x.t.slice(0, 10) === day.iso; });
    var inWin = dayT.filter(function (x) { var h = hourOf(x.t); return h >= from - 0.5 && h <= to + 0.5; });
    if (p.tide === "squid") {
      var dark = sun.set + 0.6;
      var hi = inWin.filter(function (x) { return x.type === "H"; })[0];
      if (hi && Math.abs(hourOf(hi.t) - dark) <= 1.5) { score += 3; why.push("High slack " + clock(hourOf(hi.t)) + ", right at dark"); }
      else if (hi) { score += 1; why.push("High slack " + clock(hourOf(hi.t))); }
      var lit = moonLit(Date.UTC(day.y, day.m - 1, day.d, 8 + Math.round(dark)));
      if (lit < 0.3) { score += 2; why.push("Dark moon"); }
      else if (lit < 0.6) { score += 1; why.push("Half moon"); }
      else why.push("Bright moon works against you");
    } else if (dig) {
      score += 4; why.push("WDFW dig at " + dig.beach + ", low " + clock(dig.low) + ", " + dig.ft.toFixed(1) + " ft");
    } else if (p.tide === "slack") {
      var sl = inWin[0];
      if (sl) { score += 2; why.push((sl.type === "H" ? "High" : "Low") + " slack " + clock(hourOf(sl.t))); }
    } else if (p.tide === "moving" || p.tide === "flood") {
      // The tide that is actually running during the trip: the stretch
      // between two turns that overlaps the window most.
      var swing = 0, flood = false, most = 0;
      for (var k = 1; k < dayT.length; k++) {
        var a = hourOf(dayT[k - 1].t), b = hourOf(dayT[k].t);
        var over = Math.min(b, to) - Math.max(a, from);
        if (over > most) { most = over; swing = Math.abs(dayT[k].v - dayT[k - 1].v); flood = dayT[k].type === "H"; }
      }
      if (p.tide === "flood" ? flood : swing >= 4) { score += 2; why.push(p.tide === "flood" ? "Incoming tide" : "Moving water, " + swing.toFixed(1) + " ft swing"); }
    } else {
      score += 1;
    }
    if (wind <= L.wind / 2) { score += 1; why.push("Light wind, " + Math.round(wind) + " mph"); }
    else why.push("Wind to " + Math.round(wind) + " mph");
    if (rain < 0.02) { score += 1; why.push("Dry"); }
    if (temp < 30) { score -= 1; why.push("Cold, " + Math.round(temp) + "°F"); }

    return {
      planId: p.id, species: p.species, spot: p.spot, how: p.how, name: p.name,
      slot: slot.id === "long" && to - from <= 4 ? "Quick trip" : slot.label,
      from: from, to: to, when: clock(from) + " to " + clock(to),
      drive: spot.drive, score: score, heat: score >= 8 ? "Hot" : "Good", why: why, gear: p.gear || "",
      wx: { wind: Math.round(wind), gust: Math.round(gust), temp: Math.round(temp) },
      hours: hrs.map(function (h) { return { h: hourOf(h.t), wind: Math.round(h.wind), gust: Math.round(h.gust), temp: Math.round(h.temp), rain: h.rain, wave: h.wave }; }),
      tides: dayT.map(function (x) { return { h: hourOf(x.t), v: x.v, type: x.type }; }),
      sun: sun, dark: sun.set + 0.6, beach: dig ? dig.beach : "",
      moon: Math.round(moonLit(Date.UTC(day.y, day.m - 1, day.d, 8 + Math.round(sun.set + 0.6))) * 100)
    };
  }

  function worst(list) { return list.slice().sort(function (a, b) { return b.v - a.v; })[0]; }
  function max(hrs, k) { return Math.max.apply(null, hrs.map(function (h) { return h[k] || 0; })); }
  function hourOf(t) { var m = /[T ](\d\d):(\d\d)/.exec(t); return m ? +m[1] + m[2] / 60 : 0; }
  function spotById(id) { for (var i = 0; i < spots.length; i++) if (spots[i].id === id) return spots[i]; return null; }
  function parseDay(iso) { var a = iso.split("-").map(Number); return mk(a[0], a[1], a[2]); }
  function mk(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay(),
      iso: dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate()) };
  }
  function addDays(day, n) { return mk(day.y, day.m, day.d + n); }
  function hasWx(wx, iso) {
    return Object.keys(wx).some(function (k) { return (wx[k].hours || []).some(function (h) { return h.t.slice(0, 10) === iso; }); });
  }

  // ---- loading the forecast (browser only) --------------------------------
  // One Open-Meteo call covers every spot, one marine call the ocean beaches,
  // one NOAA call per tide station. Cached so the pier with no signal still
  // shows the last plan, with its age.
  var CACHE_KEY = "rig.wx.v1";
  function urls(today, end) {
    var la = spots.map(function (s) { return s.lat; }).join(","), lo = spots.map(function (s) { return s.lon; }).join(",");
    var ms = spots.filter(function (s) { return s.marine; });
    var stations = spots.map(function (s) { return s.tide; }).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    var b = today.replace(/-/g, ""), e = end.replace(/-/g, "");
    return {
      wx: "https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo +
        "&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m&daily=sunrise,sunset" +
        "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=7",
      marine: "https://marine-api.open-meteo.com/v1/marine?latitude=" + ms.map(function (s) { return s.lat; }).join(",") +
        "&longitude=" + ms.map(function (s) { return s.lon; }).join(",") +
        "&hourly=wave_height&length_unit=imperial&timezone=America%2FLos_Angeles&forecast_days=7",
      marineSpots: ms.map(function (s) { return s.id; }),
      tides: stations.map(function (id) {
        return { id: id, url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=rigcard" +
          "&station=" + id + "&begin_date=" + b + "&end_date=" + e + "&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json" };
      })
    };
  }
  function toHour(iso) { var m = /T(\d\d):(\d\d)/.exec(iso); return +m[1] + m[2] / 60; }
  function shape(wxJson, marineJson, marineSpots, tideJson) {
    var wx = {};
    var list = Array.isArray(wxJson) ? wxJson : [wxJson];
    spots.forEach(function (s, i) {
      var r = list[i]; if (!r || !r.hourly) return;
      var H = r.hourly, sun = {};
      (r.daily.time || []).forEach(function (d, j) { sun[d] = { rise: toHour(r.daily.sunrise[j]), set: toHour(r.daily.sunset[j]) }; });
      wx[s.id] = { sun: sun, hours: H.time.map(function (t, j) {
        return { t: t, temp: H.temperature_2m[j], rain: H.precipitation[j], wind: H.wind_speed_10m[j], gust: H.wind_gusts_10m[j] };
      }) };
    });
    var ml = marineJson ? (Array.isArray(marineJson) ? marineJson : [marineJson]) : [];
    marineSpots.forEach(function (id, i) {
      var r = ml[i]; if (!r || !r.hourly || !wx[id]) return;
      var by = {}; r.hourly.time.forEach(function (t, j) { by[t] = r.hourly.wave_height[j]; });
      wx[id].hours.forEach(function (h) { if (by[h.t] != null) h.wave = by[h.t]; });
    });
    var tides = {};
    Object.keys(tideJson).forEach(function (id) {
      tides[id] = ((tideJson[id] || {}).predictions || []).map(function (x) { return { t: x.t, v: +x.v, type: x.type }; });
    });
    return { wx: wx, tides: tides };
  }
  function localIso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function cached() {
    try { return JSON.parse(root.localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
  }
  function load(force) {
    var c = cached();
    var now = new Date();
    if (!force && c && Date.now() - c.at < 3 * 3600e3 && c.today === localIso(now)) return Promise.resolve(c);
    var today = localIso(now), end = localIso(new Date(now.getTime() + 7 * 864e5));
    var u = urls(today, end);
    function j(url) { return root.fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
    return Promise.all([j(u.wx), j(u.marine).catch(function () { return null; })].concat(u.tides.map(function (t) {
      return j(t.url).catch(function () { return null; });
    }))).then(function (res) {
      var tj = {}; u.tides.forEach(function (t, i) { tj[t.id] = res[2 + i]; });
      var data = shape(res[0], res[1], u.marineSpots, tj);
      var out = { at: Date.now(), today: today, wx: data.wx, tides: data.tides };
      try { root.localStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch (e) { /* full storage: still show it */ }
      return out;
    }).catch(function (e) {
      if (c) { c.stale = true; return c; }
      throw e;
    });
  }

  RIG.trips = { spots: spots, plans: plans, limits: LIMITS, slotsFor: slotsFor, season: season,
    moonLit: moonLit, plan: plan, shape: shape, urls: urls, load: load, cached: cached, clock: clock };
})(typeof window !== "undefined" ? window : globalThis);
