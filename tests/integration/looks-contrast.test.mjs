// Every look reads at WCAG AA on every question kind in the decks, on the big screen and on a phone (VOF-93).
//
// The explore review of the looks missed one question kind: the lettered replies of a better reply question, whose
// letter was navy on a dark hole in Case file (1.44 to 1), because the review's frames never showed that kind. This gate
// closes that hole by taking its frames from the bank itself. For every kind it renders the longest card, one card for
// every distinct layout (the number of replies, the number of steps, the widest range label) and, over the picture, the
// shortest too, in every beat that carries words, in every look, and it measures the real pixels behind every run of
// words, the picture and the plates included, and the words CSS paints as well. A look fails the gate when any run is
// under AA, when the meter cannot find the glyphs of a run, or when the sweep did not look at what it says it looked at:
// every kind has to appear, as the page itself reports it, and every frame has to carry words it could read.
//
// The soft topic patterns (VOF-94) ride in every one of these sweeps. Each adds the longest question of every one of the fourteen
// pattern families to its cards, waits for that family's layer, fails if a different one or none is drawn, and counts the frames
// and the families it saw, so a pass means the words read with the pattern behind them and not that no pattern was ever looked at.
// Today is swept too, since the patterns draw in it, and a viewer who asks for less transparency sees none.
//
// The sweeps themselves live in look-sweeps.mjs, so a person can run them on another canvas, another phone, the other art
// mode, or with reduced motion or reduced transparency. The gate runs the product states: the big screen over its picture
// (every card, every beat, and the screens that are not a question), the big screen over its drawn set (the picture's
// fallback), the square and portrait canvases over their picture (the lean cards and every screen that is not a question,
// which first hid a lamp's glow behind a heading and a bulb behind a number), a 390 by 844 phone over its drawn set, a
// 430 by 932 phone that asks for the picture, the big screen over its picture with transparency turned down, and setup.
// The drawn set keeps the short list of beats (the question asked and the reveal to a room that missed) because each frame is
// read at four points of every loop, and it is the fallback for a picture that will not load.
import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';
import { STAGE_CATEGORIES, finishEntrances, holdLoops, measureContrast } from './look-contrast-meter.mjs';
import {
  CANVASES, DRAWN, PHONES, exposeStore, frameRevealed, framePosed, frameScreen, hostAdvances, hostAsk, hostReveals, hostScreenForPhone, hostVotes, joinPhone,
  newContext, openHost, openRelayHost, phoneVoteReady, roomCode, settle, waitForPattern,
} from './look-frames.mjs';
import { sweepPhone, sweepSetup, sweepSolo, sweepStage } from './look-sweeps.mjs';

// The doubled :root raises a rule's specificity past the look's own, so a planted rule wins as the old stylesheet's did.
const STRONGER = ':root:root:root:root:root:root:root:root:root:root';

