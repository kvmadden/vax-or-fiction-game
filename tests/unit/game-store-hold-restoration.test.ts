import assert from 'node:assert/strict';
import test from 'node:test';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { rightToken } from '../../src/engine/kinds';
import { projectAttendeeState, projectGameState } from '../../src/network/game-projection';
import { validateAttendeeState } from '../../src/network/guards';
import { getQuestionInstanceId, useGameStore } from '../../src/store/game-store';

// VOF-74 (content fix batch 2, vof-q11): q11's own hold is released (its evidence was re-checked and confirmed),
// so this suite installs a synthetic hold on it here, at module scope, purely to keep exercising the general
// hold-restoration mechanism (isHeldBundledQuestion reads `deck.heldQuestionIds` off this same live, singleton
// object). `node --test` runs each test file in its own process, so this never leaks into another file's run.
const first = vaxOrFictionDeck.questions.find(question => question.id === 'q4')!;
const held = vaxOrFictionDeck.questions.find(question => question.id === 'q11')!;
vaxOrFictionDeck.heldQuestionIds = ['q11'];
const last = vaxOrFictionDeck.questions.find(question => question.id === 'q19')!;
const merge = useGameStore.persist.getOptions().merge!;
const initial = useGameStore.getInitialState();
const deviceId = 'synthetic-device';

function settleAt(run: typeof initial.run, slideIndex: number, choice: string) {
  const question = run[slideIndex]!;
  if (!useGameStore.getState().seenDevices[deviceId]) {
    useGameStore.getState().dispatch({ type: 'HELLO', deviceId, nickname: 'Synthetic attendee', team: 'NAVY' });
  }
  useGameStore.setState({
    run, slideIndex, phase: 'locked', votesLocked: true,
    pollVotes: { [question.id]: { [choice]: 1 } },
    pollVoters: { [question.id]: { [deviceId]: { choice, conviction: 'certain' } } },
  });
  useGameStore.getState().dispatch({ type: 'REVEAL' });
  return useGameStore.getState();
}

function advancePastOptionalExplanation() {
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  if (String(useGameStore.getState().phase) === 'explaining') {
    useGameStore.getState().dispatch({ type: 'ADVANCE' });
  }
  return useGameStore.getState();
}

test('hold restoration migrates the surviving settlement and cannot award it twice', () => {
  useGameStore.setState({ ...initial, sessionId: 'held-resume' }, true);
  const saved = settleAt([first, held, last], 2, rightToken(last));
  const oldOccurrence = getQuestionInstanceId(saved)!;
  assert.equal(saved.seenDevices[deviceId]?.answered, 1, 'the pre-migration occurrence really awarded an answer');
  const restored = merge(saved, initial);
  const occurrence = getQuestionInstanceId(restored)!;
  assert.equal(occurrence, 'held-resume:1:q19');
  assert.deepEqual(restored.run.map(question => question.id), ['q4', 'q19']);
  assert.equal(restored.settledQuestionInstances[occurrence], true);
  assert.equal(restored.settledQuestionInstances[oldOccurrence], undefined);
  assert.deepEqual(restored.settledResults[occurrence], saved.settledResults[oldOccurrence]);
  assert.equal(restored.settledResults[oldOccurrence], undefined);
  assert.deepEqual(restored.seenDevices, saved.seenDevices);
  assert.deepEqual(restored.roomStats, saved.roomStats);
  const projection = projectGameState(restored, 'TEST', 1);
  assert.equal(projectAttendeeState(restored, deviceId, projection.questionProjection).result?.questionInstanceId, occurrence);
  useGameStore.setState(restored, true);
  useGameStore.getState().dispatch({ type: 'REVEAL' });
  assert.deepEqual(useGameStore.getState().seenDevices, saved.seenDevices);
  assert.deepEqual(useGameStore.getState().roomStats, saved.roomStats);
});

