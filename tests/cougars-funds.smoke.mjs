#!/usr/bin/env node
// Smoke test for the Cougar Funds page + cougars-gateway funds actions + weekly draft law.
//
// What it checks:
//   1. cougars/funds.html exists with required copy (optional/anonymous promise,
//      no-girl-left-out line), Venmo href, Zelle number + copy button, page_view ping.
//   2. No em/en dashes or curly quotes in new parent-facing files
//      (funds.html, updates.html, and the hub card copy in index.html).
//   3. funds-core.mjs unit tests: config parse (incl. bad JSON), progress math
//      (goal funds, cap at 100, open goal), dollar formatting.
//   4. Live gateway: GET funds returns the 4 seeded funds with correct numbers;
//      admin_funds without PIN is rejected 401.
//   5. Drafts law: the public updates feed does NOT include the Week of August 24
//      draft. With COUGARS_PIN set, the PIN read DOES include it, unpublished,
//      and an idempotent admin_funds same-value write succeeds.
//
// Run:  COUGARS_PIN=xxxx node tests/cougars-funds.smoke.mjs   (PIN optional)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFunds, dollars, fundProgress } from '../cougars/funds-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/cougars-gateway';
const PIN = process.env.COUGARS_PIN || '';
const DRAFT_TITLE = 'Week of August 24';