test('the meter sees what it must: a letter on a dark disc, a letter all but its background, scenario words left on the picture and words CSS paints all fail it', { timeout: 420_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser, { width: 1920, height: 1080 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '&look=casefile');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
    await exposeStore(page);
    // The show deck's tetanus question: three lettered replies and a patient scenario under the stem.
    const question = await page.evaluate(() => window.__lo.deck.questions.find((item) => item.id === 'q31'));
    assert.ok(question && question.kind === 'which-patient', 'the show deck has its better reply question');
    await framePosed(page, 'widescreen', question);
    await finishEntrances(page);
    const sound = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(sound.byCategory.key, 'the meter finds the reply letters');
    assert.ok(sound.byCategory.key.ratio >= 4.5, `as built, the reply letters read (${sound.byCategory.key.ratio})`);
    assert.deepEqual(sound.blind, [], 'and it can find every glyph on the page');

    // The letters as they were before the fix: navy on the dark folder, 1.44 to 1.
    const planted = await page.addStyleTag({ content: `${STRONGER} .answer-bar__key { color: var(--case-ink) !important; } ${STRONGER} .answer-bar__key::before { background: var(--case-folder) !important; }` });
    await settle(page, 200);
    const broken = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(broken.byCategory.key.ratio < 3, `navy letters on the dark folder are seen failing (${broken.byCategory.key.ratio})`);
    assert.ok(broken.fails.some((fail) => fail.startsWith('key ')), `and the failure is reported by name (${broken.fails.join(' | ')})`);
    await planted.evaluate((node) => node.remove());

    // A letter that is all but the colour of its disc: the case an ink-against-background mask cannot see, because there is
    // almost no difference to find. It has to be seen, and it has to fail, not be set aside as unreadable by the meter.
    const faint = await page.addStyleTag({ content: `${STRONGER} .answer-bar__key { color: #141f33 !important; } ${STRONGER} .answer-bar__key::before { background: #10192b !important; }` });
    await settle(page, 200);
    const nearly = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.deepEqual(nearly.blind, [], `a letter all but its disc's colour is found, not left blind (${nearly.blind.join(' | ')})`);
    assert.ok(nearly.byCategory.key.ratio < 1.3, `and judged as the near nothing it is (${nearly.byCategory.key.ratio})`);
    assert.ok(nearly.fails.some((fail) => fail.startsWith('key ')), 'and it fails');
    await faint.evaluate((node) => node.remove());

    // Words CSS paints, the numbers in the reveal's order list, are judged too.
    const order = await page.evaluate(() => window.__lo.deck.questions.find((item) => item.id === 'q15'));
    await frameRevealed(page, 'widescreen', order, { room: 'right' });
    await finishEntrances(page);
    const numbered = await measureContrast(page, { categories: STAGE_CATEGORIES });
    const counters = numbered.detail.filter((run) => run.text.startsWith('::before'));
    assert.ok(counters.length >= 3, `the meter finds the numbers CSS draws in the order list (${counters.length})`);
    assert.ok(counters.every((run) => run.ratio >= run.bar), `as built, those numbers read (${counters.map((run) => run.ratio.toFixed(2)).join(', ')})`);
    const goldStyle = await page.addStyleTag({ content: `${STRONGER} .question-result-order > li::before { color: #fbbf24 !important; }` });
    await settle(page, 200);
    const gold = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(gold.fails.some((fail) => fail.includes('::before')), `gold numbers on the paper are seen failing (${gold.fails.join(' | ')})`);
    await goldStyle.evaluate((node) => node.remove());

    // Words that are faded and are not the product's own dimming are judged at their faded ink, not left out as faded.
    await page.addStyleTag({ content: `${STRONGER} .question-result-order > li { opacity: 0.4 !important; }` });
    await settle(page, 200);
    const dimmed = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(dimmed.fails.some((fail) => fail.startsWith('order ')), `an order list faded to 0.4 is seen failing (${dimmed.fails.join(' | ')})`);
    assert.ok(!dimmed.skipped.some((item) => item.category === 'order' && /faded|invisible/.test(item.why)), 'and it is not left out as faded');

    // The patient's scenario stands on the picture, so with its plate and the hold taken away it must fail.
    await openHost(page, url, '&look=studio');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
    await exposeStore(page);
    await framePosed(page, 'widescreen', question);
    await finishEntrances(page);
    const plated = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(plated.byCategory.scenario && plated.byCategory.scenario.ratio >= 3, `with its plate the scenario reads (${plated.byCategory.scenario?.ratio})`);
    await page.addStyleTag({ content: `${STRONGER} .question-stage-scenario { background: transparent !important; box-shadow: none !important; } ${STRONGER} .look-stage__calm { display: none !important; }` });
    await settle(page, 200);
    const bare = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(bare.fails.some((fail) => fail.startsWith('scenario ')), `scenario words on the bare picture are seen failing (${bare.fails.join(' | ')})`);
    await context.close();
  });
});

