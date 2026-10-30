import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore, VALID_TOKEN, isValidVoteToken } from "../../src/store/game-store";

// ==============================================================================
// Token Validation Unit Tests (STATE-01)
// ==============================================================================

test("STATE-01: Exported VALID_TOKEN and isValidVoteToken permit binary vote tokens", () => {
  assert.equal(VALID_TOKEN.test("true"), true, "'true' should match VALID_TOKEN");
  assert.equal(VALID_TOKEN.test("false"), true, "'false' should match VALID_TOKEN");

  assert.equal(isValidVoteToken("true"), true, "'true' should be valid vote token");
  assert.equal(isValidVoteToken("false"), true, "'false' should be valid vote token");
});

test("STATE-01: Exported VALID_TOKEN and isValidVoteToken permit hyphenated and multi-choice tokens", () => {
  const validTokens = [
    "a",
    "b",
    "a-b",
    "a-b-c",
    "opt-1",
    "opt-2",
    "choice-a",
    "opt1",
    "choice_A",
    "answer-1",
    "TEAM_NAVY",
    "ROUND_1_Q3",
  ];

  for (const token of validTokens) {
    assert.equal(VALID_TOKEN.test(token), true, `Token '${token}' should match VALID_TOKEN`);
    assert.equal(isValidVoteToken(token), true, `Token '${token}' should be valid vote token`);
  }
});

test("STATE-01: Exported VALID_TOKEN and isValidVoteToken reject invalid tokens and non-strings", () => {
  const invalidTokens = [
    "",
    " ",
    "   ",
    "true ",
    " false",
    "foo bar",
    "true\n",
    "bad@token",
    "token#1",
    "choice$value",
    "vote%20",
    "a+b",
    "a=b",
  ];

  for (const token of invalidTokens) {
    assert.equal(VALID_TOKEN.test(token), false, `Token '${token}' should be rejected by VALID_TOKEN`);
    assert.equal(isValidVoteToken(token), false, `Token '${token}' should be rejected by isValidVoteToken`);
  }

  // Non-string types rejected by isValidVoteToken
  assert.equal(isValidVoteToken(null), false, "null should be rejected");
  assert.equal(isValidVoteToken(undefined), false, "undefined should be rejected");
  assert.equal(isValidVoteToken(123), false, "number should be rejected");
  assert.equal(isValidVoteToken(true), false, "boolean should be rejected");
  assert.equal(isValidVoteToken({}), false, "object should be rejected");
});

// ==============================================================================
// useGameStore Integration Tests (STATE-01)
// ==============================================================================

test("STATE-01: useGameStore RECORD_VOTE and VOTE accept binary 'true' and 'false' votes", () => {
  const store = useGameStore.getState();

  // Reset store with an active question slide
  useGameStore.setState({
    run: [{ id: "q_binary", prompt: "Binary Question", answer: true, kind: "binary", explainer: "" } as any],
    slideIndex: 0,
    phase: "entering" as any,
    votesLocked: false,
    interactionMode: 'polling', offlineMode: false,
    pollVotes: {},
    pollVoters: {},
  });

  // Vote 'true'
  store.dispatch({
    type: "RECORD_VOTE",
    choice: "true",
    deviceId: "device-1",
    conviction: "certain",
  });

  let state = useGameStore.getState();
  assert.equal(state.pollVotes["q_binary"]?.["true"], 1, "pollVotes should record 1 'true' vote");
  assert.equal(state.pollVoters["q_binary"]?.["device-1"]?.choice, "true", "pollVoters should record voter choice");

  // Change vote to 'false' via VOTE action
  store.dispatch({
    type: "VOTE",
    token: "false",
    deviceId: "device-1",
    conviction: "fairly-sure",
  });

  state = useGameStore.getState();
  assert.equal(state.pollVotes["q_binary"]?.["true"], 0, "previous 'true' vote count should be 0");
  assert.equal(state.pollVotes["q_binary"]?.["false"], 1, "new 'false' vote count should be 1");
  assert.equal(state.pollVoters["q_binary"]?.["device-1"]?.choice, "false");
});

