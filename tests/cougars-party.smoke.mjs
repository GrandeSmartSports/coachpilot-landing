#!/usr/bin/env node
// Smoke test for the end-of-season party page (cougars/party.html): RSVP + head count + bring list.
// Run:  COUGARS_PIN=xxxx node tests/cougars-party.smoke.mjs   (PIN optional)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAY = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/cougars-gateway';
const PIN = process.env.COUGARS_PIN || '';
const BOGUS = '00000000-0000-0000-0000-000000000000';
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };

console.log('\nparty.html');
const html = fs.readFileSync(path.join(ROOT, 'cougars', 'party.html'), 'utf8');
for (const s of ['End of Season Party', 'Sunday, Nov 1', '4:00 to 6:00 PM', "Purdy's", 'submit_party_rsvp', 'party_rsvp_status', 'party_bring_list', 'submit_party_bring', 'Sharpies', 'action=players', 'Back to the team hub']) {
  html.includes(s) ? ok(`contains "${s}"`) : fail(`missing "${s}"`);
}
/[—–]/.test(html) ? fail('em/en dash in party.html') : ok('no em/en dashes');

console.log('\ngateway source');
const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/cougars-gateway/index.ts'), 'utf8');
for (const s of ['action === "submit_party_rsvp"', 'action === "party_rsvp_status"', 'action === "party_bring_list"', 'action === "submit_party_bring"', 'action === "party_rsvp_report"']) {
  src.includes(s) ? ok(s) : fail('missing ' + s);
}

console.log('\nlive gateway');
const post = async (action, body) => { const r = await fetch(`${GATEWAY}?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.status; };
(await post('submit_party_rsvp', { player_id: BOGUS, attending: true })) === 404 ? ok('rsvp unknown player -> 404') : fail('rsvp unknown player');
(await post('submit_party_rsvp', { player_id: BOGUS })) === 400 ? ok('rsvp missing attending -> 400') : fail('rsvp missing attending');
(await post('submit_party_bring', { player_id: BOGUS, item: '' })) === 400 ? ok('bring empty item -> 400') : fail('bring empty item');
(await post('submit_party_bring', { player_id: BOGUS, item: 'x' })) === 404 ? ok('bring unknown player -> 404') : fail('bring unknown player');
let r = await fetch(`${GATEWAY}?action=party_bring_list`); let j = await r.json().catch(() => null);
r.status === 200 && Array.isArray(j?.items) ? ok('bring list -> 200 array') : fail('bring list');
r = await fetch(`${GATEWAY}?action=party_rsvp_status&player_id=${BOGUS}`); j = await r.json().catch(() => null);
j?.submitted === false ? ok('status unknown player -> submitted:false') : fail('status unknown');
r = await fetch(`${GATEWAY}?action=party_rsvp_report`);
r.status === 401 ? ok('report without PIN -> 401') : fail('report without PIN ' + r.status);
if (PIN) {
  r = await fetch(`${GATEWAY}?action=party_rsvp_report`, { headers: { 'x-admin-pin': PIN } }); j = await r.json().catch(() => null);
  r.status === 200 && typeof j?.adults === 'number' && Array.isArray(j?.silent) ? ok('report with PIN -> counts') : fail('report with PIN');
}
console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
