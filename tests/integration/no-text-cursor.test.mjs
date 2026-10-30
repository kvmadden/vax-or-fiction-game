// no-text-cursor.md. The owner hates the I-beam pointer showing up on anything he is not
// typing into. src/styles/cursor-base.css sets a real base cursor on the document: default on
// html (inherited, not forced onto every descendant), pointer on real controls, text only on
// real text entry. This walks every element on every named surface and fails on a stray
// text/auto cursor, a visible enabled button/link stuck on default, a control descendant whose
// own computed cursor disagrees with its control's, or a control whose real hover point (via
// elementFromPoint) lands on something reporting a different cursor.
//
// Modeled on site-touch-targets.test.mjs for the shared Vite-child + Playwright pattern, and on
// screen-atlas.mjs for the direct-store-drive pattern that reaches host/phone states without
// animating a full game through (openHostPage/setHostState/patchHostState/dispatchHost below are
// the same helpers, trimmed to only what this file needs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { testHarnessNeverOrphansViteOnMissingBrowser, withViteAndBrowser } from './render-harness.mjs';

testHarnessNeverOrphansViteOnMissingBrowser();

// ---------------------------------------------------------------------------
// The walker: runs inside the page, classifies every visible element, and reports failures.
// ---------------------------------------------------------------------------

