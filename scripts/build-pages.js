/** Package only public frontend assets; never copy server data or credentials. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'apps/web/public');
const output = path.join(root, 'apps/web/dist');
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true });
const entry = path.join(output, 'index.html');
const html = fs.readFileSync(entry, 'utf8');
fs.writeFileSync(entry, html.replace('<head>', '<head>\n  <script>window.HIVELOT_PAGES_PREVIEW = true;</script>'));
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('GitHub Pages frontend prepared in apps/web/dist (static preview).');
