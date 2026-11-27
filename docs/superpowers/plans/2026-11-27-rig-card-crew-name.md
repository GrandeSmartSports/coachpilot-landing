# Rig Card Crew: whoever joins names the crew (2026-11-27)

Coach, 11/27: the crew's title "Daniel's crew" read oddly. Offered names to pick from, he said: "None of these. How about we provide examples and let Russ choose on his invite." So the person who joins names the crew, and the name carries the joke (pros with pro jerseys, two fish in about a dozen trips).

## Server (additive to the contract in `2026-11-26-rig-card-crew-pieces-2-4.md`)

- Migration `supabase/migrations/20261127_0900_castai_crew_name_open.sql`: `castai_crew.name_open boolean not null`. Crews already there were filled with `false` (closed); the default is then `true`, so a crew made from now on starts open.
- `state.crew` is `{ id, name, role, nameOpen }`. `join` (peek and mint) adds `nameOpen`.
- `crew_rename { name }` (1 to 60 characters): the owner any time; a member only while `nameOpen` is true. Either one closes naming (`name_open = false`). A member's rename writes only where `name_open` is still true, in the same statement, so of two at once only the first lands. Refused: 403 `{ error: "The crew has its name. Only the owner can change it." }`. Answer `{ ok, name }`.
- `crew_name_open { open: true|false }`: owner only (403 otherwise), 400 for anything but a boolean. Answer `{ ok, nameOpen }`.

## Page

- While `nameOpen`, the stored name is a stand-in and is never shown: titles say "The crew", the join screen "NAME added you to their fishing crew, RUSSELL." (title "Join the crew"), and "You are already on the crew".
- After Join on a crew with its name open: `#/crew/name`, one step titled "Name the crew": a jersey with the name on it, "Pick one, or make your own. It goes on the jerseys.", six names to tap (Plateau Pro Staff, Bonney Lake Skunk Works, Two Fish Pros, Sponsored by Nobody, Professional (Allegedly), Twelve Trips Two Fish), a box for their own, a gold Save (crew_rename through the write queue) and a plain Later. Save lands on Hot Trips with "You are in, NAME. Welcome to CREWNAME."; Later with "You are in, NAME. Here is the crew's week."
- Crew screen while open: a member sees the same card first, across the waterline; the owner sees one line ("The next person to join names the crew." alone, else "No name yet. Anyone on the crew can pick it.") and his Rename, whose box starts empty.
- `RIG.crew.crewNameOpen(open)` exists for the owner (needs a signal). The page has no button for it: the lead opens naming on a real crew by hand.

## Tests

`tests/castai-crew.test.mjs` (the rule), `tests/castai-crew-schema.test.mjs` (the migration), `tests/rigs-crew-client.test.mjs` (the writes), `tests/rigs-crew-name.smoke.mjs` (the screens), `tests/rigs-look-crew.smoke.mjs` (picture, waterline, contrast under eight skies), and the live walks on the ZZTEST crew only: `npm run test:crew-live` and `npm run test:crew-live-page`, which open naming, name it, are refused a second time, and always put "ZZTEST crew" back with naming closed (swept at the start too).
