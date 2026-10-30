import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

async function openPort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return address.port;
}

async function startVite() {
  const port = await openPort();
  const child = spawn(
    path.resolve('node_modules/.bin/vite'),
    ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Vite did not start:\n${output}`));
    }, 15_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes(`127.0.0.1:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Vite exited ${code}:\n${output}`));
    });
  });
  await ready;
  return { child, port, origin: `http://127.0.0.1:${port}` };
}

test('wordmark does not overflow box on title, lobby, and phone join', async (t) => {
  const { child, origin } = await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));

  try {
    const room = 'QA22';

    // 1. Title surface (1440x900)
    await t.test('title wordmark scrollWidth <= clientWidth and syringe does not overflow box', async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const state = {
        phase: 'entering',
        slideIndex: 0,
        formatId: 'widescreen',
        modeId: 'curated15',
        activePresetId: 'curated15',
        interactionMode: 'polling',
        leaderboardEnabled: true,
        offlineMode: false,
        seenDevices: {},
      };
      await page.addInitScript(({ state, room }) => {
        sessionStorage.setItem('vof-host-tab:' + room, '1');
        sessionStorage.setItem('vof:presentation-venue:' + room, 'room');
        sessionStorage.setItem('vof-game-session:' + room, JSON.stringify({ state, version: 0 }));
      }, { state, room });

      await page.goto(`${origin}/?room=${room}&host=1&venue=room`, { waitUntil: 'domcontentloaded' });
      await page.locator('.title-source-mark').waitFor({ state: 'attached', timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const wm = document.querySelector('.title-source-mark .show-wordmark');
        const syr = document.querySelector('.title-source-mark .show-wordmark__syringe');
        const q = document.querySelector('.title-source-mark .show-wordmark__question');
        const vax = document.querySelector('.title-source-mark .show-wordmark__vax');
        const wmRect = wm.getBoundingClientRect();
        const syrRect = syr.getBoundingClientRect();
        const qRect = q.getBoundingClientRect();

        let xLeftVsWmLeft = 0;
        let xRightVsWmRight = 0;
        if (vax) {
          const textNode = Array.from(vax.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes('VAX'));
          if (textNode) {
            const xIdx = textNode.textContent.indexOf('X');
            if (xIdx !== -1) {
              const range = document.createRange();
              range.setStart(textNode, xIdx);
              range.setEnd(textNode, xIdx + 1);
              const xRect = range.getBoundingClientRect();
              xLeftVsWmLeft = xRect.left - wmRect.left;
              xRightVsWmRight = xRect.right - wmRect.right;
            }
          }
        }

        return {
          scrollWidth: wm.scrollWidth,
          clientWidth: wm.clientWidth,
          syrRightVsWmRight: syrRect.right - wmRect.right,
          qRightVsWmRight: qRect.right - wmRect.right,
          xLeftVsWmLeft,
          xRightVsWmRight,
        };
      });

      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth,
        `Title wordmark scrollWidth (${metrics.scrollWidth}) must be <= clientWidth (${metrics.clientWidth})`,
      );
      assert.ok(
        metrics.syrRightVsWmRight <= 0.5,
        `Title syringe right edge must not stick past wordmark box (diff: ${metrics.syrRightVsWmRight})`,
      );
      assert.ok(
        metrics.qRightVsWmRight <= 0.5,
        `Title ? right edge must not stick past wordmark box (diff: ${metrics.qRightVsWmRight})`,
      );
      assert.ok(
        metrics.xLeftVsWmLeft >= -0.5,
        `Title X left edge must stay inside wordmark box (diff: ${metrics.xLeftVsWmLeft})`,
      );
      assert.ok(
        metrics.xRightVsWmRight <= 0.5,
        `Title X right edge must not stick past wordmark box (diff: ${metrics.xRightVsWmRight})`,
      );
      await page.close();
    });

    // 2. Phone join surface (390x844)
    await t.test('phone join wordmark scrollWidth <= clientWidth and syringe does not overflow box', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${origin}/join?room=${room}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.phone-hero-mark').waitFor({ state: 'attached', timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const wm = document.querySelector('.phone-hero-mark .show-wordmark--stacked');
        const syr = document.querySelector('.phone-hero-mark .show-wordmark__syringe');
        const q = document.querySelector('.phone-hero-mark .show-wordmark__question');
        const vax = document.querySelector('.phone-hero-mark .show-wordmark__vax');
        const wmRect = wm.getBoundingClientRect();
        const syrRect = syr.getBoundingClientRect();
        const qRect = q.getBoundingClientRect();

        let xLeftVsWmLeft = 0;
        let xRightVsWmRight = 0;
        if (vax) {
          const textNode = Array.from(vax.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes('VAX'));
          if (textNode) {
            const xIdx = textNode.textContent.indexOf('X');
            if (xIdx !== -1) {
              const range = document.createRange();
              range.setStart(textNode, xIdx);
              range.setEnd(textNode, xIdx + 1);
              const xRect = range.getBoundingClientRect();
              xLeftVsWmLeft = xRect.left - wmRect.left;
              xRightVsWmRight = xRect.right - wmRect.right;
            }
          }
        }

        return {
          scrollWidth: wm.scrollWidth,
          clientWidth: wm.clientWidth,
          syrRightVsWmRight: syrRect.right - wmRect.right,
          qRightVsWmRight: qRect.right - wmRect.right,
          xLeftVsWmLeft,
          xRightVsWmRight,
        };
      });

      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth,
        `Phone join wordmark scrollWidth (${metrics.scrollWidth}) must be <= clientWidth (${metrics.clientWidth})`,
      );
      assert.ok(
        metrics.syrRightVsWmRight <= 0.5,
        `Phone join syringe right edge must not stick past wordmark box (diff: ${metrics.syrRightVsWmRight})`,
      );
      assert.ok(
        metrics.qRightVsWmRight <= 0.5,
        `Phone join ? right edge must not stick past wordmark box (diff: ${metrics.qRightVsWmRight})`,
      );
      assert.ok(
        metrics.xLeftVsWmLeft >= -0.5,
        `Phone join X left edge must stay inside wordmark box (diff: ${metrics.xLeftVsWmLeft})`,
      );
      assert.ok(
        metrics.xRightVsWmRight <= 0.5,
        `Phone join X right edge must not stick past wordmark box (diff: ${metrics.xRightVsWmRight})`,
      );
      await page.close();
    });

    // 3. Lobby surface (1440x900)
    await t.test('lobby wordmark scrollWidth <= clientWidth', async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const state = {
        phase: 'lobby',
        slideIndex: -1,
        formatId: 'widescreen',
        modeId: 'curated15',
        activePresetId: 'curated15',
        interactionMode: 'polling',
        leaderboardEnabled: true,
        offlineMode: false,
        seenDevices: {},
      };
      await page.addInitScript(({ state, room }) => {
        sessionStorage.setItem('vof-host-tab:' + room, '1');
        sessionStorage.setItem('vof:presentation-venue:' + room, 'room');
        sessionStorage.setItem('vof-game-session:' + room, JSON.stringify({ state, version: 0 }));
      }, { state, room });

      await page.goto(`${origin}/?room=${room}&host=1&venue=room`, { waitUntil: 'domcontentloaded' });
      await page.locator('.lobby-title').waitFor({ state: 'attached', timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const wm = document.querySelector('.lobby-title .show-wordmark');
        return {
          scrollWidth: wm.scrollWidth,
          clientWidth: wm.clientWidth,
        };
      });

      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth,
        `Lobby wordmark scrollWidth (${metrics.scrollWidth}) must be <= clientWidth (${metrics.clientWidth})`,
      );
      await page.close();
    });
  } finally {
    await browser.close();
    child.kill('SIGTERM');
  }
});
