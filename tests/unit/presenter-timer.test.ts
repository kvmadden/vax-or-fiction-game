import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../../src/store/game-store";
import { projectGameState } from "../../src/network/game-projection";
import type { SlideEntry } from "../../src/data/types";

// ==============================================================================
// PRES-04: the phantom 30-second timer. Locking a question must never arm the
// clock, and the clock the presenter opts into must be the deck's own seconds.
// ==============================================================================

const questions = [
  { id: "t-one", type: "question", kind: "binary", statement: "First.", answer: true },
  { id: "t-two", type: "question", kind: "binary", statement: "Second.", answer: false },
] as unknown as SlideEntry[];

function openQuestionState() {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    sessionId: "timer-run",
    run: questions,
    slideIndex: 0,
    phase: "entering" as any,
    interactionMode: "polling",
    offlineMode: false,
    votesLocked: false,
    pollVotes: {},
    pollVoters: {},
    seenDevices: {},
    settledQuestionInstances: {},
    settledResults: {},
    timer: { durationMs: 20_000, remainingMs: 20_000, running: false, enabled: false, visible: false, pauseReason: "disabled", generation: 0, endsAt: null },
  } as any);
}

test("PRES-04: lock → next question keeps a timer the presenter never switched on OFF", () => {
  openQuestionState();
  const { dispatch } = useGameStore.getState();

  // The question shell's lock sequence: LOCK_VOTES then a SET_TIMER that only stops the clock.
  dispatch({ type: "LOCK_VOTES" });
  dispatch({ type: "SET_TIMER", running: false, pauseReason: "timedOut" });
  let state = useGameStore.getState();
  assert.equal(state.votesLocked, true);
  assert.equal(state.timer.enabled, false, "locking must not arm the clock");
  assert.equal(state.timer.visible, false, "locking must not show the clock");

  dispatch({ type: "REVEAL" });
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "explaining");
  assert.equal(useGameStore.getState().timer.running, false);
  dispatch({ type: "ADVANCE" });
  state = useGameStore.getState();
  assert.equal(state.slideIndex, 1, "advance reached the next question");
  assert.equal(state.phase, "entering");
  assert.equal(state.timer.enabled, false, "the next question must not start a phantom countdown");
  assert.equal(state.timer.running, false);

  // The shell's deliberating dispatch mirrors the (still disabled) timer; nothing should start.
  dispatch({ type: "SET_TIMER", durationMs: state.timer.durationMs, remainingMs: state.timer.durationMs, running: state.timer.enabled, enabled: state.timer.enabled, visible: state.timer.visible });
  state = useGameStore.getState();
  assert.equal(state.timer.running, false);
  const projected = projectGameState(state, "TIMER", 1).roomState;
  assert.equal(projected.timerSeconds, 0, "phones must not see a countdown the stage never drew");
  assert.equal(projected.timerRunning, false);
});

test("PRES-04: SET_TIMER without enabled/visible leaves both flags as they were", () => {
  openQuestionState();
  useGameStore.getState().dispatch({ type: "SET_TIMER", running: false });
  assert.equal(useGameStore.getState().timer.enabled, false);
  assert.equal(useGameStore.getState().timer.visible, false);

  useGameStore.setState({ timer: { ...useGameStore.getState().timer, enabled: true, visible: true } });
  useGameStore.getState().dispatch({ type: "SET_TIMER", running: false });
  assert.equal(useGameStore.getState().timer.enabled, true, "an enabled timer stays enabled");
  assert.equal(useGameStore.getState().timer.visible, true, "a visible timer stays visible");
});

test("PRES-04: the deck mode's timerSeconds is the clock, not a hard-coded 30", () => {
  useGameStore.setState({ ...useGameStore.getInitialState() } as any);
  const initial = useGameStore.getState();
  // The show deck's default pace authors 20 s; the initial clock already carries it.
  assert.equal(initial.timer.durationMs, 20_000, `initial clock honours the deck (got ${initial.timer.durationMs})`);

  useGameStore.getState().dispatch({ type: "SELECT_MODE", modeId: "lightning" });
  assert.equal(useGameStore.getState().timer.durationMs, 15_000, "lightning authors 15 s");
  assert.equal(useGameStore.getState().timer.remainingMs, 15_000);

  useGameStore.getState().dispatch({ type: "SELECT_MODE", modeId: "demo" });
  assert.equal(useGameStore.getState().timer.durationMs, 20_000, "the Quick demo authors 20 s");

  // Entering the first question re-arms to the authored seconds, never 30.
  useGameStore.setState({ phase: "lobby" as any, slideIndex: -1 } as any);
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  const first = useGameStore.getState();
  assert.equal(first.phase, "entering");
  assert.equal(first.timer.durationMs, 20_000);
  assert.equal(first.timer.remainingMs, 20_000);
  assert.equal(first.timer.enabled, true, "SELECT_MODE keeps the Curated 15 timer opt-in");
});

test("PRES-04: a lock stops a running clock without disabling the presenter's opt-in", () => {
  openQuestionState();
  useGameStore.setState({ timer: { ...useGameStore.getState().timer, enabled: true, visible: true, running: true, endsAt: Date.now() + 20_000, pauseReason: null } } as any);
  useGameStore.getState().dispatch({ type: "LOCK_VOTES" });
  const state = useGameStore.getState();
  assert.equal(state.votesLocked, true);
  assert.equal(state.timer.running, false, "lock stops the countdown");
  assert.equal(state.timer.endsAt, null);
  assert.equal(state.timer.enabled, true, "an opted-in timer stays opted in for the next question");
});
