const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8793);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const shoe = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const ell = (n, ang) => ang.slice(0, n).map(t => [60 * Math.cos(t), 35 * Math.sin(t)]);
// an 8-corner plot, counter-clockwise, and a sketch that is NOT a fan: crosses 1-3, 3-5, 5-7, 7-1, 1-5
const oct = ell(8, [0.1, 0.9, 1.7, 2.4, 3.2, 3.95, 4.7, 5.5]);
const crs = [[0, 2], [2, 4], [4, 6], [0, 6], [0, 4]];
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} try { if (!localStorage.getItem('lm.map.v1')) { localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 18, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap', loupe: true })); localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8793/'); await page.waitForTimeout(400);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const tap = async (i) => { await page.click('#tDia [data-h="' + i + '"]'); await page.waitForTimeout(60); };
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bTape'); await page.click('#bTape'); await page.waitForSelector('#tN');
  ok(await page.$('#tDiaS') !== null, 'a numbered picture of the corners is shown');
  await page.selectOption('#tN', { value: '8' }); await page.waitForSelector('#tHub');
  ok((await page.$$('#sheet input[data-s]')).length === 8 && (await page.$$('#sheet input[data-d]')).length === 5, '8 corners: 8 sides and 5 crosses (fan) to fill');
  // own sketch
  await page.click('#tCm [data-cm="own"]'); await page.waitForSelector('#tFanFill');
  ok(!(await page.$('#tHub')) && /5 of 5 chosen/.test(await page.innerText('#sheet')), 'own sketch starts from the fan: 5 of 5 chosen');
  await page.click('#tClr'); await page.waitForTimeout(100);
  ok((await page.$$('#sheet input[data-d]')).length === 0 && /0 of 5 chosen/.test(await page.innerText('#sheet')), 'Clear removes all crosses');
  await tap(0); await tap(1); await page.waitForTimeout(150);
  ok((await page.$$('#sheet input[data-d]')).length === 0, 'two corners that are joined by a side do not make a cross');
  for (const c of crs) { await tap(c[0]); await tap(c[1]); }
  await page.waitForTimeout(150);
  const keys = await page.$$eval('#sheet input[data-d]', els => els.map(e => e.dataset.d).sort());
  ok(JSON.stringify(keys) === JSON.stringify(['0-2', '0-4', '0-6', '2-4', '4-6']), 'tapping pairs of corners adds the crosses: ' + keys.join(' '));
  await tap(2); await tap(4); ok((await page.$$('#sheet input[data-d]')).length === 4, 'tapping the same two corners again removes that cross');
  await tap(2); await tap(4);
  // a cross that cuts through another is refused with a clear message
  await page.click('#tClr'); await tap(0); await tap(4); await tap(2); await tap(6); await page.waitForTimeout(150);
  ok(/cut through each other/.test(await page.innerText('#tRes')) && (await page.isDisabled('#tPlace')), 'crossing crosses: message shown, Put on the map disabled');
  await page.click('#tClr'); for (const c of crs) { await tap(c[0]); await tap(c[1]); } await page.waitForTimeout(100);
  // type the lengths
  for (let i = 0; i < 8; i++) await page.fill('input[data-s="' + i + '"]', D(oct[i], oct[(i + 1) % 8]).toFixed(3));
  for (let k = 0; k < crs.length - 1; k++) { const c = crs[k]; await page.fill('input[data-d="' + c[0] + '-' + c[1] + '"]', D(oct[c[0]], oct[c[1]]).toFixed(3)); }
  await page.waitForTimeout(200);
  ok(/Type the length of the cross from corner 1 to corner 5/.test(await page.innerText('#tRes')) || /0-4/.test(''), 'the last missing cross is asked for with real corner numbers');
  await page.fill('input[data-d="0-4"]', D(oct[0], oct[4]).toFixed(3)); await page.waitForTimeout(250);
  const want = shoe(oct) / 40.468564224, got = parseFloat((await page.innerText('#tRes .big-num')).replace(/[^\d.]/g, ''));
  ok(Math.abs(got - want) < 0.02, 'area from the sketch triangles ' + got + ' cent = real ' + want.toFixed(2));
  ok(await page.isEnabled('#tPlace'), 'Put on the map is enabled');
  await page.click('#tPlace'); await page.waitForTimeout(500);
  let d = await draft();
  ok(d.corners.length === 8 && d.tape && JSON.stringify(d.tape.cr) === JSON.stringify(crs.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1])) && d.tape.diags.length === 5, 'plot placed; the crosses are stored with the plot');
  // reopen: still the own sketch with the same crosses
  await page.click('#mTools'); await page.click('#tTape'); await page.waitForSelector('#tCm');
  ok(await page.$('#tFanFill') !== null && (await page.$$('#sheet input[data-d]')).length === 5, 'sheet reopens in "my own sketch" with the 5 crosses');
  await page.click('#tX');
  // saved plot lists the crosses of the sketch
  await page.click('#mSave'); await page.waitForSelector('#sN'); await page.fill('#sN', 'Sketch'); await page.click('#sOk'); await page.waitForTimeout(300);
  await page.click('nav button[data-tab=plots]'); await page.waitForSelector('.plotitem'); await page.click('.plotitem'); await page.waitForTimeout(300);
  const det = await page.innerText('#app'); ok(/Crosses: 1→3/.test(det) && /3→5/.test(det) && /1→5/.test(det) && /5→7/.test(det) && /1→7/.test(det), 'saved plot lists the sketch crosses with real corner numbers');
  // 12 corners fit the sheet
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bTape'); await page.click('#bTape'); await page.waitForSelector('#tN');
  await page.selectOption('#tN', { value: '12' }); await page.waitForSelector('#tHub');
  ok((await page.$$('#sheet input[data-s]')).length === 12 && (await page.$$('#sheet input[data-d]')).length === 9, '12 corners: 12 sides and 9 crosses');
  ok(await page.$eval('#sheet', e => e.scrollWidth <= e.clientWidth + 1), '12 corners: nothing sticks out sideways on a phone');
  await page.screenshot({ path: TH.shot('sketch_12.png') }).catch(() => {});
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
