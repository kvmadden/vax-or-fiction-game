// The host title beat on the Teams venue, the one venue that authors the tagline. On 2026-09-29 the tagline
// wrapped at its longest word (the mark band had collapsed to no width) and the wordmark overflowed its band,
// so VAX sat on top of ARE YOU READY TO PLAY. This renders the real title on each host canvas and fails on
// either defect. The room venue, which carries no tagline, is the control.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

const OUT = 'work/title-layout';
const CASES = [
  { venue: 'teams', format: null, width: 1920, height: 1080 },
  { venue: 'teams', format: null, width: 1440, height: 900 },
  { venue: 'teams', format: 'Square 1:1', width: 1200, height: 1200 },
  { venue: 'teams', format: 'Portrait 9:16', width: 1080, height: 1920 },
  { venue: 'room', format: null, width: 1920, height: 1080 },
];

test('the title beat keeps the ready line clear of the wordmark and each Teams tagline sentence on one line, on every host canvas', async () => {
  await fs.mkdir(OUT, { recursive: true });
  let measured = 0;
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const [index, entry] of CASES.entries()) {
      const label = `${entry.venue}-${entry.format ? entry.format.split(' ')[0].toLowerCase() : 'widescreen'}-${entry.width}x${entry.height}`;
      const context = await browser.newContext({ viewport: { width: entry.width, height: entry.height }, reducedMotion: 'reduce' });
      await context.addInitScript(() => { try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* storage may be blocked */ } });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      await page.goto(`${url}/?room=TITLE${index}X${entry.width}&host=1&preset=curated8&venue=${entry.venue}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Your game is ready/ }).waitFor();
      if (entry.format) {
        await page.getByRole('button', { name: 'More options', exact: true }).click();
        await page.getByRole('radio', { name: entry.format, exact: true }).check();
        await page.getByRole('button', { name: 'Done', exact: true }).click();
      }
      // The presenter pairing dialog can be up at this point, and Escape closes it (presenter-pairing-escape).
      if (await page.locator('[data-role="presenter-pairing"]').isVisible()) await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
      await page.locator('[data-screen="lobby"]').waitFor();
      await page.waitForTimeout(450);
      await page.keyboard.press('ArrowRight');
      await page.locator('[data-screen="title"]').waitFor();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `${label}.png`) });
      const layout = await page.evaluate(() => {
        const box = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
        // offsetHeight is in layout pixels, like the computed line height. The stage canvas is scaled to the viewport,
        // so a transformed box height would read a single line as two on a large canvas.
        const spans = [...document.querySelectorAll('.title-source-tagline span')].map((el) => ({ height: el.offsetHeight, lineHeight: parseFloat(getComputedStyle(el).lineHeight) }));
        const stage = box('.title-stage');
        return { stage, ready: box('.title-ready-line'), vax: box('.title-source-mark .show-wordmark__vax'), fiction: box('.title-source-mark .show-wordmark__fiction'), tagline: box('.title-source-tagline'), walkin: box('.title-walkin'), spans, format: document.querySelector('.preshow-title')?.getAttribute('data-format') };
      });
      assert.ok(layout.ready && layout.vax && layout.fiction, `${label}: the title rendered its ready line and wordmark`);
      assert.equal(layout.format, entry.format ? entry.format.split(' ')[0].toLowerCase() : 'widescreen', `${label}: the chosen canvas is the one measured`);
      const stageMid = (layout.stage.left + layout.stage.right) / 2;
      // FICTION, not VAX, because the syringe hangs inside the VAX glyph box and pulls its centre right.
      assert.ok(Math.abs(((layout.fiction.left + layout.fiction.right) / 2) - stageMid) <= layout.stage.width * 0.03, `${label}: FICTION stays centred on the stage (${((layout.fiction.left + layout.fiction.right) / 2).toFixed(1)} against ${stageMid.toFixed(1)})`);
      assert.ok(layout.ready.bottom <= layout.vax.top + 2, `${label}: the ready line ends (${layout.ready.bottom.toFixed(1)}) above VAX (${layout.vax.top.toFixed(1)})`);
      if (entry.venue === 'teams') {
        assert.ok(layout.tagline, `${label}: the Teams venue shows its tagline`);
        // Two sentences: stacked on square and portrait, side by side on the wide canvas since VOF-88.
        assert.equal(layout.spans.length, 2, `${label}: two tagline sentences`);
        for (const span of layout.spans) assert.ok(span.height <= span.lineHeight * 1.5, `${label}: each tagline line stays on one line (${span.height.toFixed(1)} against ${span.lineHeight})`);
        assert.ok(layout.tagline.top >= layout.fiction.bottom - 2, `${label}: the tagline starts (${layout.tagline.top.toFixed(1)}) below FICTION (${layout.fiction.bottom.toFixed(1)})`);
        assert.ok(layout.tagline.bottom <= layout.walkin.top + 2, `${label}: the tagline ends (${layout.tagline.bottom.toFixed(1)}) above the walk-in band (${layout.walkin.top.toFixed(1)})`);
      } else {
        assert.equal(layout.tagline, null, `${label}: the room venue carries no tagline`);
      }
      measured += 1;
      await context.close();
    }
  });
  assert.equal(measured, CASES.length, 'every canvas was measured');
});
