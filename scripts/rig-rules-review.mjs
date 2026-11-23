// Which new WDFW rules touch which Rig Card trips and cards?
// Used by the daily rule-review job. Prints JSON, changes nothing.
// Run: node scripts/rig-rules-review.mjs
// A rule counts as new for a run card after runs[plan].checked (or the base
// date in rigs/rules.js), and for a library card after its `dated`.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = {};
const ctx = { console, fetch, setTimeout, clearTimeout, AbortController, Date,
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) } };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["rigs/content.js", "rigs/trips.js", "rigs/runs.js", "rigs/rules.js"]) vm.runInContext(readFileSync(resolve(ROOT, f), "utf8"), ctx);
const { content: C, trips: T, rules: R } = ctx.RIG;

const res = await fetch(R.url + "?sync=1");
if (!res.ok) { console.error("castai-rules returned " + res.status); process.exit(2); }
const data = await res.json();
store["rig.rules.v1"] = JSON.stringify({ at: Date.now(), checked: data.checked, rules: data.rules });

const hits = new Map();
const hit = (r) => { if (!hits.has(r.link)) hits.set(r.link, { ...r, plans: [], cards: [] }); return hits.get(r.link); };

for (const p of T.plans) {
  const since = (T.runs[p.id] && T.runs[p.id].checked) || R.base;
  for (const r of R.newFor(p.spot, p.species, since)) hit(r).plans.push({ plan: p.id, since, hasRunCard: !!T.runs[p.id] });
}
const shared = new Map((C.shared || []).map((c) => [c.id, c]));
for (const sp of C.species) for (const loc of sp.locations || []) {
  for (let c of [...(sp.cards || []), ...(loc.cards || [])]) {
    if (typeof c === "string") c = shared.get(c);
    if (!c || !c.dated) continue;
    for (const r of R.newFor(loc.id, sp.id, c.dated)) {
      const h = hit(r);
      if (!h.cards.some((x) => x.card === c.id)) h.cards.push({ species: sp.id, location: loc.id, card: c.id, dated: c.dated, shared: shared.has(c.id) });
    }
  }
}
console.log(JSON.stringify({ checked: data.checked, syncError: data.error || null, rules: [...hits.values()] }, null, 2));
