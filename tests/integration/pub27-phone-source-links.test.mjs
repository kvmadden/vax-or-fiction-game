import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

async function openPort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startVite(port) {
  const fixtureRoot = path.resolve(process.env.PUB27_EVIDENCE_DIR || 'work/pub27-phone-source-links');
  const emptyEnv = path.join(fixtureRoot, 'empty-env');
  const cache = path.join(fixtureRoot, 'vite-cache');
  await mkdir(emptyEnv, { recursive: true });
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    envDir: emptyEnv,
    cacheDir: cache,
    plugins: [react()],
    resolve: { alias: { '@': path.resolve('src') } },
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
    logLevel: 'warn',
  });
  await server.listen();
  return server;
}

const evidencePathPrefix = `/${path.posix.normalize(process.env.PUB27_EVIDENCE_DIR || 'work/pub27-phone-source-links').replace(/^\/+|\/+$/g, '')}/`;
const allowedLocalPath = (pathname) => pathname === '/' || pathname === '/index.html' || pathname === '/favicon.ico'
  || pathname === '/__vite_ping' || pathname.startsWith('/@') || pathname.startsWith('/src/')
  || pathname.startsWith('/node_modules/.vite/') || pathname.startsWith(evidencePathPrefix) || pathname.startsWith('/assets/')
  || pathname.startsWith('/fonts/') || pathname.startsWith('/images/');

