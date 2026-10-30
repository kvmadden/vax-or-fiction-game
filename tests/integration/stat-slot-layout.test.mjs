import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { webkit } from 'playwright';
import { withViteAndBrowser } from './render-harness.mjs';

// STAT-SLOT-ENGINES (round 7): W1 animated the slot's width through interpolate-size, which only
// Chromium supports, so in WebKit (and Firefox) the reply label still jumped 112 of its 115px in
// one frame. Every test below runs in Chromium and in WebKit.
// Playwright looks for its own pinned WebKit build first. When that exact build is not installed,
// the newest WebKit build in the same browsers directory is used and the substitution is logged,
// and with none at all the WebKit tests fail at once naming the install command, never a silent
// skip. Installing the pinned build (npx playwright install webkit) removes the substitution.
function webkitExecutable() {
  const expected = webkit.executablePath();
  if (fs.existsSync(expected)) return expected;
  const root = path.dirname(path.dirname(expected));
  const builds = fs.existsSync(root)
    ? fs.readdirSync(root).filter((name) => /^webkit-\d+$/.test(name)).sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)))
    : [];
  for (const build of builds) {
    const candidate = path.join(root, build, path.basename(expected));
    if (fs.existsSync(candidate)) {
      console.log(`WebKit: Playwright's pinned build ${expected} is not installed, using ${candidate} instead`);
      return candidate;
    }
  }
  throw new Error(`No Playwright WebKit build under ${root} (expected ${expected}). Install one with: npx playwright install webkit`);
}

const ENGINES = {
  chromium: (fn) => withViteAndBrowser({}, fn),
  webkit: (fn) => withViteAndBrowser({ executablePath: webkitExecutable() }, fn, { browserType: webkit }),
};

// W2 (MOT-VQA-08 regression). MOT-VQA-08's fix reserved the stat slot's 128px column always, not
// only once it had content, so every which-patient and myth reply card narrowed by that column
// even in Offline where stats never show at all (measured: the reply label lost roughly 116-172px
// at 1280x720 and 1920x1080, a local evidence file in the round 1 review worktree). This
// restores the base collapsed-while-empty rule (byte-identical to the reviewer's own "baserule"
// probe override, a local evidence file) and instead animates the Lock-time fill-in
// with @starting-style/allow-discrete, so the original MOT-VQA-08 defect (Lock reflowing the
// answer label sideways in one instant jump) stays fixed as a smooth transition.
// Starts Vite and the browser through the shared render harness (TB1), so a missing browser fails fast.



async function seedQ16(page, { offlineMode }) {
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async ({ offlineMode }) => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    window.slotStore = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
    const question = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q16');
    const initial = window.slotStore.getInitialState();
    window.slotStore.setState({
      ...initial, sessionId: 'slot', phase: 'lobby', slideIndex: -1,
      run: [initial.run.find((slide) => slide.type === 'title'), question],
      offlineMode, interactionMode: offlineMode ? 'facilitator' : 'polling',
      timer: { ...initial.timer, enabled: false, visible: false },
    });
    const { dispatch } = window.slotStore.getState();
    dispatch({ type: 'ADVANCE' });
    dispatch({ type: 'ADVANCE' });
  }, { offlineMode });
  await page.locator('.question-shell[data-phase="deliberating"]').waitFor();
  // The reveal card fades in, so let the mount settle before measuring geometry.
  await page.waitForTimeout(150);
}

async function measurePoll(page) {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll('.question-show-frame--which-patient .answer-bar')];
    return bars.map((bar) => {
      const poll = bar.querySelector('.answer-bar__poll');
      const label = bar.querySelector('p');
      const pollRect = poll?.getBoundingClientRect();
      const labelRect = label?.getBoundingClientRect();
      return {
        pollDisplay: poll ? getComputedStyle(poll).display : null,
        pollWidth: pollRect ? Math.round(pollRect.width) : null,
        labelWidth: labelRect ? Math.round(labelRect.width) : null,
        // NIT: `.length >= 0` is always true (an array length is never negative), so this never
        // actually gated anything. Dropped it rather than keep dead conditional code around.
        labelLines: label ? Math.round(label.getBoundingClientRect().height / (parseFloat(getComputedStyle(label).lineHeight) || 1)) : null,
      };
    });
  });
}

