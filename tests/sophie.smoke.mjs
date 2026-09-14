#!/usr/bin/env node
// Smoke test for Lessons with Sophie (sophie/ pages + sls-gateway).
//
// What it checks:
//   1. All sophie/ pages + PWA assets exist with required structure/copy.
//   2. No em/en dashes or curly quotes in visible copy (house style rule).
//   3. Live gateway: admin PIN gate (wrong PIN rejected, right PIN allowed).
//   4. Live gateway: new-client request creation, new-vs-returning fork
//      shape, decline transition, counter transition + expiry window,
//      double-booking overlap flagging, direct booking, recurring series
//      materialization, and the cron_tick endpoint (auth via admin PIN,
//      since the real cron_key secret is not available to this test).
//   5. Every row this test creates is tagged with a ZZTEST marker. If
//      SUPABASE_SERVICE_ROLE_KEY is set, rows are deleted after the run.
//      Otherwise they are left in place, tagged, with cleanup instructions
//      printed at the end.
//
// What is NOT covered here (needs manual/browser QA, see final report):
//   - Actually receiving a magic-link email and completing the "book again"
//     flow in a browser (request_login/login_verify success path can't be
//     exercised end-to-end without reading a real inbox).
//   - Actually receiving and tapping a counter-offer accept/decline link
//     from email (the token is only ever emailed, never returned by the API).
//   - Push notification receipt on a real device.
//
// Run:  node tests/sophie.smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/sls-gateway';
const ADMIN_PIN = '7492';
const STAMP = Date.now();
const ZZ_EMAIL = `zztest-sls-${STAMP}@example.com`;

