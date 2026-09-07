#!/usr/bin/env node
// Smoke test for the Field Help sign-up (cougars/fieldhelp.html + cougars_field_slots
// + cougars-gateway field actions).
//
// What it checks:
//   1. fieldhelp.html exists with required copy (league rule, claim flow, page_view ping).
//   2. No em/en dashes or curly quotes in the new parent-facing copy.
//   3. Hub has the Team pages card; Coach HQ has the claims panel + unclaim.
//   4. Gateway repo source has the fieldhelp page + field actions.
//   5. Live gateway: field_slots returns the seeded board (8 games, 21 slots,
//      correct home/away roles); bad claims rejected; unclaim needs the PIN.
//   6. With COUGARS_PIN: full claim -> 409 race guard -> PIN unclaim round trip
//      on a real open slot (self-cleaning: the slot ends open again).
//
// Run:  COUGARS_PIN=xxxx node tests/cougars-fieldhelp.smoke.mjs   (PIN optional)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/cougars-gateway';
const PIN = process.env.COUGARS_PIN || '';

let passed = 0, failed = 0;
function ok(msg)   { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function section(name) { console.log('\n' + name); }

// ------- 1. fieldhelp.html: file + copy -------
section('fieldhelp.html: file + copy');
const PAGE = path.join(ROOT, 'cougars', 'fieldhelp.html');
if (!fs.existsSync(PAGE)) { fail('cougars/fieldhelp.html missing'); process.exit(1); }
const pageHtml = fs.readFileSync(PAGE, 'utf8');
const mustContain = [
  'Field Help Sign-Up',
  'the home team sets up the field before the game, and the away team cleans up after',
  'We set up the field.',
  'We clean up.',
  'drags the field and sets the bases',
  'chalk the lines',
  'puts the bases away',
  'action=field_slots',
  'action=claim_field',
  'Another family just grabbed this one',
  'page: "fieldhelp"',
  'Back to the team hub',
  'noindex',
];
for (const s of mustContain) {
  if (pageHtml.includes(s)) ok('contains: ' + s.slice(0, 60));
  else fail('MISSING: ' + s);
}

// ------- 2. Forbidden chars in parent-facing copy -------
section('parent-facing: no em/en dashes or curly quotes');
const forbidden = { '—': 'em-dash', '–': 'en-dash', '’': 'curly-apos', '‘': 'curly-apos-l', '“': 'curly-quote-l', '”': 'curly-quote-r' };
let charHits = 0;
const checkable = pageHtml.replace(/<title>[\s\S]*?<\/title>/, '');
for (const [ch, name] of Object.entries(forbidden)) {
  const idx = checkable.indexOf(ch);
  if (idx !== -1) { fail('fieldhelp.html: found ' + name + ' at offset ' + idx); charHits++; }
}
for (const ent of ['&mdash;', '&ndash;']) {
  if (checkable.includes(ent)) { fail('fieldhelp.html: found entity ' + ent); charHits++; }
}
if (charHits === 0) ok('fieldhelp.html clean of em/en dashes and curly quotes');

// ------- 3. Hub card + Coach HQ panel -------
section('hub + Coach HQ wiring');
const hubHtml = fs.readFileSync(path.join(ROOT, 'cougars', 'index.html'), 'utf8');
if (hubHtml.includes('/cougars/fieldhelp.html')) ok('hub Team pages links to fieldhelp'); else fail('hub missing fieldhelp link');
if (hubHtml.includes('Field help sign-up')) ok('hub card title present'); else fail('hub card title missing');
if (hubHtml.includes('Home games we set up, away games we clean up')) ok('hub card subtitle present'); else fail('hub card subtitle missing');
const hqHtml = fs.readFileSync(path.join(ROOT, 'cougars', 'coach', 'index.html'), 'utf8');
for (const s of ['Field help claims', 'action=field_slots', 'action=unclaim_field', 'loadFieldHelp', 'unclaimField', 'fieldlist']) {
  if (hqHtml.includes(s)) ok('Coach HQ contains: ' + s); else fail('Coach HQ MISSING: ' + s);
}

// ------- 4. Gateway repo source -------
section('gateway source: field actions in repo');
const gw = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'cougars-gateway', 'index.ts'), 'utf8');
for (const s of ['"fieldhelp"', 'action === "field_slots"', 'action === "claim_field"', 'action === "unclaim_field"', 'cougars_field_slots', '.is("claimed_by", null)']) {
  if (gw.includes(s)) ok('gateway source has: ' + s); else fail('gateway source MISSING: ' + s);
}

