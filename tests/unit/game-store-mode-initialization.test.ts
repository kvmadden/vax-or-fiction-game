import test from 'node:test';
import assert from 'node:assert/strict';

import { useGameStore } from '../../src/store/game-store';
import { isQuestionSlide } from '../../src/engine/kinds';

// The show deck (vax-or-fiction) is the default; its mode lists stay exact. Curated 8 is the host
// default (in the room + phone voting, 8 questions). The 12-question Quick demo and 15-question
// Curated 15 remain selectable.
const DEMO_QUESTION_IDS = ['q4', 'q19', 'q5', 'q33', 'q21', 'q22', 'q30', 'q16', 'q25', 'q18', 'q29', 'q15'];
const DEMO_IDS = ['title', 'instructions', ...DEMO_QUESTION_IDS];
// The show's hosted eight since 2026-09-29 (game-store.ts CURATED8_QUESTION_IDS), no longer the first eight of Curated 15.
const CURATED8_QUESTION_IDS = ['q35', 'q20', 'q25', 'q31', 'q18', 'q26', 'q29', 'q36'];
const CURATED8_IDS = ['title', 'instructions', ...CURATED8_QUESTION_IDS];
const CURATED15_QUESTION_IDS = ['q4', 'q19', 'q5', 'q33', 'q21', 'q22', 'q30', 'q16', 'q10', 'q8', 'q2', 'q25', 'q18', 'q31', 'q15'];
const CURATED15_IDS = ['title', 'instructions', ...CURATED15_QUESTION_IDS];

const FULL_IDS = [
  'title', 'instructions',
  'q1', 'q14', 'q2', 'q13', 'q3', 'q15', 'q4', 'q16', 'q5', 'q19', 'q6', 'q25', 'q7', 'q27', 'q8', 'q21', 'q9', 'q20',
  'q10', 'q26', 'q12', 'q28', 'q17', 'q22', 'q18', 'q33', 'q23', 'q29', 'q24', 'q34', 'q30', 'q35', 'q31', 'q36', 'q32',
];

const LIGHTNING_IDS = ['title', 'instructions', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];

// The flagship deck stays bundled; its full pace still breaks the authored True/False alternation.
// VOF-74 (content fix batch 2, flagship-q16): q16's hold is released, its evidence re-checked and confirmed, so
// it returns to its authored position between q15 and q17.
const FLAGSHIP_FULL_IDS = [
  'title', 'instructions',
  'q1', 'q2', 'q4', 'q3', 'q5', 'q6', 'q8', 'q7', 'q9', 'q10',
  'q11', 'q12', 'q14', 'q13', 'q15', 'q16', 'q18', 'q17', 'q19', 'q20',
];

function ids(run: Array<{ id: string }>): string[] {
  return run.map((question) => question.id);
}

test('fresh hosts start on the show deck with Curated 8 preselected and the timer on', () => {
  const initial = useGameStore.getInitialState();

  assert.equal(initial.modeId, 'curated8');
  assert.equal(initial.activePresetId, 'curated8');
  assert.equal(initial.selectedDeckId, 'vax-or-fiction');
  assert.equal(initial.deckId, 'vax-or-fiction');
  assert.equal(initial.formatId, 'widescreen');
  assert.equal(initial.interactionMode, 'polling');
  assert.equal(initial.timer.enabled, true);
  assert.equal(initial.timer.visible, true);
  assert.equal(initial.showdownEnabled, false);
  assert.equal(initial.stageReactionsEnabled, true);
  assert.equal(initial.reactionTickerEnabled, true);
  assert.equal(initial.leaderboardEnabled, true);
  assert.deepEqual(ids(initial.run), CURATED8_IDS);
  assert.equal(initial.run.filter(isQuestionSlide).length, 8);
  assert.equal(initial.run.length - 2, 8);

  useGameStore.setState(initial);
  useGameStore.getState().dispatch({ type: 'ENTER_LOBBY' });
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().phase, 'entering');
  assert.equal(useGameStore.getState().slideIndex, 0);
  assert.equal(useGameStore.getState().run[0]?.id, 'title');
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().run[useGameStore.getState().slideIndex]?.id, 'instructions');
  // VOF-88: the first press on the instructions starts the 3-2-1, and a second press skips into question 1.
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().run[useGameStore.getState().slideIndex]?.id, 'instructions');
  assert.equal(typeof useGameStore.getState().introCountdownAt, 'number');
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().introCountdownAt, null);
  const first = useGameStore.getState().run[useGameStore.getState().slideIndex] as Record<string, unknown>;
  assert.equal(first.id, 'q35');
  assert.equal(first.kind, 'binary');
  assert.equal(first.displayNumber, 1);
  assert.equal(first.displayCount, 8);
});

