// The plates: five Washington animals and one piece of tackle.
//
// Each one is described by its real proportions (depth to length, where the
// fins sit, how far the jaw runs past the eye) and the marks an angler uses
// to tell it apart: the chum's bars, the cutthroat's slash and spotted tail,
// the rainbow's band, the squid's speckled mantle, the razor clam's rings.
(function (root) {
  "use strict";
  var G = root.GUIDE, T = G.tools, n = T.n, cr = T.cr, lerp = T.lerp, dot = T.dot;
  var S = (G.species = {});

  // ---- chum salmon, a river male in November -----------------------------
  S.chum = {
    box: "0 0 440 190", name: "Chum salmon", latin: "Oncorhynchus keta",
    draw: function () {
      return T.salmonid({
        id: "chum", kind: "chum", seed: 11, gill: 98, eye: [54, 88, 5], depth: 94, scale: 4.8, lateral: 0.46,
        top: [[13, 101], [17, 93], [27, 86], [42, 79], [62, 71], [92, 61], [130, 52], [172, 47], [214, 47], [256, 51], [298, 60], [336, 71], [362, 79], [380, 83]],
        bot: [[13, 101], [18, 106], [30, 110], [46, 114], [72, 120], [108, 130], [152, 139], [198, 141], [244, 137], [282, 128], [322, 116], [350, 108], [380, 105]],
        tail: { a: [373, 82], b: [373, 106], edge: [[400, 66], [431, 46], [416, 72], [404, 94], [416, 116], [431, 142], [400, 122]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [188, 48], b: [244, 51], edge: [[198, 28], [211, 13], [234, 21], [254, 33]], r0: 2, r1: 4, rays: 13 },
        adipose: { a: [322, 67], b: [336, 72], edge: [[331, 59], [341, 58], [343, 66]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [274, 130], b: [325, 116], edge: [[279, 149], [287, 165], [309, 149], [329, 135]], r0: 2, r1: 4, rays: 14, bend: -0.05 },
        pelvic: { a: [214, 140.5], b: [231, 139], edge: [[226, 156], [248, 169], [244, 152]], r0: 2, r1: 3, rays: 9, bend: -0.04 },
        pectoral: { a: [101, 122], b: [103, 133], edge: [[123, 130], [148, 146], [142, 154], [119, 144]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          anal: function () { return '<ellipse class="fin-tip" cx="285" cy="159" rx="8" ry="10" filter="url(#gb3)"/>'; },
          pelvic: function () { return '<ellipse class="fin-tip" cx="245" cy="164" rx="7" ry="8" filter="url(#gb3)"/>'; },
          tail: function () { return '<path class="fin-dusk" filter="url(#gb3)" d="M402 58L434 42L418 72L407 94L418 116L434 146L402 128L412 94Z"/>'; }
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
          return '<g filter="url(#gb1)">' + out + "</g>";
        },
        headPaint: function () { return '<ellipse class="cheek" cx="78" cy="100" rx="14" ry="11" filter="url(#gb3)"/><ellipse class="sheen" cx="84" cy="92" rx="8" ry="6" filter="url(#gb3)"/>'; },
        // The long hooked jaw of a river male, with a pale lip.
        mouth: '<path class="lip" d="M14 102.5C24 106 38 107.5 52 108.5"/>' +
          '<path class="ink mouth" d="M14 102.5C27 106 44 107 58 109S70 112 75 116"/>' +
          '<path class="ink thin" d="M36 103C50 103 64 106 74 113"/>' +
          '<circle class="nostril" cx="31" cy="90" r=".9"/>'
      });
    }
  };

  // ---- rainbow trout, a stocked lake fish --------------------------------
  S.rainbow = {
    box: "0 0 440 190", name: "Rainbow trout", latin: "Oncorhynchus mykiss",
    draw: function () {
      return T.salmonid({
        id: "rbow", kind: "rainbow", seed: 23, gill: 96, eye: [54, 88, 6], depth: 87, scale: 3.9, lateral: 0.47,
        top: [[21, 98], [24, 90], [33, 84], [50, 76], [76, 67], [112, 58], [156, 52], [200, 51], [246, 55], [290, 63], [330, 73], [360, 80], [380, 82]],
        bot: [[21, 98], [24, 104], [33, 109], [50, 113], [78, 121], [114, 130], [158, 137], [204, 138], [250, 134], [286, 126], [324, 115], [352, 109], [380, 107]],
        tail: { a: [373, 81], b: [373, 108], edge: [[400, 68], [427, 55], [418, 76], [412, 95], [418, 113], [427, 134], [400, 121]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [190, 52], b: [242, 55], edge: [[199, 34], [211, 22], [234, 28], [250, 38]], r0: 2, r1: 4, rays: 12 },
        adipose: { a: [318, 70], b: [332, 75], edge: [[327, 63], [337, 63], [338, 70]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [280, 127], b: [322, 116], edge: [[284, 145], [291, 157], [310, 145], [326, 133]], r0: 2, r1: 4, rays: 12, bend: -0.05 },
        pelvic: { a: [216, 137.5], b: [232, 136.5], edge: [[227, 152], [246, 163], [243, 149]], r0: 2, r1: 3, rays: 8, bend: -0.04 },
        pectoral: { a: [99, 121], b: [101, 131], edge: [[121, 129], [144, 145], [138, 152], [117, 142]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          tail: function (c, f) { return '<path class="spot" d="' + T.raySpots(f, c.rand, 7, 0.82, 0.08, 0.95) + '"/>'; },
          dorsal: function (c, f) { return '<path class="spot" d="' + T.raySpots(f, c.rand, 5, 0.8, 0.1, 0.9) + '"/>'; },
          adipose: function () { return '<path class="spot" d="' + dot(329, 65, 1, 0.8, 0) + dot(334, 68, 0.9, 0.8, 0) + '"/>'; },
          anal: function () { return '<path class="fin-lead" d="M281 129L285 145L291 156"/>'; },
          pelvic: function () { return '<path class="fin-lead" d="M217 139L228 152L245 162"/>'; }
        },
        // The band the fish is named for, soft at both edges, then the pepper of spots.
        under: function (c) {
          var pts = [];
          for (var x = 82; x <= 376; x += 24) pts.push([x, c.at(x, 0.5)]);
          var d = cr(pts, false);
          return '<path class="band wide" d="' + d + '" filter="url(#gb6)"/><path class="band" d="' + d + '" filter="url(#gb3)"/>';
        },
        marks: function (c) {
          var d = T.spots(c, 300, function (x, v) { return v < 0.5 ? 1 - v * 1.2 : v < 0.62 ? 0.1 : 0; },
            function (r) { return 0.45 + r() * 0.55; }, 94, 374);
          return '<path class="spot" d="' + d + '"/>';
        },
        headPaint: function (c) {
          return '<ellipse class="cheek" cx="80" cy="95" rx="13" ry="11" filter="url(#gb3)"/><ellipse class="sheen" cx="84" cy="88" rx="7" ry="5" filter="url(#gb3)"/>' +
            '<path class="spot" d="' + T.spots(c, 16, function (x, v) { return v < 0.3 ? 1 : 0; }, function (r) { return 0.45 + r() * 0.4; }, 40, 90) + '"/>';
        },
        mouth: '<path class="ink mouth" d="M23 101C34 103 46 104 60 107"/><path class="ink thin" d="M38 101C48 101 55 103 61 106"/>' +
          '<circle class="nostril" cx="37" cy="88" r=".8"/>'
      });
    }
  };

  // ---- sea-run cutthroat --------------------------------------------------
  S.cutthroat = {
    box: "0 0 440 190", name: "Sea-run cutthroat", latin: "Oncorhynchus clarkii clarkii",
    draw: function () {
      return T.salmonid({
        id: "cutt", kind: "cutthroat", seed: 5, gill: 96, eye: [50, 91, 5.6], depth: 75, scale: 3.6, lateral: 0.46,
        top: [[13, 100], [17, 93], [28, 87], [48, 80], [78, 72], [116, 64], [160, 59], [204, 58], [250, 62], [294, 69], [332, 77], [362, 83], [380, 85]],
        bot: [[13, 100], [17, 105], [28, 109], [46, 113], [74, 120], [110, 127], [156, 132], [204, 133], [250, 130], [288, 123], [324, 114], [352, 109], [380, 107]],
        tail: { a: [373, 84], b: [373, 108], edge: [[400, 70], [429, 54], [417, 76], [408, 96], [417, 116], [429, 138], [400, 122]], r0: 2, r1: 6, rays: 21, bend: 0, bias: 1 },
        dorsal: { a: [194, 59], b: [244, 62], edge: [[202, 42], [213, 30], [236, 35], [252, 45]], r0: 2, r1: 4, rays: 12 },
        adipose: { a: [320, 74], b: [334, 79], edge: [[329, 67], [339, 67], [340, 74]], r0: 1, r1: 3, rays: 0 },
        anal: { a: [282, 124], b: [324, 114.5], edge: [[286, 141], [293, 153], [312, 142], [328, 131]], r0: 2, r1: 4, rays: 12, bend: -0.05 },
        pelvic: { a: [218, 133], b: [234, 132], edge: [[229, 147], [248, 158], [245, 145]], r0: 2, r1: 3, rays: 8, bend: -0.04 },
        pectoral: { a: [99, 119], b: [101, 128], edge: [[121, 127], [145, 142], [139, 149], [117, 139]], r0: 2, r1: 3, rays: 10, bend: -0.03 },
        finPaint: {
          tail: function (c, f) { return '<path class="spot" d="' + T.raySpots(f, c.rand, 9, 0.85, 0.05, 0.96) + '"/>'; },
          dorsal: function (c, f) { return '<path class="spot" d="' + T.raySpots(f, c.rand, 6, 0.85, 0.08, 0.92) + '"/>'; },
          adipose: function () { return '<path class="spot" d="' + dot(329, 68, 1, 0.8, 0) + dot(335, 71, 0.9, 0.8, 0) + dot(332, 75, 0.8, 0.7, 0) + '"/>'; },
          anal: function (c, f) { return '<path class="spot" d="' + T.raySpots(f, c.rand, 2, 0.7, 0.1, 0.6) + '"/>'; }
        },
        under: function (c) {
          var pts = [];
          for (var x = 92; x <= 374; x += 24) pts.push([x, c.at(x, 0.52)]);
          return '<path class="brass" d="' + cr(pts, false) + '" filter="url(#gb6)"/>';
        },
        // Spots everywhere, thickest toward the tail and well below the side line.
        marks: function (c) {
          var d = T.spots(c, 460, function (x, v) {
            if (v > 0.84 || v < 0.03) return 0;
            var tailward = 0.42 + 0.58 * ((x - 96) / 280);
            return (v < 0.5 ? 1 : 1.4 - v * 1.4) * tailward;
          }, function (r) { return 0.5 + r() * 0.75; }, 94, 376);
          return '<path class="spot" d="' + d + '"/>';
        },
        // The slash in the fold under the jaw that names the fish.
        headPaint: function (c) {
          return '<ellipse class="cheek" cx="80" cy="97" rx="12" ry="9" filter="url(#gb3)"/><ellipse class="sheen" cx="84" cy="91" rx="7" ry="5" filter="url(#gb3)"/>' +
            '<path class="spot" d="' + T.spots(c, 24, function (x, v) { return v < 0.34 ? 1 : 0; }, function (r) { return 0.45 + r() * 0.45; }, 32, 90) + '"/>' +
            '<path class="slash" d="M30 109C44 112.6 60 116 82 121.4" filter="url(#gb05)"/>';
        },
        mouth: '<path class="ink mouth" d="M15 102C30 105 50 106 72 112"/><path class="ink thin" d="M32 103C48 103 62 106 72 111"/>' +
          '<circle class="nostril" cx="33" cy="91" r=".8"/>'
      });
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
    var core = "M" + T.P(p0) + "C" + T.P(c1) + " " + T.P(c2) + " " + T.P(p3);
    return { d: cr(L.concat(R), true), core: core, mid: function (t) {
      var u = 1 - t;
      return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]];
    }, w: w };
  }
  S.squid = {
    box: "0 0 440 150", name: "Market squid", latin: "Doryteuthis opalescens",
    draw: function () {
      var r = T.rng(41), id = "sqd";
      var mantle = [[168, 54], [190, 50.5], [230, 50], [270, 53], [312, 58.5], [355, 65], [396, 71.5], [422, 75.5],
        [396, 79], [355, 85.5], [312, 92], [270, 97.5], [230, 100.5], [190, 100], [168, 96.5], [163, 86], [158, 75.5], [163, 65]];
      var mD = cr(mantle, true);
      var upper = T.crPts(mantle.slice(0, 8), false, 10), lower = T.crPts(mantle.slice(7, 15).reverse(), false, 10);
      function half(x) { return (T.yAt(lower, x) - T.yAt(upper, x)) / 2; }
      function mid(x) { return (T.yAt(lower, x) + T.yAt(upper, x)) / 2; }

      var fU = T.fin({ id: id + "-fu", cls: "sq-fin", a: [296, 60], b: [417, 74.5], edge: [[312, 41], [344, 26], [369, 32], [394, 53]], r0: 1, r1: 4, rays: 26, bend: 0.03, bias: 1 });
      var fL = T.fin({ id: id + "-fl", cls: "sq-fin", a: [299, 91], b: [417, 76.5], edge: [[316, 111], [350, 125], [373, 117], [396, 97]], r0: 1, r1: 4, rays: 26, bend: -0.03, bias: 1 });

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
        '<g class="sp sp-squid" filter="url(#grain)">' +
        tentD + '<path class="sq-suck" d="' + suck + '"/>' + armsD + '<path class="chroma small" d="' + armDots + '"/>' +
        fU.html + fL.html +
        '<path class="sq-head" d="' + hD + '"/>' +
        '<g clip-path="url(#' + id + '-hc)"><path class="sq-headshade" d="M120 93C140 97 158 96 170 91" filter="url(#gb3)"/>' +
          '<path class="chroma small" d="' + headSmall + '"/><path class="chroma big" d="' + headBig + '"/>' +
          '<path class="sq-lit" d="M131 70C142 67 156 67 166 69" filter="url(#gb3)"/></g>' +
        '<path class="ink" d="' + hD + '"/>' +
        eye(142, 59.5, -1) + eye(143, 91.5, 1) +
        '<path d="' + mD + '" fill="url(#' + id + '-m)"/>' +
        '<g clip-path="url(#' + id + '-c)">' +
          '<rect class="blot" x="150" y="40" width="280" height="70" filter="url(#blot)"/>' +
          '<ellipse class="q-rose" cx="236" cy="66" rx="52" ry="9" filter="url(#gb6)"/>' +
          '<ellipse class="q-teal" cx="318" cy="84" rx="50" ry="7" filter="url(#gb6)"/>' +
          '<ellipse class="q-teal" cx="196" cy="88" rx="30" ry="6" filter="url(#gb6)"/>' +
          '<path class="q-pen" d="M172 75.5C240 73.5 330 74.5 412 75.5C330 76.6 240 77.6 172 75.5Z"/>' +
          '<path class="chroma pale" d="' + pale + '"/><path class="chroma small" d="' + small + '"/><path class="chroma big" d="' + big + '"/>' +
          '<path class="sq-lit" d="M176 66C240 62 320 66 398 73" filter="url(#gb3)"/>' +
          '<path class="sh-rim" filter="url(#gb3)" d="' + cr(mantle.slice(7, 15), false) + '"/>' +
          '<path class="sh-rim top" filter="url(#gb3)" d="' + cr(mantle.slice(0, 8), false) + '"/>' +
          '<path class="sq-collar" d="M171 55C165 66 165 86 171 97" filter="url(#gb1)"/>' +
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
      var id = "clm", r = T.rng(77), U = [198, 47];
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
        '<g class="sp sp-clam" filter="url(#grain)">' +
        '<path d="' + cr(foot, true) + '" fill="url(#' + id + '-f)"/>' +
        '<g clip-path="url(#' + id + '-fc)"><path class="k-crease" d="' + creases + '"/>' +
          '<path class="sh-core" filter="url(#gb6)" d="M30 112C60 120 96 120 126 118"/><path class="sq-lit" d="M44 88C66 80 96 79 120 83" filter="url(#gb3)"/>' +
          '<path class="k-under" d="M126 74C116 90 116 104 128 120" filter="url(#gb3)"/></g>' +
        '<path class="ink" d="' + cr(foot, true) + '"/>' +
        '<path d="' + cr(neck, true) + '" fill="url(#' + id + '-n)"/>' +
        '<g clip-path="url(#' + id + '-nc)"><path class="k-crease dark" d="' + wr + '"/>' +
          '<path class="sh-core" filter="url(#gb6)" d="M338 110C366 110 392 106 414 98"/><path class="sq-lit" d="M344 80C366 77 388 79 404 83" filter="url(#gb3)"/>' +
          '<path class="k-under" d="M334 70C346 86 346 100 334 116" filter="url(#gb3)"/></g>' +
        '<path class="ink" d="' + cr(neck, true) + '"/><path class="ink thin" d="' + fringe + '"/>' +
        '<ellipse class="k-hole" cx="412.5" cy="85.5" rx="1.6" ry="2.6"/><ellipse class="k-hole" cx="411.5" cy="93.5" rx="1.5" ry="2.3"/>' +
        '<path d="' + sD + '" fill="url(#' + id + '-s)"/>' +
        '<g clip-path="url(#' + id + '-c)">' +
          '<rect class="blot" x="100" y="40" width="260" height="110" filter="url(#blot)"/>' +
          '<path class="k-band" d="' + bands + '" filter="url(#gb1)"/>' +
          '<path class="k-ray" d="M' + U[0] + " " + U[1] + 'L168 144" filter="url(#gb3)"/>' +
          '<path class="k-ring" d="' + fine + '"/><path class="k-ring bold" d="' + bold + '"/>' +
          '<path class="sh-core" filter="url(#gb6)" d="M112 122C160 146 300 150 348 118"/>' +
          '<path class="k-gloss" d="M146 78C196 64 270 62 326 72" filter="url(#gb4)"/>' +
          '<path class="k-glint" d="M170 68C204 61 246 59 284 62" filter="url(#gb05)"/>' +
          '<ellipse class="k-umbo" cx="' + U[0] + '" cy="' + (U[1] + 5) + '" rx="26" ry="9" filter="url(#gb4)"/>' +
          '<path class="sh-rim" filter="url(#gb3)" d="' + cr(shell.slice(6).concat([shell[0]]), false) + '"/>' +
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
      var id = "jig", r = T.rng(9);
      var top = [[30, 60], [46, 49], [78, 41], [120, 38], [166, 40], [206, 46], [234, 52]];
      var bot = [[30, 60], [48, 67], [84, 71], [124, 71], [166, 67], [206, 60], [234, 54]];
      var bD = cr(top.concat(bot.slice(1).reverse()), true);
      var topS = T.crPts(top, false, 10), botS = T.crPts(bot, false, 10);
      var bands = "", seg = "", weave = "";
      for (var x = 64; x < 232; x += 15) {
        var yt = T.yAt(topS, x), yb = T.yAt(botS, x);
        bands += "M" + n(x) + " " + n(yt - 1) + "L" + n(x + 8) + " " + n(yt - 1) + "L" + n(x + 1) + " " + n(lerp(yt, yb, 0.62)) + "L" + n(x - 6) + " " + n(lerp(yt, yb, 0.62)) + "Z";
        seg += "M" + n(x - 3) + " " + n(yt) + "Q" + n(x + 1) + " " + n((yt + yb) / 2) + " " + n(x - 4) + " " + n(yb);
      }
      for (x = 44; x < 234; x += 2.6) weave += "M" + n(x) + " " + n(T.yAt(topS, x)) + "L" + n(x - 5) + " " + n(T.yAt(botS, x - 5));
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
        '<g class="sp sp-jig" filter="url(#grain)">' +
        '<path class="j-line" d="M22 60C14 44 10 22 9 0"/>' +
        '<path class="j-wire" d="M30 60H23"/><circle class="j-wire" cx="19.5" cy="60" r="3.4"/>' +
        '<path class="j-wire" d="M232 53L272 50"/><path class="j-pin" d="' + pins + '"/>' +
        '<circle class="j-collar" cx="252" cy="51" r="2.6"/><circle class="j-collar" cx="266" cy="50" r="2.3"/>' +
        '<path class="j-feather" d="' + feather + '"/>' +
        '<path d="M46 66C52 80 62 88 74 86C84 84 90 76 92 70Z" fill="url(#' + id + '-l)"/>' +
        '<path class="j-leadlit" d="M54 72C60 80 68 82 76 80" filter="url(#gb1)"/><path class="ink thin" d="M46 66C52 80 62 88 74 86C84 84 90 76 92 70"/>' +
        '<path d="' + bD + '" fill="url(#' + id + '-b)"/>' +
        '<g clip-path="url(#' + id + '-c)">' +
          '<path class="j-band" d="' + bands + '" filter="url(#gb05)"/><path class="j-weave" d="' + weave + '"/>' +
          '<path class="j-seg" d="' + seg + '"/>' +
          '<path class="sh-back j" filter="url(#gb3)" d="' + cr(top, false) + '"/><path class="sq-lit" d="M52 50C96 42 170 43 226 52" filter="url(#gb3)"/>' +
          '<path class="sh-rim" filter="url(#gb3)" d="' + cr(bot, false) + '"/>' +
        '</g>' +
        '<circle class="eye-ring" cx="50" cy="56" r="5.2"/><circle class="iris" cx="50" cy="56" r="4.4" fill="url(#' + id + '-i)"/>' +
        '<circle class="pupil" cx="49.6" cy="56.2" r="2.4"/><circle class="glint" cx="48.4" cy="54.6" r=".8"/>' +
        '<path class="ink body" d="' + bD + '"/><path class="ink under" d="' + cr(bot, false) + '"/>' +
        '</g>';
    }
  };

  // The whole plate set as one hidden sprite; screens place them with <use>.
  // The class sits on the symbol so the gradient stops inside it inherit the
  // plate's colours as well as the shapes do.
  G.sprite = function () {
    var out = '<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
      '<filter id="gb05" filterUnits="userSpaceOnUse" x="-20" y="-20" width="480" height="230"><feGaussianBlur stdDeviation=".5"/></filter>' +
      '<filter id="gb1" filterUnits="userSpaceOnUse" x="-20" y="-20" width="480" height="230"><feGaussianBlur stdDeviation="1.1"/></filter>' +
      '<filter id="gb3" filterUnits="userSpaceOnUse" x="-20" y="-20" width="480" height="230"><feGaussianBlur stdDeviation="2.6"/></filter>' +
      '<filter id="gb4" filterUnits="userSpaceOnUse" x="-20" y="-20" width="480" height="230"><feGaussianBlur stdDeviation="4"/></filter>' +
      '<filter id="gb6" filterUnits="userSpaceOnUse" x="-30" y="-30" width="500" height="250"><feGaussianBlur stdDeviation="6"/></filter>' +
      // Uneven pigment: the darker pools a wash leaves as it dries.
      '<filter id="blot" filterUnits="userSpaceOnUse" x="0" y="0" width="440" height="190" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".024 .055" numOctaves="3" seed="3"/>' +
        '<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.4 -1.05"/></filter>' +
      // Paper tooth and a slight waver in every edge, so nothing reads as ruled.
      '<filter id="grain" x="-4%" y="-10%" width="108%" height="120%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="5" result="n"/>' +
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .8 -.34" result="g"/>' +
        '<feComposite in="g" in2="SourceAlpha" operator="in" result="gi"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency=".035 .07" numOctaves="2" seed="8" result="lo"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="lo" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
        '<feMerge><feMergeNode in="d"/><feMergeNode in="gi"/></feMerge></filter>' +
      (G.sceneDefs ? G.sceneDefs() : "") + "</defs>";
    Object.keys(S).forEach(function (k) {
      out += '<symbol id="sp-' + k + '" class="sp-' + k + '" viewBox="' + S[k].box + '" overflow="visible">' + S[k].draw() + "</symbol>";
    });
    return out + "</svg>";
  };
  G.plate = function (k, cls) {
    var b = S[k].box.split(" ");
    return '<svg class="specimen sp-' + k + (cls ? " " + cls : "") + '" viewBox="' + S[k].box + '" width="' + b[2] + '" height="' + b[3] +
      '" role="img" aria-label="' + S[k].name + '"><use href="#sp-' + k + '"/></svg>';
  };
})(typeof window !== "undefined" ? window : globalThis);
