#!/usr/bin/env node
// Pure-function tests for cp/cp-core.js. Run: node tests/cp-core.test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { mergeBox, parseRoute, DEFAULTS } = require(path.join(ROOT, 'cp', 'cp-core.js'));
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const eq = (a, b, m) => (JSON.stringify(a) === JSON.stringify(b) ? ok : fail)(m + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' got ' + JSON.stringify(a)));

console.log('\nmergeBox');
eq(mergeBox(null, null).colors.primary, DEFAULTS.colors.primary, 'null boxes give defaults');
eq(mergeBox({ schema_version: 1 }, {}).display_name, DEFAULTS.display_name, 'missing display_name falls back');
eq(mergeBox({ colors: { primary: '#B4151B' } }, null).colors.primary, '#B4151B', 'league primary wins over default');
eq(mergeBox({ colors: { primary: '#B4151B' } }, null).colors.accent, DEFAULTS.colors.accent, 'missing accent falls back while primary set');
eq(mergeBox({ colors: { primary: '#B4151B' }, display_name: 'BLS' }, { colors: { primary: '#000000' } }).colors.primary, '#000000', 'team override wins');
eq(mergeBox({ colors: { primary: '#B4151B' }, display_name: 'BLS' }, { colors: { primary: '#000000' } }).display_name, 'BLS', 'team inherits league name');
eq(mergeBox({ colors: 'garbage' }, null).colors.primary, DEFAULTS.colors.primary, 'non-object colors ignored');
eq(mergeBox({ features: { team_hubs: true } }, null).features.public_schedule, false, 'feature flags default false');
eq(mergeBox({ schema_version: 0, routing: null }, null).routing, DEFAULTS.routing, 'old schema with null routing falls back');
eq(mergeBox({ display_name: 42 }, null).display_name, DEFAULTS.display_name, 'type mismatch ignored');

console.log('\nparseRoute');
eq(parseRoute('/l/bls/t/cougars'), { league: 'bls', team: 'cougars', token: null }, 'league + team');
eq(parseRoute('/l/bls'), { league: 'bls', team: null, token: null }, 'league only');
eq(parseRoute('/l/bls/admin/settings'), { league: 'bls', team: null, token: null }, 'league admin settings');
eq(parseRoute('/t/cougars'), { league: null, team: 'cougars', token: null }, 'standalone team');
eq(parseRoute('/join/abc123'), { league: null, team: null, token: 'abc123' }, 'join token');
eq(parseRoute('/me'), { league: null, team: null, token: null }, 'me');
eq(parseRoute('/l/BLS'), { league: null, team: null, token: null }, 'uppercase league slug does not match (lowercase only)');

console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
