import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// NIT-6. .showdown-meter-fill animates transform: scaleX(ratio) (MOT-VQA-02, kept for the same
// compositor-only reason the other vote-bar fills use it: a plain border-radius on that scaled
// element gets squished horizontally along with it, so a low percentage's round leading edge
// flattens toward a hard vertical line. The vertical semi-axis (4px, half the track's 8px height)
// is untouched by a horizontal-only transform. Only the horizontal semi-axis needs inverse
// compensation by the current fill ratio, so the painted result stays a true round cap at every
// percentage instead of only looking right near 100%.
// Starts Vite and the browser through the shared render harness (TB1), so a missing browser fails fast.



async function seedLineup(page) {
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    const store = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    window.meterStore = store;
    store.setState({
      sessionId: 'meter', modeId: 'full', run: [], slideIndex: 0, phase: 'revealed', showdownEnabled: true,
      showdown: null,
      seenDevices: {
        low: { nickname: 'Low Pick', team: null, joinedAt: 1, score: 10, answered: 2, correct: 1, streak: 0, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0 },
        high: { nickname: 'High Pick', team: null, joinedAt: 1, score: 8, answered: 2, correct: 1, streak: 0, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0 },
      },
    });
    store.getState().dispatch({ type: 'ENTER_SHOWDOWN' });
    const showdown = store.getState().showdown;
    // Low finalist: 1 of 20 picks (5%). High finalist: 19 of 20 (95%). Both far from the 100%
    // width where the pre-transform radius already looks round by coincidence. totalPredictions
    // is Object.keys(showdown.predictions).length (Showdown.tsx), not predictionCounts, so both
    // must be seeded consistently.
    const lowFinalist = showdown.finalists.find((finalist) => finalist.name === 'Low Pick');
    const highFinalist = showdown.finalists.find((finalist) => finalist.name === 'High Pick');
    const predictions = Object.fromEntries([
      ['voter-low-1', lowFinalist.ticket],
      ...Array.from({ length: 19 }, (_, index) => [`voter-high-${index}`, highFinalist.ticket]),
    ]);
    store.setState({
      showdown: {
        ...showdown,
        predictions,
        predictionCounts: { [lowFinalist.ticket]: 1, [highFinalist.ticket]: 19 },
      },
    });
  });
  await page.locator('[data-role="showdown-lineup"]').waitFor();
  await page.waitForTimeout(150);
}

async function measureFills(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.showdown-finalist-card')];
    return cards.map((card) => {
      const fill = card.querySelector('.showdown-meter-fill');
      const style = getComputedStyle(fill);
      const matrix = new DOMMatrixReadOnly(style.transform);
      return {
        name: card.querySelector('.showdown-finalist-name')?.textContent,
        ratio: matrix.a, // scaleX factor
        radiusPx: Number.parseFloat(style.borderTopLeftRadius),
      };
    });
  });
}

