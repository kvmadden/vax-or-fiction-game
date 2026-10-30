import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Question } from '../../src/data/types';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { MAX_ORDER_STEPS, rightToken } from '../../src/engine/kinds';
import { evalAnswer } from '../../src/engine/scoring';
import {
  ORDER_TOKEN_PATTERN,
  projectPublicQuestion,
  randomOrderScramble,
  type OrderScramble,
} from '../../src/network/projection';
import { projectGameState } from '../../src/network/game-projection';
import { getQuestionInstanceId, useGameStore } from '../../src/store/game-store';
import { OrderQuestion } from '../../src/screens/questions/OrderQuestion';
import { isolateSoloStore, projectSolo, recordSoloVote, SOLO_DEVICE_ID, startSoloRound, type SoloPool } from '../../src/solo/solo-game';

/**
 * ACCOUNTS-SPEC.md 8.6 / K5a, K5b (14.4). Before the fix, an order question's step tokens and
 * display order were both recomputed from public inputs the phone already has: `stableToken`
 * hashed `questionInstanceId`, and `orderDisplay` shuffled from the question `id`. Both
 * reconstructions recovered the correct order for all 3 live order questions (q15, q27, q28),
 * every time -- see a local evidence file for that RED-first run against main.
 *
 * The two functions below are that same historical logic, reproduced only so this file can prove
 * the fix by feeding their output back through the real (fixed) projectPublicQuestion as an
 * explicit scramble -- the mutation control the spec's RED-control column names for K5a and K5b.
 */
function oldStableToken(seed: string, index: number): string {
  let hash = 0x811c9dc5;
  const input = `${seed}:${index}`;
  for (let cursor = 0; cursor < input.length; cursor += 1) {
    hash ^= input.charCodeAt(cursor);
    hash = Math.imul(hash, 0x01000193);
  }
  return `s${(hash >>> 0).toString(36)}`;
}

function oldOrderDisplay(id: string, stepCount: number): string[] {
  const letters = Array.from({ length: stepCount }, (_unused, index) => String.fromCharCode(97 + index));
  if (letters.length < 2) return letters;
  let seed = 0;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  const scrambled = [...letters];
  const rotate = 1 + (seed % (letters.length - 1));
  for (let i = 0; i < letters.length; i += 1) scrambled[i] = letters[(i + rotate) % letters.length] as string;
  const a = seed % letters.length;
  const b = (seed * 7 + 3) % letters.length;
  if (a !== b && scrambled[a] !== letters[b] && scrambled[b] !== letters[a]) {
    const temp = scrambled[a] as string;
    scrambled[a] = scrambled[b] as string;
    scrambled[b] = temp;
  }
  if (scrambled.join('-') === letters.join('-')) scrambled.reverse();
  return scrambled;
}

/** The scramble the pre-fix code would have produced for this occurrence and question id. */
function leakyScrambleFor(questionInstanceId: string, question: Question): OrderScramble {
  const n = (question.steps ?? []).length;
  return {
    tokens: Array.from({ length: n }, (_unused, index) => oldStableToken(questionInstanceId, index)),
    order: oldOrderDisplay(question.id, n),
  };
}

/** K5a: hash questionInstanceId at each canonical index, look the hash up among the public tokens. */
function attackViaStableToken(publicQuestion: { questionInstanceId: string; steps?: { token: string; text: string }[] }): string[] {
  const steps = publicQuestion.steps ?? [];
  const byToken = new Map(steps.map((step) => [step.token, step.text]));
  return steps.map((_unused, index) => byToken.get(oldStableToken(publicQuestion.questionInstanceId, index)) ?? '\u0000miss');
}

/** K5b: recompute the id-seeded shuffle, invert it to find which display position holds each canonical step. */
function attackViaOrderDisplay(publicQuestion: { id: string; steps?: { token: string; text: string }[] }): string[] {
  const steps = publicQuestion.steps ?? [];
  const predictedDisplay = oldOrderDisplay(publicQuestion.id, steps.length);
  return steps.map((_unused, index) => {
    const pos = predictedDisplay.indexOf(String.fromCharCode(97 + index));
    return pos >= 0 ? steps[pos]!.text : '\u0000miss';
  });
}

