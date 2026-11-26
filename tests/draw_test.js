const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8778);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 11.05, longitude: 76.07, accuracy: 4 }, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8778/'); await page.waitForTimeout(400);
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(1200);
  const box = await (await page.$('#mapc')).boundingBox();
  ok(await page.isVisible('#mDraw'), 'Draw button in the map toolbar');
  // fit check: toolbar buttons fit in one row
  const tb = await page.evaluate(() => { const e = document.querySelector('#mtb .mtb'); return e ? { sw: e.scrollWidth, cw: e.clientWidth } : null; });
  console.log('toolbar', JSON.stringify(tb)); if (tb) ok(tb.sw <= tb.cw + 1, 'toolbar buttons fit the width');
  await page.click('#mDraw'); await page.waitForTimeout(200);
  ok(/Draw the outline/.test(await page.innerText('#mpanel')), 'panel tells how to draw');
  // a tap in draw mode adds nothing
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy); await page.waitForTimeout(200);
  ok(/Draw the outline/.test(await page.innerText('#mpanel')), 'a tap in draw mode adds no point');
  // draw a wobbly rectangle 200 x 150 px, many tiny moves
  const W = 200, H = 150, x0 = cx - W / 2, y0 = cy - H / 2 - 20;
  const path = []; const edge = (ax, ay, bx, by) => { for (let t = 0; t < 1; t += 0.04) path.push([ax + (bx - ax) * t + Math.sin(t * 30) * 1.2, ay + (by - ay) * t + Math.cos(t * 25) * 1.2]) };
  edge(x0, y0, x0 + W, y0); edge(x0 + W, y0, x0 + W, y0 + H); edge(x0 + W, y0 + H, x0, y0 + H); edge(x0, y0 + H, x0, y0 + 4);
  await page.mouse.move(path[0][0], path[0][1]); await page.mouse.down();
  for (const [x, y] of path) await page.mouse.move(x, y, { steps: 1 });
  await page.screenshot({ path: TH.shot('draw1_stroke.png') });
  await page.mouse.up(); await page.waitForTimeout(400);
  await page.screenshot({ path: TH.shot('draw2_done.png') });
  const panel = await page.innerText('#mpanel'); console.log('PANEL:', panel.replace(/\n/g, ' | '));
  const pts = +(panel.match(/(\d+) points/) || [0, 0])[1]; ok(pts >= 4 && pts <= 12, 'wobbly rectangle simplified to a few corners: ' + pts);
  // area vs pixels: scale bar px per label
  const sc = await page.evaluate(() => { const e = document.querySelector('#msc'); return { w: e.firstChild.getBoundingClientRect().width, t: e.lastChild.textContent } });
  const metres = parseFloat(sc.t), mpp = metres / sc.w, expect = W * H * mpp * mpp;
  const m2 = +(panel.match(/([\d,.]+)\s*sq m/) || [0, 0])[1].toString().replace(/,/g, '');
  const cent = +(panel.match(/([\d.]+) cent/) || [0, 0])[1]; const gotM2 = cent * 40.4686;
  console.log('scale', sc.w, sc.t, 'mpp', mpp.toFixed(3), 'expected m2', expect.toFixed(0), 'got m2', gotM2.toFixed(0));
  ok(Math.abs(gotM2 - expect) / expect < 0.08, 'drawn area close to the sketched rectangle (' + gotM2.toFixed(0) + ' vs ' + expect.toFixed(0) + ' sq m)');
  // undo removes whole drawing
  await page.click('#mUndo'); await page.waitForTimeout(200);
  ok(/Draw the outline/.test(await page.innerText('#mpanel')), 'Undo removes the whole drawing');
  // draw again, then a second drawing asks before replacing
  await page.mouse.move(path[0][0], path[0][1]); await page.mouse.down(); for (const [x, y] of path) await page.mouse.move(x, y); await page.mouse.up(); await page.waitForTimeout(300);
  await page.mouse.move(path[0][0] + 60, path[0][1] + 60); await page.mouse.down(); for (const [x, y] of path) await page.mouse.move(x + 60, y + 60); await page.mouse.up(); await page.waitForTimeout(400);
  ok(await page.isVisible('#sheet button, #ov button'), 'second drawing asks before replacing');
  await page.screenshot({ path: TH.shot('draw3_ask.png') });
  await page.getByText('Keep them').click(); await page.waitForTimeout(200);
  ok(/points/.test(await page.innerText('#mpanel')), 'keep them keeps the first drawing');
  // too short a scribble
  await page.click('#mUndo'); await page.waitForTimeout(150);
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 20, cy + 5); await page.mouse.up(); await page.waitForTimeout(200);
  ok(/Draw the outline/.test(await page.innerText('#mpanel')), 'tiny scribble adds nothing');
  // switching back to tap mode: taps add points, drag pans
  await page.click('#mDraw'); await page.waitForTimeout(150);
  await page.mouse.click(cx, cy); await page.waitForTimeout(200);
  ok(/1 point/.test(await page.innerText('#mpanel')), 'tap mode still adds points');
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