for (const engine of Object.keys(ENGINES)) for (const offlineMode of [true, false]) {
  test(`which-patient's stat slot collapses to nothing before lock and never narrows the reply card, offline=${offlineMode} (W2, ${engine})`, { timeout: 30_000 }, async () => {
    await ENGINES[engine](async ({ url, browser }) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
      const page = await context.newPage();
      try {
        await page.goto(`${url}/?room=SLOT${offlineMode ? 'OFF' : 'ON'}&host=1`);
        await seedQ16(page, { offlineMode });
        const restored = await measurePoll(page);
        assert.ok(restored.length >= 2, 'both which-patient reply cards are measured');
        for (const card of restored) {
          assert.equal(card.pollDisplay, 'none', `the empty stat slot collapses out of layout: ${JSON.stringify(card)}`);
          assert.equal(card.pollWidth, 0, `the empty stat slot reserves no width: ${JSON.stringify(card)}`);
        }
        // Fixed pass 4a (4A-11): the polling-mode branch below only ever asserted equality (the
        // mutation changes nothing further), which is never itself a RED control: an assertion that
        // could not fail no matter what CSS shipped proves nothing about the reservation it names.
        // This adds a real one, removing the beside `padding-inline-end` the reservation itself is
        // (`question-stage.css`'s own `[data-tally='beside']` rule) and asserting the label actually
        // moves wider without it, in polling mode only (the mode the reservation applies to).
        if (!offlineMode) {
          const reservationMutation = await page.addStyleTag({
            content: 'body .question-shell .question-show-frame [data-tally="beside"] :is(.answer-bar, .order-bar) { padding-inline-end: 0 !important; }',
          });
          try {
            const unreserved = await measurePoll(page);
            for (let index = 0; index < restored.length; index += 1) {
              assert.ok(
                unreserved[index].labelWidth > restored[index].labelWidth,
                `disposable padding-inline-end removal widens the reply label, proving the beside reservation is real (RED control): restored=${JSON.stringify(restored[index])} unreserved=${JSON.stringify(unreserved[index])}`,
              );
            }
          } finally {
            await reservationMutation.evaluate((element) => element.remove());
          }
          const reservationCleared = await measurePoll(page);
          assert.deepEqual(reservationCleared, restored, 'removing the disposable padding-inline-end mutation restores the exact base measurements');
          console.log(`W2 stat-slot beside-reservation guard ${engine}: restored GREEN; disposable padding-inline-end removal RED; cleared GREEN`);
        }
        // STAGE-SPEC step 9 fix (spec section 3.5): MOT-VQA-08's always-reserve rule used to be a
        // real regression against this repo's own MOT-VQA-08 fix, because the label's own end
        // padding only widened once the poll actually had content. Spec 3.5 (the design call on the
        // rebuild) now reserves that same padding from the posed beat on in polling mode, by play
        // mode rather than by beat, so the label is already at its narrower, tally-safe width here
        // and forcing the poll to render early changes nothing further about it. In hands-up play
        // (offlineMode, data-tally="none") nothing is reserved, so the old regression still holds
        // there. Updated deliberately, not re-blessed blind: this is the SAME mutation, proving the
        // OPPOSITE thing spec 3.5 intends for each play mode.
        const mutation = await page.addStyleTag({
          content: 'body .question-shell .question-show-frame .answer-bar__poll:empty { display: flex !important; min-width: 128px !important; }',
        });
        try {
          const regressed = await measurePoll(page);
          for (let index = 0; index < restored.length; index += 1) {
            if (offlineMode) {
              assert.ok(
                regressed[index].labelWidth < restored[index].labelWidth,
                `disposable always-reserve mutation narrows the reply label in hands-up play, where nothing is reserved (RED control): restored=${JSON.stringify(restored[index])} regressed=${JSON.stringify(regressed[index])}`,
              );
            } else {
              assert.equal(
                regressed[index].labelWidth, restored[index].labelWidth,
                `polling mode already reserves this same padding from posed on (spec 3.5), so forcing the poll to render early changes nothing further: restored=${JSON.stringify(restored[index])} regressed=${JSON.stringify(regressed[index])}`,
              );
            }
          }
        } finally {
          await mutation.evaluate((element) => element.remove());
        }
        // The disposable mutation's own display/min-width undo is itself a display transition
        // (reduced motion here, so it settles within a frame or two, not the full 260ms). Wait for
        // the real end state instead of asserting on a mid-transition sample.
        await page.waitForFunction(() => {
          const poll = document.querySelector('.question-show-frame--which-patient .answer-bar__poll');
          return poll && getComputedStyle(poll).display === 'none';
        }, undefined, { timeout: 2000 });
        const cleared = await measurePoll(page);
        assert.deepEqual(cleared, restored, 'removing the disposable mutation restores the exact base measurements');
        console.log(`W2 stat-slot guard ${engine} offline=${offlineMode}: restored GREEN; disposable always-reserve mutation RED; cleared GREEN`, JSON.stringify(restored));
      } finally {
        await context.close();
      }
    });
  });
}

