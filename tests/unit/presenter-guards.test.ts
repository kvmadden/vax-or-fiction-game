import assert from 'node:assert/strict';
import test from 'node:test';
import { useGameStore } from '../../src/store/game-store';
import { armOrCommit, shouldGuardShowdownAdvance, shouldGuardSkip } from '../../src/engine/presenter-guards';

test('skip is guarded only when phones are in and votes are still open', () => {
  const live = { offlineMode: false, interactionMode: 'polling', votesLocked: false, phonesJoined: 12, votesIn: 3, onQuestion: true };
  assert.equal(shouldGuardSkip(live), true);
  assert.equal(shouldGuardSkip({ ...live, votesIn: 12 }), false);
  assert.equal(shouldGuardSkip({ ...live, votesLocked: true }), false);
  assert.equal(shouldGuardSkip({ ...live, phonesJoined: 0 }), false);
  assert.equal(shouldGuardSkip({ ...live, interactionMode: 'facilitator' }), false);
});

test('showdown Next is guarded on lineup with phones and no picks', () => {
  const live = { phase: 'showdown', stage: 'lineup', finalistCount: 2, phonesJoined: 30, predictionCount: 0 };
  assert.equal(shouldGuardShowdownAdvance(live), true);
  assert.equal(shouldGuardShowdownAdvance({ ...live, predictionCount: 1 }), false);
  assert.equal(shouldGuardShowdownAdvance({ ...live, finalistCount: 1 }), false);
  assert.equal(shouldGuardShowdownAdvance({ ...live, stage: 'duel' }), false);
});

test('armOrCommit arms on the first press and commits on the second', () => {
  const first = armOrCommit({ presenterArm: null }, 'skip', (state) => ({ ...state, done: true }));
  assert.deepEqual(first, { presenterArm: { kind: 'skip' } });
  const second = armOrCommit(first, 'skip', (state) => ({ ...state, done: true }));
  assert.deepEqual(second, { presenterArm: null, done: true });
});

test('SKIP with phones still answering arms, then the second press leaves the question', () => {
  const question = { id: 'q-live', type: 'question', kind: 'binary', statement: 'Live?', answer: true };
  const next = { id: 'q-next', type: 'question', kind: 'binary', statement: 'Next?', answer: false };
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    run: [question, next] as never,
    slideIndex: 0,
    phase: 'entering',
    interactionMode: 'polling',
    offlineMode: false,
    votesLocked: false,
    pollVoters: {},
    seenDevices: { phone: { nickname: 'Ada', team: null, joinedAt: 1, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0 } },
    presenterArm: null,
  } as never);
  useGameStore.getState().dispatch({ type: 'SKIP' });
  assert.equal(useGameStore.getState().presenterArm?.kind, 'skip');
  assert.equal(useGameStore.getState().slideIndex, 0);
  useGameStore.getState().dispatch({ type: 'SKIP' });
  assert.equal(useGameStore.getState().presenterArm, null);
  assert.equal(useGameStore.getState().slideIndex, 1);
});
