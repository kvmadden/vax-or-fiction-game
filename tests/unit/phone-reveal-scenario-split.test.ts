import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Question } from '../../src/data/types';
import { projectPublicQuestion, projectPublicReveal } from '../../src/network/projection';
import { PhoneReveal } from '../../src/phone/PhoneReveal';

// Review finding (clear-ask arc, 2026-09-28): PhoneVote's question screen already splits the
// merged "statement\n\nscenario" wire string into two elements. PhoneReveal did not, so a
// which-patient reveal rendered both in one <p>, at 36px bold on desktop (solo.css), reading as one
// long run-on paragraph instead of a question followed by its labeled scenario.
const withScenario: Question = {
  id: 'reveal-scenario-split-test', kind: 'which-patient', reply: true,
  statement: "A patient is due for two vaccines today. What's the better way to offer both?",
  scenario: 'A 66-year-old arrives for an annual flu vaccine. The clinic record indicates pneumococcal conjugate vaccination is also indicated today.',
  choices: ['Did you also want to think about getting a pneumococcal shot today?', 'You are due for flu and pneumococcal today. We will do both now.'],
  bestIndex: 1, reveal: 'Presumptive recommendations outperform open-ended offers.', takeaway: 'Presumptive bundling increases same-visit acceptance.',
};

function renderSoloReveal(source: Question): string {
  const { question } = projectPublicQuestion(source, 'instance-1', 1, 8);
  const reveal = projectPublicReveal(source);
  return renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'combined', question, reveal, attendee: null, solo: true }));
}

test('the solo reveal renders the question and its scenario as two elements, not one merged paragraph', () => {
  const html = renderSoloReveal(withScenario);
  const stem = html.match(/data-role="solo-reveal-stem"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const scenario = html.match(/data-role="phone-question-scenario"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(stem, 'the reveal renders the question stem');
  assert.ok(scenario, 'the reveal renders a separate scenario element');
  assert.doesNotMatch(stem!, /clinic record/, 'the stem element does not also carry the scenario text');
  assert.match(scenario!, /clinic record/, 'the scenario element carries the scenario text');
  assert.match(scenario!, /data-role="phone-scenario-label"[^>]*>Scenario</, 'the scenario carries its own label');
});

test('a which-patient reveal with no scenario renders only the stem, no empty scenario element', () => {
  const noScenario: Question = { ...withScenario, scenario: undefined };
  const html = renderSoloReveal(noScenario);
  assert.match(html, /data-role="solo-reveal-stem"/);
  assert.doesNotMatch(html, /data-role="phone-question-scenario"/, 'no scenario means no scenario element, not an empty one');
});

test('the reveal scenario label agrees with the vote screen scenario label for the same question', async () => {
  const { PhoneVote } = await import('../../src/phone/PhoneVote');
  const { question } = projectPublicQuestion(withScenario, 'instance-2', 1, 8);
  const voteHtml = renderToStaticMarkup(React.createElement(PhoneVote, {
    questionData: question, disabled: false, acceptedChoice: null, visibleChoice: null, pendingChoice: null,
    locked: false, onChoose: () => {},
  } as never));
  const revealHtml = renderSoloReveal(withScenario);
  const voteLabel = voteHtml.match(/data-role="phone-scenario-label"[^>]*>([\s\S]*?)<\/span>/)?.[1];
  const revealLabel = revealHtml.match(/data-role="phone-scenario-label"[^>]*>([\s\S]*?)<\/span>/)?.[1];
  assert.equal(revealLabel, voteLabel, 'the reveal and the vote screen agree on the scenario label for the same question');
});
