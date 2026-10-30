import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startVite, withViteAndBrowser, wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

function legacyRoomState(phase) {
  return {
    sessionId: `legacy-${phase}`,
    phase,
    slideIndex: 0,
    run: [{
      id: 'legacy-question',
      type: 'question',
      kind: 'binary',
      statement: 'The flu vaccine gives you flu.',
      answer: false,
      explanation: 'The flu vaccine cannot cause flu illness.',
      takeaway: 'Vaccination trains immunity without causing flu illness.',
      source: 'CDC',
    }],
    interactionMode: 'polling',
    pollVotes: {},
    pollVoters: {},
    seenDevices: {},
    roomStats: {
      questions: {}, accuracy: 0, streak: 0, bestStreak: 0, mythsBusted: 0,
      swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal: 0,
    },
    timer: {
      durationMs: 30_000, remainingMs: 30_000, running: false, enabled: false,
      visible: false, pauseReason: null, generation: 0, endsAt: null,
    },
    // Intentionally omit offlineMode: this is the pre-offline-persistence shape.
  };
}

async function openLegacyRoom(browser, { room, venue, phase }) {
  const context = await browser.newContext();
  await context.addInitScript(({ roomId, selectedVenue, persistedState }) => {
    localStorage.setItem('vrc_audio_muted', 'true');
    sessionStorage.setItem(`vof:presentation-venue:${encodeURIComponent(roomId)}`, selectedVenue);
    sessionStorage.setItem(`vof-game-session:${roomId}`, JSON.stringify({ state: persistedState }));

    const transports = { roomSockets: [], broadcastChannels: [] };
    globalThis.__vofTransportConstructors = transports;
    globalThis.__vofFirstPresentationState = null;
    const captureFirstPresentationState = () => {
      let scheduled = false;
      const observer = new MutationObserver(() => {
        const screen = document.querySelector('[data-screen="closing"], [data-comp-id="question-shell"]');
        if (!screen || scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          globalThis.__vofFirstPresentationState = {
            offlineClosing: Boolean(document.querySelector('[data-role="offline-closing"]')),
            onlineClosing: Boolean(document.querySelector('[data-role="closing-no-responses"]')),
            statusRail: Boolean(document.querySelector('[data-role="status-rail"]')),
            roomCode: Boolean(document.querySelector('.show-footer__room')),
          };
          observer.disconnect();
        });
      });
      observer.observe(document, { childList: true, subtree: true });
    };
    captureFirstPresentationState();
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = new Proxy(NativeWebSocket, {
      construct(Target, args) {
        const rawUrl = String(args[0]);
        const parsed = new URL(rawUrl, globalThis.location.href);
        if (parsed.pathname.startsWith('/api/rooms/') && parsed.pathname.endsWith('/ws')) {
          transports.roomSockets.push(parsed.href);
        }
        return Reflect.construct(Target, args);
      },
    });
    const NativeBroadcastChannel = globalThis.BroadcastChannel;
    if (typeof NativeBroadcastChannel === 'function') {
      globalThis.BroadcastChannel = new Proxy(NativeBroadcastChannel, {
        construct(Target, args) {
          transports.broadcastChannels.push(String(args[0]));
          return Reflect.construct(Target, args);
        },
      });
    }
  }, { roomId: room, selectedVenue: venue, persistedState: legacyRoomState(phase) });
  const page = await context.newPage();
  return { context, page };
}

async function transportConstructors(page) {
  return page.evaluate(() => globalThis.__vofTransportConstructors);
}

