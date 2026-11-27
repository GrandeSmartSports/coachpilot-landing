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
            tab: "Length",
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
            tab: "Power",
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
            tab: "Action",
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
            tab: "Line rating",
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
            tab: "In the shop",
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
            tab: "Gear",
            group: "before",
            title: "Rod, line and jigs",
            dated: "2026-11-21",
            // The spec itself does not move. The "you have" rows do, whenever
            // the garage inventory changes.
            shelfDays: 365,
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
            tab: "Rules",
            group: "before",
            title: "Rules and limits",
            dated: "2026-11-21",
            // Limits move season to season, so this one goes off.
            shelfDays: 180,
            body:
              '<div class="box law"><b>daily limit</b>' +
                '<span class="fig">10 lb<small>or</small>5 qt</span>' +
                "<strong>10 pounds or 5 quarts, whichever you hit first.</strong> That is all squid species together. " +
                "Humboldt squid are separate and capped at <strong>1 per day</strong>, down from 5 in 2026.</div>" +
              '<div class="box law"><b>new for 2026: one line each</b>' +
                '<span class="fig">1 line</span>' +
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
                "The one line rule is new enough that printed guides and older posts still say otherwise.</div>" +
              '<a class="klink" href="https://wdfw.wa.gov/fishing/basics/squid" target="_blank" rel="noopener">Check the current rules <span>wdfw.wa.gov</span></a>'
          },
          {
            id: "squid-conditions",
            tab: "Good nights",
            group: "before",
            title: "What makes a good night",
            dated: "2026-11-21",
            // Carries seasonal numbers: sunset around 4:30, full dark by 5:05.
            // Those drift within weeks, so this is the short fuse.
            shelfDays: 30,
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
            tab: "The rig",
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
            tab: "Jigs",
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
            tab: "Casting",
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
            tab: "The take",
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
            tab: "The lift",
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
          },
          {
            id: "squid-clean",
            tab: "Clean",
            group: "after",
            title: "Cleaning and gutting",
            body:
              '<p class="when">Twenty squid is about forty minutes the first time and fifteen once you have the motion. Do it the morning after, not at midnight.</p>' +
              '<div class="box red"><b>free the guts before you pull</b>' +
                "This is the step everyone misses, and missing it is exactly why the head tears off while the insides stay in the tube. " +
                "<strong>Slide a finger inside the tube and sweep it once around the inner wall.</strong> " +
                "The guts are anchored to the top of the mantle and that sweep breaks them loose. Then pull.</div>" +
              '<ol class="steps">' +
                "<li><b>Sweep the inside.</b> One finger, once around. See above.</li>" +
                "<li><b>Pull slow and steady.</b> Body in one hand, head in the other. Head, tentacles and guts come away together in one piece.</li>" +
                "<li><b>Pull the quill.</b> A clear plastic looking strip inside the tube. It slides straight out. Check by feel that none snapped off.</li>" +
                "<li><b>Rinse the tube.</b> Run a thumb down the inside under cold water. It does not need to be surgical. Anything you can feel, get out; anything you cannot, leave.</li>" +
                "<li><b>Cut the tentacles off below the eyes.</b> One cut, just under the eye line. Everything above it goes in the bin.</li>" +
                "<li><b>Pop the beak out.</b> In the middle of the tentacle cluster is a hard black parrot beak. Squeeze the base and it pushes out like a pit. " +
                "<strong>That is the only thing you must remove from the tentacles.</strong></li>" +
                "<li><b>Skin the tubes.</b> The purple membrane peels with a thumbnail under cold water. " +
                "Skinned squid fries white and gold instead of dingy grey, and the dredge grips instead of sliding off in the oil.</li>" +
              "</ol>" +
              '<div class="box tip"><b>keep the tentacles</b>' +
                "They are the best part and they fry crispier than the rings. <strong>Skin stays on the tentacles</strong>, you cannot peel them and you do not need to.</div>" +
              '<div class="box tip"><b>first few times, split the tube</b>' +
                "Cut it open lengthwise and lay it flat instead of working blind inside a tube. You can see everything, " +
                "and flat pieces cut into strips fry just as well as rings.</div>" +
              '<div class="box"><b>freezing</b>' +
                "Clean first, then freeze. Squid takes freezing better than almost any seafood and comes out slightly more tender than it went in. " +
                "Three months easy. Bag it with a little water to keep air off.</div>"
          },
          {
            id: "squid-cook",
            tab: "Cook",
            group: "after",
            title: "Fried calamari",
            body:
              '<p class="when">About a pound of cleaned squid, which is roughly nine market squid. Appetizer for two or three. Twenty minutes start to finish.</p>' +
              '<div class="box red"><b>the only rule</b>' +
                "Squid cooks in <strong>60 to 90 seconds</strong>. Under two minutes, or braised for forty five. Anything between is a rubber band. " +
                "Pull it at pale gold, never brown.</div>" +
              '<div class="box tip"><b>out of the freezer</b>' +
                "Thaw in the fridge overnight, or sealed in a bag in cold water for 20 to 30 minutes, changing the water once. Never on the counter. " +
                "<strong>Then pat it very dry.</strong> Wet squid will not hold the dredge and it spits in hot oil.</div>" +
              '<div class="box"><b>the soak</b>' +
                "1 cup <strong>buttermilk</strong>, 30 minutes in the fridge. " +
                "Season the soak: 3/4 tsp fine sea salt, a tablespoon of hot sauce, two smashed garlic cloves, a few cracks of pepper. " +
                "Salting here is what seasons the squid itself rather than just the crust, and most people skip it.<br><br>" +
                "<strong>No lemon in the soak.</strong> Buttermilk is acidic enough; more acid starts to ceviche it and turns it chalky.</div>" +
              '<div class="box"><b>the dredge</b>' +
                "3/4 cup flour, 1/4 cup <strong>cornstarch</strong>, 1/2 tsp fine sea salt, 1/2 tsp pepper, 1/2 tsp garlic powder, 1/4 tsp paprika. " +
                "The cornstarch is what makes it crisp instead of bready. Whisk a full 30 seconds: unmixed pockets mean one piece is a salt bomb and the next tastes like nothing.<br><br>" +
                "Mixed right it looks faintly tan and evenly speckled, not white.</div>" +
              '<div class="box tip"><b>for crunchy craggy bits</b>' +
                "<strong>Drizzle two tablespoons of the buttermilk into the dry dredge and rake it with your fingers.</strong> " +
                "You get pea sized shaggy crumbs through the flour, and those are the bits that stick to the squid and fry into the best part. " +
                "Add a little at a time. Crumbs through dry flour, not paste.</div>" +
              '<ol class="steps">' +
                "<li><b>Heat the oil to 375.</b> One inch deep in a heavy skillet, cast iron is ideal. Canola or peanut. " +
                "No thermometer: a pinch of the dredge should hit the surface, sizzle hard, float at once and brown in about 30 seconds.</li>" +
                "<li><b>Dredge one batch at a time.</b> Lift out of the buttermilk with a slotted spoon, drip a few seconds, straight into the flour, " +
                "press rather than toss, then shake off the loose flour in a strainer. Loose flour burns and turns the oil gritty.</li>" +
                "<li><b>Straight into the oil.</b> Dredged squid that sits five minutes goes gummy and the coating slides off in the pan.</li>" +
                "<li><b>Fry in a single layer, 45 to 60 seconds a side.</b> Never crowded. Pull the whole batch the moment the first piece hits gold.</li>" +
                "<li><b>Onto a wire rack, then salt.</b> Not paper towel, which steams the bottom soft. Salt while it is still glossy, " +
                "sprinkled from a foot up so it scatters.</li>" +
                "<li><b>Let the oil climb back to 375 before the next batch.</b> This is where most people lose it. " +
                "Batch two goes in at 330, comes out pale and greasy, and everybody blames the recipe.</li>" +
              "</ol>" +
              '<div class="box"><b>tools that matter</b>' +
                "An instant read thermometer, and something <strong>metal</strong> to lift with. " +
                "A plastic strainer softens around 320 and your oil is at 375. Plastic is fine for shaking off flour, never for the pan.</div>" +
              '<div class="box tip"><b>serving</b>' +
                "Lemon at the table, never before. Marinara, cocktail sauce, or sixty second aioli: half a cup of mayo, one clove grated fine, squeeze of lemon, pinch of salt.</div>"
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
            tab: "The pier",
                group: "before",
                title: "Getting on the pier",
                dated: "2026-11-21",
                shelfDays: 365,
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


  // River salmon, ported 2026-11-21 from the old tabbed Rig Card. Same text,
  // split into build-it and fish-it cards, with the Green River rules moved to
  // a location card so they are written once and go off on their own.
  RIG.content.species.push({
    "id": "salmon",
    "name": "Salmon",
    "hint": "Green River from the bank, Dash Point from the kayak",
    "cards": [
      {
        "id": "salmon-license",
        "tab": "License + card",
        "group": "before",
        "title": "License, catch card, emergency rules",
        "dated": "2026-11-21",
        "shelfDays": 180,
        "body": "<p class=\"when\">True on every salmon trip, river or salt.</p><div class=\"box law\"><b>emergency rules first</b>Check the <a href=\"https://wdfw.wa.gov/fishing/regulations/emergency-rules\" target=\"_blank\" rel=\"noopener\">WDFW emergency rules</a> before you trust any limit, including one on this page. On 2026-08-29 the printed pamphlet for Marine Area 11 was already overruled by an emergency rule.</div><div class=\"box\"><b>catch record card</b>Carry it on every salmon or steelhead trip, even when you catch nothing. Record a kept fish right away. The electronic card lives in the Fish Washington app from the 2026-27 year.</div><div class=\"box\"><b>license year</b>Washington licenses run <strong>April 1 to March 31</strong>, so yours renews in the middle of winter.</div>"
      }
    ],
    "locations": [
      {
        "id": "green-river",
        "name": "Green River",
        "where": "Auburn to Kent, WA",
        "cards": [
          {
            "id": "salmon-float-eggs-build",
            "tab": "Float + eggs",
            "group": "before",
            "title": "Float and eggs: build it",
            "diagram": "river-float-eggs",
            "body": "<p class=\"when\">Slow deep slots and soft inside seams. The best all day rig when fish are holding.</p>\n<div class=\"specs\">\n<div class=\"sp\"><div class=\"k\">Float</div><div class=\"v\">1/4 or 3/8</div></div>\n<div class=\"sp\"><div class=\"k\">Leader</div><div class=\"v\">18 to 24 in</div></div>\n<div class=\"sp\"><div class=\"k\">Hook</div><div class=\"v\">1/0 single</div></div>\n<div class=\"sp\"><div class=\"k\">Depth</div><div class=\"v\">bottom<br>minus 18 in</div></div>\n</div>\n<ol class=\"steps\">\n<li>Thread the <b>bobber stop</b> onto the main line, then a <b>bead</b>, then the <b>float</b>. Order matters. Stop, bead, float. <span class=\"k\">EZ-Drift packs include 2 beads and 1 knot stop per float</span></li>\n<li>Tie the main line to a <b>barrel swivel</b>. <span class=\"k\">Improved clinch</span></li>\n<li>Pinch <b>split shot</b> onto the main line just above the swivel. Add shot until only the orange tip of the float shows above water.</li>\n<li>Tie <b>18 to 24 inches</b> of 15 lb leader to the bottom of the swivel. <span class=\"k\">Improved clinch</span></li>\n<li>Tie on a <b>1/0 egg loop hook</b>, or use a pre snelled one. <span class=\"k\">Egg loop</span></li>\n<li>Slide the bobber stop so the roe rides <b>12 to 18 inches off the bottom</b>. Start too shallow and work deeper.</li>\n</ol>"
          },
          {
            "id": "salmon-bait",
            "tab": "Bait",
            "group": "before",
            "title": "Keeping eggs on",
            "body": "<p class=\"when\">Fresh cured roe is the softest bait there is. A hook pushed through it will not survive a cast. The hook is not what holds roe on. Something wrapped around it is.</p>\n<div class=\"specs\">\n<div class=\"sp\"><div class=\"k\">Chunk</div><div class=\"v\">dime size</div></div>\n<div class=\"sp\"><div class=\"k\">Wraps</div><div class=\"v\">8 to 10</div></div>\n<div class=\"sp\"><div class=\"k\">Cast</div><div class=\"v\">lob it</div></div>\n<div class=\"sp\"><div class=\"k\">Re bait</div><div class=\"v\">6 to 8<br>drifts</div></div>\n</div>\n<div class=\"box red\"><b>Why they flew off</b>Three causes, and it is usually all three at once. The chunk was held by the hook alone, so the first cast stripped it. Guide&rsquo;s Choice is a wet cure, which is the juiciest and softest roe sold. And a snap cast puts more force on the bait than the drift ever will.</div>\n<h4>Option 1. Bait thread</h4>\n<p class=\"when\">Do this one. It is what most guides actually use, it costs about six dollars, it works on the plain hooks already in your box, and there is no knot anywhere in it.</p>\n<figure class=\"tyer\" data-steps=\"5\">\n<div class=\"stage\"><svg viewBox=\"0 0 420 250\" role=\"img\" aria-label=\"Wrapping a roe chunk onto a hook with stretchy bait thread, five steps.\"><defs><marker id=\"ar-a\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"5.5\" markerHeight=\"5.5\" orient=\"auto-start-reverse\"><path d=\"M0 0 L10 5 L0 10 z\" fill=\"var(--accent)\"/></marker><marker id=\"ar-d\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"5\" markerHeight=\"5\" orient=\"auto-start-reverse\"><path d=\"M0 0 L10 5 L0 10 z\" fill=\"var(--dim)\"/></marker></defs><g class=\"kstep\" data-step=\"1\" data-cap=\"Push the point through the chunk <b>once</b>, near the top edge. Do not thread it down the shank. One pass is all you want, the thread does the holding.\"><path d=\"M206 8 L206 36\" stroke=\"var(--dim)\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/><ellipse cx=\"206\" cy=\"88\" rx=\"26\" ry=\"30\" fill=\"var(--roe3)\" opacity=\"1\"/><circle cx=\"196\" cy=\"72\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"194.3\" cy=\"70.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"70\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"68.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"190\" cy=\"86\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"188.2\" cy=\"83.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"219\" cy=\"88\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"217.3\" cy=\"86.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"199\" cy=\"100\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"197.2\" cy=\"97.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"104\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"102.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"204\" cy=\"86\" r=\"6.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"202.1\" cy=\"83.7\" r=\"2.1\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"192\" cy=\"112\" r=\"4.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"190.7\" cy=\"110.4\" r=\"1.4\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"216\" cy=\"118\" r=\"4.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"214.8\" cy=\"116.6\" r=\"1.3\" fill=\"var(--roe)\" opacity=\"1\"/><use href=\"#hook\" x=\"175\" y=\"30\" width=\"62\" height=\"161\" color=\"var(--accent)\"/><text x=\"262\" y=\"86\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">one pass</text><text x=\"262\" y=\"106\" fill=\"var(--dim)\" font-size=\"13.5\">near the top edge</text><text x=\"262\" y=\"178\" fill=\"var(--dim)\" font-size=\"13.5\">point stays clear</text><path d=\"M258 174 L228 162\" stroke=\"var(--dim)\" stroke-width=\"1.6\" fill=\"none\" marker-end=\"url(#ar-d)\"/></g><g class=\"kstep\" data-step=\"2\" data-cap=\"Lay the thread tag along the shank and <b>pinch it with your thumb</b>. You are not tying anything. The first wrap traps it.\"><path d=\"M206 8 L206 36\" stroke=\"var(--dim)\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/><ellipse cx=\"206\" cy=\"88\" rx=\"26\" ry=\"30\" fill=\"var(--roe3)\" opacity=\"1\"/><circle cx=\"196\" cy=\"72\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"194.3\" cy=\"70.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"70\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"68.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"190\" cy=\"86\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"188.2\" cy=\"83.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"219\" cy=\"88\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"217.3\" cy=\"86.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"199\" cy=\"100\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"197.2\" cy=\"97.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"104\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"102.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"204\" cy=\"86\" r=\"6.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"202.1\" cy=\"83.7\" r=\"2.1\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"192\" cy=\"112\" r=\"4.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"190.7\" cy=\"110.4\" r=\"1.4\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"216\" cy=\"118\" r=\"4.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"214.8\" cy=\"116.6\" r=\"1.3\" fill=\"var(--roe)\" opacity=\"1\"/><use href=\"#hook\" x=\"175\" y=\"30\" width=\"62\" height=\"161\" color=\"var(--dim)\"/><path class=\"draw\" d=\"M231 44 L231 122\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\" fill=\"none\"/><text x=\"262\" y=\"60\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">thread tag</text><text x=\"262\" y=\"80\" fill=\"var(--dim)\" font-size=\"13.5\">pinch here</text><path d=\"M258 74 L238 84\" stroke=\"var(--dim)\" stroke-width=\"1.6\" fill=\"none\" marker-end=\"url(#ar-d)\"/></g><g class=\"kstep\" data-step=\"3\" data-cap=\"Wrap the spool around the whole thing, bait and shank together. <b>Start at the top</b> and work down. Keep steady tension, the thread stretches.\"><path d=\"M206 8 L206 36\" stroke=\"var(--dim)\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/><ellipse cx=\"206\" cy=\"88\" rx=\"26\" ry=\"30\" fill=\"var(--roe3)\" opacity=\"1\"/><circle cx=\"196\" cy=\"72\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"194.3\" cy=\"70.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"70\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"68.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"190\" cy=\"86\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"188.2\" cy=\"83.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"219\" cy=\"88\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"217.3\" cy=\"86.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"199\" cy=\"100\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"197.2\" cy=\"97.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"104\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"102.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"204\" cy=\"86\" r=\"6.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"202.1\" cy=\"83.7\" r=\"2.1\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"192\" cy=\"112\" r=\"4.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"190.7\" cy=\"110.4\" r=\"1.4\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"216\" cy=\"118\" r=\"4.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"214.8\" cy=\"116.6\" r=\"1.3\" fill=\"var(--roe)\" opacity=\"1\"/><use href=\"#hook\" x=\"175\" y=\"30\" width=\"62\" height=\"161\" color=\"var(--dim)\"/><path d=\"M231 44 L231 122\" stroke=\"var(--dim)\" stroke-width=\"2.6\" stroke-linecap=\"round\" fill=\"none\"/><path class=\"draw\" d=\"M188.4 64 A26 8 0 0 0 223.6 64\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M182.0 72 A26 8 0 0 0 230.0 72\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M178.9 80 A26 8 0 0 0 233.1 80\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><text x=\"262\" y=\"70\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">work down</text><path d=\"M276 80 L276 112\" stroke=\"var(--accent)\" stroke-width=\"2\" fill=\"none\" marker-end=\"url(#ar-a)\"/></g><g class=\"kstep\" data-step=\"4\" data-cap=\"Keep going to <b>eight or ten wraps</b> total. The chunk should look laced on, not squeezed. If roe is oozing out between wraps you are pulling too hard.\"><path d=\"M206 8 L206 36\" stroke=\"var(--dim)\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/><ellipse cx=\"206\" cy=\"88\" rx=\"26\" ry=\"30\" fill=\"var(--roe3)\" opacity=\"1\"/><circle cx=\"196\" cy=\"72\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"194.3\" cy=\"70.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"70\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"68.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"190\" cy=\"86\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"188.2\" cy=\"83.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"219\" cy=\"88\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"217.3\" cy=\"86.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"199\" cy=\"100\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"197.2\" cy=\"97.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"104\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"102.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"204\" cy=\"86\" r=\"6.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"202.1\" cy=\"83.7\" r=\"2.1\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"192\" cy=\"112\" r=\"4.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"190.7\" cy=\"110.4\" r=\"1.4\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"216\" cy=\"118\" r=\"4.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"214.8\" cy=\"116.6\" r=\"1.3\" fill=\"var(--roe)\" opacity=\"1\"/><use href=\"#hook\" x=\"175\" y=\"30\" width=\"62\" height=\"161\" color=\"var(--dim)\"/><path d=\"M231 44 L231 122\" stroke=\"var(--dim)\" stroke-width=\"2.6\" stroke-linecap=\"round\" fill=\"none\"/><path class=\"\" d=\"M188.4 64 A26 8 0 0 0 223.6 64\" fill=\"none\" stroke=\"var(--dim)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M182.0 72 A26 8 0 0 0 230.0 72\" fill=\"none\" stroke=\"var(--dim)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M178.9 80 A26 8 0 0 0 233.1 80\" fill=\"none\" stroke=\"var(--dim)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M178.0 88 A26 8 0 0 0 234.0 88\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M178.9 96 A26 8 0 0 0 233.1 96\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M182.0 104 A26 8 0 0 0 230.0 104\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M188.4 112 A26 8 0 0 0 223.6 112\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><text x=\"262\" y=\"92\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">8 to 10</text><text x=\"262\" y=\"112\" fill=\"var(--dim)\" font-size=\"13.5\">laced, not choked</text></g><g class=\"kstep\" data-step=\"5\" data-cap=\"Give the spool a <b>sharp tug</b>. The thread snaps and grips itself. There is no knot to tie and nothing to trim. That is the whole trick.\"><path d=\"M206 8 L206 36\" stroke=\"var(--dim)\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/><ellipse cx=\"206\" cy=\"88\" rx=\"26\" ry=\"30\" fill=\"var(--roe3)\" opacity=\"1\"/><circle cx=\"196\" cy=\"72\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"194.3\" cy=\"70.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"70\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"68.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"190\" cy=\"86\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"188.2\" cy=\"83.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"219\" cy=\"88\" r=\"5.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"217.3\" cy=\"86.1\" r=\"1.8\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"199\" cy=\"100\" r=\"6.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"197.2\" cy=\"97.9\" r=\"1.9\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"214\" cy=\"104\" r=\"5.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"212.5\" cy=\"102.2\" r=\"1.6\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"204\" cy=\"86\" r=\"6.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"202.1\" cy=\"83.7\" r=\"2.1\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"192\" cy=\"112\" r=\"4.5\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"190.7\" cy=\"110.4\" r=\"1.4\" fill=\"var(--roe)\" opacity=\"1\"/><circle cx=\"216\" cy=\"118\" r=\"4.0\" fill=\"var(--roe2)\" opacity=\"1\"/><circle cx=\"214.8\" cy=\"116.6\" r=\"1.3\" fill=\"var(--roe)\" opacity=\"1\"/><use href=\"#hook\" x=\"175\" y=\"30\" width=\"62\" height=\"161\" color=\"var(--dim)\"/><path class=\"\" d=\"M188.4 64 A26 8 0 0 0 223.6 64\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M182.0 72 A26 8 0 0 0 230.0 72\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M178.9 80 A26 8 0 0 0 233.1 80\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M178.0 88 A26 8 0 0 0 234.0 88\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M178.9 96 A26 8 0 0 0 233.1 96\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M182.0 104 A26 8 0 0 0 230.0 104\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path class=\"\" d=\"M188.4 112 A26 8 0 0 0 223.6 112\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path d=\"M231 44 L231 30\" stroke=\"var(--accent)\" stroke-width=\"2.6\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M237 26 L249 16\" stroke=\"var(--accent)\" stroke-width=\"2\" fill=\"none\" marker-end=\"url(#ar-a)\"/><text x=\"256\" y=\"22\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">tug</text><text x=\"262\" y=\"96\" fill=\"var(--go)\" font-size=\"15\" font-weight=\"600\">no knot</text><text x=\"262\" y=\"116\" fill=\"var(--dim)\" font-size=\"13.5\">nothing to trim</text></g></svg></div>\n<div class=\"bar\"><div class=\"rail\"></div><button class=\"play\" type=\"button\">Play</button></div>\n<figcaption class=\"cap\"></figcaption>\n</figure>\n<div class=\"box tip\"><b>What to ask for</b>Stretchy bait thread on a small spool. Atlas Mike&rsquo;s <strong>Magic Thread</strong> is the common one and it is the stretchy version. If the shop only has their <strong>Miracle Thread</strong>, that works too. Either spool lasts a season or three.</div>\n<div class=\"buy\"><a href=\"https://www.fishusa.com/Atlas-Magic-Thread-With-Dispenser/\" target=\"_blank\" rel=\"noopener\"><span class=\"n\"><b>Atlas Magic Thread, with dispenser</b><span>The one to get. Stretchy, self gripping, lasts seasons.</span></span><span class=\"p\">$4.99</span><span class=\"go\">&rsaquo;</span></a></div>\n<h4>Option 2. Spawn sacks</h4>\n<p class=\"when\">The bombproof answer. Netting holds the roe together so nothing can wash out, and the scent still leaks through. Tie a dozen at home the night before and the river is just reach, clip, fish.</p>\n<figure class=\"tyer\" data-steps=\"5\">\n<div class=\"stage\"><svg viewBox=\"0 0 420 250\" role=\"img\" aria-label=\"Tying a roe spawn sack from netting, five steps.\"><defs><marker id=\"ar-a2\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"5.5\" markerHeight=\"5.5\" orient=\"auto-start-reverse\"><path d=\"M0 0 L10 5 L0 10 z\" fill=\"var(--accent)\"/></marker></defs><g class=\"kstep\" data-step=\"1\" data-cap=\"Cut a <b>three inch square</b> of spawn netting. Bigger squares are far easier to handle than small ones, especially with cold hands.\"><clipPath id=\"netclip\"><rect x=\"146\" y=\"62\" width=\"124\" height=\"124\" rx=\"3\"/></clipPath><g clip-path=\"url(#netclip)\" opacity=\".55\"><path d=\"M36 50 L-14 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M36 50 L86 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M47 50 L-3 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M47 50 L97 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M58 50 L8 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M58 50 L108 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M69 50 L19 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M69 50 L119 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M80 50 L30 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M80 50 L130 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M91 50 L41 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M91 50 L141 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M102 50 L52 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M102 50 L152 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M113 50 L63 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M113 50 L163 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M124 50 L74 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M124 50 L174 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M135 50 L85 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M135 50 L185 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M146 50 L96 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M146 50 L196 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M157 50 L107 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M157 50 L207 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M168 50 L118 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M168 50 L218 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M179 50 L129 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M179 50 L229 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M190 50 L140 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M190 50 L240 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M201 50 L151 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M201 50 L251 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M212 50 L162 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M212 50 L262 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M223 50 L173 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M223 50 L273 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M234 50 L184 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M234 50 L284 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M245 50 L195 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M245 50 L295 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M256 50 L206 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M256 50 L306 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M267 50 L217 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M267 50 L317 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M278 50 L228 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M278 50 L328 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M289 50 L239 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M289 50 L339 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M300 50 L250 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M300 50 L350 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M311 50 L261 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M311 50 L361 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M322 50 L272 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M322 50 L372 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M333 50 L283 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M333 50 L383 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M344 50 L294 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M344 50 L394 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M355 50 L305 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M355 50 L405 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M366 50 L316 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M366 50 L416 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M377 50 L327 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M377 50 L427 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/></g><rect x=\"146\" y=\"62\" width=\"124\" height=\"124\" rx=\"3\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.4\"/><text x=\"290\" y=\"118\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">3 inches</text><text x=\"290\" y=\"138\" fill=\"var(--dim)\" font-size=\"13.5\">bigger is easier</text></g><g class=\"kstep\" data-step=\"2\" data-cap=\"Spoon a <b>dime size</b> pile of roe into the middle. Six to eight eggs. A sack bigger than a nickel casts like a rock and gets refused.\"><clipPath id=\"netclip\"><rect x=\"146\" y=\"62\" width=\"124\" height=\"124\" rx=\"3\"/></clipPath><g clip-path=\"url(#netclip)\" opacity=\".55\"><path d=\"M36 50 L-14 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M36 50 L86 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M47 50 L-3 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M47 50 L97 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M58 50 L8 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M58 50 L108 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M69 50 L19 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M69 50 L119 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M80 50 L30 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M80 50 L130 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M91 50 L41 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M91 50 L141 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M102 50 L52 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M102 50 L152 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M113 50 L63 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M113 50 L163 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M124 50 L74 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M124 50 L174 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M135 50 L85 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M135 50 L185 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M146 50 L96 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M146 50 L196 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M157 50 L107 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M157 50 L207 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M168 50 L118 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M168 50 L218 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M179 50 L129 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M179 50 L229 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M190 50 L140 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M190 50 L240 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M201 50 L151 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M201 50 L251 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M212 50 L162 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M212 50 L262 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M223 50 L173 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M223 50 L273 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M234 50 L184 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M234 50 L284 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M245 50 L195 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M245 50 L295 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M256 50 L206 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M256 50 L306 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M267 50 L217 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M267 50 L317 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M278 50 L228 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M278 50 L328 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M289 50 L239 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M289 50 L339 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M300 50 L250 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M300 50 L350 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M311 50 L261 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M311 50 L361 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M322 50 L272 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M322 50 L372 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M333 50 L283 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M333 50 L383 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M344 50 L294 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M344 50 L394 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M355 50 L305 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M355 50 L405 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M366 50 L316 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M366 50 L416 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M377 50 L327 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/><path d=\"M377 50 L427 200\" stroke=\"var(--line2)\" stroke-width=\"1.2\"/></g><rect x=\"146\" y=\"62\" width=\"124\" height=\"124\" rx=\"3\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2\"/><g class=\"draw-skip\"><circle cx=\"199\" cy=\"116\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"196.9\" cy=\"113.5\" r=\"2.2\" fill=\"var(--roe)\"/><circle cx=\"214\" cy=\"112\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"212.2\" cy=\"109.9\" r=\"1.9\" fill=\"var(--roe)\"/><circle cx=\"208\" cy=\"128\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"205.9\" cy=\"125.5\" r=\"2.2\" fill=\"var(--roe)\"/><circle cx=\"222\" cy=\"126\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"220.2\" cy=\"123.9\" r=\"1.9\" fill=\"var(--roe)\"/><circle cx=\"196\" cy=\"131\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"194.2\" cy=\"128.9\" r=\"1.9\" fill=\"var(--roe)\"/><circle cx=\"211\" cy=\"99\" r=\"5\" fill=\"var(--roe2)\"/><circle cx=\"209.5\" cy=\"97.2\" r=\"1.6\" fill=\"var(--roe)\"/></g><text x=\"290\" y=\"118\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">dime size</text><text x=\"290\" y=\"138\" fill=\"var(--dim)\" font-size=\"13.5\">6 to 8 eggs</text></g><g class=\"kstep\" data-step=\"3\" data-cap=\"Pick up <b>all four corners at once</b> and gather them straight up over the roe. Give it a half twist so it packs into a ball instead of a pancake.\"><ellipse cx=\"208\" cy=\"140\" rx=\"39\" ry=\"35\" fill=\"var(--roe3)\"/><circle cx=\"192\" cy=\"128\" r=\"8\" fill=\"var(--roe2)\"/><circle cx=\"189.6\" cy=\"125.2\" r=\"2.4\" fill=\"var(--roe)\"/><circle cx=\"220\" cy=\"124\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"217.9\" cy=\"121.5\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"204\" cy=\"148\" r=\"8\" fill=\"var(--roe2)\"/><circle cx=\"201.6\" cy=\"145.2\" r=\"2.4\" fill=\"var(--roe)\"/><circle cx=\"228\" cy=\"150\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"225.9\" cy=\"147.6\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"188\" cy=\"152\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"185.9\" cy=\"149.6\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"210\" cy=\"110\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"208.2\" cy=\"107.9\" r=\"1.8\" fill=\"var(--roe)\"/><circle cx=\"234\" cy=\"134\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"232.2\" cy=\"131.9\" r=\"1.8\" fill=\"var(--roe)\"/><path class=\"draw\" d=\"M208 82 C178 96 168 120 170 144\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"draw\" d=\"M208 82 C190 98 178 124 180 158\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"draw\" d=\"M208 82 C208 104 206 134 206 176\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"draw\" d=\"M208 82 C226 98 238 124 236 158\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"draw\" d=\"M208 82 C238 96 248 120 246 144\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"draw\" d=\"M170 132 Q208 146 246 132\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"draw\" d=\"M176 158 Q208 172 240 158\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"draw\" d=\"M172 112 Q208 124 244 112\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path d=\"M196 78 L186 46\" stroke=\"var(--accent)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M204 78 L200 44\" stroke=\"var(--accent)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M212 78 L217 44\" stroke=\"var(--accent)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M220 78 L231 46\" stroke=\"var(--accent)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M208 38 L208 20\" stroke=\"var(--accent)\" stroke-width=\"2\" fill=\"none\" marker-end=\"url(#ar-a2)\"/><text x=\"296\" y=\"104\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">all four</text><text x=\"296\" y=\"124\" fill=\"var(--dim)\" font-size=\"13.5\">half a twist</text></g><g class=\"kstep\" data-step=\"4\" data-cap=\"Pinch the neck <b>tight down against the roe</b> and wrap thread around it eight to ten times. Pinch close or the sack ends up loose and sloppy.\"><ellipse cx=\"208\" cy=\"140\" rx=\"39\" ry=\"35\" fill=\"var(--roe3)\"/><circle cx=\"192\" cy=\"128\" r=\"8\" fill=\"var(--roe2)\"/><circle cx=\"189.6\" cy=\"125.2\" r=\"2.4\" fill=\"var(--roe)\"/><circle cx=\"220\" cy=\"124\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"217.9\" cy=\"121.5\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"204\" cy=\"148\" r=\"8\" fill=\"var(--roe2)\"/><circle cx=\"201.6\" cy=\"145.2\" r=\"2.4\" fill=\"var(--roe)\"/><circle cx=\"228\" cy=\"150\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"225.9\" cy=\"147.6\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"188\" cy=\"152\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"185.9\" cy=\"149.6\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"210\" cy=\"110\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"208.2\" cy=\"107.9\" r=\"1.8\" fill=\"var(--roe)\"/><circle cx=\"234\" cy=\"134\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"232.2\" cy=\"131.9\" r=\"1.8\" fill=\"var(--roe)\"/><path class=\"\" d=\"M208 82 C178 96 168 120 170 144\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C190 98 178 124 180 158\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C208 104 206 134 206 176\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C226 98 238 124 236 158\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C238 96 248 120 246 144\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M170 132 Q208 146 246 132\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"\" d=\"M176 158 Q208 172 240 158\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"\" d=\"M172 112 Q208 124 244 112\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path d=\"M196 78 L186 46\" stroke=\"var(--line2)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M204 78 L200 44\" stroke=\"var(--line2)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M212 78 L217 44\" stroke=\"var(--line2)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M220 78 L231 46\" stroke=\"var(--line2)\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M195 86 A13 4.5 0 0 0 221 86\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M194 92 A13 4.5 0 0 0 222 92\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M193 98 A13 4.5 0 0 0 223 98\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path class=\"draw\" d=\"M192 104 A13 4.5 0 0 0 224 104\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><text x=\"296\" y=\"94\" fill=\"var(--accent)\" font-size=\"15\" font-weight=\"600\">8 to 10</text><text x=\"296\" y=\"114\" fill=\"var(--dim)\" font-size=\"13.5\">pinch it close</text></g><g class=\"kstep\" data-step=\"5\" data-cap=\"Trim the tails short. Hook it <b>once through the netting</b> at the neck, never through the eggs. Tie a dozen at the kitchen table the night before.\"><ellipse cx=\"208\" cy=\"140\" rx=\"39\" ry=\"35\" fill=\"var(--roe3)\"/><circle cx=\"192\" cy=\"128\" r=\"8\" fill=\"var(--roe2)\"/><circle cx=\"189.6\" cy=\"125.2\" r=\"2.4\" fill=\"var(--roe)\"/><circle cx=\"220\" cy=\"124\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"217.9\" cy=\"121.5\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"204\" cy=\"148\" r=\"8\" fill=\"var(--roe2)\"/><circle cx=\"201.6\" cy=\"145.2\" r=\"2.4\" fill=\"var(--roe)\"/><circle cx=\"228\" cy=\"150\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"225.9\" cy=\"147.6\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"188\" cy=\"152\" r=\"7\" fill=\"var(--roe2)\"/><circle cx=\"185.9\" cy=\"149.6\" r=\"2.1\" fill=\"var(--roe)\"/><circle cx=\"210\" cy=\"110\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"208.2\" cy=\"107.9\" r=\"1.8\" fill=\"var(--roe)\"/><circle cx=\"234\" cy=\"134\" r=\"6\" fill=\"var(--roe2)\"/><circle cx=\"232.2\" cy=\"131.9\" r=\"1.8\" fill=\"var(--roe)\"/><path class=\"\" d=\"M208 82 C178 96 168 120 170 144\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C190 98 178 124 180 158\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C208 104 206 134 206 176\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C226 98 238 124 236 158\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M208 82 C238 96 248 120 246 144\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".95\"/><path class=\"\" d=\"M170 132 Q208 146 246 132\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"\" d=\"M176 158 Q208 172 240 158\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"\" d=\"M172 112 Q208 124 244 112\" fill=\"none\" stroke=\"var(--line2)\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"\" d=\"M195 86 A13 4.5 0 0 0 221 86\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path class=\"\" d=\"M194 92 A13 4.5 0 0 0 222 92\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path class=\"\" d=\"M193 98 A13 4.5 0 0 0 223 98\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path class=\"\" d=\"M192 104 A13 4.5 0 0 0 224 104\" fill=\"none\" stroke=\"var(--ink2)\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path d=\"M200 80 L196 62\" stroke=\"var(--line2)\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M216 80 L221 62\" stroke=\"var(--line2)\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/><use href=\"#hook\" x=\"246\" y=\"52\" width=\"46\" height=\"120\" color=\"var(--accent)\"/><path d=\"M269 44 L269 58\" stroke=\"var(--rope)\" stroke-width=\"2.4\" fill=\"none\"/><path d=\"M296 92 L246 92\" stroke=\"var(--accent)\" stroke-width=\"1.8\" fill=\"none\" marker-end=\"url(#ar-a2)\"/><text x=\"300\" y=\"97\" fill=\"var(--accent)\" font-size=\"14.5\" font-weight=\"600\">netting</text><text x=\"300\" y=\"117\" fill=\"var(--dim)\" font-size=\"13\">not the eggs</text></g></svg></div>\n<div class=\"bar\"><div class=\"rail\"></div><button class=\"play\" type=\"button\">Play</button></div>\n<figcaption class=\"cap\"></figcaption>\n</figure>\n<div class=\"box tip\"><b>What to ask for</b>Spawn netting or spawn sack netting, in <strong>3 by 3 or 4 by 4 inch</strong> pre cut squares. Peach, pink or natural. Same spool of bait thread ties them.</div>\n<div class=\"buy\"><a href=\"https://www.fishusa.com/Redwing-Tackle-Precut-4x4-Spawn-Net/\" target=\"_blank\" rel=\"noopener\"><span class=\"n\"><b>Redwing Precut 4x4 Spawn Net</b><span>Already cut into squares. Easiest if you have never tied a sack.</span></span><span class=\"p\">$8.49</span><span class=\"go\">&rsaquo;</span></a><a href=\"https://www.fishusa.com/Atlas-Spawn-Netting/\" target=\"_blank\" rel=\"noopener\"><span class=\"n\"><b>Atlas Spawn Netting</b><span>Cheaper, comes as a sheet you cut yourself.</span></span><span class=\"p\">$3.79</span><span class=\"go\">&rsaquo;</span></a></div>\n<h4>Option 3. Buy the knot already tied</h4>\n<ol class=\"steps\">\n<li>Ask for <b>pre snelled egg loop hooks</b>, size 1/0. They hang on the peg wall with the leader and the loop already tied.</li>\n<li>Pull a little slack toward the hook and the <b>loop opens</b>. Slide the roe chunk under it.</li>\n<li>Pull the leader and the loop <b>clamps down</b> on the bait. Clip the swivel end to your rig and you are fishing.</li>\n</ol>\n<div class=\"buy\"><a href=\"https://gamakatsu.com/product/salmonsteelhead-leader/\" target=\"_blank\" rel=\"noopener\"><span class=\"n\"><b>Gamakatsu Salmon / Steelhead Leader</b><span>Egg loop already tied. Pick 1/0 on 15 lb. Pack of 3.</span></span><span class=\"p\">from $5.39</span><span class=\"go\">&rsaquo;</span></a></div>\n<div class=\"box tip\"><b>Trim them down</b>Those leaders come <strong>6 feet long</strong>. Cut back to the 18 to 24 inches the Float and eggs rig calls for and tie the cut end straight to your barrel swivel.</div>\n<div class=\"box tip\"><b>Worth doing anyway</b>Keep a card of these in the box even if you master the knot. Re tying an egg loop in the rain, in the dark, with cold hands is nobody&rsquo;s idea of fishing.</div>\n<h4>Option 4. The egg loop, finally explained</h4>\n<div class=\"box\"><b>The part nobody writes down</b>An egg loop is not a knot that grips bait. It is a <strong>snell with slack left in it</strong>. You pass the line through the eye, wrap down the shank, then pass it through the eye a second time. That second pass leaves a loose bight of line lying along the shank. That bight is the loop.<br><br>So the whole thing works on one rule. <strong>Pull the line toward your rod and the loop shrinks. Feed slack back toward the hook and it opens.</strong> You open it, slide roe under, then pull, and every pull after that only clamps it tighter. That is why it holds.</div>\n<div class=\"box law\"><b>Why it felt wrong</b>You were likely trying to make the loop with the tag end. The loop is made of the line that runs to your rod, which is why it tightens itself when a fish pulls. Nothing you did wrong, every diagram online leaves this out.</div>\n<p class=\"when\">Step by step version is on the Egg loop card. But fish the thread this week.</p>\n<div class=\"box tip\"><b>Firm the roe up</b>Lay the chunks on a paper towel, dust them with plain borax or Pautzke BorX O Fire, and leave them uncovered in the fridge overnight. The borax pulls water out and toughens the skin. Same roe, twice the casts.</div>\n<div class=\"buy\"><a href=\"https://www.fishusa.com/Pautzke-BorX-O-Fire-Cure/\" target=\"_blank\" rel=\"noopener\"><span class=\"n\"><b>Pautzke BorX O' Fire Cure</b><span>Borax cure. Firms the roe up and adds color.</span></span><span class=\"p\">$12.99</span><span class=\"go\">&rsaquo;</span></a></div>\n<div class=\"box tip\"><b>Lob it, do not throw it</b>Open the bail, swing the rig like a pendulum and let it sail. Side arm, slow, no snap at the end. Roe comes off at the start of a cast, not in the water.</div>\n<div class=\"box law\"><b>If coho still will not eat it</b>Fall coho go off eggs completely when they color up. Pink or chartreuse marabou jig under the same float, no bait at all. That is the Float and jig rig, and in low clear water it often beats roe outright.</div>"
          },
          {
            "id": "salmon-egg-loop",
            "tab": "Egg loop",
            "group": "before",
            "title": "Knot: egg loop",
            "body": "<p class=\"when\">Bait hooks only. The loop clamps a roe cluster so it does not fly off on the cast.</p>\n<figure class=\"tyer\" data-steps=\"4\">\n<div class=\"stage\">\n<svg viewBox=\"0 0 420 220\" role=\"img\" aria-label=\"Egg loop snell shown in four steps on a hook lying sideways.\">\n<defs>\n<g id=\"el-hook\">\n<path d=\"M60 78 H300\" stroke=\"var(--steel)\" stroke-width=\"6\" stroke-linecap=\"round\"/>\n<circle cx=\"54\" cy=\"78\" r=\"12\" fill=\"none\" stroke=\"var(--steel)\" stroke-width=\"5\"/>\n<path d=\"M300 78 C338 78 352 104 334 124 C318 142 288 138 280 118\" stroke=\"var(--steel)\" stroke-width=\"6\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M280 118 L272 104\" stroke=\"var(--steel)\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n</g>\n</defs>\n<g class=\"kstep\" data-step=\"1\" data-cap=\"Run the leader <b>through the eye from the point side</b>, and leave a long tag lying back along the shank.\">\n<use href=\"#el-hook\"/>\n<path class=\"draw\" d=\"M20 62 C38 60 50 64 66 66 H230\" stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\"/>\n<path class=\"draw\" d=\"M20 62 C38 60 50 64 66 66 H230\" stroke=\"var(--accent)\" stroke-width=\"4.6\" fill=\"none\" stroke-linecap=\"round\"/>\n<text x=\"24\" y=\"44\" font-size=\"13\" fill=\"var(--dim)\">leader</text>\n<text x=\"150\" y=\"182\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\" text-anchor=\"middle\">long tag lies down the shank</text>\n<path d=\"M150 172 L160 90\" stroke=\"var(--accent)\" stroke-width=\"1.6\" opacity=\".6\"/>\n</g>\n<g class=\"kstep\" data-step=\"2\" data-cap=\"Wrap the tag <b>eight to ten times down the shank</b>, trapping the leader underneath the wraps as you go.\">\n<use href=\"#el-hook\"/>\n<path d=\"M20 62 C38 60 50 64 66 66 H110\" stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\"/>\n<path d=\"M20 62 C38 60 50 64 66 66 H110\" stroke=\"var(--rope)\" stroke-width=\"4.6\" fill=\"none\" stroke-linecap=\"round\"/>\n<g class=\"draw\" stroke=\"var(--panel2)\" stroke-width=\"11\" fill=\"none\">\n<path d=\"M110 58 L122 94 M126 58 L138 94 M142 58 L154 94 M158 58 L170 94 M174 58 L186 94 M190 58 L202 94 M206 58 L218 94 M222 58 L234 94\"/>\n</g>\n<g class=\"draw\" stroke=\"var(--accent)\" stroke-width=\"4.4\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M110 58 L122 94 M126 58 L138 94 M142 58 L154 94 M158 58 L170 94 M174 58 L186 94 M190 58 L202 94 M206 58 L218 94 M222 58 L234 94\"/>\n</g>\n<text x=\"172\" y=\"40\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\" text-anchor=\"middle\">8 to 10 wraps</text>\n</g>\n<g class=\"kstep\" data-step=\"3\" data-cap=\"Take the tag <b>back up through the eye</b>, going the same direction as your first pass. Then pull the standing line and the wraps slide tight.\">\n<use href=\"#el-hook\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"11\" fill=\"none\">\n<path d=\"M110 58 L122 94 M126 58 L138 94 M142 58 L154 94 M158 58 L170 94 M174 58 L186 94 M190 58 L202 94 M206 58 L218 94 M222 58 L234 94\"/>\n</g>\n<g stroke=\"var(--rope)\" stroke-width=\"4.4\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M110 58 L122 94 M126 58 L138 94 M142 58 L154 94 M158 58 L170 94 M174 58 L186 94 M190 58 L202 94 M206 58 L218 94 M222 58 L234 94\"/>\n</g>\n<path class=\"draw\" d=\"M234 94 C240 126 180 142 120 134 C70 126 40 104 46 86\" stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\"/>\n<path class=\"draw\" d=\"M234 94 C240 126 180 142 120 134 C70 126 40 104 46 86\" stroke=\"var(--accent)\" stroke-width=\"4.6\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M46 86 L56 90 M46 86 L44 97\" stroke=\"var(--accent)\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/>\n<text x=\"150\" y=\"166\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\" text-anchor=\"middle\">back up through the eye</text>\n</g>\n<g class=\"kstep\" data-step=\"4\" data-cap=\"A <b>loop opens up</b> at the eye. Slide the roe into it and pull the standing line to clamp it down tight.\">\n<use href=\"#el-hook\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"11\" fill=\"none\">\n<path d=\"M110 58 L122 94 M126 58 L138 94 M142 58 L154 94 M158 58 L170 94 M174 58 L186 94 M190 58 L202 94 M206 58 L218 94 M222 58 L234 94\"/>\n</g>\n<g stroke=\"var(--rope)\" stroke-width=\"4.4\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M110 58 L122 94 M126 58 L138 94 M142 58 L154 94 M158 58 L170 94 M174 58 L186 94 M190 58 L202 94 M206 58 L218 94 M222 58 L234 94\"/>\n</g>\n<path class=\"draw\" d=\"M234 96 C244 136 170 158 112 148 C64 140 40 112 46 86\" stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\"/>\n<path class=\"draw\" d=\"M234 96 C244 136 170 158 112 148 C64 140 40 112 46 86\" stroke=\"var(--rope)\" stroke-width=\"4.6\" fill=\"none\" stroke-linecap=\"round\"/>\n<g>\n<circle cx=\"132\" cy=\"124\" r=\"15\" fill=\"var(--lure2)\"/><circle cx=\"160\" cy=\"132\" r=\"16\" fill=\"var(--lure)\"/>\n<circle cx=\"188\" cy=\"122\" r=\"14\" fill=\"var(--lure2)\"/><circle cx=\"160\" cy=\"106\" r=\"13\" fill=\"var(--lure)\"/>\n<circle cx=\"112\" cy=\"110\" r=\"11\" fill=\"var(--lure)\"/>\n<circle cx=\"126\" cy=\"118\" r=\"4\" fill=\"var(--hi)\" opacity=\".35\"/><circle cx=\"154\" cy=\"126\" r=\"4.5\" fill=\"var(--hi)\" opacity=\".35\"/>\n</g>\n<text x=\"300\" y=\"176\" font-size=\"13\" fill=\"var(--go)\" font-weight=\"600\" text-anchor=\"middle\">roe sits inside the loop</text>\n<path d=\"M268 168 C236 160 210 150 196 142\" stroke=\"var(--go)\" stroke-width=\"1.8\" fill=\"none\"/>\n</g>\n</svg>\n</div>\n<div class=\"bar\"><div class=\"rail\"></div><button class=\"play\" type=\"button\">Play</button></div>\n<figcaption class=\"cap\"></figcaption>\n</figure>\n<a class=\"klink\" href=\"https://www.animatedknots.com/egg-loop-knot\" target=\"_blank\" rel=\"noopener\">Watch it animated <span>animatedknots.com</span></a>\n<div class=\"box tip\"><b>Shortcut on the egg loop</b>Pre snelled egg loop hooks come tied for a few bucks a pack. In the cold with wet hands they beat anything tied on the bank, and nobody is watching.</div>"
          },
          {
            "id": "salmon-float-jig-build",
            "tab": "Float + jig",
            "group": "before",
            "title": "Float and jig: build it",
            "diagram": "river-float-jig",
            "body": "<p class=\"when\">The simplest river rig. Four pieces, no weight, no swivel. Start here when you walk up on new water.</p>\n<div class=\"specs\">\n<div class=\"sp\"><div class=\"k\">Float</div><div class=\"v\">1/4 or 3/8</div></div>\n<div class=\"sp\"><div class=\"k\">Jig</div><div class=\"v\">1/4 oz</div></div>\n<div class=\"sp\"><div class=\"k\">Leader</div><div class=\"v\">none</div></div>\n<div class=\"sp\"><div class=\"k\">Depth</div><div class=\"v\">bottom<br>minus 12 in</div></div>\n</div>\n<ol class=\"steps\">\n<li>Thread on the <b>bobber stop</b>, then a <b>bead</b>, then the <b>float</b>. <span class=\"k\">stop and beads come in the float pack</span></li>\n<li>Tie the <b>jig straight to the main line</b>. That is the whole rig. <span class=\"k\">Non slip loop knot</span></li>\n<li>Use a loop knot, not a tight clinch. The loop lets the jig swing and breathe. That movement is the whole point of marabou.</li>\n<li>Set the stop so the jig hangs about <b>a foot off the bottom</b>.</li>\n</ol>"
          },
          {
            "id": "salmon-corky-build",
            "tab": "Corky",
            "group": "before",
            "title": "Corky and yarn: build it",
            "diagram": "river-corky",
            "body": "<p class=\"when\">Drift fishing. Faster water, broken water and anywhere a float will not track. The rig you already know.</p>\n<div class=\"specs\">\n<div class=\"sp\"><div class=\"k\">Weight</div><div class=\"v\">just enough<br>to tick</div></div>\n<div class=\"sp\"><div class=\"k\">Leader</div><div class=\"v\">24 to 36 in</div></div>\n<div class=\"sp\"><div class=\"k\">Corky</div><div class=\"v\">size 12 or 14</div></div>\n<div class=\"sp\"><div class=\"k\">Hook</div><div class=\"v\">1/0 single</div></div>\n</div>\n<ol class=\"steps\">\n<li>Slide a <b>snap or slider</b> onto the main line, or tie a short dropper. This carries the lead.</li>\n<li>Tie the main line to the top of a <b>barrel swivel</b>. <span class=\"k\">Improved clinch</span></li>\n<li>Hang <b>pencil lead or a slinky</b> from the snap. Use the lightest weight that still taps bottom every few seconds.</li>\n<li>Tie <b>24 to 36 inches</b> of leader to the bottom of the swivel. <span class=\"k\">Improved clinch</span></li>\n<li>Thread a <b>Corky</b> onto the leader, then tie the hook. The Corky rides right above the hook eye.</li>\n<li>Tie a few strands of <b>yarn</b> in at the hook eye. Work scent into it.</li>\n</ol>"
          },
          {
            "id": "salmon-blue-fox-build",
            "tab": "Blue Fox",
            "group": "before",
            "title": "Blue Fox: build it",
            "diagram": "river-blue-fox",
            "body": "<p class=\"when\">Covering water. When you do not know where they are, or when fish are moving instead of holding.</p>\n<div class=\"specs\">\n<div class=\"sp\"><div class=\"k\">Size</div><div class=\"v\">4 or 5</div></div>\n<div class=\"sp\"><div class=\"k\">Color</div><div class=\"v\">silver chart<br>or pink</div></div>\n<div class=\"sp\"><div class=\"k\">Hook</div><div class=\"v\">single<br>siwash</div></div>\n<div class=\"sp\"><div class=\"k\">Knot</div><div class=\"v\">clinch<br>to snap</div></div>\n</div>\n<div class=\"box red\"><b>Do this before you fish it</b>A Blue Fox comes with a treble hook. On the Green the anti snagging rule allows <strong>one single point hook</strong>, and a spinner is not a buoyant lure, so the treble is illegal here. Cut it off with pliers and hang a 2/0 single siwash on the back ring. Takes thirty seconds and it lands fish better anyway.</div>"
          },
          {
            "id": "salmon-float-eggs-fish",
            "tab": "Drift eggs",
            "group": "water",
            "title": "Float and eggs: fish it",
            "body": "<ol class=\"steps\">\n<li>Cast <b>upstream</b> of the slot, not across it. Let the float get down before it reaches the fish.</li>\n<li>Keep the rod tip high and the line off the water. The float should drift at the <b>same speed as the foam on the surface</b>.</li>\n<li>If the float drags or leans downstream, mend the line upstream.</li>\n<li>If the float never dips in six drifts, go <b>six inches deeper</b>.</li>\n</ol>\n<div class=\"bite\">\n<svg viewBox=\"0 0 60 60\" aria-hidden=\"true\">\n<rect x=\"0\" y=\"26\" width=\"60\" height=\"34\" fill=\"var(--water)\" opacity=\".4\"/>\n<g class=\"floatbob\">\n<path d=\"M30 4 L30 20\" stroke=\"var(--accent)\" stroke-width=\"4\" stroke-linecap=\"round\"/>\n<path d=\"M30 18 C37 21 38 26 36 32 L24 32 C22 26 23 21 30 18 Z\" fill=\"var(--accent)\"/>\n<path d=\"M24 32 L36 32 L31 56 C30.5 58 29.5 58 29 56 Z\" fill=\"var(--steel2)\"/>\n</g>\n</svg>\n<div class=\"t\"><b>The take</b>A coho bite is often a slow lean, not a slam. If the tip tips sideways or buries, swing. Do not wait for a second dip.</div>\n</div>\n<div class=\"box tip\"><b>If it is not working</b>Shorten up. In low clear water a 15 inch leader and one less shot outfishes a long soft setup.</div>\n<div class=\"box tip\"><b>Cured roe</b>Keep the jar on ice all day. Cut chunks about the size of a dime with scissors, lay the chunk in the egg loop, and snug the loop down over it. Re bait every six or eight drifts once it goes pale.</div>"
          },
          {
            "id": "salmon-float-jig-fish",
            "tab": "Drift a jig",
            "group": "water",
            "title": "Float and jig: fish it",
            "body": "<ol class=\"steps\">\n<li>Cast up and across. Let it drift <b>dead</b> with no action from you for the first few passes.</li>\n<li>If that gets nothing, add a <b>small twitch</b> every five or six feet of drift. Just enough to make the feathers pulse.</li>\n<li>Swing the float through the tailout and let it hang below you for a count of five before you pick up.</li>\n</ol>\n<div class=\"box tip\"><b>Why this one first</b>Nothing to re bait, nothing to re tie, and the jig stays in the strike zone the entire drift. If a slot holds a willing fish it usually shows itself in the first ten drifts.</div>"
          },
          {
            "id": "salmon-corky-fish",
            "tab": "Drift a corky",
            "group": "water",
            "title": "Corky and yarn: fish it",
            "body": "<ol class=\"steps\">\n<li>Cast across and slightly up. Follow the drift with the rod tip.</li>\n<li>You want a <b>tick, tick, tick</b> on the bottom. Constant dragging means too heavy. No contact at all means too light.</li>\n<li>A bite feels like the tapping <b>stops</b>, or goes soft and mushy. Set on anything that is not a rock.</li>\n</ol>\n<div class=\"box tip\"><b>Low clear water</b>Go smaller and longer. Size 12 Corky, 30 plus inch leader, and the least lead you can get away with.</div>"
          },
          {
            "id": "salmon-blue-fox-fish",
            "tab": "Swing a spinner",
            "group": "water",
            "title": "Blue Fox: fish it",
            "diagram": "river-blue-fox-swing",
            "body": "<ol class=\"steps\">\n<li>Cast <b>across and slightly downstream</b>, around 45 degrees. Not straight across.</li>\n<li>Reel just fast enough to <b>feel the blade thumping</b>. If you lose the thump, speed up a hair. That is the slowest it can go, and slow is what you want.</li>\n<li>Let the current <b>swing it</b> across the slot. Do not fight the belly in the line, let it pull the spinner around.</li>\n<li>Most grabs come at the end of the swing when the spinner slows and rises. <b>Stay on the handle</b> until it is right at your feet.</li>\n<li>Take two steps downstream and repeat. Work the whole run that way.</li>\n</ol>\n<div class=\"box tip\"><b>Color order</b>Start silver and chartreuse in the low clear water it is running now. Go pink if the sun gets on the water, and brass or copper if it clouds up late.</div>"
          },
          {
            "id": "green-river-rules",
            "tab": "River rules",
            "group": "before",
            "title": "Green River rules",
            "dated": "2026-11-17",
            "shelfDays": 180,
            "body": "<p class=\"when\">Rules for this river only. Regs change season to season, so this card goes off and tells you when.</p>\n<div class=\"box law\"><b>every rig, every day</b>One single point hook. Three quarter inch max from point to shank. No weight within 12 inches above the bait. Night closure, so you are off the water one hour after sunset.</div>\n<div class=\"box law\"><b>float and eggs</b>One single point hook, three quarter inch max from point to shank. No weight within 12 inches above the bait, which your 18 inch leader already handles. Barbs are fine here.</div>\n<div class=\"box law\"><b>float and jig</b>A jig is a lure with one single point hook and the weight is the jig head itself, so this rig is clean under the anti snagging rule. Keep the hook gap at three quarter inch or under.</div>\n<div class=\"box law\"><b>corky and yarn</b>One single point hook, three quarter inch max. The lead sits above the swivel, so a 24 inch leader keeps it well clear of the 12 inch rule. Corky plus added weight means the buoyant lure exception does not apply, so the single hook rule stands.</div>\n<div class=\"box\"><b>source</b>WDFW sport fishing rules. Check the current rules and any emergency changes before you go: <a href=\"https://wdfw.wa.gov/fishing/regulations\" target=\"_blank\" rel=\"noopener\">wdfw.wa.gov/fishing/regulations</a></div>"
          }
        ]
      },
      {
        "id": "dash-point",
        "name": "Dash Point",
        "where": "Tacoma, by kayak",
        "tideStation": {
          "id": "9446705",
          "name": "Dash Point",
          "milesAway": 0
        },
        "cards": [
          {
            "id": "dash-season",
            "tab": "Season",
            "group": "before",
            "title": "Is it open?",
            "dated": "2026-08-31",
            "shelfDays": 120,
            "body": "<p class=\"when\">Marine Area 11. Your home water goes dark for salmon all winter.</p><div class=\"box law\"><b>closed now</b>Salmon in Marine Area 11 is <strong>closed Nov 16 to Mar 30</strong>. It reopens Mar 31 to Apr 30, Wednesday to Saturday only: 2 salmon, no more than 1 Chinook, Chinook 22 inch minimum.</div><div class=\"box\"><b>winter salmon instead</b>Marine Area 13, south of the Narrows Bridge, is open year round for hatchery salmon. Steilacoom and Fox Island are the close access. It is a daylight weekend trip and the water is in the mid 40s, so it needs a wetsuit you do not own yet.</div><div class=\"box tip\"><b>check before every trip</b>Quotas close seasons early. Read the <a href=\"https://wdfw.wa.gov/fishing/regulations/emergency-rules\" target=\"_blank\" rel=\"noopener\">WDFW emergency rules</a> the week of the trip.</div>"
          },
          {
            "id": "dash-law",
            "tab": "Gear law",
            "group": "before",
            "title": "Gear law from the kayak",
            "dated": "2026-08-29",
            "shelfDays": 365,
            "body": "<p class=\"when\">Do these in the garage, not on the water.</p><ol class=\"steps\"><li>Swap every <b>treble</b> on Point Wilson Darts and Buzz Bombs for a <b>single siwash</b>. They ship illegal for salmon here.</li><li>Pinch every barb flat, jig heads included. <b>Barbless</b> is required for salmon in Areas 1 to 13 and for every species in Areas 5 to 13.</li><li>One line, no more than 2 hooks.</li><li>Pliers mounted on the boat, not the vest, within reach.</li></ol><div class=\"box law\"><b>never inside the gunwale</b>In Areas 5 to 13 it is illegal to bring a salmon you cannot keep inside the gunwale. On a kayak that is everywhere, so identify and unhook those fish <strong>in the water alongside</strong>. Never lift one aboard to check the fin.</div><div class=\"box\"><b>no night closure</b>Marine Area 11 is open 24 hours, so a pre dawn launch is legal. A white light is still required after dark.</div>"
          },
          {
            "id": "dash-where",
            "tab": "Where to sit",
            "group": "before",
            "title": "Where to anchor",
            "body": "<p class=\"when\">Launch at <strong>Dash Point Park and Pier</strong> on Beach Dr NE, not Dash Point State Park. The pier is closed, so the kayak is how you reach the drop.</p><div class=\"box\"><b>depth off the pier end</b>Measured on the line the pier points: pier end 30 ft, 25 yd out 51, 50 yd 74, 75 yd 93, 100 yd 105, 150 yd 117. It drops fast.</div><div class=\"box tip\"><b>coho lane</b>Coho travel the shoreline shallow. Anchor on the <strong>20 to 30 ft</strong> contour, about even with the pier end and 20 to 30 yards out. The kings run the drop near 100 yards out at 105 ft, which is too deep to anchor.</div><div class=\"box\"><b>tide math</b>Those depths are measured from mean sea level. Tide tables are from the lowest low. Real depth = the depth above + (the tide reading - 7.71 ft).</div>"
          },
          {
            "id": "dash-timing",
            "tab": "Tide + time",
            "group": "before",
            "title": "When to go",
            "body": "<p class=\"when\">Your window after work is about 4 to 5 PM, which here usually means fishing near high water.</p><div class=\"box\"><b>why the 150 ft rode</b>High water adds depth, and 3 times the depth has to fit on the rope. That is what the longer rode is for.</div><div class=\"box tip\"><b>launch on the early flood</b>Launching just after low tide means the water comes back toward you, so you land on a full beach. A big minus tide means a long drag across the flat.</div>"
          },
          {
            "id": "dash-coho",
            "tab": "Coho rig",
            "group": "water",
            "title": "Coho: hoochie and Buzz Bomb",
            "body": "<p class=\"when\">Mid August to the end of September, peak in September.</p><ol class=\"steps\"><li>Thread the leader <b>through the hoochie</b>, nose first. Then tie on the jig head. The skirt slides down and drapes over the ball and hook.</li><li>Do not stretch the skirt over the ball. Yours tear, even after boiling.</li><li>White or glow <b>3.5 to 4 inch</b> hoochie on a <b>3/8 to 3/4 oz</b> jig head. Or a <b>hot pink Buzz Bomb</b>.</li><li>Cast along the beach, not out to sea. Retrieve fast: <b>rip, rip, pause</b>. Coho eat bait that is running away.</li><li>Nothing in 45 minutes? Move <b>150 yards</b> along the same depth. Watch for jumpers and birds.</li></ol><div class=\"box tip\"><b>hoochies are for salt water</b>They do not go in the river. River rigs are under Green River.</div>"
          }
        ]
      }
    ]
  });

  // Two of the three knots are true for any fishing, so they join the course.
  RIG.content.fundamentals.push(
  {
    "id": "knot-improved-clinch",
      "tab": "Clinch knot",
    "group": "fundamental",
    "title": "Knot: improved clinch",
    "body": "<p class=\"when\">Line to swivel, line to hook, line to snap. The workhorse knot.</p>\n<figure class=\"tyer\" data-steps=\"5\">\n<div class=\"stage\">\n<svg viewBox=\"0 0 420 220\" role=\"img\" aria-label=\"Improved clinch knot shown in five steps.\">\n<defs>\n<g id=\"ic-eye\">\n<circle cx=\"352\" cy=\"110\" r=\"17\" fill=\"none\" stroke=\"var(--steel)\" stroke-width=\"5.5\"/>\n<path d=\"M369 110 H412\" stroke=\"var(--steel)\" stroke-width=\"5.5\" stroke-linecap=\"round\"/>\n</g>\n</defs>\n<!-- STEP 1 -->\n<g class=\"kstep\" data-step=\"1\" data-cap=\"Push the tag end <b>through the eye</b> and pull about eight inches through. That is all step one is.\">\n<use href=\"#ic-eye\"/>\n<path class=\"draw\" d=\"M14 110 H336\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M14 110 H336\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path class=\"draw\" d=\"M336 110 C366 104 376 132 356 146 C338 158 312 156 292 156 H120\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M336 110 C366 104 376 132 356 146 C338 158 312 156 292 156 H120\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<text x=\"120\" y=\"182\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\">tag end</text>\n<text x=\"20\" y=\"96\" font-size=\"13\" fill=\"var(--dim)\">standing line</text>\n</g>\n<!-- STEP 2 -->\n<g class=\"kstep\" data-step=\"2\" data-cap=\"Twist the tag <b>five times</b> around the standing line, working away from the eye. Keep the coils neat and touching.\">\n<g opacity=\".34\" stroke=\"var(--rope)\" stroke-width=\"4.4\" fill=\"none\">\n<path d=\"M299 130 Q289 112 291 94\"/><path d=\"M269 130 Q259 112 261 94\"/>\n<path d=\"M239 130 Q229 112 231 94\"/><path d=\"M209 130 Q199 112 201 94\"/>\n</g>\n<use href=\"#ic-eye\"/>\n<path d=\"M14 110 H336\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M14 110 H336\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M336 110 C366 104 376 132 356 146 C348 152 338 154 330 154\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M336 110 C366 104 376 132 356 146 C348 152 338 154 330 154\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<g class=\"draw\" stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\">\n<path d=\"M321 130 C313 122 307 102 299 94 M291 130 C283 122 277 102 269 94 M261 130 C253 122 247 102 239 94 M231 130 C223 122 217 102 209 94 M201 130 C193 122 187 102 179 94\"/>\n</g>\n<g class=\"draw\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M321 130 C313 122 307 102 299 94 M291 130 C283 122 277 102 269 94 M261 130 C253 122 247 102 239 94 M231 130 C223 122 217 102 209 94 M201 130 C193 122 187 102 179 94\"/>\n</g>\n<path class=\"draw\" d=\"M179 94 C158 88 136 96 122 108\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<text x=\"250\" y=\"68\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\" text-anchor=\"middle\">5 turns</text>\n<path d=\"M250 74 L250 88\" stroke=\"var(--accent)\" stroke-width=\"1.6\"/>\n</g>\n<!-- STEP 3 -->\n<g class=\"kstep\" data-step=\"3\" data-cap=\"Bring the tag back and push it through the <b>small loop right next to the eye</b>. This is the loop your first pass made.\">\n<g opacity=\".3\" stroke=\"var(--rope)\" stroke-width=\"4.4\" fill=\"none\">\n<path d=\"M299 130 Q289 112 291 94\"/><path d=\"M269 130 Q259 112 261 94\"/>\n<path d=\"M239 130 Q229 112 231 94\"/><path d=\"M209 130 Q199 112 201 94\"/>\n</g>\n<use href=\"#ic-eye\"/>\n<path d=\"M14 110 H336\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M14 110 H336\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\">\n<path d=\"M336 110 C366 104 376 132 356 146 C348 152 338 154 330 154\"/>\n<path d=\"M321 130 C313 122 307 102 299 94 M291 130 C283 122 277 102 269 94 M261 130 C253 122 247 102 239 94 M231 130 C223 122 217 102 209 94 M201 130 C193 122 187 102 179 94\"/>\n</g>\n<g stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M336 110 C366 104 376 132 356 146 C348 152 338 154 330 154\"/>\n<path d=\"M321 130 C313 122 307 102 299 94 M291 130 C283 122 277 102 269 94 M261 130 C253 122 247 102 239 94 M231 130 C223 122 217 102 209 94 M201 130 C193 122 187 102 179 94\"/>\n</g>\n<path class=\"draw\" d=\"M179 94 C150 86 128 104 142 126 C158 150 258 170 330 152\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M179 94 C150 86 128 104 142 126 C158 150 258 170 330 152\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<circle cx=\"344\" cy=\"148\" r=\"15\" fill=\"none\" stroke=\"var(--go)\" stroke-width=\"2.4\" stroke-dasharray=\"4 4\"/>\n<text x=\"300\" y=\"200\" font-size=\"13\" fill=\"var(--go)\" font-weight=\"600\" text-anchor=\"middle\">through this small loop</text>\n<path d=\"M330 190 C342 180 344 170 344 164\" stroke=\"var(--go)\" stroke-width=\"1.8\" fill=\"none\"/>\n</g>\n<!-- STEP 4 -->\n<g class=\"kstep\" data-step=\"4\" data-cap=\"That move opened a <b>big loop</b>. Push the tag back through that one too. This second pass is the improved part, and it is what stops the knot slipping.\">\n<g opacity=\".3\" stroke=\"var(--rope)\" stroke-width=\"4.4\" fill=\"none\">\n<path d=\"M299 130 Q289 112 291 94\"/><path d=\"M269 130 Q259 112 261 94\"/>\n<path d=\"M239 130 Q229 112 231 94\"/><path d=\"M209 130 Q199 112 201 94\"/>\n</g>\n<use href=\"#ic-eye\"/>\n<path d=\"M14 110 H336\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M14 110 H336\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\">\n<path d=\"M336 110 C366 104 376 132 356 146 C348 152 338 154 330 154\"/>\n<path d=\"M321 130 C313 122 307 102 299 94 M291 130 C283 122 277 102 269 94 M261 130 C253 122 247 102 239 94 M231 130 C223 122 217 102 209 94 M201 130 C193 122 187 102 179 94\"/>\n<path d=\"M179 94 C150 86 128 104 142 126 C158 150 258 170 330 152\"/>\n</g>\n<g stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M336 110 C366 104 376 132 356 146 C348 152 338 154 330 154\"/>\n<path d=\"M321 130 C313 122 307 102 299 94 M291 130 C283 122 277 102 269 94 M261 130 C253 122 247 102 239 94 M231 130 C223 122 217 102 209 94 M201 130 C193 122 187 102 179 94\"/>\n<path d=\"M179 94 C150 86 128 104 142 126 C158 150 258 170 330 152\"/>\n</g>\n<path class=\"draw\" d=\"M330 152 C300 168 250 180 206 172 C176 166 170 146 186 140\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M330 152 C300 168 250 180 206 172 C176 166 170 146 186 140\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M186 140 L198 136 M186 140 L194 149\" stroke=\"var(--accent)\" stroke-width=\"3.4\" fill=\"none\" stroke-linecap=\"round\"/>\n<text x=\"206\" y=\"200\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\" text-anchor=\"middle\">back through the big loop</text>\n</g>\n<!-- STEP 5 -->\n<g class=\"kstep\" data-step=\"5\" data-cap=\"Wet it, pull the <b>standing line</b> slow and steady until the coils seat against the eye, then trim the tag close. Done.\">\n<use href=\"#ic-eye\"/>\n<path d=\"M14 110 H300\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M14 110 H300\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"11\" fill=\"none\">\n<path d=\"M300 122 C296 112 296 108 300 98 M312 122 C308 112 308 108 312 98 M324 122 C320 112 320 108 324 98\"/>\n</g>\n<g stroke=\"var(--rope)\" stroke-width=\"4.6\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M300 122 C296 112 296 108 300 98 M312 122 C308 112 308 108 312 98 M324 122 C320 112 320 108 324 98\"/>\n</g>\n<path d=\"M296 110 C312 104 330 104 336 110\" stroke=\"var(--rope)\" stroke-width=\"4.6\" fill=\"none\" opacity=\".4\"/>\n<path d=\"M330 118 L346 124\" stroke=\"var(--rope)\" stroke-width=\"4\" stroke-linecap=\"round\" opacity=\".7\"/>\n<g stroke=\"var(--go)\" stroke-width=\"2.4\" fill=\"none\">\n<path d=\"M110 76 H60\"/><path d=\"M70 69 L58 76 L70 83\"/>\n</g>\n<text x=\"118\" y=\"81\" font-size=\"13\" fill=\"var(--go)\" font-weight=\"600\">pull here, slow</text>\n<text x=\"352\" y=\"156\" font-size=\"12.5\" fill=\"var(--dim)\" text-anchor=\"middle\">trim</text>\n</g>\n</svg>\n</div>\n<div class=\"bar\">\n<div class=\"rail\"></div>\n<button class=\"play\" type=\"button\">Play</button>\n</div>\n<figcaption class=\"cap\"></figcaption>\n</figure>\n<a class=\"klink\" href=\"https://www.animatedknots.com/improved-clinch-knot\" target=\"_blank\" rel=\"noopener\">Watch it animated <span>animatedknots.com</span></a>\n<p class=\"when\">Tap through the steps. Grey is what you already did, orange is the move you are making now.</p>\n<div class=\"box tip\"><b>Before you pull any knot tight</b>Wet it. A dry knot burns the line as it cinches and breaks at about half strength. Spit on it and pull slow.</div>"
  },
  {
    "id": "knot-non-slip-loop",
      "tab": "Loop knot",
    "group": "fundamental",
    "title": "Knot: non slip loop",
    "body": "<p class=\"when\">Jigs and spinners. Leaves an open loop so the lure swings free instead of being choked tight against the eye.</p>\n<figure class=\"tyer\" data-steps=\"5\">\n<div class=\"stage\">\n<svg viewBox=\"0 0 420 220\" role=\"img\" aria-label=\"Non slip mono loop knot shown in five steps.\">\n<defs>\n<g id=\"ns-eye\">\n<circle cx=\"344\" cy=\"112\" r=\"17\" fill=\"none\" stroke=\"var(--steel)\" stroke-width=\"5.5\"/>\n<path d=\"M361 112 H410\" stroke=\"var(--steel)\" stroke-width=\"5.5\" stroke-linecap=\"round\"/>\n</g>\n<g id=\"ns-oh\">\n<path d=\"M14 112 H150\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M14 112 H150\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M150 112 C184 78 196 136 166 128\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M150 112 C184 78 196 136 166 128\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n</g>\n</defs>\n<g class=\"kstep\" data-step=\"1\" data-cap=\"Tie a <b>loose overhand knot</b> in the line about six inches from the end. Leave it open, do not tighten it.\">\n<path class=\"draw\" d=\"M14 112 H150\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M14 112 H150\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path class=\"draw\" d=\"M150 112 C184 78 196 136 166 128\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M150 112 C184 78 196 136 166 128\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<text x=\"176\" y=\"66\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\">loose overhand</text>\n<path d=\"M176 72 L172 92\" stroke=\"var(--accent)\" stroke-width=\"1.6\"/>\n</g>\n<g class=\"kstep\" data-step=\"2\" data-cap=\"Run the tag <b>through the hook eye</b>, then bring it straight back through that overhand knot.\">\n<use href=\"#ns-oh\"/><use href=\"#ns-eye\"/>\n<path class=\"draw\" d=\"M168 128 C220 158 300 156 330 126\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M168 128 C220 158 300 156 330 126\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path class=\"draw\" d=\"M330 100 C300 70 220 72 176 98\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M330 100 C300 70 220 72 176 98\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M176 98 L188 94 M176 98 L186 106\" stroke=\"var(--accent)\" stroke-width=\"3.2\" stroke-linecap=\"round\" fill=\"none\"/>\n<text x=\"252\" y=\"178\" font-size=\"13\" fill=\"var(--dim)\" text-anchor=\"middle\">through the eye, then back through the overhand</text>\n</g>\n<g class=\"kstep\" data-step=\"3\" data-cap=\"Wrap the tag <b>four times</b> around the standing line, going away from the hook.\">\n<use href=\"#ns-oh\"/><use href=\"#ns-eye\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\"><path d=\"M168 128 C220 158 300 156 330 126\"/></g>\n<g stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"><path d=\"M168 128 C220 158 300 156 330 126\"/></g>\n<path d=\"M330 100 C318 88 304 80 290 76\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<g class=\"draw\" stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\">\n<path d=\"M286 62 C278 70 272 86 264 94 M256 62 C248 70 242 86 234 94 M226 62 C218 70 212 86 204 94 M196 62 C188 70 182 86 174 94\"/>\n</g>\n<g class=\"draw\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M286 62 C278 70 272 86 264 94 M256 62 C248 70 242 86 234 94 M226 62 C218 70 212 86 204 94 M196 62 C188 70 182 86 174 94\"/>\n</g>\n<text x=\"230\" y=\"44\" font-size=\"13\" fill=\"var(--accent)\" font-weight=\"600\" text-anchor=\"middle\">4 turns</text>\n</g>\n<g class=\"kstep\" data-step=\"4\" data-cap=\"Bring the tag back through the <b>overhand knot one more time</b>, entering the same side it came out of. Get this side wrong and the knot will not hold.\">\n<use href=\"#ns-oh\"/><use href=\"#ns-eye\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"12\" fill=\"none\">\n<path d=\"M168 128 C220 158 300 156 330 126\"/>\n<path d=\"M286 62 C278 70 272 86 264 94 M256 62 C248 70 242 86 234 94 M226 62 C218 70 212 86 204 94 M196 62 C188 70 182 86 174 94\"/>\n</g>\n<g stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M168 128 C220 158 300 156 330 126\"/>\n<path d=\"M330 100 C318 88 304 80 290 76\"/>\n<path d=\"M286 62 C278 70 272 86 264 94 M256 62 C248 70 242 86 234 94 M226 62 C218 70 212 86 204 94 M196 62 C188 70 182 86 174 94\"/>\n</g>\n<path class=\"draw\" d=\"M174 94 C164 100 166 112 176 116\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path class=\"draw\" d=\"M174 94 C164 100 166 112 176 116\" stroke=\"var(--accent)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M176 116 L188 112 M176 116 L185 124\" stroke=\"var(--accent)\" stroke-width=\"3.2\" stroke-linecap=\"round\" fill=\"none\"/>\n<circle cx=\"170\" cy=\"110\" r=\"19\" fill=\"none\" stroke=\"var(--go)\" stroke-width=\"2.2\" stroke-dasharray=\"4 4\"/>\n<text x=\"110\" y=\"166\" font-size=\"13\" fill=\"var(--go)\" font-weight=\"600\">same side it exited</text>\n<path d=\"M140 158 C158 146 162 136 164 128\" stroke=\"var(--go)\" stroke-width=\"1.8\" fill=\"none\"/>\n</g>\n<g class=\"kstep\" data-step=\"5\" data-cap=\"Wet it. Pull the <b>tag first</b> to seat the turns, then the standing line. Leave the loop about the size of a pea.\">\n<use href=\"#ns-eye\"/>\n<path d=\"M14 112 H176\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M14 112 H176\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<g stroke=\"var(--panel2)\" stroke-width=\"11\" fill=\"none\">\n<path d=\"M180 104 C176 96 176 92 180 86 M192 104 C188 96 188 92 192 86 M204 104 C200 96 200 92 204 86\"/>\n</g>\n<g stroke=\"var(--rope)\" stroke-width=\"4.6\" fill=\"none\" stroke-linecap=\"round\">\n<path d=\"M180 104 C176 96 176 92 180 86 M192 104 C188 96 188 92 192 86 M204 104 C200 96 200 92 204 86\"/>\n</g>\n<path d=\"M206 112 C250 92 300 96 328 108\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M206 112 C250 92 300 96 328 108\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M206 116 C250 140 300 134 328 118\" stroke=\"var(--panel2)\" stroke-width=\"13\" fill=\"none\"/>\n<path d=\"M206 116 C250 140 300 134 328 118\" stroke=\"var(--rope)\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M206 112 C250 92 300 96 328 108 M206 116 C250 140 300 134 328 118\" fill=\"none\" stroke=\"var(--go)\" stroke-width=\"1.6\" opacity=\".5\"/>\n<text x=\"266\" y=\"174\" font-size=\"13\" fill=\"var(--go)\" font-weight=\"600\" text-anchor=\"middle\">loop stays open</text>\n<path d=\"M266 164 L266 142\" stroke=\"var(--go)\" stroke-width=\"1.6\"/>\n</g>\n</svg>\n</div>\n<div class=\"bar\"><div class=\"rail\"></div><button class=\"play\" type=\"button\">Play</button></div>\n<figcaption class=\"cap\"></figcaption>\n</figure>\n<a class=\"klink\" href=\"https://www.animatedknots.com/non-slip-mono-knot\" target=\"_blank\" rel=\"noopener\">Watch it animated <span>animatedknots.com</span></a>"
  }
  );

  // Species on top, 2026-11-21: Coach's kayak and lake fishing, from his own
  // trip notes. Bass and perch are new tabs; kayak cards join Learn.
  RIG.content.species.push({
    "id": "bass",
    "name": "Bass",
    "hint": "Lakes from the kayak, evening bite",
    "cards": [
      {
        "id": "bass-roostertail",
        "tab": "Rooster Tail",
        "group": "before",
        "title": "Chartreuse Rooster Tail",
        "body": "<p class=\"when\">Your confidence lure. It caught your Lake Fenwick largemouth from the kayak.</p><div class=\"box\"><b>exactly this one</b>Worden's Original Rooster Tail, <strong>chartreuse</strong>, <strong>1/8 oz</strong>. The 1/4 oz ones you own are too big for how you fish it.</div><div class=\"box tip\"><b>you keep running out</b>About $4 to $5 each at Bass Pro Tacoma, Sportsman's Warehouse, Walmart and Big 5. Buy them in fives.</div>"
      },
      {
        "id": "bass-wacky",
        "tab": "Wacky rig",
        "group": "before",
        "title": "Wacky rigged Dinger",
        "body": "<p class=\"when\">Spinning rod. For open edges.</p><ol class=\"steps\"><li>Hook the Dinger <b>once through the middle</b>, so both ends hang free.</li><li>Cast to the edge and let it <b>sink on slack line</b>. Both ends wobble as it falls.</li><li>Watch the line. Most bites come on the fall, and the line jumps or swims sideways.</li></ol>"
      },
      {
        "id": "bass-texas",
        "tab": "Texas rig",
        "group": "before",
        "title": "Texas rigged worm",
        "body": "<p class=\"when\">Baitcaster. For wood and stumps, because the hook point is buried and does not snag.</p><ol class=\"steps\"><li>Slide a <b>1/8 oz bullet weight</b> on the line, pointed end toward the rod.</li><li>Tie on a <b>3/0 EWG</b> hook.</li><li>Push the hook point into the head of a <b>green worm</b>, bring it out a quarter inch down, and pull the hook through until the eye sits in the head.</li><li>Turn the hook and bury the point back into the worm body so the worm hangs straight.</li></ol><div class=\"box tip\"><b>where it came from</b>Your Arizona buddy's hot rig: a green worm, Texas rigged.</div>"
      },
      {
        "id": "bass-gear",
        "tab": "Rods",
        "group": "before",
        "title": "Which rod",
        "body": "<p class=\"when\">What is in the garage today.</p><div class=\"box\"><b>spinning</b>Valor 7 ft medium heavy with 15 lb mono. Runs the Rooster Tail and the wacky rig.</div><div class=\"box\"><b>baitcaster</b>Abu Garcia Black Max 6 ft 6 in medium. Since September it is spooled with 20 lb mono for salmon and river work. Re spool it if it becomes the Texas rig rod again.</div><div class=\"box law\"><b>still to confirm</b>Which rod you actually reach for on a bass evening. Tell me and this card gets set.</div>"
      },
      {
        "id": "bass-regs",
        "tab": "Rules",
        "group": "before",
        "title": "Rules",
        "dated": "2026-11-21",
        "shelfDays": 180,
        "body": "<p class=\"when\">Bass limits for the lake you are on.</p><div class=\"box law\"><b>not pulled in yet</b>I have not checked current bass limits, so there are no numbers here. Look up the lake at <a href=\"https://wdfw.wa.gov/fishing/regulations\" target=\"_blank\" rel=\"noopener\">wdfw.wa.gov/fishing/regulations</a> before you keep anything. For catch and release, a fishing license is all you need.</div>"
      }
    ],
    "locations": [
      {
        "id": "lake-fenwick",
        "name": "Lake Fenwick",
        "where": "Kent, WA",
        "cards": [
          {
            "id": "fenwick-notes",
            "tab": "Fenwick",
            "group": "before",
            "title": "What happened here",
            "body": "<p class=\"when\">Fished 2026-08-08: evening, overcast, glassy.</p><div class=\"box\"><b>what worked</b>Largemouth on the chartreuse Rooster Tail, landed and netted solo from the 12 footer. The boat felt rock steady.</div><div class=\"box law\"><b>still to confirm</b>Where you launched and parked. Tell me and this card gets filled in.</div>"
          }
        ]
      }
    ]
  },
  {
    "id": "perch",
    "name": "Perch and trout",
    "hint": "Winter lakes, anchor and drop",
    "cards": [
      {
        "id": "perch-winter",
        "tab": "Winter perch",
        "group": "before",
        "title": "How winter perch work",
        "body": "<p class=\"when\">Anchor, drop, catch. The kind of fishing you like.</p><div class=\"box\"><b>where they are</b>In winter yellow perch school <strong>deep, 20 to 40 ft</strong>, and bite all day. Find one and there are dozens.</div><ol class=\"steps\"><li>Anchor over the depth. Use the scope drill in Learn, Kayak.</li><li>Drop a small jig tipped with a bit of worm to the bottom, then lift a few inches.</li><li>No bite in 15 minutes? Move and try again. You are looking for the school, not waiting for it.</li></ol><div class=\"box tip\"><b>starting point</b>This rig is the standard approach. You have not fished it yet, so change the card once you have.</div>"
      },
      {
        "id": "trout-plants",
        "tab": "Jumbo trout",
        "group": "before",
        "title": "Jumbo trout plants",
        "body": "<p class=\"when\">WDFW stocks big trout in the fall, including a Black Friday push.</p><div class=\"box\"><b>what gets planted</b>Jumbo trout, 14 to 17 inches, 1 to 3 lb.</div><div class=\"box tip\"><b>check where they went</b>The stocking report says which lake got fish and when: <a href=\"https://wdfw.wa.gov/fishing/reports/stocking/trout-plants\" target=\"_blank\" rel=\"noopener\">WDFW trout plants</a>. Fish a lake in the days after a plant.</div><div class=\"box\"><b>lure</b>Your 1/8 oz Rooster Tail works on trout too.</div>"
      },
      {
        "id": "perch-regs",
        "tab": "Rules",
        "group": "before",
        "title": "Rules",
        "dated": "2026-11-21",
        "shelfDays": 180,
        "body": "<p class=\"when\">Lowland lakes in Washington are open year round, except for a specific list that opens in late April.</p><div class=\"box law\"><b>limits not pulled in yet</b>I have not checked current perch or trout limits, so there are no numbers here. Look the lake up at <a href=\"https://wdfw.wa.gov/fishing/regulations\" target=\"_blank\" rel=\"noopener\">wdfw.wa.gov/fishing/regulations</a>.</div>"
      }
    ],
    "locations": [
      {
        "id": "lake-fenwick",
        "name": "Lake Fenwick",
        "where": "Kent, WA",
        "cards": [
          {
            "id": "fenwick-perch",
            "tab": "Fenwick",
            "group": "before",
            "title": "Lake Fenwick",
            "body": "<p class=\"when\">You have fished it. It has 8 to 10 inch perch.</p>"
          }
        ]
      },
      {
        "id": "american-lake",
        "name": "American Lake",
        "where": "Lakewood, WA",
        "cards": [
          {
            "id": "american-launch",
            "tab": "Launch",
            "group": "before",
            "title": "American Lake",
            "body": "<p class=\"when\">Paved two lane ramp. Big water, so it is a calm day pick.</p>"
          }
        ]
      },
      {
        "id": "lake-tapps",
        "name": "Lake Tapps",
        "where": "Bonney Lake, WA",
        "cards": [
          {
            "id": "tapps-launch",
            "tab": "Launch",
            "group": "before",
            "title": "Launching on Lake Tapps",
            "dated": "2026-08-07",
            "shelfDays": 120,
            "body": "<p class=\"when\">Your first float and re entry drill were here, 2026-08-07.</p><div class=\"box law\"><b>allan yorke ramp</b>Closed 2026-07-27 because the lake was drawn down, with no reopen date. It also needs a Bonney Lake resident pass, $43.80 a vehicle.</div><div class=\"box tip\"><b>driftwood point</b>Worked on 2026-08-07 even with the drawdown.</div>"
          }
        ]
      }
    ]
  });
  RIG.content.fundamentals.push({
    "id": "kayak-gonogo",
    "tab": "Go / no-go",
    "group": "fundamental",
    "title": "Go or no go",
    "section": "Kayak",
    "body": "<p class=\"when\">Decide at home, not at the ramp.</p><ol class=\"steps\"><li>Wind <b>under 10 kt</b>. No whitecaps.</li><li>No Small Craft Advisory for zone PZZ135 on salt water.</li><li>Salt water needs a wetsuit. You do not own one yet. Buy XL or bigger before any winter trip on the Sound.</li><li>Dark by about 4:20 PM in winter. After sunset you need a white light shown all round.</li></ol><div class=\"box tip\"><b>on the water</b>Bow into waves and wakes. PFD on, always. Rinse the reels after salt water.</div>"
  },
  {
    "id": "kayak-load",
    "tab": "Load the car",
    "group": "fundamental",
    "title": "Loading the car",
    "section": "Kayak",
    "body": "<ol class=\"steps\"><li>Put the cart on <b>at the car</b>, with the boat empty. Stand alongside, roll the hull onto its edge, prop it on your thigh, slide the pegs into the scuppers, lower it onto the wheels.</li><li>Load the gear, then wheel it down full. One unload at the water instead of eight.</li><li>Cam buckles sit <b>low on the side rail on your side</b>, never on top of the hull. Feed the tail up from underneath. No twists.</li><li>Both boats fit on the Explorer roof. Proven on 2026-09-06.</li></ol><div class=\"box tip\"><b>half second check</b>Tape mark on the bow where it crosses the windshield line, and a mark on the strap where the buckle sits tight. Marks lined up means nothing moved.</div><div class=\"box law\"><b>not on the roller</b>No towel or pad on the suction roller. It kills the suction and stops it rolling.</div>"
  },
  {
    "id": "kayak-pack",
    "tab": "Packing",
    "group": "fundamental",
    "title": "Two zone packing",
    "section": "Kayak",
    "body": "<div class=\"box\"><b>behind the seat</b>Only what you never touch on the water: the anchor bucket, the dry bag, spare tackle.</div><div class=\"box\"><b>between your feet</b>Everything in use: pliers, leader, lures. Lures stand point down in a foam strip in the tray, so they stay put in chop and you can see them all.</div><div class=\"box law\"><b>in the car</b>The backpack. Thrown in the crate it buries the anchor and you cannot reach anything.</div>"
  },
  {
    "id": "kayak-anchor",
    "tab": "Anchor",
    "group": "fundamental",
    "title": "Anchor and scope",
    "section": "Kayak",
    "body": "<div class=\"box\"><b>the bucket</b>A 2 gallon bucket with drain holes. Flake the line in loose on the way up, fold the grapnel on top. It pays back out with no tangles and no hands.</div><div class=\"box\"><b>depth marks</b>Sharpie bands every <strong>25 ft</strong>: 1 band 25, 2 bands 50, 3 bands 75, 4 bands 100, 5 bands 125.</div><ol class=\"steps\"><li>Let the anchor free fall. When the line goes slack it is on the bottom.</li><li>The last mark you passed is the depth.</li><li>Pay out <b>3 times</b> the depth, plus 10 ft if the tide is still coming in. Clip it at the trolley.</li><li>Never dump the whole rope. It makes a huge swing circle and slack on the surface. A falling tide never needs an adjustment, only a rising one.</li></ol><div class=\"box law\"><b>hard rules</b>Anchor from the bow or stern through the trolley, with the quick release float, <strong>never from the side</strong>. Never anchor in moving river water. In strong current, drift instead.</div><div class=\"box\"><b>the knots</b>Anchor hitch from rope to the last chain link, tag zip tied. Locked bowline at the float end.</div>"
  },
  {
    "id": "kayak-pfd",
    "tab": "PFD",
    "group": "fundamental",
    "title": "Inflatable PFD",
    "section": "Kayak",
    "body": "<ol class=\"steps\"><li>Run it <b>manual on lake days</b>. You sit in scupper water and an auto vest can fire from spray or rain.</li><li>Run it <b>auto on the Sound</b>.</li><li>Cylinder screwed in and the indicator green, or it is not a PFD.</li><li>Check the expiration date on the auto bobbin.</li><li>Never store it damp.</li></ol><div class=\"box tip\"><b>leak test</b>Blow it up by mouth and leave it overnight. Never waste a CO2 cartridge on a test.</div><div class=\"box\"><b>spare</b>The Ascend foam vest is the spare for whoever paddles the second boat.</div>"
  },
  {
    "id": "kayak-reentry",
    "tab": "Re-entry",
    "group": "fundamental",
    "title": "Re entry",
    "section": "Kayak",
    "body": "<p class=\"when\">Passed unassisted on Lake Tapps, 2026-08-07.</p><div class=\"box law\"><b>the rule</b>Nobody takes a boat onto the Sound until they have climbed back onto it from deep water, alone, on a warm lake first. Guests who have not done it fish the lakes.</div>"
  });
  // Learn sections, for the jump bar.
  RIG.content.fundamentals.forEach(function (c) {
    if (!c.section) c.section = /^knot-/.test(c.id) ? "Knots" : "Rods";
  });

  // Technique: real videos, each checked to exist on 2026-11-21. They go first,
  // because learning how the good anglers do it is what this tab is for.
  (function () {
    var sq = RIG.content.species.filter(function (s) { return s.id === "squid"; })[0];
    sq.cards = [
      {
        "id": "squid-watch-start",
        "tab": "Start here",
        "group": "technique",
        "title": "Start here: how it is done",
        "body": "<p class=\"when\">Watch these three in order. Then read the other squid cards, which are the same ideas cut down for the pier.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=pNq_W2CkACU\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Beginner's guide to jigs and pier etiquette</b><span class=\"by\">Anglers Unlimited</span><span class=\"why\">The newest and most complete. Gear, jigs and how to fish a crowded Puget Sound pier.</span></span><span class=\"len\">44 min<br>2025</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=mWihYbDc530\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>5 tips for catching more squid</b><span class=\"by\">Bashi Fishing</span><span class=\"why\">Timing, jig, rod, depth, and the jigging motion itself.</span></span><span class=\"len\">12 min<br>2019</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=v2TGVkpvM_A\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Puget Sound pier squid fishing</b><span class=\"by\">Holy Moly Outdoors</span><span class=\"why\">Which jigs to use and how to find squid at different piers.</span></span><span class=\"len\">14 min<br>2024</span></a></div><div class=\"box law\"><b>one line now</b>Most of these were filmed before 2026. The rule now is <strong>one line per person</strong>, up to 4 jigs on it. If a video shows two rods each, that is no longer legal.</div>"
      },
      {
        "id": "squid-watch-rig",
        "tab": "Rig videos",
        "group": "technique",
        "title": "Rigging, watched",
        "body": "<p class=\"when\">See the rig built before you build yours.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=s-oLfq_fUfw\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to set up for squid jigging</b><span class=\"by\">Sound Fishing</span><span class=\"why\">The exact Puget Sound setup, start to finish, in two minutes.</span></span><span class=\"len\">2 min<br>2018</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=OMR2eML1HHY\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Puget Sound squid rigging</b><span class=\"by\">Holy Moly Outdoors</span><span class=\"why\">Rigging in detail, from what to buy to tying it up.</span></span><span class=\"len\">13 min<br>2017</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=OCt2rA4ZOSU\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Jig types and rigging options</b><span class=\"by\">Holy Moly Outdoors</span><span class=\"why\">The different kinds of jigs and a few ways to rig them.</span></span><span class=\"len\">8 min<br>2014</span></a></div>"
      },
      {
        "id": "squid-watch-more",
        "tab": "Boat + Redondo",
        "group": "technique",
        "title": "From a boat, and at your pier",
        "body": "<p class=\"when\">For later: squid from a boat, and a night at Redondo, your spot.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=PgDUDgqxgQ0\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Winter squid jigging in downtown Seattle</b><span class=\"by\">Capt. Paul Kim, Fish PNW Guide Service</span><span class=\"why\">A licensed guide's tips for catching market squid from a boat.</span></span><span class=\"len\">6 min<br>2024</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=19-9JPmqPec\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Squid jigging at Redondo Beach, Des Moines</b><span class=\"by\">Tri Nguyen</span><span class=\"why\">A first night at Redondo, from a boat after dark.</span></span><span class=\"len\">7 min<br>2021</span></a></div>"
      }
    ].concat(sq.cards);
  })();

  // Technique videos for every species, each checked to exist on 2026-11-21.
  (function () {
    var add = [
      {
        "sp": "salmon",
        "loc": "green-river",
        "cards": [
          {
            "id": "river-watch-float",
            "tab": "Float videos",
            "group": "technique",
            "title": "Float fishing, watched",
            "body": "<p class=\"when\">Your main river rig. Start with the first one: it is a full lesson filmed on the water.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=AK2ZHCYv1rE\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to float fish for steelhead and salmon</b><span class=\"by\">Fish and Forage</span><span class=\"why\">An in depth beginner's guide, taught on the water while fishing.</span></span><span class=\"len\">16 min<br>2019</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=Kwh6YqjTfAc\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to float fish roe for river coho</b><span class=\"by\">The Fishing Doctors Adventures</span><span class=\"why\">Float and roe for coho, start to finish.</span></span><span class=\"len\">35 min<br>2024</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=s87YXbhwtxc\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to fish bobber and eggs for coho and Chinook</b><span class=\"by\">Addicted Fishing</span><span class=\"why\">The short version: how to work the drift once you are rigged.</span></span><span class=\"len\">3 min<br>2018</span></a></div>"
          },
          {
            "id": "river-watch-jig",
            "tab": "Jig + spinner",
            "group": "technique",
            "title": "Jigs and spinners, watched",
            "body": "<p class=\"when\">For when fish are not eating eggs, and for covering water.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=6uS6475qxnU\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Twitching jigs for coho</b><span class=\"by\">Spilt Milt Productions</span><span class=\"why\">Hand tied twitching jigs for river coho, explained in detail.</span></span><span class=\"len\">15 min<br>2019</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=alXfpmV9M5c\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to twitch jigs for salmon</b><span class=\"by\">Addicted Fishing</span><span class=\"why\">The twitch itself. There is no one right rhythm.</span></span><span class=\"len\">5 min<br>2018</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=zf_NdiPpFIk\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to fish the Blue Fox Vibrax</b><span class=\"by\">Rapala</span><span class=\"why\">The maker of the Blue Fox on running depth, the countdown, and changing speed.</span></span><span class=\"len\">6 min<br>2023</span></a></div><div class=\"box law\"><b>hooks on the Green</b>Spinners in videos come with trebles. On the Green you swap to one single point hook. See the Blue Fox build card.</div>"
          },
          {
            "id": "river-watch-drift",
            "tab": "Drift videos",
            "group": "technique",
            "title": "Corky and yarn, watched",
            "body": "<p class=\"when\">Drift fishing for faster water where a float will not track.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=xmYJ61asNsk\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Corky drifting setup</b><span class=\"by\">In And On The Net Fishing</span><span class=\"why\">How to tie the corky drift rig, in one minute.</span></span><span class=\"len\">1 min<br>2023</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=nD4J8W8ea0k\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Yarnies 101</b><span class=\"by\">Northwest Fishing</span><span class=\"why\">Making and rigging yarn for drifting.</span></span><span class=\"len\">6 min<br>2014</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=6U0CqUeu6no\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to peg a corky with a yarnie</b><span class=\"by\">Fishing The Odds</span><span class=\"why\">A corky pegged like a bead, for clear water.</span></span><span class=\"len\">10 min<br>2019</span></a></div>"
          }
        ]
      },
      {
        "sp": "salmon",
        "loc": "dash-point",
        "cards": [
          {
            "id": "dash-watch-jig",
            "tab": "Buzz Bomb",
            "group": "technique",
            "title": "Buzz Bombs and jigs, watched",
            "body": "<p class=\"when\">How to cast and work the jigs you own.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=tFYDY9wdY8A\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Buzz Bomb and Zzinger lures for coho</b><span class=\"by\">Buzzbomb Tackle</span><span class=\"why\">From the company that makes them: casting for coho from shore and a small boat.</span></span><span class=\"len\">7 min<br>2022</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=ejvKusmAtXw\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Buzz Bomb and Point Wilson Dart rigs</b><span class=\"by\">Steve Perdue</span><span class=\"why\">How to rig both jigs for kings, coho and pinks.</span></span><span class=\"len\">7 min<br>2024</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=Qy7bWZabPDs\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Coho chasing a Buzz Bomb</b><span class=\"by\">Westcoast Condition</span><span class=\"why\">One minute. A coho follows the jig to the surface over a bait ball at 45 ft.</span></span><span class=\"len\">1 min<br>2026</span></a></div><div class=\"box law\"><b>barbless here</b>These videos show the jigs with trebles. At Dash Point that is illegal for salmon. Single siwash, barb pinched, before you launch.</div>"
          },
          {
            "id": "dash-watch-kayak",
            "tab": "Shore + kayak",
            "group": "technique",
            "title": "From shore and from a kayak",
            "body": "<p class=\"when\">Coho in Puget Sound without a big boat.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=En9bgvweNKM\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Coho in Puget Sound: jigging from shore</b><span class=\"by\">ReelBlue Custom Rods</span><span class=\"why\">Jigging coho from the beach in Marine Area 13.</span></span><span class=\"len\">8 min<br>2021</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=BL6h6NJqBUs\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Resident coho from a kayak in winter</b><span class=\"by\">SeaWolf Fishing</span><span class=\"why\">Kayaks on Puget Sound in winter, after resident coho.</span></span><span class=\"len\">5 min<br>2021</span></a></div>"
          }
        ]
      },
      {
        "sp": "bass",
        "loc": null,
        "cards": [
          {
            "id": "bass-watch-wacky",
            "tab": "Wacky videos",
            "group": "technique",
            "title": "Wacky rig, watched",
            "body": "<p class=\"when\">Start here. The easiest way to catch bass on a soft plastic.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=Tv0CezMdfhU\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to catch bass on a wacky worm in 10 minutes</b><span class=\"by\">Wendell Fishing</span><span class=\"why\">How to rig, cast and fish it, for beginners.</span></span><span class=\"len\">11 min<br>2026</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=zG2xIq1qd3o\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to fish a wacky rig</b><span class=\"by\">Flukemaster</span><span class=\"why\">Several ways to fish a wacky Senko, from one of the best known bass teachers on YouTube.</span></span><span class=\"len\">16 min<br>2021</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=oXltsbQxCKM\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Wacky or Texas rig: when to use which</b><span class=\"by\">Bass University</span><span class=\"why\">Picking between your two rigs.</span></span><span class=\"len\">4 min<br>2020</span></a></div>"
          },
          {
            "id": "bass-watch-texas",
            "tab": "Texas videos",
            "group": "technique",
            "title": "Texas rig, watched",
            "body": "<p class=\"when\">For the wood and stumps.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=aCpi3zzlLIk\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Texas Rig 101</b><span class=\"by\">Realistic Fishing</span><span class=\"why\">The class version: how to rig it and how to fish it. Over half a million views.</span></span><span class=\"len\">15 min<br>2019</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=XszLJnons_0\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Texas rig fishing made easy</b><span class=\"by\">Wendell Fishing</span><span class=\"why\">Rigging and fishing it, for people new to bass.</span></span><span class=\"len\">6 min<br>2025</span></a></div>"
          }
        ]
      },
      {
        "sp": "perch",
        "loc": null,
        "cards": [
          {
            "id": "perch-watch",
            "tab": "Perch videos",
            "group": "technique",
            "title": "Perch, watched",
            "body": "<p class=\"when\">Jigging for perch. Most of this is from other lakes, but the jigging is the same.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=N_pxTEzzpqM\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to jig for perch</b><span class=\"by\">Westin Fishing</span><span class=\"why\">Jorgen Larsson's simple jigging motion, in two minutes.</span></span><span class=\"len\">2 min<br>2018</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=LMAF3NWW-ns\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Using artificial lures for perch</b><span class=\"by\">Getfishing</span><span class=\"why\">When perch want a jig and soft plastic instead of bait.</span></span><span class=\"len\">6 min<br>2020</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=CYCU2wkhdP8\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>2 jigging techniques for perch</b><span class=\"by\">Thundermist Lure Company</span><span class=\"why\">Two ways to work a jig for perch.</span></span><span class=\"len\">15 min<br>2025</span></a></div>"
          },
          {
            "id": "trout-watch",
            "tab": "Trout videos",
            "group": "technique",
            "title": "Stocked trout, watched",
            "body": "<p class=\"when\">For the days after a plant.</p><div class=\"vids\"><a class=\"vid\" href=\"https://www.youtube.com/watch?v=92Y737Czy0M\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>How to set up PowerBait for trout</b><span class=\"by\">Oregon Life</span><span class=\"why\">The bait rig for stocked trout, off the bottom.</span></span><span class=\"len\">17 min<br>2022</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=nIIag42aJxs\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Best PowerBait and setup for stocked trout</b><span class=\"by\">ReelBlue Custom Rods</span><span class=\"why\">Which PowerBait and how to rig it for lake trout plants.</span></span><span class=\"len\">24 min<br>2025</span></a><a class=\"vid\" href=\"https://www.youtube.com/watch?v=jC_VrRdo0fQ\" target=\"_blank\" rel=\"noopener\"><span class=\"play\" aria-hidden=\"true\"></span><span class=\"vt\"><b>Trout fishing with Rooster Tail spinners</b><span class=\"by\">Fish Hawk</span><span class=\"why\">Your Rooster Tail on trout. Filmed on a creek, same retrieve.</span></span><span class=\"len\">8 min<br>2024</span></a></div>"
          }
        ]
      }
    ];
    add.forEach(function (a) {
      var sp = RIG.content.species.filter(function (s) { return s.id === a.sp; })[0];
      var home = a.loc ? sp.locations.filter(function (l) { return l.id === a.loc; })[0] : sp;
      home.cards = a.cards.concat(home.cards);
    });
  })();
})();

