import assert from 'node:assert/strict';
import test from 'node:test';
import { startHostLiveLink } from '../../src/network/host-live-link';
import { useGameStore } from '../../src/store/game-store';
import type { RoomSocketOptions } from '../../src/network/room-socket';

function fixture(offlineMode = false, enabled = true) {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ offlineMode, interactionMode: 'polling', phase: 'entering', votesLocked: false,
    run: [{ id: 'synthetic', type: 'question', kind: 'binary', statement: 'Synthetic', answer: true }], slideIndex: 0 });
  let options: RoomSocketOptions | undefined;
  const messages: any[] = [];
  const counts = { creates: 0, subscriptions: 0, closes: 0, retries: 0 };
  const link = startHostLiveLink({ roomId: 'TEST', credential: 'synthetic-credential-12345678', enabled,
    store: { getState: useGameStore.getState, subscribe(listener) {
      counts.subscriptions++;
      const unsubscribe = useGameStore.subscribe(listener);
      return () => { counts.subscriptions--; unsubscribe(); };
    } },
    connect(config) { options = config; counts.creates++; return {
      send(message) { messages.push(message); return true; },
      retry() { counts.retries++; }, close() { counts.closes++; },
    }; }, onStatus() {}, onError() {},
  });
  const receive = (value: unknown) => options?.onMessage(value);
  return { link, messages, counts, receive };
}

test('Offline reload and selected Offline venue create no relay or publisher subscription', () => {
  for (const [offline, enabled] of [[true, true], [false, false]]) {
    const f = fixture(offline, enabled);
    f.receive({ kind: 'READY' });
    useGameStore.setState({ slideIndex: 1 });
    f.link.retry(); f.link.close();
    assert.deepEqual(f.counts, { creates: 0, subscriptions: 0, closes: 0, retries: 0 });
    assert.deepEqual(f.messages, []);
  }
});

test('switching Offline closes immediately, unsubscribes and rejects late callbacks; online reconnect works', () => {
  const f = fixture();
  f.receive({ kind: 'READY' });
  assert.equal(f.counts.creates, 1);
  assert.equal(f.counts.subscriptions, 1);
  assert.ok(f.messages.some((m) => m.kind === 'ROOM_STATE'), 'working publish control');
  const sent = f.messages.length;
  useGameStore.setState({ offlineMode: true });
  f.receive({ kind: 'READY' });
  f.receive({ kind: 'ATTENDEE_CONNECTED', deviceId: 'late-device' });
  useGameStore.setState({ slideIndex: 1 });
  f.link.retry(); f.link.close();
  assert.equal(f.messages.length, sent);
  assert.deepEqual(f.counts, { creates: 1, subscriptions: 0, closes: 1, retries: 0 });
  const online = fixture();
  online.receive({ kind: 'READY' });
  assert.ok(online.messages.length > 0);
  online.link.close();
});

test('Phone Voting off returns a rejected ACK even for a repeated formerly accepted choice', () => {
  const f = fixture();
  f.receive({ kind: 'READY' });
  const state = useGameStore.getState();
  const base = { version: 1, roomId: 'TEST', sessionId: state.sessionId, deviceId: 'synthetic-device' };
  const send = (message: unknown) => f.receive({ kind: 'CLIENT_MESSAGE', message });
  send({ ...base, type: 'HELLO', messageId: 'hello', nickname: 'Synthetic' });
  const room = f.messages.findLast((m) => m.kind === 'ROOM_STATE').state;
  const vote = { ...base, type: 'VOTE', messageId: 'enabled', choice: 'true', questionInstanceId: room.questionData.questionInstanceId };
  send(vote);
  assert.equal(f.messages.findLast((m) => m.message?.messageId === 'enabled').message.accepted, true);
  const previous = useGameStore.getState().pollVoters;
  useGameStore.setState({ interactionMode: 'facilitator' });
  send({ ...vote, messageId: 'disabled' });
  assert.equal(f.messages.findLast((m) => m.message?.messageId === 'disabled').message.accepted, false);
  assert.equal(useGameStore.getState().pollVoters, previous);
  f.link.close();
});

