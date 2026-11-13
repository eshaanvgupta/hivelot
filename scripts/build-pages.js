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
const production = path.join(root, 'infrastructure/production.json');
if (fs.existsSync(production)) {
  const { applicationUrl } = JSON.parse(fs.readFileSync(production, 'utf8'));
  const url = new URL(applicationUrl);
  if (url.protocol !== 'https:') throw new Error('Production application must use HTTPS.');
  const destination = url.href;
  fs.writeFileSync(entry, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HIVELOT — Collective procurement</title><link rel="canonical" href="${destination}"><meta http-equiv="refresh" content="0;url=${destination}"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f4ed;color:#292e26;font:16px Georgia,serif}main{padding:32px}h1{font-size:48px;font-weight:400}a{color:#bc4c2d}</style><script>location.replace(${JSON.stringify(destination)}+location.hash);</script></head><body><main><h1>hivelot.</h1><p>The buying collective has a new home.</p><a href="${destination}">Open HIVELOT →</a></main></body></html>`);
} else {
  fs.writeFileSync(entry, html.replace('<head>', '<head>\n  <script>window.HIVELOT_PAGES_PREVIEW = true;</script>'));
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('GitHub Pages entry prepared in apps/web/dist.');
