import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

// This suite (npm run test:lifecycle) is not part of `check` because its full run time is too slow for that loop.
//
// H1: every `.question-beat[data-stage-beat="..."]` selector in this file is scoped on purpose.
// Question.tsx stamps data-stage-beat on both the persistent .question-shell wrapper (always
// attached and visible, never animated) and the inner per-beat .question-beat section (the one
// that actually fades in via AnimatePresence). A bare `[data-stage-beat="..."]` matches the
// wrapper too and, since waitForSelector only needs one match, resolves on it immediately,
// before the real crossfade even starts. tests/integration/visual-parity.mjs's settleBeat had the
// same bug (its own querySelector version), which is what produced HARNESS's FOUND-DEFECT 1: the
// very next assertion there ran against a posed pane that was still genuinely mid-exit, not stuck.
let browser, server, origin;
let hostNumber = 0;
before(async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(path.resolve('node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { env: { ...process.env, VITE_PRODUCTION_RELAY: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Vite startup timeout: ${output}`)), 10000);
    const inspect = chunk => { output += chunk; if (output.includes(origin)) { clearTimeout(timeout); resolve(); } };
    server.stdout.on('data', inspect); server.stderr.on('data', inspect);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Vite exited ${code}: ${output}`)); });
  });
  // NIT: Playwright's own bundled headless Chromium, never the installed Google Chrome.app, which
  // auto-updates out from under a pinned test (NIT-10 / TB1, matching every other rendered suite).
  browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
});
after(async () => { await browser?.close(); server?.kill('SIGTERM'); });

async function openHost(reducedMotion = 'no-preference', offline = true, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const room = `LIFE${++hostNumber}`;
  await context.addInitScript(({ offline, room }) => { localStorage.setItem('vrc_audio_muted', 'true'); if (offline) sessionStorage.setItem(`vof:presentation-venue:${room}`, 'offline'); }, { offline, room });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/?room=${room}&host=1`);
  await page.waitForSelector('[data-testid="screen-router"]');
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map(e => e.name);
    const u = p => urls.filter(x => new URL(x).pathname === p).at(-1) || p;
    window.lifeStore = (await import(u('/src/store/game-store.ts'))).useGameStore;
    window.lifeQuestions = (await import('/src/data/decks/vax-or-fiction.ts')).vaxOrFictionDeck.questions;
  });
  return { page, errors, context };
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`settled questions exit into next question and Closing with ${reducedMotion}`, async () => {
    const { page, errors, context } = await openHost(reducedMotion);
    try {
      let transitions = 0;
      for (const kind of ['binary', 'myth-among-three', 'estimate', 'order', 'which-patient']) {
        await page.evaluate(kind => {
          const store = window.lifeStore, initial = store.getInitialState(), q = window.lifeQuestions.find(q => q.kind === kind);
          const second = { ...q, id: `${q.id}-next`, statement: 'A separate fictional follow-up question.' };
          store.setState({ ...initial, offlineMode: true, phase: 'entering', run: [q, second], slideIndex: 0, timer: { ...initial.timer, enabled: false, visible: false } });
          store.getState().dispatch({ type: 'REVEAL' });
          store.getState().dispatch({ type: 'ADVANCE' });
        }, kind);
        await page.waitForSelector('.question-beat[data-stage-beat="explanation"]');
        await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
        // Scoped to the live stage statement: a bare getByText now also matches the Session recap panel's own
        // copy of the upcoming stem (an h3 inside the "Session recap" region), so the plain text match resolves
        // two elements and throws strict-mode instead of waiting. Scoping to the h1 role (not the
        // [data-comp-id="statement"] attribute) because src/screens/questions/OrderQuestion.tsx:149 renders its
        // statement as a bare <h1 className="order-statement"> with no data-comp-id, unlike the other four kind
        // components. Every kind in this loop (binary/myth-among-three/estimate/order/which-patient) uses an h1,
        // and the only colliding element is the recap's h3. getByRole('heading', { exact: true }) rather than a
        // bare locator('h1', { hasText }), which matches loosely (any h1 whose text contains this substring
        // anywhere), so it would still resolve on an h1 that merely quotes this statement inside more text.
        await page.getByRole('heading', { name: 'A separate fictional follow-up question.', exact: true }).waitFor({ timeout: 2500 });
        await page.waitForFunction(() => { const containers = [...document.querySelectorAll('[data-role="screen-container"]')]; return containers.length === 1 && Number(getComputedStyle(containers[0]).opacity) === 1; });
        transitions++;
        await page.evaluate(() => { window.lifeStore.getState().dispatch({ type: 'REVEAL' }); window.lifeStore.getState().dispatch({ type: 'ADVANCE' }); });
        await page.waitForSelector('.question-beat[data-stage-beat="explanation"]');
        await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
        await page.waitForSelector('[data-screen="closing"]', { timeout: 2500 });
        await page.waitForFunction(() => {
          const containers = [...document.querySelectorAll('[data-role="screen-container"]')];
          return containers.length === 1 && Number(getComputedStyle(containers[0]).opacity) === 1;
        });
        transitions++;
      }
      assert.equal(transitions, 10);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

// STAGE-SPEC pass 4c-1b (warning item, stale decisions after a mid-question resize), corrected by
// the reviewer: use-measured-stem-step.ts's own step and widow-join decision is measured in
// screen px against the stage's own `--stage-scale`. Nothing in that hook's dependency list
// changes on a plain window resize, so without a dedicated re-measurement trigger the decision
// made at the OLD scale would silently stay in place at the new one (the rendered floors are
// screen-px too, so the canvas-domain font-size a floor forces genuinely differs at a different
// scale).
//
// The FIRST version of this test resized 1280x720 to 640x480, which drops widescreen below its
// own 0.8 minimum scale and switches the format to square (a genuinely new question, through
// `contentKey`, which already re-measures on its own): the test passed for a reason that had
// nothing to do with the ResizeObserver fix it existed to prove, a falsely green regression test.
// This version resizes within the SAME format (1280x720 to 1920x1080, both widescreen) and asserts
// `data-format` is unchanged, so a measurement-count rise can only be the resize path, never a
// format-switch remount.
test('a same-format window resize re-measures the stem and leaves it visible once settled', async () => {
  const { page, errors, context } = await openHost('no-preference', true, { width: 1280, height: 720 });
  try {
    await page.evaluate(() => {
      window.__VOF_MEASURE_TIMES__ = [];
    });
    await page.evaluate(() => {
      const store = window.lifeStore, initial = store.getInitialState();
      const q = window.lifeQuestions.find((q) => q.kind === 'binary');
      store.setState({ ...initial, offlineMode: true, phase: 'entering', run: [q], slideIndex: 0, timer: { ...initial.timer, enabled: false, visible: false } });
    });
    await page.waitForSelector('[data-screen="question"][data-stem-step]');
    await page.waitForFunction(() => (window.__VOF_MEASURE_TIMES__ || []).length >= 1, { timeout: 5000 });
    const formatBefore = await page.evaluate(() => document.querySelector('[data-screen="question"]')?.getAttribute('data-format'));
    assert.equal(formatBefore, 'widescreen', 'test setup: 1280x720 must land on widescreen');
    const beforeResize = await page.evaluate(() => (window.__VOF_MEASURE_TIMES__ || []).length);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(700);
    const formatAfter = await page.evaluate(() => document.querySelector('[data-screen="question"]')?.getAttribute('data-format'));
    assert.equal(formatAfter, 'widescreen', 'the resize must stay on the same format: a format switch would remount and re-measure through contentKey, not through the resize path this test exists to prove');
    const afterResize = await page.evaluate(() => (window.__VOF_MEASURE_TIMES__ || []).length);
    assert.ok(afterResize > beforeResize, `a same-format window resize mid-question must trigger a fresh measurement: before ${beforeResize}, after ${afterResize}`);
    const stemVisibility = await page.evaluate(() => {
      const h1 = document.querySelector('.question-stage-copy h1,[data-comp-id="statement"]');
      return h1 ? getComputedStyle(h1).visibility : 'MISSING';
    });
    assert.equal(stemVisibility, 'visible', 'the stem must read visible once the post-resize measurement has settled, never stuck hidden');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('mounted auto deliberation reaches the audio roles and result keyboard timers stay stopped', async () => {
  const { page, errors, context } = await openHost();
  try {
    await page.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map(e => e.name), u = p => urls.filter(x => new URL(x).pathname === p).at(-1) || p;
      const { useAudioStore } = await import(u('/src/engine/audio-store.ts'));
      window.lifeAudio = [];
      // Keep the real AudioPlayer subscription and phase selection, and replace only media playback.
      useAudioStore.setState({ unlocked: true, transitionMusic: async role => { window.lifeAudio.push(role); return true; }, stopMusic: () => { window.lifeAudio.push('stop'); } });
      const store = window.lifeStore, initial = store.getInitialState();
      store.setState({ ...initial, offlineMode: true, phase: 'entering', run: [window.lifeQuestions[0]], slideIndex: 0, timer: { ...initial.timer, durationMs: 45000, remainingMs: 45000, enabled: true, visible: true } });
    });
    await page.waitForFunction(() => window.lifeStore.getState().phase === 'deliberating', undefined, { timeout: 2500 });
    await page.waitForFunction(() => window.lifeAudio.includes('deliberate'));
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'TICK_TIMER', deltaMs: 15000 }));
    await page.waitForFunction(() => window.lifeAudio.includes('countdown'));
    await page.keyboard.press('Enter');
    await page.waitForSelector('.question-beat[data-stage-beat="result"]');
    await page.keyboard.press('r');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().timer.running), false);
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
    await page.waitForSelector('.question-beat[data-stage-beat="explanation"]');
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().timer.running), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('controlled question previews cannot publish phase or change the live clock', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${origin}/join?room=PREVIEW`);
    await page.waitForSelector('input');
    await page.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map(e => e.name), u = p => urls.filter(x => new URL(x).pathname === p).at(-1) || p;
      const reactModule = await import('/node_modules/.vite/deps/react.js');
      const React = reactModule.default ?? reactModule;
      const client = await import('/node_modules/.vite/deps/react-dom_client.js');
      const createRoot = client.createRoot ?? client.default.createRoot;
      const { Question } = await import('/src/screens/Question.tsx');
      const { useGameStore } = await import(u('/src/store/game-store.ts'));
      const { vaxOrFictionDeck } = await import('/src/data/decks/vax-or-fiction.ts');
      window.lifeStore = useGameStore;
      const q = vaxOrFictionDeck.questions[0], initial = useGameStore.getInitialState();
      useGameStore.setState({ ...initial, phase: 'entering', run: [q], slideIndex: 0, timer: { ...initial.timer, enabled: true, running: false, durationMs: 45000, remainingMs: 45000 } });
      window.previewBefore = useGameStore.getState();
      const fixture = document.createElement('div'); fixture.id = 'controlled-preview'; fixture.style.cssText = 'position:fixed;inset:0;width:1280px;height:720px'; document.body.append(fixture);
      createRoot(fixture).render(React.createElement(Question, { question: q, phase: 'deliberating', timerSeconds: 1 }));
    });
    await page.waitForSelector('#controlled-preview .question-shell', { state: 'attached' });
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.lifeStore.getState() === window.previewBefore), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// NEW-3. This test used to hold a NEW reaction back on the same instance that already got its
// "respects the setting" reaction earlier in the test, then try to tap it again once revisited after
// a reload. Product code (phone-memory's one-reaction-per-reveal, older than this test) blocks a
// second tap on an already-reacted instance, so `[data-reaction="knew-it"]` stayed disabled forever
// and the click timed out. Not a stale selector and not a product regression: the test's own premise
// asked two different things of one instance. It needs three question occurrences instead of two so
// each mechanic gets its own fresh instance: the first proves an on-time reaction respects the stage
// setting, the second is the one whose held reaction goes stale, and the third is what the host has
// moved on to by the time that held reaction is released, which is what makes it stale (the guard
// checks phase before instance id, so moving to a phase with no current question at all would reject
// it for the wrong reason, "Reactions are closed", not "Stale question").
test('real phone reactions reach only the current settled stage summary and respect its setting', async () => {
  const room = `REACTION_${Date.now().toString(36)}`;
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await phoneContext.addInitScript(() => {
    const send = WebSocket.prototype.send;
    window.heldReactions = [];
    window.reactionAcks = [];
    WebSocket.prototype.send = function (data) {
      if (!this.reactionProbe) {
        this.reactionProbe = true;
        this.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.kind === 'ACK') window.reactionAcks.push(m); });
      }
      if (window.holdReactions && JSON.parse(data).message?.type === 'REACTION') {
        window.heldReactions.push({ socket: this, data }); return;
      }
      send.call(this, data);
    };
    window.flushReactions = () => { for (const { socket, data } of window.heldReactions) send.call(socket, data); };
  });
  const host = await hostContext.newPage(), phone = await phoneContext.newPage(), errors = [];
  for (const page of [host, phone]) page.on('pageerror', e => errors.push(e.message));
  try {
    await host.goto(`${origin}/?room=${room}&host=1`);
    await host.waitForSelector('[data-testid="screen-router"]');
    await host.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map(e => e.name), u = p => urls.filter(x => new URL(x).pathname === p).at(-1) || p;
      window.lifeStore = (await import(u('/src/store/game-store.ts'))).useGameStore;
      const { vaxOrFictionDeck } = await import('/src/data/decks/vax-or-fiction.ts');
      const initial = window.lifeStore.getInitialState(), q = vaxOrFictionDeck.questions[0];
      // Three occurrences of the same question: see the test-level comment above for why.
      window.lifeStore.setState({ ...initial, sessionId: 'received-reaction', phase: 'lobby', slideIndex: -1, run: [initial.run.find(q => q.type === 'title'), q, q, q], offlineMode: false, interactionMode: 'polling', stageReactionsEnabled: true, reactionTickerEnabled: true });
    });
    await phone.goto(`${origin}/join?room=${room}`);
    await phone.getByRole('textbox', { name: /name|nickname/i }).fill('Reaction Tester');
    await phone.locator('button[type="submit"]').click();
    await phone.waitForSelector('[data-role="phone-waiting"]');

    // Occurrence A: an on-time reaction, and that it respects the stage setting.
    await host.evaluate(() => { const dispatch = window.lifeStore.getState().dispatch; dispatch({ type: 'ADVANCE' }); dispatch({ type: 'ADVANCE' }); });
    await phone.waitForSelector('[data-role="phone-vote-container"]');
    assert.equal(await host.locator('[data-role="stage-reaction-summary"]').count(), 0);
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'REVEAL' }));
    await phone.waitForSelector('[data-role="phone-reveal"][data-screen="result"]');
    await phone.locator('[data-reaction="we-do-this"]').click();
    await host.getByText('· 🔥 1', { exact: true }).waitFor();
    assert.equal(await host.locator('[data-role="stage-reaction-summary"]').getAttribute('aria-label'), 'We do this 1');
    assert.match(await host.locator('[data-role="status-rail-text"]').innerText(), /Revealed/);
    assert.match(await host.locator('[data-role="status-rail-hint"]').textContent(), /explain/);
    await host.evaluate(() => window.lifeStore.setState({ stageReactionsEnabled: false, reactionTickerEnabled: false }));
    assert.equal(await host.locator('[data-role="stage-reaction-summary"]').count(), 0);
    await host.evaluate(() => { window.lifeStore.setState({ stageReactionsEnabled: true }); window.lifeStore.getState().dispatch({ type: 'ADVANCE' }); });
    await host.getByText('· 🔥 1', { exact: true }).waitFor();
    await phone.reload();
    await phone.waitForSelector('[data-role="phone-reveal"][data-screen="explanation"]');

    // Occurrence B: a fresh instance (its own reveal, never tapped yet), the one whose held reaction
    // will go stale. Moving on from A must not carry A's count onto B.
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
    await phone.waitForSelector('[data-role="phone-vote-container"]');
    assert.equal(await host.locator('[data-role="stage-reaction-summary"]').count(), 0, 'repeated question must not inherit prior received counts');
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'REVEAL' }));
    await phone.waitForSelector('[data-role="phone-reveal"][data-screen="result"]');
    assert.equal(await host.locator('[data-role="stage-reaction-summary"]').count(), 0);
    await phone.evaluate(() => { window.holdReactions = true; });
    await phone.locator('[data-reaction="knew-it"]').click();
    await phone.waitForFunction(() => window.heldReactions.length === 1);

    // Occurrence C: what the host has moved on to by the time B's held reaction is released. Reveal
    // it (not just pose it) so the phase stays one REACTION is ever accepted in ("revealed" or
    // "explaining"), which is what makes B's arriving reaction "Stale question" and not the different
    // rejection "Reactions are closed".
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
    await phone.waitForSelector('[data-role="phone-vote-container"]');
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'REVEAL' }));
    await phone.waitForSelector('[data-role="phone-reveal"][data-screen="result"]');
    assert.equal(await host.locator('[data-role="stage-reaction-summary"]').count(), 0, "B's held (not yet released) reaction must not have leaked onto C either");

    await phone.evaluate(() => { window.holdReactions = false; window.flushReactions(); });
    await phone.waitForFunction(() => window.reactionAcks.some(a => a.messageId === JSON.parse(window.heldReactions[0].data).message.messageId && !a.accepted && a.reason === 'Stale question'));
    assert.equal(await host.locator('[data-role="stage-reaction-summary"]').count(), 0, 'late prior occurrence tap must be rejected by the real host');
    await phone.locator('[data-reaction="wait-really"]').click();
    await host.getByText('· 😲 1', { exact: true }).waitFor();

    // BACK never un-reveals in place. From a revealed (not explaining) question it walks to the
    // previous slide and re-arms it. One BACK reaches B, revealed but never actually given an
    // accepted reaction of its own. A second reaches A, which does still carry its own accepted reaction.
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'BACK' }));
    await host.evaluate(() => window.lifeStore.getState().dispatch({ type: 'BACK' }));
    await host.getByText('· 🔥 1', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await hostContext.close(); await phoneContext.close(); }
});

test('settled reaction summary keeps all counts accessible and fits the existing footer at four stage sizes', async () => {
  let measured = 0;
  for (const [formatId, width, height] of [['widescreen', 1280, 720], ['square', 1080, 1080], ['portrait', 390, 844], ['portrait', 430, 932]]) {
    const { page, errors, context } = await openHost('reduce', false, { width, height });
    try {
      await page.evaluate(formatId => {
        const store = window.lifeStore, initial = store.getInitialState(), q = window.lifeQuestions[0];
        store.setState({ ...initial, sessionId: 'reaction-fit', offlineMode: false, interactionMode: 'polling', phase: 'explaining', run: [q], slideIndex: 0, formatId, stageReactionsEnabled: true,
          reactions: { [`reaction-fit:0:${q.id}`]: { 'knew-it': 2, 'wait-really': 999, 'we-do-this': 3, total: 1004 } },
        });
      }, formatId);
      const summary = page.locator('[data-role="stage-reaction-summary"]');
      await summary.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const stage = document.querySelector('.scaled-stage-content')?.getBoundingClientRect();
        return stage && stage.width <= innerWidth + 1 && stage.height <= innerHeight + 1;
      });
      assert.equal(await summary.getAttribute('aria-label'), 'Knew it 2, Surprised me 999, We do this 3');
      const geometry = await page.evaluate(() => {
        const summary = document.querySelector('[data-role="stage-reaction-summary"]'), footer = summary.closest('.show-footer'), rail = summary.closest('.status-rail');
        const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const r = summary.getBoundingClientRect();
        return { summary: { x: r.x, right: r.right, bottom: r.bottom }, footer: rect(footer), rail: rect(rail), viewport: innerWidth };
      });
      assert.ok(geometry.summary.x >= geometry.footer.x - 1 && geometry.summary.right <= geometry.footer.right + 1, JSON.stringify({ formatId, width, geometry }));
      assert.ok(geometry.rail.right <= width + 1 && geometry.rail.x >= -1, JSON.stringify({ formatId, width, geometry }));
      if (process.env.VOF_LIFECYCLE_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.VOF_LIFECYCLE_EVIDENCE_DIR}/reaction-${formatId}-${width}.png` });
      if (width === 390) {
        const catchesOverflow = await summary.evaluate(element => {
          const original = element.textContent;
          const overflow = element.style.overflow;
          element.textContent = ' · 😲 ' + '9'.repeat(80);
          element.style.overflow = 'visible';
          const range = document.createRange(); range.selectNodeContents(element);
          const text = range.getBoundingClientRect(), footer = element.closest('.show-footer').getBoundingClientRect();
          element.textContent = original;
          element.style.overflow = overflow;
          return text.x < footer.x - 1 || text.right > footer.right + 1;
        });
        assert.equal(catchesOverflow, true, 'overflow checker must detect an oversized-counter mutation');
      }
      measured++;
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  assert.equal(measured, 4);
});

