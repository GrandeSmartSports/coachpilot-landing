// The crew client: signing in, the crew, crew trips, notes, the list, catches,
// alerts, and the queue that carries a write made with no signal.
//
// The page talks to Supabase's REST endpoints directly: no npm, no bundler,
// so Rig Card stays a static file that opens at the pier. Accounts are the
// same ones CastAI uses, and sign-ups are off on the project, so a number
// only works once Coach has added it. Signed out, nothing here sends anything
// and the app is exactly what it was.
//
// The contract with the server: docs/superpowers/plans/2026-11-26-rig-card-crew-pieces-2-4.md
//
// ---------------------------------------------------------------------------
// RIG.crew, the whole interface
// ---------------------------------------------------------------------------
// Every method below marked (async) returns a promise that RESOLVES, always.
// It never rejects. What it resolves to is one of:
//   the answer            the shapes listed here
//   { error, status? }    plain words to show, and the HTTP status when there was one
//   { signedOut: true }   only after the sign-in server itself said the session is gone
//   { offline: true }     no answer came (no signal, or the time limit ran out)
// RIG.crew.say(answer, fallback) turns any answer that is not a success into
// one sentence for the screen.
//
// Shapes (the server's own, see the contract):
//   Trip    { id, planId, spotId, species, title, date, from, to, status, note, by, going: [{id, name, answer}],
//             counts: { comments, list, listDone, catches }, updatedAt }
//   Comment { id, section, body, by, at, mine }      Item { id, label, assignedTo, done, mine }
//   Catch   { id, species, lengthIn, weightLb, lure, notes, photoUrl, by, at, mine }
//   A row that has not reached the server yet carries waiting: true, and a
//   comment or list line also has the id "q:<clientId>" until it lands.
//
// Session
//   session()                      -> { token, refresh, at, userId } | null                    (sync)
//   sendCode(phone)       (async)  -> { ok: true } | { error, retryAfter?, unknown?, offline? }
//   verify(phone, code)   (async)  -> { ok: true } | { error, offline? }
//   join(text, { peek })  (async)  -> { ok: true, name, crew, by } | { error, status, dead? } | { offline: true }
//                                     text is a link, a bare token, or a whole message with the link in it.
//                                     With peek nothing is minted and nobody is signed in.
//   joinToken(text)                -> the token inside text, or ""                             (sync)
//   signOut()             (async)  -> { ok: true }   (the phone is signed out before it returns)
//   refresh()             (async)  -> { ok: true } | { signedOut: true } | { offline: true }
//   addMyNumber(phone)    (async)  -> { ok: true } | { error, retryAfter? } | signedOut | offline
//   confirmMyNumber(phone, code) (async) -> { ok: true } | { error } | signedOut | offline
//   normalizePhone(text)           -> "+1XXXXXXXXXX" | null                                    (sync)
//   cooldownLeft(phone)            -> seconds until another code may be asked for              (sync)
//
// Reads. Each takes opts { fresh?: boolean, onFresh?: function (answer) }.
//   With something saved on the phone the promise resolves AT ONCE with it
//   and stale: true, the network is asked in the background, and onFresh is
//   called once with what came of that: the fresh answer, or the saved one
//   with stale: true and offline: true (or error), or { signedOut: true }.
//   With nothing saved, or with fresh: true, the promise waits for the
//   network (never longer than the time limit) and falls back the same way.
//   hello(opts)           (async)  -> { ok, sms, vapidKey, stale? }            (no sign-in needed)
//   state(opts)           (async)  -> { me, crew, members, trips, sms, stale?, offline?, error? }
//                                     crew is null for someone who is on no crew.
//                                     members: [{ id, name, role, alerts, signIn: "link"|"code" }]
//   trip(id, opts)        (async)  -> { trip, comments, list, catches, stale?, offline?, error? }
//                                     | { error, status: 404, gone: true } when it was deleted
//   cached()                       -> the saved state with waiting writes laid over it, or null  (sync)
//   cachedTrip(id)                 -> the saved trip the same way, or null                     (sync)
//
// Writes that need a signal (offline they answer { offline: true })
//   createTrip({ planId, spotId, species, title, date, from?, to?, status?, note?, seedList?, tell? })
//                         (async)  -> { ok, trip }
//   updateTrip(id, { status?, date?, from?, to?, note?, title?, tell? })  (async) -> { ok, trip }
//   deleteTrip(id, { tell? })  (async) -> { ok }          (already gone counts as done: { ok, gone: true })
//   invite(name, phone?)  (async)  -> { ok, created, name, userId, link, signIn: "link"|"code" }
//   link(userId)          (async)  -> { ok, name, link }
//   removeMember(userId)  (async)  -> { ok }
//   prefsGet()            (async)  -> { prefs: { texts, push, evTrips, evStatus, evNotes, evGearCatches,
//                                     quietFrom, quietTo, textsStopped }, hasPhone, pushSubs }
//   prefsSet(fields)      (async)  -> the same shape
//   pushSubscribe()       (async)  -> { ok: true, endpoint } | { error, needsInstall? | unsupported? | denied? }
//                                     Asks the phone's permission, so call it straight from a tap.
//   pushUnsubscribe()     (async)  -> { ok: true }
//   testAlert()           (async)  -> { ok, push: "sent"|"none"|"failed", text: "sent"|"none"|"failed"|"stopped" }
//   alerts()                       -> { supported, ios, installed, permission, needsInstall }  (sync)
//
// Writes that wait for a signal. With one they answer with the server's row.
// Without one they answer { ok: true, queued: true, clientId, <the row, waiting: true> },
// show at once on cached() and trip(), and send themselves later, in order, once.
//   going(tripId, answer)                     (async) -> { ok, going: [{id, name, answer}] }
//   addComment(tripId, section, body, { tell? })  (async) -> { ok, comment }
//   deleteComment(commentId)                  (async) -> { ok }
//   addItem(tripId, label, assignedTo, { tell? }) (async) -> { ok, item }
//   updateItem(itemId, { done?, assignedTo?, label?, tell? })  (async) -> { ok, item }
//   deleteItem(itemId)                        (async) -> { ok }
//   catch(tripId, { species, lengthIn?, weightLb?, lure?, notes?, technique?, spotName?, lat?, lon?,
//                   at?, photo?: File|Blob }, { tell? })   (async) -> { ok, catch }   (addCatch is the same)
//   deleteCatch(catchId)                      (async) -> { ok }
//
// The queue
// A write the server would refuse anyway (an empty note, a line with no
// words) answers { error } at once and is never queued. A queued write the
// server later refuses is dropped, never retried, and lands in failed(). So
// does one the server has answered with a fault for three days running.
// A catch whose photo the store refuses is still saved, with photoFailed: true.
//   pending()             (async)  -> { count, items: [{ clientId, kind, tripId, at }] }
//   flush()               (async)  -> { ok, sent, left, dropped: [{ clientId, kind, tripId, error, status }],
//                                       stopped?: "offline"|"later"|"signedOut", offline?, signedOut? }
//   failed()                       -> writes the server refused: [{ clientId, kind, tripId, error, status, at }]  (sync)
//   clearFailed()                  -> empties that list                                        (sync)
//   onChange(fn)                   -> stop()   fn({ kind: "session"|"state"|"trip"|"queue", tripId?, dropped? })
//                                     "queue" fires when a write is added, sent or dropped. dropped lists only
//                                     the ones nobody was still waiting on (the same ones failed() keeps).
//
// Odds and ends
//   isNew(trip)                    -> boolean: changed since this phone last opened it         (sync)
//   markSeen(tripId)               -> remembers it as seen now                                 (sync)
//   textLink(body)                 -> "sms:&body=..." on iPhone and iPad, "sms:?body=..." elsewhere  (sync)
//   say(answer, fallback)          -> one sentence for an answer that is not a success         (sync)
//   canTell()                      -> [{ id, name }]: the others on the crew with alerts on, for a "Tell" row  (sync)
//   shrinkPhoto(file, max?) (async, may reject) -> a JPEG Blob no more than 1600 px on the long side
//
// On the phone: rig.session.v1 (the sign-in), rig.crew.v1 (last state),
// rig.crewtrip.v1 (trips opened), rig.crewhello.v1, rig.crewq.v1 (small writes
// waiting), rig.crewqfail.v1 (writes refused), rig.crewseen.v1 (new dots),
// rig.codesent.v1 (code cooldown), and IndexedDB "rig-crew" (catches waiting,
// with their photos).
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});
  var BASE = "https://geigvuysptjvvqanumld.supabase.co";
  var KEY = "sb_publishable_m6EWBWxKPeOaVpPQOVDjyg_sTRWlnbe"; // publishable, safe in a page
  var FN = BASE + "/functions/v1/castai-crew";
  var SES = "rig.session.v1", SENT = "rig.codesent.v1", CREW = "rig.crew.v1", TRIPS = "rig.crewtrip.v1",
    HELLO = "rig.crewhello.v1", QUEUE = "rig.crewq.v1", FAILED = "rig.crewqfail.v1", SEEN = "rig.crewseen.v1";
  var COOLDOWN = 60e3, KEEP_TRIPS = 30, KEEP_FAILED = 20, PHOTO_MAX = 1600, GIVE_UP = 3 * 864e5;
  var BAD_PHONE = "That does not look like a US phone number.";
  var NO_SIGNAL = "No signal. That was not sent.";

  // ---- the phone's own store ------------------------------------------------
  function read(k, d) { try { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function drop(k) { try { root.localStorage.removeItem(k); } catch (e) { /* nothing to do */ } }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function nowIso() { return new Date().toISOString(); }
  function nil() { return null; }
  function uuid() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    var b = new Uint8Array(16), i, h = "";
    if (c && c.getRandomValues) c.getRandomValues(b); else for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    for (i = 0; i < 16; i++) h += (b[i] < 16 ? "0" : "") + b[i].toString(16);
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  var listeners = [];
  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  function emit(what) { listeners.slice().forEach(function (fn) { try { fn(what); } catch (e) { /* a listener's fault is its own */ } }); }

  // ---- the network ----------------------------------------------------------
  // Every request has a time limit, the same one the forecast calls use. One
  // bar at the rail opens a connection and never answers: without a limit the
  // screen sits on "Loading" with a good saved copy unused.
  function limit() { return RIG.fetchTimeout || 12000; }
  function within(promise, ms) {
    var timer = null;
    var stop = new Promise(function (_, no) { timer = root.setTimeout(function () { no(new Error("timeout")); }, ms); });
    return Promise.race([promise, stop]).then(function (v) { root.clearTimeout(timer); return v; },
      function (e) { root.clearTimeout(timer); throw e; });
  }
  function isBlob(b) { return !!b && typeof b === "object" && typeof b.size === "number" && typeof b.slice === "function"; }
  // Resolves { status, ok, body } for any answer a server gives. Rejects only
  // when no answer came. The limit covers reading the body too.
  function http(method, url, body, headers, ms) {
    var h = Object.assign({ apikey: KEY }, headers || {});
    var opts = { method: method, headers: h };
    if (body !== undefined && body !== null) {
      if (isBlob(body)) opts.body = body;
      else { if (!h["Content-Type"]) h["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    }
    var ctl = root.AbortController ? new root.AbortController() : null;
    if (ctl) opts.signal = ctl.signal;
    var go = Promise.resolve().then(function () { return root.fetch(url, opts); }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        return { status: r.status, ok: r.status >= 200 && r.status < 300, body: j };
      });
    });
    return within(go, ms || limit()).catch(function (e) {
      if (ctl) { try { ctl.abort(); } catch (x) { /* already over */ } }
      throw e;
    });
  }
  function words(r, fallback) { return (r && r.body && typeof r.body.error === "string" && r.body.error) || fallback; }
  function isObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  // One at a time across tabs where the phone can do that, and never stuck
  // behind a tab the phone has frozen: after the time limit we go anyway.
  function withLock(name, work) {
    var locks = root.navigator && root.navigator.locks;
    if (!locks || typeof locks.request !== "function") return Promise.resolve().then(work);
    return new Promise(function (done) {
      var ran = false, timer = null;
      function run() {
        if (ran) return null;
        ran = true;
        root.clearTimeout(timer);
        var p = Promise.resolve().then(work);
        p.then(done, function () { done(null); });
        return p.then(nil, nil);
      }
      timer = root.setTimeout(run, limit());
      try { Promise.resolve(locks.request(name, run)).then(nil, function () { run(); }); } catch (e) { run(); }
    });
  }

  // ---- the session ----------------------------------------------------------
  function session() { var s = read(SES, null); return s && s.token ? s : null; }
  function forgetCrew() { drop(CREW); drop(TRIPS); }
  function saveSession(b, userId) {
    var before = session();
    var s = { token: b.access_token, refresh: b.refresh_token || (before && before.refresh) || null,
      at: Date.now() + ((b.expires_in || 3600) * 1000), userId: (b.user && b.user.id) || userId || null };
    // A different person on this phone: what was saved of the last crew is not theirs.
    var c = read(CREW, null);
    if (c && c.me && s.userId && c.me.id !== s.userId) forgetCrew();
    write(SES, s);
    return s;
  }
  function forget() { drop(SES); forgetCrew(); emit({ kind: "session" }); }

  function normalizePhone(raw) {
    var digits = String(raw == null ? "" : raw).replace(/\D+/g, "");
    if (digits.length === 10) return "+1" + digits;
    if (digits.length === 11 && digits[0] === "1") return "+" + digits;
    return null;
  }

  // Supabase rate limits codes per number. Say when, rather than failing quietly.
  function cooldownLeft(raw) {
    var phone = normalizePhone(raw) || raw;
    var sent = read(SENT, {})[phone] || 0, left = COOLDOWN - (Date.now() - sent);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }
  function stamp(phone) { var map = read(SENT, {}); map[phone] = Date.now(); write(SENT, map); }
  function authCode(r) { return String((r.body && (r.body.error_code || r.body.error)) || ""); }
  function authMsg(r) { return String((r.body && (r.body.msg || r.body.message || r.body.error_description)) || ""); }

  var sending = {};
  function sendCode(raw) {
    var phone = normalizePhone(raw);
    if (!phone) return Promise.resolve({ error: BAD_PHONE });
    var left = cooldownLeft(phone);
    if (left) return Promise.resolve({ error: "A code was just sent. Try again in " + left + " seconds.", retryAfter: left });
    // A double tap is one request, and both taps hear how it went.
    if (sending[phone]) return sending[phone];
    sending[phone] = http("POST", BASE + "/auth/v1/otp", { phone: phone, create_user: false }).then(function (r) {
      if (r.ok) { stamp(phone); return { ok: true }; }
      var code = authCode(r);
      if (code === "otp_disabled" || code === "user_not_found" || code === "signup_disabled" || /signups? not allowed/i.test(authMsg(r))) {
        return { error: "That number is not on a crew yet. Ask whoever runs your crew to add you.", unknown: true };
      }
      if (r.status === 429 || /rate_limit/.test(code)) {
        stamp(phone);
        return { error: "A code was just sent. Enter it, or try again in a minute.", retryAfter: Math.ceil(COOLDOWN / 1000) };
      }
      return { error: "That code could not be sent. Check the number and try again." };
    }).catch(function () {
      return { error: "The code could not be sent. You may be out of signal.", offline: true };
    }).then(function (v) { delete sending[phone]; return v; });
    return sending[phone];
  }

  function signedIn(body, userId) {
    saveSession(body, userId);
    emit({ kind: "session" });
    kickSoon();
    return { ok: true };
  }
  function verify(raw, code) {
    var phone = normalizePhone(raw);
    if (!phone) return Promise.resolve({ error: BAD_PHONE });
    return http("POST", BASE + "/auth/v1/verify", { type: "sms", phone: phone, token: String(code || "").trim() }).then(function (r) {
      if (!r.ok || !r.body || !r.body.access_token) return { error: "That code did not work. Check it, or ask for a new one." };
      return signedIn(r.body, null);
    }).catch(function () {
      return { error: "That did not go through. You may be out of signal.", offline: true };
    });
  }

  // What someone pastes may be the bare token, the whole link, or the whole
  // text message with the link inside it. Anything else comes back as "".
  function joinToken(raw) {
    if (typeof raw !== "string" || raw.length > 4000) return "";
    var text = raw.trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(text)) return text;
    var m = text.match(/\/join\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/);
    return m ? m[1] : "";
  }
  function join(input, opts) {
    var token = joinToken(input), peek = !!(opts && opts.peek);
    if (!token) return Promise.resolve({ error: "That does not look like a crew link. Paste the whole text you were sent.", status: 400 });
    return http("POST", FN, peek ? { action: "join", token: token, peek: true } : { action: "join", token: token }).then(function (r) {
      if (!r.ok || !isObject(r.body) || !r.body.ok) {
        var out = { error: words(r, r.status === 410 ? "That link is not good any more. Ask for a new one." : "That link could not be checked. Try again in a minute."), status: r.status };
        if (r.status === 410) out.dead = true;
        return out;
      }
      var who = { ok: true, name: r.body.name, crew: r.body.crew, by: r.body.by || null };
      if (peek) return who;
      if (!r.body.token_hash) return { error: "That link did not let you in. Tap it again, or ask for a new one.", status: r.status };
      return http("POST", BASE + "/auth/v1/verify", { type: "magiclink", token_hash: r.body.token_hash }).then(function (v) {
        if (!v.ok || !v.body || !v.body.access_token) return { error: "That link did not let you in. Tap it again, or ask for a new one.", status: v.status };
        signedIn(v.body, null);
        return who;
      });
    }).catch(function () { return { offline: true }; });
  }

  function signOut() {
    var s = session();
    forget();
    if (s) {
      // Best effort and never waited for: this phone stops getting alerts,
      // and the sign-in server forgets the session.
      pushOff(s.token).then(nil, nil).then(function () {
        return http("POST", BASE + "/auth/v1/logout?scope=local", {}, { Authorization: "Bearer " + s.token });
      }).then(nil, nil);
    }
    return Promise.resolve({ ok: true });
  }

  // Only the sign-in server saying, in its own words, that the session is
  // gone signs a person out. A timeout, a 5xx, a 429 or a page that is not
  // ours (marina wifi) never does: at the pier that would mean no crew until
  // there is signal and a new code.
  var GONE = /^(refresh_token_not_found|refresh_token_already_used|session_not_found|session_expired|user_not_found|user_banned|bad_jwt|no_authorization|invalid_grant)$/;
  function saysSignedOut(r) {
    if (r.status !== 400 && r.status !== 401 && r.status !== 403) return false;
    if (!isObject(r.body)) return false;
    return GONE.test(String(r.body.error_code || "")) || GONE.test(String(r.body.error || ""));
  }

  // Resolves { s } (a session to use), { signedOut: true } or { wait: true }
  // (could not be swapped right now, the session is kept). One at a time: two
  // calls, or two tabs, share one refresh. usedToken is the access token a
  // server just refused, when that is why we are here.
  var refreshing = null;
  function swap(usedToken) {
    if (refreshing) return refreshing;
    refreshing = withLock("rig.session.refresh", function () { return doSwap(usedToken); })
      .then(function (v) { refreshing = null; return v || { wait: true }; }, function () { refreshing = null; return { wait: true }; });
    return refreshing;
  }
  function doSwap(usedToken) {
    var s = session();
    if (!s) return Promise.resolve({ signedOut: true });
    // While we waited our turn another tab may have done the work.
    if (usedToken ? s.token !== usedToken : s.at - Date.now() > 60e3) return Promise.resolve({ s: s });
    if (!s.refresh) return Promise.resolve({ wait: true });
    var sent = s.refresh;
    return http("POST", BASE + "/auth/v1/token?grant_type=refresh_token", { refresh_token: sent }).then(function (r) {
      if (r.ok && r.body && r.body.access_token) return { s: saveSession(r.body, s.userId) };
      if (saysSignedOut(r)) {
        // "Already used" can mean another tab swapped it a moment ago. If the
        // phone now holds a different one, that tab won and we are fine.
        var now = session();
        if (now && now.refresh && now.refresh !== sent) return { s: now };
        forget();
        return { signedOut: true };
      }
      return { wait: true };
    }).catch(function () { return { wait: true }; });
  }
  function ensure() {
    var s = session();
    if (!s) return Promise.resolve({ signedOut: true });
    if (s.at - Date.now() > 60e3) return Promise.resolve({ s: s });
    return swap(null).then(function (r) {
      if (r.s || r.signedOut) return r;
      // Not swapped, but a token with time still on it is still good.
      var cur = session();
      return cur && cur.at > Date.now() ? { s: cur } : { wait: true };
    });
  }
  function refresh() {
    if (!session()) return Promise.resolve({ signedOut: true });
    return swap(null).then(function (r) { return r.s ? { ok: true } : r.signedOut ? { signedOut: true } : { offline: true }; });
  }

  // A request made as the signed-in person. make(token) does the request.
  // Resolves its { status, ok, body }, or { signedOut: true }, or
  // { offline: true }. A token past its time is never sent, and a 401 is
  // taken to the sign-in server before anyone is signed out over it.
  // refused(r), when given, names other answers that mean "that token".
  function authed(make, refused) {
    return ensure().then(function (e) {
      if (e.signedOut) return { signedOut: true };
      if (e.wait) return { offline: true };
      return make(e.s.token).then(function (r) {
        if (r.status !== 401 && !(refused && refused(r))) return r;
        return swap(e.s.token).then(function (x) {
          if (x.signedOut) return { signedOut: true };
          if (!x.s) return { offline: true };
          if (x.s.token === e.s.token) return r;
          return make(x.s.token);
        });
      });
    }).catch(function () { return { offline: true }; });
  }
  // One call to the crew function.
  function fn(action, body) {
    return authed(function (token) {
      return http("POST", FN, Object.assign({ action: action }, body || {}), { Authorization: "Bearer " + token });
    }).then(function (r) { if (r.ok) kickSoon(); return r; });
  }
  // The raw answer, as the page gets it. A 2xx that is not the function's own
  // JSON (a wifi sign-in page) is an error, never a success.
  function plain(r, fallback) {
    if (r.signedOut) return { signedOut: true };
    if (r.offline) return { offline: true };
    if (r.ok && isObject(r.body)) return r.body;
    return { error: words(r, fallback || "That did not go through. Try again."), status: r.status };
  }
  function say(r, fallback) {
    if (!r) return fallback || "That did not go through. Try again.";
    if (r.error) return r.error;
    if (r.offline) return NO_SIGNAL;
    if (r.signedOut) return "You are signed out. Sign in again.";
    return fallback || "That did not go through. Try again.";
  }

  // ---- a number on the account ---------------------------------------------
  function addMyNumber(raw) {
    var phone = normalizePhone(raw);
    if (!phone) return Promise.resolve({ error: BAD_PHONE });
    return authed(function (token) {
      return http("PUT", BASE + "/auth/v1/user", { phone: phone }, { Authorization: "Bearer " + token });
    }).then(function (r) {
      if (r.signedOut) return r;
      if (r.offline) return { offline: true, error: "No signal. Try again when you have some." };
      if (r.ok) return { ok: true };
      // This is the sign-in server too. If it says the session is gone, it is.
      if (saysSignedOut(r)) { forget(); return { signedOut: true }; }
      var code = authCode(r);
      if (code === "phone_exists" || /already (been )?registered/i.test(authMsg(r))) return { error: "That number is already on another account." };
      if (r.status === 429 || /rate_limit/.test(code)) return { error: "A code was just sent. Wait a minute, then try again.", retryAfter: Math.ceil(COOLDOWN / 1000) };
      return { error: "The code could not be sent. Check the number and try again." };
    });
  }
  function confirmMyNumber(raw, code) {
    var phone = normalizePhone(raw), s = session();
    if (!phone) return Promise.resolve({ error: BAD_PHONE });
    if (!s) return Promise.resolve({ signedOut: true });
    return http("POST", BASE + "/auth/v1/verify", { type: "phone_change", phone: phone, token: String(code || "").trim() }).then(function (r) {
      if (!r.ok) return { error: "That code did not work. Check it, or ask for a new one." };
      if (r.body && r.body.access_token) { saveSession(r.body, s.userId); emit({ kind: "session" }); }
      return { ok: true };
    }).catch(function () { return { offline: true, error: "No signal. Try again when you have some." }; });
  }

  // ---- what is saved on the phone -------------------------------------------
  function crewRaw() {
    var c = read(CREW, null), s = session();
    if (!c || !c.me || !s) return null;
    return !s.userId || c.me.id === s.userId ? c : null;
  }
  function me() {
    var c = crewRaw(), s = session();
    if (c) return { id: c.me.id, name: c.me.name };
    return s ? { id: s.userId, name: "You" } : null;
  }
  function memberRef(id) {
    if (!id) return null;
    var c = crewRaw(), m = c && (c.members || []).filter(function (x) { return x.id === id; })[0];
    return { id: id, name: m ? m.name : "Someone" };
  }
  function tripsAll() { var t = read(TRIPS, {}); return isObject(t) ? t : {}; }
  function tripRaw(id) { var e = tripsAll()[id]; return e && e.trip ? e : null; }
  function tripSave(id, d) {
    var all = tripsAll();
    all[id] = { trip: d.trip, comments: d.comments || [], list: d.list || [], catches: d.catches || [], at: Date.now() };
    var ids = Object.keys(all);
    if (ids.length > KEEP_TRIPS) {
      ids.sort(function (a, b) { return (all[a].at || 0) - (all[b].at || 0); }).slice(0, ids.length - KEEP_TRIPS).forEach(function (k) { delete all[k]; });
    }
    write(TRIPS, all);
  }
  function tripDrop(id) { var all = tripsAll(); if (all[id]) { delete all[id]; write(TRIPS, all); } }
  function recount(d) {
    d.trip.counts = Object.assign({}, d.trip.counts, { comments: d.comments.length, list: d.list.length,
      listDone: d.list.filter(function (i) { return i.done; }).length, catches: d.catches.length });
  }
  // Change the trip in the week the phone has saved.
  function weekEdit(id, work) {
    var c = read(CREW, null);
    if (!c || !Array.isArray(c.trips)) return;
    var hit = false;
    c.trips.forEach(function (t, i) { if (t.id === id) { hit = true; c.trips[i] = work(t) || t; } });
    if (hit) write(CREW, c);
  }
  function weekPut(trip) {
    var c = read(CREW, null);
    if (!c || !trip) return;
    c.trips = (c.trips || []).filter(function (t) { return t.id !== trip.id; }).concat([trip])
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    write(CREW, c);
  }
  function weekDrop(id) {
    var c = read(CREW, null);
    if (!c || !Array.isArray(c.trips)) return;
    c.trips = c.trips.filter(function (t) { return t.id !== id; });
    write(CREW, c);
  }
  // Change a saved trip the server has just told us about. With the whole
  // trip saved the counts come from its rows; otherwise bump says how the
  // week row's counts move.
  function tripEdit(id, work, bump) {
    var all = tripsAll(), e = id && all[id];
    if (e && e.trip) {
      work(e); recount(e);
      write(TRIPS, all);
      weekEdit(id, function (t) { t.going = e.trip.going; t.counts = e.trip.counts; return t; });
      return;
    }
    if (id && bump) weekEdit(id, function (t) { bump(t); return t; });
  }
  function findTripOf(part, rowId) {
    var all = tripsAll(), ids = Object.keys(all), i;
    for (i = 0; i < ids.length; i++) {
      if ((all[ids[i]][part] || []).some(function (r) { return r.id === rowId; })) return ids[i];
    }
    return null;
  }

  // ---- the queue: small writes ----------------------------------------------
  // Each entry: { clientId, userId, kind, tripId, at, body, step? }. They go in
  // the order they were made. What one person wrote is only ever sent as them.
  function queueAll() { var q = read(QUEUE, []); return Array.isArray(q) ? q : []; }
  function queueMine() {
    var s = session();
    return s ? queueAll().filter(function (e) { return e.userId === s.userId; }) : [];
  }
  function queueDrop(clientId) { write(QUEUE, queueAll().filter(function (e) { return e.clientId !== clientId; })); }
  function isMine(rec) { var s = session(); return !!s && rec.userId === s.userId; }

  function waitingComment(e) {
    return { id: "q:" + e.clientId, section: e.body.section || null, body: e.body.body, by: me(), at: e.at, mine: true, waiting: true };
  }
  function waitingItem(e) {
    return { id: "q:" + e.clientId, label: e.body.label, assignedTo: memberRef(e.body.assignedTo), done: false, mine: true, waiting: true };
  }
  function applyItem(it, b) {
    if ("done" in b) it.done = !!b.done;
    if ("label" in b) it.label = b.label;
    if ("assignedTo" in b) it.assignedTo = memberRef(b.assignedTo);
  }
  function goingWith(list, answer) {
    var who = me(), out = (list || []).filter(function (g) { return !who || g.id !== who.id; });
    if (who) out.push({ id: who.id, name: who.name, answer: answer, waiting: true });
    return out;
  }
  // A saved trip with everything still waiting laid over it.
  function laid(raw, entries) {
    var d = { trip: clone(raw.trip), comments: clone(raw.comments || []), list: clone(raw.list || []), catches: clone(raw.catches || []) };
    entries.forEach(function (e) {
      if (e.tripId !== d.trip.id) return;
      var b = e.body;
      if (e.kind === "going") d.trip.going = goingWith(d.trip.going, b.answer);
      else if (e.kind === "comment_add") d.comments.push(waitingComment(e));
      else if (e.kind === "comment_delete") d.comments = d.comments.filter(function (c) { return c.id !== b.commentId; });
      else if (e.kind === "list_add") d.list.push(waitingItem(e));
      else if (e.kind === "list_update") d.list.forEach(function (it) { if (it.id === b.itemId) { applyItem(it, b); it.waiting = true; } });
      else if (e.kind === "list_delete") d.list = d.list.filter(function (it) { return it.id !== b.itemId; });
      else if (e.kind === "catch_delete") d.catches = d.catches.filter(function (c) { return c.id !== b.catchId; });
    });
    waitingCatches.forEach(function (rec) { if (rec.tripId === d.trip.id && isMine(rec)) d.catches.push(waitingCatch(rec)); });
    recount(d);
    return d;
  }
  function tripView(id) {
    var raw = tripRaw(id);
    return raw ? laid(raw, queueMine()) : null;
  }
  // The week row for a trip, the same way. Without the whole trip saved only
  // the going answer and the plain counts can be worked out.
  function laidRow(trip, entries) {
    var full = tripRaw(trip.id);
    if (full) { var d = laid({ trip: trip, comments: full.comments, list: full.list, catches: full.catches }, entries); return d.trip; }
    var t = clone(trip), c = Object.assign({ comments: 0, list: 0, listDone: 0, catches: 0 }, t.counts);
    entries.forEach(function (e) {
      if (e.tripId !== t.id) return;
      if (e.kind === "going") t.going = goingWith(t.going, e.body.answer);
      else if (e.kind === "comment_add") c.comments++;
      else if (e.kind === "comment_delete") c.comments = Math.max(0, c.comments - 1);
      else if (e.kind === "list_add") c.list++;
      else if (e.kind === "list_delete") c.list = Math.max(0, c.list - 1);
      else if (e.kind === "catch_delete") c.catches = Math.max(0, c.catches - 1);
    });
    waitingCatches.forEach(function (rec) { if (rec.tripId === t.id && isMine(rec)) c.catches++; });
    t.counts = c;
    return t;
  }
  function cached() {
    var c = crewRaw();
    if (!c) return null;
    var q = queueMine();
    return { me: c.me, crew: c.crew || null, members: c.members || [], sms: c.sms !== false,
      trips: (c.trips || []).map(function (t) { return laidRow(t, q); }) };
  }

  // ---- the queue: catches, with their photos --------------------------------
  // A photo is too big for localStorage, so these live in IndexedDB. The list
  // in memory is what the page reads; the database keeps it across a close.
  // Each: { id (the catch id and its client id), userId, tripId, at, fields,
  // tell, photo: Blob|null, step: 0 nothing sent, 1 photo dealt with, 2 row up }.
  var DB = "rig-crew", BOX = "catches", dbp = null, waitingCatches = [], urls = {};
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (done) {
      var idb = null, req;
      try { idb = root.indexedDB; } catch (e) { idb = null; }
      if (!idb) { done(null); return; }
      try { req = idb.open(DB, 1); } catch (e) { done(null); return; }
      req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains(BOX)) req.result.createObjectStore(BOX, { keyPath: "id" }); };
      req.onsuccess = function () { done(req.result); };
      req.onerror = req.onblocked = function () { done(null); };
    });
    return dbp;
  }
  // Resolves the request's result, or null when there is no database to ask.
  function box(mode, work) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (done) {
        try {
          var tx = d.transaction(BOX, mode), rq = work(tx.objectStore(BOX));
          tx.oncomplete = function () { done(rq ? rq.result : null); };
          tx.onerror = tx.onabort = function () { done(null); };
        } catch (e) { done(null); }
      });
    }).then(function (v) { return v; }, nil);
  }
  function catchKeep(rec) {
    if (waitingCatches.indexOf(rec) === -1) waitingCatches.push(rec);
    // One the database would not take (a full phone) lives on in memory, and
    // must not be forgotten the next time the database is read.
    return box("readwrite", function (s) { return s.put(rec); }).then(function (key) { if (key == null) rec.mem = true; });
  }
  function catchForget(rec) {
    waitingCatches = waitingCatches.filter(function (r) { return r.id !== rec.id; });
    if (urls[rec.id]) { try { root.URL.revokeObjectURL(urls[rec.id]); } catch (e) { /* gone already */ } delete urls[rec.id]; }
    return box("readwrite", function (s) { return s.delete(rec.id); });
  }
  // What the database holds is the truth across tabs: another tab may have
  // sent one of these already.
  function catchLoad() {
    return box("readonly", function (s) { return s.getAll(); }).then(function (rows) {
      if (!Array.isArray(rows)) return;
      var only = waitingCatches.filter(function (m) { return m.mem && !rows.some(function (r) { return r.id === m.id; }); });
      waitingCatches = rows.concat(only).sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    });
  }
  var ready = within(catchLoad(), 4000).then(nil, nil);
  function photoUrlOf(rec) {
    if (!rec.photo) return null;
    if (!urls[rec.id]) { try { urls[rec.id] = root.URL.createObjectURL(rec.photo); } catch (e) { return null; } }
    return urls[rec.id];
  }
  function waitingCatch(rec) {
    var f = rec.fields;
    return { id: rec.id, species: f.species, lengthIn: f.lengthIn, weightLb: f.weightLb, lure: f.lure || "", notes: f.notes || "",
      photoUrl: photoUrlOf(rec), by: me(), at: rec.at, mine: true, waiting: true };
  }

  // A phone photo is 3 to 12 MB. The crew needs to see the fish, not count
  // its scales: 1600 px on the long side, JPEG, a few hundred KB.
  function shrinkPhoto(file, max) {
    var most = max || PHOTO_MAX, doc = root.document;
    return new Promise(function (done, fail) {
      if (!doc || !doc.createElement || !root.URL || !root.URL.createObjectURL) { fail(new Error("no canvas here")); return; }
      var url = root.URL.createObjectURL(file), img = doc.createElement("img");
      function over() { try { root.URL.revokeObjectURL(url); } catch (e) { /* nothing to do */ } }
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) throw new Error("empty picture");
          var k = Math.min(1, most / Math.max(w, h));
          var c = doc.createElement("canvas");
          c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) { over(); if (b) done(b); else fail(new Error("no picture came out")); }, "image/jpeg", 0.85);
        } catch (e) { over(); fail(e); }
      };
      img.onerror = function () { over(); fail(new Error("not a picture")); };
      img.src = url;
    });
  }

  // ---- sending what waits ----------------------------------------------------
  // What a server's answer means for a write that was waiting:
  //   done   it landed (or, for a delete, it was already gone: a 404)
  //   drop   the server refused it. Sending it again would be refused again,
  //          so it leaves the queue and is reported.
  //   stop   try later, and keep everything behind it in line: no signal, our
  //          own fault (5xx), too many at once (429), or a token trouble (401).
  function judge(r, isDelete, anyBody) {
    if (r.signedOut) return { stop: "signedOut" };
    if (r.offline) return { stop: "offline" };
    if (r.ok) return anyBody || isObject(r.body) ? { done: true, answer: isObject(r.body) ? r.body : { ok: true } } : { stop: "later" };
    if (r.status === 404 && isDelete) return { done: true, answer: { ok: true, gone: true } };
    if (r.status === 401 || r.status === 408 || r.status === 429 || r.status >= 500 || r.status < 400) return { stop: "later" };
    return { drop: true, error: words(r, "That could not be sent."), status: r.status };
  }
  // "Try later" has an end. A write the server has answered with a fault for
  // three days is not going to land, and while it sits at the head of the
  // line nothing behind it can go. No answer at all (no signal) never counts.
  function givenUp(j, at) {
    if (j.stop !== "later" || !(Date.now() - Date.parse(at) > GIVE_UP)) return j;
    return { drop: true, error: "That waited three days and the server still would not take it.", status: 0 };
  }
  // The photo store answers a token it will not take with a 400 that talks
  // about the jwt, not with a 401.
  function tokenTrouble(r) { return !r.ok && r.status >= 400 && r.status < 500 && /jwt/i.test(JSON.stringify(r.body || "")); }
  function restDelete(path) {
    return authed(function (token) { return http("DELETE", BASE + path, null, { Authorization: "Bearer " + token }); }, tokenTrouble);
  }
  function catchPath(userId, id) { return "/storage/v1/object/catch-photos/" + userId + "/" + id + ".jpg"; }
  // Take a catch back out of CastAI's own log and photo store. Best effort.
  function catchUndo(userId, id) {
    return restDelete("/rest/v1/catch_logs?id=eq." + encodeURIComponent(id)).then(nil, nil)
      .then(function () { return restDelete(catchPath(userId, id)); }).then(nil, nil);
  }

  function sendSmall(e) {
    var b = e.body, ref = b.itemId || b.commentId || "";
    // A tick or a delete for a line that never made it: nothing to send.
    if (String(ref).indexOf("q:") === 0) return Promise.resolve({ done: true, answer: { ok: true }, quiet: true });
    if (e.kind === "catch_delete") return sendCatchDelete(e);
    return fn(e.kind, b).then(function (r) { return judge(r, /_delete$/.test(e.kind)); });
  }
  // The link first, so the crew stops seeing it. Then the row in the person's
  // own CastAI log and the photo, with their own token.
  function sendCatchDelete(e) {
    var id = e.body.catchId;
    var first = e.step ? Promise.resolve({ done: true }) : fn("catch_delete", { catchId: id }).then(function (r) { return judge(r, true); });
    return first.then(function (j) {
      if (!j.done) return j;
      if (!e.step) {
        e.step = 1;
        write(QUEUE, queueAll().map(function (x) { return x.clientId === e.clientId ? e : x; }));
      }
      return restDelete("/rest/v1/catch_logs?id=eq." + encodeURIComponent(id)).then(function (r) {
        var k = judge(r, true, true);
        if (k.stop) return k;
        return restDelete(catchPath(e.userId, id)).then(nil, nil).then(function () {
          return k.drop ? { drop: true, error: "The catch is off the trip, but it could not be taken out of your CastAI log.", status: k.status }
            : { done: true, answer: { ok: true } };
        });
      });
    });
  }
  // The server's row takes the place of the waiting one.
  function landed(e, a) {
    var b = e.body, id = e.tripId;
    function without(part, rowId) { return function (d) { d[part] = d[part].filter(function (r) { return r.id !== rowId; }); }; }
    function put(part, row) {
      return function (d) {
        var hit = false;
        d[part] = d[part].map(function (r) { if (r.id === row.id) { hit = true; return row; } return r; });
        if (!hit) d[part].push(row);
      };
    }
    function count(key, by) { return function (t) { t.counts = Object.assign({}, t.counts); t.counts[key] = Math.max(0, (t.counts[key] || 0) + by); }; }
    if (e.kind === "going" && Array.isArray(a.going)) {
      tripEdit(id, function (d) { d.trip.going = a.going; }, function (t) { t.going = a.going; });
    } else if (e.kind === "comment_add" && a.comment) tripEdit(id, put("comments", a.comment), count("comments", 1));
    else if (e.kind === "comment_delete") tripEdit(id, without("comments", b.commentId), count("comments", -1));
    else if (e.kind === "list_add" && a.item) {
      tripEdit(id, put("list", a.item), count("list", 1));
      // Anything waiting behind it that pointed at the waiting line now points at the real one.
      var from = "q:" + e.clientId;
      write(QUEUE, queueAll().map(function (x) { if (x.body && x.body.itemId === from) x.body.itemId = a.item.id; return x; }));
    } else if (e.kind === "list_update" && a.item) tripEdit(id, put("list", a.item));
    else if (e.kind === "list_delete") tripEdit(id, without("list", b.itemId), count("list", -1));
    else if (e.kind === "catch_delete") tripEdit(id, without("catches", b.catchId), count("catches", -1));
    if (id) ownTouch(id);
  }

  function sendCatch(rec) {
    var path = catchPath(rec.userId, rec.id), f = rec.fields, start = Promise.resolve({ done: true });
    function saved(step) { rec.step = step; return box("readwrite", function (s) { return s.put(rec); }).then(function () { return { done: true }; }); }
    if (!rec.step && rec.photo) {
      start = authed(function (token) {
        return http("PUT", BASE + path, rec.photo, { Authorization: "Bearer " + token, "Content-Type": "image/jpeg", "x-upsert": "true" }, limit() * 5);
      }, tokenTrouble).then(function (r) {
        // Still a token trouble after a fresh one: wait, do not lose the photo over it.
        if (!r.signedOut && !r.offline && tokenTrouble(r)) return { stop: "later" };
        var j = judge(r, false, true);
        if (j.stop) return j;
        // A photo the store will not take must not cost the fish: the catch
        // goes on without it, and says so.
        rec.photoUp = !!j.done; rec.photoFailed = !j.done;
        return saved(1);
      });
    } else if (!rec.step) start = saved(1);
    return start.then(function (j) {
      if (!j.done || rec.step >= 2) return j;
      // CastAI's own columns and units: pounds and inches.
      var row = { id: rec.id, user_id: rec.userId, species: f.species, catch_date: rec.at, spot_name: f.spotName || "", state_code: "WA" };
      if (f.weightLb != null) row.weight = f.weightLb;
      if (f.lengthIn != null) row.length = f.lengthIn;
      if (rec.photoUp) row.photo_url = BASE + "/storage/v1/object/public/catch-photos/" + rec.userId + "/" + rec.id + ".jpg";
      if (f.lat != null && f.lon != null) { row.latitude = f.lat; row.longitude = f.lon; }
      if (f.notes) row.notes = f.notes;
      if (f.lure) row.lure = f.lure;
      if (f.technique) row.technique = f.technique;
      return authed(function (token) {
        return http("POST", BASE + "/rest/v1/catch_logs", row, { Authorization: "Bearer " + token, Prefer: "resolution=merge-duplicates" });
      }).then(function (r) {
        var k = judge(r, false, true);
        return k.done ? saved(2) : k;
      });
    }).then(function (j) {
      if (!j.done) return j;
      var body = { tripId: rec.tripId, catchId: rec.id };
      if (rec.tell) body.tell = rec.tell;
      return fn("catch_link", body).then(function (r) {
        // Linked already by an earlier try whose answer never came back.
        if (r.status === 409) return { done: true, answer: { ok: true } };
        return judge(r, false);
      });
    });
  }

  var flushing = null, awaited = {}, results = {};
  function failedAll() { var f = read(FAILED, []); return Array.isArray(f) ? f : []; }
  function failed() { var s = session(); return s ? failedAll().filter(function (d) { return d.userId === s.userId; }) : []; }
  function clearFailed() { var s = session(); write(FAILED, s ? failedAll().filter(function (d) { return d.userId !== s.userId; }) : []); }
  function report(out, d) {
    var line = { clientId: d.clientId, kind: d.kind, tripId: d.tripId, error: d.error, status: d.status };
    out.dropped.push(line);
    // Whoever made the write and is still waiting on it hears it straight
    // back. Otherwise it is kept for the screen to show, and listeners hear.
    if (awaited[d.clientId]) results[d.clientId] = { error: d.error, status: d.status };
    else { out.late.push(line); write(FAILED, failedAll().concat([d]).slice(-KEEP_FAILED)); }
  }
  function flush() {
    if (flushing) return flushing;
    if (!session()) return Promise.resolve({ ok: false, signedOut: true, stopped: "signedOut", sent: 0, left: 0, dropped: [] });
    flushing = ready.then(function () { return withLock("rig.crewq.flush", runFlush); }).then(function (r) {
      flushing = null;
      return r || { ok: false, sent: 0, left: 0, dropped: [], stopped: "later" };
    }, function () { flushing = null; return { ok: false, sent: 0, left: 0, dropped: [], stopped: "later" }; });
    return flushing;
  }
  function runFlush() {
    var out = { ok: true, sent: 0, left: 0, dropped: [], late: [] }, tried = {};
    function finish(why) {
      if (why) { out.stopped = why; if (why === "offline") out.offline = true; if (why === "signedOut") out.signedOut = true; }
      out.left = queueMine().length + waitingCatches.filter(isMine).length;
      out.ok = out.left === 0 && why !== "signedOut";
      var late = out.late;
      delete out.late;
      if (out.sent || out.dropped.length) emit({ kind: "queue", dropped: late });
      return out;
    }
    function small(e) {
      return sendSmall(e).then(function (j) {
        j = givenUp(j, e.at);
        if (j.stop) return finish(j.stop);
        queueDrop(e.clientId);
        if (j.done) {
          if (!j.quiet) { out.sent++; landed(e, j.answer); }
          if (awaited[e.clientId]) results[e.clientId] = j.answer;
        } else {
          // Whatever was waiting on a line the server refused goes with it.
          if (e.kind === "list_add") write(QUEUE, queueAll().filter(function (x) { return !(x.body && x.body.itemId === "q:" + e.clientId); }));
          report(out, { clientId: e.clientId, kind: e.kind, tripId: e.tripId, error: j.error, status: j.status, at: nowIso(), userId: e.userId });
        }
        if (e.tripId) emit({ kind: "trip", tripId: e.tripId });
        return next();
      });
    }
    function big(rec) {
      return sendCatch(rec).then(function (j) {
        j = givenUp(j, rec.queuedAt || rec.at);
        if (j.stop) return finish(j.stop);
        return catchForget(rec).then(function () {
          if (j.done) {
            out.sent++;
            var row = j.answer && j.answer.catch;
            if (row) tripEdit(rec.tripId, function (d) { if (!d.catches.some(function (c) { return c.id === row.id; })) d.catches.push(row); },
              function (t) { t.counts = Object.assign({}, t.counts, { catches: ((t.counts && t.counts.catches) || 0) + 1 }); });
            ownTouch(rec.tripId);
            if (awaited[rec.id]) results[rec.id] = Object.assign({ ok: true }, j.answer, rec.photoFailed ? { photoFailed: true } : {});
            else if (rec.photoFailed) write(FAILED, failedAll().concat([{ clientId: rec.id, kind: "catch_photo", tripId: rec.tripId,
              error: "The catch was saved. Its photo was not.", at: nowIso(), userId: rec.userId }]).slice(-KEEP_FAILED));
            return null;
          }
          report(out, { clientId: rec.id, kind: "catch", tripId: rec.tripId, error: j.error, status: j.status, at: nowIso(), userId: rec.userId });
          return catchUndo(rec.userId, rec.id);
        }).then(function () {
          emit({ kind: "trip", tripId: rec.tripId });
          return next();
        });
      });
    }
    function next() {
      var s = session();
      if (!s) return finish("signedOut");
      var q = queueAll(), e = null, i;
      for (i = 0; i < q.length; i++) if (q[i].userId === s.userId) { e = q[i]; break; }
      var rec = e ? null : waitingCatches.filter(isMine)[0];
      var id = e ? e.clientId : rec ? rec.id : null;
      if (!id) return finish(null);
      // The same write coming up twice in one pass means it could not be
      // taken off the queue. Stop rather than send it in a loop.
      if (tried[id]) return finish("later");
      tried[id] = true;
      return e ? small(e) : big(rec);
    }
    return catchLoad().then(next).then(function (v) { return v; }, function () { return finish("later"); });
  }
  function hasWaiting() { return queueMine().length > 0 || waitingCatches.some(isMine); }
  function kick() { if (!flushing && session() && hasWaiting()) flush(); }
  function kickSoon() { if (!flushing && hasWaiting()) root.setTimeout(kick, 0); }
  function stillWaiting(clientId) {
    return queueAll().some(function (e) { return e.clientId === clientId; }) || waitingCatches.some(function (r) { return r.id === clientId; });
  }
  // Send, and say how this one write came out: the server's answer, an
  // error, signed out, or null while it still waits.
  function settle(clientId, tries) {
    awaited[clientId] = true;
    return flush().then(function (f) {
      if (results[clientId]) { var r = results[clientId]; delete results[clientId]; delete awaited[clientId]; return r; }
      // A pass that was already finishing when this write was added never saw it.
      if (!f.stopped && tries > 1 && stillWaiting(clientId)) return settle(clientId, tries - 1);
      delete awaited[clientId];
      return f.signedOut ? { signedOut: true } : null;
    });
  }
  function enqueue(entry, show, before) {
    var s = session();
    if (!s) return Promise.resolve({ signedOut: true });
    entry.userId = s.userId; entry.at = nowIso();
    var q = queueAll();
    if (before) q = before(q);
    q.push(entry);
    write(QUEUE, q);
    emit({ kind: "queue", tripId: entry.tripId });
    return settle(entry.clientId, 2).then(function (r) {
      if (r) return r;
      return Object.assign({ ok: true, queued: true, clientId: entry.clientId }, show ? show() : {});
    });
  }
  function tellOf(opts) { return opts && Array.isArray(opts.tell) ? opts.tell : null; }

  // What the server would refuse anyway is caught here, so a write that can
  // never land is not left waiting for a signal.
  function going(tripId, answer) {
    var s = session();
    if (["going", "maybe", "out"].indexOf(answer) === -1) return Promise.resolve({ error: "Pick going, maybe or out." });
    return enqueue({ clientId: uuid(), kind: "going", tripId: tripId, body: { tripId: tripId, answer: answer } }, function () {
      var v = tripView(tripId);
      return { going: v ? v.trip.going : goingWith([], answer) };
    }, function (q) {
      // Changing my mind while it waits: only the last answer goes.
      return q.filter(function (e) { return !(e.kind === "going" && e.tripId === tripId && s && e.userId === s.userId); });
    });
  }
  function addComment(tripId, section, body, opts) {
    var note = String(body == null ? "" : body).trim();
    if (!note) return Promise.resolve({ error: "Write the note first." });
    if (note.length > 1000) return Promise.resolve({ error: "That note is too long. Keep it under 1000 characters." });
    var e = { clientId: uuid(), kind: "comment_add", tripId: tripId, body: { tripId: tripId, body: note } };
    if (section) e.body.section = section;
    e.body.clientId = e.clientId;
    if (tellOf(opts)) e.body.tell = tellOf(opts);
    return enqueue(e, function () { return { comment: waitingComment(e) }; });
  }
  function addItem(tripId, label, assignedTo, opts) {
    var name = String(label == null ? "" : label).trim();
    if (!name) return Promise.resolve({ error: "Say what it is first." });
    if (name.length > 120) return Promise.resolve({ error: "That is too long for one line. Keep it under 120 characters." });
    var e = { clientId: uuid(), kind: "list_add", tripId: tripId, body: { tripId: tripId, label: name } };
    if (assignedTo) e.body.assignedTo = assignedTo;
    e.body.clientId = e.clientId;
    if (tellOf(opts)) e.body.tell = tellOf(opts);
    return enqueue(e, function () { return { item: waitingItem(e) }; });
  }
  // Which trip a list line belongs to: a saved trip, or a line still waiting.
  function tripOfItem(itemId) {
    if (String(itemId).indexOf("q:") === 0) {
      var add = queueAll().filter(function (e) { return "q:" + e.clientId === itemId; })[0];
      return add ? add.tripId : null;
    }
    return findTripOf("list", itemId);
  }
  function updateItem(itemId, fields) {
    var f = fields || {}, tripId = tripOfItem(itemId);
    var e = { clientId: uuid(), kind: "list_update", tripId: tripId, body: { itemId: itemId } };
    ["done", "assignedTo", "label"].forEach(function (k) { if (k in f) e.body[k] = f[k]; });
    if (tellOf(f)) e.body.tell = tellOf(f);
    return enqueue(e, function () {
      var v = tripId && tripView(tripId), it = v && v.list.filter(function (x) { return x.id === itemId; })[0];
      return { item: it || null };
    });
  }
  // Taking back a row that never left the phone just takes it off the queue.
  function unqueue(ref) {
    var cid = ref.slice(2), q = queueAll(), hit = q.filter(function (e) { return e.clientId === cid; })[0];
    write(QUEUE, q.filter(function (e) { return e.clientId !== cid && !(e.body && (e.body.itemId === ref || e.body.commentId === ref)); }));
    emit({ kind: "queue", tripId: hit ? hit.tripId : null });
    return Promise.resolve({ ok: true });
  }
  function deleteItem(itemId) {
    if (String(itemId).indexOf("q:") === 0) return unqueue(itemId);
    return enqueue({ clientId: uuid(), kind: "list_delete", tripId: findTripOf("list", itemId), body: { itemId: itemId } }, null);
  }
  function deleteComment(commentId) {
    if (String(commentId).indexOf("q:") === 0) return unqueue(commentId);
    return enqueue({ clientId: uuid(), kind: "comment_delete", tripId: findTripOf("comments", commentId), body: { commentId: commentId } }, null);
  }

  function num(v) { var n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v); return isFinite(n) ? n : null; }
  function text(v, max) { var t = String(v == null ? "" : v).trim(); return t.length > max ? t.slice(0, max) : t; }
  function addCatch(tripId, fields, opts) {
    var s = session(), f = fields || {};
    if (!s) return Promise.resolve({ signedOut: true });
    var species = text(f.species, 40);
    if (!species) return Promise.resolve({ error: "Which fish was it?" });
    var photo = f.photo && isBlob(f.photo) ? f.photo : null;
    var shrunk = photo ? shrinkPhoto(photo, PHOTO_MAX).then(function (b) { return { blob: b }; }, function () { return { error: "That photo could not be read. Try another one." }; })
      : Promise.resolve({ blob: null });
    return shrunk.then(function (ph) {
      if (ph.error) return { error: ph.error };
      var saved = tripRaw(tripId), when = f.at ? new Date(f.at) : new Date();
      var rec = { id: uuid(), userId: s.userId, tripId: tripId, at: isNaN(when.getTime()) ? nowIso() : when.toISOString(), queuedAt: nowIso(), step: 0,
        photo: ph.blob, tell: tellOf(opts),
        fields: { species: species, lengthIn: num(f.lengthIn), weightLb: num(f.weightLb), lure: text(f.lure, 80), notes: text(f.notes, 500),
          technique: text(f.technique, 80), spotName: text(f.spotName, 120) || (saved ? text(saved.trip.title, 120) : ""), lat: num(f.lat), lon: num(f.lon) } };
      return ready.then(function () { return catchKeep(rec); }).then(function () {
        emit({ kind: "queue", tripId: tripId });
        return settle(rec.id, 2);
      }).then(function (r) {
        return r || { ok: true, queued: true, clientId: rec.id, catch: waitingCatch(rec) };
      });
    });
  }
  function deleteCatch(catchId) {
    return ready.then(function () {
      var w = waitingCatches.filter(function (r) { return r.id === catchId; })[0];
      // One that never left the phone is simply forgotten.
      if (w && !w.step) return catchForget(w).then(function () { emit({ kind: "queue", tripId: w.tripId }); return { ok: true }; });
      var tripId = w ? w.tripId : findTripOf("catches", catchId);
      var go = w ? catchForget(w) : Promise.resolve();
      return go.then(function () {
        return enqueue({ clientId: uuid(), kind: "catch_delete", tripId: tripId, body: { catchId: catchId } }, null);
      });
    });
  }
  function pending() {
    return ready.then(function () {
      var items = queueMine().map(function (e) { return { clientId: e.clientId, kind: e.kind, tripId: e.tripId, at: e.at }; })
        .concat(waitingCatches.filter(isMine).map(function (r) { return { clientId: r.id, kind: "catch", tripId: r.tripId, at: r.at }; }));
      return { count: items.length, items: items };
    });
  }

  // ---- new dots -------------------------------------------------------------
  // rig.crewseen.v1 is { tripId: the updatedAt this phone last saw }. A key
  // "~tripId" marks a trip this person just changed themselves: the next
  // fresh answer for it counts as seen, so nobody gets a dot for their own note.
  function later(a, b) { return !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b; }
  function isNew(trip) {
    if (!trip || !trip.id || !trip.updatedAt) return false;
    var seen = read(SEEN, {})[trip.id];
    return !seen || Date.parse(trip.updatedAt) > Date.parse(seen);
  }
  function knownTrip(id) {
    var c = read(CREW, null), t = c && (c.trips || []).filter(function (x) { return x.id === id; })[0], full = tripRaw(id);
    if (t && full) return Date.parse(full.trip.updatedAt) > Date.parse(t.updatedAt) ? full.trip : t;
    return t || (full && full.trip) || null;
  }
  function markSeen(tripId, at) {
    if (!tripId) return;
    var m = read(SEEN, {}), t = knownTrip(tripId);
    m[tripId] = later(m[tripId], at || (t && t.updatedAt) || nowIso());
    delete m["~" + tripId];
    write(SEEN, m);
  }
  function ownTouch(tripId) { var m = read(SEEN, {}); m["~" + tripId] = 1; write(SEEN, m); }
  function settleSeen(trips, all) {
    var m = read(SEEN, {}), changed = false, live = {};
    trips.forEach(function (t) {
      live[t.id] = true;
      if (m["~" + t.id]) { m[t.id] = later(m[t.id], t.updatedAt); delete m["~" + t.id]; changed = true; }
    });
    // With the whole week in hand, trips that are gone need no memory.
    if (all) Object.keys(m).forEach(function (k) { if (!live[k.replace(/^~/, "")]) { delete m[k]; changed = true; } });
    if (changed) write(SEEN, m);
  }

  // ---- reads ----------------------------------------------------------------
  var inflight = {};
  function swr(opts, saved, fresh) {
    var o = opts || {};
    if (saved && !o.fresh) {
      fresh().then(function (r) { if (typeof o.onFresh === "function") { try { o.onFresh(r); } catch (e) { /* the screen's own fault */ } } });
      return Promise.resolve(Object.assign({}, saved, { stale: true }));
    }
    return fresh();
  }
  function fallback(saved, extra) { return saved ? Object.assign({}, saved, { stale: true }, extra) : extra; }

  function freshHello() {
    if (inflight.hello) return inflight.hello;
    inflight.hello = http("POST", FN, { action: "hello" }).then(function (r) {
      if (r.ok && isObject(r.body) && "sms" in r.body) {
        var h = { ok: true, sms: !!r.body.sms, vapidKey: r.body.vapidKey || null };
        write(HELLO, h);
        return h;
      }
      return fallback(read(HELLO, null), { error: words(r, "The crew could not be reached. Try again in a minute."), status: r.status });
    }).catch(function () { return fallback(read(HELLO, null), { offline: true }); })
      .then(function (v) { inflight.hello = null; return v; });
    return inflight.hello;
  }
  function hello(opts) { return swr(opts, read(HELLO, null), freshHello); }

  function freshState() {
    if (inflight.state) return inflight.state;
    inflight.state = fn("state").then(function (r) {
      inflight.state = null;
      if (r.signedOut) return r;
      if (r.offline) return fallback(cached(), { offline: true });
      if (r.ok && isObject(r.body) && r.body.me) {
        var b = r.body, s = session();
        write(CREW, { me: b.me, crew: b.crew || null, members: b.members || [], trips: b.trips || [], sms: b.sms !== false, at: Date.now() });
        if (s && !s.userId && b.me.id) { s.userId = b.me.id; write(SES, s); }
        // Trips that have left the week are not kept.
        var all = tripsAll(), live = {}, cut = false;
        (b.trips || []).forEach(function (t) { live[t.id] = true; });
        Object.keys(all).forEach(function (k) { if (!live[k]) { delete all[k]; cut = true; } });
        if (cut) write(TRIPS, all);
        settleSeen(b.trips || [], true);
        emit({ kind: "state" });
        return cached();
      }
      return fallback(cached(), { error: words(r, "The crew could not be loaded. Try again in a minute."), status: r.status });
    });
    return inflight.state;
  }
  function state(opts) {
    if (!session()) return Promise.resolve({ signedOut: true });
    return swr(opts, cached(), freshState);
  }
  function freshTrip(id) {
    var key = "trip:" + id;
    if (inflight[key]) return inflight[key];
    inflight[key] = fn("trip", { tripId: id }).then(function (r) {
      delete inflight[key];
      if (r.signedOut) return r;
      if (r.offline) return fallback(tripView(id), { offline: true });
      if (r.ok && isObject(r.body) && r.body.trip) {
        tripSave(id, r.body);
        weekEdit(id, function () { return r.body.trip; });
        settleSeen([r.body.trip], false);
        emit({ kind: "trip", tripId: id });
        return tripView(id);
      }
      if (r.status === 404) {
        tripDrop(id); weekDrop(id);
        emit({ kind: "trip", tripId: id });
        return { error: words(r, "That trip is not here any more."), status: 404, gone: true };
      }
      return fallback(tripView(id), { error: words(r, "The trip could not be loaded. Try again in a minute."), status: r.status });
    });
    return inflight[key];
  }
  function trip(id, opts) {
    if (!session()) return Promise.resolve({ signedOut: true });
    return ready.then(function () { return swr(opts, tripView(id), function () { return freshTrip(id); }); });
  }

  // ---- writes that need a signal --------------------------------------------
  function createTrip(fields) {
    var body = Object.assign({}, fields || {});
    if (!body.clientId) body.clientId = uuid();
    return fn("trip_create", body).then(function (r) {
      var a = plain(r, "The trip could not be made. Try again.");
      if (a.ok && a.trip) { weekPut(a.trip); markSeen(a.trip.id, a.trip.updatedAt); emit({ kind: "state" }); }
      return a;
    });
  }
  function updateTrip(id, fields) {
    return fn("trip_update", Object.assign({}, fields || {}, { tripId: id })).then(function (r) {
      var a = plain(r, "The trip could not be changed. Try again.");
      if (a.ok && a.trip) {
        weekPut(a.trip);
        var all = tripsAll();
        if (all[id]) { all[id].trip = a.trip; write(TRIPS, all); }
        ownTouch(id);
        emit({ kind: "trip", tripId: id });
      }
      return a;
    });
  }
  function deleteTrip(id, opts) {
    var body = { tripId: id };
    if (tellOf(opts)) body.tell = tellOf(opts);
    return fn("trip_delete", body).then(function (r) {
      // Deleted already, by an earlier tap whose answer never came back.
      var a = r.status === 404 ? { ok: true, gone: true } : plain(r, "The trip could not be deleted. Try again.");
      if (a.ok) { tripDrop(id); weekDrop(id); emit({ kind: "state" }); }
      return a;
    });
  }
  function invite(name, phone) {
    var body = { name: text(name, 200) }, ph = text(phone, 40);
    if (ph) body.phone = ph;
    return fn("invite", body).then(function (r) { return plain(r, "That did not go through. Nobody was added."); });
  }
  function link(userId) {
    return fn("link", { userId: userId }).then(function (r) { return plain(r, "A new link could not be made. Try again."); });
  }
  function removeMember(userId) {
    return fn("member_remove", { userId: userId }).then(function (r) {
      var a = plain(r, "That did not go through. Nobody was removed.");
      if (a.ok) {
        var c = read(CREW, null);
        if (c && Array.isArray(c.members)) { c.members = c.members.filter(function (m) { return m.id !== userId; }); write(CREW, c); }
      }
      return a;
    });
  }
  function prefsGet() { return fn("prefs_get").then(function (r) { return plain(r, "Your alert settings could not be loaded. Try again."); }); }
  function prefsSet(fields) { return fn("prefs_set", fields || {}).then(function (r) { return plain(r, "That setting was not saved. Try again."); }); }
  function testAlert() { return fn("test_alert").then(function (r) { return plain(r, "The test could not be sent. Try again."); }); }

  // ---- alerts on this phone -------------------------------------------------
  function isApple() {
    var nav = root.navigator || {}, ua = String(nav.userAgent || "");
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (nav.maxTouchPoints || 0) > 1);
  }
  function alerts() {
    var nav = root.navigator || {}, installed = false;
    try { installed = !!(nav.standalone || (root.matchMedia && root.matchMedia("(display-mode: standalone)").matches)); } catch (e) { installed = false; }
    var supported = !!(nav.serviceWorker && root.PushManager && root.Notification);
    var permission = "unsupported";
    if (supported) { try { permission = root.Notification.permission; } catch (e) { permission = "default"; } }
    // Apple only gives a web app alerts once it is on the Home Screen.
    return { supported: supported, ios: isApple(), installed: installed, permission: permission, needsInstall: isApple() && !installed && !supported };
  }
  // The server's public key, as the bytes the phone wants.
  function keyBytes(b64) {
    var s = String(b64).replace(/-/g, "+").replace(/_/g, "/"), A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out = [], bits = 0, n = 0, i, v;
    for (i = 0; i < s.length; i++) {
      v = A.indexOf(s.charAt(i));
      if (v < 0) continue;
      bits = ((bits << 6) | v) & 0xffff; n += 6;
      if (n >= 8) { n -= 8; out.push((bits >> n) & 255); }
    }
    return new Uint8Array(out);
  }
  function registration() { return within(Promise.resolve(root.navigator.serviceWorker.ready), limit()); }
  function pushSubscribe() {
    var a = alerts(), asked;
    if (a.needsInstall) return Promise.resolve({ error: "Add Rig Card to your Home Screen first. Apple only allows alerts there.", needsInstall: true });
    if (!a.supported) return Promise.resolve({ error: "This browser cannot show alerts.", unsupported: true });
    if (!session()) return Promise.resolve({ signedOut: true });
    // Asked right here, inside the tap, or the phone will not show the question.
    try { asked = Promise.resolve(root.Notification.requestPermission()); } catch (e) { asked = Promise.resolve("denied"); }
    return asked.then(function (perm) {
      if (perm !== "granted") return { error: "Alerts are turned off for Rig Card on this phone. Turn them on in the phone's settings, then try again.", denied: true };
      return hello({ fresh: true }).then(function (h) {
        if (!h || !h.vapidKey) return h && h.offline ? { offline: true } : { error: "Alerts are not ready yet. Try again later." };
        return registration().then(function (reg) {
          return Promise.resolve(reg.pushManager.getSubscription()).then(function (old) {
            return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(h.vapidKey) });
          });
        }).then(function (sub) {
          var j = sub.toJSON ? sub.toJSON() : {}, k = j.keys || {}, endpoint = j.endpoint || sub.endpoint;
          return fn("push_subscribe", { endpoint: endpoint, p256dh: k.p256dh, auth: k.auth, ua: String(root.navigator.userAgent || "").slice(0, 200) }).then(function (r) {
            var p = plain(r, "This phone could not be set up for alerts. Try again.");
            return p.ok ? { ok: true, endpoint: endpoint } : p;
          });
        });
      });
    }).catch(function () { return { error: "This phone could not be set up for alerts. Try again." }; });
  }
  // Tell the function this phone is done, with a given token. Used by sign out.
  function pushOff(token) {
    var nav = root.navigator || {};
    if (!nav.serviceWorker || !root.PushManager) return Promise.resolve(null);
    // The worker as it is right now. Waiting for one to become ready would
    // hold up a sign out on a phone that never had alerts.
    var reg = typeof nav.serviceWorker.getRegistration === "function"
      ? within(Promise.resolve(nav.serviceWorker.getRegistration()), limit()) : registration();
    return reg.then(function (r) { return r && r.pushManager ? r.pushManager.getSubscription() : null; }).then(function (sub) {
      if (!sub) return null;
      var told = token
        ? http("POST", FN, { action: "push_unsubscribe", endpoint: sub.endpoint }, { Authorization: "Bearer " + token })
        : fn("push_unsubscribe", { endpoint: sub.endpoint });
      // Whatever the function says, the phone itself stops. An address that
      // no longer answers is cleared on the server's side the next time it is tried.
      return told.then(nil, nil).then(function () { return sub.unsubscribe(); }).then(function () { return sub; });
    });
  }
  function pushUnsubscribe() {
    return pushOff(null).then(function (sub) { return sub ? { ok: true } : { ok: true, none: true }; },
      function () { return { error: "Alerts could not be turned off on this phone. Try again." }; });
  }

  // The people a "Tell" row can offer: everyone else on the crew who has
  // alerts switched on. Names only.
  function canTell() {
    var c = cached();
    if (!c) return [];
    return c.members.filter(function (m) { return m.alerts && m.id !== c.me.id; }).map(function (m) { return { id: m.id, name: m.name }; });
  }

  // ---- handing off to Messages ----------------------------------------------
  // iPhone and iPad want sms:&body=, everything else sms:?body=.
  function textLink(body) {
    return "sms:" + (isApple() ? "&" : "?") + "body=" + encodeURIComponent(String(body == null ? "" : body));
  }

  // ---- when the queue goes on its own ---------------------------------------
  // After any call that works (see fn), when the signal comes back, and when
  // the app comes back to the front.
  if (typeof root.addEventListener === "function") {
    root.addEventListener("online", kick);
    root.addEventListener("pageshow", kick);
  }
  if (root.document && typeof root.document.addEventListener === "function") {
    root.document.addEventListener("visibilitychange", function () { if (root.document.visibilityState !== "hidden") kick(); });
  }
  ready.then(kick);

  RIG.crew = {
    session: session, sendCode: sendCode, verify: verify, join: join, joinToken: joinToken, signOut: signOut, refresh: refresh,
    addMyNumber: addMyNumber, confirmMyNumber: confirmMyNumber, normalizePhone: normalizePhone, cooldownLeft: cooldownLeft,
    hello: hello, state: state, trip: trip, cached: cached, cachedTrip: tripView,
    createTrip: createTrip, updateTrip: updateTrip, deleteTrip: deleteTrip, invite: invite, link: link, removeMember: removeMember,
    prefsGet: prefsGet, prefsSet: prefsSet, pushSubscribe: pushSubscribe, pushUnsubscribe: pushUnsubscribe, testAlert: testAlert, alerts: alerts,
    going: going, addComment: addComment, deleteComment: deleteComment, addItem: addItem, updateItem: updateItem, deleteItem: deleteItem,
    "catch": addCatch, addCatch: addCatch, deleteCatch: deleteCatch,
    pending: pending, flush: flush, failed: failed, clearFailed: clearFailed, onChange: onChange,
    isNew: isNew, markSeen: markSeen, textLink: textLink, say: say, canTell: canTell, shrinkPhoto: shrinkPhoto
  };
})(typeof window !== "undefined" ? window : globalThis);
