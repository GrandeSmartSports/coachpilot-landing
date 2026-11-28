// Rig Card guides: the Rig Card's own words for Washington. Written by hand,
// checked 2026-11-27. They replace CastAI's guides, gear and fish About text
// in the app (rigs/library.js still supplies the knots and casts).
//
// Where each fact comes from, and nothing else:
//   - the 2026-27 Washington pamphlet on www.eregulations.com (each section
//     names the pages it used). No page on WDFW's own site was read.
//   - the app's own verified data: the seasons in rigs/trips.js, the run
//     cards in rigs/runs.js, the fish cards in rigs/content.js, the lakes in
//     rigs/lakes.js, and the spot cards the scenes are painted from.
//   - the National Weather Service's cold water page, for cold shock.
//
// The rules of this file (tests/rigs-guides.test.mjs holds them):
//   - a rule is never restated. A limit, a size, an age or a date is only
//     ever the words of a link to the app's rules card for that water.
//   - a place named with a season is a spot the app plans in that season.
//     The months come from the plan itself: {when:planId} and {peak:planId}
//     are filled in from rigs/trips.js, so a guide cannot disagree with Hot
//     Trips. The year is built the same way (RIG.guides.year).
//   - links are [words](#/route), and every route is a screen in the app.
//   - points first, a few lines behind More, sources at the foot.
// Loaded after the first screen (rigs/index.html), cached by rigs/sw.js.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});

  var PAMPHLET = "https://www.eregulations.com/washington/fishing/";
  function pam(page, name) { return { name: "2026-27 pamphlet: " + name, url: PAMPHLET + page }; }
  var SOURCES = {
    pamIndex: { name: "2026-27 Washington fishing pamphlet (eRegulations)", url: PAMPHLET },
    pamLicense: pam("license-information", "License Information"),
    pamGeneral: pam("statewide-general-rules", "Statewide General Rules"),
    pamFresh: pam("statewide-freshwater-regulations", "Statewide Freshwater Regulations"),
    pamDefs: pam("definitions", "Definitions"),
    pamHandling: pam("fish-handling-rules", "Fish Handling Rules"),
    pamSalmonId: pam("salmon-identification", "Salmon Identification"),
    pamFwId: pam("freshwater-fish-identification", "Freshwater Fish Identification"),
    pamSwId: pam("saltwater-fish-identification", "Saltwater Fish Identification"),
    pamEat: pam("eat-fish-choose-wisely", "Eat Fish, Choose Wisely"),
    pamShell: pam("shellfish-safety-information", "Shellfish Safety Information"),
    pamCrab: pam("crab-rules", "Crab Rules"),
    pamRazor: pam("razor-clam-rules", "Razor Clam Rules"),
    pamMarine: pam("marine-area-rules-definitions", "Marine Area Rules and Definitions"),
    pamMA11: pam("marine-area-11", "Marine Area 11"),
    nwsCold: { name: "National Weather Service: Cold Water Safety", url: "https://www.weather.gov/safety/coldwater" },
    appTrips: { name: "The app's seasons, the ones Hot Trips plans from", href: "#/trips" },
    appRuns: { name: "The app's run cards on Hot Trips", href: "#/trips" },
    appFish: { name: "The app's fish and spot cards", href: "#/fish" },
    appWater: { name: "The app's spot cards (the water you face, the bank, the hours)", href: "#/water" },
    appLakes: { name: "The app's lakes: WDFW's map, its plants and each pamphlet entry", href: "#/lakes" },
    appKayak: { name: "The app's Kayak course", href: "#/learn/kayak" },
    appFly: { name: "The app's Fly course", href: "#/learn/fly" }
  };

  // ---- the guides ---------------------------------------------------------
  // A guide: id, title, line (its one line), pic (its tile), src (its
  // sources) and sections. A section: id, title, line, points (shown
  // first), more (behind More), go (links into the app as chips) and src.
  // rules: true makes a section the red-edged Rules row; group puts it in
  // a list of its own under that heading. rows: true shows each point as a
  // picture row, its picture in pics (same order): a kind of water (view),
  // one of the app's drawings (plate) or a rig diagram (dia). A point that
  // starts with a link is that row's link and headline; head names the row
  // otherwise, and href makes it a link.
  var GUIDES = [
    { id: "start", title: "Start here in Washington", line: "License, catch card, passes, and the first five trips.",
      pic: { view: "lake", o: { seed: 2 } },
      sections: [
        { id: "license", pic: { view: "lake", o: { seed: 12 } }, title: "Get a license", line: "Buy it first, carry it always.",
          points: ["Buy the combination license. It covers fresh water, salt water and shellfish: a pier, a river and a lake on one license.",
            "Carry it on you, on the phone or on paper.",
            "[Kids under 16 fish free](#/squid/redondo/squid-regs). For salmon, steelhead, sturgeon or Puget Sound crab they need the free youth license: it carries the catch record card.",
            "[The license year starts in April](#/king/dash-point/salmon-license), so a license bought in winter runs out soon."],
          more: ["Only lakes and rivers? A freshwater license. Only the salt? A saltwater license, plus a shellfish license for crab, clams and squid.",
            "A shellfish license alone covers coastal crab, red rock crab, razor clams and squid. Puget Sound Dungeness crab also needs the crab endorsement and its catch record card.",
            "A shellfish license comes without the Vehicle Access Pass."],
          src: ["pamLicense", "appFish"] },
        { id: "card", pic: { plate: "coho" }, title: "The catch record card", line: "Salmon, steelhead, crab and more.",
          points: ["It counts the salmon, steelhead, sturgeon, halibut and Puget Sound Dungeness crab you keep.",
            "Carry it on every salmon or steelhead trip, even when you catch nothing.",
            "Fill it in the moment you keep a salmon or steelhead, before the next cast.",
            "The electronic card is in the Fish Washington app."],
          more: ["Puget Sound crab has its own card and a crab endorsement, at every age. [License and catch card](#/crab/westport/crab-license) says when to report it.",
            "Report it even when it is blank. A crab card reported late brings a fee."],
          go: [["License, catch card, emergency rules", "#/king/dash-point/salmon-license"], ["Crab license and card", "#/crab/westport/crab-license"]],
          src: ["pamLicense", "pamGeneral", "appFish"] },
        { id: "passes", pic: { view: "sound", o: { seed: 21 } }, title: "Parking passes", line: "Discover Pass, Vehicle Access Pass.",
          points: ["The Vehicle Access Pass is for WDFW land only, like the Weiss access on the Puyallup.",
            "Most annual fishing licenses include it.",
            "The Discover Pass covers State Parks, DNR land and WDFW land.",
            "Dash Point State Park needs the Discover Pass. [The cutthroat trip](#/cutthroat/dash-point) parks there."],
          more: ["A shellfish license comes without the Vehicle Access Pass.",
            "City and county parks set their own rules. Metzler Park on the Green needs no Discover Pass."],
          src: ["pamLicense", "appRuns"] },
        { id: "five", pic: { view: "pier" }, title: "Five first trips near Bonney Lake", line: "One step at a time, close to home.", rows: true,
          pics: [{ view: "lake", o: { seed: 5 } }, { view: "pier", o: { seed: 4 } }, { view: "river", o: { seed: 7 } }, { view: "sound", o: { seed: 9 } }, { view: "kayak-lake" }],
          points: ["[Lake Fenwick from shore](#/perch/lake-fenwick): perch and stocked trout, {when:trout-fenwick}. {drive:lake-fenwick}.",
            "[Squid at Redondo](#/squid/redondo) after dark, {when:squid-redondo}. {drive:redondo}.",
            "[Salmon on the Green](#/coho/green-river) from the bank: coho {when:coho-green-river}, chum {when:chum-green-river}. {drive:green-river}.",
            "[Sea-run cutthroat on the Dash Point beach](#/cutthroat/dash-point), {when:cutthroat-dash-point}. {drive:dash-point}.",
            "[Perch and trout from the kayak on American Lake](#/perch/american-lake), {when:trout-american}, on a calm day. {drive:american-lake}."],
          more: ["Closest of all is [Bonney Lake](#/lake/bonney-lake-pierce), after WDFW plants it. Hot Trips adds a stocked lake after a plant.",
            "[Lake Tapps](#/perch/lake-tapps) is the closest kayak lake. Hot Trips holds it back while the Allan Yorke ramp is closed.",
            "Then the coast: [razor clams](#/clams/ocean-shores) on WDFW's dig days, [crab off the Westport docks](#/crab/westport), and [surf perch on the ocean beach](#/surfperch/ocean-shores).",
            "Salmon dates for 2027 come with the 2027-28 pamphlet."],
          go: [["Hot Trips this week", "#/trips"], ["Lakes near you", "#/lakes"], ["For the kayak: Kit 5", "#/learn/gear/kit-kayak"], ["Re entry", "#/learn/kayak-reentry"],
            ["Staying safe", "#/learn/guides/safety"]],
          src: ["appTrips", "appRuns", "appLakes"] },
        { id: "new", pic: { view: "lake", o: { seed: 8, flip: true } }, title: "Bringing someone new", line: "A pier or a lake bank first.",
          points: ["Start on [Lake Fenwick](#/perch/lake-fenwick) or [a squid pier](#/squid/redondo). Nobody wades and nobody paddles.",
            "Each person fishes their own rod and keeps their own catch.",
            "Tie the knots at home. [Learn these first](#/learn) has the four that matter.",
            "Let [Hot Trips](#/trips) pick the hours, and keep the first trip short."],
          more: ["A kid on a salmon trip still carries a catch record card, from the free youth license.",
            "Nobody new goes on the Sound in a kayak until they have done the re entry drill on a warm lake. [Re entry](#/learn/kayak-reentry) says why."],
          src: ["pamLicense", "appKayak", "appTrips"] },
        { id: "rules", title: "Where the rules live", line: "Each water's own card, in the app.", rules: true,
          points: ["Open the rules card for the water you are going to, before the trip. Each says when it was checked and shows any newer WDFW rule."],
          go: [["Hot Trips: every run card has its Rules", "#/trips"], ["Green River rules", "#/coho/green-river/green-river-rules"],
            ["Puyallup rules", "#/coho/puyallup-sumner/puyallup-rules"], ["Marine Area 11: is it open?", "#/coho/dash-point/dash-season"],
            ["Squid rules", "#/squid/redondo/squid-regs"], ["Lakes near you, each with its pamphlet entry", "#/lakes"]],
          src: ["pamIndex", "appFish", "appLakes"] }
      ] },

    { id: "safety", title: "Staying safe", line: "Cold water, rivers, kayaks on the Sound, piers at night.",
      pic: { view: "kayak-sound", o: { seed: 6 } },
      sections: [
        { id: "cold", pic: { view: "sound", o: { seed: 14 } }, title: "Cold water", line: "The first minutes are the danger.",
          points: ["Wear the life jacket. It greatly raises the odds of living through a fall into cold water.",
            "The South Sound runs in the mid 40s F in winter.",
            "Cold shock is as dangerous in 50 to 60 F water as in 35 F water. Gasping can start in water as warm as 77 F.",
            "In the water: stay calm and get out as soon as you safely can.",
            "If you cannot: keep still, knees to your chin, arms at your sides, head out of the water, and wait for help."],
          go: [["Inflatable PFD", "#/learn/kayak-pfd"]], src: ["nwsCold", "appFish"] },
        { id: "kayak", pic: { view: "kayak-sound", o: { seed: 2 } }, title: "Kayaks on the Sound", line: "Decide at home, not at the ramp.",
          points: ["Over {limits:kayak}, stay off the Sound. Hot Trips will not plan it.",
            "No whitecaps and no Small Craft Advisory.",
            "Nobody takes a boat onto the Sound until they have climbed back on from deep water, alone, on a warm lake first.",
            "A wetsuit before any winter trip on the Sound."],
          go: [["Go or no go", "#/learn/kayak-gonogo"], ["Re entry", "#/learn/kayak-reentry"], ["Kit 5: the kayak", "#/learn/gear/kit-kayak"]], src: ["appKayak", "appTrips"] },
        { id: "rivers", pic: { view: "river", o: { seed: 9 } }, title: "Rivers and wading", line: "Read the gauge first.",
          points: ["Check the gauge before you go. A river run card's River tile says go or no-go.",
            "Rain raises a river and muddies it fast.", "Waders with grip soles.",
            "Fight a fish from the bank, downstream of it.",
            "A fall in a winter river is cold water too. [Cold water](#/learn/guides/safety/cold) says what to do."],
          more: ["Some rivers close at night. The rules card for the river says when."],
          go: [["Coho on the Green", "#/coho/green-river"]], src: ["appRuns", "appTrips", "nwsCold"] },
        { id: "night", pic: { view: "pier", o: { seed: 8 } }, title: "Piers and beaches at night", line: "Know the hours, light the rail.",
          points: ["Dash Point closes at dusk, and the Fox Island pier's park at sunset.",
            "Les Davis Pier is lit and open all night.",
            "The Point Defiance dock's hours after dark are not confirmed. Check them before a squid night.",
            "On the ocean beach, never turn your back on the waves. WDFW warns about big swells on dig nights."],
          go: [["Getting on the pier at Redondo", "#/squid/redondo/redondo-access"], ["Razor clams", "#/clams/ocean-shores"]], src: ["appWater", "appRuns"] },
        { id: "lights", pic: { plate: "squid" }, title: "Lights", line: "Boat, rail and headlamp.",
          points: ["Kayak after sunset: a white light shown all round.", "Pier: a white work light aimed out and down, on its own tether.",
            "Clam dig: a headlamp and a spare.", "Spare batteries in an inside pocket."],
          src: ["appKayak", "appRuns"] },
        { id: "dress", pic: { view: "surf", o: { seed: 7 } }, title: "Dress for it", line: "Cold, damp, and standing still.",
          points: ["On a pier you stand still for hours in the cold and damp.", "Dry clothes in the car on a dig night. You will be wet.",
            "Dress for the coast, not Bonney Lake.", "Dry gloves for the drive home after a steelhead day."],
          src: ["appRuns"] }
      ] },

    { id: "water", title: "Reading water", line: "Where fish hold on a pier, a beach, a river and a lake.",
      pic: { view: "river", o: { seed: 7, flip: true } },
      sections: [
        { id: "piers", pic: { view: "pier", o: { seed: 4 } }, title: "Puget Sound from a pier", line: "Fish where the tide runs toward.",
          points: ["Pick rail space on the side the tide is running toward.",
            "Salmon: moving tide is the window. Slack water is the break.",
            "Squid hold where the lit water meets the dark, not in the bright middle.",
            "Squid: a slack tide at dark with a soft ebb beats a night that runs hard. A dark moon beats a full one."],
          more: ["Des Moines Pier has a tire reef below it and a cleaning station at the end."],
          go: [["Squid at Redondo", "#/squid/redondo"], ["What makes a good night", "#/squid/redondo/squid-conditions"]],
          src: ["appRuns", "appFish", "appWater"] },
        { id: "beach", pic: { view: "sound", o: { seed: 9 } }, title: "Puget Sound from the beach", line: "Cutthroat cruise close to shore.",
          points: ["Start a few feet from the waterline. Sea-run cutthroat come up close.",
            "Cast at an angle along the beach, not straight out.",
            "The hour or two before high, on the incoming tide, is the window.",
            "When the tide slows and weed starts fouling the fly, the window is over."],
          more: ["Off Dash Point the bottom drops fast: from 30 ft at the closed pier's end to over 100 ft within about 100 yards.",
            "Coho travel the shallow lane along shore. Kings hold deeper, over the drop."],
          go: [["Cutthroat at Dash Point", "#/cutthroat/dash-point"], ["Where to anchor off Dash Point", "#/coho/dash-point/dash-where"]],
          src: ["appRuns", "appFish"] },
        { id: "surf", pic: { view: "surf" }, title: "The ocean beach", line: "Find the trough between breakers.",
          points: ["Never turn your back on the waves.",
            "Read the beach first. Cast into the trough, the darker band of water between breaking waves.",
            "Best on the incoming tide.",
            "Nothing in 20 minutes? Walk down the beach to the next trough.",
            "Surf perch school. Where you catch one, cast right back."],
          more: ["Check the ocean forecast before you leave. WDFW warns about swells over 11 ft.",
            "Grays Harbor has its own closures. [Surf perch rules](#/surfperch/westport/surf-rules) says which side to fish."],
          go: [["Surf perch at Ocean Shores", "#/surfperch/ocean-shores"], ["Rig: high low", "#/surfperch/ocean-shores/surf-rig"]],
          src: ["appRuns", "appFish"] },
        { id: "rivers", pic: { view: "river", o: { seed: 7 } }, title: "Rivers: the Green and the Puyallup", line: "Corkies in riffles, floats in seams.",
          points: ["Fast and broken water: corky and yarn. Slow seams: a float.",
            "Salmon rest in the slower slots off the main push, and tight to wood when the water is low and clear.",
            "Steelhead sit in walking speed water, 3 to 6 ft deep: tailouts and soft seams.",
            "Rain pulls fish in. The day the river drops and clears is the one."],
          more: ["The app reads a gauge for each river: the Green near Auburn, the Puyallup at Puyallup. A run card's River tile says go or no-go.",
            "Fish from public ground. At the 128th St E bridge no public bank is proven yet: park at the WDFW Weiss access."],
          go: [["Coho on the Green", "#/coho/green-river"], ["The Puyallup at Sumner", "#/coho/puyallup-sumner"], ["Float and jig: fish it", "#/coho/green-river/salmon-float-jig-fish"]],
          src: ["appRuns", "appFish"] },
        { id: "lakes", pic: { view: "lake", o: { seed: 5 } }, title: "Lowland lakes", line: "Plants, perch schools, bass edges.",
          points: ["Fish a lake in the days after a plant. Fresh trout cruise in schools: no bites in 20 minutes, move.",
            "Trout: PowerBait floating just off the bottom on a sliding sinker, where the lake allows bait.",
            "Selective gear and fly fishing only lakes: no bait, PowerBait included, and only flies or lures on barbless single-point hooks. The lake's page shows its pamphlet entry.",
            "Winter perch school deep, 20 to 40 ft. Find one and there are more.",
            "Bass hold on the edges, the wood and the stumps."],
          more: ["Cold water shuts bass down. One good bass evening at Lake Fenwick was overcast and glassy.",
            "WDFW plants tiger muskie in Lake Tapps. [Tiger muskie](#/fish/muskie) says what they are."],
          go: [["Lakes near you", "#/lakes"], ["Perch and trout at Lake Fenwick", "#/perch/lake-fenwick"], ["How winter perch work", "#/perch/lake-fenwick/perch-winter"]],
          src: ["appRuns", "appFish", "appLakes", "pamDefs"] },
        { id: "kayak", pic: { view: "kayak-sound" }, title: "Open water from the kayak", line: "Anchor right, or drift.",
          points: ["Anchor from the bow or the stern through the trolley, with the quick release float, never from the side.",
            "Pay out 3 times the depth, plus 10 ft if the tide is still coming in.",
            "Never anchor in moving river water. In strong current, drift instead.",
            "Bow into waves and wakes."],
          go: [["Anchor and scope", "#/learn/kayak-anchor"], ["Go or no go", "#/learn/kayak-gonogo"]],
          src: ["appKayak"] }
      ] },

    // The months are built in the app (RIG.guides.year), from the seasons
    // Hot Trips plans with.
    { id: "year", title: "The year in Washington", line: "Month by month, from the seasons Hot Trips uses.",
      pic: { view: "sound", o: { seed: 4 } }, year: true,
      go: [["Hot Trips this week", "#/trips"], ["Stocked lakes: Lakes near you", "#/lakes"]],
      sections: [], src: ["appTrips", "appLakes", "pamMA11", "pamRazor"] },

    { id: "salmon", title: "Salmon in Washington", line: "Five salmon, how to tell them, where to fish them.",
      pic: { view: "river", o: { seed: 3 } },
      sections: [
        { id: "five", pic: { plate: "king" }, title: "The five salmon", line: "King, coho, pink, chum, sockeye.",
          points: ["Chinook, called king.", "Coho, called silver.", "Pink, called humpy. Puget Sound pinks come back in odd years.",
            "Chum, called dog.", "Sockeye."],
          more: ["Steelhead are sea-run rainbow trout, not salmon. They share the rivers and the catch record card."],
          go: [["King", "#/king/dash-point"], ["Coho", "#/coho/green-river"], ["Pink", "#/pink/dash-point"], ["Chum", "#/chum/green-river"]],
          src: ["pamSalmonId", "pamFwId", "appFish"] },
        { id: "tell", pic: { plate: "coho" }, title: "Tell them apart", line: "Gums, spots and the tail.", rows: true,
          pics: [{ plate: "king", head: "King: black gums", href: "#/king/dash-point" }, { plate: "coho", head: "Coho: a white gum line", href: "#/coho/green-river" },
            { plate: "pink", head: "Pink: oval spots, tiny scales", href: "#/pink/dash-point" }, { plate: "chum", head: "Chum: no clear spots", href: "#/chum/green-river" },
            { plate: "sockeye", head: "Sockeye: gold eyes in the salt" }],
          points: ["King: black mouth and black gums. Big spots on the back and on both lobes of the tail.",
            "Coho: a white gum line. Spots on the back and on the upper lobe of the tail only.",
            "Pink: very small scales and big oval spots on both tail lobes. Spawning males grow a hump.",
            "Chum: no clear spots and faint calico bars. Spawning chum show olive-green bars, and males reddish-purple ones.",
            "Sockeye: no clear spots, gold eyes in the salt, brick red with a green head in the river."],
          more: ["A hatchery king or coho has its adipose fin clipped, the small fatty fin behind the back fin, with a healed scar. A wild one still has it."],
          go: [["Kings are not coho", "#/king/dash-point/king-vs-coho"]],
          src: ["pamSalmonId", "pamDefs", "appFish"] },
        { id: "where", pic: { view: "river", o: { seed: 13 } }, title: "River, Sound or pier", line: "Where and when, from the plans.",
          points: ["From the kayak off [Dash Point](#/coho/dash-point): kings {when:king-dash-point}, coho {when:coho-dash-point}.",
            "Salmon from the piers, {when:salmon-redondo}: Redondo, Les Davis, Des Moines and the Point Defiance boathouse. [Hot Trips](#/trips) lists them.",
            "[Coho on the Green](#/coho/green-river), {when:coho-green-river}, and [chum](#/chum/green-river), {when:chum-green-river}.",
            "The Puyallup at [Sumner](#/king/puyallup-sumner): kings {when:king-puyallup-sumner}, coho {when:coho-puyallup-sumner}.",
            "Salmon dates for 2027 come with the 2027-28 pamphlet. Until then Hot Trips holds those trips back."],
          more: ["[Pinks](#/pink/dash-point/pink-when) come back in 2027.",
            "Kings hold deep and far out over the drop. Coho run the shallow lane along shore.",
            "Pinks have a soft mouth. [Easy on the hookset](#/pink/dash-point/pink-soft)."],
          go: [["The year in Washington", "#/learn/guides/year"], ["Hot Trips", "#/trips"]],
          src: ["appTrips", "appRuns", "appFish", "pamMA11"] },
        { id: "gear", pic: { plate: "jig" }, title: "The gear", line: "Floats and corkies, metal on salt.",
          points: ["River: [float and jig](#/coho/green-river/salmon-float-jig-build) first, [corky and yarn](#/coho/green-river/salmon-corky-build) in faster water, [float and eggs](#/coho/green-river/salmon-float-eggs-build) in slow deep slots.",
            "Kayak coho: a hoochie on a jig head, or a Buzz Bomb with its treble swapped for a single barbless siwash. Work it fast.",
            "Kayak kings: [cut plug herring](#/king/dash-point/king-cutplug), mooched slow.",
            "Pier: a Buzz Bomb or a Point Wilson Dart, treble swapped for a single barbless siwash. Most hits come as it flutters down.",
            "Chum: pink, purple or chartreuse jigs.",
            "Salmon in the Sound: single point barbless hooks only. [Gear law from the kayak](#/coho/dash-point/dash-law) shows the swap."],
          more: ["A pier needs a long-handled net. A salmon has to come up the side of the pier.",
            "Hoochies stay home on the river. They are for the salt.",
            "On the Green and the Puyallup the anti-snagging rule allows one single point hook. A spinner's treble comes off."],
          go: [["Coho: hoochie and Buzz Bomb", "#/coho/dash-point/dash-coho"], ["Mooching rig: build it", "#/king/dash-point/king-mooch-build"]],
          src: ["pamMarine", "pamDefs", "appRuns", "appFish"] },
        { id: "keep", pic: { plate: "chum" }, title: "Keeping a salmon", line: "Fin, card, bled, on ice.",
          points: ["Check the fin while the fish is still in the water.",
            "Keep it? Fill in the catch record card right away, before the next cast.",
            "Bleed it and get it on ice.",
            "A salmon you cannot keep stays in the water. From the kayak, never bring it inside the gunwale."],
          more: ["Pinks turn dark and soft fast in the river. Keep the bright ones."],
          go: [["Handling and release", "#/learn/guides/handling"]],
          src: ["pamHandling", "pamGeneral", "appRuns", "appFish"] },
        { id: "rules", title: "Salmon rules", line: "Each water's own card, in the app.", rules: true,
          points: ["Every water has its own salmon rules, and emergency rules change them in season. Open its rules card before the trip."],
          go: [["License, catch card, emergency rules", "#/king/dash-point/salmon-license"], ["Marine Area 11: is it open?", "#/coho/dash-point/dash-season"],
            ["Gear law from the kayak", "#/coho/dash-point/dash-law"], ["Green River rules", "#/coho/green-river/green-river-rules"],
            ["Puyallup rules", "#/coho/puyallup-sumner/puyallup-rules"], ["Pier salmon: the Rules on each Hot Trip", "#/trips"]],
          src: ["appFish", "appRuns"] }
      ] },

    { id: "fly", title: "Fly fishing here", line: "Trout lakes, cutthroat on the beach, rivers.",
      pic: { view: "fly", o: { seed: 3, flip: true } },
      sections: [
        { id: "start", pic: { view: "fly" }, title: "Start with the Fly course", line: "Rod, line and three flies.",
          points: ["[The line is the weight](#/learn/fly-idea). The thick line is what you throw.",
            "A 4 weight is a small water rod: creeks, lakes, fish up to a couple of pounds.",
            "Three kinds of fly cover a start: [a dry, a nymph and a streamer](#/learn/fly-flies).",
            "[Strip, drift, mend, set](#/learn/fly-water)."],
          go: [["The Fly course", "#/learn/fly"], ["Your rod: 8 ft, 4 weight", "#/learn/fly-gear"]],
          src: ["appFly"] },
        { id: "beach", pic: { plate: "cutthroat" }, title: "Sea-run cutthroat on the beach", line: "Dash Point, the incoming tide.",
          points: ["[Dash Point](#/cutthroat/dash-point), {when:cutthroat-dash-point}. [Every one goes back](#/cutthroat/dash-point/src-rules).",
            "Clouser minnows in olive and white, or a pink Smile Blade Fly that looks like a shrimp, on barbless hooks.",
            "Let the fly sit until the rings on the water settle. Then strip at an even pace.",
            "Wind is the problem for a 4 weight. Beach anglers mostly use 5 to 7 weights."],
          more: ["Brighter colors when the water is murky.", "A first trip with no fish is normal."],
          go: [["Will the 4 weight do?", "#/cutthroat/dash-point/src-gear"]],
          src: ["appRuns", "appFish"] },
        { id: "lakes", pic: { plate: "rainbow" }, title: "Trout lakes", line: "A streamer on stocked trout.",
          points: ["A streamer such as a Woolly Bugger, cast and stripped back.",
            "Fish the days after a plant. [Lakes near you](#/lakes) shows WDFW's plants.",
            "Some lakes are fly fishing only or selective gear: flies or lures on barbless single-point hooks, no bait. The lake's page shows its pamphlet entry."],
          src: ["appFly", "appLakes"] },
        { id: "rivers", pic: { view: "river", o: { seed: 4, flip: true } }, title: "Rivers", line: "Dead drift, one mend.",
          points: ["Cast up and across at 45 degrees. The fly floats at the speed of the current, no wake.",
            "Mend once: a lazy flip that throws the belly of the line upstream.",
            "On a bigger fish, get the slack onto the reel and let the drag work."],
          more: ["Fly fishing only water has its own gear rules. The pamphlet's Definitions page has them."],
          go: [["Strip, drift, mend, set", "#/learn/fly-water"]],
          src: ["appFly", "pamDefs"] }
      ] },

    { id: "handling", title: "Handling and release", line: "Wild or hatchery, barbless, release well, keep well.",
      pic: { plate: "hook", view: "sound" },
      sections: [
        { id: "release", pic: { plate: "hook" }, title: "Release a fish well", line: "In the water, wet hands, quick.",
          points: ["Leave it in the water if you can.", "Wet hands, and out quickly.",
            "Hook in the mouth or the jaw: a dehooker.", "Hook swallowed: cut the leader.",
            "Fingers away from the eyes and the gills."],
          more: ["Skip the net when you can. If you net one, use a soft knotless or rubber net."],
          src: ["pamHandling", "appFish"] },
        { id: "wild", pic: { plate: "steelhead" }, title: "Wild or hatchery", line: "Look at the fin.",
          points: ["A hatchery king or coho has a clipped adipose fin with a healed scar.",
            "A hatchery steelhead or trout has a clipped adipose or ventral fin.",
            "On release wild water, only a fin-clipped fish may be kept.",
            "Check the fin while the fish is still in the water."],
          go: [["Gear law from the kayak", "#/coho/dash-point/dash-law"]],
          src: ["pamDefs", "pamSalmonId", "pamHandling"] },
        { id: "barbless", pic: { plate: "jig" }, title: "Barbless", line: "Pinch them flat at home.",
          points: ["Barbless means the barb was left off at the factory, filed off, or pinched down.",
            "Pinch every barb flat in the garage, jig heads included.",
            "Salmon in the Sound and on the coast: single point barbless hooks. A pinched treble is still not legal.",
            "On other water, its rules card says when barbless is required."],
          go: [["Gear law from the kayak", "#/coho/dash-point/dash-law"], ["Puyallup rules", "#/coho/puyallup-sumner/puyallup-rules"], ["Cutthroat: catch and release", "#/cutthroat/dash-point/src-rules"]],
          src: ["pamDefs", "pamMarine", "appFish"] },
        { id: "keep", pic: { plate: "squid" }, title: "Keeping and cleaning", line: "Ice first, proof to shore.",
          points: ["Bleed a salmon, and get every fish on ice right away.",
            "Keep proof of the fish's kind and size until you are ashore and done for the day.",
            "Before you take shellfish from any public beach, check the WDFW season and the Department of Health's closures, the same day.",
            "Squid: clean them the next morning, not at midnight.",
            "Rinse reels and gear in fresh water after salt."],
          more: ["Wasting fish is against the rules: never kill a fish and throw it back.",
            "Before you eat fish from a lake, read the pamphlet's Eat Fish, Choose Wisely page.",
            "Digs get cancelled for toxins. The pamphlet's shellfish safety page has the rest."],
          go: [["Cleaning and gutting squid", "#/squid/redondo/squid-clean"], ["Fried calamari", "#/squid/redondo/squid-cook"], ["Two checks before any beach", "#/clams/ocean-shores/clam-sound"]],
          src: ["pamGeneral", "pamEat", "pamShell", "appRuns", "appFish"] },
        { id: "crab", pic: { plate: "crab" }, title: "Crab", line: "Measure every one.",
          points: ["Dungeness females and every soft shell go back.", "Measure straight across the back, in front of the points.",
            "Every kept crab keeps its back shell in the field, all the way home.",
            "Clean crab before cooking. Eat only the meat, never the butter."],
          go: [["Keep or throw back", "#/crab/westport/crab-keep"], ["Two checks before any beach", "#/clams/ocean-shores/clam-sound"]],
          src: ["pamCrab", "pamShell", "appFish"] }
      ] },

    { id: "gear", title: "Gear", line: "What each lure and rig is for here, and kits from small to big.",
      pic: { plate: "jig", view: "lake", o: { seed: 9 } }, home: "#/learn/gear",
      sections: [
        { id: "lures", pic: { plate: "jig" }, title: "Lures and what they are for", line: "Spinners, jigs, metal, plastics.",
          points: ["Spinners (Rooster Tail, Blue Fox): trout and bass in the lakes. On selective gear lakes, a barbless single-point hook.",
            "Coho in the river: one single barbless hook, inside the anti-snagging rule on that river's rules card.",
            "Jigs under a float: river coho, chum, pinks and steelhead.",
            "Metal that flutters (Buzz Bomb, Point Wilson Dart): salmon from a pier or the kayak, treble swapped for a single barbless siwash.",
            "Squid jigs: squid, under the pier lights.",
            "Soft plastics (a Dinger, a Texas rigged worm): bass."],
          more: ["Flies: cutthroat on the beach, and trout in the lakes and rivers."],
          go: [["Chartreuse Rooster Tail", "#/bass/lake-fenwick/bass-roostertail"], ["Blue Fox: build it", "#/coho/green-river/salmon-blue-fox-build"], ["Jigs: size, colour and glow", "#/squid/redondo/squid-lures"],
            ["Gear law from the kayak", "#/coho/dash-point/dash-law"]],
          src: ["appRuns", "appFish", "pamMarine", "pamDefs"] },
        { id: "rigs", pic: { plate: "knot" }, title: "Rigs", line: "One rig for each kind of water.", rows: true,
          pics: [{ dia: "river-float-eggs", crop: "78 560 124 124" }, { dia: "river-float-jig", crop: "72 506 136 136" }, { dia: "river-corky", crop: "105 240 225 225" },
            { view: "kayak-sound", o: { seed: 4 } }, { dia: "squid-vertical", crop: "92 214 188 200" }, { view: "surf", o: { seed: 5 } }],
          points: ["[Float and eggs](#/coho/green-river/salmon-float-eggs-build): the river's slow, deep slots.",
            "[Float and jig](#/coho/green-river/salmon-float-jig-build): the river, first.",
            "[Corky and yarn](#/coho/green-river/salmon-corky-build): faster river water.",
            "[The mooching rig](#/king/dash-point/king-mooch-build): kings from the kayak.",
            "[The squid rig](#/squid/redondo/squid-rig): two jigs on one line to start.",
            "[The high low rig](#/surfperch/ocean-shores/surf-rig): surf perch from the beach."],
          more: ["Stocked trout: a sliding sinker with PowerBait floating above it, on a lake that allows bait."],
          src: ["appRuns", "appFish"] },
        { id: "bait", pic: { plate: "hook" }, title: "Bait", line: "Eggs, herring, clam, PowerBait.",
          points: ["Cured salmon eggs on the river. [Keeping eggs on](#/coho/green-river/salmon-bait) shows how.",
            "Herring, cut plug, for kings.", "Razor clam, shrimp or Gulp sandworm for surf perch.",
            "PowerBait for stocked trout, where the lake allows bait. A bit of worm on a small jig for perch."],
          more: ["In fresh water, no live fish or other live water animals as bait, with three exceptions on the pamphlet's freshwater page. Worms are fine.",
            "Selective gear and fly fishing only waters: no bait, scented lures included, and barbless single-point hooks only."],
          src: ["appRuns", "appFish", "pamFresh", "pamDefs"] },
        { id: "kit-lake", pic: { view: "lake", o: { seed: 3 } }, title: "Kit 1: the lake", group: "Kits, smallest first", line: "Smallest kit, most stocked lakes.",
          points: ["A light spinning rod with 4 to 6 lb line.", "PowerBait, sliding sinkers, small hooks.",
            "Small perch jigs and a 1/8 oz Rooster Tail.", "Pliers, a small cooler, a freshwater license.",
            "Some stocked lakes are selective gear or fly fishing only: no bait, barbless single-point hooks only. The lake's page shows its pamphlet entry."],
          more: ["That kit fishes Lake Fenwick, Bonney Lake and most stocked lakes on the list."],
          go: [["Lakes near you", "#/lakes"]], src: ["appRuns", "appLakes", "pamDefs"] },
        { id: "kit-river", pic: { view: "river", o: { seed: 2 } }, title: "Kit 2: the river", group: "Kits, smallest first", line: "Floats, corkies, eggs.",
          points: ["A 7.5 ft river rod with 30 lb braid.", "Floats, bobber stops, beads and 1/4 oz jigs.",
            "Corkies, yarn, and single hooks.", "Cured eggs and bait thread to hold them on.",
            "A net, pliers, a cooler, the license and the catch record card."],
          go: [["Keeping eggs on", "#/coho/green-river/salmon-bait"]], src: ["appRuns", "appFish"] },
        { id: "kit-pier", pic: { view: "pier", o: { seed: 6 } }, title: "Kit 3: the pier at night", group: "Kits, smallest first", line: "Squid, then pier salmon.",
          points: ["A 9 ft light rod with 10 to 15 lb braid.", "Squid jigs, 2.0 to 2.5 early in the season, bigger later.",
            "A white work light with its own safety tether, and a headlamp.", "A bucket, a cooler with ice, and a rag for the ink.",
            "For pier salmon: Buzz Bombs with the treble swapped for a single barbless siwash, and a long-handled net.",
            "A combination license covers both. Pier salmon also needs the catch record card."],
          go: [["Rod, line and jigs", "#/squid/redondo/squid-gear"], ["Gear law from the kayak", "#/coho/dash-point/dash-law"]], src: ["appRuns", "appFish", "pamLicense", "pamMarine"] },
        { id: "kit-coast", pic: { view: "surf", o: { seed: 3 } }, title: "Kit 4: the coast", group: "Kits, smallest first", line: "Clams, crab, surf perch.",
          points: ["A clam gun or a shovel, and a container for each digger.", "Ring nets or snares, rope, a bait cage and a crab gauge.",
            "The surf rods, pyramid sinkers, high low rigs and a sand spike.", "Waders or tall boots, and a rain shell.",
            "Never turn your back on the waves. Check the ocean forecast before you leave."],
          go: [["What to bring for clams", "#/clams/ocean-shores/clam-gear"], ["Pots, ring nets and buoys", "#/crab/westport/crab-gear"]], src: ["appRuns", "appFish"] },
        { id: "kit-kayak", pic: { view: "kayak-lake" }, title: "Kit 5: the kayak", group: "Kits, smallest first", line: "Safety gear before fishing gear.",
          points: ["A PFD, worn. Foam or an automatic inflatable when the water is cold, which here is most of the year: a manual vest needs a pull you may not manage during cold shock.", "Cylinder screwed in and the indicator green, or it is not a PFD.",
            "An anchor with a long rode, flaked into a bucket.", "A white light for after dark.", "A wetsuit before any winter trip on the Sound.", "Pliers mounted on the boat, in reach."],
          go: [["Inflatable PFD", "#/learn/kayak-pfd"], ["Anchor and scope", "#/learn/kayak-anchor"], ["Staying safe", "#/learn/guides/safety"]], src: ["appKayak", "appFish"] }
      ] }
  ];

  // ---- About the fish ---------------------------------------------------------
  // On the nine fish pages CastAI wrote one for. what: two lines. tell: how
  // to know it. where: the app's own spots, with the months from the plans.
  // takes: what the app fishes for it; a link opens its card.
  var NEXT = "2027 dates come with the 2027-28 pamphlet.";
  var ABOUT = {
    king: { what: "Chinook. They hold deeper than coho, over the drop, and take a slow spinning herring. Kings that live in the Sound through the winter are blackmouth, and they feed along the piers.",
      tell: ["Black mouth and black gums.", "Big spots on the back and on both lobes of the tail."],
      where: ["From the kayak off [Dash Point](#/king/dash-point), {when:king-dash-point}.",
        "From the piers, {when:salmon-redondo}. [Hot Trips](#/trips) lists them.",
        "The Puyallup at [Sumner](#/king/puyallup-sumner), {when:king-puyallup-sumner}.", NEXT],
      takes: ["[Cut plug herring](#/king/dash-point/king-cutplug)", "Buzz Bomb, single barbless siwash", "[Corky and yarn](#/coho/green-river/salmon-corky-build)",
        "[Float and jig](#/coho/green-river/salmon-float-jig-build)"],
      src: ["pamSalmonId", "pamMA11", "appRuns", "appFish"] },
    coho: { what: "Silver salmon. In the Sound they run the shallow lane along shore and chase a fast lure. In the river they come in pulses, and fall rain brings them.",
      tell: ["A white gum line.", "Spots on the back and on the upper lobe of the tail only."],
      where: ["From the kayak off [Dash Point](#/coho/dash-point), {when:coho-dash-point}.", "[The Green](#/coho/green-river), {when:coho-green-river}.",
        "The Puyallup at [Sumner](#/coho/puyallup-sumner), {when:coho-puyallup-sumner}.", NEXT],
      takes: ["[Hoochie on a jig head](#/coho/dash-point/dash-coho)", "Buzz Bomb, single barbless siwash", "[Float and jig](#/coho/green-river/salmon-float-jig-build)",
        "[Corky and yarn](#/coho/green-river/salmon-corky-build)", "[Blue Fox, single hook](#/coho/green-river/salmon-blue-fox-build)"],
      src: ["pamSalmonId", "pamMA11", "appRuns", "appFish"] },
    pink: { what: "The humpy. Puget Sound pinks come back in odd years, so the next run is 2027. A soft mouth: easy on the hookset.",
      tell: ["Big oval spots on both lobes of the tail.", "Very small scales.", "Spawning males grow a hump."],
      where: ["Off [Dash Point](#/pink/dash-point), on [the Green](#/pink/green-river) and on the Puyallup. Hot Trips holds them back until the 2027 rules are read."],
      takes: ["Small pink jig under a float", "Pink corky and yarn"],
      src: ["pamSalmonId", "appTrips", "appFish"] },
    steelhead: { what: "Ocean-run rainbow trout, back from one to three years at sea. Winter fish here, and the hardest to catch: a fish or two in a day is a win.",
      tell: ["A hatchery steelhead has a clipped adipose or ventral fin with a healed scar.", "[A wild one still has its fins. It stays in the water](#/steelhead/green-river/steel-season)."],
      where: ["Tokul Creek and the Snoqualmie from the Plum ramp up to the falls, {when:steelhead-tokul}. [Hot Trips](#/trips) plans it.",
        "The Cowlitz, {when:steelhead-cowlitz}, with the Columbia River endorsement.",
        "[The Green](#/steelhead/green-river): held back while its steelhead rules are not confirmed."],
      takes: ["Pink jig under a slip float", "Pink worm on a jig head", "Cured eggs under a float"],
      src: ["pamFwId", "pamDefs", "pamHandling", "appRuns", "appTrips"] },
    cutthroat: { what: "Sea-run cutthroat live along the Sound's beaches and cruise close to shore. [In salt water every one goes back](#/cutthroat/dash-point/src-rules).",
      tell: ["The upper jaw bone usually reaches past the back of the eye.", "There may be a red or orange slash under the jaw.", "Many close spots toward the back fin and the tail."],
      where: ["[The Dash Point beach](#/cutthroat/dash-point), {when:cutthroat-dash-point}, best on the incoming tide."],
      takes: ["Clouser minnow, olive and white, barbless", "Smile Blade Fly, pink, barbless", "Small silver spoon, single barbless hook"],
      src: ["pamFwId", "appRuns", "appFish"] },
    surfperch: { what: "Perch of the surf line on the ocean beaches. They school: where you catch one, cast right back.",
      tell: ["The redtail surfperch, the one drawn here: deep silver, bars down the side, a red tail.",
        "Other perch you may see: pile perch, gray with a dark bar and a deeply forked tail.", "Striped perch, with blue and yellow stripes.", "Shiner perch, small, with yellow bars."],
      where: ["[Ocean Shores](#/surfperch/ocean-shores) and [Westport](#/surfperch/westport) ocean beaches, {when:surfperch-ocean-shores}, best {peak:surfperch-ocean-shores}."],
      takes: ["Razor clam", "Shrimp", "Gulp sandworm", "[High low rig](#/surfperch/ocean-shores/surf-rig)"],
      src: ["pamSwId", "appRuns", "appFish"] },
    bass: { what: "Largemouth hold on the edges, the wood and the stumps in the lakes. Most bites come as the lure falls. Cold water shuts them down.",
      tell: ["Largemouth: a dark band along the side, and the jaw reaches past the eye.", "Smallmouth: bronze sides with dark bars, and the jaw stops short of the eye."],
      where: ["[Lake Fenwick](#/bass/lake-fenwick), {when:bass-fenwick}, best {peak:bass-fenwick}.", "[Lakes near you](#/lakes) shows which lakes WDFW's map lists bass in."],
      takes: ["[Rooster Tail, chartreuse](#/bass/lake-fenwick/bass-roostertail)", "Wacky rigged Dinger", "Texas rigged worm"],
      src: ["pamFwId", "appRuns", "appFish", "appLakes"] },
    perch: { what: "Yellow perch school: find one and there are more. In winter they school deep. Stocked trout come in with WDFW's plants.",
      tell: ["Yellow perch: greenish to yellow, dark bars down the side, no big teeth.", "Rainbow trout: the upper jaw usually stops at the back of the eye. A cutthroat's goes past it."],
      where: ["[Lake Fenwick](#/perch/lake-fenwick) from shore, {when:trout-fenwick}.", "[American Lake](#/perch/american-lake) from the kayak, {when:trout-american}.",
        "Any lake in the days after a plant: [Lakes near you](#/lakes)."],
      takes: ["Small jig with a bit of worm", "PowerBait off the bottom, where bait is allowed", "Rooster Tail, 1/8 oz"],
      src: ["pamFwId", "pamDefs", "appRuns", "appFish", "appLakes"] },
    crab: { what: "Dungeness and red rock crab. At Westport, ring nets and snares fish all year, pots only in the pot season: [the Westport card](#/crab/westport/westport-crab) has the dates. Clean crab before cooking and eat only the meat.",
      tell: ["A female has a wide round apron underneath.", "A soft shell flexes when you squeeze it.", "What to keep: [Keep or throw back](#/crab/westport/crab-keep)."],
      where: ["[The Westport docks](#/crab/westport) with a ring net or snare, {when:crab-westport}.", "Puget Sound near Tacoma: [check whether it is open](#/crab/dash-point/dash-crab) before you go."],
      takes: ["Ring net", "Snare", "Bait in a cage"],
      src: ["pamCrab", "pamShell", "appRuns", "appFish"] }
  };

  // ---- filled in from the app's own data --------------------------------------
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var NB = " "; // a number stays on the line with its unit
  function trips() { return RIG.trips || null; }
  function planById(id) { var T = trips(); return T ? T.plans.filter(function (p) { return p.id === id; })[0] || null : null; }
  function spotById(id) { var T = trips(); return T ? T.spots.filter(function (s) { return s.id === id; })[0] || null : null; }
  function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayOf(y, m, d) { return { y: y, m: m, d: d, iso: y + "-" + pad(m) + "-" + pad(d) }; }
  // Where a plan can be fished, by the planner's own season() and ruleOn():
  // the months with a day in season whose rules are read (over 2026 and
  // 2027, so odd-year pinks count), the first and last such day in each,
  // and the years they fall in. want: "peak" for its peak days only.
  function reach(p, want) {
    var T = trips(), out = { months: [], first: {}, last: {}, years: [] };
    if (!T || !p) return out;
    for (var m = 1; m <= 12; m++) {
      [2026, 2027].forEach(function (y) {
        for (var d = 1; d <= daysIn(y, m); d++) {
          var day = dayOf(y, m, d), s = T.season(p, day);
          if (!s || (want && s !== want) || T.ruleOn(p, day) !== "confirmed") continue;
          if (out.months.indexOf(m) === -1) out.months.push(m);
          if (!out.first[m] || d < out.first[m]) out.first[m] = d;
          if (!out.last[m] || d > out.last[m]) out.last[m] = d;
          if (out.years.indexOf(y) === -1) out.years.push(y);
        }
      });
    }
    return out;
  }
  function monthsOf(p, want) { return reach(p, want).months; }
  // [10, 11, 12, 1, 2] is "October to February"; twelve whole months, "all
  // year". A season that starts or ends inside a month says so: the Green's
  // coho open on the 16th, "mid September"; Tokul shuts on the 15th, "to mid
  // February".
  function span(ms, r) {
    if (!ms.length) return "";
    var from = function (m) { var d = r && r.first[m]; return !d || d <= 3 ? "" : d <= 17 ? "mid " : "late "; };
    var to = function (m) { var d = r && r.last[m]; return !d || d >= daysIn(2027, m) - 3 ? "" : d >= 11 ? "mid " : "early "; };
    if (ms.length === 12 && ms.every(function (m) { return !from(m) && !to(m); })) return "all year";
    var has = function (m) { return ms.indexOf(((m - 1 + 12) % 12) + 1) !== -1; };
    var runs = [];
    ms.forEach(function (m) {
      if (has(m - 1) && ms.length < 12) return;
      if (ms.length === 12 && runs.length) return;
      var e = m;
      while (has(e + 1) && ((e % 12) + 1) !== m) e = (e % 12) + 1;
      if (m === e) { var a = from(m), b = to(m); runs.push((a && b ? "mid " : a || b) + MONTHS[m - 1]); }
      else runs.push(from(m) + MONTHS[m - 1] + " to " + to(e) + MONTHS[e - 1]);
    });
    return runs.length > 1 ? runs.slice(0, -1).join(", ") + " and " + runs[runs.length - 1] : runs[0];
  }
  // A plan whose rules end (a ruleYear, a rulesUntil) and whose read days
  // all fall in one year says which: "in 2026". The next year's dates are
  // not set until its pamphlet.
  function when(id, want) {
    var p = planById(id), r = reach(p, want), s = span(r.months, r);
    if (!p || !s) return "";
    if (!((p.ruleYear || p.rulesUntil) && r.years.length === 1)) return s;
    // A season wholly in one year that has already ended: say so, and that
    // next year's dates wait for the next pamphlet, never "in 2026" as if open.
    var lastM = r.months.reduce(function (a, b) { return Math.max(a, b); }, 0);
    var ended = lastM && new Date(r.years[0], lastM - 1, r.last[lastM] || 1, 23, 59) < nowDate();
    return ended ? s + " (" + r.years[0] + " season over)" : s + " in" + NB + r.years[0];
  }
  function nowDate() { return (RIG.guides && RIG.guides.now) ? new Date(RIG.guides.now) : new Date(); }
  function drive(id) {
    var s = spotById(id), m = s ? Math.round(s.drive) : 0, h = Math.floor(m / 60);
    if (!m) return "";
    return (h ? h + NB + "hr" + (m % 60 ? " " + (m % 60) + NB + "min" : "") : m + NB + "min") + " drive";
  }
  function limits(how) {
    var T = trips(), l = T && T.limits && T.limits[how];
    return l ? l.wind + NB + "mph wind or " + l.gust + NB + "mph gusts" : "";
  }
  // Fill the {tokens} in one line. A token the data cannot fill is left as
  // "" and the guard test fails on it, so a renamed plan cannot slip by.
  function text(s) {
    return String(s).replace(/\{(when|peak|drive|limits):([a-z0-9-]+)\}/g, function (m, k, id) {
      if (k === "when") return when(id);
      if (k === "peak") return when(id, "peak");
      if (k === "drive") return drive(id);
      return limits(id);
    });
  }

  // ---- the year -----------------------------------------------------------------
  // Twelve months from this one, each built from the plans the way Hot Trips
  // lists them: a plan is in a month when some day of it is in season, its
  // rules are confirmed that day and nothing holds it back (a closed ramp).
  // In season but not confirmed: named, with the reason, as Hot Trips does.
  // Plans that share a reason share one line; a closed ramp is said once, in
  // the first month it holds a trip back. Stocked lakes (plans made from the
  // WDFW feed) are left to Lakes near you.
  var FISH = { squid: "Squid", clams: "Razor clams", crab: "Crab", surfperch: "Surf perch", cutthroat: "Sea-run cutthroat", coho: "Coho",
    king: "Kings", pink: "Pinks", chum: "Chum", steelhead: "Winter steelhead", perch: "Perch and trout", bass: "Bass" };
  var VIEW = { squid: "pier", crab: "pier", surfperch: "surf", cutthroat: "sound", steelhead: "river" };
  function isRiver(p) { var s = spotById(p.spot); return !!(s && s.river) || /green-river|puyallup|tokul|cowlitz/.test(p.spot); }
  // A month's group: its key, its name, the kind of water its picture
  // shows, and a note when the place alone does not say enough.
  function groupOf(p) {
    if (p.kind === "pier-salmon") return { key: "pier-salmon", name: "Salmon from the piers", view: "pier" };
    var f = FISH[p.species] || p.species;
    if (p.species === "squid") return { key: "squid", name: "Squid from the piers after dark", view: "pier" };
    if (p.digs) return { key: "clams", name: "Razor clams, on WDFW's dig days only", view: "surf", note: "Each dig day has its own beach. The card lists them." };
    if (p.how === "kayak") return { key: p.species + "-kayak", name: f + " from the kayak", view: /lake/.test(p.spot) ? "kayak-lake" : "kayak-sound" };
    if (isRiver(p) && p.species !== "steelhead") return { key: p.species + "-river", name: f + " in the rivers", view: "river" };
    return { key: p.species, name: f, view: VIEW[p.species] || "lake" };
  }
  // The place: the spot's own name. A dig is the plan's beaches (Copalis and
  // Mocrocks): Ocean Shores sits on Copalis, and a Mocrocks day is closed
  // there.
  function placeOf(p) {
    if (p.digs) return p.name.replace(/^Razor clams,\s*/, "");
    var s = spotById(p.spot), C = RIG.content, cs = C && C.spots ? C.spots.filter(function (x) { return x.id === p.spot; })[0] : null;
    return (s && s.name) || (cs && cs.name) || p.spot;
  }
  // The place's own screen: the fish at that spot, when the app has one.
  function hrefOf(p) {
    var C = RIG.content, sp = C && C.species ? C.species.filter(function (x) { return x.id === p.species; })[0] : null;
    return sp && (sp.locations || []).some(function (l) { return l.id === p.spot; }) ? "#/" + p.species + "/" + p.spot : "#/trips";
  }
  // "Salmon off Dash Point" and "Salmon on the Green": "Salmon off Dash
  // Point and on the Green".
  function joinNames(ns) {
    var w = ns[0].split(" ")[0], same = ns.length > 1 && ns.every(function (n) { return n.split(" ")[0] === w; });
    var xs = same ? ns.map(function (n, i) { return i ? n.slice(w.length + 1) : n; }) : ns;
    return xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs[0];
  }
  function year(todayIso) {
    var T = trips();
    if (!T || !/^\d{4}-\d\d/.test(todayIso || "")) return [];
    var y0 = +todayIso.slice(0, 4), m0 = +todayIso.slice(5, 7), out = [], said = {};
    for (var i = 0; i < 12; i++) {
      var y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
      var groups = {}, order = [], held = {}, heldOrder = [], listed = {};
      T.plans.forEach(function (p) {
        if (p.gen || !spotById(p.spot)) return;
        var best = "", why = "", ramp = false, d0 = 0, d1 = 0;
        for (var d = 1; d <= daysIn(y, m); d++) {
          var day = dayOf(y, m, d), s = T.season(p, day);
          if (!s) continue;
          var r = T.ruleOn(p, day);
          if (r !== "confirmed") { why = why || r; continue; }
          if (p.access) { if (!why) { why = p.access; ramp = true; } continue; }
          if (s === "peak") best = "peak"; else if (!best) best = "ok";
          if (!d0) d0 = d;
          d1 = d;
        }
        if (best) {
          var g = groupOf(p);
          if (!groups[g.key]) { groups[g.key] = { key: g.key, name: g.name, view: g.view, note: g.note || "", peak: false, places: [] }; order.push(g.key); }
          if (best === "peak") groups[g.key].peak = true;
          // A season that opens or shuts inside the month says its day on the
          // chip: Tokul shuts Feb 15, so February reads "to Feb 15".
          var mon = MONTHS[m - 1].slice(0, 3), pl = { plan: p.id, name: placeOf(p), href: hrefOf(p), peak: best === "peak" };
          if (d0 > 3) pl.from = "from " + mon + " " + d0;
          if (d1 && d1 < daysIn(y, m) - 3) pl.until = "to " + mon + " " + d1;
          groups[g.key].places.push(pl);
          listed[p.listAs || p.id] = true;
        } else if (why) {
          if (ramp && said[p.id]) return;
          if (ramp) said[p.id] = true;
          var k = p.listAs || p.id;
          if (!held[k]) { held[k] = { name: p.listAs || p.name, why: why }; heldOrder.push(k); }
        }
      });
      var list = order.map(function (k) { return groups[k]; }), byWhy = {}, notListed = [];
      heldOrder.filter(function (k) { return !listed[k]; }).forEach(function (k) {
        var h = held[k];
        if (byWhy[h.why]) byWhy[h.why].names.push(h.name);
        else notListed.push(byWhy[h.why] = { names: [h.name], why: h.why });
      });
      notListed.forEach(function (h) { h.name = joinNames(h.names); });
      out.push({ y: y, m: m, iso: y + "-" + pad(m), name: MONTHS[m - 1], label: MONTHS[m - 1] + " " + y, now: i === 0,
        peak: list.filter(function (g) { return g.peak; }), good: list.filter(function (g) { return !g.peak; }),
        held: notListed,
        plans: list.reduce(function (n, g) { return n.concat(g.places.map(function (x) { return x.plan; })); }, []) });
    }
    return out;
  }

  RIG.guides = {
    checked: "2026-11-27",
    sources: SOURCES,
    guides: GUIDES,
    about: ABOUT,
    guide: function (id) { return GUIDES.filter(function (g) { return g.id === id; })[0] || null; },
    text: text, span: span, when: when, monthsOf: monthsOf, year: year, groupOf: groupOf
  };
})(typeof window !== "undefined" ? window : globalThis);
