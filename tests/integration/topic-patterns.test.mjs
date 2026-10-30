// Soft topic patterns behind the questions (VOF-94), in a real browser. The layer loads when a question first needs it and
// a tile loads only for the family on screen, it draws at the owner's strength in a tint of each look, the big screen and
// the phone draw the same family for every question, every family appears on a rendered question, the host's switch and
// the testing flag turn it off, reduced motion and reduced transparency are honoured, and it adds no words to a question.
import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';
import { finishEntrances } from './look-contrast-meter.mjs';
import {
  exposeStore, frameRevealed, framePosed, frameScreen, hostAsk, hostScreenForPhone, joinPhone, newContext, openHost, openRelayHost, phoneVoteReady, roomCode, settle, waitForPattern,
} from './look-frames.mjs';

/** Everything the pattern pulls in on demand: its layer, its stylesheet, its index and its tiles. */
const LAZY = /\/looks\/patterns\/(?:TopicPattern\.tsx|patterns\.css|topic-map\.ts|topic-index\.ts|families\.ts)|\/pattern-art\/[a-z-]+\.webp/;
const STRENGTH = '0.22';
/** A phone draws each look at the strongest step with a clear margin at which every word of every family holds AA, measured (patterns.css). */
const PHONE_STRENGTH = { today: '0.16', studio: '0.16', seventies: '0.12', casefile: '0.07' };

const layerOf = (page, surface) => page.evaluate((surface) => {
  const layers = [...document.querySelectorAll(`.topic-pattern[data-surface="${surface}"]`)];
  return layers.map((layer) => {
    const tile = layer.querySelector('.topic-pattern__tile');
    const style = getComputedStyle(tile);
    return { family: layer.dataset.family, leaving: layer.hasAttribute('data-leaving'), opacity: style.opacity, maskSize: style.maskSize, text: layer.textContent, hidden: layer.getAttribute('aria-hidden'), display: getComputedStyle(layer).display, pointer: getComputedStyle(layer).pointerEvents };
  });
}, surface);

/** Waits for the one layer that is drawing (not leaving) on a surface, and returns its family. */
async function drawnFamily(page, surface = 'stage') {
  await page.waitForFunction((surface) => {
    const layers = [...document.querySelectorAll(`.topic-pattern[data-surface="${surface}"]`)];
    return layers.filter((layer) => !layer.hasAttribute('data-leaving')).length === 1;
  }, surface);
  await page.waitForFunction((surface) => document.querySelectorAll(`.topic-pattern[data-surface="${surface}"]`).length === 1, surface, { timeout: 5000 });
  const [layer] = await layerOf(page, surface);
  return layer.family;
}

/**
 * Records every Web Animations call on a pattern layer, so a test can say how a layer faded without waiting on a clock. With
 * `holdArrival` a layer's fade in is held paused 90ms into its arrival, so the next question always finds it part way.
 */
const recordLayerFades = (context, { holdArrival = false } = {}) => context.addInitScript((hold) => {
  const original = Element.prototype.animate;
  window.__layerFades = [];
  Element.prototype.animate = function patched(frames, options) {
    const animation = original.call(this, frames, options);
    if (String(this.className).includes('topic-pattern')) {
      window.__layerFades.push({ frames: JSON.parse(JSON.stringify(frames)), duration: options?.duration ?? null });
      if (hold && frames[0].opacity === 0 && frames.at(-1).opacity === 1) {
        animation.pause();
        animation.currentTime = 90;
      }
    }
    return animation;
  };
}, holdArrival);
const layerFades = (page) => page.evaluate(() => window.__layerFades ?? []);

const question = (page, id, deck = 'show') => page.evaluate(({ id, deck }) => (deck === 'flagship' ? window.__lo.flagship : window.__lo.deck).questions.find((item) => item.id === id), { id, deck });

async function exposeFlagship(page) {
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
    window.__lo.flagship = (await import(u('/src/data/decks/flagship.ts'))).flagshipDeck;
    window.__lo.topicMap = await import(u('/src/looks/patterns/topic-map.ts'));
    window.__lo.families = await import(u('/src/looks/patterns/families.ts'));
  });
}

