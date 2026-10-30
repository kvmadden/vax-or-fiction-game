import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { BUNDLED_DECKS } from '../../src/data/decks';
import { SOLO_DECKS } from '../../src/data/decks/topics';
import { asksForReply, kindEyebrow, phoneScenarioLabel, questionKind, stageKindKicker, stageScenarioLabel } from '../../src/engine/kinds';
import { WhichPatientQuestion } from '../../src/screens/questions/WhichPatientQuestion';
import { Question as QuestionScreen } from '../../src/screens/Question';
import { projectPublicQuestion } from '../../src/network/projection';
import type { Question } from '../../src/data/types';

// 2026-09-14 design critique, item 16 (design call): best-choice scenarios are one spoken line under the
// question, never a lone "No contraindications." helper, never a chart note, never a seasonal cue the room does
// not share (VOF-32), and the reply cards quote a line only when the question asks for a reply.
const deck = vaxOrFictionDeck;
const byId = (id: string) => deck.questions.find((question) => question.id === id)! as Question;
const demoScenarios = deck.modes.demo!.questionIds.map(byId).filter((question) => questionKind(question) === 'which-patient');

test('spoken reply choices receive one pair of quotes, including already quoted copy', () => {
  const question: Question = {
    id: 'quoted-reply-test', kind: 'which-patient', statement: 'Which reply is better?',
    scenario: 'A patient asks about a vaccine.',
    choices: ['“What did you hear?”', 'Let’s discuss your concern.', '“We can check that together.”'],
    bestIndex: 0, reveal: 'Invite the concern before responding.',
  };
  const html = renderToStaticMarkup(React.createElement(WhichPatientQuestion, { question }));
  const labels = [...html.matchAll(/<p class="answer-bar__label"[^>]*>(.*?)<\/p>/g)].map(match => match[1]);
  // STAGE-SPEC pass 4c-1: the widow guard now decides whether to join a label's last two words
  // from a real measurement of how it actually wraps (widow-guard.ts), which never runs in a
  // DOM-free SSR render, so these labels render plain and unmodified here.
  assert.deepEqual(labels, ['“What did you hear?”', '“Let’s discuss your concern.”', '“We can check that together.”']);
});
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('item 16: every demo scenario is a short spoken line, not filler or a chart note', () => {
  assert.ok(demoScenarios.length >= 4, 'the demo carries best-choice scenarios');
  for (const question of demoScenarios) {
    const scenario = question.scenario ?? '';
    assert.ok(scenario.trim(), `${question.id} retains its required scenario`);
    assert.notEqual(scenario, 'No contraindications.', `${question.id} does not float a lone helper line`);
    assert.doesNotMatch(scenario, /Hypothetical|October|Ohio/, `${question.id} carries no hypothetical prefix or seasonal cue (VOF-31, VOF-32)`);
    assert.ok(scenario.length <= 110, `${question.id} scenario is one spoken line (${scenario.length} chars)`);
    assert.ok((scenario.match(/[.!?](\s|$)/g) ?? []).length <= 2, `${question.id} scenario is at most two sentences`);
    assert.doesNotMatch(scenario, /;.*;.*;/, `${question.id} scenario is not a semicolon chart note`);
  }
  assert.equal(byId('q21').scenario, 'Four adults at the counter, none with a reason to hold off.');
  assert.equal(byId('q29').scenario, 'Four kids in for flu shots, none with a reason to hold off.');
  assert.equal(byId('q22').scenario, 'A routine visit. You\'re checking what each adult is due for.');
  for (const id of ['q21', 'q29']) {
    assert.match(byId(id).presenterNote ?? '', /No contraindications/, `${id} keeps the contraindication note presenter-side`);
  }
  assert.doesNotMatch(byId('q30').scenario ?? '', /October/, 'q30 loses the October cue (VOF-32)');
  assert.match(byId('q30').scenario ?? '', /70-year-old|high-dose/, 'q30 keeps the clinical facts on the canvas');
  assert.match(byId('q31').scenario ?? '', /six years ago/, 'q31 keeps the booster timing');
  assert.match(byId('q31').presenterNote ?? '', /no HIV or severe immune deficiency/, 'q31 keeps the immune-status detail presenter-side');
});

test('item 16: reply cards quote a spoken reply and leave patient vignettes unquoted', () => {
  const vignette = byId('q21');
  const reply = byId('q16');
  assert.equal(asksForReply(vignette), false);
  assert.equal(asksForReply(reply), true);
  const vignetteHtml = text(renderToStaticMarkup(React.createElement(WhichPatientQuestion, { question: vignette })));
  const replyHtml = text(renderToStaticMarkup(React.createElement(WhichPatientQuestion, { question: reply })));
  for (const choice of vignette.choices ?? []) {
    assert.ok(vignetteHtml.includes(choice), `${vignette.id} renders ${JSON.stringify(choice)}`);
    assert.ok(!vignetteHtml.includes(`“${choice}”`), `${vignette.id} does not wrap a vignette in quotes`);
  }
  for (const choice of reply.choices ?? []) {
    assert.ok(replyHtml.includes(`“${choice}”`), `${reply.id} keeps quotes on a spoken reply`);
  }
});