test('a paired presenter remote can lock, reveal, and close out without joining as an attendee', () => {
  const remoteKey = 'REMOTEKEYREMOTEKEYREMOTE';
  const paired: boolean[] = [];
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({
    offlineMode: false,
    interactionMode: 'polling',
    phase: 'deliberating',
    votesLocked: false,
    run: [{ id: 'synthetic', type: 'question', kind: 'binary', statement: 'Synthetic', answer: true }],
    slideIndex: 0,
  });
  let options: RoomSocketOptions | undefined;
  const messages: any[] = [];
  const link = startHostLiveLink({
    roomId: 'TEST',
    credential: 'synthetic-credential-12345678',
    enabled: true,
    remoteKey,
    onRemotePaired: (value) => paired.push(value),
    store: { getState: useGameStore.getState, subscribe: useGameStore.subscribe },
    connect(config) {
      options = config;
      return { send(message) { messages.push(message); return true; }, retry() {}, close() {} };
    },
    onStatus() {},
    onError() {},
  });
  options?.onMessage({ kind: 'READY' });
  const state = useGameStore.getState();
  const base = { version: 1, roomId: 'TEST', sessionId: state.sessionId, deviceId: 'presenter-phone' };
  const send = (message: unknown) => options?.onMessage({ kind: 'CLIENT_MESSAGE', message });
  send({ ...base, type: 'HELLO', messageId: 'pair', nickname: `pair:${remoteKey}` });
  assert.equal(paired.at(-1), true);
  assert.equal(useGameStore.getState().seenDevices['presenter-phone'], undefined, 'the controller is not an audience phone');
  send({ ...base, type: 'HELLO', messageId: 'lock', nickname: 'cmd:LOCK' });
  assert.equal(useGameStore.getState().votesLocked, true);
  send({ ...base, type: 'HELLO', messageId: 'reveal', nickname: 'cmd:REVEAL' });
  assert.equal(useGameStore.getState().phase, 'revealed');
  send({ ...base, type: 'HELLO', messageId: 'end', nickname: 'cmd:END' });
  assert.equal(useGameStore.getState().phase, 'closing');
  send({ ...base, type: 'HELLO', messageId: 'intruder', nickname: 'cmd:ADVANCE', deviceId: 'other-phone' });
  const rejected = messages.findLast((m) => m.message?.messageId === 'intruder');
  assert.equal(rejected?.message?.accepted, false);
  link.close();
});

test('FAC-01: a paired presenter remote can pause and resume the countdown', () => {
  const remoteKey = 'REMOTEKEYREMOTEKEYREMOTE';
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({
    offlineMode: false,
    interactionMode: 'polling',
    phase: 'deliberating',
    votesLocked: false,
    run: [{ id: 'synthetic', type: 'question', kind: 'binary', statement: 'Synthetic', answer: true }],
    slideIndex: 0,
    timer: {
      durationMs: 30_000, remainingMs: 20_000, running: true, enabled: true, visible: true,
      pauseReason: null, generation: 0, endsAt: Date.now() + 20_000,
    },
  });
  let options: RoomSocketOptions | undefined;
  const messages: any[] = [];
  const link = startHostLiveLink({
    roomId: 'TEST',
    credential: 'synthetic-credential-12345678',
    enabled: true,
    remoteKey,
    store: { getState: useGameStore.getState, subscribe: useGameStore.subscribe },
    connect(config) {
      options = config;
      return { send(message) { messages.push(message); return true; }, retry() {}, close() {} };
    },
    onStatus() {},
    onError() {},
  });
  options?.onMessage({ kind: 'READY' });
  const state = useGameStore.getState();
  const base = { version: 1, roomId: 'TEST', sessionId: state.sessionId, deviceId: 'presenter-phone' };
  const send = (message: unknown) => options?.onMessage({ kind: 'CLIENT_MESSAGE', message });
  send({ ...base, type: 'HELLO', messageId: 'pair', nickname: `pair:${remoteKey}` });
  assert.equal(useGameStore.getState().timer.running, true, 'the countdown starts running');
  // The remote reuses the exact TOGGLE_PAUSE action the P key dispatches.
  send({ ...base, type: 'HELLO', messageId: 'pause', nickname: 'cmd:PAUSE' });
  assert.equal(useGameStore.getState().timer.running, false, 'the first PAUSE stops the countdown');
  assert.equal(useGameStore.getState().timer.pauseReason, 'manual');
  send({ ...base, type: 'HELLO', messageId: 'resume', nickname: 'cmd:PAUSE' });
  assert.equal(useGameStore.getState().timer.running, true, 'the second PAUSE resumes it');
  // An unpaired device sending the same cmd: nickname must be refused, matching the ADVANCE
  // check above. FAC-01 had no equivalent proof that PAUSE is gated to the paired device.
  send({ ...base, type: 'HELLO', messageId: 'intruder-pause', nickname: 'cmd:PAUSE', deviceId: 'other-phone' });
  const rejected = messages.findLast((m) => m.message?.messageId === 'intruder-pause');
  assert.equal(rejected?.message?.accepted, false, 'PAUSE from an unpaired device must be refused');
  assert.equal(useGameStore.getState().timer.running, true, 'the refused PAUSE must not toggle the countdown');
  link.close();
});

