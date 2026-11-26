# Rig Card Crew: design

Date: 2026-11-25. Status: draft for Coach's approval. Nothing built yet.

## Intent

Coach fishes with the same few people: Russell, who he teaches, his dad when he
visits, and his nephew (12 to 15). Rig Card today is one person's app on one
phone. Coach wants it to be a shared app for that small circle.

In his words: "it's a shared app. I can suggest trips he can build and suggest
trips he can learn and sees what I see."

The teaching is the point, but not as homework. Coach was explicit: everyone on
a trip gets the same general knowledge, and the library (videos, descriptions,
run cards) is already right. Russell learns because he can read the same thing
Coach reads, before Saturday, instead of being told it again on the water.

## Goals

1. A crew: a small, invite-only group whose members all see the same thing.
2. Any member can build a trip, or suggest one. Not just Coach.
3. Members say whether they are going, and pin comments to the part of the run
   card they are about.
4. Trip lists: who brings what, checkable, with a name against each item.
5. One tap hands the trip to a normal text thread, because that is where this
   crew actually talks.
6. A member gets in by tapping a link and entering a code texted to their phone.
   No app to install, no password.
7. The pier still works: trips, run cards and library open with no signal.
8. Built once in the shared database, so CastAI reads the same data later.

## Non-goals

- **No assignments, checkmarks, grading or skills tracking.** Coach rejected
  this directly. Everyone gets the same content.
- **No separate kid screen.** The nephew is 12 to 15 and uses the same screens.
- **No public sharing, no feed, no follower model.** The crew is private.
- **The app is not a chat.** Coach: "we will be texting back and forth more."
  Comments are notes left on a card, not a conversation to keep up with. The
  app hands off to Messages instead of competing with it.
- **The garage catalogue waits for the photos.** Coach's call. Trip lists ship
  now as typed items with an owner; the catalogue fills them in later.
- **No notifications until someone switches them on**, and whoever switches
  them on picks who they go to.
- No payments and no premium gating. Accounts are free.

## Anti-goals (this fails even if it ships)

- Russell has to install an app, or remember a password. He will not use it.
- Coach's own fast path gets slower. Opening the app and seeing the week must
  not require signing in.
- A second account system next to CastAI's.
- A trip that will not open at the water because the phone has no bars.

## Constraints, all checked 2026-11-25

- **Accounts already exist.** `auth.users` holds 35 users, 14 with a phone
  number, plus a `profiles` table. They live in the same Supabase project
  (`geigvuysptjvvqanumld`) that Rig Card already calls for WDFW rules and
  stocked waters. There is nothing to build here and nothing to duplicate.
- **Phone sign-in is enabled on that project, and sign-ups are disabled.** New
  members therefore have to be created by invite with the service role, then
  sign in with a code. This is a feature: no stranger can join the crew.
- **Texting works.** Toll-free +1 888 527 7183 is `TWILIO_APPROVED` as of today.
  About $0.011 per code. It is a live spend, small.
- **`shared_trips` is not a crew trip.** It exists (16 columns, 2 rows) but it is
  a one-way public postcard of a single plan. Leave it alone.
- **`catch_logs` is personal** (18 columns, 4 rows). The after-trip log extends
  it with a trip reference rather than adding a second log.
- **Rig Card has no server.** It is a static page on Vercel with a service
  worker. Every write goes through a Supabase edge function, the same pattern as
  `castai-rules` and `castai-waters`.

## Approaches considered

**A. Build it in CastAI (iOS) first.** Rejected. Russell, Coach's dad and his
nephew would each need an App Store install before they could see Saturday's
plan, and the planner and run cards exist only on the web, so this would mean
porting them to Swift first. Months, for a thing that should take weeks.

**B. Give Rig Card its own accounts.** Rejected. That is a second account system
beside CastAI's: exactly the double work Coach called out.

**C. One shared backend, web client first. Chosen.** New crew tables and edge
functions in the existing Supabase, on top of the accounts that are already
there. Rig Card is the first client because a link beats an install. CastAI
reads the same tables when its Hot Trips tab lands, per
`docs/rigcard-castai-port.md`.

## The design

### Crews and people

- A **crew** is a named group. Coach owns one. Members are `owner` or `member`;
  the only difference is who can invite and remove.
- Coach invites by typing a name and a phone number. The server creates the
  account, adds the membership, and texts a link.