test('nothing is requested until a question asks, then the layer and the family tile load, at the owner\'s strength, and fade out with the question', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    await recordLayerFades(context);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const requested = [];
    page.on('request', (request) => { const path = new URL(request.url()).pathname; if (LAZY.test(path)) requested.push(path); });
    await openHost(page, url);
    await exposeStore(page);
    assert.deepEqual(requested, [], 'setup asks for nothing');
    await frameScreen(page, 'widescreen', 'lobby');
    await frameScreen(page, 'widescreen', 'title');
    assert.deepEqual(requested, [], 'the lobby and the title ask for nothing, so a page with no question downloads no pattern');
    assert.equal(await page.locator('.topic-pattern').count(), 0);

    await framePosed(page, 'widescreen', await question(page, 'q5'));
    assert.equal(await drawnFamily(page), 'rsv', 'the RSV question draws the RSV family');
    const [rsv] = await layerOf(page, 'stage');
    assert.equal(rsv.opacity, STRENGTH, 'at 22 percent ink, twice the first build\'s 11');
    assert.equal(rsv.hidden, 'true', 'decoration only');
    assert.equal(rsv.text, '', 'with no words in it');
    assert.equal(rsv.pointer, 'none', 'and nothing to click');
    assert.ok(requested.some((path) => path.endsWith('/looks/patterns/TopicPattern.tsx')), 'the layer loaded when the question asked');
    const tiles = () => [...new Set(requested.filter((path) => path.includes('/pattern-art/')))];
    assert.deepEqual(tiles(), ['/pattern-art/rsv.webp'], 'and only the RSV tile');
    const rsvRequests = requested.filter((path) => path.endsWith('/pattern-art/rsv.webp')).length;

    await framePosed(page, 'widescreen', await question(page, 'q31'));
    assert.equal(await drawnFamily(page), 'tetanus', 'the next question draws its own family, and the RSV layer is gone once it has faded');
    assert.deepEqual(tiles(), ['/pattern-art/rsv.webp', '/pattern-art/tetanus.webp'], 'one more tile, for the one more family');
    const fades = await layerFades(page);
    assert.ok(fades.some((fade) => fade.frames[0].opacity === 0 && fade.frames.at(-1).opacity === 1 && fade.duration === 900), 'a layer fades in over 900ms');
    const leave = fades.find((fade) => fade.frames.at(-1).opacity === 0);
    assert.ok(leave && leave.frames[0].opacity > 0 && leave.frames[0].opacity <= 1 && leave.duration === 420, 'and the layer before it fades out over 420ms');

    // Two questions of one family keep one layer, and the tile is not asked for twice.
    await framePosed(page, 'widescreen', await question(page, 'q21'));
    assert.equal(await drawnFamily(page), 'rsv');
    await framePosed(page, 'widescreen', await question(page, 'q34'));
    assert.equal(await drawnFamily(page), 'rsv');
    assert.equal(requested.filter((path) => path.endsWith('/pattern-art/rsv.webp')).length, rsvRequests, 'a tile is not asked for again for another question of its family');

    await frameScreen(page, 'widescreen', 'leaderboard');
    await page.waitForFunction(() => document.querySelectorAll('.topic-pattern').length === 0, null, { timeout: 5000 });
    assert.equal(await page.locator('.topic-pattern').count(), 0, 'between questions the layer leaves');
    await frameScreen(page, 'widescreen', 'closing');
    assert.equal(await page.locator('.topic-pattern').count(), 0, 'and a closing has none');
    await context.close();
  });
});

test('a tile that will not load leaves the question as it was, and the next question of that family asks for the tile again', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let blocked = true;
    await page.route('**/pattern-art/rsv.webp', (route) => (blocked ? route.abort() : route.continue()));
    await openHost(page, url);
    await exposeStore(page);
    await framePosed(page, 'widescreen', await question(page, 'q31'));
    assert.equal(await drawnFamily(page), 'tetanus', 'another family still draws while the RSV tile is out of reach');

    await framePosed(page, 'widescreen', await question(page, 'q5'));
    await settle(page, 2500);
    assert.equal(await page.locator('.topic-pattern').count(), 0, 'a tile that did not load draws no layer, and the tetanus layer before it has gone');
    assert.ok((await page.locator('.question-stage-copy').innerText()).length > 20, 'and the question reads as it always does');

    // The connection comes back. The next question is of the same family, so nothing but the question itself has changed.
    blocked = false;
    await framePosed(page, 'widescreen', await question(page, 'q21'));
    assert.equal(await drawnFamily(page), 'rsv', 'the next question of the family asks for its tile again, so a dropped connection costs one question');
    assert.deepEqual(errors, [], 'and nothing threw');
    await context.close();
  });
});

