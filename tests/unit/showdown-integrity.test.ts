import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Showdown } from "../../src/screens/Showdown";
import { duelPointsAnnouncement } from "../../src/screens/showdown-announcements";
import { getGameSessionStorageName, useGameStore } from "../../src/store/game-store";

const recapOne = { id: "q-recap-one", type: "question", kind: "binary", statement: "Authored recap statement one", answer: true, takeaway: "Authored takeaway one", reveal: "Authored reveal one" };
const recapTwo = { id: "q-recap-two", type: "question", kind: "binary", statement: "Authored recap statement two", answer: false, takeaway: "Authored takeaway two", reveal: "Authored reveal two" };

function participant(name: string, score: number, bestStreak: number = 1, hardQuestionPoints: number = 0) {
  return { nickname: name, team: null, joinedAt: 1, score, answered: 2, correct: 1, streak: 0, bestStreak, hardQuestionPoints, realityGap: 0 };
}

beforeEach(() => {
  useGameStore.setState({ sessionId: "run-showdown", modeId: "full", run: [recapOne, recapTwo] as any, slideIndex: 1, phase: "revealed" as any, showdownEnabled: true, showdown: null, seenDevices: {} });
});

test("zero participants bypass Showdown and enter Closing", () => {
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  const state = useGameStore.getState();
  assert.equal(state.phase, "closing");
  assert.equal(state.showdown, null);
});

test("one actual participant becomes the solo finalist without fabricated contestants", () => {
  useGameStore.setState({ seenDevices: { "device-solo": participant("Sole Survivor", 9, 0) } });
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  const state = useGameStore.getState();
  assert.equal(state.phase, "showdown");
  assert.deepEqual(state.showdown?.finalists, [{ ticket: "F-1", name: "Sole Survivor", score: 9, duelPoints: 0 }]);
  assert.equal(state.showdown?.stage, "lineup");
  const html = renderToString(React.createElement(Showdown));
  assert.match(html, /Solo Champion Showcase/i);
  assert.ok(html.includes("Sole Survivor"));
  assert.ok(!html.includes("Dr. Sarah T."));
  assert.ok(!html.includes("PharmD Marcus"));
  useGameStore.getState().dispatch({ type: "ADVANCE_SHOWDOWN" });
  assert.equal(useGameStore.getState().showdown?.stage, "result");
  assert.equal(useGameStore.getState().showdown?.winner, "F-1");
});

test("two highest actual scores qualify using the leaderboard tie breakers", () => {
  useGameStore.setState({ seenDevices: { z: participant("Lower streak", 8, 1), a: participant("Higher streak", 8, 3), b: participant("Top Score", 12, 4), c: participant("Below Cut", 4, 1) } });
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  assert.deepEqual(useGameStore.getState().showdown?.finalists, [
    { ticket: "F-1", name: "Top Score", score: 12, duelPoints: 0 },
    { ticket: "F-2", name: "Higher streak", score: 8, duelPoints: 0 },
  ]);
});

test("predictions count once per device, allow replacement during lineup, and reject stale or unknown finalists", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });
  const showdownId = useGameStore.getState().showdown!.id;
  dispatch({ type: "PREDICT_WINNER", deviceId: "audience-1", winner: "F-1", showdownId });
  dispatch({ type: "PREDICT_WINNER", deviceId: "audience-1", winner: "F-1", showdownId });
  dispatch({ type: "PREDICT_WINNER", deviceId: "audience-2", winner: "F-1", showdownId });
  dispatch({ type: "PREDICT_WINNER", deviceId: "audience-1", winner: "F-2", showdownId });
  dispatch({ type: "PREDICT_WINNER", deviceId: "audience-3", winner: "missing", showdownId });
  dispatch({ type: "PREDICT_WINNER", deviceId: "audience-4", winner: "F-2", showdownId: "old-run:showdown" });
  assert.deepEqual(useGameStore.getState().showdown?.predictions, { "audience-1": "F-2", "audience-2": "F-1" });
  assert.deepEqual(useGameStore.getState().showdown?.predictionCounts, { "F-1": 1, "F-2": 1 });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "PREDICT_WINNER", deviceId: "audience-2", winner: "F-2", showdownId });
  assert.deepEqual(useGameStore.getState().showdown?.predictionCounts, { "F-1": 1, "F-2": 1 });
});

