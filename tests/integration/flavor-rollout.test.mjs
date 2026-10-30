// Game night on every screen (VOF-88, VOF-89 calls 15 and 16), rendered on the Teams venue at the host
// canvases, the smallest supported wide window and a phone-sized portrait one. Fails on the rollout's
// own risks:
// - The room streak pill lands inside the reveal card's top right, on every kind and canvas, clear of
//   the card's text, the join pill and the canvas edge, and only on a right reveal three running.
// - The reveal line names the room by outcome, and a wrong room gets no gold burst.
// - The arrival kicker sits directly above the stem, far smaller than it and never larger than the
//   type kicker (VOF-05, the clear-ask rule), on the longest stems too, and only on the posed beat.
// - No entrance lifts a dimmed element: a sat-out phone's steps stay at their dim through a remount.
// - The cones light every stage beat under the legibility scrim, and the older beams are gone.
// - Reduced motion holds every new animation still, and no running animation sits under a filtered
//   ancestor on the question beats (the VOF-88 frame rate rule).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

const OUT = 'work/flavor-rollout-test';
const SIZES = [
  { id: '1920x1080', width: 1920, height: 1080, formatId: 'widescreen' },
  { id: '1440x900', width: 1440, height: 900, formatId: 'widescreen' },
  { id: '1200x1200', width: 1200, height: 1200, formatId: 'square' },
  { id: '1080x1920', width: 1080, height: 1920, formatId: 'portrait' },
  // The smallest host window the show supports: the stage scales to 0.8, so the 26 px canvas floor is
  // what keeps a line at 20 real px there.
  { id: '1280x720', width: 1280, height: 720, formatId: 'widescreen' },
  // A phone-sized portrait window: the portrait canvas at about 0.9, read from arm's length.
  { id: '390x844', width: 390, height: 844, formatId: 'portrait' },
];
// The smallest real size a line on the wide or square stage may render at in a supported window.
const REAL_PX_FLOOR = 20;
// The 26 px audience floor of the wide stage canvas (visual-parity holds every other text run to it).
const AUDIENCE_FLOOR = 26;
// The smallest text the portrait canvas carries.
const PORTRAIT_FLOOR = 16;
const KINDS = ['binary', 'myth-among-three', 'estimate', 'order', 'which-patient'];
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let roomSeed = 5200;
function room() {
  roomSeed += 11;
  let n = roomSeed;
  let code = '';
  for (let i = 0; i < 4; i += 1) { code = ALPHABET[n % ALPHABET.length] + code; n = Math.floor(n / ALPHABET.length); }
  return code;
}