// ------- 5. Live gateway: the seeded board -------
section('gateway live: field_slots board');
let liveSlots = [];
try {
  const r = await fetch(GATEWAY + '?action=field_slots');
  const d = await r.json();
  liveSlots = d.slots || [];
  if (r.ok && liveSlots.length === 21) ok('field_slots returns 21 slots'); else fail('field_slots returned ' + r.status + ' with ' + liveSlots.length + ' slots, expected 21');
  const games = {};
  for (const s of liveSlots) (games[s.game_no] = games[s.game_no] || []).push(s);
  if (Object.keys(games).length === 8) ok('8 games on the board'); else fail('expected 8 games, got ' + Object.keys(games).length);
  // Home/away map straight from the interlock master + additional-games tab.
  const expectHome = { 1: true, 2: false, 3: false, 4: true, 5: false, 6: true, 7: true, 8: true };
  const expectDate = { 1: '2026-09-12', 2: '2026-09-19', 3: '2026-09-26', 4: '2026-09-30', 5: '2026-10-03', 6: '2026-10-10', 7: '2026-10-17', 8: '2026-10-24' };
  let mapOk = true;
  for (const no of Object.keys(expectHome)) {
    const gs = games[no] || [];
    if (!gs.length) { fail('game ' + no + ' missing'); mapOk = false; continue; }
    if (gs[0].is_home !== expectHome[no]) { fail('game ' + no + ' home/away wrong: is_home=' + gs[0].is_home); mapOk = false; }
    if (gs[0].game_date !== expectDate[no]) { fail('game ' + no + ' date wrong: ' + gs[0].game_date); mapOk = false; }
    const drags = gs.filter((s) => s.role_key === 'drag').length;
    const chalks = gs.filter((s) => s.role_key === 'chalk').length;
    const bases = gs.filter((s) => s.role_key === 'bases').length;
    if (expectHome[no]) {
      if (!(gs.length === 3 && drags === 1 && chalks === 2 && bases === 0)) { fail('game ' + no + ' HOME roles wrong: ' + gs.map((s) => s.role_key).join(',')); mapOk = false; }
    } else {
      if (!(gs.length === 2 && drags === 1 && chalks === 0 && bases === 1)) { fail('game ' + no + ' AWAY roles wrong: ' + gs.map((s) => s.role_key).join(',')); mapOk = false; }
    }
  }
  if (mapOk) ok('home/away, dates, and role slots all match the schedule (5 home, 3 away)');
  const g1 = (games[1] || [])[0];
  if (g1 && g1.game_label === 'Saturday Sep 12 vs Grandstand' && g1.venue === 'Allen Yorke 1' && g1.game_time === '12:30 PM') ok('game 1 label/venue/time: ' + g1.game_label);
  else fail('game 1 meta wrong: ' + JSON.stringify(g1));
} catch (e) { fail('field_slots fetch threw: ' + e.message); }

section('gateway live: claim guards');
try {
  const noFam = await fetch(GATEWAY + '?action=claim_field', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot_id: 1, family_name: '' }),
  });
  if (noFam.status === 400) ok('claim without family name rejected 400'); else fail('empty family should be 400, got ' + noFam.status);
  const badSlot = await fetch(GATEWAY + '?action=claim_field', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot_id: 'abc', family_name: 'ZZTEST smoke family' }),
  });
  if (badSlot.status === 400) ok('invalid slot rejected 400'); else fail('invalid slot should be 400, got ' + badSlot.status);
  const ghost = await fetch(GATEWAY + '?action=claim_field', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot_id: 499, family_name: 'ZZTEST smoke family' }),
  });
  if (ghost.status === 409) ok('nonexistent slot claims as taken 409 (no row updated)'); else fail('nonexistent slot should be 409, got ' + ghost.status);
  const noPin = await fetch(GATEWAY + '?action=unclaim_field', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot_id: 1 }),
  });
  if (noPin.status === 401) ok('unclaim without PIN rejected 401'); else fail('unclaim no-PIN should be 401, got ' + noPin.status);
} catch (e) { fail('claim guard flow threw: ' + e.message); }

// ------- 6. Full claim round trip (PIN) -------
section('claim round trip: first-come, 409 race guard, PIN unclaim');
if (PIN) {
  try {
    // Use the latest-dated open slot to stay out of real families' way; the
    // flow is self-cleaning (ends with the slot open again).
    const open = liveSlots.filter((s) => !s.claimed_by);
    const target = open[open.length - 1];
    if (!target) { console.log('  NOTE  no open slots left to test with; skipping round trip.'); }
    else {
      const c1 = await fetch(GATEWAY + '?action=claim_field', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: target.id, family_name: 'ZZTEST smoke family' }),
      });
      const c1d = await c1.json();
      if (c1.ok && c1d.ok && c1d.role_label === target.role_label) ok('claim accepted: ' + c1d.game_label + ' / ' + c1d.role_label); else fail('claim failed: ' + c1.status + ' ' + JSON.stringify(c1d));
      const c2 = await fetch(GATEWAY + '?action=claim_field', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: target.id, family_name: 'ZZTEST second family' }),
      });
      if (c2.status === 409) ok('second claim on the same slot rejected 409 (race guard)'); else fail('race guard broken: second claim got ' + c2.status);
      const mid = await (await fetch(GATEWAY + '?action=field_slots')).json();
      const midSlot = (mid.slots || []).find((s) => s.id === target.id);
      if (midSlot && midSlot.claimed_by === 'ZZTEST smoke family') ok('board shows the claiming family to everyone'); else fail('board wrong after claim: ' + JSON.stringify(midSlot));
      const un = await fetch(GATEWAY + '?action=unclaim_field', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-pin': PIN },
        body: JSON.stringify({ slot_id: target.id }),
      });
      if (un.ok) ok('PIN unclaim accepted'); else fail('PIN unclaim failed ' + un.status);
      const fin = await (await fetch(GATEWAY + '?action=field_slots')).json();
      const finSlot = (fin.slots || []).find((s) => s.id === target.id);
      if (finSlot && !finSlot.claimed_by) ok('slot open again after unclaim (test self-cleaned)'); else fail('slot not freed: ' + JSON.stringify(finSlot));
    }
  } catch (e) { fail('claim round trip threw: ' + e.message); }
} else {
  console.log('  NOTE  COUGARS_PIN not set; skipped the live claim round trip.');
}

// ------- Report -------
console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
process.exit(failed === 0 ? 0 : 1);