async function walkCursors(page) {
  return page.evaluate(() => {
    const TEXT_INPUT_TYPES = new Set(['text', 'email', 'search', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);
    const INTERACTIVE_INPUT_TYPES = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset']);
    const INTERACTIVE_ROLES = new Set(['button', 'link', 'tab', 'switch', 'checkbox', 'radio', 'option', 'menuitem']);

    const isTextEntry = (el) => {
      const tag = el.tagName;
      if (tag === 'TEXTAREA') return true;
      if (el.isContentEditable) return true;
      if (tag === 'INPUT') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        return TEXT_INPUT_TYPES.has(type);
      }
      return false;
    };

    const isEnabledButtonOrLink = (el) => {
      const tag = el.tagName;
      if (tag === 'A') return el.hasAttribute('href');
      if (tag === 'BUTTON') return !el.disabled;
      if (tag === 'INPUT') {
        const type = (el.getAttribute('type') || '').toLowerCase();
        return (type === 'button' || type === 'submit' || type === 'reset') && !el.disabled;
      }
      const role = el.getAttribute('role');
      if (role === 'button' || role === 'link') return el.getAttribute('aria-disabled') !== 'true';
      return false;
    };

    // A label toggles state only when it wraps a checkbox/radio directly (cursor-base.css's own
    // selector: label:has(> input[type="checkbox"|"radio"])). A label pointing at a text field
    // via `for` (Room code, PhoneJoin.tsx) only focuses it and keeps the arrow.
    const isToggleLabel = (el) => el.tagName === 'LABEL' && !!el.querySelector(':scope > input[type="checkbox"], :scope > input[type="radio"]');

    // The broader "real control" set this file's descendant/hit-test checks walk from. Wider
    // than isEnabledButtonOrLink (which only drives the missing-pointer check below): also
    // selects, native interactive inputs and ARIA-role controls, matching cursor-base.css's own
    // pointer selector list.
    const isInteractiveControl = (el) => {
      if (isEnabledButtonOrLink(el)) return true;
      const tag = el.tagName;
      if (tag === 'SUMMARY') return true;
      if (isToggleLabel(el)) return true;
      if (tag === 'SELECT') return true;
      if (tag === 'INPUT') {
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (INTERACTIVE_INPUT_TYPES.has(type)) return true;
      }
      const role = el.getAttribute('role');
      if (role && INTERACTIVE_ROLES.has(role)) return true;
      return false;
    };

    const visible = (el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const describe = (el) => {
      const role = el.getAttribute('data-role') || el.getAttribute('role');
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
      const id = el.id ? `#${el.id}` : '';
      return `${el.tagName.toLowerCase()}${id}${role ? `[role/data-role=${role}]` : ''}${cls ? `.${cls}` : ''}`;
    };

    const all = [...document.querySelectorAll('*')];
    let checked = 0;
    const strayTextOrAuto = [];
    const missingPointer = [];
    for (const el of all) {
      if (!visible(el)) continue;
      checked += 1;
      const cursor = getComputedStyle(el).cursor;
      if ((cursor === 'text' || cursor === 'auto') && !isTextEntry(el)) {
        strayTextOrAuto.push({ el: describe(el), cursor });
      }
      // An inline style.cursor is a component's own explicit, already-reviewed choice (for
      // example a host-display-only answer button that is deliberately non-interactive: type
      // button, but its own onClick no-ops when not interactive). The base rule in
      // src/styles/cursor-base.css only fills in what nothing else set, so it is not this
      // check's job to second-guess an author who already set cursor on purpose. What it does
      // catch: any enabled button/link that fell through to the base default with NO cursor
      // authored anywhere (inline OR via a class rule), which is exactly the bug class the base
      // rule exists to close.
      if (isEnabledButtonOrLink(el) && cursor === 'default' && !el.style.cursor) {
        missingPointer.push({ el: describe(el), cursor });
      }
    }

    // Descendant + hit-test check: a control reporting the right cursor on itself is not enough.
    // Its unstyled children (a text span, an svg, an aria-hidden decoration) must inherit that
    // same cursor, and the real point a person hovers (the control's own centre) must resolve,
    // via elementFromPoint, to something agreeing with it. This is exactly what `* { cursor:
    // default }` broke (0709b71 review): it forced `default` directly onto every element,
    // including a button's own child spans, so the computed cursor over most of a button's own
    // area was `default` even though the button itself correctly reported `pointer`.
    const descendantMismatches = [];
    const hitTestMismatches = [];
    let controlsSeen = 0;
    let hitTested = 0;
    let hitSkippedOffscreen = 0;
    let hitSkippedCovered = 0;
    for (const control of all) {
      if (!visible(control) || !isInteractiveControl(control)) continue;
      controlsSeen += 1;
      const controlCursor = getComputedStyle(control).cursor;
      // A nested control or text-entry element, and everything inside it (a checkbox's own
      // label text, an input's own placeholder decoration), owns its own cursor by design and
      // is skipped as a whole subtree, not just the element itself: FILTER_REJECT on a
      // TreeWalker excludes both the rejected node AND stops it descending into that node's
      // children, unlike a plain querySelectorAll('*') loop with a per-node `continue` (which
      // only ever skipped the one node, still flagging everything nested inside it against the
      // wrong, outer control).
      const treeWalker = document.createTreeWalker(control, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          return (isInteractiveControl(node) || isTextEntry(node)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      for (let descendant = treeWalker.nextNode(); descendant; descendant = treeWalker.nextNode()) {
        if (!visible(descendant)) continue;
        const descendantCursor = getComputedStyle(descendant).cursor;
        if (descendantCursor !== controlCursor) {
          descendantMismatches.push({ control: describe(control), controlCursor, descendant: describe(descendant), descendantCursor });
        }
      }
      const rect = control.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { hitSkippedOffscreen += 1; continue; }
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !control.contains(hit)) { hitSkippedCovered += 1; continue; }
      hitTested += 1;
      const hitCursor = getComputedStyle(hit).cursor;
      if (hitCursor !== controlCursor) {
        hitTestMismatches.push({ control: describe(control), controlCursor, hit: describe(hit), hitCursor });
      }
    }

    return { checked, strayTextOrAuto, missingPointer, descendantMismatches, hitTestMismatches, controlsSeen, hitTested, hitSkippedOffscreen, hitSkippedCovered };
  });
}

function assertClean(result, surface) {
  console.log(`[no-text-cursor] ${surface}: ${result.checked} elements checked, ${result.controlsSeen} controls, ${result.hitTested} hit-tested (${result.hitSkippedCovered} covered, ${result.hitSkippedOffscreen} offscreen)`);
  // A floor of 5, not just > 0: a page that only got as far as <html><body> (a race against a
  // lazy chunk, the exact failure this line caught once already on the site pages, which first
  // reported 1 element checked) would still pass a bare > 0 check.
  assert.ok(result.checked >= 5, `${surface}: the walk must actually see real content (checked ${result.checked}, expected at least 5, indistinguishable from never having looked)`);
  // The off-screen `continue` and the `!control.contains(hit)` "covered" `continue` in the
  // walker both skip a control's hit test silently. Without this, a surface where every single
  // control happened to be skipped (say, everything genuinely off-screen) would still report
  // hitTestMismatches: [] and read as clean, indistinguishable from a real hover proof. Only
  // asserted when the surface actually has a control to test in the first place: some real
  // states (host: reveal has zero clickable elements at all; phone: join walks before its
  // submit button is enabled) legitimately carry controlsSeen === 0, confirmed by hand.
  if (result.controlsSeen > 0) {
    assert.ok(result.hitTested > 0, `${surface}: the hit test must actually run against at least one control (controlsSeen ${result.controlsSeen}, hitTested 0, hitSkippedCovered ${result.hitSkippedCovered}, hitSkippedOffscreen ${result.hitSkippedOffscreen})`);
  }
  assert.deepEqual(result.strayTextOrAuto, [], `${surface}: found non-text-entry elements with cursor text/auto: ${JSON.stringify(result.strayTextOrAuto)}`);
  assert.deepEqual(result.missingPointer, [], `${surface}: found enabled buttons/links with cursor default: ${JSON.stringify(result.missingPointer)}`);
  assert.deepEqual(result.descendantMismatches, [], `${surface}: found control descendants whose cursor disagrees with their control: ${JSON.stringify(result.descendantMismatches)}`);
  assert.deepEqual(result.hitTestMismatches, [], `${surface}: found controls whose real hover point disagrees with their own cursor: ${JSON.stringify(result.hitTestMismatches)}`);
}

// ---------------------------------------------------------------------------
// Host store driving (screen-atlas.mjs pattern, trimmed to this file's needs)
// ---------------------------------------------------------------------------

async function openHostPage(browser, base, { viewport, room }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
  const page = await context.newPage();
  await page.goto(`${base}/?room=${room}&host=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const u = (p) => urls.filter((x) => new URL(x).pathname === p).at(-1) || p;
    window.__cursorAtlas = {};
    window.__cursorAtlas.store = (await import(u('/src/store/game-store.ts'))).useGameStore;
    window.__cursorAtlas.deck = (await import(u('/src/data/decks/vax-or-fiction.ts'))).vaxOrFictionDeck;
  });
  return { context, page };
}

async function setHostState(page, patch) {
  await page.evaluate((patch) => {
    const { store } = window.__cursorAtlas;
    const initial = store.getInitialState();
    store.setState({ ...initial, ...patch });
  }, patch);
}

async function patchHostState(page, patch) {
  await page.evaluate((patch) => {
    const { store } = window.__cursorAtlas;
    store.setState({ ...store.getState(), ...patch });
  }, patch);
}

async function dispatchHost(page, action) {
  await page.evaluate((action) => window.__cursorAtlas.store.getState().dispatch(action), action);
}

function titleSlide() {
  return { id: 'title', type: 'title', title: 'Vax or Fiction?', body: 'Reviewed true-or-false questions built to start practical conversations.', imageRequirementId: 'plate-care-team' };
}

function fakeRoster(count) {
  const seenDevices = {};
  for (let i = 0; i < count; i += 1) {
    seenDevices[`cursor-player-${i}`] = { nickname: `Player ${i + 1}`, team: null, joinedAt: Date.now() - i * 1000, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 };
  }
  return seenDevices;
}

let roomCounter = 0;
function freshRoom(prefix) {
  roomCounter += 1;
  return `CUR${prefix.slice(0, 4).toUpperCase()}${roomCounter}`;
}

// ---------------------------------------------------------------------------

test('no stray text cursor anywhere except real text entry', async (t) => {
  const desktop = { width: 1440, height: 900 };
  const phone = { width: 390, height: 844 };

  await withViteAndBrowser({}, async ({ url: base, browser }) => {
    await t.test('landing page', async () => {
      const context = await browser.newContext({ viewport: desktop });
      const page = await context.newPage();
      await page.goto(`${base}/`, { waitUntil: 'load' });
      assertClean(await walkCursors(page), 'landing page');
      await context.close();
    });

    for (const [route, name] of [['/about', 'site: About'], ['/privacy', 'site: Privacy'], ['/terms', 'site: Terms'], ['/credits', 'site: Credits'], ['/disclaimer', 'site: Disclaimer']]) {
      await t.test(name, async () => {
        const context = await browser.newContext({ viewport: desktop });
        const page = await context.newPage();
        await page.goto(`${base}${route}`, { waitUntil: 'load' });
        await page.waitForSelector('[data-screen="site-page"]');
        assertClean(await walkCursors(page), name);
        await context.close();
      });
    }

    await t.test('site: 404', async () => {
      const context = await browser.newContext({ viewport: desktop });
      const page = await context.newPage();
      await page.goto(`${base}/404.html`, { waitUntil: 'load' });
      assertClean(await walkCursors(page), 'site: 404');
      await context.close();
    });

    await t.test('host: setup', async () => {
      const room = freshRoom('setup');
      const { context, page } = await openHostPage(browser, base, { viewport: desktop, room });
      await setHostState(page, { phase: 'preFlight', formatId: 'widescreen' });
      await page.waitForSelector('[data-screen="preFlight"]');
      assertClean(await walkCursors(page), 'host: setup');
      await context.close();
    });

    await t.test('host: options sheet', async () => {
      const room = freshRoom('opts');
      const { context, page } = await openHostPage(browser, base, { viewport: desktop, room });
      try {
        // startTime non-empty turns the countdown switch on (Preflight.tsx: countdownOn =
        // startTime !== ''), which is the only path that renders the sheet's own type="time"
        // input (OptionsSheet.tsx: only shown when switches.countdown is on). Without this, the
        // date/time cursor-text rule added in bba5d8e had zero rendered coverage anywhere.
        await setHostState(page, { phase: 'preFlight', formatId: 'widescreen', startTime: '18:00' });
        await page.waitForSelector('[data-screen="preFlight"]');
        await page.getByRole('button', { name: 'More options', exact: true }).click();
        await page.waitForSelector('.setup-sheet');
        await page.waitForSelector('input[type="time"]');
        assertClean(await walkCursors(page), 'host: options sheet');
      } finally {
        await context.close();
      }
    });

    await t.test('host: lobby', async () => {
      const room = freshRoom('lobby');
      const { context, page } = await openHostPage(browser, base, { viewport: desktop, room });
      await setHostState(page, { phase: 'lobby', formatId: 'widescreen', seenDevices: fakeRoster(5) });
      await page.waitForSelector('[data-screen="lobby"]');
      assertClean(await walkCursors(page), 'host: lobby');
      await context.close();
    });

    await t.test('host: question, reveal, leaderboard, closing, restart', async () => {
      const room = freshRoom('flow');
      const { context, page } = await openHostPage(browser, base, { viewport: desktop, room });
      try {
        const question = await page.evaluate(() => window.__cursorAtlas.deck.questions.find((q) => q.kind === 'binary'));
        const run = [titleSlide(), question];

        await setHostState(page, { phase: 'deliberating', formatId: 'widescreen', run, slideIndex: 1, seenDevices: {}, pollVotes: {}, pollVoters: {} });
        await page.waitForSelector('.question-shell[data-phase="deliberating"]');
        assertClean(await walkCursors(page), 'host: question');

        await setHostState(page, { phase: 'locked', formatId: 'widescreen', run, slideIndex: 1, votesLocked: true });
        await page.waitForSelector('.question-shell[data-phase="locked"]');
        await dispatchHost(page, { type: 'REVEAL' });
        await page.locator(`[data-stage-beat="result"][data-question-id="${question.id}"]`).waitFor();
        assertClean(await walkCursors(page), 'host: reveal');

        // explaining is the only phase that populates ShowChrome's evidenceDetails (Question.tsx),
        // so it is also the only phase with a real "Details & sources" trigger to walk and open.
        await dispatchHost(page, { type: 'ADVANCE' });
        await page.locator(`[data-stage-beat="explanation"][data-question-id="${question.id}"]`).waitFor();
        assertClean(await walkCursors(page), 'host: explaining');

        const evidenceTrigger = page.locator('.show-evidence-trigger');
        await evidenceTrigger.waitFor();
        await evidenceTrigger.click();
        await page.waitForSelector('.show-evidence-dialog[open]');
        assertClean(await walkCursors(page), 'host: evidence dialog');

        const rosterEntries = Array.from({ length: 6 }, (_, i) => `cursor-final-${i}`);
        const scored = {};
        for (const [i, id] of rosterEntries.entries()) {
          scored[id] = { nickname: `Player ${i + 1}`, team: null, joinedAt: Date.now(), score: 500 - i * 40, answered: 4, correct: 3, streak: 1, bestStreak: 2, realityGap: 0, hardQuestionPoints: 0 };
        }
        await setHostState(page, { phase: 'leaderboard', formatId: 'widescreen', seenDevices: scored, showdown: null });
        await page.waitForSelector('[data-screen="leaderboard"]');
        assertClean(await walkCursors(page), 'host: leaderboard');

        await setHostState(page, { phase: 'closing', formatId: 'widescreen', offlineMode: false, leaderboardEnabled: true, run: [titleSlide(), { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' }], slideIndex: 1, seenDevices: scored, showdown: null });
        await page.waitForSelector('[data-screen="closing"]');
        assertClean(await walkCursors(page), 'host: closing');

        await dispatchHost(page, { type: 'REQUEST_RESTART_RUN' });
        await page.waitForSelector('[data-role="restart-run-modal"]');
        assertClean(await walkCursors(page), 'host: restart modal');
      } finally {
        await context.close();
      }
    });

    await t.test('host: showdown', async () => {
      const room = freshRoom('duel');
      const { context, page } = await openHostPage(browser, base, { viewport: desktop, room });
      try {
        const finalists = [
          { ticket: 'cursor-finalist-a', name: 'Riley', score: 420, duelPoints: 0 },
          { ticket: 'cursor-finalist-b', name: 'Sam', score: 380, duelPoints: 0 },
        ];
        const showdownBase = { id: `${room}:showdown`, finalists, predictions: {}, predictionCounts: Object.fromEntries(finalists.map((f) => [f.ticket, 0])), questionIds: [], questionIndex: 0, isRecap: false };
        await setHostState(page, {
          phase: 'showdown', formatId: 'widescreen', showdownEnabled: true, votesLocked: true,
          showdown: { ...showdownBase, stage: 'lineup', winner: null, tie: false },
        });
        await page.waitForSelector('[data-role="showdown-lineup"]');
        assertClean(await walkCursors(page), 'host: showdown');
      } finally {
        await context.close();
      }
    });

    await t.test('host: presenter remote', async () => {
      const room = freshRoom('remote');
      const hostContext = await browser.newContext({ viewport: desktop });
      const hostPage = await hostContext.newPage();
      try {
        await hostPage.goto(`${base}/?preset=curated15&venue=room&host=1&room=${room}`, { waitUntil: 'networkidle' });
        await hostPage.waitForSelector('[data-role="presenter-pairing"]', { timeout: 15_000 });
        assertClean(await walkCursors(hostPage), 'host: presenter pairing');
        const remoteLink = await hostPage.locator('[data-role="presenter-pairing"]').getAttribute('data-remote-link');
        assert.ok(remoteLink, 'expected a data-remote-link on the pairing overlay');
        const remoteContext = await browser.newContext({ viewport: phone, isMobile: true, hasTouch: true });
        const remotePage = await remoteContext.newPage();
        try {
          await remotePage.goto(remoteLink, { waitUntil: 'load' });
          // '[data-role="remote-pad"], main, body' always matched body immediately (review), so
          // this never actually waited for the remote's own real content to mount. The remote's
          // real root (RemoteSuite.tsx) carries data-role="presenter-remote", not "remote-pad".
          // data-paired="true" also lives on that same root, and only flips once the WS handshake
          // completes: waiting on the bare root alone raced that handshake (found while wiring
          // hitTested's own new assertion below: LOCK/REVEAL/PAUSE render disabled until paired,
          // and the walk landed in that transient window with zero enabled controls to hit-test).
          await remotePage.waitForSelector('[data-role="presenter-remote"][data-paired="true"]', { timeout: 15_000 });
          assertClean(await walkCursors(remotePage), 'phone: presenter remote');
        } finally {
          await remoteContext.close();
        }
      } finally {
        await hostContext.close();
      }
    });

    await t.test('phone: join, vote, reveal', async () => {
      const room = freshRoom('phone');
      const { context: hostContext, page: hostPage } = await openHostPage(browser, base, { viewport: { width: 1280, height: 720 }, room });
      try {
        const question = await hostPage.evaluate(() => window.__cursorAtlas.deck.questions.find((q) => q.kind === 'binary'));
        const run = [titleSlide(), question];
        await setHostState(hostPage, { phase: 'lobby', formatId: 'widescreen', run, slideIndex: -1, offlineMode: false, interactionMode: 'polling', seenDevices: {} });

        const phoneContext = await browser.newContext({ viewport: phone, isMobile: true, hasTouch: true });
        const phonePage = await phoneContext.newPage();
        try {
          await phonePage.goto(`${base}/join?room=${room}`, { waitUntil: 'load' });
          const nicknameField = phonePage.getByRole('textbox', { name: /name|nickname/i });
          await nicknameField.waitFor();
          assertClean(await walkCursors(phonePage), 'phone: join');
          await nicknameField.fill('Cursor Player');
          await phonePage.locator('button[type="submit"]').click();
          await phonePage.waitForSelector('[data-role="phone-waiting"]');

          await patchHostState(hostPage, { phase: 'entering', run, slideIndex: 1, votesLocked: false });
          await phonePage.waitForSelector('[data-role="phone-vote-container"]');
          assertClean(await walkCursors(phonePage), 'phone: vote');

          const choice = phonePage.locator('[data-choice]').filter({ visible: true }).first();
          await choice.click();
          await dispatchHost(hostPage, { type: 'LOCK_VOTES' });
          await dispatchHost(hostPage, { type: 'REVEAL' });
          await phonePage.waitForSelector('[data-role="phone-reveal"][data-screen="result"]');
          assertClean(await walkCursors(phonePage), 'phone: reveal');
        } finally {
          await phoneContext.close();
        }
      } finally {
        await hostContext.close();
      }
    });

    await t.test('phone: solo round', async () => {
      const context = await browser.newContext({ viewport: phone, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/play`, { waitUntil: 'load' });
        await page.waitForSelector('[data-role="solo-topics"]');
        await page.locator('[data-topic]').first().click();
        await page.waitForSelector('[data-role="phone-vote-container"]');
        assertClean(await walkCursors(page), 'phone: solo round');
      } finally {
        await context.close();
      }
    });

    await t.test('admin: sign-in', async () => {
      const context = await browser.newContext({ viewport: desktop });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/admin`, { waitUntil: 'load' });
        await page.waitForSelector('[data-screen="admin"]');
        const result = await walkCursors(page);
        assertClean(result, 'admin: sign-in');
        const emailCursor = await page.evaluate(() => getComputedStyle(document.querySelector('.admin-screen input[type="email"]')).cursor);
        assert.equal(emailCursor, 'text', 'the admin email field must compute cursor: text');
      } finally {
        await context.close();
      }
    });

    await t.test('facilitator: keyboard help', async () => {
      const room = freshRoom('help');
      const { context, page } = await openHostPage(browser, base, { viewport: desktop, room });
      try {
        await setHostState(page, { phase: 'lobby', formatId: 'widescreen', seenDevices: {} });
        await page.waitForSelector('[data-screen="lobby"]');
        await page.keyboard.press('?');
        await page.waitForSelector('[data-role="keyboard-help-modal"]');
        assertClean(await walkCursors(page), 'facilitator: keyboard help');
      } finally {
        await context.close();
      }
    });

    // RED control 1: inject a non-entry element with an explicit cursor: text and confirm the
    // detector catches it. Proves strayTextOrAuto is not vacuously empty.
    await t.test('RED control: injected stray text cursor is caught', async () => {
      const context = await browser.newContext({ viewport: desktop });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/`, { waitUntil: 'load' });
        await page.evaluate(() => {
          const probe = document.createElement('div');
          probe.textContent = 'cursor probe';
          probe.setAttribute('data-role', 'cursor-red-probe');
          probe.style.cursor = 'text';
          probe.style.position = 'fixed';
          probe.style.top = '0';
          probe.style.left = '0';
          probe.style.width = '40px';
          probe.style.height = '20px';
          document.body.appendChild(probe);
        });
        const result = await walkCursors(page);
        assert.ok(result.strayTextOrAuto.some((f) => f.el.includes('cursor-red-probe')), `expected the injected probe in strayTextOrAuto, got ${JSON.stringify(result.strayTextOrAuto)}`);
        assert.throws(() => assertClean(result, 'RED control'), assert.AssertionError, 'a real gate run against this page must fail');
      } finally {
        await context.close();
      }
    });

    // RED control 2: remove the base rule through CSSOM on one page and confirm the walk now
    // reports failures (the browser's auto I-beam on every text node returns without the rule).
    await t.test('RED control: removing the base rule surfaces failures', async () => {
      const context = await browser.newContext({ viewport: desktop });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/about`, { waitUntil: 'load' });
        const removed = await page.evaluate(() => {
          let removedCount = 0;
          for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; } catch { continue; }
            if (!rules) continue;
            for (let i = rules.length - 1; i >= 0; i -= 1) {
              const rule = rules[i];
              if (rule.selectorText === ':where(html)' && /cursor:\s*default/.test(rule.style.cssText)) {
                sheet.deleteRule(i);
                removedCount += 1;
              }
            }
          }
          return removedCount;
        });
        assert.ok(removed > 0, 'expected to find and remove the base `:where(html) { cursor: default }` rule via CSSOM');
        const result = await walkCursors(page);
        assert.ok(result.strayTextOrAuto.length > 0, `removing the base rule must surface at least one text/auto failure, got ${JSON.stringify(result.strayTextOrAuto)}`);
      } finally {
        await context.close();
      }
    });

    // RED control 3: inject an enabled button whose cursor: default comes from a CLASS rule
    // (not an inline style), and confirm the missing-pointer detector still catches it. This is
    // the actual bug class the check exists for: something clickable with no pointer authored
    // anywhere, as opposed to a component's own deliberate inline choice (which the inline-style
    // exemption above intentionally skips).
    await t.test('RED control: a class-ruled default cursor on an enabled button is caught', async () => {
      const context = await browser.newContext({ viewport: desktop });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/`, { waitUntil: 'load' });
        await page.evaluate(() => {
          const style = document.createElement('style');
          style.textContent = '.cursor-red-missing-pointer-probe { cursor: default; }';
          document.head.appendChild(style);
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'probe';
          button.className = 'cursor-red-missing-pointer-probe';
          button.setAttribute('data-role', 'cursor-red-missing-pointer-probe');
          button.style.position = 'fixed';
          button.style.top = '40px';
          button.style.left = '0';
          button.style.width = '80px';
          button.style.height = '30px';
          document.body.appendChild(button);
        });
        const result = await walkCursors(page);
        assert.ok(result.missingPointer.some((f) => f.el.includes('cursor-red-missing-pointer-probe')), `expected the injected button in missingPointer, got ${JSON.stringify(result.missingPointer)}`);
        assert.throws(() => assertClean(result, 'RED control'), assert.AssertionError, 'a real gate run against this page must fail');
      } finally {
        await context.close();
      }
    });

    // RED control 4: reproduce 0709b71's exact blocker in-file, so the 13-of-21 proof (captured
    // by hand before bba5d8e, against the solo topic rows and their chevron among other surfaces)
    // is a repeatable assertion rather than a one-off manual run. Injecting `* { cursor: default
    // }` forces the cursor directly onto every descendant, breaking inheritance from the control
    // itself, exactly like the buggy version of cursor-base.css did.
    await t.test('RED control: a forced `* { cursor: default }` rule breaks descendant inheritance', async () => {
      const context = await browser.newContext({ viewport: desktop });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/play`, { waitUntil: 'load' });
        await page.waitForSelector('[data-role="solo-topics"]');
        await page.evaluate(() => {
          const style = document.createElement('style');
          style.textContent = '* { cursor: default; }';
          // Inserted FIRST in <head>, not appended last: same-specificity rules cascade by
          // source order, so this must lose to the real app's later pointer rule on the control
          // itself (leaving it correctly reporting pointer) while still being the only rule that
          // ever touches an unstyled descendant span directly, which is exactly what made
          // 0709b71's real `* { cursor: default }` (the FIRST rule cursor-base.css loaded) break
          // inheritance in production: the control ends up pointer, its plain children stay
          // default. Appending this probe last would instead override the control's own pointer
          // too, collapsing both to default and hiding the mismatch this control exists to prove.
          document.head.insertBefore(style, document.head.firstChild);
        });
        const result = await walkCursors(page);
        assert.ok(result.descendantMismatches.length > 0, `expected forcing * { cursor: default } to break descendant inheritance somewhere on the solo topics screen, got 0 mismatches`);
        assert.throws(() => assertClean(result, 'RED control'), assert.AssertionError, 'a real gate run against this page must fail');
      } finally {
        await context.close();
      }
    });
  });
});
