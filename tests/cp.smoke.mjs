#!/usr/bin/env node
// CoachPilot spine smoke test. Read-only against production. Run: node tests/cp.smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlaWd2dXlzcHRqdnZxYW51bWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzIxODIsImV4cCI6MjA5MDgwODE4Mn0.DlzXoU3XUa7kAD9oN6hJ1MBXnC_KxzviqpL2vQxWSX8';
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const section = (n) => console.log('\n' + n);

section('schema: cp_ tables exist and reject anonymous reads');
const TABLES = ['cp_people','cp_leagues','cp_teams','cp_memberships','cp_players','cp_guardians','cp_invites','cp_settings','cp_audit'];
for (const t of TABLES) {
  const r = await fetch(`${URL_}/rest/v1/${t}?select=id&limit=1`, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  if (r.status === 404) { fail(`${t} missing (404)`); continue; }
  const body = await r.json().catch(() => null);
  if (r.status === 200 && Array.isArray(body) && body.length === 0) ok(`${t} exists, anon sees 0 rows`);
  else if (r.status === 401 || r.status === 403) ok(`${t} exists, anon rejected ${r.status}`);
  else fail(`${t} unexpected ${r.status} ${JSON.stringify(body).slice(0,80)}`);
}

section('copy hygiene: no em/en dashes or curly quotes in cp surfaces');
const BAD = /[\u2013\u2014\u2015\u2018\u2019\u201C\u201D]/;
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(html|js|css|ts|mjs|json|md)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(ROOT, 'cp')), ...walk(path.join(ROOT, 'supabase', 'functions', 'cp-gateway')), ...fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.startsWith('cp')).map(f => path.join(ROOT, 'tests', f))];
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  const m = txt.match(BAD);
  if (m) fail(`${path.relative(ROOT, f)} contains U+${m[0].codePointAt(0).toString(16).toUpperCase()}`); else ok(`${path.relative(ROOT, f)} clean`);
}

console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
