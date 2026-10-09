(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.CP = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  var DEFAULTS = {
    schema_version: 1, display_name: 'CoachPilot', short_name: 'CoachPilot', logo_url: '/CoachPilot-AppIcon.png',
    colors: { primary: '#1F5F3F', accent: '#1A1F1C', on_primary: '#FFFFFF' },
    contact_email: '', support_email: 'Daniel.Grande@ymail.com', routing: {}, practice_rules: {},
    features: { public_schedule: false, public_standings: false, team_hubs: false }
  };
  var SUPABASE_URL = 'https://geigvuysptjvvqanumld.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlaWd2dXlzcHRqdnZxYW51bWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzIxODIsImV4cCI6MjA5MDgwODE4Mn0.DlzXoU3XUa7kAD9oN6hJ1MBXnC_KxzviqpL2vQxWSX8';
  var GATEWAY = SUPABASE_URL + '/functions/v1/cp-gateway';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function mergeOne(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = isObj(base[k]) ? Object.assign({}, base[k]) : base[k]; });
    if (!isObj(over)) return out;
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      if (v === null || v === undefined) return;
      if (isObj(DEFAULTS[k])) { if (isObj(v)) out[k] = Object.assign({}, out[k] || {}, v); return; }
      if (typeof v === typeof DEFAULTS[k] || DEFAULTS[k] === undefined) out[k] = v;
    });
    return out;
  }
  function mergeBox(leagueBox, teamBox) { return mergeOne(mergeOne(DEFAULTS, leagueBox), teamBox); }
  function parseRoute(pathname) {
    var p = String(pathname || '').replace(/\/+$/, '');
    var m;
    if ((m = p.match(/^\/l\/([a-z0-9-]+)\/t\/([a-z0-9-]+)/))) return { league: m[1], team: m[2], token: null };
    if ((m = p.match(/^\/l\/([a-z0-9-]+)/))) return { league: m[1], team: null, token: null };
    if ((m = p.match(/^\/t\/([a-z0-9-]+)/))) return { league: null, team: m[1], token: null };
    if ((m = p.match(/^\/join\/([A-Za-z0-9]+)/))) return { league: null, team: null, token: m[1] };
    return { league: null, team: null, token: null };
  }

  var api = { DEFAULTS: DEFAULTS, mergeBox: mergeBox, parseRoute: parseRoute };
  if (!root || !root.document) return api; // Node: pure functions only

  var _client = null;
  api.client = function () { if (!_client) _client = root.supabase.createClient(SUPABASE_URL, ANON, { auth: { persistSession: true, autoRefreshToken: true } }); return _client; };
  api.session = function () { return api.client().auth.getSession().then(function (r) { return r.data.session; }); };
  api.requireSession = function () { return api.session().then(function (s) { if (!s) { root.location.href = '/signin?next=' + encodeURIComponent(root.location.pathname); return null; } return s; }); };
  api.hats = function () { return api.client().from('cp_my_hats').select('*').then(function (r) { return r.data || []; }); };
  api.route = function () { return parseRoute(root.location.pathname); };
  api.gateway = function (action, body) {
    return api.session().then(function (s) {
      return fetch(GATEWAY + '?action=' + encodeURIComponent(action), { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', apikey: ANON }, s ? { Authorization: 'Bearer ' + s.access_token } : {}), body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    });
  };
  api.paint = function (box) {
    var b = mergeBox(box, null);
    var cs = root.document.documentElement.style;
    cs.setProperty('--cp-primary', b.colors.primary); cs.setProperty('--cp-accent', b.colors.accent); cs.setProperty('--cp-on-primary', b.colors.on_primary);
    root.document.title = b.display_name + ' | CoachPilot';
    root.document.querySelectorAll('[data-cp-name]').forEach(function (el) { el.textContent = b.display_name; });
    root.document.querySelectorAll('img[data-cp-logo]').forEach(function (el) { el.src = b.logo_url; el.alt = b.display_name; });
    return b;
  };
  api.loadLeague = function (slug) { return api.client().from('cp_leagues').select('*').eq('slug', slug).maybeSingle().then(function (r) { return r.data; }); };
  api.loadTeam = function (leagueSlug, teamSlug) {
    var p = leagueSlug ? api.loadLeague(leagueSlug) : Promise.resolve(null);
    return p.then(function (league) {
      if (leagueSlug && !league) return null;
      var q = api.client().from('cp_teams').select('*, cp_leagues(*)').eq('slug', teamSlug);
      q = leagueSlug ? q.eq('league_id', league.id) : q.is('league_id', null);
      return q.maybeSingle().then(function (r) { return r.data; });
    });
  };
  api.signOut = function () { return api.client().auth.signOut().then(function () { root.location.href = '/signin'; }); };
  return api;
});
