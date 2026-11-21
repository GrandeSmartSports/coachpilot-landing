// Offline-shell tests for the Fishing Library at /rigs.
// Run: node tests/rigs-offline.test.mjs
// Pure filesystem + regex checks. No network, no secrets, no live services.
//
// The spec's hardest requirement is that /rigs opens at a pier with zero cell
// signal. These tests are what stop that regressing: any asset the page loads
// that the service worker does not precache is a blank screen at the rail.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RIGS = join(ROOT, "rigs");

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 400)); }
};

// --- fixtures -------------------------------------------------------------
const indexPath = join(RIGS, "index.html");
const swPath = join(RIGS, "sw.js");
const haveIndex = existsSync(indexPath);
const haveSw = existsSync(swPath);
const index = haveIndex ? readFileSync(indexPath, "utf8") : "";
const sw = haveSw ? readFileSync(swPath, "utf8") : "";

ok(haveIndex, "rigs/index.html exists");
ok(haveSw, "rigs/sw.js exists");

// --- 1. no external origins ----------------------------------------------
// Anything the page reaches for over the network at load time is a point of
// failure with no signal. Google Fonts is the specific one the old card had.
const rigFiles = existsSync(RIGS)
  ? readdirSync(RIGS).filter((f) => /\.(html|js|css|webmanifest)$/.test(f)).map((f) => join(RIGS, f))
  : [];
const externalHits = [];
for (const f of rigFiles) {
  const src = readFileSync(f, "utf8");
  for (const re of [/fonts\.googleapis\.com/g, /fonts\.gstatic\.com/g, /(?:src|href)\s*=\s*["']https?:\/\/[^"']+/g, /@import\s+url\(\s*["']?https?:\/\//g]) {
    for (const m of src.matchAll(re)) {
      // An <a href> to an outside site is a link the user taps, not a load-time
      // fetch, so it cannot break offline boot. Only non-anchor refs count.
      const before = src.slice(Math.max(0, m.index - 80), m.index);
      if (/<a\b[^>]*$/i.test(before)) continue;
      externalHits.push(`${f.replace(ROOT + "/", "")}: ${m[0].slice(0, 70)}`);
    }
  }
}
ok(externalHits.length === 0, "no load-time external origins in rigs/", externalHits.join(" | "));

// --- 2. precache covers every local asset ---------------------------------
const assetRe = /(?:src|href)\s*=\s*["'](?!https?:|data:|mailto:|#)([^"']+)["']|url\(\s*["']?(?!https?:|data:)([^"')]+)["']?\s*\)/g;
const referenced = new Set();
for (const f of rigFiles) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(assetRe)) {
    const raw = (m[1] || m[2] || "").trim();
    if (!raw || raw.startsWith("#")) continue;
    referenced.add(raw.split("?")[0].split("#")[0]);
  }
}
const missingFromPrecache = [...referenced].filter((a) => {
  const base = a.replace(/^\.?\//, "").replace(/^rigs\//, "");
  return !(sw.includes(a) || sw.includes(base) || sw.includes("/rigs/" + base));
});
ok(haveSw && missingFromPrecache.length === 0,
  "every local asset referenced by rigs/ appears in the SW precache list",
  missingFromPrecache.join(" | "));

// --- 3. referenced font files exist on disk -------------------------------
const fontRefs = [...index.matchAll(/url\(\s*["']?([^"')]*\.woff2?)["']?\s*\)/g)].map((m) => m[1]);
const missingFonts = fontRefs.filter((f) => !existsSync(join(RIGS, f.replace(/^\.?\//, "").replace(/^rigs\//, ""))));
ok(fontRefs.length > 0, "index.html declares at least one self-hosted font file");
ok(missingFonts.length === 0, "every referenced font file exists on disk", missingFonts.join(" | "));

// --- 4. the SW can actually take over on a new deploy ---------------------
// Without a versioned cache name and a delete branch, a cached shell is served
// forever and Coach reads last month's content at the rail.
ok(/const\s+CACHE\s*=\s*["'][^"']*v\d+[^"']*["']/.test(sw),
  "sw.js CACHE is a versioned string literal", sw.match(/const\s+CACHE\s*=.*/)?.[0]);
ok(/activate[\s\S]{0,600}caches\.delete/.test(sw),
  "sw.js activate handler deletes caches that are not the current one");
ok(/skipWaiting/.test(sw) && /clients\.claim/.test(sw),
  "sw.js calls skipWaiting and clients.claim so a new version takes over");

// --- 5. fallback stack so a missing font degrades, never breaks ------------
ok(/font-family\s*:[^;]*,[^;]*(sans-serif|system-ui|-apple-system)/i.test(index),
  "font-family declarations carry a system fallback after the custom family");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