test('the meter sees the topic pattern: a pattern drawn at full strength under the stem takes it under AA, and the ink does not follow the words', { timeout: 300_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser, { width: 1920, height: 1080 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '');
    await exposeStore(page);
    const question = await page.evaluate(() => window.__lo.deck.questions.find((item) => item.id === 'q5'));
    await framePosed(page, 'widescreen', question);
    await waitForPattern(page, 'stage', 'rsv');
    await finishEntrances(page);
    const as = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(as.byCategory.stem && as.byCategory.stem.ratio >= 3, `as built, the stem reads with the pattern behind it (${as.byCategory.stem?.ratio})`);
    assert.deepEqual(as.fails, [], 'and nothing is under its bar');
    // The meter forces every text colour to white, black and transparent to find the words. A pattern whose ink followed the text
    // colour would vanish from the shot that reads the background and the meter would never see it, which is exactly how the first
    // build of the layer went unmeasured, so the ink is a colour of its own.
    const inkHolds = await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = ':is(#sl-never, *), :is(#sl-never, *)::before, :is(#sl-never, *)::after { color: transparent !important; -webkit-text-fill-color: transparent !important; }';
      document.head.append(style);
      const ink = getComputedStyle(document.querySelector('.topic-pattern__tile')).backgroundColor;
      style.remove();
      return ink;
    });
    assert.notEqual(inkHolds, 'rgba(0, 0, 0, 0)', 'the ink survives the meter forcing every text colour transparent');
    // The pattern as strong as it can be, with no calm hold: the stem falls under its bar and the meter says so by name.
    const planted = await page.addStyleTag({ content: `${STRONGER} .topic-pattern { --pattern-alpha: 1; --pattern-calm: 1; --pattern-header: 1; --pattern-ink: #ffffff; }` });
    await settle(page, 300);
    const strong = await measureContrast(page, { categories: STAGE_CATEGORIES });
    assert.ok(strong.byCategory.stem.ratio < 3, `a full strength pattern behind the stem is seen taking it under AA (${strong.byCategory.stem.ratio})`);
    assert.ok(strong.fails.some((fail) => fail.startsWith('stem ')), `and the failure is reported by name (${strong.fails.join(' | ')})`);
    assert.deepEqual(strong.blind, [], 'with every glyph still found');
    await planted.evaluate((node) => node.remove());
    await context.close();
  });
});

test('holding the loops puts every loop at the point of its cycle it was asked for, whatever its delay', { timeout: 180_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const context = await newContext(browser, { width: 1920, height: 1080 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '&look=studio&art=drawn');
    await exposeStore(page);
    await frameScreen(page, 'widescreen', 'lobby');
    await finishEntrances(page);
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      await holdLoops(page, phase);
      const loops = await page.evaluate(() => document.getAnimations()
        .map((animation) => ({ timing: animation.effect?.getComputedTiming?.(), name: animation.animationName }))
        .filter((loop) => loop.timing && loop.timing.iterations === Infinity)
        .map((loop) => ({ name: loop.name, delay: loop.timing.delay, progress: loop.timing.progress })));
      const delayed = loops.filter((loop) => loop.delay < 0);
      assert.ok(delayed.length >= 10, `the studio set has loops that start part way through their cycle (${delayed.length}), the ones a plain delay-plus-phase time puts before their start`);
      const before = loops.filter((loop) => loop.progress === null);
      assert.deepEqual(before.map((loop) => `${loop.name} delay ${loop.delay}`), [], `at ${phase} no loop is left before its start, showing its base style`);
      const wrong = loops.filter((loop) => loop.progress !== null && Math.abs(loop.progress - phase) > 0.02 && Math.abs(1 - loop.progress - phase) > 0.02);
      assert.deepEqual(wrong.map((loop) => `${loop.name} at ${loop.progress}`), [], `at ${phase} every loop sits at that point of its cycle, or its mirror when it alternates`);
    }
    await context.close();
  });
});

for (const look of DRAWN) {
  test(`${look}: every word reads at AA on the big screen, over its picture, on every kind in the decks`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepStage(browser, url, look, 'picture', { full: true, minFrames: 60 });
    });
  });
}

for (const look of DRAWN) {
  test(`${look}: every word reads at AA on the big screen over its drawn set, the fallback when a picture will not load`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepStage(browser, url, look, 'drawn', { beats: 'few', minFrames: 20 });
    });
  });
}

for (const look of DRAWN) {
  test(`${look}: every word reads at AA on the square and portrait canvases, over its picture, on the questions and on every other screen`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      for (const canvas of CANVASES.filter((item) => item.id !== 'wide')) {
        await sweepStage(browser, url, look, 'picture', { canvas, minFrames: 40 });
      }
    });
  });
}

for (const look of DRAWN) {
  test(`${look}: every word reads at AA on a 390 by 844 phone, on every kind in the decks`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepPhone(browser, url, look, PHONES[0], { beats: 'few', minFrames: 30 });
    });
  });
}