test('hold restoration keeps duplicate occurrences separate and drops only removed settlement keys', () => {
  useGameStore.setState({ ...initial, sessionId: 'duplicate-resume' }, true);
  const run = [first, held, first, last];
  settleAt(run, 0, String(first.answer));
  settleAt(run, 1, String(held.answer));
  const saved = settleAt(run, 2, String(!first.answer));
  const restored = merge(saved, initial);
  assert.deepEqual(restored.run, [first, first, last]);
  assert.equal(restored.slideIndex, 1);
  assert.deepEqual(Object.keys(restored.settledQuestionInstances), ['duplicate-resume:0:q4', 'duplicate-resume:1:q4']);
  assert.deepEqual(restored.settledResults['duplicate-resume:0:q4'], saved.settledResults['duplicate-resume:0:q4']);
  assert.deepEqual(restored.settledResults['duplicate-resume:1:q4'], saved.settledResults['duplicate-resume:2:q4']);
  assert.equal(restored.settledResults['duplicate-resume:1:q11'], undefined);
  assert.deepEqual(restored.seenDevices, saved.seenDevices, 'completed historical awards are preserved');
  assert.deepEqual(restored.roomStats, saved.roomStats, 'historical totals are not recomputed from a filtered run');
  assert.deepEqual(merge(restored, initial).settledResults, restored.settledResults, 'a second hydration is idempotent');
});

test('hydration drops malformed tally cells and recovery still supports a changed vote and repeated REVEAL (VOF-V2)', () => {
  const cells = JSON.parse('{"true":1,"false":0,"not a token":6,"a.b":7,"a/b":8,"nullCell":null,"stringCell":"2","negative":-1,"fraction":1.5,"shadow":{"toString":null,"valueOf":null},"constructor":2,"__proto__":3}') as Record<string, unknown>;
  cells.infinity = Number.POSITIVE_INFINITY;
  cells.nan = Number.NaN;
  const rawVotes: Record<string, unknown> = JSON.parse('{"constructor":{"true":7},"__proto__":{"true":8} }');
  rawVotes[first.id] = cells;
  const restored = merge({
    sessionId: 'malformed-vote-recovery',
    run: [first],
    slideIndex: 0,
    phase: 'deliberating',
    votesLocked: false,
    pollVotes: rawVotes,
    pollVoters: { [first.id]: { [deviceId]: { choice: 'true' } } },
  }, initial) as any;

  assert.deepEqual(restored.pollVotes[first.id], { true: 1, false: 0 }, 'only safe nonnegative integer tally cells survive');
  assert.equal(Object.hasOwn(restored.pollVotes, 'constructor'), false, 'unsafe question keys are dropped');
  assert.equal(Object.hasOwn(restored.pollVotes, '__proto__'), false, 'prototype question keys are dropped');

  useGameStore.setState(restored, true);
  useGameStore.getState().dispatch({ type: 'HELLO', deviceId, nickname: 'Synthetic attendee' });
  useGameStore.getState().dispatch({ type: 'VOTE', questionId: first.id, deviceId, choice: 'false' });
  assert.deepEqual(useGameStore.getState().pollVotes[first.id], { true: 0, false: 1 }, 'a normal changed vote updates recovered tallies');
  useGameStore.getState().dispatch({ type: 'REVEAL' });
  const once = useGameStore.getState();
  assert.equal(once.seenDevices[deviceId]?.answered, 1, 'the recovered answer is settled');
  useGameStore.getState().dispatch({ type: 'REVEAL' });
  assert.equal(useGameStore.getState().seenDevices[deviceId]?.answered, once.seenDevices[deviceId]?.answered, 'a repeated reveal does not rescore');
  assert.deepEqual(useGameStore.getState().roomStats, once.roomStats, 'a repeated reveal preserves the recovered settlement');
});

