import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import vm from 'node:vm';
const root=resolve(import.meta.dirname,'..');
test('API and role scripts parse independently',()=>{
  for(const file of ['real','config',...['client','auth','students','attendance','transport','notifications','admin'].map(n=>`api/${n}`)])new vm.Script(readFileSync(resolve(root,`site/${file}.js`),'utf8'));
});
test('published public API configuration is injected and query cannot override it',()=>{
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,SCHOOLTRACK_API_BASE_URL:'https://api.integration.test'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const source=readFileSync(resolve(root,'dist/config.js'),'utf8');assert.ok(!source.includes('__SCHOOLTRACK_API_BASE_URL__'));
  const context={window:{},location:{search:'?api=https://untrusted.test'},URLSearchParams};vm.runInNewContext(source,context);
  assert.equal(context.window.SchoolTrackConfig.apiBaseUrl,'https://api.integration.test');
  assert.equal(context.window.SchoolTrackConfig.refreshStorage,'memory-only');
});
test('an unconfigured published application stays unconfigured even with query override',()=>{
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,SCHOOLTRACK_API_BASE_URL:''},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const context={window:{},location:{search:'?api=https://untrusted.test'},URLSearchParams};vm.runInNewContext(readFileSync(resolve(root,'dist/config.js'),'utf8'),context);
  assert.equal(context.window.SchoolTrackConfig.apiBaseUrl,'');
});
test('public non-local HTTP API is rejected at build time',()=>{
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,SCHOOLTRACK_API_BASE_URL:'http://insecure.example'},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Public APIs require HTTPS/);
});
