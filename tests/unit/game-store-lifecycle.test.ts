import test from "node:test";
import assert from "node:assert/strict";
import { getQuestionInstanceId, useGameStore } from "../../src/store/game-store";
import { advance } from "../../src/engine/state-machine";

const timer = {
  durationMs: 30_000,
  remainingMs: 30_000,
  running: true,
  enabled: true,
  visible: true,
  pauseReason: null,
  generation: 0,
  endsAt: 1_030_000,
};

const firstQuestion = {
  id: "q-one",
  type: "question",
  kind: "binary",
  prompt: "The first statement is true.",
  answer: true,
  explainer: "",
};

const secondQuestion = {
  id: "q-two",
  type: "question",
  kind: "binary",
  prompt: "The second statement is false.",
  answer: false,
  explainer: "",
};

function prepareQuestionState() {
  useGameStore.setState({
    sessionId: "run-001",
    run: [firstQuestion, secondQuestion] as any,
    slideIndex: 0,
    phase: "locked" as any,
    timer: { ...timer } as any,
    votesLocked: true,
    pollVotes: { "q-one": { true: 1, false: 1 } },
    pollVoters: {
      "q-one": {
        "device-right": { choice: "true", conviction: "certain" },
        "device-wrong": { choice: "false", conviction: "certain" },
      },
    },
    seenDevices: {
      "device-right": { nickname: "Right", team: "NAVY", joinedAt: 1, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
      "device-wrong": { nickname: "Wrong", team: "GOLD", joinedAt: 2, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
    },
    settledQuestionInstances: {},
    settledResults: {},
    roomStats: { questions: {}, accuracy: 0, streak: 0, bestStreak: 0, mythsBusted: 0, swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal: 0 },
    doubles: {},
  } as any);
}

test("lifecycle: ADVANCE from a locked question settles final votes before revealing", () => {
  prepareQuestionState();

  useGameStore.getState().dispatch({ type: "ADVANCE" });

  const state = useGameStore.getState() as any;
  const occurrence = "run-001:0:q-one";
  assert.equal(state.phase, "revealed");
  assert.equal(state.votesLocked, true);
  assert.equal(state.timer.running, false);
  assert.equal(state.timer.endsAt, null);
  assert.equal(state.settledQuestionInstances[occurrence], true);
  assert.deepEqual(state.settledResults[occurrence]["device-right"], { choice: "true", conviction: "certain", isRight: true, score: 100, streakBonus: 0, realityGapDelta: 0 });
  assert.deepEqual(state.settledResults[occurrence]["device-wrong"], { choice: "false", conviction: "certain", isRight: false, score: 0, streakBonus: 0, realityGapDelta: 0 });
  assert.equal(state.seenDevices["device-right"].score, 100);
  assert.equal(state.seenDevices["device-wrong"].score, 0);
  assert.equal(state.roomStats.votesTotal, 2);
  assert.equal(state.roomStats.certainWrongTotal, 0);
});

test("lifecycle: repeated REVEAL cannot score a settled occurrence twice", () => {
  prepareQuestionState();
  const dispatch = useGameStore.getState().dispatch;

  dispatch({ type: "REVEAL" });
  const once = useGameStore.getState() as any;
  const firstScore = once.seenDevices["device-right"].score;
  const firstVotesTotal = once.roomStats.votesTotal;

  dispatch({ type: "REVEAL" });
  const twice = useGameStore.getState() as any;
  assert.equal(twice.seenDevices["device-right"].score, firstScore);
  assert.equal(twice.roomStats.votesTotal, firstVotesTotal);
});

test("lifecycle: a revealed or stale question vote cannot overwrite the accepted ballot", () => {
  prepareQuestionState();
  useGameStore.setState({ phase: "revealed" as any, votesLocked: false });

  useGameStore.getState().dispatch({ type: "VOTE", deviceId: "device-right", questionId: "q-one", choice: "false", conviction: "hunch" });
  useGameStore.getState().dispatch({ type: "VOTE", deviceId: "device-right", questionId: "q-two", choice: "false", conviction: "hunch" });

  const state = useGameStore.getState();
  assert.equal((state.pollVoters as any)["q-one"]["device-right"].choice, "true");
  assert.equal((state.pollVoters as any)["q-two"], undefined);
});

test("lifecycle: timer controls cannot reopen a settled question", () => {
  prepareQuestionState();
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "REVEAL" });

  dispatch({ type: "ADD_TIME", seconds: 15 });
  assert.equal(useGameStore.getState().votesLocked, true);
  dispatch({ type: "RESTART_TIMER" });
  assert.equal(useGameStore.getState().votesLocked, true);
});

