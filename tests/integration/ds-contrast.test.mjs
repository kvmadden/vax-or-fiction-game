import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// A11Y-14 / DS-14. Two rendered pairings fail
// WCAG 1.4.3 (4.5:1 for normal text): the estimate question's DELIBERATING badge (cobalt text on
// panel-navy) and the restart-run confirm button (white text on the danger red). Contrast is
// measured from real getComputedStyle values on a live render, not from source, because color-mix()
// and token fallbacks make the source hex an unreliable proxy for what actually paints.
//
// The hairline border (1.30:1) that A11Y-14 also names is not fixed here. Rendering every
// hairline-bordered element across all 5 question kinds
// found exactly the pairing the audit measured (rgb(46,46,51) on rgb(16,25,43), the "Q14" metadata
// span in EstimateQuestion.tsx) plus two more of the same shape in MythAmongThree.tsx
// ("question-count" and "pending-card"). None of the four are interactive controls: no onClick, no
// role, no aria-pressed, no keyboard handler. They are decorative chrome around static labels (a
// question-number chip, a discussion-state panel explicitly commented "hidden on stage"). WCAG
// 1.4.11 governs boundaries of UI components and their states. A border around inert display text
// is not in scope, so per the brief's own rule this is left alone.

function contrastRatio(rgbA, rgbB) {
  function lin(c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
  function lum([r, g, b]) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
  const l1 = lum(rgbA); const l2 = lum(rgbB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function parseRgb(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

test('DELIBERATING badge and restart confirm button clear 4.5:1 (A11Y-14, DS-14)', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    const room = `A11Y14${Date.now() % 100000}`;
    await page.goto(`${url}/?room=${room}&host=1`);
    await page.waitForSelector('[data-testid="screen-router"]');

    await page.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
      const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
      window.a11y14Store = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
      const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
      const question = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q14');
      const initial = window.a11y14Store.getInitialState();
      window.a11y14Store.setState({
        ...initial, sessionId: 'a11y14-q14', phase: 'lobby', slideIndex: -1,
        run: [initial.run.find((slide) => slide.type === 'title'), question],
        offlineMode: false, interactionMode: 'polling',
        timer: { ...initial.timer, enabled: false, visible: false },
      });
      window.a11y14Store.getState().dispatch({ type: 'ADVANCE' });
      window.a11y14Store.getState().dispatch({ type: 'ADVANCE' });
    });
    // TW5: poll for the real condition (the badge on screen) instead of a fixed sleep.
    await page.waitForFunction(() => [...document.querySelectorAll('span')].some((n) => n.textContent?.trim() === 'DELIBERATING'));

    const badge = await page.evaluate(() => {
      const el = [...document.querySelectorAll('span')].find((n) => n.textContent?.trim() === 'DELIBERATING');
      if (!el) return null;
      const style = getComputedStyle(el);
      return { color: style.color, background: style.backgroundColor, fontSize: style.fontSize };
    });
    assert.ok(badge, 'the DELIBERATING badge must be on screen for a live q14 estimate question');
    const badgeFg = parseRgb(badge.color);
    const badgeBg = parseRgb(badge.background);
    assert.ok(badgeFg && badgeBg, `expected solid rgb colors, got ${JSON.stringify(badge)}`);
    const badgeRatio = contrastRatio(badgeFg, badgeBg);
    assert.ok(badgeRatio >= 4.5, `DELIBERATING badge contrast must be >= 4.5:1, got ${badgeRatio.toFixed(2)}:1 (${badge.color} on ${badge.background})`);

    await page.evaluate(() => window.a11y14Store.getState().dispatch({ type: 'REQUEST_RESTART_RUN' }));
    // TW5: poll for the real condition (the confirm button mounted) instead of a fixed sleep.
    await page.waitForSelector('[data-action="confirm-restart"]');
    const confirm = await page.evaluate(() => {
      const button = document.querySelector('[data-action="confirm-restart"]');
      if (!button) return null;
      const span = button.querySelector('span');
      const spanStyle = span ? getComputedStyle(span) : null;
      return {
        buttonBg: getComputedStyle(button).backgroundColor,
        textColor: spanStyle ? spanStyle.color : getComputedStyle(button).color,
        fontSize: spanStyle ? spanStyle.fontSize : getComputedStyle(button).fontSize,
      };
    });
    assert.ok(confirm, 'the restart confirm button must be reachable via REQUEST_RESTART_RUN');
    const confirmFg = parseRgb(confirm.textColor);
    const confirmBg = parseRgb(confirm.buttonBg);
    assert.ok(confirmFg && confirmBg, `expected solid rgb colors, got ${JSON.stringify(confirm)}`);
    const confirmRatio = contrastRatio(confirmFg, confirmBg);
    assert.ok(confirmRatio >= 4.5, `restart confirm button contrast must be >= 4.5:1, got ${confirmRatio.toFixed(2)}:1 (${confirm.textColor} on ${confirm.buttonBg})`);
  });
});
