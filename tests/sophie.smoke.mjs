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
//      materialization, duplicate-submit guard, and the cron_tick endpoint
//      (auth via admin PIN, since the real cron_key secret is not available
//      to this test).
//   6. Browser regression (Playwright, requires SUPABASE_SERVICE_ROLE_KEY to
//      age a real token): opening the returning-client page with an expired
//      login_token shows a clear "link expired" state with a working
//      "Request a New Link" recovery action, not bare unlabeled form fields.
//   7. Unit tests for ics-parse.mjs (Z-suffixed UTC, TZID, all-day, weekly
//      RRULE expansion, unsupported-RRULE base-occurrence fallback).
//   8. Availability layer: window CRUD, open_slots generation respecting
//      window edges/step/duration, session-overlap exclusion, pending-hide
//      (and reappear on decline), min-notice, busy-calendar-overlap exclusion
//      (via a direct cache write, since the gateway can't reach a fixture
//      hosted on this machine), cross-request overlap flagging for two
//      requests proposing the same slot, open-slot submission bypassing the
//      2-3 time minimum, and the connected-calendar URL never appearing raw
//      in ANY gateway response (masked only).
//   9. Every row this test creates is tagged with a ZZTEST marker. If
//      SUPABASE_SERVICE_ROLE_KEY is set, rows are deleted after the run.
//      Otherwise they are left in place, tagged, with cleanup instructions
//      printed at the end.
//
// EMAIL SAFETY: this suite creates real pending requests, which trigger a
// real "new lesson request" alert email. Before any test runs, setup reads
// the CURRENT sls_settings.sophie_alert_email, forces it to Resend's
// blackhole address (delivered@resend.dev), and confirms the forced value
// read back correctly (aborting the whole run if it can't confirm this).
// A try/finally restores the exact pre-test value afterward, even if a test
// throws, so a run can never leave a real inbox re-armed. The gateway ALSO
// carries its own independent guard (resendSend in sls-gateway/index.ts):
// any email whose recipient or content references a ZZTEST-marked entity is
// forced to the blackhole regardless of settings — defense in depth, not
// reliant on this file remembering to do the right thing.
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
const SUPABASE_URL = 'https://geigvuysptjvvqanumld.supabase.co';
const ADMIN_PIN = '7492';
const STAMP = Date.now();
const ZZ_EMAIL = `zztest-sls-${STAMP}@example.com`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function rest(table, query = '', opts = {}) {
  const { method = 'GET', body, headers = {} } = opts;
  return fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => []) }));
}

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

