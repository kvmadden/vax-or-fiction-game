import assert from 'node:assert/strict';
import test from 'node:test';
import { BUNDLED_DECKS } from '../../src/data/decks';
import { flagshipDeck } from '../../src/data/decks/flagship';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { playerVisibleRun, useGameStore } from '../../src/store/game-store';
import { projectPublicReveal } from '../../src/network/projection';

// VOF-74 (content fix batch 2): the two ids this suite used to exercise the hold mechanism against, flagship q16
// and show q11, are both released (their evidence was re-checked and confirmed). Neither BUNDLED_DECKS deck
// carries a live hold anymore, so these four tests exercise the same mechanism (isHeldBundledQuestion reads
// `deck.heldQuestionIds` off the live, singleton BUNDLED_DECKS objects) against a temporary hold this suite
// installs and removes on flagship q1, never touching clinical text or content/editorial data.
const TEMP_HELD_ID = 'q1';
function withTemporaryHold<T>(run: () => T): T {
  const before = flagshipDeck.heldQuestionIds;
  flagshipDeck.heldQuestionIds = [TEMP_HELD_ID];
  try {
    return run();
  } finally {
    flagshipDeck.heldQuestionIds = before;
  }
}

test('confirmed linked content holds are absent from every bundled mode and selectable run', () => {
  withTemporaryHold(() => {
    for (const deck of BUNDLED_DECKS) {
      const heldId = deck.id === 'flagship' ? TEMP_HELD_ID : null;
      if (!heldId) continue;
      for (const mode of Object.values(deck.modes)) {
        useGameStore.setState(useGameStore.getInitialState(), true);
        useGameStore.getState().dispatch({ type: 'SELECT_DECK', deckId: deck.id });
        useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: mode.id });
        assert.ok(!useGameStore.getState().run.some((q) => q.id === heldId), `${deck.id}/${mode.id} runs ${heldId}`);
      }
    }
  });
});

test('persisted and custom runs cannot revive either held content copy or a renamed equivalent', () => {
  withTemporaryHold(() => {
    const held = flagshipDeck.questions.find((q) => q.id === TEMP_HELD_ID)!;
    const accepted = vaxOrFictionDeck.questions.find((q) => q.id === TEMP_HELD_ID)!;
    const run = [held, { ...held, id: 'renamed-copy' }, accepted];
    assert.deepEqual(playerVisibleRun(run).map((q) => q.id), [TEMP_HELD_ID]);
    const merged = useGameStore.persist.getOptions().merge!({ run, slideIndex: 2, phase: 'entering' }, useGameStore.getInitialState());
    assert.deepEqual(merged.run.map((q) => q.id), [TEMP_HELD_ID]);
    assert.equal(merged.slideIndex, 0);
  });
});

test('held content stays held after editorial whitespace, answer, reveal, or stem drift', () => {
  withTemporaryHold(() => {
    const held = flagshipDeck.questions.find((q) => q.id === TEMP_HELD_ID)!;
    const copies = [
      { ...held, id: 'edited-reveal', reveal: `${held.reveal} ` },
      { ...held, id: 'edited-answer', answer: !held.answer },
      { ...held, id: 'edited-whitespace', statement: `  ${held.statement.replaceAll(' ', '  ')} ` },
      { ...held, id: 'edited-stem', statement: 'An edited draft of the held question.' },
    ];
    assert.deepEqual(playerVisibleRun(copies), []);
  });
});

test('all-held hydration and presets recover to a playable setup, while mixed authored order stays intact', () => {
  withTemporaryHold(() => {
    const held = flagshipDeck.questions.find((q) => q.id === TEMP_HELD_ID)!;
    const initial = useGameStore.getInitialState();
    const restored = useGameStore.persist.getOptions().merge!({ run: [held], slideIndex: 0, phase: 'entering' }, initial);
    assert.ok(restored.run.some((q) => typeof q.statement === 'string'));
    assert.equal(restored.phase, 'modePicker');
    assert.equal(restored.slideIndex, -1);
    useGameStore.setState(initial, true);
    useGameStore.getState().dispatch({ type: 'APPLY_PRESET', preset: { id: 'held-only', settings: { run: [held], phase: 'entering', slideIndex: 0 } } as never });
    const preset = useGameStore.getState();
    assert.deepEqual(preset.run, initial.run);
    assert.equal(preset.phase, 'modePicker');
    assert.equal(preset.slideIndex, -1);
  });
});

