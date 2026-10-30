import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// HUD-COMPACT (2026-09-26). The design call, "A: one row + More".
// The facilitator control bar's eleven controls clip at narrow bars: 390x844 clips Skip and Hide
// at both screen edges, and the 400px-capped portrait bar (a portrait-format show at any wider
// viewport, plus a portrait host at 768x1024) clips the same way. Compact mode collapses the
// utilities cluster (Skip, Park, Timer, Sound, Full screen, Pin, Shortcuts, Hide) into a labeled
// More sheet, leaving one row of Back, Lock, the gold primary, and More.
//
// Every viewport here uses the longest-reveal question in the shipped decks, votes locked, phase
// explaining, so the Lock button reads "Locked".

const LONG_REVIEW_STATE_SCRIPT = async (formatId) => {
  const show = (await import('/src/data/decks/vax-or-fiction.ts')).vaxOrFictionDeck.questions;
  const flagship = (await import('/src/data/decks/flagship.ts')).flagshipDeck.questions;
  const longReview = [...show, ...flagship].sort((a, b) => String(b.reveal ?? '').length - String(a.reveal ?? '').length)[0];
  const store = window.lifeStore, initial = store.getInitialState();
  store.setState({
    ...initial, sessionId: 'hud-compact', offlineMode: false, interactionMode: 'polling',
    phase: 'explaining', run: [longReview], slideIndex: 0, formatId, stageReactionsEnabled: true, votesLocked: true,
  });
};