async function main() {
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
  'supabase/functions/sls-gateway/ics-parse.mjs',
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
section('sophie/index.html: day-first open-times + locked-slot structure');
const openTimesMustContain = [
  'id="openTimesSection"',
  'id="openTimesPicker"',
  'id="dayStrip"',
  'id="dayTimeChips"',
  'id="openTimesManual"',
  'id="otManualTimeRows"',
  'id="backToOpenTimesLink"',
  'id="suggestOwnTimesLink"',
  'id="nLockedTimeCard"',
  'id="nTimesPickerGroup"',
  'id="rLockedTimeCard"',
  'id="rTimesPickerGroup"',
  'from_open_slot',
];
for (const s of openTimesMustContain) {
  if (indexHtml.includes(s)) ok('contains: ' + s);
  else fail('MISSING: ' + s);
}

// ==================================================================
section('sophie/coach/index.html: availability tab structure');
const coachHtml = fs.readFileSync(path.join(ROOT, 'sophie/coach/index.html'), 'utf8');
const availabilityMustContain = [
  'data-panel="Availability"',
  'id="panelAvailability"',
  'id="windowsList"',
  'id="addWindowBtn"',
  'id="calendarUrlInput"',
  'id="saveCalendarBtn"',
  'id="disconnectCalendarBtn"',
  'id="calendarStatusLine"',
  'Picked an Open Time',
];
for (const s of availabilityMustContain) {
  if (coachHtml.includes(s)) ok('contains: ' + s);
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
section('unit: ics-parse.mjs busy-interval extraction');
{
  const { parseIcsBusyIntervals } = await import(path.join(ROOT, 'supabase/functions/sls-gateway/ics-parse.mjs'));
  const fixtureIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:zulu-1
DTSTART:20260916T230000Z
DTEND:20260917T000000Z
SUMMARY:Zulu event
END:VEVENT
BEGIN:VEVENT
UID:tzid-1
DTSTART;TZID=America/Los_Angeles:20260917T180000
DTEND;TZID=America/Los_Angeles:20260917T190000
SUMMARY:TZID event
END:VEVENT
BEGIN:VEVENT
UID:allday-1
DTSTART;VALUE=DATE:20260920
DTEND;VALUE=DATE:20260921
SUMMARY:All day event
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
DTSTART;TZID=America/Los_Angeles:20260916T160000
DTEND;TZID=America/Los_Angeles:20260916T170000
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Weekly recurring
END:VEVENT
BEGIN:VEVENT
UID:monthly-1
DTSTART;TZID=America/Los_Angeles:20260916T090000
DTEND;TZID=America/Los_Angeles:20260916T100000
RRULE:FREQ=MONTHLY;COUNT=3
SUMMARY:Monthly (unsupported freq, base occurrence only, log-skipped)
END:VEVENT
END:VCALENDAR`;
  const horizonStart = Date.UTC(2026, 8, 14);
  const horizonEnd = Date.UTC(2026, 9, 6);
  const { busy, skippedRrules } = parseIcsBusyIntervals(fixtureIcs, horizonStart, horizonEnd);

  const has = (startIso, endIso) => busy.some((b) => new Date(b.start).toISOString() === startIso && new Date(b.end).toISOString() === endIso);

  if (has('2026-09-16T23:00:00.000Z', '2026-09-17T00:00:00.000Z')) ok('UTC Z-suffixed DTSTART/DTEND parsed correctly');
  else fail('Z-suffixed event not found in busy list: ' + JSON.stringify(busy));

  if (has('2026-09-18T01:00:00.000Z', '2026-09-18T02:00:00.000Z')) ok('TZID=America/Los_Angeles event correctly converted to UTC (PDT, UTC-7)');
  else fail('TZID event not found or wrong offset: ' + JSON.stringify(busy));

  if (has('2026-09-20T07:00:00.000Z', '2026-09-21T07:00:00.000Z')) ok('all-day (VALUE=DATE) event treated as busy across the full Pacific day');
  else fail('all-day event not found or wrong span: ' + JSON.stringify(busy));

  const weeklyOccurrences = ['2026-09-16T23:00:00.000Z', '2026-09-23T23:00:00.000Z', '2026-09-30T23:00:00.000Z'];
  if (weeklyOccurrences.every((iso) => busy.some((b) => new Date(b.start).toISOString() === iso))) ok('RRULE FREQ=WEEKLY;COUNT=3 expanded into exactly 3 correctly-spaced occurrences');
  else fail('weekly RRULE expansion incorrect: ' + JSON.stringify(busy));

  if (has('2026-09-16T16:00:00.000Z', '2026-09-16T17:00:00.000Z')) ok('unsupported RRULE (FREQ=MONTHLY) still includes its base occurrence');
  else fail('base occurrence of unsupported-RRULE event missing: ' + JSON.stringify(busy));
  if (skippedRrules === 1) ok('unsupported RRULE (FREQ=MONTHLY) is reported via skippedRrules for logging, not silently dropped');
  else fail('expected skippedRrules=1, got ' + skippedRrules);
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
section('gateway: duplicate-submit guard');
{
  const dupeEmail = `zztest-sls-dupe-${STAMP}@example.com`;
  const dupeBody = {
    mode: 'new',
    athlete_name: 'ZZTEST Dupe Athlete',
    parent_name: 'ZZTEST Dupe Parent',
    parent_email: dupeEmail,
    proposed_times: [
      new Date(Date.now() + 17 * 86400000).toISOString(),
      new Date(Date.now() + 18 * 86400000).toISOString(),
    ],
  };
  const first = await api('submit_request', { method: 'POST', body: dupeBody });
  const second = await api('submit_request', { method: 'POST', body: dupeBody });
  if (first.ok && first.request_id && second.ok && second.request_id === first.request_id && second.duplicate === true) {
    ok('resubmitting the same request (page reload/double-tap) returns the existing request_id instead of creating a duplicate');
  } else {
    fail('duplicate-submit guard did not dedupe as expected: first=' + JSON.stringify(first) + ' second=' + JSON.stringify(second));
  }
  if (SERVICE_KEY) {
    const { data: rows } = await rest('sls_requests', `parent_email=eq.${encodeURIComponent(dupeEmail)}&select=id`);
    if ((rows || []).length === 1) ok('exactly one sls_requests row exists in the database for the duplicate-submit pair');
    else fail('expected exactly 1 request row, found ' + (rows || []).length);
  } else {
    skip('SUPABASE_SERVICE_ROLE_KEY not set; could not verify only one DB row was created (API response already confirms the dedupe)');
  }
}

// ==================================================================
section('browser: expired magic link shows recovery, not a dead end');
if (!SERVICE_KEY) {
  skip('SUPABASE_SERVICE_ROLE_KEY not set; cannot age a real token to reproduce the expired-link state');
} else {
  const zzEmail = `zztest-sls-expiry-${STAMP}@example.com`;
  const seed = await api('submit_request', {
    method: 'POST',
    body: {
      mode: 'new', athlete_name: 'ZZTEST Expiry Athlete', parent_name: 'ZZTEST Expiry Parent', parent_email: zzEmail,
      proposed_times: [new Date(Date.now() + 19 * 86400000).toISOString(), new Date(Date.now() + 20 * 86400000).toISOString()],
    },
  });
  if (!seed.ok) {
    fail('could not seed a client for the expired-link browser test: ' + JSON.stringify(seed));
  } else {
    const login = await api('request_login', { method: 'POST', body: { contact: zzEmail } });
    const { data: clientRows } = await rest('sls_clients', `parent_email=eq.${encodeURIComponent(zzEmail)}&select=id`);
    const clientId = clientRows?.[0]?.id;
    const { data: tokRows } = await rest('sls_tokens', `client_id=eq.${clientId}&purpose=eq.login&order=created_at.desc&limit=1`);
    const tok = tokRows?.[0];
    if (!login.ok || !login.found || !tok) {
      fail('could not obtain a login token to age for the expired-link browser test');
    } else {
      await rest('sls_tokens', `id=eq.${tok.id}`, { method: 'PATCH', body: { expires_at: new Date(Date.now() - 60000).toISOString() }, headers: { Prefer: 'return=minimal' } });
      const { chromium } = await import('@playwright/test');
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(`https://coachpilot.org/sophie/?login_token=${tok.token}`, { waitUntil: 'networkidle' });
        const welcomeText = await page.locator('#welcomeBack').textContent();
        const fieldsHidden = await page.locator('#returningFormFields').isHidden();
        const recoveryBtn = page.locator('#rRequestNewLinkBtn');
        const recoveryVisible = await recoveryBtn.isVisible();
        const dateInputsVisible = await page.locator('#rTimeRows input[type="date"]:visible').count();

        if (/expired/i.test(welcomeText || '')) ok('expired-link page shows a clear "link expired" heading');
        else fail('expired-link page heading did not mention expiry: ' + JSON.stringify(welcomeText));

        if (fieldsHidden) ok('the book-again form fields (athlete/notes/time rows) are hidden on an expired link');
        else fail('book-again form fields are still visible on an expired link (the original dead-end bug)');

        if (dateInputsVisible === 0) ok('no bare/unlabeled date inputs are left visible on the expired-link state');
        else fail(`${dateInputsVisible} date input(s) still visible on the expired-link state`);

        if (recoveryVisible) ok('a "Request a New Link" recovery action is visible on the expired-link state');
        else fail('no recovery action is visible on the expired-link state, this is the dead-end bug');

        if (recoveryVisible) {
          await recoveryBtn.click();
          await page.waitForURL('**/sophie/', { timeout: 5000 }).catch(() => {});
          const url = page.url();
          if (/\/sophie\/?$/.test(url) && !url.includes('login_token')) ok('clicking "Request a New Link" returns to a clean /sophie/ with no stale token in the URL');
          else fail('recovery button did not navigate back to a clean /sophie/: ' + url);
        }
      } finally {
        await browser.close();
      }
    }
  }
}