async function openHost(browser, url, { size, reducedMotion }) {
  const code = room();
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion });
  await context.addInitScript((code) => {
    try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* storage may be blocked */ }
    sessionStorage.setItem(`vof:presentation-venue:${code}`, 'teams');
    window.__VOF_JOIN_BASE_URL__ = 'https://vaxorfiction.com';
  }, code);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(`${url}/?room=${code}&host=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
    window.__fr = {
      store: (await import(u('/src/store/game-store.ts'))).useGameStore,
      deck: (await import(u('/src/data/decks/vax-or-fiction.ts'))).vaxOrFictionDeck,
      kinds: await import(u('/src/engine/kinds.ts')),
      population: await import(u('/tests/fixtures/bundled-population.ts')),
    };
  });
  return { context, page };
}

/** Lands a real REVEAL on question 3 of a run of `kind`, after `prior` right rooms. */
async function reveal(page, { kind, format, roomRight, prior, longest = false }) {
  await page.evaluate(({ kind, format, roomRight, prior, longest }) => {
    const { store, deck, kinds, population } = window.__fr;
    const qs = deck.questions.filter((q) => q.kind === kind).slice(0, 4);
    if (longest) {
      // The bank's longest card of the kind, by what the reveal card itself has to hold: the order
      // steps for an order question, the whole text otherwise (the sweep's own longest pick).
      const cards = population.cardsForKind(kind);
      const weight = (card) => kind === 'order' ? (card.question.steps ?? []).join(' ').length : population.textLength(card);
      const pick = cards.reduce((a, b) => (weight(b) > weight(a) ? b : a), cards[0]);
      qs[2] = { ...pick.question, id: `longest-${kind}` };
    }
    const run = [{ id: 'title', type: 'title' }, ...qs];
    const q = run[3];
    const right = kinds.rightToken(q);
    const options = kinds.questionKind(q) === 'order' ? [right, right.split('-').reverse().join('-')] : kinds.kindOptions(q).map((o) => o.token);
    const wrong = options.find((t) => t !== right);
    const votes = {};
    for (const token of new Set(options)) votes[token] = token === (roomRight ? right : wrong) ? 12 : 2;
    const voters = {};
    let i = 0;
    for (const [token, n] of Object.entries(votes)) for (let k = 0; k < n; k += 1) voters[`v-${i++}`] = { choice: token };
    const questions = {};
    for (let k = 1; k < 3; k += 1) questions[run[k].id] = { kind, choices: {}, trueCount: 0, falseCount: 0, correctPct: k > 2 - prior ? 84 : 30, majorityWrong: !(k > 2 - prior) };
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'locked', formatId: format, run, slideIndex: 3, votesLocked: true, pollVotes: { [q.id]: votes }, pollVoters: { [q.id]: voters }, roomStats: { ...store.getInitialState().roomStats, questions, streak: prior, bestStreak: prior } });
    store.getState().dispatch({ type: 'REVEAL' });
  }, { kind, format, roomRight, prior, longest });
  // The beat crossfade keeps the leaving pane for a moment, so wait for the one card that stays.
  await page.waitForFunction(() => document.querySelectorAll('.question-result-card').length === 1);
  await settle(page);
}

async function pose(page, { kind, format, longest = false }) {
  await page.evaluate(({ kind, format, longest }) => {
    const { store, deck, population } = window.__fr;
    let q = deck.questions.find((item) => item.kind === kind);
    if (longest) {
      // The bank's longest card of the kind by its whole text, the sweep's own longest pick.
      const cards = population.cardsForKind(kind);
      const pick = cards.reduce((a, b) => (population.textLength(b) > population.textLength(a) ? b : a), cards[0]);
      q = { ...pick.question, id: `longest-posed-${kind}` };
    }
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'entering', formatId: format, run: [{ id: 'title', type: 'title' }, q], slideIndex: 1 });
  }, { kind, format, longest });
  // Under full motion the question before this one is still on its way out for a moment. Wait for the one
  // that stays.
  await page.waitForFunction(() => document.querySelectorAll('[data-role="arrival-kicker"]').length === 1);
  await page.locator('[data-role="arrival-kicker"]').waitFor({ state: 'attached' });
  await page.locator('.question-shell .question-stage-copy h1').first().waitFor();
  await settle(page, 900);
}

async function settle(page, ms = 700) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await page.waitForTimeout(ms);
}

/** Canvas-space boxes for the reveal card's parts and the chrome around it. */
function revealGeometry(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.question-show-frame');
    const f = frame.getBoundingClientRect();
    const scale = f.width / frame.offsetWidth;
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: (r.left - f.left) / scale, top: (r.top - f.top) / scale, right: (r.right - f.left) / scale, bottom: (r.bottom - f.top) / scale }; };
    const card = document.querySelector('.question-result-card');
    const pill = document.querySelector('[data-role="room-streak-pill"]');
    // Every text run in the card other than the pill: the room line, the key, the eyebrow, the verdict,
    // the sting and the order steps.
    const texts = [];
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (!node.textContent.trim() || pill?.contains(node)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) texts.push({ text: node.textContent.trim().slice(0, 40), left: (r.left - f.left) / scale, top: (r.top - f.top) / scale, right: (r.right - f.left) / scale, bottom: (r.bottom - f.top) / scale });
    }
    const burst = getComputedStyle(frame, '::before').content;
    return {
      canvas: { width: frame.offsetWidth, height: frame.offsetHeight },
      card: rect(card), pill: rect(pill), pillText: pill?.textContent ?? null,
      pillFont: pill ? parseFloat(getComputedStyle(pill).fontSize) : null,
      scale,
      poll: rect(document.querySelector('[data-role="result-distribution"]')),
      rail: rect(document.querySelector('.question-show-frame .status-rail')),
      header: rect(document.querySelector('.question-source-header')),
      lineFont: parseFloat(getComputedStyle(document.querySelector('[data-role="room-reveal-line"]') ?? document.body).fontSize),
      joinPill: rect(document.querySelector('.question-show-frame .show-join-pill')),
      line: document.querySelector('[data-role="room-reveal-line"]')?.textContent ?? null,
      outcome: document.querySelector('.question-shell')?.dataset.roomOutcome ?? null,
      burst, texts,
    };
  });
}

function overlap(a, b) {
  if (!a || !b) return 0;
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 0.5 && y > 0.5 ? x * y : 0;
}

test('the room streak pill lands in the reveal card top right on every kind and canvas, and only when earned', async () => {
  await fs.mkdir(OUT, { recursive: true });
  let measured = 0;
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const size of SIZES) {
      const { context, page } = await openHost(browser, url, { size, reducedMotion: 'reduce' });
      for (const kind of KINDS) {
        const label = `${size.id} ${kind}`;
        await reveal(page, { kind, format: size.formatId, roomRight: true, prior: 2 });
        const g = await revealGeometry(page);
        await page.screenshot({ path: path.join(OUT, `${size.id}-${kind}-streak.png`) });
        assert.equal(g.outcome, 'right', `${label}: the room called it`);
        assert.equal(g.line, 'Most of the room called it.', `${label}: the reveal line`);
        assert.equal(g.pillText, '3 in a row for the room.', `${label}: the pill names the real room streak`);
        assert.ok(g.pill.top >= g.card.top - 0.5 && g.pill.right <= g.card.right + 0.5 && g.pill.left >= g.card.left, `${label}: the pill sits inside the card (${JSON.stringify(g.pill)} in ${JSON.stringify(g.card)})`);
        assert.ok(g.card.right - g.pill.right < 48 && g.pill.top - g.card.top < 24, `${label}: the pill lands in the card's top right corner`);
        assert.ok(g.pill.left >= 0 && g.pill.right <= g.canvas.width && g.pill.top >= 0, `${label}: the pill stays on the canvas`);
        assert.equal(overlap(g.pill, g.joinPill), 0, `${label}: the pill clears the join pill`);
        for (const text of g.texts) assert.equal(overlap(g.pill, text), 0, `${label}: the pill clears "${text.text}"`);
        assert.ok(g.texts.length > 0, `${label}: the card's text was measured`);
        if (size.formatId !== 'portrait') {
          // The 26 px audience floor holds on the wide and square stage canvases, which keeps both lines at
          // 20 real px or more in the smallest supported window.
          assert.ok(g.pillFont >= AUDIENCE_FLOOR, `${label}: the streak pill meets the ${AUDIENCE_FLOOR} px audience floor (${g.pillFont})`);
          assert.ok(g.lineFont >= AUDIENCE_FLOOR, `${label}: the reveal line meets the ${AUDIENCE_FLOOR} px audience floor (${g.lineFont})`);
          assert.ok(g.pillFont * g.scale >= REAL_PX_FLOOR - 0.2, `${label}: the streak pill reads at ${REAL_PX_FLOOR} real px or more (${(g.pillFont * g.scale).toFixed(1)} at scale ${g.scale.toFixed(2)})`);
        } else {
          // Portrait is a phone-sized canvas: the pill takes the smallest portrait size at every scale, and it
          // never outgrows the reveal line it sits above.
          assert.ok(g.pillFont >= PORTRAIT_FLOOR, `${label}: the portrait pill is ${PORTRAIT_FLOOR} px or more (${g.pillFont})`);
          assert.ok(g.pillFont <= g.lineFont, `${label}: the portrait pill is never larger than the reveal line (${g.pillFont} against ${g.lineFont})`);
        }
        // The tag never takes over the card: it leaves most of the card's top edge free.
        assert.ok(g.pill.right - g.pill.left <= (g.card.right - g.card.left) * 0.75, `${label}: the pill leaves the card's top edge mostly free (${(g.pill.right - g.pill.left).toFixed(0)} of ${(g.card.right - g.card.left).toFixed(0)} px)`);

        await reveal(page, { kind, format: size.formatId, roomRight: true, prior: 1 });
        const two = await revealGeometry(page);
        assert.equal(two.pill, null, `${label}: two running is not a room streak yet`);
        assert.equal(two.line, 'Most of the room called it.');

        await reveal(page, { kind, format: size.formatId, roomRight: false, prior: 2 });
        const wrong = await revealGeometry(page);
        assert.equal(wrong.outcome, 'wrong', `${label}: the room was caught`);
        assert.equal(wrong.line, 'This one caught most of us.', `${label}: the wrong reveal line`);
        assert.equal(wrong.pill, null, `${label}: no streak pill on a wrong reveal`);
        assert.equal(wrong.burst, 'none', `${label}: no gold burst on a wrong reveal`);
        measured += 1;
      }
      await context.close();
    }
  });
  assert.equal(measured, SIZES.length * KINDS.length, 'every canvas and kind was measured');
});