test('mounted lock announcement counts voters, including shared choices and changed answers', { timeout: 20_000 }, async () => {
  const vite = await startVite();
  let browser;
  try {
    browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const page = await context.newPage();
    await page.goto(`${vite.url}/?room=ANNOUNCEMENT&host=1`);
    await page.getByRole('heading', { name: 'Your game is ready' }).waitFor();
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      const initial = useGameStore.getInitialState();
      const question = initial.run.find((entry) => entry.kind === 'binary');
      useGameStore.setState({ ...initial, run: [question], slideIndex: 0, phase: 'deliberating',
        offlineMode: false, interactionMode: 'polling', votesLocked: false });
      for (let i = 0; i < 5; i += 1) {
        const dispatch = useGameStore.getState().dispatch;
        dispatch({ type: 'RECORD_HELLO', deviceId: `qa-${i}`, nickname: `QA ${i}` });
        dispatch({ type: 'RECORD_VOTE', deviceId: `qa-${i}`, choice: 'true', conviction: 'certain', questionId: question.id });
      }
      useGameStore.getState().dispatch({ type: 'LOCK_VOTES' });
    });
    const announcement = page.locator('.question-shell .sr-only[aria-live="polite"]');
    await page.waitForFunction(() => document.querySelector('.question-shell .sr-only[aria-live="polite"]')?.textContent?.includes('Votes locked'));
    assert.equal(await announcement.innerText(), 'Votes locked. 5 votes.');
    for (const choice of ['false', 'true']) {
      await page.evaluate(async (nextChoice) => {
        const { useGameStore } = await import('/src/store/game-store.ts');
        useGameStore.setState({ phase: 'deliberating', votesLocked: false });
        const state = useGameStore.getState();
        state.dispatch({ type: 'RECORD_VOTE', deviceId: 'qa-0', choice: nextChoice, conviction: 'certain', questionId: state.run[0].id });
        state.dispatch({ type: 'LOCK_VOTES' });
      }, choice);
      assert.equal(await announcement.innerText(), 'Votes locked. 5 votes.');
    }
    console.log('coverage: 5 actual voters, one shared bucket, two answer changes, mounted live region');
  } finally {
    await browser?.close().catch(() => {});
    if (vite.child.exitCode === null && vite.child.signalCode === null) {
      const exited = new Promise((resolve) => vite.child.once('exit', resolve));
      vite.child.kill('SIGTERM'); await exited;
    }
  }
});

