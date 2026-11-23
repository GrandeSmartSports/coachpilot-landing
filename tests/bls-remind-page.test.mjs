// The registration-day reminder page (go.blslittleleague.org/bls/remind/) stays a plain sign-up: heading, one email box, one button,
// the registration windows and a link to Registration info. No fine print under the form about how many emails are sent or how to
// be removed (every email carries its own remove link). From Nov 27 08:00Z (midnight Pacific) the same page switches itself to
// "Spring 2027 registration is open" with a big Register now button; tests/bls-remind-page.smoke.mjs checks that in a browser.
import fs from "fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m); } };
const html = fs.readFileSync(new URL("../bls/remind/index.html", import.meta.url), "utf8");
const body = html.slice(html.indexOf("<body"), html.lastIndexOf("<script"));
const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

ok(/<form id="f" method="post" action="https:\/\/geigvuysptjvvqanumld\.supabase\.co\/functions\/v1\/bls-gateway\?action=remind_signup">/.test(body), "sign-up form posts to the reminder gateway");
ok((body.match(/<input[^>]+type="email"/g) || []).length === 1 && (body.match(/<button/g) || []).length === 1 && /<button type="submit"><span class="pre">Remind me<\/span>/.test(body), "one email box and one Remind me button");
ok(/name="website"/.test(body) && /class="hp"/.test(body), "spam trap field still in place");
ok(/Friday, November 27/.test(text) && /Registration windows/.test(text) && (body.match(/<li><b>/g) || []).length === 3, "opening day and the three registration windows shown");
ok(/href="https:\/\/www\.blslittleleague\.org\/Default\.aspx\?tabid=716841">Registration info/.test(body), "Registration info link kept");
ok(!/nothing else/i.test(text) && !/remove link/i.test(text) && !/Questions\?/i.test(text), "no fine print under the form");
ok(!/class="foot"/.test(body) && !/mailto:/.test(body), "footer note and its email link are gone");
ok(!/one message|one email|one-time|one reminder/i.test(html), "no wording that limits the list to a single email");
ok(/we'll email you that morning/.test(text), "intro says we will email that morning");
ok(/noindex/.test(html), "page stays out of search results");

// Date switches (no midnight deploy)
const head = html.slice(0, html.indexOf("<body"));
ok(/Date\.parse\('2026-11-27T08:00:00Z'\)/.test(head) && /Date\.parse\('2026-11-30T08:00:00Z'\)/.test(head) && /Date\.parse\('2027-01-01T08:00:00Z'\)/.test(head), "switch moments: Nov 27, Nov 30 and Jan 1 at 08:00 UTC");
ok(/\[\?&\]asof=/.test(head), "?asof=<ISO time> forces the date for previews");
ok(/<div class="open">\s*<h1>Spring 2027 registration is open<\/h1>/.test(body), "open heading: Spring 2027 registration is open");
ok(/<a class="go" href="https:\/\/www\.blslittleleague\.org\/Default\.aspx\?tabid=716844">Register now<\/a>/.test(body), "big Register now button goes to 716844");
ok(/<span class="open">Get future BLS league reminders<\/span>/.test(body), "smaller box: Get future BLS league reminders");
ok(/Black Friday sale through Sun, Nov 29: \$50 off per family/.test(body) && /Early Bird: \$25 off per family through Dec 31/.test(body), "sale lines for Nov 27 to 29 and Nov 30 to Dec 31");
ok(/<div class="windows pre">/.test(body) && /<div class="pre">\s*<h1>Registration day reminder<\/h1>/.test(body), "today's heading and windows are the pre-open version");
ok(!/[\u2012\u2013\u2014\u2015]|&mdash;|&ndash;/.test(html), "no em or en dashes");
ok(!/coachpilot/i.test(html), "nothing CoachPilot on the page");

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