test('the arrival kicker sits directly above the stem, quieter than the stem and the type kicker', async () => {
  let measured = 0;
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const size of SIZES) {
      const { context, page } = await openHost(browser, url, { size, reducedMotion: 'reduce' });
      for (const kind of KINDS) {
        const label = `${size.id} ${kind}`;
        await pose(page, { kind, format: size.formatId });
        const g = await page.evaluate(() => {
          const box = (el) => el.getBoundingClientRect();
          const line = document.querySelector('[data-role="arrival-kicker"]');
          const stem = document.querySelector('.question-shell .question-stage-copy h1');
          const kicker = document.querySelector('[data-role="question-kicker"]');
          const header = document.querySelector('.question-source-header');
          const px = (el) => parseFloat(getComputedStyle(el).fontSize);
          const frame = document.querySelector('.question-show-frame');
          return {
            line: { ...box(line).toJSON(), size: px(line), opacity: Number(getComputedStyle(line).opacity), text: line.textContent },
            stem: { ...box(stem).toJSON(), size: px(stem) }, kicker: { size: px(kicker), text: kicker.textContent }, header: box(header).toJSON(),
            scale: box(frame).width / frame.offsetWidth,
          };
        });
        await page.screenshot({ path: path.join(OUT, `${size.id}-${kind}-posed.png`) });
        assert.equal(g.line.text, 'Here comes one to argue about.', `${label}: the arrival line`);
        assert.ok(g.line.opacity > 0.9, `${label}: reduced motion keeps the line readable`);
        assert.ok(g.line.bottom <= g.stem.top + 1 && g.stem.top - g.line.bottom < 40, `${label}: directly above the stem (${(g.stem.top - g.line.bottom).toFixed(1)} px apart)`);
        assert.ok(g.line.top >= g.header.bottom, `${label}: under the header row`);
        assert.ok(g.line.size < g.stem.size, `${label}: smaller than the stem (${g.line.size} against ${g.stem.size})`);
        assert.ok(g.line.size <= g.kicker.size, `${label}: never larger than the type kicker "${g.kicker.text}" (${g.line.size} against ${g.kicker.size})`);
        // The type kicker's own size, capped at the wide canvas's 26 px audience floor: 26 wide, 24 square, 18 portrait.
        assert.equal(g.line.size, Math.min(g.kicker.size, AUDIENCE_FLOOR), `${label}: the arrival line takes the type kicker's size, capped at ${AUDIENCE_FLOOR} px`);
        if (size.formatId === 'widescreen') assert.ok(g.line.size * g.scale >= REAL_PX_FLOOR - 0.2, `${label}: the arrival line reads at ${REAL_PX_FLOOR} real px or more (${(g.line.size * g.scale).toFixed(1)})`);
        if (size.formatId === 'portrait') assert.ok(g.line.size >= PORTRAIT_FLOOR, `${label}: the portrait arrival line is ${PORTRAIT_FLOOR} px or more`);

        // The longest stem of the kind: the line still has its own row, clear of the chrome above it.
        await pose(page, { kind, format: size.formatId, longest: true });
        const long = await page.evaluate(() => {
          const frame = document.querySelector('.question-show-frame').getBoundingClientRect();
          const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
          const line = document.querySelector('[data-role="arrival-kicker"]');
          return {
            frame: rect(document.querySelector('.question-show-frame')), line: rect(line), opacity: Number(getComputedStyle(line).opacity),
            stem: rect(document.querySelector('.question-shell .question-stage-copy h1')),
            kicker: rect(document.querySelector('[data-role="question-kicker"]')),
            join: rect(document.querySelector('.question-show-frame .show-join-pill')),
            header: rect(document.querySelector('.question-source-header')),
            overflow: line.scrollWidth - line.clientWidth, width: frame.width,
          };
        });
        await page.screenshot({ path: path.join(OUT, `${size.id}-${kind}-longest-posed.png`) });
        const longLabel = `${size.id} longest ${kind}`;
        assert.ok(long.line && long.stem && long.kicker && long.join, `${longLabel}: the line, the stem, the type kicker and the join pill all render`);
        assert.ok(long.opacity > 0.9, `${longLabel}: the line shows`);
        assert.ok(long.line.left >= long.frame.left - 0.5 && long.line.right <= long.frame.right + 0.5 && long.line.top >= long.frame.top - 0.5, `${longLabel}: the line stays on the canvas (${JSON.stringify(long.line)})`);
        assert.ok(long.overflow <= 0, `${longLabel}: the line's text does not run past its own box (${long.overflow} px)`);
        assert.ok(long.line.top >= long.header.bottom - 0.5, `${longLabel}: under the header row (${(long.line.top - long.header.bottom).toFixed(1)} px)`);
        assert.ok(long.line.bottom <= long.stem.top + 1, `${longLabel}: above the stem (${(long.stem.top - long.line.bottom).toFixed(1)} px apart)`);
        assert.equal(overlap(long.line, long.kicker), 0, `${longLabel}: the line clears the type kicker`);
        assert.equal(overlap(long.line, long.join), 0, `${longLabel}: the line clears the join pill`);

        // A locked question names no arrival: the line belongs to the posed beat only.
        await page.evaluate(() => window.__fr.store.getState().dispatch({ type: 'LOCK_VOTES' }));
        await page.waitForSelector('.question-shell[data-stage-beat="locked"]');
        await settle(page, 200);
        const lockedOpacity = await page.evaluate(() => { const line = document.querySelector('[data-role="arrival-kicker"]'); return line ? Number(getComputedStyle(line).opacity) : 0; });
        assert.ok(lockedOpacity < 0.05, `${longLabel}: the arrival line is gone once the votes lock (${lockedOpacity})`);
        measured += 1;
      }
      await context.close();
    }
  });
  assert.equal(measured, SIZES.length * KINDS.length);
});