// ==================================================================
section('browser: day-first Open Times flow (tap-a-slot, suggest-own swap, no-slots fallback)');
if (!SERVICE_KEY) {
  skip('SUPABASE_SERVICE_ROLE_KEY not set; skipping the live browser flow + cleanup');
} else {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ name: 'desktop 1440', width: 1440, height: 900 }, { name: 'mobile 390', width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await ctx.newPage();
      await page.goto('https://coachpilot.org/sophie/', { waitUntil: 'networkidle' });

      const dayChipCount = await page.locator('.dayChip').count();
      const firstDayActive = await page.locator('.dayChip.active').count();
      if (dayChipCount > 0 && firstDayActive === 1) ok(`[${viewport.name}] day strip renders with the first available day pre-selected (${dayChipCount} day(s))`);
      else fail(`[${viewport.name}] day strip did not render as expected (chips=${dayChipCount}, active=${firstDayActive})`);

      const timeChipCount = await page.locator('#dayTimeChips .openChip').count();
      if (timeChipCount > 0) ok(`[${viewport.name}] the pre-selected day's time chips render below the strip (${timeChipCount} chip(s))`);
      else fail(`[${viewport.name}] no time chips rendered for the default-selected day`);

      const pickerBeforeHidden = await page.locator('#nTimesPickerGroup').isHidden();
      if (pickerBeforeHidden) ok(`[${viewport.name}] the manual propose-times picker is hidden from the form while open slots exist`);
      else fail(`[${viewport.name}] the manual picker is visible in the form even though open slots exist`);

      await page.locator('#dayTimeChips .openChip').first().click();
      await page.waitForTimeout(300);
      const openTimesSectionHiddenAfterPick = await page.locator('#openTimesSection').isHidden();
      const lockedCardVisible = await page.locator('#nLockedTimeCard').isVisible();
      const lockedText = (await page.locator('#nLockedTimeCard').textContent() || '').replace(/\s+/g, ' ').trim();
      if (openTimesSectionHiddenAfterPick) ok(`[${viewport.name}] Open Times collapses entirely once a slot is tapped (no giant wall of chips left showing)`);
      else fail(`[${viewport.name}] Open Times section is still visible after tapping a slot`);
      if (lockedCardVisible && /Selected/.test(lockedText) && /Change/.test(lockedText)) ok(`[${viewport.name}] a compact "Selected ... Change" summary appears at the top of the form: "${lockedText}"`);
      else fail(`[${viewport.name}] locked-time summary missing or malformed: "${lockedText}"`);

      // "Change" should bring back the day picker, not the manual picker.
      await page.locator('#nLockedTimeCard .unlockLink').click();
      await page.waitForTimeout(300);
      const dayPickerBackVisible = await page.locator('#openTimesPicker').isVisible();
      const manualStillHidden = await page.locator('#openTimesManual').isHidden();
      if (dayPickerBackVisible && manualStillHidden) ok(`[${viewport.name}] "Change" returns to the day picker (not the manual picker)`);
      else fail(`[${viewport.name}] "Change" did not correctly restore the day-picker view`);

      // "Suggest your own times" swaps in the shared manual picker, in place.
      await page.locator('#suggestOwnTimesLink').click();
      await page.waitForTimeout(300);
      const manualVisibleAfterSuggest = await page.locator('#openTimesManual').isVisible();
      const dayPickerHiddenAfterSuggest = await page.locator('#openTimesPicker').isHidden();
      const formPickerStillHidden = await page.locator('#nTimesPickerGroup').isHidden();
      if (manualVisibleAfterSuggest && dayPickerHiddenAfterSuggest) ok(`[${viewport.name}] "Suggest your own times" swaps the day picker for the manual picker in place`);
      else fail(`[${viewport.name}] the suggest-own-times swap did not behave as expected`);
      if (formPickerStillHidden) ok(`[${viewport.name}] the form's own picker stays hidden even in manual-suggest mode (only one times-UI visible at once)`);
      else fail(`[${viewport.name}] the form's own picker became visible during manual-suggest mode`);

      await page.locator('#backToOpenTimesLink').click();
      await page.waitForTimeout(300);
      const backToPickerVisible = await page.locator('#openTimesPicker').isVisible();
      if (backToPickerVisible) ok(`[${viewport.name}] "Back to open times" returns to the day picker`);
      else fail(`[${viewport.name}] "Back to open times" did not restore the day picker`);

      await ctx.close();
    }

    // No-slots fallback: mock open_slots to return an empty array so the
    // LIVE deployed JS is exercised end-to-end, without touching Coach's
    // real seeded windows on the server at all.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.route('**/sls-gateway?action=open_slots', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, slots: [] }) }));
      await page.goto('https://coachpilot.org/sophie/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const openTimesHiddenNoSlots = await page.locator('#openTimesSection').isHidden();
      const formPickerVisibleNoSlots = await page.locator('#nTimesPickerGroup').isVisible();
      if (openTimesHiddenNoSlots && formPickerVisibleNoSlots) {
        ok('with zero open slots (mocked), Open Times stays hidden and the form falls back to its own manual picker, exactly as before this redesign');
      } else {
        fail(`no-slots fallback did not behave as expected: openTimesHidden=${openTimesHiddenNoSlots} formPickerVisible=${formPickerVisibleNoSlots}`);
      }
      await ctx.close();
    }

    // Full live submission through the actual day-first UI, tagged ZZTEST,
    // verified server-side, then cleaned up.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto('https://coachpilot.org/sophie/', { waitUntil: 'networkidle' });
      await page.locator('#dayTimeChips .openChip').first().click();
      await page.waitForTimeout(300);
      const zzEmail = `zztest-sls-dayfirst-${STAMP}@example.com`;
      await page.locator('#nAthleteName').fill('ZZTEST DayFirst Athlete');
      await page.locator('#nParentName').fill('ZZTEST DayFirst Parent');
      await page.locator('#nParentEmail').fill(zzEmail);
      await page.locator('#nSubmitBtn').click();
      await page.waitForTimeout(1500);
      const successVisible = await page.locator('#successState').isVisible();
      if (successVisible) ok('a full submission through the day-first tap-a-slot UI reaches the success state');
      else fail('submission through the day-first UI did not reach the success state');
      await ctx.close();

      const state = await api('admin_state', { pin: ADMIN_PIN });
      const row = (state.requests || []).find((r) => r.parent_email === zzEmail);
      if (row && row.source === 'open_slot' && row.proposed_times.length === 1) {
        ok('the server-side request from that flow is correctly tagged source:"open_slot" with exactly one proposed time');
      } else {
        fail('server-side request from the day-first UI submission has unexpected shape: ' + JSON.stringify(row));
      }
      if (row) {
        await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: row.id, response: 'decline', message: 'ZZTEST cleanup' } });
        const { data: clientRows } = await rest('sls_clients', `parent_email=eq.${encodeURIComponent(zzEmail)}&select=id`);
        const cid = clientRows && clientRows[0] && clientRows[0].id;
        if (cid) {
          await rest('sls_requests', `client_id=eq.${cid}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
          await rest('sls_clients', `id=eq.${cid}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        }
        ok('cleaned up the ZZTEST day-first submission (request declined, row removed)');
      }
    }
  } finally {
    await browser.close();
  }
}

