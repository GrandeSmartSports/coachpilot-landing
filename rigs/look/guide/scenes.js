// Washes: the sky and water behind the plates, painted from the sky engine.
//
// Three places, each a loose watercolour study rather than a picture: the
// Sound from a beach (Trips), a lit pier over black water (the squid card)
// and a river bar under firs (the crew trip). Shapes are filled silhouettes
// that step back by value, one ridge behind the next, each mixed further
// toward the sky. A turbulence filter wavers every edge and pools the
// pigment unevenly, so nothing reads as a ruled vector shape.
(function (root) {
  "use strict";
  var G = root.GUIDE, T = G.tools, n = T.n, P = T.P, lerp = T.lerp, rng = T.rng;

  function ridge(r, y0, amp, step, teeth, floor) {
    var pts = [], x = -14, a = r() * 6, b = r() * 6;
    while (x <= 404) {
      var base = y0 + Math.sin(x * 0.011 + a) * amp + Math.sin(x * 0.029 + b) * amp * 0.45;
      pts.push([x, base - r() * teeth]);
      x += step * (0.5 + r() * 0.9);
      pts.push([x, base + r() * teeth * 0.3]);
      x += step * (0.4 + r() * 0.8);
    }
    return "M-14 " + floor + "L" + pts.map(P).join("L") + "L404 " + floor + "Z";
  }
  // One fir: a thin leader, then a leaning spire of uneven, drooping tiers.
  // No two come out alike.
  function fir(r, x, base, h) {
    var w = h * 0.15 * (0.75 + r() * 0.6), tiers = 4 + Math.floor(h / 10) + Math.floor(r() * 2), L = [], R = [], lean = (r() - 0.5) * 3;
    var top = base - h, lead = h * (0.1 + r() * 0.08);
    for (var i = 1; i <= tiers; i++) {
      var t = i / tiers, y = top + lead + (h - lead) * t, half = w * Math.pow(t, 0.8) * (0.62 + r() * 0.7) + 0.45, cx = x + lean * (1 - t), drop = ((h - lead) / tiers) * 0.5;
      // down the left: out to a drooping tip, then back in under the branch
      L.push([cx - half, y + r() * 1.8]); L.push([cx - half * (0.34 + r() * 0.2), y - drop + r()]);
      // and the right side, stored bottom to top
      R.unshift([cx + half * (0.3 + r() * 0.2), y - drop + r()]); R.unshift([cx + half * (0.75 + r() * 0.5), y + r() * 1.8]);
    }
    L.pop();
    return "M" + P([x + lean, top]) + "L" + P([x + lean - 0.45, top + lead]) + "L" + L.map(P).join("L") +
      "L" + R.map(P).join("L") + "L" + P([x + lean + 0.45, top + lead]) + "Z";
  }
  // A stand of firs: thick in places, thin in others, with the odd old giant.
  function stand(r, x0, x1, baseAt, hMin, hMax, gap) {
    var d = "", x = x0, wave = r() * 6;
    while (x < x1) {
      var dens = 0.5 + 0.5 * Math.sin(x * 0.043 + wave);
      if (r() > 0.2 + dens * 0.85) { x += gap * (0.5 + r()); continue; }
      var h = lerp(hMin, hMax, Math.pow(r(), 1.7)) * (0.74 + dens * 0.36);
      if (r() < 0.06) h = hMax * (1.05 + r() * 0.2);
      d += fir(r, x, baseAt(x) + 2, h);
      x += gap * (0.3 + r() * (1.5 - dens * 0.7));
    }
    return d;
  }
  // Light lying on water: short broken strokes, fine and crowded near the
  // horizon, longer and fewer toward the viewer.
  function glints(r, y0, y1, count, x0, x1, maxLen, skip) {
    var thin = "", fat = "";
    for (var i = 0; i < count; i++) {
      var t = Math.pow(r(), 1.5), y = lerp(y0, y1, t), len = 3 + t * (maxLen || 26) * (0.3 + r() * 0.7), x = lerp(x0, x1, r());
      if (skip && skip(x, y, len)) continue;
      if (t < 0.45) thin += "M" + n(x) + " " + n(y) + "h" + n(len); else fat += "M" + n(x) + " " + n(y) + "h" + n(len);
    }
    return [thin, fat];
  }
  // Rain as fine slanted grain over the sky, shown only when it is raining.
  function rainLines(down) {
    var r = rng(404), d = "";
    for (var i = 0; i < 110; i++) { d += "M" + n(r() * 400) + " " + n(r() * down) + "l" + n(-4 - r() * 3) + " " + n(15 + r() * 12); }
    return '<path class="w-rain" d="' + d + '"/>';
  }
  // A ragged lower edge, so a wash ends the way a brush leaves it.
  function torn(r, y, wob) {
    var pts = [], x = 404;
    while (x > -4) { pts.push([x, y + (r() - 0.5) * wob]); x -= 14 + r() * 26; }
    pts.push([-14, y + (r() - 0.5) * wob]);
    return pts.map(P).join("L");
  }
  // The painted study is one still picture. The glints ride on a second,
  // unfiltered layer, so the one slow drift never repaints the washes.
  function frame(h, cls, inner, over) {
    var open = '" viewBox="0 0 390 ' + h + '" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">';
    return '<svg class="scene ' + cls + open + inner + "</svg>" + (over ? '<svg class="scene drift ' + cls + open + over + "</svg>" : "");
  }
  function skyWash(id, r, horizon, h) {
    return '<linearGradient id="' + id + '-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--w-sky1)"/><stop offset="1" style="stop-color:var(--w-sky2)"/></linearGradient>' +
      '<linearGradient id="' + id + '-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--w-water1)"/><stop offset=".7" style="stop-color:var(--w-water2)"/><stop offset="1" style="stop-color:var(--w-water3)"/></linearGradient>' +
      '<linearGradient id="' + id + '-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--w-sky2);stop-opacity:0"/><stop offset="1" style="stop-color:var(--w-sky2);stop-opacity:.9"/></linearGradient>';
  }

  var S = (G.scene = {});

  // ---- the Sound, from the beach ----------------------------------------
  S.sound = function () {
    var r = rng(318), H = 380, hz = 214, id = "sc-snd";
    var far = ridge(r, hz - 20, 7, 16, 1.4, hz + 4), mid = ridge(r, hz - 10, 5, 9, 2.6, hz + 4);
    // A wooded point running in from the right, and a low island far left.
    function pointTop(x) { return hz - 2 - 17 * Math.min(1, Math.max(0, (x - 232) / 110)) - 4 * Math.sin(x * 0.045); }
    var land = "M228 " + (hz + 2.4);
    for (var x = 236; x <= 404; x += 10) land += "L" + n(x) + " " + n(pointTop(x) + (r() - 0.5) * 1.5);
    land += "L404 " + (hz + 3) + "Z";
    var trees = stand(r, 246, 404, pointTop, 10, 30, 5.4), treesFar = stand(r, -8, 92, function (x) { return hz - 1 - (92 - x) * 0.03; }, 4, 9, 4.2);
    var g = glints(r, hz + 6, H - 30, 84, 6, 380, 34);
    var path = glints(rng(77), hz + 4, H - 30, 50, 104, 176, 30);
    var rain = rainLines(hz + 20);
    var lights = "", refl = "";
    [[14, 0.6], [39, 1], [72, 0.5], [128, 0.4], [186, 0.5], [262, 0.9], [301, 0.6], [346, 1]].forEach(function (L) {
      lights += '<circle cx="' + L[0] + '" cy="' + n(hz - 1.2) + '" r="' + n(0.9 + L[1] * 0.7) + '"/>';
      refl += "M" + L[0] + " " + (hz + 4) + "v" + n(8 + L[1] * 22);
    });
    return frame(H, "sc-sound",
      "<defs>" + skyWash(id, r, hz, H) + "</defs>" +
      '<g filter="url(#wc)">' +
        '<path fill="url(#' + id + '-s)" d="M-14 -14H404V' + (hz + 6) + 'H-14Z"/>' +
        '<path class="w-cloud" d="M-14 34C60 22 120 46 210 30S340 20 404 42V78C330 60 250 86 170 70S50 84 -14 66Z"/>' +
        '<path class="w-cloud c2" d="M-14 92C80 80 150 104 250 90S350 84 404 98V124C320 112 240 132 150 118S40 126 -14 116Z"/>' +
        // The mountain, clear skies only: a broad pale mass, barely darker than the sky.
        '<g class="w-mtn" transform="translate(0 ' + hz + ')">' +
        '<path class="w-rainier" d="M168 0C204 -13 232 -33 252 -53C260 -61 264 -69 272 -75C280 -85 288 -92 297 -94C303 -96 308 -92 313 -94C319 -96 324 -91 329 -86C346 -69 372 -40 410 -16V0Z"/>' +
        '<path class="w-rainier snow" d="M252 -53C260 -61 264 -69 272 -75C280 -85 288 -92 297 -94C303 -96 308 -92 313 -94C319 -96 324 -91 329 -86C338 -77 348 -66 358 -56C352 -58 348 -52 344 -45C340 -54 336 -61 331 -57C327 -50 323 -43 318 -48C314 -58 310 -67 304 -62C300 -54 297 -45 292 -50C288 -58 284 -63 279 -58C275 -52 271 -45 266 -50C262 -54 257 -54 252 -53Z"/>' +
        '<path fill="url(#' + id + '-m)" d="M150 -46H410V2H150Z"/></g>' +
        '<path class="w-ridge r1" d="' + far + '"/><path fill="url(#' + id + '-m)" d="M-14 ' + (hz - 20) + "H404V" + (hz + 4) + 'H-14Z"/>' +
        '<path class="w-ridge r2" d="' + mid + '"/><path fill="url(#' + id + '-m)" opacity=".7" d="M-14 ' + (hz - 9) + "H404V" + (hz + 4) + 'H-14Z"/>' +
        '<path class="w-ridge r3" d="' + treesFar + '"/>' +
        '<path fill="url(#' + id + '-w)" d="M-14 ' + (hz + 2) + "H404L" + torn(r, H - 14, 14) + 'Z"/>' +
        '<ellipse class="w-sheen" filter="url(#sb5)" cx="150" cy="' + (hz + 22) + '" rx="176" ry="8"/>' +
        '<path class="w-refl" filter="url(#sb5)" d="M404 ' + (hz + 2) + "H232C290 " + (hz + 26) + " 350 " + (hz + 34) + " 404 " + (hz + 40) + 'Z"/>' +
        '<path class="w-ridge r4" d="' + land + trees + '"/>' +
        '<path class="w-edge" d="M232 ' + (hz + 2.6) + "H404" + '"/>' +
      "</g>" +
      '<rect class="w-pool" x="0" y="0" width="390" height="' + H + '" filter="url(#pool)"/>' +
      rain +
      '<g class="w-lights">' + lights + '<path d="' + refl + '"/></g>',
      '<g class="w-sunpath"><path class="thin" d="' + path[0] + '"/><path class="fat" d="' + path[1] + '"/></g>' +
      '<g class="w-glints"><path class="thin" d="' + g[0] + '"/><path class="fat" d="' + g[1] + '"/></g>');
  };

  // ---- a lit pier over the bay ------------------------------------------
  S.pier = function () {
    var r = rng(52), H = 480, hz = 262, deck = 280, id = "sc-pier";
    var far = ridge(r, hz - 12, 5, 12, 1.8, hz + 4);
    var piles = "", refl = "", brace = "", posts = "", lamps = "", glow = "", streak = "", x = 150, i = 0;
    while (x < 400) {
      var w = 4.5 + r() * 2.2, lean = (r() - 0.5) * 2.4, depth = 56 + r() * 26;
      piles += "M" + n(x) + " " + deck + "L" + n(x + w) + " " + deck + "L" + n(x + w + lean) + " " + n(deck + depth) + "L" + n(x + lean) + " " + n(deck + depth) + "Z";
      var ry = deck + depth + 2, rd = "M" + n(x + w / 2 + lean) + " " + n(ry);
      for (var k = 0; k < 7; k++) rd += "q" + n((k % 2 ? 3.4 : -3.4) * (0.6 + r())) + " " + n(3 + r() * 2) + " " + n((r() - 0.5) * 1.5) + " " + n(6 + r() * 4);
      refl += rd;
      if (i % 2 === 0 && x + 34 < 400) brace += "M" + n(x + w) + " " + (deck + 6) + "L" + n(x + 30) + " " + (deck + 40) + "M" + n(x + 30) + " " + (deck + 6) + "L" + n(x + w) + " " + (deck + 40);
      x += 24 + r() * 16; i++;
    }
    for (x = 146; x < 400; x += 15.5) posts += "M" + n(x) + " " + (deck - 6) + "v-9";
    [176, 262, 348].forEach(function (lx, j) {
      var top = deck - 38 - (j % 2) * 3;
      lamps += "M" + lx + " " + (deck - 6) + "V" + top + "q0 -5 -7 -5h-5";
      glow += '<circle class="w-glow" cx="' + (lx - 12) + '" cy="' + (top - 3) + '" r="30" fill="url(#' + id + '-g)"/>' +
        '<ellipse class="w-bulb" cx="' + (lx - 12) + '" cy="' + (top - 3.6) + '" rx="3.6" ry="2"/>';
      for (var s = 0; s < 9; s++) streak += "M" + n(lx - 12 - 5 + r() * 10) + " " + n(deck + 14 + s * 11 + r() * 5) + "h" + n(4 + r() * 12 * (1 - s / 12));
    });
    var g = glints(r, hz + 8, H - 40, 84, 4, 384, 30, function (gx, gy, len) { return gx + len > 136 && gy < deck + 92; });
    return frame(H, "sc-pier",
      "<defs>" + skyWash(id, r, hz, H) +
        '<radialGradient id="' + id + '-g"><stop offset="0" style="stop-color:var(--w-lamp);stop-opacity:.85"/><stop offset=".25" style="stop-color:var(--w-lamp);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--w-lamp);stop-opacity:0"/></radialGradient></defs>' +
      '<g filter="url(#wc)">' +
        '<path fill="url(#' + id + '-s)" d="M-14 -14H404V' + (hz + 6) + 'H-14Z"/>' +
        '<path class="w-cloud" d="M-14 60C70 44 150 74 240 54S350 48 404 70V104C320 88 240 116 150 98S40 112 -14 96Z"/>' +
        '<path class="w-cloud c2" d="M-14 138C80 124 160 150 260 134S360 130 404 144V170C320 156 230 178 150 164S40 172 -14 162Z"/>' +
        '<path class="w-ridge r1" d="' + far + '"/><path fill="url(#' + id + '-m)" d="M-14 ' + (hz - 14) + "H404V" + (hz + 4) + 'H-14Z"/>' +
        '<path fill="url(#' + id + '-w)" d="M-14 ' + (hz + 2) + "H404L" + torn(r, H - 16, 14) + 'Z"/>' +
        '<ellipse class="w-sheen" filter="url(#sb5)" cx="70" cy="' + (hz + 24) + '" rx="150" ry="9"/>' +
        '<path class="w-refl" filter="url(#sb5)" d="M140 ' + (deck + 2) + "H404V" + (deck + 96) + "C320 " + (deck + 104) + " 220 " + (deck + 84) + " 140 " + (deck + 60) + 'Z"/>' +
        '<path class="w-pierrefl" d="' + refl + '"/>' +
      "</g>" +
      '<rect class="w-pool" x="0" y="0" width="390" height="' + H + '" filter="url(#pool)"/>' +
      '<g class="w-pier" filter="url(#wc2)">' +
        '<path class="w-brace" d="' + brace + '"/><path class="w-pile" d="' + piles + '"/>' +
        '<path class="w-pile" d="M138 ' + (deck - 6) + "H404V" + (deck + 1.5) + 'H138Z"/>' +
        '<path class="w-rail" d="' + posts + "M142 " + (deck - 15) + 'H404"/><path class="w-rail post" d="' + lamps + '"/>' +
      "</g>" +
      '<g class="w-lamps">' + glow + '<path class="w-streak" d="' + streak + '"/></g>' + rainLines(hz + 40),
      '<g class="w-glints"><path class="thin" d="' + g[0] + '"/><path class="fat" d="' + g[1] + '"/></g>');
  };

  // ---- the river bar -----------------------------------------------------
  S.river = function () {
    var r = rng(905), H = 480, hz = 292, id = "sc-riv";
    var back = ridge(r, hz - 40, 8, 7, 5, hz + 4);
    function bankTop(x) { return hz - 4 - 5 * Math.sin(x * 0.021 + 1) - 3 * Math.sin(x * 0.06); }
    var bank = "M-14 " + (hz + 4);
    for (var x = -14; x <= 404; x += 11) bank += "L" + n(x) + " " + n(bankTop(x));
    bank += "L404 " + (hz + 4) + "Z";
    var firsBack = stand(r, -10, 404, function (x) { return bankTop(x) - 7; }, 20, 46, 9);
    var firsFront = stand(r, -10, 404, bankTop, 14, 36, 7.5);
    // The current: long drawn lines that bend round the bar.
    var flow = "", flow2 = "";
    for (var i = 0; i < 26; i++) {
      var y = hz + 10 + Math.pow(r(), 1.2) * 110, fx = r() * 300 - 20, len = 40 + r() * 110, sag = 2 + r() * 5;
      var seg = "M" + n(fx) + " " + n(y) + "q" + n(len / 2) + " " + n(sag) + " " + n(len) + " " + n(-1 + r() * 3);
      if (y > H - 134 && fx < 292) continue;
      if (i % 3) flow += seg; else flow2 += seg;
    }
    // The gravel bar, bottom left: a pale shoal and its stones.
    var bar = "M-14 " + (H - 96) + "C40 " + (H - 124) + " 120 " + (H - 128) + " 196 " + (H - 112) + "C240 " + (H - 103) + " 270 " + (H - 88) + " 286 " + (H - 70) + "L300 " + H + "H-14Z";
    var peb = "", peb2 = "", cob = "", cobLit = "";
    for (i = 0; i < 260; i++) {
      var px = r() * 290 - 10, py = H - 118 + r() * 100, edge = H - 126 + Math.pow(Math.max(0, px - 40) / 250, 2) * 60 + (px < 40 ? (40 - px) * 0.5 : 0);
      if (py < edge + 6) continue;
      var pr = 0.6 + r() * 1.5;
      if (r() < 0.6) peb += T.dot(px, py, pr * 1.3, pr * 0.75, 0); else peb2 += T.dot(px, py, pr * 1.3, pr * 0.75, 0);
    }
    for (i = 0; i < 16; i++) {
      var cx = r() * 250, cy = H - 104 + r() * 70, cr = 3 + r() * 4.5;
      if (cy < H - 122 + Math.pow(Math.max(0, cx - 40) / 250, 2) * 60 + 12) continue;
      cob += T.dot(cx, cy, cr * 1.4, cr * 0.8, (r() - 0.5) * 0.5);
      cobLit += "M" + n(cx - cr) + " " + n(cy - cr * 0.3) + "q" + n(cr) + " " + n(-cr * 0.6) + " " + n(cr * 1.8) + " 0";
    }
    return frame(H, "sc-river",
      "<defs>" + skyWash(id, r, hz, H) + "</defs>" +
      '<g filter="url(#wc)">' +
        '<path fill="url(#' + id + '-s)" d="M-14 -14H404V' + (hz + 6) + 'H-14Z"/>' +
        '<path class="w-cloud" d="M-14 40C70 26 150 54 240 36S350 30 404 50V84C320 68 240 96 150 78S40 92 -14 76Z"/>' +
        '<path class="w-ridge r1" d="' + back + '"/><path fill="url(#' + id + '-m)" d="M-14 ' + (hz - 50) + "H404V" + (hz - 14) + 'H-14Z"/>' +
        '<path class="w-ridge r2" d="' + firsBack + '"/><path fill="url(#' + id + '-m)" opacity=".8" d="M-14 ' + (hz - 40) + "H404V" + (hz + 2) + 'H-14Z"/>' +
        '<path fill="url(#' + id + '-w)" d="M-14 ' + (hz + 2) + "H404L" + torn(r, H - 14, 14) + 'Z"/>' +
        '<path class="w-refl" filter="url(#sb5)" d="M-14 ' + (hz + 2) + "H404V" + (hz + 34) + "C300 " + (hz + 46) + " 120 " + (hz + 30) + " -14 " + (hz + 44) + 'Z"/>' +
        '<ellipse class="w-sheen" filter="url(#sb5)" cx="246" cy="' + (hz + 62) + '" rx="170" ry="9"/>' +
        '<path class="w-ridge r4" d="' + bank + firsFront + '"/>' +
        '<path class="w-bar" d="' + bar + '"/>' +
      "</g>" +
      '<rect class="w-pool" x="0" y="0" width="390" height="' + H + '" filter="url(#pool)"/>' +
      '<g class="w-gravel"><path class="p1" d="' + peb + '"/><path class="p2" d="' + peb2 + '"/><path class="cob" d="' + cob + '"/><path class="coblit" d="' + cobLit + '"/></g>' + rainLines(hz + 40),
      '<g class="w-glints flow"><path class="thin" d="' + flow + '"/><path class="fat" d="' + flow2 + '"/></g>');
  };

  // Filters the scenes share. They live in the sprite beside the plates.
  G.sceneDefs = function () {
    return '<filter id="wc" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".02 .034" numOctaves="3" seed="12" result="t"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>' +
      '<filter id="wc2" x="-4%" y="-10%" width="108%" height="120%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".05 .08" numOctaves="2" seed="4" result="t"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="t" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>' +
      '<filter id="sb5" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>' +
      // Pooled pigment over the whole study: soft dark blooms plus paper tooth.
      '<filter id="pool" filterUnits="userSpaceOnUse" x="0" y="0" width="390" height="480" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".011 .02" numOctaves="4" seed="21" result="lo"/>' +
        '<feColorMatrix in="lo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.9 -.86" result="bloom"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="6" result="hi"/>' +
        '<feColorMatrix in="hi" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .7 -.3" result="tooth"/>' +
        '<feMerge><feMergeNode in="bloom"/><feMergeNode in="tooth"/></feMerge></filter>' +
      '<filter id="blotf" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".03 .045" numOctaves="3" seed="9" result="t"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="t" scale="16" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
        '<feMorphology in="d" operator="erode" radius="1.4" result="e"/>' +
        '<feComposite in="d" in2="e" operator="out" result="rim"/>' +
        '<feComponentTransfer in="d" result="body"><feFuncA type="linear" slope=".62"/></feComponentTransfer>' +
        '<feMerge><feMergeNode in="body"/><feMergeNode in="rim"/></feMerge></filter>';
  };

  // A hand-inked rule: drawn twice, the second pass a hair off and lighter,
  // with the small gaps a nib leaves.
  var ruleSeed = 1, blotSeed = 1;
  // Each render starts the pen over, so a screen draws the same way every time.
  G.reset = function () { ruleSeed = 1; blotSeed = 1; };
  G.rule = function (cls) {
    var r = rng(ruleSeed++ * 97), a = "M1 3", b = "M2 4.1", x = 1;
    while (x < 299) {
      var step = 22 + r() * 34; x = Math.min(299, x + step);
      a += "Q" + n(x - step / 2) + " " + n(3 + (r() - 0.5) * 1.5) + " " + n(x) + " " + n(3 + (r() - 0.5) * 0.9);
      b += "Q" + n(x - step / 2) + " " + n(4.1 + (r() - 0.5) * 1.6) + " " + n(Math.min(297, x)) + " " + n(4.1 + (r() - 0.5) * 1);
    }
    return '<svg class="rule ' + (cls || "") + '" viewBox="0 0 300 7" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<path d="' + a + '"/><path class="again" d="' + b + '" stroke-dasharray="' + n(60 + r() * 60) + " " + n(2 + r() * 3) + " " + n(90 + r() * 50) + " " + n(1.5 + r() * 3) + '"/></svg>';
  };

  // The spot, as a thumbnail study: the pier, its lamps and the water under it.
  G.vignette = function () {
    var r = rng(61), piles = "", refl = "", x = 58;
    while (x < 178) {
      var w = 3 + r() * 1.4;
      piles += "M" + n(x) + " 44h" + n(w) + "l" + n((r() - 0.5) * 1.6) + " " + n(20 + r() * 9) + "h" + n(-w) + "Z";
      refl += "M" + n(x + w / 2) + " " + n(68 + r() * 3) + "q-2.6 3 0 6t0 6";
      x += 14 + r() * 9;
    }
    return '<svg class="vig scene" viewBox="0 0 200 100" role="img" aria-label="Les Davis Pier" focusable="false">' +
      '<g filter="url(#blotf)"><path class="v-water" d="M14 58C40 50 150 48 188 56C196 70 182 88 150 90C100 96 50 94 22 86C8 78 8 66 14 58Z"/></g>' +
      '<path class="w-pierrefl" d="' + refl + '"/>' +
      '<g class="w-pier" filter="url(#wc2)"><path class="w-pile" d="' + piles + 'M50 38H186V44.5H50Z"/>' +
        '<path class="w-rail" d="M52 30H186M60 38v-8M78 38v-8M96 38v-8M114 38v-8M132 38v-8M150 38v-8M168 38v-8"/>' +
        '<path class="w-rail post" d="M90 38V15q0 -4 -5 -4h-4M158 38V17q0 -4 -5 -4h-4"/></g>' +
      '<g class="w-lamps"><circle class="w-glow" cx="80" cy="11" r="15" fill="url(#sc-pier-g)"/><circle class="w-glow" cx="148" cy="13" r="15" fill="url(#sc-pier-g)"/>' +
        '<ellipse class="w-bulb" cx="80" cy="10.4" rx="2.6" ry="1.5"/><ellipse class="w-bulb" cx="148" cy="12.4" rx="2.6" ry="1.5"/></g></svg>';
  };

  // A wash blot to sit a specimen on: two glazes and a little spatter.
  G.blot = function (kind) {
    var r = rng(blotSeed++ * 131), pts = [], pts2 = [], k = 9;
    for (var i = 0; i < k; i++) {
      var a = (i / k) * Math.PI * 2, rad = 0.74 + r() * 0.3;
      pts.push([100 + Math.cos(a) * 82 * rad, 50 + Math.sin(a) * 36 * rad]);
      pts2.push([108 + Math.cos(a + 0.5) * 56 * (0.7 + r() * 0.4), 54 + Math.sin(a + 0.5) * 24 * (0.7 + r() * 0.4)]);
    }
    var sp = "";
    for (i = 0; i < 7; i++) { var sa = r() * 6.3, sd = 1.02 + r() * 0.2; sp += T.dot(100 + Math.cos(sa) * 88 * sd, 50 + Math.sin(sa) * 40 * sd, 0.7 + r() * 1.6, 0.6 + r() * 1.3, 0); }
    return '<svg class="blot blot-' + kind + '" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<g filter="url(#blotf)"><path class="b1" d="' + T.cr(pts, true) + '"/><path class="b2" d="' + T.cr(pts2, true) + '"/><path class="b3" d="' + sp + '"/></g></svg>';
  };
})(typeof window !== "undefined" ? window : globalThis);
