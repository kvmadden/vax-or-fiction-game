import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startVite, wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';
import { chromium } from 'playwright';

// PHONE-LAYOUT batch, verified against a local evidence file and a local evidence file (worktree
// vof-waves-2-4 at 2afbc7f) plus the Wave 1 reviewer's direct measurements for the three
// QUEUED-LAYOUT items (a local evidence file, jitter-diag.mjs, root-diag.mjs in worktree
// vof-wave1). Harness shared via ./render-harness.mjs (TB1): a real Vite dev server plus real
// host+phone rooms in Playwright's bundled headless Chromium, one browser and one Vite for the
// whole file. This file still owns its own before/after (not withViteAndBrowser) because every
// test below shares the one browser instance across the whole run. See TB1's fix to `after` below
// for why the shared startVite/kill pattern was still adopted.

// Opens a fresh host+phone room pair on a bundled question sequence, driven the same way the
// existing verify scripts and phone-short-viewport.test.mjs do: manipulate the host store
// directly (VITE_PRODUCTION_RELAY=false uses the local dev relay), then join from the phone.
async function openRoom(browser, url, room, phoneViewport, questionIds) {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const phoneContext = await browser.newContext({ viewport: phoneViewport, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await hostContext.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const host = await hostContext.newPage();
  const phone = await phoneContext.newPage();
  await host.goto(`${url}/?room=${room}&host=1`);
  await host.waitForSelector('[data-testid="screen-router"]');
  await host.evaluate(async ({ ids, sessionId }) => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    window.__layoutStore = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
    const byId = new Map(vaxOrFictionDeck.questions.map((question) => [question.id, question]));
    const initial = window.__layoutStore.getInitialState();
    window.__layoutStore.setState({
      ...initial,
      sessionId,
      phase: 'lobby',
      slideIndex: -1,
      run: [initial.run.find((slide) => slide.type === 'title'), ...ids.map((id) => byId.get(id))],
      offlineMode: false,
      interactionMode: 'polling',
      timer: { ...initial.timer, enabled: false, visible: false },
    });
  }, { ids: questionIds, sessionId: room });
  await phone.goto(`${url}/join?room=${room}`);
  await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Layout QA');
  await phone.locator('button[type="submit"]').click();
  await phone.waitForSelector('[data-role="phone-waiting"]');
  return { hostContext, phoneContext, host, phone };
}

// Every real question needs a lock-then-reveal pair of ADVANCE dispatches before the next slide
// opens (src/store/game-store.ts case 'ADVANCE': a still-open question locks first, then a
// second ADVANCE reveals it, then one more moves to the next slide). Poll rather than hardcode a
// dispatch count, matching however many questions are ahead of the target.
async function advanceToSlide(host, targetIndex) {
  for (let i = 0; i < 4 * targetIndex + 4; i++) {
    const state = await host.evaluate(() => {
      window.__layoutStore.getState().dispatch({ type: 'ADVANCE' });
      const s = window.__layoutStore.getState();
      return { phase: s.phase, slideIndex: s.slideIndex };
    });
    if (state.slideIndex === targetIndex && state.phase === 'entering') return;
  }
  throw new Error(`could not reach slide ${targetIndex} in 'entering' phase`);
}

let child;
let url;
let browser;

before(async () => {
  ({ child, url } = await startVite());
  browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
});

// TB1: before this fix, a browser launch failure in `before` left `browser` undefined, so
// `await browser.close()` threw and the next line (`child.kill`) never ran, orphaning Vite.
// Each step now runs regardless of whether the other exists or throws.
after(async () => {
  if (browser) { try { await browser.close(); } catch { /* best-effort teardown */ } }
  if (child) { try { child.kill('SIGTERM'); } catch { /* best-effort teardown */ } }
});

// --- PHO-05: landscape safe-area padding is a flat token, ignoring a real notch ----------------

test('PHO-05: phone header and content padding grow for a real landscape safe-area inset', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 59, right: 59, bottom: 0 } });
    await page.goto(`${url}/join?room=PHO05A`);
    await page.waitForSelector('[data-role="phone-join"]');
    await page.waitForTimeout(150);
    const measured = await page.evaluate(() => {
      const bar = document.querySelector('[data-role="phone-header"]');
      const content = document.querySelector('[data-role="phone-content"]');
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;width:env(safe-area-inset-left,-1px);height:1px;';
      document.body.appendChild(probe);
      const envLeftResolved = getComputedStyle(probe).width;
      probe.remove();
      const barCs = getComputedStyle(bar);
      const contentCs = getComputedStyle(content);
      return {
        envLeftResolved,
        barPaddingLeft: barCs.paddingLeft, barPaddingRight: barCs.paddingRight,
        contentPaddingLeft: contentCs.paddingLeft, contentPaddingRight: contentCs.paddingRight,
      };
    });
    assert.equal(measured.envLeftResolved, '59px', `CDP safe-area override did not take effect (env() resolved to ${measured.envLeftResolved}); this Chrome build may not support Emulation.setSafeAreaInsetsOverride`);
    for (const [label, value] of Object.entries({
      'app-bar padding-left': measured.barPaddingLeft,
      'app-bar padding-right': measured.barPaddingRight,
      'app-content padding-left': measured.contentPaddingLeft,
      'app-content padding-right': measured.contentPaddingRight,
    })) {
      assert.ok(parseFloat(value) >= 59, `${label} is ${value} with a confirmed-active 59px safe-area inset, should be at least 59px`);
    }
  } finally {
    await context.close();
  }
});

