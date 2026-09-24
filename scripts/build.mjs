import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname,'..');
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist'),{recursive:true});
for (const file of ['index.html','styles.css','premium.css','app.js','premium.js']) await copyFile(resolve(root,'site',file),resolve(root,'dist',file));
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
await writeFile(resolve(root,'dist','preview.html'),portable);
console.log('Built dist/ and self-contained preview.html. No package installation needed.');
