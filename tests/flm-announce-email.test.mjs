// Field Command announcement email: BLS links only, optional send time, cancel path, tests never mark "emailed".
// Static checks on the gateway source; pass a PIN as FLM_PIN to also run the live no-send checks.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../supabase/functions/flm-gateway/index.ts', import.meta.url), 'utf8');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

ok(!src.includes('coachpilot.org/fields'), 'no email or alert links to the old coachpilot.org/fields address');
ok(src.includes('href="https://go.blslittleleague.org/fields/"'), 'announcement email links go.blslittleleague.org/fields');
ok(src.includes('url: "/fields/", tag: "flm-announcement"'), 'announcement phone alert opens Field Command on the address it was turned on from');
ok(!readFileSync(new URL('../supabase/functions/flm-reminders/index.ts', import.meta.url), 'utf8').includes('coachpilot.org/fields'), 'umpire reminders link the BLS address');
const block = src.slice(src.indexOf('action === "admin_announcement_email"'), src.indexOf('action === "admin_cancel_scheduled_emails"'));
ok(/scheduled_at: scheduledAt/.test(block), 'send time is passed to Resend');
ok(/t < Date\.now\(\) \+ 60_000/.test(block) && /29 \* 86_400_000/.test(block), 'send time must be 1 minute to 29 days out');
ok(/sent\.length > 0 && !testTo/.test(block), 'a test send never marks the announcement as emailed');
ok(block.includes('(Z|[+-]\\d\\d:\\d\\d)$'), 'send time must carry a time zone');
ok(block.includes('Idempotency-Key') && block.includes('if (!testTo)'), 'a repeated real send is a no-op at Resend');
ok(block.includes('[resend_ids ${ids.join(",")}]'), 'scheduled send ids are kept in the activity log');
ok(src.includes('https://api.resend.com/emails/${id}/cancel'), 'scheduled emails can be canceled');

const PIN = process.env.FLM_PIN;
if (PIN) {
  const G = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/flm-gateway';
  const call = (action, body) => fetch(`${G}?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-pin': PIN }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, j: await r.json() }));
  const list = await call('admin_announcements', {});
  const id = list.j.announcements?.[0]?.id;
  const bad = await call('admin_announcement_email', { id, test_to: 'nobody@example.com', scheduled_at: 'not a date' });
  ok(bad.status === 400 && /scheduled_at/.test(bad.j.error), 'live: bad send time is refused before anything sends');
  const far = await call('admin_announcement_email', { id, test_to: 'nobody@example.com', scheduled_at: new Date(Date.now() + 40 * 86_400_000).toISOString() });
  ok(far.status === 400, 'live: send time past 29 days is refused');
  const naive = await call('admin_announcement_email', { id, test_to: 'nobody@example.com', scheduled_at: '2026-12-01T10:00:00' });
  ok(naive.status === 400, 'live: send time without a time zone is refused');
  const none = await call('admin_cancel_scheduled_emails', { resend_ids: [] });
  ok(none.status === 400, 'live: cancel needs ids');
}
console.log(fails ? `${fails} FAILED` : 'all announcement email checks passed'); process.exit(fails ? 1 : 0);
