/* BLS Website Build board.
   Page states, feedback, approvals and spot pins for the website preview (go.blslittleleague.org/bls/preview/).
   One shared link for everyone: people pick their name from the board roster ("Who are you?"), remembered on the device.
   Vanilla JS, no external scripts. Talks to the bls-board function. When it is down the preview still works.
   Each built page sets window.BLSB = {base, page, variant, index, pages: {slug: {t, req}}} before this file loads. */
(function () {
  'use strict';
  if (window.__blsbLoaded) return;
  window.__blsbLoaded = true;

  var CFG = window.BLSB || {};
  var API = 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/bls-board';
  var BASE = String(CFG.base || 'https://go.blslittleleague.org/bls/preview').replace(/\/+$/, '');
  var PAGE = CFG.page || null;
  var VARIANT = CFG.variant || null;
  var IS_INDEX = !!CFG.index;
  var TEST = /[?&]boardtest(=|&|$)/.test(location.search); // QA only: also show ZZTEST rows
  var META = CFG.pages || {};
  var ADMIN_NAME = 'Daniel (Website)';
  var MAX_BODY = 4000;
  var DESK = window.matchMedia ? window.matchMedia('(min-width: 900px)') : { matches: false };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var STATES = {
    building: { label: 'Building', mean: 'Daniel is still working on this page.' },
    waiting: { label: 'Waiting on info', mean: 'Needs facts before it can be finished.' },
    review: { label: 'Board review', mean: 'Look it over. Approve, suggest a change, or raise a concern.' },
    ready: { label: 'Ready to deploy', mean: 'Final check done. Scheduled for the next update in 48 hours unless a concern is raised.' },
    hold: { label: 'On hold', mean: 'Countdown paused while Daniel looks at a concern.' },
    scheduled: { label: 'Scheduled', mean: 'In the next update to the live site.' },
    live: { label: 'Live', mean: 'Live on blslittleleague.org.' }
  };
  var ORDER = ['building', 'waiting', 'review', 'ready', 'hold', 'scheduled', 'live'];
  // short words for phase chips and phase summaries
  var SHORT = { building: 'Building', waiting: 'Waiting', review: 'Review', ready: 'Ready', hold: 'On hold', scheduled: 'Scheduled', live: 'Live' };
  var SUMW = { building: 'building', waiting: 'waiting on info', review: 'in board review', ready: 'ready', hold: 'on hold', scheduled: 'scheduled', live: 'live' };
  var PUBLIC_EMAIL = 'Everyone on the board can read it. Daniel also gets an email.';
  var KINDS = {
    comment: { label: 'Comment', badge: 'Comment', hint: 'Everyone on the board can read it.', ph: 'Your comment' },
    suggestion: { label: 'Suggestion', badge: 'Suggestion', hint: 'A change idea. ' + PUBLIC_EMAIL, ph: 'What should change?' },
    concern: { label: 'Concern', badge: 'Concern', hint: 'Something wrong or blocking. ' + PUBLIC_EMAIL, ph: 'What is wrong or blocking?' },
    help: { label: 'I can help', badge: 'Can help', hint: 'Offer to help. ' + PUBLIC_EMAIL, ph: 'How can you help?' },
    private: { label: 'Private', badge: 'Private', hint: 'Only Daniel sees this. He gets an email.', ph: 'Your message to Daniel' },
    approve: { label: 'Approve', badge: 'Approved' }
  };
  var STATUS = { resolved: 'Resolved', accepted: 'Will change', declined: 'Keep as is' };

  // ---------- small helpers ----------
  function store(kind) {
    return {
      get: function (k) { try { return window[kind].getItem(k) || ''; } catch (e) { return ''; } },
      set: function (k, v) { try { if (v) window[kind].setItem(k, v); else window[kind].removeItem(k); } catch (e) { /* storage blocked */ } }
    };
  }
  var LS = store('localStorage');
  var SS = store('sessionStorage');

  var PROPS = { value: 1, checked: 1, disabled: 1, hidden: 1, selected: 1, open: 1 };
  function h(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (PROPS[k]) e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    add(e, kids);
    return e;
  }
  function add(e, kids) {
    if (kids == null || kids === false) return e;
    if (Array.isArray(kids)) { kids.forEach(function (c) { add(e, c); }); return e; }
    e.appendChild(typeof kids === 'string' || typeof kids === 'number' ? document.createTextNode(String(kids)) : kids);
    return e;
  }
  function clear(e) { while (e && e.firstChild) e.removeChild(e.firstChild); return e; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var uidN = 0;
  function uid(p) { uidN += 1; return (p || 'blsb') + uidN; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function lc(s) { return String(s || '').trim().toLowerCase(); }
  function clean(s) { return String(s || '').replace(/\s*\u2014\s*/g, ', ').replace(/\u2013/g, '-'); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : null; }

  function icon(name) {
    var NS = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '20'); s.setAttribute('height', '20');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2.4');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('d', name === 'x' ? 'M6 6l12 12M18 6L6 18' : 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z');
    s.appendChild(p);
    return s;
  }

  // ---------- dates and countdowns ----------
  function parseDay(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDay(d) {
    var x = parseDay(d);
    if (!x) return '';
    var s = MON[x.getMonth()] + ' ' + x.getDate();
    return x.getFullYear() !== new Date().getFullYear() ? s + ', ' + x.getFullYear() : s;
  }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function ago(iso) {
    var t = Date.parse(iso);
    if (!t) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    if (s < 172800) return 'yesterday';
    var d = new Date(t);
    var out = MON[d.getMonth()] + ' ' + d.getDate();
    return d.getFullYear() !== new Date().getFullYear() ? out + ', ' + d.getFullYear() : out;
  }
  function fullTime(iso) {
    var t = Date.parse(iso);
    if (!t) return '';
    var d = new Date(t), hr = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + ((hr % 12) || 12) + ':' + m + (hr < 12 ? ' AM' : ' PM');
  }
  function parts(ms) {
    ms = Math.max(0, ms || 0);
    return { d: Math.floor(ms / 86400000), h: Math.floor((ms % 86400000) / 3600000), m: Math.floor((ms % 3600000) / 60000) };
  }
  function fmtShort(ms) {
    var p = parts(ms);
    if (p.d) return p.d + 'd ' + p.h + 'h';
    if (p.h) return p.h + 'h ' + p.m + 'm';
    return p.m ? p.m + 'm' : 'under 1m';
  }
  function fmtLong(ms) {
    var p = parts(ms);
    if (p.d) return plural(p.d, 'day') + (p.h ? ' ' + plural(p.h, 'hour') : '');
    if (p.h) return plural(p.h, 'hour') + (p.m ? ' ' + plural(p.m, 'minute') : '');
    return p.m ? plural(p.m, 'minute') : 'less than a minute';
  }

  // ---------- state ----------
  var S = {
    d: null, at: 0, off: false, first: true, admin: false,
    pin: SS.get('blsb_pin'), name: LS.get('blsb_name'), role: LS.get('blsb_role'),
    open: {}, pending: false, expiring: false, people: null
  };
  var ROOT = null;

  function pages() { return (S.d && S.d.pages) || []; }
  function pageOf(slug) {
    for (var i = 0, a = pages(); i < a.length; i++) if (a[i].slug === slug) return a[i];
    return null;
  }
  function phases() {
    return ((S.d && S.d.phases) || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || String(a.name).localeCompare(String(b.name)); });
  }
  function phaseOf(id) {
    if (!id) return null;
    for (var i = 0, a = phases(); i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }
  function items() { return (S.d && S.d.items) || []; }
  function titleOf(slug) {
    if (slug == null) return 'Board discussion';
    var p = pageOf(slug);
    return (p && p.title) || (META[slug] && META[slug].t) || slug;
  }
  function stKey(p) { return p && STATES[p.state] ? p.state : 'review'; }
  function running(p) { return !!p && p.state === 'ready' && p.remaining_ms != null; }
  function remaining(p) {
    if (!p || p.remaining_ms == null) return null;
    return Math.max(0, Number(p.remaining_ms) - (running(p) ? Date.now() - S.at : 0));
  }
  function byNew(a, b) { return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0); }
  function byOld(a, b) { return -byNew(a, b); }
  function topItems(slug) {
    var key = slug == null ? null : slug;
    return items().filter(function (i) {
      return !i.parent_id && !i.hidden && (i.slug == null ? null : i.slug) === key && (i.kind !== 'private' || S.admin);
    }).sort(byNew);
  }
  function repliesOf(id) {
    return items().filter(function (i) { return i.parent_id === id && !i.hidden; }).sort(byOld);
  }
  function countsOf(p) {
    if (p && p.counts) return p.counts;
    var c = { approve: 0, comment: 0, suggestion: 0, concern: 0, help: 0, open: 0, open_concern: 0, open_suggestion: 0 };
    topItems(p && p.slug).forEach(function (i) {
      if (c[i.kind] != null) c[i.kind] += 1;
      if ((i.kind === 'concern' || i.kind === 'suggestion') && i.status === 'open') { c.open += 1; c['open_' + i.kind] += 1; }
    });
    return c;
  }
  function approversOf(p) { return (p && p.approvers) || []; }
  function iApproved(p) {
    var me = lc(S.name);
    return !!me && approversOf(p).some(function (n) { return lc(n) === me; });
  }
  // One counting rule everywhere (bar badge, sheet heading, card): top-level items except approvals.
  function discussionCount(slug) {
    return topItems(slug).filter(function (i) { return i.kind !== 'approve'; }).length;
  }
  function openParts(p) {
    var c = countsOf(p);
    if (c.open_concern != null && c.open_suggestion != null) return { concern: c.open_concern, suggestion: c.open_suggestion };
    var o = { concern: 0, suggestion: 0 };
    topItems(p && p.slug).forEach(function (i) { if (i.status === 'open' && o[i.kind] != null) o[i.kind] += 1; });
    return o;
  }
  // "1 open concern", "2 open suggestions", or "3 waiting on Daniel" when both kinds are open
  function openText(p) {
    var o = openParts(p);
    if (o.concern && o.suggestion) return (o.concern + o.suggestion) + ' waiting on Daniel';
    if (o.concern) return plural(o.concern, 'open concern');
    if (o.suggestion) return plural(o.suggestion, 'open suggestion');
    return '';
  }
  function approvalText(n) { return n ? plural(n, 'approval') : 'No approvals yet'; }
  // Spot pins remember the screen width they were dropped on; a pin only draws in the same width class,
  // because the page reflows between a phone and a computer. Older pins (no width) draw everywhere.
  function wClass(w) { return w < 700 ? 'phone' : 'desk'; }
  function myClass() { return wClass(window.innerWidth || document.documentElement.clientWidth || 0); }
  function pinFits(i) { return i.pin_w == null || wClass(Number(i.pin_w)) === myClass(); }
  function pinsOff() { return SS.get('blsb_pins') === 'off'; }
  function pinItems(slug, variant) {
    return topItems(slug).filter(function (i) {
      return i.variant === variant && i.pin_x != null && i.pin_y != null && isFinite(i.pin_x) && isFinite(i.pin_y);
    }).sort(byOld);
  }
  function pinNumber(item) {
    var list = pinItems(item.slug, item.variant);
    for (var i = 0; i < list.length; i++) if (list[i].id === item.id) return i + 1;
    return 0;
  }

  // ---------- network ----------
  function api(action, body, method) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
    var opt = { method: method || (body ? 'POST' : 'GET'), headers: {}, cache: 'no-store' };
    if (ctl) opt.signal = ctl.signal;
    if (S.pin) opt.headers['x-admin-pin'] = S.pin;
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    var q = action.split('&');
    return fetch(API + '?action=' + encodeURIComponent(q[0]) + (q[1] ? '&' + q[1] : ''), opt).then(function (r) {
      return r.text().then(function (txt) {
        var j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = {}; }
        if (timer) clearTimeout(timer);
        if (!r.ok || j.ok === false) {
          var err = new Error(j.error || j.message || ('HTTP ' + r.status));
          err.status = r.status; err.body = j;
          throw err;
        }
        return j;
      });
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function errText(e) {
    if (!e || !e.status) return 'Could not reach the board. Check your connection and try again.';
    var m = e.body && (e.body.error || e.body.message);
    if (e.status === 429) return m && String(m).length < 160 ? clean(m) : 'Too many tries from here. Please try again later.';
    if (e.status === 401 || e.status === 403) return 'That needs the admin PIN.';
    return m && String(m).length < 160 ? clean(m) : 'That did not go through. Please try again.';
  }

  var loading = null, loadingPin = '';
  function load() {
    // a load already in flight with a different PIN (Daniel just unlocked or left admin) is stale: load again after it
    if (loading) return loadingPin === S.pin ? loading : loading.then(function () { return load(); });
    var q = TEST ? 'state&test=1' : 'state';
    var sent = S.pin;
    loadingPin = sent;
    function got(d) {
      if (sent !== S.pin) return; // the PIN changed while this was loading; the newer answer wins
      S.d = d || {};
      S.at = Date.now();
      S.off = false;
      S.admin = !!(d && d.viewer && d.viewer.admin);
      if (S.pin && !S.admin) { S.pin = ''; SS.set('blsb_pin', ''); toast('Admin PIN did not work. Admin mode is off.'); }
      if (document.documentElement) document.documentElement.classList.add('blsb-live');
    }
    loading = api(q).then(got, function (e) {
      if (sent !== S.pin) return;
      // A wrong PIN is 401 and too many wrong PINs is 429: drop the PIN and load the board as everyone sees it.
      if (sent && e && (e.status === 401 || e.status === 429)) {
        S.pin = ''; SS.set('blsb_pin', ''); S.admin = false; sent = ''; loadingPin = '';
        toast(e.status === 429 ? 'Too many wrong PIN tries. Admin mode is off for now.' : 'Admin PIN did not work. Admin mode is off.');
        return api(q).then(got, function () { S.off = true; });
      }
      S.off = true;
    }).then(function () {
      loading = null;
      S.first = false;
      renderAll();
    });
    return loading;
  }

  // ---------- render guards (never wipe what someone is typing) ----------
  function guarded(box) {
    if (!box) return true;
    var a = document.activeElement;
    if (a && box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { S.pending = true; return true; }
    if (box.querySelector('.blsb-dirty')) { S.pending = true; return true; }
    return false;
  }
  function trackDirty(el, orig) {
    el.addEventListener('input', function () { el.classList.toggle('blsb-dirty', String(el.value) !== String(orig == null ? '' : orig)); });
    el.addEventListener('change', function () { el.classList.toggle('blsb-dirty', String(el.value) !== String(orig == null ? '' : orig)); });
    return el;
  }

  function renderAll() {
    if (PAGE) { renderBar(); renderPins(); }
    if (IS_INDEX) renderIndex();
    renderWho();
    if (SH.open) renderSheet();
    if (WHO.open) renderWhoList();
    tick();
  }

  // ---------- shared pieces ----------
  function chip(p, extra) {
    var st = stKey(p);
    var c = h('span', { class: 'blsb-chip blsb-s-' + st + (extra ? ' ' + extra : '') }, [
      h('span', { class: 'blsb-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'blsb-chip-t', text: STATES[st].label })
    ]);
    if ((st === 'ready' || st === 'hold') && p.remaining_ms != null) {
      c.appendChild(h('span', { class: 'blsb-chip-sep', 'aria-hidden': 'true', text: '·' }));
      c.appendChild(h('span', { class: 'blsb-chip-cd', 'data-cd': p.slug, 'data-fmt': st === 'hold' ? 'shortleft' : 'short' }));
    }
    return c;
  }
  function cdSpan(p, fmt) { return h('span', { class: 'blsb-cd', 'data-cd': p.slug, 'data-fmt': fmt || 'long' }); }

  function meaningEl(p) {
    var st = stKey(p), s = h('span', { class: 'blsb-mean-t' });
    var rem = remaining(p);
    if (st === 'ready') {
      if (rem == null) add(s, STATES.ready.mean);
      else add(s, ['Final check done. Scheduled for the next update in ', cdSpan(p, 'long'), ' unless a concern is raised.']);
    } else if (st === 'hold') {
      add(s, STATES.hold.mean);
      if (rem != null) add(s, [' Paused with ', cdSpan(p, 'long'), ' left.']);
    } else if (st === 'scheduled') {
      var ph = phaseOf(p.phase_id);
      add(s, ph ? 'In the next update to the live site: ' + ph.name + (ph.target_date ? ', target ' + fmtDay(ph.target_date) : '') + '.' : STATES.scheduled.mean);
    } else if (st === 'live') {
      add(s, 'Live on blslittleleague.org' + (p.live_since ? ' since ' + fmtDay(p.live_since) : '') + '.');
      var u = safeUrl(p.live_url);
      if (u) add(s, [' ', h('a', { class: 'blsb-link', href: u, target: '_blank', rel: 'noopener', text: 'See it live' })]);
    } else if (st === 'waiting') {
      add(s, STATES.waiting.mean + (p.due_date ? ' Due ' + fmtDay(p.due_date) + '.' : ''));
    } else if (st === 'review') {
      add(s, STATES.review.mean + (p.due_date ? ' Review by ' + fmtDay(p.due_date) + '.' : ''));
    } else {
      add(s, STATES[st].mean);
    }
    return s;
  }
  function phaseLabel(p) {
    var ph = phaseOf(p && p.phase_id);
    if (!ph) return '';
    return ph.name + (ph.target_date ? ', target ' + fmtDay(ph.target_date) : '');
  }

  function tick() {
    var now = Date.now();
    $$('[data-cd]').forEach(function (el) {
      var p = pageOf(el.getAttribute('data-cd'));
      var rem = remaining(p);
      if (rem == null) { el.textContent = ''; return; }
      var f = el.getAttribute('data-fmt');
      var t = f === 'long' ? fmtLong(rem) : fmtShort(rem) + (f === 'shortleft' ? ' left' : '');
      if (el.textContent !== t) el.textContent = t;
    });
    if (!S.expiring && pages().some(function (p) { return running(p) && remaining(p) <= 0; })) {
      S.expiring = true;
      setTimeout(function () { load().then(function () { setTimeout(function () { S.expiring = false; }, 30000); }); }, 3000);
    }
    return now;
  }

  // ---------- toast ----------
  var toastEl = null, toastT = null;
  function toast(msg) {
    if (!ROOT) return;
    if (!toastEl) toastEl = h('div', { class: 'blsb-toast', role: 'status', 'aria-live': 'polite' });
    ROOT.appendChild(toastEl); // always last, so it sits above any sheet or scrim opened after it
    toastEl.textContent = msg;
    toastEl.classList.add('blsb-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('blsb-on'); }, 3200);
  }

  // ---------- who line ----------
  function whoLine(where) {
    var box = h('div', { class: 'blsb-who-line' + (where ? ' blsb-who-' + where : '') + (!S.admin && !S.name ? ' blsb-who-none' : '') });
    if (S.admin) {
      add(box, [h('span', { text: 'Admin mode: posting as ' }), h('b', { text: ADMIN_NAME }), ' ',
        h('button', { type: 'button', class: 'blsb-linkbtn blsb-hit', text: 'Leave admin', onclick: leaveAdmin })]);
    } else if (S.name) {
      add(box, [h('span', { text: 'Giving feedback as ' }), h('b', { text: S.name + (S.role ? ', ' + S.role : '') }), ' ',
        h('button', { type: 'button', class: 'blsb-linkbtn blsb-hit', text: 'Change', 'aria-label': 'Change who you are', onclick: function () { openWho(null); } })]);
    } else {
      add(box, [h('button', { type: 'button', class: 'blsb-linkbtn blsb-strong', text: 'Who are you?', onclick: function () { openWho(null); } }),
        h('span', { text: ' Pick your name before you comment.' })]);
    }
    return box;
  }
  function renderWho() {
    $$('[data-blsb-who]').forEach(function (slot) { clear(slot); slot.appendChild(whoLine(slot.getAttribute('data-blsb-who'))); });
  }
  function leaveAdmin() {
    S.pin = ''; SS.set('blsb_pin', ''); S.admin = false;
    toast('Admin mode is off.');
    renderAll(); load();
  }

  // ---------- dialogs (sheet on phone, panel or modal on desktop) ----------
  var stack = [];
  var lockY = null;
  function lockScroll() {
    var need = stack.some(function (d) { return d.modal(); });
    var de = document.documentElement, was = de.classList.contains('blsb-lock');
    if (need && !was) lockY = window.pageYOffset;
    de.classList.toggle('blsb-lock', need);
    if (!need && was && lockY != null && Math.abs(window.pageYOffset - lockY) > 2) window.scrollTo(0, lockY);
    if (!need) lockY = null;
  }
  function makeDialog(o) {
    var d = { open: false, opener: null };
    d.title = h('div', { class: 'blsb-dlg-title', id: uid('blsbT') });
    d.kicker = h('div', { class: 'blsb-kicker', text: o.kicker || '' });
    d.closeBtn = h('button', { type: 'button', class: 'blsb-x', 'aria-label': 'Close' }, [icon('x')]);
    d.closeBtn.addEventListener('click', function () { d.close(); });
    d.body = h('div', { class: 'blsb-dlg-body' });
    d.scrim = h('div', { class: 'blsb-scrim', hidden: true });
    d.scrim.addEventListener('click', function () { d.close(); });
    d.panel = h('div', { class: 'blsb-dlg ' + (o.cls || ''), role: 'dialog', 'aria-labelledby': d.title.id, tabindex: '-1', hidden: true }, [
      h('div', { class: 'blsb-dlg-head' }, [h('div', { class: 'blsb-grab', 'aria-hidden': 'true' }), h('div', { class: 'blsb-dlg-tt' }, [d.kicker, d.title]), d.closeBtn]),
      d.body
    ]);
    d.modal = function () { return o.side ? !DESK.matches : true; };
    d.show = function () {
      if (!d.open) {
        d.opener = document.activeElement;
        ROOT.appendChild(d.scrim); ROOT.appendChild(d.panel);
        if (toastEl && toastEl.parentNode === ROOT) ROOT.appendChild(toastEl); // a toast stays above the new scrim
        d.scrim.hidden = false; d.panel.hidden = false;
        d.open = true;
        stack.push(d);
      }
      var modal = d.modal();
      d.panel.setAttribute('aria-modal', modal ? 'true' : 'false');
      d.scrim.classList.toggle('blsb-scrim-clear', !modal);
      lockScroll();
      requestAnimationFrame(function () { requestAnimationFrame(function () { d.scrim.classList.add('blsb-on'); d.panel.classList.add('blsb-on'); }); });
      setTimeout(function () { try { d.panel.focus({ preventScroll: true }); } catch (e) { d.panel.focus(); } }, 60);
    };
    d.close = function () {
      if (!d.open) return;
      d.open = false;
      stack = stack.filter(function (x) { return x !== d; });
      d.scrim.classList.remove('blsb-on'); d.panel.classList.remove('blsb-on');
      lockScroll();
      setTimeout(function () { if (!d.open) { d.scrim.hidden = true; d.panel.hidden = true; } }, 260);
      if (o.onclose) o.onclose();
      var op = d.opener;
      if (op && op.focus && document.contains(op)) { try { op.focus({ preventScroll: true }); } catch (e) { op.focus(); } }
    };
    return d;
  }
  function onKey(ev) {
    if (PINMODE.on && ev.key === 'Escape') { endPinMode(true); return; }
    var top = stack[stack.length - 1];
    if (!top) return;
    if (ev.key === 'Escape') { ev.preventDefault(); top.close(); return; }
    if (ev.key === 'Tab' && top.modal()) {
      var f = $$('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])', top.panel).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === top.panel)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }

  // ---------- "Who are you?" ----------
  var WHO = { dlg: null, open: false, then: null, why: null };
  // why: 'comment' or 'approval' when the picker opened because someone tapped Send or Approve
  function openWho(then, why) {
    if (S.admin) { if (then) then(); return; }
    WHO.then = then || null;
    WHO.why = then ? (why || 'comment') : null;
    if (!WHO.dlg) {
      WHO.dlg = makeDialog({ cls: 'blsb-who', kicker: 'BLS Website Build', onclose: function () { WHO.open = false; WHO.then = null; } });
      WHO.dlg.title.textContent = 'Who are you?';
    }
    WHO.open = true;
    WHO.other = false;
    renderWhoList();
    WHO.dlg.show();
  }
  function pickName(name, role) {
    S.name = String(name).trim(); S.role = String(role || '').trim();
    LS.set('blsb_name', S.name); LS.set('blsb_role', S.role);
    var then = WHO.then;
    WHO.then = null;
    WHO.dlg.close();
    toast('Thanks, ' + S.name.split(' ')[0] + '.');
    renderAll();
    if (then) setTimeout(then, 30);
  }
  function renderWhoList() {
    var b = clear(WHO.dlg.body);
    var sub = !WHO.then ? 'Pick your name so Daniel knows who said what. This phone or computer will remember it.'
      : WHO.why === 'approval' ? 'Pick your name and your approval is saved. This phone or computer will remember it.'
      : 'Pick your name and your comment sends. This phone or computer will remember it.';
    add(b, h('p', { class: 'blsb-sub', text: sub }));
    var people = (S.d && S.d.people) || [];
    var list = h('div', { class: 'blsb-people' });
    people.forEach(function (p) {
      var cur = lc(p.name) === lc(S.name);
      list.appendChild(h('button', { type: 'button', class: 'blsb-person' + (cur ? ' blsb-cur' : ''), 'aria-pressed': cur ? 'true' : 'false', onclick: function () { pickName(p.name, p.role); } }, [
        h('span', { class: 'blsb-person-n', text: p.name }), p.role ? h('span', { class: 'blsb-person-r', text: p.role }) : null
      ]));
    });
    if (!people.length) add(b, h('p', { class: 'blsb-muted', text: S.off ? 'The board list is offline right now. You can still type your name.' : 'Type your name below.' }));
    var otherBtn = h('button', { type: 'button', class: 'blsb-person blsb-person-other', 'aria-expanded': WHO.other || !people.length ? 'true' : 'false' }, [
      h('span', { class: 'blsb-person-n', text: 'Someone else' }), h('span', { class: 'blsb-person-r', text: 'Type your name' })
    ]);
    list.appendChild(otherBtn);
    add(b, list);
    var nId = uid(), rId = uid();
    var nIn = h('input', { id: nId, class: 'blsb-in', type: 'text', maxlength: '80', autocomplete: 'name', value: people.some(function (p) { return lc(p.name) === lc(S.name); }) ? '' : S.name });
    var rIn = h('input', { id: rId, class: 'blsb-in', type: 'text', maxlength: '80', autocomplete: 'organization-title', value: people.some(function (p) { return lc(p.name) === lc(S.name); }) ? '' : S.role });
    var err = h('p', { class: 'blsb-msg blsb-err', role: 'alert' });
    var form = h('form', { class: 'blsb-other', hidden: !(WHO.other || !people.length), novalidate: true }, [
      h('label', { class: 'blsb-label', for: nId, text: 'Your name' }), nIn,
      h('label', { class: 'blsb-label', for: rId, text: 'Your role (optional)' }), rIn,
      err,
      h('button', { type: 'submit', class: 'blsb-btn blsb-pri blsb-wide', text: 'Continue' })
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = nIn.value.trim().replace(/\s+/g, ' ');
      if (n.length < 2 || n.length > 80) { err.textContent = 'Please type your name (2 to 80 characters).'; nIn.focus(); return; }
      if (/\(\s*website\s*\)/i.test(n) || /^daniel\s*\(/i.test(n)) { err.textContent = 'Please use your own name.'; nIn.focus(); return; }
      if (/https?:\/\/|www\./i.test(n + ' ' + rIn.value)) { err.textContent = 'Names and roles cannot have links.'; nIn.focus(); return; }
      pickName(n, rIn.value.trim().slice(0, 80));
    });
    otherBtn.addEventListener('click', function () {
      WHO.other = true; form.hidden = false; otherBtn.setAttribute('aria-expanded', 'true');
      setTimeout(function () { nIn.focus(); form.scrollIntoView({ block: 'nearest' }); }, 30);
    });
    add(b, form);
    if (S.name) {
      add(b, h('p', { class: 'blsb-muted blsb-center' }, [h('button', { type: 'button', class: 'blsb-linkbtn', text: 'Forget my name on this device', onclick: function () {
        S.name = ''; S.role = ''; LS.set('blsb_name', ''); LS.set('blsb_role', ''); renderAll(); toast('Your name is cleared on this device.');
      } })]));
    }
  }

  // ---------- admin PIN ----------
  var PINDLG = null;
  function openPin() {
    if (!PINDLG) {
      PINDLG = makeDialog({ cls: 'blsb-pindlg', kicker: 'BLS Website Build' });
      PINDLG.title.textContent = 'Admin';
    }
    var b = clear(PINDLG.body);
    var id = uid();
    var inp = h('input', { id: id, class: 'blsb-in blsb-pin-in', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '64' });
    var err = h('p', { class: 'blsb-msg blsb-err', role: 'alert' });
    var go = h('button', { type: 'submit', class: 'blsb-btn blsb-pri blsb-wide', text: 'Unlock' });
    var form = h('form', { class: 'blsb-pinform', novalidate: true }, [
      h('p', { class: 'blsb-sub', text: 'For Daniel only. Admin mode adds page controls and the inbox.' }),
      h('label', { class: 'blsb-label', for: id, text: 'Board tools PIN' }), inp, err, go,
      h('p', { class: 'blsb-muted blsb-center' }, [h('button', { type: 'button', class: 'blsb-linkbtn', text: 'Not Daniel? Close this', onclick: function () { PINDLG.close(); } })])
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = inp.value.trim();
      if (!v) { err.textContent = 'Type the PIN.'; inp.focus(); return; }
      go.disabled = true; go.textContent = 'Checking...';
      var keep = S.pin;
      S.pin = v;
      api(TEST ? 'state&test=1' : 'state').then(function (d) {
        if (d && d.viewer && d.viewer.admin) {
          SS.set('blsb_pin', v);
          S.d = d; S.at = Date.now(); S.off = false; S.admin = true;
          PINDLG.close();
          toast('Admin mode is on.');
          renderAll();
          deepLink(); // an email link (#blsb=<id>) can point at a private item that only loads with the PIN
        } else {
          S.pin = keep;
          err.textContent = 'That PIN did not work.';
          inp.select();
        }
      }, function (e) {
        S.pin = keep;
        err.textContent = !e || !e.status ? 'Could not reach the board. Try again in a minute.' : e.status === 429 ? errText(e) : 'That PIN did not work.';
      }).then(function () { go.disabled = false; go.textContent = 'Unlock'; });
    });
    add(b, form);
    PINDLG.show();
    setTimeout(function () { inp.focus(); }, 120);
  }

  // ---------- composer ----------
  function Composer(o) {
    var c = { slug: o.slug == null ? null : o.slug, kind: o.kinds[0], reply: null, req: null, spot: null };
    var btns = {};
    var kindsEl = null;
    if (o.kinds.length > 1) {
      kindsEl = h('div', { class: 'blsb-kinds', role: 'group', 'aria-label': 'What kind of feedback' });
      o.kinds.forEach(function (k) {
        var b = h('button', { type: 'button', class: 'blsb-kind blsb-k-' + k, 'aria-pressed': 'false', text: KINDS[k].label });
        b.addEventListener('click', function () { c.setKind(k); ta.focus(); });
        btns[k] = b;
        kindsEl.appendChild(b);
      });
    }
    var hint = h('p', { class: 'blsb-hint' });
    var ctx = h('div', { class: 'blsb-ctx' });
    var taId = uid();
    var ta = h('textarea', { id: taId, class: 'blsb-ta', rows: '4', maxlength: String(MAX_BODY) });
    var lab = h('label', { class: o.showLabel ? 'blsb-label' : 'blsb-sr', for: taId, text: o.label || 'Your message' });
    var spotBtn = o.spot ? h('button', { type: 'button', class: 'blsb-btn blsb-ghost', text: 'Comment on a spot' }) : null;
    if (spotBtn) spotBtn.addEventListener('click', function () { startPinMode(c); });
    var send = h('button', { type: 'button', class: 'blsb-btn blsb-pri', text: o.sendText || 'Send' });
    send.addEventListener('click', function () { c.send(); });
    var msg = h('p', { class: 'blsb-msg', role: 'status', 'aria-live': 'polite' });
    var row = h('div', { class: 'blsb-comp-row' }, [spotBtn, send]);
    c.el = h('div', { class: 'blsb-comp' }, [kindsEl, lab, hint, ctx, ta, row, o.note ? h('p', { class: 'blsb-muted blsb-small', text: o.note }) : null, msg]);
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); c.send(); } });
    ta.addEventListener('input', function () { if (msg.classList.contains('blsb-err')) say(''); });

    function say(t, bad) { msg.textContent = t || ''; msg.classList.toggle('blsb-err', !!bad); }
    c.say = say;
    c.focus = function () { try { ta.focus({ preventScroll: false }); } catch (e) { ta.focus(); } };
    c.setKind = function (k) { if (o.kinds.indexOf(k) >= 0) c.kind = k; if (k !== 'help') c.req = null; c.refresh(); };
    c.setReply = function (item) { c.reply = item ? { id: item.id, name: item.author_name, kind: item.kind } : null; c.refresh(); if (item) c.focus(); };
    c.setReq = function (text) { c.req = text || null; if (text) c.kind = 'help'; c.refresh(); };
    c.setSpot = function (spot) { c.spot = spot; c.refresh(); };
    c.refresh = function () {
      var p = c.slug != null ? pageOf(c.slug) : null;
      var ready = p && (p.state === 'ready');
      // Daniel only posts plain comments (his posts show as Daniel (Website)); the other kinds are for the board.
      var adminPlain = S.admin && o.kinds.indexOf('comment') >= 0;
      if (adminPlain && c.kind !== 'comment') { c.kind = 'comment'; c.req = null; }
      Object.keys(btns).forEach(function (k) { btns[k].setAttribute('aria-pressed', k === c.kind ? 'true' : 'false'); });
      if (kindsEl) kindsEl.hidden = !!c.reply || adminPlain;
      var kh = KINDS[c.kind] || KINDS.comment;
      var t = kh.hint;
      if (ready && c.kind === 'suggestion') t = 'A change idea. Adds 24 hours back to the countdown. ' + PUBLIC_EMAIL;
      if (ready && c.kind === 'concern') t = 'Something wrong or blocking. Puts the countdown on hold. ' + PUBLIC_EMAIL;
      if (adminPlain && !c.reply) t = 'Your comment shows as ' + ADMIN_NAME + '. Everyone on the board can read it.';
      if (c.reply) t = S.admin ? 'Your reply shows as ' + ADMIN_NAME + '.' : 'Your reply shows under ' + (c.reply.name || 'this item') + '.';
      hint.textContent = o.hint || t;
      ta.placeholder = c.reply ? 'Your reply' : (o.placeholder || kh.ph);
      clear(ctx);
      if (c.reply) {
        ctx.appendChild(h('div', { class: 'blsb-ctx-row' }, [h('span', { text: 'Replying to ' }), h('b', { text: c.reply.name || 'this item' }),
          h('button', { type: 'button', class: 'blsb-linkbtn', text: 'Cancel reply', onclick: function () { c.setReply(null); } })]));
      }
      if (c.req && !c.reply) {
        ctx.appendChild(h('div', { class: 'blsb-ctx-row' }, [h('span', { text: 'About: ' }), h('span', { class: 'blsb-ctx-q', text: c.req }),
          h('button', { type: 'button', class: 'blsb-linkbtn', text: 'Remove', onclick: function () { c.setReq(null); } })]));
      }
      if (c.spot && !c.reply) {
        ctx.appendChild(h('div', { class: 'blsb-ctx-row' }, [h('span', { class: 'blsb-ctx-pin', 'aria-hidden': 'true' }, [icon('pin')]),
          h('span', { text: 'Spot chosen on the ' + (c.spot.v === 'today' ? 'Today' : 'Proposed') + ' page' }),
          h('button', { type: 'button', class: 'blsb-linkbtn', text: 'Move', onclick: function () { startPinMode(c); } }),
          h('button', { type: 'button', class: 'blsb-linkbtn', text: 'Remove', onclick: function () { c.setSpot(null); renderPins(); } })]));
      }
      ctx.hidden = !ctx.firstChild;
      if (spotBtn) spotBtn.hidden = !!c.reply || !!c.spot;
    };
    c.send = function () {
      var body = ta.value.replace(/\s+$/, '').replace(/^\s+/, '');
      if (!body && !(c.kind === 'help' && c.req && !c.reply)) { say('Type a message first.', true); ta.focus(); return; }
      if (body.length > MAX_BODY) { say('Please keep it under ' + MAX_BODY + ' characters.', true); return; }
      if ((body.match(/https?:\/\/|www\./gi) || []).length > 5) { say('Please keep it to 5 links or fewer.', true); return; }
      if (!S.admin && !S.name) { openWho(function () { c.send(); }, 'comment'); return; }
      var kind = c.reply ? 'reply' : c.kind;
      var req;
      if (c.reply && S.admin) {
        req = api('admin_reply', { parent_id: c.reply.id, body: body });
      } else {
        var b = { slug: c.slug, kind: c.reply ? 'comment' : c.kind, body: body, name: S.admin ? ADMIN_NAME : S.name, role: S.admin ? 'Website' : (S.role || null) };
        if (c.reply) b.parent_id = c.reply.id;
        if (c.spot && !c.reply) { b.variant = c.spot.v; b.pin_x = Math.round(c.spot.x * 100) / 100; b.pin_y = Math.round(c.spot.y * 100) / 100; if (c.spot.w) b.pin_w = c.spot.w; }
        if (c.req && !c.reply) b.req_item = c.req;
        req = api('post', b);
      }
      send.disabled = true; send.textContent = 'Sending...';
      say('');
      req.then(function (r) {
        ta.value = '';
        c.reply = null; c.spot = null; c.req = null; c.kind = o.kinds[0];
        c.refresh();
        var done = kind === 'private' ? 'Sent. Only Daniel can see it.' : (kind === 'concern' || kind === 'suggestion' || kind === 'help') ? 'Sent. Daniel gets an email. Thank you.' : 'Sent. Thank you.';
        say(done);
        toast(done);
        if (r && r.item && S.d && S.d.items && kind !== 'private') S.d.items.unshift(r.item);
        renderAll();
        if (o.onSent) o.onSent(r);
        return load();
      }, function (e) {
        say(errText(e), true);
      }).then(function () { send.disabled = false; send.textContent = o.sendText || 'Send'; });
    };
    c.refresh();
    return c;
  }

  // ---------- thread ----------
  function badge(kind, extra) {
    return h('span', { class: 'blsb-badge blsb-b-' + kind + (extra ? ' ' + extra : ''), text: (KINDS[kind] || KINDS.comment).badge });
  }
  function byline(i) {
    // Daniel's label comes from the server flag, never from the typed name, so nobody can pose as him.
    var isD = !!i.is_admin;
    return h('div', { class: 'blsb-by' }, [
      h('b', { class: isD ? 'blsb-daniel' : null, text: isD ? ADMIN_NAME : (i.author_name || 'Someone') }),
      i.author_role && !isD ? h('span', { class: 'blsb-role', text: ', ' + i.author_role }) : null,
      h('span', { class: 'blsb-time', title: fullTime(i.created_at), text: ' · ' + ago(i.created_at) })
    ]);
  }
  function twoTap(label, confirmLabel, fn, cls) {
    var b = h('button', { type: 'button', class: 'blsb-mini ' + (cls || ''), text: label });
    var armed = false, t = null;
    b.addEventListener('click', function () {
      if (!armed) { armed = true; b.textContent = confirmLabel; b.classList.add('blsb-armed'); t = setTimeout(function () { armed = false; b.textContent = label; b.classList.remove('blsb-armed'); }, 4000); return; }
      clearTimeout(t); fn(b);
    });
    return b;
  }
  function adminCall(action, body, okMsg) {
    return api(action, body).then(function (r) { if (okMsg) toast(okMsg); return load().then(function () { return r; }); }, function (e) { toast(errText(e)); throw e; });
  }
  function itemActions(i, comp, opts) {
    var acts = h('div', { class: 'blsb-acts' });
    var top = !i.parent_id;
    if (top && comp && i.kind !== 'private' && i.kind !== 'approve') {
      acts.appendChild(h('button', { type: 'button', class: 'blsb-mini', text: S.admin ? 'Reply as Daniel' : 'Reply', onclick: function () {
        comp.setReply(i);
        if (opts && opts.onReply) opts.onReply();
      } }));
    }
    if (S.admin) {
      if (top && i.kind !== 'approve') {
        var noteIn = null;
        if (i.status === 'open' && (i.kind === 'concern' || i.kind === 'suggestion')) {
          var nid = uid();
          noteIn = h('input', { id: nid, class: 'blsb-in blsb-in-sm', type: 'text', maxlength: '500', placeholder: 'Note with your answer (optional)' });
          trackDirty(noteIn, '');
          acts.appendChild(h('label', { class: 'blsb-sr', for: nid, text: 'Note with your answer' }));
          acts.appendChild(noteIn);
        }
        var res = function (status, msg) {
          return function (b) {
            b.disabled = true;
            var note = noteIn && noteIn.value.trim() ? noteIn.value.trim() : undefined;
            // the note goes with this answer; un-mark it so the thread or inbox can re-render after the save
            if (noteIn) noteIn.classList.remove('blsb-dirty');
            adminCall('admin_resolve', { id: i.id, status: status, note: note }, msg).catch(function () { b.disabled = false; if (noteIn && noteIn.value) noteIn.classList.add('blsb-dirty'); });
          };
        };
        if (i.status === 'open') {
          var why = '';
          if (i.kind === 'concern' || i.kind === 'suggestion') {
            // Will change sends a page that is heading to the live site (Ready, On hold, Scheduled) back to Building,
            // so it takes a second tap there. On Review or Waiting pages it only marks the item.
            var pg = i.slug != null ? pageOf(i.slug) : null;
            var st = pg ? pg.state : '';
            var moves = st === 'ready' || st === 'hold' || st === 'scheduled';
            acts.appendChild(moves
              ? twoTap('Will change', 'Tap again: page goes back to Building', function (b) { res('accepted', 'Marked Will change. The page is back in Building.')(b); }, 'blsb-mini-go')
              : h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Will change', onclick: function () { res('accepted', 'Marked Will change.')(this); } }));
            acts.appendChild(h('button', { type: 'button', class: 'blsb-mini', text: 'Keep as is', onclick: function () { res('declined', 'Marked Keep as is.')(this); } }));
            why = st === 'hold' ? 'Keep as is: the countdown resumes with at least 24 hours once no concern is open. Will change: the page goes back to Building.'
              : st === 'ready' ? 'Keep as is: the countdown keeps running. Will change: the page goes back to Building.'
              : st === 'scheduled' ? 'Will change: the page goes back to Building and comes off the schedule.' : '';
          }
          acts.appendChild(h('button', { type: 'button', class: 'blsb-mini', text: i.kind === 'comment' ? 'Resolve' : 'Done', onclick: function () { res('resolved', 'Marked done.')(this); } }));
          if (why) acts.appendChild(h('p', { class: 'blsb-muted blsb-small blsb-acts-why', text: why }));
        } else {
          acts.appendChild(h('button', { type: 'button', class: 'blsb-mini', text: 'Reopen', onclick: function () { res('open', 'Reopened.')(this); } }));
        }
      }
      acts.appendChild(twoTap('Hide', 'Tap again to hide', function (b) { b.disabled = true; adminCall('admin_hide', { id: i.id }, 'Hidden.').catch(function () { b.disabled = false; }); }, 'blsb-mini-warn'));
    }
    return acts.firstChild ? acts : null;
  }
  function spotLink(i) {
    if (!i.variant || i.pin_x == null || i.pin_y == null) return null;
    var n = pinNumber(i);
    var vName = i.variant === 'today' ? 'Today' : 'Proposed';
    var other = !pinFits(i) ? (wClass(Number(i.pin_w)) === 'phone' ? ' (pinned on a phone)' : ' (pinned on a computer)') : '';
    if (PAGE && i.slug === PAGE && i.variant === VARIANT) {
      if (other) return h('span', { class: 'blsb-spot blsb-spot-other' }, [icon('pin'), h('span', { text: 'Spot ' + n + other })]);
      return h('button', { type: 'button', class: 'blsb-spot blsb-hit', 'aria-label': 'Show spot ' + n + ' on the page' }, [icon('pin'), h('span', { text: 'Spot ' + n })]);
    }
    return h('a', { class: 'blsb-spot blsb-hit', href: BASE + '/' + (i.variant === 'today' ? 'today' : 'proposed') + '/' + i.slug + '.html#blsb=' + encodeURIComponent(i.id) }, [icon('pin'), h('span', { text: 'Spot ' + n + ' on ' + vName + other })]);
  }
  function itemEl(i, comp, opts) {
    var el = h('div', { class: 'blsb-item blsb-i-' + i.kind + (i.status && i.status !== 'open' ? ' blsb-closed' : ''), id: 'blsb-i-' + i.id });
    var head = h('div', { class: 'blsb-item-h' }, [badge(i.kind)]);
    var sl = spotLink(i);
    if (sl) {
      if (sl.tagName === 'BUTTON') sl.addEventListener('click', function () { showPin(i.id); });
      head.appendChild(sl);
    }
    if (opts && opts.showPage) head.appendChild(h('span', { class: 'blsb-item-pg', text: titleOf(i.slug) }));
    if (i.status && i.status !== 'open' && STATUS[i.status]) head.appendChild(h('span', { class: 'blsb-st blsb-st-' + i.status, text: STATUS[i.status] }));
    el.appendChild(head);
    el.appendChild(byline(i));
    if (i.req_item) el.appendChild(h('div', { class: 'blsb-item-req' }, [h('span', { text: 'About: ' }), h('span', { text: i.req_item })]));
    if (i.body) el.appendChild(h('div', { class: 'blsb-body', text: i.body }));
    if (i.status && i.status !== 'open' && (STATUS[i.status] || i.resolution_note)) {
      el.appendChild(h('div', { class: 'blsb-res' }, [h('b', { text: 'Daniel: ' }), h('span', { text: (STATUS[i.status] || 'Resolved') + '.' + (i.resolution_note ? ' ' + i.resolution_note : '') })]));
    }
    var reps = repliesOf(i.id);
    if (reps.length) {
      var rb = h('div', { class: 'blsb-replies' });
      reps.forEach(function (r) {
        var re = h('div', { class: 'blsb-reply' + (r.kind === 'private' ? ' blsb-reply-private' : ''), id: 'blsb-i-' + r.id }, [
          r.kind === 'private' ? h('div', { class: 'blsb-item-h' }, [badge('private')]) : null,
          byline(r), h('div', { class: 'blsb-body', text: r.body || '' })]);
        var ra = S.admin ? itemActions(r, null) : null;
        if (ra) re.appendChild(ra);
        rb.appendChild(re);
      });
      el.appendChild(rb);
    }
    var acts = itemActions(i, comp, opts);
    if (acts) el.appendChild(acts);
    return el;
  }
  function renderThread(box, slug, opts) {
    opts = opts || {};
    if (guarded(box)) return;
    clear(box);
    var list = topItems(slug).filter(function (i) { return i.kind !== 'approve' || String(i.body || '').trim(); });
    if (opts.filter) list = list.filter(opts.filter);
    if (!list.length) { box.appendChild(h('p', { class: 'blsb-empty', text: opts.empty || 'No feedback yet.' })); return; }
    var key = 'thread:' + (slug == null ? '_' : slug) + ':' + (opts.key || '');
    var showAll = !opts.limit || S.open[key];
    (showAll ? list : list.slice(0, opts.limit)).forEach(function (i) { box.appendChild(itemEl(i, opts.composer, opts)); });
    if (opts.limit && list.length > opts.limit) {
      box.appendChild(h('button', { type: 'button', class: 'blsb-more', 'aria-expanded': showAll ? 'true' : 'false', text: showAll ? 'Show fewer' : 'Show all ' + list.length, onclick: function () { S.open[key] = !S.open[key]; renderThread(box, slug, opts); } }));
    }
  }
  function focusItem(id, box) {
    var el = document.getElementById('blsb-i-' + id);
    if (!el || (box && !box.contains(el))) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('blsb-flash'); void el.offsetWidth; el.classList.add('blsb-flash');
    return true;
  }

  // ---------- approvals ----------
  function approveBlock(p) {
    var box = h('div', { class: 'blsb-appr' });
    var names = approversOf(p);
    if (!S.admin) {
      var mine = iApproved(p);
      var noteId = uid();
      var note = h('input', { id: noteId, class: 'blsb-in', type: 'text', maxlength: '500', placeholder: 'Optional note with your approval' });
      var noteWrap = h('div', { class: 'blsb-appr-note', hidden: !S.open['note:' + p.slug] || mine }, [h('label', { class: 'blsb-sr', for: noteId, text: 'Note with your approval' }), note]);
      var clock = p.state === 'ready' || p.state === 'hold';
      var btn = h('button', { type: 'button', class: 'blsb-approve' + (mine ? ' blsb-on' : ''), 'aria-pressed': mine ? 'true' : 'false' }, [
        h('span', { class: 'blsb-approve-t', text: mine ? 'You approved this page' : 'Approve this page' }),
        h('span', { class: 'blsb-approve-s', text: mine ? 'Tap to remove your approval' : clock ? 'One tap. The countdown is not changed.' : 'One tap. Tells Daniel this page looks good to you.' })
      ]);
      btn.addEventListener('click', function () {
        if (!S.name) { openWho(function () { btn.click(); }, 'approval'); return; }
        btn.disabled = true;
        var body = { slug: p.slug, name: S.name, role: S.role || null };
        if (!mine && note.value.trim()) body.note = note.value.trim();
        api('approve', body).then(function (r) {
          var on = r && r.approved != null ? !!r.approved : !mine;
          var me = lc(S.name);
          var list = approversOf(p).filter(function (n) { return lc(n) !== me; });
          if (on) list.push(S.name);
          p.approvers = list;
          if (p.counts) p.counts.approve = list.length;
          S.open['note:' + p.slug] = false;
          toast(on ? 'Approved. Thank you.' : 'Your approval is removed.');
          renderAll();
          return load();
        }, function (e) { toast(errText(e)); }).then(function () { btn.disabled = false; });
      });
      var noteBtn = mine ? null : h('button', { type: 'button', class: 'blsb-linkbtn', text: noteWrap.hidden ? 'Add a note' : 'No note', onclick: function () {
        S.open['note:' + p.slug] = noteWrap.hidden; noteWrap.hidden = !noteWrap.hidden; this.textContent = noteWrap.hidden ? 'Add a note' : 'No note';
        if (!noteWrap.hidden) note.focus();
      } });
      add(box, [btn, noteBtn ? h('div', { class: 'blsb-appr-row' }, [noteBtn]) : null, noteWrap]);
    }
    add(box, h('p', { class: 'blsb-appr-names' }, names.length ? [h('b', { text: 'Approved by ' }), names.join(', ')] : 'No approvals yet.'));
    return box;
  }

  // ---------- admin page controls ----------
  function adminPage(p, body, msg) {
    body.slug = p.slug;
    return adminCall('admin_page', body, msg || 'Saved.');
  }
  function setStateTo(p, st) {
    if (st === p.state) return;
    if (st === 'ready') return adminPage(p, p.state === 'hold' ? { timer: 'resume' } : { state: 'ready', timer: 'start' }, 'Countdown running.');
    if (st === 'hold') return adminPage(p, p.state === 'ready' ? { timer: 'pause' } : { state: 'hold' }, 'On hold.');
    if (st === 'scheduled' && (p.state === 'ready' || p.state === 'hold')) return adminPage(p, { timer: 'schedule_now' }, 'Scheduled.');
    var b = { state: st };
    if (st === 'live' && !p.live_since) b.live_since = todayIso();
    return adminPage(p, b, 'State set to ' + STATES[st].label + '.');
  }
  // What a state change will do, asked before it happens (the whole board sees the result).
  function stateQuestion(p, to) {
    var clock = p.state === 'ready' || p.state === 'hold';
    var rem = remaining(p);
    if (to === 'ready') return p.state === 'hold' && rem != null ? 'Resume the countdown with ' + fmtLong(rem) + ' left?'
      : 'Start the 48 hour countdown? When it ends the page is scheduled for the next update, unless a concern is raised.';
    if (to === 'hold') return p.state === 'ready' && rem != null ? 'Pause the countdown with ' + fmtLong(rem) + ' left?' : 'Put this page On hold?';
    if (to === 'scheduled') return 'Schedule this page for the next update to the live site?' + (clock ? ' This ends the countdown now.' : '');
    if (to === 'live') return 'Mark this page Live' + (p.live_since ? '' : ' as of today') + '?';
    return 'Change this page to ' + STATES[to].label + '?' + (clock ? ' This clears the countdown.' : '');
  }
  function adminControls(p) {
    var box = h('div', { class: 'blsb-adm' });
    var sid = uid(), pid = uid(), did = uid();
    var sel = trackDirty(h('select', { id: sid, class: 'blsb-sel' }, ORDER.map(function (k) { return h('option', { value: k, selected: k === p.state, text: STATES[k].label }); })), p.state);
    var conf = h('div', { class: 'blsb-confirm', role: 'group', 'aria-label': 'Confirm state change', hidden: true });
    function resetSel() { sel.value = p.state; sel.classList.remove('blsb-dirty'); clear(conf); conf.hidden = true; }
    sel.addEventListener('change', function () {
      clear(conf);
      if (sel.value === p.state) { conf.hidden = true; return; }
      var to = sel.value;
      var yes = h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Yes, change it' });
      yes.addEventListener('click', function () {
        yes.disabled = true; sel.disabled = true;
        sel.classList.remove('blsb-dirty'); // let the card or sheet re-render once the save lands
        var r = setStateTo(p, to);
        if (r) r.catch(function () { resetSel(); }).then(function () { sel.disabled = false; });
        else { resetSel(); sel.disabled = false; }
      });
      add(conf, [h('p', { class: 'blsb-confirm-q', text: stateQuestion(p, to) }),
        h('div', { class: 'blsb-confirm-b' }, [yes, h('button', { type: 'button', class: 'blsb-mini', text: 'Cancel', onclick: resetSel })])]);
      conf.hidden = false;
    });
    var phs = phases();
    var psel = h('select', { id: pid, class: 'blsb-sel' }, [h('option', { value: '', text: 'No phase', selected: !p.phase_id })].concat(phs.map(function (ph) { return h('option', { value: ph.id, selected: ph.id === p.phase_id, text: ph.name }); })));
    psel.addEventListener('change', function () { adminPage(p, { phase_id: psel.value || null }, 'Phase saved.'); });
    var due = h('input', { id: did, class: 'blsb-in', type: 'date', value: p.due_date ? String(p.due_date).slice(0, 10) : '' });
    due.addEventListener('change', function () { adminPage(p, { due_date: due.value || null }, 'Date saved.'); });
    add(box, h('div', { class: 'blsb-adm-grid' }, [
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: sid, text: 'State' }), sel]),
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: pid, text: 'Phase' }), psel]),
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: did, text: p.state === 'waiting' ? 'Due date' : 'Review by or due date' }), due])
    ]));
    add(box, conf);
    // countdown buttons
    var t = h('div', { class: 'blsb-adm-timer' });
    function tb(label, timer, msg, cls) { return h('button', { type: 'button', class: 'blsb-mini ' + (cls || ''), text: label, onclick: function () { this.disabled = true; var b = this; adminPage(p, { timer: timer }, msg).catch(function () { b.disabled = false; }); } }); }
    if (p.state === 'ready') add(t, [tb('Pause', 'pause', 'Countdown paused.'), tb('Add 24 hours', 'add24', 'Added 24 hours.'), twoTap('Clear countdown', 'Tap again to clear', function () { adminPage(p, { timer: 'clear' }, 'Countdown cleared.'); }), twoTap('Schedule now', 'Tap again to schedule', function () { adminPage(p, { timer: 'schedule_now' }, 'Scheduled.'); }, 'blsb-mini-go')]);
    else if (p.state === 'hold') add(t, [tb('Resume', 'resume', 'Countdown resumed.', 'blsb-mini-go'), tb('Add 24 hours', 'add24', 'Added 24 hours.'), twoTap('Clear countdown', 'Tap again to clear', function () { adminPage(p, { timer: 'clear' }, 'Countdown cleared.'); }), twoTap('Schedule now', 'Tap again to schedule', function () { adminPage(p, { timer: 'schedule_now' }, 'Scheduled.'); })]);
    else if (p.state === 'scheduled') add(t, [h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Mark live today', onclick: function () { adminPage(p, { state: 'live', live_since: p.live_since || todayIso() }, 'Marked live.'); } })]);
    else if (p.state !== 'live') add(t, [twoTap('Start 48 hour countdown', 'Tap again to start', function () { adminPage(p, { state: 'ready', timer: 'start' }, 'Countdown started.'); }, 'blsb-mini-go')]);
    if (t.firstChild) add(box, t);
    // details saved with one button
    var lsId = uid(), luId = uid(), nId = uid();
    var since = trackDirty(h('input', { id: lsId, class: 'blsb-in', type: 'date', value: p.live_since ? String(p.live_since).slice(0, 10) : '' }), p.live_since ? String(p.live_since).slice(0, 10) : '');
    var url = trackDirty(h('input', { id: luId, class: 'blsb-in', type: 'url', placeholder: 'https://www.blslittleleague.org/...', value: p.live_url || '' }), p.live_url || '');
    var note = trackDirty(h('textarea', { id: nId, class: 'blsb-ta blsb-ta-sm', rows: '2', maxlength: '500', value: p.note || '' }), p.note || '');
    var save = h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Save details' });
    save.addEventListener('click', function () {
      save.disabled = true;
      adminPage(p, { live_since: since.value || null, live_url: url.value.trim() || null, note: note.value.trim() || null }, 'Details saved.').then(function () {
        [since, url, note].forEach(function (x) { x.classList.remove('blsb-dirty'); });
      }, function () {}).then(function () { save.disabled = false; renderAll(); });
    });
    add(box, h('div', { class: 'blsb-adm-grid' }, [
      h('div', { class: 'blsb-field blsb-field-wide' }, [h('label', { class: 'blsb-label', for: nId, text: 'Note shown to everyone' }), note]),
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: lsId, text: 'Live since' }), since]),
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: luId, text: 'Live link' }), url])
    ]));
    add(box, h('div', { class: 'blsb-adm-timer' }, [save]));
    return box;
  }
  function manageBlock(p, key) {
    var d = h('details', { class: 'blsb-manage', open: !!S.open['manage:' + key] }, [h('summary', { text: 'Manage page (admin)' }), adminControls(p)]);
    d.addEventListener('toggle', function () { S.open['manage:' + key] = d.open; });
    return d;
  }

  // ---------- page status block (sheet) ----------
  function statusBlock(p, where) {
    var box = h('div', { class: 'blsb-stat' });
    var pl = phaseLabel(p);
    add(box, h('div', { class: 'blsb-stat-top' }, [chip(p, 'blsb-chip-lg'), pl ? h('span', { class: 'blsb-phase-l', text: pl }) : null]));
    add(box, h('p', { class: 'blsb-mean' }, [meaningEl(p)]));
    if (p.note) add(box, h('p', { class: 'blsb-note' }, [h('b', { text: 'Note from Daniel: ' }), h('span', { text: p.note })]));
    if (S.admin) add(box, manageBlock(p, where + ':' + p.slug));
    return box;
  }
  // Facts the page still needs (proposal "required"). Shown whenever there are any; "I can help" only while Waiting on info.
  function helpersFor(slug, r) {
    var seen = {}, out = [];
    topItems(slug).forEach(function (i) {
      if (i.kind === 'help' && i.status === 'open' && i.req_item === r) {
        var n = i.is_admin ? ADMIN_NAME : i.author_name;
        if (n && !seen[lc(n)]) { seen[lc(n)] = 1; out.push(n); }
      }
    });
    return out.reverse();
  }
  function reqBlock(p, comp) {
    var req = (META[p.slug] && META[p.slug].req) || [];
    if (!req.length) return null;
    var waiting = p.state === 'waiting';
    var box = h('div', { class: 'blsb-req' }, [h('div', { class: 'blsb-req-h', text: (waiting ? 'Needed before this page can be finished' : 'Facts this page still needs') + ' (' + req.length + ')' })]);
    req.forEach(function (r) {
      var who = helpersFor(p.slug, r);
      box.appendChild(h('div', { class: 'blsb-req-i' }, [h('span', { class: 'blsb-req-t', text: r }),
        who.length ? h('span', { class: 'blsb-req-who', text: (who.length > 2 ? who.slice(0, -1).join(', ') + ' and ' + who[who.length - 1] : who.join(' and ')) + ' can help' }) : null,
        waiting && !S.admin ? h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'I can help with this', onclick: function () { comp.setReq(r); comp.focus(); } }) : null]));
    });
    return box;
  }

  // ---------- the feedback sheet ----------
  var SH = { dlg: null, open: false, slug: undefined, comp: {} };
  function compFor(slug) {
    var key = slug == null ? '_general' : slug;
    if (!SH.comp[key]) {
      SH.comp[key] = Composer({
        slug: slug,
        kinds: slug == null ? ['comment', 'suggestion', 'concern'] : ['comment', 'suggestion', 'concern', 'help', 'private'],
        spot: !!(PAGE && slug === PAGE && VARIANT),
        label: 'Your feedback'
      });
    }
    return SH.comp[key];
  }
  function openSheet(slug, o) {
    o = o || {};
    if (!SH.dlg) {
      SH.dlg = makeDialog({ cls: 'blsb-sheet', side: true, kicker: 'Feedback', onclose: function () { SH.open = false; } });
      SH.statusBox = h('div', { class: 'blsb-sh-sec' });
      SH.whoBox = h('div', { class: 'blsb-sh-who' });
      SH.apprBox = h('div', { class: 'blsb-sh-sec' });
      SH.reqBox = h('div', { class: 'blsb-sh-sec' });
      SH.pinsBox = h('div', { class: 'blsb-sh-pins' });
      SH.compBox = h('div', { class: 'blsb-sh-sec blsb-sh-comp' });
      SH.linksBox = h('div', { class: 'blsb-sh-links' });
      SH.threadH = h('div', { class: 'blsb-sec-h' });
      SH.thread = h('div', { class: 'blsb-thread' });
      SH.offBox = h('div', { class: 'blsb-sh-off' });
      add(SH.dlg.body, [SH.offBox, SH.statusBox, SH.linksBox, SH.whoBox, SH.apprBox, SH.reqBox, SH.pinsBox, SH.compBox, SH.threadH, SH.thread]);
    }
    SH.slug = slug == null ? null : slug;
    var comp = compFor(SH.slug);
    clear(SH.compBox).appendChild(comp.el);
    comp.refresh();
    SH.open = true;
    SH.dlg.title.textContent = titleOf(SH.slug);
    renderSheet();
    SH.dlg.show();
    tick();
    if (o.reply) comp.setReply(o.reply);
    if (o.focus) setTimeout(function () { focusItem(o.focus, SH.dlg.body); }, 320);
    else if (o.compose) setTimeout(function () { comp.focus(); }, 320);
  }
  function renderSheet() {
    if (!SH.open) return;
    var slug = SH.slug, p = slug != null ? pageOf(slug) : null, comp = compFor(slug);
    SH.dlg.title.textContent = titleOf(slug);
    SH.dlg.kicker.textContent = slug == null ? 'BLS Website Build' : 'Feedback on this page';
    clear(SH.whoBox).appendChild(whoLine('sheet'));
    clear(SH.offBox);
    if (S.off) {
      add(SH.offBox, offlineNote(true));
    }
    if (!guarded(SH.statusBox)) {
      clear(SH.statusBox);
      if (p) SH.statusBox.appendChild(statusBlock(p, 'sheet'));
      else if (slug == null) SH.statusBox.appendChild(h('p', { class: 'blsb-mean', text: 'Anything not about one page. Everyone on the board can read it.' }));
      SH.statusBox.hidden = !SH.statusBox.firstChild;
    }
    clear(SH.linksBox);
    if (slug != null && (!PAGE || slug !== PAGE)) {
      add(SH.linksBox, [h('a', { class: 'blsb-chiplink', href: BASE + '/today/' + slug + '.html', text: 'Open Today' }), h('a', { class: 'blsb-chiplink blsb-pri', href: BASE + '/proposed/' + slug + '.html', text: 'Open Proposed' }),
        h('span', { class: 'blsb-muted blsb-small', text: 'Open a page to comment on a spot.' })]);
    }
    SH.linksBox.hidden = !SH.linksBox.firstChild;
    if (!guarded(SH.apprBox)) { clear(SH.apprBox); if (p) SH.apprBox.appendChild(approveBlock(p)); SH.apprBox.hidden = !SH.apprBox.firstChild; }
    clear(SH.reqBox);
    var rb = p ? reqBlock(p, comp) : null;
    if (rb) SH.reqBox.appendChild(rb);
    SH.reqBox.hidden = !rb;
    // Hide or show the numbered spots on this page (a spot can sit on top of a link)
    clear(SH.pinsBox);
    var spots = PAGE && slug === PAGE && VARIANT ? pinItems(PAGE, VARIANT).filter(pinFits).length : 0;
    if (spots) {
      var off = pinsOff();
      add(SH.pinsBox, [h('span', { class: 'blsb-muted blsb-small', text: plural(spots, 'spot') + ' pinned on this page' + (off ? ', hidden.' : '.') }),
        h('button', { type: 'button', class: 'blsb-mini', 'aria-pressed': off ? 'true' : 'false', text: off ? 'Show spots' : 'Hide spots (' + spots + ')', onclick: function () {
          SS.set('blsb_pins', pinsOff() ? '' : 'off'); renderPins(); renderSheet();
        } })]);
    }
    SH.pinsBox.hidden = !spots;
    comp.refresh();
    var n = discussionCount(slug);
    SH.threadH.textContent = n ? 'Discussion (' + n + ')' : 'Discussion';
    renderThread(SH.thread, slug, { composer: comp, empty: S.off ? 'Comments are offline right now.' : 'No feedback yet. Be the first.', onReply: function () { SH.compBox.scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
    tick();
  }
  function offlineNote(inSheet) {
    return h('div', { class: 'blsb-offline' }, [h('span', { text: 'Comments are offline right now.' + (inSheet ? ' What you type stays here until it sends.' : ' The page previews still work.') }),
      h('button', { type: 'button', class: 'blsb-mini', text: 'Try again', onclick: function () { this.disabled = true; this.textContent = 'Trying...'; load(); } })]);
  }

  // ---------- preview page bar ----------
  var BAR = null, SPACER = null;
  function setupBar() {
    BAR = document.getElementById('blsbBar');
    SPACER = document.getElementById('blsPreviewSpacer');
    if (BAR) BAR.classList.add('blsb');
    // blsb-bar: compact bar (board.css) and lets the page grow past the Sports Connect height:100% rules,
    // so the spacer sits at the real end of the page and the footer clears the bar.
    document.documentElement.classList.add('blsb-bar');
    var bar = document.getElementById('blsPreviewBar');
    if (bar && window.ResizeObserver) new ResizeObserver(fitSpacer).observe(bar);
  }
  function allPagesLink() { return h('a', { class: 'blsb-bar-all', href: BASE + '/', text: 'All pages' }); }
  function fitSpacer() {
    var bar = document.getElementById('blsPreviewBar');
    if (!bar || !SPACER) return;
    var hgt = bar.offsetHeight;
    if (hgt > 0) SPACER.style.height = (hgt + 12) + 'px';
  }
  function renderBar() {
    if (!BAR) return;
    clear(BAR);
    if (S.first && !S.d) {
      add(BAR, [h('span', { class: 'blsb-bar-msg', text: 'Loading comments...' }), allPagesLink()]);
    } else if (!S.d) {
      add(BAR, [h('span', { class: 'blsb-bar-msg', text: 'Comments are offline right now.' }), allPagesLink(),
        h('button', { type: 'button', class: 'blsb-bar-btn', text: 'Try again', onclick: function () { this.disabled = true; this.textContent = 'Trying...'; load(); } })]);
    } else {
      var p = pageOf(PAGE);
      var c = p ? countsOf(p) : { approve: 0, open: 0 };
      var bits = [];
      if (S.admin) bits.push('Admin');
      bits.push(approvalText(c.approve || 0));
      var ot = p ? openText(p) : '';
      if (ot) bits.push(ot);
      if (S.off) bits.push('offline');
      var stat = h('button', { type: 'button', class: 'blsb-bar-stat', 'aria-label': 'Page status: ' + (p ? STATES[stKey(p)].label : 'unknown') + '. ' + bits.join(', ') + '. Open feedback.' }, [
        p ? chip(p) : h('span', { class: 'blsb-chip blsb-s-building', text: 'Not on the board yet' }),
        h('span', { class: 'blsb-bar-counts', text: bits.join(' · ') })
      ]);
      stat.addEventListener('click', function () { openSheet(PAGE); });
      var n = discussionCount(PAGE);
      var fb = h('button', { type: 'button', class: 'blsb-bar-fb', 'aria-label': 'Feedback' + (n ? ', ' + plural(n, 'item') : '') }, [h('span', { text: 'Feedback' }), n ? h('span', { class: 'blsb-bar-n', text: String(n) }) : null]);
      fb.addEventListener('click', function () { openSheet(PAGE); });
      add(BAR, [stat, allPagesLink(), fb]);
    }
    fitSpacer();
  }

  // ---------- spot pins ----------
  var PINS = { layer: null, temp: null, raf: 0, lastH: 0 };
  var PINMODE = { on: false, comp: null, overlay: null, banner: null };
  function docSize() {
    var de = document.documentElement;
    return { w: de.clientWidth || window.innerWidth, h: Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0) };
  }
  function ensureLayer() {
    if (!PINS.layer) { PINS.layer = h('div', { class: 'blsb-pins', 'aria-label': 'Spots with comments' }); ROOT.appendChild(PINS.layer); }
    return PINS.layer;
  }
  function placePin(el, x, y) {
    var ds = docSize();
    var r = PINS.layer.getBoundingClientRect();
    var ox = r.left + window.pageXOffset, oy = r.top + window.pageYOffset;
    var px = Math.min(Math.max(x, 0), 100) / 100 * ds.w, py = Math.min(Math.max(y, 0), 100) / 100 * ds.h;
    el.style.left = Math.round(Math.min(px, ds.w - 16) - ox) + 'px';
    el.style.top = Math.round(Math.min(py, ds.h - 20) - oy) + 'px';
  }
  function renderPins() {
    if (!PAGE || !VARIANT || !ROOT) return;
    var layer = ensureLayer();
    clear(layer);
    PINS.cls = myClass();
    if (S.d && !pinsOff()) {
      pinItems(PAGE, VARIANT).forEach(function (i, n) {
        if (!pinFits(i)) return; // dropped on the other screen size: it would point at the wrong text here
        var k = KINDS[i.kind] ? i.kind : 'comment';
        var b = h('button', { type: 'button', class: 'blsb-pin blsb-pin-' + k + (i.status && i.status !== 'open' ? ' blsb-pin-done' : ''), 'data-id': i.id, 'aria-label': 'Spot ' + (n + 1) + ': ' + (KINDS[k].badge) + ' from ' + (i.author_name || 'someone') + '. Open it.', text: String(n + 1) });
        b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); openSheet(PAGE, { focus: i.id }); });
        b._xy = [Number(i.pin_x), Number(i.pin_y)];
        layer.appendChild(b);
      });
    }
    var comp = SH.comp[PAGE];
    if (comp && comp.spot && comp.spot.v === VARIANT) {
      var t = h('span', { class: 'blsb-pin blsb-pin-new', 'aria-hidden': 'true', text: 'New' });
      t._xy = [comp.spot.x, comp.spot.y];
      layer.appendChild(t);
    }
    positionPins();
  }
  function positionPins() {
    if (!PINS.layer) return;
    PINS.lastH = docSize().h;
    $$('.blsb-pin', PINS.layer).forEach(function (b) { if (b._xy) placePin(b, b._xy[0], b._xy[1]); });
  }
  function watchPins() {
    if (!PINS.layer || !PINS.layer.firstChild) return;
    if (docSize().h !== PINS.lastH) positionPins();
  }
  function showPin(id) {
    var b = PINS.layer && PINS.layer.querySelector('[data-id="' + String(id).replace(/"/g, '') + '"]');
    if (!b) { if (PAGE) openSheet(PAGE, { focus: id }); return; } // spots hidden or pinned on the other screen size
    if (SH.dlg && SH.dlg.modal()) SH.dlg.close();
    setTimeout(function () {
      b.scrollIntoView({ block: 'center', behavior: 'smooth' });
      b.classList.remove('blsb-flash'); void b.offsetWidth; b.classList.add('blsb-flash');
    }, 280);
  }
  function startPinMode(comp) {
    if (!PAGE || !VARIANT) return;
    PINMODE.comp = comp;
    if (SH.dlg && SH.open) SH.dlg.close();
    PINMODE.on = true;
    document.documentElement.classList.add('blsb-pinning');
    PINMODE.overlay = h('div', { class: 'blsb-pinmode', 'aria-hidden': 'true' });
    PINMODE.banner = h('div', { class: 'blsb-pinbar', role: 'status' }, [
      h('span', { class: 'blsb-pinbar-t', text: 'Tap the spot you want to comment on. You can scroll first.' }),
      h('button', { type: 'button', class: 'blsb-bar-btn', text: 'Cancel', onclick: function () { endPinMode(true); } })
    ]);
    PINMODE.overlay.addEventListener('click', function (ev) {
      var ds = docSize();
      var x = (ev.clientX + window.pageXOffset) / ds.w * 100, y = (ev.clientY + window.pageYOffset) / ds.h * 100;
      var w = Math.round(window.innerWidth || ds.w);
      comp.setSpot({ v: VARIANT, x: Math.min(Math.max(x, 0), 100), y: Math.min(Math.max(y, 0), 100), w: w >= 200 && w <= 10000 ? w : null });
      endPinMode(false);
    });
    ROOT.appendChild(PINMODE.overlay);
    ROOT.appendChild(PINMODE.banner);
    setTimeout(function () { var b = PINMODE.banner && PINMODE.banner.querySelector('button'); if (b) b.focus(); }, 50);
  }
  function endPinMode(cancel) {
    if (!PINMODE.on) return;
    PINMODE.on = false;
    document.documentElement.classList.remove('blsb-pinning');
    if (PINMODE.overlay) PINMODE.overlay.remove();
    if (PINMODE.banner) PINMODE.banner.remove();
    renderPins();
    if (!cancel) toast('Spot chosen. Now type your comment.');
    openSheet(PAGE, { compose: true });
  }

  // ---------- index page ----------
  var IX = null;
  function setupIndex() {
    var mount = document.getElementById('blsbIndex');
    if (!mount) return;
    mount.classList.add('blsb');
    IX = { mount: mount };
    IX.off = h('div', { class: 'blsb-ix-off' });
    IX.admin = h('section', { class: 'blsb-panel blsb-adminp', hidden: true, 'aria-label': 'Admin' });
    IX.phases = h('section', { class: 'blsb-phases', 'aria-labelledby': 'blsbPhH' });
    IX.how = howBox();
    IX.newsList = h('div', { class: 'blsb-news' });
    IX.news = h('section', { class: 'blsb-panel blsb-newsp', 'aria-labelledby': 'blsbNewH' }, [h('div', { class: 'blsb-panel-h', id: 'blsbNewH', text: 'What\'s new' }), IX.newsList]);
    IX.discComp = Composer({ slug: null, kinds: ['comment', 'suggestion', 'concern'], label: 'Your comment for the board' });
    IX.discThread = h('div', { class: 'blsb-thread' });
    IX.disc = h('section', { class: 'blsb-panel blsb-discp blsb-only-desk', 'aria-labelledby': 'blsbDiscH' }, [
      h('div', { class: 'blsb-panel-h', id: 'blsbDiscH', text: 'Board discussion' }),
      h('p', { class: 'blsb-sub', text: 'Anything not about one page. Everyone on the board can read it.' }),
      h('div', { class: 'blsb-who-slot', 'data-blsb-who': 'panel' }),
      IX.discComp.el, IX.discThread
    ]);
    IX.msgComp = Composer({ slug: null, kinds: ['private'], label: 'Your message to Daniel', placeholder: 'Your message to Daniel', hint: 'Only Daniel sees this. He gets an email.', sendText: 'Send to Daniel' });
    IX.msg = h('section', { class: 'blsb-panel blsb-msgp blsb-only-desk', 'aria-labelledby': 'blsbMsgH' }, [h('div', { class: 'blsb-panel-h', id: 'blsbMsgH', text: 'Message Daniel' }), IX.msgComp.el]);
    // Phones: the discussion and the message box open in a sheet, so the page cards are not four screens down.
    IX.discBtn = h('button', { type: 'button', class: 'blsb-btn blsb-quick-b', onclick: function () { openSheet(null, { compose: false }); } });
    IX.msgBtn = h('button', { type: 'button', class: 'blsb-btn blsb-pri blsb-quick-b', text: 'Message Daniel', onclick: openMsg });
    IX.quick = h('section', { class: 'blsb-panel blsb-quick blsb-only-phone', 'aria-label': 'Board discussion and messages' }, [
      h('div', { class: 'blsb-quick-row' }, [IX.discBtn, IX.msgBtn]),
      h('p', { class: 'blsb-muted blsb-small', text: 'Board discussion: anything not about one page. Message Daniel: only Daniel sees it.' })
    ]);
    IX.cols = h('div', { class: 'blsb-icols' }, [IX.how, IX.quick, IX.news, IX.disc, IX.msg]);
    add(mount, [IX.off, IX.admin, IX.phases, IX.cols]);
    var hw = document.getElementById('blsbWho');
    if (hw) { hw.classList.add('blsb'); hw.setAttribute('data-blsb-who', 'header'); }
  }
  // "Message Daniel" as a small sheet (phones)
  var MSG = { dlg: null, comp: null };
  function openMsg() {
    if (!MSG.dlg) {
      MSG.dlg = makeDialog({ cls: 'blsb-msgdlg', kicker: 'BLS Website Build' });
      MSG.dlg.title.textContent = 'Message Daniel';
      MSG.who = h('div', { class: 'blsb-sh-who', 'data-blsb-who': 'sheet' });
      MSG.comp = Composer({ slug: null, kinds: ['private'], label: 'Your message to Daniel', placeholder: 'Your message to Daniel', hint: 'Only Daniel sees this. He gets an email.', sendText: 'Send to Daniel',
        onSent: function () { setTimeout(function () { if (MSG.dlg) MSG.dlg.close(); }, 900); } });
      add(MSG.dlg.body, [MSG.who, MSG.comp.el]);
    }
    clear(MSG.who).appendChild(whoLine('sheet'));
    MSG.comp.refresh();
    MSG.dlg.show();
    setTimeout(function () { MSG.comp.focus(); }, 320);
  }
  function howBox() {
    var openPref = LS.get('blsb_how');
    var d = h('details', { class: 'blsb-panel blsb-how', open: openPref ? openPref === 'open' : DESK.matches });
    d.addEventListener('toggle', function () { LS.set('blsb_how', d.open ? 'open' : 'closed'); });
    var states = h('div', { class: 'blsb-how-states' });
    ORDER.forEach(function (k) {
      states.appendChild(h('div', { class: 'blsb-how-st' }, [h('span', { class: 'blsb-chip blsb-s-' + k }, [h('span', { class: 'blsb-dot', 'aria-hidden': 'true' }), h('span', { class: 'blsb-chip-t', text: STATES[k].label })]),
        h('span', { class: 'blsb-how-m', text: k === 'ready' ? 'Final check done. A 48 hour countdown runs, then the page is scheduled for the next update.' : k === 'scheduled' ? 'In the next update to the live site, in its phase.' : k === 'live' ? 'Live on blslittleleague.org.' : STATES[k].mean })]));
    });
    var rules = [
      'Daniel does a final check, then marks a page Ready to deploy. A 48 hour countdown starts.',
      'Approve: the clock keeps running.',
      'Suggestion: adds 24 hours back, never more than 48 hours left. Daniel gets an email.',
      'Concern: the page goes On hold and the clock stops. Daniel gets an email.',
      'Daniel answers. Keep as is: the countdown resumes with at least 24 hours. Will change: the page goes back to Building.',
      'At zero the page is scheduled for the next update to the live site. Daniel updates the live site in phases.'
    ];
    add(d, [h('summary', {}, [h('span', { class: 'blsb-panel-h', text: 'How this works' }), h('span', { class: 'blsb-how-sum', text: 'Page states and the 48 hour countdown' })]),
      h('div', { class: 'blsb-how-body' }, [
        h('div', {}, [h('div', { class: 'blsb-sec-h', text: 'Page states' }), states]),
        h('div', {}, [h('div', { class: 'blsb-sec-h', text: 'The countdown' }), h('ul', { class: 'blsb-rules' }, rules.map(function (r) { return h('li', { text: r }); })),
          h('p', { class: 'blsb-muted blsb-small', text: 'Everyone uses this same link. Pick your name once and this device remembers it. Private messages go only to Daniel.' })])
      ])]);
    return d;
  }
  function renderIndex() {
    if (!IX) return;
    clear(IX.off);
    if (S.first && !S.d) IX.off.appendChild(h('p', { class: 'blsb-loading', text: 'Loading the board...' }));
    else if (S.off) IX.off.appendChild(offlineNote(false));
    var have = !!S.d;
    IX.phases.hidden = !have;
    IX.news.hidden = !have;
    IX.disc.hidden = !have;
    IX.msg.hidden = !have || S.admin; // Daniel does not message himself
    IX.quick.hidden = !have;
    IX.msgBtn.hidden = S.admin;
    if (have) {
      var dn = discussionCount(null);
      IX.discBtn.textContent = dn ? 'Board discussion (' + dn + ')' : 'Board discussion';
      renderPhases();
      renderNews();
      renderThread(IX.discThread, null, { composer: IX.discComp, limit: 4, key: 'ix', empty: 'No board discussion yet.', onReply: function () { IX.discComp.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
      IX.discComp.refresh();
    }
    renderAdmin();
    $$('[data-board]').forEach(renderCard);
  }
  function renderPhases() {
    var box = clear(IX.phases);
    add(box, h('div', { class: 'blsb-phases-h' }, [h('span', { class: 'blsb-panel-h', id: 'blsbPhH', text: 'When pages go live' }), h('span', { class: 'blsb-sub', text: 'Daniel updates the live site in phases. Tap a page to jump to it.' })]));
    var list = h('div', { class: 'blsb-phase-list' });
    var groups = phases().map(function (ph) { return { ph: ph, pages: pages().filter(function (p) { return p.phase_id === ph.id; }) }; });
    var none = pages().filter(function (p) { return !p.phase_id || !phaseOf(p.phase_id); });
    if (none.length) groups.push({ ph: null, pages: none });
    groups.forEach(function (g) {
      var chips = h('div', { class: 'blsb-pchips' });
      var by = {};
      g.pages.forEach(function (p) {
        var st = stKey(p);
        by[st] = (by[st] || 0) + 1;
        // the state is spelled out on each chip, not shown by color alone
        chips.appendChild(h('a', { class: 'blsb-pchip blsb-s-' + st, href: '#p-' + p.slug, title: STATES[st].label }, [
          h('span', { class: 'blsb-dot', 'aria-hidden': 'true' }), h('span', { text: p.title || titleOf(p.slug) }),
          h('span', { class: 'blsb-pchip-st', text: ' · ' + SHORT[st] }),
          (st === 'ready' || st === 'hold') && p.remaining_ms != null ? h('span', { class: 'blsb-pchip-cd', 'data-cd': p.slug, 'data-fmt': 'short' }) : null
        ]));
      });
      // one line per phase ("2 ready, 1 on hold, 14 in board review"); the chips fold away on phones
      var sum = ORDER.filter(function (k) { return by[k]; }).map(function (k) { return by[k] + ' ' + SUMW[k]; }).join(', ');
      var key = 'ph:' + (g.ph ? g.ph.id : '_none');
      var openNow = S.open[key] != null ? S.open[key] : DESK.matches;
      var det = g.pages.length ? h('details', { class: 'blsb-phase-pages', open: openNow }, [h('summary', { text: 'Pages (' + g.pages.length + ')' }), chips]) : null;
      if (det) det.addEventListener('toggle', function () { S.open[key] = det.open; });
      list.appendChild(h('div', { class: 'blsb-phase' + (g.ph ? '' : ' blsb-phase-none') }, [
        h('div', { class: 'blsb-phase-t' }, [h('b', { text: g.ph ? g.ph.name : 'Not in a phase yet' }),
          g.ph ? h('span', { class: 'blsb-phase-d', text: g.ph.target_date ? 'Target ' + fmtDay(g.ph.target_date) : 'Date to be set' }) : null]),
        g.ph && g.ph.note ? h('p', { class: 'blsb-phase-n', text: g.ph.note }) : null,
        h('p', { class: 'blsb-phase-sum', text: sum || 'No pages yet.' }),
        det
      ]));
    });
    add(box, list);
  }
  var EVV = {
    approve: 'approved', approved: 'approved', comment: 'commented on', commented: 'commented on', reply: 'replied on', replied: 'replied on',
    suggestion: 'suggested a change on', suggested: 'suggested a change on', concern: 'raised a concern on', help: 'offered to help on'
  };
  function evLine(e) {
    var who = e.actor && lc(e.actor) !== 'system' ? String(e.actor) : '';
    var detail = clean(e.detail || '').trim();
    if (detail) {
      // events arrive as sentences ("Ramey Harguess approved FAQ."); the actor's name is shown in bold
      if (who && detail.indexOf(who) === 0) return [h('b', { text: who }), detail.slice(who.length)];
      return [detail];
    }
    var k = lc(e.kind).replace(/[\s-]+/g, '_');
    var page = e.slug ? titleOf(e.slug) : 'the board discussion';
    if (EVV[k]) return [who ? h('b', { text: who }) : 'Someone', ' ' + EVV[k] + ' ', h('b', { text: page }), '.'];
    return [h('b', { text: page }), ': ' + k.replace(/_/g, ' ') + '.'];
  }
  function renderNews() {
    var box = IX.newsList;
    clear(box);
    var ev = ((S.d && S.d.events) || []).slice().sort(byNew).slice(0, 20);
    if (!ev.length) { box.appendChild(h('p', { class: 'blsb-empty', text: 'Nothing yet. Approvals, feedback and page changes show up here.' })); return; }
    var all = !!S.open.news;
    var few = DESK.matches ? 6 : 3; // phones show 3 so the page cards stay close
    var list = h('ul', { class: 'blsb-news-l' });
    (all ? ev : ev.slice(0, few)).forEach(function (e) {
      var inner = [h('div', { class: 'blsb-news-t' }, evLine(e)), h('div', { class: 'blsb-news-s' }, [
        h('span', { class: 'blsb-time', title: fullTime(e.created_at), text: ago(e.created_at) }),
        e.slug && pageOf(e.slug) ? h('span', { class: 'blsb-news-go', text: 'See page' }) : null])];
      // the whole item is the tap target when it points at a page card
      list.appendChild(h('li', { class: 'blsb-news-i' }, e.slug && pageOf(e.slug) ? h('a', { class: 'blsb-news-a', href: '#p-' + e.slug }, inner) : h('div', { class: 'blsb-news-b' }, inner)));
    });
    box.appendChild(list);
    if (ev.length > few) box.appendChild(h('button', { type: 'button', class: 'blsb-more', 'aria-expanded': all ? 'true' : 'false', text: all ? 'Show fewer' : 'Show all ' + ev.length, onclick: function () { S.open.news = !all; renderNews(); } }));
  }
  function renderCard(mount) {
    var slug = mount.getAttribute('data-board');
    mount.classList.add('blsb');
    if (guarded(mount)) return;
    clear(mount);
    var p = pageOf(slug);
    if (!S.d || !p) { mount.hidden = true; return; }
    mount.hidden = false;
    var c = countsOf(p), names = approversOf(p);
    var pl = phaseLabel(p);
    add(mount, h('div', { class: 'blsb-cb-row' }, [chip(p), pl ? h('span', { class: 'blsb-phase-l', text: pl }) : null]));
    add(mount, h('p', { class: 'blsb-cb-mean' }, [meaningEl(p)]));
    if (p.note) add(mount, h('p', { class: 'blsb-note' }, [h('b', { text: 'Note from Daniel: ' }), h('span', { text: p.note })]));
    var namesId = 'blsbN-' + slug;
    var open = !!S.open['names:' + slug];
    var row = h('div', { class: 'blsb-cb-row blsb-cb-counts' });
    if (names.length) {
      row.appendChild(h('button', { type: 'button', class: 'blsb-cnt blsb-cnt-ok', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': namesId, text: plural(c.approve || names.length, 'approval'), onclick: function () {
        S.open['names:' + slug] = !S.open['names:' + slug]; renderCard(mount);
      } }));
    } else row.appendChild(h('span', { class: 'blsb-cnt', text: approvalText(0) }));
    var ot = openText(p);
    if (ot) row.appendChild(h('span', { class: 'blsb-cnt blsb-cnt-warn', text: ot }));
    var cm = discussionCount(slug);
    if (cm) row.appendChild(h('span', { class: 'blsb-cnt', text: plural(cm, 'comment') }));
    var fb = h('button', { type: 'button', class: 'blsb-fb', text: 'Feedback' });
    fb.addEventListener('click', function () { openSheet(slug); });
    row.appendChild(fb);
    add(mount, row);
    if (names.length) add(mount, h('p', { class: 'blsb-cb-names', id: namesId, hidden: !open }, [h('b', { text: 'Approved by ' }), names.join(', ')]));
    if (S.admin) add(mount, manageBlock(p, 'card:' + slug));
  }

  // ---------- admin panel on the index ----------
  function renderAdmin() {
    if (!IX) return;
    var box = IX.admin;
    if (!S.admin || !S.d) { box.hidden = true; clear(box); IX.adminBuilt = false; return; }
    box.hidden = false;
    if (!IX.adminBuilt) {
      IX.adminBuilt = true;
      clear(box);
      IX.tab = SS.get('blsb_tab') || 'inbox';
      IX.tabs = h('div', { class: 'blsb-tabs', role: 'tablist', 'aria-label': 'Admin' });
      IX.panes = {};
      [['inbox', 'Inbox'], ['people', 'People'], ['phases', 'Phases']].forEach(function (t) {
        var b = h('button', { type: 'button', class: 'blsb-tab', role: 'tab', id: 'blsbTab-' + t[0], 'aria-controls': 'blsbPane-' + t[0], text: t[1] });
        b.addEventListener('click', function () { IX.tab = t[0]; SS.set('blsb_tab', t[0]); paintTabs(true); });
        IX.tabs.appendChild(b);
        IX.panes[t[0]] = h('div', { class: 'blsb-pane', role: 'tabpanel', id: 'blsbPane-' + t[0], 'aria-labelledby': 'blsbTab-' + t[0] });
      });
      add(box, [h('div', { class: 'blsb-admin-h' }, [h('span', { class: 'blsb-panel-h', text: 'Admin' }), h('span', { class: 'blsb-sub', text: 'Only you see this. Page controls are under Manage on each card.' })]), IX.tabs,
        IX.panes.inbox, IX.panes.people, IX.panes.phases]);
      paintTabs(true);
    } else paintTabs(false);
  }
  function paintTabs(full) {
    $$('.blsb-tab', IX.tabs).forEach(function (b) {
      var on = b.id === 'blsbTab-' + IX.tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    var inboxN = inboxItems().length;
    $('#blsbTab-inbox', IX.tabs).textContent = inboxN ? 'Inbox (' + inboxN + ')' : 'Inbox';
    Object.keys(IX.panes).forEach(function (k) { IX.panes[k].hidden = k !== IX.tab; });
    if (IX.tab === 'inbox') renderInbox();
    if (IX.tab === 'phases' && (full || !IX.panes.phases.firstChild)) renderPhaseEditor();
    if (IX.tab === 'people' && (full || !IX.panes.people.firstChild)) loadPeople();
  }
  function inboxItems() {
    return items().filter(function (i) {
      return !i.parent_id && !i.hidden && i.status === 'open' && (i.kind === 'private' || i.kind === 'concern' || i.kind === 'suggestion' || i.kind === 'help');
    }).sort(byNew);
  }
  function renderInbox() {
    var box = IX.panes.inbox;
    if (guarded(box)) return;
    clear(box);
    var list = inboxItems();
    if (!list.length) { box.appendChild(h('p', { class: 'blsb-empty', text: 'Inbox is clear. Private messages, open concerns, suggestions and help offers show up here.' })); return; }
    list.forEach(function (i) {
      // board-wide items reply in the index panel on a computer, in the sheet on a phone (the panel is folded away there)
      var inPanel = i.slug == null && DESK.matches;
      var comp = inPanel ? IX.discComp : compFor(i.slug);
      box.appendChild(itemEl(i, i.kind === 'private' ? null : comp, { showPage: true, onReply: function () {
        if (inPanel) { IX.discComp.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); IX.discComp.focus(); }
        else openSheet(i.slug, { compose: true });
      } }));
    });
  }
  function loadPeople() {
    var box = IX.panes.people;
    clear(box).appendChild(h('p', { class: 'blsb-loading', text: 'Loading the roster...' }));
    api('admin_people').catch(function (e) {
      if (e && (e.status === 404 || e.status === 405)) return api('admin_people', {});
      throw e;
    }).then(function (r) {
      S.people = (r && (r.people || r.items || r.rows)) || [];
      renderPeople();
    }, function (e) { clear(box).appendChild(h('p', { class: 'blsb-msg blsb-err', text: errText(e) })); });
  }
  function personCall(body, msg) {
    return api('admin_person', body).then(function () { toast(msg); loadPeople(); load(); }, function (e) { toast(errText(e)); throw e; });
  }
  function renderPeople() {
    var box = clear(IX.panes.people);
    var list = (S.people || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    add(box, h('p', { class: 'blsb-sub', text: 'This is the list in the "Who are you?" picker. Changes show for everyone right away.' }));
    var ul = h('div', { class: 'blsb-rows' });
    function move(idx, dir) {
      var arr = list.slice();
      var j = idx + dir;
      if (j < 0 || j >= arr.length) return;
      var tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
      var calls = [];
      arr.forEach(function (p, n) { var s = (n + 1) * 10; if (p.sort !== s) calls.push(api('admin_person', { id: p.id, name: p.name, role: p.role, sort: s, active: p.active !== false })); });
      Promise.all(calls).then(function () { toast('Order saved.'); loadPeople(); load(); }, function (e) { toast(errText(e)); loadPeople(); });
    }
    list.forEach(function (p, idx) {
      var nId = uid(), rId = uid(), aId = uid();
      var n = trackDirty(h('input', { id: nId, class: 'blsb-in', type: 'text', maxlength: '80', value: p.name || '' }), p.name || '');
      var r = trackDirty(h('input', { id: rId, class: 'blsb-in', type: 'text', maxlength: '80', value: p.role || '' }), p.role || '');
      var a = h('input', { id: aId, class: 'blsb-check', type: 'checkbox', checked: p.active !== false });
      // Save shows only on the row being edited
      var save = h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Save changes', hidden: true });
      var showSave = function () { save.hidden = !n.classList.contains('blsb-dirty') && !r.classList.contains('blsb-dirty'); };
      n.addEventListener('input', showSave); r.addEventListener('input', showSave);
      save.addEventListener('click', function () {
        if (n.value.trim().length < 2) { toast('Names need at least 2 characters.'); return; }
        save.disabled = true;
        personCall({ id: p.id, name: n.value.trim(), role: r.value.trim(), sort: p.sort, active: a.checked }, 'Saved.').catch(function () { save.disabled = false; });
      });
      a.addEventListener('change', function () { personCall({ id: p.id, name: p.name, role: p.role, sort: p.sort, active: a.checked }, a.checked ? 'Shown in the picker.' : 'Hidden from the picker.'); });
      ul.appendChild(h('div', { class: 'blsb-prow' + (p.active === false ? ' blsb-off' : '') }, [
        h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: nId, text: 'Name' }), n]),
        h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: rId, text: 'Role' }), r]),
        h('div', { class: 'blsb-prow-acts' }, [
          h('label', { class: 'blsb-checkl', for: aId }, [a, h('span', { text: 'In picker' })]),
          h('button', { type: 'button', class: 'blsb-mini', text: 'Up', 'aria-label': 'Move ' + p.name + ' up', disabled: idx === 0, onclick: function () { move(idx, -1); } }),
          h('button', { type: 'button', class: 'blsb-mini', text: 'Down', 'aria-label': 'Move ' + p.name + ' down', disabled: idx === list.length - 1, onclick: function () { move(idx, 1); } }),
          save,
          twoTap('Remove', 'Tap again to remove', function () { personCall({ id: p.id, delete: true }, 'Removed.'); }, 'blsb-mini-warn')
        ])
      ]));
    });
    add(box, ul);
    var nId2 = uid(), rId2 = uid();
    var nn = h('input', { id: nId2, class: 'blsb-in', type: 'text', maxlength: '80' });
    var rr = h('input', { id: rId2, class: 'blsb-in', type: 'text', maxlength: '80' });
    var addB = h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Add person' });
    addB.addEventListener('click', function () {
      if (nn.value.trim().length < 2) { toast('Type a name first.'); nn.focus(); return; }
      var max = list.reduce(function (m, p) { return Math.max(m, p.sort || 0); }, 0);
      addB.disabled = true;
      personCall({ name: nn.value.trim(), role: rr.value.trim(), sort: max + 10, active: true }, 'Added.').catch(function () { addB.disabled = false; });
    });
    add(box, h('div', { class: 'blsb-prow blsb-prow-new' }, [
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: nId2, text: 'New name' }), nn]),
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: rId2, text: 'Role' }), rr]),
      h('div', { class: 'blsb-prow-acts' }, [addB])
    ]));
  }
  function renderPhaseEditor() {
    var box = clear(IX.panes.phases);
    var list = phases();
    add(box, h('p', { class: 'blsb-sub', text: 'Phases group pages into pushes. Set each page\'s phase under Manage on its card.' }));
    var rows = h('div', { class: 'blsb-rows' });
    function phaseCall(body, msg) {
      return adminCall('admin_phase', body, msg).then(function () { renderPhaseEditor(); });
    }
    function move(idx, dir) {
      var arr = list.slice(), j = idx + dir;
      if (j < 0 || j >= arr.length) return;
      var tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
      var calls = [];
      arr.forEach(function (ph, n) { var s = (n + 1) * 10; if (ph.sort !== s) calls.push(api('admin_phase', { id: ph.id, name: ph.name, target_date: ph.target_date || null, note: ph.note || null, sort: s })); });
      Promise.all(calls).then(function () { toast('Order saved.'); return load(); }, function (e) { toast(errText(e)); }).then(renderPhaseEditor);
    }
    list.forEach(function (ph, idx) {
      var nId = uid(), dId = uid(), tId = uid();
      var n = trackDirty(h('input', { id: nId, class: 'blsb-in', type: 'text', maxlength: '80', value: ph.name || '' }), ph.name || '');
      var d = trackDirty(h('input', { id: dId, class: 'blsb-in', type: 'date', value: ph.target_date ? String(ph.target_date).slice(0, 10) : '' }), ph.target_date ? String(ph.target_date).slice(0, 10) : '');
      var t = trackDirty(h('input', { id: tId, class: 'blsb-in', type: 'text', maxlength: '300', value: ph.note || '' }), ph.note || '');
      var save = h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Save' });
      save.addEventListener('click', function () {
        if (!n.value.trim()) { toast('Give the phase a name.'); return; }
        save.disabled = true;
        phaseCall({ id: ph.id, name: n.value.trim(), target_date: d.value || null, note: t.value.trim() || null, sort: ph.sort }, 'Phase saved.').catch(function () { save.disabled = false; });
      });
      var count = pages().filter(function (p) { return p.phase_id === ph.id; }).length;
      rows.appendChild(h('div', { class: 'blsb-prow' }, [
        h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: nId, text: 'Name' }), n]),
        h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: dId, text: 'Target date' }), d]),
        h('div', { class: 'blsb-field blsb-field-wide' }, [h('label', { class: 'blsb-label', for: tId, text: 'Short note' }), t]),
        h('div', { class: 'blsb-prow-acts' }, [
          h('span', { class: 'blsb-muted blsb-small', text: plural(count, 'page') }),
          h('button', { type: 'button', class: 'blsb-mini', text: 'Up', 'aria-label': 'Move ' + ph.name + ' up', disabled: idx === 0, onclick: function () { move(idx, -1); } }),
          h('button', { type: 'button', class: 'blsb-mini', text: 'Down', 'aria-label': 'Move ' + ph.name + ' down', disabled: idx === list.length - 1, onclick: function () { move(idx, 1); } }),
          save,
          twoTap('Delete', 'Tap again to delete', function () { phaseCall({ id: ph.id, name: ph.name, delete: true }, 'Phase deleted.'); }, 'blsb-mini-warn')
        ])
      ]));
    });
    if (!list.length) rows.appendChild(h('p', { class: 'blsb-empty', text: 'No phases yet.' }));
    add(box, rows);
    var nId2 = uid(), dId2 = uid(), tId2 = uid();
    var nn = h('input', { id: nId2, class: 'blsb-in', type: 'text', maxlength: '80', placeholder: 'Phase 3' });
    var dd = h('input', { id: dId2, class: 'blsb-in', type: 'date' });
    var tt = h('input', { id: tId2, class: 'blsb-in', type: 'text', maxlength: '300' });
    var addB = h('button', { type: 'button', class: 'blsb-mini blsb-mini-go', text: 'Add phase' });
    addB.addEventListener('click', function () {
      if (!nn.value.trim()) { toast('Give the phase a name.'); nn.focus(); return; }
      var max = list.reduce(function (m, ph) { return Math.max(m, ph.sort || 0); }, 0);
      addB.disabled = true;
      phaseCall({ name: nn.value.trim(), target_date: dd.value || null, note: tt.value.trim() || null, sort: max + 10 }, 'Phase added.').catch(function () { addB.disabled = false; });
    });
    add(box, h('div', { class: 'blsb-prow blsb-prow-new' }, [
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: nId2, text: 'New phase' }), nn]),
      h('div', { class: 'blsb-field' }, [h('label', { class: 'blsb-label', for: dId2, text: 'Target date' }), dd]),
      h('div', { class: 'blsb-field blsb-field-wide' }, [h('label', { class: 'blsb-label', for: tId2, text: 'Short note' }), tt]),
      h('div', { class: 'blsb-prow-acts' }, [addB])
    ]));
  }

  // ---------- deep links: #blsb=<item id> ----------
  function deepLink() {
    var m = /[#&]blsb=([^&]+)/.exec(location.hash || '');
    if (!m || !S.d) return;
    var id;
    try { id = decodeURIComponent(m[1]); } catch (e) { return; }
    var it = null;
    items().forEach(function (i) { if (i.id === id) it = i; });
    if (!it) return;
    if (it.parent_id) items().forEach(function (i) { if (i.id === it.parent_id) it = i; });
    if (PAGE && it.slug === PAGE && it.variant === VARIANT && it.pin_x != null && pinFits(it) && !pinsOff()) { setTimeout(function () { showPin(it.id); }, 600); return; }
    if (it.slug != null && (IS_INDEX || it.slug === PAGE)) { openSheet(it.slug, { focus: it.id }); return; }
    if (it.slug == null && IS_INDEX && IX) {
      var target = it;
      // Daniel's email links: open items wait in the Inbox; anything else is in the board discussion
      if (S.admin && inboxItems().some(function (x) { return x.id === target.id; })) {
        IX.tab = 'inbox'; SS.set('blsb_tab', 'inbox'); renderAdmin(); paintTabs(true);
        setTimeout(function () { focusItem(target.id, IX.panes.inbox); }, 120);
      } else if (DESK.matches) {
        S.open['thread:_:ix'] = true; renderIndex();
        setTimeout(function () { focusItem(target.id, IX.discThread); }, 120);
      } else openSheet(null, { focus: target.id });
    }
  }

  // ---------- start ----------
  function init() {
    if (!document.body) return;
    ROOT = h('div', { id: 'blsbRoot', class: 'blsb' });
    document.body.appendChild(ROOT);
    if (PAGE) setupBar();
    if (IS_INDEX) setupIndex();
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusout', function () {
      setTimeout(function () { if (S.pending) { S.pending = false; renderAll(); } }, 80);
    });
    renderAll();
    load().then(deepLink);
    if (/[?&]admin(=|&|$)/.test(location.search) && !S.pin) openPin();
    setInterval(tick, 1000);
    setInterval(function () { if (!document.hidden) load(); }, 60000);
    setInterval(watchPins, 1500);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - S.at > 30000) load(); });
    window.addEventListener('resize', function () {
      cancelAnimationFrame(PINS.raf);
      // crossing the phone/computer line changes which pins belong on screen
      PINS.raf = requestAnimationFrame(function () { if (PINS.cls && PINS.cls !== myClass()) { renderPins(); if (SH.open) renderSheet(); } else positionPins(); });
    });
    window.addEventListener('load', positionPins);
    window.addEventListener('hashchange', deepLink);
    if (DESK.addEventListener) DESK.addEventListener('change', function () { stack.forEach(function (d) { d.show(); }); lockScroll(); renderAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