test('mounted host and independent phone share question, result and explanation through the real relay and survive reloads', { timeout: 45_000 }, async () => {
  const vite = await startVite();
  console.log('mounted-room: vite ready');
  let browser;
  try {
    browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
    const hostContext = await browser.newContext();
    const phoneContext = await browser.newContext();
    await hostContext.addInitScript(() => { localStorage.setItem('vrc_audio_muted', 'true'); Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined }); });
    await phoneContext.addInitScript(() => { localStorage.setItem('vrc_audio_muted', 'true'); Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined }); });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    await host.goto(`${vite.url}/?room=Exact_Room-9&host=1`, { waitUntil: 'load' });
    console.log('mounted-room: host loaded');
    await phone.goto(`${vite.url}/?vote=1&room=Exact_Room-9`, { waitUntil: 'load' });
    console.log('mounted-room: phone loaded');
    await phone.locator('[data-role="phone-connection-status"]').filter({ hasText: 'connected' }).waitFor();
    console.log('mounted-room: phone connected');
    await phone.locator('[data-role="nickname-input"]').fill('Ada');
    console.log('mounted-room: nickname filled');
    await phone.locator('[data-role="join-submit-btn"]').click();
    console.log('mounted-room: join submitted');
    await phone.locator('[data-role="phone-join"]').waitFor({ state: 'detached' });
    console.log('mounted-room: join detached');
    await phone.locator('[data-role="phone-attendee-label"]').filter({ hasText: 'Ada' }).waitFor();
    console.log('mounted-room: attendee joined');

    await phone.setViewportSize({ width: 390, height: 844 });
    await host.evaluate(async () => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      const state = useGameStore.getState();
      const question = { id: 'shared-beat-one', type: 'question', kind: 'which-patient',
        statement: 'Choose the second token.', choices: ['First token', 'Second token', 'Third token'], bestIndex: 1,
        reveal: 'The second token is the expected result.', takeaway: 'Read every option.' };
      useGameStore.setState({ run: [question, { ...question, id: 'shared-beat-two', statement: 'A fresh question.' }], slideIndex: 0,
        phase: 'entering', offlineMode: false, interactionMode: 'polling', votesLocked: false,
        timer: { ...state.timer, running: false, enabled: false, visible: false } });
    });
    await phone.locator('[data-role="question-stem"]').filter({ hasText: 'Choose the second token.' }).waitFor();
    assert.equal(await phone.locator('[data-role="canonical-verdict"], [data-role="takeaway-card"]').count(), 0, 'no answer or explanation before reveal');
    await phone.locator('[data-choice="b"]').click();
    await phone.locator('[data-role="vote-confirmation-badge"][data-state="in"]').waitFor();
    const dispatch = async (type) => host.evaluate(async (type) => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      useGameStore.getState().dispatch({ type });
    }, type);
    await dispatch('LOCK_VOTES');
    assert.equal(await phone.locator('[data-role="canonical-verdict"], [data-role="takeaway-card"]').count(), 0, 'lock still hides both');
    await dispatch('REVEAL');
    // .question-beat scopes to the per-beat section: Question.tsx also stamps data-stage-beat on the persistent
    // .question-shell wrapper, so the bare attribute now matches two elements and a locator.waitFor() throws
    // strict-mode instead of waiting.
    await host.locator('.question-beat[data-stage-beat="result"]').waitFor();
    await phone.locator('[data-role="canonical-verdict"]').filter({ hasText: 'Second token' }).waitFor();
    assert.equal(await phone.locator('[data-role="takeaway-card"]').count(), 0, 'result has its own phone screen');
    const score = await host.evaluate(async () => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      return Object.values(useGameStore.getState().seenDevices).map(d => ({ score: d.score, answered: d.answered }));
    });
    await dispatch('ADVANCE');
    await host.locator('.question-beat[data-stage-beat="explanation"]').waitFor();
    await phone.locator('[data-role="takeaway-card"]').filter({ hasText: 'The second token is the expected result.' }).waitFor();
    assert.equal(await phone.locator('[data-role="outcome-banner"]').count(), 0, 'explanation replaces the result');

    await phone.reload({ waitUntil: 'load' });
    console.log('mounted-room: phone reloaded');
    await phone.locator('[data-role="phone-attendee-label"]').filter({ hasText: 'Ada' }).waitFor();
    assert.equal(await phone.locator('[data-role="phone-join"]').count(), 0);

    await host.reload({ waitUntil: 'load' });
    console.log('mounted-room: host reloaded');
    await phone.locator('[data-role="phone-connection-status"]').filter({ hasText: 'connected' }).waitFor();
    assert.equal(await phone.locator('[data-role="phone-join"]').count(), 0);
    await host.locator('.question-beat[data-stage-beat="explanation"]').waitFor();
    await phone.locator('[data-role="takeaway-card"]').waitFor();
    await dispatch('BACK');
    await phone.locator('[data-role="outcome-banner"]').waitFor();
    await dispatch('ADVANCE');
    await phone.locator('[data-role="takeaway-card"]').waitFor();
    assert.deepEqual(await host.evaluate(async () => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      return Object.values(useGameStore.getState().seenDevices).map(d => ({ score: d.score, answered: d.answered }));
    }), score, 'back, explanation and reload never resettle the vote');
    await dispatch('ADVANCE');
    await phone.locator('[data-role="question-stem"]').filter({ hasText: 'A fresh question.' }).waitFor();
    assert.equal(await phone.locator('[data-role="canonical-verdict"], [data-role="takeaway-card"]').count(), 0);
    console.log('coverage: independent phone, real relay, hidden before reveal/lock, separate result/explanation, both reloads, back, score idempotency, next question');
  } finally {
    await browser?.close().catch(() => {});
    if (vite.child.exitCode === null) {
      const exited = new Promise((resolve) => vite.child.once('exit', resolve));
      vite.child.kill('SIGTERM');
      await exited;
    }
  }
});