/**
 * The number of canonical permutations of n items is n!, but randomOrderScramble explicitly
 * rejects the identity (correct) permutation before returning, so the real display order is
 * drawn uniformly from n!-1 outcomes, not n!. Using n! would understate chance and make the
 * statistical bounds below slightly too tight.
 */
function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}
function chanceOfCoincidentalMatch(stepCount: number): number {
  return 1 / (factorial(stepCount) - 1);
}

const liveOrderQuestions = vaxOrFictionDeck.questions.filter((question) => question.kind === 'order' && question.steps);
test('setup: the 3 live order questions this file exercises are q15, q27 and q28', () => {
  assert.deepEqual(liveOrderQuestions.map((question) => question.id).sort(), ['q15', 'q27', 'q28']);
});

test('K5a, K5b: reconstructing the order from exactly what a phone receives recovers no better than chance across 200 draws, on the 3 live order questions', (t) => {
  const drawsPerQuestion = [67, 67, 66];
  let k5aHits = 0;
  let k5bHits = 0;
  let k5aTokenCollisions = 0;
  let totalDraws = 0;
  let chanceExpectation = 0;
  liveOrderQuestions.forEach((question, index) => {
    const n = (question.steps ?? []).length;
    const chancePerDraw = chanceOfCoincidentalMatch(n);
    for (let draw = 0; draw < drawsPerQuestion[index]!; draw += 1) {
      const occurrence = `wire-test:${question.id}:${draw}`;
      const { question: publicQuestion } = projectPublicQuestion(question, occurrence, index + 1, liveOrderQuestions.length);
      const correct = question.steps as string[];
      if (attackViaStableToken(publicQuestion).join('|') === correct.join('|')) k5aHits += 1;
      if (attackViaOrderDisplay(publicQuestion).join('|') === correct.join('|')) k5bHits += 1;
      // K5a, made exact: not just "the full reconstruction failed", but that not one single public
      // token anywhere in the payload equals the old hash's prediction at any canonical index. The
      // random token space is enormous, so this should hold with virtual certainty, deterministically,
      // not merely within a statistical bound.
      const publicTokens = new Set((publicQuestion.steps ?? []).map((step) => step.token));
      for (let canonicalIndex = 0; canonicalIndex < n; canonicalIndex += 1) {
        if (publicTokens.has(oldStableToken(occurrence, canonicalIndex))) k5aTokenCollisions += 1;
      }
      totalDraws += 1;
      chanceExpectation += chancePerDraw;
    }
  });
  // Generous statistical bound (expected + 6 standard deviations under a binomial model), so this
  // never flakes on a fair coin, but 200-of-200 (the pre-fix rate) trips it by a wide margin.
  const std = Math.sqrt(chanceExpectation);
  const bound = Math.ceil(chanceExpectation + 6 * std + 3);
  t.diagnostic(`${totalDraws} draws; chance expectation ~${chanceExpectation.toFixed(2)}; bound ${bound}; K5a hits ${k5aHits}; K5b hits ${k5bHits}; K5a token collisions ${k5aTokenCollisions}`);
  assert.equal(totalDraws, 200);
  assert.equal(k5aTokenCollisions, 0, 'no public token may ever equal the old hash prediction, at any canonical index, in any draw');
  assert.ok(k5aHits <= bound, `K5a recovered ${k5aHits} of ${totalDraws}, above the chance bound of ${bound}`);
  assert.ok(k5bHits <= bound, `K5b recovered ${k5bHits} of ${totalDraws}, above the chance bound of ${bound}`);
});

test('RED control: restoring the old stableToken/orderDisplay derivation (the scramble the pre-fix code drew) recovers all 3 live order questions, proving the attacks above are real', () => {
  for (const question of liveOrderQuestions) {
    const occurrence = `control:${question.id}`;
    const leaky = leakyScrambleFor(occurrence, question);
    const { question: publicQuestion } = projectPublicQuestion(question, occurrence, 1, liveOrderQuestions.length, leaky);
    const correct = question.steps as string[];
    assert.equal(attackViaStableToken(publicQuestion).join('|'), correct.join('|'), `${question.id}: K5a must recover the old, leaky derivation`);
    assert.equal(attackViaOrderDisplay(publicQuestion).join('|'), correct.join('|'), `${question.id}: K5b must recover the old, leaky derivation`);
  }
});