for (const look of DRAWN) {
  test(`${look}: every word reads at AA on a 430 by 932 phone that asks for the picture`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepPhone(browser, url, look, PHONES[1], { art: 'ai', beats: 'few', minFrames: 20 });
    });
  });
}

for (const look of DRAWN) {
  test(`${look}: every word reads at AA over its picture when the viewer asks for less transparency, and no topic pattern is drawn`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepStage(browser, url, look, 'picture', { reducedTransparency: true, minFrames: 40 });
    });
  });
}

// Today, which the topic patterns draw in too: the big screen on every canvas, both phones, and the two accessibility settings.
test('today: every word reads at AA with the topic pattern behind it on the big screen, on every kind in the decks', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    await sweepStage(browser, url, 'today', 'drawn', { beats: 'few', minFrames: 30 });
  });
});

test('today: every word reads at AA with the topic pattern behind it on the square and portrait canvases', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const canvas of CANVASES.filter((item) => item.id !== 'wide')) {
      await sweepStage(browser, url, 'today', 'drawn', { canvas, beats: 'few', minFrames: 30 });
    }
  });
});

for (const phone of PHONES) {
  test(`today: every word reads at AA with the topic pattern behind it on a ${phone.id} phone`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepPhone(browser, url, 'today', phone, { beats: 'few', minFrames: 30 });
    });
  });
}

for (const phone of PHONES) {
  test(`solo play: every word reads at AA with the topic pattern behind it on a ${phone.id} phone`, { timeout: 900_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepSolo(browser, url, phone, { perTopic: 2, minFrames: 30 });
    });
  });
}

test('today: reduced motion and reduced transparency leave every word at AA, and the second draws no pattern', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    await sweepStage(browser, url, 'today', 'drawn', { reducedMotion: true, beats: 'few', minFrames: 30 });
    await sweepStage(browser, url, 'today', 'drawn', { reducedTransparency: true, beats: 'few', minFrames: 30 });
  });
});

test('studio set: every word reads at AA over its picture with reduced motion', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    await sweepStage(browser, url, 'studio', 'picture', { reducedMotion: true, beats: 'few', minFrames: 30 });
  });
});

/** The phone's kicker rows, which take a plate over a picture (looks.css). */
const PHONE_KICKERS = '.phone-vote-meta, .phone-reveal-meta, .phone-explanation-header, .phone-state-kicker, .podium-close__kicker';

test('every kicker row on a phone that asks for the picture reads at AA on every beat, the closing included', { timeout: 600_000 }, async () => {
  // The phone sweeps above take the vote, the reveal and the explanation, and a picture phone at one size. This one reads
  // the small kicker rows on both phones through the closing too, which is where Case file's That's the game would fall
  // under AA without its plate (4.27 to 1, measured 2026-10-05).
  await withViteAndBrowser({}, async ({ url, browser }) => {
    for (const size of PHONES) {
      for (const look of DRAWN) {
        const code = roomCode();
        const host = await openRelayHost(browser, url, code);
        const { context, page: phone, deviceId } = await joinPhone(browser, url, { code, look, art: 'ai', size });
        assert.equal(await phone.locator('.look-phone[data-art="ai"]').count(), 1, `${look} ${size.id}: the phone shows the picture`);
        const q = await host.page.evaluate(() => window.__lo.deck.questions.find((item) => item.id === 'q5'));
        const runs = [];
        const read = async (beat) => {
          await finishEntrances(phone);
          const result = await measureContrast(phone, { categories: { kicker: PHONE_KICKERS }, phases: [0.3] });
          for (const item of result.detail.filter((d) => d.category === 'kicker')) runs.push({ beat, ...item });
          for (const blind of result.blind) assert.fail(`${look} ${size.id} ${beat}: the meter could not find the glyphs of ${blind}`);
        };
        await hostAsk(host.page, q);
        await phoneVoteReady(phone, q);
        await read('vote');
        await hostVotes(host.page, q, deviceId, 'wrong');
        await hostReveals(host.page, phone);
        await read('reveal');
        await hostAdvances(host.page, phone);
        await read('explanation');
        await hostScreenForPhone(host.page, phone, 'closing');
        await read('closing');
        const under = runs.filter((run) => run.ratio < run.bar).map((run) => `${run.beat}: "${run.text}" ${run.ratio.toFixed(2)} under ${run.bar}`);
        assert.deepEqual(under, [], `${look} ${size.id}: every kicker row reads at AA`);
        assert.ok(runs.some((run) => run.beat === 'closing'), `${look} ${size.id}: the closing's kicker was read (${runs.length} runs)`);
        assert.ok(runs.length >= 6, `${look} ${size.id}: the kicker rows of four beats were read (${runs.length} runs)`);
        const quietest = runs.reduce((low, run) => (run.ratio / run.bar < low.ratio / low.bar ? run : low));
        console.log(`  ${look} ${size.id}: ${runs.length} kicker runs, quietest "${quietest.text}" ${quietest.ratio.toFixed(2)} (${quietest.beat})`);
        await context.close();
        await host.context.close();
      }
    }
  });
});

