// The league site (blslittleleague.org) loads bls/assets/site.css on its home page. This test fails a change that would
// break the page: a malformed file, a missing rule, or styles that do not do their job when applied to the real home page.
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m); } };
const css = fs.readFileSync(new URL("../bls/assets/site.css", import.meta.url), "utf8");

// 1) the file itself
const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
ok(body.split("{").length === body.split("}").length, "braces balance");
ok(!/<\/?(style|script)/i.test(css), "no style or script tags inside the file");
ok(css.length < 12000, `file stays small (${css.length} bytes)`);
for (const [needle, why] of [[".skNews li:has(.blsx-home){display:none!important}", "carrier entry hides itself"], [".skAddBanner{display:none!important}", "sponsor ad slot hidden"], [".skHeader .skLogo img{width:64px!important", "slim phone header"], ["#navMenu .skSocial{display:none!important}", "dead social icons hidden in the phone menu"], [".skAlert{background:#00013a!important", "navy top strip"]]) ok(css.includes(needle), why);

// 2) the five sponsor logos the Sponsorship page points at are real PNG files
for (const f of ["cal-line-equipment", "enrique-trujeque-agency", "land-o-frost", "lowe-s", "owen-equipment"]) {
  const b = fs.readFileSync(new URL(`../bls/assets/sponsors/${f}.png`, import.meta.url));
  ok(b.slice(0, 8).toString("hex") === "89504e470d0a1a0a" && b.length > 1000, `sponsor logo ${f}.png is a PNG`);
}

// 3) behavior: apply the file to the real home page in a test browser (nothing is saved on the site)
const pw = require("/Users/danielgrande/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core");
const browser = await pw.chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [name, opts, phone] of [["phone 390", { ...pw.devices["iPhone 13"] }, true], ["phone 320", { ...pw.devices["iPhone 13"], viewport: { width: 320, height: 568 } }, true], ["desktop 1440", { viewport: { width: 1440, height: 900 } }, false]]) {
    const ctx = await browser.newContext(opts); const p = await ctx.newPage();
    await p.goto("https://www.blslittleleague.org/", { waitUntil: "load", timeout: 60000 }); await p.waitForTimeout(4000);
    const rej = p.locator("#onetrust-reject-all-handler"); if (await rej.count()) { await rej.click().catch(() => {}); await p.waitForTimeout(1200); }   // close the cookie box like a visitor would
    const before = await p.evaluate(() => document.querySelector(".skHeader").getBoundingClientRect().height);
    await p.evaluate(c => { const s = document.createElement("style"); s.textContent = c; (document.querySelector(".skNews .skSummary") || document.body).appendChild(s); }, css); await p.waitForTimeout(800);
    const r = await p.evaluate(() => { const g = s => document.querySelector(s); const d = document.documentElement; const a = g('#dnn_ctlDisplayAnnouncement_divAnnouncementMessage a[href*="/bls/remind/"] span'); const q = a.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return { header: Math.round(g(".skHeader").getBoundingClientRect().height), ad: getComputedStyle(g(".skAddBanner")).display, alertBg: getComputedStyle(g(".skAlert")).backgroundColor, alertW: Math.round(g(".skAlert").getBoundingClientRect().width), vw: d.clientWidth, side: d.scrollWidth - d.clientWidth, btnLink: !!(hit && hit.closest("a")), btnH: Math.round(q.height), newsShown: [...document.querySelectorAll(".skNews .skList > li")].filter(li => getComputedStyle(li).display !== "none").length }; });
    if (phone) ok(r.header <= 110 && before > 200, `${name}: header shrinks from ${Math.round(before)}px to ${r.header}px`);
    ok(r.ad === "none", `${name}: sponsor ad slot hidden`);
    ok(r.alertBg === "rgb(0, 1, 58)" && r.alertW === r.vw, `${name}: top strip navy edge to edge`);
    ok(r.side <= 0, `${name}: no sideways scroll`);
    ok(r.btnLink && r.btnH >= 44, `${name}: reminder button still a tappable link (${r.btnH}px tall)`);
    ok(r.newsShown >= 4, `${name}: real news items still show (${r.newsShown})`);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
