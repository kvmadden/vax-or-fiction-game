// Show looks as host options (VOF-93), in a real browser. The host picks a look in setup and it applies at once, the
// device remembers it, a URL flag still wins at load without being remembered, setup itself stays in Today's navy in every
// look while the Look screen shows the pick once in a live sample, a phone and solo play and the site pages show Today,
// the big screen shows its picture and falls back to the drawn set, a stylesheet or a picture that never answers never
// blanks a page or holds the wash for good, Case file stamps FICTION or FACT while the card keeps TRUE or FALSE, a verdict
// stays inside its card on every kind and canvas, and the lobby's roster of names stays clear of the join card and the
// lyric band on every canvas.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { withViteAndBrowser } from './render-harness.mjs';
import { holdLoops } from './look-contrast-meter.mjs';
import { frameLocked, framePosed, frameRevealed, frameScreen, hostAsk, hostReveals, hostVotes, isLeanCard, joinPhone, openRelayHost, phoneVoteReady, pickCards, roomCode, waitForPattern } from './look-frames.mjs';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let roomSeed = 9100;
const room = () => {
  roomSeed += 17;
  let n = roomSeed;
  let code = '';
  for (let i = 0; i < 4; i += 1) { code = ALPHABET[n % ALPHABET.length] + code; n = Math.floor(n / ALPHABET.length); }
  return code;
};

const CANVASES = [
  { id: 'wide', width: 1920, height: 1080, format: 'widescreen' },
  { id: 'square', width: 1200, height: 1200, format: 'square' },
  { id: 'portrait', width: 1080, height: 1920, format: 'portrait' },
];
const KINDS = ['binary', 'myth-among-three', 'estimate', 'order', 'which-patient'];
const DRAWN = ['studio', 'casefile', 'seventies'];

async function newContext(browser, size = { width: 1920, height: 1080 }, options = {}) {
  const context = await browser.newContext({ viewport: size, ...options });
  await context.addInitScript(() => {
    try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* storage may be blocked */ }
    window.__VOF_JOIN_BASE_URL__ = 'https://vaxorfiction.com';
  });
  return context;
}

const rootLook = (page) => page.evaluate(() => document.documentElement.dataset.look ?? null);
// The drawn looks' stylesheets load the first time a page wears a look, so a look arrives a moment after the pick.
// Today puts no mark on the root at all, so a page in Today reads null.
async function lookIs(page, expected, message) {
  const want = expected === 'today' ? null : expected;
  await page.waitForFunction((want) => (document.documentElement.dataset.look ?? null) === want, want);
  assert.equal(await rootLook(page), want, message);
}
const lookStyles = (page) => page.evaluate(() => [...document.querySelectorAll('style[data-vite-dev-id]')]
  .map((el) => el.getAttribute('data-vite-dev-id') ?? '')
  .filter((id) => /\/looks\/(?:looks|studio|casefile|seventies)\.css$/.test(id)).length);
const remembered = (page) => page.evaluate(() => localStorage.getItem('vof:show-look'));
const hostUrl = (url, extra = '') => `${url}/?room=${room()}&host=1${extra}`;

async function openHost(page, url, extra = '') {
  await page.goto(hostUrl(url, extra), { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="screen-router"]');
}

async function exposeStore(page) {
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
    window.__lo = {
      store: (await import(u('/src/store/game-store.ts'))).useGameStore,
      deck: (await import(u('/src/data/decks/vax-or-fiction.ts'))).vaxOrFictionDeck,
      kinds: await import(u('/src/engine/kinds.ts')),
      population: await import(u('/tests/fixtures/bundled-population.ts')),
    };
  });
}

async function settle(page, ms = 500) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await page.waitForTimeout(ms);
}

/** Lands a real REVEAL for a card, the room 12 to 2 for the right answer. */
async function reveal(page, { format, questionId, kind, longest = false, room: roomSide = 'right' }) {
  await page.evaluate(({ format, questionId, kind, longest, roomSide }) => {
    const { store, deck, kinds, population } = window.__lo;
    let q = deck.questions.find((item) => item.id === questionId);
    if (longest) {
      const cards = population.cardsForKind(kind);
      const weight = (card) => kind === 'order' ? (card.question.steps ?? []).join(' ').length : population.textLength(card);
      const pick = cards.reduce((a, b) => (weight(b) > weight(a) ? b : a), cards[0]);
      q = { ...pick.question, id: `longest-${kind}` };
    }
    const right = kinds.rightToken(q);
    const options = kinds.questionKind(q) === 'order' ? [right, right.split('-').reverse().join('-')] : kinds.kindOptions(q).map((o) => o.token);
    const wrong = options.find((t) => t !== right);
    const votes = {};
    for (const token of new Set(options)) votes[token] = token === (roomSide === 'right' ? right : wrong) ? 12 : 2;
    const voters = {}; let n = 0;
    for (const [token, count] of Object.entries(votes)) for (let k = 0; k < count; k += 1) voters[`v-${n++}`] = { choice: token };
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'locked', formatId: format, run: [{ id: 'title', type: 'title' }, q], slideIndex: 1, votesLocked: true, pollVotes: { [q.id]: votes }, pollVoters: { [q.id]: voters } });
    store.getState().dispatch({ type: 'REVEAL' });
  }, { format, questionId, kind, longest, roomSide });
  await page.waitForFunction(() => document.querySelectorAll('.question-result-card').length === 1);
  await settle(page, 800);
}

function geometry(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.question-show-frame').getBoundingClientRect();
    const cardEl = document.querySelector('.question-result-card');
    const card = cardEl.getBoundingClientRect();
    const problems = [];
    const walk = document.createTreeWalker(document.querySelector('.question-result'), NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('.sr-only')) continue;
      const inCard = Boolean(node.parentElement.closest('.question-result-card'));
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const box = inCard ? card : frame;
        const over = Math.max(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom, frame.left - r.left, r.right - frame.right, frame.top - r.top, r.bottom - frame.bottom);
        if (over > 1) problems.push(`${node.textContent.trim().slice(0, 28)} outside by ${Math.round(over)}px`);
      }
    }
    const clipped = [...cardEl.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible').map((el) => el.className || el.tagName);
    // The room's split: inside a row the label, the bar, the share and the votes never touch one another, and the whole
    // split stays inside the frame. A number's range label can run to "25% to under 50%".
    for (const row of document.querySelectorAll('.question-result-poll > div')) {
      const parts = [...row.children].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none');
      const boxes = parts.map((el) => ({ name: (el.textContent.trim() || el.className || el.tagName).slice(0, 24), r: el.getBoundingClientRect() }));
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i].r; const b = boxes[j].r;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 1 && overlapY > 1) problems.push(`split row: "${boxes[i].name}" overlaps "${boxes[j].name}" by ${Math.round(overlapX)} x ${Math.round(overlapY)}`);
        }
      }
    }
    const split = document.querySelector('.question-result-poll')?.getBoundingClientRect();
    if (split && (split.left < frame.left - 1 || split.right > frame.right + 1 || split.top < frame.top - 1 || split.bottom > frame.bottom + 1)) problems.push("the room's split runs outside the frame");
    const parse = (c) => { const n = (c.match(/-?[\d.]+/g) || []).map(Number); return c.startsWith('color(') ? { rgb: n.slice(0, 3).map((v) => v * 255), a: n[3] ?? 1 } : { rgb: n.slice(0, 3), a: n[3] ?? 1 }; };
    const ch = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    // Every run of words in the card against the card's own fill, when the fill is a solid.
    const fill = parse(getComputedStyle(cardEl).backgroundColor);
    const inks = [];
    if (fill.a >= 0.9) {
      for (const el of cardEl.querySelectorAll('h1, p, li, span, strong, small')) {
        if (!el.textContent.trim() || el.closest('.sr-only') || el.closest('.look-reveal-mark, .look-reveal-ribbon, .look-stamp')) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const ink = parse(getComputedStyle(el).color);
        inks.push({ text: el.textContent.trim().slice(0, 24), ratio: (Math.max(lum(ink.rgb), lum(fill.rgb)) + 0.05) / (Math.min(lum(ink.rgb), lum(fill.rgb)) + 0.05) });
      }
    }
    return { problems, clipped, inks, solid: fill.a >= 0.9 };
  });
}

test('the host picks a look in setup, it applies at once, and the device remembers it for the next game', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url);
    await lookIs(page, 'today', 'a first game opens on Today');
    assert.equal(await page.locator('.look-stage').count(), 0, 'Today draws no look layer');
    assert.equal(await lookStyles(page), 0, 'Today never loads the drawn looks stylesheets');
    assert.equal(await remembered(page), null, 'nothing is remembered before a pick');

    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.locator('[data-view="sheet"]').waitFor();
    const lookButton = page.locator('[data-role="setup-look"]');
    assert.match((await lookButton.textContent()).trim(), /^Look: Today$/, 'the sheet names the look in force');
    await lookButton.click();
    await page.locator('[data-view="looks"]').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Look', exact: true }).evaluate((el) => el === document.activeElement), true, 'focus moves to the screen heading');
    // The title sits on the sheet's own left margin, level with the Back button, and not in the corner of the stage where it once landed.
    const [titleBox, backBox, introBox] = await Promise.all([
      page.getByRole('heading', { name: 'Look', exact: true }).boundingBox(),
      page.getByRole('button', { name: 'Back', exact: true }).boundingBox(),
      page.locator('.setup-looks .setup-setups-intro').boundingBox(),
    ]);
    assert.ok(Math.abs(titleBox.x - introBox.x) < 2, `the title and the intro share a left edge (${titleBox.x} and ${introBox.x})`);
    assert.ok(titleBox.y > 20 && Math.abs((titleBox.y + titleBox.height / 2) - (backBox.y + backBox.height / 2)) < 40, `the title is level with the Back button (${JSON.stringify({ titleBox, backBox })})`);
    const radios = page.getByRole('radio');
    assert.equal(await radios.count(), 4, 'four looks');
    const names = await radios.evaluateAll((els) => els.map((el) => el.closest('label').querySelector('.setup-look-name').textContent));
    assert.deepEqual(names, ['Today', 'Studio set', 'Case file', '70s game show']);
    assert.equal(await page.locator('.setup-look .look-thumb').count(), 4, 'a still of each look');
    assert.equal(await page.getByRole('radio', { name: /^Today/ }).isChecked(), true, 'Today is the pick');
    // Every card is a real touch target.
    const boxes = await page.locator('.setup-look').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
    for (const box of boxes) assert.ok(box.w >= 44 && box.h >= 44, `a look card is at least 44 px (${JSON.stringify(box)})`);

    await page.getByRole('radio', { name: /^Studio set/ }).click();
    await lookIs(page, 'studio', 'the pick applies at once');
    assert.equal(await lookStyles(page), 4, 'and its stylesheets load with the first look');
    // Setup stays in Today's navy (the owner's ruling of 2026-10-05): the set is mounted behind it, so its picture is decoded
    // by the time the lobby opens, but it is not shown, and the pick shows once, in the Look screen's sample.
    assert.equal(await page.locator('.look-stage[data-look-layer="studio"]').count(), 1, 'the set is mounted behind setup');
    assert.equal(await page.locator('.look-stage').evaluate((el) => getComputedStyle(el).display), 'none', 'but setup does not show it');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
    assert.equal(await page.locator('.look-slot__picture').evaluate((img) => img.complete && img.naturalWidth > 0), true, 'the big screen\'s picture is decoded and waiting');
    assert.equal(await page.locator('.look-sample[data-sample="studio"]').count(), 1, 'and the sample shows the pick');
    assert.equal(await remembered(page), 'studio', 'and the device remembers it');
    assert.equal(await page.locator('.preflight-screen > [role="status"]').textContent(), 'Look is Studio set', 'a live region says so');
    assert.equal(await page.getByRole('radio', { name: /^Studio set/ }).isChecked(), true);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.locator('[data-view="sheet"]').waitFor();
    assert.equal(await lookButton.evaluate((el) => el === document.activeElement), true, 'Back returns focus to the Look button');
    assert.match((await lookButton.textContent()).trim(), /^Look: Studio set$/);
    assert.match(await page.locator('.setup-sheet-notice').textContent(), /Look is Studio set/, 'the sheet says it in words');

    // The next game on this device starts on the remembered pick, with no clicks.
    await openHost(page, url);
    await lookIs(page, 'studio', 'a new game opens on the remembered look');
    await page.reload({ waitUntil: 'load' });
    await lookIs(page, 'studio', 'and so does a reload');
    // Picking Today puts it back, and Today draws nothing again.
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.locator('[data-role="setup-look"]').click();
    await page.getByRole('radio', { name: /^Today/ }).click();
    await lookIs(page, 'today', 'picking Today puts it back');
    assert.equal(await page.locator('.look-stage').count(), 0, 'Today is art free again');
    assert.equal(await remembered(page), 'today');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-look-art-stage')), null, 'no picture mark is left on the page');
    await context.close();
  });
});

/** The page's backdrop alone: every screen hidden and every loop held at the same point, as PNG pixels. */
async function bareBackdrop(page) {
  await holdLoops(page, 0.5);
  const hide = await page.addStyleTag({ content: '.screen-router-viewport { visibility: hidden !important; }' });
  await settle(page, 150);
  const png = PNG.sync.read(await page.screenshot());
  await hide.evaluate((el) => el.remove());
  return png;
}

/** How far two shots of one size are apart: the mean and the largest difference of any channel at a pixel, out of 255. */
function apart(a, b) {
  assert.deepEqual([a.width, a.height], [b.width, b.height], 'two shots of the same size');
  let sum = 0;
  let max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    sum += d;
    if (d > max) max = d;
  }
  return { mean: sum / (a.data.length / 4), max };
}

/** Opens the Look screen from the ready screen. */
async function openLookScreen(page) {
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.locator('[data-view="sheet"]').waitFor();
  await page.locator('[data-role="setup-look"]').click();
  await page.locator('[data-view="looks"]').waitFor();
}

test('setup wears Today\'s calm navy in every look, pixel for pixel, and the lobby the host opens wears the look', { timeout: 300_000 }, async () => {
  // The owner's ruling of 2026-10-05: the look's art behind setup's panels read as pasted on, so every setup screen keeps
  // Today's backdrop and the pick shows once, in the Look screen's sample. Each of the four views' backdrops (the ready
  // screen, More options, the Look screen and Quick setups) is shot with every screen hidden and every loop held, in Today
  // and in each drawn look, and the two must be the same pixels.
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const shots = async (look) => {
      const context = await newContext(browser);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, look === 'today' ? '' : `&look=${look}`);
      await lookIs(page, look, `${look}: the page wears the look`);
      if (look !== 'today') await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
      await settle(page, 900);
      const out = { ready: await bareBackdrop(page) };
      await page.getByRole('button', { name: 'More options', exact: true }).click();
      await page.locator('[data-view="sheet"]').waitFor();
      await settle(page, 600);
      out.sheet = await bareBackdrop(page);
      await page.locator('[data-role="setup-look"]').click();
      await page.locator('[data-view="looks"]').waitFor();
      await settle(page, 600);
      out.looks = await bareBackdrop(page);
      if (look !== 'today') {
        assert.equal(await page.locator('.look-stage').evaluate((el) => getComputedStyle(el).display), 'none', `${look}: setup does not show the look's stage layer`);
        assert.equal(await page.locator('.look-slot__picture').evaluate((img) => img.complete && img.naturalWidth > 0), true, `${look}: its picture is decoded behind setup, ready for the lobby`);
      }
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.locator('[data-view="sheet"]').waitFor();
      await page.getByRole('button', { name: 'Quick setups', exact: true }).click();
      await page.locator('[data-view="setups"]').waitFor();
      await settle(page, 600);
      out.setups = await bareBackdrop(page);
      await exposeStore(page);
      await lobby(page, 'widescreen');
      out.lobby = await bareBackdrop(page);
      if (look !== 'today') assert.notEqual(await page.locator('.look-stage').evaluate((el) => getComputedStyle(el).display), 'none', `${look}: the lobby shows the look's stage layer`);
      await context.close();
      return out;
    };
    const today = await shots('today');
    for (const look of DRAWN) {
      const worn = await shots(look);
      for (const view of ['ready', 'sheet', 'looks', 'setups']) {
        const { mean, max } = apart(worn[view], today[view]);
        console.log(`  ${look} ${view}: setup's backdrop against Today's, mean ${mean.toFixed(2)}, max ${max} of 255`);
        assert.ok(mean <= 0.5 && max <= 16, `${look} ${view}: setup's backdrop is Today's (mean ${mean.toFixed(2)}, max ${max} of 255)`);
      }
      // Control: the lobby wears the look, so the same comparison finds the difference there, which shows it can.
      const { mean } = apart(worn.lobby, today.lobby);
      console.log(`  ${look} lobby: against Today's, mean ${mean.toFixed(2)} of 255`);
      assert.ok(mean > 4, `${look}: the lobby wears the look, unlike setup (mean ${mean.toFixed(2)} of 255)`);
    }
  });
});

