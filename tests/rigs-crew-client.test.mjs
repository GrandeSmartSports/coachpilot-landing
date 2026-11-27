// The crew client (rigs/crew.js) on its own: a fake network and a fake
// phone store, no browser. Run: node tests/rigs-crew-client.test.mjs
//
// What is pinned here: what gets signed out and what never does, the one
// refresh at a time rule, the queue (in order, once only, a 404 on a delete
// is done, a refused write is dropped and reported), what a pasted link may
// look like, and the address the Messages button opens.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(resolve(ROOT, "rigs/crew.js"), "utf8");

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 60000);
watchdog.unref?.();
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const FN = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-crew";
const AUTH = "https://geigvuysptjvvqanumld.supabase.co/auth/v1";
const REST = "https://geigvuysptjvvqanumld.supabase.co/rest/v1";
const STORE = "https://geigvuysptjvvqanumld.supabase.co/storage/v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = "Ab3_dEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd"; // 43, the shape the function mints
const DOWN = Symbol("no signal");
const HANG = Symbol("never answers");

function phoneStore(shared) {
  const m = shared || new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, map: m };
}
// A stand-in for navigator.locks: one holder at a time, across "tabs".
function lockRoom() {
  const held = new Map();
  return {
    request(name, fn) {
      const before = held.get(name) || Promise.resolve();
      const run = before.then(() => fn());
      held.set(name, run.catch(() => {}));
      return run;
    },
  };
}

// One "tab": the client loaded against a fake window. net(req) answers
// { status, body }, or DOWN, or HANG, or a promise of one of those.
function tab(opts = {}) {
  const calls = [];
  const listeners = {};
  const root = {
    RIG: { fetchTimeout: opts.timeout || 150 },
    localStorage: opts.store || phoneStore(),
    setTimeout, clearTimeout, AbortController, Promise,
    crypto: { randomUUID: () => crypto.randomUUID() },
    navigator: Object.assign({ userAgent: opts.ua || "node test", maxTouchPoints: 0 }, opts.navigator || {}),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    document: { visibilityState: "visible", addEventListener(type, fn) { (listeners["doc:" + type] ||= []).push(fn); } },
    fetch(url, o = {}) {
      let body = o.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* raw */ } }
      const req = { url: String(url), method: o.method || "GET", headers: o.headers || {}, body };
      calls.push(req);
      return Promise.resolve().then(() => root.net(req)).then((a) => {
        if (a === DOWN) throw new TypeError("Failed to fetch");
        if (a === HANG) return new Promise((_, no) => { if (o.signal) o.signal.addEventListener("abort", () => no(new Error("aborted"))); });
        const text = a && a.raw !== undefined ? a.raw : JSON.stringify(a ? a.body : {});
        const status = (a && a.status) || 200;
        return { status, ok: status >= 200 && status < 300, text: () => Promise.resolve(text), json: () => Promise.resolve(JSON.parse(text)) };
      });
    },
    net: opts.net || (() => ({ status: 200, body: {} })),
  };
  if (opts.extra) Object.assign(root, opts.extra);
  new Function("window", SRC)(root);
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn({ type }));
  return { root, crew: root.RIG.crew, calls, fire, store: root.localStorage,
    fn: () => calls.filter((c) => c.url === FN).map((c) => c.body.action),
    read: (k) => JSON.parse(root.localStorage.getItem(k) || "null") };
}
const signedIn = (store, over = {}) => store.setItem("rig.session.v1",
  JSON.stringify(Object.assign({ token: "tok-1", refresh: "ref-1", at: Date.now() + 3600e3, userId: "u-russ" }, over)));

const ME = { id: "u-russ", name: "Russell" };
const MEMBERS = [{ id: "u-coach", name: "Coach", role: "owner", alerts: true, signIn: "code" },
  { id: "u-russ", name: "Russell", role: "member", alerts: false, signIn: "link" }];
const TRIP = { id: "t1", planId: "squid-redondo", spotId: "redondo", species: "squid", title: "Squid at Redondo", date: "2026-11-28",
  from: 17, to: 21, status: "planned", note: null, by: { id: "u-coach", name: "Coach" },
  going: [{ id: "u-coach", name: "Coach", answer: "going" }], counts: { comments: 0, list: 1, listDone: 0, catches: 0 }, updatedAt: "2026-11-26T18:00:00.000Z" };
const STATE = { me: ME, crew: { id: "c1", name: "ZZTEST crew", role: "member" }, members: MEMBERS, trips: [TRIP], sms: true };
const FULL = { trip: TRIP, comments: [], list: [{ id: "i1", label: "Squid jigs", assignedTo: null, done: false, mine: false }], catches: [] };
const clone = (v) => JSON.parse(JSON.stringify(v));

// A crew function that works: remembers nothing, answers in the contract's shapes.
function server(log = []) {
  let n = 0;
  return (req) => {
    if (req.url !== FN) return { status: 200, body: {} };
    const b = req.body;
    log.push(b);
    if (b.action === "hello") return { status: 200, body: { ok: true, sms: true, vapidKey: "BPubKey" } };
    if (b.action === "state") return { status: 200, body: clone(STATE) };
    if (b.action === "trip") return { status: 200, body: clone(FULL) };
    if (b.action === "going") return { status: 200, body: { ok: true, going: [{ id: "u-coach", name: "Coach", answer: "going" }, { id: "u-russ", name: "Russell", answer: b.answer }] } };
    if (b.action === "comment_add") return { status: 200, body: { ok: true, comment: { id: "c" + (++n), section: b.section || null, body: b.body, by: ME, at: "2026-11-26T19:00:00.000Z", mine: true } } };
    if (b.action === "list_add") return { status: 200, body: { ok: true, item: { id: "srv-" + b.clientId.slice(0, 4), label: b.label, assignedTo: null, done: false, mine: true } } };
    if (b.action === "list_update") return { status: 200, body: { ok: true, item: { id: b.itemId, label: "Squid jigs", assignedTo: null, done: !!b.done, mine: false } } };
    if (b.action === "catch_link") return { status: 200, body: { ok: true, catch: { id: b.catchId, species: "Squid", lengthIn: null, weightLb: 0.5, lure: "", notes: "", photoUrl: null, by: ME, at: "2026-11-28T03:00:00.000Z", mine: true } } };
    return { status: 200, body: { ok: true } };
  };
}