test("lifecycle: repeated HELLO updates the profile without erasing settled results", () => {
  prepareQuestionState();
  useGameStore.setState({
    seenDevices: {
      "device-right": { nickname: "Right", team: "NAVY", joinedAt: 1, score: 7, answered: 3, correct: 2, streak: 2, bestStreak: 2, realityGap: 1, hardQuestionPoints: 0 },
    },
  } as any);

  useGameStore.getState().dispatch({ type: "HELLO", deviceId: "device-right", nickname: "Renamed", team: "GOLD" });

  const device = (useGameStore.getState().seenDevices as any)["device-right"];
  assert.deepEqual(device, { nickname: "Renamed", rawNickname: "Renamed", team: "GOLD", joinedAt: 1, score: 7, answered: 3, correct: 2, streak: 2, bestStreak: 2, realityGap: 1, hardQuestionPoints: 0 });
});

test("lifecycle: a confirmed restart creates a new occurrence namespace and removes old settlement", () => {
  prepareQuestionState();
  const before = useGameStore.getState() as any;
  assert.equal(getQuestionInstanceId(before), "run-001:0:q-one");
  useGameStore.setState({ restartRunConfirmationOpen: true, settledQuestionInstances: { "run-001:0:q-one": true }, settledResults: { "run-001:0:q-one": {} } } as any);

  useGameStore.getState().dispatch({ type: "CONFIRM_RESTART_RUN" });

  const after = useGameStore.getState() as any;
  assert.notEqual(after.sessionId, "run-001");
  assert.equal(getQuestionInstanceId(after), `${after.sessionId}:0:q-one`);
  assert.deepEqual(after.settledQuestionInstances, {});
  assert.deepEqual(after.settledResults, {});
});

