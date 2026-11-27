// The hand-drawn sketch editor: draw a polygon, type each tape length, add crosses, get the real shape.
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8796);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const shoe = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const CENT = 40.468564224;
// the real plot: an 8-corner ellipse, 60 m x 35 m, listed counter-clockwise (x east, y north)
const ang = [0.1, 0.9, 1.7, 2.4, 3.2, 3.95, 4.7, 5.5];
const real = ang.map(t => [60 * Math.cos(t), 35 * Math.sin(t)]);
// what the person draws on the phone: the same shape, 3.2 px per metre, a bit wobbly, drawn the other way round (clockwise on screen is fine, so is this)
const jit = [[4, -3], [-5, 2], [3, 4], [-4, -2], [5, 3], [-3, 5], [2, -4], [-2, -5]];
const drawn = real.map((p, i) => [180 + p[0] * 2.4 + jit[i][0], 260 - p[1] * 4 + jit[i][1]]);
const crs = [[0, 2], [2, 4], [4, 6], [0, 6], [0, 4]];
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.settings.v1')) localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8796/'); await page.waitForTimeout(400);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  // while the sketch is still in its first view (not zoomed, not fitted) a point (x, y) is x, y pixels from the top left of the canvas
  const scr = async (x, y) => { const r = await page.$eval('#skSvg', e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top }; }); return { x: r.l + x, y: r.t + y }; };
  const tap = async (x, y) => { const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(40); };
  // where corner i is on the screen now (after the picture was fitted or zoomed)
  const cpos = async (i) => page.$eval('#skSvg circle[data-c="' + i + '"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const tapC = async (i) => { const p = await cpos(i); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(40); };
  const drag = async (a, b2) => { const p = await scr(a[0], a[1]), q = await scr(b2[0], b2[1]); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 }); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(60); };
  const mode = async (m) => { await page.click('#skModes [data-sm="' + m + '"]'); await page.waitForTimeout(80); };
  const sk = async () => (await draft()).sk || { pts: [], closed: false, cr: [], L: {} };
  const nPts = async () => (await sk()).pts.length;
  const tab = () => page.$eval('nav button.on', e => e.dataset.tab);
  const bigArea = async () => parseFloat((await page.innerText('#skPanel .skbig')).replace(/[^\d.]/g, ''));

  // ---- Home: three big ways to start, all visible without scrolling
  const vis = async (sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight - 60; }).catch(() => false);
  ok(await vis('#bSketch') && await vis('#bCap') && await vis('#bToMap'), 'Home: Sketch, GPS and Map are all visible without scrolling on a 390x844 phone');
  ok(/Home/.test(await page.innerText('nav button[data-tab=measure]')), 'bottom tab is called Home');
  ok(/How do you want to measure/.test(await page.innerText('.next')), 'Home tells you what to do first');

  // ---- open the sketch
  await page.click('#bSketch'); await page.waitForSelector('#skSvg');
  ok(/Step 1/.test(await page.innerText('#skPanel')), 'blank sketch says what to do first (Step 1: tap the corners)');
  ok((await page.$eval('#skUn', e => e.disabled)) && (await page.$eval('#skRe', e => e.disabled)), 'Undo and Redo are off on a blank sketch');

  // ---- draw: 8 corners round the plot (clockwise on the screen order of the list reversed below in test 2)
  for (let i = 0; i < 8; i++) await tap(drawn[i][0], drawn[i][1]);
  ok(await nPts() === 8, '8 taps make 8 corners');
  ok(await page.$eval('#skCl', e => !e.disabled), 'Close shape is on');
  // undo / redo
  await page.click('#skUn'); ok(await nPts() === 7, 'Undo removes the last corner'); await page.click('#skRe'); ok(await nPts() === 8, 'Redo brings it back');
  // drag a corner to fix it
  const mv = [drawn[7][0] + 0, drawn[7][1] + 0];
  await mode('move'); await drag([drawn[7][0], drawn[7][1]], [mv[0] + 10, mv[1] + 8]);
  let pos = { x: (await sk()).pts[7][0], y: (await sk()).pts[7][1] };
  ok(Math.abs(pos.x - (mv[0] + 10)) < 3 && Math.abs(pos.y - (mv[1] + 8)) < 3, 'dragging a corner moves it');
  await page.click('#skUn'); pos = { x: (await sk()).pts[7][0], y: (await sk()).pts[7][1] };
  ok(Math.abs(pos.x - mv[0]) < 1 && Math.abs(pos.y - mv[1]) < 1, 'Undo puts the corner back');
  // ---- close by tapping corner 1
  await mode('draw');
  await tapC(0); await page.waitForTimeout(100);
  ok((await sk()).closed, 'tapping corner 1 closes the shape');
  ok(/Side 1/.test(await page.innerText('#skPanel')), 'after closing it asks for side 1 first');

  // ---- zoom and move: the drawing itself must not change
  const cv = await page.$eval('#skSvg', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const inCv = p => p[0] >= cv[0] && p[0] <= cv[0] + cv[2] && p[1] >= cv[1] && p[1] <= cv[1] + cv[3];
  let allIn = true; for (let i = 0; i < 8; i++) allIn = allIn && inCv(await cpos(i));
  ok(allIn, 'closing the shape fits the whole drawing on the screen');
  const stored0 = JSON.stringify((await sk()).pts);
  const g0 = [await cpos(0), await cpos(1)], gd = (a, b2) => Math.hypot(a[0] - b2[0], a[1] - b2[1]);
  await page.mouse.move(cv[0] + cv[2] / 2, cv[1] + cv[3] / 2); await page.mouse.wheel(0, -400); await page.waitForTimeout(80);
  const g1 = [await cpos(0), await cpos(1)];
  ok(gd(g1[0], g1[1]) > 1.3 * gd(g0[0], g0[1]), 'wheel zoom in makes the picture bigger (' + gd(g0[0], g0[1]).toFixed(0) + ' to ' + gd(g1[0], g1[1]).toFixed(0) + ' px)');
  ok(await page.$eval('#skSvg circle[data-c="0"]', e => e.getAttribute('r')) === '14', 'corner circles keep the same size when zoomed');
  await page.click('#skZo'); await page.click('#skZi'); await page.waitForTimeout(50);
  // move with one finger on empty space
  const e0 = await cpos(0); await page.mouse.move(cv[0] + 12, cv[1] + cv[3] - 12); await page.mouse.down(); await page.mouse.move(cv[0] + 12 + 40, cv[1] + cv[3] - 12 - 30, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(60);
  const e1 = await cpos(0);
  ok(Math.abs((e1[0] - e0[0]) - 40) < 6 && Math.abs((e1[1] - e0[1]) + 30) < 6, 'dragging empty space moves the picture (' + (e1[0] - e0[0]).toFixed(0) + ', ' + (e1[1] - e0[1]).toFixed(0) + ')');
  // two fingers: pinch to zoom
  const cdp = await ctx.newCDPSession(page); await page.click('#skZf'); await page.waitForTimeout(60);
  const p0 = [await cpos(0), await cpos(1)], mx = cv[0] + cv[2] / 2, my = cv[1] + cv[3] / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mx - 40, y: my, id: 1 }, { x: mx + 40, y: my, id: 2 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mx - 40 - i * 10, y: my, id: 1 }, { x: mx + 40 + i * 10, y: my, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(80);
  const p1 = [await cpos(0), await cpos(1)];
  ok(gd(p1[0], p1[1]) > 1.5 * gd(p0[0], p0[1]), 'pinching with two fingers zooms (' + gd(p0[0], p0[1]).toFixed(0) + ' to ' + gd(p1[0], p1[1]).toFixed(0) + ' px)');
  ok(await nPts() === 8, 'a pinch does not add or remove corners');
  await page.click('#skZf'); await page.waitForTimeout(60);
  const g2 = [await cpos(0), await cpos(1)];
  ok(gd(g2[0], g0[0]) < 3 && gd(g2[1], g0[1]) < 3, 'the Fit button brings the whole drawing back');
  ok(JSON.stringify((await sk()).pts) === stored0, 'zooming and moving did not change the drawing');
  // insert a corner on a side (Move, after closing) and delete it again
  await mode('move'); const c0p = await cpos(0), c1p = await cpos(1);
  await page.mouse.click((c0p[0] + c1p[0]) / 2, (c0p[1] + c1p[1]) / 2); await page.waitForTimeout(40); ok(await nPts() === 9, 'tapping a side in Move adds a corner there');
  ok(await page.$('#skDel') !== null, 'the new corner is selected and can be deleted');
  await page.click('#skDel'); await page.waitForTimeout(60);
  let n = await nPts();
  ok(n === 8, 'Delete this corner brings the plot back to 8 corners (' + n + ')');
  // delete refuses to go below 3 corners is covered in test 2

  // ---- type the 8 side lengths with Next
  await mode('len');
  for (let i = 0; i < 8; i++) {
    const lab = await page.innerText('#skPanel .skt');
    ok(new RegExp('Side ' + (i + 1) + ' ').test(lab), 'asks for side ' + (i + 1));
    await page.fill('#skIn', D(real[i], real[(i + 1) % 8]).toFixed(2));
    await page.click('#skNext'); await page.waitForTimeout(40);
  }
  ok(/of 8/.test(await page.innerText('#skStrip')) && /8 of 8/.test(await page.innerText('#skStrip')), 'status line shows 8 of 8 sides typed');
  await mode('res');
  ok(/Cross|cross/.test(await page.innerText('#skPanel')) && await page.$('#skFix') !== null, 'Result without crosses says what is missing and offers a button');
  // ---- crosses: tap two corners, then type the length right away
  await mode('cross');
  await tapC(0); await tapC(1); await page.waitForTimeout(100);
  ok((await sk()).cr.length === 0, 'corners already joined by a side do not make a cross');
  for (const c of crs) {
    await tapC(c[0]); await tapC(c[1]); await page.waitForTimeout(60);
    await page.fill('#skIn', D(real[c[0]], real[c[1]]).toFixed(2));
  }
  ok((await sk()).cr.length === 5, '5 crosses added (8 corners need 5)');
  await mode('res'); await page.waitForTimeout(100);
  const want = shoe(real) / CENT, got = await bigArea();
  ok(Math.abs(got - want) < 0.05, 'area from the sketch ' + got + ' cent = real ' + want.toFixed(2) + ' cent');
  ok(await page.$eval('#skPlace', e => !e.disabled), 'Put on the map is on');
  await page.screenshot({ path: TH.shot('sk_result.png') });
  // the result picture
  ok(await page.$('#skSvg polygon, #skSvg path') !== null, 'the result is drawn');

  // ---- a wrong length is noticed: make one side impossible (longer than the other sides together)
  await mode('len');
  const keep = await page.inputValue('#skIn'); await page.fill('#skIn', '400'); await mode('res'); await page.waitForTimeout(100);
  ok(await page.$('#skPlace') === null || await page.$eval('#skPlace', e => e.disabled) || /length|triangle|cannot|possible|check/i.test(await page.innerText('#skPanel')), 'an impossible length is not accepted silently');
  await mode('len'); await page.fill('#skIn', keep); await mode('res'); await page.waitForTimeout(100);
  ok(Math.abs(await bigArea() - want) < 0.05, 'fixing the length brings the right area back');

  // ---- put it on the map
  await page.click('#skPlace'); await page.waitForTimeout(700);
  const d = await draft();
  ok(d.corners.length === 8 && d.mode === 'corners' && d.tape && d.tape.sk && d.tape.cr && d.tape.cr.length === 5, 'plot placed on the map with its sketch and crosses');
  // metres between two corners on the WGS84 ellipsoid (the same model the app uses)
  const dist = (a, c) => { const k = Math.PI / 180, A = 6378137, e2 = 0.00669437999014, f = Math.sin(a.lat * k), w = 1 - e2 * f * f, M = A * (1 - e2) / Math.pow(w, 1.5), N = A / Math.sqrt(w); return Math.hypot((c.lon - a.lon) * k * N * Math.cos(a.lat * k), (c.lat - a.lat) * k * M); };
  let worst = 0; for (let i = 0; i < 8; i++) worst = Math.max(worst, Math.abs(dist(d.corners[i], d.corners[(i + 1) % 8]) - D(real[i], real[(i + 1) % 8])));
  ok(worst < 0.05, 'every side on the map equals the tape length (worst error ' + worst.toFixed(3) + ' m)');
  const top = drawn.reduce((m, p, i) => p[1] < drawn[m][1] ? i : m, 0), north = d.corners.reduce((m, c, i) => c.lat > d.corners[m].lat ? i : m, 0);
  ok(top === north, 'the top of the sketch is North: the top corner (' + (top + 1) + ') is the most northern (' + (north + 1) + ')');
  ok(await tab() === 'map', 'goes to the Map tab');

  // ---- reopen from Home: the sketch comes back with its lengths
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bSketch'); await page.click('#bSketch'); await page.waitForSelector('#skSvg');
  { const k = await sk(); ok(k.pts.length === 8 && k.closed && k.cr.length === 5 && Object.keys(k.L).length === 13, 'reopening restores corners, crosses and all 13 lengths'); }
  ok(await page.$('#skSvg circle') !== null || await page.$('#skSvg g') !== null, 'the sketch is drawn again');
  await page.click('#skX'); await page.waitForTimeout(200);
  ok(!(await page.$eval('#skv', e => e.offsetParent !== null)), 'the X closes the sketch');
  ok((await draft()).corners.length === 8, 'the plot is still on the map after closing');

  // ---- save it, it shows in "Your saved plots" on Home
  await page.click('nav button[data-tab=map]'); await page.waitForTimeout(200);
  await page.click('#mSave'); await page.waitForSelector('#sN'); await page.fill('#sN', 'Sketch plot'); await page.click('#sOk'); await page.waitForTimeout(300);
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('.hpl');
  ok(/Sketch plot/.test(await page.innerText('.hpl')), 'the saved plot is listed on Home');
  await page.click('.hpl'); await page.waitForTimeout(300);
  ok(await tab() === 'plots', 'tapping it opens the plot');
  const pl = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.plots.v1'))[0]);
  ok(pl.tape && pl.tape.sk && pl.tape.sk.pts.length === 8, 'the saved plot keeps its sketch');

  // ---- test 2: a four-corner plot drawn the other way round, one cross, start over from Home
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bSketch');
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('lm.draft.v1')); d.sk = null; d.corners = []; d.tape = null; localStorage.setItem('lm.draft.v1', JSON.stringify(d)); });
  await page.reload(); await page.waitForSelector('#bSketch');
  await page.click('#bSketch'); await page.waitForSelector('#skSvg');
  ok(await nPts() === 0, 'a new draft starts with a blank sketch');
  const quad = [[0, 0], [30, 0], [34, 20], [-4, 24]];   // real (m), counter-clockwise
  const qd = quad.map(p => [90 + p[0] * 6, 380 - p[1] * 9]);
  for (const i of [3, 2, 1, 0]) await tap(qd[i][0], qd[i][1]);   // drawn the other way round (the list is reversed: the sketch is mirrored)
  ok(await nPts() === 4, 'four corners drawn');
  await page.click('#skCl'); await page.waitForTimeout(80);
  // sketch corner k is quad[3-k]
  const Q = i => quad[3 - i];
  for (let i = 0; i < 4; i++) { await page.fill('#skIn', D(Q(i), Q((i + 1) % 4)).toFixed(2)); await page.click('#skNext'); await page.waitForTimeout(30); }
  await mode('cross');
  await page.click('#skSug'); await page.waitForTimeout(100);
  const k4 = await sk(); ok(k4.cr.length === 1, 'Suggest crosses adds the one cross a 4-corner plot needs');
  const ix = id => k4.pts.findIndex(p => p[2] === id), c0 = [ix(k4.cr[0][0]), ix(k4.cr[0][1])];
  await mode('len');
  await page.fill('#skIn', D(Q(c0[0]), Q(c0[1])).toFixed(2));
  await mode('res'); await page.waitForTimeout(100);
  const wq = shoe(quad) / CENT, gq = await bigArea();
  ok(Math.abs(gq - wq) < 0.02, 'drawn the other way round: area ' + gq + ' = real ' + wq.toFixed(2) + ' cent');
  await page.screenshot({ path: TH.shot('sk_quad.png') });
  // a triangle needs no crosses
  await page.click('#skMore'); await page.waitForSelector('#mNew'); await page.click('#mNew'); await page.waitForSelector('#sheet button.danger'); await page.click('#sheet button.danger'); await page.waitForTimeout(150);
  ok(await nPts() === 0, 'More > New sketch erases the drawing');
  const tri = [[0, 0], [40, 0], [10, 30]], td = tri.map(p => [60 + p[0] * 5, 350 - p[1] * 6]);
  for (const p of td) await tap(p[0], p[1]);
  await page.click('#skCl');
  for (let i = 0; i < 3; i++) { await page.fill('#skIn', D(tri[i], tri[(i + 1) % 3]).toFixed(2)); await page.click('#skNext'); await page.waitForTimeout(30); }
  await mode('res'); await page.waitForTimeout(100);
  ok(Math.abs(await bigArea() - shoe(tri) / CENT) < 0.02, 'a triangle works with only its 3 sides');
  // delete a corner below 3 is refused
  await mode('move'); await tapC(0); await page.waitForTimeout(80);
  if (await page.$('#skDel')) { await page.click('#skDel'); await page.waitForTimeout(80); }
  ok(await nPts() === 3, 'a plot cannot have fewer than 3 corners');

  // ---- small sides: corners that are very close on the paper need a zoom first
  await page.click('#skMore'); await page.waitForSelector('#mNew'); await page.click('#mNew'); await page.waitForSelector('#sheet button.danger'); await page.click('#sheet button.danger'); await page.waitForTimeout(150);
  for (const q of [[200, 120], [240, 150], [240, 400], [140, 395], [138, 190]]) await tap(q[0], q[1]);
  await tap(190, 170); await tap(196, 164);
  ok(await nPts() === 6, 'two corners a few pixels apart cannot be told apart: the second tap is ignored');
  const cv2 = await page.$eval('#skSvg', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const at = await cpos(5);
  await page.mouse.move(at[0], at[1]); await page.mouse.wheel(0, -700); await page.waitForTimeout(100);
  const at2 = await cpos(5);
  await page.mouse.click(at2[0] + 45, at2[1] + 12); await page.waitForTimeout(40); await page.mouse.click(at2[0] + 80, at2[1] + 26); await page.waitForTimeout(40);
  const k8 = await sk();
  ok(k8.pts.length === 8, 'after zooming in the two close corners can be placed (' + k8.pts.length + ' corners)');
  const wd = Math.hypot(k8.pts[6][0] - k8.pts[5][0], k8.pts[6][1] - k8.pts[5][1]);
  ok(wd < 28, 'they are closer on the drawing than the old tap limit (' + wd.toFixed(0) + ' units)');
  await page.screenshot({ path: TH.shot('sk_small.png') });
  await page.click('#skX');

  ok(errs.length === 0, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
