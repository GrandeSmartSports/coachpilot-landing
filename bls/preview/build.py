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
        "summary":  "one line shown on the index"
      }
The module HTML files are exactly what gets pasted into the Sports Connect content blocks.
"""
import json, os, re, sys, copy
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get('BASE', 'https://go.blslittleleague.org/bls/preview').rstrip('/')
CFG = json.load(open(os.path.join(HERE, 'pages.json')))
SITE_CSS = open(os.path.join(HERE, 'site.css')).read()
TAB2SLUG = {c['tabid']: s for s, c in CFG.items() if c.get('tabid')}


def read(p):
    return open(os.path.join(HERE, p), encoding='utf-8', errors='ignore').read()


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
            normal.append(BeautifulSoup('<p style="padding:24px 0;font-size:16px">This page does not exist yet. Switch to Proposed to see it.</p>', 'html.parser'))
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

    on, off = 'background:#cd163f;color:#fff;', 'background:#fff;color:#00013a;'
    def seg(v, label):
        return f'<a href="{BASE}/{v}/{slug}.html" style="{on if v == variant else off}flex:1;text-align:center;padding:11px 6px;border-radius:999px;font:700 15px/1 Arial,sans-serif;text-decoration:none;">{label}</a>'
    bar = (f'<div id="blsPreviewBar" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#00013a;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 16px rgba(0,0,0,.35);">'
           f'<div style="display:flex;gap:6px;max-width:520px;margin:0 auto 6px;">{seg("today", "Today")}{seg("proposed", "Proposed")}</div>'
           f'<div style="text-align:center;color:#c9d3f2;font:600 12px/1.3 Arial,sans-serif;">PREVIEW · {cfg["title"]} · <a href="{BASE}/" style="color:#fff;">All pages</a></div>'
           + needs_panel(slug) + '</div><div style="height:96px"></div>')
    soup.body.append(BeautifulSoup(bar, 'html.parser'))
    out = os.path.join(HERE, variant, slug + '.html')
    open(out, 'w').write(str(soup))
    return out


def needs_panel(slug):
    items = needs(slug)
    if not items:
        return '<div style="text-align:center;color:#9be3b5;font:700 12px/1.6 Arial,sans-serif;">Ready to launch</div>'
    lis = ''.join(f'<li style="margin:4px 0">{x}</li>' for x in items)
    return (f'<details style="max-width:520px;margin:6px auto 0;color:#fff;font:500 14px/1.4 Arial,sans-serif;">'
            f'<summary style="cursor:pointer;text-align:center;color:#ffd166;font-weight:700;list-style:none;">Required to launch ({len(items)})</summary>'
            f'<ul style="margin:8px 0 4px;padding:10px 12px 10px 28px;background:#fff;color:#0a0f2e;border-radius:10px;max-height:45vh;overflow:auto;">{lis}</ul></details>')


def index():
    cards = []
    for slug, cfg in CFG.items():
        prop = proposal(slug)
        status = prop.get('status', 'Not started')
        ok = status.lower().startswith('ready')
        thumb = f'img/{slug}-proposed-phone.jpg'
        has = os.path.exists(os.path.join(HERE, thumb))
        tag = 'New page' if cfg.get('new') else ('Hidden today' if cfg.get('hidden') else 'Existing page')
        cards.append(f'''<article class="card">
  <a class="thumb" href="proposed/{slug}.html">{f'<img src="{thumb}" alt="{cfg["title"]} proposed, phone" loading="lazy">' if has else '<span>No preview yet</span>'}</a>
  <div class="meta"><span class="tag">{tag}</span><h2>{cfg["title"]}</h2><p>{prop.get("summary", "")}</p>
  {('<div class="needs"><p class="st todo">Required to launch</p><ul>' + ''.join('<li>' + x + '</li>' for x in needs(slug, prop)) + '</ul></div>') if needs(slug, prop) else '<p class="st ok">Ready to launch</p>'}
  <div class="btns"><a href="today/{slug}.html">Today</a><a class="pri" href="proposed/{slug}.html">Proposed</a></div></div>
</article>''')
    html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow">
<title>BLS Website Preview</title><style>
:root{{--navy:#00013a;--red:#cd163f;--blue:#1452a0;--bg:#eef2f6;--line:#d9dfea;--muted:#59617a}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);font:400 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0a0f2e;padding:0 16px 40px}}
header{{margin:0 -16px 16px;background:var(--navy);color:#fff;padding:18px 16px;border-bottom:5px solid var(--red);display:flex;gap:12px;align-items:center}}
header img{{width:44px;height:44px;background:#fff;border-radius:8px;padding:3px}}header p{{margin:0;font:700 12px/1 Arial;letter-spacing:.08em;color:#c9d3f2;text-transform:uppercase}}header h1{{margin:4px 0 0;font-size:22px}}
main{{max-width:1100px;margin:0 auto}}.lead{{color:var(--muted);margin:0 0 16px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}}
.card{{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}}
.thumb{{display:block;aspect-ratio:390/520;overflow:hidden;background:#dfe5ee;border-bottom:1px solid var(--line)}}.thumb img{{width:100%;display:block}}.thumb span{{display:grid;place-items:center;height:100%;color:var(--muted)}}
.meta{{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1}}.meta h2{{margin:0;font-size:18px;color:var(--navy)}}.meta p{{margin:0;font-size:14px;color:var(--muted)}}
.tag{{font:700 11px/1 Arial;letter-spacing:.08em;text-transform:uppercase;color:var(--red)}}.st{{font-weight:600}}.st.ok{{color:#127a3a}}.st.todo{{color:#a35200}}
.needs summary{{cursor:pointer;font-weight:700;color:#a35200}}.needs ul{{margin:6px 0 0;padding-left:18px;font-size:14px;color:#0a0f2e}}.needs li{{margin:3px 0}}
.btns{{display:flex;gap:8px;margin-top:auto;padding-top:6px}}.btns a{{flex:1;text-align:center;padding:10px;border-radius:999px;border:1px solid var(--line);color:var(--navy);font-weight:700;text-decoration:none}}.btns a.pri{{background:var(--navy);color:#fff;border-color:var(--navy)}}
</style></head><body><header><img src="/bls/assets/bls-logo.png" alt=""><div><p>BLS Website</p><h1>Preview: every page, today vs proposed</h1></div></header>
<main><p class="lead">Tap a page. The switch at the bottom flips between Today and Proposed. Nothing here changes the live site.</p><div class="grid">{''.join(cards)}</div></main></body></html>'''
    open(os.path.join(HERE, 'index.html'), 'w').write(html)


if __name__ == '__main__':
    slugs = sys.argv[1:] or list(CFG)
    for s in slugs:
        for v in ('today', 'proposed'):
            build(s, v)
        print('built', s)
    index()
    print('index ok')
