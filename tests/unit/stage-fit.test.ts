import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BUNDLED_DECKS } from '../../src/data/decks/index.ts';
import { questionKind } from '../../src/engine/kinds.ts';
import { CONTENT_ZONE_H, ESTIMATE_TIGHT_ROW_MIN, GROW_SAFETY_MARGIN, GROW_SAFETY_MARGIN_BY_KIND, STEM_CAPS, estimateTotalHeight, stageFit, stemSizeFor, stemSizeForStep, threeRowEstimate, type StageFitInput } from '../../src/screens/questions/stage-fit.ts';
import type { FormatId, Question, QuestionKind } from '../../src/data/types.ts';

// STAGE-SPEC step 7 (spec section 10 step 7): "Unit tests use the longest real bank question per
// kind." Walk every bundled deck's questions, group by kind, and keep the one whose stem is
// longest, so these tests exercise the real content the show ships, not invented fixtures.
const allQuestions: Question[] = BUNDLED_DECKS.flatMap((deck) => deck.questions);
assert.ok(allQuestions.length > 0, 'test setup: at least one bundled question exists');

const longestByKind = new Map<QuestionKind, Question>();
for (const q of allQuestions) {
  const kind = questionKind(q);
  const current = longestByKind.get(kind);
  const chars = (q.statement ?? '').length;
  if (!current || chars > (current.statement ?? '').length) longestByKind.set(kind, q);
}

function optionsFor(question: Question, kind: QuestionKind): { options: string[]; count: number } {
  if (kind === 'estimate') {
    const ranges = question.estimate?.ranges ?? [];
    return { options: ranges.map((r) => r.label), count: ranges.length || 1 };
  }
  if (kind === 'order') {
    const steps = question.steps ?? [];
    return { options: steps, count: steps.length || 1 };
  }
  if (kind === 'myth-among-three') {
    const statements = question.statements ?? [];
    return { options: statements, count: statements.length || 3 };
  }
  if (kind === 'which-patient') {
    const choices = question.choices ?? [];
    return { options: choices, count: choices.length || 2 };
  }
  return { options: [], count: 2 };
}

const FORMATS: FormatId[] = ['widescreen', 'square', 'portrait'];

test('stage-fit: every kind, every format, on the longest real bank question, returns a finite in-range result', () => {
  for (const [kind, question] of longestByKind) {
    for (const format of FORMATS) {
      const { options, count } = optionsFor(question, kind);
      const input: StageFitInput = { kind, format, stem: question.statement ?? '', scenario: question.scenario ?? null, options, count };
      const result = stageFit(input);
      assert.ok(['L', 'M', 'S', 'XS'].includes(result.stemStep), `${kind}/${format}: stemStep must be a real step, got ${result.stemStep}`);
      assert.ok(['regular', 'compact'].includes(result.density), `${kind}/${format}: density must be regular or compact`);
      const size = stemSizeForStep(format, result.stemStep);
      assert.ok(Number.isFinite(size) && size > 0, `${kind}/${format}: stem size must be a positive finite number`);
      if (kind === 'binary') {
        assert.equal(result.answerStep, null, 'binary has no answer ladder: its label is fixed by format');
      } else {
        assert.ok(Number.isFinite(result.answerStep) && (result.answerStep as number) > 0, `${kind}/${format}: answerStep must be a positive finite number`);
      }
    }
  }
});

test('stage-fit: identical input is deterministic (no measured-overflow dependency)', () => {
  const question = longestByKind.get('estimate')!;
  const { options, count } = optionsFor(question, 'estimate');
  const input: StageFitInput = { kind: 'estimate', format: 'widescreen', stem: question.statement ?? '', scenario: question.scenario ?? null, options, count };
  const a = stageFit(input);
  const b = stageFit(input);
  assert.deepEqual(a, b, 'same text length in, same layout out, every time');
});