test('FAC-04: a paired presenter remote can award showdown duel points to either finalist', () => {
  const remoteKey = 'REMOTEKEYREMOTEKEYREMOTE';
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({
    offlineMode: false,
    interactionMode: 'polling',
    phase: 'showdown',
    votesLocked: true,
    showdown: {
      id: 'sd1',
      stage: 'duel',
      finalists: [
        { ticket: 'ticket-a', name: 'Alex', score: 300, duelPoints: 0 },
        { ticket: 'ticket-b', name: 'Bailey', score: 250, duelPoints: 0 },
      ],
      predictions: {},
      predictionCounts: {},
      questionIds: [],
      questionIndex: 0,
      winner: null,
      tie: false,
      isRecap: false,
    },
  });
  let options: RoomSocketOptions | undefined;
  const messages: any[] = [];
  const link = startHostLiveLink({
    roomId: 'TEST',
    credential: 'synthetic-credential-12345678',
    enabled: true,
    remoteKey,
    store: { getState: useGameStore.getState, subscribe: useGameStore.subscribe },
    connect(config) {
      options = config;
      return { send(message) { messages.push(message); return true; }, retry() {}, close() {} };
    },
    onStatus() {},
    onError() {},
  });
  options?.onMessage({ kind: 'READY' });
  const state = useGameStore.getState();
  const base = { version: 1, roomId: 'TEST', sessionId: state.sessionId, deviceId: 'presenter-phone' };
  const send = (message: unknown) => options?.onMessage({ kind: 'CLIENT_MESSAGE', message });
  send({ ...base, type: 'HELLO', messageId: 'pair', nickname: `pair:${remoteKey}` });
  send({ ...base, type: 'HELLO', messageId: 'award-a', nickname: 'cmd:AWARD_A' });
  assert.equal(useGameStore.getState().showdown?.finalists[0]?.duelPoints, 1, 'AWARD_A adds a point to the first finalist');
  assert.equal(useGameStore.getState().showdown?.finalists[1]?.duelPoints, 0, 'AWARD_A must not touch the second finalist');
  send({ ...base, type: 'HELLO', messageId: 'award-b-1', nickname: 'cmd:AWARD_B' });
  send({ ...base, type: 'HELLO', messageId: 'award-b-2', nickname: 'cmd:AWARD_B' });
  assert.equal(useGameStore.getState().showdown?.finalists[1]?.duelPoints, 2, 'AWARD_B adds a point to the second finalist, twice');
  assert.equal(useGameStore.getState().showdown?.finalists[0]?.duelPoints, 1, 'AWARD_B must not touch the first finalist');
  // An unpaired device sending the same cmd: nickname must be refused, matching the ADVANCE
  // check above. FAC-04 had no equivalent proof that showdown point awards are gated to the
  // paired device.
  send({ ...base, type: 'HELLO', messageId: 'intruder-award', nickname: 'cmd:AWARD_A', deviceId: 'other-phone' });
  const rejected = messages.findLast((m) => m.message?.messageId === 'intruder-award');
  assert.equal(rejected?.message?.accepted, false, 'AWARD_A from an unpaired device must be refused');
  assert.equal(useGameStore.getState().showdown?.finalists[0]?.duelPoints, 1, 'the refused AWARD_A must not add a second point');
  link.close();
});