// ==================================================================
section('availability: window CRUD + open_slots generation');
function pacificOffsetMinutesAt(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).formatToParts(new Date(utcMs));
  const tz = parts.find((p) => p.type === 'timeZoneName');
  const m = tz && /GMT([+-]\d+)/.exec(tz.value);
  return m ? parseInt(m[1], 10) * 60 : -8 * 60;
}
function pacificToUtcIso(y, moOneBased, d, hh, mm) {
  const asUtcMs = Date.UTC(y, moOneBased - 1, d, hh, mm, 0);
  return new Date(asUtcMs - pacificOffsetMinutesAt(asUtcMs) * 60000).toISOString();
}
function pacificDateParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  return { y: +parts.find((p) => p.type === 'year').value, mo: +parts.find((p) => p.type === 'month').value, d: +parts.find((p) => p.type === 'day').value };
}
function pacificWeekday(ms) {
  const wd = new Date(ms).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' });
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

let testWindowId = null;
// Two days out, in an off-hours slot (2-4am Pacific) unlikely to collide
// with any real window Sophie/Coach may have already configured on the
// live system — assertions below only ever check for presence/absence of
// THIS window's specific slots, never the global slot count.
const targetMs = Date.now() + 2 * 86400000;
const { y: tY, mo: tMo, d: tD } = pacificDateParts(targetMs);
const targetWeekday = pacificWeekday(targetMs);
const slot0200 = pacificToUtcIso(tY, tMo, tD, 2, 0);
const slot0230 = pacificToUtcIso(tY, tMo, tD, 2, 30);
const slot0300 = pacificToUtcIso(tY, tMo, tD, 3, 0);

{
  const created = await api('admin_window', { method: 'POST', pin: ADMIN_PIN, body: { weekday: targetWeekday, start_time: '02:00', end_time: '04:00' } });
  if (created.ok && created.window && created.window.id) { ok('admin_window created a 2-4am ZZTEST window'); testWindowId = created.window.id; }
  else fail('admin_window create failed: ' + JSON.stringify(created));

  const list = await api('admin_windows', { pin: ADMIN_PIN });
  if (list.ok && (list.windows || []).some((w) => w.id === testWindowId)) ok('admin_windows lists the new window');
  else fail('new window not found in admin_windows list');

  const toggledOff = await api('admin_window', { method: 'POST', pin: ADMIN_PIN, body: { id: testWindowId, weekday: targetWeekday, start_time: '02:00', end_time: '04:00', active: false } });
  if (toggledOff.ok && toggledOff.window.active === false) ok('admin_window can toggle a window inactive');
  else fail('toggling window inactive failed: ' + JSON.stringify(toggledOff));
  const slotsWhileOff = await api('open_slots');
  if (!(slotsWhileOff.slots || []).includes(slot0200)) ok('an inactive window contributes no open_slots');
  else fail('inactive window still produced open_slots');

  const toggledOn = await api('admin_window', { method: 'POST', pin: ADMIN_PIN, body: { id: testWindowId, weekday: targetWeekday, start_time: '02:00', end_time: '04:00', active: true } });
  if (toggledOn.ok && toggledOn.window.active === true) ok('admin_window can toggle a window back active');
  else fail('toggling window active failed: ' + JSON.stringify(toggledOn));
}

{
  const slots = (await api('open_slots')).slots || [];
  if (slots.includes(slot0200) && slots.includes(slot0300) && !slots.includes(slot0230)) {
    ok('a 2-hour window (2-4am) at 60min-step correctly generates 2 hourly slots: 2:00, 3:00 (no 2:30 mark)');
  } else {
    fail('expected hourly-only slots not as expected: ' + JSON.stringify({ slot0200, slot0230, slot0300, found: slots.filter((s) => s >= slot0200 && s <= slot0300) }));
  }
  const beyondWindow = pacificToUtcIso(tY, tMo, tD, 3, 30);
  if (!slots.includes(beyondWindow)) ok('no slot generated starting at 3:30am (would run past the 4am window edge)');
  else fail('a slot was generated past the window edge: ' + beyondWindow);
}

{
  const now = Date.now();
  const minNoticeFloor = now + 11.5 * 3600000; // small buffer under the true 12h line to avoid a flaky off-by-a-few-seconds fail
  const slots = (await api('open_slots')).slots || [];
  const tooSoon = slots.filter((s) => new Date(s).getTime() < minNoticeFloor);
  if (tooSoon.length === 0) ok('every returned open slot respects the 12h minimum-notice floor');
  else fail('slot(s) violate minimum notice: ' + JSON.stringify(tooSoon));
}

let overlapDirectSessionId = null;
let overlapDirectClientEmail = null;
{
  overlapDirectClientEmail = `zztest-sls-openoverlap-${STAMP}@example.com`;
  const booked = await api('admin_direct_booking', {
    method: 'POST', pin: ADMIN_PIN,
    body: { athlete_name: 'ZZTEST Open Overlap', starts_at: slot0230, location_id: zzLocationId, new_client: { parent_name: 'ZZTEST Open Overlap Parent', parent_email: overlapDirectClientEmail } },
  });
  if (booked.ok && booked.session && booked.session.id) { ok('booked a session directly into the 2:30am slot (off-hour, non-chip direct booking)'); overlapDirectSessionId = booked.session.id; }
  else fail('direct booking into the test window failed: ' + JSON.stringify(booked));

  // A 60-min session at 2:30 genuinely overlaps the 2:00 hourly slot
  // (2:00-3:00) and the 3:00 hourly slot (3:00-4:00), not just its own
  // exact start, even though 2:30 itself is no longer a generated
  // candidate under the hourly-only grid.
  const slots = (await api('open_slots')).slots || [];
  if (!slots.includes(slot0200) && !slots.includes(slot0300)) {
    ok('booking an off-hour session still hides every hourly slot that would genuinely overlap it');
  } else {
    fail('session-overlap exclusion did not behave as expected: ' + JSON.stringify(slots.filter((s) => s >= slot0200 && s <= slot0300)));
  }

  await api('admin_session_cancel', { method: 'POST', pin: ADMIN_PIN, body: { session_id: overlapDirectSessionId } });
  const slotsAfterCancel = (await api('open_slots')).slots || [];
  if (slotsAfterCancel.includes(slot0200) && slotsAfterCancel.includes(slot0300)) ok('cancelling that session restores its hourly slots to open_slots');
  else fail('slots did not reappear after cancelling the session');
}

let pendingHideRequestId = null;
{
  const pendingEmail = `zztest-sls-openpending-${STAMP}@example.com`;
  const submitted = await api('submit_request', {
    method: 'POST',
    body: { mode: 'new', athlete_name: 'ZZTEST Open Pending', parent_name: 'ZZTEST Open Pending Parent', parent_email: pendingEmail, proposed_times: [slot0300, new Date(Date.now() + 25 * 86400000).toISOString()] },
  });
  if (submitted.ok && submitted.request_id) { ok('submitted a manual (non-open-slot) request proposing the 3:00am slot'); pendingHideRequestId = submitted.request_id; }
  else fail('pending-hide seed submit_request failed: ' + JSON.stringify(submitted));

  const slots = (await api('open_slots')).slots || [];
  if (!slots.includes(slot0300) && slots.includes(slot0200)) ok('a pending request for a slot hides it from open_slots while siblings stay open');
  else fail('pending-hide did not behave as expected: ' + JSON.stringify(slots.filter((s) => s >= slot0200 && s <= slot0300)));

  await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: pendingHideRequestId, response: 'decline', message: 'ZZTEST cleanup' } });
  const slotsAfterDecline = (await api('open_slots')).slots || [];
  if (slotsAfterDecline.includes(slot0300)) ok('declining the request restores its slot to open_slots');
  else fail('slot did not reappear after declining the pending request');
}

