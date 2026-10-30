// Focused scored Closing proof. It mounts the current Vite modules so the test exercises
// the real stage geometry, Closing store, tokens, and CSS rather than a static render.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startVite, wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

// Own the server. A fixed port silently adopts whatever is already listening there, including another
// worktree's code, and a long-lived dev server accumulates HMR module variants that can hand this fixture a
// different store instance than the app renders from — which is how this test once went red 8/8 with no
// product defect. A fresh Vite per run on an OS-assigned port removes both. Same helper as mounted-room,
// shared via render-harness.mjs (TB1) instead of a third hand-rolled copy.

// VOF_BASE_URL still points the proof at a server you chose, e.g. a production preview.
const vite = process.env.VOF_BASE_URL ? null : await startVite();
const base = process.env.VOF_BASE_URL || vite.url;
const out = path.resolve(process.env.VOF_CLOSING_OUT || 'work/release-continuation/closing-fix');
await mkdir(out, { recursive: true });

// Playwright's own bundled headless Chromium, never the installed Google Chrome.app, which
// auto-updates out from under a pinned test (NIT-10).
const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true })
  .catch((error) => { vite?.child.kill(); throw error; }));

const questions = [
  {
    id: 'closing-split', type: 'question', kind: 'binary', index: 1, displayNumber: 1, displayCount: 3,
    statement: 'A product preference should not cost a patient durable protection when the recommended vaccine is available.',
    answer: true,
    takeaway: 'A product preference should not cost a patient durable protection when the recommended vaccine is available.',
  },
  {
    id: 'closing-second', type: 'question', kind: 'binary', index: 2, displayNumber: 2, displayCount: 3,
    statement: 'A prior dose does not establish current status.', answer: true,
    takeaway: 'A prior dose does not establish current status; use the current schedule and the patient record together.',
  },
  {
    id: 'closing-third', type: 'question', kind: 'binary', index: 3, displayNumber: 3, displayCount: 3,
    statement: 'Vaccine conversations can protect the lungs, bloodstream, and brain.', answer: true,
    takeaway: 'Vaccine conversations can protect the lungs, bloodstream, and brain when they end in an informed next step.',
  },
];

const defaultStats = {
  'closing-split': { kind: 'binary', choices: { true: 3, false: 9 }, trueCount: 3, falseCount: 9, correctPct: 25, majorityWrong: true },
  'closing-second': { kind: 'binary', choices: { true: 8, false: 4 }, trueCount: 8, falseCount: 4, correctPct: 67, majorityWrong: false },
  'closing-third': { kind: 'binary', choices: { true: 10, false: 2 }, trueCount: 10, falseCount: 2, correctPct: 83, majorityWrong: false },
};

const statsSubset = (ids) => Object.fromEntries(ids.map((id) => [id, defaultStats[id]]));

const viewports = [
  { id: 'host-1440x1000', width: 1440, height: 1000, format: 'widescreen' },
  { id: 'host-1280x720', width: 1280, height: 720, format: 'widescreen' },
  { id: 'square-1080', width: 1080, height: 1080, format: 'square' },
  { id: 'square-768', width: 768, height: 768, format: 'square' },
  { id: 'portrait-390', width: 390, height: 844, format: 'portrait' },
  { id: 'portrait-430', width: 430, height: 932, format: 'portrait' },
];

