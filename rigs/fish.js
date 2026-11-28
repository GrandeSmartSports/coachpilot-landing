// Rig Card: the animals, and a few pieces of tackle.
//
// Every fish in the library is drawn here, in code, as layered SVG. Nothing
// is traced, stock or made by a model. Each one is built the way a plate is
// painted: a true silhouette, a wash that follows the body, a darker back, a
// lit flank, then scales, rays and markings on top, and an ink line last.
// What tells one fish from the next is drawn in: the chum's bars, the coho's
// red side and the spots on only the top of its tail, the king's spots on
// both halves, the pink's hump, the cutthroat's slash, the perch's bars.
//
// No shape carries a colour. Every fill is a class that rigs/fish.css mixes
// from the sky engine's variables, so a fish under an overcast sky is a
// pewter fish and the same fish at night is the plate read by lantern.
//
//   RIG.fish.svg(kind, { lite, cls })  the drawing, as an <svg> string.
//                                      lite: no paper grain, for small sizes.
//   RIG.fish.of(speciesId)             which drawing stands for a species
//   RIG.fish.kinds                     every drawing there is
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});
  // Set while a small plate is drawn: the paper grain and the pooled pigment
  // are two turbulence filters, and a row of twelve small fish does not
  // need twenty four of them.
  var LITE = false;
  function grain() { return LITE ? "" : ' filter="url(#fp-grain)"'; }
  function blot(x, y, w, h) { return LITE ? "" : '<rect class="blot" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" filter="url(#fp-blot)"/>'; }

  // ---- small tools ------------------------------------------------------
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function n(v) { return String(Math.round(v * 10) / 10); }
  function P(p) { return n(p[0]) + " " + n(p[1]); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lp(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }

  // A smooth line through points (Catmull-Rom, written as cubic Beziers).
  function cr(pts, closed) {
    var len = pts.length, d = "M" + P(pts[0]), segs = closed ? len : len - 1;
    for (var i = 0; i < segs; i++) {
      var p0 = pts[closed ? (i - 1 + len) % len : Math.max(i - 1, 0)], p1 = pts[i % len],
        p2 = pts[(i + 1) % len], p3 = pts[closed ? (i + 2) % len : Math.min(i + 2, len - 1)];
      d += "C" + P([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + " " +
        P([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + " " + P(p2);
    }
    return d + (closed ? "Z" : "");
  }
  // The same line as a list of points, for measuring along it.
  function crPts(pts, closed, steps) {
    var len = pts.length, out = [], segs = closed ? len : len - 1; steps = steps || 12;
    for (var i = 0; i < segs; i++) {
      var p0 = pts[closed ? (i - 1 + len) % len : Math.max(i - 1, 0)], p1 = pts[i % len],
        p2 = pts[(i + 1) % len], p3 = pts[closed ? (i + 2) % len : Math.min(i + 2, len - 1)];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
        c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      for (var s = 0; s < steps; s++) {
        var t = s / steps, u = 1 - t;
        out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
          u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1], i]);
      }
    }
    if (!closed) out.push([pts[len - 1][0], pts[len - 1][1], segs - 1]);
    return out;
  }
  // y on a sampled profile at x (profiles run head to tail, x rising).
  function yAt(sm, x) {
    if (x <= sm[0][0]) return sm[0][1];
    for (var i = 1; i < sm.length; i++) if (sm[i][0] >= x) {
      var a = sm[i - 1], b = sm[i], t = (x - a[0]) / ((b[0] - a[0]) || 1);
      return lerp(a[1], b[1], t);
    }
    return sm[sm.length - 1][1];
  }
  // A point a fraction of the way along a sampled line, by length.
  function along(sm, t) {
    var L = [0], i;
    for (i = 1; i < sm.length; i++) L.push(L[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
    var want = t * L[L.length - 1];
    for (i = 1; i < sm.length; i++) if (L[i] >= want) {
      var k = (want - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
      return lp(sm[i - 1], sm[i], k);
    }
    return sm[sm.length - 1];
  }
  function dot(x, y, rx, ry, rot) {
    var c = Math.cos(rot || 0), s = Math.sin(rot || 0), ax = rx * c, ay = rx * s, deg = n((rot || 0) * 57.3);
    return "M" + n(x - ax) + " " + n(y - ay) + "a" + n(rx) + " " + n(ry) + " " + deg + " 1 0 " + n(2 * ax) + " " + n(2 * ay) +
      "a" + n(rx) + " " + n(ry) + " " + deg + " 1 0 " + n(-2 * ax) + " " + n(-2 * ay) + "Z";
  }

  // ---- fins -------------------------------------------------------------
  // A fin is a membrane (the outline) and its rays. Rays leave the base and
  // fan to the trailing edge; each soft ray splits in two near its end, the
  // way real ones do. o.edge runs from base start, round the fin, to base end.
  // o.r0 and o.r1 pick the stretch of that edge the rays land on.
  function fin(o) {
    var L = [o.a].concat(o.edge).concat([o.b]);
    var sm = crPts(L, false, 14);
    var target = sm.filter(function (p, i) { return i >= o.r0 * 14 && i <= o.r1 * 14; });
    var rays = "", twigs = "", list = [], count = o.rays == null ? 10 : o.rays;
    for (var i = 0; i < count; i++) {
      var t = (i + 0.5) / count;
      var b = lp(o.a, o.b, Math.pow(t, o.bias || 0.85));
      var e = along(target, t);
      var bend = o.bend == null ? 0.06 : o.bend, mx = (b[0] + e[0]) / 2, my = (b[1] + e[1]) / 2;
      var c = [mx + (e[1] - b[1]) * bend, my - (e[0] - b[0]) * bend];
      rays += "M" + P(b) + "Q" + P(c) + " " + P(e);
      list.push([b, c, e]);
      var e2 = along(target, Math.min(1, t + 0.45 / count));
      var m = [0.25 * b[0] + 0.5 * c[0] + 0.25 * e[0], 0.25 * b[1] + 0.5 * c[1] + 0.25 * e[1]];
      twigs += "M" + P(m) + "L" + P(e2);
    }
    var d = cr(L, false) + "Z";
    var tip = along(target, 0.5), mid = lp(o.a, o.b, 0.5), id = o.id;
    var defs = '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + n(mid[0]) + '" y1="' + n(mid[1]) +
      '" x2="' + n(tip[0]) + '" y2="' + n(tip[1]) + '"><stop offset="0" style="stop-color:var(--fin1)"/>' +
      '<stop offset=".55" style="stop-color:var(--fin2)"/><stop offset="1" style="stop-color:var(--fin3)"/></linearGradient>' +
      '<clipPath id="' + id + '-k"><path d="' + d + '"/></clipPath>';
    var paint = typeof o.paint === "function" ? o.paint({ rays: list, d: d, target: target, tip: tip }) : (o.paint || "");
    var html = '<g class="fin ' + (o.cls || "") + '"><path d="' + d + '" fill="url(#' + id + ')"/>' +
      (paint ? '<g clip-path="url(#' + id + '-k)">' + paint + "</g>" : "") +
      '<path class="ray" d="' + rays + '"/><path class="ray twig" d="' + twigs + '"/>' +
      '<path class="ink thin" d="' + d + '"/></g>';
    return { defs: defs, html: html, d: d, rays: list, tip: tip };
  }

  // ---- a fish, side on ----------------------------------------------------
  // o.top and o.bot are the back and belly lines, snout to tail wrist. Fins
  // are named in o.backFins (drawn behind the body) and o.frontFins (over it);
  // one with a spines count is drawn stiff (spinyFin).
  function fishBody(o) {
    var id = o.id, top = o.top, bot = o.bot, rand = rng(o.seed || 7);
    var outline = top.concat(bot.slice(1).reverse());
    var bodyD = cr(outline, true);
    var topS = crPts(top, false, 10), botS = crPts(bot, false, 10);
    var topD = cr(top, false), botD = cr(bot, false);
    function at(x, v) { var a = yAt(topS, x), b = yAt(botS, x); return a + (b - a) * v; }
    var x0 = o.gill + 6, x1 = top[top.length - 1][0] - 2;
    var ctx = { at: at, rand: rand, topS: topS, botS: botS, x0: x0, x1: x1, id: id, o: o };

    var defs = "", back = "", front = "";
    (o.backFins || ["tail", "dorsal", "adipose", "anal"]).forEach(function (k) {
      if (!o[k]) return;
      var f = (o[k].spines ? spinyFin : fin)(Object.assign({ id: id + "-" + k, cls: k }, o[k], { paint: o.finPaint && o.finPaint[k] && o.finPaint[k].bind(null, ctx) }));
      defs += f.defs; back += f.html;
    });
    (o.frontFins || ["pelvic", "pectoral"]).forEach(function (k) {
      if (!o[k]) return;
      var f = (o[k].spines ? spinyFin : fin)(Object.assign({ id: id + "-" + k, cls: k + " over" }, o[k], { paint: o.finPaint && o.finPaint[k] && o.finPaint[k].bind(null, ctx) }));
      defs += f.defs; front += f.html;
    });

    // Scales: rows of small arcs, free edge toward the tail, offset row to row.
    var sz = (o.scale || 5) * (LITE ? 1.5 : 1), rows = Math.round((o.depth || 90) / (sz * 0.62)), sc = ["", "", ""];
    for (var r = 1; r < rows; r++) {
      var v = r / rows; if (v < 0.07 || v > 0.9) continue;
      for (var x = x0 + (r % 2 ? sz / 2 : 0) - 10; x < x1; x += sz) {
        var gx = o.gill + (o.gillBulge || 10) * (1 - Math.pow(2 * v - 1, 2)) + 2;
        if (x < gx) continue;
        var y = at(x, v), h = (yAt(botS, x) - yAt(topS, x)) / rows * 0.55;
        sc[v < 0.36 ? 0 : v < 0.66 ? 1 : 2] += "M" + n(x) + " " + n(y - h) + "q" + n(sz * 0.42) + " " + n(h) + " 0 " + n(2 * h);
      }
    }

    // The side line: a faint seam from the gill to the tail.
    var ll = [];
    for (var lx = o.gill + 12; lx <= x1 - 2; lx += 22) ll.push([lx, at(lx, o.lateral || 0.47)]);
    // The lit streak along the upper flank, and the core shadow low on the side.
    var hi = [], lo = [];
    for (var hx = o.gill - 18; hx <= x1 - 14; hx += 24) { hi.push([hx, at(hx, 0.3)]); lo.push([hx, at(hx, 0.8)]); }

    var marks = o.marks ? o.marks(ctx) : "";
    var e = o.eye, g = o.gill;
    // The gill cover: its free edge bows toward the tail.
    var gt = yAt(topS, g - 14), gb = yAt(botS, g - 12), gm = (gt + gb) / 2;
    var gillD = "M" + n(g - 16) + " " + n(gt + 7) + "C" + n(g + 4) + " " + n(gt + 16) + " " + n(g + 10) + " " + n(gm - 6) + " " + n(g + 8) + " " + n(gm + 6) +
      "C" + n(g + 6) + " " + n(gb - 16) + " " + n(g - 4) + " " + n(gb - 6) + " " + n(g - 18) + " " + n(gb - 3);
    var preD = "M" + n(g - 27) + " " + n(gt + 16) + "C" + n(g - 17) + " " + n(gm - 8) + " " + n(g - 17) + " " + n(gm + 10) + " " + n(g - 31) + " " + n(gb - 9);
    var headClip = "M-10 -10H" + n(g - 16) + "V" + n(gt + 7) + "C" + n(g + 4) + " " + n(gt + 16) + " " + n(g + 10) + " " + n(gm - 6) + " " + n(g + 8) + " " + n(gm + 6) +
      "C" + n(g + 6) + " " + n(gb - 16) + " " + n(g - 4) + " " + n(gb - 6) + " " + n(g - 18) + " " + n(gb - 3) + "V220H-10Z";

    return '<defs>' + defs +
      '<linearGradient id="' + id + '-b" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" style="stop-color:var(--f-back)"/><stop offset=".3" style="stop-color:var(--f-upper)"/>' +
        '<stop offset=".56" style="stop-color:var(--f-flank)"/><stop offset=".84" style="stop-color:var(--f-belly)"/>' +
        '<stop offset="1" style="stop-color:var(--f-under)"/></linearGradient>' +
      '<radialGradient id="' + id + '-i" cx=".4" cy=".72" r=".8"><stop offset="0" style="stop-color:var(--f-iris1)"/>' +
        '<stop offset="1" style="stop-color:var(--f-iris2)"/></radialGradient>' +
      '<clipPath id="' + id + '-c"><path d="' + bodyD + '"/></clipPath>' +
      '<clipPath id="' + id + '-h"><path d="' + headClip + '"/></clipPath>' +
      '</defs>' +
      '<g class="fp fp-' + o.kind + '"' + grain() + ">" + back +
      '<path d="' + bodyD + '" fill="url(#' + id + '-b)"/>' +
      '<g clip-path="url(#' + id + '-c)">' +
        '<path class="sh-back" filter="url(#fp-b6)" d="' + topD + '"/>' +
        '<path class="sh-belly" filter="url(#fp-b6)" d="' + botD + '"/>' +
        blot(0, 0, 440, 190) +
        (o.under ? o.under(ctx) : "") +
        '<path class="scale s0" d="' + sc[0] + '"/><path class="scale s1" d="' + sc[1] + '"/><path class="scale s2" d="' + sc[2] + '"/>' +
        '<path class="scale-hi" d="' + sc[1] + '" transform="translate(-.9 -.2)"/>' +
        marks +
        '<path class="sh-core" filter="url(#fp-b6)" d="' + cr(lo, false) + '"/>' +
        '<path class="sh-lit" filter="url(#fp-b4)" d="' + cr(hi, false) + '"/>' +
        '<path class="lateral" d="' + cr(ll, false) + '"/>' +
        '<g clip-path="url(#' + id + '-h)"><path class="head-wash" d="' + bodyD + '"/>' + (o.headPaint ? o.headPaint(ctx) : "") +
          '<path class="sh-lit head-lit" filter="url(#fp-b4)" d="M' + n(top[2][0]) + " " + n(at(top[2][0], 0.42)) + "L" + n(g - 24) + " " + n(at(g - 24, 0.3)) + '"/></g>' +
        '<path class="gill-shade" filter="url(#fp-b3)" d="' + gillD + '"/>' +
        '<path class="sh-rim" filter="url(#fp-b3)" d="' + botD + '"/>' +
      '</g>' +
      '<path class="ink gill" d="' + gillD + '"/><path class="ink thin pre" d="' + preD + '"/>' +
      (o.mouth || "") +
      '<circle class="eye-ring" cx="' + e[0] + '" cy="' + e[1] + '" r="' + n(e[2] + 0.9) + '"/>' +
      '<circle cx="' + e[0] + '" cy="' + e[1] + '" r="' + e[2] + '" fill="url(#' + id + '-i)" class="iris"/>' +
      '<ellipse class="pupil" cx="' + n(e[0] - 0.3) + '" cy="' + n(e[1] + 0.1) + '" rx="' + n(e[2] * 0.6) + '" ry="' + n(e[2] * 0.63) + '"/>' +
      '<path class="lid" d="M' + n(e[0] - e[2]) + " " + n(e[1] - 0.6) + "A" + e[2] + " " + e[2] + " 0 0 1 " + n(e[0] + e[2]) + " " + n(e[1] - 0.6) +
        "A" + n(e[2] * 1.5) + " " + n(e[2] * 1.5) + " 0 0 0 " + n(e[0] - e[2]) + " " + n(e[1] - 0.6) + 'Z"/>' +
      '<circle class="glint" cx="' + n(e[0] - e[2] * 0.28) + '" cy="' + n(e[1] - e[2] * 0.3) + '" r="' + n(e[2] * 0.17) + '"/>' +
      '<path class="ink body" d="' + bodyD + '"/>' +
      '<path class="ink under" d="' + botD + '"/>' +
      '<path class="ink ghost" d="' + bodyD + '" transform="translate(.7 .6)"/>' +
      front + (o.over ? o.over(ctx) : "") + '</g>';
  }

  // Scatter spots on a body. dens(x, v) says how likely a spot is there.
  function spots(ctx, count, dens, size, xa, xb) {
    var d = "", rand = ctx.rand, tries = 0, made = 0;
    while (made < count && tries < count * 40) {
      tries++;
      var x = lerp(xa == null ? ctx.x0 : xa, xb == null ? ctx.x1 + 2 : xb, rand()), v = rand();
      if (rand() > dens(x, v)) continue;
      var y = ctx.at(x, v), r = size(rand, x, v);
      d += dot(x, y, r * (0.85 + rand() * 0.6), r * (0.7 + rand() * 0.45), rand() * 3.14);
      made++;
    }
    return d;
  }
  // Spots strung along fin rays, in rows, the way a trout tail carries them.
  function raySpots(f, rand, perRay, size, from, to) {
    var d = "";
    f.rays.forEach(function (ry) {
      for (var k = 0; k < perRay; k++) {
        var t = lerp(from, to, (k + 0.3 + rand() * 0.5) / perRay), u = 1 - t;
        if (rand() < 0.2) continue;
        var x = u * u * ry[0][0] + 2 * u * t * ry[1][0] + t * t * ry[2][0], y = u * u * ry[0][1] + 2 * u * t * ry[1][1] + t * t * ry[2][1];
        var r = size * (0.7 + rand() * 0.6);
        d += dot(x, y, r * 1.3, r * 0.8, Math.atan2(ry[2][1] - ry[0][1], ry[2][0] - ry[0][0]));
      }
    });
    return d;
  }


  // A stiff fin: spines standing from the base, the skin sagging between
  // their tips. o.a to o.b is the base, front to back. o.spines is how many,
  // o.h(t) the height of the spine a share t of the way along, o.up is -1
  // for a fin on the back and 1 for one on the belly, o.rake how far the
  // tips lean toward the tail.
  function spinyFin(o) {
    var N = o.spines, up = o.up || -1, rake = o.rake == null ? 8 : o.rake, list = [], i, id = o.id;
    for (i = 0; i < N; i++) {
      var t = (i + 0.5) / N, b = lp(o.a, o.b, t), h = o.h(t);
      list.push([b, [b[0] + rake * (0.45 + t * 0.55), b[1] + up * h]]);
    }
    var d = "M" + P(o.a) + "L" + P(list[0][1]), spines = "";
    for (i = 1; i < N; i++) {
      var p = list[i - 1][1], q = list[i][1], sag = (o.sag == null ? 0.2 : o.sag) * Math.min(o.h((i - 0.5) / N), o.h((i + 0.5) / N));
      d += "Q" + n((p[0] + q[0]) / 2 - 1) + " " + n((p[1] + q[1]) / 2 - up * sag) + " " + P(q);
    }
    d += "L" + P(o.b) + "Z";
    list.forEach(function (s) { spines += "M" + P(s[0]) + "L" + P(s[1]); });
    var mid = lp(o.a, o.b, 0.5), tip = list[Math.floor(N / 2)][1];
    var defs = '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + n(mid[0]) + '" y1="' + n(mid[1]) +
      '" x2="' + n(tip[0]) + '" y2="' + n(tip[1]) + '"><stop offset="0" style="stop-color:var(--fin1)"/>' +
      '<stop offset=".55" style="stop-color:var(--fin2)"/><stop offset="1" style="stop-color:var(--fin3)"/></linearGradient>' +
      '<clipPath id="' + id + '-k"><path d="' + d + '"/></clipPath>';
    var rays = list.map(function (s) { return [s[0], lp(s[0], s[1], 0.5), s[1]]; });
    var paint = typeof o.paint === "function" ? o.paint({ rays: rays, d: d, tip: tip }) : (o.paint || "");
    var html = '<g class="fin spiny ' + (o.cls || "") + '"><path d="' + d + '" fill="url(#' + id + ')"/>' +
      (paint ? '<g clip-path="url(#' + id + '-k)">' + paint + "</g>" : "") +
      '<path class="spine" d="' + spines + '"/><path class="ink thin" d="' + d + '"/></g>';
    return { defs: defs, html: html, d: d, rays: rays, tip: tip };
  }
  // Upright bars down a side: each one a ragged streak from the back toward
  // the belly. o.n how many, o.x0 and o.x1 where they run, o.w width,
  // o.v0 and o.v1 how far down the side each starts and ends (0 back, 1 belly),
  // o.taper 1 for a bar that narrows to a point, o.breakAt a height where the
  // bar steps sideways (a surfperch's do, at the side line).
  function bars(c, o) {
    var out = "", r = c.rand, K = 7;
    for (var i = 0; i < o.n; i++) {
      var x = lerp(o.x0, o.x1, (i + 0.5) / o.n) + (r() - 0.5) * (o.jit == null ? 6 : o.jit), w = o.w * (0.75 + r() * 0.5);
      var v0 = o.v0 + r() * 0.04, v1 = o.v1 * (0.86 + r() * 0.2), lean = (r() - 0.4) * (o.lean == null ? 8 : o.lean), L = [], R = [];
      for (var k = 0; k <= K; k++) {
        var f = k / K, v = lerp(v0, v1, f), step = o.breakAt && v > o.breakAt ? (o.step || 5) : 0;
        var wk = w * (o.taper ? 1 - f * 0.82 : 0.55 + Math.sin(Math.PI * f) * 0.6), cx = x + lean * f + step + (r() - 0.5) * 2.4;
        L.push([cx - wk / 2, c.at(cx, v)]); R.unshift([cx + wk / 2 + (r() - 0.5) * 1.6, c.at(cx, v)]);
      }
      out += '<path class="vbar" d="' + cr(L.concat(R), true) + '"/>';
    }
    return out;
  }

  // ---- each salmon and trout its own build ------------------------------------
  // They share one way of being drawn; besides the paint, the build tells
  // them apart. form(o, f) reshapes a fishBody's options:
  //   depth  how deep the body is (1 as drawn), wrist how deep the narrow
  //   place before the tail is, head how long the head runs (the gill cover
  //   sits further back), tail the tail fin's size, fork how deep its fork.
  function form(o, f) {
    function lin(pts, x) {
      for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * ((x - a[0]) / ((b[0] - a[0]) || 1)); }
      return pts[pts.length - 1][1];
    }
    var T0 = o.top, B0 = o.bot, D = f.depth || 1, Wr = f.wrist || 1;
    function k(x) { var u = Math.max(0, Math.min(1, (x - 270) / 110)); u = u * u * (3 - 2 * u); return D + (Wr - D) * u; }
    function map(p) { var c = (lin(T0, p[0]) + lin(B0, p[0])) / 2; return [p[0], c + (p[1] - c) * k(p[0])]; }
    function moveFin(F, dx) {
      if (!F) return;
      var m = [(F.a[0] + F.b[0]) / 2, (F.a[1] + F.b[1]) / 2], dy = map(m)[1] - m[1];
      function mv(p) { return [p[0] + dx, p[1] + dy]; }
      F.a = mv(F.a); F.b = mv(F.b); if (F.edge) F.edge = F.edge.map(mv);
    }
    ["dorsal", "adipose", "anal", "pelvic"].forEach(function (key) { moveFin(o[key], 0); });
    var hx = ((f.head || 1) - 1) * 60;
    moveFin(o.pectoral, hx);
    o.gill += hx;
    o.eye = [o.eye[0], Math.round(map(o.eye)[1] * 10) / 10, o.eye[2]];
    var T = o.tail;
    if (T) {
      var a = map(T.a), b = map(T.b), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], c0 = [(T.a[0] + T.b[0]) / 2, (T.a[1] + T.b[1]) / 2], s = f.tail || 1;
      var e = T.edge.map(function (p) { return [c[0] + (p[0] - c0[0]) * s, c[1] + (p[1] - c0[1]) * s]; });
      if (f.fork && e.length === 7) {
        var tip = (e[1][0] + e[5][0]) / 2;
        [2, 3, 4].forEach(function (i) { e[i] = [tip - (tip - e[i][0]) * f.fork, e[i][1]]; });
      }
      T.a = a; T.b = b; T.edge = e;
    }
    o.top = T0.map(map); o.bot = B0.map(map);
    return o;
  }
  // The hooked jaw of a spawning male, a kype: the snout hooks down over the
  // lower jaw, the lower jaw curls up at its tip, and the gape between them
  // shows teeth. x, y: where the jaws meet at the front; L: the gape's length.
  function kype(x, y, L) {
    var tu = "", tl = "", i;
    var SN = "M" + n(x + 16) + " " + n(y - 8) + "C" + n(x + 4) + " " + n(y - 8) + " " + n(x - 5) + " " + n(y - 4) + " " + n(x - 7.5) + " " + n(y + 4) +
      "C" + n(x - 8.2) + " " + n(y + 7.4) + " " + n(x - 6) + " " + n(y + 8.6) + " " + n(x - 4.4) + " " + n(y + 7) + "C" + n(x - 2.4) + " " + n(y + 3.6) + " " + n(x + 3) + " " + n(y + 2) + " " + n(x + 8) + " " + n(y + 1.8);
    for (i = 0; i < 7; i++) {
      var tx = x + 6 + i * (L - 12) / 6, ty = y + 2.2 + i * 0.42;
      tu += "M" + n(tx - 1.1) + " " + n(ty) + "l1.1 " + n(2.3 - i * 0.16) + "l1.1 " + n(-2.3 + i * 0.16) + "Z";
      if (i % 2 === 0 && i < 6) tl += "M" + n(tx - 0.9) + " " + n(ty + 4.4) + "l.9 -2l.9 2Z";
    }
    return '<path class="gape" d="M' + n(x + 2) + " " + n(y + 1.6) + "C" + n(x + L * 0.35) + " " + n(y + 2.2) + " " + n(x + L * 0.7) + " " + n(y + 3.4) + " " + n(x + L) + " " + n(y + 5.8) +
        "C" + n(x + L * 0.7) + " " + n(y + 6.6) + " " + n(x + L * 0.35) + " " + n(y + 6.6) + " " + n(x + 2) + " " + n(y + 6) + 'Z"/>' +
      '<path class="tooth" d="' + tu + tl + '"/>' +
      // the snout, hooked down over the front of the lower jaw
      '<defs><linearGradient id="ky' + x + '" x1="0" x2="1"><stop offset=".5" style="stop-color:var(--f-head)"/><stop offset="1" style="stop-color:var(--f-head);stop-opacity:0"/></linearGradient></defs>' +
      '<path class="kypefill" fill="url(#ky' + x + ')" d="' + SN + "L" + n(x + 16) + " " + n(y + 1) + 'Z"/>' +
      '<path class="ink mouth" d="' + SN + "C" + n(x + L * 0.4) + " " + n(y + 2.4) + " " + n(x + L * 0.75) + " " + n(y + 3.6) + " " + n(x + L) + " " + n(y + 5.8) + '"/>' +
      // the lower jaw, its tip curled up into the snout's hook
      '<path class="kypefill low" d="M' + n(x + L) + " " + n(y + 5.8) + "C" + n(x + L * 0.6) + " " + n(y + 7.8) + " " + n(x + L * 0.25) + " " + n(y + 8.8) + " " + n(x + 2) + " " + n(y + 8.6) +
        "C" + n(x - 2) + " " + n(y + 8.4) + " " + n(x - 3.4) + " " + n(y + 6) + " " + n(x - 2.6) + " " + n(y + 3.6) + "C" + n(x - 0.6) + " " + n(y + 5.6) + " " + n(x + 3) + " " + n(y + 6.2) + " " + n(x + 8) + " " + n(y + 6.2) + 'Z"/>' +
      '<path class="ink mouth" d="M' + n(x + L) + " " + n(y + 5.8) + "C" + n(x + L * 0.6) + " " + n(y + 7.8) + " " + n(x + L * 0.25) + " " + n(y + 8.8) + " " + n(x + 2) + " " + n(y + 8.6) +
        "C" + n(x - 2) + " " + n(y + 8.4) + " " + n(x - 3.4) + " " + n(y + 6) + " " + n(x - 2.6) + " " + n(y + 3.6) + '"/>' +
      '<path class="ink thin" d="M' + n(x + 2) + " " + n(y + 10.6) + "C" + n(x + L * 0.4) + " " + n(y + 11.4) + " " + n(x + L * 0.8) + " " + n(y + 12) + " " + n(x + L + 6) + " " + n(y + 13.4) + '"/>';
  }

  var S = {};

  // ---- chum salmon, a river male in November -----------------------------
  S.chum = {
    box: "0 0 440 190", name: "Chum salmon", latin: "Oncorhynchus keta",
    draw: function () {
      return fishBody(form({
        id: "fpchum", kind: "chum", seed: 11, gill: 98, eye: [54, 88, 5], depth: 94, scale: 4.8, lateral: 0.46,
        top: [[13, 101], [17, 93], [27, 86], [42, 79], [62, 71], [92, 61], [130, 52], [172, 47], [214, 47], [256, 51], [298, 60], [336, 71], [362, 79], [380, 83]],
        bot: [[13, 101], [18, 106], [30, 110], [46, 114], [72, 120], [108, 130], [152, 139], [198, 141], [244, 137], [282, 128], [322, 116], [350, 108], [380, 105]],
        tail: { a: [373, 82], b: [373, 106], edge: [[400, 66], [431, 46], [416, 72], [404, 94], [416, 116], [431, 142], [400, 122]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [188, 48], b: [244, 51], edge: [[198, 28], [211, 13], [234, 21], [254, 33]], r0: 2, r1: 4, rays: 13 },
        adipose: { a: [322, 67], b: [336, 72], edge: [[331, 59], [341, 58], [343, 66]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [274, 130], b: [325, 116], edge: [[279, 149], [287, 165], [309, 149], [329, 135]], r0: 2, r1: 4, rays: 14, bend: -0.05 },
        pelvic: { a: [214, 140.5], b: [231, 139], edge: [[226, 156], [248, 169], [244, 152]], r0: 2, r1: 3, rays: 9, bend: -0.04 },
        pectoral: { a: [101, 122], b: [103, 133], edge: [[123, 130], [148, 146], [142, 154], [119, 144]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          anal: function () { return '<ellipse class="fin-tip" cx="285" cy="159" rx="8" ry="10" filter="url(#fp-b3)"/>'; },
          pelvic: function () { return '<ellipse class="fin-tip" cx="245" cy="164" rx="7" ry="8" filter="url(#fp-b3)"/>'; },
          tail: function () { return '<path class="fin-dusk" filter="url(#fp-b3)" d="M402 58L434 42L418 72L407 94L418 116L434 146L402 128L412 94Z"/>'; }
        },
        // The calico bars: ragged upright streaks, maroon and dark green, no two alike.
        marks: function (c) {
          var out = "", r = c.rand, x = c.x0 + 8, i = 0;
          while (x < c.x1 - 16) {
            var w = 5 + r() * 8, vt = 0.1 + r() * 0.1, vb = 0.58 + r() * 0.24, L = [], R = [], K = 6, lean = (r() - 0.25) * 12;
            for (var k = 0; k <= K; k++) {
              var v = lerp(vt, vb, k / K), wob = (r() - 0.5) * 8, taper = 0.3 + Math.sin(Math.PI * (k / K)) * 0.8;
              var cx = x + lean * (k / K) + wob;
              L.push([cx - (w * taper) / 2, c.at(cx, v)]);
              R.unshift([cx + (w * taper) / 2 + (r() - 0.5) * 3, c.at(cx, v)]);
            }
            out += '<path class="bar ' + (i % 3 === 1 ? "bar-g" : "bar-m") + '" d="' + cr(L.concat(R), true) + '"/>';
            x += w + 7 + r() * 13; i++;
          }
          return '<g filter="url(#fp-b1)">' + out + "</g>";
        },
        headPaint: function () { return '<ellipse class="cheek" cx="78" cy="100" rx="14" ry="11" filter="url(#fp-b3)"/><ellipse class="sheen" cx="84" cy="92" rx="8" ry="6" filter="url(#fp-b3)"/>'; },
        // The hooked jaw of a river male, and his teeth.
        mouth: kype(14, 101.5, 58) + '<circle class="nostril" cx="31" cy="90" r=".9"/>'
      }, { depth: 1.03, wrist: 0.8, head: 1.05, tail: 1.1, fork: 1.15 }));
    }
  };

  // ---- rainbow trout, a stocked lake fish --------------------------------
  S.rainbow = {
    box: "0 0 440 190", name: "Rainbow trout", latin: "Oncorhynchus mykiss",
    draw: function () {
      return fishBody(form({
        id: "fprbow", kind: "rainbow", seed: 23, gill: 96, eye: [54, 88, 6], depth: 87, scale: 3.9, lateral: 0.47,
        top: [[21, 98], [24, 90], [33, 84], [50, 76], [76, 67], [112, 58], [156, 52], [200, 51], [246, 55], [290, 63], [330, 73], [360, 80], [380, 82]],
        bot: [[21, 98], [24, 104], [33, 109], [50, 113], [78, 121], [114, 130], [158, 137], [204, 138], [250, 134], [286, 126], [324, 115], [352, 109], [380, 107]],
        tail: { a: [373, 81], b: [373, 108], edge: [[400, 68], [427, 55], [418, 76], [412, 95], [418, 113], [427, 134], [400, 121]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [190, 52], b: [242, 55], edge: [[199, 34], [211, 22], [234, 28], [250, 38]], r0: 2, r1: 4, rays: 12 },
        adipose: { a: [318, 70], b: [332, 75], edge: [[327, 63], [337, 63], [338, 70]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [280, 127], b: [322, 116], edge: [[284, 145], [291, 157], [310, 145], [326, 133]], r0: 2, r1: 4, rays: 12, bend: -0.05 },
        pelvic: { a: [216, 137.5], b: [232, 136.5], edge: [[227, 152], [246, 163], [243, 149]], r0: 2, r1: 3, rays: 8, bend: -0.04 },
        pectoral: { a: [99, 121], b: [101, 131], edge: [[121, 129], [144, 145], [138, 152], [117, 142]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          tail: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 7, 0.82, 0.08, 0.95) + '"/>'; },
          dorsal: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 5, 0.8, 0.1, 0.9) + '"/>'; },
          adipose: function () { return '<path class="spot" d="' + dot(329, 65, 1, 0.8, 0) + dot(334, 68, 0.9, 0.8, 0) + '"/>'; },
          anal: function () { return '<path class="fin-lead" d="M281 129L285 145L291 156"/>'; },
          pelvic: function () { return '<path class="fin-lead" d="M217 139L228 152L245 162"/>'; }
        },
        // The band the fish is named for, soft at both edges, then the pepper of spots.
        under: function (c) {
          var pts = [];
          for (var x = 82; x <= 376; x += 24) pts.push([x, c.at(x, 0.5)]);
          var d = cr(pts, false);
          return '<path class="band wide" d="' + d + '" filter="url(#fp-b6)"/><path class="band" d="' + d + '" filter="url(#fp-b3)"/>';
        },
        marks: function (c) {
          var d = spots(c, 300, function (x, v) { return v < 0.5 ? 1 - v * 1.2 : v < 0.62 ? 0.1 : 0; },
            function (r) { return 0.45 + r() * 0.55; }, 94, 374);
          return '<path class="spot" d="' + d + '"/>';
        },
        headPaint: function (c) {
          return '<ellipse class="cheek" cx="80" cy="95" rx="13" ry="11" filter="url(#fp-b3)"/><ellipse class="sheen" cx="84" cy="88" rx="7" ry="5" filter="url(#fp-b3)"/>' +
            '<path class="spot" d="' + spots(c, 16, function (x, v) { return v < 0.3 ? 1 : 0; }, function (r) { return 0.45 + r() * 0.4; }, 40, 90) + '"/>';
        },
        mouth: '<path class="ink mouth" d="M23 101C34 103 46 104 60 107"/><path class="ink thin" d="M38 101C48 101 55 103 61 106"/>' +
          '<circle class="nostril" cx="37" cy="88" r=".8"/>'
      }, { depth: 1.08, wrist: 1.06, head: 0.9, tail: 0.96, fork: 0.62 }));
    }
  };

  // ---- sea-run cutthroat --------------------------------------------------
  S.cutthroat = {
    box: "0 0 440 190", name: "Sea-run cutthroat", latin: "Oncorhynchus clarkii clarkii",
    draw: function () {
      return fishBody(form({
        id: "fpcutt", kind: "cutthroat", seed: 5, gill: 96, eye: [50, 91, 5.6], depth: 75, scale: 3.6, lateral: 0.46,
        top: [[13, 100], [17, 93], [28, 87], [48, 80], [78, 72], [116, 64], [160, 59], [204, 58], [250, 62], [294, 69], [332, 77], [362, 83], [380, 85]],
        bot: [[13, 100], [17, 105], [28, 109], [46, 113], [74, 120], [110, 127], [156, 132], [204, 133], [250, 130], [288, 123], [324, 114], [352, 109], [380, 107]],
        tail: { a: [373, 84], b: [373, 108], edge: [[400, 70], [429, 54], [417, 76], [408, 96], [417, 116], [429, 138], [400, 122]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [194, 59], b: [244, 62], edge: [[202, 42], [213, 30], [236, 35], [252, 45]], r0: 2, r1: 4, rays: 12 },
        adipose: { a: [320, 74], b: [334, 79], edge: [[329, 67], [339, 67], [340, 74]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [282, 124], b: [324, 114.5], edge: [[286, 141], [293, 153], [312, 142], [328, 131]], r0: 2, r1: 4, rays: 12, bend: -0.05 },
        pelvic: { a: [218, 133], b: [234, 132], edge: [[229, 147], [248, 158], [245, 145]], r0: 2, r1: 3, rays: 8, bend: -0.04 },
        pectoral: { a: [99, 119], b: [101, 128], edge: [[121, 127], [145, 142], [139, 149], [117, 139]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          tail: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 9, 0.85, 0.05, 0.96) + '"/>'; },
          dorsal: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 6, 0.85, 0.08, 0.92) + '"/>'; },
          adipose: function () { return '<path class="spot" d="' + dot(329, 68, 1, 0.8, 0) + dot(335, 71, 0.9, 0.8, 0) + dot(332, 75, 0.8, 0.7, 0) + '"/>'; },
          anal: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 2, 0.7, 0.1, 0.6) + '"/>'; }
        },
        under: function (c) {
          var pts = [];
          for (var x = 92; x <= 374; x += 24) pts.push([x, c.at(x, 0.52)]);
          return '<path class="brass" d="' + cr(pts, false) + '" filter="url(#fp-b6)"/>';
        },
        // Spots everywhere, thickest toward the tail and well below the side line.
        marks: function (c) {
          var d = spots(c, 460, function (x, v) {
            if (v > 0.84 || v < 0.03) return 0;
            var tailward = 0.42 + 0.58 * ((x - 96) / 280);
            return (v < 0.5 ? 1 : 1.4 - v * 1.4) * tailward;
          }, function (r) { return 0.5 + r() * 0.75; }, 94, 376);
          return '<path class="spot" d="' + d + '"/>';
        },
        // The slash in the fold under the jaw that names the fish.
        headPaint: function (c) {
          return '<ellipse class="cheek" cx="80" cy="97" rx="12" ry="9" filter="url(#fp-b3)"/><ellipse class="sheen" cx="84" cy="91" rx="7" ry="5" filter="url(#fp-b3)"/>' +
            '<path class="spot" d="' + spots(c, 24, function (x, v) { return v < 0.34 ? 1 : 0; }, function (r) { return 0.45 + r() * 0.45; }, 32, 90) + '"/>' +
            '<path class="slash" d="M30 109C44 112.6 60 116 82 121.4" filter="url(#fp-b05)"/>';
        },
        mouth: '<path class="ink mouth" d="M15 102C30 105 50 106 72 112"/><path class="ink thin" d="M32 103C48 103 62 106 72 111"/>' +
          '<circle class="nostril" cx="33" cy="91" r=".8"/>'
      }, { depth: 0.96, wrist: 0.92, head: 1.08, tail: 0.98, fork: 1.1 }));
    }
  };

  // ---- market squid, seen from above --------------------------------------
  // A tapering arm or tentacle: a centre line and a width that runs out.
  function limb(p0, c1, c2, p3, w, club) {
    var L = [], R = [], N = 14;
    for (var i = 0; i <= N; i++) {
      var t = i / N, u = 1 - t;
      var x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0];
      var y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1];
      var dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0]);
      var dy = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1]);
      var len = Math.hypot(dx, dy) || 1;
      var hw = (w / 2) * (club ? (0.4 + (t > 0.66 ? Math.sin(((t - 0.66) / 0.34) * Math.PI) * 0.85 : 0)) * (t > 0.97 ? 0.5 : 1)
        : Math.pow(1 - t, 0.82) * 0.95 + 0.05);
      L.push([x - (dy / len) * hw, y + (dx / len) * hw]); R.unshift([x + (dy / len) * hw, y - (dx / len) * hw]);
    }
    var core = "M" + P(p0) + "C" + P(c1) + " " + P(c2) + " " + P(p3);
    return { d: cr(L.concat(R), true), core: core, mid: function (t) {
      var u = 1 - t;
      return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]];
    }, w: w };
  }
  S.squid = {
    box: "0 0 440 150", name: "Market squid", latin: "Doryteuthis opalescens",
    draw: function () {
      var r = rng(41), id = "fpsqd";
      var mantle = [[168, 54], [190, 50.5], [230, 50], [270, 53], [312, 58.5], [355, 65], [396, 71.5], [422, 75.5],
        [396, 79], [355, 85.5], [312, 92], [270, 97.5], [230, 100.5], [190, 100], [168, 96.5], [163, 86], [158, 75.5], [163, 65]];
      var mD = cr(mantle, true);
      var upper = crPts(mantle.slice(0, 8), false, 10), lower = crPts(mantle.slice(7, 15).reverse(), false, 10);
      function half(x) { return (yAt(lower, x) - yAt(upper, x)) / 2; }
      function mid(x) { return (yAt(lower, x) + yAt(upper, x)) / 2; }

      var fU = fin({ id: id + "-fu", cls: "sq-fin", a: [296, 60], b: [417, 74.5], edge: [[312, 41], [344, 26], [369, 32], [394, 53]], r0: 1, r1: 4, rays: 26, bend: 0.03, bias: 1 });
      var fL = fin({ id: id + "-fl", cls: "sq-fin", a: [299, 91], b: [417, 76.5], edge: [[316, 111], [350, 125], [373, 117], [396, 97]], r0: 1, r1: 4, rays: 26, bend: -0.03, bias: 1 });

      var head = [[170, 65], [158, 60], [146, 58.5], [135, 61], [127, 66.5], [124, 75.5], [127, 84.5], [135, 90], [146, 92.5], [158, 91], [170, 86]];
      var hD = cr(head, true);
      // Eight arms held in a loose cone, then the two long feeding tentacles.
      var arms = [
        limb([130, 64], [113, 58], [97, 53], [82, 47], 9), limb([130, 87], [113, 93], [98, 98], [84, 105], 9),
        limb([128, 67], [107, 62], [87, 58], [65, 55], 10), limb([128, 84], [107, 89], [87, 93], [63, 98], 10),
        limb([127, 70.5], [105, 68], [81, 66.5], [53, 64], 10.6), limb([127, 80.5], [105, 83], [83, 84.5], [51, 89], 10.6),
        limb([126, 73.5], [107, 73], [89, 74], [67, 71], 8.4), limb([126, 77.5], [107, 78], [91, 77], [69, 81], 8.4)
      ];
      var tents = [limb([126, 74], [98, 72], [64, 60], [20, 64], 6, true), limb([126, 77], [94, 82], [60, 97], [16, 92], 6, true)];
      var armsD = arms.map(function (a) {
        return '<path class="sq-arm" d="' + a.d + '"/><path class="sq-armshade" d="' + a.core + '" transform="translate(0 1.2)"/><path class="ink thin" d="' + a.d + '"/>';
      }).join("");
      var tentD = tents.map(function (a) { return '<path class="sq-arm sq-tent" d="' + a.d + '"/><path class="ink thin" d="' + a.d + '"/>'; }).join("");

      // Chromatophores: the red-brown freckles, thick down the back, thin at the sides.
      var big = "", small = "", pale = "";
      for (var i = 0; i < 560; i++) {
        var x = lerp(166, 414, Math.pow(r(), 1.15)), k = ((r() + r() + r()) / 3) * 2 - 1, hw = half(x);
        if (hw < 1.5) continue;
        var y = mid(x) + k * hw * 0.96, edge = Math.abs(k);
        if (r() < edge * 0.8) continue;
        var s = r();
        if (s < 0.2) big += dot(x, y, 1.2 + r() * 1, 1 + r() * 0.8, r() * 3);
        else if (s < 0.72) small += dot(x, y, 0.5 + r() * 0.5, 0.45 + r() * 0.4, 0);
        else pale += dot(x, y, 0.9 + r() * 1, 0.8 + r() * 0.8, 0);
      }
      var headBig = "", headSmall = "";
      for (i = 0; i < 90; i++) {
        var hx = lerp(126, 166, r()), hy = 75.5 + (r() + r() - 1) * 12;
        if (r() < 0.4) headBig += dot(hx, hy, 0.9 + r() * 0.8, 0.8 + r() * 0.6, 0); else headSmall += dot(hx, hy, 0.45 + r() * 0.5, 0.45 + r() * 0.4, 0);
      }
      var armDots = "";
      arms.concat(tents).forEach(function (a, ai) {
        for (var j = 0; j < (ai < 8 ? 26 : 12); j++) {
          var t = ai < 8 ? r() * 0.86 : 0.05 + r() * 0.6, p = a.mid(t), wj = (a.w / 2) * (ai < 8 ? Math.pow(1 - t, 0.82) : 0.4) * 0.8;
          armDots += dot(p[0] + (r() - 0.5) * wj * 2, p[1] + (r() - 0.5) * wj * 2, 0.4 + r() * 0.55, 0.4 + r() * 0.45, 0);
        }
      });
      // Suckers on the two clubs.
      var suck = "";
      tents.forEach(function (a) { for (var j = 0; j < 9; j++) { var p = a.mid(0.72 + j * 0.028); suck += dot(p[0], p[1] + (j % 2 ? 1 : -1) * 1, 0.8, 0.8, 0); } });

      function eye(cx, cy, up) {
        return '<circle class="eye-ring" cx="' + cx + '" cy="' + cy + '" r="5.7"/><circle class="iris sq-iris" cx="' + cx + '" cy="' + cy + '" r="4.9" fill="url(#' + id + '-i)"/>' +
          '<ellipse class="pupil" cx="' + (cx - 0.3) + '" cy="' + (cy + up * 0.4) + '" rx="3.5" ry="3.1"/><circle class="glint" cx="' + (cx - 1.6) + '" cy="' + (cy - 1.5) + '" r=".8"/>';
      }
      return '<defs>' + fU.defs + fL.defs +
        '<linearGradient id="' + id + '-m" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="0" y2="101">' +
          '<stop offset="0" style="stop-color:var(--q-edge)"/><stop offset=".2" style="stop-color:var(--q-mid)"/>' +
          '<stop offset=".44" style="stop-color:var(--q-pearl)"/><stop offset=".72" style="stop-color:var(--q-mid)"/>' +
          '<stop offset="1" style="stop-color:var(--q-edge2)"/></linearGradient>' +
        '<radialGradient id="' + id + '-i" cx=".4" cy=".7" r=".85"><stop offset="0" style="stop-color:var(--f-iris1)"/><stop offset="1" style="stop-color:var(--q-iris2)"/></radialGradient>' +
        '<clipPath id="' + id + '-c"><path d="' + mD + '"/></clipPath><clipPath id="' + id + '-hc"><path d="' + hD + '"/></clipPath></defs>' +
        '<g class="fp fp-squid"' + grain() + ">"  +
        tentD + '<path class="sq-suck" d="' + suck + '"/>' + armsD + '<path class="chroma small" d="' + armDots + '"/>' +
        fU.html + fL.html +
        '<path class="sq-head" d="' + hD + '"/>' +
        '<g clip-path="url(#' + id + '-hc)"><path class="sq-headshade" d="M120 93C140 97 158 96 170 91" filter="url(#fp-b3)"/>' +
          '<path class="chroma small" d="' + headSmall + '"/><path class="chroma big" d="' + headBig + '"/>' +
          '<path class="sq-lit" d="M131 70C142 67 156 67 166 69" filter="url(#fp-b3)"/></g>' +
        '<path class="ink" d="' + hD + '"/>' +
        eye(142, 59.5, -1) + eye(143, 91.5, 1) +
        '<path d="' + mD + '" fill="url(#' + id + '-m)"/>' +
        '<g clip-path="url(#' + id + '-c)">' +
          blot(150, 40, 280, 70) +
          '<ellipse class="q-rose" cx="236" cy="66" rx="52" ry="9" filter="url(#fp-b6)"/>' +
          '<ellipse class="q-teal" cx="318" cy="84" rx="50" ry="7" filter="url(#fp-b6)"/>' +
          '<ellipse class="q-teal" cx="196" cy="88" rx="30" ry="6" filter="url(#fp-b6)"/>' +
          '<path class="q-pen" d="M172 75.5C240 73.5 330 74.5 412 75.5C330 76.6 240 77.6 172 75.5Z"/>' +
          '<path class="chroma pale" d="' + pale + '"/><path class="chroma small" d="' + small + '"/><path class="chroma big" d="' + big + '"/>' +
          '<path class="sq-lit" d="M176 66C240 62 320 66 398 73" filter="url(#fp-b3)"/>' +
          '<path class="sh-rim" filter="url(#fp-b3)" d="' + cr(mantle.slice(7, 15), false) + '"/>' +
          '<path class="sh-rim top" filter="url(#fp-b3)" d="' + cr(mantle.slice(0, 8), false) + '"/>' +
          '<path class="sq-collar" d="M171 55C165 66 165 86 171 97" filter="url(#fp-b1)"/>' +
        '</g>' +
        '<path class="ink body" d="' + mD + '"/><path class="ink under" d="' + cr(mantle.slice(7, 15), false) + '"/>' +
        '<path class="ink ghost" d="' + mD + '" transform="translate(.7 .6)"/>' +
        '</g>';
    }
  };

  // ---- Pacific razor clam -------------------------------------------------
  S.clam = {
    box: "0 0 440 180", name: "Pacific razor clam", latin: "Siliqua patula",
    draw: function () {
      var id = "fpclm", r = rng(77), U = [198, 47];
      var shell = [[106, 98], [120, 66], [156, 51], [204, 46], [266, 47], [320, 53], [346, 71], [352, 97], [341, 124], [302, 138], [240, 143], [180, 140], [131, 127]];
      var sD = cr(shell, true);
      function ring(s) { return cr(shell.map(function (p) { return [U[0] + (p[0] - U[0]) * s, U[1] + (p[1] - U[1]) * s]; }), true); }
      var fine = "", bold = "", bands = "", s = 0.12;
      while (s < 0.985) {
        if (r() < 0.24) bold += ring(s); else fine += ring(s);
        if (r() < 0.2 && s > 0.3) bands += ring(s + 0.012);
        s += 0.012 + r() * 0.03 * (1.2 - s * 0.6);
      }
      var foot = [[122, 84], [102, 80], [80, 80], [60, 83], [43, 89], [29, 99], [35, 109], [52, 113], [76, 112], [100, 113], [124, 113]];
      var neck = [[338, 76], [360, 73], [386, 75], [408, 80], [418, 89], [411, 99], [390, 104], [364, 108], [340, 112]];
      var creases = "", wr = "";
      for (var x = 58; x < 118; x += 9 + r() * 6) creases += "M" + n(x) + " " + n(82 + r() * 4) + "q" + n(-3 - r() * 2) + " " + n(13) + " " + n(1) + " " + n(27 + r() * 3);
      for (x = 352; x < 408; x += 5 + r() * 3) wr += "M" + n(x) + " " + n(76 + (x - 352) * 0.07) + "q" + n(3.5) + " " + n(14) + " " + n(-1) + " " + n(30 - (x - 352) * 0.14);
      var fringe = "";
      for (var a = -1.1; a <= 1.2; a += 0.28) fringe += "M" + n(414 + Math.cos(a) * 3) + " " + n(89 + Math.sin(a) * 8) + "l" + n(Math.cos(a) * 5) + " " + n(Math.sin(a) * 4.5);
      return '<defs><radialGradient id="' + id + '-s" gradientUnits="userSpaceOnUse" cx="' + U[0] + '" cy="' + U[1] + '" r="178">' +
          '<stop offset="0" style="stop-color:var(--k-worn)"/><stop offset=".2" style="stop-color:var(--k-light)"/>' +
          '<stop offset=".58" style="stop-color:var(--k-mid)"/><stop offset="1" style="stop-color:var(--k-dark)"/></radialGradient>' +
        '<linearGradient id="' + id + '-f" x1="1" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--k-flesh2)"/><stop offset="1" style="stop-color:var(--k-flesh)"/></linearGradient>' +
        '<linearGradient id="' + id + '-n" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--k-flesh2)"/><stop offset=".7" style="stop-color:var(--k-neck)"/><stop offset="1" style="stop-color:var(--k-neck2)"/></linearGradient>' +
        '<clipPath id="' + id + '-c"><path d="' + sD + '"/></clipPath>' +
        '<clipPath id="' + id + '-fc"><path d="' + cr(foot, true) + '"/></clipPath><clipPath id="' + id + '-nc"><path d="' + cr(neck, true) + '"/></clipPath></defs>' +
        '<g class="fp fp-clam"' + grain() + ">"  +
        '<path d="' + cr(foot, true) + '" fill="url(#' + id + '-f)"/>' +
        '<g clip-path="url(#' + id + '-fc)"><path class="k-crease" d="' + creases + '"/>' +
          '<path class="sh-core" filter="url(#fp-b6)" d="M30 112C60 120 96 120 126 118"/><path class="sq-lit" d="M44 88C66 80 96 79 120 83" filter="url(#fp-b3)"/>' +
          '<path class="k-under" d="M126 74C116 90 116 104 128 120" filter="url(#fp-b3)"/></g>' +
        '<path class="ink" d="' + cr(foot, true) + '"/>' +
        '<path d="' + cr(neck, true) + '" fill="url(#' + id + '-n)"/>' +
        '<g clip-path="url(#' + id + '-nc)"><path class="k-crease dark" d="' + wr + '"/>' +
          '<path class="sh-core" filter="url(#fp-b6)" d="M338 110C366 110 392 106 414 98"/><path class="sq-lit" d="M344 80C366 77 388 79 404 83" filter="url(#fp-b3)"/>' +
          '<path class="k-under" d="M334 70C346 86 346 100 334 116" filter="url(#fp-b3)"/></g>' +
        '<path class="ink" d="' + cr(neck, true) + '"/><path class="ink thin" d="' + fringe + '"/>' +
        '<ellipse class="k-hole" cx="412.5" cy="85.5" rx="1.6" ry="2.6"/><ellipse class="k-hole" cx="411.5" cy="93.5" rx="1.5" ry="2.3"/>' +
        '<path d="' + sD + '" fill="url(#' + id + '-s)"/>' +
        '<g clip-path="url(#' + id + '-c)">' +
          blot(100, 40, 260, 110) +
          '<path class="k-band" d="' + bands + '" filter="url(#fp-b1)"/>' +
          '<path class="k-ray" d="M' + U[0] + " " + U[1] + 'L168 144" filter="url(#fp-b3)"/>' +
          '<path class="k-ring" d="' + fine + '"/><path class="k-ring bold" d="' + bold + '"/>' +
          '<path class="sh-core" filter="url(#fp-b6)" d="M112 122C160 146 300 150 348 118"/>' +
          '<path class="k-gloss" d="M146 78C196 64 270 62 326 72" filter="url(#fp-b4)"/>' +
          '<path class="k-glint" d="M170 68C204 61 246 59 284 62" filter="url(#fp-b05)"/>' +
          '<ellipse class="k-umbo" cx="' + U[0] + '" cy="' + (U[1] + 5) + '" rx="26" ry="9" filter="url(#fp-b4)"/>' +
          '<path class="sh-rim" filter="url(#fp-b3)" d="' + cr(shell.slice(6).concat([shell[0]]), false) + '"/>' +
        '</g>' +
        '<path class="ink body" d="' + sD + '"/><path class="ink under" d="' + cr(shell.slice(7).concat([shell[0]]), false) + '"/>' +
        '<path class="ink ghost" d="' + sD + '" transform="translate(.7 .6)"/>' +
        '</g>';
    }
  };

  // ---- a squid jig ---------------------------------------------------------
  // Cloth body, glow belly, lead keel under the chin and two crowns of
  // barbless pins at the tail.
  S.jig = {
    box: "0 0 300 120", name: "Squid jig", latin: "",
    draw: function () {
      var id = "fpjig", r = rng(9);
      var top = [[30, 60], [46, 49], [78, 41], [120, 38], [166, 40], [206, 46], [234, 52]];
      var bot = [[30, 60], [48, 67], [84, 71], [124, 71], [166, 67], [206, 60], [234, 54]];
      var bD = cr(top.concat(bot.slice(1).reverse()), true);
      var topS = crPts(top, false, 10), botS = crPts(bot, false, 10);
      var bands = "", seg = "", weave = "";
      for (var x = 64; x < 232; x += 15) {
        var yt = yAt(topS, x), yb = yAt(botS, x);
        bands += "M" + n(x) + " " + n(yt - 1) + "L" + n(x + 8) + " " + n(yt - 1) + "L" + n(x + 1) + " " + n(lerp(yt, yb, 0.62)) + "L" + n(x - 6) + " " + n(lerp(yt, yb, 0.62)) + "Z";
        seg += "M" + n(x - 3) + " " + n(yt) + "Q" + n(x + 1) + " " + n((yt + yb) / 2) + " " + n(x - 4) + " " + n(yb);
      }
      for (x = 44; x < 234; x += 2.6) weave += "M" + n(x) + " " + n(yAt(topS, x)) + "L" + n(x - 5) + " " + n(yAt(botS, x - 5));
      var pins = "";
      [[252, 51, 1], [266, 50, 0.86]].forEach(function (c) {
        for (var i = 0; i < 9; i++) {
          var a = (i / 9) * Math.PI * 2 + 0.3, sy = Math.sin(a), depth = Math.cos(a), reach = (12 + r() * 2) * c[2];
          pins += "M" + n(c[0]) + " " + n(c[1]) + "q" + n(7 + depth * 2) + " " + n(sy * reach * 0.55) + " " + n(-3 + depth * 1.5) + " " + n(sy * reach) +
            "q" + n(-4) + " " + n(sy * 3) + " " + n(-7) + " " + n(sy * 1.5);
        }
      });
      var feather = "";
      for (var k = 0; k < 9; k++) feather += "M" + n(98 + k * 1.2) + " " + n(64 + k * 0.3) + "q" + n(16 + k) + " " + n(6 + k * 0.5) + " " + n(30 + k * 1.6) + " " + n(18 - k * 1.3);
      return '<defs><linearGradient id="' + id + '-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--j-back)"/>' +
          '<stop offset=".5" style="stop-color:var(--j-cloth)"/><stop offset=".74" style="stop-color:var(--j-glow)"/><stop offset="1" style="stop-color:var(--j-glow2)"/></linearGradient>' +
        '<linearGradient id="' + id + '-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--j-lead1)"/><stop offset="1" style="stop-color:var(--j-lead2)"/></linearGradient>' +
        '<radialGradient id="' + id + '-i" cx=".4" cy=".7" r=".85"><stop offset="0" style="stop-color:var(--f-iris1)"/><stop offset="1" style="stop-color:var(--q-iris2)"/></radialGradient>' +
        '<clipPath id="' + id + '-c"><path d="' + bD + '"/></clipPath></defs>' +
        '<g class="fp fp-jig"' + grain() + ">"  +
        '<path class="j-line" d="M22 60C14 44 10 22 9 0"/>' +
        '<path class="j-wire" d="M30 60H23"/><circle class="j-wire" cx="19.5" cy="60" r="3.4"/>' +
        '<path class="j-wire" d="M232 53L272 50"/><path class="j-pin" d="' + pins + '"/>' +
        '<circle class="j-collar" cx="252" cy="51" r="2.6"/><circle class="j-collar" cx="266" cy="50" r="2.3"/>' +
        '<path class="j-feather" d="' + feather + '"/>' +
        '<path d="M46 66C52 80 62 88 74 86C84 84 90 76 92 70Z" fill="url(#' + id + '-l)"/>' +
        '<path class="j-leadlit" d="M54 72C60 80 68 82 76 80" filter="url(#fp-b1)"/><path class="ink thin" d="M46 66C52 80 62 88 74 86C84 84 90 76 92 70"/>' +
        '<path d="' + bD + '" fill="url(#' + id + '-b)"/>' +
        '<g clip-path="url(#' + id + '-c)">' +
          '<path class="j-band" d="' + bands + '" filter="url(#fp-b05)"/><path class="j-weave" d="' + weave + '"/>' +
          '<path class="j-seg" d="' + seg + '"/>' +
          '<path class="sh-back j" filter="url(#fp-b3)" d="' + cr(top, false) + '"/><path class="sq-lit" d="M52 50C96 42 170 43 226 52" filter="url(#fp-b3)"/>' +
          '<path class="sh-rim" filter="url(#fp-b3)" d="' + cr(bot, false) + '"/>' +
        '</g>' +
        '<circle class="eye-ring" cx="50" cy="56" r="5.2"/><circle class="iris" cx="50" cy="56" r="4.4" fill="url(#' + id + '-i)"/>' +
        '<circle class="pupil" cx="49.6" cy="56.2" r="2.4"/><circle class="glint" cx="48.4" cy="54.6" r=".8"/>' +
        '<path class="ink body" d="' + bD + '"/><path class="ink under" d="' + cr(bot, false) + '"/>' +
        '</g>';
    }
  };


  // ---- chinook, the king, bright from the salt ----------------------------
  // The deepest and heaviest of them. Big uneven spots over the back and the
  // back fin, and on both halves of the tail, which is how it is told from a
  // coho. A dark line along the gums.
  S.king = {
    box: "0 0 440 190", name: "Chinook salmon", latin: "Oncorhynchus tshawytscha",
    draw: function () {
      return fishBody(form({
        id: "fpking", kind: "king", seed: 31, gill: 100, eye: [56, 87, 5], depth: 106, scale: 4.5, lateral: 0.45,
        top: [[13, 100], [17, 92], [27, 85], [43, 77], [65, 67], [97, 55], [136, 46], [178, 41], [220, 41], [262, 46], [302, 56], [338, 68], [362, 77], [380, 81]],
        bot: [[13, 100], [18, 106], [30, 111], [48, 116], [76, 124], [112, 135], [156, 145], [202, 148], [248, 144], [286, 134], [324, 120], [352, 111], [380, 107]],
        tail: { a: [373, 80], b: [373, 108], edge: [[400, 64], [430, 47], [421, 72], [415, 94], [421, 117], [430, 143], [400, 125]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [190, 42], b: [248, 45], edge: [[199, 22], [212, 8], [236, 16], [258, 29]], r0: 2, r1: 4, rays: 13 },
        adipose: { a: [324, 63], b: [338, 69], edge: [[333, 55], [343, 54], [345, 62]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [276, 137], b: [328, 119.5], edge: [[281, 156], [290, 171], [312, 155], [332, 139]], r0: 2, r1: 4, rays: 15, bend: -0.05 },
        pelvic: { a: [216, 147.5], b: [233, 146], edge: [[228, 163], [250, 176], [246, 159]], r0: 2, r1: 3, rays: 9, bend: -0.04 },
        pectoral: { a: [103, 125], b: [105, 136], edge: [[125, 133], [150, 150], [144, 158], [121, 148]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          tail: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 5, 1.25, 0.1, 0.9) + '"/>'; },
          dorsal: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 4, 1.1, 0.12, 0.85) + '"/>'; },
          adipose: function () { return '<path class="spot" d="' + dot(335, 60, 1.3, 1, 0) + '"/>'; }
        },
        under: function (c) {
          var pts = [];
          for (var x = 96; x <= 372; x += 24) pts.push([x, c.at(x, 0.4)]);
          return '<path class="sheen-band" d="' + cr(pts, false) + '" filter="url(#fp-b6)"/>';
        },
        marks: function (c) {
          var d = spots(c, 120, function (x, v) { return v < 0.43 ? 1 - v * 1.5 : 0; }, function (r) { return 1 + r() * 1.5; }, 106, 376);
          return '<path class="spot" d="' + d + '"/>';
        },
        headPaint: function (c) {
          return '<ellipse class="cheek" cx="80" cy="99" rx="14" ry="11" filter="url(#fp-b3)"/><ellipse class="sheen" cx="84" cy="91" rx="8" ry="6" filter="url(#fp-b3)"/>' +
            '<path class="spot" d="' + spots(c, 12, function (x, v) { return v < 0.26 ? 1 : 0; }, function (r) { return 0.7 + r() * 0.6; }, 44, 94) + '"/>';
        },
        mouth: '<path class="gum" d="M15 102.4C28 106 44 107.6 62 110"/>' +
          '<path class="ink mouth" d="M14 102C28 105.6 46 107 64 110.6"/><path class="ink thin" d="M36 102.6C48 102.8 58 105 66 109.6"/>' +
          '<circle class="nostril" cx="33" cy="89" r=".9"/>'
      }, { depth: 1.05, wrist: 1.28, head: 1.08, tail: 1.1, fork: 0.72 }));
    }
  };

  // ---- coho, a river male colouring up -------------------------------------
  // Slimmer than a king. A red side under a dark green back, a hooked snout,
  // small spots on the back and on the top half of the tail only.
  S.coho = {
    box: "0 0 440 190", name: "Coho salmon", latin: "Oncorhynchus kisutch",
    draw: function () {
      return fishBody(form({
        id: "fpcoho", kind: "coho", seed: 43, gill: 98, eye: [54, 89, 5], depth: 88, scale: 4.2, lateral: 0.46,
        top: [[12, 102], [16, 94], [26, 87], [42, 80], [64, 72], [96, 63], [134, 55], [174, 51], [216, 51], [258, 55], [298, 63], [336, 73], [362, 80], [380, 84]],
        bot: [[12, 102], [17, 107], [29, 111], [46, 115], [74, 121], [110, 130], [154, 137], [200, 139], [246, 135], [284, 127], [322, 116], [350, 109], [380, 106]],
        tail: { a: [373, 83], b: [373, 107], edge: [[400, 68], [429, 51], [418, 75], [410, 95], [418, 115], [429, 139], [400, 122]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [190, 52], b: [244, 55], edge: [[199, 33], [211, 20], [234, 27], [254, 38]], r0: 2, r1: 4, rays: 12 },
        adipose: { a: [322, 69], b: [336, 74], edge: [[331, 61], [341, 60], [343, 68]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [276, 129], b: [326, 115.5], edge: [[281, 147], [289, 161], [310, 147], [330, 133]], r0: 2, r1: 4, rays: 14, bend: -0.05 },
        pelvic: { a: [214, 138.5], b: [231, 137.5], edge: [[226, 154], [247, 166], [244, 150]], r0: 2, r1: 3, rays: 9, bend: -0.04 },
        pectoral: { a: [100, 121], b: [102, 131], edge: [[122, 129], [146, 145], [140, 152], [118, 142]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          // the top half of the tail carries the spots, the bottom half is clean
          tail: function (c, f) { return '<path class="spot" d="' + raySpots({ rays: f.rays.slice(0, 10) }, c.rand, 5, 0.9, 0.1, 0.9) + '"/>'; },
          dorsal: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 3, 0.8, 0.12, 0.8) + '"/>'; }
        },
        under: function (c) {
          var pts = [];
          for (var x = 92; x <= 374; x += 24) pts.push([x, c.at(x, 0.62)]);
          var d = cr(pts, false);
          return '<path class="blush wide" d="' + d + '" filter="url(#fp-b6)"/><path class="blush" d="' + d + '" filter="url(#fp-b4)"/>';
        },
        marks: function (c) {
          var d = spots(c, 90, function (x, v) { return v < 0.34 ? 1 - v * 2 : 0; }, function (r) { return 0.6 + r() * 0.7; }, 104, 376);
          return '<path class="spot" d="' + d + '"/>';
        },
        headPaint: function () {
          return '<ellipse class="cheek" cx="78" cy="101" rx="14" ry="10" filter="url(#fp-b3)"/><ellipse class="sheen" cx="82" cy="93" rx="8" ry="6" filter="url(#fp-b3)"/>';
        },
        // the hooked snout of a river male
        mouth: '<path class="lip" d="M13 103.5C24 107 38 108 52 109"/>' +
          '<path class="ink mouth" d="M13 103.5C26 107 42 108 56 109.6S66 112 70 115"/>' +
          '<path class="ink thin" d="M12 102C10 105 11 107.4 14 108"/>' +
          '<path class="ink thin" d="M34 104C46 104 58 106.4 68 112.6"/><circle class="nostril" cx="31" cy="91" r=".9"/>'
      }, { depth: 1, wrist: 1.16, head: 1, tail: 1, fork: 0.58 }));
    }
  };

  // ---- pink, a humpy --------------------------------------------------------
  // The smallest salmon and the easiest to name: the male's hump, and big
  // oval spots on the back and all over the tail.
  S.pink = {
    box: "0 0 440 190", name: "Pink salmon", latin: "Oncorhynchus gorbuscha",
    draw: function () {
      return fishBody(form({
        id: "fppink", kind: "pink", seed: 61, gill: 96, eye: [52, 93, 4.6], depth: 104, scale: 3.1, lateral: 0.5,
        top: [[12, 106], [16, 99], [25, 93], [39, 87], [56, 79], [76, 64], [100, 47], [130, 36], [166, 33], [206, 36], [250, 45], [294, 58], [334, 71], [362, 79], [380, 83]],
        bot: [[12, 106], [17, 111], [29, 115], [46, 118], [74, 124], [110, 132], [154, 139], [200, 141], [246, 137], [284, 129], [322, 118], [350, 110], [380, 106]],
        tail: { a: [373, 82], b: [373, 107], edge: [[400, 67], [430, 50], [418, 74], [409, 95], [418, 116], [430, 140], [400, 122]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [196, 35], b: [250, 46], edge: [[206, 16], [220, 6], [242, 16], [260, 31]], r0: 2, r1: 4, rays: 12 },
        adipose: { a: [322, 67], b: [336, 72], edge: [[331, 59], [341, 58], [343, 66]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [272, 131], b: [326, 117.5], edge: [[277, 149], [286, 164], [309, 149], [330, 135]], r0: 2, r1: 4, rays: 15, bend: -0.05 },
        pelvic: { a: [214, 140.5], b: [231, 139.5], edge: [[226, 156], [247, 168], [244, 152]], r0: 2, r1: 3, rays: 9, bend: -0.04 },
        pectoral: { a: [98, 122], b: [100, 132], edge: [[120, 131], [144, 147], [138, 154], [116, 144]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          // long ovals, set along the rays, over the whole tail
          tail: function (c, f) { return '<path class="spot oval" d="' + raySpots(f, c.rand, 3, 2.1, 0.12, 0.9) + '"/>'; }
        },
        marks: function (c) {
          var d = spots(c, 70, function (x, v) { return v < 0.4 ? 1 - v * 1.4 : 0; }, function (r) { return 1.7 + r() * 1.6; }, 104, 378);
          return '<path class="spot oval" d="' + d + '"/>';
        },
        headPaint: function () {
          return '<ellipse class="cheek" cx="76" cy="104" rx="13" ry="10" filter="url(#fp-b3)"/><ellipse class="sheen" cx="80" cy="97" rx="7" ry="5" filter="url(#fp-b3)"/>';
        },
        // a humped male: the hooked jaw too
        mouth: kype(13, 106.5, 52) + '<circle class="nostril" cx="29" cy="95" r=".9"/>'
      }, { depth: 1, wrist: 0.82, head: 0.95, tail: 0.94, fork: 1.05 }));
    }
  };

  // ---- steelhead, a winter fish fresh from the salt ---------------------------
  // A rainbow that went to sea: longer, leaner and chrome bright, the band
  // down its side only a blush, small spots in rows across a square tail.
  S.steelhead = {
    box: "0 0 440 190", name: "Steelhead", latin: "Oncorhynchus mykiss",
    draw: function () {
      return fishBody(form({
        id: "fpsteel", kind: "steelhead", seed: 71, gill: 92, eye: [50, 91, 5], depth: 70, scale: 3.6, lateral: 0.47,
        top: [[14, 100], [18, 93], [28, 87], [48, 81], [80, 74], [120, 67], [164, 62], [208, 61], [252, 64], [294, 70], [332, 77], [362, 82], [382, 84]],
        bot: [[14, 100], [18, 105], [28, 109], [46, 113], [76, 119], [114, 125], [158, 130], [204, 131], [250, 128], [288, 122], [324, 114], [352, 109], [382, 106]],
        tail: { a: [375, 83], b: [375, 107], edge: [[400, 71], [425, 58], [421, 78], [418, 95], [421, 112], [425, 133], [400, 120]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [192, 62], b: [242, 64], edge: [[200, 45], [211, 33], [234, 38], [250, 48]], r0: 2, r1: 4, rays: 12 },
        adipose: { a: [322, 74], b: [336, 78], edge: [[331, 67], [341, 67], [342, 74]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [282, 122], b: [324, 113.5], edge: [[286, 139], [293, 151], [312, 140], [328, 129]], r0: 2, r1: 4, rays: 12, bend: -0.05 },
        pelvic: { a: [218, 131], b: [234, 130], edge: [[229, 145], [248, 156], [245, 143]], r0: 2, r1: 3, rays: 8, bend: -0.04 },
        pectoral: { a: [95, 119], b: [97, 128], edge: [[117, 127], [141, 142], [135, 149], [113, 139]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          tail: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 8, 0.75, 0.06, 0.95) + '"/>'; },
          dorsal: function (c, f) { return '<path class="spot" d="' + raySpots(f, c.rand, 5, 0.75, 0.1, 0.9) + '"/>'; },
          adipose: function () { return '<path class="spot" d="' + dot(331, 70, 0.9, 0.8, 0) + dot(336, 73, 0.8, 0.7, 0) + '"/>'; }
        },
        under: function (c) {
          var pts = [];
          for (var x = 80; x <= 378; x += 24) pts.push([x, c.at(x, 0.5)]);
          return '<path class="band wide" d="' + cr(pts, false) + '" filter="url(#fp-b6)"/>';
        },
        marks: function (c) {
          var d = spots(c, 170, function (x, v) { return v < 0.42 ? 1 - v * 1.6 : 0; }, function (r) { return 0.4 + r() * 0.45; }, 92, 378);
          return '<path class="spot" d="' + d + '"/>';
        },
        headPaint: function (c) {
          return '<ellipse class="cheek" cx="76" cy="97" rx="12" ry="10" filter="url(#fp-b3)"/><ellipse class="sheen" cx="80" cy="90" rx="7" ry="5" filter="url(#fp-b3)"/>' +
            '<path class="spot" d="' + spots(c, 10, function (x, v) { return v < 0.28 ? 1 : 0; }, function (r) { return 0.4 + r() * 0.3; }, 38, 86) + '"/>';
        },
        mouth: '<path class="ink mouth" d="M16 102C28 104.4 40 105.4 55 108"/><path class="ink thin" d="M32 102.4C42 102.6 50 104.4 56 107"/>' +
          '<circle class="nostril" cx="33" cy="91" r=".8"/>'
      }, { depth: 1, wrist: 1.12, head: 0.92, tail: 1, fork: 0.45 }));
    }
  };

  // ---- largemouth bass -----------------------------------------------------
  // A thick olive fish with a jaw that runs back past the eye, a ragged dark
  // band down the side, and a back fin in two parts: spines, a deep notch,
  // then a soft lobe.
  S.bass = {
    box: "0 0 440 190", name: "Largemouth bass", latin: "Micropterus salmoides",
    draw: function () {
      return fishBody({
        // deep, a third as deep as it is long, with a big blunt head
        id: "fpbass", kind: "bass", seed: 17, gill: 120, gillBulge: 14, eye: [58, 83, 6.4], depth: 116, scale: 5.6, lateral: 0.4,
        top: [[12, 108], [14, 98], [20, 87], [31, 75], [49, 63], [73, 52], [103, 43], [140, 37.5], [180, 36], [220, 38], [258, 45], [292, 56], [322, 67], [346, 75], [364, 78.5]],
        bot: [[12, 108], [16, 117], [26, 125], [42, 133], [66, 141], [98, 148], [136, 152], [176, 153], [214, 150], [252, 142], [288, 130], [318, 118], [342, 110], [364, 107.5]],
        backFins: ["tail", "spiny", "dorsal", "anal"],
        tail: { a: [358, 77], b: [358, 109], edge: [[384, 63], [418, 49], [425, 71], [415, 93], [425, 115], [418, 138], [384, 123]], r0: 2, r1: 6, rays: 19, bend: 0, bias: 1 },
        spiny: { a: [132, 38.8], b: [226, 38.6], spines: 9, up: -1, rake: 11, sag: 0.24, h: function (t) { return 5 + 21 * Math.sin(Math.PI * Math.pow(t, 0.85)); } },
        dorsal: { a: [228, 39.4], b: [300, 58.4], edge: [[234, 17], [256, 9], [284, 17], [306, 40]], r0: 1, r1: 4, rays: 13 },
        anal: { a: [262, 140], b: [312, 121], edge: [[264, 157], [278, 171], [300, 163], [316, 140]], r0: 1, r1: 4, rays: 11, bend: -0.04 },
        pelvic: { a: [132, 151.5], b: [148, 152.5], edge: [[140, 168], [160, 180], [162, 164]], r0: 1, r1: 3, rays: 7, bend: -0.04 },
        pectoral: { a: [126, 120], b: [128, 132], edge: [[146, 122], [168, 132], [164, 145], [144, 143]], r0: 1, r1: 4, rays: 11, bend: -0.02 },
        // The band: a chain of dark blotches from the gill to the tail, no two alike.
        under: function (c) {
          var r = c.rand, out = "", pts = [], x = 128;
          while (x < 358) {
            var y = c.at(x, 0.45 + (r() - 0.5) * 0.05), rx = 8 + r() * 8, ry = 5 + r() * 5;
            out += dot(x, y, rx, ry, (r() - 0.5) * 0.8);
            pts.push([x, y]);
            x += rx * (1.1 + r() * 0.7);
          }
          return '<path class="lband" d="' + cr(pts, false) + '" filter="url(#fp-b4)"/><path class="blotch" d="' + out + '" filter="url(#fp-b1)"/>';
        },
        marks: function (c) {
          var d = spots(c, 130, function (x, v) { return v < 0.34 ? 0.9 : v > 0.56 && v < 0.8 ? 0.35 : 0; }, function (r) { return 0.8 + r() * 1.2; }, 126, 358);
          return '<path class="mottle" d="' + d + '"/>';
        },
        headPaint: function () {
          return '<ellipse class="cheek" cx="96" cy="108" rx="18" ry="14" filter="url(#fp-b3)"/>' +
            '<path class="lband" d="M66 86C82 89 100 94 120 101" filter="url(#fp-b3)"/>';
        },
        // the big mouth: the upper jaw runs back past the rear of the eye, the
        // lower jaw leads it
        mouth: '<path class="jawplate" d="M28 100C50 99 72 104 92 114C72 117 48 114 26 107Z"/>' +
          '<path class="ink mouth" d="M10 110.5C30 114 60 116.6 92 114.6"/><path class="ink thin" d="M28 100C50 99 72 104 92 114"/>' +
          '<path class="ink thin" d="M11 112C26 122 46 128 70 131"/><circle class="nostril" cx="33" cy="89" r=".9"/>'
      });
    }
  };

  // ---- yellow perch -----------------------------------------------------------
  // Gold sides with seven dark bars that taper toward the belly, a tall
  // spiny fin set apart from the soft one behind it, orange fins below.
  S.perch = {
    box: "0 0 440 190", name: "Yellow perch", latin: "Perca flavescens",
    draw: function () {
      return fishBody({
        id: "fpperch", kind: "perch", seed: 29, gill: 106, eye: [58, 91, 6], depth: 92, scale: 4.3, lateral: 0.4,
        top: [[16, 104], [20, 97], [30, 90], [46, 81], [68, 67], [98, 55], [134, 48], [172, 47], [212, 51], [254, 59], [294, 69], [330, 79], [356, 86], [374, 89]],
        bot: [[16, 104], [22, 110], [36, 116], [56, 122], [84, 129], [120, 136], [162, 140], [206, 139], [248, 134], [286, 126], [320, 116], [348, 108], [374, 105]],
        backFins: ["tail", "spiny", "dorsal", "anal"],
        tail: { a: [368, 88], b: [368, 106], edge: [[392, 75], [422, 60], [416, 80], [408, 97], [416, 114], [422, 134], [392, 119]], r0: 2, r1: 6, rays: 19, bend: 0, bias: 1 },
        spiny: { a: [124, 49.5], b: [224, 53], spines: 13, up: -1, rake: 10, sag: 0.2, h: function (t) { return 7 + 25 * Math.sin(Math.PI * Math.pow(t, 0.72)); },
          paint: function () { return '<ellipse class="finblot" cx="216" cy="44" rx="12" ry="9" filter="url(#fp-b3)"/>'; } },
        dorsal: { a: [234, 55.5], b: [292, 68.5], edge: [[240, 33], [258, 27], [280, 35], [296, 53]], r0: 1, r1: 4, rays: 13 },
        anal: { a: [262, 132], b: [304, 121], edge: [[264, 150], [276, 162], [296, 154], [308, 136]], r0: 1, r1: 4, rays: 9, bend: -0.04 },
        pelvic: { a: [146, 139], b: [162, 140], edge: [[152, 158], [170, 170], [174, 154]], r0: 1, r1: 3, rays: 6, bend: -0.04 },
        pectoral: { a: [118, 117], b: [120, 128], edge: [[138, 119], [158, 131], [152, 141], [136, 137]], r0: 1, r1: 4, rays: 11, bend: -0.02 },
        marks: function (c) {
          return '<g filter="url(#fp-b1)">' + bars(c, { n: 7, x0: 110, x1: 362, w: 17, v0: 0.01, v1: 0.74, taper: 1, lean: 7 }) + "</g>";
        },
        headPaint: function () {
          return '<ellipse class="cheek" cx="84" cy="102" rx="14" ry="11" filter="url(#fp-b3)"/>';
        },
        mouth: '<path class="ink mouth" d="M16 104.6C28 107 40 108 54 110"/><path class="ink thin" d="M30 103.6C40 103.6 48 105.4 55 109"/>' +
          '<circle class="nostril" cx="35" cy="92" r=".8"/>'
      });
    }
  };

  // ---- redtail surfperch --------------------------------------------------------
  // A deep silver plate of a fish with a small mouth, narrow bars that step
  // sideways at the side line, and a red tail. Its spines stand taller than
  // the soft rays behind them.
  S.surfperch = {
    box: "0 0 440 190", name: "Redtail surfperch", latin: "Amphistichus rhodoterus",
    draw: function () {
      return fishBody({
        id: "fpsurf", kind: "surfperch", seed: 83, gill: 110, gillBulge: 9, eye: [64, 88, 7], depth: 118, scale: 4.6, lateral: 0.36,
        top: [[36, 102], [39, 94], [48, 84], [64, 71], [88, 56], [120, 43], [158, 35], [198, 33], [238, 37], [276, 47], [310, 60], [336, 73], [354, 83], [366, 88]],
        bot: [[36, 102], [41, 109], [55, 117], [75, 126], [103, 137], [139, 148], [179, 154], [219, 153], [257, 146], [291, 135], [321, 120], [345, 108], [366, 102]],
        backFins: ["tail", "spiny", "dorsal", "anal"],
        tail: { a: [360, 86], b: [360, 104], edge: [[384, 72], [420, 52], [410, 76], [400, 95], [410, 114], [420, 138], [384, 118]], r0: 2, r1: 6, rays: 19, bend: 0, bias: 1 },
        spiny: { a: [150, 36], b: [242, 38], spines: 10, up: -1, rake: 9, sag: 0.16, h: function (t) { return 9 + 19 * Math.sin(Math.PI * Math.pow(t, 0.6) * 0.8); } },
        dorsal: { a: [240, 38], b: [312, 62], edge: [[248, 21], [270, 20], [296, 32], [316, 50]], r0: 1, r1: 4, rays: 15 },
        anal: { a: [244, 149], b: [318, 122], edge: [[246, 163], [266, 172], [298, 158], [322, 138]], r0: 1, r1: 4, rays: 16, bend: -0.03 },
        pelvic: { a: [150, 151], b: [168, 153], edge: [[156, 168], [176, 180], [182, 164]], r0: 1, r1: 3, rays: 6, bend: -0.04 },
        pectoral: { a: [124, 112], b: [126, 124], edge: [[146, 112], [178, 118], [176, 128], [146, 132]], r0: 1, r1: 4, rays: 12, bend: -0.02 },
        marks: function (c) {
          return '<g filter="url(#fp-b05)">' + bars(c, { n: 10, x0: 116, x1: 344, w: 7.5, v0: 0.05, v1: 0.72, breakAt: 0.4, step: 6, lean: 3, jit: 4 }) + "</g>";
        },
        headPaint: function () {
          return '<ellipse class="cheek" cx="90" cy="100" rx="14" ry="12" filter="url(#fp-b3)"/><ellipse class="sheen" cx="94" cy="92" rx="8" ry="6" filter="url(#fp-b3)"/>';
        },
        mouth: '<path class="ink mouth" d="M36 103C42 105.4 48 106.4 55 106.8"/><path class="ink thin" d="M42 101.6C47 101.6 51 103 55 105.6"/>' +
          '<circle class="nostril" cx="49" cy="90" r=".8"/>'
      });
    }
  };

  // ---- Dungeness crab, from above ---------------------------------------------
  // A wide shell, widest at the last and largest of the ten teeth down each
  // side, pale tipped claws folded in front, four walking legs a side. Posed
  // the way one sits on the deck: no two legs at the same angle.
  // One leg or claw segment: a tapered pad between two joints.
  function seg(p, q, w0, w1, bow) {
    var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, b = (bow || 0) * len;
    var m = [(p[0] + q[0]) / 2 + nx * b, (p[1] + q[1]) / 2 + ny * b], wm = (w0 + w1) / 2 * 1.08;
    return cr([[p[0] + nx * w0 / 2, p[1] + ny * w0 / 2], [m[0] + nx * wm / 2, m[1] + ny * wm / 2], [q[0] + nx * w1 / 2, q[1] + ny * w1 / 2],
      [q[0] - nx * w1 / 2, q[1] - ny * w1 / 2], [m[0] - nx * wm / 2, m[1] - ny * wm / 2], [p[0] - nx * w0 / 2, p[1] - ny * w0 / 2]], true);
  }
  S.crab = {
    box: "0 0 440 270", name: "Dungeness crab", latin: "Metacarcinus magister",
    draw: function () {
      var id = "fpcrab", r = rng(57), CX = 220, CY = 134, i;
      // the shell: teeth down the front of each side, a smooth curve round the back
      function rim(side) {
        var pts = [];
        for (i = 0; i <= 10; i++) {
          var a0 = (70 - i * 6.7) * Math.PI / 180, a1 = (70 - (i + 0.62) * 6.7) * Math.PI / 180, big = i === 9 ? 1.06 : 1.018 + r() * 0.01;
          pts.push([CX + side * 110 * Math.cos(a0), CY - 62 * Math.sin(a0)]);
          if (i < 10) pts.push([CX + side * 110 * big * Math.cos(a1), CY - 62 * big * Math.sin(a1) - 1]);
        }
        return pts;
      }
      var right = rim(1), left = rim(-1).reverse();
      var front = [[CX - 26, CY - 59.4], [CX - 19, CY - 62.6], [CX - 12, CY - 60.6], [CX - 5.5, CY - 63.6], [CX, CY - 61.4], [CX + 6, CY - 63.8], [CX + 12.5, CY - 60.4], [CX + 19, CY - 62.8], [CX + 26, CY - 59.2]];
      var back = crPts([right[right.length - 1], [CX + 96, CY + 22], [CX + 70, CY + 46], [CX + 36, CY + 58], [CX + 2, CY + 60.5], [CX - 34, CY + 58], [CX - 68, CY + 47], [CX - 95, CY + 23], left[0]], false, 6);
      var shell = left.concat(front, right, back.slice(1, -1));
      var sD = "M" + shell.map(P).join("L") + "Z";
      // legs: joints from the shell out to the tip, front pair first
      var legs = [
        [[316, 150], [372, 136], [404, 158], [416, 186]], [[310, 162], [370, 168], [398, 194], [398, 224]],
        [[298, 174], [350, 196], [372, 224], [366, 250]], [[282, 184], [320, 212], [334, 238], [322, 260]],
        [[124, 150], [66, 132], [38, 150], [22, 176]], [[130, 162], [72, 160], [40, 182], [32, 212]],
        [[142, 174], [94, 190], [66, 216], [64, 246]], [[158, 184], [124, 210], [106, 236], [114, 260]]];
      var legD = "", legLit = "", legJoint = "";
      legs.forEach(function (L, k) {
        var w = 14 - (k % 4) * 0.8;
        legD += seg(L[0], L[1], w, w * 0.86, 0.03) + seg(L[1], L[2], w * 0.8, w * 0.6, -0.04) + seg(L[2], L[3], w * 0.52, 0.6, 0.05);
        legLit += "M" + P(lp(L[0], L[1], 0.12)) + "L" + P(lp(L[0], L[1], 0.88)) + "M" + P(lp(L[1], L[2], 0.15)) + "L" + P(lp(L[1], L[2], 0.85));
        legJoint += dot(L[1][0], L[1][1], w * 0.36, w * 0.36, 0) + dot(L[2][0], L[2][1], w * 0.26, w * 0.26, 0);
      });
      // claws: arm, wrist, the swollen hand, then two fingers that do not quite meet
      function claw(a, b, c, tip, open) {
        var hand = seg(b, c, 20, 25, 0.06), arm = seg(a, b, 17, 18, -0.05);
        var dx = tip[0] - c[0], dy = tip[1] - c[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
        var f1 = seg([c[0] + nx * 6, c[1] + ny * 6], [tip[0] + nx * open, tip[1] + ny * open], 12, 1.2, 0.16);
        var f2 = seg([c[0] - nx * 7, c[1] - ny * 7], [tip[0] - nx * open * 0.4, tip[1] - ny * open * 0.4], 11, 1.2, -0.12);
        return { arm: arm, hand: hand, fingers: f1 + f2, tipA: [tip[0] + nx * open, tip[1] + ny * open], tipB: [tip[0] - nx * open * 0.4, tip[1] - ny * open * 0.4], c: c, lit: "M" + P(lp(b, c, 0.1)) + "L" + P(lp(b, c, 0.9)) };
      }
      var cR = claw([296, 104], [338, 74], [300, 48], [262, 44], 5), cL = claw([146, 106], [100, 80], [134, 50], [172, 50], -4.5);
      function tips(c) {
        return '<path class="c-tip" d="' + seg(lp(c.c, c.tipA, 0.5), c.tipA, 7.4, 1.2, 0) + seg(lp(c.c, c.tipB, 0.55), c.tipB, 6.6, 1.2, 0) + '"/>';
      }
      // the shell's own marks: fine grain, a pale flecking toward the edge, the grooves in the middle
      var grainD = "", fleck = "", inside = function (x, y) { var u = (x - CX) / 104, v = (y - CY) / 56; return u * u + v * v < 1; };
      for (i = 0; i < 520; i++) {
        var gx = CX + (r() * 2 - 1) * 108, gy = CY + (r() * 2 - 1) * 60;
        if (!inside(gx, gy)) continue;
        if (r() < 0.8) grainD += dot(gx, gy, 0.5 + r() * 0.6, 0.45 + r() * 0.5, 0); else fleck += dot(gx, gy, 0.9 + r() * 1.3, 0.8 + r() * 1, r() * 3);
      }
      var groove = "M" + (CX - 30) + " " + (CY - 26) + "C" + (CX - 22) + " " + (CY - 8) + " " + (CX - 28) + " " + (CY + 8) + " " + (CX - 40) + " " + (CY + 24) +
        "M" + (CX + 31) + " " + (CY - 27) + "C" + (CX + 24) + " " + (CY - 9) + " " + (CX + 27) + " " + (CY + 9) + " " + (CX + 42) + " " + (CY + 22) +
        "M" + (CX - 24) + " " + (CY - 4) + "C" + (CX - 10) + " " + (CY + 3) + " " + (CX + 9) + " " + (CY + 3) + " " + (CX + 25) + " " + (CY - 5) +
        "M" + (CX - 58) + " " + (CY - 12) + "C" + (CX - 50) + " " + (CY - 2) + " " + (CX - 52) + " " + (CY + 10) + " " + (CX - 62) + " " + (CY + 18) +
        "M" + (CX + 60) + " " + (CY - 14) + "C" + (CX + 51) + " " + (CY - 3) + " " + (CX + 54) + " " + (CY + 9) + " " + (CX + 63) + " " + (CY + 17);
      var stalk = "M" + (CX - 15) + " " + (CY - 60) + "l-2.4 -7M" + (CX + 15.5) + " " + (CY - 60) + "l2 -7.4";
      var feel = "M" + (CX - 7) + " " + (CY - 62) + "q-4 -9 -11 -13M" + (CX + 7) + " " + (CY - 62) + "q5 -10 13 -12";
      return '<defs><radialGradient id="' + id + '-s" gradientUnits="userSpaceOnUse" cx="' + (CX - 14) + '" cy="' + (CY - 16) + '" r="128">' +
          '<stop offset="0" style="stop-color:var(--c-lit)"/><stop offset=".42" style="stop-color:var(--c-shell)"/><stop offset="1" style="stop-color:var(--c-edge)"/></radialGradient>' +
        '<clipPath id="' + id + '-c"><path d="' + sD + '"/></clipPath></defs>' +
        '<g class="fp fp-crab"' + grain() + ' transform="rotate(-5 220 150)">' +
        '<path class="c-leg" d="' + legD + '"/><path class="c-leglit" d="' + legLit + '" filter="url(#fp-b1)"/><path class="c-joint" d="' + legJoint + '"/><path class="ink thin" d="' + legD + '"/>' +
        '<path class="c-arm" d="' + cR.arm + cL.arm + '"/><path class="ink thin" d="' + cR.arm + cL.arm + '"/>' +
        '<path class="c-hand" d="' + cR.fingers + cL.fingers + '"/>' + tips(cR) + tips(cL) + '<path class="ink thin" d="' + cR.fingers + cL.fingers + '"/>' +
        '<path class="c-hand" d="' + cR.hand + cL.hand + '"/><path class="c-leglit" d="' + cR.lit + cL.lit + '" filter="url(#fp-b1)"/><path class="ink thin" d="' + cR.hand + cL.hand + '"/>' +
        '<path class="ink thin" d="' + feel + '"/><path class="c-stalk" d="' + stalk + '"/>' +
        '<circle class="pupil" cx="' + (CX - 17.6) + '" cy="' + (CY - 67.6) + '" r="2.3"/><circle class="pupil" cx="' + (CX + 17.6) + '" cy="' + (CY - 68) + '" r="2.3"/>' +
        '<path d="' + sD + '" fill="url(#' + id + '-s)"/>' +
        '<g clip-path="url(#' + id + '-c)">' + blot(100, 60, 240, 150) +
          '<path class="c-fleck" d="' + fleck + '"/><path class="c-grain" d="' + grainD + '"/>' +
          '<path class="c-groove" d="' + groove + '" filter="url(#fp-b05)"/>' +
          '<path class="sh-core" filter="url(#fp-b6)" d="M' + (CX - 100) + " " + (CY + 30) + "C" + (CX - 50) + " " + (CY + 64) + " " + (CX + 50) + " " + (CY + 64) + " " + (CX + 100) + " " + (CY + 30) + '"/>' +
          '<path class="k-gloss" d="M' + (CX - 66) + " " + (CY - 30) + "C" + (CX - 30) + " " + (CY - 46) + " " + (CX + 20) + " " + (CY - 48) + " " + (CX + 58) + " " + (CY - 36) + '" filter="url(#fp-b4)"/>' +
          '<path class="c-rimlit" d="M' + front.concat(right.slice(0, 12)).map(P).join("L") + '" filter="url(#fp-b05)"/>' +
        '</g>' +
        '<path class="ink body" d="' + sD + '"/><path class="ink ghost" d="' + sD + '" transform="translate(.7 .6)"/>' +
        '</g>';
    }
  };

  // ---- tackle, for the bench ----------------------------------------------------
  // The working end of a spinning rod: cork, the reel hung under its seat,
  // the first guide, and the line running out through it.
  S.rod = {
    box: "0 0 440 190", name: "Spinning rod and reel", latin: "",
    draw: function () {
      var id = "fprod", r = rng(88), k, speck = "";
      // along the blank: y at x, and half its thickness there
      function by(x) { return 86 - (x - 20) * 0.012; }
      function strip(x0, x1, h0, h1) { return poly4([[x0, by(x0) - h0], [x1, by(x1) - h1], [x1, by(x1) + h1], [x0, by(x0) + h0]]); }
      function poly4(p) { return "M" + p.map(P).join("L") + "Z"; }
      for (k = 0; k < 90; k++) {
        var sx = r() < 0.66 ? 34 + r() * 86 : 196 + r() * 40;
        speck += dot(sx, by(sx) + (r() - 0.5) * 13, 0.5 + r() * 0.9, 0.4 + r() * 0.5, r() * 3);
      }
      var blank = strip(20, 446, 4.6, 2.1), cork1 = cr([[32, by(32) - 8.6], [60, by(60) - 9.4], [96, by(96) - 9], [124, by(124) - 8], [124, by(124) + 8], [96, by(96) + 9], [60, by(60) + 9.4], [32, by(32) + 8.6]], true);
      var cork2 = cr([[194, by(194) - 7.6], [212, by(212) - 8.4], [232, by(232) - 7], [240, by(240) - 4.6], [240, by(240) + 4.6], [232, by(232) + 7], [212, by(212) + 8.4], [194, by(194) + 7.6]], true);
      var seat = strip(124, 194, 7, 7), hoods = strip(124, 136, 8.2, 8.2) + strip(180, 194, 8.2, 8.2), cap = cr([[20, by(20) - 7], [30, by(30) - 9], [34, by(34) - 9], [34, by(34) + 9], [30, by(30) + 9], [20, by(20) + 7]], true);
      // the reel: foot, stem, body, the rotor and the spool with its line, the bail and the handle
      var stem = poly4([[150, 94], [164, 94], [168, 122], [150, 122]]);
      var body = cr([[140, 120], [158, 114], [178, 118], [186, 132], [180, 148], [160, 154], [142, 146], [136, 132]], true);
      var rotor = poly4([[184, 114], [206, 116], [206, 152], [184, 152]]);
      var spool = cr([[204, 110], [236, 113], [240, 133], [236, 153], [204, 156]], true);
      var wound = "";
      for (k = 0; k < 9; k++) wound += "M" + n(209 + k * 3.1) + " " + n(113.6 + k * 0.2) + "Q" + n(212 + k * 3.1) + " " + n(133) + " " + n(209 + k * 3.1) + " " + n(152.4 - k * 0.2);
      var bail = "M206 116C232 88 262 104 250 138C246 150 238 154 228 154";
      var arm = "M158 138L128 162", knob = cr([[112, 158], [126, 156], [130, 166], [118, 172], [110, 168]], true);
      // the first guide hangs under the blank, a ring on two feet
      var gx = 336, gy = by(336);
      var guide = '<path class="t-metal" d="M' + (gx - 16) + " " + n(gy + 3) + "L" + (gx - 2) + " " + n(gy + 26) + "M" + (gx + 14) + " " + n(gy + 3) + "L" + (gx + 4) + " " + n(gy + 24) + '" style="fill:none;stroke-width:2.2"/>' +
        '<ellipse class="t-ring" cx="' + gx + '" cy="' + n(gy + 31) + '" rx="5" ry="9.6"/>';
      var lineD = "M238 128C276 116 306 " + n(gy + 30) + " " + gx + " " + n(gy + 31) + "S410 " + n(by(430) + 9) + " 446 " + n(by(446) + 6);
      return '<defs><linearGradient id="' + id + '-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--t-cork2)"/><stop offset=".45" style="stop-color:var(--t-cork)"/><stop offset="1" style="stop-color:var(--t-cork3)"/></linearGradient>' +
        '<linearGradient id="' + id + '-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--t-metal2)"/><stop offset=".5" style="stop-color:var(--t-metal)"/><stop offset="1" style="stop-color:var(--t-metal3)"/></linearGradient>' +
        '<clipPath id="' + id + '-k"><path d="' + cork1 + cork2 + '"/></clipPath></defs>' +
        '<g class="fp fp-rod"' + grain() + ' transform="rotate(-7 220 100)">' +
        '<path class="t-line" d="' + lineD + '"/>' + guide +
        '<path class="t-blank" d="' + blank + '"/><path class="t-blanklit" d="M240 ' + n(by(240) - 2.6) + "L446 " + n(by(446) - 1.4) + '"/>' +
        '<path d="' + stem + '" fill="url(#' + id + '-m)"/>' +
        '<path class="t-wire" d="' + bail + '"/>' +
        '<path d="' + rotor + '" fill="url(#' + id + '-m)"/><path class="ink thin" d="' + rotor + '"/>' +
        '<path class="t-spool" d="' + spool + '"/><path class="t-wound" d="' + wound + '"/><path class="ink thin" d="' + spool + '"/>' +
        '<path d="' + body + '" fill="url(#' + id + '-m)"/><path class="t-lit" d="M146 124C158 118 172 120 180 128" filter="url(#fp-b1)"/><path class="ink thin" d="' + body + '"/>' +
        '<path class="t-wire thick" d="' + arm + '"/><path class="t-knob" d="' + knob + '"/><path class="ink thin" d="' + knob + '"/><circle class="t-knob" cx="158" cy="138" r="5"/>' +
        '<path class="t-seat" d="' + seat + '"/><path d="' + hoods + '" fill="url(#' + id + '-m)"/>' +
        '<path d="' + cork1 + cork2 + '" fill="url(#' + id + '-c)"/><g clip-path="url(#' + id + '-k)"><path class="t-speck" d="' + speck + '"/>' +
          '<path class="t-lit" d="M36 ' + n(by(36) - 5) + "L122 " + n(by(122) - 5) + "M198 " + n(by(198) - 4.4) + "L236 " + n(by(236) - 3.6) + '" filter="url(#fp-b1)"/></g>' +
        '<path class="ink thin" d="' + cork1 + cork2 + '"/><path class="t-seat" d="' + cap + '"/><path class="ink thin" d="' + cap + '"/>' +
        "</g>";
    }
  };

  // An improved clinch, snugged down on a hook: five turns round the standing
  // line, the tag end tucked back and trimmed.
  S.knot = {
    box: "0 0 440 190", name: "Improved clinch knot", latin: "",
    draw: function () {
      var id = "fpknot", k;
      // the hook: eye, shank, bend, point and barb
      var eye = [150, 96];
      var shank = "M" + (eye[0] - 9) + " " + eye[1] + "H78C44 96 30 114 34 134C38 154 62 160 78 146C84 140 88 132 88 122";
      var barb = "M88 122L80 132";
      // the standing line off to the right, and the turns round it
      var stand = "M" + (eye[0] + 6) + " " + eye[1] + "C230 96 330 92 446 84";
      var wraps = "", lit = "", edge = "";
      for (k = 0; k < 5; k++) {
        var wx = 190 + k * 15.5;
        var d = "M" + n(wx - 5) + " " + n(84) + "C" + n(wx + 2) + " " + n(86) + " " + n(wx + 6) + " " + n(100) + " " + n(wx + 3) + " " + n(108);
        wraps += d; edge += d;
        lit += "M" + n(wx - 3) + " " + n(86.4) + "C" + n(wx + 2) + " " + n(88.6) + " " + n(wx + 4.4) + " " + n(95) + " " + n(wx + 3.6) + " " + n(99);
      }
      var lead = "M" + (eye[0] + 5) + " " + (eye[1] + 3) + "C166 104 176 108 186 108";      // from the eye into the first turn
      var tag = "M262 86C246 74 214 70 186 76C176 78 170 84 168 90M168 90L156 70";              // back over the turns, tucked, and out
      return '<defs><linearGradient id="' + id + '-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--t-metal2)"/><stop offset=".5" style="stop-color:var(--t-metal)"/><stop offset="1" style="stop-color:var(--t-metal3)"/></linearGradient></defs>' +
        '<g class="fp fp-knot"' + grain() + ' transform="rotate(-4 220 100)">' +
        '<path class="t-hooksh" d="' + shank + '" transform="translate(2 4)" filter="url(#fp-b3)"/>' +
        '<path class="t-hook" d="' + shank + barb + '"/><path class="t-hooklit" d="M' + (eye[0] - 12) + " " + (eye[1] - 1.6) + 'H80C56 94.4 42 106 40 120"/>' +
        '<circle class="t-eye" cx="' + eye[0] + '" cy="' + eye[1] + '" r="8.6"/><circle class="t-eyelit" cx="' + eye[0] + '" cy="' + eye[1] + '" r="8.6"/>' +
        '<path class="t-cord-e" d="' + stand + lead + '"/><path class="t-cord" d="' + stand + lead + '"/><path class="t-cord-l" d="M160 94.4C232 94 330 90 446 82.2"/>' +
        '<path class="t-tag-e" d="' + tag + '"/><path class="t-tag" d="' + tag + '"/>' +
        '<path class="t-cord-e" d="' + edge + '"/><path class="t-cord" d="' + wraps + '"/><path class="t-cord-l" d="' + lit + '"/>' +
        "</g>";
    }
  };


  // A J hook on its own, the line snelled to it and running off the top: the
  // Unhooking guide's picture. Eye, shank, a deep bend, the point and its barb.
  S.hook = {
    box: "-50 4 430 188", name: "Hook", latin: "",
    draw: function () {
      var id = "fphook";
      var shank = "M196 34V118C196 160 166 176 136 176C104 176 86 156 86 128C86 112 92 102 100 96";
      var barb = "M100 96L92 112";
      var line = "M196 22C200 12 214 6 236 4C268 1 330 0 420 -8";
      return '<defs><linearGradient id="' + id + '-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--t-metal2)"/><stop offset=".5" style="stop-color:var(--t-metal)"/><stop offset="1" style="stop-color:var(--t-metal3)"/></linearGradient></defs>' +
        '<g class="fp fp-hook"' + grain() + ' transform="rotate(12 150 96)">' +
        '<path class="t-hooksh" d="' + shank + '" transform="translate(3 6)" filter="url(#fp-b3)"/>' +
        // a dark edge under the steel, so the hook holds its shape on the pale bench
        '<path class="t-hooksh" d="' + shank + barb + '" style="opacity:.35;stroke-width:10"/>' +
        '<path class="t-hook" d="' + shank + barb + '" style="stroke-width:7"/><path class="t-hooklit" d="M192.4 40V118C192.4 152 170 168 140 170"/>' +
        '<circle class="t-eye" cx="196" cy="24" r="10"/><circle class="t-eyelit" cx="196" cy="24" r="10"/>' +
        '<path class="t-cord-e" d="' + line + '"/><path class="t-cord" d="' + line + '"/><path class="t-cord-l" d="M200 18C214 8 236 6 268 -1C330 -4 380 -6 420 -11"/>' +
        "</g>";
    }
  };

  // ---- the plates, by name -------------------------------------------------
  // The filters every plate shares live once in the page, in a hidden svg.
  function defs() {
    if (typeof document === "undefined" || document.getElementById("fp-defs") || !document.body) return;
    var box = 'filterUnits="userSpaceOnUse" x="-30" y="-30" width="500" height="340"';
    var d = document.createElement("div");
    d.innerHTML = '<svg id="fp-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      '<filter id="fp-b05" ' + box + '><feGaussianBlur stdDeviation=".5"/></filter>' +
      '<filter id="fp-b1" ' + box + '><feGaussianBlur stdDeviation="1.1"/></filter>' +
      '<filter id="fp-b3" ' + box + '><feGaussianBlur stdDeviation="2.6"/></filter>' +
      '<filter id="fp-b4" ' + box + '><feGaussianBlur stdDeviation="4"/></filter>' +
      '<filter id="fp-b6" ' + box + '><feGaussianBlur stdDeviation="6"/></filter>' +
      // uneven pigment: the darker pools a wash leaves as it dries
      '<filter id="fp-blot" filterUnits="userSpaceOnUse" x="0" y="0" width="440" height="270" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".024 .055" numOctaves="3" seed="3"/>' +
        '<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.4 -1.05"/></filter>' +
      // paper tooth and a slight waver in every edge, so nothing reads as ruled
      '<filter id="fp-grain" x="-4%" y="-10%" width="108%" height="120%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="5" result="n"/>' +
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .8 -.34" result="g"/>' +
        '<feComposite in="g" in2="SourceAlpha" operator="in" result="gi"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency=".035 .07" numOctaves="2" seed="8" result="lo"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="lo" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
        '<feMerge><feMergeNode in="d"/><feMergeNode in="gi"/></feMerge></filter>' +
      "</defs></svg>";
    document.body.insertBefore(d.firstChild, document.body.firstChild);
  }
  // Which drawing stands for a species in the library (rigs/content.js ids).
  // (rod and knot are tackle: the Learn tab's tiles ask for them by name.)
  var OF = { clams: "clam", trout: "rainbow" };
  var made = {};
  RIG.fish = {
    kinds: Object.keys(S),
    of: function (id) { var k = OF[id] || id; return S[k] ? k : ""; },
    name: function (k) { return S[k] ? S[k].name : ""; },
    latin: function (k) { return S[k] ? S[k].latin : ""; },
    svg: function (kind, o) {
      o = o || {};
      var s = S[kind];
      if (!s) return "";
      defs();
      var key = kind + (o.lite ? "~" : ""), inner = made[key];
      if (!inner) {
        LITE = !!o.lite;
        try { inner = made[key] = s.draw(); } finally { LITE = false; }
      }
      var b = s.box.split(" ");
      return '<svg class="plate fp-' + kind + (o.lite ? " lite" : "") + (o.cls ? " " + o.cls : "") + '" viewBox="' + s.box + '" width="' + b[2] + '" height="' + b[3] +
        '" role="img" aria-label="' + s.name + '">' + inner + "</svg>";
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