test('PUB-27 phone source links keep authored labels and remain reachable', { timeout: 60000 }, async (t) => {
  const port = await openPort();
  const origin = `http://127.0.0.1:${port}`;
  let viteServer;
  let browser;
  const blockedRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const overflowMutation = process.env.PUB27_MUTATE_SOURCE_OVERFLOW === '1';
  const swappedUrlMutation = process.env.PUB27_MUTATE_SWAPPED_URLS === '1';
  const clippingMutation = process.env.PUB27_MUTATE_SOURCE_CLIPPING === '1';
  const evidenceRoot = process.env.PUB27_EVIDENCE_DIR || 'work/pub27-phone-source-links';
  const runtime = { testPid: process.pid, cwd: process.cwd(), serverPort: port };
  let output = [];
  let viewportAttempts = [];
  let persistentCalls = [];
  try {
    viteServer = await startVite(port);
    browser = await chromium.launch({ headless: true });
    runtime.browser = { engine: 'chromium', headless: true, connectedBeforeCleanup: browser.isConnected() };
    runtime.serverPid = process.pid;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.addInitScript(() => {
      window.__pub27PersistentAccess = [];
      for (const name of ['localStorage', 'sessionStorage']) {
        const storage = {
          getItem(key) { window.__pub27PersistentAccess.push({ name, operation: 'read', key }); return null; },
          setItem(key) { window.__pub27PersistentAccess.push({ name, operation: 'write', key }); throw new Error(`PUB-27 fixture denied persistent write: ${name}`); },
          removeItem(key) { window.__pub27PersistentAccess.push({ name, operation: 'remove', key }); throw new Error(`PUB-27 fixture denied persistent mutation: ${name}`); },
          clear() { window.__pub27PersistentAccess.push({ name, operation: 'clear' }); throw new Error(`PUB-27 fixture denied persistent mutation: ${name}`); },
        };
        Object.defineProperty(window, name, { configurable: false, value: Object.freeze(storage) });
      }
      Object.defineProperty(window, 'indexedDB', {
        configurable: false,
        get() { window.__pub27PersistentAccess.push({ name: 'indexedDB', operation: 'blocked' }); throw new Error('PUB-27 fixture denied IndexedDB access'); },
      });
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || !allowedLocalPath(url.pathname)) {
        blockedRequests.push(url.href);
        await route.abort();
        return;
      }
      await route.continue();
    });

    const mainSource = await (await page.request.get(`${origin}/src/main.tsx`)).text();
    const appSource = await (await page.request.get(`${origin}/src/App.tsx`)).text();
    const reactUrl = mainSource.match(/from ["']([^"']+\/react\.js[^"']*)["']/)?.[1];
    const domUrl = mainSource.match(/from ["']([^"']+react-dom_client\.js[^"']*)["']/)?.[1];
    const styleUrls = [...appSource.matchAll(/import ["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map((match) => match[1]);
    assert.ok(reactUrl && domUrl, 'fixture imports the exact React module identities from the local Vite entry');

    const duplicateLabelMutation = process.env.PUB27_MUTATE_DUPLICATE_LABELS === '1';
    await page.route('**/src/main.tsx', async (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `
        import React from ${JSON.stringify(reactUrl)};
        import ReactDOM from ${JSON.stringify(domUrl)};
        import '/src/index.css';
        ${styleUrls.map((url) => `import ${JSON.stringify(url)};`).join('\n')}
        import { PhoneLayout } from '/src/phone/PhoneLayout.tsx';
        import { PhoneReveal } from '/src/phone/PhoneReveal.tsx';
        import { vaxOrFictionDeck } from '/src/data/decks/vax-or-fiction.ts';
        import { projectPublicQuestion, projectPublicReveal } from '/src/network/projection.ts';
        const root = ReactDOM.createRoot(document.getElementById('root'));
        const original = vaxOrFictionDeck.questions.find((question) => question.id === 'q30');
        if (!original) throw new Error('Published q30 fixture was not found');
        const authoredCitations = (original.sourceIds ?? []).map((id) => vaxOrFictionDeck.citations.find((citation) => citation.id === id)).filter(Boolean);
        if (authoredCitations.length !== 2) throw new Error('Published q30 must retain its two authored source records');
        const sourceFingerprint = JSON.stringify({ id: original.id, statement: original.statement, reveal: original.reveal, takeaway: original.takeaway, sourceIds: original.sourceIds });
        const authoredExpected = authoredCitations.map((citation) => ({ label: citation.shortDisplayLine || citation.publisher, url: new URL(citation.url).href }));
        if (authoredExpected.some((citation) => !citation.url.startsWith('https://'))) throw new Error('Published q30 source URLs must be HTTPS');
        window.__renderPub27 = ({ singleSource = false } = {}) => {
          const citations = singleSource ? authoredCitations.slice(0, 1) : authoredCitations;
          const fixtureQuestion = { ...original, citations };
          const { question } = projectPublicQuestion(fixtureQuestion, singleSource ? 'pub27-q30-single' : 'pub27-q30-multi', 30, 35);
          const reveal = projectPublicReveal(fixtureQuestion);
          ${duplicateLabelMutation ? "reveal.citations = reveal.citations.map((citation) => ({ ...citation, label: reveal.citations[0].label }));" : ''}
          ${swappedUrlMutation ? "if (reveal.citations.length === 2) { reveal.citations = reveal.citations.map((citation) => ({ ...citation })); [reveal.citations[0].url, reveal.citations[1].url] = [reveal.citations[1].url, reveal.citations[0].url]; }" : ''}
          window.__pub27Expected = { questionId: original.id, sourceFingerprint, labels: (singleSource ? authoredExpected.slice(0, 1) : authoredExpected).map((citation) => citation.label), urls: (singleSource ? authoredExpected.slice(0, 1) : authoredExpected).map((citation) => citation.url) };
          root.render(React.createElement(PhoneLayout, { className: 'phone-live-shell', enableWakeLock: false, showWakeLockIndicator: false, showHeader: false, showFooter: false, brandMark: 'none' },
            React.createElement(PhoneReveal, { presentation: 'explanation', question, reveal, attendee: null, solo: true })));
        };
        window.__renderPub27();
      `,
    }));
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator('[data-role="phone-layout"]').waitFor({ timeout: 5000 }).catch(async (error) => {
      throw new Error(`${error.message}\nbody=${(await page.locator('body').innerText()).slice(0, 1000)}\npageErrors=${JSON.stringify(pageErrors)}\nconsoleErrors=${JSON.stringify(consoleErrors)}\nblockedRequests=${JSON.stringify(blockedRequests)}`);
    });
    await mkdir(evidenceRoot, { recursive: true });

    async function inspectPhone({ width, height, singleSource = false, expectScroll = false, screenshot }) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(({ expectedWidth, expectedHeight }) => window.innerWidth === expectedWidth && window.innerHeight === expectedHeight, { expectedWidth: width, expectedHeight: height });
      const actualViewportAtStart = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight }));
      viewportAttempts.push({ requested: { width, height }, actual: actualViewportAtStart });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate((single) => window.__renderPub27({ singleSource: single }), singleSource);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const expected = await page.evaluate(() => window.__pub27Expected);
      assert.equal(expected.questionId, 'q30');
      assert.equal(expected.labels.length, singleSource ? 1 : 2, 'the fixture carries the selected published source count');
      assert.equal(new Set(expected.labels).size, expected.labels.length, 'authored source titles stay distinct');
      const sourceSection = page.locator('[data-role="reveal-citations"]');
      const continuation = page.getByRole('button', { name: 'Sources', exact: true });
      if (height < 700) await continuation.click();
      await sourceSection.waitFor();
      if (overflowMutation) await page.addStyleTag({ content: '#root [data-role="reveal-citations"] a { transform: translateX(60px) !important; }' });
      if (clippingMutation) await page.addStyleTag({ content: '#root [data-role="reveal-citations"] a { clip-path: inset(100%) !important; }' });
      const links = sourceSection.locator('a');
      assert.equal(await links.count(), expected.labels.length, 'every selected source is a link');
      assert.deepEqual(await links.evaluateAll((items) => items.map((item) => item.textContent.trim())), expected.labels);
      assert.deepEqual(await links.evaluateAll((items) => items.map((item) => item.href)), expected.urls);
      const content = page.locator('[data-role="phone-content"]');
      await content.evaluate((element) => { element.scrollTop = 0; });
      const initialScrollTop = await content.evaluate((element) => element.scrollTop);
      const measureVisible = (element) => {
        const container = document.querySelector('[data-role="phone-content"]');
        const rect = element.getBoundingClientRect();
        const contentRect = container.getBoundingClientRect();
        const left = Math.max(0, contentRect.left, rect.left);
        const right = Math.min(window.innerWidth, contentRect.right, rect.right);
        const top = Math.max(0, contentRect.top, rect.top);
        const bottom = Math.min(window.innerHeight, contentRect.bottom, rect.bottom);
        const styles = [];
        for (let node = element; node && node instanceof Element; node = node.parentElement) {
          const style = getComputedStyle(node);
          styles.push({ display: style.display, visibility: style.visibility, opacity: style.opacity, clipPath: style.clipPath });
          if (node === container) break;
        }
        const opacity = styles.reduce((product, style) => product * Number(style.opacity || 1), 1);
        return {
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          intersection: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
          visibleArea: Math.max(0, right - left) * Math.max(0, bottom - top),
          opacity,
          styles,
          scrollTop: container.scrollTop,
        };
      };
      const metrics = [];
      for (let index = 0; index < expected.labels.length; index++) {
        const link = links.nth(index);
        const before = await link.evaluate(measureVisible);
        await link.scrollIntoViewIfNeeded();
        const after = await link.evaluate(measureVisible);
        assert.ok(after.box.width >= 44 && after.box.height >= 44, `source ${index + 1} has a 44px target: ${JSON.stringify(after)}`);
        assert.ok(after.box.x >= 0 && after.box.x + after.box.width <= width, `source ${index + 1} stays within the ${width}px viewport: ${JSON.stringify(after)}`);
        assert.ok(after.visibleArea > 0, `source ${index + 1} has positive visible intersection after intentional scrolling: ${JSON.stringify(after)}`);
        assert.ok(after.opacity > 0.05 && after.styles.every((style) => style.display !== 'none' && style.visibility === 'visible' && style.clipPath === 'none'), `source ${index + 1} has visible computed styles: ${JSON.stringify(after.styles)}`);
        metrics.push({ label: expected.labels[index], url: expected.urls[index], before, after });
      }
      const viewport = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight }));
      assert.equal(viewport.innerWidth, width, 'rendered phone uses the requested width');
      assert.equal(viewport.innerHeight, height, 'rendered phone uses the requested height');
      assert.ok(viewport.documentWidth <= width, `phone has no horizontal page overflow: ${JSON.stringify(viewport)}`);
      const scroll = await content.evaluate((element, initial) => ({
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        initialScrollTop: initial,
        finalScrollTop: element.scrollTop,
      }), initialScrollTop);
      assert.equal(scroll.overflowY, 'auto', 'phone content uses the accepted scroll container');
      if (expectScroll) {
        assert.ok(scroll.scrollHeight > scroll.clientHeight, `short-height control actually overflows: ${JSON.stringify(scroll)}`);
        assert.ok(scroll.finalScrollTop > scroll.initialScrollTop, `the last source requires and completes intentional phone-content scrolling: ${JSON.stringify(scroll)}`);
        assert.ok(metrics.at(-1).after.visibleArea > 0, 'the final source is visible after scrolling to it');
      }
      const focusMetrics = [];
      for (let sourceIndex = 0; sourceIndex < expected.urls.length; sourceIndex++) {
        const expectedUrl = expected.urls[sourceIndex];
        await page.evaluate(() => document.activeElement?.blur());
        let focused = false;
        for (let tab = 0; tab < 12 && !focused; tab++) {
          await page.keyboard.press('Tab');
          focused = await page.evaluate((url) => document.activeElement instanceof HTMLAnchorElement && document.activeElement.href === url, expectedUrl);
        }
        assert.equal(focused, true, `source ${sourceIndex + 1} receives keyboard focus independently`);
        const focus = await page.locator('a:focus').evaluate(measureVisible);
        const focusStyle = await page.evaluate(() => {
          const style = getComputedStyle(document.activeElement);
          return { visible: document.activeElement.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
        });
        assert.ok(focus.visibleArea > 0, `focused source ${sourceIndex + 1} remains visibly intersecting: ${JSON.stringify(focus)}`);
        assert.ok(focusStyle.visible, `source ${sourceIndex + 1} uses visible keyboard focus`);
        assert.ok((focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0) || focusStyle.boxShadow !== 'none', `source ${sourceIndex + 1} focus indicator is visible: ${JSON.stringify(focusStyle)}`);
        focusMetrics.push({ url: expectedUrl, geometry: focus, style: focusStyle });
      }
      await page.screenshot({ path: screenshot, fullPage: false });
      return { width, height, actualViewport: viewport, singleSource, labels: expected.labels, urls: expected.urls, metrics, initialScrollTop, scroll, focusMetrics };
    }

    output = [];
    await t.test('q30 multi-source reveal at 390x844', async () => {
      output.push(await inspectPhone({ width: 390, height: 844, screenshot: path.join(evidenceRoot, 'q30-multi-390x844.png') }));
    });
    await t.test('q30 multi-source reveal at 430x932', async () => {
      output.push(await inspectPhone({ width: 430, height: 932, screenshot: path.join(evidenceRoot, 'q30-multi-430x932.png') }));
    });
    await t.test('q30 single-source reveal at 390x844', async () => {
      output.push(await inspectPhone({ width: 390, height: 844, singleSource: true, screenshot: path.join(evidenceRoot, 'q30-single-390x844.png') }));
    });
    await t.test('short-height source continuation scrolls to the final q30 source', async () => {
      output.push(await inspectPhone({ width: 390, height: 160, expectScroll: true, screenshot: path.join(evidenceRoot, 'q30-multi-390x160.png') }));
    });
    persistentCalls = await page.evaluate(() => window.__pub27PersistentAccess);
    assert.deepEqual(persistentCalls.filter((call) => call.operation !== 'read'), [], 'fixture blocks every persistent write, removal, clear, and IndexedDB access');
    assert.deepEqual(blockedRequests, [], 'fixture makes no external, relay, API, or provider requests');
    assert.deepEqual(pageErrors, [], 'fixture has no browser errors');
    assert.deepEqual(consoleErrors, [], 'fixture has no browser console errors');
  } finally {
    if (browser) {
      runtime.browser.contextCount = browser.contexts().length;
      runtime.browser.pageCount = browser.contexts().reduce((count, context) => count + context.pages().length, 0);
      await browser.close();
      runtime.browserClosed = !browser.isConnected();
    }
    if (viteServer) {
      await viteServer.close();
      runtime.serverClosed = !viteServer.httpServer.listening;
    }
    runtime.cleanupVerified = runtime.browserClosed === true && runtime.serverClosed === true;
    const candidate = await readFile(new URL(import.meta.url));
    const candidateSha256 = createHash('sha256').update(candidate).digest('hex');
    await writeFile(path.join(evidenceRoot, 'receipt.json'), JSON.stringify({
      schema: 1, taskType: 'build', baseline: 'c87cd9028862944a1a317075829193fb22bd18e6', candidateSha256,
      requestedViewports: viewportAttempts.map(({ requested }) => requested),
      actualViewports: viewportAttempts.map(({ actual }) => actual), viewportAttempts, output,
      fences: { blockedRequests, blockedRequestCount: blockedRequests.length, pageErrors, pageErrorCount: pageErrors.length, consoleErrors, consoleErrorCount: consoleErrors.length, persistentCalls, persistentCallCount: persistentCalls.length, persistentMutationCount: persistentCalls.filter((call) => call.operation !== 'read').length },
      runtime,
    }, null, 2));
  }
});