// Spots: one entry per place, shared by every species fished there. Plain
// data with stable ids so it can move into CastAI as is. `types` drive the
// Water tab. A spot id matches the location id under each species.
(function () {
  "use strict";
  var RIG = window.RIG;
  RIG.content.types = [
    { id: "river", label: "River" },
    { id: "beach", label: "Beach" },
    { id: "lake", label: "Lake" },
    { id: "pier", label: "Pier" },
    { id: "kayak-lake", label: "Kayak lake" },
    { id: "kayak-sound", label: "Kayak sound" },
    { id: "fly", label: "Fly" }
  ];
  RIG.content.spots = [
    { id: "redondo", name: "Redondo Pier", where: "Des Moines, WA", types: ["pier"] },
    { id: "green-river", name: "Green River", where: "Flaming Geyser, Auburn", types: ["river"] },
    // The Puyallup (2026-11-27). Sumner and the 128th St E bridge are below
    // the Carbon River, the stretch with a salmon season. Orting is above
    // it: no salmon season, so no fish of its own here. Its rules are cards
    // on the spot itself (added with the salmon below), and `fish` is the
    // line its row says instead of a list of fish.
    { id: "puyallup-sumner", name: "Puyallup at Sumner", where: "Two-Rivers Point, Sumner", types: ["river"] },
    { id: "puyallup-128th", name: "Puyallup at 128th St E", where: "128th St E bridge, Pierce County", types: ["river"] },
    { id: "puyallup-orting", name: "Puyallup at Orting", where: "Calistoga Park, Orting", types: ["river"],
      fish: "Trout and game fish. No salmon",
      closed: { head: "No salmon here", line: "Salmon is closed above the Carbon River, all year." } },
    // The Dash Point pier is closed, so this spot is fished from the kayak.
    { id: "dash-point", name: "Dash Point", where: "Tacoma, WA", types: ["kayak-sound", "beach", "fly"] },
    { id: "lake-fenwick", name: "Lake Fenwick", where: "Kent, WA", types: ["lake"] },
    { id: "american-lake", name: "American Lake", where: "Lakewood, WA", types: ["kayak-lake"] },
    { id: "lake-tapps", name: "Lake Tapps", where: "Bonney Lake, WA", types: ["kayak-lake"] },
    { id: "westport", name: "Westport", where: "Westport, WA", types: ["pier", "beach"] },
    { id: "ocean-shores", name: "Ocean Shores beaches", where: "Copalis and Mocrocks, WA", types: ["beach"] }
  ];
})();

