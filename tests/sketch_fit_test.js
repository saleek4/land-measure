// Sketch: no corner ends up under the +/-/fit buttons, in the drawing and in the result.
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8801);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.settings.v1')) localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } catch (e) {} });
  const page = await ctx.newPage(); page.setDefaultTimeout(4000); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8801/'); await page.waitForTimeout(400);
  const scr = async (x, y) => { const r = await page.$eval('#skSvg', e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top }; }); return { x: r.l + x, y: r.t + y }; };
  const tap = async (x, y) => { const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(40); };
  const mode = async (m) => { await page.click('#skModes [data-sm="' + m + '"]'); await page.waitForTimeout(80); };
  // is the corner circle itself what you touch at its middle (not a button)?
  const touchable = async () => page.$$eval('#skSvg circle.skc', cs => cs.map(c => { const r = c.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && !e.closest('#skZ') && !!e.closest('svg'); }));
  await page.click('#bSketch'); await page.waitForSelector('#skSvg');
  // a wide plot, the corners as far right and as low as they go
  for (const p of [[40, 60], [340, 60], [340, 400], [40, 400]]) await tap(p[0], p[1]);
  await page.click('#skCl'); await page.waitForTimeout(150);
  const a = await touchable();
  ok(a.length === 4 && a.every(Boolean), 'the drawing: every corner can be touched at its middle ' + JSON.stringify(a));
  await page.screenshot({ path: TH.shot('sk_fit_draw.png') });
  const gap = await page.evaluate(() => { const z = document.querySelectorAll('#skZ button'), a = z[0].getBoundingClientRect(), b = z[1].getBoundingClientRect(); return document.elementFromPoint(a.x + a.width / 2, (a.bottom + b.top) / 2).id; });
  ok(gap !== 'skZ', 'the gap between two zoom buttons does not block a touch (touch lands on ' + (gap || 'the picture') + ')');
  // a 10 m square: sides 10, diagonal 14.14
  await mode('len');
  for (let i = 0; i < 4; i++) { await page.fill('#skIn', '10'); await page.click('#skNext'); await page.waitForTimeout(40); }
  await page.click('#skModes [data-sm="cross"]'); await page.waitForTimeout(60);
  const c0 = await page.$eval('#skSvg circle[data-c="0"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const c2 = await page.$eval('#skSvg circle[data-c="2"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(c0[0], c0[1]); await page.waitForTimeout(40); await page.mouse.click(c2[0], c2[1]); await page.waitForTimeout(60);
  await page.fill('#skIn', '14.14'); await mode('res'); await page.waitForTimeout(120);
  const r = await touchable();
  ok(r.length === 4 && r.every(Boolean), 'the result: no corner under the zoom buttons ' + JSON.stringify(r));
  await page.screenshot({ path: TH.shot('sk_fit_res.png') });
  // Fit button brings the same layout back after the picture was moved
  await page.click('#skZi'); await page.click('#skZf'); await page.waitForTimeout(100);
  const r2 = await touchable(); ok(r2.every(Boolean), 'after + and Fit the corners are still free');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exitCode = 1; srv.close(); process.exit(1); });
