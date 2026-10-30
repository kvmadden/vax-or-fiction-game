import assert from 'node:assert/strict';
import test from 'node:test';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { buildArchivePostBodies, type GameArchiveSnapshot } from '../../src/network/game-archive';
import { startHostLiveLink } from '../../src/network/host-live-link';
import type { RoomSocketOptions } from '../../src/network/room-socket';
import { useGameStore, type SeenDeviceState } from '../../src/store/game-store';

// B3 (VOF-12). A phone's device id is its persistent vrc_device_id, the same value on every show that
// phone ever joins, so it is a cross-show tracking id. It stays on the host. So does joinedAt, which
// no audience or archive surface needs. Every body the host sends is built here with the real
// builders and searched for both: the two archive rows saveClosedGame posts at Closing (vrc_recaps is
// readable with the public key), and every relay message the real host link sends.

const ADA = 'c0ffee00-0000-4000-8000-00000000a0a1';
const BEN = 'c0ffee00-0000-4000-8000-00000000b0b2';
const DEVICE_IDS = [ADA, BEN];
const JOINED_AT = [1727301111111, 1727302222222];
const RAW_FLAGGED_NAME = 'total bastard';

function seenDevices(): Record<string, SeenDeviceState> {
  return {
    [ADA]: { nickname: 'Ada', rawNickname: 'Ada', team: 'NAVY', joinedAt: JOINED_AT[0]!, score: 300, answered: 3, correct: 3, streak: 3, bestStreak: 3, realityGap: 0, hardQuestionPoints: 100 },
    // The room sees the DEF-32 fallback. The raw name belongs to this phone alone (W8).
    [BEN]: { nickname: 'Player', rawNickname: RAW_FLAGGED_NAME, team: 'GOLD', joinedAt: JOINED_AT[1]!, score: 200, answered: 3, correct: 2, streak: 0, bestStreak: 2, realityGap: 1, hardQuestionPoints: 0 },
  };
}

const questions = vaxOrFictionDeck.questions.slice(0, 3);

function showdown() {
  return {
    id: 'run-private:showdown',
    stage: 'lineup' as const,
    finalists: [
      { ticket: 'F-1', name: 'Ada', score: 300, duelPoints: 0 },
      { ticket: 'F-2', name: 'Player', score: 200, duelPoints: 0 },
    ],
    // GameShowdownState keeps each phone's own prediction keyed by its device id.
    predictions: { [ADA]: 'F-1', [BEN]: 'F-2' },
    predictionCounts: { 'F-1': 1, 'F-2': 1 },
    questionIds: [questions[1]!.id, questions[2]!.id],
    questionIndex: 0,
    winner: null,
    tie: false,
    isRecap: true,
  };
}

/**
 * Every way a device id or joinedAt could appear in a serialized body, listed so a failure names it.
 * The raw typed name is checked too, since it rides the same records: only Ben's own phone may see it.
 */
function leaks(body: unknown, { ownPhone = false } = {}): string[] {
  const text = JSON.stringify(body);
  const found: string[] = [];
  for (const id of DEVICE_IDS) if (text.includes(id)) found.push(`device id ${id}`);
  if (text.includes('"joinedAt"')) found.push('a joinedAt key');
  if (text.includes('"deviceId"')) found.push('a deviceId key');
  for (const value of JOINED_AT) if (text.includes(String(value))) found.push(`joinedAt value ${value}`);
  if (!ownPhone && text.includes(RAW_FLAGGED_NAME)) found.push('the raw flagged name only its own phone may see');
  return found;
}