// STREAK-PILL: room mode's own copy of the dead "Streak Bonus!" pill. 6826f19 fixed the pill for
// solo (never crosses the relay). This proves the room-mode fix through a real host, a real
// independent phone, and the real dev relay (server/room-relay.mjs), not a hand-fed fixture.
// Verified against 1563dbe (this branch's own base commit, read via `git show`, never checked
// out): src/network/game-projection.ts's projectAttendeeState never put streakBonus on `result`
// at all there, so this same run would leave the pill absent even on the 3-streak reveal.
test('a player who earns a 3-streak and a 5-streak sees the room-mode Streak Bonus! pill only on those reveals', { timeout: 60_000 }, async () => {
  const vite = await startVite();
  let browser;
  try {
    browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
    const hostContext = await browser.newContext();
    const phoneContext = await browser.newContext();
    await hostContext.addInitScript(() => { localStorage.setItem('vrc_audio_muted', 'true'); Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined }); });
    await phoneContext.addInitScript(() => { localStorage.setItem('vrc_audio_muted', 'true'); Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined }); });
    const host = await hostContext.newPage();
    const phone = await phoneContext.newPage();
    await host.goto(`${vite.url}/?room=Streak_Room-1&host=1`, { waitUntil: 'load' });
    await phone.goto(`${vite.url}/?vote=1&room=Streak_Room-1`, { waitUntil: 'load' });
    await phone.locator('[data-role="phone-connection-status"]').filter({ hasText: 'connected' }).waitFor();
    await phone.locator('[data-role="nickname-input"]').fill('Ada');
    await phone.locator('[data-role="join-submit-btn"]').click();
    await phone.locator('[data-role="phone-join"]').waitFor({ state: 'detached' });
    await phone.locator('[data-role="phone-attendee-label"]').filter({ hasText: 'Ada' }).waitFor();
    await phone.setViewportSize({ width: 390, height: 844 });

    // 5 questions, not 3: the 3-streak milestone pays a flat 50, but every-5-streak pays the real
    // ceiling of 100 (scoring.ts's MAX_STREAK_BONUS), which the 3-streak-only version of this test
    // never reached. A bound quietly lowered on any of the three surfaces (guards.ts, the dev relay,
    // the production migration) would still let a 3-streak's +50 through, hiding the drift.
    await host.evaluate(async () => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      const state = useGameStore.getState();
      const run = [1, 2, 3, 4, 5].map((index) => ({
        id: `streak-q${index}`, type: 'question', kind: 'binary',
        statement: `Streak question ${index}.`, answer: true,
        reveal: `Explanation ${index}.`, takeaway: `Takeaway ${index}.`,
      }));
      useGameStore.setState({ run, slideIndex: 0, phase: 'entering', offlineMode: false,
        interactionMode: 'polling', votesLocked: false,
        timer: { ...state.timer, running: false, enabled: false, visible: false } });
    });
    const dispatch = (type) => host.evaluate(async (type) => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      useGameStore.getState().dispatch({ type });
    }, type);

    const milestonePill = { 3: '+50 Streak Bonus!', 5: '+100 Streak Bonus!' };
    for (const index of [1, 2, 3, 4, 5]) {
      await phone.locator('[data-role="question-stem"]').filter({ hasText: `Streak question ${index}.` }).waitFor();
      await phone.locator('[data-choice="true"]').click();
      await phone.locator('[data-role="vote-confirmation-badge"][data-state="in"]').waitFor();
      await dispatch('LOCK_VOTES');
      await dispatch('REVEAL');
      // Scoped to this question's own id: an outgoing question's result beat can still be mid-exit
      // in the DOM (strict mode would otherwise match it alongside the new one) across 5 questions.
      await host.locator(`.question-beat[data-stage-beat="result"][data-question-id="streak-q${index}"]`).waitFor();
      await phone.locator('[data-role="outcome-banner"]').waitFor();
      const pill = phone.locator('[data-role="streak-bonus-pill"]');
      const expected = milestonePill[index];
      if (!expected) {
        assert.equal(await pill.count(), 0, `question ${index}: no streak bonus yet (streak ${index} pays nothing between milestones)`);
      } else {
        await pill.waitFor();
        assert.equal((await pill.innerText()).trim(), expected, `question ${index}: the streak milestone pill renders through the real room relay`);
      }
      if (index < 5) {
        await dispatch('ADVANCE');
        // Scoped for the same reason as the result-beat wait above: a prior question's own
        // explanation beat can still be present in the DOM alongside this one.
        await host.locator(`.question-beat[data-stage-beat="explanation"][data-question-id="streak-q${index}"]`).waitFor();
        await dispatch('ADVANCE');
      }
    }
    console.log('coverage: room-mode streakBonus crosses the real dev relay end to end and renders only on each earning reveal, including the 5-streak +100 milestone');
  } finally {
    await browser?.close().catch(() => {});
    if (vite.child.exitCode === null) {
      const exited = new Promise((resolve) => vite.child.once('exit', resolve));
      vite.child.kill('SIGTERM');
      await exited;
    }
  }
});

