import test from 'node:test';
import assert from 'node:assert/strict';

import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { flagshipDeck } from '../../src/data/decks/flagship';
import { flagshipPolishDeck } from '../../src/data/decks/topics/flagship-r2';
import { DEFAULT_DECK_ID, defaultModeId, offeredModes, resolveBundledDeck } from '../../src/data/decks';
import { OfflineProvider } from '../../src/data/providers/OfflineProvider';
import { asksForReply, questionKind, validateKindFields } from '../../src/engine/kinds';
import type { Question } from '../../src/data/types';

const deck = vaxOrFictionDeck;

test('the show deck carries the 36 reviewed questions with the authored kind histogram', () => {
  assert.equal(deck.id, 'vax-or-fiction');
  assert.equal(deck.questions.length, 36);
  const histogram: Record<string, number> = {};
  for (const question of deck.questions) {
    assert.equal(typeof question.kind, 'string', `${question.id} kind is normalized (never omitted)`);
    histogram[question.kind!] = (histogram[question.kind!] ?? 0) + 1;
  }
  assert.deepEqual(histogram, { binary: 18, 'myth-among-three': 3, estimate: 5, order: 3, 'which-patient': 7 });
  assert.deepEqual(deck.questions.map((question) => question.id), Array.from({ length: 36 }, (_, index) => `q${index + 1}`));
});

test('every source, image id, and layout reference resolves', () => {
  const citationIds = new Set((deck.citations ?? []).map((citation) => citation.id));
  const plateIds = new Set(deck.imageRequirements.map((requirement) => requirement.id));
  assert.equal(citationIds.size, 46);
  for (const question of deck.questions) {
    assert.ok(question.sourceIds && question.sourceIds.length > 0, `${question.id} carries sources`);
    for (const id of question.sourceIds ?? []) assert.ok(citationIds.has(id), `${question.id} source ${id} is embedded`);
    assert.ok(plateIds.has(question.imageRequirementId ?? ''), `${question.id} plate ${question.imageRequirementId} is declared`);
    assert.ok(question.layoutFamily, `${question.id} has a layout family`);
  }
  for (const slide of [...deck.staticSlides, ...deck.focuses]) {
    if (slide.imageRequirementId) assert.ok(plateIds.has(slide.imageRequirementId), `${slide.id} image id is declared`);
  }
});

test('each kind carries its required fields and a binary answer only where authored', () => {
  for (const question of deck.questions) {
    const kind = questionKind(question);
    assert.doesNotThrow(() => validateKindFields(question as Question, kind), `${question.id} passes the ${kind} field contract`);
    if (kind === 'binary') {
      assert.equal(typeof question.answer, 'boolean', `${question.id} binary answer`);
      assert.equal(typeof question.statement, 'string');
    } else {
      assert.equal(question.answer, undefined, `${question.id} (${kind}) carries no binary answer`);
    }
    if (kind === 'myth-among-three') {
      assert.equal(question.statements?.length, 3);
      assert.ok([0, 1, 2].includes(question.mythIndex as number));
    }
    if (kind === 'estimate') {
      assert.ok(Number.isFinite(question.estimate?.value));
      assert.ok((question.estimate?.ranges?.length ?? 0) >= 3);
    }
    if (kind === 'order') assert.ok((question.steps?.length ?? 0) >= 3);
    if (kind === 'which-patient') {
      assert.equal(typeof question.scenario, 'string');
      assert.ok((question.choices?.length ?? 0) >= 2);
      assert.ok(Number.isInteger(question.bestIndex));
    }
    assert.ok(typeof question.reveal === 'string' && question.reveal.length > 0, `${question.id} reveal`);
  }
});