test('actual P and T controls keep disabled countdowns stopped and retain the paused time', async () => {
  const { page, errors, context } = await openHost();
  try {
    await page.evaluate(() => {
      const store = window.lifeStore, initial = store.getInitialState();
      store.setState({ ...initial, offlineMode: true, phase: 'entering', run: [window.lifeQuestions[0]], slideIndex: 0,
        timer: { ...initial.timer, durationMs: 45000, remainingMs: 45000, enabled: false, visible: false, running: false },
      });
    });
    await page.waitForFunction(() => window.lifeStore.getState().phase === 'deliberating');
    await page.keyboard.press('p');
    await page.waitForTimeout(1100);
    assert.deepEqual(await page.evaluate(() => { const t = window.lifeStore.getState().timer; return [t.running, t.enabled, t.visible, t.remainingMs, t.endsAt]; }), [false, false, false, 45000, null]);
    await page.keyboard.press('t');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().timer.running), false);
    await page.keyboard.press('p');
    await page.waitForFunction(() => window.lifeStore.getState().timer.remainingMs < 45000);
    await page.keyboard.press('t');
    const stopped = await page.evaluate(() => window.lifeStore.getState().timer.remainingMs);
    await page.waitForTimeout(1100);
    assert.deepEqual(await page.evaluate(() => { const t = window.lifeStore.getState().timer; return [t.running, t.enabled, t.visible, t.remainingMs, t.endsAt]; }), [false, false, false, stopped, null]);
    await page.keyboard.press('t');
    assert.deepEqual(await page.evaluate(() => { const t = window.lifeStore.getState().timer; return [t.running, t.enabled, t.remainingMs]; }), [false, true, stopped]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('settled footer keeps its rows and clickable Details above the real HUD across four sizes and longest review neighbors', async () => {
  let checked = 0;
  for (const [formatId, width, height] of [['widescreen', 1280, 720], ['square', 1080, 1080], ['portrait', 390, 844], ['portrait', 430, 932]]) {
    const { page, errors, context } = await openHost('reduce', false, { width, height });
    try {
      await page.evaluate(async () => {
        // The longest reveal and the longest order in the shipped show and flagship decks stress the footer hardest.
        const flagship = (await import('/src/data/decks/flagship.ts')).flagshipDeck.questions;
        const pool = [...window.lifeQuestions, ...flagship];
        window.footerNeighbors = {
          base: window.lifeQuestions[0],
          'long-review': [...pool].sort((a, b) => String(b.reveal ?? '').length - String(a.reveal ?? '').length)[0],
          'long-order': pool.filter(q => q.kind === 'order').sort((a, b) => JSON.stringify(b.steps).length - JSON.stringify(a.steps).length)[0],
        };
      });
      for (const neighbor of ['base', 'long-review', 'long-order']) for (const phase of ['revealed', 'explaining']) {
        await page.evaluate(({ formatId, neighbor, phase }) => {
          const store = window.lifeStore, initial = store.getInitialState();
          const q = window.footerNeighbors[neighbor];
          store.setState({ ...initial, sessionId: 'footer-hud', offlineMode: false, interactionMode: 'polling', phase, run: [q], slideIndex: 0, formatId, stageReactionsEnabled: true, votesLocked: true });
        }, { formatId, neighbor, phase });
        await page.waitForSelector(`.question-beat[data-stage-beat="${phase === 'revealed' ? 'result' : 'explanation'}"]`);
        // PresentationSuite holds the outgoing stage format for SCREEN_FADE_S (260ms) after a
        // real Preflight-to-Lobby dissolve so the exiting pane does not lose geometry mid
        // crossfade. A raw store.setState like the one above jumps straight past that edge, so
        // ScaledStage can still be rendering the prior mount's format (stuck at "widescreen")
        // for up to 260ms. Wait for the settled attribute so this only ever measures the
        // requested format, never that transitional frame.
        await page.waitForFunction(fmt => document.querySelector('.scaled-stage-container')?.getAttribute('data-format') === fmt, formatId);
        if (!(await page.locator('[data-role="hud"]').isVisible())) {
          if (await page.evaluate(() => window.lifeStore.getState().hud.visible)) await page.keyboard.press('h');
          await page.keyboard.press('h');
        }
        await page.waitForSelector('[data-role="hud"]');
        await page.locator('[data-role="hud"]').hover();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const before = await page.locator('.show-footer').boundingBox();
        await page.evaluate(() => { const s = window.lifeStore.getState(), q = s.run[0]; window.lifeStore.setState({ reactions: { [`footer-hud:0:${q.id}`]: { 'wait-really': 999, 'we-do-this': 3, total: 1002 } } }); });
        await page.locator('[data-role="stage-reaction-summary"]').waitFor();
        const metrics = await page.evaluate(() => {
          const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          const footer = document.querySelector('.show-footer'), hud = document.querySelector('[data-role="hud-portal"]'), details = document.querySelector('.show-evidence-trigger');
          const r = details?.getBoundingClientRect(), hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          const content = document.querySelector('.show-content');
          const text = [], walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode, parent = node.parentElement;
            if (!node.textContent.trim() || parent.closest('.sr-only,[aria-hidden="true"]') || !parent.getBoundingClientRect().width) continue;
            const range = document.createRange(); range.selectNodeContents(node); const r = range.getBoundingClientRect();
            text.push({ top: r.top, bottom: r.bottom, text: node.textContent });
          }
          const summary = document.querySelector('[data-role="stage-reaction-summary"]');
          const attribution = document.querySelector('[data-role="source-pill"]');
          const sourceText = [], sourceWalker = document.createTreeWalker(attribution, NodeFilter.SHOW_TEXT);
          while (sourceWalker.nextNode()) {
            const node = sourceWalker.currentNode;
            if (!node.textContent.trim() || !node.parentElement.getBoundingClientRect().width) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            for (const r of range.getClientRects()) sourceText.push({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, text: node.textContent });
          }
          const digits = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
          let counter = null, counterBounds = null;
          while (digits.nextNode()) {
            const node = digits.currentNode, start = node.textContent.indexOf('999');
            if (start < 0) continue;
            const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 3);
            counter = rect(range);
            counterBounds = rect(node.parentElement);
          }
          return { footer: rect(footer), hud: rect(hud), content: rect(content), text, sourceText, rail: rect(summary.closest('.status-rail')), phase: rect(document.querySelector('.status-rail__phase')), summary: rect(summary), counter, counterBounds, details: details ? rect(details) : null, clickable: !details || details === hit || details.contains(hit) };
        });
        assert.ok(Math.abs(metrics.footer.height - before.height) <= 1, `rows ${JSON.stringify({ formatId, neighbor, phase, before, metrics })}`);
        assert.ok(metrics.footer.bottom <= metrics.hud.y - 8, `HUD gap ${JSON.stringify({ formatId, neighbor, phase, metrics })}`);
        assert.ok(metrics.hud.y - metrics.footer.bottom < 80, `excessive reserve ${JSON.stringify({ formatId, neighbor, phase, metrics })}`);
        assert.ok(metrics.text.length > 0 && metrics.text.every(t => t.top >= metrics.content.y - 1 && t.bottom <= metrics.footer.y - 8), `content collision ${JSON.stringify({ formatId, neighbor, phase, metrics })}`);
        assert.ok(metrics.counter && metrics.counter.x >= metrics.summary.x - 1 && metrics.counter.right <= Math.min(metrics.summary.right, metrics.counterBounds.right) + 1 && metrics.counter.bottom <= metrics.footer.bottom + 1, `reaction count clipped ${JSON.stringify({ formatId, neighbor, phase, metrics })}`);
        if (formatId === 'portrait') assert.ok(metrics.phase.bottom <= metrics.summary.y + 1, `portrait reaction must use its own text line ${JSON.stringify(metrics)}`);
        assert.ok(metrics.sourceText.every(t => t.x >= metrics.footer.x - 1 && t.right <= metrics.footer.right + 1 && t.y >= metrics.content.bottom + 8 && t.bottom <= metrics.hud.y - 8 && (t.right <= metrics.rail.x + 1 || t.bottom <= metrics.rail.y + 1 || t.y >= metrics.rail.bottom - 1)), `source collision ${JSON.stringify({ formatId, neighbor, phase, metrics })}`);
        assert.ok(metrics.clickable, `Details blocked ${formatId}/${neighbor}/${phase}`);
        if (process.env.VOF_LIFECYCLE_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.VOF_LIFECYCLE_EVIDENCE_DIR}/footer-hud-${formatId}-${width}-${neighbor}-${phase}.png` });
        if (phase === 'explaining') {
          assert.ok(metrics.details.height >= 44 && metrics.details.width >= 44);
          await page.locator('.show-evidence-trigger').click();
          await page.locator('.show-evidence-dialog[open]').waitFor();
          await page.getByRole('button', { name: 'Close', exact: true }).click();
        }
        checked++;
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  assert.equal(checked, 24);
  console.log(`FOOTER_COVERAGE states=${checked} viewports=4 neighbors=3 phases=2 reactionCount=999 sourceGlyphs=checked`);
});

test('square host exposes its complete pinned toolbar without horizontal scrolling', async () => {
  let checked = 0;
  for (const width of [1080, 768]) {
    const { page, errors, context } = await openHost('reduce', false, { width, height: width });
    try {
      await page.evaluate(() => {
        const store = window.lifeStore, initial = store.getInitialState();
        store.setState({ ...initial, offlineMode: false, phase: 'explaining', run: [window.lifeQuestions[0]], slideIndex: 0, formatId: 'square' });
      });
      await page.waitForSelector('.question-beat[data-stage-beat="explanation"]');
      if (!(await page.locator('[data-role="hud"]').isVisible())) {
        if (await page.evaluate(() => window.lifeStore.getState().hud.visible)) await page.keyboard.press('h');
        await page.keyboard.press('h');
      }
      await page.locator('[data-role="hud"]').hover();
      await page.getByRole('button', { name: 'Pin controls open', exact: true }).click();
      await page.getByRole('button', { name: 'Unpin controls', exact: true }).waitFor();
      await page.waitForTimeout(150);
      const metrics = await page.evaluate(() => {
        const hud = document.querySelector('[data-role="hud"]'), r = hud.getBoundingClientRect();
        const controls = [...hud.querySelectorAll('button')].map(button => {
          const b = button.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return { name: button.getAttribute('aria-label') || button.textContent.trim(), x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height, hit: button === hit || button.contains(hit) };
        }).filter(b => b.width > 0 && b.height > 0);
        return { width: hud.clientWidth, scroll: hud.scrollWidth, right: r.right, controls };
      });
      assert.ok(metrics.width >= width - 1 && metrics.scroll <= metrics.width + 1, `toolbar overflow ${JSON.stringify({ width, metrics })}`);
      assert.ok(metrics.controls.length >= 10 && metrics.controls.every(b => b.width >= 44 && b.height >= 44 && b.x >= 0 && b.right <= width + 1 && b.y >= 0 && b.bottom <= width + 1 && b.hit), `toolbar controls unreachable ${JSON.stringify({ width, metrics })}`);
      if (process.env.VOF_LIFECYCLE_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.VOF_LIFECYCLE_EVIDENCE_DIR}/square-toolbar-${width}.png` });
      assert.deepEqual(errors, []);
      checked++;
    } finally { await context.close(); }
  }
  assert.equal(checked, 2);
  console.log(`TOOLBAR_COVERAGE widths=1080,768 pinned=${checked} horizontalOverflow=0 visibleControls=hit-tested`);
});

