# Generates modules/fields.html (paste-ready Sports Connect block) from the field list.
# Edit the site list or modules-src/fields.css here, then: python3 modules-src/build_fields.py && python3 build.py fields
# Sites, addresses and field names come from the reviewed fields mockup (league records,
# district spring 2027 list, field-atlas-research.md). Directions only: no open/closed status.
from urllib.parse import quote_plus
import html, pathlib

OUT = pathlib.Path('/Users/danielgrande/Projects/coachpilot-landing/bls/preview/modules/fields.html')
CSS = pathlib.Path(__file__).with_name('fields.css').read_text()

FEATURE = ('Allan Yorke Park', '7203 W Tapps Hwy E', 'Bonney Lake', 'WA 98391',
           ['AY1 to AY4 (grass)', 'AY5 (turf)'], 'City of Bonney Lake park')
# Extra lines per site, from BLS social posts (sources listed in proposals/fields.json):
#   aka = another name parents will see; notes = short practical facts.
EXTRA = {
    'Allan Yorke Park': {'notes': ['Parking by AY5 is limited. Overflow parking is by AY1 to AY3.',]},
    'Mountain View Middle School': {'notes': [""]},
    'Orting Lions Park': {'aka': 'Also called Orting Lions Field',
                          'notes': []},
}

SECTIONS = [
    ('6 school sites', 'Bonney Lake', [
        ('Bonney Lake Elementary', '18715 80th St', 'Bonney Lake', 'WA 98391', ['North', 'South']),
        ('Lakeridge Middle School', '5909 Myers Rd E', 'Bonney Lake', 'WA 98391', ["60' diamond", "90' diamond"]),
        ('Liberty Ridge Elementary', '12202 209th Ave Ct E', 'Bonney Lake', 'WA 98391', ['North', 'South']),
        ('Mountain View Middle School', '10921 199th Ave Ct E', 'Bonney Lake', 'WA 98391', ["60' diamond", "90' diamond"]),
        ('Tehaleh Heights Elementary', '17520 Berkeley Pkwy E', 'Bonney Lake', 'WA 98391', ["60' diamond"]),
        ('Victor Falls Elementary', '11401 188th Ave Ct E', 'Bonney Lake', 'WA 98391', ['Lower']),
    ]),
    ('4 sites', 'Sumner, Orting and Lake Tapps', [
        ('Maple Lawn Elementary', '230 Wood Ave', 'Sumner', 'WA 98390', ['East', 'West']),
        ('Sumner Middle School', '1508 Willow St', 'Sumner', 'WA 98390', ["90' diamond"]),
        ('Orting Lions Park', '19725 Orville Rd E', 'Orting', 'WA 98360', ['Field 1 NW', 'Field 2 SW', 'Field 3 NE', 'Field 4 SE', 'T-Ball fields']),
        ('Lake Tapps Elementary', '1320 178th Ave E', 'Lake Tapps', 'WA 98391', []),
    ]),
]

e = lambda s: html.escape(s, quote=True)
ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.1 7-12.2A7 7 0 0 0 5 9.8C5 14.9 12 22 12 22z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.8" r="2.4" fill="currentColor"/></svg>'
NAV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z" fill="currentColor"/></svg>'


def dest(name, street, town, sz):
    return 'https://www.google.com/maps/dir/?api=1&amp;destination=' + quote_plus(f'{name}, {street}, {town}, {sz}')


def card(site, cls='fd-card', kicker=''):
    name, street, town, sz, tags = site
    tags_html = ('<p class="fd-tags"><span class="fd-tl">Fields</span>' + ''.join(f'<span>{e(t)}</span>' for t in tags) + '</p>') if tags else ''
    k = f'<span class="bx-eyebrow">{e(kicker)}</span>' if kicker else ''
    ex = EXTRA.get(name, {})
    aka = f'<p class="fd-aka">{e(ex["aka"])}</p>' if ex.get('aka') else ''
    notes = ''.join(f'<p class="fd-note">{e(n)}</p>' for n in ex.get('notes', []))
    return (f'<article class="{cls}">{k}<h3>{e(name)}</h3>{aka}'
            f'<p class="fd-addr">{PIN}<span>{e(street)}<br>{e(town)}, {e(sz)}</span></p>'
            f'{tags_html}{notes}'
            f'<a class="fd-go" href="{dest(name, street, town, sz)}" target="_blank" rel="noopener" aria-label="Directions to {e(name)}">'
            f'{NAV}<span>Directions</span><b>{ARROW}</b></a></article>')


towns = {}
for site in [FEATURE[:4] + (FEATURE[4],)] + [s for sec in SECTIONS for s in sec[2]]:
    towns[site[2]] = towns.get(site[2], 0) + 1
