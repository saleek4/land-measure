const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8787);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 11.05, longitude: 76.07, accuracy: 4 }, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8787/'); await page.waitForTimeout(400);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const key = async () => JSON.stringify((await draft()).corners.map(c => [c.lat, c.lon]));
  const n = async () => (await draft()).corners.length;
  const vis = s => page.isVisible(s);
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(1200);
  const box = await (await page.$('#mapc')).boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2 - 60;
  for (const [dx, dy] of [[-100, -70], [100, -70], [100, 70], [-100, 70]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(120); }
  ok(await n() === 4 && !(await vis('#mRedo')), 'four points drawn, no Redo button yet');

  // ---- map: undo then redo
  const k4 = await key();
  await page.click('#mUndo'); await page.waitForTimeout(250);
  ok(await n() === 3 && await vis('#mRedo'), 'Undo removes a point and a Redo button appears');
  await page.screenshot({ path: TH.shot('rd1_toolbar.png') });
  const fits = await page.$$eval('#mtb .mtb button', bs => bs.every(x => x.scrollWidth <= x.clientWidth + 1 && x.getBoundingClientRect().right <= 390));
  ok(fits, 'toolbar with Redo still fits the phone width');
  await page.click('#mRedo'); await page.waitForTimeout(250);
  ok(await n() === 4 && (await key()) === k4 && !(await vis('#mRedo')), 'Redo puts the same point back; Redo button goes away');
  await page.click('#mUndo'); await page.click('#mUndo'); await page.waitForTimeout(250);
  ok(await n() === 2, 'two undos');
  await page.click('#mRedo'); await page.click('#mRedo'); await page.waitForTimeout(250);
  ok(await n() === 4 && (await key()) === k4, 'two redos bring both points back in order');
  await page.click('#mUndo'); await page.waitForTimeout(250);
  await page.mouse.click(cx + 20, cy + 120); await page.waitForTimeout(250);
  ok(await n() === 4 && !(await vis('#mRedo')), 'a new point after Undo ends the Redo');
  await page.click('#mUndo'); await page.click('#mRedo'); await page.waitForTimeout(250);
  ok(await n() === 4, 'undo and redo again still work');

  // ---- edit mode: undo edit then redo
  await page.click('#mUndo'); await page.waitForTimeout(150); // back to 3, then tap to make a clean rectangle
  await page.mouse.click(cx - 100, cy + 70); await page.waitForTimeout(250); // fourth point again (rectangle)
  ok(await n() === 4, 'rectangle again');
  await page.click('#mEdit'); await page.waitForTimeout(200);
  await page.mouse.click(cx, cy - 70); await page.waitForTimeout(400);
  ok(/Side 1/.test(await page.innerText('#mbot')), 'side editor open');
  const kEdit0 = await key();
  await page.click('#eSt button[data-s="2"]'); await page.click('[data-l="1"]'); await page.waitForTimeout(250);
  const kEdit1 = await key(); ok(kEdit1 !== kEdit0, 'the edit changed the side');
  ok(!(await vis('#eRe')), 'no Redo before any Undo');
  await page.click('#eUn'); await page.waitForTimeout(250);
  ok((await key()) === kEdit0 && await vis('#eRe'), 'Undo edit restores the side and shows Redo');
  await page.screenshot({ path: TH.shot('rd2_edit.png') });
  await page.click('#eRe'); await page.waitForTimeout(250);
  ok((await key()) === kEdit1, 'Redo brings the edit back');
  await page.click('#eUn'); await page.waitForTimeout(250);
  ok((await key()) === kEdit0, 'Undo edit works again after a Redo');
  await page.click('#eRe'); await page.waitForTimeout(250);
  ok((await key()) === kEdit1, 'and Redo once more');
  // a point edit: card with Note / Delete / Undo / Redo must still fit
  await page.mouse.click(cx - 100, cy - 70); await page.waitForTimeout(400);
  await page.click('#eUn').catch(() => {}); await page.waitForTimeout(200);
  if (await vis('#eRe')) { const f2 = await page.$$eval('#mbot .mcard .row button', bs => bs.every(x => x.getBoundingClientRect().right <= 390 && x.scrollWidth <= x.clientWidth + 1)); ok(f2, 'point card buttons (Note, Delete, Undo, Redo) fit the phone width'); await page.screenshot({ path: TH.shot('rd3_pointcard.png') }); }
  await page.click('#eDone'); await page.waitForTimeout(200);

  // ---- drawn outline: undo removes the whole drawing, redo brings it back
  await page.evaluate(() => { localStorage.setItem('lm.draft.v1', JSON.stringify({ name: '', place: '', notes: '', mode: 'corners', holes: [], rec: null, tape: null, corners: [] })); }); await page.reload(); await page.waitForTimeout(500);
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(1000);
  await page.click('#mDraw'); await page.waitForTimeout(200);
  const W = 200, H = 150, x0 = cx - W / 2, y0 = cy - H / 2 - 20, path = [];
  const edge = (ax, ay, bx, by) => { for (let t = 0; t < 1; t += 0.04) path.push([ax + (bx - ax) * t + Math.sin(t * 30) * 1.2, ay + (by - ay) * t + Math.cos(t * 25) * 1.2]) };
  edge(x0, y0, x0 + W, y0); edge(x0 + W, y0, x0 + W, y0 + H); edge(x0 + W, y0 + H, x0, y0 + H); edge(x0, y0 + H, x0, y0 + 4);
  await page.mouse.move(path[0][0], path[0][1]); await page.mouse.down(); for (const [x, y] of path) await page.mouse.move(x, y, { steps: 1 }); await page.mouse.up(); await page.waitForTimeout(500);
  const kDraw = await key(), nDraw = await n(); ok(nDraw >= 4, 'outline drawn with a finger: ' + nDraw + ' corners');
  await page.click('#mUndo'); await page.waitForTimeout(300);
  ok(await n() === 0 && await vis('#mRedo'), 'Undo removes the whole drawing and offers Redo');
  await page.click('#mRedo'); await page.waitForTimeout(300);
  ok((await key()) === kDraw, 'Redo brings the whole drawing back');
  await page.click('#mUndo'); await page.waitForTimeout(300);
  ok(await n() === 0, 'and Undo takes the whole drawing away again (not just one point)');

  // ---- fit: undo then redo
  await page.click('#mLay'); await page.click('[data-add=tap]'); await page.click('#mLay'); await page.waitForTimeout(300);
  for (const [dx, dy] of [[-90, -70], [0, -90], [90, -70], [100, 30], [10, 90], [-95, 40]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(120); }
  const cent = async () => parseFloat(((await page.innerText('#mpanel')).match(/([\d,.]+) cent/) || [0, 0])[1].toString().replace(/,/g, ''));
  const a0 = await cent(), k6 = await key(); ok(await n() === 6, 'six points for the fit test');
  await page.click('#mTools'); await page.click('#tFit'); await page.waitForSelector('#fiV');
  await page.selectOption('#fiM', 'move'); await page.fill('#fiV', String((a0 * 1.2).toFixed(2))); await page.waitForTimeout(250);
  await page.click('#fiOk'); await page.waitForTimeout(500);
  const aMoved = await cent(), kMoved = await key();
  ok(Math.abs(aMoved - a0 * 1.2) / (a0 * 1.2) < 0.003, 'fit moved a corner to the wanted area');
  await page.click('#mUndo'); await page.waitForTimeout(300);
  ok((await key()) === k6 && await vis('#mRedo'), 'Undo puts the corner back, Redo is offered');
  await page.click('#mRedo'); await page.waitForTimeout(300);
  ok((await key()) === kMoved && Math.abs((await cent()) - aMoved) < 0.01, 'Redo moves the corner to the wanted area again');
  await page.click('#mUndo'); await page.waitForTimeout(300);
  ok((await key()) === k6, 'Undo after Redo puts the corner back (it does not remove a point)');

  // ---- excluded area: hole undo / redo
  await page.click('#mTools'); await page.click('#tHole'); await page.waitForTimeout(300);
  for (const [dx, dy] of [[-20, -10], [20, -10], [20, 20]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(120); }
  const hn = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1')).holes.map(h => h.corners.length).join(','));
  ok((await hn()) === '3', 'three corners marked for the excluded area');
  await page.click('#hUndo'); await page.waitForTimeout(200);
  ok((await hn()) === '2' && await vis('#hRedo'), 'hole Undo removes one, Redo shows');
  await page.click('#hRedo'); await page.waitForTimeout(200);
  ok((await hn()) === '3', 'hole Redo puts it back');
  await page.click('#hDone'); await page.waitForTimeout(200);

  // ---- Measure tab: Undo last / Redo
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('lm.draft.v1')); d.holes = []; localStorage.setItem('lm.draft.v1', JSON.stringify(d)); }); await page.reload(); await page.waitForTimeout(500);
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bUndo');
  const m6 = await key();
  ok(!(await vis('#bRedo')), 'no Redo on the Measure tab at first');
  await page.click('#bUndo'); await page.waitForTimeout(250);
  ok(await n() === 5 && await vis('#bRedo'), 'Undo last removes the last corner and offers Redo');
  await page.click('#bRedo'); await page.waitForTimeout(250);
  ok((await key()) === m6 && !(await vis('#bRedo')), 'Redo puts the last corner back unchanged');
  await page.click('#bUndo'); await page.click('#bUndo'); await page.waitForTimeout(250);
  await page.click('#bRedo'); await page.click('#bRedo'); await page.waitForTimeout(250);
  ok((await key()) === m6, 'two undos and two redos restore every corner in order');
  ok(errs.length === 0, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL exception: ' + e.message.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; srv.close(); });