test("duel points and authored recap question index live in store across rerenders", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADJUST_SHOWDOWN_POINTS", ticket: "F-2", delta: 2 });
  dispatch({ type: "SET_SHOWDOWN_QUESTION", index: 1 });
  const showdown = useGameStore.getState().showdown!;
  assert.equal(showdown.stage, "duel");
  assert.equal(showdown.finalists[1]?.duelPoints, 2);
  assert.equal(showdown.questionIndex, 1);
  assert.deepEqual(showdown.questionIds, ["q-recap-one", "q-recap-two"]);
  assert.equal(showdown.isRecap, true);
  const firstHtml = renderToString(React.createElement(Showdown));
  const secondHtml = renderToString(React.createElement(Showdown));
  for (const html of [firstHtml, secondHtml]) {
    assert.ok(html.includes("Authored recap statement two"));
    assert.ok(html.replaceAll("<!-- -->", "").includes("QUESTION 2 OF 2"));
    assert.ok(!html.includes("3-month revaccination interval"));
    assert.ok(!html.includes("Co-administration of high-dose influenza"));
  }
});

test("duel recap prints the authored choice for which-patient and order questions", () => {
  const whichPatient = {
    id: "q-which",
    type: "question",
    kind: "which-patient",
    statement: "Which child needs a second flu dose today?",
    choices: [
      "Age 8, first flu dose two weeks ago.",
      "Age 9, at least two earlier flu doses.",
      "First-ever flu dose at 8, now 9, and four weeks have passed.",
    ],
    bestIndex: 2,
    takeaway: "The birthday does not cancel dose two after the four-week interval.",
    reveal: "Dose count is set by age at the first dose.",
  };
  const order = {
    id: "q-order",
    type: "question",
    kind: "order",
    statement: "A practical vaccine conversation",
    steps: ["Check the record", "Make a clear recommendation", "Address questions"],
    takeaway: "Assess. Recommend. Listen. Act. Document.",
    reveal: "Confirm the indication and consent before you vaccinate.",
  };
  useGameStore.setState({
    seenDevices: { a: participant("North", 10, 0), b: participant("South", 8, 0) },
    run: [whichPatient, order] as any,
  });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  const first = renderToString(React.createElement(Showdown)).replaceAll("<!-- -->", "");
  assert.match(first, /ANSWER · BEST · C/);
  assert.match(first, /First-ever flu dose at 8, now 9, and four weeks have passed/);
  assert.doesNotMatch(first.replace(/\s+/g, " "), /ANSWER · </);
  dispatch({ type: "SET_SHOWDOWN_QUESTION", index: 1 });
  const second = renderToString(React.createElement(Showdown)).replaceAll("<!-- -->", "");
  assert.match(second, /ANSWER · THE ORDER/);
  assert.match(second, /1\. Check the record/);
});

test("result winner and finish transition are authoritative store actions", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADJUST_SHOWDOWN_POINTS", ticket: "F-2", delta: 3 });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  assert.equal(useGameStore.getState().showdown?.stage, "result");
  assert.equal(useGameStore.getState().showdown?.winner, "F-2");
  assert.equal(useGameStore.getState().showdown?.tie, false);
  dispatch({ type: "FINISH_SHOWDOWN" });
  assert.equal(useGameStore.getState().phase, "closing");
});

test("equal duel points produce an explicit tie without inventing a winner", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  assert.equal(useGameStore.getState().showdown?.stage, "result");
  assert.equal(useGameStore.getState().showdown?.winner, null);
  assert.equal(useGameStore.getState().showdown?.tie, true);
});

test("SKIP of the last live question enters Showdown when the finale is on", () => {
  useGameStore.setState({
    seenDevices: { a: participant("Alpha", 10, 0) },
    run: [recapOne, recapTwo] as any,
    slideIndex: 1,
    phase: "deliberating" as any,
    interactionMode: "polling",
    offlineMode: false,
    votesLocked: false,
    showdownEnabled: true,
    showdown: null,
    session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [], participants: 0, droppedMessages: 0 },
  } as any);
  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().presenterArm?.kind, "skip");
  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().phase, "showdown");
  assert.equal(useGameStore.getState().showdown?.stage, "lineup");
  assert.equal(useGameStore.getState().showdown?.finalists[0]?.name, "Alpha");
});

