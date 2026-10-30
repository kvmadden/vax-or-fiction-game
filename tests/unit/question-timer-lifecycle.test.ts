import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuestionInstanceId, useGameStore } from '../../src/store/game-store';
import type { GameAction, GameState } from '../../src/store/game-store';

function seed(phase: GameState['phase'] = 'entering') {
  const initial = useGameStore.getInitialState();
  useGameStore.setState({ ...initial, sessionId: 'clock-occurrence', phase, slideIndex: 0,
    run: [{ id: 'clock-question', kind: 'binary', statement: 'A fictional test statement.', answer: true }] as GameState['run'],
    timer: { ...initial.timer, durationMs: 45000, remainingMs: 45000, enabled: true, visible: true, running: false, endsAt: null },
  });
  return useGameStore.getState().dispatch;
}

test('auto deliberation publishes one shared phase and preserves the authored clock', () => {
  const dispatch = seed();
  const action = { type: 'BEGIN_DELIBERATION', questionInstanceId: 'clock-occurrence:0:clock-question' } as GameAction;
  dispatch(action);
  assert.equal(useGameStore.getState().phase, 'deliberating');
  assert.equal(useGameStore.getState().timer.running, true);
  assert.equal(useGameStore.getState().timer.remainingMs, 45000);
  dispatch({ type: 'TICK_TIMER' });
  dispatch(action);
  assert.equal(useGameStore.getState().timer.remainingMs, 44000, 'repeated entry cannot restart a running question');
});

test('stale or locked auto-deliberation cannot start another occurrence or a stopped vote', () => {
  for (const change of [{ slideIndex: 1 }, { sessionId: 'replacement-run' }, { votesLocked: true }, { phase: 'explaining' as const }]) {
    const dispatch = seed();
    useGameStore.setState(change);
    const before = useGameStore.getState();
    dispatch({ type: 'BEGIN_DELIBERATION', questionInstanceId: 'clock-occurrence:0:clock-question' } as GameAction);
    assert.equal(useGameStore.getState(), before);
  }
  const dispatch = seed();
  useGameStore.setState({ timer: { ...useGameStore.getState().timer, enabled: false, visible: false } });
  dispatch({ type: 'BEGIN_DELIBERATION', questionInstanceId: getQuestionInstanceId(useGameStore.getState()) } as GameAction);
  assert.equal(useGameStore.getState().phase, 'deliberating');
  assert.equal(useGameStore.getState().timer.running, false, 'an untimed question remains untimed');
});

test('all timer-start doors leave settled and nonquestion phases stopped', () => {
  const actions: GameAction[] = [{ type: 'RESTART_TIMER' }, { type: 'TOGGLE_PAUSE' }, { type: 'START_TIMER' }, { type: 'SET_TIMER', running: true }];
  let checked = 0;
  for (const phase of ['revealed', 'explaining', 'closing', 'lobby', 'preFlight', 'modePicker'] as const) {
    for (const action of actions) {
      const dispatch = seed(phase);
      dispatch(action);
      assert.equal(useGameStore.getState().timer.running, false, `${phase}/${action.type}`);
      assert.equal(useGameStore.getState().timer.endsAt, null, `${phase}/${action.type} deadline`);
      checked++;
    }
  }
  for (const action of actions) {
    const dispatch = seed();
    useGameStore.setState({ run: [{ id: 'title', type: 'title', title: 'Test' }] as GameState['run'] });
    dispatch(action);
    assert.equal(useGameStore.getState().timer.running, false, `static/${action.type}`);
    checked++;
  }
  assert.equal(checked, 28);
});

test('restart after expiry resumes the current unplayed question and ticking; settled replay cannot', () => {
  const dispatch = seed('timedOut');
  useGameStore.setState({ votesLocked: true, timer: { ...useGameStore.getState().timer, remainingMs: 0, pauseReason: 'timedOut' } });
  dispatch({ type: 'RESTART_TIMER' });
  assert.equal(useGameStore.getState().phase, 'deliberating');
  assert.equal(useGameStore.getState().votesLocked, false);
  dispatch({ type: 'TICK_TIMER' });
  assert.equal(useGameStore.getState().timer.remainingMs, 44000);
  dispatch({ type: 'REVEAL' });
  const settled = useGameStore.getState();
  useGameStore.setState({ phase: 'entering' });
  dispatch({ type: 'RESTART_TIMER' });
  assert.equal(useGameStore.getState().timer.running, false);
  assert.deepEqual(useGameStore.getState().settledResults, settled.settledResults);
});