test("a vote the relay took while its question was open counts after the host's lock, until the reveal", () => {
  const store = useGameStore.getState();
  useGameStore.setState({
    run: [{ id: "q_lock", prompt: "Lock race", answer: true, kind: "binary", explainer: "" } as any],
    slideIndex: 0,
    phase: "deliberating" as any,
    votesLocked: true,
    interactionMode: 'polling', offlineMode: false,
    pollVotes: {},
    pollVoters: {},
  });
  store.dispatch({ type: "RECORD_VOTE", choice: "true", deviceId: "device-late", conviction: "certain" });
  assert.equal(useGameStore.getState().pollVoters["q_lock"]?.["device-late"], undefined, "a locked vote takes no vote by default");
  store.dispatch({ type: "RECORD_VOTE", choice: "true", deviceId: "device-early", conviction: "certain", takenWhileOpen: true });
  assert.equal(useGameStore.getState().pollVoters["q_lock"]?.["device-early"]?.choice, "true", "a vote the relay took while open counts");
  assert.equal(useGameStore.getState().pollVotes["q_lock"]?.["true"], 1);
  useGameStore.setState({ phase: "revealed" as any });
  store.dispatch({ type: "RECORD_VOTE", choice: "false", deviceId: "device-early", conviction: "certain", takenWhileOpen: true });
  assert.equal(useGameStore.getState().pollVoters["q_lock"]?.["device-early"]?.choice, "true", "nothing changes the count once it is revealed");
  useGameStore.setState({ phase: "deliberating" as any, interactionMode: 'offline' });
  store.dispatch({ type: "RECORD_VOTE", choice: "false", deviceId: "device-early", conviction: "certain", takenWhileOpen: true });
  assert.equal(useGameStore.getState().pollVoters["q_lock"]?.["device-early"]?.choice, "true", "and nothing counts with phone voting off");
});

test("STATE-01: useGameStore RECORD_VOTE and VOTE accept multi-choice and hyphenated tokens (e.g. 'opt-1')", () => {
  const store = useGameStore.getState();

  useGameStore.setState({
    run: [{ id: "q_multichoice", statement: "Multi Choice Question", answer: true, kind: "which-patient", choices: ["Option one", "Option two"], explainer: "" } as any],
    slideIndex: 0,
    phase: "entering" as any,
    votesLocked: false,
    interactionMode: 'polling', offlineMode: false,
    pollVotes: {},
    pollVoters: {},
  });

  // Device A votes for the first configured option.
  store.dispatch({
    type: "RECORD_VOTE",
    choice: "a",
    deviceId: "dev-a",
  });

  let state = useGameStore.getState();
  assert.equal(state.pollVotes["q_multichoice"]?.["a"], 1, "pollVotes should record the first configured option");
  assert.equal(state.pollVoters["q_multichoice"]?.["dev-a"]?.choice, "a");

  // Device B votes for the second configured option via the VOTE token property.
  store.dispatch({
    type: "VOTE",
    token: "b",
    deviceId: "dev-b",
  });

  state = useGameStore.getState();
  assert.equal(state.pollVotes["q_multichoice"]?.["b"], 1, "pollVotes should record the second configured option");
  assert.equal(state.pollVoters["q_multichoice"]?.["dev-b"]?.choice, "b");

  // Device A switches its vote from the first option to the second option.
  store.dispatch({
    type: "RECORD_VOTE",
    choice: "b",
    deviceId: "dev-a",
  });

  state = useGameStore.getState();
  assert.equal(state.pollVotes["q_multichoice"]?.["a"], 0, "first-option count should decrement to 0");
  assert.equal(state.pollVotes["q_multichoice"]?.["b"], 2, "second-option count should include both accepted votes");
  assert.equal(state.pollVoters["q_multichoice"]?.["dev-a"]?.choice, "b");
});