test('the cones light every stage beat under the scrim, the old beams are gone, and reduced motion holds them still', async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openHost(browser, url, { size: SIZES[0], reducedMotion: 'reduce' });
    const beats = [
      ['posed', () => pose(page, { kind: 'binary', format: 'widescreen' })],
      ['reveal', () => reveal(page, { kind: 'binary', format: 'widescreen', roomRight: true, prior: 2 })],
      ['leaderboard', async () => { await page.evaluate(() => window.__fr.store.setState({ phase: 'leaderboard' })); await settle(page); }],
      ['closing', async () => { await page.evaluate(() => window.__fr.store.setState({ phase: 'closing' })); await settle(page); }],
      ['showdown', async () => {
        await page.evaluate(() => {
          const finalists = [{ ticket: 'a', name: 'Riley', score: 420, duelPoints: 0 }, { ticket: 'b', name: 'Sam', score: 380, duelPoints: 0 }];
          window.__fr.store.setState({ phase: 'showdown', showdownEnabled: true, votesLocked: true, showdown: { id: 't:showdown', finalists, predictions: {}, predictionCounts: { a: 0, b: 0 }, questionIds: [], questionIndex: 0, isRecap: false, stage: 'lineup', winner: null, tie: false } });
        });
        await page.locator('.showdown-screen').waitFor();
        await settle(page);
      }],
      ['setup', async () => { await page.evaluate(() => { const s = window.__fr.store; s.setState({ ...s.getInitialState(), phase: 'preFlight' }); }); await page.locator('.preflight-screen').waitFor(); await settle(page); }],
    ];
    for (const [beat, go] of beats) {
      await go();
      const s = await page.evaluate(() => {
        const cones = document.querySelector('.stage-atmosphere > .stage-cones');
        const lights = document.querySelector('.stage-atmosphere > .show-lights');
        const scrim = document.querySelector('.stage-atmosphere > .show-scrim');
        const screen = document.querySelector('.screen-router-viewport > *');
        const moving = document.getAnimations().filter((a) => a.playState === 'running' && /^(gn-|stage-cone)/.test(a.animationName ?? ''));
        return {
          cones: Number(getComputedStyle(cones).opacity), conesZ: Number(getComputedStyle(cones).zIndex), scrimZ: Number(getComputedStyle(scrim).zIndex),
          beams: [getComputedStyle(lights, '::before').content, getComputedStyle(lights, '::after').content],
          screen: getComputedStyle(screen).backgroundColor, moving: moving.map((a) => a.animationName),
        };
      });
      assert.equal(s.cones, beat === 'setup' ? 0.5 : 1, `${beat}: the cones are lit`);
      assert.ok(s.conesZ < s.scrimZ, `${beat}: the cones sit under the legibility scrim`);
      assert.deepEqual(s.beams, ['none', 'none'], `${beat}: the older beams are retired`);
      assert.equal(s.screen, 'rgba(0, 0, 0, 0)', `${beat}: the beat lets the stage lights through`);
      assert.deepEqual(s.moving, [], `${beat}: reduced motion holds every new animation still`);
    }
    await context.close();
  });
});