test('opening the lobby from setup and going back fade the look\'s layer and Today\'s cones and lights over the screens\' 260 ms dissolve, and reduced motion swaps them at once', { timeout: 300_000 }, async () => {
  // Setup keeps Today's backdrop and the lobby wears the look, so each trip between them swaps the look's own layer for
  // Today's cones and lights. A swap that only toggles display cuts on one frame. While a swap starts the page's animation
  // timeline runs 50 times slower, so a busy machine cannot finish a fade before it is read, and each layer's running opacity
  // fade is read with the value it heads for and how long it lasts.
  const LAYERS = { stage: '.stage-atmosphere > .look-stage', cones: '.stage-atmosphere > .stage-cones', lights: '.stage-atmosphere > .show-lights' };
  const fades = (page) => page.evaluate((layers) => Object.fromEntries(Object.entries(layers).map(([name, selector]) => {
    const el = document.querySelector(selector);
    const running = el ? el.getAnimations().filter((a) => a.transitionProperty === 'opacity' && a.playState === 'running') : [];
    return [name, running.map((a) => ({ to: Number(a.effect.getKeyframes().at(-1).opacity), ms: Number(a.effect.getTiming().duration) }))];
  })), LAYERS);
  const shown = (page) => page.evaluate((layers) => Object.fromEntries(Object.entries(layers).map(([name, selector]) => {
    const el = document.querySelector(selector);
    return [name, Boolean(el) && getComputedStyle(el).display !== 'none'];
  })), LAYERS);
  const SETUP = { stage: false, cones: true, lights: true };
  const LOBBY = { stage: true, cones: false, lights: false };
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const reduced of [false, true]) {
      const how = reduced ? 'with reduced motion' : 'with motion';
      const context = await newContext(browser, { width: 1920, height: 1080 }, reduced ? { reducedMotion: 'reduce' } : {});
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Animation.enable');
      await openHost(page, url, '&look=seventies');
      await lookIs(page, 'seventies', `${how}: the page wears the 70s game show`);
      await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
      await page.getByRole('heading', { name: 'Your game is ready', exact: true }).waitFor();
      await settle(page, 900);
      assert.deepEqual(await shown(page), SETUP, `${how}: setup shows Today's cones and lights and not the look's layer`);
      const swap = async (trigger, screen) => {
        await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.02 });
        await trigger();
        await page.waitForFunction((name) => document.querySelector('[data-testid="screen-router"]')?.getAttribute('data-active-screen') === name, screen);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const running = await fades(page);
        const during = await shown(page);
        await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
        await settle(page, 900);
        return { running, during, after: await shown(page) };
      };
      const open = await swap(() => page.getByRole('button', { name: 'Open the lobby', exact: true }).click(), 'Lobby');
      // ArrowLeft is the host's Back (keyboard-actions.ts), which takes the lobby back to setup.
      await page.evaluate(() => document.activeElement?.blur?.());
      const back = await swap(() => page.keyboard.press('ArrowLeft'), 'Preflight');
      console.log(`  ${how}: opening ${JSON.stringify(open.running)}, going back ${JSON.stringify(back.running)}`);
      if (reduced) {
        assert.deepEqual(open, { running: { stage: [], cones: [], lights: [] }, during: LOBBY, after: LOBBY }, `${how}: opening the lobby swaps the layers at once`);
        assert.deepEqual(back, { running: { stage: [], cones: [], lights: [] }, during: SETUP, after: SETUP }, `${how}: and so does going back`);
      } else {
        assert.deepEqual(open.running, { stage: [{ to: 1, ms: 260 }], cones: [{ to: 0, ms: 260 }], lights: [{ to: 0, ms: 260 }] }, `${how}: opening the lobby fades the look's layer in and Today's cones and lights out, over 260 ms`);
        assert.deepEqual(open.during, { stage: true, cones: true, lights: true }, `${how}: the cones and lights stay on while they fade out`);
        assert.deepEqual(open.after, LOBBY, `${how}: and then the lobby shows the look's layer alone`);
        assert.deepEqual(back.running, { stage: [{ to: 0, ms: 260 }], cones: [{ to: 0.5, ms: 260 }], lights: [{ to: 1, ms: 260 }] }, `${how}: going back fades the look's layer out and the cones and lights back in, over 260 ms`);
        assert.deepEqual(back.during, { stage: true, cones: true, lights: true }, `${how}: the look's layer stays on while it fades out`);
        assert.deepEqual(back.after, SETUP, `${how}: and then setup shows Today's backdrop again`);
      }
      await context.close();
    }
  });
});

test('the Look screen shows a still of every look and the pick once, large on a live sample whose pattern follows the switch', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const look of ['today', ...DRAWN]) {
      const context = await newContext(browser);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, look === 'today' ? '' : `&look=${look}`);
      await lookIs(page, look, `${look}: the page wears the look`);
      await openLookScreen(page);
      // Every card shows its own look's still, decoded at its full size.
      assert.equal(await page.locator('.setup-look .look-thumb img').count(), 4, `${look}: every card carries a still`);
      await page.waitForFunction(() => [...document.querySelectorAll('.setup-look .look-thumb img')].every((img) => img.complete));
      const stills = await page.locator('.setup-look').evaluateAll((cards) => cards.map((card) => {
        const img = card.querySelector('.look-thumb img');
        return { option: card.getAttribute('data-look-option'), src: new URL(img.src).pathname, width: img.naturalWidth, height: img.naturalHeight };
      }));
      assert.deepEqual(stills, ['today', 'studio', 'casefile', 'seventies'].map((id) => ({ option: id, src: `/look-thumbs/${id}.webp`, width: 432, height: 243 })), `${look}: a decoded still of every look on its own card`);
      // The pick, once, on the sample question.
      assert.deepEqual(await page.locator('.look-sample').evaluateAll((els) => els.map((el) => el.getAttribute('data-sample'))), [look], `${look}: one sample, in the look in force`);
      if (look !== 'today') {
        await page.waitForFunction(() => { const img = document.querySelector('.look-sample__picture'); return Boolean(img && img.complete && img.naturalWidth > 0); });
        assert.equal(await page.locator('.look-sample__picture').evaluate((img) => new URL(img.src).pathname), `/look-art/${look}-stage.webp`, `${look}: on the look's own big screen picture`);
      } else assert.equal(await page.locator('.look-sample__picture').count(), 0, 'Today has no picture');
      const words = await page.locator('.look-sample').evaluate((sample) => {
        const box = sample.getBoundingClientRect();
        return [...sample.querySelectorAll('.look-sample__words, .look-sample__label')].map((el) => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent, inside: r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 };
        });
      });
      assert.deepEqual(words, [
        { text: 'Shingles pain can continue for years after the rash disappears.', inside: true },
        { text: 'TRUE', inside: true },
        { text: 'FALSE', inside: true },
      ], `${look}: the sample question and its two answers, inside the sample`);
      // Patterns are on by default, so the question's own pattern draws behind the sample, and the switch takes it away at once.
      await waitForPattern(page, 'preview', 'shingles');
      assert.equal(await page.locator('.look-sample > .topic-pattern').count(), 1, `${look}: the shingles pattern draws in the sample`);
      await page.getByRole('switch', { name: 'Topic patterns' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.look-sample > .topic-pattern').length === 0);
      await page.getByRole('switch', { name: 'Topic patterns' }).click();
      await waitForPattern(page, 'preview', 'shingles');
      await context.close();
    }
    // A pick changes the sample at once, and the stills stay as they were.
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url);
    await openLookScreen(page);
    await page.getByRole('radio', { name: /^Case file/ }).click();
    await lookIs(page, 'casefile', 'the pick applies at once');
    assert.deepEqual(await page.locator('.look-sample').evaluateAll((els) => els.map((el) => el.getAttribute('data-sample'))), ['casefile'], 'and the sample shows it');
    assert.equal(await page.locator('.setup-look .look-thumb').count(), 4, 'beside the same four stills');
    await context.close();
  });
});

test('the sample follows reduced transparency and forced colours as the stage does: a solid hold and no pattern, or the system colours and no pattern', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const visibleLayers = (page) => page.locator('.look-sample > .topic-pattern').evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== 'none').length);
    for (const look of ['studio', 'casefile']) {
      // Less transparency: the sample's hold over its picture goes solid with no feather, as the stage's does, and no pattern draws.
      const quiet = await newContext(browser);
      const page = await quiet.newPage();
      page.setDefaultTimeout(30_000);
      const cdp = await quiet.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      await openHost(page, url, `&look=${look}`);
      await openLookScreen(page);
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true, 'reduced transparency is on');
      assert.equal(await page.locator('.look-sample').count(), 1, `${look}: the Look screen shows its sample`);
      await page.waitForFunction(() => { const img = document.querySelector('.look-sample__picture'); return Boolean(img && img.complete && img.naturalWidth > 0); });
      const [hold] = await solidReport(page, '.look-sample__scrim');
      assert.equal(hold.alpha, 1, `${look}: the sample's hold is solid under reduced transparency (alpha ${hold.alpha})`);
      assert.equal(hold.filter, 'none', `${look}: and it does not blur`);
      await settle(page, 900);
      assert.equal(await visibleLayers(page), 0, `${look}: no pattern draws in the sample`);
      await quiet.close();
      // Forced colours: the sample, like the stage, keeps its picture, drops its pattern and takes the system's colours.
      const forced = await newContext(browser, { width: 1920, height: 1080 }, { forcedColors: 'active' });
      const forcedPage = await forced.newPage();
      forcedPage.setDefaultTimeout(30_000);
      await openHost(forcedPage, url, `&look=${look}`);
      await openLookScreen(forcedPage);
      assert.equal(await forcedPage.evaluate(() => matchMedia('(forced-colors: active)').matches), true, 'forced colours are on');
      await forcedPage.waitForFunction(() => { const img = document.querySelector('.look-sample__picture'); return Boolean(img && img.complete && img.naturalWidth > 0); });
      await settle(forcedPage, 900);
      assert.equal(await visibleLayers(forcedPage), 0, `${look}: no pattern draws in the sample under forced colours`);
      assert.equal(await forcedPage.locator('.look-sample__words').isVisible(), true, `${look}: and its words still show`);
      await forced.close();
    }
    // Control: with neither preference the hold over the studio picture is see-through and feathered, and the pattern draws, so
    // the probes above can read a hold that is not solid and a layer that is drawn.
    const normal = await newContext(browser);
    const page = await normal.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '&look=studio');
    await openLookScreen(page);
    await waitForPattern(page, 'preview', 'shingles');
    const [hold] = await solidReport(page, '.look-sample__scrim');
    assert.ok(hold.alpha < 1 && hold.filter !== 'none', `control: without the preference the sample's hold is see-through and feathered (alpha ${hold.alpha}, ${hold.filter})`);
    assert.equal(await visibleLayers(page), 1, 'control: and the pattern draws');
    await normal.close();
  });
});

/**
 * Which of two layers paints over the other. They are compared where their branches part, in the stacking context they share,
 * by z-index (auto counts as 0, since every layer compared here is positioned) and then by order in the page.
 */
const paintsOver = (page, upper, lower) => page.evaluate(({ upper, lower }) => {
  const a = document.querySelector(upper);
  const b = document.querySelector(lower);
  if (!a || !b) return `missing ${a ? lower : upper}`;
  if (a === b || a.contains(b) || b.contains(a)) return 'the same layer, or one inside the other';
  const chain = (el) => { const out = []; for (let node = el; node; node = node.parentElement) out.unshift(node); return out; };
  const ca = chain(a);
  const cb = chain(b);
  let i = 0;
  while (ca[i] === cb[i]) i += 1;
  const [sideA, sideB] = [ca[i], cb[i]];
  if ([sideA, sideB].some((el) => getComputedStyle(el).position === 'static')) return 'a layer is not positioned';
  const z = (el) => { const value = getComputedStyle(el).zIndex; return value === 'auto' ? 0 : Number(value); };
  const order = [...ca[i - 1].children];
  return z(sideA) === z(sideB) ? order.indexOf(sideA) > order.indexOf(sideB) : z(sideA) > z(sideB);
}, { upper, lower });

test('the sample stacks its picture, its calm hold and its topic pattern in the stage\'s order, so the hold never dims the pattern', { timeout: 300_000 }, async () => {
  // The stage draws its calm hold inside the look's own layer and the topic pattern as the next layer up (ScreenRouter.tsx).
  // In each look whose hold over its picture is above 0, the stage posing the sample's card and the sample itself are read
  // for the order of the picture, the hold, the pattern and the words.
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const look of ['studio', 'seventies']) {
      const stageContext = await newContext(browser);
      const stage = await stageContext.newPage();
      stage.setDefaultTimeout(30_000);
      await openHost(stage, url, `&look=${look}`);
      await exposeStore(stage);
      await stage.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
      await posed(stage, { format: 'widescreen', questionId: 'q6' });
      await waitForPattern(stage, 'stage', 'shingles');
      assert.equal(await stage.locator('.look-stage__calm').evaluate((el) => getComputedStyle(el).display), 'block', `${look}: the stage holds its picture behind a question`);
      assert.equal(await paintsOver(stage, '.look-stage__calm', '.look-slot__picture'), true, `${look}: on the stage the hold is over the picture`);
      assert.equal(await paintsOver(stage, '.stage-atmosphere > .topic-pattern', '.look-stage__calm'), true, `${look}: and the pattern is over the hold`);
      await stageContext.close();
      const sampleContext = await newContext(browser);
      const sample = await sampleContext.newPage();
      sample.setDefaultTimeout(30_000);
      await openHost(sample, url, `&look=${look}`);
      await lookIs(sample, look, `${look}: the page wears the look`);
      await openLookScreen(sample);
      await waitForPattern(sample, 'preview', 'shingles');
      assert.equal(await paintsOver(sample, '.look-sample__scrim', '.look-sample__picture'), true, `${look}: in the sample the hold is over the picture`);
      assert.equal(await paintsOver(sample, '.look-sample > .topic-pattern', '.look-sample__scrim'), true, `${look}: the pattern is over the hold, as on the stage`);
      assert.equal(await paintsOver(sample, '.look-sample__question', '.look-sample > .topic-pattern'), true, `${look}: and the question is over the pattern`);
      await sampleContext.close();
    }
  });
});