test('a layer replaced in the middle of its arrival fades out from where the arrival had reached, and never jumps to full strength', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    // The RSV layer's arrival is held 90ms in, so the next question finds it part way and not at full strength.
    await recordLayerFades(context, { holdArrival: true });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url);
    await exposeStore(page);
    await framePosed(page, 'widescreen', await question(page, 'q5'));
    assert.equal(await drawnFamily(page), 'rsv');
    await framePosed(page, 'widescreen', await question(page, 'q31'));
    await page.waitForFunction(() => window.__layerFades.some((fade) => fade.frames.at(-1).opacity === 0));
    const leave = (await layerFades(page)).find((fade) => fade.frames.at(-1).opacity === 0);
    assert.ok(leave.frames[0].opacity < 0.9, `the RSV layer left from where its arrival had reached (${leave.frames[0].opacity}) and not from full strength`);
    await context.close();
  });
});

test('a pattern layer that cannot load never takes a question down', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.route('**/looks/patterns/TopicPattern.tsx*', (route) => route.abort());
    await openHost(page, url);
    await exposeStore(page);
    for (const id of ['q5', 'q31']) {
      await framePosed(page, 'widescreen', await question(page, id));
      await settle(page, 1500);
      assert.equal(await page.locator('[data-role="slide-error-boundary"]').count(), 0, `${id}: no error card replaces the question`);
      assert.ok((await page.locator('.question-stage-copy').innerText()).length > 20, `${id}: the question reads as it always does`);
      assert.equal(await page.locator('.topic-pattern').count(), 0, `${id}: and no layer is drawn`);
      assert.ok(await page.locator('.answer-bar').count() > 0 || await page.locator('.question-shell').count() > 0, `${id}: and its answers are on the screen`);
    }
    await context.close();
  });
});

test('a pattern layer that loads and then throws never takes a question down either, and says so in the console', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const said = [];
    page.on('console', (message) => { if (message.type() === 'error') said.push(message.text()); });
    // The layer's own module is replaced by one that throws as soon as it draws.
    await page.route('**/looks/patterns/TopicPattern.tsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export default function TopicPattern() { throw new Error("pattern layer test fault"); }' }));
    await openHost(page, url);
    await exposeStore(page);
    for (const id of ['q5', 'q31']) {
      await framePosed(page, 'widescreen', await question(page, id));
      await settle(page, 1500);
      assert.equal(await page.locator('[data-role="slide-error-boundary"]').count(), 0, `${id}: no error card replaces the question`);
      assert.ok((await page.locator('.question-stage-copy').innerText()).length > 20, `${id}: the question reads as it always does`);
    }
    assert.ok(said.some((line) => line.includes('The topic pattern layer failed while it was drawing')), 'and the console says what happened');
    await context.close();
  });
});

test('a tile that is slow to arrive lets the layer on screen leave after a moment, and still draws for its own question when it comes', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    let hold = false;
    await page.route('**/pattern-art/rsv.webp', async (route) => {
      if (hold) await new Promise((resolve) => setTimeout(resolve, 7000));
      await route.continue();
    });
    await openHost(page, url);
    await exposeStore(page);
    await framePosed(page, 'widescreen', await question(page, 'q31'));
    assert.equal(await drawnFamily(page), 'tetanus');
    hold = true;
    await framePosed(page, 'widescreen', await question(page, 'q5'));
    // The RSV tile is seven seconds away. The tetanus layer leaves after the stall time and the question goes without, and no word changes.
    await page.waitForFunction(() => document.querySelectorAll('.topic-pattern').length === 0, null, { timeout: 5500 });
    assert.ok((await page.locator('.question-stage-copy').innerText()).length > 20, 'the question reads as it always does while it waits');
    assert.equal(await drawnFamily(page), 'rsv', 'and when the tile arrives it draws for its own question');
    await context.close();
  });
});