test("lifecycle: a confirmed restart preserves connected identities while zeroing run results and Showdown", () => {
  prepareQuestionState();
  useGameStore.setState({
    restartRunConfirmationOpen: true,
    showdown: {
      id: "run-001:showdown", stage: "result", finalists: [{ ticket: "F-1", name: "Right", score: 7, duelPoints: 2 }],
      predictions: {}, predictionCounts: { "F-1": 0 }, questionIds: ["q-one"], questionIndex: 0, winner: "F-1", tie: false, isRecap: true,
    },
    seenDevices: {
      "device-right": { nickname: "Right", team: "NAVY", joinedAt: 1, score: 7, answered: 3, correct: 2, streak: 2, bestStreak: 2, realityGap: 1, hardQuestionPoints: 0 },
      "device-wrong": { nickname: "Wrong", team: "GOLD", joinedAt: 2, score: -1, answered: 3, correct: 1, streak: 0, bestStreak: 1, realityGap: 2, hardQuestionPoints: 0 },
    },
  } as any);

  useGameStore.getState().dispatch({ type: "CONFIRM_RESTART_RUN" });

  assert.deepEqual(useGameStore.getState().seenDevices, {
    "device-right": { nickname: "Right", team: "NAVY", joinedAt: 1, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
    "device-wrong": { nickname: "Wrong", team: "GOLD", joinedAt: 2, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
  });
  assert.equal(useGameStore.getState().showdown, null);
});

test("lifecycle: persisted participant and ballot maps discard malformed nested entries", () => {
  const merge = useGameStore.persist.getOptions().merge!;
  const current = useGameStore.getState();
  const restored = merge({
    seenDevices: {
      good: { nickname: "Good", team: "NAVY", joinedAt: 1, score: 4, answered: 2, correct: 1, streak: 0, bestStreak: 1, realityGap: 0, hardQuestionPoints: 0 },
      corrupt: "not-a-device",
      badTeam: { nickname: "Bad", team: 17, joinedAt: 1, score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, realityGap: 0, hardQuestionPoints: 0 },
    },
    pollVoters: {
      "q-one": {
        good: { choice: "true", conviction: "certain", team: "NAVY" },
        corrupt: "not-a-vote",
      },
      broken: "not-a-device-map",
    },
  }, current) as any;

  assert.deepEqual(restored.seenDevices, {
    good: { nickname: "Good", rawNickname: "Good", team: "NAVY", joinedAt: 1, score: 4, answered: 2, correct: 1, streak: 0, bestStreak: 1, realityGap: 0, hardQuestionPoints: 0 },
  });
  assert.deepEqual(restored.pollVoters, {
    "q-one": { good: { choice: "true", conviction: "certain", team: "NAVY" } },
  });
});

test("lifecycle: RESET creates a fresh run identity and clears all settlement state", () => {
  prepareQuestionState();
  useGameStore.setState({ settledQuestionInstances: { "run-001:0:q-one": true }, settledResults: { "run-001:0:q-one": {} } } as any);

  useGameStore.getState().dispatch({ type: "RESET" });

  const state = useGameStore.getState() as any;
  assert.notEqual(state.sessionId, "run-001");
  assert.deepEqual(state.settledQuestionInstances, {});
  assert.deepEqual(state.settledResults, {});
});

test("lifecycle: advancing after the final explanation reaches Closing instead of an out-of-range slide", () => {
  const transition = advance({ phase: "explaining", run: [firstQuestion], slideIndex: 0 } as any);
  assert.deepEqual(transition, { phase: "closing", direction: "forward" });
});

test("lifecycle: advancing to a new question reopens votes and rearms only an enabled timer", () => {
  prepareQuestionState();
  useGameStore.setState({
    phase: "explaining" as any,
    votesLocked: true,
    timer: { ...timer, remainingMs: 0, running: false, endsAt: null, pauseReason: "timedOut" },
    settledQuestionInstances: { "run-001:0:q-one": true },
  } as any);

  useGameStore.getState().dispatch({ type: "ADVANCE" });

  const enabled = useGameStore.getState() as any;
  assert.equal(enabled.phase, "entering");
  assert.equal(enabled.slideIndex, 1);
  assert.equal(enabled.votesLocked, false);
  assert.equal(enabled.timer.enabled, true);
  assert.equal(enabled.timer.visible, true);
  assert.equal(enabled.timer.remainingMs, 30_000);
  assert.equal(enabled.timer.running, false);
  assert.equal(enabled.settledQuestionInstances["run-001:0:q-one"], true);

  useGameStore.setState({
    phase: "explaining" as any,
    slideIndex: 0,
    votesLocked: true,
    timer: { ...timer, enabled: false, visible: false, remainingMs: 0, running: false, endsAt: null, pauseReason: "disabled" },
  } as any);
  useGameStore.getState().dispatch({ type: "ADVANCE" });

  const disabled = useGameStore.getState() as any;
  assert.equal(disabled.votesLocked, false);
  assert.equal(disabled.timer.enabled, false);
  assert.equal(disabled.timer.visible, false);
  assert.equal(disabled.timer.running, false);
});

test("lifecycle: BACK onto a title card drops leftover deliberating", () => {
  useGameStore.setState({
    sessionId: "run-001",
    phase: "deliberating" as any,
    slideIndex: 1,
    votesLocked: true,
    run: [
      { id: "title", type: "title", title: "Vax or Fiction" },
      firstQuestion,
    ] as any,
    timer: { ...timer, remainingMs: 8_000, running: true },
    settledQuestionInstances: {},
  } as any);

  useGameStore.getState().dispatch({ type: "BACK" });

  const state = useGameStore.getState();
  assert.equal(state.slideIndex, 0);
  assert.equal(state.phase, "entering");
  assert.equal(state.votesLocked, false);
  assert.equal(state.timer.running, false);
});

test("lifecycle: backing into a settled question keeps its votes locked", () => {
  prepareQuestionState();
  useGameStore.setState({
    phase: "timedOut" as any,
    slideIndex: 1,
    votesLocked: true,
    settledQuestionInstances: { "run-001:0:q-one": true },
  } as any);

  useGameStore.getState().dispatch({ type: "BACK" });

  const state = useGameStore.getState();
  assert.equal(state.slideIndex, 0);
  assert.equal(state.phase, "revealed");
  assert.equal(state.votesLocked, true);
  assert.equal(state.timer.running, false);
});

test("lifecycle: Back after skipping the final question returns to the prior question", () => {
  prepareQuestionState();
  useGameStore.setState({
    phase: "entering" as any,
    slideIndex: 1,
    showdownEnabled: false,
    session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [{ questionId: "q-one" }, { questionId: "q-two" }], participants: 0, droppedMessages: 0 },
  } as any);

  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().phase, "closing");

  useGameStore.getState().dispatch({ type: "BACK" });

  const state = useGameStore.getState();
  assert.equal(state.slideIndex, 0);
  assert.equal(state.phase, "entering");
});