// --- PHO-11: Android tap-highlight gray box, no override to transparent ------------------------

test('PHO-11: phone buttons suppress the default Android tap-highlight box', { timeout: 60_000 }, async () => {
  const { hostContext, phoneContext, host, phone } = await openRoom(browser, url, 'PHO11A', { width: 390, height: 844 }, ['q1']);
  try {
    await advanceToSlide(host, 1);
    await phone.waitForSelector('[data-role="phone-vote-container"][data-question-id="q1"]');
    await phone.waitForTimeout(150);
    const highlight = await phone.evaluate(() => getComputedStyle(document.querySelector('[data-action="vote-true"]')).webkitTapHighlightColor);
    assert.match(highlight, /^rgba\(0,\s*0,\s*0,\s*0\)$/, `vote-true's tap-highlight-color is ${highlight}, should be transparent`);
  } finally {
    await hostContext.close();
    await phoneContext.close();
  }
});

// --- PHO-04: sub-44px citation links (latent, defensive) ---------------------------------------

test('PHO-04: a short reveal-citation link still meets the 44px touch-target width floor', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const page = await context.newPage();
  try {
    // No shipped citation is short enough to trigger this (PHO-UIUX-04 verdict: LATENT, every deck
    // file scanned, shortest real citation is 13 characters). It is doubly unreachable today: the
    // real container, [data-role="reveal-citations"], is flex-direction:column (src/styles/phone-live.css:1224),
    // so default align-items:stretch already forces every citation link to full container width
    // regardless of label length. That stretch is the reachability guard, not the fix under test, so
    // this synthetic link opts out of it with align-self:flex-start (isolating exactly the min-width
    // floor PHO-UIUX-04 proposes) against the real selector chain and inline styles PhoneReveal.tsx
    // renders (src/phone/PhoneReveal.tsx:157), so the defensive CSS floor itself is tested even
    // though no shipped layout reaches it today.
    await page.goto(`${url}/join?room=PHO04A`);
    await page.waitForSelector('[data-role="phone-join"]');
    const width = await page.evaluate(() => {
      const host = document.createElement('div');
      host.className = 'phone-reveal-surface';
      host.innerHTML = '<section data-role="reveal-citations"><a href="#" style="color:var(--color-gold);display:inline-flex;align-items:center;align-self:flex-start;">X</a></section>';
      document.body.appendChild(host);
      const rect = host.querySelector('a').getBoundingClientRect();
      host.remove();
      return rect.width;
    });
    assert.ok(width >= 44, `a short citation link renders ${width}px wide, should be at least 44px`);
  } finally {
    await context.close();
  }
});

