// Rig Card, "On the water": the scenery.
//
// Every picture on the page is drawn here, as layered SVG, from a seeded
// random number so it is the same place every visit. Nothing is an image
// file and nothing carries a colour of its own: every fill is a class that
// scene.css mixes out of the sky engine's variables, so one drawing becomes
// eight paintings (dawn, overcast, golden hour, night and the rest).
//
// Depth is built the way a painter builds it:
//   far things are pale and plain, near things are dark and detailed,
//   every layer overlaps the one behind, mist sits between the layers,
//   and the light has one direction that the water answers.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});
  var W = 390, H = 330, HZ = 176;

  // ---- small tools ---------------------------------------------------------
  function rnd(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function noise(seed) {
    var r = rnd(seed), g = [];
    for (var i = 0; i < 64; i++) g.push(r());
    return function (x) {
      var i = Math.floor(x), t = x - i;
      t = t * t * (3 - 2 * t);
      var a = g[((i % 64) + 64) % 64], b = g[(((i + 1) % 64) + 64) % 64];
      return a + (b - a) * t;
    };
  }
  function n(v) { return Math.round(v * 10) / 10; }
  function poly(pts) {
    var s = "M";
    for (var i = 0; i < pts.length; i++) s += (i ? "L" : "") + n(pts[i][0]) + " " + n(pts[i][1]);
    return s + "Z";
  }
  // A closed outline drawn through the midpoints with curves: rounded,
  // no straight edge anywhere.
  function smooth(pts) {
    var m = pts.length, mid = function (i) { var a = pts[i % m], b = pts[(i + 1) % m]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }, s0 = mid(m - 1), d = "M" + n(s0[0]) + " " + n(s0[1]);
    for (var i = 0; i < m; i++) { var q = mid(i); d += "Q" + n(pts[i][0]) + " " + n(pts[i][1]) + " " + n(q[0]) + " " + n(q[1]); }
    return d + "Z";
  }
  function line(pts) {
    return "M" + pts.map(function (p) { return n(p[0]) + " " + n(p[1]); }).join("L");
  }
  function gauss(r) { return (r() + r() + r() + r() - 2) / 2; }

  // ---- trees ---------------------------------------------------------------
  // One conifer as a filled silhouette: tip, down the right side tier by
  // tier, across the foot, back up the left. Every tier gets its own reach
  // on each side and a small undercut, so no two trees match and none is a
  // triangle.
  function conifer(r, x, base, h, o) {
    o = o || {};
    var full = o.full || 0.18 + r() * 0.09;
    var rag = o.rag == null ? 0.6 : o.rag;
    var hw = h * full, lean = (r() - 0.5) * h * 0.07;
    var st = o.step || 2.3 + r() * 1.9;
    if (TILE) st = Math.max(st, h / 8);                  // a tile's fir: a few tiers, it is 48 px across
    var tiers = Math.max(3, Math.round(h / st));
    var top = base - h, sh = h / tiers, R = [], L = [];
    for (var i = 1; i <= tiers; i++) {
      var t = i / tiers, cx = x + lean * (1 - t), y = top + h * (0.09 + 0.89 * t);
      var grow = Math.pow(t, 0.78);
      var wr = hw * grow * (1 - rag * 0.55 + r() * rag);
      var wl = hw * grow * (1 - rag * 0.55 + r() * rag);
      R.push([cx + wr, y + sh * (r() - 0.5) * 0.4], [cx + wr * (0.26 + r() * 0.3), y - sh * r() * 0.32]);
      L.push([cx - wl, y + sh * (r() - 0.5) * 0.4], [cx - wl * (0.26 + r() * 0.3), y - sh * r() * 0.32]);
    }
    var pts = [[x + lean, top]].concat(R);
    pts.push([x + hw * 0.45, base], [x - hw * 0.45, base]);
    for (var j = L.length - 1; j >= 0; j--) pts.push(L[j]);
    return poly(pts);
  }
  // A dead top: a bare spar with a stub or two. Old shorelines have them.
  function snag(r, x, base, h) {
    var l = (r() - 0.5) * 2.4, w = 0.55 + h * 0.012, top = base - h;
    var s = poly([[x + l - 0.3, top], [x + l + 0.3, top + 0.6], [x + w, base], [x - w, base]]);
    var k = 1 + Math.floor(r() * 2);
    for (var i = 0; i < k; i++) {
      var y = top + h * (0.2 + r() * 0.35), dir = r() < 0.5 ? -1 : 1, len = h * (0.1 + r() * 0.1);
      var cx = x + l * (1 - (y - top) / h);
      s += poly([[cx, y], [cx + dir * len, y - len * 0.55], [cx + dir * len * 0.9, y - len * 0.3], [cx, y + 1.1]]);
    }
    return s;
  }

  // ---- land ----------------------------------------------------------------
  // A headland runs from its root (off the frame) to its point. base is its
  // waterline, a number or a function of x so a river bank can slope away.
  // Far headlands get a ragged canopy edge; near ones get real trees.
  function headland(o) {
    var r = rnd(o.seed), nz = noise(o.seed + 11), nt = noise(o.seed + 29);
    var a = Math.min(o.from, o.to), b = Math.max(o.from, o.to);
    var base = typeof o.base === "function" ? o.base : function () { return o.base; };
    var freq = o.freq || 0.018, shape = o.shape || 2.4;
    function u(x) { var v = (x - o.from) / (o.to - o.from); return v < 0 ? 0 : v > 1 ? 1 : v; }
    // o.env (optional): the land's own rise and fall along its length, k
    // from 0 to 1, for an island that tapers at both ends
    function land(x) {
      var k = u(x), env = o.env ? o.env(k) : Math.pow(1 - Math.pow(k, shape), 0.9);
      return o.h * env * (0.5 + 0.5 * (nz(x * freq) * 0.7 + nz(x * freq * 3.1 + 9) * 0.3));
    }
    function fade(x) { return o.env ? Math.min(1, o.env(u(x)) * 1.6 + 0.08) : Math.min(1, (1 - u(x)) * (o.tipFade || 7) + 0.12); }
    var out = { base: base, a: a, b: b, top: 9999, land: "", trees: "", maxH: 0 };
    var pts = [], x;
    if (!o.trees) {
      // canopy: a toothed edge, each tooth its own height
      pts.push([a - 6, base(a - 6)]);
      x = a - 6;
      while (x < b) {
        var g = land(x), c = o.tree * (0.3 + 0.7 * r()) * (0.6 + 0.8 * nt(x * 0.06)) * fade(x);
        if (r() < 0.07) c *= 1.5;
        var y = base(x) - g - c;
        pts.push([x, y]);
        if (y < out.top) out.top = y;
        var dx = o.gap * (0.55 + r() * 0.9);
        pts.push([x + dx * (0.35 + r() * 0.3), base(x) - g - c * r() * 0.35]);
        x += dx;
      }
      pts.push([b + 1, base(b)]);
      out.land = poly(pts);
    } else {
      pts.push([a - 8, base(a - 8)]);
      for (x = a - 8; x <= b; x += 4) pts.push([x, base(x) - land(x) - 1]);
      pts.push([b + 2, base(b)]);
      if (typeof o.base === "function") for (x = b; x >= a - 8; x -= 6) pts.push([x, base(x) + 0.6]);
      out.land = poly(pts);
      x = a - 8;
      while (x < b - 1) {
        var th = o.tree * (0.5 + 0.85 * nt(x * (o.tfreq || 0.045))) * (0.72 + 0.56 * r()) * fade(x);
        if (o.grow) th *= o.grow(x);
        var foot = base(x) - land(x) + 1.2, roll = r();
        if (th > 5) {
          if (roll < 0.06 && th > 14) out.trees += snag(r, x, foot, th * 1.12);
          else if (roll < 0.24) out.trees += conifer(r, x, foot, th * 1.18, { full: 0.12 + r() * 0.04, rag: 0.7 });
          else if (roll < 0.46) out.trees += conifer(r, x, foot, th * 0.92, { full: 0.27 + r() * 0.07, rag: 0.32, step: 3 + r() * 1.6 });
          else out.trees += conifer(r, x, foot, th);
          if (foot - th * 1.18 < out.top) out.top = foot - th * 1.18;
        }
        x += Math.max(1.6, th * (0.13 + r() * 0.2)) * (r() < 0.07 ? 2.6 : 1);
      }
    }
    out.maxH = base(a) - out.top;
    out.height = land;
    return out;
  }

  // A far wooded ridge: a soft rolling top (two slow swells), and the
  // trees on it as small rounded crowns, never teeth or flat blocks.
  function ridgeLine(seed, x0, x1, base, h) {
    var r = rnd(seed), nz = noise(seed + 3), x = x0, y0 = function (xx) { return base - h * (0.58 + 0.3 * nz(xx * 0.009) + 0.12 * nz(xx * 0.031 + 7)); };
    var d = "M" + n(x0) + " " + n(base + 1) + "L" + n(x0) + " " + n(y0(x0));
    while (x < x1) {
      var step = 2.4 + r() * 3.2, xe = Math.min(x1, x + step), bump = 0.8 + r() * 1.9, ym = (y0(x) + y0(xe)) / 2;
      d += "Q" + n(x + step / 2) + " " + n(ym - bump * 2) + " " + n(xe) + " " + n(y0(xe));
      x = xe;
    }
    return d + "L" + n(x1) + " " + n(base + 1) + "Z";
  }

  // ---- water ---------------------------------------------------------------
  // Broken horizontal glints: short, thin and crowded at the horizon, long
  // and sparse at your feet. That thinning is what makes water lie flat.
  function glints(seed, dens, y0, y1) {
    var r = rnd(seed), s = "", y = y0;
    while (y < y1) {
      var k = (y - y0) / (y1 - y0), cnt = Math.round(dens * (1.75 - k * 1.1) * 9);
      for (var i = 0; i < cnt; i++) {
        var len = (1.6 + k * 17) * (0.35 + r()), x = r() * (W + 20) - 10;
        s += '<path d="M' + n(x) + " " + n(y + (r() - 0.5) * 1.6) + "h" + n(len) + '" stroke-width="' + n(0.45 + k * 1.05) +
          '" opacity="' + n(0.2 + r() * 0.7) + '"/>';
      }
      y += (1.5 + k * 7.5) * (0.6 + r() * 0.7);
    }
    return s;
  }
  // The light's road across the water, drawn around x = 0 and slid under
  // the light by CSS, so each sky can put its light where it likes.
  function lightRoad(seed, y0, y1) {
    var r = rnd(seed), s = "", y = y0;
    while (y < y1) {
      var k = (y - y0) / (y1 - y0), spread = 5 + k * 44, cnt = 2 + Math.round((1 - k) * 3);
      for (var i = 0; i < cnt; i++) {
        var len = (3 + k * 26) * (0.4 + r() * 0.8), x = gauss(r) * spread - len / 2;
        s += '<path d="M' + n(x) + " " + n(y) + "h" + n(len) + '" stroke-width="' + n(0.6 + k * 1.5) +
          '" opacity="' + n(0.35 + r() * 0.65) + '"/>';
      }
      y += (1.3 + k * 5.5) * (0.6 + r() * 0.6);
    }
    return s;
  }
  // A swell: one long low lens of shade with a pale crest riding on it.
  function swell(seed, y, amp, thick) {
    var nz = noise(seed), up = [], dn = [], x;
    for (x = -10; x <= W + 10; x += 10) up.push([x, y + (nz(x * 0.012) - 0.5) * amp * 2]);
    for (x = W + 10; x >= -10; x -= 10) dn.push([x, y + (nz(x * 0.012) - 0.5) * amp * 2 + thick * (0.3 + nz(x * 0.02 + 40))]);
    var crest = "M" + up.map(function (p) { return n(p[0]) + " " + n(p[1] - 0.4); }).join("L");
    return '<path class="w-trough" d="' + poly(up.concat(dn)) + '"/><path class="w-crest" d="' + crest + '"/>';
  }

  // A piling with a lit edge and a wet foot.
  // wetH (optional): how high the wet band climbs, for a tide that is known
  function pile(r, x, top, bot, w, cls, wetH) {
    var tilt = (r() - 0.5) * w * 0.5, cut = (r() - 0.3) * w * 0.4, wt = w * 0.84;
    var s = '<path class="' + (cls || "w-pile") + '" d="' + poly([[x - wt / 2 + tilt, top + cut], [x + wt / 2 + tilt, top], [x + w / 2, bot], [x - w / 2, bot]]) + '"/>';
    s += '<path class="w-litl" d="' + poly([[x - wt / 2 + tilt, top + cut], [x - wt / 2 + tilt + w * 0.26, top + cut * 0.7], [x - w / 2 + w * 0.26, bot], [x - w / 2, bot]]) + '"/>';
    s += '<path class="w-litr" d="' + poly([[x + wt / 2 + tilt - w * 0.26, top + cut * 0.3], [x + wt / 2 + tilt, top], [x + w / 2, bot], [x + w / 2 - w * 0.26, bot]]) + '"/>';
    s += '<path class="w-cap" d="' + poly([[x - wt / 2 + tilt, top + cut], [x + wt / 2 + tilt, top], [x + wt / 2 + tilt, top + 1.3], [x - wt / 2 + tilt, top + cut + 1.3]]) + '"/>';
    var wet = Math.min(16, (bot - top) * 0.3) * (0.7 + r() * 0.5);
    if (wetH != null) wet = Math.min(bot - top - 1, wetH);
    s += '<path class="w-wet" d="' + poly([[x - w / 2 - 0.2, bot - wet], [x + w / 2 + 0.2, bot - wet + (r() - 0.5) * 2], [x + w / 2 + 0.3, bot], [x - w / 2 - 0.3, bot]]) + '"/>';
    return s;
  }
  // Its reflection, breaking up as it goes, and the ring where it meets
  // the water.
  function pileGlass(r, x, bot, w, len) {
    var s = "", y = bot + 0.6, k = 0, m = Math.max(4, Math.round(len / 3.2));
    for (; k < m; k++) {
      var f = k / m, ww = w * (1 - f * 0.25) * (0.75 + r() * 0.5), hh = 1.5 + f * 1.2;
      var jx = (r() - 0.5) * (1.2 + f * 5);
      s += '<rect x="' + n(x - ww / 2 + jx) + '" y="' + n(y) + '" width="' + n(ww) + '" height="' + n(hh) + '" rx="' + n(hh / 2) +
        '" opacity="' + n((1 - f) * (1 - f) * 0.62) + '"/>';
      y += hh + 0.9 + f * 2.2;
    }
    return '<g class="w-glass">' + s + '</g><ellipse class="w-ring" cx="' + n(x) + '" cy="' + n(bot + 0.2) + '" rx="' + n(w * 0.95) + '" ry="1.1"/>';
  }

  // ---- shared sky and water --------------------------------------------------
  function mountain(x, y, sc) {
    // Rainier from the Sound: a wide shouldered dome, never a point. Liberty
    // Cap on the north side, Point Success on the south, Little Tahoma as a
    // tooth low on the left. Snow body, rock in shade, one lit snowfield.
    var P = [[0, 70], [14, 66], [28, 61], [40, 55], [50, 49], [57, 43], [61, 38.5], [63.5, 33.5], [66, 37.5], [71, 34], [78, 26], [85, 18], [91, 12.5], [96, 9.5],
      [101, 8.2], [105, 9], [109, 6.8], [114, 5.2], [119, 4.6], [124, 5.4], [128, 7.6], [132, 7], [136, 8.8], [141, 13], [147, 19], [155, 27], [164, 35.5], [174, 44],
      [185, 53], [197, 62], [210, 70]];
    var s1 = poly([[124, 5.4], [128, 7.6], [132, 7], [136, 8.8], [141, 13], [147, 19], [155, 27], [164, 35.5], [174, 44], [185, 53], [197, 62], [210, 70], [176, 70], [160, 51], [147, 35], [137, 22], [129, 12]]);
    var s2 = poly([[109, 6.8], [114, 5.2], [116.5, 15], [114, 29], [107, 46], [98, 70], [85, 70], [96, 47], [104, 29], [107.5, 15]]);
    var s3 = poly([[63.5, 33.5], [66, 37.5], [71, 34], [73, 44], [67, 57], [60, 70], [50, 70], [57, 55], [62, 44]]);
    var s4 = poly([[132, 7], [136, 8.8], [140, 22], [139, 40], [133, 58], [128, 70], [120, 70], [128, 52], [133, 36], [134, 20]]);
    var l1 = poly([[96, 9.5], [101, 8.2], [105, 9], [109, 6.8], [107.5, 15], [104, 29], [99, 36], [92, 27], [91.5, 17]]);
    var l2 = poly([[78, 26], [85, 18], [88, 26], [86, 40], [80, 54], [73, 44], [71, 34]]);
    return '<g class="w-mtn" transform="translate(' + x + " " + y + ") scale(" + sc + ')">' +
      '<path class="w-mtn-b" d="' + poly(P) + '"/><path class="w-mtn-s" d="' + s1 + '"/><path class="w-mtn-s2" d="' + s2 + '"/>' +
      '<path class="w-mtn-s2" d="' + s3 + '"/><path class="w-mtn-s2" d="' + s4 + '"/><path class="w-mtn-l" d="' + l1 + '"/><path class="w-mtn-l" d="' + l2 + '"/></g>';
  }
  function clouds(seed, id) {
    var r = rnd(seed), s = "", i;
    for (i = 0; i < 9; i++) {
      var cy = 18 + r() * (HZ - 52), cx = r() * W, rx = 60 + r() * 130, ry = 2.5 + r() * 7.5;
      s += '<ellipse class="' + (i % 3 === 0 ? "w-cl-d" : "w-cl-l") + '" cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) + '"/>';
    }
    return '<g class="w-clouds" filter="url(#' + id + '-b5)">' + s + "</g>";
  }
  function stars(seed) {
    var r = rnd(seed), s = "";
    for (var i = 0; i < 46; i++) {
      var y = r() * r() * (HZ - 40);
      s += '<circle cx="' + n(r() * W) + '" cy="' + n(4 + y) + '" r="' + n(0.35 + r() * r() * 0.75) + '" opacity="' + n(0.35 + r() * 0.65) + '"/>';
    }
    return '<g class="w-stars">' + s + "</g>";
  }
  function defs(id, extra) {
    return "<defs>" +
      '<linearGradient id="' + id + '-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/>' +
      '<stop offset=".64" style="stop-color:color-mix(in oklab,var(--sky1) 93%,var(--hz))"/><stop offset=".87" style="stop-color:color-mix(in oklab,var(--sky1) 44%,var(--hz))"/><stop offset="1" style="stop-color:var(--hz)"/></linearGradient>' +
      '<linearGradient id="' + id + '-wat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--water1)"/><stop offset="1" style="stop-color:var(--water2)"/></linearGradient>' +
      '<linearGradient id="' + id + '-hzr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--hz);stop-opacity:.62"/><stop offset="1" style="stop-color:var(--hz);stop-opacity:0"/></linearGradient>' +
      '<radialGradient id="' + id + '-glow"><stop offset="0" style="stop-color:var(--glowc);stop-opacity:1"/><stop offset=".28" style="stop-color:var(--glowc);stop-opacity:.5"/><stop offset="1" style="stop-color:var(--glowc);stop-opacity:0"/></radialGradient>' +
      '<radialGradient id="' + id + '-lamp"><stop offset="0" style="stop-color:var(--lampc);stop-opacity:.95"/><stop offset=".22" style="stop-color:var(--lampc);stop-opacity:.4"/><stop offset="1" style="stop-color:var(--lampc);stop-opacity:0"/></radialGradient>' +
      '<linearGradient id="' + id + '-mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>' +
      '<mask id="' + id + '-mtnm" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect x="0" y="70" width="' + W + '" height="' + (HZ - 66) + '" fill="url(#' + id + '-mtn)"/></mask>' +
      '<filter id="' + id + '-b5" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="7 2.6"/></filter>' +
      '<filter id="' + id + '-b9" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="10 3.4"/></filter>' +
      '<filter id="' + id + '-b2" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.2 1.2"/></filter>' +
      // reflections waver sideways only: turbulence drives x, y is held still
      '<filter id="' + id + '-wv" x="-6%" y="-6%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency="0.011 0.36" numOctaves="2" seed="7" result="t"/>' +
      '<feColorMatrix in="t" type="matrix" values="1 0 0 0 0  0 0 0 0 .5  0 0 1 0 0  0 0 0 0 1" result="m"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="m" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>' +
      (extra || "") + "</defs>";
  }
  function skyLayer(id, o) {
    o = o || {};
    // o.town: a spot's sky after dark carries the towns' warm glow low along
    // the skyline (every spot on a card is within reach of one), behind the
    // land; scene.css shows it only at night
    return '<rect class="w-skyf" width="' + W + '" height="' + (HZ + 2) + '" fill="url(#' + id + '-sky)"/>' +
      '<g class="w-lightpos"><circle r="150" fill="url(#' + id + '-glow)" class="w-glow"/></g>' +
      (o.town ? '<ellipse class="w-skyglow" cx="' + (o.townX != null ? n(o.townX) : W / 2 + ((o.seed || 0) % 7 - 3) * 22) + '" cy="' + (HZ + 4) + '" rx="300" ry="40" fill="url(#' + id + '-lamp)"/>' : "") +
      stars(o.seed + 5) + clouds(o.seed + 3, id) +
      (o.mtn ? '<g mask="url(#' + id + '-mtnm)">' + mountain(o.mtn[0], o.mtn[1], o.mtn[2]) + "</g>" : "");
  }
  function reflect(id, key, hl, k, cls, along) {
    // a tile (a list row's thumbnail, 48 px) leaves the land's copy in the
    // water out: it does not show at that size and doubles the drawing
    // (a Water tab tile whose card asks for it, o.glass, keeps it: a still
    // lake is known by its trees in the water)
    if (TILE && !GLASS) return { def: "", svg: "" };
    // the land again, upside down and squashed, fading as it leaves the shore.
    // along: the shore's foot slopes across the picture (a far bank running
    // away into it), so the mirror lies along that foot and not along a
    // level line, or the mirrored foot would cross the trees as a band
    var b = hl.base(0), g = id + "-rf" + key, c = along ? (hl.base(W) - b) / W : 0;
    var f4 = function (v) { return String(Math.round(v * 1e4) / 1e4); };
    var tr = c ? "matrix(1 " + f4((1 + k) * c) + " 0 " + f4(-k) + " 0 " + f4(b * (1 + k)) + ")" : "translate(0 " + n(b * (1 + k)) + ") scale(1 " + n(-k) + ")";
    return {
      def: '<linearGradient id="' + g + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + n(b) + '" x2="0" y2="' + n(b - hl.maxH * 1.02) + '">' +
        '<stop offset="0" class="' + cls + '-stop" stop-opacity=".74"/><stop offset=".6" class="' + cls + '-stop" stop-opacity=".34"/><stop offset="1" class="' + cls + '-stop" stop-opacity="0"/></linearGradient>',
      svg: '<g filter="url(#' + id + '-wv)"><g transform="' + tr + '" fill="url(#' + g + ')"><path d="' + hl.land + '"/>' +
        (hl.trees ? '<path d="' + hl.trees + '"/>' : "") + "</g></g>"
    };
  }
  function land(hl, cls, rim) {
    // rim: the same trees once more behind, nudged toward the light and
    // tinted with it, so the lit side of every fir catches an edge
    return (rim && hl.trees ? '<path class="w-rim" d="' + hl.trees + '"/>' : "") +
      '<g class="' + cls + '"><path d="' + hl.land + '"/>' + (hl.trees ? '<path d="' + hl.trees + '"/>' : "") + "</g>";
  }
  function mist(id, seed, y, k) {
    var r = rnd(seed), s = "";
    for (var i = 0; i < 3; i++) {
      s += '<ellipse cx="' + n(r() * W) + '" cy="' + n(y - 2 - r() * 5) + '" rx="' + n(70 + r() * 120) + '" ry="' + n((4 + r() * 6) * (k || 1)) + '" opacity="' + n(0.45 + r() * 0.4) + '"/>';
    }
    return '<g class="w-mist" filter="url(#' + id + '-b9)">' + s + "</g>";
  }
  // Lights on a far shore: a point, and a thread of it in the water.
  function shoreLights(seed, hl, cnt, len, x0, x1) {
    var r = rnd(seed), s = "";
    x0 = x0 == null ? hl.a + 6 : x0; x1 = x1 == null ? hl.b - 6 : x1;
    for (var i = 0; i < cnt; i++) {
      // towns bunch up: square the roll so the lights gather at one end
      var x = x0 + (1 - r() * r()) * (x1 - x0), y = hl.base(x) - 0.5 - r() * 1.6, l = len * (0.35 + r() * 0.8), big = r() < 0.22;
      if (x < 2 || x > W - 2) continue;
      var d = "M" + n(x) + " " + n(y + 1.4);
      for (var q = 1; q <= 3; q++) d += "L" + n(x + (r() - 0.5) * 1.1) + " " + n(y + 1.4 + (l * q) / 3);
      s += '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + (big ? 0.85 : 0.5) + '" opacity="' + n(0.6 + r() * 0.4) + '"/><path d="' + d + '" stroke-width="' + (big ? 0.8 : 0.5) + '" opacity="' + n(0.22 + r() * 0.3) + '"/>';
    }
    return s;
  }
  // A lit window on a near bank after dark: its glow in the trees, the two
  // panes, and the broken ladder of gold it lays on the water at wy. It is
  // there only when the lamps are on (w-lampson), like the pier's.
  function litWindow(id, r, x, y, wy) {
    var s = '<circle cx="' + x + '" cy="' + n(y - 0.4) + '" r="24" fill="url(#' + id + '-lamp)"/><g class="w-poolg">' +
      '<rect x="' + n(x - 1.7) + '" y="' + n(y - 1.3) + '" width="1.4" height="2.4"/><rect x="' + n(x + 0.3) + '" y="' + n(y - 1.3) + '" width="1.4" height="2.4"/>';
    for (var k = 0; k < 12; k++) {
      var q = k / 12, ww = (4 + q * 11) * (0.55 + r() * 0.75), yy = wy + 1.4 + k * (1.5 + q * 2.4);
      s += '<rect x="' + n(x - ww / 2 + (r() - 0.5) * (1 + q * 8)) + '" y="' + n(yy) + '" width="' + n(ww) + '" height="' + n(0.75 + q * 1) +
        '" rx=".5" opacity="' + n((1 - q * 0.8) * (0.5 + r() * 0.5)) + '"/>';
    }
    return '<g class="w-lampson w-window">' + s + "</g></g>";
  }
  function shoreEdge(pts) {
    // where the page meets the water: the ground the cards stand on
    var d = line(pts);
    var wet = line(pts.map(function (p) { return [p[0], p[1] - 5]; })) + "L" + W + " " + H + "L0 " + H + "Z";
    return '<path class="w-shorewet" d="' + wet + '"/><path class="w-shore" d="' + d + "L" + (W + 2) + " " + (H + 2) + "L-2 " + (H + 2) + 'Z"/>' +
      '<path class="w-foam" d="' + d + '"/>';
  }
  function svg(cls, inner) {
    return '<svg class="' + cls + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">' + inner + "</svg>";
  }
  function waterLayer(id, y) {
    y = y == null ? HZ : y;
    return '<rect y="' + y + '" width="' + W + '" height="' + (H - y) + '" fill="url(#' + id + '-wat)"/>' +
      '<rect y="' + y + '" width="' + W + '" height="46" fill="url(#' + id + '-hzr)"/>' +
      '<g class="w-lightx"><ellipse cx="0" cy="' + y + '" rx="58" ry="' + (H - y) + '" fill="url(#' + id + '-glow)" class="w-road"/></g>';
  }
  // dens: how busy the water is. 1 is the Sound on a light breeze, less is stiller.
  function glintLayers(seed, y0, y1, dens) {
    dens = dens == null ? 1 : dens;
    var a = '<g class="w-gl">' + glints(seed, dens, y0, y1) + "</g>" + '<g class="w-lightx"><g class="w-gr">' + lightRoad(seed + 2, y0, y1) + "</g></g>";
    var b = '<g class="w-gl">' + glints(seed + 1, dens, y0, y1) + "</g>" + '<g class="w-lightx"><g class="w-gr">' + lightRoad(seed + 3, y0, y1) + "</g></g>";
    return svg("sc sc-gl sc-gl-a", a) + svg("sc sc-gl sc-gl-b", b);
  }

  // ---- scene one: the Sound -------------------------------------------------
  // Headlands lock together from both sides, each with its own waterline, a
  // mountain stands behind, old pilings stand in front.
  function sound(id) {
    var r = rnd(41);
    var far = headland({ seed: 3, from: -10, to: 420, base: HZ, h: 15, tree: 1.6, gap: 2.2, shape: 9, freq: 0.012, tipFade: 60 });
    var A = headland({ seed: 12, from: -10, to: 236, base: HZ + 1.5, h: 13, tree: 3.4, gap: 1.9 });
    var B = headland({ seed: 23, from: 400, to: 132, base: HZ + 5, h: 19, tree: 5.6, gap: 2.3, shape: 2 });
    var C = headland({ seed: 37, from: -10, to: 176, base: HZ + 12, h: 17, tree: 17, trees: true, shape: 2.1 });
    var D = headland({ seed: 58, from: 402, to: 262, base: HZ + 25, h: 20, tree: 38, trees: true, shape: 2.6, tfreq: 0.05 });
    var rA = reflect(id, "a", A, 0.55, "w-l1"), rB = reflect(id, "b", B, 0.55, "w-l2"), rC = reflect(id, "c", C, 0.5, "w-l3"), rD = reflect(id, "d", D, 0.46, "w-l5");

    var back = defs(id) + skyLayer(id, { seed: 100, mtn: [188, 98, 0.98] }) +
      '<path class="w-far" d="' + far.land + '"/>' + waterLayer(id) +
      swell(7, 214, 2.2, 3.5) + swell(8, 243, 3, 5) + swell(9, 281, 4, 7);

    var mid = defs(id + "m", rA.def + rB.def + rC.def + rD.def) +
      rA.svg + land(A, "w-l1") + '<g class="w-lights">' + shoreLights(5, A, 16, 6, 60, 228) + "</g>" + mist(id + "m", 61, HZ + 3) +
      rB.svg + land(B, "w-l2") + '<g class="w-lights">' + shoreLights(6, B, 9, 7, 150, 300) + "</g>" + mist(id + "m", 62, HZ + 9) +
      rC.svg + land(C, "w-l3") + '<path class="w-beach" d="M-4 ' + n(HZ + 12.2) + 'H150"/>' + mist(id + "m", 63, HZ + 20, 0.8) +
      rD.svg + land(D, "w-l5", true) + '<path class="w-beach" d="M286 ' + n(HZ + 25.2) + 'H394"/>';

    // the old dock: a ragged row of piles, cropped by the card below
    var piles = "", glass = "", px = [[24, 172, 254, 8], [42, 183, 249, 6.6], [63, 166, 258, 9], [87, 190, 246, 6], [106, 179, 252, 7.2]];
    px.forEach(function (p) { glass += pileGlass(r, p[0], p[2], p[3], 26); piles += pile(r, p[0], p[1], p[2], p[3]); });
    // a cross timber still bolted to two of them
    piles += '<path class="w-pile" d="' + poly([[20.5, 196], [67, 189.5], [67.2, 193.6], [20.5, 200.4]]) + '"/><path class="w-liteb" d="M20.5 196L67 189.5"/>';
    // a cormorant on one of them, the way there always is
    piles += '<path class="w-pile" transform="translate(41.6 37.6)" d="' + poly([[61.2, 141.6], [60.4, 137.4], [61, 134.2], [62.4, 132.4], [62.2, 130.6], [63.2, 129.6], [65.4, 130], [64, 130.9], [64.2, 132.8], [65.2, 135.4], [65.9, 139], [67.6, 143.4], [65.4, 141.8]]) + '"/>';
    var front = defs(id + "f") + '<g filter="url(#' + id + 'f-wv)">' + glass + "</g>" + piles +
      shoreEdge([[-2, 304], [60, 301], [130, 303], [200, 307], [270, 308], [330, 306], [392, 309]]);

    return svg("sc sc-back", back) + glintLayers(200, HZ + 2.5, H) + svg("sc sc-mid", mid) + svg("sc sc-front", front);
  }

  // ---- scene two: the pier ---------------------------------------------------
  // Seen from the bluff, a little above the deck, so the planks, both rails
  // and the people on them all show. One-point perspective: every part is
  // a point at the near end pulled toward the vanishing point by s.
  function pier(id) {
    var r = rnd(77);
    var far = headland({ seed: 4, from: -10, to: 420, base: HZ, h: 12, tree: 1.5, gap: 2.2, shape: 9, freq: 0.011, tipFade: 60 });
    var A = headland({ seed: 15, from: -10, to: 262, base: HZ + 1.5, h: 12, tree: 3.2, gap: 1.9 });
    var B = headland({ seed: 26, from: 400, to: 214, base: HZ + 3.5, h: 14, tree: 4.4, gap: 2.2, shape: 2 });
    var C = headland({ seed: 39, from: -10, to: 122, base: HZ + 14, h: 12, tree: 16, trees: true, shape: 2.2 });
    var rA = reflect(id, "a", A, 0.55, "w-l1"), rB = reflect(id, "b", B, 0.55, "w-l2"), rC = reflect(id, "c", C, 0.5, "w-l3");
    var back = defs(id) + skyLayer(id, { seed: 300, mtn: [128, 104, 0.9] }) +
      '<path class="w-far" d="' + far.land + '"/>' + waterLayer(id) + swell(17, 222, 2.2, 3.5) + swell(18, 254, 3, 5) + swell(19, 288, 4, 7);
    var mid = defs(id + "m", rA.def + rB.def + rC.def) +
      rA.svg + land(A, "w-l1") + '<g class="w-lights">' + shoreLights(8, A, 18, 6, 20, 240) + "</g>" + mist(id + "m", 71, HZ + 3) +
      rB.svg + land(B, "w-l2") + '<g class="w-lights">' + shoreLights(9, B, 12, 7, 200, 330) + "</g>" + mist(id + "m", 72, HZ + 8) +
      rC.svg + land(C, "w-l3") + '<path class="w-beach" d="M-4 ' + n(HZ + 14.2) + 'H104"/>';

    var VX = 96, NX = 418, FX = 409;                 // vanishing point, near and far rail at the near end
    var yN = 27, yF = 19, ySea = 77, ySeaF = 66, TH = 5.2;   // depths under the horizon at the near end
    function P(x1, dy, s) { return [VX + (x1 - VX) * s, HZ + dy * s]; }
    var N = 12, S = [], i;
    for (i = 0; i <= N; i++) S.push(1 / (1 + 0.3 * i));
    var s0 = 1.04, sE = S[N];
    function seg(x1, dy) { return [P(x1, dy, s0), P(x1, dy, sE)]; }
    var under = poly([P(NX, ySeaF, s0), P(FX, ySeaF, sE), P(NX, ySea + 14, sE), P(NX, ySea + 14, s0)]);
    var deck = poly([P(NX, yN, s0), P(NX, yN, sE), P(FX, yF, sE), P(FX, yF, s0)]);
    var fascia = poly([P(NX, yN, s0), P(NX, yN, sE), P(NX, yN + TH, sE), P(NX, yN + TH, s0)]);
    var cap = poly([P(NX, yN, sE), P(FX, yF, sE), P(FX, yF + TH, sE), P(NX, yN + TH, sE)]);
    var pilesN = "", pilesF = "", glass = "", braces = "", railN = "", railF = "", planks = "";
    S.forEach(function (s, k) {
      var t = P(NX, yN + TH, s), bt = P(NX, ySea, s), w = 1.1 + 7.8 * s;
      var tf = P(FX, yF + TH, s), bf = P(FX, ySeaF, s);
      pilesF += '<path class="w-pile2" d="' + poly([[tf[0] - w * 0.36, tf[1]], [tf[0] + w * 0.36, tf[1]], [bf[0] + w * 0.4, bf[1]], [bf[0] - w * 0.4, bf[1]]]) + '"/>';
      glass += pileGlass(r, bt[0], bt[1], w, 5 + 30 * s);
      pilesN += pile(r, bt[0], t[1], bt[1], w, "w-pp");
      if (k > 0) {
        var ps = S[k - 1], t0 = P(NX, yN + TH + 3, ps), b0 = P(NX, ySea - 7, ps), t1 = P(NX, yN + TH + 3, s), b1 = P(NX, ySea - 7, s);
        braces += '<path d="M' + n(t0[0]) + " " + n(t0[1]) + "L" + n(b1[0]) + " " + n(b1[1]) + "M" + n(t1[0]) + " " + n(t1[1]) + "L" + n(b0[0]) + " " + n(b0[1]) + '" stroke-width="' + n(0.4 + 1.2 * s) + '"/>';
      }
      var rn = P(NX, yN, s), rf = P(FX, yF, s);
      railN += "M" + n(rn[0]) + " " + n(rn[1]) + "v" + n(-11.6 * s);
      railF += "M" + n(rf[0]) + " " + n(rf[1]) + "v" + n(-11.6 * s);
      planks += "M" + n(rn[0]) + " " + n(rn[1]) + "L" + n(rf[0]) + " " + n(rf[1]);
    });
    railN += line(seg(NX, yN - 11.6)) + line(seg(NX, yN - 6));
    railF += line(seg(FX, yF - 11.6));
    // lamp posts stand on the far rail and lean their heads over the deck
    var lamps = "", glows = "", pools = "", deckPools = "", people = "";
    [1, 3, 5, 8, 11].forEach(function (bi, li) {
      var s = S[bi], f = P(FX, yF, s), hgt = 44 * s, hx = f[0] - 7.5 * s, hy = f[1] - hgt;
      lamps += '<path class="w-pole" d="M' + n(f[0]) + " " + n(f[1]) + "V" + n(hy + 4 * s) + "Q" + n(f[0]) + " " + n(hy) + " " + n(hx + 1.4 * s) + " " + n(hy) + '" stroke-width="' + n(0.6 + 1.8 * s) + '"/>' +
        '<path class="w-pile" d="' + poly([[hx - 3.8 * s, hy - 0.9 * s], [hx + 2.6 * s, hy - 1.7 * s], [hx + 3.2 * s, hy + 1.2 * s], [hx - 4.2 * s, hy + 1.8 * s]]) + '"/>' +
        '<ellipse class="w-bulb" cx="' + n(hx - 0.5 * s) + '" cy="' + n(hy + 2.3 * s) + '" rx="' + n(3 * s) + '" ry="' + n(1.3 * s) + '"/>';
      glows += '<circle cx="' + n(hx) + '" cy="' + n(hy + 3 * s) + '" r="' + n(46 * s + 7) + '" fill="url(#' + id + 'f-lamp)"/>';
      var dn = P(NX, yN, s);
      deckPools += '<ellipse cx="' + n(hx - 2 * s) + '" cy="' + n((dn[1] + f[1]) / 2) + '" rx="' + n(24 * s) + '" ry="' + n(3.1 * s) + '"/>' +
        '<path class="w-cone" d="' + poly([[hx - 2.4 * s, hy + 2.6 * s], [hx + 2.4 * s, hy + 2.6 * s], [hx + 19 * s, dn[1]], [hx - 25 * s, dn[1]]]) + '"/>';
      // on the water: a wide soft pool and a broken ladder of gold under it
      var wy = HZ + ySea * s + 4 * s, k, ps = "";
      for (k = 0; k < 9; k++) {
        var q = k / 9, ww = (30 - q * 17) * s * (0.6 + r() * 0.7), yy = wy + k * (2 + q * 1.8) * (0.55 + s);
        ps += '<rect x="' + n(hx - 4 * s - ww / 2 + (r() - 0.5) * 10 * s) + '" y="' + n(yy) + '" width="' + n(ww) + '" height="' + n(0.8 + 1.6 * s) + '" rx="1" opacity="' + n((1 - q) * (0.5 + r() * 0.5)) + '"/>';
      }
      pools += '<ellipse class="w-pool" cx="' + n(hx - 4 * s) + '" cy="' + n(wy + 8 * s) + '" rx="' + n(44 * s) + '" ry="' + n(12 * s) + '" fill="url(#' + id + 'f-lamp)"/><g class="w-poolg">' + ps + "</g>";
      // a crowded rail on a good night: people under the near lamps, rods out
      if (li < 3) {
        [[-15, 15.2, 1], [-29, 13.8, 1], [12, 15.6, 0]].slice(0, li === 2 ? 1 : 3).forEach(function (g) {
          var fx = dn[0] + g[0] * s, fy = dn[1] - 1.2 * s, fh = g[1] * s;
          people += '<path class="w-fig" d="M' + n(fx) + " " + n(fy) + "V" + n(fy - fh * 0.74) + '" stroke-width="' + n(3.5 * s) + '"/>' +
            '<circle class="w-figh" cx="' + n(fx - 0.3 * s) + '" cy="' + n(fy - fh) + '" r="' + n(1.8 * s) + '"/>';
          if (g[2]) people += '<path class="w-rod" d="M' + n(fx - 1.2 * s) + " " + n(fy - fh * 0.55) + "L" + n(fx - 18 * s) + " " + n(fy - fh * 0.2) + '" stroke-width="' + n(0.4 + 0.55 * s) + '"/>' +
            '<path class="w-line" d="M' + n(fx - 18 * s) + " " + n(fy - fh * 0.2) + "V" + n(HZ + (ySea + 6) * s) + '"/>';
        });
      }
    });
    var extra = '<linearGradient id="' + id + 'f-deck" gradientUnits="userSpaceOnUse" x1="' + n(P(NX, 0, sE)[0]) + '" y1="0" x2="400" y2="0">' +
      '<stop offset="0" style="stop-color:var(--r3)"/><stop offset=".4" style="stop-color:var(--r4)"/><stop offset="1" style="stop-color:var(--r5)"/></linearGradient>';
    var front = defs(id + "f", extra) +
      '<g filter="url(#' + id + 'f-wv)"><path class="w-under" d="' + under + '" filter="url(#' + id + 'f-b2)"/></g>' +
      '<g class="w-lampson">' + pools + "</g>" +
      '<g filter="url(#' + id + 'f-wv)">' + glass + "</g>" +
      pilesF + '<path class="w-rail w-railf" d="' + railF + '"/>' +
      '<path class="w-decktop" d="' + deck + '"/><path class="w-planks" d="' + planks + '"/>' +
      '<g class="w-lampson w-deckpool">' + deckPools + "</g>" +
      '<g class="w-braces">' + braces + "</g>" +
      '<g fill="url(#' + id + 'f-deck)">' + pilesN + '<path d="' + fascia + '"/><path d="' + cap + '"/></g>' +
      '<path class="w-liteb" d="' + line(seg(NX, yN)) + '"/>' +
      lamps + people + '<path class="w-rail" d="' + railN + '"/>' +
      '<g class="w-lampson">' + glows + "</g>" +
      shoreEdge([[-2, 305], [60, 302], [130, 304], [200, 308], [270, 309], [330, 307], [392, 310]]);
    return svg("sc sc-back", back) + glintLayers(400, HZ + 2.5, H) + svg("sc sc-mid", mid) + svg("sc sc-front", front);
  }

  // ---- scene three: the river ------------------------------------------------
  // The Green in November: a far hill, a wall of fir on the outside of the
  // bend, bare alders at the water, and the gravel bar you are standing on.
  function river(id) {
    var r = rnd(91), RY = 198, k;
    var hill = headland({ seed: 7, from: 440, to: -160, base: RY - 6, h: 56, tree: 2.6, gap: 2.1, shape: 3, freq: 0.009, tipFade: 60 });
    var hill2 = headland({ seed: 18, from: 430, to: 96, base: RY - 3, h: 38, tree: 6.5, gap: 2.4, shape: 2.2, freq: 0.014 });
    var bank = headland({ seed: 31, from: -30, to: 430, base: RY, h: 5, tree: 29, trees: true, shape: 12, tipFade: 60, tfreq: 0.03 });
    // the near bank climbs the right edge: its waterline falls toward you,
    // and wanders, because banks do
    var wob = noise(53);
    function nu(x) { return Math.max(0, x - 230) / 160; }
    function nb(x) { var u = nu(x); return RY + 4 + 58 * Math.pow(u, 1.22) + (wob(x * 0.075) - 0.5) * 8 * Math.min(1, u * 3); }
    var near = headland({ seed: 44, from: 424, to: 230, base: nb, h: 12, tree: 44, trees: true, shape: 3, tfreq: 0.04, tipFade: 5,
      grow: function (x) { return 0.5 + nu(x) * 1.5; } });
    var rB = reflect(id, "b", bank, 0.62, "w-l3");
    var back = defs(id) + skyLayer(id, { seed: 500 }) +
      '<path class="w-l0" d="' + hill.land + '"/>' + mist(id, 81, RY - 22, 1.5) +
      '<path class="w-l1" d="' + hill2.land + '"/>' + mist(id, 82, RY - 8, 1.2) +
      waterLayer(id, RY - 2);
    // alders: pale bare trunks leaning out over the water
    var alders = "";
    [[52, 31], [69, 23], [124, 35], [139, 26], [188, 39], [205, 28], [221, 21]].forEach(function (a) {
      var x = a[0], h = a[1], lean = (r() - 0.35) * 8, d = "M" + x + " " + (RY + 0.5) + "Q" + n(x + lean * 0.2) + " " + n(RY - h * 0.55) + " " + n(x + lean) + " " + n(RY - h);
      alders += '<path d="' + d + '" stroke-width="' + n(1.1 + h * 0.024) + '"/>';
      for (var q = 0; q < 6; q++) {
        var f = 0.3 + q * 0.12 + r() * 0.05, bx = x + lean * f * f, by = RY - h * f, dir = q % 2 ? 1 : -1, bl = h * (0.34 - q * 0.035) * (0.7 + r() * 0.6);
        alders += '<path d="M' + n(bx) + " " + n(by) + "Q" + n(bx + dir * bl * 0.5) + " " + n(by - bl * 0.25) + " " + n(bx + dir * bl * 0.8) + " " + n(by - bl * 0.85) + '" stroke-width="' + n(0.5 + (1 - f) * 0.6) + '"/>';
      }
    });
    // a riffle where the river comes round the bend
    var rf = "";
    for (k = 0; k < 54; k++) {
      var ry = RY + 3 + r() * r() * 17, rx = 14 + r() * 214, rl = 2 + r() * 7 + (ry - RY) * 0.3;
      rf += '<path d="M' + n(rx) + " " + n(ry) + "q" + n(rl / 2) + " " + n(-0.7 - r() * 0.6) + " " + n(rl) + ' 0" opacity="' + n(0.35 + r() * 0.6) + '"/>';
    }
    // the bank's own dark in the water, and the rocks along its foot
    var shadeTop = [], shadeBot = [], rocks = "", x;
    for (x = 232; x <= 396; x += 8) { shadeTop.push([x, nb(x) - 1]); shadeBot.unshift([x - 4 - nu(x) * 10, nb(x) + 5 + nu(x) * 26]); }
    for (x = 244; x < 392; x += 9 + r() * 15) {
      var u = nu(x), rw = (2.5 + r() * 4.5) * (0.6 + u), rh = rw * (0.45 + r() * 0.25), by2 = nb(x) + 1.2;
      rocks += '<path class="w-rock" d="' + poly([[x - rw, by2], [x - rw * 0.7, by2 - rh * 0.8], [x - rw * 0.1, by2 - rh], [x + rw * 0.6, by2 - rh * 0.7], [x + rw, by2]]) + '"/>' +
        '<path class="w-rock-l" d="M' + n(x - rw * 0.7) + " " + n(by2 - rh * 0.8) + "L" + n(x - rw * 0.1) + " " + n(by2 - rh) + '"/>';
    }
    var edge = [];
    for (x = 236; x <= 394; x += 6) edge.push([x, nb(x) + 0.8]);
    // after dark: one lit window in the firs on the far bank, and its light on the river
    var mid = defs(id + "m", rB.def) + rB.svg + land(bank, "w-l3") + '<path class="w-beach" d="M-4 ' + n(RY + 0.4) + 'H232"/>' +
      litWindow(id + "m", rnd(63), 158, RY - 8.6, RY) +
      '<g class="w-alder">' + alders + "</g>" + mist(id + "m", 83, RY + 3, 0.9) +
      '<g class="w-riffle">' + rf + "</g>" +
      '<g filter="url(#' + id + 'm-wv)"><path class="w-under" d="' + poly(shadeTop.concat(shadeBot)) + '" filter="url(#' + id + 'm-b2)"/></g>' +
      land(near, "w-l5", true) + '<path class="w-beach" d="' + line(edge) + '"/>' + rocks;

    // the gravel bar: the page's own ground, stippled, with a drift log
    var bar = [[-2, 224], [34, 226], [78, 233], [124, 246], [168, 263], [206, 284], [236, 308], [252, 332]];
    var stones = "", s2 = rnd(5);
    for (k = 0; k < 210; k++) {
      var uu = s2(), sx = -4 + uu * 250, e = 224 + Math.pow(Math.max(0, sx) / 250, 1.7) * 108, sy = e + 3 + s2() * s2() * 56, sz = 0.45 + s2() * s2() * 2.4 * (0.6 + (sy - 224) / 120);
      stones += '<ellipse class="' + (s2() < 0.3 ? "w-st-l" : "w-st-d") + '" cx="' + n(sx) + '" cy="' + n(sy) + '" rx="' + n(sz) + '" ry="' + n(sz * (0.45 + s2() * 0.2)) + '"/>';
    }
    // three stones big enough to carry a shade and a light
    [[30, 247, 8, -8], [98, 259, 6.5, 6], [142, 262, 5, -4]].forEach(function (c) {
      stones += '<g transform="rotate(' + c[3] + " " + c[0] + " " + c[1] + ')"><ellipse class="w-cob-sh" cx="' + (c[0] + 1.5) + '" cy="' + n(c[1] + c[2] * 0.42) + '" rx="' + n(c[2] * 1.05) + '" ry="' + n(c[2] * 0.26) + '"/>' +
        '<ellipse class="w-cob" cx="' + c[0] + '" cy="' + c[1] + '" rx="' + c[2] + '" ry="' + n(c[2] * 0.5) + '"/>' +
        '<path class="w-cob-s" d="M' + (c[0] - c[2]) + " " + c[1] + "a" + c[2] + " " + n(c[2] * 0.5) + " 0 0 0 " + c[2] * 2 + " 0q" + (-c[2]) + " " + n(c[2] * 0.3) + " " + (-c[2] * 2) + ' 0z"/>' +
        '<path class="w-cob-l" d="M' + n(c[0] - c[2] * 0.62) + " " + n(c[1] - c[2] * 0.24) + "q" + n(c[2] * 0.5) + " " + n(-c[2] * 0.3) + " " + n(c[2] * 1.05) + " " + n(-c[2] * 0.06) + '"/></g>';
    });
    var log = '<path class="w-cob-sh" d="' + poly([[42, 236], [150, 249.5], [166, 248], [160, 252.5], [62, 244]]) + '"/>' +
      '<g class="w-log"><path class="w-pile" d="' + poly([[40, 230.5], [78, 233.2], [120, 237], [150, 240.4], [154, 237.2], [156.4, 237.8], [155.6, 241.4], [160.4, 240.6], [161, 243], [157, 244.2], [160.8, 247.8], [158.6, 249], [154, 246.2], [150, 247], [118, 243.8], [76, 238.8], [40, 233.8], [38, 232]]) + '"/>' +
      '<path class="w-pile" d="' + poly([[86, 234], [80, 222.5], [82.2, 221.8], [90, 234.4]]) + '"/>' +
      '<path class="w-pile" d="' + poly([[121, 237.2], [124, 229], [125.8, 229.5], [125, 237.8]]) + '"/>' +
      '<path class="w-liteb" d="M41 231L78 233.7L120 237.5L150 240.9"/></g>';
    var front = defs(id + "f") +
      '<path class="w-shorewet" d="' + line(bar.map(function (q) { return [q[0] + 6, q[1] - 6]; })) + 'L-2 332Z"/>' +
      '<path class="w-shore" d="' + line(bar) + 'L-2 332Z"/>' +
      '<path class="w-foam" d="' + line(bar) + '"/>' + stones + log;
    return svg("sc sc-back", back) + glintLayers(600, RY + 14, H) + svg("sc sc-mid", mid) + svg("sc sc-front", front);
  }

  // ---- scene four: the lake --------------------------------------------------
  // A small lake with no wind on it: firs all the way round, standing on
  // their heads in the water, a point coming in from one side, reeds and lily
  // pads at your feet and the public dock running out from the bank.
  // o (all optional, for a spot's own card later):
  //   seed    a number: another lake of the same kind
  //   mtn     [x, y, scale] puts Rainier behind the far shore
  //   dock    false leaves the dock out
  //   reeds   false leaves the reeds out
  //   lilies  false leaves the pads out
  //   level   0 to 1, how high the water stands on the dock's posts
  function lake(id, o) {
    o = o || {};
    var sd = o.seed || 0, r = rnd(131 + sd), LY = 188, k, x;
    var hill = headland({ seed: 9 + sd, from: -80, to: 520, base: LY - 5, h: 34, tree: 2.4, gap: 2.1, shape: 9, freq: 0.008, tipFade: 60 });
    var hill2 = headland({ seed: 16 + sd, from: 440, to: 60, base: LY - 2, h: 22, tree: 5.5, gap: 2.3, shape: 2.6, freq: 0.013 });
    var far = headland({ seed: 21 + sd, from: -30, to: 430, base: LY, h: 5, tree: 30, trees: true, shape: 12, tipFade: 60, tfreq: 0.022 });
    var point = headland({ seed: 34 + sd, from: -14, to: 148, base: LY + 10, h: 8, tree: 40, trees: true, shape: 2.3, tfreq: 0.05 });
    var rF = reflect(id, "f", far, 0.9, "w-l3"), rP = reflect(id, "p", point, 0.84, "w-l5");
    var back = defs(id) + skyLayer(id, { seed: 700 + sd, mtn: o.mtn }) +
      '<path class="w-l0" d="' + hill.land + '"/>' + mist(id, 91, LY - 20, 1.4) +
      '<path class="w-l1" d="' + hill2.land + '"/>' + mist(id, 92, LY - 6, 1.1) +
      waterLayer(id, LY - 2);
    // still water keeps long quiet streaks where a breath of air touches it
    var streaks = "";
    for (k = 0; k < 7; k++) {
      var sy = LY + 14 + k * (7 + k * 2.2) + r() * 5, sx = r() * 300 - 20, sl = 90 + r() * 190;
      streaks += '<path d="M' + n(sx) + " " + n(sy) + "q" + n(sl / 2) + " " + n(-0.8 - r()) + " " + n(sl) + ' 0" stroke-width="' + n(0.8 + k * 0.32) + '" opacity="' + n(0.3 + r() * 0.5) + '"/>';
    }
    var mid = defs(id + "m", rF.def + rP.def) +
      rF.svg + land(far, "w-l3") + '<path class="w-beach" d="M-4 ' + n(LY + 0.4) + 'H394"/>' +
      // after dark: one cabin window across the water
      litWindow(id + "m", rnd(64 + sd), 292, LY - 7.4, LY) +
      mist(id + "m", 93, LY + 3, 0.8) + '<g class="w-streak">' + streaks + "</g>" +
      rP.svg + land(point, "w-l5", true) + '<path class="w-beach" d="M-4 ' + n(LY + 10.3) + 'H128"/>';

    // the dock: low, floating on its posts, in one-point perspective
    var front = defs(id + "f");
    if (o.dock !== false) {
      var VX = 96, NX = 424, FX = 414, yN = 60, yF = 49, TH = 4.4, lvl = 13 - (o.level == null ? 0.5 : o.level) * 8;
      var P = function (x1, dy, s) { return [VX + (x1 - VX) * s, HZ + dy * s]; };
      var S = [1.02, 0.9, 0.79, 0.69, 0.6, 0.53], s0 = 1.06, sE = 0.5, glass = "", posts = "", postsF = "", planks = "";
      var deck = poly([P(NX, yN, s0), P(NX, yN, sE), P(FX, yF, sE), P(FX, yF, s0)]);
      var fascia = poly([P(NX, yN, s0), P(NX, yN, sE), P(NX, yN + TH, sE), P(NX, yN + TH, s0)]);
      var cap = poly([P(NX, yN, sE), P(FX, yF, sE), P(FX, yF + TH, sE), P(NX, yN + TH, sE)]);
      var under = poly([P(NX, yN + TH, s0), P(NX, yN + TH, sE), P(NX - 6, yN + TH + 22, sE), P(NX, yN + TH + 30, s0)]);
      S.forEach(function (s, i) {
        var top = P(NX, yN - 15, s), bot = P(NX, yN + TH + lvl, s), w = 1.4 + 5.2 * s;
        glass += pileGlass(r, bot[0], bot[1], w, 6 + 24 * s);
        posts += pile(r, bot[0], top[1], bot[1], w, "w-pp");
        var tf = P(FX, yF - 13, s), bf = P(FX, yF + 1, s);
        if (i % 2 === 0) postsF += '<path class="w-pile2" d="' + poly([[tf[0] - w * 0.36, tf[1]], [tf[0] + w * 0.36, tf[1]], [bf[0] + w * 0.38, bf[1]], [bf[0] - w * 0.38, bf[1]]]) + '"/>';
        var a = P(NX, yN, s), b = P(FX, yF, s);
        planks += "M" + n(a[0]) + " " + n(a[1]) + "L" + n(b[0]) + " " + n(b[1]);
        var a2 = P(NX, yN, s * 0.94), b2 = P(FX, yF, s * 0.94);
        planks += "M" + n(a2[0]) + " " + n(a2[1]) + "L" + n(b2[0]) + " " + n(b2[1]);
      });
      // a lamp on the last post, for the ones who fish it after dark
      var le = P(FX, yF, sE), lh = 30, lx = le[0] - 4, ly = le[1] - lh, wy = HZ + (yN + TH + lvl) * sE + 3, ps = "";
      for (k = 0; k < 10; k++) {
        var q = k / 10, ww = (8 + q * 16) * (0.6 + r() * 0.7);
        ps += '<rect x="' + n(lx - 8 - ww / 2 + (r() - 0.5) * (3 + q * 9)) + '" y="' + n(wy + k * (2 + q * 2.6)) + '" width="' + n(ww) + '" height="' + n(0.9 + q * 1.1) + '" rx=".6" opacity="' + n((1 - q * 0.85) * (0.5 + r() * 0.5)) + '"/>';
      }
      var lamp = '<path class="w-pole" d="M' + n(le[0]) + " " + n(le[1]) + "V" + n(ly + 3) + "Q" + n(le[0]) + " " + n(ly) + " " + n(lx + 1) + " " + n(ly) + '" stroke-width="1.5"/>' +
        '<path class="w-pile" d="' + poly([[lx - 3.4, ly - 0.8], [lx + 2.2, ly - 1.4], [lx + 2.8, ly + 1], [lx - 3.8, ly + 1.5]]) + '"/>' +
        '<ellipse class="w-bulb" cx="' + n(lx - 0.5) + '" cy="' + n(ly + 2) + '" rx="2.6" ry="1.1"/>';
      var extra = '<linearGradient id="' + id + 'f-deck" gradientUnits="userSpaceOnUse" x1="' + n(P(NX, 0, sE)[0]) + '" y1="0" x2="400" y2="0">' +
        '<stop offset="0" style="stop-color:var(--r3)"/><stop offset=".45" style="stop-color:var(--r4)"/><stop offset="1" style="stop-color:var(--r5)"/></linearGradient>';
      front = defs(id + "f", extra) +
        '<g filter="url(#' + id + 'f-wv)"><path class="w-under" d="' + under + '" filter="url(#' + id + 'f-b2)"/></g>' +
        '<g class="w-lampson"><ellipse class="w-pool" cx="' + n(lx - 8) + '" cy="' + n(wy + 9) + '" rx="34" ry="9" fill="url(#' + id + 'f-lamp)"/><g class="w-poolg">' + ps + "</g></g>" +
        '<g filter="url(#' + id + 'f-wv)">' + glass + "</g>" + postsF +
        '<path class="w-decktop" d="' + deck + '"/><path class="w-planks" d="' + planks + '"/>' +
        '<g class="w-lampson w-deckpool"><ellipse cx="' + n(lx + 16) + '" cy="' + n(le[1] + 5) + '" rx="26" ry="3.4"/></g>' +
        '<g fill="url(#' + id + 'f-deck)">' + posts + '<path d="' + fascia + '"/><path d="' + cap + '"/></g>' +
        '<path class="w-liteb" d="' + line([P(NX, yN, s0), P(NX, yN, sE)]) + '"/>' + lamp +
        '<g class="w-lampson"><circle cx="' + n(lx) + '" cy="' + n(ly + 2.5) + '" r="34" fill="url(#' + id + 'f-lamp)"/></g>';
    }
    // lily pads, smaller as they go out, each cut with its notch and turned its own way
    if (o.lilies !== false) {
      var pads = "", lits = "";
      for (k = 0; k < 26; k++) {
        var u = r(), py = 224 + u * u * 44 + r() * 4, px = -6 + r() * 250 * (1 - u * 0.2), pr = (2.6 + r() * 3) * (0.5 + (py - 224) / 40), rot = r() * 6.28;
        var a0 = rot + 0.34, a1 = rot + 6.28 - 0.34, pts = [[px, py]];
        for (var q2 = 0; q2 <= 9; q2++) { var ang = a0 + ((a1 - a0) * q2) / 9; pts.push([px + Math.cos(ang) * pr * 1.9, py + Math.sin(ang) * pr * 0.56]); }
        pads += poly(pts);
        lits += "M" + n(px - pr * 1.5) + " " + n(py - pr * 0.3) + "q" + n(pr * 1.4) + " " + n(-pr * 0.5) + " " + n(pr * 2.8) + " 0";
      }
      front += '<path class="w-pad" d="' + pads + '"/><path class="w-pad-l" d="' + lits + '"/>';
    }
    // reeds: a ragged stand at the near corner, a few gone to seed
    if (o.reeds !== false) {
      var blades = "", heads = "", blades2 = "";
      for (k = 0; k < 64; k++) {
        var bx = -8 + Math.pow(r(), 1.5) * 150, by = 262 + r() * 22 + bx * 0.05, bh = (30 + r() * 44) * (1 - bx / 330), lean = (r() - 0.35) * 22, bw = 0.9 + r() * 1.2;
        var tipx = bx + lean, tipy = by - bh, cxm = bx + lean * 0.25, cym = by - bh * 0.55;
        var d = "M" + n(bx - bw) + " " + n(by) + "Q" + n(cxm - bw * 0.6) + " " + n(cym) + " " + n(tipx) + " " + n(tipy) + "Q" + n(cxm + bw * 0.8) + " " + n(cym) + " " + n(bx + bw) + " " + n(by) + "Z";
        if (k % 3 === 0) blades2 += d; else blades += d;
        if (r() < 0.2 && bh > 34) {
          var hx = bx + lean * 0.8, hy = by - bh * 0.86;
          heads += '<rect x="' + n(hx - 1.3) + '" y="' + n(hy - 5) + '" width="2.6" height="9" rx="1.3" transform="rotate(' + n(lean * 0.9) + " " + n(hx) + " " + n(hy) + ')"/>';
        }
      }
      front += '<path class="w-reed2" d="' + blades2 + '"/><path class="w-reed" d="' + blades + '"/><g class="w-reed">' + heads + "</g>";
    }
    front += shoreEdge([[-2, 306], [60, 303], [130, 305], [200, 309], [270, 310], [330, 308], [392, 311]]);
    return svg("sc sc-back", back) + glintLayers(800 + sd, LY + 6, H, 0.42) + svg("sc sc-mid", mid) + svg("sc sc-front", front);
  }

  // ---- scene five: the ocean beach ---------------------------------------------
  // The coast at Copalis: nothing on the horizon, lines of surf coming in, a
  // sheet of wet sand that holds the sky, and wide flat beach. By day two
  // rods stand in the wash. After dark it is a razor clam dig: lanterns down
  // the beach as far as you can see, and people bent over the sand by them.
  // o (all optional):
  //   seed     a number: another beach of the same kind
  //   skyline  "head" (a low far headland, the default), "jetty" or "none"
  //   tide     0 to 1, how far up the sand the water has come
  //   log      false leaves the drift log out
  function surf(id, o) {
    o = o || {};
    // a spot's card (rigs/spots-scene.js) adds: its id (a beach of its own),
    // o.now (today: the tide, the wind), jetty, stack, dune "left", after
    // "empty" (no one on the beach after dark), cars (headlamps on the sand)
    var T = o.spot ? today(o) : null, wd = windOf(T ? T.wind : 0.3), bk = T ? 0.72 + wd.w * 0.6 : 1;
    var sd = o.seed || (o.spot ? idSeed(o.spot) % 997 : 0), r = rnd(211 + sd), k, x, tide = o.tide == null ? (T ? T.tide : 0.5) : o.tide;
    // where the wash stops on the sand: a rising tide brings it toward you,
    // a low tide (a clam dig's) leaves a wide sheet of wet sand
    var SW = 236 + (tide - 0.5) * 30;
    // a spot's clam dig: the surf far out on the low tide and the wide wet
    // sand where the diggers work lifted up the picture, so the dig (and by
    // night its lanterns) stands well clear of the card below it
    var UP = o.spot && o.activity === "clams" ? 22 : 0;
    SW -= UP;
    // (the card's top edge sits at about 248 on this picture at every phone
    // width, 246 at 360 and 250 at 430: the nearest digger's feet, at SW + 22,
    // stay 10 clear of it whatever the tide)
    if (UP) SW = Math.min(SW, 214);
    var skyline = typeof o.skyline === "string" ? o.skyline : o.spot ? "none" : "head", farD = "";
    if (skyline === "head") farD = headland({ seed: 5 + sd, from: 430, to: 236, base: HZ, h: 6.5, tree: 1.2, gap: 2.4, shape: 1.7, freq: 0.014, tipFade: 9 }).land;
    if (skyline === "jetty") {
      // a rock jetty running out, low and uneven, with a mark at its end
      var jp = [[402, HZ]];
      for (x = 400; x >= 232; x -= 5 + r() * 6) jp.push([x, HZ - 1.6 - r() * 2.2 * (0.4 + (x - 232) / 170)]);
      jp.push([228, HZ]);
      farD = poly(jp) + poly([[233, HZ - 2], [233.6, HZ - 9], [235, HZ - 9], [235.6, HZ - 2]]);
    }
    var back = defs(id) + skyLayer(id, { seed: 900 + sd }) + (farD ? '<path class="w-far" d="' + farD + '"/>' : "") + waterLayer(id) +
      swell(27 + sd, 187, 1.4 * bk, 2.4) + swell(28 + sd, 196, 2 * bk, 3.4);

    // one line of surf: broken lengths of foam, ragged above and below, each
    // with the dark of its own face just ahead of it
    function breaker(seed, y, thick, amp) {
      var rr = rnd(seed), nz = noise(seed + 3), nl = noise(seed + 9), out = "", shade = "", up = null, dn = null, bx;
      function flush() {
        if (up && up.length > 2) { out += poly(up.concat(dn)); shade += line(dn.slice().reverse().map(function (p) { return [p[0], p[1] + thick * 0.5]; })); }
        up = dn = null;
      }
      for (bx = -12; bx <= W + 12; bx += 3.5) {
        var th = thick * Math.max(0, nz(bx * 0.017) * 2.1 - 0.62), lift = (nl(bx * 0.02) - 0.5) * amp;
        if (th < 0.3) { flush(); continue; }
        if (!up) { up = [[bx - 3, y + lift]]; dn = [[bx - 3, y + lift + 0.4]]; }
        up.push([bx, y + lift - th * (0.5 + rr() * 0.7)]);
        dn.unshift([bx, y + lift + th * (0.3 + rr() * 0.3)]);
      }
      flush();
      return '<path class="w-surfsh" d="' + shade + '" stroke-width="' + n(thick * 0.8) + '"/><path class="w-surf" d="' + out + '"/>';
    }
    // the wash: the thin last sheet of a wave, with a lace of foam at its lip
    var lip = [], nzl = noise(77 + sd);
    for (x = -6; x <= W + 6; x += 9) lip.push([x, SW + (nzl(x * 0.021) - 0.5) * 9 + (nzl(x * 0.09 + 5) - 0.5) * 2.4]);
    var wash = line(lip) + "L" + (W + 6) + " " + (SW - 16) + "L-6 " + (SW - 16) + "Z";
    var lace = "";
    for (k = 0; k < 3; k++) lace += line(lip.map(function (p) { return [p[0] + k * 3, p[1] - 3 - k * 3.6 + (r() - 0.5) * 1.2]; }));
    // wet sand: it shines, and holds a long soft copy of the sky's light
    var sandTop = lip.map(function (p) { return [p[0], p[1] - 1]; }), dry = [], nzd = noise(91 + sd);
    for (x = W + 6; x >= -6; x -= 13) dry.push([x, SW + 30 + (nzd(x * 0.012) - 0.5) * 10]);
    var wet = poly(sandTop.concat(dry));
    var sheen = "";
    for (k = 0; k < 46; k++) {
      var wy2 = SW + 3 + r() * 24, wx = r() * W, wl = 6 + r() * 26;
      sheen += '<path d="M' + n(wx) + " " + n(wy2) + "h" + n(wl) + '" stroke-width="' + n(0.5 + r() * 0.7) + '" opacity="' + n(0.25 + r() * 0.6) + '"/>';
    }
    // the lines of surf spread out and thicken as they come in
    var mid = defs(id + "m") + breaker(31 + sd, 199 - UP * 0.45, 1.6 * bk, 1.2) + breaker(37 + sd, 207 - UP * 0.6, 3.2 * bk, 2) + breaker(43 + sd, 221 - UP * 0.8, 6.6 * bk, 3.4) +
      (o.spot ? oceanParts(o, tide, sd) : "") +
      '<path class="w-wash" d="' + wash + '"/><path class="w-wetsand" d="' + wet + '"/>' +
      '<g class="w-lightx"><ellipse class="w-sandroad" cx="0" cy="' + n(SW + 12) + '" rx="54" ry="20" fill="url(#' + id + 'm-glow)"/></g>' +
      '<g class="w-sheen">' + sheen + "</g>" + '<path class="w-lace" d="' + lace + '"/><path class="w-foam" d="' + line(lip) + '"/>';

    // people. s is their size: 1 about 16 units tall, at your feet bigger,
    // small down the beach. Drawn as filled shapes, near dark like everything
    // near: waders, a jacket, a cap.
    function legs(px, py, s) {
      return '<path class="w-figh" d="' + poly([[px - 2.5 * s, py], [px - 1.5 * s, py - 7.9 * s], [px + 1.5 * s, py - 7.9 * s], [px + 2.5 * s, py],
        [px + 1.1 * s, py], [px + 0.1 * s, py - 4.4 * s], [px - 0.9 * s, py]]) + '"/>';
    }
    // a digger, stooped over the clam gun (bent) or walking with it, a bucket
    // set down beside the stooped ones. dir: the way they face.
    function digger(px, py, s, bent, dir) {
      dir = dir || 1;
      var hip = [px, py - 7.6 * s], sh = bent ? [px + dir * 4.6 * s, py - 11.6 * s] : [px + dir * 0.6 * s, py - 13.6 * s];
      var hd = bent ? [sh[0] + dir * 1.9 * s, sh[1] - 0.6 * s] : [sh[0] + dir * 0.2 * s, sh[1] - 2.4 * s];
      var gx = px + dir * (bent ? 7.8 * s : 4.4 * s), gt = py - (bent ? 8.6 * s : 10.4 * s);
      var d = legs(px, py, s) +
        '<path class="w-figh" d="' + poly([[hip[0] - 2 * s, hip[1] + 0.4 * s], [sh[0] - (bent ? 1.4 : 2.3) * s, sh[1] - (bent ? 1.6 : 0) * s], [sh[0] + (bent ? 1.2 : 2.3) * s, sh[1] + (bent ? 1.6 : 0)], [hip[0] + 2 * s, hip[1] + 0.4 * s]]) + '"/>' +
        '<circle class="w-figh" cx="' + n(hd[0]) + '" cy="' + n(hd[1]) + '" r="' + n(1.9 * s) + '"/>' +
        '<path class="w-fig" d="M' + n(hd[0] - 2.2 * s) + " " + n(hd[1] - 1.1 * s) + "h" + n(4.4 * s) + '" stroke-width="' + n(0.9 * s) + '"/>';
      // the clam gun: a tube pushed into the sand, a cross handle on top
      d += '<path class="w-rod" d="M' + n(gx) + " " + n(py + 1 * s) + "V" + n(gt) + '" stroke-width="' + n(1.7 * s) + '"/>' +
        '<path class="w-rod" d="M' + n(gx - 2.4 * s) + " " + n(gt) + "h" + n(4.8 * s) + '" stroke-width="' + n(1 * s) + '"/>' +
        '<path class="w-fig" d="M' + n(sh[0]) + " " + n(sh[1] + 0.8 * s) + "L" + n(gx - dir * 1.2 * s) + " " + n(gt + 0.4 * s) + '" stroke-width="' + n(1.3 * s) + '"/>';
      if (bent) d += '<path class="w-figh" d="' + poly([[px - dir * 7.4 * s, py + 0.6 * s], [px - dir * 7.8 * s, py - 3.6 * s], [px - dir * 3.8 * s, py - 3.6 * s], [px - dir * 4.2 * s, py + 0.6 * s]]) + '"/>' +
        '<path class="w-liteb" d="M' + n(px - dir * 7.8 * s) + " " + n(py - 3.6 * s) + "H" + n(px - dir * 3.8 * s) + '"/>';
      return d;
    }
    // a surf angler in the wash, from behind: a long rod held up and bent to
    // the line, the line out past the breakers
    function angler(px, py, s, dir, out) {
      var hip = [px, py - 7.6 * s], sh = [px, py - 13.4 * s], hd = [px + dir * 0.3 * s, py - 15.7 * s];
      var hand = [px + dir * 3 * s, py - 10.6 * s], butt = [px - dir * 1.2 * s, py - 6.8 * s];
      var tip = [px + dir * 17 * s, py - 27.5 * s], c = [px + dir * 6.4 * s, py - 31.5 * s];
      return legs(px, py, s) +
        '<path class="w-figh" d="' + poly([[hip[0] - 1.9 * s, hip[1] + 0.4 * s], [sh[0] - 2.4 * s, sh[1] + 0.8 * s], [sh[0] - 1.3 * s, sh[1] - 0.4 * s], [sh[0] + 1.3 * s, sh[1] - 0.4 * s], [sh[0] + 2.4 * s, sh[1] + 0.8 * s], [hip[0] + 1.9 * s, hip[1] + 0.4 * s]]) + '"/>' +
        '<circle class="w-figh" cx="' + n(hd[0]) + '" cy="' + n(hd[1]) + '" r="' + n(1.85 * s) + '"/>' +
        '<path class="w-fig" d="M' + n(hd[0] - 2.1 * s) + " " + n(hd[1] - 1 * s) + "h" + n(4.2 * s) + '" stroke-width="' + n(0.9 * s) + '"/>' +
        '<path class="w-fig" d="M' + n(sh[0] + dir * 1.8 * s) + " " + n(sh[1] + 0.6 * s) + "L" + n(hand[0]) + " " + n(hand[1]) + '" stroke-width="' + n(1.3 * s) + '"/>' +
        '<path class="w-rod" d="M' + n(butt[0]) + " " + n(butt[1]) + "Q" + n(c[0]) + " " + n(c[1]) + " " + n(tip[0]) + " " + n(tip[1]) + '" stroke-width="' + n(0.85 * s) + '"/>' +
        '<path class="w-line" d="M' + n(tip[0]) + " " + n(tip[1]) + "Q" + n(tip[0] + dir * 22 * s) + " " + n(tip[1] + 4 * s) + " " + n(tip[0] + dir * out) + " " + 206 + '"/>';
    }
    // a headlamp, for the one still out after dark
    function headlamp(px, py, s, dir) {
      var hx = px + dir * 0.3 * s, hy = py - 15.9 * s;
      return '<circle cx="' + n(hx) + '" cy="' + n(hy) + '" r="' + n(9 * s + 4) + '" fill="url(#' + id + 'f-lamp)"/>' +
        '<circle class="w-lantern" cx="' + n(hx) + '" cy="' + n(hy) + '" r="' + n(0.7 * s) + '"/>' +
        '<path class="w-cone" d="' + poly([[hx, hy], [hx + dir * 46 * s, 214], [hx + dir * 64 * s, 220]]) + '"/>';
    }
    function lantern(px, py, s) {
      // on the sand at px, py: its glow, its pool, and the light it lays toward you
      var ps = "";
      for (var j = 0; j < 7; j++) {
        var q = j / 7, ww = (5 + q * 11) * s * (0.6 + r() * 0.7);
        ps += '<rect x="' + n(px - ww / 2 + (r() - 0.5) * 5 * s) + '" y="' + n(py + 2.4 * s + j * 2.3 * s) + '" width="' + n(ww) + '" height="' + n((0.7 + q * 0.7) * s) + '" rx=".5" opacity="' + n((1 - q * 0.85) * (0.5 + r() * 0.5)) + '"/>';
      }
      return '<ellipse class="w-pool" cx="' + n(px) + '" cy="' + n(py + 1.2 * s) + '" rx="' + n(26 * s) + '" ry="' + n(6.5 * s) + '" fill="url(#' + id + 'f-lamp)"/>' +
        '<g class="w-poolg">' + ps + "</g>" +
        '<circle cx="' + n(px) + '" cy="' + n(py - 3.4 * s) + '" r="' + n(22 * s + 4) + '" fill="url(#' + id + 'f-lamp)"/>' +
        '<path class="w-pile" d="' + poly([[px - 1.5 * s, py], [px - 1.2 * s, py - 4.6 * s], [px + 1.2 * s, py - 4.6 * s], [px + 1.5 * s, py]]) + '"/>' +
        '<ellipse class="w-lantern" cx="' + n(px) + '" cy="' + n(py - 2.6 * s) + '" rx="' + n(1.15 * s) + '" ry="' + n(1.7 * s) + '"/>' +
        '<path class="w-pole" d="M' + n(px - 1.3 * s) + " " + n(py - 4.6 * s) + "q" + n(1.3 * s) + " " + n(-2.6 * s) + " " + n(2.6 * s) + ' 0" stroke-width="' + n(0.5 * s) + '"/>';
    }
    var dig = "", lamps = "", far2 = "";
    // the near ones, each with its lantern set down beside it
    [[132, SW + 22, UP ? 1.7 : 1.35, 1, 1], [212, SW + 14, UP ? 1.1 : 0.95, 0, -1], [266, SW + 19, UP ? 1.3 : 1.1, 1, -1], [246, SW + 7, 0.58, 1, 1], [176, SW + 6, 0.52, 0, 1]].concat(UP ? [[44, SW + 12, 0.85, 1, 1], [332, SW + 9, 0.7, 0, -1]] : []).forEach(function (g) {
      lamps += lantern(g[0] - 11 * g[2] * g[4], g[1] + 1.5 * g[2], g[2]);
      dig += digger(g[0], g[1], g[2], g[3], g[4]);
    });
    // and down the beach both ways: points of light getting smaller
    for (k = 0; k < 15; k++) {
      var side = k % 2 ? 1 : -1, t = (k + 1) / 16, fx = 195 + side * (38 + t * 170) + (r() - 0.5) * 22, fy = SW + 3.5 - t * 0 + r() * 3.4, fs = 0.34 - t * 0.2;
      far2 += '<circle cx="' + n(fx) + '" cy="' + n(fy) + '" r="' + n(0.55 + fs * 1.5) + '" opacity="' + n(0.6 + r() * 0.4) + '"/><ellipse cx="' + n(fx) + '" cy="' + n(fy + 1.6 + fs * 3) + '" rx="' + n(1.6 + fs * 5) + '" ry="' + n(0.5 + fs) + '" opacity="' + n(0.16 + r() * 0.16) + '"/>';
    }
    // the surf perch way: long rods in the wash. A beach of its own (o.spot)
    // has its own people: how many, where, how big, which way they lean
    // (seeded by its id, so no two beaches stand the same); the stock beach
    // keeps its two.
    var rs = rnd(o.spot ? 7 + sd * 13 : 7), ang = [[150, 9, 1.75, 1, 70], [232, 1, 0.9, -1, 40]];
    if (o.spot) {
      var na = 1 + Math.floor(rs() * 3);
      ang = [];
      for (k = 0; k < na; k++) {
        var near0 = k === 0, ax = near0 ? 70 + rs() * 120 : 160 + rs() * 190, ay = near0 ? 6 + rs() * 8 : rs() * 4, as = near0 ? 1.35 + rs() * 0.5 : 0.55 + rs() * 0.45;
        ang.push([ax, ay, as, rs() < 0.6 ? 1 : -1, 30 + rs() * 50]);
      }
    }
    var day = "", heads = "";
    ang.forEach(function (a, i) { day += angler(a[0], SW + a[1], a[2], a[3], a[4]); if (!i) heads = headlamp(a[0], SW + a[1], a[2], a[3]); });
    // the near shore: the edge of a dune, its beach grass the darkest thing in
    // the picture, the way the pilings and firs are on the others (its start,
    // height and roll are the beach's own)
    var dune = "", grass = "", dz = noise(63 + sd), gx;
    // o.ridge: the beach's dune is a long high ridge of dune grass (Ocean
    // Shores), running away up the beach from the side of the picture
    var d0 = o.ridge ? 178 + rs() * 24 : o.spot ? 262 + rs() * 50 : 286, dh = o.ridge ? 66 + rs() * 10 : o.spot ? 30 + rs() * 22 : 40, dy0 = o.spot ? 262 + rs() * 12 : 268;
    var duneTop = function (xx) { return dy0 - Math.pow(Math.max(0, xx - d0) / (W - d0 + 6), 0.75) * dh + (dz(xx * 0.05) - 0.5) * 3 + (dz(xx * 0.012 + 9) - 0.5) * 6; };
    var dp = [[d0 - 4, dy0]];
    for (gx = d0; gx <= W + 6; gx += 6) dp.push([gx, duneTop(gx)]);
    dune = poly(dp.concat([[W + 6, 300], [d0 - 4, 300]]));
    for (gx = d0 + 4; gx <= W + 4; gx += 2.2 + r() * 2.4) {
      var gb = duneTop(gx) + 1.5, gh = (8 + r() * 15) * (0.55 + (gx - d0) / 160) * (o.ridge ? 1.25 : 1), lean = (r() - 0.35) * 10;
      grass += poly([[gx - 0.9, gb], [gx + lean * 0.5, gb - gh * 0.6], [gx + lean, gb - gh], [gx + 0.9, gb]]);
    }
    var near = '<path class="w-shorewet" d="' + line(dp.map(function (q) { return [q[0] - 4, q[1] + 3]; })) + 'L' + (W + 6) + ' 300L278 300Z"/>' +
      '<path class="w-pile" d="' + dune + '"/><path class="w-pile" d="' + grass + '"/>' +
      '<path class="w-liteb" d="' + line(dp.slice(1, 9).map(function (q) { return [q[0], q[1] + 0.6]; })) + '"/>';
    // a drift log left by the last big tide, half buried (a beach of its own
    // lays its log its own length, at its own place, or has none)
    var log = "";
    if (o.log !== false && (!o.spot || rs() < 0.8)) {
      var lx = o.spot ? -40 + rs() * 120 : 0, ly = o.spot ? (rs() - 0.5) * 16 : 0, lk = o.spot ? 0.7 + rs() * 0.5 : 1, lf = function (q) { return [lx + q[0] * lk, ly + q[1]]; };
      log = '<path class="w-cob-sh" d="' + poly([[-6, 266], [112, 259], [128, 261], [116, 266], [8, 273]].map(lf)) + '"/>' +
        '<g class="w-log"><path class="w-pile" d="' + poly([[-8, 253], [28, 250.6], [70, 248.8], [104, 248.2], [111, 249.4], [113, 252.6], [110, 256], [103, 257.6], [70, 258.4], [28, 261.4], [-8, 265]].map(lf)) + '"/>' +
        '<path class="w-pile" d="' + poly([[58, 249.6], [52, 240], [54.4, 239.2], [63, 249.4]].map(lf)) + '"/>' +
        '<path class="w-pile" d="' + poly([[86, 248.6], [90, 242.4], [92, 243], [91, 248.6]].map(lf)) + '"/>' +
        '<path class="w-liteb" d="' + line([[-6, 254], [28, 251.4], [70, 249.6], [103, 249]].map(lf)) + '"/></g>';
    }
    // tracks of pebbles and shell along the last tide line
    var wrack = "", s2 = rnd(15 + sd);
    for (k = 0; k < 120; k++) {
      var tx = s2() * W, ty = SW + 31 + (nzd(tx * 0.012) - 0.5) * 10 + s2() * s2() * 26, tz = 0.4 + s2() * s2() * 1.5;
      wrack += '<ellipse class="' + (s2() < 0.35 ? "w-st-l" : "w-st-d") + '" cx="' + n(tx) + '" cy="' + n(ty) + '" rx="' + n(tz * 1.5) + '" ry="' + n(tz * 0.5) + '"/>';
    }
    // What the people are doing is the trip's (o.activity): a razor clam dig,
    // its lanterns lit only once it is dark, or surf perch, a headlamp on
    // after dark. With no trip the beach goes by the light: rods by day, the
    // dig by lantern at night.
    var act = o.activity, people;
    if (act === "clams") people = '<g class="w-diggers">' + dig + '</g><g class="w-lampson">' + lamps + '</g><g class="w-lights w-farlamps">' + far2 + "</g>";
    else if (act === "perch") people = '<g class="w-anglers">' + day + '</g><g class="w-lampson">' + heads + "</g>";
    else people = '<g class="w-dayonly">' + day + "</g>" + '<g class="w-lights w-farlamps">' + far2 + "</g>" + '<g class="w-lampson w-dig">' + lamps + dig + "</g>";
    if (o.after === "empty") people = '<g class="w-dayonly">' + (act === "clams" ? dig : day) + "</g>";
    if (o.cars) people += beachCar(id + "f", 338, SW + 3);
    // o.glow "right" or "left": a town just behind the dunes on that side
    // (Ocean Shores, Westport): after dark its lights glow on the low sky
    // over the dune, the only light on a beach the card leaves empty
    // (low over the dune and the wet sand, clear of the title's tags)
    var gX = o.glow === "left" ? 30 : W - 30;
    var townGlow = o.glow ? '<g class="w-lampson w-townglow"><ellipse cx="' + gX + '" cy="' + (HZ + 34) + '" rx="190" ry="44" fill="url(#' + id + 'f-lamp)"/>' +
      '<ellipse cx="' + n(gX + (o.glow === "left" ? 60 : -60)) + '" cy="' + n(SW + 16) + '" rx="170" ry="16" fill="url(#' + id + 'f-lamp)" opacity=".7"/></g>' : "";
    if (o.dune === "left") near = '<g transform="translate(' + W + ' 0) scale(-1 1)">' + near + "</g>";
    // the dune stands dark against the town's glow
    var front = defs(id + "f") + wrack + log + people + townGlow + near;
    return svg("sc sc-back", back) + glintLayers(1000 + sd, HZ + 2.5, 204, 1.1) + svg("sc sc-mid", mid) + svg("sc sc-front", front);
  }

  // ==== a spot's own picture ===================================================
  // A spot's card (rigs/spots-scene.js) says which way you face where you
  // stand and what is truly in front of you: an island, a mountain, a pier,
  // a gravel bar. Everything below paints those facts in the same hand as
  // the five scenes above, placed by bearing: the picture spans FOV degrees
  // either side of the way you face, so a thing a few degrees right of your
  // facing sits a little right of centre, and one sixty degrees off is out of
  // the picture. A spot's id seeds its own treeline and ridges, so it looks
  // the same every visit and unlike any other spot.
  // Today rides in on o.now (see today()): the tide on the pilings and the
  // beach, the river's level on its bar and in its colour, the wind on the
  // water, rain, fog and the moon. The five scenes above, called with no
  // spot, paint exactly as they always have.
  var FOV = 45;
  function idSeed(s) {
    var h = 2166136261, i;
    s = String(s || "");
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 99991;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function relB(b, f) { return ((((b - f) % 360) + 540) % 360) - 180; }
  // The lens for one spot: x of a bearing, units a degree, and the focal
  // length in units (for things placed in metres: a deck, a rail, a dock).
  function lens(o) {
    var ud = W / 2 / ((o && o.fov) || FOV), f = (o && o.facing) || 0;
    return { f: f, ud: ud, fl: ud * 57.2958, x: function (b) { return W / 2 + relB(b, f) * ud; } };
  }

  // Today, each 0 to 1. Unset, an ordinary day: half tide, a light breeze,
  // the river fishable, no rain, no fog, the moon as it is that night.
  //   tide   0 low water, 1 high water
  //   river  0 low, 1 at the no-go line
  //   wind   0 glass, .33 ripple, .66 chop, 1 whitecaps (or those words)
  //   rain, fog  0 to 1
  //   moon   0 new, 1 full
  //   date   the day, and the hour when it carries one ("2026-11-24T19:30" or
  //          a local Date): where the sun sets, how full the moon is, and
  //          where it stands in the sky. A day with no hour is read as local
  //          noon for the sun and 7 PM for the moon (a squid evening).
  //   tideM  the tide's height in metres over the day's low datum (MLLW),
  //          when known: it can be below 0 (a minus tide for a clam dig)
  //          and wins over tide for the things placed in metres
  var WINDS = { glass: 0, calm: 0, ripple: 0.33, light: 0.33, chop: 0.66, whitecaps: 1 };
  // "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM" are the phone's own local time (a
  // bare day would otherwise be UTC midnight, the evening before here).
  function parseDay(v) {
    if (v instanceof Date) return { d: new Date(v.getTime()), timed: true };
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(v));
    if (m) return { d: new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0), timed: !!m[4] };
    return { d: new Date(v), timed: true };
  }
  function today(o) {
    var t = (o && o.now) || {}, pd = t.date ? parseDay(t.date) : { d: new Date(), timed: true }, d = pd.d;
    if (isNaN(d.getTime())) { d = new Date(); pd.timed = true; }
    function c(v, def) { v = v == null || v === "" || isNaN(+v) ? def : +v; return clamp(v, 0, 1); }
    var w = typeof t.wind === "string" ? WINDS[t.wind] : t.wind;
    var at = pd.timed ? d : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 0);
    return { tide: c(t.tide, 0.5), tideM: t.tideM == null || t.tideM === "" || isNaN(+t.tideM) ? null : clamp(+t.tideM, -1.6, 5),
      river: c(t.river, 0.35), wind: c(w, 0.3), rain: c(t.rain, 0), fog: c(t.fog, 0),
      moon: t.moon == null ? moonLit(d) : c(t.moon, 0.5), date: d, at: at };
  }
  // Where the moon stands at that moment, seen from the south Sound (47.3 N,
  // 122.4 W): azimuth (degrees true) and altitude (degrees). A low-precision
  // ephemeris, good to a degree or two, which is all a painting needs.
  // Whether day d falls in a season: true, false, or { from, until } days.
  function within(d, w) {
    if (!w || typeof w !== "object") return !!w;
    var a = w.from ? parseDay(w.from).d : null, b = w.until ? parseDay(w.until).d : null;
    if (b) b = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 23, 59);
    return (!a || d >= a) && (!b || d <= b);
  }
  function moonSky(at) {
    var rad = Math.PI / 180, dd = at.getTime() / 864e5 - 0.5 + 2440588 - 2451545;
    var L = rad * (218.316 + 13.176396 * dd), M = rad * (134.963 + 13.064993 * dd), F = rad * (93.272 + 13.22935 * dd);
    var l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), e = rad * 23.4397;
    var ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    var dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    var lw = rad * 122.4, phi = rad * 47.3, H = rad * (280.16 + 360.9856235 * dd) - lw - ra;
    var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    return { az: (((az / rad + 180) % 360) + 360) % 360, alt: alt / rad };
  }
  // Where the sun rises or sets on day d at this latitude, degrees true.
  function sunAz(d, set) {
    var y0 = Date.UTC(d.getFullYear(), 0, 1), N = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - y0) / 864e5 + 1;
    var dec = (-23.44 * Math.cos((2 * Math.PI * (N + 10)) / 365) * Math.PI) / 180, lat = (47.3 * Math.PI) / 180;
    var a = (Math.acos(clamp(Math.sin(dec) / Math.cos(lat), -1, 1)) * 180) / Math.PI;
    return set ? 360 - a : a;
  }
  // How much of the moon is lit on day d, 0 new to 1 full.
  function moonLit(d) {
    var P = 29.530588, age = ((d.getTime() - 947182440000) / 864e5) % P;
    if (age < 0) age += P;
    return (1 - Math.cos((2 * Math.PI * age) / P)) / 2;
  }
  // Where the light comes from, for a stand facing f on day d: the x the
  // sunset and the sunrise sit at, and which side. Out of the picture the
  // light waits just past the edge so its glow still reaches in; behind you
  // the water ahead has no road and the far shore takes the light instead.
  function lightOf(f, d) {
    function one(b) {
      var rl = relB(b, f), a = Math.abs(rl);
      var side = a > 100 ? "behind" : a < 14 ? "ahead" : rl < 0 ? "left" : "right";
      var x = a > 100 ? W / 2 + (rl < 0 ? -1 : 1) * 40 : W / 2 + clamp(rl, -58, 58) * (W / 2 / FOV);
      return { rel: Math.round(rl), side: side, x: Math.round(x) };
    }
    return { set: one(sunAz(d, true)), rise: one(sunAz(d, false)), noon: one(195) };
  }
  // What the wind does to the water: how busy the glints are, how long the
  // reflections hold, how high the swells ride, and whitecaps past a chop.
  function windOf(w) {
    return { w: w, dens: 0.28 + w * 1.25, amp: 0.45 + w * 1.5, refl: clamp(1.08 - w * 0.8, 0.22, 1), caps: clamp((w - 0.7) / 0.3, 0, 1) };
  }
  function bare(d) { var m = d.getMonth(); return m >= 10 || m <= 3; }

  // ---- parts: the skyline ---------------------------------------------------------
  // Land across the water, bearing to bearing: an island (both ends taper
  // into the water) or a shore (an end runs off the picture). mi, how far:
  // how pale, how low, and whether it carries real trees or a canopy edge.
  function distCls(mi) { return mi >= 7 ? "w-far" : mi >= 4.5 ? "w-l1" : mi >= 2.6 ? "w-l2" : mi >= 0.9 ? "w-l3" : "w-l5"; }
  function farLand(p, V, seed, hz) {
    var x0 = V.x(p.from), x1 = V.x(p.to), mi = p.mi || 5, sw;
    if (x1 < x0) { sw = x0; x0 = x1; x1 = sw; }
    var oa = x0 < 2, ob = x1 > W - 2, ta = p.taper || 5, tb = p.taperB || p.taper || 5;
    var near = mi < 2.6, h = p.h != null ? p.h : clamp(14 / mi, 3, 18);
    function env(k) {
      var a = oa ? 1 : Math.pow(clamp(k * ta, 0, 1), 0.6), b = ob ? 1 : Math.pow(clamp((1 - k) * tb, 0, 1), 0.6);
      return a * b;
    }
    var hl = headland({ seed: seed, from: oa ? x0 - 40 : x0, to: ob ? x1 + 40 : x1, base: hz + (p.dy != null ? p.dy : clamp(4.5 / mi, 0.3, 8)), h: h,
      tree: p.tree || (near ? clamp(11 / mi, 5, 16) : clamp(4.6 / mi, 0.8, 3.6)), gap: 2.1, trees: near, env: env, freq: p.freq || 0.02, tfreq: 0.05 });
    hl.cls = p.cls || distCls(mi); hl.mi = mi; hl.x0 = x0; hl.x1 = x1;
    return hl;
  }
  // The Olympics from the Sound: a long jagged row of snow, never one cone.
  // Each summit its own height and lean; between them the ridge sags and
  // saws. Snow body, shade falling down each summit's far side, one lit
  // face toward the light. The same classes as Rainier.
  function range(x0, x1, base, peaks, seed, litLeft) {
    var nz = noise(seed), nj = noise(seed + 7), r = rnd(seed + 3), top = [], x, top0 = 9999;
    var mh = 0; peaks.forEach(function (p) { mh = Math.max(mh, p[1]); });
    function hgt(x) {
      var h = 0, u = (x - x0) / (x1 - x0), env = Math.pow(clamp(Math.min(u, 1 - u) * 3.2, 0, 1), 0.9);
      peaks.forEach(function (p) { var d = Math.abs(x - p[0]) / p[2]; h = Math.max(h, p[1] * Math.max(0, 1 - Math.pow(d, 1.45))); });
      var ridge = mh * (0.4 + nz(x * 0.07) * 0.28), jag = (nj(x * 0.8) - 0.5) * mh * 0.16 + (nj(x * 2.1 + 5) - 0.5) * mh * 0.07;
      return Math.max(0, (Math.max(h, ridge) + jag) * env);
    }
    for (x = x0; x <= x1; x += 1.2) { var y = base - hgt(x); top.push([x, y]); if (y < top0) top0 = y; }
    var body = poly([[x0, base]].concat(top, [[x1, base]]));
    var shade = "", lit = "", gully = "";
    peaks.forEach(function (p) {
      var sx = p[0], sy = base - hgt(sx), side = litLeft ? 1 : -1, w = p[2] * 0.7;
      shade += poly([[sx, sy], [sx + side * w * 0.35, sy + p[1] * 0.3], [sx + side * w, base], [sx + side * w * 0.2, base]]);
      lit += poly([[sx - side * 0.4, sy + 0.6], [sx - side * w * 0.55, sy + p[1] * 0.55], [sx - side * w * 0.3, sy + p[1] * 0.6]]);
      for (var g = 0; g < 2; g++) {
        var gx = sx + side * (0.6 + r() * w * 0.5), gy = base - hgt(gx) + 1;
        gully += poly([[gx, gy], [gx + 0.7, gy], [gx + side * (2 + r() * 3), base], [gx + side * (0.6 + r() * 2), base]]);
      }
    });
    return '<path class="w-mtn-b" d="' + body + '"/><path class="w-mtn-s" d="' + shade + '"/><path class="w-mtn-s2" d="' + gully + '"/><path class="w-mtn-l" d="' + lit + '"/>';
  }
  // The mountains a card puts in the sky: Rainier's dome, the Olympics' row.
  function peaksOf(id, sky, V, hz, seed, litLeft) {
    var s = "";
    sky.forEach(function (p, i) {
      if (p.t === "rainier") { var sc = p.size || 0.8, x = V.x(p.at); s += mountain(n(x - 119 * sc), n(hz - (p.sink == null ? 6 : p.sink) - 66 * sc), sc); }
      if (p.t === "olympics") {
        var pk = (p.peaks || []).map(function (q) { return [V.x(q[0]), q[1], (q[2] || 4) * V.ud]; });
        s += '<g class="w-mtn">' + range(V.x(p.from), V.x(p.to), hz - (p.sink == null ? 3 : p.sink), pk, seed + 31 * i, litLeft) + "</g>";
      }
    });
    return s ? '<g mask="url(#' + id + '-mtnm)">' + s + "</g>" : "";
  }
  // A small white lighthouse on a point: a tapered tower, its dark lantern
  // room, and after dark its light.
  function tower(id, x, base, h) {
    var w = h * 0.3;
    return '<path class="w-tower" d="' + poly([[x - w / 2, base], [x - w * 0.36, base - h], [x + w * 0.36, base - h], [x + w / 2, base]]) + '"/>' +
      '<path class="w-pile" d="' + poly([[x - w * 0.4, base - h], [x - w * 0.3, base - h - h * 0.24], [x + w * 0.3, base - h - h * 0.24], [x + w * 0.4, base - h]]) + '"/>' +
      '<g class="w-lampson"><circle cx="' + n(x) + '" cy="' + n(base - h * 1.12) + '" r="' + n(h * 2.2) + '" fill="url(#' + id + '-lamp)"/>' +
      '<circle class="w-lantern" cx="' + n(x) + '" cy="' + n(base - h * 1.12) + '" r="' + n(Math.max(0.5, h * 0.09)) + '"/></g>';
  }
  // A ferry landing on a far shore: a low dark pier, its dolphins, its slip.
  function ferry(x, base, s) {
    var d = poly([[x - 9 * s, base + 0.2], [x + 5 * s, base + 0.2], [x + 6 * s, base + 2.4 * s], [x - 7 * s, base + 2.6 * s]]), p = "";
    for (var i = 0; i < 5; i++) { var px = x - 8 * s + i * 3.2 * s; p += poly([[px - 0.35 * s, base + 2.4 * s], [px + 0.35 * s, base + 2.4 * s], [px + 0.4 * s, base + 4.4 * s], [px - 0.4 * s, base + 4.4 * s]]); }
    p += poly([[x + 8 * s, base + 0.6 * s], [x + 9.6 * s, base + 0.6 * s], [x + 9.8 * s, base + 4.6 * s], [x + 7.8 * s, base + 4.6 * s]]);
    p += poly([[x - 12 * s, base + 1.4 * s], [x - 10.6 * s, base + 1.4 * s], [x - 10.4 * s, base + 4.6 * s], [x - 12.2 * s, base + 4.6 * s]]);
    return '<path class="w-l5" d="' + d + p + '"/><path class="w-liteb" d="M' + n(x - 9 * s) + " " + n(base + 0.4) + "H" + n(x + 5 * s) + '"/>';
  }
  // A suspension bridge far off: two towers, the cables between, the deck.
  function bridge(x, base, s) {
    var t1 = x - 30 * s, t2 = x + 30 * s, th = 22 * s, dk = base - 5 * s, st = "";
    [t1, t2].forEach(function (tx) {
      st += poly([[tx - 1.4 * s, base], [tx - 1 * s, base - th], [tx - 0.3 * s, base - th], [tx - 0.4 * s, base]]) + poly([[tx + 0.4 * s, base], [tx + 0.3 * s, base - th], [tx + 1 * s, base - th], [tx + 1.4 * s, base]]) +
        poly([[tx - 1.1 * s, base - th * 0.62], [tx + 1.1 * s, base - th * 0.62], [tx + 1.1 * s, base - th * 0.58], [tx - 1.1 * s, base - th * 0.58]]);
    });
    var cab = "M" + n(x - 58 * s) + " " + n(dk) + "Q" + n((x - 58 * s + t1) / 2) + " " + n(dk - th * 0.3) + " " + n(t1) + " " + n(base - th) +
      "Q" + n(x) + " " + n(dk + th * 0.55) + " " + n(t2) + " " + n(base - th) + "Q" + n((x + 58 * s + t2) / 2) + " " + n(dk - th * 0.3) + " " + n(x + 58 * s) + " " + n(dk);
    return '<path class="w-l1" d="' + st + poly([[x - 60 * s, dk], [x + 60 * s, dk], [x + 60 * s, dk + 1.2 * s], [x - 60 * s, dk + 1.2 * s]]) + '"/>' +
      '<path class="w-bcab" d="' + cab + '"/>';
  }
  // A rock breakwater or jetty: a heap of boulders along a line, each its
  // own lump with a lit top and a dark foot, and the wet band at the
  // waterline as high as the tide leaves it. pts: [x, waterline y, size],
  // one end to the other, size falling away with distance.
  function rocks(seed, pts, o) {
    o = o || {};
    var r = rnd(seed), body = "", lit = "", dark = "", wet = "", heap = [], foot = [], i, j;
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), t = 0;
      while (t < 1) {
        var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, s = (a[2] + (b[2] - a[2]) * t) * (0.55 + r() * 0.8), hgt = s * (o.tall || 1.1) * (o.angular ? 0.6 + r() * 0.9 : 1);
        var cx = x + (r() - 0.5) * s * 0.5, cy = y - hgt * (0.25 + r() * 0.55), rx = s * (0.5 + r() * 0.45), ry = s * (0.32 + r() * 0.26), m = o.angular ? 5 + Math.floor(r() * 2) : 9, pp = [], tilt = (r() - 0.5) * (o.angular ? 1.1 : 0.5);
        // quarried blocks: few corners, flat faces, each set at its own tilt
        for (j = 0; j < m; j++) { var an = Math.PI + (j / (m - 1)) * Math.PI + (o.angular && j > 0 && j < m - 1 ? (r() - 0.5) * 0.5 : 0), k2 = o.angular ? 0.72 + r() * 0.5 : 0.82 + r() * 0.26; pp.push([cx + Math.cos(an) * rx * k2, cy + Math.sin(an) * ry * k2 * (o.angular ? 1.25 : 1) + Math.cos(an) * tilt * ry]); }
        var fy = y + 0.4 + (o.ragged ? (r() - 0.35) * s * 0.32 : 0);
        pp.push([cx + rx * 0.95, fy], [cx - rx * 0.95, fy + (o.ragged ? (r() - 0.5) * s * 0.2 : 0)]);
        body += poly(pp);
        lit += poly([pp[1], pp[2], pp[3], pp[4], pp[5], [pp[5][0], pp[5][1] + ry * 0.16], [pp[3][0], pp[3][1] + ry * 0.2], [pp[1][0], pp[1][1] + ry * 0.12]]);
        dark += poly([[cx + rx * 0.2, cy + ry * 0.15], [cx + rx * 0.95, cy + ry * 0.05], [cx + rx * 0.95, y + 0.4], [cx + rx * 0.05, y + 0.4]]);
        heap.push([x, cy - ry * 0.75]);
        foot.push([x, y + (o.ragged ? (r() - 0.3) * s * 0.22 : 0)]);
        t += (s * (0.38 + r() * 0.3)) / Math.max(1, len);
      }
    }
    var wh = o.wet || 0;
    // the wet band: as high as the tide leaves it, ragged block to block
    var wk = [];
    if (wh > 0) foot.forEach(function (q, k) { var sv0 = Math.max(0.4, wh * (q[1] - (pts[0][1] - 40)) / 60) * (0.55 + r() * 0.9); wk.push(sv0); if (k) { var p0 = foot[k - 1]; wet += poly([[p0[0], p0[1] - wk[k - 1]], [(p0[0] + q[0]) / 2, (p0[1] + q[1]) / 2 - (wk[k - 1] + sv0) * (0.3 + r() * 0.5)], [q[0], q[1] - sv0], [q[0], q[1] + 0.4], [p0[0], p0[1] + 0.4]]); } });
    var under = heap.length > 1 ? poly(heap.concat(foot.slice().reverse())) : "";
    return '<g class="w-rocks ' + (o.cls || "") + '"><path class="w-rockb" d="' + under + '"/><path class="w-rockm" d="' + body + '"/><path class="w-rockd" d="' + dark + '"/>' +
      '<path class="w-rockt" d="' + lit + '"/>' + (wet ? '<path class="w-rockw" d="' + wet + '"/>' : "") + "</g>";
  }
  // Masts of a marina behind its breakwater: thin, each its own height, a
  // spreader on some. No boats drawn: the masts say it.
  function masts(seed, x0, x1, base, hmax) {
    var r = rnd(seed), d = "", x = x0;
    while (x < x1) {
      var h = hmax * (0.45 + r() * 0.55), w = 0.5 + r() * 0.35;
      d += poly([[x - w, base], [x - w * 0.4, base - h], [x + w * 0.4, base - h], [x + w, base]]);
      if (r() < 0.5) d += poly([[x - h * 0.08, base - h * 0.62], [x + h * 0.08, base - h * 0.62], [x + h * 0.08, base - h * 0.6], [x - h * 0.08, base - h * 0.6]]);
      x += 3 + r() * 7;
    }
    return '<path class="w-mast" d="' + d + '"/>';
  }
  // A broadleaf tree as one filled shape: a trunk and a ragged, lumpy crown,
  // never a ball. In winter (o.bare) the crown is a thin fuzz of twigs over
  // the limbs that hold it up.
  function broadleaf(r, x, base, h, o) {
    o = o || {};
    var lean = (r() - 0.5) * h * 0.1, top = base - h, tw = Math.max(0.45, h * 0.026), cx = x + lean, i;
    if (o.bare) {
      // winter: the trunk forks low into limbs that reach up and out, and the
      // twigs make a soft crown round their ends
      // the twigs' haze: a soft rounded mass with no straight edge (painted
      // faint, scene.css .w-haze), never a fan or a crag
      var fork = base - h * (0.24 + r() * 0.1), rx = h * (o.wide || 0.27 + r() * 0.1) * (o.vase ? 1.12 : 1), ry = (fork - top) * 0.52, cy = top + ry * 1.02, m = 16, pts = [], limbs = "";
      for (i = 0; i < m; i++) {
        var a = (i / m) * Math.PI * 2, k = 0.84 + r() * 0.2, up = Math.sin(a) < 0;
        pts.push([cx + Math.cos(a) * rx * k * (up && o.vase ? 1.06 : 0.94), cy + Math.sin(a) * ry * k * (up ? 1 : 0.9)]);
      }
      var trunk = poly([[x - tw, base], [cx - tw * 0.7, fork], [cx + tw * 0.7, fork], [x + tw, base]]);
      var nl = 4 + Math.floor(r() * 2);
      for (i = 0; i < nl; i++) {
        var ang = -Math.PI / 2 + (i / (nl - 1) - 0.5) * 1.7 + (r() - 0.5) * 0.25, len = (fork - top) * (0.78 + r() * 0.2);
        var ex = cx + Math.cos(ang) * rx * 0.85, ey = fork + Math.sin(ang) * len, mx = cx + (ex - cx) * 0.4 + (r() - 0.5) * tw, my = fork + (ey - fork) * 0.5;
        var lw = tw * (0.62 - Math.abs(i / (nl - 1) - 0.5) * 0.4);
        limbs += poly([[cx - lw, fork + 0.4], [mx - lw * 0.55, my], [ex, ey], [mx + lw * 0.55, my], [cx + lw, fork + 0.4]]);
        // one fork off each limb
        var fx = mx + (ex - mx) * 0.4, fy = my + (ey - my) * 0.4, fa = ang + (r() < 0.5 ? -0.5 : 0.5);
        limbs += poly([[fx - lw * 0.3, fy], [fx + Math.cos(fa) * len * 0.32, fy + Math.sin(fa) * len * 0.36], [fx + lw * 0.3, fy]]);
        // and fine tapered twigs off its end, fanning up and out
        var tws = Math.max(0.12, lw * 0.14);
        for (var tk = 0; tk < 4; tk++) { var ta2 = ang + (r() - 0.5) * 1.3, tl2 = len * (0.16 + r() * 0.2); if (!TILE) limbs += poly([[ex - tws, ey], [ex + Math.cos(ta2) * tl2, ey + Math.sin(ta2) * tl2], [ex + tws, ey]]); }
      }
      return { crown: smooth(pts), trunk: trunk + limbs, top: cy - ry, haze: true };
    }
    var cb = base - h * (o.clear || 0.28 + r() * 0.14), rx2 = h * (o.wide || 0.24 + r() * 0.12), ry2 = (cb - top) / 2, cy2 = top + ry2, pts2 = [];
    for (i = 0; i < 20; i++) {
      var a2 = (i / 20) * Math.PI * 2, k2 = 0.74 + r() * 0.36, vase = o.vase && Math.sin(a2) < 0 ? 1.12 : 1;
      pts2.push([cx + Math.cos(a2) * rx2 * k2 * vase, cy2 + Math.sin(a2) * ry2 * k2 * (Math.sin(a2) > 0 ? 0.82 : 1)]);
    }
    return { crown: poly(pts2), trunk: poly([[x - tw, base], [cx - tw * 0.55, cb + ry2 * 0.4], [cx + tw * 0.55, cb + ry2 * 0.4], [x + tw, base]]), top: top };
  }
  // A bank of trees whose kinds no card names: broadleaf crowns with a fir
  // among them now and then (mix: the share of firs). Bare in winter. Shaped
  // like a headland, so it reflects and paints the same way.
  function wall(o) {
    var r = rnd(o.seed), nt = noise(o.seed + 5), base = typeof o.base === "function" ? o.base : function () { return o.base; };
    var out = { base: base, land: "", trees: "", twigs: "", top: 9999, maxH: 0 }, pts = [], x;
    pts.push([o.x0 - 6, base(o.x0 - 6) + 0.6]);
    for (x = o.x0 - 6; x <= o.x1 + 6; x += 5) pts.push([x, base(x) - (o.land || 1.4) * (0.5 + nt(x * 0.031) * 0.9)]);
    pts.push([o.x1 + 6, base(o.x1 + 6) + 0.6]);
    out.land = poly(pts);
    x = o.x0;
    while (x < o.x1) {
      var th = o.h * (0.5 + 0.8 * nt(x * (o.freq || 0.028))) * (0.72 + r() * 0.5) * (o.grow ? o.grow(x) : 1), foot = base(x) + 0.4;
      if (th > 3 && r() < (o.mix == null ? 0.3 : o.mix)) {
        var cf = conifer(r, x, foot, th * 1.16, { full: 0.2 + r() * 0.06 });
        out.trees += cf; out.firs = (out.firs || "") + cf;
        if (foot - th * 1.16 < out.top) out.top = foot - th * 1.16;
        x += Math.max(1.4, th * (0.13 + r() * 0.12));
      } else if (th > 2) {
        var b = broadleaf(r, x, foot, th, { bare: o.bare, vase: o.vase });
        if (o.bare) out.twigs += b.crown; else out.trees += b.crown;
        out.trees += b.trunk;
        if (b.top < out.top) out.top = b.top;
        x += Math.max(1.4, th * (o.bare ? 0.16 + r() * 0.14 : 0.2 + r() * 0.16));
      } else x += 2;
    }
    out.maxH = base(o.x0) - out.top;
    // reflect() reads land and trees: let the winter twigs show in the water too
    out.glass = { base: base, maxH: out.maxH, land: out.land, trees: out.trees + out.twigs };
    return out;
  }
  function paintWall(wl, cls) {
    return '<g class="' + cls + '"><path d="' + wl.land + '"/>' + (wl.twigs ? '<path class="w-haze" d="' + wl.twigs + '"/>' : "") + '<path d="' + wl.trees + '"/></g>';
  }
  // Houses along a far bank, small and half in the trees: a pale wall, a
  // dark low roof, and after dark a window or two lit with its thread of
  // light on the water at wy.
  // dim (a place whose card says no lighting): only a window or two, small
  // and faint, no glow round it and no thread on the water, so it never
  // reads as a lamp on the shore. Each house its own count of windows.
  function houses(id, r, xs, base, sz, wy, dim) {
    var walls = "", roofs = "", lit = "", glows = "";
    xs.forEach(function (x) {
      var w = sz * (1.5 + r() * 1.3), h = sz * (0.75 + r() * 0.35), rh = sz * (0.3 + r() * 0.25), y = base(x) - 0.3, ridge = x + (r() - 0.5) * w * 0.4;
      walls += poly([[x - w / 2, y], [x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2, y]]);
      roofs += poly([[x - w / 2 - sz * 0.2, y - h + 0.2], [ridge, y - h - rh], [x + w / 2 + sz * 0.2, y - h + 0.2]]);
      // (dim: no lamps on the card, but the houses are lived in: a window or
      // two each, small, a faint glow and a short thread on the water)
      var nw = dim ? (r() < 0.15 ? 0 : 1 + Math.floor(r() * 1.6)) : r() < 0.25 ? 0 : 1 + Math.floor(r() * 2.4);
      for (var wi = 0; wi < nw; wi++) {
        var wx = x + (nw > 1 ? (wi / (nw - 1) - 0.5) * w * 0.55 : (r() - 0.5) * w * 0.5), wy0 = y - h * (0.5 + r() * 0.12), ww = Math.max(dim ? 0.4 : 0.6, sz * (dim ? 0.2 : 0.3));
        lit += '<rect x="' + n(wx - ww / 2) + '" y="' + n(wy0 - ww * 0.6) + '" width="' + n(ww) + '" height="' + n(ww * 1.2) + '"' + (dim ? ' opacity=".8"' : "") + "/>";
        if (dim) {
          if (!wi) glows += '<circle cx="' + n(wx) + '" cy="' + n(wy0) + '" r="' + n(sz * 1.5) + '" fill="url(#' + id + '-lamp)" opacity=".55"/>';
          for (var k2 = 0; k2 < 3; k2++) { var l2 = sz * (0.5 + k2 * 0.5) * (0.6 + r() * 0.6); lit += '<rect x="' + n(wx - l2 / 2 + (r() - 0.5) * sz * 0.6) + '" y="' + n(wy + 1 + k2 * 1.3) + '" width="' + n(l2) + '" height=".5" opacity="' + n(0.45 - k2 * 0.12) + '"/>'; }
          continue;
        }
        if (!wi) glows += '<circle cx="' + n(wx) + '" cy="' + n(wy0) + '" r="' + n(sz * (2.4 + r() * 2.4)) + '" fill="url(#' + id + '-lamp)"/>';
        var steps = 3 + Math.floor(r() * 5);
        for (var k = 0; k < steps; k++) { var q = k / steps, l = sz * (0.6 + q * 2) * (0.5 + r() * 0.7); lit += '<rect x="' + n(wx - l / 2 + (r() - 0.5) * sz) + '" y="' + n(wy + 1 + k * (1 + q * 1.6)) + '" width="' + n(l) + '" height="' + n(0.5 + q * 0.6) + '" rx=".3" opacity="' + n((1 - q * 0.8) * 0.7) + '"/>'; }
      }
    });
    return '<path class="w-house" d="' + walls + '"/><path class="w-roof" d="' + roofs + '"/>' +
      '<g class="w-lampson w-window">' + glows + '<g class="w-poolg">' + lit + "</g></g>";
  }
  // Whitecaps: short ragged lips of foam, each with the dark of its own face
  // under it, few and small far off, more and bigger toward you.
  function whitecaps(seed, y0, y1, k) {
    if (!(k > 0)) return "";
    var r = rnd(seed), s = "", sh = "", cnt = Math.round(8 + k * 34), i, q;
    for (i = 0; i < cnt; i++) {
      var u = Math.pow(r(), 0.75), y = y0 + u * (y1 - y0), x = r() * (W + 20) - 10, len = (2 + u * 15) * (0.5 + r()), th = 0.4 + u * 2.4 * (0.6 + r() * 0.6), pts = [[x, y]];
      for (q = 1; q <= 4; q++) pts.push([x + (len * q) / 4, y - th * (q === 4 ? 0.3 : 0.7 + r() * 0.5)]);
      pts.push([x + len + 1, y + 0.3]);
      for (q = 3; q >= 1; q--) pts.push([x + (len * q) / 4 + (r() - 0.5), y + th * (0.2 + r() * 0.3)]);
      s += poly(pts);
      sh += poly([[x + len * 0.1, y + th * 0.4], [x + len * 0.95, y + th * 0.4], [x + len * 0.8, y + th * 1.5 + 0.8], [x + len * 0.2, y + th * 1.3 + 0.8]]);
    }
    return '<g class="w-caps" opacity="' + n(0.45 + k * 0.55) + '"><path class="w-capsh" d="' + sh + '"/><path class="w-capf" d="' + s + '"/></g>';
  }
  // Tide rips: where the current runs fast off a point the water is rougher
  // in long bands, short broken lights crowded along each.
  function rips(seed, bands) {
    var r = rnd(seed), d = "";
    bands.forEach(function (b) {
      for (var i = 0; i < b[4]; i++) {
        var t = r(), x = b[0] + (b[2] - b[0]) * t + (r() - 0.5) * 6, y = b[1] + (b[3] - b[1]) * t + (r() - 0.5) * 2.4, l = 1.5 + r() * 4 * (y - HZ) / 30;
        d += "M" + n(x) + " " + n(y) + "q" + n(l / 2) + " " + n(-0.5 - r() * 0.6) + " " + n(l) + " 0";
      }
    });
    return '<path class="w-rip" d="' + d + '"/>';
  }

  // ---- parts: where you stand ------------------------------------------------------
  // Things you stand on are placed in metres and seen through the spot's
  // lens from eye height: pj(X across, Y up from your eye, Z ahead).
  function eye(V, cx) { return function (X, Y, Z) { return [cx + (V.fl * X) / Z, HZ - (V.fl * Y) / Z]; }; }
  function quad(a, b, c, d) { return poly([a, b, c, d]); }
  // Someone at a rail on a squid night, from behind: legs, a coat, a hood,
  // the rod out over the rail and the line down. Their own light is a
  // separate piece (it is lit only after dark).
  function angler(pj, X, Z, dk, r) {
    var u = (r() - 0.5) * 0.1, sh = dk + 1.44 + u, hp = dk + 0.92, hd = dk + 1.6 + u, dir = r() < 0.5 ? -1 : 1, wd = 0.2 + r() * 0.05, lean = (r() - 0.5) * 0.08;
    var body = poly([pj(X - wd * 0.55 + lean, sh + 0.08, Z), pj(X - wd + lean, sh - 0.05, Z), pj(X - wd * 0.92, hp + 0.1, Z), pj(X - wd * 0.8, hp - 0.05, Z), pj(X - 0.16, dk, Z), pj(X - 0.05, dk, Z), pj(X, hp - 0.32, Z),
      pj(X + 0.05, dk, Z), pj(X + 0.16, dk, Z), pj(X + wd * 0.8, hp - 0.05, Z), pj(X + wd * 0.92, hp + 0.1, Z), pj(X + wd + lean, sh - 0.05, Z), pj(X + wd * 0.55 + lean, sh + 0.08, Z)]);
    var h = pj(X + lean, hd, Z), hr = Math.abs(pj(X + 0.12, hd, Z)[0] - pj(X, hd, Z)[0]);
    var hand = pj(X + dir * 0.26, dk + 1.12, Z), tip = pj(X + dir * 0.7, dk + 1.75, Z + 2.6), wl = pj(X + dir * 0.7, dk + 0.4, Z + 2.6);
    return { fig: body + "M" + n(h[0] + hr) + " " + n(h[1]) + "a" + n(hr) + " " + n(hr * 1.1) + " 0 1 0 " + n(-hr * 2) + " 0a" + n(hr) + " " + n(hr * 1.1) + " 0 1 0 " + n(hr * 2) + " 0Z",
      rod: "M" + n(hand[0]) + " " + n(hand[1]) + "L" + n(tip[0]) + " " + n(tip[1]), line: "M" + n(tip[0]) + " " + n(tip[1]) + "L" + n(wl[0]) + " " + n(wl[1]),
      w: Math.max(0.4, (hr * 2) / 5), head: h, hand: hand };
  }
  // A lit pool on the water, far off: a soft glow and a ladder of gold.
  function waterPool(id, r, x, y, s) {
    var ps = "";
    for (var k = 0; k < 7; k++) { var q = k / 7, ww = (6 + q * 14) * s * (0.6 + r() * 0.7); ps += '<rect x="' + n(x - ww / 2 + (r() - 0.5) * 6 * s) + '" y="' + n(y + k * (1.1 + q * 1.8) * s) + '" width="' + n(ww) + '" height="' + n((0.6 + q * 0.8) * s) + '" rx=".5" opacity="' + n((1 - q * 0.8) * (0.5 + r() * 0.5)) + '"/>'; }
    return '<ellipse class="w-pool" cx="' + n(x) + '" cy="' + n(y + 5 * s) + '" rx="' + n(22 * s) + '" ry="' + n(6 * s) + '" fill="url(#' + id + '-lamp)"/><g class="w-poolg">' + ps + "</g>";
  }

  // A pier seen from on it: you stand on the deck a few steps back from its
  // end, or at the head of a T, looking out. p, the card's pier:
  //   end    "straight", "T", "L" (the head turns right) or "Lleft"
  //   ahead  metres from you to the end (to the head's near edge for a T or L)
  //   arm    metres across the head
  //   l, r   metres from you to the left and right rails
  //   deck   "grate", "plank" or "plain"
  //   lamps  lamp posts on the head's far rail, metres left (-) or right (+)
  //   cover  [from, to] metres: a rain cover over that part of the head
  //   crowd  how many people along the rail on a squid night, with their
  //          own lights (and their lights on the water), when p.own is set
  function onPier(id, p, t, r, V) {
    var e = 1.6, cx = W / 2 + (p.vx || 0) * V.ud, end = p.end || "straight", fl = V.fl, pj = eye(V, cx);
    var Zn = 2.4, Z1 = p.ahead == null ? 9 : p.ahead, head = end !== "straight", Z2 = head ? Z1 + (p.arm || 5) : Z1, Zh = Math.max(Z1, 0.9);
    var L = -(p.l || 1.8), R = p.r || 2.4, AL = end === "T" || end === "Lleft" ? -90 : L, AR = end === "T" || end === "L" ? 90 : R;
    var dk = -e, rt = 1.06 - e, rm = 0.55 - e, bar = 0.07;
    function vis(Z) { return [-(cx + 24) * Z / fl, (W - cx + 24) * Z / fl]; }
    function railZ(X, Za, Zb, step) {
      var s = quad(pj(X, rt, Za), pj(X, rt, Zb), pj(X, rt - bar, Zb), pj(X, rt - bar, Za)) + quad(pj(X, rm, Za), pj(X, rm, Zb), pj(X, rm - bar * 0.8, Zb), pj(X, rm - bar * 0.8, Za));
      for (var z = Zb; z >= Za - 0.01; z -= step) s += quad(pj(X - 0.045, dk, z), pj(X + 0.045, dk, z), pj(X + 0.045, rt, z), pj(X - 0.045, rt, z));
      return s;
    }
    function railX(Z, Xa, Xb, step) {
      var v = vis(Z); Xa = Math.max(Xa, v[0]); Xb = Math.min(Xb, v[1]);
      if (Xb <= Xa) return "";
      var s = quad(pj(Xa, rt, Z), pj(Xb, rt, Z), pj(Xb, rt - bar, Z), pj(Xa, rt - bar, Z)) + quad(pj(Xa, rm, Z), pj(Xb, rm, Z), pj(Xb, rm - bar * 0.8, Z), pj(Xa, rm - bar * 0.8, Z));
      for (var x = Math.ceil(Xa / step) * step; x <= Xb; x += step) s += quad(pj(x - 0.045, dk, Z), pj(x + 0.045, dk, Z), pj(x + 0.045, rt, Z), pj(x - 0.045, rt, Z));
      return s;
    }
    var deck = "", lines = "", farR = "", nearR = "", edge = "", x, z, v;
    if (Z1 > Zn) deck += quad(pj(L, dk, Zn), pj(R, dk, Zn), pj(R, dk, Z1), pj(L, dk, Z1));
    if (head) { var a0 = Math.max(AL, vis(Z2)[0] * 1.1), a1 = Math.min(AR, vis(Z2)[1] * 1.1); deck += quad(pj(a0, dk, Zh), pj(a1, dk, Zh), pj(a1, dk, Z2), pj(a0, dk, Z2)); }
    // the deck's own surface: a grating's mesh, or planks across
    var dz = p.deck === "grate" ? 0.42 : p.deck === "plank" ? 0.2 : 1.6;
    if (Z1 > Zn) for (z = Zn; z < Z1; z += dz * (1 + (z - Zn) * 0.04)) lines += "M" + n(pj(L, dk, z)[0]) + " " + n(pj(L, dk, z)[1]) + "H" + n(pj(R, dk, z)[0]);
    if (p.deck === "grate" && Z1 > Zn) for (x = L + 0.3; x < R; x += 0.3) lines += "M" + n(pj(x, dk, Zn)[0]) + " " + n(pj(x, dk, Zn)[1]) + "L" + n(pj(x, dk, Z1)[0]) + " " + n(pj(x, dk, Z1)[1]);
    if (head) {
      for (z = Zh; z < Z2; z += dz * 1.2) { v = vis(z); lines += "M" + n(pj(Math.max(AL, v[0]), dk, z)[0]) + " " + n(pj(0, dk, z)[1]) + "H" + n(pj(Math.min(AR, v[1]), dk, z)[0]); }
      if (p.deck === "plank" || p.deck === "grate") { v = vis(Z2); for (x = Math.max(AL, v[0]); x < Math.min(AR, v[1]); x += p.deck === "grate" ? 0.5 : 0.22) lines += "M" + n(pj(x, dk, Math.max(Zh, 1.6))[0]) + " " + n(pj(x, dk, Math.max(Zh, 1.6))[1]) + "L" + n(pj(x, dk, Z2)[0]) + " " + n(pj(x, dk, Z2)[1]); }
    }
    // the rails
    if (Z1 > Zn) nearR += railZ(L, Zn, Z1, 2.2) + railZ(R, Zn, Z1, 2.2);
    if (!head) farR += railX(Z1, L, R, 1.4);
    else {
      farR += railX(Z2, AL, AR, 2.2);
      if (Z1 > 1.6) { if (AL < L) farR += railX(Z1, AL, L, 2.2); if (AR > R) farR += railX(Z1, R, AR, 2.2); }
      if (end === "L") farR += railZ(L, Z1, Z2, 1.6);
      if (end === "Lleft") farR += railZ(R, Z1, Z2, 1.6);
    }
    var zf = head ? Z2 : Z1, ve = vis(zf);
    edge += "M" + n(pj(Math.max(AL, ve[0]), dk, zf)[0]) + " " + n(pj(0, dk, zf)[1]) + "H" + n(pj(Math.min(AR, ve[1]), dk, zf)[0]);
    // lamp posts on the far rail, each with its glow, its pool on the deck and
    // a broken ladder of its light on the water beyond
    var lamps = "", arms = "", bulbs = "", glows = "", pools = "", ladders = "";
    (p.lamps || []).forEach(function (X) {
      var b = pj(X, dk, zf), tp = pj(X, dk + 4.3, zf), w2 = Math.max(0.6, Math.abs(pj(X + 0.07, 0, zf)[0] - b[0])), sc = fl / zf / 28, side = X < 0 ? 1 : -1;
      var hd = [tp[0] + side * 7.5 * sc, tp[1] + 0.5 * sc];
      lamps += quad([b[0] - w2, b[1]], [b[0] + w2, b[1]], [tp[0] + w2 * 0.7, tp[1] + 4 * sc], [tp[0] - w2 * 0.7, tp[1] + 4 * sc]) +
        poly([[hd[0] - 4 * sc, hd[1] - 0.9 * sc], [hd[0] + 3 * sc, hd[1] - 1.7 * sc], [hd[0] + 3.6 * sc, hd[1] + 1.2 * sc], [hd[0] - 4.4 * sc, hd[1] + 1.8 * sc]]);
      arms += "M" + n(tp[0]) + " " + n(tp[1] + 4 * sc) + "Q" + n(tp[0]) + " " + n(tp[1]) + " " + n(hd[0] - side * 1.4 * sc) + " " + n(hd[1]);
      glows += '<circle cx="' + n(hd[0]) + '" cy="' + n(hd[1] + 2 * sc) + '" r="' + n(fl * 1.6 / zf) + '" fill="url(#' + id + '-lamp)"/>';
      lamps += "";
      bulbs += '<ellipse class="w-bulb" cx="' + n(hd[0] - 0.4 * sc) + '" cy="' + n(hd[1] + 2.2 * sc) + '" rx="' + n(3 * sc) + '" ry="' + n(1.3 * sc) + '"/>';
      var dp = pj(X, dk, zf - 1.6);
      pools += '<ellipse cx="' + n(dp[0]) + '" cy="' + n(dp[1]) + '" rx="' + n(fl * 2.6 / zf) + '" ry="' + n(fl * 0.7 / zf) + '" fill="url(#' + id + '-lamp)"/>';
      var yE = b[1] - 2;
      for (var k = 0; k < 11; k++) { var q = k / 11, ww = (2 + q * 9) * (0.6 + r() * 0.8), yy = HZ + 4 + q * (yE - HZ - 6); ladders += '<rect x="' + n(hd[0] - ww / 2 + (r() - 0.5) * (2 + q * 6)) + '" y="' + n(yy) + '" width="' + n(ww) + '" height="' + n(0.6 + q * 0.9) + '" rx=".4" opacity="' + n((0.4 + q * 0.6) * (0.5 + r() * 0.5)) + '"/>'; }
    });
    // a rain cover over part of the head: its posts, its front edge, and the
    // dark of its underside toward you
    var cover = "", roof = "";
    if (p.cover) {
      var c0 = p.cover[0], c1 = p.cover[1], ry = dk + 3.2, zc = Math.max(Zh, 1.4);
      for (x = c0; x <= c1 + 0.01; x += 3) cover += quad(pj(x - 0.09, dk, zf - 0.3), pj(x + 0.09, dk, zf - 0.3), pj(x + 0.09, ry, zf - 0.3), pj(x - 0.09, ry, zf - 0.3));
      roof = quad(pj(c0, ry, zf), pj(c1, ry, zf), pj(c1, ry, zc), pj(c0, ry, zc));
      cover += quad(pj(c0, ry + 0.4, zf), pj(c1, ry + 0.4, zf), pj(c1, ry, zf), pj(c0, ry, zf));
    }
    // the crowd at the rail on a squid night, and the light they bring
    var figs = "", rods = "", flines = "", own = "", wpools = "";
    if (p.crowd) {
      var spots = [];
      if (head) { for (var i = 0; i < p.crowd; i++) spots.push([-7 + (i / Math.max(1, p.crowd - 1)) * 15 + (r() - 0.5) * 1.2, zf - 0.5]); }
      else {
        for (i = 0; i < p.crowd; i++) {
          var u = i / Math.max(1, p.crowd - 1);
          spots.push(u < 0.34 ? [L + 0.45, Z1 - 1 - u * 9] : u > 0.66 ? [R - 0.45, Z1 - 1 - (1 - u) * 9] : [L + 0.6 + (u - 0.34) * 3 * (R - L - 1.2), Z1 - 0.45]);
        }
      }
      spots.sort(function (a, b) { return b[1] - a[1]; }).forEach(function (sp) {
        if (sp[1] < Zn + 1.4) return;
        var g = angler(pj, sp[0], sp[1], dk, r);
        figs += g.fig; rods += '<path class="w-rod" d="' + g.rod + '" stroke-width="' + n(g.w) + '"/>'; flines += g.line;
        if (p.own) {
          own += '<circle cx="' + n(g.hand[0]) + '" cy="' + n(g.hand[1]) + '" r="' + n(fl * 0.9 / sp[1]) + '" fill="url(#' + id + '-lamp)"/><circle class="w-lantern" cx="' + n(g.hand[0]) + '" cy="' + n(g.hand[1]) + '" r="' + n(Math.max(0.5, fl * 0.035 / sp[1])) + '"/>';
        }
      });
      if (p.own) for (i = 0; i < 6; i++) { var wz = 45 + r() * 50, wx = (r() - 0.5) * 20; wpools += waterPool(id, r, pj(wx, dk - (p.height || 5), wz)[0], pj(wx, dk - (p.height || 5), wz)[1] - 2, 0.5 + 18 / wz); }
    }
    return '<g class="w-lampson">' + wpools + '<g class="w-poolg">' + ladders + "</g></g>" +
      '<path class="w-decktop" d="' + deck + '"/><path class="w-grate" d="' + lines + '"/><path class="w-liteb" d="' + edge + '"/>' +
      '<g class="w-lampson w-deckpool">' + pools + "</g>" +
      '<path class="w-roofu" d="' + roof + '"/><path class="w-pile" d="' + cover + '"/>' +
      '<path class="w-rail2" d="' + farR + '"/><path class="w-pile" d="' + lamps + '"/><path class="w-pole" d="' + arms + '" stroke-width="' + n(Math.max(0.8, fl * 0.1 / zf)) + '"/>' + bulbs +
      '<g class="w-lampson w-crowd"><path class="w-figh" d="' + figs + '"/>' + rods + '<path class="w-line" d="' + flines + '"/>' + own + "</g>" +
      '<path class="w-rail2 w-railn" d="' + nearR + '"/>' +
      '<g class="w-lampson">' + glows + "</g>";
  }

  // A pier seen from the shore beside its root, running out ahead (the
  // approved pier, given its own length, end and build). p:
  //   from   "right" (default) or "left": the side its root comes in from
  //   vx     where it heads for, x on the picture
  //   bays   how many spans you can count (its length), k how fast they shrink
  //   end    "straight", "T", "L" (turns right) or "Lleft"; arm: the head's reach
  //   bend   units the last few spans swing (left -, right +)
  //   build  "timber" (cross braced), "concrete" (heavy, plain) or "steel"
  //   lamps  which spans carry a lamp post, rail: false for none
  //   table  a picnic table at the tip; own: anglers' own lights at the end
  //          after dark; crowd: people along the rail after dark, each
  //          with a light and its pool on the water (a squid night)
  //   deck   "grate": the deck seen through, a fine mesh
  //   yN, yF how far below the horizon the deck runs (negative: above you)
  function sidePier(id, p, t, r) {
    var left = p.from === "left", VX = left ? W - (p.vx || 200) : p.vx || 200;
    var off = p.off || 214, NX = VX + off, FX = NX - (p.wid || 9), yN = p.yN == null ? 26 : p.yN, yF = p.yF == null ? 18 : p.yF, TH = p.th || 5.2;
    var drop = (p.drop || 46) - t.tide * (p.range || 13), ySea = yN + TH + drop, ySeaF = ySea - 11, wetH = (1 - t.tide) * (p.range || 13);
    var nb = p.bays || 12, kk = p.k || 0.3, S = [], i;
    for (i = 0; i <= nb; i++) S.push(1 / (1 + kk * i));
    var s0 = 1.04, sE = S[nb], bdx = (p.bend || 0) * (left ? -1 : 1), sb = S[Math.max(1, nb - (p.bendBays || 3))];
    function P(x1, dy, s) { var x = VX + (x1 - VX) * s; if (bdx && s < sb) x += (bdx * (sb - s)) / (sb - sE); return [x, HZ + dy * s]; }
    function seg(x1, dy) { var pts = []; S.forEach(function (s) { pts.push(P(x1, dy, s)); }); pts.unshift(P(x1, dy, s0)); return pts; }
    function band(x1, d0, d1) { var a = seg(x1, d0), b = seg(x1, d1).reverse(); return poly(a.concat(b)); }
    var conc = p.build === "concrete", steel = p.build === "steel";
    var under = "", pilesN = "", pilesF = "", glass = "", braces = "", railN = "", railF = "", planks = "", deck = "";
    var dN = seg(NX, yN), dF = seg(FX, yF);
    deck = poly(dN.concat(dF.slice().reverse()));
    under = poly(seg(NX, ySeaF).concat(seg(NX, ySea + 14).reverse()));
    S.forEach(function (s, k) {
      var t0 = P(NX, yN + TH, s), bt = P(NX, ySea, s), w = (conc ? 1.6 : steel ? 0.75 : 1.1) + (conc ? 9 : steel ? 5.5 : 7.8) * s;
      var tf = P(FX, yF + TH, s), bf = P(FX, ySeaF, s);
      pilesF += '<path class="w-pile2" d="' + poly([[tf[0] - w * 0.36, tf[1]], [tf[0] + w * 0.36, tf[1]], [bf[0] + w * 0.4, bf[1]], [bf[0] - w * 0.4, bf[1]]]) + '"/>';
      glass += pileGlass(r, bt[0], bt[1], w, 5 + 30 * s * (0.4 + (1 - t.wind) * 0.6));
      pilesN += pile(r, bt[0], t0[1], bt[1], w, "w-pp", wetH * s);
      if (k > 0 && !conc && !steel) {
        var ps = S[k - 1], q0 = P(NX, yN + TH + 3, ps), b0 = P(NX, ySea - 7, ps), q1 = P(NX, yN + TH + 3, s), b1 = P(NX, ySea - 7, s);
        braces += '<path d="M' + n(q0[0]) + " " + n(q0[1]) + "L" + n(b1[0]) + " " + n(b1[1]) + "M" + n(q1[0]) + " " + n(q1[1]) + "L" + n(b0[0]) + " " + n(b0[1]) + '" stroke-width="' + n(0.4 + 1.2 * s) + '"/>';
      }
      var rn = P(NX, yN, s), rf = P(FX, yF, s);
      if (p.rail !== false) { railN += "M" + n(rn[0]) + " " + n(rn[1]) + "v" + n(-11 * s); railF += "M" + n(rf[0]) + " " + n(rf[1]) + "v" + n(-11 * s); }
      planks += "M" + n(rn[0]) + " " + n(rn[1]) + "L" + n(rf[0]) + " " + n(rf[1]);
      if (p.deck === "grate" && k > 0) for (var gq = 1; gq < 4; gq++) { var gs = s + ((S[k - 1] - s) * gq) / 4, ga = P(NX, yN, gs), gb = P(FX, yF, gs); planks += "M" + n(ga[0]) + " " + n(ga[1]) + "L" + n(gb[0]) + " " + n(gb[1]); }
    });
    if (p.deck === "grate") for (var gl2 = 0.2; gl2 < 1; gl2 += 0.2) planks += line(seg(NX + (FX - NX) * gl2, yN + (yF - yN) * gl2));
    if (p.rail !== false) { railN += line(seg(NX, yN - 11)) + line(seg(NX, yN - 5.6)); railF += line(seg(FX, yF - 11)); }
    var fascia = band(NX, yN, yN + TH);
    // the head: a T across the end, or an L to one side, with its own piles
    var headS = "", headP = "", headR = "", e0 = P(NX, yN, sE), e1 = P(FX, yF, sE);
    if (p.end && p.end !== "straight") {
      var turnR = p.end === "L" ? !left : p.end === "Lleft" ? left : null, reach = (p.arm || 60) * sE, dpt = Math.max(1.2, (yN - yF) * sE * 0.9);
      var xa = p.end === "T" ? e1[0] - reach * 0.7 : turnR ? e0[0] - 1 : e1[0] - reach, xb = p.end === "T" ? e0[0] + reach : turnR ? e0[0] + reach : e1[0] + 1;
      var hy = e1[1], hth = Math.max(1, TH * sE * 1.1), hsea = HZ + ySea * sE;
      headS = poly([[xa, hy - dpt * 0.2], [xb, hy - dpt * 0.2], [xb, hy + dpt], [xa, hy + dpt]]);
      headP = poly([[xa, hy + dpt], [xb, hy + dpt], [xb, hy + dpt + hth], [xa, hy + dpt + hth]]);
      for (var hx = xa + 1; hx < xb; hx += Math.max(2.2, 9 * sE)) headP += poly([[hx - 0.5, hy + dpt + hth], [hx + 0.5, hy + dpt + hth], [hx + 0.55, hsea], [hx - 0.55, hsea]]);
      if (p.rail !== false) headR = "M" + n(xa) + " " + n(hy - dpt * 0.2 - 11 * sE) + "H" + n(xb);
    }
    // a lamp post on some spans, as on the approved pier
    var lamps = "", glows = "", pools = "", deckPools = "";
    (p.lamps || []).forEach(function (bi) {
      var s = S[bi], f = P(FX, yF, s), hgt = 44 * s, hx2 = f[0] - 7.5 * s, hy2 = f[1] - hgt;
      lamps += '<path class="w-pole" d="M' + n(f[0]) + " " + n(f[1]) + "V" + n(hy2 + 4 * s) + "Q" + n(f[0]) + " " + n(hy2) + " " + n(hx2 + 1.4 * s) + " " + n(hy2) + '" stroke-width="' + n(0.6 + 1.8 * s) + '"/>' +
        '<ellipse class="w-bulb" cx="' + n(hx2 - 0.5 * s) + '" cy="' + n(hy2 + 2.3 * s) + '" rx="' + n(3 * s) + '" ry="' + n(1.3 * s) + '"/>';
      glows += '<circle cx="' + n(hx2) + '" cy="' + n(hy2 + 3 * s) + '" r="' + n(46 * s + 7) + '" fill="url(#' + id + '-lamp)"/>';
      var dn = P(NX, yN, s);
      deckPools += '<ellipse cx="' + n(hx2 - 2 * s) + '" cy="' + n((dn[1] + f[1]) / 2) + '" rx="' + n(24 * s) + '" ry="' + n(3.1 * s) + '"/>';
      pools += waterPool(id, r, hx2 - 4 * s, HZ + ySea * s + 3 * s, 0.7 + s);
    });
    // a picnic table at the tip, and after dark the anglers' own small lights
    var tip = "", own = "";
    if (p.table) { var tx = (e0[0] + e1[0]) / 2, ty = (e0[1] + e1[1]) / 2, ts = Math.max(1.2, 9 * sE); tip = poly([[tx - ts, ty - ts * 0.55], [tx + ts, ty - ts * 0.55], [tx + ts, ty - ts * 0.4], [tx - ts, ty - ts * 0.4]]) + poly([[tx - ts * 0.8, ty - ts * 0.4], [tx - ts * 0.6, ty - ts * 0.4], [tx - ts * 0.7, ty], [tx - ts * 0.9, ty]]) + poly([[tx + ts * 0.6, ty - ts * 0.4], [tx + ts * 0.8, ty - ts * 0.4], [tx + ts * 0.9, ty], [tx + ts * 0.7, ty]]); }
    // a squid night: people along the rail, rods out, each with a light
    // that lays its pool on the water under the pier
    var crowd = "", crods = "", clit = "";
    if (p.crowd) {
      for (i = 0; i < p.crowd; i++) {
        var ci = 1 + Math.floor((i * (nb - 3)) / p.crowd + r() * 0.6), cs = S[ci], dn = P(NX, yN, cs), fx = dn[0] + (r() - 0.6) * 14 * cs, fy = dn[1] - 1.2 * cs, fh = (14 + r() * 2.4) * cs;
        crowd += '<path class="w-fig" d="M' + n(fx) + " " + n(fy) + "V" + n(fy - fh * 0.74) + '" stroke-width="' + n(3.5 * cs) + '"/><circle class="w-figh" cx="' + n(fx - 0.3 * cs) + '" cy="' + n(fy - fh) + '" r="' + n(1.8 * cs) + '"/>';
        crods += '<path class="w-rod" d="M' + n(fx - 1.2 * cs) + " " + n(fy - fh * 0.55) + "L" + n(fx - 15 * cs) + " " + n(fy - fh * 0.25) + '" stroke-width="' + n(0.4 + 0.55 * cs) + '"/>' +
          '<path class="w-line" d="M' + n(fx - 15 * cs) + " " + n(fy - fh * 0.25) + "V" + n(HZ + ySea * cs) + '"/>';
        clit += '<circle cx="' + n(fx - 3 * cs) + '" cy="' + n(fy - fh * 0.45) + '" r="' + n(16 * cs + 3) + '" fill="url(#' + id + '-lamp)"/><circle class="w-lantern" cx="' + n(fx - 3 * cs) + '" cy="' + n(fy - fh * 0.45) + '" r="' + n(Math.max(0.5, 1.1 * cs)) + '"/>';
        if (i % 2 === 0) clit += waterPool(id, r, fx - 10 * cs, HZ + ySea * cs + 3 * cs, 0.5 + cs * 0.9);
      }
    }
    if (p.own) {
      for (i = 0; i < 4; i++) {
        var oi = Math.min(nb, nb - i), so = S[oi], op = P((NX + FX) / 2, yN - 7, so);
        own += '<circle cx="' + n(op[0]) + '" cy="' + n(op[1]) + '" r="' + n(28 * so + 5) + '" fill="url(#' + id + '-lamp)"/><circle class="w-lantern" cx="' + n(op[0]) + '" cy="' + n(op[1]) + '" r="' + n(Math.max(0.45, 1.6 * so)) + '"/>';
        own += waterPool(id, r, op[0], HZ + ySea * so + 2, 0.45 + so);
      }
    }
    var extra = '<linearGradient id="' + id + '-deck" gradientUnits="userSpaceOnUse" x1="' + n(P(NX, 0, sE)[0]) + '" y1="0" x2="' + n(NX) + '" y2="0">' +
      '<stop offset="0" style="stop-color:var(--r3)"/><stop offset=".4" style="stop-color:var(--r4)"/><stop offset="1" style="stop-color:var(--r5)"/></linearGradient>';
    var g = '<g filter="url(#' + id + '-wv)"><path class="w-under" d="' + under + '" filter="url(#' + id + '-b2)"/></g>' +
      '<g class="w-lampson">' + pools + own.replace(/<circle class="w-lantern"[^>]*>/g, "") + "</g>" +
      '<g filter="url(#' + id + '-wv)">' + glass + "</g>" +
      '<path class="w-pile2" d="' + headP + '"/>' + pilesF + '<path class="w-rail w-railf" d="' + railF + '"/>' +
      '<path class="' + (yN < yF ? "w-pile2" : "w-decktop") + '" d="' + deck + '"/><path class="w-planks" d="' + planks + '"/><path class="w-decktop" d="' + headS + '"/>' +
      '<path class="w-rail w-railf" d="' + headR + '"/><path class="w-pile" d="' + tip + '"/>' +
      '<g class="w-lampson w-deckpool">' + deckPools + "</g>" +
      '<g class="w-braces">' + braces + "</g>" +
      '<g fill="url(#' + id + '-deck)">' + pilesN + '<path d="' + fascia + '"/></g>' +
      '<path class="w-liteb" d="' + line(dN) + '"/>' + lamps + '<g class="w-lampson w-crowd">' + crowd + crods + "</g>" + '<path class="w-rail" d="' + railN + '"/>' +
      '<g class="w-lampson">' + clit + "</g>" +
      '<g class="w-lampson">' + glows + (own.match(/<circle class="w-lantern"[^>]*>/g) || []).join("") + "</g>";
    return { svg: left ? '<g transform="translate(' + W + ' 0) scale(-1 1)">' + g + "</g>" : g, def: extra };
  }

  // A dock, a float or a short pier under your feet: its deck running out to
  // an edge a few steps ahead, the water right there past it. p:
  //   ahead  metres to the edge; l, r: metres to its sides
  //   above  how high the deck stands over the water (a float rides low)
  //   planks "across" (default) or "along"; cleats: along its edges
  //   beside [x0, x1, z0, z1]: another float alongside, in metres
  //   back   after dark, light falls on it from behind you
  function onDock(id, p, t, r, V) {
    var e = 1.6, cx = W / 2 + (p.vx || 0) * V.ud, pj0 = eye(V, cx), fl = V.fl;
    // p.turn: degrees the pier runs off your line of sight (less than 0: to
    // the left), so a view turned along the shore keeps the pier true
    var tq = ((p.turn || 0) * Math.PI) / 180, ctq = Math.cos(tq), stq = Math.sin(tq);
    var pj = tq ? function (X, Y, Z) { return pj0(X * ctq + Z * stq, Y, Math.max(0.3, -X * stq + Z * ctq)); } : pj0;
    var Zn = 2.4, Z1 = p.ahead || 8, L = -(p.l || 1.4), R = p.r || 1.4, dk = -e, z, x;
    var deck = quad(pj(L, dk, Zn), pj(R, dk, Zn), pj(R, dk, Z1), pj(L, dk, Z1)), lines = "", side = "", cleats = "", shadow = "";
    if (p.planks === "along") for (x = L + 0.22; x < R; x += 0.22) lines += "M" + n(pj(x, dk, Zn)[0]) + " " + n(pj(x, dk, Zn)[1]) + "L" + n(pj(x, dk, Z1)[0]) + " " + n(pj(x, dk, Z1)[1]);
    else for (z = Zn; z < Z1; z += 0.2 * (1 + (z - Zn) * 0.03)) lines += "M" + n(pj(L, dk, z)[0]) + " " + n(pj(L, dk, z)[1]) + "H" + n(pj(R, dk, z)[0]);
    // the float's lit end edge and the dark it lays on the water past it
    var eL = pj(L, dk, Z1), eR = pj(R, dk, Z1), wl = pj(L, dk - (p.above || 0.5), Z1 + 0.6), wr = pj(R, dk - (p.above || 0.5), Z1 + 0.6);
    shadow = quad([eL[0] - 2, eL[1]], [eR[0] + 2, eR[1]], [wr[0] + 6, eR[1] + 5], [wl[0] - 6, eL[1] + 5]);
    if (p.cleats) for (z = Zn + 1.5; z < Z1; z += 3) [L + 0.12, R - 0.12].forEach(function (cx2) { var c = pj(cx2, dk, z), s2 = fl * 0.09 / z; cleats += quad([c[0] - s2 * 1.6, c[1]], [c[0] + s2 * 1.6, c[1]], [c[0] + s2, c[1] - s2 * 1.2], [c[0] - s2, c[1] - s2 * 1.2]); });
    if (p.beside) {
      var b = p.beside;
      side += quad(pj(b[0], dk - 0.05, b[2]), pj(b[1], dk - 0.05, b[2]), pj(b[1], dk - 0.05, b[3]), pj(b[0], dk - 0.05, b[3]));
      var se = "";
      for (z = b[2]; z < b[3]; z += 0.24) se += "M" + n(pj(b[0], dk - 0.05, z)[0]) + " " + n(pj(b[0], dk - 0.05, z)[1]) + "H" + n(pj(b[1], dk - 0.05, z)[0]);
      side = '<path class="w-under" d="' + quad(pj(b[0], dk - 0.4, b[2]), pj(b[1], dk - 0.4, b[2]), pj(b[1], dk - 0.6, b[3] + 0.5), pj(b[0], dk - 0.6, b[3] + 0.5)) + '"/>' +
        '<path class="w-decktop" d="' + side + '"/><path class="w-planks" d="' + se + '"/><path class="w-liteb" d="M' + n(pj(b[0], dk - 0.05, b[3])[0]) + " " + n(pj(b[0], dk - 0.05, b[3])[1]) + "H" + n(pj(b[1], dk - 0.05, b[3])[0]) + '"/>';
    }
    var back = p.back ? '<g class="w-lampson"><ellipse cx="' + n(cx) + '" cy="' + n(pj(0, dk, Z1 - 1.5)[1]) + '" rx="' + n(fl * 3.4 / (Z1 - 1.5)) + '" ry="' + n(fl * 0.9 / (Z1 - 1.5)) + '" fill="url(#' + id + '-lamp)"/>' +
      '<ellipse class="w-pool" cx="' + n(cx) + '" cy="' + n(eL[1] - 10) + '" rx="' + n(Math.abs(eR[0] - eL[0]) * 1.4) + '" ry="12" fill="url(#' + id + '-lamp)"/></g>' : "";
    return side + '<path class="w-under" d="' + shadow + '" filter="url(#' + id + '-b2)"/><path class="w-dock" d="' + deck + '"/><path class="w-planks w-planksn" d="' + lines + '"/>' +
      '<path class="w-pile" d="' + cleats + '"/><path class="w-liteb" d="M' + n(eL[0]) + " " + n(eL[1]) + "H" + n(eR[0]) + '"/>' + back;
  }

  // ---- parts: the world in metres ---------------------------------------------------
  // The things at a spot that a person would know it by (its pier, the float
  // beside the ramp, the boathouse, the rocks, the big tree by the path) are
  // placed in metres from where you stand, as a map would place them: X to
  // your right, Z ahead, Y up from the datum (low water on the Sound and the
  // coast, the river's own low line, a lake's top). Seen through the spot's
  // lens from your eye (o.eye metres above that datum), so the pier keeps its
  // real shape whichever way you look at it, and today's water stands at its
  // real height on every piling: the tide (o.tideRange metres of it) lifts
  // the water up the piles and drowns the flats; a low tide leaves the near
  // bents standing on the beach with their weed line showing.
  //   o.ground  the beach: { shore: Z where the dry top ends, top: its height,
  //             slope: drop per metre seaward } (a shore across your view)
  //   o.site    { bearing }: the parts are given on the site's own square
  //             (Z out along the pier, X along the shore), turned here to the
  //             way you face, so a pier drawn from its plan stays true
  //   o.eyeFloat  you stand on a float that rides the tide: your eye is
  //             this far over today's water (o.eye is then unused)
  // Land you can walk on (a ground part, a lawn or a path) is solid: a pile
  // or a tree standing on it stops at its top, not at the water below.
  function world(V, o, t) {
    var rng = o.tideRange == null ? 3.7 : o.tideRange, g = o.ground, fl = V.fl, cx = W / 2;
    // the water today: the tide's own metres when the page has them (a minus
    // tide included), else its share of the range; never over the beach top
    var wl = t.tideM != null ? t.tideM : t.tide * rng;
    if (g && g.top != null) wl = Math.min(wl, g.top - 0.15);
    var E = o.eyeFloat != null ? wl + 0.45 + o.eyeFloat : o.eye == null ? 3 : o.eye;
    var th = o.site && o.site.bearing != null ? (relB(o.site.bearing, V.f) * Math.PI) / 180 : 0, ct = Math.cos(th), stt = Math.sin(th);
    var w = { E: E, fl: fl, rng: rng, wl: wl, hw: rng + 0.35, V: V, floors: [], wind: t.wind };
    w.st = function (X, Z) { return [X * ct + Z * stt, -X * stt + Z * ct]; };
    w.sz = function (X, Z) { return -X * stt + Z * ct; };
    w.Pst = function (X, Y, Z) { Z = Math.max(Z, 0.25); return [cx + (fl * X) / Z, HZ - (fl * (Y - E)) / Z]; };
    w.P = function (X, Y, Z) { var q = w.st(X, Z); return w.Pst(q[0], Y, q[1]); };
    w.px = function (m, X, Z) { return (fl * m) / Math.max(w.sz(X, Z), 0.25); };
    w.bed = function (X, Z) { return g ? g.top - g.slope * Math.max(0, Z - g.shore) : -99; };
    w.floor = function (X, Z) {
      var y = -99;
      w.floors.forEach(function (f) {
        var p = f.pts, inside = false, i, j;
        for (i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > Z) !== (p[j][1] > Z) && X < ((p[j][0] - p[i][0]) * (Z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
        if (inside && f.y > y) y = f.y;
      });
      return y;
    };
    w.foot = function (X, Z) { return Math.max(w.wl, w.bed(X, Z), w.floor(X, Z)); };
    w.wet = function (X, Z) { return w.bed(X, Z) < w.wl && w.floor(X, Z) < w.wl; };
    // where the water meets the beach today, in metres out from the shore
    w.edgeZ = g ? (g.top <= w.wl ? g.shore : g.shore + (g.top - w.wl) / g.slope) : null;
    return w;
  }
  // A polygon given in metres, cut at the near plane so a deck that runs
  // under your feet ends at the frame and not behind your eye.
  function clipZ(pts, zn) {
    var out = [], i;
    for (i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], ia = a[2] >= zn, ib = b[2] >= zn;
      if (ia) out.push(a);
      if (ia !== ib) { var f = (zn - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, zn]); }
    }
    return out;
  }
  function poly3(w, pts) {
    var c = clipZ(pts.map(function (q) { var a = w.st(q[0], q[2]); return [a[0], q[1], a[1]]; }), 0.9);
    return c.length > 2 ? poly(c.map(function (q) { return w.Pst(q[0], q[1], q[2]); })) : "";
  }
  // Far is pale and near is dark: the tone of a built thing by its distance.
  function tone(d) { return d < 26 ? 5 : d < 70 ? 4 : d < 170 ? 3 : 2; }
  function dist(X, Z) { return Math.sqrt(X * X + Z * Z); }

  // A broken ladder of gold on the water from x, y0 down toward you, lad
  // long: wider and fainter as it nears, wider still in a wind.
  function ladder(x, y0, lad, sc, rr, wind) {
    var ps = "", steps = Math.round(clamp(lad / 3.2, 6, 26)), wd = wind == null ? 0.3 : wind;
    for (var kk = 0; kk < steps; kk++) {
      var qq = kk / steps, yk = y0 + lad * Math.pow(qq, 1.12), ww = Math.max(1.2, sc * (0.6 + qq * 1.7) * (0.7 + wd)) * (0.5 + rr() * 0.9), hk = Math.max(0.6, (lad / steps) * (0.34 + rr() * 0.32));
      ps += '<rect x="' + n(x - ww / 2 + (rr() - 0.5) * sc * 0.35 * (1 + qq * 2)) + '" y="' + n(yk) + '" width="' + n(ww) + '" height="' + n(hk) + '" rx=".4" opacity="' + n((1 - qq * 0.7) * (0.62 + rr() * 0.38)) + '"/>';
    }
    return ps;
  }
  // A lamp post standing at x, z on a deck or a plaza (y its foot): "arm"
  // (tall, one arm reaching over the deck to inX, inZ), "pole" (a plain
  // head) or "lantern" (a lantern on top). After dark: its glow, its pool on
  // the deck, and a broken ladder of its light on the water at p.water.
  function lampPost(id, w, p, prims) {
    var X = p.x, Z = p.z, D = p.y, lh = p.h || 5, kind = p.kind || "arm";
    if (w.sz(X, Z) < 2) return false;
    var d = dist(X, Z), tn4 = tone(d), base = w.P(X, D, Z), tp = w.P(X, D + lh, Z), pwd = Math.max(0.45, w.px(0.14, X, Z));
    var inX = p.inX == null ? X : p.inX, inZ = p.inZ == null ? Z : p.inZ, hd = w.P(inX, D + lh - 0.15, inZ), sc = w.px(1, X, Z);
    var sv4 = '<path class="w-s' + tn4 + '" d="' + poly([[base[0] - pwd / 2, base[1]], [base[0] + pwd / 2, base[1]], [tp[0] + pwd * 0.35, tp[1]], [tp[0] - pwd * 0.35, tp[1]]]) + '"/>', head = tp;
    if (kind === "arm") {
      sv4 += '<path class="w-pole w-s' + tn4 + '" d="M' + n(tp[0]) + " " + n(tp[1]) + "Q" + n(tp[0]) + " " + n(tp[1] - sc * 0.4) + " " + n(hd[0]) + " " + n(hd[1] - sc * 0.25) + '" stroke-width="' + n(pwd * 0.7) + '"/>' +
        '<path class="w-s' + tn4 + '" d="' + poly([[hd[0] - sc * 0.32, hd[1] - sc * 0.32], [hd[0] + sc * 0.32, hd[1] - sc * 0.32], [hd[0] + sc * 0.22, hd[1] + sc * 0.05], [hd[0] - sc * 0.22, hd[1] + sc * 0.05]]) + '"/>';
      head = [hd[0], hd[1]];
    } else if (kind === "lantern") {
      sv4 += '<path class="w-s' + tn4 + '" d="' + poly([[tp[0] - sc * 0.22, tp[1]], [tp[0] + sc * 0.22, tp[1]], [tp[0] + sc * 0.3, tp[1] - sc * 0.5], [tp[0] + sc * 0.08, tp[1] - sc * 0.72], [tp[0] - sc * 0.08, tp[1] - sc * 0.72], [tp[0] - sc * 0.3, tp[1] - sc * 0.5]]) + '"/>';
      head = [tp[0], tp[1] - sc * 0.3];
    } else {
      sv4 += '<path class="w-s' + tn4 + '" d="' + poly([[tp[0] - sc * 0.26, tp[1] + sc * 0.05], [tp[0] + sc * 0.26, tp[1] + sc * 0.05], [tp[0] + sc * 0.16, tp[1] - sc * 0.22], [tp[0] - sc * 0.16, tp[1] - sc * 0.22]]) + '"/>';
    }
    sv4 += '<ellipse class="w-bulb" cx="' + n(head[0]) + '" cy="' + n(head[1] + sc * 0.06) + '" rx="' + n(Math.max(0.5, sc * 0.2)) + '" ry="' + n(Math.max(0.35, sc * 0.09)) + '"/>';
    var ld2 = '<circle cx="' + n(head[0]) + '" cy="' + n(head[1] + sc * 0.1) + '" r="' + n(Math.min(70, sc * 3.2 + 4)) + '" fill="url(#' + id + '-lamp)"/>';
    var dp = w.P(inX, D, inZ);
    if (p.deck !== false && w.E > D + 0.2) {
      var dA = w.P(inX, D, inZ - 1.6), dB = w.P(inX, D, inZ + 1.6);
      // its light lies on the deck under it, feathered out (no hard edge)
      ld2 += '<ellipse class="w-deckglow" cx="' + n(dp[0]) + '" cy="' + n(dp[1]) + '" rx="' + n(sc * 3.4) + '" ry="' + n(Math.max(0.6, Math.abs(dA[1] - dB[1]) * 0.75)) + '" fill="url(#' + id + '-lamp)"/>';
    }
    // its light on the water: a long broken ladder of gold straight down
    // from under the lamp, as long as the lamp stands high over the water
    // and longer still on a calm night (the mirror image, smeared by ripples)
    var ps = "", rr = rnd(Math.round(Math.abs(X) * 7 + Z * 13));
    if (p.water && w.wet(p.water[0], p.water[1])) {
      var wp = w.P(p.water[0], w.wl, p.water[1]), calm = 1 - (w.wind == null ? 0.3 : w.wind);
      var lad = clamp((wp[1] - head[1]) * (1.1 + calm * 1.3), 10, 150), y0 = wp[1];
      // it ends where the water does: never across the beach in front
      if (w.edgeZ != null) { var ye = w.P(p.water[0], w.wl, w.edgeZ)[1]; if (ye > y0) lad = Math.min(lad, ye - y0); }
      ps = ladder(wp[0], y0, lad, sc, rr, w.wind);
    }
    // the ladder lies on the water where the light falls: painted in its
    // place among the things, so piles beyond it stand behind it and the
    // near bents in front of it
    // and the soft wash of its light on the water round the foot of the ladder
    if (ps) prims.push([dist(p.water[0], p.water[1]) - 0.3, '<g class="w-lampson"' + (w.wclip ? ' clip-path="url(#' + w.wclip + ')"' : "") + '><ellipse class="w-pool" cx="' + n(wp[0]) + '" cy="' + n(wp[1] + Math.min(lad, sc * 3) * 0.35) + '" rx="' + n(Math.min(110, sc * 4.6)) + '" ry="' + n(Math.min(26, Math.max(3, Math.min(lad, sc * 3) * 0.6))) + '" fill="url(#' + id + '-lamp)"/><g class="w-poolg">' + ps + "</g></g>"]);
    // over the beach (a low tide) its light lies on the sand instead
    else if (p.water) {
      var gp = w.P(p.water[0], w.foot(p.water[0], p.water[1]), p.water[1]), gs = w.px(1, p.water[0], p.water[1]);
      prims.push([dist(p.water[0], p.water[1]) - 0.3, '<g class="w-lampson"><ellipse class="w-sandpool" cx="' + n(gp[0]) + '" cy="' + n(gp[1]) + '" rx="' + n(Math.min(90, gs * 4.2)) + '" ry="' + n(Math.min(16, gs * 0.9)) + '" fill="url(#' + id + '-lamp)"/></g>']);
    }
    prims.push([d - 0.5, sv4 + '<g class="w-lampson">' + ld2 + "</g>"]);
    return true;
  }
  // A pier, a bridge or a float walk, from its plan. p:
  //   segs   [{ a: [X, Z], b: [X, Z], w, gap: [d0, d1] }]: the stem, then a
  //          T or L head as its own segment (gap: where the stem meets the
  //          head's shore side, metres along it, so no rail crosses it)
  //   deck   its height over the datum; beam: the depth of its edge
  //   bent   metres between piling bents; build: "timber" (cross braced),
  //          "concrete" (heavy) or "steel" (slender); piers: a bridge's
  //          columns, metres apart (wide spans, no bents)
  //   rail   "wood" (posts and two rails), "plain" (a light rail), "wall"
  //          (a bridge's parapet) or false
  //   lamps  { kind: "arm" (single arm over the deck), "pole" or "lantern",
  //          every: metres, side: "both", "near" or "far", h: metres, segs }
  //   shelters [[seg, from, to]]: small roofed shelters on that stretch
  //   crowd  people at the rail after dark (a squid night); own: each with
  //          their own light; head: [seg] where most of them stand
  //   truss  a steel truss over the deck (a rail bridge)
  function pier3d(id, w, p, t, r, prims, glass) {
    var D = p.deck || 6, bm = p.beam || 0.7, conc = p.build === "concrete", steel = p.build === "steel", pw = p.pile || (conc ? 0.6 : steel ? 0.42 : 0.38);
    var above = w.E > D, rh = p.railH || 1.1, segs = p.segs, lampN = 0;
    segs.forEach(function (sg, si) {
      var a = sg.a, b = sg.b, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = uz, nz = -ux, hw = sg.w / 2;
      var mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      var ns = dist(mx + nx * hw, mz + nz * hw) < dist(mx - nx * hw, mz - nz * hw) ? 1 : -1;
      function at(d, s, k) { return [a[0] + ux * d + nx * hw * s * (k == null ? 1 : k), a[1] + uz * d + nz * hw * s * (k == null ? 1 : k)]; }
      var bent = sg.bent || p.bent || 5, nb = Math.max(1, Math.round(L / bent)), step = L / nb, k, s;
      var across = p.piers ? [0] : sg.w > 7 ? [-1, -0.33, 0.33, 1] : [-1, 1];
      // the piles (or a bridge's columns) under each bent, to the water or the beach
      for (k = sg.skip0 ? 1 : 0; k <= nb; k++) {
        if (p.piers && k % Math.max(1, Math.round(p.piers / step)) !== 0) continue;
        if (p.piers && (k === 0 || k === nb) && !sg.ends) continue;
        across.forEach(function (fk) {
          var q = at(k * step, fk * ns, 0.9), X = q[0], Z = q[1];
          if (w.sz(X, Z) < 1.2) return;
          var d = dist(X, Z), ft = w.foot(X, Z), wet = w.wet(X, Z), top = w.P(X, D - bm, Z), bot = w.P(X, ft, Z), pwx = Math.max(0.5, w.px(p.piers ? pw * 2.4 : pw, X, Z));
          var wetH = Math.max(0, (Math.min(w.hw, D - bm) - ft) * w.fl / w.sz(X, Z));
          var cls = "w-s" + tone(d), sv = pile(r, top[0], top[1], bot[1], pwx, cls, Math.min(wetH, bot[1] - top[1] - 0.5));
          if (!wet) sv += '<ellipse class="w-cob-sh" cx="' + n(bot[0] + pwx * 0.6) + '" cy="' + n(bot[1] + 0.3) + '" rx="' + n(pwx * 1.4) + '" ry="' + n(Math.max(0.3, pwx * 0.25)) + '"/>';
          else if (glass != null) glass.push(pileGlass(r, bot[0], bot[1], pwx, Math.min(40, w.px(6, X, Z)) * (0.35 + (1 - t.wind) * 0.65)));
          prims.push([d + fk * ns * 0.01, sv]);
        });
        // timber bents carry their X braces under the near edge
        if (!p.piers && p.build === "timber" && k > 0) {
          var q0 = at((k - 1) * step, ns, 0.9), q1 = at(k * step, ns, 0.9), lo0 = Math.max(w.foot(q0[0], q0[1]) + 0.6, D - 4), lo1 = Math.max(w.foot(q1[0], q1[1]) + 0.6, D - 4);
          if (w.sz(q0[0], q0[1]) > 1.5 && w.sz(q1[0], q1[1]) > 1.5) {
            var A = w.P(q0[0], D - bm - 0.2, q0[1]), B = w.P(q1[0], lo1, q1[1]), C = w.P(q1[0], D - bm - 0.2, q1[1]), Dd = w.P(q0[0], lo0, q0[1]);
            prims.push([dist(q1[0], q1[1]) - 0.02, '<path class="w-brace' + tone(dist(q1[0], q1[1])) + '" d="M' + n(A[0]) + " " + n(A[1]) + "L" + n(B[0]) + " " + n(B[1]) + "M" + n(C[0]) + " " + n(C[1]) + "L" + n(Dd[0]) + " " + n(Dd[1]) + '" stroke-width="' + n(Math.max(0.35, w.px(0.14, q1[0], q1[1]))) + '"/>']);
          }
        }
      }
      // the deck, bay by bay: its top when you are above it, its dark
      // underside when you stand below it, and always its edge toward you
      for (k = 0; k < nb; k++) {
        var d0 = k * step, d1 = (k + 1) * step, c0 = at(d0, -1), c1 = at(d1, -1), c2 = at(d1, 1), c3 = at(d0, 1);
        var e0 = at(d0, ns), e1 = at(d1, ns), dd = dist((e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2), tn = tone(dd);
        var top3 = [[c0[0], D, c0[1]], [c1[0], D, c1[1]], [c2[0], D, c2[1]], [c3[0], D, c3[1]]];
        var sv2 = "";
        if (above) sv2 += '<path class="w-t' + tn + '" d="' + poly3(w, top3) + '"/>';
        else sv2 += '<path class="w-u' + tn + '" d="' + poly3(w, top3.map(function (q) { return [q[0], D - bm, q[2]]; })) + '"/>';
        sv2 += '<path class="w-s' + tn + '" d="' + poly3(w, [[e0[0], D, e0[1]], [e1[0], D, e1[1]], [e1[0], D - bm, e1[1]], [e0[0], D - bm, e0[1]]]) + '"/>';
        if (above && sg.w > 0) {
          var l0 = w.P(e0[0], D, e0[1]), l1 = w.P(e1[0], D, e1[1]);
          sv2 += '<path class="w-liteb" d="M' + n(l0[0]) + " " + n(l0[1]) + "L" + n(l1[0]) + " " + n(l1[1]) + '"/>';
          // a wooden deck's planks across it
          if (p.planks) {
            var pk = "";
            for (var pd0 = d0 + 0.2; pd0 < d1; pd0 += 0.36) { var pA = at(pd0, -1, 0.98), pB = at(pd0, 1, 0.98); if (w.sz(pA[0], pA[1]) > 1 && w.sz(pB[0], pB[1]) > 1) { var sA = w.P(pA[0], D, pA[1]), sB = w.P(pB[0], D, pB[1]); pk += "M" + n(sA[0]) + " " + n(sA[1]) + "L" + n(sB[0]) + " " + n(sB[1]); } }
            sv2 += '<path class="w-planks" d="' + pk + '"/>';
          }
        }
        prims.push([(dist(c0[0], c0[1]) + dist(c1[0], c1[1]) + dist(c2[0], c2[1]) + dist(c3[0], c3[1])) / 4, sv2]);
      }
      // the rails: posts and two rails along each edge, a gap where another
      // part of the pier meets this one
      if (p.rail) {
        [ns, -ns].forEach(function (side) {
          var gap = side === -ns || !sg.gap ? null : sg.gap, post = p.rail === "wall" ? 0 : 2.4, d = 0;
          var runs = gap ? [[0, gap[0]], [gap[1], L]] : [[0, L]];
          if (sg.norail && sg.norail.indexOf(side === ns ? "near" : "far") >= 0) runs = [];
          runs.forEach(function (rn) {
            for (d = rn[0]; d < rn[1] - 0.01; d += step) {
              var dA = d, dB = Math.min(rn[1], d + step), qa = at(dA, side, 0.96), qb = at(dB, side, 0.96), mdist = dist((qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2), tn2 = tone(mdist);
              var bar = Math.max(0.12, 0.07);
              var sv3 = "";
              if (p.rail === "wall") sv3 += '<path class="w-s' + tn2 + '" d="' + poly3(w, [[qa[0], D + 0.9, qa[1]], [qb[0], D + 0.9, qb[1]], [qb[0], D, qb[1]], [qa[0], D, qa[1]]]) + '"/>';
              else {
                sv3 += '<path class="w-s' + tn2 + '" d="' + poly3(w, [[qa[0], D + rh, qa[1]], [qb[0], D + rh, qb[1]], [qb[0], D + rh - bar, qb[1]], [qa[0], D + rh - bar, qa[1]]]) +
                  poly3(w, [[qa[0], D + rh * 0.5, qa[1]], [qb[0], D + rh * 0.5, qb[1]], [qb[0], D + rh * 0.5 - bar * 0.8, qb[1]], [qa[0], D + rh * 0.5 - bar * 0.8, qa[1]]]) + '"/>';
                for (var pd = dA; pd <= dB + 0.01; pd += post) {
                  var pq = at(pd, side, 0.96), pa = w.P(pq[0], D, pq[1]), pb = w.P(pq[0], D + rh, pq[1]), pwd = Math.max(0.35, w.px(p.rail === "wood" ? 0.12 : 0.07, pq[0], pq[1]));
                  if (w.sz(pq[0], pq[1]) > 0.9) sv3 += '<path class="w-s' + tn2 + '" d="' + poly([[pa[0] - pwd / 2, pa[1]], [pa[0] + pwd / 2, pa[1]], [pb[0] + pwd / 2, pb[1]], [pb[0] - pwd / 2, pb[1]]]) + '"/>';
                }
              }
              prims.push([mdist + (side === ns ? -0.4 : 0.4) * hw, sv3]);
            }
          });
        });
      }
      // a truss over a rail bridge's deck
      if (p.truss) {
        var tz = "", tq0 = at(0, ns, 1), tsteps = Math.round(L / 8);
        for (k = 0; k <= tsteps; k++) {
          var tq = at((k * L) / tsteps, ns, 1), tqn = at(Math.min(L, ((k + 1) * L) / tsteps), ns, 1), up = w.P(tq[0], D + 5, tq[1]), dn = w.P(tq[0], D, tq[1]), dn2 = w.P(tqn[0], D, tqn[1]);
          tz += "M" + n(dn[0]) + " " + n(dn[1]) + "L" + n(up[0]) + " " + n(up[1]) + (k < tsteps ? "L" + n(dn2[0]) + " " + n(dn2[1]) : "");
        }
        var t0 = w.P(tq0[0], D + 5, tq0[1]), tq1 = at(L, ns, 1), t1 = w.P(tq1[0], D + 5, tq1[1]);
        tz += "M" + n(t0[0]) + " " + n(t0[1]) + "L" + n(t1[0]) + " " + n(t1[1]);
        prims.push([dist(mx, mz) - hw, '<path class="w-truss" d="' + tz + '"/>']);
      }
      // small roofed shelters standing on this stretch
      (p.shelters || []).forEach(function (sh) {
        if (sh[0] !== si) return;
        var f0 = sh[1], f1 = sh[2], q00 = at(f0, -1, 0.8), q01 = at(f1, -1, 0.8), q11 = at(f1, 1, 0.8), q10 = at(f0, 1, 0.8), ph = 2.5, rt = D + ph, rp = D + ph + 1.1;
        var md = dist((q00[0] + q11[0]) / 2, (q00[1] + q11[1]) / 2), tn3 = tone(md), cmid = [(q00[0] + q11[0]) / 2, (q00[1] + q11[1]) / 2];
        var posts = "";
        [at(f0 + 0.2, ns, 0.75), at(f1 - 0.2, ns, 0.75)].forEach(function (pq) { var pa = w.P(pq[0], D, pq[1]), pb = w.P(pq[0], rt, pq[1]), pwd = Math.max(0.5, w.px(0.18, pq[0], pq[1])); posts += poly([[pa[0] - pwd / 2, pa[1]], [pa[0] + pwd / 2, pa[1]], [pb[0] + pwd / 2, pb[1]], [pb[0] - pwd / 2, pb[1]]]); });
        var eaveN0 = at(f0 - 0.4, ns, 0.95), eaveN1 = at(f1 + 0.4, ns, 0.95), eaveF0 = at(f0 - 0.4, -ns, 0.95), eaveF1 = at(f1 + 0.4, -ns, 0.95);
        var ridge0 = [cmid[0] - ux * (f1 - f0) * 0.18, cmid[1] - uz * (f1 - f0) * 0.18], ridge1 = [cmid[0] + ux * (f1 - f0) * 0.18, cmid[1] + uz * (f1 - f0) * 0.18];
        var roofN = poly3(w, [[eaveN0[0], rt, eaveN0[1]], [eaveN1[0], rt, eaveN1[1]], [ridge1[0], rp, ridge1[1]], [ridge0[0], rp, ridge0[1]]]);
        var roofF = poly3(w, [[eaveF0[0], rt, eaveF0[1]], [eaveF1[0], rt, eaveF1[1]], [ridge1[0], rp, ridge1[1]], [ridge0[0], rp, ridge0[1]]]);
        var hipA = poly3(w, [[eaveN0[0], rt, eaveN0[1]], [eaveF0[0], rt, eaveF0[1]], [ridge0[0], rp, ridge0[1]]]), hipB = poly3(w, [[eaveN1[0], rt, eaveN1[1]], [eaveF1[0], rt, eaveF1[1]], [ridge1[0], rp, ridge1[1]]]);
        var fasc = poly3(w, [[eaveN0[0], rt, eaveN0[1]], [eaveN1[0], rt, eaveN1[1]], [eaveN1[0], rt - 0.25, eaveN1[1]], [eaveN0[0], rt - 0.25, eaveN0[1]]]);
        prims.push([md - 0.3, '<path class="w-s' + tn3 + '" d="' + posts + '"/><path class="w-u' + tn3 + '" d="' + (above ? "" : roofF) + '"/><path class="w-roofs' + tn3 + '" d="' + roofF + hipA + hipB + '"/><path class="w-roofn' + tn3 + '" d="' + roofN + '"/><path class="w-s' + tn3 + '" d="' + fasc + '"/>']);
      });
      // lamp posts along the rail: their light on the deck and on the water
      (Array.isArray(p.lamps) ? p.lamps : p.lamps ? [p.lamps] : []).forEach(function (lp) {
        if (lp.segs && lp.segs.indexOf(si) < 0) return;
        var every = lp.every || 20, sides = lp.side === "near" ? [ns] : lp.side === "far" ? [-ns] : lp.side === "alt" ? null : [ns, -ns];
        var first = lp.from == null ? every / 2 : lp.from, last = lp.to == null ? L : lp.to;
        for (var ld = first, li = 0; ld <= last + 0.01; ld += every, li++) {
          (sides || [li % 2 ? -ns : ns]).forEach(function (side) {
            var q = at(ld, side, 0.96), wq = at(ld, ns, 1.6);
            if (!w.wet(wq[0], wq[1] + 1.5)) wq = at(ld, -ns, 1.6);
            if (lampPost(id, w, { x: q[0], z: q[1], y: D, h: lp.h || 5, kind: lp.kind, inX: q[0] - nx * side * 1.1, inZ: q[1] - nz * side * 1.1, deck: above, water: [wq[0], wq[1] + 1.5] }, prims)) lampN++;
          });
        }
      });
    });
    // a squid night: people along the rails, rods out, their own small lights
    if (p.crowd) {
      var cr = rnd(idSeed(id) + 17), many = p.crowd, pj = function (X, Yr, Z) { return w.P(X, Yr + w.E, Z); }, dk = D - w.E;
      for (var i = 0; i < many; i++) {
        var sg2 = segs[p.head != null && i % 3 !== 0 ? p.head : Math.floor(cr() * segs.length)], a2 = sg2.a, b2 = sg2.b, L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
        var u2 = 0.06 + cr() * 0.88, nx2 = (b2[1] - a2[1]) / L2, nz2 = -(b2[0] - a2[0]) / L2, X2 = a2[0] + (b2[0] - a2[0]) * u2, Z2 = a2[1] + (b2[1] - a2[1]) * u2;
        var hw2 = sg2.w / 2 - 0.45, sd2 = dist(X2 + nx2 * hw2, Z2 + nz2 * hw2) < dist(X2 - nx2 * hw2, Z2 - nz2 * hw2) ? 1 : -1;
        var side2 = cr() < 0.55 ? -sd2 : sd2;
        X2 += nx2 * hw2 * side2; Z2 += nz2 * hw2 * side2;
        if (w.sz(X2, Z2) < 3) continue;
        var g = angler(pj, X2, Z2, dk, cr), sc2 = w.px(1, X2, Z2);
        var fig = '<path class="w-figh" d="' + g.fig + '"/><path class="w-rod" d="' + g.rod + '" stroke-width="' + n(g.w) + '"/><path class="w-line" d="' + g.line + '"/>';
        if (p.own) fig += '<circle cx="' + n(g.hand[0]) + '" cy="' + n(g.hand[1]) + '" r="' + n(Math.min(30, sc2 * 1.3 + 2)) + '" fill="url(#' + id + '-lamp)"/><circle class="w-lantern" cx="' + n(g.hand[0]) + '" cy="' + n(g.hand[1]) + '" r="' + n(Math.max(0.45, sc2 * 0.06)) + '"/>';
        prims.push([dist(X2, Z2) - 0.2, '<g class="w-lampson w-crowd">' + fig + "</g>"]);
        // a squid light let down on its cord: a bright spot on the water
        // just off the rail, its pool, and its short ladder toward you
        if (p.own === "water" && i % 2 === 0) {
          var oX = X2 + nx2 * side2 * 1.3, oZ = Z2 + nz2 * side2 * 1.3;
          if (w.wet(oX, oZ) && w.sz(oX, oZ) > 4) {
            var sp = w.P(oX, w.wl, oZ), ss = w.px(1, oX, oZ), lr = rnd(i * 31 + 7);
            var sl = '<ellipse class="w-pool" cx="' + n(sp[0]) + '" cy="' + n(sp[1] + ss * 0.3) + '" rx="' + n(Math.min(46, ss * 3.4 + 3)) + '" ry="' + n(Math.min(12, ss * 0.7 + 1.2)) + '" fill="url(#' + id + '-lamp)"/>' +
              '<g class="w-poolg">' + ladder(sp[0], sp[1], clamp(ss * 4.5, 6, 40), ss * 0.7, lr, w.wind) + '<ellipse cx="' + n(sp[0]) + '" cy="' + n(sp[1]) + '" rx="' + n(Math.max(0.9, ss * 0.42)) + '" ry="' + n(Math.max(0.4, ss * 0.12)) + '"/></g>';
            prims.push([dist(oX, oZ) - 0.3, '<g class="w-lampson">' + sl + "</g>"]);
          }
        }
      }
    }
    return lampN;
  }

  // A float beside a ramp: a long low walk riding on the water (sitting on
  // the beach when the tide leaves it), and the bare guide pilings standing
  // along it, tall at low water. p: a, b, w, piles (metres apart), top.
  function float3d(id, w, p, t, r, prims, glass) {
    var a = p.a, b = p.b, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = uz, nz = -ux, hw = p.w / 2, k;
    var ns = dist(a[0] + nx * hw, a[1] + nz * hw) < dist(a[0] - nx * hw, a[1] - nz * hw) ? 1 : -1, nb = Math.max(2, Math.round(L / 6)), st = L / nb;
    for (k = 0; k < nb; k++) {
      var d0 = k * st, d1 = (k + 1) * st, q0 = [a[0] + ux * d0, a[1] + uz * d0], q1 = [a[0] + ux * d1, a[1] + uz * d1];
      var y0 = w.foot(q0[0], q0[1]) + 0.45, y1 = w.foot(q1[0], q1[1]) + 0.45, md = dist((q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2), tn = tone(md);
      var c = [[q0[0] - nx * hw, y0, q0[1] - nz * hw], [q1[0] - nx * hw, y1, q1[1] - nz * hw], [q1[0] + nx * hw, y1, q1[1] + nz * hw], [q0[0] + nx * hw, y0, q0[1] + nz * hw]];
      var e0 = [q0[0] + nx * hw * ns, q0[1] + nz * hw * ns], e1 = [q1[0] + nx * hw * ns, q1[1] + nz * hw * ns];
      var sv = (w.E > y0 ? '<path class="w-t' + tn + '" d="' + poly3(w, c) + '"/>' : "") +
        '<path class="w-s' + tn + '" d="' + poly3(w, [[e0[0], y0, e0[1]], [e1[0], y1, e1[1]], [e1[0], y1 - 0.4, e1[1]], [e0[0], y0 - 0.4, e0[1]]]) + '"/>';
      var l0 = w.P(e0[0], y0, e0[1]), l1 = w.P(e1[0], y1, e1[1]);
      sv += '<path class="w-liteb" d="M' + n(l0[0]) + " " + n(l0[1]) + "L" + n(l1[0]) + " " + n(l1[1]) + '"/>';
      if (p.planks && w.E > y0) {
        // its deck planks across it, the far edge dark where the water
        // washes it, its cleats along that edge, and the dark it lays on the water
        var f0 = [q0[0] - nx * hw * ns, q0[1] - nz * hw * ns], f1 = [q1[0] - nx * hw * ns, q1[1] - nz * hw * ns], pl = "", cl = "";
        for (var pd = d0 + 0.3; pd < d1; pd += 0.3) {
          var pa = w.P(a[0] + ux * pd + nx * hw, y0, a[1] + uz * pd + nz * hw), pb = w.P(a[0] + ux * pd - nx * hw, y0, a[1] + uz * pd - nz * hw);
          if (Math.max(pa[0], pb[0]) > -10 && Math.min(pa[0], pb[0]) < W + 10) pl += "M" + n(pa[0]) + " " + n(pa[1]) + "L" + n(pb[0]) + " " + n(pb[1]);
        }
        var wetE = poly3(w, [[f0[0], y0, f0[1]], [f1[0], y1, f1[1]], [f1[0] + nx * ns * 0.25, y1, f1[1] + nz * ns * 0.25], [f0[0] + nx * ns * 0.25, y0, f0[1] + nz * ns * 0.25]]);
        var shd = poly3(w, [[f0[0], w.wl, f0[1]], [f1[0], w.wl, f1[1]], [f1[0] - nx * ns * 0.9, w.wl, f1[1] - nz * ns * 0.9], [f0[0] - nx * ns * 0.9, w.wl, f0[1] - nz * ns * 0.9]]);
        if (p.cleats) for (var cd = d0 + 1.5; cd < d1; cd += p.cleats) {
          var cq = [a[0] + ux * cd - nx * hw * ns * 0.88, a[1] + uz * cd - nz * hw * ns * 0.88], cc = w.P(cq[0], y0, cq[1]), cs = w.px(0.09, cq[0], cq[1]);
          cl += poly([[cc[0] - cs * 2.4, cc[1]], [cc[0] + cs * 2.4, cc[1]], [cc[0] + cs * 1.4, cc[1] - cs * 1.2], [cc[0] + cs * 2, cc[1] - cs * 1.7], [cc[0] - cs * 2, cc[1] - cs * 1.7], [cc[0] - cs * 1.4, cc[1] - cs * 1.2]]);
        }
        sv = '<path class="w-under" d="' + shd + '"/>' + sv + '<path class="w-planks" d="' + pl + '"/><path class="w-floatwet" d="' + wetE + '"/><path class="w-s5" d="' + cl + '"/>';
      }
      prims.push([md, sv]);
    }
    // p.rings [[metres along it, metres across from its middle]]: crab rings
    // set down on the deck between drops (by day: the card's crabbing is
    // daylight only), each a hoop and its mesh, its line coiled by it, and
    // one ring's line running off the far edge into the water
    (p.rings || []).forEach(function (rg, ri) {
      var cxr = a[0] + ux * rg[0] + nx * rg[1], czr = a[1] + uz * rg[0] + nz * rg[1];
      if (w.sz(cxr, czr) < 2.5) return;
      var yr = w.foot(cxr, czr) + 0.47, R = 0.42, hoop = [], net = "", k9;
      for (k9 = 0; k9 <= 16; k9++) { var an9 = (k9 / 16) * Math.PI * 2; hoop.push(w.P(cxr + Math.cos(an9) * R, yr, czr + Math.sin(an9) * R)); }
      for (k9 = -2; k9 <= 2; k9++) { var A9 = w.P(cxr + k9 * 0.16, yr, czr - Math.sqrt(R * R - k9 * k9 * 0.0256)), B9 = w.P(cxr + k9 * 0.16, yr, czr + Math.sqrt(R * R - k9 * k9 * 0.0256)); net += "M" + n(A9[0]) + " " + n(A9[1]) + "L" + n(B9[0]) + " " + n(B9[1]); }
      var buoy = w.P(cxr + 0.75, yr + 0.12, czr - 0.2), bs = Math.max(0.8, w.px(0.13, cxr, czr)), sv9 = '<path class="w-ringnet" d="' + net + '"/><path class="w-crabring" d="' + line(hoop) + '"/><ellipse class="w-buoy" cx="' + n(buoy[0]) + '" cy="' + n(buoy[1]) + '" rx="' + n(bs * 1.3) + '" ry="' + n(bs) + '"/>';
      if (!ri) { var e9 = w.P(a[0] + ux * rg[0] - nx * hw * ns, yr, a[1] + uz * rg[0] - nz * hw * ns), f9 = w.P(a[0] + ux * (rg[0] + 1.5) - nx * (hw + 1.2) * ns, w.wl, a[1] + uz * (rg[0] + 1.5) - nz * (hw + 1.2) * ns); sv9 += '<path class="w-ringline" d="M' + n(buoy[0]) + " " + n(buoy[1]) + "Q" + n(e9[0]) + " " + n(e9[1] - 1) + " " + n(f9[0]) + " " + n(f9[1]) + '"/>'; }
      // (drawn over the stretch of deck it lies on, whose middle may be nearer you than the ring is)
      var kr = clamp(Math.floor(rg[0] / st), 0, nb - 1), mr = dist(a[0] + ux * (kr + 0.5) * st, a[1] + uz * (kr + 0.5) * st);
      prims.push([Math.min(dist(cxr, czr), mr) - 0.2, '<g class="w-dayonly">' + sv9 + "</g>"]);
    });
    // the guide piles, on the outer side, every few metres
    for (var d = p.piles / 2; p.piles && d < L; d += p.piles) {
      var X = a[0] + ux * d + nx * (hw + 0.5) * -ns, Z = a[1] + uz * d + nz * (hw + 0.5) * -ns;
      if (w.sz(X, Z) < 2) continue;
      var ft = w.foot(X, Z), top = w.P(X, (p.top || 6.2) + (r() - 0.5) * 0.5, Z), bot = w.P(X, ft, Z), pwx = Math.max(0.5, w.px(0.34, X, Z)), dd = dist(X, Z);
      var wetH = Math.max(0, (w.hw - ft) * w.fl / w.sz(X, Z));
      if (w.wet(X, Z) && glass) glass.push(pileGlass(r, bot[0], bot[1], pwx, Math.min(34, w.px(5, X, Z)) * (0.35 + (1 - t.wind) * 0.65)));
      prims.push([dd + 0.01, pile(r, top[0], top[1], bot[1], pwx, "w-s" + tone(dd), Math.min(wetH, bot[1] - top[1] - 0.5))]);
    }
  }

  // A boat ramp from the top of the beach down into today's water: concrete
  // with its grooves, or a gravel launch. Where it goes under, it darkens.
  function ramp3d(w, p, r) {
    var x0 = p.x0, x1 = p.x1, z0 = p.z0, z1 = p.z1 || 80, out = "", sub = "", k, g = p.kind === "gravel";
    var ztop = function (z) { return p.top != null ? Math.min(p.top, w.bed(0, z)) : w.bed(0, z); };
    var zEnd = Math.min(z1, w.edgeZ == null ? z1 : w.edgeZ), pts = [], subp = [];
    // its own slope when there is no beach to follow
    var yAt = function (z) { return p.slope ? p.y0 - p.slope * (z - z0) : ztop(z); };
    if (p.slope) zEnd = Math.min(z1, z0 + (p.y0 - w.wl) / p.slope);
    var top = [[x0, yAt(z0), z0], [x1, yAt(z0), z0], [x1, yAt(zEnd), zEnd], [x0, yAt(zEnd), zEnd]];
    out += '<path class="' + (g ? "w-gravel" : "w-ramp3") + '" d="' + poly3(w, top) + '"/>';
    // under the water it fades away, band by band; no slab running on
    for (k = 0; k < 4; k++) {
      var za = zEnd + k * 1.6, zb = zEnd + (k + 1) * 1.6;
      if (zb > z1) break;
      sub += '<path class="w-rampw" opacity="' + n(0.5 - k * 0.11) + '" d="' + poly3(w, [[x0 + k * 0.15, w.wl, za], [x1 - k * 0.15, w.wl, za], [x1 - (k + 1) * 0.15, w.wl, zb], [x0 + (k + 1) * 0.15, w.wl, zb]]) + '"/>';
    }
    if (!g) {
      // short grooves in a herringbone, and the lower end dark where the
      // tide was last over it
      var gr = "", zw = Math.max(z0, zEnd - 3.5);
      for (var z = z0 + 0.6, row = 0; z < zEnd; z += 0.8 * (1 + (z - z0) * 0.02), row++) {
        if (w.sz((x0 + x1) / 2, z) <= 1) continue;
        for (var gx = x0 + 0.4 + (row % 2) * 0.5; gx < x1 - 0.9; gx += 1.1) { var a = w.P(gx, yAt(z), z), b = w.P(gx + 0.7, yAt(z + (row % 2 ? 0.35 : -0.35)), z + (row % 2 ? 0.35 : -0.35)); gr += "M" + n(a[0]) + " " + n(a[1]) + "L" + n(b[0]) + " " + n(b[1]); }
      }
      out += '<path class="w-rampwet" d="' + poly3(w, [[x0, yAt(zw), zw], [x1, yAt(zw), zw], [x1, yAt(zEnd), zEnd], [x0, yAt(zEnd), zEnd]]) + '"/><path class="w-groove3" d="' + gr + '"/>';
    } else {
      var st = "";
      for (k = 0; k < (TILE ? 40 : 150); k++) {
        var zz = z0 + Math.pow(r(), 1.6) * (zEnd - z0), xx = x0 - 0.6 + r() * (x1 - x0 + 1.2), c = w.P(xx, yAt(zz), zz), sz = Math.max(0.35, w.px(0.05 + r() * 0.08, xx, zz));
        st += '<ellipse class="' + (r() < 0.3 ? "w-st-l" : "w-st-d") + '" cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" rx="' + n(sz) + '" ry="' + n(sz * 0.5) + '"/>';
      }
      out += st;
    }
    var e0 = w.P(x0, w.wl, zEnd), e1 = w.P(x1, w.wl, zEnd);
    return sub + out + '<path class="w-foam" d="M' + n(e0[0]) + " " + n(e0[1]) + "L" + n(e1[0]) + " " + n(e1[1]) + '"/>';
  }

  // A rail at your feet (a seawall's, a plaza's): posts and two rails along
  // a line in plan (p.pts, or across your view at p.z from p.x0 to p.x1),
  // a gap where a ramp goes down. y: its foot; wall: the wall's face below.
  // frame "view": laid out square to the way you face (as a photo shows it),
  // not on the site's plan.
  function frameOf(w0, p) {
    if (p.frame !== "view") return w0;
    var v = {}, k;
    for (k in w0) v[k] = w0[k];
    v.st = function (X, Z) { return [X, Z]; }; v.P = w0.Pst; v.sz = function (X, Z) { return Z; };
    v.px = function (m, X, Z) { return (w0.fl * m) / Math.max(Z, 0.25); };
    return v;
  }
  function rail3d(w0, p, prims) {
    var w = frameOf(w0, p);
    var pts = p.pts || [[p.x0, p.z], [p.x1, p.z]], Y = p.y, H2 = p.h || 1.05;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), runs = [[0, L]];
      if (p.gap && i === 0 && !p.pts) runs = [[0, p.gap[0] - a[0]], [p.gap[1] - a[0], L]];
      runs.forEach(function (rn) {
        if (rn[1] <= rn[0]) return;
        var st = Math.min(6, rn[1] - rn[0]);
        for (var d0 = rn[0]; d0 < rn[1] - 0.01; d0 += st) {
          var d1 = Math.min(rn[1], d0 + st), A = [a[0] + (b[0] - a[0]) * d0 / L, a[1] + (b[1] - a[1]) * d0 / L], B = [a[0] + (b[0] - a[0]) * d1 / L, a[1] + (b[1] - a[1]) * d1 / L], sv = "";
          // nothing of it past the frame's edges (no lone end hanging in)
          var sA = w.P(A[0], Y, A[1]), sB = w.P(B[0], Y, B[1]);
          if ((sA[0] < -20 && sB[0] < -20) || (sA[0] > W + 20 && sB[0] > W + 20)) continue;
          [[H2, 0.14], [H2 * 0.55, 0.12]].forEach(function (bb) { sv += poly3(w, [[A[0], Y + bb[0], A[1]], [B[0], Y + bb[0], B[1]], [B[0], Y + bb[0] - bb[1], B[1]], [A[0], Y + bb[0] - bb[1], A[1]]]); });
          for (var d = d0; d <= d1 + 0.01; d += p.post || 2.2) { var q = [a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L]; sv += poly3(w, [[q[0] - 0.07, Y - 0.3, q[1]], [q[0] + 0.07, Y - 0.3, q[1]], [q[0] + 0.07, Y + H2 + 0.05, q[1]], [q[0] - 0.07, Y + H2 + 0.05, q[1]]]); }
          var l0 = w.P(A[0], Y + H2, A[1]), l1 = w.P(B[0], Y + H2, B[1]), md = dist((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
          prims.push([md, '<path class="w-s' + tone(md) + '" d="' + sv + '"/>' + (w.sz(A[0], A[1]) > 0.9 && w.sz(B[0], B[1]) > 0.9 ? '<path class="w-liteb" d="M' + n(l0[0]) + " " + n(l0[1]) + "L" + n(l1[0]) + " " + n(l1[1]) + '"/>' : "")]);
          if (p.wall) prims.push([md + 0.05, '<path class="w-wall" d="' + poly3(w, [[A[0], Y, A[1]], [B[0], Y, B[1]], [B[0], Y - p.wall, B[1]], [A[0], Y - p.wall, A[1]]]) + '"/>']);
        }
      });
    }
  }

  // A long wall of a building seen at a slant (pts: its foot along the
  // ground, in metres), its siding, a row of windows, the roof rising away
  // from you behind its eave, and the dark edge of the deck it stands on.
  // p: pts, y (its floor), h, rh (the roof's rise), dep (how far back the
  // ridge is), cls, roofc, win (windows every so many metres), base.
  function facade3d(w0, p, r, prims) {
    var w = frameOf(w0, p), pts = p.pts, Y0 = p.y == null ? 0 : p.y, H2 = p.h || 4, RH = p.rh == null ? 1.2 : p.rh, dep = p.dep || 4;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = uz, nz = -ux;
      var mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (dist(mx + nx, mz + nz) < dist(mx - nx, mz - nz)) { nx = -nx; nz = -nz; }
      for (var d0 = 0; d0 < L - 0.01; d0 += 6) {
        var d1 = Math.min(L, d0 + 6), A = [a[0] + ux * d0, a[1] + uz * d0], B = [a[0] + ux * d1, a[1] + uz * d1], md = dist((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
        if (w.sz(A[0], A[1]) < 1 && w.sz(B[0], B[1]) < 1) continue;
        // its long face in value steps: darker where it is nearer you, paler as it runs off
        var sv = '<path class="' + (p.cls || "w-wallw") + (md < 26 ? " w-conc2" : md < 36 ? " w-conc1" : "") + '" d="' + poly3(w, [[A[0], Y0, A[1]], [B[0], Y0, B[1]], [B[0], Y0 + H2, B[1]], [A[0], Y0 + H2, A[1]]]) + '"/>', sd = "", wn = "";
        for (var yy = Y0 + 0.5; yy < Y0 + H2 - 0.2; yy += 0.5) sd += poly3(w, [[A[0], yy, A[1]], [B[0], yy, B[1]], [B[0], yy + 0.06, B[1]], [A[0], yy + 0.06, A[1]]]);
        // (its windows: fewer, each its own width, some holding the sky)
        var wsk = "";
        if (p.win) for (var wd = d0 + 1.2 + r() * 0.8; wd < d1 - 0.6; wd += p.win * (0.9 + r() * 0.8)) { if (r() < 0.42) continue; var wl9 = 0.7 + r() * r() * 2.2, q0 = [a[0] + ux * wd, a[1] + uz * wd], q1 = [a[0] + ux * (wd + wl9), a[1] + uz * (wd + wl9)], wy = Y0 + H2 * 0.5, pq = poly3(w, [[q0[0], wy - 0.6, q0[1]], [q1[0], wy - 0.6, q1[1]], [q1[0], wy + 0.6, q1[1]], [q0[0], wy + 0.6, q0[1]]]); if (r() < 0.34) wsk += pq; else wn += pq; }
        var Ab = [A[0] + nx * dep, A[1] + nz * dep], Bb = [B[0] + nx * dep, B[1] + nz * dep];
        sv += '<path class="w-siding" d="' + sd + '"/><path class="w-eavesh" d="' + poly3(w, [[A[0], Y0 + H2 - 0.9, A[1]], [B[0], Y0 + H2 - 0.9, B[1]], [B[0], Y0 + H2, B[1]], [A[0], Y0 + H2, A[1]]]) + '"/><path class="w-wallao" d="' + poly3(w, [[A[0], Y0, A[1]], [B[0], Y0, B[1]], [B[0], Y0 + H2 * 0.35, B[1]], [A[0], Y0 + H2 * 0.35, A[1]]]) + '"/>' + (wn ? '<path class="w-win w-pane" d="' + wn + '"/>' : "") + (wsk ? '<path class="w-win w-panesky" d="' + wsk + '"/>' : "") +
          '<path class="' + (p.roofc || "w-roofg") + '" d="' + poly3(w, [[A[0] - nx * 0.4, Y0 + H2, A[1] - nz * 0.4], [B[0] - nx * 0.4, Y0 + H2, B[1] - nz * 0.4], [Bb[0], Y0 + H2 + RH, Bb[1]], [Ab[0], Y0 + H2 + RH, Ab[1]]]) + '"/>';
        var e0 = w.P(A[0] - nx * 0.4, Y0 + H2, A[1] - nz * 0.4), e1 = w.P(B[0] - nx * 0.4, Y0 + H2, B[1] - nz * 0.4);
        if (w.sz(A[0], A[1]) > 0.9 && w.sz(B[0], B[1]) > 0.9) sv += '<path class="w-liteb" d="M' + n(e0[0]) + " " + n(e0[1]) + "L" + n(e1[0]) + " " + n(e1[1]) + '"/>';
        if (p.base) sv += '<path class="w-s' + tone(md) + '" d="' + poly3(w, [[A[0], Y0, A[1]], [B[0], Y0, B[1]], [B[0], Y0 - p.base, B[1]], [A[0], Y0 - p.base, A[1]]]) + '"/>';
        prims.push([md + 0.3, sv]);
      }
    }
  }
  // Bare pilings standing in the water (pts: [X, Z] each), their tops at
  // p.top: the tide stands on them, and they stand in their own copies.
  function piles3d(w0, p, r, prims, glass) {
    var w = frameOf(w0, p);
    (p.pts || []).forEach(function (q) {
      var X = q[0], Z = q[1];
      if (w.sz(X, Z) < 1.2) return;
      var ft = w.foot(X, Z), top = w.P(X, p.top, Z), bot = w.P(X, ft, Z), pwx = Math.max(0.5, w.px(p.w || 0.36, X, Z)), d = dist(X, Z);
      if (w.wet(X, Z) && glass) glass.push(pileGlass(r, bot[0], bot[1], pwx, Math.min(40, w.px(5, X, Z))));
      var pv = pile(r, top[0], top[1], bot[1], pwx, "w-s" + tone(d), Math.max(0, Math.min((w.hw - ft) * w.fl / Math.max(0.25, w.sz(X, Z)), bot[1] - top[1] - 0.5)));
      prims.push([d, w.wclip ? '<g clip-path="url(#' + w.wclip + ')">' + pv + "</g>" : pv]);
    });
  }
  // A building: a box with a roof, its two faces toward you, windows lit
  // after dark. p: at [X, Z] (its near corner nearest you is worked out),
  // w (across), d (deep), h, roof "hip", "gable" or "flat", rh, y (its
  // floor), piles (it stands out over the water on pilings), wall, roofc
  // (classes), win: rows of windows.
  function house3d(id, w, p, r, prims, glass, t) {
    var X0 = p.at[0] - p.w / 2, X1 = p.at[0] + p.w / 2, Z0 = p.at[1] - p.d / 2, Z1 = p.at[1] + p.d / 2, Y0 = p.y == null ? 0 : p.y, Y1 = Y0 + p.h, RH = p.rh == null ? p.h * 0.4 : p.rh;
    var md = dist(p.at[0], Z0), tn = tone(md), sv = "", wallc = p.wall || "w-house", roofc = p.roofc || "w-roof";
    // the pilings under one that stands out over the water
    if (p.piles) {
      for (var px = X0 + 0.6; px <= X1; px += p.piles) {
        [Z0 + 0.4].forEach(function (pz) {
          var ft = w.foot(px, pz), top = w.P(px, Y0, pz), bot = w.P(px, ft, pz), pwx = Math.max(0.5, w.px(0.45, px, pz));
          if (w.wet(px, pz) && glass) glass.push(pileGlass(r, bot[0], bot[1], pwx, Math.min(30, w.px(4, px, pz))));
          sv += pile(r, top[0], top[1], bot[1], pwx, "w-s" + tn, Math.max(0, Math.min((w.hw - ft) * w.fl / w.sz(px, pz), bot[1] - top[1] - 0.5)));
        });
      }
      sv += '<path class="w-u' + tn + '" d="' + poly3(w, [[X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0 - 0.6, Z0], [X0, Y0 - 0.6, Z0]]) + '"/>';
    }
    var sideX = Math.abs(X0) < Math.abs(X1) ? X0 : X1, seeSide = (sideX > 0 && X0 > 0) || (sideX < 0 && X1 < 0);
    var front = [[X0, Y0, Z0], [X1, Y0, Z0], [X1, Y1, Z0], [X0, Y1, Z0]], side = [[sideX, Y0, Z0], [sideX, Y0, Z1], [sideX, Y1, Z1], [sideX, Y1, Z0]];
    sv += '<path class="' + wallc + '" d="' + poly3(w, front) + '"/>';
    // the face takes the light with value, not as a flat box: its siding,
    // the shadow under its eave, darker toward its foot
    var fsd = "";
    if (p.siding !== false) for (var yf = Y0 + 0.45; yf < Y1 - 0.2; yf += p.siding === "shingle" ? 0.32 : 0.5) fsd += poly3(w, [[X0, yf, Z0], [X1, yf, Z0], [X1, yf + 0.05, Z0], [X0, yf + 0.05, Z0]]);
    sv += '<path class="w-siding" d="' + fsd + '"/><path class="w-wallao" d="' + poly3(w, [[X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0 + p.h * 0.32, Z0], [X0, Y0 + p.h * 0.32, Z0]]) + '"/>' +
      '<path class="w-eavesh" d="' + poly3(w, [[X0, Y1 - 1, Z0], [X1, Y1 - 1, Z0], [X1, Y1, Z0], [X0, Y1, Z0]]) + '"/>';
    // p.shop: a shopfront along its ground floor (the Point Defiance
    // boathouse): tall panes and a door between, an awning over them
    if (p.shop) {
      var shp = "", shsky = "", aw = "", sc2 = w.px(1, p.at[0], Z0);
      for (var sx2 = X0 + 1.4; sx2 < X1 - 1.4; sx2 += 2.1) {
        if (Math.abs(sx2 - p.at[0] - (p.door || 0)) < 1.1) { shp += poly3(w, [[sx2 - 0.55, Y0, Z0], [sx2 + 0.55, Y0, Z0], [sx2 + 0.55, Y0 + 2.2, Z0], [sx2 - 0.55, Y0 + 2.2, Z0]]); continue; }
        var sp9 = poly3(w, [[sx2 - 0.8, Y0 + 0.7, Z0], [sx2 + 0.8, Y0 + 0.7, Z0], [sx2 + 0.8, Y0 + 2.4, Z0], [sx2 - 0.8, Y0 + 2.4, Z0]]);
        if (r() < 0.3) shsky += sp9; else shp += sp9;
      }
      aw = poly3(w, [[X0 + 0.6, Y0 + 2.7, Z0 - 1.1], [X1 - 0.6, Y0 + 2.7, Z0 - 1.1], [X1 - 0.6, Y0 + 3.3, Z0], [X0 + 0.6, Y0 + 3.3, Z0]]);
      sv += '<path class="w-shopw" d="' + shp + '"/><path class="w-panesky" d="' + shsky + '"/><path class="w-awning" d="' + aw + '"/>';
    }
    if (seeSide) {
      sv += '<path class="' + wallc + ' w-wallside" d="' + poly3(w, side) + '"/>';
      // its siding, and windows down the side you see
      var sd2 = "", sw = "", swl = "";
      for (var yy = Y0 + 0.5; yy < Y1; yy += 0.5) sd2 += poly3(w, [[sideX, yy, Math.max(Z0, 1)], [sideX, yy, Z1], [sideX, yy + 0.05, Z1], [sideX, yy + 0.05, Math.max(Z0, 1)]]);
      for (var ri2 = 0; ri2 < (p.win == null ? 1 : p.win); ri2++) {
        var wy2 = Y0 + (p.h * (ri2 + 0.45)) / ((p.win || 1) + 0.15);
        for (var wz = Math.max(Z0 + 1.5, 2); wz < Z1 - 1; wz += p.wgap || 2.6) { var pw2 = poly3(w, [[sideX, wy2 - 0.6, wz], [sideX, wy2 - 0.6, wz + 1.3], [sideX, wy2 + 0.6, wz + 1.3], [sideX, wy2 + 0.6, wz]]); sw += pw2; if (r() < 0.75) swl += pw2; }
      }
      sv += '<path class="w-siding" d="' + sd2 + '"/><path class="w-win" d="' + sw + '"/>' + (p.lit === false ? "" : '<g class="w-lampson w-window"><path class="w-poolg" d="' + swl + '"/></g>');
    }
    // the roof
    var ov = p.eave == null ? 0.5 : p.eave, rx0 = X0 - ov, rx1 = X1 + ov, rz0 = Z0 - ov, rz1 = Z1 + ov, rf = "", rs = "";
    if (p.roof === "hip") {
      var inset = Math.min(p.w, p.d) / 2, ra = [rx0 + inset, Y1 + RH, rz0 + inset], rb = [rx1 - inset, Y1 + RH, rz0 + inset];
      if (p.w < p.d) { ra = [(rx0 + rx1) / 2, Y1 + RH, rz0 + inset]; rb = [(rx0 + rx1) / 2, Y1 + RH, rz1 - inset]; }
      var rc = p.w < p.d ? rb : [rx1 - inset, Y1 + RH, rz1 - inset], rd = p.w < p.d ? ra : [rx0 + inset, Y1 + RH, rz1 - inset];
      rf = poly3(w, [[rx0, Y1, rz0], [rx1, Y1, rz0], rb, ra]);
      rs = sideX < 0 ? poly3(w, [[rx0, Y1, rz0], [rx0, Y1, rz1], rd, ra]) : poly3(w, [[rx1, Y1, rz0], [rx1, Y1, rz1], rc, rb]);
    } else if (p.roof === "gable") {
      var ry = Y1 + RH, rm = (rx0 + rx1) / 2;
      if (p.ridge === "across") { rf = poly3(w, [[rx0, Y1, rz0], [rx1, Y1, rz0], [rx1, ry, (rz0 + rz1) / 2], [rx0, ry, (rz0 + rz1) / 2]]); }
      else { rf = poly3(w, [[rx0, Y1, rz0], [rx1, Y1, rz0], [rm, ry, rz0]]); rs = poly3(w, sideX < 0 ? [[rx0, Y1, rz0], [rx0, Y1, rz1], [rm, ry, rz1], [rm, ry, rz0]] : [[rx1, Y1, rz0], [rx1, Y1, rz1], [rm, ry, rz1], [rm, ry, rz0]]); }
    } else rf = poly3(w, [[rx0, Y1, rz0], [rx1, Y1, rz0], [rx1, Y1 + 0.4, rz0], [rx0, Y1 + 0.4, rz0]]);
    sv += '<path class="' + roofc + ' w-roofside" d="' + rs + '"/><path class="' + roofc + '" d="' + rf + '"/>';
    var e0 = w.P(rx0, Y1, rz0), e1 = w.P(rx1, Y1, rz0);
    sv += '<path class="w-liteb" d="M' + n(e0[0]) + " " + n(e0[1]) + "L" + n(e1[0]) + " " + n(e1[1]) + '"/>';
    // windows: dark by day, lit after dark, a thread of each on the water
    // (never an even grid: some bays blind, each pane its own width, set a
    // little off the beat, its head in the shadow of the frame)
    var wins = "", wsky = "", wheads = "", lit = "", rows = p.win == null ? 1 : p.win, sc = w.px(1, p.at[0], Z0);
    for (var ri = 0; ri < rows; ri++) {
      var wy = p.shop ? Y1 - 1.5 : Y0 + (p.h * (ri + 0.55)) / (rows + 0.2);
      if (p.shop && ri) break;
      for (var wx = X0 + 1.2; wx < X1 - 0.8; wx += (p.wgap || 2.6) * (0.85 + r() * 0.5)) {
        if (r() < 0.3) continue;
        var q = w.P(wx + (r() - 0.5) * 0.4, wy, Z0), ww = Math.max(0.5, sc * (0.75 + r() * 0.35)), wh = Math.max(0.5, sc * 1.25);
        var pane = poly([[q[0] - ww / 2, q[1] - wh / 2], [q[0] + ww / 2, q[1] - wh / 2], [q[0] + ww / 2, q[1] + wh / 2], [q[0] - ww / 2, q[1] + wh / 2]]);
        if (r() < 0.3) wsky += pane; else wins += pane;
        wheads += poly([[q[0] - ww / 2, q[1] - wh / 2], [q[0] + ww / 2, q[1] - wh / 2], [q[0] + ww / 2, q[1] - wh * 0.18], [q[0] - ww / 2, q[1] - wh * 0.18]]);
        if (r() < 0.8) lit += pane;
      }
    }
    var glow = "", c0 = w.P(p.at[0], Y0 + p.h * 0.5, Z0);
    if (p.lit === false) lit = "";
    if (lit) glow = '<circle cx="' + n(c0[0]) + '" cy="' + n(c0[1]) + '" r="' + n(Math.min(80, sc * p.w * 0.45 + 6)) + '" fill="url(#' + id + '-lamp)"/>';
    sv += '<path class="w-win w-pane" d="' + wins + '"/><path class="w-win w-panesky" d="' + wsky + '"/><path class="w-winhead" d="' + wheads + '"/><g class="w-lampson w-window">' + glow + '<path class="w-poolg" d="' + lit + '"/></g>';
    (p.flags || []).forEach(function (fx) {
      var fz = Z0 - 2, fb = w.P(fx, Y0, fz), ft2 = w.P(fx, Y0 + 9, fz), fwd = Math.max(0.4, w.px(0.1, fx, fz)), fs = w.px(1, fx, fz);
      sv += '<path class="w-s' + tn + '" d="' + poly([[fb[0] - fwd / 2, fb[1]], [fb[0] + fwd / 2, fb[1]], [ft2[0] + fwd * 0.3, ft2[1]], [ft2[0] - fwd * 0.3, ft2[1]]]) + '"/>' +
        '<path class="w-flag" d="' + poly([[ft2[0], ft2[1] + fs * 0.2], [ft2[0] + fs * 1.5, ft2[1] + fs * 0.35 + (r() - 0.5) * fs * 0.3], [ft2[0] + fs * 1.45, ft2[1] + fs * 1.15], [ft2[0], ft2[1] + fs * 1.05]]) + '"/>';
    });
    prims.push([md, sv]);
  }

  // A big shade tree close to you, drawn limb by limb: a trunk that forks
  // low, limbs that fork again and again, each thinner and shorter, and at
  // the ends a haze of twigs (winter) or lumps of leaves (summer). Screen
  // units: x, base (its foot), h (its height). Never a ball on a stick.
  function bigTree(r, x, base, h, isBare, spread) {
    var wood = "", twig = "", leaf = "", top = base, tips = [];
    spread = spread || 1;
    function limb(x0, y0, ang, len, w, depth) {
      var bend = (r() - 0.5) * 0.35, mx = x0 + Math.cos(ang + bend) * len * 0.5, my = y0 - Math.sin(ang + bend) * len * 0.5;
      var ex = x0 + Math.cos(ang) * len, ey = y0 - Math.sin(ang) * len, w1 = w * 0.62, nx = Math.sin(ang), ny = Math.cos(ang);
      wood += poly([[x0 - nx * w / 2, y0 - ny * w / 2], [mx - nx * w * 0.42, my - ny * w * 0.42], [ex - nx * w1 / 2, ey - ny * w1 / 2], [ex + nx * w1 / 2, ey + ny * w1 / 2], [mx + nx * w * 0.42, my + ny * w * 0.42], [x0 + nx * w / 2, y0 + ny * w / 2]]);
      if (ey < top) top = ey;
      if (depth >= 4 || len < 3) {
        tips.push([ex, ey]);
        if (isBare) for (var t = 0; t < 6; t++) { var ta = ang + (r() - 0.5) * 1.6, tl = len * (0.5 + r() * 0.7); twig += poly([[ex - 0.25, ey], [ex + Math.cos(ta) * tl, ey - Math.sin(ta) * tl], [ex + 0.25, ey]]); }
        else { var lr = len * (0.9 + r() * 0.6), pts = [], m = 11; for (var i = 0; i < m; i++) { var a = (i / m) * Math.PI * 2, k = 0.7 + r() * 0.45; pts.push([ex + Math.cos(a) * lr * k, ey + Math.sin(a) * lr * k * 0.72]); } leaf += poly(pts); }
        return;
      }
      var kids = depth === 0 ? 4 : 2 + (r() < 0.45 ? 1 : 0);
      for (var c = 0; c < kids; c++) {
        var f = kids === 1 ? 0 : c / (kids - 1) - 0.5, ca = ang + f * (depth === 0 ? 1.9 * spread : 1.1) + (r() - 0.5) * 0.3;
        ca = Math.max(0.18, Math.min(Math.PI - 0.18, ca));
        limb(ex, ey, ca, len * (0.66 + r() * 0.16), w1 * (0.8 + r() * 0.2), depth + 1);
      }
    }
    var fork = base - h * (0.3 + r() * 0.08), tw = Math.max(1.2, h * 0.05);
    wood += poly([[x - tw * 0.9, base], [x - tw * 0.55, base - h * 0.06], [x - tw * 0.42, fork], [x + tw * 0.42, fork], [x + tw * 0.55, base - h * 0.06], [x + tw * 0.9, base]]);
    limb(x, fork + tw * 0.2, Math.PI / 2 + (r() - 0.5) * 0.2, (base - fork) * 0.55 + h * 0.08, tw * 0.85, 0);
    return { wood: wood, twig: twig, leaf: leaf, top: top, tips: tips };
  }
  // A bare crown seen near, massed: one body round its limbs' ends, lobed
  // where its limbs reach and close in where they do not, held up under the
  // crown (the limbs show below it), its rim broken into fine twig tips.
  function crownMass(r, tips, pad) {
    var N = 90, rad = [], cx = 0, cy = 0, i, k, it;
    tips.forEach(function (q) { cx += q[0] / tips.length; cy += q[1] / tips.length; });
    for (i = 0; i < N; i++) rad.push(0);
    tips.forEach(function (q) {
      var b = Math.round(((Math.atan2(q[1] - cy, q[0] - cx) + Math.PI) / (2 * Math.PI)) * N) % N, d = Math.hypot(q[0] - cx, q[1] - cy) + pad;
      for (k = -3; k <= 3; k++) { var j = (b + k + N) % N; rad[j] = Math.max(rad[j], d * (1 - Math.abs(k) * 0.035)); }
    });
    for (it = 0; it < N; it++) for (i = 0; i < N; i++) if (!rad[i]) { var a1 = rad[(i + N - 1) % N], a2 = rad[(i + 1) % N]; if (a1 || a2) rad[i] = (((a1 || a2) + (a2 || a1)) / 2) * 0.97; }
    // (smoothed twice over five bins, so the body swells and draws in, never in steps)
    for (it = 0; it < 2; it++) rad = rad.map(function (v, j) { return (rad[(j + N - 2) % N] + rad[(j + N - 1) % N] + v + rad[(j + 1) % N] + rad[(j + 2) % N]) / 5; });
    var pts = [];
    for (i = 0; i < N; i++) {
      var a = (i / N) * 2 * Math.PI - Math.PI, R = rad[i] * (1 - 0.42 * clamp(Math.sin(a) / 0.7, 0, 1));
      // the rim: fine twig tips standing out of it at their own lengths
      pts.push([cx + Math.cos(a) * R * (0.97 + r() * 0.03), cy + Math.sin(a) * R * (0.97 + r() * 0.03)]);
      if (Math.sin(a) < 0.15 && r() < 0.7) { var ta = a + (r() - 0.5) * 0.05, tl = 1.03 + r() * 0.1; pts.push([cx + Math.cos(ta) * R * tl, cy + Math.sin(ta) * R * tl], [cx + Math.cos(a + 0.012) * R * 0.98, cy + Math.sin(a + 0.012) * R * 0.98]); }
    }
    return poly(pts);
  }
  // Trees standing on the ground near you, placed in metres: "broad" (a
  // leafy tree, bare in winter), "fir", "cedar" (a drooping fir).
  function tree3d(w, p, bareNow, prims) {
    var r = rnd(Math.round(p.at[0] * 31 + p.at[1] * 17 + (p.h || 10))), Z = p.at[1], X = p.at[0], b = w.P(X, p.y == null ? w.E - 1.6 : p.y, Z), h = w.px(p.h || 12, X, Z), d = dist(X, Z), cls = "w-l" + (d < 30 ? 5 : d < 80 ? 4 : 3), sv;
    if (p.kind === "fir" || p.kind === "cedar") sv = '<path class="' + cls + '" d="' + conifer(r, b[0], b[1], h, { full: p.kind === "cedar" ? 0.3 : 0.22, rag: p.kind === "cedar" ? 0.85 : 0.6, step: Math.max(2.4, h / 16) }) + '"/>';
    else if (h > 60) {
      var bt = bigTree(r, b[0], b[1], h, bareNow, p.spread);
      sv = '<path class="w-rim" d="' + bt.wood + '"/><g class="' + cls + '">' + (bt.leaf ? '<path d="' + bt.leaf + '"/>' : "") + '<path class="w-twig" d="' + bt.twig + '"/><path d="' + bt.wood + '"/></g>';
      // p.lean: degrees it leans, toward the right when more than 0
      if (p.lean) sv = '<g transform="rotate(' + p.lean + " " + n(b[0]) + " " + n(b[1]) + ')">' + sv + "</g>";
    } else {
      var bl = broadleaf(r, b[0], b[1], h, { bare: bareNow, wide: p.wide || 0.36, vase: true, clear: 0.34 });
      sv = '<path class="w-rim" d="' + bl.trunk + '"/><g class="' + cls + '"><path class="' + (bareNow ? "w-haze" : "") + '" d="' + bl.crown + '"/><path d="' + bl.trunk + '"/></g>';
    }
    prims.push([d + 0.2, sv]);
  }
  // A shrub, a driftwood log, a boulder: small things on the beach.
  function shrub3d(w, p, prims) {
    var r = rnd(Math.round(p.at[0] * 13 + p.at[1] * 7)), Z = p.at[1], c = w.P(p.at[0], p.y, Z), rx = w.px(p.r, p.at[0], Z), ry = w.px(p.r * 0.75, p.at[0], Z), pts = [], i;
    for (i = 0; i < 26; i++) { var a = Math.PI + (i / 25) * Math.PI, k = 0.78 + r() * 0.3; pts.push([c[0] + Math.cos(a) * rx * k, c[1] + Math.sin(a) * ry * 1.5 * k]); }
    var tw = "";
    for (i = 0; i < 18; i++) { var tx = c[0] + (r() - 0.5) * rx * 1.6, ty = c[1] - r() * ry * 1.3; tw += poly([[tx - 0.4, ty + 1], [tx + (r() - 0.5) * 3, ty - 2 - r() * 3], [tx + 0.4, ty + 1]]); }
    // one step lighter than the darkest near things, its top lit by the sky
    var lt = [];
    for (i = 4; i < 23; i++) lt.push([pts[i][0], pts[i][1]]);
    for (i = 22; i >= 4; i--) lt.push([pts[i][0] + (c[0] - pts[i][0]) * 0.12, pts[i][1] + (c[1] - pts[i][1]) * 0.3 + ry * 0.12]);
    prims.push([dist(p.at[0], Z), '<path class="w-l4" d="' + poly(pts) + tw + '"/><path class="w-shrubt" d="' + poly(lt) + '"/><path class="w-rim" d="' + tw + '"/>']);
  }
  function log3d(w, p, prims) {
    // a bleached drift log: it swells and narrows, bends a little, its grain
    // runs along it, a split or two, and one end ragged where it broke
    var a = p.a, b = p.b, d = p.d || 0.7, r = rnd(Math.round(a[0] * 19 + a[1] * 11)), m = 9, top = [], bot = [], g1 = [], g2 = [], i;
    for (i = 0; i <= m; i++) {
      var u = i / m, X = a[0] + (b[0] - a[0]) * u, Z = a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI) * 0.25, rr = d * (0.42 + 0.14 * Math.sin(u * 5 + 1) + r() * 0.06) * (u > 0.85 ? 0.8 : 1);
      var c = w.P(X, p.y + rr, Z), lo = w.P(X, p.y, Z), hi = w.P(X, p.y + rr * 2, Z);
      top.push(hi); bot.unshift(lo); g1.push([c[0], c[1] - (c[1] - hi[1]) * 0.45]); g2.push([c[0], c[1] + (lo[1] - c[1]) * 0.25]);
    }
    // the far end weathered round; the near end a root wad, roots spread
    // like a broken fan
    var Tm = top[m], Bm = bot[0], cxE = (Tm[0] + Bm[0]) / 2, cyE = (Tm[1] + Bm[1]) / 2, rE = Math.max(0.8, Math.hypot(Tm[0] - Bm[0], Tm[1] - Bm[1]) / 2), capE = [];
    for (i = 1; i < 8; i++) { var an = -Math.PI / 2 + (i / 8) * Math.PI; capE.push([cxE + Math.cos(an) * rE * 0.55 * (Tm[0] > top[0][0] ? 1 : -1), cyE + Math.sin(an) * rE]); }
    var body = poly(top.concat(capE, bot));
    var A0 = top[0], B0 = bot[bot.length - 1], wc = [(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2], wr = Math.max(1.4, Math.hypot(A0[0] - B0[0], A0[1] - B0[1])) * 1.25, dirX = top[0][0] < top[m][0] ? -1 : 1, roots = "", disk = [];
    for (i = 0; i < 12; i++) { var an2 = (i / 12) * Math.PI * 2, k2 = 0.75 + r() * 0.4; disk.push([wc[0] + Math.cos(an2) * wr * 0.38 * k2, wc[1] + Math.sin(an2) * wr * 0.62 * k2]); }
    for (i = 0; i < 9; i++) { var ra = -Math.PI * 0.95 + (i / 8) * Math.PI * 1.9 + (r() - 0.5) * 0.3, rl = wr * (0.7 + r() * 0.8), rw = Math.max(0.35, wr * 0.07); roots += poly([[wc[0] + Math.sin(ra) * rw, wc[1] - Math.cos(ra) * rw], [wc[0] + dirX * Math.abs(Math.cos(ra)) * rl * 0.55 + Math.cos(ra) * 0.2, wc[1] + Math.sin(ra) * rl * 0.7], [wc[0] - Math.sin(ra) * rw, wc[1] + Math.cos(ra) * rw]]); }
    var sh = poly([bot[0], bot[bot.length - 1], [bot[bot.length - 1][0] + 3, bot[bot.length - 1][1] + 2.5], [bot[0][0] + 5, bot[0][1] + 2]]);
    var sv = '<path class="w-cob-sh" d="' + sh + '"/><path class="w-driftr" d="' + roots + '"/><path class="w-drift" d="' + body + poly(disk) + '"/><path class="w-driftg" d="' + line(g1.slice(1, 7)) + line(g2.slice(3, 9)) + '"/>' +
      '<path class="w-driftl" d="' + line(top.slice(1, m)) + '"/><path class="w-driftend" d="' + poly(disk.map(function (q) { return [wc[0] + (q[0] - wc[0]) * 0.55, wc[1] + (q[1] - wc[1]) * 0.55]; })) + '"/>';
    prims.push([(dist(a[0], a[1]) + dist(b[0], b[1])) / 2, sv]);
  }
  // A sit-on-top kayak pulled up on the sand at today's water's edge, its
  // paddle across it (the stand Coach launches from).
  // A sit-on-top kayak pulled up on the sand at today's water's edge (the
  // stand Coach launches from), modelled with value: the lit deck, the dark
  // hull side under it, bow and stern rising, a dark seat well, the paddle
  // lying across with its two blades, a tight shadow joined to the hull, and
  // the drag mark it left coming down the beach. Its colour is no one's: a
  // plain hull (nobody has said what colour his is).
  function kayak3d(w, p, prims, gid) {
    var z = p.z || Math.max(6, (w.edgeZ || 8) - 2.2), y = w.foot(p.x, z) + 0.02, L = 3.9, a = p.angle || 0.35, ca = Math.cos(a), sa = Math.sin(a), x0 = p.x, i;
    function q(u, v, hgt) { return [x0 + u * sa + v * ca, y + hgt, z + u * ca - v * sa]; }
    // the outline in plan: u along it (bow at +), v across; the sheer rises at both ends
    var m = 14, outer = [], deckL = [], deckR = [];
    for (i = 0; i <= m; i++) {
      var u = -L / 2 + (L * i) / m, k = 1 - Math.pow(Math.abs(u) / (L / 2), 2.2), hw = 0.39 * Math.sqrt(Math.max(0, k)), rise = 0.3 + 0.16 * Math.pow(Math.abs(u) / (L / 2), 3);
      outer.push([u, hw, rise]);
      deckL.push(q(u, -hw * 0.92, rise + 0.02)); deckR.unshift(q(u, hw * 0.92, rise + 0.02));
    }
    // the hull side you see: the near gunwale down to the sand
    var sA = q(0, -0.4, 0), sB = q(0, 0.4, 0), sgn = w.sz(sA[0], sA[2]) < w.sz(sB[0], sB[2]) ? -1 : 1;
    var side = [];
    outer.forEach(function (o2) { side.push(q(o2[0], sgn * o2[1], o2[2])); });
    outer.slice().reverse().forEach(function (o2) { side.push(q(o2[0], sgn * o2[1] * 0.55, 0.03)); });
    var deck = deckL.concat(deckR);
    var seat = [], foot = [];
    for (i = 0; i < 10; i++) { var an = (i / 10) * Math.PI * 2; seat.push(q(-0.25 + Math.cos(an) * 0.42, Math.sin(an) * 0.2, 0.3)); foot.push(q(0.75 + Math.cos(an) * 0.3, Math.sin(an) * 0.15, 0.31)); }
    // the paddle across the deck, its blades
    var shaft = [q(-0.02, -1.15, 0.36), q(0.04, -1.15, 0.36), q(0.04, 1.15, 0.36), q(-0.02, 1.15, 0.36)], blades = [];
    [-1, 1].forEach(function (s) { var bl = []; for (i = 0; i < 9; i++) { var an2 = (i / 9) * Math.PI * 2; bl.push(q(0.01 + Math.cos(an2) * 0.1, s * (1.15 + 0.22) + Math.sin(an2) * 0.24, 0.37)); } blades.push(bl); });
    // a tight contact shadow, then a softer one off toward the light's far side
    var sh = [], sh2 = [];
    outer.forEach(function (o2) { sh.push(q(o2[0], o2[1] * 1.12 + 0.04, 0)); }); outer.slice().reverse().forEach(function (o2) { sh.push(q(o2[0], -o2[1] * 1.12 + 0.04, 0)); });
    outer.forEach(function (o2) { sh2.push(q(o2[0] - 0.15, o2[1] * 1.5 + 0.35, 0)); }); outer.slice().reverse().forEach(function (o2) { sh2.push(q(o2[0] - 0.15, -o2[1] * 0.6 + 0.2, 0)); });
    // the drag mark: a shallow groove from the stern back up the beach toward you
    var drag = "", dz = w.wet(x0, z) ? 0 : 1;
    if (dz) [-0.18, 0.18].forEach(function (v) { var A = q(-L / 2 - 0.2, v, 0), B = q(-L / 2 - 9, v * 1.4, 0); var a2 = w.P(A[0], w.foot(A[0], A[2]) + 0.005, A[2]), b2 = w.P(B[0], w.foot(B[0], B[2]) + 0.005, B[2]); drag += "M" + n(a2[0]) + " " + n(a2[1]) + "L" + n(b2[0]) + " " + n(b2[1]); });
    // after dark its white light (a paddle craft carries one between sunset
    // and sunrise), clipped at the stern: its glow, and its light on the sand
    // or the water round the boat
    var lp = q(-L / 2 + 0.35, 0, 0.62), lpP = w.P(lp[0], lp[1], lp[2]), lps = w.px(1, lp[0], lp[2]), lf = q(-L / 2 + 0.35, 0, 0), lfP = w.P(lf[0], lf[1], lf[2]);
    var klight = gid ? '<g class="w-lampson w-ownlamp"><ellipse class="w-pool" cx="' + n(lfP[0]) + '" cy="' + n(lfP[1] + lps * 0.2) + '" rx="' + n(lps * 4.4) + '" ry="' + n(lps * 1.1) + '" fill="url(#' + gid + '-lamp)"/>' +
      '<circle cx="' + n(lpP[0]) + '" cy="' + n(lpP[1]) + '" r="' + n(lps * 1.6 + 3) + '" fill="url(#' + gid + '-lamp)"/><circle class="w-lantern" cx="' + n(lpP[0]) + '" cy="' + n(lpP[1]) + '" r="' + n(Math.max(0.7, lps * 0.09)) + '"/></g>' : "";
    prims.push([dist(x0, z) - 0.1, klight]);
    prims.push([dist(x0, z), (drag ? '<path class="w-drag" d="' + drag + '"/>' : "") + '<path class="w-kshadow2" d="' + poly3(w, sh2) + '"/><path class="w-kshadow" d="' + poly3(w, sh) + '"/>' +
      '<path class="w-kayaks" d="' + poly3(w, side) + '"/><path class="w-kayak" d="' + poly3(w, deck) + '"/><path class="w-kayakw" d="' + poly3(w, seat) + poly3(w, foot) + '"/>' +
      '<path class="w-liteb" d="' + line(deckL.map(function (pt) { return w.P(pt[0], pt[1], pt[2]); })) + '"/>' +
      '<path class="w-kpaddle" d="' + poly3(w, shaft) + poly3(w, blades[0]) + poly3(w, blades[1]) + '"/>' +
      // after dark its own white light catches it: the deck's edge, the
      // cockpit's rim and the paddle lit in the lamp's colour
      '<g class="w-lampson"><path class="w-klit" d="' + line(deckL.map(function (pt) { return w.P(pt[0], pt[1], pt[2]); })) + line(deckR.map(function (pt) { return w.P(pt[0], pt[1], pt[2]); })) + '"/>' +
      '<path class="w-klit" d="' + line(seat.concat([seat[0]]).map(function (pt) { return w.P(pt[0], pt[1], pt[2]); })) + '"/><path class="w-klitp" d="' + poly3(w, shaft) + poly3(w, blades[0]) + poly3(w, blades[1]) + '"/></g>']);
  }
  // Someone fishing it (a part placed in metres): at x, as near the water
  // as today's tide lets them (z.edge metres short of its edge, between
  // z.min and z.max), or at a fixed z. By the water they cast, the line out
  // to it; far from it (a low tide's flats) they walk out with the rod up,
  // their footprints back toward you. Gone after dark where the card's
  // beach closes at dusk (w-dayonly).
  function angler3d(w, p, prims) {
    var X = p.x, Z = typeof p.z === "object" ? clamp((w.edgeZ == null ? 30 : w.edgeZ) - (p.z.edge || 0), p.z.min || 8, p.z.max || 60) : p.z;
    var bed = w.bed(X, Z), wade = w.wet(X, Z), Y = wade ? w.wl : w.foot(X, Z), f = w.P(X, Y, Z), s = w.px(1.75, X, Z) / 15.5, dir = p.dir || 1;
    var near = w.edgeZ != null && w.edgeZ - Z < 7, wy = w.P(X, w.wl, (w.edgeZ || Z) + 4)[1];
    var bf = bankFigure(f[0], f[1] + (wade ? s * 3.2 : 0), s, dir, near ? { ang: 1.05, len: 28, wy: wy, out: 40 } : { ang: 1.38, len: 24, wy: f[1] - s * 2, out: 2 });
    // on the wet flat (below the highest water: the tide wets it twice a
    // day) or in the water, his copy lies under him, squashed and faint
    var refl = p.refl && (wade || w.bed(X, Z) < w.hw) ? '<path class="w-figrefl" transform="matrix(1 0 0 -0.55 0 ' + n(f[1] * 1.55) + ')" d="' + bf.fig + '"/>' : "";
    var out = refl + '<path class="w-kshadow" d="' + poly([[f[0] - s * 3.4, f[1] + s * 0.2], [f[0] + s * 4.6, f[1] - s * 0.3], [f[0] + s * 5.2, f[1] + s * 0.7], [f[0] - s * 3, f[1] + s * 1.1]]) + '"/>' +
      '<path class="w-figh" d="' + bf.fig + bf.rod + '"/>' + (near ? '<path class="w-line" d="' + bf.line + '"/>' : "");
    if (wade) out += '<path class="w-wade" d="' + poly([[f[0] - s * 3.6, f[1]], [f[0] + s * 3.6, f[1]], [f[0] + s * 3.8, f[1] + s * 3.6], [f[0] - s * 3.8, f[1] + s * 3.6]]) + '"/><path class="w-foam" d="M' + n(f[0] - s * 4) + " " + n(f[1] + 0.3) + "q" + n(s * 4) + " " + n(s) + " " + n(s * 8) + ' 0"/>';
    // footprints back toward you on the wet sand, a pair at a time
    if (!wade && p.prints !== false) {
      var pr = "";
      for (var k = 1; k < 9; k++) {
        var zk = Z - k * 0.75, xk = X + (k % 2 ? 0.16 : -0.16) - k * 0.05 * dir;
        if (zk < 2 || !w.wet(xk, zk) && w.bed(xk, zk) > w.wl + 1.2) break;
        var c = w.P(xk, w.foot(xk, zk) + 0.002, zk), fw = w.px(0.13, xk, zk), fh = w.px(0.3, xk, zk) * 0.18;
        pr += '<ellipse cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" rx="' + n(fw) + '" ry="' + n(Math.max(0.3, fh)) + '"/>';
      }
      out = '<g class="w-prints">' + pr + "</g>" + out;
    }
    prims.push([dist(X, Z), '<g class="w-dayonly">' + out + "</g>"]);
  }
  // Rocks placed in metres: a breakwater, riprap at the water's edge,
  // boulders on a beach. pts: [X, Z, size] along the heap; y: its foot (the
  // water today when not given).
  function rocks3d(w, p, sd, prims) {
    var pts = p.pts.map(function (q) { var y = p.y != null ? p.y : w.foot(q[0], q[1]), c = w.P(q[0], y, q[1]); return [c[0], c[1], w.px(q[2], q[0], q[1])]; });
    var d = p.pts.reduce(function (s, q) { return s + dist(q[0], q[1]); }, 0) / p.pts.length;
    var rk = rocks(sd, pts, { tall: p.tall || 1, wet: p.dry ? 0 : clamp(1 - w.wl / w.rng, 0, 1.3) * (p.wet || 4), cls: p.cls || (d > 60 ? "w-farrock" : d > 25 ? "w-midrock" : ""), angular: p.angular, ragged: p.reflect || p.ragged });
    // on calm water a breakwater stands in its own reflection
    // (never a clean mirror: squashed, a little off, broken by the ripples
    // into pieces)
    if (p.reflect) {
      var yw = w.P(p.pts[0][0], w.wl, p.pts[0][1])[1], mk = "rkm" + sd, mr = rnd(sd + 3), gp = "";
      for (var gk = 0; gk < 30; gk++) gp += '<path d="M' + n(mr() * W - 40) + " " + n(yw + 1 + gk * (0.6 + gk * 0.05) + mr()) + "h" + n(30 + mr() * 160) + '" stroke-width="' + n(0.5 + mr() * (0.4 + gk * 0.04)) + '"/>';
      prims.push([(p.depth != null ? p.depth : d) + 0.5, '<mask id="' + mk + '" maskUnits="userSpaceOnUse" x="-10" y="0" width="' + (W + 20) + '" height="' + H + '"><rect x="-10" width="' + (W + 20) + '" height="' + H + '" fill="#fff"/><g stroke="#000" stroke-linecap="round">' + gp + '</g></mask>' +
        '<g mask="url(#' + mk + ')"><g class="w-rockrf" opacity="' + n(0.18 + (1 - (w.wind == null ? 0.3 : w.wind)) * 0.24) + '" transform="translate(1.5 ' + n(yw * 1.56 + 1.2) + ') scale(1 -.56)">' + rk + "</g></g>"]);
    }
    prims.push([p.depth != null ? p.depth : d, rk]);
  }
  // Ground you could walk on, in plan: a lawn, a path, a beach, gravel.
  //   tufts: grass along its far edge; shade: [[X, Z, r]] tree shadows on it;
  //   edges: a lit line along its near and far sides (a path's kerbs)
  function ground3d(w0, p, sd, t) {
    var w = frameOf(w0, p);
    var y = p.y == null ? w.E - 1.6 : p.y, pts3 = p.pts.map(function (q) { return [q[0], q[2] == null ? y : q[2], q[1]]; }), out = '<path class="' + (p.cls || "w-lawn") + '" d="' + poly3(w, pts3) + '"/>';
    var r = rnd(sd || 7), yAt = function (zz) { var a = pts3[0], b = pts3[3]; return a[2] === b[2] ? a[1] : a[1] + ((b[1] - a[1]) * (zz - a[2])) / (b[2] - a[2]); };
    // a near lawn darkens toward you: the layer at your feet is the darkest
    if (p.near) {
      var zs = pts3.map(function (q) { return q[2]; }), zn = Math.min.apply(null, zs), zf = zn + (Math.max.apply(null, zs) - zn) * p.near;
      var below = function (zc) {
        var o2 = [], i2;
        for (i2 = 0; i2 < pts3.length; i2++) {
          var a2 = pts3[i2], b2 = pts3[(i2 + 1) % pts3.length], ia = a2[2] <= zc, ib = b2[2] <= zc;
          if (ia) o2.push(a2);
          if (ia !== ib) { var f2 = (zc - a2[2]) / (b2[2] - a2[2]); o2.push([a2[0] + (b2[0] - a2[0]) * f2, a2[1] + (b2[1] - a2[1]) * f2, zc]); }
        }
        return o2.length > 2 ? poly3(w, o2) : "";
      };
      out += '<path class="w-lawnd" d="' + below(zf) + '"/><path class="w-lawnd" d="' + below(zn + (zf - zn) * 0.45) + '"/>';
    }
    // a tree's shade: ragged and dappled, a few bright holes where the sun
    // gets through the crown
    (p.shade || []).forEach(function (sh) {
      var c = [], i, nz = noise(Math.round(sh[0] * 7 + sh[1] * 3));
      for (i = 0; i < 28; i++) { var an = (i / 28) * Math.PI * 2, k = 0.7 + nz(i * 0.9) * 0.6; c.push([sh[0] + Math.cos(an) * sh[2] * 1.4 * k, yAt(sh[1]) + 0.01, sh[1] + Math.sin(an) * sh[2] * 0.85 * k]); }
      out += '<path class="w-lawnsh' + (t && bare(t.date) ? " w-lawnshb" : "") + '" d="' + poly3(w, c) + '"/>';
      var holes = "";
      for (i = 0; i < 9; i++) {
        var hx2 = sh[0] + (r() - 0.5) * sh[2] * 2, hz2 = sh[1] + (r() - 0.5) * sh[2] * 1.2, hr = 0.2 + r() * 0.45, hp = [];
        for (var j = 0; j < 8; j++) { var a2 = (j / 8) * Math.PI * 2; hp.push([hx2 + Math.cos(a2) * hr * 1.4, yAt(hz2) + 0.02, hz2 + Math.sin(a2) * hr * 0.7]); }
        holes += poly3(w, hp);
      }
      out += '<path class="w-lawndap" d="' + holes + '"/>';
    });
    // p.joints: a concrete walk's cut joints across it every so many metres
    if (p.joints) {
      var zs9 = pts3.map(function (q) { return q[2]; }), xs9 = pts3.map(function (q) { return q[0]; }), jd = "";
      for (var zj = Math.ceil(Math.min.apply(null, zs9) / p.joints) * p.joints; zj < Math.max.apply(null, zs9); zj += p.joints) {
        var hits = [];
        for (var i9 = 0; i9 < pts3.length; i9++) { var a9 = pts3[i9], b9 = pts3[(i9 + 1) % pts3.length]; if ((a9[2] <= zj) !== (b9[2] <= zj)) { var f9 = (zj - a9[2]) / (b9[2] - a9[2]); hits.push([a9[0] + (b9[0] - a9[0]) * f9, a9[1] + (b9[1] - a9[1]) * f9]); } }
        hits.sort(function (u, v) { return u[0] - v[0]; });
        for (var h9 = 0; h9 + 1 < hits.length; h9 += 2) { var JA = w.P(hits[h9][0], hits[h9][1] + 0.005, zj), JB = w.P(hits[h9 + 1][0], hits[h9 + 1][1] + 0.005, zj); jd += "M" + n(JA[0]) + " " + n(JA[1]) + "L" + n(JB[0]) + " " + n(JB[1]); }
      }
      out += '<path class="w-joint" d="' + jd + '"/>';
    }
    if (p.edges) [pts3[0], pts3[3]].forEach(function (a, i) { var b = pts3[i ? 2 : 1], A = w.P(a[0], a[1], a[2]), B = w.P(b[0], b[1], b[2]); out += '<path class="w-liteb" d="M' + n(A[0]) + " " + n(A[1]) + "L" + n(B[0]) + " " + n(B[1]) + '"/>'; });
    if (p.tufts) {
      // grass in clumps of different heights along the far edge, not a comb
      var d = "", d2 = "", far = pts3[2], far2 = pts3[3];
      for (var k = 0; k < (TILE ? 14 : 46); k++) {
        var u = r(), zz = far[2] - r() * r() * p.tufts, xx = far2[0] + (far[0] - far2[0]) * u, Q = w.P(xx, yAt(zz), zz);
        if (Q[0] < -5 || Q[0] > W + 5 || w.sz(xx, zz) < 1) continue;
        var big = 0.5 + r() * r() * 2.2, nb = 4 + Math.floor(r() * 7);
        for (var b = 0; b < nb; b++) {
          var bx = Q[0] + (r() - 0.5) * w.px(0.5 * big, xx, zz), hh = w.px((0.1 + r() * 0.3) * big, xx, zz), lean = (r() - 0.45) * hh * 0.8, bw = Math.max(0.35, w.px(0.025, xx, zz));
          var blade = "M" + n(bx - bw) + " " + n(Q[1]) + "Q" + n(bx + lean * 0.3) + " " + n(Q[1] - hh * 0.6) + " " + n(bx + lean) + " " + n(Q[1] - hh) + "Q" + n(bx + lean * 0.3 + bw) + " " + n(Q[1] - hh * 0.5) + " " + n(bx + bw) + " " + n(Q[1]) + "Z";
          if (b % 3) d += blade; else d2 += blade;
        }
      }
      out += '<path class="w-tuft2" d="' + d2 + '"/><path class="w-tuft" d="' + d + '"/>';
    }
    return out;
  }
  // A row of trees along a line in plan, the land under them, each tree its
  // own height: "fir", "mixed" (no card names the kinds) or "broad".
  function woods3d(w, p, isBare, prims, sd) {
    var r = rnd(sd), a = p.a, b = p.b, L = Math.hypot(b[0] - a[0], b[1] - a[1]), y = p.y == null ? w.foot(a[0], a[1]) + 0.5 : p.y, gap = p.gap || 3.2;
    var ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, back = p.back || 30;
    var land = poly3(w, [[a[0], y, a[1]], [b[0], y, b[1]], [b[0] + uz * back, y, b[1] - ux * back], [a[0] + uz * back, y, a[1] - ux * back]]);
    if (p.land !== false) prims.push([(dist(a[0], a[1]) + dist(b[0], b[1])) / 2 + 0.5, '<path class="w-l5" d="' + land + '"/>']);
    for (var d = 0; d < L; d += gap * (0.6 + r() * 0.8)) {
      var X = a[0] + ux * d + (r() - 0.5) * gap, Z = a[1] + uz * d + (r() - 0.5) * gap * 2;
      if (w.sz(X, Z) < 2) continue;
      var h = (p.h || 24) * (0.65 + r() * 0.55), base = w.P(X, y, Z), hp = w.px(h, X, Z), dd = dist(X, Z), cls = "w-l" + (dd < 40 ? 5 : dd < 120 ? 4 : 3), fir = p.kind === "fir" || (p.kind !== "broad" && r() < (p.mix == null ? 0.4 : p.mix));
      var sv = fir ? '<path class="' + cls + '" d="' + conifer(r, base[0], base[1], hp, { full: 0.17 + r() * 0.08, rag: 0.65 }) + '"/>' :
        (function () { var bl = broadleaf(r, base[0], base[1], hp, { bare: isBare, vase: p.kind === "cottonwood" }); return '<g class="' + cls + '"><path class="' + (isBare ? "w-haze" : "") + '" d="' + bl.crown + '"/><path d="' + bl.trunk + '"/></g>'; })();
      prims.push([dd, sv]);
    }
  }
  // Paint the world parts of a spot: the ground first, then every standing
  // thing from far to near, with the piles' copies in the water under all.
  // How far off a patch of ground ends: its far edge's nearest point. Things
  // beyond it are painted first, so the lawn in front hides their feet.
  function groundDepth(w0, p) {
    var w = frameOf(w0, p);
    var q = p.pts.map(function (a) { return w.st(a[0], a[1]); }), zmax = -1e9, best = 1e9, i;
    q.forEach(function (a) { if (a[1] > zmax) zmax = a[1]; });
    for (i = 0; i < q.length; i++) {
      var a = q[i], b = q[(i + 1) % q.length];
      if (Math.max(a[1], b[1]) < zmax - 0.6) continue;
      var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? clamp(-(a[0] * dx + a[1] * dz) / L2, 0, 1) : 0;
      best = Math.min(best, dist(a[0] + dx * u, a[1] + dz * u));
    }
    return best;
  }
  function worldParts(id, w, o, t, r, sd) {
    var prims = [], glass = [], grounds = "", lamps = 0, isBare = bare(t.date);
    w.glass = glass;
    (o.parts || []).forEach(function (q) {
      if (q.t === "ground" && q.solid !== false && q.frame !== "view") {
        var ys = q.pts.map(function (a) { return a[2] == null ? (q.y == null ? w.E - 1.6 : q.y) : a[2]; });
        w.floors.push({ pts: q.pts, y: ys.reduce(function (s, v) { return s + v; }, 0) / ys.length });
      }
    });
    // o.waterEdge { pts: [[X, Z], [X, Z]], y }: the edge of the walk you
    // stand on, out over the water: what stands in the water beyond it (its
    // pilings, a lamp's light on the water) is cut at that edge, so none of
    // it lies on the paving in front of you
    w.wclip = null;
    if (o.waterEdge) {
      var we = o.waterEdge, ea = w.P(we.pts[0][0], we.y, we.pts[0][1]), eb = w.P(we.pts[1][0], we.y, we.pts[1][1]), sl9 = (eb[1] - ea[1]) / ((eb[0] - ea[0]) || 1e-6);
      var yAt = function (x) { return ea[1] + (x - ea[0]) * sl9; };
      w.wclip = id + "-wc";
      prims.push([1e9, '<clipPath id="' + w.wclip + '"><path d="' + poly([[-60, -20], [W + 60, -20], [W + 60, yAt(W + 60)], [-60, yAt(-60)]]) + '"/></clipPath>']);
    }
    (o.parts || []).forEach(function (q, k) {
      if (q.t === "pier") lamps += pier3d(id, w, q, t, r, prims, glass);
      else if (q.t === "float") float3d(id, w, q, t, r, prims, glass);
      else if (q.t === "ramp") grounds += ramp3d(w, q, r);
      else if (q.t === "rail") rail3d(w, q, prims);
      else if (q.t === "house") house3d(id, w, q, r, prims, glass, t);
      else if (q.t === "tree") tree3d(w, q, isBare, prims);
      else if (q.t === "shrub") shrub3d(w, q, prims);
      else if (q.t === "log") log3d(w, q, prims);
      else if (q.t === "rocks") rocks3d(w, q, sd + 400 + k, prims);
      else if (q.t === "ground") prims.push([q.depth != null ? q.depth : groundDepth(w, q) + 0.05, ground3d(w, q, sd + 600 + k, t)]);
      else if (q.t === "woods") woods3d(w, q, isBare, prims, sd + 500 + k);
      else if (q.t === "lamp") lampPost(id, w, q, prims);
      else if (q.t === "facade") facade3d(w, q, r, prims);
      else if (q.t === "piles") piles3d(w, q, r, prims, glass);
      else if (q.t === "kayak") kayak3d(w, q, prims, id);
      else if (q.t === "angler") angler3d(w, q, prims);
    });
    prims.sort(function (a, b) { return b[0] - a[0]; });
    return { glass: glass.join(""), ground: grounds, things: prims.map(function (q) { return q[1]; }).join("") };
  }

  // ---- parts: the bank ---------------------------------------------------------------
  // A Sound beach from the shore: the tide's edge (yW, high in the picture
  // at low water, close at high water), the wet flat below it shining with
  // the sky, ripple marks and a pool or two the tide left, then dry sand.
  // yD (optional): where the dry beach starts, for a beach placed in metres.
  // yV (optional): the bottom of what shows (a flat that runs on under the
  // cards keeps its detail where it can be seen: ripple rows, pools, sheen).
  function flats(id, seed, yW, low, yD0, yV) {
    var r = rnd(seed), nz = noise(seed + 3), x, k, edge = [], dry = [];
    for (x = -6; x <= W + 6; x += 8) edge.push([x, yW + (nz(x * 0.014) - 0.5) * 7 + (nz(x * 0.08 + 4) - 0.5) * 2]);
    var yD = yD0 != null ? clamp(yD0, yW + 5, H + 12) : yW + 20 + low * 22;
    if (yV != null && yD > yV) yD = Math.max(yW + 5, yV);
    for (x = W + 6; x >= -6; x -= 12) dry.push([x, yD + (nz(x * 0.01 + 20) - 0.5) * 10]);
    var wet = poly(edge.map(function (q) { return [q[0], q[1] - 0.6]; }).concat(dry));
    var sheen = "", rip = "", pools = "";
    for (k = 0; k < (yV != null ? 22 : 40 + low * 30); k++) {
      var wy = yW + 3 + (yV != null ? Math.pow(r(), 1.8) * 0.3 : r()) * (yD - yW), wx = r() * W, wl = 5 + r() * 22;
      sheen += '<path d="M' + n(wx) + " " + n(wy) + "h" + n(wl) + '" stroke-width="' + n(0.4 + r() * 0.7) + '" opacity="' + n(0.2 + r() * 0.55) + '"/>';
    }
    // yV, a long flat at low water: the film of water left on it holds the
    // sky in broad patches, each a cluster of pale level glints, thin and
    // crowded far off, longer and fewer toward you (the way the approved
    // pictures show water: glints and value, never a drawn stroke)
    var film = "";
    if (yV != null) {
      var fr9 = rnd(seed + 17);
      for (k = 0; k < (TILE ? 4 : 9); k++) {
        var fu = Math.pow(fr9(), 0.9), fcy = yW + 4 + fu * (Math.min(yD, H) - yW - 4), fcx = fr9() * W, fsp = 14 + fu * 46, fn = TILE ? 5 : 9 + Math.round(fr9() * 8);
        for (var fj = 0; fj < fn; fj++) {
          var fy = fcy + gauss(fr9) * (1.5 + fu * 5), fl = (3 + fu * 22) * (0.4 + fr9() * 0.8), fx = fcx + gauss(fr9) * fsp - fl / 2;
          film += '<path d="M' + n(fx) + " " + n(fy) + "h" + n(fl) + '" stroke-width="' + n(0.4 + fu * 1.1) + '" opacity="' + n(0.25 + fr9() * 0.6) + '"/>';
        }
      }
    }
    var ripl = "";
    for (k = 0; k < (TILE ? 50 : 150) * (0.4 + low) * (yV != null ? 0.25 : 1); k++) {
      var ry = yW + 6 + Math.pow(r(), 0.8) * (yD - yW - 4), rx = r() * W, rl = 2.4 + (ry - yW) * 0.2 * (0.6 + r());
      rip += poly([[rx, ry], [rx + rl * 0.5, ry - 0.35 - (ry - yW) * 0.008], [rx + rl, ry], [rx + rl * 0.5, ry + 0.25]]);
      // each ripple's lit crest just behind its shadow
      ripl += poly([[rx + rl * 0.1, ry - 0.5], [rx + rl * 0.5, ry - 0.9 - (ry - yW) * 0.01], [rx + rl * 0.9, ry - 0.5], [rx + rl * 0.5, ry - 0.6]]);
    }
    // the middle of the flat holds water a little longer: a darker band,
    // and runnels draining it back toward the tide in long wandering lines
    var mid9 = [], runs = "";
    for (x = W + 6; x >= -6; x -= 12) mid9.push([x, yW + (yD - yW) * 0.3 + (nz(x * 0.02 + 40) - 0.5) * 9]);
    var flatDk = poly(edge.map(function (q) { return [q[0], q[1] + 2]; }).concat(mid9));
    for (k = 0; k < 2 + Math.round(low * 2); k++) {
      var rx0 = 30 + r() * (W - 60), rr9 = [], ry0 = yD - 4, len9 = (yD - yW) * (0.5 + r() * 0.4);
      for (var q9 = 0; q9 <= 8; q9++) { var vv = q9 / 8; rr9.push([rx0 + (yV != null ? Math.sin(vv * 2.6 + k * 2.3) * 34 + Math.sin(vv * 7 + k) * 6 : Math.sin(vv * 4 + k * 2) * 22) * (1 - vv * 0.7) + (r() - 0.5) * 4, ry0 - vv * len9]); }
      var rw = 2.4 + (yD - yW) * (yV != null ? 0.06 : 0.03);
      // (each side of it tapers toward the tide: wide where it starts near
      // you, narrow where it reaches the water; on a long flat a soft
      // trough of darker wet sand, never a drawn line)
      var wd9 = function (i9) { return rw * (yV != null ? 0.3 + 0.7 * (1 - i9 / 8) : 1 - i9 / 9); };
      runs += poly(rr9.map(function (q, i9) { return [q[0] - wd9(i9), q[1]]; }).concat(rr9.slice().reverse().map(function (q, i9) { return [q[0] + wd9(8 - i9), q[1]]; })));
    }
    for (k = 0; k < Math.round(low * 4); k++) {
      var py = yW + 10 + r() * (yD - yW - 12), px = r() * W, pw = 14 + r() * 40 * (0.6 + (py - yW) / 50);
      pools += '<ellipse cx="' + n(px) + '" cy="' + n(py) + '" rx="' + n(pw) + '" ry="' + n(1.2 + (py - yW) * 0.05) + '"/>';
    }
    // the last high tide's line of weed and shell along the top of the flat
    var wrack = "";
    for (k = 0; k < (TILE ? 30 : 110); k++) { var wx2 = r() * W, wy3 = yD - 2 + (nz(wx2 * 0.01 + 20) - 0.5) * 10 + (r() - 0.5) * 3, wz = 0.4 + r() * r() * 1.6 * (0.5 + (wy3 - yW) / 50); wrack += '<ellipse cx="' + n(wx2) + '" cy="' + n(wy3) + '" rx="' + n(wz * 1.6) + '" ry="' + n(wz * 0.45) + '"/>'; }
    var lace = line(edge.map(function (q) { return [q[0] + 2, q[1] + 1.8]; }));
    // the sand at your feet goes darker toward you, band by band, so the
    // near layer is the dark one (never a blank pale field in front)
    var nearS = "", top9 = Math.max(yD, yW + 8);
    for (k = 0; k < 4; k++) {
      var yb = top9 + (H - top9) * (0.15 + k * 0.22), nb = [];
      for (x = -6; x <= W + 6; x += 14) nb.push([x, yb + (nz(x * 0.017 + k * 7) - 0.5) * 8]);
      nearS += '<path class="w-sandnear" d="' + line(nb) + "L" + (W + 6) + " " + (H + 6) + "L-6 " + (H + 6) + 'Z"/>';
    }
    // yV: a flat that runs on past the picture: its sand ripples in rows
    // across it, wider apart toward you, each a dark trough and a lit crest,
    // and the wet sand darkening toward you
    var rows9 = "", rowsl = "", dk9 = "", pn9 = "";
    if (yV != null) {
      // each row its own depth: faint, thin and close by the water, bolder
      // and wider apart toward you (never one even field of dashes)
      for (k = 0; k < 24; k++) {
        var u9 = Math.pow(k / 24, 1.5), yr = yW + 5 + u9 * (yD - yW + 8), amp = 0.3 + (yr - yW) * 0.02, x9 = -8, d9 = "", l9 = "";
        while (x9 < W + 8) {
          var seg = 8 + r() * 36 * (0.4 + (yr - yW) / 40), gap = 3 + r() * 16 * (0.4 + u9);
          if (r() < 0.72) { var yy9 = yr + (nz(x9 * 0.02 + k) - 0.5) * 3; d9 += "M" + n(x9) + " " + n(yy9) + "q" + n(seg / 2) + " " + n(-amp * 1.4) + " " + n(seg) + " " + n((r() - 0.5) * amp); l9 += "M" + n(x9 + 1) + " " + n(yy9 - amp - 0.4) + "q" + n(seg / 2 - 1) + " " + n(-amp) + " " + n(seg - 2) + " 0"; }
          x9 += seg + gap;
        }
        rows9 += '<g opacity="' + n(0.2 + u9 * 0.8) + '"><path class="w-riprow" style="stroke-width:' + n(0.3 + u9 * 0.9) + '" d="' + d9 + '"/></g>';
        rowsl += '<g opacity="' + n(0.1 + u9 * 0.75) + '"><path class="w-riprowl" style="stroke-width:' + n(0.25 + u9 * 0.6) + '" d="' + l9 + '"/></g>';
      }
      // the sand toward you holds the water: wet and darker, step by step
      for (k = 0; k < 3; k++) { var yb9 = yW + (yD - yW) * (0.2 + k * 0.15), nb9 = []; for (x = -6; x <= W + 6; x += 14) nb9.push([x, yb9 + (nz(x * 0.017 + k * 7) - 0.5) * 7]); dk9 += '<path class="w-sandwet" d="' + line(nb9) + "L" + (W + 6) + " " + (H + 6) + "L-6 " + (H + 6) + 'Z"/>'; }
      // and its sheen breaks into pools, wider toward you, each with a dark lip on its far side
      var pr9 = rnd(seed + 9);
      for (k = 0; k < (TILE ? 3 : 7); k++) {
        var pu = 0.26 + pr9() * 0.34, pcy = yW + (yD - yW) * pu, pcx = pr9() * W, prx = 12 + pr9() * 34 * (0.5 + pu * 2), pry = 0.8 + (pcy - yW) * 0.045, pts9 = [], m9 = 12;
        for (var j9 = 0; j9 < m9; j9++) { var a9 = (j9 / m9) * Math.PI * 2, kk = 0.7 + pr9() * 0.5; pts9.push([pcx + Math.cos(a9) * prx * kk, pcy + Math.sin(a9) * pry * kk]); }
        pn9 += '<path class="w-poolnear" d="' + smooth(pts9) + '"/><path class="w-poollip" d="M' + n(pcx - prx * 0.8) + " " + n(pcy - pry * 0.6) + "Q" + n(pcx) + " " + n(pcy - pry * 1.3) + " " + n(pcx + prx * 0.85) + " " + n(pcy - pry * 0.5) + '"/>';
      }
    }
    return '<path class="w-flat" d="' + wet + '"/><path class="w-flatdk" d="' + flatDk + '"/>' + dk9 + rows9 + rowsl + '<g class="w-lightx"><ellipse class="w-sandroad" cx="0" cy="' + n(yW + 14) + '" rx="54" ry="22" fill="url(#' + id + '-glow)"/></g>' +
      (yV != null ? '<g class="w-pools">' + pools + "</g>" + pn9 + '<g class="w-sheen w-film">' + film + "</g>" : '<g class="w-pools">' + pools + '<path class="w-runs" d="' + runs + '"/></g>') + '<g class="w-sheen">' + sheen + '</g><path class="w-ripl" d="' + ripl + '"/><path class="w-ripm" d="' + rip + '"/>' +
      '<path class="w-lace" d="' + lace + '"/><path class="w-foam" d="' + line(edge) + '"/>' +
      '<path class="w-shore" d="' + line(dry.slice().reverse()) + "L" + (W + 6) + " " + (H + 4) + "L-6 " + (H + 4) + 'Z"/>' +
      (top9 < H - 8 ? nearS : "") + (yD < H ? '<g class="w-wrack">' + wrack + "</g>" : "");
  }
  // Cobbles, many small and a few big enough to carry a shade, from y0 down.
  function cobbles(seed, x0, x1, y0, y1, cnt) {
    var r = rnd(seed), s = "";
    cnt = Math.round(cnt * (TILE ? 0.35 : 1));
    for (var k = 0; k < cnt; k++) {
      var u = r(), sx = x0 + r() * (x1 - x0), sy = y0 + u * u * (y1 - y0), sz = (0.6 + r() * 1.6) * (0.6 + (sy - y0) / 40);
      s += '<ellipse class="' + (r() < 0.32 ? "w-st-l" : "w-st-d") + '" cx="' + n(sx) + '" cy="' + n(sy) + '" rx="' + n(sz) + '" ry="' + n(sz * (0.45 + r() * 0.2)) + '"/>';
    }
    return s;
  }
  // Grass in tufts along an edge: blades as thin filled wedges.
  function grass(seed, pts, hmax, cls) {
    var r = rnd(seed), d = "";
    pts.forEach(function (q) {
      for (var k = 0; k < (q[2] || 6); k++) {
        var x = q[0] + (r() - 0.5) * 8, b = q[1] + r() * 2, h = hmax * (0.35 + r() * 0.65), lean = (r() - 0.4) * h * 0.5;
        d += poly([[x - 0.7, b], [x + lean * 0.5, b - h * 0.6], [x + lean, b - h], [x + 0.7, b]]);
      }
    });
    return '<path class="' + (cls || "w-grass") + '" d="' + d + '"/>';
  }
  // A boat ramp at your feet running into the water: concrete with its
  // grooves, or gravel; where it goes under it darkens into the water.
  // Gravel: no slab and no lip; the stones thin out into the shallows along
  // a ragged edge, darker and closer packed where the water keeps them wet.
  // Concrete: a slab with short diagonal grooves that darkens where the
  // water reaches it and fades away under the surface.
  function stone(r, x, y, s) {
    var m = 5 + Math.floor(r() * 3), pts = [], a0 = r() * 6;
    for (var j = 0; j < m; j++) { var a = a0 + (j / m) * Math.PI * 2, k = 0.65 + r() * 0.5; pts.push([x + Math.cos(a) * s * k, y + Math.sin(a) * s * 0.55 * k]); }
    return poly(pts);
  }
  function ramp(seed, kind, yW, x0, x1) {
    var r = rnd(seed), cx = (x0 + x1) / 2, k, gy;
    if (kind === "gravel") {
      var gz = noise(seed + 3), L2 = [], R2 = [], top = [], xg;
      for (gy = yW + 3; gy <= H + 4; gy += 5) { var u2 = (gy - yW) / (H - yW), hw2 = (x1 - x0) * (0.34 + u2 * 0.75) + u2 * 30; L2.push([cx - hw2 + (gz(gy * 0.2) - 0.5) * 9, gy]); R2.unshift([cx + hw2 + (gz(gy * 0.2 + 7) - 0.5) * 9, gy]); }
      // the ragged top: the stones' own edge where they go under
      for (xg = R2[R2.length - 1][0]; xg >= L2[0][0]; xg -= 3) top.push([xg, yW + 2 + (gz(xg * 0.13 + 11) - 0.5) * 4 + (r() - 0.5) * 1.4]);
      var fan = poly(L2.concat(R2, top)), wetb = poly(top.concat(L2.slice(0, 3)).concat(R2.slice(-3)));
      var g1 = "", g2 = "", g3 = "", gu = "";
      for (k = 0; k < (TILE ? 70 : 240); k++) {
        var v = Math.pow(r(), 1.7), sy = yW + 2 + v * (H - yW), uu = (sy - yW) / (H - yW), hw3 = (x1 - x0) * (0.34 + uu * 0.75) + uu * 30, sx = cx + (r() - 0.5) * 2 * hw3 * 0.92;
        var sz = (0.5 + r() * 1.1) * (0.5 + uu * 2.2), wetz = uu < 0.18, st = stone(r, sx, sy, sz), pick = r();
        if (wetz ? pick < 0.6 : pick < 0.3) g3 += st; else if (pick < 0.75) g2 += st; else g1 += st;
      }
      // a few stones just under the water past the edge, fading out
      for (k = 0; k < (TILE ? 8 : 26); k++) gu += stone(r, cx + (r() - 0.5) * (x1 - x0) * 0.8, yW + 1 - r() * 6, 0.5 + r() * 0.8);
      // the trailers' wheel ruts down it to the water, two dark grooves
      // narrowing away from you, each with a lit lip; the lower end wet and
      // dark where the lake laps it; its edges broken by grass and sedge
      var ruts = "", rutl = "", edgeG = "", edgeG2 = "", wetLo = "";
      [-1, 1].forEach(function (sg) {
        var a9 = [], b9 = [], l9 = [];
        for (gy = yW + 4; gy <= H + 4; gy += 4) {
          var u9 = (gy - yW) / (H - yW), hw9 = (x1 - x0) * (0.34 + u9 * 0.75) + u9 * 30, c9 = cx + sg * hw9 * 0.44 + (gz(gy * 0.09 + sg * 5) - 0.5) * 3, rw9 = 0.6 + u9 * 6.5;
          a9.push([c9 - rw9, gy]); b9.unshift([c9 + rw9, gy]); l9.push([c9 + sg * rw9 * 1.1, gy]);
        }
        ruts += poly(a9.concat(b9)); rutl += line(l9);
      });
      wetLo = poly(top.concat([[L2[0][0] + 6, yW + 16], [R2[R2.length - 1][0] - 6, yW + 16]].reverse()));
      [L2, R2].forEach(function (ed, ei) {
        ed.forEach(function (q, qi) {
          if (q[1] > H) return;
          var u9 = (q[1] - yW) / (H - yW), nb9 = 2 + Math.floor(r() * 4);
          for (var b9 = 0; b9 < nb9; b9++) {
            var bx = q[0] + (ei ? -1 : 1) * r() * 6 * (0.5 + u9), hh = (3 + r() * 9) * (0.5 + u9 * 1.4), ln = (r() - 0.45) * hh * 0.6, bw = 0.5 + r() * 0.5 * (0.6 + u9);
            var bl = "M" + n(bx - bw) + " " + n(q[1]) + "Q" + n(bx + ln * 0.3) + " " + n(q[1] - hh * 0.6) + " " + n(bx + ln) + " " + n(q[1] - hh) + "Q" + n(bx + ln * 0.3 + bw) + " " + n(q[1] - hh * 0.5) + " " + n(bx + bw) + " " + n(q[1]) + "Z";
            if ((b9 + qi) % 3) edgeG += bl; else edgeG2 += bl;
          }
        });
      });
      return '<path class="w-gravel" d="' + fan + '"/><path class="w-gravelw" d="' + wetb + '"/><path class="w-gravelwl" d="' + wetLo + '"/><path class="w-rut" d="' + ruts + '"/><path class="w-rutl" d="' + rutl + '"/><path class="w-gr-u" d="' + gu + '"/><path class="w-gr1" d="' + g1 + '"/><path class="w-gr2" d="' + g2 + '"/><path class="w-gr3" d="' + g3 + '"/>' +
        '<path class="w-foam w-lipg" d="' + line(top.slice().reverse().map(function (q) { return [q[0], q[1] - 1.2]; })) + '"/><path class="w-reed2" d="' + edgeG2 + '"/><path class="w-sedgeg" d="' + edgeG + '"/>';
    }
    var tp = [[x0 - 26, H + 4], [x1 + 26, H + 4], [cx + (x1 - x0) * 0.32, yW], [cx - (x1 - x0) * 0.32, yW]], marks = "", wet = "", fade = "";
    // short grooves, slanting both ways in a herringbone, closer far off
    for (k = 0; k < 16; k++) {
      var y = yW + 3 + k * k * 0.38, u = (y - yW) / (H - yW), hw = (x1 - x0) * (0.32 + u * 0.5) + u * 26, gl = 2 + u * 9, dy = 0.8 + u * 3;
      for (var gx = cx - hw * 0.88; gx < cx + hw * 0.88 - gl; gx += gl * 1.6) marks += "M" + n(gx) + " " + n(y + (k % 2 ? dy : 0)) + "l" + n(gl) + " " + n(k % 2 ? -dy : dy);
    }
    // the wet lower end, then the slab fading under the water
    wet = quad([cx - (x1 - x0) * 0.32, yW], [cx + (x1 - x0) * 0.32, yW], [cx + (x1 - x0) * 0.42 + 6, yW + 12], [cx - (x1 - x0) * 0.42 - 6, yW + 12]);
    for (k = 1; k <= 4; k++) fade += '<path class="w-rampw" opacity="' + n(0.55 - k * 0.12) + '" d="' + quad([cx - (x1 - x0) * (0.32 - k * 0.025), yW - (k - 1) * 1.8], [cx + (x1 - x0) * (0.32 - k * 0.025), yW - (k - 1) * 1.8], [cx + (x1 - x0) * (0.32 - k * 0.03), yW - k * 1.8], [cx - (x1 - x0) * (0.32 - k * 0.03), yW - k * 1.8]) + '"/>';
    return fade + '<path class="w-ramp3" d="' + poly(tp) + '"/><path class="w-rampwet" d="' + wet + '"/><path class="w-groove3" d="' + marks + '"/>' +
      '<path class="w-foam" d="M' + n(cx - (x1 - x0) * 0.36) + " " + n(yW + 0.6) + "Q" + n(cx) + " " + n(yW - 0.8) + " " + n(cx + (x1 - x0) * 0.36) + " " + n(yW + 0.4) + '"/>';
  }

  // ---- the Sound from a spot ---------------------------------------------------------
  // o.view: "deck" (on the pier, o.pier), "side" (the pier from the shore by
  // its root, o.pier), "dock" or "float" (under your feet, o.dock), or
  // "beach" (from the sand). o.skyline: what is across the water. o.near:
  // what stands between (a breakwater, masts, tide rips). o.bank: what is
  // at your feet beside the stand (the flats, cobbles, a lawn, grass).
  // Returns the painting's layers; scene() hangs them, view() flattens them.
  function seaSpot(id, o) {
    var t = today(o), V = lens(o), sd = idSeed(o.spot), r = rnd(sd + 41), wd = windOf(t.wind), Lt = lightOf(V.f, t.date);
    var sky = o.skyline || [], litLeft = Lt.set.rel < 0;
    var back = defs(id) + skyLayer(id, { seed: sd + 100, town: 1 }) + nightSky(id, sd) + peaksOf(id, sky, V, HZ, sd, litLeft) + waterLayer(id) +
      swell(sd + 7, 214, 1 + wd.amp * 1.4, 3.5) + swell(sd + 8, 243, 1.4 + wd.amp * 2, 5) + swell(sd + 9, 281, 1.8 + wd.amp * 2.8, 7);
    // the land across, far to near, each with its copy in the water
    var lands = sky.filter(function (p) { return p.t === "island" || p.t === "shore"; }).sort(function (a, b) { return (b.mi || 5) - (a.mi || 5); });
    var mdef = "", mid = "", named = {};
    lands.forEach(function (p, k) {
      var hl = farLand(p, V, sd + 13 * (k + 1), HZ);
      named[p.name || "land" + k] = hl;
      if (hl.cls === "w-far") { back += '<path class="w-far" d="' + hl.land + '"/>'; return; }
      var rf = reflect(id, "i" + k, hl, 0.55, hl.cls);
      mdef += rf.def;
      mid += '<g opacity="' + n(wd.refl) + '">' + rf.svg + "</g>" + land(hl, hl.cls, hl.mi < 1.5) + mist(id + "m", sd + 60 + k, hl.base(0) + 2, 0.6);
    });
    sky.forEach(function (p, k) {
      var hl = named[p.on], x = p.at != null ? V.x(p.at) : 0, b = hl ? hl.base(x) : HZ + 1;
      if (p.t === "light") mid += tower(id + "m", x, b - 0.2, p.h || 6);
      if (p.t === "ferry") mid += ferry(x, b, p.s || 1);
      if (p.t === "bridge") back += '<g class="w-bridge">' + bridge(x, HZ + 0.5, p.s || 1) + "</g>";
      if (p.t === "lights" && hl) mid += '<g class="w-lights">' + shoreLights(sd + k, hl, p.n || 12, 6, V.x(p.from), V.x(p.to)) + "</g>";
    });
    (o.near || []).forEach(function (q, k) {
      if (q.t === "breakwater") mid += rocks(sd + 70 + k, q.pts, { wet: (1 - t.tide) * (q.wet || 3), cls: q.cls || "", tall: q.tall });
      if (q.t === "masts") mid += masts(sd + 80 + k, q.x0, q.x1, q.base, q.h);
      if (q.t === "rips") mid += rips(sd + 90 + k, q.bands);
    });
    mid += nightWater(id + "m", sd, o, t, HZ + 2, 238) + whitecaps(sd + 5, HZ + 8, 300, wd.caps);
    // where you stand
    var fdef = "", front = "", under = "", over = "";
    (o.bank || []).forEach(function (b, k) {
      var s = "";
      if (b.t === "flats") s = flats(id + "f", sd + 300 + k, (b.low || 200) + t.tide * ((b.high || 258) - (b.low || 200)), 1 - t.tide);
      if (b.t === "cobbles") s = '<path class="w-shore" d="' + line(b.edge) + "L" + (W + 4) + " " + (H + 4) + "L-4 " + (H + 4) + 'Z"/><path class="w-foam" d="' + line(b.edge) + '"/>' + cobbles(sd + 310 + k, -4, W + 4, b.edge[0][1] + 2, H, b.n || 220);
      if (b.t === "lawn") s = '<path class="w-lawn" d="' + poly(b.pts) + '"/>' + grass(sd + 320 + k, b.pts.slice(0, 2).map(function (q) { return [q[0], q[1], 8]; }), 5);
      if (b.t === "grass") s = grass(sd + 330 + k, b.pts, b.h || 16);
      if (b.layer === "over") over += s; else under += s;
    });
    front += under;
    // the world in metres: the beach as far as today's tide leaves it, then
    // the pier, the float, the rocks and the buildings, far to near
    if (o.parts || o.ground) {
      var wd2 = world(V, o, t), wp = worldParts(id + "f", wd2, o, t, r, sd), beach = "";
      if (o.ground && wd2.edgeZ != null) {
        var yW = wd2.P(0, wd2.wl, wd2.edgeZ)[1], yD = wd2.P(0, o.ground.top, o.ground.shore)[1];
        if (yW < H + 4) beach = flats(id + "f", sd + 300, yW, 1 - t.tide, o.ground.dry === false ? H + 12 : yD, o.ground.flats ? 292 : null);
        // a cobble or rock shore: dark wet stones at the water's edge, the
        // stones darker toward you, never a pale sheet
        if (o.ground.cobble && yW < H) beach += '<path class="w-cobshore" d="' + poly([[-6, yW + 1], [W + 6, yW + 1], [W + 6, H + 6], [-6, H + 6]]) + '"/><path class="w-cobedge" d="' + poly([[-6, yW - 0.5], [W + 6, yW - 0.5], [W + 6, yW + 5], [-6, yW + 6]]) + '"/>' + cobbles(sd + 311, -4, W + 4, Math.max(yW + 3, HZ + 4), H, 300);
        else if (o.ground.cobble) beach += cobbles(sd + 311, -4, W + 4, Math.max(yW + 3, HZ + 4), H, 300);
      }
      front += '<g filter="url(#' + id + 'f-wv)">' + wp.glass + "</g>" + beach + wp.ground + wp.things;
    }
    if (o.view === "deck") front += onPier(id + "f", o.pier || {}, t, r, V);
    else if (o.view === "side") { var sp = sidePier(id + "f", o.pier || {}, t, r); fdef += sp.def; front += sp.svg; }
    else if (o.view === "dock" || o.view === "float") front += onDock(id + "f", o.dock || {}, t, r, V);
    front += over;
    // o.glow "behind": a town and marina at your back (Westport's basin):
    // after dark their light lies on the low cloud ahead and on the water
    if (o.glow === "behind") {
      back += '<g class="w-lampson w-townglow"><ellipse cx="' + (W / 2) + '" cy="' + (HZ - 6) + '" rx="300" ry="58" fill="url(#' + id + '-lamp)" opacity=".42"/></g>';
      front = '<g class="w-lampson w-townglow"><ellipse cx="' + (W / 2) + '" cy="' + (HZ + 46) + '" rx="260" ry="34" fill="url(#' + id + 'f-lamp)" opacity=".3"/></g>' + front;
    }
    // o.own { x, y }: no lamp here, but people fish it into the night by
    // their own lantern (the crab float): its light on the water in front
    if (o.own) front += ownLight(id + "f", sd + 97, o.own.x, o.own.y, o.own.rx || 96, o.own.ry || 11);
    if (!under && !o.parts && !o.ground && o.view !== "deck" && o.view !== "dock" && o.view !== "float") front += shoreEdge([[-2, 305], [60, 302], [130, 304], [200, 308], [270, 309], [330, 307], [392, 310]]);
    var fog = t.fog > 0 ? '<rect class="w-fog" width="' + W + '" height="' + H + '"/>' : "";
    return { back: back, gl: [sd + 200, HZ + 2.5, H, wd.dens], mid: defs(id + "m", mdef) + fog + mid, front: defs(id + "f", fdef) + (fog ? '<rect class="w-fog w-fog2" width="' + W + '" height="' + H + '"/>' : "") + front };
  }

  // ---- a lake from a spot ------------------------------------------------------------------
  // o.lake:
  //   across   metres to the far shore ahead
  //   shores   [{from, to, m, houses}]: stretches of far shore by bearing,
  //            nearer or farther than across, and how many houses on each
  //   islands  [{from, to, m}]
  //   mix      the share of firs in the trees (no card names the kinds)
  //   drawdown the water is let down: a mud band and stumps along the shore
  //   stand    "dock" (floating, o.dock), "pier" (o.dock), "ramp", "gravel"
  //            or none (the bank)
  //   wetland  "right" or "left": a marshy edge and a small park
  //   profile  [[bearing, m], ...]: the far shore bearing by bearing, read
  //            off the lake's outline on the map (in place of shores):
  //            where the lake runs off, its shores fall away to its far end,
  //            the sky over that end lies on the water as a pale road, and
  //            after dark the towns' glow stands over it
  function lakeSpot(id, o) {
    var t = today(o), V = lens(o), sd = idSeed(o.spot), r = rnd(sd + 131), wd = windOf(t.wind * 0.75), lk = o.lake || {}, E = 1.7;
    var isBare = bare(t.date), mix = lk.mix == null ? 0.3 : lk.mix, sky = o.skyline || [], low = within(t.date, lk.drawdown) ? 2.2 : 0, k;
    var Lt = lightOf(V.f, t.date);
    var shores = lk.profile ? [] : (lk.shores || [{ from: V.f - 80, to: V.f + 80, m: lk.across || 300, houses: lk.houses || 0 }]).slice();
    // a point of the far shore coming in nearer from one side (seeded for a
    // lake from the feed: which side, how far in, how near)
    if (lk.point) { var pL = lk.point.side === "left", pf = V.f + (pL ? -80 : 80 - lk.point.span), pt = pf + lk.point.span; shores.push({ from: pf, to: pt, m: lk.point.m, point: pL ? "left" : "right", trees: lk.point.trees }); }
    var yTop = 999;
    shores.forEach(function (s) { var y = HZ + (V.fl * E) / s.m; if (y < yTop) yTop = y; });
    (lk.islands || []).forEach(function (s) { var y = HZ + (V.fl * E) / s.m; if (y < yTop) yTop = y; });
    // the profile: its distance at each x, the far end (the farthest in the
    // frame, when it is far past the rest: the lake runs off there)
    var mAt = null, PX = [], gapX = null;
    if (lk.profile) {
      var pf = lk.profile, gm = 0, mn = 1e9;
      mAt = function (x) {
        var b = V.f + (x - W / 2) / V.ud, j;
        if (b <= pf[0][0]) return pf[0][1];
        for (j = 1; j < pf.length; j++) if (b <= pf[j][0]) return pf[j - 1][1] + ((b - pf[j - 1][0]) / (pf[j][0] - pf[j - 1][0])) * (pf[j][1] - pf[j - 1][1]);
        return pf[pf.length - 1][1];
      };
      for (k = -44; k <= W + 44; k += 2) {
        var mk0 = mAt(k);
        PX.push([k, mk0]);
        if (k < 6 || k > W - 6) continue;
        if (HZ + (V.fl * E) / mk0 < yTop) yTop = HZ + (V.fl * E) / mk0;
        if (mk0 > gm) { gm = mk0; gapX = k; }
        if (mk0 < mn) mn = mk0;
      }
      // (a far end only where the shore comes back in past it on both sides:
      // a shore still falling away at the frame's edge has no end in sight)
      if (gm < mn * 2.2 || gm < 1.6 * Math.max(mAt(6), mAt(W - 6))) gapX = null;
    }
    var back = defs(id) + skyLayer(id, { seed: sd + 700, town: 1, townX: gapX }) + nightSky(id, sd, gapX) + peaksOf(id, sky, V, yTop - 1, sd, Lt.set.rel < 0) + waterLayer(id, yTop - 1);
    var mdef = "", mid = "", near = "";
    // the far shore, stretch by stretch, farthest first
    shores.slice().sort(function (a, b) { return b.m - a.m; }).concat((lk.islands || []).map(function (s) { var c = {}, q; for (q in s) c[q] = s[q]; c.island = 1; return c; }).sort(function (a, b) { return b.m - a.m; })).forEach(function (s, i) {
      var x0 = V.x(s.from), x1 = V.x(s.to), sw0;
      if (x1 < x0) { sw0 = x0; x0 = x1; x1 = sw0; }
      var wy = HZ + (V.fl * E) / s.m, vy = HZ + (V.fl * (E - low)) / s.m, th = (V.fl * (s.trees || 24)) / s.m;
      var cls = s.m < 120 ? "w-l5" : s.m < 220 ? "w-l4" : s.m < 450 ? "w-l3" : s.m < 1300 ? "w-l2" : s.m < 2600 ? "w-l1" : "w-l0";
      var seed = sd + 17 * (i + 1), tilt = s.tilt || 0;
      var base = function (x) { return vy + tilt * (x - x0) / Math.max(1, x1 - x0); };
      if (th < 4) {
        var hl = headland({ seed: seed, from: s.island ? x0 : x0 - 30, to: s.island ? x1 : x1 + 30, base: vy, h: th * 0.6, tree: Math.max(1, th * 0.7), gap: 2, freq: 0.03, tipFade: 60,
          env: s.island ? function (u) { return Math.pow(clamp(Math.min(u, 1 - u) * 5, 0, 1), 0.6); } : null });
        mid += '<path class="' + cls + '" d="' + hl.land + '"/>';
        return;
      }
      // the far wall's own skyline: an island tapers at both ends; a point
      // tapers toward its tip; lk.roll gives a rolling height of its own;
      // lk.taper "left" keeps it low on the left, where the title sits
      var nr = noise(seed + 9), grow = s.island ? function (x) { var u = (x - x0) / Math.max(1, x1 - x0); return (s.blunt || 0.35) + (1 - (s.blunt || 0.35)) * Math.pow(clamp(Math.min(u, 1 - u) * 4, 0, 1), 0.5); } :
        s.point ? function (x) { var u = clamp((x - x0) / Math.max(1, x1 - x0), 0, 1); return 0.25 + 0.75 * Math.pow(s.point === "left" ? 1 - u : u, 0.6); } : null;
      if (lk.roll) { var g0 = grow; grow = function (x) { return (g0 ? g0(x) : 1) * (1 + (nr(x * 0.008) - 0.5) * lk.roll); }; }
      if (lk.taper === "left") { var g1 = grow; grow = function (x) { return (g1 ? g1(x) : 1) * (0.14 + 0.86 * Math.pow(clamp(x / W, 0, 1), 1.7)); }; }
      // (only what can be seen: a shore running far off either side is drawn to just past the frame)
      var wl = wall({ seed: seed, x0: Math.max(-40, s.island ? x0 : x0 - 20), x1: Math.min(W + 40, s.island ? x1 : x1 + 20), base: base, h: th, mix: s.mix == null ? mix : s.mix, bare: isBare, land: Math.max(1, th * 0.06), grow: grow });
      var rf = reflect(id, "s" + i, wl.glass, 0.92, cls === "w-l0" ? "w-l1" : cls === "w-l4" ? "w-l5" : cls);
      mdef += rf.def;
      mid += '<g opacity="' + n(wd.refl) + '">' + rf.svg + "</g>";
      if (low) mid += '<path class="w-mud" d="' + quad([x0 - 30, vy - 0.5], [x1 + 30, vy - 0.5], [x1 + 30, wy + 0.6], [x0 - 30, wy + 0.6]) + '"/>';
      mid += paintWall(wl, cls);
      if (s.houses) {
        // houses in twos and threes with gaps between, never evenly spaced
        var xs = [], hr = rnd(seed + 3), hx0 = Math.max(x0, -10), hx1 = Math.min(x1, W + 10), gaps = [], tot = 0;
        for (k = 0; k < s.houses; k++) { var gp = hr() < 0.45 ? 0.25 + hr() * 0.3 : 1 + hr() * 2.2; gaps.push(gp); tot += gp; }
        var acc = hr() * 0.6;
        for (k = 0; k < s.houses; k++) { acc += gaps[k]; xs.push(hx0 + (acc / (tot + 1)) * (hx1 - hx0)); }
        // the houses stand at the water's edge, in front of their trees
        mid += houses(id + "m", hr, xs, function () { return vy; }, clamp((V.fl * 8) / s.m, 2.4, 12), wy, lk.lights === false);
      }
      mid += '<path class="w-beach" d="M' + n(x0) + " " + n(wy + 0.3) + "H" + n(x1) + '"/>' + mist(id + "m", sd + 90 + i, wy + 2, 0.7);
    });
    if (mAt) {
      // the far shore drawn from the profile in steps of distance (each step
      // paler than the one nearer), farthest first
      var clsOf = function (m) { return m < 120 ? 5 : m < 220 ? 4 : m < 450 ? 3 : m < 1300 ? 2 : 1; }, runs = [], cur = null;
      PX.forEach(function (q) { var c = clsOf(q[1]); if (!cur || cur.c !== c) runs.push(cur = { c: c, x0: q[0], x1: q[0] }); else cur.x1 = q[0]; });
      var baseP = function (x) { return HZ + (V.fl * E) / mAt(x); }, tp = lk.taper === "left";
      var growP = function (x) { return (100 / mAt(x)) * (tp ? 0.14 + 0.86 * Math.pow(clamp(x / W, 0, 1), 1.7) : 1); };
      runs.sort(function (a, b) { return a.c - b.c; }).forEach(function (rn, i) {
        var cl = "w-l" + rn.c, wl = wall({ seed: sd + 17 * (i + 1), x0: rn.x0 - 3, x1: rn.x1 + 3, base: baseP, h: (V.fl * 24) / 100, mix: mix, bare: isBare, land: Math.max(1, (V.fl * 24) / 100 * 0.06), grow: growP });
        var rf = reflect(id, "p" + i, wl.glass, 0.92, cl === "w-l4" ? "w-l5" : cl);
        mdef += rf.def;
        mid += '<g opacity="' + n(wd.refl) + '">' + rf.svg + "</g>" + paintWall(wl, cl);
      });
      mid += '<path class="w-beach" d="' + line(PX.map(function (q) { return [q[0], baseP(q[0]) + 0.3]; })) + '"/>' + mist(id + "m", sd + 90, yTop + 2, 0.7);
      if (gapX != null) {
        // the sky over the far end, on the still water: a pale road under
        // it, widening toward you, broken by a breath of air into strokes
        var y0g = baseP(gapX) + 1, rgp = rnd(sd + 59), gsp = "";
        for (k = 0; k < (TILE ? 26 : 90); k++) {
          var vg = Math.pow(rgp(), 1.15), yg = y0g + 1 + vg * 70, spg = 3 + vg * 26, lg = (2.6 + vg * 18) * (0.4 + rgp() * 0.8), xg = gapX + gauss(rgp) * spg - lg / 2;
          gsp += '<path d="M' + n(xg) + " " + n(yg) + "h" + n(lg) + '" stroke-width="' + n(0.6 + vg * 1.3) + '" opacity="' + n(0.3 + rgp() * 0.7) + '"/>';
        }
        mid += '<ellipse class="w-gapsh" cx="' + n(gapX) + '" cy="' + n(y0g + 22) + '" rx="' + (TILE ? 40 : 46) + '" ry="30" fill="url(#' + id + 'm-glow)"/>' +
          '<g class="w-townwater"><ellipse cx="' + n(gapX) + '" cy="' + n(y0g + 16) + '" rx="70" ry="34" fill="url(#' + id + 'm-lamp)" opacity=".7"/></g>' +
          '<g class="w-gaprd">' + gsp + "</g>";
      }
    }
    mid += nightWater(id + "m", sd, o, t, yTop, yTop + 44, gapX);
    // still water keeps long quiet streaks where a breath of air touches it
    var streaks = "";
    for (k = 0; k < 7; k++) {
      var sy = yTop + 12 + k * (6 + k * 2.4) + r() * 5, sx = r() * 300 - 20, sl = 90 + r() * 190;
      streaks += '<path d="M' + n(sx) + " " + n(sy) + "q" + n(sl / 2) + " " + n(-0.8 - r()) + " " + n(sl) + ' 0" stroke-width="' + n(0.8 + k * 0.3) + '" opacity="' + n((0.3 + r() * 0.5) * (1 - t.wind)) + '"/>';
    }
    mid += '<g class="w-streak">' + streaks + "</g>" + whitecaps(sd + 5, yTop + 8, 300, wd.caps * 0.6);
    // trees on your own shore either side of you, framing the picture
    (lk.near || []).forEach(function (q, i2) {
      var nw = wall({ seed: sd + 120 + i2, x0: q[0], x1: q[1], base: q[2], h: q[3], mix: mix, bare: isBare, land: 3, freq: 0.05 });
      var nrf = reflect(id, "n" + i2, nw.glass, 0.5, "w-l5");
      mdef += nrf.def;
      near += '<g opacity="' + n(wd.refl * 0.8) + '">' + nrf.svg + "</g>" + '<path class="w-rim" d="' + nw.trees + '"/>' + paintWall(nw, "w-l5");
    });
    // lk.nearTree { x, base, h, spread }: one big tree of your own shore at
    // the side, rooted below the frame: trunk, limbs and its crown (leafy in
    // season, a haze of twigs bare), darkest of everything, its copy in the water
    if (lk.nearTree) {
      // (bare, its crown is a soft haze round the limbs' ends, never a twig fan)
      var nt = lk.nearTree, ntr = rnd(sd + 127), btn = bigTree(ntr, TILE && nt.tileX != null ? nt.tileX : nt.x, TILE && nt.tileBase ? nt.tileBase : nt.base, TILE && nt.tileH ? nt.tileH : nt.h, false, nt.spread || 0.6);
      // (on a tile it is the tile's dark mass: its bare crown's twigs massed
      // into one dark body with a ragged rim, the limbs darker in it, not the
      // big picture's faint haze)
      near += '<path class="w-rim" d="' + btn.wood + '"/><g class="w-l5">' + (TILE && isBare ? '<path class="w-crownm" d="' + crownMass(rnd(sd + 129), btn.tips, 4) + '"/>' :
        '<path' + (isBare ? ' class="w-haze"' : "") + ' d="' + btn.leaf + '"/>') + '<path d="' + btn.wood + '"/></g>';
    }
    // the bank beside you
    if (lk.wetland) {
      var wl2 = lk.wetland === "left", wx0 = wl2 ? -10 : 286, wx1 = wl2 ? 104 : 400, wy2 = yTop + 22;
      var mz2 = noise(sd + 79), mk = [], xm, rs3 = rnd(sd + 81), bl3 = "", bl4 = "";
      for (xm = wx0 - 10; xm <= wx1 + 10; xm += 6) { var um = wl2 ? 1 - (xm - wx0) / (wx1 - wx0) : (xm - wx0) / (wx1 - wx0); mk.push([xm, wy2 + 14 - um * 18 + (mz2(xm * 0.06) - 0.5) * 7]); }
      near += '<path class="w-sedgeg" d="' + line(mk) + "L" + (wl2 ? wx0 - 10 : wx1 + 10) + " " + (wy2 + 60) + "L" + (wl2 ? wx1 + 10 : wx0 - 10) + " " + (wy2 + 60) + 'Z"/>';
      for (var mq = 0; mq < (TILE ? 40 : 150); mq++) {
        var mx2 = wx0 + rs3() * (wx1 - wx0), um2 = wl2 ? 1 - (mx2 - wx0) / (wx1 - wx0) : (mx2 - wx0) / (wx1 - wx0), my2 = wy2 + 14 - um2 * 18 + (mz2(mx2 * 0.06) - 0.5) * 7 + rs3() * 16, mh = (5 + rs3() * 12) * (0.6 + um2 * 0.8), ml = (rs3() - 0.4) * mh * 0.5;
        var bd3 = "M" + n(mx2 - 0.7) + " " + n(my2) + "Q" + n(mx2 + ml * 0.3) + " " + n(my2 - mh * 0.6) + " " + n(mx2 + ml) + " " + n(my2 - mh) + "Q" + n(mx2 + ml * 0.3 + 0.7) + " " + n(my2 - mh * 0.5) + " " + n(mx2 + 0.7) + " " + n(my2) + "Z";
        if (mq % 3) bl3 += bd3; else bl4 += bd3;
      }
      near += '<path class="w-reed2" d="' + bl4 + '"/><path class="w-reed" d="' + bl3 + '"/>';
      var bx = wl2 ? 30 : 362, by = wy2 + 3;
      near += '<path class="w-pile" d="' + poly([[bx - 6, by - 2.4], [bx + 6, by - 2.4], [bx + 6, by - 1.6], [bx - 6, by - 1.6]]) + poly([[bx - 5, by - 1.6], [bx - 4.2, by - 1.6], [bx - 4.2, by + 1], [bx - 5, by + 1]]) + poly([[bx + 4.2, by - 1.6], [bx + 5, by - 1.6], [bx + 5, by + 1], [bx + 4.2, by + 1]]) + poly([[bx - 6, by - 4.6], [bx + 6, by - 4.6], [bx + 6, by - 3.9], [bx - 6, by - 3.9]]) + '"/>';
    }
    if (low) {
      // let down for the winter: mud at the near shore and the old stumps standing in it
      var mud = '<path class="w-mud" d="' + poly([[-6, 228], [70, 236], [120, 252], [130, 272], [-6, 272]]) + '"/><path class="w-mud" d="' + poly([[400, 222], [330, 232], [292, 250], [286, 272], [400, 272]]) + '"/>', st = "";
      [[22, 238, 7], [58, 246, 5], [96, 256, 6], [352, 236, 8], [318, 247, 5.5], [372, 252, 6.5]].forEach(function (q) {
        var x = q[0], y = q[1], s = q[2];
        st += poly([[x - s * 0.9, y], [x - s * 0.55, y - s * 0.4], [x - s * 0.45, y - s * 1.5], [x - s * 0.1, y - s * 1.3], [x + s * 0.15, y - s * 1.7], [x + s * 0.45, y - s * 1.35], [x + s * 0.55, y - s * 0.4], [x + s, y]]);
      });
      st += poly([[40, 254], [104, 246], [106, 249], [44, 258]]) + poly([[300, 258], [360, 262], [358, 265], [298, 261.5]]);
      // weathered grey-brown wood, its top catching the light, a dark wet
      // ring where it stands in the mud
      var stt = "", stw = "";
      [[22, 238, 7], [58, 246, 5], [96, 256, 6], [352, 236, 8], [318, 247, 5.5], [372, 252, 6.5]].forEach(function (q) {
        stt += poly([[q[0] - q[2] * 0.45, q[1] - q[2] * 1.5], [q[0] - q[2] * 0.1, q[1] - q[2] * 1.3], [q[0] + q[2] * 0.15, q[1] - q[2] * 1.7], [q[0] + q[2] * 0.45, q[1] - q[2] * 1.35], [q[0] + q[2] * 0.4, q[1] - q[2] * 1.15], [q[0] - q[2] * 0.42, q[1] - q[2] * 1.2]]);
        stw += poly([[q[0] - q[2] * 0.95, q[1] + 0.4], [q[0] - q[2] * 0.8, q[1] - q[2] * 0.3], [q[0] + q[2] * 0.85, q[1] - q[2] * 0.3], [q[0] + q[2] * 1.05, q[1] + 0.4]]);
      });
      near += mud + '<path class="w-stump" d="' + st + '"/><path class="w-stumpw" d="' + stw + '"/><path class="w-stumpt" d="' + stt + '"/>';
    }
    // a lake from the feed: a bank of its own at your feet, to one side or
    // both, sedge or bare earth (never a dock or a pier)
    if (lk.bank) {
      var bkr = rnd(sd + 141), sides = lk.bank.side === "both" ? ["left", "right"] : [lk.bank.side];
      sides.forEach(function (sdn) {
        // its top kept above the run card's edge, so it shows: each feed
        // lake's own side, reach and kind of bank tell two lakes apart
        var lft = sdn === "left", x0b = lft ? -8 : W + 8, reach = 140 + bkr() * 120, top9 = Math.min(214, yTop + 14 + bkr() * 16), pts9 = [], xb9;
        for (xb9 = 0; xb9 <= reach; xb9 += 8) { var u9 = xb9 / reach; pts9.push([lft ? x0b + xb9 : x0b - xb9, top9 + Math.pow(u9, 2.3) * (H - top9 + 12) + (bkr() - 0.5) * 4]); }
        var bk9 = poly([[x0b, top9]].concat(pts9, [[x0b, H + 6]]));
        near += '<path class="w-shorewet" d="' + poly([[x0b, top9 - 3]].concat(pts9.map(function (q) { return [q[0] + (lft ? 3 : -3), q[1] - 3]; }), [[x0b, H + 6]])) + '"/>' + '<path class="' + (lk.bank.kind === "earth" ? "w-bankearth" : "w-lawn") + '" d="' + bk9 + '"/>';
        if (lk.bank.kind !== "earth") {
          var bb9 = "", bb8 = "";
          for (k = 0; k < (TILE ? 30 : 110); k++) {
            var t9 = bkr(), q9 = pts9[Math.floor(t9 * (pts9.length - 1))], gh9 = (5 + bkr() * 14) * (1 - t9 * 0.5), gl9 = (bkr() - 0.45) * gh9 * 0.7, gw9 = 0.6 + bkr() * 0.7, gx9 = q9[0] + (bkr() - 0.5) * 8, gy9 = q9[1] + 1 + bkr() * 12;
            var bl9 = "M" + n(gx9 - gw9) + " " + n(gy9) + "Q" + n(gx9 + gl9 * 0.3) + " " + n(gy9 - gh9 * 0.6) + " " + n(gx9 + gl9) + " " + n(gy9 - gh9) + "Q" + n(gx9 + gl9 * 0.3 + gw9) + " " + n(gy9 - gh9 * 0.5) + " " + n(gx9 + gw9) + " " + n(gy9) + "Z";
            if (k % 3) bb9 += bl9; else bb8 += bl9;
          }
          near += '<path class="w-reed2" d="' + bb8 + '"/><path class="w-reed" d="' + bb9 + '"/>';
        } else near += '<g class="w-bankst">' + cobbles(sd + 143, lft ? -6 : W - reach * 0.7, lft ? reach * 0.7 : W + 6, top9 + 4, H, 60) + "</g>";
      });
    }
    var stand = lk.stand, front = "", yW = yTop + 60;
    if (stand === "dock" || stand === "pier") front += onDock(id + "f", o.dock || {}, t, r, V);
    else if (stand === "ramp" || stand === "gravel") {
      // your own bank either side of the launch: its edge, grass and sedge
      var yB = Math.min(220, yTop + 34), bz = noise(sd + 61), bk = [], xb;
      for (xb = -6; xb <= W + 6; xb += 8) bk.push([xb, yB + 6 + (bz(xb * 0.03) - 0.5) * 8 + Math.abs(xb - 198) * 0.05]);
      front += '<path class="w-shorewet" d="' + line(bk.map(function (q) { return [q[0], q[1] - 3]; })) + "L" + (W + 6) + " " + (H + 4) + "L-6 " + (H + 4) + 'Z"/><path class="w-lawn" d="' + line(bk) + "L" + (W + 6) + " " + (H + 4) + "L-6 " + (H + 4) + 'Z"/>' +
        // the banks darker toward you, in steps
        '<path class="w-lawnn" d="' + line(bk.map(function (q) { return [q[0], q[1] + 8]; })) + "L" + (W + 6) + " " + (H + 4) + "L-6 " + (H + 4) + 'Z"/><path class="w-lawnn" d="' + line(bk.map(function (q) { return [q[0], q[1] + 20]; })) + "L" + (W + 6) + " " + (H + 4) + "L-6 " + (H + 4) + 'Z"/>' +
        grass(sd + 64, bk.filter(function (q) { return Math.abs(q[0] - 198) > 58; }).map(function (q) { return [q[0] + 4, q[1] + 10, 9]; }), 17, "w-reed") +
        grass(sd + 63, bk.filter(function (q) { return Math.abs(q[0] - 198) > 52; }).map(function (q) { return [q[0], q[1] + 1, 7]; }), 11, "w-sedge");
      front += ramp(sd + 9, stand === "gravel" ? "gravel" : "concrete", yB, 168, 228);
    }
    else front += shoreEdge([[-2, 306], [60, 303], [130, 305], [200, 309], [270, 310], [330, 308], [392, 311]]);
    // After dark: every lake on a card closes at dusk (or no source says it
    // is fished at night), so no one is painted there by their own light;
    // the night is the sky's and the lit windows of the houses round it.
    // lk.own { x, y } is for a card whose night allows it.
    if (lk.own) front += ownLight(id + "f", sd + 98, lk.own.x, lk.own.y, lk.own.rx || 84, 11, true);
    var fog = t.fog > 0 ? '<rect class="w-fog" width="' + W + '" height="' + H + '"/>' : "";
    return { back: back, gl: [sd + 800, yTop + 5, H, 0.45 * wd.dens], mid: defs(id + "m", mdef) + fog + mid + near, front: defs(id + "f") + front };
  }

  // A rod as a filled shape: thick at the butt, fine at the tip, bowed
  // down a little toward its tip by the weight of the line.
  function taperRod(a, b, bend, w0, w1) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L, nx = px, ny = py, left = [], right = [], i;
    if (ny < 0) { nx = -nx; ny = -ny; }
    for (i = 0; i <= 10; i++) {
      var u = i / 10, off = Math.sin(u * Math.PI * 0.5) * u * bend * L, x = a[0] + dx * u + nx * off, y = a[1] + dy * u + ny * off, hw = (w0 + (w1 - w0) * u) / 2;
      left.push([x + px * hw, y + py * hw]); right.unshift([x - px * hw, y - py * hw]);
    }
    return poly(left.concat(right));
  }
  // Someone fishing from a bank, seen from behind and a little to the side:
  // waders, a jacket with shoulders, a cap with its brim, the near arm bent
  // to the rod, the rod tapering and bowed, the line out to the water (wy).
  // Returns the shapes to fill (fig, rod) and the line.
  function bankFigure(px, py, s, dir, o) {
    o = o || {};
    var hip = [px, py - 7.4 * s], sh = [px + dir * 0.4 * s, py - 13 * s], hd = [px + dir * 0.6 * s, py - 15.5 * s];
    var legs = poly([[px - 2.4 * s, py], [px - 1.7 * s, py - 7.8 * s], [px + 1.7 * s, py - 7.8 * s], [px + 2.4 * s, py], [px + 0.9 * s, py], [px + 0.1 * s, py - 4.2 * s], [px - 0.8 * s, py]]);
    var torso = poly([[hip[0] - 2 * s, hip[1] + 0.6 * s], [sh[0] - 2.6 * s, sh[1] + 1.2 * s], [sh[0] - 1.4 * s, sh[1] - 0.5 * s], [sh[0] + 1.4 * s, sh[1] - 0.5 * s], [sh[0] + 2.6 * s, sh[1] + 1.2 * s], [hip[0] + 2 * s, hip[1] + 0.6 * s]]);
    var head = [], i;
    for (i = 0; i < 10; i++) { var a = (i / 10) * Math.PI * 2; head.push([hd[0] + Math.cos(a) * 1.75 * s, hd[1] + Math.sin(a) * 1.9 * s]); }
    var cap = poly([[hd[0] - 1.9 * s, hd[1] - 0.6 * s], [hd[0] - 1.6 * s, hd[1] - 2 * s], [hd[0] + 1.6 * s, hd[1] - 2 * s], [hd[0] + 1.9 * s, hd[1] - 0.6 * s], [hd[0] + dir * 3.6 * s, hd[1] - 0.4 * s], [hd[0] + dir * 3.4 * s, hd[1] + 0.2 * s]]);
    var hand = [px + dir * 3.4 * s, py - 10.2 * s];
    var arm = poly([[sh[0] + dir * 1.8 * s, sh[1] + 0.2 * s], [px + dir * 3.2 * s, py - 11.8 * s], [hand[0] + dir * 0.4 * s, hand[1] - 0.6 * s], [hand[0], hand[1] + 0.7 * s], [px + dir * 2.4 * s, py - 10.8 * s], [sh[0] + dir * 1.2 * s, sh[1] + 2 * s]]);
    var out = { fig: legs + torso + poly(head) + cap + arm, rod: "", line: "" };
    if (o.noRod) return out;
    var ang = o.ang == null ? 0.95 : o.ang, L = (o.len || 26) * s, tip = [hand[0] + dir * Math.cos(ang) * L, hand[1] - Math.sin(ang) * L], butt = [hand[0] - dir * Math.cos(ang) * 4 * s, hand[1] + Math.sin(ang) * 4 * s];
    out.rod = taperRod(butt, tip, 0.08, 0.9 * s, 0.18);
    var wy = o.wy == null ? py - 3 : o.wy, ox = o.out == null ? L * 0.8 : o.out * s;
    out.line = "M" + n(tip[0]) + " " + n(tip[1]) + "Q" + n(tip[0] + dir * ox * 0.5) + " " + n(tip[1] + (wy - tip[1]) * 0.25) + " " + n(tip[0] + dir * ox) + " " + n(wy);
    return out;
  }
  // A low bank no source describes: a pale far rise behind, then the bank
  // itself, both with soft rolling tops and no tree tips. Shaped like a
  // headland (land, base, maxH) so it reflects the same way.
  function softBank(seed, base, h) {
    var nz = noise(seed), nz2 = noise(seed + 5), top = [], back = [], x;
    for (x = -8; x <= W + 8; x += 6) {
      top.push([x, base - h * (0.55 + 0.45 * nz(x * 0.011)) - h * 0.18 * (nz2(x * 0.05) - 0.5)]);
      back.push([x, base - 1 - h * (0.9 + 0.7 * nz2(x * 0.007 + 3))]);
    }
    var land = poly([[-8, base + 0.6]].concat(top, [[W + 8, base + 0.6]])), bk = poly([[-8, base]].concat(back, [[W + 8, base]]));
    return { base: function () { return base; }, land: land, back: bk, trees: "", maxH: h * 1.6, glass: { base: function () { return base; }, maxH: h * 1.6, land: land, trees: "" } };
  }

  // ---- a river from a spot -------------------------------------------------------------------
  // o.river:
  //   flow     "right" or "left": the way the water runs past you
  //   far      { kind: "cottonwood", "mixed" or "plain", h }: the far bank
  //   valley   steep forested walls rising behind the far bank
  //   bar      the gravel and sand you stand on (how much shows: the level)
  //   trunk    "right": a big tree on your bank framing the picture
  //   creek    { x }: a creek pouring in from your bank, and its eddy
  //   cobble   [x0, x1]: a low cobble edge out in the river
  //   steps    concrete platforms stepping down to the water (the level
  //            covers the lowest), rods: plunkers' rods up the bank to the left
  //   weir     a hatchery outlet weir pouring in at your left, crowd: anglers
  // Your own light, after dark, where a card puts no lamp: you are there by
  // a headlamp or a lantern (a river or a lake is fished from first light,
  // a crab float into the night, and a kayak carries its white light). Its
  // beam reaches out from you, a warm pool where it lands (x, y, rx, ry on
  // the picture) and gold in the ripples there. It is the only light such a
  // picture claims, and it is off by day (.w-lampson). gid: the defs with
  // the lamp's gradient; beam: also its faint cone (off unless asked: a
  // straight-edged beam reads as a slab).
  function ownLight(gid, seed, x, y, rx, ry, beam) {
    var hs = rnd(seed), hg = "", k;
    for (k = 0; k < (TILE ? 14 : 46); k++) {
      var hu = Math.sqrt(hs()), ha = hs() * Math.PI * 2, hgx = x + Math.cos(ha) * hu * rx, hgy = y + Math.sin(ha) * hu * ry, hgl = (4 + hs() * 12) * (1 - hu * 0.5) * (rx / 96);
      hg += '<rect x="' + n(hgx - hgl / 2) + '" y="' + n(hgy) + '" width="' + n(hgl) + '" height="' + n(0.7 + (1 - hu) * 0.9) + '" rx=".5" opacity="' + n((1 - hu) * 0.85 + 0.15) + '"/>';
    }
    return '<g class="w-lampson w-ownlamp">' + (beam ? '<path class="w-cone" d="' + poly([[x - 26, H + 4], [x - rx * 0.9, y + 1], [x + rx * 0.9, y - 1], [x + 30, H + 4]]) + '"/>' : "") +
      '<ellipse class="w-pool w-ownpool" cx="' + n(x) + '" cy="' + n(y) + '" rx="' + n(rx * 1.15) + '" ry="' + n(ry * 1.4) + '" fill="url(#' + gid + '-lamp)"/><g class="w-poolg">' + hg + "</g></g>";
  }
  // ---- the night at a spot ------------------------------------------------------------------
  // Every spot on a card is within reach of a town, and most close after
  // dark, so nobody's own lamp is there: the night is the sky's. The towns'
  // light lies on the low cloud along the skyline, warm, high enough to read
  // over the far trees, and on the water under it as a soft sheen broken by
  // the ripples into faint warm glints. A moon in the picture or just off a
  // side (and more than a sliver) lays silver on its side of the water
  // instead: a broad sheen and the ripples sparkling there; scene.css rims
  // the near things on that side (data-moonlit). Off by day (scene.css).
  function moonlit(o, t) {
    if (!o || o.facing == null || t.moon < 0.3) return "";
    var m = moonOf(o, t);
    return m.pos === "side" || m.pos === "ahead" ? (m.x < W / 2 ? "left" : "right") : "";
  }
  function townX(sd) { return W / 2 + ((sd % 9) - 4) * 18; }
  function nightSky(id, sd, tx) {
    var r = rnd(sd + 401), cx = tx != null ? tx : townX(sd), cl = "", k;
    for (k = 0; k < 6; k++) {
      var cy = HZ - 12 - r() * 34, near = 1 - (HZ - cy) / 56;
      cl += '<ellipse cx="' + n(cx + (r() - 0.5) * 340) + '" cy="' + n(cy) + '" rx="' + n(60 + r() * 120) + '" ry="' + n(2.2 + r() * 3.6) + '" opacity="' + n((0.3 + r() * 0.4) * near) + '"/>';
    }
    return '<g class="w-townsky"><ellipse cx="' + n(cx) + '" cy="' + (HZ - 10) + '" rx="340" ry="50" fill="url(#' + id + '-lamp)"/>' +
      '<g class="w-townc" filter="url(#' + id + '-b5)">' + cl + "</g></g>";
  }
  // y0, y1: the water you see, from the far shore's foot to the card's edge
  function nightWater(gid, sd, o, t, y0, y1, tx) {
    var r = rnd(sd + 403), cx = tx != null ? tx : townX(sd), h = y1 - y0, fl = "", k, side = moonlit(o, t);
    for (k = 0; k < (TILE ? 22 : 80); k++) {
      var u = r(), x = cx + (r() - 0.5) * 440 * (0.45 + u * 0.55), y = y0 + 1.5 + Math.pow(u, 1.3) * (h + 6), l = (2.5 + r() * 9) * (0.5 + u), a = (1 - Math.abs(x - cx) / 240) * (0.3 + r() * 0.55);
      if (a > 0.06) fl += '<rect x="' + n(x - l / 2) + '" y="' + n(y) + '" width="' + n(l) + '" height="' + n(0.5 + u * 0.7) + '" rx=".4" opacity="' + n(a) + '"/>';
    }
    var s = '<g class="w-townwater"><ellipse cx="' + n(cx) + '" cy="' + n(y0 + h * 0.3) + '" rx="260" ry="' + n(h * 0.6) + '" fill="url(#' + gid + '-lamp)" opacity=".42"/><g class="w-townfl">' + fl + "</g></g>";
    if (side) {
      var mx = side === "left" ? 40 : W - 40, sp = "", rm = rnd(sd + 405);
      for (k = 0; k < (TILE ? 30 : 110); k++) {
        var v = rm(), dx = Math.pow(rm(), 1.6) * 300, x2 = side === "left" ? mx - 40 + dx : mx + 40 - dx, y2 = y0 + 1 + Math.pow(v, 1.2) * (h + 8), l2 = (1.5 + rm() * 7) * (0.5 + v), a2 = (1 - dx / 320) * (0.35 + rm() * 0.65) * t.moon;
        if (a2 > 0.08) sp += '<rect x="' + n(x2 - l2 / 2) + '" y="' + n(y2) + '" width="' + n(l2) + '" height="' + n(0.45 + v * 0.6) + '" rx=".3" opacity="' + n(a2) + '"/>';
      }
      s += '<g class="w-moonwater"><ellipse cx="' + n(mx) + '" cy="' + n(y0 + h * 0.4) + '" rx="230" ry="' + n(h * 0.7) + '" fill="url(#' + gid + '-glow)" opacity="' + n(0.3 + t.moon * 0.4) + '"/><g class="w-moonfl">' + sp + "</g></g>";
    }
    return s;
  }
  // A far bank's foot is never a ruled line: brush and sweepers hang over
  // the water in clumps of their own sizes (their feet dipping in), the
  // bank's strip of beach shows only in short pieces between them, and the
  // bank's copy in the water is broken by the ripples into pieces (a mask of
  // thin gaps across it), never a clean mirror. foot(x): where the bank meets
  // the water. Returns the brush, the strip and the mask's def (id).
  function farFoot(id, seed, foot, x0, x1) {
    var r = rnd(seed), brush = "", strip = "", x = x0, gaps = "";
    while (x < x1) {
      var w = 3 + r() * 16, hh = 0.8 + r() * r() * 4.2, dip = 0.3 + r() * 1.5, pts = [], j;
      for (j = 0; j <= 6; j++) { var u = j / 6, xx = x + u * w; pts.push([xx, foot(xx) - hh * Math.pow(Math.sin(u * Math.PI), 0.7) * (0.75 + r() * 0.4)]); }
      pts.push([x + w, foot(x + w) + dip * 0.5], [x + w * 0.5, foot(x + w * 0.5) + dip], [x, foot(x) + dip * 0.4]);
      if (r() < 0.82) brush += poly(pts);
      x += w * (0.55 + r() * 0.7);
    }
    for (x = x0 + r() * 24; x < x1; x += 18 + r() * 52) {
      var l = 5 + r() * 24, e = Math.min(x1, x + l);
      strip += "M" + n(x) + " " + n(foot(x) + 0.7 + r() * 0.6) + "L" + n(e) + " " + n(foot(e) + 0.7 + r() * 0.6);
    }
    var m = '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="-10" y="0" width="' + (W + 20) + '" height="' + H + '"><rect x="-10" width="' + (W + 20) + '" height="' + H + '" fill="#fff"/><g stroke="#000" stroke-linecap="round">';
    for (var k = 0; k < 46; k++) {
      var gy = foot(195) + 2.2 + k * (0.7 + k * 0.035) + r() * 1.2, gx = r() * W - 40, gl = 30 + r() * 170;
      gaps += '<path d="M' + n(gx) + " " + n(gy) + "h" + n(gl) + '" stroke-width="' + n(0.45 + r() * (0.5 + k * 0.03)) + '"/>';
    }
    return { brush: brush, strip: strip, def: m + gaps + "</g></mask>" };
  }
  // ---- a reach of river, seen a little upstream (rv.reach) ---------------------------------
  // The approved river's build, laid on a spot's own facts. Your own bank
  // runs away upstream at one side (rch.side): its waterline climbs from the
  // card's edge to meet the far bank's foot where the reach ends (rch.meet),
  // its trees growing smaller as they go and a dark brush mass at their
  // feet, so the two banks close in on the water's far end. The sky over that
  // gap lies on the water as a pale road broken by the ripples (whatever
  // side the sun is on: the river reflects the open sky between the banks),
  // and after dark the towns' glow lies there instead. rch.near: "grove"
  // (bare cottonwoods, the Narrows) or "mixed" (a generic mix of firs and
  // bare broadleaf, rch.mix firs). No crown climbs behind the title or its
  // chips (CAPY below x 362); right of them the nearest trees stand tall.
  // Returns the parts for mid (the road on the water) and front (the bank),
  // and nb(x) on the picture: where your bank meets the water.
  function reachNear(id, sd, rch, footF, isBare, lvl) {
    var R = rch.side !== "left", X = function (xr) { return R ? xr : W - xr; }, xs = rch.meet || 226, wob = noise(sd + 53), r = rnd(sd + 57), k;
    var nu = function (xr) { return Math.max(0, xr - xs) / (W - xs); };
    var nbR = function (xr) { var u = nu(xr); return footF(X(xr)) + 2.2 + 64 * Math.pow(u, 1.25) + (wob(xr * 0.075) - 0.5) * 7 * Math.min(1, u * 3) + (lvl - 0.35) * 4 * u; };
    // cap(x): the highest a crown may reach at x; capW(x, hw): over a crown
    // hw wide either side of x (a crown that reaches back over the chips is
    // held under them); fitCap: how far to shrink drawn limbs so every point
    // of them stays under the cap where it lies
    var CAPY = 154, cap = function (x) { return x > 364 || x < 6 ? 112 : CAPY; }, capW = function (x, hw) { return Math.max(cap(x - hw), cap(x + hw), cap(x)); };
    var fitCap = function (d, foot) { var nums = d.match(/-?\d+(?:\.\d+)?/g) || [], f = 1, i; for (i = 0; i + 1 < nums.length; i += 2) { var py = +nums[i + 1], c = cap(+nums[i]); if (py < c && foot - py > 0.5) f = Math.min(f, (foot - c) / (foot - py)); } return f; };
    var trees = "", twigs = "", twigsN = "", firs = "", xr = xs + 1;
    while (xr < W + 36) {
      var u = nu(xr), x = X(xr), foot = nbR(xr) - 0.6, hm = (5 + 98 * Math.pow(u, 1.2)) * (0.62 + r() * 0.5), lim = (foot - capW(x, hm * 0.45)) / 1.2;
      if (hm > lim) { hm = lim * (0.84 + r() * 0.16); lim = (foot - capW(x, hm * 0.45)) / 1.2; if (hm > lim) hm = lim * 0.95; }
      if (hm > 3) {
        if (rch.near === "mixed" && r() < (rch.mix == null ? 0.55 : rch.mix)) firs += conifer(r, x, foot, hm * 1.16, { full: 0.19 + r() * 0.07 });
        else if (rch.near === "grove" && isBare && u > 0.5) {
          // the nearest of the grove: limb by limb, its twigs fine at the ends,
          // fitted under the cap by its own measured top
          var bt0, k0, h0 = hm * 1.05;
          for (k0 = 0; k0 < 4; k0++) { bt0 = bigTree(rnd(sd + 71 + Math.round(xr)), x, foot, h0, true, 0.62); var f0 = fitCap(bt0.wood + bt0.twig, foot); if (f0 >= 0.995) break; h0 *= f0 * 0.97; }
          trees += bt0.wood; twigsN += bt0.twig;
          xr += Math.max(2, h0 * (0.12 + r() * 0.08));
          continue;
        }
        else { var b = broadleaf(r, x, foot, hm, { bare: isBare, vase: rch.near === "grove", wide: rch.near === "grove" ? 0.3 + r() * 0.08 : null }); if (isBare) { if (u > 0.42) twigsN += b.crown; else twigs += b.crown; } else trees += b.crown; trees += b.trunk; }
      }
      xr += Math.max(1.5, hm * (rch.near === "grove" ? 0.07 + r() * 0.08 : 0.12 + r() * 0.13));
    }
    // the nearest of a bare grove, at the frame's edge right of the chips:
    // two tall trunks, narrow-crowned, standing up past the chips' line (the
    // approved river's tall near trees there), still fitted point by point
    // (each leans a little out past the frame, so its crown stays clear of the
    // chips' side; the lean is drawn into its points, then fitted)
    var lean = function (d, cx, cy, a) { var c = Math.cos(a), sn = Math.sin(a); return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, function (m0, px, py) { var dx = px - cx, dy = py - cy; return n(cx + dx * c - dy * sn) + " " + n(cy + dx * sn + dy * c); }); };
    // what of them would reach back over the chips' side fades out above
    // the chips' line (a mask), so only their trunks and right-hand limbs
    // stand tall there
    var tallW = "", tallT = "", tallM = "";
    if (rch.near === "grove" && isBare && !TILE) {
      [[R ? 378 : 12, 1.0, 6], [R ? 396 : -6, 1.16, 10]].forEach(function (tq, ti) {
        var xr2 = R ? tq[0] : W - tq[0], foot2 = nbR(xr2) - 0.6, h2 = (foot2 - 104) * tq[1], a2 = (R ? 1 : -1) * tq[2] * Math.PI / 180, bt2 = bigTree(rnd(sd + 75 + ti * 7), tq[0], foot2, h2, true, 0.36);
        tallW += lean(bt2.wood, tq[0], foot2, a2); tallT += lean(bt2.twig, tq[0], foot2, a2);
      });
      var mx0 = R ? -40 : W - 366, mw = 406;
      tallM = '<linearGradient id="' + id + 'f-tallg" gradientUnits="userSpaceOnUse" x1="0" y1="' + (CAPY - 8) + '" x2="0" y2="' + (CAPY + 2) + '"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
        '<mask id="' + id + 'f-tall" maskUnits="userSpaceOnUse" x="-60" y="0" width="' + (W + 120) + '" height="' + H + '"><rect x="-60" width="' + (W + 120) + '" height="' + H + '" fill="#fff"/><rect x="' + mx0 + '" width="' + mw + '" height="' + (CAPY + 2) + '" fill="url(#' + id + 'f-tallg)"/></mask>';
    }
    // a bare grove's crowns, massed: one lace of twigs over the stand, its
    // top the trees' own heights (smoothed), broken into fine twig tips, a
    // little darker toward you; the trunks and limbs stand dark in front of it
    var lace = "";
    if (rch.near === "grove" && isBare) {
      var env = [], tp = rnd(sd + 61), lx;
      for (lx = xs + 2; lx <= W + 14; lx += 1.3) {
        var lu = nu(lx), lf = nbR(lx), lh = (5 + 98 * Math.pow(lu, 1.2)) * 0.92, lc = cap(X(lx));
        if (lf - lh * 1.05 < lc) lh = (lf - lc) / 1.05;
        env.push([lx, lf - lh * (0.8 + 0.18 * wob(lx * 0.045 + 7) + 0.1 * wob(lx * 0.17 + 3))]);
      }
      var top = [], bot = [];
      env.forEach(function (q, i) {
        var y = q[1] + tp() * 1.6, spike = tp() < 0.34 ? (1.5 + tp() * 4.5) * (0.4 + nu(q[0])) : 0;
        top.push([X(q[0]), y - spike]);
        if (spike) top.push([X(q[0] + 0.45), y + 0.4]);
        if (i % 3 === 0) bot.unshift([X(q[0]), nbR(q[0]) + 0.8]);
      });
      lace = poly(top.concat(bot));
    }
    // the brush at their feet: a dark ragged mass, taller toward you (in a
    // bare grove the thicket under the trees carries the mass in winter)
    var bt = [], bb = [], bh = rch.near === "grove" ? 30 : 17;
    for (xr = xs - 2; xr <= W + 14; xr += 3) { var u2 = nu(xr); bt.push([X(xr), nbR(xr) - (1.5 + u2 * bh) * (0.55 + r() * 0.6)]); bb.unshift([X(xr), nbR(xr) + 0.8]); }
    var brush = poly(bt.concat(bb));
    // the bank's own strip of ground under them, on the waterline (what is
    // nearer you than that line is the water between you and that bank)
    var lt = [], lb = [];
    for (xr = xs - 4; xr <= W + 14; xr += 5) { lt.push([X(xr), nbR(xr) - 1.4]); lb.unshift([X(xr), nbR(xr) + 0.8]); }
    var landP = poly(lt.concat(lb));
    // the bank's own dark in the water, broken sideways by the ripples
    var st = [], sb = [];
    for (xr = xs; xr <= W + 8; xr += 8) { var u3 = nu(xr); st.push([X(xr), nbR(xr) - 1]); sb.unshift([X(xr - 4 - u3 * 12), nbR(xr) + 5 + u3 * 28]); }
    var edge = [];
    for (xr = xs + 2; xr <= W + 6; xr += 6) edge.push([X(xr), nbR(xr) + 0.7]);
    // stones along its foot (a cobble bank) or a thin lip of mud and grass
    var stones = "";
    if (rch.cobble) for (xr = xs + 10; xr < W + 2; xr += 8 + r() * 13) {
      var u4 = nu(xr), rw = (2 + r() * 4) * (0.5 + u4), rh = rw * (0.45 + r() * 0.25), by = nbR(xr) + 1.2, x4 = X(xr);
      stones += '<path class="w-rock" d="' + poly([[x4 - rw, by], [x4 - rw * 0.7, by - rh * 0.8], [x4 - rw * 0.1, by - rh], [x4 + rw * 0.6, by - rh * 0.7], [x4 + rw, by]]) + '"/>' +
        '<path class="w-rock-l" d="M' + n(x4 - rw * 0.7) + " " + n(by - rh * 0.8) + "L" + n(x4 - rw * 0.1) + " " + n(by - rh) + '"/>';
    }
    var front = '<g filter="url(#' + id + 'f-wv)"><path class="w-under" d="' + poly(st.concat(sb)) + '" filter="url(#' + id + 'f-b2)"/></g>' +
      '<g class="w-reach" data-reach="' + (rch.near || "mixed") + '"><path class="w-l5" d="' + landP + '"/>' +
      '<path class="w-moonrim" d="' + trees + firs + '"/><path class="w-rim" d="' + trees + firs + '"/>' +
      (lace ? '<path class="w-moonrim" d="' + lace + '"/><path class="w-rim w-lacerim" d="' + lace + '"/><path class="w-grovelace" d="' + lace + '"/>' :
        '<g class="w-l4" data-fit="1">' + (twigs ? '<path class="w-haze" d="' + twigs + '"/>' : "") + "</g>" + (twigsN ? '<g class="w-l5" data-fit="1"><path class="w-haze" d="' + twigsN + '"/></g>' : "")) +
      '<g class="w-l5" data-fit="1"><path d="' + trees + '"/><path d="' + firs + '"/>' + (lace && twigsN ? '<path class="w-twig" d="' + twigsN + '"/>' : "") + "</g>" +
      (tallW ? '<g class="w-reachtall" mask="url(#' + id + 'f-tall)"><path class="w-rim" d="' + tallW + '"/><g class="w-l5"><path d="' + tallW + '"/><path class="w-twig" d="' + tallT + '"/></g></g>' : "") +
      '<path class="w-l5" d="' + brush + '"/>' +
      '<path class="w-beach w-reachlip" d="' + line(edge) + '"/>' + stones + "</g>";
    // the sky over the gap where the banks meet, on the water: a pale road
    // under it, widening toward you and broken into strokes by the ripples
    var gx = X(xs - 20), y0 = footF(gx) + 1.2, rg = rnd(sd + 59), gs = "";
    for (k = 0; k < (TILE ? 22 : 90); k++) {
      var v = Math.pow(rg(), 1.15), y = y0 + 1 + v * 62, sp = 4 + v * 30, l = (2.6 + v * 20) * (0.4 + rg() * 0.8), x5 = gx + gauss(rg) * sp - l / 2;
      gs += '<path d="M' + n(x5) + " " + n(y) + "h" + n(l) + '" stroke-width="' + n(0.6 + v * 1.3) + '" opacity="' + n(0.3 + rg() * 0.7) + '"/>';
    }
    var mid = '<ellipse class="w-gapsh" cx="' + n(gx) + '" cy="' + n(y0 + 22) + '" rx="' + (TILE ? 40 : 46) + '" ry="30" fill="url(#' + id + 'm-glow)"/>' +
      '<g class="w-townwater"><ellipse cx="' + n(gx) + '" cy="' + n(y0 + 16) + '" rx="70" ry="34" fill="url(#' + id + 'm-lamp)" opacity=".7"/></g>' +
      '<g class="w-gaprd">' + gs + "</g>";
    return { mid: mid, front: front, defs: tallM, nb: function (x) { return nbR(R ? x : W - x); }, gap: gx };
  }
  function riverSpot(id, o) {
    var t = today(o), V = lens(o), sd = idSeed(o.spot), r = rnd(sd + 91), rv = o.river || {}, lvl = t.river, RY = rv.y || 198, k, x;
    var isBare = bare(t.date), dir = rv.flow === "left" ? -1 : rv.flow === "along" ? 0 : 1, far = rv.far || { kind: "mixed" };
    // the water's colour: low, clear and dark with the bank's own dark in
    // it; high, up and coloured with silt (the palette's own sand and ridge
    // tones, never the sky's). A glacial river is milky green-grey even when
    // low, and goes brown and thick as it rises.
    // (the silt is warm, a brown with gold in it, under a grey sky too)
    var SILT = "color-mix(in oklab,color-mix(in oklab,var(--r2) 78%,var(--gold)) 52%,var(--bg))", GLAC = "color-mix(in oklab,var(--hz) 68%,var(--r2))";
    var clear = Math.round((1 - lvl) * (rv.glacial ? 14 : 40)), milk = Math.round(rv.glacial ? 22 + lvl * 34 : Math.pow(lvl, 1.4) * 56);
    var mc = rv.glacial ? "color-mix(in oklab," + GLAC + " " + Math.round((1 - lvl) * 100) + "%," + SILT + ")" : SILT;
    function wc(v) { return "color-mix(in oklab,color-mix(in oklab," + v + ",var(--shore) " + clear + "%)," + mc + " " + milk + "%)"; }
    var wdef = '<linearGradient id="' + id + '-rw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + wc("var(--water1)") + '"/><stop offset="1" style="stop-color:' + wc("var(--water2)") + '"/></linearGradient>';
    // the sky ends at the horizon and the water starts at the far bank's
    // foot: the band between is the horizon's own haze (behind the far
    // trees), never the top of the sky showing through them
    var back = defs(id, wdef) + skyLayer(id, { seed: sd + 500, town: 1 }) + '<rect class="w-hzband" y="' + (HZ - 2) + '" width="' + W + '" height="' + (RY - HZ + 4) + '"/>' + nightSky(id, sd);
    if (rv.valley) {
      var v1 = headland({ seed: sd + 7, from: -60, to: 230, base: RY - 4, h: 74, tree: 2.6, gap: 2.1, shape: 1.5, freq: 0.012, tipFade: 3 });
      var v2 = headland({ seed: sd + 8, from: 460, to: 150, base: RY - 3, h: 88, tree: 3.2, gap: 2.2, shape: 1.7, freq: 0.011, tipFade: 3 });
      back += '<path class="w-l0" d="' + v1.land + '"/>' + mist(id, sd + 81, RY - 30, 1.6) + '<path class="w-l1" d="' + v2.land + '"/>' + mist(id, sd + 82, RY - 12, 1.3);
    }
    // a low wooded ridge on the far skyline, rv.ridge degrees high
    if (rv.ridge) back += '<path class="w-l1" d="' + ridgeLine(sd + 9, -10, W + 10, RY - 3, rv.ridge * V.ud + (RY - HZ) - 6) + '"/>' + mist(id, sd + 84, RY - 10, 1.2);
    // fields on both banks (128th St E): flat open ground, a hedge here and there
    if (rv.fields) {
      var fr = rnd(sd + 87), fld = "";
      back += '<path class="w-l1" d="' + poly([[-6, RY - 6], [396, RY - 7], [396, RY], [-6, RY]]) + '"/>';
    }
    // rv.reach: the approved river's build (see reachNear): you look a little
    // upstream, so the far bank's foot climbs gently toward the reach's far end
    var rch = rv.reach, rR = rch && rch.side !== "left", rise = rch ? (rch.rise == null ? 7 : rch.rise) : 0;
    var reachFoot = rch ? function (x) { var u = clamp(x / W, 0, 1); return RY - rise * (rR ? u : 1 - u); } : null;
    var cv = rv.converge || 0, wtop = rch ? poly([[-6, H + 4]].concat([-6, 0, 0.25, 0.5, 0.75, 1].map(function (u) { var xx = u < 0 ? -6 : u * W; return [xx, reachFoot(xx) - 2]; }), [[W + 6, reachFoot(W) - 2], [W + 6, H + 4]])) :
      cv ? poly([[-6, H + 4]].concat([0, 0.25, 0.5, 0.75, 1].map(function (u) { var xx = u * W; return [xx, RY - 2 - cv * (dir < 0 ? 1 - u : u)]; }), [[W + 6, RY - 2 - cv * (dir < 0 ? 0 : 1)], [W + 6, H + 4]])) : "";
    cv = cv || (rch ? rise : 0);
    back += (cv ? '<path d="' + wtop + '" fill="url(#' + id + '-rw)"/>' : '<rect y="' + (RY - 2) + '" width="' + W + '" height="' + (H - RY + 2) + '" fill="url(#' + id + '-rw)"/>') +
      '<rect y="' + (RY - 2) + '" width="' + W + '" height="40" fill="url(#' + id + '-hzr)"/>' +
      '<g class="w-lightx"><ellipse cx="0" cy="' + (RY - 2) + '" rx="58" ry="' + (H - RY) + '" fill="url(#' + id + '-glow)" class="w-road"/></g>';
    // the far bank
    var fb, mdef = "", mid = "";
    if (rv.fields) far = { kind: "plain", h: 2.2, tree: 1.4 };
    // a far bank no source describes: a low soft bank, its top rolling and
    // untextured (no tree tips, no kind of tree claimed), under the card's h
    var farBase = rch ? reachFoot : rv.converge ? function (x) { return RY - rv.converge * (1 - x / W) * (dir < 0 ? 1 : 0) - rv.converge * (x / W) * (dir > 0 ? 1 : 0); } : RY;
    // (a reach: the far bank's trees smaller toward its far end)
    var farGrow = rch ? function (x) { var u = clamp(x / W, 0, 1); return rR ? 1.1 - 0.44 * u : 0.66 + 0.44 * u; } : rv.converge ? function (x) { var u = x / W; return dir < 0 ? 0.62 + 0.5 * u : 1.12 - 0.5 * u; } : null;
    if (far.kind === "plain") fb = softBank(sd + 31, RY, (far.h || 5) * 0.7 + (far.tree || 6) * 0.45);
    else fb = wall({ seed: sd + 31, x0: -24, x1: 414, base: farBase, h: far.h || 44, mix: far.kind === "cottonwood" ? 0.05 : far.mix || 0.4, bare: isBare, vase: far.kind === "cottonwood", land: 2.4, freq: 0.022,
      grow: farGrow });
    // a reach: the far bank's woods go back in depth, a paler stand behind
    // the first, with the haze between (still the card's low wooded bank)
    if (rch && far.kind !== "plain") {
      var fbB = wall({ seed: sd + 39, x0: -24, x1: 414, base: function (x) { return farBase(x) - 2.4; }, h: (far.h || 44) * 1.24, mix: far.mix || 0.3, bare: isBare, land: 1.2, freq: 0.016, grow: farGrow });
      back += paintWall(fbB, "w-l1") + mist(id, sd + 85, RY - 6, 1.1);
    }
    if (far.kind === "cottonwood") {
      var fb2 = wall({ seed: sd + 37, x0: -24, x1: 414, base: RY - 3, h: (far.h || 44) * 1.18, mix: 0.04, bare: isBare, vase: true, land: 1.5, freq: 0.016 });
      back += paintWall(fb2, "w-l1");
    }
    // a far bank that runs away into the picture (rv.converge) has its foot
    // sloping across it: its copy in the water and its strip of beach lie
    // along that foot, never along a level line through its trunks
    var rf = reflect(id, "b", fb.glass || fb, rv.converge || rch ? 0.62 : 0.5, "w-l3", !!(rv.converge || rch)), fbx = typeof farBase === "function" ? farBase : function () { return RY; };
    var ff = farFoot(id + "m-ff", sd + 33, fbx, -10, W + 10);
    mdef += rf.def + ff.def;
    // a far bank that runs away (rv.converge) is nearest you upstream: there
    // it stands a step darker, as near things do
    var nearEnd = "";
    if (rv.converge && far.kind !== "plain") {
      var nx0 = dir < 0 ? W * 0.4 : W * 0.6, nx1 = dir < 0 ? W + 10 : -10;
      mdef += '<linearGradient id="' + id + 'm-neg" gradientUnits="userSpaceOnUse" x1="' + n(nx0) + '" y1="0" x2="' + n(nx1) + '" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
        '<mask id="' + id + 'm-nem" maskUnits="userSpaceOnUse" x="-30" y="0" width="' + (W + 60) + '" height="' + H + '"><rect x="-30" width="' + (W + 60) + '" height="' + H + '" fill="url(#' + id + 'm-neg)"/></mask>';
      nearEnd = '<g mask="url(#' + id + 'm-nem)" opacity=".85">' + paintWall(fb, "w-l5") + "</g>";
    }
    mid += '<g opacity="' + n(Math.max(0, 1 - lvl)) + '" mask="url(#' + id + 'm-ff)">' + rf.svg + "</g>" + nightWater(id + "m", sd, o, t, RY, RY + 36) +
      (far.kind === "plain" ? '<path class="w-l2" d="' + fb.back + '"/><path class="w-l3" d="' + fb.land + '"/>' : '<path class="w-moonrim" d="' + fb.trees + '"/>' + paintWall(fb, "w-l3") + (fb.firs ? '<path class="w-l4" d="' + fb.firs + '"/>' : "") + nearEnd) +
      '<path class="w-l3" d="' + ff.brush + '"/><g class="w-beachb"><path class="w-beach" d="' + ff.strip + '"/></g>' + mist(id + "m", sd + 83, RY + 3, 0.45);
    var RN = rch ? reachNear(id, sd, rch, fbx, isBare, lvl) : null;
    if (RN) mid += RN.mid;
    // cottonwoods at the water's edge: pale trunks leaning out, in winter bare
    if (far.kind === "cottonwood") {
      var al = "", ar = rnd(sd + 71);
      for (k = 0; k < 9; k++) {
        var ax = 20 + k * 41 + (ar() - 0.5) * 22, ah = 26 + ar() * 20, alean = (ar() - 0.4) * 9, ad = "M" + n(ax) + " " + (RY + 0.5) + "Q" + n(ax + alean * 0.2) + " " + n(RY - ah * 0.55) + " " + n(ax + alean) + " " + n(RY - ah);
        al += '<path d="' + ad + '" stroke-width="' + n(1.2 + ah * 0.03) + '"/>';
        for (var q2 = 0; q2 < 6; q2++) {
          var f2 = 0.32 + q2 * 0.11 + ar() * 0.05, bx2 = ax + alean * f2 * f2, by2 = RY - ah * f2, d2 = q2 % 2 ? 1 : -1, bl2 = ah * (0.36 - q2 * 0.035) * (0.7 + ar() * 0.6);
          al += '<path d="M' + n(bx2) + " " + n(by2) + "Q" + n(bx2 + d2 * bl2 * 0.5) + " " + n(by2 - bl2 * 0.25) + " " + n(bx2 + d2 * bl2 * 0.8) + " " + n(by2 - bl2 * 0.85) + '" stroke-width="' + n(0.5 + (1 - f2) * 0.6) + '"/>';
        }
      }
      mid += '<g class="w-alder">' + al + "</g>";
    }
    // the river moving: riffles that crowd and lengthen as it rises, each a
    // little dragged the way the water runs (straight away from you when you
    // look along it, with no side to it)
    var rf2 = "", VPx = W / 2 + 8;
    for (k = 0; k < 40 + lvl * 60; k++) {
      var ry = RY + 4 + r() * r() * (40 + lvl * 20), rx = r() * W, rl = (2 + r() * 7 + (ry - RY) * 0.3) * (0.8 + lvl * 0.7), op = n(0.3 + r() * 0.6);
      if (dir) rf2 += '<path d="M' + n(rx) + " " + n(ry) + "q" + n((dir * rl) / 2) + " " + n(-0.6 - r() * 0.6) + " " + n(dir * rl) + " " + n(0.3 + lvl * 0.4) + '" opacity="' + op + '"/>';
      else { var vx2 = VPx - rx, vy2 = RY - ry, vl2 = Math.hypot(vx2, vy2) || 1, l3 = rl * 0.7; rf2 += '<path d="M' + n(rx) + " " + n(ry) + "l" + n((vx2 / vl2) * l3) + " " + n((vy2 / vl2) * l3) + '" opacity="' + op + '"/>'; }
    }
    mid += '<g class="w-riffle">' + rf2 + "</g>";
    // a riffle running over gravel just in front of you: the current drawn as
    // streaks dragged downstream, packed into its band, and short standing
    // waves along it, whiter as the river rises
    if (rv.riffle) {
      var rw = "", rcap = "", rs2 = rnd(sd + 93);
      for (k = 0; k < (TILE ? 34 : 120); k++) {
        var u3 = rs2(), wy0 = RY + 12 + Math.pow(u3, 0.8) * 36, wx0 = rs2() * (W + 60) - 30, wl0 = (8 + rs2() * 34) * (0.45 + (wy0 - RY) / 40), sag = (rs2() - 0.5) * 1.4;
        rw += "M" + n(wx0) + " " + n(wy0) + "q" + n((dir || 1) * wl0 * 0.5) + " " + n(sag) + " " + n((dir || 1) * wl0) + " " + n(sag * 0.5);
      }
      for (k = 0; k < (TILE ? 14 : 44); k++) {
        var cy3 = RY + 22 + rs2() * 20, cx3 = 30 + rs2() * 330, cl3 = 2.5 + rs2() * 5 * (0.6 + (cy3 - RY) / 30);
        rcap += poly([[cx3, cy3], [cx3 + cl3 * 0.4, cy3 - 0.6 - rs2() * 0.7], [cx3 + cl3, cy3 - 0.1], [cx3 + cl3 * 0.5, cy3 + 0.4]]);
      }
      mid += '<path class="w-flowst" d="' + rw + '"/><path class="w-capf" opacity="' + n(0.24 + lvl * 0.45) + '" d="' + rcap + '"/>';
    }
    // high water: the river carries drift, and the bank wears a line of silt
    if (lvl > 0.62) {
      var dr = rnd(sd + 61), drift = "";
      for (k = 0; k < Math.round((lvl - 0.6) * 14); k++) { var dx0 = dr() * W, dy0 = RY + 8 + dr() * dr() * 50, dl = 3 + dr() * 8 * (0.5 + (dy0 - RY) / 40), dt = 0.5 + (dy0 - RY) * 0.02; drift += poly([[dx0, dy0], [dx0 + dl, dy0 - dt * 0.4], [dx0 + dl + 0.8, dy0 + dt * 0.4], [dx0 + 0.6, dy0 + dt]]); }
      mid += '<path class="w-driftw" d="' + drift + '"/>';
    }
    // farm fields (128th St E): flat open ground to the horizon, hedgerows
    // and clumps of trees at their own spacing, a barn and its house together
    if (rv.fields) {
      var fr = rnd(sd + 88), ft = "", hedge = "", clumpAt = [], x9;
      for (x9 = -10; x9 < W + 10; x9 += 26 + fr() * 70) clumpAt.push([x9, 1 + Math.floor(fr() * 4), fr() < 0.35]);
      clumpAt.forEach(function (c) {
        if (c[2]) { for (var hq = 0; hq < 8 + fr() * 14; hq++) { var hx0 = c[0] + hq * 3.2, hh0 = 2 + fr() * 3.2; hedge += "M" + n(hx0 - 1.8) + " " + n(RY - 5.4) + "Q" + n(hx0) + " " + n(RY - 5.4 - hh0 * 2) + " " + n(hx0 + 1.8) + " " + n(RY - 5.4) + "Z"; } return; }
        for (var cq = 0; cq < c[1]; cq++) { var bl = broadleaf(fr, c[0] + cq * (4 + fr() * 5), RY - 5.6, 9 + fr() * 13, { bare: isBare, vase: true, wide: 0.42 }); ft += (isBare ? '<path class="w-haze" d="' + bl.crown + '"/>' : '<path d="' + bl.crown + '"/>') + '<path d="' + bl.trunk + '"/>'; }
      });
      // a barn and its house, and one more house off on its own
      var gx0 = rv.farm == null ? 70 + fr() * 220 : rv.farm, barn = poly([[gx0 - 9, RY - 5.4], [gx0 - 9, RY - 11], [gx0 - 6.5, RY - 14.4], [gx0, RY - 16.6], [gx0 + 6.5, RY - 14.4], [gx0 + 9, RY - 11], [gx0 + 9, RY - 5.4]]);
      mid += '<g class="w-l2">' + ft + '<path d="' + hedge + '"/></g><path class="w-barn" d="' + barn + '"/><path class="w-liteb" d="M' + n(gx0 - 9) + " " + n(RY - 11) + "L" + n(gx0 - 6.5) + " " + n(RY - 14.4) + "L" + n(gx0) + " " + n(RY - 16.6) + '"/>' +
        houses(id + "m", fr, [gx0 + 18, gx0 + 120 + fr() * 60], function () { return RY - 5.4; }, 2.4, RY - 1, true);
    }
    // gravel bars out in a braided river: islands of their own sizes at
    // their own depths, small and thin far off and long near, their ends
    // drawn out downstream toward the far bank, wet dark margins, stones,
    // a stranded log on one; a high river covers them
    if (rv.braid && dir && lvl < 0.92) {
      // gravel islands in rows by depth, all inside the water you can see
      // (above your own bank's edge): small and thin near the far bank, long
      // and thick near you, the channels between them narrowing as they go
      // off toward the far bank
      var gz = 1 - lvl * 0.8, bs = rnd(sd + 95), isl = [], bd = "", bwet = "", bst = "", blit = "", logDone = false;
      var bandB = (rv.levee ? (rv.leveeY || 220) - (1 - lvl) * 15 : RY + 40) - 3, bandH = Math.max(12, bandB - RY);
      // (each of its own length, lying a little across the current, never
      // in even rows: gravel islands, not floes)
      [[0.1, 5, 14, 40, 1.8, 3.4], [0.4, 4, 28, 84, 4, 7.4], [0.78, 2, 110, 190, 8.6, 14]].forEach(function (row, ri) {
        var off = bs() * W / row[1];
        for (k = 0; k < row[1]; k++) {
          var u4 = row[0] + (bs() - 0.3) * 0.16, icy = RY + 2 + u4 * bandH, ilen = (row[2] + bs() * (row[3] - row[2])) * (0.6 + bs() * 0.8), icx = off + (k / row[1]) * (W + 40) - 20 + (bs() - 0.5) * 60, ith = (row[4] + bs() * (row[5] - row[4])) * gz;
          isl.push([icx, icy, ilen, ith, -(0.03 + bs() * 0.07) * dir * (bs() < 0.3 ? -0.6 : 1), 0.3 + ri * 0.35]);
        }
      });
      isl.forEach(function (I) {
        var top = [], bot = [], m2 = 14;
        for (var j = 0; j <= m2; j++) {
          var v = j / m2, xx = I[0] - I[2] / 2 + v * I[2], sk = dir > 0 ? Math.pow(v, 0.8) : 1 - Math.pow(1 - v, 0.8), e = Math.pow(Math.sin(sk * Math.PI), 0.75), yy = I[1] + (xx - I[0]) * I[4];
          top.push([xx + (bs() - 0.5) * I[2] * 0.03, yy - I[3] * 0.6 * e * (0.55 + bs() * 0.75)]); bot.unshift([xx, yy + I[3] * 0.4 * e * (0.7 + bs() * 0.5) + 0.3]);
        }
        bwet += poly(top.map(function (q) { return [q[0], q[1] + 0.5]; }).concat(bot.map(function (q) { return [q[0], q[1] + 1.4 + I[5] * 1.6]; })));
        bd += poly(top.concat(bot));
        // its upstream end wet and dark where the current piles onto it
        var up = dir > 0 ? top.slice(0, 5).concat(bot.slice(-5)) : top.slice(-5).concat(bot.slice(0, 5));
        blit += poly(up);
        for (var bq = 0; bq < (TILE ? 8 : 26) * I[5] + 4; bq++) {
          var v2 = 0.12 + bs() * 0.76, sx = I[0] - I[2] / 2 + v2 * I[2], sy = I[1] + (sx - I[0]) * I[4] + (bs() - 0.4) * I[3] * 0.5 * Math.sin(v2 * Math.PI), sz = 0.4 + bs() * 1.2 * (0.4 + I[5] * 1.4);
          bst += '<path class="' + (bs() < 0.3 ? "w-st-l" : "w-st-d") + '" d="' + stone(bs, sx, sy, sz) + '"/>';
        }
        if (!logDone && I[5] > 0.45 && I[3] > 2) { logDone = true; var lx2 = I[0] - I[2] * 0.2, ly2 = I[1] + (lx2 - I[0]) * I[4] - I[3] * 0.3, ll = I[2] * 0.34;
          bst += '<path class="w-drift" d="' + poly([[lx2, ly2 - 1], [lx2 + ll, ly2 - 2.4 + ll * I[4]], [lx2 + ll + 1.2, ly2 - 0.8 + ll * I[4]], [lx2 + 0.6, ly2 + 0.7]]) + '"/><path class="w-driftr" d="' + poly([[lx2, ly2 - 1], [lx2 - 3.4, ly2 - 3.6], [lx2 - 1.2, ly2], [lx2 - 3.8, ly2 + 1.6], [lx2 + 0.6, ly2 + 0.7]]) + '"/>'; }
      });
      // the channels between them run darker than the open river
      var chD = poly([[-6, RY + 3], [W + 6, RY + 3], [W + 6, bandB + 2], [-6, bandB + 2]]);
      mid += '<path class="w-chandk" d="' + chD + '"/><path class="w-barwet" d="' + bwet + '"/><path class="w-barg" d="' + bd + '"/><path class="w-barup" d="' + blit + '"/>' + bst;
    }
    // where a second river comes in at your right (the White at Sumner): its
    // own water, milkier, in a tongue, and where the two meet a change of
    // tone with a soft line of foam along it (never a painted stroke)
    if (rv.join) {
      var jr = rv.join === "right", jx = function (x) { return jr ? x : W - x; }, js = rnd(sd + 97);
      var tongue = poly([[404, RY + 2], [330, RY + 6], [276, RY + 14], [300, RY + 22], [360, RY + 34], [404, RY + 44]].map(function (q) { return [jx(q[0]), q[1]]; }));
      var core = poly([[404, RY + 4], [346, RY + 8], [306, RY + 15], [324, RY + 22], [372, RY + 31], [404, RY + 38]].map(function (q) { return [jx(q[0]), q[1]]; }));
      var seam = [[404, RY + 1.6], [340, RY + 4.4], [300, RY + 8.6], [278, RY + 14], [290, RY + 21], [326, RY + 31], [370, RY + 40], [404, RY + 46]], sf = "";
      for (k = 0; k < (TILE ? 14 : 64); k++) {
        var si = js() * (seam.length - 1), s0 = seam[Math.floor(si)], s1 = seam[Math.min(seam.length - 1, Math.floor(si) + 1)], f9 = si - Math.floor(si);
        var px9 = s0[0] + (s1[0] - s0[0]) * f9 + (js() - 0.5) * 7, py9 = s0[1] + (s1[1] - s0[1]) * f9 + (js() - 0.5) * 2.6, sl9 = (0.8 + js() * js() * 13) * (0.5 + (py9 - RY) / 30), ang9 = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]) + (js() - 0.5) * 0.5, bw9 = (js() - 0.5) * 1.6;
        var ex9 = px9 + Math.cos(ang9) * sl9, ey9 = py9 + Math.sin(ang9) * sl9;
        sf += '<path d="M' + n(jx(px9)) + " " + n(py9) + "Q" + n(jx((px9 + ex9) / 2)) + " " + n((py9 + ey9) / 2 + bw9) + " " + n(jx(ex9)) + " " + n(ey9) + '" stroke-width="' + n(0.35 + js() * 0.9) + '" opacity="' + n(0.12 + js() * 0.38) + '"/>';
      }
      mid += '<path class="w-join" d="' + tongue + '"/><path class="w-join2" d="' + core + '"/><g class="w-seamf">' + sf + "</g>";
    }
    // bridges far upstream: low decks on their piers, a truss on one
    (rv.bridges || []).forEach(function (bg) {
      var by0 = RY - 9, d2 = poly([[bg.x0, by0], [bg.x1, by0 - 0.6], [bg.x1, by0 + 1.6], [bg.x0, by0 + 2.2]]), pr2 = "";
      for (var bx2 = bg.x0 + 10; bx2 < bg.x1; bx2 += 18) pr2 += poly([[bx2 - 0.7, by0 + 1.8], [bx2 + 0.7, by0 + 1.8], [bx2 + 0.8, RY + 0.6], [bx2 - 0.8, RY + 0.6]]);
      var tr = "";
      if (bg.truss) { for (var tx2 = bg.truss[0]; tx2 < bg.truss[1]; tx2 += 4) tr += "M" + n(tx2) + " " + n(by0) + "L" + n(tx2 + 2) + " " + n(by0 - 5) + "L" + n(tx2 + 4) + " " + n(by0); tr += "M" + bg.truss[0] + " " + n(by0 - 5) + "H" + bg.truss[1]; }
      mid += '<path class="w-l2" d="' + d2 + pr2 + '"/>' + (tr ? '<path class="w-truss" d="' + tr + '"/>' : "");
    });
    // a road bridge downstream at your right, running across to the far bank
    if (rv.bridge) {
      var rr2 = rv.bridge === "right", bxf = function (x) { return rr2 ? x : W - x; }, near0 = 404, far0 = 290, yN0 = RY - 24, yF0 = RY - 11;
      var dk = poly([[bxf(near0), yN0], [bxf(far0), yF0], [bxf(far0), yF0 + 2.4], [bxf(near0), yN0 + 6]]), rl = "M" + n(bxf(near0)) + " " + n(yN0 - 4.4) + "L" + n(bxf(far0)) + " " + n(yF0 - 1.8), pp = "";
      [[376, 4.4], [334, 3.2], [304, 2.4]].forEach(function (pq) { var u = (near0 - pq[0]) / (near0 - far0), yt = yN0 + 6 + (yF0 + 2.4 - yN0 - 6) * u; pp += poly([[bxf(pq[0]) - pq[1] / 2, yt], [bxf(pq[0]) + pq[1] / 2, yt], [bxf(pq[0]) + pq[1] / 2, RY + 6 - u * 4], [bxf(pq[0]) - pq[1] / 2, RY + 6 - u * 4]]); });
      for (var rp = 0; rp <= 1; rp += 0.08) { var xx = near0 + (far0 - near0) * rp, yy = yN0 + (yF0 - yN0) * rp; rl += "M" + n(bxf(xx)) + " " + n(yy) + "V" + n(yy - 4.4 + rp * 2.6); }
      mid += '<path class="w-l3" d="' + pp + dk + '"/><path class="w-rail w-railf" d="' + rl + '"/><path class="w-liteb" d="M' + n(bxf(near0)) + " " + n(yN0) + "L" + n(bxf(far0)) + " " + n(yF0) + '"/>';
    }
    // looking along the river (128th St E, from the bed under the bridge): its
    // braided bed runs away from you between low banks of fields, the
    // channels and bars drawn to one point on the horizon; nothing in it
    // depends on which bank or which way it runs
    var front = "", rods = "", figs = "", rfdef = "";
    if (!dir) {
      var E9 = 2, pv = function (L, Z, Y) { return [VPx + (V.fl * L) / Z, RY + (V.fl * (E9 - (Y || 0))) / Z]; }, bedHW = 46, bankH = 1.4, rb = rnd(sd + 41), nzc = noise(sd + 43);
      var Zs = [];
      for (var zz9 = 2.4; zz9 < 2400; zz9 *= zz9 < 40 ? 1.05 : 1.12) Zs.push(zz9);
      // the bed's gravel, banks to banks
      var bedP = poly(Zs.map(function (z) { return pv(-bedHW, z, 0); }).concat(Zs.slice().reverse().map(function (z) { return pv(bedHW, z, 0); })));
      // channels that wander across the bed and part round its bars, wider
      // as the river rises; each its own line, never a straight lane
      var chans = [[-24, 9, 0.021, 0.3], [6, 7, 0.017, 2.1], [28, 6, 0.026, 4.2]], wat = "", wetm = "";
      chans.forEach(function (c, ci) {
        var Lc = function (z) { return c[0] + Math.sin(z * c[2] + c[3]) * 11 + (nzc(z * 0.01 + ci * 7) - 0.5) * 10; };
        var hw9 = function (z) { return (c[1] * (0.7 + 0.6 * nzc(z * 0.02 + ci * 3))) * (0.7 + lvl * 1.1); };
        // each bank of a channel wanders on its own, so no edge runs dead straight
        var eL = function (z) { return (nzc(z * 0.11 + ci * 13) - 0.5) * c[1] * 0.9; }, eR = function (z) { return (nzc(z * 0.13 + ci * 17 + 40) - 0.5) * c[1] * 0.9; };
        var left = Zs.map(function (z) { return pv(Lc(z) - hw9(z) + eL(z), z, 0.15); }), right = Zs.slice().reverse().map(function (z) { return pv(Lc(z) + hw9(z) + eR(z), z, 0.15); });
        wat += poly(left.concat(right));
        wetm += poly(Zs.map(function (z) { return pv(Lc(z) - hw9(z) - 1.4, z, 0.08); }).concat(Zs.slice().reverse().map(function (z) { return pv(Lc(z) + hw9(z) + 1.4, z, 0.08); })));
      });
      var bst9 = "";
      for (k = 0; k < (TILE ? 60 : 320); k++) {
        var Lk = (rb() - 0.5) * bedHW * 2, Zk = 3 + Math.pow(rb(), 2.2) * 90, pk = pv(Lk, Zk, 0.05), szk = (V.fl * (0.12 + rb() * 0.22)) / Zk;
        if (pk[1] > H + 6 || pk[0] < -10 || pk[0] > W + 10) continue;
        bst9 += '<path class="' + (rb() < 0.06 ? "w-st-l" : "w-st-d") + '" d="' + stone(rb, pk[0], pk[1], Math.max(0.4, szk)) + '"/>';
      }
      // the water in them: the sky's glints lying flat across each channel,
      // and a little broken foam where it runs over the gravel
      var rfa = "", fo9 = "";
      for (k = 0; k < (TILE ? 40 : 160); k++) {
        var ci9 = k % 3, c9 = chans[ci9], Zr = 5 + Math.pow(rb(), 1.5) * 260, Lc9 = c9[0] + Math.sin(Zr * c9[2] + c9[3]) * 11 + (nzc(Zr * 0.01 + ci9 * 7) - 0.5) * 10, hw8 = c9[1] * (0.7 + 0.6 * nzc(Zr * 0.02 + ci9 * 3)) * (0.7 + lvl * 1.1);
        var Lr = Lc9 + (rb() - 0.5) * hw8 * 1.6, a9 = pv(Lr, Zr, 0.2), gl9 = Math.min((V.fl * hw8 * 0.6) / Zr, (V.fl * (0.6 + rb() * 2.4)) / Zr);
        // the sky's light drawn out along the channel toward you: a long faint
        // curve that follows its own water, never a dash across it
        if (rb() < 0.8) { var Zr2 = Zr * (0.62 + rb() * 0.12), Lc8 = c9[0] + Math.sin(Zr2 * c9[2] + c9[3]) * 11 + (nzc(Zr2 * 0.01 + ci9 * 7) - 0.5) * 10, Lm = (Lr + Lc8 + (Lr - Lc9)) / 2,
          b9 = pv(Lc8 + (Lr - Lc9) * 0.9, Zr2, 0.2), m9 = pv(Lm + (rb() - 0.5) * hw8 * 0.3, Zr * 0.8, 0.2); rfa += "M" + n(a9[0]) + " " + n(a9[1]) + "Q" + n(m9[0]) + " " + n(m9[1]) + " " + n(b9[0]) + " " + n(b9[1]); }
        else {
          // foam drawn out along the current: a thin streak running with
          // the channel toward you, never a fleck
          var b9f = pv(Lr + (rb() - 0.5) * 0.6, Zr * (0.8 + rb() * 0.1), 0.2), fw9 = Math.max(0.3, (V.fl * 0.1) / Zr);
          fo9 += poly([[a9[0] - fw9 * 0.3, a9[1]], [a9[0] + fw9 * 0.3, a9[1]], [b9f[0] + fw9, b9f[1]], [b9f[0] - fw9, b9f[1]]]);
        }
      }
      // the bed's gravel in long faint streaks toward the far end, and the
      // bridge's piers and the banks' trees standing in the channels' water
      var bgl9 = "";
      for (k = 0; k < (TILE ? 8 : 26); k++) { var Lg = (rb() - 0.5) * bedHW * 1.9, Zg = 4 + Math.pow(rb(), 1.6) * 60, g0 = pv(Lg, Zg, 0.04), g1 = pv(Lg + (rb() - 0.5) * 2, Zg * (1.6 + rb()), 0.04), gw9 = Math.max(0.4, (V.fl * (0.3 + rb() * 0.5)) / Zg); bgl9 += poly([[g0[0] - gw9, g0[1]], [g0[0] + gw9, g0[1]], [g1[0] + gw9 * 0.2, g1[1]], [g1[0] - gw9 * 0.2, g1[1]]]); }
      bgl9 = '<path class="w-bedst" d="' + bgl9 + '"/>';
      // the banks: a low cut bank, a line of trees along the river on each
      // side, the fields running away beyond them
      var lb = poly([pv(-bedHW, 2.4, 0), pv(-bedHW, 2400, 0), pv(-400, 2400, bankH), pv(-400, 2.4, bankH)]), rb2 = poly([pv(bedHW, 2.4, 0), pv(bedHW, 2400, 0), pv(400, 2400, bankH), pv(400, 2.4, bankH)]);
      var fur = "", bt9 = "";
      for (var Lf = bedHW + 14; Lf < 260; Lf += 11) [-1, 1].forEach(function (s9) { var a9 = pv(s9 * Lf, 6, bankH), b9 = pv(s9 * Lf, 1400, bankH); fur += "M" + n(a9[0]) + " " + n(a9[1]) + "L" + n(b9[0]) + " " + n(b9[1]); });
      [-1, 1].forEach(function (s9) {
        for (var Zt = 28 + rb() * 20; Zt < 900; Zt *= 1.18 + rb() * 0.3) {
          var Lt = s9 * (bedHW + 3 + rb() * 6), ft9 = pv(Lt, Zt, bankH), ht9 = (V.fl * (9 + rb() * 9)) / Zt;
          if (ft9[0] < -40 || ft9[0] > W + 40) continue;
          var bl9 = broadleaf(rb, ft9[0], ft9[1], ht9, { bare: isBare, vase: true, wide: 0.4 });
          bt9 = (isBare ? '<path class="w-haze" d="' + bl9.crown + '"/>' : '<path d="' + bl9.crown + '"/>') + '<path d="' + bl9.trunk + '"/>' + bt9;
        }
      });
      mid += '<path class="w-bedg" d="' + bedP + '"/>' + bst9 + '<path class="w-barwet w-bedwet" d="' + wetm + '"/><path class="w-chan" fill="url(#' + id + '-rw)" d="' + wat + '"/><path class="w-chandk" d="' + wat + '"/>' + bgl9 + '<path class="w-gl w-glst" stroke-width=".5" d="' + rfa + '"/><path class="w-capf" opacity="' + n(0.25 + lvl * 0.4) + '" d="' + fo9 + '"/>' +
        '<path class="w-field" d="' + lb + rb2 + '"/><path class="w-furrow" d="' + fur + '"/><g class="w-l3">' + bt9 + "</g>";
    }
    // a road bridge right across the river in front of you (128th St E):
    // its deck, its rail, its piers standing in the bed
    if (rv.span) {
      var sy0 = 161, sy1 = 168, piers = "", sglass = "", srail = "M-10 " + (sy0 - 5) + "H400M-10 " + (sy0 - 2.4) + "H400", srr = rnd(sd + 97);
      for (var px = -6; px < 400; px += 7.4) srail += "M" + n(px) + " " + sy0 + "V" + (sy0 - 5);
      [86, 304].forEach(function (pxx) { piers += poly([[pxx - 5.4, sy1], [pxx + 5.4, sy1], [pxx + 6.2, RY + 18], [pxx - 6.2, RY + 18]]); sglass += pileGlass(srr, pxx, RY + 18, 11.6, 24 * (0.4 + (1 - t.wind) * 0.6)); });
      mid += '<g filter="url(#' + id + 'm-wv)">' + sglass + "</g>" + '<path class="w-l4" d="' + piers + '"/><path class="w-l4" d="' + poly([[-10, sy0], [400, sy0], [400, sy1], [-10, sy1]]) + '"/>' +
        '<path class="w-u3" d="' + poly([[-10, sy1], [400, sy1], [400, sy1 + 2.4], [-10, sy1 + 2.4]]) + '"/><path class="w-rail" d="' + srail + '"/><path class="w-liteb" d="M-10 ' + sy0 + 'H400"/>';
    }
    // a low cobble edge out in the river
    if (rv.cobble && lvl < 0.85) { var cz = 1 - lvl * 0.9; mid += rocks(sd + 41, [[rv.cobble[0], RY + 22, 3 * cz], [(rv.cobble[0] + rv.cobble[1]) / 2, RY + 26, 4.6 * cz], [rv.cobble[1], RY + 31, 6 * cz]], { tall: 0.62, wet: (1 - lvl) * 2.4 }); }
    // a creek pouring in from your bank, and the eddy turning where it meets
    // the river: banks with ragged edges, cobbles and roots at the water and
    // a wet band, darkest nearest you; the eddy a turning sheet of foam
    // streaks and slicks, drawn out along the creek's tongue into the current
    if (rv.creek) {
      var cx = rv.creek.x, nzk = noise(sd + 47), rk2 = rnd(sd + 48);
      var ragged = function (pts, amp) {
        var out = [];
        for (var i9 = 0; i9 < pts.length; i9++) { var a9 = pts[i9], b9 = pts[(i9 + 1) % pts.length]; for (var s9 = 0; s9 < 1; s9 += 0.125) { var x9 = a9[0] + (b9[0] - a9[0]) * s9, y9 = a9[1] + (b9[1] - a9[1]) * s9, edge = y9 < 250 ? 1 : 0.15; out.push([x9 + (nzk(y9 * 0.21 + x9 * 0.05) - 0.5) * amp * edge, y9 + (nzk(x9 * 0.17 + 3) - 0.5) * amp * 0.6 * edge]); } }
        return out;
      };
      var bk = ragged([[-6, RY + 8], [cx - 34, RY + 12], [cx - 18, RY + 22], [cx - 30, 262], [-6, 262]], 6), bk2 = ragged([[cx + 16, 262], [cx + 6, RY + 30], [cx + 40, RY + 40], [cx + 70, 262]], 6);
      var wh = "", ed = "", sl = "", tongue = poly([[cx - 30, RY + 17], [cx + 2, RY + 13], [cx + 22, RY + 15], [cx + 12, 262], [cx - 22, 262]]);
      for (k = 0; k < 70; k++) { var u = r(), yy = RY + 13 + u * 50, xx = cx - 22 + r() * 36 + u * 4, ll = 1.2 + u * 6; wh += poly([[xx, yy], [xx + ll * 0.5, yy - 0.4 - u * 0.8], [xx + ll, yy], [xx + ll * 0.5, yy + 0.4 + u * 0.6]]); }
      // the eddy: broken arcs of foam turning against the current, and
      // smooth slicks inside them, stretched downstream
      // the eddy: foam laid in a loose spiral that opens downstream, broken
      // into streaks, its centre drifting with the current (never rings)
      var ex = cx + 22 + 26 * dir, ey = RY + 19;
      for (k = 0; k < (TILE ? 3 : 6); k++) {
        var th0 = rk2() * Math.PI * 2, drift = 0;
        for (var sg9 = 0; sg9 < 9; sg9++) {
          var th1 = th0 + sg9 * 0.55 * dir, rr = 5 + sg9 * 3.4 + k * 2.6, cxd = ex + dir * (sg9 * 3.2 + k * 4), ex2 = cxd + Math.cos(th1) * rr * 1.9, ey2 = ey + Math.sin(th1) * rr * 0.3;
          var th2 = th1 + (0.22 + rk2() * 0.2) * dir, rr2 = rr + 1.2, ex3 = cxd + 2 * dir + Math.cos(th2) * rr2 * 1.9, ey3 = ey + Math.sin(th2) * rr2 * 0.3;
          if (rk2() < 0.3) continue;
          ed += '<path d="M' + n(ex2) + " " + n(ey2) + "L" + n(ex3) + " " + n(ey3) + '" stroke-width="' + n(0.5 + rk2() * 0.8) + '" opacity="' + n(0.2 + rk2() * 0.45) + '"/>';
        }
      }
      for (k = 0; k < 4; k++) sl += '<ellipse cx="' + n(ex + (rk2() - 0.3) * 50 * dir) + '" cy="' + n(ey + (rk2() - 0.5) * 6) + '" rx="' + n(10 + rk2() * 22) + '" ry="' + n(1.2 + rk2() * 1.6) + '"/>';
      var bkt = wall({ seed: sd + 44, x0: -10, x1: cx - 30, base: function (x) { return RY + 10 + Math.max(0, x - (cx - 60)) * 0.4; }, h: 70, mix: 0.45, bare: isBare, land: 4, freq: 0.04 });
      // the banks: dark, a paler lip along the water, a wet band, cobbles and roots at the edge
      var lip = function (pts) { return line(pts.filter(function (q) { return q[1] < 255; })); }, cobs = "", cobt = "", roots = "";
      [bk, bk2].forEach(function (b9) { b9.forEach(function (q, i9) { if (q[1] > 252 || i9 % 2) return; var s9 = 1 + rk2() * 2.6 * (0.5 + (q[1] - RY) / 50); cobs += stone(rk2, q[0] + (rk2() - 0.5) * 4, q[1] + 1.5, s9); cobt += stone(rk2, q[0] + (rk2() - 0.5) * 4, q[1] + 0.8, s9 * 0.5); if (rk2() < 0.35) roots += "M" + n(q[0]) + " " + n(q[1] - 1) + "q" + n((rk2() - 0.5) * 5) + " " + n(3 + rk2() * 3) + " " + n((rk2() - 0.5) * 8) + " " + n(6 + rk2() * 6); }); });
      mid += '<path class="w-creek" d="' + tongue + '"/><path class="w-capf" d="' + wh + '"/><g class="w-slick">' + sl + '</g><g class="w-eddy">' + ed + "</g>" +
        '<path class="w-shorewet" d="' + poly(bk.map(function (q) { return [q[0] + 2, q[1] - 2.5]; })) + poly(bk2.map(function (q) { return [q[0] - 2, q[1] - 2.5]; })) + '"/>' +
        '<path class="w-l5" d="' + poly(bk) + poly(bk2) + '"/><path class="w-bankd" d="' + poly([[-6, 240], [cx - 26, 236], [cx - 30, 262], [-6, 262]]) + poly([[cx + 12, 248], [cx + 64, 246], [cx + 70, 262], [cx + 16, 262]]) + '"/>' +
        '<path class="w-banklip" d="' + lip(bk) + lip(bk2) + '"/><path class="w-roots" d="' + roots + '"/><path class="w-cobd" d="' + cobs + '"/><path class="w-cobt" d="' + cobt + '"/>' +
        '<path class="w-rim" d="' + bkt.trees + '"/>' + paintWall(bkt, "w-l5");
    }
    // a hatchery outlet weir: a low concrete lip with the white of it pouring over
    if (rv.weir) {
      var wxa = -6, wxb = 118, wy = 236;
      mid += '<path class="w-conc" d="' + poly([[wxa, wy - 9], [wxb, wy - 13], [wxb + 4, wy - 9], [wxb + 2, wy - 4], [wxa, wy + 1]]) + '"/>' +
        '<path class="w-liteb" d="M' + wxa + " " + n(wy - 9) + "L" + wxb + " " + n(wy - 13) + '"/>' +
        '<path class="w-capf" d="' + poly([[wxa, wy + 1], [wxb + 2, wy - 4], [wxb + 12, wy + 2], [wxb - 10, wy + 9], [wxa, wy + 10]]) + '"/>';
    }
    // plunkers' rods along your bank, upstream to the left, getting smaller:
    // each its own angle and bend, tapering to its tip, its butt in a holder
    // stuck in the bank, and here and there the one who set it
    if (rv.rods) {
      var bank = [[-6, RY + 10], [60, RY + 22], [130, RY + 44], [176, 268]], rr9 = rnd(sd + 77), hold = "";
      front += '<path class="w-shorewet" d="' + line(bank.map(function (q) { return [q[0] + 4, q[1] - 3]; })) + "L-6 " + (H + 4) + 'Z"/><path class="w-barg" d="' + line(bank) + "L-6 " + (H + 4) + 'Z"/><path class="w-bard" d="' + poly([[-6, RY + 30], [90, RY + 44], [150, 268], [-6, 268]]) + '"/><path class="w-foam" d="' + line(bank) + '"/>' + cobbles(sd + 78, -4, 150, RY + 14, 268, 120);
      for (k = 0; k < rv.rods; k++) {
        var q = (k + 0.5) / rv.rods, bxp = -2 + q * 150 + (rr9() - 0.5) * 6, byp = RY + 12 + Math.pow(q, 1.6) * 52, sc = 0.45 + q * 1.1, ang2 = 0.72 + rr9() * 0.5, ln2 = (26 + rr9() * 10) * sc;
        var tipx = bxp + Math.cos(ang2) * ln2, tipy = byp - Math.sin(ang2) * ln2;
        rods += taperRod([bxp, byp], [tipx, tipy], 0.06 + rr9() * 0.06, 1.3 * sc, 0.3);
        hold += poly([[bxp - 0.5 * sc, byp - 1 * sc], [bxp + 0.5 * sc, byp - 1 * sc], [bxp - 1.6 * sc, byp + 7 * sc], [bxp - 2.6 * sc, byp + 7 * sc]]);
        front += '<path class="w-line" d="M' + n(tipx) + " " + n(tipy) + "Q" + n(tipx + 16 * sc) + " " + n(tipy + 14 * sc) + " " + n(tipx + (28 + rr9() * 16) * sc) + " " + n(byp + 4 * sc) + '"/>';
        if (k % 3 === 1) { var bf = bankFigure(bxp - 7 * sc, byp + 2 * sc, sc * 0.95, 1, { noRod: true }); figs += bf.fig; }
      }
      front += '<path class="w-figh" d="' + hold + rods + figs + '"/>';
    }
    // concrete platforms stepping down from your feet to the water, at the
    // bottom right, joined to your bank: seen from the top step you see each
    // tread from above, the nearest the biggest and darkest, a thin dark drop
    // and a lit nosing at each step's edge (never their faces: they look away
    // from you). The river covers the lowest first, then the next.
    if (rv.steps) {
      var wlv = -0.5 + lvl * 1.5, st = "", sub = "", nose = "", drop = "", edgeY = null, edgeX = 238;
      // [left end at its far edge, its far edge's y, the level that covers it, value step]
      var tiers = [[236, 214, 0.15, 0], [220, 221, 0.7, 1], [200, 230, 1.3, 2], [172, 241, 2.4, 3]];
      tiers.forEach(function (tr, ti) {
        var nx = ti + 1 < tiers.length ? tiers[ti + 1] : [140, H + 6], xr = 412, tilt = -2.6 + ti * 0.4;
        var tread = poly([[tr[0], tr[1]], [xr, tr[1] + tilt], [xr, nx[1] + (ti + 1 < tiers.length ? tilt - 0.4 : 0)], [nx[0], nx[1]]]);
        if (tr[2] < wlv) { sub += tread; return; }
        if (edgeY == null) { edgeY = tr[1]; edgeX = tr[0]; }
        st += '<path class="w-conc w-conc' + tr[3] + '" d="' + tread + '"/>';
        drop += "M" + n(tr[0]) + " " + n(tr[1] + 0.4) + "L" + xr + " " + n(tr[1] + tilt + 0.4);
        nose += "M" + n(tr[0] + 1) + " " + n(tr[1] + 1.6) + "L" + xr + " " + n(tr[1] + tilt + 1.6);
      });
      var wly = edgeY == null ? 246 : edgeY - 0.5;
      front += '<path class="w-rampw" d="' + sub + '"/>' + st + '<path class="w-stepdrop" d="' + drop + '"/><path class="w-liteb" d="' + nose + '"/>' +
        '<path class="w-foam" d="M' + n(edgeX - 40) + " " + n(wly + 1) + "L412 " + n(wly - 2) + '"/>';
    }
    // a crowd along the bank when the fish are in
    if (rv.crowd) {
      var cr = "", cr2 = rnd(sd + 79);
      for (k = 0; k < rv.crowd; k++) {
        var cq = k / Math.max(1, rv.crowd - 1), fx = 150 + cq * 230 + (cr2() - 0.5) * 8, fy = RY + 26 + cq * 22, s2 = 0.62 + cq * 0.55 + (cr2() - 0.5) * 0.12;
        var g2 = bankFigure(fx, fy, s2, -1, { ang: 0.6 + cr2() * 0.5, len: 18 + cr2() * 8, wy: RY + 14 });
        cr += g2.fig + g2.rod; front += '<path class="w-line" d="' + g2.line + '"/>';
      }
      front += '<path class="w-figh" d="' + cr + '"/>';
    }
    if (RN) { front += RN.front; rfdef += RN.defs; }
    // the gravel and sand you stand on: the lower the river, the more of it
    // shows; the big wet cobbles nearest you are the darkest thing in it
    if (rv.bar) {
      var g = (lvl - 0.35) * 50, gx = (0.35 - lvl) * 90;
      var bar = [[-2, 222 + g], [34 + gx * 0.4, 224 + g], [78 + gx * 0.7, 231 + g * 0.8], [124 + gx, 244 + g * 0.6], [168 + gx, 262 + g * 0.4], [206 + gx * 0.6, 284], [236, 308], [252, 332]];
      var stones = "", s5 = rnd(sd + 5), cobs2 = "", cobt2 = "";
      for (k = 0; k < (TILE ? 70 : 190); k++) {
        var sx = -4 + s5() * 250, e = bar[0][1] + Math.pow(Math.max(0, sx) / 250, 1.7) * 108, sy = e + 3 + s5() * s5() * 56, sz = 0.45 + s5() * s5() * 2.4 * (0.6 + (sy - 224) / 120);
        stones += '<path class="' + (s5() < 0.3 ? "w-st-l" : "w-st-d") + '" d="' + stone(s5, sx, sy, sz) + '"/>';
      }
      // the big cobbles at your feet stay at every level (you stand on
      // them): a dark band just above the card's edge, right across the
      // picture; only the dry bar beyond them shrinks as the river comes
      // up, and high water laps them
      // (a reach: the cobbles start lower, nearer you, so the pale bar beyond
      // them shows over the card's edge, as the approved bar does)
      var foot = [[-2, 227], [40, 228], [92, 232], [140, 239], [184, 247], [226, 252], [272, 254], [320, 256], [362, 255], [394, 257]].map(function (q) { return rch ? [q[0], q[1] + 24 - q[0] * 0.03] : q; });
      var footY = function (xx) { for (var fi = 0; fi < foot.length - 1; fi++) if (xx <= foot[fi + 1][0]) return foot[fi][1] + (foot[fi + 1][1] - foot[fi][1]) * (xx - foot[fi][0]) / (foot[fi + 1][0] - foot[fi][0]); return foot[foot.length - 1][1]; };
      for (k = 0; k < (TILE ? 20 : 70); k++) {
        var cxs = -6 + s5() * 402, cys = footY(cxs) + 1.5 + s5() * s5() * 70, czs = (1.6 + s5() * 3.6) * (0.7 + (cys - 226) / 40);
        cobs2 += stone(s5, cxs, cys, czs); cobt2 += stone(s5, cxs - czs * 0.15, cys - czs * 0.25, czs * 0.55);
      }
      var lapped = bar[0][1] > foot[0][1] - 2;
      front += '<path class="w-shorewet" d="' + line(bar.map(function (q) { return [q[0] + 6, q[1] - 6]; })) + 'L-2 332Z"/>' +
        '<path class="w-barg" d="' + line(bar) + 'L-2 332Z"/><path class="w-sand" d="' + poly([[-2, bar[0][1] + 3], [70, bar[2][1] + 2], [128, bar[3][1] + 4], [60, bar[3][1] + 12], [-2, bar[2][1] + 14]]) + '"/>' +
        '<path class="w-foam" d="' + line(bar) + '"/>' + stones +
        '<path class="w-cobwet" d="' + line(foot) + 'L394 332L-2 332Z"/>' + (lapped ? '<path class="w-foam" d="' + line(foot.map(function (q) { return [q[0], q[1] - 1]; })) + '"/>' : "") +
        '<path class="w-bard" d="' + poly([[-2, 262], [150, 290], [246, 330], [-2, 334]]) + '"/>' +
        '<path class="w-cobd" d="' + cobs2 + '"/><path class="w-cobt" d="' + cobt2 + '"/>';
      // a reach: three cobbles on the bar big enough to carry a shade and a light
      if (rch) [[24, 9, 6.8, -8], [68, 15, 5.2, 6], [104, 22, 4.4, -4]].forEach(function (c) {
        var cy9 = bar[0][1] + c[1] + c[0] * 0.04 + (c[0] > 60 ? g * 0.3 : 0), cx9 = c[0] + gx * 0.4;
        front += '<g transform="rotate(' + c[3] + " " + n(cx9) + " " + n(cy9) + ')"><ellipse class="w-cob-sh" cx="' + n(cx9 + 1.5) + '" cy="' + n(cy9 + c[2] * 0.42) + '" rx="' + n(c[2] * 1.05) + '" ry="' + n(c[2] * 0.26) + '"/>' +
          '<ellipse class="w-cob" cx="' + n(cx9) + '" cy="' + n(cy9) + '" rx="' + c[2] + '" ry="' + n(c[2] * 0.5) + '"/>' +
          '<path class="w-cob-s" d="M' + n(cx9 - c[2]) + " " + n(cy9) + "a" + c[2] + " " + n(c[2] * 0.5) + " 0 0 0 " + n(c[2] * 2) + " 0q" + n(-c[2]) + " " + n(c[2] * 0.3) + " " + n(-c[2] * 2) + ' 0z"/>' +
          '<path class="w-cob-l" d="M' + n(cx9 - c[2] * 0.62) + " " + n(cy9 - c[2] * 0.24) + "q" + n(c[2] * 0.5) + " " + n(-c[2] * 0.3) + " " + n(c[2] * 1.05) + " " + n(-c[2] * 0.06) + '"/></g>';
      });
    }
    // a reach's ground at your feet (rch.ground "meadow", the Narrows): the
    // meadow's edge comes in from the other side on the approved bar's slant,
    // pale winter grass with a fringe of sedge at the water and two steps of
    // shade toward you, and the river climbs it as it rises. The card does
    // not describe the bank's form there, so it stays plain: no stones, no log.
    if (rch && rch.ground === "meadow") {
      var gM = (lvl - 0.35) * 26, gxM = (0.35 - lvl) * 40, mz2 = noise(sd + 111), ms = rnd(sd + 113), MX = function (x) { return rR ? x : W - x; }, me = [], qi, qf;
      var key = [[-6, 221 + gM], [34 + gxM * 0.4, 223 + gM], [80 + gxM * 0.7, 230 + gM * 0.8], [126 + gxM, 243 + gM * 0.6], [170 + gxM, 261 + gM * 0.4], [208 + gxM * 0.6, 283], [238, 308], [256, 336]];
      for (qi = 0; qi < key.length - 1; qi++) for (qf = 0; qf < 1; qf += 0.25) {
        var mx0 = key[qi][0] + (key[qi + 1][0] - key[qi][0]) * qf, my0 = key[qi][1] + (key[qi + 1][1] - key[qi][1]) * qf;
        me.push([MX(mx0), my0 + (mz2(mx0 * 0.07) - 0.5) * 3.2]);
      }
      me.push([MX(256), 336]);
      var edgeM = function (x) { var xx = rR ? x : W - x; for (var i9 = 0; i9 < key.length - 1; i9++) if (xx <= key[i9 + 1][0]) return key[i9][1] + (key[i9 + 1][1] - key[i9][1]) * (xx - key[i9][0]) / (key[i9 + 1][0] - key[i9][0]); return key[key.length - 1][1]; };
      var closeM = "L" + MX(-6) + " " + (H + 4) + "Z", shift = function (dy, dx) { return line(me.map(function (q) { return [q[0] + (dx || 0), q[1] + dy]; })); };
      var bl1 = "", bl2 = "", tufts = "";
      for (k = 0; k < (TILE ? 60 : 190); k++) {
        var tq = ms(), ti = Math.min(me.length - 2, Math.floor(tq * (me.length - 1))), tf = tq * (me.length - 1) - ti, ex = me[ti][0] + (me[ti + 1][0] - me[ti][0]) * tf, ey2 = me[ti][1] + (me[ti + 1][1] - me[ti][1]) * tf;
        if (ey2 > 262) continue;
        var near9 = (ey2 - 218) / 40, gy9 = ey2 + 0.8 + ms() * 4, gh9 = (2.4 + ms() * ms() * 9) * (0.75 + near9), gl9 = (ms() - 0.42) * gh9 * 0.9, gw9 = 0.3 + ms() * 0.45;
        var bd9 = "M" + n(ex - gw9) + " " + n(gy9) + "Q" + n(ex + gl9 * 0.3) + " " + n(gy9 - gh9 * 0.6) + " " + n(ex + gl9) + " " + n(gy9 - gh9) + "Q" + n(ex + gl9 * 0.3 + gw9) + " " + n(gy9 - gh9 * 0.5) + " " + n(ex + gw9) + " " + n(gy9) + "Z";
        if (k % 4) bl1 += bd9; else bl2 += bd9;
      }
      // tufts across the meadow toward you, bigger and darker as they come near
      for (k = 0; k < (TILE ? 22 : 70); k++) {
        var cl9 = Math.floor(ms() * 9), tx9 = MX(-4 + (cl9 * 26 + gauss(ms) * 12 + 600) % 236), ty9 = edgeM(tx9) + 6 + ms() * ms() * 80;
        if (ty9 > H) continue;
        var ts9 = (2 + ms() * 4) * (0.5 + (ty9 - 222) / 50);
        for (var tb = 0; tb < 3; tb++) { var tl9 = (ms() - 0.5) * ts9 * 0.9; tufts += "M" + n(tx9 - 0.6 + tb) + " " + n(ty9) + "Q" + n(tx9 + tb + tl9 * 0.4) + " " + n(ty9 - ts9 * 0.6) + " " + n(tx9 + tb + tl9) + " " + n(ty9 - ts9) + "Q" + n(tx9 + tb + tl9 * 0.3 + 0.5) + " " + n(ty9 - ts9 * 0.5) + " " + n(tx9 + tb + 0.6) + " " + n(ty9) + "Z"; }
      }
      front += '<path class="w-shorewet" d="' + line(me.map(function (q) { return [q[0] + (rR ? 6 : -6), q[1] - 5]; })) + closeM + '"/>' +
        '<path class="w-mead" d="' + line(me) + closeM + '"/>' +
        '<path class="w-meadn" d="' + shift(13, rR ? -4 : 4) + closeM + '"/><path class="w-meadn" d="' + shift(34, rR ? -10 : 10) + closeM + '"/>' +
        '<path class="w-foam" d="' + line(me) + '"/>' + '<path class="w-meadt" d="' + tufts + '"/>' +
        '<path class="w-meadt" d="' + bl1 + '"/><path class="w-reed2" d="' + bl2 + '"/>' +
        (lvl > 0.62 ? '<path class="w-siltl" d="' + shift(1.4) + '"/>' : "");
      // someone fishing from the meadow's edge, a step in: the line out across the water
      if (rv.wader) {
        var wx8 = MX(rv.wader.x), wy8 = edgeM(wx8) + 0.5, ws8 = rv.wader.s || 1.7, wd8 = rR ? 1 : -1, wf8 = bankFigure(wx8, wy8, ws8, wd8, { ang: 0.98, len: 30, wy: RY + 9, out: 44 });
        front += '<g class="w-dayonly"><path class="w-figh" d="' + wf8.fig + wf8.rod + '"/><path class="w-line" d="' + wf8.line + '"/>' +
          '<path class="w-wade" d="' + poly([[wx8 - 3 * ws8, wy8 - 1.6 * ws8], [wx8 + 3 * ws8, wy8 - 1.6 * ws8], [wx8 + 3.4 * ws8, wy8 + 0.6], [wx8 - 3.4 * ws8, wy8 + 0.6]]) + '"/>' +
          '<path class="w-foam" d="M' + n(wx8 - 3.6 * ws8) + " " + n(wy8 - 1.5 * ws8) + "q" + n(3.6 * ws8) + " " + n(1 * ws8) + " " + n(7.2 * ws8) + ' 0"/></g>';
      }
    }
    // your own bank (the Narrows' meadow, the Orting levee, the point at
    // Sumner): the bank's top stays where it is and the river climbs it as
    // it rises. Low water leaves a strip of mud and gravel along the edge;
    // high water drowns the grass's foot and the levee's lower stones.
    if (rv.meadow || rv.levee || rv.join) {
      // rv.meadow "diag": the meadow's edge runs across the picture on a
      // slant, low at the left where the water opens downstream and up at
      // the right where the floodplain trees stand (rv.grove)
      var gy0 = rv.levee ? rv.leveeY || 220 : 238, ew = gy0 - (1 - lvl) * 15 + 2, ey = Math.max(gy0, ew), mz = noise(sd + 99), edge2 = [], strip = [], xg;
      var dg = function (x) { return rv.meadow === "diag" ? (W / 2 - x) * 0.075 + Math.max(0, x - 300) * -0.08 : 0; };
      for (xg = -6; xg <= W + 6; xg += rv.levee ? 5 : 8) {
        var jo = rv.join === "right" ? Math.pow(Math.max(0, xg - 250) / 10, 1.7) * 0.7 : 0, wob = (mz(xg * 0.02) - 0.5) * (rv.meadow === "diag" ? 9 : 6) + (rv.levee || rv.join ? (mz(xg * 0.11 + 3) - 0.5) * (rv.join ? 4.4 : 3.2) : 0) + dg(xg);
        edge2.push([xg, ey + wob + jo]); strip.push([xg, ew + wob * 0.7 + jo]);
      }
      var ek9 = function (x) { var e = edge2[0]; edge2.forEach(function (q) { if (Math.abs(q[0] - x) < Math.abs(e[0] - x)) e = q; }); return e[1]; };
      // at the joining the point's edge curves away down the White's side,
      // ragged, its foot wet: no corner and no drawn line
      var close = function (pts) { return "L" + n(pts[pts.length - 1][0]) + " " + (H + 4) + "L-6 " + (H + 4) + "Z"; };
      if (ew < gy0) front += '<path class="w-shorewet" d="' + line(strip) + close(strip) + '"/><path class="w-mudb" d="' + line(strip.map(function (q) { return [q[0], q[1] + 1.2]; })) + close(strip) + '"/>' + (rv.join ? "" : '<path class="w-foam" d="' + line(strip) + '"/>');
      else front += '<path class="w-shorewet" d="' + line(edge2.map(function (q) { return [q[0], q[1] - 4]; })) + close(edge2) + '"/>';
      front += '<path class="' + (rv.levee ? "w-levee" : "w-lawn") + '" d="' + line(edge2) + close(edge2) + '"/>' + (ew >= gy0 && !rv.join ? '<path class="w-foam" d="' + line(edge2) + '"/>' : "") +
        (lvl > 0.62 ? '<path class="w-siltl" d="' + line(edge2.map(function (q) { return [q[0], q[1] + 1.4]; })) + '"/>' : "");
      // the near grass darker than the far: two steps of shade toward you
      if (rv.meadow === "diag") front += '<path class="w-lawnn" d="' + line(edge2.map(function (q) { return [q[0], q[1] + 9 + Math.max(0, q[0] - 280) * 0.08]; })) + close(edge2) + '"/>' +
        '<path class="w-lawnn" d="' + line(edge2.map(function (q) { return [q[0], q[1] + 22]; })) + close(edge2) + '"/>';
      // the cottonwood floodplain forest on your own bank (rv.grove "right"):
      // trunks at their own distances and values, the nearest darkest and
      // biggest, their bare crowns a haze, the brush under them a dark mass;
      // all below the dock (the crowns stop well under the top of the frame)
      if (rv.grove) {
        var gr = rnd(sd + 67), gR = rv.grove === "right", gx = function (x) { return gR ? x : W - x; }, gw = "", gf = "", gb = "", gu = [], ek = ek9;
        // No crown climbs behind the title or its chips: the far trees are
        // fitted under CAP (the chips' bottom over a spot's picture, which
        // hangs 20 px lower: picture y 151 on a run card, 156 under a title
        // of two lines), measuring their own limbs and twigs. The nearest stand big and lean out past the frame's
        // edge, so their trunks run off the side instead of up; what of
        // them would come back in over CAP fades out (gcap).
        var CAP = 157, lean9 = function (bt, x, b, a) {
          var c = Math.cos(a), sn = Math.sin(a), m = 9999, nums = (bt.wood + bt.twig + bt.leaf).match(/-?\d+(?:\.\d+)?/g) || [], i;
          for (i = 0; i + 1 < nums.length; i += 2) { var dx = nums[i] - x, dy = nums[i + 1] - b, rx = x + dx * c - dy * sn, ry = b + dx * sn + dy * c; if ((gR ? rx < W + 2 : rx > -2) && ry < m) m = ry; }
          return m;
        };
        // [x, ground below the edge, height, value, lean (degrees, out past the edge)]: far to near
        [[290, 4, 84, 3, 0, 0.7], [312, 6, 104, 4, 2, 0.7], [334, 5, 122, 4, -3, 0.7], [378, 12, 250, 5, 19, 0.4], [348, 30, 330, 5, 27, 0.26]].forEach(function (t9, i9) {
          var x9 = gx(t9[0] + (gr() - 0.5) * 6), b9 = ek(x9) + t9[1], sp9 = t9[5] + gr() * 0.2, a9 = (gR ? 1 : -1) * t9[4] * Math.PI / 180, h9 = t9[2], bt9, top9, k9;
          for (k9 = 0; k9 < 3; k9++) {
            bt9 = bigTree(rnd(sd + 67 + 13 * i9), x9, b9, h9, isBare, sp9); top9 = lean9(bt9, x9, b9, a9);
            if (t9[3] === 5) break;
            if (top9 >= CAP) break;
            h9 *= (b9 - CAP) / (b9 - top9) * 0.98;
          }
          var paint9 = '<g class="w-l' + t9[3] + '">' + (bt9.leaf ? '<path d="' + bt9.leaf + '"/>' : "") + '<path class="' + (isBare ? "w-twig" : "") + '" d="' + bt9.twig + '"/><path d="' + bt9.wood + '"/></g>';
          gu.push([x9, b9]);
          paint9 = '<path class="w-moonrim" d="' + bt9.wood + '"/>' + paint9;
          if (t9[3] === 5) {
            // a near trunk's bark: a lit strip up its sky side and furrows
            var tw9 = Math.max(1.2, h9 * 0.05), fk9 = b9 - h9 * 0.31, fr9 = rnd(sd + 69 + i9), fu9 = "", q9;
            for (q9 = 0; q9 < 7; q9++) { var fx9 = x9 - tw9 * 0.5 + fr9() * tw9; fu9 += "M" + n(fx9) + " " + n(b9) + "Q" + n(fx9 + (fr9() - 0.5) * 3) + " " + n(b9 - h9 * 0.14) + " " + n(x9 + (fx9 - x9) * 0.5 + (fr9() - 0.5) * 2) + " " + n(fk9); }
            paint9 = '<path class="w-rim" d="' + bt9.wood + '"/>' + paint9 + '<path class="w-barkg" d="' + poly([[x9 - tw9 * 0.9, b9], [x9 - tw9 * 0.52, b9 - h9 * 0.06], [x9 - tw9 * 0.4, fk9], [x9 - tw9 * 0.16, fk9], [x9 - tw9 * 0.34, b9]]) + '"/><path class="w-barkd" d="' + fu9 + '"/>';
          }
          if (a9) paint9 = '<g transform="rotate(' + n(a9 * 180 / Math.PI) + " " + n(x9) + " " + n(b9) + ')">' + paint9 + "</g>";
          if (t9[3] === 5) gf += paint9; else gw += paint9;
        });
        rfdef += '<linearGradient id="' + id + 'f-gcapg" gradientUnits="userSpaceOnUse" x1="0" y1="' + (CAP - 6) + '" x2="0" y2="' + (CAP + 10) + '"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
          '<mask id="' + id + 'f-gcap" maskUnits="userSpaceOnUse" x="-60" y="0" width="' + (W + 120) + '" height="' + H + '"><rect x="-60" width="' + (W + 120) + '" height="' + H + '" fill="url(#' + id + 'f-gcapg)"/></mask>';
        gf = '<g mask="url(#' + id + 'f-gcap)">' + gf + "</g>";
        // the brush under them: a dark ragged mass along the meadow's edge
        var bpts = [], xb;
        for (xb = 268; xb <= W + 8; xb += 4) { var xx9 = gx(xb), u9 = (xb - 268) / (W + 8 - 268); bpts.push([xx9, ek(xx9) + 2 - (4 + u9 * 16) * (0.55 + gr() * 0.6)]); }
        gb = poly(bpts.concat([[gx(W + 8), ek(gx(W + 8)) + 26], [gx(268), ek(gx(268)) + 3]]));
        front += '<g class="w-grove"><g data-fit="1">' + gw + '</g><path class="w-moonrim" d="' + gb + '"/><path class="w-l5" d="' + gb + '"/>' + gf + "</g>";
      }
      if (rv.levee) {
        // the levee's cobble face, dark, each stone with its lit top; then the
        // gravel trail along its top with its edges, then the park's lawn
        var lv = rnd(sd + 101), lc = "", lt = "", lf2 = gy0 + 12, fh = Math.max(0, lf2 - ey - 1);
        for (k = 0; k < (TILE ? 50 : 170) * fh / 12; k++) { var lx9 = -4 + lv() * (W + 8), ly9 = ey + 1 + lv() * fh, ls9 = 1 + lv() * 2.2 * (0.7 + (ly9 - gy0) / 12); lc += stone(lv, lx9, ly9, ls9); lt += stone(lv, lx9 - ls9 * 0.2, ly9 - ls9 * 0.3, ls9 * 0.5); }
        var trailN = [[-6, lf2 + 10], [W + 6, lf2 + 9]], trailF = [[-6, lf2 - 0.5], [W + 6, lf2 - 1.5]];
        // the face slopes down from the trail to the water: darker toward
        // you where it falls away under the trail's edge, and broken by the
        // slope's own lines running down it, never one flat band
        var slope = "", shz = "";
        for (k = 0; k < (TILE ? 10 : 34); k++) { var sx9 = -4 + lv() * (W + 8), sw9 = 1.2 + lv() * 2.6, yT = ey + 1 + lv() * 2, yB = lf2 - 0.5; slope += poly([[sx9, yT], [sx9 + sw9, yT], [sx9 + sw9 * 1.6 + (lv() - 0.5) * 3, yB], [sx9 + (lv() - 0.5) * 3, yB]]); }
        shz = poly([[-6, lf2 - fh * 0.42], [W + 6, lf2 - fh * 0.38 - 1], [W + 6, lf2], [-6, lf2]]);
        front += '<path class="w-leveesh" d="' + shz + '"/><path class="w-leveesl" d="' + slope + '"/><path class="w-cobd" d="' + lc + '"/><path class="w-cobt" d="' + lt + '"/>' +
          '<path class="w-path" d="' + poly(trailF.concat(trailN.slice().reverse())) + '"/><path class="w-pathv" d="' + poly([trailN[0], trailN[1], [W + 6, lf2 + 12], [-6, lf2 + 13]]) + '"/>' +
          '<path class="w-liteb" d="' + line(trailF) + line(trailN) + '"/>' + cobbles(sd + 104, -4, W + 4, lf2 + 1, lf2 + 9, 70) +
          '<path class="w-lawn" d="' + poly([[-6, lf2 + 12], [W + 6, lf2 + 11], [W + 6, H + 4], [-6, H + 4]]) + '"/>';
        var gsl = rnd(sd + 103), bl9 = "", bl8 = "";
        for (k = 0; k < (TILE ? 30 : 110); k++) {
          var gx3 = -6 + gsl() * (W + 12), gy3 = lf2 + 12 + gsl() * 3 + (gx3 > 0 ? 0 : 0), gh3 = (3 + gsl() * gsl() * 12), gl3 = (gsl() - 0.45) * gh3 * 0.8, gw3 = 0.5 + gsl() * 0.7;
          if (gsl() < 0.45) continue;
          var bdd = "M" + n(gx3 - gw3) + " " + n(gy3) + "Q" + n(gx3 + gl3 * 0.3) + " " + n(gy3 - gh3 * 0.6) + " " + n(gx3 + gl3) + " " + n(gy3 - gh3) + "Q" + n(gx3 + gl3 * 0.3 + gw3) + " " + n(gy3 - gh3 * 0.5) + " " + n(gx3 + gw3) + " " + n(gy3) + "Z";
          if (k % 3) bl9 += bdd; else bl8 += bdd;
        }
        front += '<path class="w-reed2" d="' + bl8 + '"/><path class="w-sedgeg" d="' + bl9 + '"/>';
      } else {
        // tall grass and sedge along the edge, two tones, curved blades of
        // every height leaning every way (shorter on the mown point at Sumner)
        var gs = rnd(sd + 105), blades = "", blades2 = "";
        for (var gk = 0; gk < (TILE ? 60 : 220); gk++) {
          var gx2 = -6 + gs() * (W + 12), ge = mz(gx2 * 0.02), gy = ey + (ge - 0.5) * (rv.meadow === "diag" ? 9 : 6) + dg(gx2) + 1 + gs() * 10 + (rv.join === "right" ? Math.max(0, gx2 - 250) * 0.35 : 0), gh = (rv.meadow ? 6 + gs() * 14 : 3 + gs() * gs() * 12) * (0.6 + (gy - ey) / 14), gl = (gs() - 0.45) * gh * 0.7, gw = 0.6 + gs() * 0.8;
          if (rv.join === "right" && gx2 > 345) continue;
          var bd2 = "M" + n(gx2 - gw) + " " + n(gy) + "Q" + n(gx2 + gl * 0.3) + " " + n(gy - gh * 0.6) + " " + n(gx2 + gl) + " " + n(gy - gh) + "Q" + n(gx2 + gl * 0.3 + gw) + " " + n(gy - gh * 0.5) + " " + n(gx2 + gw) + " " + n(gy) + "Z";
          if (gk % 3) blades += bd2; else blades2 += bd2;
        }
        front += '<path class="w-reed2" d="' + blades2 + '"/><path class="w-sedgeg" d="' + blades + '"/>';
      }
      // anglers along your bank, rods out over the water: the opener's crowd
      // only around the opener (rv.opener, "MM-DD"), one alone the rest of the season
      var anglers = rv.anglers || [];
      if (rv.opener && anglers.length > 1) {
        var od = String(rv.opener).split("-"), yr = t.date.getFullYear(), dd = Math.abs((t.date - new Date(yr, +od[0] - 1, +od[1])) / 864e5);
        if (dd > 9) anglers = anglers.slice(0, 1);
      }
      var afig = "", aline = "";
      anglers.forEach(function (ax, ai) {
        var ar = rnd(sd + 130 + ai), ay = ey + (mz(ax * 0.02) - 0.5) * 6 + dg(ax) + 4 + ar() * 3 + (rv.join === "right" ? Math.max(0, ax - 250) * 0.35 : 0), as = 0.95 + ar() * 0.45, dir2 = ax < W / 2 ? 1 : -1;
        var bf = bankFigure(ax, ay, as, dir2, { ang: 0.7 + ar() * 0.5, len: 20 + ar() * 10, wy: ey - 6 - ar() * 10, out: 18 + ar() * 20 });
        afig += bf.fig + bf.rod; aline += bf.line;
      });
      if (afig) front += '<path class="w-figh" d="' + afig + '"/><path class="w-line" d="' + aline + '"/>';
      // rv.wader { x }: someone wading off your bank, knee deep, casting up
      // and across: the water rings round the legs, a wake trails downstream
      if (rv.wader) {
        var wx9 = rv.wader.x, wy9 = ek9(wx9) - 6, ws = rv.wader.s || 1.7, wf = bankFigure(wx9, wy9, ws, rv.wader.dir || 1, { ang: 1.02, len: 30, wy: RY + 6, out: 40 }), dd9 = dir || -1;
        front += '<g class="w-dayonly"><path class="w-figh" d="' + wf.fig + wf.rod + '"/><path class="w-line" d="' + wf.line + '"/>' +
          '<path class="w-wade" d="' + poly([[wx9 - 3.4 * ws, wy9 - 3.4 * ws], [wx9 + 3.4 * ws, wy9 - 3.4 * ws], [wx9 + 3.6 * ws, wy9 + 1], [wx9 - 3.6 * ws, wy9 + 1]]) + '"/>' +
          '<path class="w-foam" d="M' + n(wx9 - 3.8 * ws) + " " + n(wy9 - 3.3 * ws) + "q" + n(3.8 * ws) + " " + n(1.2 * ws) + " " + n(7.6 * ws) + ' 0"/>' +
          '<path class="w-foam" opacity=".6" d="M' + n(wx9 + dd9 * 3.4 * ws) + " " + n(wy9 - 3.1 * ws) + "q" + n(dd9 * 8) + " " + n(1.1) + " " + n(dd9 * 22) + " " + n(0.6) + "M" + n(wx9 + dd9 * 3 * ws) + " " + n(wy9 - 2.4 * ws) + "q" + n(dd9 * 7) + " .9 " + n(dd9 * 16) + ' .5"/></g>';
      }
    }
    // a big tree on your own bank (a cottonwood at the Narrows), rooted just
    // off the right edge and cut by the frame: limb by limb, bark lit on one
    // side and furrowed on the other
    if (rv.trunk) {
      var tr2 = rnd(sd + 63), tx = 366, bt = bigTree(tr2, tx, 346, 430, isBare, 0.7), tw9 = Math.max(1.2, 430 * 0.05), bark = "", furr = "";
      for (k = 0; k < 9; k++) { var fx9 = tx - tw9 * 0.5 + tr2() * tw9 * 0.9, fy9 = 340 - tr2() * 60; furr += "M" + n(fx9) + " 346Q" + n(fx9 + (tr2() - 0.5) * 4) + " " + n(fy9 - 40) + " " + n(fx9 + (tr2() - 0.5) * 3) + " " + n(fy9 - 120 - tr2() * 60); }
      bark = poly([[tx - tw9 * 0.9, 346], [tx - tw9 * 0.55, 346 - 430 * 0.06], [tx - tw9 * 0.42, 220], [tx - tw9 * 0.2, 220], [tx - tw9 * 0.4, 346]]);
      front += '<path class="w-rim" d="' + bt.wood + '"/><g class="w-l5">' + (bt.leaf ? '<path d="' + bt.leaf + '"/>' : "") + '<path class="w-twig" d="' + bt.twig + '"/><path d="' + bt.wood + '"/></g>' +
        '<path class="w-barkl" d="' + bark + '"/><path class="w-barkd" d="' + furr + '"/>';
    }
    if (dir && !rch && !rv.bar && !rv.rods && !rv.meadow && !rv.levee && !rv.join) front += shoreEdge([[-2, 304], [60, 301], [130, 303], [200, 307], [270, 308], [330, 306], [392, 309]]);
    // After dark: every river on a card is closed to fishing at night
    // (night closures, parks shut at dusk) and has no lamps, so nobody is
    // painted there by a light of their own. Its night is the sky's: the
    // towns' glow on the cloud and the moon where it truly stands, in the
    // water (scene.css). rv.own { x, y } is for a card whose night allows it.
    if (rv.own) front += ownLight(id + "f", sd + 99, rv.own.x, rv.own.y, rv.own.rx || 96, 14, true);
    var fog = t.fog > 0 ? '<rect class="w-fog" width="' + W + '" height="' + H + '"/>' : "";
    return { back: back, gl: [sd + 600, RY + 14, H, 0.7 + lvl * 0.6], mid: defs(id + "m", mdef) + fog + mid, front: defs(id + "f", rfdef) + front };
  }

  // ---- the ocean beach at a spot (added to surf) -------------------------------------
  // o.jetty { side, tip }: a rock jetty running out low along the horizon,
  // its tip at that bearing (tip) or at x (tipX). o.stack: a sea stack, its
  // x on the picture, far up the beach. Both wet as high as the tide leaves.
  // Both by bearing, like everything else across the water: a jetty's tip
  // (and where it leaves the shore, root) and a sea stack (stack.at). Out of
  // the picture, they are not drawn.
  function oceanParts(o, tide, sd) {
    var s = "", V = lens(o);
    if (o.jetty) {
      var j = o.jetty, left = j.side === "left", tx = V.x(j.tip), rx = j.root != null ? V.x(j.root) : left ? -60 : W + 60, pts;
      if (left ? tx > 2 : tx < W - 2) {
        var far = (j.mi || 1) >= 0.5, near = (j.mi || 1) < 1;
        if (near) {
          // under a mile off: only its outer end is in the picture, so draw
          // that part as it is, a dark low line of rock from the frame's edge
          // out to the tip, a little taller toward the shore end, the surf
          // white along its foot
          var ex = left ? -8 : W + 8, ey = HZ + 2.8;
          pts = [[ex, ey, 5.4], [(ex + tx) / 2, HZ + 1.9, 3.8], [tx, HZ + 1.1, 2.3]];
          s += rocks(sd + 51, pts, { tall: 1.05, wet: (1 - tide) * 1.6, cls: "w-midrock", angular: true }) +
            '<path class="w-foam" d="M' + n(ex) + " " + n(ey + 0.8) + "Q" + n((ex + tx) / 2) + " " + n(HZ + 2.1) + " " + n(tx + (left ? 3 : -3)) + " " + n(HZ + 1.3) + '"/>';
        } else {
          pts = [[left ? Math.max(rx, -60) : Math.min(rx, W + 60), HZ + (far ? 5 : 16), far ? 4 : 9], [(Math.max(-60, Math.min(W + 60, rx)) + tx) / 2 + (left ? -6 : 12), HZ + (far ? 2.6 : 6), far ? 2.6 : 4.2], [tx, HZ + 1.4, 1.6]];
          s += rocks(sd + 51, pts, { tall: 1, wet: (1 - tide) * 2.4, cls: "w-farrock" });
        }
      }
    }
    var stx = o.stack != null ? (typeof o.stack === "number" ? o.stack : V.x(o.stack.at)) : null;
    if (stx != null && stx > 6 && stx < W - 6) {
      var x = stx, r = rnd(sd + 53), pp = [[x - 5.5, HZ + 1.2]], k;
      for (k = 0; k <= 6; k++) pp.push([x - 4.6 + k * 1.5 + (r() - 0.5) * 0.6, HZ - 5.2 - Math.sin((k / 6) * Math.PI) * 1.6 - r() * 0.8]);
      pp.push([x + 5.2, HZ + 1.2]);
      s += '<path class="w-l2" d="' + poly(pp) + '"/><path class="w-foam" d="M' + n(x - 7) + " " + n(HZ + 1.4) + "H" + n(x + 7) + '"/>';
    }
    return s;
  }
  // A truck out on the beach after dark, far down it: two headlamps and
  // the light they throw along the sand.
  function beachCar(id, x, y) {
    return '<g class="w-lampson"><path class="w-cone" d="' + poly([[x, y - 1], [x - 90, y + 4], [x - 70, y + 9], [x, y + 0.6]]) + '"/>' +
      '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="9" fill="url(#' + id + '-lamp)"/><circle class="w-lantern" cx="' + n(x - 1.1) + '" cy="' + n(y) + '" r=".55"/><circle class="w-lantern" cx="' + n(x + 1.1) + '" cy="' + n(y) + '" r=".55"/></g>';
  }

  // ---- hanging a spot's painting --------------------------------------------------------
  // A spot card's stand for this picture. A card with more than one stand
  // (Westport: the crab float and the surf perch beach) picks by what the
  // people are doing (o.activity), then the trip's fish (o.fish: a salmon
  // trip on the Green is the Auburn Narrows), then how they fish (o.how),
  // then the kind of picture the page asks for, then the card's own default.
  // o.standAsk (the list a page came from: Westport from the Pier list is
  // the crab float) wins over all of them.
  function standOf(kind, o) {
    if (!o || !o.stands) return o;
    var by = o.standBy || {}, fish = o.fish && by.fish ? (typeof by.fish === "function" ? by.fish(o.fish) : by.fish[o.fish]) : null;
    var name = (o.standAsk && o.stands[o.standAsk] ? o.standAsk : "") || (by.activity && by.activity[o.activity]) || fish || (by.how && by.how[o.how]) || (by.kind && by.kind[kind]) || o.stand;
    var s = o.stands[name] || o.stands[o.stand] || {}, out = {}, k;
    for (k in o) if (k !== "stands" && k !== "standBy") out[k] = o[k];
    for (k in s) out[k] = s[k];
    out.standName = name;
    return out;
  }
  function hang(p) { return svg("sc sc-back", p.back) + glintLayers(p.gl[0], p.gl[1], p.gl[2], p.gl[3]) + svg("sc sc-mid", p.mid) + svg("sc sc-front", p.front); }
  // The spot's own light, on the element that holds the painting: where its
  // sun sets and rises (scene.css moves the glow there in golden hour, dusk,
  // dawn and first light), the moon, the fog, the rain. A spot with no
  // facing (a lake from the feed) gets a soft light from nowhere in
  // particular. Cleared for a picture that is not a spot's.
  // The moon by night: where it really is for this spot at that hour. In
  // the picture (its glow and its road on the water there), just off one
  // side (a little light from that edge, no road), behind you or not yet
  // up (no road at all: the water ahead holds no moon).
  function moonOf(o, t) {
    var m = moonSky(t.at);
    if (m.alt <= 0) return { pos: "down", alt: m.alt, az: m.az };
    if (o.facing == null) return { pos: "none", alt: m.alt, az: m.az };
    var fov = o.fov || FOV, rl = relB(m.az, o.facing), a = Math.abs(rl), ud = W / 2 / fov;
    if (a <= fov - 2) return { pos: "ahead", alt: m.alt, az: m.az, x: Math.round(W / 2 + rl * ud), y: Math.round(clamp(HZ - m.alt * ud, 30, HZ - 12)) };
    if (a <= 100) return { pos: "side", alt: m.alt, az: m.az, x: rl < 0 ? -30 : W + 30, y: Math.round(clamp(HZ - m.alt * ud, 30, HZ - 12)) };
    return { pos: "behind", alt: m.alt, az: m.az };
  }
  function lightUp(el, o) {
    var st = el.style, ds = el.dataset;
    ["--setx", "--risex", "--moon", "--fog", "--rainx", "--moonx", "--moony"].forEach(function (k) { st.removeProperty(k); });
    ["set", "rise", "noon", "moon", "fog", "moonpos", "moonlit", "moonweak"].forEach(function (k) { delete ds[k]; });
    if (!o || !o.spot) return;
    var t = today(o);
    if (o.facing != null) {
      var L = lightOf(o.facing, t.date);
      st.setProperty("--setx", L.set.x + "px"); st.setProperty("--risex", L.rise.x + "px");
      ds.set = L.set.side; ds.rise = L.rise.side; ds.noon = L.noon.side;
    } else ds.set = ds.rise = "none";
    ds.moon = ""; st.setProperty("--moon", String(n(t.moon)));
    var mo = moonOf(o, t), ml = moonlit(o, t);
    ds.moonpos = mo.pos;
    if (ml) ds.moonlit = ml;
    if (t.moon < 0.3) ds.moonweak = "";
    if (mo.x != null) { st.setProperty("--moonx", mo.x + "px"); st.setProperty("--moony", mo.y + "px"); }
    if (t.fog > 0) { ds.fog = ""; st.setProperty("--fog", String(n(t.fog))); }
    // the sky's own Rain sets --rain to 1; a spot's drizzle only ever adds
    if (t.rain > 0) st.setProperty("--rainx", String(n(t.rain)));
  }
  // A tile-sized painting of a spot: the spot's own scene, flattened into
  // one picture without its glints (the shimmer is the big scene's), framed
  // on the waterline. It says which spot and stand it is (data-paint-spot,
  // data-stand; not data-spot, which the list row around it carries).
  function viewSpot(kind, o) {
    // o.tileView: the tile looks its own way from the same stand (its
    // facing, and what changes with it: the pier's turn under you, the
    // trees kept low for a title it does not have), one level deep
    if (o.tileView) {
      var o2 = {}, q, q2;
      for (q in o) if (q !== "tileView") o2[q] = o[q];
      for (q in o.tileView) {
        var tv = o.tileView[q];
        if (tv && typeof tv === "object" && !Array.isArray(tv) && o[q] && typeof o[q] === "object") { o2[q] = {}; for (q2 in o[q]) o2[q][q2] = o[q][q2]; for (q2 in tv) o2[q][q2] = tv[q2]; }
        else o2[q] = tv;
      }
      o = o2;
    }
    var b = o.scene || kind, id = "vs" + (view.n = (view.n || 0) + 1), html;
    TILE = true; GLASS = !!o.glass;
    try { html = (BUILD[b] || BUILD.sound)(id, o); } finally { TILE = false; GLASS = false; }
    html = html.replace(/<svg class="sc sc-gl[\s\S]*?<\/svg>/g, "").replace(/<svg[^>]*>/g, "").replace(/<\/svg>/g, "");
    var t = today(o), L = o.facing != null ? lightOf(o.facing, t.date) : null, ml = moonlit(o, t);
    // o.tile [x, y, w, h]: a stand's own frame for its tile, on what it is known by
    var vb = o.tile ? o.tile.join(" ") : "0 64 390 234";
    return '<svg class="view vspot" viewBox="' + vb + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-scene="' + b + '" data-paint-spot="' + o.spot + '"' + (o.standName ? ' data-stand="' + o.standName + '"' : "") + (ml ? ' data-moonlit="' + ml + '"' : "") +
      (L ? ' data-set="' + L.set.side + '" data-rise="' + L.rise.side + '" style="--setx:' + L.set.x + "px;--risex:" + L.rise.x + 'px"' : ' data-set="none"') + ">" + html + "</svg>";
  }
  var TILE = false, GLASS = false;

  // The row's thumbnail for a spot: its own few facts, small, in one hour's
  // palette (as mini() is), so a row looks like its spot. 48 by 48.
  function miniSpot(kind, p, o) {
    var dark = p.dark, lum = dark ? p.ink : p.paper, gid = "mn" + (mini.n = (mini.n || 0) + 1), b = o.scene || kind, sd = idSeed(o.spot), r = rnd(sd + 7);
    var t = today(o), V = lens(o), fov = o.fov || FOV, sky = o.skyline || [];
    var hz = dark ? mixHex(p.sky[1], p.ink2, 0.3) : p.sky[1];
    var f0 = mixHex(hz, p.shore, 0.16), f1 = mixHex(hz, p.shore, 0.3), f2 = mixHex(hz, p.shore, 0.55), f3 = p.shore, sand = mixHex(p.ground, p.ink, dark ? 0.1 : 0.16);
    var lampOn = dark || p.name === "Dawn", gold = p.gold, HZm = b === "river" ? 27 : 25;
    // what the spot is known by (its pier and lamps, the kayak, the grove,
    // the ramp, the person fishing): the tile is cropped in onto it, so a
    // row shows one bold thing and not the whole view shrunk into level bands
    var foc = [];
    function F(x0, y0, x1, y1) { foc.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]); }
    function X(bb) { return 24 + (relB(bb, V.f) * 24) / fov; }
    function mcol(mi) { return mi >= 7 ? f0 : mi >= 4.5 ? f1 : mi >= 2.6 ? mixHex(hz, p.shore, 0.42) : f2; }
    var s = '<defs><linearGradient id="' + gid + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.sky[0] + '"/><stop offset="1" stop-color="' + hz + '"/></linearGradient>' +
      '<linearGradient id="' + gid + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mixHex(p.water[0], hz, 0.35) + '"/><stop offset="1" stop-color="' + p.water[1] + '"/></linearGradient>' +
      '<radialGradient id="' + gid + 'g"><stop offset="0" stop-color="' + gold + '" stop-opacity=".95"/><stop offset=".3" stop-color="' + gold + '" stop-opacity=".35"/><stop offset="1" stop-color="' + gold + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + gid + 'l"><stop offset="0" stop-color="' + mixHex(hz, p.paper, 0.6) + '" stop-opacity=".9"/><stop offset="1" stop-color="' + hz + '" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="48" height="48" fill="url(#' + gid + 's)"/>';
    // the evening light on the side the sun goes down, when it is in front
    if (o.facing != null && !dark && (p.name === "Golden hour" || p.name === "Dusk")) {
      var Ls = lightOf(o.facing, t.date).set;
      if (Ls.side !== "behind") s += '<ellipse cx="' + n(clamp(24 + (Ls.rel * 24) / fov, -8, 56)) + '" cy="' + (HZm - 2) + '" rx="22" ry="10" fill="url(#' + gid + 'l)"/>';
    }
    function gl(x, y, l, op) { return '<path d="M' + n(x) + " " + n(y) + "h" + n(l) + '" stroke="' + lum + '" stroke-width=".7" stroke-linecap="round" opacity="' + op + '"/>'; }
    // vary: a far stand of firs with its own rise and fall and gaps in it,
    // never an even row of same-size teeth
    function trees(x0, x1, base, hh, fill, round, vary) {
      var d = "M" + n(x0) + " " + n(base), x = x0, ph = r() * 6;
      while (x < x1) {
        var env = vary ? 0.55 + 0.45 * Math.sin(x * 0.19 + ph) * Math.sin(x * 0.07 + ph * 2) : 1, h = hh * (0.5 + r() * 0.7) * (vary ? 0.45 + Math.abs(env) : 1);
        if (round) d += "L" + n(x) + " " + n(base - h * 0.7) + "Q" + n(x + 1.2) + " " + n(base - h * 1.1) + " " + n(x + 2.4) + " " + n(base - h * 0.75); else d += "L" + n(x) + " " + n(base - h) + "L" + n(x + 0.9 + r()) + " " + n(base - h * (0.45 + r() * 0.3));
        x += round ? 2.6 + r() * 1.6 : 1.5 + r() * 1.8;
        if (vary && r() < 0.18) { d += "L" + n(x) + " " + n(base - 0.6) + "L" + n(x + 1.4 + r() * 2.4) + " " + n(base - 0.6); x += 1.4 + r() * 2.4; }
      }
      return '<path d="' + d + "L" + n(x1) + " " + n(base) + 'Z" fill="' + fill + '"/>';
    }
    // mountains a card shows, then the land across
    sky.forEach(function (q) {
      if (q.t === "rainier") {
        // its dark lower slopes, the snow above a ragged line, and the side away from the light in shade
        var mx0 = X(q.at), w = 15 * (q.size || 0.8), P9 = function (pts) { return poly(pts.map(function (q9) { return [mx0 + q9[0] * w, HZm - q9[1] * w]; })); };
        var bodyC = mixHex(hz, f1, dark ? 0.15 : 0.32), snowC = mixHex(hz, p.paper, dark ? 0.1 : 0.66);
        s += '<g opacity="' + (dark ? 0.45 : 0.95) + '"><path d="M' + n(mx0 - w) + " " + HZm + "Q" + n(mx0 - w * 0.3) + " " + n(HZm - w * 0.5) + " " + n(mx0 - w * 0.1) + " " + n(HZm - w * 0.62) + "Q" + n(mx0 + 0.4) + " " + n(HZm - w * 0.68) + " " + n(mx0 + w * 0.25) + " " + n(HZm - w * 0.58) + "Q" + n(mx0 + w * 0.5) + " " + n(HZm - w * 0.35) + " " + n(mx0 + w) + " " + HZm + 'Z" fill="' + bodyC + '"/>' +
          '<path d="' + P9([[0.55, 0.3], [1, 0], [0.15, 0], [0.18, 0.2], [0.3, 0.32], [0.42, 0.24]]) + '" fill="' + mixHex(bodyC, f2, 0.3) + '"/>' +
          '<path d="' + P9([[-0.56, 0.29], [-0.35, 0.47], [-0.1, 0.62], [0.07, 0.66], [0.25, 0.58], [0.42, 0.42], [0.55, 0.3], [0.42, 0.24], [0.3, 0.32], [0.18, 0.2], [0.05, 0.33], [-0.08, 0.22], [-0.22, 0.34], [-0.36, 0.25]]) + '" fill="' + snowC + '"/>' +
          '<path d="' + P9([[0.07, 0.66], [0.25, 0.58], [0.42, 0.42], [0.55, 0.3], [0.42, 0.24], [0.3, 0.32], [0.18, 0.2], [0.1, 0.45]]) + '" fill="' + mixHex(snowC, f1, 0.34) + '"/></g>';
      }
      if (q.t === "olympics") { var a = X(q.from), c = X(q.to), d = "M" + n(a) + " " + HZm, xx = a; while (xx < c) { d += "L" + n(xx + 0.8) + " " + n(HZm - 2.4 - r() * 2.6) + "L" + n(xx + 1.7) + " " + n(HZm - 1.4 - r()); xx += 1.8; } s += '<path d="' + d + "L" + n(c) + " " + HZm + 'Z" fill="' + mixHex(hz, p.paper, dark ? 0.05 : 0.55) + '" opacity="' + (dark ? 0.3 : 0.9) + '"/>'; }
    });
    var lands = sky.filter(function (q) { return q.t === "island" || q.t === "shore"; }).sort(function (a, c) { return (c.mi || 5) - (a.mi || 5); });
    lands.forEach(function (q) {
      var a = X(q.from), c = X(q.to), hh = clamp((q.h != null ? q.h : 14 / (q.mi || 5)) * 0.16, 0.8, 4.5), m = (a + c) / 2, base = HZm + clamp(0.5 / (q.mi || 5), 0, 1.2);
      s += '<path d="M' + n(a - 1) + " " + n(base) + "Q" + n(a + (m - a) * 0.4) + " " + n(base - hh) + " " + n(m) + " " + n(base - hh * 1.05) + "Q" + n(c - (c - m) * 0.4) + " " + n(base - hh) + " " + n(c + 1) + " " + n(base) + 'Z" fill="' + mcol(q.mi || 5) + '"/>';
    });
    // a lived-on shore across (Maury, University Place): its house lights
    // after dark, small dots on the land's foot (windows, not lamps)
    if (lampOn) sky.forEach(function (q) {
      if (q.t !== "lights") return;
      var a9 = X(q.from), c9 = X(q.to < q.from ? q.to + 360 : q.to), lr = rnd(sd + 17);
      if (c9 < a9) { var t9 = a9; a9 = c9; c9 = t9; }
      for (var li = 0; li < Math.min(10, q.n || 8); li++) { var lx9 = a9 + lr() * (c9 - a9); if (lx9 > 1 && lx9 < 47) s += '<circle cx="' + n(lx9) + '" cy="' + n(HZm - 0.4 - lr() * 0.6) + '" r=".32" fill="' + gold + '" opacity="' + n(0.6 + lr() * 0.4) + '"/>'; }
    });
    var stand = "", glints = "";
    if (b === "pier" || b === "sound") {
      s += '<rect y="' + HZm + '" width="48" height="' + (48 - HZm) + '" fill="url(#' + gid + 'w)"/>';
      glints = gl(4, HZm + 5, 7, 0.5) + gl(30, HZm + 8, 9, 0.4) + gl(10, HZm + 13, 12, 0.35);
      (o.near || []).forEach(function (q) {
        if (q.t === "breakwater") { var y = Math.min(HZm + 2, 24 + (q.pts[0][1] - HZ) * 0.12), d2 = "M-1 " + n(y + 3), xx = -1; while (xx < 49) { d2 += "Q" + n(xx + 1.5) + " " + n(y - 3.2 - r() * 1.6) + " " + n(xx + 3) + " " + n(y - 0.6); xx += 3; } s += '<path d="' + d2 + "L49 " + n(y + 3) + 'Z" fill="' + f2 + '"/>'; }
        if (q.t === "masts") for (var mi2 = 0; mi2 < 7; mi2++) s += '<path d="M' + n(q.x0 * 0.123 + mi2 * 1.6) + " " + HZm + "v" + n(-4 - r() * 4) + '" stroke="' + f2 + '" stroke-width=".4"/>';
      });
      var pr = o.pier || {};
      if (o.view === "deck") {
        var ey = pr.end === "T" || pr.end === "L" || pr.end === "Lleft" ? 34 : 33, el = pr.end === "T" || pr.end === "Lleft" ? -2 : 17, er = pr.end === "T" || pr.end === "L" ? 50 : 31;
        stand += '<path d="M6 48L' + el + " " + ey + "H" + er + 'L42 48Z" fill="' + mixHex(f3, hz, 0.25) + '"/>';
        stand += '<path d="M' + el + " " + (ey - 2.6) + "H" + er + "M6 44L" + (el + 1) + " " + (ey - 2.4) + "M42 44L" + (er - 1) + " " + (ey - 2.4) + '" stroke="' + f3 + '" stroke-width=".9" fill="none"/>';
        (pr.lamps || []).forEach(function (lx, i2) { var px = 24 + lx * 3; if (px < 1 || px > 47) return; stand += '<path d="M' + n(px) + " " + (ey - 1) + "V" + (ey - 13) + '" stroke="' + f3 + '" stroke-width=".7"/>' + (lampOn ? '<circle cx="' + n(px) + '" cy="' + (ey - 12.5) + '" r="5" fill="url(#' + gid + 'g)"/><circle cx="' + n(px) + '" cy="' + (ey - 12.5) + '" r=".8" fill="' + p.accent2 + '"/>' : ""); });
        if (pr.crowd && lampOn) for (var ci = 0; ci < 4; ci++) { var cx2 = 14 + ci * 6.5 + r() * 2; stand += '<path d="M' + n(cx2) + " " + (ey - 0.4) + "v-5.6" + '" stroke="' + f3 + '" stroke-width="1.8" stroke-linecap="round"/><circle cx="' + n(cx2) + '" cy="' + (ey - 7) + '" r=".95" fill="' + f3 + '"/>' + (pr.own ? '<circle cx="' + n(cx2 + 1.2) + '" cy="' + (ey - 4) + '" r="3.2" fill="url(#' + gid + 'g)"/>' : ""); }
        if (pr.own && lampOn) glints += '<path d="M18 ' + (HZm + 3) + "h6M22 " + (HZm + 5) + 'h7" stroke="' + gold + '" stroke-width=".8" stroke-linecap="round" opacity=".8"/>';
      } else if (o.view === "side") {
        var lft = pr.from === "left", vx = (pr.vx || 200) * 0.123, sx = lft ? -2 : 50, ys = HZm + 6, ex2 = vx + (lft ? -2 : 2);
        stand += '<path d="M' + sx + " " + ys + "L" + n(ex2) + " " + (HZm + 1.2) + "V" + (HZm + 2.2) + "L" + sx + " " + (ys + 2.6) + 'Z" fill="' + f3 + '"/>';
        for (var pi = 0; pi < 6; pi++) { var u = pi / 6, px2 = sx + (ex2 - sx) * u, py = ys + 2.6 - (ys - HZm) * u, ph = 7 * (1 - u) + 1; stand += '<rect x="' + n(px2 - 0.5) + '" y="' + n(py) + '" width="' + n(1.4 * (1 - u) + 0.4) + '" height="' + n(ph) + '" fill="' + f3 + '"/>'; }
        if (pr.end === "T" || pr.end === "L" || pr.end === "Lleft") { var ar = pr.end === "T" ? 3.5 : 5, dirL = (pr.end === "L") !== lft ? 1 : -1; stand += '<rect x="' + n(pr.end === "T" ? ex2 - ar : dirL > 0 ? ex2 : ex2 - ar) + '" y="' + (HZm + 1) + '" width="' + n(pr.end === "T" ? ar * 2 : ar) + '" height="1.1" fill="' + f3 + '"/>'; }
        if (pr.own && lampOn) stand += '<circle cx="' + n(ex2) + '" cy="' + (HZm) + '" r="3" fill="url(#' + gid + 'g)"/>';
      } else if (o.view === "dock" || o.view === "float") {
        stand += '<path d="M10 48L' + n(o.view === "float" ? 21 : 17) + " 36H" + n(o.view === "float" ? 27 : 31) + 'L38 48Z" fill="' + mixHex(f3, hz, 0.3) + '"/><path d="M' + n(o.view === "float" ? 21 : 17) + " 36H" + n(o.view === "float" ? 27 : 31) + '" stroke="' + lum + '" stroke-width=".5" opacity=".6"/>';
      }
      // the parts placed in metres, as the big scene places them, small: the
      // ground and the shapes a spot is known by drawn from the same plan
      // (scene shapes scaled into the tile), lines only where a line is the thing
      if (o.parts || o.ground) {
        var wm = world(V, o, t), M = function (q) { return [(q[0] - 39) * 0.154, HZm + (q[1] - HZ) * 0.154]; }, mp = "", ml = "", mlit = "", tone2 = mixHex(f3, hz, 0.12), back2 = "", front2 = "";
        var G = function (d, fill, op) { return '<g transform="translate(-6.006 ' + n(HZm - HZ * 0.154) + ') scale(.154)"><path d="' + d + '" fill="' + fill + '"' + (op ? ' opacity="' + op + '"' : "") + "/></g>"; };
        if (o.ground && wm.edgeZ != null) { var ye = M(wm.P(0, wm.wl, wm.edgeZ))[1]; if (ye < 48) { s += '<path d="M0 ' + n(ye) + "Q16 " + n(ye - 0.8) + " 30 " + n(ye + 0.5) + "T48 " + n(ye) + 'V48H0Z" fill="' + mixHex(p.ground, p.water[0], dark ? 0.3 : 0.38) + '"/><path d="M0 ' + n(ye + 4) + "Q22 " + n(ye + 2.6) + " 48 " + n(ye + 4.4) + 'V48H0Z" fill="' + mixHex(sand, p.ink, dark ? 0.1 : 0.08) + '"/><path d="M0 44Q20 42.5 48 44.5V48H0Z" fill="' + mixHex(sand, p.ink, dark ? 0.18 : 0.22) + '"/><path d="M5 ' + n(ye + 6) + "q3 -.5 6 0M22 " + n(ye + 7) + "q3 -.5 6 0M36 " + n(ye + 5.5) + 'q3 -.5 6 0" stroke="' + f3 + '" stroke-width=".4" fill="none" opacity=".35"/>' +
          // a beach with nothing placed on it (the Dash Point state park): its flats, a pool the tide left and the ripples
          ((o.parts || []).some(function (q9) { return q9.t === "pier" || q9.t === "kayak"; }) ? "" : '<ellipse cx="30" cy="' + n(ye + 3.2) + '" rx="7" ry=".8" fill="' + mixHex(p.water[0], hz, 0.4) + '" opacity=".8"/><path d="M3 ' + n(ye + 2.6) + "q2 -.4 4 0M12 " + n(ye + 3.4) + "q2 -.4 4 0M40 " + n(ye + 2.4) + "q2 -.4 4 0M16 " + n(ye + 9) + "q3 -.6 6 0M30 " + n(ye + 10) + 'q3 -.6 6 0" stroke="' + lum + '" stroke-width=".4" fill="none" opacity=".45"/>'); glints += gl(6, ye + 1.5, 9, 0.4); } }
        (o.parts || []).forEach(function (q) {
          if (q.t === "ground") {
            var gc = /lawn/.test(q.cls || "w-lawn") ? mixHex(f3, hz, dark ? 0.12 : 0.3) : mixHex(sand, f3, dark ? 0.2 : 0.32);
            var pts3 = q.pts.map(function (a) { return [a[0], a[2] == null ? (q.y == null ? wm.E - 1.6 : q.y) : a[2], a[1]]; });
            front2 += G(poly3(q.frame === "view" ? frameOf(wm, q) : wm, pts3), gc);
          }
          if (q.t === "pier") q.segs.forEach(function (sg, si) {
            var A = M(wm.P(sg.a[0], q.deck, sg.a[1])), B = M(wm.P(sg.b[0], q.deck, sg.b[1])), wd = clamp(sg.w * wm.fl * 0.154 / Math.max(8, wm.sz((sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2)), 0.6, 2.6);
            mp += '<path d="M' + n(A[0]) + " " + n(A[1]) + "L" + n(B[0]) + " " + n(B[1]) + '" stroke="' + tone2 + '" stroke-width="' + n(wd) + '" stroke-linecap="square"/>';
            F(clamp(A[0], 0, 48), A[1], clamp(B[0], 0, 48), B[1] + 2);
            var Ls = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]), stepL = Math.max(4, Math.min(q.bent || 6, Ls / 3) * 1.6);
            for (var dd = 0; dd <= Ls + 0.01; dd += stepL) { var u = dd / Ls, X = sg.a[0] + (sg.b[0] - sg.a[0]) * u, Z = sg.a[1] + (sg.b[1] - sg.a[1]) * u, top = M(wm.P(X, q.deck, Z)), bot = M(wm.P(X, wm.foot(X, Z), Z)); if (wm.sz(X, Z) > 2 && top[0] > -2 && top[0] < 50) mp += '<path d="M' + n(top[0]) + " " + n(top[1]) + "V" + n(bot[1]) + '" stroke="' + f3 + '" stroke-width="' + n(clamp(wd * 0.35, 0.4, 0.9)) + '"/>'; }
            // small roofed shelters on it (Les Davis): a dark roof over the deck
            (q.shelters || []).forEach(function (sh) { if (sh[0] !== si) return; var uc = (sh[1] + sh[2]) / 2 / Ls, Xc = sg.a[0] + (sg.b[0] - sg.a[0]) * uc, Zc = sg.a[1] + (sg.b[1] - sg.a[1]) * uc, R0 = M(wm.P(Xc, q.deck + 3.4, Zc)), hw3 = Math.max(1.4, (sh[2] - sh[1]) * wm.fl * 0.154 / Math.max(8, wm.sz(Xc, Zc)) * 0.5); mp += '<path d="M' + n(R0[0] - hw3) + " " + n(R0[1] + 1) + "L" + n(R0[0]) + " " + n(R0[1] - 0.6) + "L" + n(R0[0] + hw3) + " " + n(R0[1] + 1) + 'Z" fill="' + f3 + '"/><path d="M' + n(R0[0]) + " " + n(R0[1] + 1) + "V" + n(M(wm.P(Xc, q.deck, Zc))[1]) + '" stroke="' + f3 + '" stroke-width=".4"/>'; });
          });
          if (q.t === "pier" && q.lamps) (Array.isArray(q.lamps) ? q.lamps : [q.lamps]).forEach(function (lp) {
            (lp.segs || q.segs.map(function (_, i9) { return i9; })).forEach(function (si2) {
              var sg2 = q.segs[si2], L = Math.hypot(sg2.b[0] - sg2.a[0], sg2.b[1] - sg2.a[1]);
              for (var d = lp.from == null ? 6 : lp.from; d <= Math.min(L, lp.to == null ? L : lp.to); d += lp.every || 20) {
                var X2 = sg2.a[0] + (sg2.b[0] - sg2.a[0]) * d / L, Z2 = sg2.a[1] + (sg2.b[1] - sg2.a[1]) * d / L, b2 = M(wm.P(X2, q.deck, Z2)), t2 = M(wm.P(X2, q.deck + (lp.h || 5), Z2));
                if (t2[0] < -1 || t2[0] > 49 || wm.sz(X2, Z2) < 2) continue;
                ml += '<path d="M' + n(b2[0]) + " " + n(b2[1]) + "V" + n(t2[1]) + '" stroke="' + f3 + '" stroke-width=".5"/>';
                F(t2[0], t2[1] - 1, t2[0], b2[1]);
                if (lampOn) mlit += '<circle cx="' + n(t2[0]) + '" cy="' + n(t2[1]) + '" r="3.4" fill="url(#' + gid + 'g)"/><circle cx="' + n(t2[0]) + '" cy="' + n(t2[1]) + '" r=".7" fill="' + p.accent2 + '"/><path d="M' + n(t2[0] - 0.8) + " " + n(Math.max(b2[1] + 2, HZm + 2)) + "h1.6M" + n(t2[0] - 1.2) + " " + n(Math.max(b2[1] + 4, HZm + 4)) + 'h2.4" stroke="' + gold + '" stroke-width=".7" opacity=".8"/>';
                else if (lp.kind === "lantern") ml += '<rect x="' + n(t2[0] - 0.6) + '" y="' + n(t2[1] - 1) + '" width="1.2" height="1.3" fill="' + f3 + '"/>';
              }
            });
          });
          if (q.t === "float") {
            var across = Math.abs(q.a[1] - q.b[1]) < 1;
            if (across && o.site) {
              // turned along the view (Westport's Float 20): its deck running
              // away from your feet, its cleats along the far edge, a crab ring set down on it
              var fy9 = wm.wl + 0.45, hw9 = q.w / 2, nE9 = [], fE9 = [], cl9 = "", pk9 = "";
              for (var fx9 = q.a[0]; fx9 <= q.b[0]; fx9 += 1.2) {
                if (wm.sz(fx9, q.a[1] - hw9) < 1.2 || wm.sz(fx9, q.a[1] + hw9) < 1.2) continue;
                var nq9 = M(wm.P(fx9, fy9, q.a[1] - hw9)), fq9 = M(wm.P(fx9, fy9, q.a[1] + hw9));
                if (nq9[0] > 60 && fq9[0] > 60) continue;
                nE9.push(nq9); fE9.push(fq9);
                if (q.cleats && Math.abs((fx9 - q.a[0]) % q.cleats) < 0.6) { var cq9 = M(wm.P(fx9, fy9, q.a[1] + hw9 * 0.86)), cs9 = clamp(wm.fl * 0.154 * 0.25 / Math.max(2, wm.sz(fx9, q.a[1] + hw9)), 0.5, 1.6); cl9 += poly([[cq9[0] - cs9, cq9[1]], [cq9[0] + cs9, cq9[1]], [cq9[0] + cs9 * 0.6, cq9[1] - cs9 * 0.7], [cq9[0] - cs9 * 0.6, cq9[1] - cs9 * 0.7]]); }
                if (Math.round(fx9 / 1.2) % 2) pk9 += "M" + n(nq9[0]) + " " + n(nq9[1]) + "L" + n(fq9[0]) + " " + n(fq9[1]);
              }
              if (nE9.length > 1) {
                front2 += '<path d="' + poly(nE9.concat(fE9.slice().reverse())) + '" fill="' + mixHex(f2, hz, dark ? 0.1 : 0.3) + '"/><path d="' + pk9 + '" stroke="' + f3 + '" stroke-width=".3" opacity=".35"/>' +
                  '<path d="' + line(fE9) + '" stroke="' + lum + '" stroke-width=".55" fill="none" opacity="' + (dark ? 0.3 : 0.7) + '"/><path d="' + cl9 + '" fill="' + f3 + '"/>';
                var fFar = fE9[fE9.length - 1];
                F(clamp(fFar[0] - 22, 0, 48), fFar[1] - 4, clamp(fFar[0] + 2, 0, 48), Math.min(48, fFar[1] + 12));
              }
              if (q.rings && !dark) q.rings.slice(0, 1).forEach(function (rg) {
                var rx9 = q.a[0] + rg[0], rz9 = q.a[1] - rg[1], RC = M(wm.P(rx9, fy9 + 0.02, rz9)), rr9 = clamp(0.42 * wm.fl * 0.154 / Math.max(2, wm.sz(rx9, rz9)), 1.4, 4);
                front2 += '<ellipse cx="' + n(RC[0]) + '" cy="' + n(RC[1]) + '" rx="' + n(rr9) + '" ry="' + n(rr9 * 0.42) + '" fill="none" stroke="' + f3 + '" stroke-width=".6"/><ellipse cx="' + n(RC[0] + rr9 * 1.7) + '" cy="' + n(RC[1] - 0.2) + '" rx="' + n(rr9 * 0.38) + '" ry="' + n(rr9 * 0.28) + '" fill="' + mixHex(gold, f2, 0.3) + '"/>';
                F(RC[0] - rr9 - 1, RC[1] - 2, RC[0] + rr9 * 2.2, RC[1] + 2);
              });
            }
            else if (across) { front2 += '<path d="M-1 41.5H49V48H-1Z" fill="' + mixHex(f3, hz, 0.28) + '"/><path d="M-1 41.5H49" stroke="' + lum + '" stroke-width=".5" opacity=".6"/>'; if (q.cleats) for (var cx9 = 4; cx9 < 48; cx9 += 11) front2 += '<path d="M' + cx9 + ' 41.6h2.4l-.5-.9h-1.4z" fill="' + f3 + '"/>'; }
            else { var FA = M(wm.P(q.a[0], wm.wl + 0.4, Math.max(3, q.a[1]))), FB = M(wm.P(q.b[0], wm.wl + 0.4, q.b[1])); mp += '<path d="M' + n(FA[0]) + " " + n(FA[1]) + "L" + n(FB[0]) + " " + n(FB[1]) + '" stroke="' + tone2 + '" stroke-width=".9"/>'; }
          }
          if (q.t === "house") {
            var hWall = q.wall === "w-wallw" ? mixHex(hz, p.paper, dark ? 0.1 : 0.7) : mixHex(f2, p.paper, 0.3), hRoof = q.roofc === "w-roofg" ? ' style="fill:color-mix(in oklab,' + mixHex(f2, hz, dark ? 0.1 : 0.45) + ' 58%,var(--go))"' : "", Yh = q.y || 0, Zf = q.at[1] - q.d / 2, Zb = q.at[1] + q.d / 2;
            if (wm.sz(q.at[0], Zf) >= 4) {
              var H0 = M(wm.P(q.at[0] - q.w / 2, Yh, Zf)), H1 = M(wm.P(q.at[0] + q.w / 2, Yh + q.h, Zf)), rw2 = (H1[0] - H0[0]) * 0.22;
              F(clamp(H0[0], 0, 48), H0[1], clamp(H1[0], 0, 48), H1[1] - 2);
              mp += '<path d="M' + n(H0[0]) + " " + n(H0[1]) + "H" + n(H1[0]) + "V" + n(H1[1]) + "H" + n(H0[0]) + 'Z" fill="' + hWall + '"/><path d="M' + n(H0[0] - 0.6) + " " + n(H1[1]) + "L" + n(H0[0] + rw2) + " " + n(H1[1] - 1.6) + "L" + n(H1[0] - rw2) + " " + n(H1[1] - 1.6) + "L" + n(H1[0] + 0.6) + " " + n(H1[1]) + 'Z" fill="' + f3 + '"' + hRoof + "/>";
              if (lampOn && q.lit !== false) mlit += '<circle cx="' + n((H0[0] + H1[0]) / 2) + '" cy="' + n((H0[1] + H1[1]) / 2) + '" r="2.4" fill="url(#' + gid + 'g)"/>';
            } else {
              // its front is beside or behind you: the long side you see, its wall and roof running away
              var sX = Math.abs(q.at[0] - q.w / 2) < Math.abs(q.at[0] + q.w / 2) ? q.at[0] - q.w / 2 : q.at[0] + q.w / 2, zA = Zf, zB = Zb;
              for (var zz2 = Zf; zz2 < Zb && wm.sz(sX, zz2) < 4; zz2 += 0.5) zA = zz2;
              var S0 = M(wm.P(sX, Yh, zA)), S1 = M(wm.P(sX, Yh, zB)), S2 = M(wm.P(sX, Yh + q.h, zB)), S3 = M(wm.P(sX, Yh + q.h, zA)), R2 = M(wm.P(sX + (sX > 0 ? 3 : -3), Yh + q.h + (q.rh || 1.5), zB)), R3 = M(wm.P(sX + (sX > 0 ? 3 : -3), Yh + q.h + (q.rh || 1.5), zA));
              mp += '<path d="' + poly([S0, S1, S2, S3]) + '" fill="' + hWall + '"/><path d="' + poly([S3, S2, R2, R3]) + '" fill="' + f3 + '"' + hRoof + "/>";
            }
          }
          // rocks as rocks: a heap of grey blocks along their line
          if (q.t === "rocks") {
            var rr9 = rnd(Math.round(q.pts[0][0] * 7 + q.pts[0][1])), heap = "", rcol = mixHex(f2, f3, q.cls === "w-riprap" || q.dry ? 0.7 : 0.35);
            for (var ri9 = 0; ri9 < q.pts.length - 1; ri9++) for (var uu = 0; uu < 1; uu += 0.34) {
              var Xr = q.pts[ri9][0] + (q.pts[ri9 + 1][0] - q.pts[ri9][0]) * uu, Zr = q.pts[ri9][1] + (q.pts[ri9 + 1][1] - q.pts[ri9][1]) * uu, Yr = q.y != null ? q.y : wm.foot(Xr, Zr), Rc = M(wm.P(Xr, Yr, Zr)), rs9 = clamp(q.pts[ri9][2] * wm.fl * 0.154 / Math.max(3, wm.sz(Xr, Zr)), 0.7, 4.5) * (0.7 + rr9() * 0.6);
              if (Rc[0] < -4 || Rc[0] > 52 || wm.sz(Xr, Zr) < 2) continue;
              heap += "M" + n(Rc[0] - rs9) + " " + n(Rc[1]) + "L" + n(Rc[0] - rs9 * 0.7) + " " + n(Rc[1] - rs9 * (0.6 + rr9() * 0.5)) + "L" + n(Rc[0] + rs9 * 0.3) + " " + n(Rc[1] - rs9 * (0.8 + rr9() * 0.5)) + "L" + n(Rc[0] + rs9) + " " + n(Rc[1]) + "Z";
            }
            mp += '<path d="' + heap + '" fill="' + rcol + '"/>';
            if (q.reflect) F(4, HZm - 4, 44, HZm + 8);
          }
          if (q.t === "tree") { var Tb = M(wm.P(q.at[0], q.y == null ? wm.E - 1.6 : q.y, q.at[1])), Th = q.h * wm.fl * 0.154 / Math.max(3, wm.sz(q.at[0], q.at[1])); front2 += '<path d="M' + n(Tb[0] - 0.8) + " " + n(Tb[1]) + "L" + n(Tb[0] - 0.4) + " " + n(Tb[1] - Th * 0.4) + "L" + n(Tb[0] - Th * 0.3) + " " + n(Tb[1] - Th) + "M" + n(Tb[0] - 0.4) + " " + n(Tb[1] - Th * 0.4) + "L" + n(Tb[0] + Th * 0.1) + " " + n(Tb[1] - Th * 0.9) + '" stroke="' + f3 + '" stroke-width="1.1" fill="none"/>'; }
          // the kayak where it lies, at its own size: its lit deck over the dark side of its hull, the seat well, its shadow on the sand
          if (q.t === "kayak") {
            var kz = q.z || Math.max(6, (wm.edgeZ || 8) - 2.2), ky = wm.foot(q.x, kz) + 0.02, ka = q.angle || 0.35, kc = Math.cos(ka), ks = Math.sin(ka);
            var KB = M(wm.P(q.x + kc * 1.95, ky + 0.34, kz + ks * 1.95)), KS = M(wm.P(q.x - kc * 1.95, ky + 0.3, kz - ks * 1.95)), KM = M(wm.P(q.x, ky, kz)), kth = clamp(0.55 * wm.fl * 0.154 / Math.max(2, wm.sz(q.x, kz)), 1.6, 3.6);
            var kd = [KB[0] - KS[0], KB[1] - KS[1]], kp = function (u, h) { return [KS[0] + kd[0] * u, KS[1] + kd[1] * u - h * kth]; };
            front2 += '<ellipse cx="' + n(KM[0] + 1) + '" cy="' + n(KM[1] + kth * 0.5) + '" rx="' + n(Math.hypot(kd[0], kd[1]) * 0.5) + '" ry="' + n(kth * 0.45) + '" fill="' + f3 + '" opacity=".3"/>' +
              '<path d="' + poly([kp(0, 0.35), kp(0.2, 0.5), kp(0.8, 0.5), kp(1, 0.55), kp(0.8, -0.1), kp(0.25, -0.15)]) + '" fill="' + f3 + '"/>' +
              '<path d="' + poly([kp(0.01, 0.42), kp(0.2, 0.98), kp(0.75, 0.98), kp(0.99, 0.62), kp(0.75, 0.42), kp(0.2, 0.4)]) + '" fill="' + mixHex(f2, p.paper, dark ? 0.2 : 0.64) + '"/>' +
              '<ellipse cx="' + n(kp(0.48, 0.72)[0]) + '" cy="' + n(kp(0.48, 0.72)[1]) + '" rx="' + n(Math.hypot(kd[0], kd[1]) * 0.1) + '" ry="' + n(kth * 0.18) + '" fill="' + f3 + '"/>' +
              (lampOn ? '<circle cx="' + n(kp(0.08, 0.9)[0]) + '" cy="' + n(kp(0.08, 0.9)[1]) + '" r="4" fill="url(#' + gid + 'l)"/><circle cx="' + n(kp(0.08, 0.9)[0]) + '" cy="' + n(kp(0.08, 0.9)[1]) + '" r=".55" fill="' + p.ink + '"/>' : "");
            F(Math.min(KS[0], KB[0]) - 3, Math.min(KS[1], KB[1]) - kth - 3, Math.max(KS[0], KB[0]) + 3, Math.max(KS[1], KB[1]) + kth + 1);
          }
          // the person fishing it, by day: at the tide's edge, a dark figure and the rod
          if (q.t === "angler" && !lampOn) {
            var aZ = typeof q.z === "object" ? clamp((wm.edgeZ == null ? 30 : wm.edgeZ) - (q.z.edge || 0), q.z.min || 8, q.z.max || 60) : q.z, aP = M(wm.P(q.x, wm.foot(q.x, aZ), aZ)), ah = Math.max(7, 1.75 * wm.fl * 0.154 / aZ);
            front2 += '<path d="M' + n(aP[0] - ah * 0.13) + " " + n(aP[1]) + "L" + n(aP[0] - ah * 0.1) + " " + n(aP[1] - ah * 0.55) + "L" + n(aP[0] - ah * 0.15) + " " + n(aP[1] - ah * 0.85) + "L" + n(aP[0] + ah * 0.15) + " " + n(aP[1] - ah * 0.85) + "L" + n(aP[0] + ah * 0.1) + " " + n(aP[1] - ah * 0.55) + "L" + n(aP[0] + ah * 0.13) + " " + n(aP[1]) + 'Z" fill="' + f3 + '"/>' +
              '<circle cx="' + n(aP[0]) + '" cy="' + n(aP[1] - ah * 0.93) + '" r="' + n(ah * 0.1) + '" fill="' + f3 + '"/><path d="M' + n(aP[0] + ah * 0.12) + " " + n(aP[1] - ah * 0.6) + "Q" + n(aP[0] + ah * 0.6) + " " + n(aP[1] - ah * 1.6) + " " + n(aP[0] + ah * 1.1) + " " + n(aP[1] - ah * 1.75) + '" stroke="' + f3 + '" stroke-width=".45" fill="none"/>' +
              '<path d="M' + n(aP[0] - ah * 0.3) + " " + n(aP[1] + 0.3) + "h" + n(ah * 0.6) + '" stroke="' + mixHex(f3, hz, 0.5) + '" stroke-width=".5" opacity=".6"/>';
            F(aP[0] - ah * 0.8, aP[1] - ah * 1.6, aP[0] + ah * 1.2, aP[1] + 3);
          }
          // a seawall's rail: a short run with its posts at one side, never a line across the tile
          if (q.t === "rail") front2 += '<path d="M30 42.6H49M30 44.2H49M31 41.8V46.4M37 41.8V46.4M43 41.8V46.4M48.6 41.8V46.4" stroke="' + f3 + '" stroke-width=".6"/>';
        });
        stand += mp + ml + front2 + mlit;
      }
      if (o.glow === "behind" && lampOn) s += '<ellipse cx="24" cy="' + (HZm - 2) + '" rx="30" ry="7" fill="url(#' + gid + 'g)" opacity=".45"/>';
      (o.bank || []).forEach(function (q) {
        if (q.t === "flats") { var yw = 33 + t.tide * 7; s += '<path d="M0 ' + n(yw) + "Q16 " + n(yw - 1.4) + " 30 " + n(yw + 0.6) + "T48 " + n(yw) + 'V48H0Z" fill="' + mixHex(p.ground, p.water[0], dark ? 0.3 : 0.4) + '"/><path d="M0 44Q20 42 48 44V48H0Z" fill="' + sand + '"/>'; glints += gl(6, yw + 3, 9, 0.45) + gl(26, yw + 5, 11, 0.35); }
        if (q.t === "cobbles") { s += '<path d="M0 43Q20 41 48 43V48H0Z" fill="' + sand + '"/>'; for (var k2 = 0; k2 < 8; k2++) s += '<circle cx="' + n(r() * 48) + '" cy="' + n(44 + r() * 3) + '" r=".5" fill="' + p.ink + '" opacity=".3"/>'; }
        if (q.t === "lawn") s += '<path d="M48 36L34 39L30 48H48Z" fill="' + mixHex(f3, hz, 0.15) + '"/>';
      });
      s += glints + stand;
    } else if (b === "lake") {
      var lk = o.lake || {}, shores = lk.shores || [{ from: V.f - 80, to: V.f + 80, m: lk.across || 300, houses: lk.houses }];
      s += '<rect y="' + HZm + '" width="48" height="' + (48 - HZm) + '" fill="url(#' + gid + 'w)"/>';
      shores.slice().sort(function (a, c) { return c.m - a.m; }).forEach(function (q) {
        var a = Math.max(-2, X(q.from)), c = Math.min(50, X(q.to)), hh = clamp(26 * 3.4 / q.m * 10, 1.4, 16), col = q.m < 160 ? f3 : q.m < 450 ? f2 : f1;
        s += trees(a, c, HZm + 0.5, hh, col, true);
        s += '<g transform="translate(0 ' + n(2 * HZm + 1) + ') scale(1 -1)" opacity=".35">' + trees(a, c, HZm + 0.5, hh * 0.8, col, true) + "</g>";
        // houses in a group or two; where the card says no lighting, never a gold lamp
        if (q.houses) for (var hi = 0; hi < Math.min(4, q.houses); hi++) { var hx = a + ((hi < 2 ? hi * 0.09 + 0.22 : hi * 0.08 + 0.55) + r() * 0.04) * (c - a), dimH = lk.lights === false; s += '<rect x="' + n(hx - 1.1) + '" y="' + (HZm - 1.5) + '" width="2.2" height="1.5" fill="' + (lampOn && !dimH ? gold : lampOn ? mixHex(f2, gold, 0.25) : mixHex(hz, p.paper, 0.5)) + '" opacity="' + (lampOn ? (dimH ? 0.5 : 0.9) : 0.8) + '"/>'; }
      });
      (lk.islands || []).forEach(function (q) { var a = X(q.from), c = X(q.to), hh = clamp(26 * 3.4 / q.m * 10, 1.2, 14); s += trees(Math.min(a, c), Math.max(a, c), HZm + 0.6, hh, q.m < 300 ? f3 : f1, true); });
      s += gl(28, HZm + 5, 9, 0.5) + gl(10, HZm + 8, 8, 0.4) + gl(20, HZm + 12, 12, 0.35);
      if (within(t.date, lk.drawdown)) s += '<path d="M0 40Q8 38 14 48H0Z" fill="' + sand + '"/><path d="M48 39Q38 38 35 48H48Z" fill="' + sand + '"/><path d="M4 41v-3M8 43v-2.6M42 41v-3.2" stroke="' + mixHex(f3, sand, 0.35) + '" stroke-width="1.2"/>';
      if (lk.wetland) s += '<path d="M48 31Q38 32 34 36L48 38Z" fill="' + mixHex(f3, hz, 0.2) + '"/>';
      if (lk.nearTree) {
        // the big shore tree at the side: its trunk and limbs, its crown a dark mass
        var tx9 = 44 + (lk.nearTree.x - 390) * 0.12, cr9 = "";
        for (var ci9 = 0; ci9 < 7; ci9++) { var ca9 = ci9 / 7 * Math.PI * 2, cx9 = tx9 - 3 + Math.cos(ca9) * 6 + (r() - 0.5) * 3, cy9 = 15 + Math.sin(ca9) * 5 + (r() - 0.5) * 3; cr9 += '<circle cx="' + n(cx9) + '" cy="' + n(cy9) + '" r="' + n(3.4 + r() * 2) + '"/>'; }
        s += '<g fill="' + f3 + '">' + (bare(t.date) ? '<g opacity=".55">' + cr9 + "</g>" : cr9) + '<path d="M' + n(tx9 - 1.4) + ' 48L' + n(tx9 - 0.8) + ' 20L' + n(tx9 - 5) + ' 12L' + n(tx9 - 0.2) + ' 18L' + n(tx9 + 0.4) + ' 9L' + n(tx9 + 0.9) + ' 20L' + n(tx9 + 1.6) + ' 48Z"/></g>';
        F(tx9 - 12, 8, 48, 40);
      }
      if (lk.stand === "dock" || lk.stand === "pier") { s += '<path d="M14 48L19 37H29L34 48Z" fill="' + (dark ? mixHex(f3, p.ink2, 0.16) : mixHex(f3, hz, 0.3)) + '"/><path d="M19 37H29" stroke="' + lum + '" stroke-width=".5" opacity="' + (dark ? 0.25 : 0.6) + '"/>'; F(14, 34, 34, 48); }
      // a launch is not a dock: gravel is a low fan with a ragged lip and
      // its stones; concrete a narrow slab with its grooves, going under
      if (lk.stand === "gravel") {
        var gst = "";
        for (var gi = 0; gi < 10; gi++) gst += '<circle cx="' + n(14 + r() * 20) + '" cy="' + n(41 + r() * 6) + '" r="' + n(0.35 + r() * 0.4) + '" fill="' + f3 + '" opacity=".55"/>';
        // the banks either side dark, the gravel between pale, its two ruts and its wet lip
        s += '<path d="M0 48V42Q10 40 15 39.4L18 38.8L21 39.4L24 38.6L27 39.3L30 38.9L34 39.8Q40 41 48 42V48Z" fill="' + mixHex(f3, hz, 0.12) + '"/><path d="M8 48Q16 41.5 24 40.2Q32 41.5 40 48Z" fill="' + mixHex(sand, p.paper, dark ? 0 : 0.2) + '"/>' +
          '<path d="M19.4 48L22.8 42M28.6 48L25.2 42" stroke="' + mixHex(f3, sand, 0.45) + '" stroke-width="1" opacity=".5"/><path d="M15.5 42.4Q24 39.6 32.5 42.4" stroke="' + mixHex(f3, p.water[1], 0.4) + '" stroke-width="1.3" fill="none" opacity=".6"/>' + gst;
        F(8, 34, 40, 48);
      }
      if (lk.stand === "ramp") s += '<path d="M0 48V43Q12 41 18 40H30Q36 41 48 43V48Z" fill="' + mixHex(f3, hz, 0.35) + '"/><path d="M17 48L21.6 39.6H26.4L31 48Z" fill="' + mixHex(sand, f3, dark ? 0.25 : 0.42) + '"/><path d="M21.2 42.2h5.6M20.4 44.6h7.2" stroke="' + f3 + '" stroke-width=".35" fill="none" opacity=".45"/><path d="M21.6 39.6H26.4" stroke="' + mixHex(p.water[0], hz, 0.3) + '" stroke-width="1.2" opacity=".7"/>';
      if (lk.stand === "ramp") F(12, 36, 36, 48);
      if (lk.bank) s += lk.bank.side !== "right" ? '<path d="M0 48V38Q6 39 12 48Z" fill="' + f3 + '"/>' : "";
      if (lk.bank && lk.bank.side !== "left") s += '<path d="M48 48V37Q41 39 35 48Z" fill="' + f3 + '"/>';
    } else if (b === "river") {
      var rv = o.river || {}, fk = rv.fields ? "plain" : (rv.far || {}).kind, winter = bare(t.date), lv = t.river;
      // today's river: clear and dark when low, up and coloured with silt when high
      var silt = mixHex(sand, p.water[0], 0.25), wTop = mixHex(mixHex(p.water[0], hz, 0.35), silt, lv * 0.55), wBot = mixHex(mixHex(p.water[1], f3, (1 - lv) * 0.25), silt, lv * 0.5);
      s += '<defs><linearGradient id="' + gid + 'r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + wTop + '"/><stop offset="1" stop-color="' + wBot + '"/></linearGradient></defs><rect y="' + HZm + '" width="48" height="' + (48 - HZm) + '" fill="url(#' + gid + 'r)"/>';
      if (rv.valley) s += '<path d="M-1 ' + HZm + 'L-1 8Q10 10 24 22Q34 6 49 4V' + HZm + 'Z" fill="' + f0 + '"/>';
      if (rv.creek) s += trees(-1, 49, HZm, 11, f1, false, true) + trees(-1, 49, HZm + 0.4, 7, mixHex(f2, f3, 0.35), false, true);
      else s += trees(-1, 49, HZm, fk === "plain" ? 2 : fk === "cottonwood" ? 12 : rv.reach ? 6 : rv.grove ? 9 : 15, fk === "cottonwood" && winter ? mixHex(hz, p.shore, 0.38) : fk === "plain" || rv.grove || rv.reach ? f1 : f2, fk !== "plain");
      for (var ri = 0; ri < 5; ri++) s += gl(4 + r() * 36, HZm + 3 + ri * 3.6, 4 + ri * 1.5, 0.5 - ri * 0.05);
      if (rv.creek) {
        // the creek pouring in from your bank: its tongue of paler water
        // between the dark bank of firs at your left and the low bank right
        // of it, the foam where it meets the river, the eddy turning there
        var ck = (rv.creek.x - 39) * 0.154;
        // (darker water than the river, coming out from under its bank's firs, the foam where it meets the river)
        s += '<path d="M' + n(ck - 6) + ' 48L' + n(ck - 3) + " " + (HZm + 6) + "L" + n(ck + 3) + " " + (HZm + 5) + "L" + n(ck + 4) + ' 48Z" fill="' + mixHex(p.water[1], f3, 0.3) + '"/>' +
          '<path d="M' + n(ck - 4) + " " + (HZm + 6.5) + "q3 -1.2 7 -.6M" + n(ck - 2) + " " + (HZm + 8.5) + "q4 -1 9 .4M" + n(ck + 4) + " " + (HZm + 6) + "q4 1.6 10 .8" + '" stroke="' + lum + '" stroke-width=".55" fill="none" opacity=".75"/>' +
          '<path d="M' + n(ck + 6) + " " + (HZm + 10) + "q5 -2.4 11 -1M" + n(ck + 8) + " " + (HZm + 12.5) + "q4 1.4 9 .2" + '" stroke="' + lum + '" stroke-width=".4" fill="none" opacity=".45"/>' +
          trees(-1, ck - 4, HZm + 8, 22, f3, false) + '<path d="M-1 48V' + (HZm + 7) + "L" + n(ck - 4) + " " + (HZm + 6) + "L" + n(ck - 7) + ' 48Z" fill="' + f3 + '"/>' +
          '<path d="M' + n(ck + 4) + ' 48L' + n(ck + 4) + " " + (HZm + 13) + "Q" + n(ck + 14) + " " + (HZm + 14) + " " + n(ck + 22) + ' 48Z" fill="' + mixHex(f3, hz, 0.22) + '"/>';
        F(0, HZm - 18, 30, 46);
      }
      if (rv.bar && !rv.reach) { F(0, 20, 30, 48); var bo = (lv - 0.35) * 8; s += '<path d="M0 ' + n(36 + bo) + "Q" + n(14 - bo) + " " + n(37 + bo) + " " + n(24 - bo) + " " + n(42 + bo * 0.6) + "T" + n(34 - bo * 0.8) + ' 48H0Z" fill="' + sand + '"/>'; }
      if (rv.steps) { s += '<path d="M28 37.6L48 37V39.6L25 40.4Z" fill="' + mixHex(f2, p.paper, 0.45) + '"/><path d="M25 40.4L48 39.6V42.6L21 43.6Z" fill="' + mixHex(f2, p.paper, 0.3) + '"/><path d="M21 43.6L48 42.6V48H16Z" fill="' + mixHex(f2, p.paper, 0.12) + '"/><path d="M28 37.6L48 37M25 40.4L48 39.6M21 43.6L48 42.6" stroke="' + f3 + '" stroke-width=".7"/>'; F(16, 30, 48, 48); }
      if (rv.rods) { s += '<path d="M0 32L12 36L18 48H0Z" fill="' + sand + '"/><path d="M3 33l4-5M8 35l5-6M13 39l6-7" stroke="' + f3 + '" stroke-width=".5"/>'; F(0, 26, 20, 46); }
      if (rv.weir) s += '<path d="M0 35H16V37H0Z" fill="' + mixHex(p.ground, p.paper, 0.35) + '"/><path d="M0 37H17L15 39H0Z" fill="' + lum + '" opacity=".7"/>';
      if (rv.trunk) s += '<path d="M43 48L44 0H47L49 48Z" fill="' + f3 + '"/><path d="M44 12L34 2M44 20L36 14" stroke="' + f3 + '" stroke-width=".9"/>';
      if (rv.glacial) s += '<rect y="' + HZm + '" width="48" height="' + (48 - HZm) + '" fill="' + mixHex(hz, p.paper, 0.2) + '" opacity=".35"/>';
      // Orting's braid: gravel islands with body, in rows, bigger near you
      if (rv.braid && rv.flow !== "along" && lv < 0.9) { var bz = 1 - lv; s += '<path d="M2 ' + (HZm + 2.4) + 'Q9 ' + n(HZm + 2.4 - 1.2 * bz) + " 17 " + (HZm + 2.4) + 'Q9 ' + n(HZm + 3.2) + " 2 " + (HZm + 2.4) + 'ZM22 ' + (HZm + 2.8) + 'Q29 ' + n(HZm + 2.8 - 1.2 * bz) + " 36 " + (HZm + 2.8) + 'Q29 ' + n(HZm + 3.6) + " 22 " + (HZm + 2.8) + 'ZM-1 ' + (HZm + 7) + 'Q12 ' + n(HZm + 7 - 2.8 * bz) + " 27 " + (HZm + 7.4) + 'Q12 ' + n(HZm + 9) + " -1 " + (HZm + 8.6) + 'ZM31 ' + (HZm + 8) + 'Q41 ' + n(HZm + 8 - 2.6 * bz) + " 50 " + (HZm + 7.6) + 'V' + (HZm + 9.4) + 'Q41 ' + n(HZm + 9.6) + " 31 " + (HZm + 8) + 'Z" fill="' + sand + '"/>'; }
      // looking along it (128th St E): the bed and its channels running to one point
      if (rv.flow === "along") s += '<path d="M-1 48L21 ' + (HZm + 0.6) + "H28L49 48Z" + '" fill="' + mixHex(sand, f3, 0.25) + '"/><path d="M4 48Q12 40 18 34Q22 30 23.6 ' + (HZm + 0.8) + "Q22.6 30 20 35Q16 42 16 48ZM28 48Q26 40 25.6 34Q25 30 25 " + (HZm + 0.8) + "Q26.6 30 28.4 35Q33 42 40 48Z" + '" fill="url(#' + gid + 'r)"/><path d="M9 45h4M30 43h3M20 37h2" stroke="' + lum + '" stroke-width=".5" opacity=".5"/>';
      // Sumner: the White's milkier tongue at the right, the seam where it
      // meets, and someone on your bank casting into the Puyallup
      if (rv.join) s += '<path d="M48 ' + (HZm + 1) + "Q34 " + (HZm + 2) + " 31 " + (HZm + 5) + "Q36 " + (HZm + 9) + " 48 " + (HZm + 11) + 'Z" fill="' + mixHex(p.water[0], lum, 0.42) + '" opacity=".7"/><path d="M48 ' + (HZm + 2.4) + "Q38 " + (HZm + 3.2) + " 35.5 " + (HZm + 5.2) + "Q39 " + (HZm + 8) + " 48 " + (HZm + 9.4) + 'Z" fill="' + mixHex(p.water[0], lum, 0.6) + '" opacity=".55"/>' +
        (rv.anglers ? '<path d="M8.4 39.6h1.6l.3-3.2h-.4l-.2-1.6a.75.75 0 1 0-.6 0l-.6 1.6-.5 3.2Z" fill="' + f3 + '"/><path d="M9.8 36.6L17 30.4" stroke="' + f3 + '" stroke-width=".35"/><path d="M17 30.4L19 ' + (HZm + 6) + '" stroke="' + lum + '" stroke-width=".2" opacity=".6"/>' : "");
      // Orting: the road bridge downstream at the right, its deck and a pier
      if (rv.bridge) s += '<path d="M49 ' + (HZm - 5) + "L31 " + (HZm - 1.8) + "L31 " + (HZm - 1) + "L49 " + (HZm - 3.4) + 'Z" fill="' + f2 + '"/><path d="M41 ' + (HZm - 3.2) + "V" + (HZm + 1) + '" stroke="' + f2 + '" stroke-width="1.1"/>';
      if (rv.span) s += '<path d="M-1 ' + (HZm - 6) + "H49" + '" stroke="' + f3 + '" stroke-width="1.6"/><path d="M8 ' + (HZm - 6) + "V" + (HZm + 3) + "M24 " + (HZm - 6) + "V" + (HZm + 3) + "M40 " + (HZm - 6) + "V" + (HZm + 3) + '" stroke="' + f3 + '" stroke-width="1.3"/>';
      if (rv.reach) {
        // a reach seen a little upstream (the approved river's build): the
        // sky's road under the gap, your own bank's dark trees climbing from
        // the frame's foot at one side to meet the far bank, the meadow or
        // the bar at your feet at the other, someone at its edge
        var rr9 = rv.reach.side !== "left", MX9 = function (x) { return rr9 ? x : 48 - x; }, rg9 = rnd(sd + 59), road9 = "";
        // (the road a soft sheen widening toward you, a few broken glints on it
        // at their own spacing and strength, never an even ladder of bars)
        var rc9 = mixHex(hz, lum, 0.5), rq9 = rnd(sd + 61), sh9 = "M" + n(MX9(18.4)) + " " + n(HZm + 0.8) + "L" + n(MX9(19.4)) + " " + n(HZm + 0.8) + "L" + n(MX9(22)) + " " + n(HZm + 14) + "L" + n(MX9(12.5)) + " " + n(HZm + 14) + "Z";
        s += '<path d="' + sh9 + '" fill="' + rc9 + '" opacity="' + (lampOn ? 0.12 : 0.16) + '"/>';
        for (var q9 = 0; q9 < 10; q9++) {
          var v9 = Math.pow(rq9(), 1.2), l9 = (1 + v9 * 5) * (0.4 + rq9() * 0.8), x9 = 18.4 - v9 * 1.6 + (rq9() - 0.5) * (1.2 + v9 * 6) - l9 / 2;
          road9 += '<path d="M' + n(MX9(rr9 ? x9 : x9 + l9)) + " " + n(HZm + 1.3 + v9 * 12.6) + "h" + n(l9) + '" opacity="' + n((0.45 + rq9() * 0.45) * (1 - v9 * 0.3)) + '"/>';
          if (q9 < 9) rg9(); // (the bank's trees keep the draws they were drawn with)
        }
        s += '<g stroke="' + rc9 + '" stroke-width=".5" stroke-linecap="round" fill="none">' + road9 + "</g>";
        var nb9 = function (x) { var u = Math.max(0, x - 26) / 22; return HZm + 0.6 + 14 * Math.pow(u, 1.2); }, bank9 = "M" + n(MX9(25)) + " " + n(HZm + 0.6), tr9 = "", xq;
        for (xq = 26; xq <= 49; xq += 1.5) bank9 += "L" + n(MX9(xq)) + " " + n(nb9(xq) - 0.4);
        for (xq = 26.5; xq < 50; xq += 1.4 + rg9() * 1.2) { var u9 = (xq - 26) / 22, th9 = (2 + u9 * 26) * (0.7 + rg9() * 0.5), fb9 = nb9(xq);
          tr9 += rv.reach.near === "mixed" && rg9() < 0.55 ? "M" + n(MX9(xq - th9 * 0.16)) + " " + n(fb9) + "L" + n(MX9(xq)) + " " + n(fb9 - th9) + "L" + n(MX9(xq + th9 * 0.16)) + " " + n(fb9) + "Z" :
            "M" + n(MX9(xq - th9 * 0.24)) + " " + n(fb9) + "Q" + n(MX9(xq - th9 * 0.3)) + " " + n(fb9 - th9 * 0.9) + " " + n(MX9(xq)) + " " + n(fb9 - th9) + "Q" + n(MX9(xq + th9 * 0.3)) + " " + n(fb9 - th9 * 0.9) + " " + n(MX9(xq + th9 * 0.24)) + " " + n(fb9) + "Z"; }
        s += '<path d="' + bank9 + "L" + n(MX9(49)) + " 48L" + n(MX9(49)) + " " + n(nb9(49)) + 'Z" fill="' + mixHex(p.water[1], f3, 0.5) + '" opacity=".6"/>' +
          '<path d="' + tr9 + '" fill="' + f3 + '"' + (rv.reach.near === "grove" && winter ? ' opacity=".82"' : "") + "/>";
        var gb9 = (lv - 0.35) * 4;
        s += '<path d="M' + n(MX9(-1)) + " " + n(36 + gb9) + "Q" + n(MX9(12)) + " " + n(36.6 + gb9) + " " + n(MX9(22)) + " " + n(41 + gb9 * 0.6) + "T" + n(MX9(31)) + " 48H" + n(MX9(-1)) + 'Z" fill="' + (rv.reach.ground === "meadow" ? mixHex(sand, f2, 0.18) : sand) + '"/>';
        if (rv.bar) for (var st9 = 0; st9 < 7; st9++) s += '<ellipse cx="' + n(MX9(2 + rg9() * 18)) + '" cy="' + n(39.5 + rg9() * 7) + '" rx="' + n(0.5 + rg9() * 0.7) + '" ry=".35" fill="' + f3 + '" opacity=".45"/>';
        if (rv.wader && !lampOn) s += '<path d="M' + n(MX9(9.2)) + ' 37.6l.3-3.8 1.6 0 .3 3.8zM' + n(MX9(9.3)) + ' 34l.2-3.2 1.6-.2.2 3.4z" fill="' + f3 + '"/><circle cx="' + n(MX9(10.3)) + '" cy="29.8" r=".9" fill="' + f3 + '"/><path d="M' + n(MX9(11)) + " 32.6Q" + n(MX9(14)) + " 25.2 " + n(MX9(20)) + ' 23.8" stroke="' + f3 + '" stroke-width=".45" fill="none"/>';
        F(0, HZm - 14, 48, 46);
      }
      if (rv.meadow === "diag") {
        // the Narrows: the meadow's edge on a slant, up at the right under the
        // cottonwood grove (dark trunks and the haze of their crowns, the
        // brush under them), and someone wading in off it, casting across
        s += '<path d="M0 46Q20 42 34 37.6L48 35V48H0Z" fill="' + mixHex(f3, hz, 0.25) + '"/><path d="M0 48V47Q22 44 48 40V48Z" fill="' + f3 + '" opacity=".55"/>';
        if (rv.grove) {
          var gv = "";
          [[34, 36.5, 15, 1], [38, 35.4, 20, 1.3], [42.5, 34.6, 27, 1.7], [47, 33.8, 34, 2.1]].forEach(function (g9) { gv += '<path d="M' + n(g9[0] - g9[3] / 2) + " " + n(g9[1] + 1) + "L" + n(g9[0] - g9[3] * 0.2) + " " + n(g9[1] - g9[2]) + "L" + n(g9[0] + g9[3] * 0.2) + " " + n(g9[1] - g9[2]) + "L" + n(g9[0] + g9[3] / 2) + " " + n(g9[1] + 1) + 'Z"/><path d="M' + n(g9[0]) + " " + n(g9[1] - g9[2] * 0.55) + "l" + n(-g9[2] * 0.3) + " " + n(-g9[2] * 0.3) + "M" + n(g9[0]) + " " + n(g9[1] - g9[2] * 0.75) + "l" + n(g9[2] * 0.22) + " " + n(-g9[2] * 0.26) + '" stroke="' + f3 + '" stroke-width=".6"/>'; });
          // their crowns: fine limbs fanning up (bare) or a ragged leaf mass
          var lf9 = "", gr9 = rnd(sd + 69);
          [[34, 22, 7], [38, 16, 9], [42.5, 9, 11], [47, 3, 12]].forEach(function (c9) { for (var k9 = 0; k9 < 7; k9++) { var an9 = -Math.PI / 2 + (k9 / 6 - 0.5) * 2.2 + (gr9() - 0.5) * 0.3, l9 = c9[2] * (0.6 + gr9() * 0.5); lf9 += "M" + n(c9[0]) + " " + n(c9[1] + c9[2] * 0.5) + "l" + n(Math.cos(an9) * l9) + " " + n(Math.sin(an9) * l9 * 0.9); } });
          s += '<path d="' + lf9 + '" stroke="' + f3 + '" stroke-width=".45" fill="none" opacity="' + (winter ? 0.6 : 0.9) + '"/><g fill="' + f3 + '">' + gv + '</g>' +
            '<path d="M27 38Q32 33 38 33.6Q43 31 48 31.4V38Q38 37 27 38Z" fill="' + f3 + '"/>';
          F(26, 4, 48, 42);
        }
        if (rv.wader && !lampOn) { s += '<path d="M16.2 38.4l.3-3.8 1.6 0 .3 3.8zM16.3 34.8l.2-3.2 1.6-.2.2 3.4z" fill="' + f3 + '"/><circle cx="17.3" cy="30.6" r=".9" fill="' + f3 + '"/><path d="M18 33.4Q21 26 27 24.6" stroke="' + f3 + '" stroke-width=".45" fill="none"/><path d="M27 24.6Q30 27 33 29.4" stroke="' + lum + '" stroke-width=".25" fill="none" opacity=".7"/><path d="M15 38.4h4.6" stroke="' + lum + '" stroke-width=".5" opacity=".6"/>'; F(14, 24, 28, 40); }
      } else if (rv.meadow || rv.levee || rv.join) s += '<path d="M0 40Q24 38 48 41V48H0Z" fill="' + (rv.levee ? sand : mixHex(f3, hz, 0.2)) + '"/>';
      if (rv.ridge) s = s.replace('<rect y="' + HZm + '"', '<path d="M-1 ' + HZm + 'Q12 ' + (HZm - 7) + " 26 " + (HZm - 6) + "T49 " + (HZm - 5) + "V" + HZm + 'Z" fill="' + f0 + '"/><rect y="' + HZm + '"');
    } else {
      // the ocean: the stock beach painting with this beach's own facts: who
      // is there (nobody after dark where the card says so), which side its
      // dune is on, today's tide, its people placed its own way, and its
      // jetty or stack by bearing (not drawn when out of the picture)
      var base = mini("surf", p, { activity: o.activity, after: o.after, dune: o.dune, ridge: o.ridge, glow: o.glow, tide: t.tide, seed: sd }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      s = base;
      if (o.jetty) {
        var jt = X(o.jetty.tip);
        if (o.jetty.side === "left" && jt > 0) s += '<path d="M-1 ' + (HZm + 4) + "L" + n(jt * 0.5) + " " + (HZm + 1.4) + "L" + n(jt) + " " + (HZm + 0.6) + "L" + n(jt + 0.6) + " " + (HZm + 1.2) + "L-1 " + (HZm + 5.4) + 'Z" fill="' + f2 + '"/>';
        if (o.jetty.side === "right" && jt < 48) s += '<path d="M49 ' + (HZm + 6) + "L" + n((48 + jt) / 2 + 2) + " " + (HZm + 2) + "L" + n(jt) + " " + (HZm + 0.6) + "L" + n(jt - 0.6) + " " + (HZm + 1.2) + "L49 " + (HZm + 7.6) + 'Z" fill="' + f2 + '"/>';
      }
      if (o.stack != null) { var skx = typeof o.stack === "number" ? (o.stack - 39) * 0.154 : X(o.stack.at); if (skx > 1 && skx < 47) s += '<path d="M' + n(skx - 1.8) + ' 25L' + n(skx - 1.2) + ' 21.6L' + n(skx + 1) + ' 21.2L' + n(skx + 1.8) + ' 25Z" fill="' + f2 + '"/>'; }
    }
    var vb = "0 0 48 48";
    if (foc.length) {
      var bx0 = 99, by0 = 99, bx1 = -99, by1 = -99;
      foc.forEach(function (f) { bx0 = Math.min(bx0, f[0]); by0 = Math.min(by0, f[1]); bx1 = Math.max(bx1, f[2]); by1 = Math.max(by1, f[3]); });
      bx0 = clamp(bx0, 0, 48); bx1 = clamp(bx1, 0, 48); by0 = clamp(by0, 0, 48); by1 = clamp(by1, 0, 48);
      var S9 = clamp(Math.max(bx1 - bx0, by1 - by0) * 1.12 + 4, 28, 34), vx = clamp((bx0 + bx1) / 2 - S9 / 2, 0, 48 - S9), vy = clamp((by0 + by1) / 2 - S9 / 2, 0, 48 - S9);
      // never crop the skyline away: it stays in the tile's upper part
      if (HZm - vy < S9 * 0.2) vy = clamp(HZm - S9 * 0.2, 0, 48 - S9);
      if (HZm - vy > S9 * 0.62) vy = clamp(HZm - S9 * 0.62, 0, 48 - S9);
      vb = [vx, vy, S9, S9].map(n).join(" ");
    }
    return '<svg viewBox="' + vb + '" aria-hidden="true" focusable="false" data-spot="' + o.spot + '"' + (o.standName ? ' data-stand="' + o.standName + '"' : "") + ">" + s + "</svg>";
  }

  // ---- thumbnails ------------------------------------------------------------
  // Each trip carries a small painting of its own water under its own sky:
  // the sky engine's palette for the hour the trip starts. Squid is a lit
  // pier at dusk, chum is a river at dawn. Colours are the engine's, as is.
  // o: the place's own paint: o.dock false (a lake with none), o.activity
  // (an ocean beach: "clams" or "perch").
  function mini(kind, pal, o) {
    if (o && o.spot) return miniSpot(kind, pal, standOf(kind, o));
    o = o || {};
    var p = pal, dark = p.dark, lum = dark ? p.ink : p.paper, gid = "mn" + (mini.n = (mini.n || 0) + 1);
    function mx(a, b, t) {
      function h(c, i) { return parseInt(c.slice(1 + i * 2, 3 + i * 2), 16); }
      var o = "#";
      for (var i = 0; i < 3; i++) o += ("0" + Math.round(h(a, i) + (h(b, i) - h(a, i)) * t).toString(16)).slice(-2);
      return o;
    }
    var hz = dark ? mx(p.sky[1], p.ink2, 0.3) : p.sky[1];
    var f1 = mx(hz, p.shore, 0.28), f2 = mx(hz, p.shore, 0.58), f3 = p.shore;
    var lampOn = dark || p.name === "Dawn";
    var s = '<defs><linearGradient id="' + gid + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.sky[0] + '"/><stop offset="1" stop-color="' + hz + '"/></linearGradient>' +
      '<linearGradient id="' + gid + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mx(p.water[0], hz, 0.35) + '"/><stop offset="1" stop-color="' + p.water[1] + '"/></linearGradient>' +
      '<radialGradient id="' + gid + 'g"><stop offset="0" stop-color="' + p.gold + '" stop-opacity=".95"/><stop offset=".3" stop-color="' + p.gold + '" stop-opacity=".35"/><stop offset="1" stop-color="' + p.gold + '" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="48" height="48" fill="url(#' + gid + 's)"/>';
    var gl = function (x, y, l, o) { return '<path d="M' + x + " " + y + "h" + l + '" stroke="' + lum + '" stroke-width=".8" stroke-linecap="round" opacity="' + o + '"/>'; };
    var r = rnd(kind.length * 31 + p.name.length), i;
    function trees(x0, x1, base, hh, fill) {
      var d = "M" + x0 + " " + base, x = x0;
      while (x < x1) { var h = hh * (0.45 + r() * 0.75); d += "L" + n(x) + " " + n(base - h) + "L" + n(x + 0.9 + r()) + " " + n(base - h * (0.45 + r() * 0.3)); x += 1.6 + r() * 1.8; }
      return '<path d="' + d + "L" + x1 + " " + base + 'Z" fill="' + fill + '"/>';
    }
    if (kind === "pier") {
      s += trees(0, 48, 27, 3.2, f1) + '<rect y="27" width="48" height="21" fill="url(#' + gid + 'w)"/>';
      s += (lampOn ? '<circle cx="30" cy="16" r="15" fill="url(#' + gid + 'g)"/><circle cx="43" cy="12.5" r="10" fill="url(#' + gid + 'g)" opacity=".8"/>' : "");
      s += '<path d="M16 26.5L48 22.6V26L16 28Z" fill="' + f3 + '"/>';
      [[20, 27.5, 31.5, 1.3], [27, 27, 33.5, 1.6], [35, 26, 36, 2], [44, 25, 39, 2.5]].forEach(function (q) { s += '<rect x="' + q[0] + '" y="' + q[1] + '" width="' + q[3] + '" height="' + (q[2] - q[1]) + '" fill="' + f3 + '"/>'; });
      s += '<path d="M31 25V16.6h-1.8M44 23.4V13h-2.2" stroke="' + f3 + '" stroke-width="1" fill="none"/>';
      if (lampOn) {
        s += '<circle cx="29" cy="17" r="1.1" fill="' + p.accent2 + '"/><circle cx="41.6" cy="13.4" r="1.4" fill="' + p.accent2 + '"/>';
        [[24, 34, 8], [26, 37, 6], [23, 40.5, 9], [27, 44, 5], [37, 41, 9], [36, 44.5, 7]].forEach(function (q) { s += '<path d="M' + q[0] + " " + q[1] + "h" + q[2] + '" stroke="' + p.gold + '" stroke-width="1" stroke-linecap="round" opacity=".8"/>'; });
      }
      s += gl(4, 31, 6, 0.5) + gl(8, 36, 9, 0.4) + gl(3, 42, 12, 0.35);
    } else if (kind === "river") {
      s += trees(0, 48, 24, 7, f1) + '<path d="M0 24H48V48H0Z" fill="url(#' + gid + 'w)"/>';
      s += trees(26, 49, 34, 21, f3) + '<path d="M24 28L48 35V37L25 29Z" fill="' + f3 + '"/>';
      s += '<path d="M0 34Q14 35 24 41T34 48H0Z" fill="' + mx(p.ground, p.ink, dark ? 0.1 : 0.16) + '"/>';
      s += '<path d="M0 34Q14 35 24 41T34 48" fill="none" stroke="' + lum + '" stroke-width=".7" opacity=".5"/>';
      s += gl(6, 28.5, 5, 0.65) + gl(13, 30.5, 7, 0.55) + gl(22, 34, 9, 0.5) + gl(30, 39.5, 10, 0.45) + gl(36, 44.5, 9, 0.4);
    } else if (kind === "lake") {
      // the lake scene, small: far firs, a near point with its reflection,
      // lily pads, reeds at your feet, and the dock unless the spot has none
      s += trees(0, 48, 25, 4.5, f1) + '<rect y="25" width="48" height="23" fill="url(#' + gid + 'w)"/>' + trees(0, 26, 25.5, 14, f2);
      s += '<g transform="translate(0 51.5) scale(1 -1)" opacity=".4">' + trees(0, 26, 25.5, 10, f2) + "</g>";
      if (o.dock !== false) {
        if (lampOn) s += '<circle cx="45" cy="27" r="12" fill="url(#' + gid + 'g)"/>';
        s += '<path d="M24 37.6L48 34.4V36.6L24 39Z" fill="' + f3 + '"/><rect x="28" y="38" width="1.3" height="5.5" fill="' + f3 + '"/><rect x="37" y="36.6" width="1.6" height="7" fill="' + f3 + '"/><rect x="46" y="35.4" width="1.8" height="8.6" fill="' + f3 + '"/>';
        s += '<path d="M44 34.6V27.4" stroke="' + f3 + '" stroke-width=".9"/>' + (lampOn ? '<circle cx="44" cy="27.2" r="1.1" fill="' + p.accent2 + '"/><path d="M40 41h7M41 44h5" stroke="' + p.gold + '" stroke-width=".9" stroke-linecap="round" opacity=".75"/>' : "");
      } else if (lampOn) {
        s += '<circle cx="34" cy="24" r="8" fill="url(#' + gid + 'g)"/><rect x="33.4" y="23.2" width="1.4" height="1.2" fill="' + p.accent2 + '"/><path d="M33.2 30h2M32.6 33h3.2M33 36.5h2.4" stroke="' + p.gold + '" stroke-width=".8" stroke-linecap="round" opacity=".7"/>';
      }
      [[14, 41, 3.2], [20, 43.5, 2.6], [11, 45.5, 2.2], [24, 40.5, 1.8]].forEach(function (q) { s += '<ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="' + q[2] + '" ry="' + n(q[2] * 0.36) + '" fill="' + mx(f3, p.water[0], 0.35) + '"/>'; });
      var reed = "";
      for (i = 0; i < 9; i++) { var rx = -1 + i * 1.5 + r(), rh = 9 + r() * 10, rl = (r() - 0.3) * 3; reed += "M" + n(rx - 0.45) + " 48L" + n(rx + rl) + " " + n(48 - rh) + "L" + n(rx + 0.45) + " 48Z"; }
      s += '<path d="' + reed + '" fill="' + f3 + '"/>';
      s += gl(28, 29.5, 9, 0.5) + gl(32, 32, 8, 0.45) + gl(14, 31, 6, 0.4);
    } else if (kind === "surf") {
      // the ocean beach, small: ragged lines of surf thickening toward you,
      // wet sand that shines, the dune's grass in the corner, and what the
      // people there do: a rod bent to the surf, or a digger by a lantern
      var dig = o.activity === "clams" || (!o.activity && dark), empty = o.after === "empty" && (dark || lampOn), td = o.tide == null ? 0 : (o.tide - 0.5) * 3.2;
      var fx = o.seed != null ? (o.seed % 13) - 6 : 0, dl = o.dune === "left";
      s += '<rect y="20" width="48" height="28" fill="url(#' + gid + 'w)"/>';
      [[22.6, 0.9, 0.5], [25.8, 1.5, 0.62], [30, 2.4, 0.8]].forEach(function (b, bi) {
        // long thin broken strokes of foam, thicker toward you
        var d = "", x = -2 - r() * 4;
        while (x < 48) { var len = 9 + r() * 16, y = b[0] + (r() - 0.5) * 0.8, th = 0.35 + bi * 0.35; d += "M" + n(x) + " " + n(y) + "q" + n(len / 2) + " " + n(-th * 0.6) + " " + n(len) + " " + n(r() * 0.4 - 0.2) + "l" + n(-len * 0.12) + " " + n(th) + "q" + n(-len * 0.38) + " " + n(-th * 0.1) + " " + n(-len * 0.88) + " " + n(-th * 0.5) + "Z"; x += len + 1.5 + r() * 5; }
        s += '<path d="' + d + '" fill="' + lum + '" opacity="' + b[2] + '"/>';
      });
      if (false) [[22.6, 0.9, 0.5]].forEach(function (b) {
        var d = "", x = -2;
        while (x < 48) { var len = 5 + r() * 11, y = b[0] + (r() - 0.5) * 0.8; d += "M" + n(x) + " " + n(y) + "q" + n(len / 3) + " " + n(-b[1] * (0.8 + r() * 0.5)) + " " + n(len * 0.66) + " " + n(-b[1] * 0.3) + "l" + n(len * 0.34) + " " + n(b[1] * 0.3) + "q" + n(-len / 2) + " " + n(b[1] * 0.5) + " " + n(-len) + " 0Z"; x += len + 1 + r() * 3; }
        s += '<path d="' + d + '" fill="' + lum + '" opacity="' + b[2] + '"/>';
      });
      s += '<path d="M0 ' + n(34 + td) + "Q16 " + n(32 + td) + " 30 " + n(35 + td) + "T48 " + n(35.6 + td) + 'V48H0Z" fill="' + mx(p.ground, p.water[0], dark ? 0.24 : 0.36) + '"/>';
      s += '<path d="M0 40.5Q18 38 32 41T48 43V48H0Z" fill="' + mx(p.ground, p.ink, dark ? 0.06 : 0.12) + '"/>';
      s += gl(4, 36.5 + td, 8, 0.5) + gl(14, 37.6 + td, 11, 0.4) + gl(30, 37 + td, 7, 0.45);
      if (empty) {
        // nobody on this beach after dark (the card's day use only): the town
        // behind the dune glows on the low sky and the wet sand
        if (o.glow && (dark || lampOn)) { var gx9 = dl === (o.glow === "left") ? 44 : 4, gx8 = o.glow === "left" ? 4 : 44; s += '<ellipse cx="' + gx8 + '" cy="33" rx="22" ry="9" fill="url(#' + gid + 'g)" opacity=".55"/><ellipse cx="' + (gx8 === 4 ? 14 : 34) + '" cy="' + n(38 + td) + '" rx="16" ry="2.4" fill="url(#' + gid + 'g)" opacity=".5"/>'; }
      } else if (dig) {
        if (dark || lampOn) s += '<circle cx="15" cy="39" r="11" fill="url(#' + gid + 'g)"/><circle cx="15" cy="39.4" r="1.1" fill="' + p.accent2 + '"/>';
        s += '<path d="M21.8 40.4l1-4.6 1.6 0 .9 4.6h-1l-.7-3-.8 3z" fill="' + f3 + '"/><path d="M22.6 36.2l4.4-3.4 1.4 1.2-4.2 3.4z" fill="' + f3 + '"/><circle cx="28.6" cy="32.6" r="1.2" fill="' + f3 + '"/>' +
          '<path d="M30.6 41V34.4M29.2 34.4h2.8" stroke="' + f3 + '" stroke-width=".9" stroke-linecap="round"/>';
      } else {
        s += '<g transform="translate(' + fx + ' 0)"><path d="M25.2 39.6l.9-5 1.8 0 .9 5h-1l-.8-3.2-.8 3.2z" fill="' + f3 + '"/><path d="M25.8 34.8l.1-4.6 2.2-.4.4 5z" fill="' + f3 + '"/><circle cx="27.2" cy="28.4" r="1.1" fill="' + f3 + '"/>' +
          '<path d="M26.4 34Q30 19 38 21.8" fill="none" stroke="' + f3 + '" stroke-width=".7" stroke-linecap="round"/><path d="M38 21.8Q43 24 47 27.6" fill="none" stroke="' + lum + '" stroke-width=".35" opacity=".7"/>' +
          (dark ? '<circle cx="27.2" cy="28.2" r="5" fill="url(#' + gid + 'g)"/>' : "") + "</g>";
      }
      var blades = "";
      var rg = !!o.ridge;
      for (i = 0; i < (rg ? 14 : 8); i++) { var bx = (rg ? 24 : 36) + i * 1.7 + r(), bh = (6 + r() * 7) * (rg ? 1.2 : 1), bb = rg ? 48 - Math.max(0, bx - 22) * 0.36 : 48; blades += "M" + n(bx - 0.5) + " " + n(bb) + "L" + n(bx + (r() - 0.3) * 3) + " " + n(bb - bh) + "L" + n(bx + 0.5) + " " + n(bb) + "Z"; }
      var duneS = '<path d="' + (rg ? "M20 48Q32 40 49 37.6V48Z" : "M33 48Q40 41 49 40V48Z") + '" fill="' + f3 + '"/><path d="' + blades + '" fill="' + f3 + '"/>';
      s += dl ? '<g transform="translate(48 0) scale(-1 1)">' + duneS + "</g>" : duneS;
    } else {
      // a Sound beach: headland, flat water, shingle
      s += trees(0, 48, 25, 3.5, f1) + '<rect y="25" width="48" height="23" fill="url(#' + gid + 'w)"/>' + trees(22, 48, 28, 11, f2) + '<path d="M20 27.5L48 27V29.5L24 29Z" fill="' + f2 + '"/>';
      s += '<path d="M0 39Q14 35 28 39T48 41V48H0Z" fill="' + mx(p.ground, p.ink, dark ? 0.1 : 0.17) + '"/>';
      s += '<path d="M0 39Q14 35 28 39T48 41" fill="none" stroke="' + lum + '" stroke-width=".9" opacity=".7"/>';
      for (i = 0; i < 9; i++) s += '<circle cx="' + n(3 + r() * 42) + '" cy="' + n(42 + r() * 5) + '" r="' + n(0.4 + r() * 0.5) + '" fill="' + p.ink + '" opacity=".28"/>';
      s += gl(3, 30, 9, 0.55) + gl(10, 33.5, 12, 0.45) + gl(27, 32, 8, 0.45);
    }
    return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + s + "</svg>";
  }

  // ---- views: a tile-sized painting of one kind of water ----------------------
  // Between a scene and a thumbnail: big enough to carry a tile, light enough
  // to hang seven on one screen (a few dozen shapes, no filters). Drawn with
  // the scenes' own tools and painted with the scenes' own classes, so a view
  // follows the sky by itself, lamps and all.
  // kind: river, lake, pier, surf, sound, kayak-lake, kayak-sound or fly.
  var VW = 200, VH = 120, VZ = 60;
  function vGlints(seed, y0, y1, dens) {
    var r = rnd(seed), d = "", y = y0;
    while (y < y1) {
      var k = (y - y0) / (y1 - y0), cnt = Math.round(dens * (1.6 - k) * 7);
      for (var i = 0; i < cnt; i++) d += "M" + n(r() * (VW + 10) - 5) + " " + n(y + (r() - 0.5)) + "h" + n((1.2 + k * 9) * (0.4 + r()));
      y += (1.3 + k * 5) * (0.6 + r() * 0.7);
    }
    return '<path class="w-gl v-gl" d="' + d + '"/>';
  }
  function vLand(hl, cls) { return '<g class="' + cls + '"><path d="' + hl.land + '"/>' + (hl.trees ? '<path d="' + hl.trees + '"/>' : "") + "</g>"; }
  // the land again in the water: flipped, squashed and faint
  function vGlass(hl, k, cls) {
    var b = hl.base(0);
    return '<g class="v-rf ' + cls + '" transform="translate(0 ' + n(b * (1 + k)) + ") scale(1 " + n(-k) + ')"><path d="' + hl.land + '"/>' + (hl.trees ? '<path d="' + hl.trees + '"/>' : "") + "</g>";
  }
  // a sit on top kayak with someone in it, side on, and its dark in the water
  function vKayak(x, y, s, rod) {
    var hull = [[-17, -0.6], [-12, -2.2], [-3, -2.8], [8, -2.6], [15, -1.9], [19, -0.4], [14, 1.3], [2, 1.9], [-10, 1.5]].map(function (p) { return [x + p[0] * s, y + p[1] * s]; });
    var o = '<ellipse class="w-under" cx="' + n(x + s) + '" cy="' + n(y + 2.6 * s) + '" rx="' + n(17 * s) + '" ry="' + n(1.5 * s) + '"/>' +
      '<path class="w-pile" d="' + poly(hull) + '"/><path class="w-liteb" d="M' + n(x - 12 * s) + " " + n(y - 2.2 * s) + "L" + n(x + 15 * s) + " " + n(y - 1.9 * s) + '"/>' +
      '<path class="w-fig" d="M' + n(x - 1.5 * s) + " " + n(y - 2.2 * s) + "L" + n(x - 2.2 * s) + " " + n(y - 8.6 * s) + '" stroke-width="' + n(3.4 * s) + '"/>' +
      '<circle class="w-figh" cx="' + n(x - 2 * s) + '" cy="' + n(y - 11.6 * s) + '" r="' + n(1.9 * s) + '"/>';
    if (rod) o += '<path class="w-rod" d="M' + n(x - 1 * s) + " " + n(y - 6.4 * s) + "Q" + n(x + 9 * s) + " " + n(y - 13 * s) + " " + n(x + 21 * s) + " " + n(y - 15 * s) + '" stroke-width="' + n(0.6 * s) + '"/>' +
      '<path class="w-line" d="M' + n(x + 21 * s) + " " + n(y - 15 * s) + "L" + n(x + 27 * s) + " " + n(y + 1.6 * s) + '"/>';
    else o += '<path class="w-rod" d="M' + n(x - 10 * s) + " " + n(y - 9.6 * s) + "L" + n(x + 7 * s) + " " + n(y - 1 * s) + '" stroke-width="' + n(0.8 * s) + '"/>' +
      '<path class="w-pile" d="' + poly([[x + 6 * s, y - 2.2 * s], [x + 9.4 * s, y + 0.6 * s], [x + 8.2 * s, y + 1.6 * s], [x + 5 * s, y - 1.2 * s]]) + '"/>';
    return o;
  }
  // o (optional): the same options a spot's card gives its big scene. For
  // now the lake reads o.dock (false: no dock, a lit cabin across the water
  // instead, so the night still has its light).
  function view(kind, o) {
    if (o && o.spot) return viewSpot(kind, standOf(kind, o));
    o = o || {};
    // o.seed: the same kind of water with its own shore (a guide's tile is
    // not its neighbour's); o.flip: the view from the other bank.
    var sd = +o.seed || 0;
    var id = "vw" + (view.n = (view.n || 0) + 1), base = kind === "fly" ? "sound" : kind.replace(/^kayak-/, "");
    var r = rnd(kind.length * 17 + 5 + sd), s = "", k, x, wl = VZ;
    var lamps = "", glows = "";
    function ridge(seed, y, h, cls) { return '<path class="' + cls + '" d="' + headland({ seed: seed, from: -20, to: 260, base: y, h: h, tree: 1.1, gap: 1.6, shape: 9, freq: 0.022, tipFade: 60 }).land + '"/>'; }
    function water(y) { wl = y; return '<rect y="' + y + '" width="' + VW + '" height="' + (VH - y) + '" fill="url(#' + id + '-w)"/><rect y="' + y + '" width="' + VW + '" height="16" fill="url(#' + id + '-h)"/>'; }
    if (base === "river") {
      var bank = headland({ seed: 71 + sd, from: -20, to: 240, base: 66, h: 3, tree: 17, trees: true, shape: 12, tipFade: 60, tfreq: 0.05 });
      var near = headland({ seed: 83 + sd, from: 222, to: 128, base: function (xx) { return 68 + Math.pow(Math.max(0, xx - 128) / 72, 1.3) * 30; }, h: 6, tree: 30, trees: true, shape: 2.6, tfreq: 0.06, tipFade: 5,
        grow: function (xx) { return 0.5 + Math.max(0, xx - 128) / 60; } });
      s += ridge(72 + sd, 62, 24, "w-l0") + ridge(73 + sd, 65, 13, "w-l1") + water(64) + vGlass(bank, 0.6, "w-l3") + vLand(bank, "w-l3") +
        '<path class="w-beach" d="M-2 66.3H130"/>' + litWindow(id, rnd(75 + sd), 58, 61, 66) + vGlints(74 + sd, 72, VH, 0.9) + vLand(near, "w-l5");
      var bar = [[-2, 84], [22, 85], [48, 89], [74, 96], [96, 106], [110, 122]], st = "";
      for (k = 0; k < 44; k++) { var u = r(), sx = u * 104, sy = 86 + Math.pow(sx / 110, 1.7) * 34 + r() * r() * 22; st += '<ellipse class="' + (r() < 0.3 ? "w-st-l" : "w-st-d") + '" cx="' + n(sx) + '" cy="' + n(sy) + '" rx="' + n(0.5 + r() * 1.3) + '" ry="' + n(0.3 + r() * 0.5) + '"/>'; }
      s += '<path class="w-shorewet" d="' + line(bar.map(function (q) { return [q[0] + 3, q[1] - 3]; })) + 'L-2 122Z"/><path class="w-shore" d="' + line(bar) + 'L-2 122Z"/><path class="w-foam" d="' + line(bar) + '"/>' + st +
        '<g class="w-log"><path class="w-pile" d="' + poly([[14, 90.4], [46, 93.6], [70, 97], [71.4, 100], [46, 97.6], [14, 93.6]]) + '"/><path class="w-pile" d="' + poly([[40, 93], [36.6, 86.4], [38.4, 86], [43, 93.2]]) + '"/><path class="w-liteb" d="M15 90.8L46 94L69 97.3"/></g>';
    } else if (base === "lake") {
      var shore = headland({ seed: 61 + sd, from: -20, to: 240, base: 62, h: 3, tree: 16, trees: true, shape: 12, tipFade: 60, tfreq: 0.045 });
      var pt = headland({ seed: 65 + sd, from: -8, to: 74, base: 67, h: 4, tree: 24, trees: true, shape: 2.3, tfreq: 0.07 });
      s += ridge(62 + sd, 60, 18, "w-l0") + water(60) + vGlass(shore, 0.9, "w-l3") + vLand(shore, "w-l3") + '<path class="w-beach" d="M-2 62.3H202"/>' +
        vGlass(pt, 0.84, "w-l5") + vLand(pt, "w-l5") + vGlints(63 + sd, 70, VH, 0.4);
      if (kind === "lake" && o.dock !== false) {
        // the dock, from the right
        var dk = poly([[206, 92], [206, 86], [118, 74.6], [112, 77]]), posts = "";
        [[196, 1], [168, 0.8], [144, 0.64], [124, 0.5]].forEach(function (q) { var py = 77 + (q[0] - 112) * 0.16; posts += pile(r, q[0], py - 9 * q[1], py + 7 * q[1], 2.6 * q[1] + 0.6); });
        s += '<path class="w-under" d="' + poly([[206, 94], [112, 78], [110, 84], [206, 106]]) + '"/><path class="w-decktop" d="' + dk + '"/><path class="w-pile" d="' + poly([[206, 92], [112, 77], [112, 79], [206, 95.6]]) + '"/>' + posts;
        lamps += '<path class="w-pole" d="M116 76V62.6Q116 61 114 61" stroke-width=".9"/><ellipse class="w-bulb" cx="113.6" cy="62" rx="1.6" ry=".8"/>';
        glows += '<circle cx="114" cy="62.4" r="20" fill="url(#' + id + '-lamp)"/><g class="w-poolg">' + [0, 1, 2, 3, 4, 5].map(function (j) { return '<rect x="' + n(104 - j * 0.6 + (r() - 0.5) * 4) + '" y="' + n(82 + j * 3.4) + '" width="' + n(6 + j * 2.2) + '" height="1" rx=".5" opacity="' + n(0.8 - j * 0.11) + '"/>'; }).join("") + "</g>";
      } else s += litWindow(id, rnd(66 + sd), 150, 58.6, 62) + (kind === "lake" ? "" : vKayak(118, 86, 1.25, true));
      var reeds = "";
      for (k = 0; k < 26; k++) { var bx = -4 + Math.pow(r(), 1.4) * 60, by = 112 + r() * 10, bh = (14 + r() * 24) * (1 - bx / 130), ln = (r() - 0.35) * 9; reeds += "M" + n(bx - 0.7) + " " + n(by) + "Q" + n(bx + ln * 0.2) + " " + n(by - bh * 0.55) + " " + n(bx + ln) + " " + n(by - bh) + "Q" + n(bx + ln * 0.3 + 0.6) + " " + n(by - bh * 0.5) + " " + n(bx + 0.8) + " " + n(by) + "Z"; }
      s += '<path class="w-reed" d="' + reeds + '"/>';
    } else if (base === "pier") {
      var A = headland({ seed: 41 + sd, from: -20, to: 150, base: 61, h: 6, tree: 2, gap: 1.5, shape: 2.4, freq: 0.03 });
      s += ridge(42 + sd, 60, 8, "w-far") + water(60) + vGlass(A, 0.5, "w-l1") + vLand(A, "w-l1") + '<g class="w-lights">' + shoreLights(43 + sd, A, 9, 4, 10, 140) + "</g>" + vGlints(44 + sd, 66, VH, 0.9);
      var VX2 = 30, PP = function (x1, dy, sc) { return [VX2 + (x1 - VX2) * sc, VZ + dy * sc]; }, SS = [1, 0.8, 0.64, 0.52, 0.43, 0.36], piles = "", glass = "", rail = "";
      s += '<path class="w-under" d="' + poly([PP(214, 44, 1.04), PP(214, 44, 0.34), PP(214, 54, 0.34), PP(214, 60, 1.04)]) + '"/>';
      SS.forEach(function (sc, i) {
        var top = PP(214, 20, sc), bot = PP(214, 46, sc), w = 0.8 + 4 * sc, rp = PP(214, 16, sc);
        piles += pile(r, bot[0], top[1], bot[1], w);
        rail += "M" + n(rp[0]) + " " + n(rp[1]) + "v" + n(-7 * sc);
        // lamps on the far bays only: the nearest stands past the tile's edge
        if (i === 1 || i === 3 || i === 5) {
          var f = PP(208, 10, sc), hh = 26 * sc, lx2 = f[0] - 4 * sc, ly2 = f[1] - hh, wy = VZ + 46 * sc + 3 * sc, ps = "";
          lamps += '<path class="w-pole" d="M' + n(f[0]) + " " + n(f[1]) + "V" + n(ly2 + 2.4 * sc) + "Q" + n(f[0]) + " " + n(ly2) + " " + n(lx2) + " " + n(ly2) + '" stroke-width="' + n(0.5 + sc) + '"/><ellipse class="w-bulb" cx="' + n(lx2 - 0.6 * sc) + '" cy="' + n(ly2 + 1.2 * sc) + '" rx="' + n(1.9 * sc) + '" ry="' + n(0.9 * sc) + '"/>';
          for (var j = 0; j < 6; j++) ps += '<rect x="' + n(lx2 - 6 * sc - j * sc + (r() - 0.5) * 5 * sc) + '" y="' + n(wy + j * 3.4 * sc) + '" width="' + n((14 - j * 1.2) * sc) + '" height="' + n(0.6 + sc * 0.8) + '" rx=".5" opacity="' + n(0.85 - j * 0.12) + '"/>';
          glows += '<circle cx="' + n(lx2) + '" cy="' + n(ly2 + 1.5 * sc) + '" r="' + n(26 * sc + 4) + '" fill="url(#' + id + '-lamp)"/><g class="w-poolg">' + ps + "</g>";
        }
      });
      rail += line([PP(214, 9, 1.04), PP(214, 13.5, 0.34)]);
      s += piles + '<path class="w-decktop" d="' + poly([PP(214, 16, 1.04), PP(214, 16, 0.34), PP(208, 10, 0.34), PP(208, 10, 1.04)]) + '"/>' +
        '<path class="w-pile" d="' + poly([PP(214, 16, 1.04), PP(214, 16, 0.34), PP(214, 20.5, 0.34), PP(214, 20.5, 1.04)]) + '"/><path class="w-rail" d="' + rail + '"/>';
    } else if (base === "surf") {
      s += water(60);
      var foam = "", shade = "";
      [[70, 1.2, 81], [77, 2, 82], [86, 3.4, 83]].forEach(function (b) {
        var nz = noise(b[2]), up = null, dn = null;
        function flush() { if (up && up.length > 2) { foam += poly(up.concat(dn)); shade += line(dn.slice().reverse().map(function (q) { return [q[0], q[1] + b[1] * 0.6]; })); } up = dn = null; }
        for (x = -8; x <= VW + 8; x += 3) {
          var th = b[1] * Math.max(0, nz(x * 0.03) * 2.1 - 0.6);
          if (th < 0.25) { flush(); continue; }
          if (!up) { up = [[x - 2, b[0]]]; dn = [[x - 2, b[0] + 0.3]]; }
          up.push([x, b[0] - th * (0.5 + r() * 0.7)]); dn.unshift([x, b[0] + th * (0.3 + r() * 0.3)]);
        }
        flush();
      });
      var lip = [], nzl = noise(88 + sd);
      for (x = -4; x <= VW + 4; x += 8) lip.push([x, 94 + (nzl(x * 0.04) - 0.5) * 6]);
      s += vGlints(84 + sd, 62, 70, 1) + '<path class="w-surfsh" d="' + shade + '" stroke-width="1.6"/><path class="w-surf" d="' + foam + '"/>' +
        '<path class="w-wash" d="' + line(lip) + "L" + (VW + 4) + ' 86L-4 86Z"/><path class="w-wetsand" d="' + line(lip) + "L" + (VW + 4) + ' 110L-4 108Z"/>' +
        '<path class="w-shore" d="M-4 108Q60 103 120 107T204 106V124H-4Z"/><path class="w-foam" d="' + line(lip) + '"/>' +
        '<g class="w-log"><path class="w-pile" d="' + poly([[-4, 104], [30, 102], [52, 101.6], [55, 103.6], [52, 106.4], [30, 108], [-4, 111]]) + '"/><path class="w-pile" d="' + poly([[30, 102.4], [27, 96.6], [28.6, 96.2], [33, 102.2]]) + '"/><path class="w-liteb" d="M-3 104.4L30 102.4L51 102"/></g>' +
        '<g class="w-dayonly"><path class="w-fig" d="M128 97V88" stroke-width="2.4"/><circle class="w-figh" cx="128.2" cy="85.6" r="1.6"/><path class="w-rod" d="M127 92Q136 82 146 74" stroke-width=".6"/><path class="w-line" d="M146 74Q160 80 172 80"/></g>';
      glows += '<path class="w-fig" d="M140 104L141.4 98L143 104M141.4 98L145.6 95" stroke-width="2.2"/><circle class="w-figh" cx="147" cy="93.2" r="1.6"/><path class="w-rod" d="M149.6 105V96.6M147.6 96.6h4" stroke-width="1.5"/>' +
        '<circle cx="132" cy="101.4" r="19" fill="url(#' + id + '-lamp)"/><ellipse class="w-lantern" cx="132" cy="102" rx="1.1" ry="1.6"/><ellipse class="w-pool" cx="132" cy="105" rx="18" ry="4.4" fill="url(#' + id + '-lamp)"/>' +
        '<g class="w-farlamps v-farlamps"><circle cx="34" cy="96" r=".9"/><circle cx="72" cy="95" r=".7"/><circle cx="96" cy="97" r="1"/><circle cx="170" cy="96" r=".9"/><circle cx="190" cy="95.4" r=".6"/></g>';
    } else {
      // the Sound: two points of land, the mountain, and a shingle beach
      var a2 = headland({ seed: 51 + sd, from: -20, to: 124, base: 61, h: 7, tree: 2, gap: 1.5, shape: 2.4, freq: 0.03 });
      var b2 = headland({ seed: 53 + sd, from: 214, to: 96, base: 66, h: 7, tree: 19, trees: true, shape: 2.4, tfreq: 0.06 });
      s += '<g class="v-mtn">' + mountain(34, 33, 0.38) + '</g><rect y="42" width="' + VW + '" height="20" fill="url(#' + id + '-m)"/>' + ridge(52 + sd, 60, 9, "w-far") + water(60) +
        vGlass(a2, 0.5, "w-l1") + vLand(a2, "w-l1") + '<g class="w-lights">' + shoreLights(55 + sd, a2, 10, 4, 6, 116) + "</g>" +
        vGlass(b2, 0.5, "w-l5") + vLand(b2, "w-l5") + '<path class="w-beach" d="M112 66.3H202"/>' + vGlints(54 + sd, 68, VH, 0.9);
      if (kind === "kayak-sound") s += vKayak(86, 88, 1.3, false);
      else {
        var sh = [[-2, 98], [34, 94], [78, 96], [124, 101], [168, 103], [202, 102]], peb = "";
        for (k = 0; k < 40; k++) { var px2 = r() * VW, py2 = 100 + (px2 / VW) * 4 + r() * r() * 18; peb += '<ellipse class="' + (r() < 0.3 ? "w-st-l" : "w-st-d") + '" cx="' + n(px2) + '" cy="' + n(py2) + '" rx="' + n(0.5 + r() * 1.2) + '" ry="' + n(0.3 + r() * 0.4) + '"/>'; }
        s += '<path class="w-shorewet" d="' + line(sh.map(function (q) { return [q[0], q[1] - 3]; })) + 'L202 122L-2 122Z"/><path class="w-shore" d="' + line(sh) + 'L202 122L-2 122Z"/><path class="w-foam" d="' + line(sh) + '"/>' + peb;
        if (kind === "fly") {
          // knee deep, the line unrolling in a tight loop ahead of the rod
          s += '<ellipse class="w-under" cx="62" cy="93.6" rx="7" ry="1.3"/><path class="w-fig" d="M62 93V84" stroke-width="3"/><circle class="w-figh" cx="62.3" cy="81" r="1.9"/>' +
            '<path class="w-rod" d="M63 87Q70 76 76 66" stroke-width=".7"/>' +
            // the line thins and fades as it unrolls: full off the rod tip, a whisper on the way back
            '<path class="w-line v-flyline" d="M76 66Q110 55 150 59Q164 61 158 64.6"/><path class="w-line v-flyline v-fly2" d="M158 64.6Q140 68 112 66"/>';
        } else {
          var pl = "";
          [[20, 66, 92, 3.4], [31, 72, 90, 2.8], [45, 62, 94, 4]].forEach(function (q) { pl += pile(r, q[0], q[1], q[2], q[3]); });
          s += pl;
        }
      }
    }
    var defs2 = '<defs><linearGradient id="' + id + '-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset=".6" style="stop-color:color-mix(in oklab,var(--sky1) 80%,var(--hz))"/><stop offset="1" style="stop-color:var(--hz)"/></linearGradient>' +
      '<linearGradient id="' + id + '-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--water1)"/><stop offset="1" style="stop-color:var(--water2)"/></linearGradient>' +
      '<linearGradient id="' + id + '-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--hz);stop-opacity:.6"/><stop offset="1" style="stop-color:var(--hz);stop-opacity:0"/></linearGradient>' +
      '<radialGradient id="' + id + '-g"><stop offset="0" style="stop-color:var(--glowc);stop-opacity:1"/><stop offset=".3" style="stop-color:var(--glowc);stop-opacity:.45"/><stop offset="1" style="stop-color:var(--glowc);stop-opacity:0"/></radialGradient>' +
      '<linearGradient id="' + id + '-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--hz);stop-opacity:0"/><stop offset="1" style="stop-color:var(--hz);stop-opacity:1"/></linearGradient>' +
      '<radialGradient id="' + id + '-lamp"><stop offset="0" style="stop-color:var(--lampc);stop-opacity:.95"/><stop offset=".22" style="stop-color:var(--lampc);stop-opacity:.4"/><stop offset="1" style="stop-color:var(--lampc);stop-opacity:0"/></radialGradient></defs>';
    return '<svg class="view" viewBox="0 0 ' + VW + " " + VH + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' + defs2 +
      '<rect width="' + VW + '" height="' + (VZ + 3) + '" fill="url(#' + id + '-s)"/><ellipse class="w-glow v-glow" cx="132" cy="' + (VZ - 22) + '" rx="60" ry="34" fill="url(#' + id + '-g)"/>' +
      (o.flip ? '<g transform="translate(' + VW + ' 0) scale(-1 1)">' : "") +
      s + lamps + (glows ? '<g class="w-lampson' + (base === "surf" ? " w-dig" : "") + '">' + glows + "</g>" : "") + (o.flip ? "</g>" : "") + "</svg>";
  }

  // ---- what the page needs besides the pictures ------------------------------
  function hx(c, i) { return parseInt(c.slice(1 + i * 2, 3 + i * 2), 16); }
  function mixHex(a, b, t) {
    var o = "#";
    for (var i = 0; i < 3; i++) o += ("0" + Math.round(hx(a, i) + (hx(b, i) - hx(a, i)) * t).toString(16)).slice(-2);
    return o;
  }
  function lum(c) {
    var v = [0, 1, 2].map(function (i) { var s = hx(c, i) / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // Call right after RIG.sky.apply(el, r) with the same palette. It sets what
  // the kit reads and the engine does not: whether the sky is a dark one, and
  // the tone of a title that sits in the sky (whichever of the sky's own two
  // tones, ink or paper, reads best against the air behind it).
  function dress(el, p) {
    var air = mixHex(p.sky[0], p.sky[1], 0.25);
    var pale = contrast(p.paper, air) > contrast(p.ink, air);
    el.setAttribute("data-dark", p.dark ? "1" : "0");
    el.style.setProperty("--sky-ink", pale ? p.paper : p.ink);
    el.style.setProperty("--sky-halo", air);
    // A pale title on a daytime sky (dawn) gets a thin dark edge to hold it.
    // A title never comes down into the pale air near the horizon: the page
    // stands the picture taller under one that wraps (fitBand in index.html),
    // and a close halo of this same air holds it (kit.css, .hero h1.long).
    el.setAttribute("data-title", pale && !p.dark ? "pale" : "ink");
  }
  // A strip of sky from hour h0 to h1, as a CSS gradient, n steps. paletteAt(h)
  // answers with the sky engine's palette for that hour. Used by a day's
  // ribbon and by the plan's timeline.
  function stops(h0, h1, n, paletteAt) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var p = paletteAt(h0 + ((h1 - h0) * i) / n);
      out.push((p.dark ? mixHex(p.sky[1], p.ink2, 0.13) : mixHex(p.sky[0], p.sky[1], 0.6)) + " " + Math.round((i / n) * 100) + "%");
    }
    return "linear-gradient(90deg," + out.join(",") + ")";
  }

  // With a spot's card (o.spot) each builder paints that spot; without one,
  // the painting of its kind of water, as it always has.
  var BUILD = {
    sound: function (id, o) { return o && o.spot ? hang(seaSpot(id, o)) : sound(id); },
    pier: function (id, o) { return o && o.spot ? hang(seaSpot(id, o)) : pier(id); },
    river: function (id, o) { return o && o.spot ? hang(riverSpot(id, o)) : river(id); },
    lake: function (id, o) { return o && o.spot ? hang(lakeSpot(id, o)) : lake(id, o); },
    surf: surf
  };
  RIG.water = {
    // Paint a scene into a .scene element. Safe to call twice. opts is the
    // builder's own options (see lake and surf): what a spot's card will pass.
    // A spot's card (RIG.spotScenes[id], plus o.now for today and o.activity
    // or o.how for which of its stands) paints that spot: its builder
    // (o.scene) wins over the element's data-scene, which follows it.
    scene: function (el, opts) {
      if (!el || el.dataset.painted) return;
      var kind = el.dataset.scene || "sound", o = standOf(kind, opts);
      if (o && o.spot && o.scene && BUILD[o.scene] && o.scene !== kind) { kind = o.scene; el.setAttribute("data-scene", kind); }
      el.innerHTML = (BUILD[kind] || BUILD.sound)("w" + kind, o) + '<div class="sc-rain"></div><div class="sc-grain"></div>';
      // which spot, and which of its places, the picture is (the Green's
      // Auburn Narrows or Flaming Geyser, Westport's float or beach)
      if (o && o.spot && o.standName) el.setAttribute("data-stand", o.standName); else if (el.removeAttribute) el.removeAttribute("data-stand");
      lightUp(el, o);
      el.dataset.painted = "1";
    },
    // A 48 by 48 thumbnail: kind is pier, river, lake, surf or beach; o is
    // the place's own paint (dock, activity), as for its scene.
    mini: mini,
    // A tile-sized painting that follows the sky by itself: river, lake, pier,
    // surf, sound, kayak-lake, kayak-sound or fly.
    view: view,
    dress: dress,
    stops: stops,
    // where the moon stands (degrees true, degrees up) at a local moment
    moonSky: moonSky,
    // for the tests: where today's water stands at a spot (metres), from its paint
    place: function (o) { var t = today(o), w = world(lens(o), o, t); return { wl: w.wl, E: w.E, edgeZ: w.edgeZ, foot: w.foot, wet: w.wet }; },
    scenes: Object.keys(BUILD)
  };
})(typeof window !== "undefined" ? window : globalThis);