async function openExplainingQuestion(browser, url, viewport, formatId) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const page = await context.newPage();
  const room = `HC${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  await page.goto(`${url}/?room=${room}&host=1`);
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    window.lifeStore = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
  });
  await page.evaluate(LONG_REVIEW_STATE_SCRIPT, formatId);
  await page.waitForSelector('.question-beat[data-stage-beat="explanation"]');
  // PresentationSuite holds the outgoing stage format for SCREEN_FADE_S after a raw store.setState
  // jumps straight past the real setup-to-show crossfade (question-lifecycle.test.mjs's own
  // comment on this exact wait). Without it .scaled-stage-container can still read the prior
  // mount's format (stuck at "widescreen"), which is exactly what leaves a portrait bar uncapped.
  await page.waitForFunction((fmt) => document.querySelector('.scaled-stage-container')?.getAttribute('data-format') === fmt, formatId);
  if (!(await page.locator('[data-role="hud"]').isVisible())) {
    if (await page.evaluate(() => window.lifeStore.getState().hud.visible)) await page.keyboard.press('h');
    await page.keyboard.press('h');
  }
  await page.waitForSelector('[data-role="hud"]');
  await page.locator('[data-role="hud"]').hover();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  return { context, page };
}

async function readHudControls(page) {
  return page.evaluate(() => {
    const hud = document.querySelector('[data-role="hud"]');
    const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
    const buttons = [...hud.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none')
      .map((b) => ({ id: b.id, testid: b.getAttribute('data-testid'), ...rect(b) }));
    return {
      compact: hud.getAttribute('data-compact'),
      hud: rect(hud),
      buttons,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}

// NOTE (verified, not the brief's literal 1280x720): src/presentation/useViewportFormat.ts's
// formatCompatibility excludes "portrait" from its candidates whenever the viewport is landscape
// (width >= height), by design, same rule the duel-board matrix's own shownFormat column already
// relies on the other direction (a 720x900 request for widescreen is shown as portrait because
// portrait is what a TALL window admits). A landscape 1280x720 host can never actually show
// formatId "portrait": the app downgrades it to widescreen before this bar's CSS is ever reached
// (confirmed: at 1280x720 with formatId "portrait" requested, .scaled-stage-container still reads
// data-format="widescreen"). 1024x1280 is the real, reachable equivalent: still well past the old
// 900px viewport-width band, still a desktop-sized viewport, but tall enough that the app actually
// renders the portrait-format show it was asked for, capped to the same 400px bar.
const COMPACT_VIEWPORTS = [
  { width: 390, height: 844, formatId: 'portrait', label: '390x844 portrait phone' },
  { width: 430, height: 932, formatId: 'portrait', label: '430x932 portrait phone' },
  { width: 768, height: 1024, formatId: 'portrait', label: '768x1024 portrait host' },
  { width: 1024, height: 1280, formatId: 'portrait', label: '1024x1280 portrait-format show on a desktop-wide viewport (past the old 900px band)' },
];

test('compact bars keep Back, Lock, the primary and More on one row with nothing clipped or under 44px', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let checked = 0;
    for (const { width, height, formatId, label } of COMPACT_VIEWPORTS) {
      const { context, page } = await openExplainingQuestion(browser, url, { width, height }, formatId);
      try {
        const report = await readHudControls(page);
        assert.equal(report.compact, 'true', `${label}: data-compact must be true: ${JSON.stringify(report)}`);

        const byId = Object.fromEntries(report.buttons.map((b) => [b.id, b]));
        for (const id of ['hud-back', 'hud-lock', 'hud-advance', 'hud-more']) {
          assert.ok(byId[id], `${label}: ${id} must be visible in compact mode: ${JSON.stringify(report)}`);
        }
        const rowButtons = [byId['hud-back'], byId['hud-lock'], byId['hud-advance'], byId['hud-more']];
        const tops = rowButtons.map((b) => b.top);
        assert.ok(Math.max(...tops) - Math.min(...tops) < 4, `${label}: Back, Lock, the primary and More must share one row: ${JSON.stringify(report)}`);

        for (const button of report.buttons) {
          assert.ok(button.left >= -0.5 && button.right <= width + 0.5, `${label}: ${button.id || button.testid} clipped horizontally: ${JSON.stringify(report)}`);
          assert.ok(button.top >= report.hud.top - 1 && button.bottom <= report.hud.bottom + 1, `${label}: ${button.id || button.testid} clipped by the bar: ${JSON.stringify(report)}`);
          assert.ok(button.width >= 44 && button.height >= 44, `${label}: ${button.id || button.testid} is under 44px: ${JSON.stringify(report)}`);
        }
        checked++;
      } finally {
        await context.close();
      }
    }
    assert.equal(checked, COMPACT_VIEWPORTS.length);
    console.log(`HUD_COMPACT_GEOMETRY_COVERAGE viewports=${checked} oneRow=verified clipped=0 under44=0`);
  });
});

test('the More sheet lists the 8 utilities in order, a tile works, and it closes on Escape, outside pointer down, and Hide', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 390, height: 844 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      await more.waitFor({ state: 'visible' });

      // ── open + tile order ──
      await more.click();
      const sheet = page.locator('[data-role="hud-more-sheet"]');
      await sheet.waitFor({ state: 'visible' });
      const actions = await page.evaluate(() => [...document.querySelectorAll('[data-role="hud-more-sheet"] [data-hud-action]')].map((b) => b.getAttribute('data-hud-action')));
      assert.deepEqual(actions, ['skip', 'park', 'toggle-timer', 'toggle-audio', 'fullscreen', 'toggle-pin', 'open-help', 'hide-controls'], `tile order must be Skip, Park, Timer, Sound, Full screen, Pin, Shortcuts, Hide: got ${JSON.stringify(actions)}`);
      const tileSizes = await page.evaluate(() => [...document.querySelectorAll('[data-role="hud-more-sheet"] [data-hud-action]')].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
      for (const size of tileSizes) assert.ok(size.w >= 44 && size.h >= 44, `every tile must be at least 44px: ${JSON.stringify(tileSizes)}`);

      // ── a tile works: Timer toggles the store's timer ──
      const before = await page.evaluate(() => window.lifeStore.getState().timer.enabled);
      await page.locator('[data-role="hud-more-sheet"] [data-testid="hud-timer"]').click();
      const after = await page.evaluate(() => window.lifeStore.getState().timer.enabled);
      assert.notEqual(after, before, `Timer tile must toggle the store's timer.enabled (before=${before} after=${after})`);
      await sheet.waitFor({ state: 'visible' });

      // ── Escape closes it, focus returns to More ──
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached' }).catch(() => sheet.waitFor({ state: 'hidden' }));
      const focusedAfterEscape = await page.evaluate(() => document.activeElement?.id);
      assert.equal(focusedAfterEscape, 'hud-more', `focus must return to More after Escape, got ${focusedAfterEscape}`);

      // ── outside pointer down closes it ──
      await more.click();
      await sheet.waitFor({ state: 'visible' });
      await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await sheet.waitFor({ state: 'detached' }).catch(() => sheet.waitFor({ state: 'hidden' }));

      // ── Hide closes it and hides the bar ──
      await more.click();
      await sheet.waitFor({ state: 'visible' });
      await page.locator('[data-role="hud-more-sheet"] [data-testid="hud-hide"]').click();
      await page.locator('[data-role="hud-peek-trigger"]').waitFor({ state: 'visible' });
      const sheetGone = await page.locator('[data-role="hud-more-sheet"]').count();
      assert.equal(sheetGone, 0, 'the More sheet must not remain mounted once Hide hides the whole bar');

      console.log('HUD_COMPACT_SHEET_COVERAGE tiles=8 order=verified sizes=44+ timer=toggled escape=closed outsidePointer=closed hide=closed');
    } finally {
      await context.close();
    }
  });
});