test('duplicate question occurrences start with blank live votes and settled navigation restores only that occurrence', () => {
  useGameStore.setState({
    ...initial,
    sessionId: 'duplicate-live-votes',
    run: [first, first],
    slideIndex: 0,
    phase: 'entering',
    interactionMode: 'polling',
    offlineMode: false,
    votesLocked: false,
  }, true);
  useGameStore.getState().dispatch({ type: 'HELLO', deviceId, nickname: 'Synthetic attendee', team: 'NAVY' });
  useGameStore.getState().dispatch({ type: 'VOTE', token: String(first.answer), deviceId, conviction: 'certain' });
  useGameStore.getState().dispatch({ type: 'REVEAL' });

  const firstSettled = useGameStore.getState();
  const firstOccurrence = getQuestionInstanceId(firstSettled)!;
  const awarded = firstSettled.seenDevices[deviceId]!;
  assert.equal(awarded.answered, 1);
  assert.ok(firstSettled.settledResults[firstOccurrence]?.[deviceId]);

  const secondEntering = advancePastOptionalExplanation();
  const secondOccurrence = getQuestionInstanceId(secondEntering)!;
  assert.equal(secondOccurrence, 'duplicate-live-votes:1:q4');
  assert.equal(secondEntering.phase, 'entering');
  assert.equal(secondEntering.pollVoters[first.id], undefined, 'a repeated ID must not inherit the prior occurrence vote');
  assert.equal(secondEntering.pollVotes[first.id], undefined, 'a repeated ID must not inherit the prior occurrence tally');
  const secondProjection = projectGameState(secondEntering, 'TEST', 1);
  assert.equal(projectAttendeeState(secondEntering, deviceId, secondProjection.questionProjection).vote, null);

  useGameStore.getState().dispatch({ type: 'REVEAL' });
  const secondSettled = useGameStore.getState();
  assert.equal(secondSettled.seenDevices[deviceId]?.answered, awarded.answered, 'an empty second occurrence cannot award the first vote again');
  assert.equal(secondSettled.seenDevices[deviceId]?.score, awarded.score);
  assert.deepEqual(secondSettled.settledResults[secondOccurrence], {});

  useGameStore.getState().dispatch({ type: 'BACK' });
  const firstRestored = useGameStore.getState();
  assert.equal(getQuestionInstanceId(firstRestored), firstOccurrence);
  assert.equal(firstRestored.phase, 'revealed');
  assert.equal(firstRestored.pollVoters[first.id]?.[deviceId]?.choice, String(first.answer));
  const firstProjection = projectGameState(firstRestored, 'TEST', 2);
  assert.equal(projectAttendeeState(firstRestored, deviceId, firstProjection.questionProjection).result?.questionInstanceId, firstOccurrence);

  const secondRestored = advancePastOptionalExplanation();
  assert.equal(getQuestionInstanceId(secondRestored), secondOccurrence);
  assert.equal(secondRestored.phase, 'revealed', 'forward navigation to a settled occurrence must not reopen it');
  assert.equal(secondRestored.pollVoters[first.id], undefined);
  assert.equal(secondRestored.seenDevices[deviceId]?.answered, awarded.answered);
  assert.equal(secondRestored.seenDevices[deviceId]?.score, awarded.score);

  useGameStore.getState().dispatch({ type: 'RESET' });
  const reset = useGameStore.getState();
  assert.deepEqual(reset.pollVotes, {});
  assert.deepEqual(reset.pollVoters, {});
  assert.deepEqual(reset.settledQuestionInstances, {});
  assert.deepEqual(reset.settledResults, {});
});

test('occurrence migration also accounts for opening slides and removed interludes', () => {
  useGameStore.setState({ ...initial, sessionId: 'interlude-resume' }, true);
  const opening = initial.run[0]!;
  const interlude = { id: 'legacy-focus', type: 'focus', title: 'Legacy interlude' } as typeof opening;
  const run = [opening, first, interlude, held, first];
  settleAt(run, 1, String(first.answer));
  const saved = settleAt(run, 4, String(!first.answer));
  const restored = merge(saved, initial);
  assert.deepEqual(restored.run, [opening, first, first]);
  assert.equal(restored.slideIndex, 2);
  assert.deepEqual(Object.keys(restored.settledQuestionInstances), ['interlude-resume:1:q4', 'interlude-resume:2:q4']);
  assert.deepEqual(restored.settledResults['interlude-resume:2:q4'], saved.settledResults['interlude-resume:4:q4']);
  assert.deepEqual(restored.seenDevices, saved.seenDevices);
});

test('a removed current question resumes the next unplayed card without reveal or timer residue', () => {
  for (const phase of ['revealed', 'entering', 'deliberating', 'locked', 'timedOut'] as const) {
    const current = {
      ...initial, posedAt: 10, revealedAt: 20,
      voting: { questionId: held.id, window: 'closed', firstSplit: { true: 1 }, finalSplit: { true: 1 }, switched: 1, firstVoters: {}, talkStartedAt: 10, talkEndsAt: 20 },
    };
    const restored = merge({
      sessionId: 'removed-current', run: [first, held, last], slideIndex: 1, phase, votesLocked: true,
      timer: { ...initial.timer, durationMs: 20_000, remainingMs: 1, running: true, enabled: true, visible: true, endsAt: 1 },
    }, current);
    assert.equal(restored.slideIndex, 1);
    assert.equal(restored.run[1]?.id, last.id);
    assert.equal(restored.phase, 'entering', phase);
    assert.equal(restored.votesLocked, false, phase);
    assert.equal(restored.timer.remainingMs, 20_000);
    assert.equal(restored.timer.running, false);
    assert.equal(restored.timer.endsAt, null);
    assert.equal(restored.timer.pauseReason, 'manual');
    assert.equal(restored.posedAt, null);
    assert.equal(restored.revealedAt, null);
    assert.equal(restored.voting.questionId, null);
    assert.equal(restored.voting.window, 'open');
    assert.equal(restored.voting.firstSplit, null);
    assert.equal(restored.voting.finalSplit, null);
    assert.equal(restored.voting.talkEndsAt, null);
    const projection = projectGameState(restored, 'TEST', 1);
    assert.equal(projection.roomState.reveal, null);
    assert.equal(projection.roomState.timerRunning, false);
    assert.equal(projectAttendeeState(restored, deviceId, projection.questionProjection).result, null);
  }
});

