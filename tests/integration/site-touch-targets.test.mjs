// VOF-45 (fix pass): two links measured under 44px in review. The static 404's own brand link
// measured 29px (no explicit min-height, just its inline text baseline), and a Credits citation
// link measured 19px (the same: a bare text baseline inside an already-tall card, never itself
// sized). Both now carry min-height: var(--kit-touch) with display: inline-flex.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

test('the 404 brand link and Credits citation links reach 44px', async (t) => {
  const { child, origin } = await startVite();
  // TB-1 (missing-browser-check.test.mjs, ROT4 2026-09-26): browser starts undefined and launches
  // inside the guarded try, so a rejected launch still reaches the finally that kills the Vite child.
  let browser;

  try {
    browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));

    await t.test('404 brand link', async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${origin}/404.html`, { waitUntil: 'domcontentloaded' });
      await page.locator('.site-404-brand').waitFor({ state: 'attached', timeout: 10000 });
      const box = await page.locator('.site-404-brand').boundingBox();
      await page.close();
      assert.ok(box, 'the 404 brand link must render');
      // 43.9, not a strict 44: the same subpixel-rounding tolerance visual-parity.mjs and
      // show-evidence-details.test.mjs already use for a CSS floor of 44px drawn.
      assert.ok(box.height >= 43.9, `404 brand link height must be at least 44px, measured ${box.height}`);
    });

    await t.test('Credits citation links', async () => {
      // F-31 follow-up: the tap target is the whole card now (li a::after { inset: 0 }), not the
      // anchor's own inline text box, so the height that matters is the <li>'s, which the
      // pseudo-element's inset: 0 makes match exactly.
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${origin}/credits`, { waitUntil: 'domcontentloaded' });
      const cards = page.locator('.site-page-citation-list li');
      await cards.first().waitFor({ state: 'attached', timeout: 10000 });
      const count = await cards.count();
      assert.ok(count > 0, 'Credits must render at least one citation card');
      const heights = [];
      // Fresh-review finding: the <li>'s own boundingBox never changes whether or not
      // `li a::after { inset: 0 }` is actually there, so this alone would still pass with that
      // rule deleted. Checking the real tappable element at the card's own bottom-right corner
      // proves the anchor covers the whole card, not just that the card itself is tall enough.
      const cornerLandsOnAnchor = [];
      for (let index = 0; index < count; index += 1) {
        const card = cards.nth(index);
        // elementFromPoint reads viewport coordinates, so a card below the fold needs scrolling
        // into view first, or its off-screen boundingBox reads as a miss unrelated to the CSS.
        await card.scrollIntoViewIfNeeded();
        const box = await card.boundingBox();
        heights.push(box?.height ?? 0);
        if (box) {
          const point = { x: box.x + box.width - 4, y: box.y + box.height - 4 };
          const landsOnAnchor = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('a')), point);
          cornerLandsOnAnchor.push(landsOnAnchor);
        } else {
          cornerLandsOnAnchor.push(false);
        }
      }
      await page.close();
      assert.ok(heights.every((h) => h >= 43.9), `every citation card must be at least 44px tall, measured ${JSON.stringify(heights)}`);
      assert.ok(cornerLandsOnAnchor.every(Boolean), `every citation card's bottom-right corner must land on its own anchor, got ${JSON.stringify(cornerLandsOnAnchor)}`);
    });
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
  }
});