test('starting a run plays exactly the eight Curated 8 questions in the authored order', () => {
  const initial = useGameStore.getInitialState();
  useGameStore.setState({
    ...initial,
    showdownEnabled: false,
    showdown: null,
    seenDevices: {
      a: { nickname: 'Ada', team: null, joinedAt: 1, score: 12, answered: 2, correct: 2, streak: 0, bestStreak: 1, realityGap: 0 },
      b: { nickname: 'Bo', team: null, joinedAt: 1, score: 9, answered: 2, correct: 1, streak: 0, bestStreak: 1, realityGap: 1 },
    },
  });
  useGameStore.getState().dispatch({ type: 'ENTER_LOBBY' });
  const played: string[] = [];
  for (let step = 0; step < 80 && useGameStore.getState().phase !== 'closing'; step += 1) {
    useGameStore.getState().dispatch({ type: 'ADVANCE' });
    const state = useGameStore.getState();
    assert.notEqual(state.phase, 'showdown', 'normal Next never opens Showdown on Curated 8');
    const slide = state.run[state.slideIndex];
    if (state.phase === 'entering' && isQuestionSlide(slide)) {
      played.push(slide.id);
      useGameStore.getState().dispatch({ type: 'REVEAL' });
    }
  }
  assert.deepEqual(played, CURATED8_QUESTION_IDS);
  assert.equal(useGameStore.getState().phase, 'closing');
  assert.equal(useGameStore.getState().showdown, null);
  assert.equal(useGameStore.getState().showdownEnabled, false);
});

test('starting a run on Curated 15 plays exactly the fifteen Curated 15 questions in the authored order', () => {
  const initial = useGameStore.getInitialState();
  useGameStore.setState(initial);
  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'curated15' });
  const curated15State = useGameStore.getState();
  useGameStore.setState({
    ...curated15State,
    showdownEnabled: false,
    showdown: null,
    seenDevices: {
      a: { nickname: 'Ada', team: null, joinedAt: 1, score: 12, answered: 2, correct: 2, streak: 0, bestStreak: 1, realityGap: 0 },
      b: { nickname: 'Bo', team: null, joinedAt: 1, score: 9, answered: 2, correct: 1, streak: 0, bestStreak: 1, realityGap: 1 },
    },
  });
  useGameStore.getState().dispatch({ type: 'ENTER_LOBBY' });
  const played: string[] = [];
  for (let step = 0; step < 80 && useGameStore.getState().phase !== 'closing'; step += 1) {
    useGameStore.getState().dispatch({ type: 'ADVANCE' });
    const state = useGameStore.getState();
    assert.notEqual(state.phase, 'showdown', 'normal Next never opens Showdown on Curated 15');
    const slide = state.run[state.slideIndex];
    if (state.phase === 'entering' && isQuestionSlide(slide)) {
      played.push(slide.id);
      useGameStore.getState().dispatch({ type: 'REVEAL' });
    }
  }
  assert.deepEqual(played, CURATED15_QUESTION_IDS);
  assert.equal(useGameStore.getState().phase, 'closing');
  assert.equal(useGameStore.getState().showdown, null);
  assert.equal(useGameStore.getState().showdownEnabled, false);
});

test('the Quick demo remains a selectable 12-question pace', () => {
  useGameStore.setState(useGameStore.getInitialState());
  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'demo' });
  assert.equal(useGameStore.getState().modeId, 'demo');
  assert.deepEqual(ids(useGameStore.getState().run), DEMO_IDS);
  assert.equal(useGameStore.getState().run.length - 2, 12);
});

