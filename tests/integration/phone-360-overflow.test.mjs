import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startVite, wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';
import { chromium } from 'playwright';

// Coordinator follow-up to the premium-phone-fix pass: nothing had proven 360-wide coverage.
// Real Vite dev server plus a real host+phone room pair (the same direct-store-drive pattern
// phone-layout-fixes.test.mjs and screen-atlas.mjs already use), all at a real 360x780 viewport,
// asserting every real control's and text element's own rendered edge stays inside the viewport
// on every phone screen visited (see the note below on why the shell's own scrollWidth cannot be
// trusted for this).

const VIEWPORT = { width: 360, height: 780 };

// The phone shell nests overflow: hidden at several levels on purpose (.phone-live-shell,
// .remote-clicker, the finite-screen content box), each of which clips its own children before their
// size can enlarge its parent's scrollWidth. That makes scrollWidth on any single ancestor
// unreliable: a first version of this file measured document.documentElement, forced a button to
// 500px wide, and stayed GREEN, because the remote's own overflow: hidden had already absorbed
// it two levels down. Measuring every real element's own rendered edge instead (the same
// rect.right <= viewport.width pattern QUEUED-LAYOUT-1 in phone-layout-fixes.test.mjs already
// uses) catches an overflowing element regardless of how many clipping ancestors sit between it
// and the document: verified RED on the same 500px mutation this file's comment used to describe
// as undetected.
// Fresh-review finding: this only ever measured focusable controls, so the 34px locked-answer
// text (F-05) and the reveal's points chip (F-35), neither one a button, a, or input, could run
// off the edge with nothing here to catch it.
const OVERFLOW_SELECTOR = 'button, a, input, [role="button"], [data-role="phone-choice-receipt"] strong, [data-role="phone-no-answer-receipt"] strong, [data-role="canonical-verdict"], [data-role="phone-reveal-points"], [data-role="phone-reveal-said"]';

