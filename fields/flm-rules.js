/* Field Command shared practice-rule engine.
   Single source of truth: flm_settings.practice_rules (JSON string).
   Structure:
     {
       "max_weekdays": 1,        base pattern: max distinct weekday practices (mon-fri)
       "max_weekend": 1,         base pattern: max Saturday slots
       "expected_total": 2,      how many slots a team is entitled to overall
       "alternatives": [         alternate patterns that also count as compliant
         { "weekdays": ["mon","fri"], "max_weekend": 0, "label": "Monday plus Friday" }
       ]
     }
   A team is OVER (red) only if its claimed days fit NO pattern.
   Used by fields/index.html and fields/admin.html, unit-tested in tests/fields.smoke.mjs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FLM_RULES = api;
})(typeof self !== "undefined" ? self : this, function () {
  var DEFAULT_RULES = {
    max_weekdays: 1,
    max_weekend: 1,
    expected_total: 2,
    alternatives: [{ weekdays: ["mon", "fri"], max_weekend: 0, label: "Monday plus Friday" }]
  };
  var WEEKDAY_LABELS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };

  function parse(raw) {
    if (!raw) return DEFAULT_RULES;
    try {
      var r = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typeof r.max_weekdays !== "number" || typeof r.max_weekend !== "number") return DEFAULT_RULES;
      return {
        max_weekdays: r.max_weekdays,
        max_weekend: r.max_weekend,
        expected_total: typeof r.expected_total === "number" ? r.expected_total : (r.max_weekdays + r.max_weekend),
        alternatives: Array.isArray(r.alternatives)
          ? r.alternatives.filter(function (a) { return a && Array.isArray(a.weekdays); })
          : []
      };
    } catch (e) {
      return DEFAULT_RULES;
    }
  }

  function plur(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function describe(rules) {
    var parts = [];
    if (rules.max_weekdays > 0 && rules.max_weekend > 0) {
      parts.push(plur(rules.max_weekdays, "weekday practice", "weekday practices") + " plus " + plur(rules.max_weekend, "Saturday practice", "Saturday practices"));
    } else if (rules.max_weekdays > 0) {
      parts.push(plur(rules.max_weekdays, "weekday practice", "weekday practices"));
    } else if (rules.max_weekend > 0) {
      parts.push(plur(rules.max_weekend, "Saturday practice", "Saturday practices"));
    }
    (rules.alternatives || []).forEach(function (a) {
      var label = a.label || (a.weekdays || []).map(function (d) { return WEEKDAY_LABELS[d] || d; }).join(" plus ");
      if (a.max_weekend > 0) label += " plus " + plur(a.max_weekend, "Saturday practice", "Saturday practices");
      parts.push(label);
    });
    return "Each team gets " + parts.join(", or ") + ".";
  }

  /* slots: array of { day_key } for ONE team in ONE season window. */
  function evaluate(rules, slots) {
    var wkSet = {}, sat = 0;
    (slots || []).forEach(function (s) {
      if (String(s.day_key).indexOf("sat") === 0) sat++;
      else wkSet[s.day_key] = 1;
    });
    var wk = Object.keys(wkSet);
    var total = (slots || []).length;

    var patterns = [{ allowed: null, maxWk: rules.max_weekdays, maxSat: rules.max_weekend }];
    (rules.alternatives || []).forEach(function (a) {
      patterns.push({
        allowed: a.weekdays || [],
        maxWk: (a.weekdays || []).length,
        maxSat: typeof a.max_weekend === "number" ? a.max_weekend : 0
      });
    });

    var fitting = patterns.filter(function (p) {
      if (wk.length > p.maxWk || sat > p.maxSat) return false;
      if (p.allowed) {
        for (var i = 0; i < wk.length; i++) {
          if (p.allowed.indexOf(wk[i]) < 0) return false;
        }
      }
      return true;
    });

    if (fitting.length === 0) {
      return {
        status: "over", weekdays: wk, satCount: sat, total: total,
        availWeekday: false, availWeekend: false, availLabels: [],
        message: "Over the guideline: " + plur(wk.length, "weekday", "weekdays") + " and " + plur(sat, "Saturday slot", "Saturday slots") + " claimed. " + describe(rules)
      };
    }

    var availWeekday = fitting.some(function (p) { return wk.length < p.maxWk; });
    var availWeekend = fitting.some(function (p) { return sat < p.maxSat; });
    var labels = [];
    if (availWeekday) labels.push("Weekday practice available");
    if (availWeekend) labels.push("Saturday slot available");
    var status = total === 0 ? "none" : (total < rules.expected_total ? "under" : "ok");
    return {
      status: status, weekdays: wk, satCount: sat, total: total,
      availWeekday: availWeekday, availWeekend: availWeekend, availLabels: labels,
      message: ""
    };
  }

  /* ---------- Phase 1: game conflict engine (shared by portal + admin) ---------- */
  var SAT_WINDOWS = { sat_9_11: [540, 660], sat_11_1: [660, 780], sat_1_3: [780, 900], sat_3_5: [900, 1020] };
  var WD_KEYS = ["", "mon", "tue", "wed", "thu", "fri", ""]; /* index = getDay(), 0=Sun 6=Sat */

  function toMinutes(t) {
    var p = String(t || "").split(":");
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }
  function timesOverlap(aStart, aEnd, bStart, bEnd) {
    return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
  }
  function fmtTime(t) {
    var m = toMinutes(t), h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + (mm ? ":" + (mm < 10 ? "0" : "") + mm : "") + " " + ap;
  }
  function dateDow(dateStr) {
    var p = String(dateStr || "").split("-");
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1).getDay();
  }
  /* Which practice-grid day keys does this game touch?
     Weekday game: that weekday key. Saturday game: every Saturday window its time overlaps. */
  function gameDayKeys(game) {
    var dow = dateDow(game.game_date);
    if (dow === 0) return [];
    if (dow !== 6) return [WD_KEYS[dow]];
    var keys = [];
    for (var k in SAT_WINDOWS) {
      var w = SAT_WINDOWS[k];
      if (toMinutes(game.start_time) < w[1] && w[0] < toMinutes(game.end_time)) keys.push(k);
    }
    return keys;
  }
  /* game: { id?, season_id, division, home_team_id, away_team_id, ext_team_id,
     field_id, venue_text, game_date, start_time, end_time }
     ctx:  { games, slots, teams, fields, ext_teams } from gateway state.
     The opponent is away_team_id (our league) OR ext_team_id (another league,
     interlock). The venue is field_id (our field) OR venue_text (their venue).
     Away interlock games (venue_text set) skip every our-field check but STILL
     get the team double-header check, so a traveling team is never booked twice.
     Returns array of { type, message } warnings. Cancelled games never conflict. */
  function gameConflicts(game, ctx) {
    ctx = ctx || {};
    var out = [];
    function team(id) { var t = (ctx.teams || []).filter(function (x) { return x.id === id; })[0]; return t ? t.name : "a team"; }
    function extName(id) { var x = (ctx.ext_teams || []).filter(function (e) { return e.id === id; })[0]; return x ? x.team_name + " (" + x.league_name + ")" : "an interlock team"; }
    function oppName(g) { return g.ext_team_id ? extName(g.ext_team_id) : team(g.away_team_id); }
    function field(id) { var f = (ctx.fields || []).filter(function (x) { return x.id === id; })[0]; return f || {}; }
    var fld = field(game.field_id);
    var fName = fld.name || "this field";
    var span = fmtTime(game.start_time) + " to " + fmtTime(game.end_time);

    (ctx.games || []).forEach(function (g) {
      if (g.id === game.id || g.game_date !== game.game_date || g.status === "cancelled") return;
      var matchup = team(g.home_team_id) + " vs " + oppName(g);
      if (game.field_id && g.field_id === game.field_id && timesOverlap(game.start_time, game.end_time, g.start_time, g.end_time)) {
        out.push({ type: "field_game", message: fName + " already has " + matchup + " from " + fmtTime(g.start_time) + " to " + fmtTime(g.end_time) + " that day." });
      }
      [game.home_team_id, game.away_team_id].forEach(function (tid) {
        if (tid && (g.home_team_id === tid || g.away_team_id === tid)) {
          out.push({ type: "double_header", message: team(tid) + " already plays that day: " + matchup + " at " + fmtTime(g.start_time) + " on " + (field(g.field_id).name || (g.venue_text ? g.venue_text : "another field")) + "." });
        }
      });
    });

    /* Away interlock games happen on another league's field: nothing below can
       conflict on our side. */
    if (!game.field_id) return out;

    var dayKeys = gameDayKeys(game);
    (ctx.slots || []).forEach(function (s) {
      if (s.season_id !== game.season_id || s.field_id !== game.field_id) return;
      if (dayKeys.indexOf(s.day_key) < 0) return;
      out.push({ type: "field_practice", message: fName + " has a practice slot held by " + (s.team_id ? team(s.team_id) : (s.label || "a team")) + " in that window (" + span + " overlaps their " + s.day_key.replace(/_/g, " ") + " slot)." });
    });

    var tags = fld.divisions || [];
    if (tags.length && game.division && tags.indexOf(game.division) < 0) {
      out.push({ type: "division_field", message: fName + " is tagged for " + tags.join(", ") + ". This game is " + game.division + "." });
    }
    return out;
  }

  /* ---------- Phase 3: season management helpers ---------- */
  /* Bulk rainout picks ONLY scheduled games on the target date. Drafts,
     cancelled, completed, and already-postponed games are never touched.
     The admin UI uses this for the confirm count; the gateway op mirrors it. */
  function bulkRainoutTargets(games, date) {
    return (games || []).filter(function (g) { return g.game_date === date && g.status === "scheduled"; });
  }

  /* Notes trail: makeups and moves keep their history in the game's notes
     ("Rained out Sat Sep 12."). Appends one plain sentence, caps at the
     gateway's 300-char notes limit, never repeats the same sentence. */
  function appendTrail(notes, sentence) {
    var n = String(notes || "").trim();
    if (!sentence) return n.slice(0, 300);
    if (n.indexOf(sentence) >= 0) return n.slice(0, 300);
    return (n ? n + " " + sentence : sentence).slice(0, 300);
  }

  /* ---------- Phase 4: umpire helpers (shared by umpire.html + admin.html) ---------- */
  var UMP_DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  function umpParseDefaults(raw) {
    try {
      var o = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
      return o && typeof o === "object" && !(o instanceof Array) ? o : {};
    } catch (e) { return {}; }
  }
  /* How many umpires does this game need? Per-game override first, then the
     division default from flm_settings.ump_defaults, then 1 plate ump. */
  function umpNeeded(game, defaults) {
    if (game && game.umps_needed !== null && game.umps_needed !== undefined) return game.umps_needed;
    var d = (defaults || {})[game && game.division ? game.division : ""];
    return typeof d === "number" ? d : 1;
  }
  /* Fill state for one game. Declined and turned-back rows never count, so a
     decline or turn-back automatically reopens the spot. */
  function umpFill(game, assignments, defaults) {
    var accepted = [], offered = [];
    (assignments || []).forEach(function (a) {
      if (a.game_id !== game.id) return;
      if (a.status === "accepted") accepted.push(a);
      else if (a.status === "offered") offered.push(a);
    });
    var needed = umpNeeded(game, defaults);
    return { needed: needed, accepted: accepted, offered: offered, missing: Math.max(0, needed - accepted.length) };
  }
  function umpAvailable(ump, dateStr) {
    var av = (ump && ump.availability) || {};
    var p = String(dateStr || "").split("-");
    var dow = UMP_DOW[new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1).getDay()];
    if (((av.days || {})[dow]) === false) return false;
    if ((av.blocked || []).indexOf(dateStr) >= 0) return false;
    return true;
  }
  /* Same-day clash: another accepted or offered assignment whose game time
     overlaps. Back-to-back games on the same day are fine. */
  function umpDayClash(ump, game, assignments, games) {
    var mine = (assignments || []).filter(function (a) {
      return a.ump_id === ump.id && (a.status === "accepted" || a.status === "offered") && a.game_id !== game.id;
    });
    for (var i = 0; i < mine.length; i++) {
      var g = (games || []).filter(function (x) { return x.id === mine[i].game_id; })[0];
      if (g && g.status !== "cancelled" && g.game_date === game.game_date && timesOverlap(g.start_time, g.end_time, game.start_time, game.end_time)) return true;
    }
    return false;
  }
  /* Full eligibility check for one ump on one game: level match, availability,
     not already on it, no same-day time clash. Returns "" when eligible, else
     a plain-words reason. */
  function umpIneligibleReason(ump, game, assignments, games) {
    if (!ump.active) return "not active";
    if ((ump.levels || []).indexOf(game.division) < 0) return "does not work " + (game.division || "this level");
    if (!umpAvailable(ump, game.game_date)) return "unavailable that day";
    var already = (assignments || []).some(function (a) {
      return a.ump_id === ump.id && a.game_id === game.id && (a.status === "accepted" || a.status === "offered");
    });
    if (already) return "already has this game";
    if (umpDayClash(ump, game, assignments, games)) return "has a game at that time already";
    return "";
  }
  /* Open Games for one ump: published scheduled games, today or later, in
     their levels, still missing an umpire, on a day they are available. */
  function umpOpenGames(ump, games, assignments, defaults, todayStr) {
    return (games || []).filter(function (g) {
      if (g.status !== "scheduled") return false;
      if (todayStr && g.game_date < todayStr) return false;
      if (umpFill(g, assignments, defaults).missing <= 0) return false;
      return umpIneligibleReason(ump, g, assignments, games) === "";
    });
  }
  /* Offer state machine, mirrored by the gateway: self-claims are born
     accepted; admin offers wait as offered until the ump responds. */
  function umpTransition(status, action) {
    var moves = { accept: ["offered", "accepted"], decline: ["offered", "declined"], turn_back: ["accepted", "turned_back"] };
    var mv = moves[action];
    return mv && mv[0] === status ? mv[1] : null;
  }

  /* ---------- Phase 5: scores + standings ---------- */
  /* Per-division standings settings live in flm_settings key
     "standings_divisions" (JSON): { "Majors BB": { "show": true, "count_interlock": true } }
     show: whether the division's standings appear on the public portal
           (default FALSE: younger divisions often do not post standings).
     count_interlock: whether completed games against other leagues count in
           the table (default TRUE; they count for our team only). */
  function standingsSettings(raw) {
    try {
      var o = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
      return o && typeof o === "object" && !(o instanceof Array) ? o : {};
    } catch (e) { return {}; }
  }
  function standingsShow(cfg, division) {
    var d = (cfg || {})[division];
    return !!(d && d.show);
  }
  function standingsCountInterlock(cfg, division) {
    var d = (cfg || {})[division];
    return !d || d.count_interlock !== false;
  }
  /* A game has a final when it is completed and both scores are entered. */
  function gameHasFinal(g) {
    return g && g.status === "completed" &&
      typeof g.home_score === "number" && typeof g.away_score === "number";
  }
  /* Build standings from completed games. Each team's results land in that
     TEAM'S OWN division (so crossover games count for both sides, each in its
     own table). Interlock games (ext_team_id) count for our home team only,
     and only when the division's count_interlock setting allows.
     Returns { divisionName: [ { team_id, name, w, l, t, gp, rf, ra, diff, pct } ] },
     each division sorted by win share, then run difference, then name. */
  function standings(games, teams, cfg) {
    var divOf = {}, nameOf = {};
    (teams || []).forEach(function (t) { divOf[t.id] = t.division || ""; nameOf[t.id] = t.name; });
    var rows = {}; /* team_id -> row */
    function row(id) {
      if (!rows[id]) rows[id] = { team_id: id, name: nameOf[id] || "?", w: 0, l: 0, t: 0, gp: 0, rf: 0, ra: 0, diff: 0, pct: 0 };
      return rows[id];
    }
    function add(id, scored, allowed) {
      var r = row(id);
      r.gp++; r.rf += scored; r.ra += allowed; r.diff = r.rf - r.ra;
      if (scored > allowed) r.w++;
      else if (scored < allowed) r.l++;
      else r.t++;
    }
    (games || []).forEach(function (g) {
      if (!gameHasFinal(g)) return;
      var hs = g.home_score, as = g.away_score;
      if (g.ext_team_id) {
        /* interlock: our team's result only, gated by its division's setting */
        if (standingsCountInterlock(cfg, divOf[g.home_team_id])) add(g.home_team_id, hs, as);
        return;
      }
      if (!g.away_team_id) return;
      add(g.home_team_id, hs, as);
      add(g.away_team_id, as, hs);
    });
    var byDiv = {};
    Object.keys(rows).forEach(function (id) {
      var r = rows[id];
      r.pct = r.gp ? (r.w + r.t * 0.5) / r.gp : 0;
      var d = divOf[id] || "";
      (byDiv[d] = byDiv[d] || []).push(r);
    });
    Object.keys(byDiv).forEach(function (d) {
      byDiv[d].sort(function (a, b) {
        if (b.pct !== a.pct) return b.pct - a.pct;
        if (b.w !== a.w) return b.w - a.w;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return String(a.name).localeCompare(String(b.name));
      });
    });
    return byDiv;
  }
  /* Plain final line for cards and modals: "Final: Cougars 7, Storm 4". */
  function finalLine(g, homeName, awayName) {
    if (!gameHasFinal(g)) return "";
    var hs = g.home_score, as = g.away_score;
    if (hs === as) return "Final: " + homeName + " " + hs + ", " + awayName + " " + as + " (tie)";
    return hs > as
      ? "Final: " + homeName + " " + hs + ", " + awayName + " " + as
      : "Final: " + awayName + " " + as + ", " + homeName + " " + hs;
  }

  return { DEFAULT_RULES: DEFAULT_RULES, parse: parse, describe: describe, evaluate: evaluate, toMinutes: toMinutes, timesOverlap: timesOverlap, fmtTime: fmtTime, gameDayKeys: gameDayKeys, gameConflicts: gameConflicts, bulkRainoutTargets: bulkRainoutTargets, appendTrail: appendTrail, umpParseDefaults: umpParseDefaults, umpNeeded: umpNeeded, umpFill: umpFill, umpAvailable: umpAvailable, umpDayClash: umpDayClash, umpIneligibleReason: umpIneligibleReason, umpOpenGames: umpOpenGames, umpTransition: umpTransition, standingsSettings: standingsSettings, standingsShow: standingsShow, standingsCountInterlock: standingsCountInterlock, gameHasFinal: gameHasFinal, standings: standings, finalLine: finalLine };
});
