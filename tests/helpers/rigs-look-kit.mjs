// What the look smokes share: the pinned clock, the eight skies, the faked
// weather, and the contrast guard that measures every word on a screen
// against the pixels painted behind it. Used by tests/rigs-look.smoke.mjs
// (the shell, Hot Trips, the run card) and tests/rigs-look-library.smoke.mjs
// (the library and the map). Nothing here reaches a real server.
import { inflateSync } from "node:zlib";

const pad = (n) => String(n).padStart(2, "0");
export const NOW = new Date("2026-11-23T12:00:00-08:00"); // a Monday, noon
export const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
export const SKIES = ["night", "firstLight", "dawn", "overcast", "rain", "bright", "golden", "dusk"];
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
// A spring week, for what only fishes in spring (surf perch off the coast
// beaches, March to October). Same weather, same tides, another season.
export const SPRING_NOW = new Date("2027-05-03T12:00:00-07:00"); // a Monday, noon
export const SPRING_DAYS = ["2027-05-03", "2027-05-04", "2027-05-05", "2027-05-06", "2027-05-07", "2027-05-08", "2027-05-09"];
// A September week, for what only fishes then: coho and kings from the
// kayak at Dash Point, coho on the Green, crab off the Westport float. It is
// September 2026: the 2026-27 pamphlet's salmon dates end before September
// 2027 (Marine Area 11 on Apr 30, the Green on Dec 31), so 2027's kayak
// salmon wait for the 2027-28 pamphlet.
export const SEPT_NOW = new Date("2026-09-14T12:00:00-07:00"); // a Monday, noon
export const SEPT_DAYS = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
// a December week: the winter steelhead trips (Tokul, the Cowlitz)
export const DEC_NOW = new Date("2026-12-07T12:00:00-08:00"); // a Monday, noon
export const DEC_DAYS = ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"];
// rain: { "2026-11-28": [8, 9] }, the hours it rains (a tenth of an inch).
function wxPoint(days, rain = {}) {
  const time = [], t = [], p = [], w = [], g = [], c = [];
  for (const d of days) for (let h = 0; h < 24; h++) {
    time.push(`${d}T${pad(h)}:00`); t.push(45); p.push((rain[d] || []).includes(h) ? 0.1 : 0); c.push(90);
    const bad = d === days[2];
    w.push(bad ? 28 : 4); g.push(bad ? 42 : 8);
  }
  return { hourly: { time, temperature_2m: t, precipitation: p, wind_speed_10m: w, wind_gusts_10m: g, cloud_cover: c },
    daily: { time: days, sunrise: days.map((d) => `${d}T07:31`), sunset: days.map((d) => `${d}T16:24`) } };
}
function marine(days) {
  const time = [], wave = [];
  for (const d of days) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); wave.push(4); }
  return { hourly: { time, wave_height: wave } };
}
const tidesFor = (days) => ({ predictions: days.flatMap((d) => [
  { t: `${d} 04:30`, v: "11.0", type: "H" }, { t: `${d} 11:00`, v: "2.0", type: "L" },
  { t: `${d} 17:15`, v: "12.0", type: "H" }, { t: `${d} 21:00`, v: "-0.5", type: "L" }]) });
// o.days, o.now: another week (SPRING_DAYS, SPRING_NOW). The default is the
// week of NOW, a Monday in November. o.rain: hours it rains (see wxPoint).
// o.noTides: the NOAA tide call fails, the way it does with a weak signal.
export async function fake(ctx, o = {}) {
  const days = o.days || DAYS, now = o.now || NOW;
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => json(r, 200, { checked: now.toISOString(), rules: [] }));
  await ctx.route(/api\.water\.noaa\.gov/, (r) => json(r, 200, { observed: { data: [{ validTime: `${days[0]}T19:00:00Z`, primary: 0.41 }] },
    forecast: { data: days.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4 })) } }));
  await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
    const u = route.request().url(), n = (new URL(u).searchParams.get("latitude") || "").split(",").length;
    if (o.noTides && /tidesandcurrents/.test(u)) return route.abort();
    return json(route, 200, /marine-api/.test(u) ? Array.from({ length: n }, () => marine(days)) : /open-meteo/.test(u) ? Array.from({ length: n }, () => wxPoint(days, o.rain)) : tidesFor(days));
  });
}

// ---- a PNG, down to its pixels (8 bit RGB or RGBA, which is what a
// screenshot is) ---------------------------------------------------------
export function decodePng(buf) {
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
// the contrast between two rgb colours, 1 to 21
export const contrast = ratio;

// Every piece of text on the screen, with its colour, against what is
// painted behind it. Returns the ones that cannot be read. within: a
// selector, to check only the text inside those parts.
export async function unreadable(page, within) {
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
      // map tiles, pins and controls sit on the map's own pictures; an open
      // pin's card is the page's and is measured like any other
      if (!el || el.closest(".dia, .tyer, .leaflet-tile-pane, .leaflet-marker-pane, .leaflet-control-container, svg, [hidden], .vh, option")) continue;
      // inside a closed <details> (not its summary) nothing is on screen,
      // though the browser may still report boxes for it
      if (el.closest("details:not([open]) > :not(summary)")) continue;
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
