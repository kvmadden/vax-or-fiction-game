import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../../src/store/game-store";

// ==============================================================================
// Reactions Schema Unit Tests (STATE-05)
// ==============================================================================

test("STATE-05 RED: useGameStore RECORD_REACTION stores reactions keyed by question.id instead of deviceId", () => {
  const store = useGameStore.getState();

  // Reset store with an active question slide
  useGameStore.setState({
    run: [{ id: "q_reactions_1", prompt: "Test Question 1", answer: true, kind: "binary", explainer: "" } as any],
    slideIndex: 0,
    reactions: {},
  });

  // Dispatch reaction with explicit questionId and reaction property
  store.dispatch({
    type: "RECORD_REACTION",
    deviceId: "device-attendee-1",
    reaction: "wait-really",
    questionId: "q_reactions_1",
  });

  const state = useGameStore.getState();

  // state.reactions must be keyed by questionId ("q_reactions_1"), NOT deviceId ("device-attendee-1")
  assert.equal(state.reactions["device-attendee-1"], undefined, "reactions must NOT be keyed by deviceId array");
  assert.ok(state.reactions["q_reactions_1"], "reactions must be keyed by questionId");

  const qReactions = state.reactions["q_reactions_1"];
  // Must provide counts accessible by kebab-case (read by the stage status rail) and camelCase
  assert.equal(qReactions["wait-really"], 1, "kebab-case 'wait-really' count must be 1");
  assert.equal(qReactions.waitReally, 1, "camelCase waitReally count must be 1");
  assert.equal(qReactions.total, 1, "total reaction count must be 1");
});

test("STATE-05 RED: useGameStore RECORD_REACTION defaults questionId to active slide ID when omitted", () => {
  const store = useGameStore.getState();

  useGameStore.setState({
    run: [
      { id: "q_active_slide", prompt: "Active Slide Question", answer: false, kind: "binary", explainer: "" } as any,
    ],
    slideIndex: 0,
    reactions: {},
  });

  // useLiveLink receives message without questionId: { type: 'RECORD_REACTION', deviceId: 'dev-1', reaction: 'knew-it' }
  store.dispatch({
    type: "RECORD_REACTION",
    deviceId: "dev-live-attendee",
    reaction: "knew-it",
  });

  const state = useGameStore.getState();
  assert.ok(state.reactions["q_active_slide"], "reactions must fall back to active slide id when questionId omitted");
  assert.equal(state.reactions["q_active_slide"]["knew-it"], 1);
  assert.equal(state.reactions["q_active_slide"].knewIt, 1);
});

test("STATE-05 RED: useGameStore supports icon mapping (e.g. brain -> wait-really) and multiple attendees", () => {
  const store = useGameStore.getState();

  useGameStore.setState({
    run: [{ id: "q_multi_rx", prompt: "Multi Reactions", answer: true, kind: "binary", explainer: "" } as any],
    slideIndex: 0,
    reactions: {},
  });

  // Attendee 1 sends 'wait-really'
  store.dispatch({
    type: "RECORD_REACTION",
    questionId: "q_multi_rx",
    reaction: "wait-really",
  });

  // Attendee 2 sends icon 'brain' (maps to 'wait-really')
  store.dispatch({
    type: "REACTION",
    questionId: "q_multi_rx",
    icon: "brain",
  });

  // Attendee 3 sends 'we-do-this'
  store.dispatch({
    type: "RECORD_REACTION",
    questionId: "q_multi_rx",
    reaction: "we-do-this",
  });

  const state = useGameStore.getState();
  const qRx = state.reactions["q_multi_rx"];
  assert.equal(qRx["wait-really"], 2, "'wait-really' count should be 2");
  assert.equal(qRx.waitReally, 2, "waitReally camelCase count should be 2");
  assert.equal(qRx["we-do-this"], 1, "'we-do-this' count should be 1");
  assert.equal(qRx.weDoThis, 1, "weDoThis camelCase count should be 1");
  assert.equal(qRx.total, 3, "total reaction count should be 3");
});