// ---------------------------------------------------------- pasted links
{
  const t = tab();
  const J = t.crew.joinToken;
  ok(J(TOKEN) === TOKEN, "a bare token is taken as it is");
  ok(J("  " + TOKEN + "\n") === TOKEN, "spaces around a pasted token do not matter");
  ok(J("https://coachpilot.org/rigs/#/join/" + TOKEN) === TOKEN, "a whole link gives its token");
  ok(J("Coach added you to the fishing crew on Rig Card. Tap to join: https://coachpilot.org/rigs/#/join/" + TOKEN + ". See you Saturday") === TOKEN,
    "a whole text message with the link somewhere in it gives its token");
  ok(J("coachpilot.org/rigs/#/join/" + TOKEN + "?x=1") === TOKEN, "a link with something after it still reads");
  ok(J("see you saturday") === "" && J("") === "" && J(null) === "" && J(TOKEN.slice(1)) === "" && J(TOKEN + "x") === "",
    "anything else is not a link");

  const r = await t.crew.join("what link");
  ok(r.error && !r.ok && t.calls.length === 0, "a paste that is not a link says so and calls nobody", r);

  const log = [];
  const u = tab({ net: (req) => {
    if (req.url === FN) { log.push(req.body); return { status: 200, body: Object.assign({ ok: true, name: "Russell", crew: "ZZTEST crew", by: "Coach" }, req.body.peek ? {} : { token_hash: "hash-9" }) }; }
    if (req.url === AUTH + "/verify") { log.push({ verify: req.body }); return { status: 200, body: { access_token: "tok-j", refresh_token: "ref-j", expires_in: 3600, user: { id: "u-russ" } } }; }
    return { status: 404, body: {} };
  } });
  const peek = await u.crew.join("https://coachpilot.org/rigs/#/join/" + TOKEN, { peek: true });
  ok(peek.ok && peek.name === "Russell" && peek.crew === "ZZTEST crew" && peek.by === "Coach", "a peek says who and which crew", peek);
  ok(log.length === 1 && log[0].action === "join" && log[0].token === TOKEN && log[0].peek === true, "a peek sends only the token", log);
  ok(u.crew.session() === null && !("token_hash" in peek), "a peek signs nobody in");
  const inn = await u.crew.join(TOKEN);
  ok(inn.ok && inn.name === "Russell" && !("token_hash" in inn), "joining answers ok and keeps the sign-in hash to itself", inn);
  ok(log[2] && log[2].verify && log[2].verify.type === "magiclink" && log[2].verify.token_hash === "hash-9", "the hash is traded at the sign-in server", log[2]);
  ok(u.crew.session() && u.crew.session().token === "tok-j" && u.crew.session().userId === "u-russ", "and the person is signed in");

  // Signed in as someone else, joining as the link's person signs the one
  // before out properly: their alert subscription on this phone and their
  // session at the sign-in server, each with their own old token. A join that
  // fails leaves them signed in.
  {
    const st = phoneStore(); signedIn(st, { token: "tok-sam", userId: "u-sam" });
    const slog = []; let unsub = 0;
    const sub = { endpoint: "https://push.example/sam", unsubscribe: () => { unsub++; return Promise.resolve(true); } };
    const reg = { pushManager: { getSubscription: () => Promise.resolve(sub) } };
    const net = (req) => {
      if (req.url === FN) { slog.push({ fn: req.body, auth: req.headers.Authorization || "" }); return { status: 200, body: Object.assign({ ok: true, name: "Russell", crew: "ZZTEST crew", by: "Coach" }, req.body.action === "join" && !req.body.peek ? { token_hash: "hash-9" } : {}) }; }
      if (req.url === AUTH + "/verify") return { status: 200, body: { access_token: "tok-russ", refresh_token: "ref-r", expires_in: 3600, user: { id: "u-russ" } } };
      if (req.url.indexOf(AUTH + "/logout") === 0) { slog.push({ logout: req.headers.Authorization || "" }); return { status: 204, body: {} }; }
      return { status: 404, body: {} };
    };
    const sw = tab({ store: st, net, navigator: { serviceWorker: { ready: Promise.resolve(reg) } }, extra: { PushManager: function () {} } });
    const j = await sw.crew.join(TOKEN);
    for (let i = 0; i < 20 && !slog.some((x) => x.logout); i++) await tick(5);
    const outs = slog.filter((x) => x.logout), offs = slog.filter((x) => x.fn && x.fn.action === "push_unsubscribe");
    ok(j.ok && sw.crew.session().userId === "u-russ" && sw.crew.session().token === "tok-russ", "switching on a join link signs the link's person in", sw.crew.session());
    ok(outs.length === 1 && outs[0].logout === "Bearer tok-sam", "and signs the one before out at the sign-in server, once, with their own token", outs);
    ok(offs.length === 1 && offs[0].auth === "Bearer tok-sam" && offs[0].fn.endpoint === "https://push.example/sam" && unsub === 1, "and stops their alerts on this phone, with their own token", offs);

    const st2 = phoneStore(); signedIn(st2, { token: "tok-sam", userId: "u-sam" });
    const flog = [];
    const bad = tab({ store: st2, net: (req) => {
      if (req.url === FN) { flog.push(req.body); return { status: 200, body: { ok: true, name: "Russell", crew: "ZZTEST crew", token_hash: "hash-9" } }; }
      if (req.url === AUTH + "/verify") return { status: 400, body: { error_code: "otp_expired" } };
      if (req.url.indexOf(AUTH + "/logout") === 0) { flog.push({ logout: true }); return { status: 204, body: {} }; }
      return { status: 404, body: {} };
    } });
    const no = await bad.crew.join(TOKEN);
    await tick(20);
    ok(!no.ok && bad.crew.session().token === "tok-sam" && !flog.some((x) => x.logout), "a join that fails leaves the one before signed in", no);
  }

  const dead = tab({ net: () => ({ status: 410, body: { error: "That link is not good any more. Ask for a new one." } }) });
  const d = await dead.crew.join(TOKEN, { peek: true });
  ok(/not good any more/.test(d.error || "") && d.dead === true, "a dead link says so", d);
  const none = tab({ net: () => DOWN });
  ok((await none.crew.join(TOKEN, { peek: true })).offline === true, "no signal on a link says offline, not dead");
}

