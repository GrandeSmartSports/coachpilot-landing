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
    // Layer 1. True of every rod on every shelf, which is why none of these
    // may name a fish. A species card links in here rather than restating it.
    fundamentals: [
      {
        id: "rod-length",
        group: "fundamental",
        title: "Length: what it actually buys",
        body:
          '<p class="when">Measured butt to tip, in feet. The first number on the blank.</p>' +
          '<div class="box"><b>longer gets you</b>' +
            "<strong>Line control.</strong> More rod above the water means you can hold line off the surface, steer it around an obstacle, and keep a straight line to whatever is on the end. This is the big one and almost nobody mentions it.<br><br>" +
            "<strong>Reach.</strong> Over a rail, around a piling, past the rocks at your feet.<br><br>" +
            "<strong>Distance.</strong> A longer lever throws further for the same effort.</div>" +
          '<div class="box"><b>longer costs you</b>' +
            "Weight in your hand over a long session, accuracy on a short precise cast, and a lot of awkwardness anywhere with branches, a low ceiling, or people standing close.</div>" +
          '<div class="box tip"><b>the mistake to avoid</b>' +
            "Buying length for casting distance when you actually need it for line control. If you are fishing straight down off a structure you are not casting anywhere, and the length is still the right call. Work out which one you are buying.</div>"
      },
      {
        id: "rod-power",
        group: "fundamental",
        title: "Power: how hard it is to bend",
        body:
          '<p class="when">Printed as a word. From softest to stiffest, the usual ladder runs Ultra Light, Light, Medium Light, Medium, Medium Heavy, Heavy.</p>' +
          '<div class="box"><b>what it means</b>' +
            "How much force it takes to put a bend in the blank. Nothing else. A Heavy rod is not stronger in some general sense, it just takes more pull before it gives.</div>" +
          '<div class="box red"><b>the thing people get wrong</b>' +
            "Power is matched to the <strong>line and lure weight printed beside it</strong>, not to how big the fish is. " +
            "Pick power above what the job needs and a soft take never reaches your hand, because the blank absorbs it before you do. " +
            "That is a rod doing its job correctly and still being the wrong rod.</div>" +
          '<div class="box tip"><b>how to feel it in a shop</b>' +
            "Hold the rod horizontal and press the tip down against the floor with one finger. Note how far down the blank the bend travels and how hard you had to push. Then do it with the one next to it. Two rods, thirty seconds, and the word on the blank stops being abstract.</div>"
      },
      {
        id: "rod-action",
        group: "fundamental",
        title: "Action: where it bends",
        body:
          '<p class="when">Printed as Fast, Moderate or Slow. This is the one most people confuse with power.</p>' +
          '<div class="box"><b>power is how much, action is where</b>' +
            "Two rods can take exactly the same force to bend and bend in completely different places. " +
            "<strong>Action is where along the blank the bend starts.</strong></div>" +
          '<div class="box"><b>fast</b>' +
            "Bends in the top quarter or third only. The rest stays stiff. " +
            "You feel more, because a small movement at the tip is not swallowed by the rest of the rod, and you move the hook quickly when you lift.</div>" +
          '<div class="box"><b>moderate</b>' +
            "Bends through the upper half. A middle ground. Casts light things better than a fast rod and still has some feel.</div>" +
          '<div class="box"><b>slow</b>' +
            "Bends through nearly the whole blank. Great cushion, so light line does not snap and a thrashing fish stays on. " +
            "Poor at telling you what is happening down there.</div>" +
          '<div class="box tip"><b>if you want to feel a soft take</b>' +
            "You want <strong>fast</strong>. A moderate rod in the same power rating will cost you bites you never knew you had.</div>"
      },
      {
        id: "rod-line-rating",
        group: "fundamental",
        title: "Line rating: the numbers in pounds",
        body:
          '<p class="when">Printed as a range, like 6 to 12 lb. Usually with a lure weight range beside it, like 1/8 to 3/8 oz.</p>' +
          '<div class="box"><b>what it is</b>' +
            "The band of line strength this blank was designed around. Inside it, the rod bends the way the builder intended and the line gives out before the rod does, which is the correct order for things to fail in.</div>" +
          '<div class="box"><b>too heavy for the rating</b>' +
            "The line is now stronger than the rod. Snag up and pull hard and you break the blank instead of the line. You also lose feel: heavy line has mass and stiffness of its own that deadens everything.</div>" +
          '<div class="box"><b>too light for the rating</b>' +
            "You snap off on the lift, because a stiff blank transmits the whole jolt straight to the line instead of cushioning it.</div>" +
          '<div class="box law"><b>braid changes the maths</b>' +
            "These ratings were written for monofilament, which stretches. Braid does not stretch at all and is far thinner for the same strength. " +
            "So braid at the top of the stated range behaves much harsher than mono at the top of it. " +
            "A common rule is to stay at or below the stated range when running braid, not above it.</div>" +
          '<div class="box tip"><b>the lure weight range matters too</b>' +
            "Below the range the rod never loads and you cannot cast. Above it you overload the tip. " +
            "Light presentations are the ones most often outside the printed range, so check it rather than assuming.</div>"
      },
      {
        id: "rod-reading-the-blank",
        group: "fundamental",
        title: "Reading any rod in a shop",
        body:
          '<p class="when">Every rod on the rack tells you all four numbers. You just have to know where to look.</p>' +
          '<div class="box"><b>where it is printed</b>' +
            "On the blank itself, <strong>just above the handle</strong>, usually within a few inches of the reel seat. Small text, often dark on dark. Tilt it to the light.</div>" +
          '<div class="box"><b>what you will see</b>' +
            "A model code, then the length, then the power word, then the action word, then a line range in pounds and a lure range in ounces. " +
            "Something like <strong>9&#39;0&quot; Light Fast, 6 to 12 lb, 1/8 to 3/8 oz</strong>.</div>" +
          '<div class="box"><b>reading a model code</b>' +
            "Codes vary by maker and are not a standard, but a very common pattern packs length and power into digits: " +
            "<strong>862ML</strong> reads as 8 feet 6 inches, 2 pieces, Medium Light. " +
            "Use it as a hint and then confirm against the printed words, never instead of them.</div>" +
          '<div class="box tip"><b>the sixty second shop test</b>' +
            "Read the blank. Hold it. Press the tip to the floor and watch where the bend starts. " +
            "Then do the same with the rod beside it. You are not judging quality, you are learning what the words feel like, " +
            "and after four or five rods you can shop without anyone&#39;s help.</div>"
      }
    ],

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
              '<a class="klink" href="#/learn/rod-power">What power, action and line rating actually mean <span>the rod course</span></a>' +
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
            // Limits move season to season, so this one goes off.
            shelfDays: 180,
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
          },
          {
            id: "squid-rig",
            group: "water",
            title: "The rig",
            diagram: "squid-vertical",
            body:
              '<p class="when">You fish straight down, not out. The whole rig hangs under the rod tip and the only job is to keep it vertical and keep it in the light edge.</p>' +
              '<div class="box law"><b>one line, up to four jigs</b>' +
                "The 2026 rule is <strong>one line per person</strong>. On that line you may run up to <strong>four</strong> lures. " +
                "Two is the sane number: enough to cover depth, few enough to untangle in the dark.</div>" +
              '<ol class="steps">' +
                "<li><b>Braid to a small swivel.</b> Squid jigs spin on the drop and the swivel is what stops that twist working back up your main line.</li>" +
                "<li><b>Lower jig tied in line</b> about two to three feet below the swivel.</li>" +
                "<li><b>Upper jig on a short dropper</b>, eight to twelve inches, tied a foot or two above the lower one. " +
                "The gap is how you find which depth they are sitting at tonight.</li>" +
                "<li><b>Weight only if you need it.</b> Enough to hang straight down in whatever current there is, and not one bit more. " +
                "Every extra ounce is weight you have to feel a quarter ounce animal through.</li>" +
              "</ol>" +
              '<div class="box tip"><b>fish the edge, not the glare</b>' +
                "Drop it where the lit water stops and the black water starts. Squid sit just outside the light and come into it to hunt.</div>"
          },
          {
            id: "squid-lures",
            group: "water",
            title: "Jigs: size, colour and glow",
            body:
              '<div class="box"><b>it is not a hook</b>' +
                "A squid jig ends in a crown of fine upturned pins with no barbs. Squid grab the jig and the pins hold the arms. " +
                "<strong>Nothing is set and nothing is pierced</strong>, so a slack line lets them simply let go and swim off. " +
                "That single fact drives everything on the feel card.</div>" +
              '<div class="box"><b>size follows the season</b>' +
                "<strong>2.0 to 2.5</strong> early, October into December, while they are small. " +
                "<strong>3.0 to 3.5</strong> later as they grow. Running a jig too big early is a common way to blank on a night when they are clearly there.</div>" +
              '<div class="box"><b>colour</b>' +
                "Start with glow or a light green and pink. Under a pier light, contrast matters more than any exact colour. " +
                "If nothing happens for twenty minutes, change the one thing you can change fastest.</div>" +
              '<div class="box tip"><b>charge the glow</b>' +
                "Hit a glow jig with your UV light for ten seconds before every few drops. " +
                "It fades faster than you think and a dead glow jig looks like nothing at all down there.</div>"
          },
          {
            id: "squid-casting",
            group: "water",
            title: "Getting it out there",
            body:
              '<p class="when">There is barely any casting in this. Twenty to thirty feet is a long cast off a pier.</p>' +
              '<ol class="steps">' +
                "<li><b>Lob it, do not launch it.</b> An underhand swing to the edge of the light. A hard cast just tangles two jigs together in the air.</li>" +
                "<li><b>Let it sink on a tight line.</b> Thumb or finger lightly on the spool, rod tip low. " +
                "A free spool drops the jig with a bow in the line and you will miss anything that happens on the way down.</li>" +
                "<li><b>Count it down.</b> Count seconds as it sinks and remember the number when something grabs it. " +
                "That count is the depth they are at, and it is the single most useful thing you learn in the first hour.</li>" +
                "<li><b>Work back up.</b> If nothing happens at the bottom, lift and hold at shallower counts on the way in.</li>" +
              "</ol>" +
              '<div class="box tip"><b>the drop is the bite</b>' +
                "A good share of takes happen while the jig is sinking, not while you are working it. " +
                "If you are not paying attention during the sink you are fishing half the time.</div>"
          },
          {
            id: "squid-bite",
            group: "water",
            title: "What the take feels like",
            body:
              '<div class="box red"><b>it is weight, not a strike</b>' +
                "There is no tap, no thump, no pull. The jig simply <strong>gets heavier</strong>, or it stops sinking a second before it should. " +
                "That is it. That is the whole signal. " +
                "It is <strong>not a strike</strong> and waiting to feel one is how you stand on a pier all night and catch nothing.</div>" +
              '<div class="box"><b>the three ways it shows up</b>' +
                "<strong>Heavier.</strong> The most common. Everything feels the same, just more of it.<br><br>" +
                "<strong>Stopped short.</strong> You counted to eight last drop, and this time the line went slack at six. Something is holding it.<br><br>" +
                "<strong>Lighter or drifting.</strong> Rarer. A squid lifting with the jig takes the weight off, and the line goes soft for no reason.</div>" +
              '<div class="box tip"><b>when in doubt, lift</b>' +
                "A slow steady lift costs you nothing and answers the question. There is no hookset to blow, because there is no hook. " +
                "Lift whenever anything feels different and you will be right more often than you expect.</div>"
          },
          {
            id: "squid-feel",
            group: "water",
            title: "The lift, and keeping it tight",
            body:
              '<p class="when">The pins have no barbs, so the only thing holding a squid on is unbroken tension. This card is the one that loses or lands them.</p>' +
              '<div class="box red"><b>the line can never go slack</b>' +
                "Not for a moment. Not while you reposition your hands, not while you reach for the net, not while you look at someone. " +
                "<strong>Slack and they let go.</strong> There is nothing stuck in them to stop it.</div>" +
              '<ol class="steps">' +
                "<li><b>Lift slow and long.</b> A smooth sweep, not a jerk. You are drawing the squid up, not setting anything.</li>" +
                "<li><b>Reel as you drop the tip.</b> Never lower the rod without taking up the line you just gained. " +
                "This is where most of them come off and it happens so smoothly that it feels like they were never there.</li>" +
                "<li><b>Keep it moving.</b> Steady and continuous beats fast. There is no fight to win, only tension to hold.</li>" +
                "<li><b>Swing it in, do not hoist it.</b> Coming over the rail the weight doubles as it leaves the water. " +
                "Keep the rod loaded and swing it to your hand in one motion.</li>" +
              "</ol>" +
              '<div class="box tip"><b>point the business end away</b>' +
                "A squid coming over the rail will fire ink, usually at the first thing it sees. Turn it away from you and away from your neighbour.</div>"
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