test('focused Closing actions and Showdown controls clear the square HUD pinned and unpinned', async () => {
  let checked = 0;
  for (const width of [1080, 768]) {
    const { page, errors, context } = await openHost('reduce', false, { width, height: width });
    try {
      for (const phase of ['showdown', 'closing']) {
        await page.evaluate(phase => {
          const store = window.lifeStore, initial = store.getInitialState(), q = window.lifeQuestions;
          store.setState({ ...initial, phase, formatId: 'square', offlineMode: false, run: q, slideIndex: 0,
            showdown: { id: 'hud-adjacent', stage: 'duel', finalists: [{ ticket: 'T-01', name: 'Participant A', score: 42, duelPoints: 2 }, { ticket: 'T-02', name: 'Participant B', score: 39, duelPoints: 1 }], predictions: { deviceA: 'T-01', deviceB: 'T-02' }, predictionCounts: { 'T-01': 1, 'T-02': 1 }, questionIds: q.slice(0, 2).map(q => q.id), questionIndex: 0, winner: null, tie: false, isRecap: true },
          });
        }, phase);
        await page.locator(`[data-screen="${phase}"]`).waitFor();
        // PresentationSuite holds the outgoing stage format for SCREEN_FADE_S (260ms) after a
        // real Preflight-to-Lobby dissolve so the exiting pane does not lose geometry mid
        // crossfade. The raw store.setState above jumps straight past that edge, so ScaledStage
        // can still be rendering the prior mount's format (stuck at "widescreen", class
        // "presenter-setup-stage") for up to 260ms, which throws off every geometry check below
        // (verified: without this wait the showdown duel actions measure under a 1600x900
        // widescreen canvas instead of the requested 1200x1200 square one, and elementFromPoint
        // stops finding them because the un-clipped part of that stale canvas sits below the
        // real one). Wait for the settled attribute so this only ever measures square.
        await page.waitForFunction(() => document.querySelector('.scaled-stage-container')?.getAttribute('data-format') === 'square');
        if (!(await page.locator('[data-role="hud"]').isVisible())) {
          if (await page.evaluate(() => window.lifeStore.getState().hud.visible)) await page.keyboard.press('h');
          await page.keyboard.press('h');
        }
        await page.locator('[data-role="hud"]').hover();
        if (await page.getByRole('button', { name: 'Pin controls open', exact: true }).count()) await page.getByRole('button', { name: 'Pin controls open', exact: true }).click();
        for (const mode of phase === 'closing' ? ['pinned', 'unpinned-visible', 'unpinned-hidden'] : ['pinned']) {
          if (mode === 'unpinned-visible') await page.getByRole('button', { name: 'Unpin controls', exact: true }).click();
          if (mode === 'unpinned-hidden') {
            if (!(await page.evaluate(() => window.lifeStore.getState().hud.visible))) await page.keyboard.press('h');
            await page.keyboard.press('h');
            await page.locator('[data-role="hud"]').waitFor({ state: 'hidden' });
          }
          await page.mouse.move(8, 8);
          if (phase === 'closing') {
            await page.keyboard.press('Tab');
            await page.locator('[data-role="closing-complete"]').focus();
            await page.waitForFunction(() => document.querySelector('[data-role="closing-complete"]')?.matches(':focus-visible'));
          }
          await page.waitForTimeout(150);
          const metrics = await page.evaluate(phase => {
            const main = document.querySelector(`[data-screen="${phase}"]`), portal = document.querySelector('[data-role="hud-portal"]');
            const controls = [...main.querySelectorAll('button')].map(button => {
              const b = button.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
              return { name: button.textContent.trim(), x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height, hit: button === hit || button.contains(hit) };
            }).filter(b => b.width > 0);
            const title = main.querySelector('.closing-source-header'), pill = main.querySelector('.show-join-pill');
            const header = title && pill ? { titleRight: title.getBoundingClientRect().right, pillLeft: pill.getBoundingClientRect().x } : null;
            const glyphs = [];
            if (header) for (const element of [title, pill]) {
              const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (!node.textContent.trim() || !node.parentElement.getBoundingClientRect().width) continue;
                const range = document.createRange(); range.selectNodeContents(node);
                for (const r of range.getClientRects()) glyphs.push({ text: node.textContent, x: r.x, right: r.right, region: element === title ? 'title' : 'pill', bounds: element.getBoundingClientRect().toJSON() });
              }
            }
            return { controls, header, glyphs, hudTop: portal?.getBoundingClientRect().top ?? innerHeight, actionsOpacity: phase === 'closing' ? Number(getComputedStyle(document.querySelector('.closing-recap-actions')).opacity) : 1 };
          }, phase);
          // Closing.tsx's .closing-recap-actions nav always renders 3 buttons (Play again, Back
          // to main menu, Finish) in this no-votes-recorded scenario: hasScoresPage and
          // hasDedicatedTakeawayPage both need recorded scores, which this test never seeds, so
          // .closing-local-navigation never mounts. No commit or VOF-DECISION-LEDGER ruling
          // trims that to 2 for square hosts, and rendering every width/mode combination this
          // test exercises (1080 and 768, pinned/unpinned-visible/unpinned-hidden) with the
          // stale-format race above fixed shows all 3 buttons fit inside the viewport, above the
          // HUD, individually hit-testable at their own center point every time. The apparent
          // "extra button" this item was filed against was that stale widescreen render.
          assert.equal(metrics.controls.length, phase === 'closing' ? 3 : 9);
          assert.equal(metrics.actionsOpacity, 1);
          if (phase === 'closing') {
            assert.ok(metrics.header.titleRight + 8 <= metrics.header.pillLeft, `closing header overlap ${JSON.stringify({ width, mode, metrics })}`);
            assert.ok(metrics.glyphs.length >= 3 && metrics.glyphs.every(t => t.x >= t.bounds.x - 1 && t.right <= t.bounds.right + 1), `closing header text clipped ${JSON.stringify({ width, mode, metrics })}`);
          }
          assert.ok(metrics.controls.every(b => b.width >= 43.9 && b.height >= 43.9 && b.x >= 0 && b.right <= width + 1 && b.y >= 0 && b.bottom <= metrics.hudTop + 1 && b.hit), `screen controls blocked ${JSON.stringify({ width, phase, mode, metrics })}`);
          if (process.env.VOF_LIFECYCLE_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.VOF_LIFECYCLE_EVIDENCE_DIR}/square-adjacent-${width}-${phase}-${mode}.png` });
          checked++;
        }
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  assert.equal(checked, 8);
  console.log(`SQUARE_ADJACENT_COVERAGE states=${checked} widths=1080,768 closing=pinned,unpinned-visible,unpinned-hidden showdown=pinned`);
});

test('B2 / SHOWDOWN-RECAP / DUEL-BOARD: the duel statement, award buttons and duel points stay on screen and the action bar stays reachable across the reported viewport matrix', async () => {
  // Every combination NEW-2's shrink-to-fit broke (B2) or never covered at all (SHOWDOWN-RECAP,
  // found above 900px wide where nothing used to shrink). formatId/width/height/pin match the
  // review evidence exactly: 768x768 square with the HUD pinned was the case that lost the
  // statement down to only "QUESTION 1 OF 2". 800x450 and 900x506 widescreen with the HUD
  // hidden lost it down to only the header. 1280x720 and 1920x1080 carried the action bar under
  // the viewport by about 75px regardless of HUD state.
  // DUEL-BOARD (round 7): the B2 fix then let the finalists grid be the first thing to shrink, so
  // the presenter's only on-stage scoring controls (minus and +1 POINT) and the duel points were
  // clipped at 1280x720 (59 of 157px, 27 pinned), 1920x1080 (91) and gone at 800x450, 900x506 and
  // 720x900. The last column is the format the stage actually shows: widescreen falls below its
  // minimum readable scale in a tall 720x900 window, so the host stage switches to portrait there.
  // 768x1024 portrait pinned is added because the review found the award buttons covered there too,
  // and the two canonical phones (430x932, 390x844) because the phone-width portrait rules changed.
  const matrix = [
    [768, 768, 'square', true, 'square'],
    [800, 450, 'widescreen', false, 'widescreen'],
    [900, 506, 'widescreen', false, 'widescreen'],
    [720, 900, 'widescreen', false, 'portrait'],
    [768, 1024, 'portrait', false, 'portrait'],
    [768, 1024, 'portrait', true, 'portrait'],
    [1280, 720, 'widescreen', false, 'widescreen'],
    [1280, 720, 'widescreen', true, 'widescreen'],
    [1920, 1080, 'widescreen', false, 'widescreen'],
    [1920, 1080, 'widescreen', true, 'widescreen'],
    [430, 932, 'portrait', false, 'portrait'],
    [430, 932, 'portrait', true, 'portrait'],
    [390, 844, 'portrait', false, 'portrait'],
    [390, 844, 'portrait', true, 'portrait'],
  ];
  // These three are the exact width/height/HUD-state combinations named above: the statement
  // must be on screen with no scrolling at all, not merely reachable, everywhere in the matrix
  // (see the unconditional assertion below). 768x768 pinned additionally fits the action bar
  // with no scroll either. 800x450 and 900x506 hidden are within a few px of that too (13 to 45
  // of the action bar's own height), close enough that the scroll assertion after this covers
  // them without demanding pixels no touch-target-legal header could actually give back.
  const mustFitWithoutScroll = new Set(['768x768xsquarextrue']);
  // PILL (round 8): measured against a8d19d4 (unchanged code) before this fix, so this set pins
  // no regression anywhere it wasn't already true. The fixture question (window.lifeQuestions[0],
  // "q1") is binary, so recapAnswer's dedicated `.showdown-evidence-detail` field is empty and
  // never renders there. The one-line answer detail the design call names ("Lungs. Bloodstream.
  // Brain.") is `.showdown-evidence-takeaway`, the last line of the recap. Before this fix, both
  // 1280x720 HUD states were clipped, not only the pinned one the ruling named: the recap showed
  // just 45 of 64px with the HUD hidden and was clipped further pinned (19px below the fold).
  // Every other size but 800x450 widescreen hidden already showed the takeaway then. A follow-up
  // pass trimmed the evidence card's own vertical spacing (header margin, card padding, recap
  // margin/padding, the duel section's row gap, all one token step, no font size touched), which
  // gave 800x450 and 900x506 widescreen hidden enough of their own headroom back that the recap
  // now fits its full content everywhere in the matrix, so every size is required here.
  const mustShowTakeaway = new Set(matrix
    .map(([w, h, fmt, pinned]) => `${w}x${h}x${fmt}x${pinned}`));
  let checked = 0;
  let pillBandChecked = 0;
  let takeawayChecked = 0;
  for (const [width, height, formatId, pin, shownFormat] of matrix) {
    const key = `${width}x${height}x${formatId}x${pin}`;
    const { page, errors, context } = await openHost('reduce', false, { width, height });
    try {
      await page.evaluate(({ formatId }) => {
        const store = window.lifeStore, initial = store.getInitialState(), q = window.lifeQuestions;
        store.setState({ ...initial, sessionId: 'b2-recap', offlineMode: false, phase: 'showdown', formatId, run: q, slideIndex: 0,
          showdown: { id: 'b2', stage: 'duel', finalists: [{ ticket: 'T-01', name: 'Participant A', score: 42, duelPoints: 2 }, { ticket: 'T-02', name: 'Participant B', score: 39, duelPoints: 1 }], predictions: { deviceA: 'T-01' }, predictionCounts: { 'T-01': 1 }, questionIds: [q[0].id, q[1].id], questionIndex: 0, winner: null, tie: false, isRecap: true } });
      }, { formatId });
      await page.locator('[data-screen="showdown"]').waitFor();
      // PresentationSuite holds the setup stage (class presenter-setup-stage, always widescreen)
      // for SCREEN_FADE_S after the jump out of setup, so a bare data-format check passes on that
      // stale canvas at once. Wait for the settled show stage in the format it really shows.
      await page.waitForFunction(fmt => {
        const stage = document.querySelector('.scaled-stage-container');
        return stage?.classList.contains('stage-wrapper') && stage.getAttribute('data-format') === fmt;
      }, shownFormat);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      if (pin) {
        if (!(await page.locator('[data-role="hud"]').isVisible())) {
          if (await page.evaluate(() => window.lifeStore.getState().hud.visible)) await page.keyboard.press('h');
          await page.keyboard.press('h');
        }
        await page.locator('[data-role="hud"]').hover();
        // HUD-COMPACT: at the portrait rows in this matrix the bar is capped to 400px (768x1024
        // and the two phones), so Pin now lives inside the More sheet, not the visible cluster.
        // The More button only renders in compact mode, so this is a no-op everywhere else in the
        // matrix (square, widescreen). Escape afterward so the sheet never covers the board this
        // test is about to measure.
        const more = page.getByRole('button', { name: 'More controls', exact: true });
        if (await more.count()) {
          await more.click();
          if (await page.getByRole('button', { name: 'Pin controls open', exact: true }).count()) await page.getByRole('button', { name: 'Pin controls open', exact: true }).click();
          await page.keyboard.press('Escape');
        } else if (await page.getByRole('button', { name: 'Pin controls open', exact: true }).count()) {
          await page.getByRole('button', { name: 'Pin controls open', exact: true }).click();
        }
        await page.waitForTimeout(150);
      }
      const before = await page.evaluate(() => {
        const rect = el => el ? (({ x, y, right, bottom, width, height }) => ({ x, y, right, bottom, width, height }))(el.getBoundingClientRect()) : null;
        const card = document.querySelector('[data-role="duel-evidence-card"]');
        const statement = card?.querySelector('.showdown-evidence-statement');
        const panel = document.querySelector('.showdown-board-content');
        const actions = document.querySelector('[data-role="showdown-duel-actions"]');
        const hud = document.querySelector('[data-role="hud-portal"]');
        return { statement: rect(statement), card: rect(card), panel: rect(panel), panelScrollTop: panel?.scrollTop, actions: rect(actions), hud: rect(hud) };
      });
      assert.ok(before.statement && before.statement.height > 10, `statement missing or collapsed ${JSON.stringify({ width, height, formatId, pin, before })}`);
      assert.ok(before.statement.y >= before.card.y - 1 && before.statement.bottom <= before.card.bottom + 1,
        `statement clipped by its own evidence card ${JSON.stringify({ width, height, formatId, pin, before })}`);
      // Unconditional, everywhere in the matrix: the statement itself is on screen at scrollTop
      // 0, the same first paint a facilitator actually sees. Never "reachable if you scroll".
      assert.equal(before.panelScrollTop, 0, `panel should not need to scroll yet ${JSON.stringify({ width, height, formatId, pin, before })}`);
      assert.ok(before.statement.bottom <= before.panel.bottom + 1, `statement not visible without scrolling ${JSON.stringify({ width, height, formatId, pin, before })}`);
      // DUEL-BOARD: at the same first paint (panel scrollTop 0, checked above), each finalist's
      // minus and +1 POINT buttons and duel points value, and the statement, must each be the
      // topmost element at points just inside their top, bottom, left and right edges: on screen,
      // not clipped by the finalists grid, not under the evidence card and not under the HUD. The
      // grid itself must show its whole content, never shrink and scroll.
      const board = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const state = el => {
          if (!el) return 'missing';
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return 'collapsed';
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          const insetX = Math.min(r.width / 2, 6), insetY = Math.min(r.height / 2, 6);
          const points = [[cx, r.y + insetY], [cx, r.bottom - insetY], [r.x + insetX, cy], [r.right - insetX, cy]];
          const reasons = points.map(([x, y]) => {
            if (x < 0 || y < 0 || x >= vw || y >= vh) return 'offscreen';
            const hit = document.elementFromPoint(x, y);
            if (hit === el || el.contains(hit)) return 'ok';
            return `covered-by:${hit?.closest('[data-role]')?.getAttribute('data-role') ?? hit?.className ?? 'nothing'}`;
          });
          return reasons.every(reason => reason === 'ok') ? 'visible' : reasons.join('|');
        };
        const size = el => el ? (({ width, height }) => ({ width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 }))(el.getBoundingClientRect()) : null;
        const grid = document.querySelector('[data-role="showdown-duel"] > .showdown-finalists-grid');
        const tiles = [...(grid?.querySelectorAll('.showdown-score-card') ?? [])];
        return {
          grid: grid ? { clientHeight: grid.clientHeight, scrollHeight: grid.scrollHeight } : null,
          tiles: tiles.map((tile, index) => {
            const award = document.querySelector(`[data-role="showdown-score-duelist-${index}"]`);
            const minus = tile.querySelector('.showdown-score-adjust-btn');
            const points = tile.querySelector('.showdown-duel-points-value');
            return { award: state(award), awardSize: size(award), minus: state(minus), minusSize: size(minus), points: state(points), pointsText: points?.textContent };
          }),
          statement: state(document.querySelector('.showdown-evidence-statement')),
          // PILL (round 8): the pill moved from the evidence card's grid into .showdown-header,
          // a flex row, so it is measured there now. It must stay its own compact width (never
          // stretch to fill the row) and its box must sit within the header row's own vertical
          // band, not spill above or below it.
          pill: (() => {
            const pageHeader = document.querySelector('.showdown-header');
            const pill = pageHeader?.querySelector('[data-role="showdown-discussion-pill"]');
            if (!pageHeader || !pill) return null;
            const p = pill.getBoundingClientRect();
            const h = pageHeader.getBoundingClientRect();
            return { width: p.width, headerWidth: h.width, y: p.y, bottom: p.bottom, headerY: h.y, headerBottom: h.bottom };
          })(),
          // PILL: the one-line answer detail/takeaway under the recap answer (see mustShowTakeaway
          // above for why this is `.showdown-evidence-takeaway`, not `.showdown-evidence-detail`,
          // for this fixture question). `.showdown-evidence-recap` is the takeaway's own nearest
          // clipping ancestor (overflow-y: auto), and the one row in the duel grid that gives up
          // height under pressure, so it is measured against that recap's own box, not
          // `.showdown-board-content` two levels out. A recap scroller can hide the takeaway below
          // its own bottom edge while `.showdown-board-content` still has room to spare below it,
          // which let a hidden takeaway read as on-screen before this fix. The four-point hit test
          // (see `state` above, already used by the award buttons) additionally catches the
          // takeaway sitting under something drawn on top of it, such as a facilitator bar.
          takeaway: (() => {
            const el = document.querySelector('.showdown-evidence-takeaway');
            const recap = document.querySelector('.showdown-evidence-recap');
            if (!el || !recap) return null;
            const r = el.getBoundingClientRect();
            const p = recap.getBoundingClientRect();
            const hit = state(el);
            return {
              bottom: Math.round(r.bottom),
              panelBottom: Math.round(p.bottom),
              recapScrollTop: recap.scrollTop,
              vh: innerHeight,
              hit,
              onScreen: r.bottom <= p.bottom + 1 && r.bottom <= innerHeight + 1 && recap.scrollTop === 0 && hit === 'visible',
            };
          })(),
        };
      });
      const boardContext = JSON.stringify({ width, height, formatId, pin, board });
      console.log(`DUEL_BOARD ${width}x${height} ${shownFormat} ${pin ? 'pinned' : 'hidden'} grid=${board.grid?.clientHeight}/${board.grid?.scrollHeight} award=${board.tiles.map(t => t.award).join(',')} minus=${board.tiles.map(t => t.minus).join(',')} points=${board.tiles.map(t => t.points).join(',')} statement=${board.statement} pill=${Math.round(board.pill?.width ?? -1)}/${Math.round(board.pill?.headerWidth ?? -1)} takeaway=${board.takeaway?.bottom}/${board.takeaway?.panelBottom}`);
      assert.ok(board.grid, `finalists grid missing ${boardContext}`);
      assert.ok(board.grid.scrollHeight <= board.grid.clientHeight + 1, `finalists grid shrank and clips its own tiles ${boardContext}`);
      assert.equal(board.tiles.length, 2, `expected both finalist tiles ${boardContext}`);
      for (const tile of board.tiles) {
        assert.equal(tile.award, 'visible', `+1 POINT award button not fully on screen ${boardContext}`);
        assert.equal(tile.minus, 'visible', `minus button not fully on screen ${boardContext}`);
        assert.equal(tile.points, 'visible', `duel points value not fully on screen ${boardContext}`);
        assert.ok(tile.awardSize.width >= 43.9 && tile.awardSize.height >= 43.9 && tile.minusSize.width >= 43.9 && tile.minusSize.height >= 43.9,
          `scoring controls below the 44px touch target ${boardContext}`);
      }
      assert.deepEqual(board.tiles.map(tile => tile.pointsText), ['2', '1'], `duel points values ${boardContext}`);
      assert.equal(board.statement, 'visible', `statement covered or off screen ${boardContext}`);
      // DISCUSSION-PILL / PILL: the pill stays its own compact width, never stretching to fill
      // its row, and its box sits within the header row's vertical band at every matrix size.
      assert.ok(board.pill, `discussion pill missing ${boardContext}`);
      assert.ok(board.pill.width < board.pill.headerWidth / 2,
        `discussion pill stretched across its row instead of staying compact ${boardContext}`);
      assert.ok(board.pill.y >= board.pill.headerY - 1 && board.pill.bottom <= board.pill.headerBottom + 1,
        `discussion pill box not within the header row's vertical band ${boardContext}`);
      pillBandChecked++;
      // PILL: the answer detail/takeaway line, pinned against a8d19d4's own measured baseline
      // (mustShowTakeaway above), never below the fold or clipped by the panel's own scroll.
      assert.ok(board.takeaway, `answer detail line missing ${boardContext}`);
      if (mustShowTakeaway.has(key)) {
        assert.ok(board.takeaway.onScreen, `answer detail line pushed below the fold ${boardContext}`);
        takeawayChecked++;
      }
      if (width === 1280 && height === 720 && formatId === 'widescreen') {
        // The ruling's named target, both HUD states: fully inside the viewport, not merely
        // "reachable if you scroll" (the panel's overflow-y: auto ancestor would otherwise hide
        // it below its own bottom edge while it stayed technically present in the DOM).
        assert.ok(board.takeaway.bottom <= board.takeaway.vh,
          `answer detail line off the bottom of the 1280x720 viewport ${boardContext}`);
        assert.ok(board.takeaway.bottom <= board.takeaway.panelBottom,
          `answer detail line clipped by the panel's own scroll at 1280x720 ${boardContext}`);
      }
      if (mustFitWithoutScroll.has(key)) {
        assert.ok(before.actions.bottom <= before.panel.bottom + 1 && (!before.hud || before.actions.bottom <= before.hud.y + 1),
          `action bar not visible without scrolling ${JSON.stringify({ width, height, formatId, pin, before })}`);
      }
      // Whether or not it needed a scroll, the action bar must be reachable one way or the other.
      const reach = await page.evaluate(() => {
        const actions = document.querySelector('[data-role="showdown-duel-actions"]');
        actions?.scrollIntoView({ block: 'end' });
        const btn = actions?.querySelector('button:not([disabled])');
        const b = btn?.getBoundingClientRect();
        const hit = b ? document.elementFromPoint(b.x + Math.min(4, b.width / 2), b.y + Math.min(4, b.height / 2)) : null;
        return { reachable: Boolean(btn) && (btn === hit || btn.contains(hit)) };
      });
      assert.ok(reach.reachable, `action bar unreachable even after scrolling the panel to it ${JSON.stringify({ width, height, formatId, pin })}`);
      assert.deepEqual(errors, []);
      checked++;
    } finally { await context.close(); }
  }
  assert.equal(checked, matrix.length);
  assert.equal(pillBandChecked, matrix.length);
  assert.equal(takeawayChecked, mustShowTakeaway.size);
  console.log(`B2_SHOWDOWN_RECAP_COVERAGE states=${checked}`);
  console.log(`PILL_COVERAGE states=${checked} pillBand=${pillBandChecked} takeawayOnScreen=${takeawayChecked}/${mustShowTakeaway.size}`);
});

test('Q16-RECAP: the duel recap statement is never blank, for every question id the showdown pool can draw', async () => {
  // createShowdownState (game-store.ts) draws its duel pair from the last two question slides of
  // whatever run the session actually played (recapQuestionIds), so any question id in the deck
  // can end up as the drawn duel question, not just a fixed pair. q16 is a which-patient card
  // with a `scenario` and no `statement` field. It is not the only one, about 20 which-patient
  // cards in the topic decks also carry no `statement`, and the recap card used to read
  // `question.statement` directly, so
  // it rendered a blank `.showdown-evidence-statement` line whenever q16 was drawn. This draws
  // every id in the pool, one at a time, and requires a non-empty statement for every one of
  // them, not only q16, so no other question can regress the same way unnoticed.
  const { page, errors, context } = await openHost('reduce', false, { width: 1280, height: 720 });
  try {
    const ids = await page.evaluate(() => window.lifeQuestions.map((question) => question.id));
    assert.ok(ids.length > 30, `the pool must be the real deck, saw ${ids.length} ids`);
    assert.ok(ids.includes('q16'), 'q16 must actually be in the pool this test sweeps');

    let checked = 0;
    for (const id of ids) {
      await page.evaluate((drawnId) => {
        const store = window.lifeStore, initial = store.getInitialState(), q = window.lifeQuestions;
        store.setState({
          ...initial, sessionId: 'q16-recap', offlineMode: false, phase: 'showdown', formatId: 'widescreen', run: q, slideIndex: 0,
          showdown: {
            id: 'q16-recap', stage: 'duel',
            finalists: [{ ticket: 'T-01', name: 'Participant A', score: 42, duelPoints: 2 }, { ticket: 'T-02', name: 'Participant B', score: 39, duelPoints: 1 }],
            predictions: {}, predictionCounts: { 'T-01': 0, 'T-02': 0 },
            questionIds: [drawnId], questionIndex: 0, winner: null, tie: false, isRecap: true,
          },
        });
      }, id);
      await page.locator('[data-screen="showdown"]').waitFor();
      await page.waitForFunction(() => {
        const el = document.querySelector('.showdown-evidence-statement');
        return Boolean(el && el.textContent && el.textContent.trim().length > 0);
      }).catch(() => {});
      const text = (await page.locator('.showdown-evidence-statement').textContent().catch(() => null))?.trim() ?? '';
      assert.ok(text.length > 0, `question ${id} must not render a blank duel recap statement`);
      checked++;
    }
    assert.deepEqual(errors, []);
    assert.equal(checked, ids.length);
    console.log(`Q16_RECAP_COVERAGE questions=${checked}/${ids.length}`);
  } finally { await context.close(); }
});

// BLOCKER-3 (premium-host-fix-3): tests/unit/offline-stage-layout.test.ts's own pager test only
// regex-matched the word "closingAdvanceStep" against Closing.tsx's source text, so it stayed
// green even against a comment mentioning the word, not the actual paging behavior. A real
// behavior test needs a mounted component whose effects actually run (the page-advance logic
// lives in a useEffect keyed on closingAdvanceStep), which the unit tier's renderToStaticMarkup
// cannot do (SSR never runs effects) and this repo carries no jsdom. This lives here instead,
// alongside the rest of the store-dispatch-then-assert-the-DOM pattern this file already uses.
test('Closing offline recap pager advances on a real ADVANCE dispatch, not just a click', async () => {
  const { page, errors, context } = await openHost('reduce', true);
  try {
    await page.evaluate(async () => {
      const { vaxOrFictionDeck } = await import('/src/data/decks/vax-or-fiction.ts');
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      const questions = vaxOrFictionDeck.questions.slice(0, 8);
      window.lifeStore.setState({
        ...initial, sessionId: 'pager-behavior', phase: 'closing', formatId: 'widescreen',
        offlineMode: true, interactionMode: 'facilitator', leaderboardEnabled: true,
        run: [titleSlide, ...questions, closingSlide], slideIndex: questions.length + 1,
        seenDevices: {}, showdown: null,
      });
    });
    await page.locator('[data-role="closing-offline-pager"]').waitFor();
    // widescreen pages at 6 per page (OFFLINE_RECAP_PAGE_SIZE): 8 questions is 2 pages.
    assert.equal((await page.locator('.closing-offline-pager__count').textContent()).trim(), '1 / 2');
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
    await page.locator('.closing-offline-pager__count', { hasText: '2 / 2' }).waitFor();
    assert.equal((await page.locator('.closing-offline-pager__count').textContent()).trim(), '2 / 2');
    // BACK on page 2 returns to page 1 (WARNING-1, premium-host-fix-3).
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'BACK' }));
    await page.locator('.closing-offline-pager__count', { hasText: '1 / 2' }).waitFor();
    assert.equal((await page.locator('.closing-offline-pager__count').textContent()).trim(), '1 / 2');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// WARNING-12 (premium-host-fix-3): VOF-24 keeps facilitator controls off the audience canvas.
// The offline pager's gold Previous/Next buttons must start hidden, reveal on pointer activity
// or focus, and keyboard/clicker paging (the store dispatch this file already proves in the
// BLOCKER-3 test above) must keep working the whole time regardless of visibility.
// BLOCKER item 4 (premium-host-fix-5): real clicks, not just geometry. With the pager revealed
// at 1080x1920 offline, Previous/Next must only turn pages, and must never fire the facilitator
// actions row underneath (Play again/RESET, Back to main menu/RESET, Finish), the exact hazard
// the reviewer's repro described: a click meant for the visible pager landing on an invisible-
// but-clickable control painted later in the DOM.
test('offline Closing portrait with the pager revealed: clicking Previous/Next only turns pages, never resets or finishes', async () => {
  const { page, errors, context } = await openHost('reduce', true, { width: 1080, height: 1920 });
  try {
    await page.evaluate(async () => {
      const { vaxOrFictionDeck } = await import('/src/data/decks/vax-or-fiction.ts');
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      const questions = vaxOrFictionDeck.questions.slice(0, 8);
      window.lifeStore.setState({
        ...initial, sessionId: 'pager-click-safety', phase: 'closing', formatId: 'portrait',
        offlineMode: true, interactionMode: 'facilitator', leaderboardEnabled: true,
        run: [titleSlide, ...questions, closingSlide], slideIndex: questions.length + 1,
        seenDevices: {}, showdown: null,
      });
    });
    const pager = page.locator('[data-role="closing-offline-pager"]');
    await pager.waitFor();
    await page.evaluate(() => document.querySelector('[data-role="closing-offline-pager"]')?.setAttribute('data-revealed', 'true'));
    await page.waitForFunction(() => document.querySelector('[data-role="closing-offline-pager"]')?.getAttribute('data-revealed') === 'true');
    assert.equal((await page.locator('.closing-offline-pager__count').textContent()).trim(), '1 / 2', 'a real 8-question, portrait 3-per-page run');
    await page.locator('[data-role="closing-offline-next"]').click();
    await page.waitForFunction(() => document.querySelector('.closing-offline-pager__count')?.textContent?.trim() === '2 / 2');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'Next must not have left Closing (no RESET, no Finish)');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().sessionId), 'pager-click-safety', 'Next must not have fired Play again (a real session RESET)');
    await page.locator('[data-role="closing-offline-prev"]').click();
    await page.waitForFunction(() => document.querySelector('.closing-offline-pager__count')?.textContent?.trim() === '1 / 2');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'Previous must not have left Closing (no RESET, no Finish)');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().sessionId), 'pager-click-safety', 'Previous must not have fired Play again (a real session RESET)');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// item 6 (premium-host-fix-5): the portrait click-safety test above is the one canvas attempt
