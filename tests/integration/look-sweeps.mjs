// The sweeps behind the looks contrast gate (VOF-93): every kind in the decks, in every beat, in one look on one surface,
// each frame measured on its real pixels. The gate runs them as shipped. A person verifying a change can run the same
// sweeps on another canvas, another phone, the other art mode, or with reduced motion or reduced transparency.
import assert from 'node:assert/strict';
import { PHONE_CATEGORIES, STAGE_CATEGORIES, finishEntrances, holdArrivalLine, measureContrast } from './look-contrast-meter.mjs';
import {
  CANVASES, KINDS, drawnPattern, exposeStore, frameLocked, framePosed, frameRevealed, frameScreen, hostAdvances, hostAsk, hostReveals,
  hostScreenForPhone, hostVotes, isLeanCard, joinPhone, newContext, openHost, openRelayHost, phoneVoteReady, pickCards, pickFamilyCards,
  roomCode, settle, waitForPattern,
} from './look-frames.mjs';

export const SCREENS = ['lobby', 'title', 'instructions', 'leaderboard', 'showdown', 'closing'];
const lookOf = (page) => page.evaluate(() => document.documentElement.dataset.look ?? null);
/** Today puts no mark on the root, so a page in Today reads null. */
const rootFor = (look) => (look === 'today' ? null : look);

/** One run of a sweep: the frames it measured, what it saw, and everything under the bar. */
export function ledger(name) {
  return { name, frames: 0, runs: 0, kinds: new Set(), fails: [], thin: [], skipped: new Map(), quietest: { ratio: Infinity, where: '' }, patternFrames: 0, families: new Set() };
}

/**
 * Measures one frame into the book. A run the meter cannot find the glyphs of is a failure, never a pass, and a run it
 * leaves out is counted by reason in `book.skipped` so the sweep can say what it did not read.
 *
 * `pattern` is what the frame must show of the topic pattern (VOF-94): `{ surface, family, expect }`. Where `expect` is true the
 * frame waits for that family's layer and fails if it is not the one drawn, so a sweep can never pass without having looked at
 * a pattern, and it counts the frames and the families it saw. A `family` left null asks only for some pattern, for a page that is not
 * told which question it is on. Where it is false the frame fails if any layer is showing (a
 * viewer who asks for less transparency, or a host who switched patterns off). Where it is left out nothing is asked.
 */
export async function measureFrame(page, book, label, { categories, phases, kindOf, arrival = null, pattern = null }) {
  if (pattern?.expect === true) await waitForPattern(page, pattern.surface, pattern.family);
  if (arrival !== null) {
    const found = await holdArrivalLine(page);
    // The arrival line plays when a question lands. Where motion is on there is exactly one to hold, and where it is
    // reduced the line simply stays and there is nothing to hold.
    assert.equal(found, arrival ? 1 : 0, `${book.name} ${label}: the arrival line was ${arrival ? 'held' : 'left alone'} (${found})`);
  }
  await finishEntrances(page);
  await page.waitForTimeout(80);
  const result = await measureContrast(page, { categories, phases });
  if (pattern?.expect === true) {
    const drawn = await drawnPattern(page, pattern.surface);
    if (pattern.family ? drawn === pattern.family : Boolean(drawn)) { book.patternFrames += 1; book.families.add(drawn); }
    else book.fails.push(`${book.name} ${label}: the ${pattern.family ?? 'question\'s'} pattern was expected behind this question and the page draws ${drawn ?? 'none'}`);
  } else if (pattern?.expect === false) {
    const drawn = await drawnPattern(page, pattern.surface);
    if (drawn) book.fails.push(`${book.name} ${label}: a ${drawn} pattern is drawn where none is wanted`);
  }
  book.frames += 1;
  book.runs += result.runs;
  const kind = await kindOf(page);
  if (kind) book.kinds.add(kind);
  for (const fail of result.fails) book.fails.push(`${book.name} ${label}: ${fail}`);
  for (const blind of result.blind) book.fails.push(`${book.name} ${label}: the meter could not find the glyphs of ${blind}`);
  for (const item of result.skipped) {
    const key = `${item.category}: ${item.why}`;
    book.skipped.set(key, (book.skipped.get(key) ?? 0) + 1);
  }
  // A frame with almost no words was not looked at. Every screen of this show has a header, a stem or a title.
  if (result.runs < 6) book.thin.push(`${label} (${result.runs} runs)`);
  for (const item of result.detail) {
    const ratio = item.ratio / item.bar;
    if (ratio < book.quietest.ratio) book.quietest = { ratio, where: `${label}: ${item.category} "${item.text}" ${item.ratio.toFixed(2)} against ${item.bar}` };
  }
  return result;
}