test('a removed tail resumes an already settled survivor without reopening or rescoring it', () => {
  useGameStore.setState({ ...initial, sessionId: 'held-tail' }, true);
  const settled = settleAt([first, held], 0, String(first.answer));
  const restored = merge({ ...settled, slideIndex: 1, phase: 'revealed' }, initial);
  assert.equal(restored.slideIndex, 0);
  assert.equal(restored.phase, 'revealed');
  assert.equal(restored.votesLocked, true);
  assert.equal(restored.timer.running, false);
  assert.equal(restored.timer.endsAt, null);
  useGameStore.setState(restored, true);
  useGameStore.getState().dispatch({ type: 'REVEAL' });
  assert.deepEqual(useGameStore.getState().seenDevices, settled.seenDevices);
});

test('unfiltered custom duplicate runs preserve order, current reveal and settlement identity', () => {
  const custom = { ...first, id: 'custom-choice', statement: 'A synthetic statement for saved-run regression.' };
  useGameStore.setState({ ...initial, sessionId: 'custom-resume' }, true);
  const saved = settleAt([last, custom, first, custom], 3, String(custom.answer));
  const restored = merge(saved, initial);
  assert.deepEqual(restored.run, saved.run);
  assert.equal(restored.slideIndex, 3);
  assert.equal(restored.phase, 'revealed');
  assert.deepEqual(restored.settledQuestionInstances, saved.settledQuestionInstances);
  assert.deepEqual(restored.settledResults, saved.settledResults);
  assert.deepEqual(restored.seenDevices, saved.seenDevices);
});

test('restored settlements discard malformed neighbors and retain valid results and settlement guards', () => {
  const occurrence = 'settlement-validation:0:q4';
  const valid = { choice: 'true', conviction: 'fairly-sure', isRight: true, score: 2, streakBonus: 0, realityGapDelta: 0 };
  const malformed = [
    null, [], 'invalid', { ...valid, isRight: {} }, { ...valid, score: {} }, { ...valid, score: NaN },
    { ...valid, choice: {} }, { ...valid, conviction: {} }, { ...valid, realityGapDelta: {} }, { ...valid, realityGapDelta: -1 },
  ];
  for (const bad of malformed) {
    const restored = merge({
      sessionId: 'settlement-validation', run: [first], slideIndex: 0, phase: 'revealed',
      settledQuestionInstances: { [occurrence]: true, corrupt: {} },
      settledResults: { [occurrence]: { bad, valid }, malformedOccurrence: [] },
    }, initial);
    assert.deepEqual(restored.settledResults[occurrence], { valid });
    assert.deepEqual(restored.settledQuestionInstances, { [occurrence]: true });
    assert.equal(restored.settledResults.malformedOccurrence, undefined);
    const projection = projectGameState(restored, 'TEST', 1);
    const rejected = projectAttendeeState(restored, 'bad', projection.questionProjection);
    const retained = projectAttendeeState(restored, 'valid', projection.questionProjection);
    assert.equal(rejected.result, null);
    assert.equal(validateAttendeeState(rejected), true);
    assert.equal(retained.result?.points, 2);
    assert.equal(validateAttendeeState(retained), true);
  }
});

test('restoring an old snapshot whose settled vote has no streakBonus defaults it to 0 instead of dropping the vote', () => {
  const occurrence = 'settlement-validation-no-bonus:0:q4';
  const { streakBonus: _omitted, ...withoutStreakBonus } = { choice: 'true', conviction: 'fairly-sure', isRight: true, score: 2, streakBonus: 0, realityGapDelta: 0 };
  const restored = merge({
    sessionId: 'settlement-validation-no-bonus', run: [first], slideIndex: 0, phase: 'revealed',
    settledQuestionInstances: { [occurrence]: true },
    settledResults: { [occurrence]: { legacy: withoutStreakBonus } },
  }, initial);
  assert.deepEqual(restored.settledResults[occurrence], { legacy: { ...withoutStreakBonus, streakBonus: 0 } });
});