test('malformed persisted runs recover setup without silently dropping entries from a mixed run', () => {
  const initial = useGameStore.getInitialState();
  const merge = useGameStore.persist.getOptions().merge!;
  for (const run of [[{ id: 'invalid-run-entry' }], [initial.run[0], { id: 'invalid-run-entry' }], [{ id: 'invalid-question', kind: 'binary', answer: true }]]) {
    const restored = merge({ run, slideIndex: 0, phase: 'entering' }, initial);
    assert.equal(restored.phase, 'modePicker');
    assert.equal(restored.slideIndex, -1);
    assert.deepEqual(restored.run, initial.run);
    useGameStore.setState(initial, true);
    useGameStore.getState().dispatch({ type: 'APPLY_PRESET', preset: { id: 'bad-run', settings: { run, phase: 'entering' } } as never });
    assert.deepEqual(useGameStore.getState().run, initial.run);
  }
  const valid = merge({ run: initial.run, slideIndex: 1, phase: 'entering' }, initial);
  assert.equal(valid.phase, 'entering');
  assert.equal(valid.slideIndex, 1);
  assert.deepEqual(valid.run, initial.run);
});

test('all eligible bundled content including the scenario-only reply survives persistence validation', () => {
  const initial = useGameStore.getInitialState();
  for (const deck of BUNDLED_DECKS) {
    const run = playerVisibleRun(deck.questions);
    const restored = useGameStore.persist.getOptions().merge!({ run, slideIndex: 0, phase: 'entering' }, initial);
    assert.equal(restored.phase, 'entering', deck.id);
    assert.deepEqual(restored.run, run, deck.id);
  }
});

test('nested saved content fails closed before render or reveal projection for both ingress paths', () => {
  const initial = useGameStore.getInitialState();
  const question = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q4')!;
  const merge = useGameStore.persist.getOptions().merge!;
  const malformed = [
    { citations: {} }, { citations: [null] }, { citations: [{ ...question.citations?.[0], shortDisplayLine: {} }] },
    { citations: [{ ...question.citations?.[0], url: {} }] }, { source: { publisher: {} } },
    { reveal: {} }, { takeaway: {} }, { scenario: {} }, { statement: {} }, { imageRequirementId: {} },
    { emphasis: [null] }, { reasons: {} }, { debatePrompts: [null] }, { presenterNote: {} },
  ];
  for (const patch of malformed) {
    const run = [{ ...question, ...patch }];
    const restored = merge({ run, slideIndex: 0, phase: 'revealed' }, initial);
    assert.equal(restored.phase, 'modePicker', JSON.stringify(patch));
    assert.equal(restored.slideIndex, -1, JSON.stringify(patch));
    assert.deepEqual(restored.run, initial.run, JSON.stringify(patch));
    useGameStore.setState(initial, true);
    useGameStore.getState().dispatch({ type: 'APPLY_PRESET', preset: { id: 'bad-nested-run', settings: { run, phase: 'revealed', slideIndex: 0 } } as never });
    assert.deepEqual(useGameStore.getState().run, initial.run, JSON.stringify(patch));
  }
  const valid = merge({ run: [question], slideIndex: 0, phase: 'revealed' }, initial);
  assert.equal(valid.phase, 'revealed');
  assert.deepEqual(projectPublicReveal(valid.run[0] as never), projectPublicReveal(question));
});

test('saved content validates sparse nested arrays, estimate units, and static-slide text', () => {
  const initial = useGameStore.getInitialState();
  const question = vaxOrFictionDeck.questions.find((entry) => entry.kind === 'estimate')!;
  const sparseCitations = new Array(2);
  sparseCitations[1] = question.citations?.[0];
  const sparseRun = new Array(2);
  sparseRun[1] = question;
  const invalidRuns = [
    [{ ...question, citations: sparseCitations }],
    [{ ...question, estimate: { ...question.estimate, unit: {} } }],
    [{ ...question, estimate: { ...question.estimate, tolerance: {} } }],
    [{ ...initial.run[0], body: {} }],
    [{ ...initial.run[0], summaryPoints: [null] }],
    [{ ...initial.run[0], references: [null] }],
    sparseRun,
  ];
  for (const run of invalidRuns) {
    const restored = useGameStore.persist.getOptions().merge!({ run, slideIndex: 0, phase: 'revealed' }, initial);
    assert.deepEqual(restored.run, initial.run);
    assert.equal(restored.phase, 'modePicker');
    useGameStore.setState(initial, true);
    useGameStore.getState().dispatch({ type: 'APPLY_PRESET', preset: { id: 'bad-nested-run', settings: { run, phase: 'revealed', slideIndex: 0 } } as never });
    assert.deepEqual(useGameStore.getState().run, initial.run);
  }
});

test('confirmed restart of the actual demo restores the same opening slide after reload', () => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.getState().dispatch({ type: 'REQUEST_RESTART_RUN' });
  useGameStore.getState().dispatch({ type: 'CONFIRM_RESTART_RUN' });
  const restarted = useGameStore.getState();
  assert.equal(restarted.run[restarted.slideIndex]?.id, 'title');
  const restored = useGameStore.persist.getOptions().merge!(restarted, useGameStore.getInitialState());
  assert.equal(restored.phase, 'entering');
  assert.equal(restored.slideIndex, 0);
  assert.equal(restored.run[restored.slideIndex]?.id, 'title');
});
