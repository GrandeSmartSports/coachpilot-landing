// The look: the "On the water" kit in the real page at phone width.
// Run: node tests/rigs-look.smoke.mjs
//
// What this guards: a painted scene on top of the Trips screen and the run
// card, the first card crossing the waterline, a painted thumbnail on every
// trip row, a ribbon of light on every day with a bead that can be counted
// for every trip, the dock (and the sky it keeps behind it once the page
// moves), one line a row on the run card, a river that is lit at night, a
// week that still draws when the sky engine or the painter does not load,
// and text that can be read under every sky the engine has. Contrast is measured from the pixels
// the browser paints, so glass, gradients and the scene behind a title all
// count. Text inside the rig drawings (.dia) and on map tiles is left out.
// Nothing here reaches a real server.
import { chromium } from "@playwright/test";
import { inflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8807;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 600)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 240000);
watchdog.unref?.();

const pad = (n) => String(n).padStart(2, "0");
const NOW = new Date("2026-11-23T12:00:00-08:00"); // a Monday, noon
const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
const SKIES = ["night", "firstLight", "dawn", "overcast", "rain", "bright", "golden", "dusk"];
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
function wxPoint() {
  const time = [], t = [], p = [], w = [], g = [], c = [];
  for (const d of DAYS) for (let h = 0; h < 24; h++) {
    time.push(`${d}T${pad(h)}:00`); t.push(45); p.push(0); c.push(90);
    const bad = d === "2026-11-25";
    w.push(bad ? 28 : 4); g.push(bad ? 42 : 8);
  }
  return { hourly: { time, temperature_2m: t, precipitation: p, wind_speed_10m: w, wind_gusts_10m: g, cloud_cover: c },
    daily: { time: DAYS, sunrise: DAYS.map((d) => `${d}T07:31`), sunset: DAYS.map((d) => `${d}T16:24`) } };
}
function marine() {
  const time = [], wave = [];
  for (const d of DAYS) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); wave.push(4); }
  return { hourly: { time, wave_height: wave } };
}
const tides = { predictions: DAYS.flatMap((d) => [
  { t: `${d} 04:30`, v: "11.0", type: "H" }, { t: `${d} 11:00`, v: "2.0", type: "L" },
  { t: `${d} 17:15`, v: "12.0", type: "H" }, { t: `${d} 21:00`, v: "-0.5", type: "L" }]) };
async function fake(ctx) {
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => json(r, 200, { checked: NOW.toISOString(), rules: [] }));
  await ctx.route(/api\.water\.noaa\.gov/, (r) => json(r, 200, { observed: { data: [{ validTime: "2026-11-23T19:00:00Z", primary: 0.41 }] },
    forecast: { data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4 })) } }));
  await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
    const u = route.request().url(), n = (new URL(u).searchParams.get("latitude") || "").split(",").length;
    return json(route, 200, /marine-api/.test(u) ? Array.from({ length: n }, marine) : /open-meteo/.test(u) ? Array.from({ length: n }, wxPoint) : tides);
  });
}