test("SKIP of the last question before a showdown slide still enters the finale", () => {
  useGameStore.setState({
    seenDevices: { a: participant("Alpha", 10, 0) },
    run: [recapOne, { id: "showdown", type: "showdown" }] as any,
    slideIndex: 0,
    phase: "deliberating" as any,
    interactionMode: "polling",
    offlineMode: false,
    votesLocked: false,
    showdownEnabled: true,
    showdown: null,
    session: { room: null, deckId: "vax-or-fiction", startedAt: null, questions: [], participants: 0, droppedMessages: 0 },
  } as any);
  useGameStore.getState().dispatch({ type: "SKIP" });
  useGameStore.getState().dispatch({ type: "SKIP" });
  assert.equal(useGameStore.getState().phase, "showdown");
});

test("ADVANCE on Closing stays on Closing", () => {
  useGameStore.setState({ phase: "closing" as any, showdownEnabled: false, slideIndex: 0, run: [recapOne] as any });
  const before = useGameStore.getState();
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "closing");
  assert.equal(useGameStore.getState().slideIndex, before.slideIndex);
});

test("ADVANCE uses Showdown after the final reveal only when enabled and advances its stages coherently", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "explaining");
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "showdown");
  assert.equal(useGameStore.getState().showdown?.stage, "lineup");
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().presenterArm?.kind, "showdown");
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().showdown?.stage, "duel");
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().showdown?.stage, "result");
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "closing");
  useGameStore.setState({ phase: "revealed" as any, slideIndex: 1, showdownEnabled: false, showdown: null });
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "explaining");
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().phase, "closing");
  assert.equal(useGameStore.getState().showdown, null);
});

test("keyboard BACK traverses Showdown result to duel to lineup without changing the run slide", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });
  dispatch({ type: "ADVANCE" });
  dispatch({ type: "ADVANCE" });
  dispatch({ type: "ADVANCE" });
  assert.equal(useGameStore.getState().showdown?.stage, "result");
  dispatch({ type: "BACK" });
  assert.equal(useGameStore.getState().showdown?.stage, "duel");
  assert.equal(useGameStore.getState().slideIndex, 1);
  dispatch({ type: "BACK" });
  assert.equal(useGameStore.getState().showdown?.stage, "lineup");
  assert.equal(useGameStore.getState().slideIndex, 1);
});

test("persisted Showdown state is validated and survives hydration while malformed state is dropped", () => {
  const merge = useGameStore.persist.getOptions().merge!;
  const current = useGameStore.getState();
  const valid = {
    id: "run-showdown:showdown", stage: "duel",
    finalists: [{ ticket: "F-1", name: "Alpha", score: 10, duelPoints: 1 }, { ticket: "F-2", name: "Beta", score: 8, duelPoints: 2 }],
    predictions: { device: "F-2" }, predictionCounts: { "F-1": 0, "F-2": 1 }, questionIds: ["q-recap-one", "q-recap-two"], questionIndex: 1, winner: null, tie: false, isRecap: true,
  };
  const restored = merge({ phase: "showdown", showdown: valid }, current) as any;
  assert.deepEqual(restored.showdown, valid);
  const malformed = merge({ phase: "showdown", showdown: { ...valid, stage: "unknown", finalists: [{ name: "No ticket" }] } }, current) as any;
  assert.equal(malformed.showdown, null);
  assert.equal(malformed.phase, "closing");
});

test("host hydration preserves configured teams and leaderboard", () => {
  const merge = useGameStore.persist.getOptions().merge!;
  const current = useGameStore.getState();
  for (const value of [true, false]) {
    const restored = merge({ teamsEnabled: value, twoTeams: value, leaderboardEnabled: value }, current);
    assert.equal(restored.teamsEnabled, value);
    assert.equal(restored.twoTeams, value);
    assert.equal(restored.leaderboardEnabled, value);
  }
  assert.equal(merge({ twoTeams: 'true' }, current).twoTeams, current.twoTeams);
});

test("host hydration preserves supported stage formats and rejects invalid formats", () => {
  const merge = useGameStore.persist.getOptions().merge!;
  const current = useGameStore.getState();
  for (const formatId of ['widescreen', 'square', 'portrait']) {
    assert.equal(merge({ formatId }, current).formatId, formatId);
  }
  assert.equal(merge({ formatId: 'broken' }, current).formatId, current.formatId);
  assert.equal(merge({ formatId: {} }, current).formatId, current.formatId);
});