test('the phone payload for an order question carries no field a reconstruction can map back to a position, per question (asserted on the real projection, not a field list)', (t) => {
  // A single draw of a 3-step question has a real 1-in-5 chance of a coincidental full match, so
  // this checks each live question on its own across many draws, against that same question's own
  // chance bound, rather than asserting a single draw never coincides (spec's stated finding was
  // 3-of-3 with the REAL, deterministic seed; a fair draw landing on the correct order once in a
  // while by chance is not a leak).
  for (const question of liveOrderQuestions) {
    const n = (question.steps ?? []).length;
    const chancePerDraw = chanceOfCoincidentalMatch(n);
    const draws = 60;
    const chanceExpectation = draws * chancePerDraw;
    const bound = Math.ceil(chanceExpectation + 6 * Math.sqrt(chanceExpectation) + 3);
    const correct = question.steps as string[];
    let k5aHits = 0;
    let k5bHits = 0;
    for (let draw = 0; draw < draws; draw += 1) {
      const { question: publicQuestion } = projectPublicQuestion(question, `no-map:${question.id}:${draw}`, 1, liveOrderQuestions.length);
      if (attackViaStableToken(publicQuestion).join('|') === correct.join('|')) k5aHits += 1;
      if (attackViaOrderDisplay(publicQuestion).join('|') === correct.join('|')) k5bHits += 1;
    }
    t.diagnostic(`${question.id} (${n} steps): ${draws} draws; chance ~${chanceExpectation.toFixed(2)}; bound ${bound}; K5a ${k5aHits}; K5b ${k5bHits}`);
    assert.ok(k5aHits <= bound, `${question.id}: K5a recovered ${k5aHits} of ${draws}, above the chance bound of ${bound}`);
    assert.ok(k5bHits <= bound, `${question.id}: K5b recovered ${k5bHits} of ${draws}, above the chance bound of ${bound}`);
  }
});

test('token shape: order tokens are lowercase alphanumeric, carry no "-", stay under 20 characters, and a full submitted choice stays well under the wire caps', () => {
  // Coordinator constraint (independent review of ACCOUNTS-SPEC.md): decodeChoice/encodeChoice
  // split a submitted choice on "-", and a submitted choice string is capped at 128 characters
  // (supabase/migrations/20260913170036_vax_or_fiction_production_relay.sql: `char_length
  // between 1 and 128` on `choice`). A token must fit inside both even at MAX_ORDER_STEPS.
  const IS_WIRE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  for (let stepCount = 2; stepCount <= MAX_ORDER_STEPS; stepCount += 1) {
    for (let draw = 0; draw < 20; draw += 1) {
      const scramble = randomOrderScramble(stepCount);
      assert.equal(scramble.tokens.length, stepCount);
      for (const token of scramble.tokens) {
        assert.match(token, ORDER_TOKEN_PATTERN, `token "${token}" must match the coordinator's [a-z0-9]{1,20} contract`);
        assert.doesNotMatch(token, /-/, 'decodeChoice/encodeChoice split a submitted choice on "-"');
        assert.ok(token.length <= 20, `token "${token}" exceeds the 20-character cap`);
        assert.match(token, IS_WIRE_ID, 'a token this shaped would also satisfy vof_relay.is_wire_id per-value, though nothing applies that check to it today');
      }
      const fullChoice = scramble.tokens.join('-');
      assert.ok(fullChoice.length <= 128, `a full ${stepCount}-step choice is ${fullChoice.length} characters, over the wire's 128-character cap`);
    }
  }
  // Exact numbers for the record (see projection.ts's comments): at MAX_ORDER_STEPS (6), a token
  // is 15 characters and a full joined choice is 6*15 + 5 = 95 characters.
  const maxScramble = randomOrderScramble(MAX_ORDER_STEPS);
  assert.equal(maxScramble.tokens[0]!.length, 15);
  assert.equal(maxScramble.tokens.join('-').length, 95);
});