test('restored Offline venue synchronizes legacy game state before presentation paint and never starts transport', { timeout: 45_000 }, async () => {
  const vite = await startVite();
  let browser;
  try {
    browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
    for (const expected of [
      { phase: 'closing', selector: '[data-role="offline-closing"]' },
      { phase: 'entering', selector: '[data-comp-id="question-shell"]' },
    ]) {
      const room = `LegacyOffline-${expected.phase}`;
      const { context, page } = await openLegacyRoom(browser, { room, venue: 'offline', phase: expected.phase });

      for (const load of ['mount', 'reload']) {
        if (load === 'mount') await page.goto(`${vite.url}/?room=${room}&host=1`, { waitUntil: 'load' });
        else await page.reload({ waitUntil: 'load' });
        try {
          await page.locator(expected.selector).waitFor({ state: 'visible', timeout: 5_000 });
        } catch (error) {
          throw new Error(`${expected.phase}/${load} failed to render ${expected.selector}: ${(await page.locator('body').innerText()).slice(0, 800)}; ${error}`);
        }
        await page.waitForFunction(() => globalThis.__vofFirstPresentationState !== null);
        assert.deepEqual(await page.evaluate(() => globalThis.__vofFirstPresentationState), {
          offlineClosing: expected.phase === 'closing',
          onlineClosing: false,
          statusRail: false,
          roomCode: false,
        }, `${expected.phase}/${load} first presentation commit already used Offline semantics`);
        assert.equal(await page.locator('[data-role="closing-no-responses"]').count(), 0, `${expected.phase}/${load} did not use online closing copy`);
        assert.equal(await page.locator('[data-role="status-rail"]').count(), 0, `${expected.phase}/${load} did not render online voting status`);
        assert.equal(await page.locator('.show-footer__room').count(), 0, `${expected.phase}/${load} did not expose a live room code`);
        assert.deepEqual(await transportConstructors(page), { roomSockets: [], broadcastChannels: [] }, `${expected.phase}/${load} constructed no app transport`);
      }
      await context.close();
    }

    const onlineRoom = 'LegacyOnline-teams';
    const { context: onlineContext, page: online } = await openLegacyRoom(browser, { room: onlineRoom, venue: 'teams', phase: 'preFlight' });
    await online.goto(`${vite.url}/?room=${onlineRoom}&host=1`, { waitUntil: 'load' });
    // 'teams' is wire/store state. The venue radio's visible and accessible label is the generic "Online
    // meeting" (src/screens/Preflight.tsx VENUE_NAMES: "hosts present on Zoom and Meet too"), not "Teams".
    await online.getByRole('radio', { name: /Online meeting/ }).waitFor({ state: 'visible' });
    assert.equal(await online.getByRole('radio', { name: /Online meeting/ }).getAttribute('aria-checked'), 'true');
    await online.waitForFunction(() => document.querySelector('.setup-live-line')?.textContent?.includes('connected'));
    assert.ok((await transportConstructors(online)).roomSockets.length > 0, 'online control constructed the app relay socket');

    await online.getByRole('radio', { name: /Offline/ }).click();
    await online.getByText('Hands-up play is selected', { exact: true }).waitFor({ timeout: 5_000 });
    assert.equal(await online.locator('.setup-room-card').count(), 0, 'Offline hides live-room setup');
    await online.getByRole('radio', { name: /Online meeting/ }).click();
    await online.waitForFunction(() => document.querySelector('.setup-live-line')?.textContent?.includes('connected'));
    assert.equal(await online.locator('.setup-room-card').count(), 1, 'Teams restores live-room setup');
    await onlineContext.close();
  } finally {
    await browser?.close().catch(() => {});
    if (vite.child.exitCode === null) {
      const exited = new Promise((resolve) => vite.child.once('exit', resolve));
      vite.child.kill('SIGTERM');
      await exited;
    }
  }
});