// STAGE-SPEC step 9 fix (spec section 3.5, the design call on the rebuild): the stat slot's own
// zone is reserved from the posed beat on in polling mode now, not toggled open at Lock, so
// Lock no longer moves the reply label or resizes the poll box at all -- both stay byte-stable,
// which is exactly what the sweep's own beat-stable check (full-bank-visual.mjs) verifies at the
// card-rect level. What actually animates at Lock is the numbers fading in inside that already-
// reserved box (the poll's own opacity transition, question-stage.css). This suite is updated
// deliberately, not re-blessed blind, to assert the new mechanism instead of the retired one: the
// same width/position samples this file already knew how to take, now proving they do NOT change,
// plus a real opacity sample proving the fade itself still happens.
//
// Locks the votes on the seeded q16 page and samples the slot's width, its opacity and the reply
// label's right edge before the first frame (the travel origin) and then on every frame for
// 320ms. frameMs is the frame's own timestamp measured from the first frame after Lock, so it
// runs on the same clock as the transition itself (wall-clock time can drift a frame from it
// either way).
async function sampleLock(page) {
  return page.evaluate(async () => {
    window.slotStore.setState({ votesLocked: true, pollVotes: { q16: { a: 5, b: 11 } } });
    const bar = document.querySelector('.question-show-frame--which-patient .answer-bar');
    const poll = bar.querySelector('.answer-bar__poll');
    const label = bar.querySelector('.answer-bar__label');
    const read = (frameMs) => ({ frameMs, width: Math.round(poll.getBoundingClientRect().width), opacity: Number(getComputedStyle(poll).opacity), labelRight: label.getBoundingClientRect().right });
    const readings = [read(null)];
    const start = performance.now();
    let firstFrame = null;
    while (performance.now() - start < 320) {
      const timestamp = await new Promise((resolve) => requestAnimationFrame(resolve));
      if (firstFrame === null) firstFrame = timestamp;
      readings.push(read(Math.round(timestamp - firstFrame)));
    }
    return readings;
  });
}

// Progress against frame time, the same shape this file used for the retired width travel: by
// 30ms of animation (frameMs) opacity must be under 70% of its own 0-to-1 travel. This 260ms
// ease-out reaches 70% only after about 45ms of animation, while a snap (no transition) is already
// at 1 in the very first frame, which always counts. A dropped frame can only remove a sample,
// never add progress to one, so it cannot fail a correct run.
function opacityProgressBy30ms(samples) {
  const early = samples.filter((sample) => sample.frameMs !== null && sample.frameMs <= 30);
  const progress = Math.max(0, ...early.map((sample) => sample.opacity));
  return { frames: early.length, progress };
}

