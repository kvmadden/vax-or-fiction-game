// VOF-45 (fix pass): an unknown path must never reach the SPA. Vercel's own documented static
// routing precedence is redirects, then filesystem match, then vercel.json rewrites in order,
// then a root 404.html served with a real 404 status if one exists in the output directory. This
// is an inspectable reproduction of that documented precedence against the real `dist/` and the
// real `vercel.json`, with no Vercel account or CLI involved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// The routes a deployed build must serve as the app.
const VERIFY_ROUTES = [
  { path: '/join?room=VERIFY' }, { path: '/play' }, { path: '/remote' }, { path: '/admin' },
  { path: '/about' }, { path: '/disclaimer' }, { path: '/privacy' }, { path: '/terms' }, { path: '/credits' },
];

const dist = path.resolve('dist');
assert.ok(fs.existsSync(dist), 'run this after `npm run build` so dist/ exists');
assert.ok(fs.existsSync(path.join(dist, '404.html')), 'dist/404.html must exist (built from the root 404.html, VOF-45 fix pass)');

const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = vercelConfig.rewrites ?? [];
const redirects = vercelConfig.redirects ?? [];
assert.ok(!rewrites.some((r) => r.source === '/(.*)'), 'vercel.json must not carry a catch-all rewrite to index.html: that would turn every unknown path into a 200, shadowing the static 404.html');

// SITE_PAGES keys (App.tsx), read from source rather than imported: App.tsx runs browser-only
// module-scope code (window.location) on import, which crashes under plain Node. Parsed the same
// way tests/unit/site-pages.test.ts's own App.tsx structural checks already do.
const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
const sitePagesBlock = appSource.slice(appSource.indexOf('const SITE_PAGES'), appSource.indexOf('const SITE_PAGES') + 400);
const sitePagePaths = [...sitePagesBlock.matchAll(/'(\/[a-z-]+)':/g)].map((m) => m[1]);
assert.ok(sitePagePaths.length >= 5, `expected at least 5 SITE_PAGES keys parsed from App.tsx, found ${sitePagePaths.length}`);

// The known-route set this test verifies: every VERIFY_ROUTES path (query strings and all) plus
// every bare SITE_PAGES key, de-duplicated (VERIFY_ROUTES already names each site page once).
const KNOWN_ROUTES = [...new Set([...VERIFY_ROUTES.filter((r) => !r.noRedirect).map((r) => r.path), ...sitePagePaths])];

// Model of Vercel's redirects: a `has` condition this simulation's default request (the apex
// host) cannot satisfy makes that redirect not apply.
const DEFAULT_HOST = 'vaxorfiction.com';
function matchingRedirect(pathname, host = DEFAULT_HOST) {
  return redirects.find((r) => {
    if (r.source !== pathname) return false;
    return (r.has ?? []).every((condition) => condition.type !== 'host' || condition.value === host);
  });
}

function resolve(pathname, { rewriteList = rewrites, host = DEFAULT_HOST } = {}) {
  const redirect = matchingRedirect(pathname, host);
  if (redirect) return { status: redirect.permanent ? 308 : 307, location: redirect.destination };
  const direct = path.join(dist, pathname);
  const asIndex = pathname.endsWith('/') ? path.join(direct, 'index.html') : null;
  for (const candidate of [direct, asIndex].filter(Boolean)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { status: 200, file: candidate };
  }
  const rewrite = rewriteList.find((r) => r.source === pathname);
  if (rewrite) return { status: 200, file: path.join(dist, rewrite.destination) };
  return { status: 404, file: path.join(dist, '404.html') };
}

function server(options) {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const result = resolve(decodeURIComponent(pathname), options);
    if (result.location) {
      res.writeHead(result.status, { location: result.location });
      res.end();
      return;
    }
    res.writeHead(result.status, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(result.file));
  });
}

async function withServer(options, run) {
  const instance = server(options);
  await new Promise((resolve) => instance.listen(0, resolve));
  try {
    const { port } = instance.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    instance.close();
  }
}

await withServer(undefined, async (base) => {
  for (const route of KNOWN_ROUTES) {
    const res = await fetch(`${base}${route}`);
    assert.equal(res.status, 200, `${route} must still resolve (200) with the catch-all removed`);
  }

  // The explicit extra URLs the fix-pass review asked for.
  for (const extra of ['/join?room=ABCD', '/remote?room=ABCD&key=x']) {
    const res = await fetch(`${base}${extra}`);
    assert.equal(res.status, 200, `${extra} must resolve (200)`);
  }

  // The font files the static 404 loads (VOF-45 fix pass warning: it now links real fonts, not
  // copied hex/inline @font-face data URIs).
  for (const weight of ['400', '600', '700']) {
    const font = `/assets/fonts/ibm-plex-sans-latin-${weight}-normal.woff2`;
    const res = await fetch(`${base}${font}`);
    assert.equal(res.status, 200, `${font} (loaded by 404.html) must resolve`);
  }

  const unknownPaths = ['/this-page-does-not-exist', '/about/', '/wp-admin', '/api/does-not-exist'];
  for (const unknown of unknownPaths) {
    const res = await fetch(`${base}${unknown}`);
    assert.equal(res.status, 404, `${unknown} must return a real 404, not fall through to the SPA`);
  }

  // The 404 body must actually be the branded page, not a generic message, and carry the same
  // no-semicolon/no-em-dash house style every other page follows (VOF-43).
  const res = await fetch(`${base}/this-page-does-not-exist`);
  const body = await res.text();
  assert.match(body, /<h1[^>]*>That page is the myth\.<\/h1>/, '404 body must be the branded static page');
  assert.ok(body.includes('href="/"'), '404 must link back to the game');
  assert.ok(!body.includes('DJ KMad'), '404 must never name another site (VOF-45 fix pass)');
  const visibleText = body.replace(/<style>[\s\S]*?<\/style>/, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  assert.ok(!visibleText.includes('—'), '404 visible copy must carry no em-dash (VOF-43)');
  assert.doesNotMatch(visibleText, /[\p{L}\p{N})'"’”]\s*;\s*(?:\p{L}|$)/u, '404 visible copy must carry no prose semicolon (VOF-43)');

  console.log(`PASS static routing: ${KNOWN_ROUTES.length} known routes resolve, font files resolve, unknown paths get a real 404 with the branded page`);
});

// RED proof: this check must be able to catch a real route that lost its rewrite, not just pass
// on the current, correct vercel.json. Mutate a copy of rewrites with /about removed and confirm
// the same resolve() logic reports it 404.
{
  const mutatedRewrites = rewrites.filter((r) => r.source !== '/about');
  assert.ok(mutatedRewrites.length === rewrites.length - 1, 'fixture assumption: /about has exactly one rewrite entry to remove');
  const mutated = resolve('/about', { rewriteList: mutatedRewrites });
  assert.equal(mutated.status, 404, 'RED proof: with /about’s rewrite removed, this check must report it 404, proving it actually watches the rewrite list rather than always passing');
  const real = resolve('/about', { rewriteList: rewrites });
  assert.equal(real.status, 200, 'GREEN: the real, unmutated rewrite list serves /about normally');
  console.log('PASS RED/GREEN control: a route stripped of its rewrite is caught (404), the real config is not');
}
