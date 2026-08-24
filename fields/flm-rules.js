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

  return { DEFAULT_RULES: DEFAULT_RULES, parse: parse, describe: describe, evaluate: evaluate, toMinutes: toMinutes, timesOverlap: timesOverlap, fmtTime: fmtTime, gameDayKeys: gameDayKeys, gameConflicts: gameConflicts, bulkRainoutTargets: bulkRainoutTargets, appendTrail: appendTrail };
});