// ---- a PNG, down to its pixels (8 bit RGB or RGBA, which is what a
// screenshot is) ---------------------------------------------------------
function decodePng(buf) {
  let p = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString("ascii", p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); type = body[9]; if (body[8] !== 8 || (type !== 2 && type !== 6)) throw new Error("png kind " + body[8] + "/" + type); }
    if (kind === "IDAT") idat.push(body);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, row = w * bpp, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row;
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst + x - row] : 0, c = x >= bpp && y ? px[dst + x - row - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Every piece of text on the screen, with its colour, against what is
// painted behind it. Returns the ones that cannot be read. within: a
// selector, to check only the text inside those parts.
async function unreadable(page, within) {
  // The whole page in view, so nothing pinned sits on top of something else.
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 390, height: Math.max(844, tall) });
  await page.waitForTimeout(120);
  const texts = await page.evaluate((within) => {
    const out = [], app = document.getElementById("app");
    // A computed colour can come back as rgb(), rgba() or color(srgb ...).
    // Painting one pixel with it gives the same four numbers every time.
    const cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const walk = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest(".dia, .tyer, .leaflet-container, svg, [hidden], .vh, option")) continue;
      if (within && !el.closest(within)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      let alpha = 1;
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) alpha *= parseFloat(getComputedStyle(e).opacity);
      const m = rgba(cs.color);
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) {
        if (b.width < 3 || b.height < 3) continue;
        // Covered by something else (a pinned bar): not what is on screen here.
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) continue;
        out.push({ t: n.nodeValue.trim().slice(0, 28), x: b.left, y: b.top, w: b.width, h: b.height, c: m.slice(0, 3), a: m[3] * alpha,
          px: parseFloat(cs.fontSize), cls: (el.className && String(el.className).slice(0, 30)) || el.tagName });
      }
    }
    return out;
  }, within || "");
  // The same screen with its words taken out: what is left is what they sit on.
  const style = await page.addStyleTag({ content: "#app *{color:transparent!important;text-shadow:none!important}#app input::placeholder{color:transparent!important}" });
  const img = decodePng(await page.screenshot());
  await style.evaluate((n) => n.remove());
  await page.setViewportSize({ width: 390, height: 844 });
  const k = img.w / 390, bad = [];
  for (const t of texts) {
    const x0 = Math.max(0, Math.floor(t.x * k)), x1 = Math.min(img.w, Math.ceil((t.x + t.w) * k)), y0 = Math.max(0, Math.floor(t.y * k)), y1 = Math.min(img.h, Math.ceil((t.y + t.h) * k));
    if (x1 <= x0 || y1 <= y0) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.w + x) * img.bpp; r += img.px[i]; g += img.px[i + 1]; b += img.px[i + 2]; n++; }
    const bg = [r / n, g / n, b / n], ink = t.c.map((v, i) => v * t.a + bg[i] * (1 - t.a));
    const got = ratio(ink, bg), need = t.px >= 24 ? 3 : 4.5;
    if (got < need) bad.push(`"${t.t}" ${got.toFixed(2)} < ${need} (${Math.round(t.px)}px .${t.cls})`);
  }
  return { n: texts.length, bad };
}

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  await fake(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${PORT}/rigs/`;
  await page.goto(base + "#/trips", { waitUntil: "load" });
  await page.waitForSelector("[data-day] [data-hot]");

  // One sky at a time, the way the brief says: the engine answers with the
  // sky we name, and a change of address redraws under it.
  const sky = async (id, hash) => {
    await page.evaluate(([i, h]) => {
      const p = RIG.sky.palettes[i];
      RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name });
      location.hash = "#/learn"; location.hash = h;
    }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForTimeout(80);
  };
  const PIER = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo");
  const RIVER = "#/trips/" + encodeURIComponent("2026-11-28~chum-green-river");
  const painted = () => page.evaluate(() => {
    const s = document.getElementById("scene"), svg = s && s.querySelector("svg");
    return { kind: s && s.getAttribute("data-scene"), svgs: s ? s.querySelectorAll("svg").length : 0, kids: svg ? svg.querySelectorAll("*").length : 0, h: s ? s.getBoundingClientRect().height : 0 };
  });
  // The first card starts on the picture and ends below it.
  const crosses = (sel) => page.evaluate((q) => {
    const s = document.getElementById("scene").getBoundingClientRect(), c = document.querySelector(q), b = c && c.getBoundingClientRect();
    return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), scene: Math.round(s.bottom), ok: b.top < s.bottom - 24 && b.bottom > s.bottom && b.top > s.top } : null;
  }, sel);

  for (const id of ["overcast", "night", "golden"]) {
    await sky(id, "#/trips");
    await page.waitForSelector("[data-call] [data-call-go]");
    const s = await painted();
    ok(s.kind === "sound" && s.svgs >= 1 && s.kids > 50 && s.h > 300, id + ": Hot Trips stands under a painted scene, the Sound", s);
    const c = await crosses("[data-call]");
    ok(c && c.ok, id + ": the call is the first card and it crosses the waterline", c);
    const rows = await page.evaluate(() => [...document.querySelectorAll("[data-hot]")].map((r) => {
      const t = r.querySelector(".tile"), svg = t && t.querySelector("svg"), b = t && t.getBoundingClientRect();
      return { id: r.dataset.hot, kids: svg ? svg.querySelectorAll("*").length : 0, w: b ? b.width : 0, kind: t && t.dataset.mini, under: t && t.dataset.under };
    }));
    ok(rows.length >= 10 && rows.every((r) => r.kids > 5 && r.w >= 44 && r.kind && r.under), id + ": every trip row carries its own small painting", rows.filter((r) => !(r.kids > 5 && r.w >= 44)));
    ok(await page.locator("[data-call] .tile svg").count() === 1, id + ": and so does the call");
    const days = await page.evaluate(() => [...document.querySelectorAll("[data-day]")].map((d) => {
      const r = d.querySelector("h2 .ribbon");
      return { iso: d.dataset.day, ribbon: !!r && /gradient/.test(r.style.background), beads: r ? r.querySelectorAll("b").length : -1, trips: d.querySelectorAll("[data-hot]").length, w: r ? r.getBoundingClientRect().width : 0 };
    }));
    ok(days.length === 7 && days.every((d) => d.ribbon && d.w > 60 && d.beads === d.trips), id + ": every day has its ribbon of light, a bead for each trip", days.filter((d) => !(d.ribbon && d.beads === d.trips)));
    // Trips that start at the same hour do not hide behind one bead.
    const stacked = await page.evaluate(() => [...document.querySelectorAll("[data-day] h2 .ribbon")].map((r) => {
      const x = [...r.querySelectorAll("b")].map((b) => b.getBoundingClientRect().left).sort((a, b) => a - b), box = r.getBoundingClientRect();
      const gaps = x.slice(1).map((v, i) => v - x[i]);
      return { n: x.length, min: gaps.length ? Math.min(...gaps) : 99, inside: x.every((v) => v >= box.left - 1 && v + 7 <= box.right + 1) };
    }));
    ok(stacked.some((r) => r.n >= 4) && stacked.every((r) => r.min >= 4 && r.inside), id + ": beads that share an hour fan out, so every one can be counted, and none leaves the ribbon", stacked);
    ok(await page.locator(".dock [data-tab]").count() === 4 && await page.locator(".dock [data-skymode] .skytok").count() === 1, id + ": the dock is there: four tabs and the sky button");
    ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, id + ": Hot Trips fits the phone");

    for (const [hash, kind, name] of [[PIER, "pier", "a pier run card"], [RIVER, "river", "a river run card"]]) {
      await sky(id, hash);
      await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
      const r = await painted();
      ok(r.kind === kind && r.svgs >= 1 && r.kids > 50, id + ": " + name + " stands under its own scene, the " + kind, r);
      const pc = await crosses('[data-sec-row="plan"]');
      ok(pc && pc.ok, id + ": the plan is the first card on " + name + " and it crosses the waterline", pc);
      ok(await page.locator(".duo .tcard").count() === 2 && await page.locator(".duo .tcard svg").count() >= 1 && await page.locator('[data-view="hot"] .tl-sky').evaluate((e) => /gradient/.test(e.style.background)),
        id + ": " + name + " has its two picture tiles and the plan's strip of sky");
      ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, id + ": " + name + " fits the phone");
      // Headlines: each row in the grouped card says one thing on one line,
      // whole, and the rules row is never cut.
      const lines = await page.evaluate(() => [...document.querySelectorAll('[data-view="hot"] > .list .row .tx > span')].map((e) => ({
        t: e.textContent, h: Math.round(e.getBoundingClientRect().height), cut: e.scrollWidth > e.clientWidth + 1 })));
      ok(lines.length >= 5 && lines.every((l) => l.t.length > 3 && l.h <= 22 && !l.cut), id + ": every row on " + name + " is one whole line", lines.filter((l) => !(l.h <= 22 && !l.cut)));
      const rule = await page.evaluate(() => { const e = document.querySelector('[data-sec-row="rules"] .tx > span'); return { t: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 }; });
      ok(rule.t.length > 8 && !rule.cut && !/…|\.\.\.$/.test(rule.t), id + ": the rules row on " + name + " shows its rule whole", rule);
    }
  }
  // Night is lit: the engine's dark flag is on and the pier's lamps are burning.
  await sky("night", PIER);
  const lit = await page.evaluate(() => ({ dark: document.documentElement.getAttribute("data-dark"), lamps: getComputedStyle(document.documentElement).getPropertyValue("--lamps").trim(),
    pools: document.querySelectorAll("#scene .w-lampson *").length }));
  ok(lit.dark === "1" && lit.lamps === "1" && lit.pools > 3, "at night the pier's lamps are on", lit);
  // And so is the river: a lit window on the far bank with its light on the
  // water, and the sky's light lying on the bend.
  await sky("night", RIVER);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
  const rlit = await page.evaluate(() => {
    const s = document.getElementById("scene"), cs = getComputedStyle(s), w = s.querySelector(".w-window");
    return { scene: s.getAttribute("data-scene"), window: w ? w.querySelectorAll("rect").length : 0, on: w ? getComputedStyle(w).opacity : "", road: parseFloat(cs.getPropertyValue("--road")), glow: parseFloat(cs.getPropertyValue("--glow")) };
  });
  ok(rlit.scene === "river" && rlit.window > 8 && rlit.on === "1" && rlit.road >= 0.4 && rlit.glow >= 0.3, "at night the river is lit: a window on the far bank and light on the water", rlit);
  await sky("overcast", RIVER);
  const rday = await page.evaluate(() => { const w = document.querySelector("#scene .w-window"); return w ? getComputedStyle(w).opacity : ""; });
  ok(rday === "0", "by day that window is dark", rday);

  // The dock switches tabs, from any screen.
  await sky("overcast", "#/trips");
  for (const [tab, view] of [["water", "home"], ["fish", "fish"], ["learn", "learn"], ["trips", "trips"]]) {
    await page.locator('.dock [data-tab="' + tab + '"]').click();
    await page.waitForSelector('[data-view="' + view + '"]');
    ok(await page.locator('.dock [data-tab="' + tab + '"]').getAttribute("aria-selected") === "true" && (await painted()).kids > 50, "the dock opens " + tab + ", lit, with the scene still painted");
  }
  const one = await page.evaluate(() => document.querySelectorAll("#scene, .scene").length);
  ok(one === 1, "one scene on the page, however many screens were drawn", one);
  // One motion: the glints on the water shimmer and nothing else moves.
  const moving = await page.evaluate(() => document.getAnimations().map((a) => a.animationName || "other"));
  ok(moving.length >= 1 && moving.every((n) => n === "shim"), "the only thing that moves on the scene is the shimmer on the water", moving.join(","));

  // Once the page moves, the dock keeps a band of sky behind it, so cards
  // and titles pass behind the tabs and never show between them.
  const band = () => page.evaluate(() => ({ on: document.documentElement.hasAttribute("data-scrolled"), o: getComputedStyle(document.querySelector(".dock"), "::before").opacity }));
  const b0 = await band();
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-scrolled") && getComputedStyle(document.querySelector(".dock"), "::before").opacity === "1");
  const b1 = await band();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-scrolled"));
  ok(!b0.on && b0.o === "0" && b1.on && b1.o === "1", "at the top the dock floats on the picture; once the page moves it has sky behind it", [b0, b1]);
  // The filters under the tabs ride on one strip, and the picked one is lit.
  await sky("overcast", "#/coho");
  await page.waitForSelector(".dock .jump [aria-current='true']");
  const strip = await page.evaluate(() => {
    const j = document.querySelector(".dock .jump"), cs = getComputedStyle(j), cur = j.querySelector("[aria-current='true']"), other = j.querySelector("[aria-current='false']");
    const jb = j.getBoundingClientRect(), cb = cur.getBoundingClientRect();
    return { glass: cs.backgroundColor !== "rgba(0, 0, 0, 0)", mask: cs.maskImage || cs.webkitMaskImage, bare: getComputedStyle(other).backgroundColor === "rgba(0, 0, 0, 0)", lit: getComputedStyle(cur).backgroundImage !== "none",
      seen: cb.left >= jb.left - 1 && cb.right <= jb.right + 1 };
  });
  ok(strip.glass && strip.bare && strip.lit && strip.seen && (!strip.mask || strip.mask === "none"), "the filter row is one glass strip, the open filter lit and in view, no name faded out", strip);

  // Readable under every sky the engine has.
  for (const id of SKIES) {
    await sky(id, "#/trips");
    await page.waitForSelector("[data-call] [data-call-go]");
    const a = await unreadable(page);
    ok(a.n > 150 && a.bad.length === 0, id + ": every word on Hot Trips can be read (" + a.n + " checked)", a.bad.slice(0, 8).join(" | "));
    await sky(id, PIER);
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    const b = await unreadable(page);
    ok(b.n > 50 && b.bad.length === 0, id + ": every word on the run card can be read (" + b.n + " checked)", b.bad.slice(0, 8).join(" | "));
  }
  // A narrow phone: ten pips still share one line and the tile titles do not wrap.
  await page.setViewportSize({ width: 360, height: 780 });
  await sky("overcast", PIER);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="gear"] .pips i');
  const narrow = await page.evaluate(() => {
    const tops = [...document.querySelectorAll('[data-sec-row="gear"] .pips i')].map((i) => Math.round(i.getBoundingClientRect().top));
    const heads = [...document.querySelectorAll(".duo .tcard > b")].map((b) => Math.round(b.getBoundingClientRect().height));
    return { pips: tops.length, rows: new Set(tops).size, heads, wide: document.documentElement.scrollWidth };
  });
  ok(narrow.pips === 10 && narrow.rows === 1 && narrow.heads.every((h) => h <= 24) && narrow.wide <= 360, "at 360 px the gear pips share one line and the tile titles stay on one line", narrow);
  await sky("overcast", "#/trips");
  await page.waitForSelector("[data-day] h2 .ribbon");
  const heads360 = await page.evaluate(() => [...document.querySelectorAll("[data-day] > h2")].map((h) => Math.round(h.getBoundingClientRect().height)));
  ok(heads360.length === 7 && heads360.every((h) => h <= 28) && await page.evaluate(() => document.documentElement.scrollWidth) <= 360, "and every day heading stays on one line", heads360);
  // A wide screen: the painting melts into a band of its own sky, not a cut out picture.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.waitForTimeout(80);
  const wideLook = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById("scene")), h = getComputedStyle(document.documentElement);
    return { mask: (cs.maskImage || cs.webkitMaskImage || "none") !== "none", band: /gradient/.test(h.backgroundImage) }; });
  ok(wideLook.mask && wideLook.band, "on a wide screen the scene fades at its sides into a band of the same sky", wideLook);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(80);
  const phoneLook = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById("scene")); return (cs.maskImage || cs.webkitMaskImage || "none") === "none" && getComputedStyle(document.documentElement).backgroundImage === "none"; });
  ok(phoneLook, "and on a phone it is edge to edge, untouched");

  // A title under a filter row sits low in the sky. It and the dock can be
  // read under every sky too (the rest of those screens is a later stage).
  for (const id of SKIES) {
    const bad = [];
    for (const hash of ["#/water", "#/fish", "#/learn", "#/coho"]) {
      await sky(id, hash);
      const r = await unreadable(page, ".hero, .dock");
      if (r.n < 6 || r.bad.length) bad.push(hash + ": " + (r.bad.join(" | ") || "only " + r.n + " checked"));
    }
    ok(bad.length === 0, id + ": the title and the dock can be read on Water, Fish, Learn and a fish's page", bad.join(" || "));
  }
  ok(errors.length === 0, "no page errors", errors.join(" | "));

  // The look is two files on top of the app. If either does not load, the
  // week still draws: it is plainer, never empty.
  for (const [file, what] of [["sky.js", "the sky engine"], ["scene.js", "the painter"]]) {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c2);
    await c2.route(new RegExp("/rigs/" + file.replace(".", "\\.")), (r) => r.abort());
    const p2 = await c2.newPage();
    await p2.clock.setFixedTime(NOW);
    const errs2 = []; p2.on("pageerror", (e) => errs2.push(e.message));
    await p2.goto(base + "#/trips", { waitUntil: "load" });
    await p2.waitForSelector("[data-day] [data-hot]", { timeout: 8000 }).catch(() => {});
    const got = await p2.evaluate(() => ({ rows: document.querySelectorAll("[data-hot]").length, call: !!document.querySelector("[data-call] [data-call-go]"),
      tiles: [...document.querySelectorAll("[data-hot] .tile")].filter((t) => t.getBoundingClientRect().width >= 44 && getComputedStyle(t).backgroundImage !== "none").length,
      chip: [...document.querySelectorAll("[data-skychip]")].filter((c) => !c.querySelector("[data-skyname]").textContent.trim()).length,
      sky: !!window.RIG.sky, btn: document.querySelectorAll("[data-skymode]").length, wide: document.documentElement.scrollWidth }));
    ok(got.rows >= 10 && got.call && errs2.length === 0, "without " + what + " the week and the call still draw", [got, errs2.join(" | ")]);
    ok(got.tiles === got.rows && got.chip === 0 && got.wide <= 390, "and each row keeps a plain swatch where its painting goes, with no empty chip", got);
    ok(got.sky ? got.btn === 1 : got.btn === 0, "the sky button is there only when it can change the screen", got);
    await p2.locator("[data-hot]").first().click();
    await p2.waitForSelector('[data-view="hot"] [data-sec-row="plan"]', { timeout: 5000 }).catch(() => {});
    ok(await p2.locator('[data-view="hot"] [data-sec-row]').count() >= 8 && errs2.length === 0, "and a run card opens", errs2.join(" | "));
    await c2.close();
  }
} catch (e) {
  fail++; console.log("FAIL threw", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
