const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8783);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const pent = [[0, 0], [60, -5], [75, 40], [30, 62], [-8, 35]];
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sides = pent.map((p, i) => D(p, pent[(i + 1) % 5]));
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} try { if (!localStorage.getItem('lm.map.v1')) { localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 18, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap', loupe: true })); localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'cent' })); } } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8783/'); await page.waitForTimeout(400);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const labels = async () => (await page.$$eval('#sheet input[data-d]', els => els.map(e => e.previousElementSibling.textContent.replace(/\s+/g, ' ').trim())));
  await page.click('#bTape'); await page.waitForSelector('#tN');
  await page.selectOption('#tN', { value: '5' }); await page.waitForSelector('#tHub');
  ok(/only 2 needed for 5 corners/.test(await page.innerText('#sheet')), 'sheet says only 2 crosses are needed for 5 corners');
  ok(JSON.stringify(await labels()) === JSON.stringify(['1 → 3', '1 → 4']), 'crosses from corner 1: ' + JSON.stringify(await labels()));
  await page.click('#tBest'); await page.waitForTimeout(150);
  ok(/Mark a rough shape with 5 corners on the map first/.test(await page.innerText('#tHint')), 'Suggest without a shape explains what to do');
  await page.screenshot({ path: TH.shot('cr1_sheet.png') });
  // tap corner 3 on the picture
  await page.click('#tDia [data-h="2"]'); await page.waitForSelector('#tHub');
  ok((await page.inputValue('#tHub')) === '2', 'tapping corner 3 on the picture makes it the hub');
  ok(JSON.stringify(await labels()) === JSON.stringify(['3 → 5', '3 → 1']), 'crosses from corner 3: ' + JSON.stringify(await labels()));
  for (let i = 0; i < 5; i++) await page.fill('input[data-s="' + i + '"]', sides[i].toFixed(3));
  await page.fill('input[data-d="2-4"]', D(pent[2], pent[4]).toFixed(3)); await page.fill('input[data-d="0-2"]', D(pent[2], pent[0]).toFixed(3)); await page.waitForTimeout(250);
  let rt = await page.innerText('#tRes'); console.log('result:', rt.replace(/\n/g, ' | ').slice(0, 120));
  ok(/3,?885/.test(rt), 'area from crosses at corner 3 = 3885 sq m');
  await page.screenshot({ path: TH.shot('cr2_hub3.png') });
  // different hub: cross 3->1 (key 0-2) is shared with hub 1, so it stays filled
  await page.selectOption('#tHub', { value: '0' }); await page.waitForSelector('input[data-d="0-2"]');
  ok((await page.inputValue('input[data-d="0-2"]')) === D(pent[2], pent[0]).toFixed(3), 'the cross 1-3 typed before is kept when the hub changes');
  ok(/Enter the diagonal \(cross\) from point 1 to point 4/.test(await page.innerText('#tRes')), 'asks only for the missing cross 1 -> 4');
  await page.fill('input[data-d="0-3"]', D(pent[0], pent[3]).toFixed(3)); await page.waitForTimeout(250);
  ok(/3,?885/.test(await page.innerText('#tRes')), 'area from crosses at corner 1 gives the same 3885 sq m');
  await page.selectOption('#tHub', { value: '3' }); await page.waitForSelector('input[data-d="1-3"]');
  await page.fill('input[data-d="1-3"]', D(pent[3], pent[1]).toFixed(3)); await page.waitForTimeout(250);
  ok(/3,?885/.test(await page.innerText('#tRes')) && JSON.stringify(await labels()) === JSON.stringify(['4 → 1', '4 → 2']), 'corner 4 as hub: ' + JSON.stringify(await labels()) + ' same area');
  // wrong cross: message names the real corner
  await page.fill('input[data-d="1-3"]', '5'); await page.waitForTimeout(250);
  ok(/point/.test(await page.innerText('#tRes')) && !/3,?885/.test(await page.innerText('#tRes')), 'a wrong cross is reported: ' + (await page.innerText('#tRes')).replace(/\n/g, ' ').slice(0, 110));
  await page.fill('input[data-d="1-3"]', D(pent[3], pent[1]).toFixed(3)); await page.waitForTimeout(200);
  // place with hub 4, side 1 must point north (direction 0)
  await page.fill('#tB', '0'); await page.click('#tPlace'); await page.waitForTimeout(700);
  const d = await draft(); const c = d.corners;
  const brg = (Math.atan2((c[1].lon - c[0].lon) * Math.cos(11.05 * Math.PI / 180), (c[1].lat - c[0].lat)) * 180 / Math.PI + 360) % 360;
  ok(c.length === 5 && d.tape.hub === 3 && d.tape.diags.length === 2, 'five corners placed, hub 4 stored with its 2 crosses');
  ok(Math.min(brg, 360 - brg) < 0.3, 'side 1 points north although corner 4 was the hub (bearing ' + brg.toFixed(2) + ')');
  const panel = await page.innerText('#mpanel'); ok(/96\.0\d cent/.test(panel), 'map panel shows 96.0 cent: ' + panel.split('\n')[0]);
  // reopen sheet: values and hub come back; suggest now has a shape
  await page.click('#mTools'); await page.click('#tTape'); await page.waitForSelector('#tHub');
  ok((await page.inputValue('#tHub')) === '3', 'sheet reopens with corner 4 as hub');
  await page.click('#tBest'); await page.waitForTimeout(300);
  const hint = await page.innerText('#tHint'); ok(/Corner \d is best/.test(hint), 'Suggest with a shape on the map: ' + hint);
  await page.screenshot({ path: TH.shot('cr3_suggest.png') });
  await page.click('#tX');
  // save the plot and look at the detail card
  await page.waitForSelector('#mSave'); await page.click('#mSave'); await page.waitForSelector('#sN'); await page.fill('#sN', 'Pent'); await page.click('#sOk'); await page.waitForTimeout(300);
  await page.click('nav button[data-tab=plots]'); await page.waitForSelector('.plotitem'); await page.click('.plotitem'); await page.waitForTimeout(300);
  const det = await page.innerText('#app'); ok(/Crosses: 4→1/.test(det) && /4→2/.test(det), 'saved plot lists the crosses with real corner numbers');
  // 3 corners: no crosses at all
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bTape'); await page.click('#bTape'); await page.waitForSelector('#tN'); await page.selectOption('#tN', { value: '3' }); await page.waitForTimeout(200);
  ok(!(await page.$('#tHub')) && !/Crosses/.test(await page.innerText('#sheet')), 'a triangle shows no crosses');
  ok(errs.length === 0, 'no JS errors ' + errs.join('|'));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