test('reconnect keeps the tokens: a reload (the persist merge) restores the same scramble for the same occurrence', () => {
  const question = liveOrderQuestions.find((entry) => entry.id === 'q15')!;
  const merge = useGameStore.persist.getOptions().merge!;
  const initial = useGameStore.getInitialState();
  useGameStore.setState({ ...initial, sessionId: 'reconnect-test' } as never, true);
  useGameStore.getState().dispatch({ type: 'RESET_TO_LOBBY' as never });
  useGameStore.setState({
    sessionId: 'reconnect-test',
    run: [question as never],
    slideIndex: -1,
    phase: 'lobby',
  } as never);
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  const occurrence = getQuestionInstanceId(useGameStore.getState())!;
  const firstScramble = useGameStore.getState().orderScrambles[occurrence];
  assert.ok(firstScramble, 'the occurrence armed a scramble');

  const saved = useGameStore.getState();
  const restored = merge(saved, initial);
  assert.equal(getQuestionInstanceId(restored), occurrence, 'reload keeps the same occurrence id');
  assert.deepEqual(restored.orderScrambles[occurrence], firstScramble, 'reload keeps the exact same scramble, not a fresh one');
});

/**
 * BLOCKER (independent review of 8803dcb): projectPublicQuestion draws a fresh random scramble
 * whenever it is not handed one, and host-live-link.ts calls projectGameState twice for the same
 * occurrence -- publish() to encode, handleClientMessage() again to decode each vote. Before this
 * fix, three real paths could leave an order question's occurrence unarmed between those two
 * calls: CONFIRM_RESTART_RUN (no rearmQuestion), a solo round (which restarts through
 * CONFIRM_RESTART_RUN), and a host reload of a save made before orderScrambles existed. Each
 * test below proves it was RED on 8803dcb (a `git stash`-free before/after run against that exact
 * commit; see this file's report) and is GREEN now.
 */
function assertEncodeThenIndependentDecode(label: string, first: ReturnType<typeof projectGameState>, second: ReturnType<typeof projectGameState>, correctChoice: string) {
  const submitted = first.questionProjection?.encodeChoice(correctChoice);
  assert.ok(submitted, `${label}: projection 1 must encode the correct order into wire tokens`);
  const decoded = second.questionProjection?.decodeChoice(submitted!);
  assert.equal(decoded, correctChoice, `${label}: projection 2, an independent call on the same unchanged state, must still decode what projection 1 encoded`);
}

test('BLOCKER RED on 8803dcb: two independent projectGameState calls for the same ADVANCE-armed occurrence must agree (host-live-link.ts publish vs decode)', () => {
  const question = liveOrderQuestions[0]!;
  const initial = useGameStore.getInitialState();
  useGameStore.setState({ ...initial, run: [question as never], slideIndex: -1, phase: 'lobby', sessionId: 'advance-blocker' } as never, true);
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  const state = useGameStore.getState();
  const occurrence = getQuestionInstanceId(state)!;
  assert.ok(state.orderScrambles[occurrence], 'ADVANCE (via rearmQuestion) must arm a scramble');
  assertEncodeThenIndependentDecode('ADVANCE', projectGameState(state, 'ROOM', 1), projectGameState(state, 'ROOM', 2), rightToken(question));
});

test('BLOCKER RED on 8803dcb: CONFIRM_RESTART_RUN arms an order question landing at run[0]', () => {
  const question = liveOrderQuestions[1]!;
  const initial = useGameStore.getInitialState();
  useGameStore.setState({ ...initial, run: [question as never], slideIndex: -1, phase: 'lobby', sessionId: 'restart-blocker' } as never, true);
  useGameStore.getState().dispatch({ type: 'CONFIRM_RESTART_RUN' } as never);
  const state = useGameStore.getState();
  assert.equal(state.phase, 'entering', 'restart lands directly on the first question, with no intervening rearmQuestion call');
  const occurrence = getQuestionInstanceId(state)!;
  assert.ok(state.orderScrambles[occurrence], 'CONFIRM_RESTART_RUN must arm a scramble for run[0] itself');
  assertEncodeThenIndependentDecode('CONFIRM_RESTART_RUN', projectGameState(state, 'ROOM', 1), projectGameState(state, 'ROOM', 2), rightToken(question));
});