test('stage-fit: a short stem with room to spare grows to the kind\'s own cap (2026-09-26 design call)', () => {
  const shortInput: StageFitInput = { kind: 'binary', format: 'widescreen', stem: 'True or false?', scenario: null, options: [], count: 2 };
  const result = stageFit(shortInput);
  assert.equal(result.stemStep, 'L', 'a short binary stem should grow all the way to binary\'s own cap (L)');
});

test('stage-fit: a very long stem steps down below its first-pass size instead of overflowing', () => {
  const longStem = 'A patient with a documented severe anaphylactic reaction to a prior dose, who is otherwise a good candidate for revaccination under a graded challenge protocol supervised by allergy and immunology, presents for counseling on the safest path forward today'.repeat(2);
  const input: StageFitInput = { kind: 'myth-among-three', format: 'portrait', stem: longStem, scenario: null, options: ['a', 'b', 'c'], count: 3 };
  const result = stageFit(input);
  assert.notEqual(result.stemStep, 'L', 'an extremely long stem must not stay at the largest step');
});

// STAGE-SPEC pass 4a (4A-8): the three tests above each land on their expected answer from the
// FIRST pass alone (`capStep` already clamps a short binary stem straight to its own cap, and a
// very long myth stem already first-passes below "L"), so all three still pass with the grow and
// shrink loops disabled entirely. These four cases are built so the loop itself is load-bearing:
// each assertion would flip if the corresponding loop never ran.

test('stage-fit: a stem that first-passes below its cap, with room to spare, grows up toward the cap (the grow loop must run)', () => {
  // A 150-char stem lands in the "S" bracket by length alone (121-200 chars, widescreen), well
  // below estimate's own "M" cap. With a short scenario-free, few-option rail, there is real room
  // left in the 604px content zone, so only the grow loop (not the first pass) can produce "M".
  const stem = 'A patient asks how many doses of the seasonal vaccine they should receive this year given their age and health history overall'.slice(0, 150);
  const input: StageFitInput = { kind: 'estimate', format: 'widescreen', stem, scenario: null, options: ['1', '2', '3'], count: 3 };
  const firstPassOnly = estimateTotalHeight(input, 'S', 44, 'regular') <= CONTENT_ZONE_H.widescreen - GROW_SAFETY_MARGIN;
  assert.ok(firstPassOnly, 'test setup: this stem must have real room to grow from S toward M, or the case proves nothing');
  const result = stageFit(input);
  assert.equal(result.stemStep, 'M', 'the grow loop must lift a first-pass "S" stem up to estimate\'s own cap when the zone has room');
});

test('stage-fit: a kind\'s cap is a ceiling even with an extremely short stem and empty room (the grow loop must stop at the cap, not merely run out of things to try)', () => {
  const input: StageFitInput = { kind: 'order', format: 'widescreen', stem: 'Order these.', scenario: null, options: ['a', 'b', 'c'], count: 3 };
  const result = stageFit(input);
  assert.equal(STEM_CAPS.order, 'S', 'test setup: order\'s own cap is S');
  assert.equal(result.stemStep, 'S', 'order must never grow past its own cap, no matter how much room the zone has left');
});

test('stage-fit: a stem that still overflows at every floor keeps the floors instead of clipping (step 5)', () => {
  const longStem = 'A patient with a documented severe anaphylactic reaction to a prior dose, who is otherwise a good candidate for revaccination under a graded challenge protocol supervised by allergy and immunology, presents for counseling on the safest path forward today, weighing the graded-challenge protocol against deferral, against a formal allergy referral, and against outright avoidance for the remainder of this immunization season'.repeat(2);
  const longOptions = Array.from({ length: 4 }, (_, i) => `Statement number ${i + 1}, written long enough on its own that even a compact, floor-sized card still needs several wrapped lines to hold it inside a narrow portrait column.`);
  const input: StageFitInput = { kind: 'myth-among-three', format: 'portrait', stem: longStem, scenario: null, options: longOptions, count: 3 };
  const result = stageFit(input);
  assert.equal(result.density, 'compact', 'a genuinely unfit question must reach compact density, not stop early');
  const finalHeight = estimateTotalHeight(input, result.stemStep, result.answerStep, result.density);
  assert.ok(finalHeight > CONTENT_ZONE_H.portrait, `test setup: this input must still overflow at the floor, or step 5 was never actually reached (estimated ${finalHeight} of ${CONTENT_ZONE_H.portrait})`);
});