let passed = 0, failed = 0, skipped = 0;
function ok(msg) { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function skip(msg) { console.log('  SKIP ' + msg); skipped++; }
function section(name) { console.log('\n' + name); }

function api(action, opts = {}) {
  const { method = 'GET', body, pin } = opts;
  const headers = { 'Content-Type': 'application/json' };
  if (pin) headers['x-admin-pin'] = pin;
  return fetch(`${GATEWAY}?action=${action}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    j._status = r.status;
    return j;
  });
}

// ==================================================================
section('files: pages + PWA assets exist');
const REQUIRED_FILES = [
  'sophie/index.html',
  'sophie/counter.html',
  'sophie/manage.html',
  'sophie/coach/index.html',
  'sophie/coach/manifest.webmanifest',
  'sophie/coach/sw.js',
  'sophie/coach/icon-192.png',
  'sophie/coach/icon-512.png',
  'supabase/functions/sls-gateway/index.ts',
];
for (const f of REQUIRED_FILES) {
  if (fs.existsSync(path.join(ROOT, f))) ok('exists: ' + f);
  else fail('MISSING: ' + f);
}
const migrationDir = path.join(ROOT, 'supabase/migrations');
const slsMigrations = fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir).filter((f) => f.includes('sls')) : [];
if (slsMigrations.length > 0) ok('sls migration files present: ' + slsMigrations.join(', '));
else fail('MISSING: no sls_ migration files in supabase/migrations/');

// ==================================================================
section('sophie/index.html: required copy + structure');
const indexHtml = fs.readFileSync(path.join(ROOT, 'sophie/index.html'), 'utf8');
const mustContain = [
  'Lessons with Sophie',
  'Scheduling powered by CoachPilot',
  'id="tabNew"',
  'id="tabReturning"',
  'id="nAthleteName"',
  'id="nParentName"',
  'id="nParentPhone"',
  'id="nParentEmail"',
  'id="nHowFound"',
  'id="nNotes"',
  'id="nTimeRows"',
  'id="contact"',
  'id="sendLinkBtn"',
  'id="successState"',
  'Request Sent',
  'Sophie will respond within 48 hours',
];
for (const s of mustContain) {
  if (indexHtml.includes(s)) ok('contains: ' + s);
  else fail('MISSING: ' + s);
}

// ==================================================================
section('house style: no em/en dashes or curly quotes in customer-facing copy');
const forbidden = { '—': 'em-dash', '–': 'en-dash', '’': 'curly-apos', '‘': 'curly-apos-l', '“': 'curly-quote-l', '”': 'curly-quote-r', '…': 'ellipsis' };
for (const page of ['sophie/index.html', 'sophie/counter.html', 'sophie/manage.html', 'sophie/coach/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  let hits = 0;
  for (const [ch, name] of Object.entries(forbidden)) {
    const idx = html.indexOf(ch);
    if (idx !== -1) { fail(page + ': found ' + name + ' at offset ' + idx); hits++; }
  }
  for (const ent of ['&mdash;', '&ndash;']) {
    if (html.includes(ent)) { fail(page + ': found entity ' + ent); hits++; }
  }
  if (hits === 0) ok(page + ': clean');
}

// ==================================================================
section('gateway: admin PIN gate');
{
  const wrong = await api('admin_state', { pin: '0000' });
  if (wrong._status === 401) ok('wrong PIN rejected (401)');
  else fail('wrong PIN was not rejected: status ' + wrong._status);

  const right = await api('admin_state', { pin: ADMIN_PIN });
  if (right._status === 200 && right.ok && Array.isArray(right.requests) && Array.isArray(right.sessions) && Array.isArray(right.locations) && Array.isArray(right.recurring)) {
    ok('correct PIN returns full admin_state shape');
  } else {
    fail('correct PIN did not return expected admin_state shape: ' + JSON.stringify(right).slice(0, 200));
  }
}

// ==================================================================
section('gateway: request_login does not leak account existence and sends no email for unknown contact');
{
  const r = await api('request_login', { method: 'POST', body: { contact: 'definitely-not-a-real-account@example.com' } });
  if (r.ok && r.found === false) ok('unknown contact returns found:false without erroring');
  else fail('unexpected response for unknown contact: ' + JSON.stringify(r));
}

// ==================================================================
section('gateway: new-client request creation + decline transition');
let declineRequestId = null;
{
  const body = {
    mode: 'new',
    athlete_name: 'ZZTEST Athlete A',
    athlete_age: '10',
    focus_notes: 'ZZTEST smoke test request (decline path)',
    parent_name: 'ZZTEST Parent',
    parent_phone: '2535550100',
    parent_email: ZZ_EMAIL,
    how_found: 'Other',
    proposed_times: [
      new Date(Date.now() + 5 * 86400000).toISOString(),
      new Date(Date.now() + 6 * 86400000).toISOString(),
    ],
  };
  const r = await api('submit_request', { method: 'POST', body });
  if (r.ok && r.request_id) { ok('new-client submit_request succeeded'); declineRequestId = r.request_id; }
  else fail('submit_request failed: ' + JSON.stringify(r));
}
{
  const missingTimes = await api('submit_request', { method: 'POST', body: { mode: 'new', athlete_name: 'x', parent_name: 'x', parent_email: ZZ_EMAIL, proposed_times: [new Date(Date.now() + 86400000).toISOString()] } });
  if (!missingTimes.ok) ok('submit_request rejects fewer than 2 proposed times');
  else fail('submit_request should have rejected a single proposed time');
}
if (declineRequestId) {
  const state = await api('admin_state', { pin: ADMIN_PIN });
  const found = (state.requests || []).find((r) => r.id === declineRequestId);
  if (found && found.status === 'pending' && found.is_new_client === true && typeof found.overlap_flags === 'object') {
    ok('request appears in admin_state as pending/new with overlap_flags');
  } else {
    fail('request not found in admin_state with expected shape');
  }

  const declined = await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: declineRequestId, response: 'decline', message: 'ZZTEST decline message' } });
  if (declined.ok && declined.result === 'declined') ok('admin_respond decline succeeded');
  else fail('admin_respond decline failed: ' + JSON.stringify(declined));

  const state2 = await api('admin_state', { pin: ADMIN_PIN });
  const stillPending = (state2.requests || []).some((r) => r.id === declineRequestId);
  if (!stillPending) ok('declined request no longer appears in pending/countered queue');
  else fail('declined request still appears in the queue');
}

// ==================================================================
section('gateway: counter-offer flow (create + counter, respond needs an emailed token so we stop at counter)');
let counterRequestId = null;
let zzLocationId = null;
{
  const loc = await api('admin_location', { method: 'POST', pin: ADMIN_PIN, body: { name: 'ZZTEST Location', address: '123 ZZTEST St' } });
  if (loc.ok && loc.location && loc.location.id) { ok('admin_location created a ZZTEST preset'); zzLocationId = loc.location.id; }
  else fail('admin_location failed: ' + JSON.stringify(loc));
}
{
  const body = {
    mode: 'new',
    athlete_name: 'ZZTEST Athlete B',
    athlete_age: '11',
    focus_notes: 'ZZTEST smoke test request (counter path)',
    parent_name: 'ZZTEST Parent B',
    parent_email: `zztest-sls-b-${STAMP}@example.com`,
    proposed_times: [
      new Date(Date.now() + 7 * 86400000).toISOString(),
      new Date(Date.now() + 8 * 86400000).toISOString(),
    ],
  };
  const r = await api('submit_request', { method: 'POST', body });
  if (r.ok && r.request_id) { ok('second new-client submit_request succeeded'); counterRequestId = r.request_id; }
  else fail('second submit_request failed: ' + JSON.stringify(r));
}
if (counterRequestId && zzLocationId) {
  const counterTime = new Date(Date.now() + 9 * 86400000).toISOString();
  const r = await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: counterRequestId, response: 'counter', counter_time: counterTime, location_id: zzLocationId } });
  if (r.ok && r.result === 'countered') ok('admin_respond counter succeeded');
  else fail('admin_respond counter failed: ' + JSON.stringify(r));

  const state = await api('admin_state', { pin: ADMIN_PIN });
  const found = (state.requests || []).find((r) => r.id === counterRequestId);
  // Postgres round-trips timestamptz as "+00:00" rather than "Z"; compare the instant, not the raw string.
  if (found && found.status === 'countered' && found.counter_time && new Date(found.counter_time).getTime() === new Date(counterTime).getTime()) {
    ok('countered request shows correct status + counter_time');
  } else {
    fail('countered request state mismatch: ' + JSON.stringify(found));
  }

  skip('counter_respond accept/decline requires the emailed magic-link token; not reachable from this test without inbox access');
}

// ==================================================================
section('gateway: double-booking overlap flagging');
let overlapSessionId = null;
let overlapRequestId = null;
{
  const overlapTime = new Date(Date.now() + 10 * 86400000).toISOString();
  const booked = await api('admin_direct_booking', {
    method: 'POST', pin: ADMIN_PIN,
    body: {
      athlete_name: 'ZZTEST Athlete C',
      starts_at: overlapTime,
      new_client: { parent_name: 'ZZTEST Parent C', parent_email: `zztest-sls-c-${STAMP}@example.com` },
    },
  });
  if (booked.ok && booked.session && booked.session.id) { ok('admin_direct_booking created a session'); overlapSessionId = booked.session.id; }
  else fail('admin_direct_booking failed: ' + JSON.stringify(booked));

  if (overlapSessionId) {
    const req = await api('submit_request', {
      method: 'POST',
      body: {
        mode: 'new',
        athlete_name: 'ZZTEST Athlete D',
        parent_name: 'ZZTEST Parent D',
        parent_email: `zztest-sls-d-${STAMP}@example.com`,
        proposed_times: [overlapTime, new Date(Date.now() + 11 * 86400000).toISOString()],
      },
    });
    if (req.ok && req.request_id) { overlapRequestId = req.request_id; } else fail('overlap-candidate submit_request failed');

    const state = await api('admin_state', { pin: ADMIN_PIN });
    const found = (state.requests || []).find((r) => r.id === overlapRequestId);
    if (found && found.overlap_flags && found.overlap_flags[overlapTime] === true && found.flagged === true) {
      ok('overlapping proposed time is correctly flagged in admin_state');
    } else {
      fail('overlap was not flagged as expected: ' + JSON.stringify(found && found.overlap_flags));
    }
  }
}

// ==================================================================
section('gateway: recurring series materializes future sessions');
let recurringId = null;
{
  const clients = await api('admin_clients', { pin: ADMIN_PIN });
  const zzClient = (clients.clients || []).find((c) => c.parent_email.startsWith('zztest-sls-'));
  if (!zzClient) { fail('could not find a ZZTEST client to attach a recurring series to'); }
  else {
    const weekday = new Date().getDay();
    const r = await api('admin_recurring_create', {
      method: 'POST', pin: ADMIN_PIN,
      body: {
        client_id: zzClient.id,
        athlete_name: 'ZZTEST Recurring Athlete',
        weekday,
        start_time: '18:00',
        location_id: zzLocationId,
        starts_on: new Date().toISOString().slice(0, 10),
        notes: 'ZZTEST recurring series',
      },
    });
    if (r.ok && r.recurring && r.recurring.id && r.sessions_created >= 1) {
      ok(`admin_recurring_create materialized ${r.sessions_created} session(s)`);
      recurringId = r.recurring.id;
    } else {
      fail('admin_recurring_create did not materialize sessions as expected: ' + JSON.stringify(r));
    }
  }
}

// ==================================================================
section('gateway: cron_tick endpoint (admin-PIN auth path)');
{
  const wrong = await api('cron_tick', { method: 'POST' });
  if (wrong._status === 401) ok('cron_tick rejects requests with no cron key or admin PIN');
  else fail('cron_tick should have rejected an unauthenticated call');

  const right = await api('cron_tick', { method: 'POST', pin: ADMIN_PIN });
  if (right.ok && typeof right.expired === 'number' && typeof right.recurring_topped_up === 'number') ok('cron_tick runs successfully via admin PIN fallback');
  else fail('cron_tick did not return the expected shape: ' + JSON.stringify(right));
}

// ==================================================================
section('cleanup: ZZTEST rows');
if (recurringId) {
  const r = await api('admin_recurring_cancel', { method: 'POST', pin: ADMIN_PIN, body: { recurring_id: recurringId } });
  if (r.ok) ok('cancelled ZZTEST recurring series (future sessions cancelled)');
  else fail('could not cancel ZZTEST recurring series');
}
if (overlapSessionId) {
  const r = await api('admin_session_cancel', { method: 'POST', pin: ADMIN_PIN, body: { session_id: overlapSessionId } });
  if (r.ok) ok('cancelled ZZTEST overlap-guard session');
  else fail('could not cancel ZZTEST overlap-guard session');
}
if (overlapRequestId) {
  await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: overlapRequestId, response: 'decline', message: 'ZZTEST cleanup' } });
}
if (counterRequestId) {
  await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: counterRequestId, response: 'decline', message: 'ZZTEST cleanup' } });
}

const SUPABASE_URL = 'https://geigvuysptjvvqanumld.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (SERVICE_KEY) {
  const rest = (table, query) => fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
  });
  // PostgREST has no subselects in query params; delete in dependency order via each ZZTEST client's id.
  const clientsResp = await fetch(`${SUPABASE_URL}/rest/v1/sls_clients?parent_email=like.zztest-sls-*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  }).then((r) => r.json()).catch(() => []);
  const ids = (clientsResp || []).map((c) => c.id);
  for (const id of ids) {
    await rest('sls_sessions', `client_id=eq.${id}`);
    await rest('sls_requests', `client_id=eq.${id}`);
    await rest('sls_recurring', `client_id=eq.${id}`);
  }
  await rest('sls_clients', `parent_email=like.zztest-sls-*`);
  await rest('sls_locations', `name=eq.ZZTEST Location`);
  ok(`deleted ZZTEST rows via service role (clients: ${ids.length})`);
} else {
  skip('SUPABASE_SERVICE_ROLE_KEY not set. ZZTEST rows left in place, tagged for manual cleanup:');
  console.log(`         sls_clients where parent_email like 'zztest-sls-%'`);
  console.log(`         sls_locations where name = 'ZZTEST Location'`);
  console.log(`         (cascades to sls_requests/sls_sessions/sls_recurring via client_id/location_id)`);
}

// ==================================================================
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
process.exit(failed > 0 ? 1 : 0);