test('BLOCKER RED on 8803dcb: a host reload of a save made before orderScrambles existed arms one on the way out of merge', () => {
  const question = liveOrderQuestions[2]!;
  const merge = useGameStore.persist.getOptions().merge!;
  const initial = useGameStore.getInitialState();
  // A pre-8.6 save: every field partialize still writes today, present, with no orderScrambles
  // key at all (the field did not exist when this was written).
  const oldSave = {
    sessionId: 'old-save-blocker',
    run: [question],
    slideIndex: 0,
    phase: 'entering',
    votesLocked: false,
    pollVotes: {},
    pollVoters: {},
    seenDevices: {},
    settledQuestionInstances: {},
    settledResults: {},
  };
  const restored = merge(oldSave, initial);
  const occurrence = getQuestionInstanceId(restored)!;
  assert.ok(restored.orderScrambles[occurrence], 'a reload of a pre-8.6 save must arm a scramble on the way out of merge, not leave {}');
  assertEncodeThenIndependentDecode('old-save reload', projectGameState(restored, 'ROOM', 1), projectGameState(restored, 'ROOM', 2), rightToken(question));
});

test('BLOCKER RED on 8803dcb: a solo round starting on a live order question can record a vote (recordSoloVote)', () => {
  const question = liveOrderQuestions[0]!;
  isolateSoloStore();
  const pool: SoloPool = { id: 'blocker-solo-pool', questions: [question], sequence: [question.id] };
  const dealt = startSoloRound(pool, [question.id]);
  assert.deepEqual(dealt, [question.id], 'the round actually dealt the order question');
  const occurrence = getQuestionInstanceId(useGameStore.getState())!;
  assert.ok(useGameStore.getState().orderScrambles[occurrence], 'startSoloRound (via CONFIRM_RESTART_RUN) must arm a scramble');

  const view1 = projectSolo(useGameStore.getState(), 1);
  const correctChoice = rightToken(question);
  const submitted = view1.questionProjection?.encodeChoice(correctChoice);
  assert.ok(submitted, 'projection 1 must encode the correct order');

  const view2 = projectSolo(useGameStore.getState(), 2);
  assert.equal(recordSoloVote(view2, submitted!), true, 'a second, independent projection must still decode and accept the submitted order');
});

/**
 * WARNING 2 (independent review): the stage and the phones must show an armed order question in
 * the same order. Armed by a real ADVANCE, this compares the phone's actual wire payload against
 * a real render of OrderQuestion fed the exact same armed scramble Question.tsx would have
 * computed for it.
 *
 * OrderQuestion itself takes that scramble only as a plain `displayOrder` prop and is otherwise
 * store-free, so rendering it directly with the armed occurrence's real scramble.order is a
 * faithful stand-in for rendering `<Question>` -- with one caveat, recorded here rather than
 * silently assumed away: zustand's React binding (node_modules/zustand/esm/react.mjs) passes
 * `useSyncExternalStore` a getServerSnapshot of `selector(api.getInitialState())`, and React's
 * SSR path (renderToStaticMarkup, no `window`) always calls that server snapshot, never a live
 * mutation, by design (this is true for EVERY existing test in this repo that renders `<Question>`
 * via renderToStaticMarkup -- none of them depend on live store content, only on controlled
 * props). So renderToStaticMarkup cannot itself observe Question.tsx reading
 * storeOrderScrambles[storeQuestionInstanceId] correctly; that specific wiring is instead
 * confirmed below by reading Question.tsx's own source, the same pattern
 * question-stage-layout.test.ts already uses for source-level wiring guarantees.
 */