const WIDE_VIEWPORTS = [
  { width: 1280, height: 720, formatId: 'widescreen', label: '1280x720 widescreen', wrap: 'nowrap', overflow: 'hidden' },
  { width: 1920, height: 1080, formatId: 'widescreen', label: '1920x1080 widescreen', wrap: 'nowrap', overflow: 'hidden' },
  { width: 768, height: 768, formatId: 'square', label: '768x768 square', wrap: 'wrap', overflow: 'visible' },
];

test('wide bars stay exactly as today: data-compact is false, the full utilities cluster renders, and there is no More button', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let checked = 0;
    for (const { width, height, formatId, label, wrap, overflow } of WIDE_VIEWPORTS) {
      const { context, page } = await openExplainingQuestion(browser, url, { width, height }, formatId);
      try {
        const report = await readHudControls(page);
        assert.equal(report.compact, 'false', `${label}: data-compact must be false: ${JSON.stringify(report)}`);
        assert.ok(!report.buttons.some((b) => b.id === 'hud-more'), `${label}: no More button on a wide bar: ${JSON.stringify(report)}`);
        const utilityIds = ['hud-skip', 'hud-park', 'hud-timer', 'hud-audio', 'hud-fullscreen', 'hud-pin', 'hud-help', 'hud-hide'];
        const present = report.buttons.map((b) => b.id);
        for (const id of utilityIds) assert.ok(present.includes(id), `${label}: ${id} must render directly in the cluster, not the sheet: ${JSON.stringify(report)}`);
        for (const button of report.buttons) assert.ok(button.width >= 44 && button.height >= 44, `${label}: ${button.id} under 44px: ${JSON.stringify(report)}`);

        const style = await page.evaluate(() => {
          const hud = document.querySelector('#presenter-hud');
          const computed = getComputedStyle(hud);
          return { overflow: computed.overflow, flexWrap: computed.flexWrap };
        });
        assert.equal(style.flexWrap, wrap, `${label}: today's flex-wrap must be unchanged: ${JSON.stringify(style)}`);
        assert.equal(style.overflow, overflow, `${label}: today's overflow must be unchanged: ${JSON.stringify(style)}`);
        checked++;
      } finally {
        await context.close();
      }
    }
    assert.equal(checked, WIDE_VIEWPORTS.length);
    console.log(`HUD_WIDE_COVERAGE viewports=${checked} compact=false utilities=8 moreButton=absent`);
  });
});

// CONTROLS-REVIEW (independent-review fixes on top of HUD-COMPACT). WARNING 1: the sheet's
// capture-phase Escape handler was stealing Escape from the restart confirmation modal. WARNING
// 2: the sheet's measured position went stale on a window resize that moved the bar without
// resizing it. WARNING 3: the coverage below this comment. NIT: the Sound tile's label sat off
// from Timer's by a couple px (an id-selector specificity collision).

test('the sheet closes the moment the restart confirmation opens, and one Escape closes the confirmation', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 390, height: 844 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      await more.click();
      const sheet = page.locator('[data-role="hud-more-sheet"]');
      await sheet.waitFor({ state: 'visible' });

      // Shift+R dispatches REQUEST_RESTART_RUN (keyboard-actions.ts). The explaining phase this
      // fixture uses is not a setup phase, so the shortcut is live.
      await page.keyboard.press('Shift+R');
      await page.locator('[data-role="restart-run-modal"]').waitFor();
      const sheetGoneOnModalOpen = await sheet.count();
      assert.equal(sheetGoneOnModalOpen, 0, 'the sheet must close the moment the restart confirmation opens, not stay open behind it');

      // One Escape must close the confirmation. If the sheet's capture-phase Escape handler were
      // still live here it would win the race and close the sheet again instead, leaving the
      // confirmation open for a second Escape.
      await page.keyboard.press('Escape');
      await page.locator('[data-role="restart-run-modal"]').waitFor({ state: 'detached' });
      const stillOpen = await page.evaluate(() => window.lifeStore.getState().restartRunConfirmationOpen);
      assert.equal(stillOpen, false, 'one Escape must close the restart confirmation');

      // The sheet is gone by now (asserted above, and reasserted here after the Escape), so
      // wherever focus lands afterward it is not landing behind a hidden sheet. That is the
      // actual defect this closes: the old bug was the sheet staying open, obscuring #hud-more,
      // while focus still moved there.
      const sheetStillGone = await sheet.count();
      assert.equal(sheetStillGone, 0, 'the sheet must stay closed after the confirmation itself closes');
      const focusInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return null;
        const rect = el.getBoundingClientRect();
        return { id: el.id, visible: rect.width > 0 && rect.height > 0 };
      });
      assert.ok(focusInfo && focusInfo.visible, `focus must land on a visible, unobscured element, not behind anything: ${JSON.stringify(focusInfo)}`);

      console.log('HUD_COMPACT_MODAL_ESCAPE_COVERAGE sheetClosedOnModalOpen=true escapeCount=1 confirmationClosed=true');
    } finally {
      await context.close();
    }
  });
});

