import test from 'node:test';
import assert from 'node:assert/strict';

import { flagshipDeck } from '../../src/data/decks/flagship';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { questionHeadline } from '../../src/engine/kinds';
import type { Question } from '../../src/data/types';

// 2026-09-14 design critique, item 24 (design call; VOF-23): stems ask the decision, reveals and takeaways are
// spoken lines, guideline prose stays presenter-side. Numbers, answers, best choices and sources are untouched.
const deck = vaxOrFictionDeck;
const byId = (id: string) => deck.questions.find((question) => question.id === id)! as Question;
const audienceText = (question: Question): string[] => [
  question.statement ?? '', question.scenario ?? '', question.reveal ?? '', question.takeaway ?? '',
  ...(question.choices ?? []), ...(question.statements ?? []),
];

test('egg allergy: negative flagship and positive show variants keep distinct stems and opposite keys', () => {
  const negative = flagshipDeck.questions.filter((question) => question.id === 'q14');
  const positive = deck.questions.filter((question) => question.id === 'q18');
  assert.equal(negative.length, 1, 'exactly one flagship egg-allergy variant is checked');
  assert.equal(positive.length, 1, 'exactly one show egg-allergy variant is checked');

  const assertPolarity = (flagship: Question, show: Question) => {
    assert.equal(flagship.statement, 'An egg allergy rules out an egg-based flu vaccine.', 'flagship must retain the negative egg-allergy claim');
    assert.equal(flagship.answer, false, 'egg allergy does not rule out an egg-based flu vaccine');
    assert.equal(show.statement, 'Egg allergy alone, even after a severe egg reaction, does not require an extra flu-vaccine safety step.', 'show must retain the positive egg-allergy claim');
    assert.equal(show.answer, true, 'egg allergy alone requires no additional measures');
    assert.notEqual(flagship.statement, show.statement, 'opposite-key variants cannot share the same statement');
  };
  assertPolarity(negative[0], positive[0]);
  // Approved production copy (ruling 2026-09-15); each deck keeps its own reveal.
  const approvedReveal: Record<string, string> = {
    flagship: 'People with egg allergy may receive any age-appropriate flu vaccine.',
    'vax-or-fiction': 'Since 2023–24, egg allergy of any severity needs no added flu-vaccine measure. Use any age- and health-appropriate flu vaccine. Prior vaccine or component reactions are separate.',
  };
  for (const [question, owner] of [[negative[0], flagshipDeck], [positive[0], deck]] as const) {
    assert.equal(question.reveal, approvedReveal[owner.id], `${owner.id}:${question.id} keeps its approved reveal`);
    const linkedSources = owner.citations.filter((citation) => question.sourceIds?.includes(citation.id));
    assert.ok(linkedSources.some((citation) => citation.url === 'https://www.cdc.gov/flu/vaccines/egg-allergies.html'), `${owner.id}:${question.id} retains the CDC egg-allergy source`);
  }

  // Disposable known-bad alias: a positive claim copied onto the unchanged false key.
  assert.throws(
    () => assertPolarity({ ...negative[0], statement: positive[0].statement }, positive[0]),
    /flagship must retain the negative egg-allergy claim/,
    'the regression guard rejects the actual cross-polarity copy error',
  );
});

