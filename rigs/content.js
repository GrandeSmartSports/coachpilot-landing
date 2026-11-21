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
        cards: [
          {
            id: "squid-gear",
            group: "before",
            title: "Rod, line and jigs",
            dated: "2026-11-21",
            body:
              '<p class="when">A squid take is a change in weight, not a strike. Every choice below exists to let you feel that change.</p>' +
              '<div class="specs">' +
                '<div class="sp"><div class="k">Rod</div>' +
                  '<div class="v sp-needs">9 ft<br>light, fast</div>' +
                  '<div class="have">you have<br>7.5 ft river</div></div>' +
                '<div class="sp"><div class="k">Line</div>' +
                  '<div class="v sp-needs">10 to 15 lb<br>braid</div>' +
                  '<div class="have">you have<br>30 lb braid</div></div>' +
                '<div class="sp"><div class="k">Jig</div>' +
                  '<div class="v sp-needs">2.0 to 2.5<br>early season</div>' +
                  '<div class="have">you have<br>none yet</div></div>' +
                '<div class="sp"><div class="k">Light</div>' +
                  '<div class="v sp-needs">white<br>battery</div>' +
                  '<div class="have">you have<br>18V packs</div></div>' +
              "</div>" +
              '<div class="box red"><b>why the 7.5 failed at redondo</b>' +
                "It is wrong on three axes at once. <strong>Too short</strong> to clear the pilings or keep a tight line as the jig swings back under the pier. " +
                "<strong>Too much backbone</strong>: a blank built for 30 lb braid and a hooked steelhead absorbs a squid's take before it reaches your hand. " +
                "<strong>Line far too heavy</strong>: 30 lb braid has mass and stiffness that deaden the exact signal you are reading for.</div>" +
              '<div class="box tip"><b>sensitivity lives in the rod</b>' +
                "You are fishing straight down at a half pound animal and the reel never fights anything. Put the money in the blank and run a basic reel. " +
                "Do not let anyone sell you a reel for this.</div>" +
              '<div class="box"><b>jig size follows the season</b>' +
                "Smaller jigs early, 2.0 to 2.5, when the squid are small. Move up to 3.0 and 3.5 later in the season as they grow. " +
                "You may fish up to <strong>four lures on your one line</strong>.</div>"
          },
          {
            id: "squid-regs",
            group: "before",
            title: "Rules and limits",
            dated: "2026-11-21",
            body:
              '<div class="box law"><b>daily limit</b>' +
                "<strong>10 pounds or 5 quarts, whichever you hit first.</strong> That is all squid species together. " +
                "Humboldt squid are separate and capped at <strong>1 per day</strong>, down from 5 in 2026.</div>" +
              '<div class="box law"><b>new for 2026: one line each</b>' +
                "<strong>One line per harvester.</strong> You may not fish squid for personal use on more than one line. " +
                "This is a change, so if you fished two rods in past seasons, stop.</div>" +
              '<div class="box"><b>legal gear</b>' +
                "A forage fish jig, up to <strong>four squid lures</strong>, a forage fish dip net, or a hand dip net.</div>" +
              '<div class="box"><b>license</b>' +
                "Everyone <strong>16 or older</strong> needs a current Washington fishing license on them. A shellfish license covers squid. " +
                "Under 16 fishes free.</div>" +
              '<div class="box"><b>season</b>' +
                "Open year round in all Washington waters, except some marine preserves and conservation areas. " +
                "The season that matters is biological, not legal: squid are in south Puget Sound roughly October through February.</div>" +
              '<div class="box red"><b>check before you go</b>' +
                "These numbers come from WDFW and were read on 2026-11-21. Limits move. " +
                "The one line rule is new enough that printed guides and older posts still say otherwise.</div>"
          },
          {
            id: "squid-conditions",
            group: "before",
            title: "What makes a good night",
            dated: "2026-11-21",
            body:
              '<p class="when">Four things decide whether a night is worth driving to. In rough order of how much they matter.</p>' +
              '<div class="box"><b>1. full dark</b>' +
                "Squid rise to the light line after dark and go deep by day. There is no daytime version of this. " +
                "Sunset in late November is around 4:30, full dark by about 5:05, so a session is 5pm to 9pm. " +
                "<strong>You do not need a midnight trip.</strong></div>" +
              '<div class="box"><b>2. a light on the water</b>' +
                "You are fishing the edge where lit water meets black water. Pier lights do this for you; your own light extends it.</div>" +
              '<div class="box"><b>3. slack over a long ebb</b>' +
                "A big swing means current, and current sweeps the jig off vertical, masks the weight change you are feeling for, " +
                "and tangles lines on a crowded rail. <strong>A high slack landing at dark with a soft early ebb beats a night that ebbs hard the whole time.</strong></div>" +
              '<div class="box"><b>4. a dark moon</b>' +
                "A bright moon lights the whole surface and your light stops being special. New moon beats full.</div>" +
              '<div class="box tip"><b>how to read a night</b>' +
                "Pull the tide for the Des Moines station and the moon phase, then look for a night where the high slack sits near full dark and the moon is thin or down. " +
                "Nov 17 2026 was almost dead water, a 1.56 ft swing, and the fishing matched.</div>"
          }
        ],
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