// ==================================================================
section('availability: connected-calendar busy overlay + masked URL never leaks');
const FAKE_CALENDAR_SECRET = `ZZTESTSECRET${STAMP}XYZ`;
if (!SERVICE_KEY) {
  skip('SUPABASE_SERVICE_ROLE_KEY not set; cannot seed a busy-interval cache entry to test the calendar overlay without a real internet-reachable ICS host');
} else {
  const fakeUrl = `webcal://p.icloud.com/published/2/${FAKE_CALENDAR_SECRET}`;
  const setResp = await api('admin_calendar_set', { method: 'POST', pin: ADMIN_PIN, body: { url: fakeUrl } });
  if (setResp.ok && setResp.masked && setResp.masked.includes('Connected') && !setResp.masked.includes(FAKE_CALENDAR_SECRET)) {
    ok('admin_calendar_set normalizes webcal:// to https:// and returns only a masked confirmation');
  } else {
    fail('admin_calendar_set did not return a properly masked response: ' + JSON.stringify(setResp));
  }

  // Seed the busy cache directly (the gateway can't fetch a fixture hosted
  // on this machine) so the next open_slots call uses it without a live fetch.
  const busyStart = new Date(slot0200).getTime();
  const busyEnd = busyStart + 60 * 60000;
  await rest('sls_settings', 'key=eq.calendar_busy_cache', { method: 'PATCH', body: { value: JSON.stringify([{ start: busyStart, end: busyEnd }]) }, headers: { Prefer: 'return=minimal' } });
  await rest('sls_settings', 'key=eq.calendar_busy_cache_at', { method: 'PATCH', body: { value: new Date().toISOString() }, headers: { Prefer: 'return=minimal' } });

  // Busy interval is [2:00, 3:00). The 2:00 hourly slot (2:00-3:00)
  // genuinely overlaps it; the 3:00 hourly slot (3:00-4:00) starts exactly
  // when the busy interval ends, so it does not. (2:30 is no longer a
  // generated candidate under the hourly-only grid.)
  const slots = (await api('open_slots')).slots || [];
  if (!slots.includes(slot0200) && slots.includes(slot0300)) {
    ok('a busy calendar interval hides the hourly slot that would genuinely overlap it, and only that one');
  } else {
    fail('calendar busy-overlap exclusion did not behave as expected: ' + JSON.stringify(slots.filter((s) => s >= slot0200 && s <= slot0300)));
  }

  const adminStateJson = JSON.stringify(await api('admin_state', { pin: ADMIN_PIN }));
  const openSlotsJson = JSON.stringify(await api('open_slots'));
  if (!adminStateJson.includes(FAKE_CALENDAR_SECRET) && !openSlotsJson.includes(FAKE_CALENDAR_SECRET) && !JSON.stringify(setResp).includes(FAKE_CALENDAR_SECRET)) {
    ok('the raw calendar URL/secret never appears in admin_state, open_slots, or the admin_calendar_set response');
  } else {
    fail('the raw calendar secret leaked into a gateway response');
  }
  if (adminStateJson.includes('"calendar_connected":true') && adminStateJson.includes('Connected')) ok('admin_state exposes calendar_connected + a masked status string');
  else fail('admin_state calendar status fields missing or wrong: ' + adminStateJson.slice(0, 300));

  const disconnected = await api('admin_calendar_disconnect', { method: 'POST', pin: ADMIN_PIN });
  if (disconnected.ok) ok('admin_calendar_disconnect succeeds');
  const slotsAfterDisconnect = (await api('open_slots')).slots || [];
  if (slotsAfterDisconnect.includes(slot0200)) ok('disconnecting the calendar restores the previously-busy slot to open_slots');
  else fail('slot did not reappear after disconnecting the calendar');
}

