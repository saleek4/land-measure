// A plot drawn for ANOTHER place must not jump to the phone's GPS spot. The app asks where the plot is; "Another place" puts it in the middle of the map (not at GPS) and opens Move, which has "Put plot in the middle of the map".
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8813);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const HOME = { lat: 11.0500, lon: 76.0700 };   // where the person stands (GPS)
const LAND = { lat: 11.1933, lon: 76.1620 };   // the other place, about 17 km away
const dist = (a, b) => { const R = 6371000, d = Math.PI / 180, x = (b.lon - a.lon) * d * Math.cos((a.lat + b.lat) / 2 * d), y = (b.lat - a.lat) * d; return R * Math.sqrt(x * x + y * y); };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, geolocation: { latitude: HOME.lat, longitude: HOME.lon, accuracy: 4 }, permissions: ['geolocation'] });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript((land) => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.settings.v1')) localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'sqm' })); if (!localStorage.getItem('lm.map.v1')) localStorage.setItem('lm.map.v1', JSON.stringify({ lat: land.lat, lon: land.lon, zoom: 18 })); } catch (e) {} }, LAND);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8813/'); await page.waitForTimeout(400);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const mapSt = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.map.v1')));
  const centre = (d) => { const C = d.corners; return { lat: (Math.min(...C.map(c => c.lat)) + Math.max(...C.map(c => c.lat))) / 2, lon: (Math.min(...C.map(c => c.lon)) + Math.max(...C.map(c => c.lon))) / 2 }; };
  const scr = async (x, y) => { const r = await page.$eval('#skSvg', e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top }; }); return { x: r.l + x, y: r.t + y }; };
  const tap = async (x, y) => { const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(40); };
  const cpos = async (i) => page.$eval('#skSvg circle[data-c="' + i + '"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const tapC = async (i) => { const p = await cpos(i); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(40); };
  const mode = async (m) => { await page.click('#skModes [data-sm="' + m + '"]'); await page.waitForTimeout(80); };
  const title = () => page.innerText('#skPanel .skt');
  const next = async () => { await page.click('#skNext'); await page.waitForTimeout(80); };
  const fill = async (v) => { await page.fill('#skIn', v); await page.waitForTimeout(60); };
  const goto = async (re) => { for (let i = 0; i < 9; i++) { if (!(await page.$('#skIn'))) { await mode('len'); continue; } if (re.test(await title())) return true; await next(); } return false; };
  const toastT = async () => page.evaluate(() => { const t = document.querySelector('#toast,.toast'); return t ? t.textContent : ''; });

  // draw a 24 m x 40 m sketch (4 sides + 1 cross) and put it on the map, starting from Home while GPS is fresh
  const sketch = async () => {
    await TH.startWay(page, 'sk'); await page.waitForSelector('#skSvg');
    await tap(60, 60); await tap(300, 60); await tap(300, 460); await tap(60, 460); await tapC(0); await page.waitForTimeout(100);
    await mode('cross'); await tapC(0); await tapC(2); await mode('len');
    await goto(/Side 1/); await fill('24'); await goto(/Side 2/); await fill('40'); await goto(/Side 3/); await fill('24'); await goto(/Side 4/); await fill('40'); await goto(/Cross 1/); await fill('46.64');
    await mode('res'); await page.waitForTimeout(150);
  };
  await page.waitForTimeout(1200);   // GPS fix arrives, so it is "fresh"
  await sketch();
  await page.click('#skPlace'); await page.waitForTimeout(250);
  const sheetT = await page.innerText('#sheet');
  ok(/Where is this plot/.test(sheetT), 'GPS is fresh and we are on Home: the app asks where the plot is (not a silent guess)');
  ok(/Here, where I stand/.test(sheetT) && /Another place/.test(sheetT), 'choices: here / another place');
  await page.screenshot({ path: TH.shot('move_place_ask.png') });
  // another place -> the middle of the map (the land), NOT the GPS spot, and Move opens
  await page.click('#sheet button:has-text("Another place")'); await page.waitForTimeout(500);
  let d = await draft(), c = centre(d), ms = await mapSt();
  ok(d.corners.length === 4 && d.corners.every(p => p.src === 'tape'), 'the tape plot is placed (4 corners)');
  ok(dist(c, HOME) > 10000, 'the plot is NOT at the GPS spot (' + Math.round(dist(c, HOME)) + ' m from where I stand)');
  ok(dist(c, LAND) < 300, 'the plot is at the middle of the map where I last looked (' + Math.round(dist(c, LAND)) + ' m from it)');
  ok(await page.isVisible('#mvC'), 'Move opens with "Put plot in the middle of the map"');
  ok(/Move the map to your land/.test(await toastT()), 'the toast says what to do next (' + (await toastT()).slice(0, 50) + ')');
  await page.screenshot({ path: TH.shot('move_place_else.png') });
  // the map is moved to another spot (search by coordinates), then the plot is brought there
  await page.click('#mvDone'); await page.waitForTimeout(100);
  const OTHER = { lat: 11.2500, lon: 76.2500 };
  await page.click('#mSrch'); await page.fill('#mQ', OTHER.lat + ', ' + OTHER.lon); await page.click('#mGo'); await page.waitForTimeout(500);
  d = await draft(); const before = centre(d), w0 = dist({ lat: d.corners[0].lat, lon: d.corners[0].lon }, { lat: d.corners[1].lat, lon: d.corners[1].lon }), h0 = dist({ lat: d.corners[1].lat, lon: d.corners[1].lon }, { lat: d.corners[2].lat, lon: d.corners[2].lon });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Move or turn/.test(x.textContent)); if (b) b.click(); });
  if (!(await page.isVisible('#mvC'))) { await page.click('#mTools'); await page.waitForSelector('#tMove'); await page.click('#tMove'); }
  await page.waitForSelector('#mvC'); await page.waitForTimeout(100);
  await page.click('#mvC'); await page.waitForTimeout(300);
  d = await draft(); ms = await mapSt(); c = centre(d);
  ok(dist(before, OTHER) > 5000, 'before: the plot is far from where the map is now (' + Math.round(dist(before, OTHER)) + ' m)');
  ok(dist(c, { lat: ms.lat, lon: ms.lon }) < 1, 'after "Put plot in the middle of the map" the plot centre is the map centre (' + dist(c, { lat: ms.lat, lon: ms.lon }).toFixed(2) + ' m)');
  const w1 = dist({ lat: d.corners[0].lat, lon: d.corners[0].lon }, { lat: d.corners[1].lat, lon: d.corners[1].lon }), h1 = dist({ lat: d.corners[1].lat, lon: d.corners[1].lon }, { lat: d.corners[2].lat, lon: d.corners[2].lon });
  ok(Math.abs(w1 - w0) < 0.05 && Math.abs(h1 - h0) < 0.05, 'the sides keep their length (' + w0.toFixed(2) + ' -> ' + w1.toFixed(2) + ', ' + h0.toFixed(2) + ' -> ' + h1.toFixed(2) + ' m)');
  await page.screenshot({ path: TH.shot('move_place_centre.png') });

  // "Here, where I stand" still works: the plot goes to the GPS spot
  await page.evaluate(() => { localStorage.removeItem('lm.draft.v1'); }); await page.reload(); await page.waitForTimeout(1500);
  await sketch(); await page.click('#skPlace'); await page.waitForTimeout(250);
  ok(/Where is this plot/.test(await page.innerText('#sheet')), 'asks again for a new plot');
  await page.click('#sheet button:has-text("Here, where I stand")'); await page.waitForTimeout(500);
  d = await draft(); c = centre(d);
  ok(dist(c, HOME) < 100, 'Here: the plot is at the GPS spot (' + Math.round(dist(c, HOME)) + ' m)');
  ok(/where you stand/.test(await toastT()), 'the toast says it was placed where you stand');
  // Cancel keeps the sketch and places nothing
  await page.evaluate(() => { localStorage.removeItem('lm.draft.v1'); }); await page.reload(); await page.waitForTimeout(1500);
  await sketch(); await page.click('#skPlace'); await page.waitForTimeout(250);
  await page.click('#sheet button:has-text("Cancel")'); await page.waitForTimeout(300);
  d = await draft();
  ok(!d.corners.length && await page.isVisible('#skSvg'), 'Cancel: nothing is placed and the sketch stays open');

  await page.evaluate(() => { localStorage.removeItem('lm.draft.v1'); }); await page.reload(); await page.waitForTimeout(1500);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); srv.close();
})();
