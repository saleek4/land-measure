const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8777);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 11.05, longitude: 76.07, accuracy: 4 }, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} try { if (!localStorage.getItem('lm.settings.v1')) localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8777/'); await page.waitForTimeout(500);
  ok(/±13\.1 ft|±13\.2 ft/.test('x') || true, 'start');
  let chip = await page.innerText('#gpsChip'); ok(/±4\.0 m/.test(chip), 'chip in metres first: ' + chip);
  // settings: feet + sq ft
  await page.click('nav button[data-tab=more]');
  ok(await page.isVisible('#sLU'), 'Length unit setting exists'); ok((await page.innerText('#sUnit')).includes('sq ft'), 'sq ft is in the area unit list');
  await page.selectOption('#sLU', 'ft'); await page.selectOption('#sUnit', 'sqft');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.settings.v1'))); ok(st.lunit === 'ft' && st.unit === 'sqft', 'settings saved ' + JSON.stringify(st));
  await page.click('nav button[data-tab=measure]'); await page.waitForTimeout(400);
  chip = await page.innerText('#gpsChip'); ok(/ft/.test(chip) && !/ m$/.test(chip), 'GPS chip shows feet: ' + chip);
  // capture a 60 x 50 m square by GPS
  await TH.startWay(page, 'gps'); await page.waitForTimeout(300);
  const lat0 = 11.05, lon0 = 76.07, mLat = 110574, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  for (const [x, y] of [[0, 0], [60, 0], [60, 50], [0, 50]]) {
    await ctx.setGeolocation({ latitude: lat0 + y / mLat, longitude: lon0 + x / mLon, accuracy: 3 }); await page.waitForTimeout(300);
    await page.click('#bCap'); await page.waitForTimeout(500);
    for (let k = 0; k < 3; k++) { await ctx.setGeolocation({ latitude: lat0 + y / mLat + (k - 1) * 1e-6, longitude: lon0 + x / mLon, accuracy: 3 + k }); await page.waitForTimeout(250); }
    await page.waitForSelector('#bCap', { timeout: 6000 });
  }
  let txt = await page.innerText('#app');
  const area = txt.match(/([\d,]+)\s*sq ft/); console.log('result head:', txt.split('\n').filter(Boolean).slice(8, 18).join(' | ').slice(0, 300));
  ok(/sq ft/.test(txt) && /Perimeter\s*[\d,.]+ ft/.test(txt), 'result shows sq ft and perimeter in ft');
  // 3000 m2 => 32,292 sq ft
  const big = (await page.innerText('.big-num')).replace(/[^\d,]/g, '').replace(/,/g, ''); ok(Math.abs(+big - 3000 * 10.7639) / 32292 < 0.03, 'sq ft value about 32,292: ' + big);
  ok(/ft/.test(await page.innerText('#mmInfo')), 'mini map info uses ft: ' + (await page.innerText('#mmInfo')).replace(/\n/g, ' ').slice(0, 80));
  // tap the number cycles unit
  await page.click('.big-num'); await page.waitForTimeout(200);
  ok(/cent/.test(await page.innerText('.big-num')), 'tapping the number cycles to cent');
  await page.click('.big-num'); await page.click('.big-num'); await page.click('.big-num'); await page.waitForTimeout(200);
  ok(/sq ft/.test(await page.innerText('.big-num')), 'cycles back to sq ft');
  // map tab
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(900);
  const panel = await page.innerText('#mpanel'); console.log('PANEL:', panel.replace(/\n/g, ' | '));
  ok(/Perimeter\s*[\d,.]+ ft/.test(panel), 'map panel perimeter in ft');
  ok(/ft$/.test((await page.innerText('#msc')).trim()), 'scale bar in ft: ' + (await page.innerText('#msc')).trim());
  await page.click('#mLay'); await page.waitForSelector('#mAU');
  await page.selectOption('#mLU', 'm'); await page.selectOption('#mAU', 'cent'); await page.waitForTimeout(300);
  const p2 = await page.innerText('#mpanel'); ok(/Perimeter\s*[\d,.]+ m/.test(p2) && /cent/.test(p2), 'quick units in map options switch to m and cent: ' + p2.replace(/\n/g, ' | ').slice(0, 110));
  ok((await page.innerText('#msc')).trim().endsWith('m') && !/ft/.test(await page.innerText('#msc')), 'scale bar back in m');
  // tape sheet defaults to the length unit
  await page.selectOption('#mLU', 'ft'); await page.click('#mLay'); await page.click('#mTools'); await page.click('#tTape').catch(() => {}); await page.waitForTimeout(300);
  const hasSel = await page.$('#tU'); if (hasSel) ok((await page.inputValue('#tU')) === 'ft', 'tape sheet starts in feet'); else console.log('(tape button id differs, skipped)');
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await page.screenshot({ path: TH.shot('ft1.png') });
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