// 2's fix actually broke (the pager overlapped .closing-actions-row there worst, about 186x99px).
// 1920x1080 had the same real overlap (about 48x15px, the atlas's own RED-first evidence for this
// pass), smaller only because there is more room, not because the underlying bug was portrait-
// only. Same click-safety proof at the widescreen canvas.
test('offline Closing widescreen with the pager revealed: clicking Previous/Next only turns pages, never resets or finishes', async () => {
  const { page, errors, context } = await openHost('reduce', true, { width: 1920, height: 1080 });
  try {
    await page.evaluate(async () => {
      const { vaxOrFictionDeck } = await import('/src/data/decks/vax-or-fiction.ts');
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      const questions = vaxOrFictionDeck.questions.slice(0, 8);
      window.lifeStore.setState({
        ...initial, sessionId: 'pager-click-safety-widescreen', phase: 'closing', formatId: 'widescreen',
        offlineMode: true, interactionMode: 'facilitator', leaderboardEnabled: true,
        run: [titleSlide, ...questions, closingSlide], slideIndex: questions.length + 1,
        seenDevices: {}, showdown: null,
      });
    });
    const pager = page.locator('[data-role="closing-offline-pager"]');
    await pager.waitFor();
    await page.evaluate(() => document.querySelector('[data-role="closing-offline-pager"]')?.setAttribute('data-revealed', 'true'));
    await page.waitForFunction(() => document.querySelector('[data-role="closing-offline-pager"]')?.getAttribute('data-revealed') === 'true');
    // widescreen pages at 6 per page (OFFLINE_RECAP_PAGE_SIZE): 8 questions is 2 pages.
    assert.equal((await page.locator('.closing-offline-pager__count').textContent()).trim(), '1 / 2');
    await page.locator('[data-role="closing-offline-next"]').click();
    await page.waitForFunction(() => document.querySelector('.closing-offline-pager__count')?.textContent?.trim() === '2 / 2');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'Next must not have left Closing (no RESET, no Finish)');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().sessionId), 'pager-click-safety-widescreen', 'Next must not have fired Play again (a real session RESET)');
    await page.locator('[data-role="closing-offline-prev"]').click();
    await page.waitForFunction(() => document.querySelector('.closing-offline-pager__count')?.textContent?.trim() === '1 / 2');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'Previous must not have left Closing (no RESET, no Finish)');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().sessionId), 'pager-click-safety-widescreen', 'Previous must not have fired Play again (a real session RESET)');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the offline pager stays hidden until pointer activity or focus, and paging still works while hidden', async () => {
  const { page, errors, context } = await openHost('reduce', true);
  try {
    await page.evaluate(async () => {
      const { vaxOrFictionDeck } = await import('/src/data/decks/vax-or-fiction.ts');
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      const questions = vaxOrFictionDeck.questions.slice(0, 8);
      window.lifeStore.setState({
        ...initial, sessionId: 'pager-reveal', phase: 'closing', formatId: 'widescreen',
        offlineMode: true, interactionMode: 'facilitator', leaderboardEnabled: true,
        run: [titleSlide, ...questions, closingSlide], slideIndex: questions.length + 1,
        seenDevices: {}, showdown: null,
      });
    });
    const pager = page.locator('[data-role="closing-offline-pager"]');
    await pager.waitFor();
    assert.equal(await pager.getAttribute('data-revealed'), 'false', 'the pager starts hidden');
    // Paging works with the pager still hidden.
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'ADVANCE' }));
    await page.locator('.closing-offline-pager__count', { hasText: '2 / 2' }).waitFor();
    assert.equal(await pager.getAttribute('data-revealed'), 'false', 'still hidden after a dispatched ADVANCE');
    // Pointer activity reveals it.
    await page.mouse.move(200, 200);
    await page.mouse.move(210, 210);
    await page.waitForFunction(() => document.querySelector('[data-role="closing-offline-pager"]')?.getAttribute('data-revealed') === 'true', undefined, { timeout: 2000 });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// BLOCKER-2 (premium-host-fix-4): game-store.ts's 'BACK' case intercepted BACK for every venue