test('stage-fit: GROW_SAFETY_MARGIN_BY_KIND blocks a grow step that fits only by a thin margin', () => {
  // Every longest-real-question case, across every kind and format, must obey the same invariant
  // the grow loop itself enforces: whenever the chosen step is below the kind's own cap, growing
  // one step further must miss the zone by less than that kind's own margin once the margin is
  // removed (fits the zone outright) or fail to fit at all, proving the margin, not luck, is what
  // stopped it. STAGE-SPEC pass 4b: the margin is now per kind (see the export's own comment), so
  // this checks each kind against its own pinned value, not the single flat number pass 4a pinned.
  for (const [kind, question] of longestByKind) {
    for (const format of FORMATS) {
      const { options, count } = optionsFor(question, kind);
      const input: StageFitInput = { kind, format, stem: question.statement ?? '', scenario: question.scenario ?? null, options, count };
      const result = stageFit(input);
      const cap = STEM_CAPS[kind];
      if (result.stemStep !== cap) {
        const order: Array<'L' | 'M' | 'S' | 'XS'> = ['L', 'M', 'S', 'XS'];
        const biggerStem = order[order.indexOf(result.stemStep) - 1];
        if (biggerStem) {
          const heightAtBigger = estimateTotalHeight(input, biggerStem, result.answerStep, result.density);
          const wouldHaveFitWithMargin = heightAtBigger <= CONTENT_ZONE_H[format] - GROW_SAFETY_MARGIN_BY_KIND[kind];
          assert.equal(wouldHaveFitWithMargin, false, `${kind}/${format}: stopped growing below cap at ${result.stemStep}, but the next step up (${biggerStem}) still clears its own safety margin, so the margin should not have stopped it`);
        }
      }
    }
  }
});

test('stage-fit: which-patient with many long options prefers compact density or a smaller answer step over overflow', () => {
  const question = longestByKind.get('which-patient');
  if (!question) return; // no which-patient content in the bundled bank; nothing to assert
  const longOptions = [
    'This is a long spoken reply that a patient might actually say in the room, running well past a single short line of text on any format.',
    'A second long spoken reply, also written to run past one line so the rail has to make room for every card in the row without collapsing.',
    'A third long spoken reply of similar length, so the odd-card-centered layout and the two-column grid both have real content to budget.',
    'A fourth long spoken reply, again long, to exercise the four-answer 2x2 grid at its worst case for line wrapping and total rail height.',
  ];
  const input: StageFitInput = { kind: 'which-patient', format: 'widescreen', stem: question.statement ?? 'Which patient is the best candidate?', scenario: question.scenario ?? null, options: longOptions, count: 4 };
  const result = stageFit(input);
  assert.ok(result.density === 'compact' || result.answerStep === 32, 'long which-patient answers should compact or step down rather than overflow silently');
});

// STAGE-SPEC pass 4b (4B-C4, coordinator review of pass 4a): three real mutations the tests above
// never caught, each added as its own test that must go RED on the named mutation, verified RED
// then restored before landing (per this pass's own proof requirement).

test('stage-fit: GROW_SAFETY_MARGIN really gates growth, checked against an independent literal (not the export itself)', () => {
  // The margin test already in this file recomputes its own expectation FROM GROW_SAFETY_MARGIN,
  // so a regression that changes the export to 0 could never fail it: the test would just grade
  // against the same broken number. This asserts against an independent literal instead. Pass 4b
  // recalibrated the pinned margin from the spec's original 60 to 80 (stage-fit.ts's own comment
  // above GROW_SAFETY_MARGIN has the measured evidence), so 80 is the current pinned value this
  // guards; a silent change back to 60, or to 0, still fails it either way.
  const INDEPENDENT_MARGIN_LITERAL = 80;
  assert.equal(GROW_SAFETY_MARGIN, INDEPENDENT_MARGIN_LITERAL, 'the pinned safety margin must still be the pass 4b-recalibrated 80, not silently changed (would go RED if GROW_SAFETY_MARGIN were set to 0 or reverted to 60)');
});

