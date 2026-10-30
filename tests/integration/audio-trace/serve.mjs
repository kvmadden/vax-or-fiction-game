// Serves a production build the way Vercel serves dist/: a real file first, then the vercel.json rewrites, then the
// static 404.html. Media gets byte ranges and every file revalidates by ETag, like Vercel's default static caching.
// The local room relay rides on the same server, so a build made with VITE_WS_URL pointing here has live phones.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { attachRoomRelay } from '../../../server/room-relay.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * The file a request maps to, or null when it would leave `dist`. The check needs the separator: `dist-old` starts
 * with `dist` too, and `/..%2fdist-old/x` resolves there.
 */
export function resolveFile(dist, pathname, rewrites) {
  const direct = path.join(dist, pathname);
  if (direct !== dist && !direct.startsWith(`${dist}${path.sep}`)) return null;
  const candidates = pathname.endsWith('/') ? [path.join(direct, 'index.html')] : [direct];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { file: candidate, status: 200 };
  }
  const rewrite = rewrites.get(pathname);
  if (rewrite) return { file: path.join(dist, rewrite), status: 200 };
  const notFound = path.join(dist, '404.html');
  return { file: fs.existsSync(notFound) ? notFound : null, status: 404 };
}

export async function serveBuild(dist, { port = 0, host = '127.0.0.1' } = {}) {
  const root = path.resolve(dist);
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites = new Map((vercel.rewrites ?? []).map((rule) => [rule.source, rule.destination]));
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const resolved = resolveFile(root, pathname, rewrites);
    if (!resolved) {
      response.writeHead(403).end();
      return;
    }
    if (!resolved.file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    const stat = fs.statSync(resolved.file);
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'content-type': TYPES[path.extname(resolved.file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=0, must-revalidate',
      etag,
      'accept-ranges': 'bytes',
    };
    if (resolved.status === 200 && request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers).end();
      return;
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
    if (resolved.status === 200 && range) {
      const start = range[1] === '' ? Math.max(0, stat.size - Number(range[2])) : Number(range[1]);
      const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        response.writeHead(416, { ...headers, 'content-range': `bytes */${stat.size}` }).end();
        return;
      }
      response.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
      if (request.method === 'HEAD') { response.end(); return; }
      fs.createReadStream(resolved.file, { start, end }).pipe(response);
      return;
    }
    response.writeHead(resolved.status, { ...headers, 'content-length': stat.size });
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(resolved.file).pipe(response);
  });
  const relay = attachRoomRelay(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    async close() {
      await relay.close();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
