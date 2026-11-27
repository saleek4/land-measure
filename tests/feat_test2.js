const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8773);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} try { if (!localStorage.getItem('lm.map.v1')) { localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 18, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap', loupe: true })); localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8773/');
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const panel = () => page.innerText('#mpanel');
  const dist = (a, b) => { const k = 111320; return Math.hypot((b.lon - a.lon) * k * Math.cos(11.05 * Math.PI / 180), (b.lat - a.lat) * 110574); };

  // ---- tape lengths from the Measure tab
  await TH.startWay(page, 'tape'); await page.waitForSelector('#tN');
  await page.screenshot({ path: TH.shot('g1_tape_empty.png') });
  ok(await page.isDisabled('#tPlace'), 'Put on the map is disabled until all lengths are typed');
  const sides = [40, 25, 40, 25];
  for (let i = 0; i < 4; i++) await page.fill('input[data-s="' + i + '"]', String(sides[i]));
  await page.waitForTimeout(100);
  ok(/Enter the diagonal|diagonal/i.test(await page.innerText('#tRes')), 'asks for the diagonal: ' + (await page.innerText('#tRes')).slice(0, 60));
  await page.fill('input[data-d="0-2"]', String(Math.hypot(40, 25).toFixed(3))); await page.waitForTimeout(250);
  let rt = await page.innerText('#tRes'); console.log('tape result:', rt.replace(/\n/g, ' | ').slice(0, 160));
  ok(/24\.71 cent/.test(rt) && /1,000\.0 sq m/.test(rt), 'rectangle 40 x 25 = 24.71 cent');
  await page.screenshot({ path: TH.shot('g2_tape_result.png') });
  // impossible lengths
  await page.fill('input[data-s="1"]', '5'); await page.waitForTimeout(200);
  ok(/do not close up|cross/.test(await page.innerText('#tRes')), 'impossible lengths are explained: ' + (await page.innerText('#tRes')).slice(0, 90));
  await page.fill('input[data-s="1"]', '25'); await page.waitForTimeout(100);
  // feet
  await page.selectOption('#tU', 'ft'); await page.waitForTimeout(200);
  ok(/sq m/.test(await page.innerText('#tRes')) && !/24\.71 cent/.test(await page.innerText('#tRes')), 'feet switch changes the result');
  await page.selectOption('#tU', 'm'); await page.fill('#tB', '90'); await page.waitForTimeout(100);
  await page.click('#tPlace'); await page.waitForSelector('#mapc'); await page.waitForTimeout(400);
  let d = await draft();
  ok(d.corners.length === 4 && d.corners.every(c => c.src === 'tape') && d.tape && d.tape.sides.length === 4, 'four tape corners placed on the map tab');
  ok(Math.abs(dist(d.corners[0], d.corners[1]) - 40) < 0.05 && Math.abs(dist(d.corners[1], d.corners[2]) - 25) < 0.05, 'sides are 40 m and 25 m on the ground: ' + dist(d.corners[0], d.corners[1]).toFixed(2) + ', ' + dist(d.corners[1], d.corners[2]).toFixed(2));
  const brg = Math.atan2((d.corners[1].lon - d.corners[0].lon) * Math.cos(11.05 * Math.PI / 180), d.corners[1].lat - d.corners[0].lat) * 180 / Math.PI;
  ok(Math.abs(brg - 90) < 0.1, 'side 1 points east (bearing ' + brg.toFixed(2) + ')');
  let t = await panel(); console.log('panel:', t.replace(/\n/g, ' | '));
  ok(/24\.7\d cent/.test(t) && /Tape lengths/i.test(t), 'panel shows 24.7 cent from tape lengths');
  await page.screenshot({ path: TH.shot('g3_tape_on_map.png') });

  // ---- move / rotate
  await page.click('#mTools'); await page.waitForSelector('#tMove'); await page.click('#tMove'); await page.waitForSelector('#mvDone');
  const R = await page.evaluate(() => { const r = document.querySelector('#mapc').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const before = (await draft()).corners;
  await page.mouse.move(R.x + 80, R.y + 250); await page.mouse.down(); await page.mouse.move(R.x + 130, R.y + 290, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150);
  let after = (await draft()).corners;
  const shift = dist(before[0], after[0]);
  ok(shift > 5 && Math.abs(dist(after[0], after[1]) - 40) < 0.05 && Math.abs(dist(before[0], before[2]) - dist(after[0], after[2])) < 0.05, 'dragging moves the whole plot (' + shift.toFixed(1) + ' m) without changing its shape');
  await page.click('#mvR'); await page.click('#mvR'); await page.waitForTimeout(150);
  const rot = (await draft()).corners;
  const b2 = Math.atan2((rot[1].lon - rot[0].lon) * Math.cos(11.05 * Math.PI / 180), rot[1].lat - rot[0].lat) * 180 / Math.PI;
  ok(Math.abs(b2 - 100) < 0.2 && Math.abs(dist(rot[0], rot[1]) - 40) < 0.05, 'two 5 degree turns: side 1 now points ' + b2.toFixed(2) + ' deg');
  await page.screenshot({ path: TH.shot('g4_move.png') });
  await page.click('#mvDone'); await page.waitForTimeout(100);
  t = await panel(); ok(/24\.7\d cent/.test(t), 'area unchanged after move and turn');

  // ---- GPS corners cannot be moved
  d = await draft(); d.corners[0].src = undefined; await page.evaluate(x => localStorage.setItem('lm.draft.v1', JSON.stringify(x)), d); await page.reload(); await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mTools');
  await page.click('#mTools'); await page.click('#tMove'); await page.waitForTimeout(150);
  ok(/GPS points would lose/.test(await page.innerText('#toast')), 'move is refused when a point comes from GPS');
  await page.screenshot({ path: TH.shot('g5_refused.png') }); await page.click('#tClose');

  // ---- measure tab: result with tape + record + save + plots
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bRec');
  await page.click('#bRec'); await page.waitForSelector('#rcV'); await page.fill('#rcV', '25'); await page.selectOption('#rcU', 'cent'); await page.click('#rcOk'); await page.waitForTimeout(150);
  const mt = await page.innerText('#app'); console.log('measure text:', mt.replace(/\n/g, ' | ').slice(0, 500));
  ok(/Record vs measured/.test(mt), 'record compare shows in the Measure tab');
  await page.screenshot({ path: TH.shot('g6_measure.png'), fullPage: true });

  // ---- backup: photos not exported, holes kept
  console.log('JS ERRORS:', JSON.stringify(errs)); await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