test('restored settlements clamp a corrupted persisted streakBonus to 0 instead of forwarding it raw (STREAK-PILL)', () => {
  const occurrence = 'streak-bonus-restore:0:q4';
  const base = { choice: 'true', conviction: 'fairly-sure', isRight: true, score: 2, realityGapDelta: 0 };
  const restored = merge({
    sessionId: 'streak-bonus-restore', run: [first], slideIndex: 0, phase: 'revealed',
    settledQuestionInstances: { [occurrence]: true },
    settledResults: {
      [occurrence]: {
        tooHigh: { ...base, streakBonus: 150 },
        nonInteger: { ...base, streakBonus: 12.5 },
        negative: { ...base, streakBonus: -1 },
        clean: { ...base, streakBonus: 50 },
        absent: { ...base },
      },
    },
  }, initial) as any;
  assert.equal(restored.settledResults[occurrence].tooHigh.streakBonus, 0, 'above scoring.ts\'s real maximum clamps to 0');
  assert.equal(restored.settledResults[occurrence].nonInteger.streakBonus, 0, 'a non-integer clamps to 0');
  assert.equal(restored.settledResults[occurrence].negative.streakBonus, 0, 'negative clamps to 0');
  assert.equal(restored.settledResults[occurrence].clean.streakBonus, 50, 'an in-bound value is preserved');
  assert.equal(restored.settledResults[occurrence].absent.streakBonus, 0, 'no persisted value at all stays 0');
});

test('a corrupted roomStats snapshot drops only its malformed nested entries instead of passing them through raw (QA-PERSIST-01)', () => {
  const restored = merge({
    roomStats: {
      questions: { q1: { trueCount: 3, falseCount: 1, correctPct: 75, majorityWrong: false }, corrupt: 'not-a-question' },
      accuracy: 75, streak: 2, bestStreak: 3, mythsBusted: 0, swing: 0, certainTotal: 1, certainWrongTotal: 0, votesTotal: 4,
      devices: {
        good: { nickname: 'Good', team: 'NAVY', joinedAt: 1, score: 1, answered: 1, correct: 1, streak: 1, bestStreak: 1, realityGap: 0, hardQuestionPoints: 0 },
        corrupt: 'not-a-device',
      },
      teams: { NAVY: { phones: 1, score: 1, accuracy: 100 }, GOLD: { phones: 0, score: 0, accuracy: 0 } },
    },
  }, initial) as any;
  assert.deepEqual(Object.keys(restored.roomStats.questions), ['q1'], 'the malformed question entry is dropped, the valid one kept');
  assert.deepEqual(Object.keys(restored.roomStats.devices), ['good'], 'the malformed device entry is dropped, the valid one kept');
  assert.equal(restored.roomStats.accuracy, 75);
  assert.deepEqual(restored.roomStats.teams, { NAVY: { phones: 1, score: 1, accuracy: 100 }, GOLD: { phones: 0, score: 0, accuracy: 0 } });
});

test('a fundamentally malformed roomStats snapshot falls back to the current room stats instead of passing through raw (QA-PERSIST-01)', () => {
  const restored = merge({ roomStats: { votesTotal: 'not-a-number' } }, initial) as any;
  assert.deepEqual(restored.roomStats, initial.roomStats);
});

test('a roomStats snapshot saved without the newer counters keeps its accuracy and streaks, and the absent counters read as 0', () => {
  const restored = merge({
    roomStats: {
      questions: { q1: { trueCount: 3, falseCount: 1, correctPct: 75, majorityWrong: false } },
      accuracy: 72, streak: 3, bestStreak: 5, mythsBusted: 4, votesTotal: 18,
    },
  }, initial) as any;
  assert.equal(restored.roomStats.accuracy, 72, 'accuracy survives a snapshot that predates swing and the certain totals');
  assert.equal(restored.roomStats.bestStreak, 5);
  assert.equal(restored.roomStats.swing, 0);
  assert.equal(restored.roomStats.certainTotal, 0);
  assert.equal(restored.roomStats.certainWrongTotal, 0);
  const garbage = merge({
    roomStats: { questions: {}, accuracy: 72, streak: 3, bestStreak: 5, mythsBusted: 4, votesTotal: 18, swing: 'lots' },
  }, initial) as any;
  assert.deepEqual(garbage.roomStats, initial.roomStats, 'a counter that is present but not a number still rejects the snapshot');
});