// Fly, crab, clams, surf perch and sea-run cutthroat. Added 2026-11-21.
// Rules come straight from WDFW pages read that day, and every video was
// checked to exist with YouTube's oEmbed before it went in.
(function () {
  "use strict";
  var RIG = window.RIG;
  function vid(id, title, by, why, len, yr) {
    return '<a class="vid" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener">' +
      '<span class="play" aria-hidden="true"></span><span class="vt"><b>' + title + '</b><span class="by">' + by +
      '</span><span class="why">' + why + '</span></span><span class="len">' + len + ' min<br>' + yr + '</span></a>';
  }
  function vids() { return '<div class="vids">' + [].slice.call(arguments).join("") + "</div>"; }
  function when(t) { return '<p class="when">' + t + "</p>"; }
  function box(kind, head, t) { return '<div class="box' + (kind ? " " + kind : "") + '"><b>' + head + "</b>" + t + "</div>"; }
  function steps() { return '<ol class="steps">' + [].slice.call(arguments).map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>"; }
  var WDFW_CRAB = '<a href="https://wdfw.wa.gov/fishing/shellfishing-regulations/crab" target="_blank" rel="noopener">WDFW crab seasons</a>';
  var WDFW_RAZOR = '<a href="https://wdfw.wa.gov/fishing/shellfish/razorclams/seasons_set.html" target="_blank" rel="noopener">WDFW razor clam page</a>';
  var WDFW_REGS = '<a href="https://wdfw.wa.gov/fishing/regulations" target="_blank" rel="noopener">wdfw.wa.gov/fishing/regulations</a>';

  // ---- Learn: Fly. From the July crash course for Coach and his dad. ----
  // Fundamentals may not name a fish, so this says "fish", never a species.
  var fly = [
    { id: "fly-idea", tab: "The big idea", title: "The line is the weight",
      body: when("A fly weighs nothing. The thick colored line is what you throw, and the fly goes wherever the line takes it.") +
        box("tip", "spin guy translation", "Casting with no lure at all, and a long whip of soft lead for line. That is why the cast goes back <strong>and</strong> forward: the line has to straighten behind you before it can load the rod.") },
    { id: "fly-gear", tab: "Your rod", title: "Your rod: 8 ft, 4 weight",
      body: when("Your combo: 8 foot, 4 weight, 4 piece, large arbor reel, floating line and a leader.") +
        box("", "4 weight", "The power class of the whole system. Rod, line and reel share the number and must match. A 4 is a small water rod: creeks, lakes, fish up to a couple of pounds.") +
        box("", "the reel", "Mostly a line holder. You strip line in by hand. The drag only matters on a bigger fish.") },
    { id: "fly-line", tab: "Line chain", title: "The line chain",
      body: when("Thick to thin, loud to invisible.") +
        steps("<b>Backing.</b> Thin braid under everything. Fills the spool.",
          "<b>Fly line.</b> Yours is WF4F: weight forward, 4 weight, floating. This is what you cast.",
          "<b>Leader.</b> About 9 ft of clear mono that tapers fine so the fly lands soft.",
          "<b>Tippet.</b> Fine line you add as the leader shortens. Bigger X number = thinner. One spool of <span class=\"k\">5X</span> covers a 4 weight.") +
        box("tip", "never cut the leader short", "The thick line landing near a fish is a garden hose on its head. The long clear leader is the buffer.") },
    { id: "fly-setup", tab: "Rig it", title: "Rig it up",
      body: when("Box to ready in five minutes.") +
        steps("Assemble: line up the dots, seat each joint with a gentle quarter twist.",
          "Reel on, handle on your cranking side, lock the rings.",
          "Double the fly line into a loop and push the <b>loop</b> through the guides. If you slip, it catches.",
          "Stretch the leader gently to pull out the coils.",
          "Tie the fly on with an improved clinch, same as always.") +
        vids(vid("CCONVJb8-SE", "How to set up a fly rod", "Orvis, Pete Kutzer", "Every step of rigging a first fly rod, start to finish.", 4, 2017)) },
    { id: "fly-cast", tab: "The cast", title: "The cast: stop at 10 and 2",
      body: when("The stops make the cast, not the swing. Thumb on top of the grip.") +
        steps("25 ft of line out in front of you, rod tip low.",
          "Lift, speed up, <b>stop</b> hard at 2 o'clock.",
          "Wait one beat. Say \"one Mississippi\". The line straightens behind you.",
          "Forward, speed up, <b>stop</b> at 10. Let the tip drift down as the line lands.") +
        vids(vid("oDJJ6W23gHw", "The basic fly cast", "Orvis, Pete Kutzer", "The three keys of the cast. Start here.", 4, 2012),
          vid("uNrFoFx2MMI", "The basic back cast", "Orvis, Pete Kutzer", "Why you watch your back cast, and where it should stop.", 3, 2012),
          vid("90kfmkxaOGs", "How to make your first cast", "Orvis, Pete Kutzer", "Getting line on the water so you have something to cast.", 1, 2017)) +
        box("tip", "false casts", "Two at most, then put it down. The fish are in the water, not the air.") },
    { id: "fly-roll", tab: "Roll cast", title: "Roll cast: no room behind you",
      body: when("Trees or a bank behind you. Washington makes you learn this one.") +
        steps("Draw the rod up and slightly back until the line hangs beside you in a \"D\".",
          "Pause.",
          "Crisp forward stroke, stop at 10. The line rolls out like a wheel.") +
        vids(vid("vHMfCJINGJM", "Making an accurate roll cast", "Orvis, Pete Kutzer", "Proper form, and how to aim it.", 3, 2017)) },
    { id: "fly-faults", tab: "Fix the cast", title: "When the cast goes wrong",
      body: when("Five faults, five fixes.") +
        steps("<b>Whip crack, fly gone.</b> You went forward too soon. Longer pause at 2.",
          "<b>Line piles up.</b> Wide lazy arc. Shrink the stroke, stop hard at 10 and 2.",
          "<b>Line slaps the water.</b> You aimed at it. Aim 3 ft above the water.",
          "<b>Line hits you.</b> Back cast dropping low. Stop at 2, tip high.",
          "<b>Little knots in the leader.</b> Rushing. Slow everything down a fifth.") },
    { id: "fly-water", tab: "On the water", title: "Strip, drift, mend, set",
      body: when("Your line hand now does what the reel used to do.") +
        steps("<b>Strip.</b> Line runs over the rod hand's pointer finger. Pull it in through that finger.",
          "<b>Dead drift.</b> Cast up and across at 45 degrees. The fly should float at the speed of the current, no wake.",
          "<b>Mend.</b> A lazy flip that throws the belly of the line upstream. Cast, mend once.",
          "<b>Set.</b> Lift the tip smoothly while pinching the line. Never a bass slam, fine tippet snaps.") +
        box("", "bigger fish", "Get the slack onto the reel, keep the tip up, and let the drag work.") },
    { id: "fly-flies", tab: "Flies", title: "Flies: three kinds",
      body: when("Start with these and you are covered.") +
        steps("<b>Dry fly.</b> Adult bug on top. Dead drift. Parachute Adams or Elk Hair Caddis, size 14 to 16.",
          "<b>Nymph.</b> Larva under the surface, most of what fish eat. Pheasant Tail, Hare's Ear, 14 to 16.",
          "<b>Streamer.</b> Minnow or leech. Cast and strip back, the closest thing to a lure. Woolly Bugger, 8 to 10, olive or black.") +
        box("tip", "first trip rig: dry dropper", "Elk Hair Caddis on top. Tie 18 inches of 5X off its hook bend and hang a Pheasant Tail under it. Two kinds of food at once.") },
    { id: "fly-practice", tab: "Yard practice", title: "Practice in the yard first",
      body: when("Twenty minutes a day. A tuft of yarn where the fly goes, no hook.") +
        steps("<b>Days 1 and 2.</b> 25 ft out, pick up and lay down, 50 reps. Say it: lift, stop, Mississippi, forward, stop.",
          "<b>Last 5 minutes.</b> Bucket lid at 25 ft. Land the yarn in it 5 times.",
          "<b>Day 3.</b> Two false casts, then shoot a little line on the last stop.") }
  ];
  fly.forEach(function (c) { c.group = "fundamental"; c.section = "Fly"; });
  RIG.content.fundamentals = RIG.content.fundamentals.concat(fly);

  // ---- Crab --------------------------------------------------------------
  RIG.content.species.push({
    id: "crab", name: "Crab", hint: "Dungeness and red rock, docks and pots",
    cards: [
      { id: "crab-watch", tab: "Watch", group: "technique", title: "How it is done",
        body: when("Pots, measuring, and the Westport docks.") +
          vids(vid("NKqVkicO75Q", "How to catch crabs: Dungeness and red rock", "Sound Fishing", "Setting a pot, then measuring and sexing what comes up.", 7, 2017),
            vid("z1qRIiQBQII", "How to measure your Dungeness crab", "PNW Salmon Center", "Where the gauge goes, so a short crab goes back.", 1, 2014),
            vid("697V55yBUAQ", "Measure with a crab gauge", "Fish Tacos Angling", "Gauge and male or female, in one minute.", 1, 2015),
            vid("kjIVfdd2t7I", "Westport Marina crabbing", "Every Bit Outdoors", "How and where to crab the Westport docks.", 11, 2022),
            vid("rFKfVu-wlAE", "Casting crab traps from a pier at Westport", "Peeling Line", "Snare traps on surf rods off Pier 20, and the best bait.", 21, 2023)) },
      { id: "crab-license", tab: "License", group: "before", title: "License and catch card", dated: "2026-11-21", shelfDays: 180,
        body: when("A shellfish license (or a combination license) for everyone crabbing.") +
          box("law", "puget sound adds two things", "A <strong>Puget Sound crab endorsement</strong> and a Dungeness <strong>catch record card</strong>, any age. After Labor Day it is the <strong>winter</strong> card, and you report it Jan 1 to Feb 1 even if you caught nothing.") +
          box("", "the coast", "No crab catch card at Westport or Ocean Shores. Red rock crab never needs one.") },
      { id: "crab-keep", tab: "Keep or not", group: "water", title: "Keep or throw back",
        body: when("Measure across the back, straight, in front of the points.") +
          steps("<b>Females:</b> always back. Wide round apron underneath.",
            "<b>Soft shell:</b> always back. It flexes when you squeeze.",
            "<b>Dungeness, Puget Sound:</b> males, 6 1/4 inches, 5 a day.",
            "<b>Dungeness, Westport:</b> males, 6 inches, 6 a day.",
            "<b>Red rock:</b> either sex, 5 inches, 6 a day.") +
          box("law", "keep the back shell", "Every kept crab keeps its back shell until you leave the water. Nothing may pierce the shell.") +
          '<p class="stamp">From the ' + WDFW_CRAB + ' area pages, 2026-11-21.</p>' },
      { id: "crab-gear", tab: "Gear rules", group: "before", title: "Pots, ring nets and buoys",
        body: when("Two units of crab gear per person. A pot, a ring net or a snare is one unit.") +
          steps("Unattended gear gets its own buoy: <b>half red, half white</b>, your first and last name and permanent address. No bleach or soda bottles.",
            "Every pot needs <b>rot cord</b>, plain cotton, so a lost pot lets crab out.",
            "From a boat or kayak, no setting or pulling from <b>1 hour after sunset to 1 hour before sunrise</b>.",
            "All gear out of the water by 1 hour after sunset on the last open day.") +
          box("tip", "from a dock", "A ring net or a snare on a rod is the light way in. You tend it, so it needs no buoy.") }
    ],
    locations: [
      { id: "westport", name: "Westport", where: "Westport, WA",
        cards: [{ id: "westport-crab", tab: "Open now", group: "before", title: "Westport: open every day", dated: "2026-11-21", shelfDays: 30,
          body: when("Marine Area 2. The marina docks are the classic spot.") +
            box("tip", "open", "Ring nets and snares: <strong>all year</strong>. Pots: <strong>Dec 1 to Sept 15</strong>.") +
            box("", "pair it", "The same drive covers razor clams and surf perch. Check the clam dig dates first.") +
            '<p class="stamp">' + WDFW_CRAB + "</p>" }] },
      { id: "dash-point", name: "Dash Point", where: "Tacoma, by kayak",
        cards: [{ id: "dash-crab", tab: "Status", group: "before", title: "Tacoma waters: closed", dated: "2026-11-21", shelfDays: 14,
          body: when("Marine Area 11, Tacoma and Vashon.") +
            box("red", "closed", "WDFW has not announced a winter season and says it may stay closed. Seattle (Area 10) is the same. Nothing goes in the water here until it opens.") +
            box("", "open nearby", "North Hood Canal (Area 12, north of Ayock Point) and Admiralty Inlet (Area 9) are open daily through Dec 31.") +
            '<p class="stamp">' + WDFW_CRAB + "</p>" }] }
    ]
  });

  // ---- Clams -------------------------------------------------------------
  RIG.content.species.push({
    id: "clams", name: "Clams", hint: "Razor clams on the coast, by the tide",
    cards: [
      { id: "clam-watch", tab: "Watch", group: "technique", title: "How it is done",
        body: when("Find the show, then dig fast. Razors pull down quickly.") +
          vids(vid("X7WqhresgTM", "Razor clams: getting started", "WDFW", "The whole kit: gun or shovel, container, license.", 1, 2023),
            vid("npJSGNmME1k", "The best way to find and dig razor clams", "SeaWolf Fishing", "Reading the sand, then the clam gun.", 10, 2021),
            vid("nK0rK1BVRpk", "How to dig razor clams in Washington", "Bad Ash Outdoors", "The shovel method, step by step.", 14, 2021),
            vid("_Vz33syzoVI", "Washington coast razor clamming in 2 minutes", "Northwest Fishing Life", "The short version. Angle the gun toward the ocean.", 2, 2025),
            vid("otGl8aPEClI", "Surf perch and razor clam digging", "Addicted Fishing", "One coast day doing both, the way you would.", 27, 2019)) },
      { id: "clam-rules", tab: "Rules", group: "before", title: "Razor clam rules", dated: "2026-11-21", shelfDays: 180,
        body: when("Everyone 16 and over needs a 2026-2027 license that covers razor clams.") +
          steps("<b>15 clams</b> a person a day.",
            "Keep the <b>first 15</b> you dig, any size, broken or not.",
            "Each digger uses <b>their own container</b>.",
            "Dig only on announced days and beaches. Evening digs run noon to midnight.") +
          '<p class="stamp">From the ' + WDFW_RAZOR + ", 2026-11-21.</p>" },
      { id: "clam-gear", tab: "Gear", group: "before", title: "What to bring",
        body: when("Nothing for this is in the garage yet.") +
          steps("Clam gun or clam shovel.",
            "A container for each person.",
            "Headlamp. Fall and winter digs are after dark.",
            "Waders or boots, and a rain shell.") +
          box("law", "surf", "Check the ocean forecast before you leave. WDFW warns about swells over 11 ft.") },
      { id: "clam-dig", tab: "The dig", group: "water", title: "Dig it",
        body: when("Best from 1 to 2 hours before low tide.") +
          steps("Walk the wet sand near the water. Look for a <b>show</b>: a dimple or keyhole.",
            "No shows? Pound the sand with the gun or shovel handle and watch.",
            "Gun: center it on the show, tilt it a little <b>toward the ocean</b>, work it down, thumb over the vent, pull.",
            "Shovel: blade on the ocean side of the show, straight down, pry back, reach in fast.") },
      { id: "clam-sound", tab: "Puget Sound", group: "before", title: "Puget Sound beaches", dated: "2026-11-21", shelfDays: 60,
        body: when("Steamers and butter clams on inland beaches have their own seasons, and many urban beaches are closed for pollution.") +
          box("red", "penrose point is closed", "Closed until further notice under a 2026 WDFW emergency rule.") +
          box("law", "two checks before any beach", 'The <a href="https://fortress.wa.gov/doh/biotoxin/biotoxin.html" target="_blank" rel="noopener">Department of Health shellfish safety map</a> for toxins and pollution, then the beach page on ' + WDFW_REGS + ".") }
    ],
    locations: [
      { id: "ocean-shores", name: "Copalis and Mocrocks", where: "Ocean Shores, WA",
        cards: [{ id: "razor-dates", tab: "Dig dates", group: "before", title: "Next digs", dated: "2026-11-21", shelfDays: 7,
          body: when("Low tide times. Dig the hour or two before.") +
            steps("<b>Tue Nov 24</b>, 6:02 pm, -1.7 ft, Mocrocks",
              "<b>Wed Nov 25</b>, 6:48 pm, -1.9 ft, Copalis",
              "<b>Thu Nov 26</b>, 7:35 pm, -1.8 ft, Copalis",
              "<b>Fri Nov 27</b>, 8:25 pm, -1.4 ft, Mocrocks",
              "<b>Sat Nov 28</b>, 9:18 pm, -0.8 ft, Mocrocks") +
            box("red", "long beach and twin harbors closed", "Toxin levels are too high. Closed until further notice.") +
            box("", "thin year", "WDFW counted fewer clams here this summer. Expect to move around and pound for shows.") +
            '<p class="stamp">' + WDFW_RAZOR + "</p>" }] }
    ]
  });

  // ---- Surf perch --------------------------------------------------------
  RIG.content.species.push({
    id: "surfperch", name: "Surf perch", hint: "Coast beaches with the surf rods",
    cards: [
      { id: "surf-watch", tab: "Watch", group: "technique", title: "How it is done",
        body: when("High low rig, bait in the trough, wait for the rap.") +
          vids(vid("Os5T50NSN1g", "Red tailed surf perch on shrimp", "ReelBlue Custom Rods", "A full Westport day, with the tips as he goes.", 21, 2022),
            vid("AfXe7-2HzmI", "Surf perch fishing, Ocean Shores", "Set The Hook Fishing", "First timers on the high low rig with 1 to 2 oz.", 7, 2025),
            vid("B_7eMH7P7S0", "Fall surf perch, Ocean Shores", "Yakfish Taco", "November, razor clam bait, a limit.", 7, 2024),
            vid("6f4CiHIUf3s", "Gulp sandworm vs clam necks", "Set The Hook Fishing", "Which bait got bit at Ocean Shores.", 8, 2026),
            vid("bPuICtBUwMQ", "Best surf perch spots, Westport", "ShanePingStyle", "Spots and a big redtail on the Westport coast.", 16, 2020)) },
      { id: "surf-rig", tab: "The rig", group: "before", title: "Rig: high low",
        body: when("Your two heavy surf rods are the right tool.") +
          steps("Sinker on the bottom, <b>1 to 2 oz</b> pyramid.",
            "Two dropper loops above it, a small hook on each.",
            "Bait: razor clam, shrimp, or Gulp sandworm.") +
          box("tip", "where", "Cast into the trough, the darker band of water between the waves.") },
      { id: "surf-rules", tab: "Rules", group: "before", title: "Rules", dated: "2026-11-23", shelfDays: 180,
        body: when("Open all year from the beach. 12 a day.") +
          steps("<b>12 surf perch a day</b>, no minimum size. Shiner perch: 15 a day.",
            "From the beach: open all year (Marine Area 2). By boat: second Saturday in March to third Saturday in October.",
            "Surf perch do not count toward the 9 bottomfish limit.",
            "A saltwater or combination license.") +
          box("law", "grays harbor is closed", "Inside Grays Harbor (Marine Area 2-2, east of the Buoy 13 line) is closed to all fishing since Oct 24, 2026, except the boat basins. The open ocean beaches are not in the closure. Fish the ocean side.") }
    ],
    locations: [
      { id: "ocean-shores", name: "Ocean Shores", where: "Ocean Shores, WA", cards: [] },
      { id: "westport", name: "Westport", where: "Westport, WA", cards: [] }
    ]
  });

  // ---- Sea-run cutthroat -------------------------------------------------
  RIG.content.species.push({
    id: "cutthroat", name: "Cutthroat", hint: "Sea-run, Puget Sound beaches, fly or spin",
    cards: [
      { id: "src-watch", tab: "Watch", group: "technique", title: "How it is done",
        body: when("Walk the beach, cast to moving water, strip a small fly.") +
          vids(vid("DrdmO6TneA0", "Puget Sound fly fishing: sea run cutthroat", "TightLines NW", "A favorite Sound beach, start to finish.", 10, 2026),
            vid("KcAyA5dlEOk", "Sea run cutthroat, Puget Sound", "Fungi On The Fly", "Fishing the strong outgoing tide.", 8, 2023),
            vid("djOQncYto5g", "Fly fishing the beaches of Puget Sound", "Nick Clayton", "A full beach day for cutthroat and resident coho.", 14, 2017),
            vid("sBzco9NsA5I", "6 must have flies for sea run cutthroat", "Gig Harbor Fly Shop", "The short list to buy.", 6, 2022),
            vid("dSiPfj3jZIU", "Leaders in the salt", "Nick Clayton", "How he builds his beach leader.", 12, 2017),
            vid("UbXCduvKzpw", "Rods for Puget Sound beach fishing", "Gig Harbor Fly Shop", "Rod and line weights for the beach and the kayak.", 3, 2018)) },
      { id: "src-rules", tab: "Rules", group: "before", title: "Catch and release", dated: "2026-11-21", shelfDays: 180,
        body: when("Every cutthroat goes back. That is how you fish anyway.") +
          box("law", "check the pamphlet", "The Marine Area 11 listing shows trout as catch and release, year round. Confirm in " + WDFW_REGS + ".") +
          box("tip", "handle", "Wet hands, keep it in the water, out quickly.") },
      { id: "src-gear", tab: "Your rod", group: "before", title: "Will the 4 weight do?",
        body: when("Yes on a calm day with small flies. Wind is the problem.") +
          box("", "what beach anglers use", "Mostly 5 to 7 weight rods, per the rod video. A floating line is fine to start.") }
    ],
    locations: [
      { id: "dash-point", name: "Dash Point beach", where: "Tacoma, WA",
        cards: [{ id: "dash-src", tab: "The beach", group: "before", title: "Your nearest Sound beach",
          body: when("Dash Point State Park has public beach. You know the water from the kayak.") +
            box("law", "not fished yet", "Nobody has fished cutthroat here for this card. Treat it as a first look.") }] }
    ]
  });
})();

// Salmon split into its kinds, plus steelhead. Coach, 2026-11-21: kings are
// nothing like coho on the Sound, but in the river the same corky setup works
// for both. So rigs that are true for every kind on a water are SHARED cards,
// written once in RIG.content.shared, and a species or location lists them
// by id (a string in a cards list is a reference to a shared card).
(function () {
  "use strict";
  var R = window.RIG.content;
  function vid(id, title, by, why, len, yr) {
    return '<a class="vid" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener">' +
      '<span class="play" aria-hidden="true"></span><span class="vt"><b>' + title + '</b><span class="by">' + by +
      '</span><span class="why">' + why + '</span></span><span class="len">' + len + ' min<br>' + yr + '</span></a>';
  }
  function vids() { return '<div class="vids">' + [].slice.call(arguments).join("") + "</div>"; }
  function when(t) { return '<p class="when">' + t + "</p>"; }
  function box(kind, head, t) { return '<div class="box' + (kind ? " " + kind : "") + '"><b>' + head + "</b>" + t + "</div>"; }
  function steps() { return '<ol class="steps">' + [].slice.call(arguments).map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>"; }
  var EMERG = '<a href="https://wdfw.wa.gov/fishing/regulations/emergency-rules" target="_blank" rel="noopener">WDFW emergency rules</a>';

  var at = R.species.map(function (s) { return s.id; }).indexOf("salmon");
  var sal = R.species[at];
  var green = sal.locations.filter(function (l) { return l.id === "green-river"; })[0];
  var dash = sal.locations.filter(function (l) { return l.id === "dash-point"; })[0];
  function pick(list, ids) { return list.filter(function (c) { return ids.indexOf(c.id) !== -1; }); }
  var SOUND = ["dash-season", "dash-law", "dash-where", "dash-timing"];
  var RIVER = green.cards.map(function (c) { return c.id; });
  R.shared = [].concat(sal.cards, green.cards, pick(dash.cards, SOUND));
  var cohoSalt = pick(dash.cards, ["dash-watch-jig", "dash-watch-kayak", "dash-coho"]);

  function river(extra) { return { id: "green-river", name: green.name, where: green.where, cards: RIVER.concat(extra || []) }; }
  function sound(extra) {
    return { id: "dash-point", name: dash.name, where: dash.where, tideStation: dash.tideStation, cards: (extra || []).concat(SOUND) };
  }

  // ---- The Puyallup (2026-11-27) ----------------------------------------
  // Two bank spots below the Carbon River, where the 2026-27 WDFW pamphlet
  // has a salmon season (the stretch from 400 ft above Clark's Creek to the
  // Carbon, catch record code 804), each a location for king, coho and pink
  // with the river rigs. Orting is above the Carbon: no salmon season, so it
  // is no salmon location. Its rules are on the spot itself (RIG.content.spots).
  // The river rigs, less what is written for the Green alone (its rules,
  // the Blue Fox cards and the jig videos that name it).
  var GREEN_ONLY = ["green-river-rules", "salmon-blue-fox-build", "salmon-blue-fox-fish", "river-watch-jig"];
  var PUY_RIVER = RIVER.filter(function (id) { return GREEN_ONLY.indexOf(id) === -1; });
  R.shared.push(
    { id: "puyallup-rules", tab: "River rules", group: "before", title: "Puyallup rules", dated: "2026-11-27", shelfDays: 180,
      // The pamphlet's stretches, top to bottom: "from Carbon River upstream"
      // (no salmon line), "from 400' upstream of Clark's Creek to Carbon
      // River" (Sumner and the 128th), "from 400' downstream to 400'
      // upstream of Clark's Creek: All species CLOSED WATERS.", and "from
      // the 11th St. Bridge to 400' downstream of Clark's", with the same
      // dates and rules as the stretch above Clark's Creek. Below the 11th
      // St. Bridge is not in this listing.
      body: when("From 400 ft above Clark's Creek up to the Carbon River: Aug 19 to Oct 31, 2026. Each year's dates come in that year's WDFW pamphlet.") +
        box("law", "closed days", "Sundays, Mondays and Tuesdays, Aug 19 to Sept 30. Open every day in October.") +
        box("", "salmon", "6 a day, no more than 2 adults. 12 inch minimum. Release chum and wild Chinook. Adults are kings 24 inches and up, coho 20, pinks and chum 12. Once you keep 2 adults, your salmon day is done.") +
        box("", "trout", "Aug 19 to Oct 31. Statewide size and daily limit. Release cutthroat and wild rainbow trout.") +
        box("law", "every rig", "Barbless hooks. Anti-snagging rule: one single point hook, 3/4 inch or less point to shank, at or below the lure or bait. No weight below the lure or bait, and none less than 12 inches above it. The one exception is a buoyant lure with no weight added to the line or lure: then up to three hooks on one line, still barbless.") +
        box("law", "night closure", "Off the water one hour after sunset, back on one hour before sunrise.") +
        box("law", "closed water", "The White River, all of it, is closed to salmon. So is the Puyallup from the Carbon River mouth upstream, Orting included. The Puyallup from 400 ft below to 400 ft above Clark's Creek: closed to all fishing.") +
        box("", "downstream", "From the 11th St Bridge to 400 ft below Clark's Creek: the same dates and rules. Below the 11th St Bridge is not in this listing.") +
        box("", "source", "2026-27 WDFW pamphlet, Puget Sound coastal rivers. Check the " + EMERG + " before you go.") },
    { id: "puyallup-sumner-spot", tab: "Two-Rivers Point", group: "before", title: "Two-Rivers Point, Sumner",
      body: when("The strip of land between the Puyallup and the White, just above where they join.") +
        box("law", "cast into the Puyallup", "Stand on the point and cast across the Puyallup. Never into the White behind you: it is closed to salmon.") +
        box("", "parking", "City of Sumner State Street Trailhead, 13114 63rd St E. Public parking and restrooms, the restrooms in daylight hours. The point is a few hundred feet west of the trailhead.") +
        box("law", "not confirmed", "The walking route from the trailhead to the point.") },
    { id: "puyallup-128th-spot", tab: "128th St E", group: "before", title: "The 128th St E bridge",
      body: when("About 3/4 mile below the Carbon River.") +
        box("law", "closed water upstream", "The Carbon River comes in about 3/4 mile upstream. Above it the Puyallup is closed to salmon all year. The Carbon itself opens Sept 1, Wednesday to Saturday only in September.") +
        box("", "one report", "In 2018 one angler saw two people fishing the river bed at the bridge.") +
        box("", "parking", "WDFW Weiss access, at the end of 116th St E, on the west bank about 3/4 mile below the bridge. Open to cars only in the fishing season. One unimproved ramp, no restrooms.") +
        box("law", "pass", "A Discover Pass, or the Vehicle Access Pass that comes free with an annual fishing license.") +
        box("law", "not confirmed", "Parking at the bridge itself, and which bank there is public. Stay off the private roads and farm fields.") }
  );
  function puyallup(id) {
    var s = R.spots.filter(function (x) { return x.id === id; })[0];
    return { id: id, name: s.name, where: s.where, cards: PUY_RIVER.concat([id + "-spot", "puyallup-rules"]) };
  }

  var king = {
    id: "king", name: "King", family: "salmon", hint: "Chinook. Deep on the drop, mooched herring",
    cards: ["salmon-license",
      { id: "king-watch", tab: "Watch", group: "technique", title: "Mooching, watched",
        body: when("Kings get a slow spinning herring on the drop, not a fast rip.") +
          vids(vid("9SE1CgzIFYw", "Mooching for kings", "Shawn Honeyager", "A Puget Sound mooching trip with a local captain.", 7, 2019),
            vid("B185ldIyDDk", "Plug cut herring for Puget Sound salmon", "WA Fish Quest", "Cut, brine and rig the herring.", 12, 2022),
            vid("tlW_YrT9lF0", "How to rig a cut plug herring", "Baranof Fishing Excursions", "Two hooks, step by step, in two minutes.", 2, 2021),
            vid("FzjeRoVVFYA", "Cut plug herring on a mooching rig", "Fishing Weekend Warrior", "Getting the spin right on the rig.", 14, 2015)) },
      { id: "king-vs-coho", tab: "Not a coho", group: "before", title: "Kings are not coho",
        body: when("Separate the two in your head and both get simpler.") +
          steps("<b>Kings</b> run deeper and farther out, over the drop.",
            "<b>Coho</b> run the shallow lane along the shoreline.",
            "<b>Kings</b> take a slow spinning herring. <b>Coho</b> chase a fast rip.") +
          box("tip", "your first king", "Mid August off Dash Point, anchored on the 35 to 40 ft band of the pier drop.") },
      { id: "king-mooch-build", tab: "Mooching rig", group: "before", title: "Mooching rig: build it",
        body: when("The banana sinker has a bead chain at both ends. That is the anti twist, so no extra swivel.") +
          steps("Main line to a snap swivel.",
            "Snap to the top bead chain of a <b>1/2 to 1 oz</b> banana sinker.",
            "Bottom bead chain to the leader: <b>5 to 8 ft</b> of 20 to 30 lb fluorocarbon.",
            "Two hooks in tandem, a hand's width apart, sized to the herring.") +
          box("law", "salt water", "Barbless, and no more than two hooks on the line.") },
      { id: "king-cutplug", tab: "Cut plug", group: "before", title: "Cut plug herring",
        body: when("Two angles on one cut. That is what makes it roll.") +
          steps("Cut the head off at an angle, top to bottom.",
            "Angle the same cut side to side, so one flank is longer than the other.",
            "Hook goes up through the body cavity and out the top of the cut.",
            "Pull it through the water. A tight even roll is right. Wobbling or flat means the cut is off.") },
      { id: "king-mooch-fish", tab: "Fish it", group: "water", title: "Mooch it",
        body: when("Drop it to the band, then let the bait do the work.") +
          steps("Free spool down to the depth the kings are on. Count the marks.",
            "Hold, or lift slowly a few feet and let it flutter back down.",
            "A bite is often a tap, then the line goes slack or heavy.",
            "Reel down until you feel weight, then lift. Do not jerk.") }],
    locations: [sound(), river([{ id: "king-river", tab: "On the river", group: "before", title: "Kings in the river",
      body: when("Same rigs as coho: the corky and the float. Your Puyallup day in August was kings and coho together.") +
        box("law", "check the stretch", "King seasons on a river are short and stretch by stretch. Read the " + EMERG + " for that river before you go.") }]), puyallup("puyallup-sumner"), puyallup("puyallup-128th")]
  };

  var coho = {
    id: "coho", name: "Coho", family: "salmon", hint: "Silvers. Shallow and fast on the Sound, corkies on the river",
    cards: ["salmon-license"],
    locations: [sound(cohoSalt), river([{ id: "coho-river", tab: "River coho", group: "water", title: "River coho",
      body: when("They move in pulses. Rain is the trigger.") +
        steps("Low clear water: fish move at night and first light, and hold tight to cover in the day.",
          "The first real fall rain pushes a fresh wave up from the salt. That is the best day to be there.",
          "Peg soft eggs with a toothpick: bottom egg 2 inches above the hook, the next a couple inches up.",
          "Hoochies stay home. They are salt water only.") }]), puyallup("puyallup-sumner"), puyallup("puyallup-128th")]
  };

  var pink = {
    id: "pink", name: "Pink", family: "salmon", hint: "Humpies. Odd years only, next run summer 2027",
    cards: ["salmon-license",
      { id: "pink-watch", tab: "Watch", group: "technique", title: "Pinks, watched",
        body: when("Small, pink, slow. That is the whole program.") +
          vids(vid("qOp0EplIGUw", "Puget Sound pink salmon fishing basics", "WDFW", "When, where and how, salt and river.", 5, 2015),
            vid("UPf947TlUGk", "What to use for pinks from shore", "Steve Perdue", "Tacoma shore fishing, the lures that work.", 6, 2025),
            vid("v8ruDuLZZko", "Pink salmon setup for beginners", "Cody Outdoor", "First pinks of the run in Marine Area 11, then cooked.", 30, 2025),
            vid("tUDrLwShusw", "Jigging and trolling for pinks", "Northwest Fishing", "Jig when they bite, troll when they do not.", 14, 2021),
            vid("8YLZDbl-9AE", "How to catch Puget Sound humpies", "John's Sporting Goods", "A tackle shop walks the gear, start to finish.", 22, 2023),
            vid("F2_81vF4Dy0", "Pink salmon float jig, tied", "Sea-Run Fly and Tackle", "Tie the river jig yourself.", 7, 2025)) },
      { id: "pink-when", tab: "When", group: "before", title: "Odd years only", dated: "2026-11-22", shelfDays: 240,
        body: when("Puget Sound pinks come back in odd years. 2026 had none. Next run: summer 2027.") +
          steps("<b>Salt:</b> mid July to mid August, peak in early August.",
            "<b>Green River:</b> late August into October.",
            "2025 forecast was about 1.8 million pinks to the Green alone.") +
          box("law", "2027 rules not set", "WDFW sets the 2027 seasons in the spring. Read the " + EMERG + " before the first trip.") },
      { id: "pink-soft", tab: "Soft mouth", group: "water", title: "Easy on the hookset",
        body: when("Pinks have a soft mouth. Hooks tear out if you horse them.") +
          steps("Drag set lighter than for coho.",
            "Steady lift, no hard jerk.",
            "Keep the rod bent and let them run.",
            "Keep the bright ones. They turn dark and soft fast once in the river.") }],
    locations: [sound([{ id: "pink-salt", tab: "Pink rig", group: "before", title: "Pinks off Dash Point",
      body: when("They swim shallow along the beach. Small and pink beats big and flashy.") +
        steps("<b>Humpy jig or Buzz Bomb</b>, 1/4 to 1/2 oz, pink. Cast, let it sink, slow retrieve.",
          "<b>Pink mini squid</b> 18 to 24 in behind a small dodger, pulled slowly from the kayak.",
          "<b>Small pink spoon</b> from the beach, reeled slower than for coho.") +
        box("tip", "slow down", "Pinks grab, they do not chase. If you are fishing coho speed, you are too fast.") }]),
      river([{ id: "pink-river", tab: "On the river", group: "water", title: "Pinks on the Green",
        body: when("Same float and jig rig as coho. Go smaller and pink.") +
          steps("Small pink marabou jig under the float.",
            "Fish the softer slots off the main push, where they stack.",
            "Sight fish when the water is clear: drift it right past their nose.") }]),
      puyallup("puyallup-sumner"), puyallup("puyallup-128th")]
  };

  var chum = {
    id: "chum", name: "Chum", family: "salmon", hint: "Dogs. October and November, the hardest fighter",
    cards: ["salmon-license",
      { id: "chum-watch", tab: "Watch", group: "technique", title: "Chum, watched",
        body: when("A jig under a float, in pink or purple.") +
          vids(vid("GeDi1H0j8kE", "The 30 second chum jig", "Holy Moly Outdoors", "A jig you can tie at the river that chum eat.", 6, 2025),
            vid("zIKb6VwbrN0", "Chum on a jig under a float", "BC Fishing Journal", "What the take and the fight look like.", 1, 2024),
            vid("tMudqfNOAAA", "Nisqually River chum in December", "Mark Arlen Ratcliffe", "Pink corky and yarn, shoulder to shoulder.", 1, 2012)) },
      { id: "chum-river", tab: "On the river", group: "water", title: "Chum on the river",
        body: when("They come in behind the coho, October into November.") +
          steps("Float and jig, the same rig as coho. Pink, purple or chartreuse.",
            "Corky and yarn in pink.",
            "Fish the softer water off the main push. Chum stack in slower slots.") +
          box("tip", "the fight", "The hardest fighting salmon in the Sound. Bring the heavier rod.") },
      { id: "chum-salt", tab: "In the salt", group: "before", title: "Chum in the salt",
        body: when("Marine Area 11 has had chum as release only.") +
          box("law", "release in the water", "From the kayak a chum you cannot keep stays in the water alongside. Never inside the gunwale. Check the " + EMERG + " for this year.") }],
    locations: [river()]
  };

  var steel = {
    id: "steelhead", name: "Steelhead", family: "salmon", hint: "Winter fish, December to March, river rigs scaled down",
    cards: ["salmon-license",
      { id: "steel-watch", tab: "Watch", group: "technique", title: "Steelhead, watched",
        body: when("Float and jig first, then beads.") +
          vids(vid("-nJIBJ6wadM", "Float and jig rigging for winter steelhead", "The Outdoor Line", "Rob Endsley builds the rig most bank anglers fish.", 3, 2016),
            vid("pYzNmAEqI0c", "Fishing jigs for winter steelhead", "The Outdoor Line", "The spinning rod set up for jigs in western Washington rivers.", 2, 2011),
            vid("PsKn9ZgPVLg", "3 ways to set up soft beads", "Angling Addicts PNW", "Pegging a bead for a float or a drift rig.", 6, 2023),
            vid("ypkHRKsTa5g", "Bank fishing for Washington winter steelhead", "Boyko Outdoors", "Spoons and floating jigs from the bank.", 9, 2024)) },
      { id: "steel-season", tab: "Is it open?", group: "before", title: "Is it open?", dated: "2026-11-21", shelfDays: 21,
        body: when("Winter steelhead run December to March.") +
          box("law", "not confirmed for this winter", "WDFW sets the 2026-2027 steelhead seasons in December, and most runs have been below goal. The Green River rules for this winter are not pulled in yet. Check the " + EMERG + ".") +
          box("", "always", "Wild steelhead, adipose fin still on, go back in the water. Record any kept steelhead on your catch card.") },
      { id: "steel-river", tab: "The rigs", group: "water", title: "Your river rigs, scaled down",
        body: when("The salmon rigs work. Go smaller and lighter.") +
          steps("<b>Float and jig</b> is the first rig to tie on.",
            "<b>Pegged bead</b> under a float or on the corky drift rig.",
            "Leader around <b>10 to 12 lb</b>, lighter than for salmon.",
            "Fish walking speed water, about 3 to 6 ft deep: tailouts and soft seams.") }],
    locations: [river()]
  };

  R.species.splice(at, 1, king, coho, pink, chum, steel);

  // Orting (Calistoga Park): the Puyallup from the Carbon River upstream,
  // CRC 804, in the 2026-27 pamphlet: "Selective gear rules." for all
  // species; trout and other game fish "Sat. before Memorial Day-Jan. 15",
  // trout "Statewide min. size/daily limit. Except: release cutthroat trout
  // and wild rainbow trout." No salmon line: closed to salmon all year.
  // Selective gear rules, as WDFW defines them
  // (https://www.eregulations.com/washington/fishing/definitions, 2026-27):
  // "Gear is limited to artificial flies with barbless single-point hooks or
  // lures with barbless single-point hooks and bait is prohibited. Up to 3
  // hooks may be used. Only knotless nets may be used to land fish." And
  // bait: "Any substance which attracts fish by scent or flavors, including
  // any lure which uses scent or flavoring to attract fish."
  R.spots.filter(function (x) { return x.id === "puyallup-orting"; })[0].cards = [
    { id: "orting-rules", tab: "Rules", group: "before", title: "What is open at Orting", dated: "2026-11-27", shelfDays: 180,
      body: when("Trout and game fish, selective gear.") +
        box("law", "no salmon", "The Puyallup above the Carbon River has no salmon season. Salmon fishing here is closed all year.") +
        box("law", "season", "Trout and other game fish, from the Saturday before Memorial Day to Jan 15.") +
        box("law", "selective gear rules", "Artificial flies or lures only, on barbless single point hooks. No bait. Scented yarn or lures count as bait. Up to 3 hooks. Only a knotless net to land a fish.") +
        box("", "trout", "Statewide size and daily limit. Release cutthroat and wild rainbow trout.") +
        box("", "other game fish", "Statewide size and daily limit.") +
        box("", "source", "2026-27 WDFW pamphlet, Puget Sound coastal rivers. Check the " + EMERG + " before you go.") },
    { id: "orting-spot", tab: "Calistoga Park", group: "before", title: "Calistoga Park, Orting",
      body: when("A City of Orting park on the river, just above the Orting-Kapowsin Hwy bridge.") +
        box("", "parking", "A free lot at the park. The Puyallup Riverwalk Trail runs along the levee.") +
        box("law", "not confirmed", "The park's hours.") }
  ];

  // Fish tab sections, in this order.
  R.families = [
    { id: "salmon", label: "Salmon and steelhead" },
    { id: "salt", label: "Salt water" },
    { id: "lake", label: "Lakes" },
    { id: "shellfish", label: "Shellfish" }
  ];
  var fam = { squid: "salt", surfperch: "salt", cutthroat: "salt", bass: "lake", perch: "lake", crab: "shellfish", clams: "shellfish" };
  R.species.forEach(function (s) { if (!s.family) s.family = fam[s.id] || "salt"; });
  var order = R.families.map(function (f) { return f.id; });
  R.species.sort(function (a, b) { return order.indexOf(a.family) - order.indexOf(b.family); });
})();
