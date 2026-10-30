import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// PHO-UIUX-01. A phone held sideways, or a small phone, must still reach every answer and every
// button on the question, result and explanation screens. The rule under test is the finite live
// screens block in src/styles/phone-critique.css. The canonical phones must keep fitting with
// nothing to scroll at their full 390x844 or 430x932 size, which also proves the fix is invisible
// there. That "nothing to scroll" guarantee holds only at that full height: QUEUED-SAFARI-ROW's
// 390x744 row is a canonical phone at the height Safari actually gives it once its address bar and
// toolbars take their share, and it is allowed to scroll like every other non-canonical row below.
const VIEWPORTS = [
  { width: 390, height: 844, mustFit: true },
  { width: 430, height: 932, mustFit: true },
  { width: 390, height: 744, mustFit: false },
  { width: 320, height: 568, mustFit: false },
  { width: 844, height: 390, mustFit: false },
];
// The longest statement of each kind in the show deck, so each kind is tested at its tallest.
const TALLEST = { binary: 'q17', 'myth-among-three': 'q26', estimate: 'q14', order: 'q27', 'which-patient': 'q30' };
const SCREENS = [
  ['question', '[data-role="phone-vote-container"]'],
  ['result', '[data-role="phone-reveal"][data-screen="result"]'],
  ['explanation', '[data-role="phone-reveal"][data-screen="explanation"]'],
];

// QUEUED-SAFARI-ROW. A canonical 390-wide phone playing in real Safari is shorter than 390x844:
// the address bar and toolbars take roughly 70 to 100px, per the Wave 1 plan's own Review Focus #1.
test('the viewport matrix includes a Safari-height row for the canonical narrow phone', () => {
  const row = VIEWPORTS.find((viewport) => viewport.width === 390 && viewport.height === 744);
  assert.ok(row, 'a 390x744 row (about an iPhone 14 in Safari) must be in the matrix');
  assert.equal(row.mustFit, false, 'that row is shorter than the canonical 390x844, so it may scroll like the other non-canonical rows');
});

// TB1: startVite/withViteAndBrowser now live in ./render-harness.mjs, shared by every rendered
// suite, so this file only imports them. See that module for the QUEUED-TEST-HANG history.

// What a person can reach. It never scrolls by script, because a script can scroll an
// overflow: hidden box that a thumb cannot, and that would fake a pass.
function reachability() {
  const content = document.querySelector('[data-role="phone-content"]');
  const clipped = [];
  for (let node = content; node && node !== document.documentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    if ((style.overflowY === 'hidden' || style.overflowY === 'clip') && node.scrollHeight > node.clientHeight + 1) {
      clipped.push(`${node.getAttribute('data-role') ?? node.className} hides ${node.scrollHeight - node.clientHeight}px`);
    }
  }
  const controls = content ? [...content.querySelectorAll('button, a[href]')].filter((node) => node.offsetParent !== null) : [];
  const last = controls.at(-1);
  const box = last?.getBoundingClientRect();
  return {
    clipped,
    overflow: content ? content.scrollHeight - content.clientHeight : null,
    lastControl: last ? (last.textContent || last.getAttribute('aria-label') || '').trim().slice(0, 32) : null,
    lastBottom: box ? Math.round(box.bottom) : null,
    viewportHeight: innerHeight,
  };
}

