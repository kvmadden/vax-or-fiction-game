import test from "node:test";
import assert from "node:assert/strict";
import { UNREVEALED_PHASES, advance, back } from "../../src/engine/state-machine";
import { staticSlideLabel, isTerminalSlide } from "../../src/engine/kinds";
import { getQuestionInstanceId, useGameStore } from "../../src/store/game-store";
import { NAVIGATION_DEBOUNCE_MS, mapKeyboardEvent, shouldThrottleNavigation } from "../../src/facilitator/keyboard-actions";
import type { GameState, SlideEntry } from "../../src/data/types";

// ==============================================================================
// Task 1.2 / STATE-03 & JUDGE-F01 Verification
// ==============================================================================

const mockQuestionSlide: SlideEntry = {
  id: "q-test-1",
  type: "question",
  kind: "binary",
  prompt: "Influenza vaccination causes the flu.",
  answer: false,
  explanation: "Inactivated vaccines cannot cause infection.",
  citation: {
    id: "cdc-flu-facts",
    publisher: "CDC",
    shortDisplayLine: "CDC Flu Vaccine Safety 2026",
  },
} as unknown as SlideEntry;

const mockQuestionSlide2: SlideEntry = {
  id: "q-test-2",
  type: "question",
  kind: "binary",
  prompt: "mRNA vaccines alter human DNA.",
  answer: false,
  explanation: "mRNA does not enter the cell nucleus.",
  citation: {
    id: "cdc-mrna-facts",
    publisher: "CDC",
    shortDisplayLine: "CDC mRNA Safety 2026",
  },
} as unknown as SlideEntry;

test("STATE-03 / JUDGE-F01: UNREVEALED_PHASES contains 'locked'", () => {
  assert.equal(
    UNREVEALED_PHASES.has("locked" as any),
    true,
    "UNREVEALED_PHASES must include 'locked' so advancing while locked reveals the answer"
  );
});

test("STATE-03 / JUDGE-F01: advance() during 'locked' phase transitions to 'revealed' and preserves slideIndex", () => {
  const state: Partial<GameState> = {
    phase: "locked" as any,
    slideIndex: 1,
    run: [mockQuestionSlide, mockQuestionSlide2],
  };

  const next = advance(state as GameState);
  assert.ok(next, "advance() should return next state transition");
  assert.equal(
    next.phase,
    "revealed",
    "Advancing during 'locked' phase must transition phase to 'revealed'"
  );
  assert.equal(
    next.slideIndex,
    undefined,
    "Advancing during 'locked' phase must NOT modify slideIndex"
  );
});

test("STATE-03: useGameStore dispatch('ADVANCE') during 'locked' transitions to 'revealed' and preserves slideIndex", () => {
  useGameStore.setState({
    phase: "locked" as any,
    slideIndex: 0,
    run: [mockQuestionSlide, mockQuestionSlide2],
    pollVotes: {},
    pollVoters: {},
  });

  useGameStore.getState().dispatch({ type: "ADVANCE" });

  const stateAfter = useGameStore.getState();
  assert.equal(
    stateAfter.phase,
    "revealed",
    "Store phase after ADVANCE from 'locked' must be 'revealed'"
  );
  assert.equal(
    stateAfter.slideIndex,
    0,
    "Store slideIndex after ADVANCE from 'locked' must remain unchanged at 0"
  );

  // The explanation gets its own shared beat before moving on.
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "explaining");
  assert.equal(useGameStore.getState().slideIndex, 0);
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  const stateAfterSecondAdvance = useGameStore.getState();
  assert.equal(
    stateAfterSecondAdvance.phase,
    "entering",
    "Store phase after explanation must be 'entering'"
  );
  assert.equal(
    stateAfterSecondAdvance.slideIndex,
    1,
    "Store slideIndex after explanation must advance to 1"
  );
});

test("STATE-03 / Clicker Debounce: shouldThrottleNavigation suppresses rapid clicks within 300ms", () => {
  assert.equal(NAVIGATION_DEBOUNCE_MS, 300, "Debounce threshold should be exactly 300ms");

  const t0 = 1000;
  // First click at t0: no prior dispatch (last=0), should NOT throttle
  assert.equal(shouldThrottleNavigation(0, t0), false, "Initial click must not be throttled");

  // Hardware bounce at t0 + 50ms: within 300ms window, MUST throttle
  assert.equal(shouldThrottleNavigation(t0, t0 + 50), true, "Click at +50ms must be throttled");

  // Hardware bounce at t0 + 299ms: within 300ms window, MUST throttle
  assert.equal(shouldThrottleNavigation(t0, t0 + 299), true, "Click at +299ms must be throttled");

  // Legitimate next click at t0 + 300ms: at window boundary, should NOT throttle
  assert.equal(shouldThrottleNavigation(t0, t0 + 300), false, "Click at +300ms must not be throttled");

  // Next click at t0 + 500ms: well past window, should NOT throttle
  assert.equal(shouldThrottleNavigation(t0, t0 + 500), false, "Click at +500ms must not be throttled");
});