test("lifecycle: Back after closing a round can return to a skipped question", () => {
  prepareQuestionState();
  useGameStore.setState({
    phase: "entering" as any,
    slideIndex: 0,
    showdownEnabled: false,
    session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [{ questionId: "q-one" }, { questionId: "q-two" }], participants: 0, droppedMessages: 0 },
  } as any);

  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().slideIndex, 1);
  assert.equal((useGameStore.getState().session as any).questions[0].skipped, true);
  useGameStore.getState().dispatch({ type: "CLOSE_OUT" });

  useGameStore.getState().dispatch({ type: "BACK" });

  const state = useGameStore.getState();
  assert.equal(state.slideIndex, 0);
  assert.equal(state.phase, "entering");
});

test("lifecycle: Back moves through Showdown stages before returning to the prior question", () => {
  prepareQuestionState();
  useGameStore.setState({
    phase: "showdown" as any,
    slideIndex: 1,
    showdown: { stage: "result", finalists: [{ ticket: "F-1" }, { ticket: "F-2" }] } as any,
  } as any);

  useGameStore.getState().dispatch({ type: "BACK" });
  assert.equal(useGameStore.getState().showdown?.stage, "duel");

  useGameStore.getState().dispatch({ type: "BACK" });
  assert.equal(useGameStore.getState().showdown?.stage, "lineup");

  useGameStore.getState().dispatch({ type: "BACK" });

  const state = useGameStore.getState();
  assert.equal(state.slideIndex, 0);
  assert.equal(state.phase, "entering");
});

test("lifecycle: Back from a single-finalist Showdown result returns to the prior question", () => {
  prepareQuestionState();
  useGameStore.setState({
    phase: "showdown" as any,
    slideIndex: 1,
    showdown: { stage: "result", finalists: [{ ticket: "F-1" }] } as any,
  } as any);

  useGameStore.getState().dispatch({ type: "BACK" });
  assert.equal(useGameStore.getState().showdown?.stage, "lineup");
  assert.equal(useGameStore.getState().slideIndex, 1);

  useGameStore.getState().dispatch({ type: "BACK" });

  const state = useGameStore.getState();
  assert.equal(state.slideIndex, 0);
  assert.equal(state.phase, "entering");
});

test("lifecycle: PARK flags the current question and toggles the parked notice", () => {
  useGameStore.setState({
    phase: "entering" as any,
    run: [firstQuestion, secondQuestion] as any,
    slideIndex: 0,
    parkedNotice: false,
    parkedAt: null,
    session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [], participants: 0, droppedMessages: 0 },
  } as any);

  useGameStore.getState().dispatch({ type: "PARK" });
  const parked = useGameStore.getState() as any;
  assert.equal(parked.parkedNotice, true);
  assert.equal(typeof parked.parkedAt, "number");
  assert.deepEqual(parked.session.questions, [{ questionId: "q-one", parked: true }]);

  useGameStore.getState().dispatch({ type: "PARK" });
  const cleared = useGameStore.getState() as any;
  assert.equal(cleared.parkedNotice, false);
  assert.equal(cleared.parkedAt, null);
  assert.deepEqual(cleared.session.questions, [{ questionId: "q-one", parked: false }]);
});

