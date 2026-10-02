import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname,'..');
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist'),{recursive:true});
const files=['index.html','styles.css','premium.css','real.css','config.js','app.js','premium.js','real.js',...['client','auth','students','attendance','transport','notifications','admin'].map(name=>`api/${name}.js`)];
await mkdir(resolve(root,'dist/api'),{recursive:true});
const apiBase=process.env.SCHOOLTRACK_API_BASE_URL || '';
if(apiBase){const url=new URL(apiBase);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid SCHOOLTRACK_API_BASE_URL');if(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Public APIs require HTTPS');}
for (const file of files) {
  if(file==='config.js')await writeFile(resolve(root,'dist',file),(await readFile(resolve(root,'site',file),'utf8')).replace(/(["'])__SCHOOLTRACK_API_BASE_URL__\1/,JSON.stringify(apiBase)));
  else await copyFile(resolve(root,'site',file),resolve(root,'dist',file));
}
await writeFile(resolve(root,'dist','.nojekyll'),'');
const html = await readFile(resolve(root,'site/index.html'),'utf8');
const css = await readFile(resolve(root,'site/styles.css'),'utf8');
const premiumCss = await readFile(resolve(root,'site/premium.css'),'utf8');
const js = await readFile(resolve(root,'site/app.js'),'utf8');
const premiumJs = await readFile(resolve(root,'site/premium.js'),'utf8');
const portable = html
  .replace('<link rel="stylesheet" href="./styles.css">',()=>`<style>${css}</style>`)
  .replace('<link rel="stylesheet" href="./premium.css">',()=>`<style>${premiumCss}</style>`)
  .replace('<script src="./app.js" defer></script>','')
  .replace('<script src="./premium.js" defer></script>','')
  .replace('</body>',()=>`<script>${js.replace(/<\/script/gi,'<\\/script')}</script><script>${premiumJs.replace(/<\/script/gi,'<\\/script')}</script></body>`);
let preview=portable.replace('<link rel="stylesheet" href="./real.css">','');
preview=preview.replace('<script src="./real.js" defer></script>','');
for(const file of files.filter(f=>f==='config.js'||f.startsWith('api/')))preview=preview.replace(`<script src="./${file}" defer></script>`,'');
await writeFile(resolve(root,'dist','preview.html'),preview);
console.log('Built dist/ and self-contained preview.html. No package installation needed.');
