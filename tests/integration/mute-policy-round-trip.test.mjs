import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// TW-6 (MUTE-LEAK, VOF-25). applyInRoomWalkinMutePolicy and applyOnlineMeetingMutePolicy
// (src/engine/audio-store.ts) were tested only as pure functions against a mocked localStorage and
// audio store. Nothing rendered PresentationSuite.tsx and drove a real venue change through the UI,
// so a regression at either of its two call sites (the useLayoutEffect at :100-101 that reacts to
// every venue change, and the imperative call inside applyVenue at :118-119 for the one that comes
// from clicking a venue radio) would have passed every existing test. This proves the full round
// trip a real host performs: Online meeting starts muted with no explicit preference on record, In
// the room unmutes for the walk-in, and going back to Online meeting must re-mute rather than leave
// the walk-in unmute in place (the original VOF-25 bug: the room policy only ever unmutes, so
// something else must restore Online meeting's own mute).
//
// The mute button only mounts once !isSetupPhase (src/presentation/PresentationSuite.tsx:241), and
// the venue radios only mount during setup, so each check goes through a real setup <-> lobby round
// trip rather than reading the audio store directly, to exercise the actual rendered HUD state.
test('a venue round trip through Online meeting, In the room, and back to Online meeting mutes, unmutes, and re-mutes the HUD with no vrc_audio_muted preset', { timeout: 60_000 }, async () => {
  await withViteAndBrowser(undefined, async ({ url, browser }) => {
    // Compact width (getInitialHudVisibility, src/facilitator/hud-auto-hide.ts): the HUD starts
    // collapsed at desktop widths and only starts visible at <= 600px, so this uses the same
    // compact viewport tests/integration/facilitator-focus.test.mjs already relies on for the HUD.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      // Deliberately no addInitScript setting vrc_audio_muted: this proves the no-explicit-preference
      // path, the one both mute policies condition their behavior on.
      const page = await context.newPage();
      const room = `MUTE_${randomUUID().slice(0, 8)}`;

      async function openLobby() {
        await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
        await page.locator('[data-screen="lobby"]').waitFor();
        // HUD-COMPACT: at this compact width Mute lives inside the More sheet, not the visible
        // cluster, so open it before waiting on hud-mute by testid. The bar (and this sheet with
        // it) unmounts on every trip back to setup, so this reopens fresh each call.
        await page.getByRole('button', { name: 'More controls', exact: true }).click();
        await page.locator('[data-testid="hud-mute"]').waitFor({ state: 'visible' });
      }

      async function readMuted() {
        return page.locator('[data-testid="hud-mute"]').getAttribute('aria-pressed');
      }

      async function backToSetup() {
        await page.keyboard.press('ArrowLeft');
        // ScreenRouter crossfades screens over SCREEN_FADE_S (260ms, src/ui/screen-fade.ts): the
        // outgoing lobby screen can still be mounted (and intercept pointer events) the instant the
        // incoming preFlight screen attaches. Wait for exactly one [data-screen] element before
        // clicking a venue radio, the same settling tests/integration/keyboard-single-owner.test.mjs
        // (TW-9) polls for, rather than a fixed guess at the crossfade duration.
        await page.waitForFunction(() => {
          const screens = document.querySelectorAll('[data-screen]');
          return screens.length === 1 && screens[0].getAttribute('data-screen') === 'preFlight';
        });
      }

      // Deliberately no addInitScript call here: other rendered suites set localStorage vrc_audio_muted
      // to start from a known, deterministic mute state, but that preset is exactly the "explicit
      // choice on record" both mute policies check for, so setting it would make this test pass
      // without ever exercising the no-preference path VOF-25 and MUTE-LEAK are both about.
      await page.goto(`${url}/?room=${room}&host=1`, { waitUntil: 'networkidle' });

      const radios = () => page.locator('.setup-venue-row [role="radio"]');
      await radios().first().waitFor();
      assert.equal(await radios().first().getAttribute('aria-checked'), 'true', 'Teams (Online meeting) is the VOF-08 default');

      await openLobby();
      assert.equal(await readMuted(), 'true', 'Online meeting must start muted with no explicit preference on record');

      await backToSetup();
      await radios().nth(1).click();
      assert.equal(await radios().nth(1).getAttribute('aria-checked'), 'true', 'In the room is now selected');
      await openLobby();
      assert.equal(await readMuted(), 'false', 'In the room must unmute the walk-in with no explicit preference on record');

      await backToSetup();
      await radios().first().click();
      assert.equal(await radios().first().getAttribute('aria-checked'), 'true', 'Online meeting is selected again');
      await openLobby();
      assert.equal(await readMuted(), 'true', 'MUTE-LEAK: returning to Online meeting must re-mute, not leave the In the room unmute in place');
    } finally {
      // NIT: closed in a finally, so a failed assertion above never leaves the context open.
      await context.close();
    }
  });
});