test("lifecycle: ADD_TIME, SKIP, PARK and LOCK_VOTES do nothing in every setup phase", () => {
  const dispatch = useGameStore.getState().dispatch;
  for (const phase of ["deckPicker", "formatPicker", "modePicker", "preFlight"] as const) {
    useGameStore.setState({
      phase: phase as any,
      run: [firstQuestion, secondQuestion] as any,
      slideIndex: 0,
      votesLocked: false,
      timer: { ...timer, remainingMs: 20_000, running: false, enabled: true, visible: true },
      session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [{ questionId: "q-one" }], participants: 0, droppedMessages: 0 },
    } as any);
    const before = useGameStore.getState();

    dispatch({ type: "ADD_TIME", seconds: 15 });
    assert.equal(useGameStore.getState(), before, `ADD_TIME moved state in ${phase}`);

    dispatch({ type: "SKIP" });
    assert.equal(useGameStore.getState(), before, `SKIP moved state in ${phase}`);

    dispatch({ type: "PARK" });
    assert.equal(useGameStore.getState(), before, `PARK moved state in ${phase}`);

    dispatch({ type: "LOCK_VOTES" });
    assert.equal(useGameStore.getState(), before, `LOCK_VOTES moved state in ${phase}`);
  }
});

test("lifecycle: More options can arm the answer timer on Ready without starting it", () => {
  const dispatch = useGameStore.getState().dispatch;
  for (const phase of ["deckPicker", "formatPicker", "modePicker", "preFlight"] as const) {
    useGameStore.setState({
      phase: phase as any,
      run: [firstQuestion, secondQuestion] as any,
      slideIndex: -1,
      votesLocked: false,
      timer: { ...timer, remainingMs: 20_000, running: false, enabled: false, visible: false, pauseReason: "disabled" },
    } as any);

    dispatch({ type: "TOGGLE_TIMER" });
    const armed = useGameStore.getState();
    assert.equal(armed.timer.enabled, true, `${phase} did not arm`);
    assert.equal(armed.timer.visible, true, `${phase} stayed hidden`);
    assert.equal(armed.timer.running, false, `${phase} started the clock`);
    assert.equal(armed.timer.remainingMs, 20_000, `${phase} resized the clock`);
    assert.equal(armed.phase, phase);

    dispatch({ type: "TOGGLE_TIMER" });
    const disarmed = useGameStore.getState();
    assert.equal(disarmed.timer.enabled, false, `${phase} did not disarm`);
    assert.equal(disarmed.timer.visible, false, `${phase} stayed visible`);
    assert.equal(disarmed.timer.running, false, `${phase} started the clock on disarm`);
  }
});

test("lifecycle: ADVANCE, BACK and REVEAL do nothing in every setup phase", () => {
  const dispatch = useGameStore.getState().dispatch;
  for (const phase of ["deckPicker", "formatPicker", "modePicker", "preFlight"] as const) {
    // A non-empty run guards against ADVANCE falling through to "start the run" just because
    // the run array happens to be assembled already. slideIndex 0 (not -1) matters too: -1
    // would make BACK's unrelated "slideIndex < 0" branch return null on its own, masking a
    // missing setup-phase guard instead of proving one exists.
    useGameStore.setState({ phase: phase as any, run: [firstQuestion, secondQuestion] as any, slideIndex: 0, settledQuestionInstances: {} });
    const before = useGameStore.getState();

    dispatch({ type: "ADVANCE" });
    assert.equal(useGameStore.getState(), before, `ADVANCE moved state in ${phase}`);

    dispatch({ type: "BACK" });
    assert.equal(useGameStore.getState(), before, `BACK moved state in ${phase}`);

    // Enter maps to REVEAL, and with a question at slideIndex 0 a missing guard would settle it for real.
    dispatch({ type: "REVEAL" });
    assert.equal(useGameStore.getState(), before, `REVEAL moved state in ${phase}`);
  }
});