test('presenter remote Next from Setup opens the lobby (ADVANCE is a setup no-op)', () => {
  const remoteKey = 'REMOTEKEYREMOTEKEYREMOTE';
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({
    offlineMode: false,
    interactionMode: 'polling',
    phase: 'preFlight',
    votesLocked: false,
    modeId: 'curated15',
    activePresetId: 'curated15',
    run: [{ id: 'title', type: 'title' }, { id: 'q1', type: 'question', kind: 'binary', statement: 'Synthetic', answer: true }],
    slideIndex: -1,
  });
  let options: RoomSocketOptions | undefined;
  const link = startHostLiveLink({
    roomId: 'LEDQ',
    credential: 'synthetic-credential-12345678',
    enabled: true,
    remoteKey,
    store: { getState: useGameStore.getState, subscribe: useGameStore.subscribe },
    connect(config) {
      options = config;
      return { send() { return true; }, retry() {}, close() {} };
    },
    onStatus() {},
    onError() {},
  });
  options?.onMessage({ kind: 'READY' });
  const state = useGameStore.getState();
  const base = { version: 1, roomId: 'LEDQ', sessionId: state.sessionId, deviceId: 'presenter-phone' };
  const send = (message: unknown) => options?.onMessage({ kind: 'CLIENT_MESSAGE', message });
  send({ ...base, type: 'HELLO', messageId: 'pair', nickname: `pair:${remoteKey}` });
  // Store ADVANCE alone must still no-op on setup (keyboard / VOF-46).
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().phase, 'preFlight');
  send({ ...base, type: 'HELLO', messageId: 'next', nickname: 'cmd:ADVANCE' });
  assert.equal(useGameStore.getState().phase, 'lobby', 'Setup Next must ENTER_LOBBY');
  send({ ...base, type: 'HELLO', messageId: 'open-stage', nickname: 'cmd:ADVANCE' });
  assert.equal(useGameStore.getState().phase, 'entering');
  assert.equal(useGameStore.getState().slideIndex, 0);
  link.close();
});

test('a vote the relay took while the last published state was open counts after the lock, one it took after the lock does not', async () => {
  // Over the production relay the client marks each phone message with the newest room state the relay could have held when it
  // took it (relayRevision, see production-room.ts). The host counts it only when that state still had the vote open.
  const f = fixture();
  f.receive({ kind: 'READY' });
  const state = useGameStore.getState();
  const base = { version: 1, roomId: 'TEST', sessionId: state.sessionId };
  const say = (deviceId: string, message: Record<string, unknown>, relayRevision?: number) => f.receive({
    kind: 'CLIENT_MESSAGE', message: { ...base, deviceId, ...message }, ...(relayRevision === undefined ? {} : { relayRevision }),
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
  for (const device of ['early', 'late', 'dev']) say(device, { type: 'HELLO', messageId: `hello-${device}`, nickname: device });
  await settle();
  const open = f.messages.findLast((m) => m.kind === 'ROOM_STATE').state;
  assert.equal(open.votesLocked, false);
  useGameStore.getState().dispatch({ type: 'LOCK_VOTES' });
  await settle();
  const locked = f.messages.findLast((m) => m.kind === 'ROOM_STATE').state;
  assert.equal(locked.votesLocked, true);
  assert.ok(locked.revision > open.revision);
  const ack = (id: string) => f.messages.findLast((m) => m.message?.kind === 'ACK' && m.message.messageId === id)?.message;
  const vote = (messageId: string) => ({ type: 'VOTE', messageId, choice: 'true', questionInstanceId: open.questionData.questionInstanceId });
  say('early', vote('taken-open'), open.revision);
  assert.equal(ack('taken-open').accepted, true, 'the relay took it while the last published state was open');
  say('late', vote('taken-locked'), locked.revision);
  assert.equal(ack('taken-locked').accepted, false, 'the relay took it after it held the lock');
  assert.equal(ack('taken-locked').reason, 'Voting is closed');
  say('dev', vote('no-revision'));
  assert.equal(ack('no-revision').accepted, false, 'the dev relay sends no revision, so a vote after the lock is refused as always');
  assert.deepEqual(Object.keys(useGameStore.getState().pollVoters.synthetic ?? {}), ['early']);
  f.link.close();
});