test('modes: the deck still carries Curated 15, the Quick demo, full, and lightning; the retired curated list stays out; q11 stays held', () => {
  assert.deepEqual(deck.modeOrder, ['curated15', 'demo', 'full', 'lightning']);
  assert.equal(defaultModeId(deck), 'curated15');
  const offered = offeredModes(deck).map((mode) => mode.id);
  assert.ok(!offered.includes('curated'), 'the retired curated mode is never offered');
  assert.ok(offered.includes('curated15'), 'Curated 15 is offered');
  // 2026-09-14, design critique item 12 (approved "just do it all"; supersedes the 08:19 list of VOF-33): three
  // movements of four — the ones that surprise you (q4 q19 q5 q33), at the counter (q21 q22 q30 q16), myths and the
  // close (q25 q18 q29 q15) — so the run ends on the order board. q7 and q31 are out (their answers were on the
  // slide before q22/q16), q11 stays held, q26/q32 stay out (VOF-32). The critique offered q17 or q18 for the
  // binary in movement three; q18 (egg allergy) runs because q17's 132-character stem overflows the revealed
  // statement card on stage (the stem runs under the ANSWER badge and the TRUE bar), and q18's 103 fit.
  assert.deepEqual(deck.modes.demo, {
    id: 'demo',
    label: 'Quick demo',
    questionIds: ['q4', 'q19', 'q5', 'q33', 'q21', 'q22', 'q30', 'q16', 'q25', 'q18', 'q29', 'q15'],
    timerSeconds: 20,
    runtimeLabel: '12–18 min',
    timerEnabledByDefault: false,
  });
  const demoKinds = deck.modes.demo!.questionIds.map((id) => questionKind(deck.questions.find((question) => question.id === id)));
  assert.deepEqual(
    demoKinds,
    ['binary', 'estimate', 'binary', 'estimate', 'which-patient', 'which-patient', 'which-patient', 'which-patient', 'myth-among-three', 'binary', 'which-patient', 'order'],
  );
  const demoHistogram: Record<string, number> = {};
  for (const kind of demoKinds) demoHistogram[kind] = (demoHistogram[kind] ?? 0) + 1;
  assert.deepEqual(demoHistogram, { 'which-patient': 5, binary: 3, estimate: 2, 'myth-among-three': 1, order: 1 });
  const byId = (id: string) => deck.questions.find((question) => question.id === id)!;
  assert.equal(asksForReply(byId('q16')), true, 'the demo carries one which-reply beat (q16)');
  assert.equal(deck.modes.demo!.questionIds.at(-1), 'q15', 'the demo closes on the order board');
  // VOF-74 (content fix batch 2, vof-q15): the field-rewrite table moves this pin on purpose.
  assert.equal(byId('q15').takeaway, 'Assess. Recommend and listen. Act. Document.');
  for (const id of ['q26', 'q32']) assert.ok(!deck.modes.demo!.questionIds.includes(id), `${id} ("October in Ohio") stays out of the demo (VOF-32)`);
  // item 12: q30 runs with three live options; the dropped straw man is gone and the best choice still resolves.
  // VOF-74 (content fix batch 1, C-q30, plus the verifier's flu-restore note): the field-rewrite table moves this
  // pin on purpose.
  assert.deepEqual(byId('q30').choices, [
    'Another age-appropriate flu vaccine after screening.',
    'A preferred vaccine at a later visit.',
    'Two standard-dose vaccines at this visit.',
  ]);
  assert.equal(byId('q30').bestIndex, 0);
  assert.deepEqual(deck.modes.curated15, {
    id: 'curated15',
    label: 'Curated 15',
    questionIds: ['q4', 'q19', 'q5', 'q33', 'q21', 'q22', 'q30', 'q16', 'q10', 'q8', 'q2', 'q25', 'q18', 'q31', 'q15'],
    timerSeconds: 20,
    runtimeLabel: '15–22 min',
    timerEnabledByDefault: false,
  });
  const curated15Kinds = deck.modes.curated15!.questionIds.map((id) => questionKind(deck.questions.find((question) => question.id === id)));
  assert.deepEqual(
    curated15Kinds,
    ['binary', 'estimate', 'binary', 'estimate', 'which-patient', 'which-patient', 'which-patient', 'which-patient', 'binary', 'binary', 'binary', 'myth-among-three', 'binary', 'which-patient', 'order'],
  );
  assert.equal(deck.modes.curated15!.questionIds.length, 15);
  assert.equal(deck.modes.curated15!.questionIds.at(-1), 'q15', 'Curated 15 closes on the order board');
  assert.deepEqual(
    deck.modes.curated15!.questionIds.slice(0, 8),
    deck.modes.demo!.questionIds.slice(0, 8),
    'Curated 15 keeps the demo surprise and counter movements',
  );
  assert.deepEqual(
    deck.modes.curated15!.questionIds.slice(8, 11),
    ['q10', 'q8', 'q2'],
    'Curated 15 partner movement is Heplisav-B, Tdap in pregnancy, and flu heart-attack risk',
  );
  assert.deepEqual(
    deck.modes.curated15!.questionIds.slice(-4),
    ['q25', 'q18', 'q31', 'q15'],
    'Curated 15 closes on myth, egg allergy, wound/tetanus, then the order board',
  );
  for (const id of ['q11', 'q12', 'q17', 'q20', 'q26', 'q29', 'q32']) {
    assert.ok(!deck.modes.curated15!.questionIds.includes(id), `Curated 15 leaves ${id} out`);
  }
  assert.equal(deck.modes.full?.questionIds.length, 35);
  assert.equal(deck.modes.lightning?.questionIds.length, 8);
  // VOF-74 (content fix batch 2, vof-q11): the hold is released, its evidence re-checked and confirmed. It was
  // never authored into any mode's questionIds (including demo, per VOF-37), so releasing the hold changes no
  // mode membership, only the heldQuestionIds flag and the reveal text.
  assert.equal(deck.heldQuestionIds, undefined);
  assert.ok(!deck.modes.demo.questionIds.includes('q11'), 'q11 stays out of the demo (VOF-37)');
  assert.ok(!deck.modes.demo.questionIds.includes('q17'), 'q17 is out of the demo: its stem overflows the revealed card on stage');
  for (const mode of Object.values(deck.modes)) {
    for (const id of mode.questionIds) assert.ok(deck.questions.some((question) => question.id === id), `${mode.id} references ${id}`);
  }
  const q11 = deck.questions.find((question) => question.id === 'q11')!;
  assert.equal(q11.reveal, 'Dose two usually comes 2 to 6 months after dose one. If more than 6 months have passed, give it as soon as possible and do not restart the series.', 'q11 ships the released, evidence-checked reveal');
  const fullKinds = deck.modes.full!.questionIds.map((id) => questionKind(deck.questions.find((question) => question.id === id)));
  assert.ok(fullKinds.every((kind, index) => index === 0 || kind !== fullKinds[index - 1]), 'full sequence avoids adjacent matching kinds');
});