let passed = 0, failed = 0;
function ok(msg)   { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function section(name) { console.log('\n' + name); }

// ------- 1. funds.html copy -------
section('funds.html: file + copy');
const FUNDS_PAGE = path.join(ROOT, 'cougars', 'funds.html');
if (!fs.existsSync(FUNDS_PAGE)) { fail('cougars/funds.html missing'); process.exit(1); }
const fundsHtml = fs.readFileSync(FUNDS_PAGE, 'utf8');
const mustContain = [
  'Contributions are completely optional and anonymous',
  'No girl will ever be left out, no matter what.',
  'https://venmo.com/u/DanielGrande88',
  '623-332-2251',
  'data-zelle',
  'In your banking app, send with Zelle to this phone number',
  'action=funds',
  'page: "funds"',
  'funds-core.mjs',
  'noindex',
];
for (const s of mustContain) {
  if (fundsHtml.includes(s)) ok('contains: ' + s.slice(0, 60));
  else fail('MISSING: ' + s);
}

// ------- 2. Forbidden chars in parent-facing files -------
section('parent-facing: no em/en dashes or curly quotes');
const forbidden = { '—': 'em-dash', '–': 'en-dash', '’': 'curly-apos', '‘': 'curly-apos-l', '“': 'curly-quote-l', '”': 'curly-quote-r' };
const parentFiles = ['cougars/funds.html', 'cougars/updates.html', 'cougars/index.html', 'cougars/funds-core.mjs', 'cougars/cagevote.html'];
let charHits = 0;
for (const rel of parentFiles) {
  const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // <title> tags historically use a decorative dash; parent-visible body copy must not.
  const checkable = body.replace(/<title>[\s\S]*?<\/title>/, '');
  for (const [ch, name] of Object.entries(forbidden)) {
    const idx = checkable.indexOf(ch);
    if (idx !== -1) { fail(rel + ': found ' + name + ' at offset ' + idx); charHits++; }
  }
  for (const ent of ['&mdash;', '&ndash;']) {
    if (checkable.includes(ent)) { fail(rel + ': found entity ' + ent); charHits++; }
  }
}
if (charHits === 0) ok('no em/en dashes or curly quotes in parent-facing files');

// ------- Hub card + season line -------
section('hub: to-do board + quiet team pages');
const hubHtml = fs.readFileSync(path.join(ROOT, 'cougars', 'index.html'), 'utf8');
const hubMust = [
  'Your to-do list',
  'Who are you here for?',
  'Just browsing, skip this',
  'action=family_status',
  'action=mark_done',
  'You are all caught up.',
  'Nothing needs you right now.',
  'Team pages',
  '/cougars/updates.html',
  '/cougars/practice.html',
  '/cougars/cagevote.html',
  '/cougars/sweatshirt.html',
  '/cougars/walkup.html',
  'Mivei-2T-16Years-Softball-Toddler-Baseball',
  '/cougars/funds.html',
  '/cougars/snacks.html',
  '/cougars/volunteer.html',
  'Tell me how you want to help',
  'Thursdays 6:00 until dark (about 8:00 right now)',
  'funds-card',
  'funds-core.mjs',
  'data-check="cage_vote"',
  'data-check="sweatshirt"',
  'data-check="walkup"',
  'data-check="pants"',
  'Done. Tap to change your answer.',
  'No girl will ever be left out, no matter what.',
];
for (const s2 of hubMust) {
  if (hubHtml.includes(s2)) ok('hub contains: ' + s2.slice(0, 50));
  else fail('hub MISSING: ' + s2);
}
if (!hubHtml.includes('New big ask')) ok('hub Get involved copy has no scorekeeper ask'); else fail('hub still has scorekeeper ask copy');
if (!hubHtml.includes('<span>Cougar Funds</span><span class="qs">')) ok('thin Cougar Funds row removed from Team pages (big card instead)'); else fail('thin Cougar Funds row still in Team pages list');
const volHtml = fs.readFileSync(path.join(ROOT, 'cougars', 'volunteer.html'), 'utf8');
if (!/Raise my hand|gcInterest|The Big Ask/i.test(volHtml)) ok('volunteer page: scorekeeper ask removed'); else fail('volunteer page still has scorekeeper ask');

// ------- 3. funds-core unit tests -------
section('funds-core: parse + math');
if (Array.isArray(parseFunds('not json')) && parseFunds('not json').length === 0) ok('bad JSON parses to []'); else fail('bad JSON should parse to []');
if (parseFunds('{"a":1}').length === 0) ok('non-array parses to []'); else fail('non-array should parse to []');
const parsed = parseFunds('[{"id":"x","name":"X","goal_cents":1000,"raised_cents":250},{"id":"","name":"skip"},{"bogus":true}]');
if (parsed.length === 1 && parsed[0].id === 'x') ok('invalid entries dropped, valid kept'); else fail('parse filter wrong: ' + JSON.stringify(parsed));

if (dollars(32500) === '$325') ok('dollars whole: $325'); else fail('dollars(32500) = ' + dollars(32500));
if (dollars(1250) === '$12.50') ok('dollars cents: $12.50'); else fail('dollars(1250) = ' + dollars(1250));

const p0 = fundProgress({ goal_cents: 26000, raised_cents: 0 });
if (!p0.open && p0.pct === 0 && p0.label === '$0 of $260') ok('goal fund at zero: ' + p0.label); else fail('goal-at-zero wrong: ' + JSON.stringify(p0));
const pHalf = fundProgress({ goal_cents: 19500, raised_cents: 9750 });
if (!pHalf.open && pHalf.pct === 50 && pHalf.label === '$97.50 of $195') ok('goal fund at half: ' + pHalf.label + ' (50%)'); else fail('half wrong: ' + JSON.stringify(pHalf));
const pOver = fundProgress({ goal_cents: 3000, raised_cents: 4500 });
if (!pOver.open && pOver.pct === 100 && pOver.label === '$45 of $30') ok('over goal caps at 100%'); else fail('over-goal wrong: ' + JSON.stringify(pOver));
const pOpen = fundProgress({ goal_cents: null, raised_cents: 4200 });
if (pOpen.open && pOpen.pct === null && pOpen.label === '$42 raised so far') ok('open goal: ' + pOpen.label); else fail('open goal wrong: ' + JSON.stringify(pOpen));

// ------- Draft preview page (Coach review artifact) -------
section('draft preview page: file + copy');
const PREVIEW = path.join(ROOT, 'cougars', 'coach', 'draft-weekly-aug24.html');
if (!fs.existsSync(PREVIEW)) { fail('cougars/coach/draft-weekly-aug24.html missing'); }
else {
  const prev = fs.readFileSync(PREVIEW, 'utf8');
  const prevMust = [
    'DRAFT PREVIEW for Coach only',
    'Week of August 24',
    'One promise before you dig in: these weekly updates get much shorter as the season goes',
    'nobody wants me in charge of anything fashion related',
    'Looking ahead',
    'You can vote on the team page',
    'The grey pants link is on the team page',
    'The sweatshirt form is on the team page, and you can pay through the funds page there as well',
    'The walk-up form is on the team page',
    'Everything you need is on the team page:',
    'scrimmage with the Bears for Thursday, September 10',
    'which comes out to far less',
    'renderBody',
    'noindex, nofollow',
  ];
  for (const s of prevMust) {
    if (prev.includes(s)) ok('preview contains: ' + s.slice(0, 50));
    else fail('preview MISSING: ' + s);
  }
  const prevCheckable = prev.replace(/<title>[\s\S]*?<\/title>/, '');
  let prevHits = 0;
  for (const [ch, name] of Object.entries(forbidden)) {
    if (prevCheckable.includes(ch)) { fail('preview: found ' + name); prevHits++; }
  }
  if (prevHits === 0) ok('preview has no em/en dashes or curly quotes');
}

// ------- 4. Live gateway: funds -------
section('gateway: funds actions');
try {
  const r = await fetch(GATEWAY + '?action=funds');
  const d = await r.json();
  const funds = d.funds || [];
  if (r.ok && funds.length === 2) ok('funds returns exactly 2 funds (socks + bows removed)'); else fail('funds returned ' + r.status + ' with ' + funds.length + ' funds, expected 2');
  const byId = Object.fromEntries(funds.map((f) => [f.id, f]));
  const sw = byId['sweatshirts'];
  if (sw && sw.name === 'Sweatshirt Fund' && sw.goal_cents === 26000 && sw.per_note === 'about $20 per girl') ok('sweatshirts: $260 goal + about $20 per girl');
  else fail('sweatshirts wrong: ' + JSON.stringify(sw));
  if (!byId['socks'] && !byId['bows']) ok('no socks or bows funds present'); else fail('socks/bows still present in funds');
  const cage = byId['cage'];
  if (cage && cage.name === 'Mike and Terrys Cage Fund' && cage.goal_cents === null && (cage.blurb || '').includes('which comes out to far less')) ok('cage: open goal + corrected token blurb');
  else fail('cage wrong: ' + JSON.stringify(cage));
} catch (e) { fail('funds fetch threw: ' + e.message); }

try {
  const r = await fetch(GATEWAY + '?action=admin_funds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'sweatshirts', raised_cents: 0 }),
  });
  if (r.status === 401) ok('admin_funds without PIN rejected 401'); else fail('admin_funds no-PIN should be 401, got ' + r.status);
} catch (e) { fail('admin_funds no-PIN threw: ' + e.message); }

