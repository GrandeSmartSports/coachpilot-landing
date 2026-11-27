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
    var SW = 236 - (tide - 0.5) * 14;          // where the wash stops on the sand
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
    var mid = defs(id + "m") + breaker(31 + sd, 199, 1.6 * bk, 1.2) + breaker(37 + sd, 207, 3.2 * bk, 2) + breaker(43 + sd, 221, 6.6 * bk, 3.4) +
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
    [[132, SW + 22, 1.35, 1, 1], [212, SW + 14, 0.95, 0, -1], [266, SW + 19, 1.1, 1, -1], [246, SW + 7, 0.58, 1, 1], [176, SW + 6, 0.52, 0, 1]].forEach(function (g) {
      lamps += lantern(g[0] - 11 * g[2] * g[4], g[1] + 1.5 * g[2], g[2]);
      dig += digger(g[0], g[1], g[2], g[3], g[4]);
    });
    // and down the beach both ways: points of light getting smaller
    for (k = 0; k < 15; k++) {
      var side = k % 2 ? 1 : -1, t = (k + 1) / 16, fx = 195 + side * (38 + t * 170) + (r() - 0.5) * 22, fy = SW + 3.5 - t * 0 + r() * 3.4, fs = 0.34 - t * 0.2;
      far2 += '<circle cx="' + n(fx) + '" cy="' + n(fy) + '" r="' + n(0.55 + fs * 1.5) + '" opacity="' + n(0.6 + r() * 0.4) + '"/><ellipse cx="' + n(fx) + '" cy="' + n(fy + 1.6 + fs * 3) + '" rx="' + n(1.6 + fs * 5) + '" ry="' + n(0.5 + fs) + '" opacity="' + n(0.16 + r() * 0.16) + '"/>';
    }
    // the surf perch way: two long rods in the wash, one near, one down the beach
    var day = angler(150, SW + 9, 1.75, 1, 70) + angler(232, SW + 1, 0.9, -1, 40);
    var heads = headlamp(150, SW + 9, 1.75, 1);
    // the near shore: the edge of a dune, its beach grass the darkest thing in
    // the picture, the way the pilings and firs are on the others
    var dune = "", grass = "", dz = noise(63 + sd), gx;
    var duneTop = function (xx) { return 268 - Math.pow(Math.max(0, xx - 286) / 104, 0.75) * 40 + (dz(xx * 0.05) - 0.5) * 3; };
    var dp = [[282, 268]];
    for (gx = 286; gx <= W + 6; gx += 6) dp.push([gx, duneTop(gx)]);
    dune = poly(dp.concat([[W + 6, 300], [282, 300]]));
    for (gx = 290; gx <= W + 4; gx += 2.2 + r() * 2.4) {
      var gb = duneTop(gx) + 1.5, gh = (8 + r() * 15) * (0.55 + (gx - 286) / 160), lean = (r() - 0.35) * 10;
      grass += poly([[gx - 0.9, gb], [gx + lean * 0.5, gb - gh * 0.6], [gx + lean, gb - gh], [gx + 0.9, gb]]);
    }
    var near = '<path class="w-shorewet" d="' + line(dp.map(function (q) { return [q[0] - 4, q[1] + 3]; })) + 'L' + (W + 6) + ' 300L278 300Z"/>' +
      '<path class="w-pile" d="' + dune + '"/><path class="w-pile" d="' + grass + '"/>' +
      '<path class="w-liteb" d="' + line(dp.slice(1, 9).map(function (q) { return [q[0], q[1] + 0.6]; })) + '"/>';
    // a drift log left by the last big tide, half buried
    var log = "";
    if (o.log !== false) {
      log = '<path class="w-cob-sh" d="' + poly([[-6, 266], [112, 259], [128, 261], [116, 266], [8, 273]]) + '"/>' +
        '<g class="w-log"><path class="w-pile" d="' + poly([[-8, 253], [28, 250.6], [70, 248.8], [104, 248.2], [111, 249.4], [113, 252.6], [110, 256], [103, 257.6], [70, 258.4], [28, 261.4], [-8, 265]]) + '"/>' +
        '<path class="w-pile" d="' + poly([[58, 249.6], [52, 240], [54.4, 239.2], [63, 249.4]]) + '"/>' +
        '<path class="w-pile" d="' + poly([[86, 248.6], [90, 242.4], [92, 243], [91, 248.6]]) + '"/>' +
        '<path class="w-liteb" d="M-6 254L28 251.4L70 249.6L103 249"/></g>';
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
    if (o.dune === "left") near = '<g transform="translate(' + W + ' 0) scale(-1 1)">' + near + "</g>";
    var front = defs(id + "f") + wrack + log + people + near;
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
  //   date   the day: where the sun sets and how full the moon is
  var WINDS = { glass: 0, calm: 0, ripple: 0.33, light: 0.33, chop: 0.66, whitecaps: 1 };
  function today(o) {
    var t = (o && o.now) || {}, d = t.date ? new Date(t.date) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    function c(v, def) { v = v == null || v === "" || isNaN(+v) ? def : +v; return clamp(v, 0, 1); }
    var w = typeof t.wind === "string" ? WINDS[t.wind] : t.wind;
    return { tide: c(t.tide, 0.5), river: c(t.river, 0.35), wind: c(w, 0.3), rain: c(t.rain, 0), fog: c(t.fog, 0),
      moon: t.moon == null ? moonLit(d) : c(t.moon, 0.5), date: d };
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
        var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, s = (a[2] + (b[2] - a[2]) * t) * (0.55 + r() * 0.8), hgt = s * (o.tall || 1.1);
        var cx = x + (r() - 0.5) * s * 0.5, cy = y - hgt * (0.25 + r() * 0.55), rx = s * (0.5 + r() * 0.45), ry = s * (0.32 + r() * 0.26), m = 9, pp = [], tilt = (r() - 0.5) * 0.5;
        for (j = 0; j < m; j++) { var an = Math.PI + (j / (m - 1)) * Math.PI, k2 = 0.82 + r() * 0.26; pp.push([cx + Math.cos(an) * rx * k2, cy + Math.sin(an) * ry * k2 + Math.cos(an) * tilt * ry]); }
        pp.push([cx + rx * 0.95, y + 0.4], [cx - rx * 0.95, y + 0.4]);
        body += poly(pp);
        lit += poly([pp[1], pp[2], pp[3], pp[4], pp[5], [pp[5][0], pp[5][1] + ry * 0.16], [pp[3][0], pp[3][1] + ry * 0.2], [pp[1][0], pp[1][1] + ry * 0.12]]);
        dark += poly([[cx + rx * 0.2, cy + ry * 0.15], [cx + rx * 0.95, cy + ry * 0.05], [cx + rx * 0.95, y + 0.4], [cx + rx * 0.05, y + 0.4]]);
        heap.push([x, cy - ry * 0.75]);
        foot.push([x, y]);
        t += (s * (0.38 + r() * 0.3)) / Math.max(1, len);
      }
    }
    var wh = o.wet || 0;
    if (wh > 0) foot.forEach(function (q, k) { if (k) { var p0 = foot[k - 1], s0 = Math.max(0.4, wh * (q[1] - (pts[0][1] - 40)) / 60); wet += poly([[p0[0], p0[1] - s0], [q[0], q[1] - s0], [q[0], q[1] + 0.4], [p0[0], p0[1] + 0.4]]); } });
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
      var fork = base - h * (0.24 + r() * 0.1), rx = h * (o.wide || 0.3 + r() * 0.12) * (o.vase ? 1.15 : 1), ry = (fork - top) * 0.56, cy = top + ry * 0.95, m = 30, pts = [], limbs = "";
      for (i = 0; i < m; i++) {
        var a = (i / m) * Math.PI * 2, k = (0.8 + r() * 0.28) * (i % 2 ? 0.9 : 1), up = Math.sin(a) < 0;
        pts.push([cx + Math.cos(a) * rx * k * (up && o.vase ? 1.08 : 0.92), cy + Math.sin(a) * ry * k * (up ? 1 : 1.05)]);
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
      }
      return { crown: poly(pts), trunk: trunk + limbs, top: cy - ry };
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
        out.trees += conifer(r, x, foot, th * 1.16, { full: 0.2 + r() * 0.06 });
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
    return '<g class="' + cls + '"><path d="' + wl.land + '"/>' + (wl.twigs ? '<path class="w-twig" d="' + wl.twigs + '"/>' : "") + '<path d="' + wl.trees + '"/></g>';
  }
  // Houses along a far bank, small and half in the trees: a pale wall, a
  // dark low roof, and after dark a window or two lit with its thread of
  // light on the water at wy.
  function houses(id, r, xs, base, sz, wy) {
    var walls = "", roofs = "", lit = "", glows = "";
    xs.forEach(function (x) {
      var w = sz * (1.5 + r() * 1.3), h = sz * (0.75 + r() * 0.35), rh = sz * (0.3 + r() * 0.25), y = base(x) - 0.3, ridge = x + (r() - 0.5) * w * 0.4;
      walls += poly([[x - w / 2, y], [x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2, y]]);
      roofs += poly([[x - w / 2 - sz * 0.2, y - h + 0.2], [ridge, y - h - rh], [x + w / 2 + sz * 0.2, y - h + 0.2]]);
      if (r() < 0.75) {
        var wx = x + (r() - 0.5) * w * 0.5, wy0 = y - h * 0.55, ww = Math.max(0.6, sz * 0.32);
        lit += '<rect x="' + n(wx - ww / 2) + '" y="' + n(wy0 - ww * 0.6) + '" width="' + n(ww) + '" height="' + n(ww * 1.2) + '"/>';
        glows += '<circle cx="' + n(wx) + '" cy="' + n(wy0) + '" r="' + n(sz * 4) + '" fill="url(#' + id + '-lamp)"/>';
        for (var k = 0; k < 6; k++) { var q = k / 6, l = sz * (0.8 + q * 2.4) * (0.6 + r() * 0.6); lit += '<rect x="' + n(wx - l / 2 + (r() - 0.5) * sz) + '" y="' + n(wy + 1 + k * (1 + q * 1.6)) + '" width="' + n(l) + '" height="' + n(0.5 + q * 0.6) + '" rx=".3" opacity="' + n((1 - q * 0.8) * 0.8) + '"/>'; }
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
    var e = 1.6, cx = W / 2 + (p.vx || 0) * V.ud, pj = eye(V, cx), fl = V.fl;
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

  // ---- parts: the bank ---------------------------------------------------------------
  // A Sound beach from the shore: the tide's edge (yW, high in the picture
  // at low water, close at high water), the wet flat below it shining with
  // the sky, ripple marks and a pool or two the tide left, then dry sand.
  function flats(id, seed, yW, low) {
    var r = rnd(seed), nz = noise(seed + 3), x, k, edge = [], dry = [];
    for (x = -6; x <= W + 6; x += 8) edge.push([x, yW + (nz(x * 0.014) - 0.5) * 7 + (nz(x * 0.08 + 4) - 0.5) * 2]);
    var yD = yW + 20 + low * 22;
    for (x = W + 6; x >= -6; x -= 12) dry.push([x, yD + (nz(x * 0.01 + 20) - 0.5) * 10]);
    var wet = poly(edge.map(function (q) { return [q[0], q[1] - 0.6]; }).concat(dry));
    var sheen = "", rip = "", pools = "";
    for (k = 0; k < 40 + low * 30; k++) {
      var wy = yW + 3 + r() * (yD - yW), wx = r() * W, wl = 5 + r() * 22;
      sheen += '<path d="M' + n(wx) + " " + n(wy) + "h" + n(wl) + '" stroke-width="' + n(0.4 + r() * 0.7) + '" opacity="' + n(0.2 + r() * 0.55) + '"/>';
    }
    for (k = 0; k < 70 * low; k++) {
      var ry = yW + 6 + Math.pow(r(), 0.8) * (yD - yW - 4), rx = r() * W, rl = 1.5 + (ry - yW) * 0.12 * (0.6 + r());
      rip += poly([[rx, ry], [rx + rl * 0.5, ry - 0.35 - (ry - yW) * 0.008], [rx + rl, ry], [rx + rl * 0.5, ry + 0.25]]);
    }
    for (k = 0; k < Math.round(low * 4); k++) {
      var py = yW + 10 + r() * (yD - yW - 12), px = r() * W, pw = 14 + r() * 40 * (0.6 + (py - yW) / 50);
      pools += '<ellipse cx="' + n(px) + '" cy="' + n(py) + '" rx="' + n(pw) + '" ry="' + n(1.2 + (py - yW) * 0.05) + '"/>';
    }
    var lace = line(edge.map(function (q) { return [q[0] + 2, q[1] + 1.8]; }));
    return '<path class="w-flat" d="' + wet + '"/>' + '<g class="w-lightx"><ellipse class="w-sandroad" cx="0" cy="' + n(yW + 14) + '" rx="54" ry="22" fill="url(#' + id + '-glow)"/></g>' +
      '<g class="w-pools">' + pools + '</g><g class="w-sheen">' + sheen + '</g><path class="w-ripm" d="' + rip + '"/>' +
      '<path class="w-lace" d="' + lace + '"/><path class="w-foam" d="' + line(edge) + '"/>' +
      '<path class="w-shore" d="' + line(dry.slice().reverse()) + "L" + (W + 6) + " " + (H + 4) + "L-6 " + (H + 4) + 'Z"/>';
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
  function ramp(seed, kind, yW, x0, x1) {
    var r = rnd(seed), cx = (x0 + x1) / 2, top = [[x0 - 26, H + 4], [x1 + 26, H + 4], [cx + (x1 - x0) * 0.32, yW], [cx - (x1 - x0) * 0.32, yW]];
    var sub = quad([cx - (x1 - x0) * 0.32, yW], [cx + (x1 - x0) * 0.32, yW], [cx + (x1 - x0) * 0.22, yW - 8], [cx - (x1 - x0) * 0.22, yW - 8]);
    var marks = "", k;
    if (kind === "gravel") return '<path class="w-rampw" d="' + sub + '"/><path class="w-gravel" d="' + poly(top) + '"/>' + cobbles(seed + 1, x0 - 10, x1 + 10, yW + 2, H, 160);
    for (k = 0; k < 14; k++) { var y = yW + 2 + k * k * 0.42, u = (y - yW) / (H - yW), hw = (x1 - x0) * (0.32 + u * 0.5) + u * 26; marks += "M" + n(cx - hw * 0.96) + " " + n(y) + "H" + n(cx + hw * 0.96); }
    return '<path class="w-rampw" d="' + sub + '"/><path class="w-ramp" d="' + poly(top) + '"/><path class="w-groove" d="' + marks + '"/>' +
      '<path class="w-liteb" d="M' + n(cx - (x1 - x0) * 0.32) + " " + n(yW) + "H" + n(cx + (x1 - x0) * 0.32) + '"/>';
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
    var back = defs(id) + skyLayer(id, { seed: sd + 100 }) + peaksOf(id, sky, V, HZ, sd, litLeft) + waterLayer(id) +
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
    mid += whitecaps(sd + 5, HZ + 8, 300, wd.caps);
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
    if (o.view === "deck") front += onPier(id + "f", o.pier || {}, t, r, V);
    else if (o.view === "side") { var sp = sidePier(id + "f", o.pier || {}, t, r); fdef += sp.def; front += sp.svg; }
    else if (o.view === "dock" || o.view === "float") front += onDock(id + "f", o.dock || {}, t, r, V);
    front += over;
    if (!under && o.view !== "deck" && o.view !== "dock" && o.view !== "float") front += shoreEdge([[-2, 305], [60, 302], [130, 304], [200, 308], [270, 309], [330, 307], [392, 310]]);
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
  function lakeSpot(id, o) {
    var t = today(o), V = lens(o), sd = idSeed(o.spot), r = rnd(sd + 131), wd = windOf(t.wind * 0.75), lk = o.lake || {}, E = 1.7;
    var isBare = bare(t.date), mix = lk.mix == null ? 0.3 : lk.mix, sky = o.skyline || [], low = lk.drawdown ? 2.2 : 0, k;
    var Lt = lightOf(V.f, t.date);
    var shores = lk.shores || [{ from: V.f - 80, to: V.f + 80, m: lk.across || 300, houses: lk.houses || 0 }];
    var yTop = 999;
    shores.forEach(function (s) { var y = HZ + (V.fl * E) / s.m; if (y < yTop) yTop = y; });
    (lk.islands || []).forEach(function (s) { var y = HZ + (V.fl * E) / s.m; if (y < yTop) yTop = y; });
    var back = defs(id) + skyLayer(id, { seed: sd + 700 }) + peaksOf(id, sky, V, yTop - 1, sd, Lt.set.rel < 0) + waterLayer(id, yTop - 1);
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
      var wl = wall({ seed: seed, x0: s.island ? x0 : x0 - 20, x1: s.island ? x1 : x1 + 20, base: base, h: th, mix: s.mix == null ? mix : s.mix, bare: isBare, land: Math.max(1, th * 0.06),
        grow: s.island ? function (x) { var u = (x - x0) / Math.max(1, x1 - x0); return (s.blunt || 0.35) + (1 - (s.blunt || 0.35)) * Math.pow(clamp(Math.min(u, 1 - u) * 4, 0, 1), 0.5); } : null });
      var rf = reflect(id, "s" + i, wl.glass, 0.92, cls === "w-l0" ? "w-l1" : cls === "w-l4" ? "w-l5" : cls);
      mdef += rf.def;
      mid += '<g opacity="' + n(wd.refl) + '">' + rf.svg + "</g>";
      if (low) mid += '<path class="w-mud" d="' + quad([x0 - 30, vy - 0.5], [x1 + 30, vy - 0.5], [x1 + 30, wy + 0.6], [x0 - 30, wy + 0.6]) + '"/>';
      mid += paintWall(wl, cls);
      if (s.houses) {
        var xs = [], hr = rnd(seed + 3);
        for (k = 0; k < s.houses; k++) xs.push(x0 + ((k + 0.3 + hr() * 0.5) / s.houses) * (x1 - x0));
        // the houses stand at the water's edge, in front of their trees
        mid += houses(id + "m", hr, xs, function () { return vy; }, clamp((V.fl * 8) / s.m, 2.4, 12), wy);
      }
      mid += '<path class="w-beach" d="M' + n(x0) + " " + n(wy + 0.3) + "H" + n(x1) + '"/>' + mist(id + "m", sd + 90 + i, wy + 2, 0.7);
    });
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
    // the bank beside you
    if (lk.wetland) {
      var wl2 = lk.wetland === "left", wx0 = wl2 ? -10 : 286, wx1 = wl2 ? 104 : 400, wy2 = yTop + 22;
      var edgeP = [[wl2 ? wx1 : wx0, wy2 + 3], [wl2 ? wx0 : wx1, wy2 - 4], [wl2 ? wx0 : wx1, wy2 + 40], [wl2 ? wx1 + 20 : wx0 - 20, wy2 + 40]];
      near += '<path class="w-lawn" d="' + poly(edgeP) + '"/>' + grass(sd + 77, [[wx0 + 12, wy2 + 2, 9], [wx0 + 40, wy2 + 1, 9], [wx0 + 70, wy2, 9], [wx0 + 96, wy2 - 1, 7]], 12, "w-sedge");
      var bx = wl2 ? 30 : 352, by = wy2 + 9;
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
      near += mud + '<path class="w-pile" d="' + st + '"/>';
    }
    var stand = lk.stand, front = "", yW = yTop + 60;
    if (stand === "dock" || stand === "pier") front += onDock(id + "f", o.dock || {}, t, r, V);
    else if (stand === "ramp" || stand === "gravel") front += ramp(sd + 9, stand === "gravel" ? "gravel" : "concrete", Math.min(242, yW), 160, 236);
    else front += shoreEdge([[-2, 306], [60, 303], [130, 305], [200, 309], [270, 310], [330, 308], [392, 311]]);
    var fog = t.fog > 0 ? '<rect class="w-fog" width="' + W + '" height="' + H + '"/>' : "";
    return { back: back, gl: [sd + 800, yTop + 5, H, 0.45 * wd.dens], mid: defs(id + "m", mdef) + fog + mid + near, front: defs(id + "f") + front };
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
  function riverSpot(id, o) {
    var t = today(o), V = lens(o), sd = idSeed(o.spot), r = rnd(sd + 91), rv = o.river || {}, lvl = t.river, RY = rv.y || 198, k, x;
    var isBare = bare(t.date), dir = rv.flow === "left" ? -1 : 1, far = rv.far || { kind: "mixed" };
    // the water's colour: clear and green-dark when the river is low, milky
    // with the sky's own pale when it runs high
    var clear = Math.round((1 - lvl) * 26), milk = Math.round(lvl * lvl * 44);
    function wc(v) { return "color-mix(in oklab,color-mix(in oklab," + v + ",var(--shore) " + clear + "%),var(--hz) " + milk + "%)"; }
    var wdef = '<linearGradient id="' + id + '-rw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + wc("var(--water1)") + '"/><stop offset="1" style="stop-color:' + wc("var(--water2)") + '"/></linearGradient>';
    var back = defs(id, wdef) + skyLayer(id, { seed: sd + 500 });
    if (rv.valley) {
      var v1 = headland({ seed: sd + 7, from: -60, to: 230, base: RY - 4, h: 74, tree: 2.6, gap: 2.1, shape: 1.5, freq: 0.012, tipFade: 3 });
      var v2 = headland({ seed: sd + 8, from: 460, to: 150, base: RY - 3, h: 88, tree: 3.2, gap: 2.2, shape: 1.7, freq: 0.011, tipFade: 3 });
      back += '<path class="w-l0" d="' + v1.land + '"/>' + mist(id, sd + 81, RY - 30, 1.6) + '<path class="w-l1" d="' + v2.land + '"/>' + mist(id, sd + 82, RY - 12, 1.3);
    }
    back += '<rect y="' + (RY - 2) + '" width="' + W + '" height="' + (H - RY + 2) + '" fill="url(#' + id + '-rw)"/>' +
      '<rect y="' + (RY - 2) + '" width="' + W + '" height="40" fill="url(#' + id + '-hzr)"/>' +
      '<g class="w-lightx"><ellipse cx="0" cy="' + (RY - 2) + '" rx="58" ry="' + (H - RY) + '" fill="url(#' + id + '-glow)" class="w-road"/></g>';
    // the far bank
    var fb, mdef = "", mid = "";
    if (far.kind === "plain") {
      fb = headland({ seed: sd + 31, from: -30, to: 430, base: RY, h: far.h || 5, tree: far.tree || 6, gap: 3.2, shape: 12, freq: 0.012, tipFade: 60 });
      fb.trees = "";
    } else fb = wall({ seed: sd + 31, x0: -24, x1: 414, base: RY, h: far.h || 44, mix: far.kind === "cottonwood" ? 0.05 : far.mix || 0.4, bare: isBare, vase: far.kind === "cottonwood", land: 2.4, freq: 0.022 });
    if (far.kind === "cottonwood") {
      var fb2 = wall({ seed: sd + 37, x0: -24, x1: 414, base: RY - 3, h: (far.h || 44) * 1.18, mix: 0.04, bare: isBare, vase: true, land: 1.5, freq: 0.016 });
      back += paintWall(fb2, "w-l1");
    }
    var rf = reflect(id, "b", fb.glass || fb, 0.62, "w-l3");
    mdef += rf.def;
    mid += '<g opacity="' + n(1 - lvl * 0.62) + '">' + rf.svg + "</g>" + (far.kind === "plain" ? '<path class="w-l3" d="' + fb.land + '"/>' : paintWall(fb, "w-l3")) + '<path class="w-beach" d="M-4 ' + n(RY + 0.4) + 'H394"/>' + mist(id + "m", sd + 83, RY + 3, 0.45);
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
    // little dragged the way the water runs
    var rf2 = "";
    for (k = 0; k < 40 + lvl * 60; k++) {
      var ry = RY + 4 + r() * r() * (40 + lvl * 20), rx = r() * W, rl = (2 + r() * 7 + (ry - RY) * 0.3) * (0.8 + lvl * 0.7);
      rf2 += '<path d="M' + n(rx) + " " + n(ry) + "q" + n((dir * rl) / 2) + " " + n(-0.6 - r() * 0.6) + " " + n(dir * rl) + " " + n(0.3 + lvl * 0.4) + '" opacity="' + n(0.3 + r() * 0.6) + '"/>';
    }
    mid += '<g class="w-riffle">' + rf2 + "</g>";
    // a low cobble edge out in the river
    if (rv.cobble && lvl < 0.85) { var cz = 1 - lvl * 0.9; mid += rocks(sd + 41, [[rv.cobble[0], RY + 22, 3 * cz], [(rv.cobble[0] + rv.cobble[1]) / 2, RY + 26, 4.6 * cz], [rv.cobble[1], RY + 31, 6 * cz]], { tall: 0.62, wet: (1 - lvl) * 2.4 }); }
    // a creek pouring in from your bank, and the eddy turning where it meets the river
    if (rv.creek) {
      // your own bank comes in from the left; the creek cuts through it
      var cx = rv.creek.x, bk = [[-6, RY + 8], [cx - 34, RY + 12], [cx - 18, RY + 22], [cx - 30, 262], [-6, 262]], bk2 = [[cx + 16, 262], [cx + 6, RY + 30], [cx + 40, RY + 40], [cx + 70, 262]];
      var wh = "", ed = "", tongue = poly([[cx - 30, RY + 17], [cx + 2, RY + 13], [cx + 22, RY + 15], [cx + 12, 262], [cx - 22, 262]]);
      for (k = 0; k < 70; k++) { var u = r(), yy = RY + 13 + u * 50, xx = cx - 22 + r() * 36 + u * 4, ll = 1.2 + u * 6; wh += poly([[xx, yy], [xx + ll * 0.5, yy - 0.4 - u * 0.8], [xx + ll, yy], [xx + ll * 0.5, yy + 0.4 + u * 0.6]]); }
      for (k = 0; k < 4; k++) { var er = 10 + k * 9, ex = cx + 18 + 24 * dir, ey = RY + 16 + k * 1.8; ed += "M" + n(ex - er) + " " + n(ey) + "a" + n(er) + " " + n(er * 0.24) + " 0 1 " + (dir > 0 ? 1 : 0) + " " + n(er * 1.6) + " " + n(er * 0.14); }
      var bkt = wall({ seed: sd + 44, x0: -10, x1: cx - 30, base: function (x) { return RY + 10 + Math.max(0, x - (cx - 60)) * 0.4; }, h: 70, mix: 0.45, bare: isBare, land: 4, freq: 0.04 });
      mid += '<path class="w-creek" d="' + tongue + '"/><path class="w-capf" d="' + wh + '"/><path class="w-eddy" d="' + ed + '"/>' +
        '<path class="w-l5" d="' + poly(bk) + poly(bk2) + '"/>' + '<path class="w-rim" d="' + bkt.trees + '"/>' + paintWall(bkt, "w-l5");
    }
    // a hatchery outlet weir: a low concrete lip with the white of it pouring over
    if (rv.weir) {
      var wxa = -6, wxb = 118, wy = 236;
      mid += '<path class="w-ramp" d="' + poly([[wxa, wy - 9], [wxb, wy - 13], [wxb + 4, wy - 9], [wxb + 2, wy - 4], [wxa, wy + 1]]) + '"/>' +
        '<path class="w-liteb" d="M' + wxa + " " + n(wy - 9) + "L" + wxb + " " + n(wy - 13) + '"/>' +
        '<path class="w-capf" d="' + poly([[wxa, wy + 1], [wxb + 2, wy - 4], [wxb + 12, wy + 2], [wxb - 10, wy + 9], [wxa, wy + 10]]) + '"/>';
    }
    // plunkers' rods along your bank, upstream to the left, getting smaller
    var front = "", rods = "", figs = "";
    if (rv.rods) {
      var bank = [[-6, RY + 10], [60, RY + 22], [130, RY + 44], [176, 268]];
      front += '<path class="w-shore" d="' + line(bank) + "L-6 " + (H + 4) + 'Z"/><path class="w-foam" d="' + line(bank) + '"/>';
      for (k = 0; k < rv.rods; k++) {
        var q = (k + 0.5) / rv.rods, bxp = -2 + q * 150, byp = RY + 10 + Math.pow(q, 1.6) * 52, sc = 0.45 + q * 1.1;
        rods += "M" + n(bxp) + " " + n(byp) + "L" + n(bxp + 22 * sc) + " " + n(byp - 26 * sc);
        front += '<path class="w-line" d="M' + n(bxp + 22 * sc) + " " + n(byp - 26 * sc) + "Q" + n(bxp + 40 * sc) + " " + n(byp - 10 * sc) + " " + n(bxp + 56 * sc) + " " + n(byp + 6 * sc) + '"/>';
        if (k % 3 === 1) figs += poly([[bxp - 5 * sc, byp], [bxp - 4.4 * sc, byp - 9 * sc], [bxp - 1.6 * sc, byp - 9.4 * sc], [bxp - 1 * sc, byp]]) + "M" + n(bxp - 3 * sc + 1.6 * sc) + " " + n(byp - 11.2 * sc) + "a" + n(1.6 * sc) + " " + n(1.7 * sc) + " 0 1 0 " + n(-3.2 * sc) + " 0a" + n(1.6 * sc) + " " + n(1.7 * sc) + " 0 1 0 " + n(3.2 * sc) + " 0Z";
      }
      front += '<path class="w-rod" d="' + rods + '" stroke-width=".9"/><path class="w-figh" d="' + figs + '"/>';
    }
    // concrete platforms stepping down to the water ahead and right, with
    // the bumpers on their river side; a high river covers the lowest
    if (rv.steps) {
      // the water stands at wl: higher with the river, over the lowest tier
      var wl = 226 + (1 - lvl) * 8, st = "", rs = "", bp = "", lit = "", sub = "";
      [[250, 214, 236], [232, 236, 228], [218, 258, 221]].forEach(function (tr, k2) {
        var xl = tr[0], top = tr[2], y0 = top + 7, xr = 412;
        var slab = poly([[xl, top], [xr, top - 2.4], [xr, y0 - 2.4], [xl - 5, y0]]), riser = poly([[xl - 5, y0], [xr, y0 - 2.4], [xr, y0 + 6], [xl - 5, y0 + 8]]);
        if (top + 2 > wl) { sub += slab; return; }
        st += slab; rs += riser;
        lit += "M" + n(xl) + " " + n(top) + "L" + xr + " " + n(top - 2.4);
        for (x = xl + 4; x < xr; x += 15) bp += poly([[x, top + 0.2 - (x - xl) * 0.016], [x + 7, top - (x - xl + 7) * 0.016], [x + 7, top - 3.2 - (x - xl + 7) * 0.016], [x, top - 3 - (x - xl) * 0.016]]);
      });
      front += '<path class="w-rampw" d="' + sub + '"/><path class="w-rampr" d="' + rs + '"/><path class="w-ramp" d="' + st + '"/><path class="w-rampr" d="' + bp + '"/><path class="w-liteb" d="' + lit + '"/>' +
        '<path class="w-foam" d="M180 ' + n(wl + 1) + 'L412 ' + n(wl - 2) + '"/>';
    }
    // a crowd along the bank when the fish are in
    if (rv.crowd) {
      var cr = "", crod = "";
      for (k = 0; k < rv.crowd; k++) {
        var cq = k / Math.max(1, rv.crowd - 1), fx = 150 + cq * 230 + (r() - 0.5) * 8, fy = RY + 26 + cq * 22, s2 = 0.7 + cq * 0.6;
        cr += poly([[fx - 2.4 * s2, fy], [fx - 2 * s2, fy - 9 * s2], [fx + 2 * s2, fy - 9 * s2], [fx + 2.4 * s2, fy]]) + "M" + n(fx + 1.8 * s2) + " " + n(fy - 11 * s2) + "a" + n(1.8 * s2) + " " + n(1.9 * s2) + " 0 1 0 " + n(-3.6 * s2) + " 0a" + n(1.8 * s2) + " " + n(1.9 * s2) + " 0 1 0 " + n(3.6 * s2) + " 0Z";
        crod += "M" + n(fx + 1.5 * s2) + " " + n(fy - 6 * s2) + "L" + n(fx - 14 * s2) + " " + n(fy - 24 * s2);
      }
      front += '<path class="w-figh" d="' + cr + '"/><path class="w-rod" d="' + crod + '" stroke-width=".7"/>';
    }
    // the gravel and sand you stand on: the lower the river, the more of it shows
    if (rv.bar) {
      var g = (lvl - 0.35) * 50, gx = (0.35 - lvl) * 90;
      var bar = [[-2, 222 + g], [34 + gx * 0.4, 224 + g], [78 + gx * 0.7, 231 + g * 0.8], [124 + gx, 244 + g * 0.6], [168 + gx, 262 + g * 0.4], [206 + gx * 0.6, 284], [236, 308], [252, 332]];
      var stones = "", s5 = rnd(sd + 5);
      for (k = 0; k < (TILE ? 70 : 190); k++) {
        var sx = -4 + s5() * 250, e = bar[0][1] + Math.pow(Math.max(0, sx) / 250, 1.7) * 108, sy = e + 3 + s5() * s5() * 56, sz = 0.45 + s5() * s5() * 2.4 * (0.6 + (sy - 224) / 120);
        stones += '<ellipse class="' + (s5() < 0.3 ? "w-st-l" : "w-st-d") + '" cx="' + n(sx) + '" cy="' + n(sy) + '" rx="' + n(sz) + '" ry="' + n(sz * (0.45 + s5() * 0.2)) + '"/>';
      }
      front += '<path class="w-shorewet" d="' + line(bar.map(function (q) { return [q[0] + 6, q[1] - 6]; })) + 'L-2 332Z"/>' +
        '<path class="w-shore" d="' + line(bar) + 'L-2 332Z"/><path class="w-sand" d="' + poly([[-2, bar[0][1] + 3], [70, bar[2][1] + 2], [128, bar[3][1] + 4], [60, bar[3][1] + 12], [-2, bar[2][1] + 14]]) + '"/>' +
        '<path class="w-foam" d="' + line(bar) + '"/>' + stones;
    }
    // a big tree on your own bank, its trunk framing the right edge
    if (rv.trunk) {
      var tx = 368, tr2 = rnd(sd + 63), tk = poly([[tx - 14, 334], [tx - 9, 250], [tx - 8, 170], [tx - 10, 90], [tx - 7, -4], [tx + 7, -4], [tx + 8, 96], [tx + 10, 176], [tx + 14, 252], [tx + 22, 334]]), limbs = "", twig = "";
      [[176, 52, -0.55], [132, 66, -0.75], [88, 74, -0.95], [46, 62, -1.2], [118, 34, 0.35]].forEach(function (lb) {
        var ly = lb[0], len = lb[1], dx = lb[2] < 0 ? -1 : 1, ex = tx + dx * len, ey = ly - len * Math.abs(lb[2]) * 0.9, w0 = 2.6 + len * 0.03;
        var c1x = tx + dx * len * 0.45, c1y = ly - len * 0.05;
        limbs += "M" + n(tx) + " " + n(ly + w0) + "Q" + n(c1x) + " " + n(c1y + w0 * 0.6) + " " + n(ex) + " " + n(ey) + "Q" + n(c1x) + " " + n(c1y - w0 * 0.6) + " " + n(tx) + " " + n(ly - w0) + "Z";
        for (var t2 = 0; t2 < 3; t2++) {
          var tf = 0.45 + t2 * 0.2, sx2 = tx + (ex - tx) * tf, sy2 = ly + (ey - ly) * tf - len * 0.08 * tf, sl = len * (0.3 - t2 * 0.05);
          limbs += poly([[sx2 - 0.7, sy2], [sx2 + dx * sl * 0.4, sy2 - sl * 0.9], [sx2 + 0.7, sy2]]);
          if (isBare) limbs += poly([[sx2 + dx * sl * 0.2 - 0.4, sy2 - sl * 0.45], [sx2 + dx * sl * 0.75, sy2 - sl * 0.7], [sx2 + dx * sl * 0.2 + 0.4, sy2 - sl * 0.45]]);
        }
      });
      if (!isBare) { var bl = broadleaf(tr2, tx - 40, 130, 140, { wide: 0.52 }); twig = bl.crown; }
      front += (twig ? '<path class="w-l5' + (isBare ? ' w-twig' : "") + '" d="' + twig + '"/>' : "") + '<path class="w-l5" d="' + tk + limbs + '"/>' +
        '<path class="w-liteb" d="M' + (tx - 9) + " 250L" + (tx - 8) + " 170L" + (tx - 10) + " 90L" + (tx - 7) + ' -4"/>';
    }
    if (!rv.bar && !rv.rods) front += shoreEdge([[-2, 304], [60, 301], [130, 303], [200, 307], [270, 308], [330, 306], [392, 309]]);
    var fog = t.fog > 0 ? '<rect class="w-fog" width="' + W + '" height="' + H + '"/>' : "";
    return { back: back, gl: [sd + 600, RY + 14, H, 0.7 + lvl * 0.6], mid: defs(id + "m", mdef) + fog + mid, front: defs(id + "f") + front };
  }

  // ---- the ocean beach at a spot (added to surf) -------------------------------------
  // o.jetty { side, tip }: a rock jetty running out low along the horizon,
  // its tip at that bearing (tip) or at x (tipX). o.stack: a sea stack, its
  // x on the picture, far up the beach. Both wet as high as the tide leaves.
  function oceanParts(o, tide, sd) {
    var s = "", V = lens(o);
    if (o.jetty) {
      var j = o.jetty, left = j.side === "left", tx = j.tipX != null ? j.tipX : V.x(j.tip), pts = left ?
        [[-20, HZ + 16, 9], [tx * 0.45, HZ + 6, 4.2], [tx, HZ + 1.4, 1.6]] : [[W + 20, HZ + 16, 9], [(W + tx) / 2 + 12, HZ + 6, 4.2], [tx, HZ + 1.4, 1.6]];
      s += rocks(sd + 51, pts, { tall: 1, wet: (1 - tide) * 2.4, cls: "w-farrock" });
    }
    if (o.stack != null) {
      var x = o.stack, r = rnd(sd + 53), pp = [[x - 5.5, HZ + 1.2]], k;
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
  // people are doing (o.activity), then how they fish (o.how), then the kind
  // of picture the page asks for, then the card's own default stand.
  function standOf(kind, o) {
    if (!o || !o.stands) return o;
    var by = o.standBy || {}, name = (by.activity && by.activity[o.activity]) || (by.how && by.how[o.how]) || (by.kind && by.kind[kind]) || o.stand;
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
  function lightUp(el, o) {
    var st = el.style, ds = el.dataset;
    ["--setx", "--risex", "--moon", "--fog", "--rain"].forEach(function (k) { st.removeProperty(k); });
    ["set", "rise", "noon", "moon", "fog"].forEach(function (k) { delete ds[k]; });
    if (!o || !o.spot) return;
    var t = today(o);
    if (o.facing != null) {
      var L = lightOf(o.facing, t.date);
      st.setProperty("--setx", L.set.x + "px"); st.setProperty("--risex", L.rise.x + "px");
      ds.set = L.set.side; ds.rise = L.rise.side; ds.noon = L.noon.side;
    } else ds.set = ds.rise = "none";
    ds.moon = ""; st.setProperty("--moon", String(n(t.moon)));
    if (t.fog > 0) { ds.fog = ""; st.setProperty("--fog", String(n(t.fog))); }
    if (t.rain > 0) st.setProperty("--rain", String(n(t.rain)));
  }
  // A tile-sized painting of a spot: the spot's own scene, flattened into
  // one picture without its glints (the shimmer is the big scene's), framed
  // on the waterline.
  function viewSpot(kind, o) {
    var b = o.scene || kind, id = "vs" + (view.n = (view.n || 0) + 1), html;
    TILE = true;
    try { html = (BUILD[b] || BUILD.sound)(id, o); } finally { TILE = false; }
    html = html.replace(/<svg class="sc sc-gl[\s\S]*?<\/svg>/g, "").replace(/<svg[^>]*>/g, "").replace(/<\/svg>/g, "");
    var t = today(o), L = o.facing != null ? lightOf(o.facing, t.date) : null;
    return '<svg class="view vspot" viewBox="0 64 390 234" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-scene="' + b + '"' +
      (L ? ' data-set="' + L.set.side + '" data-rise="' + L.rise.side + '" style="--setx:' + L.set.x + "px;--risex:" + L.rise.x + 'px"' : ' data-set="none"') + ">" + html + "</svg>";
  }
  var TILE = false;

  // The row's thumbnail for a spot: its own few facts, small, in one hour's
  // palette (as mini() is), so a row looks like its spot. 48 by 48.
  function miniSpot(kind, p, o) {
    var dark = p.dark, lum = dark ? p.ink : p.paper, gid = "mn" + (mini.n = (mini.n || 0) + 1), b = o.scene || kind, sd = idSeed(o.spot), r = rnd(sd + 7);
    var t = today(o), V = lens(o), fov = o.fov || FOV, sky = o.skyline || [];
    var hz = dark ? mixHex(p.sky[1], p.ink2, 0.3) : p.sky[1];
    var f0 = mixHex(hz, p.shore, 0.16), f1 = mixHex(hz, p.shore, 0.3), f2 = mixHex(hz, p.shore, 0.55), f3 = p.shore, sand = mixHex(p.ground, p.ink, dark ? 0.1 : 0.16);
    var lampOn = dark || p.name === "Dawn", gold = p.gold, HZm = b === "river" ? 27 : 25;
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
    function trees(x0, x1, base, hh, fill, round) {
      var d = "M" + n(x0) + " " + n(base), x = x0;
      while (x < x1) { var h = hh * (0.5 + r() * 0.7); if (round) d += "L" + n(x) + " " + n(base - h * 0.7) + "Q" + n(x + 1.2) + " " + n(base - h * 1.1) + " " + n(x + 2.4) + " " + n(base - h * 0.75); else d += "L" + n(x) + " " + n(base - h) + "L" + n(x + 0.9 + r()) + " " + n(base - h * (0.45 + r() * 0.3)); x += round ? 2.6 + r() * 1.6 : 1.5 + r() * 1.8; }
      return '<path d="' + d + "L" + n(x1) + " " + n(base) + 'Z" fill="' + fill + '"/>';
    }
    // mountains a card shows, then the land across
    sky.forEach(function (q) {
      if (q.t === "rainier") { var mx0 = X(q.at), w = 15 * (q.size || 0.8); s += '<path d="M' + n(mx0 - w) + " " + HZm + "Q" + n(mx0 - w * 0.3) + " " + n(HZm - w * 0.5) + " " + n(mx0 - w * 0.1) + " " + n(HZm - w * 0.62) + "Q" + n(mx0 + 0.4) + " " + n(HZm - w * 0.68) + " " + n(mx0 + w * 0.25) + " " + n(HZm - w * 0.58) + "Q" + n(mx0 + w * 0.5) + " " + n(HZm - w * 0.35) + " " + n(mx0 + w) + " " + HZm + 'Z" fill="' + mixHex(hz, p.paper, dark ? 0.05 : 0.5) + '" opacity="' + (dark ? 0.35 : 0.85) + '"/>'; }
      if (q.t === "olympics") { var a = X(q.from), c = X(q.to), d = "M" + n(a) + " " + HZm, xx = a; while (xx < c) { d += "L" + n(xx + 0.8) + " " + n(HZm - 2.4 - r() * 2.6) + "L" + n(xx + 1.7) + " " + n(HZm - 1.4 - r()); xx += 1.8; } s += '<path d="' + d + "L" + n(c) + " " + HZm + 'Z" fill="' + mixHex(hz, p.paper, dark ? 0.05 : 0.55) + '" opacity="' + (dark ? 0.3 : 0.9) + '"/>'; }
    });
    var lands = sky.filter(function (q) { return q.t === "island" || q.t === "shore"; }).sort(function (a, c) { return (c.mi || 5) - (a.mi || 5); });
    lands.forEach(function (q) {
      var a = X(q.from), c = X(q.to), hh = clamp((q.h != null ? q.h : 14 / (q.mi || 5)) * 0.16, 0.8, 4.5), m = (a + c) / 2, base = HZm + clamp(0.5 / (q.mi || 5), 0, 1.2);
      s += '<path d="M' + n(a - 1) + " " + n(base) + "Q" + n(a + (m - a) * 0.4) + " " + n(base - hh) + " " + n(m) + " " + n(base - hh * 1.05) + "Q" + n(c - (c - m) * 0.4) + " " + n(base - hh) + " " + n(c + 1) + " " + n(base) + 'Z" fill="' + mcol(q.mi || 5) + '"/>';
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
        if (q.houses) for (var hi = 0; hi < Math.min(4, q.houses); hi++) { var hx = a + ((hi + 0.5) / Math.min(4, q.houses)) * (c - a); s += '<rect x="' + n(hx - 1.2) + '" y="' + (HZm - 1.6) + '" width="2.4" height="1.6" fill="' + (lampOn ? gold : mixHex(hz, p.paper, 0.5)) + '" opacity="' + (lampOn ? 0.9 : 0.8) + '"/>'; }
      });
      (lk.islands || []).forEach(function (q) { var a = X(q.from), c = X(q.to), hh = clamp(26 * 3.4 / q.m * 10, 1.2, 14); s += trees(Math.min(a, c), Math.max(a, c), HZm + 0.6, hh, q.m < 300 ? f3 : f1, true); });
      s += gl(28, HZm + 5, 9, 0.5) + gl(10, HZm + 8, 8, 0.4) + gl(20, HZm + 12, 12, 0.35);
      if (lk.drawdown) s += '<path d="M0 40Q8 38 14 48H0Z" fill="' + sand + '"/><path d="M48 39Q38 38 35 48H48Z" fill="' + sand + '"/><path d="M4 41v-3M8 43v-2.6M42 41v-3.2" stroke="' + f3 + '" stroke-width="1.2"/>';
      if (lk.wetland) s += '<path d="M48 31Q38 32 34 36L48 38Z" fill="' + mixHex(f3, hz, 0.2) + '"/>';
      if (lk.stand === "dock" || lk.stand === "pier") s += '<path d="M14 48L19 37H29L34 48Z" fill="' + mixHex(f3, hz, 0.3) + '"/><path d="M19 37H29" stroke="' + lum + '" stroke-width=".5" opacity=".6"/>';
      if (lk.stand === "ramp" || lk.stand === "gravel") s += '<path d="M12 48L20 38H28L36 48Z" fill="' + (lk.stand === "ramp" ? mixHex(p.ground, p.paper, 0.4) : sand) + '" opacity=".9"/>';
    } else if (b === "river") {
      var rv = o.river || {}, fk = (rv.far || {}).kind, winter = bare(t.date);
      s += '<rect y="' + HZm + '" width="48" height="' + (48 - HZm) + '" fill="url(#' + gid + 'w)"/>';
      if (rv.valley) s += '<path d="M-1 ' + HZm + 'L-1 8Q10 10 24 22Q34 6 49 4V' + HZm + 'Z" fill="' + f0 + '"/>';
      s += trees(-1, 49, HZm, fk === "plain" ? 2 : fk === "cottonwood" ? 12 : 15, fk === "cottonwood" && winter ? mixHex(hz, p.shore, 0.38) : fk === "plain" ? f1 : f2, fk !== "plain");
      for (var ri = 0; ri < 5; ri++) s += gl(4 + r() * 36, HZm + 3 + ri * 3.6, 4 + ri * 1.5, 0.5 - ri * 0.05);
      if (rv.creek) s += '<path d="M2 48L12 34L17 34L14 48Z" fill="' + mixHex(p.water[0], lum, 0.4) + '" opacity=".8"/>';
      if (rv.bar) s += '<path d="M0 36Q14 37 24 42T34 48H0Z" fill="' + sand + '"/>';
      if (rv.steps) s += '<path d="M26 48V44H33V41H39V38H48V48Z" fill="' + mixHex(p.ground, p.paper, 0.35) + '"/>';
      if (rv.rods) s += '<path d="M0 32L12 36L18 48H0Z" fill="' + sand + '"/><path d="M3 33l4-5M8 35l5-6M13 39l6-7" stroke="' + f3 + '" stroke-width=".5"/>';
      if (rv.weir) s += '<path d="M0 35H16V37H0Z" fill="' + mixHex(p.ground, p.paper, 0.35) + '"/><path d="M0 37H17L15 39H0Z" fill="' + lum + '" opacity=".7"/>';
      if (rv.trunk) s += '<path d="M43 48L44 0H47L49 48Z" fill="' + f3 + '"/><path d="M44 12L34 2M44 20L36 14" stroke="' + f3 + '" stroke-width=".9"/>';
    } else {
      // the ocean: the stock beach painting, with this beach's jetty or stack
      var base = mini("surf", p, { activity: o.activity }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      s = base;
      if (o.jetty) s += o.jetty.side === "left" ? '<path d="M-1 28L6 24.6L9 25.4L-1 30Z" fill="' + f2 + '"/>' : '<path d="M49 28L40 24.6L37 25.4L49 30Z" fill="' + f2 + '"/>';
      if (o.stack != null) s += '<path d="M43 25L43.6 21.6L46 21.2L46.8 25Z" fill="' + f2 + '"/>';
    }
    return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + s + "</svg>";
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
      var dig = o.activity === "clams" || (!o.activity && dark);
      s += '<rect y="20" width="48" height="28" fill="url(#' + gid + 'w)"/>';
      [[22.6, 0.9, 0.5], [25.8, 1.5, 0.62], [30, 2.4, 0.8]].forEach(function (b) {
        var d = "", x = -2;
        while (x < 48) { var len = 5 + r() * 11, y = b[0] + (r() - 0.5) * 0.8; d += "M" + n(x) + " " + n(y) + "q" + n(len / 3) + " " + n(-b[1] * (0.8 + r() * 0.5)) + " " + n(len * 0.66) + " " + n(-b[1] * 0.3) + "l" + n(len * 0.34) + " " + n(b[1] * 0.3) + "q" + n(-len / 2) + " " + n(b[1] * 0.5) + " " + n(-len) + " 0Z"; x += len + 1 + r() * 3; }
        s += '<path d="' + d + '" fill="' + lum + '" opacity="' + b[2] + '"/>';
      });
      s += '<path d="M0 34Q16 32 30 35T48 35.6V48H0Z" fill="' + mx(p.ground, p.water[0], dark ? 0.24 : 0.36) + '"/>';
      s += '<path d="M0 40.5Q18 38 32 41T48 43V48H0Z" fill="' + mx(p.ground, p.ink, dark ? 0.06 : 0.12) + '"/>';
      s += gl(4, 36.5, 8, 0.5) + gl(14, 37.6, 11, 0.4) + gl(30, 37, 7, 0.45);
      if (dig) {
        if (dark || lampOn) s += '<circle cx="15" cy="39" r="11" fill="url(#' + gid + 'g)"/><circle cx="15" cy="39.4" r="1.1" fill="' + p.accent2 + '"/>';
        s += '<path d="M21.8 40.4l1-4.6 1.6 0 .9 4.6h-1l-.7-3-.8 3z" fill="' + f3 + '"/><path d="M22.6 36.2l4.4-3.4 1.4 1.2-4.2 3.4z" fill="' + f3 + '"/><circle cx="28.6" cy="32.6" r="1.2" fill="' + f3 + '"/>' +
          '<path d="M30.6 41V34.4M29.2 34.4h2.8" stroke="' + f3 + '" stroke-width=".9" stroke-linecap="round"/>';
      } else {
        s += '<path d="M25.2 39.6l.9-5 1.8 0 .9 5h-1l-.8-3.2-.8 3.2z" fill="' + f3 + '"/><path d="M25.8 34.8l.1-4.6 2.2-.4.4 5z" fill="' + f3 + '"/><circle cx="27.2" cy="28.4" r="1.1" fill="' + f3 + '"/>' +
          '<path d="M26.4 34Q30 19 38 21.8" fill="none" stroke="' + f3 + '" stroke-width=".7" stroke-linecap="round"/><path d="M38 21.8Q43 24 47 27.6" fill="none" stroke="' + lum + '" stroke-width=".35" opacity=".7"/>';
        if (dark) s += '<circle cx="27.2" cy="28.2" r="5" fill="url(#' + gid + 'g)"/>';
      }
      var blades = "";
      for (i = 0; i < 8; i++) { var bx = 36 + i * 1.7 + r(), bh = 6 + r() * 7; blades += "M" + n(bx - 0.5) + " 48L" + n(bx + (r() - 0.3) * 3) + " " + n(48 - bh) + "L" + n(bx + 0.5) + " 48Z"; }
      s += '<path d="M33 48Q40 41 49 40V48Z" fill="' + f3 + '"/><path d="' + blades + '" fill="' + f3 + '"/>';
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
    var id = "vw" + (view.n = (view.n || 0) + 1), base = kind === "fly" ? "sound" : kind.replace(/^kayak-/, "");
    var r = rnd(kind.length * 17 + 5), s = "", k, x, wl = VZ;
    var lamps = "", glows = "";
    function ridge(seed, y, h, cls) { return '<path class="' + cls + '" d="' + headland({ seed: seed, from: -20, to: 260, base: y, h: h, tree: 1.1, gap: 1.6, shape: 9, freq: 0.022, tipFade: 60 }).land + '"/>'; }
    function water(y) { wl = y; return '<rect y="' + y + '" width="' + VW + '" height="' + (VH - y) + '" fill="url(#' + id + '-w)"/><rect y="' + y + '" width="' + VW + '" height="16" fill="url(#' + id + '-h)"/>'; }
    if (base === "river") {
      var bank = headland({ seed: 71, from: -20, to: 240, base: 66, h: 3, tree: 17, trees: true, shape: 12, tipFade: 60, tfreq: 0.05 });
      var near = headland({ seed: 83, from: 222, to: 128, base: function (xx) { return 68 + Math.pow(Math.max(0, xx - 128) / 72, 1.3) * 30; }, h: 6, tree: 30, trees: true, shape: 2.6, tfreq: 0.06, tipFade: 5,
        grow: function (xx) { return 0.5 + Math.max(0, xx - 128) / 60; } });
      s += ridge(72, 62, 24, "w-l0") + ridge(73, 65, 13, "w-l1") + water(64) + vGlass(bank, 0.6, "w-l3") + vLand(bank, "w-l3") +
        '<path class="w-beach" d="M-2 66.3H130"/>' + litWindow(id, rnd(75), 58, 61, 66) + vGlints(74, 72, VH, 0.9) + vLand(near, "w-l5");
      var bar = [[-2, 84], [22, 85], [48, 89], [74, 96], [96, 106], [110, 122]], st = "";
      for (k = 0; k < 44; k++) { var u = r(), sx = u * 104, sy = 86 + Math.pow(sx / 110, 1.7) * 34 + r() * r() * 22; st += '<ellipse class="' + (r() < 0.3 ? "w-st-l" : "w-st-d") + '" cx="' + n(sx) + '" cy="' + n(sy) + '" rx="' + n(0.5 + r() * 1.3) + '" ry="' + n(0.3 + r() * 0.5) + '"/>'; }
      s += '<path class="w-shorewet" d="' + line(bar.map(function (q) { return [q[0] + 3, q[1] - 3]; })) + 'L-2 122Z"/><path class="w-shore" d="' + line(bar) + 'L-2 122Z"/><path class="w-foam" d="' + line(bar) + '"/>' + st +
        '<g class="w-log"><path class="w-pile" d="' + poly([[14, 90.4], [46, 93.6], [70, 97], [71.4, 100], [46, 97.6], [14, 93.6]]) + '"/><path class="w-pile" d="' + poly([[40, 93], [36.6, 86.4], [38.4, 86], [43, 93.2]]) + '"/><path class="w-liteb" d="M15 90.8L46 94L69 97.3"/></g>';
    } else if (base === "lake") {
      var shore = headland({ seed: 61, from: -20, to: 240, base: 62, h: 3, tree: 16, trees: true, shape: 12, tipFade: 60, tfreq: 0.045 });
      var pt = headland({ seed: 65, from: -8, to: 74, base: 67, h: 4, tree: 24, trees: true, shape: 2.3, tfreq: 0.07 });
      s += ridge(62, 60, 18, "w-l0") + water(60) + vGlass(shore, 0.9, "w-l3") + vLand(shore, "w-l3") + '<path class="w-beach" d="M-2 62.3H202"/>' +
        vGlass(pt, 0.84, "w-l5") + vLand(pt, "w-l5") + vGlints(63, 70, VH, 0.4);
      if (kind === "lake" && o.dock !== false) {
        // the dock, from the right
        var dk = poly([[206, 92], [206, 86], [118, 74.6], [112, 77]]), posts = "";
        [[196, 1], [168, 0.8], [144, 0.64], [124, 0.5]].forEach(function (q) { var py = 77 + (q[0] - 112) * 0.16; posts += pile(r, q[0], py - 9 * q[1], py + 7 * q[1], 2.6 * q[1] + 0.6); });
        s += '<path class="w-under" d="' + poly([[206, 94], [112, 78], [110, 84], [206, 106]]) + '"/><path class="w-decktop" d="' + dk + '"/><path class="w-pile" d="' + poly([[206, 92], [112, 77], [112, 79], [206, 95.6]]) + '"/>' + posts;
        lamps += '<path class="w-pole" d="M116 76V62.6Q116 61 114 61" stroke-width=".9"/><ellipse class="w-bulb" cx="113.6" cy="62" rx="1.6" ry=".8"/>';
        glows += '<circle cx="114" cy="62.4" r="20" fill="url(#' + id + '-lamp)"/><g class="w-poolg">' + [0, 1, 2, 3, 4, 5].map(function (j) { return '<rect x="' + n(104 - j * 0.6 + (r() - 0.5) * 4) + '" y="' + n(82 + j * 3.4) + '" width="' + n(6 + j * 2.2) + '" height="1" rx=".5" opacity="' + n(0.8 - j * 0.11) + '"/>'; }).join("") + "</g>";
      } else s += litWindow(id, rnd(66), 150, 58.6, 62) + (kind === "lake" ? "" : vKayak(118, 86, 1.25, true));
      var reeds = "";
      for (k = 0; k < 26; k++) { var bx = -4 + Math.pow(r(), 1.4) * 60, by = 112 + r() * 10, bh = (14 + r() * 24) * (1 - bx / 130), ln = (r() - 0.35) * 9; reeds += "M" + n(bx - 0.7) + " " + n(by) + "Q" + n(bx + ln * 0.2) + " " + n(by - bh * 0.55) + " " + n(bx + ln) + " " + n(by - bh) + "Q" + n(bx + ln * 0.3 + 0.6) + " " + n(by - bh * 0.5) + " " + n(bx + 0.8) + " " + n(by) + "Z"; }
      s += '<path class="w-reed" d="' + reeds + '"/>';
    } else if (base === "pier") {
      var A = headland({ seed: 41, from: -20, to: 150, base: 61, h: 6, tree: 2, gap: 1.5, shape: 2.4, freq: 0.03 });
      s += ridge(42, 60, 8, "w-far") + water(60) + vGlass(A, 0.5, "w-l1") + vLand(A, "w-l1") + '<g class="w-lights">' + shoreLights(43, A, 9, 4, 10, 140) + "</g>" + vGlints(44, 66, VH, 0.9);
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
      var lip = [], nzl = noise(88);
      for (x = -4; x <= VW + 4; x += 8) lip.push([x, 94 + (nzl(x * 0.04) - 0.5) * 6]);
      s += vGlints(84, 62, 70, 1) + '<path class="w-surfsh" d="' + shade + '" stroke-width="1.6"/><path class="w-surf" d="' + foam + '"/>' +
        '<path class="w-wash" d="' + line(lip) + "L" + (VW + 4) + ' 86L-4 86Z"/><path class="w-wetsand" d="' + line(lip) + "L" + (VW + 4) + ' 110L-4 108Z"/>' +
        '<path class="w-shore" d="M-4 108Q60 103 120 107T204 106V124H-4Z"/><path class="w-foam" d="' + line(lip) + '"/>' +
        '<g class="w-log"><path class="w-pile" d="' + poly([[-4, 104], [30, 102], [52, 101.6], [55, 103.6], [52, 106.4], [30, 108], [-4, 111]]) + '"/><path class="w-pile" d="' + poly([[30, 102.4], [27, 96.6], [28.6, 96.2], [33, 102.2]]) + '"/><path class="w-liteb" d="M-3 104.4L30 102.4L51 102"/></g>' +
        '<g class="w-dayonly"><path class="w-fig" d="M128 97V88" stroke-width="2.4"/><circle class="w-figh" cx="128.2" cy="85.6" r="1.6"/><path class="w-rod" d="M127 92Q136 82 146 74" stroke-width=".6"/><path class="w-line" d="M146 74Q160 80 172 80"/></g>';
      glows += '<path class="w-fig" d="M140 104L141.4 98L143 104M141.4 98L145.6 95" stroke-width="2.2"/><circle class="w-figh" cx="147" cy="93.2" r="1.6"/><path class="w-rod" d="M149.6 105V96.6M147.6 96.6h4" stroke-width="1.5"/>' +
        '<circle cx="132" cy="101.4" r="19" fill="url(#' + id + '-lamp)"/><ellipse class="w-lantern" cx="132" cy="102" rx="1.1" ry="1.6"/><ellipse class="w-pool" cx="132" cy="105" rx="18" ry="4.4" fill="url(#' + id + '-lamp)"/>' +
        '<g class="w-farlamps v-farlamps"><circle cx="34" cy="96" r=".9"/><circle cx="72" cy="95" r=".7"/><circle cx="96" cy="97" r="1"/><circle cx="170" cy="96" r=".9"/><circle cx="190" cy="95.4" r=".6"/></g>';
    } else {
      // the Sound: two points of land, the mountain, and a shingle beach
      var a2 = headland({ seed: 51, from: -20, to: 124, base: 61, h: 7, tree: 2, gap: 1.5, shape: 2.4, freq: 0.03 });
      var b2 = headland({ seed: 53, from: 214, to: 96, base: 66, h: 7, tree: 19, trees: true, shape: 2.4, tfreq: 0.06 });
      s += '<g class="v-mtn">' + mountain(34, 33, 0.38) + '</g><rect y="42" width="' + VW + '" height="20" fill="url(#' + id + '-m)"/>' + ridge(52, 60, 9, "w-far") + water(60) +
        vGlass(a2, 0.5, "w-l1") + vLand(a2, "w-l1") + '<g class="w-lights">' + shoreLights(55, a2, 10, 4, 6, 116) + "</g>" +
        vGlass(b2, 0.5, "w-l5") + vLand(b2, "w-l5") + '<path class="w-beach" d="M112 66.3H202"/>' + vGlints(54, 68, VH, 0.9);
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
      s + lamps + (glows ? '<g class="w-lampson' + (base === "surf" ? " w-dig" : "") + '">' + glows + "</g>" : "") + "</svg>";
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
    scenes: Object.keys(BUILD)
  };
})(typeof window !== "undefined" ? window : globalThis);
