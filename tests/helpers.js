// Shared test helpers. Tests are run from anywhere; paths are resolved from the repo root.
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(__dirname, '..');
function loadPlaywright() {
  const tries = ['playwright', 'playwright-core', '/opt/npm-tools/node_modules/playwright'];
  for (const t of tries) { try { return require(t); } catch (e) { /* try next */ } }
  throw new Error('Playwright not found. Run "npm install" in the repo root (or set it up globally).');
}
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const c = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find(p => fs.existsSync(p));
}
const shots = path.join(__dirname, 'shots');
module.exports = {
  root,
  get chromium() { return loadPlaywright().chromium; },
  launchOpts() {
    const o = { args: ['--no-sandbox'] };
    const p = chromePath();
    if (p) o.executablePath = p; // otherwise Playwright's own bundled Chromium
    return o;
  },
  // Home > "Measure a new plot" > pick a way: 'gps' | 'map' | 'sk' | 'photo' | 'tape'
  async startWay(page, m) {
    await page.click('nav button[data-tab=measure]'); await page.waitForTimeout(100);
    await page.click('#bNewPlot'); await page.waitForSelector('#sheet button[data-m]');
    if (m === 'sk' || m === 'photo' || m === 'tape') { await page.click('#sheet button[data-m=plan]'); await page.waitForSelector('#sheet button[data-m=' + m + ']'); }
    await page.click('#sheet button[data-m=' + m + ']');
  },
  fixture: n => path.join(__dirname, 'fixtures', n),
  shot: n => { fs.mkdirSync(shots, { recursive: true }); return path.join(shots, n); },
  tmp: n => path.join(os.tmpdir(), n),
};