test("host persistence key is scoped to the exact room query value", () => {
  assert.equal(getGameSessionStorageName("?room=Room_A-19"), "vof-game-session:Room_A-19");
  assert.equal(getGameSessionStorageName(""), "vof-game-session:");
});

test("Curated 15 Next after the last question goes to Closing, not Showdown, even with phones in the room", () => {
  useGameStore.setState(useGameStore.getInitialState());
  useGameStore.getState().dispatch({ type: "SELECT_MODE", modeId: "curated15" });
  const initial = useGameStore.getState();
  assert.equal(initial.modeId, "curated15");
  assert.equal(initial.showdownEnabled, false);
  const lastIndex = initial.run.length - 1;
  assert.equal(initial.run[lastIndex]?.id, "q15");
  useGameStore.setState({
    ...initial,
    sessionId: "run-showdown",
    slideIndex: lastIndex,
    phase: "explaining" as any,
    votesLocked: true,
    showdownEnabled: true,
    showdown: null,
    seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) },
  } as any);
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  const afterNext = useGameStore.getState();
  assert.equal(afterNext.phase, "closing");
  assert.equal(afterNext.showdown, null);
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  const afterEnter = useGameStore.getState();
  assert.equal(afterEnter.phase, "closing", "Curated 15 cannot open Showdown even if the leftover finale flag is on");
  assert.equal(afterEnter.showdown, null);
  useGameStore.getState().dispatch({ type: "TOGGLE_SHOWDOWN" });
  assert.equal(useGameStore.getState().showdownEnabled, false);
});

test("Curated 8 Next after the last question goes to Closing, not Showdown, even with phones in the room", () => {
  const initial = useGameStore.getInitialState();
  assert.equal(initial.modeId, "curated8");
  assert.equal(initial.showdownEnabled, false);
  const lastIndex = initial.run.length - 1;
  assert.equal(initial.run[lastIndex]?.id, "q36");
  useGameStore.setState({
    ...initial,
    sessionId: "run-showdown",
    slideIndex: lastIndex,
    phase: "explaining" as any,
    votesLocked: true,
    showdownEnabled: true,
    showdown: null,
    seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) },
  } as any);
  useGameStore.getState().dispatch({ type: "ADVANCE" });
  const afterNext = useGameStore.getState();
  assert.equal(afterNext.phase, "closing");
  assert.equal(afterNext.showdown, null);
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  const afterEnter = useGameStore.getState();
  assert.equal(afterEnter.phase, "closing", "Curated 8 cannot open Showdown even if the leftover finale flag is on");
  assert.equal(afterEnter.showdown, null);
  useGameStore.getState().dispatch({ type: "TOGGLE_SHOWDOWN" });
  assert.equal(useGameStore.getState().showdownEnabled, false);
});

test("switching to Curated 15 drops a leftover Final challenge flag so Next cannot open Showdown", () => {
  useGameStore.setState({
    modeId: "full",
    activePresetId: "standard",
    showdownEnabled: true,
    showdown: null,
    seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) },
  } as any);
  useGameStore.getState().dispatch({ type: "SELECT_MODE", modeId: "curated15" });
  const after = useGameStore.getState();
  assert.equal(after.modeId, "curated15");
  assert.equal(after.showdownEnabled, false);
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  assert.equal(useGameStore.getState().phase, "closing");
  assert.equal(useGameStore.getState().showdown, null);
});

// A11Y-16. Showdown had no aria-live region anywhere in the file, so a screen-reader user got no
// announcement when the stage advanced (lineup -> duel -> result) or when the host awarded or
// subtracted a duel point. The stage half must be correct on the very first render (not only
// after some later effect), since the same store-driven ADVANCE dispatch a facilitator uses
// produces a fresh render each time, exactly like the renderToString calls in this file's other
// tests.
function srOnlyLiveRegions(html: string): string[] {
  return [...html.matchAll(/<div class="sr-only" aria-live="polite" aria-atomic="true">([^<]*)<\/div>/g)].map((m) => m[1]);
}

