# Home screen: your shop

Design, 2026-11-27. Status: waiting for Coach's OK, then built when usage resets.

## Why

Coach, 11/27, sending a picture of his garage (two Ascend kayaks on the wall, rod rack, pegboard of lures, a chest, a cooler): "I don't like the screen I land on ... when I land on trips screen it's just too much thrown at me at once. Almost need to land in my shop, kayaks on the wall, then navigation: maybe the trip of the day or trip of the week, learning of the day, upcoming seasons I need to get gear ready for. Let me decide the direction." Asked to choose, he picked the interactive shop: "I like the more interactive feel."

## Goals

- The app opens in Coach's shop, painted in the same hand as the spot pictures, under the real sky (daylight through the open door by day, the shop lights on at night).
- Tap a thing in the shop to go somewhere. Every tap spot has a small label so nothing is guessed:
  - kayaks: Trips (the trip of the day first, the full week one tap further)
  - rod rack: Learn (knots, casts, guides)
  - corkboard with the crew's next trip pinned: Crew
  - pegboard of lures: Gear (what he owns, what the next trip still needs)
  - chest: catches and the trip log
  - calendar on the wall: Seasons (The year in Washington)
- Three short lines at the bottom answer the day without digging:
  - Today: the trip of the day, judged for his own window (for example "Squid, Redondo, 8 to 12: fair").
  - Learn: one thing a day, starting with "Learn these first".
  - Get ready: the next season that needs gear he does not have yet ("Squid Dec 11: 3 things").
- Hot Trips stays, one tap away under the kayaks. It is no longer the front door.

## Not now

- The name. "Rig Card" no longer fits, "The Shop" is not it, and Coach is still thinking. A placeholder stays until he picks; the name lives in one place so it changes in one edit.
- Jerseys. Coach said no.
- Separate crews (one crew for everyone, 11/27).

## Never

- A busy screen. The shop plus three lines is the whole first screen.
- Gear in the shop he does not own. The shop shows only gear from his gear list; what is not confirmed is not drawn.
- A photo pasted in. A photo cannot follow the sky, the night or his gear.
- Clipart or outline icons (the design identity).

## Constraints

- The design identity (~/memory/design-identity/IDENTITY.md) and its gate.
- The address stays coachpilot.org/rigs, so the home screen icon and the crew join links keep working. The gold hook icon stays.
- Works offline like the rest of the app.

## Approaches

1. **Painted shop (chosen, the lead's call).** A scene in the spot paintings' hand: the wall, the open door with the real sky, each object a tappable group with a label. Follows day and night, shows only owned gear, can change as gear is added. A full day's build with checks.
2. Coach's picture with tap spots on top. Fastest, but it never changes with the sky, the night or his gear, and it looks different from every other screen.
3. A new generated illustration per state (day, night, each gear change). Rich, but every change needs new art, and it drifts from the app's painted look.

## Passes

1. The painted shop with its six labelled tap spots and the three lines. Hot Trips moves one tap in.
2. The live shop: gear appears as it is added to the gear list, the rod for the next season glows with a "get ready" tag, the chest shows the last catch.

## For Coach

- The shop can only show what the gear list knows. Today it knows little (FISHING-INVENTORY.md has line, terminal tackle and lights, and the two kayaks from earlier chats). Photos of the garage wall, the rod rack and the tackle shelves would fill it in. The shop itself can also ask for one thing at a time as he goes.

## Left to the builder

The shop's exact layout, the label style, how a tap opens each place, the night lighting, and how the three lines are worded, all inside the identity and its gate.