// --- QA-ERR-02: the crash fallback overflows both canonical phones (content-box sizing) --------

test('QA-ERR-02: the crash fallback card does not overflow a canonical phone', { timeout: 60_000 }, async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    try {
      await page.goto(`${url}/join?room=QAERR${viewport.width}`);
      await page.waitForSelector('[data-role="phone-join"]');
      // Mount the real ErrorBoundary (src/components/ErrorBoundary.tsx), not a copy of its markup,
      // around a component that throws on render, the same way App.tsx wraps host/phone/remote/solo
      // (src/App.tsx:80). react, react-dom/client and the component are dynamic-imported from Vite's
      // own already-resolved dev-server URLs, the same technique used elsewhere in this file for the
      // store and deck modules, so this test can never drift from the component's real style object.
      const rect = await page.evaluate(async () => {
        const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
        const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
        const ReactModule = await import(loaded('/node_modules/.vite/deps/react.js'));
        const ReactDOMClientModule = await import(loaded('/node_modules/.vite/deps/react-dom_client.js'));
        const React = ReactModule.createElement ? ReactModule : ReactModule.default;
        const ReactDOMClient = ReactDOMClientModule.createRoot ? ReactDOMClientModule : ReactDOMClientModule.default;
        const { ErrorBoundary } = await import(loaded('/src/components/ErrorBoundary.tsx'));
        function Boom() { throw new Error('QA-ERR-02 test crash'); }
        const mount = document.createElement('div');
        document.body.appendChild(mount);
        const originalOnError = window.onerror;
        window.onerror = () => true; // React's dev mode re-surfaces the caught error for devtools visibility
        const root = ReactDOMClient.createRoot(mount);
        root.render(React.createElement(ErrorBoundary, null, React.createElement(Boom)));
        await new Promise((resolve) => setTimeout(resolve, 150));
        window.onerror = originalOnError;
        const card = mount.firstElementChild.firstElementChild; // outer flex wrap > inner card
        const r = card.getBoundingClientRect();
        root.unmount();
        mount.remove();
        return { left: r.left, right: r.right, width: r.width };
      });
      assert.ok(rect.left >= -1 && rect.right <= viewport.width + 1, `${viewport.width}x${viewport.height}: crash-fallback card spans ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}, viewport is ${viewport.width}px wide`);
    } finally {
      await context.close();
    }
  }
});

// --- QUEUED-LAYOUT-1: FALSE button and option cards run ~5px past the right edge ---------------

test('QUEUED-LAYOUT-1: the FALSE binary button stays inside the viewport', { timeout: 60_000 }, async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 430, height: 932 }]) {
    const { hostContext, phoneContext, host, phone } = await openRoom(browser, url, `QL1-${viewport.width}`, viewport, ['q1']);
    try {
      await advanceToSlide(host, 1);
      await phone.waitForSelector('[data-role="phone-vote-container"][data-question-id="q1"]');
      await phone.waitForTimeout(150);
      const rect = await phone.evaluate(() => document.querySelector('[data-action="vote-false"]').getBoundingClientRect());
      assert.ok(rect.right <= viewport.width + 1, `${viewport.width} wide: FALSE button right edge is at ${rect.right.toFixed(1)}px, viewport is ${viewport.width}px`);
      assert.ok(rect.left >= -1, `${viewport.width} wide: FALSE button left edge is at ${rect.left.toFixed(1)}px`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  }
});

// --- QUEUED-LAYOUT-2: removed (TW6) ------------------------------------------------------------
// The reviewer's version of this test opened every room through openRoom, which forces
// reducedMotion: 'reduce' on both contexts, so whatever framer-motion drift it was meant to catch
// (PhoneVote.tsx and PhoneLayout.tsx both gate their motion on useReducedMotion) could never fire
// and the test could not fail as written. Investigated here by temporarily running the same
// sampling logic with reducedMotion: 'no-preference' (real motion) against the current base: the
// TRUE button still did not drift, over 4.5s of animation-frame sampling. NOT-REPRODUCED even
// with the constraint that supposedly hid it removed, so the test is deleted rather than kept
// permanently green for a claim that cannot be demonstrated either way. If the drift the Wave 1
// reviewer measured is still real, it needs a fresh repro from the reviewer, not this test.