// during the whole closing phase, not only offline. An online (or in-room) Closing has no pager
// to turn, so that intercept just ate the facilitator's Back with no way to leave the screen.
test('online Closing: two ADVANCE then one BACK leaves Closing', async () => {
  const { page, errors, context } = await openHost('reduce', false);
  try {
    await page.evaluate(async () => {
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      window.lifeStore.setState({
        ...initial, sessionId: 'online-closing-back', phase: 'closing', formatId: 'widescreen',
        offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true,
        run: [titleSlide, closingSlide], slideIndex: 1, seenDevices: {}, showdown: null,
      });
    });
    await page.locator('[data-screen="closing"]').waitFor();
    await page.evaluate(() => { const d = window.lifeStore.getState().dispatch; d({ type: 'ADVANCE' }); d({ type: 'ADVANCE' }); });
    assert.equal(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'still on closing after two ADVANCE (no pager to advance, online)');
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'BACK' }));
    await page.waitForFunction(() => window.lifeStore.getState().phase !== 'closing', undefined, { timeout: 2000 });
    assert.notEqual(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'one BACK on online Closing must leave the screen, not turn a pager nobody can see');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// BLOCKER-2 (premium-host-fix-4): the same intercept meant a crashed or pager-less offline
// Closing on page 1 also had nothing consuming closingBackStep. This proves the real recovery
// path (BACK_FROM_CLOSING) actually runs the original transition when dispatched directly, the
// same action Keyboard.tsx now sends whenever the pager is not in the DOM.
test('offline Closing page 1: BACK_FROM_CLOSING leaves Closing', async () => {
  const { page, errors, context } = await openHost('reduce', true);
  try {
    await page.evaluate(async () => {
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      window.lifeStore.setState({
        ...initial, sessionId: 'offline-closing-back-from', phase: 'closing', formatId: 'widescreen',
        offlineMode: true, interactionMode: 'facilitator', leaderboardEnabled: true,
        run: [titleSlide, closingSlide], slideIndex: 1, seenDevices: {}, showdown: null,
      });
    });
    await page.locator('[data-screen="closing"]').waitFor();
    assert.equal(await page.evaluate(() => window.lifeStore.getState().phase), 'closing');
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'BACK_FROM_CLOSING' }));
    await page.waitForFunction(() => window.lifeStore.getState().phase !== 'closing', undefined, { timeout: 2000 });
    assert.notEqual(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'BACK_FROM_CLOSING must run the real transition and leave Closing');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// item 6 (premium-host-fix-5): the HUD's own Back button (handleBack, HUD.tsx) uses the same
