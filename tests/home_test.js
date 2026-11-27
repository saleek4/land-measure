// Home: one "Measure a new plot" button + the saved plots; the chooser with three ways; the plot-in-progress screen with its Result buttons;
// Plots filter chips; Settings tab; saved-plot buttons in groups.
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
  await ctx.addInitScript((pl) => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); localStorage.setItem('lm.backup.v1', JSON.stringify({ t: Date.now(), n: 99 })); if (!localStorage.getItem('lm.plots.v1')) localStorage.setItem('lm.plots.v1', JSON.stringify(pl)); } catch (e) {} }, plots);
  const page = await ctx.newPage(); page.setDefaultTimeout(5000); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8803/'); await page.waitForTimeout(500);
  const lsPlots = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.plots.v1') || '[]'));
  const lsDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const home = async () => { await page.click('nav button[data-tab=measure]'); await page.waitForTimeout(150); };
  const tab = () => page.$eval('nav button.on', e => e.dataset.tab);
  const pick = async (m) => { await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); if (m === 'sk' || m === 'photo' || m === 'tape') { await page.click('#sheet button[data-m=plan]'); await page.waitForSelector('#sheet button[data-m="' + m + '"]'); } await page.click('#sheet button[data-m="' + m + '"]'); };
  const closeAny = async () => { await page.evaluate(() => { const o = document.querySelector('#ov'); if (o && o.classList.contains('on')) o.click(); }); await page.waitForTimeout(150); };
  const setDraft = async (x) => { await page.evaluate((v) => localStorage.setItem('lm.draft.v1', JSON.stringify(v)), x); await page.reload(); await page.waitForTimeout(500); };
  const base = { name: '', place: '', notes: '', mode: 'corners', holes: [], rec: null, tape: null };

  // ---- Home with nothing in progress: one big button, then the saved plots
  ok(/Measure a new plot/.test(await page.innerText('#bNewPlot')) && await page.isVisible('#bNewPlot'), 'Home has one big Measure a new plot button');
  const heads = await page.$$eval('#app .hsh b', a => a.map(e => e.textContent.trim()));
  ok(JSON.stringify(heads) === JSON.stringify(['Your plots']), 'Home has just the saved plots under the button: ' + heads.join(' / '));
  ok(!(await page.$('#bCap')) && !(await page.$('#bTape')) && !(await page.$('#bSketch')) && !(await page.$('#bPlanPhoto')) && !(await page.$('.hsv[data-kind]')), 'the old section buttons are gone from Home');
  ok((await page.$$('.hpl')).length === 3 && await page.$('#hplAll') !== null, 'Your plots shows the last 3 and a See all link');
  ok(await page.$('#bConv') !== null, 'the unit converter is one tap away on Home');
  ok(await page.$('nav button[data-tab=more]').then(e => e.innerText()).then(t => /Settings/.test(t)), 'the last tab is called Settings');

  // ---- See all -> Plots tab, with the way filter
  await page.click('#hplAll'); await page.waitForTimeout(200);
  ok(await tab() === 'plots' && (await page.$$('.plotitem')).length === 4, 'See all opens the Plots tab with all 4 plots');
  const chipOn = () => page.$eval('.kchips button.on', e => e.textContent.trim());
  await page.click('.kchips button[data-k="plan"]'); await page.waitForTimeout(100);
  ok(await chipOn() === 'Plan 1' && (await page.$$('.plotitem')).length === 1 && /Tape plan/.test(await page.innerText('.plotitem')), 'the Plan chip shows only the tape plan, with its count');
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

  // ---- the chooser: three ways, the third has three more
  await page.click('#pNew'); await page.waitForSelector('#sheet button[data-m]');
  const ways = await page.$$eval('#sheet button[data-m]', a => a.map(e => e.dataset.m));
  ok(JSON.stringify(ways) === JSON.stringify(['gps', 'map', 'plan']), 'the chooser offers 3 ways: ' + ways.join(', '));
  await page.click('#sheet button[data-m=plan]'); await page.waitForSelector('#npB');
  const plan3 = await page.$$eval('#sheet button[data-m]', a => a.map(e => e.dataset.m));
  ok(JSON.stringify(plan3) === JSON.stringify(['sk', 'photo', 'tape']), 'the plan way offers sketch, photo and tape lengths: ' + plan3.join(', '));
  await page.click('#npB'); await page.waitForSelector('#sheet button[data-m=gps]'); ok(true, 'Back returns to the three ways'); await closeAny();
  await home(); await pick('sk'); await page.waitForSelector('#skSvg', { state: 'visible' });
  ok(/Step 1/.test(await page.innerText('#skPanel')), 'Plan > Draw a sketch opens a blank sketch'); await page.click('#skX'); await page.waitForTimeout(200);
  await home(); await pick('photo'); await page.waitForSelector('#phCam', { state: 'attached' }); ok(true, 'Plan > Photo of the paper plan opens the photo choices'); await page.keyboard.press('Escape'); await closeAny();
  if (await page.isVisible('#skSvg')) await page.click('#skX'); await page.waitForTimeout(200);
  await home(); await pick('tape'); await page.waitForSelector('#tN'); ok(true, 'Plan > Tape lengths opens the tape list'); await closeAny();
  await home(); await pick('map'); await page.waitForSelector('#mapc'); ok(true, 'I am looking at the map opens the map');
  await home(); await pick('gps'); await page.waitForTimeout(200);
  ok(await page.isVisible('#bCap') && await tab() === 'measure' && /Plot in progress/.test(await page.innerText('#app')) && /GPS on the land/.test(await page.innerText('.ph')), 'I am on the land shows the GPS capture button');
  ok(/Capture corner 1/.test(await page.innerText('#bCap')) && await page.isVisible('#bWayX') && await page.isVisible('#mmc'), 'with the first corner to take, the small map and a Cancel button are shown');
  await page.click('#bWayX'); await page.waitForTimeout(150);
  ok(await page.isVisible('.hero') && !(await page.$('#bCap')), 'Cancel goes back to the plain Home');

  // ---- a plot in progress: Save, name, and the What next? buttons
  const d = { ...base, name: 'Half done', corners: cor('gps') };
  await setDraft(d);
  ok(await page.$('#bNewPlot') !== null && await page.$('#bSave') !== null && await page.$('#fName') !== null && (await page.inputValue('#fName')) === 'Half done', 'a plot in progress shows Save plot, its name and a New plot button');
  const ids = ['#aEdit', '#aFit', '#aMove', '#aSplit', '#aHole', '#bRec', '#bField'];
  ok((await Promise.all(ids.map(s => page.$(s)))).every(Boolean), 'What next? has Edit, Fit, Move, Split, Exclude, Compare with record, Check with a tape');
  const grp = await page.$$eval('#app .tgrp', a => a.map(e => e.textContent.trim()));
  ok(JSON.stringify(grp) === JSON.stringify(['Fix the shape', 'Divide the land', 'Check and compare']), 'the buttons are in 3 groups: ' + grp.join(' / '));
  ok(/Capture corner 4/.test(await page.innerText('#bCap')) && /Measure with GPS/.test(await page.innerText('#app')), 'the GPS card is still there to add a corner');
  ok(/3 corners taken/.test(await page.innerText('.next')) && /Capture corner 4/.test(await page.innerText('.next')), 'the hint says to capture the next corner, not that the area is final');
  const yCap = await page.$eval('#bCap', e => e.getBoundingClientRect().top + window.scrollY), yEdit = await page.$eval('#aEdit', e => e.getBoundingClientRect().top + window.scrollY);
  ok(yCap < 700 && yCap < yEdit, 'with 3 GPS corners the Capture button is on the first screen, above What next? (y=' + Math.round(yCap) + ')');
  await page.fill('#fPlace', 'Near the well'); await page.waitForTimeout(100);
  ok((await lsDraft()).place === 'Near the well', 'the place typed on Home is kept in the draft');

  // unsaved plot: save it first / throw it away
  await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]'); await page.click('#sheet button[data-m=plan]'); await page.click('#sheet button[data-m=sk]'); await page.waitForTimeout(250);
  const askT = await page.innerText('#sheet');
  ok(/not saved yet/.test(askT) && /Save it, then start new/.test(askT) && /Throw it away/.test(askT) && /Keep working/.test(askT), 'it asks what to do with the unsaved plot');
  await page.click('#sheet button:has-text("Keep working")'); await page.waitForTimeout(150);
  ok((await lsDraft()).corners.length === 3 && (await lsPlots()).length === 4, 'Keep working changes nothing');
  await pick('sk'); await page.waitForTimeout(250);
  await page.click('#sheet button:has-text("Save it, then start new")'); await page.waitForSelector('#skSvg', { state: 'visible' });
  const pl = await lsPlots(); ok(pl.length === 5 && pl[0].name === 'Half done' && pl[0].place === 'Near the well' && (await lsDraft()).corners.length === 0, 'Save it, then start new: the plot is saved with its name and place, and a blank sketch opens');
  await page.click('#skX'); await page.waitForTimeout(200);
  await setDraft(d);
  await pick('map'); await page.waitForTimeout(250);
  await page.click('#sheet button:has-text("Throw it away")'); await page.waitForSelector('#mapc');
  ok((await lsPlots()).length === 5 && (await lsDraft()).corners.length === 0, 'Throw it away: nothing is saved and the draft is empty');

  // ---- the Result buttons start their tool on the map
  await setDraft({ ...base, corners: cor('gps') });
  await page.click('#aSplit'); await page.waitForSelector('#spc'); ok(await tab() === 'map', 'Split this plot (from Home) opens the split card on the map');
  await home(); await page.click('#aHole'); await page.waitForSelector('#hDone'); ok(await tab() === 'map', 'Exclude an area (from Home) starts marking an area on the map'); await page.click('#hDone'); await page.waitForTimeout(150);
  await home(); await page.click('#aFit'); await page.waitForSelector('#fiV'); ok(await tab() === 'map', 'Fit to a wanted area (from Home) opens the fit sheet on the map'); await closeAny();
  await home(); await page.click('#aEdit'); await page.waitForTimeout(250); ok(await tab() === 'map' && /edit it/.test(await page.innerText('#toast')), 'Edit sides and points (from Home) goes to the map in edit mode');
  await home(); await page.click('#aMove'); await page.waitForTimeout(200); ok(await tab() === 'measure' && /GPS points would lose/.test(await page.innerText('#toast')), 'Move or turn says why it cannot move GPS points and stays on Home');
  await page.click('#bRec'); await page.waitForSelector('#rcV'); ok(true, 'Compare with record area opens its sheet on Home'); await closeAny();

  // ---- the other ways: what Home shows for them
  await setDraft({ ...base, corners: cor('map') });
  ok(!(await page.$('#bCap')) && await page.isVisible('#bToMap') && /Open the satellite map/.test(await page.innerText('#bToMap')), 'a plot made on the map has no GPS card, only Open the satellite map');
  await setDraft({ ...base, corners: cor('tape'), tape: { sides: ['10', '10', '10'], diags: [], u: 'm', hub: 0 } });
  ok(/Edit tape lengths/.test(await page.innerText('#bTape')) && !(await page.$('#bCap')), 'a plot from tape lengths shows Edit tape lengths');
  await page.click('#bTape'); await page.waitForSelector('#tN'); ok(true, 'Edit tape lengths opens the tape list'); await closeAny();
  await setDraft({ ...base, corners: [], sk: { pts: [[100, 100, 1], [200, 100, 2], [200, 200, 3]], closed: false, cr: [], L: {}, nid: 4, u: 'm' } });
  ok(/Continue your sketch/.test(await page.innerText('#bSketch')) && await page.$('#bSketchNew') !== null, 'a sketch in progress says Continue, with Start a new sketch instead');
  await page.click('#bSketchNew'); await page.waitForTimeout(150); await page.click('#sheet button:has-text("Start new")'); await page.waitForSelector('#skSvg', { state: 'visible' });
  ok(/Step 1/.test(await page.innerText('#skPanel')) && !(await lsDraft()).sk, 'Start a new sketch instead gives a blank sketch'); await page.click('#skX'); await page.waitForTimeout(200);

  // ---- Settings: Backup first, help folded away
  await page.click('nav button[data-tab=more]'); await page.waitForTimeout(200);
  const h2 = await page.$$eval('#app .card > h2', a => a.map(e => e.textContent.trim()));
  ok(h2[0] === 'Backup' && h2.includes('Units') && h2.includes('GPS'), 'Settings starts with Backup, then Units and GPS: ' + h2.join(' / '));
  ok((await page.$$('details.help')).length === 5 && (await page.$$('details.help[open]')).length === 0, 'the 5 help topics are folded away');
  ok((await Promise.all(['#bExp', '#bImp', '#sUnit', '#sLU', '#sDur', '#sAcc', '#mConv'].map(s => page.isVisible(s)))).every(Boolean), 'the settings and backup buttons are all in view, not folded');

  // ---- a saved plot: buttons in groups
  await page.click('nav button[data-tab=plots]'); await page.waitForTimeout(200); await page.click('.plotitem'); await page.waitForTimeout(300);
  const g2 = await page.$$eval('#app .tgrp', a => a.map(e => e.textContent.trim()));
  ok(JSON.stringify(g2) === JSON.stringify(['Work on it', 'Share', 'For other apps', 'Manage']), 'a saved plot groups its buttons: ' + g2.join(' / '));
  ok((await Promise.all(['#bMap', '#bSplit', '#bRec', '#bPdf', '#bPng', '#bShare', '#bKml', '#bGeo', '#bRename', '#bDel'].map(s => page.$(s)))).every(Boolean), 'every saved-plot button is still there');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exitCode = 1; srv.close(); process.exit(1); });
