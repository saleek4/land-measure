// Sketch: when typed lengths cannot close up, the message names the three lengths, the button opens them, the pictures marks them.
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8797);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.settings.v1')) localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } catch (e) {} });
  const page = await ctx.newPage(); page.setDefaultTimeout(4000); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8797/'); await page.waitForTimeout(400);
  const scr = async (x, y) => { const r = await page.$eval('#skSvg', e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top }; }); return { x: r.l + x, y: r.t + y }; };
  const tap = async (x, y) => { const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(40); };
  const cpos = async (i) => page.$eval('#skSvg circle[data-c="' + i + '"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const tapC = async (i) => { const p = await cpos(i); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(40); };
  const mode = async (m) => { await page.click('#skModes [data-sm="' + m + '"]'); await page.waitForTimeout(80); };
  const text = (s) => page.innerText(s);

  await TH.startWay(page, 'sk'); await page.waitForSelector('#skSvg');
  for (const p of [[150, 80], [210, 80], [210, 330], [150, 330]]) await tap(p[0], p[1]);
  await page.click('#skCl'); await page.waitForTimeout(100);
  // four sides of 10 m, then a cross of 40 m: a square cannot have a diagonal of 40 m
  await mode('len');
  for (let i = 0; i < 4; i++) { await page.fill('#skIn', '10'); await page.click('#skNext'); await page.waitForTimeout(40); }
  await mode('cross'); await tapC(0); await tapC(2); await page.fill('#skIn', '40'); await page.waitForTimeout(80);
  ok(/lengths do not fit/.test(await text('#skStrip')) && /Corners [\d, ]+:/.test(await text('#skStrip')), 'the top line warns while typing: ' + (await text('#skStrip')));
  await mode('res'); await page.waitForTimeout(100);
  const pt = await text('#skPanel');
  ok(/Cross 1 → 3 is 40 m, but .*\(10\).* and .*\(10\).* add up to only 20 m/.test(pt), 'the message names the three lengths with numbers: ' + pt.slice(0, 160));
  ok(await text('#skFix') === 'Check these lengths', 'the button says "Check these lengths" (not "Type the missing length")');
  ok(await page.$('#skPanel .skbig') === null && await page.$('#skPlace') === null, 'no area and no Put on the map for lengths that cannot close');
  await page.screenshot({ path: TH.shot('sk_chk_result.png') });
  await page.click('#skFix'); await page.waitForTimeout(120);
  await page.screenshot({ path: TH.shot('sk_chk_fix.png') });
  ok(await page.$eval('#skModes [data-sm="len"]', e => e.classList.contains('on')), 'the button opens the lengths');
  ok(await page.inputValue('#skIn') === '40', 'it selects one of the three (the cross), ready to retype');
  ok((await page.$$('#skSvg rect[stroke-dasharray="3 2"]')).length === 2, 'the other two lengths are red in the picture');
  await page.fill('#skIn', '14'); await page.waitForTimeout(80);
  ok(!/lengths do not fit/.test(await text('#skStrip')), 'the warning goes away when the length is fixed');
  await mode('res'); await page.waitForTimeout(100);
  const a = parseFloat((await text('#skPanel .skbig')).replace(/[^\d.]/g, ''));
  ok(a > 1.5 && a < 2.6, 'the area comes back: ' + a + ' cent (a 10 m square is 2.47 cent)');
  ok((await page.$$('#skSvg rect[stroke-dasharray="3 2"]')).length === 0, 'nothing is red any more');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exitCode = 1; srv.close(); process.exit(1); });