test("STATE-05: Multi-question reaction isolation on the keys the status rail reads", () => {
  const store = useGameStore.getState();

  useGameStore.setState({
    run: [
      { id: "question_A", prompt: "Q A", answer: true, kind: "binary", explainer: "" } as any,
      { id: "question_B", prompt: "Q B", answer: false, kind: "binary", explainer: "" } as any,
    ],
    slideIndex: 0,
    reactions: {},
  });

  // Reaction on Question A
  store.dispatch({
    type: "RECORD_REACTION",
    questionId: "question_A",
    reaction: "wait-really",
  });

  // Advance to Question B and react
  useGameStore.setState({ slideIndex: 1 });
  store.dispatch({
    type: "RECORD_REACTION",
    reaction: "knew-it", // omits questionId, resolves to question_B from run[slideIndex]
  });

  const state = useGameStore.getState();
  const rxA = state.reactions["question_A"];
  const rxB = state.reactions["question_B"];

  assert.equal(rxA?.waitReally, 1, "Question A has waitReally: 1");
  assert.equal(rxA?.knewIt ?? 0, 0, "Question A has knewIt: 0");

  assert.equal(rxB?.waitReally ?? 0, 0, "Question B has waitReally: 0");
  assert.equal(rxB?.knewIt, 1, "Question B has knewIt: 1");

  // The stage status rail reads each question's kebab-case counts (src/components/show/StatusRail.tsx).
  assert.equal(rxA?.["wait-really"], 1, "Question A has wait-really: 1");
  assert.equal(rxA?.["knew-it"] ?? 0, 0, "Question A has knew-it: 0");
  assert.equal(rxB?.["wait-really"] ?? 0, 0, "Question B has wait-really: 0");
  assert.equal(rxB?.["knew-it"], 1, "Question B has knew-it: 1");
});

test("RECORD_REACTION and FIRE_REACTION write reactionMoment.reaction so AudioPlayer can cue", () => {
  useGameStore.setState({
    run: [{ id: "q_sfx", prompt: "SFX", answer: true, kind: "binary", explainer: "" } as any],
    slideIndex: 0,
    reactions: {},
    reactionMoment: null,
  });
  useGameStore.getState().dispatch({
    type: "RECORD_REACTION",
    reaction: "knew-it",
    questionId: "q_sfx",
  });
  assert.equal(useGameStore.getState().reactionMoment?.reaction, "knew-it");
  assert.ok(useGameStore.getState().reactionMoment?.firedAt);

  useGameStore.getState().dispatch({ type: "FIRE_REACTION", reactionType: "wait-really" });
  assert.equal(useGameStore.getState().reactionMoment?.reaction, "wait-really");
  assert.equal(useGameStore.getState().reactionMoment?.type, undefined);
});

test("a device cannot fire the same occurrence twice, including after a phone reload", () => {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    sessionId: "rx-run",
    slideIndex: 0,
    run: [{ id: "q_rx", prompt: "Reload", answer: true, kind: "binary", explainer: "" } as any],
    reactions: {},
    reactionReceipts: {},
    reactionMoment: null,
    stageReactionsEnabled: true,
    reactionTickerEnabled: true,
  });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "RECORD_REACTION", deviceId: "phone-1", reaction: "knew-it" });
  const first = useGameStore.getState();
  assert.equal(first.reactions.q_rx["knew-it"], 1);
  const firstAt = first.reactionMoment?.firedAt;
  dispatch({ type: "RECORD_REACTION", deviceId: "phone-1", reaction: "wait-really" });
  const second = useGameStore.getState();
  assert.equal(second.reactions.q_rx["knew-it"], 1);
  assert.equal(second.reactions.q_rx["wait-really"] ?? 0, 0);
  assert.equal(second.reactionMoment?.firedAt, firstAt);
});

test("receipts are per occurrence so a repeated card can still receive a tap", () => {
  const question = { id: "q_repeat", prompt: "Repeat", answer: true, kind: "binary", explainer: "" } as any;
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    sessionId: "rx-repeat",
    slideIndex: 0,
    run: [question, question],
    reactions: {},
    reactionReceipts: {},
    reactionMoment: null,
    stageReactionsEnabled: true,
    reactionTickerEnabled: true,
  });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "RECORD_REACTION", deviceId: "phone-1", reaction: "knew-it" });
  useGameStore.setState({ slideIndex: 1 });
  dispatch({
    type: "RECORD_REACTION",
    deviceId: "phone-1",
    reaction: "we-do-this",
    questionInstanceId: "rx-repeat:1:q_repeat",
  });
  const state = useGameStore.getState();
  assert.equal(state.reactions["rx-repeat:0:q_repeat"]["knew-it"], 1);
  assert.equal(state.reactions["rx-repeat:1:q_repeat"]["we-do-this"], 1);
});

test("hydration restores reaction receipts and counts without replaying reactionMoment", () => {
  const merge = useGameStore.persist.getOptions().merge!;
  const restored = merge({
    reactionReceipts: { "run:0:q": { "dev-1": "knew-it" } },
    reactions: { "run:0:q": { "knew-it": 1, total: 1 } },
    stageReactionsEnabled: true,
    reactionTickerEnabled: true,
    reactionMoment: { reaction: "knew-it", firedAt: 1 },
  }, useGameStore.getInitialState());
  assert.equal(restored.reactionReceipts["run:0:q"]["dev-1"], "knew-it");
  assert.equal(restored.reactions["run:0:q"]["knew-it"], 1);
  assert.equal(restored.reactionMoment, null);
});