async function checkPhone(browser, url, { width, height, mustFit }, kind) {
  const viewport = { width, height };
  const room = `SHORT${width}X${height}${kind.replace(/-/g, '').slice(0, 5).toUpperCase()}`;
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const phoneContext = await browser.newContext({ viewport, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await hostContext.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const host = await hostContext.newPage();
  const phone = await phoneContext.newPage();
  const errors = [];
  for (const page of [host, phone]) page.on('pageerror', (error) => errors.push(error.message));
  const failures = [];
  let checked = 0;
  try {
    await host.goto(`${url}/?room=${room}&host=1`);
    await host.waitForSelector('[data-testid="screen-router"]');
    await host.evaluate(async ({ id }) => {
      const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
      const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
      window.shortStore = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
      const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
      const question = vaxOrFictionDeck.questions.find((entry) => entry.id === id);
      const initial = window.shortStore.getInitialState();
      window.shortStore.setState({
        ...initial,
        sessionId: `short-${id}`,
        phase: 'lobby',
        slideIndex: -1,
        run: [initial.run.find((slide) => slide.type === 'title'), question],
        offlineMode: false,
        interactionMode: 'polling',
        timer: { ...initial.timer, enabled: false, visible: false },
      });
    }, { id: TALLEST[kind] });
    await phone.goto(`${url}/join?room=${room}`);
    await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Short Phone');
    await phone.locator('button[type="submit"]').click();
    await phone.waitForSelector('[data-role="phone-waiting"]');
    for (const [screen, selector] of SCREENS) {
      if (screen === 'question') await host.evaluate(() => { const { dispatch } = window.shortStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      if (screen === 'result') await host.evaluate(() => window.shortStore.getState().dispatch({ type: 'REVEAL' }));
      if (screen === 'explanation') await host.evaluate(() => window.shortStore.getState().dispatch({ type: 'ADVANCE' }));
      await phone.waitForSelector(selector);
      await phone.waitForTimeout(300);
      const before = await phone.evaluate(reachability);
      await phone.mouse.move(viewport.width / 2, viewport.height / 2);
      await phone.mouse.wheel(0, 4000);
      await phone.waitForTimeout(300);
      const after = await phone.evaluate(reachability);
      checked += 1;
      const label = `${viewport.width}x${viewport.height} ${kind} ${TALLEST[kind]} ${screen}`;
      if (before.clipped.length > 0) failures.push(`${label}: ${before.clipped.join(', ')}`);
      if (mustFit && before.overflow > 1) failures.push(`${label}: a canonical phone now has ${before.overflow}px to scroll`);
      if (after.lastBottom === null || after.lastBottom > after.viewportHeight + 1) {
        failures.push(`${label}: "${after.lastControl}" ends at ${after.lastBottom}px after scrolling, below the ${after.viewportHeight}px screen`);
      }
    }
  } finally {
    await hostContext.close();
    await phoneContext.close();
  }
  return { failures, checked, errors };
}

test('every phone control stays reachable on short and sideways screens', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const results = await Promise.all(VIEWPORTS.map(async (viewport) => {
      const rows = [];
      for (const kind of Object.keys(TALLEST)) rows.push(await checkPhone(browser, url, viewport, kind));
      return rows;
    }));
    const rows = results.flat();
    const checked = rows.reduce((sum, row) => sum + row.checked, 0);
    console.log(`PHONE_FIT_COVERAGE viewports=${VIEWPORTS.length} kinds=${Object.keys(TALLEST).length} screens=${SCREENS.length} checked=${checked}`);
    assert.equal(checked, VIEWPORTS.length * Object.keys(TALLEST).length * SCREENS.length, 'every viewport, kind and screen was measured');
    assert.deepEqual(rows.flatMap((row) => row.errors), [], 'no page errors');
    assert.deepEqual(rows.flatMap((row) => row.failures), []);
  });
});

// QUEUED-TEST-HANG / TB1 / TB-1. The orphan-on-missing-browser regression (withViteAndBrowser's own
// finally-block wiring) is one shared test in render-harness.mjs, called once from
// tests/integration/missing-browser-check.test.mjs rather than copy-pasted into every suite that
// adopted the helper. That file also runs every rendered suite in `check` (this one included) with
// no usable browser at all and proves the whole invocation exits within a bound with nothing left
// running, which additionally covers a rejection for the wrong reason (the body ran) instead of
// being accepted by a bare assert.rejects with no matcher.

// MOT-VQA-01 / QUEUED-SCROLL. The phone content box (PhoneLayout's <main data-role="phone-content">)
// must fade in on a real screen change, never on first paint, and must always open scrolled to the
// top even when the previous screen was scrolled down. A sideways phone is used because it is the
// viewport this suite already knows has content tall enough to scroll (see VIEWPORTS above).
async function setShortRoomQuestion(host, id) {
  await host.evaluate(async ({ id }) => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    window.swapStore = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
    const question = vaxOrFictionDeck.questions.find((entry) => entry.id === id);
    const initial = window.swapStore.getInitialState();
    window.swapStore.setState({
      ...initial,
      sessionId: `swap-${id}`,
      phase: 'lobby',
      slideIndex: -1,
      run: [initial.run.find((slide) => slide.type === 'title'), question],
      offlineMode: false,
      interactionMode: 'polling',
      timer: { ...initial.timer, enabled: false, visible: false },
    });
  }, { id });
}