test('every family appears on a rendered question, and each look tints the same strength in its own ink', { timeout: 600_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url);
    await exposeStore(page);
    await exposeFlagship(page);
    // The longest question of each family, from the show deck and the flagship (the show deck has no big picture question).
    const cards = await page.evaluate(() => {
      const { topicMap, deck, flagship } = window.__lo;
      const best = new Map();
      for (const source of [deck, flagship]) {
        for (const q of source.questions) {
          const family = topicMap.familyForStatement(q.statement);
          if (family && (!best.get(family) || q.statement.length > best.get(family).statement.length)) best.set(family, q);
        }
      }
      return [...best].map(([family, q]) => ({ family, q }));
    });
    const expected = await page.evaluate(() => Object.keys(window.__lo.families.PATTERN_FAMILIES).sort());
    assert.equal(cards.length, expected.length, 'a question was found for every family');
    const seen = [];
    for (const { family, q } of cards) {
      await framePosed(page, 'widescreen', q);
      const drawn = await drawnFamily(page);
      assert.equal(drawn, family, `${q.id} draws ${family}`);
      seen.push(drawn);
    }
    assert.deepEqual([...new Set(seen)].sort(), expected, 'all fourteen families drew on a rendered question');
    await context.close();

    // Each look tints its own ink at the same strength. Today keeps the white the strength was chosen on.
    const inks = {};
    for (const look of ['today', 'studio', 'casefile', 'seventies']) {
      const lookContext = await newContext(browser);
      const lookPage = await lookContext.newPage();
      lookPage.setDefaultTimeout(30_000);
      await openHost(lookPage, url, look === 'today' ? '' : `&look=${look}`);
      await exposeStore(lookPage);
      await framePosed(lookPage, 'widescreen', await question(lookPage, 'q5'));
      assert.equal(await drawnFamily(lookPage), 'rsv');
      const [layer] = await layerOf(lookPage, 'stage');
      assert.equal(layer.opacity, STRENGTH, `${look}: the same strength in every look`);
      inks[look] = await lookPage.evaluate(() => getComputedStyle(document.querySelector('.topic-pattern__tile')).backgroundColor);
      await lookContext.close();
    }
    assert.equal(new Set(Object.values(inks)).size, 4, `four looks, four inks (${JSON.stringify(inks)})`);
  });
});

test('the host switch and the testing flag turn the pattern off, the device remembers the switch, and the flag is never remembered', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const requested = [];
    page.on('request', (request) => { const path = new URL(request.url()).pathname; if (LAZY.test(path)) requested.push(path); });
    // The flag turns them off at load, asks for nothing and writes nothing.
    await openHost(page, url, '&pattern=off');
    await exposeStore(page);
    await framePosed(page, 'widescreen', await question(page, 'q5'));
    await settle(page, 1500);
    assert.equal(await page.locator('.topic-pattern').count(), 0, 'no layer');
    assert.deepEqual(requested, [], 'and no layer, stylesheet or tile was downloaded');
    assert.equal(await page.evaluate(() => localStorage.getItem('vof:topic-patterns')), null, 'a test link remembers nothing');

    // Setup: the switch sits under the look cards, on, and flipping it applies at once and is remembered.
    await openHost(page, url);
    await page.getByRole('heading', { name: 'Your game is ready', exact: true }).waitFor();
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.locator('[data-view="sheet"]').waitFor();
    requested.length = 0;
    await page.locator('[data-role="setup-look"]').click();
    await page.locator('[data-view="looks"]').waitFor();
    const toggle = page.getByRole('switch', { name: 'Topic patterns' });
    assert.equal(await toggle.getAttribute('aria-checked'), 'true', 'on by default in every look, Today included');
    // The Look screen's sample question draws its own pattern while the switch is on, so the layer and that one family's tile load.
    await waitForPattern(page, 'preview', 'shingles');
    assert.deepEqual([...new Set(requested.filter((path) => path.includes('/pattern-art/')))], ['/pattern-art/shingles.webp'], 'the sample asks for its own family\'s tile and no other');
    assert.equal(await page.locator('[data-look-option]').count(), 4, 'beside the four looks');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'it applies at once');
    assert.equal(await page.evaluate(() => localStorage.getItem('vof:topic-patterns')), 'off', 'and the device remembers it');
    assert.match(await page.locator('p.sr-only[role="status"]').first().innerText(), /Topic patterns are off/, 'and the live region says so');

    // The next game on this device starts with patterns off, in any look.
    await openHost(page, url, '&look=studio');
    await exposeStore(page);
    await framePosed(page, 'widescreen', await question(page, 'q5'));
    await settle(page, 1500);
    assert.equal(await page.locator('.topic-pattern').count(), 0, 'off in the next game, in a drawn look too');
    // The flag can still force them on for a test, without remembering that either.
    await openHost(page, url, '&pattern=on');
    await exposeStore(page);
    await framePosed(page, 'widescreen', await question(page, 'q5'));
    assert.equal(await drawnFamily(page), 'rsv', 'the flag wins at load');
    assert.equal(await page.evaluate(() => localStorage.getItem('vof:topic-patterns')), 'off', 'and the remembered switch is still off');
    await context.close();
  });
});

