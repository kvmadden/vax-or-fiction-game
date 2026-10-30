import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneReveal } from '../../src/phone/PhoneReveal';
import { PhoneVote } from '../../src/phone/PhoneVote';
import { keepCompounds } from '../../src/phone/keep-compounds';
import { describeAnswer } from '../../src/phone/reveal-copy';
import type { PublicQuestion, PublicReveal } from '../../src/network/protocol';

// The answer and result screens room and solo phones share (2026-09-16 batch).
const binary: PublicQuestion = {
  id: 'screens-binary', questionInstanceId: 'run:0:screens-binary', kind: 'binary', statement: 'Synthetic decision', number: 1, total: 1,
  options: [{ token: 'false', label: 'False', text: 'False' }, { token: 'true', label: 'True', text: 'True' }],
};
const estimate: PublicQuestion = {
  id: 'screens-estimate', questionInstanceId: 'run:0:screens-estimate', kind: 'estimate', statement: 'What share of adults got the shot?', number: 1, total: 1, unit: '%',
  options: [{ token: 'a', label: 'Under 35%', text: 'Under 35%', min: 0, max: 34 }, { token: 'b', label: '35–50%', text: '35–50%', min: 35, max: 50 }],
};
const order: PublicQuestion = {
  id: 'screens-order', questionInstanceId: 'run:0:screens-order', kind: 'order', statement: 'Put the steps in order.', number: 1, total: 1, options: [],
  steps: [{ token: 'sa', text: 'Screen.' }, { token: 'sb', text: 'Counsel.' }],
};
const reveal = (answerLabel: string, answerToken: string): PublicReveal => ({ answerLabel, answerToken, explanation: 'Because.', takeaway: 'So.', citations: [] });
const vote = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'binary', questionData: binary, onSubmit: () => {}, ...props }));

test('an estimate result leads with the exact figure and names the range it landed in, once', () => {
  const lines = (label: string) => { const copy = describeAnswer(reveal(label, 'b'), estimate); return { text: copy.text, detail: copy.detail ?? null }; };
  assert.deepEqual(lines('41.9%'), { text: '41.9%', detail: 'In the 35–50% range' });
  assert.deepEqual(lines(''), { text: '35–50%', detail: null }, 'with no figure the range is the headline, not repeated under it');
  assert.deepEqual(lines('35–50%'), { text: '35–50%', detail: null });
});

test('a hyphenated word stays whole where it fits, and a compound wider than its line can still wrap at its hyphens', () => {
  const html = renderToStaticMarkup(React.createElement('p', null, keepCompounds('An out-of-range dose, then COVID-19 again.')));
  assert.equal(html, '<p>An <span class="keep-compound">out-of-range</span> dose, then <span class="keep-compound">COVID-19</span> again.</p>');
  assert.equal(keepCompounds('No compounds here, only words.'), 'No compounds here, only words.');
});

test('a room and solo phone both confirm the answer immediately without conviction controls', () => {
  const room = vote({ initialVote: 'true' });
  assert.match(room, /Your answer is in/);
  assert.doesNotMatch(room, /Now pick how sure you are/);
  assert.doesNotMatch(room, /data-role="confidence-selector"/);
  const solo = vote({ solo: true, initialVote: 'true' });
  assert.match(solo, /Your answer is in/);
  assert.doesNotMatch(solo, /Now pick how sure you are/);
  assert.doesNotMatch(solo, /data-role="confidence-selector"/);
});

test('Change answer sits inside the answer card, without confidence controls', () => {
  // Solo: inside the receipt card.
  const html = vote({ initialVote: 'true', solo: true });
  assert.match(html, /data-role="phone-choice-receipt"[^>]*><span class="phone-choice-receipt__label">Your answer<\/span><strong>True<\/strong><button[^>]*data-action="review-answer-options"[^>]*>Change answer<\/button><\/div>/);
  assert.equal(html.split('data-action="review-answer-options"').length, 2, 'Change answer shows once');
  assert.doesNotMatch(html, /data-role="confidence-selector"/);
  // Room: inside the answer dock, in its open row right under the slab that carries the answer.
  const room = vote({ initialVote: 'true' });
  assert.match(room, /data-role="phone-dock"[^>]*>[\s\S]*data-choice="true"[^>]*data-marked="true"[\s\S]*<\/div><div class="answer-change-slot" data-open="true"><div class="answer-change-slot__inner"><button[^>]*data-action="review-answer-options"[^>]*>Change answer<\/button><\/div><\/div><\/section>/);
  assert.equal(room.split('data-action="review-answer-options"').length, 2, 'Change answer shows once');
  assert.doesNotMatch(room, /data-role="confidence-selector"/);
});

test('an order receipt lists its steps, and says "Your submitted order" when it does not know them', () => {
  const listed = vote({ questionType: 'order', questionData: order, initialVote: 'sb-sa' });
  assert.match(listed, /<ol class="phone-receipt-order"><li>Counsel\.<\/li><li>Screen\.<\/li><\/ol>/);
  const unknown = vote({ questionType: 'order', questionData: { ...order, steps: [] }, initialVote: 'sb-sa' });
  assert.doesNotMatch(unknown, /phone-receipt-order/, 'no empty numbered rows');
  assert.match(unknown, /data-role="phone-choice-receipt"[\s\S]*<strong>Your submitted order<\/strong>/);
});

test('the result line takes its last mark as the verdict, so an answer holding a × keeps its words', () => {
  const doses: PublicQuestion = { ...estimate, id: 'screens-doses', questionInstanceId: 'x', unit: undefined, options: [{ token: 'a', label: 'Once a day', text: 'Once a day', min: 1, max: 1 }, { token: 'b', label: '2 × a day', text: '2 × a day', min: 2, max: 2 }] };
  const attendee = { sessionId: 's', registered: true, nickname: 'Maria', team: null, vote: null, result: { questionInstanceId: 'x', choice: 'b', isCorrect: true, points: 2 }, score: 2, correct: 1, answered: 1, accuracy: 100, bestStreak: 1, rank: null, totalParticipants: 1, commitments: [] };
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal: reveal('2', 'b'), question: doses, attendee }));
  assert.match(html, /<span class="phone-reveal-said__text">You said 2 × a day <span aria-hidden="true">✓<\/span><span class="sr-only">, right<\/span><\/span>/);
  assert.match(html, />\+2 pts<\/span>/);
});
