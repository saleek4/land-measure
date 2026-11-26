const TH = require('./helpers'); const chromium = TH.chromium;
const http = require('http'), fs = require('fs');
const srv = http.createServer((q, r) => { if (q.url.indexOf('sw.js') >= 0) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(TH.root + '/index.html')); }).listen(8785);
const tile = fs.readFileSync(TH.fixture('tile.png'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// ---- mock Firebase (Identity Toolkit, securetoken, Firestore REST)
const DB = { users: {}, docs: {}, refreshes: 0, signins: 0, reqs401: 0, fail401Once: false, oob: [], pageSize: 2, patches: 0 };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const uidOf = (tok) => { const m = /^id-(u\d+)-/.exec(tok || ''); return m && m[1]; };
let tokN = 0;
async function firebase(route) {
  const rq = route.request(), u = new URL(rq.url()), m = rq.method();
  const js = (st, o) => route.fulfill({ status: st, contentType: 'application/json', headers: CORS, body: JSON.stringify(o) });
  if (DB.offline) return route.abort('internetdisconnected');
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (u.host.startsWith('identitytoolkit')) {
    const ep = u.pathname.split(':').pop(), b = JSON.parse(rq.postData() || '{}');
    if (u.searchParams.get('key') !== 'KEY1') return js(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    if (ep === 'signUp') { if (DB.users[b.email]) return js(400, { error: { message: 'EMAIL_EXISTS' } }); if ((b.password || '').length < 6) return js(400, { error: { message: 'WEAK_PASSWORD : Password should be at least 6 characters' } }); const uid = 'u' + (Object.keys(DB.users).length + 1); DB.users[b.email] = { pw: b.password, uid }; DB.docs[uid] = {}; return js(200, { idToken: 'id-' + uid + '-' + (++tokN), refreshToken: 'rf-' + uid, localId: uid, email: b.email, expiresIn: '3600' }); }
    if (ep === 'signInWithPassword') { const us = DB.users[b.email]; DB.signins++; if (!us || us.pw !== b.password) return js(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }); return js(200, { idToken: 'id-' + us.uid + '-' + (++tokN), refreshToken: 'rf-' + us.uid, localId: us.uid, email: b.email, expiresIn: '3600' }); }
    if (ep === 'sendOobCode') { DB.oob.push(b); return js(200, { email: b.email }); }
  }
  if (u.host.startsWith('securetoken')) {
    const p = new URLSearchParams(rq.postData() || ''), rt = p.get('refresh_token'); DB.refreshes++;
    const uid = /^rf-(u\d+)$/.exec(rt || ''); if (!uid) return js(400, { error: { message: 'INVALID_REFRESH_TOKEN' } });
    return js(200, { id_token: 'id-' + uid[1] + '-' + (++tokN), refresh_token: rt, expires_in: '3600', user_id: uid[1] });
  }
  if (u.host.startsWith('firestore')) {
    const auth = (rq.headers()['authorization'] || '').replace('Bearer ', ''), uid = uidOf(auth);
    const mm = /\/users\/([^/]+)\/plots(?:\/([^/?]+))?$/.exec(u.pathname);
    if (!uid) return js(401, { error: { status: 'UNAUTHENTICATED' } });
    if (DB.fail401Once) { DB.fail401Once = false; DB.reqs401++; return js(401, { error: { status: 'UNAUTHENTICATED' } }); }
    if (!mm || mm[1] !== uid) return js(403, { error: { status: 'PERMISSION_DENIED' } });
    const docs = DB.docs[uid];
    if (m === 'GET') {
      const ids = Object.keys(docs).sort(), start = +(u.searchParams.get('pageToken') || 0), page = ids.slice(start, start + DB.pageSize), next = start + DB.pageSize < ids.length ? String(start + DB.pageSize) : undefined;
      return js(200, { documents: page.map(id => ({ name: 'projects/P/databases/(default)/documents/users/' + uid + '/plots/' + id, fields: { json: { stringValue: docs[id].json }, upd: { integerValue: String(docs[id].upd) }, del: { booleanValue: docs[id].del } } })), nextPageToken: next });
    }
    if (m === 'PATCH') { const f = JSON.parse(rq.postData()).fields; docs[mm[2]] = { json: f.json.stringValue, upd: +f.upd.integerValue, del: !!f.del.booleanValue }; DB.patches++; return js(200, { name: 'x' }); }
  }
  return route.fulfill({ status: 404, headers: CORS, body: '{}' });
}
(async () => {
  const b = await chromium.launch(TH.launchOpts());
  const mkPhone = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    await ctx.route('**/server.arcgisonline.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
    await ctx.route(/(identitytoolkit|securetoken|firestore)\.googleapis\.com/, firebase);
    await ctx.addInitScript(() => { window.LM_FB = { apiKey: 'KEY1', projectId: 'P' }; try { if (!localStorage.getItem('lm.map.v1')) localStorage.setItem('lm.map.v1', JSON.stringify({ lat: 11.05, lon: 76.07, zoom: 18, fill: 0.12, labels: true, sides: true, saved: true, add: 'tap', loupe: true })); } catch (e) {} });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto('http://localhost:8785/'); await page.waitForTimeout(400);
    return { ctx, page, errs };
  };
  const mk = async (page, name, w, h) => {
    await page.click('nav button[data-tab=measure]'); await page.waitForSelector('#bTape'); await page.click('#bTape'); await page.waitForSelector('#tN');
    await page.selectOption('#tN', { value: '4' });
    const sd = [w, h, w, h]; for (let i = 0; i < 4; i++) await page.fill('input[data-s="' + i + '"]', String(sd[i]));
    await page.fill('input[data-d="0-2"]', Math.hypot(w, h).toFixed(3)); await page.waitForTimeout(200);
    await page.click('#tPlace'); await page.waitForTimeout(600);
    if (await page.isVisible('#sheet button.danger')) { await page.click('#sheet button.danger'); await page.waitForTimeout(500); }
    await page.waitForSelector('#mSave'); await page.click('#mSave'); await page.waitForSelector('#sN'); await page.fill('#sN', name); await page.click('#sOk'); await page.waitForTimeout(500);
  };
  const names = (page) => page.$$eval('.plotitem b', e => e.map(x => x.textContent));
  const tab = async (page, t) => { await page.click('nav button[data-tab=' + t + ']'); await page.waitForTimeout(250); };
  const remote = (uid) => Object.values(DB.docs[uid] || {}).filter(d => !d.del).map(d => JSON.parse(d.json).name).sort();

  // ===== phone A
  const A = await mkPhone(); let page = A.page;
  await tab(page, 'more');
  ok(await page.isVisible('#acE') && /Account and cloud backup/i.test(await page.innerText('#app')), 'More tab shows the email sign-in form');
  await page.screenshot({ path: TH.shot('cl1_signin.png') });
  await page.fill('#acE', 'a@b.com'); await page.fill('#acP', '123'); await page.click('#acUp'); await page.waitForTimeout(400);
  ok(/at least 6 characters/.test(await page.innerText('#acMsg')), 'short password is explained');
  await page.fill('#acP', 'secret1'); await page.click('#acUp'); await page.waitForSelector('#acSync'); await page.waitForTimeout(300);
  ok(/Signed in as\s+a@b\.com/.test(await page.innerText('#app')) && /Synced just now/.test(await page.innerText('#acMsg')), 'account created and signed in: ' + (await page.innerText('#acMsg')));
  await page.screenshot({ path: TH.shot('cl2_signedin.png') });
  await tab(page, 'more'); await page.click('#acOut'); await page.click('#sheet button.danger'); await page.waitForTimeout(250);
  await page.fill('#acE', 'a@b.com'); await page.fill('#acP', 'wrong'); await page.click('#acIn'); await page.waitForTimeout(400);
  ok(/Wrong email or password/.test(await page.innerText('#acMsg')), 'wrong password is reported');
  await page.fill('#acE', 'x@y.com'); await page.fill('#acP', 'secret1'); await page.click('#acUp'); await page.waitForTimeout(300);
  await tab(page, 'more'); await page.click('#acOut'); await page.click('#sheet button.danger'); await page.waitForTimeout(250);
  await page.fill('#acE', 'a@b.com'); await page.fill('#acP', 'secret1'); await page.click('#acIn'); await page.waitForSelector('#acSync'); await page.waitForTimeout(300);
  ok(/Signed in as\s+a@b\.com/.test(await page.innerText('#app')), 'signed in again with the right password');
  await page.click('#acOut'); await page.click('#sheet button.cancel, #sheet button:not(.danger)'); await page.waitForTimeout(200);
  ok(await page.isVisible('#acSync'), '"Stay signed in" keeps the session');
  await page.fill ? 0 : 0;
  // forgot password
  // (needs the signed-out form) -> tested after sign out below
  // save a plot: auto sync, no backup pop-up
  await mk(page, 'Plot A', 40, 25);
  ok(!/Back up your plots\?/.test(await page.innerText('#sheet')), 'no file-backup pop-up when signed in');
  await sleep(2600);
  ok(JSON.stringify(remote('u1')) === JSON.stringify(['Plot A']), 'saving a plot sent it to the cloud: ' + JSON.stringify(remote('u1')));
  // ===== phone B
  const B = await mkPhone(); const pb = B.page;
  await tab(pb, 'more'); await pb.fill('#acE', 'a@b.com'); await pb.fill('#acP', 'secret1'); await pb.click('#acIn'); await pb.waitForSelector('#acSync'); await pb.waitForTimeout(500);
  await tab(pb, 'plots'); ok(JSON.stringify(await names(pb)) === JSON.stringify(['Plot A']), 'a second phone gets Plot A after signing in');
  const lsB = await pb.evaluate(() => JSON.parse(localStorage.getItem('lm.plots.v1'))); ok(lsB[0].corners.length === 4 && lsB[0].tape && lsB[0].tape.hub === 0, 'the plot arrives complete (corners and tape data)');
  // delete on B -> A loses it
  await pb.click('.plotitem'); await pb.waitForSelector('#bDel'); await pb.click('#bDel'); ok(/from your account/.test(await pb.innerText('#sheet')), 'delete warning mentions the account'); await pb.click('#sheet button.danger'); await pb.waitForTimeout(300); await sleep(2400);
  ok(remote('u1').length === 0 && Object.values(DB.docs.u1).some(d => d.del), 'deleting leaves a "deleted" note in the cloud');
  await page.reload(); await page.waitForTimeout(2200); await tab(page, 'plots');
  ok((await names(page)).length === 0, 'the first phone removes the deleted plot on its next sync');
  // wipe = icon deleted; restore by signing in
  await mk(page, 'Plot C', 30, 20); await sleep(2600);
  ok(JSON.stringify(remote('u1')) === JSON.stringify(['Plot C']), 'Plot C in the cloud');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500); await tab(page, 'plots');
  ok((await names(page)).length === 0 && !/Back up your plots/.test(await page.innerText('#app')) , 'after the wipe: empty list');
  await tab(page, 'more'); await page.fill('#acE', 'a@b.com'); await page.fill('#acP', 'secret1'); await page.click('#acIn'); await page.waitForSelector('#acSync'); await page.waitForTimeout(400);
  await tab(page, 'plots'); ok(JSON.stringify(await names(page)) === JSON.stringify(['Plot C']), 'signing in again brings the plots back: ' + JSON.stringify(await names(page)));
  // newer remote wins
  const d1 = DB.docs.u1, idC = Object.keys(d1).find(k => !d1[k].del), jc = JSON.parse(d1[idC].json); jc.name = 'Plot C (edited elsewhere)';
  DB.docs.u1[idC] = { json: JSON.stringify(jc), upd: Date.now() + 5000, del: false };
  await tab(page, 'more'); await page.click('#acSync'); await page.waitForTimeout(700); await tab(page, 'plots');
  ok(JSON.stringify(await names(page)) === JSON.stringify(['Plot C (edited elsewhere)']), 'a newer copy from the cloud replaces the local one');
  // older remote loses
  DB.docs.u1[idC] = { json: JSON.stringify({ ...jc, name: 'OLD' }), upd: 5, del: false };
  await tab(page, 'more'); await page.click('#acSync'); await page.waitForTimeout(700);
  ok(JSON.parse(DB.docs.u1[idC].json).name === 'Plot C (edited elsewhere)', 'an older cloud copy is overwritten by the newer local one');
  // pagination (pageSize 2)
  for (let i = 0; i < 5; i++) DB.docs.u1['zz' + i] = { json: JSON.stringify({ id: 'zz' + i, name: 'Z' + i, ts: 1000 + i, upd: 1000 + i, mode: 'corners', corners: [{ lat: 11, lon: 76, acc: 1 }, { lat: 11.001, lon: 76, acc: 1 }, { lat: 11, lon: 76.001, acc: 1 }], holes: [], area: 100, per: 10, sig: 1, src: 'map' }), upd: 1000 + i, del: false };
  await tab(page, 'more'); await page.click('#acSync'); await page.waitForTimeout(900); await tab(page, 'plots');
  ok((await names(page)).length === 6, 'all pages are read from the cloud (6 plots): ' + (await names(page)).length);
  // token expired -> refresh; 401 once -> retry
  await page.evaluate(() => { const u = JSON.parse(localStorage.getItem('lm.acct.v1')); u.exp = 0; localStorage.setItem('lm.acct.v1', JSON.stringify(u)); });
  await page.reload(); await page.waitForTimeout(2200);
  ok(DB.refreshes >= 1, 'an expired token is refreshed (' + DB.refreshes + ')');
  const r0 = DB.refreshes; DB.fail401Once = true; await tab(page, 'more'); await page.click('#acSync'); await page.waitForTimeout(900);
  ok(DB.reqs401 === 1 && DB.refreshes === r0 + 1 && /Synced just now/.test(await page.innerText('#acMsg')), 'a 401 from the cloud triggers one refresh and a retry');
  // offline, then online
  DB.offline = true; await A.ctx.setOffline(true); await mk(page, 'Plot D', 25, 25); await sleep(2200); await tab(page, 'more');
  ok(/No internet/.test(await page.innerText('#acMsg')) && /Changes wait on this phone/.test(await page.innerText('#acMsg')), 'offline: the plot is kept and the status says so: ' + (await page.innerText('#acMsg')).replace(/\n/g, ' '));
  await tab(page, 'plots'); await page.screenshot({ path: TH.shot('cl3_waiting.png') }); ok(/Waiting to sync/.test(await page.innerText('#app')), 'Plots tab shows that a plot waits to sync');
  DB.offline = false; await A.ctx.setOffline(false); await sleep(3500);
  ok(remote('u1').includes('Plot D'), 'back online: the waiting plot is sent without any tap');
  await tab(page, 'plots'); ok(!/Waiting to sync/.test(await page.innerText('#app')), 'the waiting notice is gone');
  // sign out then forgot password
  await tab(page, 'more'); await page.click('#acOut'); await page.click('#sheet button.danger'); await page.waitForTimeout(250);
  await tab(page, 'plots'); ok((await names(page)).length >= 7, 'sign out keeps the plots on the phone (' + (await names(page)).length + ')');
  ok(/Sign in to save in your account/.test(await page.innerText('#app')), 'signed-out Plots tab offers to sign in');
  await tab(page, 'more'); await page.fill('#acE', ''); await page.click('#acForgot'); await page.waitForTimeout(200); ok(/Type your email first/.test(await page.innerText('#acMsg')), 'forgot password asks for the email');
  await page.fill('#acE', 'a@b.com'); await page.click('#acForgot'); await page.waitForTimeout(400); ok(DB.oob.length === 1 && DB.oob[0].requestType === 'PASSWORD_RESET', 'password reset email requested');
  ok(A.errs.length === 0 && B.errs.length === 0, 'no JS errors ' + A.errs.concat(B.errs).join('|'));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