/** B3 (VOF-12): score, answered, etc all start at zero, so REVEAL below computes them for real. */
function freshSeenDevices(): Record<string, SeenDeviceState> {
  return {
    [ADA]: { nickname: 'Ada', rawNickname: 'Ada', team: 'NAVY', joinedAt: JOINED_AT[0]!, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
    [BEN]: { nickname: 'Player', rawNickname: RAW_FLAGGED_NAME, team: 'GOLD', joinedAt: JOINED_AT[1]!, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
  };
}

test('neither archive row saveClosedGame posts at Closing carries a device id or joinedAt (B3, VOF-12)', () => {
  // B3-FIXTURE: build the snapshot the way PresentationSuite.tsx (around line 172) actually does,
  // from a real post-REVEAL store state, not a hand-built roomStats. The real store's
  // settleCurrentQuestion puts the SAME seenDevices dict into roomStats.devices (game-store.ts:744,
  // raw device ids, joinedAt and rawNickname included) alongside the sanitized standings this file
  // already checked, and roomStats.teams comes out keyed NAVY/GOLD, uppercase (summarizeTeams,
  // game-store.ts:635-654). A fixture that never populates roomStats.devices (this file used to
  // build one by hand, with no devices key and lowercase team keys) cannot go red if a future change
  // leaked THAT field into an archive row instead of the sanitized seenDevices/leaderboard path: the
  // search below would find no device id to find. Driving a real store through REVEAL, then
  // ENTER_SHOWDOWN and two PREDICT_WINNER dispatches, closes that blind spot.
  useGameStore.setState(useGameStore.getInitialState(), true);
  const sessionId = 'run-private';
  const question = questions[0]!;
  useGameStore.setState({
    sessionId, offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true,
    modeId: 'full', showdownEnabled: true, teamsEnabled: true,
    session: { startedAt: '2026-09-26T12:00:00.000Z', deckId: 'vax-or-fiction' },
    run: questions as never, slideIndex: 0, phase: 'locked', votesLocked: true,
    pollVotes: { [question.id]: { true: 1, false: 1 } },
    pollVoters: { [question.id]: { [ADA]: { choice: 'true', conviction: 'certain' }, [BEN]: { choice: 'false', conviction: 'fairly-sure' } } },
    seenDevices: freshSeenDevices(),
    settledQuestionInstances: {}, settledResults: {},
  } as never);
  const dispatch = (action: unknown) => useGameStore.getState().dispatch(action as never);
  dispatch({ type: 'REVEAL' });
  const afterReveal = useGameStore.getState();
  // Coverage first: the real store must actually have reached the parts of the snapshot that carry
  // people, the same way PresentationSuite's own snapshot would, or a clean result below would only
  // prove the search looked at nothing.
  assert.equal(afterReveal.phase, 'revealed', 'REVEAL must have settled the question');
  assert.ok(afterReveal.roomStats.devices, 'the real store must populate roomStats.devices (game-store.ts:744)');
  assert.deepEqual(Object.keys(afterReveal.roomStats.devices as object).sort(), [ADA, BEN].sort(),
    'roomStats.devices must carry both real device ids, the way settleCurrentQuestion builds it');
  assert.deepEqual(Object.keys((afterReveal.roomStats.teams as object) ?? {}).sort(), ['GOLD', 'NAVY'],
    'roomStats.teams must come out uppercase, the way summarizeTeams builds it');

  dispatch({ type: 'ENTER_SHOWDOWN' });
  const showdownId = useGameStore.getState().showdown?.id;
  dispatch({ type: 'PREDICT_WINNER', deviceId: ADA, winner: 'F-1', showdownId });
  dispatch({ type: 'PREDICT_WINNER', deviceId: BEN, winner: 'F-2', showdownId });
  const state = useGameStore.getState();
  assert.equal(Object.keys(state.showdown?.predictions ?? {}).length, 2, 'both predictions must have landed');

  // The exact fields PresentationSuite.tsx passes to saveClosedGame at Closing.
  const snapshot: GameArchiveSnapshot = {
    roomId: 'PRIV',
    deckId: state.session?.deckId ?? state.deckId ?? 'vax-or-fiction',
    deckTitle: 'Vax or Fiction?',
    session: state.session,
    roomStats: state.roomStats,
    seenDevices: state.seenDevices,
    run: state.run,
    showdown: state.showdown,
    venue: 'room',
    teamsEnabled: Boolean(state.teamsEnabled),
  };
  const { sessions, recaps } = buildArchivePostBodies(snapshot, () => new Date('2026-09-26T13:00:00.000Z'));

  const { summary } = sessions;
  const { recap } = recaps;
  assert.equal(summary.standings.length, 2, 'both players reach the vrc_sessions standings');
  assert.equal(recap.standings.length, 2, 'both players reach the vrc_recaps standings');
  assert.ok(summary.showdown, 'the showdown reaches the vrc_sessions summary');

  // One comparison, so a failure lists every leak at once rather than stopping at the first.
  const sevenFields = ['bestStreak', 'hardQuestionPoints', 'nickname', 'rank', 'realityGap', 'score', 'team'].join(',');
  assert.deepEqual({
    vrcSessionsBody: leaks(sessions),
    vrcRecapsBody: leaks(recaps),
    archivedShowdown: leaks(summary.showdown),
    standingsNotExactlyTheSevenArchiveFields: [...summary.standings, ...recap.standings]
      .map((standing) => Object.keys(standing).sort().join(','))
      .filter((keys) => keys !== sevenFields),
  }, {
    vrcSessionsBody: [],
    vrcRecapsBody: [],
    archivedShowdown: [],
    standingsNotExactlyTheSevenArchiveFields: [],
  }, 'neither archive body may carry a device id or joinedAt, and a standing is exactly the seven ArchiveStanding fields');
});

function hostLink() {
  const messages: Array<Record<string, unknown>> = [];
  let options: RoomSocketOptions | undefined;
  const link = startHostLiveLink({
    roomId: 'PRIV',
    credential: 'synthetic-credential-12345678',
    enabled: true,
    store: { getState: useGameStore.getState, subscribe: useGameStore.subscribe },
    connect(config) {
      options = config;
      return { send(message) { messages.push(message as Record<string, unknown>); return true; }, retry() {}, close() {} };
    },
    onStatus() {},
    onError() {},
  });
  return { link, messages, receive: (value: unknown) => options?.onMessage(value) };
}

test('no relay message the host sends carries a device id or joinedAt, only the DIRECT routing address (B3, VOF-12)', () => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  const sessionId = 'run-private';
  const question = questions[0]!;
  const occurrence = `${sessionId}:0:${question.id}`;
  useGameStore.setState({
    sessionId, offlineMode: false, interactionMode: 'polling', leaderboardEnabled: true,
    run: questions as never, slideIndex: 0, phase: 'deliberating', votesLocked: false,
    seenDevices: seenDevices(),
    pollVoters: { [question.id]: { [ADA]: { choice: 'true', conviction: 'certain' }, [BEN]: { choice: 'false', conviction: 'fairly-sure' } } },
    commitments: { [question.id]: { [ADA]: 'Ask about the second dose' } },
  } as never);
  const { link, messages, receive } = hostLink();
  try {
    receive({ kind: 'READY' });
    for (const deviceId of DEVICE_IDS) receive({ kind: 'ATTENDEE_CONNECTED', deviceId });
    // A real client message too, so the ACK path is covered alongside the published state.
    receive({ kind: 'CLIENT_MESSAGE', message: { version: 1, type: 'HELLO', roomId: 'PRIV', sessionId, deviceId: ADA, messageId: 'hello-ada', nickname: 'Ada' } });

    useGameStore.setState({
      phase: 'revealed', votesLocked: true,
      settledResults: { [occurrence]: { [ADA]: { choice: 'true', conviction: 'certain', isRight: true, score: 100, realityGapDelta: 0 } } },
    } as never);
    receive({ kind: 'READY' });
    useGameStore.setState({ phase: 'closing' } as never);
    receive({ kind: 'READY' });
    useGameStore.setState({ phase: 'showdown', showdown: showdown() } as never);
    receive({ kind: 'READY' });
  } finally {
    link.close();
  }

  const roomStates = messages.filter((message) => message.kind === 'ROOM_STATE');
  const directs = messages.filter((message) => message.kind === 'DIRECT');
  const published = (predicate: (state: Record<string, any>) => boolean) => roomStates.filter((message) => predicate(message.state as Record<string, any>)).length;
  console.log(`DEVICE_ID_EGRESS_COVERAGE messages=${messages.length} roomStates=${roomStates.length} directs=${directs.length} leaderboards=${published((state) => state.leaderboard.length > 0)} showdowns=${published((state) => Boolean(state.showdown))}`);
  assert.ok(published((state) => state.leaderboard.length === 2) >= 2, 'the room leaderboard with both players was published');
  assert.ok(published((state) => Boolean(state.showdown)) >= 1, 'the showdown room state was published');
  assert.ok(directs.filter((message) => (message.message as { kind?: string }).kind === 'ATTENDEE_STATE').length >= 8, 'each phone received its personal state in every phase');
  assert.ok(directs.some((message) => (message.message as { kind?: string }).kind === 'ACK'), 'an acknowledgement was sent');

  for (const message of messages) {
    if (message.kind === 'DIRECT') {
      // The relay routes a personal message to the one phone that opened the socket with this id,
      // so the envelope names its addressee. The message inside must not name anyone.
      assert.deepEqual(Object.keys(message).sort(), ['deviceId', 'kind', 'message'], 'a DIRECT envelope is only its routing address and its message');
      assert.ok(DEVICE_IDS.includes(message.deviceId as string), 'a DIRECT envelope is addressed to a phone that connected');
      assert.deepEqual(leaks(message.message, { ownPhone: message.deviceId === BEN }), [], `a ${String((message.message as { kind?: string }).kind)} message must not carry a device id or joinedAt`);
    } else {
      assert.deepEqual(leaks(message), [], `a ${String(message.kind)} message must not carry a device id or joinedAt`);
    }
  }
});
