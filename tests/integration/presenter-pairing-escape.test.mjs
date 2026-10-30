import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// A11Y-03 Escape (round 4, design call 2026-09-25: "Escape closes it"). Round 1 gave
// PresenterPairing a Tab trap, autofocus and focus restore on unmount (docs/VOF-DECISION-LEDGER.md,
// facilitator-focus.test.mjs's NIT-9 coverage), but left Escape alone because there was no ruling
// and no close affordance beyond the Continue button. The design call is: Escape must close the
// dialog exactly like that same Continue button, and hand focus back to whatever opened it.
//
// This launches setup plainly (no preset, venue defaults to Teams per VOF-08, so
// shouldAutoOpenPresenterPairing does not auto-open the dialog) and reopens pairing manually via
// Preflight's own "Pair presenter device" button, so the test controls a real, known trigger
// element rather than relying on the auto-open-on-launch path (where the trigger is just
// document.body, too weak a check for "focus returns where it came from").
// The orphan-on-missing-browser regression for withViteAndBrowser is covered once, for every
// rendered suite in `check` including this one, by tests/integration/missing-browser-check.test.mjs.

test('Escape closes PresenterPairing exactly like Continue does, and returns focus to the button that opened it', { timeout: 30_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const room = `A11Y03_${randomUUID().slice(0, 8)}`;
    await page.goto(`${url}/?room=${room}&host=1`);

    const trigger = page.locator('[data-role="setup-show-presenter-remote"]');
    await trigger.waitFor();
    assert.equal(await page.locator('[data-role="presenter-pairing"]').count(), 0, 'a plain launch (no venue=room) must not auto-open pairing');

    await trigger.focus();
    await trigger.click();
    const dialog = page.locator('[data-role="presenter-pairing"]');
    await dialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1, 'the mounted pairing screen is the dialog opening');

    // Round 1's mount effect autofocuses Continue on a 0ms timer; wait for that to land before
    // Escape, the same way facilitator-focus.test.mjs's Tab-trap coverage does.
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-role') === 'presenter-pairing-continue');

    await page.keyboard.press('Escape');
    // Bounded well under the test's own timeout so an unhandled Escape (the pre-fix defect)
    // reports a clear "still attached" assertion instead of the whole test timing out.
    await dialog.waitFor({ state: 'detached', timeout: 5_000 });

    const active = await page.evaluate(() => ({
      role: document.activeElement?.getAttribute('data-role') ?? null,
      tag: document.activeElement?.tagName ?? null,
    }));
    assert.equal(active.role, 'setup-show-presenter-remote', `focus must return to the button that opened the dialog, got ${JSON.stringify(active)}`);

    // Escape must behave exactly like Continue: reopening and clicking Continue leaves the same
    // detached dialog and the same focus-return contract, so the two close paths are equivalent.
    await trigger.click();
    await dialog.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-role') === 'presenter-pairing-continue');
    await page.getByRole('button', { name: "I've paired this device" }).click();
    await dialog.waitFor({ state: 'detached' });
    const activeAfterContinue = await page.evaluate(() => document.activeElement?.getAttribute('data-role') ?? null);
    assert.equal(activeAfterContinue, 'setup-show-presenter-remote', 'Continue\'s own focus-return must match Escape\'s');
  });
});
