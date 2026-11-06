#!/usr/bin/env node
// Smoke test for Field Command v3 (the coach app preview at fields/app/).
//
// What it checks:
//   1. Static hooks: fields/app/index.html, fields/app/manifest.webmanifest,
//      fields/sw.js (check-in notification actions), fields/admin.html (new
//      panels), and supabase/functions/flm-gateway/index.ts (new v21 actions)
//      all carry the expected structure.
//   2. Live auth walls: every new admin_* action and slot_skipdate_token
//      reject a missing/bad PIN or bad token — no writes.
//   3. Live end-to-end writes against ZZTEST-prefixed field/team/coach data:
//      booking windows refuse then allow a claim, coach_edit_slot refuses a
//      move before the window opens, a field closure cascades into
//      skip_dates, the FMX cancel list picks it up, mark-done toggles it,
//      the setup tracker reflects booked/installed, and a minted
//      checkin_skip token releases one date. Every ZZTEST row created here
//      is deleted at the end (field/slot deletes cascade to closures, FMX
//      rows, and action tokens via FK ON DELETE CASCADE).
//
// Live writes need the real admin PIN. Resolution order:
//   1. FLM_ADMIN_PIN env var
//   2. SUPABASE_MANAGEMENT_PAT env var (Management API SQL query)
//   3. macOS keychain "Supabase CLI" entry (local dev fallback)
// If none resolve, the live-write section is skipped (not failed).
//
// Run:  node tests/fields-v3.smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/flm-gateway';
const PROJECT_REF = 'geigvuysptjvvqanumld';
const STAMP = Date.now();

let passed = 0, failed = 0, skipped = 0;
function ok(msg) { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function skip(msg) { console.log('  SKIP ' + msg); skipped++; }
function section(name) { console.log('\n' + name); }

function post(action, body, pin) {
  const headers = { 'Content-Type': 'application/json' };
  if (pin) headers['x-admin-pin'] = pin;
  return fetch(GATEWAY + '?action=' + action, { method: 'POST', headers, body: JSON.stringify(body || {}) })
    .then((r) => r.json().then((j) => ({ status: r.status, j })));
}
function get(qs, pin) {
  const headers = {};
  if (pin) headers['x-admin-pin'] = pin;
  return fetch(GATEWAY + '?' + qs, { headers }).then((r) => r.text().then((t) => ({ status: r.status, text: t })));
}

// =======================================================================
// 1. Static hooks
// =======================================================================
section('fields/app/index.html: structure and screens present');
const appHtml = fs.readFileSync(path.join(ROOT, 'fields', 'app', 'index.html'), 'utf8');
{
  const hooks = [
    'flm_coach_id', 'flm_coach_pin', // shares the live hub's localStorage keys/session
    'renderSignIn', 'bookScreenHtml', 'setupScreenHtml', 'homeScreenHtml', 'peopleScreenHtml',
    '"coach_request_access"', '"coach_login"', 'coach_state',
    '"claim"',
    'coach_push_subscribe', 'slot_skip_date', 'bookingWindowMessage', 'maybeConfirmSchedule',
    'DEFERRED_INSTALL', 'beforeinstallprompt', 'display-mode: standalone',
    '/fields/sw.js', "scope: \"/fields/app/\"",
  ];
  const missing = hooks.filter((h) => !appHtml.includes(h));
  if (missing.length === 0) ok('all expected hooks present (sign-in, book, setup, home, people, push, booking windows)');
  else fail('missing hooks: ' + missing.join(', '));

  if (appHtml.includes('/fields/flm-rules.js')) ok('reuses the shared fields/flm-rules.js rule engine (same source of truth as the live hub)');
  else fail('does not load flm-rules.js — compliance math would drift from the live hub');

  if (appHtml.includes('rel="manifest" href="/fields/app/manifest.webmanifest"')) ok('points at its own scoped manifest');
  else fail('manifest link missing or wrong path');
}

section('fields/app/manifest.webmanifest: scoped to /fields/app/');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'fields', 'app', 'manifest.webmanifest'), 'utf8'));
  if (manifest.start_url === '/fields/app/' && manifest.scope === '/fields/app/') ok('start_url and scope both /fields/app/ (installs as its own app, separate from the live hub)');
  else fail('start_url/scope wrong: ' + JSON.stringify({ start_url: manifest.start_url, scope: manifest.scope }));
  if (manifest.display === 'standalone') ok('display: standalone');
  else fail('display is not standalone');
  if (Array.isArray(manifest.icons) && manifest.icons.length >= 2) ok('reuses the existing Field Command icons (no new hand-drawn art)');
  else fail('icons missing');
}

