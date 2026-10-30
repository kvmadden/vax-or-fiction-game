// Solo pace (VOF-W7, 2026-09-27): the pure math behind Run, Climb and Best -- round size, streak tiers, Climb's
// escalating order and its checkpoint/climax, the round-end recap replay, and Best's localStorage comparison. No
// store, no DOM: every case here is cheap, and a real change to the engine's own score() shows up as a mismatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSoloPace, streakTier, RUN_MILESTONES } from '../../src/solo/pace/soloPace.ts';
import { buildPaceRoundRecap, checkpointIndex, climaxIndex, orderForClimb, kindOf, type PaceQuestionOutcome } from '../../src/solo/pace/pace-recap.ts';
import { comparePersonalBest, readPersonalBest, writePersonalBest } from '../../src/solo/pace/personal-best.ts';
import { score } from '../../src/engine/scoring.ts';
import type { RuntimeMeta } from '../../src/data/bank/types.ts';
import type { Question } from '../../src/data/types.ts';

test('readSoloPace: a missing or unrecognized value defaults to Run, and explicit paces still work', () => {
  assert.equal(readSoloPace(''), 'run');
  assert.equal(readSoloPace('?soloPace=nope'), 'run');
  assert.equal(readSoloPace('?soloPace=CLIMB'), 'run', 'case sensitive: only the exact lowercase value counts');
  assert.equal(readSoloPace('?soloPace='), 'run');
  assert.equal(readSoloPace('?other=1'), 'run');
  assert.equal(readSoloPace(), 'run', 'server rendering defaults to Run too');
  assert.equal(readSoloPace('?soloPace=run'), 'run');
  assert.equal(readSoloPace('?soloPace=climb'), 'climb');
  assert.equal(readSoloPace('?soloPace=best'), 'best');
  assert.equal(readSoloPace('?soloPace=today'), 'today');
  assert.equal(readSoloPace('?other=1&soloPace=climb'), 'climb', 'reads it out of other params too');
});

test('streakTier: 0 below 3, then one tier per named milestone, 12 counted in tier 3 (9.3)', () => {
  assert.deepEqual(RUN_MILESTONES, [3, 5, 8, 12]);
  assert.equal(streakTier(0), 0);
  assert.equal(streakTier(2), 0);
  assert.equal(streakTier(3), 1);
  assert.equal(streakTier(4), 1);
  assert.equal(streakTier(5), 2);
  assert.equal(streakTier(7), 2);
  assert.equal(streakTier(8), 3);
  assert.equal(streakTier(12), 3);
  assert.equal(streakTier(20), 3);
});

const q = (id: string, kind: Question['kind']): Question => ({ id, kind, reveal: '', takeaway: `${id} takeaway` } as Question);

test('checkpointIndex and climaxIndex: halfway, and the last question', () => {
  assert.equal(checkpointIndex(8), 4);
  assert.equal(climaxIndex(8), 7);
  assert.equal(checkpointIndex(10), 5);
  assert.equal(climaxIndex(10), 9);
});

test('orderForClimb: lightest kind first, a stable sort on ties, never touches ids that were not dealt', () => {
  const questions = [q('a', 'order'), q('b', 'binary'), q('c', 'which-patient'), q('d', 'binary'), q('e', 'estimate')];
  const ordered = orderForClimb(['a', 'b', 'c', 'd', 'e'], questions);
  assert.deepEqual(ordered, ['b', 'd', 'e', 'c', 'a'], 'binary, binary, estimate, which-patient, order -- weight order, ties in dealt order');
  assert.equal(new Set(ordered).size, 5, 'every dealt id is still there, once');
});

test('orderForClimb: an unauthored kind defaults to binary, the lightest weight', () => {
  const questions = [q('a', undefined), q('b', 'order')];
  assert.deepEqual(orderForClimb(['b', 'a'], questions), ['a', 'b']);
  assert.equal(kindOf(questions[0]), 'binary');
  assert.equal(kindOf(undefined), 'binary');
});

