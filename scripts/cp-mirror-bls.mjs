#!/usr/bin/env node
// One-time mirror of BLS (Field Command) + Cougars into the cp_ spine. READ-ONLY on flm_/cougars_ tables.
// Usage: CP_SERVICE_ROLE_KEY=... node scripts/cp-mirror-bls.mjs --dry-run   (prints report, writes nothing)
//        CP_SERVICE_ROLE_KEY=... node scripts/cp-mirror-bls.mjs --apply     (writes cp_ rows, no emails ever)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const SRK = process.env.CP_SERVICE_ROLE_KEY; if (!SRK) { console.error('CP_SERVICE_ROLE_KEY missing'); process.exit(2); }
const APPLY = process.argv.includes('--apply');
const db = createClient(URL_, SRK, { auth: { persistSession: false } });
const AGES = JSON.parse(fs.readFileSync(new URL('./cp-division-ages.json', import.meta.url)));
const SEASON = 'Fall 2026';
const COACH_EMAIL = 'daniel.grande@ymail.com';
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function ageBand(division) { const d = String(division || ''); for (const k of Object.keys(AGES)) if (k !== 'default' && d.toLowerCase().includes(k.toLowerCase())) return AGES[k]; return AGES.default; }
function sportOf(division, name) { const s = (division + ' ' + name).toLowerCase(); return /sb|softball/.test(s) ? 'softball' : 'baseball'; }

const report = { started: new Date().toISOString(), apply: APPLY, league: null, teams: { created: 0, existing: 0 }, coaches: { created_people: 0, memberships: 0, no_email: [] }, players: 0, coach_hats: [], parent_hat: { ran: false, lily_found: false, guardian_row_created: false, guardian_membership_created: false }, unmatched: [], notes: [] };

const { data: settings } = await db.from('flm_settings').select('key,value');
const S = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
const leagueName = S.league_name || 'Bonney Lake Sumner Little League';
const box = { schema_version: 1, display_name: leagueName, short_name: 'BLS', logo_url: '/CoachPilot-AppIcon.png', colors: { primary: '#B4151B', accent: '#1A1A1A', on_primary: '#FFFFFF' }, contact_email: S.contact_email || '', support_email: COACH_EMAIL, routing: S.routing || {}, practice_rules: S.practice_rules || {}, features: { public_schedule: false, public_standings: false, team_hubs: false } };

let league = (await db.from('cp_leagues').select('*').eq('slug', 'bls').maybeSingle()).data;
if (!league) { report.league = 'create'; if (APPLY) league = (await db.from('cp_leagues').insert({ slug: 'bls', name: leagueName, short_name: 'BLS', sports: ['baseball', 'softball'], settings: box }).select().single()).data; }
else report.league = 'exists';