test("A11Y-16: Showdown announces the current stage in a live region, for lineup, duel and result", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });

  const lineupHtml = renderToString(React.createElement(Showdown));
  const lineupRegions = srOnlyLiveRegions(lineupHtml);
  assert.ok(lineupRegions.some((text) => /lineup/i.test(text) && /2 finalists/i.test(text)), `lineup stage must be announced (regions: ${JSON.stringify(lineupRegions)})`);

  dispatch({ type: "ADVANCE_SHOWDOWN" }); // arms the lineup-to-duel transition (see ADVANCE test above)
  dispatch({ type: "ADVANCE_SHOWDOWN" }); // actually enters duel
  assert.equal(useGameStore.getState().showdown?.stage, "duel", "fixture assumption: two advances reach duel");
  const duelHtml = renderToString(React.createElement(Showdown));
  const duelRegions = srOnlyLiveRegions(duelHtml);
  assert.ok(duelRegions.some((text) => /duel/i.test(text)), `duel stage must be announced (regions: ${JSON.stringify(duelRegions)})`);

  dispatch({ type: "ADJUST_SHOWDOWN_POINTS", ticket: "F-2", delta: 3 });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  assert.equal(useGameStore.getState().showdown?.winner, "F-2");
  const resultHtml = renderToString(React.createElement(Showdown));
  const resultRegions = srOnlyLiveRegions(resultHtml);
  assert.ok(resultRegions.some((text) => /Beta/.test(text) && /champion/i.test(text)), `the named winner must be announced (regions: ${JSON.stringify(resultRegions)})`);
});

test("A11Y-16: Showdown announces a tied result without inventing a winner", () => {
  useGameStore.setState({ seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) } });
  const dispatch = useGameStore.getState().dispatch;
  dispatch({ type: "ENTER_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  dispatch({ type: "ADVANCE_SHOWDOWN" });
  assert.equal(useGameStore.getState().showdown?.stage, "result");
  assert.equal(useGameStore.getState().showdown?.tie, true);
  const html = renderToString(React.createElement(Showdown));
  const regions = srOnlyLiveRegions(html);
  assert.ok(regions.some((text) => /co-champion/i.test(text) || /tie/i.test(text)), `a tie must be announced as a tie, not a fabricated winner (regions: ${JSON.stringify(regions)})`);
});

test("A11Y-16: Showdown announces the solo-champion lineup distinctly", () => {
  useGameStore.setState({ seenDevices: { a: participant("Sole Survivor", 9, 0) } });
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  const html = renderToString(React.createElement(Showdown));
  const regions = srOnlyLiveRegions(html);
  assert.ok(regions.some((text) => /solo/i.test(text)), `the solo lineup must be announced distinctly (regions: ${JSON.stringify(regions)})`);
});

test("ENTER_SHOWDOWN opens Showdown only when the finale is on", () => {
  useGameStore.setState({
    seenDevices: { a: participant("Alpha", 10, 0), b: participant("Beta", 8, 0) },
    showdownEnabled: false,
    showdown: null,
  });
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  assert.equal(useGameStore.getState().phase, "closing");
  assert.equal(useGameStore.getState().showdown, null);
  useGameStore.setState({ phase: "explaining" as any, showdownEnabled: true, showdown: null });
  useGameStore.getState().dispatch({ type: "ENTER_SHOWDOWN" });
  assert.equal(useGameStore.getState().phase, "showdown");
  assert.equal(useGameStore.getState().showdown?.stage, "lineup");
});

// NIT-5. "Now 1 duel points." reads wrong. duelPointsAnnouncement is exported because the sentence
// it builds only ever reaches the DOM from a useEffect (previousPointsRef comparing renders), which
// never runs during the renderToString calls the A11Y-16 tests above use for the stage half.
test("NIT-5: duelPointsAnnouncement pluralizes both the awarded amount and the running total", () => {
  assert.equal(duelPointsAnnouncement(1, "Beta", 1), "Awarded 1 point to Beta. Now 1 duel point.");
  assert.equal(duelPointsAnnouncement(3, "Beta", 4), "Awarded 3 points to Beta. Now 4 duel points.");
  assert.equal(duelPointsAnnouncement(-1, "Alpha", 1), "Subtracted 1 point from Alpha. Now 1 duel point.");
  assert.equal(duelPointsAnnouncement(-2, "Alpha", 0), "Subtracted 2 points from Alpha. Now 0 duel points.");
  assert.equal(duelPointsAnnouncement(4, "Alpha", 1), "Awarded 4 points to Alpha. Now 1 duel point.");
});
