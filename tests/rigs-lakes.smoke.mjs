// The lakes in the app: what is in a lake, and where a fish is.
// Run: node tests/rigs-lakes.smoke.mjs
//
// What this guards: Lake Tapps' page opens on its tiger muskie (the card
// that crosses the waterline), with the 50 inch rule and the May 5, 2026
// plant, then the lake's own cards, then the rest of its fish with a tag
// (the muskie not said twice), its rules from the pamphlet, and its launch
// card ahead of WDFW's 2014 map; the other lake spots list theirs; the Fish
// tab's Lakes group gains the lake fish, small, three across, each drawn in
// filled shapes, no two alike; every lake fish has its page (what it is,
// its rule, the lakes it is in right under it, nearest first, each one
// tappable, and one row to the lakes with their own rule); a lake from
// WDFW's map has a page of its own, under its own picture, with its season
// (Baker Lake shut now, its sockeye July 11-Aug. 31) and its rules; a
// Columbia pool says river rules, never the lake rule, its plant line kept
// (Lake Pateros' trout); Lake Sacajawea in Longview is a city lake on the
// statewide rules, not the Snake; the own-rule lists
// are the pamphlet's, county and all (Martha Warm Beach, Rattlesnake,
// Kachess, Lower Goose; not Easton Ponds; Riffe's closed stretch is not a
// brown trout rule); a lake fish's drawing fills in when fish.js comes after
// the lakes; a lake file that does not load says so with Try again; the
// strip under the dock marks where you are; The full rule's outline is
// whole; a tag only ever says stocked,
// in this lake, introduced or own rule, never wild or native, and never
// "legal size"; and every word on these screens can be read under all eight skies.
// Nothing here reaches a real server: the forecast is the fixtures', the
// lakes are the committed rigs/lakes.js.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SKIES, fake, unreadable } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8813;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 700)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 600000);
watchdog.unref?.();
const NEW = ["muskie", "smallmouth", "crappie", "bluegill", "pumpkinseed", "bullhead", "catfish", "walleye", "kokanee", "browntrout", "brooktrout", "tigertrout", "goldentrout", "laketrout", "sockeye", "sturgeon"];

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
  // the lakes come after the first screen, by themselves
  await page.waitForFunction(() => window.RIG.lakesData && window.RIG.lakeFish, null, { timeout: 15000 });
  ok(true, "the lakes load after the first screen without being asked");
  const go = async (hash, sel) => {
    await page.evaluate((h) => { location.hash = "#/learn"; location.hash = h; }, hash);
    await page.waitForSelector(sel, { timeout: 15000 });
    await page.waitForTimeout(60);
  };
  const sky = async (id, hash, sel) => {
    await page.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/learn"; location.hash = h; }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForSelector(sel, { timeout: 15000 });
    await page.waitForTimeout(80);
  };
  const crosses = (sel) => page.evaluate((q) => {
    const s = document.getElementById("scene").getBoundingClientRect(), c = document.querySelector(q), b = c && c.getBoundingClientRect();
    return b ? b.top < s.bottom - 24 && b.bottom > s.bottom && b.top > s.top : false;
  }, sel);
  const tags = () => page.evaluate(() => [...document.querySelectorAll("[data-tag]")].map((t) => t.textContent.trim()));
  const TAG = /^(Stocked [A-Z][a-z]{2} \d{1,2}, \d{4}|Stocked \d{4}|In this lake|Introduced|Own rule)$/;
  const viewText = () => page.evaluate(() => document.querySelector("[data-view]").innerText);

  // ---- Lake Tapps ------------------------------------------------------------------
  await go("#/spot/lake-tapps", "[data-lake-head] [data-plate] svg");
  const tp = await page.evaluate(() => {
    const h = document.querySelector("[data-lake-head]"), rows = [...document.querySelectorAll("[data-in-here] [data-lake-fish]")].map((r) => r.dataset.lakeFish);
    const at = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect().top + scrollY : -1; };
    const on = document.querySelector("[data-getting-on]");
    return { url: location.hash, head: h.dataset.lakeHead, first: document.querySelector('[data-view="spot"] .float') === h, rule: (h.querySelector("[data-head-rule]") || {}).textContent || "",
      plant: (h.querySelector(".plant") || {}).textContent || "", tag: (h.querySelector("[data-tag]") || {}).textContent || "", rows, cards: [...document.querySelectorAll("[data-row-species]")].map((r) => r.dataset.rowSpecies),
      yCards: at("[data-spot-cards]"), yHere: at("[data-in-here]"), yOld: at("[data-in-here-old]"), rules: (document.querySelector("[data-lake-rules]") || {}).innerText || "",
      on: on ? [on.dataset.gettingOn, on.getAttribute("href"), on.innerText] : null, text: document.querySelector("[data-view]").innerText };
  });
  ok(tp.url === "#/spot/lake-tapps" && tp.head === "muskie" && tp.first, "Lake Tapps opens on its tiger muskie, the first card (it no longer skips to its one card)", tp);
  ok(/^50 inches to keep, 1 a day/.test(tp.rule.trim()) && !/released/.test(tp.rule) && /page 25/.test(tp.rule), "with its rule: 50 inches to keep, 1 a day, from the pamphlet's page 25 (M2)", tp.rule);
  ok(/1,631 planted, the 21st plant since 2000\./.test(tp.plant) && !/May/.test(tp.plant) && /Stocked May 5, 2026/.test(tp.tag), "and the May 5, 2026 plant: the date once, on its tag", [tp.plant, tp.tag]);
  ok(!tp.rows.includes("muskie") && ["smallmouth", "crappie", "perch", "bass", "trout"].every((id) => tp.rows.includes(id)), "the rest of the lake's fish, the muskie not said twice", tp.rows);
  ok(tp.cards.includes("perch") && tp.yCards > 0 && tp.yCards < tp.yHere && tp.yHere < tp.yOld, "its own cards come right after the muskie, then what else is in it, then older records (look 1)", [tp.yCards, tp.yHere, tp.yOld]);
  ok(/All game fish: Statewide min\. size\/daily limit\./.test(tp.rules) && /Year-round/.test(tp.rules) && /page 89/.test(tp.rules), "its rules: the pamphlet's entry, year-round, page 89", tp.rules);
  ok(tp.on && tp.on[0] === "card" && tp.on[1] === "#/perch/lake-tapps/tapps-launch" && /Launching on Lake Tapps/.test(tp.on[2]) && /Checked Aug 7, 2026/.test(tp.on[2]) && !/Boat ramp/.test(tp.on[2]),
    "Getting on: its own dated launch card (Allan Yorke closed), not WDFW's 2014 map (I4)", tp.on);
  ok(!/legal size/i.test(tp.text), "a plant is never said as 'legal size' (I5)", tp.text.slice(0, 400));
  ok(await crosses("[data-lake-head]"), "the tiger muskie card crosses the waterline");
  const tt = await tags();
  ok(tt.length >= 6 && tt.every((t) => TAG.test(t)), "every tag says stocked (with its date), in this lake, or introduced", tt);
  await page.locator("[data-lake-head]").click();
  await page.waitForSelector('[data-view="lakefish"][data-fish="muskie"]');
  const tappsRow = await page.locator('[data-lake-row="lake-tapps-pierce"]').innerText();
  ok(/1,631 planted, about 3 a pound, 21 plants since 2000/.test(tappsRow), "the head card opens its fish page, where Lake Tapps' row says its plant by the pound (I5)", tappsRow);
  await go("#/spot/lake-tapps", "[data-in-here] [data-lake-fish]");
  await page.locator('[data-in-here] [data-lake-fish="smallmouth"]').click();
  await page.waitForSelector('[data-view="lakefish"][data-fish="smallmouth"]');
  ok(true, "a fish in the lake opens its fish page");

  // ---- the other lake spots ------------------------------------------------------------
  for (const [spot, must] of [["lake-fenwick", ["bass", "perch", "trout"]], ["american-lake", ["kokanee", "trout", "smallmouth"]]]) {
    await go("#/spot/" + spot, "[data-in-here] [data-lake-fish]");
    const f = await page.evaluate(() => [...document.querySelectorAll("[data-in-here] [data-lake-fish], [data-in-here-old] [data-lake-fish]")].map((r) => r.dataset.lakeFish));
    ok(must.every((id) => f.includes(id)), spot + " lists what is in it", f);
    ok((await tags()).every((t) => TAG.test(t)), spot + ": its tags say only stocked, in this lake or introduced");
  }

  // ---- the Fish tab --------------------------------------------------------------------
  await go("#/fish", '[data-family="lake"] [data-lakefish] [data-plate] svg');
  const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-family="lake"] .pickcard[data-lakefish]')].map((t) => {
    const a = t.querySelector("[data-plate]"), svg = a && a.querySelector("svg"), b = svg && svg.getBoundingClientRect(), tb = t.getBoundingClientRect();
    return { id: t.dataset.lakefish, plate: a ? a.dataset.plate : "", shapes: svg ? svg.querySelectorAll("path, ellipse, circle").length : 0, fills: svg ? svg.querySelectorAll("linearGradient, radialGradient").length : 0,
      w: b ? Math.round(b.width) : 0, tw: Math.round(tb.width), top: Math.round(tb.top), name: (t.querySelector(".nm") || {}).textContent || "", meta: (t.querySelector(".meta") || {}).textContent || "" };
  }));
  const fam = await page.evaluate(() => ({ groups: [...document.querySelectorAll("[data-family]")].map((g) => g.dataset.family), lakeHead: (document.querySelector('[data-family="lake"] .sect') || {}).textContent || "",
    big: [...document.querySelectorAll('[data-family="lake"] .pickcard[data-species]')].map((t) => t.dataset.species), tall: document.documentElement.scrollHeight }));
  ok(JSON.stringify(tiles.map((t) => t.id)) === JSON.stringify(NEW), "the Fish tab's Lakes group gains the lake fish: all sixteen, tiger muskie first", tiles.map((t) => t.id));
  ok(fam.groups.filter((g) => g === "lake").length === 1 && !fam.groups.includes("lakefish") && fam.big.includes("bass") && fam.big.includes("perch") && /^Lakes/.test(fam.lakeHead.trim()),
    "one Lakes group: bass and perch, then the sixteen (look 4)", fam);
  ok(tiles.every((t) => t.tw <= 125) && new Set(tiles.slice(0, 3).map((t) => t.top)).size === 1 && tiles[3].top > tiles[0].top, "the sixteen are small, three across", tiles.map((t) => t.tw + "@" + t.top));
  ok(tiles.every((t) => t.plate === t.id && t.shapes >= 15 && t.fills >= 1 && t.w >= 60 && t.name), "each drawn in filled shapes, its own drawing, with its name", tiles.filter((t) => !(t.plate === t.id && t.shapes >= 15 && t.fills >= 1)));
  const allPlates = await page.evaluate(() => [...document.querySelectorAll(".pickcard [data-plate]")].map((a) => a.dataset.plate));
  ok(new Set(allPlates).size === allPlates.length, "no two fish on the Fish tab share a drawing", allPlates);
  ok(tiles.every((t) => t.meta), "each says where it is (lakes and the nearest), or its high lakes", tiles.filter((t) => !t.meta).map((t) => t.id));
  ok(await page.locator(".top .jump [data-lakefish]").count() === NEW.length, "every lake fish is one tap away in the strip under Fish");
  await page.locator('[data-family="lake"] .pickcard[data-lakefish="walleye"]').click();
  await page.waitForSelector('[data-view="lakefish"][data-fish="walleye"]');
  ok(true, "a lake fish tile opens its page");

  // ---- every lake fish's page ---------------------------------------------------------------
  const pages = [];
  for (const id of NEW.concat(["bass", "perch", "trout", "cutthroat"])) {
    await go("#/fish/" + id, '[data-view="lakefish"] [data-fish-rule]');
    pages.push(await page.evaluate((id) => {
      const v = document.querySelector('[data-view="lakefish"]'), plate = v.querySelector("[data-plate-card] [data-plate] svg");
      const lakes = [...v.querySelectorAll("[data-fish-lakes] [data-lake-row]")].map((r) => ({ id: r.dataset.lakeRow, href: r.getAttribute("href"), km: +((/(\d+) km/.exec(r.textContent) || [])[1] || -1) }));
      const order = [...v.children].map((c) => c.matches("[data-fish-rule]") ? "rule" : c.matches("[data-fish-lakes]") ? "lakes" : c.matches("[data-high-lakes]") ? "high" : c.matches("[data-plate-card]") ? "plate" : "").filter(Boolean);
      return { id, title: v.querySelector(".hero h1").textContent, plate: !!plate, rule: v.querySelector("[data-fish-rule]").textContent, what: !!v.querySelector("[data-plate-card] .hint"),
        whenHow: !!v.querySelector("[data-when-how]"), lakes, old: v.querySelectorAll("[data-fish-old] [data-lake-row]").length, high: !!v.querySelector("[data-high-lakes]"), all: !!v.querySelector("[data-all-lakes]"),
        order, ownRow: (v.querySelector("[data-own-rules-row]") || {}).textContent || "", rowTags: [...v.querySelectorAll("[data-fish-lakes] [data-tag]")].map((t) => t.textContent.trim()),
        current: [...document.querySelectorAll('.top .jump [aria-current="true"]')].map((c) => c.textContent.trim()), text: v.innerText,
        cut: [...v.querySelectorAll(".row .tx > span")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.slice(0, 60)) };
    }, id));
  }
  const bad = pages.filter((p) => !(p.plate && p.title && /pamphlet, page 2[345]/.test(p.rule)));
  ok(!bad.length, "every lake fish has its page: drawn, named, with its rule and its pamphlet page", bad);
  ok(pages.filter((p) => NEW.includes(p.id)).every((p) => p.what), "and what it is", pages.filter((p) => !p.what).map((p) => p.id));
  ok(pages.every((p) => p.order.indexOf("lakes") < 0 || p.order.indexOf("lakes") === p.order.indexOf("rule") + 1), "Lakes near you comes right after the rule (look 5)", pages.map((p) => p.id + ":" + p.order.join(">")));
  ok(pages.every((p) => !p.rowTags.includes("In this lake")) && pages.every((p) => !/·\s*Introduced/.test(p.text)), "a fish's lake rows tag only what adds to it (stocked, introduced, own rule), Introduced one way (look 6, 15)", pages.map((p) => p.rowTags.slice(0, 4)));
  ok(pages.every((p) => !p.cut.length), "no line on a fish page is cut short (a lake's plant line wraps)", pages.filter((p) => p.cut.length).map((p) => p.id + ": " + p.cut.slice(0, 2).join(" | ")));
  ok(pages.every((p) => p.current.length === 1), "the strip under the dock marks the fish you are on (look 17)", pages.map((p) => p.id + ":" + p.current.join("|")));
  ok(pages.every((p) => !/legal size|a hike in|nearly all are released/i.test(p.text)), "no 'legal size', no 'a hike in', no 'nearly all are released' (I5, M6, M2)");
  ok(/\d+ lakes have their own rule/.test(pages.find((p) => p.id === "trout").ownRow) && !pages.find((p) => p.id === "muskie").ownRow, "one row opens the lakes with their own rule (look 5); tiger muskie has none", pages.find((p) => p.id === "trout").ownRow);
  ok(pages.every((p) => p.lakes.length || p.high || p.old), "and where it is: the lakes it is in now, its high lakes, or its older records", pages.filter((p) => !p.lakes.length && !p.high && !p.old).map((p) => p.id));
  ok(pages.every((p) => p.lakes.every((l, i) => !i || p.lakes[i - 1].km <= l.km) && p.lakes.every((l) => /^#\/(lake|spot)\//.test(l.href))), "the lakes come nearest first, each one tappable", pages.map((p) => p.id + ":" + p.lakes.map((l) => l.km).join(",")));
  const mp = pages.find((p) => p.id === "muskie");
  ok(mp.lakes[0].id === "lake-tapps-pierce" && mp.lakes[0].href === "#/spot/lake-tapps" && /50 inches to keep/.test(mp.rule), "the tiger muskie page: Lake Tapps nearest, opening the app's own Lake Tapps page", mp);

  // ---- lakes with their own rule: the pamphlet's, county and all (I2, I3, C2, M2) ---------------
  const ownList = async (id) => {
    await go("#/fish/" + id + "/rules", '[data-sub="rules"] [data-own-rules]');
    return page.evaluate(() => [...document.querySelectorAll("[data-own-rule]")].map((r) => r.innerText.replace(/\s+/g, " ")).join(" || "));
  };
  const tr = await ownList("trout");
  ok(["Rattlesnake Lake (King)", "Kachess Lake (Kittitas)", "Keechelus Lake (Kittitas)", "Martha Warm Beach (Snohomish)", "Lake Washington (King)", "Vancouver Lake (Clark)", "Teal Lake (Jefferson)", "Mud Lake (Yakima)", "Spada Lake (Snohomish)", "Swift Reservoir (Skamania)"].every((n) => tr.includes(n)),
    "rainbow: Rattlesnake, Kachess, Keechelus, Martha Warm Beach, Washington, Vancouver, Teal, Mud, Spada, Swift, each with its county", tr.slice(0, 600));
  ok(/Trout: Min\. size 14". Daily limit 2\./.test(tr) && /Mar\. 1-June 30/.test(tr) && !/Rat Lake and Martha Lake/.test(tr), "with its rule and season (Lake Washington's Mar. 1-June 30)");
  const cu = await ownList("cutthroat");
  ok(["Lake Lenore (Grant)", "Wenatchee Lake (Chelan)", "Kachess Lake (Kittitas)", "Wynoochee Lake (Grays Harbor)", "Gibbs Lake (Jefferson)", "Horseshoe Lake (Jefferson)", "Teal Lake (Jefferson)", "Lake Easton (Kittitas)"].every((n) => cu.includes(n)) && !/Easton Ponds/.test(cu),
    "cutthroat: Lenore, Wenatchee, Kachess, Wynoochee, Gibbs, Horseshoe and Teal; Lake Easton, never Easton Ponds", cu.slice(0, 600));
  const br = await ownList("browntrout");
  ok(/Mayfield Lake \(Lewis\)/.test(br) && !/Riffe/.test(br) && !/CLOSED WATERS/.test(br), "brown trout: Mayfield's rule; Riffe's closed stretch below Cowlitz Falls Dam is not a brown trout rule (C2)", br.slice(0, 400));
  ok(/Lower Goose Lake \(Grant\)/.test(await ownList("crappie")) && /Lower Goose Lake \(Grant\)/.test(await ownList("bluegill")), "crappie and bluegill: Lower Goose Lake's rules");
  const kok = await ownList("kokanee");
  ok(/Baker Lake \(Whatcom\)/.test(kok) && /4th Sat\. in Apr\.-Oct\. 31/.test(kok) && /Closed now/.test(kok), "kokanee: Baker Lake's rule with its season, shut now");
  ok(await page.locator("[data-own-seasons]").count() === 1, "and how many lakes open only part of the year");

  // ---- seasons and the lake's own rules on its page (C3, I1) --------------------------------------
  await go("#/lake/baker-lake-whatcom", "[data-lake-rules]");
  const bk = await page.evaluate(() => ({ season: (document.querySelector("[data-lake-season]") || {}).dataset, seasonText: (document.querySelector("[data-lake-season]") || {}).innerText || "",
    rules: (document.querySelector("[data-lake-rules]") || {}).innerText || "", head: !!document.querySelector("[data-lake-head]") }));
  ok(bk.season && bk.season.lakeSeason === "closed" && /Closed now\. Opens Apr 24, 2027/.test(bk.seasonText) && /4th Sat\. in Apr\.-Oct\. 31/.test(bk.seasonText), "Baker Lake: shut now, opens Apr 24, 2027, on the red edge", bk.seasonText);
  ok(/Salmon: Min\. size 12"\. Daily limit 4 sockeye/.test(bk.rules) && /July 11-Aug\. 31/.test(bk.rules) && /pump discharge/i.test(bk.rules), "its rules keep every season (salmon July 11-Aug. 31) and its closed stretch", bk.rules);
  ok(!bk.head, "a salmon hatchery's fry do not head a lake (Baker's sockeye) (I6)");
  await go("#/lake/martha-warm-beach-snohomish", "[data-lake-rules]");
  const mw = await page.evaluate(() => ({ rules: document.querySelector("[data-lake-rules]").innerText, own: [...document.querySelectorAll('[data-lake-fish="trout"] [data-tag="own"]')].length, row: (document.querySelector('[data-lake-fish="trout"] [data-row-rule]') || {}).textContent || "" }));
  ok(/Trout: Min\. size 14"\. Daily limit 2\./.test(mw.rules) && /Selective gear rules/.test(mw.rules) && mw.own === 1 && /14"/.test(mw.row), "Martha Warm Beach: its own 14 inch, 2 a day, selective gear rule, on its page and its rainbow row (I3)", mw);
  await go("#/lake/riffe-lake-lewis", "[data-lake-rules]");
  const rf = await page.evaluate(() => document.querySelector("[data-lake-rules]").innerText);
  ok(/CLOSED WATERS/.test(rf) && /Cowlitz Falls Dam downstream/i.test(rf) && /Mossyrock Dam/i.test(rf), "Riffe Lake: the closed stretch is named as a stretch", rf);
  await go("#/lake/lake-entiat-douglas", "[data-lake-rules]");
  const en = await page.evaluate(() => ({ kind: document.querySelector("[data-lake-rules]").dataset.lakeRules, text: document.querySelector("[data-view]").innerText }));
  ok(en.kind === "river" && /Columbia/.test(en.text) && /page 50/.test(en.text) && !/12 inches|8 a day|Only 1 over 22/.test(en.text), "Lake Entiat: Columbia River rules, page 50, never the lake walleye rule (C1)", en.text.slice(0, 500));
  await go("#/fish/walleye", "[data-fish-lakes]");
  const wl = await page.evaluate(() => [...document.querySelectorAll('[data-lake-row="lake-entiat-douglas"],[data-lake-row="lake-pateros-douglas"],[data-lake-row="lake-umatilla-klickitat"]')].map((r) => r.innerText));
  ok(wl.every((t) => /Columbia River rules/.test(t)), "and on the walleye page its row says Columbia River rules", wl);
  // a pool row with a plant line keeps both lines: Lake Pateros' trout, planted 2017 (M1)
  await go("#/fish/trout/lakes", '[data-fish-lakes] [data-lake-row="lake-pateros-douglas"]');
  const pt = await page.locator('[data-fish-lakes] [data-lake-row="lake-pateros-douglas"]').innerText();
  ok(/400 planted/.test(pt) && /2017/.test(pt) && /Columbia River rules/.test(pt), "Lake Pateros' trout row: its 2017 plant and Columbia River rules, both (M1)", pt);
  // Lake Sacajawea in Longview is a city lake, not the Snake behind Ice Harbor Dam (N1)
  await go("#/lake/lake-sacajawea-cowlitz", "[data-lake-rules]");
  const sj = await page.evaluate(() => ({ kind: document.querySelector("[data-lake-rules]").dataset.lakeRules, text: document.querySelector("[data-view]").innerText }));
  ok(sj.kind === "statewide" && /Not in the pamphlet's lake rules/.test(sj.text) && /statewide rules/i.test(sj.text) && !/Snake|Columbia|River rules|page 50/.test(sj.text),
    "Lake Sacajawea in Longview: not in the pamphlet's lake rules, so the statewide rules; never the Snake (N1)", sj.text.slice(0, 600));
  for (const id of ["bass", "crappie", "perch"]) {
    await go("#/fish/" + id + "/lakes", '[data-fish-lakes] [data-lake-row="lake-sacajawea-cowlitz"]');
    const t = await page.locator('[data-fish-lakes] [data-lake-row="lake-sacajawea-cowlitz"]').innerText();
    ok(!/River rules|Snake/.test(t), "and on the " + id + " page its row says no river's rules (N1)", t);
  }
  await go("#/lake/lake-shannon-skagit", "[data-view=\"lake\"]");
  ok(!(await page.evaluate(() => { const h = document.querySelector("[data-lake-head]"); return h && h.dataset.lakeHead === "sockeye"; })), "Lake Shannon does not open on its sockeye fry (I6)");
  await go("#/lake/cougar-lake-okanogan", "[data-lake-rules]");
  ok((await page.evaluate(() => document.querySelector("[data-lake-rules]").dataset.lakeRules)) === "maybe", "Cougar Lake (two entries of its name in Okanogan County) says it cannot tell which, and shows both");
  await go("#/lake/lake-kapowsin-pierce", "[data-lake-facts]");
  const kf = await page.evaluate(() => document.querySelector("[data-lake-facts]").innerText);
  ok(!/No boat ramp/.test(kf) && /(Public boat ramp|Boat ramp on WDFW's map|No ramp on WDFW's map)/.test(kf), "Getting on says whose word it is: the pamphlet's ramp, or WDFW's map (I4)", kf);

  // ---- the rule's own words: two lines, the rest a tap away (look 19) -----------------------------
  await go("#/fish/kokanee", "[data-fish-rule] [data-rule-open]");
  const clamp = await page.evaluate(() => { const q = document.querySelector("[data-fish-rule] .q"); return [q.getBoundingClientRect().height, parseFloat(getComputedStyle(q).lineHeight)]; });
  await page.locator("[data-rule-open]").click();
  const open = await page.evaluate(() => [document.querySelector("[data-fish-rule]").classList.contains("open"), document.querySelector("[data-fish-rule] .q").getBoundingClientRect().height]);
  ok(clamp[0] <= clamp[1] * 2.2 && open[0] && open[1] > clamp[0], "kokanee's rule shows two lines, and the whole of it a tap away", [clamp, open]);
  // the full rule button: its words sit inside its rounded outline, the left end whole (M3)
  for (const id of ["crappie", "pumpkinseed"]) {
    await go("#/fish/" + id, "[data-fish-rule] [data-rule-open]");
    const fr = await page.evaluate(() => {
      const b = document.querySelector("[data-rule-open]"), cs = getComputedStyle(b), r = b.getBoundingClientRect(), box = b.closest("[data-fish-rule]").getBoundingClientRect();
      const rad = Math.min(parseFloat(cs.borderTopLeftRadius), r.height / 2);
      return { padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight), rad, left: r.left - box.left, right: box.right - r.right };
    });
    ok(fr.padL >= fr.rad * 0.7 && fr.padR >= fr.rad * 0.7 && fr.left >= 8 && fr.right >= 0, id + ": The full rule's outline is whole, its words clear of the rounded ends (M3)", fr);
  }

  // ---- where you are, on the Water strip (look 17) -------------------------------------------------
  for (const h of ["#/lake/mayfield-lake-lewis", "#/lakes"]) {
    await go(h, '[data-view="lake"],[data-view="lakes"]');
    const cur = await page.evaluate(() => [...document.querySelectorAll('.top .jump [aria-current="true"]')].map((c) => c.dataset.type));
    ok(cur.length === 1 && cur[0] === "lake", h + ": the Water strip marks Lake", cur);
  }

  // ---- a lake of its own ---------------------------------------------------------------------
  await go("#/fish/muskie", '[data-fish-lakes] [data-lake-row="mayfield-lake-lewis"]');
  await page.locator('[data-fish-lakes] [data-lake-row="mayfield-lake-lewis"]').click();
  await page.waitForSelector('[data-view="lake"][data-lake="mayfield-lake-lewis"] [data-in-here]');
  const may = await page.evaluate(() => {
    const s = document.getElementById("scene"), v = document.querySelector('[data-view="lake"]');
    return { kind: s.getAttribute("data-scene"), kids: s.querySelectorAll("svg *").length, back: v.querySelector(".hero .back").getAttribute("href"), head: (v.querySelector("[data-lake-head]") || {}).dataset,
      facts: v.querySelector("[data-lake-facts]").textContent, fish: [...v.querySelectorAll("[data-lake-fish]")].map((r) => r.dataset.lakeFish) };
  });
  ok(may.kind === "lake" && may.kids > 20, "a lake from WDFW's map stands under a painted lake", may);
  ok(may.back === "#/fish/muskie" && may.head && may.head.lakeHead === "muskie" && !may.fish.includes("muskie") && /2,022/.test(may.facts) && /(Public boat ramp|Boat ramp on WDFW's map)/.test(may.facts),
    "Mayfield Lake: back to the fish it came from, its tiger muskie (once), what else is in it, its acres and its ramp", may);
  ok(await crosses('[data-view="lake"] > .float'), "its first card crosses the waterline");

  // ---- the Water tab reaches every lake ----------------------------------------------------------
  await go("#/water/lake", "[data-more-lakes] [data-lake-row]");
  ok(await page.locator('[data-more-lakes] a[href="#/lakes"]').count() === 1, "the Lake page lists the nearest lakes and a way to all of them");
  await page.locator('[data-more-lakes] a[href="#/lakes"]').click();
  await page.waitForSelector('[data-view="lakes"] [data-lakes-near] [data-lake-row]');
  const n0 = await page.locator("[data-lake-row]").count();
  await page.locator("[data-lakes-all]").click();
  await page.waitForFunction((n) => document.querySelectorAll("[data-lake-row]").length > n, n0);
  const nAll = await page.evaluate(() => [document.querySelectorAll("[data-lake-row]").length, RIG.lakesData.lakes.length]);
  ok(nAll[0] === nAll[1] && nAll[0] > 400, "and every lake in range, nearest first", nAll);

  // ---- the screens can be read under every sky -----------------------------------------------------
  // (Each screen's own words, under its title in the sky; the dock over them
  // is the same on every screen and is measured by tests/rigs-look.smoke.mjs.)
  const SCREENS = [["the Fish tab's Lakes group", "#/fish", '[data-family="lake"] [data-lakefish] [data-plate] svg', '[data-family="lake"]'],
    ["the trout's own-rule lakes", "#/fish/trout/rules", "[data-own-rules]", "[data-view]"], ["Baker Lake, shut now", "#/lake/baker-lake-whatcom", "[data-lake-season]", "[data-view]"],
    ["the tiger muskie page", "#/fish/muskie", "[data-fish-rule]", "[data-view]"], ["Lake Tapps", "#/spot/lake-tapps", "[data-lake-head] svg", "[data-view]"],
    ["Mayfield Lake", "#/lake/mayfield-lake-lewis", "[data-in-here]", "[data-view]"], ["the lakes", "#/lakes", "[data-lakes-near]", "[data-view]"],
    ["sturgeon's older records", "#/fish/sturgeon", "[data-fish-old]", "[data-view]"]];
  for (const id of SKIES) {
    for (const [name, hash, sel, within] of SCREENS) {
      await sky(id, hash, sel);
      const r = await unreadable(page, within);
      ok(r.n > 10 && !r.bad.length, name + " can be read under " + id, r.bad.slice(0, 6));
    }
  }
  ok(!errors.length, "no page errors", errors);

  // ---- fish.js after the lakes: the drawings still fill in (function I2) ---------------------------
  for (const [hash, sel] of [["#/fish/muskie", '[data-view="lakefish"]'], ["#/lake/mayfield-lake-lewis", '[data-view="lake"]']]) {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c2);
    await c2.route(/\/rigs\/fish\.js/, async (r) => { await new Promise((f) => setTimeout(f, 2000)); await r.continue(); });
    const p2 = await c2.newPage();
    await p2.clock.setFixedTime(NOW);
    await p2.goto(base + hash, { waitUntil: "domcontentloaded" });
    await p2.waitForSelector(sel, { timeout: 15000 });
    const early = await p2.evaluate(() => [!!window.RIG.fish, document.querySelectorAll(".none").length]);
    await p2.waitForFunction(() => window.RIG.fish, null, { timeout: 15000 });
    await p2.waitForTimeout(300);
    const late = await p2.evaluate(() => [document.querySelectorAll("[data-plate] svg").length, document.querySelectorAll(".fishtile.none, .art.none").length]);
    ok(!early[0] && early[1] > 0 && late[0] > 0 && late[1] === 0, hash + ": opened before fish.js arrives, its drawings fill in when it does", [early, late]);
    await c2.close();
  }

  // ---- a lake file that does not load: one line and Try again (function M1) ------------------------
  {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c3);
    let block = true;
    await c3.route(/\/rigs\/lakes\.js/, (r) => (block ? r.abort() : r.continue()));
    const p3 = await c3.newPage();
    await p3.clock.setFixedTime(NOW);
    await p3.goto(base + "#/lake/mayfield-lake-lewis", { waitUntil: "load" });
    await p3.waitForSelector("[data-lakes-retry]", { timeout: 15000 });
    const said = await p3.evaluate(() => document.querySelector('[data-view="wait"]').innerText);
    ok(/did not load/.test(said) && /try again/i.test(said), "a lake page whose file does not load says so, with Try again", said);
    block = false;
    await p3.locator("[data-lakes-retry]").click();
    await p3.waitForSelector('[data-view="lake"][data-lake="mayfield-lake-lewis"]', { timeout: 15000 });
    ok(true, "and Try again opens it once the file comes");
    await c3.close();
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