// ------------------------------------------------- the Messages address
{
  const words = "Coach added you to the fishing crew on Rig Card. Tap to join: https://coachpilot.org/rigs/#/join/" + TOKEN;
  const iphone = tab({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" });
  const ipad = tab({ ua: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  const ipadDesk = tab({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", navigator: { maxTouchPoints: 5 } });
  const android = tab({ ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" });
  const mac = tab({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" });
  ok(iphone.crew.textLink(words) === "sms:&body=" + encodeURIComponent(words), "iPhone: sms:&body=", iphone.crew.textLink(words));
  ok(ipad.crew.textLink(words).startsWith("sms:&body="), "iPad: sms:&body=");
  ok(ipadDesk.crew.textLink(words).startsWith("sms:&body="), "an iPad that says it is a Mac: sms:&body=");
  ok(android.crew.textLink(words) === "sms:?body=" + encodeURIComponent(words), "Android: sms:?body=", android.crew.textLink(words));
  ok(mac.crew.textLink(words).startsWith("sms:?body="), "anything else: sms:?body=");
  const enc = android.crew.textLink("Squid & jigs #1\nSee: a b");
  ok(!/[ #\n]/.test(enc.slice(10)) && !/&/.test(enc.slice(10)) && decodeURIComponent(enc.slice(10)) === "Squid & jigs #1\nSee: a b", "the words are encoded whole", enc);
}

// ------------------------------------------------ phone numbers and codes
{
  const t = tab();
  const N = t.crew.normalizePhone;
  ok(N("(253) 555-0147") === "+12535550147" && N("1 253 555 0147") === "+12535550147" && N("+1 253.555.0147") === "+12535550147", "a number typed the usual ways is one number");
  ok(N("555-0147") === null && N("") === null && N("25355501478") === null, "a number that is not one is not sent");

  let otp = 0;
  const s = tab({ net: (req) => { if (req.url === AUTH + "/otp") { otp++; return tick(20).then(() => ({ status: 200, body: {} })); } return { status: 200, body: {} }; } });
  const bad = await s.crew.sendCode("555");
  ok(/US phone number/.test(bad.error || "") && otp === 0, "a wrong number says so and sends nothing", bad);
  const [a, b] = await Promise.all([s.crew.sendCode("253 555 0147"), s.crew.sendCode("(253) 555-0147")]);
  ok(a.ok && b.ok && otp === 1, "a double tap asks for one code, and both taps hear it worked", { a, b, otp });
  const again = await s.crew.sendCode("2535550147");
  ok(again.retryAfter > 0 && otp === 1, "inside the wait a third tap sends nothing and says how long", again);
  ok(s.calls[0].body.phone === "+12535550147" && s.calls[0].body.create_user === false, "the number goes up in one shape, and never makes an account", s.calls[0].body);

  const unk = tab({ net: () => ({ status: 422, body: { error_code: "otp_disabled", msg: "Signups not allowed for otp" } }) });
  ok(/not on a crew yet\. Ask whoever runs your crew to add you\./.test((await unk.crew.sendCode("2535550199")).error || ""), "a number not on the crew is told to ask Coach");
  const lim = tab({ net: () => ({ status: 429, body: { error_code: "over_sms_send_rate_limit", msg: "rate limit" } }) });
  const l = await lim.crew.sendCode("2535550147");
  ok(l.retryAfter > 0, "the sign-in server's own wait is passed on as a wait, not as a bad number", l);
  const off = tab({ net: () => DOWN });
  ok(/could not be sent/i.test((await off.crew.sendCode("2535550147")).error || ""), "no signal says the code could not be sent");
  const slow = tab({ net: () => HANG, timeout: 60 });
  const t0 = Date.now();
  const sl = await slow.crew.sendCode("2535550147");
  ok(/could not be sent/i.test(sl.error || "") && Date.now() - t0 < 1000, "a line that never answers gives up, it does not sit on Sending", sl);

  const v = tab({ net: (req) => req.url === AUTH + "/verify" && req.body.token === "123456"
    ? { status: 200, body: { access_token: "tok-v", refresh_token: "ref-v", expires_in: 3600, user: { id: "u-russ" } } }
    : { status: 403, body: { error_code: "otp_expired", msg: "Token has expired or is invalid" } } });
  ok(/did not work/.test((await v.crew.verify("2535550147", "000000")).error || "") && v.crew.session() === null, "a wrong code says so");
  const good = await v.crew.verify("253 555 0147", " 123456 ");
  ok(good.ok && v.crew.session().token === "tok-v", "the right code signs in", good);
  ok(v.calls[1].body.type === "sms" && v.calls[1].body.phone === "+12535550147" && v.calls[1].body.token === "123456", "the code goes up trimmed, with the number", v.calls[1].body);
}

// --------------------------------------- what signs a person out, and what never does
{
  // A dead refresh token, said plainly by the sign-in server: signed out.
  const store = phoneStore(); signedIn(store, { at: Date.now() - 1000 });
  store.setItem("rig.crew.v1", JSON.stringify(STATE));
  const dead = tab({ store, net: (req) => req.url.startsWith(AUTH + "/token") ? { status: 400, body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" } } : { status: 200, body: clone(STATE) } });
  const r = await dead.crew.state({ fresh: true });
  ok(r.signedOut === true && dead.crew.session() === null, "the sign-in server saying the session is gone signs the person out", r);
  ok(dead.fn().length === 0, "and the dead token was never shown to the crew function");

  for (const [what, answer] of [["a 503", { status: 503, raw: "<html>bad gateway</html>" }], ["a 429", { status: 429, body: { error_code: "over_request_rate_limit" } }],
    ["a 500", { status: 500, body: { error_code: "unexpected_failure" } }], ["a 200 that is not ours", { status: 200, raw: "<html>wifi sign in</html>" }],
    ["no signal", DOWN], ["a line that never answers", HANG]]) {
    const st = phoneStore(); signedIn(st, { at: Date.now() - 1000 });
    st.setItem("rig.crew.v1", JSON.stringify(STATE));
    const t = tab({ store: st, timeout: 60, net: (req) => req.url.startsWith(AUTH + "/token") ? answer : { status: 401, body: { error: "Sign in first." } } });
    const got = await t.crew.state({ fresh: true });
    ok(!got.signedOut && t.crew.session() && t.crew.session().refresh === "ref-1", what + " from the sign-in server does not sign anyone out", got);
    ok(got.stale === true && got.crew && got.crew.name === "ZZTEST crew" && got.members.length === 2, what + ": the saved crew is still what shows", got);
    ok(t.fn().length === 0, what + ": a token past its time is never sent on");
    ok(st.getItem("rig.crew.v1") !== null, what + ": the saved crew is not erased");
  }

  // The crew function says 401. That alone signs nobody out: ask the sign-in server.
  {
    const st = phoneStore(); signedIn(st);
    let tokens = 0;
    const t = tab({ store: st, net: (req) => {
      if (req.url.startsWith(AUTH + "/token")) { tokens++; return { status: 200, body: { access_token: "tok-2", refresh_token: "ref-2", expires_in: 3600, user: { id: "u-russ" } } }; }
      return req.headers.Authorization === "Bearer tok-2" ? { status: 200, body: clone(STATE) } : { status: 401, body: { error: "Sign in first." } };
    } });
    const got = await t.crew.state({ fresh: true });
    ok(got.crew && !got.stale && tokens === 1 && t.crew.session().token === "tok-2", "a 401 from the crew function gets one fresh token and one more try", got);
  }
  {
    const st = phoneStore(); signedIn(st); st.setItem("rig.crew.v1", JSON.stringify(STATE));
    const t = tab({ store: st, net: (req) => req.url.startsWith(AUTH + "/token") ? { status: 503, body: {} } : { status: 401, body: { error: "Sign in first." } } });
    const got = await t.crew.state({ fresh: true });
    ok(!got.signedOut && t.crew.session() !== null && got.stale === true, "a 401 from the crew function while the sign-in server is down signs nobody out", got);
  }
  {
    const st = phoneStore(); signedIn(st);
    const t = tab({ store: st, net: (req) => req.url.startsWith(AUTH + "/token") ? { status: 400, body: { error: "invalid_grant", error_description: "Invalid Refresh Token" } } : { status: 401, body: { error: "Sign in first." } } });
    const got = await t.crew.state({ fresh: true });
    ok(got.signedOut === true && t.crew.session() === null, "a 401 and then the sign-in server saying no: signed out", got);
  }
  {
    // A fresh token, and the function still says 401. Something is wrong on our end, not theirs.
    const st = phoneStore(); signedIn(st); st.setItem("rig.crew.v1", JSON.stringify(STATE));
    const t = tab({ store: st, net: (req) => req.url.startsWith(AUTH + "/token") ? { status: 200, body: { access_token: "tok-2", refresh_token: "ref-2", expires_in: 3600 } } : { status: 401, body: { error: "Sign in first." } } });
    const got = await t.crew.state({ fresh: true });
    ok(!got.signedOut && t.crew.session() !== null && got.stale === true && !!got.error, "a 401 that a fresh token does not cure is an error, not a sign-out", got);
    ok(t.fn().length === 2, "and it is tried twice, not forever", t.fn());
  }
}

// ------------------------------------------------------- one refresh at a time
{
  // Two calls in one tab share one refresh.
  const st = phoneStore(); signedIn(st, { at: Date.now() - 1000 });
  let tokens = 0;
  const t = tab({ store: st, net: (req) => {
    if (req.url.startsWith(AUTH + "/token")) { tokens++; return tick(30).then(() => ({ status: 200, body: { access_token: "tok-2", refresh_token: "ref-2", expires_in: 3600 } })); }
    return server()(req);
  } });
  const [a, b] = await Promise.all([t.crew.state({ fresh: true }), t.crew.trip("t1", { fresh: true })]);
  ok(tokens === 1 && a.crew && b.trip, "two calls at once make one refresh", { tokens });
  ok(t.calls.filter((c) => c.url === FN).every((c) => c.headers.Authorization === "Bearer tok-2"), "and both go out with the new token");
  ok(t.crew.session().userId === "u-russ", "the person is still the same person after a refresh");

  // Two tabs, a phone with no locks: the slower tab hears "already used" and must not sign the faster one out.
  const shared = phoneStore(); signedIn(shared, { at: Date.now() - 1000 });
  let used = 0;
  const auth = (delay) => (req) => {
    if (!req.url.startsWith(AUTH + "/token")) return server()(req);
    const first = ++used === 1;
    return tick(delay).then(() => first
      ? { status: 200, body: { access_token: "tok-A", refresh_token: "ref-A", expires_in: 3600 } }
      : { status: 400, body: { error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" } });
  };
  const A = tab({ store: shared, net: auth(10) }), B = tab({ store: shared, net: auth(60) });
  const [ra, rb] = await Promise.all([A.crew.state({ fresh: true }), B.crew.state({ fresh: true })]);
  ok(used === 2, "both tabs did ask (no locks on this phone)", used);
  ok(ra.crew && rb.crew && !rb.signedOut, "the second tab is not signed out by the first tab's refresh", rb);
  ok(JSON.parse(shared.getItem("rig.session.v1")).token === "tok-A", "and the good session the first tab saved is still there");

  // With locks, the second tab waits and then finds the work done.
  const sh2 = phoneStore(); signedIn(sh2, { at: Date.now() - 1000 });
  const room = lockRoom();
  let asked = 0;
  const once = (req) => {
    if (!req.url.startsWith(AUTH + "/token")) return server()(req);
    asked++;
    return tick(30).then(() => ({ status: 200, body: { access_token: "tok-L", refresh_token: "ref-L", expires_in: 3600 } }));
  };
  const C = tab({ store: sh2, net: once, navigator: { locks: room } }), D = tab({ store: sh2, net: once, navigator: { locks: room } });
  const [rc, rd] = await Promise.all([C.crew.state({ fresh: true }), D.crew.state({ fresh: true })]);
  ok(asked === 1 && rc.crew && rd.crew, "two tabs with locks make one refresh between them", asked);
}

// ------------------------------------------------------------------ reads
{
  // Saved crew comes back at once; the fresh one follows.
  const st = phoneStore(); signedIn(st);
  const old = clone(STATE); old.crew.name = "Old name";
  st.setItem("rig.crew.v1", JSON.stringify(old));
  const t = tab({ store: st, timeout: 2000, net: (req) => tick(200).then(() => server()(req)) });
  let fresh = null;
  const t0 = Date.now();
  const first = await t.crew.state({ onFresh: (r) => { fresh = r; } });
  ok(first.stale === true && first.crew.name === "Old name" && Date.now() - t0 < 150, "the saved crew comes back at once, marked stale", first);
  await tick(500);
  ok(fresh && !fresh.stale && fresh.crew.name === "ZZTEST crew", "and the fresh one follows", fresh);
  ok(t.crew.cached().crew.name === "ZZTEST crew" && t.crew.cached().trips.length === 1, "the phone now holds the fresh one, trips and all");

  // A line that never answers: the saved crew, and the wait ends.
  const hang = tab({ store: st, timeout: 60, net: () => HANG });
  const t1 = Date.now();
  const h = await hang.crew.state({ fresh: true });
  ok(h.stale && h.offline && h.crew && Date.now() - t1 < 1000, "a line that never answers ends in the saved crew, not in Loading", h);
  const bare = phoneStore(); signedIn(bare);
  const nothing = tab({ store: bare, timeout: 60, net: () => HANG });
  const n = await nothing.crew.state();
  ok(n.offline === true && !n.crew, "with nothing saved it says offline", n);

  // A server fault: still signed in, saved crew, plain words.
  const st5 = phoneStore(); signedIn(st5); st5.setItem("rig.crew.v1", JSON.stringify(STATE));
  const five = tab({ store: st5, net: () => ({ status: 500, body: { error: "Something went wrong on our end. Try again." } }) });
  const f = await five.crew.state({ fresh: true });
  ok(f.stale && f.crew && /went wrong/.test(f.error || "") && five.crew.session() !== null, "a 500 keeps the person signed in with the saved crew and the server's words", f);
  const junk = tab({ store: bare, net: () => ({ status: 502, raw: "<html>bad gateway</html>" }) });
  const j = await junk.crew.state();
  ok(j.error && !j.crew && !j.me, "a fault with nothing saved is an error, never an empty crew", j);

  // A trip: saved once, opens with no signal.
  const st6 = phoneStore(); signedIn(st6);
  let down = false;
  const tr = tab({ store: st6, net: (req) => down ? DOWN : server()(req) });
  const one = await tr.crew.trip("t1");
  ok(one.trip.id === "t1" && one.list.length === 1 && !one.stale, "a trip opens", one);
  down = true;
  const two = await tr.crew.trip("t1", { fresh: true });
  ok(two.stale && two.offline && two.trip.title === "Squid at Redondo" && two.list[0].label === "Squid jigs", "and opens again with no signal", two);
  ok(tr.crew.cachedTrip("t1").trip.id === "t1" && tr.crew.cachedTrip("nope") === null, "the saved trip can be read straight off the phone");
  const gone = tab({ store: st6, net: () => ({ status: 404, body: { error: "That trip is not here any more." } }) });
  const g = await gone.crew.trip("t1", { fresh: true });
  ok(g.gone === true && /not here/.test(g.error) && gone.crew.cachedTrip("t1") === null, "a trip that was deleted says so and is forgotten", g);

  // hello needs no sign-in and is remembered.
  const hs = phoneStore();
  let helloDown = false;
  const he = tab({ store: hs, net: (req) => helloDown ? DOWN : server()(req) });
  const h1 = await he.crew.hello();
  ok(h1.ok && h1.sms === true && h1.vapidKey === "BPubKey" && !he.calls[0].headers.Authorization, "hello asks with no sign-in", h1);
  helloDown = true;
  const h2 = await he.crew.hello();
  ok(h2.stale && h2.sms === true, "and the last answer is remembered for no signal", h2);
  ok((await tab({ net: () => DOWN }).crew.hello()).offline === true, "hello with nothing saved and no signal says offline");

  // Signed out, nothing is asked.
  const out = tab();
  ok((await out.crew.state()).signedOut === true && (await out.crew.going("t1", "going")).signedOut === true && out.calls.length === 0, "signed out, nothing is sent anywhere");
}

// -------------------------------------------- writes that must not look like they worked
{
  const st = phoneStore(); signedIn(st); st.setItem("rig.crew.v1", JSON.stringify(Object.assign(clone(STATE), { crew: { id: "c1", name: "ZZTEST crew", role: "owner" } })));
  const off = tab({ store: st, net: () => DOWN });
  const r = await off.crew.invite("Dad", "253 555 0148");
  ok(r.offline === true && !r.ok && !r.crew && !r.members, "adding someone with no signal says offline, never the saved crew", r);
  const junk = tab({ store: st, net: () => ({ status: 502, raw: "<html></html>" }) });
  const j = await junk.crew.invite("Dad", "");
  ok(j.error && !j.ok, "a fault that is not ours to read is still an error", j);
  const portal = tab({ store: st, net: () => ({ status: 200, raw: "<html>wifi</html>" }) });
  ok((await portal.crew.invite("Dad", "")).error, "a 200 that is not from the function is an error too");
  const no = tab({ store: st, net: () => ({ status: 403, body: { error: "Only the owner can add someone." } }) });
  const n = await no.crew.invite("Dad", "");
  ok(n.error === "Only the owner can add someone." && n.status === 403, "the function's own words come through", n);

  const log = [];
  const good = tab({ store: st, net: (req) => {
    log.push(req.body);
    if (req.body.action === "invite") return { status: 200, body: { ok: true, created: true, name: "Dad", userId: "u-dad", link: "https://coachpilot.org/rigs/#/join/" + TOKEN, signIn: "link" } };
    if (req.body.action === "link") return { status: 200, body: { ok: true, name: "Dad", link: "https://coachpilot.org/rigs/#/join/" + TOKEN } };
    return { status: 200, body: { ok: true } };
  } });
  const inv = await good.crew.invite(" Dad ", "");
  ok(inv.ok && inv.signIn === "link" && /#\/join\//.test(inv.link), "an invite answers with the link", inv);
  ok(log[0].name === "Dad" && !("phone" in log[0]), "a blank phone is not sent at all", log[0]);
  await good.crew.invite("Russ", "253 555 0147");
  ok(log[1].phone === "253 555 0147", "a phone goes up as typed, for the function to read", log[1]);
  ok((await good.crew.link("u-dad")).link && log[2].action === "link" && log[2].userId === "u-dad", "a new link");
  ok((await good.crew.removeMember("u-dad")).ok && log[3].action === "member_remove" && log[3].userId === "u-dad", "remove someone");

  // Trips: made, changed, deleted. A repeated delete (404) is done.
  const tlog = [];
  const tr = tab({ store: st, net: (req) => {
    tlog.push(req.body);
    if (req.body.action === "trip_create") return { status: 200, body: { ok: true, trip: Object.assign(clone(TRIP), { id: "t9", title: req.body.title }) } };
    if (req.body.action === "trip_update") return { status: 200, body: { ok: true, trip: Object.assign(clone(TRIP), { status: req.body.status }) } };
    if (req.body.action === "trip_delete") return { status: 404, body: { error: "That trip is not here any more." } };
    return { status: 200, body: clone(STATE) };
  } });
  const made = await tr.crew.createTrip({ planId: "squid-redondo", spotId: "redondo", species: "squid", title: "Squid again", date: "2026-11-29", status: "idea", seedList: ["Squid jigs", "Headlamp"], tell: [] });
  ok(made.ok && made.trip.id === "t9", "a trip is made", made);
  ok(UUID.test(tlog[0].clientId) && tlog[0].seedList.length === 2 && Array.isArray(tlog[0].tell) && tlog[0].tell.length === 0, "with its own client id, its gear list and who to tell", tlog[0]);
  ok(tr.crew.cached().trips.some((x) => x.id === "t9") && tr.crew.isNew(made.trip) === false, "it is on the saved week at once, and not marked new to its maker");
  const up = await tr.crew.updateTrip("t1", { status: "done" });
  ok(up.ok && tlog[1].tripId === "t1" && tlog[1].status === "done" && tr.crew.cached().trips.find((x) => x.id === "t1").status === "done", "a trip is changed, and the saved week with it", up);
  const del = await tr.crew.deleteTrip("t1", { tell: ["u-coach"] });
  ok(del.ok === true && tlog[2].tell[0] === "u-coach" && !tr.crew.cached().trips.some((x) => x.id === "t1"), "deleting a trip that is already gone counts as done", del);
  ok((await off.crew.createTrip({ planId: "squid-redondo", spotId: "redondo", species: "squid", title: "x", date: "2026-11-29" })).offline === true, "a trip cannot be made with no signal, and says so");
}

// ------------------------------------------------------------------ the queue
{
  const st = phoneStore(); signedIn(st);
  let down = false;
  const log = [];
  const t = tab({ store: st, net: (req) => down ? DOWN : server(log)(req) });
  await t.crew.state({ fresh: true });
  await t.crew.trip("t1", { fresh: true });
  log.length = 0;
  down = true;

  const g = await t.crew.going("t1", "going");
  const c = await t.crew.addComment("t1", "gear", "I have a spare net", { tell: ["u-coach"] });
  const i = await t.crew.addItem("t1", "Bucket", "u-russ");
  const u = await t.crew.updateItem("i1", { done: true });
  const u2 = await t.crew.updateItem(i.item.id, { done: true });
  ok([g, c, i, u, u2].every((r) => r.ok === true && r.queued === true && UUID.test(r.clientId)), "with no signal each write is kept, with its own id", [g, c, i, u, u2]);
  ok(new Set([g, c, i, u, u2].map((r) => r.clientId)).size === 5, "five writes, five different ids");
  const q = t.read("rig.crewq.v1");
  ok(Array.isArray(q) && q.length === 5 && q.every((e) => UUID.test(e.clientId) && e.userId === "u-russ"), "they sit in rig.crewq.v1", q);
  ok(c.comment.waiting === true && c.comment.body === "I have a spare net" && c.comment.mine === true && i.item.waiting === true && i.item.assignedTo.name === "Russell", "each answer carries the row as it will show, marked waiting", { c, i });
  const p = await t.crew.pending();
  ok(p.count === 5 && p.items.map((x) => x.kind).join(",") === "going,comment_add,list_add,list_update,list_update", "pending() lists them in order", p);

  const view = await t.crew.trip("t1");
  ok(view.trip.going.some((x) => x.id === "u-russ" && x.answer === "going" && x.waiting), "the saved trip shows my answer, waiting", view.trip.going);
  ok(view.comments.length === 1 && view.comments[0].waiting && view.comments[0].section === "gear" && view.comments[0].by.name === "Russell", "and my note, waiting, with my name", view.comments);
  ok(view.list.length === 2 && view.list[0].done === true && view.list[0].waiting && view.list[1].label === "Bucket" && view.list[1].done === true && view.list[1].waiting, "and the list: the tick and the new line, waiting", view.list);
  ok(view.trip.counts.comments === 1 && view.trip.counts.list === 2 && view.trip.counts.listDone === 2, "and the counts add up", view.trip.counts);
  ok(t.crew.cached().trips[0].going.some((x) => x.id === "u-russ" && x.waiting) && t.crew.cached().trips[0].counts.comments === 1, "the week row shows it too", t.crew.cached().trips[0]);
  ok(log.length === 0, "and nothing reached the function");

  // Signal back.
  down = false;
  const f = await t.crew.flush();
  ok(f.ok && f.sent === 5 && f.left === 0 && f.dropped.length === 0, "flush sends all five", f);
  ok(log.map((b) => b.action).join(",") === "going,comment_add,list_add,list_update,list_update", "in the order they were made", log.map((b) => b.action));
  ok(log[1].clientId === c.clientId && log[1].section === "gear" && log[1].tell[0] === "u-coach" && log[2].clientId === i.clientId && log[2].assignedTo === "u-russ", "each with the id it was given, and who to tell", log);
  ok(log[4].itemId === "srv-" + i.clientId.slice(0, 4), "a tick on a line that was itself waiting goes to the line's real id", log[4]);
  ok(t.read("rig.crewq.v1").length === 0 && (await t.crew.pending()).count === 0, "and the queue is empty");
  const before = log.length;
  const f2 = await t.crew.flush();
  ok(f2.sent === 0 && log.length === before, "a second flush sends nothing: once only", f2);
  const after = await t.crew.trip("t1");
  ok(!after.comments.some((x) => x.waiting) && after.comments.length >= 1 && !after.list.some((x) => x.waiting), "nothing shows as waiting any more", after);

  // Two flushes at the same moment are one flush.
  down = true;
  await t.crew.addComment("t1", null, "one");
  await t.crew.addComment("t1", null, "two");
  down = false; log.length = 0;
  const [fa, fb] = await Promise.all([t.crew.flush(), t.crew.flush()]);
  ok(log.filter((b) => b.action === "comment_add").length === 2 && fa.sent === 2 && fb.sent === 2, "two flushes at once send each write once", log.map((b) => b.body));
  ok(log.map((b) => b.body).join(",") === "one,two", "still in order");
}
{
  // The answer got lost on the way back: the same id goes again, so the server can tell.
  const st = phoneStore(); signedIn(st);
  const log = []; let lose = true;
  const t = tab({ store: st, timeout: 60, net: (req) => {
    if (req.body && req.body.action === "comment_add") { log.push(req.body); if (lose) { lose = false; return HANG; } }
    return server()(req);
  } });
  const r = await t.crew.addComment("t1", "plan", "Leave at 4");
  ok(r.queued === true, "a write whose answer never came back is kept, not called done", r);
  const f = await t.crew.flush();
  ok(f.sent === 1 && log.length === 2 && log[0].clientId === log[1].clientId, "it goes again with the same id, so it cannot land twice", log);
}
{
  // Online, a write goes straight through and answers with the server's row.
  const st = phoneStore(); signedIn(st);
  const log = [];
  const t = tab({ store: st, net: server(log) });
  await t.crew.trip("t1", { fresh: true });
  const c = await t.crew.addComment("t1", "bait", "Bring the pink ones");
  ok(c.ok && !c.queued && c.comment.id === "c1" && !c.comment.waiting, "with a signal a note answers with the server's own row", c);
  ok(t.crew.cachedTrip("t1").comments.some((x) => x.id === "c1") && t.read("rig.crewq.v1").length === 0, "and the saved trip has it, nothing left waiting");
  const g = await t.crew.going("t1", "maybe");
  ok(g.ok && g.going.some((x) => x.id === "u-russ" && x.answer === "maybe") && t.crew.cachedTrip("t1").trip.going.length === 2, "going answers with who is going", g);
  ok(t.crew.isNew(Object.assign(clone(TRIP), { updatedAt: new Date().toISOString() })) === true, "(before the next look, a moved trip reads as new)");
}
{
  // The 404 rule: a delete that was already done is done.
  const st = phoneStore(); signedIn(st);
  let down = false; const log = [];
  const t = tab({ store: st, net: (req) => {
    if (down) return DOWN;
    if (req.url === FN && /_delete$/.test(req.body.action)) { log.push(req.body); return { status: 404, body: { error: "That is not here any more." } }; }
    if (req.url === FN && req.body.action === "trip") return { status: 200, body: Object.assign(clone(FULL), { comments: [{ id: "c7", section: null, body: "old", by: ME, at: "2026-11-26T19:00:00.000Z", mine: true }] }) };
    return server(log)(req);
  } });
  await t.crew.trip("t1", { fresh: true });
  down = true;
  const d1 = await t.crew.deleteItem("i1");
  const d2 = await t.crew.deleteComment("c7");
  ok(d1.ok && d1.queued && d2.ok && d2.queued, "deletes made with no signal wait too", { d1, d2 });
  const v = await t.crew.trip("t1");
  ok(v.list.length === 0 && v.comments.length === 0, "and the rows are gone from the saved trip at once", v);
  down = false;
  const f = await t.crew.flush();
  ok(log.length === 2 && f.sent === 2 && f.dropped.length === 0 && f.left === 0, "a 404 on a delete counts as done: not kept, not reported", f);
  ok(t.crew.failed().length === 0, "nothing is in the could-not-send list");
  const online = await t.crew.deleteItem("i-gone");
  ok(online.ok === true && !online.error, "and a delete with a signal that hears 404 is done as well", online);
}
{
  // The 4xx rule: a write the function refuses is dropped and reported, and the rest still go.
  const st = phoneStore(); signedIn(st);
  let down = false; const log = [];
  const t = tab({ store: st, net: (req) => {
    if (down) return DOWN;
    if (req.url === FN && req.body.action === "comment_add" && req.body.body === "bad") { log.push(req.body); return { status: 400, body: { error: "That note is too long." } }; }
    return server(log)(req);
  } });
  await t.crew.trip("t1", { fresh: true });
  log.length = 0; down = true;
  const bad = await t.crew.addComment("t1", null, "bad");
  await t.crew.addComment("t1", null, "fine");
  let told = null;
  t.crew.onChange((w) => { if (w.kind === "queue" && w.dropped && w.dropped.length) told = w; });
  down = false;
  const f = await t.crew.flush();
  ok(f.sent === 1 && f.left === 0 && f.dropped.length === 1 && f.dropped[0].clientId === bad.clientId && f.dropped[0].error === "That note is too long.", "a refused write is dropped and reported with the function's words", f);
  ok(log.map((b) => b.body).join(",") === "bad,fine", "the write behind it still goes", log.map((b) => b.body));
  ok(told && told.dropped[0].kind === "comment_add" && told.dropped[0].tripId === "t1", "listeners hear about the drop", told);
  ok(t.crew.failed().length === 1 && t.crew.failed()[0].error === "That note is too long.", "failed() keeps it for the screen to show");
  const n = log.length;
  await t.crew.flush();
  ok(log.length === n, "it is never tried again");
  const v = await t.crew.trip("t1");
  ok(!v.comments.some((x) => x.body === "bad") && v.comments.some((x) => x.body === "fine"), "and it no longer shows as waiting", v.comments);
  t.crew.clearFailed();
  ok(t.crew.failed().length === 0, "clearFailed() empties the list");

  // With a signal, a refused write just answers with the error.
  const direct = await t.crew.addComment("t1", null, "bad");
  ok(direct.error === "That note is too long." && !direct.ok && !direct.queued && t.read("rig.crewq.v1").length === 0, "with a signal a refused write answers with the error and waits for nothing", direct);
}
{
  // What is NOT dropped: a fault on our end, too many at once, a token trouble. Order holds.
  for (const [what, status] of [["a 500", 500], ["a 429", 429], ["a 503", 503]]) {
    const st = phoneStore(); signedIn(st);
    let sick = true; const log = [];
    const t = tab({ store: st, net: (req) => {
      if (req.url === FN && req.body.action === "comment_add") { log.push(req.body.body); if (sick) return { status, body: { error: "Something went wrong on our end. Try again." } }; }
      return server()(req);
    } });
    const a = await t.crew.addComment("t1", null, "first");
    const b = await t.crew.addComment("t1", null, "second");
    ok(a.queued && b.queued && t.read("rig.crewq.v1").length === 2, what + " keeps the write waiting", { a, b });
    ok(log.join(",") === "first,first", what + ": the one behind does not jump the line", log);
    sick = false; log.length = 0;
    const f = await t.crew.flush();
    ok(f.sent === 2 && log.join(",") === "first,second", what + ": when the server is well again both go, in order", log);
  }
  {
    const st = phoneStore(); signedIn(st);
    const t = tab({ store: st, net: (req) => req.url.startsWith(AUTH + "/token") ? { status: 503, body: {} } : req.body.action === "going" ? { status: 401, body: { error: "Sign in first." } } : server()(req) });
    const g = await t.crew.going("t1", "going");
    ok(g.queued === true && t.read("rig.crewq.v1").length === 1 && t.crew.session() !== null, "a 401 never drops a write and never signs out on its own", g);
  }
}
{
  // "Later" has an end: three days of faults and a write stops holding up the line.
  const st = phoneStore(); signedIn(st);
  const old = { clientId: crypto.randomUUID(), userId: "u-russ", kind: "comment_add", tripId: "t1", at: new Date(Date.now() - 4 * 864e5).toISOString(), body: { tripId: "t1", body: "stuck" } };
  old.body.clientId = old.clientId;
  st.setItem("rig.crewq.v1", JSON.stringify([old]));
  let down = true; const log = [];
  const t = tab({ store: st, net: (req) => {
    if (down) return DOWN;
    if (req.url === FN && req.body.action === "comment_add") { log.push(req.body.body); if (req.body.body === "stuck") return { status: 500, body: { error: "Something went wrong on our end. Try again." } }; }
    return server()(req);
  } });
  await tick(20);
  const off = await t.crew.flush();
  ok(off.left === 1 && off.dropped.length === 0 && off.offline === true, "no signal for days drops nothing", off);
  await t.crew.addComment("t1", null, "behind it");
  down = false; log.length = 0;
  const f = await t.crew.flush();
  ok(f.dropped.length === 1 && f.dropped[0].clientId === old.clientId && f.sent === 1 && f.left === 0 && log.join(",") === "stuck,behind it",
    "a write the server has faulted on for three days is given up on, reported, and the one behind it goes", f);
  ok(t.crew.failed().length === 1 && /three days/.test(t.crew.failed()[0].error), "and failed() says why");
}
{
  // When the queue goes on its own: the next call that works, the signal coming back, the app coming forward.
  const st = phoneStore(); signedIn(st);
  let down = true; const log = [];
  const t = tab({ store: st, net: (req) => down ? DOWN : server(log)(req) });
  await t.crew.addComment("t1", null, "a");
  down = false;
  await t.crew.state({ fresh: true });
  await tick(30);
  ok(log.some((b) => b.action === "comment_add") && t.read("rig.crewq.v1").length === 0, "the next call that works takes the queue with it", log.map((b) => b.action));

  down = true; await t.crew.addComment("t1", null, "b"); down = false; log.length = 0;
  t.fire("online"); await tick(30);
  ok(log.filter((b) => b.action === "comment_add").length === 1, "the signal coming back sends it");

  down = true; await t.crew.addComment("t1", null, "c"); down = false; log.length = 0;
  t.root.document.visibilityState = "visible"; t.fire("doc:visibilitychange"); await tick(30);
  ok(log.filter((b) => b.action === "comment_add").length === 1, "the app coming back to the front sends it");
  log.length = 0; t.fire("online"); t.fire("doc:visibilitychange"); await tick(30);
  ok(log.length === 0, "with nothing waiting those do nothing");
}
{
  // A waiting line can be taken back before it is ever sent.
  const st = phoneStore(); signedIn(st);
  let down = true; const log = [];
  const t = tab({ store: st, net: (req) => down ? DOWN : server(log)(req) });
  const i = await t.crew.addItem("t1", "Wrong thing", null);
  await t.crew.updateItem(i.item.id, { done: true });
  const c = await t.crew.addComment("t1", null, "oops");
  const di = await t.crew.deleteItem(i.item.id);
  const dc = await t.crew.deleteComment(c.comment.id);
  ok(di.ok && dc.ok && t.read("rig.crewq.v1").length === 0, "deleting a waiting row just takes it out of the queue", t.read("rig.crewq.v1"));
  down = false;
  await t.crew.flush();
  ok(log.length === 0, "and it is never sent");

  // A second answer replaces the first while both wait.
  down = true;
  await t.crew.going("t1", "going"); await t.crew.going("t1", "out");
  ok(t.read("rig.crewq.v1").length === 1 && t.read("rig.crewq.v1")[0].body.answer === "out", "changing my mind with no signal keeps only the last answer");
  down = false; await t.crew.flush();
  ok(log.length === 1 && log[0].answer === "out", "and only that one is sent", log);
}
{
  // What one person wrote is never sent as somebody else.
  const st = phoneStore(); signedIn(st);
  let down = true; const log = [];
  const t = tab({ store: st, net: (req) => down ? DOWN : server(log)(req) });
  await t.crew.addComment("t1", null, "from Russell");
  signedIn(st, { userId: "u-dad", token: "tok-dad" });
  down = false;
  const f = await t.crew.flush();
  ok(f.sent === 0 && log.length === 0 && (await t.crew.pending()).count === 0, "another person on the same phone does not send or see my waiting note", f);
  signedIn(st);
  const f2 = await t.crew.flush();
  ok(f2.sent === 1 && log[0].body === "from Russell", "and it goes when I am back", f2);
}

// --------------------------------------- what can never land is never queued
{
  const st = phoneStore(); signedIn(st); st.setItem("rig.crew.v1", JSON.stringify(STATE));
  const t = tab({ store: st, net: () => DOWN });
  const a = await t.crew.addComment("t1", "gear", "   ");
  const b = await t.crew.addComment("t1", null, "x".repeat(1001));
  const c = await t.crew.addItem("t1", "", null);
  const d = await t.crew.addItem("t1", "y".repeat(121), null);
  const e = await t.crew.going("t1", "perhaps");
  ok([a, b, c, d, e].every((r) => r.error && !r.ok && !r.queued) && t.read("rig.crewq.v1") === null && t.calls.length === 0,
    "an empty note, a note too long, a line with no words and an answer that is not one are refused at once, not queued", [a, b, c, d, e]);
  const f = await t.crew.addComment("t1", null, "  Bring ice  ");
  ok(f.queued && t.read("rig.crewq.v1")[0].body.body === "Bring ice", "and a note goes up trimmed", t.read("rig.crewq.v1"));
  ok(JSON.stringify(t.crew.canTell()) === JSON.stringify([{ id: "u-coach", name: "Coach" }]), "canTell() lists the others who have alerts on, by name", t.crew.canTell());
}

// ------------------------------------------------------------------ new dots
{
  const st = phoneStore(); signedIn(st);
  const t = tab({ store: st, net: server() });
  await t.crew.state({ fresh: true });
  ok(t.crew.isNew(TRIP) === true, "a trip nobody has opened on this phone is new");
  t.crew.markSeen("t1");
  ok(t.crew.isNew(TRIP) === false && t.read("rig.crewseen.v1").t1 === TRIP.updatedAt, "opened, it is not", t.read("rig.crewseen.v1"));
  ok(t.crew.isNew(Object.assign(clone(TRIP), { updatedAt: "2026-11-27T01:00:00.000Z" })) === true, "something changed since: new again");
  ok(t.crew.isNew(null) === false && t.crew.isNew({}) === false, "nothing is not new");
}

// ------------------------------------------------------- a number on the account
{
  const st = phoneStore(); signedIn(st);
  const log = [];
  const t = tab({ store: st, net: (req) => {
    log.push(req);
    if (req.method === "PUT" && req.url === AUTH + "/user") {
      return req.body.phone === "+12535550100" ? { status: 422, body: { error_code: "phone_exists", msg: "A user with this phone number has already been registered" } } : { status: 200, body: { id: "u-russ" } };
    }
    if (req.url === AUTH + "/verify") return req.body.token === "654321"
      ? { status: 200, body: { access_token: "tok-p", refresh_token: "ref-p", expires_in: 3600, user: { id: "u-russ" } } }
      : { status: 403, body: { error_code: "otp_expired" } };
    return { status: 200, body: {} };
  } });
  ok(/US phone number/.test((await t.crew.addMyNumber("12")).error || "") && log.length === 0, "a wrong number is caught before anything is sent");
  const taken = await t.crew.addMyNumber("253 555 0100");
  ok(taken.error === "That number is already on another account.", "a number someone else has says so", taken);
  const sent = await t.crew.addMyNumber("(253) 555-0147");
  ok(sent.ok && log[1].method === "PUT" && log[1].body.phone === "+12535550147" && log[1].headers.Authorization === "Bearer tok-1" && !!log[1].headers.apikey, "my number goes up with my own sign-in", log[1]);
  ok(/did not work/.test((await t.crew.confirmMyNumber("2535550147", "111111")).error || ""), "a wrong code says so");
  const done = await t.crew.confirmMyNumber("2535550147", "654321");
  const last = log[log.length - 1];
  ok(done.ok && last.body.type === "phone_change" && last.body.phone === "+12535550147" && last.body.token === "654321" && t.crew.session().token === "tok-p", "the code confirms it and the new sign-in is kept", last.body);
}

// ------------------------------------------------------------------ alerts
{
  const st = phoneStore(); signedIn(st);
  const log = [];
  const t = tab({ store: st, net: (req) => {
    log.push(req.body);
    if (req.body.action === "prefs_get" || req.body.action === "prefs_set") return { status: 200, body: { prefs: { texts: !!req.body.texts, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }, hasPhone: false, pushSubs: 0 } };
    if (req.body.action === "test_alert") return { status: 200, body: { ok: true, push: "none", text: "none" } };
    return server()(req);
  } });
  const p = await t.crew.prefsGet();
  ok(p.prefs && p.hasPhone === false && log[0].action === "prefs_get", "prefs are read", p);
  const s = await t.crew.prefsSet({ texts: true, quietFrom: 22 });
  ok(s.prefs.texts === true && log[1].action === "prefs_set" && log[1].texts === true && log[1].quietFrom === 22, "and set", log[1]);
  ok((await t.crew.testAlert()).push === "none" && log[2].action === "test_alert", "a test alert is asked for");
  const cant = await t.crew.pushSubscribe();
  ok(cant.error && cant.unsupported === true && !cant.ok, "a browser that cannot show alerts says so", cant);
  ok(t.crew.alerts().supported === false, "alerts() says the same without asking anything");

  const iph = tab({ store: st, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", net: server() });
  const ni = await iph.crew.pushSubscribe();
  ok(ni.needsInstall === true && /Home Screen/.test(ni.error), "an iPhone not running from the Home Screen is told to add it there first", ni);
  ok(iph.crew.alerts().needsInstall === true && iph.crew.alerts().ios === true, "and alerts() says so too");

  // A phone that can: permission, a subscription made with the function's key, sent up.
  const plog = []; let subscribedWith = null, unsub = 0, permission = "default";
  const sub = { endpoint: "https://push.example/abc", toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p256-key", auth: "auth-key" } }), unsubscribe: () => { unsub++; return Promise.resolve(true); } };
  let current = null;
  const reg = { pushManager: { getSubscription: () => Promise.resolve(current), subscribe: (o) => { subscribedWith = o; current = sub; return Promise.resolve(sub); } } };
  const can = tab({ store: st, net: server(plog), navigator: { serviceWorker: { ready: Promise.resolve(reg) } },
    extra: { PushManager: function () {}, Notification: { get permission() { return permission; }, requestPermission: () => { permission = "granted"; return Promise.resolve("granted"); } } } });
  const okd = await can.crew.pushSubscribe();
  ok(okd.ok === true, "a phone that can show alerts subscribes", okd);
  ok(subscribedWith && subscribedWith.userVisibleOnly === true && subscribedWith.applicationServerKey && subscribedWith.applicationServerKey.length > 0, "with the key hello gave", subscribedWith);
  const up = plog.find((b) => b.action === "push_subscribe");
  ok(up && up.endpoint === "https://push.example/abc" && up.p256dh === "p256-key" && up.auth === "auth-key", "and the subscription goes up", up);
  const gone = await can.crew.pushUnsubscribe();
  ok(gone.ok && unsub === 1 && plog.some((b) => b.action === "push_unsubscribe" && b.endpoint === "https://push.example/abc"), "turning it off tells the function and the phone", gone);
  permission = "denied";
  const den = tab({ store: st, net: server(), navigator: { serviceWorker: { ready: Promise.resolve(reg) } },
    extra: { PushManager: function () {}, Notification: { get permission() { return permission; }, requestPermission: () => Promise.resolve("denied") } } });
  ok((await den.crew.pushSubscribe()).denied === true, "a no from the phone is a no, said plainly");
}

// ------------------------------------------------------------------ catches
{
  // No photo here (a photo needs a browser; the page smoke covers it). The
  // order is CastAI's: the catch_logs row with the person's own token, then the link.
  const st = phoneStore(); signedIn(st);
  let down = false; const log = [];
  const t = tab({ store: st, net: (req) => {
    if (down) return DOWN;
    log.push(req);
    if (req.url.startsWith(REST + "/catch_logs")) return { status: req.method === "POST" ? 201 : 204, raw: "" };
    if (req.url.startsWith(STORE)) return { status: 200, body: {} };
    return server()(req);
  } });
  await t.crew.trip("t1", { fresh: true });
  log.length = 0;
  const c = await t.crew.catch("t1", { species: "Squid", weightLb: 0.5, lengthIn: 9, lure: "Pink jig", notes: "On the drop", spotName: "Redondo pier", technique: "Jigging" }, { tell: ["u-coach"] });
  ok(c.ok && !c.queued && UUID.test(c.catch.id), "a catch with a signal is saved", c);
  const row = log.find((r) => r.url === REST + "/catch_logs");
  ok(row && row.method === "POST" && row.headers.Prefer === "resolution=merge-duplicates" && row.headers.Authorization === "Bearer tok-1" && !!row.headers.apikey, "the row goes to catch_logs the way the CastAI app sends it", row && row.headers);
  ok(row.body.id === c.catch.id && row.body.user_id === "u-russ" && row.body.species === "Squid" && row.body.weight === 0.5 && row.body.length === 9 &&
    row.body.lure === "Pink jig" && row.body.notes === "On the drop" && row.body.spot_name === "Redondo pier" && row.body.technique === "Jigging" &&
    row.body.state_code === "WA" && !Number.isNaN(Date.parse(row.body.catch_date)) && !("photo_url" in row.body), "pounds and inches, WA, the person's own id", row.body);
  const link = log.find((r) => r.url === FN && r.body.action === "catch_link");
  ok(link && link.body.tripId === "t1" && link.body.catchId === c.catch.id && link.body.tell[0] === "u-coach" && log.indexOf(row) < log.indexOf(link), "then the catch is linked to the trip", link && link.body);
  ok(t.crew.cachedTrip("t1").catches.length === 1 && t.crew.cachedTrip("t1").trip.counts.catches === 1, "and the saved trip shows it");
  ok(/which fish/i.test((await t.crew.catch("t1", { species: "  " })).error || ""), "a catch with no fish named is not sent");

  // No signal at the pier: it waits, shows, and goes up once.
  down = true; log.length = 0;
  const w = await t.crew.catch("t1", { species: "Squid", spotName: "Redondo pier" });
  ok(w.ok && w.queued && w.catch.waiting === true, "with no signal a catch waits", w);
  const v = await t.crew.trip("t1");
  ok(v.catches.length === 2 && v.catches.some((x) => x.id === w.catch.id && x.waiting), "and shows on the trip as waiting", v.catches);
  ok((await t.crew.pending()).items.some((x) => x.kind === "catch" && x.clientId === w.clientId), "pending() counts it");
  down = false;
  const f = await t.crew.flush();
  ok(f.sent === 1 && log.filter((r) => r.url === REST + "/catch_logs").length === 1 && log.filter((r) => r.url === FN && r.body.action === "catch_link").length === 1, "when the signal returns it goes up once", f);
  const n = log.length;
  await t.crew.flush();
  ok(log.length === n, "and never again");

  // Taking a catch back: the link, then the row, then the photo, with my own token.
  log.length = 0;
  const d = await t.crew.deleteCatch(c.catch.id);
  const seq = log.map((r) => r.url === FN ? r.body.action : r.method + " " + r.url.replace(/^https:\/\/[^/]+/, ""));
  ok(d.ok && seq[0] === "catch_delete" && seq[1] === "DELETE /rest/v1/catch_logs?id=eq." + c.catch.id && seq[2] === "DELETE /storage/v1/object/catch-photos/u-russ/" + c.catch.id + ".jpg", "deleting a catch unlinks it, then removes the row and the photo", seq);
  ok(!t.crew.cachedTrip("t1").catches.some((x) => x.id === c.catch.id), "and it is off the saved trip");

  // The function refuses the link: dropped and reported, not retried forever.
  const st2 = phoneStore(); signedIn(st2);
  const r2 = tab({ store: st2, net: (req) => req.url === FN && req.body.action === "catch_link" ? { status: 404, body: { error: "That trip is not here any more." } } : req.url.startsWith(REST) ? { status: 201, raw: "" } : server()(req) });
  const refused = await r2.crew.catch("t1", { species: "Squid" });
  ok(refused.error === "That trip is not here any more." && !refused.ok && (await r2.crew.pending()).count === 0, "a catch the function refuses answers with the error and does not wait forever", refused);
}

// ------------------------------------- a token the photo store or sign-in server will not take
{
  // The photo store says "jwt expired" with a 400. That is a token trouble,
  // not a bad photo: one fresh token, one more try, and the photo is kept.
  const st = phoneStore(); signedIn(st);
  const log = []; let tokens = 0;
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" });
  const t = tab({ store: st, net: (req) => {
    if (req.url.startsWith(AUTH + "/token")) { tokens++; return { status: 200, body: { access_token: "tok-2", refresh_token: "ref-2", expires_in: 3600 } }; }
    if (req.url.startsWith(STORE)) { log.push(req.headers.Authorization); return req.headers.Authorization === "Bearer tok-2" ? { status: 200, body: { Key: "x" } } : { status: 400, body: { statusCode: "403", error: "Unauthorized", message: "jwt expired" } }; }
    if (req.url.startsWith(REST)) { log.push(req.body); return { status: 201, raw: "" }; }
    return server()(req);
  } });
  // No canvas in node: hand the client a photo that is already small.
  t.root.document.createElement = (tag) => tag === "img"
    ? { set src(v) { setTimeout(() => this.onload(), 0); }, naturalWidth: 800, naturalHeight: 600 }
    : { getContext: () => ({ drawImage() {} }), toBlob: (cb) => cb(blob) };
  t.root.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
  const c = await t.crew.catch("t1", { species: "Squid", photo: blob });
  ok(c.ok && !c.queued && !c.photoFailed && tokens === 1 && log[0] === "Bearer tok-1" && log[1] === "Bearer tok-2", "a photo refused over the token goes again with a fresh one", { c, tokens, log: log.slice(0, 2) });
  ok(log[2] && /catch-photos\/u-russ\//.test(log[2].photo_url || ""), "and the catch keeps its photo", log[2]);

  // A photo the store truly will not take: the fish is saved without it, and says so.
  const st2 = phoneStore(); signedIn(st2);
  const rows = [];
  const t2 = tab({ store: st2, net: (req) => {
    if (req.url.startsWith(STORE)) return { status: 413, body: { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" } };
    if (req.url.startsWith(REST)) { rows.push(req.body); return { status: 201, raw: "" }; }
    return server()(req);
  } });
  t2.root.document.createElement = t.root.document.createElement;
  t2.root.URL = t.root.URL;
  const c2 = await t2.crew.catch("t1", { species: "Squid", photo: blob });
  ok(c2.ok && c2.photoFailed === true && rows.length === 1 && !("photo_url" in rows[0]), "a photo the store will not take does not cost the fish: saved without it, and it says so", c2);

  // The sign-in server saying the session is gone, on its own endpoint, is believed.
  const st3 = phoneStore(); signedIn(st3);
  const t3 = tab({ store: st3, net: () => ({ status: 403, body: { code: 403, error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" } }) });
  const gone = await t3.crew.addMyNumber("2535550147");
  ok(gone.signedOut === true && t3.crew.session() === null, "the sign-in server saying the session is gone while adding a number signs out", gone);
}

// ------------------------------------------- a sign-in the server cannot read at all
{
  // The sign-in server answers a refresh token it cannot even read with
  // validation_failed. No swap mends that: the person is signed out, and the
  // screen says sign in, not "No signal".
  const store = phoneStore(); signedIn(store, { at: Date.now() - 1000 });
  store.setItem("rig.crew.v1", JSON.stringify(STATE));
  const t = tab({ store, net: (req) => req.url.startsWith(AUTH + "/token") ? { status: 400, body: { code: 400, error_code: "validation_failed", msg: "Invalid Refresh Token" } } : { status: 200, body: clone(STATE) } });
  const r = await t.crew.state({ fresh: true });
  ok(r.signedOut === true && !r.offline && t.crew.session() === null, "validation_failed from the sign-in server signs the person out, it is not No signal", r);
  ok(t.fn().length === 0, "and the dead token was never shown to the crew function");

  // The same word after the crew function said 401.
  const st2 = phoneStore(); signedIn(st2); st2.setItem("rig.crew.v1", JSON.stringify(STATE));
  const t2 = tab({ store: st2, net: (req) => req.url.startsWith(AUTH + "/token") ? { status: 400, body: { error: "validation_failed", error_description: "refresh token is malformed" } } : { status: 401, body: { error: "Sign in first." } } });
  const w = await t2.crew.going("t1", "going");
  ok(w.signedOut === true && t2.crew.session() === null, "a 401, then validation_failed: a write says signed out, not waiting for a signal", w);

  // A validation_failed from the crew function itself is not the sign-in server talking: nobody is signed out.
  const st3 = phoneStore(); signedIn(st3); st3.setItem("rig.crew.v1", JSON.stringify(STATE));
  const t3 = tab({ store: st3, net: (req) => req.url === FN ? { status: 400, body: { error: "That trip id is not valid.", error_code: "validation_failed" } } : { status: 200, body: {} } });
  const g = await t3.crew.state({ fresh: true });
  ok(!g.signedOut && t3.crew.session() !== null, "a 400 from the crew function, whatever its words, signs nobody out", g);
}

// ------------------------------------------------------------------ names
{
  // My own name, with a signal: sent once, trimmed, and what the phone saved follows.
  const st = phoneStore(); signedIn(st);
  st.setItem("rig.crew.v1", JSON.stringify(STATE));
  const log = [];
  const t = tab({ store: st, net: (req) => {
    if (req.url === FN && req.body.action === "me_rename") { log.push(req.body); return { status: 200, body: { ok: true, name: req.body.name } }; }
    if (req.url === FN && req.body.action === "crew_rename") { log.push(req.body); return { status: 403, body: { error: "Only the owner can rename the crew." } }; }
    return server()(req);
  } });
  let heard = 0; t.crew.onChange((w) => { if (w.kind === "queue") heard++; });
  const r = await t.crew.rename("  Russ   B  ");
  ok(r.ok && r.name === "Russ B" && !r.queued, "renaming myself with a signal answers with the name the server took", r);
  ok(log.length === 1 && log[0].action === "me_rename" && log[0].name === "Russ B" && Object.keys(log[0]).sort().join() === "action,name", "it goes up once, as me_rename with the name alone, spaces tidied", log);
  const c = t.crew.cached();
  ok(c.me.name === "Russ B" && c.members.find((m) => m.id === "u-russ").name === "Russ B" && !c.me.waiting, "the saved crew says the new name, in my own row too", c.me);
  ok(t.read("rig.crew.v1").me.name === "Russ B", "and it is kept on the phone");
  ok(heard >= 1, "listeners hear it go");

  // Refused before it is sent: nothing empty, nothing over 60, and a member never renames the crew.
  log.length = 0;
  ok(/name/i.test((await t.crew.rename("   ")).error || ""), "an empty name is refused on the phone");
  ok(/60/.test((await t.crew.rename("x".repeat(61))).error || ""), "a name over 60 characters is refused on the phone");
  ok((await t.crew.rename("y".repeat(60))).ok === true, "60 characters is fine");
  const cr = await t.crew.crewRename("Mine now");
  ok(/only the owner/i.test(cr.error || "") && log.filter((b) => b.action === "crew_rename").length === 0, "a member renaming the crew is told only the owner can, and nothing is sent", cr);

  // The owner renames the crew.
  const so = phoneStore(); signedIn(so, { userId: "u-coach" });
  so.setItem("rig.crew.v1", JSON.stringify(Object.assign(clone(STATE), { me: { id: "u-coach", name: "Coach" }, crew: { id: "c1", name: "ZZTEST crew", role: "owner" } })));
  const olog = [];
  const o = tab({ store: so, net: (req) => {
    if (req.url === FN && req.body.action === "crew_rename") { olog.push(req.body); return { status: 200, body: { ok: true, name: req.body.name } }; }
    return server()(req);
  } });
  const on = await o.crew.crewRename("ZZTEST crew two");
  ok(on.ok && on.name === "ZZTEST crew two" && olog.length === 1 && olog[0].name === "ZZTEST crew two", "the owner renames the crew: crew_rename, once", { on, olog });
  ok(o.crew.cached().crew.name === "ZZTEST crew two" && o.read("rig.crew.v1").crew.name === "ZZTEST crew two", "and the saved crew carries the new name");

  // No signal: the name shows at once as waiting, a second one takes its place, and only the last goes.
  let down = true; const sent = [];
  const sq = phoneStore(); signedIn(sq); sq.setItem("rig.crew.v1", JSON.stringify(STATE));
  const q = tab({ store: sq, net: (req) => {
    if (down) return DOWN;
    if (req.url === FN && req.body.action === "me_rename") { sent.push(req.body.name); return { status: 200, body: { ok: true, name: req.body.name } }; }
    return server()(req);
  } });
  const w1 = await q.crew.rename("Russ");
  ok(w1.ok && w1.queued && w1.name === "Russ", "with no signal a new name waits", w1);
  ok(q.crew.cached().me.name === "Russ" && q.crew.cached().me.waiting === true && q.crew.cached().members.find((m) => m.id === "u-russ").name === "Russ", "and shows at once, marked waiting", q.crew.cached().me);
  await q.crew.rename("Russell B");
  const pend = await q.crew.pending();
  ok(pend.count === 1 && q.crew.cached().me.name === "Russell B", "a second rename takes the place of the first: one waits", pend);
  ok(q.read("rig.crew.v1").me.name === "Russell", "what the server last said is kept apart until it lands");
  down = false;
  const f = await q.crew.flush();
  ok(f.sent === 1 && sent.join() === "Russell B", "when the signal comes back only the last name goes, once", { f, sent });
  ok(q.crew.cached().me.name === "Russell B" && !q.crew.cached().me.waiting && q.read("rig.crew.v1").me.name === "Russell B", "and it is saved as the name");

  // A name the server refuses: said plainly, and the old one comes back.
  const sr = phoneStore(); signedIn(sr); sr.setItem("rig.crew.v1", JSON.stringify(STATE));
  const rf = tab({ store: sr, net: (req) => req.url === FN && req.body.action === "me_rename" ? { status: 400, body: { error: "That name is not allowed." } } : server()(req) });
  const bad = await rf.crew.rename("Russ");
  ok(bad.error === "That name is not allowed." && !bad.ok && bad.status === 400, "a name the server refuses answers with its words", bad);
  ok(rf.crew.cached().me.name === "Russell" && (await rf.crew.pending()).count === 0, "the old name stands, and nothing is left waiting");

  // Refused later, after waiting for a signal: it lands in failed() for the screen to say.
  let dn = true;
  const sl = phoneStore(); signedIn(sl, { userId: "u-coach" });
  sl.setItem("rig.crew.v1", JSON.stringify(Object.assign(clone(STATE), { me: { id: "u-coach", name: "Coach" }, crew: { id: "c1", name: "ZZTEST crew", role: "owner" } })));
  const lt = tab({ store: sl, net: (req) => dn ? DOWN : req.url === FN && req.body.action === "crew_rename" ? { status: 403, body: { error: "Only the owner can rename the crew." } } : server()(req) });
  const lw = await lt.crew.crewRename("Somebody else's");
  ok(lw.queued && lt.crew.cached().crew.name === "Somebody else's", "the crew's new name waits for a signal too", lw);
  let dropped = null; lt.crew.onChange((w) => { if (w.kind === "queue" && w.dropped) dropped = w.dropped; });
  dn = false;
  await lt.crew.flush();
  ok(lt.crew.failed().some((x) => x.kind === "crew_rename" && /only the owner/i.test(x.error)) && dropped && dropped.some((x) => x.kind === "crew_rename"), "refused later, it is reported, not tried forever", lt.crew.failed());
  ok(lt.crew.cached().crew.name === "ZZTEST crew", "and the crew keeps its name");
}

// ------------------------------------------------------------------ signing out
{
  const st = phoneStore(); signedIn(st);
  st.setItem("rig.crew.v1", JSON.stringify(STATE));
  const t = tab({ store: st, net: server() });
  await t.crew.trip("t1", { fresh: true });
  let heard = 0; t.crew.onChange((w) => { if (w.kind === "session") heard++; });
  const r = await t.crew.signOut();
  ok(r.ok && t.crew.session() === null && t.crew.cached() === null && t.crew.cachedTrip("t1") === null, "signing out clears the session and what was saved of the crew", r);
  ok(heard === 1, "and listeners hear it");
}

clearTimeout(watchdog);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