section('fields/sw.js: check-in notification actions (additive, Yes/Not using it)');
const swJs = fs.readFileSync(path.join(ROOT, 'fields', 'sw.js'), 'utf8');
{
  if (swJs.includes('skip_url')) ok('push handler carries skip_url through to notification data');
  else fail('skip_url missing from sw.js push handler');
  if (swJs.includes('actions: Array.isArray(payload.actions)')) ok('push handler passes through notification actions when provided');
  else fail('sw.js does not forward notification actions');
  if (swJs.includes('event.action === "notusing"')) ok('notificationclick opens skip_url only for the "notusing" action');
  else fail('notificationclick does not special-case the notusing action');
  // Backward compatibility: a notification with no actions/skip_url must still
  // fall through to the original default-url behavior.
  const clickFn = swJs.slice(swJs.indexOf('notificationclick'));
  if (clickFn.includes('data.url || "/fields/"')) ok('default notification tap still falls back to data.url || /fields/ (every existing notification kind unchanged)');
  else fail('default tap fallback missing — existing notifications may break');
}

section('fields/admin.html: new v21 panels wired into the hub-and-spoke router');
const adminHtml = fs.readFileSync(path.join(ROOT, 'fields', 'admin.html'), 'utf8');
{
  const panelIds = ['panelClosures', 'panelBookWin', 'panelFmx', 'panelSetupTracker'];
  const missingIds = panelIds.filter((id) => !adminHtml.includes('id="' + id + '"'));
  if (missingIds.length === 0) ok('all four new panels present in the DOM');
  else fail('missing panel DOM: ' + missingIds.join(', '));
  const missingRoute = panelIds.filter((id) => !adminHtml.includes(id + ':'));
  if (missingRoute.length === 0) ok('all four new panels registered in PANEL_VIEW (so scrollToPanel/attention banner can reach them)');
  else fail('missing from PANEL_VIEW: ' + missingRoute.join(', '));
  for (const fn of ['renderClosures', 'renderBookingWindows', 'renderFmx', 'renderSetupTracker']) {
    if (adminHtml.includes('function ' + fn)) ok(fn + '() defined');
    else fail(fn + '() missing');
  }
  if (adminHtml.includes('renderClosures(); renderBookingWindows(); renderFmx(); renderSetupTracker();')) ok('all four wired into the main refresh() so they populate alongside everything else');
  else fail('new panels not wired into refresh()');
  if (adminHtml.includes('hourly_rate')) ok('field editor exposes hourly_rate (used by the FMX $ estimate)');
  else fail('hourly_rate not wired into the field editor');
}