test("Setup keys (2026-09-16): S maps to nothing on setup and the 1 2 3 setup picks are retired", () => {
  for (const phase of ["deckPicker", "formatPicker", "modePicker", "preFlight"]) {
    for (const key of ["s", "S", "1", "2", "3"]) {
      assert.equal(mapKeyboardEvent({ key }, { phase, modeId: "full" }), null, `${key} must do nothing on ${phase}`);
    }
  }
  // Off setup, S still skips the question on stage, and the digits were never mapped there.
  assert.deepEqual(mapKeyboardEvent({ key: "s" }, { phase: "entering", modeId: "full" }), { type: "SKIP" });
  for (const key of ["1", "2", "3"]) {
    assert.equal(mapKeyboardEvent({ key }, { phase: "entering", modeId: "full" }), null, `${key} must do nothing on a question`);
  }
});

test("Setup keys (VOF-47): T and Shift+R do nothing on setup, and still work off setup", () => {
  for (const phase of ["deckPicker", "formatPicker", "modePicker", "preFlight"]) {
    assert.equal(mapKeyboardEvent({ key: "t" }, { phase, modeId: "full" }), null, `t must do nothing on ${phase}`);
    assert.equal(mapKeyboardEvent({ key: "T" }, { phase, modeId: "full" }), null, `T must do nothing on ${phase}`);
    assert.equal(
      mapKeyboardEvent({ key: "R", shiftKey: true }, { phase, modeId: "full" }),
      null,
      `Shift+R must do nothing on ${phase}`,
    );
  }
  assert.deepEqual(
    mapKeyboardEvent({ key: "t" }, { phase: "entering", modeId: "full" }),
    { type: "TOGGLE_TIMER" },
  );
  assert.deepEqual(
    mapKeyboardEvent({ key: "R", shiftKey: true }, { phase: "entering", modeId: "full" }),
    { type: "REQUEST_RESTART_RUN" },
  );
});

test("BACK off a leftover question phase onto a static slide drops deliberating", () => {
  const title = { id: "title", type: "title", title: "Vax or Fiction" } as SlideEntry;
  const focus = { id: "focus-1", type: "focus", title: "Next block" } as SlideEntry;
  const fork = { id: "fork", type: "fork" } as SlideEntry;
  const showdown = { id: "showdown", type: "showdown" } as SlideEntry;
  const closing = { id: "closing", type: "closing", title: "Close" } as SlideEntry;
  const question = mockQuestionSlide;

  assert.deepEqual(
    back({
      phase: "deliberating",
      slideIndex: 1,
      run: [title, question],
    } as GameState),
    { slideIndex: 0, phase: "entering", direction: "backward" },
    "title must not keep a leftover vote phase",
  );
  assert.deepEqual(
    back({
      phase: "deliberating",
      slideIndex: 1,
      run: [focus, question],
    } as GameState),
    { slideIndex: 0, phase: "entering", direction: "backward" },
  );
  assert.deepEqual(
    back({
      phase: "timedOut",
      slideIndex: 1,
      run: [fork, question],
    } as GameState),
    { slideIndex: 0, phase: "fork", direction: "backward" },
  );
  assert.deepEqual(
    back({
      phase: "locked",
      slideIndex: 1,
      run: [showdown, question],
    } as GameState),
    { slideIndex: 0, phase: "showdown", direction: "backward" },
  );
  assert.deepEqual(
    back({
      phase: "revealed",
      slideIndex: 1,
      run: [closing, question],
    } as GameState),
    { slideIndex: 0, phase: "closing", direction: "backward" },
  );
  assert.deepEqual(
    back({
      phase: "deliberating",
      slideIndex: 1,
      run: [question, { ...question, id: "q-2" }],
    } as GameState),
    { slideIndex: 0, phase: "deliberating", direction: "backward" },
    "a prior question keeps the leftover vote phase for rearm to settle",
  );
  for (const phase of ["closing", "showdown"] as const) {
    assert.deepEqual(
      back({ phase, slideIndex: 1, run: [question, { ...question, id: "q-2" }] } as GameState),
      { slideIndex: 0, phase: "entering", direction: "backward" },
    );
  }
  assert.deepEqual(
    back({ phase: "leaderboard", slideIndex: 1, run: [question, { ...question, id: "q-2" }] } as GameState),
    { phase: "entering", direction: "backward" },
  );
});

