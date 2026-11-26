# Rig Card Crew: requirements

Owner: Cortex, as product owner. Source: Coach's own words, 2026-11-25 and 11-26. Every line below gets built. Nothing here is dropped or swapped for something easier; if a line is blocked, the blocker gets fixed.

Status key: LIVE (shipped and tested), BUILDING, NEXT, NEEDS COACH.

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
