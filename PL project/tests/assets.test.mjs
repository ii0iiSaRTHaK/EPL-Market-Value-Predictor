import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';
import { once } from 'node:events';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
let handler;
vm.runInNewContext(await readFile(new URL('../server.js',import.meta.url),'utf8'),{
  require:name => name === 'node:http' ? {createServer:callback => {handler=callback;return {listen(){},close(){}};}} : require(name),
  __dirname:root, process:{env:{},once(){}}, console, URL, setTimeout, clearTimeout, AbortSignal, fetch,
});
async function request(url) {
  const chunks=[];
  const res = new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
  res.writeHead=(status,headers={})=>{res.status=status;res.headers=headers;};
  const complete=once(res,'finish');
  await handler({url,method:'GET'},res);
  await complete;
  return {status:res.status,headers:res.headers,body:Buffer.concat(chunks)};
}

test('canonical scene, runtime, photographs, and fonts are served without byte changes', async () => {
  const manifest=JSON.parse(await readFile(new URL('../vendor/threeui/source-manifest.json',import.meta.url),'utf8'));
  for(const file of manifest.files.filter(file=>file.destination.startsWith('public/'))){
    const res=await request('/'+file.destination.slice(7));
    assert.equal(res.status,200,file.path);
    assert.equal(createHash('sha256').update(res.body).digest('hex'),file.sha256,file.path);
    if(file.path.endsWith('.woff2')) assert.equal(res.headers['Content-Type'],'font/woff2');
    if(file.path.endsWith('.jpg')) assert.equal(res.headers['Content-Type'],'image/jpeg');
  }
});
test('server keeps files outside public inaccessible', async () => {
  const res=await request('/%2e%2e/server.js');
  assert.equal(res.status,404);
});
test('status endpoint retains the existing model and provider contract', async () => {
  const res=await request('/api/status');
  const data=JSON.parse(res.body);
  assert.equal(data.modelAvailable,true);
  assert.equal(data.provider,'FPL historical datasets');
  assert.equal(data.seasons.length,5);
});