test('the stage and the phones show the same order (render parity)', () => {
  const question = liveOrderQuestions[0]!;
  const initial = useGameStore.getInitialState();
  useGameStore.setState({ ...initial, run: [question as never], slideIndex: -1, phase: 'lobby', sessionId: 'render-parity' } as never, true);
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  const state = useGameStore.getState();
  const occurrence = getQuestionInstanceId(state)!;
  const armedScramble = state.orderScrambles[occurrence];
  assert.ok(armedScramble, 'ADVANCE must arm a scramble for this occurrence');

  const html = renderToStaticMarkup(React.createElement(OrderQuestion, {
    question, displayOrder: armedScramble.order, showControls: false,
  }));
  const renderedTexts = [...html.matchAll(/class="order-bar__label"[^>]*>([^<]*)</g)].map((match) => match[1]);
  assert.ok(renderedTexts.length > 0, 'the stage actually rendered an order rail');

  const projected = projectGameState(state, 'ROOM', 1);
  const wireTexts = (projected.roomState.questionData?.steps ?? []).map((step) => step.text);
  assert.ok(wireTexts.length > 0, 'the wire actually carries order steps');

  assert.deepEqual(renderedTexts, wireTexts, 'the stage rail and the phone payload must show steps in the exact same order, given the same armed scramble');

  const questionScreenSource = readFileSync(resolve(import.meta.dirname, '../../src/screens/Question.tsx'), 'utf8');
  assert.match(
    questionScreenSource,
    /displayOrder=\{storeQuestionInstanceId \? storeOrderScrambles\[storeQuestionInstanceId\]\?\.order \?\? null : null\}/,
    'Question.tsx must pass OrderQuestion the store\'s own armed scramble, not compute a separate one',
  );
});

/**
 * A real end-to-end chain per WARNING 3: arm the occurrence, encode a submission against the
 * projection a phone would have received (projection 1), reload through the persist merge (so
 * the scramble must survive it), decode against an independent second projection (projection 2)
 * exactly as the relay does when a vote arrives, RECORD_VOTE, REVEAL, and check the room's own
 * settled truth -- not just evalAnswer in isolation.
 */
function runScoringChain(t: { diagnostic(message: string): void }, label: string, armedState: ReturnType<typeof useGameStore.getState>, question: Question) {
  const merge = useGameStore.persist.getOptions().merge!;
  const initial = useGameStore.getInitialState();
  const occurrenceBeforeReload = getQuestionInstanceId(armedState)!;
  const projection1 = projectGameState(armedState, 'ROOM', 1);

  const correctChoice = rightToken(question);
  const steps = question.steps as string[];
  const wrongChoice = steps.length >= 2
    ? [1, 0, ...steps.slice(2).map((_unused, index) => index + 2)].map((i) => String.fromCharCode(97 + i)).join('-')
    : correctChoice;
  assert.notEqual(wrongChoice, correctChoice, `${label}: fixture must exercise a genuinely wrong order`);

  for (const [choice, expectRight] of [[correctChoice, true], [wrongChoice, false]] as const) {
    const submitted = projection1.questionProjection!.encodeChoice(choice);
    assert.ok(submitted, `${label} ${choice}: projection 1 must encode this order`);

    // Reload between encode and decode, so the chain also proves the scramble survives a reload.
    useGameStore.setState(armedState, true);
    const restored = merge(useGameStore.getState(), initial);
    useGameStore.setState(restored, true);
    assert.equal(getQuestionInstanceId(useGameStore.getState()), occurrenceBeforeReload, `${label} ${choice}: reload keeps the same occurrence`);

    const projection2 = projectGameState(useGameStore.getState(), 'ROOM', 2);
    const decoded = projection2.questionProjection!.decodeChoice(submitted!);
    assert.ok(decoded, `${label} ${choice}: projection 2, after a reload, must still decode what projection 1 encoded`);

    useGameStore.getState().dispatch({ type: 'HELLO', deviceId: 'device-1', nickname: 'Tester', team: 'NAVY' } as never);
    useGameStore.getState().dispatch({ type: 'RECORD_VOTE', deviceId: 'device-1', choice: decoded, questionId: question.id } as never);
    useGameStore.getState().dispatch({ type: 'REVEAL' as never });

    const occurrence = getQuestionInstanceId(useGameStore.getState())!;
    const settled = useGameStore.getState().settledResults[occurrence]?.['device-1'];
    assert.ok(settled, `${label} ${choice}: a settled result was recorded`);
    assert.equal(settled!.isRight, expectRight, `${label} ${choice}: settled isRight`);
    assert.equal(evalAnswer(question, choice), expectRight, `${label} ${choice}: evalAnswer agrees`);
    assert.equal(settled!.score > 0, expectRight, `${label} ${choice}: only a right order scores points`);
    t.diagnostic(`${label} ${choice}: encoded ${submitted}, decoded ${decoded}, isRight ${settled!.isRight}`);
  }
}