test('the big screen and a phone draw the same family for every question, a phone draws none between questions, and it follows the host switch', { timeout: 600_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const code = roomCode();
    const host = await openRelayHost(browser, url, code);
    await exposeFlagship(host.page);
    const { context, page: phone } = await joinPhone(browser, url, { code, look: 'today', size: { width: 390, height: 844 } });
    const picks = [['q5', 'show'], ['q31', 'show'], ['q35', 'show'], ['q8', 'show'], ['q28', 'show'], ['q16', 'show'], ['q2', 'show'], ['q17', 'flagship'], ['q18', 'show'], ['q4', 'show'], ['q10', 'show'], ['q13', 'show']];
    const families = [];
    for (const [id, deck] of picks) {
      const q = await question(host.page, id, deck);
      await hostAsk(host.page, q);
      await phoneVoteReady(phone, q);
      const onPhone = await drawnFamily(phone, 'phone');
      const onStage = await drawnFamily(host.page, 'stage');
      assert.equal(onPhone, onStage, `${deck} ${id}: the phone and the big screen draw the same family`);
      assert.equal(onPhone, await host.page.evaluate((statement) => window.__lo.topicMap.familyForStatement(statement), q.statement), `${deck} ${id}: and it is the question's own`);
      families.push(onPhone);
    }
    assert.ok(new Set(families).size >= 9, `the sweep crossed many families (${[...new Set(families)].join(', ')})`);
    // The phone's layer is the phone's own: a tile of its own size, behind the screens, with no words, at the strength measured for its look.
    const [layer] = await layerOf(phone, 'phone');
    assert.equal(layer.opacity, PHONE_STRENGTH.today, 'a phone in Today draws at its own measured strength, softer than the big screen');
    assert.ok(Number(layer.opacity) < Number(STRENGTH));
    assert.equal(layer.text, '');
    // Between questions a phone draws none: the leaderboard and the closing are not the question's screens, so the last stem leaves.
    await hostScreenForPhone(host.page, phone, 'leaderboard');
    await phone.waitForFunction(() => document.querySelectorAll('.topic-pattern').length === 0, null, { timeout: 5000 });
    await hostScreenForPhone(host.page, phone, 'closing');
    await settle(phone, 800);
    assert.equal(await phone.locator('.topic-pattern').count(), 0, 'and a phone at the closing has none');
    // The host turns patterns off in its own page. The room carries the switch, so the phone follows it, and the big screen does too.
    const q5 = await question(host.page, 'q5');
    await hostAsk(host.page, q5);
    await phoneVoteReady(phone, q5);
    assert.equal(await drawnFamily(phone, 'phone'), 'rsv', 'control: the phone draws before the switch');
    await host.page.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name);
      const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
      (await import(u('/src/looks/host-look.ts'))).hostLookStore.getState().setPatterns(false);
    });
    await phone.waitForFunction(() => document.querySelectorAll('.topic-pattern').length === 0, null, { timeout: 15_000 });
    assert.equal(await host.page.locator('.topic-pattern').count(), 0, 'the big screen follows the switch');
    assert.equal(await phone.locator('.topic-pattern').count(), 0, 'and a phone follows it too, because the room carries it');
    await context.close();
    await host.context.close();
  });
});