test('the sheet tracks the bar when the window resizes, not a stale measured rect', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 1024, height: 1280 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      await more.click();
      const sheet = page.locator('[data-role="hud-more-sheet"]');
      await sheet.waitFor({ state: 'visible' });

      await page.setViewportSize({ width: 1280, height: 1400 });
      await page.waitForTimeout(200);

      const rects = await page.evaluate(() => {
        const bar = document.querySelector('[data-role="hud"]').getBoundingClientRect();
        const panel = document.querySelector('[data-role="hud-more-sheet"]').getBoundingClientRect();
        return {
          bar: { left: bar.left, right: bar.right, top: bar.top },
          sheet: { left: panel.left, right: panel.right, bottom: panel.bottom },
        };
      });
      assert.ok(Math.abs(rects.sheet.left - (rects.bar.left + 8)) <= 1, `sheet left must track the bar's left edge within 1px after resize: ${JSON.stringify(rects)}`);
      assert.ok(Math.abs(rects.sheet.right - (rects.bar.right - 8)) <= 1, `sheet right must track the bar's right edge within 1px after resize: ${JSON.stringify(rects)}`);
      const gap = rects.bar.top - rects.sheet.bottom;
      assert.ok(Math.abs(gap - 8) <= 1, `the gap between the sheet and the bar must stay the designed 8px within 1px after resize, got ${gap}: ${JSON.stringify(rects)}`);

      console.log(`HUD_COMPACT_RESIZE_TRACK_COVERAGE gap=${gap.toFixed(2)}px`);
    } finally {
      await context.close();
    }
  });
});

test('Shortcuts closes the sheet and opens the shared keyboard-help sheet', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 390, height: 844 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      await more.click();
      const sheet = page.locator('[data-role="hud-more-sheet"]');
      await sheet.waitFor({ state: 'visible' });

      await page.locator('[data-role="hud-more-sheet"] [data-testid="hud-help"]').click();
      await sheet.waitFor({ state: 'detached' }).catch(() => sheet.waitFor({ state: 'hidden' }));
      await page.locator('[data-role="keyboard-help-modal"]').waitFor();

      console.log('HUD_COMPACT_SHORTCUTS_COVERAGE sheetClosed=true helpOpened=true');
    } finally {
      await context.close();
    }
  });
});

test('leaving compact mode on a resize closes the sheet', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 390, height: 844 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      await more.click();
      const sheet = page.locator('[data-role="hud-more-sheet"]');
      await sheet.waitFor({ state: 'visible' });

      // Still under the portrait max-width:400px breakpoint (601px), so the bar stays width:100%
      // and 550px measures well past the 480px compact threshold, unlike growing the viewport
      // past 601px, where the portrait cap holds the bar at 400px and it would stay compact.
      await page.setViewportSize({ width: 550, height: 844 });
      await page.waitForFunction(() => document.querySelector('[data-role="hud"]')?.getAttribute('data-compact') === 'false');
      const sheetGone = await sheet.count();
      assert.equal(sheetGone, 0, 'leaving compact mode must close the sheet, not leave it orphaned from its trigger');

      // The sheet not being in the DOM here alone is not enough proof: isCompact also gates the
      // sheet's own render, so a stale sheetOpen=true would stay hidden by that gate and not by
      // an actual reset, and would reappear the instant compact mode returns. Coming back to a
      // compact width must NOT resurrect the sheet on its own.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('[data-role="hud"]')?.getAttribute('data-compact') === 'true');
      await page.waitForTimeout(300);
      const sheetStayedClosed = await sheet.count();
      assert.equal(sheetStayedClosed, 0, 'returning to a compact width must not resurrect a stale open sheet on its own, sheetOpen must have actually been reset');

      console.log('HUD_COMPACT_LEAVE_COVERAGE compact=false sheetClosed=true reenterCompact=sheetStaysClosed');
    } finally {
      await context.close();
    }
  });
});

