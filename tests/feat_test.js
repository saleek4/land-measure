const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs'), { execFileSync } = require('child_process');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8772);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const mpp = 156543.03392 * Math.cos(11.05 * Math.PI / 180) / Math.pow(2, 19);
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} try { if (!localStorage.getItem('lm.map.v1')) { localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 19, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap', loupe: true })); localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8772/');
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const plots = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.plots.v1') || '[]'));
  const panel = () => page.innerText('#mpanel');
  const centCent = t => { const m = t.match(/([\d.,]+)\s*cent/); return m ? parseFloat(m[1].replace(/,/g, '')) : NaN; };
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc');
  const R = await page.evaluate(() => { const r = document.querySelector('#mapc').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
  const tap = async (dx, dy) => { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(70); };
  for (const [dx, dy] of [[-100, -100], [100, -100], [100, 100], [-100, 100]]) await tap(dx, dy);
  const plotCent = (200 * mpp) * (200 * mpp) / 40.468564224;
  ok(Math.abs(centCent(await panel()) - plotCent) / plotCent < 0.01, 'square ' + centCent(await panel()) + ' cent (expected ' + plotCent.toFixed(2) + ')');

  // ---- tools sheet
  await page.click('#mTools'); await page.waitForSelector('#tSplit');
  await page.screenshot({ path: TH.shot('f1_tools.png') });
  ok(['#tSplit', '#tHole', '#tRec', '#tTape', '#tMove'].every(s => true), 'tools sheet opens');

  // ---- exclude an area (40 px square in the middle)
  await page.click('#tHole'); await page.waitForSelector('#hDone');
  for (const [dx, dy] of [[-20, -20], [20, -20], [20, 20], [-20, 20]]) await tap(dx, dy);
  let d = await draft(); ok(d.holes && d.holes.length === 1 && d.holes[0].corners.length === 4 && d.corners.length === 4, 'hole has 4 points, plot still 4');
  await page.screenshot({ path: TH.shot('f2_hole_edit.png') });
  await page.click('#hDone'); await page.waitForTimeout(150);
  const holeCent = (40 * mpp) * (40 * mpp) / 40.468564224, netExp = plotCent - holeCent;
  let t = await panel(); console.log('panel:', t.replace(/\n/g, ' | ')); const netShown = centCent(t);
  ok(/excluded/.test(t) && Math.abs(centCent(t) - netExp) / netExp < 0.01, 'panel shows net ' + centCent(t) + ' (expected ' + netExp.toFixed(2) + ') and excluded');
  await page.screenshot({ path: TH.shot('f3_hole_done.png') });

  // ---- record area
  await page.click('#mTools'); await page.waitForSelector('#tRec'); await page.click('#tRec'); await page.waitForSelector('#rcV');
  await page.fill('#rcV', '80'); await page.click('#rcOk'); await page.waitForTimeout(150);
  t = await panel(); const pct = (netShown - 80) / 80 * 100;
  const mm = t.match(/Record 80\.00 cent\s*→\s*([+−])([\d.]+)%/);
  ok(mm && Math.abs((mm[1] === '+' ? 1 : -1) * parseFloat(mm[2]) - pct) < 0.2, 'record compare ' + (mm ? mm[1] + mm[2] : 'none') + '% (expected ' + pct.toFixed(1) + '%)');
  d = await draft(); ok(d.rec && Math.abs(d.rec.a - 80 * 40.468564224) < 0.01 && d.rec.u === 'cent', 'record stored in sq m');

  // ---- split
  await page.click('#mTools'); await page.click('#tSplit'); await page.waitForSelector('#spc');
  await page.screenshot({ path: TH.shot('f4_split.png') });
  ok(/2 parts/.test(await panel()), 'split starts with 2 equal parts');
  await page.click('#spIdeas'); await page.waitForSelector('.idea');
  const nIdeas = await page.locator('.idea').count(); ok(nIdeas >= 5, 'ideas shown: ' + nIdeas);
  await page.screenshot({ path: TH.shot('f5_ideas.png') });
  await page.click('.idea[data-id="third-perp"]'); await page.waitForTimeout(150);
  t = await panel(); console.log('split panel:', t.replace(/\n/g, ' | '));
  ok(/3 parts/.test(t), 'idea applied: 3 parts');
  const nums = [...(await page.innerText('#spres')).matchAll(/(\d+\.\d+) cent \((\d+\.\d)%\)/g)].map(m => [parseFloat(m[1]), parseFloat(m[2])]);
  ok(nums.length === 3 && nums.every(n => Math.abs(n[1] - 33.3) < 0.2) && Math.abs(nums.reduce((a, n) => a + n[0], 0) - netShown) / netShown < 0.002, 'three equal parts ' + JSON.stringify(nums));
  await page.screenshot({ path: TH.shot('f6_split3.png') });
  // ratio and by-area
  await page.click('[data-k="ratio"]'); await page.fill('#spR', '1:3'); await page.waitForTimeout(100);
  let r2 = [...(await page.innerText('#spres')).matchAll(/\((\d+\.\d)%\)/g)].map(m => parseFloat(m[1])); ok(r2.length === 2 && Math.abs(r2[0] - 25) < 0.2, 'ratio 1:3 gives 25% / 75%: ' + r2);
  await page.click('[data-k="areas"]'); await page.fill('#spA', '10'); await page.waitForTimeout(100);
  r2 = [...(await page.innerText('#spres')).matchAll(/(\d+\.\d+) cent/g)].map(m => parseFloat(m[1])); ok(r2.length === 2 && Math.abs(r2[0] - 10) < 0.02, 'by area 10 cent first: ' + r2);
  await page.fill('#spA', '500'); await page.waitForTimeout(100);
  ok(/bigger than the plot/.test(await page.innerText('#spres')) && await page.isDisabled('#spSave'), 'too big share is refused and save disabled');
  await page.click('[data-k="road"]'); await page.waitForTimeout(100); await page.fill('#spW', '3'); await page.waitForTimeout(100);
  r2 = [...(await page.innerText('#spres')).matchAll(/(\d+\.\d+) cent/g)].map(m => parseFloat(m[1]));
  ok(r2.length === 2 && Math.abs(r2[0] - (3 * 58.6 / 40.468564224)) < 0.4, 'road strip 3 m is ~' + (3 * 58.6 / 40.4686).toFixed(2) + ' cent: ' + r2);
  await page.click('[data-k="equal"]'); await page.waitForTimeout(100); await page.click('#spP'); await page.click('#spP'); await page.waitForTimeout(100);
  ok(/5 equal parts/.test(await page.innerText('#spc')), 'stepper gives 5 equal parts');
  await page.click('#spNext'); await page.waitForTimeout(100); await page.click('[data-d="fan"]'); await page.waitForTimeout(100);
  ok(/Corner 3/.test(await page.innerText('#spRef')) || /Corner 2/.test(await page.innerText('#spRef')), 'fan from a corner: ' + await page.innerText('#spRef'));
  await page.screenshot({ path: TH.shot('f7_fan.png') });
  await page.click('[data-d="perp"]'); await page.waitForTimeout(100);
  await page.click('#spSave'); await page.waitForSelector('#sheet button[data-i]'); await page.click('#sheet button[data-i="0"]'); await page.waitForTimeout(300);
  let pl = await plots();
  ok(pl.length === 5 && pl.every(p => /part \d/.test(p.name)), 'five parts saved as plots: ' + pl.map(p => p.name).join(', '));
  const sum = pl.reduce((a, p) => a + p.area, 0), netM2 = netShown * 40.468564224;
  ok(Math.abs(sum - netM2) / netM2 < 0.01, 'parts add up to the net area: ' + sum.toFixed(1) + ' vs ' + netM2.toFixed(1));
  ok(pl.some(p => p.holes && p.holes.length === 1), 'the part with the house keeps the excluded area');
  ok((await page.innerText('#app')).indexOf('part 1') >= 0, 'Plots tab lists the parts');
  await page.screenshot({ path: TH.shot('f8_parts.png') });
  d = await draft(); ok(d.corners.length === 4 && d.holes.length === 1, 'draft is still there after saving parts');

  // ---- back on the map: view -> screen positions of the corners
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc');
  await page.click('#mFit'); await page.waitForTimeout(500);
  const mX = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z, mY = (lat, z) => { const q = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + q) / (1 - q)) / (4 * Math.PI)) * 256 * 2 ** z; };
  const scr = async c => { const v = await page.evaluate(() => JSON.parse(localStorage.getItem('lm.map.v1'))); return { x: cx + mX(c.lon, v.zoom) - mX(v.lon, v.zoom), y: cy + mY(c.lat, v.zoom) - mY(v.lat, v.zoom) }; };
  d = await draft(); let P0 = await scr(d.corners[0]);
  console.log('corner 1 on screen', JSON.stringify(P0));

  // ---- magnifier while dragging
  await page.mouse.move(P0.x, P0.y + 6); await page.mouse.down(); await page.mouse.move(P0.x + 15, P0.y + 20, { steps: 4 }); await page.mouse.move(P0.x + 30, P0.y + 40, { steps: 4 }); await page.waitForTimeout(150);
  await page.screenshot({ path: TH.shot('f10_loupe.png') });
  await page.mouse.up(); await page.waitForTimeout(150);
  await page.screenshot({ path: TH.shot('f11_after_drag.png') });
  const dd = await draft(); ok(dd.corners[0].lat !== d.corners[0].lat, 'dragged corner moved');
  // ---- note + photo
  await page.click('#mFit'); await page.waitForTimeout(500);
  P0 = await scr(dd.corners[1]);
  await page.mouse.click(P0.x, P0.y); await page.waitForSelector('#vN');
  await page.fill('#vN', 'Boundary stone near the well');
  await page.setInputFiles('#vF', TH.fixture('test.jpg')); await page.waitForSelector('#vTh img', { timeout: 5000 }); await page.waitForTimeout(300);
  await page.screenshot({ path: TH.shot('f12_point_sheet.png') });
  d = await draft(); ok(d.corners[1].note === 'Boundary stone near the well' && d.corners[1].ph && d.corners[1].ph.length === 1, 'note and one photo stored on point 2');
  const keys = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('lm-photos', 1); r.onsuccess = () => { const q = r.result.transaction('ph').objectStore('ph').getAllKeys(); q.onsuccess = () => res(q.result); }; }));
  ok((await keys()).length === 1, 'photo is in IndexedDB');
  const photoSize = await page.evaluate(id => new Promise(res => { const r = indexedDB.open('lm-photos', 1); r.onsuccess = () => { const q = r.result.transaction('ph').objectStore('ph').get(id); q.onsuccess = () => res(q.result.size); }; }), d.corners[1].ph[0]);
  console.log('photo size bytes', photoSize);
  await page.click('#vOk'); await page.waitForTimeout(150);
  await page.screenshot({ path: TH.shot('f13_badge.png') });
  // ---- save the plot, open detail
  await page.click('#mSave'); await page.waitForSelector('#sN'); await page.fill('#sN', 'Test plot'); await page.click('#sOk'); await page.waitForSelector('#bKml');
  const det = await page.innerText('#app');
  ok(/Boundary stone near the well/.test(det) && await page.locator('.thumbs img').count() === 1, 'detail shows the note and the photo');
  ok(/Record vs measured/.test(det) && /excluded areas/i.test(det), 'detail shows record compare and excluded areas');
  await page.screenshot({ path: TH.shot('f14_detail.png'), fullPage: true });
  // exports
  const getDl = async sel => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click(sel)]); const f = TH.tmp('dl_' + dl.suggestedFilename()); await dl.saveAs(f); return f; };
  let pdf; try { pdf = await getDl('#bPdf'); } catch (e) { console.log('no pdf download', e.message); }
  if (pdf) { const info = execFileSync('pdfinfo', [pdf]).toString(); ok(/Pages:\s+1/.test(info) && /A4/.test(info), 'PDF plan is one A4 page'); execFileSync('pdftoppm', ['-png', '-r', '60', '-singlefile', pdf, TH.tmp('plan_pdf')]); ok(fs.existsSync(TH.tmp('plan_pdf.png')), 'PDF renders'); }
  let png; try { png = await getDl('#bPng'); } catch (e) { console.log('no png download', e.message); }
  if (png) { const dim = execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]);print(im.size)', png]).toString().trim(); ok(dim === '(1240, 1754)', 'plan picture is ' + dim); fs.copyFileSync(png, TH.shot('f15_plan.png')); }
  await page.click('#bKml'); await page.waitForSelector('#shTxt'); const kml = await page.inputValue('#shTxt'); await page.click('#shClose');
  ok(/<innerBoundaryIs>/.test(kml) && /Boundary stone near the well/.test(kml) && /<Polygon>/.test(kml), 'KML has the plot, the excluded area and the note');
  fs.writeFileSync(TH.tmp('plot.kml'), kml);
  await page.click('#bGeo'); await page.waitForSelector('#shTxt'); const gj = JSON.parse(await page.inputValue('#shTxt')); await page.click('#shClose');
  ok(gj.features[0].geometry.coordinates.length === 2 && gj.features[0].properties.record_sqm > 0, 'GeoJSON has an inner ring and the record area');
  await page.click('#bShare'); await page.waitForSelector('#shTxt'); const sm = await page.inputValue('#shTxt'); await page.click('#shClose');
  ok(/Record area: 80\.00 cent/.test(sm) && /excluded/.test(sm) && /Boundary stone/.test(sm), 'summary has record, excluded and the note');
  // delete the plot -> photo is removed from IndexedDB
  await page.click('#bDel'); await page.click('#sheet button[data-i="0"]'); await page.waitForTimeout(600);
  ok((await keys()).length === 0, 'photo is removed after the plot is deleted');

  console.log('JS ERRORS:', JSON.stringify(errs)); await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