test('stage-fit: GROW_SAFETY_MARGIN_BY_KIND is pinned at 80 for every kind, checked against independent literals', () => {
  // STAGE-SPEC pass 4b (4B-SWEEP): a per-kind table was tried (binary 40, order 15) and reverted
  // after a real committed render proved it unsafe (REPL-CAND-05 grew to "L" and measured a real
  // `stage-over-budget` of 621.1 of 604; the export's own comment has the full evidence). Every
  // kind is pinned back to 80 here so a later re-attempt at lowering any one of them is a visible,
  // deliberate edit this test forces past, not a silent drift.
  const INDEPENDENT: Record<QuestionKind, number> = { binary: 80, order: 80, estimate: 80, 'myth-among-three': 80, 'which-patient': 80 };
  for (const kind of Object.keys(INDEPENDENT) as QuestionKind[]) {
    assert.equal(GROW_SAFETY_MARGIN_BY_KIND[kind], INDEPENDENT[kind], `${kind}'s own pinned grow safety margin must not silently drift`);
  }
});

test('stage-fit: the shrink loop takes one step per role per pass, not exhaust-stem-then-answer (4A-10 regression)', () => {
  // A crafted myth-among-three/widescreen case (found by direct search against estimateTotalHeight
  // at this file's own commit): first pass lands at stem M (myth's own cap) and answer 36. Neither
  // alone fits (M/36 estimates 691.4 of 604). Shrinking the stem one step to S still does not fit
  // (662.6). The one-step-per-role interleave then tries the ANSWER role next: S/32 fits (497.6),
  // so it stops there. An exhaust-stem-first order would instead keep shrinking the stem all the
  // way to XS before ever trying the answer role, and XS/36 also fits (600.2), so that order would
  // stop at XS/36 instead, a different, wrong answer for identical input.
  const repeatTo = (base: string, n: number) => {
    let s = '';
    while (s.length < n) s += base;
    return s.slice(0, n);
  };
  const stem = repeatTo('Which of these three statements about vaccination is the one true statement here ', 61);
  const option = repeatTo('This is a long statement about vaccines and immunization schedules for patients seen ', 127);
  const input: StageFitInput = { kind: 'myth-among-three', format: 'widescreen', stem, scenario: null, options: [option, option, option], count: 3 };
  const atM36 = estimateTotalHeight(input, 'M', 36, 'regular');
  const atMS36 = estimateTotalHeight(input, 'S', 36, 'regular');
  const atMS32 = estimateTotalHeight(input, 'S', 32, 'regular');
  const atXS36 = estimateTotalHeight(input, 'XS', 36, 'regular');
  assert.ok(atM36 > CONTENT_ZONE_H.widescreen, 'test setup: first pass (M/36) must overflow');
  assert.ok(atMS36 > CONTENT_ZONE_H.widescreen, 'test setup: one stem step down (S/36) must still overflow');
  assert.ok(atMS32 <= CONTENT_ZONE_H.widescreen, 'test setup: stem down once AND answer down once (S/32) must fit');
  assert.ok(atXS36 <= CONTENT_ZONE_H.widescreen, 'test setup: exhausting the stem alone to XS (XS/36) must ALSO fit, so the two orders would genuinely disagree');
  const result = stageFit(input);
  assert.equal(result.stemStep, 'S', 'the interleaved order shrinks stem exactly one step before trying the answer role');
  assert.equal(result.answerStep, 32, 'the interleaved order reaches the answer role after one stem step, not after exhausting the stem to XS');
});

