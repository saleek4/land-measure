const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'content-type':'text/html'}); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8771);
const tile = fs.readFileSync(TH.fixture('tile.png'));
let tileReq = 0, nomReq = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => { tileReq++; r.fulfill({ status: 200, contentType: 'image/png', body: tile }); });
  await ctx.route('**/nominatim.openstreetmap.org/**', r => { nomReq++; r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ lat: '11.2000', lon: '76.2000', display_name: 'Testville, Kerala, India', boundingbox: ['11.15', '11.25', '76.15', '76.25'] }]) }); });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {}
    try {
      if (!localStorage.getItem('lm.map.v1')) {
        localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 19, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap' }));
        localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' }));
      }
    } catch (e) {}
    window.__pos = { lat: 11.05, lon: 76.07, alt: 100 };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(ok) { return setInterval(() => ok({ coords: { latitude: __pos.lat, longitude: __pos.lon, accuracy: 3, altitude: __pos.alt, altitudeAccuracy: 4 }, timestamp: Date.now() }), 100); },
      clearWatch(id) { clearInterval(id); } } });
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8771/');
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const mview = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.map.v1')));
  const panel = () => page.innerText('#mpanel');
  await page.click('nav button[data-tab=map]');
  await page.waitForSelector('#mapc');
  const R = await page.evaluate(() => { const r = document.querySelector('#mapc').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
  console.log('canvas rect', JSON.stringify(R));
  await page.waitForTimeout(400);
  ok(tileReq > 0, 'tiles requested (' + tileReq + ')');
  console.log('empty panel:', (await panel()).replace(/\n/g, ' | '));
  await page.screenshot({ path: TH.shot('map1_empty.png') });

  // 1) tap four corners of a 200 px square
  for (const [dx, dy] of [[-100, -100], [100, -100], [100, 100], [-100, 100]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(80); }
  let d = await draft();
  ok(d.corners.length === 4 && d.corners.every(c => c.src === 'map'), 'tap added 4 map corners');
  const mpp = 156543.03392 * Math.cos(11.05 * Math.PI / 180) / Math.pow(2, 19);
  const expCent = (200 * mpp) * (200 * mpp) / 40.468564224;
  const txt = await panel(); console.log('panel:', txt.replace(/\n/g, ' | '));
  const m = txt.match(/([\d.,]+)\s*cent/); const got = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
  ok(Math.abs(got - expCent) / expCent < 0.01, 'area ' + got + ' cent vs expected ' + expCent.toFixed(2));
  ok(/Perimeter\s*[\d.,]+ m/.test(txt) && /Last side/.test(txt) && /Map estimate/.test(txt), 'panel shows perimeter, last side, Map estimate');
  await page.screenshot({ path: TH.shot('map2_square.png') });

  // 2) fill is transparent: pixel inside polygon with fill 12% vs 0%
  const { execFileSync } = require('child_process');
  const px = async (x, y) => { await page.click('#mLay'); await page.waitForTimeout(80); await page.screenshot({ path: TH.tmp('px.png') }); await page.click('#mLay'); await page.waitForSelector('#mFill', { state: 'visible' }); return JSON.parse(execFileSync('python3', ['-c', 'import sys,json;from PIL import Image;im=Image.open(sys.argv[3]).convert("RGB");print(json.dumps(list(im.getpixel((int(float(sys.argv[1])*2),int(float(sys.argv[2])*2))))))', String(x), String(y), TH.tmp('px.png')]).toString()); };
  const setFill = async v => { await page.evaluate(v => { const e = document.querySelector('#mFill'); e.value = v; e.dispatchEvent(new Event('input')); }, v); await page.waitForTimeout(120); };
  await page.click('#mLay'); await page.waitForSelector('#mFill', { state: 'visible' });
  await setFill(0); const p0 = await px(cx + 30, cy + 80);
  await setFill(12); const p1 = await px(cx + 30, cy + 80);
  const exp = [0, 1, 2].map(i => Math.round(p0[i] * 0.88 + [255, 210, 63][i] * 0.12));
  ok(p0.join() !== p1.join() && exp.every((v, i) => Math.abs(v - p1[i]) <= 2), 'fill 12% blends with the picture: ' + p0 + ' -> ' + p1 + ' (expected ' + exp + ')');
  await setFill(60); const p6 = await px(cx + 30, cy + 80);
  ok(p6[0] > p1[0] && p6[2] < p1[2], 'fill slider changes opacity');
  await setFill(12);
  await page.screenshot({ path: TH.shot('map3_options.png') });
  await page.click('#mLay'); // closes the options popover
  d = await draft(); if (d.corners.length === 5) { await page.click('#mUndo'); }
  d = await draft(); ok(d.corners.length === 4, 'back to 4 points after closing options');

  // 3) drag corner 1 by (+40,+30) px; touching 6 px below it
  const before = (await draft()).corners[0];
  await page.mouse.move(cx - 100, cy - 100 + 6); await page.mouse.down(); await page.mouse.move(cx - 80, cy - 90, { steps: 4 }); await page.mouse.move(cx - 60, cy - 70, { steps: 4 }); await page.mouse.up();
  d = await draft(); const after = d.corners[0];
  const dxm = (after.lon - before.lon) * Math.PI / 180 * 6378137 * Math.cos(11.05 * Math.PI / 180), dym = (after.lat - before.lat) * Math.PI / 180 * 6335000;
  console.log('drag moved (m): east', dxm.toFixed(2), 'north', dym.toFixed(2), '(expected east', (40 * mpp).toFixed(2), 'north', (-24 * mpp).toFixed(2), ')');
  ok(d.corners.length === 4 && Math.abs(dxm - 40 * mpp) < 0.8 && Math.abs(dym + 24 * mpp) < 0.8, 'dragging a corner moves it with the finger');

  // 4) pan does not add points
  const v0 = await mview();
  await page.mouse.move(cx + 40, cy + 200); await page.mouse.down(); await page.mouse.move(cx + 90, cy + 230, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(450);
  const v1 = await mview(); d = await draft();
  ok(d.corners.length === 4 && (v1.lat !== v0.lat || v1.lon !== v0.lon), 'panning moves the map without adding a point');

  // 5) pinch zoom with two touches (+1 zoom level when fingers spread 2x)
  const cdp = await ctx.newCDPSession(page); const zz0 = (await mview()).zoom;
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  await T('touchStart', [[cx - 40, cy + 60], [cx + 40, cy + 60]]);
  for (let k = 1; k <= 5; k++) await T('touchMove', [[cx - 40 - 8 * k, cy + 60], [cx + 40 + 8 * k, cy + 60]]);
  await T('touchEnd', []); await page.waitForTimeout(450);
  const zz1 = (await mview()).zoom; d = await draft();
  ok(Math.abs((zz1 - zz0) - 1) < 0.08 && d.corners.length === 4, 'pinch zoom +' + (zz1 - zz0).toFixed(2) + ' levels, no point added');

  // 6) fit, and corner tap menu / delete
  await page.click('#mFit'); await page.waitForTimeout(200);
  await page.screenshot({ path: TH.shot('map4_fit.png') });
  const sp = await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('lm.draft.v1')).corners; return c.length; });
  ok(sp === 4, 'fit keeps points');

  // 7) centre pin mode
  await page.click('#mUndo'); await page.click('#mUndo'); await page.click('#mUndo'); await page.click('#mUndo');
  ok((await draft()).corners.length === 0, 'undo removes all points');
  await page.click('#mLay'); await page.click('[data-add=centre]'); await page.mouse.click(cx + 150, cy + 150); // close popover
  await page.waitForSelector('#mAdd');
  await page.evaluate(() => { const z = JSON.parse(localStorage.getItem('lm.map.v1')); }); 
  // drive the map by dragging so the pin sits on three different spots
  for (let i = 0; i < 3; i++) {
    await page.click('#mAdd');
    await page.mouse.move(cx + 60, cy - 60); await page.mouse.down(); await page.mouse.move(cx + 60 - 90, cy - 60 + (i === 0 ? 10 : 95), { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(60);
  }
  console.log('centre-mode panel:', (await panel()).replace(/\n/g, ' | '));
  d = await draft(); ok(d.corners.length === 3 && /Pin:/.test(await panel()), 'centre pin adds points and shows live pin preview');
  await page.screenshot({ path: TH.shot('map5_pin.png') });

  // 7b) tap a corner -> menu -> delete
  await page.click('#mAdd'); d = await draft(); ok(d.corners.length === 4, 'extra point added at the pin');
  await page.mouse.click(cx, cy); await page.waitForSelector('#vDel');
  ok(/Point 4/.test(await page.innerText('#sheet')), 'tapping a corner opens its menu');
  await page.click('#vDel'); await page.waitForTimeout(100);
  d = await draft(); ok(d.corners.length === 3, 'delete removes the corner');
  // 8) search
  await page.click('#mSrch'); await page.fill('#mQ', 'Testville'); await page.click('#mGo'); await page.waitForSelector('#mRes button');
  await page.click('#mRes button'); await page.waitForTimeout(450);
  const v2 = await mview(); ok(nomReq === 1 && Math.abs(v2.lat - 11.2) < 0.01 && Math.abs(v2.lon - 76.2) < 0.01, 'search flies to the result (' + v2.lat.toFixed(3) + ', ' + v2.lon.toFixed(3) + ' z' + v2.zoom.toFixed(1) + ')');
  await page.click('#mSrch'); await page.fill('#mQ', '11.05, 76.07'); await page.click('#mGo'); let v3 = await mview(); for (let k = 0; k < 25 && Math.abs(v3.lat - 11.05) >= 0.001; k++) { await page.waitForTimeout(100); v3 = await mview(); }
  ok(Math.abs(v3.lat - 11.05) < 0.001 && nomReq === 1, 'lat,lon typed directly works without a network search');

  // 9) GPS point on the map tab
  await page.click('#mFit'); await page.click('#mGps'); await page.waitForSelector('#capbar');
  await page.screenshot({ path: TH.shot('map6_capture.png') });
  await page.waitForSelector('#mGps', { timeout: 8000 });
  d = await draft(); ok(d.corners.length === 4 && d.corners[3].src !== 'map' && d.corners[3].n > 1, 'GPS point captured from the map tab (n=' + d.corners[3].n + ')');
  console.log('mixed panel:', (await panel()).replace(/\n/g, ' | '));
  ok(/GPS \+ map/.test(await panel()), 'panel says GPS + map');

  // 10) save from the map tab
  await page.click('#mSave'); await page.fill('#sN', 'Map plot A'); await page.fill('#sP', 'Testville'); await page.click('#sOk');
  await page.waitForSelector('#bMap');
  const plots = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.plots.v1')));
  ok(plots.length === 1 && plots[0].name === 'Map plot A' && plots[0].src === 'mixed', 'saved plot with src=' + plots[0].src);
  const detail = await page.innerText('#app'); ok(/GPS \+ map|placed on the satellite map/i.test(detail) || /points were placed/.test(detail), 'detail mentions map points');
  await page.screenshot({ path: TH.shot('map7_detail.png'), fullPage: true });

  // 11) view saved plot on the map, then edit a copy
  await page.click('#bMap'); await page.waitForSelector('#mBack');
  await page.waitForFunction(() => /Viewing: Map plot A/.test(document.querySelector('#mpanel').innerText), null, { timeout: 3000 }).catch(() => {}); ok(/Viewing: Map plot A/.test(await panel()), 'saved plot opens on the satellite map'); await page.waitForTimeout(300);
  await page.screenshot({ path: TH.shot('map8_view.png') });
  await page.click('#mCopy'); await page.waitForSelector('#mUndo'); d = await draft();
  ok(d.corners.length === 4 && /copy/.test(d.name), 'edit a copy loads the points into the draft');
  // from Measure tab
  await page.click('nav button[data-tab=measure]'); ok(await page.isVisible('#bToMap'), 'Measure tab has satellite map button');
  await page.click('#bToMap'); await page.waitForSelector('#mapc'); ok(true, 'Measure -> Map works');
  // old GPS plots still render in plots list; tag shows
  await page.click('nav button[data-tab=plots]'); ok(/GPS \+ map/.test(await page.innerText('#app')), 'plot list tags GPS + map');
  console.log('tiles requested:', tileReq, 'search calls:', nomReq);
  console.log('JS ERRORS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e); srv.close(); process.exit(1); });
