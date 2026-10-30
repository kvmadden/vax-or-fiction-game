import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuestionInstanceId, useGameStore } from '../../src/store/game-store';

const question = { id: 'reaction-card', kind: 'binary', statement: 'Fictional test statement.', answer: true };
function seed() {
  useGameStore.setState({ ...useGameStore.getInitialState(), sessionId: 'reaction-run', phase: 'explaining',
    slideIndex: 0, run: [question, question] as any, stageReactionsEnabled: true, reactionTickerEnabled: true,
  });
  return useGameStore.getState().dispatch;
}
const current = () => useGameStore.getState().reactions[getQuestionInstanceId(useGameStore.getState())!];

test('received reaction keeps compatibility totals and a canonical current-occurrence summary', () => {
  const dispatch = seed();
  dispatch({ type: 'RECORD_REACTION', reaction: 'applause', questionId: question.id });
  dispatch({ type: 'REACTION', reaction: 'waitReally', questionId: question.id });
  assert.deepEqual(current(), { 'we-do-this': 1, 'wait-really': 1, total: 2 });
  assert.equal(useGameStore.getState().reactions[question.id]['we-do-this'], 1);
});

test('a repeated question does not inherit another occurrence reactions; Back restores its own counts', () => {
  const dispatch = seed();
  dispatch({ type: 'RECORD_REACTION', reaction: 'applause' });
  useGameStore.setState({ slideIndex: 1 });
  assert.equal(current(), undefined);
  dispatch({ type: 'RECORD_REACTION', reaction: 'wait-really' });
  assert.deepEqual(current(), { 'wait-really': 1, total: 1 });
  useGameStore.setState({ slideIndex: 0 });
  assert.deepEqual(current(), { 'we-do-this': 1, total: 1 });
});

test('a delayed different question reaction cannot populate the active occurrence summary', () => {
  const dispatch = seed();
  dispatch({ type: 'RECORD_REACTION', reaction: 'applause', questionId: 'a-different-card' });
  assert.equal(current(), undefined);
});
