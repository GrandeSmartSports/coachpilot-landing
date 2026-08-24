#!/usr/bin/env node
// Smoke test for Field Command (fields/index.html, fields/admin.html, fields/flm-rules.js).
//
// What it checks:
//   1. Rule engine unit tests (fields/flm-rules.js) against the league guideline:
//      1 weekday + 1 Saturday, OR Mon+Fri.
//   2. fields/index.html has the coach picker, My Team header, announcement banner
//      hooks, and loads the shared rule engine.
//   3. fields/admin.html has the compliance panel, announcements composer, rule
//      editor inputs, and loads the shared rule engine.
//   4. flm-rules.js (new file) has no em/en dashes or curly quotes.
//   5. Live flm-gateway: state returns practice_rules + announcements; admin
//      actions reject a missing PIN with 401. No writes are made.
//
// Run:  node tests/fields.smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/flm-gateway';

let passed = 0, failed = 0;
function ok(msg)   { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function section(name) { console.log('\n' + name); }

// ------- 1. Rule engine unit tests -------
section('rule engine: compliance scenarios');
const FLM = require(path.join(ROOT, 'fields', 'flm-rules.js'));
const rules = FLM.parse(JSON.stringify(FLM.DEFAULT_RULES));

function slots(days) { return days.map((d) => ({ day_key: d })); }
const cases = [
  { days: [], want: 'none', availWk: true, availSat: true, label: 'empty team -> none, both available' },
  { days: ['mon'], want: 'under', availWk: true, availSat: true, label: 'mon only -> under, Friday or Saturday available' },
  { days: ['tue'], want: 'under', availWk: false, availSat: true, label: 'tue only -> under, Saturday available only' },
  { days: ['tue', 'sat_9_11'], want: 'ok', availWk: false, availSat: false, label: 'tue + sat -> ok' },
  { days: ['mon', 'fri'], want: 'ok', availWk: false, availSat: false, label: 'mon + fri -> ok (alternative)' },
  { days: ['tue', 'thu'], want: 'over', availWk: false, availSat: false, label: 'two weekdays -> over (RED)' },
  { days: ['mon', 'fri', 'sat_1_3'], want: 'over', availWk: false, availSat: false, label: 'mon + fri + sat -> over (RED)' },
  { days: ['sat_9_11', 'sat_1_3'], want: 'over', availWk: false, availSat: false, label: 'two Saturdays -> over (RED)' },
];
for (const c of cases) {
  const ev = FLM.evaluate(rules, slots(c.days));
  if (ev.status === c.want && ev.availWeekday === c.availWk && ev.availWeekend === c.availSat) ok(c.label);
  else fail(c.label + ' (got status=' + ev.status + ' availWk=' + ev.availWeekday + ' availSat=' + ev.availWeekend + ')');
}
const desc = FLM.describe(rules);
if (desc === 'Each team gets 1 weekday practice plus 1 Saturday practice, or Monday plus Friday.') ok('describe() renders plain words: ' + desc);
else fail('describe() unexpected: ' + desc);
if (FLM.parse('not json').max_weekdays === 1) ok('bad JSON falls back to default rules');
else fail('bad JSON fallback broken');
const noAlt = FLM.evaluate(FLM.parse('{"max_weekdays":2,"max_weekend":1,"expected_total":3,"alternatives":[]}'), slots(['tue', 'thu']));
if (noAlt.status === 'under' && noAlt.availWeekend === true) ok('rule change (2 weekdays allowed) recomputes: tue+thu now under');
else fail('rule change recompute broken (got ' + noAlt.status + ')');

// ------- 1b. Game conflict engine unit tests (Phase 1) -------
section('conflict engine: games');
if (new Date(2026, 8, 14).getDay() === 1 && new Date(2026, 8, 19).getDay() === 6) ok('test dates sane (9/14 Monday, 9/19 Saturday)');
else fail('test date assumptions wrong');

if (FLM.timesOverlap('17:00', '19:00', '18:00', '20:00')) ok('overlap: 5-7 vs 6-8 overlaps');
else fail('overlap: 5-7 vs 6-8 should overlap');
if (!FLM.timesOverlap('17:00', '19:00', '19:00', '21:00')) ok('overlap: back-to-back games do not overlap');
else fail('overlap: touching times should not overlap');
if (!FLM.timesOverlap('09:00', '10:00', '11:00', '12:00')) ok('overlap: disjoint times do not overlap');
else fail('overlap: disjoint should not overlap');

const dk1 = FLM.gameDayKeys({ game_date: '2026-09-14', start_time: '17:00', end_time: '19:00' });
if (dk1.length === 1 && dk1[0] === 'mon') ok('gameDayKeys: Monday game maps to mon');
else fail('gameDayKeys mon broken: ' + JSON.stringify(dk1));
const dk2 = FLM.gameDayKeys({ game_date: '2026-09-19', start_time: '10:00', end_time: '12:00' });
if (dk2.length === 2 && dk2.includes('sat_9_11') && dk2.includes('sat_11_1')) ok('gameDayKeys: Sat 10-12 hits both morning windows');
else fail('gameDayKeys saturday broken: ' + JSON.stringify(dk2));
if (FLM.gameDayKeys({ game_date: '2026-09-20', start_time: '10:00', end_time: '12:00' }).length === 0) ok('gameDayKeys: Sunday game touches no practice keys');
else fail('gameDayKeys sunday broken');

const CTX = {
  teams: [
    { id: 'A', name: 'Aces', division: 'Majors BB' },
    { id: 'B', name: 'Bears', division: 'Majors BB' },
    { id: 'C', name: 'Cubs', division: 'Minors BB' },
    { id: 'D', name: 'Dogs', division: 'Minors BB' },
  ],
  fields: [
    { id: 'F1', name: 'Field One', divisions: [] },
    { id: 'F2', name: 'Field Two', divisions: ['Majors BB'] },
  ],
  slots: [{ id: 'S1', season_id: 'sn1', field_id: 'F1', day_key: 'mon', team_id: 'C', label: 'Cubs' }],
  games: [{ id: 'G1', season_id: 'sn1', division: 'Majors BB', home_team_id: 'A', away_team_id: 'B', field_id: 'F1', game_date: '2026-09-15', start_time: '17:00:00', end_time: '19:00:00', status: 'scheduled' }],
};
function mkGame(over) {
  return Object.assign({ season_id: 'sn1', division: 'Minors BB', home_team_id: 'C', away_team_id: 'D', field_id: 'F2', game_date: '2026-09-16', start_time: '17:00', end_time: '19:00' }, over);
}
const clean = FLM.gameConflicts(mkGame({ field_id: 'F1', division: 'Minors BB', game_date: '2026-09-16' }), CTX);
if (clean.length === 0) ok('clean game on a free Tuesday has no conflicts');
else fail('clean game flagged: ' + JSON.stringify(clean));
const fieldClash = FLM.gameConflicts(mkGame({ field_id: 'F1', game_date: '2026-09-15', start_time: '18:00', end_time: '20:00' }), CTX);
if (fieldClash.some((c) => c.type === 'field_game') && fieldClash[0].message.includes('Field One') && fieldClash.some((c) => c.message.includes('Aces vs Bears'))) ok('field double-booking names the field and the clashing matchup');
else fail('field double-booking broken: ' + JSON.stringify(fieldClash));
const dh = FLM.gameConflicts(mkGame({ home_team_id: 'A', away_team_id: 'C', division: 'Majors BB', field_id: 'F2', game_date: '2026-09-15' }), CTX);
if (dh.some((c) => c.type === 'double_header') && dh.some((c) => c.message.includes('Aces'))) ok('double-header warns with the team name');
else fail('double-header broken: ' + JSON.stringify(dh));
const elig = FLM.gameConflicts(mkGame({ field_id: 'F2', division: 'Minors BB' }), CTX);
if (elig.some((c) => c.type === 'division_field') && elig.some((c) => c.message.includes('Majors BB'))) ok('division eligibility mismatch flagged with field tags');
else fail('eligibility broken: ' + JSON.stringify(elig));
const prac = FLM.gameConflicts(mkGame({ field_id: 'F1', game_date: '2026-09-14' }), CTX);
if (prac.some((c) => c.type === 'field_practice') && prac.some((c) => c.message.includes('Cubs'))) ok('game over a practice slot warns with the slot holder');
else fail('practice overlap broken: ' + JSON.stringify(prac));
const selfEdit = FLM.gameConflicts({ id: 'G1', season_id: 'sn1', division: 'Majors BB', home_team_id: 'A', away_team_id: 'B', field_id: 'F1', game_date: '2026-09-15', start_time: '17:00', end_time: '19:00' }, CTX);
if (!selfEdit.some((c) => c.type === 'field_game' || c.type === 'double_header')) ok('editing a game never conflicts with itself');
else fail('self-conflict on edit: ' + JSON.stringify(selfEdit));
const cancelled = FLM.gameConflicts(mkGame({ field_id: 'F1', game_date: '2026-09-15', start_time: '17:00', end_time: '19:00' }), { ...CTX, games: [{ ...CTX.games[0], status: 'cancelled' }] });
if (!cancelled.some((c) => c.type === 'field_game')) ok('cancelled games do not block the field');
else fail('cancelled game still conflicts');

// ------- 1b2. Conflict engine: interlock games (external opponent / venue) -------
section('conflict engine: interlock (other leagues)');
const XCTX = {
  ...CTX,
  ext_teams: [
    { id: 'X1', league_name: 'Auburn LL', team_name: 'Storm', division: 'Majors BB' },
    { id: 'X2', league_name: 'Kent LL', team_name: 'Rapids', division: 'Majors BB' },
  ],
};
function extGame(over) {
  return Object.assign({ season_id: 'sn1', division: 'Majors BB', home_team_id: 'A', away_team_id: null, ext_team_id: 'X1', field_id: 'F2', venue_text: null, game_date: '2026-09-16', start_time: '17:00', end_time: '19:00' }, over);
}
// Home interlock game occupies our field like any other game.
const xHomeClash = FLM.gameConflicts(extGame({ field_id: 'F1', game_date: '2026-09-15', start_time: '18:00', end_time: '20:00' }), XCTX);
if (xHomeClash.some((c) => c.type === 'field_game')) ok('home interlock game gets the full field double-booking check');
else fail('home interlock field clash missed: ' + JSON.stringify(xHomeClash));
// Away interlock game (their venue): our fields can never conflict on our side...
const xAway = FLM.gameConflicts(extGame({ field_id: null, venue_text: 'Brannan Park, Auburn', game_date: '2026-09-15', start_time: '17:00', end_time: '19:00', home_team_id: 'C' }), XCTX);
if (!xAway.some((c) => c.type === 'field_game' || c.type === 'field_practice' || c.type === 'division_field')) ok('away interlock game skips every our-field check');
else fail('away interlock game hit an our-field check: ' + JSON.stringify(xAway));
// ...but our traveling team still gets the double-header guard.
const xAwayDh = FLM.gameConflicts(extGame({ field_id: null, venue_text: 'Brannan Park, Auburn', game_date: '2026-09-15', home_team_id: 'A' }), XCTX);
if (xAwayDh.some((c) => c.type === 'double_header') && xAwayDh.some((c) => c.message.includes('Aces'))) ok('away interlock game still catches our-team double-headers');
else fail('away interlock double-header missed: ' + JSON.stringify(xAwayDh));
// Conflict messages name the interlock opponent with its league.
const xNamed = FLM.gameConflicts(mkGame({ home_team_id: 'B', away_team_id: 'D', division: 'Majors BB', field_id: 'F1', game_date: '2026-09-16' }), {
  ...XCTX,
  games: [extGame({ id: 'GX0', field_id: 'F1', game_date: '2026-09-16', start_time: '17:00', end_time: '19:00' })],
});
if (xNamed.some((c) => c.type === 'field_game' && c.message.includes('Storm (Auburn LL)'))) ok('conflict messages name the interlock opponent with its league');
else fail('interlock opponent name missing from conflict: ' + JSON.stringify(xNamed));
// Two away games at different leagues share no field: null field ids never collide.
const xNullField = FLM.gameConflicts(extGame({ field_id: null, venue_text: 'Kent Memorial Park', ext_team_id: 'X2', home_team_id: 'B', game_date: '2026-09-16' }), {
  ...XCTX,
  games: [extGame({ id: 'GX', field_id: null, venue_text: 'Brannan Park, Auburn', home_team_id: 'A', game_date: '2026-09-16' })],
});
if (!xNullField.some((c) => c.type === 'field_game')) ok('two away interlock games never fake a field clash on null field ids');
else fail('null field ids collided: ' + JSON.stringify(xNullField));

// ------- 1c. Season generator unit tests (Phase 2) -------
section('season generator: matchups');
const GEN = require(path.join(ROOT, 'fields', 'flm-schedule-gen.js'));

function ids(n, prefix) { return Array.from({ length: n }, (_, i) => (prefix || 'T') + i); }
function pairKey(a, b) { return a < b ? a + '~' + b : b + '~' + a; }
function counts(ms) {
  const c = {};
  for (const m of ms) { c[m.home] = (c[m.home] || 0) + 1; c[m.away] = (c[m.away] || 0) + 1; }
  return c;
}
function homeAwaySpread(ms) {
  const h = {}, t = {};
  for (const m of ms) { h[m.home] = (h[m.home] || 0) + 1; t[m.home] = (t[m.home] || 0) + 1; t[m.away] = (t[m.away] || 0) + 1; }
  let worst = 0;
  for (const id of Object.keys(t)) worst = Math.max(worst, Math.abs(2 * (h[id] || 0) - t[id]));
  return worst;
}

// Round-robin completeness: 6 teams, 5 games each = every pairing exactly once.
{
  const ms = GEN.divisionMatchups(ids(6), 5, GEN.rng(7));
  const pairs = {};
  for (const m of ms) pairs[pairKey(m.home, m.away)] = (pairs[pairKey(m.home, m.away)] || 0) + 1;
  const allOnce = Object.keys(pairs).length === 15 && Object.values(pairs).every((v) => v === 1);
  if (ms.length === 15 && allOnce) ok('6 teams x 5 games: full round robin, every pairing exactly once');
  else fail('round robin completeness broken: ' + ms.length + ' games, pairs=' + JSON.stringify(pairs));
  const c = counts(ms);
  if (Object.values(c).every((v) => v === 5)) ok('every team gets exactly 5 games');
  else fail('per-team counts wrong: ' + JSON.stringify(c));
  if (homeAwaySpread(ms) <= 1) ok('home/away balance within 1 (6 teams)');
  else fail('home/away spread too wide: ' + homeAwaySpread(ms));
}
// Repeat cycle: 4 teams, 9 games each = 3 full cycles = each pairing 3 times.
{
  const ms = GEN.divisionMatchups(ids(4), 9, GEN.rng(3));
  const pairs = {};
  for (const m of ms) pairs[pairKey(m.home, m.away)] = (pairs[pairKey(m.home, m.away)] || 0) + 1;
  if (ms.length === 18 && Object.values(pairs).every((v) => v === 3)) ok('4 teams x 9 games: cycle repeats, every pairing exactly 3 times');
  else fail('repeat-cycle counts wrong: ' + JSON.stringify(pairs));
  if (homeAwaySpread(ms) <= 1) ok('home/away balance within 1 across repeated cycles');
  else fail('repeat-cycle home/away spread: ' + homeAwaySpread(ms));
}
// Odd team count: 5 teams, 4 games each -> byes rotate, counts even.
{
  const ms = GEN.divisionMatchups(ids(5), 4, GEN.rng(11));
  const c = counts(ms);
  const vals = ids(5).map((id) => c[id] || 0);
  if (Math.max(...vals) - Math.min(...vals) <= 1 && Math.max(...vals) <= 4) ok('5 teams (odd): byes rotate fairly, per-team counts within 1 of target');
  else fail('odd-team byes unfair: ' + JSON.stringify(c));
  if (homeAwaySpread(ms) <= 1) ok('home/away balance within 1 (odd team count)');
  else fail('odd-team home/away spread: ' + homeAwaySpread(ms));
}
// Crossover (in-league, was called interlock before Phase 2.1): 4 vs 4, 2 games
// per team = 8 crossover games, everybody exactly 2.
{
  const ms = GEN.crossoverMatchups(ids(4, 'A'), ids(4, 'B'), 2, GEN.rng(5));
  const c = counts(ms);
  const okCounts = ids(4, 'A').concat(ids(4, 'B')).every((id) => c[id] === 2);
  if (ms.length === 8 && okCounts) ok('crossover 4v4 x2: every team gets exactly 2 crossover games');
  else fail('crossover counts wrong: ' + JSON.stringify(c));
  const crossOk = ms.every((m) => (m.home[0] === 'A') !== (m.away[0] === 'A'));
  if (crossOk) ok('crossover games always pair one team from each division');
  else fail('crossover produced a same-division pairing');
  if (homeAwaySpread(ms) <= 1) ok('crossover home/away balance within 1');
  else fail('crossover home/away spread: ' + homeAwaySpread(ms));
}
// Interlock (against other leagues): every one of our teams gets exactly k games,
// opponents spread across the pool, home/away split honors the ratio.
const XPOOL = [
  { id: 'X1', league_name: 'Auburn LL', division: 'Majors BB' },
  { id: 'X2', league_name: 'Auburn LL', division: 'Majors BB' },
  { id: 'X3', league_name: 'Kent LL', division: 'Majors BB' },
];
{
  const ms = GEN.extInterlockMatchups(ids(4, 'M'), XPOOL, 2, 0.5, GEN.rng(9));
  const perOur = {};
  for (const m of ms) perOur[m.home] = (perOur[m.home] || 0) + 1;
  if (ms.length === 8 && ids(4, 'M').every((id) => perOur[id] === 2)) ok('interlock 4 teams x2 vs pool of 3: every one of our teams gets exactly 2 games');
  else fail('interlock our-team counts wrong: ' + JSON.stringify(perOur));
  const distinct = ids(4, 'M').every((id) => new Set(ms.filter((m) => m.home === id).map((m) => m.ext)).size === 2);
  if (distinct) ok('no team plays the same interlock opponent twice while the pool has room');
  else fail('interlock opponent repeated too early');
  const extLoad = {};
  for (const m of ms) extLoad[m.ext] = (extLoad[m.ext] || 0) + 1;
  const loads = XPOOL.map((x) => extLoad[x.id] || 0);
  if (Math.max(...loads) - Math.min(...loads) <= 1) ok('interlock pool load spreads within 1 across external teams');
  else fail('interlock pool load uneven: ' + JSON.stringify(extLoad));
  const split = {};
  for (const m of ms) { split[m.home] = split[m.home] || { h: 0, a: 0 }; split[m.home][m.is_home ? 'h' : 'a']++; }
  if (ids(4, 'M').every((id) => split[id].h === 1 && split[id].a === 1)) ok('half home, half away honored exactly (k=2, ratio 0.5)');
  else fail('home/away split broken: ' + JSON.stringify(split));
  if (ms.every((m) => m.ext_interlock && m.league)) ok('interlock matchups carry the opposing league name');
  else fail('interlock matchup missing league');
}
{
  const allHome = GEN.extInterlockMatchups(ids(3, 'M'), XPOOL, 3, 1, GEN.rng(2));
  const allAway = GEN.extInterlockMatchups(ids(3, 'M'), XPOOL, 3, 0, GEN.rng(2));
  if (allHome.every((m) => m.is_home) && allAway.every((m) => !m.is_home)) ok('all-home and all-away ratios honored');
  else fail('ratio 1/0 not honored');
  const half = GEN.extInterlockMatchups(ids(4, 'M'), XPOOL, 4, 0.5, GEN.rng(2));
  const s2 = {};
  for (const m of half) { s2[m.home] = s2[m.home] || { h: 0, a: 0 }; s2[m.home][m.is_home ? 'h' : 'a']++; }
  if (ids(4, 'M').every((id) => s2[id].h === 2 && s2[id].a === 2)) ok('k=4 ratio 0.5 gives every team exactly 2 home, 2 away');
  else fail('k=4 split broken: ' + JSON.stringify(s2));
}

section('season generator: placement');
const GT = {
  teams: [].concat(
    ids(4, 'M').map((id) => ({ id, name: 'Team ' + id, division: 'Majors BB', is_active: true })),
    ids(4, 'N').map((id) => ({ id, name: 'Team ' + id, division: 'Minors BB', is_active: true }))
  ),
  fields: [
    { id: 'F1', name: 'Field One', divisions: [], is_active: true },
    { id: 'F2', name: 'Field Two', divisions: [], is_active: true },
  ],
  slots: [],
  games: [],
};
const GCFG = {
  season_id: 'sn1',
  start_date: '2026-09-08',
  end_date: '2026-10-31',
  seed: 1,
  blackouts: [{ label: 'Test blackout', start: '2026-09-19', end: '2026-09-20' }],
  divisions: {
    'Majors BB': { games_per_team: 6, game_minutes: 120, days: { sat: ['10:00', '12:30', '15:00'], tue: ['17:30'] }, fields: ['F1', 'F2'] },
    'Minors BB': { games_per_team: 6, game_minutes: 90, days: { sat: ['10:00', '12:30'], thu: ['17:30'] }, fields: ['F1', 'F2'] },
  },
  crossovers: [{ a: 'Majors BB', b: 'Minors BB', games_per_team: 2 }],
};
{
  const res = GEN.generate(GCFG, GT);
  // 4 teams x 6 games / 2 = 12 per division + 8 crossover = 32 matchups total.
  if (res.games.length + res.unplaced.length === 32) ok('placed + unplaced accounts for every matchup (32), nothing silently dropped');
  else fail('matchup accounting broken: placed=' + res.games.length + ' unplaced=' + res.unplaced.length);
  // Legacy configs stored crossover a/b rules under "interlocks": still honored.
  const legacy = GEN.generate({ ...GCFG, crossovers: [], interlocks: GCFG.crossovers }, GT);
  if (JSON.stringify(legacy.games) === JSON.stringify(res.games)) ok('legacy a/b rules under "interlocks" still generate the same crossover schedule');
  else fail('legacy crossover config path broken');
  if (res.games.length === 32 && res.unplaced.length === 0) ok('roomy config places everything (32 games, 0 unplaced)');
  else fail('roomy config left games unplaced: ' + JSON.stringify(res.unplaced));
  // No conflicts in the placed output: re-run gameConflicts on each game vs the rest.
  let confl = 0;
  for (const g of res.games) {
    const others = res.games.filter((x) => x !== g);
    const tagged = { ...g, id: 'self' };
    if (FLM.gameConflicts(tagged, { games: others, slots: GT.slots, teams: GT.teams, fields: GT.fields }).length) confl++;
  }
  if (confl === 0) ok('zero conflicts in placed output (field, double-header, practice, eligibility)');
  else fail(confl + ' placed games conflict');
  if (res.games.every((g) => g.game_date < '2026-09-19' || g.game_date > '2026-09-20')) ok('blackout dates are respected');
  else fail('a game landed on a blackout date');
  if (res.games.every((g) => g.status === 'draft')) ok('generated games are all drafts');
  else fail('generator emitted a non-draft game');
  if (res.games.every((g) => g.game_date >= GCFG.start_date && g.game_date <= GCFG.end_date)) ok('all games inside the season window');
  else fail('game outside season window');
  // Allowed-days check: Majors only Tue/Sat, Minors only Thu/Sat.
  const dayOk = res.games.every((g) => {
    const dow = new Date(g.game_date + 'T12:00:00').getDay();
    const div = GT.teams.find((t) => t.id === g.home_team_id).division;
    return div === 'Majors BB' ? (dow === 2 || dow === 6) : (dow === 4 || dow === 6);
  });
  if (dayOk) ok('every game sits on an allowed day for its home division');
  else fail('game on a non-configured day');
  // Determinism + reshuffle.
  const res2 = GEN.generate(GCFG, GT);
  if (JSON.stringify(res2.games) === JSON.stringify(res.games)) ok('same seed reproduces the same schedule');
  else fail('same seed gave a different schedule');
  const res3 = GEN.generate({ ...GCFG, seed: 99 }, GT);
  if (JSON.stringify(res3.games) !== JSON.stringify(res.games)) ok('new seed gives a fresh arrangement');
  else fail('new seed did not change the arrangement');
  // Stats summary sanity.
  if (res.stats.total === 32 && res.stats.perTeam['M0'] && res.stats.perTeam['M0'].games === 8) ok('stats: per-team totals include division + interlock games (8 each)');
  else fail('stats wrong: ' + JSON.stringify(res.stats.perTeam));
}
// Practice slots block placement: a slot on F1 every Saturday window forces games elsewhere.
{
  const slotted = {
    ...GT,
    slots: ['sat_9_11', 'sat_11_1', 'sat_1_3', 'sat_3_5'].map((k, i) => ({ id: 'S' + i, season_id: 'sn1', field_id: 'F1', day_key: k, team_id: null, label: 'Practice' })),
  };
  const res = GEN.generate(GCFG, slotted);
  const onF1Sat = res.games.filter((g) => g.field_id === 'F1' && new Date(g.game_date + 'T12:00:00').getDay() === 6);
  if (onF1Sat.length === 0) ok('practice slots block Saturday games on that field');
  else fail(onF1Sat.length + ' games placed over practice slots');
}
// Impossible config: 1 field, one Saturday wave, 2-week window -> most games unplaced, none conflicting.
{
  const tight = {
    ...GCFG,
    start_date: '2026-09-08',
    end_date: '2026-09-21',
    blackouts: [],
    divisions: {
      'Majors BB': { games_per_team: 6, game_minutes: 120, days: { sat: ['10:00'] }, fields: ['F1'] },
    },
    interlocks: [],
  };
  const res = GEN.generate(tight, GT);
  // 12 matchups but only 2 usable Saturday slots exist in the window.
  if (res.games.length === 2 && res.unplaced.length === 10) ok('impossible config: 2 placed, 10 land on the unplaced list (never dropped, never forced)');
  else fail('impossible config handling wrong: placed=' + res.games.length + ' unplaced=' + res.unplaced.length);
  if (res.unplaced.every((u) => u.reason && u.home_team_id && u.away_team_id)) ok('unplaced entries carry teams and a plain-English reason');
  else fail('unplaced entries missing detail');
}
// Interlock generation (Mode B): our division plays a pool from other leagues.
section('season generator: interlock (other leagues)');
{
  const XGT = {
    ...GT,
    ext_teams: [
      { id: 'XA1', league_name: 'Auburn LL', team_name: 'Storm', division: 'Majors BB' },
      { id: 'XA2', league_name: 'Auburn LL', team_name: 'Thunder', division: 'Majors BB' },
      { id: 'XK1', league_name: 'Kent LL', team_name: 'Rapids', division: 'Majors BB' },
      { id: 'XK2', league_name: 'Kent LL', team_name: 'River Hawks', division: 'TBall' },
    ],
  };
  const cfg = {
    ...GCFG,
    crossovers: [],
    divisions: { 'Majors BB': GCFG.divisions['Majors BB'] },
    interlocks: [{ division: 'Majors BB', leagues: ['Auburn LL', 'Kent LL'], ext_division: 'Majors BB', games_per_team: 2, home_ratio: 0.5 }],
  };
  const res = GEN.generate(cfg, XGT);
  const il = res.games.filter((g) => g.ext_team_id);
  const ilUnplaced = res.unplaced.filter((u) => u.interlock);
  // 4 our teams x 2 interlock games = 8; the TBall team never enters the pool.
  if (il.length + ilUnplaced.length === 8) ok('every interlock matchup accounted for (8)');
  else fail('interlock accounting broken: placed=' + il.length + ' unplaced=' + ilUnplaced.length);
  if (il.every((g) => ['XA1', 'XA2', 'XK1'].includes(g.ext_team_id))) ok('pool respects the division filter (TBall team excluded)');
  else fail('wrong-division external team entered the pool');
  const xorOk = res.games.every((g) => ((g.away_team_id ? 1 : 0) + (g.ext_team_id ? 1 : 0) === 1) && ((g.field_id ? 1 : 0) + (g.venue_text ? 1 : 0) === 1));
  if (xorOk) ok('every generated game has exactly one opponent and exactly one venue');
  else fail('a generated game broke the exactly-one shape');
  const homes = il.filter((g) => g.field_id), aways = il.filter((g) => g.venue_text);
  if (homes.every((g) => ['F1', 'F2'].includes(g.field_id))) ok('home interlock games land on our eligible fields');
  else fail('home interlock game on an unknown field');
  const leagueOf = { XA1: 'Auburn LL', XA2: 'Auburn LL', XK1: 'Kent LL' };
  if (aways.length && aways.every((g) => g.venue_text === leagueOf[g.ext_team_id])) ok('away interlock games default their venue to the opposing league name');
  else fail('away venue default wrong: ' + JSON.stringify(aways.map((g) => g.venue_text)));
  const split = {};
  il.forEach((g) => { split[g.home_team_id] = split[g.home_team_id] || { h: 0, a: 0 }; split[g.home_team_id][g.field_id ? 'h' : 'a']++; });
  if (il.length === 8 && Object.values(split).every((s) => s.h === 1 && s.a === 1)) ok('placed interlock games honor the half home, half away split per team');
  else fail('placed split wrong: ' + JSON.stringify(split));
  // No conflicts in the combined output, interlock games included.
  let confl = 0;
  for (const g of res.games) {
    const others = res.games.filter((x) => x !== g);
    if (FLM.gameConflicts({ ...g, id: 'self' }, { games: others, slots: XGT.slots, teams: XGT.teams, fields: XGT.fields, ext_teams: XGT.ext_teams }).length) confl++;
  }
  if (confl === 0) ok('zero conflicts across division + interlock output (double-headers included)');
  else fail(confl + ' games conflict in interlock output');
  const st = res.stats.interlock;
  if (st && st.total === il.length && st.home === homes.length && st.away === aways.length) ok('stats carry a separate interlock block with the home/away split');
  else fail('interlock stats wrong: ' + JSON.stringify(st));
  if (res.games.every((g) => g.status === 'draft')) ok('interlock generation stays draft-first');
  else fail('interlock generation emitted a non-draft game');
}

// ------- 2. Portal hooks -------
section('fields/index.html: required hooks');
const indexHtml = fs.readFileSync(path.join(ROOT, 'fields', 'index.html'), 'utf8');
for (const s of ['Who are you, Coach?', 'Just browsing', 'id="announceBox"', 'id="myTeam"', 'src="flm-rules.js"', 'FLM_RULES.evaluate', 'FLM_RULES.describe', 'flm_browse', 'lsSet("flm_team"', 'data-view="sched"', 'id="viewSched"', 'gameChipHtml', 'openGameModal', 'mt-next', 'Next game: vs', 'FLM_RULES.gameDayKeys', 'extTeamById', 'function gameOpp', 'function gameVenue', 'gleague', 'Interlock game against']) {
  if (indexHtml.includes(s)) ok('contains: ' + s);
  else fail('MISSING: ' + s);
}

// ------- 2b. Hardened boot: legacy/corrupt state must never blank the page -------
section('fields/index.html: hardened boot');
for (const [s, why] of [
  ['function lsGet(k) { try { return localStorage.getItem(k); }', 'storage reads are try/catch guarded (Safari Block-all-cookies)'],
  ['typeof window.FLM_RULES === "undefined"', 'FLM_RULES fallback exists if flm-rules.js fails to load'],
  ['_bootTeam.charAt(0) === "{"', 'legacy JSON-shaped flm_team migrates to raw id'],
  ['if (S.myTeam && !teamById(S.myTeam)) { S.myTeam = ""; lsDel("flm_team"); }', 'stale team id is cleared, page acts like fresh visit'],
  ['el.classList.remove("hidden");', 'load() failure unhides #loading before writing the error'],
  ['source: "fields boot"', 'boot failures logged to flm_events as js_error'],
]) {
  if (indexHtml.includes(s)) ok(why);
  else fail('MISSING (' + why + '): ' + s);
}
if (!/var S = \{[^}]*localStorage\.getItem/.test(indexHtml)) ok('no raw localStorage access in boot state line');
else fail('boot state line still reads localStorage directly');

// ------- 2c. Phone app shell: bottom tab bar (one codebase, two experiences) -------
section('fields/index.html: phone tab shell');
for (const [s, why] of [
  ['id="tabBar"', 'bottom tab bar exists'],
  ['data-mtab="myteam"', 'My Team tab'],
  ['data-mtab="sched"', 'Schedule tab'],
  ['data-mtab="fields"', 'Fields tab'],
  ['data-mtab="alerts"', 'Alerts tab'],
  ['@media (max-width: 767px)', 'phone breakpoint present'],
  ['.tabbar { display: none; }', 'tab bar hidden on desktop by default'],
  ['env(safe-area-inset-bottom)', 'iOS safe-area inset respected'],
  ['id="urgentBanner"', 'urgent/warning banner element exists'],
  ['a.severity === "urgent" || a.severity === "warning"', 'banner filters to urgent and warning only'],
  ['id="alertsQuiet"', 'quiet state line when no announcements'],
  ['lsSet("flm_mtab"', 'tab choice remembered per device'],
  ['alerts-on', 'Alerts badge dot driven by announcement presence'],
  ['id="mtPrompt"', 'My Team tab prompts unidentified visitors to pick a team'],
  ['curTab() === "sched"', 'Schedule tab forces the schedule view on phones'],
]) {
  if (indexHtml.includes(s)) ok(why);
  else fail('MISSING (' + why + '): ' + s);
}
// New customer-facing copy stays clean: no em/en dashes in the shell strings.
for (const line of ['All quiet right now. No league announcements.', 'Pick your team to see your practices, your next game, and where you stand on the league guideline.']) {
  if (indexHtml.includes(line) && !/[—–]/.test(line)) ok('copy present and dash-free: ' + line.slice(0, 40) + '...');
  else fail('copy missing or dashed: ' + line);
}

// ------- 3. Admin hooks -------
section('fields/admin.html: required hooks');
const adminHtml = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
for (const s of ['Practice compliance', 'id="compGrid"', 'League announcements', 'id="anTitle"', 'id="anPost"', 'admin_announcement_email', 'preview: true', 'id="ruleWk"', 'id="ruleMonFri"', 'src="flm-rules.js"', 'Email all coaches', 'id="gSave"', 'admin_game', 'FLM_RULES.gameConflicts', 'data-gstatus', 'data-divs', 'Save this game anyway?']) {
  if (adminHtml.includes(s)) ok('contains: ' + s);
  else fail('MISSING: ' + s);
}

// ------- 3a. Interlock (other leagues) hooks: Mode A + opponents CRUD -------
section('fields/admin.html: interlock hooks');
for (const [s, why] of [
  ['Interlock opponents (other leagues)', 'external opponents panel exists'],
  ['id="xlAdd"', 'quick-add external team button'],
  ['admin_ext_team', 'ext team CRUD wired to the gateway'],
  ['data-xl-edit', 'ext team edit buttons'],
  ['data-xl-del', 'ext team delete buttons'],
  ['id="gOppMode"', 'Mode A opponent toggle (our league / another league)'],
  ['id="gExt"', 'Mode A interlock opponent picker'],
  ['id="gVenueMode"', 'Mode A venue toggle (our field / their field)'],
  ['id="gVenue"', 'Mode A external venue input'],
  ['Brannan Park, Auburn', 'external venue placeholder shows the expected style'],
  ['function gameOppName', 'opponent renderer handles both team kinds'],
  ['function gameVenueName', 'venue renderer handles both venue kinds'],
  ['chip il', 'interlock games visually tagged with the league'],
  ['Pick the opponent: one of our teams or an interlock team.', 'opponent validation copy'],
  ['Pick one of our fields or type in their venue.', 'venue validation copy'],
  ['Crossover (in-league', 'crossover section renamed and unmistakable'],
  ['Interlock (against other leagues', 'interlock section labeled by league meaning'],
  ['id="sgXlAdd"', 'interlock rule editor add button'],
  ['sgRenderCrossovers', 'crossover editor still renders'],
  ['cfg.crossovers', 'crossover rules stored under crossovers'],
  ['home_ratio', 'interlock rules carry the home/away split'],
  ['ext_teams: D.ext_teams', 'generation passes the external pool'],
  ['stats.interlock', 'review shows the interlock block separately'],
]) {
  if (adminHtml.includes(s)) ok(why);
  else fail('MISSING (' + why + '): ' + s);
}

// ------- 3b. Season generator panel (Phase 2) -------
section('fields/admin.html: season generator hooks');
for (const [s, why] of [
  ['src="flm-schedule-gen.js"', 'generator engine loaded'],
  ['Season generator', 'panel exists'],
  ['id="sgGen"', 'Generate button'],
  ['id="sgRegen"', 'Regenerate button (new shuffle seed)'],
  ['id="sgDiscard"', 'Discard drafts button'],
  ['id="sgPublish"', 'Publish button'],
  ['id="sgBoAdd"', 'blackout dates editor'],
  ['id="sgIlAdd"', 'crossover rules editor'],
  ['season_gen_config', 'config persisted in flm_settings'],
  ['admin_games_bulk', 'bulk gateway action wired'],
  ['op: "publish"', 'publish flips drafts via bulk op'],
  ['op: "discard"', 'discard removes drafts via bulk op'],
  ['FLM_GEN.generate', 'generation runs the shared engine'],
  ['FLM_GEN.summarize', 'review stats use the shared engine'],
  ['Publish " + drafts.length + " draft games', 'publish confirms with the draft count'],
  ['does not email or notify anyone', 'publish promises no auto-notification'],
  ['startEditGame', 'draft review reuses the P1 edit flow'],
  ['data-sgedit', 'per-game edit buttons in the week groups'],
  ['fetch(API + "?action=state", { headers: { "x-admin-pin": PIN } })', 'admin state carries the PIN so drafts are visible'],
  ['chip draft', 'drafts are visibly marked in the games list'],
]) {
  if (adminHtml.includes(s)) ok(why);
  else fail('MISSING (' + why + '): ' + s);
}
for (const [s, why] of [
  ['class="gweek"', 'portal schedule groups long lists under week headers'],
  ['Week of ', 'week header copy present'],
]) {
  if (indexHtml.includes(s)) ok(why);
  else fail('MISSING (' + why + '): ' + s);
}

for (const s of []) {
  if (adminHtml.includes(s)) ok('contains: ' + s);
  else fail('MISSING: ' + s);
}
if (!adminHtml.includes('anPost").addEventListener') || adminHtml.indexOf('admin_announcement_email') === adminHtml.lastIndexOf('admin_announcement_email')) {
  // posting handler exists and email path referenced more than once (preview + send)
  fail('post/email wiring looks incomplete');
} else {
  ok('posting and emailing are separate actions');
}

// ------- 3c. Season management (Phase 3): move suggestions, rainout, notes trail -------
section('season management: move suggestions');
{
  const res = GEN.generate(GCFG, GT);
  const games = res.games.map((g, i) => ({ ...g, id: 'G' + i, status: 'scheduled' }));
  const target = games.find((g) => g.field_id);
  const ctx = { games, slots: GT.slots, teams: GT.teams, fields: GT.fields, ext_teams: [] };
  const sugg = GEN.suggestSlots(target, GCFG, ctx, { limit: 10 });
  if (sugg.length > 0) ok('suggestSlots finds open slots for a placed game (' + sugg.length + ')');
  else fail('suggestSlots found nothing in a roomy season');
  let bad = 0;
  for (const s of sugg) {
    const g2 = { ...target, game_date: s.date, start_time: s.start, end_time: s.end, field_id: s.field_id, venue_text: null };
    if (FLM.gameConflicts(g2, { games: games.filter((g) => g.id !== target.id), slots: GT.slots, teams: GT.teams, fields: GT.fields, ext_teams: [] }).length) bad++;
  }
  if (bad === 0) ok('every suggestion is conflict-free against all other games and slots');
  else fail(bad + ' suggestions conflict');
  if (!sugg.some((s) => s.date === target.game_date && s.start === String(target.start_time).slice(0, 5) && s.field_id === target.field_id)) ok('the game\'s current slot is never suggested');
  else fail('suggested the slot the game already has');
  const sortedOk = sugg.every((s, i) => i === 0 || (sugg[i - 1].date + sugg[i - 1].start) <= (s.date + s.start));
  if (sortedOk) ok('suggestions come back in date order');
  else fail('suggestions out of order');
  if (sugg.every((s) => s.date < '2026-09-19' || s.date > '2026-09-20')) ok('suggestions respect blackout dates');
  else fail('a suggestion landed on a blackout date');
  const late = GEN.suggestSlots(target, GCFG, ctx, { limit: 10, min_date: '2026-10-01' });
  if (late.length && late.every((s) => s.date >= '2026-10-01')) ok('min_date keeps makeup suggestions in the future (' + late.length + ')');
  else fail('min_date not honored: ' + JSON.stringify(late.slice(0, 2)));
  if (GEN.suggestSlots(target, { ...GCFG, divisions: {} }, ctx, {}).length === 0) ok('no saved setup for the division -> no suggestions (manual fallback)');
  else fail('suggestions appeared without a division config');
  if (sugg.every((s) => s.field_id)) ok('suggestions always carry one of our fields');
  else fail('a suggestion had no field');
}

section('season management: bulk rainout targeting + notes trail');
{
  const mix = [
    { id: 'a', game_date: '2026-09-12', status: 'scheduled' },
    { id: 'b', game_date: '2026-09-12', status: 'draft' },
    { id: 'c', game_date: '2026-09-12', status: 'cancelled' },
    { id: 'd', game_date: '2026-09-12', status: 'postponed' },
    { id: 'e', game_date: '2026-09-12', status: 'completed' },
    { id: 'f', game_date: '2026-09-13', status: 'scheduled' },
  ];
  const t = FLM.bulkRainoutTargets(mix, '2026-09-12');
  if (t.length === 1 && t[0].id === 'a') ok('bulk rainout hits only scheduled games on the target date (skips draft, cancelled, postponed, completed, other days)');
  else fail('bulk rainout targeting broken: ' + JSON.stringify(t.map((x) => x.id)));
  if (FLM.bulkRainoutTargets(mix, '2026-09-14').length === 0) ok('a date with no scheduled games rains out nothing');
  else fail('phantom rainout targets');

  if (FLM.appendTrail('', 'Rained out Sat, Sep 12.') === 'Rained out Sat, Sep 12.') ok('appendTrail starts a trail on empty notes');
  else fail('appendTrail empty-notes broken');
  if (FLM.appendTrail('Bring water.', 'Rained out Sat, Sep 12.') === 'Bring water. Rained out Sat, Sep 12.') ok('appendTrail keeps existing notes and adds the sentence');
  else fail('appendTrail append broken');
  const once = FLM.appendTrail(FLM.appendTrail('x', 'Rained out Sat, Sep 12.'), 'Rained out Sat, Sep 12.');
  if ((once.match(/Rained out/g) || []).length === 1) ok('appendTrail never repeats the same sentence');
  else fail('appendTrail duplicated the sentence');
  if (FLM.appendTrail('y'.repeat(400), 'z').length <= 300) ok('appendTrail caps at the gateway 300-char notes limit');
  else fail('appendTrail over 300 chars');
}

// ------- 3d. iCal feed core (Phase 3): the exact file the flm-ics edge fn ships -------
section('ical feeds: ics-core.mjs');
const ICS = await import(pathToFileURL(path.join(ROOT, 'supabase', 'functions', 'flm-ics', 'ics-core.mjs')).href);
{
  const ictx = {
    teams: [
      { id: 'T1', name: 'Rally Cats', division: 'Majors BB' },
      { id: 'T2', name: 'Mudville Nine', division: 'Majors BB' },
      { id: 'T3', name: 'River Otters', division: 'Minors BB' },
    ],
    fields: [{ id: 'F1', name: 'Field One' }],
    ext_teams: [{ id: 'X1', league_name: 'Auburn LL', team_name: 'Storm' }],
  };
  const igames = [
    { id: 'g1', created_at: '2026-08-20T10:00:00Z', division: 'Majors BB', home_team_id: 'T1', away_team_id: 'T2', ext_team_id: null, field_id: 'F1', venue_text: null, game_date: '2026-09-12', start_time: '10:00:00', end_time: '12:00:00', status: 'scheduled', notes: 'Bring water, snacks; cleats' },
    { id: 'g2', created_at: '2026-08-20T10:00:00Z', division: 'Majors BB', home_team_id: 'T2', away_team_id: 'T1', ext_team_id: null, field_id: 'F1', venue_text: null, game_date: '2026-09-13', start_time: '10:00:00', end_time: '12:00:00', status: 'draft', notes: null },
    { id: 'g3', created_at: '2026-08-20T10:00:00Z', division: 'Majors BB', home_team_id: 'T1', away_team_id: null, ext_team_id: 'X1', field_id: null, venue_text: 'Brannan Park, Auburn', game_date: '2026-09-19', start_time: '12:30:00', end_time: '14:30:00', status: 'postponed', notes: null },
    { id: 'g4', created_at: '2026-08-20T10:00:00Z', division: 'Minors BB', home_team_id: 'T3', away_team_id: 'T1', ext_team_id: null, field_id: 'F1', venue_text: null, game_date: '2026-09-20', start_time: '09:00:00', end_time: '10:30:00', status: 'cancelled', notes: null },
  ];
  const league = ICS.filterGames(igames, {});
  if (league.length === 3 && league.every((g) => g.status !== 'draft')) ok('league feed: drafts excluded, everything else in');
  else fail('league filter broken: ' + league.length);
  const teamT2 = ICS.filterGames(igames, { team: 'T2' });
  if (teamT2.length === 1 && teamT2[0].id === 'g1') ok('team feed: home and away games for the team only, still no drafts');
  else fail('team filter broken: ' + JSON.stringify(teamT2.map((g) => g.id)));
  const minors = ICS.filterGames(igames, { division: 'Minors BB' });
  if (minors.length === 1 && minors[0].id === 'g4') ok('division feed filters by division');
  else fail('division filter broken');

  const ics = ICS.buildIcs(league, ictx, { name: 'Test league games', now: '2026-08-24T12:00:00Z' });
  if (ics.startsWith('BEGIN:VCALENDAR') && ics.trimEnd().endsWith('END:VCALENDAR')) ok('calendar opens and closes correctly');
  else fail('calendar envelope broken');
  const lines = ics.split('\r\n');
  if (lines.length > 10 && ics.includes('\r\n')) ok('CRLF line endings');
  else fail('missing CRLF');
  if (lines.every((l) => l.length <= 75)) ok('every line is 75 chars or less (RFC 5545 folding)');
  else fail('a line is longer than 75 chars');
  const begins = lines.filter((l) => l === 'BEGIN:VEVENT').length;
  const ends = lines.filter((l) => l === 'END:VEVENT').length;
  if (begins === 3 && ends === 3) ok('one VEVENT per published game (3), balanced');
  else fail('VEVENT count wrong: ' + begins + '/' + ends);
  if (ics.includes('UID:flm-g1@coachpilot.org')) ok('stable UID pattern flm-<game id>@coachpilot.org');
  else fail('UID missing');
  const moved = ICS.buildIcs([{ ...igames[0], game_date: '2026-10-03', start_time: '15:00:00', end_time: '17:00:00' }], ictx, { name: 'x' });
  if (moved.includes('UID:flm-g1@coachpilot.org') && moved.includes('DTSTART;TZID=America/Los_Angeles:20261003T150000')) ok('moving a game keeps its UID so calendars update in place');
  else fail('UID or DTSTART drifted after a move');
  if (ics.includes('POSTPONED: Rally Cats vs Storm (Auburn LL)')) ok('postponed games get the POSTPONED: prefix with the interlock opponent named');
  else fail('POSTPONED prefix missing');
  if (ics.includes('CANCELLED: River Otters vs Rally Cats') && ics.includes('STATUS:CANCELLED')) ok('cancelled games are prefixed and STATUS:CANCELLED');
  else fail('cancelled handling broken');
  if (ics.includes('LOCATION:Field One') && ics.includes('LOCATION:Brannan Park\\, Auburn')) ok('LOCATION is the field name at home and the escaped venue text away');
  else fail('LOCATION handling broken');
  if (ics.includes('Bring water\\, snacks\\; cleats')) ok('commas and semicolons in notes are escaped');
  else fail('text escaping broken');
  if (ics.includes('REFRESH-INTERVAL;VALUE=DURATION:PT1H') && ics.includes('X-PUBLISHED-TTL:PT1H')) ok('refresh interval hints present');
  else fail('refresh hints missing');
  if (ics.includes('BEGIN:VTIMEZONE') && ics.includes('TZID:America/Los_Angeles')) ok('Pacific VTIMEZONE embedded');
  else fail('VTIMEZONE missing');
  if (ICS.escapeText('a,b;c\nd\\e') === 'a\\,b\\;c\\nd\\\\e') ok('escapeText handles comma, semicolon, newline, backslash');
  else fail('escapeText broken: ' + ICS.escapeText('a,b;c\nd\\e'));
  const longLine = ICS.foldLine('SUMMARY:' + 'x'.repeat(200));
  if (longLine.split('\r\n').every((l, i) => l.length <= 75 && (i === 0 || l.startsWith(' ')))) ok('foldLine wraps long lines with continuation spaces');
  else fail('foldLine broken');
}

// ------- 3e. Phase 3 UI hooks -------
section('fields/admin.html: season board hooks');
{
  const adminSrc = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
  const hooks = ['id="bdWeeks"', 'id="bdTray"', 'id="bdRainDay"', 'id="bdRainDate"', 'FLM_GEN.suggestSlots', 'FLM_RULES.bulkRainoutTargets', 'FLM_RULES.appendTrail', 'draggable="true"', 'Find makeup slot', 'Rain out', 'Set the real park', 'op: "rainout"'];
  const missing = hooks.filter((h) => !adminSrc.includes(h));
  if (missing.length === 0) ok('board, tray, rainout, makeup, drag, and real-park hooks all present');
  else fail('missing admin hooks: ' + missing.join(', '));
  const offer = adminSrc.slice(adminSrc.indexOf('function bdOfferAnnouncement'), adminSrc.indexOf('function bdSaveMove'));
  if (offer.length > 0 && !offer.includes('admin(')) ok('announcement offer only prefills the composer: it never posts or emails');
  else fail('bdOfferAnnouncement looks like it calls the gateway');
}
section('fields/index.html: calendar feed hooks');
{
  const portalSrc = fs.readFileSync(path.join(ROOT, 'fields', 'index.html'), 'utf8');
  const hooks = ['/fields/ics/', 'webcal://', 'data-copycal', 'id="schedCal"', 'mt-cal', 'Add to calendar'];
  const missing = hooks.filter((h) => !portalSrc.includes(h));
  if (missing.length === 0) ok('My Team and Schedule calendar feed hooks present');
  else fail('missing portal hooks: ' + missing.join(', '));
  if (portalSrc.includes('gstatus.postponed')) ok('postponed status style still present on the portal');
  else fail('postponed status style missing');
}

// ------- 4. New file copy rules -------
section('flm-rules.js + flm-schedule-gen.js + ics files: no em/en dashes or curly quotes');
const rulesSrc = fs.readFileSync(path.join(ROOT, 'fields', 'flm-rules.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'fields', 'flm-schedule-gen.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-ics', 'ics-core.mjs'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-ics', 'index.ts'), 'utf8');
let charHits = 0;
for (const [ch, name] of Object.entries({ '—': 'em-dash', '–': 'en-dash', '’': 'curly-apos', '“': 'curly-quote-l', '”': 'curly-quote-r' })) {
  if (rulesSrc.includes(ch)) { fail('found ' + name); charHits++; }
}
if (charHits === 0) ok('clean');

// ------- 5. Live gateway (read-only) -------
section('gateway: live read-only checks');
try {
  const r = await fetch(GATEWAY + '?action=state');
  const d = await r.json();
  if (r.ok && d.ok) ok('state returns ok');
  else fail('state failed: ' + r.status);
  if (Array.isArray(d.announcements)) ok('state includes announcements array');
  else fail('state missing announcements');
  if (d.settings && d.settings.practice_rules && FLM.parse(d.settings.practice_rules)) {
    const live = FLM.parse(d.settings.practice_rules);
    ok('live practice_rules parses: ' + FLM.describe(live));
  } else fail('state missing practice_rules');
  if (d.settings && d.settings.admin_pin === undefined) ok('admin_pin not leaked in state');
  else fail('admin_pin leaked in state!');
  if (Array.isArray(d.games)) ok('state includes games array');
  else fail('state missing games');
  if (Array.isArray(d.ext_teams)) ok('state includes ext_teams array (interlock opponents)');
  else fail('state missing ext_teams');
  if (Array.isArray(d.fields) && d.fields.length && Array.isArray(d.fields[0].divisions)) ok('fields carry a divisions tag list');
  else fail('fields missing divisions');
} catch (e) {
  fail('state threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=admin_announcements');
  if (r.status === 401) ok('admin_announcements without PIN rejected 401');
  else fail('admin_announcements without PIN should be 401, got ' + r.status);
} catch (e) {
  fail('admin auth test threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=admin_announcement_email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'x' }) });
  if (r.status === 401) ok('announcement email without PIN rejected 401');
  else fail('announcement email without PIN should be 401, got ' + r.status);
} catch (e) {
  fail('email auth test threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=admin_game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  if (r.status === 401) ok('admin_game without PIN rejected 401');
  else fail('admin_game without PIN should be 401, got ' + r.status);
} catch (e) {
  fail('admin_game auth test threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=admin_games_bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'publish' }) });
  if (r.status === 401) ok('admin_games_bulk without PIN rejected 401');
  else fail('admin_games_bulk without PIN should be 401, got ' + r.status);
} catch (e) {
  fail('admin_games_bulk auth test threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=admin_ext_team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ league_name: 'X', team_name: 'Y' }) });
  if (r.status === 401) ok('admin_ext_team without PIN rejected 401');
  else fail('admin_ext_team without PIN should be 401, got ' + r.status);
} catch (e) {
  fail('admin_ext_team auth test threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=state');
  const d = await r.json();
  if ((d.games || []).every((g) => g.status !== 'draft')) ok('public state never returns draft games');
  else fail('public state leaked a draft game!');
} catch (e) {
  fail('draft leak test threw: ' + e.message);
}
// Live iCal feed (public, read-only): the flm-ics edge function answers with a
// parseable calendar and never a draft game.
try {
  const r = await fetch('https://geigvuysptjvvqanumld.supabase.co/functions/v1/flm-ics/league.ics');
  const body = await r.text();
  if (r.ok && (r.headers.get('content-type') || '').includes('text/calendar')) ok('live flm-ics league feed answers with text/calendar');
  else fail('live flm-ics feed broken: ' + r.status + ' ' + r.headers.get('content-type'));
  if (body.startsWith('BEGIN:VCALENDAR') && body.includes('END:VCALENDAR')) ok('live feed is a well-formed calendar');
  else fail('live feed body malformed');
  if ((r.headers.get('cache-control') || '').includes('max-age')) ok('live feed sends cache headers');
  else fail('live feed missing cache headers');
} catch (e) {
  fail('live flm-ics test threw: ' + e.message);
}

// ------- Report -------
console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
process.exit(failed === 0 ? 0 : 1);