test('full motion: a right room gets the burst, a wrong one does not, and nothing runs under a filter', async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openHost(browser, url, { size: SIZES[0], reducedMotion: 'no-preference' });
    const underFilter = () => page.evaluate(() => {
      const found = [];
      let looked = 0;
      for (const animation of document.getAnimations()) {
        const target = animation.effect?.target;
        if (!target || animation.playState !== 'running') continue;
        looked += 1;
        for (let el = target.parentElement; el; el = el.parentElement) {
          if (getComputedStyle(el).filter !== 'none') { found.push(`${animation.animationName ?? 'script'} under ${el.className}`); break; }
        }
      }
      return { found, looked };
    });
    await pose(page, { kind: 'binary', format: 'widescreen' });
    const posed = await underFilter();
    await page.evaluate(() => { const s = window.__fr.store; s.setState({ ...s.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'locked', run: [], slideIndex: -1 }); });
    await reveal(page, { kind: 'binary', format: 'widescreen', roomRight: true, prior: 2 });
    const right = await revealGeometry(page);
    const revealed = await underFilter();
    assert.notEqual(right.burst, 'none', 'a room that called it gets the gold burst');
    await reveal(page, { kind: 'binary', format: 'widescreen', roomRight: false, prior: 2 });
    const wrong = await revealGeometry(page);
    assert.equal(wrong.burst, 'none', 'a room that was caught gets no burst');
    assert.ok(posed.looked > 0 && revealed.looked > 0, `the sweep saw running animations (posed ${posed.looked}, reveal ${revealed.looked})`);
    assert.deepEqual(posed.found, [], 'posed');
    assert.deepEqual(revealed.found, [], 'reveal');
    // Every kind, under full motion: the burst belongs to a room that called it and to nobody else.
    for (const kind of KINDS) {
      await reveal(page, { kind, format: 'widescreen', roomRight: true, prior: 0 });
      assert.notEqual((await revealGeometry(page)).burst, 'none', `${kind}: a right room gets the burst`);
      await reveal(page, { kind, format: 'widescreen', roomRight: false, prior: 2 });
      const caught = await revealGeometry(page);
      assert.equal(caught.outcome, 'wrong', `${kind}: the room was caught`);
      assert.equal(caught.burst, 'none', `${kind}: no gold burst on a wrong reveal under full motion`);
    }
    await context.close();
  });
});

