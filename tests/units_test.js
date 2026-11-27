// Units: the extra Indian units (guntha, ground, hectare, sq yd, kanal, marla), unit choices in Settings, the unit converter.
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const html = fs.readFileSync(TH.root + '/index.html', 'utf8');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const near = (a, b, t) => Math.abs(a - b) <= t;
// ---- maths (node)
const m = html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f = new Function(m + ';return{UNIT,UNIT_CORE,toSqm}')();
const acre = 4046.8564224;
ok(near(f.UNIT.guntha.f(acre), 40, 1e-6), '1 acre = 40 guntha: ' + f.UNIT.guntha.f(acre));
ok(near(f.UNIT.sqft.f(f.toSqm(1, 'guntha')), 1089, 1e-6), '1 guntha = 1089 sq ft');
ok(near(f.UNIT.sqft.f(f.toSqm(1, 'ground')), 2400, 1e-6), '1 ground = 2400 sq ft');
ok(near(f.UNIT.cent.f(f.toSqm(1, 'ground')), 2400 / 435.6, 1e-6), '1 ground = 5.51 cent');
ok(near(f.UNIT.cent.f(f.toSqm(1, 'guntha')), 2.5, 1e-6), '1 guntha = 2.5 cent');
ok(near(f.toSqm(1, 'hectare'), 10000, 1e-9) && near(f.UNIT.cent.f(10000), 247.105, 0.001), '1 hectare = 10,000 sq m = 247.1 cent');
ok(near(f.toSqm(1, 'sqyd'), 0.83612736, 1e-12) && near(f.UNIT.sqft.f(f.toSqm(1, 'sqyd')), 9, 1e-9), '1 sq yd = 9 sq ft');
ok(near(f.toSqm(1, 'kanal') / f.toSqm(1, 'marla'), 20, 1e-9), '1 kanal = 20 marla');
ok(near(f.toSqm(1, 'cent'), 40.468564224, 1e-12) && near(f.toSqm(1, 'acre'), acre, 1e-9) && near(f.toSqm(10.7639104167, 'sqft'), 1, 1e-9) && f.toSqm(5, 'sqm') === 5, 'the old four units convert exactly as before');
ok(f.toSqm(7, 'nope') === 7, 'an unknown unit is read as sq m');
ok(Object.keys(f.UNIT).slice(0, 4).join() === 'cent,acre,sqm,sqft' && f.UNIT_CORE.join() === 'cent,acre,sqm,sqft', 'the old four stay first');
for (const k of Object.keys(f.UNIT)) if (!(f.UNIT[k].l && f.UNIT[k].n && f.UNIT[k].d >= 0 && f.UNIT[k].m > 0)) ok(false, 'unit ' + k + ' is complete');
// ---- browser
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8811);
const tile = fs.readFileSync(TH.fixture('tile.png'));
// a 40 m x 25 m plot = 1000 sq m
const lat0 = 11.05, lon0 = 76.07, dLat = 25 / 110574, dLon = 40 / (111320 * Math.cos(lat0 * Math.PI / 180));
const cor = [[lat0, lon0], [lat0 + dLat, lon0], [lat0 + dLat, lon0 + dLon], [lat0, lon0 + dLon]].map(c => ({ lat: c[0], lon: c[1], acc: 2, n: 1, total: 1, src: 'gps' }));
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} });
  const page = await ctx.newPage(); page.setDefaultTimeout(5000); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8811/'); await page.waitForTimeout(500);
  const txt = (s) => page.innerText(s);
  // converter on Home
  ok(await page.$('#bConv') !== null, 'Home has a Unit converter link');
  await page.click('#bConv'); await page.waitForSelector('#cvV');
  ok(/1 cent/.test('1 cent') && (await page.$$('#cvOut tr[data-u]')).length === Object.keys(f.UNIT).length, 'converter lists every unit');
  await page.fill('#cvV', '2'); await page.selectOption('#cvU', { value: 'acre' }); await page.waitForTimeout(100);
  const row = async (u) => (await page.innerText('#cvOut tr[data-u="' + u + '"] td:last-child')).replace(/,/g, '');
  ok(+await row('cent') === 200 && +await row('guntha') === 80 && +await row('sqft') === 87120, '2 acre = 200 cent = 80 guntha = 87,120 sq ft: ' + await row('cent') + ' / ' + await row('guntha') + ' / ' + await row('sqft'));
  await page.click('#cvOut tr[data-u="guntha"]'); await page.waitForTimeout(100);
  ok(await page.inputValue('#cvU') === 'guntha' && +await page.inputValue('#cvV') === 80 && +await row('acre') === 2, 'tapping a row makes it the starting unit (80 guntha)');
  await page.fill('#cvV', ''); await page.waitForTimeout(100);
  ok(/Type a number/.test(await txt('#cvOut')), 'empty box asks for a number');
  await page.fill('#cvV', '1,5'); await page.selectOption('#cvU', { value: 'ground' }); await page.waitForTimeout(100);
  ok(near(+await row('sqft'), 3600, 0.5), 'a comma works as a decimal point: 1,5 ground = 3600 sq ft');
  await page.click('#cvOk'); await page.waitForTimeout(100);
  ok(!(await page.$('#cvV')), 'Close shuts the converter');
  // More tab: unit list and converter
  await page.click('nav button[data-tab=more]'); await page.waitForSelector('#sUnit');
  const opts = await page.$$eval('#sUnit option', a => a.map(o => o.value));
  ok(opts.join() === Object.keys(f.UNIT).join(), 'Main area unit lists all units: ' + opts.join(' '));
  await page.click('#mConv'); await page.waitForSelector('#cvV');
  ok(await page.inputValue('#cvV') === '1,5' && await page.inputValue('#cvU') === 'ground', 'the converter remembers the last value');
  await page.click('#cvOk');
  // pick guntha as the main unit; a plot shows in guntha
  await page.evaluate((c) => { localStorage.setItem('lm.draft.v1', JSON.stringify({ name: 'Test', place: '', notes: '', mode: 'corners', corners: c, holes: [], rec: null, tape: null })); }, cor);
  await page.selectOption('#sUnit', { value: 'guntha' }); await page.waitForTimeout(100);
  ok(JSON.parse(await page.evaluate(() => localStorage.getItem('lm.settings.v1'))).unit === 'guntha', 'guntha is saved as the main unit');
  await page.reload(); await page.waitForTimeout(500); await page.click('nav button[data-tab=measure]'); await page.waitForTimeout(200);
  ok(await page.$('#bNewPlot') !== null, 'Home with a plot in progress opens');
  const big = await page.$$eval('.sumn', a => a.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  const want = 1000 / (1089 * 0.09290304);
  ok(big.length === 1 && /guntha/.test(big[0]) && near(parseFloat(big[0].replace(/,/g, '')), want, 0.05), 'the summary shows guntha: ' + big[0] + ' (about ' + want.toFixed(2) + ')');
  // map tab: result card, cycling, more units
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(400);
  await page.click('#mLay'); await page.waitForSelector('#mAU');
  ok((await page.$$eval('#mAU option', a => a.length)) === Object.keys(f.UNIT).length && await page.inputValue('#mAU') === 'guntha', 'the map layout sheet lists all units with guntha picked');
  await page.keyboard.press('Escape'); await page.evaluate(() => { const o = document.getElementById('ov'); if (o && o.classList.contains('on')) o.click(); }); await page.waitForTimeout(150);
  await page.click('nav button[data-tab=measure]'); await page.waitForTimeout(150);
  // tap the number in the Result: cycles cent, acre, sq m, sq ft, then back to guntha
  const resTab = await page.$('.big-num[data-cyc]');
  if (resTab) {
    const seen = [];
    for (let i = 0; i < 5; i++) { seen.push(/guntha|cent|acre|sq m|sq ft/.exec(await page.innerText('.big-num[data-cyc]'))[0]); await page.click('.big-num[data-cyc]'); await page.waitForTimeout(150); }
    ok(seen.join() === 'guntha,cent,acre,sq m,sq ft', 'tapping the number cycles through the four main units and keeps guntha: ' + seen.join());
    ok(/guntha/.test(await page.innerText('.big-num[data-cyc]')), 'after sq ft it comes back to guntha');
    ok(await page.$('details.tip summary') !== null, 'the result has a More units list');
  } else ok(false, 'a result number with data-cyc was found');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exitCode = 1; srv.close(); process.exit(1); });
