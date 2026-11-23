// WDFW emergency rules, checked in the background on every load.
//
// The castai-rules edge function (supabase/functions/castai-rules) reads the
// WDFW emergency rules RSS and keeps every rule. This file pulls that list,
// keeps the last copy for the pier with no signal, and answers one question:
// "has WDFW posted something for this water and this fish since we last
// checked the card?" Loose on purpose: a false flag costs one tap on
// "Got it", a missed closure costs a ticket.
(function (root) {
  "use strict";
  var RIG = (root.RIG = root.RIG || {});
  var URL = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-rules";
  var KEY = "rig.rules.v1", ACK = "rig.rules.ack.v1";
  var STALE_MS = 24 * 3600e3;

  // Where each spot shows up in a rule. `named` means the water is named
  // outright, so any rule naming it counts. Marine areas need the fish too,
  // or every crab rule in Area 11 would flag the squid pier.
  var PLACES = {
    // Area numbers must stand alone: "8-2" is not Area 2, "11" is not "12".
    "redondo": { re: /Marine Areas?\b[^.\n]{0,80}?(?<![-.\d])11(?![-.\d])/i },
    "dash-point": { re: /Marine Areas?\b[^.\n]{0,80}?(?<![-.\d])11(?![-.\d])/i },
    "westport": { re: /Marine Areas?\b[^.\n]{0,40}?(?<![-.\d])2(?![.\d]|-1)|Westport|Grays Harbor/i },
    "ocean-shores": { re: /Copalis(?! River)|Mocrocks|Ocean Shores/i },
    "green-river": { re: /Green \(Duwamish\)|Duwamish|Green River \(King/i, named: true },
    "lake-fenwick": { re: /Fenwick/i, named: true },
    "american-lake": { re: /American Lake/i, named: true },
    "lake-tapps": { re: /Lake Tapps/i, named: true }
  };
  var SALMON = /salmon|coho|chinook|\bkings?\b|chum|pinks?\b|steelhead|all species/i;
  var FISH = {
    squid: /squid|all species/i, crab: /crab|shellfish|all species/i, clams: /clam|shellfish|all species/i,
    cutthroat: /cutthroat|trout|game ?fish|all species/i,
    king: SALMON, coho: SALMON, chum: SALMON, pink: SALMON, steelhead: SALMON,
    surfperch: /perch|all species|bottomfish/i,
    perch: /perch|trout|game ?fish|all species/i, bass: /bass|game ?fish|all species/i
  };

  function store() { try { return root.localStorage; } catch (e) { return null; } }
  function read(k, d) { try { var v = store() && store().getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { store() && store().setItem(k, JSON.stringify(v)); } catch (e) { /* full or private: still works this visit */ } }

  function cached() { return read(KEY, null); }
  function acked() { return read(ACK, {}); }
  function ack(link) { var a = acked(); a[link] = Date.now(); write(ACK, a); }

  // Does this rule touch this water and this fish?
  function matches(rule, spot, species) {
    var p = PLACES[spot];
    if (!p) return false;
    var txt = (rule.title || "") + "\n" + (rule.body || "");
    if (!p.re.test(txt)) return false;
    if (p.named) return true;
    var f = FISH[species];
    return !!(f && f.test(txt));
  }

  // New rules for a spot and fish, posted after `since` ("YYYY-MM-DD"),
  // minus the ones already marked read. Newest first.
  function newFor(spot, species, since, data) {
    var d = data || cached();
    if (!d || !d.rules) return [];
    var cut = since ? Date.parse(since + "T00:00:00-08:00") : 0, a = acked();
    return d.rules.filter(function (r) {
      return r.published && Date.parse(r.published) > cut && !a[r.link] && matches(r, spot, species);
    });
  }

  function status(now) {
    var d = cached(), t = now || Date.now();
    if (!d || !d.at) return { at: 0, stale: true, never: true };
    return { at: d.at, checked: d.checked, stale: t - d.at > STALE_MS, never: false };
  }

  var inflight = null;
  function load() {
    if (inflight) return inflight;
    var ctl = root.AbortController ? new root.AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 10000) : null;
    inflight = root.fetch(URL, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (!r.ok) throw new Error("rules " + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !Array.isArray(j.rules)) throw new Error("rules: bad reply");
      var out = { at: Date.now(), checked: j.checked || null, rules: j.rules };
      write(KEY, out);
      return out;
    }).finally(function () { if (timer) clearTimeout(timer); inflight = null; });
    return inflight;
  }

  RIG.rules = { url: URL, places: PLACES, matches: matches, newFor: newFor, status: status,
    load: load, cached: cached, ack: ack, acked: acked, staleMs: STALE_MS };
})(typeof window !== "undefined" ? window : globalThis);