/** What the stage says it is showing, read from the page: the kind of the question on it, if there is one. */
export const stageKind = (page) => page.evaluate(() => document.querySelector('.question-shell')?.getAttribute('data-kind') ?? null);

/** What a phone says it is showing: the vote screen's kind or the verdict card's kind. */
export const phoneKind = (page) => page.evaluate(() => document.querySelector('[data-role="phone-vote-container"]')?.getAttribute('data-kind')
  ?? document.querySelector('[data-role="outcome-banner"]')?.getAttribute('data-kind') ?? null);

/** Fails when any run is under the bar, and when the sweep did not look at enough to be believed. */
export function settleBook(book, { kinds = KINDS, minFrames, families = null }) {
  const skipped = [...book.skipped].map(([why, n]) => `${why} x${n}`).join(', ') || 'none';
  const where = `${book.name}: ${book.frames} frames, ${book.runs} runs of words read, quietest ${book.quietest.where}. Left out: ${skipped}`;
  assert.deepEqual(book.fails, [], `every word reads at AA (${where})`);
  for (const kind of kinds) assert.ok(book.kinds.has(kind), `${book.name} looked at a ${kind} question, as the page itself reported it (${[...book.kinds].join(', ')})`);
  assert.ok(book.frames >= minFrames, `${book.name} measured at least ${minFrames} frames (${where})`);
  assert.deepEqual(book.thin, [], `${book.name}: no frame was nearly empty`);
  // A sweep that never looked at a pattern would pass every check above, so it must say which families it saw.
  if (families) {
    assert.deepEqual([...book.families].sort(), [...families].sort(), `${book.name}: every topic pattern family was on screen in a measured frame`);
    assert.ok(book.patternFrames >= families.length, `${book.name}: ${book.patternFrames} frames measured with a pattern behind them`);
  }
  console.log(`  ${where}${families ? `. Patterns: ${book.patternFrames} frames, ${book.families.size} families` : ''}`);
}

/**
 * The big screen, one look and one art mode, on one canvas. A `full` sweep takes every card of the bank's picks, and a lean
 * one takes the longest card of each kind, one card of each reply count and step count and the widest range label, which
 * covers every layout once. `beats` is 'all' for the question asked, the votes locked, the reveal to a room that called it
 * and to one that missed, and the explanation, or 'few' for the question asked and the reveal to a room that missed. The
 * screens that are not a question (the lobby, the title and the rest) are measured on request.
 */