for (const look of ['today', ...DRAWN]) {
  test(`${look}: every word reads at AA in setup, on the ready screen, in More options, in the Look picker and in the quick setups`, { timeout: 600_000 }, async () => {
    await withViteAndBrowser({}, async ({ url, browser }) => {
      await sweepSetup(browser, url, look);
      if (look !== 'today') await sweepSetup(browser, url, look, { reducedTransparency: true });
    });
  });
}

// VOF-97: every joined name shows, so a room of a dozen phones wears smaller plates and a full room plain names, with no plate
// of their own, in the stage's ink over a look's drawn set or the roster's plate over its picture. The sweeps above seat five
// names, always on today's plates, so this reads rooms of 12 and of 250, the room's cap, in every look on every canvas.
const ROOM_FIRST = ['Jordan', 'Priya', 'Sam', 'Morgan', 'Alex', 'Taylor', 'Riley', 'Casey', 'Jamie', 'Avery', 'Quinn', 'Rowan'];
// Every name its own words, a first name and an initial, with a number once the initials run out, so the meter, which reads
// each distinct run of words once, reads every name in the room.
const roomNames = (count) => Array.from({ length: count }, (_, i) => {
  const round = Math.floor(i / ROOM_FIRST.length);
  if (round === 0) return ROOM_FIRST[i];
  const initial = 'ABCDEFGHJKLMNPRSTW'[(round - 1) % 18];
  const lap = Math.floor((round - 1) / 18);
  return `${ROOM_FIRST[i % ROOM_FIRST.length]} ${initial}.${lap ? ` ${lap + 1}` : ''}`;
});
async function seatRoom(page, format, count) {
  await page.evaluate(({ format, names }) => {
    const { store, deck } = window.__lo;
    const devices = {};
    names.forEach((name, i) => { devices[`d-${String(i).padStart(3, '0')}`] = { nickname: name, rawNickname: name, team: null, joinedAt: 1_000_000 - i * 1000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 }; });
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, phase: 'lobby', formatId: format, run: [{ id: 'title', type: 'title' }, deck.questions.find((q) => q.id === 'q33')], slideIndex: -1, seenDevices: devices });
  }, { format, names: roomNames(count) });
  await page.waitForFunction((count) => document.querySelectorAll('.lobby-arrivals .lobby-arrival:not(.lobby-arrival--ghost)').length === count, count);
  await settle(page, 900);
  await finishEntrances(page);
}