test('a pick puts the new look\'s picture in a new image, so the sample never shows the last look\'s picture under the new treatment', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '&look=studio');
    await openLookScreen(page);
    await page.waitForFunction(() => { const img = document.querySelector('.look-sample__picture'); return Boolean(img && img.complete && img.naturalWidth > 0); });
    const first = await page.locator('.look-sample__picture').elementHandle();
    await page.getByRole('radio', { name: /^Case file/ }).click();
    await lookIs(page, 'casefile', 'the pick applies');
    await page.waitForFunction(() => document.querySelector('.look-sample')?.getAttribute('data-sample') === 'casefile');
    assert.equal(await first.evaluate((img) => img.isConnected), false, 'the Studio set picture leaves with its look');
    assert.equal(await page.locator('.look-sample__picture').evaluate((img) => new URL(img.src).pathname), '/look-art/casefile-stage.webp', 'and Case file\'s picture comes in a new image');
    await context.close();
  });
});

/**
 * The computed styles that make a look's answer cards, their words and the stem's words, read from the page, with Case
 * file's paper sheet under the stem. `frame` is the box every length is a share of: the 1600 wide stage canvas, or the
 * sample, which draws the stage at its own width. Widths come from offsetWidth, so the stage's scale does not enter.
 */
const readTreatment = (page, { answers, label, words, sheet, frame }) => page.evaluate(({ answers, label, words, sheet, frame }) => {
  // A pseudo-element with no content is never drawn, so it has nothing to compare but that. A border that is not drawn has no
  // colour worth comparing either: its colour is only the element's text colour.
  const pick = (el, pseudo, props) => {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo && ['none', 'normal'].includes(cs.content)) return { content: 'none' };
    const out = Object.fromEntries(props.map((prop) => [prop, cs.getPropertyValue(prop)]));
    if ('border-top-color' in out && (cs.borderTopStyle === 'none' || parseFloat(cs.borderTopWidth) === 0)) out['border-top-color'] = 'no border';
    return out;
  };
  const CARD = ['background-image', 'background-color', 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius', 'box-shadow', 'clip-path'];
  const INNER = ['content', 'background-image', 'clip-path', 'top', 'left'];
  const TYPE = ['color', 'font-family', 'font-weight', 'font-size', 'letter-spacing', 'text-shadow'];
  const stem = document.querySelector(sheet);
  return {
    width: document.querySelector(frame).offsetWidth,
    answers: [...document.querySelectorAll(answers)].map((el) => ({ card: pick(el, null, CARD), inner: pick(el, '::after', INNER), label: pick(el.querySelector(label), null, TYPE) })),
    words: pick(document.querySelector(words), null, TYPE),
    // Case file's paper is the stem's ::before and its paper clip the ::after. Only the paper turns a hair off square: the words
    // on it stand straight.
    sheet: {
      paper: pick(stem, '::before', ['content', 'background-image', 'box-shadow', 'border-top-left-radius', 'transform']),
      box: pick(stem, null, ['transform']),
      clip: pick(stem, '::after', ['content', 'top', 'right', 'width', 'height', 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius', 'box-shadow', 'transform']),
    },
  };
}, { answers, label, words, sheet, frame });

/**
 * One computed value in a form two widths can be compared in: colours as sRGB, lengths as a share of the frame, and a font
 * stack as its first family, the one that draws once the page's fonts have loaded.
 */
function canon(value, width, prop) {
  const color = (parts) => { const [r, g, b, a = '1'] = parts; return `c(${[r, g, b].map((v) => Number(v).toFixed(3)).join(' ')} ${Number(a).toFixed(3)})`; };
  const first = prop === 'font-family' ? value.split(',')[0].replace(/"/g, '') : value;
  return first
    .replace(/rgba?\(([^)]+)\)/g, (_, inner) => { const [r, g, b, a] = inner.split(/[\s,/]+/).filter(Boolean); return color([r / 255, g / 255, b / 255, a ?? '1']); })
    .replace(/color\(srgb ([^)]+)\)/g, (_, inner) => color(inner.split(/[\s/]+/).filter(Boolean)))
    .replace(/(-?\d*\.?\d+)px/g, (_, n) => `${(Number(n) / width).toFixed(5)}w`)
    .replace(/linear-gradient\((?:180deg|to bottom), /g, 'linear-gradient(')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Where the sample's treatment differs from the stage's: every value compared token by token, with lengths as a share of each
 * one's own frame, and each number within a tolerance for its kind: 0.02 percent of the width for a length (a third of a
 * pixel on the stage), half a percent for a gradient stop, and 0.002 for anything without a unit, which is a colour channel
 * or an alpha out of 1, a matrix entry (a quarter of a degree of turn is 0.004) or a weight.
 */
function drift(stage, sample, widths, where = '') {
  if (stage && typeof stage === 'object') {
    return Object.keys(stage).flatMap((key) => drift(stage[key], sample?.[key], widths, `${where}${where ? '.' : ''}${key}`));
  }
  const prop = where.split('.').at(-1);
  const a = canon(String(stage), widths.stage, prop);
  const b = canon(String(sample ?? ''), widths.sample, prop);
  const ta = a.split(/(-?\d*\.?\d+)/);
  const tb = b.split(/(-?\d*\.?\d+)/);
  const same = ta.length === tb.length && ta.every((token, i) => {
    if (i % 2 === 0) return token === tb[i];
    const unit = (ta[i + 1] ?? '')[0];
    const tolerance = unit === 'w' ? 0.0002 : unit === '%' ? 0.5 : 0.002;
    return Math.abs(Number(token) - Number(tb[i])) <= tolerance;
  });
  return same ? [] : [`${where}: the stage has ${a}, the sample ${b}`];
}

test('the sample wears each look\'s own stage treatment, measured against the real stage posing the same card', { timeout: 300_000 }, async () => {
  // The sample draws the stage's answer cards at the stage's proportions from its own stylesheet (picker.css), so it can drift
  // from the stage when a look changes. This poses the sample's card on the real stage in each look and compares the computed
  // styles of its two answers, their words and the stem's words with the sample's, and in Case file its paper sheet too.
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const drifts = {};
    for (const look of ['today', ...DRAWN]) {
      const stageContext = await newContext(browser);
      const stagePage = await stageContext.newPage();
      stagePage.setDefaultTimeout(30_000);
      await openHost(stagePage, url, `${look === 'today' ? '' : `&look=${look}`}&pattern=off`);
      await lookIs(stagePage, look, `${look}: the stage wears the look`);
      await exposeStore(stagePage);
      await posed(stagePage, { format: 'widescreen', questionId: 'q6' });
      const stage = await readTreatment(stagePage, { answers: '.question-shell .question-show-frame--binary .answer-bar', label: '.answer-bar__label', words: '.question-shell .question-stage-copy h1', sheet: '.question-shell .question-stage-copy', frame: '.scaled-stage-content' });
      await stageContext.close();
      const sampleContext = await newContext(browser);
      const samplePage = await sampleContext.newPage();
      samplePage.setDefaultTimeout(30_000);
      await openHost(samplePage, url, look === 'today' ? '' : `&look=${look}`);
      await lookIs(samplePage, look, `${look}: the page wears the look`);
      await openLookScreen(samplePage);
      const sample = await readTreatment(samplePage, { answers: '.look-sample__answer', label: '.look-sample__label', words: '.look-sample__words', sheet: '.look-sample__stem', frame: '.look-sample' });
      await sampleContext.close();
      assert.equal(stage.answers.length, 2, `${look}: the stage shows two answers`);
      assert.equal(sample.answers.length, 2, `${look}: and so does the sample`);
      assert.equal(stage.width, 1600, `${look}: the stage's lengths are read on its 1600 wide canvas`);
      // The frame's width is what the lengths are a share of, not a value to compare, and only Case file draws a sheet.
      const compare = ({ width: _width, sheet, ...rest }) => (look === 'casefile' ? { ...rest, sheet } : rest);
      drifts[look] = drift(compare(stage), compare(sample), { stage: stage.width, sample: sample.width });
    }
    // Every look is read before any is judged, so one run lists every drift.
    assert.deepEqual(drifts, { today: [], studio: [], casefile: [], seventies: [] }, 'the sample\'s answers and words match the stage\'s in every look, and in Case file so does its sheet');
  });
});

test('a hold of 0 percent paints no calm layer: Case file skips it on its questions and its lobby, keeps it where its hold is above 0, and less transparency keeps it solid', { timeout: 300_000 }, async () => {
  // Case file holds its picture at 0 percent on its questions and its lobby, where every word sits on paper, a tag or label
  // tape, so a blurred see-through layer there would draw nothing. Every other hold keeps its layer.
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const calm = (page) => page.locator('.look-stage__calm').evaluate((el) => ({ display: getComputedStyle(el).display, hold: getComputedStyle(el.parentElement).getPropertyValue('--look-calm-stage').trim() }));
    const open = async (look, { quiet = false } = {}) => {
      const context = await newContext(browser);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      if (quiet) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      }
      await openHost(page, url, `&look=${look}`);
      await exposeStore(page);
      await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
      return { context, page };
    };
    const casefile = await open('casefile');
    await posed(casefile.page, { format: 'widescreen', questionId: 'q5' });
    assert.deepEqual(await calm(casefile.page), { display: 'none', hold: '0%' }, 'Case file paints no calm layer behind a question');
    await lobby(casefile.page, 'widescreen');
    assert.deepEqual(await calm(casefile.page), { display: 'none', hold: '0%' }, 'or behind its lobby');
    await frameScreen(casefile.page, 'widescreen', 'title');
    assert.deepEqual(await calm(casefile.page), { display: 'block', hold: '76%' }, 'and keeps it on a screen of words alone, where its hold is 76 percent');
    await casefile.context.close();
    const studio = await open('studio');
    await posed(studio.page, { format: 'widescreen', questionId: 'q5' });
    assert.deepEqual(await calm(studio.page), { display: 'block', hold: '35%' }, 'the Studio set keeps its 35 percent hold behind a question');
    await studio.context.close();
    const quiet = await open('casefile', { quiet: true });
    await posed(quiet.page, { format: 'widescreen', questionId: 'q5' });
    assert.equal((await calm(quiet.page)).display, 'block', 'with less transparency Case file keeps the layer behind a question');
    const [solid] = await solidReport(quiet.page, '.look-stage__calm');
    assert.equal(solid.alpha, 1, 'as a solid hold');
    await quiet.context.close();
  });
});

test('while a first pick waits for its look\'s stylesheets the sample keeps the look the page wears, and then shows the pick whole', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const styles = await holdRequests(context, LOOK_STYLE_FILES);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url);
    await openLookScreen(page);
    const sample = () => page.locator('.look-sample').evaluate((el) => ({ look: el.getAttribute('data-sample'), picture: el.querySelector('.look-sample__picture') ? new URL(el.querySelector('.look-sample__picture').src).pathname : null }));
    await page.getByRole('radio', { name: /^Studio set/ }).click();
    await styles.asked("the look's stylesheets");
    assert.equal(await page.getByRole('radio', { name: /^Studio set/ }).isChecked(), true, 'the pick shows on its card at once');
    await settle(page, 300);
    assert.deepEqual(await sample(), { look: 'today', picture: null }, 'while the styles are on their way the sample shows the look the page wears, with no picture of the next one');
    await styles.release();
    await lookIs(page, 'studio', 'the look arrives with its stylesheets');
    await page.waitForFunction(() => document.querySelector('.look-sample')?.getAttribute('data-sample') === 'studio');
    assert.deepEqual(await sample(), { look: 'studio', picture: '/look-art/studio-stage.webp' }, 'and then the sample shows it, picture and treatment together');
    await context.close();
  });
});

test('the 70s kicker takes the slimmer margin on the square and portrait canvases, so MAKE YOUR CALL stays on one line', { timeout: 300_000 }, async () => {
  // looks.css gives every look's kicker a slimmer margin where the header row is narrow, and the 70s pill took its own 24px
  // there, which broke MAKE YOUR CALL onto two lines on the portrait canvas.
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const canvas of CANVASES) {
      const context = await newContext(browser, { width: canvas.width, height: canvas.height });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, '&look=seventies');
      await exposeStore(page);
      await posed(page, { format: canvas.format, questionId: 'q5' });
      const kicker = await page.locator('.question-source-kicker').evaluate((el) => {
        // The kicker's text now lives in its own .question-source-kicker__words span (VOF-99, Today's kicker
        // plate hugs the word). Selecting the whole <p> here would range over the span as a single child
        // element rather than a text node, which reports its flex-item box and its line box as two separate
        // client rects even on one visual line. Measure the words' own text node instead, falling back to the
        // kicker element itself if a look never adds the span.
        const words = el.querySelector('.question-source-kicker__words') ?? el;
        const range = document.createRange();
        range.selectNodeContents(words);
        return { text: el.textContent.trim(), padding: getComputedStyle(el).paddingLeft, lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size };
      });
      const want = canvas.format === 'widescreen' ? '24px' : '8px';
      assert.equal(kicker.padding, want, `${canvas.id}: the 70s kicker's inline margin is ${want}`);
      assert.deepEqual([kicker.text.toUpperCase(), kicker.lines], ['MAKE YOUR CALL', 1], `${canvas.id}: and the call sits on one line`);
      await context.close();
    }
  });
});

test('a ?look= flag wins at load and is never remembered, and the pick made in setup wins after it', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${url}/join`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('vof:show-look', 'studio'));
    await openHost(page, url, '&look=seventies');
    await lookIs(page, 'seventies', 'the flag wins over the remembered pick at load');
    assert.equal(await remembered(page), 'studio', 'a test link never changes what the device remembers');
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.locator('[data-role="setup-look"]').click();
    assert.equal(await page.getByRole('radio', { name: /^70s game show/ }).isChecked(), true, 'the picker shows the look in force');
    await page.getByRole('radio', { name: /^Case file/ }).click();
    await lookIs(page, 'casefile', 'a pick made in setup wins from then on');
    assert.equal(await remembered(page), 'casefile');
    await openHost(page, url, '&look=nonsense');
    await lookIs(page, 'casefile', 'a flag that names no look is ignored');
    await openHost(page, url, '&look=today');
    await lookIs(page, 'today', 'the flag can force Today over a remembered look');
    assert.equal(await remembered(page), 'casefile');
    await context.close();
  });
});

test('a phone, solo play and the site pages show Today even on the device that remembered a look', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${url}/about`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('vof:show-look', 'studio'));
    // The host's remembered pick is in reach of every page on this device. None of these read it.
    await page.goto(`${url}/join?room=ABCD`, { waitUntil: 'load' });
    await page.locator('.phone-live-shell').first().waitFor();
    await lookIs(page, 'today', 'a phone with no flag shows Today');
    assert.equal(await page.locator('.look-phone, .look-stage').count(), 0, 'and carries no look art');
    assert.equal(await lookStyles(page), 0, 'and loads none of the drawn looks stylesheets');
    await page.goto(`${url}/join?room=ABCD&look=nonsense`, { waitUntil: 'load' });
    await page.locator('.phone-live-shell').first().waitFor();
    await lookIs(page, 'today', 'a look this build does not know falls back to Today');
    await page.goto(`${url}/join?room=ABCD&look=casefile`, { waitUntil: 'load' });
    await page.locator('.phone-live-shell').first().waitFor();
    await lookIs(page, 'casefile', 'the testing flag still works on a phone');
    assert.ok(await lookStyles(page) > 0, 'and brings the stylesheets');
    assert.equal(await page.locator('.look-phone[data-look-layer="casefile"][data-art="drawn"]').count(), 1, 'a phone draws its set by default');
    assert.equal(await page.locator('.look-slot__picture').count(), 0, 'and does not load a picture');
    assert.equal(await remembered(page), 'studio', 'the phone never wrote the device memory');
    await page.goto(`${url}/join?room=ABCD&look=studio&art=ai`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-phone') === 'ai');
    assert.equal(await page.locator('.look-phone[data-art="ai"] .look-slot__picture').count(), 1, 'art=ai puts the picture on a phone');

    for (const pathname of ['/play', '/play?look=studio', '/about', '/privacy']) {
      await page.goto(`${url}${pathname}`, { waitUntil: 'load' });
      await settleSoft(page);
      await lookIs(page, null, `${pathname} mounts no look root`);
      assert.equal(await page.locator('.look-phone, .look-stage, .look-reveal-backdrop').count(), 0, `${pathname} carries no look art`);
    }
    await context.close();
  });
});

