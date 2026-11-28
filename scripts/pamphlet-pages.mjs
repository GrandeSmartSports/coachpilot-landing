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
// eastside lakes) whose text has the lake's heading, and its first rule on
// that page or the next. The PDF's page n is printed page n - 2 (the cover
// pages carry no number). A lake the script cannot place gets no page: the
// app then shows the rule with its web page only.
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
      const name = norm(e.name).toUpperCase(), rule = e.sections[0] && e.sections[0].rows[0] ? norm(e.sections[0].rows[0].rule) : "";
      const note = e.sections[0] ? norm(e.sections[0].note) : "";
      const cands = range.filter((i) => up[i].includes(name));
      let at = cands.find((i) => (!note || pdf[i].includes(note) || pdf[i + 1] && pdf[i + 1].includes(note)) && (!rule || pdf[i].includes(rule) || (pdf[i + 1] || "").includes(rule)));
      if (at == null) at = cands.find((i) => !rule || pdf[i].includes(rule) || (pdf[i + 1] || "").includes(rule));
      if (at == null) at = cands[0];
      if (at != null) out[pageKey(slug, e)] = printed(at);
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
