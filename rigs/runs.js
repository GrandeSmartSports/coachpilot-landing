// Run cards: everything a Hot Trip needs, per plan id in rigs/trips.js.
// Plain data, plain text, so it moves into CastAI as is.
//
// Every fact here comes from a Rig Card, Coach's garage list
// (~/Workspace/ops/FISHING-INVENTORY.md) or a source checked 2026-11-23.
// Anything not confirmed is put in `unknown`, never guessed into a fact.
//
// gear status: have = Coach owns it (stated), need = known missing,
// check = not confirmed either way.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});
  RIG.trips = RIG.trips || {};

  RIG.trips.runs = {
    "squid-redondo": {
      what: "Market squid under the pier lights after dark. You jig straight down at the edge of the lit water. A good night fills a bucket for calamari.",
      setup: ["Get there in the last light and take rail space where the lit water meets the dark.",
        "Hang the light off the rail, aimed out and down, with its own safety tether.",
        "Rig one line with two jigs to start."],
      during: ["Fish the edge of the light, not the middle of the bright patch.",
        "Lob it underhand 20 to 30 ft, let it sink on a tight line, count, then lift slowly.",
        "The take is weight, not a strike. Lift steady and never let the line go slack.",
        "Swing the squid over the rail and straight into the bucket. They ink."],
      wrap: ["Squid on ice for the drive home.", "Rinse the light with fresh water.",
        "Clean them in the morning, not at midnight."],
      gear: [
        { i: "Rod: 9 ft, light power, fast action", s: "need", n: "On the Black Friday list. Until then the 7.5 ft river rod works, you just feel less." },
        { i: "Reel with 10 to 15 lb braid", s: "need", n: "Your river reels carry 30 lb braid. Too heavy to feel the weight change." },
        { i: "Squid jigs, size 2.0 to 2.5", s: "need" },
        { i: "White work light (Ryobi PCL633B), tool only", s: "need" },
        { i: "Ryobi 18V packs: one 4.0Ah, three 1.5Ah", s: "have", n: "About 5 hours on high with swaps. Spares in an inside pocket." },
        { i: "Carabiner and a second safety tether for the light", s: "check" },
        { i: "Bucket, plus a cooler with ice", s: "check" },
        { i: "Headlamp", s: "check" },
        { i: "Rag for ink, warm layers, rain shell", s: "check" },
        { i: "Fishing license", s: "check", n: "Read the Rules card for squid." }
      ],
      bait: { first: "Two squid jigs, 2.0 to 2.5, early in the season.",
        backup: ["Move up to 3.0 and 3.5 later in the season as the squid grow."],
        note: "Colour changes night to night. Ask the rail what is working." },
      how: ["Stand where you can drop straight down into the light edge.",
        "Underhand lob, 20 to 30 ft. A hard cast tangles the two jigs.",
        "Let it sink on a tight line. Count, so you know your depth.",
        "Slow lift, pause, let it fall. Feel for the jig getting heavier or stopping early.",
        "Feel weight: lift smooth and keep reeling. Slack line means a lost squid."],
      spot: { lines: ["Redondo Pier, Des Moines. A lit public fishing pier on the east side of Poverty Bay.",
        "Tides come from Des Moines, East Passage (NOAA 9446248), 3.5 miles north. Checked against a real night on Nov 17."],
        unknown: ["Parking layout and fees", "How late the lot stays open", "Which stretch of rail fishes best"] },
      expect: ["A crowded rail on good nights. On Nov 17 everyone hung white work lights off the rail.",
        "Squid come in waves. Long quiet stretches are normal.",
        "Cold and damp. You stand still for hours.",
        "Bright moon nights are slower. Dark moon nights beat full."],
      rules: ["10 pounds or 5 quarts a day, whichever you hit first.", "One line per person, up to four jigs on it.",
        "Read the Rules card before the first trip. Limits change."],
      more: [["squid", "redondo", "squid-watch-start"], ["squid", "redondo", "squid-rig"], ["squid", "redondo", "squid-bite"],
        ["squid", "redondo", "squid-feel"], ["squid", "redondo", "squid-regs"], ["squid", "redondo", "squid-clean"], ["squid", "redondo", "squid-cook"]]
    },

    "clams-ocean-shores": {
      what: "Razor clams on an announced WDFW evening dig. 15 a person. It is a 2.5 hour drive each way, so it is an adventure night.",
      setup: ["Check the WDFW page the day of the dig. Digs get cancelled for toxins or surf.",
        "Park at a beach approach for that night's beach.",
        "Walk down to the wet sand near the water."],
      during: ["Start 2 hours before the low. That is when the digging is best.",
        "Look for a show: a dimple or a keyhole in the sand.",
        "No shows? Pound the sand with the gun handle and watch.",
        "Gun centred on the show, tilted a little toward the ocean. Work it down, thumb over the vent, pull.",
        "Keep the first 15 you dig, any size, broken or not."],
      wrap: ["Clams on ice for the drive home.", "Dry clothes in the car. You will be wet.",
        "Clean them the same night or first thing in the morning."],
      gear: [
        { i: "Clam gun or clam shovel", s: "need" },
        { i: "A container for each digger", s: "need" },
        { i: "Headlamp, plus a spare", s: "check", n: "Fall and winter digs are after dark." },
        { i: "Waders or tall boots, rain shell", s: "check" },
        { i: "Cooler with ice", s: "check" },
        { i: "2026-2027 license that covers razor clams", s: "check" }
      ],
      bait: null,
      how: ["Walk slow along the wet sand near the water's edge.",
        "Shows look like a dimple, a keyhole, or a little ring.",
        "Razors pull down fast. Get the gun on it and dig without stopping.",
        "If the gun comes up empty, dig again in the same hole. The clam went down, not away."],
      spot: { lines: ["The beach changes by night: Mocrocks or Copalis. The trip shows which.",
          "Do not dig in the Copalis reserve, just south of the Ocean City approach. It is marked by 10 ft poles with signs.",
          "Long Beach and Twin Harbors are closed for toxins."],
        unknown: ["Which approach parks closest to the clams", "Restrooms at the approaches"] },
      expect: ["A thin year. WDFW counted fewer clams this summer. Expect to move around and pound for shows.",
        "Dark, wet, windy. The cold hits on the walk back.",
        "WDFW warns about swells over 11 ft. Never turn your back on the waves."],
      rules: ["15 razor clams a person a day. Keep the first 15.", "Each digger uses their own container.",
        "Everyone 16 and over needs a license that covers razor clams.", "Dig only on announced days and beaches."],
      more: [["clams", "ocean-shores", "clam-watch"], ["clams", "ocean-shores", "clam-dig"], ["clams", "ocean-shores", "clam-gear"],
        ["clams", "ocean-shores", "clam-rules"], ["clams", "ocean-shores", "razor-dates"]]
    },

    "crab-westport": {
      what: "Dungeness and red rock crab with ring nets off the Westport marina docks. Open every day. A slow, sit-and-soak day on the coast.",
      setup: ["Bait the ring nets before you walk out the dock.",
        "Pick a float with room. A local guide says Float 20, near the marina entrance, often has no boats."],
      during: ["Drop each ring flat to the bottom.",
        "Soak 15 to 30 minutes, per WDFW.",
        "Pull brisk and steady, so the crabs stay in the ring.",
        "Measure every male. Females and soft shells go straight back."],
      wrap: ["Crabs on ice, or keep them cool and damp.", "Rinse the rings and rope with fresh water at home."],
      gear: [
        { i: "Two ring nets or snares", s: "need", n: "Two units of crab gear per person." },
        { i: "Rope long enough to reach bottom, plus extra", s: "need" },
        { i: "Bait clip or bait cage", s: "need" },
        { i: "Crab gauge", s: "need" },
        { i: "Bait", s: "need" },
        { i: "Cooler with ice, gloves, bucket", s: "check" },
        { i: "Shellfish license (or a combination license)", s: "check" }
      ],
      bait: { first: "Bait in a cage or clip, tied in the middle of the ring.", backup: [],
        note: "What bait works best at Westport is not confirmed for this card." },
      how: ["Lower the ring until the rope goes slack, then take up the slack.",
        "Set a timer for 15 minutes.",
        "Pull hand over hand, fast and steady. Do not stop halfway.",
        "Measure straight across the back, in front of the points."],
      spot: { lines: ["Westport marina docks, inside the boat basin.",
          "Grays Harbor (Marine Area 2-2) has been closed to all fishing since Oct 24, EXCEPT the Westport and Ocean Shores boat basins. Stay inside the basin.",
          "A local guide says Float 20 is often boat-free and close to the entrance. Another says Floats 6 and 10 fish well late summer through winter."],
        unknown: ["Parking near the floats", "Whether the docks allow crabbing at night"] },
      expect: ["A lot of waiting between pulls.", "Wind on the docks. Dress for the coast, not Bonney Lake.",
        "Pair it with a razor clam dig if one lands the same day."],
      rules: ["Grays Harbor is closed to all fishing since Oct 24, except the Westport and Ocean Shores boat basins. Crab from the basin docks only.",
        "Dungeness: males only, 6 inches, 6 a day.", "Ring nets and snares: all year. Pots: Dec 1 to Sept 15.",
        "Two units of gear per person.", "Shellfish license for everyone crabbing."],
      more: [["crab", "westport", "crab-watch"], ["crab", "westport", "crab-keep"], ["crab", "westport", "crab-gear"],
        ["crab", "westport", "crab-license"], ["crab", "westport", "westport-crab"]]
    },

    "surfperch-ocean-shores": {
      what: "Surf perch from the open ocean beach with the surf rods. A high low bait rig cast into the trough. Open all year from the beach, 12 a day.",
      setup: ["Drive onto or park at a beach approach and walk to the water.",
        "Rig on the sand: 1 to 2 oz pyramid sinker on the bottom, two dropper loops, a small hook on each.",
        "Bait both hooks before the first cast."],
      during: ["Read the beach first. Cast into the trough, the darker band of water between the breaking waves.",
        "Best on the incoming tide.",
        "Keep the line tight and watch the rod tip. A sharp rap is a perch.",
        "Nothing in 20 minutes? Walk down the beach to the next trough and try again.",
        "Check the bait every few casts. Crabs and the surf strip it."],
      wrap: ["Fish on ice right away.", "Rinse the reels, rods and sinkers with fresh water at home. Salt and sand eat reels."],
      gear: [
        { i: "Your two heavy surf rods", s: "have" },
        { i: "1 to 2 oz pyramid sinkers", s: "check" },
        { i: "High low rigs or dropper loop leader, small hooks", s: "check" },
        { i: "Bait: razor clam, shrimp or Gulp sandworm", s: "need" },
        { i: "Sand spike to hold the rod", s: "check" },
        { i: "Waders or tall boots, rain shell", s: "check" },
        { i: "Cooler with ice", s: "check" },
        { i: "Saltwater or combination license", s: "check" }
      ],
      bait: { first: "Razor clam on both hooks.", backup: ["Shrimp", "Gulp sandworm"],
        note: "One Ocean Shores video tested Gulp sandworm against clam necks. Both caught fish." },
      how: ["Cast with a smooth swing, not a hard snap, so the bait stays on.",
        "Let the sinker hold bottom. Reel in the slack.",
        "When the tip raps, lift steady and reel. Do not jerk.",
        "Perch school up. Where you catch one, cast right back."],
      spot: { lines: ["Ocean Shores ocean beach, north of the Grays Harbor north jetty.",
          "Stay on the ocean side. The harbor side of the jetty is in the closed Area 2-2."],
        unknown: ["Which beach approach fishes best", "Where perch hold this time of year. Not fished for the card yet"] },
      expect: ["Wind and rain on the coast most of the year. Dress for it.",
        "Spring is the peak, April to June. Fall can still give a limit.",
        "Long drive, about 2.5 hours each way. Pair it with a razor clam dig or crabbing when you can."],
      rules: ["12 surf perch a day, no minimum size. Shiner perch: 15 a day.",
        "From the beach: open all year (Marine Area 2). Not part of the 9 bottomfish limit.",
        "Grays Harbor (Area 2-2, east of the Buoy 13 line) is closed to all fishing since Oct 24, 2026, except the boat basins. Fish the ocean side only.",
        "Saltwater or combination license."],
      more: [["surfperch", "ocean-shores", "surf-watch"], ["surfperch", "ocean-shores", "surf-rig"], ["surfperch", "ocean-shores", "surf-rules"]]
    },

    "surfperch-westport": {
      what: "Surf perch from the open ocean beach with the surf rods. A high low bait rig cast into the trough. Open all year from the beach, 12 a day.",
      setup: ["Drive onto or park at a beach approach and walk to the water.",
        "Rig on the sand: 1 to 2 oz pyramid sinker on the bottom, two dropper loops, a small hook on each.",
        "Bait both hooks before the first cast."],
      during: ["Read the beach first. Cast into the trough, the darker band of water between the breaking waves.",
        "Best on the incoming tide.",
        "Keep the line tight and watch the rod tip. A sharp rap is a perch.",
        "Nothing in 20 minutes? Walk down the beach to the next trough and try again.",
        "Check the bait every few casts. Crabs and the surf strip it."],
      wrap: ["Fish on ice right away.", "Rinse the reels, rods and sinkers with fresh water at home. Salt and sand eat reels."],
      gear: [
        { i: "Your two heavy surf rods", s: "have" },
        { i: "1 to 2 oz pyramid sinkers", s: "check" },
        { i: "High low rigs or dropper loop leader, small hooks", s: "check" },
        { i: "Bait: razor clam, shrimp or Gulp sandworm", s: "need" },
        { i: "Sand spike to hold the rod", s: "check" },
        { i: "Waders or tall boots, rain shell", s: "check" },
        { i: "Cooler with ice", s: "check" },
        { i: "Saltwater or combination license", s: "check" }
      ],
      bait: { first: "Razor clam on both hooks.", backup: ["Shrimp", "Gulp sandworm"],
        note: "One Ocean Shores video tested Gulp sandworm against clam necks. Both caught fish." },
      how: ["Cast with a smooth swing, not a hard snap, so the bait stays on.",
        "Let the sinker hold bottom. Reel in the slack.",
        "When the tip raps, lift steady and reel. Do not jerk.",
        "Perch school up. Where you catch one, cast right back."],
      spot: { lines: ["Westport ocean beach, south of the south jetty (Westhaven and Twin Harbors beaches).",
          "Do NOT fish Half Moon Bay or the harbor side of the south jetty while Grays Harbor is closed. Whether the jetty tip is inside the Buoy 13 line is not confirmed."],
        unknown: ["Exact edge of the Grays Harbor closure near the south jetty. WDFW Coastal Region: 360-249-4628", "Which approach fishes best"] },
      expect: ["Wind and rain on the coast most of the year. Dress for it.",
        "Spring is the peak, April to June. Fall can still give a limit.",
        "Long drive, about 2.5 hours each way. Pair it with a razor clam dig or crabbing when you can."],
      rules: ["12 surf perch a day, no minimum size. Shiner perch: 15 a day.",
        "From the beach: open all year (Marine Area 2). Not part of the 9 bottomfish limit.",
        "Grays Harbor (Area 2-2, east of the Buoy 13 line) is closed to all fishing since Oct 24, 2026, except the boat basins. Fish the ocean side only.",
        "Saltwater or combination license."],
      more: [["surfperch", "westport", "surf-watch"], ["surfperch", "westport", "surf-rig"], ["surfperch", "westport", "surf-rules"]]
    },

    "cutthroat-dash-point": {
      what: "Sea-run cutthroat cruising the beach. WDFW says South Sound beaches fish well all winter. Catch and release only, so this is about the catch.",
      setup: ["Park at Dash Point State Park. Put the Discover Pass on the dash.",
        "The park opens at 8 AM.",
        "Walk down to the beach and rig on the sand."],
      during: ["Start a few feet from the waterline. Wade out only as the fish move.",
        "Fish come up about 20 ft out. Cast at an angle along the beach, not straight out.",
        "Best on the incoming tide, the hour or two before high.",
        "No fish in 15 minutes? Walk the beach and try new water.",
        "When the tide slows and weed starts fouling the fly, the window is over."],
      wrap: ["Rinse the reel and line with fresh water.", "Write down where the fish were. This beach has not been fished for the card yet."],
      gear: [
        { i: "Fly rod, your 4 weight", s: "have", n: "Fine on a calm day with small flies. A 6 weight is ideal." },
        { i: "Floating fly line", s: "check" },
        { i: "Leader: 24 in of 15 lb, 24 in of 10 lb, 36 in of 6 lb", s: "need" },
        { i: "Clouser minnows, olive and white", s: "need" },
        { i: "Mack's Smile Blade Fly, pink sparkle", s: "need" },
        { i: "Spin option: your micro rod", s: "have", n: "Line weight on it is not confirmed." },
        { i: "Spin option: 1/2 oz spoon, silver (Mack's Hum Dinger)", s: "need" },
        { i: "Forceps, and pliers to pinch barbs", s: "check" },
        { i: "Waders or knee boots", s: "check" },
        { i: "Discover Pass", s: "check", n: "$99 ticket without one." },
        { i: "Saltwater fishing license", s: "check" }
      ],
      bait: { first: "Clouser minnow, olive and white.",
        backup: ["Smile Blade Fly in pink sparkle. It looks like a shrimp.", "On spin gear: a 1/2 oz silver spoon."],
        note: "Brighter colours when the water is murky." },
      how: ["Reach back, pause, then push the cast forward and land the line soft.",
        "Let the fly sit until the rings on the water settle.",
        "Strip at an even pace. Steady beats fast.",
        "Spoon: cast along the beach, count it down, steady retrieve.",
        "Fish on: keep it in the water, wet hands, hook out fast."],
      spot: { lines: ["Dash Point State Park, Tacoma. Open 8 AM to dusk.",
          "Discover Pass required to park.",
          "Mack's Lure says to fish the bank near the pier."],
        unknown: ["Which stretch of beach holds fish", "Restrooms in winter", "How busy weekend mornings get"] },
      expect: ["A first look. Nobody has fished cutthroat here for this card.",
        "Zero fish on a first trip is normal. You are learning the beach.",
        "Wind is the enemy of the 4 weight. Under 10 mph is easy."],
      rules: ["All cutthroat in Puget Sound go back.", "Barbless hooks in all Puget Sound marine waters.",
        "Saltwater license.", "Discover Pass to park."],
      more: [["cutthroat", "dash-point", "src-watch"], ["cutthroat", "dash-point", "src-gear"], ["cutthroat", "dash-point", "src-rules"],
        ["cutthroat", "dash-point", "dash-src"], ["learn", "", "fly-cast"], ["learn", "", "fly-setup"]]
    },

    "coho-dash-point": {
      what: "Coho from the kayak off Dash Point. They run the shallow lane along the shore and chase a fast lure.",
      setup: ["Launch at Dash Point Park and Pier on Beach Dr NE, not the state park.",
        "Do the gear law in the garage: single siwash, barbs pinched.",
        "Anchor on the drop off the pier end. Use the 150 ft rode."],
      during: ["Cast the Buzz Bomb, let it flutter down, rip it up, let it fall. Most bites come on the fall.",
        "Or a hoochie on a jig head, worked fast.",
        "Fish you cannot keep stay in the water alongside. Never inside the gunwale."],
      wrap: ["Fill in the catch record card before you leave the beach.", "Rinse the boat and reels."],
      gear: [
        { i: "Kayak, PFD, anchor with 150 ft rode", s: "have" },
        { i: "Spinning rod: Valor 7 ft medium heavy", s: "have" },
        { i: "Buzz Bombs, trebles swapped for single siwash", s: "check" },
        { i: "Hoochies and jig heads", s: "check" },
        { i: "Net", s: "check" },
        { i: "License and salmon catch record card", s: "check" }
      ],
      bait: { first: "Buzz Bomb on a single barbless siwash.", backup: ["Hoochie threaded on the leader over a jig head."], note: "" },
      how: ["Cast, let it sink to the depth you want.", "Sharp lift, then let it flutter back down on a tight line.",
        "Coho hit the flutter. Watch the line."],
      spot: { lines: ["Dash Point Park and Pier, Beach Dr NE. The pier is closed, so the kayak is how you reach the drop.",
          "Off the pier end: 30 ft, then 51 ft at 25 yards out, 74 ft at 50 yards. It drops fast."],
        unknown: [] },
      expect: ["Mid August to the end of September, peak in September.", "Fish near high water after work."],
      rules: ["Marine Area 11 salmon is closed Nov 16 to Mar 30.", "Barbless, single siwash hooks.",
        "Check the WDFW emergency rules before every trip."],
      more: [["coho", "dash-point", "dash-coho"], ["coho", "dash-point", "dash-watch-jig"], ["coho", "dash-point", "dash-law"],
        ["coho", "dash-point", "dash-where"], ["coho", "dash-point", "dash-timing"], ["coho", "dash-point", "dash-season"]]
    },

    "king-dash-point": {
      what: "Kings mooching from the kayak off Dash Point. Deeper and farther out than coho, on a slow spinning herring.",
      setup: ["Launch at Dash Point Park and Pier on Beach Dr NE.",
        "Cut plug herring brined and ready before you launch.",
        "Anchor on the 35 to 40 ft band of the pier drop. That is where your first king came from."],
      during: ["Free spool down to the depth the kings are on.", "Hold, or lift slowly a few feet and let it flutter back.",
        "A tap, then slack or weight. Reel down until you feel it, then lift. Do not jerk."],
      wrap: ["Catch record card before you leave the beach.", "Rinse the boat and reels."],
      gear: [
        { i: "Kayak, PFD, anchor with 150 ft rode", s: "have" },
        { i: "Mooching rod and reel", s: "check" },
        { i: "Banana sinkers, 1/2 to 1 oz, bead chain both ends", s: "check" },
        { i: "Leader: 5 to 8 ft of 20 to 30 lb fluorocarbon, two hooks", s: "check" },
        { i: "Herring for cut plugs, plus brine", s: "need" },
        { i: "License and salmon catch record card", s: "check" }
      ],
      bait: { first: "Cut plug herring on a two hook mooching leader.", backup: [], note: "A tight even roll is right. A wobble means the cut is off." },
      how: ["Cut the head off at an angle, both ways.", "Hook up through the cavity and out the top of the cut.",
        "Drop to the band, hold, slow lift, flutter back."],
      spot: { lines: ["Dash Point Park and Pier, Beach Dr NE.", "The 35 to 40 ft band off the pier end."], unknown: [] },
      expect: ["Kings are July and August here.", "Long quiet stretches, then one bite."],
      rules: ["No more than 1 Chinook in the daily limit when open.", "Barbless, no more than two hooks.",
        "Check the WDFW emergency rules before every trip."],
      more: [["king", "dash-point", "king-vs-coho"], ["king", "dash-point", "king-mooch-build"], ["king", "dash-point", "king-cutplug"],
        ["king", "dash-point", "king-mooch-fish"], ["king", "dash-point", "king-watch"]]
    },

    "coho-green-river": {
      what: "River coho on the Green, from the bank at Auburn Narrows. Your corky and float rigs. They move in pulses, and rain is the trigger.",
      setup: ["Park at Auburn Narrows Natural Area.", "Read the water before you tie on: fast and broken means corky, slow seams mean float."],
      during: ["Float and jig first. Cast up and across, let it drift dead.",
        "No takes in a few passes: add a small twitch every five or six feet of drift.",
        "Faster water: corky and yarn, ticking the bottom.",
        "Fish are holding tight to cover in low clear water. Fish the slots close to wood and the soft inside seams.",
        "Off the water one hour after sunset. Night closure."],
      wrap: ["Fill in the catch record card before you leave.", "Kings go back. Release Chinook on this stretch."],
      gear: [
        { i: "River rod, 7.5 ft, 30 lb braid", s: "have" },
        { i: "Corky gear", s: "have", n: "You said you have everything for corky fishing." },
        { i: "Floats 1/4 or 3/8, bobber stops, beads", s: "check" },
        { i: "Jigs, 1/4 oz", s: "check" },
        { i: "Single point hooks, 3/4 inch or less point to shank", s: "check" },
        { i: "Cured eggs, if you fish the float and eggs", s: "check" },
        { i: "Net, pliers, cooler", s: "check" },
        { i: "License and salmon catch record card", s: "check" }
      ],
      bait: { first: "Float and jig, 1/4 oz.", backup: ["Corky and yarn for faster water.", "Float and eggs for slow deep slots.", "Blue Fox size 4 or 5 to cover water."], note: "" },
      how: ["Cast up and across. Let the float drift at the speed of the surface foam.",
        "Set the float so the jig rides about a foot off the bottom.",
        "Corky: cast across and slightly up, follow with the rod tip. You want tick, tick, tick.",
        "A bite on the corky feels like the ticking stops. Set the hook."],
      spot: { lines: ["Auburn Narrows Natural Area, 22 min. Open Sept 16 to Dec 31.",
          "Metzler Park, 34 min, 18729 SE Green Valley Rd. Open Nov 1 to Dec 31. About 20 spaces, a portable toilet, no Discover Pass.",
          "Do NOT fish from the \"Green River Water Access\" lot or the Hatchery Natural Area just above Hwy 18. Hwy 18 up to the Auburn-Black Diamond Rd bridge is closed water all year.",
          "River level: USGS gauge 12113000, Green River at Auburn."],
        unknown: ["How crowded weekend mornings get"] },
      expect: ["The first real fall rain pushes a fresh wave up. That is the best day to be there.",
        "Low clear water: fish move at night and first light, and sit tight to cover in the day.",
        "Tribal nets fish this river most days this fall. A good count does not always mean a good day."],
      rules: ["S 212th St to the Hwy 18 bridge: open Sept 16 to Dec 31.",
        "6 salmon a day, no more than 3 adult coho and chum together. 12 inch minimum. Release Chinook.",
        "Anti-snagging: one single point hook, 3/4 inch or less, no weight within 12 inches above the lure.",
        "Night closure: one hour after sunset to one hour before sunrise.",
        "Catch record card required. Source: WSR 26-13-052."],
      more: [["coho", "green-river", "coho-river"], ["coho", "green-river", "salmon-float-jig-build"], ["coho", "green-river", "salmon-float-jig-fish"],
        ["coho", "green-river", "salmon-corky-build"], ["coho", "green-river", "salmon-corky-fish"], ["coho", "green-river", "green-river-rules"],
        ["coho", "green-river", "river-watch-float"]]
    },

    "chum-green-river": {
      what: "Chum on the Green, the hardest fighting salmon in the Sound. They come in behind the coho, November into December.",
      setup: ["Metzler Park is in the money water, below the Keta Creek hatchery. Every fish passes Auburn Narrows first, so that works too.",
        "Bring the heavier rod."],
      during: ["Float and jig in pink, purple or chartreuse.", "Pink corky and yarn in the faster water.",
        "Chum stack in the slower slots off the main push. Fish there.",
        "Off the water one hour after sunset. Night closure."],
      wrap: ["Fill in the catch record card before you leave."],
      gear: [
        { i: "River rod, 7.5 ft, 30 lb braid", s: "have" },
        { i: "Corky gear", s: "have" },
        { i: "Pink, purple or chartreuse jigs", s: "check" },
        { i: "Floats 1/4 or 3/8, bobber stops, beads", s: "check" },
        { i: "Single point hooks, 3/4 inch or less point to shank", s: "check" },
        { i: "Net and pliers", s: "check" },
        { i: "License and salmon catch record card", s: "check" }
      ],
      bait: { first: "Pink or purple jig under a float.", backup: ["Pink corky and yarn.", "Chartreuse jig."], note: "" },
      how: ["Cast up and across, dead drift, then twitch if nothing.", "Hold on. They run hard and long. Keep the rod up and let the drag work."],
      spot: { lines: ["Auburn Narrows Natural Area, 22 min. Open Sept 16 to Dec 31.",
          "Metzler Park, 34 min, 18729 SE Green Valley Rd. Open Nov 1 to Dec 31. About 20 spaces, a portable toilet, no Discover Pass.",
          "Do NOT fish from the \"Green River Water Access\" lot or the Hatchery Natural Area just above Hwy 18. Hwy 18 up to the Auburn-Black Diamond Rd bridge is closed water all year.",
          "River level: USGS gauge 12113000, Green River at Auburn."],
        unknown: ["How crowded weekend mornings get"] },
      expect: ["Metzler has about 20 spaces. Weekend crowds there are not confirmed.",
        "Keta Creek is the Muckleshoot hatchery. Fish turn into the creek and stop, so above it you only see strays.",
        "Tribal nets fish this river most days this fall."],
      rules: ["S 212th St to Hwy 18: open Sept 16 to Dec 31. Auburn-Black Diamond Rd bridge up to Keta Creek (Metzler): Nov 1 to Dec 31.",
        "150 ft either side of the Keta Creek mouth is closed.",
        "6 salmon a day, no more than 3 adult coho and chum together. 12 inch minimum. Release Chinook.",
        "Anti-snagging and night closure, as on every Green River stretch.",
        "Catch record card required. Source: WSR 26-13-052."],
      more: [["chum", "green-river", "chum-watch"], ["chum", "green-river", "chum-river"], ["chum", "green-river", "salmon-float-jig-build"],
        ["chum", "green-river", "salmon-corky-build"], ["chum", "green-river", "green-river-rules"]]
    },

    "trout-fenwick": {
      what: "Perch and stocked trout from shore at Lake Fenwick in Kent. Close, easy, and good after a trout plant.",
      setup: ["Check the WDFW stocking report first. A fresh plant changes the day."],
      during: ["Perch: small jig near the bottom, short lifts.", "Trout: PowerBait floating just off the bottom.",
        "Find one perch and there are more. Stay on that spot."],
      wrap: [],
      gear: [
        { i: "Micro rod or a light spinning rod", s: "have" },
        { i: "Light line, 4 to 6 lb", s: "check" },
        { i: "Small perch jigs", s: "need" },
        { i: "PowerBait, sliding sinkers, small hooks", s: "need" },
        { i: "Freshwater fishing license", s: "check" }
      ],
      bait: { first: "Small jig for perch.", backup: ["PowerBait off the bottom for stocked trout."], note: "" },
      how: ["Perch: drop to the bottom, lift a few inches, let it fall.", "Trout: cast out, let the sinker settle, tighten up, wait."],
      spot: { lines: ["Lake Fenwick, Kent. You have fished it: 8 to 10 inch perch."], unknown: ["Best shore spot for winter perch"] },
      expect: ["Winter perch school deep, 20 to 40 ft. From shore you may not reach them.", "Trout depend on the plants."],
      rules: ["Lake Fenwick is open all year.", "Trout: 5 a day, no minimum size (statewide lake rule).", "Perch limits are not pulled in yet. Check before you keep any."],
      more: [["perch", "lake-fenwick", "perch-winter"], ["perch", "lake-fenwick", "trout-plants"], ["perch", "lake-fenwick", "trout-watch"],
        ["perch", "lake-fenwick", "perch-regs"]]
    },

    "bass-fenwick": {
      what: "Largemouth at Lake Fenwick. Where your chartreuse Rooster Tail caught one from the kayak.",
      setup: ["Evening, overcast and glassy is how the good day went."],
      during: ["Rooster Tail along the edges first.", "Wacky Dinger on the open edges.", "Texas rig into the wood and stumps."],
      wrap: [],
      gear: [
        { i: "Valor 7 ft medium heavy spinning, 15 lb mono", s: "have" },
        { i: "Abu Garcia Black Max baitcaster", s: "have", n: "Spooled with 20 lb mono for salmon since September." },
        { i: "Rooster Tail, chartreuse, 1/8 oz", s: "check", n: "The 1/4 oz ones you own are too big." },
        { i: "Dingers and 3/0 EWG hooks, 1/8 oz bullet weights", s: "check" },
        { i: "Fishing license", s: "check" }
      ],
      bait: { first: "Worden's Rooster Tail, chartreuse, 1/8 oz.", backup: ["Wacky rigged Dinger.", "Texas rigged worm."], note: "" },
      how: ["Wacky: hook once through the middle, cast to the edge, let it sink on slack line.", "Most bites come on the fall. Watch the line."],
      spot: { lines: ["Lake Fenwick, Kent."], unknown: ["Where you launched and parked last time"] },
      expect: ["Summer and early fall. Cold water shuts it down."],
      rules: ["Bass limits are not pulled in yet. Check before you keep any."],
      more: [["bass", "lake-fenwick", "bass-roostertail"], ["bass", "lake-fenwick", "bass-wacky"], ["bass", "lake-fenwick", "bass-texas"],
        ["bass", "lake-fenwick", "bass-gear"], ["bass", "lake-fenwick", "fenwick-notes"]]
    },

    "trout-american": {
      what: "Perch and trout from the kayak on American Lake in Lakewood. Big water, so it is a calm day pick.",
      setup: ["Launch at the paved two lane ramp.", "Anchor over 20 to 40 ft for winter perch."],
      during: ["Drop a small jig to the bottom.", "Find one and there are dozens. Stay put."],
      wrap: ["Rinse the kayak and anchor line."],
      gear: [
        { i: "Kayak, PFD, anchor and rode", s: "have" },
        { i: "Micro rod or light spinning rod", s: "have" },
        { i: "Small perch jigs", s: "need" },
        { i: "Freshwater fishing license", s: "check" }
      ],
      bait: { first: "Small jig for perch.", backup: ["PowerBait for stocked trout."], note: "" },
      how: ["Anchor, drop to the bottom, short lifts.", "Use the anchor scope drill in Learn: 3 times the depth."],
      spot: { lines: ["American Lake, Lakewood. Paved two lane ramp."], unknown: ["Parking fee at the ramp"] },
      expect: ["Wind builds fast on big water. The trip is off over 10 mph."],
      rules: ["American Lake is open all year.", "Trout and kokanee: 5 a day combined, no minimum size.", "Perch limits are not pulled in yet. Check before you keep any."],
      more: [["perch", "american-lake", "american-launch"], ["perch", "american-lake", "perch-winter"], ["perch", "american-lake", "trout-plants"]]
    }
  };

  // ---- Templates: one per kind of trip ---------------------------------
  // A plan in rigs/trips.js with `kind` and `site` gets its run card built
  // here, so adding a spot is one data row, not a hand-written card. A
  // hand-written card above always wins. Rules text is from the 2026-27
  // WDFW pamphlet, read 2026-11-23.
  var R = RIG.trips.runs;
  var KINDS = {
    "squid-pier": function (p, site) {
      var base = R["squid-redondo"];
      return {
        what: "Market squid under the lights at " + site.name + " after dark. Same game as Redondo: jig the edge of the lit water.",
        setup: ["Get there in the last light and take rail space where the lit water meets the dark.",
          "Hang your light off the rail, aimed out and down, with its own safety tether.",
          "Rig one line with two jigs to start."],
        during: base.during, wrap: base.wrap, gear: base.gear, bait: base.bait, how: base.how,
        spot: { lines: site.lines, unknown: site.unknown || [] },
        expect: ["Squid come in waves. Long quiet stretches are normal.", "Cold and damp. You stand still for hours.",
          "Bright moon nights are slower. Dark moon nights beat full.", "Crowds at this pier not seen for the card yet."],
        rules: ["Squid: open all year. 10 pounds or 5 quarts a day, whichever you hit first.",
          "One line per person (new for 2026), up to four squid lures on it.", "Each person keeps their own container.",
          "A shellfish license or a combination license."],
        more: base.more
      };
    },
    "pier-salmon": function (p, site) {
      return {
        what: "Winter salmon from " + site.name + ". Resident blackmouth and coho feed along the piers all winter, and the pier rule keeps these open when the rest of the Sound is closed. A long-odds trip: one fish is a good day.",
        setup: ["Pick rail space on the side the tide is running toward.", "Rig the jig or the herring before you walk out."],
        during: ["Jig: cast out, let it fall to the bottom, then rip it up and let it flutter back down. Most hits come on the fall.",
          "Cover water: fan your casts and work different depths.", "Moving tide is the window. Slack water is break time."],
        wrap: ["Fish bled and on ice.", "Mark the catch record card before you leave the pier."],
        gear: [
          { i: "Your 7.5 ft river rod with 30 lb braid", s: "have", n: "Fine for pier jigging." },
          { i: "Buzz Bomb or Point Wilson Dart jigs, 1 to 2 oz", s: "check" },
          { i: "Long-handled net for the pier", s: "need", n: "A fish has to come up the side of the pier." },
          { i: "Cooler with ice, knife to bleed", s: "check" },
          { i: "Saltwater or combination license, catch record card", s: "check" }
        ],
        bait: { first: "Buzz Bomb, 1 to 2 oz, white or glow.", backup: ["Point Wilson Dart.", "Plug-cut herring under a slip float."],
          note: "What is working at this pier this winter is not confirmed for the card." },
        how: ["Cast, count it down to the bottom, then lift hard and let it flutter back.",
          "Keep the line tight on the fall. A bump or a stop is a fish: reel and lift.", "Net it. Do not try to swing a salmon up a pier."],
        spot: { lines: site.lines, unknown: site.unknown || [] },
        expect: ["Slow. Plenty of no-fish days.", "Chinook must be 22 in. Many winter blackmouth are shorter.", "Cold wind off the water."],
        rules: (site.area === 13
          ? ["Fox Island pier, Oct 1 to June 30: 2 salmon a day, no more than 1 Chinook. Chinook 22 in minimum. Release chum."]
          : ["Piers (Des Moines, Les Davis, Point Defiance boathouse, Redondo), Oct 1 to Apr 30: 2 salmon a day, no more than 1 Chinook. Chinook 22 in minimum.",
            "Open water in Marine Area 11 is closed Nov 1 to Apr 30. The pier rule only covers fishing from the pier."]).concat(
          ["Saltwater or combination license, plus a catch record card."]),
        more: [["coho", "dash-point", "dash-watch-jig"], ["king", "dash-point", "king-watch"], ["king", "dash-point", "salmon-license"]]
      };
    },
    "lake-trout": function (p, site) {
      // The season is the first rule. A lake with its own season (spring
      // only: 4th Saturday in April to Oct 31) leads with that line, and
      // only a lake with no closed dates says "Open all year."
      var own = (site.extra || []).filter(function (l) { return /^Open /.test(l); });
      var rest = (site.extra || []).filter(function (l) { return !/^Open /.test(l); });
      var seasonal = p.spring || (p.closed && p.closed.length);
      var opens = own.length ? own : [seasonal ? "Not open all year. Check this lake's season in the WDFW rules." : "Open all year."];
      return {
        what: "Stocked rainbow trout from shore at " + site.name + ". WDFW plants catchable trout here; the first weeks after a plant are the time to go.",
        setup: ["Check the WDFW stocking report the night before.", "Park at the access and walk the shore to open water you can cast into."],
        during: ["PowerBait floating just off the bottom on a sliding sinker rig.", "No bites in 20 minutes? Move. Fresh plants cruise in schools.",
          "Second rod idea: a small spinner or a worm under a bobber near the surface."],
        wrap: ["Trout on ice right away."],
        gear: [
          { i: "Light spinning rod", s: "have" },
          { i: "4 to 6 lb line", s: "check" },
          { i: "PowerBait, sliding sinkers, small hooks", s: "need" },
          { i: "Small spinners (Rooster Tail 1/8 oz)", s: "check" },
          { i: "Freshwater or combination license", s: "check", n: "Your annual license includes the WDFW Vehicle Access Pass for the access area." }
        ],
        bait: { first: "PowerBait, floating, on a small hook 18 in above a sliding sinker.", backup: ["Worm under a bobber.", "Small spinner, slow retrieve."], note: "" },
        how: ["Cast out, let the sinker settle, reel up the slack, set the rod down and watch the tip.", "Tip taps then pulls: lift and reel. Do not jerk."],
        spot: { lines: site.lines, unknown: site.unknown || [] },
        expect: ["Fresh-plant trout are easy. A few weeks later they spread out.", "Other anglers on the bank after a plant."],
        rules: opens.concat(["Trout: 5 a day, no minimum size (statewide lake rule).",
          "Combined trout limit if you also fish a river that day: 5, no more than 2 from rivers."], rest,
          ["Freshwater or combination license."]),
        more: [["perch", "lake-fenwick", "trout-watch"], ["perch", "lake-fenwick", "trout-plants"]]
      };
    }
  };
  KINDS["river-steelhead"] = function (p, site) {
    var gear = [
      { i: "Your 7.5 ft river rod", s: "have", n: "Works. A 9 to 10.5 ft steelhead rod drifts a float better." },
      { i: "Slip floats, 1/8 to 1/4 oz steelhead jigs (pink, black and pink)", s: "need" },
      { i: "Leader 8 to 10 lb, small swivels, split shot", s: "check" },
      { i: "Pink worms, 4 in, on a jig head", s: "need" },
      { i: "Waders with grip soles", s: "check" },
      { i: "Freshwater or combination license, catch record card", s: "check" }
    ];
    if (p.endorsement) gear.push({ i: "Columbia River Salmon and Steelhead Endorsement", s: "check", n: "Needed on the Cowlitz. Not part of a regular license." });
    return {
      what: "Winter hatchery steelhead from the bank on " + site.name + ". Steelhead are the hardest fish here: a fish or two in a day is a win. A hatchery fish (clipped fin) is yours to keep.",
      setup: ["Check the river flow card first. Dropping and clearing is the day.", "Rig a slip float and a jig before you walk in."],
      during: ["Drift the float through the softer seams beside fast water, 3 to 6 ft deep.",
        "Set the float so the jig rides just off the bottom.", "Float dips or stops: set the hook.",
        "Ten good drifts and nothing? Take a few steps downstream and repeat."],
      wrap: ["Check the fin: no adipose fin means hatchery. Wild fish go back in the water, gently.",
        "Mark the catch record card right away."],
      gear: gear,
      bait: { first: "Pink jig or pink worm under a slip float.", backup: ["Cured eggs under the float.", "Small spinner swung through the tailout."], note: "" },
      how: ["Cast slightly upstream, mend so the float leads the line, let it ride the seam.",
        "Adjust depth until the jig ticks bottom now and then, then shorten a little.", "Fight from the bank downstream of the fish. Do not horse it."],
      spot: { lines: site.lines, unknown: site.unknown || [] },
      expect: ["Cold, wet hands. Bring dry gloves for the drive home.", "Long quiet stretches. That is steelhead fishing.", "Crowds near the hatchery on weekends."],
      rules: (site.rules || []).concat(["Freshwater or combination license, plus a catch record card."]),
      more: [["steelhead", "green-river", "steel-watch"], ["steelhead", "green-river", "river-watch-float"], ["steelhead", "green-river", "salmon-float-jig-build"]]
    };
  };
  RIG.trips.kinds = KINDS;
  // Generated plans (CastAI waters) are rebuilt each time the feed lands.
  RIG.trips.buildRuns = function () {
    Object.keys(R).forEach(function (k) { if (R[k] && R[k].gen) delete R[k]; });
    (RIG.trips.plans || []).forEach(function (p) {
      if (p.kind && KINDS[p.kind] && !R[p.id]) { R[p.id] = KINDS[p.kind](p, p.site || {}); if (p.gen) R[p.id].gen = true; }
    });
  };
  RIG.trips.buildRuns();
})(typeof window !== "undefined" ? window : globalThis);
