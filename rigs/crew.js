// Signing in, and the crew.
//
// The page talks to Supabase auth's REST endpoints directly: no npm, no
// bundler, so Rig Card stays a static file that opens at the pier. Accounts
// are the same ones CastAI uses, and sign-ups are off on the project, so a
// number only works once Coach has added it.
//
// Signed out, none of this runs and the app is exactly what it was.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});
  var BASE = "https://geigvuysptjvvqanumld.supabase.co";
  var KEY = "sb_publishable_m6EWBWxKPeOaVpPQOVDjyg_sTRWlnbe"; // publishable, safe in a page
  var SES = "rig.session.v1", SENT = "rig.codesent.v1", CREW = "rig.crew.v1";
  var COOLDOWN = 60e3;

  function read(k, d) { try { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function drop(k) { try { root.localStorage.removeItem(k); } catch (e) { /* nothing to do */ } }

  function session() { var s = read(SES, null); return s && s.token ? s : null; }
  function signOut() { drop(SES); drop(CREW); }

  function post(path, body, headers) {
    return root.fetch(BASE + path, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", apikey: KEY }, headers || {}),
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
    });
  }

  // Supabase rate limits codes per number. Say when, rather than failing quietly.
  function cooldownLeft(phone) {
    var sent = read(SENT, {})[phone] || 0, left = COOLDOWN - (Date.now() - sent);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  function sendCode(phone) {
    var left = cooldownLeft(phone);
    if (left) return Promise.resolve({ error: "A code was just sent. Try again in " + left + " seconds.", retryAfter: left });
    return post("/auth/v1/otp", { phone: phone, create_user: false }).then(function (r) {
      if (r.status >= 400) {
        if (r.body && r.body.error_code === "otp_disabled") {
          return { error: "That number is not on the crew yet. Ask Coach to add you." };
        }
        return { error: "That code could not be sent. Check the number and try again." };
      }
      var map = read(SENT, {}); map[phone] = Date.now(); write(SENT, map);
      return { ok: true };
    }).catch(function () {
      return { error: "The code could not be sent. You may be out of signal." };
    });
  }

  function verify(phone, code) {
    return post("/auth/v1/verify", { type: "sms", phone: phone, token: String(code || "").trim() }).then(function (r) {
      if (r.status >= 400 || !r.body || !r.body.access_token) {
        return { error: "That code did not work. Check it, or ask for a new one." };
      }
      write(SES, { token: r.body.access_token, refresh: r.body.refresh_token,
        at: Date.now() + ((r.body.expires_in || 3600) * 1000), userId: (r.body.user || {}).id || null });
      return { ok: true };
    }).catch(function () {
      return { error: "That did not go through. You may be out of signal." };
    });
  }

  // Swap the refresh token for a fresh session. A failure means signed out.
  function refresh() {
    var s = session();
    if (!s || !s.refresh) return Promise.resolve(null);
    return post("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh }).then(function (r) {
      if (r.status >= 400 || !r.body.access_token) { signOut(); return null; }
      var next = { token: r.body.access_token, refresh: r.body.refresh_token || s.refresh,
        at: Date.now() + ((r.body.expires_in || 3600) * 1000), userId: s.userId };
      write(SES, next);
      return next;
    }).catch(function () { return session(); });
  }

  function call(action, extra) {
    var s = session();
    if (!s) return Promise.resolve({ signedOut: true });
    var go = Date.now() > s.at - 60e3 ? refresh() : Promise.resolve(s);
    return go.then(function (cur) {
      if (!cur) return { signedOut: true };
      return root.fetch(BASE + "/functions/v1/castai-crew", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + cur.token },
        body: JSON.stringify(Object.assign({ action: action }, extra || {}))
      }).then(function (r) {
        if (r.status === 401) { signOut(); return { signedOut: true }; }
        return r.json().catch(function () { return {}; });
      });
    }).catch(function () {
      // No signal: the last crew we saw is better than an empty screen.
      var c = read(CREW, null);
      return c ? Object.assign({ stale: true }, c) : { offline: true };
    });
  }

  function state() {
    return call("state").then(function (r) {
      if (r && r.crew) write(CREW, { me: r.me, crew: r.crew, members: r.members });
      return r;
    });
  }
  function invite(name, phone) { return call("invite", { name: name, phone: phone }); }

  RIG.crew = { session: session, signOut: signOut, sendCode: sendCode, verify: verify,
    state: state, invite: invite, cooldownLeft: cooldownLeft, cached: function () { return read(CREW, null); } };
})(typeof window !== "undefined" ? window : globalThis);