const { data: flmTeams } = await db.from('flm_teams').select('id,name,division,nickname,coach_email,is_active').eq('is_active', true);
const { data: flmCoaches } = await db.from('flm_coaches').select('id,name,email,phone,team_id,active');
const teamMap = new Map();
for (const t of flmTeams || []) {
  const existing = (await db.from('cp_teams').select('id').eq('source_flm_team_id', t.id).maybeSingle()).data;
  if (existing) { report.teams.existing++; teamMap.set(t.id, existing.id); continue; }
  const [age_min, age_max] = ageBand(t.division);
  const name = t.nickname ? `${t.name} ${t.nickname}` : t.name;
  const row = { league_id: league?.id, slug: slugify(name), name, sport: sportOf(t.division, t.name), age_min, age_max, season_label: SEASON, source_flm_team_id: t.id, settings: { schema_version: 1 } };
  report.teams.created++;
  if (APPLY) { const { data, error } = await db.from('cp_teams').insert(row).select().single(); if (error) { report.unmatched.push({ team: name, error: error.message }); continue; } teamMap.set(t.id, data.id); }
}
for (const c of flmCoaches || []) {
  if (!c.email) { report.coaches.no_email.push(c.name); continue; }
  const email = c.email.trim().toLowerCase();
  const teamId = teamMap.get(c.team_id);
  if (!teamId) { report.unmatched.push({ coach: c.name, reason: 'team not mirrored' }); continue; }
  if (APPLY) {
    const { data: person, error } = await db.from('cp_people').upsert({ email, name: c.name || email, phone: c.phone || null }, { onConflict: 'email' }).select().single();
    if (error) { report.unmatched.push({ coach: c.name, error: error.message }); continue; }
    report.coaches.created_people++;
    const dup = (await db.from('cp_memberships').select('id').eq('person_id', person.id).eq('team_id', teamId).eq('role', 'head_coach').maybeSingle()).data;
    if (!dup) { await db.from('cp_memberships').insert({ person_id: person.id, team_id: teamId, role: 'head_coach', status: email === COACH_EMAIL ? 'active' : 'invited', season_label: SEASON, activated_at: email === COACH_EMAIL ? new Date().toISOString() : null }); report.coaches.memberships++; }
  } else { report.coaches.created_people++; report.coaches.memberships++; }
}
// Cougars players + Coach's hats
// Match the Cougars flm_teams row by division + coach_email (not by team name regex: facts on the ground differ from the brief).
const cougarsFlm = (flmTeams || []).find(t => t.division === 'Minors A Softball' && String(t.coach_email || '').trim().toLowerCase() === COACH_EMAIL);
if (!cougarsFlm) report.notes.push('Cougars flm team not found by division=Minors A Softball + coach_email match; players not mirrored');
else {
  const cougarsTeamId = teamMap.get(cougarsFlm.id);
  // cougars_players has no name/jersey/number columns: first_name, last_name, active only (plus parent contact fields we never mirror).
  const { data: kids } = await db.from('cougars_players').select('first_name,last_name,active');
  for (const k of kids || []) {
    if (!k.active) continue;
    const first = k.first_name;
    const last = k.last_name;
    report.players++;
    if (APPLY && cougarsTeamId) { const exists = (await db.from('cp_players').select('id').eq('team_id', cougarsTeamId).eq('first_name', first).eq('last_name', last).maybeSingle()).data; if (!exists) await db.from('cp_players').insert({ team_id: cougarsTeamId, season_label: SEASON, first_name: first, last_name: last }); }
  }
  if (APPLY) {
    const coach = (await db.from('cp_people').select('id').eq('email', COACH_EMAIL).maybeSingle()).data;
    if (coach) {
      for (const m of [{ role: 'platform_admin' }, { role: 'league_admin', league_id: league.id }]) {
        const dup = (await db.from('cp_memberships').select('id').eq('person_id', coach.id).eq('role', m.role).maybeSingle()).data;
        if (!dup) { await db.from('cp_memberships').insert({ person_id: coach.id, role: m.role, league_id: m.league_id || null, status: 'active', activated_at: new Date().toISOString() }); report.coach_hats.push(m.role); }
      }
      // Coach's parent hat: only when his daughter Lily Grande is among the mirrored Cougars. No raw SQL; admin-client inserts, idempotent.
      if (cougarsTeamId) {
        const lily = (await db.from('cp_players').select('id').eq('team_id', cougarsTeamId).eq('first_name', 'Lily').eq('last_name', 'Grande').maybeSingle()).data;
        if (lily) {
          report.parent_hat.ran = true;
          report.parent_hat.lily_found = true;
          const dupGuardian = (await db.from('cp_guardians').select('id').eq('player_id', lily.id).eq('person_id', coach.id).maybeSingle()).data;
          if (!dupGuardian) {
            const { error: gErr } = await db.from('cp_guardians').insert({ player_id: lily.id, person_id: coach.id, relationship: 'parent', is_primary: true, status: 'approved', approved_by: coach.id });
            if (gErr) report.unmatched.push({ step: 'parent_hat_guardian_row', error: gErr.message });
            else report.parent_hat.guardian_row_created = true;
          }
          const dupMembership = (await db.from('cp_memberships').select('id').eq('person_id', coach.id).eq('team_id', cougarsTeamId).eq('role', 'guardian').maybeSingle()).data;
          if (!dupMembership) {
            const { error: mErr } = await db.from('cp_memberships').insert({ person_id: coach.id, team_id: cougarsTeamId, role: 'guardian', status: 'active', activated_at: new Date().toISOString() });
            if (mErr) report.unmatched.push({ step: 'parent_hat_membership', error: mErr.message });
            else report.parent_hat.guardian_membership_created = true;
          }
        } else {
          report.notes.push('Lily Grande not found among mirrored Cougars players; parent hat not run');
        }
      }
    } else report.notes.push('Coach person row not found; hats not created');
  }
}
report.finished = new Date().toISOString();
const md = `# cp mirror report ${report.finished}\n\nmode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`;
const out = path.join(os.homedir(), 'Workspace', 'ops', `cp-mirror-report-${report.finished.slice(0, 10)}${APPLY ? '' : '-dryrun'}.md`);
fs.writeFileSync(out, md);
if (APPLY) await db.from('cp_settings').upsert({ key: 'mirror_report', value: report, updated_at: new Date().toISOString() });
console.log(md); console.log('written to', out);