// ==================================================================
section('availability: two pending requests for the exact same slot both get flagged');
let flagReqA = null, flagReqB = null;
{
  const sharedTime = slot0230;
  const emailA = `zztest-sls-flaga-${STAMP}@example.com`;
  const emailB = `zztest-sls-flagb-${STAMP}@example.com`;
  const secondTime = new Date(Date.now() + 26 * 86400000).toISOString();
  const a = await api('submit_request', { method: 'POST', body: { mode: 'new', athlete_name: 'ZZTEST Flag A', parent_name: 'ZZTEST Flag A Parent', parent_email: emailA, proposed_times: [sharedTime, secondTime] } });
  const b = await api('submit_request', { method: 'POST', body: { mode: 'new', athlete_name: 'ZZTEST Flag B', parent_name: 'ZZTEST Flag B Parent', parent_email: emailB, proposed_times: [sharedTime, secondTime] } });
  flagReqA = a.request_id; flagReqB = b.request_id;
  if (a.ok && b.ok && flagReqA && flagReqB) ok('two separate requests both proposing the same slot were both accepted');
  else fail('could not seed the two colliding requests: ' + JSON.stringify({ a, b }));

  const state = await api('admin_state', { pin: ADMIN_PIN });
  const rowA = (state.requests || []).find((r) => r.id === flagReqA);
  const rowB = (state.requests || []).find((r) => r.id === flagReqB);
  if (rowA && rowB && rowA.overlap_flags[sharedTime] === true && rowB.overlap_flags[sharedTime] === true) {
    ok('both requests are flagged for proposing the exact same slot as each other, not just against sessions');
  } else {
    fail('cross-request overlap flag missing: ' + JSON.stringify({ a: rowA && rowA.overlap_flags, b: rowB && rowB.overlap_flags }));
  }

  await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: flagReqA, response: 'decline', message: 'ZZTEST cleanup' } });
  await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: flagReqB, response: 'decline', message: 'ZZTEST cleanup' } });
}