test("STATE-01: useGameStore rejects invalid tokens and ignores votes when votesLocked is true", () => {
  const store = useGameStore.getState();

  useGameStore.setState({
    run: [{ id: "q_locked_test", prompt: "Locked Test", answer: true, kind: "binary", explainer: "" } as any],
    slideIndex: 0,
    votesLocked: false,
    interactionMode: 'polling', offlineMode: false,
    pollVotes: {},
    pollVoters: {},
  });

  // Invalid token rejected
  store.dispatch({
    type: "RECORD_VOTE",
    choice: "invalid token!",
    deviceId: "dev-bad-token",
  });

  let state = useGameStore.getState();
  assert.equal(state.pollVoters["q_locked_test"]?.["dev-bad-token"], undefined, "invalid token must not record vote in voters");
  assert.equal(state.pollVotes["q_locked_test"], undefined, "no votes mapped for invalid token");

  // Another invalid token via VOTE
  store.dispatch({
    type: "VOTE",
    token: "bad@char",
    deviceId: "dev-bad-char",
  });

  state = useGameStore.getState();
  assert.equal(state.pollVoters["q_locked_test"]?.["dev-bad-char"], undefined);

  // Now lock votes
  useGameStore.setState({ votesLocked: true });

  store.dispatch({
    type: "RECORD_VOTE",
    choice: "true",
    deviceId: "dev-locked",
  });

  state = useGameStore.getState();
  assert.equal(state.pollVoters["q_locked_test"]?.["dev-locked"], undefined, "votes must be ignored when votesLocked is true");
});

test("STATE-02: settleCurrentQuestion calculates kind-based scores, streaks, and hardQuestionPoints", () => {
  const hardQuestion = {
    id: "q-hard-which",
    type: "question",
    kind: "which-patient",
    prompt: "Which patient should be prioritized?",
    choices: ["Patient A", "Patient B"],
    bestIndex: 1,
    explainer: "",
  };

  useGameStore.setState({
    sessionId: "run-hard",
    run: [hardQuestion] as any,
    slideIndex: 0,
    phase: "locked" as any,
    votesLocked: true,
    pollVotes: { "q-hard-which": { b: 1, a: 1 } },
    pollVoters: {
      "q-hard-which": {
        "dev-right": { choice: "b", conviction: "certain" },
        "dev-wrong": { choice: "a", conviction: "certain" },
      },
    },
    seenDevices: {
      "dev-right": {
        nickname: "Right",
        team: "NAVY",
        joinedAt: 1,
        score: 100,
        answered: 2,
        correct: 2,
        streak: 2,
        bestStreak: 2,
        realityGap: 0,
        hardQuestionPoints: 0,
      },
      "dev-wrong": {
        nickname: "Wrong",
        team: "GOLD",
        joinedAt: 2,
        score: 50,
        answered: 2,
        correct: 1,
        streak: 1,
        bestStreak: 1,
        realityGap: 0,
        hardQuestionPoints: 0,
      },
    },
    settledQuestionInstances: {},
    settledResults: {},
    roomStats: {
      questions: {},
      accuracy: 0,
      streak: 0,
      bestStreak: 0,
      mythsBusted: 0,
      swing: 0,
      certainTotal: 0,
      certainWrongTotal: 0,
      votesTotal: 0,
    },
    doubles: {},
  } as any);

  useGameStore.getState().dispatch({ type: "REVEAL" });

  const state = useGameStore.getState();
  const rightDevice = state.seenDevices["dev-right"]!;
  const wrongDevice = state.seenDevices["dev-wrong"]!;

  // dev-right had streak 2, so answer 3 gives:
  // basePoints: 200 (which-patient)
  // streak: 3 (hits 3-streak milestone => streakBonus: +50)
  // total points: 250
  // hardQuestionPoints delta: result.points - result.streakBonus = 200
  assert.equal(rightDevice.score, 100 + 250);
  assert.equal(rightDevice.streak, 3);
  assert.equal(rightDevice.bestStreak, 3);
  assert.equal(rightDevice.hardQuestionPoints, 200);
  assert.equal(rightDevice.realityGap, 0);

  // dev-wrong was wrong:
  // points: 0, streak: 0, hardQuestionPoints delta: 0
  assert.equal(wrongDevice.score, 50);
  assert.equal(wrongDevice.streak, 0);
  assert.equal(wrongDevice.bestStreak, 1);
  assert.equal(wrongDevice.hardQuestionPoints, 0);
  assert.equal(wrongDevice.realityGap, 0);
});

