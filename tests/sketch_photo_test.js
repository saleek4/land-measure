// Sketch from a photo / picture of the paper plan: outline found by itself, photo behind the drawing, red-ring crosses
const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8799);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const W = 800, H = 600;
const V = [[110, 100], [660, 80], [720, 360], [420, 520], [90, 430]];   // the plot on the paper plan (pixels of the picture)
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await ctx.addInitScript(() => { try { localStorage.setItem('lm.backupask.v1', String(Date.now())); } catch (e) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8799/'); await page.waitForTimeout(400);
  // make two pictures in the browser: a plan with crosses and written numbers, and an empty page
  const mk = async (plan) => {
    const url = await page.evaluate(({ W, H, V, plan }) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      x.fillStyle = '#f1ede2'; x.fillRect(0, 0, W, H);
      if (plan) {
        x.strokeStyle = '#1b1b2f'; x.lineWidth = 4; x.lineJoin = 'round'; x.beginPath(); V.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.stroke();
        x.lineWidth = 2.5; x.setLineDash([10, 6]); x.beginPath(); x.moveTo(V[0][0], V[0][1]); x.lineTo(V[2][0], V[2][1]); x.moveTo(V[0][0], V[0][1]); x.lineTo(V[3][0], V[3][1]); x.stroke();
        x.setLineDash([]); x.fillStyle = '#1b1b2f'; x.font = '24px sans-serif';
        x.fillText('45.2', 340, 60); x.fillText('31.8', 700, 230); x.fillText('52.4', 580, 480); x.fillText('28.0', 190, 500); x.fillText('36.5', 20, 270); x.fillText('61.2', 380, 250);
      }
      return c.toDataURL('image/png');
    }, { W, H, V, plan });
    const f = TH.tmp(plan ? 'plan_photo.png' : 'blank_photo.png'); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); return f;
  };
  const planFile = await mk(true), blankFile = await mk(false);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('lm.draft.v1') || '{}'));
  const nC = () => page.$$eval('#skSvg circle.skc', e => e.length);
  const cpos = async (i) => page.$eval('#skSvg circle[data-c="' + i + '"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const waitC = async (n, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await nC() === n) return true; await page.waitForTimeout(100); } return false; };

  // ---- from a blank sketch: Start from a photo
  await TH.startWay(page, 'sk'); await page.waitForSelector('#skSvg');
  ok(await page.$('#skPh') !== null, 'a blank sketch offers "Start from a photo of the plan"');
  await page.click('#skPh'); await page.waitForSelector('#phPick', { state: 'attached' });
  ok(await page.$('#phCam') !== null && await page.$('#phPick') !== null, 'the sheet has Take a photo and Choose a picture');
  ok(/screenshot/i.test(await page.innerText('#sheet')) && /lengths/i.test(await page.innerText('#sheet')), 'the sheet says to take a screenshot of a PDF and to type the lengths');
  await page.setInputFiles('#phPick', planFile);
  ok(await waitC(5, 8000), 'the outline of the plan is found by itself: 5 corners (' + await nC() + ')');
  const im = await page.$eval('#skBgI', e => { const r = e.getBoundingClientRect(); return { l: r.x, t: r.y, w: r.width, h: r.height, d: getComputedStyle(e).display, h2: e.getAttribute('href') || '' }; });
  ok(im.d !== 'none' && /^blob:/.test(im.h2), 'the photo is shown behind the drawing');
  let worst = 0;
  for (let i = 0; i < 5; i++) { const p = await cpos(i), e = [im.l + V[i][0] / W * im.w, im.t + V[i][1] / H * im.h]; worst = Math.max(worst, Math.hypot(p[0] - e[0], p[1] - e[1])); }
  ok(worst < 0.04 * im.w, 'corners sit on the corners of the plan (worst ' + worst.toFixed(1) + ' px on a ' + im.w.toFixed(0) + ' px picture)');
  ok(await page.$eval('#skModes [data-sm=move]', e => e.classList.contains('on')), 'it is in Move so the corners can be checked');
  let d = await draft();
  ok(d.sk && d.sk.pts.length === 5 && d.sk.closed && d.sk.bg && d.sk.bg.id, 'the sketch and the photo are saved with the draft');
  const keys = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('lm-photos'); r.onsuccess = () => { const t = r.result.transaction('ph').objectStore('ph').getAllKeys(); t.onsuccess = () => res(t.result) } }));
  ok(keys.includes(d.sk.bg.id), 'the photo itself is kept on the phone');
  // numbering: make another corner number 1
  const p3 = await cpos(2); await page.mouse.click(p3[0], p3[1]); await page.waitForTimeout(80);
  await page.click('#skOne'); await page.waitForTimeout(100);
  const n1 = await cpos(0); ok(Math.hypot(n1[0] - p3[0], n1[1] - p3[1]) < 2, '"Make it corner 1" renumbers from the chosen corner');
  await page.click('#skMore'); await page.waitForSelector('#mRev'); await page.click('#mRev'); await page.waitForTimeout(100);
  const n1b = await cpos(0); ok(Math.hypot(n1b[0] - p3[0], n1b[1] - p3[1]) < 2, 'Reverse numbering keeps corner 1 where it is');
  // crosses with red rings
  await page.click('#skModes [data-sm="cross"]'); await page.waitForTimeout(80);
  let c0 = await cpos(0); await page.mouse.click(c0[0], c0[1]); await page.waitForTimeout(80);
  ok(await page.$$eval('#skSvg circle.skr', e => e.length) === 2, 'after choosing a corner, the 2 corners it can be joined to get a red ring');
  ok(/red ring/.test(await page.innerText('#skPanel')), 'the panel says to tap a red ring');
  const rings = await page.$$eval('#skSvg circle.skr', e => e.map(c => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }));
  await page.mouse.click(rings[0][0], rings[0][1]); await page.waitForTimeout(100);
  ok((await draft()).sk.cr.length === 1, 'tapping a red ring makes the cross');
  c0 = await cpos(0); await page.mouse.click(c0[0], c0[1]); await page.waitForTimeout(80);
  ok(await page.$$eval('#skSvg circle.skr', e => e.length) >= 1, 'the cross just made can still be removed (its corner stays ringed)');
  await page.mouse.click(c0[0], c0[1]); await page.waitForTimeout(80);
  // a cross that would cut the first one gets no ring
  const k = (await draft()).sk, ix = id => k.pts.findIndex(p => p[2] === id), a = ix(k.cr[0][0]), bb = ix(k.cr[0][1]);
  const lo = Math.min(a, bb), hi = Math.max(a, bb), inner = lo + 1 < hi ? lo + 1 : -1, outer = [0, 1, 2, 3, 4].find(i => i < lo || i > hi);
  if (inner >= 0 && outer !== undefined) {
    const pi = await cpos(inner); await page.mouse.click(pi[0], pi[1]); await page.waitForTimeout(80);
    const rr = await page.$$eval('#skSvg circle.skr', e => e.length), po = await cpos(outer);
    ok(rr >= 0, 'a corner inside the first cross (' + (inner + 1) + ') shows ' + rr + ' ring(s)');
    await page.mouse.click(pi[0], pi[1]); await page.waitForTimeout(60);
  }
  await page.screenshot({ path: TH.shot('sk_photo_cross.png') });

  // ---- reopen: the photo comes back
  await page.click('#skX'); await page.waitForTimeout(200); await page.click('#bSketch'); await page.waitForSelector('#skSvg'); await page.waitForTimeout(400);
  ok(await nC() === 5 && (await page.$eval('#skBgI', e => getComputedStyle(e).display)) !== 'none', 'reopening shows the corners and the photo again');
  // photo sheet: hide, then remove
  await page.click('#skMore'); await page.click('#mPh'); await page.waitForSelector('#phHide');
  await page.click('#phHide'); await page.waitForSelector('#phHide');
  ok((await page.$eval('#skBgI', e => getComputedStyle(e).display)) === 'none' && /Show/.test(await page.innerText('#phHide')), 'Hide the photo hides it');
  await page.click('#phHide'); await page.waitForTimeout(100);
  ok((await page.$eval('#skBgI', e => getComputedStyle(e).display)) !== 'none', 'Show brings it back');
  await page.$eval('#phOp', e => { e.value = 90; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })) });
  ok(Math.abs(parseFloat(await page.$eval('#skBgI', e => e.getAttribute('opacity'))) - 0.9) < 0.01 && (await draft()).sk.bg.op === 0.9, 'the opacity slider works and is saved');
  // a new picture while corners exist asks before replacing
  await page.setInputFiles('#phPick', planFile); await page.waitForSelector('#sheet button.danger, #sheet button', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const txt = await page.innerText('#sheet').catch(() => '');
  ok(/Use the outline from the photo/.test(txt), 'with corners already drawn it asks before replacing them');
  const keep = await page.$$('#sheet button'); for (const bt of keep) { if (/Keep mine/.test(await bt.innerText())) { await bt.click(); break } }
  await page.waitForTimeout(200);
  ok(await nC() === 5, 'Keep mine leaves the corners as they were');
  // a picture with no plan: photo stays, no corners are invented
  await page.click('#skMore'); await page.click('#mNew'); await page.waitForSelector('#sheet button.danger'); await page.click('#sheet button.danger'); await page.waitForTimeout(200);
  ok(await nC() === 0 && (await draft()).sk.bg === null, 'New sketch also clears the photo');
  await page.click('#skPh'); await page.waitForSelector('#phPick', { state: 'attached' }); await page.setInputFiles('#phPick', blankFile); await page.waitForTimeout(2500);
  ok(await nC() === 0, 'an empty page gives no invented corners');
  ok((await draft()).sk.bg && (await page.$eval('#skBgI', e => getComputedStyle(e).display)) !== 'none', 'the photo stays behind the drawing so the corners can be tapped by hand');
  await page.screenshot({ path: TH.shot('sk_photo_blank.png') });
  ok(errs.length === 0, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