test('the phone screen fades in on a real change, never on first paint, and always opens scrolled to the top', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'SWAPFADE01';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.binary);
      await phone.goto(`${url}/join?room=${room}`);

      // First paint (the join screen): must not be mid-animation or still transparent.
      await phone.waitForSelector('[data-role="phone-content"]');
      const firstPaint = await phone.evaluate(() => {
        const node = document.querySelector('[data-role="phone-content"]');
        return { animations: node.getAnimations().length, opacity: getComputedStyle(node).opacity };
      });
      assert.equal(firstPaint.animations, 0, 'the first screen must not be mid-animation');
      assert.equal(firstPaint.opacity, '1', 'the first screen is fully visible immediately, not mid-fade');

      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Swap Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');

      // A real screen change (waiting -> question) after first paint must run an enter animation.
      // TW5: sample continuously for a bounded wall-clock window, rather than a single snapshot right
      // after waitForSelector resolves. That single check can land after the ~260ms fade has already
      // finished on a loaded machine, and a fixed 400ms settle-check right after it carries the same
      // race in the other direction (it could still be mid-fade at 400ms).
      // TW-3: the window used to open before the trigger, so the waiting screen's own fade (the screen
      // before this one) could satisfy it while the question screen never faded at all. It now opens
      // when the vote container is added to the page (a MutationObserver, as the PHO-07 test below
      // does), and every sample is of the content box that holds it.
      await phone.evaluate(() => {
        window.__swapSamples = [];
        window.__swapDone = false;
        window.__swapVoteAlreadyShown = Boolean(document.querySelector('[data-role="phone-vote-container"]'));
        let start = null;
        const tick = () => {
          const node = document.querySelector('[data-role="phone-content"]');
          window.__swapSamples.push({
            question: Boolean(node?.querySelector('[data-role="phone-vote-container"]')),
            animations: node ? node.getAnimations().length : 0,
            opacity: node ? Number(getComputedStyle(node).opacity) : 1,
          });
          if (performance.now() - start > 900) { window.__swapDone = true; return; }
          requestAnimationFrame(tick);
        };
        const observer = new MutationObserver(() => {
          if (start !== null || !document.querySelector('[data-role="phone-vote-container"]')) return;
          observer.disconnect();
          start = performance.now();
          requestAnimationFrame(tick);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      assert.equal(await phone.evaluate(() => window.__swapVoteAlreadyShown), false, 'test setup: the question screen is not up before the trigger');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      await phone.waitForFunction(() => window.__swapDone === true, null, { timeout: 15_000 });
      const swapSamples = await phone.evaluate(() => window.__swapSamples);
      assert.ok(swapSamples.length >= 10 && swapSamples.every((sample) => sample.question), `test setup: every sample is of the question screen (${swapSamples.length} samples)`);
      const sawMidFade = swapSamples.some((sample) => sample.animations > 0 || sample.opacity < 1);
      assert.ok(sawMidFade, `expected the question screen itself mid-fade (an active animation or opacity below 1) in some sampled frame, got: ${JSON.stringify(swapSamples)}`);
      const settledOpacity = swapSamples.at(-1)?.opacity;
      assert.equal(settledOpacity, 1, 'the transition settles at fully visible by the end of the sampled window');

      // Scroll the question screen down, then move on: the next screen must open at the top.
      await phone.evaluate(() => { document.querySelector('[data-role="phone-content"]').scrollTop = 999_999; });
      const scrolledDown = await phone.evaluate(() => document.querySelector('[data-role="phone-content"]').scrollTop);
      assert.ok(scrolledDown > 0, 'test setup: the question screen actually had somewhere to scroll');

      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'REVEAL' }));
      await phone.waitForSelector('[data-role="phone-reveal"][data-screen="result"]');
      await phone.waitForTimeout(400);
      const scrollAfterReveal = await phone.evaluate(() => document.querySelector('[data-role="phone-content"]').scrollTop);
      assert.equal(scrollAfterReveal, 0, 'the result screen opens at the top, not where the question screen left off');

      // Same again for result -> explanation.
      await phone.evaluate(() => { document.querySelector('[data-role="phone-content"]').scrollTop = 999_999; });
      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'ADVANCE' }));
      await phone.waitForSelector('[data-role="phone-reveal"][data-screen="explanation"]');
      await phone.waitForTimeout(400);
      const scrollAfterExplanation = await phone.evaluate(() => document.querySelector('[data-role="phone-content"]').scrollTop);
      assert.equal(scrollAfterExplanation, 0, 'the explanation screen opens at the top too');
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

