import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../../src/store/game-store";
import { mapKeyboardEvent, ADVANCE, REVEAL, LOCK_VOTES } from "../../src/facilitator/keyboard-actions";
import type { SlideEntry } from "../../src/data/types";

// ==============================================================================
// PRES-02: Space / → step open → locked → revealed → next. Enter stays a direct
// reveal. L locks now.
// ==============================================================================

const questions = [
  { id: "s-one", type: "question", kind: "binary", statement: "First.", answer: true },
  { id: "s-two", type: "question", kind: "binary", statement: "Second.", answer: false },
] as unknown as SlideEntry[];

function liveQuestionState(overrides: Record<string, unknown> = {}) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    sessionId: "two-step-run",
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
    ...overrides,
  } as any);
}

const div = { tagName: "div" };
const phase = () => ({ phase: useGameStore.getState().phase, votesLocked: Boolean(useGameStore.getState().votesLocked), slideIndex: useGameStore.getState().slideIndex });

test("PRES-02: Space and → map to ADVANCE, Enter to REVEAL, L to LOCK_VOTES", () => {
  assert.deepEqual(mapKeyboardEvent({ key: " ", target: div }, {}), { type: ADVANCE });
  assert.deepEqual(mapKeyboardEvent({ key: "ArrowRight", target: div }, {}), { type: ADVANCE });
  assert.deepEqual(mapKeyboardEvent({ key: "Enter", target: div }, {}), { type: REVEAL });
  assert.deepEqual(mapKeyboardEvent({ key: "l", target: div }, {}), { type: LOCK_VOTES });
  assert.deepEqual(mapKeyboardEvent({ key: "L", target: div }, {}), { type: LOCK_VOTES });
  assert.equal(mapKeyboardEvent({ key: "l", target: div }, { help: { open: true } }), null, "help sheet swallows L");
  assert.equal(mapKeyboardEvent({ key: "l", target: { tagName: "input" } }, {}), null, "typing in a field never locks");
});

test("PRES-02: ADVANCE locks, reveals, explains, then moves on", () => {
  liveQuestionState();
  const { dispatch } = useGameStore.getState();

  dispatch({ type: "ADVANCE" });
  assert.deepEqual(phase(), { phase: "entering", votesLocked: true, slideIndex: 0 }, "one press locks without revealing");

  dispatch({ type: "ADVANCE" });
  assert.deepEqual(phase(), { phase: "revealed", votesLocked: true, slideIndex: 0 }, "second press reveals the same question");

  dispatch({ type: "ADVANCE" });
  assert.deepEqual(phase(), { phase: "explaining", votesLocked: true, slideIndex: 0 }, "third press gives the explanation its own screen");
  dispatch({ type: "ADVANCE" });
  assert.deepEqual(phase(), { phase: "entering", votesLocked: false, slideIndex: 1 }, "fourth press moves to the next question with votes open");
});

test("PRES-02: Enter stays a direct reveal on an open question", () => {
  liveQuestionState();
  useGameStore.getState().dispatch({ type: "REVEAL" });
  assert.deepEqual(phase(), { phase: "revealed", votesLocked: true, slideIndex: 0 });
});

test("PRES-02: L locks now; a second L is a no-op; ADVANCE then reveals", () => {
  liveQuestionState();
  const { dispatch } = useGameStore.getState();
  dispatch({ type: "LOCK_VOTES" });
  assert.deepEqual(phase(), { phase: "entering", votesLocked: true, slideIndex: 0 });
  dispatch({ type: "LOCK_VOTES" });
  assert.deepEqual(phase(), { phase: "entering", votesLocked: true, slideIndex: 0 }, "locking twice changes nothing");
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "revealed");
});

test("PRES-02: L off a question does not pre-lock the first question", () => {
  liveQuestionState({ phase: "lobby", slideIndex: -1 });
  useGameStore.getState().dispatch({ type: "LOCK_VOTES" });
  assert.equal(Boolean(useGameStore.getState().votesLocked), false, "no question, nothing to lock");
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  assert.deepEqual(phase(), { phase: "entering", votesLocked: false, slideIndex: 0 });
});

test("PRES-02: offline (hands-up) play keeps the single-step reveal", () => {
  liveQuestionState({ offlineMode: true, interactionMode: "facilitator" });
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "revealed", "no phones, no lock beat");
});

test("PRES-02: a timed-out question (votes already locked) reveals on the next ADVANCE", () => {
  liveQuestionState({ votesLocked: true });
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "revealed");
});
