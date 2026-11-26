// Runs every test in this folder (node tests first, then browser tests) and prints a summary.
// Usage: node tests/run_all.js [name-filter]      (rebuilds index.html first)
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const b = spawnSync(process.execPath, [path.join(root, 'build.js')], { stdio: 'inherit' });
if (b.status) process.exit(b.status);
const filter = process.argv[2] || '';
const all = fs.readdirSync(__dirname).filter(f => /^(test_.*|.*_test2?)\.js$/.test(f) && f.indexOf(filter) >= 0);
all.sort((a, b2) => (a.startsWith('test_') ? 0 : 1) - (b2.startsWith('test_') ? 0 : 1) || a.localeCompare(b2));
let bad = 0, pass = 0, fail = 0;
for (const f of all) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: root, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const p = (out.match(/^PASS /gm) || []).length, fl = (out.match(/^FAIL /gm) || []).length;
  pass += p; fail += fl;
  const okRun = r.status === 0 && fl === 0;
  if (!okRun) { bad++; console.log(out.split('\n').filter(l => /^FAIL|Error|error/.test(l)).slice(0, 12).join('\n')); }
  console.log((okRun ? 'ok   ' : 'FAIL ') + f.padEnd(18) + p + ' pass' + (fl ? ', ' + fl + ' fail' : ''));
}
console.log('\n' + (bad ? bad + ' test file(s) FAILED' : 'ALL TEST FILES PASSED') + '  (' + pass + ' checks passed, ' + fail + ' failed)');
process.exit(bad ? 1 : 0);