function noHorizontalOverflow(page, viewportWidth) {
  return page.evaluate(({ width, selector }) => {
    const offenders = [];
    for (const el of document.querySelectorAll(selector)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || el.offsetParent === null) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > width + 1 || rect.left < -1) {
        offenders.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} spans ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} (viewport ${width}px)`);
      }
    }
    return offenders;
  }, { width: viewportWidth, selector: OVERFLOW_SELECTOR });
}

async function assertNoOverflow(page, label, viewportWidth = 360) {
  const offenders = await noHorizontalOverflow(page, viewportWidth);
  assert.deepEqual(offenders, [], `${label}: ${offenders.length} control(s) run off the 360-wide viewport: ${offenders.join(', ')}`);
}

async function openRoom(browser, url, room, questionKinds) {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const phoneContext = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await hostContext.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const host = await hostContext.newPage();
  const phone = await phoneContext.newPage();
  await host.goto(`${url}/?room=${room}&host=1`);
  await host.waitForSelector('[data-testid="screen-router"]');
  await host.evaluate(async ({ kinds, sessionId }) => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    window.__overflowStore = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
    const byKind = kinds.map((kind) => vaxOrFictionDeck.questions.find((q) => q.kind === kind)).filter(Boolean);
    const initial = window.__overflowStore.getInitialState();
    window.__overflowStore.setState({
      ...initial,
      sessionId,
      phase: 'lobby',
      slideIndex: -1,
      run: [initial.run.find((slide) => slide.type === 'title'), ...byKind],
      offlineMode: false,
      interactionMode: 'polling',
      timer: { ...initial.timer, enabled: false, visible: false },
    });
  }, { kinds: questionKinds, sessionId: room });
  await phone.goto(`${url}/join?room=${room}`);
  await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Overflow Player');
  await phone.locator('button[type="submit"]').click();
  await phone.waitForSelector('[data-role="phone-waiting"]');
  return { hostContext, phoneContext, host, phone };
}

async function advanceToSlide(host, targetIndex) {
  for (let i = 0; i < 4 * targetIndex + 4; i++) {
    const state = await host.evaluate(() => {
      window.__overflowStore.getState().dispatch({ type: 'ADVANCE' });
      const s = window.__overflowStore.getState();
      return { phase: s.phase, slideIndex: s.slideIndex };
    });
    if (state.slideIndex === targetIndex && state.phase === 'entering') return;
  }
  throw new Error(`could not reach slide ${targetIndex} in 'entering' phase`);
}

let child;
let url;
let browser;

before(async () => {
  ({ child, url } = await startVite());
  browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
});

after(async () => {
  if (browser) { try { await browser.close(); } catch { /* best-effort teardown */ } }
  if (child) { try { child.kill('SIGTERM'); } catch { /* best-effort teardown */ } }
});

test('join screens have no horizontal overflow at 360 wide', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    // No ?room= param: PhoneJoin's code-entry branch (PhoneJoin.tsx's `if (defaultRoomCode)`
    // check is false), the actual first screen a scanned link with no room in it renders.
    await page.goto(`${url}/join`);
    await page.waitForSelector('[data-role="phone-join"]');
    await assertNoOverflow(page, 'join code-entry');
    await page.goto(`${url}/join?room=OVFL360A`);
    await page.waitForSelector('[data-role="phone-join"]');
    await assertNoOverflow(page, 'join name-entry');
  } finally {
    await context.close();
  }
});

test('the estimate vote screen (its range grid) has no horizontal overflow at 360 wide', { timeout: 60_000 }, async () => {
  const { hostContext, phoneContext, host, phone } = await openRoom(browser, url, 'OVFL360B', ['estimate']);
  try {
    await advanceToSlide(host, 1);
    await phone.waitForSelector('[data-role="phone-vote-container"]');
    await phone.waitForTimeout(200);
    await assertNoOverflow(phone, 'estimate vote (range grid)');
  } finally {
    await hostContext.close();
    await phoneContext.close();
  }
});

test('binary and order vote, locked and reveal screens have no horizontal overflow at 360 wide', { timeout: 90_000 }, async () => {
  const { hostContext, phoneContext, host, phone } = await openRoom(browser, url, 'OVFL360C', ['binary', 'order']);
  try {
    for (const kind of ['binary', 'order']) {
      await advanceToSlide(host, kind === 'binary' ? 1 : 2);
      await phone.waitForSelector('[data-role="phone-vote-container"]');
      await phone.waitForTimeout(200);
      await assertNoOverflow(phone, `${kind} vote`);
      const choice = phone.locator('[data-choice]').filter({ visible: true }).first();
      if (await choice.count()) await choice.click();
      else await phone.locator('[data-action="submit-order"]').filter({ visible: true }).click();
      await host.evaluate(() => window.__overflowStore.getState().dispatch({ type: 'LOCK_VOTES' }));
      // Fresh-review finding: a fixed wait can pass without actually looking, since it proves
      // nothing about whether the locked markup ever mounted. Waiting on the real element it
      // asserts against next: order keeps its locked receipt, and binary's answer targets lock in place.
      await phone.waitForSelector(kind === 'order' ? '[data-role="phone-choice-receipt"][data-locked="true"]' : '[data-role="phone-dock"][data-state="locked"]');
      await assertNoOverflow(phone, `${kind} locked`);
      await host.evaluate(() => window.__overflowStore.getState().dispatch({ type: 'REVEAL' }));
      await phone.waitForSelector('[data-role="phone-reveal"]');
      await assertNoOverflow(phone, `${kind} reveal`);
    }
  } finally {
    await hostContext.close();
    await phoneContext.close();
  }
});

test('closing recap has no horizontal overflow at 360 wide', { timeout: 60_000 }, async () => {
  const { hostContext, phoneContext, host, phone } = await openRoom(browser, url, 'OVFL360D', ['binary']);
  try {
    await host.evaluate(() => {
      const s = window.__overflowStore.getState();
      window.__overflowStore.setState({ ...s, phase: 'closing', slideIndex: s.run.length - 1 });
    });
    await phone.waitForSelector('[data-role="phone-closing"]', { timeout: 10_000 });
    await assertNoOverflow(phone, 'closing recap');
  } finally {
    await hostContext.close();
    await phoneContext.close();
  }
});

// The room phone close at 360x780 (ClosingPodium on the room frame). A real close carries the room line, a three-place
// podium, your line, three takeaways and Play on your own, and that button must sit fully on screen with nothing to
// scroll, as it already does at 390x844 and 430x932. The fixture is the show deck's first eight questions, every one
// missed by most of the room so the recap draws three takeaways, and a four-player board, once with this phone winning
// and once with it fourth (the longest personal line). On main this scrolled 30 px and the button ended below the fold.
async function openClosingPodium(browser, url, room, rankCase) {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const phoneContext = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await hostContext.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const host = await hostContext.newPage();
  const phone = await phoneContext.newPage();
  await host.goto(`${url}/?room=${room}&host=1`);
  await host.waitForSelector('[data-testid="screen-router"]');
  await host.evaluate(async ({ sessionId }) => {
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
    window.__overflowStore = (await import(loaded('/src/store/game-store.ts'))).useGameStore;
    const { vaxOrFictionDeck } = await import(loaded('/src/data/decks/vax-or-fiction.ts'));
    window.__closingQuestions = vaxOrFictionDeck.questions.slice(0, 8);
    const initial = window.__overflowStore.getInitialState();
    window.__overflowStore.setState({
      ...initial,
      sessionId,
      phase: 'lobby',
      slideIndex: -1,
      run: [initial.run.find((slide) => slide.type === 'title'), ...window.__closingQuestions, { id: 'closing', type: 'closing', title: 'Thanks for playing' }],
      offlineMode: false,
      interactionMode: 'polling',
      timer: { ...initial.timer, enabled: false, visible: false },
    });
  }, { sessionId: room });
  await phone.goto(`${url}/join?room=${room}`);
  await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Podium Player');
  await phone.locator('button[type="submit"]').click();
  await phone.waitForSelector('[data-role="phone-waiting"]');
  await host.evaluate(({ rankCase }) => {
    const state = window.__overflowStore.getState();
    const [ticket] = Object.keys(state.seenDevices);
    const scores = rankCase === 'won' ? [900, 700, 650, 500] : [900, 800, 700, 640];
    const seenDevices = { [ticket]: { ...state.seenDevices[ticket], score: rankCase === 'won' ? scores[0] : scores[3], answered: 8, correct: 6, streak: 2, bestStreak: 4 } };
    ['Riley Anderson', 'Sam Okafor', 'Jordan Castillo'].forEach((nickname, index) => {
      seenDevices[`podium-${index}`] = { nickname, team: null, joinedAt: Date.now() - 5000, score: rankCase === 'won' ? scores[index + 1] : scores[index], answered: 8, correct: 6, streak: 0, bestStreak: 3, realityGap: 0, hardQuestionPoints: 0 };
    });
    const questions = {};
    window.__closingQuestions.forEach((question, index) => {
      questions[question.id] = { kind: question.kind, choices: { a: 6, b: 4 }, trueCount: 6, falseCount: 4, correctPct: 30 + index * 5, majorityWrong: true, certainCount: 0, certainWrongCount: 0, confidentlyWrongPct: 0 };
    });
    window.__overflowStore.setState({
      ...state, seenDevices, leaderboardEnabled: true, phase: 'closing', slideIndex: state.run.length - 1,
      roomStats: { questions, accuracy: 62, streak: 1, bestStreak: 4, mythsBusted: 2, swing: 10, certainTotal: 3, certainWrongTotal: 1, votesTotal: 80 },
    });
  }, { rankCase });
  await phone.waitForSelector('[data-role="phone-closing"]', { timeout: 10_000 });
  return { hostContext, phoneContext, phone };
}

test('the room phone close fits 360x780 with Play on your own fully on screen', { timeout: 90_000 }, async () => {
  const failures = [];
  let checked = 0;
  for (const rankCase of ['won', 'fourth']) {
    const { hostContext, phoneContext, phone } = await openClosingPodium(browser, url, `OVFL360P${rankCase === 'won' ? 'W' : 'F'}`, rankCase);
    try {
      await phone.waitForTimeout(400);
      const m = await phone.evaluate(() => {
        const content = document.querySelector('[data-role="phone-content"]');
        const play = document.querySelector('[data-action="closing-play-solo"]');
        return {
          scroll: content.scrollHeight - content.clientHeight,
          playBottom: play ? play.getBoundingClientRect().bottom : null,
          viewportHeight: innerHeight,
          places: document.querySelectorAll('.podium-stand__col').length,
          takeaways: document.querySelectorAll('[data-role="phone-closing-takeaway"]').length,
        };
      });
      checked += 1;
      const label = `closing (${rankCase})`;
      // The fixture has to be the full close, or a pass would prove nothing about the podium.
      if (m.places !== 3 || m.takeaways !== 3) failures.push(`${label}: test setup rendered ${m.places} places and ${m.takeaways} takeaways, expected 3 and 3`);
      if (m.scroll > 1) failures.push(`${label}: ${m.scroll}px to scroll at 360x780`);
      if (m.playBottom === null || m.playBottom > m.viewportHeight + 1) failures.push(`${label}: Play on your own ends at ${m.playBottom}px, below the ${m.viewportHeight}px screen`);
      await assertNoOverflow(phone, label);
    } finally {
      await hostContext.close();
      await phoneContext.close();
    }
  }
  assert.equal(checked, 2, 'both closes were measured');
  assert.deepEqual(failures, []);
});

test('the site about page has no horizontal overflow at 360 wide', { timeout: 30_000 }, async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(`${url}/about`);
    await page.waitForSelector('.site-page');
    await assertNoOverflow(page, 'site about');
  } finally {
    await context.close();
  }
});

// The two states the coordinator named explicitly: the remote top bar with End armed to
// "Tap again to end", and (covered above) the estimate grid. RemotePad is a presentational
// component (no network hook), so it is mounted directly with real props, on the real
// phone-live-shell + remote-shell chrome, rather than driving a full pairing handshake for a
// state its own props can express exactly.
test('the remote top bar with End armed has no horizontal overflow at 360 wide', { timeout: 30_000 }, async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(`${url}/join?room=OVFL360E`);
    await page.waitForSelector('[data-role="phone-join"]');
    const overflow = await page.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
      const loaded = (pathname) => urls.filter((entry) => new URL(entry).pathname === pathname).at(-1) || pathname;
      const ReactModule = await import(loaded('/node_modules/.vite/deps/react.js'));
      const ReactDOMClientModule = await import(loaded('/node_modules/.vite/deps/react-dom_client.js'));
      const React = ReactModule.createElement ? ReactModule : ReactModule.default;
      const ReactDOMClient = ReactDOMClientModule.createRoot ? ReactDOMClientModule : ReactDOMClientModule.default;
      const { RemotePad } = await import(loaded('/src/phone/RemoteSuite.tsx'));
      const pad = {
        statusLine: 'Q3 of 30 · Voting open',
        advanceLabel: 'Next',
        coachLine: null,
        isSetup: false,
        canLock: true,
        canReveal: false,
        onQuestion: true,
        canPause: true,
        pauseLabel: 'Pause',
        showdownFinalists: null,
      };
      const mount = document.createElement('div');
      mount.className = 'phone-live-shell remote-shell';
      document.body.appendChild(mount);
      const root = ReactDOMClient.createRoot(mount);
      const noop = () => {};
      root.render(React.createElement(RemotePad, {
        pad, topic: null, cue: null, joinCode: 'ATLREM09', hostLine: 'Driving room ATLREM09',
        paired: true, hostDown: false, disabled: false, endArmed: true, participants: 12, timerSeconds: 20,
        onAdvance: noop, onBack: noop, onLock: noop, onReveal: noop, onPause: noop, onMute: noop, onEnd: noop, onAwardA: noop, onAwardB: noop,
      }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      // Every real control's own rendered edge, the same check assertNoOverflow uses: .remote-clicker
      // (a nested overflow: hidden ancestor of these controls) would otherwise absorb an
      // overflowing button before mount's own scrollWidth ever saw it.
      const offenders = [];
      for (const el of mount.querySelectorAll('button, a, input, [role="button"]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.right > 360 + 1 || rect.left < -1) offenders.push(`${el.dataset.remoteCommand ?? el.tagName.toLowerCase()} spans ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`);
      }
      const result = { offenders, endText: mount.querySelector('[data-remote-command="END"]')?.textContent };
      root.unmount();
      mount.remove();
      return result;
    });
    assert.equal(overflow.endText, 'Tap again to end', 'End must actually be in its armed state for this check to mean anything');
    assert.deepEqual(overflow.offenders, [], `remote top bar (End armed): control(s) run off the 360-wide viewport: ${overflow.offenders.join(', ')}`);
  } finally {
    await context.close();
  }
});
