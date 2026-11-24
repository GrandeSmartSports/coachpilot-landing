# Rig Card -> CastAI: what moves, and how

Written 2026-11-23. Coach's direction: one source of data (CastAI's), no double work, and plan for Rig Card to move fully into CastAI.

## Already shared (one source)
| Data | Lives in | Rig Card reads it via |
|---|---|---|
| Stocked waters + WDFW trout plants (nightly) | CoachPilot Supabase `castai_stocking_*` (CastAI pipeline) | edge fn `castai-waters`, snapshot baked into `rigs/waters.js` by `scripts/build-waters.mjs` (daily job) |
| WA fishing spots (321) | `fishing_spots` (CastAI, text NOT verified) | `castai-waters` `spots` (not used for facts yet) |
| WDFW emergency rules | `castai_wdfw_rules` + edge fn `castai-rules` (6 h cron) | `rigs/rules.js` |

## Rig Card parts built to port (plain JS, no DOM)
| Part | File | CastAI target |
|---|---|---|
| Hot Trips planner: pure `plan({today, wx, tides, flow, waters})` | `rigs/trips.js` | Swift port or run in a JS context; same inputs CastAI already fetches (Open-Meteo, NOAA CO-OPS) |
| River go/no-go (`riverCall`, NOAA NWPS `stageflow`) | `rigs/trips.js` | new conditions input next to the kayak go/no-go |
| Run card templates (`KINDS`: squid-pier, pier-salmon, lake-trout, river-steelhead) + hand cards | `rigs/runs.js` | data files; CastAI renders them on the spot sheet |
| Rule matcher (`PLACES`, `FISH`, `newFor`) | `rigs/rules.js` | flags on spot sheets and trips |
| Lake rule check (pamphlet parser) | `scripts/build-waters.mjs` | move into a server job writing a `castai_lake_rules` table |
| Library cards (species, rigs, knots, videos) | `rigs/content.js` | CastAI Library |

## Next steps, in order
1. Lake rules as a table: move the parser into an edge function + `castai_lake_rules` (geo_code, status, closed ranges, lines, read_at) so CastAI and Rig Card read the same verdicts.
2. Hand spots (piers, rivers) into a shared table (`castai_trip_spots`: id, name, lat, lon, drive, tide station, river gauge + numbers, verified rules text, read_at), seeded from `rigs/trips.js`.
3. Plans and run card text into `castai_trip_plans` (plan rows + kind + site JSON). Rig Card then becomes a thin client of the same tables.
4. CastAI feature: "Hot Trips" tab using the planner, run cards on the spot sheet.
5. Rig Card stays as the offline web version or retires once CastAI has it.

## Rules that travel with it
- Only confirmed rules list a trip; unknowns are labeled, never guessed.
- Catchable plants only (6 fish per pound or fewer).
- Lakes with gear rules, catch and release, fly only or an endorsement need their own card before listing.
- Flow numbers are guide numbers (1.5x and 3x the USGS December median; NWS action flow).