test("lifecycle: BACK from the lobby lands on setup with no step", () => {
  // slideIndex -1 and a clear settlement map match the real lobby (before any slide is entered)
  // and keep this test isolated from whatever an earlier test in this file left behind.
  useGameStore.setState({ phase: "lobby" as any, run: [firstQuestion, secondQuestion] as any, slideIndex: -1, settledQuestionInstances: {} });

  useGameStore.getState().dispatch({ type: "BACK" });

  const state = useGameStore.getState() as any;
  assert.equal(state.phase, "preFlight");
  assert.equal("preFlightStep" in state, false);
});

test("lifecycle: hydrating an old snapshot carrying the retired wizard fields loads it and drops them", () => {
  // The live phase differs from the saved one, so the phase check below proves the snapshot loaded
  // instead of passing on whatever phase an earlier test in this file left behind.
  useGameStore.setState({ phase: "modePicker" as any, run: [firstQuestion, secondQuestion] as any });
  const merge = useGameStore.persist.getOptions().merge!;
  const current = useGameStore.getState();
  const oldSnapshot = {
    phase: "lobby",
    formatId: "widescreen",
    // Fields a browser tab saved before the wizard was retired. Hydration must survive these,
    // not resurrect them, and never write them back onto the live state.
    preFlightStep: 2,
    checklist: { windowNotScreen: true, notificationsOff: true, audioTest: true, roomLinkTest: true, rehearsed: true },
    historyEnabled: true,
  };

  const restored = merge(oldSnapshot, current) as any;

  assert.equal(restored.phase, "lobby");
  assert.equal(restored.formatId, "widescreen");
  assert.equal("preFlightStep" in restored, false);
  assert.equal("checklist" in restored, false);
  assert.equal("historyEnabled" in restored, false);
});

test("lifecycle: hydrating an old snapshot carrying the retired un-reveal fields loads it and drops them (BACK-ONE-WAY)", () => {
  useGameStore.setState({ phase: "modePicker" as any, run: [firstQuestion, secondQuestion] as any });
  const merge = useGameStore.persist.getOptions().merge!;
  const current = useGameStore.getState();
  const oldSnapshot = {
    phase: "lobby",
    // Fields a browser tab saved before reveals became one-way (2026-09-25). Hydration must
    // survive these, not resurrect them, and never write them back onto the live state.
    preRevealSnapshot: { phase: "deliberating", timer: current.timer, voting: {} },
    restoredFromReveal: true,
  };

  const restored = merge(oldSnapshot, current) as any;

  assert.equal(restored.phase, "lobby");
  assert.equal("preRevealSnapshot" in restored, false);
  assert.equal("restoredFromReveal" in restored, false);
});

test("lifecycle: SKIP and PARK do nothing in the lobby or on the end screens", () => {
  const dispatch = useGameStore.getState().dispatch;
  for (const phase of ["lobby", "closing", "outro", "showdown"] as const) {
    useGameStore.setState({
      phase: phase as any,
      run: [firstQuestion, secondQuestion] as any,
      slideIndex: phase === "lobby" ? -1 : 1,
      parkedNotice: false,
      session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [], participants: 0, droppedMessages: 0 },
    } as any);
    const before = useGameStore.getState();
    dispatch({ type: "SKIP" });
    assert.equal(useGameStore.getState(), before, `SKIP moved state in ${phase}`);
    dispatch({ type: "PARK" });
    assert.equal(useGameStore.getState(), before, `PARK moved state in ${phase}`);
  }
});

test("lifecycle: REVEAL does nothing in the lobby, before the first slide or after backing out of it", () => {
  // slideIndex -1 is the lobby before the show starts. slideIndex 0 is the lobby after BACK from the first
  // slide, where a question sits at that index and a missing guard would settle it for real.
  for (const slideIndex of [-1, 0]) {
    useGameStore.setState({ phase: "lobby" as any, run: [firstQuestion, secondQuestion] as any, slideIndex, settledQuestionInstances: {} });
    const before = useGameStore.getState();
    useGameStore.getState().dispatch({ type: "REVEAL" });
    assert.equal(useGameStore.getState(), before, `REVEAL moved the lobby at slideIndex ${slideIndex}`);
  }
});