export async function sweepStage(browser, url, look, art, { full = false, beats = 'all', canvas = CANVASES[0], reducedMotion = false, reducedTransparency = false, screens = true, minFrames = 30, patterns = true } = {}) {
  const flags = [canvas.id !== 'wide' ? canvas.id : null, reducedMotion ? 'reduced motion' : null, reducedTransparency ? 'reduced transparency' : null].filter(Boolean).join(', ');
  const book = ledger(`${look} on the big screen (${art}${flags ? `, ${flags}` : ''})`);
  const context = await newContext(browser, { width: canvas.width, height: canvas.height }, reducedMotion ? { reducedMotion: 'reduce' } : {});
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  if (reducedTransparency) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  }
  await openHost(page, url, `&look=${look}${art === 'drawn' ? '&art=drawn' : ''}`);
  if (art === 'picture') {
    await page.waitForFunction(() => document.documentElement.getAttribute('data-look-art-stage') === 'ai');
    // The run measures the picture only if the picture is on the page, decoded.
    await page.waitForFunction(() => {
      const img = document.querySelector('.look-stage[data-art="ai"] .look-slot__picture');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    });
  } else {
    assert.equal(await page.locator('.look-slot__picture').count(), 0, `${look}: the drawn set is showing, so this run measures the set`);
  }
  assert.equal(await lookOf(page), rootFor(look));
  await exposeStore(page);
  const everyCard = await pickCards(page);
  assert.ok(everyCard.length >= 10, `the bank gave the sweep its cards (${everyCard.length})`);
  // Every topic pattern family is drawn behind a real question in every sweep (VOF-94), the longest question of each family, so a
  // pattern that took a word under AA would show on the card most likely to lose it. A viewer who asks for less transparency sees none.
  const familyCards = patterns ? await pickFamilyCards(page) : [];
  assert.ok(!patterns || familyCards.length === 14, `a card for every pattern family (${familyCards.length})`);
  const cards = [...(full ? everyCard : everyCard.filter(isLeanCard)), ...familyCards];
  // A picture holds still. The drawn set loops, so it is read at four points of every loop. Reduced motion stops the loops.
  const phases = art === 'picture' || reducedMotion ? [0.3] : [0, 0.25, 0.5, 0.75];
  const options = { categories: STAGE_CATEGORIES, phases, kindOf: stageKind };
  for (const card of cards) {
    const where = `${card.kind} ${card.why} ${card.id}`;
    const withPattern = card.family ? { ...options, pattern: { surface: 'stage', family: card.family, expect: !reducedTransparency } } : options;
    await framePosed(page, canvas.format, card.question);
    await measureFrame(page, book, `${where} posed`, { ...withPattern, arrival: !reducedMotion });
    if (beats === 'all') {
      await frameLocked(page, canvas.format, card.question);
      await measureFrame(page, book, `${where} locked`, withPattern);
      await frameRevealed(page, canvas.format, card.question, { room: 'right' });
      await measureFrame(page, book, `${where} revealed to a room that called it`, withPattern);
    }
    await frameRevealed(page, canvas.format, card.question, { room: 'wrong' });
    await measureFrame(page, book, `${where} revealed to a room that missed`, withPattern);
    if (beats === 'all' && card.why === 'longest') {
      await frameRevealed(page, canvas.format, card.question, { room: 'wrong', beat: 'explaining' });
      await measureFrame(page, book, `${where} explained`, withPattern);
    }
  }
  if (screens) {
    for (const name of SCREENS) {
      await frameScreen(page, canvas.format, name);
      // The topic pattern follows a question and nothing else, so no screen that is not one draws it.
      await measureFrame(page, book, name, { ...options, kindOf: async () => null, pattern: { surface: 'stage', expect: false } });
    }
  }
  await context.close();
  settleBook(book, { minFrames, families: patterns && !reducedTransparency ? familyCards.map((card) => card.family) : null });
}

/**
 * Setup, as a host meets it: the ready screen, More options, the Look picker with a still of each look and the pick on its
 * sample question, and the quick setups. A host wears a look by the pick the device remembers, so the pick is set before
 * the page loads. Setup itself keeps Today's navy in every look, and the sample's words are measured with the rest. Today is
 * swept too, since the Look button and the picker are new in its setup.
 */
