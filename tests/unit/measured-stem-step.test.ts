import assert from 'node:assert/strict';
import test from 'node:test';
import { STEM_CAPS, answerLadder } from '../../src/screens/questions/stage-fit.ts';
import { resolveMeasuredStemStep, STEM_STEP_ORDER, stepDownIsJustified, stepDownPastUnacceptableShape } from '../../src/screens/questions/measured-stem-step.ts';

// STAGE-SPEC pass 4c-1 (spec 4.2 step 2, brief item 2): "Add unit tests for the measurement path
// that go RED when the measurement is skipped." resolveMeasuredStemStep is the pure grow/shrink
// decision production now drives from a real DOM measurement instead of stage-fit.ts's own
// character-count estimate. Every case below hands it a fixture oracle (usedIfStemIs) that
// disagrees with the character-estimate first pass, so a regression that ever stops calling the
// oracle (falls back to firstPassStep outright, the "measurement skipped" case) fails these tests.

test('resolveMeasuredStemStep: grows a first-pass step the real measurement proves has room, past what the character estimate alone would have used', () => {
  const heights: Record<string, number> = { L: 900, M: 400, S: 300, XS: 250 };
  let calls = 0;
  const usedIfStemIs = (step: string) => { calls += 1; return heights[step]!; };
  const result = resolveMeasuredStemStep({ kind: 'estimate', firstPassStep: 'S', budget: 500, usedIfStemIs });
  assert.ok(calls > 0, 'the measurement oracle must actually be invoked, not skipped');
  assert.equal(result, 'M', 'the real measurement, not the character-estimate first pass, must win');
});

test('resolveMeasuredStemStep: never grows past the kind\'s own cap no matter how much room the real measurement reports', () => {
  const usedIfStemIs = () => 10; // always tiny: "fits" at every candidate step
  const result = resolveMeasuredStemStep({ kind: 'order', firstPassStep: 'XS', budget: 1000, usedIfStemIs });
  assert.equal(STEM_CAPS.order, 'S', 'test setup: order\'s own cap is S');
  assert.equal(result, 'S', 'order must never grow past its own cap, even with real, measured room to spare');
});

test('resolveMeasuredStemStep: shrinks a first-pass step the real measurement proves overflows, even though the character estimate believed it fit', () => {
  const heights: Record<string, number> = { L: 900, M: 700, S: 600, XS: 400 };
  const usedIfStemIs = (step: string) => heights[step]!;
  const result = resolveMeasuredStemStep({ kind: 'binary', firstPassStep: 'M', budget: 500, usedIfStemIs });
  assert.equal(result, 'XS', 'the real measurement must shrink past what the character estimate alone believed fit');
});

test('resolveMeasuredStemStep: at the floor (XS) it keeps the floor instead of clipping, even if XS itself still overflows', () => {
  const usedIfStemIs = () => 10000; // nothing ever fits
  const result = resolveMeasuredStemStep({ kind: 'myth-among-three', firstPassStep: 'M', budget: 500, usedIfStemIs });
  assert.equal(result, 'XS', 'step 5: keep the floor rather than shrink past the smallest step on the ladder');
});

test('resolveMeasuredStemStep: identical oracle input is deterministic (no hidden state between calls)', () => {
  const heights: Record<string, number> = { L: 550, M: 500, S: 480, XS: 450 };
  const usedIfStemIs = (step: string) => heights[step]!;
  const a = resolveMeasuredStemStep({ kind: 'estimate', firstPassStep: 'S', budget: 500, usedIfStemIs });
  const b = resolveMeasuredStemStep({ kind: 'estimate', firstPassStep: 'S', budget: 500, usedIfStemIs });
  assert.equal(a, b);
});

test('STEM_STEP_ORDER matches the ladder stage-fit.ts itself defines', () => {
  assert.deepEqual(STEM_STEP_ORDER, ['L', 'M', 'S', 'XS']);
});

// If a future edit made the measured path a no-op that just returns firstPassStep (the
// "measurement skipped" regression the brief names), every fixture above whose expected result
// differs from its own firstPassStep would go RED: 'S' -> 'M' (grow), 'M' -> 'XS' (shrink), and
// 'M' -> 'XS' (floor) all assert a step different from what was handed in.
test('resolveMeasuredStemStep: at least one case above must differ from its own firstPassStep, proving the oracle is load-bearing', () => {
  const grew = resolveMeasuredStemStep({ kind: 'estimate', firstPassStep: 'S', budget: 500, usedIfStemIs: (s) => ({ L: 900, M: 400, S: 300, XS: 250 } as Record<string, number>)[s]! });
  assert.notEqual(grew, 'S', 'a resolver that skipped measurement and simply returned firstPassStep would report S here, not M');
});

// STAGE-SPEC pass 4c-1b (brief item 4): the layout fallback for a line shape nothing but a smaller
// step can repair. Real cases from the bank: REPL-DRAFT-12's portrait binary stem ends on "interval."
// alone at L (36) with no safe join, and reads clean at M (30). REPL-PUB-13's square which-patient
// rail has two widowed labels at 30, and at 26 one of them reads clean.

