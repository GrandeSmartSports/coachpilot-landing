/* Field Command season generator (Phase 2).
   Pure matchup + placement engine. No network, no DOM. Unit-tested in
   tests/fields.smoke.mjs, used by fields/admin.html Season Generator panel.

   Config shape (persisted as JSON in flm_settings key "season_gen_config"):
     {
       "season_id": "uuid",
       "start_date": "2026-09-08",
       "end_date": "2026-10-31",
       "seed": 1,
       "blackouts": [ { "label": "Labor Day weekend", "start": "2026-09-05", "end": "2026-09-07" } ],
       "divisions": {
         "Majors BB": {
           "games_per_team": 8,
           "game_minutes": 120,
           "days": { "sat": ["10:00", "12:30", "15:00"], "tue": ["17:30"] },
           "fields": ["field-uuid", "field-uuid"]
         }
       },
       "crossovers": [ { "a": "Majors BB", "b": "Minors BB", "games_per_team": 2 } ],
       "interlocks": [ {
         "division": "Majors BB",           our division that travels/hosts
         "leagues": ["Auburn LL", "Kent LL"],  external league pool (flm_ext_teams)
         "ext_division": "Majors BB",       pool filter, blank = any division
         "games_per_team": 4,
         "home_ratio": 0.5,                 share of each team's interlock games at home
         "days": { "sat": ["10:00"] }       optional; defaults to the division's days
       } ]
     }

   Crossover = in-league games between two of OUR divisions (was called
   "interlock" before Phase 2.1). Interlock = games against teams from OTHER
   leagues (flm_ext_teams). Legacy configs with a/b rules stored under
   "interlocks" are read as crossovers automatically.

   generate(config, ctx) where ctx = { teams, fields, slots, games, ext_teams }
   (gateway state shape; games = existing games to respect, drafts excluded by
   the caller).
   Returns { games, unplaced, stats }. Every candidate placement is vetted with
   FLM_RULES.gameConflicts; a matchup that cannot be placed cleanly lands in
   unplaced, never silently dropped and never placed conflicting. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./flm-rules.js"));
  } else {
    root.FLM_GEN = factory(root.FLM_RULES);
  }
})(typeof self !== "undefined" ? self : this, function (RULES) {
  var DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  /* Deterministic PRNG (mulberry32) so a "shuffle seed" reproduces a schedule
     and Regenerate with a new seed gives a fresh arrangement. */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function parseDate(str) {
    var p = String(str || "").split("-");
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function dateStr(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function addMinutes(hhmm, mins) {
    var m = RULES.toMinutes(hhmm) + mins;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }
  function inBlackout(day, blackouts) {
    for (var i = 0; i < (blackouts || []).length; i++) {
      var b = blackouts[i];
      var s = b.start || b.date, e = b.end || b.start || b.date;
      if (s && day >= s && day <= e) return true;
    }
    return false;
  }

  /* ---------- matchups ---------- */
  /* Round robin (circle method). Returns rounds: [[ [i,j], ... ], ...] for one
     full cycle over team indexes 0..n-1. Odd n gets a bye seat (-1). */
  function roundRobinCycle(n) {
    var seats = [];
    for (var i = 0; i < n; i++) seats.push(i);
    if (n % 2 === 1) seats.push(-1);
    var m = seats.length, rounds = [];
    for (var r = 0; r < m - 1; r++) {
      var pairs = [];
      for (var k = 0; k < m / 2; k++) {
        var a = seats[k], b = seats[m - 1 - k];
        if (a !== -1 && b !== -1) pairs.push([a, b]);
      }
      rounds.push(pairs);
      /* rotate all but seat 0 */
      seats.splice(1, 0, seats.pop());
    }
    return rounds;
  }

  /* Division matchups: repeat the cycle until every team reaches gamesPerTeam.
     A pairing is taken only while both teams still need games, so byes and
     leftovers rotate fairly (per-team counts never spread more than 1). */
  function divisionMatchups(teamIds, gamesPerTeam, rand) {
    var order = shuffle(teamIds, rand);
    var n = order.length;
    if (n < 2 || gamesPerTeam < 1) return [];
    var count = {}, home = {};
    order.forEach(function (id) { count[id] = 0; home[id] = 0; });
    var cycle = roundRobinCycle(n);
    var out = [];
    var maxCycles = Math.ceil(gamesPerTeam / Math.max(1, n - 1)) + 2;
    for (var c = 0; c < maxCycles; c++) {
      for (var r = 0; r < cycle.length; r++) {
        for (var p = 0; p < cycle[r].length; p++) {
          var a = order[cycle[r][p][0]], b = order[cycle[r][p][1]];
          if (count[a] >= gamesPerTeam || count[b] >= gamesPerTeam) continue;
          /* balanced home/away: fewer home games so far bats last (is home) */
          var ha = home[a] - (count[a] - home[a]);
          var hb = home[b] - (count[b] - home[b]);
          var homeId, awayId;
          if (ha < hb) { homeId = a; awayId = b; }
          else if (hb < ha) { homeId = b; awayId = a; }
          else if ((c + r + p) % 2 === 0) { homeId = a; awayId = b; }
          else { homeId = b; awayId = a; }
          count[a]++; count[b]++; home[homeId]++;
          out.push({ home: homeId, away: awayId, round: c * cycle.length + r });
        }
      }
      var done = order.every(function (id) { return count[id] >= gamesPerTeam; });
      if (done) break;
    }
    return out;
  }

  /* Crossover matchups between two of OUR divisions A and B, k games per team.
     Rotating bipartite pairing; when team counts differ, every team still gets
     as close to k as the math allows (larger side exact, smaller side spread
     evenly). Home side alternates by round, then balances per team. */
  function crossoverMatchups(aIds, bIds, k, rand) {
    var A = shuffle(aIds, rand), B = shuffle(bIds, rand);
    if (!A.length || !B.length || k < 1) return [];
    var L = Math.max(A.length, B.length);
    var home = {}, count = {};
    A.concat(B).forEach(function (id) { home[id] = 0; count[id] = 0; });
    var out = [];
    for (var r = 0; r < k; r++) {
      for (var i = 0; i < L; i++) {
        var a = A[i % A.length], b = B[(i + r) % B.length];
        var ha = home[a] - (count[a] - home[a]);
        var hb = home[b] - (count[b] - home[b]);
        var aHome;
        if (ha < hb) aHome = true;
        else if (hb < ha) aHome = false;
        else aHome = r % 2 === 0;
        count[a]++; count[b]++;
        home[aHome ? a : b]++;
        out.push({ home: aHome ? a : b, away: aHome ? b : a, round: r, crossover: true });
      }
    }
    return out;
  }

  /* Interlock matchups: OUR division's teams vs a pool of external teams from
     other leagues. Every one of our teams gets exactly k games, opponents
     rotate through the pool so no two of our teams lean on the same opponent,
     and the pool's load spreads as evenly as the math allows. homeRatio sets
     how many of each team's k games are at home (0.5 = half home, half away);
     fractional targets are spread across teams so the league-wide split still
     honors the ratio. Returns { home: ourTeamId, ext: extTeamId, league,
     is_home, round, ext_interlock: true }. */
  function extInterlockMatchups(ourIds, pool, k, homeRatio, rand) {
    var A = shuffle(ourIds, rand), P = shuffle(pool, rand);
    if (!A.length || !P.length || k < 1) return [];
    var ratio = typeof homeRatio === "number" ? Math.min(1, Math.max(0, homeRatio)) : 0.5;
    var base = Math.floor(k * ratio);
    var extraTeams = Math.round((k * ratio - base) * A.length);
    var out = [];
    for (var i = 0; i < A.length; i++) {
      var homeTarget = base + (i < extraTeams ? 1 : 0);
      for (var r = 0; r < k; r++) {
        var opp = P[(i + r) % P.length];
        out.push({
          home: A[i], ext: opp.id, league: opp.league_name || "",
          is_home: r < homeTarget, round: r, roundMax: k - 1, ext_interlock: true
        });
      }
    }
    return out;
  }

  /* ---------- placement ---------- */
  /* Build every legal candidate slot in the window: date x wave time x field,
     per division config, skipping blackouts. */
  function buildCandidates(cfg, division, dcfg) {
    var out = [];
    var start = parseDate(cfg.start_date), end = parseDate(cfg.end_date);
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      var day = dateStr(d);
      if (inBlackout(day, cfg.blackouts)) continue;
      var waves = (dcfg.days || {})[DOW_KEYS[d.getDay()]];
      if (!waves || !waves.length) continue;
      var week = Math.floor((d - start) / (7 * 86400000));
      for (var w = 0; w < waves.length; w++) {
        var startT = waves[w];
        var endT = addMinutes(startT, dcfg.game_minutes || 120);
        for (var f = 0; f < (dcfg.fields || []).length; f++) {
          out.push({ date: day, start: startT, end: endT, field_id: dcfg.fields[f], week: week, division: division });
        }
      }
    }
    return out;
  }

  /* Main entry. Returns { games, unplaced, stats }. */
  function generate(config, ctx) {
    var rand = rng(+config.seed || 1);
    var teams = (ctx.teams || []).filter(function (t) { return t.is_active; });
    var byDiv = {};
    teams.forEach(function (t) { if (t.division) (byDiv[t.division] = byDiv[t.division] || []).push(t.id); });
    var fieldTags = {};
    (ctx.fields || []).forEach(function (f) { fieldTags[f.id] = f.divisions || []; });
    function fieldAllows(fid, div) {
      var tags = fieldTags[fid] || [];
      return !tags.length || tags.indexOf(div) >= 0;
    }
    var teamDiv = {};
    teams.forEach(function (t) { teamDiv[t.id] = t.division || ""; });

    /* 1. matchups */
    var matchups = [];
    Object.keys(config.divisions || {}).forEach(function (div) {
      var dcfg = config.divisions[div];
      divisionMatchups(byDiv[div] || [], +dcfg.games_per_team || 0, rand).forEach(function (m) {
        m.division = div;
        matchups.push(m);
      });
    });
    /* crossover (in-league, two of our divisions); legacy configs stored these
       a/b rules under "interlocks" before the external-interlock rework */
    var crossRules = (config.crossovers || []).concat((config.interlocks || []).filter(function (il) { return il.a && il.b; }));
    crossRules.forEach(function (il) {
      if (!(config.divisions || {})[il.a] || !(config.divisions || {})[il.b]) return;
      crossoverMatchups(byDiv[il.a] || [], byDiv[il.b] || [], +il.games_per_team || 0, rand).forEach(function (m) {
        m.division = teamDiv[m.home]; /* game rides under the home team's division */
        m.pair = [il.a, il.b];
        matchups.push(m);
      });
    });
    /* interlock (games against other leagues' teams from ctx.ext_teams) */
    (config.interlocks || []).filter(function (il) { return il.division && (il.leagues || []).length; }).forEach(function (il) {
      if (!(config.divisions || {})[il.division]) return;
      var want = il.ext_division === undefined || il.ext_division === null ? il.division : il.ext_division;
      var pool = (ctx.ext_teams || []).filter(function (x) {
        if ((il.leagues || []).indexOf(x.league_name) < 0) return false;
        return !want || !x.division || x.division === want;
      });
      var ratio = typeof il.home_ratio === "number" ? il.home_ratio : 0.5;
      extInterlockMatchups(byDiv[il.division] || [], pool, +il.games_per_team || 0, ratio, rand).forEach(function (m) {
        m.division = il.division;
        if (il.days && Object.keys(il.days).length) m.days = il.days;
        matchups.push(m);
      });
    });

    /* 2. candidate slots per division (crossover games use the candidates of
       the home team's division, narrowed to fields legal for BOTH divisions;
       home interlock games use their division's candidates as-is) */
    var candByDiv = {};
    Object.keys(config.divisions || {}).forEach(function (div) {
      candByDiv[div] = buildCandidates(config, div, config.divisions[div]);
    });

    /* 3. greedy placement in round order (spreads each team across the season),
       then a repair pass for anything left over. */
    var seasonWeeks = Math.max(1, Math.ceil((parseDate(config.end_date) - parseDate(config.start_date) + 86400000) / (7 * 86400000)));
    var placed = [], unplaced = [];
    var genSeq = 0; /* temp ids: gameConflicts skips g.id === game.id, and two
                       undefined ids compare equal, hiding placed games from
                       the check. Stripped before returning. */
    var usedSlot = {};    /* field|date|start -> 1 */
    var teamWeekLoad = {}; /* team|week -> games */
    var fieldLoad = {};    /* field -> games */
    var teamGamesSoFar = {};

    function conflictFree(g) {
      var conflicts = RULES.gameConflicts(g, {
        games: (ctx.games || []).concat(placed),
        slots: ctx.slots || [],
        teams: ctx.teams || [],
        fields: ctx.fields || [],
        ext_teams: ctx.ext_teams || []
      });
      return conflicts.length === 0;
    }

    function matchupGame(m, c) {
      return {
        id: "gen-" + (++genSeq),
        season_id: config.season_id, division: m.division,
        home_team_id: m.home,
        away_team_id: m.ext ? null : m.away,
        ext_team_id: m.ext || null,
        field_id: c.field_id || null,
        venue_text: c.field_id ? null : (m.league || "the other league"),
        game_date: c.date,
        start_time: c.start, end_time: c.end, status: "draft"
      };
    }

    function targetWeekOf(m) {
      var maxRound = m.roundMax;
      if (maxRound === undefined) {
        maxRound = 1;
        matchups.forEach(function (x) { if (x.division === m.division && x.roundMax === undefined && x.round > maxRound) maxRound = x.round; });
      }
      return Math.round((m.round / Math.max(1, maxRound)) * (seasonWeeks - 1));
    }

    function tryPlace(m, strict) {
      var div = m.division;
      var cands = candByDiv[div] || [];
      var targetWeek = targetWeekOf(m);
      var best = null, bestScore = -1;
      var order = shuffle(cands, rand);
      for (var i = 0; i < order.length; i++) {
        var c = order[i];
        if (usedSlot[c.field_id + "|" + c.date + "|" + c.start]) continue;
        if (m.pair && !(fieldAllows(c.field_id, m.pair[0]) && fieldAllows(c.field_id, m.pair[1]))) continue;
        var hw = teamWeekLoad[m.home + "|" + c.week] || 0;
        var aw = m.away ? (teamWeekLoad[m.away + "|" + c.week] || 0) : 0;
        if (strict && (hw > 0 || aw > 0)) continue; /* aim one game per team per week first */
        var score = 100 - Math.abs(c.week - targetWeek) * 10 - (hw + aw) * 6 - (fieldLoad[c.field_id] || 0) * 0.5;
        if (score <= bestScore) continue;
        var g = matchupGame(m, c);
        if (!conflictFree(g)) continue;
        best = { g: g, c: c }; bestScore = score;
      }
      if (!best) return false;
      placed.push(best.g);
      usedSlot[best.c.field_id + "|" + best.c.date + "|" + best.c.start] = 1;
      teamWeekLoad[m.home + "|" + best.c.week] = (teamWeekLoad[m.home + "|" + best.c.week] || 0) + 1;
      if (m.away) teamWeekLoad[m.away + "|" + best.c.week] = (teamWeekLoad[m.away + "|" + best.c.week] || 0) + 1;
      fieldLoad[best.c.field_id] = (fieldLoad[best.c.field_id] || 0) + 1;
      return true;
    }

    /* Away interlock games happen on the other league's field. No slot on our
       grid is consumed and no our-field checks apply, but our traveling team
       still gets the double-header guard via gameConflicts. Dates come from
       the rule's days (or the division's days), venue defaults to the league
       name so the admin can fill in the real park later. */
    function awayCandidates(m) {
      var dcfg = config.divisions[m.division] || {};
      var days = m.days || dcfg.days || {};
      var out = [];
      var start = parseDate(config.start_date), end = parseDate(config.end_date);
      for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        var day = dateStr(d);
        if (inBlackout(day, config.blackouts)) continue;
        var waves = days[DOW_KEYS[d.getDay()]];
        if (!waves || !waves.length) continue;
        var week = Math.floor((d - start) / (7 * 86400000));
        var startT = waves[0];
        out.push({ date: day, start: startT, end: addMinutes(startT, dcfg.game_minutes || 120), week: week, field_id: null });
      }
      return out;
    }

    function tryPlaceAway(m, strict) {
      var targetWeek = targetWeekOf(m);
      var best = null, bestScore = -1;
      var order = shuffle(awayCandidates(m), rand);
      for (var i = 0; i < order.length; i++) {
        var c = order[i];
        var hw = teamWeekLoad[m.home + "|" + c.week] || 0;
        if (strict && hw > 0) continue;
        var score = 100 - Math.abs(c.week - targetWeek) * 10 - hw * 6;
        if (score <= bestScore) continue;
        var g = matchupGame(m, c);
        if (!conflictFree(g)) continue;
        best = { g: g, c: c }; bestScore = score;
      }
      if (!best) return false;
      placed.push(best.g);
      teamWeekLoad[m.home + "|" + best.c.week] = (teamWeekLoad[m.home + "|" + best.c.week] || 0) + 1;
      return true;
    }

    function place(m, strict) {
      if (m.ext && !m.is_home) return tryPlaceAway(m, strict);
      return tryPlace(m, strict);
    }

    var ordered = matchups.slice().sort(function (a, b) { return a.round - b.round; });
    var leftovers = [];
    ordered.forEach(function (m) {
      if (!place(m, true)) leftovers.push(m);
    });
    leftovers.forEach(function (m) {
      if (!place(m, false)) {
        unplaced.push({
          division: m.division, home_team_id: m.home,
          away_team_id: m.ext ? null : m.away,
          ext_team_id: m.ext || null, league: m.league || "",
          crossover: !!m.pair, interlock: !!m.ext,
          reason: "No open conflict-free slot left on the configured days and fields."
        });
      }
    });

    placed.forEach(function (g) { delete g.id; });
    placed.sort(function (a, b) { return (a.game_date + a.start_time).localeCompare(b.game_date + b.start_time); });
    return { games: placed, unplaced: unplaced, stats: summarize(placed, unplaced, ctx) };
  }

  /* Stats for the review panel: per-team games + home/away, per-field load,
     and a separate interlock block (our team vs another league). An interlock
     game is home for our team when it sits on one of our fields (field_id) and
     away when it happens at the other league's venue (venue_text). */
  function summarize(games, unplaced, ctx) {
    var perTeam = {}, perField = {};
    var il = { total: 0, home: 0, away: 0, perTeam: {} };
    function bump(map, key, field) {
      map[key] = map[key] || { games: 0, home: 0, away: 0 };
      map[key].games++;
      map[key][field]++;
    }
    (games || []).forEach(function (g) {
      var homeSide = g.ext_team_id ? (g.field_id ? "home" : "away") : "home";
      bump(perTeam, g.home_team_id, homeSide);
      if (g.away_team_id) bump(perTeam, g.away_team_id, "away");
      if (g.field_id) perField[g.field_id] = (perField[g.field_id] || 0) + 1;
      if (g.ext_team_id) {
        il.total++;
        il[g.field_id ? "home" : "away"]++;
        bump(il.perTeam, g.home_team_id, g.field_id ? "home" : "away");
      }
    });
    return { total: (games || []).length, unplaced: (unplaced || []).length, perTeam: perTeam, perField: perField, interlock: il };
  }

  /* ---------- Phase 3: move / makeup suggestions ---------- */
  /* Conflict-free places one game could move to, using the saved generator
     setup (season_gen_config) for its division: every date x wave x field in
     the window, blackouts skipped, each candidate vetted with gameConflicts
     against every OTHER game plus practice slots. Chronological order.
     opts: { limit (default 10), min_date ("YYYY-MM-DD", e.g. today for a
     makeup so it never suggests the past) }. Returns [] when the division has
     no generator setup; the caller falls back to manual date/time/field. */
  function suggestSlots(game, cfg, ctx, opts) {
    opts = opts || {};
    var max = opts.limit || 10;
    var dcfg = ((cfg || {}).divisions || {})[game.division];
    if (!dcfg || !cfg.start_date || !cfg.end_date) return [];
    var cands = buildCandidates(cfg, game.division, dcfg);
    cands.sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
    var others = (ctx.games || []).filter(function (g) { return g.id !== game.id; });
    var out = [];
    for (var i = 0; i < cands.length && out.length < max; i++) {
      var c = cands[i];
      if (opts.min_date && c.date < opts.min_date) continue;
      if (c.date === game.game_date && c.start === String(game.start_time).slice(0, 5) && c.field_id === game.field_id) continue;
      var g2 = {
        id: game.id, season_id: game.season_id, division: game.division,
        home_team_id: game.home_team_id,
        away_team_id: game.away_team_id || null,
        ext_team_id: game.ext_team_id || null,
        field_id: c.field_id, venue_text: null,
        game_date: c.date, start_time: c.start, end_time: c.end
      };
      var conflicts = RULES.gameConflicts(g2, {
        games: others, slots: ctx.slots || [], teams: ctx.teams || [],
        fields: ctx.fields || [], ext_teams: ctx.ext_teams || []
      });
      if (conflicts.length === 0) out.push({ date: c.date, start: c.start, end: c.end, field_id: c.field_id });
    }
    return out;
  }

  return {
    generate: generate,
    divisionMatchups: divisionMatchups,
    crossoverMatchups: crossoverMatchups,
    extInterlockMatchups: extInterlockMatchups,
    roundRobinCycle: roundRobinCycle,
    buildCandidates: buildCandidates,
    suggestSlots: suggestSlots,
    summarize: summarize,
    rng: rng
  };
});
