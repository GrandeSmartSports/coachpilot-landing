# One library, two apps

Written 2026-11-27. The Rig Card does not rebuild CastAI's library. It takes it.

## Where the library lives

In CastAI, as JSON files inside the iOS app: `CastAI/CastAI/Resources/`

- `FishingKnots.json` (32 knots), `CastingTechniques.json` (14 casts), `FishSpecies.json` (121 fish)
- Guides: `SalmonFishingGuide`, `BeginnersGuide`, `ReadingWaterGuide`, `SeasonalGuide`, `FlyFishingGuide`, `DehookingGuide`
- Gear: `TackleGuide`, `GearBudgetGuide`

CastAI shows them with `CastAI/Features/Library/*.swift`.

## How the Rig Card takes it

1. `node scripts/import-castai-library.mjs` reads those files (set `CASTAI_RESOURCES` to read another copy) and writes `rigs/library.js`. Rerun it and you get the same file. Nothing in it is typed by hand.
2. On the way in it:
   - applies the corrections in `scripts/castai-library-overrides.json`: a wrong step, a missing or wrong video, a claim with no source, a spot or a method that is wrong for Washington, a duplicate card folded into the one it repeats. A correction can set a field, replace or cut words, drop a section, or fix one item of a guide by its CastAI name. Each has a reason and a source, and one that no longer finds its words stops the import.
   - drops a seasons bullet that names a fish CastAI's own species table says is not in Washington.
   - cuts every rule (limits, seasons, sizes, closures, licenses). The Rig Card's rules are checked per trip; a guide links to them instead.
   - puts it in the Rig Card's voice: no dashes, no hype, short. The names, one lines and "where it fails" lines are in `scripts/castai-library-voice.json`.
   - ships a video only if YouTube answered for it and its title names the knot or cast (`--check-videos` refreshes `tests/fixtures/castai-videos.json`).
3. It writes `docs/castai-library-fixes.md`: every correction and every rule it cut. The CastAI lane fixes those in CastAI. Then the override is deleted here and the import rerun.

The app loads `rigs/library.js` after the first screen and keeps it offline. Learn shows Knots, Casting, Guides and Gear; a fish's page shows what CastAI says about that fish.

## The path to one library

- **Now:** CastAI's files are the source. The Rig Card copies them with one command.
- **Next:** put the library JSON in Supabase (one table per kind, or one JSON row per file). CastAI and the Rig Card both read that live copy, so a fixed step or a new video reaches both apps without an App Store release. The import script becomes the job that writes the table, with the same corrections and rule cuts. The Rig Card keeps its offline copy.
- **Later:** one app. CastAI takes in the Rig Card's Hot Trips, run cards and crew (see `docs/rigcard-castai-port.md`), and the library is already shared.
