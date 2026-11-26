const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8779);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 11.05, longitude: 76.07, accuracy: 4 }, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8779/'); await page.waitForTimeout(400);
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(1200);
  const box = await (await page.$('#mapc')).boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // an irregular 5-corner plot by taps
  // six points: the first, then five more (the last side to point 1 is not drawn)
  for (const [dx, dy] of [[-90, -70], [0, -90], [90, -70], [100, 30], [10, 90], [-95, 40]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(120); }
  const cent = async () => parseFloat(((await page.innerText('#mpanel')).match(/([\d,.]+) cent/) || [0, 0])[1].toString().replace(/,/g, ''));
  const npts = async () => +((await page.innerText('#mpanel')).match(/(\d+) points/) || [0, 0])[1];
  const a0 = await cent(); ok(a0 > 5 && (await npts()) === 6, 'plot with 6 points: ' + a0 + ' cent');
  await page.click('#mTools'); ok(await page.isVisible('#tFit'), 'Tools has the fit option');
  await page.click('#tFit'); await page.waitForSelector('#fiV');
  ok((await page.inputValue('#fiM')) === 'add', 'default: add a new point on the last side');
  // 1) bigger target: bulges outward
  await page.fill('#fiV', String((a0 * 1.1).toFixed(2))); await page.selectOption('#fiU', 'cent'); await page.waitForTimeout(250);
  let r = await page.innerText('#fiR'); console.log('ADD+:', r.replace(/\n/g, ' | '));
  ok(/point 7/.test(r) && /outward/.test(r), 'bigger area: new point 7 goes outward');
  await page.screenshot({ path: TH.shot('fit1.png') });
  await page.click('#fiOk'); await page.waitForTimeout(500);
  let a1 = await cent(); ok((await npts()) === 7 && Math.abs(a1 - a0 * 1.1) / (a0 * 1.1) < 0.003, 'point added, area = wanted: ' + a1 + ' vs ' + (a0 * 1.1).toFixed(2));
  await page.screenshot({ path: TH.shot('fit2.png') });
  await page.click('#mUndo'); await page.waitForTimeout(300);
  ok((await npts()) === 6 && Math.abs((await cent()) - a0) / a0 < 0.001, 'Undo removes the added point');
  // 2) smaller target: pushed inward
  await page.click('#mTools'); await page.click('#tFit'); await page.waitForSelector('#fiV');
  await page.fill('#fiV', String((a0 * 0.92).toFixed(2))); await page.selectOption('#fiF', '0.75'); await page.waitForTimeout(250);
  r = await page.innerText('#fiR'); console.log('ADD-:', r.replace(/\n/g, ' | '));
  ok(/inward/.test(r), 'smaller area: new point goes inward');
  await page.click('#fiOk'); await page.waitForTimeout(400);
  let a2 = await cent(); ok(Math.abs(a2 - a0 * 0.92) / (a0 * 0.92) < 0.003, 'inward point hits the wanted area: ' + a2);
  await page.click('#mUndo'); await page.waitForTimeout(300);
  // 3) move-a-corner mode
  await page.click('#mTools'); await page.click('#tFit'); await page.waitForSelector('#fiV');
  await page.selectOption('#fiM', 'move'); await page.waitForTimeout(100);
  ok((await page.inputValue('#fiI')) === '5', 'move mode: last corner preselected');
  await page.fill('#fiV', String((a0 * 1.2).toFixed(2))); await page.waitForTimeout(250);
  r = await page.innerText('#fiR'); console.log('MOVE:', r.replace(/\n/g, ' | '));
  ok(/Point 6/.test(r) && /further out|closer in/.test(r), 'move mode result');
  await page.click('#fiOk'); await page.waitForTimeout(500);
  let a3 = await cent(); ok((await npts()) === 6 && Math.abs(a3 - a0 * 1.2) / (a0 * 1.2) < 0.003, 'moved corner hits wanted area: ' + a3);
  await page.click('#mUndo'); await page.waitForTimeout(300);
  ok(Math.abs((await cent()) - a0) / a0 < 0.001, 'Undo puts the corner back');
  // impossible target
  await page.click('#mTools'); await page.click('#tFit'); await page.waitForSelector('#fiV'); await page.fill('#fiV', '0.01'); await page.waitForTimeout(250);
  r = await page.innerText('#fiR'); ok(/cross|too small/.test(r) || (await page.$eval('#fiOk', e => e.disabled)), 'a tiny target is refused or warned: ' + r.slice(0, 90).replace(/\n/g, ' '));
  await page.click('#fiNo'); await page.waitForTimeout(200);
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