// JOIN-RACE (VOF-25: reliable remote joining comes first). When a host connects, the relay sends
// every waiting phone HOST_STATUS (server/room-relay.mjs, and the production relay delivers it too),
// then the host's first ROOM_STATE follows. The phone link used to apply HOST_STATUS inside a
// setRoomState updater and write its room ref from there. React runs a queued updater at render,
// and when both frames were handled before that render, the updater ran after the ROOM_STATE handler
// had already stored the snapshot and put the ref back to null. The phone then refused its own Join
// ("Room's not ready yet") and nothing retried, so it sat on the join screen for good.
//
// A script stands in for the relay on the phone's socket. Like the real relay, it answers CONNECT with
// READY and the latest snapshot, and it answers a HELLO the way a host does (an ACK, then the registered
// attendee state). Whether a render slips in between two frames sent one by one depends on timing, so a
// batch frame carries several relay frames at once and an init script hands them to the socket's
// listeners back to back in one task. That is how production-room.ts deliver() hands the phone a batch
// on every poll, and no render can come between them.
const SCRIPTED_SESSION = 'join-race-session';
const BATCH_PREFIX = 'relay-batch:';

function scriptedRoomState(roomId, over = {}) {
  return {
    version: 1, roomId, sessionId: SCRIPTED_SESSION, revision: 1, phase: 'lobby', slideIndex: 0, slideCount: 17,
    question: null, questionData: null, reveal: null, votesLocked: true, timerSeconds: 0, timerDurationSeconds: 0,
    timerRunning: false, participants: 0, teamScores: null, leaderboard: [], showdown: null, hostConnected: true,
    ...over,
  };
}

function scriptedAttendee(nickname) {
  return {
    sessionId: SCRIPTED_SESSION, registered: true, nickname, team: null, vote: null, result: null, score: 0,
    correct: 0, answered: 0, accuracy: null, bestStreak: 0, rank: null, totalParticipants: 1, commitments: [],
  };
}

