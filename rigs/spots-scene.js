// Rig Card: each spot's own picture.
//
// One entry per spot, read by the scene painter (rigs/scene.js): which
// builder paints it, which way you face where you stand, and what is truly
// in front of you. Every fact comes from the spot cards built 2026-11-26
// (tests/fixtures/spot-cards.json; tests/rigs-spots-scene.test.mjs holds
// every entry to them): only
// what a card marks proven or likely is drawn, and a card's dropped items
// never are. Bearings are degrees true from the card's stand; the painter
// places each one across the picture by the way you face.
//
// The page asks for a spot's paint with RIG.spotScene(id) (or reads
// RIG.spotScenes[id]) and adds today in .now (tide, river, wind, rain, fog,
// moon, date) and, for a spot with more than one stand, .activity or .how.
// A lake from the WDFW feed with no card gets the plain small lake, seeded
// by its id: still water and a far treeline, nothing that needs a facing.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});

  // ---- what Coach has not told us yet: one line each, change it when he answers
  var OPEN = {
    redondoEnd: "straight",      // the new Redondo pier's end: "straight", "T", "L" (turns right) or "Lleft"
    greenBank: "fenster",        // the bank he fishes on the Green: "fenster" (Auburn Narrows) or "metzler"
    tappsLaunch: "allan-yorke",  // where he launches on Lake Tapps: "allan-yorke" or "north" (North Lake Tapps Park)
    tappsRainier: false,         // can he see Rainier from the Allan Yorke docks (it would stand at the right edge)
    dashKayak: "city",           // the Dash Point beach he launches the kayak from: "city" (by the old pier) or "state"
    cowlitz: "barrier"           // where he fishes the Cowlitz: "barrier" (Barrier Dam launch) or "blue-creek"
  };
  // Lake Tapps is let down this season (card: launches closed for drawdown,
  // stumps and logs exposed). Set false when it is full again.
  var TAPPS_DRAWDOWN = true;

  var S = {
    // ---- Redondo Pier: from the boardwalk at its root, looking out along it ----
    redondo: {
      spot: "redondo", scene: "pier",                            // card kind: pier
      facing: 307,                                               // the picture looks a little right of the pier's line (facingDeg 289.5, likely), which runs to x 120
      view: "side",                                              // draw: the pier straight out; seen from beside its root, its end shows
      skyline: [
        { t: "shore", from: 225, to: 247, mi: 4.6, h: 6 },       // likely: far left edge, low wooded shore (Dash Point, Browns Point 242 to 245), nothing tall
        { t: "island", name: "vashon", from: 262, to: 352, mi: 7.3, h: 20, taper: 7 }, // proven: Vashon, a higher ridge behind Maury running off right (Neill Point 264, centre 305.7)
        { t: "island", name: "maury", from: 267, to: 320, mi: 5.3, h: 11, taper: 6 },  // proven: Maury low across the centre, Piner Point 267 to Point Robinson 320
        { t: "olympics", from: 293, to: 314, sink: 12,          // proven: the Olympics above Vashon, 296 to 310
          peaks: [[298.6, 25, 4.6], [300.4, 23, 3.4], [303.8, 17, 4], [308.4, 27, 5]] } // likely: the Brothers (299.3, a double top) and Constance (308.4) the tallest
      ],                                                         // no Rainier (behind you), no Seattle, no Narrows Bridge: dropped
      pier: {
        from: "right", vx: 120, off: 300, bays: 12, k: 0.3,      // the pier's line (289.5) heads for x 120
        end: OPEN.redondoEnd, arm: 70,                           // draw: straight out, no L or T (likely: the new pier's shape is not published)
        build: "steel", deck: "grate",                           // proven: steel piling, fully grated deck
        lamps: [],                                               // dropped: lamp posts on the new pier
        crowd: 9                                                 // proven: busy night squid pier, a crowd along the rail, squid lights on the water
      }
    },

    // ---- Des Moines Pier: from the plaza at its root, looking out WSW ----
    "des-moines-pier": {
      spot: "des-moines-pier", scene: "pier",
      facing: 262.5,                                             // the picture looks a little right of the pier's line (facingDeg 259, proven), which runs to x 180
      view: "side",                                              // draw: long straight pier running out ahead of you
      skyline: [
        { t: "island", name: "vashon", from: 264, to: 293, mi: 5.5, h: 9, taper: 6 },  // likely: Vashon on the right of the far shore, centre 275.6
        { t: "island", name: "maury", from: 235, to: 268, mi: 4.7, h: 6, taper: 6 },   // likely: Maury, low, ahead and left, 235 to 268
        { t: "island", name: "robinson", from: 239.5, to: 247, mi: 2.1, h: 2.2, tree: 2.6, taper: 3 }, // likely: Point Robinson, Maury's near tip at 243, 2.1 mi
        { t: "light", at: 243, on: "robinson", h: 5.5 },         // likely: the small white lighthouse on that tip
        { t: "olympics", from: 293, to: 312, peaks: [[295, 13, 2], [305, 15, 2.4]] }   // proven: Olympics low at the right edge, Brothers 295, Constance 305
      ],                                                         // no Rainier, no Seattle: dropped
      near: [
        { t: "masts", x0: 2, x1: 84, base: HZY(9), h: 30 },    // proven: the 900-slip marina behind the breakwater, off to the left
        { t: "breakwater", pts: [[-14, HZY(16), 6.5], [50, HZY(12), 5], [96, HZY(8), 3.2]], cls: "w-midrock" } // proven: rock breakwater just south (left) of the pier
      ],
      pier: {
        from: "right", vx: 180,                                  // the pier runs out ahead and a little left; you stand by its root on the marina side
        bays: 17, k: 0.42, off: 206,                             // proven: long, about 670 ft
        bend: -7, bendBays: 3,                                   // proven: the last stretch bends slightly southwest (left)
        build: "concrete",                                       // proven: concrete pier
        lamps: [],                                               // dropped: lamp posts (only an OSM lit tag)
        table: true,                                             // proven: picnic table at the very end
        own: true                                                // proven: at night anglers bring their own lights to the end
      },
      bank: [{ t: "lawn", layer: "over", pts: [[316, 236], [396, 226], [396, 266], [300, 266]] }] // proven: beach park lawn on the right at the shore end
    },

    // ---- Les Davis Pier: where the stem meets the T, looking NNE ----
    "les-davis": {
      spot: "les-davis", scene: "pier",
      facing: 33, fov: 55,                                       // facingDeg 33 (proven); a wider look so Vashon's south end shows at the left
      view: "deck",
      skyline: [
        { t: "island", name: "gap", from: 346, to: 18, mi: 9, h: 4, taper: 8 },     // likely: low island land behind the gap (Quartermaster Harbor mouth, 348 to 16)
        { t: "island", name: "maury", from: 16, to: 35, mi: 7.1, h: 9, taper: 6 },     // likely: Maury far ahead and a little left, south tip 16
        { t: "shore", name: "vashon", from: 300, to: 348, mi: 3.6, h: 16, taper: 3 },             // likely: Vashon's south end at the left, 340 to 348, 3.6 mi
        { t: "shore", name: "netacoma", from: 44, to: 110, mi: 3.4, h: 18 },            // likely: the Northeast Tacoma shore across the bay, right
        { t: "shore", name: "browns", from: 41, to: 110, mi: 2.3, h: 8, tree: 10, taper: 3 }      // likely: Browns Point, a low wooded point close ahead-right (48.7, 2.3 mi)
      ],                                                         // no mountains, no Seattle, no Narrows Bridge, no cranes: dropped
      pier: {
        end: "T", ahead: 0.6, arm: 6.5, height: 6,               // proven: T pier; draw: you stand where the stem meets the cross-arm
        deck: "plain",                                           // deck build is not on the card
        lamps: [-10, -4.2, 2.6, 9.5],                            // proven: lights on the pier (how many posts: not on the card)
        cover: [3.4, 14],                                          // proven: a rain cover over part of it (how much: not stated)
        crowd: 9                                                 // proven: shoulder to shoulder squid crowds in November
      }
    },

    // ---- Point Defiance boathouse dock: on the low dock, looking N at Tahlequah ----
    "point-defiance": {
      spot: "point-defiance", scene: "pier",
      facing: 20,                                                // facingDeg 20 (likely)
      view: "dock",                                              // proven: small low dock, the boathouse close behind you
      skyline: [
        { t: "shore", name: "maury", from: 49, to: 100, mi: 3.8, h: 7 },               // likely: Maury further off to the right, Piner Point 49.4
        { t: "shore", name: "vashon", from: 300, to: 26, mi: 1.75, h: 22, tree: 12, taper: 3 }, // proven: Vashon's wooded shore close straight ahead, Tahlequah 15.2, Neill Point 25
        { t: "ferry", at: 15.2, on: "vashon", s: 1.1 }           // proven: the small ferry dock at Tahlequah
      ],                                                         // no mountains, no Seattle, no Narrows Bridge, no Olympics: dropped
      near: [{ t: "rips", bands: [[-10, 196, 230, 188, 70], [120, 210, 400, 200, 80], [-10, 226, 200, 236, 60]] }], // app content: fast current off the point
      dock: { ahead: 8, l: 2.6, r: 2.6, above: 0.9, back: true } // likely: some light on the dock at night (here: from the boathouse behind you)
    },

    // ---- Fox Island pier: from the cobble beach at its foot, looking E ----
    "fox-island": {
      spot: "fox-island", scene: "pier",
      facing: 101,                                               // facingDeg 101 (east proven, the exact angle likely)
      view: "side",
      skyline: [
        { t: "rainier", at: 123.4, size: 0.95 },                 // proven: Rainier big and white right of centre (123.4, 47 mi)
        { t: "shore", name: "up", from: 40, to: 170, mi: 1.2, h: 6, tree: 8 } // likely: the low University Place shore close across, nothing tall
      ],                                                         // no Olympics, no bridges, no Tacoma cranes: dropped; Vashon only far left, out of the picture
      pier: {
        from: "right", vx: 188, bays: 10, k: 0.36, off: 200,     // draw: running straight out ahead (pier length: sources conflict, kept short)
        end: "T", arm: 46,                                       // likely: a short cross-piece at the end
        build: "concrete",                                       // proven: concrete deck on octagonal concrete piles, with handrails
        lamps: []                                                // likely: daylight only, no lamp posts
      },
      bank: [
        { t: "cobbles", edge: [[-4, 252], [80, 255], [170, 259], [240, 262], [300, 260], [394, 256]], n: 260 }, // proven: cobble beach at the pier's foot
        { t: "grass", layer: "over", pts: [[6, 262, 9], [26, 266, 8], [372, 258, 9], [388, 262, 8]], h: 18 }    // proven: grass at the foot
      ]
    },

    // ---- Dash Point: from the sand, looking N across East Passage at Maury ----
    "dash-point": {
      spot: "dash-point", scene: "sound",
      stand: OPEN.dashKayak,                                     // which beach the picture is from when the page does not say
      standBy: { how: { kayak: OPEN.dashKayak, shore: "state" } }, // altStands: the state park beach is the cutthroat stand
      view: "beach",
      bank: [{ t: "flats", low: 198, high: 256 }],               // proven: sandy shore, large areas exposed at low tide
      stands: {
        city: {                                                  // stand 1: Dash Point Park and Pier, the kayak launch
          facing: 4,                                             // facingDeg 4 at the pier (likely)
          skyline: [{ t: "island", name: "maury", from: 322, to: 27, mi: 3.2, h: 15, tree: 4, taper: 6 }], // proven: Maury low and wooded across, south tip ahead-left (322)
          view: "side",
          pier: {
            from: "right", vx: 196, bays: 9, k: 0.3, off: 250,   // proven: the old pier runs out ahead-right (NNE, about 384 ft)
            yN: 7, yF: 9, th: 4.5, drop: 40, range: 14,          // seen from the sand, its deck a little below your eye
            end: "L", arm: 78,                                   // proven: then 100 ft turning east (right)
            build: "plain", lamps: []                            // proven: closed since 2021, no one on it; no lights
          }
        },
        state: {                                                 // stand 2: Dash Point State Park day-use beach
          facing: 351,                                           // altStands facingDeg 351
          skyline: [{ t: "island", name: "maury", from: 322, to: 27, mi: 3.2, h: 15, tree: 4, taper: 6 }] // proven: Maury across, its south tip ahead-left
        }                                                        // the wooded ravine is behind you; no Vashon, no Rainier, no Olympics: dropped
      }
    },

    // ---- Westport: the crab float in the basin, or the surf perch beach ----
    westport: {
      spot: "westport", scene: "surf",
      stand: "beach",
      standBy: { activity: { perch: "beach" }, kind: { pier: "float", sound: "float", surf: "beach" } },
      stands: {
        float: {                                                 // Float 20, the public fishing float (crab)
          scene: "pier", facing: 60,                             // facingDeg 60 (likely)
          view: "float",
          near: [{ t: "breakwater", tall: 1.7, pts: [[-14, HZY(15), 13], [120, HZY(12.5), 11], [250, HZY(13.5), 12], [404, HZY(16), 13.5]] }], // proven: the rock breakwater close ahead, no horizon
          dock: { ahead: 26, l: 1.2, r: 1.3, above: 0.35, cleats: true } // proven: long low floating dock; calm basin water
        },                                                       // moored boats are behind you; no Olympics, no towns: dropped
        beach: {                                                 // the sand south of the south jetty (surf perch)
          scene: "surf", facing: 255,                            // facingDeg 255 (proven)
          jetty: { side: "right", tip: 283 },                    // proven: the south jetty runs out to sea on the right, tip at 283
          dune: "left",                                          // proven: grassy dunes behind (their edge kept at the left, clear of the jetty)
          after: "empty"                                         // proven: day use only, no one on the beach after dark
        }                                                        // no mountains, no lighthouse in view: dropped
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
      }                                                          // no mountains, no piers, no islands ahead: dropped
    },

    // ---- the Green River ----
    "green-river": {
      spot: "green-river", scene: "river",
      stand: OPEN.greenBank,
      stands: {
        fenster: {                                               // Fenster Nature Park, west bank, the gate to Auburn Narrows
          facing: 90,                                            // facingDeg 90 (likely)
          river: {
            flow: "left",                                        // proven: the Narrows is upstream on your right and the reach runs north: the water goes right to left
            far: { kind: "cottonwood", h: 46 },                  // proven: mature cottonwood floodplain forest
            bar: true,                                           // proven: natural sloping bank, gravel and sand at your feet
            trunk: "right"                                       // proven: cottonwoods on the banks
          }
        },
        metzler: {                                               // Metzler: the bank point and its facing are not mapped
          river: { flow: "left", valley: true, far: { kind: "cottonwood", h: 40 }, bar: true } // proven: steep forested valley walls behind the cottonwoods
        }
      }                                                          // no mountain, no Rainier, no buildings, no bridge: dropped
    },

    // ---- Tokul Creek mouth on the Snoqualmie (Plum #1) ----
    tokul: {
      spot: "tokul", scene: "river",
      facing: 212,                                               // facingDeg 212 (likely)
      river: {
        flow: "right",                                           // likely: downstream is right
        far: { kind: "mixed", h: 58, mix: 0.45 },                // likely: a wall of trees close across, no peaks (kinds unknown)
        creek: { x: 104 },                                       // proven: the creek pours in 20 deg left (192), the big eddy where it meets the river
        cobble: [292, 394]                                       // likely: a low cobble or rock edge in the river on the right
      }                                                          // no falls (in its gorge to the left), no Mount Si, no Rainier: dropped
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
          }                                                      // no dam in the frame (far left), no St. Helens, no Rainier: dropped
        },
        "blue-creek": {                                          // the trout hatchery / Blue Creek launch
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
        near: [[-24, 52, 236, 96], [338, 414, 234, 104]]         // likely: forest park around the lake, so trees on your own shore either side
      },                                                         // no mountains, no houses, no lily pads: dropped
      dock: { ahead: 10, l: 1.1, r: 1.1, above: 0.9 }
    },

    // ---- Lake Tapps ----
    "lake-tapps": {
      spot: "lake-tapps", scene: "lake",
      stand: OPEN.tappsLaunch,
      stands: {
        "allan-yorke": {                                         // Allan Yorke Park, the south end
          facing: 90, fov: 55,                                   // facingDeg 90 (likely); wide enough to show the open water left
          skyline: OPEN.tappsRainier ? [{ t: "rainier", at: 140.8, size: 0.8 }] : [], // likely only: Rainier off to the right (open question)
          lake: {
            shores: [
              { from: -10, to: 58, m: 3200 },                    // likely: long open water opening to the left (north)
              { from: 58, to: 190, m: 360, houses: 7, trees: 30 }  // proven: a small bay ahead with houses along the far bank
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
      }                                                          // no St. Helens, no Olympics, no wild wooded shore: dropped
    },

    // ---- American Lake: the WDFW ramp at the south end, looking N ----
    "american-lake": {
      spot: "american-lake", scene: "lake",
      facing: 5, fov: 76,                                        // facingDeg 5 (likely); wide enough for Beard Island close on the left
      lake: {
        shores: [{ from: -70, to: 80, m: 4200, trees: 70 }],                // likely: a big open lake running away north, wide water
        islands: [
          { from: 269, to: 310, m: 140, trees: 22, mix: 0.2, blunt: 0.8 }, // likely: Beard Island very close on the left (106 to 172 m)
          { from: 16, to: 27, m: 1700, trees: 30 }               // likely: a larger wooded island further out (Silcox; its bearing is not on the card)
        ],
        mix: 0.3,
        stand: "ramp"                                            // proven: concrete ramp at your feet, no dock
      }                                                          // no Rainier ahead (behind your right shoulder), no Olympics, no city: dropped
    },

    // ---- Bonney Lake (Pond): the gravel launch on 74th St E ----
    "w-l466": {
      spot: "w-l466", scene: "lake",
      facing: 160,                                               // facingDeg 160 (likely)
      lake: {
        shores: [{ from: 70, to: 250, m: 250, houses: 5 }],      // proven size: far shore close, about 250 m; likely: houses among trees around it
        mix: 0.3,
        wetland: "right",                                        // likely: wetland edge and the little park (Ken Simmons) off to the right
        stand: "gravel"                                          // proven: gravel ramp at your feet, NO pier or dock (whatever the WDFW name says)
      }                                                          // no Rainier, no mountains: dropped
    }
  };

  // Scene units under the Sound's horizon (y 176 in the painter), for
  // things placed by eye: a breakwater, masts.
  function HZY(dy) { return 176 + dy; }

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

  RIG.spotScenes = S;
  RIG.spotOpen = OPEN;
  // A spot's paint: its entry, or the plain small lake for a feed lake that
  // has none yet, or null (the page then paints its kind of water).
  RIG.spotScene = function (id) { return S[id] || (isFeedLake(id) ? (S[id] = plainLake(id)) : null); };
})(typeof window !== "undefined" ? window : globalThis);
