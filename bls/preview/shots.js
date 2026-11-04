// node shots.js [slug ...]   -> img/<slug>-{today,proposed}-{phone,desk}.jpg (+ -full variants)
// Renders the built preview files locally (file://); nothing on the live site changes.
const { chromium } = require('/Users/danielgrande/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core');
const fs = require('fs'); const path = require('path');
const HERE = __dirname; const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'pages.json'), 'utf8'));
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CFG);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
(async () => {
  const br = await chromium.launch({ channel: 'chrome', headless: true });
  // DEVICES=phone node shots.js  -> phone only (index thumbnails)
  const only = process.env.DEVICES ? process.env.DEVICES.split(',') : null;
  for (const [dev, vp, mob] of [['phone', { width: 390, height: 844 }, true], ['desk', { width: 1440, height: 900 }, false]].filter(d => !only || only.includes(d[0]))) {
    const ctx = await br.newContext({ viewport: vp, isMobile: mob, hasTouch: mob, userAgent: mob ? IPHONE : undefined, deviceScaleFactor: 1 });
    await ctx.route(/cookielaw\.org|onetrust/, r => r.abort());
    // files the preview links on its own host (home rotator slides) render from this folder, deployed or not
    await ctx.route(/\/bls\/preview\/(img|board)\//, r => { const f = path.join(HERE, decodeURIComponent(new URL(r.request().url()).pathname.split('/bls/preview/')[1])); return fs.existsSync(f) ? r.fulfill({ path: f }) : r.continue(); });
    // build board comments stay out of screenshots: no calls to the board function, and its bar, pins and sheets are hidden below
    await ctx.route(/functions\/v1\/bls-board/, r => r.abort());
    const p = await ctx.newPage();
    for (const slug of slugs) for (const v of ['today', 'proposed']) {
      const f = path.join(HERE, v, slug + '.html'); if (!fs.existsSync(f)) continue;
      await p.goto('file://' + f, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(5000);
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await sleep(800);
      // home rotator: park on slide 1 and stop auto-advance, so Today and Proposed compare like for like
      const rot = await p.evaluate(() => { try { const s = window.jQuery && jQuery('#slider1110520 ul.skList'); if (s && s.length) { s.trigger('slideTo', 0); return true; } } catch (e) {} return false; });
      if (rot) { await sleep(1500); await p.evaluate(() => { try { jQuery('#slider1110520 ul.skList').trigger('pause', true); } catch (e) {} }); }
      await p.addStyleTag({ content: '#blsPreviewBar,#blsPreviewSpacer,#blsbRoot,.blsb-pins,.blsb-pin,.blsb-dlg,.blsb-scrim,.blsb-pinmode,.blsb-pinbar,.blsb-toast{display:none!important}html.blsb-lock,html.blsb-lock body{overflow:visible!important}' });
      const base = path.join(HERE, 'img', `${slug}-${v}-${dev}`);
      await p.screenshot({ path: base + '.jpg', type: 'jpeg', quality: 80 });
      const h = await p.evaluate(() => document.body.scrollHeight);
      await p.screenshot({ path: base + '-full.jpg', type: 'jpeg', quality: 75, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(h, dev === 'phone' ? 14000 : 9000) } });
      // index thumbnail: the page's own content (skips the site header every page shares)
      if (dev === 'phone') {
        const top = await p.evaluate(() => { const c = document.querySelector('#dnn_ContentPane'); return c ? Math.max(0, Math.round(c.getBoundingClientRect().top + window.scrollY) - 6) : 0; });
        await p.screenshot({ path: base + '-thumb.jpg', type: 'jpeg', quality: 78, fullPage: true, clip: { x: 0, y: top, width: vp.width, height: Math.min(780, h - top) } });
      }
      const side = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      console.log(`${slug} ${v} ${dev} h=${h}${side ? ' SIDEWAYS-SCROLL' : ''}`);
    }
    await ctx.close();
  }
  await br.close();
})();
