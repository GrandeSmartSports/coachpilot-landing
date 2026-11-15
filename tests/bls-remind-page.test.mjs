// The registration-day reminder page (go.blslittleleague.org/bls/remind/) stays a plain sign-up: heading, one email box, one button,
// the registration windows and a link to Registration info. No fine print under the form about how many emails are sent or how to
// be removed (every email carries its own remove link).
import fs from "fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m); } };
const html = fs.readFileSync(new URL("../bls/remind/index.html", import.meta.url), "utf8");
const body = html.slice(html.indexOf("<body"), html.indexOf("<script"));
const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

ok(/<form id="f" method="post" action="https:\/\/geigvuysptjvvqanumld\.supabase\.co\/functions\/v1\/bls-gateway\?action=remind_signup">/.test(body), "sign-up form posts to the reminder gateway");
ok((body.match(/<input[^>]+type="email"/g) || []).length === 1 && /<button type="submit">Remind me<\/button>/.test(body), "one email box and one Remind me button");
ok(/name="website"/.test(body) && /class="hp"/.test(body), "spam trap field still in place");
ok(/Friday, November 27/.test(text) && /Registration windows/.test(text) && (body.match(/<li><b>/g) || []).length === 3, "opening day and the three registration windows shown");
ok(/href="https:\/\/www\.blslittleleague\.org\/Default\.aspx\?tabid=716841">Registration info/.test(body), "Registration info link kept");
ok(!/nothing else/i.test(text) && !/remove link/i.test(text) && !/Questions\?/i.test(text), "no fine print under the form");
ok(!/class="foot"/.test(body) && !/mailto:/.test(body), "footer note and its email link are gone");
ok(!/one message|one email|one-time|one reminder/i.test(html), "no wording that limits the list to a single email");
ok(/we'll email you that morning/.test(text), "intro says we will email that morning");
ok(/noindex/.test(html), "page stays out of search results");

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
