// Local dev server: static files + the presence-auth Pages Function,
// without needing wrangler. Reads VASK_KEY/VASK_SECRET from .dev.vars.
//
//   node tools/dev-server.mjs [port]         (default 8788)
//   node tools/dev-server.mjs --mock         also start a local Pusher-protocol
//                                            mock on :6001 — full multiplayer
//                                            testing with NO Vask account
//   npm run dev                              shorthand for --mock
//
// With --mock, point .env at it:
//   VASK_KEY=app-key  VASK_WS_HOST=127.0.0.1  VASK_WS_PORT=6001  VASK_FORCE_TLS=false
// then open http://localhost:8788 in two windows and join the same room code.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost } from '../functions/stratohop/api/vask/auth.js';
import * as scoresFn from '../functions/stratohop/api/scores.js';

// in-memory stand-in for the SCORES KV namespace (leaderboard testing)
const memKV = new Map();
const SCORES = {
  get: async (k) => memKV.get(k) ?? null,
  put: async (k, v) => { memKV.set(k, v); },
};

const root = join(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const port = parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 8788;

if (args.includes('--mock')) {
  const { startMockVask } = await import('./mock-vask.mjs');
  startMockVask(6001);
}

// env for the auth function: .dev.vars first, then process env
const env = {};
try {
  for (const line of (await readFile(join(root, '.dev.vars'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[0].trim().startsWith('#')) env[m[1]] = m[2];
  }
} catch { /* no .dev.vars */ }
env.VASK_KEY ??= process.env.VASK_KEY;
env.VASK_SECRET ??= process.env.VASK_SECRET;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.env': 'text/plain', '.txt': 'text/plain',
  '.md': 'text/plain', '.toml': 'text/plain',
};

// The game must work mounted under a subpath (production: a Worker proxies
// cloudarcade.app/stratohop/* → the Pages deployment). Mirror that here
// so it's testable: http://localhost:8788/stratohop/
const PREFIX = '/stratohop';

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/') url.pathname = '/arcade/index.html'; // landing page
    if (url.pathname === PREFIX) { // no trailing slash → relative URLs break
      res.writeHead(301, { Location: PREFIX + '/' + url.search });
      res.end();
      return;
    }
    if (url.pathname.startsWith(PREFIX + '/')) {
      url.pathname = url.pathname.slice(PREFIX.length) || '/';
    }

    if (req.method === 'POST' && url.pathname === '/api/vask/auth') {
      const body = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
      const request = new Request(`http://localhost${req.url}`, {
        method: 'POST', body,
        headers: { 'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded' },
      });
      const out = await onRequestPost({ request, env });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }

    if (url.pathname === '/api/scores') {
      const body = req.method === 'POST' ? await new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      }) : undefined;
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method, body,
        headers: { 'content-type': req.headers['content-type'] || 'application/json' },
      });
      const handler = req.method === 'POST' ? scoresFn.onRequestPost : scoresFn.onRequestGet;
      const out = await handler({ request, env: { ...env, SCORES } });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }

    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path === '' || path === '.') path = 'index.html';
    const file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => {
  console.log(`Stratohop dev server → http://localhost:${port}`);
  console.log(`auth signer: ${env.VASK_KEY && env.VASK_SECRET ? 'configured ✓' : 'NOT configured (copy .dev.vars.example → .dev.vars)'}`);
});
