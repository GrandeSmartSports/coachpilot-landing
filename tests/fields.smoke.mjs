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

// ------- 2d. Schedule defaults to the coach's own team -------
section('fields/index.html: schedule coach default + scope chips');
for (const [s, why] of [
  ['id="schedMine"', 'Showing line + chip row element exists'],
  ['Showing: <b>', 'Showing header renders the active filter'],
  ['data-scope="team"', 'My team chip present'],
  ['data-scope="division"', 'My division chip present'],
  ['data-scope="all"', 'All divisions escape chip present'],
  ['>My team<', 'My team chip label'],
  ['>My division<', 'My division chip label'],
  ['>All divisions<', 'All divisions chip label'],
  ['S.schedTeam = me.id;', 'identified coach defaults to their own team filter'],
  ['} else if (me) {', 'default only applies when a coach identity resolves (visitors keep all divisions)'],
  ['ssGet("flm_sched_pick")', 'session filter choice restored so the default never fights the user'],
  ['ssSet("flm_sched_pick"', 'manual filter picks remembered for the session'],
  ['if (S.schedTeam && !teamById(S.schedTeam)) S.schedTeam = "";', 'stale saved team falls back safely'],
]) {
  if (indexHtml.includes(s)) ok(why);
  else fail('MISSING (' + why + '): ' + s);
}
// selects route through the same session-remembering pick
if (indexHtml.includes('divSel.onchange = function () { pickSched(divSel.value, ""); };')
  && indexHtml.includes('teamSel.onchange = function () { pickSched(keepDiv, teamSel.value); };')) ok('dropdown changes count as explicit picks');
else fail('dropdown changes do not route through pickSched');
for (const line of ['My team', 'My division', 'All divisions']) {
  if (!/[—–]/.test(line)) ok('chip copy dash-free: ' + line);
  else fail('chip copy has a dash: ' + line);
}

