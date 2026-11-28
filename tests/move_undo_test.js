// Undo must cover moving / turning the whole plot and dragging one corner. Before, Undo removed the LAST POINT instead, and a dragged corner could not be put back.
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8814);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.map.v1')) localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 19, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap', loupe: true })); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8814/');
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const toastT = async () => page.evaluate(() => { const t = document.querySelector('#toast,.toast'); return t ? t.textContent : ''; });
  const same = (a, b) => a.length === b.length && a.every((c, i) => Math.abs(c.lat - b[i].lat) < 1e-9 && Math.abs(c.lon - b[i].lon) < 1e-9);
  const dm = (a, b) => Math.hypot((a.lat - b.lat) * 110574, (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180));
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc');
  const R = await page.evaluate(() => { const r = document.querySelector('#mapc').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2 - 60;
  for (const [dx, dy] of [[-60, -60], [60, -60], [60, 60], [-60, 60]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(70); }
  // make it a tape plot with a hole, like the real case
  let d = await draft(); ok(d.corners.length === 4, 'four corners drawn');
  d.corners.forEach(c => { c.src = 'tape'; c.acc = 0.1; });
  const c0 = d.corners[0], h = 0.00002;
  d.holes = [{ corners: [{ lat: c0.lat - 0.0002, lon: c0.lon + 0.0002, acc: 4, src: 'map' }, { lat: c0.lat - 0.0002, lon: c0.lon + 0.0003, acc: 4, src: 'map' }, { lat: c0.lat - 0.0003, lon: c0.lon + 0.00025, acc: 4, src: 'map' }] }];
  await page.evaluate(x => localStorage.setItem('lm.draft.v1', JSON.stringify(x)), d); await page.reload(); await page.waitForTimeout(400);
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.click('#mFit'); await page.waitForTimeout(800);
  const base = await draft(); const mX = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z, mY = (lat, z) => { const q = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + q) / (1 - q)) / (4 * Math.PI)) * 256 * 2 ** z; };
  const scr = async c => { const v = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.map.v1'))); return { x: cx + mX(c.lon, v.zoom) - mX(v.lon, v.zoom), y: R.y + R.h / 2 + mY(c.lat, v.zoom) - mY(v.lat, v.zoom) }; };

  // ---- 1. one corner dragged by hand, then Undo puts THAT corner back (and does not delete the last point)
  const P0 = await scr(base.corners[0]);
  await page.mouse.move(P0.x, P0.y); await page.mouse.down(); await page.mouse.move(P0.x + 20, P0.y + 15, { steps: 4 }); await page.mouse.move(P0.x + 45, P0.y + 30, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(200);
  d = await draft();
  ok(d.corners.length === 4 && dm(d.corners[0], base.corners[0]) > 2, 'corner 1 was dragged (' + dm(d.corners[0], base.corners[0]).toFixed(1) + ' m) and the others stayed');
  ok(d.corners[0].src === 'map', 'the dragged corner became a map point');
  ok(/moved by hand/.test(await toastT()) && /tape/.test(await toastT()), 'a toast says it was moved by hand and is no longer from the tape (' + (await toastT()).slice(0, 70) + ')');
  await page.click('#mUndo'); await page.waitForTimeout(200);
  d = await draft();
  ok(d.corners.length === 4, 'Undo did NOT remove the last point (' + d.corners.length + ' corners)');
  ok(same(d.corners, base.corners) && d.corners[0].src === 'tape' && d.corners[0].acc === 0.1, 'Undo put corner 1 back exactly, with its tape source');
  ok(await page.isVisible('#mRedo'), 'Redo is offered');
  await page.click('#mRedo'); await page.waitForTimeout(150);
  d = await draft(); ok(dm(d.corners[0], base.corners[0]) > 2 && d.corners.length === 4, 'Redo moves the corner again');
  await page.click('#mUndo'); await page.waitForTimeout(150);

  // ---- 2. Move mode: drag the whole plot, then undo with the button in the Move panel
  await page.click('#mTools'); await page.waitForSelector('#tMove'); await page.click('#tMove'); await page.waitForSelector('#mvU');
  ok(await page.$eval('#mvU', e => e.disabled), 'Move panel: Undo is disabled while nothing was moved');
  const pb = await page.$eval('#mtb', e => e.getBoundingClientRect().top);
  ok(pb > 560, 'Move panel is compact: it starts at y=' + Math.round(pb) + ' (the map stays visible)');
  await page.waitForTimeout(3200); await page.screenshot({ path: TH.shot('move_undo_panel.png') });
  const y0 = R.y + 200;
  await page.mouse.move(cx, y0); await page.mouse.down(); await page.mouse.move(cx + 25, y0 + 15, { steps: 4 }); await page.mouse.move(cx + 60, y0 + 40, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(200);
  d = await draft(); const moved1 = d;
  ok(dm(d.corners[1], base.corners[1]) > 3 && d.holes[0].corners.length === 3, 'dragging moved the whole plot (' + dm(d.corners[1], base.corners[1]).toFixed(1) + ' m)');
  ok(Math.abs(dm(d.corners[0], d.corners[1]) - dm(base.corners[0], base.corners[1])) < 0.01, 'the sides kept their length');
  ok(!(await page.$eval('#mvU', e => e.disabled)), 'Undo is enabled after the move');
  await page.click('#mvU'); await page.waitForTimeout(200);
  d = await draft();
  ok(same(d.corners, base.corners) && same(d.holes[0].corners, base.holes[0].corners), 'Undo brings the plot AND its hole back to the first place');
  ok(await page.$eval('#mvU', e => e.disabled), 'Undo is disabled again');

  // ---- 3. several steps: arrow, turn, to middle - each is one Undo step
  await page.click('[data-mv=E]'); await page.click('[data-mv=E]'); await page.waitForTimeout(100); const s2 = await draft();
  await page.click('#mvR'); await page.waitForTimeout(100); const s3 = await draft();
  await page.click('#mvC'); await page.waitForTimeout(100); const s4 = await draft();
  ok(!same(s2.corners, base.corners) && !same(s3.corners, s2.corners) && !same(s4.corners, s3.corners), 'arrow x2, turn and "To middle" each changed the plot');
  await page.click('#mvU'); await page.waitForTimeout(100); d = await draft(); ok(same(d.corners, s3.corners) && same(d.holes[0].corners, s3.holes[0].corners), 'Undo 1: back before "To middle"');
  await page.click('#mvU'); await page.waitForTimeout(100); d = await draft(); ok(same(d.corners, s2.corners), 'Undo 2: back before the turn');
  await page.click('#mvU'); await page.waitForTimeout(100); await page.click('#mvU'); await page.waitForTimeout(100); d = await draft();
  ok(same(d.corners, base.corners) && same(d.holes[0].corners, base.holes[0].corners) && d.corners.length === 4, 'Undo 3 and 4: both arrow steps are undone, plot and hole are where they started');

  // ---- 4. the case from the phone: move, press Done, then the normal Undo button
  await page.click('[data-mv=N]'); await page.waitForTimeout(100); const s5 = await draft();
  ok(!same(s5.corners, base.corners), 'moved north');
  await page.click('#mvDone'); await page.waitForTimeout(200);
  await page.click('#mUndo'); await page.waitForTimeout(200);
  d = await draft();
  ok(d.corners.length === 4 && same(d.corners, base.corners), 'normal Undo after Done undoes the MOVE; it does not delete a point (' + d.corners.length + ' corners)');
  // with nothing left to undo, Undo still removes the last point as before
  await page.click('#mUndo'); await page.waitForTimeout(200); d = await draft();
  ok(d.corners.length === 3, 'with no move left to undo, Undo removes the last point as before');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); srv.close();
})();