const measureText = async (page, selector) => page.locator(selector).evaluateAll((nodes) => nodes.map((element) => {
  const text = element.getBoundingClientRect();
  const row = element.closest('[data-role="closing-takeaway"]')?.getBoundingClientRect();
  const list = element.closest('ol')?.getBoundingClientRect();
  const safe = element.closest('.show-safe')?.getBoundingClientRect();
  const hud = [...document.querySelectorAll('[data-role="hud"]')]
    .map((candidate) => candidate.getBoundingClientRect())
    .find((rect) => rect.width > 0 && rect.height > 0);
  const range = document.createRange();
  range.selectNodeContents(element);
  const glyphs = [...range.getClientRects()].map((rect) => ({
    left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom),
  }));
  return {
    text: element.textContent?.trim(),
    clientHeight: Math.round(element.clientHeight),
    scrollHeight: Math.round(element.scrollHeight),
    scrollOverage: Math.max(0, Math.round((element.scrollHeight - element.clientHeight) * 100) / 100),
    glyphs,
    glyphsInsideRow: Boolean(row) && glyphs.every((rect) => rect.left >= row.left - 1 && rect.right <= row.right + 1 && rect.top >= row.top - 1 && rect.bottom <= row.bottom + 1),
    glyphsInsideList: Boolean(list) && glyphs.every((rect) => rect.left >= list.left - 1 && rect.right <= list.right + 1 && rect.top >= list.top - 1 && rect.bottom <= list.bottom + 1),
    glyphsInsideSafe: Boolean(safe) && glyphs.every((rect) => rect.left >= safe.left - 1 && rect.right <= safe.right + 1 && rect.top >= safe.top - 1 && rect.bottom <= safe.bottom + 1),
    glyphsClearHud: Boolean(hud) && glyphs.every((rect) => rect.right <= hud.left || rect.left >= hud.right || rect.bottom <= hud.top || rect.top >= hud.bottom),
    textBounds: { left: Math.round(text.left), top: Math.round(text.top), right: Math.round(text.right), bottom: Math.round(text.bottom) },
  };
}));

// One room per mount. Reusing a single room name across browser contexts left every evidence screenshot
// wearing a "Room is already owned by another host" banner that has nothing to do with Closing.
let mountCount = 0;
const mountScoredClosing = async (page, format, runQuestions = questions, runStats = defaultStats) => {
  // Hosts open at /?room=ID&host=1 (VOF-room-routing). Without host=1 a fresh tab with no
  // remembered host tab resolves to attendee mode (PhoneSuite), never PresentationSuite, so the
  // screen-router this test waits on never mounts.
  await page.goto(`${base}/?room=CLOSING_${process.pid}_${++mountCount}&host=1`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ format, questions, questionStats }) => {
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    const urlFor = (pathname) => resources.filter((url) => new URL(url).pathname === pathname).at(-1) || pathname;
    const { useGameStore } = await import(urlFor('/src/store/game-store.ts'));
    const initial = useGameStore.getInitialState();
    useGameStore.setState({
      ...initial,
      phase: 'closing',
      slideIndex: 3,
      offlineMode: false,
      formatId: format,
      run: [...questions, { id: 'closing', type: 'closing', title: 'The takeaways' }],
      roomStats: {
        accuracy: 47, mythsBusted: 0, streak: 0, bestStreak: 0, votesTotal: 18,
        questions: questionStats,
      },
    }, true);
    window.__closingFixtureState = () => {
      const state = useGameStore.getState();
      return { sessionId: state.sessionId, phase: state.phase, accuracy: state.roomStats?.accuracy, votesTotal: state.roomStats?.votesTotal };
    };
    window.__closingFixtureNewSession = () => useGameStore.setState({ sessionId: 'closing-fixture-next-session' });
  }, { format, questions: runQuestions, questionStats: runStats });
  await page.locator('[data-testid="screen-router"][data-active-screen="Closing"]').waitFor();
  await page.locator('[data-screen="closing"] [data-role="closing-split"]').waitFor();
  await page.locator('[data-role="hud-portal"]').waitFor({ state: 'attached' });
  await page.keyboard.press('h');
  await page.locator('[data-role="hud"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2_000);
};