async function openScriptedPhone(browser, url, room) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((batchPrefix) => {
    localStorage.setItem('vrc_audio_muted', 'true');
    const nativeDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function dispatchRelayBatch(event) {
      if (event.type === 'message' && typeof event.data === 'string' && event.data.startsWith(batchPrefix)) {
        for (const data of JSON.parse(event.data.slice(batchPrefix.length))) nativeDispatch.call(this, new MessageEvent('message', { data }));
        globalThis.__relayBatchesDelivered = (globalThis.__relayBatchesDelivered ?? 0) + 1;
        return true;
      }
      return nativeDispatch.call(this, event);
    };
  }, BATCH_PREFIX);
  const phone = await context.newPage();
  let batchesSent = 0;
  const relay = {
    socket: null,
    snapshot: null,
    hellos: [],
    helloSockets: [],
    /** Several relay frames, handled by the phone back to back in one task, then confirmed from the page. */
    async sendBatch(...frames) {
      for (const frame of frames) if (frame.kind === 'ROOM_STATE') relay.snapshot = frame.state;
      batchesSent += 1;
      relay.socket.send(BATCH_PREFIX + JSON.stringify(frames.map((frame) => JSON.stringify(frame))));
      await phone.waitForFunction((count) => (globalThis.__relayBatchesDelivered ?? 0) >= count, batchesSent, { timeout: 5_000 })
        .catch(() => assert.fail('the batch frame never reached the phone socket as separate frames (did the Playwright WebSocket mock stop dispatching through EventTarget.dispatchEvent?)'));
    },
  };
  await phone.routeWebSocket(/\/api\/rooms\//, (ws) => {
    ws.onMessage((raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (message.kind === 'CONNECT') {
        relay.socket = ws;
        ws.send(JSON.stringify({ kind: 'READY', role: 'attendee' }));
        if (relay.snapshot) ws.send(JSON.stringify({ kind: 'ROOM_STATE', state: relay.snapshot }));
        return;
      }
      if (message.kind === 'CLIENT_MESSAGE' && message.message?.type === 'HELLO') {
        relay.hellos.push(message.message);
        relay.helloSockets.push(ws);
        ws.send(JSON.stringify({ kind: 'ACK', messageId: message.message.messageId, accepted: true }));
        ws.send(JSON.stringify({ kind: 'ATTENDEE_STATE', state: scriptedAttendee(message.message.nickname) }));
      }
    });
  });
  await phone.goto(`${url}/join?room=${room}`);
  // Connected, with no host yet: the phone waits on the join screen.
  await phone.locator('[data-role="phone-connection-status"]').filter({ hasText: 'connected' }).waitFor();
  await phone.locator('[data-role="nickname-input"]').fill('Ada');
  return { context, phone, relay };
}

async function assertJoined(phone, relay, what, timeout = 5_000) {
  const left = await phone.locator('[data-role="phone-join"]').waitFor({ state: 'detached', timeout }).then(() => true, () => false);
  if (!left) {
    const banner = await phone.locator('[data-role="join-error-banner"]').textContent().catch(() => null);
    assert.fail(`${what}: the phone never left the join screen (${relay.hellos.length} HELLO reached the relay, banner: ${banner})`);
  }
  assert.equal(relay.hellos.length, 1, `${what}: exactly one HELLO reached the relay`);
  assert.equal(relay.hellos[0].sessionId, SCRIPTED_SESSION, `${what}: the HELLO carries the session from the ROOM_STATE`);
  await phone.locator('[data-role="phone-attendee-label"]').filter({ hasText: 'Ada' }).first().waitFor();
}

