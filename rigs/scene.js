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
    var tiers = Math.max(3, Math.round(h / (o.step || 2.3 + r() * 1.9)));
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
    function land(x) {
      var k = u(x), env = Math.pow(1 - Math.pow(k, shape), 0.9);
      return o.h * env * (0.5 + 0.5 * (nz(x * freq) * 0.7 + nz(x * freq * 3.1 + 9) * 0.3));
    }
    function fade(x) { return Math.min(1, (1 - u(x)) * (o.tipFade || 7) + 0.12); }
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
    return out;
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
  function pile(r, x, top, bot, w, cls) {
    var tilt = (r() - 0.5) * w * 0.5, cut = (r() - 0.3) * w * 0.4, wt = w * 0.84;
    var s = '<path class="' + (cls || "w-pile") + '" d="' + poly([[x - wt / 2 + tilt, top + cut], [x + wt / 2 + tilt, top], [x + w / 2, bot], [x - w / 2, bot]]) + '"/>';
    s += '<path class="w-litl" d="' + poly([[x - wt / 2 + tilt, top + cut], [x - wt / 2 + tilt + w * 0.26, top + cut * 0.7], [x - w / 2 + w * 0.26, bot], [x - w / 2, bot]]) + '"/>';
    s += '<path class="w-litr" d="' + poly([[x + wt / 2 + tilt - w * 0.26, top + cut * 0.3], [x + wt / 2 + tilt, top], [x + w / 2, bot], [x + w / 2 - w * 0.26, bot]]) + '"/>';
    s += '<path class="w-cap" d="' + poly([[x - wt / 2 + tilt, top + cut], [x + wt / 2 + tilt, top], [x + wt / 2 + tilt, top + 1.3], [x - wt / 2 + tilt, top + cut + 1.3]]) + '"/>';
    var wet = Math.min(16, (bot - top) * 0.3) * (0.7 + r() * 0.5);
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
    return '<rect class="w-skyf" width="' + W + '" height="' + (HZ + 2) + '" fill="url(#' + id + '-sky)"/>' +
      '<g class="w-lightpos"><circle r="150" fill="url(#' + id + '-glow)" class="w-glow"/></g>' +
      stars(o.seed + 5) + clouds(o.seed + 3, id) +
      (o.mtn ? '<g mask="url(#' + id + '-mtnm)">' + mountain(o.mtn[0], o.mtn[1], o.mtn[2]) + "</g>" : "");
  }
  function reflect(id, key, hl, k, cls) {
    // the land again, upside down and squashed, fading as it leaves the shore
    var b = hl.base(0), g = id + "-rf" + key;
    return {
      def: '<linearGradient id="' + g + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + n(b) + '" x2="0" y2="' + n(b - hl.maxH * 1.02) + '">' +
        '<stop offset="0" class="' + cls + '-stop" stop-opacity=".74"/><stop offset=".6" class="' + cls + '-stop" stop-opacity=".34"/><stop offset="1" class="' + cls + '-stop" stop-opacity="0"/></linearGradient>',
      svg: '<g filter="url(#' + id + '-wv)"><g transform="translate(0 ' + n(b * (1 + k)) + ") scale(1 " + n(-k) + ')" fill="url(#' + g + ')"><path d="' + hl.land + '"/>' +
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
  function glintLayers(seed, y0, y1) {
    var a = '<g class="w-gl">' + glints(seed, 1, y0, y1) + "</g>" + '<g class="w-lightx"><g class="w-gr">' + lightRoad(seed + 2, y0, y1) + "</g></g>";
    var b = '<g class="w-gl">' + glints(seed + 1, 1, y0, y1) + "</g>" + '<g class="w-lightx"><g class="w-gr">' + lightRoad(seed + 3, y0, y1) + "</g></g>";
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
    var mid = defs(id + "m", rB.def) + rB.svg + land(bank, "w-l3") + '<path class="w-beach" d="M-4 ' + n(RY + 0.4) + 'H232"/>' +
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

  // ---- thumbnails ------------------------------------------------------------
  // Each trip carries a small painting of its own water under its own sky:
  // the sky engine's palette for the hour the trip starts. Squid is a lit
  // pier at dusk, chum is a river at dawn. Colours are the engine's, as is.
  function mini(kind, pal) {
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
      s += trees(0, 48, 26, 5, f1) + '<rect y="26" width="48" height="22" fill="url(#' + gid + 'w)"/>' + trees(0, 30, 26.5, 15, f2);
      s += '<g transform="translate(0 53) scale(1 -1)" opacity=".45">' + trees(0, 30, 26.5, 11, f2) + "</g>";
      s += '<path d="M26 38.5H48V40.3H26Z" fill="' + f3 + '"/><rect x="30" y="39" width="1.5" height="6" fill="' + f3 + '"/><rect x="40" y="39" width="1.8" height="7.5" fill="' + f3 + '"/>';
      s += gl(5, 31, 10, 0.5) + gl(18, 35, 8, 0.45) + gl(4, 42, 14, 0.4) + gl(30, 31.5, 9, 0.5);
    } else if (kind === "surf") {
      s += '<rect y="20" width="48" height="28" fill="url(#' + gid + 'w)"/>';
      s += '<path d="M0 34Q16 31 30 35T48 36V48H0Z" fill="' + mx(p.ground, p.water[0], dark ? 0.2 : 0.3) + '"/>';
      s += '<path d="M0 39Q18 36 32 40T48 42V48H0Z" fill="' + mx(p.ground, p.ink, dark ? 0.06 : 0.14) + '"/>';
      [[0, 23.5, 30, 0.5], [20, 26.5, 28, 0.6], [2, 29.5, 34, 0.75]].forEach(function (q) { s += '<path d="M' + q[0] + " " + q[1] + "q" + q[2] / 4 + " -1.2 " + q[2] / 2 + " 0t" + q[2] / 2 + ' 0" fill="none" stroke="' + lum + '" stroke-width="1.1" stroke-linecap="round" opacity="' + q[3] + '"/>'; });
      s += '<path d="M0 34Q16 31 30 35T48 36" fill="none" stroke="' + lum + '" stroke-width="1.3" opacity=".8"/>';
      if (dark) s += '<circle cx="15" cy="40" r="11" fill="url(#' + gid + 'g)"/><circle cx="15" cy="40" r="1.2" fill="' + p.accent2 + '"/><path d="M15 39.4V35.6" stroke="' + f3 + '" stroke-width="1.6" stroke-linecap="round"/>';
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

  var BUILD = { sound: sound, pier: pier, river: river };
  RIG.water = {
    // Paint a scene into a .scene element. Safe to call twice.
    scene: function (el) {
      if (!el || el.dataset.painted) return;
      var kind = el.dataset.scene || "sound";
      el.innerHTML = (BUILD[kind] || sound)("w" + kind) + '<div class="sc-rain"></div><div class="sc-grain"></div>';
      el.dataset.painted = "1";
    },
    // A 48 by 48 thumbnail: kind is pier, river, lake, surf or beach.
    mini: mini,
    dress: dress,
    stops: stops,
    scenes: Object.keys(BUILD)
  };
})(typeof window !== "undefined" ? window : globalThis);
