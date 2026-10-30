import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startInProcessVite, wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

// Rendered focus-management proof for one HUD-batch item and one setup item: A11Y-02 (the HUD
// auto-hide blur has no handoff to the peek tab) and A11Y-13, RULED by VOF-46 (round 3, W1): the
// Preflight venue radiogroup must NOT respond to arrow keys, so a clicker press cannot flip venue
// and unmute a Teams show. Same self-sufficient harness shape as
// tests/integration/keyboard-single-owner.test.mjs: a Vite server on a free port, Playwright's
// bundled headless Chromium (NIT-10, folded into TB1), one browser shared by both checks.
// TW-5: startInProcessVite races Vite's in-process startup against a bound, so a hung plugin or a
// config that never resolves can no longer hang this file's top-level await (and so `check`)
// forever with no output.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ownServer = process.env.VOF_BASE_URL
  ? null
  : await startInProcessVite({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
const base = process.env.VOF_BASE_URL || ownServer.resolvedUrls.local[0].replace(/\/$/, '');

// TB1: a browser-launch failure must not leak the Vite dev server this file just started.
let browser;
try {
  browser = await chromium.launch({ headless: true });
  // FLAKE (phone-flake brief): see render-harness.mjs's neutralizeViteAutoReload for why.
  wrapBrowserAgainstViteAutoReload(browser);
} catch (error) {
  await ownServer?.close();
  throw error;
}

async function verifyHudPeekFocusHandoff() {
  // The peek tab is deliberately display:none on wide/desktop canvases (question-chrome.css,
  // VOF-25: a peek tab in the Teams letterbox would put facilitator-only chrome on the shared
  // screen). It only renders at compact host widths (@media max-width: 600px, the same threshold
  // getInitialHudVisibility uses), so that is the width this defect is reachable at.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    await page.goto(`${base}/?room=FOCUS_${randomUUID().slice(0, 8)}&host=1`);
    await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
    await page.locator('[data-screen="lobby"]').waitFor();
    await page.getByRole('button', { name: /Open the stage/ }).click();
    await page.getByRole('button', { name: 'Start Session' }).click();
    await page.locator('[data-screen="instructions"]').waitFor();
    await page.waitForTimeout(350);
    // VOF-88: the first press starts the 3-2-1 and a second skips it, so question 1 lands at once and
    // the HUD has not idled out (it hides after 2.5 s, shorter than the count).
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-role="intro-countdown"]').waitFor();
    await page.waitForTimeout(350);
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-screen="question"][data-question-id]').first().waitFor();

    // Compact widths start with the HUD already visible via local state (getInitialHudVisibility),
    // but the store's own hud.visible still starts false, so the first H press only catches the
    // store up (HUD_SHOW) rather than hiding anything yet. The second press is the real hide.
    const hud = page.locator('[data-role="hud"]');
    await hud.waitFor({ state: 'visible' });
    // HUD-COMPACT: at this compact width (390, <= the 480px threshold) Mute lives inside the More
    // sheet, not the visible cluster, so open it once before reaching hud-mute by testid.
    await page.getByRole('button', { name: 'More controls', exact: true }).click();
    const muteButton = page.locator('[data-testid="hud-mute"]');
    await muteButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'hud-mute', 'the mute button must actually hold focus before the hide');
    await page.keyboard.press('h');
    await page.waitForTimeout(150);
    await muteButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'hud-mute', 'refocus the mute button before the real hide');

    // H again suppresses the HUD (HUD_HIDE, releaseFocus:true, suppress:true). Today the focused
    // button is blurred with nothing focused after, so a keyboard user's place is lost.
    await page.keyboard.press('h');
    await page.locator('[data-role="hud-peek-trigger"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-role') === 'hud-peek-trigger');
    const activeRole = await page.evaluate(() => document.activeElement?.getAttribute('data-role'));
    assert.equal(activeRole, 'hud-peek-trigger', 'focus must hand off to the peek tab when the HUD auto-hides the focused button');
  } finally {
    await page.close();
  }
}