test('a phone draws each look at its own measured strength, never above the big screen, and Case file stays the softest', { timeout: 600_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const code = roomCode();
    const host = await openRelayHost(browser, url, code);
    const q = await question(host.page, 'q5');
    for (const look of ['today', 'studio', 'casefile', 'seventies']) {
      // A phone joins from the lobby, so the room goes back to it between phones.
      await host.page.evaluate(() => window.__lo.store.setState({ phase: 'lobby', slideIndex: -1, votesLocked: false }));
      const { context, page: phone } = await joinPhone(browser, url, { code, look, size: { width: 390, height: 844 }, nickname: `${look[0].toUpperCase()}${look.slice(1)}` });
      await hostAsk(host.page, q);
      await phoneVoteReady(phone, q);
      assert.equal(await drawnFamily(phone, 'phone'), 'rsv');
      const [layer] = await layerOf(phone, 'phone');
      assert.equal(layer.opacity, PHONE_STRENGTH[look], `${look}: a phone draws at its own strength`);
      assert.ok(Number(layer.opacity) <= Number(STRENGTH), `${look}: never above the big screen`);
      await context.close();
    }
    assert.ok(Math.min(...Object.values(PHONE_STRENGTH).map(Number)) === Number(PHONE_STRENGTH.casefile), 'Case file, whose drawn phone leaves the least to spare, draws the softest');
    await host.context.close();
  });
});

test('reduced motion draws the layer with no fade, and reduced transparency draws no layer at all', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const motion = await newContext(browser, { width: 1920, height: 1080 }, { reducedMotion: 'reduce' });
    await recordLayerFades(motion);
    const motionPage = await motion.newPage();
    motionPage.setDefaultTimeout(30_000);
    await openHost(motionPage, url);
    await exposeStore(motionPage);
    await framePosed(motionPage, 'widescreen', await question(motionPage, 'q5'));
    assert.equal(await drawnFamily(motionPage), 'rsv', 'the layer still draws');
    assert.deepEqual(await layerFades(motionPage), [], 'with no fade in');
    assert.equal(await motionPage.evaluate(() => document.querySelector('.topic-pattern').getAnimations().length), 0, 'and nothing animating on it');
    await frameScreen(motionPage, 'widescreen', 'leaderboard');
    assert.ok(await motionPage.evaluate(() => [...document.querySelectorAll('.topic-pattern')].every((layer) => getComputedStyle(layer).display === 'none')), 'and it is gone at once with the screen, not faded out');
    await motion.close();

    const clear = await newContext(browser);
    const clearPage = await clear.newPage();
    clearPage.setDefaultTimeout(30_000);
    const cdp = await clear.newCDPSession(clearPage);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    await openHost(clearPage, url);
    await exposeStore(clearPage);
    await framePosed(clearPage, 'widescreen', await question(clearPage, 'q5'));
    await settle(clearPage, 1500);
    // The slot reads the setting and mounts nothing, so the viewer sees a solid background. patterns.css still hides a layer for a
    // browser that cannot read the setting from a script. An empty page would pass a check of every layer's display, so this
    // counts the layers.
    assert.equal(await clearPage.locator('.topic-pattern').count(), 0, 'a viewer who asks for less transparency gets no layer at all');
    await clear.close();
  });
});