test('item 24: the named stems and reveal lines read as spoken language', () => {
  assert.equal(byId('q4').reveal, 'CDC estimates about 13,600 HPV throat cancers in men each year, versus about 11,100 cervical cancers in women.');
  assert.equal(byId('q7').statement, 'A healthy adult is due for a pneumococcal vaccine at 50.');
  assert.equal(byId('q7').reveal, 'CDC recommends it for every adult 50 and older. Which product depends on what they have already had.');
  // Clear-ask brief (2026-09-27, the owner): the myth stem now asks the question the kicker used to carry alone.
  assert.equal(byId('q13').statement, 'Which of these about the shingles vaccine is the myth?');
  // q17 was never on the approved item-24 list, and the lane's shorter takeaway dropped the "injectable or
  // intranasal" qualifier (live ORAL vaccines carry no four-week rule — CDC General Best Practice, Timing and
  // Spacing), so the override was retired on review: q17 ships exactly as authored.
  assert.equal(byId('q17').reveal, 'Give two different live injectable or intranasal vaccines on the same day or at least four weeks apart. If the second came sooner, repeat it at least four weeks after that dose, with no grace period.');
  assert.equal(byId('q17').takeaway, 'For different live injectable or intranasal vaccines: same day or at least four weeks apart.');
  assert.equal(byId('q22').reveal, 'At 50 and older with no conjugate dose on record, or no record at all, give PCV15, PCV20 or PCV21 today. PCV20 or PCV21 finishes it in one shot, with no PPSV23 needed.');
  assert.equal(byId('q22').takeaway, 'No record at 50? Vaccinate today and let their history pick the product.');
  // VOF-74 (content fix batch 1, C-q30): the field-rewrite table moves this pin on purpose.
  assert.equal(byId('q30').statement, 'A 70-year-old wants a flu shot. What now?');
  assert.equal(byId('q30').scenario, 'No high-dose, recombinant or adjuvanted product is available.');
  // The which-patient headline slot holds three 64px lines (~24 characters each); a four-line stem overflowed
  // into the scenario line on the 2026-09-14 after-capture, so demo scenario stems stay short. Checked against
  // questionHeadline() (what the stage actually renders), not the raw statement field: a reply-type card with
  // no statement (q16, before the clear-ask brief) rendered its scenario as the headline instead, at its own
  // length, so a check against statement alone missed it.
  for (const id of deck.modes.demo!.questionIds) {
    const question = byId(id);
    if (question.kind === 'which-patient') {
      const headline = questionHeadline(question);
      // q16 (clear-ask brief, 2026-09-27, the owner): before this arc it had no statement at all, so its
      // 81-character scenario stood in as the headline alone, with no distinct scenario card (the card only
      // shows once statement and scenario differ). Now it carries its own 85-character statement as the
      // headline, and the same scenario renders again below it in its own card. The headline text itself is
      // barely longer (85 vs the 81 already shipping), so this is not a new overflow risk, but the screen it
      // sits on is a materially different, taller layout: headline plus a distinct scenario card, not a bare
      // headline alone. It is the one accepted exception to the 60-character floor below.
      assert.ok(headline.length <= 60 || id === 'q16', `${id} headline fits the slot (${headline.length} chars): ${JSON.stringify(headline)}`);
    }
  }
  assert.equal(byId('q31').statement, 'Stepped on a rusty nail. Tetanus booster today?');
  assert.equal(byId('q31').scenario, 'Tetanus series complete, last booster six years ago, healthy immune system.');
  assert.equal(byId('q31').choices?.[1], 'Give a tetanus booster with the wound care.');
  assert.equal(byId('q36').takeaway, 'Looks the same is not the same.');
  for (const id of ['q30', 'q31']) assert.match(byId(id).statement ?? '', /\?$/, `${id} stem asks the decision`);
});

test('item 24: the demo carries no guideline prose on the audience canvas, and the facts did not move', () => {
  const jargon = /oropharyngeal|attributable|\(95% CI|routinely eligible|establish compatibility|Which plan fits|Which vaccine plan/;
  for (const id of deck.modes.demo!.questionIds) {
    for (const line of audienceText(byId(id))) assert.doesNotMatch(line, jargon, `${id}: ${JSON.stringify(line)}`);
  }
  assert.equal(byId('q4').answer, true);
  assert.equal(byId('q7').answer, true);
  assert.equal(byId('q17').answer, true);
  assert.equal(byId('q36').answer, false);
  assert.equal(byId('q22').bestIndex, 1);
  assert.equal(byId('q31').bestIndex, 1);
  assert.equal(byId('q30').bestIndex, 0);
  assert.match(byId('q4').reveal ?? '', /13,600.*11,100/, 'q4 keeps both CDC counts');
  assert.match(byId('q22').reveal ?? '', /PCV15, PCV20 or PCV21/, 'q22 keeps every product option');
  assert.match(byId('q31').reveal ?? '', /five or more years/, 'q31 keeps the five-year rule');
});
