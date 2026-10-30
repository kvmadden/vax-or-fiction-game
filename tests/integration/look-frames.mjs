// Frames for the look suites (VOF-93): pages for a host and a phone, and the host's store driven to one beat at a time,
// the way the show itself reaches it. A frame is described by a question object, so the same code drives a card from any
// bundled deck, not only the show deck.
import { finishEntrances } from './look-contrast-meter.mjs';

export const DRAWN = ['studio', 'casefile', 'seventies'];
export const KINDS = ['binary', 'myth-among-three', 'estimate', 'order', 'which-patient'];
export const CANVASES = [
  { id: 'wide', width: 1920, height: 1080, format: 'widescreen' },
  { id: 'square', width: 1200, height: 1200, format: 'square' },
  { id: 'portrait', width: 1080, height: 1920, format: 'portrait' },
];
export const PHONES = [
  { id: '390x844', width: 390, height: 844 },
  { id: '430x932', width: 430, height: 932 },
];

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let roomSeed = 9100 + (process.pid % 100) * 40;
/** A fresh four letter room code, so no two pages in a run share a room. */
export function roomCode() {
  roomSeed += 17;
  let n = roomSeed;
  let code = '';
  for (let i = 0; i < 4; i += 1) { code = ALPHABET[n % ALPHABET.length] + code; n = Math.floor(n / ALPHABET.length); }
  return code;
}

export async function newContext(browser, size = { width: 1920, height: 1080 }, options = {}) {
  const context = await browser.newContext({ viewport: size, ...options });
  await context.addInitScript(() => {
    try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* storage may be blocked */ }
    window.__VOF_JOIN_BASE_URL__ = 'https://vaxorfiction.com';
  });
  return context;
}

export async function settle(page, ms = 500) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await page.waitForTimeout(ms);
}

