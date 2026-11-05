#!/usr/bin/env python3
"""Build the BLS website preview (Today vs Proposed) from saved live pages.

  python3 build.py            build every page + index
  python3 build.py fallball   build one page (+ index)
  BASE=http://localhost:8767/bls/preview python3 build.py   (local links)

Inputs
  pages.json            slug -> {title, tabid | new+template, hidden}
  raw/<slug>.html       saved live page (refresh with capture step in README)
  site.css              the shared BLS style block (same CSS that goes into Sports Connect)
  proposals/<slug>.json what changes on that page:
      {
        "modules":  {"<mid>": {"file": "modules/x.html", "title": "New title"}},
        "insert_before": [{"mid": "<existing mid>", "file": "modules/x.html", "title": "Title"}],
        "insert_after":  [{"mid": "<existing mid>", "file": "modules/x.html", "title": "Title"}],
        "hide":     ["<mid>", ...],
        "page_title": "browser tab title (new pages)",
        "extra_css": "modules/x.css",            (home page only; inner pages get site.css)
        "rotator":  ["img/slides/a.png", ...],   (home page only; replaces slides in order, drops the rest;
                                                  an entry may be {"img", "link", "caption", "alt"})
        "status":   "Ready" | "Needs facts: ...",
        "summary":  "one line shown on the index (Daniel's admin view)",
        "blurb":    "one plain sentence for board members (the index shows it instead of summary)"
      }
The module HTML files are exactly what gets pasted into the Sports Connect content blocks.
"""
import json, os, re, sys, copy, hashlib
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get('BASE', 'https://go.blslittleleague.org/bls/preview').rstrip('/')
CFG = json.load(open(os.path.join(HERE, 'pages.json')))
SITE_CSS = open(os.path.join(HERE, 'site.css')).read()
TAB2SLUG = {c['tabid']: s for s, c in CFG.items() if c.get('tabid')}


def read(p):
    return open(os.path.join(HERE, p), encoding='utf-8', errors='ignore').read()


# Build board (board/board.js + board/board.css): feedback, approvals and page states on every page.
BOARD_V = hashlib.md5((read('board/board.js') + read('board/board.css')).encode()).hexdigest()[:10]


def board_head():
    return f'<link rel="stylesheet" href="{BASE}/board/board.css?v={BOARD_V}">'


def board_scripts(page=None, variant=None, index=False):
    cfg = {'base': BASE, 'page': page, 'variant': variant, 'index': index,
           'pages': {s: {'t': c['title'], 'req': needs(s)} for s, c in CFG.items()}}
    data = json.dumps(cfg, ensure_ascii=False).replace('<', '\\u003c')
    return f'<script>window.BLSB={data};</script><script src="{BASE}/board/board.js?v={BOARD_V}" defer></script>'


def needs(slug, prop=None):
    """Blockers for go-live only (proposal "required"). Everything else lives in "later" and is not shown."""
    prop = prop if prop is not None else proposal(slug)
    return list(prop.get('required') or [])


def proposal(slug):
    p = os.path.join(HERE, 'proposals', slug + '.json')
    return json.load(open(p)) if os.path.exists(p) else {}


def target_slug(href):
    if not href:
        return None
    h = href.replace('&amp;', '&')
    if 'newsid=' in h:
        return None
    m = re.search(r'tabid=(\d+)', h)
    if m:
        t = m.group(1)
        if t == '716835' and 'ctl=' in h:
            return None
        return TAB2SLUG.get(t)
    if re.fullmatch(r'(https?://(www\.)?blslittleleague\.org)?/?', h.strip()):
        return 'home'
    return None


def module_shell(soup, template_mod, mid, title, html):
    """Clone an existing HTML module wrapper so inserted blocks look exactly like Sports Connect ones."""
    new = copy.copy(template_mod)
    new['class'] = [c if not re.fullmatch(r'DnnModule-\d+', c) else f'DnnModule-{mid}' for c in new.get('class', [])]
    head = new.select_one('h2.head')
    if head is not None:
        head.clear()
        head.append(title or '')
    normal = new.select_one('.Normal')
    normal.clear()
    normal.append(BeautifulSoup(html, 'html.parser'))
    return new