test('full motion: the arrival line bows out once the room is voting, and the pill rides the exit dissolve', async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const { context, page } = await openHost(browser, url, { size: SIZES[0], reducedMotion: 'no-preference' });
    await pose(page, { kind: 'binary', format: 'widescreen' });
    const landed = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-role="arrival-kicker"]')).opacity));
    assert.ok(landed > 0.9, `the arrival line lands with the question (${landed})`);
    const stemBefore = await page.evaluate(() => document.querySelector('.question-stage-copy h1').getBoundingClientRect().top);
    await page.waitForTimeout(4200);
    const later = await page.evaluate(() => ({ opacity: Number(getComputedStyle(document.querySelector('[data-role="arrival-kicker"]')).opacity), stem: document.querySelector('.question-stage-copy h1').getBoundingClientRect().top, phase: document.querySelector('.question-shell').dataset.phase }));
    assert.equal(later.phase, 'deliberating', 'voting is under way');
    assert.ok(later.opacity < 0.05, `the arrival line has bowed out (${later.opacity})`);
    assert.ok(Math.abs(later.stem - stemBefore) < 1, 'the stem does not move when the line leaves');

    // A host reload on a locked question mounts its card fresh. The line belongs to the posed beat, so it
    // must not replay over a question the room has already argued.
    await page.evaluate(() => {
      const { store, deck } = window.__fr;
      const q = deck.questions.filter((item) => item.kind === 'binary')[1];
      store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'locked', votesLocked: true, formatId: 'widescreen', run: [{ id: 'title', type: 'title' }, q], slideIndex: 1 });
    });
    await page.waitForSelector('.question-shell[data-stage-beat="locked"] [data-role="arrival-kicker"]');
    const replay = await page.evaluate(async () => {
      const seen = [];
      for (let i = 0; i < 12; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const line = document.querySelector('[data-role="arrival-kicker"]');
        seen.push(line ? Number(getComputedStyle(line).opacity) : 0);
      }
      return seen;
    });
    assert.equal(replay.length, 12, 'the locked mount was sampled for over a second');
    assert.ok(Math.max(...replay) < 0.05, `a question that mounts already locked never plays the arrival line (peak ${Math.max(...replay)})`);

    // The host reopens that vote (restart after a lock): the question is posed again, but it has arrived
    // once already, so the line stays spent.
    const sampleLine = () => page.evaluate(async () => {
      const seen = [];
      for (let i = 0; i < 12; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const line = document.querySelector('[data-role="arrival-kicker"]');
        seen.push(line ? Number(getComputedStyle(line).opacity) : 0);
      }
      return seen;
    });
    await page.evaluate(() => window.__fr.store.setState({ phase: 'deliberating', votesLocked: false }));
    await page.waitForSelector('.question-shell[data-stage-beat="posed"] [data-role="arrival-kicker"]');
    const reopened = await sampleLine();
    assert.ok(Math.max(...reopened) < 0.05, `a reopened vote never replays the arrival line (peak ${Math.max(...reopened)})`);
    // A fresh question right after still gets its line.
    await pose(page, { kind: 'binary', format: 'widescreen' });
    const fresh = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-role="arrival-kicker"]')).opacity));
    assert.ok(fresh > 0.9, `the next question still gets its arrival line (${fresh})`);

    // Advance from a streak reveal: the leaving card keeps its pill through the dissolve.
    await reveal(page, { kind: 'binary', format: 'widescreen', roomRight: true, prior: 2 });
    assert.equal((await revealGeometry(page)).pillText, '3 in a row for the room.');
    const paddingBefore = await page.evaluate(() => getComputedStyle(document.querySelector('.question-result-card')).paddingTop);
    const during = await page.evaluate(async () => {
      const store = window.__fr.store;
      store.setState({ phase: 'entering', slideIndex: 4, votesLocked: false });
      const samples = [];
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        const card = document.querySelector('.question-result-card');
        samples.push(card ? { pill: Boolean(card.querySelector('[data-role="room-streak-pill"]')), padding: getComputedStyle(card).paddingTop } : null);
      }
      return samples;
    });
    const leaving = during.filter(Boolean);
    assert.ok(leaving.length >= 3, `the leaving card was sampled during the dissolve (${leaving.length} of ${during.length})`);
    for (const sample of leaving) {
      assert.equal(sample.pill, true, 'the leaving card keeps the streak pill');
      assert.equal(sample.padding, paddingBefore, 'the leaving card keeps its top padding');
    }
    await context.close();

    // The same dissolve with reduced transparency, where the card has no backdrop filter to anchor the pill:
    // the pill must still ride its own card, in the same corner, for the whole fade.
    const plain = await openHost(browser, url, { size: SIZES[0], reducedMotion: 'no-preference' });
    const cdp = await plain.context.newCDPSession(plain.page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    assert.equal(await plain.page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true, 'reduced transparency is on');
    await reveal(plain.page, { kind: 'binary', format: 'widescreen', roomRight: true, prior: 2 });
    const corner = () => {
      const card = document.querySelector('.question-result-card');
      const pill = card?.querySelector('[data-role="room-streak-pill"]');
      if (!card || !pill) return null;
      const c = card.getBoundingClientRect();
      const p = pill.getBoundingClientRect();
      return { right: Math.round(c.right - p.right), top: Math.round(p.top - c.top), filter: getComputedStyle(card).backdropFilter };
    };
    // The pill slides in with an overshoot, so its resting corner is read once its entrance and sheen are done.
    await plain.page.waitForFunction(() => {
      const pill = document.querySelector('[data-role="room-streak-pill"]');
      return pill && pill.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running');
    });
    const rest = await plain.page.evaluate(corner);
    assert.ok(rest && rest.right >= 0 && rest.right < 48 && rest.top >= 0 && rest.top < 24, `the pill rests in the card's corner (${JSON.stringify(rest)})`);
    assert.equal(rest.filter, 'none', 'the card has no backdrop filter under reduced transparency');
    const riding = await plain.page.evaluate(async (cornerSource) => {
      const corner = new Function(`return (${cornerSource})()`);
      window.__fr.store.setState({ phase: 'entering', slideIndex: 4, votesLocked: false });
      const samples = [];
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        samples.push(corner());
      }
      return samples;
    }, corner.toString());
    const ridingCard = riding.filter(Boolean);
    assert.ok(ridingCard.length >= 3, `the leaving card was sampled under reduced transparency (${ridingCard.length} of ${riding.length})`);
    for (const sample of ridingCard) {
      assert.ok(Math.abs(sample.right - rest.right) <= 1 && Math.abs(sample.top - rest.top) <= 1, `the pill stays in its card's corner through the dissolve (${JSON.stringify(sample)} against ${JSON.stringify(rest)})`);
    }

    // Reveal to the explanation happens inside one shell: its phase moves on while the result card fades out,
    // so the reveal phase's own rule no longer reaches the card and only the card's own anchor holds the pill.
    await reveal(plain.page, { kind: 'binary', format: 'widescreen', roomRight: true, prior: 2 });
    await plain.page.waitForFunction(() => {
      const pill = document.querySelector('[data-role="room-streak-pill"]');
      return pill && pill.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running');
    });
    const restAgain = await plain.page.evaluate(corner);
    const explaining = await plain.page.evaluate(async (cornerSource) => {
      const corner = new Function(`return (${cornerSource})()`);
      window.__fr.store.getState().dispatch({ type: 'ADVANCE' });
      const samples = [];
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        samples.push({ corner: corner(), phase: document.querySelector('.question-shell')?.dataset.phase ?? null });
      }
      return samples;
    }, corner.toString());
    const fading = explaining.filter((sample) => sample.corner && sample.phase === 'explaining');
    assert.ok(fading.length >= 2, `the result card was sampled fading under an explaining shell (${fading.length} of ${explaining.length}: ${JSON.stringify(explaining.map((sample) => sample.phase))})`);
    for (const sample of fading) {
      assert.ok(Math.abs(sample.corner.right - restAgain.right) <= 1 && Math.abs(sample.corner.top - restAgain.top) <= 1, `the pill stays in its card's corner while the card gives way to the explanation (${JSON.stringify(sample.corner)} against ${JSON.stringify(restAgain)})`);
    }
    await plain.context.close();
  });
});

