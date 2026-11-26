const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8784);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => {
    window.__shared = []; Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async (d) => { const f = d.files && d.files[0]; window.__shared.push({ name: f && f.name, text: f ? await f.text() : d.text }); }, configurable: true });
    try { if (!localStorage.getItem('lm.map.v1')) { localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 18, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap', loupe: true })); } } catch (e) {}
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8784/'); await page.waitForTimeout(400);
  // tape plot -> save through the map tab
  const mk = async (name, w, h) => {
    await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bTape'); await page.click('#bTape'); await page.waitForSelector('#tN');
    await page.selectOption('#tN', { value: '4' });
    const sd = [w, h, w, h]; for (let i = 0; i < 4; i++) await page.fill('input[data-s="' + i + '"]', String(sd[i]));
    await page.fill('input[data-d="0-2"]', Math.hypot(w, h).toFixed(3)); await page.waitForTimeout(200);
    await page.click('#tPlace'); await page.waitForTimeout(600);
    if (await page.isVisible('#sheet button.danger')) { await page.click('#sheet button.danger'); await page.waitForTimeout(500); }
    await page.waitForSelector('#mSave'); await page.click('#mSave'); await page.waitForSelector('#sN'); await page.fill('#sN', name); await page.click('#sOk'); await page.waitForTimeout(900);
  };
  await mk('Plot A', 40, 25);
  ok(/Back up your plots\?/.test(await page.innerText('#sheet')), 'after the first save the app offers a backup');
  await page.screenshot({ path: TH.shot('bk1_ask.png') });
  await page.click('#sheet button.pri'); await page.waitForTimeout(500);
  let sh = await page.evaluate(() => window.__shared);
  ok(sh.length === 1 && /^land-measure-backup-\d{4}-\d\d-\d\d\.json$/.test(sh[0].name), 'share sheet got a dated backup file: ' + (sh[0] && sh[0].name));
  let j = JSON.parse(sh[0].text); ok(j.app === 'land-measure' && j.plots.length === 1 && j.plots[0].name === 'Plot A', 'file holds the saved plot');
  const lb = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.backup.v1'))); ok(lb && lb.n === 1, 'last backup remembered (1 plot)');
  // second plot right away: not asked again (backed up today), but the Plots tab shows the warning card
  await mk('Plot B', 30, 20);
  ok(!/Back up your plots\?/.test(await page.innerText('#sheet')), 'no second pop-up right after a backup');
  await page.click('nav button[data-tab=plots]'); await page.waitForSelector('.plotitem');
  let pt = await page.innerText('#app'); ok(/Back up your plots/i.test(pt) && /Safari tab, not the Home Screen icon/i.test(pt), 'Plots tab: reminder (new plot since backup) and the Safari-tab note');
  await page.screenshot({ path: TH.shot('bk2_plots.png') });
  await page.click('#bNow'); await page.waitForTimeout(500);
  sh = await page.evaluate(() => window.__shared); j = JSON.parse(sh[1].text); ok(j.plots.length === 2, 'second backup has both plots');
  ok(!/Back up your plots/i.test(await page.innerText("#app")), "reminder disappears after the backup");
  // More tab text
  await page.click('nav button[data-tab=more]'); await page.waitForTimeout(200);
  const mt = await page.innerText('#app'); ok(/every saved plot is erased/.test(mt) && /Last backup: today \(2 plots\)/.test(mt) && /Do not delete the icon/.test(mt), 'More tab explains the risk and shows the last backup');
  await page.screenshot({ path: TH.shot('bk3_more.png'), fullPage: false });
  // wipe everything (what deleting the icon does) and restore from the file
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
  await page.click('nav button[data-tab=plots]'); await page.waitForTimeout(200);
  ok(!(await page.$('.plotitem')), 'after wiping the storage no plots are left');
  await page.click('nav button[data-tab=more]'); await page.waitForSelector('#bImp'); await page.click('#bImp'); await page.waitForSelector('#iTxt');
  await page.fill('#iTxt', sh[1].text); await page.click('#iOk'); await page.waitForTimeout(400);
  await page.click('nav button[data-tab=plots]'); await page.waitForTimeout(300);
  const items = await page.$$eval('.plotitem b', e => e.map(x => x.textContent)); ok(items.length === 2 && items.includes('Plot A') && items.includes('Plot B'), 'import restores both plots: ' + items.join(', '));
  const rc = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.plots.v1'))); ok(rc.every(p => p.corners.length === 4 && p.tape && p.tape.sides.length === 4), 'restored plots keep corners and tape data');
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