test('orderForClimb: level leads, kind weight breaks ties, and dealt order breaks the remaining ties', () => {
  const questions = [q('a', 'order'), q('b', 'binary'), q('c', 'which-patient'), q('d', 'binary'), q('e', 'estimate'), q('f', 'myth-among-three')];
  const meta = new Map<string, RuntimeMeta | null>([
    ['a', { difficulty: 'expert' } as RuntimeMeta],
    ['b', { difficulty: 'medium' } as RuntimeMeta],
    ['c', { difficulty: 'hard' } as RuntimeMeta],
    ['d', { difficulty: 'easy' } as RuntimeMeta],
    ['e', { difficulty: 'medium' } as RuntimeMeta],
    ['f', { difficulty: 'hard' } as RuntimeMeta],
  ]);
  assert.deepEqual(orderForClimb(['a', 'b', 'c', 'd', 'e', 'f'], questions, meta), ['d', 'b', 'e', 'f', 'c', 'a']);
});

function outcomesOf(pattern: readonly (boolean | Question['kind'])[][]): PaceQuestionOutcome[] {
  return pattern.map(([isRight, kind], index) => ({ id: `q${index}`, kind: kind as Question['kind'], isRight: isRight as boolean, takeaway: isRight ? undefined : `q${index} takeaway` }));
}

test('buildPaceRoundRecap: replays the engine\'s own score() question by question, same as the store', () => {
  const outcomes = outcomesOf([[true, 'binary'], [true, 'binary'], [true, 'binary'], [false, 'binary'], [true, 'estimate']]);
  const recap = buildPaceRoundRecap(outcomes);
  let streak = 0;
  let expected = 0;
  let bestStreak = 0;
  for (const outcome of outcomes) {
    const result = score(outcome.isRight as boolean, outcome.kind, streak);
    streak = result.nextStreak;
    bestStreak = Math.max(bestStreak, streak);
    expected += result.points;
  }
  assert.equal(recap.points, expected);
  assert.equal(recap.bestStreak, bestStreak);
  assert.equal(recap.correct, 4);
  assert.equal(recap.answered, 5);
  assert.equal(recap.total, 5);
  assert.deepEqual(recap.missedTakeaways, [{ id: 'q3', takeaway: 'q3 takeaway' }]);
  assert.equal(recap.climaxHit, null, 'no climax without an index');
});

test('buildPaceRoundRecap: an unanswered question (null) counts toward total but never answered, correct or missed', () => {
  const outcomes: PaceQuestionOutcome[] = [{ id: 'q0', kind: 'binary', isRight: true }, { id: 'q1', kind: 'binary', isRight: null }];
  const recap = buildPaceRoundRecap(outcomes);
  assert.equal(recap.total, 2);
  assert.equal(recap.answered, 1);
  assert.equal(recap.correct, 1);
  assert.deepEqual(recap.missedTakeaways, []);
});

test('buildPaceRoundRecap: Climb\'s climax doubles only its own index\'s points, and only in the pace-scaled total', () => {
  const outcomes = outcomesOf([[true, 'binary'], [true, 'binary'], [true, 'which-patient']]);
  const plain = buildPaceRoundRecap(outcomes);
  const climaxed = buildPaceRoundRecap(outcomes, 2);
  const thirdAlone = score(true, 'which-patient', 2); // streak of 2 going in, same as the plain replay
  assert.equal(climaxed.points, plain.points + thirdAlone.points, 'the climax question\'s own points count a second time');
  assert.equal(climaxed.climaxHit, true);
  // Control: a missed climax never pays double, and says so.
  const missedClimax = outcomesOf([[true, 'binary'], [true, 'binary'], [false, 'which-patient']]);
  const recap = buildPaceRoundRecap(missedClimax, 2);
  assert.equal(recap.climaxHit, false);
  assert.equal(recap.points, buildPaceRoundRecap(missedClimax).points, 'a miss scores 0 either way, so doubling it changes nothing');
});

// -- Best: localStorage, wrapped so a blocked store never breaks the round. --

function withMemoryStorage<T>(run: () => T): T {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true, writable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true, writable: true });
  }
}

