const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs'), { execFileSync } = require('child_process');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8786);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const LAT0 = 11.05, LON0 = 76.07, mLat = 110574, mLon = 111320 * Math.cos(LAT0 * Math.PI / 180);
const toLL = ([x, y]) => ({ lat: LAT0 + y / mLat, lon: LON0 + x / mLon });
const toXY = c => [(c.lon - LON0) * mLon, (c.lat - LAT0) * mLat];
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2);
const sgn = P => Math.sign(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0));
const truth = [[0, 0], [60, -5], [75, 40], [30, 62], [-8, 35]]; // 3885 sq m = 96.0 cent
const th = 37 * Math.PI / 180, jit = [[2, -3], [-3, 2], [1, 4], [-2, -2], [3, 1]];
const draftXY = truth.map((p, i) => [p[0] * Math.cos(th) - p[1] * Math.sin(th) + jit[i][0], p[0] * Math.sin(th) + p[1] * Math.cos(th) + jit[i][1]]);
const mkDraft = xy => ({ name: 'Field test', place: '', notes: '', mode: 'corners', holes: [], rec: null, tape: null,
  corners: xy.map(p => Object.assign(toLL(p), { acc: 3, n: 8, total: 8, alt: null, altAcc: null })) });
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(d => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.draft.v1')) localStorage.setItem('lm.draft.v1', JSON.stringify(d)); if (!localStorage.getItem('lm.map.v1')) localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 18, fill: 0.12, labels: false, sides: true, saved: true, add: 'tap' })); } catch (e) {} }, mkDraft(draftXY));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8786/'); await page.waitForTimeout(500);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const sheetTxt = () => page.innerText('#sheet');
  const choice = async label => { await page.click('#sheet button:has-text("' + label + '")'); await page.waitForTimeout(350); };

  // ---- entry points
  ok(await page.isVisible('#bField'), 'Measure tab shows the Field plan button for a 5-corner draft');
  ok(await page.isVisible('#bPlace') && /Place corner 6 on the satellite map/.test(await page.innerText('#bPlace')), 'weak-GPS button offers to place corner 6 on the map');
  await page.click('#bPlace'); await page.waitForTimeout(500);
  ok(await page.isVisible('#mapc') && /Tap the corner on the map/.test(await page.innerText('#toast')), 'weak-GPS button opens the map with a hint');
  await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bField');

  // ---- the plan
  await page.click('#bField'); await page.waitForSelector('#fRes');
  let t = await sheetTxt();
  ok(/5 sides \+ 2 crosses = 7 tape readings/.test(t), 'plan says 5 sides + 2 crosses = 7 tape readings');
  ok(/1 · Mark the corners/.test(t) && /2 · Measure the sides/.test(t) && /3 · Measure the crosses/.test(t) && /4 · One check cross/.test(t), 'plan lists the four steps');
  ok((await page.$$('input[data-fs]')).length === 5 && (await page.$$('input[data-fd]')).length === 2 && await page.isVisible('#fChk'), '5 side boxes, 2 cross boxes, 1 check box');
  ok((t.match(/about \d/g) || []).length >= 8, 'every box shows an "about X m" hint from the draft');
  const keys = await page.$$eval('input[data-fd]', e => e.map(x => x.dataset.fd));
  const chk = await page.$eval('#fChk', e => e.previousElementSibling.textContent.match(/(\d) → (\d)/).slice(1).map(Number));
  ok(!keys.includes(Math.min(chk[0], chk[1]) - 1 + '-' + (Math.max(chk[0], chk[1]) - 1)), 'check cross ' + chk.join('-') + ' is not one of the crosses ' + keys.join(', '));
  await page.screenshot({ path: TH.shot('fp1_plan.png') });

  // a wildly wrong side is flagged against the draft
  await page.fill('input[data-fs="0"]', '5'); await page.waitForTimeout(200);
  ok(/Draft says about/.test(await page.innerText('#fs-0')), 'a side far from the draft is flagged: ' + (await page.innerText('#fs-0')));
  const typeTruth = async P => {
    for (let i = 0; i < 5; i++) await page.fill('input[data-fs="' + i + '"]', D(P[i], P[(i + 1) % 5]).toFixed(3));
    const ks = await page.$$eval('input[data-fd]', e => e.map(x => x.dataset.fd));
    for (const k of ks) { const [a, c] = k.split('-').map(Number); await page.fill('input[data-fd="' + k + '"]', D(P[a], P[c]).toFixed(3)); }
    await page.waitForTimeout(250);
  };
  await typeTruth(truth);
  let res = await page.innerText('#fRes');
  ok(/96\.0\d\s*cent/.test(res) && /3,?885/.test(res), 'tape area is 96.0 cent / 3885 sq m: ' + res.replace(/\n/g, ' ').slice(0, 70));
  ok(/GPS \/ map draft/.test(res) && /Trust the tape/.test(res), 'result compares with the GPS / map draft');
  ok(/\+|−/.test(await page.innerText('#fs-1')) && /from the draft/.test(await page.innerText('#fs-1')), 'a good side shows its difference from the draft');

  // check cross
  const ck = truth[chk[0] - 1], ck2 = truth[chk[1] - 1];
  await page.fill('#fChk', D(ck, ck2).toFixed(3)); await page.waitForTimeout(200);
  ok(/measurements agree/.test(await page.innerText('#fCk')), 'the right check cross agrees: ' + (await page.innerText('#fCk')).slice(0, 90));
  await page.fill('#fChk', (D(ck, ck2) + 1.0).toFixed(3)); await page.waitForTimeout(200);
  ok(/A little off/.test(await page.innerText('#fCk')), '1 m out on an 85 m cross gives "a little off"');
  await page.fill('#fChk', (D(ck, ck2) + 4).toFixed(3)); await page.waitForTimeout(200);
  ok(/one tape is wrong/.test(await page.innerText('#fCk')), '4 m out gives "one tape is wrong"');
  await page.fill('#fChk', D(ck, ck2).toFixed(3)); await page.waitForTimeout(200);
  await page.screenshot({ path: TH.shot('fp2_filled.png') });

  // share list
  await page.click('#fShare'); await page.waitForSelector('#shTxt');
  const txt = await page.inputValue('#shTxt');
  ok(/SIDES/.test(txt) && /CROSSES from corner/.test(txt) && /CHECK CROSS/.test(txt) && /Tape readings: 5 sides \+ 2 crosses = 7/.test(txt), 'shared list has sides, crosses and check cross');
  ok(txt.indexOf('______') < 0, 'filled values are in the shared list');
  await page.click('#shClose'); await page.waitForTimeout(200);

  // typed lengths survive closing the app
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#bField'); await page.waitForSelector('#fRes');
  ok((await page.inputValue('input[data-fs="2"]')) === D(truth[2], truth[3]).toFixed(3) && (await page.inputValue('#fChk')) === D(ck, ck2).toFixed(3), 'typed lengths are still there after reopening the app');

  // changing the hub keeps what was typed and asks only for what is missing
  const hub0 = +(await page.inputValue('#fHub')), other = (hub0 + 1) % 5;
  await page.click('#tDia [data-h="' + other + '"]'); await page.waitForSelector('#fHub');
  ok((await page.inputValue('#fHub')) === String(other), 'tapping corner ' + (other + 1) + ' on the picture makes it the hub');
  ok(/needed for 5 corners/.test(await sheetTxt()) && (await page.$$('input[data-fd]')).length === 2, 'still only 2 crosses');
  await page.click('#fBest'); await page.waitForTimeout(250);
  ok(/is best/.test(await page.innerText('#fHint')), 'Suggest the best corner explains itself: ' + (await page.innerText('#fHint')).slice(0, 60));
  await typeTruth(truth);
  ok(/96\.0\d\s*cent/.test(await page.innerText('#fRes')), 'the same area from the new hub');
  const kk = await page.$$eval('input[data-fd]', e => e.map(x => x.dataset.fd)); const chk2 = await page.$eval('#fChk', e => e.previousElementSibling.textContent.match(/(\d) → (\d)/).slice(1).map(Number));
  ok(!kk.includes(Math.min(chk2[0], chk2[1]) - 1 + '-' + (Math.max(chk2[0], chk2[1]) - 1)), 'check cross follows the hub: ' + chk2.join('-'));

  // ---- put on the map, same place
  const before = (await draft()).corners.map(toXY);
  await page.click('#fPut'); await page.waitForSelector('#sheet button:has-text("Replace")');
  ok(/Replace the GPS points/.test(await sheetTxt()), 'asks before replacing the GPS points');
  await choice('Replace'); await page.waitForTimeout(500);
  let d = await draft(); const after = d.corners.map(toXY);
  ok(d.corners.length === 5 && d.corners.every(c => c.src === 'tape'), 'five tape corners now');
  ok(Math.abs(area(after) - area(truth)) < 0.003 * area(truth), 'plot area ' + area(after).toFixed(1) + ' sq m = taped ' + area(truth).toFixed(1));
  ok(after.every((p, i) => Math.abs(D(p, after[(i + 1) % 5]) - D(truth[i], truth[(i + 1) % 5])) < 0.003 * D(truth[i], truth[(i + 1) % 5]) + 0.01), 'every side equals the taped length');
  const cen = P => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
  ok(D(cen(before), cen(after)) < 0.05, 'same spot: the corner centre moved ' + D(cen(before), cen(after)).toFixed(3) + ' m');
  const rms = Math.sqrt(before.reduce((s, p, i) => s + Math.pow(D(p, after[i]), 2), 0) / 5);
  ok(rms < 5, 'corners sit on the draft within ' + rms.toFixed(1) + ' m (the GPS error)');
  ok(sgn(after) === sgn(before) && d.tape && d.tape.mir === false && d.tape.sides.length === 5, 'same turn direction as the draft, tape details stored');
  ok(await page.isVisible('#mapc') && /\d\d\.\d\d cent/.test(await page.innerText('#mpanel')), 'map shows the plot with its area');
  await page.screenshot({ path: TH.shot('fp3_placed.png') });

  // reopen: already tape, can go back to GPS
  await page.click('#mTools'); await page.click('#tField'); await page.waitForSelector('#fRes');
  ok(/already drawn from tape lengths/.test(await sheetTxt()) && await page.isVisible('#fUndo'), 'reopened plan says the plot is drawn from tape and offers the way back');
  await page.click('#fUndo'); await choice('Go back'); await page.waitForTimeout(400);
  d = await draft();
  ok(d.corners.length === 5 && d.corners.every(c => !c.src) && !d.tape && Math.abs(toXY(d.corners[1])[0] - before[1][0]) < 0.01, 'back to the original GPS points');

  // ---- a draft numbered clockwise gets a clockwise tape plot (mirrored)
  const cwTruth = truth.slice().reverse(), cwDraft = draftXY.slice().reverse();
  await page.evaluate(x => localStorage.setItem('lm.draft.v1', JSON.stringify(x)), mkDraft(cwDraft)); await page.reload(); await page.waitForTimeout(500);
  await page.click('nav button[data-tab=measure]'); await page.click('#bField'); await page.waitForSelector('#fRes');
  await typeTruth(cwTruth);
  ok(/96\.0\d\s*cent/.test(await page.innerText('#fRes')), 'clockwise numbering: same area');
  await page.click('#fPut'); await choice('Replace'); await page.waitForTimeout(500);
  d = await draft(); const afterCw = d.corners.map(toXY);
  ok(sgn(afterCw) === sgn(cwDraft) && sgn(cwDraft) < 0 && d.tape.mir === true, 'clockwise draft: the plot is drawn clockwise too (mirror ' + d.tape.mir + ')');
  ok(Math.sqrt(cwDraft.reduce((s, p, i) => s + Math.pow(D(p, afterCw[i]), 2), 0) / 5) < 5, 'and sits on the draft');
  // the tape sheet remembers the mirror choice
  await page.click('#mTools'); await page.click('#tTape'); await page.waitForSelector('#tMir');
  ok(await page.isChecked('#tMir'), 'the tape sheet shows "corners go round clockwise" ticked'); await page.click('#tX');

  // ---- weak GPS: warning before capturing
  const weak = async acc => {
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: acc } });
    await c2.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
    await c2.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} });
    const p2 = await c2.newPage(); await p2.goto('http://localhost:8786/'); await p2.waitForTimeout(400);
    await p2.waitForFunction(() => /±/.test(document.querySelector('#gpsChip').textContent), null, { timeout: 8000 });
    await TH.startWay(p2, 'gps'); await p2.click('#bCap'); await p2.waitForTimeout(400);
    const r = { sheet: await p2.innerText('#sheet').catch(() => ''), open: await p2.evaluate(() => document.querySelector('#ov').classList.contains('on')), cap: !!(await p2.$('#capbar')), p2, c2 };
    return r;
  };
  let w = await weak(12);
  ok(w.open && /GPS is weak/.test(w.sheet) && /12/.test(w.sheet), 'GPS at ±12 m: capture asks first (' + w.sheet.replace(/\n/g, ' ').slice(0, 60) + ')');
  await w.p2.click('#sheet button:has-text("Capture anyway")'); await w.p2.waitForTimeout(400);
  ok(!!(await w.p2.$('#capbar')), '"Capture anyway" starts the capture');
  await w.c2.close();
  w = await weak(12);
  await w.p2.click('#sheet button:has-text("Place on the map")'); await w.p2.waitForTimeout(500);
  ok(await w.p2.isVisible('#mapc'), '"Place on the map" opens the satellite map');
  await w.c2.close();
  w = await weak(3);
  ok(!w.open && w.cap, 'GPS at ±3 m: capture starts at once, no warning');
  await w.c2.close();

  // ---- clearer picture: more contrast
  await page.click('nav button[data-tab=map]'); await page.waitForSelector('#mapc'); await page.waitForTimeout(500);
  await page.click('#mLay'); await page.waitForSelector('#mClr', { state: 'visible' }); await page.click('#mLay'); await page.waitForTimeout(300);
  const shotStd = async n => { const f = TH.shot(n); await page.screenshot({ path: f, clip: { x: 0, y: 120, width: 390, height: 300 } });
    return +execFileSync('python3', ['-c', 'import sys;from PIL import Image,ImageStat;im=Image.open(sys.argv[1]).convert("L");print(ImageStat.Stat(im).stddev[0])', f]).toString(); };
  const s0 = await shotStd('fp_clear0.png');
  await page.click('#mLay'); await page.click('#mClr'); await page.click('#mLay'); await page.waitForTimeout(500);
  const s1 = await shotStd('fp_clear1.png');
  ok(s1 > s0 * 1.05, 'Clearer picture raises the contrast of the satellite map (' + s0.toFixed(1) + ' -> ' + s1.toFixed(1) + ')');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('lm.map.v1')).clear === true), 'the choice is remembered');
  ok(errs.length === 0, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL exception: ' + e.message.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; srv.close(); });