/** Opens a host page for a room. `extra` is more query string, such as `&look=studio`. */
export async function openHost(page, url, extra = '', code = roomCode()) {
  await page.goto(`${url}/?room=${code}&host=1${extra}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="screen-router"]');
  return code;
}

/** Reaches the app's own store, decks, kind helpers and card population from the page, as window.__lo. */
export async function exposeStore(page) {
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

/**
 * The cards a sweep walks, taken from the whole bank (the review packet and every bundled deck): for each kind its longest
 * and its shortest card, plus one longest card for every distinct shape that changes the layout (the number of replies
 * for a better reply question, the number of steps for an order) and, for a number, the card with the widest range label.
 * Returns plain question objects.
 */
export async function pickCards(page) {
  return page.evaluate((kindList) => {
    const { kinds, population } = window.__lo;
    const picked = [];
    const seen = new Set();
    const add = (card, why) => {
      if (!card || seen.has(card.id)) return;
      seen.add(card.id);
      picked.push({ id: card.id, kind: kinds.questionKind(card.question), why, question: card.question });
    };
    for (const kind of kindList) {
      const byLength = population.cardsForKindByLengthDesc(kind);
      if (!byLength.length) continue;
      add(byLength[0], 'longest');
      add(byLength[byLength.length - 1], 'shortest');
      const shape = (card) => (kind === 'which-patient' ? (card.question.choices ?? []).length : kind === 'order' ? (card.question.steps ?? []).length : 0);
      const shapes = new Set(byLength.map(shape));
      if (shapes.size > 1) for (const n of [...shapes].sort()) add(byLength.find((card) => shape(card) === n), `${n} ${kind === 'order' ? 'steps' : 'replies'}`);
      // A number's ranges can run to "25% to under 50%", the widest label a poll row has to hold.
      if (kind === 'estimate') {
        const widest = (card) => Math.max(0, ...(card.question.estimate?.ranges ?? []).map((r) => String(r.label ?? '').length));
        add([...byLength].sort((a, b) => widest(b) - widest(a))[0], 'widest label');
      }
    }
    return picked;
  }, KINDS);
}

/**
 * One card for every topic pattern family (VOF-94): the question with the most words in it, from the show deck and the
 * flagship (the show deck has no big picture question), so every family is drawn behind a real question in every sweep and
 * the longest of them is the one that would show a pattern costing a word its contrast. Returns plain question objects.
 */
export async function pickFamilyCards(page) {
  return page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
    const { familyForStatement } = await import(u('/src/looks/patterns/topic-map.ts'));
    const flagship = (await import(u('/src/data/decks/flagship.ts'))).flagshipDeck;
    const { deck, kinds } = window.__lo;
    const words = (q) => [q.statement, q.scenario, ...(q.choices ?? []).map((c) => c.label ?? c), ...(q.statements ?? []), ...(q.steps ?? []), ...((q.estimate?.ranges ?? []).map((r) => r.label ?? ''))].filter(Boolean).join(' ').length;
    const best = new Map();
    for (const source of [deck, flagship]) {
      for (const q of source.questions) {
        const family = familyForStatement(q.statement);
        if (family && (!best.get(family) || words(q) > words(best.get(family)))) best.set(family, q);
      }
    }
    return [...best].map(([family, question]) => ({ id: question.id, kind: kinds.questionKind(question), why: `family ${family}`, family, question }))
      .sort((a, b) => a.family.localeCompare(b.family));
  });
}

const BASE = { offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true };

/**
 * Waits until the page itself says it is showing this question in this beat, and returns the kind the page reports.
 * The kind, the beat and the question's id are read from the DOM, never from the caller's label, so a frame that is still
 * the previous beat cannot be measured as this one.
 */
export async function expectBeat(page, question, stageBeat) {
  const kind = await page.evaluate((question) => window.__lo.kinds.questionKind(question), question);
  await page.waitForFunction(({ id, kind, stageBeat }) => {
    const shell = document.querySelector('.question-shell');
    if (!shell || shell.getAttribute('data-kind') !== kind || shell.getAttribute('data-stage-beat') !== stageBeat) return false;
    // Wherever the page names the question, it names this one. A kind that names it nowhere in a beat is not held to it.
    return [...document.querySelectorAll('[data-question-id]')].every((el) => el.getAttribute('data-question-id') === id);
  }, { id: question.id, kind, stageBeat });
  return kind;
}

/** The question asked: an order question enters from the title, which is what arms its scramble. */
export async function framePosed(page, format, question) {
  await page.evaluate(({ format, question }) => {
    const { store, kinds } = window.__lo;
    const base = { ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, formatId: format };
    if (kinds.questionKind(question) === 'order') {
      store.setState({ ...base, phase: 'title', run: [{ id: 'title', type: 'title' }, question], slideIndex: 0 });
      store.getState().dispatch({ type: 'ADVANCE' });
      return;
    }
    store.setState({ ...base, phase: 'entering', run: [{ id: 'title', type: 'title' }, question], slideIndex: 1, votesLocked: false });
  }, { format, question });
  await page.waitForFunction(() => document.querySelectorAll('[data-role="arrival-kicker"]').length === 1);
  await page.locator('.question-shell .question-stage-copy h1').first().waitFor();
  await expectBeat(page, question, 'posed');
  await settle(page, 400);
}

/** Votes locked, the room's tallies showing on the answers. */
export async function frameLocked(page, format, question) {
  await page.evaluate(({ format, question, BASE }) => {
    const { store, kinds } = window.__lo;
    const right = kinds.rightToken(question);
    const options = kinds.questionKind(question) === 'order' ? [right, right.split('-').reverse().join('-')] : kinds.kindOptions(question).map((o) => o.token);
    const votes = {}; const voters = {}; let n = 0;
    options.forEach((token, i) => { votes[token] = [7, 3, 5, 2, 1, 1][i % 6]; });
    for (const [token, count] of Object.entries(votes)) for (let k = 0; k < count; k += 1) voters[`v-${n++}`] = { choice: token };
    store.setState({ ...store.getInitialState(), ...BASE, phase: 'locked', formatId: format, run: [{ id: 'title', type: 'title' }, question], slideIndex: 1, votesLocked: true, pollVotes: { [question.id]: votes }, pollVoters: { [question.id]: voters } });
  }, { format, question, BASE });
  await page.waitForFunction(() => document.querySelectorAll('.question-shell .question-stage-copy h1').length > 0);
  await expectBeat(page, question, 'locked');
  await settle(page, 450);
}

/** A locked room, then REVEAL. `room` is 'right' or 'wrong'. `beat` is 'revealed' or 'explaining'. */
export async function frameRevealed(page, format, question, { room = 'wrong', beat = 'revealed' } = {}) {
  const side = room;
  await page.evaluate(({ format, question, side, beat, BASE }) => {
    const { store, kinds } = window.__lo;
    const right = kinds.rightToken(question);
    const options = kinds.questionKind(question) === 'order' ? [right, right.split('-').reverse().join('-')] : kinds.kindOptions(question).map((o) => o.token);
    const wrong = options.find((t) => t !== right);
    const votes = {};
    if (kinds.questionKind(question) === 'estimate') options.forEach((t, i) => { votes[t] = t === right ? (side === 'right' ? 9 : 2) : [1, 3, 5, 2, 1][i % 5]; });
    else for (const token of new Set(options)) votes[token] = token === (side === 'right' ? right : wrong) ? 9 : 3;
    const voters = {}; let n = 0;
    for (const [token, count] of Object.entries(votes)) for (let k = 0; k < count; k += 1) voters[`v-${n++}`] = { choice: token };
    store.setState({ ...store.getInitialState(), ...BASE, phase: 'locked', formatId: format, run: [{ id: 'title', type: 'title' }, question], slideIndex: 1, votesLocked: true, pollVotes: { [question.id]: votes }, pollVoters: { [question.id]: voters } });
    store.getState().dispatch({ type: 'REVEAL' });
    if (beat === 'explaining') store.getState().dispatch({ type: 'ADVANCE' });
  }, { format, question, side, beat, BASE });
  if (beat === 'explaining') await page.waitForFunction(() => document.querySelectorAll('.question-explanation-copy').length === 1);
  else await page.waitForFunction(() => document.querySelectorAll('.question-result-card').length === 1);
  await expectBeat(page, question, beat === 'explaining' ? 'explanation' : 'result');
  await settle(page, 500);
}

const PLAYERS = [['Jordan', 480, 3, 3], ['Priya', 410, 3, 2], ['Sam', 290, 3, 2], ['Morgan', 180, 3, 1], ['Alex', 90, 3, 1]];

function showdownDevices() {
  return {
    a: { nickname: 'Jordan', team: null, joinedAt: 1, score: 480, answered: 3, correct: 3, streak: 3, bestStreak: 3, hardQuestionPoints: 0, realityGap: 0 },
    b: { nickname: 'Priya', team: null, joinedAt: 2, score: 410, answered: 3, correct: 2, streak: 0, bestStreak: 2, hardQuestionPoints: 0, realityGap: 0 },
    c: { nickname: 'Sam', team: null, joinedAt: 3, score: 290, answered: 3, correct: 2, streak: 0, bestStreak: 2, hardQuestionPoints: 0, realityGap: 0 },
  };
}

/** The screens that are not a question: the lobby, the title, the instructions, the leaderboard, the showdown and the closing. */
export async function frameScreen(page, format, name) {
  await page.evaluate(({ format, name, PLAYERS, devicesShowdown }) => {
    const { store, deck } = window.__lo;
    const base = { ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, formatId: format };
    const q = (id) => deck.questions.find((item) => item.id === id);
    const devices = {};
    PLAYERS.forEach(([nickname, score, answered, correct], i) => {
      devices[`d-${nickname.toLowerCase()}`] = { nickname, rawNickname: nickname, team: null, joinedAt: 1_000_000 - i * 1000, score, answered, correct, streak: correct, bestStreak: correct, realityGap: 0, hardQuestionPoints: 0 };
    });
    if (name === 'lobby') {
      const joined = {};
      PLAYERS.forEach(([nickname], i) => { joined[`d-${nickname.toLowerCase()}`] = { nickname, rawNickname: nickname, team: null, joinedAt: 1_000_000 - i * 1000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 }; });
      store.setState({ ...base, phase: 'lobby', run: [{ id: 'title', type: 'title' }, q('q33')], slideIndex: -1, seenDevices: joined });
    } else if (name === 'title') {
      store.setState({ ...base, phase: 'title', run: [{ id: 'title', type: 'title' }, q('q33')], slideIndex: 0 });
    } else if (name === 'instructions') {
      store.setState({ ...base, phase: 'instructions', run: [{ id: 'title', type: 'title' }, { id: 'instructions', type: 'instructions' }, q('q33')], slideIndex: 1 });
    } else if (name === 'leaderboard') {
      store.setState({ ...base, phase: 'leaderboard', run: [{ id: 'title', type: 'title' }, q('q5'), { id: 'lb', type: 'leaderboard' }], slideIndex: 2, seenDevices: devices });
    } else if (name === 'showdown') {
      store.setState({ ...base, showdownEnabled: true, sessionId: 'sd', modeId: 'demo', run: [{ id: 'title', type: 'title' }, q('q5')], slideIndex: 1, phase: 'revealed', seenDevices: devicesShowdown });
      store.getState().dispatch({ type: 'ENTER_SHOWDOWN' });
      const showdown = store.getState().showdown;
      const [first, second] = showdown.finalists;
      store.setState({ showdown: { ...showdown, predictions: { p1: first.ticket, p2: first.ticket, p3: second.ticket }, predictionCounts: { [first.ticket]: 2, [second.ticket]: 1 } } });
    } else if (name === 'closing') {
      const qs = ['q5', 'q33', 'q13'].map(q);
      const stats = {
        q5: { kind: 'binary', choices: { true: 3, false: 9 }, trueCount: 3, falseCount: 9, correctPct: 75, majorityWrong: false },
        q33: { kind: 'estimate', choices: {}, correctPct: 17, majorityWrong: true },
        q13: { kind: 'myth-among-three', choices: {}, correctPct: 58, majorityWrong: false },
      };
      store.setState({ ...base, phase: 'closing', slideIndex: 3, run: [...qs, { id: 'closing', type: 'closing', title: 'The takeaways' }], roomStats: { accuracy: 50, mythsBusted: 1, streak: 0, bestStreak: 1, votesTotal: 36, questions: stats } });
    } else throw new Error(`unknown screen ${name}`);
  }, { format, name, PLAYERS, devicesShowdown: showdownDevices() });
  const ready = {
    lobby: () => document.querySelectorAll('.lobby-arrivals .lobby-arrival:not(.lobby-arrival--ghost)').length === 5,
    title: () => document.querySelector('[data-testid="screen-router"]')?.getAttribute('data-active-screen') === 'TitleSlide',
    instructions: () => document.querySelector('[data-testid="screen-router"]')?.getAttribute('data-active-screen') === 'InstructionsSlide',
    leaderboard: () => document.querySelector('[data-testid="screen-router"]')?.getAttribute('data-active-screen') === 'Leaderboard',
    showdown: () => Boolean(document.querySelector('[data-role="showdown-lineup"]')),
    closing: () => document.querySelector('[data-testid="screen-router"]')?.getAttribute('data-active-screen') === 'Closing',
  }[name];
  await page.waitForFunction(ready);
  await settle(page, 700);
}

export { finishEntrances };

/* ---- A phone and its host ------------------------------------------------------------------------------------------ */

/** The query that puts a look on a phone, which reads no remembered pick. `art` is 'ai' to ask for the picture, or null. */
export const phoneLookQuery = (look, art = null) => `${look ? `&look=${look}` : ''}${art ? `&art=${art}` : ''}`;

/**
 * The host's page sits in Today and is only the other end of the relay for a phone. `beforeOpen` gets the host's context before its
 * page exists, so a test can stand between the page and the relay (a WebSocket route) from the first frame.
 */
export async function openRelayHost(browser, url, code, extra = '', { beforeOpen = null } = {}) {
  const context = await newContext(browser, { width: 1280, height: 720 });
  if (beforeOpen) await beforeOpen(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await openHost(page, url, extra, code);
  await exposeStore(page);
  await page.evaluate(() => {
    const { store, deck } = window.__lo;
    const q = deck.questions.find((item) => item.id === 'q5');
    const devices = {};
    [['Jordan', 240, 2, 2], ['Sam', 90, 1, 1], ['Morgan', 60, 1, 1], ['Alex', 0, 1, 0]].forEach(([nickname, score, answered, correct], i) => {
      devices[`d-${nickname.toLowerCase()}`] = { nickname, rawNickname: nickname, team: null, joinedAt: 1_000_000 - i * 1000, score, answered, correct, streak: correct ? 1 : 0, bestStreak: correct ? 1 : 0, realityGap: 0, hardQuestionPoints: 0 };
    });
    store.setState({ ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, phase: 'lobby', formatId: 'widescreen', run: [{ id: 'title', type: 'title' }, q], slideIndex: -1, seenDevices: devices });
  });
  return { context, page };
}

/** A phone that has joined the room as a player. Returns its page and the id the host knows it by. */
export async function joinPhone(browser, url, { code, look, art = null, size, nickname = 'Priya', reducedMotion = false, reducedTransparency = false, extraCss = '' }) {
  const context = await newContext(browser, { width: size.width, height: size.height }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...(reducedMotion ? { reducedMotion: 'reduce' } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  if (reducedTransparency) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  }
  await page.goto(`${url}/join?room=${code}${phoneLookQuery(look, art)}`, { waitUntil: 'load' });
  // Extra CSS is for a person trying a value before it is written into a stylesheet. The gate passes none.
  if (extraCss) await page.addStyleTag({ content: extraCss });
  const nameBox = page.getByRole('textbox', { name: /name|nickname/i });
  await nameBox.waitFor();
  await settle(page, 600);
  await nameBox.fill(nickname);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('[data-role="phone-waiting"], .lobby-seat, [data-role="phone-seat"]');
  await settle(page, 900);
  const deviceId = await page.evaluate(() => sessionStorage.getItem('vrc_device_id'));
  return { context, page, deviceId };
}

/** The host asks a question for the phone. An order question enters from the title, which arms its scramble. */
export async function hostAsk(host, question) {
  await host.evaluate((question) => {
    const { store, kinds } = window.__lo;
    const seenDevices = store.getState().seenDevices;
    const base = { ...store.getInitialState(), offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true, formatId: 'widescreen', seenDevices };
    if (kinds.questionKind(question) === 'order') {
      store.setState({ ...base, phase: 'title', run: [{ id: 'title', type: 'title' }, question], slideIndex: 0 });
      store.getState().dispatch({ type: 'ADVANCE' });
      return;
    }
    store.setState({ ...base, phase: 'entering', run: [{ id: 'title', type: 'title' }, question], slideIndex: 1, votesLocked: false });
  }, question);
}

/** The phone's vote screen is up and showing this question, as its own question id says. */
export async function phoneVoteReady(phone, question) {
  await phone.waitForFunction((id) => !document.querySelector('[data-role="phone-reveal"]') && document.querySelector('[data-role="phone-vote-container"]')?.getAttribute('data-question-id') === id, question.id);
  await settle(phone, 900);
}

/** The phone votes, as seen by the host's store. `side` is 'right' or 'wrong'. */
export async function hostVotes(host, question, deviceId, side) {
  await host.evaluate(({ question, deviceId, side }) => {
    const { store, kinds } = window.__lo;
    const right = kinds.rightToken(question);
    const options = kinds.questionKind(question) === 'order' ? [right, right.split('-').reverse().join('-')] : kinds.kindOptions(question).map((o) => o.token);
    const choice = side === 'right' ? right : options.find((t) => t !== right);
    store.getState().dispatch({ type: 'RECORD_VOTE', deviceId, choice, questionId: question.id });
  }, { question, deviceId, side });
}

export async function hostReveals(host, phone) {
  await host.evaluate(() => window.__lo.store.getState().dispatch({ type: 'LOCK_VOTES' }));
  await host.waitForTimeout(300);
  await host.evaluate(() => window.__lo.store.getState().dispatch({ type: 'REVEAL' }));
  await phone.waitForSelector('[data-role="phone-reveal"]');
  await settle(phone, 1200);
}

/** The host moves on from the reveal to the explanation, and the phone shows its explanation header. */
export async function hostAdvances(host, phone) {
  await host.evaluate(() => window.__lo.store.getState().dispatch({ type: 'ADVANCE' }));
  await phone.waitForSelector('[data-role="phone-explanation-header"]');
  await settle(phone, 1000);
}

/** The host moves the room to the leaderboard or the closing, and the phone shows its own version. */
export async function hostScreenForPhone(host, phone, name) {
  if (name === 'leaderboard') {
    await host.evaluate(() => window.__lo.store.setState({ phase: 'leaderboard', slideIndex: 1 }));
    await phone.waitForSelector('[data-role="phone-leaderboard"]');
  } else if (name === 'closing') {
    await host.evaluate(() => {
      const { store, deck } = window.__lo;
      const qs = ['q5', 'q33', 'q13'].map((id) => deck.questions.find((item) => item.id === id));
      const stats = {
        q5: { kind: 'binary', choices: { true: 3, false: 9 }, trueCount: 3, falseCount: 9, correctPct: 75, majorityWrong: false },
        q33: { kind: 'estimate', choices: {}, correctPct: 17, majorityWrong: true },
        q13: { kind: 'myth-among-three', choices: {}, correctPct: 58, majorityWrong: false },
      };
      store.setState({ phase: 'closing', slideIndex: 3, run: [...qs, { id: 'closing', type: 'closing', title: 'The takeaways' }], roomStats: { accuracy: 50, mythsBusted: 1, streak: 0, bestStreak: 1, votesTotal: 36, questions: stats } });
    });
    await phone.waitForSelector('[data-role="phone-closing"], .phone-closing');
  } else throw new Error(`unknown phone screen ${name}`);
  await settle(phone, 1400);
}

/** The cards a lean sweep keeps: the longest of every kind, one of each reply count and step count, and the widest range label. */
export const isLeanCard = (card) => card.why === 'longest' || card.why === 'widest label' || /replies|steps/.test(card.why);

/* ---- The topic pattern (VOF-94) --------------------------------------------------------------------------------------- */

/** The family the page's topic pattern is drawing on a surface right now, or null when no layer is showing. */
export const drawnPattern = (page, surface) => page.evaluate((surface) => {
  const layers = [...document.querySelectorAll(`.topic-pattern${surface ? `[data-surface="${surface}"]` : ''}`)]
    .filter((layer) => !layer.hasAttribute('data-leaving') && getComputedStyle(layer).display !== 'none');
  return layers.length === 1 ? layers[0].dataset.family : null;
}, surface);

/** Waits for the one layer a question draws: its tile has decoded, the layer before it has gone and the layer's fade has begun. */
export async function waitForPattern(page, surface, family) {
  await page.waitForFunction(({ surface, family }) => {
    const layers = [...document.querySelectorAll(`.topic-pattern[data-surface="${surface}"]`)];
    const drawing = layers.filter((layer) => !layer.hasAttribute('data-leaving'));
    return layers.length === 1 && drawing.length === 1 && (!family || drawing[0].dataset.family === family);
  }, { surface, family }, { timeout: 15_000 });
}
