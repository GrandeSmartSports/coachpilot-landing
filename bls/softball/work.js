// Working copy of the BLS Softball Run Book: edit text, highlight, leave notes. Loaded only from the working link.
(() => {
  const API = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/bls-runbook";
  const KEY = window.BLS_RUNBOOK_KEY;
  const doc = document.getElementById("doc"), bar = document.querySelector(".bar-edit"), body = document.body;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = { get: k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  let name = store.get("bls_runbook_name"), state = { docs: {}, notes: [] }, editing = false, before = "", openForm = null;

  const call = async (action, payload) => {
    const r = await fetch(API + "?book=softball&action=" + action, payload
      ? { method: "POST", headers: { "content-type": "application/json", "x-runbook-key": KEY }, body: JSON.stringify(payload) }
      : { headers: { "x-runbook-key": KEY } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong. Try again."), { status: r.status, data: j });
    return j;
  };

  // Only plain page markup comes back from the server; anything else is dropped before it is shown.
  const TAGS = new Set(["HEADER", "MAIN", "SECTION", "DIV", "H1", "H2", "H3", "P", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "MARK", "SPAN", "BR", "FONT"]);
  const clean = html => {
    const d = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html").body.firstChild;
    d.querySelectorAll("*").forEach(n => {
      if (!TAGS.has(n.tagName)) { n.replaceWith(document.createTextNode(n.textContent)); return; }
      [...n.attributes].forEach(a => {
        const ok = a.name === "class" || (a.name === "style" && !/url|expression|import|position|javascript/i.test(a.value));
        if (!ok) n.removeAttribute(a.name);
      });
    });
    return d.innerHTML;
  };
  const cur = () => doc.querySelector(".division:not([hidden])");
  const when = iso => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const title = sec => { const h = sec.querySelector("h2"); return h && h.firstChild ? h.firstChild.textContent.trim() : ""; };

  const askName = () => new Promise(res => {
    const wrap = el("div", "wk-name"), f = el("form"), inp = el("input"), go = el("button", "go", "Continue");
    f.append(el("label", "", "Your name"), inp, go); wrap.append(f); body.append(wrap);
    inp.value = name; inp.autocomplete = "name"; inp.setAttribute("aria-label", "Your name"); inp.focus();
    f.onsubmit = e => { e.preventDefault(); const v = inp.value.replace(/\s+/g, " ").trim(); if (!v) return; name = v; store.set("bls_runbook_name", v); wrap.remove(); paintTop(); res(v); };
  });
  const needName = async () => name || askName();

  const top = el("div", "wk-top");
  const paintTop = () => {
    top.textContent = "";
    top.append(el("span", "", "Working copy" + (name ? " · " + name : "")));
    const b = el("button", "", name ? "Change name" : "Add your name"); b.type = "button"; b.onclick = askName; top.append(b);
  };

  const noteBox = n => {
    const box = el("div", "wk-note" + (n.done_at ? " done" : ""));
    box.append(el("div", "who", n.by_name + " · " + when(n.created_at) + (n.done_at ? " · done by " + n.done_by : "")), el("div", "txt", n.body));
    const b = el("button", "", n.done_at ? "Reopen" : "Mark done"); b.type = "button";
    b.onclick = async () => { await needName(); b.disabled = true; try { state = await call("note_done", { name, division: n.division, id: n.id, done: !n.done_at }); paint(); } catch (e) { b.disabled = false; say(e.message); } };
    box.append(b); return box;
  };
  const notesBlock = (division, section, label) => {
    const w = el("div", "wk"), mine = state.notes.filter(n => n.division === division && n.section === section);
    mine.filter(n => !n.done_at).forEach(n => w.append(noteBox(n)));
    const done = mine.filter(n => n.done_at);
    if (done.length) { const d = el("details"); d.append(el("summary", "", "Done notes (" + done.length + ")")); done.forEach(n => d.append(noteBox(n))); w.append(d); }
    const add = el("button", "", label); add.type = "button";
    const id = division + "|" + section;
    const open = () => {
      openForm = id; add.hidden = true;
      const ta = el("textarea"), row = el("div", "row"), go = el("button", "go", "Save note"), no = el("button", "", "Cancel");
      ta.setAttribute("aria-label", "Note"); go.type = no.type = "button"; row.append(go, no); w.append(ta, row); ta.focus();
      no.onclick = () => { openForm = null; paint(); };
      go.onclick = async () => {
        const text = ta.value.trim(); if (!text) { ta.focus(); return; }
        await needName(); go.disabled = true;
        try { state = await call("note", { name, division, section, body: text }); openForm = null; paint(); } catch (e) { go.disabled = false; say(e.message); }
      };
    };
    add.onclick = open; w.append(add);
    if (openForm === id) open();
    return w;
  };

  // Notes hang off a section by its heading. A note whose heading no longer exists shows under the page notes.
  const paint = () => {
    if (editing) return;
    doc.querySelectorAll(".wk, .wk-last").forEach(n => n.remove());
    doc.querySelectorAll(".division").forEach(div => {
      const d = state.docs[div.id], sheet = div.querySelector(".sheet"), heroIn = div.querySelector(".hero .in");
      if (d && heroIn) heroIn.append(el("div", "wk-last", "Last change: " + d.by + ", " + when(d.at)));
      if (!sheet) return;
      const secs = [...sheet.querySelectorAll("section.card")], titles = new Set(secs.map(title));
      secs.forEach(s => s.append(notesBlock(div.id, title(s), "Add a note here")));
      const gen = el("div", "wk wk-general"); gen.append(el("h3", "", "Notes on this page"));
      state.notes.filter(n => n.division === div.id && n.section && !titles.has(n.section)).forEach(n => { const b = noteBox(n); b.querySelector(".who").textContent += " · on " + n.section; gen.append(b); });
      gen.append(notesBlock(div.id, "", "Add a note about the whole page"));
      sheet.prepend(gen);
    });
  };
  const apply = () => {
    doc.querySelectorAll(".division").forEach(div => { const d = state.docs[div.id]; if (d && div.dataset.v !== String(d.version)) { div.innerHTML = clean(d.html); div.dataset.v = String(d.version); } });
    paint();
  };

  // Bottom bar
  const msg = el("div", "msg"); msg.hidden = true;
  let t; const say = text => { msg.textContent = text; msg.hidden = false; clearTimeout(t); t = setTimeout(() => { msg.hidden = true; }, 8000); };
  const btn = (label, fn, cls) => { const b = el("button", cls || "", label); b.type = "button"; b.hidden = true; b.onmousedown = e => e.preventDefault(); b.onclick = fn; bar.append(b); return b; };
  const pdf = document.getElementById("pdf");
  const bEdit = btn("Edit", () => edit(true), "main");
  const fmt = cmd => () => { document.execCommand("styleWithCSS", false, false); if (cmd === "hl") document.execCommand("hiliteColor", false, "#fff3a3") || document.execCommand("backColor", false, "#fff3a3"); else document.execCommand(cmd, false, null); };
  const bHl = btn("Highlight", fmt("hl")), bSt = btn("Strike", fmt("strikeThrough")), bCl = btn("Clear", fmt("removeFormat"));
  const bSave = btn("Save", () => save(), "main"), bCancel = btn("Cancel", () => { cur().innerHTML = before; edit(false); });
  bar.prepend(msg); bEdit.hidden = false;
  const zones = () => cur().querySelectorAll(".hero .in, .sheet");
  const edit = async on => {
    if (on) { await needName(); doc.querySelectorAll(".wk, .wk-last").forEach(n => n.remove()); before = cur().innerHTML; }
    editing = on; body.classList.toggle("editing", on);
    zones().forEach(z => on ? z.setAttribute("contenteditable", "true") : z.removeAttribute("contenteditable"));
    pdf.hidden = bEdit.hidden = on; [bHl, bSt, bCl, bSave, bCancel].forEach(b => { b.hidden = !on; });
    if (on) cur().querySelector(".sheet").focus(); else paint();
  };
  const save = async () => {
    const div = cur(), copy = div.cloneNode(true);
    copy.querySelectorAll("[contenteditable]").forEach(n => n.removeAttribute("contenteditable"));
    const html = clean(copy.innerHTML);
    bSave.disabled = true;
    try {
      const r = await call("save", { name, division: div.id, html, base_version: state.docs[div.id] ? state.docs[div.id].version : null });
      state.docs[div.id] = { version: r.version, html, by: r.by, at: r.at }; div.dataset.v = String(r.version);
      edit(false); say("Saved");
    } catch (e) {
      say(e.status === 409 ? e.data.by + " saved this page while you were editing. Copy what you changed, tap Cancel, and add it again." : e.message);
    }
    bSave.disabled = false;
  };
  window.addEventListener("beforeunload", e => { if (editing) { e.preventDefault(); e.returnValue = ""; } });

  const load = async () => { if (editing || openForm) return; try { state = await call("state"); apply(); } catch (e) { if (e.status === 401 || e.status === 429) { top.textContent = e.message; bEdit.hidden = true; } } };
  document.querySelector(".draft").after(top); paintTop();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  load();
})();