test("lifecycle: REVEAL needs a question on stage, so the end screens and a title slide ignore it", () => {
  const titleSlide = { id: "title-1", type: "title" };
  // The run is over with its last question settled. A missing guard would jump back to that question's reveal.
  for (const phase of ["closing", "showdown"] as const) {
    useGameStore.setState({ phase: phase as any, run: [firstQuestion, secondQuestion] as any, slideIndex: 1, settledQuestionInstances: {} });
    const before = useGameStore.getState();
    useGameStore.getState().dispatch({ type: "REVEAL" });
    assert.equal(useGameStore.getState(), before, `REVEAL moved state on ${phase}`);
  }
  useGameStore.setState({ phase: "entering" as any, run: [titleSlide, firstQuestion] as any, slideIndex: 0, settledQuestionInstances: {} });
  const onTitle = useGameStore.getState();
  useGameStore.getState().dispatch({ type: "REVEAL" });
  assert.equal(useGameStore.getState(), onTitle, "REVEAL moved state on a title slide");

  // Control: a live question still reveals on Enter, so the guard is not simply refusing everything.
  useGameStore.setState({ phase: "deliberating" as any, run: [firstQuestion, secondQuestion] as any, slideIndex: 0, settledQuestionInstances: {} });
  useGameStore.getState().dispatch({ type: "REVEAL" });
  assert.equal(useGameStore.getState().phase, "revealed");
});

test("lifecycle: an action the old wizard used does nothing if a stale sender still dispatches it", () => {
  const retired = [
    { type: "START_PREFLIGHT" },
    { type: "ADVANCE_PREFLIGHT" },
    { type: "SET_PREFLIGHT_STEP", step: 2 },
    { type: "CHECKLIST_ITEM_TOGGLE", item: "audioTest" },
    { type: "SET_CHECKLIST_ITEM", item: "audioTest", value: true },
    { type: "TOGGLE_SESSION_HISTORY" },
    { type: "SET_SESSION_HISTORY_ENABLED", enabled: true },
    { type: "READY" },
  ];
  for (const phase of ["preFlight", "lobby"] as const) {
    useGameStore.setState({ phase: phase as any, run: [firstQuestion, secondQuestion] as any, slideIndex: -1, settledQuestionInstances: {} });
    const before = useGameStore.getState();
    for (const action of retired) {
      useGameStore.getState().dispatch(action as any);
      assert.equal(useGameStore.getState(), before, `${action.type} moved state in ${phase}`);
    }
  }
});

test("lifecycle: HUD_HIDE suppresses the strip and HUD_SHOW restores it", () => {
  useGameStore.setState({
    hud: { visible: true, pinnedByFocus: true, suppressed: false },
  });
  useGameStore.getState().dispatch({ type: "HUD_HIDE", releaseFocus: true, suppress: true });
  assert.deepEqual(useGameStore.getState().hud, {
    visible: false,
    pinnedByFocus: false,
    suppressed: true,
  });
  useGameStore.getState().dispatch({ type: "HUD_SHOW", restore: true });
  assert.deepEqual(useGameStore.getState().hud, {
    visible: true,
    pinnedByFocus: false,
    suppressed: false,
  });
});

test("lifecycle: SKIP and PARK no-op on title and instructions", () => {
  const title = { id: "title", type: "title", title: "Vax or Fiction?" };
  const instructions = { id: "instructions", type: "instructions", title: "Talk first." };
  const question = { id: "q-one", type: "question", kind: "binary", prompt: "A statement.", answer: true };
  const later = { id: "q-two", type: "question", kind: "binary", prompt: "Another statement.", answer: false };
  useGameStore.setState({
    run: [title, instructions, question, later] as any,
    slideIndex: 0,
    phase: "entering" as any,
    session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [], participants: 0, droppedMessages: 0 },
  } as any);
  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().slideIndex, 0, "SKIP must not leave the title slide");
  useGameStore.getState().dispatch({ type: "PARK" });
  assert.equal(useGameStore.getState().slideIndex, 0);
  useGameStore.setState({ slideIndex: 1 });
  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().slideIndex, 1, "SKIP must not leave instructions");
  useGameStore.setState({ slideIndex: 2, phase: "deliberating" as any });
  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().slideIndex, 3);
  assert.equal(useGameStore.getState().phase, "entering");
});