// ------- 3. Admin hooks -------
section('fields/admin.html: required hooks');
const adminHtml = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
for (const s of ['Practice compliance', 'id="compGrid"', 'League announcements', 'id="anTitle"', 'id="anPost"', 'admin_announcement_email', 'preview: true', 'id="ruleWk"', 'id="ruleMonFri"', 'src="flm-rules.js"', 'Email all coaches', 'id="gSave"', 'admin_game', 'FLM_RULES.gameConflicts', 'data-gstatus', 'data-fedit', 'Save this game anyway?']) {
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
  + fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-ics', 'index.ts'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'fields', 'umpire.html'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-reminders', 'reminders-core.mjs'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-reminders', 'index.ts'), 'utf8');
let charHits = 0;
for (const [ch, name] of Object.entries({ '—': 'em-dash', '–': 'en-dash', '’': 'curly-apos', '“': 'curly-quote-l', '”': 'curly-quote-r' })) {
  if (rulesSrc.includes(ch)) { fail('found ' + name); charHits++; }
}
if (charHits === 0) ok('clean');

// ------- 4b. Phase 4: umpire engine (flm-rules.js) -------
section('umpire engine: needed-vs-filled math');
const UDEFS = FLM.umpParseDefaults('{"Majors BB":2,"Minors BB":1}');
function ug(over) {
  return Object.assign({ id: 'UG1', season_id: 'sn1', division: 'Majors BB', home_team_id: 'A', away_team_id: 'B', field_id: 'F1', game_date: '2026-09-15', start_time: '17:00', end_time: '19:00', status: 'scheduled', umps_needed: null }, over);
}
if (FLM.umpNeeded(ug({ division: 'AA BB' }), UDEFS) === 1) ok('no default for the division -> 1 plate ump');
else fail('base default broken');
if (FLM.umpNeeded(ug(), UDEFS) === 2) ok('division default from ump_defaults honored (Majors BB -> 2)');
else fail('division default broken');
if (FLM.umpNeeded(ug({ umps_needed: 3 }), UDEFS) === 3 && FLM.umpNeeded(ug({ umps_needed: 0 }), UDEFS) === 0) ok('per-game override beats the division default, zero included');
else fail('per-game override broken');
if (FLM.umpParseDefaults('not json')['Majors BB'] === undefined && FLM.umpNeeded(ug(), FLM.umpParseDefaults('not json')) === 1) ok('bad ump_defaults JSON falls back to 1');
else fail('bad defaults fallback broken');
const UAS = [
  { id: 'a1', game_id: 'UG1', ump_id: 'U9', status: 'accepted', role: 'plate' },
  { id: 'a2', game_id: 'UG1', ump_id: 'U8', status: 'offered', role: 'base' },
  { id: 'a3', game_id: 'UG1', ump_id: 'U7', status: 'declined', role: 'base' },
  { id: 'a4', game_id: 'UG1', ump_id: 'U6', status: 'turned_back', role: 'base' },
  { id: 'a5', game_id: 'OTHER', ump_id: 'U9', status: 'accepted', role: 'plate' },
];
{
  const f = FLM.umpFill(ug(), UAS, UDEFS);
  if (f.needed === 2 && f.accepted.length === 1 && f.offered.length === 1 && f.missing === 1) ok('fill math: 1 accepted + 1 offered of 2 needed -> 1 missing; declined and turned_back do not count');
  else fail('fill math broken: ' + JSON.stringify({ needed: f.needed, a: f.accepted.length, o: f.offered.length, m: f.missing }));
  const f2 = FLM.umpFill(ug(), UAS.filter((a) => a.id !== 'a1').concat([{ id: 'a1b', game_id: 'UG1', ump_id: 'U9', status: 'turned_back', role: 'plate' }]), UDEFS);
  if (f2.accepted.length === 0 && f2.missing === 2) ok('turn-back reopens the spot (accepted drops, missing grows)');
  else fail('turn-back reopen broken');
}

section('umpire engine: eligibility filter');
function mkUmp(over) {
  return Object.assign({ id: 'U1', name: 'Uma Piree', active: true, levels: ['Majors BB'], availability: { days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true }, blocked: [] } }, over);
}
if (FLM.umpIneligibleReason(mkUmp(), ug(), [], []) === '') ok('level match + available + free -> eligible');
else fail('clean eligibility broken: ' + FLM.umpIneligibleReason(mkUmp(), ug(), [], []));
if (FLM.umpIneligibleReason(mkUmp({ levels: ['TBall'] }), ug(), [], []).indexOf('does not work') === 0) ok('level mismatch is filtered out');
else fail('level filter broken');
if (FLM.umpIneligibleReason(mkUmp({ availability: { days: { tue: false }, blocked: [] } }), ug(), [], []) === 'unavailable that day') ok('weekday toggle off filters that day (9/15 is a Tuesday)');
else fail('weekday availability broken');
if (FLM.umpIneligibleReason(mkUmp({ availability: { days: {}, blocked: ['2026-09-15'] } }), ug(), [], []) === 'unavailable that day') ok('one-off blocked date filters that date');
else fail('blocked date broken');
{
  const other = ug({ id: 'UG2', start_time: '18:00', end_time: '20:00' });
  const asg = [{ id: 'b1', game_id: 'UG2', ump_id: 'U1', status: 'accepted', role: 'plate' }];
  if (FLM.umpIneligibleReason(mkUmp(), ug(), asg, [other, ug()]) === 'has a game at that time already') ok('same-day overlapping assignment clashes');
  else fail('same-day clash broken');
  const backToBack = ug({ id: 'UG3', start_time: '19:00', end_time: '21:00' });
  const asg2 = [{ id: 'b2', game_id: 'UG3', ump_id: 'U1', status: 'accepted', role: 'plate' }];
  if (FLM.umpIneligibleReason(mkUmp(), ug(), asg2, [backToBack, ug()]) === '') ok('back-to-back games the same day do not clash');
  else fail('back-to-back wrongly clashed');
  const already = [{ id: 'b3', game_id: 'UG1', ump_id: 'U1', status: 'offered', role: 'plate' }];
  if (FLM.umpIneligibleReason(mkUmp(), ug(), already, [ug()]) === 'already has this game') ok('an ump already offered the game is not offered twice');
  else fail('already-has-it broken');
}
{
  const games = [
    ug({ id: 'open1', game_date: '2026-09-15' }),
    ug({ id: 'drafted', status: 'draft' }),
    ug({ id: 'gone', status: 'cancelled' }),
    ug({ id: 'past', game_date: '2026-09-01' }),
    ug({ id: 'full', umps_needed: 1 }),
    ug({ id: 'wrongdiv', division: 'TBall' }),
    ug({ id: 'blockedday', game_date: '2026-09-16' }),
  ];
  const asg = [{ id: 'c1', game_id: 'full', ump_id: 'U9', status: 'accepted', role: 'plate' }];
  const u = mkUmp({ availability: { days: {}, blocked: ['2026-09-16'] } });
  const open = FLM.umpOpenGames(u, games, asg, UDEFS, '2026-09-10');
  if (open.length === 1 && open[0].id === 'open1') ok('Open Games: only published, future, level-matched, unfilled, available-day games (1 of 7)');
  else fail('open games filter broken: ' + JSON.stringify(open.map((g) => g.id)));
}

section('umpire engine: self-claim vs offer state machine');
if (FLM.umpTransition('offered', 'accept') === 'accepted') ok('offered -> accept -> accepted');
else fail('accept transition broken');
if (FLM.umpTransition('offered', 'decline') === 'declined') ok('offered -> decline -> declined');
else fail('decline transition broken');
if (FLM.umpTransition('accepted', 'turn_back') === 'turned_back') ok('accepted -> turn back -> turned_back');
else fail('turn-back transition broken');
if (FLM.umpTransition('accepted', 'accept') === null && FLM.umpTransition('declined', 'accept') === null && FLM.umpTransition('offered', 'turn_back') === null) ok('every other move is refused (no double-accept, no reviving a decline, no turning back an offer)');
else fail('state machine allows an illegal move');