function boxesOverlap(a, b) {
  return overlap(a, b) > 0;
}

test('the longest question of every kind, revealed with the line and the pill, keeps the card, the split and the rail on the canvas', async () => {
  let measured = 0;
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const size of SIZES) {
      const { context, page } = await openHost(browser, url, { size, reducedMotion: 'reduce' });
      for (const kind of KINDS) {
        const label = `${size.id} longest ${kind}`;
        await reveal(page, { kind, format: size.formatId, roomRight: true, prior: 2, longest: true });
        const g = await revealGeometry(page);
        await page.screenshot({ path: path.join(OUT, `${size.id}-${kind}-longest-streak.png`) });
        assert.equal(g.pillText, '3 in a row for the room.', `${label}: the pill shows`);
        assert.ok(g.line, `${label}: the reveal line shows`);
        // An order reveal has no split (its answer is the list itself).
        assert.ok(g.rail && (g.poll || kind === 'order'), `${label}: the split and the status rail render`);
        for (const [name, box] of [['card', g.card], ['split', g.poll], ['rail', g.rail]].filter(([, box]) => box)) {
          assert.ok(box.top >= -0.5 && box.left >= -0.5 && box.right <= g.canvas.width + 0.5 && box.bottom <= g.canvas.height + 0.5, `${label}: the ${name} stays on the canvas (${JSON.stringify(box)} in ${JSON.stringify(g.canvas)})`);
        }
        assert.ok(!boxesOverlap(g.card, g.poll), `${label}: the card clears the split`);
        assert.ok(!boxesOverlap(g.card, g.rail), `${label}: the card clears the status rail`);
        assert.ok(!boxesOverlap(g.poll, g.rail), `${label}: the split clears the status rail`);
        assert.ok(!boxesOverlap(g.card, g.header), `${label}: the card clears the header row`);
        for (const text of g.texts) assert.equal(overlap(g.pill, text), 0, `${label}: the pill clears "${text.text}"`);
        measured += 1;
      }
      await context.close();
    }
  });
  assert.equal(measured, SIZES.length * KINDS.length);
});

test('a phone that sat out an order question keeps its steps dimmed under full motion', async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const code = room();
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
    await hostContext.addInitScript(() => { try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* blocked */ } });
    const host = await hostContext.newPage();
    await host.goto(`${url}/?room=${code}&host=1`, { waitUntil: 'load' });
    await host.waitForSelector('[data-testid="screen-router"]');
    await host.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name);
      const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
      const store = (await import(u('/src/store/game-store.ts'))).useGameStore;
      const deck = (await import(u('/src/data/decks/vax-or-fiction.ts'))).vaxOrFictionDeck;
      window.__fr = { store };
      const order = deck.questions.find((q) => q.kind === 'order');
      store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', phase: 'lobby', run: [{ id: 'title', type: 'title' }, order], slideIndex: -1, seenDevices: {} });
    });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    // Every frame the sat-out order steps are on screen, from the first one after a load: their peak opacity.
    await phoneContext.addInitScript(() => {
      window.__satOut = { max: 0, samples: 0 };
      const tick = () => {
        const el = document.querySelector('.answer-dock[data-state="sat-out"] .answer-stack[data-shape="order"]');
        if (el) {
          const opacity = Number(getComputedStyle(el).opacity);
          window.__satOut.samples += 1;
          if (opacity > window.__satOut.max) window.__satOut.max = opacity;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const phone = await phoneContext.newPage();
    await phone.goto(`${url}/join?room=${code}`, { waitUntil: 'load' });
    await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Sat Out');
    await phone.locator('button[type="submit"]').click();
    await phone.waitForSelector('[data-role="phone-waiting"]');
    await host.evaluate(() => window.__fr.store.setState({ phase: 'entering', slideIndex: 1, votesLocked: false }));
    await phone.waitForSelector('[data-role="phone-vote-container"] .answer-stack[data-shape="order"]');
    await host.evaluate(() => window.__fr.store.getState().dispatch({ type: 'LOCK_VOTES' }));
    await phone.waitForSelector('.answer-dock[data-state="sat-out"]');
    // Long past every entrance, so only a fill that holds past its end could still be in play.
    await phone.waitForTimeout(1500);
    const stack = await phone.evaluate(() => {
      const el = document.querySelector('.answer-dock[data-state="sat-out"] .answer-stack[data-shape="order"]');
      return { opacity: getComputedStyle(el).opacity, running: el.getAnimations().filter((a) => a.playState === 'running').length };
    });
    assert.equal(stack.running, 0, 'the entrance has finished');
    assert.equal(stack.opacity, '0.2', 'the sat-out steps step back');

    // A phone that reloads (or joins) after the lock mounts the steps already sat out, and their entrance
    // runs then. It may fade them in, but never lift them above their dim, not even for a frame.
    await phone.reload({ waitUntil: 'load' });
    await phone.waitForSelector('.answer-dock[data-state="sat-out"] .answer-stack[data-shape="order"]');
    await phone.waitForTimeout(900);
    const remount = await phone.evaluate(() => window.__satOut);
    assert.ok(remount.samples >= 10, `the remounted steps were sampled through their entrance (${remount.samples} frames)`);
    assert.ok(remount.max <= 0.25, `the entrance never lifts sat-out steps above their dim (peak ${remount.max})`);
    await phoneContext.close();
    await hostContext.close();
  });
});

