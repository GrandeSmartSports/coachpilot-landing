#!/usr/bin/env node
// cp-gateway action tests against the deployed function, using a throwaway league. Run: CP_SERVICE_ROLE_KEY=... node tests/cp.gateway.mjs
import { createClient } from '@supabase/supabase-js';
const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const GW = URL_ + '/functions/v1/cp-gateway';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlaWd2dXlzcHRqdnZxYW51bWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzIxODIsImV4cCI6MjA5MDgwODE4Mn0.DlzXoU3XUa7kAD9oN6hJ1MBXnC_KxzviqpL2vQxWSX8';
const SRK = process.env.CP_SERVICE_ROLE_KEY;
if (!SRK) { console.error('CP_SERVICE_ROLE_KEY missing'); process.exit(2); }
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const section = (n) => console.log('\n' + n);
const TAG = 'zz-cp-test';
const users = [];

async function makeUser(email) {
  const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
  users.push(u.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const { data: person } = await admin.from('cp_people').upsert({ email, name: email.split('@')[0] }, { onConflict: 'email' }).select().single();
  await admin.from('cp_people').update({ auth_user_id: u.user.id }).eq('id', person.id);
  const { data: s } = await client.auth.getSession();
  return { client, personId: person.id, token: s.session.access_token };
}
async function call(action, body, token) {
  const r = await fetch(`${GW}?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

try {
  section('setup');
  const { data: L1 } = await admin.from('cp_leagues').insert({ slug: TAG, name: 'ZZ Test League', short_name: 'ZZT', sports: ['softball'] }).select().single();
  const { data: T1 } = await admin.from('cp_teams').insert({ league_id: L1.id, slug: 'test-team', name: 'Test Team', sport: 'softball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  const { data: T2 } = await admin.from('cp_teams').insert({ league_id: L1.id, slug: 'test-team-2', name: 'Test Team 2', sport: 'softball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  // birthdate lives in cp_player_private, not cp_players.
  const { data: P1 } = await admin.from('cp_players').insert({ team_id: T1.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'One' }).select().single();
  const { data: P2 } = await admin.from('cp_players').insert({ team_id: T2.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'Two' }).select().single();
  await admin.from('cp_player_private').insert([
    { player_id: P1.id, birthdate: '2017-05-05' },
    { player_id: P2.id, birthdate: '2017-06-06' },
  ]);
  const coach = await makeUser('coach@zz-cp-test.invalid');
  await admin.from('cp_memberships').insert({ person_id: coach.personId, team_id: T1.id, role: 'head_coach', status: 'active', season_label: 'Test 2026' });
  ok('fixtures');

  section('invite_create');
  { const r = await call('invite_create', { email: 'newparent@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P1.id }, coach.token);
    if (r.status === 200 && r.body.ok && r.body.invite.token) ok('coach creates guardian invite'); else fail('create failed ' + r.status + ' ' + JSON.stringify(r.body));
    globalThis.INV = r.body.invite; }
  { const r = await call('invite_create', { email: 'x@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P2.id }, coach.token);
    if (r.status === 403) ok('wrong-team player rejected 403'); else fail('wrong-team player accepted ' + r.status); }
  { const r = await call('invite_create', { email: 'x@zz-cp-test.invalid', role: 'head_coach', team_id: T1.id }, coach.token);
    if (r.status === 403) ok('coach cannot invite a head coach'); else fail('coach invited head coach ' + r.status); }
  { const r = await call('invite_create', { email: 'x@zz-cp-test.invalid', role: 'assistant_coach', team_id: T1.id });
    if (r.status === 401) ok('no auth rejected 401'); else fail('no auth accepted ' + r.status); }

  section('invite_send with email disabled');
  { const r = await call('invite_send', { invite_id: INV.id }, coach.token);
    if (r.status === 200 && r.body.suppressed === true && r.body.sent === false) ok('send suppressed by kill switch'); else fail('send not suppressed ' + JSON.stringify(r.body));
    const { data: a } = await admin.from('cp_audit').select('action').eq('subject_id', INV.id).eq('action', 'email_suppressed');
    if (a && a.length === 1) ok('suppression audited'); else fail('no audit row'); }

  section('invite_lookup and accept');
  { const r = await call('invite_lookup', { token: INV.token }); if (r.status === 200 && r.body.invite.needs_birthdate === true && r.body.invite.email_masked.includes('***')) ok('lookup masks email, asks birthdate'); else fail('lookup ' + r.status + JSON.stringify(r.body)); }
  { const r = await call('invite_lookup', { token: 'nope' }); if (r.status === 410) ok('bad token 410'); else fail('bad token ' + r.status); }
  for (let i = 0; i < 3; i++) { await call('invite_accept', { token: INV.token, name: 'New Parent', birthdate: '2000-01-01' }); }
  { const r = await call('invite_accept', { token: INV.token, name: 'New Parent', birthdate: '2017-05-05' }); if (r.status === 423) ok('locked after 3 wrong birthdates'); else fail('not locked ' + r.status); }
  { const { data: a } = await admin.from('cp_audit').select('action').eq('subject_id', INV.id).eq('action', 'invite_locked'); if (a && a.length === 1) ok('lock audited'); else fail('lock not audited'); }

  section('accept happy path');
  const { data: INV2 } = await admin.from('cp_invites').insert({ email: 'newparent2@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P1.id, invited_by: coach.personId }).select().single();
  { const r = await call('invite_accept', { token: INV2.token, name: 'Parent Two', birthdate: '2017-05-05' });
    if (r.status === 200 && r.body.ok && r.body.email === 'newparent2@zz-cp-test.invalid') ok('accepted'); else fail('accept ' + r.status + JSON.stringify(r.body));
    const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }); const au = u.users.find(x => x.email === 'newparent2@zz-cp-test.invalid'); if (au) { users.push(au.id); ok('auth user created'); } else fail('no auth user');
    const { data: g } = await admin.from('cp_guardians').select('*').eq('player_id', P1.id); if (g && g.length === 1 && g[0].is_primary && g[0].status === 'approved') ok('first guardian primary + approved'); else fail('guardian row wrong ' + JSON.stringify(g));
    const { data: m } = await admin.from('cp_memberships').select('*').eq('team_id', T1.id).eq('role', 'guardian'); if (m && m.length === 1 && m[0].status === 'active') ok('guardian membership active'); else fail('membership wrong'); }
  { const r = await call('invite_accept', { token: INV2.token, name: 'Parent Two', birthdate: '2017-05-05' }); if (r.status === 410) ok('second accept 410'); else fail('re-accept ' + r.status); }

  section('second guardian pending until approved');
  const { data: INV3 } = await admin.from('cp_invites').insert({ email: 'grandma@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P1.id, invited_by: coach.personId }).select().single();
  await call('invite_accept', { token: INV3.token, name: 'Grandma', birthdate: '2017-05-05' });
  { const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }); const au = u.users.find(x => x.email === 'grandma@zz-cp-test.invalid'); if (au) users.push(au.id); }
  { const { data: g } = await admin.from('cp_guardians').select('*').eq('player_id', P1.id).eq('is_primary', false); if (g && g.length === 1 && g[0].status === 'pending') ok('second guardian pending'); else fail('second guardian ' + JSON.stringify(g));
    const r = await call('guardian_approve', { guardian_id: g[0].id }, coach.token); if (r.status === 200) ok('coach approved second guardian'); else fail('approve ' + r.status); }

  section('league_create');
  { const r = await call('league_create', { slug: TAG + '-x', name: 'X', short_name: 'X', sports: ['softball'] }, coach.token); if (r.status === 403) ok('non-admin cannot create league'); else fail('league_create ' + r.status); }
} catch (e) { fail('exception: ' + (e.message || e)); }
finally {
  // cp_teams.league_id is ON DELETE RESTRICT, so teams must go before their league.
  const { data: leagues } = await admin.from('cp_leagues').select('id').like('slug', TAG + '%');
  for (const l of leagues || []) await admin.from('cp_teams').delete().eq('league_id', l.id);
  await admin.from('cp_leagues').delete().like('slug', TAG + '%');
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await admin.from('cp_people').delete().like('email', '%@zz-cp-test.invalid');
  console.log('\ncleanup done');
}
console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
