// The sky engine: today's actual sky, turned into the app's colours.
//
// Washington is not a blue-sky place. Most of the fishing year is pewter
// overcast, low light and rain, so that is the palette the app has to look
// good in. The inputs are the ones Hot Trips already fetches for every spot:
// sunrise, sunset, cloud cover and rain. No new data, no images.
//
// phase(now, sun, wx) -> a phase id. PALETTES[id] carries the colours.
// Light phases put dark ink on a bright ground; night does the opposite.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});

  // Each palette: sky (top to horizon), water (horizon down), ink, and the
  // paper the cards sit on. Gold stays the family accent in every one.
  var PALETTES = {
    night: { name: "Night", dark: true, shore: "#030708",
      sky: ["#050910", "#0B1522"], water: ["#0A1420", "#060C14"],
      ground: "#070B12", paper: "#101823", line: "#1E2A38",
      ink: "#EDF3F8", ink2: "#A8BACB", dim: "#6E8396", accent: "#D9A94A", accent2: "#ECC777", gold: "#D9A94A", onGold: "#14171F" },
    firstLight: { name: "First light", dark: true, shore: "#060C0E",
      sky: ["#101C2E", "#3A4A63"], water: ["#13202F", "#0B1420"],
      ground: "#0B1420", paper: "#15202E", line: "#243444",
      ink: "#EFF4F9", ink2: "#B2C2D2", dim: "#75899B", accent: "#E0B35E", accent2: "#F0D093", gold: "#E0B35E", onGold: "#14171F" },
    dawn: { name: "Dawn", dark: false, shore: "#1A2420",
      sky: ["#4C6485", "#E3A982"], water: ["#415469", "#2B3A4B"],
      ground: "#EDE6E0", paper: "#FFFFFF", line: "#D8CFC7",
      ink: "#1B242E", ink2: "#4A5663", dim: "#646F7A", accent: "#1D5750", accent2: "#2A6E66", gold: "#D9A94A", onGold: "#1B242E" },
    overcast: { name: "Overcast", dark: false, shore: "#223029",
      sky: ["#B9C4CC", "#DCE3E8"], water: ["#8E9DA7", "#6F7E89"],
      ground: "#E8EDF0", paper: "#FFFFFF", line: "#CDD6DC",
      ink: "#131C24", ink2: "#44525C", dim: "#606F79", accent: "#1A544D", accent2: "#236B62", gold: "#D9A94A", onGold: "#131C24" },
    rain: { name: "Rain", dark: false, shore: "#1E2A25",
      sky: ["#8E9BA6", "#B6C2CB"], water: ["#6D7B86", "#55636E"],
      ground: "#DDE4E9", paper: "#F7FAFB", line: "#C3CDD5",
      ink: "#101920", ink2: "#3E4C57", dim: "#64737E", accent: "#1A5049", accent2: "#22655D", gold: "#D9A94A", onGold: "#101920" },
    bright: { name: "Blue sky", dark: false, shore: "#1B2A22",
      sky: ["#5E9BC9", "#C9E2F2"], water: ["#2E6485", "#1C4860"],
      ground: "#EAF2F8", paper: "#FFFFFF", line: "#C8DAE7",
      ink: "#0F1C26", ink2: "#3B4E5C", dim: "#5D7180", accent: "#17564F", accent2: "#1F6C63", gold: "#D9A94A", onGold: "#0F1C26" },
    golden: { name: "Golden hour", dark: false, shore: "#2A2015",
      sky: ["#C98A43", "#F2CE95"], water: ["#8A5F2C", "#5E3F1D"],
      ground: "#F3E8D8", paper: "#FFFDF9", line: "#DCCAB0",
      ink: "#20170C", ink2: "#4E3D28", dim: "#756043", accent: "#8C5A14", accent2: "#6E470F", gold: "#C9922E", onGold: "#20170C" },
    dusk: { name: "Dusk", dark: true, shore: "#070D10",
      sky: ["#1B2740", "#6B5A78"], water: ["#1A2434", "#0D1420"],
      ground: "#0D1420", paper: "#161F2C", line: "#263447",
      ink: "#F0F4F8", ink2: "#B4C2D0", dim: "#788B9C", accent: "#E0B35E", accent2: "#F0D093", gold: "#E0B35E", onGold: "#14171F" }
  };

  // Hours are local decimal hours. sun = {rise, set}; wx = {clouds 0-100, rain in/h}.
  function phase(hour, sun, wx) {
    var rise = (sun && sun.rise) || 7.5, set = (sun && sun.set) || 16.4;
    var clouds = wx && wx.clouds != null ? wx.clouds : 80;
    var rain = (wx && wx.rain) || 0;
    if (hour < rise - 1.1 || hour > set + 1.3) return "night";
    if (hour < rise - 0.3) return "firstLight";
    if (hour < rise + 0.6) return "dawn";
    if (hour > set + 0.3) return "dusk";
    if (hour > set - 1.1) return clouds > 85 ? "overcast" : "golden";
    if (rain >= 0.02) return "rain";
    if (clouds > 65) return "overcast";
    return "bright";
  }

  function paletteFor(id) { return PALETTES[id] || PALETTES.overcast; }

  // mode: "auto" | "light" | "dark". Glare on the water wins over the sky.
  function resolve(hour, sun, wx, mode) {
    var id = phase(hour, sun, wx), p = paletteFor(id);
    if (mode === "dark" && !p.dark) return { id: "night", forced: true, p: PALETTES.night, skyName: p.name };
    if (mode === "light" && p.dark) return { id: "overcast", forced: true, p: PALETTES.overcast, skyName: p.name };
    return { id: id, forced: false, p: p, skyName: p.name };
  }

  function apply(el, r) {
    var p = r.p, s = el.style;
    s.setProperty("--sky1", p.sky[0]); s.setProperty("--sky2", p.sky[1]);
    s.setProperty("--water1", p.water[0]); s.setProperty("--water2", p.water[1]);
    s.setProperty("--bg", p.ground); s.setProperty("--paper", p.paper); s.setProperty("--line", p.line);
    s.setProperty("--ink", p.ink); s.setProperty("--ink2", p.ink2); s.setProperty("--dim", p.dim);
    s.setProperty("--accent", p.accent); s.setProperty("--accent2", p.accent2);
    s.setProperty("--gold", p.gold); s.setProperty("--on-gold", p.onGold);
    s.setProperty("--shore", p.shore);
    el.setAttribute("data-sky", r.id);
    el.style.colorScheme = p.dark ? "dark" : "light";
  }

  RIG.sky = { palettes: PALETTES, phase: phase, paletteFor: paletteFor, resolve: resolve, apply: apply };
})(typeof window !== "undefined" ? window : globalThis);
