// Rig Card: each spot's own picture.
//
// One entry per spot, read by the scene painter (rigs/scene.js): which
// builder paints it, which way you face where you stand, and what is truly
// in front of you. Every fact comes from the spot cards (rebuilt 2026-11-27
// with Coach's own pictures, tests/fixtures/spot-cards.json;
// tests/rigs-spots-scene.test.mjs holds every entry to them): only what a
// card marks proven or likely is drawn, and a card's dropped items never
// are. Bearings are degrees true from the card's stand; the painter places
// each across the picture by the way you face. The things a person knows a
// spot by (its pier, the float by the ramp, the boathouse, the rocks) are
// placed in metres from where you stand (parts), so the tide stands at its
// real height on every piling.
//
// Wiring it into the page (rigs/index.html), at the merge:
//  - Load /rigs/spots-scene.js AFTER trips.js and waters.js (it reads their
//    spot lists at load); it also wraps RIG.trips.addWaters for the live feed.
//  - Ask for a spot's paint only with RIG.spotScene(id), never by reading
//    RIG.spotScenes[id]: spotScene also gives a feed lake its plain lake, and
//    null for a spot with no picture (then paint its kind of water).
//  - Copy that paint and add, for a trip: fish (the trip's speciesId: a
//    salmon trip on the Green is the Auburn Narrows), how (the plan's how: the
//    Dash Point kayak or shore stand), activity (an ocean beach: "clams" or
//    "perch"), and now: RIG.spotNow(spotId, a local Date at the trip's start,
//    data, { moon: t.moon / 100 }) (see below). The spot's own page passes no
//    fish and gets the spot's own stand.
//  - The painter may change the element's data-scene to the paint's own
//    builder (paint.scene); a cache that compares data-scene must compare
//    against paint.scene, or it repaints on every render.
// A lake from the WDFW feed with no card gets the plain small lake, seeded
// by its id: still water and a far treeline, nothing that needs a facing.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});

  // ---- what Coach has not settled yet: one line each, change it when he answers
  var OPEN = {
    tappsLaunch: "allan-yorke",  // where a Lake Tapps trip launches: "allan-yorke" or "north" (North Lake Tapps Park). He has not fished it.
    tappsRainier: false,         // is Rainier in view from the Allan Yorke docks (likely only; it would stand at the right edge)
    cowlitz: "barrier",          // where he fishes the Cowlitz: "barrier" (Barrier Dam launch) or "blue-creek"
    westportCrab: "float",       // where crab rings go in at Westport: "float" (Float 20)
    pointDefiance: "walk"        // where the Point Defiance picture stands: "walk" (Coach's own Look Around from N Waterfront Dr: the walk in to the dock, the boathouse and its green roof ahead, its white wall at the right) or "dock" (the fishing walkway at the dock's end, facing 20 at Vashon and the Tahlequah ferry dock; the boathouse is then behind you and not in the picture)
  };
  // Lake Tapps is let down this season (card: launches closed for drawdown
  // from late July 2026, stumps and logs exposed; the lake is normally drawn
  // down in winter). A window on the day painted, so it ends on its own;
  // move "until" when the refill date is known.
  var TAPPS_DRAWDOWN = { from: "2026-07-27", until: "2027-04-30" };

  // The Green is two places (Coach, 11/26): a salmon trip goes to the Auburn
  // Narrows, below the SR 18 closure line; the spot's own page and any other
  // trip (winter steelhead) is Flaming Geyser, where he wades.
  var SALMON = { king: 1, chinook: 1, coho: 1, chum: 1, pink: 1, sockeye: 1 };
  function greenStand(fish) { return SALMON[fish] ? "narrows" : "geyser"; }

  var S = {
    // ---- Redondo: from the top of the boat ramp, the pier off to the right ----
    // Coach's pictures (11/26): a T-head pier with tall single-arm lamp posts
    // and wooden rails, the ramp and its long float with pilings to its left,
    // a low seawall with a wooden rail at your feet.
    redondo: {
      spot: "redondo", scene: "pier",
      facing: 306, fov: 40,                                      // facingDeg 289.5 (likely); Coach's Look Around from the ramp looks a little right, out to the T-head
      eye: 7.5, tideRange: 3.7,                                  // the Look Around's eye at the ramp's head (lot about 4.9 m over low water, the camera about 2.6 m up): the seawall rail sits well below the far water, as in his picture; the Sound's tide at Redondo
      site: { bearing: 289.5 },                                  // the plan below is laid out along the pier's line (289.5), measured off Coach's satellite picture (about 0.084 m a pixel)
      ground: { shore: 8.6, top: 4.1, slope: 0.18 },             // proven: small beach of cobble, gravel and sand under the seawall; eelgrass flats at minus tides; its top above the highest tides
      skyline: [
        { t: "island", name: "vashon", from: 262, to: 352, mi: 7.3, h: 20, taper: 7 },              // proven: Vashon, a higher wooded ridge behind Maury, running off right (Neill Point 264)
        { t: "island", name: "maury", from: 267, to: 320, mi: 5.3, h: 11, taper: 6 },               // proven: Maury low across the middle, Piner Point 267 to Point Robinson 320
        { t: "olympics", from: 293, to: 314, sink: 12, peaks: [[298.6, 25, 4.6], [300.4, 23, 3.4], [303.8, 17, 4], [308.4, 27, 5]] } // proven: the Olympics above Vashon (296 to 310); likely: the Brothers (299.3) and Constance (308.4) tallest
      ],                                                         // NO Rainier (behind you), NO Seattle, NO Narrows Bridge: the card's NO line
      parts: [
        { t: "pier", deck: 5.8, build: "steel", bent: 6.5, rail: "wood",                            // proven: steel piling, grated deck (2026); Coach: wooden rails both sides
          segs: [{ a: [19.3, 8.4], b: [19.3, 53.3], w: 4.6 },                                        // Coach's satellite: the walk runs straight out from the seawall, ahead-right of the ramp
            { a: [6.7, 56], b: [25.2, 56], w: 5.5, gap: [10.3, 14.9] }],                             // Coach: a wide T-head, wider than the walk on both sides
          lamps: [{ kind: "arm", every: 30, from: 7, to: 7.5, side: "near", h: 6.2, segs: [0] }, { kind: "arm", every: 8.5, from: 43.5, to: 52, side: "near", h: 6.2, segs: [0] }, // Coach: tall single-arm lamp posts along the pier, three on the walk: the nearest just out (its head right of the title's tags), two out toward the T (their heads under the chips: a lamp halfway out would stand behind them)
            { kind: "arm", every: 30, from: 12.6, to: 13, side: "far", h: 6.2, segs: [1] }],          // and one on the T-head
          crowd: 15, head: 1, own: "water" },                                                        // proven: the squid crowd under the lamps, on the rail and the T-head; proven: squid lights on the water
        { t: "float", a: [-8, 8], b: [-8, 58], w: 2.2, piles: 7.5, top: 6.6 },                       // Coach: the ramp's long narrow float to its left, a row of bare pilings
        { t: "ramp", x0: -6.3, x1: 1.7, z0: 3 },                                                     // Coach: the boat ramp (about 8 m wide in his satellite picture) running down into the water
        { t: "ground", pts: [[1.8, 0.4], [60, 0.4], [60, 8.3], [4.5, 8.3], [2.6, 7.4], [1.8, 6]], y: 4.9, cls: "w-lot", near: 0.7 }, // Coach: the paved lot between the road and the seawall
        { t: "ground", pts: [[-40, 0.4], [-6.4, 0.4], [-6.4, 4.5], [-40, 4.5]], y: 4.9, cls: "w-lot", near: 0.7 },
        { t: "rail", pts: [[1.8, 6], [2.6, 7.4], [4.5, 8.3], [60, 8.3]], y: 5.2, h: 1.05, wall: 0.3 } // Coach: a low seawall with a wooden rail, from the ramp's edge right along to the pier and past it
      ]
    },

    // ---- Des Moines: from the beach park north of the pier ----
    // Coach's pictures (11/26): the long thin pier running out from the left
    // across the view, high on slender bents, a row of lamp posts; the
    // breakwater's grey boulders at the left, driftwood and boulders on the right.
    "des-moines-pier": {
      spot: "des-moines-pier", scene: "pier",
      facing: 226, fov: 40,                                      // facingDeg 259 is along the pier; the card says paint it from the beach park, looking south-west across it (Coach's Look Around)
      facingFrom: "beach park, across the pier",
      eye: 5.8, tideRange: 3.7,                                  // standing on the upper beach, above the highest tides
      ground: { shore: 13, top: 4.2, slope: 0.08, cobble: true }, // proven: rocky beach at Des Moines Beach Park; its dry top (where the drift logs lie) above the highest tides
      skyline: [
        { t: "island", name: "maury", from: 235, to: 268, mi: 4.7, h: 6, taper: 6 },                // likely: Maury, low, across the water behind the pier (235 to 268)
        { t: "island", name: "robinson", from: 239.5, to: 247, mi: 2.1, h: 2.2, tree: 2.6, taper: 3 }, // likely: Point Robinson, Maury's near tip at 243
        { t: "light", at: 243, on: "robinson", h: 5.5 }          // likely: the small white lighthouse on that tip (the pier's end, about 241.5 from here, clears it)
      ],                                                         // Vashon and the Olympics are off the right edge from here; NO Rainier, NO Seattle
      parts: [
        { t: "pier", deck: 7.8, build: "concrete", bent: 8, pile: 0.42, beam: 0.9, rail: "plain",      // proven: long concrete pier, about 670 ft; Coach: high on many slender bents, a rail both sides
          segs: [{ a: [-45, 84], b: [55, 228], w: 3.6 }, { a: [55, 228], b: [70, 252], w: 3.6, skip0: true }], // proven: the last stretch bends (Coach's picture: a slight bend to the right); the stand is not pinned to the metre, so its end is set where it does not cover the light
          lamps: { kind: "pole", every: 26, from: 8, side: "far", h: 4.6 },                          // Coach: lamp posts evenly spaced along the whole pier, seven or eight
          crowd: 6, own: true, head: 1 },                                                            // proven: squid anglers plug in their own small lights at the end
        { t: "house", at: [-70, 96], w: 30, d: 16, h: 4.2, y: 4.4, roof: "gable", ridge: "across", rh: 1.6, wall: "w-house", roofc: "w-roof", win: 0 }, // Coach: the marina's boat sheds at the foot of the pier
        { t: "rocks", pts: [[-34, 46, 2.4], [-24, 34, 2], [-15, 25, 1.6], [-8, 19, 1.3], [-4, 16, 1]], tall: 1.5, wet: 5, angular: true }, // Coach: the marina's rock breakwater, a long pile of grey boulders at the left
        { t: "shrub", at: [-1.5, 9.5], y: 4.2, r: 0.85 },                                             // Coach: a low shrub
        { t: "log", a: [1.8, 8.6], b: [6.2, 10.4], y: 4.2, d: 0.45 }, { t: "log", a: [3.4, 12.6], b: [8.6, 11.6], y: 4.2, d: 0.4 }, // Coach: bleached driftwood logs, on the dry beach
        { t: "rocks", pts: [[9.6, 9.2, 0.8], [11.6, 12.4, 1]], y: 4.2, dry: true, tall: 1.3 }        // Coach: big boulders on the gravel beach at the right, clear of the logs
      ]
    },

    // ---- Les Davis: from the lawn on Ruston Way, the long T across the water ----
    // Coach's pictures (11/26): the T's long cross-arm with small roofed
    // shelters and lamp posts, a lawn and path under big shade trees, dark
    // riprap at the water, the far shore standing clear above the pier's rail.
    // Duke's is about 165 m east of here (bearing about 89, 73 degrees right
    // of this facing): outside the picture, as in his Look Around, so it is
    // not drawn; the open bay and the Northeast Tacoma shore are there instead.
    "les-davis": {
      spot: "les-davis", scene: "pier",
      facing: 16, fov: 34,                                       // facingDeg 33 is out along the stem; Coach's Look Around from Ruston Way looks north, the T side on
      facingFrom: "Ruston Way lawn, the T side on",
      eye: 9, tideRange: 3.6,                                    // the Look Around's eye, at the road's edge above the lawn: the far shore sits above the pier's rail
      ground: { shore: 24.6, top: 4, slope: 0.12 },              // proven: rock shore with a strip of beach below it, above the highest tides
      skyline: [
        { t: "island", name: "gap", from: 346, to: 18, mi: 9, h: 4, taper: 8, cls: "w-l1" },        // likely: low island land behind the gap (mouth of Quartermaster Harbor, 348 to 16)
        { t: "island", name: "maury", from: 16, to: 35, mi: 7.1, h: 9, taper: 6, cls: "w-l2" },     // likely: Maury far ahead and a little right of the gap, south tip 16
        { t: "shore", name: "vashon", from: 300, to: 348, mi: 3.6, h: 16, taper: 3 },               // likely: Vashon's south end at the left, 340 to 348
        { t: "shore", name: "netacoma", from: 44, to: 110, mi: 3.4, h: 18 },                        // likely: the Northeast Tacoma shore across the bay, right
        { t: "shore", name: "browns", from: 41, to: 110, mi: 2.3, h: 8, tree: 10, taper: 3 }        // likely: Browns Point, a low wooded point ahead-right (48.7)
      ],                                                         // NO mountains, NO Seattle, NO Narrows Bridge, NO cranes
      parts: [
        { t: "pier", deck: 6.8, build: "timber", bent: 7, rail: "wood",                              // proven: T-shaped pier, rails, lights; deck build not on the card (Coach's picture: timber bents)
          segs: [{ a: [-23.2, 24.5], b: [1.5, 101], w: 4 },                                             // proven: the stem runs NNE (33) from the shore (from the riprap's edge)
            { a: [-44, 120], b: [49, 90], w: 6.5, gap: [43.6, 48] }],                                   // Coach: the cross-arm of the T is long, running far to both sides
          shelters: [[1, 12, 19], [1, 33, 40], [1, 60, 67], [1, 80, 87]],                             // Coach: small roofed shelters standing on it
          lamps: { kind: "pole", every: 13, from: 6, side: "far", h: 4.4, segs: [1] },                // Coach: lamp posts along the rail
          crowd: 18, head: 1 },                                                                       // proven: lit, open all night, shoulder to shoulder squid crowds in November
        { t: "ground", pts: [[-60, 2, 7.4], [80, 2, 7.4], [80, 23.6, 5.5], [-60, 23.6, 5.5]], cls: "w-lawnlit", near: 0.55, tufts: 5, shade: [[9, 18, 4.6]] }, // Coach: a mown lawn, sloping down to the water
        { t: "ground", pts: [[-60, 12.4, 6.55], [80, 12.4, 6.55], [80, 14.6, 6.36], [-60, 14.6, 6.36]], cls: "w-path", edges: true }, // Coach: a paved waterfront path
        { t: "rocks", pts: [[-26, 24, 0.7], [-13, 23.8, 0.8], [0, 23.8, 0.7], [13, 24, 0.8], [26, 24.4, 0.7], [40, 25.2, 0.6]], y: 5.2, tall: 0.75, dry: true, angular: true, cls: "w-riprap", depth: 23.5 }, // Coach: a line of dark riprap at the water's edge
        { t: "tree", at: [10.4, 20], h: 9, y: 5.85, spread: 0.34, lean: 5 }                          // Coach: big leafy shade trees over the lawn and path (bare in winter); in from the edge, its crown under the tabs and right of the title's tags
      ]
    },

    // ---- Point Defiance: the boathouse and its dock ----
    // Two stands, placed from OpenStreetMap in metres. The card's own stand
    // is the covered walkway along the dock's north edge (ways 1483950407
    // and the roof 1185788221), facing 20 at Vashon: from there the
    // boathouse (way 414285102, the white building with the pale green hip
    // roof that you walk under) is right behind you, and the big boathouse
    // shed (414060508) 50 m behind-right, so neither can be at the side of a
    // picture that faces Vashon. Coach's own picture of the place is his
    // Look Around from N Waterfront Dr, on the walk in (the pier way
    // 414285099's ramp): the boathouse and its green roof ahead, the shed's
    // white wall at the right, a wooden rail at the left over the water with
    // pilings, lantern-top lamp posts, flagpoles and dark firs. The card
    // asks for that building at the side of the frame, so the default
    // stand is his (OPEN.pointDefiance); the dock's end stays one word away.
    "point-defiance": {
      spot: "point-defiance", scene: "pier",
      stand: OPEN.pointDefiance,
      tideRange: 3.6,
      stands: {
        walk: {
          facing: 355, fov: 42,                                  // a little left of the Look Around's heading (the walk runs at 31), so the boathouse and its green roof stand at the right side of the frame, clear of the title
          facingFrom: "Coach's Look Around from N Waterfront Dr, on the walk in to the dock",
          eye: 7, site: { bearing: 345 },                        // the walk's deck about 4.8 m over low water, the camera about 2.2 m up; the plan below is laid square to the two buildings (their faces run 75 and 165)
          ground: { shore: 7, top: 4.3, slope: 0.32, cobble: true }, // the rock shore at the walk's root, under its left rail, steep: it shows at low water (Coach's picture: weed on the stones below the rail) and goes under at high water; the pilings further out stand in the water
          waterEdge: { pts: [[-2.3, 6.8], [18.6, 27.1]], y: 4.8 },   // the walk's left edge over the water (its rail): the pilings and the lamps' light stand beyond it, never on the paving
          skyline: [
            { t: "shore", name: "maury", from: 49, to: 100, mi: 3.8, h: 7 },                          // likely: Maury further off to the right (mostly behind the buildings from here)
            { t: "shore", name: "vashon", from: 300, to: 26, mi: 1.75, h: 22, tree: 12, taper: 3 }      // proven: Vashon's wooded shore across the water (mostly behind the boathouse from here)
          ],                                                     // NO mountains, NO Seattle, NO Narrows Bridge, NO Olympics
          parts: [
            { t: "ground", pts: [[-14, -2], [28.8, -2], [28.8, 21.2], [60, 21], [60, 40.2], [19.1, 40.4], [18.6, 27.1], [-2.3, 6.8], [-14, 6.8]], y: 4.8, cls: "w-lot", near: 0.8, joints: 3 }, // OSM 414285099: the concrete walk and plaza (Coach's picture), its slabs' joints across it
            { t: "house", at: [38, 49], w: 28, d: 18, h: 6.4, y: 4.8, roof: "hip", rh: 3.6, wall: "w-wallw", roofc: "w-roofg", win: 1, wgap: 1.9, shop: true, door: -1.5, lit: false }, // Coach: the boathouse ahead, white siding, pale green hipped roof (OSM 414285102's south face): in his picture a shopfront of tall panes and a door under an awning, a row of small windows under the eave; not known to be lit after dark
            { t: "house", at: [45.5, 10.5], w: 33, d: 21, h: 8.5, y: 4.8, roof: "hip", rh: 1.6, wall: "w-wallw", roofc: "w-roofg", win: 0, siding: "shingle", lit: false }, // Coach: the long white shingled wall at the right, no windows on it in his picture (OSM 414060508, the boathouse shed)
            { t: "facade", pts: [[-16, 17], [13, 44]], y: 4.8, h: 2.8, rh: 1.4, dep: 5, base: 0.7, win: 3.4 }, // Coach: low white buildings beyond the water at the left (OSM 414285102's west side, the marina office)
            { t: "woods", a: [-5, 25], b: [7, 36], h: 7.5, kind: "fir", y: 4.8, gap: 2.8, land: false }, // Coach: dark firs at the left, west of the boathouse, in front of the low buildings
                                                                                                         // Coach's flagpoles are left out: from here they would stand up through the title
            { t: "piles", pts: [[-2.4, 9.5], [1.5, 13.6], [5.4, 17.6], [9.6, 21.6], [3, 21], [-1, 17], [13.4, 25.4], [7.2, 25.6], [-4.6, 20.4]], top: 4.6, w: 0.62 }, // Coach: pilings in the water under the rail at the left
            { t: "rail", pts: [[-2.3, 6.8], [18.6, 27.1]], y: 4.8, h: 1.1 },                           // Coach: wooden rails along the walk, left
            { t: "rail", pts: [[4.4, 0.9], [25.3, 21.2]], y: 4.8, h: 1.1 },                            // and right
            // Coach: lamp posts with lantern tops along the left rail (likely: lit at night); their light lies on the water you see past the rail (the water right under them is hidden by the walk's edge).
            // Only the two out along the rail are drawn, a little under 4 m tall: from here a nearer one stood up behind the date chip with its head hidden (V2-4), and these two heads stand clear under the tag
            { t: "lamp", x: 14.6, z: 23.4, y: 4.8, h: 3.8, kind: "lantern", water: [6, 32] },
            { t: "lamp", x: 18.4, z: 27, y: 4.8, h: 3.8, kind: "lantern", water: [10, 36] }
          ]
        },
        dock: {
          facing: 20, fov: 44,                                   // facingDeg 20 (likely)
          eye: 6.4,                                              // standing on the dock's deck, about 4.8 m over low water
          own: { x: 312, y: 222, rx: 80 },                       // the dock lamp's light lying on the water past the rail at night
          skyline: [
            { t: "shore", name: "maury", from: 49, to: 100, mi: 3.8, h: 7 },                            // likely: Maury further off to the right, Piner Point 49.4
            { t: "shore", name: "vashon", from: 300, to: 26, mi: 1.75, h: 22, tree: 12, taper: 3 },      // proven: Vashon's wooded shore close straight ahead, Tahlequah 15.2
            { t: "ferry", at: 15.2, on: "vashon", s: 1.1 }                                               // proven: the small ferry dock at Tahlequah
          ],                                                     // NO mountains, NO Seattle, NO Narrows Bridge, NO Olympics
          near: [{ t: "rips", bands: [[-10, 196, 230, 188, 70], [120, 210, 400, 200, 80], [-10, 226, 200, 236, 60]] }], // app content: fast current off the point
          parts: [
            { t: "ground", pts: [[-40, -2], [24, -2], [12.9, 3.2], [-16.5, 7.6], [-40, 7.8]], y: 4.8, cls: "w-lot", near: 0.8 }, // OSM 414285099: the dock's deck (concrete in Coach's picture) under you
            { t: "pier", deck: 4.8, build: "timber", bent: 4, beam: 0.5, rail: "wood", planks: true,                // OSM 1483950407: the wooden walkway along the deck's outer edge, lit; Coach: wooden rails
              segs: [{ a: [13.2, 5.25], b: [-16.25, 9.4], w: 4, norail: ["near"] }],
              lamps: { kind: "lantern", every: 12, from: 8.5, to: 9, side: "far", h: 3.4 } }                    // Coach: tall lamp posts with lantern tops (likely: lit at night)
          ]
        }
      }
    },

    // ---- Fox Island: from the cobble beach at its foot, looking E ----
    "fox-island": {
      spot: "fox-island", scene: "pier",
      facing: 95, fov: 36,                                       // facingDeg 101 (east proven, the exact angle likely), turned a little left and framed a little narrower so Rainier's summit (123.4) stands clear right of the title's tag
      site: { bearing: 101 },                                    // the pier and the beach are laid out along the card's own facing (101)
      eye: 6.1, tideRange: 3.9,                                  // standing on the top of the beach, above the highest tides
      ground: { shore: 2.5, top: 4.5, slope: 0.09, cobble: true }, // proven: cobble beach approach; its top above the highest tides
      skyline: [
        { t: "rainier", at: 123.4, size: 0.95 },                 // proven: Rainier big and white right of centre (123.4, 47 mi)
        { t: "shore", name: "up", from: 40, to: 170, mi: 1.2, h: 6, tree: 8 }, // likely: the low University Place shore close across, nothing tall
        { t: "lights", on: "up", n: 12, from: 70, to: 150 }      // the houses along that shore: their windows lit across the water after dark (the pier itself has no lamps)
      ],                                                         // NO Olympics, NO bridges, NO Tacoma skyline or cranes
      parts: [
        { t: "pier", deck: 6, build: "concrete", bent: 7, pile: 0.6, beam: 0.8, rail: "plain",         // proven: concrete deck on octagonal concrete piles, with handrails
          segs: [{ a: [9, 3], b: [9, 52], w: 3.4 }, { a: [1, 54.5], b: [17, 54.5], w: 5, gap: [6.3, 9.7] }] }, // proven: straight out; likely: a short cross-piece at the end (a T)
        { t: "ground", pts: [[-30, 0.5], [30, 0.5], [30, 2.4], [-30, 2.4]], y: 4.6, cls: "w-lawn" }   // proven: grassy upland at the foot
      ]                                                          // likely: daylight only, no lamp posts
    },

    // ---- Dash Point: the kayak launch on the city park beach, the closed L pier ahead-right ----
    "dash-point": {
      spot: "dash-point", scene: "sound",
      stand: "city",
      standBy: { how: { kayak: "city", shore: "state" } },       // altStands: the state park beach for a shore trip
      view: "beach",
      eye: 5.7, tideRange: 3.7,                                  // standing on the upper beach, above the highest tides
      ground: { shore: 2, top: 4.1, slope: 0.032, flats: true }, // proven: sandy shore, large areas exposed at low tide; its dry top above the highest tides (the flats drawn to the picture's foot)
      stands: {
        city: {                                                  // Coach (11/26): he launches the kayak from the city park beach beside the pier
          facing: 4,                                             // facingDeg 4 at the pier (likely)
          // where on the beach: the card's draw line (proven, Coach 11/26 and
          // his satellite picture) puts the pier ahead-right, so you stand on
          // the sand about 20 m west of its root (the beach runs on both sides
          // of it in his picture); the stem runs out nearly due north and the
          // L turns east (right) at its end, side on from here
          skyline: [{ t: "island", name: "maury", from: 322, to: 27, mi: 3.2, h: 15, tree: 4, taper: 6 }, // proven: Maury low and wooded across, its south tip ahead-left (322)
            { t: "lights", on: "maury", n: 9, from: 325, to: 20 }],                                 // Maury's shore is lived on: a scatter of house lights across after dark (likely)
          parts: [
            { t: "pier", deck: 6, build: "timber", bent: 6, rail: "wood",                            // proven: the old pier, about 384 ft straight out (NNE; his satellite picture: nearly due north)
              segs: [{ a: [20, 2], b: [16, 114], w: 3.8 }, { a: [14.1, 116.5], b: [46.6, 116.5], w: 5, gap: [0, 4] }] }, // proven: then 100 ft turning east (right); closed since 2021, nobody on it, its lights long dead
            { t: "kayak", x: 2.4, z: 9.5, angle: -0.35 }                                                   // Coach: his kayak, pulled down the beach to launch
          ]
        },
        state: {                                                 // Dash Point State Park day-use beach
          facing: 351,                                           // altStands facingDeg 351
          skyline: [{ t: "island", name: "maury", from: 322, to: 27, mi: 3.2, h: 15, tree: 4, taper: 6 }, // proven: Maury across, its south tip ahead-left
            { t: "lights", on: "maury", n: 9, from: 325, to: 20 }],                                 // Maury's shore is lived on: a scatter of house lights across after dark (likely)
          parts: [{ t: "angler", x: -3.4, z: { edge: 3, min: 20, max: 23 }, dir: 1, refl: true }, // the trip: someone after cutthroat at the tide's edge, or walking out to it over the flats at low water, near enough to read, his copy in the wet sand; the beach closes at dusk, so nobody after dark
            { t: "ground", pts: [[1.6, 5.6, 4.06], [2.6, 7.4, 4.06], [3.2, 9.4, 4.05], [4.6, 11.2, 4.04], [5.4, 13.6, 4.03], [7.6, 15.4, 4.02], [9.8, 17.6, 4.01], [18, 17, 4.01], [18, 5.6, 4.06]], cls: "w-berm" }, // the storm berm at the top of the beach at your right, dry sand above the highest tides, where the drift collects
            { t: "log", a: [9.6, 11.8], b: [4.8, 9.6], y: 4.06, d: 0.5 }, { t: "log", a: [6.4, 14.2], b: [11.2, 13.2], y: 4.04, d: 0.4 }, // drift logs lying on it (a Sound beach's own)
            { t: "shrub", at: [8.6, 16.2], y: 4.1, r: 1.6 }, { t: "shrub", at: [11.6, 15.4], y: 4.1, r: 1.9 }, { t: "shrub", at: [6.8, 16.8], y: 4.1, r: 1.1 }] // the brush of the wooded ravine's side at the back of the berm, where the beach ends at your right
        }                                                        // the wooded ravine is behind you; NO Rainier, NO Olympics, NO Seattle; daylight only, no lights on the beach
      }
    },

    // ---- Westport: the crab float in the basin, or the surf perch beach ----
    westport: {
      spot: "westport", scene: "surf",
      stand: "beach",
      standBy: { activity: { perch: "beach" }, kind: { pier: OPEN.westportCrab, sound: OPEN.westportCrab, surf: "beach" } },
      stands: {
        float: {                                                 // Float 20, the public fishing float (crab)
          scene: "pier", facing: 88, fov: 60,                    // facingDeg 60 (likely) is square to the float, toward the breakwater; turned right along the float, so it runs away from your feet to the right with the breakwater beyond it
          facingFrom: "on Float 20, looking out along it toward the breakwater",
          site: { bearing: 60 },                                 // the parts below are laid out square to the float (Z toward the breakwater at 60)
          eyeFloat: 1.6, tideRange: 2.9,                         // standing on the float, which rides the tide (the coast's range at Westport)
          glow: "behind",                                        // proven: no crabbing in the marina after sunset, gear out overnight: nobody on the float after dark. The town and marina behind you (Westhaven Dr) glow on the low cloud and the basin
          parts: [
            { t: "float", a: [-70, 3.1], b: [70, 3.1], w: 4.4, piles: 0, planks: true, cleats: 4.5, rings: [[72.6, -1.4], [75.4, -1.8]] }, // proven: Float 20 runs 150/330, a long low floating dock (you stand at its back edge; its width is not on the card); the crab rings set down on it by day
            { t: "rocks", pts: [[-150, 84, 5], [-70, 81, 5.6], [0, 80, 6], [70, 81, 5.6], [150, 84, 5]], angular: true, tall: 1.3, wet: 4.5, reflect: true, cls: "w-midrock" } // proven: the rock breakwater about 80 m ahead, high enough that no horizon shows past it; calm basin water
          ]
        },                                                       // the moored boats are behind you; NO Olympics, NO towns
        beach: {                                                 // the sand south of the south jetty (surf perch)
          scene: "surf", facing: 255,                            // facingDeg 255 (proven)
          jetty: { side: "right", tip: 283, root: 345, mi: 1.1 }, // proven: the south jetty leaves the shore 0.23 mi north of you and runs out to sea on the right, its tip at 283 (1.27 mi)
          dune: "left",                                          // proven: grassy dunes behind (their edge kept at the left, clear of the jetty)
          after: "empty",                                        // proven: day use only, no one on the beach after dark
          glow: "right"                                          // the town of Westport, north behind your right shoulder: after dark its lights glow on the low sky that way
        }                                                        // NO mountains, NO lighthouse in view
      }
    },

    // ---- Ocean Shores: the Copalis clam beach, or the surf perch beach ----
    "ocean-shores": {
      spot: "ocean-shores", scene: "surf",
      stand: "copalis",
      standBy: { activity: { clams: "copalis", perch: "perch" } },
      stands: {
        copalis: {
          facing: 263,                                           // facingDeg 263 (proven)
          stack: { at: 347 },                                    // likely: Copalis Rock, up the beach at 347: 84 degrees right of this facing, so outside this picture (placed by bearing, not drawn)
          cars: true,                                            // proven: vehicles allowed on the beach; a truck's lamps far down it on a dig night
          dune: "right"                                          // proven: dune grass ridge behind
        },
        perch: {
          facing: 234, fov: 68,                                  // altStands facingDeg 272 is straight out to sea; the card's surfperch view has the jetty on the left running into the sea (proven), so you look out a little south of west, down the beach toward it
          facingFrom: "the surf perch beach, out to sea and down toward the north jetty",
          jetty: { side: "left", tip: 203, root: 180, mi: 0.68 }, // proven: the north jetty on your left running into the sea, its tip at 203 (0.68 mi): at the picture's left edge, running in from the frame
          dune: "right", ridge: true,                            // proven: dunes with dune grass behind the beach: here a long high grass ridge running away up the beach on the right (Westport's perch beach has a low dune edge at the left and its jetty on the right)
          after: "empty",                                        // no lighting, and the card's only night is the clam dig: no one here after dark
          glow: "right"                                          // Ocean Shores itself, just behind the dunes: after dark its lights glow on the low sky over the dune ridge
        }
      }                                                          // NO mountains, NO piers, NO islands ahead
    },

    // ---- the Green: two places (Coach, 11/26) ----
    "green-river": {
      spot: "green-river", scene: "river",
      stand: "geyser",                                           // the spot's own page: Flaming Geyser
      standBy: { fish: greenStand },                             // a salmon trip: the Auburn Narrows; anything else: Flaming Geyser
      stands: {
        narrows: {                                               // card green-auburn-narrows: the last open bank below the SR 18 closure
          card: "green-auburn-narrows",
          facing: 331,                                           // facingDeg 331 (likely, OSM geometry)
          river: {
            flow: "left",                                        // likely: the river flows from your right to your left
            far: { kind: "mixed", h: 30, mix: 0.25 },            // likely: the far bank (college and DNR land) low and wooded
            reach: { side: "right", near: "grove", ground: "meadow" }, // you look a little upstream (right): your own bank's cottonwood floodplain forest (likely) runs away up the reach at the right and closes on the far bank; the meadow's edge (likely) at your feet at the left. The card does not describe the bank's form: no stones, no log
            wader: { x: 70, s: 1.75 }                            // proven: the riverbanks are popular with anglers in the fall (one at the meadow's edge, a step in, casting across)
          }                                                      // NO gravel bar, NO bridge, NO highway (unproven), NO boats, NO Rainier (behind you)
        },
        geyser: {                                                // card green-flaming-geyser: the park's south bank, where he wades
          card: "green-flaming-geyser",
          facing: 0,                                             // facingDeg 0 (likely)
          river: {
            flow: "left",                                        // likely: the river flows right to left (west)
            far: { kind: "mixed", h: 27, mix: 0.3 },             // likely: a low flat far bank with trees, deciduous and some conifers; NO cliff
            ridge: 4,                                            // proven terrain: a low wooded ridge on the far skyline about 4 degrees high
            reach: { side: "right", near: "mixed", mix: 0.5, cobble: true }, // you look a little upstream (right), toward the bend and Cristy Creek: your own bank's trees (the card: a generic mix; proven western redcedar in the picnic area) run away up the reach and close on the far bank, gravel and cobble at their feet (likely)
            bar: true, riffle: true                              // likely: a gravel or cobble edge at your feet, a riffle over gravel in front
          },
          // NO Rainier (behind you and blocked), NO bridge, NO lights
          tile: [0, 150, 390, 132]                               // its tile frames the reach: the bar at the left, your own bank's dark trees closing in at the right, the sky's road on the water between
        }
      }
    },

    // ---- the Puyallup (no trips yet; a later build adds them with these ids) ----
    "puyallup-sumner": {
      spot: "puyallup-sumner", scene: "river",
      facing: 226, fov: 52,                                      // facingDeg 210 (likely), turned downstream toward the joining
      river: {
        flow: "right",                                           // proven: the Puyallup runs from your left to your right
        glacial: true,                                           // likely: gray-green glacial water
        far: { kind: "plain", h: 15, tree: 9 },                  // the far bank is not described: kept plain
        join: "right",                                           // proven: the White joins off to your right, about 190 m away (turned so the joining shows at the right edge)
        anglers: [36, 92, 286, 318], opener: "08-22"             // proven at Sumner: a crowd on opening weekend (Coach's record: Aug 22), along the bank; one angler alone the rest of the season
      }                                                          // you cast into the Puyallup only (the White behind you is closed); the bridges upstream are off the left of the picture; NO Rainier drawn
    },
    "puyallup-orting": {
      spot: "puyallup-orting", scene: "river",
      facing: 236, fov: 56,                                      // facingDeg 218 (likely); turned a little downstream so the bridge shows at the right
      river: {
        flow: "right",                                           // proven: the river flows northwest, downstream on your right
        glacial: true, braid: true,                              // likely: a braided gravel-bar river, cobble and logs, cloudy glacial water
        far: { kind: "plain", h: 15, tree: 9 },                  // the far bank is not described: kept plain
        bridge: "right",                                         // proven: the road bridge downstream, to your right
        levee: true, leveeY: 228, y: 188                         // proven: the park lawn and levee trail at your back, the trail at your feet (seen from the levee's top: the river below fills more of the picture)
      }                                                          // NO Rainier drawn (unproven from this bank)
    },
    "puyallup-128th": {
      spot: "puyallup-128th", scene: "river",                    // facing is left blank on the card: nothing here depends on it
      river: {
        flow: "along",                                           // no facing: you look along the river under the span, so it runs neither left nor right
        glacial: true, braid: true,                              // likely: a wide braided gravel river with glacial colour
        span: true,                                              // proven: the county road bridge, its deck and rail across the river
        fields: true,                                            // proven: farm fields and scattered houses on both banks
        bed: true                                                // proven: anglers fish the river bed at the bridge (you stand on its gravel)
      }                                                          // NO park, NO lot, NO Rainier
    },

    // ---- Tokul Creek mouth on the Snoqualmie (Plum #1) ----
    tokul: {
      spot: "tokul", scene: "river",
      facing: 212,                                               // facingDeg 212 (likely)
      river: {
        flow: "right",                                           // likely: downstream is right
        far: { kind: "mixed", h: 58, mix: 0.45 },                // likely: a wall of trees close across, no peaks (kinds unknown)
        creek: { x: 104 },                                       // proven: the creek pours in just left of ahead (192), the big eddy where it meets the river
        cobble: [292, 394]                                       // likely: a low cobble or rock edge in the river on the right
      }                                                          // NO waterfall (in its gorge to the left), NO Mount Si, NO Rainier
    },

    // ---- the Cowlitz ----
    cowlitz: {
      spot: "cowlitz", scene: "river",
      stand: OPEN.cowlitz,
      stands: {
        barrier: {                                               // the Barrier Dam launch, north bank
          facing: 215,                                           // facingDeg 215 (likely)
          river: {
            flow: "right",                                       // likely: about 80 m of river flowing left to right
            far: { kind: "plain", h: 20, tree: 7 },              // the far bank: plain, no detail (no source describes it)
            steps: true,                                         // proven: concrete ramp and stepped fishing platforms at your feet
            rods: 9                                              // proven: plunkers lined up on the bank upstream, to the left
          }                                                      // NO dam in the frame (far left), NO St. Helens, NO Rainier
        },
        "blue-creek": {                                          // the trout hatchery / Blue Creek launch
          card: "cowlitz-blue-creek",
          facing: 160,                                           // facingDeg 160 (likely)
          river: { flow: "right", far: { kind: "plain", h: 20, tree: 7 }, weir: true, crowd: 7 } // proven: concrete pad beside the hatchery outlet weir; crowded when fish are in
        }
      }
    },

    // ---- Lake Fenwick: on the city pier off the west shore, looking E ----
    "lake-fenwick": {
      spot: "lake-fenwick", scene: "lake",
      facing: 105,                                               // facingDeg 105 (likely)
      tile: [130, 108, 260, 146],                                 // its tile frames the big shore tree as the dark mass at the right, the pier running out under it
      lake: {
        across: 100,                                             // likely: about 100 m of still water to the wooded east shore
        mix: 0.25,                                               // trees as the whole skyline, no peaks (kinds not named)
        stand: "pier",                                           // proven: a short pier under your feet, plain build
        near: [[-24, 34, 248, 22]],                              // likely: forest park around the lake, the lake running away left and right (kept low under the title at the left)
        nearTree: { x: 396, base: 240, h: 150, spread: 0.5, tileX: 344, tileH: 112, tileBase: 234 },    // and one big shore tree of that forest at your right, trunk and limbs and its crown (clear of the title's tags)
        taper: "left"                                            // the far trees kept low on the left, under the title, and full on the right
      },                                                         // NO mountains, NO houses, NO lily pads
      dock: { ahead: 10, l: 1.1, r: 1.1, above: 0.9 }
    },

    // ---- Lake Tapps (he has not fished it; its card's picture) ----
    "lake-tapps": {
      spot: "lake-tapps", scene: "lake",
      stand: OPEN.tappsLaunch,
      stands: {
        "allan-yorke": {                                         // Allan Yorke Park
          facing: 90, fov: 55,                                   // facingDeg 90 (likely); wide enough to show the open water left
          skyline: OPEN.tappsRainier ? [{ t: "rainier", at: 140.8, size: 0.8 }] : [], // likely only: Rainier off to the right (open question)
          lake: {
            shores: [
              { from: -10, to: 58, m: 3200 },                    // likely: long open water opening to the left (north)
              { from: 58, to: 190, m: 360, houses: 7, trees: 30 } // proven: a small bay ahead with houses along the far bank
            ],
            mix: 0.3, drawdown: TAPPS_DRAWDOWN,                  // proven: drawdown this season, stumps and logs showing near shore
            lights: false,                                       // no lighting on the card: the houses' windows stay small and faint
            stand: "dock"                                        // proven: short floating wooden docks under your feet
          },
          dock: { ahead: 10, l: 1, r: 1.1, above: 0.35, beside: [-6, -4.4, 4, 16] } // proven: short floating piers running east (more than one)
        },
        north: {                                                 // North Lake Tapps Park, the alternate public stand
          facing: 185,                                           // altStand facing 185
          skyline: [{ t: "rainier", at: 144.2, size: 0.8 }],     // likely: Rainier 41 deg left of a south facing (the better sourced view)
          lake: { across: 900, shores: [{ from: 90, to: 280, m: 900, houses: 6 }], mix: 0.3, drawdown: TAPPS_DRAWDOWN, lights: false, stand: "ramp" } // proven: boat ramp; houses around the shore
        }
      }                                                          // NO St. Helens, NO Olympics, NO wild wooded shore
    },

    // ---- American Lake: the WDFW ramp at the south end, looking N ----
    "american-lake": {
      spot: "american-lake", scene: "lake",
      facing: 350, fov: 62,                                      // facingDeg 5 (likely); turned a little left so Beard Island stands close at the left
      lake: {
        shores: [{ from: -70, to: 80, m: 4200, trees: 70 }],    // likely: a big open lake running away north, wide water
        islands: [
          { from: 269, to: 310, m: 140, trees: 22, mix: 0.2, blunt: 0.8 }, // likely: Beard Island very close on the left (106 to 172 m)
          { from: 12, to: 37, m: 800, trees: 42 }                // likely: a larger wooded island further out (Silcox: OSM centre about 0.8 km at 23, spanning about 12 to 37)
        ],
        mix: 0.3,
        stand: "ramp"                                            // proven: concrete ramp at your feet, no dock
      }                                                          // NO Rainier ahead (behind your right shoulder), NO Olympics, NO city
    },

    // ---- Bonney Lake (Pond): the gravel launch on 74th St E ----
    "w-l466": {
      spot: "w-l466", scene: "lake",
      facing: 160,                                               // facingDeg 160 (likely)
      lake: {
        shores: [{ from: 70, to: 250, m: 250, houses: 5 }],      // proven size: far shore close, about 250 m; likely: houses among trees around it
        mix: 0.3, lights: false,                                 // no lighting on the card: the houses' windows stay small and faint
        wetland: "right",                                        // likely: wetland edge and the little park (Ken Simmons) off to the right
        stand: "gravel"                                          // proven: a small gravel launch at your feet, NO pier or dock (whatever the WDFW name says)
      }                                                          // NO Rainier, NO mountains
    }
  };

  // ---- the lakes from the WDFW feed: the plain small lake, seeded by id ----
  // Nothing that needs a facing (no dock, no pier, no mountain, no light
  // side), and a name with "(PIER)" in it is not a pier. What the id seeds,
  // none of it a claim about the place: how far across, the share of firs,
  // how the far treeline rolls, a point of shore coming in from one side,
  // and a bank at your feet (grass and sedge, or bare earth) to one side or
  // both, so no two feed lakes look alike.
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function plainLake(id) {
    var h = hash(id), h2 = hash(id + "/2"), across = 230 + (h % 420);
    return { spot: id, scene: "lake", plain: true, lake: {
      across: across, mix: 0.15 + ((h >>> 9) % 40) / 100, roll: 0.5 + ((h2 >>> 3) % 60) / 60,
      point: { side: h2 % 2 ? "left" : "right", span: 26 + ((h2 >>> 7) % 30), m: Math.round(across * (0.38 + ((h2 >>> 13) % 30) / 100)), trees: 20 + ((h2 >>> 17) % 12) },
      bank: { side: ["left", "right", "both"][(h2 >>> 21) % 3], kind: (h2 >>> 23) % 3 ? "sedge" : "earth" }
    } };
  }
  function isFeedLake(id) { return /^w-l\d+$/.test(String(id || "")); }
  function addFeed(list) {
    (list || []).forEach(function (s) {
      var id = s && (s.id || (s.geo ? "w-" + String(s.geo).toLowerCase() : ""));
      if (isFeedLake(id) && !S[id]) S[id] = plainLake(id);
    });
  }
  // the feed's lakes, now and as the live castai-waters feed arrives; run
  // again on the first ask, in case this file loaded before trips.js
  function hookFeed() {
    if (RIG.trips && RIG.trips.spots) addFeed(RIG.trips.spots);
    if (RIG.watersSnapshot) addFeed(RIG.watersSnapshot.waters);
    if (RIG.trips && typeof RIG.trips.addWaters === "function" && !RIG.trips.addWaters.spotScenes) {
      var add = RIG.trips.addWaters;
      RIG.trips.addWaters = function (feed) { var out = add.apply(this, arguments); addFeed(feed && feed.waters); return out; };
      RIG.trips.addWaters.spotScenes = true;
    }
  }
  hookFeed();
  var hooked = !!(RIG.trips && RIG.trips.spots);

  // ---- today, out of what the page already keeps --------------------------
  // RIG.spotNow(id, when, data, extra): the paint's .now for one spot at one
  // time, from the forecast the page already loads and saves
  // (RIG.trips.load() / RIG.trips.cached(): wx, tides, flow). Nothing here
  // fetches, and nothing here throws: a time it cannot read gives {}.
  //   when   the local moment being painted: a Date built on the phone's
  //          own clock at the fishing hour, e.g. for a trip
  //          new Date(y, m - 1, d, Math.floor(t.from), Math.round((t.from % 1) * 60)),
  //          or "YYYY-MM-DDTHH:MM" (local), or "YYYY-MM-DD" (local, read at
  //          noon). Omitted: now.
  //   extra  optional: { moon } (0 to 1, e.g. the trip's own t.moon / 100)
  // What comes back (see today() in rigs/scene.js); a thing with no data is
  // left out and the painter uses an ordinary day for it:
  //   date   "YYYY-MM-DDTHH:MM", local (the sun's side, the moon, the season)
  //   tide   0 to 1: NOAA hi/lo at the spot's station (data.tides[spot.tide]),
  //          a cosine between the two turns around `when`; 0 is 0 ft MLLW,
  //          1 the station's usual higher high (12 ft on the Sound, 8.5 on the coast)
  //   tideM  the same height in metres over MLLW, minus tides included (the
  //          things placed in metres stand in it)
  //   river  that day's forecast high flow (data.flow[id].days[day].max; the
  //          gauge now only for today) through the spot's own lines:
  //          up to good is 0 to 0.6, good to no-go 0.6 to 0.9, past no-go 1,
  //          so Go always paints clear and No-go always paints up
  //   wind   Open-Meteo wind at that hour (data.wx[id].hours[].wind, mph): 18 mph is whitecaps
  //   rain   the same hour's rain (inches): 0.1 in an hour is a downpour
  // Fog is not in the forecast the page asks for; it stays 0 until it is.
  var HIGHER_HIGH = { "9441102": 8.5 };
  function pad(v) { return (v < 10 ? "0" : "") + v; }
  function localIso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function readWhen(when) {
    if (when == null || when === "") return new Date();
    if (when instanceof Date) return new Date(when.getTime());
    if (typeof when !== "string") return new Date(NaN);
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(when.trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0) : new Date(NaN);
  }
  function localMs(s) { var d = readWhen(String(s || "").replace(" ", "T").slice(0, 16)); return d.getTime(); }
  function at(list, ms, key) {
    var best = null, bd = 9e15;
    (list || []).forEach(function (h) { var d = Math.abs(localMs(h.t) - ms); if (d < bd) { bd = d; best = h; } });
    return best && bd < 2 * 3600e3 ? best[key] : null;
  }
  function flowShare(cfs, rv) {
    var good = rv.good || rv.high * 0.6, high = rv.high;
    if (cfs <= good) return (Math.max(0, cfs) / good) * 0.6;
    if (cfs <= high) return 0.6 + ((cfs - good) / Math.max(1, high - good)) * 0.3;
    return 1;
  }
  RIG.spotNow = function (id, when, data, extra) {
    var d = readWhen(when);
    if (isNaN(d.getTime())) return {};
    var ms = d.getTime(), day = localIso(d), out = { date: day + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) };
    if (extra && extra.moon != null && !isNaN(+extra.moon)) out.moon = Math.max(0, Math.min(1, +extra.moon));
    try { data = data || (RIG.trips && RIG.trips.cached && RIG.trips.cached()) || null; } catch (e) { data = null; }
    var spot = ((RIG.trips && RIG.trips.spots) || []).filter(function (s) { return s.id === id; })[0];
    if (!data || !spot) return out;
    var tl = spot.tide && data.tides && data.tides[spot.tide];
    if (tl && tl.length > 1) {
      for (var i = 0; i < tl.length - 1; i++) {
        var a = localMs(tl[i].t), b = localMs(tl[i + 1].t);
        if (ms >= a && ms <= b && b > a) {
          var f = (1 - Math.cos((Math.PI * (ms - a)) / (b - a))) / 2, v = tl[i].v + (tl[i + 1].v - tl[i].v) * f;
          out.tide = Math.max(0, Math.min(1, v / (HIGHER_HIGH[spot.tide] || 12)));
          out.tideM = Math.round(v * 0.3048 * 100) / 100;
          break;
        }
      }
    }
    var fl = data.flow && data.flow[id], rv = spot.river;
    if (fl && rv && rv.high) {
      var dmax = fl.days && fl.days[day] && fl.days[day].max, today = localIso(new Date()) === day;
      var cfs = dmax != null ? dmax : today && fl.now ? fl.now.cfs : null;
      if (cfs != null && !isNaN(+cfs)) out.river = Math.round(flowShare(+cfs, rv) * 1000) / 1000;
    }
    var hrs = data.wx && data.wx[id] && data.wx[id].hours, wind = at(hrs, ms, "wind"), rain = at(hrs, ms, "rain");
    if (wind != null) out.wind = Math.max(0, Math.min(1, wind / 18));
    if (rain != null) out.rain = Math.max(0, Math.min(1, rain / 0.1));
    return out;
  };

  RIG.spotScenes = S;
  RIG.spotOpen = OPEN;
  RIG.spotGreenStand = greenStand;
  // A spot's paint: its entry, or the plain small lake for a feed lake that
  // has none yet, or null (the page then paints its kind of water).
  RIG.spotScene = function (id) {
    if (!hooked && RIG.trips && RIG.trips.spots) { hooked = true; hookFeed(); }
    return S[id] || (isFeedLake(id) ? (S[id] = plainLake(id)) : null);
  };
})(typeof window !== "undefined" ? window : globalThis);
