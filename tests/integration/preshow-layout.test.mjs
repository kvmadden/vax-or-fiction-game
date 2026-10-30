// VOF-88, the pre-show pass: the lobby, the title and the instructions on the Teams and room venues at the
// four host canvases. Renders the real screens and fails on the defects this pass fixed.
// - The join pill sits where question 1 puts it (VOF-06: the same pill from the title onward), and never
//   lands on anything the beat shows (it sat on the instructions headline card).
// - The instructions steps run edge line to edge line instead of a narrow centred column.
// - The lobby shows who is in, its join card touches neither the copy nor the music strip, and its start
//   clock stays inside the copy column.
// - Inside the show these screens let the stage atmosphere through (they had painted over it).
// - No running animation sits under a filtered ancestor. That repaint held the title near 11 frames a
//   second wherever the browser paints without a GPU.
// - The 3-2-1 lands question 1, and a deliberate second press skips it.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

const OUT = 'work/preshow-layout';
const SIZES = [
  { id: '1920x1080', width: 1920, height: 1080, safeX: 64 },
  { id: '1440x900', width: 1440, height: 900, safeX: 64 },
  { id: '1200x1200', width: 1200, height: 1200, safeX: 64 },
  { id: '1080x1920', width: 1080, height: 1920, safeX: 16 },
];
const VENUES = ['teams', 'room'];
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let roomSeed = 4000;
function room() {
  roomSeed += 13;
  let n = roomSeed;
  let code = '';
  for (let i = 0; i < 4; i += 1) { code = ALPHABET[n % ALPHABET.length] + code; n = Math.floor(n / ALPHABET.length); }
  return code;
}

async function openHost(browser, url, { size, venue, reducedMotion = 'reduce' }) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion });
  await context.addInitScript(() => {
    try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* storage may be blocked */ }
    window.__VOF_JOIN_BASE_URL__ = 'https://vaxorfiction.com';
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(`${url}/?room=${room()}&host=1&preset=curated8&venue=${venue}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Your game is ready/ }).waitFor();
  if (await page.locator('[data-role="presenter-pairing"]').isVisible()) await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const url = urls.filter((entry) => new URL(entry).pathname === '/src/store/game-store.ts').at(-1) || '/src/store/game-store.ts';
    window.__preshowStore = (await import(url)).useGameStore;
  });
  await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
  await page.locator('[data-screen="lobby"]').waitFor();
  return { context, page };
}

async function seat(page, count) {
  await page.evaluate((count) => {
    const store = window.__preshowStore;
    const devices = {};
    for (let i = 0; i < count; i += 1) {
      devices[`preshow-${i}`] = { nickname: `Player ${i + 1}`, team: null, joinedAt: Date.now() - (count - i) * 1000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 };
    }
    store.setState({ seenDevices: devices });
  }, count);
}

async function settle(page, ms = 700) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await page.waitForTimeout(ms);
}

async function press(page, screen) {
  await page.waitForTimeout(450);
  await page.keyboard.press('ArrowRight');
  if (screen) await page.locator(`[data-screen="${screen}"]`).waitFor();
}

/** Boxes in stage-canvas pixels, plus whether each box is actually painted. */
async function boxes(page, screen, selectors) {
  return page.evaluate(({ screen, selectors }) => {
    const root = document.querySelector(`[data-screen="${screen}"]`);
    const frame = root.querySelector('.show-frame') ?? root;
    const f = frame.getBoundingClientRect();
    const scale = f.width / frame.offsetWidth;
    const out = { canvas: { width: frame.offsetWidth, height: frame.offsetHeight } };
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) { out[selector] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[selector] = {
        left: (r.left - f.left) / scale, top: (r.top - f.top) / scale,
        right: (r.right - f.left) / scale, bottom: (r.bottom - f.top) / scale,
        visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05,
        // A capped box can hold still while its text runs out of it, so the text's own overflow counts too.
        overflowX: el.scrollWidth - el.clientWidth,
      };
    }
    out.background = getComputedStyle(root).backgroundColor;
    return out;
  }, { screen, selectors });
}

function overlap(a, b) {
  if (!a?.visible || !b?.visible) return 0;
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 1 && y > 1 ? x * y : 0;
}

function near(a, b, label) {
  for (const side of ['left', 'top', 'right', 'bottom']) {
    assert.ok(Math.abs(a[side] - b[side]) <= 2, `${label}: pill ${side} ${a[side].toFixed(1)} against question 1's ${b[side].toFixed(1)}`);
  }
}