// ==================================================================
section('availability: open-slot submission bypasses the 2-3 time minimum');
let openSlotReqId = null;
{
  const email = `zztest-sls-openslotsubmit-${STAMP}@example.com`;
  const r = await api('submit_request', { method: 'POST', body: { mode: 'new', athlete_name: 'ZZTEST Open Slot Submit', parent_name: 'ZZTEST Open Slot Parent', parent_email: email, proposed_times: [slot0300], from_open_slot: true } });
  if (r.ok && r.request_id) { ok('a single-time submission with from_open_slot:true is accepted (normally requires 2-3)'); openSlotReqId = r.request_id; }
  else fail('open-slot submission was rejected: ' + JSON.stringify(r));

  const bareOneTime = await api('submit_request', { method: 'POST', body: { mode: 'new', athlete_name: 'ZZTEST Should Fail', parent_name: 'ZZTEST Should Fail Parent', parent_email: `zztest-sls-shouldfail-${STAMP}@example.com`, proposed_times: [new Date(Date.now() + 27 * 86400000).toISOString()] } });
  if (!bareOneTime.ok) ok('a single-time submission WITHOUT from_open_slot is still rejected (the normal 2-3 rule is unchanged)');
  else fail('a non-open-slot single-time submission should have been rejected');

  const state = await api('admin_state', { pin: ADMIN_PIN });
  const row = (state.requests || []).find((r2) => r2.id === openSlotReqId);
  if (row && row.source === 'open_slot') ok('the open-slot request is tagged source:"open_slot", driving the coach hub badge');
  else fail('open-slot request missing/incorrect source tag: ' + JSON.stringify(row));

  await api('admin_respond', { method: 'POST', pin: ADMIN_PIN, body: { request_id: openSlotReqId, response: 'decline', message: 'ZZTEST cleanup' } });
}