test("STATE-03: settleCurrentQuestion does NOT add hardQuestionPoints for binary questions", () => {
  const binaryQuestion = {
    id: "q-binary",
    type: "question",
    kind: "binary",
    prompt: "Binary statement",
    answer: true,
    explainer: "",
  };

  useGameStore.setState({
    sessionId: "run-binary",
    run: [binaryQuestion] as any,
    slideIndex: 0,
    phase: "locked" as any,
    votesLocked: true,
    pollVotes: { "q-binary": { true: 1 } },
    pollVoters: {
      "q-binary": {
        "dev-right": { choice: "true", conviction: "certain" },
      },
    },
    seenDevices: {
      "dev-right": {
        nickname: "Right",
        team: "NAVY",
        joinedAt: 1,
        score: 0,
        answered: 0,
        correct: 0,
        streak: 0,
        bestStreak: 0,
        realityGap: 0,
        hardQuestionPoints: 100, // already had 100
      },
    },
    settledQuestionInstances: {},
    settledResults: {},
    roomStats: {
      questions: {},
      accuracy: 0,
      streak: 0,
      bestStreak: 0,
      mythsBusted: 0,
      swing: 0,
      certainTotal: 0,
      certainWrongTotal: 0,
      votesTotal: 0,
    },
    doubles: {},
  } as any);

  useGameStore.getState().dispatch({ type: "REVEAL" });

  const state = useGameStore.getState();
  const rightDevice = state.seenDevices["dev-right"]!;

  // Binary right answer adds 100 points, but does NOT increment hardQuestionPoints
  assert.equal(rightDevice.score, 100);
  assert.equal(rightDevice.hardQuestionPoints, 100);
});

test("STATE-04: settleCurrentQuestion adds hardQuestionPoints for order questions", () => {
  const orderQuestion = {
    id: "q-order",
    type: "question",
    kind: "order",
    prompt: "Order the steps properly",
    steps: ["Step 1", "Step 2", "Step 3"],
    explainer: "",
  };

  useGameStore.setState({
    sessionId: "run-order",
    run: [orderQuestion] as any,
    slideIndex: 0,
    phase: "locked" as any,
    votesLocked: true,
    pollVotes: { "q-order": { "a-b-c": 1 } },
    pollVoters: {
      "q-order": {
        "dev-order": { choice: "a-b-c", conviction: "certain" },
      },
    },
    seenDevices: {
      "dev-order": {
        nickname: "OrderMaster",
        team: "NAVY",
        joinedAt: 1,
        score: 0,
        answered: 0,
        correct: 0,
        streak: 0,
        bestStreak: 0,
        realityGap: 0,
        hardQuestionPoints: 50,
      },
    },
    settledQuestionInstances: {},
    settledResults: {},
    roomStats: {
      questions: {},
      accuracy: 0,
      streak: 0,
      bestStreak: 0,
      mythsBusted: 0,
      swing: 0,
      certainTotal: 0,
      certainWrongTotal: 0,
      votesTotal: 0,
    },
    doubles: {},
  } as any);

  useGameStore.getState().dispatch({ type: "REVEAL" });

  const state = useGameStore.getState();
  const orderDevice = state.seenDevices["dev-order"]!;

  // Order question gives 250 base points.
  // With streak 0 -> nextStreak 1 (no milestone bonus).
  // hardQuestionPoints delta: 250 - 0 = 250.
  // Total hardQuestionPoints: 50 + 250 = 300.
  assert.equal(orderDevice.score, 250);
  assert.equal(orderDevice.streak, 1);
  assert.equal(orderDevice.bestStreak, 1);
  assert.equal(orderDevice.hardQuestionPoints, 300);
});