def build(slug, variant):
    cfg = CFG[slug]
    src_slug = cfg.get('template') if cfg.get('new') else slug
    soup = BeautifulSoup(read(f'raw/{src_slug}.html'), 'html.parser')
    prop = proposal(slug) if variant == 'proposed' else {}

    # template HTML module (for inserted blocks): FAQ page's module
    tmpl_soup = BeautifulSoup(read('raw/faq.html'), 'html.parser')
    template_mod = tmpl_soup.select_one('div.DnnModule-DNN_HTML')

    if cfg.get('new'):
        mod = soup.select_one('div.DnnModule-DNN_HTML')
        if variant == 'today':
            normal = mod.select_one('.Normal'); normal.clear()
            # a new page can show what it replaces today (e.g. a Word file) via "today_file"
            today_html = read(cfg['today_file']) if cfg.get('today_file') else '<p style="padding:24px 0;font-size:16px">This page does not exist yet. Switch to Proposed to see it.</p>'
            normal.append(BeautifulSoup(today_html, 'html.parser'))
            head = mod.select_one('h2.head'); head.clear(); head.append(cfg['title'])
        if soup.title:
            soup.title.string = f"Bonney Lake Sumner Little League > {prop.get('page_title') or cfg['title']}"

    if variant == 'proposed':
        for mid, spec in (prop.get('modules') or {}).items():
            mod = soup.select_one(f'div.DnnModule-{mid}') or (soup.select_one('div.DnnModule-DNN_HTML') if cfg.get('new') else None)
            if mod is None:
                print(f'  ! {slug}: module {mid} not found'); continue
            if spec.get('file'):
                normal = mod.select_one('.Normal'); normal.clear()
                normal.append(BeautifulSoup(read(spec['file']), 'html.parser'))
            if spec.get('title') is not None:
                head = mod.select_one('h2.head')
                if head is not None:
                    head.clear(); head.append(spec['title'])
        for where in ('insert_before', 'insert_after'):
            for i, spec in enumerate(prop.get(where) or []):
                anchor = soup.select_one(f"div.DnnModule-{spec['mid']}")
                if anchor is None:
                    print(f"  ! {slug}: anchor {spec['mid']} not found"); continue
                block = module_shell(soup, template_mod, spec.get('new_mid', f'90000{i}'), spec.get('title', ''), read(spec['file']))
                (anchor.insert_before if where == 'insert_before' else anchor.insert_after)(block)
        for mid in prop.get('hide') or []:
            m = soup.select_one(f'div.DnnModule-{mid}')
            if m is not None:
                m.decompose()
        if prop.get('rotator'):
            # Home Content Rotator: one <li> per slide in #slider1110520. An entry is "img/slides/x.png" or
            # {"img", "link", "caption", "alt"}. Slides past the end of the list are removed (count = slides shown).
            slides = soup.select('#slider1110520 ul.skList > li')
            for li, spec in zip(slides, prop['rotator']):
                spec = spec if isinstance(spec, dict) else {'img': spec}
                img = li.find('img')
                img['src'] = img['data-thumb'] = f"{BASE}/{spec['img']}"
                img['alt'] = spec.get('alt') or os.path.basename(spec['img'])
                if 'link' in spec:
                    a = li.find('a')
                    if a is None:
                        a = soup.new_tag('a'); img.wrap(a)
                    a['href'] = spec['link']
                    if 'blslittleleague.org' in spec['link'] or spec['link'].startswith('/'):
                        a.attrs.pop('target', None)
                if 'caption' in spec:
                    cap = li.select_one('.skCaption .skTitle')
                    if cap is not None:
                        cap.clear(); cap.append(spec['caption'])
            for li in slides[len(prop['rotator']):]:
                li.decompose()

    # links between preview pages
    for a in soup.find_all('a', href=True):
        t = target_slug(a['href'])
        if t:
            a['href'] = f'{BASE}/{variant}/{t}.html'

    head = soup.head
    head.insert(0, BeautifulSoup('<base href="https://www.blslittleleague.org/"><meta name="robots" content="noindex,nofollow">'
                                 '<style>#onetrust-consent-sdk,#onetrust-banner-sdk,.onetrust-pc-dark-filter{display:none!important}</style>', 'html.parser'))
    if variant == 'proposed':
        css = SITE_CSS
        if prop.get('extra_css'):
            css += '\n' + read(prop['extra_css'])
        head.append(BeautifulSoup(f'<style id="bls-site-style">{css}</style>', 'html.parser'))
    head.append(BeautifulSoup(board_head(), 'html.parser'))

    on, off = 'background:#cd163f;color:#fff;', 'background:#fff;color:#00013a;'
    def seg(v, label):
        return f'<a href="{BASE}/{v}/{slug}.html" style="{on if v == variant else off}flex:1;text-align:center;padding:11px 6px;border-radius:999px;font:700 15px/1 Arial,sans-serif;text-decoration:none;">{label}</a>'
    # Previous / Next page in pages.json order, same version, so a reader can walk the pages without backing out (Coach 11/4)
    order = list(CFG); i = order.index(slug)
    def nav(target, label):
        st = 'flex:0 0 auto;display:flex;align-items:center;padding:0 12px;border-radius:999px;font:700 14px/1 Arial,sans-serif;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.35);white-space:nowrap;'
        if target is None:
            return f'<span aria-hidden="true" style="{st}opacity:.3;border-color:transparent;">{label}</span>'
        word = 'Previous' if 'Prev' in label else 'Next'
        return f'<a href="{BASE}/{variant}/{target}.html" title="{CFG[target]["title"]}" aria-label="{word} page: {CFG[target]["title"]}" style="{st}">{label}</a>'
    bar = (f'<div id="blsPreviewBar" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#00013a;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 16px rgba(0,0,0,.35);">'
           f'<div id="blsbBar" class="blsb"></div>'
           f'<div id="blsSwitch" style="display:flex;gap:6px;max-width:560px;margin:0 auto 6px;">{nav(order[i - 1] if i > 0 else None, "&lsaquo; Prev")}{seg("today", "Today")}{seg("proposed", "Proposed")}{nav(order[i + 1] if i + 1 < len(order) else None, "Next &rsaquo;")}</div>'
           f'<div id="blsPreviewInfo" style="text-align:center;color:#c9d3f2;font:600 12px/1.3 Arial,sans-serif;">PREVIEW · {cfg["title"]} · <a href="{BASE}/#p-{slug}" style="color:#fff;">All pages</a></div>'
           + needs_panel(slug) + '</div><div id="blsPreviewSpacer" style="height:96px"></div>'
           + board_scripts(page=slug, variant=variant))
    soup.body.append(BeautifulSoup(bar, 'html.parser'))
    out = os.path.join(HERE, variant, slug + '.html')
    open(out, 'w').write(str(soup))
    return out