async function settleSoft(page) {
  await page.waitForTimeout(600);
}

test('the big screen shows its picture, and keeps the drawn set when the picture will not load', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '&look=studio');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
    assert.equal(await page.locator('.look-stage[data-art="ai"] .look-slot__picture').count(), 1, 'a picture on the big screen by default');
    assert.equal(await page.locator('.look-art--studio').count(), 0, 'in place of the drawn set');
    await openHost(page, url, '&look=studio&art=drawn');
    await settle(page);
    assert.equal(await page.locator('.look-slot__picture').count(), 0, 'art=drawn keeps the drawn set');
    assert.equal(await page.locator('.look-art--studio').count() > 0, true);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-look-art-stage')), null);
    await context.route('**/look-art/casefile-stage.webp', (route) => route.abort());
    await openHost(page, url, '&look=casefile');
    await settle(page, 1500);
    assert.equal(await page.locator('.look-slot__picture').count(), 0, 'a picture that will not load never shows');
    assert.equal(await page.locator('.look-art--casefile').count() > 0, true, 'the drawn set stays');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-look-art-stage')), null, 'and the page is not marked as showing a picture');
    await context.close();
  });
});

// A request that hangs on slow venue Wi-Fi never fails and never finishes, so a page that waits on one without a limit waits
// for good. The tests below hold such a request with a route that never answers, check the page is on screen within its
// own wait anyway, and then let the request go to see the page pick the look up late.
const LOOK_STYLE_FILES = /\/src\/looks\/(?:looks|studio|casefile|seventies)\.css/;
// The page waits about 1.5 s for the look's styles and about 4 s for a picture. These bounds leave room for the render
// after the wait on a loaded machine, and are still short enough to catch a wait that was lengthened or lost.
const STYLES_SHOW_WITHIN_MS = 6000;
const PICTURE_FALLS_BACK_WITHIN_MS = 8000;

/** Holds every request the pattern matches without answering it. release() lets the held ones, and any later request, through. */
async function holdRequests(context, pattern) {
  const held = [];
  let open = false;
  await context.route(pattern, async (route) => {
    if (open) await route.continue().catch(() => {});
    else held.push(route);
  });
  return {
    held,
    /** Waits until the page has asked for something, so a hang that never happened cannot pass for a page that coped with one. */
    async asked(what, timeout = 30_000) {
      const started = Date.now();
      while (held.length === 0) {
        assert.ok(Date.now() - started < timeout, `${what} was never asked for, so the hang this test makes is not real`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async release() {
      open = true;
      await Promise.all(held.splice(0).map((route) => route.continue()));
    },
  };
}

/** Records which look the root wore the first time the host page's screen router was on screen, null for none, as window.__firstFrameLook. */
async function watchFirstFrame(context) {
  await context.addInitScript(() => {
    window.__firstFrameLook = undefined;
    const watch = new MutationObserver(() => {
      if (window.__firstFrameLook !== undefined || !document.querySelector('[data-testid="screen-router"]')) return;
      window.__firstFrameLook = document.documentElement.dataset.look ?? null;
      watch.disconnect();
    });
    watch.observe(document, { childList: true, subtree: true });
  });
}

/** Records every Image the page makes as window.__images, so a test can see the page's own picture finish loading, or finish one by hand. */
async function trackImages(context) {
  await context.addInitScript(() => {
    const Native = window.Image;
    window.__images = [];
    function TrackedImage(width, height) {
      const image = new Native(width, height);
      window.__images.push(image);
      return image;
    }
    TrackedImage.prototype = Native.prototype;
    window.Image = TrackedImage;
  });
}

/** Waits until the page's own Image for a file has finished loading. */
const pictureLoaded = (page, file) => page.waitForFunction((file) => window.__images.some((image) => image.src.endsWith(file) && image.complete && image.naturalWidth > 0), file);

const rememberStudio = (context) => context.addInitScript(() => { try { localStorage.setItem('vof:show-look', 'studio'); } catch { /* storage may be blocked */ } });

test('a page that starts on a look waits for its styles inside the wait and then shows that look from its first frame, and never flashes Today first', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    // The dev server compiles a stylesheet the first time it is asked for it. One visit first makes the next one quick, as a
    // stylesheet already built is, so this checks the page and not how fast a cold server compiles four of them.
    const warm = await newContext(browser);
    const warmPage = await warm.newPage();
    warmPage.setDefaultTimeout(30_000);
    await openHost(warmPage, url, '&look=studio');
    await lookIs(warmPage, 'studio', 'the warm up visit reaches the look');
    await warm.close();
    const context = await newContext(browser);
    await rememberStudio(context);
    await watchFirstFrame(context);
    // The styles are held for a short moment well inside the wait, the way a slow but working connection would delay them. The
    // hold is short on purpose, so the wait keeps nearly all of its room for a loaded machine to serve four stylesheets after it.
    const styles = await holdRequests(context, LOOK_STYLE_FILES);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(hostUrl(url), { waitUntil: 'domcontentloaded' });
    await styles.asked("the look's stylesheets");
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-testid="screen-router"]').count(), 0, 'while the styles are on their way and the wait is not over, the page shows nothing, so Today never flashes');
    await styles.release();
    await page.waitForSelector('[data-testid="screen-router"]');
    assert.equal(await page.evaluate(() => window.__firstFrameLook), 'studio', 'the first frame of the page already wears the remembered look');
    await lookIs(page, 'studio', 'and it still does');
    await context.close();
  });
});

test('a look stylesheet that never answers never blanks the host page: Today shows within the wait, and the look arrives when the request is released', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    // This device's host picked Studio set for an earlier game, so the page starts on a look and has to load its styles first.
    await rememberStudio(context);
    await watchFirstFrame(context);
    const styles = await holdRequests(context, LOOK_STYLE_FILES);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(hostUrl(url), { waitUntil: 'domcontentloaded' });
    await styles.asked("the look's stylesheets");
    const shown = await page.waitForSelector('[data-testid="screen-router"]', { timeout: STYLES_SHOW_WITHIN_MS }).then(() => true, () => false);
    assert.equal(shown, true, `the host page is on screen within ${STYLES_SHOW_WITHIN_MS} ms of asking for the look's stylesheets, though they never arrive`);
    await lookIs(page, 'today', 'it shows Today until the look arrives');
    assert.equal(await page.evaluate(() => window.__firstFrameLook), null, 'control: the first frame probe reads Today when the page really does start on Today');
    assert.equal(await lookStyles(page), 0, 'and none of the look stylesheets has arrived');
    // Setup is not an empty shell: it answers a click while the look is still on its way.
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.locator('[data-view="sheet"]').waitFor();
    assert.match((await page.locator('[data-role="setup-look"]').textContent()).trim(), /^Look: Studio set$/, 'and it still names the look this device remembers');
    await styles.release();
    await lookIs(page, 'studio', 'the look arrives once its stylesheets do');
    assert.equal(await lookStyles(page), 4, 'with all four of them');
    await context.close();
  });
});

test('a look stylesheet that never answers never blanks a phone either: the join screen shows within the wait, and the look arrives when the request is released', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const styles = await holdRequests(context, LOOK_STYLE_FILES);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    // A phone wears the look its address names, or the one its room carries. Either way its screens sit inside the look root.
    await page.goto(`${url}/join?room=ABCD&look=casefile`, { waitUntil: 'domcontentloaded' });
    await styles.asked("the look's stylesheets");
    const shown = await page.locator('.phone-live-shell').first().waitFor({ timeout: STYLES_SHOW_WITHIN_MS }).then(() => true, () => false);
    assert.equal(shown, true, `the phone is on screen within ${STYLES_SHOW_WITHIN_MS} ms of asking for the look's stylesheets, though they never arrive`);
    await lookIs(page, 'today', 'it shows Today until the look arrives');
    assert.equal(await lookStyles(page), 0, 'and none of the look stylesheets has arrived');
    await styles.release();
    await lookIs(page, 'casefile', 'the look arrives once its stylesheets do');
    await context.close();
  });
});

test('a picture that never arrives never holds the big screen on a bare wash: the drawn set shows after the wait, and the picture is taken at the next beat once it comes', { timeout: 240_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    await trackImages(context);
    const pictures = await holdRequests(context, '**/look-art/studio-stage.webp');
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    // Not 'load': a picture that is still on its way is a resource the load event waits for.
    await page.goto(hostUrl(url, '&look=studio'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="screen-router"]');
    await pictures.asked('the studio picture');
    // While the wait runs the slot holds the wash alone, so the drawn set never flashes up before a picture that is on its way.
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.look-stage[data-art="loading"]').count(), 1, 'the wash holds the slot while the picture is awaited');
    assert.equal(await page.locator('.look-art--studio, .look-fx').count(), 0, 'and no drawn set shows yet');
    // Once the wait has run out the drawn set takes the slot, though the picture has still not answered.
    // Setup does not show the look's stage (it wears Today's navy), so the wait is for the stage's state, not its paint.
    const fellBack = await page.waitForSelector('.look-stage[data-art="drawn"]', { state: 'attached', timeout: PICTURE_FALLS_BACK_WITHIN_MS }).then(() => true, () => false);
    assert.equal(fellBack, true, `the big screen shows the drawn set within ${PICTURE_FALLS_BACK_WITHIN_MS} ms of asking for a picture that never arrives, not a bare wash`);
    assert.ok(await page.locator('.look-art--studio').count() > 0, 'the studio set is what shows');
    assert.equal(await page.locator('.look-slot__picture').count(), 0, 'and no picture does');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-look-art-stage')), null, 'and the page is not marked as showing one');

    // A beat that comes while the picture is still missing has nothing to take, and is not remembered: the picture that
    // arrives afterwards still waits for the next beat after its own arrival.
    await exposeStore(page);
    await lobby(page, 'widescreen');
    assert.equal(await page.locator('.look-stage[data-art="drawn"]').count(), 1, 'a new screen with no picture to take leaves the drawn set');

    await pictures.release();
    // The page's own picture has finished loading, which is what makes the check below mean something. Its load event is
    // handled a moment later, so the page has had its chance to take the picture before the check.
    await pictureLoaded(page, '/look-art/studio-stage.webp');
    await settle(page, 300);
    assert.equal(await page.locator('.look-stage[data-art="drawn"]').count(), 1, 'the picture has arrived and the screen does not change under the room');
    assert.equal(await page.locator('.look-slot__picture').count(), 0, 'no picture lands in the middle of a screen');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-look-art-stage')), null, 'and the page is still not marked as showing one');

    // The next new screen is the moment it is taken.
    await posed(page, { format: 'widescreen', questionId: 'q5' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
    assert.equal(await page.locator('.look-stage[data-art="ai"] .look-slot__picture').count(), 1, 'the picture takes the slot at the next beat');
    assert.equal(await page.locator('.look-stage[data-art="ai"] .look-stage__calm').count(), 1, 'with its calm hold');
    assert.equal(await page.locator('.look-art--studio').count(), 0, 'in place of the drawn set');
    await page.waitForFunction(() => { const img = document.querySelector('.look-slot__picture'); return Boolean(img && img.complete && img.naturalWidth > 0); });
    await context.close();
  });
});

test('a picture that never arrives never holds a phone on a bare wash either', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const pictures = await holdRequests(context, '**/look-art/studio-phone.webp');
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    // A phone draws its set unless the address asks for pictures. Here it does.
    await page.goto(`${url}/join?room=ABCD&look=studio&art=ai`, { waitUntil: 'domcontentloaded' });
    await page.locator('.phone-live-shell').first().waitFor();
    await pictures.asked('the studio phone picture');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.look-phone[data-art="loading"]').count(), 1, 'the wash holds the slot while the picture is awaited');
    assert.equal(await page.locator('.look-art--studio-phone, .look-fx').count(), 0, 'and no drawn set shows yet');
    const fellBack = await page.waitForSelector('.look-phone[data-art="drawn"]', { timeout: PICTURE_FALLS_BACK_WITHIN_MS }).then(() => true, () => false);
    assert.equal(fellBack, true, `the phone shows the drawn set within ${PICTURE_FALLS_BACK_WITHIN_MS} ms of asking for a picture that never arrives, not a bare wash`);
    assert.ok(await page.locator('.look-art--studio-phone').count() > 0, 'the studio phone set is what shows');
    assert.equal(await page.locator('.look-slot__picture').count(), 0, 'and no picture does');
    await context.close();
  });
});

test('a pick that lands on a picture which arrived while another look was on shows it at once, and is not held for a beat', { timeout: 240_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    await trackImages(context);
    const pictures = await holdRequests(context, '**/look-art/studio-stage.webp');
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(hostUrl(url), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="screen-router"]');
    // The host picks Studio set in setup and its picture never answers, so after the wait the drawn set stands in.
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.locator('[data-role="setup-look"]').click();
    await page.getByRole('radio', { name: /^Studio set/ }).click();
    await pictures.asked('the studio picture');
    // Setup does not show the look's stage (it wears Today's navy), so each wait is for the stage's state, not its paint.
    const fellBack = await page.waitForSelector('.look-stage[data-look-layer="studio"][data-art="drawn"]', { state: 'attached', timeout: PICTURE_FALLS_BACK_WITHIN_MS }).then(() => true, () => false);
    assert.equal(fellBack, true, 'Studio set shows its drawn set once the wait for its picture has run out');
    // Then Case file, whose picture comes at once, and the studio picture arrives while Case file is on.
    await page.getByRole('radio', { name: /^Case file/ }).click();
    await page.waitForSelector('.look-stage[data-look-layer="casefile"][data-art="ai"]', { state: 'attached' });
    await pictures.release();
    await pictureLoaded(page, '/look-art/studio-stage.webp');
    await settle(page, 300);
    // Picking Studio set again lands on a picture that is already here. The host chose that swap, so the picture shows at
    // once, with no new screen in between to wait for. Every state the stage commits from here on is recorded, so a frame of
    // the drawn set before the picture would show in the record.
    await page.evaluate(() => {
      const stage = document.querySelector('.look-stage');
      window.__stageStates = [];
      new MutationObserver(() => { window.__stageStates.push(`${stage.getAttribute('data-look-layer')}:${stage.getAttribute('data-art')}`); })
        .observe(stage, { attributes: true, attributeFilter: ['data-look-layer', 'data-art'] });
    });
    await page.getByRole('radio', { name: /^Studio set/ }).click();
    const shown = await page.waitForSelector('.look-stage[data-look-layer="studio"][data-art="ai"]', { state: 'attached', timeout: 5000 }).then(() => true, () => false);
    assert.equal(shown, true, 'a pick that lands on a picture already here shows it at once instead of waiting for the next beat');
    const states = await page.evaluate(() => window.__stageStates);
    assert.ok(states.includes('studio:ai'), `control: the record saw the stage swap to the studio picture (${JSON.stringify(states)})`);
    assert.deepEqual(states.filter((state) => !state.endsWith(':ai')), [], 'and no frame of the drawn set or the bare wash is committed between the pick and its picture');
    assert.equal(await page.locator('.look-stage[data-look-layer="studio"] .look-slot__picture').count(), 1, 'as the picture');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-look-art-stage')), 'ai', 'and the page is marked as showing one');
    await context.close();
  });
});

