# Field Command v3: the coach app (spec, 2026-11-05)

Source: Coach's direction 11/5 night. Same playbook as the BLS website: one coach, one goal per screen, guided, simple. Volunteers, zero scheduling knowledge. Built as a PREVIEW at `/fields/app/` beside the live `/fields/` (live coaches untouched until Coach approves the switch).

## The season, from the coach's side
1. The league texts each division its link, upper divisions first (Majors, Minors, then down). Booking for a division opens when its text goes out.
2. Coaches race for fields. So: **book first, set up second.** The link opens straight onto "Book your practice" for the coach's division.
3. Sign-in stays as today (email on list -> PIN or magic link). Must be fast: remembered device skips it.
4. Booking screen: only fields that fit the division, the division's rule in one plain line (from `flm_settings.practice_rules`), open weekly times as big tap targets, two taps to lock one in. Over-guideline goes through the existing approval path.
5. After the first booking: "Your field is booked. Two quick steps so we can reach you if it's rained out or closed."
   - Step A: Add to Home Screen (iPhone Safari share-sheet steps with pictures; Android install prompt; auto-skip when already standalone).
   - Step B: Turn on notifications (iPhone only allows this from the home-screen app, so A comes first). Uses existing `coach_push_subscribe`.
   - Skippable, but a slim banner stays until done, and admin sees who has not finished.
6. Home (after setup), three things only: **This week** (dated practices and games), **Alerts** (field closures, announcements), **Book or change**.
7. Every dated practice has one-tap **Not using it** and **Rained out** (existing `slot_skip_date`). Releasing never needs a reason; rain-out is one tap.
8. **My people**: player agent for the division, other coaches in the division, board contacts. One tap to call, text or email.

## Never pay for unused fields (core feature)
- Releases (Not using it / Rained out / field closure / slot cancelled) become dated field-hours we can cancel in FMX.
- **Still using it? check-in:** push to the booked coach before each practice ("Practice Tue 5:00 at BLE North. Still using it?"). One tap Yes or Not using it. No answer = using it. Sent by `flm-reminders`, gated by `flm_settings.checkins_enabled` (default false).
- **Field closure:** league closes a field for a date (rain, maintenance). Every coach booked on it that date gets a push (and email when email is on), the practices auto-mark skipped. Table `flm_field_closures`.
- **FMX cancel list (admin):** every released/closed field-date, grouped by FMX request, with the FMX cancel deadline (setting `fmx_cancel_rule`, default "3 days after the date" per Nov 1 minutes, editable), a done checkbox, CSV export, and a running "$ saved" from hourly rates. Plus "unbooked after booking closes" field-dates.
- Automation path (later): FMX REST API is a paid add-on the district admin must provision (Basic auth API user). Until then, the list + a Playwright helper that cancels occurrences in the FMX web UI (we already automate FMX request entry). `flm_fields.fmx` holds the FMX building/field names and request ids.

## Division booking windows
- `flm_settings.booking_windows`: `{ "<division>": "<ISO open time>" }`. Claim/edit refuses before a division's open time with a friendly "Booking for AA opens Fri 6:00 PM". Admin sets times and can "Open now" per division (that is the moment the PA text goes out).

## Division field rules
- `flm_fields.divisions` already exists (empty = any). Admin sets which divisions fit each field (from Jason Guertin's sheet: base and rubber distances). Booking screen filters by it.

## Not in v3 first pass
Game scheduling, umpires, interlock (unchanged, live pages keep them). Visual style keeps Field Command's own look (pine/chalk/clay, Barlow Condensed), not BLS website styling.

## Rules
- No emoji UI, no em dashes in copy, plain words, one dominant action per screen.
- Live `/fields/` and existing gateway actions keep working unchanged (additive changes only).
- All new outbound messages obey `email_enabled` and new `checkins_enabled` switches (default off) and go through BLS league addresses only, never personal addresses.
