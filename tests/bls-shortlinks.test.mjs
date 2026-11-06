// The BLS flyer QR codes point at these short links. This test fails any change that would break them.
import fs from "fs";
const LINKS = {
  "/register": "https://www.blslittleleague.org/Default.aspx?tabid=716841",
  "/challenger": "https://www.blslittleleague.org/Default.aspx?tabid=716841",
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m); } };

// 1) vercel.json: the first rule matching each path on host go.blslittleleague.org must be ours.
const cfg = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const toRe = (src) => new RegExp("^" + src.replace(/\/:(\w+)\((.*)\)$/, (_, n, re) => "/(" + re + ")").replace(/\/:(\w+)\*?$/, "/(.*)") + "$");
for (const [path, dest] of Object.entries(LINKS)) {
  const first = cfg.redirects.find((r) => {
    const hostOk = !r.has || r.has.every((h) => h.type === "host" && h.value === "go.blslittleleague.org");
    try { return hostOk && toRe(r.source).test(path); } catch { return false; }
  });
  ok(first && first.source === path, `first go-host rule for ${path} is its own rule (got ${first && first.source})`);
  ok(first && first.destination === dest, `${path} points to ${dest}`);
  ok(first && first.permanent === false, `${path} is temporary (307) so browsers never cache it and it can be repointed`);
}

// 2) live: the deployed site redirects correctly and the destination loads.
for (const [path, dest] of Object.entries(LINKS)) {
  const r = await fetch("https://go.blslittleleague.org" + path, { redirect: "manual" });
  ok(r.status >= 300 && r.status < 400, `live ${path} redirects (HTTP ${r.status})`);
  ok(r.headers.get("location") === dest, `live ${path} goes to the registration page (${r.headers.get("location")})`);
  const d = await fetch(dest, { redirect: "follow" });
  ok(d.status === 200, `live destination for ${path} loads (HTTP ${d.status})`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