test('a picture that finishes after the stage draws the wash and before its effect runs is still shown', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    await trackImages(context);
    const pictures = await holdRequests(context, '**/look-art/studio-stage.webp');
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(hostUrl(url), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="screen-router"]');
    // The picker starts every look's picture the moment it opens, so the studio picture is in flight, and held here.
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.locator('[data-role="setup-look"]').click();
    await pictures.asked('the studio picture');
    // The moment the stage first draws, which is the render that sees no picture yet, finish that picture by hand. A mutation
    // observer runs before React runs its effects, so the picture decodes after the render and before the effect. That relies
    // on React running a render that does not come from a discrete event with its effects in a later task. The test was shown
    // RED against the hook before its fix. If a React upgrade, or a change to how this render is scheduled, runs the effect
    // first, the test stops reaching the race, so check it against the early return again then.
    await page.evaluate(() => {
      const watch = new MutationObserver(() => {
        const stage = document.querySelector('.look-stage');
        if (!stage) return;
        watch.disconnect();
        window.__stageWhenFinished = stage.getAttribute('data-art');
        const image = window.__images.find((item) => item.src.endsWith('/look-art/studio-stage.webp'));
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1600 });
        image.onload(new Event('load'));
      });
      watch.observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole('radio', { name: /^Studio set/ }).click();
    await page.waitForFunction(() => window.__stageWhenFinished !== undefined);
    assert.equal(await page.evaluate(() => window.__stageWhenFinished), 'loading', 'control: the picture was finished while the stage was still on its wash, which is the race this test is about');
    // Setup does not show the look's stage (it wears Today's navy), so the wait is for the stage's state, not its paint.
    const shown = await page.waitForSelector('.look-stage[data-art="ai"]', { state: 'attached', timeout: 5000 }).then(() => true, () => false);
    assert.equal(shown, true, 'the picture shows although it decoded after the render that drew the wash');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-look-art-stage')), 'ai', 'and the page is marked as showing one');
    await context.close();
  });
});

test('Case file stamps FICTION or FACT while the answer word on the card stays TRUE or FALSE', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '&look=casefile');
    await exposeStore(page);
    // One false claim and one true one from the show deck.
    const cases = await page.evaluate(() => {
      const binary = window.__lo.deck.questions.filter((q) => q.kind === 'binary');
      const falseClaim = binary.find((q) => q.answer === false);
      const trueClaim = binary.find((q) => q.answer !== false);
      return [falseClaim, trueClaim].filter(Boolean).map((q) => ({ id: q.id, answer: q.answer }));
    });
    assert.equal(cases.length, 2, `the check covers a false claim and a true one (${JSON.stringify(cases)})`);
    for (const { id, answer } of cases) {
      await reveal(page, { format: 'widescreen', questionId: id, kind: 'binary' });
      const stamp = (await page.locator('.look-stamp__word').first().textContent()).trim();
      const verdict = (await page.locator('.question-result-answer').first().textContent()).trim();
      assert.equal(stamp, answer === false ? 'FICTION' : 'FACT', `${id}: the stamp`);
      assert.match(verdict, answer === false ? /^false$/i : /^true$/i, `${id}: the card keeps its answer word (${verdict})`);
    }
    await context.close();
  });
});

test('a phone that wears Case file stamps FICTION or FACT like the big screen, keeps the answer word for a reader, and keeps the stamp on the screen', { timeout: 240_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const code = roomCode();
    const host = await openRelayHost(browser, url, code);
    const { context, page: phone, deviceId } = await joinPhone(browser, url, { code, look: 'casefile', size: { width: 390, height: 844 } });
    const claims = await host.page.evaluate(() => {
      const binary = window.__lo.deck.questions.filter((q) => q.kind === 'binary');
      return [binary.find((q) => q.answer === false), binary.find((q) => q.answer !== false)].filter(Boolean);
    });
    assert.equal(claims.length, 2, 'the check covers a false claim and a true one');
    for (const q of claims) {
      await hostAsk(host.page, q);
      await phoneVoteReady(phone, q);
      await hostVotes(host.page, q, deviceId, 'wrong');
      await phone.waitForTimeout(300);
      await hostReveals(host.page, phone);
      const stamp = phone.locator('.stamp-mark').first();
      await stamp.waitFor();
      const shown = await stamp.evaluate((node) => [...node.childNodes].filter((child) => !(child.nodeType === 1 && child.classList.contains('sr-only'))).map((child) => child.textContent).join('').trim());
      assert.equal(shown, q.answer === false ? 'FICTION' : 'FACT', `${q.id}: the phone stamp`);
      assert.equal((await stamp.locator('.sr-only').textContent()).trim(), q.answer === false ? 'FALSE' : 'TRUE', `${q.id}: the answer word stays for a reader`);
      await phone.waitForTimeout(500);
      const box = await stamp.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, `${q.id}: the stamp stays on the screen (${JSON.stringify(box)})`);
    }
    await context.close();
    await host.context.close();
  });
});

test('every look keeps every verdict inside its card on every kind and canvas, and the redrawn reveal is wide stage only', { timeout: 600_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let checked = 0;
    for (const look of DRAWN) {
      for (const canvas of CANVASES) {
        const context = await newContext(browser, { width: canvas.width, height: canvas.height }, { reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        await openHost(page, url, `&look=${look}`);
        await exposeStore(page);
        const cards = (await pickCards(page)).filter(isLeanCard);
        assert.ok(cards.length >= KINDS.length, `the sweep has a card for every kind (${cards.length})`);
        for (const card of cards) {
          const kind = card.kind;
          await frameRevealed(page, canvas.format, card.question, { room: 'right' });
          const g = await geometry(page);
          const where = `${look} ${canvas.id} ${kind} ${card.why} ${card.id}`;
          assert.deepEqual(g.problems, [], `${where}: every word stays inside its card and the frame`);
          assert.deepEqual(g.clipped, [], `${where}: nothing in the card is clipped`);
          // Wherever the card is a solid, every run of words in it reads on it. Case file's paper is the one that matters most.
          for (const ink of g.inks) assert.ok(ink.ratio >= 4.5, `${where}: "${ink.text}" is ${ink.ratio.toFixed(2)} on the card, under 4.5`);
          if (look === 'casefile' && canvas.id === 'wide') assert.equal(g.solid, true, 'case file: the wide reveal card is paper, so its ink was measured');
          const art = await page.evaluate(() => Object.fromEntries(['.look-reveal-backdrop', '.look-reveal-mark', '.look-reveal-ribbon', '.look-bar'].map((sel) => [sel, [...document.querySelectorAll(sel)].some((el) => getComputedStyle(el).display !== 'none')])));
          if (canvas.id !== 'wide') assert.deepEqual(Object.values(art).filter(Boolean), [], `${where}: the redrawn reveal stays out of the ${canvas.id} canvas (${JSON.stringify(art)})`);
          checked += 1;
        }
        await context.close();
      }
    }
    assert.ok(checked >= DRAWN.length * CANVASES.length * KINDS.length, `the sweep saw every case (${checked})`);
    // Control: a sentence verdict forced far past its card must be seen overflowing, or this check is blind.
    const context = await newContext(browser, { width: 1920, height: 1080 }, { reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '&look=studio');
    await exposeStore(page);
    await reveal(page, { format: 'widescreen', questionId: 'q16', kind: 'which-patient' });
    const huge = await page.addStyleTag({ content: '.question-result-answer { font-size: 260px !important; }' });
    await settle(page, 400);
    const forced = await geometry(page);
    assert.ok(forced.problems.length + forced.clipped.length > 0, 'control: a verdict forced to 260 px is seen overflowing');
    await huge.evaluate((node) => node.remove());
    // Control: a range label pushed onto its bar must be seen as two things in one place, or the split row check is blind.
    // The widest-label estimate can also be the longest one, in which case pickCards tags it 'longest' instead.
    const estimates = (await pickCards(page)).filter((card) => card.kind === 'estimate');
    const labelWidth = (card) => Math.max(0, ...(card.question.estimate?.ranges ?? []).map((r) => String(r.label ?? '').length));
    const widest = estimates.find((card) => card.why === 'widest label') ?? [...estimates].sort((a, b) => labelWidth(b) - labelWidth(a))[0];
    assert.ok(widest, 'the bank has an estimate with a wide range label');
    await frameRevealed(page, 'widescreen', widest.question, { room: 'right' });
    const clean = await geometry(page);
    assert.deepEqual(clean.problems, [], 'the widest range label card keeps every word inside its box as built');
    await page.addStyleTag({ content: ':root:root:root:root:root:root .question-result-poll > div > span { position: relative; top: -110px; }' });
    await settle(page, 200);
    const pushed = await geometry(page);
    assert.ok(pushed.problems.some((problem) => problem.startsWith('split row')), `control: a label pushed onto its bar is seen overlapping it (${pushed.problems.join(' | ')})`);
    await context.close();
  });
});

async function posed(page, { format, questionId }) {
  await page.evaluate(({ format, questionId }) => {
    const { store, deck } = window.__lo;
    const q = deck.questions.find((item) => item.id === questionId);
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'entering', formatId: format, run: [{ id: 'title', type: 'title' }, q], slideIndex: 1, votesLocked: false });
  }, { format, questionId });
  await page.waitForFunction(() => document.querySelectorAll('[data-role="arrival-kicker"]').length === 1);
  await page.locator('.question-shell .question-stage-copy h1').first().waitFor();
  await settle(page, 600);
}

async function lobby(page, format) {
  await page.evaluate((format) => {
    const { store, deck } = window.__lo;
    const devices = {};
    ['Jordan', 'Priya', 'Sam'].forEach((name, i) => { devices[`d-${name}`] = { nickname: name, rawNickname: name, team: null, joinedAt: 1_000_000 - i * 1000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 }; });
    const q = deck.questions.find((item) => item.id === 'q33');
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, phase: 'lobby', formatId: format, run: [{ id: 'title', type: 'title' }, q], slideIndex: -1, seenDevices: devices });
  }, format);
  await page.waitForFunction(() => document.querySelectorAll('.lobby-arrivals .lobby-arrival:not(.lobby-arrival--ghost)').length === 3);
  await settle(page, 900);
}

/** The background alpha, the filter and the backdrop filter of every visible element a selector finds. */
const solidReport = (page, selector) => page.evaluate((selector) => {
  const alpha = (color) => { const n = (color.match(/-?[\d.]+/g) || []).map(Number); return color.startsWith('color(') ? (n[3] ?? 1) : (n.length > 3 ? n[3] : 1); };
  return [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length > 0).map((el) => { const cs = getComputedStyle(el); return { selector, alpha: alpha(cs.backgroundColor), filter: cs.filter, backdrop: cs.backdropFilter }; });
}, selector);

test('reduced motion holds every look still, and reduced transparency turns every plate and hold over a picture solid', { timeout: 420_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    // Reduced motion: no animation in a look's layers runs forever, on the lobby, a posed question and a reveal the room called.
    for (const look of DRAWN) {
      const context = await newContext(browser, { width: 1920, height: 1080 }, { reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, `&look=${look}&art=drawn`);
      await exposeStore(page);
      const looping = () => page.evaluate(() => document.getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity)
        .map((a) => `${a.animationName || a.id || a.constructor.name} on ${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? a.effect?.target?.tagName}`));
      await lobby(page, 'widescreen');
      assert.deepEqual(await looping(), [], `${look}: nothing loops in the lobby under reduced motion`);
      await posed(page, { format: 'widescreen', questionId: 'q5' });
      assert.deepEqual(await looping(), [], `${look}: nothing loops on a posed question under reduced motion`);
      await reveal(page, { format: 'widescreen', questionId: 'q5', kind: 'binary', room: 'right' });
      assert.deepEqual(await looping(), [], `${look}: nothing loops on a reveal the room called under reduced motion`);
      await context.close();
    }
    // Control: without reduced motion the same drawn set does loop, so the check above can see a loop.
    const live = await newContext(browser, { width: 1920, height: 1080 }, { reducedMotion: 'no-preference' });
    const livePage = await live.newPage();
    livePage.setDefaultTimeout(30_000);
    await openHost(livePage, url, '&look=studio&art=drawn');
    await exposeStore(livePage);
    await lobby(livePage, 'widescreen');
    const loops = await livePage.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity).length);
    assert.ok(loops > 0, `control: the studio set loops under full motion (${loops})`);
    await live.close();

    // Reduced transparency: over a picture, the calm hold and every plate are solid and nothing blurs.
    for (const look of DRAWN) {
      const context = await newContext(browser, { width: 1920, height: 1080 });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      await openHost(page, url, `&look=${look}`);
      await exposeStore(page);
      await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true, 'reduced transparency is on');
      const solid = (selector) => solidReport(page, selector);
      const checks = [];
      await lobby(page, 'widescreen');
      checks.push(...await solid('.look-stage__calm'), ...await solid('.preshow-lobby .lobby-copy > .lobby-count'), ...await solid('.preshow-lobby .lobby-footer'));
      await posed(page, { format: 'widescreen', questionId: 'q5' });
      checks.push(...await solid('.look-stage__calm'), ...await solid('.question-source-kicker'));
      await reveal(page, { format: 'widescreen', questionId: 'q5', kind: 'binary', room: 'right' });
      checks.push(...await solid('.show-footer .show-source-pill'));
      if (look === 'studio') checks.push(...await solid('.question-show-frame .show-join-pill'), ...await solid('.question-show-frame .status-rail'));
      assert.ok(checks.length >= 5, `${look}: the sweep found the plates and holds (${checks.length})`);
      for (const check of checks) {
        assert.equal(check.alpha, 1, `${look}: ${check.selector} is solid under reduced transparency (alpha ${check.alpha})`);
        assert.ok(check.filter === 'none' && (check.backdrop === 'none' || check.backdrop === undefined), `${look}: ${check.selector} does not blur (${check.filter}, ${check.backdrop})`);
      }
      await context.close();
    }
    // Control: without the preference the same plates and hold are see-through and the hold blurs, so the probe above can read a
    // layer that is not solid.
    const normal = await newContext(browser, { width: 1920, height: 1080 });
    const normalPage = await normal.newPage();
    normalPage.setDefaultTimeout(30_000);
    await openHost(normalPage, url, '&look=studio');
    await exposeStore(normalPage);
    await normalPage.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
    assert.equal(await normalPage.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), false, 'control: reduced transparency is off');
    await lobby(normalPage, 'widescreen');
    const open = [];
    for (const selector of ['.look-stage__calm', '.preshow-lobby .lobby-copy > .lobby-count', '.preshow-lobby .lobby-footer']) open.push(...await solidReport(normalPage, selector));
    assert.ok(open.some((check) => check.alpha < 1), `control: without reduced transparency a plate or the hold is see-through (${open.map((check) => check.alpha).join(', ')})`);
    assert.ok(open.some((check) => check.filter !== 'none'), `control: and the hold blurs (${open.map((check) => check.filter).join(' | ')})`);
    await normal.close();
  });
});

