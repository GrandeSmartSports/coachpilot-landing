// go.blslittleleague.org must only serve BLS pages; everything else bounces to the main BLS site.
import { readFileSync } from 'node:fs';
const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
const HOST = 'go.blslittleleague.org';
const onHost = r => (r.has || []).some(h => h.type === 'host' && h.value === HOST);
const reds = v.redirects.filter(onHost), rews = v.rewrites.filter(onHost);
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const catchAll = reds.find(r => r.source.startsWith('/:path('));
ok(catchAll && catchAll.destination === 'https://www.blslittleleague.org/', 'catch-all redirect to main BLS site exists');
const re = new RegExp('^/' + catchAll.source.slice('/:path('.length, -1) + '$');
const bounced = p => re.test(p);
for (const p of ['/fields/', '/fields/admin.html', '/fields/umpire.html', '/fields/ics/league.ics', '/bls/assets/bls-logo.png', '/bls/website-updates/', '/website-updates/', '/south-hill/', '/bls-south-hill/index.html']) ok(!bounced(p), 'serves ' + p);
for (const p of ['/cougars/', '/plans.html', '/cp/signin.html', '/sophie/', '/index.html', '/coaches.html', '/blsx', '/privacy/']) ok(bounced(p), 'bounces ' + p);
ok(reds[0].source === '/' && reds[0].destination === 'https://www.blslittleleague.org/', 'root goes to main BLS site');
ok(rews.some(r => r.source === '/website-updates/' && r.destination === '/bls/website-updates/index.html'), 'pretty /website-updates/');
ok(rews.some(r => r.source === '/south-hill/' && r.destination === '/bls-south-hill/index.html'), 'pretty /south-hill/');
ok(!v.redirects.filter(r => !onHost(r)).some(r => /blslittleleague/.test(r.destination)), 'coachpilot.org rules untouched by BLS redirects');
console.log(fails ? `${fails} FAILED` : 'all go-host checks passed'); process.exit(fails ? 1 : 0);