test('every joined name reads at AA in rooms of 12 and of 250, in every look over its picture and its drawn set, on every canvas', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    let read = 0;
    for (const look of ['today', ...DRAWN]) {
      for (const art of look === 'today' ? ['drawn'] : ['picture', 'drawn']) {
        for (const canvas of CANVASES) {
          const context = await newContext(browser, { width: canvas.width, height: canvas.height });
          const page = await context.newPage();
          page.setDefaultTimeout(30_000);
          await openHost(page, url, `&look=${look}${art === 'drawn' ? '&art=drawn' : ''}`);
          if (art === 'picture') await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
          await exposeStore(page);
          for (const count of [12, 250]) {
            await seatRoom(page, canvas.format, count);
            const where = `${look} over its ${art} on the ${canvas.id} canvas with ${count} phones in`;
            const m = await measureContrast(page, { categories: STAGE_CATEGORIES, phases: [0, 0.5] });
            const named = new Set(m.detail.filter((run) => run.category === 'lobbyNames').map((run) => run.text));
            const unread = roomNames(count).filter((name) => !named.has(name));
            assert.deepEqual(unread, [], `${where}: the meter reads every name (${unread.length} of ${count} unread)`);
            assert.deepEqual(m.blind.filter((b) => b.startsWith('lobbyNames')), [], `${where}: and every glyph of them`);
            assert.deepEqual(m.fails.filter((f) => f.startsWith('lobbyNames')), [], `${where}: every name reads at AA`);
            read += 1;
          }
          await context.close();
        }
      }
    }
    assert.equal(read, (1 + DRAWN.length * 2) * CANVASES.length * 2, 'every look, art, canvas and room size was read');

    // Control: a full room's plain names in a dim ink must fail the meter.
    const context = await newContext(browser, { width: 1920, height: 1080 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '');
    await exposeStore(page);
    await seatRoom(page, 'widescreen', 250);
    await page.addStyleTag({ content: `${STRONGER} .lobby-arrivals .lobby-arrival { color: color-mix(in srgb, var(--color-stage-deep) 70%, var(--color-ink)) !important; }` });
    await settle(page, 300);
    const dim = await measureContrast(page, { categories: STAGE_CATEGORIES, phases: [0] });
    assert.ok(dim.fails.some((f) => f.startsWith('lobbyNames')), 'names in a dim ink are seen under AA');
    await context.close();
  });
});

/** How Today's kicker plate sits on its words, in canvas px, since the stage is scaled to the window and padding is not: the most
 * any plate box runs past the line of words it holds, beyond its padding, and the most two lines' plate boxes overlap. */