// W1 / A11Y-13 RULED by VOF-46: "the arrows, PageUp, PageDown, Space, Enter and S do nothing"
// on setup. A clicker's arrow press must not flip the venue radiogroup (and, via
// applyInRoomWalkinMutePolicy, unmute a Teams/Online-meeting show mid-share). This replaces the
// round 1 test that asserted the opposite (arrow-key selection), which collided with the ruling.
// W4 (CONTROLS-REVIEW): verifyHudPeekFocusHandoff above only exercises inHud's sheet branch
// (moreSheetRef.current?.contains(active), a focused sheet tile). This covers the original
// branch, node.contains(active): a button that is a direct descendant of the bar itself, not
// the detached sheet. #hud-more sits directly inside the bar even in compact mode, since it is
// the sheet's own trigger, so the same 390px width and the same hide check both apply.
async function verifyHudPeekFocusHandoffBarBranch() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    await page.goto(`${base}/?room=FOCUS_BAR_${randomUUID().slice(0, 8)}&host=1`);
    await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
    await page.locator('[data-screen="lobby"]').waitFor();
    await page.getByRole('button', { name: /Open the stage/ }).click();
    await page.getByRole('button', { name: 'Start Session' }).click();
    await page.locator('[data-screen="instructions"]').waitFor();
    await page.waitForTimeout(350);
    // VOF-88: the first press starts the 3-2-1 and a second skips it, so question 1 lands at once and
    // the HUD has not idled out (it hides after 2.5 s, shorter than the count).
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-role="intro-countdown"]').waitFor();
    await page.waitForTimeout(350);
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-screen="question"][data-question-id]').first().waitFor();

    const hud = page.locator('[data-role="hud"]');
    await hud.waitFor({ state: 'visible' });

    const moreButton = page.locator('#hud-more');
    await moreButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'hud-more', 'More must actually hold focus before the hide');
    await page.keyboard.press('h');
    await page.waitForTimeout(150);
    await moreButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'hud-more', 'refocus More before the real hide');

    await page.keyboard.press('h');
    await page.locator('[data-role="hud-peek-trigger"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-role') === 'hud-peek-trigger');
    const activeRole = await page.evaluate(() => document.activeElement?.getAttribute('data-role'));
    assert.equal(activeRole, 'hud-peek-trigger', 'focus must hand off to the peek tab from a button directly inside the bar too, not only from inside the sheet');
  } finally {
    await page.close();
  }
}

async function verifyPreflightVenueArrowKeysDoNothing() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    await page.goto(`${base}/?room=RADIO_${randomUUID().slice(0, 8)}&host=1`);
    const radios = page.locator('.setup-venue-row [role="radio"]');
    await radios.first().waitFor();
    assert.equal(await radios.count(), 3, 'Teams, In the room, Offline');

    // VOF-08: Teams is the default.
    const [teams, room, offline] = await radios.all();
    assert.equal(await teams.getAttribute('aria-checked'), 'true', 'Teams stays the VOF-08 default');

    await teams.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), await teams.textContent());

    // VOF-46: arrows do nothing on setup. No amount of waiting turns a no-op into a pass here,
    // so this margin is a deliberate, modest allowance for any change to have occurred if the
    // regression came back, not a poll for a state that is expected to arrive.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    assert.equal(await teams.getAttribute('aria-checked'), 'true', 'ArrowRight must not change the venue on setup (VOF-46)');
    assert.equal(await room.getAttribute('aria-checked'), 'false');
    assert.equal(await offline.getAttribute('aria-checked'), 'false');

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    assert.equal(await teams.getAttribute('aria-checked'), 'true', 'ArrowLeft must not change the venue on setup (VOF-46)');

    // Mouse selection is untouched by removing arrow-key handling from the radiogroup.
    await room.click();
    assert.equal(await room.getAttribute('aria-checked'), 'true', 'mouse click still selects a venue');
    await teams.click();
    assert.equal(await teams.getAttribute('aria-checked'), 'true', 'restore Teams so the rest of the page is left as found');

    assert.equal(await page.locator('[data-screen="preFlight"]').count(), 1, 'must not have left setup');
  } finally {
    await page.close();
  }
}

async function verifyPairingSuppressesHelpKey() {
  // NIT-9: FAC-10 auto-opens the private PresenterPairing dialog (aria-modal, its own Tab trap)
  // on first paint for a venue=room launch. Before this fix ? still opened the keyboard help
  // sheet underneath it (z-index 50 under the pairing dialog's 80), and the two dialogs' Tab
  // traps fought over focus.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const room = `PAIR_${randomUUID().slice(0, 8)}`;
    await page.goto(`${base}/?preset=curated8&venue=room&host=1&room=${room}`);
    await page.locator('[data-role="presenter-pairing"]').waitFor();

    await page.keyboard.press('?');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('[data-role="keyboard-help-modal"]').count(), 0, '? must not open help under the open pairing dialog');
    assert.equal(await page.locator('[data-role="presenter-pairing"]').count(), 1, 'the pairing dialog itself must stay open and in front');

    // Once pairing is dismissed, ? goes back to opening help as normal.
    await page.getByRole('button', { name: "I've paired this device" }).click();
    await page.locator('[data-role="presenter-pairing"]').waitFor({ state: 'detached' });
    await page.keyboard.press('?');
    await page.locator('[data-role="keyboard-help-modal"]').waitFor();
  } finally {
    await page.close();
  }
}

