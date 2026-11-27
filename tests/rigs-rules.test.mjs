// WDFW rule check: the RSS parser (edge function) and the matcher (page).
// Run: node tests/rigs-rules.test.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { parseRss } from "../supabase/functions/castai-rules/rss-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};

// --- parser -----------------------------------------------------------------
const xml = `<?xml version="1.0"?><rss><channel>
<item><title>Marine Area 2-2 (Grays Harbor) closing to all fishing</title>
<link>https://wdfw.wa.gov/fishing/regulations/emergency-rules/ma-2-2-close</link>
<description>&lt;p&gt;&lt;strong&gt;Action:&lt;/strong&gt; Closes all fishing.&lt;/p&gt;&lt;p&gt;&lt;strong&gt;Effective dates:&lt;/strong&gt; Oct. 24, 2026, until further notice.&lt;/p&gt;&lt;p&gt;Species affected: All species.&lt;/p&gt;</description>
<pubDate>Wed, 21 Oct 2026 22:44:36 +0000</pubDate></item>
<item><title>No link item</title><description>x</description></item>
</channel></rss>`;
const parsed = parseRss(xml);
ok(parsed.length === 1, "parses items and drops broken ones", parsed.length);
ok(parsed[0].title === "Marine Area 2-2 (Grays Harbor) closing to all fishing", "title comes through clean");
ok(parsed[0].effective === "Oct. 24, 2026, until further notice.", "the effective dates line is pulled out", parsed[0].effective);
ok(parsed[0].published === "2026-10-21T22:44:36.000Z", "posted date becomes ISO", parsed[0].published);
ok(/Closes all fishing\./.test(parsed[0].body) && !/<|&lt;/.test(parsed[0].body), "body is plain text, no tags");

// --- matcher ------------------------------------------------------------------
const store = {};
const ctx = { console, Date, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) } };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(resolve(ROOT, "rigs/rules.js"), "utf8"), ctx);
const R = ctx.RIG.rules;
const rule = (title, body, published = "2026-11-25T18:00:00Z", link = "https://x/" + title) => ({ title, body, published, link, effective: "" });
const m = (t, b, spot, sp) => R.matches(rule(t, b), spot, sp);

ok(m("Marine Area 11 salmon closes", "Salmon: closed.", "dash-point", "coho"), "an Area 11 salmon rule flags Dash Point coho");
ok(!m("Marine Area 11 crab stays closed", "Dungeness crab: closed.", "dash-point", "cutthroat"), "an Area 11 crab rule does not flag cutthroat");
ok(m("Squid limit change", "Marine Areas 10, 11 and 13: squid limit 5 quarts.", "redondo", "squid"), "Area 11 inside a list still counts");
ok(!m("Marine Area 12 salmon", "Salmon: closed.", "dash-point", "coho"), "Area 12 is not Area 11");
ok(!m("Marine Area 8-2 crab opens", "Crab: open.", "westport", "crab"), "Area 8-2 is not Area 2");
ok(!m("Marine Area 2-1 (Willapa Bay) closes", "All species: closed.", "westport", "crab"), "Willapa Bay (2-1) is not the Westport basin");
ok(m("Marine Area 2-2 (Grays Harbor) closing", "All species: closed.", "westport", "crab"), "Grays Harbor flags the Westport crab trip");
ok(m("Upper Green (Duwamish) River closure rescinded", "Salmon open.", "green-river", "chum"), "any Green River rule flags the river trips");
ok(!m("Copalis River closing to all fishing", "Rivers: closed.", "ocean-shores", "clams"), "a river closure does not flag the clam beach");
ok(m("Razor clam digs approved for Mocrocks and Copalis", "Clams.", "ocean-shores", "clams"), "a dig announcement flags the clam trip");
ok(m("Lake Fenwick closed", "Algae.", "lake-fenwick", "bass"), "a named lake flags any fish there");
ok(m("Puyallup and Carbon rivers close to salmon fishing", "Coho: closed.", "puyallup-sumner", "coho") && m("Puyallup River closure", "All species.", "puyallup-128th", "king"),
  "a Puyallup River rule flags the Puyallup trips");
ok(m("Puyallup River from the Carbon upstream", "Trout.", "puyallup-orting", ""), "and Orting's page, which has no fish of its own");
ok(!m("Upper Green (Duwamish) River closure rescinded", "Salmon open.", "puyallup-sumner", "coho") && !m("Puyallup River closure", "Salmon.", "green-river", "coho"), "the Green and the Puyallup do not flag each other");

const data = { at: Date.now(), rules: [rule("Marine Area 11 salmon closes", "Salmon: closed.", "2026-11-25T18:00:00Z", "https://x/a"),
  rule("Marine Area 11 salmon opened", "Salmon: open.", "2026-11-01T18:00:00Z", "https://x/b")] };
store["rig.rules.v1"] = JSON.stringify(data);
ok(R.newFor("dash-point", "coho", "2026-11-23").map((r) => r.link).join() === "https://x/a", "only rules posted after the card was checked count");
R.ack("https://x/a");
ok(R.newFor("dash-point", "coho", "2026-11-23").length === 0, "Got it hides a rule");
ok(!R.status(Date.now()).stale && R.status(Date.now() + 25 * 3600e3).stale, "a check older than a day reads as not updated");
delete store["rig.rules.v1"];
ok(R.status().never, "no check yet reads as never checked");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