// --- QUEUED-LAYOUT-3: sr-only points label reportedly makes the phone-layout root taller --------

test('QUEUED-LAYOUT-3: the screen-reader-only points label adds no layout height on a voted result screen', { timeout: 60_000 }, async () => {
  const { hostContext, phoneContext, host, phone } = await openRoom(browser, url, 'QL3A', { width: 390, height: 844 }, ['q4']);
  try {
    await advanceToSlide(host, 1);
    await phone.waitForSelector('[data-role="phone-vote-container"][data-question-id="q4"]');
    await phone.locator('[data-action="vote-true"]').click(); // q4's answer is true: a real, scored result
    // TW5: poll for the real condition (the vote actually registered) instead of a fixed sleep.
    // The first version of this fix polled the phone's own [data-selected="true"] attribute, but
    // that is a transient render state: a direct diagnostic showed it
    // appears the instant the click lands and is gone again within about a second, once the phone
    // moves on to its next screen. Any gap between the click resolving and the poll actually
    // starting (which grows under real machine load, confirmed here via a load average of 12 to
    // 16 during repeated failures) can land entirely after that window closes, so the poll then
    // waits out its full timeout for a state that will never come back. Polling the host's own
    // pollVoters store entry instead is race-free: it is set the moment the vote is recorded and
    // stays there, regardless of what screen the phone moves to next.
    await host.waitForFunction(() => Object.keys(window.__layoutStore.getState().pollVoters?.q4 ?? {}).length > 0);
    await host.evaluate(() => window.__layoutStore.getState().dispatch({ type: 'REVEAL' }));
    await phone.waitForSelector('[data-role="phone-reveal"][data-screen="result"]');
    await phone.waitForTimeout(300);
    // TB-3: this used to compare the phone-layout root's scrollHeight with and without the span, which
    // could never fail: the root is pinned to the screen height, and any height the span added landed
    // inside the scrolling phone-content box below it (a scratch style that broke the containment, so
    // the span rendered 318x27, still passed). The check is on the element that holds the span, plus
    // the span's own box, which must stay the 1x1 of .sr-only (src/index.css). The room reveal says the
    // points beside the big visible number, so the span is found by its words anywhere on the result.
    const measured = await phone.evaluate(() => {
      const result = document.querySelector('[data-role="phone-reveal"][data-screen="result"]');
      const srSpans = result ? [...result.querySelectorAll('.sr-only')] : [];
      const pointsSpan = srSpans.find((span) => /points/i.test(span.textContent ?? ''));
      if (!pointsSpan) return { found: false };
      const holder = pointsSpan.parentElement;
      const span = pointsSpan.getBoundingClientRect();
      const withSpan = holder.getBoundingClientRect().height;
      pointsSpan.style.setProperty('display', 'none', 'important');
      const withoutSpan = holder.getBoundingClientRect().height;
      pointsSpan.style.removeProperty('display');
      return { found: true, text: pointsSpan.textContent, holder: holder.className, spanWidth: span.width, spanHeight: span.height, withSpan, withoutSpan };
    });
    assert.ok(measured.found, 'no screen-reader-only points span was found on the voted result screen');
    assert.ok(measured.spanWidth <= 1 && measured.spanHeight <= 1, `the screen-reader-only points label must stay at most 1x1, measured ${measured.spanWidth}x${measured.spanHeight}`);
    assert.ok(Math.abs(measured.withSpan - measured.withoutSpan) <= 0.5, `${measured.holder} is ${measured.withSpan}px tall with the points label and ${measured.withoutSpan}px without it`);
  } finally {
    await hostContext.close();
    await phoneContext.close();
  }
});