test('stage-fit: estimate\'s below-tally and note rows reserve production\'s real numbers, not a guessed constant (4A-9 / 4B-C5 regression)', () => {
  // Isolates the tally-row-plus-note-row addition by diffing tallyReserved true vs false on the
  // same otherwise-fixed input. Scoped to square and portrait, where the tally is never "beside"
  // (widescreen's beside placement also changes the card's own text width, which would contaminate
  // a clean diff). A long option forces enough wrapped lines that the linear term, not row-min or
  // 2x the answer size, decides the card height in both the reserved and unreserved case, so the
  // diff is exactly the reservation math and nothing else.
  const longOption = 'A very long range label written to force several wrapped lines regardless of any reservation, so the diff below isolates only the reserved rows themselves and nothing about line count changing between the two calls being compared here';
  for (const [format, expectedDelta] of [['square', 70 + 4 + 26 * 1.2], ['portrait', 38 + 4 + 14 * 1.2]] as const) {
    // count: 1 on both formats, so `rowsForKind` never multiplies the per-card reservation (square
    // would otherwise fold 2 options into 1 row, portrait's own one-column rail into 2 rows, which
    // would scale the diff by row count and contaminate the isolation this test relies on).
    const input: StageFitInput = { kind: 'estimate', format: format as FormatId, stem: 'x', scenario: null, options: [longOption], count: 1 };
    const withReservation = estimateTotalHeight({ ...input, tallyReserved: true }, 'M', 32, 'regular');
    const without = estimateTotalHeight({ ...input, tallyReserved: false }, 'M', 32, 'regular');
    const delta = withReservation - without;
    assert.ok(Math.abs(delta - expectedDelta) < 0.5, `${format}: reserved-vs-unreserved delta must be the real production math (${expectedDelta}), got ${delta}`);
  }
});

// VOF-96 (F2, the owner's 2026-10-02 pick): a true or false question on the square canvas takes a 72 stem and binary card
// padding of 48, square binary only. The CSS paints it (question-stage.css) and looks-options.test.mjs reads the rendered
// sizes, so these hold the one table the fit, the measured step and the layout checks all read.
const STEPS = ['L', 'M', 'S', 'XS'] as const;

test('VOF-96 (F2): a square true or false stem takes 72 at its largest step and 56 below it, and nothing else moves', () => {
  assert.deepEqual(STEPS.map((step) => stemSizeFor('binary', 'square', step)), [72, 56, 36, 30], 'square binary: 72, then 56, then the square ladder as it was');
  assert.deepEqual(STEPS.map((step) => stemSizeFor('binary', 'widescreen', step)), [72, 56, 44, 36], 'wide binary is unchanged');
  assert.deepEqual(STEPS.map((step) => stemSizeFor('binary', 'portrait', step)), [36, 30, 30, 30], 'portrait binary is unchanged');
  for (const kind of ['myth-among-three', 'estimate', 'order', 'which-patient'] as const) {
    assert.deepEqual(STEPS.map((step) => stemSizeFor(kind, 'square', step)), [56, 44, 36, 30], `square ${kind} is unchanged`);
    assert.deepEqual(STEPS.map((step) => stemSizeFor(kind, 'widescreen', step)), [72, 56, 44, 36], `wide ${kind} is unchanged`);
  }
  assert.equal(stemSizeForStep('square', 'L', 'binary'), 72, 'a caller that passes the kind gets the square binary size');
  assert.equal(stemSizeForStep('square', 'L'), 56, 'a caller that does not still reads the format table');
});

test('VOF-96 (F2): the fit budgets the square binary cards 64 px taller, for their 48 px of block padding', () => {
  const stem = 'True?';
  const square = estimateTotalHeight({ kind: 'binary', format: 'square', stem, scenario: null, options: [], count: 2 }, 'L', null, 'regular');
  const wide = estimateTotalHeight({ kind: 'binary', format: 'widescreen', stem, scenario: null, options: [], count: 2 }, 'L', null, 'regular');
  // The same one-line stem at 72 on both canvases, so the difference is the cards alone.
  assert.equal(square - wide, 64, `square binary cards are 2 x (48 - 16) px taller (${square} against ${wide})`);
});

