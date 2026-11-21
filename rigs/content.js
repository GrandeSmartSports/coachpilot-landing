(function () {
  "use strict";
  // All library text lives here as data, never as markup in index.html.
  //
  // THE LAYER RULE, which the tests enforce:
  //   fundamentals[]        Layer 1. True for all fishing, everywhere.
  //                         A fundamentals card may not name a species.
  //   species[].cards[]     Layer 2. True for that fish anywhere you catch it.
  //   species[].locations[].cards[]
  //                         Layer 3. True only at that spot. A thin modifier:
  //                         access, parking, which rail, tide station, local
  //                         rules. NEVER restates Layer 2. How you clean a
  //                         squid is identical at Redondo and Edmonds, so it
  //                         is written once, in Layer 2.
  //
  // Card shape:
  //   { id, group, title, body, diagram?, dated? }
  //     group    "before" | "water" | "after" | "fundamental"
  //     body     HTML. Inline emphasis inside a .box uses <strong>, never <b>,
  //              because .box b is styled as a block heading.
  //     diagram  a key in RIG.diagrams
  //     dated    "YYYY-MM-DD", for anything with a shelf life. The renderer
  //              shows the date and warns in Field mode when it has gone off.
  var RIG = (window.RIG = window.RIG || {});

  RIG.content = {
    fundamentals: [],

    species: [
      {
        id: "squid",
        name: "Squid",
        hint: "Lit piers after dark, October to February",
        blurb: "Market squid, off a lit pier after dark. A season that runs roughly October through February in south Puget Sound.",
        cards: [],
        locations: [
          {
            id: "redondo",
            name: "Redondo Pier",
            where: "Des Moines, WA",
            // The nearest NOAA prediction station, confirmed 2026-11-18 against
            // a real session: the 2026-11-17 numbers matched what Coach saw.
            tideStation: { id: "9446248", name: "Des Moines, East Passage", milesAway: 3.5 },
            cards: [
              {
                id: "redondo-access",
                group: "before",
                title: "Getting on the pier",
                dated: "2026-11-21",
                body:
                  '<p class="when">A lit public fishing pier on the east side of Poverty Bay. The lights are the whole reason this spot works for squid.</p>' +
                  '<div class="box"><b>tides come from Des Moines</b>' +
                  'There is no NOAA station on Redondo itself. Use <strong>Des Moines, East Passage (station 9446248)</strong>, 3.5 miles north in the same water. ' +
                  'Checked against a real session on 2026-11-17 and the timing matched what happened on the pier.</div>' +
                  '<div class="box tip"><b>fish the lit water</b>' +
                  'Squid come up to the light line after full dark. You are fishing the edge where lit water meets black water, not the middle of the bright patch.</div>' +
                  '<div class="box law"><b>still to confirm on the ground</b>' +
                  'Parking layout, how late the lot stays open, and which stretch of rail fishes best. ' +
                  'Walk it and this card gets filled in. Nothing here is guessed.</div>'
              }
            ]
          }
        ]
      }
    ]
  };
})();