test('stepDownPastUnacceptableShape: keeps a clean start without measuring any other step', () => {
  const asked: string[] = [];
  const result = stepDownPastUnacceptableShape(STEM_STEP_ORDER, 'M', (s) => { asked.push(s); return 0; });
  assert.equal(result, 'M');
  assert.deepEqual(asked, ['M'], 'a clean step never costs a smaller step its measurement');
});

test('stepDownPastUnacceptableShape: walks the stem down to the first clean step (REPL-DRAFT-12, portrait)', () => {
  assert.equal(stepDownPastUnacceptableShape(STEM_STEP_ORDER, 'L', (s) => (s === 'L' ? 1 : 0)), 'M');
  assert.equal(stepDownPastUnacceptableShape(STEM_STEP_ORDER, 'L', (s) => (s === 'L' || s === 'M' ? 1 : 0)), 'S', 'more than one step when the next one is still unacceptable');
});

test('stepDownPastUnacceptableShape: steps a rail down when it fixes some labels, not only all of them (REPL-PUB-13, square)', () => {
  const ladder = answerLadder('which-patient', 'square');
  assert.deepEqual(ladder, [30, 26], 'test setup: stage-fit.ts is the one source of this ladder');
  assert.equal(stepDownPastUnacceptableShape(ladder!, 30, (size) => (size === 30 ? 2 : 1)), 26, 'two widowed labels at 30, one at 26');
  assert.equal(stepDownPastUnacceptableShape(ladder!, 30, (size) => (size === 30 ? 1 : 0)), 26);
});

test('stepDownPastUnacceptableShape: returns the start when no smaller step does better (a smaller size that fixes nothing buys nothing)', () => {
  assert.equal(stepDownPastUnacceptableShape(STEM_STEP_ORDER, 'M', () => 1), 'M');
  assert.equal(stepDownPastUnacceptableShape([44, 36, 30, 26], 44, (size) => (size === 44 ? 1 : 2)), 44, 'a smaller step that makes it worse is never taken');
  assert.equal(stepDownPastUnacceptableShape([36, 32], 32, () => 1), 32, 'already at the ladder bottom (wide which-patient, 32 is the rendered floor at 1280)');
  assert.equal(stepDownPastUnacceptableShape([36, 32], 40, () => 1), 40, 'a start off the ladder is returned untouched');
});

test('stepDownPastUnacceptableShape: prefers the largest of several steps that tie on the fewest defects', () => {
  assert.equal(stepDownPastUnacceptableShape([52, 44, 36, 32], 52, (size) => ({ 52: 3, 44: 1, 36: 1, 32: 2 } as Record<number, number>)[size]!), 44);
});

test('answerLadder: binary has none, every other kind reads the spec 5.x ladders', () => {
  assert.equal(answerLadder('binary', 'widescreen'), null);
  assert.deepEqual(answerLadder('estimate', 'widescreen'), [52, 44, 36, 32]);
  assert.deepEqual(answerLadder('order', 'portrait'), [22.5]);
});

test('stepDownIsJustified: every step from the start down to the one above the current must be worse', () => {
  const ladder = [52, 44, 36, 32];
  const defects = (table: Record<number, number>) => (size: number) => table[size]!;
  assert.equal(stepDownIsJustified(ladder, 52, 52, defects({ 52: 3 })), true, 'not below the start at all');
  assert.equal(stepDownIsJustified(ladder, 52, 44, defects({ 52: 1, 44: 0 })), true);
  assert.equal(stepDownIsJustified(ladder, 52, 44, defects({ 52: 0, 44: 0 })), false, 'shrunk one step for nothing');
  assert.equal(stepDownIsJustified(ladder, 52, 36, defects({ 52: 0, 44: 2, 36: 1 })), false, 'shrunk two steps: the step just above is worse, but the start already read clean');
  assert.equal(stepDownIsJustified(ladder, 52, 36, defects({ 52: 2, 44: 2, 36: 1 })), true);
});

test('stepDownIsJustified: always true for whatever stepDownPastUnacceptableShape returns', () => {
  const ladder = [52, 44, 36, 32];
  const tables: Array<Record<number, number>> = [
    { 52: 0, 44: 0, 36: 0, 32: 0 }, { 52: 2, 44: 2, 36: 1, 32: 1 }, { 52: 3, 44: 1, 36: 2, 32: 0 },
    { 52: 1, 44: 1, 36: 1, 32: 1 }, { 52: 2, 44: 0, 36: 0, 32: 0 }, { 52: 4, 44: 3, 36: 2, 32: 1 },
  ];
  for (const table of tables) {
    const defectsAt = (size: number) => table[size]!;
    const chosen = stepDownPastUnacceptableShape(ladder, 52, defectsAt);
    assert.equal(stepDownIsJustified(ladder, 52, chosen, defectsAt), true, `${JSON.stringify(table)} chose ${chosen}`);
  }
});
