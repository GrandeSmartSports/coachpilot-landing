// Hot Trips: the week ahead, built from real forecasts.
//
// Two halves, kept apart on purpose so all of this can move into CastAI:
//   1. DATA (RIG.trips.spots, RIG.trips.plans): plain JSON, stable ids that
//      match the Rig Card spot and species ids.
//   2. PLANNER (RIG.trips.plan): a pure function. Forecast in, days out. No
//      DOM, no fetch, no clock it did not get handed. Tests feed it fixtures.
//
// Sources are the same free ones CastAI uses: Open-Meteo (weather + marine),
// NOAA CO-OPS (tide predictions). Moon phase is computed, not fetched.
//
// Honesty rules, from Coach (2026-11-23):
//   - only good trips are listed. A slow week shows one or two, or none.
//   - a plan whose rules are not confirmed is NOT listed. It is named in the
//     "not listed" note instead, so nothing is silently missing.
//   - weather can cancel a whole day, and the day says so.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});

  // The Puyallup's go or no-go, read at NOAA PUYW1 (USGS 12101500, the
  // Puyallup at Puyallup, below the White). Coach was asked (11/27) and is
  // not sure, so these two lines are the lead's call from 12 years of the
  // gauge's in-season daily flows (USGS daily means, 2014 to 2026): good up
  // to about the fall season's 75th percentile (1,790 cfs; all four of
  // Coach's 2026 days were under 1,600), no-go above about its 90th (3,370
  // to 3,470). Tune them here, and only here, when Coach logs trips. NWS's
  // own flood levels at this gauge are a stage (action at 24 ft), not a
  // flow, so there is no flood flow. lead: the card calls these starting
  // numbers, never guide numbers.
  var PUYALLUP_FLOW = { good: 1800, high: 3500 };
  function puyallupRiver() {
    return { gauge: "PUYW1", usgs: "12101500", name: "Puyallup River at Puyallup", good: PUYALLUP_FLOW.good, high: PUYALLUP_FLOW.high,
      flood: null, floodStage: 24, lead: true };
  }

  // Coordinates are for the weather grid only (about 1 to 2 km), not for
  // navigation. Drive minutes are from Bonney Lake.
  var spots = [
    { id: "redondo", lat: 47.349, lon: -122.324, drive: 35, tide: "9446248" },
    // river: the gauge that decides go or no-go, flows in cfs.
    //   good:  up to here the river fishes.
    //   high:  above good is high and tough; above high is a no-go.
    //   flood: NWS "action" flow at the gauge.
    // Green guide numbers: anglers report it "too high and fast" over 2,000
    // cfs at Auburn; NWS action flow is 6,000. Tune these after real trips.
    { id: "green-river", lat: 47.300, lon: -122.210, drive: 25,
      river: { gauge: "AUBW1", usgs: "12113000", name: "Green River near Auburn", good: 1200, high: 2000, flood: 6000 } },
    { id: "dash-point", lat: 47.320, lon: -122.415, drive: 40, tide: "9446705" },
    { id: "lake-fenwick", lat: 47.360, lon: -122.265, drive: 30 },
    { id: "american-lake", lat: 47.130, lon: -122.560, drive: 45 },
    { id: "lake-tapps", lat: 47.230, lon: -122.180, drive: 10 },
    { id: "westport", lat: 46.905, lon: -124.105, drive: 140, tide: "9441102", marine: true },
    { id: "ocean-shores", lat: 47.110, lon: -124.180, drive: 150, tide: "9441102", marine: true },
    // Batch 1, added 2026-11-23. Drive minutes are estimates from Bonney Lake.
    { id: "les-davis", name: "Les Davis Pier", lat: 47.287, lon: -122.481, drive: 45, tide: "9446484" },
    { id: "point-defiance", name: "Point Defiance boathouse dock", lat: 47.307, lon: -122.515, drive: 50, tide: "9446484" },
    { id: "des-moines-pier", name: "Des Moines Pier", lat: 47.402, lon: -122.330, drive: 40, tide: "9446248" },
    { id: "fox-island", name: "Fox Island pier", lat: 47.251, lon: -122.600, drive: 55, tide: "9446491" },
    // Batch 2 rivers. Flow numbers: good = about 1.5x and no-go = about 3x
    // the USGS daily median for December at the gauge (Snoqualmie 2,400 cfs,
    // Mayfield 8,500 cfs); flood = NWS action flow. Guide numbers.
    { id: "tokul", name: "Tokul Creek", lat: 47.556, lon: -121.886, drive: 75,
      river: { gauge: "SQUW1", usgs: "12144500", name: "Snoqualmie River at Snoqualmie Falls", good: 3500, high: 7000, flood: 15000 } },
    { id: "cowlitz", name: "Cowlitz River", lat: 46.497, lon: -122.646, drive: 105,
      river: { gauge: "MAYW1", usgs: "14238000", name: "Cowlitz River below Mayfield Dam", good: 12000, high: 16000, flood: 17000 } },
    // The Puyallup (2026-11-27), at the stands on the checked Puyallup cards.
    // Sumner and the 128th St E bridge are below the Carbon River, where the
    // pamphlet has a salmon season, and read PUYW1. Orting (Calistoga Park)
    // is above the Carbon: no salmon season, no plan, no gauge. The cards
    // carry no drive times, so these are the map estimate the feed lakes use
    // (straight line from Bonney Lake, km x 1.05 + 8 minutes).
    { id: "puyallup-sumner", name: "Puyallup at Sumner", lat: 47.1996, lon: -122.2565, drive: 14, river: puyallupRiver() },
    // bankUnproven: no public bank is proven at the stand itself (the 128th
    // St E bridge: OSM has no park, path or lot within 900 m, and WDFW lists
    // no site there; only the Weiss lot 3/4 mile down is proven). On a tie it
    // gives way to a spot whose bank is proven, so the call is Sumner's.
    { id: "puyallup-128th", name: "Puyallup at 128th St E", lat: 47.1402, lon: -122.2267, drive: 13, river: puyallupRiver(), bankUnproven: true },
    { id: "puyallup-orting", name: "Puyallup at Orting", lat: 47.0899, lon: -122.211, drive: 18 }
  ];

  // The Puyallup's 2026 season below the Carbon River (see its plans below):
  // open Aug 19 to Oct 31, shut Sundays, Mondays and Tuesdays to Sept 30.
  var PUY_CLOSED = [["11-01", "08-18"]];
  var PUY_DAYS = [{ dow: [0, 1, 2], from: "08-19", to: "09-30" }];
  var PUY_NEXT = "{y} dates not read yet. WDFW sets them in the {y}-{yy} pamphlet";
  var PUY_AS = "Salmon on the Puyallup";
  // Salmon dates are set once a year (North of Falcon), so the 2026-27
  // pamphlet's run out: Marine Area 11 on Apr 30, 2027 (open water and the
  // piers), Marine Area 13's Fox Island pier on June 30, 2027, the Green on
  // Dec 31, 2026. Past those days a salmon plan waits for the next pamphlet.
  var SALMON_NEXT = PUY_NEXT;
  var MA11_UNTIL = "2027-04-30", MA13_UNTIL = "2027-06-30", GREEN_UNTIL = "2026-12-31";
  // Marine Area 11, open water (2026-27 pamphlet): closed July 1 to 22 and
  // Nov 16 to Mar 30.
  var MA11_CLOSED = [["07-01", "07-22"], ["11-16", "03-30"]];

  // One plan = one fish, one spot, one way of fishing it.
  //   peak / ok:   months (1 to 12), or date ranges (["08-19", "09-10"]).
  //                Outside both, the plan is not in season.
  //   odd:         odd years only (pinks).
  //   closed:      [from, to] date ranges, inclusive, "MM-DD".
  //   closedDays:  weekdays the water is shut: [{ dow: [0, 1, 2], from, to }]
  //                (0 is Sunday), between two "MM-DD" dates or, with none,
  //                all season.
  //   dates:       if set, ONLY these days (razor clam digs).
  //   rules:       "confirmed" or a short reason it is not.
  //   ruleYear:    the rules are that year's only (a pamphlet that sets new
  //                dates every year). Any other year is held back with
  //                ruleNext ({y} is that year, {yy} the next one's last two
  //                digits), until someone reads its pamphlet.
  //   rulesUntil:  "YYYY-MM-DD", the last day this plan's rules are read
  //                for (the 2026-27 pamphlet sets salmon dates only so far).
  //                After it the plan is held back with ruleNext, like a
  //                ruleYear plan, until someone reads the next pamphlet.
  //   listAs:      one name for a group of plans in the "not listed" note.
  //   how:         kayak | shore | surf. Sets the wind limits.
  //   tide:        squid | moving | flood | slack | null.
  //   dark:        true when the fishing happens after dark.
  //   gear:        a note when Coach does not own the gear yet.
  var plans = [
    { id: "squid-redondo", species: "squid", spot: "redondo", name: "Squid at Redondo",
      peak: [11, 12, 1], ok: [10, 2], how: "shore", tide: "squid", dark: true, rules: "confirmed",
      gear: "Squid rod is on the Black Friday list" },
    { id: "clams-ocean-shores", species: "clams", spot: "ocean-shores", name: "Razor clams, Copalis and Mocrocks",
      // Official WDFW dig days, with WDFW's own low tide times and beach.
      digs: {
        "2026-11-24": { low: 18.03, ft: -1.7, beach: "Mocrocks" },
        "2026-11-25": { low: 18.8, ft: -1.9, beach: "Copalis" },
        "2026-11-26": { low: 19.58, ft: -1.8, beach: "Copalis" },
        "2026-11-27": { low: 20.42, ft: -1.4, beach: "Mocrocks" },
        "2026-11-28": { low: 21.3, ft: -0.8, beach: "Mocrocks" }
      },
      how: "surf", wave: 11, tide: "low", dark: true, rules: "confirmed", gear: "Needs a clam gun or shovel" },
    { id: "crab-westport", species: "crab", spot: "westport", name: "Crab off the Westport docks",
      ok: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], how: "shore", tide: "slack", rules: "confirmed",
      gear: "Needs a ring net or snare" },
    { id: "surfperch-ocean-shores", species: "surfperch", spot: "ocean-shores", name: "Surf perch, Ocean Shores beach",
      peak: [4, 5, 6], ok: [3, 7, 8, 9, 10], how: "surf", tide: "flood", rules: "confirmed" },
    { id: "surfperch-westport", species: "surfperch", spot: "westport", name: "Surf perch, Westport ocean beach",
      peak: [4, 5, 6], ok: [3, 7, 8, 9, 10], how: "surf", tide: "flood", rules: "confirmed" },
    { id: "cutthroat-dash-point", species: "cutthroat", spot: "dash-point", name: "Sea-run cutthroat, Dash Point beach",
      // WDFW: South Sound beaches fish well all winter. Mack's: best on the
      // incoming, the hour or two before high. The state park is 8 AM to dusk.
      peak: [10, 11, 12, 1, 2, 3, 4], ok: [5, 6, 9], how: "shore", tide: "flood", opens: 8, rules: "confirmed" },
    { id: "coho-dash-point", species: "coho", spot: "dash-point", name: "Coho from the kayak, Dash Point",
      peak: [8, 9], ok: [10], closed: MA11_CLOSED, how: "kayak", tide: "moving", rules: "confirmed",
      rulesUntil: MA11_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon off Dash Point" },
    { id: "king-dash-point", species: "king", spot: "dash-point", name: "Kings mooching, Dash Point",
      peak: [7, 8], ok: [9], closed: MA11_CLOSED, how: "kayak", tide: "moving", rules: "confirmed",
      rulesUntil: MA11_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon off Dash Point" },
    { id: "pink-dash-point", species: "pink", spot: "dash-point", name: "Pinks, Dash Point",
      peak: [8], ok: [7, 9], odd: true, closed: MA11_CLOSED, how: "kayak", tide: "moving",
      rules: "2027 pink rules set at North of Falcon, usually April", listAs: "Pinks off Dash Point" },
    { id: "coho-green-river", species: "coho", spot: "green-river", name: "Coho on the Green",
      // WAC 220-312-040 (WSR 26-13-052, effective 2026-07-12): S 212th St to
      // the Hwy 18 EB bridge is open Sept 16 to Dec 31. Daylight only (night
      // closure), which the planner already does for non-dark plans.
      peak: [10], ok: [9, 11], closed: [["01-01", "09-15"]], how: "shore", rules: "confirmed",
      rulesUntil: GREEN_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon on the Green" },
    { id: "chum-green-river", species: "chum", spot: "green-river", name: "Chum on the Green",
      peak: [11], ok: [12], closed: [["01-01", "09-15"]], how: "shore", rules: "confirmed",
      rulesUntil: GREEN_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon on the Green" },
    { id: "steelhead-green-river", species: "steelhead", spot: "green-river", name: "Winter steelhead on the Green",
      // WAC 220-312-040: the Green is closed to game fish Jan 1 to the Friday
      // before Memorial Day, so only December is possible.
      ok: [12], how: "shore", rules: "December steelhead limit not confirmed. Closed Jan to May" },
    { id: "pink-green-river", species: "pink", spot: "green-river", name: "Pinks on the Green",
      peak: [9], ok: [8, 10], odd: true, how: "shore", rules: "2027 pink rules set at North of Falcon, usually April", listAs: "Pinks on the Green" },
    { id: "trout-fenwick", species: "perch", spot: "lake-fenwick", name: "Perch and trout, Lake Fenwick",
      peak: [4, 5, 6, 10], ok: [3, 7, 8, 9, 11], how: "shore", rules: "confirmed" },
    { id: "bass-fenwick", species: "bass", spot: "lake-fenwick", name: "Bass, Lake Fenwick",
      peak: [5, 6, 7, 8, 9], ok: [4, 10], how: "shore", rules: "confirmed" },
    { id: "trout-tapps", species: "perch", spot: "lake-tapps", name: "Trout from the kayak, Lake Tapps",
      peak: [4, 5, 10], ok: [3, 6, 9, 11], how: "kayak", rules: "confirmed",
      access: "Allan Yorke ramp closed since Jul 27, no reopen date" },
    { id: "trout-american", species: "perch", spot: "american-lake", name: "Trout from the kayak, American Lake",
      peak: [4, 5, 10], ok: [3, 6, 9, 11], how: "kayak", rules: "confirmed" },

    // ---- Batch 1 (2026-11-23). Rules read from the 2026-27 WDFW pamphlet
    // (eregulations.com Marine Areas 11 and 13, Westside Lakes, Shellfish).
    // kind = which run card template in rigs/runs.js; site = what is
    // specific to this water. Unknowns stay unknowns.
    { id: "squid-les-davis", species: "squid", spot: "les-davis", name: "Squid at Les Davis Pier",
      peak: [11, 12, 1], ok: [10, 2], how: "shore", tide: "squid", dark: true, rules: "confirmed", kind: "squid-pier",
      site: { name: "Les Davis Pier", where: "Ruston Way, Tacoma", lines: ["Les Davis Pier on Ruston Way, Tacoma. A public fishing pier on Commencement Bay.",
        "WDFW names it with Des Moines as a pier where squid show up late November and December.",
        "Waters within 100 yards are closed to food fish and shellfish except from the pier itself.",
        "Open 24 hours, lit for night fishing, with parking and restrooms."],
        unknown: ["How the pier lights compare to Redondo"] } },
    { id: "squid-point-defiance", species: "squid", spot: "point-defiance", name: "Squid at the Point Defiance boathouse dock",
      peak: [11, 12, 1], ok: [10, 2], how: "shore", tide: "squid", dark: true, rules: "confirmed", kind: "squid-pier",
      site: { name: "Point Defiance boathouse dock", where: "Point Defiance Park, Tacoma", lines: ["The fishing dock at the Point Defiance boathouse, Tacoma."],
        unknown: ["Park hours at night", "Whether the dock is lit", "Parking"] } },
    { id: "squid-des-moines", species: "squid", spot: "des-moines-pier", name: "Squid at Des Moines Pier",
      peak: [11, 12, 1], ok: [10, 2], how: "shore", tide: "squid", dark: true, rules: "confirmed", kind: "squid-pier",
      site: { name: "Des Moines Pier", where: "Des Moines Marina", lines: ["Des Moines public fishing pier at the marina, 3 miles north of Redondo.",
        "Waters within 100 yards are closed except from the pier. The Des Moines park conservation area next to it is closed to all fishing."],
        unknown: ["Parking and hours", "Which stretch of rail fishes best"] } },

    // Pier salmon: May to Sept is the open-water season with boats; the
    // winter pier rule is what makes these worth a trip now.
    { id: "salmon-les-davis", species: "king", spot: "les-davis", name: "Winter salmon from Les Davis Pier",
      ok: [10, 11, 12, 1, 2, 3, 4], how: "shore", tide: "moving", rules: "confirmed", rulesUntil: MA11_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon from the piers", kind: "pier-salmon",
      site: { name: "Les Davis Pier", area: 11, lines: ["Les Davis Pier on Ruston Way, Tacoma.", "Open 24 hours, lit at night, with parking and restrooms."], unknown: [] } },
    { id: "salmon-point-defiance", species: "king", spot: "point-defiance", name: "Winter salmon from the Point Defiance dock",
      ok: [10, 11, 12, 1, 2, 3, 4], how: "shore", tide: "moving", rules: "confirmed", rulesUntil: MA11_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon from the piers", kind: "pier-salmon",
      site: { name: "Point Defiance boathouse dock", area: 11, lines: ["The fishing dock at the Point Defiance boathouse, Tacoma. Fast water off the point."], unknown: ["Park hours", "Parking"] } },
    { id: "salmon-des-moines", species: "king", spot: "des-moines-pier", name: "Winter salmon from Des Moines Pier",
      ok: [10, 11, 12, 1, 2, 3, 4], how: "shore", tide: "moving", rules: "confirmed", rulesUntil: MA11_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon from the piers", kind: "pier-salmon",
      site: { name: "Des Moines Pier", area: 11, lines: ["Des Moines public fishing pier at the marina."], unknown: ["Parking and hours"] } },
    { id: "salmon-redondo", species: "king", spot: "redondo", name: "Winter salmon from Redondo Pier",
      ok: [10, 11, 12, 1, 2, 3, 4], how: "shore", tide: "moving", rules: "confirmed", rulesUntil: MA11_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon from the piers", kind: "pier-salmon",
      site: { name: "Redondo Pier", area: 11, lines: ["Redondo Pier, Des Moines. The squid pier, by day."], unknown: ["Parking layout and fees"] } },
    { id: "salmon-fox-island", species: "king", spot: "fox-island", name: "Winter salmon from the Fox Island pier",
      ok: [10, 11, 12, 1, 2, 3, 4, 5, 6], how: "shore", tide: "moving", rules: "confirmed", rulesUntil: MA13_UNTIL, ruleNext: SALMON_NEXT, listAs: "Salmon from the piers", kind: "pier-salmon",
      site: { name: "Fox Island public fishing pier", area: 13, chum: true, lines: ["Fox Island public fishing pier, South Sound (Marine Area 13)."],
        unknown: ["Exact parking", "Hours"] } },

    // ---- Batch 2: winter steelhead rivers (2026-27 pamphlet, read 11-23).
    { id: "steelhead-tokul", species: "steelhead", spot: "tokul", name: "Hatchery steelhead, Tokul Creek and the Snoqualmie",
      peak: [12, 1], ok: [2], closed: [["02-16", "11-30"]], opens: 7, closes: 17, how: "shore", rules: "confirmed", kind: "river-steelhead",
      site: { name: "Tokul Creek and the Snoqualmie, Plum ramp to the falls", lines: ["Tokul Creek, where it meets the Snoqualmie below Snoqualmie Falls. The hatchery on Tokul Creek draws the winter run.",
        "The Snoqualmie from the Plum access boat ramp up to Snoqualmie Falls is open the same dates. Below the Plum ramp it closes sooner."],
        rules: ["Tokul Creek, mouth to the Fish Hatchery Rd bridge: Dec 1 to Feb 15. Closed every day 5 PM to 7 AM. Anti-snagging rule.",
          "Snoqualmie, Plum access ramp to Snoqualmie Falls: Dec 1 to Feb 15. No fishing from a boat or float tube between the Plum ramp and Tokul Creek.",
          "Steelhead: statewide rule. Release all wild steelhead. Hatchery steelhead 20 in minimum, 2 a day.",
          "Cutthroat and wild rainbow: 14 in minimum."],
        unknown: ["Parking at Tokul Creek", "How crowded the hatchery hole gets on a weekend"] } },
    { id: "steelhead-cowlitz", species: "steelhead", spot: "cowlitz", name: "Hatchery steelhead on the Cowlitz",
      peak: [12, 1, 2], ok: [3], how: "shore", rules: "confirmed", kind: "river-steelhead", endorsement: true,
      site: { name: "the Cowlitz below the Barrier Dam (Blue Creek area, Salkum)", lines: ["The lower Cowlitz from Mill Creek up to the Barrier Dam, near Salkum. Blue Creek is the famous bank spot.",
        "Big, dam-fed river. One of the most heavily planted steelhead rivers in the state."],
        rules: ["Hatchery steelhead: open all year, 20 in minimum, 3 a day.",
          "Columbia River Salmon and Steelhead Endorsement required for salmon and steelhead (age 15 and up). New for 2026.",
          "Mill Creek to the Barrier Dam: no fishing from any floating device. Two-pole allowed with the endorsement.",
          "Within 100 ft of the new trout hatchery outfall, and of the salmon hatchery wheelchair ramp: only anglers with disabilities who have a designated harvester companion card (at the outfall, only those who use a wheelchair).",
          "Trout: 8 in minimum, 5 a day, release wild cutthroat and wild rainbow."],
        unknown: ["Which bank access is best right now", "Crowds at Blue Creek"] } },

    // ---- The Puyallup (2026-11-27). The 2026-27 WDFW pamphlet
    // (eRegulations, Puget Sound coastal rivers L to R, last updated Oct 5,
    // 2026; the Sep 29 errata change nothing here), read word for word:
    // "Puyallup River, from 400' upstream of Clark's Creek to Carbon River,
    // CRC (804)": all species Aug. 19 to Oct. 31, "Night closure.
    // Anti-snagging rule. Barbless hooks required."; Aug. 19 to Sept. 30
    // "CLOSED Sundays, Mondays, and Tuesdays."; salmon "Min. size 12". Daily
    // limit 6 including no more than 2 adults. Release chum and wild
    // Chinook." Outside those dates the stretch is closed. From the Carbon
    // upstream (Orting) there is no salmon line, so no salmon plan there.
    // The White River is closed to salmon (the Sumner card says so).
    // 2026's dates only: 2025 opened Aug 16, so each year waits for its own.
    // Run timing (guides, not rules): kings late August into early
    // September, to mid September; coho from mid September through
    // October; pinks in odd years only. The run cards are the "puyallup"
    // template in rigs/runs.js. Night closure: daylight trips only, as for
    // every plan that is not a dark one.
    { id: "king-puyallup-128th", species: "king", spot: "puyallup-128th", name: "Kings on the Puyallup at 128th St E",
      peak: [["08-19", "09-10"]], ok: [["09-11", "09-15"]], closed: PUY_CLOSED, closedDays: PUY_DAYS, how: "shore",
      rules: "confirmed", ruleYear: 2026, ruleNext: PUY_NEXT, listAs: PUY_AS, kind: "puyallup" },
    { id: "king-puyallup-sumner", species: "king", spot: "puyallup-sumner", name: "Kings on the Puyallup at Sumner",
      peak: [["08-19", "09-10"]], ok: [["09-11", "09-15"]], closed: PUY_CLOSED, closedDays: PUY_DAYS, how: "shore",
      rules: "confirmed", ruleYear: 2026, ruleNext: PUY_NEXT, listAs: PUY_AS, kind: "puyallup" },
    { id: "coho-puyallup-sumner", species: "coho", spot: "puyallup-sumner", name: "Coho on the Puyallup at Sumner",
      peak: [["10-01", "10-31"]], ok: [["09-16", "09-30"]], closed: PUY_CLOSED, closedDays: PUY_DAYS, how: "shore",
      rules: "confirmed", ruleYear: 2026, ruleNext: PUY_NEXT, listAs: PUY_AS, kind: "puyallup" },
    { id: "coho-puyallup-128th", species: "coho", spot: "puyallup-128th", name: "Coho on the Puyallup at 128th St E",
      peak: [["10-01", "10-31"]], ok: [["09-16", "09-30"]], closed: PUY_CLOSED, closedDays: PUY_DAYS, how: "shore",
      rules: "confirmed", ruleYear: 2026, ruleNext: PUY_NEXT, listAs: PUY_AS, kind: "puyallup" },
    { id: "pink-puyallup-sumner", species: "pink", spot: "puyallup-sumner", name: "Pinks on the Puyallup at Sumner",
      ok: [["08-19", "09-30"]], odd: true, closed: PUY_CLOSED, closedDays: PUY_DAYS, how: "shore",
      rules: "confirmed", ruleYear: 2026, ruleNext: PUY_NEXT, listAs: PUY_AS, kind: "puyallup" },
    { id: "pink-puyallup-128th", species: "pink", spot: "puyallup-128th", name: "Pinks on the Puyallup at 128th St E",
      ok: [["08-19", "09-30"]], odd: true, closed: PUY_CLOSED, closedDays: PUY_DAYS, how: "shore",
      rules: "confirmed", ruleYear: 2026, ruleNext: PUY_NEXT, listAs: PUY_AS, kind: "puyallup" }
  ];

  // Wind in mph, rain in inches per hour, waves in feet.
  var LIMITS = {
    kayak: { wind: 10, gust: 18, rain: 0.15 },
    shore: { wind: 20, gust: 30, rain: 0.3 },
    surf: { wind: 20, gust: 30, rain: 0.3, wave: 8 }
  };

  // Trip slots by weekday (0 Sunday). Times are local hours.
  //   maxDrive keeps a weeknight from turning into a road trip; minDrive keeps
  //   an adventure day an adventure.
  // Days off that plan like a weekend.
  var DAYS_OFF = ["2026-11-26", "2026-11-27", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"];
  function slotsFor(dow, iso) {
    if (iso && DAYS_OFF.indexOf(iso) !== -1) dow = 6;
    if (dow >= 1 && dow <= 4) return [{ id: "afterwork", label: "After work", from: 16.5, to: 20.5, maxDrive: 45 }];
    if (dow === 5) return [{ id: "evening", label: "Friday evening", from: 16.5, to: 22, maxDrive: 45 }];
    return [
      { id: "quick", label: "Quick trip", from: 7, to: 11, maxDrive: 45 },
      { id: "long", label: "Long day", from: 7, to: 15, maxDrive: 75 },
      { id: "adventure", label: "Adventure day", from: 5, to: 22, minDrive: 90 },
      { id: "night", label: "Evening", from: 16.5, to: 22, maxDrive: 45 }
    ];
  }

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Moon: fraction lit, 0 new to 1 full. Mean synodic month from a known new
  // moon (2000-01-06 18:14 UTC). Good to well under a day, which is plenty
  // for "thin or fat".
  function moonLit(ms) {
    var P = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
    var age = (((ms - ref) / 864e5) % P + P) % P;
    return (1 - Math.cos(2 * Math.PI * age / P)) / 2;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function mmdd(d) { return pad(d.m) + "-" + pad(d.d); }
  function inRange(md, r) { return r[0] <= r[1] ? md >= r[0] && md <= r[1] : md >= r[0] || md <= r[1]; }
  function clock(h) {
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh++; mm = 0; }
    var ap = hh >= 12 && hh < 24 ? "PM" : "AM", h12 = hh % 12 || 12;
    return h12 + ":" + pad(mm) + " " + ap;
  }

  // Is this plan in season on this day? Returns "peak", "ok" or null.
  function season(p, day) {
    if (p.digs) return p.digs[day.iso] ? "peak" : null;
    if (p.odd && day.y % 2 === 0) return null;
    var md = mmdd(day);
    if ((p.closed || []).some(function (r) { return inRange(md, r); })) return null;
    if (closedDay(p, day, md)) return null;
    if (p.spring && md < "04-" + pad(fourthSatApril(day.y))) return null;
    if (stockedRecent(p, day)) return "peak";
    if (p.stockedOnly) { var lp = lastPlant(p, day); return lp && lp.age <= 60 ? "ok" : null; }
    if (inSpan(p.peak, day, md)) return "peak";
    if (inSpan(p.ok, day, md)) return "ok";
    return null;
  }
  // peak and ok: months (9) or date ranges (["08-19", "09-10"]), mixed as needed.
  function inSpan(list, day, md) {
    return (list || []).some(function (x) { return Array.isArray(x) ? inRange(md, x) : x === day.m; });
  }
  // A weekday the water is shut (the Puyallup: Sundays to Tuesdays until
  // Sept 30). The real weekday: a day off that plans like a weekend is still
  // the Monday it is.
  function closedDay(p, day, md) {
    if (!p.closedDays || !p.closedDays.length) return false;
    var dow = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
    return p.closedDays.some(function (c) {
      return (c.dow || []).indexOf(dow) !== -1 && (!c.from || inRange(md || mmdd(day), [c.from, c.to || c.from]));
    });
  }
  // Do this plan's rules hold on this day? "confirmed", or why not.
  function ruleOn(p, day) {
    if (p.rules !== "confirmed") return p.rules;
    if ((p.ruleYear && day.y !== p.ruleYear) || (p.rulesUntil && day.iso > p.rulesUntil)) {
      return String(p.ruleNext || "{y} rules not read yet").replace(/\{y\}/g, day.y).replace(/\{yy\}/g, String(day.y + 1).slice(-2));
    }
    return "confirmed";
  }

  // Spring-only lakes open on the 4th Saturday in April: the 25th in 2026,
  // the 24th in 2027. Day of the month, Apr 22 to 28.
  function fourthSatApril(y) {
    var first = new Date(Date.UTC(y, 3, 1)).getUTCDay();
    return 1 + ((6 - first + 7) % 7) + 21;
  }
  // Closed for every spring-only lake in every year. season() adds the days
  // from Apr 22 up to that year's opener.
  var SPRING_CLOSED = [["11-01", "04-21"]];

  // The latest trout plant on or before this day (WDFW stocking, via the
  // CastAI feed), with its age in days. Plants are {d, sp, n, fpp} or "YYYY-MM-DD".
  function lastPlant(p, day) {
    if (!p.stocked) return null;
    var t = Date.UTC(day.y, day.m - 1, day.d), best = null;
    p.stocked.forEach(function (x) {
      var iso = typeof x === "string" ? x : x.d, a = iso.split("-").map(Number);
      var age = (t - Date.UTC(a[0], a[1] - 1, a[2])) / 864e5;
      if (age >= 0 && (!best || age < best.age)) best = { age: age, iso: iso, plant: typeof x === "string" ? null : x };
    });
    return best;
  }
  function stockedRecent(p, day) { var l = lastPlant(p, day); return l && l.age <= 21 ? l.iso : null; }

  function plantLine(lp) {
    var x = lp.plant, when = "Stocked " + MONTHS[+lp.iso.slice(5, 7) - 1] + " " + (+lp.iso.slice(8, 10));
    if (!x) return when + " (WDFW plant)";
    var size = x.fpp && x.fpp <= 1.5 ? "about " + (Math.round(10 / x.fpp) / 10) + " lb each" : "catchable size";
    return when + ": " + x.n + " " + String(x.sp || "trout").toLowerCase() + ", " + size;
  }

  // ---- CastAI waters: stocked lakes from the shared feed -------------------
  // RIG.watersSnapshot (rigs/waters.js, built by scripts/build-waters.mjs)
  // carries each water's WDFW lake rule. A live feed refreshes the plants;
  // a water the snapshot has not checked is held back, never guessed.
  var ruleByGeo = {};
  function addWaters(data) {
    if (!data || !data.waters || !data.waters.length) return 0;
    data.waters.forEach(function (w) { if (w.rule) ruleByGeo[w.geo] = w.rule; });
    var keepSpots = spots.filter(function (x) { return !x.gen; }), keepPlans = plans.filter(function (x) { return !x.gen; });
    spots.length = 0; plans.length = 0;
    keepSpots.forEach(function (x) { spots.push(x); }); keepPlans.forEach(function (x) { plans.push(x); });
    var n = 0;
    data.waters.forEach(function (w) {
      var stocked = (w.plants || []).filter(function (x) { return x.fpp != null && x.fpp <= 6; });
      if (!stocked.length || w.lat == null) return;
      var r = w.rule || ruleByGeo[w.geo] || { status: "check", why: "Lake rules not checked yet" };
      var id = "w-" + String(w.geo).toLowerCase();
      // A spring-only lake: the snapshot's own closed dates are a fixed
      // guess at the opener. season() knows the real day for each year.
      var spring = r.open === "spring";
      spots.push({ id: id, name: w.name, lat: w.lat, lon: w.lon, drive: Math.round(w.km * 1.05 + 8), gen: true, county: w.county });
      plans.push({ id: "trout-" + id, gen: true, species: "perch", spot: id, name: "Trout at " + w.name,
        stockedOnly: true, stocked: stocked, closed: spring ? SPRING_CLOSED : (r.closed || []), spring: spring, how: "shore", kind: "lake-trout",
        rules: r.status === "ok" ? "confirmed" : (r.why || "Lake rules not checked yet"),
        site: { name: w.name, county: w.county, geo: w.geo,
          lines: [w.name + ", " + w.county + " County.", "Trout plants come from WDFW's stocking records, through CastAI, refreshed nightly."],
          extra: (r.lines || []).filter(function (l) { return !/^Open all year/.test(l); }),
          unknown: ["Shore access and parking at this lake", "Drive time is an estimate from the map"] } });
      if (root.RIG.rules && root.RIG.rules.places) {
        var nm = w.name.replace(/\s*\(.*?\)/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        root.RIG.rules.places[id] = { re: new RegExp(nm, "i"), named: true };
      }
      n++;
    });
    if (RIG.trips.buildRuns) RIG.trips.buildRuns();
    return n;
  }

  // ---- the planner ---------------------------------------------------------
  // input:
  //   today: "YYYY-MM-DD" (local)
  //   wx:    { [spotId]: { hours: [{t:"YYYY-MM-DDTHH:MM", wind, gust, rain, temp, wave?}],
  //                         sun: { [iso]: {rise: hour, set: hour} } } }
  //   tides: { [stationId]: [{t:"YYYY-MM-DD HH:MM", v: feet, type: "H"|"L"}] }
  // output: { days: [{iso, label, trips: [...], note?}], notListed: [{name, why}] }
  function plan(input) {
    var wx = input.wx || {}, tides = input.tides || {}, flow = input.flow || {};
    if (input.waters) addWaters(input.waters);
    var start = parseDay(input.today);
    var days = [];
    var nDays = input.days || 7;
    var notListed = {};
    var weekendOn = false;
    for (var i = 0; i < nDays; i++) {
      var day = addDays(start, i);
      if (!hasWx(wx, day.iso)) break;
      var out = { iso: day.iso, label: (i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAYS[day.dow]) + " " + MONTHS[day.m - 1] + " " + day.d, trips: [] };
      var blocked = [], tried = 0, darkCut = [], hoursCut = [], sunset = 0;
      slotsFor(day.dow, day.iso).forEach(function (slot) {
        plans.forEach(function (p) {
          var spot = spotById(p.spot);
          if (!spot) return;
          if (slot.maxDrive && spot.drive > slot.maxDrive) return;
          if (slot.minDrive && spot.drive < slot.minDrive) return;
          var s = season(p, day);
          if (!s) return;
          var rw = ruleOn(p, day);
          if (rw !== "confirmed") { notListed[p.listAs || p.id] = { name: p.listAs || p.name, why: rw }; return; }
          if (p.access) { notListed[p.id] = { name: p.name, why: p.access }; return; }
          var t = scoreTrip(p, spot, slot, day, s, wx[spot.id], tides[spot.tide], flow[spot.id]);
          // In season, fine weather, but the sun is down before the slot
          // opens. Worth saying out loud: it is why a stocked lake 10
          // minutes away never shows on a December weeknight. When there
          // was daylight left and the spot's own hours cut the window
          // (Tokul Creek shuts at 5 PM), that is the reason given instead.
          if (t.darkCut) {
            if (t.miss) hoursCut.push({ p: p, why: t.miss });
            else { darkCut.push(p); sunset = t.sunset; }
            return;
          }
          if (t.score === 0 && !t.blocked) return;
          tried++;
          if (t.blocked) { t.blocked.name = p.name; blocked.push(t.blocked); return; }
          if (t.score >= 6) out.trips.push(t);
        });
      });
      // One spot, one slot per day: the best version of each trip wins, so a
      // quick trip and a long day to the same water do not both show.
      var best = {};
      out.trips.forEach(function (t) { if (!best[t.planId] || t.score > best[t.planId].score) best[t.planId] = t; });
      // Same fish, same way of fishing (four squid piers, five stocked
      // lakes): only the best one is listed, and it names the others as
      // backups. A tie goes to a spot whose bank is proven, then the shorter
      // drive.
      var lead = {};
      Object.keys(best).forEach(function (k) {
        var t = best[k], g = t.species + "|" + t.how, l = lead[g];
        if (!l) { lead[g] = { top: t, alts: [] }; return; }
        if (t.score > l.top.score || (t.score === l.top.score && tieBreak(t, l.top) < 0)) { l.alts.push(l.top); l.top = t; }
        else l.alts.push(t);
      });
      best = {};
      Object.keys(lead).forEach(function (g) {
        var l = lead[g], t = l.top;
        if (l.alts.length) {
          t.alts = l.alts.sort(function (a, b) { return b.score - a.score || tieBreak(a, b); }).map(function (x) { return x.planId; });
          t.why = t.why.concat("Also good: " + l.alts.slice(0, 3).map(function (x) { return x.name.replace(/^.* (at|from) (the )?/, ""); }).join(", "));
        }
        best[t.planId] = t;
      });
      out.trips = Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (a, b) { return b.score - a.score || a.from - b.from; }).slice(0, slotsFor(day.dow, day.iso).length > 1 ? 6 : 4);
      // "No fishing" only when the weather called off everything in season.
      // A blown-out coast on a day the lakes are just slow is "Nothing good".
      if (!out.trips.length && blocked.length) {
        var w = worst(blocked);
        out.note = blocked.length === tried ? "No fishing: " + w.why : "Nothing good. " + w.name + " is off: " + w.why;
      }
      // One weeknight window, and it starts after sunset: say so, and name
      // what is sitting there waiting for the weekend.
      if ((darkCut.length || hoursCut.length) && slotsFor(day.dow, day.iso).length === 1) {
        // Closest first: the 10 minute lake is the one worth knowing about.
        var near = function (a, b) { return (spotById(a.spot) || { drive: 999 }).drive - (spotById(b.spot) || { drive: 999 }).drive; };
        var called = function (p) { return (p.site && p.site.name) || p.name; };
        var first2 = function (list) { return list.filter(function (x, i) { return list.indexOf(x) === i; }).slice(0, 2); };
        var said = [];
        if (darkCut.length) {
          said.push("No daylight after work, sunset " + clock(sunset) + ". Waiting for the weekend: " + first2(darkCut.sort(near).map(called)).join(", ") + ".");
        }
        if (hoursCut.length) {
          // "the spot closes at 5:00 PM" becomes "Tokul Creek closes at 5:00 PM".
          var shut = first2(hoursCut.sort(function (a, b) { return near(a.p, b.p); }).map(function (x) { return called(x.p) + x.why.replace(/^the spot/, ""); }));
          said.push(shut.join(". ") + (darkCut.length ? "." : ". Waiting for the weekend."));
        }
        out.dark = said.join(" ");
        out.note = out.note ? out.note.replace(/[.\s]*$/, "") + ". " + out.dark : out.dark;
      }
      if ((day.dow === 0 || day.dow === 6) && out.trips.length) weekendOn = true;
      days.push(out);
    }
    // Nothing is "waiting for the weekend" when the weekend in this forecast
    // has no trip on it either. The reason the weeknight is empty still stands.
    if (!weekendOn) {
      days.forEach(function (d) {
        ["dark", "note"].forEach(function (k) {
          if (d[k]) d[k] = d[k].replace(/\s*Waiting for the weekend(: [^.]*)?\./g, "").trim();
        });
      });
    }
    return { days: days, notListed: Object.keys(notListed).map(function (k) { return notListed[k]; }) };
  }

  // Two trips that score the same: the one whose bank is proven first, then
  // the shorter drive. Below 0: a goes first.
  function tieBreak(a, b) { return (a.unproven ? 1 : 0) - (b.unproven ? 1 : 0) || a.drive - b.drive; }

  // One trip on one day, asked for by id: what a crew trip page shows.
  // Same season, rules and scoring as the week, but it answers whatever the
  // score, and says why when there is no trip to show.
  //   from, to: local decimal hours, optional. No window means 5 to 22, which
  //   scoreTrip clamps to daylight, or to full dark onward for a night trip.
  // output: { status: "ok", trip } | { status: "nogo", why } | { status: "dark", sunset }
  //   | { status: "closed", why? } | { status: "nodata" } | { status: "unknown" }
  function detail(input) {
    input = input || {};
    var p = plans.filter(function (x) { return x.id === input.planId; })[0], spot = p && spotById(p.spot);
    if (!spot) return { status: "unknown" };
    // The app does not send anyone to these, in season or not.
    if (p.rules !== "confirmed") return { status: "closed", why: p.rules };
    if (p.access) return { status: "closed", why: p.access };
    if (!/^\d{4}-\d\d-\d\d$/.test(input.iso || "")) return { status: "nodata" };
    var day = parseDay(input.iso), s = season(p, day);
    if (!s) return { status: "closed" };
    var rw = ruleOn(p, day);
    if (rw !== "confirmed") return { status: "closed", why: rw };
    var w = (input.wx || {})[spot.id];
    if (!w || !(w.hours || []).some(function (h) { return h.t.slice(0, 10) === day.iso; })) return { status: "nodata" };
    var from = input.from == null ? 5 : +input.from, to = input.to == null ? 22 : +input.to;
    // A crew can pick a window shorter than the week's hour and a half. That
    // is still a trip, as long as the whole window can be fished.
    var slot = { id: "crew", label: "Crew trip", from: from, to: to, min: Math.max(0.5, Math.min(1.5, to - from)) };
    var t = scoreTrip(p, spot, slot, day, s, w, (input.tides || {})[spot.tide], (input.flow || {})[spot.id]);
    if (t.blocked) return { status: "nogo", why: t.blocked.why };
    if (t.planId) return { status: "ok", trip: t };
    // No trip and no weather reason: the window does not fit this trip (miss
    // says how), or the sun cuts it, or its hours or tides are not in the
    // forecast.
    if (t.miss) return { status: "nogo", why: t.miss };
    return t.sunset == null ? { status: "nodata" } : { status: "dark", sunset: t.sunset };
  }

  function scoreTrip(p, spot, slot, day, s, w, tideList, fl) {
    // No forecast for this spot (a lake that is new in today's feed, before
    // its weather lands): no trip, and no guess at its sunset either.
    if (!w) return { score: 0 };
    var sun = (w.sun && w.sun[day.iso]) || { rise: 7.5, set: 16.5 };
    var from = slot.from, to = slot.to, need = slot.min || 1.5;
    // Daylight fishing ends at sunset. Dark fishing starts at full dark.
    if (p.dark) from = Math.max(from, sun.set + 0.6);
    else { from = Math.max(from, sun.rise, p.opens || 0); to = Math.min(to, sun.set, p.closes || 24); }
    var dig = p.digs && p.digs[day.iso];
    // Why the asked window leaves nothing to fish, in words, or "" when it is
    // the sun. detail() answers with it. The week uses it to tell a spot's
    // own hours from darkness in its weeknight note.
    function miss() {
      if (dig) return "the dig is around the " + clock(dig.low) + " low";
      if (p.dark) return "this one fishes after dark, from " + clock(sun.set + 0.6);
      var light = [Math.max(slot.from, sun.rise), Math.min(slot.to, sun.set)];
      if (light[1] - light[0] < need) return "";
      // Name the hour that cut into the daylight that was asked for: the one
      // that leaves too little on its own, or both when it takes both.
      var opensLate = p.opens > light[0], shutsEarly = p.closes < light[1];
      var openAlone = opensLate && light[1] - p.opens < need, shutAlone = shutsEarly && p.closes - light[0] < need;
      var hours = [opensLate && (openAlone || !shutAlone) ? "opens at " + clock(p.opens) : "",
        shutsEarly && (shutAlone || !openAlone) ? "closes at " + clock(p.closes) : ""].filter(Boolean);
      return hours.length ? "the spot " + hours.join(" and ") : "";
    }
    if (dig) {
      // WDFW: the best digging is 1 to 2 hours before the low.
      from = Math.max(slot.from, dig.low - 2); to = Math.min(slot.to, dig.low + 0.5);
    }
    // An incoming-tide fish gets the incoming tide, or no trip. The window
    // shrinks to the stretch of flood that fits inside the slot and daylight.
    if (p.tide === "flood") {
      // (Not "fl": that name is the river flow handed in above, and a var
      // here would overwrite it before the river check below reads it.)
      var turns = (tideList || []).filter(function (x) { return x.t.slice(0, 10) === day.iso; }), best = null;
      for (var q = 1; q < turns.length; q++) {
        if (turns[q].type !== "H") continue;
        var a0 = Math.max(from, hourOf(turns[q - 1].t)), b0 = Math.min(to, hourOf(turns[q].t) + 0.5);
        if (b0 - a0 > (best ? best[1] - best[0] : 0)) best = [a0, b0];
      }
      if (!best || best[1] - best[0] < need) {
        if (to - from < need) return { score: 0, sunset: sun.set, miss: miss() };
        return { score: 0, miss: turns.length ? "no incoming tide in that window" : "" };
      }
      from = best[0]; to = best[1];
    }
    if (to - from < need) return p.dark || dig ? { score: 0, miss: miss() } : { darkCut: true, sunset: sun.set, miss: miss() };

    var hrs = ((w && w.hours) || []).filter(function (h) {
      if (h.t.slice(0, 10) !== day.iso) return false;
      var x = hourOf(h.t);
      return x >= Math.floor(from) && x < to;
    });
    if (!hrs.length) return { score: 0 };
    // Open-Meteo's rain and chance of rain are for the hour before the time
    // they are given at (the 6:00 reading is the rain from 5 to 6). An hour
    // of rain counts for the trip when a quarter of it or more falls inside
    // the trip: the same hours rigs/read.js says out loud.
    var nextIso = addDays(day, 1).iso;
    var wetHrs = ((w && w.hours) || []).filter(function (h) {
      var d = h.t.slice(0, 10);
      if (d !== day.iso && d !== nextIso) return false;
      var x = hourOnDay(h.t, day);
      return Math.min(x, to) - Math.max(x - 1, from) >= 0.25;
    });
    if (!wetHrs.length) wetHrs = hrs;
    var L = LIMITS[p.how];
    var wind = max(hrs, "wind"), gust = max(hrs, "gust"), rain = max(wetHrs, "rain"), wave = max(hrs, "wave");
    var pops = wetHrs.filter(function (h) { return h.pop != null; }), pop = pops.length ? max(pops, "pop") : null;
    var temp = Math.min.apply(null, hrs.map(function (h) { return h.temp; }));
    // The no-go names whichever broke its limit: the gusts, else the wind.
    if (gust > L.gust) return { blocked: { why: "gusts to " + Math.round(gust) + " mph", v: gust } };
    if (wind > L.wind) return { blocked: { why: "wind to " + Math.round(wind) + " mph", v: gust } };
    if (rain > L.rain) return { blocked: { why: "heavy rain", v: 30 + rain } };
    var waveMax = p.wave || L.wave;
    if (waveMax && wave > waveMax) return { blocked: { why: Math.round(wave) + " ft surf", v: 40 + wave } };

    var why = [], score = s === "peak" ? 4 : 2;
    var lp = p.stocked ? lastPlant(p, day) : null;
    why.push(lp && lp.age <= 60 ? plantLine(lp) : s === "peak" ? "Peak season" : "In season");
    var rf = spot.river ? riverCall(spot.river, fl, day) : null;
    if (rf && rf.call === "nogo") return { blocked: { why: "river blown out, " + cfs(rf.cfs) + " cfs", v: 50 + rf.cfs / 1000 } };
    if (rf) { score += rf.score; why = why.concat(rf.why); }

    var dayT = (tideList || []).filter(function (x) { return x.t.slice(0, 10) === day.iso; });
    var inWin = dayT.filter(function (x) { var h = hourOf(x.t); return h >= from - 0.5 && h <= to + 0.5; });
    if (p.tide === "squid") {
      var dark = sun.set + 0.6;
      var hi = inWin.filter(function (x) { return x.type === "H"; })[0];
      if (hi && Math.abs(hourOf(hi.t) - dark) <= 1.5) { score += 3; why.push("High slack " + clock(hourOf(hi.t)) + ", right at dark"); }
      else if (hi) { score += 1; why.push("High slack " + clock(hourOf(hi.t))); }
      var lit = moonLit(Date.UTC(day.y, day.m - 1, day.d, 8 + Math.round(dark)));
      if (lit < 0.3) { score += 2; why.push("Dark moon"); }
      else if (lit < 0.6) { score += 1; why.push("Half moon"); }
      else why.push("Bright moon works against you");
    } else if (dig) {
      score += 4; why.push("WDFW dig at " + dig.beach + ", low " + clock(dig.low) + ", " + dig.ft.toFixed(1) + " ft");
    } else if (p.tide === "slack") {
      var sl = inWin[0];
      if (sl) { score += 2; why.push((sl.type === "H" ? "High" : "Low") + " slack " + clock(hourOf(sl.t))); }
    } else if (p.tide === "moving" || p.tide === "flood") {
      // The tide that is actually running during the trip: the stretch
      // between two turns that overlaps the window most.
      var swing = 0, flood = false, most = 0;
      for (var k = 1; k < dayT.length; k++) {
        var a = hourOf(dayT[k - 1].t), b = hourOf(dayT[k].t);
        var over = Math.min(b, to) - Math.max(a, from);
        if (over > most) { most = over; swing = Math.abs(dayT[k].v - dayT[k - 1].v); flood = dayT[k].type === "H"; }
      }
      if (p.tide === "flood" ? flood : swing >= 4) { score += 2; why.push(p.tide === "flood" ? "Incoming tide" : "Moving water, " + swing.toFixed(1) + " ft swing"); }
    } else {
      score += 1;
    }
    if (wind <= L.wind / 2) { score += 1; why.push("Light wind, " + Math.round(wind) + " mph"); }
    else why.push("Wind to " + Math.round(wind) + " mph");
    // Dry: under 0.02 in an hour, and no hour with a 30% chance or more.
    if (rain < 0.02 && !(pop >= 30)) { score += 1; why.push("Dry"); }
    if (temp < 30) { score -= 1; why.push("Cold, " + Math.round(temp) + "°F"); }

    return {
      planId: p.id, species: p.species, spot: p.spot, how: p.how, name: p.name,
      slot: slot.id === "long" && to - from <= 4 ? "Quick trip" : slot.label,
      from: from, to: to, when: clock(from) + " to " + clock(to),
      drive: spot.drive, unproven: !!spot.bankUnproven, score: score, heat: score >= 8 ? "Hot" : score >= 6 ? "Good" : "Slow", why: why, gear: p.gear || "",
      wx: { wind: Math.round(wind), gust: Math.round(gust), temp: Math.round(temp) },
      hours: hrs.map(function (h) { return { h: hourOf(h.t), wind: Math.round(h.wind), gust: Math.round(h.gust), temp: Math.round(h.temp), rain: h.rain, wave: h.wave }; }),
      // The rain over the trip by the hour: h is when that hour ends (25 is 1 AM the next morning).
      rainHours: wetHrs.map(function (h) { return { h: hourOnDay(h.t, day), rain: h.rain, pop: h.pop == null ? null : h.pop }; }),
      tides: dayT.map(function (x) { return { h: hourOf(x.t), v: x.v, type: x.type }; }),
      sun: sun, dark: sun.set + 0.6, beach: dig ? dig.beach : "", flow: rf ? rf.card : undefined,
      moon: Math.round(moonLit(Date.UTC(day.y, day.m - 1, day.d, 8 + Math.round(sun.set + 0.6))) * 100)
    };
  }

  // River go or no-go for one day: the day's peak flow against the spot's
  // numbers, plus which way it is heading against the day before.
  function cfs(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function riverCall(r, fl, day) {
    var d = fl && fl.days && fl.days[day.iso];
    var base = { gauge: r.name, usgs: r.usgs, good: r.good, high: r.high, lead: !!r.lead, now: fl && fl.now, ends: fl && fl.ends };
    if (!d) return { call: "unknown", score: 0, why: ["No river reading" + (fl && fl.ends ? " past " + fl.ends : "")],
      card: Object.assign({ call: "unknown", cfs: null }, base) };
    var prev = fl.days[addDays(day, -1).iso], v = d.max, why = [], score = 0, call;
    if (v > r.high) call = "nogo";
    else if (v > r.good) { call = "high"; score -= 2; why.push("High water, " + cfs(v) + " cfs"); }
    else { call = "go"; score += 2; why.push("Good flow, " + cfs(v) + " cfs"); }
    var trend = "steady";
    if ((prev && v > prev.max * 1.5) || v > d.min * 1.8) { trend = "rising"; score -= 2; why.push("River rising"); }
    else if (prev && prev.max >= v * 1.4) { trend = "dropping"; score += 1; why.push("Dropping after a rise"); }
    return { call: call, cfs: v, score: score, why: why,
      card: Object.assign({ call: call, cfs: v, min: d.min, trend: trend, prev: prev ? prev.max : null }, base) };
  }

  function worst(list) { return list.slice().sort(function (a, b) { return b.v - a.v; })[0]; }
  function max(hrs, k) { return Math.max.apply(null, hrs.map(function (h) { return h[k] || 0; })); }
  function hourOf(t) { var m = /[T ](\d\d):(\d\d)/.exec(t); return m ? +m[1] + m[2] / 60 : 0; }
  // An hour counted on the trip's day: 1:00 AM the next morning is 25.
  function hourOnDay(t, day) { return (Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) - Date.UTC(day.y, day.m - 1, day.d)) / 36e5 + hourOf(t); }
  function spotById(id) { for (var i = 0; i < spots.length; i++) if (spots[i].id === id) return spots[i]; return null; }
  function parseDay(iso) { var a = iso.split("-").map(Number); return mk(a[0], a[1], a[2]); }
  function mk(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay(),
      iso: dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate()) };
  }
  function addDays(day, n) { return mk(day.y, day.m, day.d + n); }
  function hasWx(wx, iso) {
    return Object.keys(wx).some(function (k) { return (wx[k].hours || []).some(function (h) { return h.t.slice(0, 10) === iso; }); });
  }

  // ---- the call -------------------------------------------------------------
  // What a guide would say first: the one best trip in the week, in plain
  // words, with the reason and the next step. Pure, like the planner: a plan
  // in, words out. It never makes up a trip the week does not list.
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // The reasons that make a day, most telling first, then the ones against it.
  var FOR = [/^WDFW dig/, /^Stocked /, / slack /, /^Incoming tide/, /^Moving water/, /^Good flow/, /^Dropping after/,
    /^Dark moon/, /^Light wind/, /^Dry$/, /^Half moon/, /^Peak season/, /^In season/];
  var AGAINST = [/^River rising/, /^High water/, /^Wind to/, /^Bright moon/, /^Cold/, /^No river reading/];
  // "High slack 5:15 PM, right at dark" is "High slack right at dark" out
  // loud. Everything else loses its numbers: they are on the run card.
  function brief(w) {
    var m = /^(High|Low) slack \d+:\d\d [AP]M(, right at dark)?$/.exec(w);
    if (m) return m[1] + " slack" + (m[2] ? " right at dark" : "");
    return w.split(/[:,]/)[0].replace(/ \(.*\)$/, "");
  }
  function ranked(why, order) {
    var out = [];
    order.forEach(function (re) { why.forEach(function (w) { if (re.test(w) && out.indexOf(w) === -1) out.push(w); }); });
    return out;
  }
  // One sentence from a trip's own reasons, n of them. A good day leads with
  // what makes it good; a slow one leads with what is against it.
  function whyLine(t, n) {
    var why = ((t && t.why) || []).filter(function (w) { return !/^Also good/.test(w); });
    var pro = ranked(why, FOR), con = ranked(why, AGAINST);
    var list = (t.heat === "Slow" ? con.concat(pro) : pro.concat(con)).slice(0, n || 2).map(brief);
    if (!list.length) return "";
    return list.map(function (x, i) {
      return i && /^[A-Z][a-z]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x;
    }).join(", ") + ".";
  }
  // When to pull out of the driveway: the start, less the drive, less 15
  // minutes to set up. The same sum the run card's plan uses.
  function leaveBy(t) {
    var h = t.from - (t.drive || 0) / 60 - 0.25;
    return clock(((h % 24) + 24) % 24);
  }
  function isToday(day) { return /^Today\b/.test(day.label || ""); }
  function isTomorrow(day) { return /^Tomorrow\b/.test(day.label || ""); }
  function whenWords(day, t) {
    var set = t.sun && t.sun.set != null ? t.sun.set : 17;
    var part = t.from >= Math.min(set, 17) ? "evening" : t.from >= 12 ? "afternoon" : "morning";
    if (isToday(day)) return part === "evening" ? "Tonight" : "This " + part;
    if (isTomorrow(day)) return "Tomorrow " + part;
    return WEEKDAYS[parseDay(day.iso).dow] + " " + part;
  }
  function onDay(day) { return isToday(day) ? "today" : isTomorrow(day) ? "tomorrow" : "on " + WEEKDAYS[parseDay(day.iso).dow]; }
  // Why there is no trip, from the days' own notes: the weather that called a
  // day off, and the weeknights the sun cut short.
  function noCall(days) {
    if (!days.length) return "No forecast yet.";
    var wx = [], dark = "";
    days.forEach(function (d) {
      var m = /^No fishing: ([^.]+)/.exec(d.note || "") || /^Nothing good\. .*? is off: ([^.]+)/.exec(d.note || "");
      if (m) wx.push({ day: d, why: m[1] });
      if (d.dark && !dark) dark = /^No daylight after work, sunset \d+:\d\d [AP]M/.exec(d.dark) ? /^[^.]+/.exec(d.dark)[0] : d.dark.split(". ")[0].replace(/\.$/, "");
    });
    var said = [];
    if (wx.length) {
      var more = wx.length - 1, first = wx[0].why.charAt(0).toUpperCase() + wx[0].why.slice(1) + " " + onDay(wx[0].day);
      // Weather every single day is the whole story. The short evenings are not.
      if (more && wx.length === days.length) return first + ", and weather every day after.";
      said.push(first + (more ? ", weather on " + more + " more day" + (more > 1 ? "s" : "") : ""));
    }
    if (dark) said.push(wx.length && /^No daylight/.test(dark) ? "no daylight after work on the weeknights" : dark);
    return said.length ? said.join(", and ") + "." : "Nothing in this forecast is worth the drive.";
  }
  // p: what plan() returns. opts.nowHour (local decimal hour) leaves out a
  // trip today that is already over.
  // output: { trip, day, headline, why, leave } | { none: true, headline, why }
  function theCall(p, opts) {
    var days = (p && p.days) || [], now = opts && opts.nowHour, best = null;
    days.forEach(function (day, i) {
      (day.trips || []).forEach(function (t) {
        if (now != null && isToday(day) && t.to <= now) return;
        // Days come soonest first, so on a tie the sooner day is already
        // holding the spot. Only the same day and a proven bank or a shorter
        // drive takes it.
        if (!best || t.score > best.t.score || (t.score === best.t.score && i === best.i && tieBreak(t, best.t) < 0)) best = { t: t, day: day, i: i };
      });
    });
    if (!best) return { none: true, headline: "Nothing worth the drive this week.", why: noCall(days) };
    return { trip: best.t, day: best.day, headline: whenWords(best.day, best.t) + ". " + best.t.name + ".",
      why: whyLine(best.t, 2), leave: "Leave by " + leaveBy(best.t) + "." };
  }

  // The plans a crew can pick for a day: rules confirmed, a way in, in season.
  function plansOn(iso) {
    if (!/^\d{4}-\d\d-\d\d$/.test(iso || "")) return [];
    var day = parseDay(iso);
    return plans.filter(function (p) { return ruleOn(p, day) === "confirmed" && !p.access && spotById(p.spot) && season(p, day); })
      .map(function (p) { return { id: p.id, name: p.name, species: p.species, spot: p.spot }; });
  }

  // ---- loading the forecast (browser only) --------------------------------
  // One Open-Meteo call covers every spot, one marine call the ocean beaches,
  // one NOAA call per tide station. Cached so the pier with no signal still
  // shows the last plan, with its age.
  var CACHE_KEY = "rig.wx.v1";
  // The weather call for a list of spots. The answer comes back in the same order.
  function wxUrl(list) {
    return "https://api.open-meteo.com/v1/forecast?latitude=" + list.map(function (s) { return s.lat; }).join(",") +
      "&longitude=" + list.map(function (s) { return s.lon; }).join(",") +
      "&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover&daily=sunrise,sunset" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=7";
  }
  function urls(today, end) {
    var ms = spots.filter(function (s) { return s.marine; });
    var stations = spots.map(function (s) { return s.tide; }).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    var b = today.replace(/-/g, ""), e = end.replace(/-/g, "");
    return {
      wx: wxUrl(spots),
      // The spots that call asked for, in order. The lake list can change
      // before the answer lands, so shape() goes by this, not by the list then.
      wxSpots: spots.map(function (s) { return s.id; }),
      marine: "https://marine-api.open-meteo.com/v1/marine?latitude=" + ms.map(function (s) { return s.lat; }).join(",") +
        "&longitude=" + ms.map(function (s) { return s.lon; }).join(",") +
        "&hourly=wave_height&length_unit=imperial&timezone=America%2FLos_Angeles&forecast_days=7",
      marineSpots: ms.map(function (s) { return s.id; }),
      waters: "https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-waters?km=230",
      // One call per gauge: Sumner and the 128th St E bridge share PUYW1.
      // spot is the first spot on it, spots all of them.
      flow: (function () {
        var by = {}, out = [];
        spots.forEach(function (s) {
          if (!s.river) return;
          var g = s.river.gauge;
          if (!by[g]) { by[g] = { spot: s.id, spots: [], url: "https://api.water.noaa.gov/nwps/v1/gauges/" + g + "/stageflow" }; out.push(by[g]); }
          by[g].spots.push(s.id);
        });
        return out;
      })(),
      tides: stations.map(function (id) {
        return { id: id, url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=rigcard" +
          "&station=" + id + "&begin_date=" + b + "&end_date=" + e + "&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json" };
      })
    };
  }
  function toHour(iso) { var m = /T(\d\d):(\d\d)/.exec(iso); return +m[1] + m[2] / 60; }
  // wxSpots: the spot ids the weather call asked for (urls().wxSpots). Left
  // out, the answer is matched to the spot list as it stands.
  function shape(wxJson, marineJson, marineSpots, tideJson, wxSpots) {
    var wx = {};
    var list = Array.isArray(wxJson) ? wxJson : [wxJson];
    (wxSpots || spots.map(function (s) { return s.id; })).forEach(function (id, i) {
      var r = list[i]; if (!r || !r.hourly) return;
      var H = r.hourly, sun = {};
      (r.daily.time || []).forEach(function (d, j) { sun[d] = { rise: toHour(r.daily.sunrise[j]), set: toHour(r.daily.sunset[j]) }; });
      wx[id] = { sun: sun, hours: H.time.map(function (t, j) {
        // pop: the chance of rain in that hour, 0 to 100 (the read says it by
        // the hour). A saved forecast from before it was asked for has none.
        return { t: t, temp: H.temperature_2m[j], rain: H.precipitation[j], wind: H.wind_speed_10m[j], gust: H.wind_gusts_10m[j],
          clouds: H.cloud_cover ? H.cloud_cover[j] : null, pop: H.precipitation_probability ? H.precipitation_probability[j] : null };
      }) };
    });
    var ml = marineJson ? (Array.isArray(marineJson) ? marineJson : [marineJson]) : [];
    marineSpots.forEach(function (id, i) {
      var r = ml[i]; if (!r || !r.hourly || !wx[id]) return;
      var by = {}; r.hourly.time.forEach(function (t, j) { by[t] = r.hourly.wave_height[j]; });
      wx[id].hours.forEach(function (h) { if (by[h.t] != null) h.wave = by[h.t]; });
    });
    var tides = {};
    Object.keys(tideJson).forEach(function (id) {
      tides[id] = ((tideJson[id] || {}).predictions || []).map(function (x) { return { t: x.t, v: +x.v, type: x.type }; });
    });
    return { wx: wx, tides: tides };
  }
  // NOAA NWPS stageflow (observed + river forecast, kcfs, UTC) -> local days.
  var LA = null;
  function laIso(t) {
    try {
      LA = LA || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
      return LA.format(new Date(t));
    } catch (e) { return new Date(new Date(t).getTime() - 8 * 3600e3).toISOString().slice(0, 10); }
  }
  // NWPS lists stage and flow in either order: PUYW1 gives stage first (ft)
  // and flow second (kcfs); AUBW1, SQUW1 and MAYW1 give flow ("River
  // Discharge", kcfs) first. Each series names its own two, so the flow is
  // picked by its units (cfs or kcfs), or by its name when it gives no
  // units. A series that names neither field is read flow first, as it
  // always was. A gauge with no flow at all (stage only) gives no readings,
  // and a missing reading (-999) is skipped.
  // -> { k: "primary" | "secondary", x: what turns a value into cfs } or null
  function flowField(s) {
    if (!s || (s.primaryName == null && s.primaryUnits == null && s.secondaryName == null && s.secondaryUnits == null)) return { k: "primary", x: 1000 };
    function pick(name, units) {
      var u = String(units == null ? "" : units).trim().toLowerCase();
      if (u === "kcfs") return 1000;
      if (u === "cfs") return 1;
      return !u && /flow|discharge/i.test(name || "") ? 1000 : 0;
    }
    var a = pick(s.primaryName, s.primaryUnits), b = pick(s.secondaryName, s.secondaryUnits);
    return a ? { k: "primary", x: a } : b ? { k: "secondary", x: b } : null;
  }
  function shapeFlow(j) {
    var days = {}, now = null, ends = null;
    function add(list, obs) {
      var f = flowField(list);
      if (!f) return;
      ((list && list.data) || []).forEach(function (x) {
        var raw = x[f.k];
        if (raw == null || isNaN(+raw) || raw < 0) return;
        var v = Math.round(raw * f.x), iso = laIso(x.validTime), d = days[iso];
        days[iso] = d ? { min: Math.min(d.min, v), max: Math.max(d.max, v) } : { min: v, max: v };
        if (obs) now = { cfs: v, at: x.validTime };
        else ends = iso;
      });
    }
    add(j && j.observed, true); add(j && j.forecast, false);
    return { days: days, now: now, ends: ends };
  }
  function localIso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function cached() {
    try { return JSON.parse(root.localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
  }
  function load(force) {
    var c = cached();
    var now = new Date();
    // Good for three hours. A forecast that is missing a spot's weather is
    // only good for ten minutes, so the next open asks again.
    var life = c && c.missing && c.missing.length ? 10 * 60e3 : 3 * 3600e3;
    if (!force && c && Date.now() - c.at < life && c.today === localIso(now)) return Promise.resolve(c);
    var today = localIso(now), end = localIso(new Date(now.getTime() + 7 * 864e5));
    var u = urls(today, end);
    // Every call gives up after 12 seconds. One stalled server on a weak
    // signal must not leave the screen on "Loading" forever.
    function j(url) {
      var ms = RIG.fetchTimeout || 12000, ctl = root.AbortController ? new root.AbortController() : null, timer;
      var stop = new Promise(function (_, no) { timer = setTimeout(function () { if (ctl) ctl.abort(); no(new Error("timeout")); }, ms); });
      return Promise.race([root.fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }), stop])
        .finally(function () { clearTimeout(timer); });
    }
    var nt = u.tides.length;
    // The weather is the one call the week cannot be built without, so a
    // single hiccup gets one retry before the screen gives up.
    function jRetry(url) {
      return j(url).catch(function (e) {
        return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return j(url); });
      });
    }
    return Promise.all([jRetry(u.wx), j(u.marine).catch(function () { return null; })].concat(u.tides.map(function (t) {
      return j(t.url).catch(function () { return null; });
    })).concat(u.flow.map(function (f) { return j(f.url).catch(function () { return null; }); }))
      .concat([j(u.waters).catch(function () { return null; })])).then(function (res) {
      var tj = {}; u.tides.forEach(function (t, i) { tj[t.id] = res[2 + i]; });
      var data = shape(res[0], res[1], u.marineSpots, tj, u.wxSpots);
      var flow = {};
      u.flow.forEach(function (f, i) {
        var r = res[2 + nt + i]; if (!r) return;
        var sf = shapeFlow(r);
        (f.spots || [f.spot]).forEach(function (id) { flow[id] = sf; });
      });
      var wl = res[res.length - 1];
      var waters = wl && wl.waters ? { at: wl.at, waters: wl.waters.map(function (w) {
        return { geo: w.geo, name: w.name, county: w.county, lat: w.lat, lon: w.lon, km: w.km,
          plants: (w.plants || []).filter(function (x) { return x.fpp != null && x.fpp <= 6; }) };
      }) } : null;
      function done() {
        var missing = spots.filter(function (s) { return !data.wx[s.id]; }).map(function (s) { return s.id; });
        var out = { at: Date.now(), today: today, wx: data.wx, tides: data.tides, flow: flow, waters: waters };
        if (missing.length) out.missing = missing;
        try { root.localStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch (e) { /* full storage: still show it */ }
        return out;
      }
      // The weather call above was built before the feed answered, from the
      // lake list as it stood (often yesterday's, off the saved forecast). A
      // lake that is new today is not in it. Take the feed now, and ask for
      // the weather of just the spots that came back without any.
      if (waters) addWaters(waters);
      var late = spots.filter(function (s) { return !data.wx[s.id]; });
      if (!late.length) return done();
      return jRetry(wxUrl(late)).then(function (more) {
        var got = shape(more, null, [], {}, late.map(function (s) { return s.id; })).wx;
        Object.keys(got).forEach(function (id) { data.wx[id] = got[id]; });
      }, function () { /* those spots wait: scoreTrip lists none without weather, and the saved copy is short-lived */ }).then(done);
    }).catch(function (e) {
      if (c) { c.stale = true; return c; }
      throw e;
    });
  }

  RIG.trips = { spots: spots, plans: plans, limits: LIMITS, slotsFor: slotsFor, season: season,
    moonLit: moonLit, ruleOn: ruleOn, flowField: flowField, puyallupFlow: PUYALLUP_FLOW, plan: plan, detail: detail, theCall: theCall, whyLine: whyLine, leaveBy: leaveBy, plansOn: plansOn, daysOff: DAYS_OFF, addWaters: addWaters, lastPlant: lastPlant, shape: shape, shapeFlow: shapeFlow, riverCall: riverCall, urls: urls, load: load, cached: cached, clock: clock };
})(typeof window !== "undefined" ? window : globalThis);