// ------- Cage-night vote page + gateway -------
section('cage vote: page + gateway');
const VOTE_PAGE = path.join(ROOT, 'cougars', 'cagevote.html');
if (!fs.existsSync(VOTE_PAGE)) { fail('cougars/cagevote.html missing'); }
else {
  const voteHtml = fs.readFileSync(VOTE_PAGE, 'utf8');
  const voteMust = [
    'Cage Night Vote',
    'Optional, come if you can',
    'Pick every evening that works for your family',
    'Coach will go with the night that gets the most votes',
    'Details come next week',
    'Changed your mind? Vote again, your newest vote counts.',
    'data-choice="monday"',
    'data-choice="tuesday"',
    'data-choice="wednesday"',
    'Submit votes',
    'action=submit_cage_vote',
    'action=players',
    'page: "cagevote"',
    'noindex',
  ];
  for (const s of voteMust) {
    if (voteHtml.includes(s)) ok('vote page contains: ' + s.slice(0, 50));
    else fail('vote page MISSING: ' + s);
  }
}
const coachHtml = fs.readFileSync(path.join(ROOT, 'cougars', 'coach', 'index.html'), 'utf8');
if (coachHtml.includes('cage_vote_report') && coachHtml.includes('cage-counts')) ok('Coach HQ has cage vote tally panel');
else fail('Coach HQ missing cage vote tally panel');

