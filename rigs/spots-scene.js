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
// The page asks for a spot's paint with RIG.spotScene(id) (or reads
// RIG.spotScenes[id]) and adds today in .now (tide, river, wind, rain, fog,
// moon, date: see RIG.spotNow below, which reads them out of the forecast
// the page already keeps) and, for a spot with more than one stand, the
// trip's fish in .fish (the Green), .activity (an ocean beach) or .how.
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
    pointDefiance: 20            // the boathouse dock's facing (likely north toward Vashon)
  };
  // Lake Tapps is let down this season (card: launches closed for drawdown,
  // stumps and logs exposed). Set false when it is full again.
  var TAPPS_DRAWDOWN = true;

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
      eye: 6.5, tideRange: 3.7,                                  // at the ramp's head, a few steps back from the seawall rail; the Sound's tide at Redondo
      site: { bearing: 289.5 },                                  // the plan below is laid out along the pier's line (289.5)
      ground: { shore: 5, top: 3.4, slope: 0.075 },              // proven: small beach of cobble, gravel and sand under the seawall; eelgrass flats at minus tides
      skyline: [
        { t: "island", name: "vashon", from: 262, to: 352, mi: 7.3, h: 20, taper: 7 },              // proven: Vashon, a higher wooded ridge behind Maury, running off right (Neill Point 264)
        { t: "island", name: "maury", from: 267, to: 320, mi: 5.3, h: 11, taper: 6 },               // proven: Maury low across the middle, Piner Point 267 to Point Robinson 320
        { t: "olympics", from: 293, to: 314, sink: 12, peaks: [[298.6, 25, 4.6], [300.4, 23, 3.4], [303.8, 17, 4], [308.4, 27, 5]] } // proven: the Olympics above Vashon (296 to 310); likely: the Brothers (299.3) and Constance (308.4) tallest
      ],                                                         // NO Rainier (behind you), NO Seattle, NO Narrows Bridge: the card's NO line
      parts: [
        { t: "pier", deck: 5.8, build: "steel", bent: 6.5, rail: "wood",                            // proven: steel piling, grated deck (2026); Coach: wooden rails both sides
          segs: [{ a: [23, 2], b: [23, 57], w: 4.6 },                                                // Coach: the pier runs straight out ahead-right of the ramp
            { a: [11.5, 60.6], b: [34.5, 60.6], w: 7.2, gap: [9.2, 13.8] }],                         // Coach: a wide T-head, wider than the walk on both sides
          lamps: [{ kind: "arm", every: 18, from: 8, to: 50, side: "near", h: 6.2, segs: [0] },       // Coach: tall single-arm lamp posts along the pier, three on the walk
            { kind: "arm", every: 30, from: 11.5, to: 12, side: "far", h: 6.2, segs: [1] }],          // and one on the T-head
          crowd: 15, head: 1 },                                                                      // proven: the squid crowd under the lamps, on the rail and the T-head
        { t: "float", a: [-8.5, 4], b: [-8.5, 60], w: 2.4, piles: 7.5, top: 6.6 },                   // Coach: the ramp's long narrow float to its left, a row of bare pilings
        { t: "ramp", x0: -2.6, x1: 2.6, z0: 3.8 },                                                   // Coach: the boat ramp running down into the water
        { t: "rail", x0: -40, x1: 44, z: 3.7, y: 4.6, h: 1.05, gap: [-2.9, 2.9], wall: 1.6 }        // Coach: a low seawall with a wooden rail at your feet
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
      eye: 4.7, tideRange: 3.7,                                  // standing on the upper beach
      ground: { shore: 3, top: 3.1, slope: 0.07, cobble: true }, // proven: rocky beach at Des Moines Beach Park
      skyline: [
        { t: "island", name: "maury", from: 235, to: 268, mi: 4.7, h: 6, taper: 6 },                // likely: Maury, low, across the water behind the pier (235 to 268)
        { t: "island", name: "robinson", from: 239.5, to: 247, mi: 2.1, h: 2.2, tree: 2.6, taper: 3 }, // likely: Point Robinson, Maury's near tip at 243
        { t: "light", at: 243, on: "robinson", h: 5.5 }          // likely: the small white lighthouse on that tip
      ],                                                         // Vashon and the Olympics are off the right edge from here; NO Rainier, NO Seattle
      parts: [
        { t: "pier", deck: 7.8, build: "concrete", bent: 8, pile: 0.42, beam: 0.9, rail: "plain",      // proven: long concrete pier, about 670 ft; Coach: high on many slender bents, a rail both sides
          segs: [{ a: [-45, 84], b: [55, 228], w: 3.6 }, { a: [55, 228], b: [78, 252], w: 3.6, skip0: true }], // proven: the last stretch bends (Coach's picture: a slight bend to the right)
          lamps: { kind: "pole", every: 26, from: 8, side: "far", h: 4.6 },                          // Coach: lamp posts evenly spaced along the whole pier, seven or eight
          crowd: 6, own: true, head: 1 },                                                            // proven: squid anglers plug in their own small lights at the end
        { t: "house", at: [-70, 96], w: 30, d: 16, h: 4.2, y: 3.6, roof: "gable", ridge: "across", rh: 1.6, wall: "w-house", roofc: "w-roof", win: 0 }, // Coach: the marina's boat sheds at the foot of the pier
        { t: "rocks", pts: [[-34, 46, 2.4], [-24, 34, 2], [-15, 25, 1.6], [-8, 19, 1.3], [-4, 16, 1]], tall: 1.5, wet: 5 }, // Coach: the marina's rock breakwater, a long pile of grey boulders at the left
        { t: "shrub", at: [-1.5, 9.5], y: 3.1, r: 0.85 },                                             // Coach: a low shrub
        { t: "log", a: [1.8, 8.6], b: [6.2, 10.4], y: 3.1, d: 0.45 }, { t: "log", a: [3.4, 12.6], b: [8.6, 11.6], y: 3.1, d: 0.4 }, // Coach: bleached driftwood logs
        { t: "rocks", pts: [[4.4, 9.4, 0.8], [6.2, 11.6, 1]], y: 3.1, dry: true, tall: 1.3 }         // Coach: big boulders on the gravel beach at the right
      ]
    },

    // ---- Les Davis: from the lawn on Ruston Way, the long T across the water ----
    // Coach's pictures (11/26): the T's long cross-arm with small roofed
    // shelters and lamp posts, a lawn and path under big shade trees, dark
    // riprap at the water, Duke's on its pilings off to the right.
    "les-davis": {
      spot: "les-davis", scene: "pier",
      facing: 16, fov: 34,                                       // facingDeg 33 is out along the stem; Coach's Look Around from Ruston Way looks north, the T side on
      facingFrom: "Ruston Way lawn, the T side on",
      eye: 6, tideRange: 3.6,                                    // on the lawn above the riprap
      skyline: [
        { t: "island", name: "gap", from: 346, to: 18, mi: 9, h: 4, taper: 8 },                     // likely: low island land behind the gap (mouth of Quartermaster Harbor, 348 to 16)
        { t: "island", name: "maury", from: 16, to: 35, mi: 7.1, h: 9, taper: 6 },                  // likely: Maury far ahead and a little right of the gap, south tip 16
        { t: "shore", name: "vashon", from: 300, to: 348, mi: 3.6, h: 16, taper: 3 },               // likely: Vashon's south end at the left, 340 to 348
        { t: "shore", name: "netacoma", from: 44, to: 110, mi: 3.4, h: 18 },                        // likely: the Northeast Tacoma shore across the bay, right
        { t: "shore", name: "browns", from: 41, to: 110, mi: 2.3, h: 8, tree: 10, taper: 3 }        // likely: Browns Point, a low wooded point ahead-right (48.7)
      ],                                                         // NO mountains, NO Seattle, NO Narrows Bridge, NO cranes
      parts: [
        { t: "pier", deck: 6.8, build: "timber", bent: 7, rail: "wood",                              // proven: T-shaped pier, rails, lights; deck build not on the card (Coach's picture: timber bents)
          segs: [{ a: [-24, 22], b: [1.5, 101], w: 4 },                                                 // proven: the stem runs NNE (33) from the shore
            { a: [-44, 120], b: [49, 90], w: 6.5, gap: [43.6, 48] }],                                   // Coach: the cross-arm of the T is long, running far to both sides
          shelters: [[1, 12, 19], [1, 33, 40], [1, 60, 67], [1, 80, 87]],                             // Coach: small roofed shelters standing on it
          lamps: { kind: "pole", every: 13, from: 6, side: "far", h: 4.4, segs: [1] },                // Coach: lamp posts along the rail
          crowd: 18, head: 1 },                                                                       // proven: lit, open all night, shoulder to shoulder squid crowds in November
        { t: "house", at: [34, 66], w: 18, d: 20, h: 5.2, y: 5.6, roof: "gable", rh: 2.2, piles: 3.2, win: 1, wgap: 1.6, wall: "w-house", roofc: "w-roof" }, // Coach: Duke's standing out over the water on pilings, off to the right
        { t: "rocks", pts: [[-26, 24, 0.55], [-13, 23.4, 0.6], [0, 23.4, 0.55], [13, 23.8, 0.6], [26, 24.4, 0.55], [40, 25.2, 0.5]], y: 3.9, tall: 0.7, dry: true }, // Coach: a line of dark riprap at the water's edge
        { t: "ground", pts: [[-60, 2, 4.6], [80, 2, 4.6], [80, 23.6, 4], [-60, 23.6, 4]], cls: "w-lawn", tufts: 6, shade: [[-6, 15, 4], [18, 22, 3.5]] }, // Coach: a mown lawn
        { t: "ground", pts: [[-60, 12.4], [80, 12.4], [80, 14.6], [-60, 14.6]], y: 4.36, cls: "w-path", edges: true }, // Coach: a paved waterfront path
        { t: "tree", at: [11, 22.5], h: 13, y: 4.05, spread: 0.62 }                                    // Coach: big leafy shade trees over the lawn and path (bare in winter); kept right of the title
      ]
    },

    // ---- Point Defiance: on the dock at the boathouse, looking N at Tahlequah ----
    // Coach's pictures (11/26): the white boathouse with its pale green
    // hipped roof at the side, the marina's long fingers running north from
    // it, lantern-top lamp posts, flagpoles, wooden rails, dark firs to the left.
    "point-defiance": {
      spot: "point-defiance", scene: "pier",
      facing: OPEN.pointDefiance, fov: 44,                       // facingDeg 20 (likely)
      eye: 6.6, tideRange: 3.6,
      view: "dock",                                              // proven: small low dock, the boathouse close behind and beside you
      skyline: [
        { t: "shore", name: "maury", from: 49, to: 100, mi: 3.8, h: 7 },                            // likely: Maury further off to the right, Piner Point 49.4
        { t: "shore", name: "vashon", from: 300, to: 26, mi: 1.75, h: 22, tree: 12, taper: 3 },      // proven: Vashon's wooded shore close straight ahead, Tahlequah 15.2
        { t: "ferry", at: 15.2, on: "vashon", s: 1.1 }                                               // proven: the small ferry dock at Tahlequah
      ],                                                         // NO mountains, NO Seattle, NO Narrows Bridge, NO Olympics
      near: [{ t: "rips", bands: [[-10, 196, 230, 188, 70], [120, 210, 400, 200, 80], [-10, 226, 200, 236, 60]] }], // app content: fast current off the point
      dock: { ahead: 11.4, l: 1.6, r: 1.8, above: 1.2 },            // proven: small low dock
      parts: [
        { t: "house", at: [19, 16], w: 10, d: 40, h: 5.6, y: 5.2, roof: "hip", rh: 2.8, wall: "w-wallw", roofc: "w-roofg", win: 1, wgap: 2.2 }, // Coach: the long white boathouse, pale green hipped roof, at the side
        { t: "float", a: [16, 38], b: [16, 120], w: 2.4, piles: 12, top: 6 },                        // Coach: the marina's docks running out north from it in long fingers
        { t: "float", a: [25, 38], b: [25, 116], w: 2.4, piles: 12, top: 6 },
        { t: "woods", a: [-74, 44], b: [-52, 74], h: 26, kind: "fir", y: 4.2, gap: 5, back: 40 },     // Coach: dark conifers on the shore to the left
        { t: "rail", pts: [[-1.6, 3], [-1.6, 11.4]], y: 4.6, h: 1 },                                   // Coach: wooden rails
        { t: "lamp", x: -1.5, z: 11, y: 4.6, h: 3.3, kind: "lantern", water: [-4, 14] },             // Coach: tall lamp posts with lantern tops (likely: lit at night)
        { t: "lamp", x: 9.5, z: 16, y: 5.2, h: 3.8, kind: "lantern", water: [9, 19] }
      ]
    },

    // ---- Fox Island: from the cobble beach at its foot, looking E ----
    "fox-island": {
      spot: "fox-island", scene: "pier",
      facing: 101, fov: 44,                                      // facingDeg 101 (east proven, the exact angle likely)
      eye: 4.7, tideRange: 3.9,
      ground: { shore: 2.5, top: 3.1, slope: 0.09, cobble: true }, // proven: cobble beach approach
      skyline: [
        { t: "rainier", at: 123.4, size: 0.95 },                 // proven: Rainier big and white right of centre (123.4, 47 mi)
        { t: "shore", name: "up", from: 40, to: 170, mi: 1.2, h: 6, tree: 8 } // likely: the low University Place shore close across, nothing tall
      ],                                                         // NO Olympics, NO bridges, NO Tacoma skyline or cranes
      parts: [
        { t: "pier", deck: 5.4, build: "concrete", bent: 7, pile: 0.6, beam: 0.8, rail: "plain",       // proven: concrete deck on octagonal concrete piles, with handrails
          segs: [{ a: [9, 3], b: [9, 52], w: 3.4 }, { a: [1, 54.5], b: [17, 54.5], w: 5, gap: [6.3, 9.7] }] }, // proven: straight out; likely: a short cross-piece at the end (a T)
        { t: "ground", pts: [[-30, 0.5], [30, 0.5], [30, 3], [-30, 3]], y: 3.1, cls: "w-lawn" }       // proven: grassy upland at the foot
      ]                                                          // likely: daylight only, no lamp posts
    },

    // ---- Dash Point: the kayak launch on the city park beach, the closed L pier ahead-right ----
    "dash-point": {
      spot: "dash-point", scene: "sound",
      stand: "city",
      standBy: { how: { kayak: "city", shore: "state" } },       // altStands: the state park beach for a shore trip
      view: "beach",
      eye: 5.2, tideRange: 3.7,
      ground: { shore: 2, top: 3.6, slope: 0.032 },              // proven: sandy shore, large areas exposed at low tide
      stands: {
        city: {                                                  // Coach (11/26): he launches the kayak from the city park beach beside the pier
          facing: 4,                                             // facingDeg 4 at the pier (likely)
          skyline: [{ t: "island", name: "maury", from: 322, to: 27, mi: 3.2, h: 15, tree: 4, taper: 6 }], // proven: Maury low and wooded across, its south tip ahead-left (322)
          parts: [
            { t: "pier", deck: 6, build: "timber", bent: 6, rail: "wood",                            // proven: the old pier, about 384 ft straight out (NNE)
              segs: [{ a: [13, 4], b: [17, 120], w: 3.8 }, { a: [15, 122.5], b: [45, 122.5], w: 5, gap: [0, 4] }] }, // proven: then 100 ft turning east (right); closed since 2021, nobody on it, its lights long dead
            { t: "kayak", x: -3.2, z: 10.5, angle: 0.55 }                                                  // Coach: his kayak, at the water's edge where he launches
          ]
        },
        state: {                                                 // Dash Point State Park day-use beach
          facing: 351,                                           // altStands facingDeg 351
          skyline: [{ t: "island", name: "maury", from: 322, to: 27, mi: 3.2, h: 15, tree: 4, taper: 6 }] // proven: Maury across, its south tip ahead-left
        }                                                        // the wooded ravine is behind you; NO Rainier, NO Olympics, NO Seattle
      }
    },

    // ---- Westport: the crab float in the basin, or the surf perch beach ----
    westport: {
      spot: "westport", scene: "surf",
      stand: "beach",
      standBy: { activity: { perch: "beach" }, kind: { pier: OPEN.westportCrab, sound: OPEN.westportCrab, surf: "beach" } },
      stands: {
        float: {                                                 // Float 20, the public fishing float (crab)
          scene: "pier", facing: 60,                             // facingDeg 60 (likely)
          view: "float",
          near: [{ t: "breakwater", tall: 1.05, cls: "w-midrock", pts: [[-14, 191, 11], [120, 188.5, 9], [250, 189.5, 10], [404, 192, 11.5]] }], // proven: the rock breakwater close ahead, no horizon past it
          dock: { ahead: 26, l: 1.2, r: 1.3, above: 0.35, cleats: true } // proven: long low floating dock; calm basin water
        },                                                       // the moored boats are behind you; NO Olympics, NO towns
        beach: {                                                 // the sand south of the south jetty (surf perch)
          scene: "surf", facing: 255,                            // facingDeg 255 (proven)
          jetty: { side: "right", tip: 283 },                    // proven: the south jetty runs out to sea on the right
          dune: "left",                                          // proven: grassy dunes behind (their edge kept at the left, clear of the jetty)
          after: "empty"                                         // proven: day use only, no one on the beach after dark
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
          stack: 374,                                            // likely: Copalis Rock, one small sea stack far up the beach on the right
          cars: true,                                            // proven: vehicles allowed on the beach; a truck's lamps far down it on a dig night
          dune: "right"                                          // proven: dune grass ridge behind
        },
        perch: {
          facing: 272,                                           // altStands facingDeg 272
          jetty: { side: "left", tipX: 36 },                     // proven: the north jetty on your left, running into the sea
          dune: "right"
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
            meadow: true,                                        // likely: meadow edge on the Narrows side, where you stand
            trunk: "right"                                       // likely: cottonwood floodplain forest on the Narrows side
          }                                                      // NO gravel bar, NO bridge, NO highway (unproven), NO boats, NO Rainier (behind you)
        },
        geyser: {                                                // card green-flaming-geyser: the park's south bank, where he wades
          card: "green-flaming-geyser",
          facing: 0,                                             // facingDeg 0 (likely)
          river: {
            flow: "left",                                        // likely: the river flows right to left (west)
            far: { kind: "mixed", h: 27, mix: 0.3 },             // likely: a low flat far bank with trees, deciduous and some conifers; NO cliff
            ridge: 4,                                            // proven terrain: a low wooded ridge on the far skyline about 4 degrees high
            bar: true, riffle: true                              // likely: a gravel or cobble edge at your feet, a riffle over gravel in front
          }                                                      // NO Rainier (behind you and blocked), NO bridge, NO lights
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
        anglers: [36, 92, 286, 318]                              // proven at Sumner: a crowd on opening weekend, along the bank
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
        levee: true                                              // proven: the park lawn and levee trail at your back, the trail at your feet
      }                                                          // NO Rainier drawn (unproven from this bank)
    },
    "puyallup-128th": {
      spot: "puyallup-128th", scene: "river",                    // facing is left blank on the card: nothing here depends on it
      river: {
        flow: "right",
        glacial: true, braid: true,                              // likely: a wide braided gravel river with glacial colour
        span: true,                                              // proven: the county road bridge, its deck and rail across the river
        fields: true,                                            // proven: farm fields and scattered houses on both banks
        bar: true                                                // proven: anglers fish the river bed at the bridge
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
      lake: {
        across: 100,                                             // likely: about 100 m of still water to the wooded east shore
        mix: 0.25,                                               // trees as the whole skyline, no peaks (kinds not named)
        stand: "pier",                                           // proven: a short pier under your feet, plain build
        near: [[-24, 46, 236, 64], [338, 414, 234, 104]]         // likely: forest park around the lake, the lake running away left and right (kept under the title at the left)
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
            stand: "dock"                                        // proven: short floating wooden docks under your feet
          },
          dock: { ahead: 10, l: 1, r: 1.1, above: 0.35, beside: [-6, -4.4, 4, 16] } // proven: short floating piers running east (more than one)
        },
        north: {                                                 // North Lake Tapps Park, the alternate public stand
          facing: 185,                                           // altStand facing 185
          skyline: [{ t: "rainier", at: 144.2, size: 0.8 }],     // likely: Rainier 41 deg left of a south facing (the better sourced view)
          lake: { across: 900, shores: [{ from: 90, to: 280, m: 900, houses: 6 }], mix: 0.3, drawdown: TAPPS_DRAWDOWN, stand: "ramp" } // proven: boat ramp; houses around the shore
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
          { from: 16, to: 27, m: 1500, trees: 42 }               // likely: a larger wooded island further out (Silcox)
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
        mix: 0.3,
        wetland: "right",                                        // likely: wetland edge and the little park (Ken Simmons) off to the right
        stand: "gravel"                                          // proven: a small gravel launch at your feet, NO pier or dock (whatever the WDFW name says)
      }                                                          // NO Rainier, NO mountains
    }
  };

  // ---- the lakes from the WDFW feed: the plain small lake, seeded by id ----
  // Nothing that needs a facing (no dock, no pier, no mountain, no light
  // side), and a name with "(PIER)" in it is not a pier.
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function plainLake(id) {
    var h = hash(id);
    return { spot: id, scene: "lake", plain: true, lake: { across: 230 + (h % 420), mix: 0.15 + ((h >>> 9) % 40) / 100 } };
  }
  function isFeedLake(id) { return /^w-l\d+$/.test(String(id || "")); }
  function addFeed(list) {
    (list || []).forEach(function (s) {
      var id = s && (s.id || (s.geo ? "w-" + String(s.geo).toLowerCase() : ""));
      if (isFeedLake(id) && !S[id]) S[id] = plainLake(id);
    });
  }
  if (RIG.trips && RIG.trips.spots) addFeed(RIG.trips.spots);
  if (RIG.watersSnapshot) addFeed(RIG.watersSnapshot.waters);
  // a feed that arrives later (the live castai-waters feed) gets its lakes too
  if (RIG.trips && typeof RIG.trips.addWaters === "function" && !RIG.trips.addWaters.spotScenes) {
    var add = RIG.trips.addWaters;
    RIG.trips.addWaters = function (feed) { var out = add.apply(this, arguments); addFeed(feed && feed.waters); return out; };
    RIG.trips.addWaters.spotScenes = true;
  }

  // ---- today, out of what the page already keeps --------------------------
  // RIG.spotNow(id, when, data): the paint's .now for one spot at one time,
  // from the forecast the page already loads and saves (RIG.trips.load() /
  // RIG.trips.cached(): wx, tides, flow). Each is 0 to 1 (see today() in
  // rigs/scene.js); a thing with no data is left out and the painter uses
  // an ordinary day for it. Nothing here fetches.
  //   tide   NOAA hi/lo predictions at the spot's station (data.tides[spot.tide]),
  //          a cosine between the two turns around `when`; 0 is 0 ft MLLW,
  //          1 is the station's usual higher high (12 ft on the Sound, 8.5 on the coast)
  //   river  NWPS stageflow now (data.flow[id].now.cfs) over the spot's no-go flow (spot.river.high)
  //   wind   Open-Meteo wind at that hour (data.wx[id].hours[].wind, mph): 18 mph is whitecaps
  //   rain   the same hour's rain (inches): 0.1 in an hour is a downpour
  //   date   when (sets the sun's side and the moon; the moon is computed)
  // Fog is not in the forecast the page asks for; it stays 0 until it is.
  var HIGHER_HIGH = { "9441102": 8.5 };
  function at(list, ms, key) {
    var best = null, bd = 9e15;
    (list || []).forEach(function (h) { var d = Math.abs(new Date(h.t).getTime() - ms); if (d < bd) { bd = d; best = h; } });
    return best && bd < 2 * 3600e3 ? best[key] : null;
  }
  RIG.spotNow = function (id, when, data) {
    var d = when ? new Date(when) : new Date(), ms = d.getTime(), out = { date: d.toISOString().slice(0, 10) };
    data = data || (RIG.trips && RIG.trips.cached && RIG.trips.cached()) || null;
    var spot = ((RIG.trips && RIG.trips.spots) || []).filter(function (s) { return s.id === id; })[0];
    if (!data || !spot) return out;
    var tl = spot.tide && data.tides && data.tides[spot.tide];
    if (tl && tl.length > 1) {
      for (var i = 0; i < tl.length - 1; i++) {
        var a = new Date(tl[i].t.replace(" ", "T")).getTime(), b = new Date(tl[i + 1].t.replace(" ", "T")).getTime();
        if (ms >= a && ms <= b) {
          var f = (1 - Math.cos((Math.PI * (ms - a)) / (b - a))) / 2, v = tl[i].v + (tl[i + 1].v - tl[i].v) * f;
          out.tide = Math.max(0, Math.min(1, v / (HIGHER_HIGH[spot.tide] || 12)));
          break;
        }
      }
    }
    var fl = data.flow && data.flow[id];
    if (fl && fl.now && spot.river && spot.river.high) out.river = Math.max(0, Math.min(1, fl.now.cfs / spot.river.high));
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
  RIG.spotScene = function (id) { return S[id] || (isFeedLake(id) ? (S[id] = plainLake(id)) : null); };
})(typeof window !== "undefined" ? window : globalThis);
