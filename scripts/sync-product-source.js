/** Mirror authored Site source into the public monorepo without private runtime files. */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'hosting/hivelot'),destination=path.join(root,'apps/product');
const excluded=new Set(['.git','node_modules','dist','.next','.vinext','.wrangler','.sites-runtime','outputs','work','.agents','.codex']);
fs.cpSync(source,destination,{recursive:true,filter(file){const name=path.basename(file);return !excluded.has(name)&&!/^\.env/.test(name)&&!/^\.dev\.vars/.test(name)&&!name.endsWith('.tsbuildinfo')&&name!=='next-env.d.ts'&&!name.endsWith('.pem');}});
console.log('Mirrored authored application source into apps/product; credentials, test records, local state and build outputs excluded.');