// NITS3 / item 2: closing the keyboard shortcuts help sheet must hand focus back to whatever
// opened it. Reported RED: focus dropped to <body> after close, including from the wide bar's
// own persistent #hud-help button, not only the compact More sheet's self-closing tile.
async function goToQuestionScreen(page, room) {
  await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  await page.goto(`${base}/?room=${room}&host=1`);
  await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
  await page.locator('[data-screen="lobby"]').waitFor();
  await page.getByRole('button', { name: /Open the stage/ }).click();
  await page.getByRole('button', { name: 'Start Session' }).click();
  await page.locator('[data-screen="instructions"]').waitFor();
  await page.waitForTimeout(350);
  // VOF-88: start the 3-2-1, then skip it, so question 1 lands at once.
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-role="intro-countdown"]').waitFor();
  await page.waitForTimeout(350);
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-screen="question"][data-question-id]').first().waitFor();
  // Wide/desktop viewports start with the HUD auto-hidden (getInitialHudVisibility only defaults
  // visible at <= 600px). Only compact widths show it on first paint.
  if (!(await page.locator('[data-role="hud"]').isVisible())) {
    await page.keyboard.press('h');
  }
  await page.locator('[data-role="hud"]').waitFor({ state: 'visible' });
  await page.locator('[data-role="hud"]').hover();
}

async function verifyWideBarHelpFocusRestore() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(15_000);
  try {
    await goToQuestionScreen(page, `HELP_WIDE_${randomUUID().slice(0, 8)}`);
    const helpButton = page.locator('#hud-help');
    await helpButton.click();
    await page.locator('[data-role="keyboard-help-modal"]').waitFor();
    await page.locator('[data-role="keyboard-help-close"]').click();
    await page.locator('[data-role="keyboard-help-modal"]').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'hud-help');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'hud-help', 'the wide bar Shortcuts button must reclaim focus once the sheet closes');
  } finally {
    await page.close();
  }
}

async function verifyCompactMoreSheetHelpFocusRestore() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15_000);
  try {
    await goToQuestionScreen(page, `HELP_MORE_${randomUUID().slice(0, 8)}`);
    await page.locator('#hud-more').click();
    const shortcutsTile = page.locator('[data-testid="hud-help"]');
    await shortcutsTile.waitFor();
    await shortcutsTile.click();
    await page.locator('[data-role="keyboard-help-modal"]').waitFor();
    // The More sheet closes itself the instant help opens (HUD.tsx's helpOpened subscribe), so
    // the tile that was clicked is gone by the time the sheet closes. #hud-more, the button that
    // actually opened the sheet the tile lived in, is what must reclaim focus.
    assert.equal(await shortcutsTile.count(), 0, 'the More sheet must have closed under the help sheet');
    await page.locator('[data-role="keyboard-help-close"]').click();
    await page.locator('[data-role="keyboard-help-modal"]').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'hud-more');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'hud-more', 'focus must land on #hud-more since the tile that opened help no longer exists');
  } finally {
    await page.close();
  }
}

async function verifyQuestionMarkHelpFocusRestore() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(15_000);
  try {
    await goToQuestionScreen(page, `HELP_QMARK_${randomUUID().slice(0, 8)}`);
    // Focus a stable, unrelated HUD control before opening help with the ? key, so the assertion
    // proves ? returns focus to whatever had it, not merely that it lands on the ? shortcut's
    // own trigger like the wide-bar mouse case already covers.
    const muteButton = page.locator('[data-testid="hud-mute"]');
    await muteButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'hud-mute', 'Mute must actually hold focus before opening help with ?');
    await page.keyboard.press('?');
    await page.locator('[data-role="keyboard-help-modal"]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-role="keyboard-help-modal"]').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'hud-mute');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'hud-mute', '? then Escape must return focus to whatever was focused beforehand');
  } finally {
    await page.close();
  }
}

try {
  await verifyHudPeekFocusHandoff();
  await verifyHudPeekFocusHandoffBarBranch();
  await verifyPreflightVenueArrowKeysDoNothing();
  await verifyPairingSuppressesHelpKey();
  await verifyWideBarHelpFocusRestore();
  await verifyCompactMoreSheetHelpFocusRestore();
  await verifyQuestionMarkHelpFocusRestore();
  console.log('PASS facilitator focus management: HUD auto-hide hands off to the peek tab from both the sheet and the bar itself, the Preflight venue radiogroup ignores arrow keys per VOF-46, pairing suppresses the help key, and the shortcuts help sheet restores focus to its opener from the wide bar, the compact More sheet, and the ? key');
} finally {
  await browser.close();
  await ownServer?.close();
}
