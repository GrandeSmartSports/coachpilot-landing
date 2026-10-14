#!/usr/bin/env node
// Smoke test for the end-of-season party survey (cougars/party.html + cougars-gateway
// submit_party_vote / party_vote_report).
//
//   1. party.html exists with the five day buttons, Coach's plan copy, submit flow.
//   2. No em/en dashes or curly quotes in parent-facing copy.
//   3. Gateway source has the form key + both actions.
//   4. Live gateway: bad player -> 404, bogus/no choices -> 400, report needs PIN.
//   5. With COUGARS_PIN: report shape (counts for all five days, answered, not_answered, total).
//
// Run:  COUGARS_PIN=xxxx node tests/cougars-party.smoke.mjs   (PIN optional)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/cougars-gateway';
const PIN = process.env.COUGARS_PIN || '';
const DAYS = ['tue1027', 'wed1028', 'thu1029', 'fri1030', 'sat1031', 'sat1107'];

let passed = 0, failed = 0;
function ok(msg)   { console.log('  PASS ' + msg); passed++; }
function fail(msg) { console.log('  FAIL ' + msg); failed++; }
function section(name) { console.log('\n' + name); }

section('party.html: file + copy');
const PAGE = path.join(ROOT, 'cougars', 'party.html');
if (!fs.existsSync(PAGE)) { fail('cougars/party.html missing'); process.exit(1); }
const html = fs.readFileSync(PAGE, 'utf8');
for (const s of ['End of Season Party', 'We will pick a park to meet at', 'game balls', 'sign each other', 'Saturday Oct 31', 'Saturday Nov 7', '10:00 to 12:00', 'submit_party_vote', 'action=players', 'action=page_view', 'Back to the team hub']) {
  html.includes(s) ? ok(`contains "${s}"`) : fail(`missing "${s}"`);
}
for (const d of DAYS) html.includes(`data-choice="${d}"`) ? ok(`day button ${d}`) : fail(`day button ${d} missing`);
/[—–‘’“”]/.test(html) ? fail('em/en dash or curly quote in party.html') : ok('no em/en dashes or curly quotes');

section('gateway source');
const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/cougars-gateway/index.ts'), 'utf8');
for (const s of ['FORM_PARTY = "party_vote_2026oct"', 'action === "submit_party_vote"', 'action === "party_vote_report"']) {
  src.includes(s) ? ok(`source has ${s}`) : fail(`source missing ${s}`);
}

section('live gateway');
async function post(body) {
  const r = await fetch(GATEWAY + '?action=submit_party_vote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
let r = await post({ player_id: '00000000-0000-0000-0000-000000000000', choices: ['sat1031'] });
r.status === 404 ? ok('unknown player -> 404') : fail(`unknown player -> ${r.status}`);
r = await post({ player_id: 'x', choices: ['bogus'] });
r.status === 400 ? ok('bogus choice -> 400') : fail(`bogus choice -> ${r.status}`);
r = await post({ player_id: 'x', choices: [] });
r.status === 400 ? ok('empty choices -> 400') : fail(`empty choices -> ${r.status}`);
let rep = await fetch(GATEWAY + '?action=party_vote_report');
rep.status === 401 ? ok('report without PIN -> 401') : fail(`report without PIN -> ${rep.status}`);

if (PIN) {
  rep = await fetch(GATEWAY + '?action=party_vote_report', { headers: { 'x-admin-pin': PIN } });
  const j = await rep.json().catch(() => null);
  rep.status === 200 && j ? ok('report with PIN -> 200') : fail(`report with PIN -> ${rep.status}`);
  if (j) {
    DAYS.every((d) => typeof j.counts?.[d] === 'number') ? ok('counts has all six days') : fail('counts missing a day');
    Array.isArray(j.answered) && Array.isArray(j.not_answered) ? ok('answered + not_answered arrays') : fail('answered/not_answered shape');
    j.total === (j.answered.length + j.not_answered.length) ? ok(`total ${j.total} = answered + not_answered`) : fail('total mismatch');
  }
} else {
  console.log('  skip PIN report checks (set COUGARS_PIN)');
}

console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