test('scoring of a correct and a wrong submitted order is unchanged, on all 3 live order questions (full encode/reload/decode chain, armed by ADVANCE)', (t) => {
  const initial = useGameStore.getInitialState();
  for (const question of liveOrderQuestions) {
    useGameStore.setState({ ...initial, run: [question as never], slideIndex: -1, phase: 'lobby', sessionId: `scoring-advance-${question.id}` } as never, true);
    useGameStore.getState().dispatch({ type: 'ADVANCE' });
    runScoringChain(t, `${question.id} (ADVANCE)`, useGameStore.getState(), question);
  }
});

test('scoring survives the same chain when the occurrence is armed by CONFIRM_RESTART_RUN', (t) => {
  const question = liveOrderQuestions[1]!;
  const initial = useGameStore.getInitialState();
  useGameStore.setState({ ...initial, run: [question as never], slideIndex: -1, phase: 'lobby', sessionId: 'scoring-restart' } as never, true);
  useGameStore.getState().dispatch({ type: 'CONFIRM_RESTART_RUN' } as never);
  runScoringChain(t, `${question.id} (CONFIRM_RESTART_RUN)`, useGameStore.getState(), question);
});

test('scoring survives the same chain for a solo round: correct and wrong submitted orders, encoded from one projection, reloaded, then decoded from another', (t) => {
  const question = liveOrderQuestions[2]!;
  const correctChoice = rightToken(question);
  const steps = question.steps as string[];
  const wrongChoice = [1, 0, ...steps.slice(2).map((_unused, index) => index + 2)].map((i) => String.fromCharCode(97 + i)).join('-');
  assert.notEqual(wrongChoice, correctChoice, 'fixture must exercise a genuinely wrong order');

  for (const [choice, expectRight] of [[correctChoice, true], [wrongChoice, false]] as const) {
    isolateSoloStore();
    const pool: SoloPool = { id: `scoring-solo-pool-${choice}`, questions: [question], sequence: [question.id] };
    startSoloRound(pool, [question.id]);
    const occurrence = getQuestionInstanceId(useGameStore.getState())!;
    assert.ok(useGameStore.getState().orderScrambles[occurrence], `${choice}: the solo round armed a scramble`);
    const armedState = useGameStore.getState();

    const view1 = projectSolo(armedState, 1);
    const submitted = view1.questionProjection?.encodeChoice(choice);
    assert.ok(submitted, `${choice}: projection 1 must encode this order`);

    // Reload between encode and decode, same as the room chain above.
    const merge = useGameStore.persist.getOptions().merge!;
    const restored = merge(armedState, useGameStore.getInitialState());
    useGameStore.setState(restored, true);
    assert.equal(getQuestionInstanceId(useGameStore.getState()), occurrence, `${choice}: reload keeps the same occurrence`);

    const view2 = projectSolo(useGameStore.getState(), 2);
    assert.equal(recordSoloVote(view2, submitted!), true, `${choice}: projection 2, after a reload, must still decode and record what projection 1 encoded`);

    useGameStore.getState().dispatch({ type: 'REVEAL' as never });
    const settled = useGameStore.getState().settledResults[occurrence]?.[SOLO_DEVICE_ID];
    assert.ok(settled, `${choice}: a settled result was recorded for the solo player`);
    assert.equal(settled!.isRight, expectRight, `${choice}: settled isRight`);
    assert.equal(settled!.score > 0, expectRight, `${choice}: only a right order scores points`);
    t.diagnostic(`solo ${choice}: encoded ${submitted}, isRight ${settled!.isRight}`);
  }
});
