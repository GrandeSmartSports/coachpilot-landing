"""Home page: "what ships tonight" next to the full proposal.

The home page has a single Sports Connect module (the home content: rotator + news), so it has no HTML block
to carry a <style>. modules/home.css therefore has no way onto the live home page yet (pending a delivery path).
What can ship is the 4 new rotator slides, which are just images uploaded in the Content Rotator.

  python3 modules-src/home_tonight.py           build proposed/home-tonight.html (4 new slides on today's home look,
                                                no home.css, no site style), rebuild today/proposed home + index
  python3 modules-src/home_tonight.py --shots   ...then screenshot it and make the comparison images:
      img/home-tonight-{phone,phone-full,desk,desk-full}.jpg       what ships tonight
      img/home-tonight-slides-{phone,desk}.jpg                     each new slide on today's rotator
      img/home-proposed-slides-{phone,desk}.jpg                    each new slide on the full proposal
      img/home-tonight-vs-proposal-{phone,desk}.jpg                Today | What ships tonight | Full proposal
Uses build.py as it is (no changes to it).
"""
import os, re, sys, subprocess, shutil

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE); os.chdir(HERE)
import build as B

# ---------- 1. the tonight page ----------
full = B.proposal('home')
tonight = {k: v for k, v in full.items() if k != 'extra_css'}
orig = B.proposal
B.proposal = lambda slug: tonight if slug == 'home' else orig(slug)
try:
    out = B.build('home', 'proposed')
finally:
    B.proposal = orig
html = open(out, encoding='utf-8').read()
# today's home look exactly: drop the inner-page style block too (scoped to body.Inner-Skin, so inert on home anyway)
html, n = re.subn(r'<style id="bls-site-style">.*?</style>', '', html, count=1, flags=re.S)
assert n == 1, 'site style block not found'
# preview bar: Today / Ships tonight / Full proposal, this page highlighted
on, off = 'background:#cd163f;color:#fff;', 'background:#fff;color:#00013a;'
def seg(href, label, active):
    return (f'<a href="{href}" style="{on if active else off}flex:1;text-align:center;padding:11px 6px;border-radius:999px;'
            f'font:700 15px/1 Arial,sans-serif;text-decoration:none;">{label}</a>')
segs = (seg(f'{B.BASE}/today/home.html', 'Today', False) + seg(f'{B.BASE}/proposed/home-tonight.html', 'Ships tonight', True)
        + seg(f'{B.BASE}/proposed/home.html', 'Full proposal', False))
html, n = re.subn(r'(<div id="blsPreviewBar".*?<div style="display:flex;gap:6px;max-width:520px;margin:0 auto 6px;">).*?(</div>)',
                  lambda m: m.group(1) + segs + m.group(2), html, count=1, flags=re.S)
assert n == 1, 'preview bar not found'
html = html.replace('PREVIEW · Home · ', "PREVIEW · Home · What ships tonight: 4 new slides on today's home look · ", 1)
html = html.replace('<title>', '<title>What ships tonight · ', 1)
open(os.path.join(HERE, 'proposed', 'home-tonight.html'), 'w', encoding='utf-8').write(html)
print('wrote proposed/home-tonight.html')

# ---------- 2. the normal Today / Proposed home pages + index ----------
for v in ('today', 'proposed'):
    B.build('home', v)
B.index()
print('rebuilt home today/proposed + index')

if '--shots' not in sys.argv:
    sys.exit(0)

# ---------- 3. screenshots ----------
subprocess.run(['node', 'shots.js', 'home', 'home-tonight'], check=True)
for suf in ('phone', 'phone-full', 'desk', 'desk-full'):
    shutil.move(f'img/home-tonight-proposed-{suf}.jpg', f'img/home-tonight-{suf}.jpg')
subprocess.run(['node', 'modules-src/home_slide_sheets.js', 'home-tonight', 'tonight'], check=True)
subprocess.run(['node', 'modules-src/home_slide_sheets.js', 'home', 'proposed'], check=True)

# ---------- 4. side-by-side: Today | What ships tonight | Full proposal ----------
from PIL import Image, ImageDraw, ImageFont
F = '/System/Library/Fonts/Supplemental/'
NAVY, RED, BLUE, LIGHT, MUTED = (0, 1, 58), (205, 22, 63), (20, 82, 160), (238, 242, 246), (75, 86, 117)
COLS = [('TODAY', 'The live home page now', 'img/home-today-{d}.jpg', NAVY),
        ('WHAT SHIPS TONIGHT', "4 new slides on today's home look", 'img/home-tonight-{d}.jpg', RED),
        ('FULL PROPOSAL', 'Home style is pending a delivery path', 'img/home-proposed-{d}.jpg', BLUE)]

def sheet(dev, scale, crop=None):
    # desk uses the full-page shot cut below the rotator, so the whole slide shows
    shots = [Image.open(c[2].format(d=dev)).convert('RGB') for c in COLS]
    if crop:
        shots = [s.crop((0, 0, s.width, crop)) for s in shots]
    shots = [s.resize((int(s.width * scale), int(s.height * scale)), Image.LANCZOS) for s in shots]
    w, h, pad, gap, head = shots[0].width, shots[0].height, 28, 24, 104
    big = ImageFont.truetype(F + 'Arial Narrow Bold.ttf', 34)
    small = ImageFont.truetype(F + 'Arial Bold.ttf', 17)
    W = pad * 2 + w * 3 + gap * 2
    im = Image.new('RGB', (W, pad + head + h + pad), LIGHT)
    d = ImageDraw.Draw(im)
    for i, ((t, sub, _, col), s) in enumerate(zip(COLS, shots)):
        x = pad + i * (w + gap)
        d.rectangle([x, pad, x + w - 1, pad + 8], fill=col)
        d.text((x, pad + 20), t, font=big, fill=col)
        d.text((x, pad + 64), sub, font=small, fill=MUTED)
        im.paste(s, (x, pad + head))
        d.rectangle([x - 1, pad + head - 1, x + w, pad + head + h], outline=(201, 210, 226))
    out = f"img/home-tonight-vs-proposal-{dev.split('-')[0]}.jpg"
    im.save(out, quality=86)
    print(out, im.size)

sheet('phone', 1.0)
sheet('desk-full', 0.5, crop=1180)