test('VOF-96 (F2): no true or false question in the bank lands under today\'s 56 on the square canvas, and a short one gets 72', () => {
  const binary = allQuestions.filter((q) => questionKind(q) === 'binary');
  assert.ok(binary.length > 10, `fixture assumption: the bank has true or false questions (${binary.length})`);
  const sizes = binary.map((q) => {
    const result = stageFit({ kind: 'binary', format: 'square', stem: q.statement ?? '', scenario: null, options: [], count: 2 });
    return { id: q.id, chars: (q.statement ?? '').length, size: stemSizeFor('binary', 'square', result.stemStep) };
  });
  const under = sizes.filter((entry) => entry.size < 56);
  assert.deepEqual(under, [], 'every square true or false stem is 56 or larger by the fit');
  const short = sizes.find((entry) => entry.chars <= 60);
  assert.ok(short, 'fixture assumption: the bank has a short true or false question');
  assert.equal(short!.size, 72, `${short!.id}: a short square true or false stem is 72`);
});

// VOF-98 (the owner's pick of 2026-10-05): an estimate with five or more ranges lays them out in three rows on the wide stage
// and takes tighter cards, so the ask keeps its 56 over the 52 px ranges. The rendered sizes are read in every look by
// tests/integration/looks-options.test.mjs.
test('VOF-98: three rows of ranges on the wide stage take the tighter cards, and nothing else does', () => {
  const q33 = allQuestions.find((q) => q.id === 'q33')!;
  assert.ok(q33 && (q33.estimate?.ranges ?? []).length === 5, 'fixture assumption: q33 is an estimate with five ranges');
  const ranges = (q33.estimate?.ranges ?? []).map((r) => r.label);
  const fit = (format: FormatId, count: number) => stageFit({ kind: 'estimate', format, stem: q33.statement ?? '', scenario: null, options: ranges.slice(0, count), count });
  assert.equal(fit('widescreen', 5).density, 'compact', 'five ranges on the wide stage');
  assert.equal(fit('widescreen', 4).density, 'regular', 'four ranges keep two rows of today\'s cards');
  assert.equal(fit('square', 5).density, 'regular', 'the square canvas keeps its cards');
  assert.equal(fit('portrait', 5).density, 'regular', 'and so does portrait');
  assert.ok(threeRowEstimate('estimate', 'widescreen', 6), 'six ranges make three rows too');
  for (const kind of ['binary', 'myth-among-three', 'order', 'which-patient'] as const) {
    assert.equal(threeRowEstimate(kind, 'widescreen', 5), false, `${kind} is not an estimate`);
  }
  const result = fit('widescreen', 5);
  assert.equal(result.stemStep, 'M', 'the fit holds q33 at its cap');
  assert.equal(stemSizeFor('estimate', 'widescreen', result.stemStep), 56);
  assert.equal(result.answerStep, 52, 'over 52 px ranges');
});

test('VOF-98: the fit budgets the tight cards at 112 px, the same row the stylesheet paints', () => {
  const tight = estimateTotalHeight({ kind: 'estimate', format: 'widescreen', stem: 'x', scenario: null, options: ['0-20%'], count: 5, tallyReserved: false }, 'M', 26, 'compact');
  // A short one-line label at 26 px is under the row, so each of the three rows is the row itself.
  assert.ok(Math.abs(tight - (1.2 * 56 + 24 + 3 * ESTIMATE_TIGHT_ROW_MIN + 2 * 8)) < 0.01, `three rows of ${ESTIMATE_TIGHT_ROW_MIN} px and two 8 px gaps (${tight})`);
  const css = fs.readFileSync(new URL('../../src/styles/question-stage.css', import.meta.url), 'utf8');
  const painted = Number((css.match(/\[data-kind='estimate'\]\[data-cards='tight'\] \{\s*--stage-row-min: (\d+)px;/) ?? [])[1]);
  assert.equal(painted, ESTIMATE_TIGHT_ROW_MIN, 'question-stage.css paints the row the fit budgets');
});