test('the pre-show beats hold their layout, their join pill and the stage atmosphere on every host canvas', async () => {
  await fs.mkdir(OUT, { recursive: true });
  let measured = 0;
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const venue of VENUES) {
      for (const size of SIZES) {
        const label = `${venue} ${size.id}`;
        const { context, page } = await openHost(browser, url, { size, venue });
        await seat(page, 5);
        await settle(page);
        const lobby = await boxes(page, 'lobby', ['.lobby-copy', '.lobby-join', '.lobby-footer', '.lobby-arrivals', '.lobby-arrival']);
        await page.screenshot({ path: path.join(OUT, `${venue}-${size.id}-lobby.png`) });
        assert.ok(lobby['.lobby-arrivals']?.visible && lobby['.lobby-arrival']?.visible, `${label}: the lobby shows who is in`);
        assert.equal(overlap(lobby['.lobby-join'], lobby['.lobby-copy']), 0, `${label}: the join card clears the copy`);
        assert.equal(overlap(lobby['.lobby-join'], lobby['.lobby-footer']), 0, `${label}: the join card clears the music strip`);
        assert.ok(lobby['.lobby-footer'].bottom <= lobby.canvas.height + 1, `${label}: the music strip stays on the canvas`);
        assert.equal(lobby.background, 'rgba(0, 0, 0, 0)', `${label}: the lobby lets the stage atmosphere through`);
        // Reduced motion (this test's default) leaves the syringe no animation at all, on every mark that jabs.
        const jab = (selector) => page.evaluate((selector) => [...document.querySelectorAll(selector)].map((node) => getComputedStyle(node).animationName), selector);
        const lobbyJab = await jab('.lobby-title .show-wordmark__syringe');
        assert.ok(lobbyJab.length > 0, `${label}: the lobby mark draws its syringe`);
        assert.deepEqual([...new Set(lobbyJab)], ['none'], `${label}: reduced motion stops the lobby syringe's jab`);

        // The longest clock the countdown writes ("STARTS IN 1:04:31") takes the hype line's place.
        await page.evaluate(() => window.__preshowStore.setState({ startTime: Date.now() + 3_871_000 }));
        await page.locator('[data-role="lobby-countdown"]').waitFor();
        await settle(page, 300);
        const clock = await boxes(page, 'lobby', ['.lobby-copy', '.lobby-join', '.lobby-countdown']);
        assert.match(await page.locator('[data-role="lobby-countdown"]').innerText(), /^STARTS IN 1:04:\d\d$/, `${label}: the clock reads hours`);
        assert.ok(clock['.lobby-countdown'].right <= clock['.lobby-copy'].right + 1, `${label}: the clock stays in the copy column (${clock['.lobby-countdown'].right.toFixed(1)})`);
        assert.ok(clock['.lobby-countdown'].overflowX <= 1, `${label}: the clock's text fits its line (${clock['.lobby-countdown'].overflowX} px over)`);
        assert.equal(overlap(clock['.lobby-countdown'], clock['.lobby-join']), 0, `${label}: the clock clears the join card`);
        await page.evaluate(() => window.__preshowStore.setState({ startTime: null }));

        // Top 5 scores off: no names on the shared screen, and the count grows to carry the lobby.
        await page.evaluate(() => window.__preshowStore.setState({ leaderboardEnabled: false }));
        await page.locator('.preshow-lobby[data-names="false"]').waitFor();
        assert.equal(await page.locator('[data-role="lobby-arrivals"]').count(), 0, `${label}: no names with Top 5 scores off`);
        await page.evaluate(() => window.__preshowStore.setState({ leaderboardEnabled: true }));
        await page.locator('[data-role="lobby-arrivals"]').waitFor();

        await press(page, 'title');
        await settle(page, 900);
        const title = await boxes(page, 'title', ['.show-join-pill', '.title-ready-line', '.title-source-mark', '.title-source-tagline', '.title-walkin']);
        await page.screenshot({ path: path.join(OUT, `${venue}-${size.id}-title.png`) });
        assert.ok(title['.show-join-pill']?.visible, `${label}: the title shows the join pill (VOF-06)`);
        for (const part of ['.title-ready-line', '.title-source-mark', '.title-source-tagline', '.title-walkin']) {
          assert.equal(overlap(title['.show-join-pill'], title[part]), 0, `${label}: the title's join pill clears ${part}`);
        }
        assert.equal(title.background, 'rgba(0, 0, 0, 0)', `${label}: the title lets the stage atmosphere through`);
        const titleJab = await jab('.title-source-mark .show-wordmark__syringe');
        assert.ok(titleJab.length > 0, `${label}: the title mark draws its syringe`);
        assert.deepEqual([...new Set(titleJab)], ['none'], `${label}: reduced motion stops the title syringe's jab`);

        await press(page, 'instructions');
        await settle(page, 900);
        const steps = await boxes(page, 'instructions', ['.show-join-pill', '.instructions-headline', '.instructions-source-sequence', '.instructions-source-step.step-1', '.instructions-source-step.step-3']);
        await page.screenshot({ path: path.join(OUT, `${venue}-${size.id}-instructions.png`) });
        assert.ok(steps['.show-join-pill']?.visible, `${label}: the instructions show the join pill`);
        for (const part of ['.instructions-headline', '.instructions-source-sequence']) {
          assert.equal(overlap(steps['.show-join-pill'], steps[part]), 0, `${label}: the instructions' join pill clears ${part}`);
        }
        const sequence = steps['.instructions-source-sequence'];
        assert.ok(Math.abs(sequence.left - size.safeX) <= 2, `${label}: the steps start on the left edge line (${sequence.left.toFixed(1)})`);
        assert.ok(Math.abs(sequence.right - (steps.canvas.width - size.safeX)) <= 2, `${label}: the steps end on the right edge line (${sequence.right.toFixed(1)})`);
        assert.ok(steps['.instructions-source-step.step-3']?.visible, `${label}: all three steps show`);
        assert.equal(steps.background, 'rgba(0, 0, 0, 0)', `${label}: the instructions let the stage atmosphere through`);
        const chrome = await page.evaluate(() => ({
          trigger: getComputedStyle(document.querySelector('[data-screen="instructions"] .opening-screen-action')).pointerEvents,
          cones: Number(getComputedStyle(document.querySelector('.stage-atmosphere > .stage-cones')).zIndex),
          scrim: Number(getComputedStyle(document.querySelector('.stage-atmosphere > .show-scrim')).zIndex),
        }));
        assert.equal(chrome.trigger, 'auto', `${label}: the hidden Start Question 1 trigger still takes a click`);
        assert.ok(chrome.cones < chrome.scrim, `${label}: the spotlights sit under the legibility scrim (${chrome.cones} against ${chrome.scrim})`);

        // Press once to start the 3-2-1 and again, deliberately, to skip it. Question 1's pill is the reference.
        await press(page);
        await page.locator('[data-role="intro-countdown"]').waitFor();
        await page.waitForTimeout(450);
        await page.keyboard.press('ArrowRight');
        await page.locator('.question-show-frame .show-join-pill').waitFor();
        await settle(page, 900);
        const question = await page.evaluate(() => {
          const frame = document.querySelector('.question-show-frame');
          const f = frame.getBoundingClientRect();
          const scale = f.width / frame.offsetWidth;
          const r = frame.querySelector('.show-join-pill').getBoundingClientRect();
          return { left: (r.left - f.left) / scale, top: (r.top - f.top) / scale, right: (r.right - f.left) / scale, bottom: (r.bottom - f.top) / scale };
        });
        near(title['.show-join-pill'], question, `${label} title`);
        near(steps['.show-join-pill'], question, `${label} instructions`);
        measured += 1;
        await context.close();
      }
    }
  });
  assert.equal(measured, VENUES.length * SIZES.length, 'every venue and canvas was measured');
});