try {
  const r = await fetch(GATEWAY + '?action=cage_vote_report');
  if (r.status === 401) ok('cage_vote_report without PIN rejected 401'); else fail('cage_vote_report no-PIN should be 401, got ' + r.status);
} catch (e) { fail('cage_vote_report no-PIN threw: ' + e.message); }

try {
  const pr = await fetch(GATEWAY + '?action=players');
  const pd = await pr.json();
  const player = (pd.players || [])[0];
  if (!player) { fail('no roster players available for vote test'); }
  else {
    const bad = await fetch(GATEWAY + '?action=submit_cage_vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.id, choices: ['friday'] }),
    });
    if (bad.status === 400) ok('invalid night rejected 400'); else fail('invalid night should be 400, got ' + bad.status);
    const empty = await fetch(GATEWAY + '?action=submit_cage_vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.id, choices: [] }),
    });
    if (empty.status === 400) ok('empty choices rejected 400'); else fail('empty choices should be 400, got ' + empty.status);

    if (PIN) {
      // Multi-select latest-wins live flow. NOTE: creates ZZTEST-tagged rows in cage_vote_2026sep;
      // scrub afterwards (delete cougars_form_responses where form_key=cage_vote_2026sep and submitted_by like 'ZZTEST%').
      const v1 = await fetch(GATEWAY + '?action=submit_cage_vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id, choices: ['monday'], parent_name: 'ZZTEST smoke' }),
      });
      const v1d = await v1.json();
      if (v1.ok && v1d.ok && JSON.stringify(v1d.choices) === '["monday"]') ok('vote accepted (monday)'); else fail('vote 1 failed: ' + JSON.stringify(v1d));
      const v2 = await fetch(GATEWAY + '?action=submit_cage_vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id, choices: ['tuesday', 'wednesday'], parent_name: 'ZZTEST smoke' }),
      });
      const v2d = await v2.json();
      if (v2.ok && v2d.ok && JSON.stringify(v2d.choices) === '["tuesday","wednesday"]') ok('revote accepted (tuesday + wednesday)'); else fail('vote 2 failed: ' + JSON.stringify(v2d));
      const t = await fetch(GATEWAY + '?action=cage_vote_report', { headers: { 'x-admin-pin': PIN } });
      const td = await t.json();
      const mine = (td.voted || []).find((v) => v.player_id === player.id);
      if (mine && JSON.stringify(mine.choices) === '["tuesday","wednesday"]') ok('latest submission fully replaces: tally shows tue + wed only');
      else fail('latest-wins broken: ' + JSON.stringify(mine));
      const countedOnce = (td.voted || []).filter((v) => v.player_id === player.id).length === 1;
      if (countedOnce) ok('family listed exactly once in tally'); else fail('family listed more than once');
      if (td.counts && td.counts.tuesday >= 1 && td.counts.wednesday >= 1) ok('counts include one per chosen night for the family');
      else fail('counts wrong: ' + JSON.stringify(td.counts));
      console.log('  NOTE  ZZTEST cage votes left for player ' + player.id + '; scrub via MCP after the run.');
    } else {
      console.log('  NOTE  COUGARS_PIN not set; skipped live vote flow.');
    }
  }
} catch (e) { fail('cage vote flow threw: ' + e.message); }