test('item 13: the two estimates ask a human question and reveal a usable line (numbers, ranges and sources unchanged)', () => {
  const byId = (id: string) => deck.questions.find((question) => question.id === id)!;
  const q33 = byId('q33');
  const q34 = byId('q34');
  // VOF-74 (content fix batch 1, C-q33): the field-rewrite table moves this pin on purpose.
  assert.equal(q33.statement, 'In the 2024–25 U.S. flu season, what share of flu deaths were in adults 65 or older?');
  assert.equal(q33.reveal, 'CDC’s preliminary estimate: 71%, or about seven in ten.');
  assert.equal(q33.takeaway, 'Share of deaths is not a person’s chance of dying.', 'the authored takeaway stays (final review: the rewrite changed the lesson)');
  assert.match(q33.presenterNote ?? '', /Share of deaths is not a person’s chance of dying\./, 'the methods caveat moved to the presenter note');
  assert.equal(q33.estimate?.value, 71);
  assert.equal(q34.statement, 'In its first season, how well did the RSV vaccine keep adults 60 and older out of the hospital?');
  // VOF-W6 (2026-09-27, evidence review against current CDC pages): the live reveal and takeaway dropped the
  // population and season the discussion prompt itself warns about. This pins the batch-2.json A-E10-q34
  // replacement, tidied so the presenter note does not repeat the takeaway sentence twice and reworded off en
  // dashes.
  assert.equal(q34.reveal, 'Vaccinated adults 60 and older without immune compromise were about 80% less likely to land in the hospital with RSV that first season.');
  assert.equal(q34.takeaway, 'Name the population, outcome and season with the number.');
  assert.equal(
    q34.presenterNote,
    'Estimated effectiveness 80% (95% CI, 71 to 85) against RSV hospitalization in adults 60+ without immune compromise. This comes from a VISION test-negative observational analysis in eight states, October 2023 to March 2024. It is not a claim about every infection or later seasons. It is not an eligibility rule either. CDC now recommends one dose for all adults 75 and older and for adults 50 to 74 at increased risk.',
  );
  assert.equal((q34.presenterNote?.match(/Name the population, outcome and season with the number\./g) ?? []).length, 0, 'the presenter note does not repeat the takeaway sentence');
  assert.equal(q34.estimate?.value, 80);
  for (const question of [q33, q34]) {
    assert.doesNotMatch(question.statement ?? '', /^CDC|VISION|report/, `${question.id} stem does not open with a citation`);
    assert.doesNotMatch(question.reveal ?? '', /\bCI\b|confidence interval/, `${question.id} reveal carries no interval on the audience canvas`);
    assert.deepEqual(question.sourceIds, byId(question.id).sourceIds);
  }
});