test('a phone that hears HOST_STATUS just before its first ROOM_STATE still joins (JOIN-RACE)', { timeout: 45_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'JoinRace-1';
    const { context, phone, relay } = await openScriptedPhone(browser, url, room);
    try {
      // The host arrives: HOST_STATUS, then its first ROOM_STATE, handled back to back.
      await relay.sendBatch({ kind: 'HOST_STATUS', connected: true }, { kind: 'ROOM_STATE', state: scriptedRoomState(room) });
      // Join is enabled only once the phone has rendered the room state on a live connection.
      await phone.locator('[data-role="join-submit-btn"]').click();
      await assertJoined(phone, relay, 'HOST_STATUS then the first ROOM_STATE');

      // What already worked stays working. The host drops: the phone holds. It comes back: the phone
      // returns to its room. A ROOM_STATE from a new session clears the old join, so the phone asks again.
      await relay.sendBatch({ kind: 'HOST_STATUS', connected: false });
      await phone.locator('[data-role="phone-connection-status"][data-host="down"]').waitFor();
      await phone.locator('[data-role="phone-waiting"]').filter({ hasText: 'Stay here' }).waitFor();
      await relay.sendBatch({ kind: 'HOST_STATUS', connected: true });
      await phone.locator('[data-role="phone-connection-status"][data-host="up"]').waitFor();
      await phone.locator('[data-role="phone-waiting"]').filter({ hasText: "You're in" }).waitFor();
      await relay.sendBatch({ kind: 'ROOM_STATE', state: scriptedRoomState(room, { sessionId: 'join-race-session-2', revision: 2 }) });
      await phone.locator('[data-role="phone-join"]').waitFor();
      assert.equal(relay.hellos.length, 1, 'a new session never sends a join on its own');
    } finally {
      await context.close();
    }
  });
});

// JOIN-RACE, second half. The refusal copy promises "This phone tries again in about 5 seconds", but
// nothing ever did. A refused join now waits and goes out once the room can take it: when the room state
// arrives, or when the connection comes back. Join is disabled until the room state is on screen, so
// requestSubmit() stands in for a join sent before it was, which the phone refuses as not ready.
test('a join refused before the room was ready goes out on its own once the room state arrives (JOIN-RACE)', { timeout: 45_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'JoinRace-2';
    const { context, phone, relay } = await openScriptedPhone(browser, url, room);
    try {
      await phone.locator('form.phone-name-card').evaluate((form) => form.requestSubmit());
      await phone.locator('[data-role="join-error-banner"]').filter({ hasText: "Room's not ready yet" }).waitFor();
      assert.equal(relay.hellos.length, 0, 'test setup: the phone refused the join before the room was ready');
      await relay.sendBatch({ kind: 'ROOM_STATE', state: scriptedRoomState(room) });
      await assertJoined(phone, relay, 'a join refused before the room state arrived');
    } finally {
      await context.close();
    }
  });
});

// The refusal that can still happen with the room on screen: the socket breaks as the player taps Join,
// so the join "didn't go through". It must go out once the phone reconnects, with no second tap.
test('a join that did not go through on a broken socket goes out once the phone reconnects (JOIN-RACE)', { timeout: 45_000 }, async () => {
  await withViteAndBrowser({}, async ({ url, browser }) => {
    const room = 'JoinRace-3';
    const { context, phone, relay } = await openScriptedPhone(browser, url, room);
    try {
      await relay.sendBatch({ kind: 'ROOM_STATE', state: scriptedRoomState(room) });
      const join = phone.locator('[data-role="join-submit-btn"]');
      await join.waitFor();
      await phone.waitForFunction(() => !document.querySelector('[data-role="join-submit-btn"]')?.disabled);
      await phone.evaluate(() => {
        const send = WebSocket.prototype.send;
        WebSocket.prototype.send = function breakOnce() {
          WebSocket.prototype.send = send;
          throw new DOMException('The socket broke as the player tapped Join.', 'InvalidStateError');
        };
      });
      await join.click();
      await phone.locator('[data-role="join-error-banner"]').filter({ hasText: "didn't go through" }).waitFor();
      assert.equal(relay.hellos.length, 0, 'test setup: the join never reached the relay');
      // The relay drops the broken socket. The phone reconnects and hears READY and the snapshot again.
      const dropped = relay.socket;
      await dropped.close();
      await assertJoined(phone, relay, 'a join that did not go through', 10_000);
      assert.notEqual(relay.helloSockets[0], dropped, 'the join did not go out on the dropped connection');
      assert.equal(relay.helloSockets[0], relay.socket, 'the join went out on the reconnected socket');
    } finally {
      await context.close();
    }
  });
});