/** A reveal whose votes the test chooses, so the room can sit exactly on the 60 percent line. */
async function revealWithVotes(page, question, { right, wrong }) {
  await page.evaluate(({ question, right, wrong }) => {
    const { store, kinds } = window.__lo;
    const rightToken = kinds.rightToken(question);
    const wrongToken = kinds.kindOptions(question).map((o) => o.token).find((t) => t !== rightToken);
    const votes = { [rightToken]: right, [wrongToken]: wrong };
    const voters = {}; let n = 0;
    for (const [token, count] of Object.entries(votes)) for (let k = 0; k < count; k += 1) voters[`v-${n++}`] = { choice: token };
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'locked', formatId: 'widescreen', run: [{ id: 'title', type: 'title' }, question], slideIndex: 1, votesLocked: true, pollVotes: { [question.id]: votes }, pollVoters: { [question.id]: voters } });
    store.getState().dispatch({ type: 'REVEAL' });
  }, { question, right, wrong });
  await page.waitForFunction(() => document.querySelectorAll('.question-result-card').length === 1);
  await settle(page, 500);
}

const celebration = (page) => page.evaluate(() => ({
  // The case file's rosette, the studio's glints and the burst both studio and 70s turn gold for a room that called it.
  rosettes: document.querySelectorAll('.look-reveal-ribbon').length,
  glints: document.querySelectorAll('.look-glint').length,
  goldBurst: document.querySelectorAll('.look-reveal-backdrop[data-room-outcome="right"]').length,
  outcome: document.querySelector('.question-result')?.getAttribute('data-room-outcome') ?? null,
  celebratingMotion: document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity && /studio-frame-flash|studio-glint/.test(a.animationName ?? ''))
    .length,
}));

test('a look celebrates only when the room called it, at 60 percent of the votes cast, and shows no room signal while the vote is open', { timeout: 420_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const look of DRAWN) {
      const context = await newContext(browser, { width: 1920, height: 1080 });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, `&look=${look}&art=drawn`);
      await exposeStore(page);
      const question = await page.evaluate(() => window.__lo.deck.questions.find((item) => item.id === 'q5'));
      // Voting open: no tally, no split, no outcome, in any look (VOF-21, VOF-22).
      await page.evaluate((question) => {
        const { store } = window.__lo;
        store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'entering', formatId: 'widescreen', run: [{ id: 'title', type: 'title' }, question], slideIndex: 1, votesLocked: false });
      }, question);
      await page.waitForFunction(() => document.querySelectorAll('[data-role="arrival-kicker"]').length === 1);
      await settle(page, 500);
      const voting = await page.evaluate(() => ({
        split: document.querySelectorAll('.question-result-poll, .look-bar').length,
        outcomes: document.querySelectorAll('[data-room-outcome]').length,
        tallies: [...document.querySelectorAll('.answer-bar__pct, .answer-bar__votes')].filter((el) => el.getClientRects().length > 0 && el.textContent.trim()).length,
        celebration: document.querySelectorAll('.look-reveal-ribbon, .look-glint, .look-reveal-backdrop').length,
      }));
      assert.deepEqual(voting, { split: 0, outcomes: 0, tallies: 0, celebration: 0 }, `${look}: the open vote carries no room signal and no celebration (${JSON.stringify(voting)})`);
      // The room's own rule (room-flavor.ts): right at 60 percent of the votes cast, wrong below half, and silent between.
      const cases = [
        { right: 59, wrong: 41, outcome: null },
        { right: 60, wrong: 40, outcome: 'right' },
        { right: 50, wrong: 50, outcome: null },
        { right: 3, wrong: 9, outcome: 'wrong' },
        { right: 9, wrong: 3, outcome: 'right' },
      ];
      for (const { right, wrong, outcome } of cases) {
        const celebrates = outcome === 'right';
        await revealWithVotes(page, question, { right, wrong });
        const seen = await celebration(page);
        const where = `${look} with ${right} right and ${wrong} wrong votes`;
        assert.equal(seen.outcome, outcome, `${where}: the room reads ${outcome ?? 'as neither'}`);
        if (look === 'casefile') assert.equal(seen.rosettes, celebrates ? 1 : 0, `${where}: the rosette hangs only for a room that called it`);
        if (look === 'studio') {
          assert.equal(seen.glints > 0, celebrates, `${where}: the glints shine only for a room that called it`);
          assert.equal(seen.celebratingMotion > 0, celebrates, `${where}: the board flashes only for a room that called it`);
        }
        if (look === 'studio' || look === 'seventies') assert.equal(seen.goldBurst, celebrates ? 1 : 0, `${where}: the gold burst turns only for a room that called it`);
      }
      await context.close();
    }
  });
});

// The lobby's roster of names (VOF-97): a joined player's name is never hidden, at any count up to the room's cap. The first
// build of the looks gave the names two rows of bigger plates and the portrait stage one, and every name past those rows
// waited out of sight behind the count, on Today's one row from the fifth phone. The owner picked option B: the wordmark
// makes room first, so the names keep today's size through a dozen phones, then the plates step down, then plain names, and
// the walk-in band gives way last. So the test seats real rooms, up to the most phones a room seats, and reads every name.
const ROSTER = ['Jordan', 'Priya', 'Sam', 'Morgan', 'Alex', 'Taylor', 'Riley', 'Casey', 'Jamie', 'Avery', 'Quinn', 'Rowan'];
const ROOM_MAX = 250;
// A full room's names: everyday first names, initials once they repeat, and a few as long as the phone takes (24 characters).
const LONG_NAMES = ['Alexandria Montgomery', 'The Pharmacist Formerly', 'Christopher J. Okafor', 'Maximilian Featherstone'];
function rosterNames(count) {
  if (count <= ROSTER.length) return ROSTER.slice(0, count);
  return Array.from({ length: count }, (_, i) => {
    if (i % 61 === 7) return LONG_NAMES[Math.floor(i / 61) % LONG_NAMES.length];
    const base = ROSTER[i % ROSTER.length];
    const round = Math.floor(i / ROSTER.length);
    return round === 0 ? base : `${base} ${'ABCDEFGHJKLMNPRSTW'[round % 18]}.`;
  });
}

async function seatRoster(page, format, count) {
  await page.evaluate(({ format, names }) => {
    const { store, deck } = window.__lo;
    const devices = {};
    names.forEach((name, i) => { devices[`d-${String(i).padStart(3, '0')}`] = { nickname: name, rawNickname: name, team: null, joinedAt: 1_000_000 - i * 1000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 }; });
    const q = deck.questions.find((item) => item.id === 'q33');
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, phase: 'lobby', formatId: format, run: [{ id: 'title', type: 'title' }, q], slideIndex: -1, seenDevices: devices });
  }, { format, names: rosterNames(count) });
  await page.waitForFunction((count) => document.querySelectorAll('.lobby-arrivals .lobby-arrival:not(.lobby-arrival--ghost)').length === count, count);
  await settle(page, 900);
}

/** The names on the screen, what they sit against, and the clear space under the lowest of them. */
const rosterReport = (page) => page.evaluate(() => {
  const box = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
  const meets = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  const roster = document.querySelector('.lobby-arrivals');
  const frame = box(roster);
  // A chip below the roster's own box is clipped by it, so it is not on the screen.
  const shown = [...roster.querySelectorAll('.lobby-arrival')].filter((chip) => {
    const b = box(chip);
    return b.bottom <= frame.bottom + 1 && b.top >= frame.top - 1;
  });
  // The count, the hype line and the lyric band wear plates painted as spread shadows, so their edge is their box and the
  // spread, scaled the way the stage is scaled.
  const edge = (el) => {
    const b = box(el);
    const scale = el.offsetHeight ? (b.bottom - b.top) / el.offsetHeight : 1;
    const spread = Number((getComputedStyle(el).boxShadow.match(/(\d+(?:\.\d+)?)px\s*$/) ?? [])[1]) || 0;
    return { top: b.top - spread * scale, bottom: b.bottom + spread * scale, left: b.left - spread * scale, right: b.right + spread * scale };
  };
  const plated = ['.lobby-count', '.lobby-hype', '.lobby-footer'];
  const parts = ['.lobby-join', '.lobby-title', ...plated].map((selector) => [selector, document.querySelector(selector)]).filter(([, el]) => el);
  const over = (rect) => parts.filter(([selector, el]) => meets(rect, plated.includes(selector) ? edge(el) : box(el))).map(([selector]) => selector);
  const lowest = Math.max(...shown.map((chip) => box(chip).bottom));
  const wide = document.querySelector('.preshow-lobby')?.getAttribute('data-format') === 'widescreen';
  const under = wide ? edge(document.querySelector('.lobby-footer')).top : box(document.querySelector('.lobby-join')).top;
  return {
    names: shown.map((chip) => chip.querySelector('.lobby-arrival__name')?.textContent.trim() ?? ''),
    chipsOver: shown.flatMap((chip) => over(box(chip)).map((selector) => `${chip.textContent.trim()} over ${selector}`)),
    boxOver: parts.filter(([, el]) => meets(frame, box(el))).map(([selector]) => selector),
    clear: Math.round(under - lowest),
  };
});

/** Every joined name, and why any of them cannot be read: drawn nowhere, clipped, off the screen, cut short or covered. */
const rosterReadable = (page) => page.evaluate(() => {
  const joined = Object.keys(window.__lo.store.getState().seenDevices).length;
  const chips = [...document.querySelectorAll('.lobby-arrivals .lobby-arrival:not(.lobby-arrival--ghost)')];
  const hidden = [];
  for (const chip of chips) {
    const name = chip.querySelector('.lobby-arrival__name');
    const r = name.getBoundingClientRect();
    const why = [];
    if (r.width < 1 || r.height < 1) why.push('no box');
    for (let a = chip.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = a.getBoundingClientRect();
      if (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1) { why.push(`clipped by ${String(a.className).slice(0, 30)}`); break; }
    }
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) why.push('off the screen');
    if (name.scrollWidth > name.clientWidth + 1) why.push('cut short');
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (hit && !chip.contains(hit)) why.push(`covered by ${String(hit.className?.baseVal ?? hit.className).slice(0, 30)}`);
    if (why.length) hidden.push(`${name.textContent}: ${why.join(', ')}`);
  }
  const sizes = chips.map((chip) => parseFloat(getComputedStyle(chip.querySelector('.lobby-arrival__name')).fontSize));
  return { joined, drawn: chips.length, readable: chips.length - hidden.length, hidden: hidden.slice(0, 6), smallest: sizes.length ? Math.min(...sizes) : null };
});

/** Everything wrong with one report: a name not on the screen, a name over another part of the lobby, a roster box on the join card or the lyric band, or no room to breathe. */
const rosterProblems = (report, count) => {
  const problems = [];
  if (report.names.length < count) problems.push(`it shows ${report.names.length} of ${count} names`);
  problems.push(...report.chipsOver, ...report.boxOver.map((selector) => `its box runs over ${selector}`));
  if (report.clear < 12) problems.push(`only ${report.clear}px is clear under the lowest name`);
  return problems;
};

async function openLobby(browser, url, look, art, canvas, { motion = false } = {}) {
  const context = await newContext(browser, { width: canvas.width, height: canvas.height }, { reducedMotion: motion ? 'no-preference' : 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await openHost(page, url, `&look=${look}${art === 'drawn' ? '&art=drawn' : ''}`);
  if (art === 'picture') await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
  await exposeStore(page);
  return { context, page };
}

// Today's name size on each canvas, which option B keeps through a dozen phones on the wide and square stages.
const TODAY_NAME_PX = { widescreen: 28, square: 26 };

test('every joined name shows in the lobby at 5, 8, 12 and the room maximum of 250, in every look over its picture and its drawn set, on every canvas, clear of the join card and the lyric band', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let looked = 0;
    for (const look of ['today', ...DRAWN]) {
      for (const art of look === 'today' ? ['drawn'] : ['picture', 'drawn']) {
        for (const canvas of CANVASES) {
          const { context, page } = await openLobby(browser, url, look, art, canvas);
          for (const count of [5, 8, 12, ROOM_MAX]) {
            await seatRoster(page, canvas.format, count);
            const where = `${look} over its ${art} on the ${canvas.id} canvas with ${count} phones in`;
            const names = await rosterReadable(page);
            assert.equal(names.drawn, count, `${where}: every joined name is drawn (${names.drawn})`);
            assert.equal(names.readable, count, `${where}: every name is drawn whole, uncovered and on the screen (${names.hidden.join(' | ')})`);
            const report = await rosterReport(page);
            assert.deepEqual(rosterProblems(report, count), [], `${where} (${JSON.stringify({ ...report, names: report.names.length })})`);
            // Option B: today's name size holds through a dozen phones on the wide and square stages.
            if (count <= 12 && TODAY_NAME_PX[canvas.format]) assert.ok(names.smallest >= TODAY_NAME_PX[canvas.format] - 0.01, `${where}: the names keep at least today's ${TODAY_NAME_PX[canvas.format]} px (${names.smallest})`);
            looked += 1;
          }
          await context.close();
        }
      }
    }
    assert.equal(looked, (1 + DRAWN.length * 2) * CANVASES.length * 4, 'every look, art mode, canvas and room size was measured');
  });
});

/** Phones join one at a time, `burst` names a join, a beat apart, so each new name's landing spring and the slide of the names
 * it pushes along are still running when the next one lands. Resolves once every name is drawn and the room has settled. */
async function joinOneByOne(page, format, count, { burst = 1, gapMs = 140 } = {}) {
  await page.evaluate(async ({ format, names, burst, gapMs }) => {
    const { store, deck } = window.__lo;
    const q = deck.questions.find((item) => item.id === 'q33');
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, phase: 'lobby', formatId: format, run: [{ id: 'title', type: 'title' }, q], slideIndex: -1, seenDevices: {} });
    // The same devices seatRoster seats, joining oldest first, so each join is the newest name and the room ends in the same
    // order a room seated at once shows.
    for (let left = names.length; left > 0; left -= burst) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
      const devices = { ...store.getState().seenDevices };
      for (let n = left - 1; n >= Math.max(0, left - burst); n -= 1) {
        devices[`d-${String(n).padStart(3, '0')}`] = { nickname: names[n], rawNickname: names[n], team: null, joinedAt: 1_000_000 - n * 1000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 };
      }
      store.setState({ seenDevices: devices });
    }
  }, { format, names: rosterNames(count), burst, gapMs });
  await page.waitForFunction((count) => document.querySelectorAll('.lobby-arrivals .lobby-arrival:not(.lobby-arrival--ghost)').length === count, count);
  await settle(page, 1600);
}

const rosterFit = (page) => page.evaluate(() => ({ plate: document.querySelector('.lobby-arrivals')?.dataset.plate, room: document.querySelector('.preshow-lobby')?.dataset.rosterRoom }));