test('the 3-2-1 lands question 1 on its own, and a second press skips it', async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openHost(browser, url, { size: SIZES[0], venue: 'teams', reducedMotion: 'no-preference' });
    await press(page, 'title');
    await press(page, 'instructions');
    await press(page);
    // The live region mounts empty and takes the first number a frame later, so wait for its text.
    await page.waitForFunction(() => (document.querySelector('[data-role="intro-countdown"] [role="status"]')?.textContent ?? '').trim().length > 0);
    assert.equal((await page.locator('[data-role="intro-countdown"] [role="status"]').textContent()).trim(), 'Question 1 in 3');
    await page.screenshot({ path: path.join(OUT, 'countdown-three.png') });
    const started = Date.now();
    await page.locator('.question-show-frame').waitFor({ timeout: 6000 });
    const took = Date.now() - started;
    assert.ok(took > 1500 && took < 5000, `the count ran its course before question 1 (${took} ms)`);
    assert.equal(await page.locator('[data-role="intro-countdown"]').count(), 0, 'the count leaves with the instructions');
    await context.close();

    const skip = await openHost(browser, url, { size: SIZES[0], venue: 'teams', reducedMotion: 'no-preference' });
    await press(skip.page, 'title');
    await press(skip.page, 'instructions');
    await press(skip.page);
    await skip.page.locator('[data-role="intro-countdown"]').waitFor();
    // The keyboard drops a second press inside 300 ms, so an accidental double tap on the keys cannot skip
    // the count. The skip is a deliberate second press after that.
    await skip.page.waitForTimeout(450);
    const pressed = Date.now();
    await skip.page.keyboard.press('ArrowRight');
    await skip.page.locator('.question-show-frame').waitFor({ timeout: 3000 });
    assert.ok(Date.now() - pressed < 1500, 'the second press skipped straight into question 1');
    await skip.context.close();
  });
});

test('no running animation sits under a filtered ancestor on the lobby or the title', async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openHost(browser, url, { size: SIZES[0], venue: 'teams', reducedMotion: 'no-preference' });
    await seat(page, 3);
    const check = () => page.evaluate(() => {
      const found = [];
      let looked = 0;
      for (const animation of document.getAnimations()) {
        const target = animation.effect?.target;
        if (!target || animation.playState !== 'running') continue;
        looked += 1;
        for (let el = target.parentElement; el; el = el.parentElement) {
          if (getComputedStyle(el).filter !== 'none') {
            found.push(`${target.className?.baseVal ?? target.className} under ${el.className}`);
            break;
          }
        }
      }
      return { found, looked };
    });
    await settle(page, 1200);
    const lobby = await check();
    await press(page, 'title');
    await settle(page, 1600);
    const title = await check();
    // A sweep that saw nothing proves nothing: the syringe's jab and the spotlights must be in view.
    assert.ok(lobby.looked > 0 && title.looked > 0, `the sweep saw running animations (lobby ${lobby.looked}, title ${title.looked})`);
    assert.deepEqual(lobby.found, [], 'lobby');
    assert.deepEqual(title.found, [], 'title');
    await context.close();
  });
});
