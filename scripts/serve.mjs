import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root = resolve(process.argv[2] || 'site'), port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer(async (request,response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const path = resolve(root,'.'+(pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root+sep)) { response.writeHead(403); response.end('Forbidden'); return; }
    const content = await readFile(path); response.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'}); response.end(content);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port,'0.0.0.0',() => console.log(`SchoolTrack: http://localhost:${port}`));