test('VOF-W6 (2026-09-27): q2, flagship q3 and flagship-r2 q3 no longer say flu infection itself protects the heart', () => {
  // Live read "Flu is heart protection, too.", which said the infection protects the heart. The fix is a
  // single switch between two corrected wordings, defaulting to the vaccine-framing one; this pins the default and
  // proves the withdrawn alternate never ships alongside it. flagship-r2's q3 (the polish deck solo play's
  // flagship-r2 topic deals) carries the identical live line and took the coordinator's follow-up fix.
  const q2 = deck.questions.find((question) => question.id === 'q2')!;
  const flagshipQ3 = flagshipDeck.questions.find((question) => question.id === 'q3')!;
  const polishQ3 = flagshipPolishDeck.questions.find((question) => question.id === 'q3')!;
  assert.equal(q2.takeaway, 'A flu shot is heart protection, too.');
  assert.equal(flagshipQ3.takeaway, q2.takeaway, 'flagship q3 carries the identical live line and takes the same fix');
  assert.equal(polishQ3.takeaway, q2.takeaway, 'flagship-r2 q3 carries the identical live line and takes the same fix');
  assert.notEqual(q2.reveal, undefined);
  assert.equal(q2.reveal, flagshipQ3.reveal, 'the reveal is unchanged by this fix on both decks');
  assert.equal(q2.reveal, polishQ3.reveal, 'the reveal is unchanged by this fix on the polish deck too');
  for (const question of [q2, flagshipQ3, polishQ3]) {
    assert.notEqual(question.takeaway, 'Flu is heart protection, too.', `${question.id} no longer says the infection protects the heart`);
    assert.notEqual(question.takeaway, 'Flu can strain the heart.', `${question.id} does not ship the alternate switch wording`);
  }
});

test('the default provider returns the show deck and keeps flagship selectable', async () => {
  const provider = new OfflineProvider();
  assert.equal(DEFAULT_DECK_ID, 'vax-or-fiction');
  assert.equal((await provider.getDeck('default')).id, 'vax-or-fiction');
  assert.equal((await provider.getDeck('vax-or-fiction')).id, 'vax-or-fiction');
  assert.equal((await provider.getDeck('flagship')).id, 'flagship');
  assert.deepEqual((await provider.getDecks()).map((entry) => entry.id), ['vax-or-fiction', 'flagship']);
  assert.equal(resolveBundledDeck('nope'), null);
  assert.equal(flagshipDeck.questions.length, 20);
});