def needs_panel(slug):
    """Facts only (the board's page state says whether a page is ready). board.js hides this once the board loads,
    and the Feedback sheet lists the same facts."""
    items = needs(slug)
    if not items:
        return '<div id="blsNeeds" style="text-align:center;color:#9be3b5;font:700 12px/1.6 Arial,sans-serif;">All facts in</div>'
    lis = ''.join(f'<li style="margin:4px 0">{x}</li>' for x in items)
    return (f'<details id="blsNeeds" style="max-width:520px;margin:6px auto 0;color:#fff;font:500 14px/1.4 Arial,sans-serif;">'
            f'<summary style="cursor:pointer;text-align:center;color:#ffd166;font-weight:700;list-style:none;">Facts needed ({len(items)})</summary>'
            f'<ul style="margin:8px 0 4px;padding:10px 12px 10px 28px;background:#fff;color:#0a0f2e;border-radius:10px;max-height:45vh;overflow:auto;">{lis}</ul></details>')


def index():
    def thumb(slug, variant):
        for f in (f'img/{slug}-{variant}-phone-thumb.jpg', f'img/{slug}-{variant}-phone.jpg'):
            if os.path.exists(os.path.join(HERE, f)):
                return f
        return None

    def card(slug, cfg):
        prop = proposal(slug)
        items = needs(slug, prop)
        new = bool(cfg.get('new'))
        tag, tcls = ('New page', 'new') if new else (('Hidden today', 'hid') if cfg.get('hidden') else ('Existing page', 'old'))
        shots = []
        for v, label in (('today', 'Today'), ('proposed', 'Proposed')):
            t = thumb(slug, v)
            if v == 'today' and new and not cfg.get('today_file'):
                pic = '<span class="none">Nothing here today.<br>This page is new.</span>'
            elif t:
                pic = f'<img src="{t}" alt="{cfg["title"]}, {label.lower()}, on a phone" loading="lazy">'
            else:
                pic = '<span class="none">No picture yet</span>'
            shots.append(f'<a class="shot {v}" href="{v}/{slug}.html"><span class="lbl">{label}</span><span class="pic">{pic}</span></a>')
        # facts only; the live page state (chip above) is the one word on readiness
        # board members read the one-sentence blurb; Daniel (html.blsb-admin) reads the full summary
        desc = (f'<p class="blurb">{prop["blurb"]}</p><p class="sum">{prop.get("summary", "")}</p>' if prop.get('blurb')
                else f'<p>{prop.get("summary", "")}</p>')
        status = (f'<div class="st todo"><b>Facts needed ({len(items)})</b><ul>' + ''.join(f'<li>{x}</li>' for x in items) + '</ul></div>') if items \
            else '<div class="st ok"><b>All facts in</b></div>'
        return f'''<article class="card" id="p-{slug}">
  <div class="top"><span class="tag {tcls}">{tag}</span><h2>{cfg["title"]}</h2>{desc}</div>
  <div class="blsb" data-board="{slug}" hidden></div>
  <div class="pair">{''.join(shots)}</div>
  {status}
  <div class="btns"><a href="today/{slug}.html">Open Today</a><a class="pri" href="proposed/{slug}.html">Open Proposed</a></div>
</article>'''

    old = [(s_, c) for s_, c in CFG.items() if not c.get('new')]
    new = [(s_, c) for s_, c in CFG.items() if c.get('new')]
    ready = sum(1 for s_ in CFG if not needs(s_, proposal(s_)))
    html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow">