function withBlockedStorage<T>(run: () => T): T {
  const blocked = {
    getItem() { throw new DOMException('blocked', 'SecurityError'); },
    setItem() { throw new DOMException('blocked', 'SecurityError'); },
    removeItem() { throw new DOMException('blocked', 'SecurityError'); },
  };
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: blocked, configurable: true, writable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true, writable: true });
  }
}

test('personal best: reads and writes round-trip through localStorage, keyed by topic and round length (9.6, v2 keys)', () => {
  withMemoryStorage(() => {
    assert.equal(readPersonalBest('flu', 19), null);
    assert.equal(writePersonalBest('flu', 19, { score: 500, correct: 4, total: 19, savedAt: 1 }), true);
    assert.deepEqual(readPersonalBest('flu', 19), { score: 500, correct: 4, total: 19, savedAt: 1 });
    assert.equal(readPersonalBest('rsv', 19), null, 'a different topic\'s best stays separate');
    assert.equal(readPersonalBest('flu', 20), null, 'the same topic at a different round length is a different best (9.6)');
  });
});

test('writePersonalBest: a v2 best clears the old, round-size-blind v1 key for that topic (9.6)', () => {
  withMemoryStorage(() => {
    localStorage.setItem('vof-solo-best:flu', JSON.stringify({ score: 400, correct: 3, total: 8, savedAt: 0 }));
    assert.equal(writePersonalBest('flu', 19, { score: 500, correct: 4, total: 19, savedAt: 1 }), true);
    assert.equal(localStorage.getItem('vof-solo-best:flu'), null, 'the v1 key is gone the first time a v2 best lands');
    assert.deepEqual(readPersonalBest('flu', 19), { score: 500, correct: 4, total: 19, savedAt: 1 });
  });
});

test('personal best: a blocked or unreadable store never throws -- read returns null, write returns false', () => {
  withBlockedStorage(() => {
    assert.equal(readPersonalBest('flu', 19), null);
    assert.equal(writePersonalBest('flu', 19, { score: 500, correct: 4, total: 19, savedAt: 1 }), false);
  });
  withMemoryStorage(() => {
    localStorage.setItem('vof-solo-best:v2:flu:19', 'not json');
    assert.equal(readPersonalBest('flu', 19), null, 'unreadable JSON reads as no best, not a crash');
    localStorage.setItem('vof-solo-best:v2:flu:19', JSON.stringify({ score: 'five hundred' }));
    assert.equal(readPersonalBest('flu', 19), null, 'a shape that is not a real best reads as none');
  });
});

test('comparePersonalBest: first run sets the target; a beat saves; close and keep-going never overwrite it', () => {
  withMemoryStorage(() => {
    const first = comparePersonalBest('hpv', 11, { score: 400, correct: 3, total: 11 });
    assert.equal(first.outcome, 'first-run');
    assert.equal(first.saved, true);
    assert.equal(readPersonalBest('hpv', 11)?.score, 400);

    const beat = comparePersonalBest('hpv', 11, { score: 550, correct: 5, total: 11 });
    assert.equal(beat.outcome, 'new-best');
    assert.equal(beat.saved, true);
    assert.equal(readPersonalBest('hpv', 11)?.score, 550, 'the new best is what is stored now');

    const close = comparePersonalBest('hpv', 11, { score: 500, correct: 4, total: 11 });
    assert.equal(close.outcome, 'close');
    assert.equal(close.saved, false);
    assert.equal(readPersonalBest('hpv', 11)?.score, 550, 'a close round never overwrites the real best');

    const keepGoing = comparePersonalBest('hpv', 11, { score: 100, correct: 1, total: 11 });
    assert.equal(keepGoing.outcome, 'keep-going');
    assert.equal(keepGoing.saved, false);
    assert.equal(readPersonalBest('hpv', 11)?.score, 550);
  });
});

test('comparePersonalBest: a blocked store still compares (against nothing) without throwing, and never claims a save', () => {
  withBlockedStorage(() => {
    const result = comparePersonalBest('shingles', 14, { score: 300, correct: 3, total: 14 });
    assert.equal(result.outcome, 'first-run');
    assert.equal(result.saved, false, 'storage refused it, so the recap must not claim it saved');
  });
});