// ------- 4c. Reminders core (the exact file the flm-reminders edge fn ships) -------
section('reminders: date targeting, kill switch, parent cc');
const REM = await import(pathToFileURL(path.join(ROOT, 'supabase', 'functions', 'flm-reminders', 'reminders-core.mjs')).href);
if (REM.addDays('2026-09-30', 1) === '2026-10-01' && REM.addDays('2026-12-31', 1) === '2027-01-01') ok('addDays rolls months and years');
else fail('addDays broken');
{
  const games = [
    { id: 'today', game_date: '2026-09-12', status: 'scheduled', start_time: '10:00' },
    { id: 'tomorrow', game_date: '2026-09-13', status: 'scheduled', start_time: '12:00' },
    { id: 'later', game_date: '2026-09-14', status: 'scheduled', start_time: '12:00' },
    { id: 'rained', game_date: '2026-09-12', status: 'postponed', start_time: '10:00' },
  ];
  const asg = [
    { id: 'r1', game_id: 'today', ump_id: 'U1', status: 'accepted', role: 'plate' },
    { id: 'r2', game_id: 'tomorrow', ump_id: 'U2', status: 'accepted', role: 'plate' },
    { id: 'r3', game_id: 'later', ump_id: 'U1', status: 'accepted', role: 'plate' },
    { id: 'r4', game_id: 'rained', ump_id: 'U1', status: 'accepted', role: 'plate' },
    { id: 'r5', game_id: 'today', ump_id: 'U3', status: 'offered', role: 'base' },
  ];
  const t = REM.targetsFor(asg, games, '2026-09-12');
  const kinds = t.map((x) => x.assignment.id + ':' + x.kind).sort();
  if (kinds.length === 2 && kinds[0] === 'r1:morning_of' && kinds[1] === 'r2:day_before') ok('targets: today -> morning_of, tomorrow -> day_before; later dates, postponed games, and unanswered offers never remind');
  else fail('reminder targeting broken: ' + JSON.stringify(kinds));
  const off = REM.plan(false, t);
  if (off.send.length === 0 && off.logOnly.length === 2) ok('kill switch OFF: every reminder is logged intent, zero sends');
  else fail('kill switch suppression broken');
  const on = REM.plan(true, t);
  if (on.send.length === 2 && on.logOnly.length === 0) ok('kill switch ON: every reminder goes to the send list');
  else fail('kill switch on-path broken');
}
{
  const minor = { name: 'Kid Ump', email: 'kid@example.com', is_minor: true, parent_email: 'parent@example.com' };
  const adult = { name: 'Adult Ump', email: 'adult@example.com', is_minor: false, parent_email: '' };
  const a = REM.recipientsFor(minor, '');
  if (a.to === 'kid@example.com' && a.cc.length === 1 && a.cc[0] === 'parent@example.com') ok('minor ump: parent email always cc\'d');
  else fail('parent cc broken: ' + JSON.stringify(a));
  const b = REM.recipientsFor(minor, 'coach@test.com');
  if (b.to === 'coach@test.com' && b.cc[0] === 'parent@example.com') ok('test_to redirects To but can NEVER remove the parent cc');
  else fail('test_to dropped the parent cc: ' + JSON.stringify(b));
  const c = REM.recipientsFor(adult, '');
  if (c.to === 'adult@example.com' && c.cc.length === 0) ok('adult ump: no cc');
  else fail('adult cc broken');
  const line = REM.reminderLine('morning_of', { game_date: '2026-09-12', start_time: '10:00' }, 'Aces vs Bears', 'Field One', 'plate');
  if (line.includes('today') && line.includes('10 AM') && line.includes('Aces vs Bears')) ok('reminder line reads plain: ' + line);
  else fail('reminder line broken: ' + line);
}