// Names landing on a real lobby move: the new name's spring starts at 0.55 of its size, and the names it pushes along slide
// from where they were. A fit that measured through those transforms read more or less room than the names take, and it
// remembers where it landed for the next name, so it could hide names or shrink them for good. Fill rooms one phone at a
// time in full motion, the way a room fills, and each must land where the same room seated at once lands.
test('a room that fills one phone at a time while the names land and slide fits where the same room seated at once fits', { timeout: 420_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const cases = [
      { look: 'studio', art: 'drawn', canvas: 'wide', count: 12, burst: 1 },
      { look: 'casefile', art: 'picture', canvas: 'portrait', count: 13, burst: 1 },
      { look: 'today', art: 'drawn', canvas: 'square', count: 30, burst: 2 },
      { look: 'today', art: 'drawn', canvas: 'wide', count: ROOM_MAX, burst: 25 },
    ];
    for (const { look, art, canvas: id, count, burst } of cases) {
      const canvas = CANVASES.find((c) => c.id === id);
      const where = `${look} over its ${art} on the ${id} canvas, ${count} phones`;
      const cold = await openLobby(browser, url, look, art, canvas);
      await seatRoster(cold.page, canvas.format, count);
      const expected = await rosterFit(cold.page);
      await cold.context.close();
      const live = await openLobby(browser, url, look, art, canvas, { motion: true });
      await joinOneByOne(live.page, canvas.format, count, { burst });
      const names = await rosterReadable(live.page);
      assert.equal(names.readable, count, `${where}, joined one at a time in full motion: every name is drawn whole, uncovered and on the screen (${names.hidden.join(' | ')})`);
      assert.deepEqual(await rosterFit(live.page), expected, `${where}, joined one at a time in full motion: the fit lands where the room seated at once lands`);
      await live.context.close();
    }
  });
});

// The phone takes 24 characters, but the relay takes 40, and a name the plate's ellipsis cuts short is a hidden name. Seat a
// room with one name as long as the relay takes, and the fit must step down until it shows whole. A roster held narrow makes
// the long name too wide for today's plate on every canvas, so the fit has to see the cut to step down.
test('a name as long as the relay takes shows whole, on every canvas', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const longest = 'Maximilian Alexander Featherstone-Okafor';
    assert.equal(longest.length, 40, 'the name is as long as the relay takes');
    for (const [look, narrow] of [['today', false], ['studio', false], ['today', true]]) {
      for (const canvas of CANVASES) {
        const { context, page } = await openLobby(browser, url, look, 'drawn', canvas);
        if (narrow) await page.addStyleTag({ content: ':root:root:root:root:root:root:root:root:root:root .lobby-arrivals { max-width: 360px !important; }' });
        await seatRoster(page, canvas.format, 12);
        await page.evaluate((longest) => {
          const { store } = window.__lo;
          const devices = { ...store.getState().seenDevices, 'd-long': { nickname: longest, rawNickname: longest, team: null, joinedAt: 2_000_000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 } };
          store.setState({ seenDevices: devices });
        }, longest);
        await page.waitForFunction(() => document.querySelectorAll('.lobby-arrivals .lobby-arrival:not(.lobby-arrival--ghost)').length === 13);
        await settle(page, 600);
        const names = await rosterReadable(page);
        assert.equal(names.readable, 13, `${look}${narrow ? ' with the roster held to 360 px' : ''} on the ${canvas.id} canvas: every name is drawn whole, the 40 character one too (${names.hidden.join(' | ')})`);
        await context.close();
      }
    }
  });
});

// The host's look can land while the lobby shows: a look's stylesheet that arrives after the page opened on Today, or a new
// pick. The names then take another look's plates, so the fit must start over, and land where the new look seated at once
// lands.
test('the roster fits again when the look changes under a full lobby', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const canvas of CANVASES.filter((c) => c.id !== 'portrait')) {
      const cold = await openLobby(browser, url, 'studio', 'drawn', canvas);
      await seatRoster(cold.page, canvas.format, 12);
      const expected = await rosterFit(cold.page);
      await cold.context.close();
      const { context, page } = await openLobby(browser, url, 'today', 'drawn', canvas);
      await seatRoster(page, canvas.format, 12);
      const before = await rosterFit(page);
      await page.evaluate(async () => {
        const urls = performance.getEntriesByType('resource').map((e) => e.name);
        const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
        (await import(u('/src/looks/host-look.ts'))).hostLookStore.getState().pick('studio');
      });
      await page.waitForFunction(() => document.documentElement.getAttribute('data-look') === 'studio');
      await settle(page, 900);
      const names = await rosterReadable(page);
      assert.notDeepEqual(before, expected, `on the ${canvas.id} canvas Today and the Studio set fit twelve phones differently, so the switch is a real test`);
      assert.equal(names.readable, 12, `on the ${canvas.id} canvas, after the switch to the Studio set: every name is drawn whole (${names.hidden.join(' | ')})`);
      assert.deepEqual(await rosterFit(page), expected, `on the ${canvas.id} canvas, after the switch: the fit lands where the Studio set seated at once lands`);
      await context.close();
    }
  });
});

test('the roster checks see a hidden name, a roster pushed onto the lyric band, and a fit misled by the reduced motion transitions', { timeout: 420_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    // The doubled :root raises a planted rule past the lobby's own.
    const STRONGER = ':root:root:root:root:root:root:root:root:root:root';
    const wide = CANVASES.find((canvas) => canvas.id === 'wide');

    // Names held at a size the column cannot hold, whatever the fit asks for: the names past the column must be seen hidden.
    let lobbyPage = await openLobby(browser, url, 'today', 'drawn', wide);
    await seatRoster(lobbyPage.page, 'widescreen', ROOM_MAX);
    assert.equal((await rosterReadable(lobbyPage.page)).readable, ROOM_MAX, 'as built, every name of a full room can be read');
    await lobbyPage.page.addStyleTag({ content: `${STRONGER} .lobby-arrival { height: 56px !important; font-size: 28px !important; padding: 0 24px 0 8px !important; }` });
    await settle(lobbyPage.page, 300);
    const crowded = await rosterReadable(lobbyPage.page);
    assert.ok(crowded.readable < ROOM_MAX, `names held too big for the column are seen hidden (${crowded.readable} of ${ROOM_MAX} readable)`);
    await lobbyPage.context.close();

    // The wide roster pushed down onto the lyric band's plate.
    lobbyPage = await openLobby(browser, url, 'studio', 'picture', wide);
    await seatRoster(lobbyPage.page, 'widescreen', 12);
    assert.deepEqual(rosterProblems(await rosterReport(lobbyPage.page), 12), [], 'as built, the wide roster is clear of the lyric band');
    await lobbyPage.page.addStyleTag({ content: `${STRONGER} .preshow-lobby[data-format="widescreen"] .lobby-arrivals { position: relative !important; top: 160px !important; }` });
    await settle(lobbyPage.page, 300);
    const onBand = rosterProblems(await rosterReport(lobbyPage.page), 12);
    assert.ok(onBand.length > 0, `a roster pushed onto the lyric band's plate on the wide stage is seen (${onBand.join(' | ')})`);
    await lobbyPage.context.close();

    // Reduced motion runs every transition for 0.01 ms, and a fit that measured through them read every size it set as the
    // size it started from: it shrank names it had room for, or left names hidden. Twelve phones in the Studio set need the
    // first smaller plate, so the walk has to read the sizes it sets to stop there. Turn the transitions back on while it
    // measures, and those twelve must be seen going wrong one way or the other.
    lobbyPage = await openLobby(browser, url, 'studio', 'drawn', wide);
    await seatRoster(lobbyPage.page, 'widescreen', 12);
    const fair = await rosterReadable(lobbyPage.page);
    assert.ok(fair.readable === 12 && fair.smallest >= TODAY_NAME_PX.widescreen, `as built, twelve phones in the Studio set read at today's size (${JSON.stringify(fair)})`);
    await lobbyPage.page.addStyleTag({ content: `${STRONGER} .preshow-lobby[data-roster-measuring], ${STRONGER} .preshow-lobby[data-roster-measuring] * { transition-property: all !important; transition-duration: 0.01ms !important; }` });
    await seatRoster(lobbyPage.page, 'widescreen', 4);
    await seatRoster(lobbyPage.page, 'widescreen', 12);
    const misled = await rosterReadable(lobbyPage.page);
    assert.ok(misled.readable < 12 || misled.smallest < TODAY_NAME_PX.widescreen, `a fit that measures through the transitions is seen going wrong (${JSON.stringify(misled)})`);
    await lobbyPage.context.close();
  });
});

/* ---- The phone stamp's turn in the drawn looks ----------------------------------------------------------------------- */

// The turn a drawn look means to give a stamp word of `len` characters: the steeper of its formula and its floor. Studio set
// and 70s game show slap a short word on at 6 degrees and lay a long one at 1.5, Case file at 8 and 2 (looks.css, casefile.css).
const stampTiltFor = (look, len) => (look === 'casefile' ? Math.min(-2, -8 + (len - 4) * 0.7) : Math.min(-1.5, -6 + (len - 4) * 0.45));
const STAMP_FLOOR = { studio: -1.5, casefile: -2, seventies: -1.5 };

/** The stamp on a phone's reveal: its word, its turn, and how deep the turned stamp reaches into any other line of words. */
const stampGeometry = (phone) => phone.evaluate(() => {
  const stamp = document.querySelector('.stamp-mark');
  const word = [...stamp.childNodes].filter((c) => !(c.nodeType === 1 && c.classList.contains('sr-only'))).map((c) => c.textContent).join('').trim();
  const m = new DOMMatrixReadOnly(getComputedStyle(stamp).transform);
  const t = Math.atan2(m.b, m.a);
  const box = stamp.getBoundingClientRect();
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const w = stamp.offsetWidth;
  const h = stamp.offsetHeight;
  const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([x, y]) => [cx + x * Math.cos(t) - y * Math.sin(t), cy + x * Math.sin(t) + y * Math.cos(t)]);
  const edges = corners.map((p, i) => [p, corners[(i + 1) % 4]]);
  // The turned stamp's top and bottom at one x, from where its four edges cross that x.
  const spanAt = (x) => {
    const ys = [];
    for (const [[x0, y0], [x1, y1]] of edges) {
      if (x0 === x1 || x < Math.min(x0, x1) || x > Math.max(x0, x1)) continue;
      ys.push(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
    }
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  };
  const lines = [];
  const walk = document.createTreeWalker(document.querySelector('[data-role="phone-reveal"]'), NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || stamp.contains(el) || el.closest('.sr-only, .phone-reveal-meta')) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 1) lines.push({ r, size, text: node.textContent.trim().slice(0, 24) });
  }
  const xs = corners.map(([x]) => x);
  let deepest = { em: 0, text: null };
  for (const line of lines) {
    const from = Math.max(line.r.left, Math.min(...xs));
    const to = Math.min(line.r.right, Math.max(...xs));
    for (let k = 0; to > from && k <= 40; k += 1) {
      const span = spanAt(from + ((to - from) * k) / 40);
      if (!span) continue;
      const depth = Math.min(span[1], line.r.bottom) - Math.max(span[0], line.r.top);
      if (depth / line.size > deepest.em) deepest = { em: Math.round((depth / line.size) * 100) / 100, text: line.text };
    }
  }
  return { word, deg: Math.round(((t * 180) / Math.PI) * 100) / 100, deepest, lines: lines.length, onScreen: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight };
});

test('a drawn look slaps a short stamp on steep and lays a long one at its floor, on both phones, and the stamp never covers a word', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const seen = [];
    for (const look of DRAWN) {
      for (const size of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
        const code = roomCode();
        const host = await openRelayHost(browser, url, code);
        const { context, page: phone, deviceId } = await joinPhone(browser, url, { code, look, size, reducedMotion: true });
        const questions = await host.page.evaluate(() => {
          const { deck, kinds, population } = window.__lo;
          const binary = deck.questions.filter((q) => q.kind === 'binary');
          const estimates = population.cardsForKindByLengthDesc('estimate').map((card) => card.question);
          const longest = [...estimates].sort((a, b) => kinds.estimateTruthLabel(b).length - kinds.estimateTruthLabel(a).length)[0];
          // No number in the bank is long enough to reach the floor, so one is planted. Its formula alone turns it past flat,
          // the wrong way, which is what max() did to every long word.
          const planted = { ...longest, id: 'stamp-floor', estimate: { ...longest.estimate, unit: 'percent of all adults' } };
          return [binary.find((q) => q.answer !== false), binary.find((q) => q.answer === false), longest, planted];
        });
        for (const q of questions) {
          await hostAsk(host.page, q);
          await phoneVoteReady(phone, q);
          await hostVotes(host.page, q, deviceId, 'right');
          await phone.waitForTimeout(300);
          await hostReveals(host.page, phone);
          await phone.locator('.stamp-mark').first().waitFor();
          await phone.waitForFunction(() => document.querySelector('.stamp-mark').getAnimations().every((a) => a.playState !== 'running'));
          const g = await stampGeometry(phone);
          const where = `${look} ${size.width}x${size.height} "${g.word}"`;
          const want = stampTiltFor(look, g.word.length);
          assert.ok(Math.abs(g.deg - want) < 0.1, `${where}: the stamp turns ${g.deg} degrees, not the ${want.toFixed(2)} its look gives a ${g.word.length} character word`);
          assert.ok(g.onScreen, `${where}: the stamp stays on the screen`);
          assert.ok(g.lines > 0, `${where}: the reveal has words to keep clear of`);
          // A quarter of a line reaches the space under a line's letters and no further.
          assert.ok(g.deepest.em <= 0.25, `${where}: the stamp reaches ${g.deepest.em} of a line into "${g.deepest.text}"`);
          seen.push({ look, word: g.word, floor: Math.abs(want - STAMP_FLOOR[look]) < 0.01 });
        }
        await context.close();
        await host.context.close();
      }
    }
    assert.equal(seen.length, DRAWN.length * 2 * 4, `every look, phone and word was stamped (${seen.length})`);
    for (const look of DRAWN) {
      assert.ok(seen.some((s) => s.look === look && !s.floor), `${look}: a short word is seen turned steeper than the floor`);
      assert.ok(seen.some((s) => s.look === look && s.floor), `${look}: a long word is seen lying at the floor`);
    }
  });
});

/* ---- The estimate range colours ---------------------------------------------------------------------------------------- */

const RANGE_TOKENS = ['--color-vax', '--color-fiction', '--color-accent-cobalt', '--color-accent-purple', '--color-accent-pink', '--color-accent-green'];
// Gold is the cards' fallback paint and sits only about 13 degrees of hue from orange, so it is a candidate too: a card
// that falls back to gold reads as gold, not as the orange card it is closest to.
const RANGE_DECOYS = ['--color-gold'];
const RANGE_HUE_TOLERANCE = 25;

