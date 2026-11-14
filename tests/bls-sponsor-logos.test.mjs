// The league site's Sponsorship page (blslittleleague.org) points at five sponsor logos hosted here.
// This test fails a change that would remove or corrupt them. (The site's styles live on the site itself:
// its security policy only allows stylesheets from its own storage.)
import fs from "fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m); } };
// the five sponsor logos the Sponsorship page points at are real PNG files
for (const f of ["cal-line-equipment", "enrique-trujeque-agency", "land-o-frost", "lowe-s", "owen-equipment"]) {
  const b = fs.readFileSync(new URL(`../bls/assets/sponsors/${f}.png`, import.meta.url));
  ok(b.slice(0, 8).toString("hex") === "89504e470d0a1a0a" && b.length > 1000, `sponsor logo ${f}.png is a PNG`);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