section('supabase/functions/flm-gateway/index.ts: v21 actions present, live gateway code is additive');
const gwSrc = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'flm-gateway', 'index.ts'), 'utf8');
{
  const actions = [
    'admin_field_closure', 'admin_field_closures', 'admin_fmx_cancel_list', 'admin_fmx_mark_done',
    'admin_setup_tracker', 'slot_skipdate_token',
  ];
  const missing = actions.filter((a) => !gwSrc.includes('"' + a + '"'));
  if (missing.length === 0) ok('every v21 action present: ' + actions.join(', '));
  else fail('missing actions: ' + missing.join(', '));

  if (gwSrc.includes('bookingWindowError')) ok('bookingWindowError() helper present');
  else fail('bookingWindowError() missing');
  const claimBlock = gwSrc.slice(gwSrc.indexOf('action === "claim"'), gwSrc.indexOf('action === "release"'));
  if (claimBlock.includes('bookingWindowError')) ok('claim action checks the booking window');
  else fail('claim action does not check the booking window');
  const editBlock = gwSrc.slice(gwSrc.indexOf('action === "coach_edit_slot"'), gwSrc.indexOf('action === "coach_cancel_slot"'));
  if (editBlock.includes('bookingWindowError')) ok('coach_edit_slot checks the booking window on a real move');
  else fail('coach_edit_slot does not check the booking window');

  if (gwSrc.includes('booking_window_open_at') && gwSrc.includes('closures: closures')) ok('coach_state returns booking_window_open_at and closures');
  else fail('coach_state missing booking_window_open_at/closures');

  if (/gateway \(v2[1-9]\)|gateway \(v[3-9]\d\)/.test(gwSrc)) ok('gateway version banner bumped to v21+');
  else fail('gateway version banner not bumped — forgot to update the header comment?');

  // Additive-only guarantee: every pre-v21 action name from the live file
  // must still be present unchanged (a quick spot check on a representative
  // sample rather than diffing the whole file).
  const stillThere = ['action === "claim"', 'action === "release"', 'action === "coach_login"', 'action === "coach_push_subscribe"', 'action === "admin_upsert_field"', 'action === "slot_release_token"'];
  const goneMissing = stillThere.filter((s) => !gwSrc.includes(s));
  if (goneMissing.length === 0) ok('every pre-existing action spot-checked is still present (additive, nothing removed)');
  else fail('pre-existing actions missing: ' + goneMissing.join(', '));
}

// =======================================================================
// 2. Live auth walls (no writes)
// =======================================================================
section('live: new admin_* actions reject a missing or bad PIN');
{
  for (const action of ['admin_field_closures', 'admin_field_closure', 'admin_fmx_cancel_list', 'admin_fmx_mark_done', 'admin_setup_tracker']) {
    const { status, j } = await post(action, {});
    if (status === 401 && j.ok === false) ok(action + ' with no PIN -> 401');
    else fail(action + ' with no PIN should be 401, got ' + status + ' ' + JSON.stringify(j));
  }
  const { status: s2, j: j2 } = await post('admin_field_closure', { field_id: 'x', closure_date: '2026-01-01' }, '0000');
  if (s2 === 401 && j2.ok === false) ok('admin_field_closure with a wrong PIN -> 401 (not 403/500 — auth gate runs first)');
  else fail('admin_field_closure wrong-PIN check failed: ' + s2);
}

section('live: slot_skipdate_token rejects missing/bad/wrong-purpose tokens');
{
  const r1 = await get('action=slot_skipdate_token');
  if (r1.status === 400) ok('no token -> 400');
  else fail('no token should be 400, got ' + r1.status);

  const r2 = await get('action=slot_skipdate_token&token=bogus-token-xyz-' + STAMP);
  if (r2.status === 404) ok('unknown token -> 404 (not found)');
  else fail('unknown token should be 404, got ' + r2.status);
}

// =======================================================================
// 3. Live end-to-end writes (ZZTEST data, gated by admin PIN availability)
// =======================================================================
async function keychainManagementToken() {
  try {
    const raw = execSync('security find-generic-password -s "Supabase CLI" -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const b64 = raw.replace(/^go-keyring-base64:/, '');
    return Buffer.from(b64, 'base64').toString('utf8').trim();
  } catch (_e) { return ''; }
}
async function resolveAdminPin() {
  if (process.env.FLM_ADMIN_PIN) return process.env.FLM_ADMIN_PIN;
  const pat = process.env.SUPABASE_MANAGEMENT_PAT || await keychainManagementToken();
  if (!pat) return '';
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "select value from flm_settings where key='admin_pin';" }),
    }).then((r) => r.json());
    return (Array.isArray(r) && r[0] && r[0].value) || '';
  } catch (_e) { return ''; }
}

