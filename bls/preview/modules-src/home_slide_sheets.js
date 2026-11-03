// Every home rotator slide parked in place, stacked into one image per device.
//   node modules-src/home_slide_sheets.js home-tonight tonight   -> img/home-tonight-slides-{phone,desk}.jpg  (today's home look)
//   node modules-src/home_slide_sheets.js home proposed          -> img/home-proposed-slides-{phone,desk}.jpg (full proposal)
// Renders the built preview files locally (file://); nothing on the live site changes.
const { chromium } = require('/Users/danielgrande/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core');
const fs = require('fs'); const path = require('path'); const os = require('os');
const { execFileSync } = require('child_process');
const HERE = path.join(__dirname, '..');
const page = process.argv[2] || 'home-tonight', label = process.argv[3] || 'tonight';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-slides-'));
(async () => {
  const br = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [dev, vp, mob] of [['phone', { width: 390, height: 844 }, true], ['desk', { width: 1440, height: 900 }, false]]) {
    const ctx = await br.newContext({ viewport: vp, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.route(/cookielaw\.org|onetrust/, r => r.abort());
    await ctx.route(/\/bls\/preview\/img\//, r => r.fulfill({ path: path.join(HERE, decodeURIComponent(new URL(r.request().url()).pathname.split('/bls/preview/')[1])) }));
    const p = await ctx.newPage();
    await p.goto('file://' + path.join(HERE, 'proposed', page + '.html'), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    await p.addStyleTag({ content: '#blsPreviewBar{display:none!important}' });
    const files = [];
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 4; k++) {
        await p.evaluate(i => { const s = jQuery('#slider1110520 ul.skList'); s.trigger('pause', true); s.trigger('slideTo', i); }, i);
        await p.waitForTimeout(2700);
        const ok = await p.evaluate(i => { const ul = document.querySelector('#slider1110520 ul.skList'); const w = document.querySelector('#slider1110520 .caroufredsel_wrapper').getBoundingClientRect(); const li = ul.children[0].getBoundingClientRect(); return Math.abs(li.left - w.left) < 2 && ul.children[0].querySelector('img').src.includes(['s1-', 's2-', 's3-', 's4-'][i]); }, i);
        if (ok) break;
      }
      const box = await p.evaluate(() => { const b = document.querySelector('#slider1110520').getBoundingClientRect(); return { x: b.left, y: b.top + scrollY, w: b.width, h: b.height }; });
      const f = path.join(TMP, `slot-${dev}-${i}.png`);
      await p.screenshot({ path: f, clip: { x: Math.max(0, box.x - 12), y: box.y - 12, width: Math.min(box.w + 24, vp.width - Math.max(0, box.x - 12)), height: box.h + 24 }, fullPage: true });
      files.push(f);
    }
    const out = path.join(HERE, 'img', `home-${label}-slides-${dev}.jpg`);
    execFileSync('python3', ['-c', `
import sys
from PIL import Image
ims = [Image.open(f).convert('RGB') for f in sys.argv[2:]]
sh = Image.new('RGB', (max(i.width for i in ims), sum(i.height for i in ims)), (238, 242, 246)); y = 0
for im in ims: sh.paste(im, (0, y)); y += im.height
sh.save(sys.argv[1], quality=85); print(sys.argv[1].split('/')[-1], sh.size)`, out, ...files], { stdio: 'inherit' });
    await ctx.close();
  }
  await br.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})();