test('known mode selection materializes its authored question list', () => {
  const initial = useGameStore.getInitialState();
  const customQuestion = { id: 'custom-1', statement: 'A fictional saved question.', answer: true } as typeof initial.run[number];
  useGameStore.setState({ ...initial, run: [customQuestion], modeId: 'custom', selectedDeckId: 'custom' });

  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'full' });
  assert.deepEqual(ids(useGameStore.getState().run), FULL_IDS);
  assert.equal(useGameStore.getState().run.length - 2, 35, 'the held q11 never enters the full run');

  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'lightning' });
  assert.deepEqual(ids(useGameStore.getState().run), LIGHTNING_IDS);

  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'curated15' });
  assert.deepEqual(ids(useGameStore.getState().run), CURATED15_IDS);
  assert.equal(useGameStore.getState().run.length - 2, 15);

  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'demo' });
  assert.deepEqual(ids(useGameStore.getState().run), DEMO_IDS);
});

test('the retired curated mode is not materialized and an unknown mode preserves a custom run', () => {
  const initial = useGameStore.getInitialState();
  const customQuestion = { id: 'custom-1', statement: 'A fictional saved question.', answer: true } as typeof initial.run[number];
  useGameStore.setState({ ...initial, run: [customQuestion], modeId: 'custom', selectedDeckId: 'custom' });

  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'curated' });
  assert.deepEqual(ids(useGameStore.getState().run), ['custom-1']);

  useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'private-mode' });
  assert.equal(useGameStore.getState().modeId, 'private-mode');
  assert.deepEqual(ids(useGameStore.getState().run), ['custom-1']);
});

test('selecting the flagship deck keeps it playable with its own pattern-broken full run', () => {
  const initial = useGameStore.getInitialState();
  useGameStore.setState(initial);
  useGameStore.getState().dispatch({ type: 'SELECT_DECK', deckId: 'flagship' });
  const flagship = useGameStore.getState();
  assert.equal(flagship.deckId, 'flagship');
  assert.equal(flagship.modeId, 'full');
  assert.deepEqual(ids(flagship.run), FLAGSHIP_FULL_IDS);

  useGameStore.getState().dispatch({ type: 'SELECT_DECK', deckId: 'default' });
  assert.equal(useGameStore.getState().deckId, 'vax-or-fiction');
  assert.deepEqual(ids(useGameStore.getState().run), FULL_IDS);
});

test('built-in preset actions apply their runtime settings and question mode', () => {
  const initial = useGameStore.getInitialState();
  useGameStore.setState({
    ...initial,
    discussionEnabled: false,
    teamsEnabled: true,
    twoTeams: true,
    leaderboardEnabled: true,
    interactionMode: 'polling',
    showdownEnabled: true,
    timer: { ...initial.timer, enabled: false, visible: false },
  });

  useGameStore.getState().dispatch({ type: 'APPLY_PRESET', presetId: 'standard' });
  const standard = useGameStore.getState();
  assert.equal(standard.leaderboardEnabled, false);
  assert.equal(standard.teamsEnabled, false);
  assert.equal(standard.twoTeams, false);
  assert.deepEqual(ids(standard.run), FULL_IDS);

  useGameStore.getState().dispatch({ type: 'APPLY_PRESET', presetId: 'curated15' });
  const curated15 = useGameStore.getState();
  assert.equal(curated15.activePresetId, 'curated15');
  assert.equal(curated15.formatId, 'widescreen');
  assert.equal(curated15.modeId, 'curated15');
  assert.deepEqual(ids(curated15.run), CURATED15_IDS);
  assert.equal(curated15.timer.enabled, true);
  assert.equal(curated15.interactionMode, 'polling');
  assert.equal(curated15.showdownEnabled, false);
  assert.equal(curated15.stageReactionsEnabled, true);
  assert.equal(curated15.reactionTickerEnabled, true);
  assert.equal(curated15.leaderboardEnabled, true);

  useGameStore.getState().dispatch({ type: 'APPLY_PRESET', presetId: 'huddle' });

  const huddle = useGameStore.getState();
  assert.equal(huddle.activePresetId, 'huddle');
  assert.equal(huddle.formatId, 'widescreen');
  assert.equal(huddle.modeId, 'lightning');
  assert.deepEqual(ids(huddle.run), LIGHTNING_IDS);
  assert.equal(huddle.timer.enabled, true);
  assert.equal(huddle.discussionEnabled, true);
  assert.equal(huddle.teamsEnabled, false);
  assert.equal(huddle.twoTeams, false);
  assert.equal(huddle.leaderboardEnabled, false);
  assert.equal(huddle.interactionMode, 'facilitator');
  assert.equal(huddle.stageReactionsEnabled, false);
  assert.equal(huddle.reactionTickerEnabled, false);

  useGameStore.getState().dispatch({ type: 'APPLY_PRESET', presetId: 'rehearsal' });
  const rehearsal = useGameStore.getState();
  assert.equal(rehearsal.modeId, 'rehearsal');
  assert.deepEqual(ids(rehearsal.run), CURATED8_IDS);
});