test('the phone screen swap honors reduced motion', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'SWAPREDUCE1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.binary);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Reduced Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      // Sampled immediately: under reduced motion the screen must already be fully visible, not
      // ramping through a fade, even on a real screen change.
      const reduced = await phone.evaluate(() => {
        const node = document.querySelector('[data-role="phone-content"]');
        return { animations: node.getAnimations().length, opacity: getComputedStyle(node).opacity };
      });
      assert.equal(reduced.animations, 0, 'reduced motion must not run the enter animation');
      assert.equal(reduced.opacity, '1', 'reduced motion renders the new screen fully visible immediately');
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// PHO-07. Vote acknowledgement used to collapse the dock from the full option stack down to a short receipt with
// no transition (measured ~150px in a local evidence file). The room dock now keeps every answer target in place, and
// acknowledgement opens a Change answer row under them, so the targets give that row its height. That resize must be
// a real transition too. Sample the answer stack's own height across real animation frames from the moment the
// acknowledgement lands: an instant resize never shows a value between the open and answered heights. A real
// transition always does.
test('the vote dock resizes its targets on acknowledgement with a real transition, not an instant jump', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'DOCKFADE1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      // myth-among-three stacks three full-width targets, the tallest shape the dock has, so it is the kind the
      // resize is measured on.
      await setShortRoomQuestion(host, TALLEST['myth-among-three']);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Dock Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      await phone.waitForTimeout(400); // let the screen's own enter transition (MOT-VQA-01) settle first

      const stackSelector = '[data-role="phone-dock"] .answer-stack';
      const openHeight = await phone.evaluate((selector) => document.querySelector(selector).getBoundingClientRect().height, stackSelector);

      // TW5: sample from the moment the acknowledgement actually lands, not from whenever this setup call happens to
      // run relative to it, and keep sampling for a bounded wall-clock window (not a fixed frame count) so a loaded
      // machine still catches the whole transition. A MutationObserver on the dock's data-state marks the real start,
      // and requestAnimationFrame then samples the stack's height and, for W7, whether the tapped target is being
      // visually squashed by a transform rather than resized by layout.
      await phone.evaluate((selector) => {
        window.__dockSamples = [];
        window.__collectionDone = false;
        const dock = document.querySelector('[data-role="phone-dock"]');
        const stack = document.querySelector(selector);
        let collecting = false;
        let start = 0;
        const observer = new MutationObserver(() => {
          if (!collecting && dock.getAttribute('data-state') === 'answered') {
            collecting = true;
            start = performance.now();
          }
        });
        observer.observe(dock, { attributes: true, attributeFilter: ['data-state'] });
        const tick = () => {
          if (collecting) {
            const chosen = dock.querySelector('[data-selected="true"]');
            const chosenRect = chosen ? chosen.getBoundingClientRect() : null;
            window.__dockSamples.push({
              stackH: stack.getBoundingClientRect().height,
              dockTransform: getComputedStyle(dock).transform,
              chosenRectH: chosenRect ? chosenRect.height : null,
              chosenOffsetH: chosen ? chosen.offsetHeight : null,
            });
            if (performance.now() - start > 900) {
              observer.disconnect();
              window.__collectionDone = true;
              return;
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, stackSelector);
      await phone.locator('[data-role="phone-dock"] [data-choice]').first().click();
      await phone.waitForFunction(() => window.__collectionDone === true, null, { timeout: 15_000 });

      const samples = await phone.evaluate(() => window.__dockSamples);
      const answeredHeight = samples.at(-1).stackH;
      assert.ok(openHeight - answeredHeight > 40, `test setup: acknowledgement must actually resize the answer stack (open ${openHeight}, answered ${answeredHeight})`);
      const margin = (openHeight - answeredHeight) * 0.15;
      const midTransition = samples.some((sample) => sample.stackH < openHeight - margin && sample.stackH > answeredHeight + margin);
      assert.ok(midTransition, `expected a sampled frame strictly between the open height (${openHeight}) and the answered height (${answeredHeight}), got: ${samples.map((s) => s.stackH).join(',')}`);

      // W7: the targets resize by layout, so no sampled frame may show the tapped target's rendered height diverging
      // from its own layout (offset) height. A diverging pair means a transform is squashing its text.
      assert.ok(samples.every((sample) => sample.chosenRectH !== null), 'test setup: every sampled frame found the tapped target');
      const squashedFrames = samples.filter((sample) => Math.abs(sample.chosenRectH - sample.chosenOffsetH) > 1);
      assert.deepEqual(squashedFrames, [], `no sampled frame may show the tapped target's rendered height diverging from its layout height: ${JSON.stringify(squashedFrames)}`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// B1 (W7 regression). The dock's text-bearing children carried a full `layout` animation of their own,
// so a receipt whose own height changed (it loses Change answer when votes lock and regains it on an
// ADD_TIME reopen) scaled its text with it: 1.743x tall on the lock and 0.574x on the reopen, measured
// on binary q17 at 390x844 with full motion. The option list that Change answer brings back had no
// `layout` at all, so the dock's own resize stretched it too. Every text element in the dock must render
// at its own natural size in every sampled frame of all four dock changes. Each sampling window opens at
// the dock's first DOM change after the trigger (a MutationObserver), never before it, and closes a
// bounded wall-clock window after the phase's own end state is on screen. A tap renders once before the
// room answers, so a window timed from that first change alone could close before the relay's reply
// ever collapses the dock. A node's text scale is every transform from the node up to the dock
// composed, which is what a rendered-height over offsetHeight ratio measures too, without
// offsetHeight's whole-pixel rounding (a 23.39px line reads 1.017 at rest by that ratio). The room dock now resizes
// its answer stack by layout, as the Change answer row opens and closes, so each frame also records the stack's
// height, which proves the window caught the dock mid-resize.
function armDockTextScaleSampler({ endState, windowMs, capMs }) {
  const dock = document.querySelector('[data-role="phone-dock"]');
  const stack = dock.querySelector('.answer-stack');
  const reached = () => dock.matches(endState) || Boolean(dock.querySelector(endState));
  const state = { frames: [], done: false, endStateBeforeTrigger: reached(), endStateMs: null, timedOut: false };
  window.__dockTextScale = state;
  let start = null;
  let endStateAt = null;
  const observer = new MutationObserver(() => {
    const now = performance.now();
    if (start === null) start = now;
    if (endStateAt === null && reached()) {
      endStateAt = now;
      state.endStateMs = Math.round(now - start);
    }
  });
  observer.observe(dock, { attributes: true, childList: true, subtree: true, characterData: true });
  const textScale = (node) => {
    let matrix = new DOMMatrix();
    for (let element = node; element; element = element.parentElement) {
      const transform = getComputedStyle(element).transform;
      if (transform && transform !== 'none') matrix = new DOMMatrix(transform).multiply(matrix);
      if (element === dock) break;
    }
    return [Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)];
  };
  const tick = () => {
    if (start !== null) {
      const now = performance.now();
      const texts = [...dock.querySelectorAll('p, span, strong, button, li')].filter((node) => node.offsetHeight > 0 && node.offsetWidth > 0);
      let worst = 1;
      let worstNode = null;
      for (const node of texts) {
        for (const scale of textScale(node)) {
          if (Math.abs(scale - 1) > Math.abs(worst - 1)) {
            worst = scale;
            worstNode = node.getAttribute('data-role') ?? node.getAttribute('data-action') ?? `${node.tagName.toLowerCase()}.${node.className}`;
          }
        }
      }
      state.frames.push({ ms: Math.round(now - start), afterEndState: endStateAt !== null, dockTransform: getComputedStyle(dock).transform, stackH: stack ? stack.getBoundingClientRect().height : null, texts: texts.length, worst: Math.round(worst * 1000) / 1000, worstNode });
      const closed = endStateAt !== null && now - endStateAt > windowMs;
      if (closed || now - start > capMs) {
        state.timedOut = !closed;
        observer.disconnect();
        state.done = true;
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

test('no frame of a vote dock change scales its text: acknowledgement, time-out, ADD_TIME reopen, Change answer (B1, W7)', { timeout: 90_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'DOCKTEXT1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.binary);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Dock Text Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      // Let the screen's own enter fade (MOT-VQA-01) finish before measuring the dock.
      await phone.waitForFunction(() => document.querySelector('[data-role="phone-content"]').getAnimations().length === 0, null, { timeout: 5_000 });
      // Pressed targets shrink to 0.98, a deliberate press transform. Pausing the dock's descendants' own CSS motion,
      // except the Change answer row's height transition, leaves the dock's resize as the one change in view, so any
      // text scale a frame shows comes from that resize. The setup check below requires frames that caught the dock
      // mid-resize.
      await phone.addStyleTag({ content: '[data-role="phone-dock"] *:not(.answer-change-slot) { animation: none !important; transition: none !important; }' });

      const settled = () => phone.waitForFunction(() => {
        const dock = document.querySelector('[data-role="phone-dock"]');
        return [dock, ...dock.querySelectorAll('*')].every((node) => getComputedStyle(node).transform === 'none');
      }, null, { timeout: 5_000 });
      // Taps are pointer-free clicks, so a button's hover lift never reads as layout distortion either.
      // Each phase names the end state its trigger produces once the room has answered.
      const phases = [
        { name: 'acknowledgement', endState: '[data-state="answered"]', trigger: () => phone.locator('[data-choice="true"]').dispatchEvent('click') },
        { name: 'TIME_EXPIRED', endState: '[data-state="locked"]', trigger: () => host.evaluate(() => window.swapStore.getState().dispatch({ type: 'TIME_EXPIRED' })) },
        { name: 'ADD_TIME reopen', endState: '[data-state="answered"]', trigger: () => host.evaluate(() => window.swapStore.getState().dispatch({ type: 'ADD_TIME', seconds: 15 })) },
        { name: 'Change answer', endState: '[data-state="reviewing"]', trigger: () => phone.locator('[data-action="review-answer-options"]').dispatchEvent('click') },
      ];
      const results = [];
      for (const phase of phases) {
        await settled();
        await phone.evaluate(armDockTextScaleSampler, { endState: phase.endState, windowMs: 900, capMs: 15_000 });
        await phase.trigger();
        await phone.waitForFunction(() => window.__dockTextScale.done === true, null, { timeout: 20_000 });
        const { frames, endStateBeforeTrigger, endStateMs, timedOut } = await phone.evaluate(() => window.__dockTextScale);
        const worstFrame = frames.reduce((worst, frame) => (Math.abs(frame.worst - 1) > Math.abs(worst.worst - 1) ? frame : worst), frames[0]);
        // Caught mid-resize: a frame after the end state whose stack height sits strictly between where the phase
        // started and where it settled.
        const [from, to] = [frames[0]?.stackH, frames.at(-1)?.stackH];
        const resizing = frames.filter((frame) => frame.afterEndState && frame.stackH !== null
          && frame.stackH > Math.min(from, to) + 1 && frame.stackH < Math.max(from, to) - 1).length;
        results.push({ phase: phase.name, frames: frames.length, endStateBeforeTrigger, endStateMs, timedOut, resizing, worst: worstFrame?.worst, worstNode: worstFrame?.worstNode, worstMs: worstFrame?.ms });
      }
      console.log(`DOCK_TEXT_SCALE ${JSON.stringify(results)}`);
      for (const result of results) {
        assert.equal(result.endStateBeforeTrigger, false, `test setup: the ${result.phase} end state was not already on screen`);
        assert.equal(result.timedOut, false, `test setup: the ${result.phase} end state appeared within the window cap`);
        assert.ok(result.frames >= 10, `test setup: the ${result.phase} window sampled real frames (${result.frames})`);
        assert.ok(result.resizing > 0, `test setup: the ${result.phase} window caught the dock resizing into its end state`);
      }
      const distorted = results.filter((result) => result.worst < 0.98 || result.worst > 1.02);
      assert.deepEqual(distorted, [], 'every frame of every dock change keeps its text within 0.98 to 1.02 of its natural size');
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// A11Y-10. The tapped vote button used to unmount the instant the vote was acknowledged, dropping keyboard
// focus back to the body. The room dock now keeps the tapped target in place and blocks it with aria-disabled,
// never disabled, so keyboard focus must still be on it once the vote is acknowledged, never on the body.
test('keyboard focus stays on the tapped answer when the vote is acknowledged', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'FOCUSACK1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.binary);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Focus Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      await phone.waitForTimeout(400);

      const trueButton = phone.locator('[data-choice="true"]');
      await trueButton.focus();
      const focusedBeforeTap = await phone.evaluate(() => document.activeElement?.getAttribute('data-choice'));
      assert.equal(focusedBeforeTap, 'true', 'test setup: the tapped button actually held focus first');
      await trueButton.click();

      // Wait for the acknowledgement itself, then read where focus is.
      await phone.waitForSelector('[data-role="phone-dock"][data-state="answered"]');
      await phone.waitForTimeout(200);
      const afterAck = await phone.evaluate(() => ({
        choice: document.activeElement?.getAttribute('data-choice'),
        blocked: document.activeElement?.getAttribute('aria-disabled'),
        isBody: document.activeElement === document.body,
      }));
      assert.equal(afterAck.choice, 'true', `focus must stay on the tapped answer, landed on data-choice="${afterAck.choice}" (body: ${afterAck.isBody})`);
      assert.equal(afterAck.blocked, 'true', 'the focused answer is blocked from a second tap by aria-disabled');

      // Change answer leaves with its row, so focus moves to the pick being changed, never to the page.
      const change = phone.locator('[data-action="review-answer-options"]');
      await change.focus();
      await phone.keyboard.press('Enter');
      await phone.waitForSelector('[data-role="phone-dock"][data-state="reviewing"]');
      await phone.waitForTimeout(400);
      const afterChange = await phone.evaluate(() => ({
        choice: document.activeElement?.getAttribute('data-choice'),
        isBody: document.activeElement === document.body,
        changeGone: !document.querySelector('[data-action="review-answer-options"]'),
      }));
      assert.equal(afterChange.changeGone, true, 'test setup: Change answer left the page');
      assert.equal(afterChange.choice, 'true', `after Change answer focus must sit on the standing pick, landed on data-choice="${afterChange.choice}" (body: ${afterChange.isBody})`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// W4 (A11Y-10 regression). Locking then reopening the same accepted vote (ADD_TIME after TIME_EXPIRED)
// turns `acknowledged` false then true again for that exact same submission. Nothing may pull focus back
// into the dock on that reopen: focus stays wherever the player has since moved it.
test('focus stays where the player put it when the host reopens an already-acknowledged vote (W4)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'FOCUSSTAY1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.binary);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Stay Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      await phone.waitForTimeout(400);
      await phone.locator('[data-choice="true"]').click();
      await phone.waitForSelector('[data-role="phone-dock"][data-state="answered"]');
      await phone.waitForTimeout(200);

      // The player moves on: a real person would scroll away or tab elsewhere. A synthetic marker
      // outside the vote dock stands in for "focus is deliberately somewhere else now" (same probe
      // technique the reviewer used).
      await phone.evaluate(() => {
        const marker = document.createElement('button');
        marker.id = 'moved-on-marker';
        marker.textContent = 'elsewhere';
        (document.querySelector('[data-role="phone-header"]') ?? document.body).appendChild(marker);
        marker.focus();
      });
      assert.equal(await phone.evaluate(() => document.activeElement?.id), 'moved-on-marker', 'test setup: focus actually moved outside the dock');

      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'TIME_EXPIRED' }));
      await phone.waitForSelector('[data-role="phone-dock"][data-locked="true"]');
      const whileLocked = await phone.evaluate(() => document.activeElement?.id);
      assert.equal(whileLocked, 'moved-on-marker', 'locking the vote must not move focus either');

      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'ADD_TIME', seconds: 15 }));
      await phone.waitForSelector('[data-role="phone-dock"][data-locked="false"]');
      await phone.waitForTimeout(300);
      const afterReopen = await phone.evaluate(() => document.activeElement?.id);
      assert.equal(afterReopen, 'moved-on-marker', `reopening the same accepted vote must not steal focus back, landed on #${afterReopen}`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// W4 (A11Y-10 regression). A page load that starts with the vote already accepted (a reload after
// voting) must not auto-focus anything in the dock just from mounting: nothing new was acknowledged
// this session, so `document.body` is left as the browser's own default focus.
test('reloading onto an already-acknowledged vote does not auto-focus the dock (W4)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'FOCUSRELOAD1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.binary);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Reload Focus Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      await phone.waitForTimeout(400);
      await phone.locator('[data-choice="true"]').click();
      await phone.waitForSelector('[data-role="phone-dock"][data-state="answered"]');

      await phone.reload();
      await phone.waitForSelector('[data-role="phone-dock"][data-state="answered"]', { timeout: 15_000 });
      await phone.waitForTimeout(500);
      const afterReload = await phone.evaluate(() => document.activeElement?.getAttribute('data-role') ?? document.activeElement?.tagName);
      assert.equal(afterReload, 'BODY', `nothing new was acknowledged this session, so focus must stay on body, landed on ${afterReload}`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// The room dock keeps every target on screen once a vote is in, too. Change answer's row opens under the targets and
// a lock can wrap the question's header, so on a canonical phone the answered and the locked screen must still fit with
// nothing to scroll, the status line must stay below the question, and Change answer must stay below the targets. q16
// is the two-reply which-patient under a stepped-up question, and q22 the four-choice one with the longest replies.
test('an answered or locked vote still fits a canonical phone, with nothing riding over the question or the targets', { timeout: 120_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const failures = [];
    let checked = 0;
    for (const id of ['q16', 'q22']) {
      for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
        for (const state of ['answered', 'locked']) {
          const room = `FIT${id.toUpperCase()}${viewport.width}${state === 'answered' ? 'A' : 'L'}`;
          const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
          const phoneContext = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
          const host = await hostContext.newPage();
          const phone = await phoneContext.newPage();
          try {
            await host.goto(`${url}/?room=${room}&host=1`);
            await host.waitForSelector('[data-testid="screen-router"]');
            await setShortRoomQuestion(host, id);
            await phone.goto(`${url}/join?room=${room}`);
            await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Fit Phone');
            await phone.locator('button[type="submit"]').click();
            await phone.waitForSelector('[data-role="phone-waiting"]');
            await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
            await phone.waitForSelector('[data-role="phone-dock"] [data-choice]');
            await phone.waitForTimeout(300);
            if (state === 'answered') {
              await phone.locator('[data-role="phone-dock"] [data-choice]').last().click();
              await phone.waitForSelector('[data-role="phone-dock"][data-state="answered"] [data-action="review-answer-options"]');
            } else {
              await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'LOCK_VOTES' }));
              await phone.waitForSelector('[data-role="phone-dock"][data-state="sat-out"]');
            }
            await phone.waitForTimeout(400);
            const m = await phone.evaluate(() => {
              const content = document.querySelector('[data-role="phone-content"]');
              const hero = document.querySelector('.phone-vote-scenario') ?? document.querySelector('[data-role="question-stem"]');
              const status = document.querySelector('[data-role="phone-dock"] [data-role="vote-confirmation-badge"]');
              const targets = [...document.querySelectorAll('[data-role="phone-dock"] [data-choice]')];
              const change = document.querySelector('[data-role="phone-dock"] [data-action="review-answer-options"]');
              const bottom = (el) => el.getBoundingClientRect().bottom;
              return {
                scroll: content.scrollHeight - content.clientHeight,
                statusClearsQuestion: Math.round(status.getBoundingClientRect().top - bottom(hero)),
                changeClearsTargets: change ? Math.round(change.getBoundingClientRect().top - Math.max(...targets.map(bottom))) : null,
                targets: targets.length,
              };
            });
            checked += 1;
            const label = `${id} ${viewport.width}x${viewport.height} ${state}`;
            if (m.targets < 2) failures.push(`${label}: test setup found ${m.targets} targets`);
            if (m.scroll > 1) failures.push(`${label}: ${m.scroll}px to scroll on a canonical phone`);
            if (m.statusClearsQuestion < 0) failures.push(`${label}: the status line rides ${-m.statusClearsQuestion}px over the question`);
            if (state === 'answered' && (m.changeClearsTargets === null || m.changeClearsTargets < 0)) failures.push(`${label}: Change answer sits ${m.changeClearsTargets}px against the targets`);
          } finally {
            await hostContext.close();
            await phoneContext.close();
          }
        }
      }
    }
    assert.equal(checked, 8, 'every question, phone and state was measured');
    assert.deepEqual(failures, []);
  });
});

// A11Y-10 and W4 on the room's one receipt screen. An order answer still lands on its receipt, so focus must follow
// it there once, and a lock then reopen of the same accepted order (TIME_EXPIRED, then ADD_TIME) must never pull
// focus back from wherever the player has since moved it.
test('an order answer moves focus to its receipt once, and reopening the same vote never takes it back (A11Y-10, W4)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'FOCUSORDER1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.order);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Order Focus Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-order-list"]');
      await phone.waitForTimeout(400);

      const submit = phone.locator('[data-action="submit-order"]');
      await submit.focus();
      assert.equal(await phone.evaluate(() => document.activeElement?.getAttribute('data-action')), 'submit-order', 'test setup: the submit button held focus first');
      await submit.click();
      await phone.waitForSelector('[data-role="phone-choice-receipt"]');
      await phone.waitForTimeout(200);
      const afterAck = await phone.evaluate(() => ({ role: document.activeElement?.getAttribute('data-role'), isBody: document.activeElement === document.body }));
      assert.equal(afterAck.role, 'phone-choice-receipt', `focus must land on the order receipt, landed on data-role="${afterAck.role}" (body: ${afterAck.isBody})`);

      await phone.evaluate(() => {
        const marker = document.createElement('button');
        marker.id = 'moved-on-marker';
        marker.textContent = 'elsewhere';
        (document.querySelector('[data-role="phone-header"]') ?? document.body).appendChild(marker);
        marker.focus();
      });
      assert.equal(await phone.evaluate(() => document.activeElement?.id), 'moved-on-marker', 'test setup: focus actually moved outside the dock');
      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'TIME_EXPIRED' }));
      await phone.waitForSelector('[data-role="phone-dock"][data-locked="true"]');
      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'ADD_TIME', seconds: 15 }));
      await phone.waitForSelector('[data-role="phone-dock"][data-locked="false"] [data-role="phone-choice-receipt"]');
      await phone.waitForTimeout(300);
      const afterReopen = await phone.evaluate(() => document.activeElement?.id);
      assert.equal(afterReopen, 'moved-on-marker', `reopening the same accepted order must not steal focus back, landed on #${afterReopen}`);

      // With focus back on the page itself, focus is free to move, so only the submission's own sequence can tell a
      // reopen from a new acknowledgement. A reopen of the same order still must not move it.
      await phone.evaluate(() => document.activeElement?.blur());
      assert.equal(await phone.evaluate(() => document.activeElement === document.body), true, 'test setup: focus is on the page');
      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'TIME_EXPIRED' }));
      await phone.waitForSelector('[data-role="phone-dock"][data-locked="true"]');
      await host.evaluate(() => window.swapStore.getState().dispatch({ type: 'ADD_TIME', seconds: 15 }));
      await phone.waitForSelector('[data-role="phone-dock"][data-locked="false"] [data-role="phone-choice-receipt"]');
      await phone.waitForTimeout(300);
      const afterSecondReopen = await phone.evaluate(() => document.activeElement?.getAttribute('data-role') ?? document.activeElement?.tagName);
      assert.equal(afterSecondReopen, 'BODY', `a reopen is not a new acknowledgement, so focus must stay on the page, landed on ${afterSecondReopen}`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// PHO-10. The nickname input keeps focus and the virtual keyboard after Join is submitted. Submit
// by pressing Enter in the field itself (not by clicking the Join button), because a real mouse or
// touch tap on a separate button can move focus there as an ordinary browser default and would mask
// whether the fix's own blur() is what released the input.
//
// TW2: reading document.activeElement right after submit is a race the join can win: once the relay
// round trip finishes, PhoneJoin unmounts and the receiving screen mounts, which also releases focus
// on its own, for a reason that has nothing to do with the fix. On a fast run that finished before
// the check landed, the old assertion happened to pass anyway even with the fix reverted (measured 2
// of 3 runs). An init script recording every real .blur() call, installed before the app loads, is
// not subject to that race: it asks what the code actually did, not what state activeElement lands in
// whenever this line of the test happens to run.
//
// NIT (round 5): the blur() record proves the call happened, not that focus actually left the input and
// stayed off it. The relay's replies to the join are held back, so PhoneJoin and its input stay on
// screen, and the still-mounted input must not hold focus. An unmount cannot fake that answer.
test('the nickname input releases focus after Join is submitted', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'BLURJOIN1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phoneContext.addInitScript(() => {
      window.__blurCalls = [];
      const nativeBlur = HTMLElement.prototype.blur;
      HTMLElement.prototype.blur = function tw2RecordedBlur(...args) {
        window.__blurCalls.push(this.getAttribute('data-role') ?? this.tagName);
        return nativeBlur.apply(this, args);
      };
    });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    // Everything the relay sends the phone after its HELLO waits here until released.
    const heldReplies = [];
    let release = () => {};
    await phone.routeWebSocket(/\/api\/rooms\//, (ws) => {
      const server = ws.connectToServer();
      let holding = false;
      release = () => { holding = false; for (const message of heldReplies.splice(0)) ws.send(message); };
      server.onMessage((message) => { if (holding) heldReplies.push(message); else ws.send(message); });
      ws.onMessage((message) => {
        if (typeof message === 'string' && message.includes('"HELLO"')) holding = true;
        server.send(message);
      });
    });
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await phone.goto(`${url}/join?room=${room}`);
      const nickname = phone.getByRole('textbox', { name: /name|nickname/i });
      await nickname.click();
      await nickname.fill('Blur Phone');
      const focusedBefore = await phone.evaluate(() => document.activeElement?.getAttribute('data-role'));
      assert.equal(focusedBefore, 'nickname-input', 'test setup: the nickname input actually held focus before submit');

      await nickname.press('Enter');
      // Wait for the room's reply to arrive and be held (the moment the phone would otherwise leave the
      // join screen), then two more frames so anything that runs after a submit has run.
      for (const deadline = Date.now() + 5_000; heldReplies.length === 0 && Date.now() < deadline;) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(heldReplies.length > 0, 'test setup: the relay reply to the join was actually held back');
      await phone.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
      const whileJoining = await phone.evaluate(() => {
        const input = document.querySelector('[data-role="nickname-input"]');
        return { inputStillOnScreen: Boolean(input?.isConnected), inputFocused: document.activeElement === input };
      });
      assert.equal(whileJoining.inputStillOnScreen, true, 'test setup: the held join keeps the nickname input on screen');
      assert.equal(whileJoining.inputFocused, false, 'focus has left the nickname input while the join is still pending');

      release();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      const blurCalls = await phone.evaluate(() => window.__blurCalls);
      assert.ok(blurCalls.includes('nickname-input'), `submit must explicitly call .blur() on the nickname input, recorded calls: ${JSON.stringify(blurCalls)}`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});