const evidence = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    try {
      await mountScoredClosing(page, viewport.format);
      const initialTexts = await measureText(page, '[data-screen="closing"] .closing-split__headline, [data-screen="closing"] .closing-takeaway__text');
      const hudCoverage = await page.locator('[data-role="hud-portal"] [data-role="hud"] button').evaluateAll((buttons) => buttons.map((button) => ({
        text: button.textContent?.trim() || button.getAttribute('aria-label'),
        width: Math.round(button.getBoundingClientRect().width),
        height: Math.round(button.getBoundingClientRect().height),
      })).filter((button) => button.width > 0 && button.height > 0));
      assert.ok(hudCoverage.length > 0, `${viewport.id}: real HUD portal exposes controls`);
      evidence.push({ viewport: viewport.id, initialTexts, hudControls: hudCoverage });
      await page.screenshot({ path: path.join(out, `${viewport.id}-recap.png`) });

      // The regression target: scored Closing must expose a reachable, independent takeaway page.
      const takeawaysButton = page.getByRole('button', { name: /three takeaways/i });
      await assert.doesNotReject(takeawaysButton.waitFor({ state: 'visible', timeout: 1_000 }), `${viewport.id}: a reachable Three takeaways action is required`);
      // VOF-24: the advance is a facilitator control. The product focuses it so Enter fires it, and it stays
      // off the audience canvas. No explicit focus() here: that would test the harness, not the product.
      const advance = await page.evaluate(() => {
        const button = document.querySelector('[data-role="closing-show-takeaways"]');
        return { focused: document.activeElement === button, opacity: Number(getComputedStyle(button.closest('nav')).opacity) };
      });
      assert.equal(advance.focused, true, `${viewport.id}: the takeaway advance holds focus so Enter fires it`);
      assert.ok(advance.opacity < 0.01, `${viewport.id}: the takeaway advance stays off the audience canvas: ${JSON.stringify(advance)}`);
      await page.keyboard.press('Enter');
      await page.locator('[data-role="closing-takeaway-page"]').waitFor();
      await page.getByRole('heading', { name: /three to take back to the counter/i }).waitFor();
      evidence.at(-1).backNavOpacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-role="closing-back-to-recap"]').closest('nav')).opacity));
      await page.screenshot({ path: path.join(out, `${viewport.id}-takeaways.png`) });
      const takeawayTexts = await measureText(page, '[data-screen="closing"] .closing-takeaway__text');
      assert.equal(takeawayTexts.length, 3, `${viewport.id}: all three takeaways render on their dedicated page`);
      for (const item of takeawayTexts) {
        // Chrome rounds this line box short at widescreen widths even though the actual glyphs have
        // room (verified: the box holds 120px, the two-line text needs 92 to 95px, a screenshot at
        // 1440x1000 shows two clean lines with no clipping). The current bundled Chromium (playwright
        // 1.61.1) rounds 3px short at 1440px and 1280px, up from 2px when this tolerance was first set, and
        // it is identical across every takeaway's text at a given width, so it is the line-box metric
        // drifting with the browser build, not new overflow. The text glyphs, rather than a
        // parent-box heuristic, are the accessibility/visual acceptance proof.
        assert.ok(item.scrollOverage <= 3, `${viewport.id}: scroll metric exceeds harmless rounding tolerance: ${JSON.stringify(item)}`);
        assert.equal(item.glyphsInsideRow, true, `${viewport.id}: takeaway glyphs remain inside their row: ${JSON.stringify(item)}`);
        assert.equal(item.glyphsInsideList, true, `${viewport.id}: takeaway glyphs remain inside the list: ${item.text}`);
        assert.equal(item.glyphsInsideSafe, true, `${viewport.id}: takeaway glyphs remain inside the safe area: ${item.text}`);
        assert.equal(item.glyphsClearHud, true, `${viewport.id}: takeaway glyphs clear the pinned HUD: ${item.text}`);
      }
      const actions = await page.locator('[data-screen="closing"] button').evaluateAll((buttons) => buttons.map((button) => ({ text: button.textContent?.trim(), height: Math.round(button.getBoundingClientRect().height) })));
      assert.ok(actions.every((action) => action.height >= 44), `${viewport.id}: every Closing action has a 44px target: ${JSON.stringify(actions)}`);
      const mutationStyle = await page.addStyleTag({ content: '[data-role="closing-takeaways"] ol { height: 80px !important; flex: none !important; overflow: hidden !important; }' });
      const mutatedTexts = await measureText(page, '[data-screen="closing"] .closing-takeaway__text');
      assert.equal(mutatedTexts.length, 3, `${viewport.id}: mutation control sees all three rows`);
      assert.ok(mutatedTexts.some((item) => !item.glyphsInsideList || !item.glyphsInsideRow), `${viewport.id}: glyph checker turns RED when the list is forcibly clipped: ${JSON.stringify(mutatedTexts)}`);
      await mutationStyle.evaluate((style) => style.remove());
      const restoredTexts = await measureText(page, '[data-screen="closing"] .closing-takeaway__text');
      assert.ok(restoredTexts.every((item) => item.glyphsInsideRow && item.glyphsInsideList && item.glyphsInsideSafe && item.glyphsClearHud), `${viewport.id}: removing the mutation restores glyph containment`);
      evidence.at(-1).mutationCaught = true;
      const beforeBack = await page.evaluate(() => window.__closingFixtureState());
      await page.getByRole('button', { name: /back to recap/i }).click();
      await page.locator('[data-role="closing-overview"]').waitFor();
      const afterBack = await page.evaluate(() => window.__closingFixtureState());
      assert.deepEqual(afterBack, beforeBack, `${viewport.id}: local Back does not restart or rescore`);
      await takeawaysButton.focus();
      await page.keyboard.press('Enter');
      await page.locator('[data-role="closing-takeaway-page"]').waitFor();
      await page.evaluate(() => window.__closingFixtureNewSession());
      await page.locator('[data-role="closing-overview"]').waitFor();
      assert.equal(await page.locator('[data-role="closing-takeaway-page"]').count(), 0, `${viewport.id}: a new session resets the local Closing page`);
      await page.screenshot({ path: path.join(out, `${viewport.id}-recap-after-back.png`) });
    } finally {
      await context.close();
    }
  }
  // A run does not always end with three. One- and two-takeaway runs must still reach the dedicated
  // page, and the labels must stop promising three. Checked on the primary phone, where space is tightest.
  for (const variant of [{ id: 'two-takeaways', count: 2 }, { id: 'one-takeaway', count: 1 }]) {
    const label = `portrait-430-${variant.id}`;
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    try {
      const subset = questions.slice(0, variant.count).map((question, index) => ({
        ...question, displayNumber: index + 1, displayCount: variant.count,
      }));
      await mountScoredClosing(page, 'portrait', subset, statsSubset(subset.map((question) => question.id)));
      assert.equal(await page.getByRole('button', { name: /three takeaways/i }).count(), 0,
        `${label}: the "Three takeaways" label is reserved for runs that actually have three`);
      const takeawaysButton = page.getByRole('button', { name: /^takeaways$/i });
      await takeawaysButton.waitFor({ state: 'visible' });
      await takeawaysButton.focus();
      await page.keyboard.press('Enter');
      await page.locator('[data-role="closing-takeaway-page"]').waitFor();
      await page.getByRole('heading', { name: /^to take back to the counter$/i }).waitFor();
      const texts = await measureText(page, '[data-screen="closing"] .closing-takeaway__text');
      assert.equal(texts.length, variant.count, `${label}: renders exactly ${variant.count}`);
      for (const item of texts) {
        assert.ok(item.scrollOverage <= 2, `${label}: scroll metric exceeds harmless rounding tolerance: ${JSON.stringify(item)}`);
        assert.equal(item.glyphsInsideRow, true, `${label}: takeaway glyphs remain inside their row: ${item.text}`);
        assert.equal(item.glyphsInsideList, true, `${label}: takeaway glyphs remain inside the list: ${item.text}`);
        assert.equal(item.glyphsInsideSafe, true, `${label}: takeaway glyphs remain inside the safe area: ${item.text}`);
        assert.equal(item.glyphsClearHud, true, `${label}: takeaway glyphs clear the pinned HUD: ${item.text}`);
      }
      const actions = await page.locator('[data-screen="closing"] button').evaluateAll((buttons) => buttons.map((button) => ({ text: button.textContent?.trim(), height: Math.round(button.getBoundingClientRect().height) })));
      assert.ok(actions.every((action) => action.height >= 44), `${label}: every Closing action has a 44px target: ${JSON.stringify(actions)}`);
      await page.screenshot({ path: path.join(out, `${label}-takeaways.png`) });
      await page.getByRole('button', { name: /back to recap/i }).click();
      await page.locator('[data-role="closing-overview"]').waitFor();
      evidence.push({ viewport: label, takeawayCount: texts.length, takeawayTexts: texts });
    } finally {
      await context.close();
    }
  }

  await writeFile(path.join(out, 'closing-scored-metrics.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`PASS: scored Closing dedicated recap/takeaway pages across ${viewports.length} viewports, plus one- and two-takeaway runs`);
} finally {
  await browser.close();
  vite?.child.kill();
}