for (const engine of Object.keys(ENGINES)) test(`Lock fades the stat slot's numbers into its already-reserved box, without moving the reply label (W2, ${engine})`, { timeout: 30_000 }, async () => {
  await ENGINES[engine](async ({ url, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    try {
      await page.goto(`${url}/?room=SLOTLOCK&host=1`);
      await seedQ16(page, { offlineMode: false });
      const before = await measurePoll(page);
      for (const card of before) assert.equal(card.pollDisplay, 'none', 'starts collapsed (spec 3.5: the DOM box still collapses while empty; the padding reservation, proven above, does not depend on it)');
      const samples = await sampleLock(page);
      const distinctWidths = new Set(samples.map((sample) => sample.width));
      assert.ok(distinctWidths.size <= 2, `the poll's own box does not animate through several widths, only appears once at its final size (spec 3.5): ${JSON.stringify(samples)}`);
      const distinctLabelRights = new Set(samples.map((sample) => sample.labelRight));
      assert.ok(distinctLabelRights.size === 1, `the reply label never moves at Lock, since its own padding was already reserved at posed (spec 3.5): ${JSON.stringify(samples)}`);
      const early = opacityProgressBy30ms(samples);
      assert.ok(early.frames > 0, `the first frame after Lock must be sampled: ${JSON.stringify(samples)}`);
      assert.ok(early.progress < 0.7,
        `the numbers must be under 70% of their opacity fade by 30ms of animation, not snapped straight to visible (${Math.round(early.progress * 100)}%): ${JSON.stringify(samples)}`);
      assert.equal(samples.at(-1).opacity, 1, `the fade-in settles at fully visible: ${JSON.stringify(samples)}`);
      // Prove the check can fail in this engine: with the slot's transition disabled by a
      // disposable mutation, the same Lock snaps straight to visible and must fail it.
      await page.evaluate(() => window.slotStore.setState({ votesLocked: false, pollVotes: {} }));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.question-show-frame--which-patient .answer-bar__poll')).display === 'none');
      const mutation = await page.addStyleTag({ content: 'body .question-shell .question-show-frame .answer-bar__poll { transition: none !important; }' });
      let snapped;
      try {
        snapped = opacityProgressBy30ms(await sampleLock(page));
      } finally {
        await mutation.evaluate((element) => element.remove());
      }
      assert.ok(snapped.frames > 0 && snapped.progress >= 0.7, `disposable no-transition mutation must snap opacity past 70% by 30ms (RED control): ${JSON.stringify(snapped)}`);
      console.log(`W2 lock-time fade-in ${engine}: ${Math.round(early.progress * 100)}% of opacity travel by 30ms of animation (snap control ${Math.round(snapped.progress * 100)}%), samples ${JSON.stringify(samples)}`);
    } finally {
      await context.close();
    }
  });
});

for (const engine of Object.keys(ENGINES)) test(`reduced motion fills the stat slot at once on Lock, no multi-step animation (W2, ${engine})`, { timeout: 30_000 }, async () => {
  await ENGINES[engine](async ({ url, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    try {
      await page.goto(`${url}/?room=SLOTLOCKRM&host=1`);
      await seedQ16(page, { offlineMode: false });
      const samples = await page.evaluate(async () => {
        window.slotStore.setState({ votesLocked: true, pollVotes: { q16: { a: 5, b: 11 } } });
        const poll = document.querySelector('.question-show-frame--which-patient .answer-bar__poll');
        const readings = [];
        const start = performance.now();
        while (performance.now() - start < 100) {
          readings.push({ ms: Math.round(performance.now() - start), width: Math.round(poll.getBoundingClientRect().width) });
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return readings;
      });
      // Reduced motion collapses the transition to 0.01ms (a global rule, presentation.css), not
      // 0: React's own re-render and one paint still separate the pre- and post-Lock frames, so
      // this checks the fill-in finishes within a couple of frames, not that only one width is
      // ever observed.
      const final = samples.at(-1).width;
      const settleIndex = samples.findIndex((sample) => sample.width === final);
      assert.ok(samples[settleIndex].ms <= 34, `reduced motion must reach the settled width within about two frames, not animate through it: ${JSON.stringify(samples)}`);
      assert.ok(samples.slice(settleIndex).every((sample) => sample.width === final), `once settled the width must not keep changing: ${JSON.stringify(samples)}`);
      console.log(`W2 reduced-motion lock-time samples ${engine}: ${JSON.stringify(samples)}`);
    } finally {
      await context.close();
    }
  });
});
