/* Rig Card look: Chart room.
   Draws the charts, the soundings and the tide curves. Everything is built
   once per screen from seeded noise, as inline SVG. No canvas loops, no images.
   The only canvas use is a one-off mask to measure distance from shore. */
(function () {
  "use strict";
  var D = document, HTML = D.documentElement, RIG = window.RIG;
  var SKIES = ["night", "firstLight", "dawn", "overcast", "rain", "bright", "golden", "dusk"];
  var SCREENS = ["trips", "card", "crew"];
  var TAU = Math.PI * 2;
  var SUNRISE = 7.47, SUNSET = 16.38; // 7:28 AM and 4:23 PM, late November

  /* ---------- small tools ---------- */
  function $(s, el) { return (el || D).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || D).querySelectorAll(s)); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function xy(p) { return r1(p[0]) + "," + r1(p[1]); }
  function mid(a, b) { return r1((a[0] + b[0]) / 2) + "," + r1((a[1] + b[1]) / 2); }

  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Three octaves of value noise, 0 to 1.
  function fbm(seed) {
    var r = rng(seed), p = [], g = [], i;
    for (i = 0; i < 256; i++) { p[i] = i; g[i] = r(); }
    for (i = 255; i > 0; i--) { var j = (r() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
    function v(ix, iy) { return g[p[(ix + p[iy & 255]) & 255]]; }
    function n(x, y) {
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      var u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
      var a = v(ix, iy), b = v(ix + 1, iy), c = v(ix, iy + 1), e = v(ix + 1, iy + 1);
      return a + (b - a) * u + (c - a) * w + (a - b - c + e) * u * w;
    }
    return function (x, y) { return (n(x, y) + 0.5 * n(x * 2.03 + 11.3, y * 2.03 + 4.7) + 0.25 * n(x * 4.01 + 3.1, y * 4.01 + 9.2)) / 1.75; };
  }

  // Catmull-Rom through hand-placed points, as a cubic path.
  function spline(P, closed) {
    var n = P.length, s = "M" + xy(P[0]), m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 > n - 1) p3 = p2; }
      s += "C" + xy([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + " " +
        xy([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + " " + xy(p2);
    }
    return s + (closed ? "Z" : "");
  }
  function sample(P, per) {
    var out = [], n = P.length;
    function c(a, b, e, f, t) { return 0.5 * (2 * b + (e - a) * t + (2 * a - 5 * b + 4 * e - f) * t * t + (3 * b - a - 3 * e + f) * t * t * t); }
    for (var i = 0; i < n - 1; i++) {
      var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
      for (var k = 0; k < per; k++) out.push([c(p0[0], p1[0], p2[0], p3[0], k / per), c(p0[1], p1[1], p2[1], p3[1], k / per)]);
    }
    out.push(P[n - 1]);
    return out;
  }
  function poly(P, closed) { return "M" + P.map(xy).join("L") + (closed ? "Z" : ""); }

  /* ---------- contours: marching squares over a grid ---------- */
  // Returns closed loops, in grid units, around every region where f >= L.
  // The caller keeps the outer ring of the grid below L so loops always close.
  function iso(f, nx, ny, L) {
    var pts = {}, adj = {}, i, j;
    function P(i, j, h) {
      var id = (j * nx + i) * 2 + (h ? 0 : 1);
      if (!(id in pts)) {
        var a = f[j * nx + i], b = h ? f[j * nx + i + 1] : f[(j + 1) * nx + i], t = (L - a) / (b - a);
        pts[id] = h ? [i + t, j] : [i, j + t];
        adj[id] = [];
      }
      return id;
    }
    function link(a, b) { adj[a].push(b); adj[b].push(a); }
    for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      var k = j * nx + i;
      var c = (f[k] >= L ? 8 : 0) | (f[k + 1] >= L ? 4 : 0) | (f[k + nx + 1] >= L ? 2 : 0) | (f[k + nx] >= L ? 1 : 0);
      if (c === 0 || c === 15) continue;
      // P(i,j,1) top, P(i,j+1,1) bottom, P(i,j,0) left, P(i+1,j,0) right
      switch (c) {
        case 1: case 14: link(P(i, j, 0), P(i, j + 1, 1)); break;
        case 2: case 13: link(P(i, j + 1, 1), P(i + 1, j, 0)); break;
        case 3: case 12: link(P(i, j, 0), P(i + 1, j, 0)); break;
        case 4: case 11: link(P(i, j, 1), P(i + 1, j, 0)); break;
        case 6: case 9: link(P(i, j, 1), P(i, j + 1, 1)); break;
        case 7: case 8: link(P(i, j, 1), P(i, j, 0)); break;
        case 5: link(P(i, j, 1), P(i + 1, j, 0)); link(P(i, j, 0), P(i, j + 1, 1)); break;
        case 10: link(P(i, j, 1), P(i, j, 0)); link(P(i, j + 1, 1), P(i + 1, j, 0)); break;
      }
    }
    var seen = {}, out = [];
    for (var id in adj) {
      if (seen[id]) continue;
      var loop = [], cur = id;
      while (cur != null && !seen[cur]) {
        seen[cur] = 1; loop.push(pts[cur]);
        var nb = adj[cur], nxt = null;
        for (var q = 0; q < nb.length; q++) if (!seen[nb[q]]) { nxt = nb[q]; break; }
        cur = nxt;
      }
      if (loop.length > 5) out.push(loop);
    }
    return out;
  }
  // One loop as a soft closed curve, in drawing units.
  function loopD(loop, F, keep) {
    var n = loop.length, P = [], i;
    for (i = 0; i < n; i++) {
      var a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
      if (keep > 1 && i % keep) continue;
      P.push([F.ox + F.cs * (a[0] + 2 * b[0] + c[0]) / 4, F.oy + F.cs * (a[1] + 2 * b[1] + c[1]) / 4]);
    }
    n = P.length;
    if (n < 3) return "";
    var s = "M" + mid(P[n - 1], P[0]);
    for (i = 0; i < n; i++) s += "Q" + xy(P[i]) + " " + mid(P[i], P[(i + 1) % n]);
    return s + "Z";
  }

  // Exact distance transform (Felzenszwalb). mask 1 marks the source cells.
  function edt(mask, nx, ny) {
    var INF = 1e20, g = new Float64Array(nx * ny), n = Math.max(nx, ny), i, j;
    var f = new Float64Array(n), dd = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    function pass(len) {
      var k = 0, q, s, p;
      v[0] = 0; z[0] = -INF; z[1] = INF;
      for (q = 1; q < len; q++) {
        do { p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); } while (s <= z[k] && --k >= 0);
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      for (k = 0, q = 0; q < len; q++) { while (z[k + 1] < q) k++; p = v[k]; dd[q] = (q - p) * (q - p) + f[p]; }
    }
    for (i = 0; i < nx; i++) {
      for (j = 0; j < ny; j++) f[j] = mask[j * nx + i] ? 0 : INF;
      pass(ny);
      for (j = 0; j < ny; j++) g[j * nx + i] = dd[j];
    }
    for (j = 0; j < ny; j++) {
      for (i = 0; i < nx; i++) f[i] = g[j * nx + i];
      pass(nx);
      for (i = 0; i < nx; i++) g[j * nx + i] = Math.sqrt(dd[i]);
    }
    return g;
  }

  // Rasterise the land once, then measure every cell's distance to shore.
  function field(o) {
    var cs = o.cs || 2, pad = 5, nx = Math.ceil(o.w / cs) + 1 + pad * 2, ny = Math.ceil(o.h / cs) + 1 + pad * 2;
    var cv = D.createElement("canvas"); cv.width = nx; cv.height = ny;
    var cx = cv.getContext("2d", { willReadFrequently: true });
    cx.setTransform(1 / cs, 0, 0, 1 / cs, pad + 0.5, pad + 0.5);
    cx.fillStyle = "#000";
    o.land.forEach(function (p) { cx.fill(new Path2D(p)); });
    var im = cx.getImageData(0, 0, nx, ny).data, land = new Uint8Array(nx * ny), sea = new Uint8Array(nx * ny);
    for (var k = 0; k < nx * ny; k++) { land[k] = im[k * 4 + 3] > 127 ? 1 : 0; sea[k] = 1 - land[k]; }
    var F = { w: o.w, h: o.h, cs: cs, nx: nx, ny: ny, ox: -pad * cs, oy: -pad * cs, land: land, toLand: edt(land, nx, ny), toSea: edt(sea, nx, ny) };
    F.grid = function (fn) {
      var f = new Float32Array(nx * ny);
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
        var q = j * nx + i, edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
        f[q] = edge ? 0 : fn(F.ox + i * cs, F.oy + j * cs, q);
      }
      return f;
    };
    F.at = function (f, x, y) {
      var i = Math.round((x - F.ox) / cs), j = Math.round((y - F.oy) / cs);
      return i < 0 || j < 0 || i >= nx || j >= ny ? 0 : f[j * nx + i];
    };
    return F;
  }

  // Cut-paper bathymetry. Deepest sheet at the bottom; every shallower sheet
  // is one piece of paper with the deeper water cut out of it, and it throws
  // a shadow down and to the right onto the sheet below.
  function bathy(F, depth, levels, flats) {
    var rect = "M-12,-12H" + (F.w + 12) + "V" + (F.h + 12) + "H-12Z", n = levels.length, k;
    var s = '<rect style="fill:var(--deep)" x="-2" y="-2" width="' + (F.w + 4) + '" height="' + (F.h + 4) + '"/>';
    for (k = n - 1; k >= 0; k--) {
      var d = rect;
      iso(depth, F.nx, F.ny, levels[k]).forEach(function (lp) { d += loopD(lp, F, 2); });
      var pct = Math.round(100 * Math.pow(k / n, 1.25));
      s += '<path class="lyr" style="fill:color-mix(in oklab,var(--deep) ' + pct + '%,var(--shoal))" fill-rule="evenodd" filter="url(#lf1)" d="' + d + '"/>';
    }
    if (flats) { // the strip that dries at low water, green on a real chart
      var fd = rect;
      iso(depth, F.nx, F.ny, flats).forEach(function (lp) { fd += loopD(lp, F, 2); });
      s += '<path class="flat" fill-rule="evenodd" d="' + fd + '"/>';
    }
    return s;
  }
  function inKeep(keep, x, y) {
    for (var i = 0; i < keep.length; i++) {
      var k = keep[i];
      if (k.length === 4) { if (x > k[0] && x < k[2] && y > k[1] && y < k[3]) return true; }
      else { // [x1,y1,x2,y2,r] a fat line
        var dx = k[2] - k[0], dy = k[3] - k[1], t = Math.max(0, Math.min(1, ((x - k[0]) * dx + (y - k[1]) * dy) / (dx * dx + dy * dy)));
        var ex = x - k[0] - t * dx, ey = y - k[1] - t * dy;
        if (ex * ex + ey * ey < k[4] * k[4]) return true;
      }
    }
    return false;
  }
  // Depth figures, read off the same field the contours came from.
  function soundings(F, depth, o) {
    var s = "", x, y;
    for (y = o.step * 0.55; y < F.h; y += o.step) for (x = o.step * 0.5; x < F.w; x += o.step) {
      var px = x + (o.rnd() - 0.5) * o.step * 0.46, py = y + (o.rnd() - 0.5) * o.step * 0.6, v = F.at(depth, px, py);
      if (!(v >= o.min) || inKeep(o.keep || [], px, py)) continue;
      s += '<text x="' + r1(px) + '" y="' + r1(py) + '">' + Math.round(v * o.scale) + "</text>";
    }
    return '<g class="snd" text-anchor="middle">' + s + "</g>";
  }
  // Brown land contours that climb away from the shore.
  function topo(F, N, levels, rise, relief, scale) {
    var g = F.grid(function (x, y, q) {
      if (!F.land[q]) return 0;
      var d = F.toSea[q] * F.cs;
      return d * rise + relief * N(x / scale, y / scale) * Math.min(1, d / 12);
    }), d = "";
    levels.forEach(function (lv) { iso(g, F.nx, F.ny, lv).forEach(function (lp) { if (lp.length > 22) d += loopD(lp, F, 3); }); });
    return '<path class="topo" d="' + d + '"/>';
  }

  /* ---------- compass rose ---------- */
  function rose(cx, cy, r, mag, labels) {
    function ring(rad, n, len, w) {
      var c = TAU * rad;
      return '<circle r="' + r2(rad) + '" stroke-width="' + r2(len) + '" stroke-dasharray="' + r2(w) + " " + r2(c / n - w) + '" stroke-dashoffset="' + r2(w / 2) + '"/>';
    }
    var hair = Math.max(0.4, r * 0.012), s = '<g class="rose" transform="translate(' + cx + "," + cy + ')">';
    s += '<circle r="' + r + '" stroke-width="' + r2(hair) + '"/>';
    s += ring(r - r * 0.035, 72, r * 0.07, hair) + ring(r - r * 0.06, 36, r * 0.12, hair * 1.2) + ring(r - r * 0.095, 12, r * 0.19, hair * 1.9);
    s += '<path class="fillc" d="M0,' + r2(-r * 1.24) + "L" + r2(r * 0.075) + "," + r2(-r * 1.03) + "L0," + r2(-r * 1.08) + "L" + r2(-r * 0.075) + "," + r2(-r * 1.03) + 'Z"/>';
    if (labels) {
      for (var a = 0; a < 360; a += 30) s += '<text text-anchor="middle" font-size="' + r2(r * 0.105) + '" transform="rotate(' + a + ") translate(0," + r2(-r * 0.72) + ')">' + a + "</text>";
    }
    var ri = r * 0.6;
    s += '<g transform="rotate(' + mag + ')"><circle r="' + r2(ri) + '" stroke-width="' + r2(hair) + '"/>' +
      ring(ri - ri * 0.05, 36, ri * 0.1, hair) + ring(ri - ri * 0.09, 12, ri * 0.18, hair * 1.6) +
      '<path stroke-width="' + r2(hair * 1.5) + '" d="M0,' + r2(ri * 0.82) + "V" + r2(-ri * 0.82) + "l" + r2(ri * 0.11) + "," + r2(ri * 0.2) + '"/></g>';
    s += '<path stroke-width="' + r2(hair) + '" d="M' + r2(-r * 0.2) + ",0H" + r2(r * 0.2) + "M0," + r2(-r * 0.2) + "V" + r2(r * 0.2) + '"/>';
    return s + "</g>";
  }

  /* ---------- spot marks and paper labels ---------- */
  function mark(x, y, good, pulse) {
    return '<g class="mk' + (good ? " good" : "") + '" transform="translate(' + x + "," + y + ')">' +
      (pulse ? '<circle class="pulse" r="5.5"/>' : "") +
      (good ? "" : '<circle class="halo" r="8.5"/>') +
      '<circle class="c" r="' + (good ? 4 : 4.6) + '"/><circle class="p" r="1.5"/></g>';
  }
  // A label on its own slip of paper with a leader back to the mark.
  function tag(x, y, txt, good, lead, arrow) {
    var w = Math.round(txt.length * 6.1 + 22 + (arrow ? 12 : 0));
    return '<g class="tg' + (good ? " good" : "") + '">' +
      (lead ? '<path class="ld" d="M' + lead[0] + "," + lead[1] + "L" + lead[2] + "," + lead[3] + '"/>' : "") +
      '<g filter="url(#lf3)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="17" rx="1.5"/></g>' +
      (arrow ? '<path class="ld" style="stroke-width:1.3" d="M' + (x + 14) + "," + (y + 8.5) + "H" + (x + 5) + "m3.4,-3.2l-3.4,3.2l3.4,3.2" + '"/>' : "") +
      '<circle class="pip" cx="' + (x + 8.5 + (arrow ? 12 : 0)) + '" cy="' + (y + 8.5) + '" r="2.6"/>' +
      '<text x="' + (x + 15 + (arrow ? 12 : 0)) + '" y="' + (y + 12.4) + '">' + txt.toUpperCase() + "</text></g>";
  }
  // A name printed on the water. The water is cleared to a pale patch behind it,
  // the way a printed chart breaks its linework around lettering.
  function wname(x, y, rot, txt, cls) {
    return '<g class="nm" transform="translate(' + x + "," + y + ")" + (rot ? " rotate(" + rot + ")" : "") + '">' +
      '<rect class="clr" filter="url(#soft)" x="-5" y="-8.6" width="' + Math.round(txt.length * 6.6 + 8) + '" height="12.4" rx="3"/>' +
      '<text class="' + (cls || "wn") + '">' + txt + "</text></g>";
  }
  // Tags are drawn from a guess at the text width; true them up once fonts are in.
  function fitTags(svg) {
    $$(".tg", svg).forEach(function (g) {
      var t = $("text", g), r = $("rect", g);
      var len = t.getComputedTextLength();
      if (len > 0) r.setAttribute("width", r1(+t.getAttribute("x") - +r.getAttribute("x") + len + 6));
    });
    $$(".nm", svg).forEach(function (g) {
      var len = $("text", g).getComputedTextLength();
      if (len > 0) $("rect", g).setAttribute("width", r1(len + 8));
    });
  }

  /* ---------- chart 1: the South Sound, for the week ---------- */
  function sound() {
    var svg = $("#soundchart"), W = 344, Ht = 268, DX = -20, N = fbm(5), N2 = fbm(23), R = rng(11);
    function sh(P) { return P.map(function (p) { return [p[0] + DX, p[1]]; }); }
    // Hand-placed shorelines, north up. Tacoma and the mainland, the Gig Harbor
    // side, Fox and McNeil islands, and Vashon with Maury hung off its east side.
    var MAIN = [[187, -14], [190, 6], [194, 15], [197, 30], [198, 44], [196, 58], [188, 66], [176, 72], [168, 73], [161, 79], [153, 80], [144, 81], [136, 86], [127, 93], [134, 101], [147, 108], [159, 114], [170, 121], [163, 126], [153, 128], [143, 129], [136, 133], [131, 138], [123, 131], [114, 125], [107, 119], [101, 113], [94, 104], [87, 97], [78, 90], [70, 86], [65, 86], [64, 93], [66, 101], [68, 113], [69, 127], [66, 140], [61, 152], [57, 165], [53, 180], [49, 194], [43, 206], [37, 217], [32, 236], [27, 258], [24, 310], [392, 310], [392, -14]];
    var KITSAP = [[65, -14], [64, 10], [65, 30], [65, 47], [63, 60], [57, 70], [52, 76], [47, 78], [50, 82], [55, 87], [57, 100], [58, 115], [56, 127], [51, 138], [45, 142], [40, 138], [33, 131], [23, 125], [12, 119], [0, 114], [-14, 112], [-14, -14]];
    var FOX = [[-14, 122], [3, 119], [15, 123], [27, 131], [37, 140], [42, 149], [39, 155], [29, 152], [17, 146], [5, 138], [-14, 133]];
    var MCNEIL = [[-14, 165], [8, 164], [20, 171], [26, 181], [22, 192], [10, 197], [-14, 198]];
    var KETRON = [[20, 216], [26, 213], [30, 220], [29, 231], [23, 235], [18, 226]];
    var VASHON = [[76, -14], [77, 10], [78, 30], [79, 47], [82, 60], [87, 68], [91, 71], [97, 73], [101, 70], [103, 62], [105, 46], [107, 30], [109, 17], [117, 9], [129, 12], [127, 22], [121, 36], [117, 50], [118, 60], [122, 64], [132, 58], [146, 47], [157, 36], [167, 25], [169, 21], [161, 14], [149, 8], [139, 3], [137, -14]];
    var LAND = [MAIN, KITSAP, FOX, MCNEIL, KETRON, VASHON].map(function (P) { return spline(sh(P), true); }), landD = LAND.join("");
    var F = field({ w: W, h: Ht, land: LAND, cs: 2 });
    var depth = F.grid(function (x, y, q) { return F.toLand[q] * F.cs * (0.58 + 0.84 * N(x / 62, y / 62)); });

    var s = bathy(F, depth, [2.9, 6.2, 10.4, 15.6]);
    s += soundings(F, depth, { step: 14, min: 6.2, scale: 3.6, rnd: R,
      keep: [[139, 73, 166, 8, 9], [66, 98, 104, 124], [112, 68, 146, 94], [0, 226, 100, 254]] });
    s += wname(141, 72, -68, "Puget Sound");
    s += '<path class="ferry" d="M48,87L70,73"/>';
    s += '<path class="land" filter="url(#lf2)" d="' + landD + '"/>';
    s += '<clipPath id="c-snd"><path d="' + landD + '"/></clipPath><g clip-path="url(#c-snd)">' +
      topo(F, N2, [1.4, 2.2, 3, 3.8, 4.6, 5.4], 0.05, 3.1, 46) + rose(22, 45, 18.5, 15.5, false) + "</g>";
    s += '<path class="coast" d="' + landD + '"/>';
    // graticule and its edge figures
    s += '<path class="grat" d="M53.4,0V' + Ht + "M150.8,0V" + Ht + "M248.1,0V" + Ht + "M0,70.6H" + W + "M0,142.4H" + W + "M0,214.2H" + W + '"/>';
    s += '<text class="mt" x="3" y="68">47&#176;20&#8242;N</text>' +
      '<text class="mt" x="56" y="8">122&#176;30&#8242;W</text>';
    // fresh water
    var GREEN = [[346, 123], [325, 117], [307, 112], [290, 104], [276, 100], [266, 99], [255, 98], [243, 95], [235, 86], [228, 73], [224, 55], [220, 40], [219, 30], [221, 14], [223, -5]];
    var PUY = [[123, 129], [132, 136], [144, 145], [156, 155], [170, 166], [184, 178], [196, 188], [212, 190], [228, 186], [236, 196], [242, 210], [247, 232], [253, 252], [258, 296]];
    var TAPPS = [[260, 140], [270, 137], [278, 143], [276, 152], [284, 158], [282, 170], [273, 174], [268, 166], [261, 168], [257, 158], [263, 151]];
    s += '<path class="riv" d="' + spline(GREEN, false) + '"/><path class="riv2" d="' + spline(GREEN, false) + '"/>';
    s += '<path class="riv" style="stroke-width:2" d="' + spline(PUY, false) + '"/><path class="riv2" style="stroke-width:1" d="' + spline(PUY, false) + '"/>';
    s += '<path class="lake" filter="url(#lf1)" d="' + spline(TAPPS, true) + '"/><path class="lake2" d="' + spline(TAPPS.map(function (p) { return [270 + (p[0] - 270) * 0.5, 156 + (p[1] - 156) * 0.5]; }), true) + '"/>';
    s += '<ellipse class="lake" cx="257" cy="203" rx="3.4" ry="2.2"/>';
    // names
    s += '<text class="pl" x="56" y="176">Tacoma</text>' +
      '<text class="pl" transform="translate(73,52) rotate(-84)">Vashon I</text>' +
      '<text class="pl" x="221" y="113">Auburn</text>' +
      '<text class="pl" x="150" y="207">Puyallup</text>' +
      '<text class="pl" x="266" y="206">Bonney Lake</text>' +
      '<text class="wn onl" style="letter-spacing:.2em" transform="translate(298,127) rotate(15)">Green R</text>' +
      '<text class="wn onl" style="letter-spacing:.2em" x="287" y="160">L Tapps</text>';
    // this week's spots
    s += mark(84, 110, false, true) + mark(126, 79, true) + mark(291, 104.5, false) + mark(257, 203, true);
    s += tag(62, 136, "Squid", false, [84, 115, 84, 136]) +
      tag(136, 86, "Cutthroat", true, [129, 82, 138, 88]) +
      tag(296, 80, "Chum", false, [292, 100, 300, 96]) +
      tag(194, 194, "Trout", true, [252, 203, 240, 203]) +
      tag(5, 231, "Razor clams", false, null, true);
    svg.innerHTML = s;
    fitTags(svg);
  }

  /* ---------- chart 2: Les Davis Pier, shore up ---------- */
  function pier() {
    var svg = $("#pierchart"), W = 344, Ht = 176, DY = 24, N = fbm(9), N2 = fbm(41), R = rng(31);
    var G0 = '<g transform="translate(0,' + DY + ')">', G1 = "</g>";
    // a wooded point on the left, a shallow cove, then the long sea wall
    var SHORE = [[-14, 64], [12, 62], [34, 61], [52, 66], [64, 76], [82, 84], [106, 87], [132, 86], [158, 89], [186, 93], [214, 92], [242, 93], [270, 97], [300, 101], [330, 100], [358, 102]].map(function (p) { return [p[0], p[1] + DY]; });
    var landD = spline(SHORE.concat([[372, 102 + DY], [372, 230], [-14, 230]]), true);
    var F = field({ w: W, h: Ht, land: [landD], cs: 2 });
    var depth = F.grid(function (x, y, q) { return F.toLand[q] * F.cs * (0.6 + 0.8 * N(x / 80, y / 52)); });
    function off(dy) { return spline(SHORE.map(function (p) { return [p[0], p[1] + dy]; }), false); }

    var s = bathy(F, depth, [4.5, 10, 17, 26, 37, 50, 65, 82], 2.3);
    s += soundings(F, depth, { step: 19, min: 10, scale: 1.25, rnd: R, keep: [[100, 32, 244, 124], [214, 12, 338, 30], [296, 30, 340, 70], [70, 86, 114, 108], [246, 94, 326, 120]] });
    // what is left of the old mill docks: rows of piles off the beach
    var piles = "";
    [[76, 74, 5, 9], [96, 76, 4, 11], [252, 84, 6, 8], [278, 86, 4, 12], [304, 89, 5, 9]].forEach(function (g) {
      for (var a = 0; a < g[2]; a++) for (var b = 0; b < 2; b++) if (R() > 0.22) piles += '<circle cx="' + r1(g[0] + a * 3.4 + b * 1.2) + '" cy="' + r1(g[1] - b * g[3] * 0.45 + a * 0.5) + '" r=".7"/>';
    });
    s += '<g class="piles" transform="translate(0,' + DY + ')">' + piles + "</g>";
    s += wname(222, 24, 0, "Commencement Bay");
    // light on the water: dashed sector rings by day, pools of lamp light at night
    var LAMPS = [[124, 37.6], [148, 39.8], [172, 42], [196, 44.2], [220, 46.4], [169.2, 66]];
    s += G0;
    LAMPS.forEach(function (p, i) {
      s += '<circle fill="url(#pool)" cx="' + p[0] + '" cy="' + (p[1] + 2) + '" r="' + (i === 5 ? 19 : 29) + '"/>';
    });
    s += '<path class="sector" d="M100,40A74,34 5 0 1 244,52"/><path class="sector" style="opacity:.45" d="M112,26A62,24 5 0 1 234,37"/>' + G1;
    s += '<path class="land" filter="url(#lf2)" d="' + landD + '"/>';
    // park trees on the point and along the walk: the same cut paper as the river woods
    var wood = F.grid(function (x, y, q) {
      if (!F.land[q]) return 0;
      var d = F.toSea[q] * F.cs;
      return d < 4 || d > 30 ? 0 : N2(x / 30, y / 30) + (x < 70 ? 0.16 : 0) + 0.1 * N(x / 7, y / 7);
    }), w1 = "", w2 = "";
    iso(wood, F.nx, F.ny, 0.5).forEach(function (lp) { w1 += loopD(lp, F, 2); });
    iso(wood, F.nx, F.ny, 0.6).forEach(function (lp) { w2 += loopD(lp, F, 2); });
    s += '<clipPath id="c-pier"><path d="' + landD + '"/></clipPath><g clip-path="url(#c-pier)">' + topo(F, N2, [1.6, 2.6, 3.6], 0.07, 2.2, 60) +
      '<path class="wood" filter="url(#lf1)" d="' + w1 + '"/><path class="wood wood2" filter="url(#lf1)" d="' + w2 + '"/>' +
      '<path class="rail2" d="' + off(25) + '"/><path class="rail" d="' + off(25) + '"/>' +
      '<path class="road" d="' + off(15) + '"/><path class="road2" d="' + off(15) + '"/>' +
      '<path class="rip" d="' + off(2.2) + '"/></g>';
    s += '<path class="coast" d="' + off(0) + '"/>';
    // the pier: a walk out from Ruston Way and a long head across the end
    var pile = "", x;
    for (x = 120; x <= 224; x += 6.5) pile += "M" + r1(x) + "," + r1(37.2 + (x - 120) * 0.0917 + 5.6) + "v3";
    s += G0 + '<g filter="url(#lf2)"><path class="pierc" stroke-width="6.5" d="M168.6,93L170.4,44"/><path class="pierc" stroke-width="10.5" d="M116,37L228,47.3"/></g>' +
      '<path class="pile" d="' + pile + '"/>' +
      '<path class="pierd" stroke-width="3.3" d="M168.7,90L170.3,46"/><path class="pierd" stroke-width="6.6" d="M118,37.2L226,47.1"/>' +
      '<path class="plank" stroke-width="6.6" d="M118,37.2L226,47.1"/><path class="plank" stroke-width="3.3" d="M168.7,90L170.3,51"/>';
    LAMPS.forEach(function (p) { s += '<circle class="lampd" cx="' + p[0] + '" cy="' + p[1] + '" r="2"/>'; });
    s += mark(174, 22, false) + G1;
    // north arrow: this inset is turned so the shore lies level
    s += '<g transform="translate(318,52) rotate(-46)"><path class="narr" d="M0,13V-13"/><path class="narrf" d="M0,-16l3.4,7.4l-3.4,-2l-3.4,2Z"/><path class="narr" d="M-3.4,13h6.8"/></g>' +
      wname(309, 33, 0, "N", "pl nohalo");
    s += '<text class="pl" style="font-size:6.5px" x="118" y="' + (111 + DY) + '">Ruston Way</text>';
    svg.innerHTML = s;
    fitTags(svg);
  }

  /* ---------- chart 3: a bend of the Green ---------- */
  function river() {
    var svg = $("#riverchart"), W = 344, Ht = 176, N = fbm(13), N2 = fbm(57);
    var C = sample([[372, 30], [334, 40], [298, 66], [258, 80], [218, 64], [182, 40], [146, 40], [112, 66], [78, 88], [40, 82], [-18, 56]].map(function (p) { return [p[0], p[1] + 14]; }), 7);
    var n = C.length, north = [], south = [], nrm = [], i;
    for (i = 0; i < n; i++) {
      var a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      var nx = -ty / l, ny = tx / l, w = 10.5 + 3.2 * Math.sin(i * 0.33 + 1) + 1.6 * Math.sin(i * 0.9);
      nrm.push([nx, ny, w]);
      north.push([C[i][0] + nx * w, C[i][1] + ny * w]);
      south.push([C[i][0] - nx * w, C[i][1] - ny * w]);
    }
    var bankN = poly(north.concat([[-18, -18], [376, -18]]), true), bankS = poly(south.concat([[-18, 230], [376, 230]]), true);
    var F = field({ w: W, h: Ht, land: [bankN, bankS], cs: 1.5 });
    var depth = F.grid(function (x, y, q) { return F.toLand[q] * F.cs * (0.55 + 0.9 * N(x / 34, y / 34)); });

    var s = bathy(F, depth, [2.2, 4.6, 7.2]);
    s += '<path class="land" filter="url(#lf2)" d="' + bankN + bankS + '"/>';
    // woods along the banks: two more sheets of paper, ragged at the edge
    var wood = F.grid(function (x, y, q) {
      if (!F.land[q]) return 0;
      var d = F.toSea[q] * F.cs;
      return d < 3.5 ? 0 : N2(x / 36, y / 36) - d / 210 + 0.1 * N(x / 7, y / 7);
    }), w1 = "", w2 = "";
    iso(wood, F.nx, F.ny, 0.43).forEach(function (lp) { w1 += loopD(lp, F, 2); });
    iso(wood, F.nx, F.ny, 0.53).forEach(function (lp) { w2 += loopD(lp, F, 2); });
    s += '<clipPath id="c-riv"><path d="' + bankN + bankS + '"/></clipPath><g clip-path="url(#c-riv)">' + topo(F, N2, [1.5, 2.4, 3.3, 4.2, 5.1], 0.075, 2.3, 44) +
      '<path class="wood" filter="url(#lf1)" d="' + w1 + '"/><path class="wood wood2" filter="url(#lf1)" d="' + w2 + '"/></g>';
    s += '<path class="coast" d="' + poly(north, false) + poly(south, false) + '"/>';
    // gravel bars on the inside of each bend
    var bars = "";
    for (i = 6; i < n - 6; i++) {
      var p0 = C[i - 4], p1 = C[i], p2 = C[i + 4];
      var z = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
      var zp = (C[i - 1][0] - C[i - 5][0]) * (C[i + 3][1] - C[i - 1][1]) - (C[i - 1][1] - C[i - 5][1]) * (C[i + 3][0] - C[i - 1][0]);
      var zn = (C[i + 1][0] - C[i - 3][0]) * (C[i + 5][1] - C[i + 1][1]) - (C[i + 1][1] - C[i - 3][1]) * (C[i + 5][0] - C[i + 1][0]);
      if (Math.abs(z) < 60 || Math.abs(z) < Math.abs(zp) || Math.abs(z) <= Math.abs(zn)) continue;
      var sg = z > 0 ? 1 : -1, outer = [], inner = [], span = 6;
      for (var k = -span; k <= span; k++) {
        var c = C[i + k], m = nrm[i + k], env = Math.pow(Math.cos(k / span * Math.PI / 2), 0.8);
        outer.push([c[0] + sg * m[0] * (m[2] + 0.6), c[1] + sg * m[1] * (m[2] + 0.6)]);
        inner.push([c[0] + sg * m[0] * (m[2] - 6.4 * env), c[1] + sg * m[1] * (m[2] - 6.4 * env)]);
      }
      bars += poly(outer.concat(inner.reverse()), true);
      i += 6;
    }
    s += '<g filter="url(#lf1)"><path class="bar-g" d="' + bars + '"/></g><path class="stp" d="' + bars + '"/>';
    // which way it runs
    var fi = 26, fc = C[fi], ft = [C[fi + 2][0] - C[fi - 2][0], C[fi + 2][1] - C[fi - 2][1]], ang = Math.atan2(ft[1], ft[0]) * 180 / Math.PI;
    s += '<g transform="translate(' + r1(fc[0]) + "," + r1(fc[1]) + ") rotate(" + r1(ang) + ')"><path class="flow" d="M-8,0H8M4,-3L8,0L4,3M-8,0l-2.6,-2.6M-5,0l-2.6,-2.6"/></g>';
    s += '<text class="wn onl" transform="translate(196,40) rotate(34)">Green River</text>';
    var mi = 38, mc = C[mi], mm = nrm[mi];
    s += mark(r1(mc[0] - mm[0] * (mm[2] - 1)), r1(mc[1] - mm[1] * (mm[2] - 1)), false);
    s += '<g transform="translate(22,24)"><path class="narr" d="M0,12V-10"/><path class="narrf" d="M0,-14l3.4,7.4l-3.4,-2l-3.4,2Z"/></g><text class="pl" x="28" y="15">N</text>';
    svg.innerHTML = s;
  }

  /* ---------- the tide: one curve for the whole week ---------- */
  // Mixed tide, the Puget Sound kind: two unequal highs and lows a day.
  // The shape is a stand-in; only Thursday's 5:15 PM high slack is a real figure.
  var tide = (function () {
    function raw(t) {
      return Math.cos(TAU * (t - 5.2) / 12.42) + 0.58 * Math.cos(TAU * (t - 8.2) / 23.93) + 0.36 * Math.cos(TAU * (t - 10.5) / 25.82);
    }
    var want = 24 + 17.25, best = want, gap = 1e9, t;
    for (t = want - 6; t < want + 6; t += 1 / 60) {
      if (raw(t) > raw(t - 1 / 60) && raw(t) >= raw(t + 1 / 60) && Math.abs(t - want) < gap) { gap = Math.abs(t - want); best = t; }
    }
    var slide = best - want;
    return function (t) { return raw(t + slide) / 1.95; }; // about -1 to 1
  })();
  function curve(t0, t1, X, Y, step) {
    var pts = [];
    for (var t = t0; t <= t1 + 1e-6; t += step) pts.push([X(t), Y(tide(t))]);
    return pts;
  }

  // Day header: the whole day's tide, standing behind the sheet. Dark hours are inked darker.
  function spark(svg) {
    var d = +svg.dataset.day, W = Math.round(svg.getBoundingClientRect().width) || 180, Ht = 40, t0 = d * 24, i;
    svg.setAttribute("viewBox", "0 0 " + W + " " + Ht);
    function X(t) { return (t - t0) / 24 * W; }
    function Y(v) { return 6 + (1 - (v + 1) / 2) * (Ht - 19); }
    var P = curve(t0, t0 + 24, X, Y, 0.25), id = "sp" + d, xr = r1(X(t0 + SUNRISE)), xs = r1(X(t0 + SUNSET));
    var s = '<clipPath id="' + id + '"><path d="' + poly(P.concat([[W, Ht], [0, Ht]]), true) + '"/></clipPath>' +
      '<g clip-path="url(#' + id + ')"><rect class="dy" width="' + W + '" height="' + Ht + '"/>' +
      '<rect class="nt" width="' + xr + '" height="' + Ht + '"/><rect class="nt" x="' + xs + '" width="' + r1(W - xs) + '" height="' + Ht + '"/>' +
      '<path class="sun" d="M' + xr + ",0V" + Ht + "M" + xs + ",0V" + Ht + '"/></g>' +
      '<path class="ln" d="' + poly(P, false) + '"/>';
    for (i = 2; i < P.length - 2; i++) if (P[i][1] < P[i - 1][1] && P[i][1] <= P[i + 1][1]) s += '<circle class="hi" cx="' + r1(P[i][0]) + '" cy="' + r1(P[i][1]) + '" r="2.1"/>';
    svg.innerHTML = s;
  }
  // Row window: when in the day this trip runs. Salt water reads the tide,
  // fresh water reads the light: a low winter sun over the horizon.
  function win(svg) {
    var d = +svg.dataset.day, a = +svg.dataset.from, b = +svg.dataset.to, light = svg.dataset.kind === "light";
    var W = 46, t0 = d * 24, x0 = 4, x1 = W - 4, hz = 23.5;
    function X(t) { return x0 + (t - t0) / 24 * (x1 - x0); }
    function Y(t) {
      if (!light) return 7.5 + (1 - (tide(t) + 1) / 2) * 17;
      var u = (t - t0 - SUNRISE) / (SUNSET - SUNRISE);
      return u <= 0 || u >= 1 ? hz : hz - 14 * Math.sin(Math.PI * u);
    }
    function run(ta, tb) { var p = []; for (var t = ta; t <= tb + 1e-6; t += 0.25) p.push([X(t), Y(t)]); return poly(p, false); }
    var s = '<clipPath id="w' + svg.dataset.i + '"><rect width="46" height="32" rx="4"/></clipPath><g clip-path="url(#w' + svg.dataset.i + ')">' +
      '<rect class="w" x="' + r1(X(t0 + a)) + '" y="0" width="' + r1(X(t0 + b) - X(t0 + a)) + '" height="32"/>';
    if (light) s += '<path class="hz" d="M0,' + hz + 'H46"/><path class="ln" d="' + run(t0 + SUNRISE, t0 + SUNSET) + '"/>';
    else s += '<path class="ln" d="' + run(t0, t0 + 24) + '"/><path class="sn" d="M' + r1(X(t0 + SUNRISE)) + ",29v3M" + r1(X(t0 + SUNSET)) + ',29v3"/>';
    s += '<path class="on" d="' + run(t0 + a, t0 + b) + '"/></g>';
    svg.innerHTML = s;
  }

  // Run card: the evening's tide, the slack, and the plan laid along the clock.
  function tideplot() {
    var svg = $("#tideplot"), W = 326, T0 = 24 + 14.5, T1 = 24 + 23, top = 30, base = 97, lo = 9, hi = -9, t;
    for (t = T0; t <= T1; t += 0.1) { lo = Math.min(lo, tide(t)); hi = Math.max(hi, tide(t)); }
    function X(t) { return 6 + (t - T0) / (T1 - T0) * (W - 12); }
    function Y(v) { return top + 8 + (1 - (v - lo) / (hi - lo)) * (base - top - 26); }
    var P = curve(T0, T1, X, Y, 1 / 6), Pw = curve(24 + 17, 24 + 22, X, Y, 1 / 6);
    var P2 = P.map(function (p) { return [p[0], Math.min(base, p[1] + 12)]; });
    var xs = X(24 + 17.25), ys = Y(tide(24 + 17.25)), xa = X(24 + 17), xb = X(24 + 22), xl = X(24 + 15 + 58 / 60);
    var s = "", h, by = base + 7;
    for (h = 15; h <= 23; h++) s += '<path class="gd" d="M' + r1(X(24 + h)) + "," + (top - 6) + "V" + base + '"/>';
    s += '<path class="ar1" d="' + poly(P.concat([[X(T1), base], [X(T0), base]]), true) + '"/>';
    s += '<path class="ar2" d="' + poly(P2.concat([[X(T1), base], [X(T0), base]]), true) + '"/>';
    s += '<path class="wn" d="' + poly(Pw.concat([[xb, base], [xa, base]]), true) + '"/><path class="ht" d="' + poly(Pw.concat([[xb, base], [xa, base]]), true) + '"/>';
    s += '<path class="ln" d="' + poly(P, false) + '"/>';
    s += '<path class="ax" d="M' + X(T0) + "," + base + "H" + X(T1) + '"/>';
    // high slack
    s += '<path class="lead" d="M' + r1(xs) + "," + r1(ys - 6) + "V" + 16 + '"/>' +
      '<circle class="ring" cx="' + r1(xs) + '" cy="' + r1(ys) + '" r="4.5"/><circle class="dot" cx="' + r1(xs) + '" cy="' + r1(ys) + '" r="3.4"/>' +
      '<text class="cap" x="' + r1(xs + 7) + '" y="13">HIGH SLACK 5:15 PM</text>';
    // the plan: leave, drive, fish
    s += '<path class="drive" d="M' + r1(xl + 5) + "," + (by + 6.5) + "H" + r1(xa - 3) + '"/>' +
      '<circle class="dot" cx="' + r1(xl) + '" cy="' + (by + 6.5) + '" r="3"/>' +
      '<text class="now" text-anchor="end" x="' + r1(xl - 7) + '" y="' + (by + 10.6) + '">LEAVE</text>' +
      '<rect class="fishbar" x="' + r1(xa) + '" y="' + by + '" width="' + r1(xb - xa) + '" height="13" rx="2"/>' +
      '<text class="on-bar" x="' + r1(xa + 8) + '" y="' + (by + 10.4) + '">FISH</text>';
    for (h = 15; h <= 23; h += 2) s += '<path class="tk" d="M' + r1(X(24 + h)) + "," + base + 'v4"/>' +
      '<text text-anchor="' + (h === 23 ? "end" : "middle") + '" x="' + r1(X(24 + h) + (h === 23 ? 5 : 0)) + '" y="' + (by + 31) + '">' + (h - 12) + " PM</text>";
    svg.innerHTML = s;
  }

  // Crew trip: the river came up and is on its way back down.
  function hydro() {
    var svg = $("#hydro"), P = [];
    var K = [[0, 0.2], [0.18, 0.22], [0.34, 0.3], [0.46, 0.78], [0.54, 0.96], [0.64, 0.86], [0.78, 0.62], [0.9, 0.48], [1, 0.42]];
    sample(K, 8).forEach(function (p) { P.push([8 + p[0] * 66, 62 - p[1] * 48]); });
    var e = P[P.length - 1];
    svg.innerHTML = '<path class="ar" d="' + poly(P.concat([[e[0], 64], [8, 64]]), true) + '"/><path class="ln" d="' + poly(P, false) + '"/>' +
      '<path class="ax" d="M8,64H114"/>' +
      '<circle class="ring" cx="' + r1(e[0]) + '" cy="' + r1(e[1]) + '" r="4.2"/><circle class="dot" cx="' + r1(e[0]) + '" cy="' + r1(e[1]) + '" r="3.6"/>' +
      '<text x="' + r1(e[0] + 9) + '" y="' + r1(e[1] + 1) + '">400</text><text class="u" x="' + r1(e[0] + 9) + '" y="' + r1(e[1] + 13) + '">CFS</text>';
  }

  /* ---------- the table under everything: soundings on the ground ---------- */
  function table() {
    var el = $("#table"), svg = $("#tablechart"), W = el.clientWidth, Ht = Math.round(el.getBoundingClientRect().height), key = state.screen + ":" + W + ":" + Ht;
    if (svg.dataset.key === key) return;
    svg.dataset.key = key;
    svg.setAttribute("viewBox", "0 0 " + W + " " + Ht); svg.setAttribute("width", W); svg.setAttribute("height", Ht);
    var seed = { trips: 3, card: 17, crew: 29 }[state.screen], N = fbm(seed), R = rng(seed + 1);
    var cs = 7, pad = 2, nx = Math.ceil(W / cs) + 1 + pad * 2, ny = Math.ceil(Ht / cs) + 1 + pad * 2, f = new Float32Array(nx * ny), i, j;
    var F = { cs: cs, ox: -pad * cs, oy: -pad * cs };
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      var edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      f[j * nx + i] = edge ? -1 : 10 * N((i - pad) * cs / 210, (j - pad) * cs / 250);
    }
    var thin = "", bold = "", lv, c = 0;
    for (lv = 1.2; lv < 9; lv += 0.44, c++) {
      var d = "";
      iso(f, nx, ny, lv).forEach(function (lp) { d += loopD(lp, F, 1); });
      if (c % 4 === 0) bold += d; else thin += d;
    }
    var tb = el.getBoundingClientRect(), keep = $$(".bar,.tabhd,.spark,.lab,.back,.cta", el).map(function (n) {
      var b = n.getBoundingClientRect();
      return [b.left - tb.left - 9, b.top - tb.top - 5, b.right - tb.left + 9, b.bottom - tb.top + 9];
    });
    var s = '<path class="iso" d="' + thin + '"/><path class="iso ix" d="' + bold + '"/><g text-anchor="middle">';
    for (var y = 30; y < Ht; y += 46) for (var x = 8; x < W; x += 31) {
      var px = x + (R() - 0.5) * 20, py = y + (R() - 0.5) * 30;
      var v = f[Math.round(py / cs + pad) * nx + Math.round(px / cs + pad)];
      if (v > 0 && !inKeep(keep, px, py)) s += '<text x="' + r1(px) + '" y="' + r1(py) + '">' + Math.round(v * 9) + "</text>";
    }
    s += "</g>" + rose(W - 26, Ht - 86, 62, 15.5, true);
    svg.innerHTML = s;
  }

  /* ---------- screens and skies ---------- */
  var state = (function () {
    var u = new URLSearchParams(location.search), s = u.get("screen"), k = u.get("sky");
    return { screen: SCREENS.indexOf(s) < 0 ? "trips" : s, sky: SKIES.indexOf(k) < 0 ? "overcast" : k };
  })();
  var built = {};

  function setSky(id) {
    var p = RIG.sky.paletteFor(id);
    RIG.sky.apply(HTML, { id: id, forced: false, p: p, skyName: p.name });
    HTML.setAttribute("data-dark", p.dark ? "1" : "0");
    state.sky = id;
    $$("[data-sky-name]").forEach(function (n) { n.textContent = p.name; });
  }
  function sync() {
    $$("[data-go]").forEach(function (a) { a.setAttribute("href", "?screen=" + a.dataset.go + "&sky=" + state.sky); });
    $$(".look a").forEach(function (a) { a.classList.toggle("on", a.dataset.go === state.screen); });
  }
  function show(id) {
    state.screen = id;
    $$(".screen").forEach(function (m) { m.hidden = m.id !== id; });
    if (!built[id]) {
      built[id] = 1;
      if (id === "trips") { sound(); $$(".win").forEach(function (w, i) { w.dataset.i = i; win(w); }); }
      if (id === "card") { pier(); tideplot(); }
      if (id === "crew") { river(); hydro(); }
    }
    if (id === "trips") $$(".spark").forEach(spark); // drawn to the width they have right now
    table();
    sync();
  }
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (started) show(state.screen); }, 160);
  });

  D.addEventListener("click", function (e) {
    var go = e.target.closest("[data-go]"), sk = e.target.closest("[data-sky-next]"), seg = e.target.closest(".seg button");
    if (go) {
      e.preventDefault(); show(go.dataset.go); window.scrollTo(0, 0);
    } else if (sk) {
      setSky(SKIES[(SKIES.indexOf(state.sky) + 1) % SKIES.length]); sync();
    } else if (seg) {
      $$(".seg button").forEach(function (b) { b.classList.toggle("on", b === seg); b.setAttribute("aria-checked", b === seg ? "true" : "false"); });
      return;
    } else {
      if (e.target.closest('a[href^="#"]')) e.preventDefault();
      return;
    }
    history.replaceState(null, "", "?screen=" + state.screen + "&sky=" + state.sky);
  });

  setSky(state.sky);
  // Labels are measured, so wait for the two faces before drawing.
  var started = false;
  function start() { if (started) return; started = true; show(state.screen); window.__chartReady = true; }
  if (D.fonts && D.fonts.load) {
    Promise.all(['700 12px "Barlow Condensed"', '600 12px "Barlow Condensed"', "500 12px Inter"].map(function (f) { return D.fonts.load(f); })).then(start, start);
    setTimeout(start, 1500); // never wait on a font to show the page
  } else start();
})();