/**
 * WCAG contrast of every text run on the page against the real pixels behind it, with the cones lit
 * and with them hidden. Text is made transparent for the capture, so the capture is the background.
 */
async function contrastReport(page) {
  const runs = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const el = node.parentElement;
      if (!node.textContent.trim() || !el || el.closest('button, input, svg, [data-choice], .sr-only, [aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible' || Number(cs.opacity) < 0.9) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
        out.push({ text: node.textContent.trim().slice(0, 40), color: cs.color, x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(innerWidth, r.right) - Math.max(0, r.left), h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top) });
      }
    }
    return out;
  });
  const capture = async (hideCones) => {
    const style = await page.addStyleTag({ content: `* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; } ${hideCones ? '.stage-cones, .stage-cone { display: none !important; } .phone-backdrop::before { content: none !important; }' : ''}` });
    const shot = (await page.screenshot()).toString('base64');
    await style.evaluate((node) => node.remove());
    return page.evaluate(async ({ shot, runs }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${shot}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const lum = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      return runs.map((run) => {
        const data = ctx.getImageData(Math.floor(run.x * k), Math.floor(run.y * k), Math.max(1, Math.floor(run.w * k)), Math.max(1, Math.floor(run.h * k))).data;
        let lo = 1; let hi = 0;
        for (let i = 0; i < data.length; i += 4) { const l = lum(data[i], data[i + 1], data[i + 2]); if (l < lo) lo = l; if (l > hi) hi = l; }
        const [r, g, b] = run.color.match(/[\d.]+/g).map(Number);
        const text = lum(r, g, b);
        const ratio = (bg) => (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05);
        return Math.min(ratio(lo), ratio(hi));
      });
    }, { shot, runs });
  };
  const lit = await capture(false);
  const dark = await capture(true);
  return runs.map((run, i) => ({ text: run.text, lit: lit[i], dark: dark[i] }));
}

/** Holds every cone at a point of its sweep, so the capture sees the cone where it is brightest over the text. */
async function holdCones(page, phase) {
  await page.evaluate((phase) => {
    for (const animation of document.getAnimations()) {
      if (!/^(stage-cone-swing|gn-cone-sway)$/.test(animation.animationName ?? '')) continue;
      animation.pause();
      animation.currentTime = Number(animation.effect.getComputedTiming().duration) * phase;
    }
  }, phase);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('no text on the landing page, the site pages or the phone sits over a cone bright enough to cost it AA contrast', async () => {
  let pages = 0;
  let sawCones = 0;
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const surfaces = [
      { label: 'desktop', options: { viewport: { width: 1920, height: 1080 } }, routes: ['/', '/about', '/privacy', '/terms', '/disclaimer', '/credits'] },
      { label: 'phone', options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, routes: ['/', '/about', '/privacy', '/terms', '/disclaimer', '/credits', '/join', '/play'] },
    ];
    for (const surface of surfaces) {
      const context = await browser.newContext({ ...surface.options, reducedMotion: 'no-preference' });
      await context.addInitScript(() => { try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* blocked */ } });
      const page = await context.newPage();
      for (const route of surface.routes) {
        await page.goto(`${url}${route}`, { waitUntil: 'load' });
        await settle(page, 1200);
        sawCones += await page.evaluate(() => (document.querySelector('.stage-cone') || getComputedStyle(document.querySelector('.phone-backdrop') ?? document.body, '::before').content !== 'none' ? 1 : 0));
        for (const scrollY of [0, 500]) {
          await page.evaluate((y) => window.scrollTo(0, y), scrollY);
          for (const phase of [0, 0.25, 0.5, 0.75]) {
            await holdCones(page, phase);
            const report = await contrastReport(page);
            assert.ok(report.length > 0, `${surface.label} ${route}: text was measured`);
            // A run fails when the cones, and not the page under them, take it below AA.
            const failing = report.filter((run) => run.lit < 4.5 && run.lit < run.dark - 0.05);
            assert.deepEqual(failing.map((run) => `${run.text}: ${run.lit.toFixed(2)} lit, ${run.dark.toFixed(2)} without the cones`), [], `${surface.label} ${route} scroll ${scrollY} sweep ${phase}`);
          }
        }
        pages += 1;
      }
      await context.close();
    }
  });
  assert.equal(pages, 14, 'every page was measured');
  assert.ok(sawCones >= 12, `the check saw the cones it is judging (${sawCones})`);
});