const kickerHug = (page) => page.evaluate(() => {
  const block = document.querySelector('.question-source-kicker');
  const words = block.querySelector('.question-source-kicker__words') ?? block;
  // Whichever box carries the plate is the one that has to hug the words.
  const painted = [words, block].find((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)');
  if (!painted) return { plate: null };
  const stage = document.querySelector('.scaled-stage-content');
  const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
  const cs = getComputedStyle(painted);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const range = document.createRange();
  range.selectNodeContents(words);
  const lines = [...range.getClientRects()].filter((r) => r.width > 0.5);
  const plates = [...painted.getClientRects()].sort((a, b) => a.top - b.top);
  let over = -Infinity;
  for (const line of lines) {
    const mid = (line.top + line.bottom) / 2;
    const plate = plates.find((box) => mid >= box.top && mid <= box.bottom) ?? plates[0];
    over = Math.max(over, (plate.width - line.width) / scale - pad);
  }
  let overlap = 0;
  for (let i = 1; i < plates.length; i += 1) overlap = Math.max(overlap, (plates[i - 1].bottom - plates[i].top) / scale);
  return { plate: cs.backgroundColor, over, overlap, spacing: parseFloat(getComputedStyle(words).letterSpacing) || 0, lines: lines.length, plates: plates.length, text: words.textContent.trim() };
});

// VOF-99 (the owner's pick of 2026-10-05, K1): the question kicker sits over Today's teal spotlight at its brightest, where
// gold on bare light measured 3.1 to 4.0 to 1. The gate above judged it as large text, at 3 to 1, so it passed. Today's
// kicker now wears the plate the drawn looks give it over a picture. This holds Today's kicker to 4.5 to 1 at four points of
// every loop on every canvas and beat, every other look's kicker at least at the bar the gate holds it to, and Today's plate
// to the words on it.
test('the question kicker reads at 4.5 to 1 at every point of the spotlight in Today on every canvas, at its bar in every other look, and Today\'s plate hugs its word', { timeout: 900_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const categories = { kicker: '.question-source-kicker', ...STAGE_CATEGORIES };
    const phases = [0, 0.25, 0.5, 0.75];
    const kickerOf = async (page, where) => {
      const m = await measureContrast(page, { categories, phases });
      const runs = m.detail.filter((run) => run.category === 'kicker');
      assert.ok(runs.length > 0, `${where}: the meter finds the kicker`);
      assert.deepEqual(m.blind.filter((b) => b.startsWith('kicker')), [], `${where}: and every glyph of it`);
      return runs.reduce((w, run) => (!w || run.ratio < w.ratio ? run : w), null);
    };
    const frames = [];
    for (const look of ['today', ...DRAWN]) {
      for (const art of look === 'today' ? [''] : ['', '&art=drawn']) {
        for (const canvas of CANVASES) {
          // A drawn look's set is the fallback for a picture that will not load, read on the wide stage.
          if (art && canvas.id !== 'wide') continue;
          const context = await newContext(browser, { width: canvas.width, height: canvas.height });
          const page = await context.newPage();
          page.setDefaultTimeout(30_000);
          await openHost(page, url, `&look=${look}${art}`);
          await exposeStore(page);
          const q = await page.evaluate(() => window.__lo.deck.questions.find((item) => item.id === 'q33'));
          const beats = look === 'today' && canvas.id === 'wide' ? ['posed', 'revealed', 'explaining'] : ['posed'];
          for (const beat of beats) {
            if (beat === 'posed') await framePosed(page, canvas.format, q);
            else await frameRevealed(page, canvas.format, q, { room: 'wrong', beat });
            await finishEntrances(page);
            const where = `${look}${art ? ' over its drawn set' : ''} ${canvas.id} q33 ${beat}`;
            const worst = await kickerOf(page, where);
            // Today's own kicker is held to 4.5 (VOF-99). The drawn looks' kickers are not part of that ruling, so they hold the
            // bar the gate holds them to, 3 to 1 for type this large.
            const bar = look === 'today' ? 4.5 : worst.bar;
            assert.ok(worst.ratio >= bar, `${where}: the kicker reads at ${worst.ratio.toFixed(2)} to 1, under ${bar}`);
            frames.push(where);
          }
          if (look === 'today') {
            // The plate hugs the kicker: on every line it ends with that line's last word. q33's kickers are one line, so the
            // kickers that wrap on the narrow canvases ("Patient scenario", "Which reply is better") are framed too.
            const asks = await page.evaluate(() => {
              const { kinds, deck, population } = window.__lo;
              const all = [...deck.questions, ...population.cardsForKindByLengthDesc('which-patient').map((c) => c.question)];
              return ['Patient scenario', 'Which reply is better'].map((kicker) => all.find((item) => kinds.stageKindKicker(item) === kicker));
            });
            assert.ok(asks.every(Boolean), `today ${canvas.id}: the bank has a "Patient scenario" and a "Which reply is better" question`);
            let wrapped = 0;
            for (const [i, ask] of [[0, null], ...asks.map((item, k) => [k + 1, item])]) {
              if (ask) {
                await framePosed(page, canvas.format, ask);
                await finishEntrances(page);
              }
              const hug = await kickerHug(page);
              const which = i === 0 ? 'q33' : ask.id;
              assert.ok(hug.plate, `today ${canvas.id} ${which}: the kicker wears its plate`);
              assert.ok(hug.over <= hug.spacing + 2, `today ${canvas.id} ${which}: the plate runs ${hug.over.toFixed(1)} px past a line of "${hug.text}" (${hug.lines} line(s), ${hug.plates} plate box(es))`);
              assert.ok(hug.overlap <= 0.5, `today ${canvas.id} ${which}: two lines' plates overlap by ${hug.overlap.toFixed(1)} px`);
              if (hug.lines > 1) wrapped += 1;
            }
            if (canvas.id === 'portrait') assert.ok(wrapped > 0, 'on portrait a kicker that wraps was framed, so the plate is held to each of its lines');
          }
          await context.close();
        }
      }
    }
    assert.equal(frames.length, 5 + DRAWN.length * 4, `every look, canvas and beat was read (${frames.length})`);

    // Control: Today's kicker without its plate is back on the bare spotlight, and the meter must see it fail.
    const context = await newContext(browser, { width: 1920, height: 1080 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, '');
    await exposeStore(page);
    await framePosed(page, 'widescreen', await page.evaluate(() => window.__lo.deck.questions.find((item) => item.id === 'q33')));
    await finishEntrances(page);
    await page.addStyleTag({ content: `${STRONGER} .question-source-kicker__words { background: none !important; }` });
    await settle(page, 200);
    const bare = await kickerOf(page, 'control: today wide q33 with no plate');
    assert.ok(bare.ratio < 4.5, `the kicker on the bare spotlight is seen under 4.5 (${bare.ratio.toFixed(2)})`);
    await context.close();
  });
});