// DOM-presence check Keyboard.tsx does, but nothing had actually crashed Closing and clicked the
// real button to prove it. `run` stays a real array (game-store.ts's own persist partialize,
// playerVisibleRun, calls `run.filter` on every setState, so a non-array run throws before
// Closing ever renders) but has its own Symbol.iterator overridden to throw: Array.prototype.
// filter walks length/index, never the iterator protocol, so persist keeps working, while
// Closing.tsx's offlineRecap memo (`for (const slide of run ?? [])`) does use it and throws
// synchronously during render. SlideErrorBoundary (a sibling scope of HUD in
// PresentationSuite.tsx, so HUD survives) catches it, unmounting Closing (and its pager) while
// phase stays 'closing'.
test('the HUD Back button leaves a crashed offline Closing', async () => {
  const { page, context } = await openHost('reduce', true);
  try {
    // First lands on a genuinely working Closing (a real array run), so HUD's own first mount
    // (setup flips false the same render this phase change lands on) commits cleanly. A second,
    // separate setState then swaps run to the throwing-iterator array, so only Closing's own
    // re-render throws: HUD, already mounted from the first commit, is an untouched sibling this
    // time, not caught up in the same aborted render pass the crash unwinds.
    await page.evaluate(() => {
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      window.lifeStore.setState({
        ...initial, sessionId: 'closing-crash-hud-back', phase: 'closing', formatId: 'widescreen',
        offlineMode: true, interactionMode: 'facilitator', leaderboardEnabled: true,
        run: [titleSlide, closingSlide], slideIndex: 1, seenDevices: {}, showdown: null,
      });
    });
    // The HUD bar itself auto-hides behind a peek tab until shown (the same HUD_SHOW dispatch its
    // own peek-tab click sends): reveal it before the crash, the same way a facilitator's hand
    // would already be resting on it going into a run.
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'HUD_SHOW', restore: true }));
    await page.waitForSelector('[data-role="hud"]');
    await page.locator('[data-role="hud"]').hover();
    await page.locator('[data-testid="hud-back"]').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const state = window.lifeStore.getState();
      const unIterableRun = [...state.run];
      Object.defineProperty(unIterableRun, Symbol.iterator, {
        value: () => { throw new Error('forced-unrenderable-run'); },
      });
      window.lifeStore.setState({ run: unIterableRun });
    });
    await page.locator('[data-role="slide-error-boundary"]').waitFor();
    assert.equal(await page.locator('[data-role="closing-offline-pager"]').count(), 0, 'the crashed Closing must not still have its pager mounted');
    assert.equal(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'still on closing right after the crash, before Back is pressed');
    await page.locator('[data-role="hud"]').hover();
    await page.locator('[data-testid="hud-back"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="hud-back"]').click();
    await page.waitForFunction(() => window.lifeStore.getState().phase !== 'closing', undefined, { timeout: 2000 });
    assert.notEqual(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'the HUD Back button must recover a crashed offline Closing, not go dead');
  } finally { await context.close(); }
});