test('a viewer who asks for less transparency or forced colours downloads no pattern layer, stylesheet or tile, on the big screen, in the Look screen\'s sample or on a phone', { timeout: 420_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const watch = (page) => {
      const requested = [];
      page.on('request', (request) => { const path = new URL(request.url()).pathname; if (LAZY.test(path)) requested.push(path); });
      return requested;
    };
    for (const setting of ['less transparency', 'forced colours']) {
      const context = await newContext(browser, { width: 1920, height: 1080 }, setting === 'forced colours' ? { forcedColors: 'active' } : {});
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      if (setting === 'less transparency') {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      }
      const requested = watch(page);
      await openHost(page, url, '&look=studio');
      const query = setting === 'forced colours' ? '(forced-colors: active)' : '(prefers-reduced-transparency: reduce)';
      assert.equal(await page.evaluate((media) => matchMedia(media).matches, query), true, `${setting} is on`);
      // The Look screen's sample would draw its question's pattern, and a posed question would draw its own.
      await page.getByRole('button', { name: 'More options', exact: true }).click();
      await page.locator('[data-role="setup-look"]').click();
      await page.locator('[data-view="looks"]').waitFor();
      await settle(page, 1500);
      await exposeStore(page);
      await framePosed(page, 'widescreen', await question(page, 'q5'));
      await settle(page, 1500);
      assert.equal(await page.locator('.topic-pattern').count(), 0, `${setting}: no layer is mounted`);
      assert.deepEqual(requested, [], `${setting}: and no layer, stylesheet or tile was downloaded`);
      await context.close();
    }
    // A phone that asks for less transparency, in a room whose big screen draws the pattern.
    const code = roomCode();
    const host = await openRelayHost(browser, url, code);
    const { context, page: phone } = await joinPhone(browser, url, { code, look: 'today', size: { width: 390, height: 844 }, reducedTransparency: true });
    const phoneRequested = watch(phone);
    // Control: a second phone in the same room that asks for neither, watched the same way, so an empty list above means a
    // download that was skipped and not a watcher that sees nothing.
    const { context: plainContext, page: plain } = await joinPhone(browser, url, { code, look: 'today', size: { width: 390, height: 844 }, nickname: 'Sam' });
    const plainRequested = watch(plain);
    const q5 = await question(host.page, 'q5');
    await hostAsk(host.page, q5);
    await phoneVoteReady(phone, q5);
    await phoneVoteReady(plain, q5);
    assert.equal(await drawnFamily(plain, 'phone'), 'rsv', 'control: the phone that asks for neither draws the RSV pattern');
    assert.ok(plainRequested.some((path) => path.endsWith('/looks/patterns/TopicPattern.tsx')) && plainRequested.includes('/pattern-art/rsv.webp'), `control: and the same watcher saw it download the layer and the tile (${plainRequested.join(', ')})`);
    await settle(phone, 1500);
    assert.equal(await phone.locator('.topic-pattern').count(), 0, 'a phone that asks for less transparency mounts no layer');
    assert.deepEqual(phoneRequested, [], 'and downloads none of it');
    assert.equal(await drawnFamily(host.page, 'stage'), 'rsv', 'and the big screen, which asks for neither, draws the RSV pattern');
    await context.close();
    await plainContext.close();
    await host.context.close();
  });
});

test('the pattern adds no words to a question: the stage text is the same with it and without it, beat by beat', { timeout: 600_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    // An order question's steps are scrambled differently every game, so the words are compared as a set, not in their order.
    const words = (page) => page.evaluate(() => ['.question-stage-copy', '.question-stage-scenario', '.answer-bar', '.estimate-answer-rail', '.order-bar', '.question-explanation-copy', '.question-result-card']
      .flatMap((selector) => [...document.querySelectorAll(selector)].map((el) => el.innerText.replace(/\s+/g, ' ').trim())).sort().join(' | '));
    const collect = async (extra) => {
      const context = await newContext(browser);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, extra);
      await exposeStore(page);
      const found = {};
      for (const id of ['q5', 'q31', 'q16', 'q19', 'q15', 'q33', 'q13']) {
        const q = await question(page, id);
        await framePosed(page, 'widescreen', q);
        await finishEntrances(page);
        found[`${id} posed`] = await words(page);
        await frameRevealed(page, 'widescreen', q, { room: 'wrong' });
        await finishEntrances(page);
        found[`${id} revealed`] = await words(page);
        await frameRevealed(page, 'widescreen', q, { room: 'wrong', beat: 'explaining' });
        await finishEntrances(page);
        found[`${id} explained`] = await words(page);
      }
      await context.close();
      return found;
    };
    const on = await collect('');
    const off = await collect('&pattern=off');
    assert.equal(Object.keys(on).length, 21);
    for (const key of Object.keys(on)) {
      assert.ok(on[key].length > 20, `${key}: the sweep read words (${on[key].length} characters)`);
      assert.equal(on[key], off[key], `${key}: the same words with the pattern and without it`);
    }
  });
});

const lookOnPage = (page) => page.evaluate(() => document.documentElement.dataset.look ?? null);
const hostStore = (page) => page.evaluate(async () => {
  const urls = performance.getEntriesByType('resource').map((e) => e.name);
  const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
  const { hostLookStore } = await import(u('/src/looks/host-look.ts'));
  window.__hostLook = hostLookStore;
});

