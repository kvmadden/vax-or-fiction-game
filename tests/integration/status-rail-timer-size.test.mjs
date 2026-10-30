import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// LOOK-2 (FAC-09, design call: "Bigger digits too"). FAC-09 (round 2) grew the countdown ring to 48px,
// but the clock digits beside it (an inherited size, not its own rule) stayed close to their old
// flat size, so the ring and the digits no longer read as one proportioned line. The clock now
// shares .status-rail__phase's own font-size at every breakpoint, and the ring grows to match.
// Starts Vite and the browser through the shared render harness (TB1), so a missing browser fails fast.



async function openTimerOnQuestion(browser, url, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const page = await context.newPage();
  const room = `SRT${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  await page.goto(`${url}/?room=${room}&host=1`);
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    const store = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
    const question = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q16');
    const initial = store.getInitialState();
    store.setState({
      ...initial, sessionId: 'srt', phase: 'lobby', slideIndex: -1,
      run: [initial.run.find((slide) => slide.type === 'title'), question],
      offlineMode: false, interactionMode: 'polling',
      timer: { ...initial.timer, enabled: true, visible: true, durationMs: 20_000, remainingMs: 18_000, running: true },
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'ADVANCE' });
    dispatch({ type: 'ADVANCE' });
  });
  await page.locator('[data-role="status-rail-timer"]').waitFor();
  await page.waitForTimeout(150);
  return { context, page };
}

test('the countdown digits match the Voting open label\'s size, and the ring scales to match (LOOK-2)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      const { context, page } = await openTimerOnQuestion(browser, url, viewport);
      try {
        const metrics = await page.evaluate(() => {
          const phase = document.querySelector('.status-rail__phase');
          const clock = document.querySelector('.status-rail__clock');
          const svg = document.querySelector('.status-rail__timer svg');
          const svgRect = svg.getBoundingClientRect();
          const railRect = document.querySelector('[data-role="status-rail"]').getBoundingClientRect();
          const answerRail = document.querySelector('[data-role="answer-rail"]');
          const answer = answerRail ? answerRail.getBoundingClientRect() : null;
          const rail = { top: railRect.top, bottom: railRect.bottom, left: railRect.left, right: railRect.right };
          const stageContent = document.querySelector('.scaled-stage-content');
          return {
            phaseFontSize: getComputedStyle(phase).fontSize,
            clockFontSize: getComputedStyle(clock).fontSize,
            ringWidth: svgRect.width,
            ringHeight: svgRect.height,
            rail,
            answer: answer ? { top: answer.top, bottom: answer.bottom, left: answer.left, right: answer.right } : null,
            // --stage-scale is the real applied transform: scale() factor (ScaledStage.tsx). The
            // authored font-size above is unaffected by that transform (computed style reports
            // the pre-transform CSS value, not the painted size), so it cannot be used to derive
            // the scale; this custom property is the one source of truth for it.
            stageScale: Number.parseFloat(getComputedStyle(stageContent).getPropertyValue('--stage-scale')),
          };
        });
        assert.equal(metrics.clockFontSize, metrics.phaseFontSize, `${viewport.width}x${viewport.height}: the clock digits must match the Voting open label's font-size: ${JSON.stringify(metrics)}`);
        assert.ok(Number.isFinite(metrics.stageScale) && metrics.stageScale > 0, `${viewport.width}x${viewport.height}: --stage-scale must be a real number: ${JSON.stringify(metrics)}`);
        const expectedRing = 56 * metrics.stageScale;
        assert.ok(
          Math.abs(metrics.ringWidth - expectedRing) < 1 && Math.abs(metrics.ringHeight - expectedRing) < 1,
          `${viewport.width}x${viewport.height}: the ring must render at the new 56px authored size scaled with the stage (expected ~${expectedRing.toFixed(1)}px): ${JSON.stringify(metrics)}`,
        );
        // NIT: this used to be `if (metrics.answer) { ... }`, silently skipping the collision
        // check with no failure and no warning whenever the answer rail was not found, which
        // would also silently hide a genuine regression (the wrong phase, a renamed selector)
        // instead of surfacing it. q16 is a which-patient question and this fixture reaches
        // "deliberating" (ADVANCE, ADVANCE from lobby with voting open), so the answer rail must
        // exist here.
        assert.ok(metrics.answer, `${viewport.width}x${viewport.height}: the answer rail must be present at this phase to check the collision at all: ${JSON.stringify(metrics)}`);
        const { rail, answer } = metrics;
        const overlaps = rail.left < answer.right && rail.right > answer.left && rail.top < answer.bottom && rail.bottom > answer.top;
        assert.equal(overlaps, false, `${viewport.width}x${viewport.height}: the grown pill must not collide with the answer rail: ${JSON.stringify(metrics)}`);
        console.log(`LOOK-2 ${viewport.width}x${viewport.height}:`, JSON.stringify(metrics));
      } finally {
        await context.close();
      }
    }
  });
});
