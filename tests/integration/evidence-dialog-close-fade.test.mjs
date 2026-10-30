import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// W6 (MOT-VQA-07 close lag). Round 1 made the Details & sources dialog fade and scale in from
// @starting-style on open, but never gave the [not open] resting state its own opacity: 0, so
// closing (Escape or the Close button) removed the `open` attribute and display/overlay waited
// out the full transition duration under allow-discrete while opacity stayed 1 the entire time,
// then the dialog snapped straight to invisible. The reviewer's probe (a local evidence file
// in the round 1 review worktree) measured exactly that: opacity "1" at every close sample up to
// ms 242, then display flips to "none" at ms 325 with opacity still "1". The dialog must fade out
// too, and reduced motion must close it at once (presentation.css already collapses every real
// transition to 0.01ms under prefers-reduced-motion, so this only proves that stays true here).
// Harness copies tests/integration/phone-short-viewport.test.mjs's Vite-plus-Chrome shape per the
// implementation brief, rather than importing it: the shared-file rule reserves editing that
// file's own startVite/withViteAndBrowser helpers to the batch repairing them (TB1).



async function openEvidenceDialog(browser, url, { reducedMotion } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const page = await context.newPage();
  const room = `EVDLG${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await page.goto(`${url}/?room=${room}&host=1`);
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    const store = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
    const question = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q17');
    const initial = store.getInitialState();
    store.setState({
      ...initial, sessionId: 'evdlg', phase: 'lobby', slideIndex: -1,
      run: [initial.run.find((slide) => slide.type === 'title'), question],
      offlineMode: true, interactionMode: 'facilitator', timer: { ...initial.timer, enabled: false, visible: false },
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'ADVANCE' });
    dispatch({ type: 'ADVANCE' });
    dispatch({ type: 'REVEAL' });
    // Question.tsx only passes evidenceDetails to ShowChrome once effectivePhase === "explaining"
    // (the Details & sources trigger is an explanation-beat control), so one more ADVANCE past
    // the reveal card is required before it exists to open at all.
    dispatch({ type: 'ADVANCE' });
  });
  await page.locator('.question-shell[data-phase="explaining"]').waitFor();
  const trigger = page.getByRole('button', { name: 'Details & sources', exact: true });
  // VOF-24/VOF-42: the trigger stays at opacity 0.001 until keyboard focus reaches it. A
  // programmatic .focus() does not reliably trigger that reveal (the existing rendered coverage
  // in tests/integration/show-evidence-details.test.mjs tabs to it for the same reason), so tab
  // to it for real, the same as a presenter reaching for it.
  let reached = false;
  for (let index = 0; index < 12 && !reached; index += 1) {
    await page.keyboard.press('Tab');
    reached = await trigger.evaluate((element) => element === document.activeElement);
  }
  assert.ok(reached, 'the presenter can reach Details & sources by keyboard');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Details & sources', exact: true });
  await dialog.waitFor();
  // Let the open transition (@starting-style, ~260ms) finish settling before sampling the close.
  await page.waitForTimeout(reducedMotion === 'reduce' ? 60 : 400);
  return { context, page, trigger, dialog };
}

/** Fixed checkpoints matching the reviewer's own close-sample marks (evidenceDialog.out), sampled
 * from inside the page so real time, not IPC round trips, sets the intervals.
 * TW-4: this used to be called after a separate `page.keyboard.press('Escape')` had already
 * round-tripped out to Playwright's CDP connection and back, an unmeasured, variable gap before
 * t0 ever got set, right where the earliest and most diagnostic samples live. A native <dialog>
 * only closes on a trusted key event (confirmed: a script-dispatched Escape keydown, and even a
 * script-dispatched cancel event, do not close it), so the close cannot be triggered from inside
 * the page the same way. What can: the dialog's own close(), the same call the Close button's
 * onClick already makes, and the only thing the CSS this closes on (the open attribute) actually
 * reacts to. Escape and the Close button both end up here. Calling it as the very first line of
 * this same evaluate, with t0 set immediately after, removes the round trip instead of trying to
 * shrink it. */
async function sampleClose(page) {
  return page.evaluate(async () => {
    const dialog = document.querySelector('.show-evidence-dialog');
    dialog.close();
    const sleepUntil = (target) => new Promise((resolve) => setTimeout(resolve, Math.max(0, target - performance.now())));
    const readings = [];
    let t0 = performance.now();
    for (const ms of [1, 60, 140, 220, 300, 400]) {
      await sleepUntil(t0 + ms);
      const style = getComputedStyle(dialog);
      const backdrop = getComputedStyle(dialog, '::backdrop');
      readings.push({ ms, opacity: Number(style.opacity), display: style.display, backdropOpacity: Number(backdrop.opacity) });
    }
    return readings;
  });
}

test('the evidence dialog fades out on close instead of staying opaque through an invisible wait (W6)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openEvidenceDialog(browser, url);
    try {
      const samples = await sampleClose(page);
      const stillLaidOut = samples.filter((sample) => sample.display !== 'none');
      assert.ok(stillLaidOut.length >= 2, `the dialog must stay in the layout for more than one sampled frame while it fades: ${JSON.stringify(samples)}`);
      const fading = stillLaidOut.some((sample) => sample.opacity < 0.9);
      assert.ok(fading, `the dialog's opacity must actually move toward 0 while it is closing, not sit at 1 the whole time: ${JSON.stringify(samples)}`);
      assert.equal(samples.at(-1).display, 'none', `the dialog leaves the layout once the fade completes: ${JSON.stringify(samples)}`);
      // W4 (W6 follow-up): the blurred ::backdrop had no transition of its own, so it held full
      // strength for the whole allow-discrete wait and then snapped off with the dialog, instead
      // of fading with it.
      const backdropFading = stillLaidOut.some((sample) => sample.backdropOpacity < 0.9);
      assert.ok(backdropFading, `the backdrop's opacity must also move toward 0 while it is closing, not sit at 1 the whole time: ${JSON.stringify(samples)}`);
      assert.equal(samples.at(-1).backdropOpacity, 0, `the backdrop reaches 0 once the fade completes: ${JSON.stringify(samples)}`);
      await page.locator('.show-evidence-dialog').waitFor({ state: 'hidden', timeout: 1000 });
      console.log(`W6 close fade: ${JSON.stringify(samples)}`);
    } finally {
      await context.close();
    }
  });
});