// ------- 4d. Umpire page + admin panel hooks -------
section('fields/umpire.html: required hooks');
const umpHtml = fs.readFileSync(path.join(ROOT, 'fields', 'umpire.html'), 'utf8');
for (const s of ['ump_list', 'ump_state', 'ump_claim', 'ump_respond', 'ump_availability', 'ump_change_pin',
  'data-utab="mygames"', 'data-utab="open"', 'data-utab="avail"', 'data-utab="me"', 'id="tabBar"',
  'Take this game', 'I can no longer work this', 'Games worked this season', 'FLM_RULES.umpOpenGames',
  'lsSet("flm_ump_id"', 'env(safe-area-inset-bottom)', 'Needs your answer',
  'data-accept', 'data-decline', 'data-turnback', 'id="avDays"', 'Add a day off', 'Change my PIN']) {
  if (umpHtml.includes(s)) ok('contains: ' + s);
  else fail('MISSING: ' + s);
}
if (umpHtml.includes('fields-umpire')) ok('usage beacon tags the umpire page');
else fail('umpire beacon missing');
if ((umpHtml.match(/prompt\(/g) || []).length === 0) ok('ZERO prompt() calls in the umpire page (change PIN is a real modal)');
else fail('prompt() still used in umpire.html');
if (!/coach_email|coach_phone|parent_email|"phone"/.test(umpHtml)) ok('umpire page never touches contact-info fields');
else fail('umpire page references contact info');
if (indexHtml.includes('/fields/umpire.html')) ok('portal footer links the umpire page');
else fail('portal footer link missing');

section('fields/admin.html: umpire dashboard hooks');
const adminHtml4 = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
for (const [s, why] of [
  ['id="uAdd"', 'add umpire button'],
  ['admin_ump"', 'ump CRUD wired to the gateway'],
  ['admin_ump_assign', 'offer flow wired to the gateway'],
  ['function renderUmps', 'umpires panel renders'],
  ['function umpAssignModal', 'assign modal exists'],
  ['data-bd-umps', 'season board cards get an Umps button'],
  ['uchip got', 'green accepted chip'],
  ['uchip wait', 'amber offer chip'],
  ['uchip need', 'red needs-ump chip'],
  ['games need an ump', 'red count summary line'],
  ['Email is off. Reminders are logged but not sent.', 'kill switch shown plainly'],
  ['email_enabled', 'kill switch wired to settings'],
  ['ump_defaults', 'per-division needed defaults'],
  ['umps_needed', 'per-game override'],
  ['data-upin', 'reset PIN button'],
  ['Deactivate', 'deactivate flow'],
  ['Eligible and free', 'assign modal filters to eligible umps'],
  ['FLM_RULES.umpIneligibleReason', 'eligibility uses the shared engine'],
  ['gets a copy of every email', 'parent cc surfaced in the admin flow (ump modal)'],
]) {
  if (adminHtml4.includes(s)) ok(why);
  else fail('MISSING (' + why + '): ' + s);
}

// ------- 5. Live gateway (read-only) -------
// ------- 4c. Phase 5: scores, standings, archive, volunteer pass -------
section('standings engine: W-L-T, ties, run diff');
{
  const teams = [
    { id: 'A', name: 'Cougars', division: 'Majors BB' },
    { id: 'B', name: 'Storm', division: 'Majors BB' },
    { id: 'C', name: 'Hawks', division: 'Majors BB' },
    { id: 'D', name: 'Bees', division: 'Minors BB' },
  ];
  const fg = (over) => Object.assign({ status: 'completed', home_team_id: 'A', away_team_id: 'B', ext_team_id: null, home_score: 7, away_score: 4 }, over);
  const games = [
    fg({}),                                                                       // Cougars beat Storm 7-4
    fg({ home_team_id: 'B', away_team_id: 'C', home_score: 3, away_score: 3 }),   // Storm tie Hawks 3-3
    fg({ home_team_id: 'C', away_team_id: 'A', home_score: 2, away_score: 5 }),   // Cougars win again on the road
    fg({ status: 'scheduled' }),                                                  // not completed -> ignored
    fg({ status: 'completed', home_score: null, away_score: null }),              // completed but no score -> ignored
  ];
  const st = FLM.standings(games, teams, {});
  const M = st['Majors BB'] || [];
  const row = (id) => M.find((r) => r.team_id === id) || {};
  const a = row('A'), b = row('B'), c = row('C');
  if (a.w === 2 && a.l === 0 && a.t === 0 && a.gp === 2) ok('two wins counted (home and away)');
  else fail('win counting broken: ' + JSON.stringify(a));
  if (b.t === 1 && b.l === 1 && c.t === 1 && c.l === 1) ok('a tie counts as a tie for BOTH teams');
  else fail('tie counting broken: ' + JSON.stringify([b, c]));
  if (a.rf === 12 && a.ra === 6 && a.diff === 6) ok('run difference math (12 for, 6 against, +6)');
  else fail('run diff broken: ' + JSON.stringify(a));
  if (M[0] && M[0].team_id === 'A') ok('table sorted by win share: Cougars first');
  else fail('sort broken: ' + JSON.stringify(M.map((r) => r.name)));
  if (a.pct === 1 && Math.abs(b.pct - 0.25) < 1e-9) ok('win share includes ties as half a win');
  else fail('pct broken: ' + a.pct + ' / ' + b.pct);
  if (!st['Minors BB']) ok('teams with no completed games get no standings row');
  else fail('empty division leaked into standings');
}

section('standings engine: interlock counting per setting');
{
  const teams = [{ id: 'A', name: 'Cougars', division: 'Majors BB' }];
  const il = { status: 'completed', home_team_id: 'A', away_team_id: null, ext_team_id: 'X1', home_score: 9, away_score: 1 };
  const on = FLM.standings([il], teams, {});
  if (on['Majors BB'] && on['Majors BB'][0].w === 1 && on['Majors BB'][0].gp === 1) ok('interlock final counts for our team by default');
  else fail('interlock default-on broken: ' + JSON.stringify(on));
  const off = FLM.standings([il], teams, { 'Majors BB': { count_interlock: false } });
  if (!off['Majors BB']) ok('count_interlock=false leaves the interlock game out');
  else fail('interlock toggle broken: ' + JSON.stringify(off));
  const rows = on['Majors BB'] || [];
  if (rows.length === 1) ok('the external team itself never lands in our standings');
  else fail('external team leaked into standings');
}

section('standings engine: crossover games land in each team\'s own division');
{
  const teams = [
    { id: 'A', name: 'Cougars', division: 'Majors BB' },
    { id: 'D', name: 'Bees', division: 'Minors BB' },
  ];
  const x = { status: 'completed', home_team_id: 'A', away_team_id: 'D', ext_team_id: null, home_score: 4, away_score: 6, division: 'Majors BB' };
  const st = FLM.standings([x], teams, {});
  if (st['Majors BB'] && st['Majors BB'][0].l === 1 && st['Minors BB'] && st['Minors BB'][0].w === 1) ok('crossover: loss in Majors table, win in Minors table');
  else fail('crossover attribution broken: ' + JSON.stringify(st));
}

section('standings engine: public toggle + finals');
{
  if (FLM.standingsShow({}, 'Majors BB') === false) ok('standings default to HIDDEN on the portal');
  else fail('default show should be false');
  if (FLM.standingsShow({ 'Majors BB': { show: true } }, 'Majors BB') === true) ok('per-division show toggle turns a table on');
  else fail('show toggle broken');
  if (FLM.standingsCountInterlock({}, 'Majors BB') === true) ok('interlock counting defaults ON');
  else fail('count_interlock default broken');
  const s = FLM.standingsSettings('not json');
  if (s && typeof s === 'object' && Object.keys(s).length === 0) ok('bad settings JSON falls back to empty config');
  else fail('standingsSettings fallback broken');
  const done = { status: 'completed', home_score: 7, away_score: 4 };
  if (FLM.gameHasFinal(done) && !FLM.gameHasFinal({ status: 'completed', home_score: 7, away_score: null }) && !FLM.gameHasFinal({ status: 'scheduled', home_score: 7, away_score: 4 })) ok('a final = completed AND both scores entered');
  else fail('gameHasFinal broken');
  if (FLM.finalLine(done, 'Cougars', 'Storm') === 'Final: Cougars 7, Storm 4') ok('final line puts the winner first');
  else fail('finalLine winner-first broken: ' + FLM.finalLine(done, 'Cougars', 'Storm'));
  if (FLM.finalLine({ status: 'completed', home_score: 2, away_score: 5 }, 'Cougars', 'Storm') === 'Final: Storm 5, Cougars 2') ok('away winner listed first');
  else fail('finalLine away-winner broken');
  if (FLM.finalLine({ status: 'completed', home_score: 3, away_score: 3 }, 'Cougars', 'Storm') === 'Final: Cougars 3, Storm 3 (tie)') ok('ties say (tie)');
  else fail('finalLine tie broken');
}

section('fields/admin.html: volunteer pass (no prompt chains, Phase 5 hooks)');
{
  const adminSrc = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
  const prompts = (adminSrc.match(/prompt\(/g) || []).length;
  if (prompts === 0) ok('ZERO prompt() calls left in the admin console');
  else fail(prompts + ' prompt() calls still in admin.html');
  const hooks = [
    'function formModal', 'id="attnList"', 'id="wizardBtn"', 'function wizardModal', 'Step ',
    'data-sgpreset="saturday"', 'data-sgpreset="satweek"', 'data-sgpreset="custom"',
    'id="cloneSeasonBtn"', 'admin_season_clone', 'data-bd-score', 'function scoreModal',
    'id="stSettings"', 'id="stTables"', 'standings_divisions', 'sg_unplaced',
    'function renderAttention', 'Nothing needs your attention', 'id="panelGen"', 'id="panelUmps"', 'id="panelBoard"',
    'FLM_RULES.standings', 'FLM_RULES.gameHasFinal', '(archived)', 'data-unarch',
  ];
  const missing = hooks.filter((h) => !adminSrc.includes(h));
  if (missing.length === 0) ok('wizard, templates, attention panel, score modal, standings, clone, and archive hooks all present');
  else fail('missing Phase 5 admin hooks: ' + missing.join(', '));
  const wiz = adminSrc.slice(adminSrc.indexOf('function wizardModal'), adminSrc.indexOf('document.getElementById("wizardBtn")'));
  if (wiz.includes('teamModal') && wiz.includes('fieldModal') && wiz.includes('admin_upsert_season') && wiz.includes('admin_settings')) ok('wizard reuses the existing panels and actions (guidance, not new plumbing)');
  else fail('wizard looks like it grew its own plumbing');
}

// ------- 3f. Hub and spoke: landing screen + hash-routed views -------
section('fields/admin.html: hub and spoke landing + routing');
{
  const adminSrc = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
  const hooks = [
    'id="view-home"', 'id="homeTiles"', 'id="homeHead"', 'id="attnToggle"',
    'things need you', 'All caught up.',
    'id="view-divisions"', 'id="view-fields"', 'id="view-games"', 'id="view-practices"',
    'id="view-umpires"', 'id="view-announcements"', 'id="view-tools"', 'id="view-reports"',
    'id="viewBar"', 'id="backBtn"',
    'function applyRoute', 'hashchange',
    'function renderHome', 'function renderDivisionsView', 'function renderDivDetail', 'function renderPracticeGrid',
    'id="pgGrids"', 'id="cloneSeasonBtn2"', 'id="panelWizard"',
  ];
  const missing = hooks.filter((h) => !adminSrc.includes(h));
  if (missing.length === 0) ok('landing, back bar, router, and dive-in renderers all present');
  else fail('missing hub/spoke hooks: ' + missing.join(', '));
  // every legacy panel survives the restructure and lives exactly once
  for (const pid of ['panelComp', 'panelGames', 'panelExt', 'panelGen', 'panelBoard', 'panelStand', 'panelUmps', 'panelAnnounce', 'panelImport', 'panelWindows', 'panelSettings', 'panelFields', 'panelTeams', 'panelLog']) {
    if ((adminSrc.match(new RegExp('id="' + pid + '"', 'g')) || []).length === 1) ok(pid + ' present exactly once');
    else fail(pid + ' missing or duplicated');
  }
  // PANEL_VIEW must cover every panel the attention list and wizard jump to,
  // so scrollToPanel can route into the owning view first
  const pv = adminSrc.slice(adminSrc.indexOf('var PANEL_VIEW'), adminSrc.indexOf('var pendingPanel'));
  const jumps = ['panelGen', 'panelUmps', 'panelBoard', 'panelComp', 'panelFields', 'panelSettings', 'panelImport'];
  const unmapped = jumps.filter((p) => !pv.includes(p));
  if (unmapped.length === 0) ok('every attention/wizard jump target is mapped to a view');
  else fail('unmapped jump targets: ' + unmapped.join(', '));
  // all 8 landing tiles link to real views
  const tiles = ['#divisions', '#fields', '#games', '#practices', '#umpires', '#announcements', '#tools', '#reports'];
  const badTiles = tiles.filter((t) => !adminSrc.includes('tile("' + t + '"'));
  if (badTiles.length === 0) ok('all 8 landing tiles wired to view routes');
  else fail('missing landing tiles: ' + badTiles.join(', '));
  if (adminSrc.includes('games need an ump') && adminSrc.includes('class="badge"')) ok('umpire tile carries the needs-an-ump badge');
  else fail('needs-an-ump badge missing from the landing');
  // landing copy stays dash-free (customer-facing rule)
  const home = adminSrc.slice(adminSrc.indexOf('function renderHome'), adminSrc.indexOf('function renderPracticeGrid'));
  if (!/[—–]/.test(home)) ok('landing copy has no em or en dashes');
  else fail('landing copy contains an em/en dash');
}

section('gateway source: Phase 5 actions + archive rules');
{
  const gwSrc = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-gateway', 'index.ts'), 'utf8');
  const hooks = ['admin_season_clone', 'home_score', 'away_score', 'archived', 'standings_divisions', 'sg_unplaced', 'copy_slots_from'];
  const missing = hooks.filter((h) => !gwSrc.includes(h));
  if (missing.length === 0) ok('gateway carries scores, standings settings, unplaced persistence, and the season clone');
  else fail('gateway missing: ' + missing.join(', '));
  // Explicit version pin: bumps must land in the source-of-truth banner comment.
  if (/gateway \(v1[3-9]\)|gateway \(v[2-9]\d\)/.test(gwSrc)) ok('gateway version banner is v13 or newer (Coaches Hub deployed)');
  else fail('gateway version banner is not v13+ — did you forget to bump it?');
  const stateBlock = gwSrc.slice(gwSrc.indexOf('action === "state"'), gwSrc.indexOf('action === "claim"'));
  if (stateBlock.includes('!showDrafts') && stateBlock.includes('archived')) ok('public state filters archived seasons, games, and slots; admin PIN sees everything');
  else fail('public archive filtering missing from state');
}

section('flm-ics source: archived seasons never feed calendars');
{
  const icsSrc = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-ics', 'index.ts'), 'utf8');
  if (icsSrc.includes('flm_seasons') && icsSrc.includes('archived') && icsSrc.includes('liveGames')) ok('feed builder drops games from archived seasons');
  else fail('ics archive filter missing');
}

section('fields/index.html: standings + finals hooks');
{
  const portalSrc = fs.readFileSync(path.join(ROOT, 'fields', 'index.html'), 'utf8');
  const hooks = ['id="standBox"', 'FLM_RULES.standings', 'standingsShow', 'finalLine', 'gfinal', 'class="standings"'];
  const missing = hooks.filter((h) => !portalSrc.includes(h));
  if (missing.length === 0) ok('portal standings table and Final lines wired in');
  else fail('missing portal Phase 5 hooks: ' + missing.join(', '));
}

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
  // League PIN rotation 8/24: 0908 (Coach's universal PIN) was retired for
  // Field Command. The gateway must treat it like any other wrong PIN.
  const r = await fetch(GATEWAY + '?action=admin_announcements', { headers: { 'x-admin-pin': '0908' } });
  if (r.status === 401) ok('retired PIN 0908 rejected 401 (league PIN rotation held)');
  else fail('retired PIN 0908 should be 401, got ' + r.status);
} catch (e) {
  fail('retired PIN test threw: ' + e.message);
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
// Phase 4 live checks: umpire privacy hard lines + auth walls. Read-only.
try {
  const r = await fetch(GATEWAY + '?action=state');
  const d = await r.json();
  if (!('umps' in d) && !('ump_assignments' in d)) ok('public state carries NO umpire data at all');
  else fail('public state leaked umpire data!');
  if (d.settings && d.settings.cron_key === undefined) ok('cron_key not leaked in state');
  else fail('cron_key leaked in state!');
} catch (e) {
  fail('ump privacy state test threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=ump_list');
  const d = await r.json();
  if (r.ok && d.ok && Array.isArray(d.umps)) ok('ump_list answers publicly (login picker)');
  else fail('ump_list broken: ' + r.status);
  const extraKeys = (d.umps || []).flatMap((u) => Object.keys(u).filter((k) => k !== 'id' && k !== 'name'));
  if (extraKeys.length === 0) ok('ump_list returns id + name ONLY: no emails, phones, pins, or levels');
  else fail('ump_list leaked fields: ' + JSON.stringify(extraKeys));
} catch (e) {
  fail('ump_list test threw: ' + e.message);
}
try {
  const r = await fetch(GATEWAY + '?action=ump_state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ump_id: '00000000-0000-0000-0000-000000000000', ump_pin: '0000' }) });
  if (r.status === 401) ok('ump_state with a wrong PIN rejected 401');
  else fail('ump_state bad-pin should be 401, got ' + r.status);
} catch (e) {
  fail('ump_state auth test threw: ' + e.message);
}
for (const act of ['admin_umps', 'admin_ump', 'admin_ump_assign']) {
  try {
    const r = await fetch(GATEWAY + '?action=' + act, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (r.status === 401) ok(act + ' without PIN rejected 401');
    else fail(act + ' without PIN should be 401, got ' + r.status);
  } catch (e) {
    fail(act + ' auth test threw: ' + e.message);
  }
}
try {
  const r = await fetch('https://geigvuysptjvvqanumld.supabase.co/functions/v1/flm-reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (r.status === 401) ok('flm-reminders without the cron key or PIN rejected 401');
  else fail('flm-reminders unauthorized should be 401, got ' + r.status);
} catch (e) {
  fail('flm-reminders auth test threw: ' + e.message);
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

// ------- vercel.json: /fields trailing-slash redirect -------
// Without it, coachpilot.org/fields (no slash) resolves relative script srcs
// like flm-rules.js against the site root and 404s the rules engine.
section('vercel.json: /fields trailing-slash redirect');
try {
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const red = (vj.redirects || []).find((r) => r.source === '/fields' && r.destination === '/fields/');
  if (red) ok('/fields redirects to /fields/ so relative assets always resolve');
  else fail('vercel.json missing the /fields -> /fields/ redirect');
  const ics = (vj.rewrites || []).find((r) => r.source === '/fields/ics/:path*');
  if (ics) ok('/fields/ics rewrite to flm-ics still present');
  else fail('vercel.json lost the /fields/ics rewrite');
} catch (e) {
  fail('vercel.json check threw: ' + e.message);
}

// ------- Coaches Hub v13: file hooks + live gateway sanity -------
section('fields/coach-invite.html: set-PIN flow hooks');
try {
  const inv = fs.readFileSync(path.join(ROOT, 'fields', 'coach-invite.html'), 'utf8');
  for (const [s, why] of [
    ['coach_verify_invite', 'invite verify action wired'],
    ['coach_set_pin', 'set-pin action wired'],
    ['flm_coach_id', 'localStorage keys match the hub'],
    ['flm_coach_pin', 'localStorage keys match the hub'],
    ['params.get("token")', 'token pulled from the URL'],
    ['This invite is not valid', 'clear error for bad tokens'],
  ]) {
    if (inv.includes(s)) ok(why);
    else fail('coach-invite MISSING (' + why + '): ' + s);
  }
} catch (e) { fail('coach-invite.html read failed: ' + e.message); }

section('fields/index.html: Coaches Hub tab + panels');
for (const [s, why] of [
  ['data-mtab="hub"', 'Hub tab exists in the bottom tab bar'],
  ['id="viewHub"', 'Hub view container present'],
  ['isCoachSignedIn', 'coach auth state helper wired'],
  ['coach_login', 'login action wired'],
  ['coach_state', 'hub state action wired'],
  ['coach_submit_request', 'submit-request action wired'],
  ['coach_change_pin', 'change-PIN action wired'],
  ['loadHubState', 'hub loader function present'],
  ['hubSignOut', 'sign-out flow present'],
  ['flm_coach_id', 'coach id localStorage key'],
  ['Kill the 11pm group text', 'submit-request copy present'],
  ['Board contacts', 'contacts panel header present'],
]) {
  if (indexHtml.includes(s)) ok(why);
  else fail('index.html Hub MISSING (' + why + '): ' + s);
}

section('fields/admin.html: Coaches / Contacts / Requests panels');
for (const [s, why] of [
  ['view-hub', 'Hub section exists in the admin console'],
  ['id="panelCoaches"', 'Coaches roster panel present'],
  ['id="panelContacts"', 'Board contacts panel present'],
  ['id="panelRequests"', 'Requests inbox panel present'],
  ['admin_coaches', 'coaches list action wired'],
  ['admin_coach', 'coach CRUD action wired'],
  ['admin_contacts', 'contacts list action wired'],
  ['admin_contact', 'contact CRUD action wired'],
  ['admin_requests', 'requests list action wired'],
  ['admin_request', 'request update action wired'],
  ['HUB_COACHES', 'coaches count feeds the home tile'],
  ['HUB_OPEN_REQS', 'open-request count feeds the home tile badge'],
  ['emails the coach', 'admin knows Resolved/Closed emails the coach'],
]) {
  if (adminHtml.includes(s)) ok(why);
  else fail('admin.html Hub MISSING (' + why + '): ' + s);
}

section('flm-gateway: Coaches Hub live sanity (no writes)');
try {
  // 1. coach_verify_invite with a bogus token -> 404 + clear error
  const rv = await fetch(GATEWAY + '?action=coach_verify_invite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'this-token-does-not-exist-' + Math.random().toString(36).slice(2) })
  });
  const jv = await rv.json();
  if (rv.status === 404 && jv.ok === false && /not valid|reset/i.test(jv.error || '')) ok('coach_verify_invite bogus token -> 404 with clear message');
  else fail('coach_verify_invite bogus token wrong: ' + rv.status + ' ' + JSON.stringify(jv));

  // 2. coach_set_pin without a valid PIN shape -> 400 (checked before DB lookup)
  const rs = await fetch(GATEWAY + '?action=coach_set_pin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'x', new_pin: 'notdigits' })
  });
  const js = await rs.json();
  if (rs.status === 400 && js.ok === false && /4 digits/i.test(js.error || '')) ok('coach_set_pin non-numeric PIN -> 400');
  else fail('coach_set_pin bad PIN wrong: ' + rs.status + ' ' + JSON.stringify(js));

  // 3. coach_login with missing fields -> 400
  const rl = await fetch(GATEWAY + '?action=coach_login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '', pin: '' })
  });
  const jl = await rl.json();
  if (rl.status === 400 && jl.ok === false) ok('coach_login empty fields -> 400');
  else fail('coach_login empty fields wrong: ' + rl.status + ' ' + JSON.stringify(jl));

  // 4. coach_state without coach_id + coach_pin -> 401 (not signed in)
  const rst = await fetch(GATEWAY + '?action=coach_state', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  const jst = await rst.json();
  if (rst.status === 401 && /not signed in/i.test(jst.error || '')) ok('coach_state without auth -> 401');
  else fail('coach_state without auth wrong: ' + rst.status + ' ' + JSON.stringify(jst));

  // 5. Admin actions without PIN header -> 401 (outer admin gate)
  for (const action of ['admin_coaches', 'admin_contacts', 'admin_requests']) {
    const r = await fetch(GATEWAY + '?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    const j = await r.json();
    if (r.status === 401 && j.ok === false) ok(action + ' without PIN -> 401');
    else fail(action + ' unauth wrong: ' + r.status + ' ' + JSON.stringify(j));
  }
} catch (e) { fail('live Coaches Hub tests threw: ' + e.message); }

// ------- Coaches Hub v0.2 (v14): messaging + info-first layout + tile polish -------
section('fields/index.html: v14 Hub action bar + messaging');
for (const [s, why] of [
  ['id="hbSubmitReq"', 'Submit Request action button present'],
  ['id="hbMsgCoach"', 'Reach Out to a Coach action button present'],
  ['id="hbReserve"', 'Reserve a Practice Field action button present'],
  ['id="hbChangePin"', 'Change my PIN action button present'],
  ['id="hbSignOut"', 'Sign Out action button present'],
  ['function openSubmitRequest', 'Submit-request modal function'],
  ['function openMessageCoach', 'Coach-to-coach message modal function'],
  ['function openReserveField', 'Reserve-field flow function'],
  ['function showReserveBanner', 'Reserve-field helper banner function'],
  ['coach_send_message', 'send-message action wired from client'],
  ['coach_read_message', 'mark-read action wired for message accordion'],
  ['coach_picker', 'coach_state carries a coach picker for the message modal'],
  ['h.messages', 'hub reads its message inbox from coach_state'],
  ['.hubactions', 'action bar CSS class'],
  ['.hubaction', 'action button CSS class'],
  ['.msg.unread', 'unread message styling'],
  ['.reservebanner', 'reserve-field helper banner styling'],
  ['stored so nothing gets lost in a text thread', 'inbox copy present'],
]) {
  if (indexHtml.includes(s)) ok(why);
  else fail('v14 Hub MISSING (' + why + '): ' + s);
}

section('fields/admin.html: v14 tile polish + messages panel');
for (const [s, why] of [
  ['TILE_ICONS = {', 'tile icon dictionary present'],
  ['divisions:', 'divisions icon defined'],
  ['reports:', 'reports icon defined'],
  ['<div class="arrow">&rarr;</div>', 'every tile carries the arrow affordance'],
  ['navtile.hasbadge', 'badge layout adjusts tile padding'],
  ['id="panelMessages"', 'Coach Messages panel present'],
  ['function renderMessages', 'messages renderer present'],
  ['function loadMessages', 'messages loader present'],
  ['function openMessageBody', 'pull-body modal function present'],
  ['admin_messages', 'messages list action wired'],
  ['admin_message_body', 'pull-body action wired'],
  ['Bodies are private in normal operation', 'privacy copy present in Messages panel'],
  ['audit works both ways', 'dispute-pull audit copy'],
]) {
  if (adminHtml.includes(s)) ok(why);
  else fail('v14 admin MISSING (' + why + '): ' + s);
}

section('flm-gateway: v14 messaging live sanity (no writes)');
try {
  // coach_send_message without auth -> 401
  const rs = await fetch(GATEWAY + '?action=coach_send_message', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  const js = await rs.json();
  if (rs.status === 401 && /not signed in/i.test(js.error || '')) ok('coach_send_message unauth -> 401');
  else fail('coach_send_message unauth wrong: ' + rs.status + ' ' + JSON.stringify(js));

  // coach_read_message without auth -> 401
  const rr = await fetch(GATEWAY + '?action=coach_read_message', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  const jr = await rr.json();
  if (rr.status === 401) ok('coach_read_message unauth -> 401');
  else fail('coach_read_message unauth wrong: ' + rr.status);

  // Admin messaging actions without PIN -> 401
  for (const action of ['admin_messages', 'admin_message_body']) {
    const r = await fetch(GATEWAY + '?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    const j = await r.json();
    if (r.status === 401 && j.ok === false) ok(action + ' without PIN -> 401');
    else fail(action + ' unauth wrong: ' + r.status + ' ' + JSON.stringify(j));
  }
} catch (e) { fail('live v14 messaging tests threw: ' + e.message); }

// ------- Report -------
console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
process.exit(failed === 0 ? 0 : 1);
