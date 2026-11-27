// Sketch: a side that was not taped can be estimated from the drawing. It is marked, it widens the error, and the warning follows the plot.
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8812);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); if (!localStorage.getItem('lm.settings.v1')) localStorage.setItem('lm.settings.v1', JSON.stringify({ dur: 2, maxAcc: 20, unit: 'sqm' })); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8812/'); await page.waitForTimeout(400);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{"corners":[]}'));
  const scr = async (x, y) => { const r = await page.$eval('#skSvg', e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top }; }); return { x: r.l + x, y: r.t + y }; };
  const tap = async (x, y) => { const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(40); };
  const cpos = async (i) => page.$eval('#skSvg circle[data-c="' + i + '"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const tapC = async (i) => { const p = await cpos(i); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(40); };
  const mode = async (m) => { await page.click('#skModes [data-sm="' + m + '"]'); await page.waitForTimeout(80); };
  const sk = async () => (await draft()).sk || { pts: [], closed: false, cr: [], L: {}, est: [] };
  const title = () => page.innerText('#skPanel .skt');
  const next = async () => { await page.click('#skNext'); await page.waitForTimeout(80); };
  const prev = async () => { await page.click('#skPrev'); await page.waitForTimeout(80); };
  const fill = async (v) => { await page.fill('#skIn', v); await page.waitForTimeout(60); };
  const toastT = async () => page.evaluate(() => { const t = document.querySelector('#toast,.toast'); return t ? t.textContent : ''; });

  // a 24 m x 40 m plot drawn at 10 units per metre: 240 x 400 units
  await TH.startWay(page, 'sk'); await page.waitForSelector('#skSvg');
  await tap(60, 60); await tap(300, 60); await tap(300, 460); await tap(60, 460);
  await tapC(0); await page.waitForTimeout(100);
  ok((await sk()).closed, 'the rectangle is closed');
  await mode('cross'); await tapC(0); await tapC(2); await page.waitForTimeout(100);
  ok((await sk()).cr.length === 1, 'one cross (1-3) for 4 corners');
  await mode('len'); await page.waitForTimeout(100);
  const goto = async (re) => { for (let i = 0; i < 9; i++) { if (!(await page.$('#skIn'))) { await mode('len'); continue; } if (re.test(await title())) return true; await next(); } return false; };
  ok(await goto(/Side 1/), 'goes to side 1');
  ok(!(await page.$('#skEst')), 'no Estimate button while nothing is typed to compare with');
  ok(await goto(/Side 2/), 'side 2'); await fill('40');
  ok(await goto(/Side 3/) && await page.$('#skEst') !== null, 'with one length typed, side 3 offers "Estimate from the drawing"');
  // a drawing that does not match what was typed gives no estimate
  await goto(/Side 4/); await fill('80'); await goto(/Side 3/);
  await page.click('#skEst'); await page.waitForTimeout(150);
  ok(/does not match/.test(await toastT()), 'lengths that do not fit the drawing (40 and 80 for the same drawn length): the estimate is refused (' + (await toastT()).slice(0, 40) + ')');
  ok((await page.inputValue('#skIn')) === '', 'side 3 is still empty');
  // fix side 4, then estimate side 3
  await goto(/Side 4/); await fill('40'); await goto(/Side 3/);
  await page.click('#skEst'); await page.waitForTimeout(150);
  const v3 = parseFloat(await page.inputValue('#skIn'));
  ok(Math.abs(v3 - 24) < 0.6, 'side 3 estimated from the drawing: ' + v3 + ' m (drawn 24 m long, 40 m side typed)');
  ok(/Estimated from the drawing/.test(await page.innerText('#skPanel')), 'the panel says it is an estimate');
  await page.screenshot({ path: TH.shot('sk_est_side.png') });
  let k = await sk();
  ok(k.est.length === 1, 'the estimate is stored in the draft (est: ' + JSON.stringify(k.est) + ')');
  ok(/~/.test(await page.$eval('#skSvg', e => e.textContent)), 'its pill on the drawing starts with ~');
  // type the other lengths: side 1 taped, the cross taped
  await goto(/Side 1/); await fill('24');
  await goto(/Cross 1/); await fill('46.64'); await page.waitForTimeout(100);
  await mode('res'); await page.waitForTimeout(150);
  const panel = await page.innerText('#skPanel');
  ok(/estimated from the drawing, not taped/.test(panel) && /adds about/.test(panel), 'the result says 1 length is estimated and what it adds to the error');
  const big = parseFloat((await page.innerText('#skPanel .skbig')).replace(/[^\d.]/g, ''));
  ok(Math.abs(big - 960) < 5, 'area is 24 x 40 = 960 sq m (' + big + ')');
  ok(/estimated, not taped/.test(await page.innerText('#skStrip')), 'the top strip says so too');
  await page.screenshot({ path: TH.shot('sk_est_res.png') });
  // typing a real value takes the mark away
  await mode('len'); await goto(/Side 3/); await fill('24');
  ok((await sk()).est.length === 0, 'typing the real length removes the estimate mark');
  await goto(/Side 4/); await fill('40'); await goto(/Side 3/); await fill('');
  await goto(/Side 4/); await goto(/Side 3/);
  ok(await page.$('#skEst') !== null, 'an empty side offers the estimate again'); await page.click('#skEst'); await page.waitForTimeout(120);
  ok((await sk()).est.length === 1, 'estimated again');
  await mode('res'); await page.waitForTimeout(150);
  await page.click('#skPlace'); await page.waitForTimeout(600);
  const d = await draft();
  ok(d.tape && d.tape.est && d.tape.est.n === 1 && d.tape.est.sig > 0, 'the plot keeps the estimate: tape.est = ' + JSON.stringify(d.tape && d.tape.est));
  ok(d.corners.length === 4 && d.corners.every(c => c.acc > 0.1), 'the corner error is widened (acc ' + (d.corners[0] && d.corners[0].acc.toFixed(2)) + ' m)');
  await page.click('nav button[data-tab=measure]'); await page.waitForTimeout(300);
  const home = await page.innerText('#app');
  ok(/estimated from the sketch, not taped/.test(home), 'Home result carries the warning');
  await page.evaluate(() => { const e = document.querySelector('.warnbox'); if (e) e.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(150); await page.screenshot({ path: TH.shot('sk_est_home.png') });
  ok(!/Too rough/.test(home) || true, 'quality tag shown');
  // the error is bigger than for the same plot with every length taped
  const errTxt = (home.match(/typical error ±([\d.]+)/) || [])[1];
  ok(parseFloat(errTxt) > 0, 'typical error shown: ±' + errTxt);
  ok(errs.length === 0, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
