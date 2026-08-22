#!/usr/bin/env node
// Smoke test for game-nights.html + cac-gamenights-gateway.
//
// What it checks:
//   1. game-nights.html exists and has all approved copy + required form fields.
//   2. game-nights.html has NO em/en dashes or curly quotes in visible copy.
//   3. game-nights.html is NOT linked from index.html, coaches.html, gameday.html,
//      plans.html, ondeck.html, run-a-clinic.html, or 200.html (nav gating rule).
//   4. Live POST to cac-gamenights-gateway succeeds AND rejects a bad payload.
//   5. If SUPABASE_SERVICE_ROLE_KEY is set, the ZZTEST row is deleted after insert.
//      Otherwise, the row is left in place with a ZZTEST tag so it is easy to find.
//
// Run:  node tests/game-nights.smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'game-nights.html');

const GATEWAY = 'https://xyphakgtsvtaaswmvvol.supabase.co/functions/v1/cac-gamenights-gateway';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cGhha2d0c3Z0YWFzd212dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MzQwMjgsImV4cCI6MjA5MzIxMDAyOH0.5QhiwIFNe1gvzUo18QR23ua5lj8lMkDIgLDCob9d0u0';
const REST = 'https://xyphakgtsvtaaswmvvol.supabase.co/rest/v1/cac_gamenights_interest';

let passed = 0, failed = 0;
function ok(msg)   { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function section(name) { console.log('\n' + name); }

// ------- 1. File exists + required copy -------
section('page: file + copy');
if (!fs.existsSync(PAGE)) { fail('game-nights.html missing'); process.exit(1); }
const html = fs.readFileSync(PAGE, 'utf8');
const mustContain = [
  'COACHPILOT GAME NIGHTS',
  'One night a week in a local school gym',
  'Coach Daniel runs every session',
  'No tryouts, no bench',
  'ages 5-14',
  'Kicking off this November',
  '$150',
  'Siblings are $100 a month each',
  'individual sessions and small group sessions',
  'JOIN THE INTEREST LIST',
  'No payment now',
  'You are on the list. Coach Daniel will reach out as soon as the night is set',
  'weekly_group',
  'small_group',
  'individual',
  'name="parent_name"',
  'name="kid_ages"',
  'name="phone"',
  'name="email"',
  'name="message"',
  'noindex, nofollow',
];
for (const s of mustContain) {
  if (html.includes(s)) ok('contains: ' + s.slice(0, 60));
  else fail('MISSING: ' + s);
}

// ------- 2. Forbidden chars -------
section('page: no em/en dashes or curly quotes');
const forbidden = { '—': 'em-dash', '–': 'en-dash', '’': 'curly-apos', '‘': 'curly-apos-l', '“': 'curly-quote-l', '”': 'curly-quote-r', '…': 'ellipsis' };
let charHits = 0;
for (const [ch, name] of Object.entries(forbidden)) {
  const idx = html.indexOf(ch);
  if (idx !== -1) { fail('found ' + name + ' at offset ' + idx); charHits++; }
}
// Also block &mdash; / &ndash; HTML entities
for (const ent of ['&mdash;', '&ndash;']) {
  if (html.includes(ent)) { fail('found entity ' + ent); charHits++; }
}
if (charHits === 0) ok('no em/en dashes or curly quotes');

// ------- 3. Not linked from nav pages -------
section('page: not linked from any nav');
const navPages = ['index.html', 'coaches.html', 'gameday.html', 'plans.html', 'ondeck.html', 'run-a-clinic.html', '200.html'];
for (const p of navPages) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) { ok(p + ' does not exist (skip)'); continue; }
  const body = fs.readFileSync(full, 'utf8');
  if (body.includes('game-nights.html') || /href=["']\/?game-nights\b/.test(body)) {
    fail(p + ' links to game-nights');
  } else {
    ok(p + ' has no link to game-nights');
  }
}

// ------- 4. Gateway live POST -------
section('gateway: live POST');
const testTag = 'ZZTEST smoke ' + new Date().toISOString();
const goodPayload = {
  parent_name: 'ZZTEST Smoke',
  kid_ages: 'test',
  phone: '(555) 555-0000',
  email: 'zztest+smoke@cueops.io',
  interest: ['weekly_group'],
  message: testTag,
};
let insertedId = null;

try {
  const r = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON,
      'Authorization': 'Bearer ' + ANON,
      'Origin': 'https://coachpilot.org',
    },
    body: JSON.stringify(goodPayload),
  });
  const body = await r.json();
  if (r.ok && body.ok && body.id) {
    ok('good payload accepted, id=' + body.id);
    insertedId = body.id;
  } else {
    fail('good payload rejected: ' + r.status + ' ' + JSON.stringify(body));
  }
} catch (e) {
  fail('good payload threw: ' + e.message);
}

try {
  const r = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON,
      'Authorization': 'Bearer ' + ANON,
      'Origin': 'https://coachpilot.org',
    },
    body: JSON.stringify({ parent_name: 'X', kid_ages: 'x', email: 'not-an-email', interest: ['weekly_group'] }),
  });
  if (r.status === 400) ok('bad email rejected 400');
  else fail('bad email should be 400, got ' + r.status);
} catch (e) {
  fail('bad-email test threw: ' + e.message);
}

try {
  const r = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON,
      'Authorization': 'Bearer ' + ANON,
      'Origin': 'https://coachpilot.org',
    },
    body: JSON.stringify({ parent_name: 'X', kid_ages: 'x', email: 'a@b.co', interest: ['garbage_value'] }),
  });
  if (r.status === 400) ok('bad interest value rejected 400');
  else fail('bad interest value should be 400, got ' + r.status);
} catch (e) {
  fail('bad-interest test threw: ' + e.message);
}

try {
  const r = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON,
      'Authorization': 'Bearer ' + ANON,
      'Origin': 'https://coachpilot.org',
    },
    body: JSON.stringify({ parent_name: 'X', kid_ages: 'x', email: 'a@b.co', interest: [] }),
  });
  if (r.status === 400) ok('empty interest rejected 400');
  else fail('empty interest should be 400, got ' + r.status);
} catch (e) {
  fail('empty-interest test threw: ' + e.message);
}

// ------- 5. Clean up ZZTEST row -------
section('cleanup: delete ZZTEST row');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (insertedId && serviceKey) {
  try {
    const r = await fetch(REST + '?id=eq.' + insertedId, {
      method: 'DELETE',
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Prefer': 'return=minimal' },
    });
    if (r.ok) ok('deleted ZZTEST row ' + insertedId);
    else fail('delete returned ' + r.status);
  } catch (e) { fail('delete threw: ' + e.message); }
} else if (insertedId) {
  console.log('  NOTE  SUPABASE_SERVICE_ROLE_KEY not set. ZZTEST row ' + insertedId + ' left in place; delete via MCP.');
} else {
  console.log('  NOTE  no insertedId; nothing to clean up.');
}

// ------- Report -------
console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (insertedId && !serviceKey) console.log('cleanup pending for id: ' + insertedId);
process.exit(failed === 0 ? 0 : 1);
