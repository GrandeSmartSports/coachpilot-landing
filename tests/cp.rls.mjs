#!/usr/bin/env node
// Access matrix for the cp_ spine. Creates a throwaway league 'zz-cp-test' with four users, asserts section 5 of the spec, then deletes everything.
// Run: CP_SERVICE_ROLE_KEY=... node tests/cp.rls.mjs
import { createClient } from '@supabase/supabase-js';

const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlaWd2dXlzcHRqdnZxYW51bWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzIxODIsImV4cCI6MjA5MDgwODE4Mn0.DlzXoU3XUa7kAD9oN6hJ1MBXnC_KxzviqpL2vQxWSX8';
const SRK = process.env.CP_SERVICE_ROLE_KEY;
if (!SRK) { console.error('CP_SERVICE_ROLE_KEY missing'); process.exit(2); }
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const section = (n) => console.log('\n' + n);
const TAG = 'zz-cp-test';
const created = { users: [], leagues: [] };

export async function makeUser(email) {
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  created.users.push(u.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (vErr) throw vErr;
  const { data: person } = await admin.from('cp_people').upsert({ email, name: email.split('@')[0] }, { onConflict: 'email' }).select().single();
  await admin.from('cp_people').update({ auth_user_id: u.user.id }).eq('id', person.id);
  return { client, personId: person.id, authId: u.user.id, email };
}

async function cleanup() {
  // cp_teams.league_id is ON DELETE RESTRICT, so teams must go before their league.
  for (const slug of [TAG, TAG + '-2']) {
    const { data: league } = await admin.from('cp_leagues').select('id').eq('slug', slug).maybeSingle();
    if (league) {
      await admin.from('cp_teams').delete().eq('league_id', league.id);
      await admin.from('cp_leagues').delete().eq('id', league.id);
    }
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  await admin.from('cp_people').delete().like('email', '%@zz-cp-test.invalid');
}

try {
  section('setup');
  const { data: L1 } = await admin.from('cp_leagues').insert({ slug: TAG, name: 'ZZ Test League', short_name: 'ZZT', sports: ['softball'] }).select().single();
  const { data: L2 } = await admin.from('cp_leagues').insert({ slug: TAG + '-2', name: 'ZZ Other League', short_name: 'ZZO', sports: ['baseball'] }).select().single();
  const { data: T1 } = await admin.from('cp_teams').insert({ league_id: L1.id, slug: 'test-team', name: 'Test Team', sport: 'softball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  const { data: T2 } = await admin.from('cp_teams').insert({ league_id: L2.id, slug: 'other-team', name: 'Other Team', sport: 'baseball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  // birthdate lives in cp_player_private, not cp_players.
  const { data: P1 } = await admin.from('cp_players').insert({ team_id: T1.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'One' }).select().single();
  const { data: P2 } = await admin.from('cp_players').insert({ team_id: T2.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'Two' }).select().single();
  await admin.from('cp_player_private').insert([
    { player_id: P1.id, birthdate: '2017-05-05' },
    { player_id: P2.id, birthdate: '2017-06-06' },
  ]);

  const coach = await makeUser('coach@zz-cp-test.invalid');
  const asst = await makeUser('asst@zz-cp-test.invalid');
  const parent = await makeUser('parent@zz-cp-test.invalid');
  const stranger = await makeUser('stranger@zz-cp-test.invalid');
  const ladmin = await makeUser('ladmin@zz-cp-test.invalid');

  await admin.from('cp_memberships').insert([
    { person_id: coach.personId, team_id: T1.id, role: 'head_coach', status: 'active', season_label: 'Test 2026' },
    { person_id: asst.personId, team_id: T1.id, role: 'assistant_coach', status: 'active', season_label: 'Test 2026' },
    { person_id: parent.personId, team_id: T1.id, role: 'guardian', status: 'active', season_label: 'Test 2026' },
    { person_id: ladmin.personId, league_id: L1.id, role: 'league_admin', status: 'active' },
    { person_id: stranger.personId, team_id: T2.id, role: 'head_coach', status: 'active', season_label: 'Test 2026' },
  ]);
  await admin.from('cp_guardians').insert({ player_id: P1.id, person_id: parent.personId, is_primary: true, status: 'approved' });
  ok('fixtures created');

  const count = async (client, table, filter, col = 'id') => { let q = client.from(table).select(col, { count: 'exact', head: true }); if (filter) q = filter(q); const { count: c } = await q; return c ?? 0; };

  section('head coach');
  if (await count(coach.client, 'cp_players', q => q.eq('team_id', T1.id)) === 1) ok('sees own team players'); else fail('coach cannot see own players');
  if (await count(coach.client, 'cp_players', q => q.eq('team_id', T2.id)) === 0) ok('cannot see other league players'); else fail('coach leaked other league');
  if (await count(coach.client, 'cp_guardians') === 1) ok('sees guardians of own kids'); else fail('coach guardian visibility wrong');
  { const { error } = await coach.client.from('cp_players').update({ jersey: '7' }).eq('id', P1.id); if (!error) ok('can edit own roster'); else fail('coach cannot edit roster: ' + error.message); }
  { const { data } = await coach.client.from('cp_players').update({ jersey: '9' }).eq('id', P2.id).select(); if (!data || data.length === 0) ok('cannot edit other team roster'); else fail('coach edited other team'); }
  if (await count(coach.client, 'cp_player_private', q => q.eq('player_id', P1.id), 'player_id') === 1) ok('sees own player private (birthdate) row'); else fail('coach cannot see player_private row');

  section('assistant coach');
  if (await count(asst.client, 'cp_players', q => q.eq('team_id', T1.id)) === 1) ok('sees roster'); else fail('assistant cannot see roster');
  if (await count(asst.client, 'cp_guardians') === 0) ok('cannot see guardian contact rows'); else fail('assistant sees guardians');
  { const { data } = await asst.client.from('cp_players').update({ jersey: '8' }).eq('id', P1.id).select(); if (!data || data.length === 0) ok('cannot edit roster'); else fail('assistant edited roster'); }
  if (await count(asst.client, 'cp_player_private', null, 'player_id') === 0) ok('cannot see player private rows'); else fail('assistant sees player_private');
  { const n = await count(asst.client, 'cp_people'); if (n === 1) ok('sees only self in people'); else fail('assistant sees other people (count=' + n + ')'); }

  section('guardian');
  if (await count(parent.client, 'cp_players') === 1) ok('sees only own kid'); else fail('guardian sees wrong number of kids');
  if (await count(parent.client, 'cp_memberships', q => q.eq('team_id', T1.id)) === 1) ok('sees only own membership, not staff list'); else fail('guardian sees staff memberships');
  if (await count(parent.client, 'cp_people') === 1) ok('sees only self in people'); else fail('guardian sees other people');
  if (await count(parent.client, 'cp_player_private', null, 'player_id') === 1) ok('sees own kid birthdate row'); else fail('guardian player_private count wrong');

  section('league admin');
  if (await count(ladmin.client, 'cp_teams', q => q.eq('league_id', L1.id)) === 1) ok('sees league teams'); else fail('league admin cannot see teams');
  if (await count(ladmin.client, 'cp_players', q => q.eq('team_id', T1.id)) === 1) ok('sees rosters in league'); else fail('league admin cannot see rosters');
  if (await count(ladmin.client, 'cp_teams', q => q.eq('league_id', L2.id)) === 0) ok('cannot see other league'); else fail('league admin leaked other league');
  { const { error } = await ladmin.client.from('cp_leagues').update({ short_name: 'ZZT2' }).eq('id', L1.id); if (!error) ok('can edit own settings box'); else fail('league admin cannot edit box: ' + error.message); }

  section('stranger (coach in another league)');
  if (await count(stranger.client, 'cp_players', q => q.eq('team_id', T1.id)) === 0) ok('cannot see test team players'); else fail('stranger leaked players');
  if (await count(stranger.client, 'cp_leagues', q => q.eq('id', L1.id)) === 0) ok('cannot see test league'); else fail('stranger leaked league');
  if (await count(stranger.client, 'cp_invites') === 0) ok('cannot see invites'); else fail('stranger sees invites');
  if (await count(stranger.client, 'cp_player_private', q => q.eq('player_id', P1.id), 'player_id') === 0) ok('cannot see test team player private data'); else fail('stranger leaked player_private');

  section('anonymous');
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  if (await count(anon, 'cp_leagues') === 0) ok('anon sees nothing'); else fail('anon leaked leagues');

  section('hats view');
  { const { data } = await coach.client.from('cp_my_hats').select('*'); if (data && data.length === 1 && data[0].role === 'head_coach') ok('coach has one hat'); else fail('hats wrong: ' + JSON.stringify(data)); }

  section('two people rows with different emails stay separate');
  const dup = await makeUser('coach.alt@zz-cp-test.invalid');
  if (await count(dup.client, 'cp_memberships') === 0) ok('second email has no memberships of the first'); else fail('duplicate person leaked memberships');
} catch (e) {
  fail('exception: ' + (e.message || e));
} finally {
  await cleanup();
  const { count: leftover } = await admin.from('cp_leagues').select('id', { count: 'exact', head: true }).like('slug', TAG + '%');
  if ((leftover ?? 0) === 0) { ok('no zz-cp-test leagues remain'); console.log('\ncleanup verified'); }
  else { fail('cleanup incomplete: ' + leftover + ' leagues remain'); }
  console.log('\ncleanup done');
}
console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