test("BACK on a revealed first slide returns the lobby transition now that reveals are one-way (BACK-ONE-WAY, was QA-FUNC-01)", () => {
  // The 2026-09-25 design call is that reveals stay one-way. back() no longer special-cases a revealed
  // slide at all, so it always falls through to the ordinary lobby transition here.
  assert.deepEqual(
    back({ phase: "revealed", slideIndex: 0, run: [mockQuestionSlide, mockQuestionSlide2] } as unknown as GameState),
    { phase: "lobby", direction: "backward" },
  );
  // A pre-2026-09-25 in-memory shape (or old persisted state) carrying the retired snapshot field
  // must not resurrect the un-reveal branch: back() ignores it and still goes to the lobby.
  const timer = { durationMs: 20_000, remainingMs: 12_000, running: true, enabled: true, visible: true, pauseReason: null, generation: 3 };
  assert.deepEqual(
    back({
      phase: "revealed",
      slideIndex: 0,
      run: [mockQuestionSlide, mockQuestionSlide2],
      preRevealSnapshot: { phase: "deliberating", timer, voting: {} },
    } as unknown as GameState),
    { phase: "lobby", direction: "backward" },
  );
  assert.deepEqual(
    back({ phase: "deliberating", slideIndex: 0, run: [mockQuestionSlide] } as unknown as GameState),
    { phase: "lobby", direction: "backward" },
    "an unrevealed first slide still goes back to the lobby",
  );
  assert.equal(
    back({ phase: "revealed", slideIndex: -1, run: [mockQuestionSlide] } as unknown as GameState),
    null,
    "a negative slide index still moves nowhere",
  );
});

test("through the real store, BACK on a revealed question re-arms it back to revealed instead of leaving it (BACK-ONE-WAY)", () => {
  useGameStore.setState({
    sessionId: "back-one-way", run: [mockQuestionSlide, mockQuestionSlide2], slideIndex: 0,
    phase: "revealed", votesLocked: true,
  });
  const occurrence = getQuestionInstanceId(useGameStore.getState())!;
  useGameStore.setState({ settledQuestionInstances: { [occurrence]: true }, settledResults: { [occurrence]: {} } });

  useGameStore.getState().dispatch({ type: "BACK" });

  assert.equal(useGameStore.getState().phase, "revealed", "BACK on a settled, revealed question must not un-reveal it");
  assert.equal(useGameStore.getState().slideIndex, 0);
});

// TW3: the test above cannot discriminate old code from new. the original commit message
// (8e8c4a0) says why: the store's BACK handler always re-arms a SETTLED question back to
// revealed regardless of what back() returned, so a settled question passes either way. This
// test removes that masking (no settled marks) and plants a real legacy preRevealSnapshot, the
// exact shape the retired branch read. Old code: back() returns { phase:
// preRevealSnapshot.phase, ... } with no slideIndex, so the store's rearm guard never fires
// (unsettled) and that phase ("deliberating") passes straight through. New code: back() always
// returns the lobby transition once reveals are one-way, so phase lands on "lobby" instead.
test("through the real store, an unsettled revealed question with a legacy preRevealSnapshot still goes to the lobby (BACK-ONE-WAY, TW3)", () => {
  const timer = { durationMs: 20_000, remainingMs: 12_000, running: true, enabled: true, visible: true, pauseReason: null, generation: 3 };
  useGameStore.setState({
    sessionId: "back-one-way-legacy-snapshot", run: [mockQuestionSlide, mockQuestionSlide2], slideIndex: 0,
    phase: "revealed", votesLocked: true,
    settledQuestionInstances: {}, settledResults: {},
    preRevealSnapshot: { phase: "deliberating", timer, voting: {} },
  } as unknown as Partial<GameState>);
  const occurrence = getQuestionInstanceId(useGameStore.getState());
  assert.equal(useGameStore.getState().settledQuestionInstances[occurrence!], undefined, "this question must not be settled, or rearmQuestion would mask the branch this test targets");

  useGameStore.getState().dispatch({ type: "BACK" });

  assert.equal(useGameStore.getState().phase, "lobby", "an unsettled revealed question must fall through to the ordinary lobby transition, not resurrect the retired preRevealSnapshot un-reveal branch");
});

test("static slides name themselves for the HUD chip instead of leftover Posed", () => {
  assert.equal(staticSlideLabel({ id: "title", type: "title" }), "Title");
  assert.equal(staticSlideLabel({ id: "instructions", type: "instructions" }), "Instructions");
  assert.equal(staticSlideLabel({ id: "closing", type: "closing" }), "Closing");
  assert.equal(staticSlideLabel({ id: "showdown", type: "showdown" }), "Showdown");
  assert.equal(staticSlideLabel({ id: "q1", type: "question", kind: "binary", answer: true }), null);
  assert.equal(staticSlideLabel(null), null);
  assert.equal(isTerminalSlide({ id: "closing", type: "closing" }), true);
  assert.equal(isTerminalSlide({ id: "showdown", type: "showdown" }), true);
  assert.equal(isTerminalSlide({ id: "title", type: "title" }), false);
});
