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
    // "#n" and its encoded form "%23n" point inside the same document (a
    // filter in an inline SVG), not at a file.
    if (!raw || raw.startsWith("#") || raw.startsWith("%23")) continue;
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
// The page's styles are index.html plus the stylesheets beside it (kit.css
// carries the @font-face rules now), so both are read.
const sheets = rigFiles.filter((f) => /\.css$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
const pageCss = index + "\n" + sheets;
const fontRefs = [...pageCss.matchAll(/url\(\s*["']?([^"')]*\.woff2?)["']?\s*\)/g)].map((m) => m[1]);
const missingFonts = fontRefs.filter((f) => !existsSync(join(RIGS, f.replace(/^\.?\//, "").replace(/^rigs\//, ""))));
ok(fontRefs.length > 0, "the page declares at least one self-hosted font file");
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
// EVERY declaration, not "at least one somewhere in the file". The earlier
// version was a single .test() over the whole document, so `body{font-family:
// Inter,system-ui,...}` satisfied it alone and every "Barlow Condensed"
// declaration could lose its fallback without the suite noticing.
const GENERIC = /(sans-serif|serif|monospace|system-ui|cursive|fantasy|ui-monospace|ui-sans-serif)\s*$/i;
// Inside @font-face, font-family NAMES the font being defined. A fallback
// there would be meaningless, so those blocks are excluded and only real
// usages are checked.
const usageCss = pageCss.replace(/@font-face\s*\{[^}]*\}/gi, "");
// The kit sets most type with the font shorthand, so that is read too. A
// shorthand ends with the family list; "inherit" names no family at all.
const fontDecls = [...usageCss.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) => m[1].trim())
  .concat([...usageCss.matchAll(/[;{\s]font\s*:\s*([^;}]+)/gi)].map((m) => m[1].trim()).filter((d) => !/^inherit\b/i.test(d)));
const varFonts = [...pageCss.matchAll(/--mono\s*:\s*([^;}]+)/gi)].map((m) => m[1].trim());
const noFallback = fontDecls.filter((d) => {
  if (/^var\(\s*--mono\s*\)$/i.test(d)) return !varFonts.every((v) => GENERIC.test(v));
  return !GENERIC.test(d);
});
ok(fontDecls.length > 3, "the page declares font families", `found ${fontDecls.length}`);
ok(noFallback.length === 0,
  "EVERY font-family declaration ends in a generic family", noFallback.join(" | "));

// --- 6. the service worker cannot half install or half activate ------------
// A partial install that still resolves, followed by an unconditional delete
// of the previous cache, leaves no working copy at all.
ok(/addAll\(\s*SHELL\s*\)/.test(sw),
  "sw.js addAll()s the shell so a partial shell fails the install");
ok(/hasShell[\s\S]{0,200}caches\.delete|if\s*\(\s*hasShell\s*\)/.test(sw),
  "sw.js only deletes the old cache once the new one holds the shell");

// --- 7. only the shell may ever replace the cached shell -------------------
// A 404 or a 5xx during a deploy must not become the page the app falls back
// to, because it then stays dead until the next successful online navigation.
ok(/function\s+isShellPath/.test(sw), "sw.js gates which paths may overwrite the cached shell");
ok(/res\.ok/.test(sw) && /res\.status\s*===\s*200/.test(sw),
  "sw.js checks response status before caching");

// --- 8. navigations must not wait on the network ---------------------------
ok(/navigate[\s\S]{0,400}caches\.match/.test(sw),
  "sw.js serves navigations from cache before touching the network");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