test('reduced motion closes the evidence dialog at once, no lingering opaque frame (W6)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openEvidenceDialog(browser, url, { reducedMotion: 'reduce' });
    try {
      const samples = await sampleClose(page);
      // TW-4 removed the unmeasured round-trip before t0, so the ms:1 and ms:60 checkpoints can
      // now genuinely land inside the couple of frames a "0.01ms" transition still needs to
      // reach the compositor (the same tolerance stat-slot-layout.test.mjs's own reduced-motion
      // check documents: React's re-render and one paint still separate the frames). What must
      // not happen is holding an opaque frame all the way out past that, toward the real 260ms
      // duration this transition collapses from.
      const opaqueFrames = samples.filter((sample) => sample.display !== 'none' && sample.opacity > 0.5);
      assert.ok(opaqueFrames.length <= 2, `reduced motion must not hold a visibly opaque frame open while it waits to close: ${JSON.stringify(samples)}`);
      assert.ok(samples[2].opacity <= 0.5, `reduced motion must have settled by ms:140, two checkpoints past the couple of frames it needs: ${JSON.stringify(samples)}`);
      // W4: reduced motion collapses the backdrop's own transition to 0.01ms too.
      const opaqueBackdropFrames = samples.filter((sample) => sample.display !== 'none' && sample.backdropOpacity > 0.5);
      assert.ok(opaqueBackdropFrames.length <= 2, `reduced motion must not hold a visibly opaque backdrop open while it waits to close: ${JSON.stringify(samples)}`);
      assert.ok(samples[2].backdropOpacity <= 0.5, `the backdrop must have settled by ms:140 too: ${JSON.stringify(samples)}`);
      console.log(`W6 reduced-motion close: ${JSON.stringify(samples)}`);
    } finally {
      await context.close();
    }
  });
});