<title>BLS Website Preview</title><style>
:root{{--navy:#00013a;--red:#cd163f;--blue:#1452a0;--bg:#eef2f6;--line:#d9dfea;--muted:#4b5675}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);font:400 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0a0f2e;padding:0 16px 48px}}
header{{margin:0 -16px 18px;background:var(--navy);color:#fff;padding:20px 16px;border-bottom:5px solid var(--red)}}
.hin{{max-width:1180px;margin:0 auto;display:flex;gap:14px;align-items:center}}
header img{{width:52px;height:52px;background:#fff;border-radius:10px;padding:4px;flex:none}}header p{{margin:0;font:700 12px/1 Arial;letter-spacing:.1em;color:#c9d3f2;text-transform:uppercase}}header h1{{margin:6px 0 0;font-size:24px;line-height:1.15}}header p.hs{{margin:6px 0 0;font:400 15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:0;text-transform:none;color:#dfe5f7}}
main{{max-width:1180px;margin:0 auto}}
.intro{{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 18px}}.intro p{{margin:0 0 10px;color:var(--muted)}}
.counts{{display:flex;flex-wrap:wrap;gap:8px;margin:0}}.counts span{{background:var(--bg);border-radius:999px;padding:6px 12px;font-weight:700;font-size:14px}}.counts .g{{color:#127a3a}}.counts .a{{color:#a35200}}
h2.sec{{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--red);margin:26px 0 10px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}}
.card{{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(0,1,58,.06)}}
.top{{padding:16px 16px 10px}}.top h2{{margin:8px 0 6px;font-size:26px;line-height:1.1;color:var(--navy)}}.top p{{margin:0;font-size:14.5px;color:var(--muted)}}
.tag{{display:inline-block;font:800 12px/1 Arial;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px}}
.tag.new{{background:var(--red);color:#fff}}.tag.old{{background:var(--navy);color:#fff}}.tag.hid{{background:#5d6785;color:#fff}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 16px 12px}}
.shot{{display:block;text-decoration:none;color:inherit}}.lbl{{display:block;font:800 13px/1 Arial;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px;color:#5d6785}}.shot.proposed .lbl{{color:var(--red)}}
.pic{{display:block;aspect-ratio:390/620;overflow:hidden;border-radius:10px;border:2px solid var(--line);background:#dfe5ee}}.shot.proposed .pic{{border-color:var(--red)}}
.pic img{{width:100%;display:block}}.none{{display:grid;place-items:center;height:100%;padding:10px;text-align:center;font-size:14px;color:var(--muted)}}
.st{{margin:0 16px 12px;padding:10px 12px;border-radius:10px;font-size:14.5px}}.st.ok{{background:#e8f6ee;color:#127a3a}}.st.todo{{background:#fff4e5;color:#7a3e00}}
.st ul{{margin:6px 0 0;padding-left:18px;color:#0a0f2e}}.st li{{margin:3px 0}}
.btns{{display:flex;gap:8px;margin-top:auto;padding:0 16px 16px}}.btns a{{flex:1;text-align:center;padding:11px;border-radius:999px;border:1px solid var(--line);color:var(--navy);font-weight:700;text-decoration:none}}.btns a.pri{{background:var(--red);color:#fff;border-color:var(--red)}}
.card{{scroll-margin-top:12px}}
html:not(.blsb-admin) .st,html:not(.blsb-admin) .counts .g,html:not(.blsb-admin) .counts .a{{display:none}}
html:not(.blsb-admin) .top p.sum,html.blsb-admin .top p.blurb{{display:none}}
</style>{board_head()}</head><body><header><div class="hin"><img src="/bls/assets/bls-logo.png" alt=""><div><p>BLS Website</p><h1>Website update: today vs proposed</h1><p class="hs">Preview of the new BLS website. Nothing here changes the live site.</p></div></div><div id="blsbWho"></div></header>
<main><div id="blsbIndex"></div>
<div class="intro"><p>Each card shows a page as it looks today and as proposed, on a phone. Tap a picture to open it. The switch at the bottom of every page flips between the two.</p>
<div class="counts"><span>{len(CFG)} pages</span><span class="g">{ready} have all facts</span><span class="a">{len(CFG) - ready} need facts</span><span>{len(new)} new pages</span></div></div>
<div id="blsbStrip" hidden></div>
<h2 class="sec">Pages that change ({len(old)})</h2><div class="grid">{''.join(card(s_, c) for s_, c in old)}</div>
<h2 class="sec">New pages ({len(new)})</h2><div class="grid">{''.join(card(s_, c) for s_, c in new)}</div>
<div id="blsbMore"></div>
</main>{board_scripts(index=True)}</body></html>'''
    open(os.path.join(HERE, 'index.html'), 'w').write(html)

if __name__ == '__main__':
    slugs = sys.argv[1:] or list(CFG)
    for s in slugs:
        for v in ('today', 'proposed'):
            build(s, v)
        print('built', s)
    index()
    print('index ok')