test('persisted legacy running timer is stopped when restoring explanation; setup duration remains configurable', () => {
  const dispatch = seed('explaining');
  const current = useGameStore.getState();
  const merged = useGameStore.persist.getOptions().merge!({ phase: 'explaining', timer: { ...current.timer, running: true, endsAt: Date.now() + 45000 } }, current);
  assert.equal(merged.timer.running, false);
  assert.equal(merged.timer.endsAt, null);
  useGameStore.setState({ phase: 'preFlight' });
  dispatch({ type: 'SET_TIMER', durationMs: 60000, running: false });
  assert.equal(useGameStore.getState().timer.durationMs, 60000);
});

test('Showdown discussion toggle changes its status without starting the question countdown', () => {
  const dispatch = seed('showdown');
  useGameStore.setState({ showdown: { id: 'duel', stage: 'duel', finalists: [], predictions: {}, predictionCounts: {}, questionIds: [], questionIndex: 0, winner: null, tie: false, isRecap: true } });
  dispatch({ type: 'TOGGLE_PAUSE' });
  assert.equal(useGameStore.getState().timer.pauseReason, 'manual');
  assert.equal(useGameStore.getState().timer.running, false);
  dispatch({ type: 'TOGGLE_PAUSE' });
  assert.equal(useGameStore.getState().timer.pauseReason, 'revealed');
  assert.equal(useGameStore.getState().timer.running, false);
});

test('visibility resumes only a running eligible question and preserves a manual pause', () => {
  for (const phase of ['revealed', 'explaining', 'closing', 'preFlight', 'modePicker'] as const) {
    const dispatch = seed(phase);
    dispatch({ type: 'DOCUMENT_HIDDEN' });
    dispatch({ type: 'DOCUMENT_VISIBLE' });
    assert.equal(useGameStore.getState().timer.running, false, phase);
  }
  const dispatch = seed('deliberating');
  useGameStore.setState({ timer: { ...useGameStore.getState().timer, pauseReason: 'manual' } });
  dispatch({ type: 'DOCUMENT_HIDDEN' });
  dispatch({ type: 'DOCUMENT_VISIBLE' });
  assert.equal(useGameStore.getState().timer.pauseReason, 'manual');
  assert.equal(useGameStore.getState().timer.running, false);
  dispatch({ type: 'TOGGLE_PAUSE' });
  dispatch({ type: 'DOCUMENT_HIDDEN' });
  assert.equal(useGameStore.getState().timer.pauseReason, 'documentHidden');
  dispatch({ type: 'DOCUMENT_VISIBLE' });
  assert.equal(useGameStore.getState().timer.running, true);
  dispatch({ type: 'DOCUMENT_HIDDEN' });
  dispatch({ type: 'REVEAL' });
  dispatch({ type: 'DOCUMENT_VISIBLE' });
  assert.equal(useGameStore.getState().timer.running, false);
  seed();
  useGameStore.setState({ run: [{ id: 'title', type: 'title', title: 'Test' }] as GameState['run'], timer: { ...useGameStore.getState().timer, pauseReason: 'documentHidden' } });
  dispatch({ type: 'DOCUMENT_VISIBLE' });
  assert.equal(useGameStore.getState().timer.running, false);
});

test('compatibility START_TIMER preserves the authored duration when omitted', () => {
  const dispatch = seed();
  dispatch({ type: 'START_TIMER' });
  assert.equal(useGameStore.getState().timer.remainingMs, 45000);
  dispatch({ type: 'START_TIMER', seconds: 60 });
  assert.equal(useGameStore.getState().timer.remainingMs, 60000);
});

test('P cannot start a disabled timer; T stops a running clock and enabling it leaves it stopped', () => {
  const dispatch = seed('deliberating');
  useGameStore.setState({ timer: { ...useGameStore.getState().timer, enabled: false, visible: false } });
  dispatch({ type: 'TOGGLE_PAUSE' });
  assert.equal(useGameStore.getState().timer.running, false);
  dispatch({ type: 'TOGGLE_TIMER' });
  assert.equal(useGameStore.getState().timer.running, false);
  dispatch({ type: 'TOGGLE_PAUSE' });
  dispatch({ type: 'TICK_TIMER' });
  assert.equal(useGameStore.getState().timer.remainingMs, 44000);
  dispatch({ type: 'TOGGLE_TIMER' });
  assert.equal(useGameStore.getState().timer.enabled, false);
  assert.equal(useGameStore.getState().timer.running, false);
  assert.equal(useGameStore.getState().timer.endsAt, null);
  dispatch({ type: 'TICK_TIMER' });
  dispatch({ type: 'TOGGLE_TIMER' });
  assert.equal(useGameStore.getState().timer.running, false);
  assert.equal(useGameStore.getState().timer.remainingMs, 44000);
  assert.equal(useGameStore.getState().timer.durationMs, 45000);
});
