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
import { fileURLToPath } from 'node:url';
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

// ------- 2. Portal hooks -------
section('fields/index.html: required hooks');
const indexHtml = fs.readFileSync(path.join(ROOT, 'fields', 'index.html'), 'utf8');
for (const s of ['Who are you, Coach?', 'Just browsing', 'id="announceBox"', 'id="myTeam"', 'src="flm-rules.js"', 'FLM_RULES.evaluate', 'FLM_RULES.describe', 'flm_browse', 'lsSet("flm_team"']) {
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

// ------- 3. Admin hooks -------
section('fields/admin.html: required hooks');
const adminHtml = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
for (const s of ['Practice compliance', 'id="compGrid"', 'League announcements', 'id="anTitle"', 'id="anPost"', 'admin_announcement_email', 'preview: true', 'id="ruleWk"', 'id="ruleMonFri"', 'src="flm-rules.js"', 'Email all coaches']) {
  if (adminHtml.includes(s)) ok('contains: ' + s);
  else fail('MISSING: ' + s);
}
if (!adminHtml.includes('anPost").addEventListener') || adminHtml.indexOf('admin_announcement_email') === adminHtml.lastIndexOf('admin_announcement_email')) {
  // posting handler exists and email path referenced more than once (preview + send)
  fail('post/email wiring looks incomplete');
} else {
  ok('posting and emailing are separate actions');
}

// ------- 4. New file copy rules -------
section('flm-rules.js: no em/en dashes or curly quotes');
const rulesSrc = fs.readFileSync(path.join(ROOT, 'fields', 'flm-rules.js'), 'utf8');
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

// ------- Report -------
console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
process.exit(failed === 0 ? 0 : 1);