/** Each estimate card's --range-accent, the token each should carry, and the accent the card's own pixels sit nearest. */
async function renderedRangeColours(page) {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ shot, tokens, decoys }) => {
    const bars = [...document.querySelectorAll('.estimate-answer-rail .answer-bar')];
    const accents = bars.map((bar) => getComputedStyle(bar).getPropertyValue('--range-accent').trim().toLowerCase());
    const expected = tokens.map((token) => getComputedStyle(bars[0]).getPropertyValue(token).trim().toLowerCase());
    const candidates = [...expected, ...decoys.map((token) => getComputedStyle(bars[0]).getPropertyValue(token).trim().toLowerCase())];
    const rgbOf = (value) => {
      const probe = document.createElement('i');
      probe.style.color = value;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return (colour.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    };
    const hueOf = ([r, g, b]) => {
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (!d) return 0;
      const h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
      return h < 0 ? h + 360 : h;
    };
    const tokenHues = candidates.map((value) => hueOf(rgbOf(value)));
    const img = new Image();
    img.src = `data:image/png;base64,${shot}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    // The card's most vivid pixels, its accent wherever the look paints it: the fill, the lit edge, the tile or the tag.
    const nearest = bars.map((bar) => {
      const r = bar.getBoundingClientRect();
      const data = ctx.getImageData(Math.round((r.left + 8) * k), Math.round((r.top + 6) * k), Math.round((r.width - 16) * k), Math.round((r.height - 12) * k)).data;
      const vivid = [];
      for (let i = 0; i < data.length; i += 8) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const sat = max ? (max - Math.min(data[i], data[i + 1], data[i + 2])) / max : 0;
        if (sat >= 0.3 && max >= 60) vivid.push([data[i], data[i + 1], data[i + 2], sat * max]);
      }
      if (!vivid.length) return { index: -1, hue: null };
      vivid.sort((a, b) => b[3] - a[3]);
      const top = vivid.slice(0, Math.max(20, Math.round(vivid.length * 0.15)));
      const hue = hueOf([0, 1, 2].map((c) => top.reduce((sum, p) => sum + p[c], 0) / top.length));
      const away = tokenHues.map((t) => Math.min(Math.abs(t - hue), 360 - Math.abs(t - hue)));
      return { index: away.indexOf(Math.min(...away)), hue: Math.round(hue), off: Math.round(Math.min(...away)) };
    });
    return { accents, expected, nearest };
  }, { shot, tokens: RANGE_TOKENS, decoys: RANGE_DECOYS });
}

test('every look paints the estimate ranges from the one list, teal, orange, cobalt, purple and pink, in the order the room reads them', { timeout: 420_000 }, async (t) => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let read = 0;
    for (const look of ['today', ...DRAWN]) {
      const context = await newContext(browser, { width: 1920, height: 1080 }, { reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, `&look=${look}`);
      await exposeStore(page);
      // One card for every range count the bank has.
      const questions = await page.evaluate(() => {
        const byCount = new Map();
        for (const card of window.__lo.population.cardsForKindByLengthDesc('estimate')) {
          const n = (card.question.estimate?.ranges ?? []).length;
          if (!byCount.has(n)) byCount.set(n, card.question);
        }
        return [...byCount.values()];
      });
      assert.ok(questions.length >= 2, `the bank has estimates with more than one range count (${questions.length})`);
      for (const question of questions) {
        await framePosed(page, 'widescreen', question);
        const r = await renderedRangeColours(page);
        const n = question.estimate.ranges.length;
        const where = `${look} ${question.id} (${n} ranges)`;
        assert.equal(r.accents.length, n, `${where}: a card for every range`);
        assert.deepEqual(r.accents, r.expected.slice(0, n), `${where}: each card carries its own token, in the authored order`);
        assert.deepEqual(r.nearest.map((card) => card.index), [...Array(n).keys()], `${where}: each card's pixels sit nearest its own accent (${JSON.stringify(r.nearest)})`);
        t.diagnostic(`${where}: hues ${r.nearest.map((card) => `${card.hue} (${card.off} off)`).join(', ')}`);
        // Nearest is not enough on its own: a hue far from every accent still has a nearest one. Each card stays close to its own.
        assert.ok(r.nearest.every((card) => card.off <= RANGE_HUE_TOLERANCE), `${where}: each card's hue is within ${RANGE_HUE_TOLERANCE} degrees of its accent (${JSON.stringify(r.nearest)})`);
        read += 1;
      }
      await context.close();
    }
    assert.ok(read >= 8, `every look was read at every range count (${read})`);
  });
});

/* ---- VOF-96 (F2): the square true or false sizes --------------------------------------------------------------------------- */

const STEM_LADDER = {
  widescreen: { L: 72, M: 56, S: 44, XS: 36 },
  square: { L: 56, M: 44, S: 36, XS: 30 },
  portrait: { L: 36, M: 30, S: 30, XS: 30 },
};
// VOF-96: a square true or false stem is 72 at its largest step and 56 below it, and the square ladder after that.
const SQUARE_BINARY_LADDER = { L: 72, M: 56, S: 36, XS: 30 };
const CARD_PAD = { widescreen: 16, square: 16, portrait: 8 };
const COMPACT_PAD = { widescreen: 8, square: 8, portrait: 4 };
const FIT_CODES = ['stage-over-budget', 'zone-contain', 'grow-to-fit-boundary', 'card-text-safe'];

test('VOF-96 (F2): a square true or false question takes a 72 stem and 48 px card padding in every look, and nothing else moves', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let checked = 0;
    let squareBinaryAt72 = 0;
    for (const look of ['today', ...DRAWN]) {
      for (const canvas of CANVASES) {
        const context = await newContext(browser, { width: canvas.width, height: canvas.height }, { reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        await openHost(page, url, `&look=${look}`);
        await exposeStore(page);
        await page.evaluate(async () => {
          const urls = performance.getEntriesByType('resource').map((e) => e.name);
          const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
          window.__stageChecks = await import(u('/src/screens/questions/stage-layout-checks.ts'));
          window.__stageDims = (await import(u('/src/engine/scaler.ts'))).FORMAT_DIMENSIONS;
        });
        // A short true or false question, the longest one in the bank, and a number question for a square kind that keeps its sizes.
        const questions = await page.evaluate(() => {
          const { deck, population } = window.__lo;
          return [deck.questions.find((q) => q.id === 'q5'), population.cardsForKindByLengthDesc('binary')[0].question, deck.questions.find((q) => q.id === 'q33')];
        });
        for (const question of questions) {
          for (const beat of ['posed', 'locked']) {
            if (beat === 'posed') await framePosed(page, canvas.format, question);
            else await frameLocked(page, canvas.format, question);
            const m = await page.evaluate(({ format, beat }) => {
              const root = document.querySelector('[data-screen="question"][data-kind]');
              const kind = root.getAttribute('data-kind');
              const bars = [...root.querySelectorAll('.answer-bar')];
              const dims = window.__stageDims[format];
              const outcome = window.__stageChecks.computeStageChecks({ root: document, format, beat: beat === 'posed' ? 'entering' : 'locked', kind, canvasWidth: dims.width, canvasHeight: dims.height, tolerancePx: 1 });
              return {
                kind,
                step: root.getAttribute('data-stem-step'),
                density: root.getAttribute('data-density'),
                stem: parseFloat(getComputedStyle(root.querySelector('.question-stage-copy h1')).fontSize),
                pads: bars.flatMap((bar) => [parseFloat(getComputedStyle(bar).paddingTop), parseFloat(getComputedStyle(bar).paddingBottom)]),
                issues: outcome.issues.map((issue) => `${issue.code} ${JSON.stringify(issue.detail).slice(0, 120)}`),
                grewChecked: outcome.coverageByCheck['grow-to-fit-boundary'] ?? 0,
              };
            }, { format: canvas.format, beat });
            const where = `${look} ${canvas.id} ${question.id} ${m.kind} ${beat}`;
            const squareBinary = canvas.format === 'square' && m.kind === 'binary';
            const ladder = squareBinary ? SQUARE_BINARY_LADDER : STEM_LADDER[canvas.format];
            const pad = m.density === 'compact' ? COMPACT_PAD[canvas.format] : squareBinary ? 48 : CARD_PAD[canvas.format];
            assert.equal(m.stem, ladder[m.step], `${where}: the stem paints its step ${m.step} at ${ladder[m.step]} px`);
            assert.ok(m.pads.length >= 4 && m.pads.every((value) => value === pad), `${where}: every card takes ${pad} px of block padding (${m.pads.join(', ')})`);
            if (squareBinary && question.id === 'q5') assert.equal(m.stem, 72, `${where}: a short square true or false stem is 72`);
            if (squareBinary && m.stem === 72) squareBinaryAt72 += 1;
            assert.ok(m.grewChecked > 0, `${where}: the grow-to-fit check ran`);
            // The bigger stem and the taller cards are only on the square true or false stage, so that is where they must
            // still fit. The other frames hold their sizes above, and their own layout findings belong to their own checks.
            if (squareBinary) assert.deepEqual(m.issues.filter((issue) => FIT_CODES.some((code) => issue.startsWith(`${code} `))), [], `${where}: the stem and its cards still fit the stage`);
            checked += 1;
          }
        }
        await context.close();
      }
    }
    assert.equal(checked, 4 * CANVASES.length * 3 * 2, `every look, canvas, question and beat was measured (${checked})`);
    assert.ok(squareBinaryAt72 >= 4 * 2, `the short square true or false question was seen at 72 in every look at both beats (${squareBinaryAt72})`);
  });
});

/* ---- VOF-98: the ask of a five-range estimate on the wide stage ------------------------------------------------------------ */

// Three rows of ranges left q33's stem one small line at 36 px under its 52 px ranges, so the ask was not the biggest words
// on the screen (VOF-02, VOF-57). The design uses tighter cards: the stem at 56 on two lines over the 52 px ranges.
const ASK_CODES = ['stage-over-budget', 'zone-contain', 'card-text-safe', 'grow-to-fit-boundary', 'last-line-widow'];
// The long five-range ask (q14, 110 characters). Case file's case sheet narrows the line, so at 56 it takes three lines
// there and does not fit: it keeps 44, under its 52 px ranges. In the other looks it holds 56 on two lines.
const LONG_ASKS = new Set(['q14']);

test('VOF-98: every five-range estimate keeps its ask at 56 over 52 px ranges on tighter cards in every look, the biggest words on its screen, and q33 keeps "65 or older" on one line', { timeout: 600_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let checked = 0;
    let q33Seen = 0;
    for (const look of ['today', ...DRAWN]) {
      const context = await newContext(browser, { width: 1920, height: 1080 }, { reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await openHost(page, url, `&look=${look}`);
      await exposeStore(page);
      await page.evaluate(async () => {
        const urls = performance.getEntriesByType('resource').map((e) => e.name);
        const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
        window.__stageChecks = await import(u('/src/screens/questions/stage-layout-checks.ts'));
        window.__stageDims = (await import(u('/src/engine/scaler.ts'))).FORMAT_DIMENSIONS;
      });
      // Every estimate with five or more ranges in the shipped decks, and one with four (a test fixture) for a card that keeps its rows.
      const questions = await page.evaluate(() => {
        const seen = new Set();
        const out = [];
        const all = [...window.__lo.deck.questions.filter((q) => q.kind === 'estimate'), ...window.__lo.population.cardsForKindByLengthDesc('estimate').map((c) => c.question)];
        for (const q of all) {
          if (seen.has(q.id) || (q.estimate?.ranges ?? []).length < 5) continue;
          seen.add(q.id);
          out.push(q);
        }
        const four = all.find((q) => (q.estimate?.ranges ?? []).length === 4);
        return { five: out, four };
      });
      assert.ok(questions.five.some((q) => q.id === 'q33'), `${look}: the sweep includes q33`);
      assert.ok(questions.four, `${look}: the bank has a four-range estimate`);
      for (const question of [...questions.five, questions.four]) {
        const tight = question !== questions.four;
        for (const beat of ['posed', 'locked']) {
          if (beat === 'posed') await framePosed(page, 'widescreen', question); else await frameLocked(page, 'widescreen', question);
          const m = await page.evaluate((beat) => {
            const root = document.querySelector('[data-screen="question"][data-kind]');
            const h1 = root.querySelector('.question-stage-copy h1');
            const stage = document.querySelector('.scaled-stage-content');
            const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
            // Every other run of words on the stage, at the size it renders.
            const others = [];
            const walk = document.createTreeWalker(document.querySelector('.question-shell'), NodeFilter.SHOW_TEXT);
            for (let node = walk.nextNode(); node; node = walk.nextNode()) {
              const el = node.parentElement;
              if (!node.textContent.trim() || !el || h1.contains(el) || el.closest('.sr-only')) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility !== 'visible' || cs.display === 'none' || el.getClientRects().length === 0) continue;
              let alpha = 1;
              for (let a = el; a; a = a.parentElement) alpha *= Number(getComputedStyle(a).opacity);
              if (alpha < 0.1) continue;
              others.push({ px: parseFloat(cs.fontSize), text: node.textContent.trim().slice(0, 24) });
            }
            const biggest = others.reduce((b, o) => (!b || o.px > b.px ? o : b), null);
            const dims = window.__stageDims.widescreen;
            const outcome = window.__stageChecks.computeStageChecks({ root: document, format: 'widescreen', beat: beat === 'posed' ? 'entering' : 'locked', kind: 'estimate', canvasWidth: dims.width, canvasHeight: dims.height, tolerancePx: 1 });
            return {
              step: root.getAttribute('data-stem-step'), density: root.getAttribute('data-density'), cards: root.getAttribute('data-cards'),
              stem: parseFloat(getComputedStyle(h1).fontSize),
              labels: [...root.querySelectorAll('.answer-bar__label')].map((label) => parseFloat(getComputedStyle(label).fontSize)),
              lines: Math.round(h1.getBoundingClientRect().height / scale / (parseFloat(getComputedStyle(h1).fontSize) * 1.2)),
              emphasis: [...h1.querySelectorAll('.vof-emphasis')].map((el) => ({ text: el.textContent.replace(/\s+/g, ' ').trim(), lines: el.getClientRects().length })),
              biggest,
              issues: outcome.issues.map((issue) => issue.code),
            };
          }, beat);
          const where = `${look} ${question.id} (${question.estimate.ranges.length} ranges) ${beat}`;
          const waiting = look === 'casefile' && LONG_ASKS.has(question.id);
          if (tight) {
            assert.equal(m.cards, 'tight', `${where}: the cards are the tighter ones`);
            assert.equal(m.density, 'compact', `${where}: at compact density`);
            assert.ok(m.labels.length >= 5 && m.labels.every((size) => size === 52), `${where}: over 52 px ranges (${m.labels.join(', ')})`);
          } else {
            assert.equal(m.cards, null, `${where}: two rows of ranges keep today's cards`);
            assert.equal(m.density, 'regular', `${where}: at regular density`);
          }
          if (waiting) {
            // As built until the owner's call: the step the fit can hold, one under the cap.
            assert.equal(m.step, 'S', `${where}: as built, the long ask keeps 44 in Case file`);
            assert.equal(m.lines, 2, `${where}: in two lines`);
          } else {
            if (tight) {
              assert.equal(m.step, 'M', `${where}: the stem holds its cap`);
              assert.equal(m.stem, 56, `${where}: at 56 px`);
            }
            assert.ok(m.biggest && m.stem > m.biggest.px, `${where}: the ask is the biggest words on the screen (${m.stem} against "${m.biggest?.text}" at ${m.biggest?.px})`);
          }
          // The tighter cards must fit the stage. The four-range card is VOF-98's control, held to today's cards above: Case file
          // reports card-text-safe on its locked beat at the pre-picks head too, so its fit is queued, not judged here.
          if (tight) assert.deepEqual(m.issues.filter((code) => ASK_CODES.includes(code)), [], `${where}: the stem and its cards fit the stage`);
          if (question.id === 'q33') {
            assert.equal(m.lines, 2, `${where}: q33 reads in two lines`);
            const older = m.emphasis.find((run) => run.text === '65 or older');
            assert.ok(older, `${where}: q33 marks "65 or older" (${JSON.stringify(m.emphasis)})`);
            assert.equal(older.lines, 1, `${where}: "65 or older" stays on one line`);
            q33Seen += 1;
          }
          checked += 1;
        }
      }
      await context.close();
    }
    assert.ok(checked >= 4 * 2 * 2, `every look was measured at both beats (${checked})`);
    assert.equal(q33Seen, 4 * 2, 'q33 was measured in every look at both beats');
  });
});