test('an open sheet holds off auto-hide, and a closed one does not', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 390, height: 844 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      const bar = page.locator('[data-role="hud"]');

      // ── open sheet: the bar must stay past the delay ──
      await more.click();
      const sheet = page.locator('[data-role="hud-more-sheet"]');
      await sheet.waitFor({ state: 'visible' });
      await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
      await page.mouse.move(5, 5);
      await page.waitForTimeout(3400);
      assert.equal(await bar.isVisible(), true, 'the bar must stay visible past the auto-hide delay while the sheet is open');
      assert.equal(await sheet.isVisible(), true, 'the sheet must stay visible past the auto-hide delay too');

      // ── control: close the sheet, same wait, the bar must hide ──
      await more.click();
      await sheet.waitFor({ state: 'detached' }).catch(() => sheet.waitFor({ state: 'hidden' }));
      await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
      await page.mouse.move(5, 5);
      await page.waitForTimeout(3400);
      await page.locator('[data-role="hud-peek-trigger"]').waitFor({ state: 'visible' });
      assert.equal(await bar.isVisible(), false, 'the control: with the sheet closed and nothing focused or hovered, the bar must auto-hide');

      console.log('HUD_COMPACT_AUTOHIDE_HOLDOFF_COVERAGE sheetOpen=held sheetClosed=hidden');
    } finally {
      await context.close();
    }
  });
});

test('opening More from the keyboard moves focus to the sheet\'s first enabled tile', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 390, height: 844 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      await more.focus();
      await page.keyboard.press('Enter');
      const sheet = page.locator('[data-role="hud-more-sheet"]');
      await sheet.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'hud-skip');
      const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      assert.equal(focusedTestId, 'hud-skip', 'Skip is the first enabled tile in sheet order and must receive focus on a keyboard open');

      console.log('HUD_COMPACT_KEYBOARD_OPEN_FOCUS_COVERAGE firstEnabledTile=hud-skip focused=true');
    } finally {
      await context.close();
    }
  });
});

test('every sheet tile shares the same gap and padding, so the labels line up', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openExplainingQuestion(browser, url, { width: 390, height: 844 }, 'portrait');
    try {
      const more = page.locator('#hud-more');
      await more.click();
      await page.locator('[data-role="hud-more-sheet"]').waitFor({ state: 'visible' });

      const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-role="hud-more-sheet"] .hud-tile')].map((tile) => {
        const style = getComputedStyle(tile);
        const label = tile.querySelector('.hud-tile-label');
        const tileRect = tile.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        return { id: tile.id, gap: style.gap, padding: style.padding, tileTop: tileRect.top, labelTop: labelRect.top };
      }));

      const [first, ...rest] = tiles;
      for (const tile of rest) {
        assert.equal(tile.gap, first.gap, `every tile's gap must match (${tile.id} vs ${first.id}): ${JSON.stringify(tiles)}`);
        assert.equal(tile.padding, first.padding, `every tile's padding must match (${tile.id} vs ${first.id}): ${JSON.stringify(tiles)}`);
      }

      // The sheet is a 4-column grid (8 tiles wrap into 2 rows), so a fair baseline check groups
      // tiles by their own row (their own top position), not across the whole sheet. Sound (row
      // 1) and Timer (row 1) is the exact pair the reviewer found off, so this must catch it.
      const rows = new Map();
      for (const tile of tiles) {
        const rowKey = [...rows.keys()].find((top) => Math.abs(top - tile.tileTop) <= 2) ?? tile.tileTop;
        if (!rows.has(rowKey)) rows.set(rowKey, []);
        rows.get(rowKey).push(tile);
      }
      assert.equal(rows.size, 2, `8 tiles in a 4-column grid must form exactly 2 rows: ${JSON.stringify(tiles)}`);
      let maxSpread = 0;
      for (const [rowTop, rowTiles] of rows) {
        const tops = rowTiles.map((t) => t.labelTop);
        const spread = Math.max(...tops) - Math.min(...tops);
        maxSpread = Math.max(maxSpread, spread);
        assert.ok(spread <= 1, `every tile's label in the same row (top~${rowTop}) must sit on the same baseline within 1px, spread=${spread}: ${JSON.stringify(rowTiles)}`);
      }

      console.log(`HUD_COMPACT_TILE_PARITY_COVERAGE tiles=${tiles.length} gapMatch=true paddingMatch=true rows=${rows.size} labelBaselineSpread=${maxSpread.toFixed(2)}px`);
    } finally {
      await context.close();
    }
  });
});
