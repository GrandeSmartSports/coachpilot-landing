# Rig Card Crew: requirements

Owner: Cortex, as product owner. Source: Coach's own words, 2026-11-25 and 11-26. Every line below gets built. Nothing here is dropped or swapped for something easier; if a line is blocked, the blocker gets fixed.

Status key: LIVE (shipped and tested), BUILDING, NEXT, NEEDS COACH.

## North star

"The actual guide in your pocket, not the map and tools in your pocket." (Coach, 2026-11-26)

Every other fishing app opens to a map of dots, buries you in detail, and asks thirty questions first. This one makes the call. Five tests every screen has to pass:

1. **Suggestions first.** The front door is the call for this week, never a map, a dashboard or a form.
2. **One thing at a time.** A headline, then one tap to dig in. Never a wall.
3. **No interrogation.** Zero questions before first use. "The app should learn the user just like the user is learning the app." At most one question, in the moment, only when the answer changes the advice.
4. **It talks like a guide.** The call, why, what to bring, how to fish it, and when to stay home.
5. **It gets better the more you fish with it.**

## Who it is for

Coach, Russell (who Coach teaches), Coach's dad when he visits, Coach's nephew (12 to 15, own phone). "It's a shared app. I can suggest trips, he can build and suggest trips, he can learn, and sees what I see."

## Requirements

| # | Requirement | Coach's words | Status |
|---|---|---|---|
| R1 | Sign in with a phone number and a texted code | "sign in with phone number get a code" | LIVE 11-26. Root cause was a stale Twilio password in the sign-in service; fixed, sign-ups still closed |
| R2 | Invite-only. Coach adds a person; they are in with one tap on a link he texts, or with their number and a code | "used by multiple people" | BUILDING |
| R3 | Everyone on the crew sees the same week, spots, run cards and videos. No homework, no tracking, no grading | "sees what I see", "both get the same general knowledge", "What's already in the app is perfect" | LIVE for the week and library; crew views BUILDING |
| R4 | Anyone can build a trip or float one as an idea, from a Hot Trip or from scratch | "he can build and suggest trips" | BUILDING |
| R5 | Going, maybe or out, per person, per trip | "prepare together" | BUILDING |
| R6 | Notes pinned to the part of the trip card they are about | "Comments like we can do on artifacts" | BUILDING |
| R7 | Equipment is assigned. Each trip has a list, started from that trip's own gear list, every line can carry a name and a tick | "be assigned equipment", "Assigning gear making lists" | BUILDING |
| R8 | One tap hands the trip to the normal text thread | "we will be texting back and forth more so being able to switch back and forth to text would probably be best" | BUILDING |
| R9 | Notifications. Off until a person turns them on. The person sending can choose who gets it. By text and by phone alert | "We can opt in and turn on notification, choose who we send it to" | BUILDING (sender set up 11-26: texts from the toll-free line, phone alerts through the push keys the project already has) |
| R10 | Catches on a trip, with a photo, visible to the crew, and the same catch shows in that person's CastAI catch log | "catches", "everything must connect easily later" | BUILDING (uses CastAI's own catch log and photo storage, no second copy) |
| R11 | Live go or no-go on any planned trip: weather, tide, river flow, daylight, season, rules | "it helps build the go no go" | BUILDING |
| R12 | The screen is the sky: bright in daylight, dark at night, with a switch for glare. Feels like Washington water. Quality bar: HomeworkQuest | "background to match the sky", "has to be able to switch to dark mode if the glare isn't working", "the graphics are next level I want the same for this" | LIVE; full pass over every screen BUILDING |
| R13 | Works with no signal: what was opened still opens; a note, tick or catch made at the pier sends itself later, once | "no signal at the pier" | BUILDING |
| R14 | Nobody is ever forced to sign in to use the app as it is today | design, approved | LIVE |
| R15 | Built once, in CastAI's own accounts and database, so it moves into CastAI without a rebuild | "everything must connect easily later" | LIVE for accounts; holds for every new piece |
| R16 | The garage: what Coach owns, so lists can say "Coach has it" and a visitor's list is loaners | "Wait for the photos" | NEEDS COACH: garage photos |

### The guide (added 2026-11-26)

| # | Requirement | Coach's words | Status |
|---|---|---|---|
| R17 | The call. The top of the home screen is the one best trip for you this week, said the way a guide would say it, with the reason and the next step | "I want suggestions", "actually help me plan" | LIVE 11/26 as the top card of Hot Trips (was: NEXT, today, with the new look; the planner already has the data) |
| R18 | The app learns the person by use: where they start from, when they fish, how far they will drive, shore or kayak or boat, what they chase, what they own, how experienced they are. No setup form | "The app should learn the user just like the user is learning the app" | NEXT (design first; today the week is tuned to Coach by hand) |
| R19 | One question at a time, in the moment, skippable, only when the answer changes the advice | "asked me about 30 questions before I even got started" | NEXT, with R18 |
| R20 | After a trip, one tap: how did it go. It feeds what the guide suggests next, and the crew log | "learn the user" | NEXT, with R18 |
| R21 | The map is a view you can open, never the front door | "It opens to a map with dots... everything wrong" | LIVE (Trips opens to the list; Map is a second tab) |
| R22 | The look is "On the water": a painted picture of the water on top of every screen under the real sky, cards crossing the waterline, lit at night. It follows the design identity at ~/memory/design-identity and passes its gate before Coach sees it | "that look is right it is coming together" | Hot Trips and trip cards LIVE 11/26 (stage A); library, crew, final proof NEXT (stages B, C, D in docs of the port brief) |
| R23 | The app knows the spot. Each spot gets its own picture from true facts: which way you face, what is really on the skyline, the real pier or bank, with today's tide, river level, wind and rain painted in. Coach's own spots first. A fact that cannot be proven is not drawn | "I don't want it to be the same 5 scenes... How do we make it feel like the app knows our spots. These make me feel like the app is putting me into the spot" | NEXT (stage E; spot facts being researched and verified 11/26) |
| R24 | Every person is called by their own name, which they can change. The owner can rename the crew. "Coach" is never a person's name in the app | "my name isn't coach to everyone else" | Server LIVE 11/26 (me_rename, crew_rename); screen NEXT (stage C) |

## Rules that hold across all of it

- A person's phone number is never shown to anyone else. Names only.
- Coach is the only one who adds or removes people.
- Anyone on the crew can turn an idea into a plan. Only the person who made a trip, or Coach, can cancel or delete it.
- Texts and alerts go only to people who switched them on, never more than a set number a day, and "STOP" always works.
- Tests run against a throwaway test crew, never Coach's.

## Coach's tasks

1. Sign in once with your own number (texting is fixed).
2. Add Russell when I say trips are ready, and text him his link.
3. For alerts on your own iPhone: add Rig Card to your Home Screen (Apple only allows alerts for home screen apps).
4. Garage photos, whenever, for R16.
5. Optional: tap Merge on the hub icon, https://github.com/GrandeSmartSports/grande-family/pull/3
