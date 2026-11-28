// Makes scripts/pamphlet-pages.json: the printed page of each lake on the
// 2026-27 pamphlet's six lake special rules pages, so the app can say
// "page 89" beside a rule it quotes. Run once a year, when the pamphlet
// changes (the lakes build reads the file; it fetches no PDF).
//
// Run: node scripts/pamphlet-pages.mjs              (fetches the six pages and the PDF from eregulations.com)
//      node scripts/pamphlet-pages.mjs --from DIR   (reads DIR/<page>.html and DIR/pamphlet-raw.txt instead)
// Needs pdftotext (poppler) to read the PDF.
//
// A lake's page is the printed page in its own section (westside or
// eastside lakes) whose text has the lake's whole heading, "NAME - COUNTY
// CO.", where a word starts (SHOE LAKE is not inside HORSESHOE LAKE, WOOD
// LAKE - MASON CO. is not PACKWOOD LAKE - LEWIS CO.), with the words under
// the heading after it on that same page (Martha Lake's "Warm Beach"), and
// its first rule on that page or the next. The PDF's page n is printed page
// n - 2 (the cover pages carry no number). A lake the script cannot place
// gets no page: the app then shows the rule with its web page only.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lakeEntries } from "./build-waters.mjs";
import { PAMPHLET, PAMPHLET_PAGES, PAMPHLET_PDF, pageKey } from "./build-lakes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const norm = (s) => String(s).replace(/[”“″]/g, '"').replace(/[’‘]/g, "'").replace(/[–—]/g, "-").replace(/­/g, "").replace(/ /g, " ")
  .replace(/\s+/g, " ").replace(/\s+([.,:;)])/g, "$1").replace(/\(\s+/g, "(").trim();

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "NAME - COUNTY/COUNTY CO." where a word starts; a hyphen may or may not
// have spaces round it ("PARA -JUVENILE LAKE" on the web is PARA-JUVENILE in the PDF).
function headingRe(name, counties) {
  const part = (s) => escRe(s).replace(/ ?- ?/g, " ?- ?");
  return new RegExp("(?<![A-Z0-9'])" + part(name) + " ?- ?" + counties.map((c) => escRe(norm(c).toUpperCase())).join(" ?/ ?") + " CO\\.", "g");
}

// pdfText: the PDF as pdftotext writes it (pages split by form feeds).
export function pagesOf(htmlBySlug, pdfText) {
  const pdf = String(pdfText).split("\f").map(norm), up = pdf.map((p) => p.toUpperCase());
  const printed = (i) => i - 1; // text page i (0 based) is PDF page i + 1, printed page i - 1
  const west = [], east = [];
  up.forEach((p, i) => { if (/WESTSIDE LAKES - SPECIAL RULES/.test(p)) west.push(i); if (/EASTSIDE LAKES - SPECIAL RULES/.test(p)) east.push(i); });
  const out = {};
  for (const slug of PAMPHLET_PAGES) {
    const range = /^westside/.test(slug) ? west : east;
    for (const e of lakeEntries(htmlBySlug[slug] || "")) {
      const name = norm(e.name).toUpperCase(), rule = e.sections[0] && e.sections[0].rows[0] ? norm(e.sections[0].rows[0].rule).toUpperCase() : "";
      const note = e.sections[0] ? norm(e.sections[0].note).toUpperCase() : "";
      const re = headingRe(name, e.counties);
      // every place the whole heading stands: the page, and where on it the heading ends
      const heads = range.flatMap((i) => [...up[i].matchAll(re)].map((m) => ({ i, end: m.index + m[0].length })));
      // the words under the heading come after it on its own page. A long
      // note the PDF breaks up is not found whole: a heading on one page only
      // is still that page; on two pages, which one is not guessed.
      const under = heads.filter((h) => !note || up[h.i].indexOf(note, h.end) >= 0);
      const ruled = (h) => !rule || up[h.i].indexOf(rule, h.end) >= 0 || (up[h.i + 1] || "").includes(rule);
      const at = under.find(ruled) || under[0] || (new Set(heads.map((h) => h.i)).size === 1 ? heads[0] : null);
      if (at) out[pageKey(slug, e)] = printed(at.i);
    }
  }
  return out;
}

async function main(from) {
  const html = {};
  let text;
  if (from) {
    for (const slug of PAMPHLET_PAGES) html[slug] = readFileSync(join(from, slug + ".html"), "utf8");
    text = readFileSync(join(from, "pamphlet-raw.txt"), "utf8");
  } else {
    const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": "RigCard pamphlet pages (coachpilot.org/rigs)" } }); if (!r.ok) throw new Error(u + " " + r.status); return r; };
    for (const slug of PAMPHLET_PAGES) html[slug] = await (await get(PAMPHLET + slug)).text();
    const dir = mkdtempSync(join(tmpdir(), "pamphlet-"));
    try {
      writeFileSync(join(dir, "p.pdf"), Buffer.from(await (await get(PAMPHLET_PDF)).arrayBuffer()));
      execFileSync("pdftotext", [join(dir, "p.pdf"), join(dir, "p.txt")]);
      text = readFileSync(join(dir, "p.txt"), "utf8");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const pages = pagesOf(html, text), all = PAMPHLET_PAGES.reduce((t, s) => t + lakeEntries(html[s]).length, 0);
  if (Object.keys(pages).length < all * 0.9) throw new Error("placed only " + Object.keys(pages).length + " of " + all + " lakes: not written");
  writeFileSync(resolve(ROOT, "scripts/pamphlet-pages.json"), JSON.stringify(pages, null, 1) + "\n");
  console.log("placed " + Object.keys(pages).length + " of " + all + " lakes on their printed pages");
}

let asScript = false;
try { asScript = !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { asScript = false; }
if (asScript) { const i = process.argv.indexOf("--from"); await main(i > 0 ? process.argv[i + 1] : ""); }
