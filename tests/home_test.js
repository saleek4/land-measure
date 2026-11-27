// Home: Plots, Plan, GPS, Measure, Sketch, each with a New button; "+ New plot" chooser; saved links and kind filter on the Plots tab.
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8803);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const cor = (src) => [[11.05, 76.07], [11.0501, 76.07], [11.0501, 76.0701]].map(c => ({ lat: c[0], lon: c[1], acc: 3, n: 1, total: 1, src }));
const mk = (id, name, src, sk) => ({ id, name, place: 'Malappuram', notes: '', ts: Date.now() - 1000 * id.length, mode: 'corners', corners: cor(src === 'map' ? 'map' : src === 'tape' ? 'tape' : 'gps'), holes: [], rec: null, tape: sk ? { sk: { pts: [], cr: [], L: {} } } : null, area: 380.5, per: 80, sig: 5, src });
const plots = [mk('a1', 'Sketch plot', 'tape', true), mk('b22', 'Road side', 'gps'), mk('c333', 'Hill map', 'map'), mk('d4444', 'Tape plan', 'tape')];
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript((pl) => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.plots.v1')) localStorage.setItem('lm.plots.v1', JSON.stringify(pl)); } catch (e) {} }, plots);
  const page = await ctx.newPage(); page.setDefaultTimeout(5000); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8803/'); await page.waitForTimeout(500);
  const lsPlots = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.plots.v1') || '[]'));
  const lsDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const home = async () => { await page.click('nav button[data-tab=measure]'); await page.waitForTimeout(150); };

  // ---- the five sections, in the order Plots, Plan, GPS, Measure, Sketch
  const heads = await page.$$eval('#app .hsh b', a => a.map(e => e.textContent.trim()));
  ok(JSON.stringify(heads) === JSON.stringify(['Plots', 'Plan', 'Use GPS on the land', 'Measure', 'Sketch']), 'Home has Plots, Plan, GPS, Measure, Sketch in that order: ' + heads.join(' / '));
  for (const [id, what] of [['#bNewPlot', 'Plots'], ['#bPlanPhoto', 'Plan (photo)'], ['#bTape', 'Plan (tape)'], ['#bCap', 'GPS'], ['#bToMap', 'Measure'], ['#bSketch', 'Sketch']]) ok(await page.$(id) !== null, what + ' has its New button (' + id + ')');
  ok(/How do you want to measure/.test(await page.innerText('.next')), 'Home still asks how you want to measure');
  const links = await page.$$eval('#app .hsv', a => a.map(e => e.dataset.kind + ':' + e.textContent.replace(/\s+/g, ' ').trim()));
  ok(links.length === 4 && links.every(x => /1 saved/.test(x)), 'each way shows how many plots were saved with it: ' + links.join(', '));
  ok((await page.$$('.hpl')).length === 2 && await page.$('#hplAll') !== null, 'Plots shows the last 2 and a See all link');

  // ---- saved link -> Plots tab filtered
  await page.click('.hsv[data-kind="plan"]'); await page.waitForTimeout(200);
  ok(await page.$eval('nav button.on', e => e.dataset.tab) === 'plots' && (await page.$$('.plotitem')).length === 1 && /Tape plan/.test(await page.innerText('.plotitem')), 'the Plan link opens the Plots tab with only the tape plan');
  const chipOn = () => page.$eval('.kchips button.on', e => e.textContent.trim());
  ok(await chipOn() === 'Plan 1', 'the Plan chip is on, with its count');
  for (const [k, name] of [['sketch', 'Sketch plot'], ['gps', 'Road side'], ['map', 'Hill map']]) {
    await page.click('.kchips button[data-k="' + k + '"]'); await page.waitForTimeout(100);
    const t = await page.$$eval('.plotitem b', a => a.map(e => e.textContent));
    ok(t.length === 1 && t[0] === name, 'chip ' + k + ' shows only ' + name);
  }
  await page.click('.kchips button[data-k=""]'); await page.waitForTimeout(100);
  ok((await page.$$('.plotitem')).length === 4 && /All 4/.test(await chipOn()), 'All shows all 4 plots');
  await page.fill('#fSearch', 'road'); await page.waitForTimeout(100);
  ok((await page.$$('.plotitem')).length === 1, 'search and chips work together');
  await page.fill('#fSearch', ''); await page.waitForTimeout(100);

  // ---- + New plot in the Plots tab, then each choice
  await page.click('#pNew'); await page.waitForSelector('#sheet button[data-m]');
  ok((await page.$$('#sheet button[data-m]')).length === 5, 'the New plot sheet offers 5 ways');
  await page.click('#sheet button[data-m="sk"]'); await page.waitForSelector('#skSvg', { state: 'visible' });
  ok(/Step 1/.test(await page.innerText('#skPanel')), 'New plot > Sketch opens a blank sketch'); await page.click('#skX'); await page.waitForTimeout(200);
  await home(); await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m="photo"]');
  await page.waitForSelector('#phCam', { state: 'attached' }); ok(true, 'New plot > Photo of the paper plan opens the photo choices'); await page.keyboard.press('Escape'); await page.evaluate(() => { const o = document.querySelector('#ov'); if (o && o.classList.contains('on')) o.click(); }); await page.waitForTimeout(150);
  if (await page.isVisible('#skSvg')) await page.click('#skX'); await page.waitForTimeout(200);
  await home(); await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m="tape"]'); await page.waitForSelector('#tN'); ok(true, 'New plot > Tape lengths opens the tape list');
  await page.evaluate(() => { const o = document.querySelector('#ov'); if (o) o.click(); }); await page.waitForTimeout(150);
  await home(); await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m="map"]'); await page.waitForSelector('#mapc'); ok(true, 'New plot > Satellite map opens the map');
  await home(); await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m="gps"]'); await page.waitForTimeout(200);
  ok(await page.isVisible('#bCap') && await page.$eval('nav button.on', e => e.dataset.tab) === 'measure', 'New plot > GPS brings the Capture button into view');

  // ---- a plot that is not saved yet: save it first / throw it away
  const d = { name: 'Half done', place: '', notes: '', mode: 'corners', corners: cor('gps'), holes: [], rec: null, tape: null };
  await page.evaluate((x) => localStorage.setItem('lm.draft.v1', JSON.stringify(x)), d); await page.reload(); await page.waitForTimeout(500);
  ok(await page.$('#bNewPlot') !== null && await page.$('#bSave') !== null, 'with a plot in progress Home shows Save plot and a + New plot link');
  await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m="sk"]'); await page.waitForTimeout(250);
  const askT = await page.innerText('#sheet');
  ok(/not saved yet/.test(askT) && /Save it, then start new/.test(askT) && /Throw it away/.test(askT) && /Keep working/.test(askT), 'it asks what to do with the unsaved plot');
  await page.click('#sheet button:has-text("Keep working")'); await page.waitForTimeout(150);
  ok((await lsDraft()).corners.length === 3 && (await lsPlots()).length === 4, 'Keep working changes nothing');
  await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m="sk"]'); await page.waitForTimeout(250);
  await page.click('#sheet button:has-text("Save it, then start new")'); await page.waitForSelector('#skSvg', { state: 'visible' });
  const pl = await lsPlots(); ok(pl.length === 5 && pl[0].name === 'Half done' && (await lsDraft()).corners.length === 0, 'Save it, then start new: the plot is saved and a blank sketch opens');
  await page.click('#skX'); await page.waitForTimeout(200);
  await page.evaluate((x) => localStorage.setItem('lm.draft.v1', JSON.stringify(x)), d); await page.reload(); await page.waitForTimeout(500);
  await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m="map"]'); await page.waitForTimeout(250);
  await page.click('#sheet button:has-text("Throw it away")'); await page.waitForSelector('#mapc');
  ok((await lsPlots()).length === 5 && (await lsDraft()).corners.length === 0, 'Throw it away: nothing is saved and the draft is empty');

  // ---- a sketch in progress: continue it or start a new one
  await page.evaluate(() => localStorage.setItem('lm.draft.v1', JSON.stringify({ name: '', place: '', notes: '', mode: 'corners', corners: [], holes: [], rec: null, tape: null, sk: { pts: [[100, 100, 1], [200, 100, 2], [200, 200, 3]], closed: false, cr: [], L: {}, nid: 4, u: 'm' } })));
  await page.reload(); await page.waitForTimeout(500);
  ok(/Continue your sketch/.test(await page.innerText('#bSketch')) && await page.$('#bSketchNew') !== null, 'a sketch in progress says Continue, with Start a new sketch instead');
  await page.click('#bSketchNew'); await page.waitForTimeout(150); await page.click('#sheet button:has-text("Start new")'); await page.waitForSelector('#skSvg', { state: 'visible' });
  ok(/Step 1/.test(await page.innerText('#skPanel')) && !(await lsDraft()).sk, 'Start a new sketch instead gives a blank sketch');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exitCode = 1; srv.close(); process.exit(1); });
