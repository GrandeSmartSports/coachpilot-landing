#!/usr/bin/env node
// Verifies the cp-auth-email hook function: rejects bad signatures, accepts a signed payload and returns {}.
// Run: CP_AUTH_HOOK_SECRET=<base64 secret without the v1,whsec_ prefix> node tests/cp.authhook.mjs
import crypto from 'node:crypto';
const FN = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/cp-auth-email';
const SECRET = process.env.CP_AUTH_HOOK_SECRET; if (!SECRET) { console.error('CP_AUTH_HOOK_SECRET missing'); process.exit(2); }
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };

function sign(payload, secretB64, id, ts) {
  const toSign = `${id}.${ts}.${payload}`;
  const sig = crypto.createHmac('sha256', Buffer.from(secretB64, 'base64')).update(toSign).digest('base64');
  return `v1,${sig}`;
}
const body = JSON.stringify({ user: { email: 'nobody@zz-cp-test.invalid' }, email_data: { token: '123456', token_hash: 'x', email_action_type: 'magiclink', site_url: 'https://coachpilot.org' } });
const id = 'msg_test'; const ts = String(Math.floor(Date.now() / 1000));

console.log('\nbad signature');
{ const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': 'v1,AAAA' }, body });
  if (r.status === 401) ok('rejected 401'); else fail('expected 401 got ' + r.status); }

console.log('\nno signature');
{ const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  if (r.status === 401) ok('rejected 401'); else fail('expected 401 got ' + r.status); }

console.log('\nsigned, dry-run recipient');
{ const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(body, SECRET, id, ts), 'x-cp-dry-run': '1' }, body });
  const j = await r.json().catch(() => null);
  if (r.status === 200 && j && j.dry_run === true && j.subject === 'Your CoachPilot sign-in code' && j.html.includes('123456')) ok('accepted, subject + code rendered, not sent'); else fail('got ' + r.status + ' ' + JSON.stringify(j)); }

console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
