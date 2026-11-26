const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs'), { execFileSync } = require('child_process');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8774);
const tile = fs.readFileSync(TH.fixture('tile.png')), na = fs.readFileSync(TH.fixture('na_tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const grayShare = (png) => JSON.parse(execFileSync('python3', ['-c', `
import sys,json
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); W,H=im.size
box=(40,500,560,1000); c=im.crop(box); px=list(c.getdata()); n=len(px)
g=sum(1 for r,gg,b in px if abs(r-gg)<7 and abs(gg-b)<7 and 170<r<245)
print(json.dumps(g/n))`, TH.shot(png)]).toString());
async function scenario(name, cors, startNat) {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const zs = {};
  await ctx.route('**/server.arcgisonline.com/**', r => {
    const m = r.request().url().match(/\/tile\/(\d+)\/(\d+)\/(\d+)/); const z = m ? +m[1] : -1; zs[z] = (zs[z] || 0) + 1;
    const headers = { 'access-control-allow-origin': cors ? '*' : 'https://example.invalid' };
    r.fulfill({ status: 200, contentType: 'image/png', body: z >= 19 ? na : tile, headers });
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} try { if (!localStorage.getItem('lm.map.v1')) localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 19.4, fill: 0.12, labels: false, sides: true, saved: true, add: 'tap', loupe: true })); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8774/'); await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(1500);
  await page.screenshot({ path: TH.shot('na_' + name + '.png') });
  const g = grayShare('na_' + name + '.png'); const txt = await page.innerText('#mattr');
  console.log(name, 'gray share', g.toFixed(3), 'requests by z', JSON.stringify(zs), '| attribution:', txt.replace(/\n/g, ' ').slice(0, 80));
  await b.close(); return { g, zs, txt, errs, page: null };
}
(async () => {
  const a = await scenario('cors', true);
  ok(a.g < 0.05, 'with CORS: grey "not available" tiles are replaced by lower zoom imagery (grey share ' + a.g.toFixed(3) + ')');
  ok(/Sharper pictures are not available/.test(a.txt), 'with CORS: a note says sharper pictures are not available');
  ok((a.zs[18] || 0) > 0, 'with CORS: level 18 tiles were requested as fallback');
  const n = await scenario('nocors', false);
  ok(n.g > 0.5 && n.zs[18] === undefined, 'without CORS the grey tiles cannot be detected (grey share ' + n.g.toFixed(3) + ') but the map still shows');
  // manual limit when detection is not possible
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }); const zs = {};
  await ctx.route('**/server.arcgisonline.com/**', r => { const m = r.request().url().match(/\/tile\/(\d+)\//); const z = m ? +m[1] : -1; zs[z] = (zs[z] || 0) + 1; r.fulfill({ status: 200, contentType: 'image/png', body: z >= 19 ? na : tile }); });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('lm.map.v1')) localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 19.4, fill: 0.12, labels: false, sides: true, saved: true, add: 'tap', loupe: true })); } catch (e) {} });
  const page = await ctx.newPage(); await page.goto('http://localhost:8774/'); await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(800);
  await page.click('#mLay'); await page.selectOption('#mNat', '18'); await page.click('#mLay'); await page.waitForTimeout(1200);
  await page.screenshot({ path: TH.shot('na_manual.png') });
  const g = grayShare('na_manual.png'); ok(g < 0.05, 'manual limit 18 removes the grey tiles (grey share ' + g.toFixed(3) + ')');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.map.v1'))); ok(st.nat === 18, 'limit is remembered');
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