test('hydration repairs the legacy empty host state but preserves a custom run exactly', () => {
  const initial = useGameStore.getInitialState();
  const merge = useGameStore.persist.getOptions().merge!;
  const repaired = merge({
    modeId: null,
    selectedDeckId: null,
    run: [],
    slideIndex: -1,
    phase: 'modePicker',
  }, initial);

  assert.equal(repaired.modeId, 'curated8');
  assert.equal(repaired.selectedDeckId, 'vax-or-fiction');
  assert.deepEqual(ids(repaired.run), CURATED8_IDS);

  const customQuestion = { id: 'custom-1', statement: 'A fictional saved question.', answer: true } as typeof initial.run[number];
  const restored = merge({
    modeId: 'private-mode',
    selectedDeckId: 'private-deck',
    run: [customQuestion],
    slideIndex: 0,
    phase: 'entering',
  }, initial);

  assert.equal(restored.modeId, 'private-mode');
  assert.equal(restored.selectedDeckId, 'private-deck');
  assert.equal(restored.slideIndex, 0);
  assert.deepEqual(restored.run, [customQuestion]);
});

test('a leftover setup tab on the old Quick demo default upgrades to Curated 8', () => {
  const initial = useGameStore.getInitialState();
  const merge = useGameStore.persist.getOptions().merge!;
  const upgraded = merge({
    modeId: 'demo',
    selectedDeckId: 'vax-or-fiction',
    run: DEMO_IDS.map((id) => ({ id })) as typeof initial.run,
    slideIndex: -1,
    phase: 'modePicker',
    showdownEnabled: true,
  }, initial);

  assert.equal(upgraded.modeId, 'curated8');
  assert.equal(upgraded.activePresetId, 'curated8');
  assert.equal(upgraded.showdownEnabled, false);
  assert.equal(upgraded.leaderboardEnabled, true);
  assert.deepEqual(ids(upgraded.run), CURATED8_IDS);

  const demoRun = (() => {
    useGameStore.setState(initial);
    useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: 'demo' });
    return useGameStore.getState().run;
  })();
  const liveDemo = merge({
    modeId: 'demo',
    selectedDeckId: 'vax-or-fiction',
    run: demoRun,
    slideIndex: 2,
    phase: 'entering',
  }, initial);
  assert.equal(liveDemo.modeId, 'demo', 'an in-progress demo run is not stolen');
  assert.deepEqual(ids(liveDemo.run), DEMO_IDS);
});

test('setup hydration drops a leftover Final challenge toggle; Curated 15 also drops it mid-run', () => {
  const initial = useGameStore.getInitialState();
  const merge = useGameStore.persist.getOptions().merge!;
  const setup = merge({
    modeId: 'curated15',
    selectedDeckId: 'vax-or-fiction',
    run: CURATED15_IDS.map((id) => ({ id })) as typeof initial.run,
    slideIndex: -1,
    phase: 'modePicker',
    showdownEnabled: true,
  }, initial);
  assert.equal(setup.showdownEnabled, false);

  const liveCurated = merge({
    modeId: 'curated15',
    selectedDeckId: 'vax-or-fiction',
    run: initial.run,
    slideIndex: 4,
    phase: 'entering',
    showdownEnabled: true,
  }, initial);
  assert.equal(liveCurated.showdownEnabled, false);

  const liveFull = merge({
    modeId: 'full',
    selectedDeckId: 'vax-or-fiction',
    run: initial.run,
    slideIndex: 4,
    phase: 'entering',
    showdownEnabled: true,
  }, initial);
  assert.equal(liveFull.showdownEnabled, true);
});
