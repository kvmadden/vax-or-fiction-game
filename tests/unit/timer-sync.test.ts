import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../../src/store/game-store";

// ==============================================================================

beforeEach(() => {
  const initial = useGameStore.getInitialState();
  useGameStore.setState({ ...initial,
    run: [{ id: "q-timer", type: "question", kind: "binary", statement: "Timer fixture", answer: true }] as any,
    slideIndex: 0, phase: "entering", votesLocked: false,
    timer: { ...initial.timer, running: false, enabled: false, visible: false, endsAt: null },
  });
});
// Timer Synchronization Unit Tests (STATE-04, JUDGE-F03)
// ==============================================================================

test("STATE-04 / JUDGE-F03: Timer starts in initial clean state", () => {
  useGameStore.setState({
    timer: {
      durationMs: 0,
      remainingMs: 0,
      running: false,
      enabled: false,
      visible: false,
      pauseReason: "disabled",
      generation: 0,
    },
    votesLocked: false,
  });

  const state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 0);
  assert.equal(state.timer.running, false);
});

test("STATE-04 / JUDGE-F03: SET_TIMER initializes timer duration and state", () => {
  const store = useGameStore.getState();

  store.dispatch({
    type: "SET_TIMER",
    durationMs: 30000,
    remainingMs: 30000,
    running: true,
  });

  // PRES-04: a SET_TIMER that says nothing about enabled/visible leaves them as they were.
  // The previous expectation (both flip to true) was the phantom 30 s clock that armed itself
  // at the first Lock click and ran on every later question.
  let state = useGameStore.getState();
  assert.equal(state.timer.durationMs, 30000);
  assert.equal(state.timer.remainingMs, 30000);
  assert.equal(state.timer.running, true);
  assert.equal(state.timer.enabled, false, "SET_TIMER must not switch the timer on by itself");
  assert.equal(state.timer.visible, false, "SET_TIMER must not show the timer by itself");

  store.dispatch({ type: "SET_TIMER", enabled: true, visible: true });
  state = useGameStore.getState();
  assert.equal(state.timer.enabled, true, "an explicit enabled flag still switches the timer on");
  assert.equal(state.timer.visible, true, "an explicit visible flag still shows the timer");
});

test("STATE-04 / JUDGE-F03: TICK_TIMER decrements remainingMs by 1000ms when running", () => {
  const store = useGameStore.getState();

  store.dispatch({
    type: "SET_TIMER",
    durationMs: 30000,
    remainingMs: 30000,
    running: true,
  });

  store.dispatch({ type: "TICK_TIMER" });

  let state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 29000);
  assert.equal(state.timer.running, true);

  store.dispatch({ type: "TICK_TIMER" });
  state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 28000);
});

test("STATE-04 / JUDGE-F03: TOGGLE_PAUSE halts countdown and prevents TICK_TIMER from decrementing", () => {
  const store = useGameStore.getState();

  store.dispatch({
    type: "SET_TIMER",
    durationMs: 30000,
    remainingMs: 25000,
    running: true,
    enabled: true,
    visible: true,
  });

  // Facilitator hits pause
  store.dispatch({ type: "TOGGLE_PAUSE" });

  let state = useGameStore.getState();
  assert.equal(state.timer.running, false);
  assert.equal(state.timer.pauseReason, "manual");
  assert.equal(state.timer.remainingMs, 25000);

  // TICK_TIMER should be a no-op while paused
  store.dispatch({ type: "TICK_TIMER" });
  state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 25000, "remainingMs must not decrease while paused");

  // Facilitator hits unpause
  store.dispatch({ type: "TOGGLE_PAUSE" });
  state = useGameStore.getState();
  assert.equal(state.timer.running, true);
  assert.equal(state.timer.pauseReason, null);

  // Now TICK_TIMER should resume decrementing
  store.dispatch({ type: "TICK_TIMER" });
  state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 24000);
});

test("STATE-04 / JUDGE-F03: TICK_TIMER down to 0 expires timer and locks votes", () => {
  const store = useGameStore.getState();

  store.dispatch({
    type: "SET_TIMER",
    durationMs: 30000,
    remainingMs: 1000,
    running: true,
  });
  useGameStore.setState({ votesLocked: false });

  // Final tick
  store.dispatch({ type: "TICK_TIMER" });

  const state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 0);
  assert.equal(state.timer.running, false);
  assert.equal(state.timer.pauseReason, "timedOut");
  assert.equal(state.votesLocked, true, "votes must be locked upon timer expiration");

  // Subsequent ticks cannot take it below 0
  store.dispatch({ type: "TICK_TIMER" });
  assert.equal(useGameStore.getState().timer.remainingMs, 0);
});

test("STATE-04 / JUDGE-F03: ADD_TIME adds milliseconds/seconds and restores vote unlocked if expired", () => {
  const store = useGameStore.getState();

  useGameStore.setState({
    run: [{ id: "q-timer", type: "question", kind: "binary", statement: "Timer fixture", answer: true }] as any,
    slideIndex: 0,
    phase: "entering" as any,
    settledQuestionInstances: {},
  });

  store.dispatch({
    type: "SET_TIMER",
    durationMs: 30000,
    remainingMs: 0,
    running: false,
  });
  useGameStore.setState({ votesLocked: true });

  store.dispatch({ type: "ADD_TIME" });

  const state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 15000);
  assert.equal(state.votesLocked, false, "adding time unlocks voting window");
});

test("STATE-04 / JUDGE-F03: RESTART_TIMER resets remainingMs to durationMs and resumes running", () => {
  const store = useGameStore.getState();

  useGameStore.setState({
    run: [{ id: "q-timer", type: "question", kind: "binary", statement: "Timer fixture", answer: true }] as any,
    slideIndex: 0,
    phase: "entering" as any,
    settledQuestionInstances: {},
  });

  store.dispatch({
    type: "SET_TIMER",
    durationMs: 30000,
    remainingMs: 0,
    running: false,
  });
  useGameStore.setState({ votesLocked: true });

  store.dispatch({ type: "RESTART_TIMER" });

  const state = useGameStore.getState();
  assert.equal(state.timer.remainingMs, 30000);
  assert.equal(state.timer.running, true);
  assert.equal(state.timer.pauseReason, null);
  assert.equal(state.votesLocked, false);
});