// A11Y-09 (live-position announcement half only, the SVG-label half is false, see a local evidence file).
// A move button's own aria-label names the action ("Move X up"), never the result, so a screen-reader
// user had to re-navigate the whole list to learn the new order.
test('a reorder move is announced with the moved step and its new position', { timeout: 20_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'ORDERANN1';
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    try {
      await host.goto(`${url}/?room=${room}&host=1`);
      await host.waitForSelector('[data-testid="screen-router"]');
      await setShortRoomQuestion(host, TALLEST.order);
      await phone.goto(`${url}/join?room=${room}`);
      await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Order Phone');
      await phone.locator('button[type="submit"]').click();
      await phone.waitForSelector('[data-role="phone-waiting"]');
      await host.evaluate(() => { const { dispatch } = window.swapStore.getState(); dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
      await phone.waitForSelector('[data-role="phone-order-list"]');
      await phone.waitForTimeout(400);

      const announceSelector = '[data-role="order-move-announce"]';
      const before = await phone.evaluate((selector) => document.querySelector(selector)?.textContent, announceSelector);
      assert.equal(before, '', 'test setup: nothing is announced before any move');

      const secondStep = phone.locator('.phone-order-step').nth(1);
      // F-13: the position and the label are their own columns now (phone/PhoneVote.tsx), not one
      // combined "2. <step text>" span, so the label reads straight off its own element.
      const stepLabel = ((await secondStep.locator('.phone-order-step__label').textContent()) ?? '').trim();
      await secondStep.locator('[data-role="order-move-up"]').click();

      const after = await phone.evaluate((selector) => document.querySelector(selector)?.textContent, announceSelector);
      // TALLEST.order (q27) has 3 steps. Moving the 2nd step up puts it 1st.
      assert.equal(after, `${stepLabel} moved to position 1 of 3`, `expected the moved step and its new 1-based position, got "${after}"`);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  });
});
