// Builds index.html (what GitHub Pages serves) from src/index.src.html.
// The source holds a __ICON__ placeholder; the app icon (base64 PNG) lives in src/icon.b64.
const fs = require('fs'), path = require('path');
const root = __dirname;
const src = fs.readFileSync(path.join(root, 'src', 'index.src.html'), 'utf8');
const icon = fs.readFileSync(path.join(root, 'src', 'icon.b64'), 'utf8').trim();
if (src.indexOf('__ICON__') < 0) { console.error('build: __ICON__ placeholder not found in src/index.src.html'); process.exit(1); }
const out = src.split('__ICON__').join(icon);
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('built index.html (' + Buffer.byteLength(out) + ' bytes)');