export async function sweepSetup(browser, url, look, { size = { width: 1920, height: 1080 }, reducedTransparency = false } = {}) {
  const flags = [`${size.width}x${size.height}`, reducedTransparency ? 'reduced transparency' : null].filter(Boolean).join(', ');
  const book = ledger(`${look} setup (${flags})`);
  const context = await newContext(browser, size);
  if (look !== 'today') await context.addInitScript((pick) => { try { localStorage.setItem('vof:show-look', pick); } catch { /* storage may be blocked */ } }, look);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  if (reducedTransparency) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  }
  await page.goto(`${url}/?room=${roomCode()}&host=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="screen-router"]');
  assert.equal(await lookOf(page), rootFor(look), `${look}: the page wears the look the device remembers`);
  const options = { categories: STAGE_CATEGORIES, phases: [0.3], kindOf: async () => null };
  await page.getByRole('heading', { name: 'Your game is ready', exact: true }).waitFor();
  await settle(page, 1200);
  await measureFrame(page, book, 'the ready screen', options);
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.locator('[data-view="sheet"]').waitFor();
  await settle(page, 900);
  await measureFrame(page, book, 'More options', options);
  await page.locator('[data-role="setup-look"]').click();
  await page.locator('[data-view="looks"]').waitFor();
  await settle(page, 1400);
  assert.equal(await page.locator('[data-look-option] .look-thumb').count(), 4, `${look}: the picker shows a still of each of the four looks`);
  assert.equal(await page.locator(`.look-sample[data-sample="${look}"]`).count(), 1, `${look}: and the pick on its sample question`);
  await measureFrame(page, book, 'the Look picker', options);
  // The topic patterns switch sits under the four cards, on by default, and reads at AA in both of its states.
  const toggle = page.getByRole('switch', { name: 'Topic patterns' });
  assert.equal(await toggle.getAttribute('aria-checked'), 'true', `${look}: topic patterns are on by default`);
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-checked'), 'false', `${look}: the switch turns them off`);
  await settle(page, 600);
  await measureFrame(page, book, 'the Look picker with patterns off', options);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('[data-view="sheet"]').waitFor();
  await page.getByRole('button', { name: 'Quick setups', exact: true }).click();
  await page.locator('[data-view="setups"]').waitFor();
  await settle(page, 900);
  await measureFrame(page, book, 'Quick setups', options);
  await context.close();
  settleBook(book, { kinds: [], minFrames: 5 });
}

/**
 * The phone, one look. A phone draws its set unless it is asked for the picture. `beats` is 'all' for the vote, the answer
 * sent, the stamp for a right answer, the explanation and the stamp for a wrong one, or 'few' for the vote, the stamp for a
 * wrong answer and the explanation.
 */
export async function sweepPhone(browser, url, look, size, { art = null, full = false, beats = 'all', reducedMotion = false, reducedTransparency = false, minFrames = 30, extraCss = '', patterns = true } = {}) {
  const flags = [art ? `art=${art}` : null, reducedMotion ? 'reduced motion' : null, reducedTransparency ? 'reduced transparency' : null].filter(Boolean).join(', ');
  const book = ledger(`${look} on a ${size.id} phone${flags ? ` (${flags})` : ''}`);
  const code = roomCode();
  const host = await openRelayHost(browser, url, code);
  const everyCard = await pickCards(host.page);
  // Every topic pattern family behind a real question on the phone too (VOF-94), the longest question of each.
  const familyCards = patterns ? await pickFamilyCards(host.page) : [];
  assert.ok(!patterns || familyCards.length === 14, `a card for every pattern family (${familyCards.length})`);
  const cards = [...(full ? everyCard : everyCard.filter(isLeanCard)), ...familyCards];
  const { context, page: phone, deviceId } = await joinPhone(browser, url, { code, look, art, size, reducedMotion, reducedTransparency, extraCss });
  assert.equal(await lookOf(phone), rootFor(look), `${look}: the phone wears the look its link names`);
  if (look !== 'today') assert.equal(await phone.locator(art === 'ai' ? '.look-phone[data-art="ai"]' : '.look-phone[data-art="drawn"]').count(), 1, `${look}: the phone shows the ${art === 'ai' ? 'picture' : 'drawn set'}`);
  const options = { categories: PHONE_CATEGORIES, phases: [0.3], kindOf: phoneKind };
  const take = (label, card = null) => measureFrame(phone, book, label, card?.family ? { ...options, pattern: { surface: 'phone', family: card.family, expect: !reducedTransparency } } : options);
  await take('waiting for the show');
  const answered = () => phone.evaluate(() => Boolean(document.querySelector('[data-role="phone-dock"][data-answered="true"], [data-role="phone-choice-receipt"]')) || /Your answer is in/i.test(document.body.innerText));
  const sent = async (where) => {
    await phone.waitForFunction(() => Boolean(document.querySelector('[data-role="phone-dock"][data-answered="true"], [data-role="phone-choice-receipt"]')) || /Your answer is in/i.test(document.body.innerText), null, { timeout: 15_000 });
    await settle(phone, 500);
    assert.equal(await answered(), true, `${where}: the phone shows its answer was sent`);
  };
  for (const card of cards) {
    const where = `${card.kind} ${card.why} ${card.id}`;
    await hostAsk(host.page, card.question);
    await phoneVoteReady(phone, card.question);
    await take(`${where} vote`, card);
    if (beats === 'all') {
      await hostVotes(host.page, card.question, deviceId, 'right');
      await sent(where);
      await take(`${where} answer sent`, card);
      await hostReveals(host.page, phone);
      await take(`${where} stamped right`, card);
      await hostAdvances(host.page, phone);
      await take(`${where} explained`, card);
      await hostAsk(host.page, card.question);
      await phoneVoteReady(phone, card.question);
    }
    await hostVotes(host.page, card.question, deviceId, 'wrong');
    await sent(where);
    await hostReveals(host.page, phone);
    await take(`${where} stamped wrong`, card);
    if (beats === 'few') {
      await hostAdvances(host.page, phone);
      await take(`${where} explained`, card);
    }
  }
  for (const name of ['leaderboard', 'closing']) {
    await hostScreenForPhone(host.page, phone, name);
    await take(name);
  }
  await context.close();
  await host.context.close();
  settleBook(book, { minFrames, families: patterns && !reducedTransparency ? familyCards.map((card) => card.family) : null });
}

/**
 * Solo play on a phone (/play), which wears Today and draws the topic pattern at the phone's strength (VOF-94). A few questions of
 * every topic, each measured at its vote and at the reveal that carries the verdict and the reason. Solo is not told which question
 * it is on, so each frame asks only that some pattern is behind it.
 */
export async function sweepSolo(browser, url, phone, { perTopic = 2, minFrames = 30 } = {}) {
  const book = ledger(`solo play on a ${phone.id} phone`);
  const context = await newContext(browser, { width: phone.width, height: phone.height }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(`${url}/play`, { waitUntil: 'load' });
  await page.locator('[data-role="solo-topics"]').waitFor();
  assert.equal(await lookOf(page), null, 'solo wears Today');
  const topics = await page.locator('[data-topic]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-topic')));
  assert.equal(topics.length, 10, `solo offers its ten topics (${topics.join(', ')})`);
  const options = { categories: PHONE_CATEGORIES, phases: [0.3], kindOf: phoneKind, pattern: { surface: 'phone', family: null, expect: true } };
  for (const topic of topics) {
    // Each topic starts from the topics screen on a fresh page, so one topic's walk never decides where the next begins.
    await page.goto(`${url}/play`, { waitUntil: 'load' });
    await page.locator('[data-role="solo-topics"]').waitFor();
    await page.locator(`[data-topic="${topic}"]`).click();
    for (let n = 1; n <= perTopic; n += 1) {
      await page.locator('[data-role="phone-vote-container"]').waitFor();
      // Solo's screens fade in with the page's own animations, which the meter cannot finish for it, so each frame is given its time first.
      await settle(page, 1200);
      await measureFrame(page, book, `${topic} question ${n} vote`, options);
      const choice = page.locator('[data-role="phone-vote-container"] [data-choice]').filter({ visible: true }).first();
      // An order question is arranged, not tapped, and the walk through a topic does not need one.
      if (!(await choice.count())) break;
      await choice.click();
      await page.locator('[data-role="phone-reveal"][data-screen="combined"]').waitFor();
      await settle(page, 1200);
      await measureFrame(page, book, `${topic} question ${n} reveal`, options);
      await page.locator('[data-action="solo-next"]').click();
    }
  }
  await context.close();
  settleBook(book, { kinds: [], minFrames });
}
