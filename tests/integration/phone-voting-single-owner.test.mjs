import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withViteAndBrowser } from './render-harness.mjs';

// vax-or-fiction-phone-voting-has-two-owners-on-the-setup-shee: the row's own fix (2026-09-16,
// branch chore/vof-retire-wizard-state) made the store the only owner of phone voting, and flagged
// one case as not verified: a page reload during a fresh setup after a hands-up quick setup might
// re-derive phone voting from the venue instead of keeping the store's choice. This pins that case.
await withViteAndBrowser({}, async ({ url, browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const room = `OWNER_${randomUUID().slice(0, 8)}`;
  await page.goto(`${url}/?room=${room}&host=1`);

  const storeUrl = new URL('/src/store/game-store.ts', url).href;
  const interactionMode = () => page.evaluate(async (storeModuleUrl) => {
    const { useGameStore } = await import(storeModuleUrl);
    return useGameStore.getState().interactionMode;
  }, storeUrl);

  // Practice run is the built-in hands-up quick setup (offline venue, facilitator mode).
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Quick setups', exact: true }).click();
  await page.getByRole('button', { name: 'Use this: Practice run', exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await interactionMode(), 'facilitator', 'Practice run sets phone voting to hands up');

  await page.reload();
  await page.waitForTimeout(600);
  assert.equal(
    await interactionMode(),
    'facilitator',
    'a reload mid-setup must keep the hands-up choice, not re-derive phone voting from the venue',
  );

  await page.close();
});

console.log('PASS phone voting single owner: a reload during a fresh setup keeps the hands-up choice made by a quick setup');
