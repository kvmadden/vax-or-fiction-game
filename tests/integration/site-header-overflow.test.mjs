// VOF-45 (fix pass): the site header used to scale the full game ShowWordmark down to header
// size. The syringe icon shrank to a stray bar, the "?" sat apart from FICTION, and at 390 the
// mark measured 376px inside a 342px row, scrolling body sideways by 10px at 390 and 40px at
// 360. Replaced with the compact SiteBrand text lockup (src/screens/site/SiteBrand.tsx). This
// measures documentElement.scrollWidth and body.scrollWidth at 360, 390, 430 and 1440 on the
// entry screen and every site page, and writes the full table to work/overflow-table.json so the
// report can quote it exactly.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

async function openPort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return address.port;
}

async function startVite() {
  const port = await openPort();
  const child = spawn(
    path.resolve('node_modules/.bin/vite'),
    ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Vite did not start:\n${output}`));
    }, 15_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes(`127.0.0.1:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Vite exited ${code}:\n${output}`));
    });
  });
  await ready;
  return { child, port, origin: `http://127.0.0.1:${port}` };
}

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1440, height: 900 },
];

const PAGES = [
  { name: 'entry', path: '/' },
  { name: 'about', path: '/about' },
  { name: 'disclaimer', path: '/disclaimer' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
  { name: 'credits', path: '/credits' },
];

test('no page or the entry screen scrolls the document sideways, at 360, 390, 430 or 1440', async (t) => {
  const { child, origin } = await startVite();
  // TB-1 (missing-browser-check.test.mjs, ROT4 2026-09-26): a browser-launch failure must not
  // orphan the Vite child this suite already started. `browser` starts undefined and launches
  // inside the guarded try below, so a rejected launch still reaches the finally that kills it.
  let browser;
  const table = [];

  try {
    browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
    for (const viewport of VIEWPORTS) {
      for (const pageDef of PAGES) {
        await t.test(`${pageDef.name} at ${viewport.width}x${viewport.height}`, async () => {
          const page = await browser.newPage({ viewport });
          await page.goto(`${origin}${pageDef.path}`, { waitUntil: 'domcontentloaded' });
          await page.locator('[data-screen]').first().waitFor({ state: 'attached', timeout: 10000 });
          await page.evaluate(() => document.fonts.ready);

          const metrics = await page.evaluate(() => ({
            innerWidth: window.innerWidth,
            documentElementScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
          }));
          await page.close();

          table.push({ page: pageDef.name, viewport: `${viewport.width}x${viewport.height}`, ...metrics });

          assert.equal(
            metrics.documentElementScrollWidth, viewport.width,
            `${pageDef.name} at ${viewport.width}: documentElement.scrollWidth must equal the viewport width, measured ${metrics.documentElementScrollWidth}`,
          );
          assert.equal(
            metrics.bodyScrollWidth, viewport.width,
            `${pageDef.name} at ${viewport.width}: body.scrollWidth must equal the viewport width, measured ${metrics.bodyScrollWidth}`,
          );
        });
      }
    }
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
    fs.mkdirSync('work', { recursive: true });
    fs.writeFileSync('work/overflow-table.json', JSON.stringify(table, null, 2));
    console.log(`Overflow table written to work/overflow-table.json (${table.length} rows)`);
  }
});

// VOF-W7: the entry screen's big game wordmark (ShowWordmark, rendered inside
// .entry-hero-art) does not scroll the document sideways, because .entry-screen clips its own
// overflow. That let the "?" and, at narrower widths, the "N" of FICTION sit past the edge of
// the viewport undetected by the scrollWidth check above. This measures the bounding rect of
// every glyph-bearing element of the wordmark (VAX, the syringe, OR, FICTION and the "?")
// against the viewport, and against every clipping ancestor between it and the document, at
// six phone-to-desktop widths.
const WORDMARK_VIEWPORTS = [
  { width: 320, height: 700 },
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

const WORDMARK_GLYPH_SELECTORS = [
  '.show-wordmark__vax',
  '.show-wordmark__syringe',
  '.show-wordmark__or',
  '.show-wordmark__fiction',
  '.show-wordmark__question',
];

async function measureWordmarkGlyphs(page) {
  return page.evaluate((selectors) => {
    const root = document.querySelector('[data-show-wordmark]');
    if (!root) return null;
    const glyphs = [];
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // Intersect every ancestor's clip box (any overflow other than visible on that axis) to
      // find how much of this glyph's own rect is actually visible, not just its raw geometry.
      let clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
      let node = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        const clipsX = style.overflowX !== 'visible';
        const clipsY = style.overflowY !== 'visible';
        if (clipsX || clipsY) {
          const ancestorRect = node.getBoundingClientRect();
          if (clipsX) {
            clip.left = Math.max(clip.left, ancestorRect.left);
            clip.right = Math.min(clip.right, ancestorRect.right);
          }
          if (clipsY) {
            clip.top = Math.max(clip.top, ancestorRect.top);
            clip.bottom = Math.min(clip.bottom, ancestorRect.bottom);
          }
        }
        node = node.parentElement;
      }
      const EPS = 0.5;
      const clippedByAncestor =
        clip.left > rect.left + EPS ||
        clip.top > rect.top + EPS ||
        clip.right < rect.right - EPS ||
        clip.bottom < rect.bottom - EPS;
      glyphs.push({
        selector,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        clippedByAncestor,
      });
    }
    return { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, glyphs };
  }, WORDMARK_GLYPH_SELECTORS);
}

test('the entry screen wordmark, every glyph fits inside the viewport at 320, 360, 390, 430, 768 and 1440', async (t) => {
  const { child, origin } = await startVite();
  let browser;
  const table = [];

  try {
    browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
    for (const viewport of WORDMARK_VIEWPORTS) {
      await t.test(`entry wordmark at ${viewport.width}x${viewport.height}`, async () => {
        const page = await browser.newPage({ viewport });
        await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-show-wordmark]').first().waitFor({ state: 'attached', timeout: 10000 });
        await page.evaluate(() => document.fonts.ready);

        const measured = await measureWordmarkGlyphs(page);
        await page.close();

        assert.ok(measured, `entry wordmark at ${viewport.width}: [data-show-wordmark] was not found on the page`);
        assert.ok(measured.glyphs.length === WORDMARK_GLYPH_SELECTORS.length,
          `entry wordmark at ${viewport.width}: expected ${WORDMARK_GLYPH_SELECTORS.length} glyph elements, found ${measured.glyphs.length}`);

        for (const glyph of measured.glyphs) {
          table.push({ viewport: `${viewport.width}x${viewport.height}`, selector: glyph.selector, ...glyph.rect, clippedByAncestor: glyph.clippedByAncestor });

          assert.ok(glyph.rect.left >= -0.5,
            `entry wordmark ${glyph.selector} at ${viewport.width}: left edge ${glyph.rect.left} is past the viewport's left edge`);
          assert.ok(glyph.rect.right <= viewport.width + 0.5,
            `entry wordmark ${glyph.selector} at ${viewport.width}: right edge ${glyph.rect.right} is past the viewport's right edge (${viewport.width})`);
          assert.equal(glyph.clippedByAncestor, false,
            `entry wordmark ${glyph.selector} at ${viewport.width}: clipped by an ancestor with overflow other than visible`);
        }
      });
    }
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
    fs.mkdirSync('work', { recursive: true });
    fs.writeFileSync('work/entry-wordmark-table.json', JSON.stringify(table, null, 2));
    console.log(`Entry wordmark glyph table written to work/entry-wordmark-table.json (${table.length} rows)`);
  }
});