// the design call 2026-09-15: the result screen quotes a spoken reply the way the answer cards do.
test('the result screen quotes a spoken reply once and leaves a patient vignette unquoted', () => {
  const verdict = (question: Question) => {
    const html = renderToStaticMarkup(React.createElement(QuestionScreen, { question, phase: 'revealed', autoDeliberateDelayMs: 0 }));
    const raw = html.match(/data-role="canonical-verdict"[^>]*>(.*?)<\/h1>/)?.[1];
    assert.ok(raw !== undefined, `${question.id} result renders its answer, so the checks below are not vacuous`);
    return text(raw).trim();
  };
  const spoken: Question = {
    id: 'quoted-result-test', kind: 'which-patient', statement: 'Which reply is better?',
    choices: ['Let’s discuss your concern.', 'Another reply.'], bestIndex: 0, reveal: 'Invite the concern.',
  };
  assert.equal(verdict(spoken), '“Let’s discuss your concern.”', 'an unquoted spoken reply gains one pair of quotes');
  assert.equal(verdict({ ...spoken, choices: ['“What did you hear?”', 'Another reply.'] }), '“What did you hear?”', 'already quoted copy is not quoted twice');
  const vignette = byId('q21');
  assert.equal(verdict(vignette), vignette.choices![vignette.bestIndex!], `${vignette.id} leaves a patient vignette unquoted`);
  const reply = byId('q16');
  assert.equal(verdict(reply), `“${reply.choices![reply.bestIndex!]}”`, `${reply.id} quotes its spoken reply on the result screen`);
});

test('scenario kinds label the task on stage without a presenter note', () => {
  const posed = (question: Question) =>
    text(renderToStaticMarkup(React.createElement(QuestionScreen, { question, phase: 'deliberating', autoDeliberateDelayMs: 0 })));

  const patient = posed(byId('q31'));
  assert.match(patient, /Patient scenario/);
  assert.match(patient, /Stepped on a rusty nail/);
  assert.match(patient, /six years ago/);
  assert.match(patient, /Scenario/);

  const reply = posed(byId('q16'));
  assert.match(reply, /Which reply is better/);
  assert.match(reply, /Patient says/);
  assert.match(reply, /I had shingles last year/);

  const myth = posed(byId('q25'));
  assert.match(myth, /Pick the myth/);

  const order = posed(byId('q15'));
  assert.match(order, /Put in order/);
});

test('phone kickers match the stage task for curated scenario kinds, including q16 without a reply flag', () => {
  const phoneKicker = (id: string) => {
    const source = byId(id);
    const { question } = projectPublicQuestion(source, `run:0:${id}`, 1, 15);
    return kindEyebrow(question);
  };
  assert.equal(stageKindKicker(byId('q31')), 'Patient scenario');
  assert.equal(phoneKicker('q31'), 'PATIENT SCENARIO');
  assert.equal(stageKindKicker(byId('q16')), 'Which reply is better');
  assert.equal(phoneKicker('q16'), 'WHICH REPLY IS BETTER?');
  assert.equal(phoneKicker('q25'), 'PICK THE MYTH');
  assert.equal(phoneKicker('q15'), 'PUT IN ORDER');
});

// Review finding (2026-09-27): PublicQuestion carries no `scenario` field and the room wire never sets
// `reply` (src/network/protocol.ts), so a room-hosted which-patient question's phone-side asksForReply()
// read depends entirely on statement/scenario text surviving the merge in projectPublicQuestion. This
// sweeps every which-patient question in both room-servable decks and proves the projected read still
// agrees with the source read, so a stem rewrite can never silently flip which instruction line or kicker
// a room player sees.
test('asksForReply agrees between the source question and its room projection, for every which-patient question in the room decks', () => {
  let checked = 0;
  for (const roomDeck of BUNDLED_DECKS) {
    for (const source of roomDeck.questions) {
      if (questionKind(source) !== 'which-patient') continue;
      const { question: projected } = projectPublicQuestion(source, `parity:${roomDeck.id}:${source.id}`, 1, roomDeck.questions.length);
      assert.equal(
        asksForReply(projected),
        asksForReply(source),
        `${roomDeck.id} ${source.id}: asksForReply(projected)=${asksForReply(projected)} but asksForReply(source)=${asksForReply(source)}`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'the sweep must actually see which-patient questions in the room decks');
});

// Review finding (2026-09-27): the phone derives "Patient says" vs "Scenario" from the scenario text
// itself (phoneScenarioLabel), since the room wire carries no scenarioVoice field, while the stage reads
// the authored scenarioVoice field directly (stageScenarioLabel). Those are two different derivations
// that happen to agree today, and this sweep is what proves it, for every which-patient question in every
// deck, not just the 27 the clear-ask brief touched.
test('the phone-derived scenario label agrees with the stage-authored one, for every which-patient question in every deck', async () => {
  const soloDecks = await Promise.all(Object.values(SOLO_DECKS).map((load) => load()));
  const allDecks = [...BUNDLED_DECKS, ...soloDecks];
  let checked = 0;
  for (const deck of allDecks) {
    for (const source of deck.questions) {
      if (questionKind(source) !== 'which-patient') continue;
      const { question: projected } = projectPublicQuestion(source, `label-parity:${deck.id}:${source.id}`, 1, deck.questions.length);
      const [, ...scenarioParts] = projected.statement.split('\n\n');
      const scenarioText = scenarioParts.join('\n\n').trim();
      const phoneLabel = phoneScenarioLabel(asksForReply(projected), scenarioText);
      const stageLabel = stageScenarioLabel(source);
      assert.equal(phoneLabel, stageLabel, `${deck.id} ${source.id}: phone says "${phoneLabel}" but stage says "${stageLabel}"`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'the sweep must actually see which-patient questions across the decks');
});