// ------- family_status + mark_done -------
section('family status: board math');
try {
  const bad = await fetch(GATEWAY + '?action=family_status&player_id=00000000-0000-0000-0000-000000000000');
  if (bad.status === 404) ok('unknown family rejected 404'); else fail('unknown family should be 404, got ' + bad.status);
  const pr = await fetch(GATEWAY + '?action=players');
  const pd = await pr.json();
  const player = (pd.players || [])[0];
  if (player) {
    const s1 = await (await fetch(GATEWAY + '?action=family_status&player_id=' + player.id)).json();
    const keysOk = ['cage_vote', 'sweatshirt', 'walkup', 'pants'].every((k) => typeof s1[k] === 'boolean');
    if (keysOk) ok('family_status returns 4 booleans'); else fail('family_status shape wrong: ' + JSON.stringify(s1));
    const badItem = await fetch(GATEWAY + '?action=mark_done', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.id, item: 'sweatshirt' }),
    });
    if (badItem.status === 400) ok('mark_done rejects non-pants items 400'); else fail('mark_done bad item should be 400, got ' + badItem.status);
    const md = await fetch(GATEWAY + '?action=mark_done', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.id, item: 'pants', parent_name: 'ZZTEST smoke' }),
    });
    const mdd = await md.json();
    if (md.ok && mdd.ok) ok('mark_done pants accepted'); else fail('mark_done failed: ' + JSON.stringify(mdd));
    const s2 = await (await fetch(GATEWAY + '?action=family_status&player_id=' + player.id)).json();
    if (s2.pants === true) ok('pants shows done after mark_done (persists across devices)'); else fail('pants not marked done: ' + JSON.stringify(s2));
    console.log('  NOTE  ZZTEST pants row left for player ' + player.id + '; scrub via MCP after the run.');
  }
} catch (e) { fail('family_status flow threw: ' + e.message); }

// ------- 5. Weekly update: PUBLISHED as of the 2026-08-24 live-review step -------
section('weekly update: live in the public feed');
try {
  const r = await fetch(GATEWAY + '?action=updates');
  const d = await r.json();
  const bodies = (d.updates || []).map((u) => u.body || '').join('\n');
  if (bodies.includes(DRAFT_TITLE)) ok('public updates feed shows the published update'); else fail('published update MISSING from public feed');
} catch (e) { fail('public updates fetch threw: ' + e.message); }

if (PIN) {
  try {
    const r = await fetch(GATEWAY + '?action=all_updates', { headers: { 'x-admin-pin': PIN } });
    const d = await r.json();
    const draft = (d.updates || []).find((u) => (u.body || '').includes(DRAFT_TITLE));
    if (draft && draft.published === true) ok('PIN read finds the update, published (id ' + draft.id + ')');
    else if (draft) fail('update found but published=' + draft.published);
    else fail('PIN read did not find the update');
    if (draft && draft.body.includes('nobody wants me in charge of anything fashion related')) ok('draft has the revised Bows and socks section');
    else if (draft) fail('draft missing revised Bows and socks copy');
    if (draft && !draft.body.includes('This season I will handle bows and socks myself')) ok('old bows/socks copy removed from draft');
    else if (draft) fail('old bows/socks copy still in draft');
    if (draft) {
      const links = (draft.body.match(/\]\(http[^)]*\)/g) || []);
      if (links.length === 1 && links[0] === '](https://coachpilot.org/cougars/)') ok('draft has exactly ONE link and it is the team page');
      else fail('draft link rule broken: ' + JSON.stringify(links));
      if (draft.body.includes('One promise before you dig in')) ok('draft has the shorter-updates promise line');
      else fail('draft missing promise line');
    }
  } catch (e) { fail('PIN all_updates threw: ' + e.message); }

  try {
    const r = await fetch(GATEWAY + '?action=funds');
    const d = await r.json();
    const sweat = (d.funds || []).find((f) => f.id === 'sweatshirts');
    const w = await fetch(GATEWAY + '?action=admin_funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': PIN },
      body: JSON.stringify({ id: 'sweatshirts', raised_cents: sweat.raised_cents }),
    });
    const wd = await w.json();
    if (w.ok && wd.ok) ok('admin_funds same-value write accepted (idempotent, no data change)');
    else fail('admin_funds PIN write failed: ' + w.status + ' ' + JSON.stringify(wd));
  } catch (e) { fail('admin_funds PIN write threw: ' + e.message); }
} else {
  console.log('  NOTE  COUGARS_PIN not set; skipped PIN draft read + admin_funds write checks.');
}

// ------- Report -------
console.log('\n---');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
process.exit(failed === 0 ? 0 : 1);
