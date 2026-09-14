#!/usr/bin/env node
// Smoke test for the hub -> weekly-update auto-forward (cougars/index.html + cougars/updates.html).
//
// Coach's diagnosis: the weekly email links to the hub, but most parents can't navigate
// and land lost on the main page instead of the update they came for. Fix: the hub
// auto-forwards any device that hasn't seen the latest update straight to it, marks it
// seen so the next visit goes to the hub normally, and ?stay always wins so Coach can
// always reach the hub. updates.html gets a "Team page" button back to the hub.
//
// These are source-level checks (no browser). Live-verify (fresh context forwards,
// second visit stays, ?stay=1 always hub, button works, no console errors) is done
// separately with Playwright against the deployed site.
//
// Run:  node tests/cougars-hub-redirect.smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/cougars-gateway';

let passed = 0, failed = 0;
function ok(msg)   { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function section(name) { console.log('\n' + name); }

const hubHtml = fs.readFileSync(path.join(ROOT, 'cougars', 'index.html'), 'utf8');
const updatesHtml = fs.readFileSync(path.join(ROOT, 'cougars', 'updates.html'), 'utf8');

// Pull out the head redirect script for close inspection.
const headScript = (hubHtml.match(/<script>[\s\S]*?cougars_welcomed[\s\S]*?<\/script>/) || [''])[0];

// ------- stay=1 always wins, before anything else runs -------
section('hub: ?stay always skips the auto-forward (and the welcome check)');
if (/var stay = location\.search\.indexOf\('stay'\) !== -1;/.test(headScript)) ok('stay flag computed from location.search');
else fail('MISSING: stay flag computed from location.search');
if (/if \(stay\) return;/.test(headScript)) ok('stay short-circuits before the update fetch runs');
else fail('MISSING: stay short-circuits before the update fetch');
// The stay check must appear textually before the fetch() call, not after.
const stayIdx = headScript.indexOf("if (stay) return;");
const fetchIdx = headScript.indexOf('cougars-gateway?action=updates');
if (stayIdx !== -1 && fetchIdx !== -1 && stayIdx < fetchIdx) ok('stay-return sits before the updates fetch (order matters)');
else fail('stay-return does not precede the updates fetch');

// ------- welcome first-run flow left intact -------
section('hub: first-run welcome flow untouched');
if (headScript.includes("location.replace('/cougars/welcome.html')")) ok('unwelcomed devices still forward to welcome.html');
else fail('MISSING: welcome.html forward for unwelcomed devices');
if (/if \(!safeGet\('cougars_welcomed'\) && !stay\)/.test(headScript)) ok('welcome forward still gated on !stay (welcome.html\'s own ?stay=1 CTA never re-forwarded)');
else fail('MISSING: welcome forward gated on !stay');

// ------- unseen update forwards, seen update does not -------
section('hub: unseen vs seen update comparison');
if (headScript.includes("cougars-gateway?action=updates")) ok('hub fetches the updates feed to find the latest id');
else fail('MISSING: updates fetch in hub head script');
if (/latestId = String\(ups\[0\]\.id\)/.test(headScript)) ok('latest update id read from the first (newest) row');
else fail('MISSING: latest update id extraction');
if (/if \(safeGet\(SEEN_KEY\) === latestId\) return;/.test(headScript)) ok('matching seen-marker skips the forward (returning visitor -> hub)');
else fail('MISSING: seen-marker match short-circuits the forward');
if (/safeSet\(SEEN_KEY, latestId\);/.test(headScript) && /location\.replace\('\/cougars\/updates\.html'\);/.test(headScript)) {
  const setIdx = headScript.indexOf('safeSet(SEEN_KEY, latestId);');
  const replaceIdx = headScript.indexOf("location.replace('/cougars/updates.html');");
  if (setIdx !== -1 && replaceIdx !== -1 && setIdx < replaceIdx) ok('marks seen BEFORE forwarding (so a reload mid-flow never loops)');
  else fail('seen-marker is not set before the forward redirect');
} else {
  fail('MISSING: mark-seen + forward-to-updates.html pair');
}
if (headScript.includes('if (!ups.length) return;')) ok('no updates yet -> no forward (never chase a hub that has nothing to show)');
else fail('MISSING: empty-updates guard');

// ------- storage-blocked never blanks the page -------
section('hub: storage-blocked safety (Safari private mode lesson)');
if (/function safeGet\(k\) \{ try \{ return localStorage\.getItem\(k\); \} catch \(e\) \{ return null; \} \}/.test(headScript)) ok('safeGet wraps localStorage.getItem in try/catch');
else fail('MISSING: safeGet try/catch wrapper');
if (/function safeSet\(k, v\) \{ try \{ localStorage\.setItem\(k, v\); \} catch \(e\) \{\} \}/.test(headScript)) ok('safeSet wraps localStorage.setItem in try/catch');
else fail('MISSING: safeSet try/catch wrapper');
if (headScript.includes('.catch(function () { /* network or storage blocked: never trap anyone, just show the hub */ })')) ok('fetch failure caught, page still renders');
else fail('MISSING: fetch .catch guard on the updates lookup');

// ------- updates.html: Team page button -------
section('updates.html: Team page button');
if (updatesHtml.includes('class="hubbtn" href="/cougars/index.html?stay=1"')) ok('Team page button links to the hub with ?stay=1 (never bounces back)');
else fail('MISSING: hubbtn link to /cougars/index.html?stay=1');
if (/>Team page</.test(updatesHtml)) ok('button labeled "Team page"');
else fail('MISSING: "Team page" button label');
// Button must render before the update list so it's visible without scrolling.
const btnIdx = updatesHtml.indexOf('class="hubbtn"');
const listIdx = updatesHtml.indexOf('id="list"');
if (btnIdx !== -1 && listIdx !== -1 && btnIdx < listIdx) ok('button sits above the update list (top of page)');
else fail('button is not positioned above the update list');

// ------- data untouched: the new redirect script only reads, never writes -------
section('no data-layer changes');
if (!/post_update|cougars_config/.test(headScript) && headScript.includes('action=updates')) ok('redirect script only GETs action=updates, no writes to cougars_config / post_update');
else fail('redirect script unexpectedly touches cougars_config or post_update');

// ------- live: gateway still serves updates the same shape the hub expects -------
section('gateway live: updates feed shape (id, update_date, body, newest first)');
try {
  const r = await fetch(GATEWAY + '?action=updates');
  const d = await r.json();
  const ups = d.updates || [];
  if (r.ok && ups.length > 0) ok('updates feed returns ' + ups.length + ' row(s)');
  else fail('updates feed empty or non-200: ' + r.status);
  if (ups.length && ups[0].id != null) ok('newest row has an id field the hub can compare against');
  else fail('newest row missing an id field');
  if (ups.length > 1) {
    const d0 = ups[0].update_date, d1 = ups[1].update_date;
    if (d0 >= d1) ok('feed is newest-first (' + d0 + ' >= ' + d1 + ')');
    else fail('feed is NOT newest-first: ' + d0 + ' then ' + d1);
  }
} catch (e) { fail('updates fetch threw: ' + e.message); }

// ------- Report -------
console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
process.exit(failed === 0 ? 0 : 1);