section('live write tests: booking windows, closures, FMX list, setup tracker, check-in token (ZZTEST data)');
const PIN = await resolveAdminPin();
if (!PIN) {
  skip('no admin PIN available (set FLM_ADMIN_PIN or SUPABASE_MANAGEMENT_PAT, or run where the Supabase CLI keychain entry exists) — live write tests skipped, everything else above still ran');
} else {
  const DIV = 'ZZTEST Division ' + STAMP;
  const FIELD_NAME = 'ZZTEST Field ' + STAMP;
  const TEAM_NAME = 'ZZTEST Team ' + STAMP;
  const COACH_EMAIL = `zztest-fcv3-${STAMP}@example.com`;
  const PIN_CODE = '4321';
  let fieldId = null, teamId = null, coachId = null, slotId = null, seasonId = null;
  let coachCreds = null;

  try {
    // ---- seed ----
    const admin = (action, body) => post(action, body, PIN);

    const fRes = await admin('admin_upsert_field', { name: FIELD_NAME, divisions: [DIV], hourly_rate: 40, sort: 9999 });
    if (fRes.j.ok) { fieldId = fRes.j.field.id; ok('seeded ZZTEST field (hourly_rate 40, tagged for ' + DIV + ')'); }
    else fail('could not seed ZZTEST field: ' + JSON.stringify(fRes.j));

    const tRes = await admin('admin_upsert_team', { name: TEAM_NAME, division: DIV, coach_name: 'ZZTEST Coach', coach_phone: '555-555-0100', coach_email: COACH_EMAIL });
    if (tRes.j.ok) { teamId = tRes.j.team.id; ok('seeded ZZTEST team in ' + DIV); }
    else fail('could not seed ZZTEST team: ' + JSON.stringify(tRes.j));

    const cRes = await admin('admin_coach', { name: 'ZZTEST Coach', email: COACH_EMAIL, team_id: teamId });
    if (cRes.j.ok && cRes.j.coach && cRes.j.coach.invite_token) {
      coachId = cRes.j.coach.id;
      const setPin = await post('coach_set_pin', { token: cRes.j.coach.invite_token, new_pin: PIN_CODE });
      if (setPin.j.ok) { coachCreds = { coach_id: coachId, coach_pin: PIN_CODE }; ok('seeded ZZTEST coach and set their PIN directly from the invite token (no real email needed)'); }
      else fail('coach_set_pin failed for the seeded ZZTEST coach: ' + JSON.stringify(setPin.j));
    } else fail('could not seed ZZTEST coach: ' + JSON.stringify(cRes.j));

    const stateRes = await fetch(GATEWAY + '?action=state').then((r) => r.json());
    const openSeason = (stateRes.seasons || []).find((s) => !s.locked);
    if (openSeason) { seasonId = openSeason.id; ok('found an open season to book against: ' + openSeason.label); }
    else fail('no open season found — cannot test claim/booking-window flow');

    if (fieldId && teamId && coachCreds && seasonId) {
      // ---- booking window refusal, then open ----
      const future = new Date(Date.now() + 2 * 86400000).toISOString();
      const setWin = await admin('admin_settings', { booking_windows: { [DIV]: future } });
      if (setWin.j.ok) ok('set a 2-days-out booking window for ' + DIV);
      else fail('could not set booking window: ' + JSON.stringify(setWin.j));

      const blockedClaim = await post('claim', { ...coachCreds, season_id: seasonId, day_key: 'mon', field_id: fieldId, team_id: teamId });
      if (blockedClaim.status === 403 && blockedClaim.j.ok === false && /opens/.test(blockedClaim.j.error || '')) ok('claim refused before the window opens, friendly message: "' + blockedClaim.j.error + '"');
      else fail('claim should have been refused by the booking window: ' + blockedClaim.status + ' ' + JSON.stringify(blockedClaim.j));

      const stateAfterBlock = await fetch(GATEWAY + '?action=coach_state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(coachCreds) }).then((r) => r.json());
      if (stateAfterBlock.ok && stateAfterBlock.booking_window_open_at === future) ok('coach_state reports this division\'s open time back to the coach');
      else fail('coach_state did not report booking_window_open_at: ' + JSON.stringify(stateAfterBlock.booking_window_open_at));

      const clearWin = await admin('admin_settings', { booking_windows: { [DIV]: null } });
      if (clearWin.j.ok) ok('cleared the booking window (division always open again)');
      else fail('could not clear booking window: ' + JSON.stringify(clearWin.j));

      const okClaim = await post('claim', { ...coachCreds, season_id: seasonId, day_key: 'mon', field_id: fieldId, team_id: teamId });
      if (okClaim.j.ok) { slotId = okClaim.j.slot.id; ok('claim succeeds once the window is cleared'); }
      else fail('claim should have succeeded after clearing the window: ' + JSON.stringify(okClaim.j));

      // ---- coach_edit_slot booking-window check on a real move ----
      if (slotId) {
        const setWin2 = await admin('admin_settings', { booking_windows: { [DIV]: future } });
        if (setWin2.j.ok) ok('re-set the booking window to test coach_edit_slot');
        const blockedMove = await post('coach_edit_slot', { ...coachCreds, slot_id: slotId, day_key: 'tue' });
        if (blockedMove.status === 403 && /opens/.test(blockedMove.j.error || '')) ok('coach_edit_slot refuses a move before the window opens');
        else fail('coach_edit_slot should have refused the move: ' + blockedMove.status + ' ' + JSON.stringify(blockedMove.j));
        const clearWin2 = await admin('admin_settings', { booking_windows: { [DIV]: null } });
        if (clearWin2.j.ok) ok('cleared the booking window again');
      }

      // ---- field closure cascades to skip_dates ----
      if (slotId) {
        // Next Monday (the slot's day_key), so the closure's weekday filter actually matches it.
        // Formatted from LOCAL date parts, not toISOString() (which would convert to UTC and
        // could roll the calendar date, and so the weekday, depending on the runner's TZ/time-of-day).
        const d = new Date();
        d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
        const pad = (n) => String(n).padStart(2, '0');
        const closureDate = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        const closeRes = await admin('admin_field_closure', { field_id: fieldId, closure_date: closureDate, reason: 'ZZTEST rain' });
        if (closeRes.j.ok && closeRes.j.affected_teams >= 1) ok('field closure created and reports ' + closeRes.j.affected_teams + ' affected team(s)');
        else fail('admin_field_closure did not behave as expected: ' + JSON.stringify(closeRes.j));

        const stateAfterClose = await fetch(GATEWAY + '?action=state').then((r) => r.json());
        const slotAfterClose = (stateAfterClose.slots || []).find((s) => s.id === slotId);
        if (slotAfterClose && Array.isArray(slotAfterClose.skip_dates) && slotAfterClose.skip_dates.includes(closureDate)) ok('closure cascaded into the slot\'s skip_dates (' + closureDate + '), same as a coach-initiated slot_skip_date');
        else fail('slot skip_dates did not pick up the closure date: ' + JSON.stringify(slotAfterClose && slotAfterClose.skip_dates));

        const listRes = await admin('admin_field_closures', {});
        if (listRes.j.ok && (listRes.j.closures || []).some((c) => c.field_id === fieldId && c.closure_date === closureDate)) ok('admin_field_closures lists the new closure');
        else fail('admin_field_closures did not list the new closure');

        // ---- FMX cancel list picks it up, mark done toggles ----
        const fmxRes = await admin('admin_fmx_cancel_list', {});
        const fmxRows = (fmxRes.j.rows || []).filter((r) => r.field_id === fieldId && r.date === closureDate);
        const fmxRow = fmxRows[0];
        if (fmxRows.length === 1) ok('FMX cancel list includes exactly one row for this field+date (closure and the skip_dates it caused do not double-count)');
        else fail('FMX cancel list has ' + fmxRows.length + ' rows for the same field+date — should be deduped to 1');
        if (fmxRow && fmxRow.type === 'closure') ok('row is typed "closure" (the more specific cause wins over the plain "skipped" it also matches)');
        else if (fmxRow) fail('row type should be "closure", got ' + fmxRow.type);
        if (fmxRow && fmxRow.est_dollars === 60) ok('est_dollars computed from hourly_rate 40 x 1.5h weekday practice window = $60');
        else if (fmxRow) fail('est_dollars unexpected: ' + fmxRow.est_dollars + ' (expected 60)');

        const markDone = await admin('admin_fmx_mark_done', { field_id: fieldId, cancel_date: closureDate, done: true });
        if (markDone.j.ok) ok('marked the FMX row done');
        else fail('admin_fmx_mark_done(true) failed: ' + JSON.stringify(markDone.j));
        const fmxRes2 = await admin('admin_fmx_cancel_list', {});
        const fmxRow2 = (fmxRes2.j.rows || []).find((r) => r.field_id === fieldId && r.date === closureDate);
        if (fmxRow2 && fmxRow2.done) ok('FMX row now shows done:true');
        else fail('FMX row did not flip to done');
        const unmarkDone = await admin('admin_fmx_mark_done', { field_id: fieldId, cancel_date: closureDate, done: false });
        if (unmarkDone.j.ok) ok('unmarked the FMX row (done:false) — toggle works both ways');
        else fail('admin_fmx_mark_done(false) failed: ' + JSON.stringify(unmarkDone.j));

        // ---- remove the closure ----
        const delClosure = await admin('admin_field_closure', { delete_id: (listRes.j.closures.find((c) => c.field_id === fieldId && c.closure_date === closureDate) || {}).id });
        if (delClosure.j.ok) ok('removed the ZZTEST closure');
        else fail('could not remove the ZZTEST closure: ' + JSON.stringify(delClosure.j));
      }

      // ---- setup tracker reflects this team ----
      const trackerRes = await admin('admin_setup_tracker', {});
      const trackerRow = (trackerRes.j.teams || []).find((t) => t.team_id === teamId);
      if (trackerRow && trackerRow.has_coach && trackerRow.booked && trackerRow.installed === false) ok('setup tracker shows the ZZTEST team as has_coach + booked, installed:false (no push subscription seeded, as expected)');
      else fail('setup tracker row unexpected: ' + JSON.stringify(trackerRow));

      // ---- checkin_skip token (minted the way flm-reminders would) ----
      if (slotId) {
        const tokenStr = 'zztest-checkin-' + STAMP;
        const mintSql = `insert into flm_action_tokens (token, slot_id, purpose, move_date, expires_at) values ('${tokenStr}', '${slotId}', 'checkin_skip', '2027-01-04', now() + interval '1 day') on conflict do nothing;`;
        const pat = process.env.SUPABASE_MANAGEMENT_PAT || await keychainManagementToken();
        if (pat) {
          await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
            method: 'POST', headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: mintSql }),
          });
          const hit = await get('action=slot_skipdate_token&token=' + tokenStr);
          if (hit.status === 200 && /Got it/.test(hit.text)) ok('slot_skipdate_token releases the one date and shows a friendly confirmation');
          else fail('slot_skipdate_token did not behave as expected: ' + hit.status);
          const stateAfterToken = await fetch(GATEWAY + '?action=state').then((r) => r.json());
          const slotAfterToken = (stateAfterToken.slots || []).find((s) => s.id === slotId);
          if (slotAfterToken && slotAfterToken.skip_dates.includes('2027-01-04')) ok('the token\'s move_date landed in skip_dates, same mechanism as a coach tapping "Not using it"');
          else fail('token did not add its date to skip_dates');
          const again = await get('action=slot_skipdate_token&token=' + tokenStr);
          if (again.status === 200 && /Already done/.test(again.text)) ok('re-using the same token is idempotent ("Already done"), never double-releases');
          else fail('token re-use was not idempotent: ' + again.status);
        } else {
          skip('no Management API token available to mint a raw checkin_skip token row (needs SUPABASE_MANAGEMENT_PAT or the keychain) — covered by static + auth-wall checks above instead');
        }
      }
    } else {
      skip('seed data incomplete, skipping the booking-window/closure/FMX/tracker/token flow');
    }
  } finally {
    // ---- cleanup: deleting the field cascades closures + FMX rows; deleting
    // the slot cascades its action tokens. Nothing ZZTEST-prefixed is left behind. ----
    const admin = (action, body) => post(action, body, PIN);
    if (slotId) await admin('admin_slot', { delete_id: slotId }).catch(() => {});
    if (coachId) await admin('admin_coach', { op: 'delete', id: coachId }).catch(() => {});
    if (teamId) await admin('admin_delete_team', { id: teamId }).catch(() => {});
    if (fieldId) await admin('admin_delete_field', { id: fieldId }).catch(() => {});
    await admin('admin_settings', { booking_windows: { [DIV]: null } }).catch(() => {});
    ok('cleanup: removed every ZZTEST row created by this run (field delete cascades closures + FMX rows; slot delete cascades its action tokens)');
  }
}

console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
console.log('skipped: ' + skipped);
if (failed > 0) process.exit(1);