test('the showdown audience-picks meter keeps an undistorted round leading edge at every percentage (NIT-6)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    try {
      await page.goto(`${url}/?room=METER&host=1`);
      await seedLineup(page);
      const fills = await measureFills(page);
      assert.equal(fills.length, 2, 'both finalist cards are measured');
      const low = fills.find((fill) => Math.abs(fill.ratio - 0.05) < 0.02);
      const high = fills.find((fill) => Math.abs(fill.ratio - 0.95) < 0.02);
      assert.ok(low && high, `expected a ~5% and a ~95% fill: ${JSON.stringify(fills)}`);
      // The painted (post-transform) horizontal radius is radiusPx * ratio. It must land close to
      // the track's own 4px semi-axis (half its 8px height) at BOTH ends of the range, not just
      // near 100% where an undistorted flat 4px would look right by coincidence.
      const paintedLow = low.radiusPx * low.ratio;
      const paintedHigh = high.radiusPx * high.ratio;
      assert.ok(Math.abs(paintedLow - 4) < 1, `the low-percent fill's painted radius must still read ~4px: ${JSON.stringify({ low, paintedLow })}`);
      assert.ok(Math.abs(paintedHigh - 4) < 1, `the high-percent fill's painted radius must still read ~4px: ${JSON.stringify({ high, paintedHigh })}`);
      // Prove this actually discriminates: a disposable fixed-radius mutation (the pre-fix shape,
      // undistorted only near 100%) must fail the low-percent card specifically.
      const mutation = await page.addStyleTag({ content: '.showdown-meter-fill { border-radius: 4px !important; }' });
      try {
        const regressed = await measureFills(page);
        const regressedLow = regressed.find((fill) => Math.abs(fill.ratio - 0.05) < 0.02);
        const regressedPaintedLow = regressedLow.radiusPx * regressedLow.ratio;
        assert.ok(regressedPaintedLow < 1, `disposable fixed-radius mutation flattens the low-percent cap (RED control): ${JSON.stringify({ regressedLow, regressedPaintedLow })}`);
      } finally {
        await mutation.evaluate((element) => element.remove());
      }
      const cleared = await measureFills(page);
      assert.deepEqual(cleared, fills, 'removing the disposable mutation restores the exact compensated radii');
      console.log('NIT-6 meter guard: compensated radii GREEN; disposable fixed-radius mutation RED; cleared GREEN', JSON.stringify(fills));
    } finally {
      await context.close();
    }
  });
});

test('the meter cap stays round while the fill is actually animating between percentages, not just once it settles (NIT question-chrome.css --fill-ratio)', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    // Normal motion on purpose: reduced motion (the test above) collapses the 300ms transform
    // transition to nothing, which cannot exercise a mismatch that only exists mid-transition.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    try {
      await page.goto(`${url}/?room=METERANIM&host=1`);
      await seedLineup(page);
      // The low finalist starts at 5%. Move it to 60%, a fresh transform transition, and sample
      // the painted radius (radiusPx * ratio) every frame while it runs. --fill-ratio used to be a
      // plain, unregistered custom property, which cannot itself transition: it switched straight
      // to the new value the instant the style changed, while transform's own scaleX eased over
      // 300ms, so the radius calc read an already-final --fill-ratio against a still-easing
      // transform and the compensation was right only at the two ends. question-chrome.css now
      // registers it with @property and transitions it alongside transform, which this proves.
      const samples = await page.evaluate(async () => {
        const store = window.meterStore;
        const showdown = store.getState().showdown;
        const lowFinalist = showdown.finalists.find((finalist) => finalist.name === 'Low Pick');
        const highFinalist = showdown.finalists.find((finalist) => finalist.name === 'High Pick');
        store.setState({
          showdown: {
            ...showdown,
            predictionCounts: { [lowFinalist.ticket]: 12, [highFinalist.ticket]: 8 },
          },
        });
        const card = [...document.querySelectorAll('.showdown-finalist-card')].find((element) => element.querySelector('.showdown-finalist-name')?.textContent === 'Low Pick');
        const fill = card.querySelector('.showdown-meter-fill');
        const readings = [];
        const start = performance.now();
        while (performance.now() - start < 340) {
          const style = getComputedStyle(fill);
          const matrix = new DOMMatrixReadOnly(style.transform);
          readings.push({ ms: Math.round(performance.now() - start), ratio: matrix.a, radiusPx: Number.parseFloat(style.borderTopLeftRadius) });
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return readings;
      });
      const midTransition = samples.filter((sample) => sample.ratio > 0.1 && sample.ratio < 0.5);
      assert.ok(midTransition.length >= 2, `the transform must actually pass through several mid-transition ratios to sample: ${JSON.stringify(samples)}`);
      const painted = midTransition.map((sample) => sample.radiusPx * sample.ratio);
      const worst = painted.reduce((max, value) => Math.max(max, Math.abs(value - 4)), 0);
      assert.ok(worst < 1, `the painted radius must stay near 4px through the whole transition, not only once it settles (worst mid-transition miss ${worst.toFixed(2)}px): ${JSON.stringify(samples)}`);
      console.log(`NIT --fill-ratio mid-transition samples: ${JSON.stringify(samples)}`);
    } finally {
      await context.close();
    }
  });
});
