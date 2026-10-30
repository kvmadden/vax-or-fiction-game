import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction.ts';

test('host format follows the viewport without changing the saved preference or run', { timeout: 120_000 }, async () => {
  await withViteAndBrowser({}, async ({ url: origin, browser }) => {
    const receipts = [];
    const output = process.env.VOF_FORMAT_EVIDENCE_DIR ?? 'work/host-format-fit/after';
    await fs.mkdir(output, { recursive: true });
    for (const preferred of [null, 'widescreen', 'square']) {
      const room = `Format${preferred ?? 'Default'}`;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const question = vaxOrFictionDeck.questions.find((item) => item.id === 'q4');
      const saved = { sessionId: 'format-fit', formatId: preferred, phase: 'locked', slideIndex: 0, run: [question], offlineMode: true, interactionMode: 'facilitator', votesLocked: true,
        timer: { enabled: false, visible: false, running: false, durationMs: 30_000, remainingMs: 30_000, endsAt: null, generation: 0, pauseReason: 'disabled' } };
      await context.addInitScript(({ room, saved }) => {
        localStorage.setItem('vrc_audio_muted', 'true');
        sessionStorage.setItem(`vof:presentation-venue:${room}`, 'offline');
        if (!sessionStorage.getItem(`vof-game-session:${room}`)) sessionStorage.setItem(`vof-game-session:${room}`, JSON.stringify({ state: saved, version: 0 }));
      }, { room, saved });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto(`${origin}/?room=${room}&host=1`, { waitUntil: 'load' });
      await page.locator('.question-shell').waitFor();
      const served = await (await page.request.get(`${origin}/src/presentation/PresentationSuite.tsx`)).text();
      const storeUrl = served.match(/import \{ useGameStore \} from "([^"]+)"/)?.[1];
      assert.ok(storeUrl, 'the probe uses the mounted host store');
      const stateIdentity = () => page.evaluate(async (module) => {
        const { useGameStore } = await import(module);
        const state = useGameStore.getState();
        return JSON.stringify({ preferred: state.formatId, sessionId: state.sessionId, run: state.run, slideIndex: state.slideIndex, phase: state.phase, seenDevices: state.seenDevices, roomStats: state.roomStats });
      }, storeUrl);
      const before = await stateIdentity();
      for (const viewport of [
        { width: 390, height: 844, expected: 'portrait' },
        { width: 430, height: 932, expected: 'portrait' },
        { width: 844, height: 390, expected: 'widescreen' },
        { width: 1280, height: 720, expected: 'widescreen' },
        { width: 1600, height: 900, expected: preferred === 'square' ? 'square' : 'widescreen' },
        { width: 390, height: 844, expected: 'portrait' },
      ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(80);
        const measured = await page.evaluate(() => {
          const stage = document.querySelector('.scaled-stage-container');
          const content = document.querySelector('.scaled-stage-content');
          const shell = document.querySelector('.question-shell');
          const prompt = shell.querySelector('h1');
          const rail = shell.querySelector('.answer-rail');
          const railBottom = rail.getBoundingClientRect().bottom;
          const rowsBottom = Math.max(...[...rail.querySelectorAll('.answer-bar')].map(row => row.getBoundingClientRect().bottom));
          const scale = content.getBoundingClientRect().width / content.offsetWidth;
          return { stageFormat: stage.dataset.format, shellFormat: shell.dataset.format, scale,
            stageWidth: content.getBoundingClientRect().width, stageHeight: content.getBoundingClientRect().height,
            promptRenderedPx: parseFloat(getComputedStyle(prompt).fontSize) * scale, railBottom, rowsBottom,
            overflow: document.documentElement.scrollWidth > innerWidth };
        });
        receipts.push({ preferred, viewport, ...measured });
        await page.screenshot({ path: path.join(output, `${preferred ?? 'default'}-${viewport.width}x${viewport.height}.png`) });
        await fs.writeFile(path.join(output, 'metrics.json'), JSON.stringify(receipts, null, 2));
        assert.equal(measured.stageFormat, viewport.expected, JSON.stringify(receipts.at(-1)));
        assert.equal(measured.shellFormat, viewport.expected, 'canvas and question layout must use the same effective format');
        assert.equal(await stateIdentity(), before, 'resizing must preserve the saved format, run, phase and results');
        assert.equal(measured.overflow, false);
        if (viewport.expected === 'portrait') {
          assert.ok(measured.promptRenderedPx >= 32.5, 'portrait prompt stays at a useful displayed size');
          assert.ok(measured.rowsBottom <= measured.railBottom + .5, 'portrait rail includes both full-height answer rows');
        }
        if (viewport.expected === 'portrait') {
          assert.ok(measured.stageHeight > 600, 'phone gameplay uses its vertical canvas instead of a tiny letterbox');
          assert.ok(measured.promptRenderedPx >= 23, `phone prompt is ${measured.promptRenderedPx}px`);
        }
      }
      if (preferred === null) {
        const assertRowContainment = async () => {
          const fit = await page.locator('.answer-rail').evaluate(rail => {
            const rows = [...rail.querySelectorAll('.answer-bar')];
            return rows.length === 2 && rows.every(row => row.getBoundingClientRect().bottom <= rail.getBoundingClientRect().bottom + .5);
          });
          assert.ok(fit, 'portrait rail includes both full-height answer rows');
        };
        const rail = page.locator('.answer-rail');
        const original = await rail.getAttribute('style');
        await rail.evaluate(element => element.style.setProperty('height', '140px', 'important'));
        try { await assert.rejects(assertRowContainment(), /both full-height answer rows/); }
        finally { await rail.evaluate((element, style) => style === null ? element.removeAttribute('style') : element.setAttribute('style', style), original); }
        await assertRowContainment();
        console.log('Portrait row-height guard: former 140px parent RED; natural-height rows GREEN.');
      }
      await page.reload({ waitUntil: 'load' });
      await page.locator('.question-shell').waitFor();
      assert.equal(await page.locator('.scaled-stage-container').getAttribute('data-format'), 'portrait');
      assert.equal(await stateIdentity(), before, 'reload retains the original preference and game state');
      await page.evaluate(async (module) => { const { useGameStore } = await import(module); useGameStore.setState({ phase: 'modePicker', slideIndex: -1 }); }, storeUrl);
      await page.locator('.presenter-setup-stage').waitFor();
      await page.locator('.setup-show-frame').waitFor();
      // The phone setup stage settles to its unscaled layout once its styles attach, so wait for that condition, not a fixed pause.
      await page.waitForFunction(() => { const stage = document.querySelector('.scaled-stage-content'); return Boolean(stage) && Math.abs(stage.getBoundingClientRect().width / stage.offsetWidth - 1) < 0.001; }, null, { timeout: 5000 }).catch(() => {});
      assert.equal(await page.locator('.presenter-setup-stage').getAttribute('data-format'), 'widescreen', 'setup is laid out for widescreen whatever the saved preference, which applies from the lobby on');
      const setupScale = await page.locator('.scaled-stage-content').evaluate(element => element.getBoundingClientRect().width / element.offsetWidth);
      assert.ok(Math.abs(setupScale - 1) < .001, 'phone setup keeps its existing unscaled responsive layout');
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(`host format coverage: ${receipts.length} viewport/preference checks, 3 reloads, 3 responsive setup neighbors`);
  });
});