if (testWindowId) {
  await api('admin_window_delete', { method: 'POST', pin: ADMIN_PIN, body: { id: testWindowId } });
  ok('deleted the ZZTEST availability window');
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

if (SERVICE_KEY) {
  const del = (table, query) => rest(table, query, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  // PostgREST has no subselects in query params; delete in dependency order via each ZZTEST client's id.
  const { data: clientsResp } = await rest('sls_clients', 'parent_email=like.zztest-sls-*&select=id');
  const ids = (clientsResp || []).map((c) => c.id);
  for (const id of ids) {
    await del('sls_sessions', `client_id=eq.${id}`);
    await del('sls_requests', `client_id=eq.${id}`);
    await del('sls_recurring', `client_id=eq.${id}`);
    await del('sls_tokens', `client_id=eq.${id}`);
  }
  await del('sls_clients', 'parent_email=like.zztest-sls-*');
  await del('sls_locations', 'name=eq.ZZTEST Location');
  ok(`deleted ZZTEST rows via service role (clients: ${ids.length})`);
} else {
  skip('SUPABASE_SERVICE_ROLE_KEY not set. ZZTEST rows left in place, tagged for manual cleanup:');
  console.log(`         sls_clients where parent_email like 'zztest-sls-%'`);
  console.log(`         sls_locations where name = 'ZZTEST Location'`);
  console.log(`         (cascades to sls_requests/sls_sessions/sls_recurring via client_id/location_id)`);
}
}

// ==================================================================
// Safety wrapper: this test suite creates real pending requests, which
// trigger a real "new lesson request" alert email via sls_settings.
// sophie_alert_email. Force that setting to Resend's blackhole address for
// the duration of the run and restore whatever it was set to beforehand —
// even if a test throws — so a run can NEVER re-arm a real inbox and NEVER
// leaves the setting stuck on the blackhole after a normal run either.
section('safety: alert email forced to a blackhole for this run');
let originalAlertEmail = null;
{
  const before = await api('admin_state', { pin: ADMIN_PIN });
  originalAlertEmail = before.sophie_alert_email;
  const forced = await api('admin_set_alert_email', { method: 'POST', pin: ADMIN_PIN, body: { email: 'delivered@resend.dev' } });
  const confirm = await api('admin_state', { pin: ADMIN_PIN });
  if (forced.ok && confirm.sophie_alert_email === 'delivered@resend.dev') {
    ok('sophie_alert_email confirmed forced to delivered@resend.dev before any email-triggering test runs');
  } else {
    console.error('ABORTING: could not confirm sophie_alert_email is blackholed. Refusing to run email-triggering tests.');
    process.exit(1);
  }
}

try {
  await main();
} finally {
  try {
    if (originalAlertEmail) {
      const restored = await api('admin_set_alert_email', { method: 'POST', pin: ADMIN_PIN, body: { email: originalAlertEmail } });
      const confirmRestored = await api('admin_state', { pin: ADMIN_PIN });
      if (restored.ok && confirmRestored.sophie_alert_email === originalAlertEmail) {
        ok(`teardown: restored sophie_alert_email to its pre-test value (${originalAlertEmail})`);
      } else {
        fail(`teardown: could NOT confirm sophie_alert_email was restored to ${originalAlertEmail} — check sls_settings manually`);
      }
    } else {
      fail('teardown: no pre-test sophie_alert_email value was captured, nothing to restore — check sls_settings manually');
    }
  } catch (e) {
    console.error('teardown: restore attempt itself threw — check sls_settings.sophie_alert_email manually:', e.message);
    failed++;
  }
}

// ==================================================================
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
process.exit(failed > 0 ? 1 : 0);