- A member sees every trip, comment and catch belonging to their crew.
- The library, spots, WDFW rules and stocked waters stay global. They are the
  same for everyone and are not crew data.
- More than one crew is allowed from day one (his dad's visits and Russell's
  weekends are different circles), but Coach can run with a single crew.

### Trips

- A **crew trip** is a real plan: a spot, a species, a date and a window. It is
  created either from a Hot Trip ("we're doing this one") or from scratch.
- Status is `idea`, `planned` or `done`. "Suggest a trip" is just an `idea`, and
  any member can raise it to `planned`.
- A trip points at its run card by id. The run card content is never copied, so
  it keeps improving in one place.
- Each member is `going`, `out` or `maybe`.

### Comments, pinned where they belong

- A comment is attached to one section of the trip: the plan, the gear, the
  bait, the spot, and so on. It shows on that section, with a count on the
  section row so an unread note is visible from the trip overview.
- A comment on the trip itself (no section) is allowed and shows at the top.
- Oldest first, name and time, no threads and no reactions. These are notes a
  crew leaves each other, not a conversation.

### Lists

- A trip has a list: items, each optionally assigned to a member, each
  checkable. "Russell: ring nets. Coach: bait and the cooler."
- An item is free text now. When the garage catalogue exists it offers what
  Coach owns, and a loaner flag for a guest like his dad.
- The run card's own gear checklist stays what it is: what the trip needs. The
  list is what this crew is bringing.

### Handing off to a text thread

- A **Text the crew** button on a trip opens the phone's messaging app with a
  short summary already written: what, where, when to leave, and the link.
  Coach sends it himself; the app never sends on his behalf.

### Notifications

- Off for everyone by default. A member can switch them on for themselves and
  choose which members' activity they want.
- The only text the system sends unprompted is the invite.

### The log

- After a trip, a member can add a catch, which writes to `catch_logs` with the
  trip's id. The crew sees that trip's catches.

### Sign-in

- A **Sign in** screen: phone number, then the six digit code, then in. The
  session persists, so nobody signs in twice.
- **Signed out, the app is exactly what it is today**: Coach's week, his run
  cards, the whole library, no crew. Signing in adds the crew; it never gates
  what already works.

### Offline

- Crew trips and their comments cache with the rest of the app, so a trip opens
  at the water.
- A comment written with no signal queues and sends when the phone has bars.

### The garage catalogue, later

- When the garage photos exist, gear items gain an owner and a status, and a run
  card's checklist can read "Russell has the net" instead of "need a net". A
  guest like Coach's dad owns nothing, so his list is loaners.
- Not built now. Trip lists above are shaped so the catalogue fills them in.

## Calls I made after the builder review

These were questions a builder would otherwise have to guess at. Coach can
overturn any of them.

- **Catches stay private unless they belong to a crew trip.** `catch_logs` today
  is own-row-only, and CastAI relies on that. Rather than widen it, the column
  `trip_id` is added (nullable, additive) and crew catches are read through an
  edge function that returns only catches tagged with a trip the caller is on.
  Nothing about CastAI's behaviour changes.
- **A crew trip stores the plan, not the forecast.** It keeps the spot, species,
  date, window and run card id. Every phone re-runs the planner against current
  weather, tide and flow, so nobody is looking at Tuesday's wind on Saturday.
- **Trips are built from spots the app knows.** All 43 of them, with their run
  cards. A spot the app does not have is a request to add one, not a free text
  field, so a trip can never point at a card that does not exist.
- **An invited phone that already has an account is attached, not duplicated.**
  Several of the 35 existing users may be people Coach knows.
- **A member edits and deletes their own trips, lists and comments. The owner
  can remove anything.** Anyone can raise an idea to planned; the person who
  raised it, or the owner, can put it back.
- **Crew trips sit above the week on the Trips tab, not instead of it.** The
  planner keeps suggesting; a crew trip is one someone committed to.
- **The nephew has his own phone** (Coach confirmed), so no shared-number case.

## Left to the builder

- Table and column names (prefix `castai_crew_`), RLS policies, and the edge
  function surface.
- The wording of the invite text.
- Where Sign in sits in the tab bar, and how "going" shows on a trip row.
- Whether comments and catches share one timeline on the trip screen.

## Risks

- Codes cost money per text. Pennies, but real, and the toll-free number must
  stay approved.
- Phone numbers are personal data. Store the minimum, and never show one member
  another member's number. A name is enough.