// W1 (premium-host-fix-5): a real pager, real page 1, a plain BACK dispatch (not
// BACK_FROM_CLOSING directly): proves the whole store-effect chain end to end, not just the
// recovery action in isolation. game-store.ts's 'BACK' case bumps closingBackStep, Closing.tsx's
// effect sees offlinePage === 0 (already on page 1, nothing to turn back to) and re-dispatches
// BACK_FROM_CLOSING itself, which must leave Closing.
test('offline Closing with a real pager on page 1: a plain BACK leaves Closing', async () => {
  const { page, errors, context } = await openHost('reduce', true);
  try {
    await page.evaluate(async () => {
      const initial = window.lifeStore.getInitialState();
      const titleSlide = initial.run.find((s) => s.type === 'title');
      const closingSlide = { id: 'closing', type: 'closing', title: 'Thanks for playing', imageRequirementId: 'plate-care-team' };
      window.lifeStore.setState({
        ...initial, sessionId: 'offline-closing-real-pager-back', phase: 'closing', formatId: 'widescreen',
        offlineMode: true, interactionMode: 'facilitator', leaderboardEnabled: true,
        // No question slides in run: offlineRecap falls back to the whole bundled deck (well
        // over 6 questions, a real pager at widescreen's 6-per-page), while slideIndex 1 still
        // points straight at the closing slide with only the title before it, so back() lands on
        // a real, non-question slide and phase genuinely leaves 'closing' (unlike a slideIndex
        // that would land back on an unrevealed question, where 'closing' as a phase label can
        // legitimately persist across the transition, a different, not-yet-covered case).
        run: [titleSlide, closingSlide], slideIndex: 1, seenDevices: {}, showdown: null,
      });
    });
    const pager = page.locator('[data-role="closing-offline-pager"]');
    await pager.waitFor();
    const count = await page.locator('.closing-offline-pager__count').textContent();
    assert.match(count, /^1 \/ \d+$/, 'starts on page 1 of a real (whole-deck-fallback) pager');
    assert.notEqual(count, '1 / 1', 'the pager must actually have more than one page for this to be a real test');
    await page.evaluate(() => window.lifeStore.getState().dispatch({ type: 'BACK' }));
    await page.waitForFunction(() => window.lifeStore.getState().phase !== 'closing', undefined, { timeout: 2000 });
    assert.notEqual(await page.evaluate(() => window.lifeStore.getState().phase), 'closing', 'a plain BACK on page 1, with a real pager mounted, must leave Closing');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// WARNING-2 (premium-host-fix-3): PresentationSuite's own hydration/re-sync effect (B1, pass 2)
// self-corrects a desynced venue offline + interactionMode polling combination, but had no test
// exercising it as a mounted effect, only as source text. venue offline forces
// SET_INTERACTION_MODE facilitator whenever it observes the mismatch, which a returning host's
// persisted interactionMode can carry in from an earlier online session.
test('venue offline self-corrects a stale polling interactionMode on mount', async () => {
  const { page, errors, context } = await openHost('reduce', true);
  try {
    assert.equal(await page.evaluate(() => window.lifeStore.getState().offlineMode), true, 'venue offline must have already set offlineMode true');
    await page.evaluate(() => window.lifeStore.setState({ interactionMode: 'polling' }));
    await page.waitForFunction(() => window.lifeStore.getState().interactionMode === 'facilitator', undefined, { timeout: 2000 });
    assert.equal(await page.evaluate(() => window.lifeStore.getState().interactionMode), 'facilitator');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
