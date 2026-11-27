const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8776);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 11.05, longitude: 76.07, accuracy: 4 }, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} try { localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8776/'); await page.waitForTimeout(600);
  await TH.startWay(page, 'gps'); await page.waitForTimeout(300);
  ok(await page.isVisible('#mmc'), 'mini map card is shown while measuring with GPS');
  let info = await page.innerText('#mmInfo'); ok(/You are here/.test(info), 'GPS already on at start: "You are here" shown: ' + info.replace(/\n/g, ' ').slice(0, 70));
  ok(!(await page.isVisible('#mmGps')), 'show-me button hidden while GPS works');
  await page.screenshot({ path: TH.shot('mini2_gps.png') });
  const lat0 = 11.05, lon0 = 76.07, mLat = 110574, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  const corners = [[0, 0], [60, 0], [60, 50], [0, 50]];
  for (let i = 0; i < corners.length; i++) {
    const [x, y] = corners[i];
    await ctx.setGeolocation({ latitude: lat0 + y / mLat, longitude: lon0 + x / mLon, accuracy: 3 }); await page.waitForTimeout(300);
    await page.click('#bCap'); await page.waitForTimeout(500);
    for (let k = 0; k < 3; k++) { await ctx.setGeolocation({ latitude: lat0 + y / mLat + (k - 1) * 1e-6, longitude: lon0 + x / mLon, accuracy: 3 + k }); await page.waitForTimeout(250); }
    await page.waitForSelector('#bCap', { timeout: 6000 });
    if (i === 0) { await page.screenshot({ path: TH.shot('mini3_one.png') }); }
  }
  await ctx.setGeolocation({ latitude: lat0 + 25 / mLat, longitude: lon0 + 30 / mLon, accuracy: 3 }); await page.waitForTimeout(1500);
  info = await page.innerText('#mmInfo'); console.log('INFO:', info.replace(/\n/g, ' '));
  ok(/inside the marked plot/.test(info), 'standing inside the plot says inside');
  ok(/nearest corner/.test(info), 'nearest corner shown');
  await page.screenshot({ path: TH.shot('mini4_inside.png') });
  await ctx.setGeolocation({ latitude: lat0 - 40 / mLat, longitude: lon0 + 30 / mLon, accuracy: 3 }); await page.waitForTimeout(1500);
  info = await page.innerText('#mmInfo'); ok(/outside the marked plot by/.test(info), 'standing away says outside');
  await page.screenshot({ path: TH.shot('mini5_outside.png') });
  // tap on mini map opens full map with corners
  await page.click('#mmc'); await page.waitForSelector('#mapc'); await page.waitForTimeout(600);
  ok((await page.innerText('#mpanel')).length > 0, 'tapping the mini map opens the full map');
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await b.close();
  // fresh phone: map tab opens on my location
  const b2 = await chromium.launch(TH.launchOpts());
  const c2 = await b2.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 9.9312, longitude: 76.2673, accuracy: 5 }, hasTouch: true });
  await c2.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
  const p2 = await c2.newPage(); await p2.goto('http://localhost:8776/'); await p2.click('nav button[data-tab=map]'); await p2.waitForSelector('#mapc'); await p2.waitForTimeout(1800);
  await p2.screenshot({ path: TH.shot('mini6_maptab.png') });
  const pos = JSON.parse(require('child_process').execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(TH.shot('mini6_maptab.png'))}).convert('RGB'); W,H=im.size
xs=[];ys=[]
for y in range(220,1400,2):
  for x in range(0,W,2):
    r,g,b=im.getpixel((x,y))
    if abs(r-47)<14 and abs(g-128)<14 and b>235: xs.append(x); ys.append(y)
print(json.dumps({'n':len(xs),'cx':sum(xs)/max(1,len(xs)),'cy':sum(ys)/max(1,len(ys)),'W':W}))`]).toString());
  console.log('blue dot on map tab:', JSON.stringify(pos));
  ok(pos.n > 40 && Math.abs(pos.cx - pos.W / 2) < 60, 'Map tab opens on my GPS location (blue dot at the centre)');

  // GPS blocked: no popup on auto start
  const b3 = await chromium.launch(TH.launchOpts());
  const c3 = await b3.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, permissions: [] });
  const p3 = await c3.newPage(); await p3.goto('http://localhost:8776/'); await p3.click('nav button[data-tab=map]'); await p3.waitForSelector('#mapc'); await p3.waitForTimeout(1200);
  ok(!(await p3.isVisible('#ov.on')), 'no blocked-location popup when the map auto-starts GPS');
  await TH.startWay(p3, 'gps'); await p3.waitForTimeout(500);
  ok(await p3.isVisible('#mmGps'), 'without GPS the Show where I am button is shown');
  await b2.close(); await b3.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
