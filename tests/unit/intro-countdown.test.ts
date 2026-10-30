import test from 'node:test';
import assert from 'node:assert/strict';

import { useGameStore } from '../../src/store/game-store';
import {
  INTRO_COUNTDOWN_MS,
  INTRO_COUNTDOWN_STALE_MS,
  INTRO_LANDING_GRACE_MS,
  INTRO_COUNTDOWN_STEP_MS,
  introCountdownNumber,
  isIntroCountdownBeat,
  isIntroCountdownRunning,
} from '../../src/engine/intro-countdown';

// VOF-88: the 3-2-1 into question 1. The first advance on the instructions starts it, an advance during
// it skips straight in, Back cancels it, and the stage's own finish lands question 1 only for the count
// it started.

function slideId(): string | undefined {
  const state = useGameStore.getState();
  return (state.run[state.slideIndex] as { id?: string } | undefined)?.id;
}

function onInstructions(): void {
  useGameStore.setState(useGameStore.getInitialState());
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ENTER_LOBBY' });
  dispatch({ type: 'ADVANCE' });
  dispatch({ type: 'ADVANCE' });
  assert.equal(slideId(), 'instructions');
  assert.equal(useGameStore.getState().introCountdownAt, null);
}

test('the count belongs to the instructions beat with a question next, and nowhere else', () => {
  const run = [{ id: 'title', type: 'title' }, { id: 'instructions', type: 'instructions' }, { id: 'q1', type: 'question', kind: 'binary', statement: 's' }];
  assert.equal(isIntroCountdownBeat({ phase: 'entering', slideIndex: 1, run }), true);
  assert.equal(isIntroCountdownBeat({ phase: 'entering', slideIndex: 0, run }), false, 'the title');
  assert.equal(isIntroCountdownBeat({ phase: 'entering', slideIndex: 2, run }), false, 'a question');
  assert.equal(isIntroCountdownBeat({ phase: 'lobby', slideIndex: 1, run }), false, 'the lobby phase');
  assert.equal(isIntroCountdownBeat({ phase: 'entering', slideIndex: 1, run: run.slice(0, 2) }), false, 'no question after it');
});

test('a stamp counts only while it is fresh, and the numbers step 3, 2, 1 then stop', () => {
  const start = 1_000_000;
  assert.equal(isIntroCountdownRunning(null, start), false);
  assert.equal(isIntroCountdownRunning(start, start), true);
  assert.equal(isIntroCountdownRunning(start, start + INTRO_COUNTDOWN_STALE_MS - 1), true);
  assert.equal(isIntroCountdownRunning(start, start + INTRO_COUNTDOWN_STALE_MS), false, 'a stale stamp');
  assert.equal(isIntroCountdownRunning(start, start - 1), false, 'a stamp from the future');
  assert.equal(introCountdownNumber(start, start), 3);
  assert.equal(introCountdownNumber(start, start + INTRO_COUNTDOWN_STEP_MS - 1), 3);
  assert.equal(introCountdownNumber(start, start + INTRO_COUNTDOWN_STEP_MS), 2);
  assert.equal(introCountdownNumber(start, start + INTRO_COUNTDOWN_STEP_MS * 2), 1);
  assert.equal(introCountdownNumber(start, start + INTRO_COUNTDOWN_MS), null);
});

test('the first advance on the instructions starts the count and a second skips into question 1', () => {
  onInstructions();
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ADVANCE' });
  assert.equal(slideId(), 'instructions', 'the count holds the beat');
  const stamp = useGameStore.getState().introCountdownAt;
  assert.equal(typeof stamp, 'number');
  dispatch({ type: 'ADVANCE' });
  assert.equal(slideId(), 'q35');
  assert.equal(useGameStore.getState().phase, 'entering');
  assert.equal(useGameStore.getState().introCountdownAt, null);
});

test('a skip press that arrives just after the count landed question 1 does not lock it', () => {
  onInstructions();
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ADVANCE' });
  dispatch({ type: 'FINISH_INTRO_COUNTDOWN', startedAt: useGameStore.getState().introCountdownAt as number });
  assert.equal(slideId(), 'q35');
  dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().votesLocked, false, 'the late press is dropped');
  assert.equal(useGameStore.getState().phase, 'entering');
  useGameStore.setState({ introLandedAt: (useGameStore.getState().introLandedAt as number) - INTRO_LANDING_GRACE_MS - 50 });
  dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().votesLocked, true, 'after the grace the press locks as it always has');
  assert.equal(useGameStore.getState().introLandedAt, null, 'and the grace stamp ends there');
});

test('a skip lands question 1 with no grace, so the next press locks as always', () => {
  onInstructions();
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ADVANCE' });
  dispatch({ type: 'ADVANCE' });
  assert.equal(slideId(), 'q35');
  assert.equal(useGameStore.getState().introLandedAt, null);
  dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().votesLocked, true);
});

test('opening help or asking to restart stops a running count', () => {
  for (const action of [{ type: 'OPEN_HELP' as const }, { type: 'REQUEST_RESTART_RUN' as const }]) {
    onInstructions();
    useGameStore.getState().dispatch({ type: 'ADVANCE' });
    useGameStore.getState().dispatch(action);
    assert.equal(useGameStore.getState().introCountdownAt, null, action.type);
    assert.equal(slideId(), 'instructions', action.type);
  }
});

test('the finish lands question 1 only for the count it was stamped with', () => {
  onInstructions();
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ADVANCE' });
  const stamp = useGameStore.getState().introCountdownAt as number;
  dispatch({ type: 'FINISH_INTRO_COUNTDOWN', startedAt: stamp - 1 });
  assert.equal(slideId(), 'instructions', 'a different count cannot move the show');
  dispatch({ type: 'FINISH_INTRO_COUNTDOWN', startedAt: stamp });
  assert.equal(slideId(), 'q35');
  assert.equal(useGameStore.getState().introCountdownAt, null);
  dispatch({ type: 'FINISH_INTRO_COUNTDOWN', startedAt: stamp });
  assert.equal(slideId(), 'q35', 'a late finish after the skip does nothing');
});

test('back during the count cancels it and stays, and the next back leaves the beat', () => {
  onInstructions();
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ADVANCE' });
  dispatch({ type: 'BACK' });
  assert.equal(slideId(), 'instructions');
  assert.equal(useGameStore.getState().introCountdownAt, null);
  dispatch({ type: 'BACK' });
  assert.equal(slideId(), 'title');
});

test('a stale stamp never turns an ordinary press into a skip', () => {
  onInstructions();
  useGameStore.setState({ introCountdownAt: Date.now() - INTRO_COUNTDOWN_STALE_MS - 50 });
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  assert.equal(slideId(), 'instructions', 'it starts a fresh count instead of skipping');
  assert.ok(Date.now() - (useGameStore.getState().introCountdownAt as number) < 1000);
});

test('no other beat counts: the title advances straight to the instructions', () => {
  useGameStore.setState(useGameStore.getInitialState());
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ENTER_LOBBY' });
  dispatch({ type: 'ADVANCE' });
  assert.equal(slideId(), 'title');
  dispatch({ type: 'ADVANCE' });
  assert.equal(slideId(), 'instructions');
  assert.equal(useGameStore.getState().introCountdownAt, null);
});

test('the count is never persisted, so a reload mid-count lands back on the instructions', () => {
  onInstructions();
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  const saved = useGameStore.persist.getOptions().partialize!(useGameStore.getState()) as Record<string, unknown>;
  assert.equal('introCountdownAt' in saved, false);
  assert.equal('introLandedAt' in saved, false);
});