total = sum(towns.values())
chips = ''.join(f'<li><b>{n}</b>{e(t)}</li>' for t, n in towns.items())

fname, fstreet, ftown, fsz, ftags, fkick = FEATURE
map_q = quote_plus(f'{fname}, {fstreet}, {ftown}, {fsz}')

sections = ''
for eyebrow, title, sites in SECTIONS:
    sections += (f'\n  <section class="bx-sec fd-town">\n    <header><span class="bx-eyebrow">{e(eyebrow)}</span><h2>{e(title)}</h2></header>\n'
                 f'    <div class="fd-grid">\n      ' + '\n      '.join(card(s) for s in sites) + '\n    </div>\n  </section>\n')

CONTOURS = ('<svg class="fd-topo" viewBox="0 0 600 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            '<g fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="1.6">'
            + ''.join(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx + i*34}" ry="{ry + i*24}" transform="rotate({rot} {cx} {cy})"/>'
                      for (cx, cy, rx, ry, rot, n) in [(470, 120, 30, 18, -18, 7), (150, 360, 26, 16, 12, 6)] for i in range(n))
            + '</g><path d="M60 70 C 180 40, 250 160, 330 150 S 470 250, 560 230" fill="none" stroke="#ffb8c6" stroke-opacity=".35" stroke-width="2.5" stroke-dasharray="2 9" stroke-linecap="round"/></svg>')

HERO = f'''
  <section class="bx-hero">
    <div class="bx-hero-in">
      <div class="bx-copy">
        <div class="bx-ribbon">
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#fff"/><path d="M16 25s6-6.1 6-10.5a6 6 0 0 0-12 0C10 18.9 16 25 16 25z" fill="#cd163f"/><circle cx="16" cy="14.4" r="2.3" fill="#fff"/></svg>
          <div><span>Where BLS plays</span><b>Fields</b></div>
        </div>
        <h1><small>Game day?</small>Find your <em>field.</em></h1>
        <p class="bx-lede">Every BLS field site with one-tap directions. Your team's schedule shows which field you're on.</p>
        <a class="bx-btn" href="https://www.blslittleleague.org/Default.aspx?tabid=719150">Posted schedules {ARROW}</a>
      </div>
      <figure class="bx-photo"><div class="bx-frame">{CONTOURS}
        <div class="fd-ticket"><span class="k">Field sites</span><span class="d">{total}</span><ul class="fd-towns">{chips}</ul></div>
      </div></figure>
    </div>
  </section>
'''

FEATURE_HTML = f'''
  <section class="fd-feature">
    <div class="fd-map"><iframe src="https://www.google.com/maps?q={map_q}&amp;z=15&amp;output=embed" title="Map of {e(fname)}" allowfullscreen></iframe></div>
    {card(FEATURE[:5], 'fd-card fd-big', fkick)}
  </section>
'''

THANKS = [
    ('Federal Way National Little League', 'Donated infield dirt, fall 2026'),
    ('Mowatt Trucking', 'Time and equipment to move the dirt'),
    ('Lions Community Park', 'Storing the dirt until it is spread'),
    ('Seattle Mariners grounds crew', 'Donated infield dirt, spring 2026'),
    ('Sunbelt Rentals', 'Donated the trailer to haul it'),
]
HELP = f'''
  <section class="fd-help">
    <div class="fd-help-main">
      <span class="bx-eyebrow">Keep the fields game-ready</span>
      <h2>Help with our fields</h2>
      <p>The Fields Committee is recruiting volunteers to help get our fields ready for spring. Want to help? Email the Fields Coordinator.</p>
      <a class="bx-btn" href="mailto:fields@blslittleleague.org">fields@blslittleleague.org {ARROW}</a>
    </div>
    <div class="fd-thanks">
      <h3>Thank you</h3>
      <ul>''' + ''.join(f'<li><b>{e(n)}</b><span>{e(d)}</span></li>' for n, d in THANKS) + '''</ul>
    </div>
  </section>
'''

FOOT = f'''
  <section class="fd-foot">
    <p><b>Wrong address or a field missing?</b> Email <a href="mailto:fields@blslittleleague.org">fields@blslittleleague.org</a></p>
    <p><b>Save this page.</b> Add it to your phone's home screen so every field is one tap away on game day.</p>
  </section>
'''

OUT.write_text(f'<style>\n{CSS.strip()}\n</style>\n<div class="blsx">\n{HERO}{FEATURE_HTML}{sections}{HELP}{FOOT}\n</div>\n')
print('wrote', OUT, len(OUT.read_text()), towns, total)
