# Generates modules/fields.html (paste-ready Sports Connect block) from the field list.
# Edit the site list or modules-src/fields.css here, then: python3 modules-src/build_fields.py && python3 build.py fields
# Sites, addresses and field names come from the reviewed fields mockup (league records,
# district spring 2027 list, field-atlas-research.md). Directions only: no open/closed status.
# Public page rules (Coach, 11/4): one purpose (find your field and get directions), no counts,
# no committee, donor or storage notes, no map embed, field names only as they appear on schedules.
from urllib.parse import quote_plus
import html, pathlib, re

OUT = pathlib.Path('/Users/danielgrande/Projects/coachpilot-landing/bls/preview/modules/fields.html')
CSS = pathlib.Path(__file__).with_name('fields.css').read_text()

# Extra lines per site, from BLS social posts (sources listed in proposals/fields.json):
#   aka = another name parents will see on schedules; notes = directions facts only (parking).
EXTRA = {
    'Allan Yorke Park': {'notes': ['Parking by AY5 is limited. Overflow parking is by AY1 to AY3.']},
    'Orting Lions Park': {'aka': 'Also called Orting Lions Field'},
}

# (name, street, town, state zip, field names as they appear on schedules). Allan Yorke Park first, as its own card under the hero.
FEATURE = ('Allan Yorke Park', '7203 W Tapps Hwy E', 'Bonney Lake', 'WA 98391', ['AY1 to AY4', 'AY5'])
SECTIONS = [
    ('Bonney Lake', [
        ('Bonney Lake Elementary', '18715 80th St', 'Bonney Lake', 'WA 98391', ['North', 'South']),
        ('Lakeridge Middle School', '5909 Myers Rd E', 'Bonney Lake', 'WA 98391', ['60', '90']),
        ('Liberty Ridge Elementary', '12202 209th Ave Ct E', 'Bonney Lake', 'WA 98391', ['North', 'South']),
        ('Mountain View Middle School', '10921 199th Ave Ct E', 'Bonney Lake', 'WA 98391', ['60', '90']),
        ('Tehaleh Heights Elementary', '17520 Berkeley Pkwy E', 'Bonney Lake', 'WA 98391', ['60']),
        ('Victor Falls Elementary', '11401 188th Ave Ct E', 'Bonney Lake', 'WA 98391', ['Lower']),
    ]),
    ('Sumner, Orting and Lake Tapps', [
        ('Maple Lawn Elementary', '230 Wood Ave', 'Sumner', 'WA 98390', ['East', 'West']),
        ('Sumner Middle School', '1508 Willow St', 'Sumner', 'WA 98390', ['90']),
        ('Orting Lions Park', '19725 Orville Rd E', 'Orting', 'WA 98360', ['Field 1 NW', 'Field 2 SW', 'Field 3 NE', 'Field 4 SE', 'T-Ball fields']),
        ('Lake Tapps Elementary', '1320 178th Ave E', 'Lake Tapps', 'WA 98391', []),
    ]),
]
FEATURED = 'Allan Yorke Park'   # gets the accent card

e = lambda s: html.escape(s, quote=True)
ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.1 7-12.2A7 7 0 0 0 5 9.8C5 14.9 12 22 12 22z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.8" r="2.4" fill="currentColor"/></svg>'
NAV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z" fill="currentColor"/></svg>'


def sid(name):
    return 'fd-' + re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def dest(name, street, town, sz):
    return 'https://www.google.com/maps/dir/?api=1&amp;destination=' + quote_plus(f'{name}, {street}, {town}, {sz}')


def card(site):
    name, street, town, sz, tags = site
    cls = 'fd-card fd-big' if name == FEATURED else 'fd-card'
    tags_html = ('<p class="fd-tags"><span class="fd-tl">Fields</span>' + ''.join(f'<span>{e(t)}</span>' for t in tags) + '</p>') if tags else ''
    ex = EXTRA.get(name, {})
    aka = f'<p class="fd-aka">{e(ex["aka"])}</p>' if ex.get('aka') else ''
    notes = ''.join(f'<p class="fd-note">{e(n)}</p>' for n in ex.get('notes', []))
    return (f'<article class="{cls}" id="{sid(name)}"><h3>{e(name)}</h3>{aka}'
            f'<p class="fd-addr">{PIN}<span>{e(street)}<br>{e(town)}, {e(sz)}</span></p>'
            f'{tags_html}{notes}'
            f'<a class="fd-go" href="{dest(name, street, town, sz)}" target="_blank" rel="noopener" aria-label="Directions to {e(name)}">'
            f'{NAV}<span>Directions</span><b>{ARROW}</b></a></article>')


all_sites = [FEATURE] + [s for _, sites in SECTIONS for s in sites]
# The picker jumps to the cards on this page. The preview adds a <base> tag to every page, so a bare "#fd-..." href
# would leave the page; the links carry the page address instead (same pattern as the Coach Run Book lineup).
PAGE = 'https://go.blslittleleague.org/bls/preview/proposed/fields.html'
picker = ''.join(f'<li><a href="{PAGE}#{sid(s[0])}">{e(s[0])}</a></li>' for s in all_sites)
FEATURE_HTML = f'\n  {card(FEATURE)}\n'

sections = ''
for title, sites in SECTIONS:
    sections += (f'\n  <section class="bx-sec fd-town">\n    <header><h2>{e(title)}</h2></header>\n'
                 f'    <div class="fd-grid">\n      ' + '\n      '.join(card(s) for s in sites) + '\n    </div>\n  </section>\n')

HERO = f'''
  <section class="bx-hero">
    <div class="bx-hero-in">
      <div class="bx-copy">
        <div class="bx-ribbon">
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#fff"/><path d="M16 25s6-6.1 6-10.5a6 6 0 0 0-12 0C10 18.9 16 25 16 25z" fill="#cd163f"/><circle cx="16" cy="14.4" r="2.3" fill="#fff"/></svg>
          <div><span>Where BLS plays</span><b>Fields</b></div>
        </div>
        <h1><small>Game day?</small>Find your <em>field.</em></h1>
      </div>
      <nav class="fd-pick" aria-label="Field sites">
        <p class="fd-pick-k">Field sites</p>
        <!-- GO-LIVE: the site picker links use the preview address (https://go.blslittleleague.org/bls/preview/proposed/fields.html#fd-...). Before pasting into Sports Connect, swap that address for this page's tabid URL (https://www.blslittleleague.org/Default.aspx?tabid=NNNNNNN) and keep the #anchors. -->
        <ul>{picker}</ul>
      </nav>
    </div>
  </section>
'''

FOOT = f'''
  <p class="fd-foot"><b>Wrong address or a field missing?</b> Email <a href="mailto:fields@blslittleleague.org">fields@blslittleleague.org</a></p>
'''

OUT.write_text(f'<style>\n{CSS.strip()}\n</style>\n<div class="blsx">\n{HERO}{FEATURE_HTML}{sections}{FOOT}\n</div>\n')
print('wrote', OUT, len(OUT.read_text()), 'sites:', len(all_sites))