test('with the room carrying the host pick a phone follows its look and its pattern switch, and a late joiner does too', { timeout: 600_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const code = roomCode();
    // The host starts in Case file with patterns off. The phone's link names no look and no switch.
    const host = await openRelayHost(browser, url, code, '&look=casefile&pattern=off');
    await hostStore(host.page);
    await exposeFlagship(host.page);
    const q = await question(host.page, 'q5');
    const { context, page: phone } = await joinPhone(browser, url, { code, look: null, size: { width: 390, height: 844 } });
    await hostAsk(host.page, q);
    await phoneVoteReady(phone, q);
    await phone.waitForFunction(() => document.documentElement.dataset.look === 'casefile', null, { timeout: 15_000 });
    await settle(phone, 1500);
    assert.equal(await lookOnPage(phone), 'casefile', 'the phone wears the look the room carries');
    assert.equal(await phone.locator('.topic-pattern').count(), 0, 'and draws no pattern, because the host turned them off');
    assert.equal(await host.page.locator('.topic-pattern').count(), 0, 'as the big screen does not either');

    // The host changes both in setup and the phone follows at once.
    await host.page.evaluate(() => { window.__hostLook.getState().pick('studio'); window.__hostLook.getState().setPatterns(true); });
    await phone.waitForFunction(() => document.documentElement.dataset.look === 'studio', null, { timeout: 15_000 });
    assert.equal(await drawnFamily(phone, 'phone'), 'rsv', 'the pattern comes back on the phone');
    assert.equal(await drawnFamily(host.page, 'stage'), 'rsv', 'and on the big screen');

    // A phone that joins late takes the same look and switch from the room's latest state. The room is back in its lobby for it.
    await host.page.evaluate(() => window.__lo.store.setState({ phase: 'lobby', slideIndex: -1, votesLocked: false }));
    const late = await joinPhone(browser, url, { code, look: null, size: { width: 430, height: 932 }, nickname: 'Sam' });
    await late.page.waitForFunction(() => document.documentElement.dataset.look === 'studio', null, { timeout: 15_000 });
    assert.equal(await lookOnPage(late.page), 'studio', 'a late joiner wears the look from the room\'s latest state, before any question');
    // The testing flag still wins on a phone.
    const flagged = await joinPhone(browser, url, { code, look: 'seventies', size: { width: 390, height: 844 }, nickname: 'Kim' });
    await flagged.page.waitForFunction(() => document.documentElement.dataset.look === 'seventies', null, { timeout: 15_000 });
    assert.equal(await lookOnPage(flagged.page), 'seventies', 'a ?look= flag beats the room');
    await hostAsk(host.page, q);
    await phoneVoteReady(late.page, q);
    assert.equal(await drawnFamily(late.page, 'phone'), 'rsv', 'and draws the same family on the question');
    await flagged.context.close();
    await late.context.close();
    await context.close();
    await host.context.close();
  });
});

test('a room whose host does not send the keys leaves a phone in Today with patterns on whatever the host picks, and the room works as ever', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const code = roomCode();
    // An older host build, simulated on the wire: every room state it publishes loses the two keys on its way to the relay.
    const stripped = [];
    const host = await openRelayHost(browser, url, code, '&look=casefile&pattern=off', {
      beforeOpen: (context) => context.routeWebSocket(/\/api\/rooms\/[^/]+\/ws$/, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => {
          let out = message;
          try {
            const data = JSON.parse(String(message));
            if (data?.kind === 'ROOM_STATE' && data.state && ('look' in data.state || 'patterns' in data.state)) {
              delete data.state.look;
              delete data.state.patterns;
              stripped.push(data.state.revision);
              out = JSON.stringify(data);
            }
          } catch { /* a frame that is not JSON goes through untouched */ }
          server.send(out);
        });
        server.onMessage((message) => ws.send(message));
      }),
    });
    const q = await question(host.page, 'q5');
    const { context, page: phone } = await joinPhone(browser, url, { code, look: null, size: { width: 390, height: 844 } });
    await hostAsk(host.page, q);
    await phoneVoteReady(phone, q);
    await settle(phone, 1500);
    assert.ok(stripped.length > 0, 'control: the host did send the keys and the filter took them off');
    assert.equal(await lookOnPage(phone), null, 'the phone is in Today, which puts no mark on the root');
    assert.equal(await drawnFamily(phone, 'phone'), 'rsv', 'with patterns on');
    assert.equal(await host.page.locator('.topic-pattern').count(), 0, 'while the big screen follows its own switch');
    await context.close();
    await host.context.close();
  });
});
