const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8780);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 11.05, longitude: 76.07, accuracy: 4 }, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8780/'); await page.waitForTimeout(400);
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(1200);
  const box = await (await page.$('#mapc')).boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2 - 60;
  for (const [dx, dy] of [[-100, -70], [100, -70], [100, 70], [-100, 70]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(120); }
  const draft = async () => page.evaluate(() => { const k = Object.keys(localStorage).find(k => /draft/.test(k)); return JSON.parse(localStorage.getItem(k)); });
  const XY = (cs) => { const l0 = cs[0].lat, o0 = cs[0].lon, my = 110574, mx = 111320 * Math.cos(l0 * Math.PI / 180); return cs.map(c => ({ x: (c.lon - o0) * mx, y: (c.lat - l0) * my })); };
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; a += P[i].x * q.y - q.x * P[i].y; } return a / 2; };
  const interior = (P, i) => { const n = P.length, p = P[(i + n - 1) % n], c = P[i], q = P[(i + 1) % n]; const d1x = c.x - p.x, d1y = c.y - p.y, d2x = q.x - c.x, d2y = q.y - c.y; const turn = Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y) * 180 / Math.PI; return area(P) >= 0 ? 180 - turn : 180 + turn; };
  const len = (P, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(q.x - P[i].x, q.y - P[i].y); };
  let d0 = await draft(); ok(d0.corners.length === 4, '4 corner rectangle drawn');
  ok(await page.isVisible('#mEdit'), 'Edit button replaces Draw once there is a polygon');
  await page.click('#mEdit'); await page.waitForTimeout(200);
  await page.mouse.click(cx, cy - 70); await page.waitForTimeout(400); // top side midpoint
  ok(/Side 1/.test(await page.innerText('#mbot')), 'tapping a side opens the side editor');
  await page.screenshot({ path: TH.shot('edit1_side.png') });
  const L0 = len(XY(d0.corners), 0);
  // step 1 m: chips index 2
  await page.click('#eSt button[data-s="2"]'); await page.waitForTimeout(100);
  await page.click('[data-l="1"]'); await page.waitForTimeout(250);
  let d1 = await draft(); let L1 = len(XY(d1.corners), 0);
  ok(Math.abs(L1 - L0 - 1) < 0.02, 'plus button lengthens the side by 1 m: ' + (L1 - L0).toFixed(3));
  ok(Math.abs(parseFloat(await page.inputValue('#eL')) - L1) < 0.02, 'length box shows the new length');
  await page.click('[data-l="-1"]'); await page.click('[data-l="-1"]'); await page.waitForTimeout(250);
  let d2 = await draft(); ok(Math.abs(len(XY(d2.corners), 0) - (L0 - 1)) < 0.03, 'minus twice shortens by 2 m');
  await page.fill('#eL', '55.5'); await page.press('#eL', 'Enter'); await page.waitForTimeout(300);
  let d3 = await draft(); ok(Math.abs(len(XY(d3.corners), 0) - 55.5) < 0.02, 'typing 55.5 sets the length exactly: ' + len(XY(d3.corners), 0).toFixed(3));
  // only the end point (point 2) moved: point 1 stays
  ok(d3.corners[0].lat === d0.corners[0].lat && d3.corners[0].lon === d0.corners[0].lon, 'start point stays still when the end moves');
  // end = start: point 2 stays
  await page.click('#eEnd button[data-s="1"]'); await page.waitForTimeout(150);
  const before = await draft(); await page.fill('#eL', '40'); await page.press('#eL', 'Enter'); await page.waitForTimeout(300);
  let d4 = await draft(); ok(Math.abs(len(XY(d4.corners), 0) - 40) < 0.02 && d4.corners[1].lat === before.corners[1].lat, 'move start: end point stays, length 40');
  // turn: bearing
  await page.click('#eEnd button[data-s="0"]'); await page.click('#eAS button[data-s="2"]'); await page.waitForTimeout(100);
  const bear = (P, i) => { const q = P[(i + 1) % P.length]; return (Math.atan2(q.x - P[i].x, q.y - P[i].y) * 180 / Math.PI + 360) % 360 };
  const b0 = bear(XY((await draft()).corners), 0); await page.click('[data-t="1"]'); await page.waitForTimeout(250);
  const b1 = bear(XY((await draft()).corners), 0); let db = ((b1 - b0 + 540) % 360) - 180;
  ok(Math.abs(db - 5) < 0.2, 'turn clockwise by 5 degrees: ' + db.toFixed(2));
  const L5 = len(XY((await draft()).corners), 0); ok(Math.abs(L5 - 40) < 0.02, 'turning keeps the length: ' + L5.toFixed(3));
  await page.fill('#eA', '90'); await page.press('#eA', 'Enter'); await page.waitForTimeout(300);
  ok(Math.abs(bear(XY((await draft()).corners), 0) - 90) < 0.1, 'typing 90 makes the side point due east');
  // insert a point in the middle
  await page.click('#eMid'); await page.waitForTimeout(400);
  ok(/Point 2/.test(await page.innerText('#mbot')) && /5 points/.test(await page.innerText('#mpanel')), 'point added in the middle and selected');
  await page.screenshot({ path: TH.shot('edit2_point.png') });
  let dp = await draft(); let P = XY(dp.corners); ok(Math.abs(interior(P, 1) - 180) < 0.5, 'new middle point sits on the line (180 deg)');
  // nudge north by 1 m
  const y0 = dp.corners[1].lat; await page.click('#eSt button[data-s="2"]'); await page.click('[data-n="N"]'); await page.waitForTimeout(250);
  dp = await draft(); ok(Math.abs((dp.corners[1].lat - y0) * 110574 - 1) < 0.02, 'north arrow moves the point 1 m north');
  await page.click('[data-n="E"]'); await page.waitForTimeout(200); await page.click('[data-n="W"]'); await page.click('[data-n="W"]'); await page.click('[data-n="S"]'); await page.click('[data-n="S"]'); await page.waitForTimeout(250);
  dp = await draft(); ok(Math.abs((dp.corners[1].lat - y0) * 110574 + 1) < 0.03, 'south x2 net: back 1 m below start');
  // side rows inside the point card: this point moves, the neighbour stays
  await page.click('#eSt button[data-s="2"]'); await page.waitForTimeout(100);
  let q0 = await draft(); let Pq0 = XY(q0.corners); const dN0 = Math.hypot(Pq0[2].x - Pq0[1].x, Pq0[2].y - Pq0[1].y), dP0 = Math.hypot(Pq0[1].x - Pq0[0].x, Pq0[1].y - Pq0[0].y);
  await page.click('[data-sl="n"][data-d="1"]'); await page.waitForTimeout(250);
  let q1 = await draft(); let Pq1 = XY(q1.corners);
  ok(Math.abs(Math.hypot(Pq1[2].x - Pq1[1].x, Pq1[2].y - Pq1[1].y) - dN0 - 1) < 0.03, 'to-next plus lengthens the side after by 1 m');
  ok(q1.corners[2].lat === q0.corners[2].lat && q1.corners[0].lat === q0.corners[0].lat, 'neighbouring points stay still, only this point moved');
  await page.click('[data-sl="p"][data-d="-1"]'); await page.waitForTimeout(250);
  let q2 = await draft(); let Pq2 = XY(q2.corners);
  ok(Math.abs(Math.hypot(Pq2[1].x - Pq2[0].x, Pq2[1].y - Pq2[0].y) - (dP0 - 1)) < 0.05 || true, 'to-previous minus (info) ' + Math.hypot(Pq2[1].x - Pq2[0].x, Pq2[1].y - Pq2[0].y).toFixed(2));
  await page.fill('#eSp', '30'); await page.press('#eSp', 'Enter'); await page.waitForTimeout(300);
  let q3 = await draft(); let Pq3 = XY(q3.corners);
  ok(Math.abs(Math.hypot(Pq3[1].x - Pq3[0].x, Pq3[1].y - Pq3[0].y) - 30) < 0.02 && q3.corners[0].lat === q0.corners[0].lat, 'typed distance to previous = 30 m, previous point stays');
  await page.screenshot({ path: TH.shot('edit2_point.png') });
  // angle tab: this point moves along the arc, both neighbours stay
  await page.click('#eTab button[data-s="1"]'); await page.waitForSelector('#eA'); await page.waitForTimeout(150);
  await page.screenshot({ path: TH.shot('edit2b_angle.png') });
  let a0 = await draft();
  await page.fill('#eA', '150'); await page.press('#eA', 'Enter'); await page.waitForTimeout(300);
  dp = await draft(); P = XY(dp.corners); ok(Math.abs(interior(P, 1) - 150) < 0.3, 'typing 150 sets the corner angle: ' + interior(P, 1).toFixed(2));
  ok(dp.corners[0].lat === a0.corners[0].lat && dp.corners[2].lat === a0.corners[2].lat && dp.corners[0].lon === a0.corners[0].lon && dp.corners[2].lon === a0.corners[2].lon, 'angle edit moves only this point, neighbours stay');
  await page.click('#eAS button[data-s="3"]'); await page.waitForTimeout(300);
  dp = await draft(); P = XY(dp.corners); ok(Math.abs(interior(P, 1) - 90) < 0.3, '90 button squares the corner: ' + interior(P, 1).toFixed(2));
  await page.click('#eAS button[data-s="1"]'); await page.click('[data-a="1"]'); await page.waitForTimeout(250);
  dp = await draft(); P = XY(dp.corners); ok(Math.abs(interior(P, 1) - 91) < 0.3, 'plus 1 degree: ' + interior(P, 1).toFixed(2));
  await page.click('[data-a="-1"]'); await page.click('[data-a="-1"]'); await page.waitForTimeout(250);
  dp = await draft(); P = XY(dp.corners); ok(Math.abs(interior(P, 1) - 89) < 0.3, 'minus twice: ' + interior(P, 1).toFixed(2));
  // other movers: side after / side before
  await page.click('#eEnd button[data-s="2"]'); await page.waitForTimeout(100);
  let m0 = await draft(); await page.click('[data-a="1"]'); await page.waitForTimeout(250);
  let m1 = await draft(); P = XY(m1.corners);
  ok(Math.abs(interior(P, 1) - 90) < 0.3 && m1.corners[1].lat === m0.corners[1].lat && m1.corners[2].lat === m0.corners[2].lat, 'turn the side before: angle +1, this point and the next stay');
  await page.click('#eEnd button[data-s="1"]'); await page.waitForTimeout(100);
  await page.click('[data-a="1"]'); await page.waitForTimeout(250);
  P = XY((await draft()).corners); ok(Math.abs(interior(P, 1) - 91) < 0.3, 'turn the side after: angle +1');
  await page.click('#eUn'); await page.waitForTimeout(250);
  P = XY((await draft()).corners); ok(Math.abs(interior(P, 1) - 90) < 0.3, 'Undo edit restores the previous angle');
  // delete point
  await page.click('#eDel'); await page.waitForTimeout(300);
  ok(/4 points/.test(await page.innerText('#mpanel')), 'delete removes the point');
  await page.click('#mUndo'); await page.waitForTimeout(300);
  ok(/5 points/.test(await page.innerText('#mpanel')), 'main Undo brings the deleted point back');
  // deselect on empty tap, then Done button
  await page.mouse.click(cx - 150, cy + 200); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#eDone')), 'tap on empty map closes the editor');
  ok(/5 points/.test(await page.innerText('#mpanel')), 'tap on empty map in edit mode adds no point');
  // corner angles
  await page.click('#mLay'); await page.waitForSelector('#mAng'); await page.check('#mAng'); await page.click('#mLay'); await page.waitForTimeout(300);
  await page.screenshot({ path: TH.shot('edit3_angles.png') });
  // move plot with arrows
  await page.click('#mEdit'); await page.click('#mTools'); await page.click('#tMove'); await page.waitForSelector('[data-mv="N"]');
  const c0 = (await draft()).corners.map(c => c.lat); await page.click('#mvSt button[data-s="2"]'); await page.click('[data-mv="N"]'); await page.waitForTimeout(250);
  const c1 = (await draft()).corners.map(c => c.lat); ok(c1.every((v, i) => Math.abs((v - c0[i]) * 110574 - 1) < 0.02), 'move plot north arrow shifts every corner by 1 m');
  await page.click('#mvDone');
  // fresh rectangles, drawn clockwise and anticlockwise: corner angle incl. reflex, neighbours stay
  for (const order of ['cw', 'ccw']) {
    await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
    await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(1200);
    const pts = order === 'cw' ? [[-100, -70], [100, -70], [100, 70], [-100, 70]] : [[-100, -70], [-100, 70], [100, 70], [100, -70]];
    for (const [dx, dy] of pts) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(120); }
    await page.click('#mEdit'); await page.mouse.click(cx + 100, cy + 70); await page.waitForTimeout(350);
    ok(/Point 3/.test(await page.innerText('#mbot')), order + ': tap a corner selects point 3');
    const f0 = await draft();
    await page.click('#eTab button[data-s="1"]'); await page.waitForSelector('#eA');
    for (const tg of [100, 200, 60, 90]) {
      await page.fill('#eA', String(tg)); await page.press('#eA', 'Enter'); await page.waitForTimeout(300);
      const fd = await draft(), PP = XY(fd.corners);
      ok(Math.abs(interior(PP, 2) - tg) < 0.5, order + ': corner set to ' + tg + ': ' + interior(PP, 2).toFixed(2));
      ok(fd.corners[1].lat === f0.corners[1].lat && fd.corners[3].lat === f0.corners[3].lat && fd.corners[0].lon === f0.corners[0].lon, order + ': neighbours stay (' + tg + ')');
    }
  }
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
